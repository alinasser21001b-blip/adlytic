// ════════════════════════════════════════════════════════════════════════
//  src/lib/platformOrphanCleanup.ts — GLOBAL orphan statistics: platform only.
//
//  "Global" means across every tenant, and that includes orphans whose owner
//  cannot be verified (nobody names them, or two workspaces do). A tenant must
//  never reach this module: it may be imported only by
//    · the platform-admin routes in src/api/server.ts (/api/admin/data-health/…)
//    · the scheduler (src/workers/backgroundScheduler.ts)
//  and every deleting call takes an explicit PlatformAuthorization. A static
//  test (test_data_health_isolation.ts) fails the build if anything else
//  imports it. Tenant-scoped counterparts live in campaignDataIsolation.ts.
//
//  Why the scheduler path has a guard: on a database that was just restored
//  or only partly restored, the `campaigns` table can be missing or behind
//  while daily_stats are intact — then almost every row "has no campaign".
//  The scheduler therefore refuses to delete when the orphans are more than
//  `maxOrphanFraction` of all campaign statistics (default 20%) and logs why.
//  A platform admin acts deliberately, and must state the row count they saw.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

export type PlatformAuthorization =
  | { kind: 'platform-admin'; userId: string; email: string }
  | { kind: 'system-scheduler' };

export interface OrphanCounts {
  /** daily_stats rows of entity_type CAMPAIGN. */
  campaignStatRows: number;
  /** …of which no campaign row exists for the entity. */
  orphanRows: number;
  orphanCampaignIds: number;
}

export type GlobalCleanupResult =
  | { status: 'deleted'; rowsDeleted: number; counts: OrphanCounts }
  | { status: 'skipped_expected_rows_mismatch'; rowsDeleted: 0; counts: OrphanCounts }
  | { status: 'skipped_orphan_fraction'; rowsDeleted: 0; counts: OrphanCounts; fraction: number; maxOrphanFraction: number };

/** READ-ONLY, aggregate only: never returns an id. */
export async function countOrphanedCampaignStatsGlobal(prisma: PrismaClient): Promise<OrphanCounts> {
  // ONE pass: a LEFT JOIN decides "no campaign row" once per stat row. The previous form
  // repeated a correlated NOT EXISTS inside each FILTER, i.e. two index probes per row:
  // 8.9 s over 2.2 M rows against 1.4 s for this form (identical counts), and the
  // scheduler runs this every 6 hours and again before it deletes.
  const r = await prisma.$queryRaw<Array<{ total: number; orphan_rows: number; orphan_ids: number }>>`
    SELECT count(*)::int AS total,
           (count(*) FILTER (WHERE t.orphan))::int AS orphan_rows,
           (count(DISTINCT t.entity_id) FILTER (WHERE t.orphan))::int AS orphan_ids
    FROM (
      SELECT d.entity_id, (c.id IS NULL) AS orphan
      FROM daily_stats d LEFT JOIN campaigns c ON c.id = d.entity_id
      WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
    ) t`;
  const row = r[0];
  return { campaignStatRows: Number(row?.total ?? 0), orphanRows: Number(row?.orphan_rows ?? 0), orphanCampaignIds: Number(row?.orphan_ids ?? 0) };
}

/**
 * Delete EVERY orphaned campaign daily_stat, whoever it belonged to.
 *  · platform-admin: pass `expectedRows` (the orphanRows the operator saw in the
 *    read-only report); a different current count means nothing is deleted.
 *  · system-scheduler: refused above `maxOrphanFraction` (default 0.2).
 * The delete is one statement and spares any entity whose campaign row exists.
 */
export async function cleanupOrphanedCampaignStatsGlobal(
  prisma: PrismaClient,
  auth: PlatformAuthorization,
  opts: { expectedRows?: number; maxOrphanFraction?: number } = {},
): Promise<GlobalCleanupResult> {
  if (!auth || (auth.kind !== 'platform-admin' && auth.kind !== 'system-scheduler')) {
    throw new Error('global orphan cleanup requires a PlatformAuthorization');
  }
  const counts = await countOrphanedCampaignStatsGlobal(prisma);
  if (counts.orphanRows === 0) return { status: 'deleted', rowsDeleted: 0, counts };

  if (auth.kind === 'platform-admin') {
    if (opts.expectedRows === undefined || opts.expectedRows !== counts.orphanRows) {
      return { status: 'skipped_expected_rows_mismatch', rowsDeleted: 0, counts };
    }
  } else {
    const max = opts.maxOrphanFraction ?? 0.2;
    const fraction = counts.campaignStatRows > 0 ? counts.orphanRows / counts.campaignStatRows : 1;
    if (fraction > max) return { status: 'skipped_orphan_fraction', rowsDeleted: 0, counts, fraction, maxOrphanFraction: max };
  }

  const rowsDeleted = await prisma.$executeRaw`
    DELETE FROM daily_stats d
    WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
      AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = d.entity_id)`;
  return { status: 'deleted', rowsDeleted, counts };
}
