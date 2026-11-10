// ════════════════════════════════════════════════════════════════════════
//  scripts/repro/data_health_orphans.ts — two synthetic tenants, one question:
//  can tenant A see or delete tenant B's orphaned records through data-health?
//
//  Drives the REAL Hono app over HTTP (app.request) against a LOOPBACK Postgres
//  database named adlytic_repro*, so the same script runs before and after the
//  fix. Synthetic data only; prints aggregates and ids that are synthetic.
//
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_dh \
//      REPRO_OUT=/path/out.json npx tsx scripts/repro/data_health_orphans.ts
//
//  An "orphan" is a campaign daily_stat whose campaign row no longer exists.
//  The row itself names no owner; ownership can only come from a tenant-bearing
//  record that outlives the campaign (campaign_brain_snapshots,
//  recommendation_logs). The scenario covers every case:
//    a1   named only by A                  b1, b2  named only by B
//    c1   named by BOTH A and B (ambiguous)   u1  named by nobody
// ════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env['PLATFORM_ADMIN_EMAILS'] = 'platform-admin@repro.invalid';
delete process.env['REDIS_URL'];

import { writeFileSync } from 'node:fs';

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}

async function main(): Promise<void> {
  const { PrismaClient, EntityType } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('../../src/api/server');
  const { signToken } = await import('../../src/services/jwtAuth');

  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: dbName, max: 10 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);
  const rnd = () => Math.random().toString(36).slice(2, 8);
  const sfx = rnd();
  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };

  const mkUser = async (label: string, email?: string) => {
    const u = await prisma.user.create({ data: { email: email ?? `${label}-${sfx}@repro.invalid`, passwordHash: 'x', name: label, isActive: true } });
    return { u, token: signToken({ sub: u.id, email: u.email, ver: 0 }) };
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
  // The platform admin has a FIXED email (PLATFORM_ADMIN_EMAILS), so reuse it on re-runs.
  const existingAdmin = await prisma.user.findUnique({ where: { email: 'platform-admin@repro.invalid' } });
  const admin = existingAdmin
    ? { u: existingAdmin, token: signToken({ sub: existingAdmin.id, email: existingAdmin.email, ver: existingAdmin.tokenVersion }) }
    : await mkUser('platform-admin', 'platform-admin@repro.invalid');

  // ── orphans (daily_stats rows whose campaign no longer exists) ───────
  const ID = { a1: `orph_a1_${sfx}`, b1: `orph_b1_${sfx}`, b2: `orph_b2_${sfx}`, c1: `orph_c1_${sfx}`, u1: `orph_u1_${sfx}` };
  for (const id of Object.values(ID)) for (const d of [1, 2, 3]) await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: id, date: day(d), spend: 50_000n, impressions: 5_000n, clicks: 50n } });
  const brain = (ws: string, cid: string) => prisma.campaignBrainSnapshot.create({ data: { workspaceId: ws, campaignId: cid, externalCampaignId: `x_${cid}`, tickDate: day(1), action: 'KEEP', priority: 'NORMAL', patternSignature: 'SYNTHETIC', finalScore: 50, payload: {} } });
  const reco = (ws: string, cid: string) => prisma.recommendationLog.create({ data: { workspaceId: ws, campaignId: cid, verdict: 'synthetic', metricsSnapshot: {} } });
  await brain(A.ws.id, ID.a1);                       // a1 named by A
  await brain(B.ws.id, ID.b1);                       // b1 named by B (brain snapshot)
  await reco(B.ws.id, ID.b2);                        // b2 named by B (recommendation log)
  await brain(A.ws.id, ID.c1); await reco(B.ws.id, ID.c1); // c1 named by A and by B: ambiguous
  // u1 is named by nobody

  const owner = (id: string) => Object.entries(ID).find(([, v]) => v === id)?.[0] ?? id;
  const rowsOf = async () => {
    const out: Record<string, number> = {};
    for (const [k, id] of Object.entries(ID)) out[k] = await prisma.dailyStat.count({ where: { entityType: EntityType.CAMPAIGN, entityId: id } });
    out['liveA'] = await prisma.dailyStat.count({ where: { entityId: A.live.id } });
    out['liveB'] = await prisma.dailyStat.count({ where: { entityId: B.live.id } });
    return out;
  };
  const get = async (path: string, token: string) => { const log = console.log; console.log = () => {}; try { const r = await app.request(path, { headers: { authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json().catch(() => null) as any }; } finally { console.log = log; } };
  const post = async (path: string, token: string) => { const log = console.log; console.log = () => {}; try { const r = await app.request(path, { method: 'POST', headers: { authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json().catch(() => null) as any }; } finally { console.log = log; } };

  const out: Record<string, unknown> = { generatedBy: 'scripts/repro/data_health_orphans.ts', database: dbName, ids: ID };
  const mine = (ids: string[], tenant: 'A' | 'B') => ids.map(owner);
  void mine;

  // 1. each tenant reads its own data-health (no cleanup)
  const aRead = await get(`/api/workspaces/${A.ws.id}/data-health`, aViewer.token);
  const bRead = await get(`/api/workspaces/${B.ws.id}/data-health`, B.owner.token);
  out['A_viewer_reads'] = { status: aRead.status, orphanedCount: aRead.body?.orphanedCount, orphanedCampaignIds: (aRead.body?.orphanedCampaignIds ?? []).map(owner).sort() };
  out['B_owner_reads'] = { status: bRead.status, orphanedCount: bRead.body?.orphanedCount, orphanedCampaignIds: (bRead.body?.orphanedCampaignIds ?? []).map(owner).sort() };

  // 2. A (a VIEWER) asks for cleanup through the GET
  const before = await rowsOf();
  const aClean = await get(`/api/workspaces/${A.ws.id}/data-health?cleanup=true`, aViewer.token);
  const after = await rowsOf();
  out['A_viewer_GET_cleanup_true'] = { status: aClean.status, orphanedRowsDeleted: aClean.body?.orphanedRowsDeleted, cleanupField: aClean.body?.cleanup };
  out['orphan_rows_before'] = before;
  out['orphan_rows_after'] = after;

  const seeByA = (out['A_viewer_reads'] as any).orphanedCampaignIds as string[];
  const foreignSeenByA = seeByA.filter((k) => k !== 'a1');
  const deletedGroups = Object.keys(before).filter((k) => (after as any)[k] < (before as any)[k]);
  out['verdict'] = {
    A_saw_ids_it_does_not_own: foreignSeenByA,
    A_count_includes_foreign_orphans: (out['A_viewer_reads'] as any).orphanedCount > 1,
    GET_mutated_the_database: deletedGroups.length > 0,
    groups_whose_rows_were_deleted: deletedGroups,
    B_rows_deleted_by_A: deletedGroups.filter((k) => ['b1', 'b2'].includes(k)),
    unattributed_or_ambiguous_deleted: deletedGroups.filter((k) => ['c1', 'u1'].includes(k)),
  };

  // 3. the new endpoints (404/403 before the fix is itself informative)
  const aOwnerPost = await post(`/api/workspaces/${A.ws.id}/data-health/cleanup`, A.owner.token);
  const adminPost = await post(`/api/admin/data-health/orphans/cleanup`, admin.token);
  out['new_endpoints_probe'] = { workspace_cleanup_as_A_owner: aOwnerPost.status, platform_cleanup_as_admin: adminPost.status };

  const json = JSON.stringify(out, null, 2);
  console.log(json);
  if (process.env['REPRO_OUT']) writeFileSync(process.env['REPRO_OUT'], json);
  await prisma.$disconnect(); await pool.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error('repro failed:', e); process.exit(1); });
