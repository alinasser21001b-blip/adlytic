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
//  section 6.) The platform cleanup is an explicit dry run + approval bound to the exact
//  batch (section 4), and the scheduler only reports (section 5). Orphan groups:
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
  // rows of other entity types that merely share an orphan's entity_id must never be touched by a campaign cleanup
  for (const t of ['ACCOUNT', 'AD_SET', 'AD'] as const) await prisma.dailyStat.create({ data: { entityType: EntityType[t], entityId: ID.a1, date: day(5), spend: 7n } });
  await brain(A.ws.id, ID.w1);                             // w1: A's, but its only stats are older than the 30-day data-health window
  await prisma.campaign.create({ data: { id: ID.r1, adAccountId: A.account.id, externalCampaignId: `reborn_${sfx}`, name: 'Reborn' } }); // r1's campaign exists again

  const name = (id: string) => Object.entries(ID).find(([, v]) => v === id)?.[0] ?? id;
  // re-entrant: two concurrent requests must not leave console.log swapped out (the first version restored the NOOP and swallowed every later line)
  let quietDepth = 0; let realLog = console.log;
  const quiet = async <T,>(fn: () => Promise<T>): Promise<T> => { if (quietDepth++ === 0) { realLog = console.log; console.log = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) console.log = realLog; } };
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

  // the integrity monitor itself refuses an account that is not the workspace's (defence in depth behind the route)
  const { runDataIntegrityCheck } = await import('./src/services/dataIntegrityMonitor');
  let mismatch = false; try { await quiet(() => runDataIntegrityCheck(prisma, B.ws.id, A.account)); } catch { mismatch = true; }
  const matched = await quiet(() => runDataIntegrityCheck(prisma, A.ws.id, A.account)).then(() => true, () => false);
  check('runDataIntegrityCheck(B\'s workspace, A\'s account) throws; with A\'s own workspace it runs', mismatch && matched, [mismatch, matched]);

  // ── 2b. a member of B cannot veto or claim A's orphans by writing recommendation logs ──
  console.log('\n── 2b. forged ownership claims (rows that name a campaign the workspace does not own) ──');
  // POST …/recommendations/action used to store a client-supplied campaignId unchecked. It no longer does
  // (test_recommendation_write_auth_postgres.ts), and a VIEWER may not call it at all. Databases that ran the
  // old route still HOLD such rows, so the ownership rule must keep ignoring them: they are inserted directly.
  const forge = async (cid: string) => req('POST', `/api/workspaces/${B.ws.id}/recommendations/action`, bViewer.token, { action: 'IGNORED', itemKey: `forge:${cid}`, campaignId: cid });
  const fr1 = await forge(ID.f1); const fr2 = await forge(ID.f2); const fr3 = await forge(ID.a1);
  check('the forged claims are now REFUSED at the route (B\'s VIEWER → 403) and write nothing', fr1.status === 403 && fr2.status === 403 && fr3.status === 403 && (await prisma.recommendationLog.count({ where: { workspaceId: B.ws.id, campaignId: { in: [ID.f1, ID.f2, ID.a1] } } })) === 0, [fr1.status, fr2.status, fr3.status]);
  for (const cid of [ID.f1, ID.f2, ID.a1]) await reco(B.ws.id, cid);   // legacy rows, as the old route would have left them
  check('B\'s recommendation_logs (legacy rows) really name A\'s orphan ids', (await prisma.recommendationLog.count({ where: { workspaceId: B.ws.id, campaignId: { in: [ID.f1, ID.f2, ID.a1] } } })) === 3);
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
  check('only entity_type CAMPAIGN rows go: ACCOUNT / AD_SET / AD rows that share a1\'s entity_id are still there', (await prisma.dailyStat.count({ where: { entityId: ID.a1, entityType: { not: EntityType.CAMPAIGN } } })) === 3);
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

  // ── 4. the GLOBAL cleanup is platform-only, explicit, and bound to the dry-run batch ──
  console.log('\n── 4. global orphan cleanup: platform authorization + approval bound to the exact dry-run batch ──');
  const HEXZ = '0'.repeat(64);
  const g0 = await req('GET', '/api/admin/data-health/orphans');
  const g1 = await req('GET', '/api/admin/data-health/orphans', A.owner.token);
  const p0 = await req('POST', `/api/admin/data-health/orphans/cleanup?expectedRows=1&batchId=${HEXZ}`);
  const p1 = await req('POST', `/api/admin/data-health/orphans/cleanup?expectedRows=1&batchId=${HEXZ}`, A.owner.token);
  check('no token → 401, a tenant owner → 403, on both the dry run and the cleanup', g0.status === 401 && g1.status === 403 && p0.status === 401 && p1.status === 403, [g0.status, g1.status, p0.status, p1.status]);
  check('…and the unattributed u1 is still there', (await rowsOf())['u1'] === 3);
  const dry = async () => (await req('GET', '/api/admin/data-health/orphans', admin.token));
  const gAdmin = await dry();
  check('the dry run is aggregate only — counts, the share, a 64-hex batchId, never an id', gAdmin.status === 200 && gAdmin.body?.mode === 'dry-run' && typeof gAdmin.body?.orphanRows === 'number' && gAdmin.body.orphanRows >= 3 && /^[0-9a-f]{64}$/.test(gAdmin.body?.batchId ?? '') && typeof gAdmin.body?.orphanFraction === 'number' && !JSON.stringify(gAdmin.body).includes('orph_'), gAdmin.body);
  check('the dry run is READ-ONLY and repeatable: the same rows give the same batchId', (await dry()).body?.batchId === gAdmin.body.batchId);
  const post = (q: string) => req('POST', `/api/admin/data-health/orphans/cleanup${q}`, admin.token);
  const badForms: Array<[string, number]> = [];
  for (const q of [
    '', `?expectedRows=${gAdmin.body.orphanRows}`, `?batchId=${gAdmin.body.batchId}`,
    ...['abc', '1e3', '-1', '1.5', '', '%20', '0x10'].map((bad) => `?expectedRows=${bad}&batchId=${gAdmin.body.batchId}`),
    ...['', 'abc', gAdmin.body.batchId.slice(1), gAdmin.body.batchId.toUpperCase(), gAdmin.body.batchId + '0', 'g'.repeat(64), '%20'].map((bad) => `?expectedRows=${gAdmin.body.orphanRows}&batchId=${bad}`),
  ]) badForms.push([q, (await post(q)).status]);
  check('an approval lacking either number, or with a malformed expectedRows / batchId (17 forms) → 400, nothing deleted', badForms.every(([, st]) => st === 400) && (await rowsOf())['u1'] === 3, badForms.filter(([, st]) => st !== 400));
  const wrongRows = await post(`?expectedRows=${gAdmin.body.orphanRows + 1}&batchId=${gAdmin.body.batchId}`);
  check('the right batch id but a different row count → 409 skipped_expected_rows_mismatch, nothing deleted', wrongRows.status === 409 && wrongRows.body?.status === 'skipped_expected_rows_mismatch' && wrongRows.body?.rowsDeleted === 0 && (await rowsOf())['u1'] === 3, [wrongRows.status, wrongRows.body?.status]);
  const flipped = gAdmin.body.batchId.slice(0, 63) + (gAdmin.body.batchId.endsWith('0') ? '1' : '0');
  const wrongBatch = await post(`?expectedRows=${gAdmin.body.orphanRows}&batchId=${flipped}`);
  check('the right row count but a different batch id → 409 skipped_batch_mismatch, nothing deleted, and the answer is a fresh dry run', wrongBatch.status === 409 && wrongBatch.body?.status === 'skipped_batch_mismatch' && wrongBatch.body?.rowsDeleted === 0 && wrongBatch.body?.current?.batchId === gAdmin.body.batchId && (await rowsOf())['u1'] === 3, [wrongBatch.status, wrongBatch.body?.status]);

  // The approval names a BATCH, not a number: swap one orphan row for a different one — same count, different rows.
  const victim = await prisma.dailyStat.findFirstOrThrow({ where: { entityType: EntityType.CAMPAIGN, entityId: ID.u1 }, orderBy: { date: 'asc' } });
  await prisma.dailyStat.delete({ where: { id: victim.id } });
  await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: `orph_swap_${sfx}`, date: day(9), spend: 3n } });
  const swapped = await dry();
  const beforeSwapRows = await rowsOf();
  check('(setup) one orphan row replaced by another: the count is UNCHANGED but the batchId differs', swapped.body.orphanRows === gAdmin.body.orphanRows && swapped.body.batchId !== gAdmin.body.batchId, [swapped.body.orphanRows, gAdmin.body.orphanRows]);
  const sameCountOldBatch = await post(`?expectedRows=${gAdmin.body.orphanRows}&batchId=${gAdmin.body.batchId}`);
  const afterSwapRows = await rowsOf();
  check('approving the OLD batch with the SAME count deletes NOTHING (409): a number alone cannot authorise different rows', sameCountOldBatch.status === 409 && sameCountOldBatch.body?.status === 'skipped_batch_mismatch' && JSON.stringify(beforeSwapRows) === JSON.stringify(afterSwapRows) && (await prisma.dailyStat.count({ where: { entityId: `orph_swap_${sfx}` } })) === 1, [sameCountOldBatch.status, sameCountOldBatch.body?.status]);

  // A row that becomes an orphan after the dry run changes the batch.
  const g2 = await dry();
  await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: `orph_late_${sfx}`, date: day(8), spend: 3n } });
  const lateOld = await post(`?expectedRows=${g2.body.orphanRows}&batchId=${g2.body.batchId}`);
  check('an orphan that appeared after the dry run → the approved batch no longer exists: 409, nothing deleted', lateOld.status === 409 && (await prisma.dailyStat.count({ where: { entityId: `orph_late_${sfx}` } })) === 1 && (await rowsOf())['a3'] === 3, [lateOld.status, lateOld.body?.status]);

  // Rows committed AFTER the statement's snapshot are not part of the approved batch and survive.
  const g3 = await dry();
  let racedStatus = 0;
  await prisma.$transaction(async (tx) => {
    await tx.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: `orph_race_${sfx}`, date: day(7), spend: 3n } }); // uncommitted: invisible to the POST's snapshot
    racedStatus = (await post(`?expectedRows=${g3.body.orphanRows}&batchId=${g3.body.batchId}`)).status;
  });
  const afterRace = await rowsOf();
  check('the approved batch is deleted in full (200) while an orphan committed after its snapshot is NOT in the batch and survives', racedStatus === 200 && afterRace['u1'] === 0 && (await prisma.dailyStat.count({ where: { entityId: `orph_race_${sfx}` } })) === 1 && (await prisma.dailyStat.count({ where: { entityId: `orph_swap_${sfx}` } })) === 0 && (await prisma.dailyStat.count({ where: { entityId: `orph_late_${sfx}` } })) === 0 && afterRace['a3'] === 0 && afterRace['b2'] === 0 && afterRace['f2'] === 0, [racedStatus, afterRace]);
  check('live campaigns, the reborn r1 and everything else that is not an orphan survive the global delete', afterRace['r1'] === 3 && afterRace['liveA'] === 3 && afterRace['liveB'] === 3, afterRace);
  const replayed = await post(`?expectedRows=${g3.body.orphanRows}&batchId=${g3.body.batchId}`);
  check('an approval is single-use: replaying it → 409, nothing deleted (the late orphan survives)', replayed.status === 409 && (await prisma.dailyStat.count({ where: { entityId: `orph_race_${sfx}` } })) === 1, [replay.status]);
  const g4 = await dry();
  const final = await post(`?expectedRows=${g4.body.orphanRows}&batchId=${g4.body.batchId}`);
  check('a fresh dry run approved: 200 deleted, exactly the rows the dry run counted, and the table has no orphans left', final.status === 200 && final.body?.status === 'deleted' && final.body?.rowsDeleted === g4.body.orphanRows && (await dry()).body.orphanRows === 0, [final.status, final.body]);

  // The digest must not be fooled by an id that contains the separator: {"a,b","c"} and {"a","b,c"} concatenate alike.
  let ambDay = 20;
  const mk = (id: string) => prisma.dailyStat.create({ data: { id, entityType: EntityType.CAMPAIGN, entityId: `orph_amb_${sfx}`, date: day(ambDay++), spend: 1n } });   // the DIGEST is over row ids
  const ambIds = [`amb_a_${sfx},amb_b_${sfx}`, `amb_c_${sfx}`, `amb_a_${sfx}`, `amb_b_${sfx},amb_c_${sfx}`];
  await mk(ambIds[0]!); await mk(ambIds[1]!);
  const ambDry1 = await dry();
  await prisma.dailyStat.deleteMany({ where: { id: { in: [ambIds[0]!, ambIds[1]!] } } });
  await mk(ambIds[2]!); await mk(ambIds[3]!);
  const ambDry2 = await dry();
  check('two different orphan sets whose ids concatenate identically ("a,b"+"c" vs "a"+"b,c") get DIFFERENT batch ids (ids are length-prefixed)', ambDry1.body.orphanRows === ambDry2.body.orphanRows && ambDry1.body.batchId !== ambDry2.body.batchId, [ambDry1.body.batchId.slice(0, 12), ambDry2.body.batchId.slice(0, 12)]);
  const ambOld = await post(`?expectedRows=${ambDry1.body.orphanRows}&batchId=${ambDry1.body.batchId}`);
  check('…and approving the first set deletes nothing of the second (409)', ambOld.status === 409 && (await prisma.dailyStat.count({ where: { id: { in: [ambIds[2]!, ambIds[3]!] } } })) === 2, [ambOld.status]);
  await prisma.dailyStat.deleteMany({ where: { id: { in: ambIds } } });

  // Two operators (or one double-click) approve the SAME batch at the same moment: it is applied once.
  for (let i = 0; i < 40; i++) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: `orph_dup_${sfx}_${i % 4}`, date: day(10 + Math.floor(i / 4)), spend: 2n } });
  const g5 = await dry();
  const [dupA, dupB] = await Promise.all([post(`?expectedRows=${g5.body.orphanRows}&batchId=${g5.body.batchId}`), post(`?expectedRows=${g5.body.orphanRows}&batchId=${g5.body.batchId}`)]);
  const deletedTotal = (dupA.body?.rowsDeleted ?? 0) + (dupB.body?.rowsDeleted ?? 0);
  check('the same approval sent twice concurrently: no 5xx, no deadlock, the batch is deleted exactly once (rows deleted in total = the batch), nothing else touched', [dupA.status, dupB.status].every((st) => st === 200 || st === 409) && deletedTotal === g5.body.orphanRows && (await dry()).body.orphanRows === 0 && (await rowsOf())['r1'] === 3, [dupA.status, dupB.status, dupA.body?.rowsDeleted, dupB.body?.rowsDeleted, g5.body.orphanRows]);

  // ── 5. the scheduler REPORTS; it never deletes ───────────────────────
  console.log('\n── 5. the scheduled integrity sweep reports orphans and deletes nothing ──');
  const { runIntegritySweep } = await import('./src/workers/backgroundScheduler');
  const P = await import('./src/lib/platformOrphanCleanup');
  // Plenty of live statistics so that the orphan share is ~2 %: the OLD scheduler (guard: refuse above 20 %) would delete these.
  const fill = await prisma.campaign.create({ data: { adAccountId: A.account.id, externalCampaignId: `fill_${sfx}`, name: 'Filler' } });
  await prisma.dailyStat.createMany({ data: Array.from({ length: 120 }, (_, i) => ({ entityType: EntityType.CAMPAIGN, entityId: fill.id, date: day(100 + i), spend: 1n })) });
  for (const d of [1, 2, 3]) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: `orph_s1_${sfx}`, date: day(d), spend: 1n } });
  const snap = async () => (await pool.query(`select id, xmin::text as x from daily_stats order by id`)).rows.map((r) => `${r.id}:${r.x}`).join('|');
  const rep = await P.reportOrphanedCampaignStatsGlobal(prisma);
  check('(setup) orphans are a small share of campaign stats — below the old 20% guard, so the old scheduler would have deleted them', rep.orphanRows >= 3 && rep.orphanFraction > 0 && rep.orphanFraction < 0.2, rep);
  const before = await snap();
  const warns: string[] = [];
  const origWarn = console.warn; const origLog = console.log; const origErr = console.error;
  console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(' ')); }; console.log = () => {}; console.error = (...a: unknown[]) => { warns.push('ERR ' + a.map(String).join(' ')); };
  try { await runIntegritySweep(prisma); } finally { console.warn = origWarn; console.log = origLog; console.error = origErr; }
  const after = await snap();
  const orphanLine = warns.find((w) => /ORPHANED campaign stats/.test(w)) ?? '';
  check('the sweep deleted NOTHING: every daily_stats row, with its xmin, is exactly as before', before === after && (await prisma.dailyStat.count({ where: { entityId: `orph_s1_${sfx}` } })) === 3, [before.length, after.length]);
  check('…and it said so: REPORT ONLY, nothing deleted, with the counts and the share', /REPORT ONLY/.test(orphanLine) && /nothing was deleted/.test(orphanLine) && orphanLine.includes(`${rep.orphanRows} row(s) / ${rep.orphanCampaignIds} campaign id(s)`), orphanLine);
  check('the sweep did not fail', !warns.some((w) => /^ERR /.test(w)), warns.filter((w) => /^ERR /.test(w)));
  let threw = false; try { await P.cleanupOrphanedCampaignStatsGlobal(prisma, undefined as never, { expectedRows: 3, batchId: HEXZ }); } catch { threw = true; }
  check('without a platform-admin authorisation the delete function refuses to run', threw);
  let threwSched = false; try { await P.cleanupOrphanedCampaignStatsGlobal(prisma, { kind: 'system-scheduler' } as never, { expectedRows: 3, batchId: HEXZ }); } catch { threwSched = true; }
  check('there is no scheduler principal any more: { kind: "system-scheduler" } is refused', threwSched && (await prisma.dailyStat.count({ where: { entityId: `orph_s1_${sfx}` } })) === 3);

  await prisma.dailyStat.deleteMany({ where: { entityId: { in: [`orph_s1_${sfx}`, `orph_race_${sfx}`] } } });   // leave the database re-runnable
  console.log(`\n${pass} passed, ${fail} failed   (database: ${dbName})`);
  await prisma.$disconnect(); await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_data_health_isolation_postgres crashed:', e); process.exit(1); });
