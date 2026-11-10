// ═════════════════════════════════════════════════════════════════════════
//  test_data_health_isolation_postgres.ts — tenant A can neither SEE nor DELETE
//  tenant B's orphaned records, and GET data-health is read-only.
//
//  On a SYNTHETIC local Postgres (loopback, database adlytic_repro*); not part of
//  test:all (CI has no database); exits 2 — never green — if it cannot run:
//
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_dh \
//      npm run test:data-health-isolation-pg
//
//  It talks to the real Hono app over HTTP, so it also runs against the code
//  BEFORE the fix (where it is red). Orphan = a campaign daily_stat whose campaign
//  row no longer exists; its owner is only knowable from a record that outlives the
//  campaign AND that a tenant cannot write: campaign_brain_snapshots. (A
//  recommendation_log is NOT evidence: its campaign_id is client-supplied — see
//  section 6.) Orphan groups:
//    a1     named by A's brain snapshot only        b1  named by B's brain snapshot only
//    a3     named only by A's recommendation log    b2  named only by B's recommendation log
//    c1     named by A's AND B's brain snapshots (ambiguous)      u1  named by nobody
//    r1     named by A, but its campaign row exists again (not an orphan)
//    f1     like a1, and B's VIEWER forges a claim on it            f2  ownerless, B's VIEWER forges a claim
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env['PLATFORM_ADMIN_EMAILS'] = 'platform-admin@repro.invalid';
delete process.env['REDIS_URL'];

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
  const { PrismaClient, EntityType } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('./src/api/server');
  const { signToken } = await import('./src/services/jwtAuth');

  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: dbName, max: 10, connectionTimeoutMillis: 4000 });
  try { await pool.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic database:', (e as Error).message); process.exit(2); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);
  const sfx = Math.random().toString(36).slice(2, 8);
  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };

  const mkUser = async (label: string, email?: string) => {
    const existing = email ? await prisma.user.findUnique({ where: { email } }) : null;
    const u = existing ?? await prisma.user.create({ data: { email: email ?? `${label}-${sfx}@repro.invalid`, passwordHash: 'x', name: label, isActive: true } });
    return { u, token: signToken({ sub: u.id, email: u.email, ver: u.tokenVersion }) };
  };
  const mkTenant = async (label: string) => {
    const ws = await prisma.workspace.create({ data: { name: `Tenant ${label}` } });
    const owner = await mkUser(`${label}-owner`);
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.u.id, role: 'OWNER' } });
    const account = await prisma.adAccount.create({ data: { workspaceId: ws.id, externalAccountId: `act_${label}_${sfx}`, name: `Account ${label}`, currency: 'IQD', currencyMinorFactor: 1, timezone: 'UTC', metaAccountStatus: 1, lastSyncedAt: new Date() } });
    const live = await prisma.campaign.create({ data: { adAccountId: account.id, externalCampaignId: `live_${label}_${sfx}`, name: `Live ${label}` } });
    for (const d of [1, 2, 3]) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: live.id, date: day(d), spend: 100_000n, impressions: 10_000n, clicks: 200n } });
    return { ws, owner, account, live };
  };
  const A = await mkTenant('A');
  const B = await mkTenant('B');
  const aViewer = await mkUser('A-viewer');
  await prisma.workspaceMember.create({ data: { workspaceId: A.ws.id, userId: aViewer.u.id, role: 'VIEWER' } });
  const aManager = await mkUser('A-manager');
  await prisma.workspaceMember.create({ data: { workspaceId: A.ws.id, userId: aManager.u.id, role: 'MANAGER' } });
  const bViewer = await mkUser('B-viewer');
  await prisma.workspaceMember.create({ data: { workspaceId: B.ws.id, userId: bViewer.u.id, role: 'VIEWER' } });
  const admin = await mkUser('platform-admin', 'platform-admin@repro.invalid');

  const ID = { a1: `orph_a1_${sfx}`, a3: `orph_a3_${sfx}`, b1: `orph_b1_${sfx}`, b2: `orph_b2_${sfx}`, c1: `orph_c1_${sfx}`, u1: `orph_u1_${sfx}`, r1: `orph_r1_${sfx}`, f1: `orph_f1_${sfx}`, f2: `orph_f2_${sfx}`, w1: `orph_w1_${sfx}` };
  for (const id of Object.values(ID)) for (const d of (id === `orph_w1_${sfx}` ? [41, 42, 43] : [1, 2, 3])) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: id, date: day(d), spend: 50_000n, impressions: 5_000n, clicks: 50n } });
  const brain = (ws: string, cid: string, tick = 1) => prisma.campaignBrainSnapshot.create({ data: { workspaceId: ws, campaignId: cid, externalCampaignId: `x_${cid}`, tickDate: day(tick), action: 'KEEP', priority: 'NORMAL', patternSignature: 'SYNTHETIC', finalScore: 50, payload: {} } });
  const reco = (ws: string, cid: string) => prisma.recommendationLog.create({ data: { workspaceId: ws, campaignId: cid, verdict: 'synthetic', metricsSnapshot: {} } });
  await brain(A.ws.id, ID.a1);
  await reco(A.ws.id, ID.a3);                              // a recommendation log is not ownership evidence (section 6)
  await brain(B.ws.id, ID.b1);
  await reco(B.ws.id, ID.b2);
  const c1BrainA = await brain(A.ws.id, ID.c1); await brain(B.ws.id, ID.c1, 2);   // named by BOTH workspaces' brain
  // u1: named by nobody
  await brain(A.ws.id, ID.r1);
  await brain(A.ws.id, ID.f1);                             // f1: A's, and B is about to forge a claim on it (section 2b)
  await brain(A.ws.id, ID.w1);                             // w1: A's, but its only stats are older than the 30-day data-health window
  await prisma.campaign.create({ data: { id: ID.r1, adAccountId: A.account.id, externalCampaignId: `reborn_${sfx}`, name: 'Reborn' } }); // r1's campaign exists again

  const name = (id: string) => Object.entries(ID).find(([, v]) => v === id)?.[0] ?? id;
  const quiet = async <T,>(fn: () => Promise<T>): Promise<T> => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };
  const req = (method: 'GET' | 'POST', path: string, token?: string, body?: unknown) => quiet(async () => {
    const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
    const init: RequestInit = { method, headers };
    if (body !== undefined) { init.body = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const r = await app.request(path, init);
    return { status: r.status, body: await r.json().catch(() => null) as any, text: '' };
  });
  const rowsOf = async () => { const o: Record<string, number> = {}; for (const [k, id] of Object.entries(ID)) o[k] = await prisma.dailyStat.count({ where: { entityType: EntityType.CAMPAIGN, entityId: id } }); o['liveA'] = await prisma.dailyStat.count({ where: { entityId: A.live.id } }); o['liveB'] = await prisma.dailyStat.count({ where: { entityId: B.live.id } }); return o; };
  const xmins = async () => JSON.stringify(await prisma.$queryRaw`SELECT id, xmin::text AS x FROM daily_stats WHERE entity_id = ANY(${[...Object.values(ID), A.live.id, B.live.id]}) ORDER BY id`);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const seen = (b: any) => ((b?.orphanedCampaignIds ?? []) as string[]).map(name).sort();

  // ── 1. what each tenant can SEE ──────────────────────────────────────
  console.log('\n── 1. each tenant sees only the orphans it verifiably owns ──');
  const aRead = await req('GET', `/api/workspaces/${A.ws.id}/data-health`, aViewer.token);
  const bRead = await req('GET', `/api/workspaces/${B.ws.id}/data-health`, B.owner.token);
  check('A (a VIEWER) lists exactly its own verified orphans: a1 and f1 (named by one workspace\'s brain: A)', same(seen(aRead.body), ['a1', 'f1']), seen(aRead.body));
  check('A\'s count is 2 — it does not include anybody else\'s orphans', aRead.body?.orphanedCount === 2, aRead.body?.orphanedCount);
  check('B lists exactly b1, count 1', same(seen(bRead.body), ['b1']) && bRead.body?.orphanedCount === 1, [seen(bRead.body), bRead.body?.orphanedCount]);
  check('c1 (named by two workspaces), u1 (named by nobody) and a3/b2 (named only by a recommendation log) are verified for NOBODY', ![...seen(aRead.body), ...seen(bRead.body)].some((k) => ['c1', 'u1', 'a3', 'b2'].includes(k)), [seen(aRead.body), seen(bRead.body)]);
  check('r1 (its campaign exists again) is not an orphan for anyone', ![...seen(aRead.body), ...seen(bRead.body)].includes('r1'));
  check('w1 (A\'s, but its only stats are 41-43 days old) is outside the 30-day data-health window: not listed', !seen(aRead.body).includes('w1'), seen(aRead.body));
  const cross = await req('GET', `/api/workspaces/${A.ws.id}/data-health`, B.owner.token);
  check('B\'s owner cannot read A\'s data-health at all (403)', cross.status === 403, cross.status);

  // ── 2. GET is read-only, whatever the query string says ──────────────
  console.log('\n── 2. GET …/data-health?cleanup=true deletes nothing ──');
  const x0 = await xmins(); const r0 = await rowsOf();
  const aClean = await req('GET', `/api/workspaces/${A.ws.id}/data-health?cleanup=true`, aViewer.token);
  const bClean = await req('GET', `/api/workspaces/${B.ws.id}/data-health?cleanup=true`, B.owner.token);
  check('both answer 200 and say nothing was done (orphanedRowsDeleted 0, cleanup.performed false)', aClean.status === 200 && aClean.body?.orphanedRowsDeleted === 0 && aClean.body?.cleanup?.performed === false && bClean.body?.cleanup?.performed === false, [aClean.body?.orphanedRowsDeleted, aClean.body?.cleanup]);
  check('every orphan row and every live row is untouched (row counts)', same(r0, await rowsOf()), await rowsOf());
  check('database-level proof: no row got a new version (xmin unchanged), not even a no-op update', x0 === (await xmins()));

  // ── 2b. a member of B cannot veto or claim A's orphans by writing recommendation logs ──
  console.log('\n── 2b. forged ownership claims (POST …/recommendations/action takes a client-supplied campaignId) ──');
  const forge = async (cid: string) => req('POST', `/api/workspaces/${B.ws.id}/recommendations/action`, bViewer.token, { action: 'IGNORED', itemKey: `forge:${cid}`, campaignId: cid });
  const fr1 = await forge(ID.f1); const fr2 = await forge(ID.f2); const fr3 = await forge(ID.a1);
  check('the forged claims are accepted as ordinary dashboard actions (the route does not validate campaignId — a known, documented residual)', fr1.status === 200 && fr2.status === 200 && fr3.status === 200, [fr1.status, fr2.status, fr3.status]);
  check('B\'s recommendation_logs now really name A\'s orphan ids', (await prisma.recommendationLog.count({ where: { workspaceId: B.ws.id, campaignId: { in: [ID.f1, ID.f2, ID.a1] } } })) === 3);
  const aAfterForge = await req('GET', `/api/workspaces/${A.ws.id}/data-health`, aViewer.token);
  const bAfterForge = await req('GET', `/api/workspaces/${B.ws.id}/data-health`, B.owner.token);
  check('VETO: A still sees a1 and f1 — a log written by B does not make them ambiguous', same(seen(aAfterForge.body), ['a1', 'f1']), seen(aAfterForge.body));
  check('CLAIM: B does not see the ownerless f2 it named, nor A\'s f1 / a1 — a log written by B does not make anything B\'s', same(seen(bAfterForge.body), ['b1']), seen(bAfterForge.body));
  const bTryCleanup = await req('POST', `/api/workspaces/${B.ws.id}/data-health/cleanup`, B.owner.token);
  const rForge = await rowsOf();
  check('B\'s owner cleanup (the "steal" attempt) deletes only B\'s own b1 — A\'s f1 / a1 and the ownerless f2 are untouched', bTryCleanup.body?.orphanedRowsDeleted === 3 && rForge['b1'] === 0 && rForge['f1'] === 3 && rForge['f2'] === 3 && rForge['a1'] === 3, [bTryCleanup.body, rForge]);
  const r0b = await rowsOf();

  // ── 3. deleting: POST, role, scope ───────────────────────────────────
  console.log('\n── 3. POST …/data-health/cleanup ──');
  const noTok = await req('POST', `/api/workspaces/${A.ws.id}/data-health/cleanup`);
  const viewerPost = await req('POST', `/api/workspaces/${A.ws.id}/data-health/cleanup`, aViewer.token);
  const outsiderPost = await req('POST', `/api/workspaces/${A.ws.id}/data-health/cleanup`, B.owner.token);
  check('no token → 401; VIEWER → 403; another tenant\'s owner → 403', noTok.status === 401 && viewerPost.status === 403 && outsiderPost.status === 403, [noTok.status, viewerPost.status, outsiderPost.status]);
  check('…and none of those deleted anything', same(r0b, await rowsOf()));
  const aOwnerPost = await req('POST', `/api/workspaces/${A.ws.id}/data-health/cleanup`, aManager.token);
  const r1 = await rowsOf();
  check('A\'s MANAGER (not only the OWNER) may clean: 200 and exactly A\'s verified orphans go (a1 + f1 + w1 = 9 rows; w1\'s stats are older than the data-health window, which the POST does not apply)', aOwnerPost.status === 200 && aOwnerPost.body?.orphanedRowsDeleted === 9 && r1['a1'] === 0 && r1['f1'] === 0 && r1['w1'] === 0, [aOwnerPost.status, aOwnerPost.body, r1]);
  check('a3/b2 (log-only claims), B\'s b1 is already gone, the ambiguous c1, the unattributed u1 and the forged-claim f2, the reborn r1 and every live campaign are untouched', r1['a3'] === 3 && r1['b2'] === 3 && r1['c1'] === 3 && r1['u1'] === 3 && r1['f2'] === 3 && r1['r1'] === 3 && r1['liveA'] === 3 && r1['liveB'] === 3, r1);
  const replay = await req('POST', `/api/workspaces/${A.ws.id}/data-health/cleanup`, A.owner.token);
  check('replay deletes nothing', replay.body?.orphanedRowsDeleted === 0, replay.body);

  // ownership is decided by the records, live: remove A's claim on c1 and it becomes B's alone
  await prisma.campaignBrainSnapshot.delete({ where: { id: c1BrainA.id } });
  const bAfter = await req('GET', `/api/workspaces/${B.ws.id}/data-health`, B.owner.token);
  const aAfter = await req('GET', `/api/workspaces/${A.ws.id}/data-health`, aViewer.token);
  check('once only B\'s brain names c1 it is B\'s (verified); A still never sees it', same(seen(bAfter.body), ['c1']) && seen(aAfter.body).length === 0, [seen(bAfter.body), seen(aAfter.body)]);
  const bOwnerPost = await req('POST', `/api/workspaces/${B.ws.id}/data-health/cleanup`, B.owner.token);
  const r2 = await rowsOf();
  check('B\'s owner deletes c1 (3 rows) — and still not b2/a3 (log-only), the unattributed u1 or the forged-claim f2', bOwnerPost.body?.orphanedRowsDeleted === 3 && r2['c1'] === 0 && r2['b2'] === 3 && r2['a3'] === 3 && r2['u1'] === 3 && r2['f2'] === 3, [bOwnerPost.body, r2]);

  // a workspace with no ad account: the route answers 404 and deletes nothing, even if a brain snapshot names orphans
  const C = await prisma.workspace.create({ data: { name: 'Tenant C (no ad account)' } });
  const cOwner = await mkUser('C-owner');
  await prisma.workspaceMember.create({ data: { workspaceId: C.id, userId: cOwner.u.id, role: 'OWNER' } });
  const oc = `orph_c_noacct_${sfx}`;
  for (const d of [1, 2, 3]) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: oc, date: day(d), spend: 1n } });
  await brain(C.id, oc);
  const noAcct = await req('POST', `/api/workspaces/${C.id}/data-health/cleanup`, cOwner.token);
  check('no ad account linked → 404 and C\'s orphan rows are untouched', noAcct.status === 404 && (await prisma.dailyStat.count({ where: { entityId: oc } })) === 3, [noAcct.status]);
  await prisma.dailyStat.deleteMany({ where: { entityId: oc } });
  // data-health window: w1 (A's, stats only 41-43 days old) was not listed above — see section 1 — and the platform report below counts what is left

  // ── 4. the GLOBAL cleanup is platform-only ───────────────────────────
  console.log('\n── 4. global orphan cleanup needs platform authorization ──');
  const g0 = await req('GET', '/api/admin/data-health/orphans');
  const g1 = await req('GET', '/api/admin/data-health/orphans', A.owner.token);
  const p0 = await req('POST', '/api/admin/data-health/orphans/cleanup?expectedRows=1');
  const p1 = await req('POST', '/api/admin/data-health/orphans/cleanup?expectedRows=1', A.owner.token);
  check('no token → 401, a tenant owner → 403, on both the report and the cleanup', g0.status === 401 && g1.status === 403 && p0.status === 401 && p1.status === 403, [g0.status, g1.status, p0.status, p1.status]);
  check('…and the unattributed u1 is still there', (await rowsOf())['u1'] === 3);
  const gAdmin = await req('GET', '/api/admin/data-health/orphans', admin.token);
  check('the platform report is aggregate only: counts, never an id', gAdmin.status === 200 && typeof gAdmin.body?.orphanRows === 'number' && gAdmin.body.orphanRows >= 3 && !JSON.stringify(gAdmin.body).includes('orph_'), gAdmin.body);
  const noExpected = await req('POST', '/api/admin/data-health/orphans/cleanup', admin.token);
  const wrong = await req('POST', `/api/admin/data-health/orphans/cleanup?expectedRows=${gAdmin.body.orphanRows + 1}`, admin.token);
  check('the admin must quote the row count they saw: missing → 400, a different number → 409; nothing deleted either time', noExpected.status === 400 && wrong.status === 409 && (await rowsOf())['u1'] === 3, [noExpected.status, wrong.status]);
  const right = await req('POST', `/api/admin/data-health/orphans/cleanup?expectedRows=${gAdmin.body.orphanRows}`, admin.token);
  const r3 = await rowsOf();
  check('with the right number the platform admin deletes every orphan, including the unattributed u1, the log-only a3/b2 and the forged-claim f2', right.status === 200 && right.body?.status === 'deleted' && right.body?.rowsDeleted === gAdmin.body.orphanRows && r3['u1'] === 0 && r3['a3'] === 0 && r3['b2'] === 0 && r3['f2'] === 0, [right.body, r3]);
  check('live campaigns, the reborn r1 and everything else that is not an orphan survive the global delete', r3['r1'] === 3 && r3['liveA'] === 3 && r3['liveB'] === 3, r3);

  // ── 5. the scheduler's guard ─────────────────────────────────────────
  console.log('\n── 5. the scheduler refuses an implausible orphan share ──');
  const P = await import('./src/lib/platformOrphanCleanup');
  for (const d of [1, 2, 3]) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: `orph_s1_${sfx}`, date: day(d), spend: 1n } });
  const cnt = await P.countOrphanedCampaignStatsGlobal(prisma);
  const f = cnt.orphanRows / cnt.campaignStatRows;
  const refused = await P.cleanupOrphanedCampaignStatsGlobal(prisma, { kind: 'system-scheduler' }, { maxOrphanFraction: f / 2 });
  const stillThere = await prisma.dailyStat.count({ where: { entityId: `orph_s1_${sfx}` } });
  check('orphans above the allowed share (a partly restored database): REFUSED, nothing deleted', refused.status === 'skipped_orphan_fraction' && stillThere === 3, [refused.status, f]);
  const ok = await P.cleanupOrphanedCampaignStatsGlobal(prisma, { kind: 'system-scheduler' }, { maxOrphanFraction: 1 });
  check('within the allowed share it deletes them', ok.status === 'deleted' && ok.rowsDeleted >= 3 && (await prisma.dailyStat.count({ where: { entityId: `orph_s1_${sfx}` } })) === 0, ok);
  let threw = false; try { await P.cleanupOrphanedCampaignStatsGlobal(prisma, undefined as never); } catch { threw = true; }
  check('without a PlatformAuthorization the function refuses to run', threw);

  console.log(`\n${pass} passed, ${fail} failed   (database: ${dbName})`);
  await prisma.$disconnect(); await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_data_health_isolation_postgres crashed:', e); process.exit(1); });
