import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

/**
 * Campaign daily_stat rows whose entityId no longer exists in the campaigns
 * table. These are true orphans (deleted rows) — safe to remove globally
 * without touching live campaigns in any account.
 *
 * NEVER use `entityId NOT IN accountKnownIds` — that would delete other
 * accounts' live campaign stats.
 */
export async function findGloballyOrphanedCampaignEntityIds(
  prisma: PrismaClient,
  opts: { sinceDate?: Date; limit?: number } = {},
): Promise<string[]> {
  const existingIds = new Set(
    (await prisma.campaign.findMany({ select: { id: true } })).map((c) => c.id),
  );
  if (existingIds.size === 0) return [];

  const statRows = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      ...(opts.sinceDate ? { date: { gte: opts.sinceDate } } : {}),
    },
    select: { entityId: true },
    distinct: ['entityId'],
    take: opts.limit ?? 500,
  });

  return statRows.map((s) => s.entityId).filter((id) => !existingIds.has(id));
}

/** Delete daily_stat rows for campaigns removed from the DB (safe global cleanup). */
export async function cleanupOrphanedCampaignStats(prisma: PrismaClient): Promise<number> {
  const orphanIds = await findGloballyOrphanedCampaignEntityIds(prisma);
  if (!orphanIds.length) return 0;

  const { count } = await prisma.dailyStat.deleteMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: { in: orphanIds } },
  });
  return count;
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
