import { Prisma, type PrismaClient } from '@prisma/client';

// ════════════════════════════════════════════════════════════════════════
//  Orphaned campaign statistics, scoped to a TENANT.
//
//  An orphan is a campaign daily_stat whose campaign row no longer exists. The
//  row itself names no owner (entity_id is a plain string, no foreign key), so
//  "whose orphan is this?" can only be answered by a tenant-bearing record that
//  OUTLIVES the campaign and names it:
//    · campaign_brain_snapshots (workspace_id, campaign_id)
//    · recommendation_logs      (workspace_id, campaign_id)
//  (campaign_history_snapshots are deleted with the campaign, so they prove nothing.)
//
//  VERIFIED OWNERSHIP, as used here: at least one such record names the campaign
//  for THIS workspace, and NO such record names it for any other workspace. An
//  orphan that nobody names, or that two workspaces name, is not verified for
//  anyone: a tenant never sees it, counts it, or deletes it. Only a platform
//  administrator can deal with those (src/lib/platformOrphanCleanup.ts).
//
//  This module used to hold the GLOBAL versions: every workspace's data-health
//  listed every tenant's orphan ids, and `?cleanup=true` on a GET deleted them
//  all (delivery/core/DATA_HEALTH_ISOLATION.md). It must never regain a
//  function that finds or deletes orphans without a workspace id.
// ════════════════════════════════════════════════════════════════════════

/**
 * Campaign ids whose orphaned daily_stats belong, by verified ownership, to
 * `workspaceId`. READ-ONLY.
 */
export async function findOwnedOrphanedCampaignEntityIds(
  prisma: PrismaClient,
  workspaceId: string,
  opts: { sinceDate?: Date; limit?: number } = {},
): Promise<string[]> {
  if (!workspaceId) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));
  const since = opts.sinceDate ? Prisma.sql`AND d.date >= ${opts.sinceDate}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH mine AS (
      SELECT campaign_id FROM campaign_brain_snapshots WHERE workspace_id = ${workspaceId}
      UNION
      SELECT campaign_id FROM recommendation_logs WHERE workspace_id = ${workspaceId} AND campaign_id IS NOT NULL
    ),
    cand AS (
      SELECT DISTINCT d.entity_id AS id
      FROM daily_stats d JOIN mine m ON m.campaign_id = d.entity_id
      WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
        AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = d.entity_id) ${since}
    )
    SELECT x.id FROM cand x
    WHERE NOT EXISTS (SELECT 1 FROM campaign_brain_snapshots b WHERE b.campaign_id = x.id AND b.workspace_id <> ${workspaceId})
      AND NOT EXISTS (SELECT 1 FROM recommendation_logs l WHERE l.campaign_id = x.id AND l.workspace_id <> ${workspaceId})
    ORDER BY x.id
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/**
 * Delete the orphaned daily_stats whose ownership is VERIFIED for `workspaceId`
 * (and only those). ONE statement: the set is decided and deleted in the same
 * snapshot, and a campaign row that reappears in between protects its rows.
 * Only daily_stats are touched, exactly as the global cleanup it replaces did.
 */
export async function deleteOwnedOrphanedCampaignStats(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<{ rowsDeleted: number }> {
  if (!workspaceId) return { rowsDeleted: 0 };
  const rowsDeleted = await prisma.$executeRaw`
    WITH mine AS (
      SELECT campaign_id FROM campaign_brain_snapshots WHERE workspace_id = ${workspaceId}
      UNION
      SELECT campaign_id FROM recommendation_logs WHERE workspace_id = ${workspaceId} AND campaign_id IS NOT NULL
    ),
    cand AS (
      SELECT DISTINCT d.entity_id AS id
      FROM daily_stats d JOIN mine m ON m.campaign_id = d.entity_id
      WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
        AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = d.entity_id)
    ),
    owned AS (
      SELECT x.id FROM cand x
      WHERE NOT EXISTS (SELECT 1 FROM campaign_brain_snapshots b WHERE b.campaign_id = x.id AND b.workspace_id <> ${workspaceId})
        AND NOT EXISTS (SELECT 1 FROM recommendation_logs l WHERE l.campaign_id = x.id AND l.workspace_id <> ${workspaceId})
    )
    DELETE FROM daily_stats d USING owned o
    WHERE d.entity_type = 'CAMPAIGN'::"EntityType" AND d.entity_id = o.id
      AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = d.entity_id)`;
  return { rowsDeleted };
}

/**
 * Live-operational campaign ids for an account — excludes ARCHIVED/DELETED so
 * aggregates (charts, KPIs) never mix historical archived rows with current ops.
 */
export async function getLiveCampaignIdsForAccount(
  prisma: PrismaClient,
  adAccountId: string,
): Promise<string[]> {
  const rows = await prisma.campaign.findMany({
    where: {
      adAccountId,
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
