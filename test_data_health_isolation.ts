// ═════════════════════════════════════════════════════════════════════════
//  test_data_health_isolation.ts
//
//  GET …/data-health used to (1) list EVERY tenant's orphaned campaign ids and
//  count them, and (2) with ?cleanup=true delete every tenant's orphans — from a
//  GET, for any member, a VIEWER included (reproduced with two synthetic tenants:
//  scripts/repro/data_health_orphans.ts, delivery/core/DATA_HEALTH_ISOLATION.md).
//
//  No database here. The behavioural proof is test_data_health_isolation_postgres.ts
//  (synthetic Postgres, not part of test:all). This test makes the structure that
//  keeps it fixed impossible to erode silently:
//    1. who may import the GLOBAL cleanup module, and where it is called;
//    2. the GET handler cannot delete; the delete handler authorises and is scoped;
//    3. the platform routes demand a platform administrator;
//    4. nothing exports an orphan finder/deleter that lacks a workspace id;
//    5. the approval logic (explicit, bound to the dry-run batch), with a fake client; the scheduler only REPORTS;
//    6. the page no longer asks a GET to delete.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

const ROOT = __dirname;
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
/** Code only: a comment explaining the old behaviour must not trip a check on the new one. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p); }
  return out;
}
function handlers(src: string): Array<{ verb: string; route: string; text: string }> {
  const re = /^ {2}app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/gm;
  const heads: Array<{ verb: string; route: string; index: number }> = [];
  for (let m = re.exec(src); m; m = re.exec(src)) heads.push({ verb: m[1]!, route: m[3]!, index: m.index });
  return heads.map((h, i) => ({ verb: h.verb, route: h.route, text: code(src.slice(h.index, heads[i + 1]?.index ?? src.length)) }));
}

async function main() {
  const serverRaw = read('src/api/server.ts');
  const hs = handlers(serverRaw);
  const find = (verb: string, route: string) => hs.find((h) => h.verb === verb && h.route === route);

  // ── 1. who may reach the global module ───────────────────────────────
  console.log('\n── 1. the GLOBAL orphan cleanup is reachable only by the platform ──');
  // ANY mention of the module path counts — `from '…/platformOrphanCleanup'`, with a .js/.ts suffix, `export … from`,
  // `export * from`, dynamic `import('…')`, `require('…')`: the previous pattern (a quote right after the name, after `from`)
  // let `'./platformOrphanCleanup.js'` and a dynamic import through (review finding ORPH-06). Comments are stripped first.
  const MODULE_REF = /['"`][^'"`\n]*\/platformOrphanCleanup(?:\.[cm]?[jt]s)?['"`]/;
  const importers = walk(path.join(ROOT, 'src'))
    .filter((f) => MODULE_REF.test(code(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, '/')).sort();
  check('only server.ts (platform-admin routes) and the scheduler import platformOrphanCleanup', JSON.stringify(importers) === JSON.stringify(['src/api/server.ts', 'src/workers/backgroundScheduler.ts']), importers);
  const globalCallers = hs.filter((h) => /cleanupOrphanedCampaignStatsGlobal|describeOrphanBatchGlobal/.test(h.text));
  check('inside server.ts the global functions appear ONLY in /api/admin/ handlers', globalCallers.length === 2 && globalCallers.every((h) => h.route.startsWith('/api/admin/')), globalCallers.map((h) => `${h.verb} ${h.route}`));
  check('every one of those handlers demands a platform administrator (requirePlatformAdmin)', globalCallers.every((h) => /requirePlatformAdmin\(/.test(h.text)));
  check('and the only delete among them is a POST', globalCallers.filter((h) => /cleanupOrphanedCampaignStatsGlobal/.test(h.text)).every((h) => h.verb === 'post'));
  const cleanupCallers = walk(path.join(ROOT, 'src')).filter((f) => /\bcleanupOrphanedCampaignStatsGlobal\s*\(/.test(code(readFileSync(f, 'utf8'))) && !/platformOrphanCleanup\.ts$/.test(f))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
  check('exactly ONE module calls the global delete: server.ts — and the scheduler is not among them', JSON.stringify(cleanupCallers) === JSON.stringify(['src/api/server.ts']), cleanupCallers);
  const sched = code(read('src/workers/backgroundScheduler.ts'));
  const schedImport = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\/platformOrphanCleanup(?:\.[cm]?[jt]s)?['"]/.exec(sched);
  // the ORIGINAL name of every imported binding (`{ a as b }` → a): an alias cannot hide a deleting function
  const origNames = (clause: string) => clause.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim()).filter(Boolean);
  check('the scheduler imports ONLY the read-only report from platformOrphanCleanup (alias-aware)', !!schedImport && origNames(schedImport[1]!).join() === 'reportOrphanedCampaignStatsGlobal', schedImport?.[1]);
  const schedAllImports = [...sched.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].flatMap((m) => origNames(m[1]!).map((n) => `${n} from ${m[2]}`));
  check('no binding the scheduler imports — under ANY alias, from ANY module — is a delete/cleanup/purge of orphans', !schedAllImports.some((x) => /(delete|cleanup|purge|remove|destroy)\w*Orphan/i.test(x.split(' from ')[0]!)), schedAllImports.filter((x) => /orphan/i.test(x)));
  check('…and no namespace/default import or dynamic import() of platformOrphanCleanup / campaignDataIsolation in the scheduler', !/import\s*\*\s*as\s+\w+\s+from\s*['"][^'"]*\/(platformOrphanCleanup|campaignDataIsolation)/.test(sched) && !/import\(\s*['"`][^'"`]*\/(platformOrphanCleanup|campaignDataIsolation)/.test(sched) && !/require\(\s*['"`][^'"`]*\/(platformOrphanCleanup|campaignDataIsolation)/.test(sched));
  const tenantDeleters = walk(path.join(ROOT, 'src')).filter((f) => /\bdeleteOwnedOrphanedCampaignStats\s*\(/.test(code(readFileSync(f, 'utf8'))) && !/campaignDataIsolation\.ts$/.test(f)).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
  check('the tenant-scoped delete is called from server.ts only (not from the scheduler or any helper it could import)', JSON.stringify(tenantDeleters) === JSON.stringify(['src/api/server.ts']), tenantDeleters);
  check('the scheduler has no delete of orphans: no cleanup call, no scheduler principal, no raw/ORM delete of daily stats',
    !/cleanupOrphanedCampaignStatsGlobal|deleteOwnedOrphaned|system-scheduler|skipped_orphan_fraction|maxOrphanFraction/.test(sched) && !/DELETE\s+FROM\s+daily_stats|dailyStat\.delete/i.test(sched) && !/\$executeRaw/.test(sched));
  check('…it reports counts and says plainly that nothing was deleted', /reportOrphanedCampaignStatsGlobal\(prisma\)/.test(sched) && /REPORT ONLY/.test(read('src/workers/backgroundScheduler.ts')));
  const plat = code(read('src/lib/platformOrphanCleanup.ts'));
  check('platformOrphanCleanup knows no scheduler principal: the only PlatformAuthorization is a platform admin', /export type PlatformAuthorization = \{ kind: 'platform-admin'/.test(plat) && !/system-scheduler/.test(plat));
  check('the global delete is ONE statement guarded by BOTH the batch digest and the row count', /b\.h = \$\{batchId\}/.test(plat) && /b\.n = \$\{expectedRows\}/.test(plat) && (plat.match(/DELETE FROM daily_stats/g) ?? []).length === 1);
  check('the removed global helpers are gone from every module', !walk(path.join(ROOT, 'src')).some((f) => /findGloballyOrphanedCampaignEntityIds|cleanupOrphanedCampaignStats\b/.test(code(readFileSync(f, 'utf8')))));

  // ── 2. the GET cannot delete; the POST authorises and is scoped ──────
  console.log('\n── 2. the data-health GET is read-only; deleting is a scoped, authorised POST ──');
  const getH = find('get', '/api/workspaces/:workspaceId/data-health');
  check('the data-health GET handler exists', !!getH);
  check('…and contains no delete, no cleanup call and no raw write', !!getH && !/deleteOwned|cleanupOrphaned|\.deleteMany\(|\.delete\(|\$executeRaw|\.update\(|\.create\(/.test(getH.text), getH?.text.match(/deleteOwned\w*|cleanupOrphaned\w*|\.delete\w*\(|\$executeRaw/g));
  check('…it only NOTES that cleanup was requested and performs none', !!getH && /cleanupRequested/.test(getH.text) && /performed:\s*false/.test(getH.text));
  const postH = find('post', '/api/workspaces/:workspaceId/data-health/cleanup');
  check('the workspace cleanup is a POST handler', !!postH);
  check('…it authenticates, proves membership, refuses VIEWER, and passes the WORKSPACE id to the scoped delete',
    !!postH && /getUserId\(/.test(postH.text) && /checkMember\(/.test(postH.text) && /role === 'VIEWER'/.test(postH.text) && /deleteOwnedOrphanedCampaignStats\(prisma,\s*workspaceId\)/.test(postH.text));
  const scopedCallers = hs.filter((h) => /deleteOwnedOrphanedCampaignStats/.test(h.text));
  check('deleteOwnedOrphanedCampaignStats is called from that one handler only', scopedCallers.length === 1 && scopedCallers[0]!.verb === 'post', scopedCallers.map((h) => `${h.verb} ${h.route}`));
  check('no GET handler anywhere deletes orphans', hs.filter((h) => h.verb === 'get').every((h) => !/deleteOwnedOrphanedCampaignStats|cleanupOrphanedCampaignStatsGlobal/.test(h.text)));

  // ── 3. nothing exports an orphan operation without a workspace ───────
  console.log('\n── 3. every tenant-facing orphan function takes a workspace id ──');
  const iso = code(read('src/lib/campaignDataIsolation.ts'));
  const exported = [...iso.matchAll(/export async function (\w*[Oo]rphan\w*)\(([^)]*)\)/g)].map((m) => ({ name: m[1]!, params: m[2]! }));
  check('campaignDataIsolation exports orphan functions', exported.length >= 2, exported.map((e) => e.name));
  check('…and every one of them takes workspaceId', exported.every((e) => /workspaceId/.test(e.params)), exported);
  check('ownership is VERIFIED by brain snapshots (written by the worker, outliving the campaign), and a foreign claim disqualifies', /campaign_brain_snapshots/.test(iso) && /workspace_id <>/.test(iso));
  check('recommendation_logs are NOT ownership evidence: their campaign_id is client-supplied (POST …/recommendations/action), so a member of B could veto or claim A\'s orphans with it', !/recommendation_logs|recommendationLog/.test(iso), iso.match(/recommendation_?[lL]ogs?/g));
  check('the delete is one statement guarded by NOT EXISTS (a campaign that reappears keeps its rows)', /DELETE FROM daily_stats d USING owned o/.test(iso) && /NOT EXISTS \(SELECT 1 FROM campaigns c WHERE c\.id = d\.entity_id\)/.test(iso));
  const mon = code(read('src/services/dataIntegrityMonitor.ts'));
  check('the integrity monitor uses only the OWNED finder and verifies the account belongs to the workspace',
    /findOwnedOrphanedCampaignEntityIds\(prisma,\s*workspaceId/.test(mon) && !/platformOrphanCleanup/.test(mon) && /adAccount\.findFirst\(\{\s*where:\s*\{\s*id:\s*account\.id,\s*workspaceId\s*\}/.test(mon));

  // ── 4. the page ──────────────────────────────────────────────────────
  console.log('\n── 4. the page no longer asks a GET to delete ──');
  const page = read('src/web/pages/campaignsPage.ts');
  check('no `data-health?cleanup=true` in the page', !/data-health\?cleanup=true/.test(page));
  check('the button POSTs to …/data-health/cleanup', /data-health\/cleanup',\s*\{\s*method:\s*'POST'\s*\}/.test(page));

  // ── 5. the approval logic, with a fake client that records every statement ──
  console.log('\n── 5. platform cleanup: explicit approval bound to the dry-run batch (fake client) ──');
  const P = await import('./src/lib/platformOrphanCleanup');
  const HEX = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const fake = (o: { total?: number; orphan_rows?: number; orphan_ids?: number; stmtN?: number; stmtH?: string; deleted?: number; serializationFailure?: boolean; failWith?: Error } = {}) => {
    const calls: string[] = [];
    const txOptions: unknown[] = [];
    const client = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const text = strings.join('?');
        if (/DELETE FROM/.test(text)) { calls.push('delete'); return [{ deleted: o.deleted ?? 0, n: o.stmtN ?? 0, h: o.stmtH ?? '' }]; }
        if (/set_config/.test(text)) { calls.push('set_config'); return [{}]; }
        calls.push('read');
        return [{ total: o.total ?? 100, orphan_rows: o.orphan_rows ?? 6, orphan_ids: o.orphan_ids ?? 2, batch_id: HEX }];
      },
      $executeRaw: async () => { calls.push('executeRaw'); return 0; },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
        calls.push('tx'); txOptions.push(opts);
        if (o.serializationFailure) throw Object.assign(new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction'), { code: 'P2034' });
        if (o.failWith) throw o.failWith;
        return fn(client);
      },
    } as unknown as import('@prisma/client').PrismaClient;
    return { client, calls, txOptions };
  };
  const admin = { kind: 'platform-admin', userId: 'u', email: 'a@x' } as const;
  let f = fake();
  let threw = 0;
  for (const bad of [undefined, null, {}, { kind: 'tenant' }, { kind: 'system-scheduler' }]) { try { await P.cleanupOrphanedCampaignStatsGlobal(f.client, bad as never, { expectedRows: 6, batchId: HEX }); } catch { threw++; } }
  check('anything that is not a platform-admin authorisation — the old scheduler principal included — is refused, with no query at all', threw === 5 && f.calls.length === 0, [threw, f.calls]);
  const badApprovals: unknown[] = [undefined, null, {}, { expectedRows: 6 }, { batchId: HEX }, { expectedRows: -1, batchId: HEX }, { expectedRows: 1.5, batchId: HEX }, { expectedRows: '6', batchId: HEX },
    { expectedRows: 6, batchId: 'a'.repeat(63) }, { expectedRows: 6, batchId: 'A'.repeat(64) }, { expectedRows: 6, batchId: 'g'.repeat(64) }, { expectedRows: 6, batchId: 5 }, { expectedRows: 6, batchId: HEX + 'a' }];
  threw = 0;
  for (const bad of badApprovals) { try { await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, bad as never); } catch { threw++; } }
  check('an approval without a plain integer expectedRows AND a 64-hex batchId is refused before any statement runs (13 malformed forms)', threw === badApprovals.length && f.calls.length === 0, [threw, f.calls]);

  f = fake({ stmtN: 6, stmtH: HEX, deleted: 6 });
  let r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('the approved batch (count and digest both equal): ONE delete statement, 6 rows', r.status === 'deleted' && r.rowsDeleted === 6 && f.calls.filter((c) => c === 'delete').length === 1, [r.status, f.calls]);
  f = fake({ stmtN: 7, stmtH: OTHER, deleted: 0 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('the orphan count moved since the dry run: nothing deleted, status says so, a fresh dry run is returned', r.status === 'skipped_expected_rows_mismatch' && r.rowsDeleted === 0 && 'current' in r && r.current.batchId === HEX, r.status);
  f = fake({ stmtN: 6, stmtH: OTHER, deleted: 0 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('SAME count, DIFFERENT rows (digest differs): nothing deleted — the approval names a batch, not a number', r.status === 'skipped_batch_mismatch' && r.rowsDeleted === 0, r.status);
  f = fake({ stmtN: 0, stmtH: OTHER, deleted: 0, orphan_rows: 0 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 0, batchId: HEX });
  check('"0 rows" approved against a batch that is not the empty one: nothing deleted', r.status === 'skipped_batch_mismatch' && r.rowsDeleted === 0, r.status);
  check('no code path issues a delete outside the guarded statement ($executeRaw is never used)', !f.calls.includes('executeRaw'));
  f = fake({ stmtN: 6, stmtH: HEX, deleted: 6 });
  await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('the approval runs in ONE REPEATABLE READ transaction (a row changed after the snapshot aborts the delete instead of being deleted) with a timeout above the 5 s default', f.calls[0] === 'tx' && f.txOptions.length === 1 && (f.txOptions[0] as { isolationLevel?: string }).isolationLevel === 'RepeatableRead' && Number((f.txOptions[0] as { timeout?: number }).timeout) >= 60_000, f.txOptions);
  f = fake({ serializationFailure: true });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('a serialization failure / write conflict (SQLSTATE 40001, P2034) during the statement → skipped_concurrent_change, nothing deleted, a fresh dry run returned', r.status === 'skipped_concurrent_change' && r.rowsDeleted === 0 && 'current' in r && r.current.batchId === HEX && !f.calls.includes('delete'), r.status);
  f = fake({ stmtN: 6, stmtH: HEX, deleted: 6 });
  await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('the statement is bounded INSIDE the transaction: a 10 s lock wait and a 600 s statement limit are set (set_config … is_local) before the first read or the delete', f.calls.join() === 'tx,set_config,read,delete' && P.APPROVAL_LOCK_TIMEOUT === '10s' && P.APPROVAL_STATEMENT_TIMEOUT === '600s', f.calls);
  f = fake({ failWith: Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' }) });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
  check('a lock timeout (55P03: a writer held a row of the batch) → skipped_concurrent_change, nothing deleted', r.status === 'skipped_concurrent_change' && r.rowsDeleted === 0 && !f.calls.includes('delete'), r.status);
  for (const [label, err] of [['statement_timeout (57014)', Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })], ['Prisma\'s own transaction timeout (P2028)', Object.assign(new Error('A commit cannot be executed on an expired transaction'), { code: 'P2028' })]] as Array<[string, Error]>) {
    f = fake({ failWith: err });
    r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX });
    check(`${label} → skipped_timeout (rolled back as a whole, nothing deleted), not a bare 500`, r.status === 'skipped_timeout' && r.rowsDeleted === 0 && !f.calls.includes('delete'), r.status);
  }
  check('the POST route answers a timeout with 503 and its own message (and logs the batch), not the 409 "batch changed" text', /skipped_timeout/.test(code(read('src/api/server.ts'))) && /503\)/.test(code(read('src/api/server.ts')).slice(code(read('src/api/server.ts')).indexOf("result.status === 'skipped_timeout'"), code(read('src/api/server.ts')).indexOf("result.status === 'skipped_timeout'") + 400)));
  const tooBig = [2_147_483_648, 3_000_000_000, Number.MAX_SAFE_INTEGER];
  threw = 0; f = fake();
  for (const n of tooBig) { try { await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: n, batchId: HEX }); } catch { threw++; } }
  check('expectedRows above int4 (2147483647) is refused before any statement runs — it can never be a real count, and used to reach Postgres as a 500', threw === tooBig.length && f.calls.length === 0 && P.MAX_EXPECTED_ROWS === 2_147_483_647, [threw, f.calls]);
  {
    let other: unknown = null; f = fake({ stmtN: 6, stmtH: HEX, deleted: 6, serializationFailure: false });
    (f.client as unknown as { $transaction: () => Promise<unknown> }).$transaction = async () => { throw new Error('connection terminated'); };
    try { await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6, batchId: HEX }); } catch (e) { other = e; }
    check('any OTHER database error is not swallowed as a "concurrent change" — it propagates', other instanceof Error && /connection terminated/.test(other.message), String(other));
  }
  check('the POST route bounds expectedRows by MAX_EXPECTED_ROWS (400, not a 500)', /MAX_EXPECTED_ROWS/.test(code(read('src/api/server.ts'))) && /Number\(rawRows\) <= MAX_EXPECTED_ROWS/.test(code(read('src/api/server.ts'))));
  const rep = await P.reportOrphanedCampaignStatsGlobal(fake({ total: 10, orphan_rows: 3, orphan_ids: 1 }).client);
  check('the scheduler report is aggregate only: no ids, no digest in its shape', JSON.stringify(Object.keys(rep).sort()) === JSON.stringify(['campaignStatRows', 'orphanCampaignIds', 'orphanFraction', 'orphanRows']), Object.keys(rep));
  check('…and its fraction is orphans / all campaign stats (an empty table is 0, not an emergency)', Math.abs(rep.orphanFraction - 0.3) < 1e-9 && (await P.reportOrphanedCampaignStatsGlobal(fake({ total: 0, orphan_rows: 0, orphan_ids: 0 }).client)).orphanFraction === 0);
  const dry = await P.describeOrphanBatchGlobal(fake().client);
  check('the dry run shows counts, the fraction and a 64-hex batchId — and no ids', /^[0-9a-f]{64}$/.test(dry.batchId) && JSON.stringify(Object.keys(dry).sort()) === JSON.stringify(['batchId', 'campaignStatRows', 'orphanCampaignIds', 'orphanFraction', 'orphanRows']), Object.keys(dry));
  check('the POST route demands BOTH numbers: expectedRows and batchId are parsed and the batch format is enforced', /ORPHAN_BATCH_ID_FORMAT/.test(code(read('src/api/server.ts'))) && /expectedRows === undefined \|\| batchId === undefined/.test(code(read('src/api/server.ts'))));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_data_health_isolation crashed:', e); process.exit(1); });
