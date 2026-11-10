// ════════════════════════════════════════════════════════════════════════
//  src/lib/platformOrphanCleanup.ts — GLOBAL orphan statistics: platform only,
//  and only ever on an explicit, batch-bound approval.
//
//  "Global" means across every tenant, and that includes orphans whose owner
//  cannot be verified (nobody names them, or two workspaces do). A tenant must
//  never reach this module: it may be imported only by
//    · the platform-admin routes in src/api/server.ts (/api/admin/data-health/…)
//    · the scheduler (src/workers/backgroundScheduler.ts) — and the scheduler
//      imports ONLY the read-only report (`reportOrphanedCampaignStatsGlobal`)
//  A static test (test_data_health_isolation.ts) fails the build if anything
//  else imports it or if the scheduler imports a deleting function.
//  Tenant-scoped counterparts live in campaignDataIsolation.ts.
//
//  WHY NOTHING DELETES ON A SCHEDULE. On a database that was just restored or
//  only partly restored, the `campaigns` table can be missing or behind while
//  daily_stats are intact — then rows "have no campaign" although the campaign
//  was never deleted. A percentage guard (the previous scheduler design: refuse
//  above 20 %) still let a restore that lost 19 % of its campaigns delete that
//  share of history, unattended, 30 s after boot. The scheduler now only
//  REPORTS the orphan counts. Deleting is a deliberate platform-admin act:
//
//      1. dry run   GET  /api/admin/data-health/orphans        → counts + batchId
//      2. approve   POST /api/admin/data-health/orphans/cleanup
//                        ?expectedRows=<orphanRows>&batchId=<batchId>
//
//  The batchId is a SHA-256 over the ordered ids of EVERY orphan row the dry run
//  saw. The delete is ONE statement that computes that digest and deletes in the
//  same snapshot, and deletes only the rows of that snapshot, only if the digest
//  and the row count both equal what the admin approved. A different batch — a
//  row more, a row fewer, a different row — deletes nothing (409).
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

/** Only a platform administrator can delete. There is deliberately no scheduler principal. */
export type PlatformAuthorization = { kind: 'platform-admin'; userId: string; email: string };

export interface OrphanCounts {
  /** daily_stats rows of entity_type CAMPAIGN. */
  campaignStatRows: number;
  /** …of which no campaign row exists for the entity. */
  orphanRows: number;
  orphanCampaignIds: number;
}

/** What a dry run shows: the counts, the share of all campaign stats, and the digest to approve. */
export interface OrphanBatch extends OrphanCounts {
  /** orphanRows / campaignStatRows (0 when there are no campaign stats). */
  orphanFraction: number;
  /** SHA-256 hex over the ordered ids of every orphan row. Quote it to the cleanup POST. */
  batchId: string;
}

export type GlobalCleanupResult =
  | { status: 'deleted'; rowsDeleted: number; counts: OrphanCounts; batchId: string }
  | { status: 'skipped_expected_rows_mismatch'; rowsDeleted: 0; current: OrphanBatch }
  | { status: 'skipped_batch_mismatch'; rowsDeleted: 0; current: OrphanBatch };

/** Domain separator: a digest of this kind cannot be confused with any other sha256 of ids. */
const BATCH_DOMAIN = 'adlytic-orphan-batch:v1:';
export const ORPHAN_BATCH_ID_FORMAT = /^[0-9a-f]{64}$/;

/**
 * READ-ONLY, aggregate only (never returns an id): counts and the share of orphans.
 * The scheduler's whole contact surface with this module. No digest, so it stays cheap.
 */
export async function reportOrphanedCampaignStatsGlobal(prisma: PrismaClient): Promise<OrphanCounts & { orphanFraction: number }> {
  // ONE pass: a LEFT JOIN decides "no campaign row" once per stat row. The previous form
  // repeated a correlated NOT EXISTS inside each FILTER, i.e. two index probes per row:
  // 8.9 s over 2.2 M rows against 1.4 s for this form (identical counts).
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
  const campaignStatRows = Number(row?.total ?? 0);
  const orphanRows = Number(row?.orphan_rows ?? 0);
  return {
    campaignStatRows,
    orphanRows,
    orphanCampaignIds: Number(row?.orphan_ids ?? 0),
    orphanFraction: campaignStatRows > 0 ? orphanRows / campaignStatRows : 0,
  };
}

/** The same scan, plus the batch digest an admin must approve. READ-ONLY, aggregate only. */
export async function describeOrphanBatchGlobal(prisma: PrismaClient): Promise<OrphanBatch> {
  const r = await prisma.$queryRaw<Array<{ total: number; orphan_rows: number; orphan_ids: number; batch_id: string }>>`
    SELECT count(*)::int AS total,
           (count(*) FILTER (WHERE t.orphan))::int AS orphan_rows,
           (count(DISTINCT t.entity_id) FILTER (WHERE t.orphan))::int AS orphan_ids,
           encode(sha256(convert_to(${BATCH_DOMAIN} || coalesce(string_agg(t.id, ',' ORDER BY t.id) FILTER (WHERE t.orphan), ''), 'UTF8')), 'hex') AS batch_id
    FROM (
      SELECT d.id, d.entity_id, (c.id IS NULL) AS orphan
      FROM daily_stats d LEFT JOIN campaigns c ON c.id = d.entity_id
      WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
    ) t`;
  const row = r[0];
  const campaignStatRows = Number(row?.total ?? 0);
  const orphanRows = Number(row?.orphan_rows ?? 0);
  return {
    campaignStatRows,
    orphanRows,
    orphanCampaignIds: Number(row?.orphan_ids ?? 0),
    orphanFraction: campaignStatRows > 0 ? orphanRows / campaignStatRows : 0,
    batchId: String(row?.batch_id ?? ''),
  };
}

/**
 * Delete the orphaned campaign daily_stats of EXACTLY the batch a platform admin approved.
 *
 * `expectedRows` and `batchId` both come from the dry run (`describeOrphanBatchGlobal`).
 * ONE statement computes the digest of the orphan set and deletes that set in the same
 * snapshot, guarded by (digest = batchId AND count = expectedRows): rows that became
 * orphans after the snapshot are not in the set and survive; a batch that differs from
 * the approved one deletes nothing. Rows whose campaign exists are never deleted.
 */
export async function cleanupOrphanedCampaignStatsGlobal(
  prisma: PrismaClient,
  auth: PlatformAuthorization,
  approval: { expectedRows: number; batchId: string },
): Promise<GlobalCleanupResult> {
  if (!auth || auth.kind !== 'platform-admin') {
    throw new Error('global orphan cleanup requires a platform-admin PlatformAuthorization');
  }
  if (!approval || !Number.isSafeInteger(approval.expectedRows) || approval.expectedRows < 0) {
    throw new Error('global orphan cleanup requires expectedRows (a non-negative integer from the dry run)');
  }
  if (typeof approval.batchId !== 'string' || !ORPHAN_BATCH_ID_FORMAT.test(approval.batchId)) {
    throw new Error('global orphan cleanup requires batchId (the 64-hex digest from the dry run)');
  }
  const { expectedRows, batchId } = approval;
  const before = await reportOrphanedCampaignStatsGlobal(prisma);

  const r = await prisma.$queryRaw<Array<{ deleted: number; n: number; h: string }>>`
    WITH orphan AS (
      SELECT d.id FROM daily_stats d
      WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
        AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = d.entity_id)
    ),
    batch AS (
      SELECT count(*)::int AS n,
             encode(sha256(convert_to(${BATCH_DOMAIN} || coalesce(string_agg(id, ',' ORDER BY id), ''), 'UTF8')), 'hex') AS h
      FROM orphan
    ),
    del AS (
      DELETE FROM daily_stats d USING orphan o, batch b
      WHERE d.id = o.id
        AND b.h = ${batchId} AND b.n = ${expectedRows}
        AND d.entity_type = 'CAMPAIGN'::"EntityType"
        AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = d.entity_id)
      RETURNING d.id
    )
    SELECT (SELECT count(*) FROM del)::int AS deleted, (SELECT n FROM batch) AS n, (SELECT h FROM batch) AS h`;
  const row = r[0];
  const n = Number(row?.n ?? 0);
  const h = String(row?.h ?? '');
  const rowsDeleted = Number(row?.deleted ?? 0);

  if (n !== expectedRows || h !== batchId) {
    // Nothing was deleted (the statement is guarded by both). Show the admin what a fresh dry run says.
    const current = await describeOrphanBatchGlobal(prisma);
    return n !== expectedRows
      ? { status: 'skipped_expected_rows_mismatch', rowsDeleted: 0, current }
      : { status: 'skipped_batch_mismatch', rowsDeleted: 0, current };
  }
  return { status: 'deleted', rowsDeleted, counts: { campaignStatRows: before.campaignStatRows, orphanRows: before.orphanRows, orphanCampaignIds: before.orphanCampaignIds }, batchId };
}
