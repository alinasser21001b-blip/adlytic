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
//    5. the scheduler / admin guard logic, with a fake client that records writes;
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
  const importers = walk(path.join(ROOT, 'src'))
    .filter((f) => /from\s+['"][^'"]*\/platformOrphanCleanup['"]/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, '/')).sort();
  check('only server.ts (platform-admin routes) and the scheduler import platformOrphanCleanup', JSON.stringify(importers) === JSON.stringify(['src/api/server.ts', 'src/workers/backgroundScheduler.ts']), importers);
  const globalCallers = hs.filter((h) => /cleanupOrphanedCampaignStatsGlobal|countOrphanedCampaignStatsGlobal/.test(h.text));
  check('inside server.ts the global functions appear ONLY in /api/admin/ handlers', globalCallers.length === 2 && globalCallers.every((h) => h.route.startsWith('/api/admin/')), globalCallers.map((h) => `${h.verb} ${h.route}`));
  check('every one of those handlers demands a platform administrator (requirePlatformAdmin)', globalCallers.every((h) => /requirePlatformAdmin\(/.test(h.text)));
  check('and the only delete among them is a POST', globalCallers.filter((h) => /cleanupOrphanedCampaignStatsGlobal/.test(h.text)).every((h) => h.verb === 'post'));
  const sched = code(read('src/workers/backgroundScheduler.ts'));
  check('the scheduler acts as the platform explicitly: { kind: \'system-scheduler\' }, and handles the refusal', /cleanupOrphanedCampaignStatsGlobal\(prisma,\s*\{\s*kind:\s*'system-scheduler'\s*\}\)/.test(sched) && /skipped_orphan_fraction/.test(sched));
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
  check('ownership is VERIFIED by records that outlive the campaign, and a foreign claim disqualifies', /campaign_brain_snapshots/.test(iso) && /recommendation_logs/.test(iso) && /workspace_id <>/.test(iso));
  check('the delete is one statement guarded by NOT EXISTS (a campaign that reappears keeps its rows)', /DELETE FROM daily_stats d USING owned o/.test(iso) && /NOT EXISTS \(SELECT 1 FROM campaigns c WHERE c\.id = d\.entity_id\)/.test(iso));
  const mon = code(read('src/services/dataIntegrityMonitor.ts'));
  check('the integrity monitor uses only the OWNED finder and verifies the account belongs to the workspace',
    /findOwnedOrphanedCampaignEntityIds\(prisma,\s*workspaceId/.test(mon) && !/platformOrphanCleanup/.test(mon) && /adAccount\.findFirst\(\{\s*where:\s*\{\s*id:\s*account\.id,\s*workspaceId\s*\}/.test(mon));

  // ── 4. the page ──────────────────────────────────────────────────────
  console.log('\n── 4. the page no longer asks a GET to delete ──');
  const page = read('src/web/pages/campaignsPage.ts');
  check('no `data-health?cleanup=true` in the page', !/data-health\?cleanup=true/.test(page));
  check('the button POSTs to …/data-health/cleanup', /data-health\/cleanup',\s*\{\s*method:\s*'POST'\s*\}/.test(page));

  // ── 5. the guard logic, with a fake client that records writes ───────
  console.log('\n── 5. platform cleanup guards (fake client) ──');
  const P = await import('./src/lib/platformOrphanCleanup');
  const fake = (counts: { total: number; orphan_rows: number; orphan_ids: number }) => {
    const writes: string[] = [];
    const client = {
      $queryRaw: async () => [counts],
      $executeRaw: async () => { writes.push('delete'); return counts.orphan_rows; },
    } as unknown as import('@prisma/client').PrismaClient;
    return { client, writes };
  };
  const admin = { kind: 'platform-admin', userId: 'u', email: 'a@x' } as const;
  let f = fake({ total: 100, orphan_rows: 6, orphan_ids: 2 });
  let r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin);
  check('admin without expectedRows: nothing is deleted', r.status === 'skipped_expected_rows_mismatch' && f.writes.length === 0, r.status);
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 5 });
  check('admin with a stale number: nothing is deleted', r.status === 'skipped_expected_rows_mismatch' && f.writes.length === 0, r.status);
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, admin, { expectedRows: 6 });
  check('admin with the right number: exactly one delete statement', r.status === 'deleted' && f.writes.length === 1 && r.rowsDeleted === 6, [r.status, f.writes]);
  f = fake({ total: 100, orphan_rows: 90, orphan_ids: 9 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, { kind: 'system-scheduler' });
  check('scheduler, 90% of campaign stats "orphaned" (a restored database with a missing campaigns table): REFUSED', r.status === 'skipped_orphan_fraction' && f.writes.length === 0, r);
  f = fake({ total: 1000, orphan_rows: 50, orphan_ids: 5 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, { kind: 'system-scheduler' });
  check('scheduler, 5%: deletes', r.status === 'deleted' && f.writes.length === 1, r.status);
  f = fake({ total: 1000, orphan_rows: 0, orphan_ids: 0 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, { kind: 'system-scheduler' });
  check('no orphans: no delete statement at all', r.status === 'deleted' && f.writes.length === 0);
  f = fake({ total: 0, orphan_rows: 0, orphan_ids: 0 });
  r = await P.cleanupOrphanedCampaignStatsGlobal(f.client, { kind: 'system-scheduler' });
  check('an empty table is not an "all orphaned" emergency and not a delete', f.writes.length === 0);
  let threw = 0;
  for (const bad of [undefined, null, {}, { kind: 'tenant' }]) { try { await P.cleanupOrphanedCampaignStatsGlobal(f.client, bad as never); } catch { threw++; } }
  check('anything that is not a PlatformAuthorization is refused', threw === 4, threw);
  const counted = await P.countOrphanedCampaignStatsGlobal(fake({ total: 10, orphan_rows: 3, orphan_ids: 1 }).client);
  check('the platform count is aggregate only: no ids in its shape', JSON.stringify(Object.keys(counted).sort()) === JSON.stringify(['campaignStatRows', 'orphanCampaignIds', 'orphanRows']), Object.keys(counted));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_data_health_isolation crashed:', e); process.exit(1); });
