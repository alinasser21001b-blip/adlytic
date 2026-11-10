// ═════════════════════════════════════════════════════════════════════════
//  test_recommendation_write_auth.ts — CI-SAFE (no database, no Redis, no
//  secrets). Pins the shape of "role and ownership are enforced BEFORE any
//  recommendation write or refresh" so a later edit cannot quietly undo it:
//
//    1. the request-body parser (pure): what is malformed, what is normalised;
//    2. the services, against a fake Prisma that records every call: a foreign
//       campaign / log / recommendation / ad account is refused and NOTHING else
//       is touched — not even a read of another table;
//    3. the routes in src/api/server.ts, statically: the guard ORDER, and that
//       every call site of a recommendation writer sits behind a role gate;
//    4. the AI agent's save_recommendation tool refuses a viewer;
//    5. the pages that call the endpoints tell a viewer why they were refused.
//
//  The behaviour against a real database, with two tenants, is
//  test_recommendation_write_auth_postgres.ts (not CI: it needs Postgres).
//
//  Run: npx tsx test_recommendation_write_auth.ts      (also in `npm run test:all`)
// ═════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import {
  LIMITS, WorkspaceOwnershipError, assertAdAccountInWorkspace, assertCampaignInWorkspace,
  parseLogActionBody, parseRecommendationActionBody,
} from './src/services/recommendationWriteGuard';
import { RecommendationService } from './src/services/recommendation.service';
import { ExecutionService } from './src/services/execution.service';
import { runRefresh } from './src/services/refresh/refreshEngine';
import { saveRecommendationHandler } from './src/services/agent/tools/saveRecommendation';
import { bearerTokenFrom } from './src/api/adapter';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${got === undefined ? '' : ` — got: ${JSON.stringify(got)}`}`); }
}
async function rejectsWithOwnership(fn: () => Promise<unknown>): Promise<{ refused: boolean; name?: string }> {
  try { await fn(); return { refused: false }; } catch (e) { return { refused: e instanceof WorkspaceOwnershipError, name: (e as Error)?.name }; }
}

/** A Prisma stand-in that records every call and fails loudly on anything it was not told to answer. */
function fakePrisma(answers: Record<string, (args: any) => unknown>) {
  const calls: string[] = [];
  const argsOf: Record<string, any[]> = {};
  const client = new Proxy({}, {
    get(_t, model: string) {
      if (model === 'then') return undefined;
      return new Proxy({}, {
        get(_m, method: string) {
          return async (args: any) => {
            const key = `${model}.${method}`;
            calls.push(key);
            (argsOf[key] ??= []).push(args);
            const answer = answers[key];
            if (!answer) throw new Error(`UNEXPECTED prisma call: ${key}`);
            return answer(args);
          };
        },
      });
    },
  }) as any;
  return { client, calls, argsOf };
}

const src = (p: string) => readFileSync(p, 'utf8');
const SERVER = src('src/api/server.ts');
const routeStart = (method: string, path: string): number => SERVER.indexOf(`app.${method}('${path}'`);
function routeBody(method: string, path: string): string {
  const at = routeStart(method, path);
  if (at < 0) return '';
  const next = SERVER.slice(at + 10).search(/\n {2}app\.(get|post|put|patch|delete)\(/);
  return SERVER.slice(at, next < 0 ? undefined : at + 10 + next);
}
/** True when every needle appears, in the given order, in `text`. */
function inOrder(text: string, needles: Array<string | RegExp>): { ok: boolean; at: number[] } {
  const at: number[] = []; let from = 0;
  for (const n of needles) {
    const m = typeof n === 'string' ? { index: text.indexOf(n, from), len: n.length } : (() => { const r = n.exec(text.slice(from)); return r ? { index: from + r.index, len: r[0].length } : { index: -1, len: 0 }; })();
    if (m.index < 0) return { ok: false, at };
    at.push(m.index); from = m.index + m.len;
  }
  return { ok: true, at };
}

async function main() {
  // ── 1. request-body parser ────────────────────────────────────────────
  console.log('\n── 1. parseRecommendationActionBody / parseLogActionBody ──');
  const good = { action: 'EXECUTED', itemKey: 'priority:INCREASE_BUDGET', itemKind: 'priority', actionCode: 'INCREASE_BUDGET', campaignId: 'cmabc123', feedKey: null, title: 'Increase budget' };
  const p0 = parseRecommendationActionBody(good);
  check('a well-formed body parses and keeps every field', p0.ok && p0.value.action === 'EXECUTED' && p0.value.itemKey === good.itemKey && p0.value.campaignId === 'cmabc123' && p0.value.actionCode === 'INCREASE_BUDGET' && p0.value.feedKey === null, p0);
  const p1 = parseRecommendationActionBody({ action: 'IGNORED', itemKey: 'k' });
  check('optional fields may be absent: they come back as null (never undefined — Prisma would read undefined as "no filter")', p1.ok && p1.value.campaignId === null && p1.value.adAccountId === null && p1.value.actionCode === null && p1.value.itemKind === null && p1.value.title === null, p1);
  const p2 = parseRecommendationActionBody({ action: 'IGNORED', itemKey: 'k', campaignId: '', actionCode: '', adAccountId: null });
  check('"" and null both mean "not supplied"', p2.ok && p2.value.campaignId === null && p2.value.actionCode === null && p2.value.adAccountId === null, p2);
  const bad: Array<[string, unknown]> = [
    ['null', null], ['undefined', undefined], ['an array', [good]], ['a string', 'EXECUTED'], ['a number', 7],
    ['action missing', { itemKey: 'k' }], ['action lower-case', { ...good, action: 'executed' }], ['action an object', { ...good, action: { not: 'x' } }],
    ['itemKey missing', { action: 'EXECUTED' }], ['itemKey empty', { ...good, itemKey: '' }], ['itemKey a number', { ...good, itemKey: 1 }],
    [`itemKey over ${LIMITS.itemKey}`, { ...good, itemKey: 'k'.repeat(LIMITS.itemKey + 1) }], ['itemKey with NUL', { ...good, itemKey: 'a\u0000b' }],
    ['campaignId a number', { ...good, campaignId: 5 }], ['campaignId an object (a Prisma filter)', { ...good, campaignId: { in: ['x'] } }], ['campaignId an array', { ...good, campaignId: ['x'] }],
    ['campaignId with a space', { ...good, campaignId: 'a b' }], ['campaignId with a quote', { ...good, campaignId: "a'b" }], ['campaignId with NUL', { ...good, campaignId: 'a\u0000' }],
    [`campaignId over ${LIMITS.id}`, { ...good, campaignId: 'c'.repeat(LIMITS.id + 1) }],
    ['adAccountId an object', { ...good, adAccountId: { in: ['x'] } }], ['adAccountId with a slash', { ...good, adAccountId: 'a/b' }],
    ['actionCode an object', { ...good, actionCode: { contains: '' } }], ['actionCode an array', { ...good, actionCode: ['A'] }], [`actionCode over ${LIMITS.actionCode}`, { ...good, actionCode: 'A'.repeat(LIMITS.actionCode + 1) }],
    ['itemKind an object', { ...good, itemKind: { x: 1 } }], ['feedKey a number', { ...good, feedKey: 7 }], [`title over ${LIMITS.title}`, { ...good, title: 't'.repeat(LIMITS.title + 1) }], ['title with NUL', { ...good, title: 'a\u0000' }],
    // a LONE surrogate is valid JSON ("\ud800") but unstorable: it used to pass the guards, fail at the INSERT (500)
    // after recordExecution had already written (review finding authz-F3)
    ['itemKey with a lone high surrogate', { ...good, itemKey: 'a\uD800b' }], ['itemKey with a lone low surrogate', { ...good, itemKey: 'a\uDC00b' }],
    ['itemKind with a lone surrogate', { ...good, itemKind: 'x\uD800' }], ['feedKey with a lone surrogate', { ...good, feedKey: '\uDFFF' }],
    ['title with a lone surrogate', { ...good, title: 't\uD83D' }], ['actionCode with a lone surrogate', { ...good, actionCode: 'A\uD800' }],
  ];
  const pAstral = parseRecommendationActionBody({ ...good, title: 'حملة 🚀 ناجحة', itemKey: 'priority:\u{1F680}' });
  check('a well-formed surrogate PAIR (an emoji) is still accepted — only a lone half is refused', pAstral.ok && pAstral.value.title === 'حملة 🚀 ناجحة', pAstral);
  const accepted = bad.filter(([, b]) => parseRecommendationActionBody(b).ok).map(([n]) => n);
  check(`${bad.length} malformed bodies are all refused`, accepted.length === 0, accepted);
  const lp = parseLogActionBody({ action: 'IGNORED' });
  check('parseLogActionBody accepts EXECUTED/IGNORED and refuses everything else', lp.ok && ['null', '[]', '{}', '{"action":"x"}', '{"action":{"a":1}}', '"EXECUTED"'].every((raw) => !parseLogActionBody(JSON.parse(raw)).ok) && parseLogActionBody({ action: 'EXECUTED' }).ok);

  // ── 1b. one Authorization parser for the gate and the handlers ───────
  console.log('\n── 1b. the active-user gate and the handlers parse "Authorization" with ONE function ──');
  for (const [name, hdr, want] of [
    ['one space', 'Bearer tok', 'tok'], ['two spaces', 'Bearer  tok', 'tok'], ['three spaces', 'Bearer   tok', 'tok'], ['space then tab', 'Bearer \ttok', 'tok'],
    ['trailing space', 'Bearer tok ', 'tok'], ['lower-case scheme', 'bearer tok', null], ['no scheme', 'tok', null], ['scheme only', 'Bearer ', null],
    ['scheme and blanks only', 'Bearer    ', null], ['Basic', 'Basic dG9r', null], ['empty', '', null], ['undefined', undefined, null],
  ] as Array<[string, string | undefined, string | null]>) {
    check(`bearerTokenFrom(${name}) → ${JSON.stringify(want)}`, bearerTokenFrom(hdr) === want, bearerTokenFrom(hdr));
  }
  {
    const server = src('src/api/server.ts');
    const adapter = src('src/api/adapter.ts');
    const gateEnd = server.indexOf('const gate = await requireActiveUser(prisma, userId);');
    const gate = server.slice(Math.max(0, gateEnd - 900), gateEnd);
    check('the global active-user gate takes its token from bearerTokenFrom (never from its own slice/trim)', gateEnd > 0 && /bearerTokenFrom\(/.test(gate) && !/\.slice\(7\)/.test(gate), gate.slice(-400));
    check('…and so does the request adapter the handlers use', /bearerTokenFrom\(c\.req\.header\('authorization'\)\)/.test(adapter));
  }

  // ── 2. services, against a recording fake ────────────────────────────
  console.log('\n── 2. the services refuse a foreign id on their own, and touch nothing else ──');
  {
    const f = fakePrisma({ 'campaign.findFirst': () => null });
    const r = await rejectsWithOwnership(() => assertCampaignInWorkspace(f.client, 'ws_A', 'camp_of_B'));
    check('assertCampaignInWorkspace: a campaign the workspace does not own → WorkspaceOwnershipError', r.refused, r);
    check('…the query is scoped through the ad account to the stated workspace', JSON.stringify(f.argsOf['campaign.findFirst']![0].where) === JSON.stringify({ id: 'camp_of_B', adAccount: { workspaceId: 'ws_A' } }), f.argsOf['campaign.findFirst']?.[0]);
  }
  {
    // Prisma reads `{ id: undefined }` as "no filter": an unusable id must be refused BEFORE it reaches a where
    for (const [ws, id] of [['ws_A', undefined], ['ws_A', ''], ['ws_A', null], ['ws_A', 123], [undefined, 'c1'], ['', 'c1'], [null, 'c1']] as Array<[any, any]>) {
      const f = fakePrisma({ 'campaign.findFirst': () => ({ id: 'whatever' }), 'adAccount.findFirst': () => ({ id: 'whatever' }) });
      const a = await rejectsWithOwnership(() => assertCampaignInWorkspace(f.client, ws, id));
      const b = await rejectsWithOwnership(() => assertAdAccountInWorkspace(f.client, ws, id));
      check(`an unusable id (${JSON.stringify(ws)}, ${JSON.stringify(id)}) is refused without querying (a permissive fake would have said yes)`, a.refused && b.refused && f.calls.length === 0, f.calls);
    }
  }
  {
    const f = fakePrisma({ 'campaign.findFirst': () => null, 'recommendationLog.create': () => ({ id: 'log1' }) });
    const svc = new RecommendationService(f.client);
    const r = await rejectsWithOwnership(() => svc.recordDashboardAction({ workspaceId: 'ws_A', action: 'IGNORED', itemKey: 'k', campaignId: 'camp_of_B' }));
    check('recordDashboardAction(foreign campaign) → refused; recommendationLog.create is never reached', r.refused && !f.calls.includes('recommendationLog.create'), f.calls);
    const g = fakePrisma({ 'campaign.findFirst': () => ({ id: 'c1' }), 'recommendationLog.create': (a) => ({ id: 'log1', ...a.data }) });
    const ok = await new RecommendationService(g.client).recordDashboardAction({ workspaceId: 'ws_A', action: 'EXECUTED', itemKey: 'k', campaignId: 'c1', itemKind: 'priority' });
    check('recordDashboardAction(own campaign) writes one log row stamped with the stated workspace', g.calls.join() === 'campaign.findFirst,recommendationLog.create' && (ok as any).workspaceId === 'ws_A' && (ok as any).campaignId === 'c1' && g.argsOf['recommendationLog.create']![0].data.metricsSnapshot.itemKind === 'priority', g.calls);
    const h = fakePrisma({ 'recommendationLog.create': (a) => ({ id: 'log2', ...a.data }) });
    await new RecommendationService(h.client).recordDashboardAction({ workspaceId: 'ws_A', action: 'IGNORED', itemKey: 'k', campaignId: null });
    check('recordDashboardAction(no campaign) needs no ownership lookup', h.calls.join() === 'recommendationLog.create', h.calls);
  }
  {
    const f = fakePrisma({ 'recommendationLog.update': () => { throw new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }); } });
    const svc = new RecommendationService(f.client);
    const r = await rejectsWithOwnership(() => svc.trackUserAction('log_of_B', 'EXECUTED', 'ws_A'));
    check('trackUserAction(foreign log) → refused (the scoped update matched no row)', r.refused, r);
    check('…the single UPDATE is scoped by id AND workspace_id', JSON.stringify(f.argsOf['recommendationLog.update']![0].where) === JSON.stringify({ id: 'log_of_B', workspaceId: 'ws_A' }), f.argsOf['recommendationLog.update']?.[0]?.where);
    const g = fakePrisma({ 'recommendationLog.update': () => ({}) });
    const r2 = await rejectsWithOwnership(() => new RecommendationService(g.client).trackUserAction('log1', 'EXECUTED', undefined as unknown as string));
    check('trackUserAction without a usable workspace id is refused before any query', r2.refused && g.calls.length === 0, g.calls);
    const h = fakePrisma({ 'recommendationLog.update': () => { throw new Error('connection reset'); } });
    let other = ''; try { await new RecommendationService(h.client).trackUserAction('log1', 'IGNORED', 'ws_A'); } catch (e) { other = (e as Error).message; }
    check('a non-ownership database error is NOT disguised as "not found"', other === 'connection reset', other);
  }
  {
    const rec = { entityId: 'acct_B' };
    const f = fakePrisma({ 'recommendation.findUnique': () => rec, 'adAccount.findUnique': () => ({ workspaceId: 'ws_B' }), 'recommendationExecution.upsert': () => ({}) });
    const svc = new ExecutionService(f.client);
    const r = await rejectsWithOwnership(() => svc.recordExecution('rec_of_B', {}, 'ws_A'));
    check('recordExecution(a recommendation of another workspace) → refused; the upsert is never reached', r.refused && !f.calls.includes('recommendationExecution.upsert'), f.calls);
    const g = fakePrisma({ 'recommendation.findUnique': () => null, 'recommendationExecution.upsert': () => ({}) });
    const r2 = await rejectsWithOwnership(() => new ExecutionService(g.client).recordExecution('rec_nowhere', {}, 'ws_A'));
    check('recordExecution(unknown recommendation) → the same refusal', r2.refused && !g.calls.includes('recommendationExecution.upsert'), g.calls);
    const h = fakePrisma({ 'recommendation.findUnique': () => ({ entityId: 'acct_A' }), 'adAccount.findUnique': () => ({ workspaceId: 'ws_A' }), 'recommendationExecution.upsert': (a) => a });
    const ok: any = await new ExecutionService(h.client).recordExecution('rec_A', { ctr: 1 }, 'ws_A');
    check('recordExecution(own recommendation) upserts once, stamped with the stated workspace', h.calls.filter((c) => c === 'recommendationExecution.upsert').length === 1 && ok.create.workspaceId === 'ws_A', h.calls);
    const r3 = await rejectsWithOwnership(() => new ExecutionService(h.client).recordExecution('rec_A', {}, ''));
    check('recordExecution without a workspace id is refused', r3.refused);
  }
  {
    for (const type of ['RecommendationExecuted', 'RecommendationDismissed'] as const) {
      const f = fakePrisma({ 'adAccount.findFirst': () => null });
      const r = await rejectsWithOwnership(() => runRefresh(f.client, null, { type, adAccountId: 'acct_of_B', workspaceId: 'ws_A', itemKey: 'k' }));
      check(`runRefresh(${type}, an ad account of another workspace) → refused, and the ONLY thing touched is the ownership lookup (no engine, no refresh_logs, no refresh_states)`, r.refused && f.calls.join() === 'adAccount.findFirst', f.calls);
      check('…scoped to the stated workspace', JSON.stringify(f.argsOf['adAccount.findFirst']![0].where) === JSON.stringify({ id: 'acct_of_B', workspaceId: 'ws_A' }), f.argsOf['adAccount.findFirst']?.[0]?.where);
    }
    const g = fakePrisma({ 'adAccount.findFirst': () => ({ id: 'x' }) });
    const r2 = await rejectsWithOwnership(() => runRefresh(g.client, null, { type: 'RecommendationExecuted', adAccountId: '', workspaceId: 'ws_A', itemKey: 'k' }));
    check('runRefresh with an empty ad account id is refused without a query', r2.refused && g.calls.length === 0, g.calls);
    // the system-originated event carries no workspace and is unchanged (sync worker / scheduler)
    const h = fakePrisma({ 'refreshState.upsert': () => ({}), 'refreshLog.create': () => ({ id: 'plan1' }) });
    const log = console.log; console.log = () => {};
    const noop: any = await runRefresh(h.client, null, { type: 'MetaSyncCompleted', adAccountId: 'acct_A', changedRows: 0, campaignChanges: [] }).finally(() => { console.log = log; });
    check('runRefresh(MetaSyncCompleted) is system-originated: no ownership lookup, behaves as before', !h.calls.includes('adAccount.findFirst') && noop.planId === 'plan1', h.calls);
  }

  // ── 3. the routes, statically ────────────────────────────────────────
  console.log('\n── 3. src/api/server.ts: guard order, and every writer sits behind a role gate ──');
  const ACTION = routeBody('post', '/api/workspaces/:workspaceId/recommendations/action');
  const LOGACTION = routeBody('post', '/api/workspaces/:workspaceId/recommendations/:logId/action');
  const LIST = routeBody('get', '/api/workspaces/:workspaceId/recommendations');
  check('the three routes are found', ACTION.length > 500 && LOGACTION.length > 300 && LIST.length > 500, [ACTION.length, LOGACTION.length, LIST.length]);
  const o1 = inOrder(ACTION, ['getUserId(', 'checkMember(', "role === 'VIEWER'", 'c.req.json()', 'parseRecommendationActionBody(', 'assertCampaignInWorkspace(', 'assertAdAccountInWorkspace(', 'getAccount(', 'recordExecution(', 'recordDashboardAction(', 'runRefresh(']);
  check('POST …/recommendations/action: authenticate → member → role → read body → validate body → campaign ownership → ad-account ownership → ONLY THEN getAccount / recordExecution / recordDashboardAction / runRefresh', o1.ok, o1.at);
  const firstWrite = Math.min(...['recordExecution(', 'recordDashboardAction(', 'runRefresh('].map((n) => { const i = ACTION.indexOf(n); return i < 0 ? Infinity : i; }));
  check('…no write-capable call appears before the last ownership check', firstWrite > ACTION.indexOf('assertAdAccountInWorkspace('), [firstWrite, ACTION.indexOf('assertAdAccountInWorkspace(')]);
  check('…the role refusal is 403 with the stable code the pages key on', /role === 'VIEWER'\) return c\.json\(\{ error: 'Insufficient permissions', code: 'INSUFFICIENT_ROLE' \}, 403\)/.test(ACTION));
  check('…an ownership failure is a 404 (never a 403/200, never reveals which)', /WorkspaceOwnershipError[\s\S]{0,200}404/.test(ACTION));
  check('…the recommendation looked up for an execution is scoped by THIS workspace\'s account id, never by the body', /recommendation\.findFirst\(\{\s*where: \{\s*entityType: EntityType\.ACCOUNT,\s*entityId: account\.id,\s*actionCode: body\.actionCode/.test(ACTION));
  check('…recordExecution is handed the authorised workspace', /recordExecution\(rec\.id, metricsSnapshot, workspaceId\)/.test(ACTION));
  check('…the body is read from the validated value, not the raw JSON, after validation', !/c\.req\.json<\{/.test(ACTION) && /const body = parsedBody\.value/.test(ACTION));
  const o2 = inOrder(LOGACTION, ['getUserId(', 'checkMember(', "role === 'VIEWER'", 'recommendationLog.findFirst(', 'c.req.json()', 'parseLogActionBody(', 'trackUserAction(']);
  check('POST …/recommendations/:logId/action: authenticate → member → role → the log is THIS workspace\'s → body → write', o2.ok, o2.at);
  check('…the log lookup is scoped by workspaceId, and the service is told the workspace', /recommendationLog\.findFirst\(\{ where: \{ id: logId, workspaceId \}/.test(LOGACTION) && /trackUserAction\(logId, parsedBody\.value\.action, workspaceId\)/.test(LOGACTION));
  const o3 = inOrder(LIST, ['checkMember(', "wsm.role !== 'VIEWER'", 'logRecommendation(']);
  check('GET …/recommendations: the per-fetch recommendation_logs INSERT happens only for a non-VIEWER', o3.ok && /recs\.length > 0 && wsm\.role !== 'VIEWER'/.test(LIST), o3.at);

  // every call site of a recommendation writer in server.ts is inside one of exactly these routes, each behind a role gate
  const WRITERS = /(recService\.recordDashboardAction|recService\.trackUserAction|recService\.logRecommendation|execService\.recordExecution|\brunRefresh\()/g;
  const routes = [...SERVER.matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => ({ at: m.index!, key: `${m[1]!.toUpperCase()} ${m[2]}` }));
  const sites = new Map<string, { gated: boolean; calls: string[] }>();
  for (const m of SERVER.matchAll(WRITERS)) {
    const route = [...routes].reverse().find((r) => r.at < m.index!);
    const key = route?.key ?? '(outside any route)';
    const text = SERVER.slice(route?.at ?? 0, m.index!);
    const entry = sites.get(key) ?? { gated: true, calls: [] };
    entry.gated = entry.gated && /role (===|!==) 'VIEWER'/.test(text);
    entry.calls.push(m[1]!.replace(/^\w+\./, '').replace('(', ''));
    sites.set(key, entry);
  }
  const expectedSites = ['GET /api/workspaces/:workspaceId/recommendations', 'POST /api/workspaces/:workspaceId/recommendations/:logId/action', 'POST /api/workspaces/:workspaceId/recommendations/action'];
  check('recommendation writers (logRecommendation, recordDashboardAction, trackUserAction, recordExecution, runRefresh) are called from exactly three routes in server.ts', JSON.stringify([...sites.keys()].sort()) === JSON.stringify(expectedSites), [...sites.keys()]);
  check('…and every one of those call sites is preceded by a VIEWER role check in its own route', [...sites.values()].every((s) => s.gated), [...sites.entries()].filter(([, s]) => !s.gated).map(([k]) => k));

  // …and nothing else in src/ emits a USER-originated refresh or writes a dashboard action
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
  const files = walk('src').filter((p) => !p.startsWith('src/web/'));
  const userRefreshers = files.filter((p) => /['"]Recommendation(Executed|Dismissed)['"]/.test(src(p)) && p !== 'src/services/refresh/refreshEngine.ts');
  check('only server.ts emits a user-originated refresh event (RecommendationExecuted / RecommendationDismissed)', JSON.stringify(userRefreshers) === JSON.stringify(['src/api/server.ts']), userRefreshers);
  const dashWriters = files.filter((p) => /\.(recordDashboardAction|trackUserAction|recordExecution)\(/.test(src(p)) && !/src\/services\/(recommendation|execution)\.service\.ts$/.test(p));
  check('only server.ts calls recordDashboardAction / trackUserAction / recordExecution', JSON.stringify(dashWriters) === JSON.stringify(['src/api/server.ts']), dashWriters);
  const bearerSlicers = files.filter((p) => /startsWith\('Bearer '\)|\.slice\(7\)/.test(src(p)) && p !== 'src/api/adapter.ts');
  check('no code outside src/api/adapter.ts parses an Authorization header on its own (a second parser is how the gate and the handlers once disagreed)', bearerSlicers.length === 0, bearerSlicers);

  // ── 4. the AI agent's write tool ──────────────────────────────────────
  console.log('\n── 4. save_recommendation (AI chat v2) is a recommendation write too ──');
  const tool = saveRecommendationHandler();
  const args = { entityType: 'ACCOUNT' as const, entityId: 'acct_A', text: 'متابعة الحملة خلال الأيام القادمة', actionCode: 'MONITOR' as const, priority: 'NORMAL' as const, reasoning: 'A synthetic reasoning string that is comfortably long enough.' };
  for (const [label, member, userId] of [['VIEWER', { role: 'VIEWER' }, 'u1'], ['a non-member', null, 'u1'], ['an undefined userId', { role: 'OWNER' }, undefined], ['an empty userId', { role: 'OWNER' }, '']] as Array<[string, any, any]>) {
    const f = fakePrisma({ 'workspaceMember.findFirst': () => member, 'adAccount.findFirst': () => ({ id: 'acct_A' }), 'recommendation.findUnique': () => null, 'recommendation.upsert': () => ({}) });
    const r: any = await tool.run(args, { prisma: f.client, workspaceId: 'ws_A', userId });
    check(`save_recommendation as ${label} → FORBIDDEN, and neither the entity lookup nor the upsert is reached`, r.ok === false && r.error.code === 'FORBIDDEN' && !f.calls.includes('recommendation.upsert') && !f.calls.includes('adAccount.findFirst'), { r, calls: f.calls });
    if (label === 'an undefined userId' || label === 'an empty userId') check('…and the membership lookup is not even attempted ({ userId: undefined } would match anyone)', !f.calls.includes('workspaceMember.findFirst'), f.calls);
  }
  const memberQuery = fakePrisma({ 'workspaceMember.findFirst': () => ({ role: 'MANAGER' }), 'adAccount.findFirst': () => null });
  await tool.run(args, { prisma: memberQuery.client, workspaceId: 'ws_A', userId: 'u1' });
  check('the membership lookup is scoped by BOTH workspace and user', JSON.stringify(memberQuery.argsOf['workspaceMember.findFirst']![0].where) === JSON.stringify({ workspaceId: 'ws_A', userId: 'u1' }), memberQuery.argsOf['workspaceMember.findFirst']?.[0]?.where);
  const toolSrc = src('src/services/agent/tools/saveRecommendation.ts');
  check('…and the role gate precedes every other query in the tool', toolSrc.indexOf('workspaceMember.findFirst') > 0 && toolSrc.indexOf('workspaceMember.findFirst') < toolSrc.indexOf('prisma.campaign.findFirst') && toolSrc.indexOf('workspaceMember.findFirst') < toolSrc.indexOf('prisma.recommendation.upsert'));

  // ── 5. what a viewer sees ─────────────────────────────────────────────
  console.log('\n── 5. the pages that call these endpoints explain a 403 instead of failing silently ──');
  const webFiles = walk('src/web');
  const callers = webFiles.filter((p) => /recommendations\/' ?\+?[^'"]*\/?action|\/recommendations\/action/.test(src(p))).sort();
  check('exactly three pages call POST …/recommendations/action (a new call site must be a conscious decision)', JSON.stringify(callers) === JSON.stringify(['src/web/pages/beginnerDashboardPage.ts', 'src/web/pages/dashboardPage.ts', 'src/web/pages/recommendationsPage.ts']), callers);
  for (const p of callers) check(`${p} handles code INSUFFICIENT_ROLE with its own message`, /e(rr)?\.code === 'INSUFFICIENT_ROLE'/.test(src(p)), p);

  // The pages key their message on e.code — so the browser helper must actually deliver the code of a 403.
  // (It used to read the 403 body for the inactive-account check and then fail to find it again: a viewer
  // saw "Forbidden"/a generic failure, and the check above — a grep — could not tell. Review finding truth-F2.)
  console.log('\n── 5b. apiFetch (the browser helper) delivers the code of a 403 to the page ──');
  {
    const lines = src('src/web/layout.ts').split('\n');
    const start = lines.findIndex((l) => l.startsWith('async function apiFetch(path, opts = {})'));
    let end = start; while (end < lines.length && !lines[end]!.startsWith('}')) end++;
    check('(setup) the real apiFetch text was found in src/web/layout.ts', start > 0 && end > start, [start, end]);
    const fnSrc = lines.slice(start, end + 1).join('\n');
    const run = async (status: number, body: string | null, contentType = 'application/json') => {
      const calls = { logout: 0, redirect: '' };
      const win: { location: { href: string } } = { location: { href: '' } };
      const fakeFetch = async () => new Response(body, { status, headers: { 'content-type': contentType } });
      const apiFetch = new Function('API', 'getToken', 'logout', 'window', 'fetch', `${fnSrc}; return apiFetch;`)('', () => 'tok', () => { calls.logout++; }, win, fakeFetch) as (p: string, o?: unknown) => Promise<unknown>;
      let value: unknown; let err: (Error & { code?: string }) | null = null;
      try { value = await apiFetch('/x', { method: 'POST', body: '{}' }); } catch (e) { err = e as Error & { code?: string }; }
      return { value, err, logout: calls.logout, href: win.location.href };
    };
    const viewer = await run(403, JSON.stringify({ error: 'Insufficient permissions', code: 'INSUFFICIENT_ROLE' }));
    check('a viewer\'s 403 {code: INSUFFICIENT_ROLE} reaches the page as e.code (so the page can say why)', viewer.err?.code === 'INSUFFICIENT_ROLE' && viewer.err.message === 'Insufficient permissions', [viewer.err?.code, viewer.err?.message]);
    const inactive = await run(403, JSON.stringify({ code: 'ACCOUNT_INACTIVE', redirect: '/pending-activation' }));
    check('…an inactive account (403 ACCOUNT_INACTIVE) is still sent to the activation page, with no error thrown', inactive.err === null && inactive.value === null && inactive.href === '/pending-activation', inactive);
    const plain403 = await run(403, '<html>nope</html>', 'text/html');
    check('…a 403 whose body is not JSON still throws a readable error (the status text), not a crash', plain403.err instanceof Error && plain403.err.code === undefined, plain403.err?.message);
    const other = await run(409, JSON.stringify({ error: 'conflict', code: 'SOME_CODE' }));
    check('…every other error status keeps its code and message exactly as before', other.err?.code === 'SOME_CODE' && other.err.message === 'conflict', [other.err?.code, other.err?.message]);
    const unauth = await run(401, JSON.stringify({ error: 'Unauthorized' }));
    check('…401 still logs the user out', unauth.logout === 1 && unauth.err === null && unauth.value === null, unauth);
    const ok = await run(200, JSON.stringify({ fine: true }));
    check('…and a success returns the parsed body', ok.err === null && JSON.stringify(ok.value) === '{"fine":true}', ok);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_recommendation_write_auth crashed:', e); process.exit(1); });
