// ═════════════════════════════════════════════════════════════════════════
//  test_recommendation_write_auth_postgres.ts — role and ownership are enforced
//  BEFORE any recommendation write or refresh, proved with two tenants on a real
//  (synthetic, loopback) Postgres through the real Hono app.
//
//  Not part of test:all (CI has no database); exits 2 — never green — when it
//  cannot run:
//
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc3 \
//      npm run test:recommendation-write-auth-pg
//
//  Every NEGATIVE case asserts two things: the HTTP status AND that nothing
//  anywhere in the database changed. "Nothing changed" is a snapshot of EVERY
//  table (row identity + xmin, the id of the transaction that wrote the row
//  version — see tests/support/dbSnapshot.ts), taken before and after, so a
//  write to a table this test never thought of still turns it red. pg_stat
//  counters are not used (they lag).
//
//  Every POSITIVE control proves the same snapshot DOES change for an authorised
//  caller (so "zero writes" is not vacuous) and that the change did not touch a
//  single pre-existing row that mentions the other tenant.
//
//  Tenants: A and B, each with an OWNER, a MANAGER and a VIEWER, two ad accounts,
//  three campaigns, daily stats, an existing recommendation, two recommendation
//  logs. A's recommendation code is INCREASE_BUDGET, B's is DECREASE_BUDGET, so a
//  request that carries the OTHER tenant's code can be told apart.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env['PLATFORM_ADMIN_EMAILS'] = 'platform-admin@repro.invalid';
delete process.env['REDIS_URL'];
delete process.env['AI_AGENT_V2_ENABLED'];

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('NOT RUN: DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`); }
}

async function main() {
  const { PrismaClient, EntityType, RecommendationPriority, RecommendationSource, UserActionStatus } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const jwt = (await import('jsonwebtoken')).default;
  const { buildRoutes } = await import('./src/api/server');
  const { signToken } = await import('./src/services/jwtAuth');
  const { snapshotAll, diffSnapshots, listTables, totalRows, tablesIn } = await import('./tests/support/dbSnapshot');

  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: dbName, max: 10, connectionTimeoutMillis: 4000 });
  try { await pool.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic database:', (e as Error).message); process.exit(2); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);
  const sfx = Math.random().toString(36).slice(2, 8);
  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };
  const tables = await listTables(pool);

  // ── fixture ───────────────────────────────────────────────────────────
  const mkUser = async (label: string, isActive = true) => {
    const u = await prisma.user.create({ data: { email: `${label}-${sfx}@repro.invalid`, passwordHash: 'x', name: label, isActive } });
    return { u, token: signToken({ sub: u.id, email: u.email, ver: u.tokenVersion }) };
  };
  const mkTenant = async (label: string, code: string) => {
    const ws = await prisma.workspace.create({ data: { name: `Tenant ${label}` } });
    const owner = await mkUser(`${label}-owner`);
    const manager = await mkUser(`${label}-manager`);
    const viewer = await mkUser(`${label}-viewer`);
    for (const [m, role] of [[owner, 'OWNER'], [manager, 'MANAGER'], [viewer, 'VIEWER']] as const) {
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m.u.id, role } });
    }
    const mkAccount = (n: number) => prisma.adAccount.create({ data: { workspaceId: ws.id, externalAccountId: `act_${label}${n}_${sfx}`, name: `Account ${label}${n}`, currency: 'IQD', currencyMinorFactor: 1, timezone: 'UTC', metaAccountStatus: 1, lastSyncedAt: new Date(), createdAt: new Date(Date.now() - (3 - n) * 1000) } });
    const account = await mkAccount(1);
    const account2 = await mkAccount(2);
    const mkCampaign = (acc: { id: string }, n: number) => prisma.campaign.create({ data: { adAccountId: acc.id, externalCampaignId: `camp_${label}${n}_${sfx}`, name: `Campaign ${label}${n}` } });
    const c1 = await mkCampaign(account, 1);
    const c2 = await mkCampaign(account, 2);
    const c3 = await mkCampaign(account2, 3);   // a campaign of the workspace's SECOND ad account
    for (const d of [1, 2, 3]) {
      await prisma.dailyStat.create({ data: { entityType: EntityType.ACCOUNT, entityId: account.id, date: day(d), spend: 100_000n, impressions: 10_000n, clicks: 200n } });
      await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: c1.id, date: day(d), spend: 60_000n, impressions: 6_000n, clicks: 120n } });
    }
    const rec = await prisma.recommendation.create({ data: { entityType: EntityType.ACCOUNT, entityId: account.id, date: day(1), priority: RecommendationPriority.HIGH, actionCode: code, sourceIssuesJson: [], detailsJson: { text: `existing ${label}` }, source: RecommendationSource.V1_RULES } });
    const mkLog = (n: number) => prisma.recommendationLog.create({ data: { workspaceId: ws.id, campaignId: c1.id, verdict: `${code} (HIGH) #${n}`, metricsSnapshot: { itemKey: `priority:${code}`, n }, userAction: UserActionStatus.PENDING } });
    const log1 = await mkLog(1);
    const log2 = await mkLog(2);
    return { label, ws, owner, manager, viewer, account, account2, c1, c2, c3, rec, log1, log2, code };
  };
  const A = await mkTenant('A', 'INCREASE_BUDGET');
  const B = await mkTenant('B', 'DECREASE_BUDGET');
  // B already has an execution of its recommendation — a row that must never move.
  await prisma.recommendationExecution.create({ data: { workspaceId: B.ws.id, recommendationId: B.rec.id, metricsSnapshot: { synthetic: true }, userAction: UserActionStatus.EXECUTED, executedAt: new Date() } });
  const outsider = await mkUser('outsider');                    // a user with no membership anywhere
  const pendingMgr = await mkUser('A-pending-manager', false);  // MANAGER of A, but the account is not activated yet
  await prisma.workspaceMember.create({ data: { workspaceId: A.ws.id, userId: pendingMgr.u.id, role: 'MANAGER' } });
  const bFootprintIds = [B.ws.id, B.account.id, B.account2.id, B.c1.id, B.c2.id, B.c3.id, B.rec.id, B.log1.id, B.log2.id, B.owner.u.id, B.manager.u.id, B.viewer.u.id];

  // ── plumbing ──────────────────────────────────────────────────────────
  const quiet = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const l = console.log; const w = console.warn; console.log = () => {}; console.warn = () => {};
    try { return await fn(); } finally { console.log = l; console.warn = w; }
  };
  type Res = { status: number; body: any };
  const send = (method: 'GET' | 'POST', path: string, token?: string, body?: unknown, raw?: string): Promise<Res> => quiet(async () => {
    const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
    const init: RequestInit = { method, headers };
    if (raw !== undefined) { init.body = raw; headers['content-type'] = 'application/json'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const r = await app.request(path, init);
    const text = await r.text();
    let parsedBody: any = null; try { parsedBody = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body: parsedBody };
  });
  const actionPath = (ws: string) => `/api/workspaces/${ws}/recommendations/action`;
  const logActionPath = (ws: string, logId: string) => `/api/workspaces/${ws}/recommendations/${logId}/action`;
  const goodBody = (t: { code: string }, campaignId: string | null, extra: Record<string, unknown> = {}) => ({ action: 'EXECUTED', itemKey: `priority:${t.code}`, itemKind: 'priority', actionCode: t.code, campaignId, feedKey: null, title: 'synthetic action', ...extra });

  const nTables = tables.length;
  /** The strongest "wrote nothing": the whole database, every row's xmin, before and after. */
  const refused = async (name: string, expectStatus: number, call: () => Promise<Res>): Promise<Res> => {
    const before = await snapshotAll(pool, tables);
    const r = await call();
    const after = await snapshotAll(pool, tables);
    const d = diffSnapshots(before, after);
    check(`${name} → ${expectStatus}, and no row in any of ${nTables} tables changed`, r.status === expectStatus && d.length === 0, { status: r.status, body: r.body, changed: d.slice(0, 6), more: Math.max(0, d.length - 6) });
    return r;
  };
  const bFootprint = () => snapshotAll(pool, tables, bFootprintIds);
  /** B's pre-existing rows (any table, any column that mentions a B id): none may be rewritten or removed. */
  const bUntouched = (before: Awaited<ReturnType<typeof bFootprint>>, after: Awaited<ReturnType<typeof bFootprint>>) => diffSnapshots(before, after).filter((d) => !d.endsWith(' added'));
  const written = async (name: string, expectStatus: number, call: () => Promise<Res>, mustTouch: string[], extra?: (r: Res, diff: string[]) => boolean, opts: { tenantBMayChange?: boolean } = {}) => {
    const before = await snapshotAll(pool, tables); const bBefore = await bFootprint();
    const r = await call();
    const after = await snapshotAll(pool, tables); const bAfter = await bFootprint();
    const d = diffSnapshots(before, after);
    const touched = tablesIn(d);
    const spill = opts.tenantBMayChange ? [] : bUntouched(bBefore, bAfter);
    check(`${name} → ${expectStatus}; wrote ${mustTouch.join(' + ')}${extra ? ' as expected' : ''}${opts.tenantBMayChange ? '' : '; no pre-existing row of tenant B changed'}`,
      r.status === expectStatus && mustTouch.every((t) => touched.includes(t)) && spill.length === 0 && (extra ? extra(r, d) : true),
      { status: r.status, body: r.body, touched, spill: spill.slice(0, 5) });
    return { r, diff: d };
  };

  const before0 = await snapshotAll(pool, tables);
  console.log(`fixture: tenants A and B (OWNER/MANAGER/VIEWER each), ${nTables} tables, ${totalRows(before0)} rows in the database (database: ${dbName})`);

  // ── 1. POST …/recommendations/action ─────────────────────────────────
  console.log('\n── 1. POST /api/workspaces/:id/recommendations/action — every refusal writes nothing ──');
  const R1 = (wsId: string, token: string | undefined, body: unknown) => () => send('POST', actionPath(wsId), token, body);
  const okA = goodBody(A, A.c1.id);

  await refused('anonymous', 401, R1(A.ws.id, undefined, okA));
  await refused('a token that is not a JWT', 401, R1(A.ws.id, 'not-a-jwt', okA));
  await refused('a JWT signed with another secret (A\'s manager)', 401, R1(A.ws.id, jwt.sign({ sub: A.manager.u.id, email: A.manager.u.email, ver: 0 }, 'some-other-secret-0123456789abcdef012345'), okA));
  await refused('a revoked token (tokenVersion no longer matches)', 401, R1(A.ws.id, signToken({ sub: A.manager.u.id, email: A.manager.u.email, ver: 99 }), okA));
  await refused('a user with no membership anywhere (non-member)', 403, R1(A.ws.id, outsider.token, okA));
  await refused('A\'s VIEWER, A\'s own campaign (a viewer may not write)', 403, R1(A.ws.id, A.viewer.token, okA));
  await refused('A\'s VIEWER recording IGNORED (also a write)', 403, R1(A.ws.id, A.viewer.token, goodBody(A, A.c1.id, { action: 'IGNORED' })));
  await refused('A\'s VIEWER with B\'s campaign — the role is judged first (403, not 404)', 403, R1(A.ws.id, A.viewer.token, goodBody(A, B.c1.id)));
  await refused('B\'s OWNER posting with A\'s workspaceId (a non-member of A)', 403, R1(A.ws.id, B.owner.token, goodBody(A, A.c1.id)));
  await refused('B\'s OWNER posting with A\'s workspaceId and B\'s own campaign', 403, R1(A.ws.id, B.owner.token, goodBody(B, B.c1.id)));
  await refused('a workspaceId that does not exist (same 403 as a foreign one — no oracle)', 403, R1(`ws_nope_${sfx}`, A.owner.token, okA));
  await refused('a MANAGER whose account is not activated yet (the active-user gate)', 403, R1(A.ws.id, pendingMgr.token, okA));
  const foreignCamp = await refused('B\'s MANAGER, B\'s workspace, but A\'s campaignId', 404, R1(B.ws.id, B.manager.token, goodBody(B, A.c1.id)));
  await refused('B\'s OWNER, B\'s workspace, A\'s campaign that sits on A\'s SECOND ad account', 404, R1(B.ws.id, B.owner.token, goodBody(B, A.c3.id)));
  await refused('A\'s MANAGER with a campaignId from B', 404, R1(A.ws.id, A.manager.token, goodBody(A, B.c1.id)));
  await refused('A\'s OWNER with a campaignId from B (IGNORED — which would skip the execution but still log)', 404, R1(A.ws.id, A.owner.token, goodBody(A, B.c2.id, { action: 'IGNORED' })));
  const unknownCamp = await refused('A\'s MANAGER with a campaignId that exists nowhere', 404, R1(A.ws.id, A.manager.token, goodBody(A, `camp_nowhere_${sfx}`)));
  check('a foreign campaign id and an unknown one are indistinguishable (same status, same body)', foreignCamp.status === unknownCamp.status && JSON.stringify(foreignCamp.body) === JSON.stringify(unknownCamp.body), [foreignCamp.body, unknownCamp.body]);
  await refused('A\'s MANAGER carrying B\'s adAccountId (an identifier the request carries is validated too)', 404, R1(A.ws.id, A.manager.token, goodBody(A, A.c1.id, { adAccountId: B.account.id })));
  await refused('A\'s MANAGER carrying B\'s SECOND adAccountId', 404, R1(A.ws.id, A.manager.token, goodBody(A, null, { adAccountId: B.account2.id })));
  // malformed — rejected before anything is looked up or written
  const malformed: Array<[string, () => Promise<Res>]> = [
    ['body is not JSON', () => send('POST', actionPath(A.ws.id), A.manager.token, undefined, '{"action": "EXECUTED", ')],
    ['body is the JSON null', () => send('POST', actionPath(A.ws.id), A.manager.token, undefined, 'null')],
    ['body is a JSON array', () => send('POST', actionPath(A.ws.id), A.manager.token, undefined, '[1,2]')],
    ['body is a JSON string', () => send('POST', actionPath(A.ws.id), A.manager.token, undefined, '"EXECUTED"')],
    ['action is missing', R1(A.ws.id, A.manager.token, { itemKey: 'priority:X' })],
    ['action is not EXECUTED/IGNORED', R1(A.ws.id, A.manager.token, goodBody(A, null, { action: 'DELETE' }))],
    ['action is an object', R1(A.ws.id, A.manager.token, goodBody(A, null, { action: { not: 'EXECUTED' } }))],
    ['itemKey is missing', R1(A.ws.id, A.manager.token, { action: 'EXECUTED' })],
    ['itemKey is empty', R1(A.ws.id, A.manager.token, goodBody(A, null, { itemKey: '' }))],
    ['itemKey is a number', R1(A.ws.id, A.manager.token, goodBody(A, null, { itemKey: 42 }))],
    ['itemKey is 600 characters', R1(A.ws.id, A.manager.token, goodBody(A, null, { itemKey: 'k'.repeat(600) }))],
    ['itemKey contains a NUL character (Postgres cannot store it)', R1(A.ws.id, A.manager.token, goodBody(A, null, { itemKey: 'priority:\u0000X' }))],
    ['campaignId is a number', R1(A.ws.id, A.manager.token, goodBody(A, 12345 as unknown as string))],
    ['campaignId is an object (a Prisma filter smuggled in)', R1(A.ws.id, A.manager.token, goodBody(A, { not: 'x' } as unknown as string))],
    ['campaignId is an array', R1(A.ws.id, A.manager.token, goodBody(A, [A.c1.id] as unknown as string))],
    ['campaignId contains a NUL character', R1(A.ws.id, A.manager.token, goodBody(A, `${A.c1.id}\u0000`))],
    ['campaignId is 300 characters', R1(A.ws.id, A.manager.token, goodBody(A, 'c'.repeat(300)))],
    ['adAccountId is an object', R1(A.ws.id, A.manager.token, goodBody(A, null, { adAccountId: { in: [B.account.id] } }))],
    ['actionCode is an object (a Prisma filter smuggled in)', R1(A.ws.id, A.manager.token, goodBody(A, null, { actionCode: { contains: '' } }))],
    ['actionCode is an array', R1(A.ws.id, A.manager.token, goodBody(A, null, { actionCode: ['INCREASE_BUDGET'] }))],
    ['itemKind is an object', R1(A.ws.id, A.manager.token, goodBody(A, null, { itemKind: { x: 1 } }))],
    ['feedKey is a number', R1(A.ws.id, A.manager.token, goodBody(A, null, { feedKey: 7 }))],
    ['title is 5000 characters', R1(A.ws.id, A.manager.token, goodBody(A, null, { title: 't'.repeat(5000) }))],
  ];
  for (const [name, call] of malformed) await refused(`malformed: ${name}`, 400, call);

  // ── 2. POST …/recommendations/:logId/action ──────────────────────────
  console.log('\n── 2. POST /api/workspaces/:id/recommendations/:logId/action — every refusal writes nothing ──');
  const R2 = (wsId: string, logId: string, token: string | undefined, body: unknown = { action: 'EXECUTED' }) => () => send('POST', logActionPath(wsId, logId), token, body);
  await refused('anonymous', 401, R2(A.ws.id, A.log1.id, undefined));
  await refused('a token that is not a JWT', 401, R2(A.ws.id, A.log1.id, 'not-a-jwt'));
  await refused('a revoked token', 401, R2(A.ws.id, A.log1.id, signToken({ sub: A.owner.u.id, email: A.owner.u.email, ver: 99 })));
  await refused('a non-member', 403, R2(A.ws.id, A.log1.id, outsider.token));
  await refused('A\'s VIEWER with A\'s own log (EXECUTED)', 403, R2(A.ws.id, A.log1.id, A.viewer.token));
  await refused('A\'s VIEWER with A\'s own log (IGNORED)', 403, R2(A.ws.id, A.log1.id, A.viewer.token, { action: 'IGNORED' }));
  await refused('B\'s OWNER with A\'s workspaceId and A\'s log id', 403, R2(A.ws.id, A.log1.id, B.owner.token));
  await refused('a MANAGER whose account is not activated yet', 403, R2(A.ws.id, A.log1.id, pendingMgr.token));
  const foreignLog = await refused('B\'s MANAGER, B\'s workspace, A\'s log id', 404, R2(B.ws.id, A.log1.id, B.manager.token));
  await refused('A\'s MANAGER, A\'s workspace, a log id from B', 404, R2(A.ws.id, B.log1.id, A.manager.token));
  await refused('A\'s OWNER, A\'s workspace, B\'s second log id (IGNORED)', 404, R2(A.ws.id, B.log2.id, A.owner.token, { action: 'IGNORED' }));
  const unknownLog = await refused('A\'s MANAGER with a log id that exists nowhere', 404, R2(A.ws.id, `log_nowhere_${sfx}`, A.manager.token));
  check('a foreign log id and an unknown one are indistinguishable (same status, same body)', foreignLog.status === unknownLog.status && JSON.stringify(foreignLog.body) === JSON.stringify(unknownLog.body), [foreignLog.body, unknownLog.body]);
  for (const [name, raw] of [['not JSON', '{"action":'], ['null', 'null'], ['an array', '[]'], ['action missing', '{}'], ['action invalid', '{"action":"DONE"}'], ['action an object', '{"action":{"a":1}}']] as const) {
    await refused(`malformed: body is ${name} (A's manager, A's own log)`, 400, () => send('POST', logActionPath(A.ws.id, A.log1.id), A.manager.token, undefined, raw));
  }

  // ── 3. GET …/recommendations logs a row per fetch ────────────────────
  console.log('\n── 3. GET /api/workspaces/:id/recommendations inserts a recommendation_log — only for roles that may write ──');
  await refused('anonymous', 401, () => send('GET', `/api/workspaces/${A.ws.id}/recommendations`));
  await refused('B\'s OWNER reading A\'s recommendations (non-member)', 403, () => send('GET', `/api/workspaces/${A.ws.id}/recommendations`, B.owner.token));
  const viewerRead = await refused('A\'s VIEWER reads the list (200) and it writes no log row', 200, () => send('GET', `/api/workspaces/${A.ws.id}/recommendations`, A.viewer.token));
  check('…the list itself is still served to the viewer', Array.isArray(viewerRead.body) && viewerRead.body.length >= 1, viewerRead.body);

  // ── 4. other routes that refresh or generate: already role-gated, pinned ──
  console.log('\n── 4. routes that refresh / regenerate recommendations through a sync (already role-gated; pinned so they stay so) ──');
  for (const [path, label] of [[`/api/workspaces/${A.ws.id}/sync`, 'POST …/sync'], [`/api/workspaces/${A.ws.id}/repair-iqd`, 'POST …/repair-iqd']] as const) {
    await refused(`${label}: anonymous`, 401, () => send('POST', path, undefined, {}));
    await refused(`${label}: non-member (B's OWNER)`, 403, () => send('POST', path, B.owner.token, {}));
    await refused(`${label}: A's VIEWER`, 403, () => send('POST', path, A.viewer.token, {}));
  }

  // ── 5. positive controls ─────────────────────────────────────────────
  console.log('\n── 5. positive controls: authorised callers DO write (so the zero-write results above are not vacuous) ──');
  await written('A\'s OWNER, EXECUTED, A\'s own campaign and A\'s own action code', 200, R1(A.ws.id, A.owner.token, okA),
    ['recommendation_logs', 'recommendation_executions', 'refresh_logs', 'refresh_states'],
    (r) => typeof r.body?.id === 'string' && r.body.workspaceId === A.ws.id && r.body.campaignId === A.c1.id && r.body.userAction === 'EXECUTED' && r.body.verdict === `EXECUTED:priority:${A.code}` && typeof r.body.refresh?.durationMs === 'number' && Array.isArray(r.body.refresh?.targetsRun));
  check('…the execution row belongs to A\'s recommendation and A\'s workspace', (await prisma.recommendationExecution.count({ where: { recommendationId: A.rec.id, workspaceId: A.ws.id } })) === 1);
  check('…and exactly one refresh_logs row was written, for A\'s primary ad account', (await prisma.refreshLog.count({ where: { adAccountId: A.account.id, trigger: 'RecommendationExecuted' } })) === 1 && (await prisma.refreshLog.count({ where: { adAccountId: B.account.id } })) === 0);
  await written('A\'s MANAGER, IGNORED, a campaign of A\'s SECOND ad account', 200, R1(A.ws.id, A.manager.token, goodBody(A, A.c3.id, { action: 'IGNORED' })),
    ['recommendation_logs', 'refresh_logs'],
    (r) => r.body?.campaignId === A.c3.id && r.body?.userAction === 'IGNORED');
  await written('A\'s MANAGER, no campaign at all (campaignId null)', 200, R1(A.ws.id, A.manager.token, goodBody(A, null, { action: 'IGNORED', itemKey: 'issue:SYNTHETIC' })),
    ['recommendation_logs'], (r) => r.body?.campaignId === null);
  // A carries B's action code and B-looking keys: nothing of B's may move, and B's execution stays single
  await written('A\'s OWNER, EXECUTED, carrying B\'s action code and an itemKey that spells B\'s log id', 200,
    R1(A.ws.id, A.owner.token, goodBody(B, A.c2.id, { itemKey: `issue:${B.log1.id}` })), ['recommendation_logs']);
  check('…B\'s recommendation still has exactly its one execution, and A got none for B\'s code', (await prisma.recommendationExecution.count({ where: { recommendationId: B.rec.id } })) === 1 && (await prisma.recommendationExecution.count({ where: { workspaceId: A.ws.id } })) === 1);
  await written('A\'s OWNER: …/:logId/action EXECUTED on A\'s own log', 200, R2(A.ws.id, A.log1.id, A.owner.token), ['recommendation_logs'],
    (r) => r.body?.id === A.log1.id && r.body?.userAction === 'EXECUTED' && r.body?.actionAppliedAt != null);
  await written('A\'s MANAGER: …/:logId/action IGNORED on A\'s own log', 200, R2(A.ws.id, A.log2.id, A.manager.token, { action: 'IGNORED' }), ['recommendation_logs'],
    (r) => r.body?.id === A.log2.id && r.body?.userAction === 'IGNORED');
  await written('A\'s MANAGER: GET …/recommendations logs a row (closed-loop learning keeps working for writers)', 200, () => send('GET', `/api/workspaces/${A.ws.id}/recommendations`, A.manager.token), ['recommendation_logs'],
    (r) => Array.isArray(r.body));
  check('B\'s own log rows and B\'s recommendation are exactly as seeded', (await prisma.recommendationLog.count({ where: { workspaceId: B.ws.id } })) === 2 && (await prisma.recommendationLog.count({ where: { workspaceId: B.ws.id, userAction: UserActionStatus.PENDING } })) === 2);
  await written('B\'s MANAGER on B\'s own workspace and campaign (the guard is symmetric, not an A-only rule)', 200, R1(B.ws.id, B.manager.token, goodBody(B, B.c1.id, { action: 'IGNORED' })), ['recommendation_logs', 'refresh_logs'], (r) => r.body?.workspaceId === B.ws.id, { tenantBMayChange: true });

  // ── 6. the service layer refuses on its own (a future route may forget the check) ──
  console.log('\n── 6. defence in depth: the services refuse a foreign campaign / ad account / log even when called directly ──');
  const { RecommendationService } = await import('./src/services/recommendation.service');
  const { ExecutionService } = await import('./src/services/execution.service');
  const { runRefresh } = await import('./src/services/refresh/refreshEngine');
  const recSvc = new RecommendationService(prisma);
  const execSvc = new ExecutionService(prisma);
  const rejects = async (name: string, fn: () => Promise<unknown>) => {
    const before = await snapshotAll(pool, tables);
    let threw: unknown = null; let value: unknown;
    try { value = await quiet(fn); } catch (e) { threw = e; }
    const after = await snapshotAll(pool, tables);
    const d = diffSnapshots(before, after);
    check(`${name} → refused, and no row in any of ${nTables} tables changed`, threw !== null && d.length === 0, { threw: threw ? String((threw as Error).message ?? threw).slice(0, 80) : 'did not throw', returned: threw ? undefined : value, changed: d.slice(0, 6) });
    return threw;
  };
  const snap = { ctr: 1 };
  const dash = (campaignId: string | null, ws = A.ws.id) => () => recSvc.recordDashboardAction({ workspaceId: ws, action: 'IGNORED', itemKey: 'priority:X', campaignId, metricsSnapshot: snap });
  const e1 = await rejects('recordDashboardAction(A\'s workspace, B\'s campaign)', dash(B.c1.id));
  await rejects('recordDashboardAction(A\'s workspace, a campaign that exists nowhere)', dash(`camp_nowhere_${sfx}`));
  await rejects('recordDashboardAction(B\'s workspace, A\'s campaign on A\'s second account)', dash(A.c3.id, B.ws.id));
  check('…the refusal is a typed WorkspaceOwnershipError, not a database error', (e1 as Error | null)?.name === 'WorkspaceOwnershipError', (e1 as Error | null)?.name);
  await rejects('trackUserAction(B\'s log id, stated workspace A)', () => recSvc.trackUserAction(B.log1.id, 'EXECUTED', A.ws.id));
  await rejects('trackUserAction(an unknown log id, stated workspace A)', () => recSvc.trackUserAction(`log_nowhere_${sfx}`, 'EXECUTED', A.ws.id));
  await rejects('recordExecution(B\'s recommendation, stated workspace A)', () => execSvc.recordExecution(B.rec.id, snap, A.ws.id));
  await rejects('runRefresh(B\'s ad account under A\'s workspace) — would recalculate B\'s recommendations and health', () => runRefresh(prisma, null, { type: 'RecommendationExecuted', adAccountId: B.account.id, workspaceId: A.ws.id, itemKey: 'priority:X' }));
  await rejects('runRefresh(B\'s SECOND ad account under A\'s workspace, Dismissed)', () => runRefresh(prisma, null, { type: 'RecommendationDismissed', adAccountId: B.account2.id, workspaceId: A.ws.id, itemKey: 'priority:X' }));
  await rejects('runRefresh(an ad account that exists nowhere)', () => runRefresh(prisma, null, { type: 'RecommendationExecuted', adAccountId: `acct_nowhere_${sfx}`, workspaceId: A.ws.id, itemKey: 'priority:X' }));
  await rejects('runRefresh(A\'s ad account under a workspace id that exists nowhere)', () => runRefresh(prisma, null, { type: 'RecommendationExecuted', adAccountId: A.account.id, workspaceId: `ws_nowhere_${sfx}`, itemKey: 'priority:X' }));
  // …and the same calls with matching ids still work
  const okDash = await recSvc.recordDashboardAction({ workspaceId: A.ws.id, action: 'IGNORED', itemKey: 'priority:SVC', campaignId: A.c2.id, metricsSnapshot: snap });
  check('recordDashboardAction(A, A\'s campaign) still writes', okDash.workspaceId === A.ws.id && okDash.campaignId === A.c2.id);
  const okTrack = await recSvc.trackUserAction(A.log1.id, 'IGNORED', A.ws.id);
  check('trackUserAction(A\'s log, workspace A) still writes', okTrack.id === A.log1.id && okTrack.userAction === 'IGNORED');
  const okRefresh = await quiet(() => runRefresh(prisma, null, { type: 'RecommendationDismissed', adAccountId: A.account2.id, workspaceId: A.ws.id, itemKey: 'priority:SVC' }));
  check('runRefresh(A\'s second ad account under workspace A) still runs and logs', typeof okRefresh.planId === 'string' && (await prisma.refreshLog.count({ where: { adAccountId: A.account2.id } })) === 1, okRefresh);

  // ── 7. the AI agent's write tool is a recommendation write too ────────
  console.log('\n── 7. the AI agent\'s save_recommendation tool (chat v2) ──');
  const { saveRecommendationHandler } = await import('./src/services/agent/tools/saveRecommendation');
  const tool = saveRecommendationHandler();
  const toolArgs = (entityType: 'ACCOUNT' | 'CAMPAIGN', entityId: string, actionCode: 'MONITOR' | 'PAUSE' = 'MONITOR') => ({ entityType, entityId, text: 'متابعة الحملة خلال الأيام القادمة', actionCode, priority: 'NORMAL' as const, reasoning: 'A synthetic reasoning string that is comfortably long enough.' });
  const toolRefused = async (name: string, ctx: { workspaceId: string; userId: string }, args: ReturnType<typeof toolArgs>, expectCode: string) => {
    const before = await snapshotAll(pool, tables);
    const r = await quiet(() => tool.run(args, { prisma, ...ctx })).catch((e: unknown) => ({ ok: false as const, error: { code: `THREW:${(e as Error).message}` } }));
    const after = await snapshotAll(pool, tables);
    const d = diffSnapshots(before, after);
    check(`${name} → ${expectCode}, and no row in any of ${nTables} tables changed`, !r.ok && (r as any).error.code === expectCode && d.length === 0, { r, changed: d.slice(0, 5) });
  };
  await toolRefused('A\'s VIEWER asks the agent to save a recommendation on A\'s account', { workspaceId: A.ws.id, userId: A.viewer.u.id }, toolArgs('ACCOUNT', A.account.id), 'FORBIDDEN');
  await toolRefused('B\'s OWNER (non-member of A) under A\'s workspace', { workspaceId: A.ws.id, userId: B.owner.u.id }, toolArgs('ACCOUNT', A.account.id), 'FORBIDDEN');
  await toolRefused('a user id that exists nowhere', { workspaceId: A.ws.id, userId: `user_nowhere_${sfx}` }, toolArgs('ACCOUNT', A.account.id), 'FORBIDDEN');
  await toolRefused('A\'s MANAGER naming B\'s ad account', { workspaceId: A.ws.id, userId: A.manager.u.id }, toolArgs('ACCOUNT', B.account.id), 'NOT_FOUND');
  await toolRefused('A\'s MANAGER naming B\'s campaign', { workspaceId: A.ws.id, userId: A.manager.u.id }, toolArgs('CAMPAIGN', B.c1.id), 'NOT_FOUND');
  await written('A\'s MANAGER saves a recommendation on A\'s account through the tool', 200, async () => {
    const r = await quiet(() => tool.run(toolArgs('ACCOUNT', A.account.id), { prisma, workspaceId: A.ws.id, userId: A.manager.u.id }));
    return { status: r.ok ? 200 : 500, body: r };
  }, ['recommendations'], (r) => r.body?.ok === true);

  // ── 8. what a viewer sees in the pages ────────────────────────────────
  console.log('\n── 8. the 403 carries a stable code the pages turn into a clear message ──');
  const viewerErr = await send('POST', actionPath(A.ws.id), A.viewer.token, okA);
  check('a viewer\'s refusal is {error, code: "INSUFFICIENT_ROLE"} (the pages key their message on the code)', viewerErr.status === 403 && viewerErr.body?.code === 'INSUFFICIENT_ROLE', viewerErr.body);
  const viewerErr2 = await send('POST', logActionPath(A.ws.id, A.log1.id), A.viewer.token, { action: 'EXECUTED' });
  check('same code on …/:logId/action', viewerErr2.status === 403 && viewerErr2.body?.code === 'INSUFFICIENT_ROLE', viewerErr2.body);

  console.log(`\n${pass} passed, ${fail} failed   (database: ${dbName})`);
  await prisma.$disconnect(); await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_recommendation_write_auth_postgres crashed:', e); process.exit(1); });
