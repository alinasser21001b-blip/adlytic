// ════════════════════════════════════════════════════════════════════════
//  src/services/accountDataPurge.ts
//
//  ONE canonical implementation of "erase every Meta-derived analytics row
//  for an ad account". Used by account disconnect, user deletion, and the
//  Meta data-deletion callback — three call sites, one erasure contract.
//
//  The analytics tables store entityId as a plain String (no FK), so
//  Prisma cascade deletes never touch them; every table must be listed
//  here explicitly. If a new entityId-keyed table is added to the schema,
//  add it to ENTITY_TABLES below or disconnection will leak its rows.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from '@prisma/client';

/** Build deleteMany ops for every entityId-keyed analytics table. */
function entityDeletes(
  prisma: PrismaClient,
  entityType: EntityType,
  ids: string[],
) {
  const where = { entityType, entityId: { in: ids } };
  return [
    prisma.rawInsight.deleteMany({ where }),
    prisma.dailyStat.deleteMany({ where }),
    prisma.metricTrend.deleteMany({ where }),
    prisma.detectedIssue.deleteMany({ where }),
    prisma.recommendation.deleteMany({ where }),
    prisma.healthScore.deleteMany({ where }),
    prisma.breakdownStat.deleteMany({ where }),
  ];
}

/**
 * Delete every Meta-derived analytics row for one ad account — account-level
 * AND campaign-level (campaign ids resolved here). Does NOT delete the
 * AdAccount row itself; FK-cascading rows (campaigns, ad sets, ads,
 * creatives, snapshots) are removed by Prisma when the caller deletes the
 * account. Idempotent: re-running on an already-purged account is a no-op.
 */
export async function purgeAccountAnalytics(
  prisma: PrismaClient,
  accountId: string,
): Promise<void> {
  const campaignIds = (
    await prisma.campaign.findMany({
      where: { adAccountId: accountId },
      select: { id: true },
    })
  ).map((c) => c.id);

  await prisma.$transaction([
    ...entityDeletes(prisma, EntityType.ACCOUNT, [accountId]),
    ...(campaignIds.length
      ? entityDeletes(prisma, EntityType.CAMPAIGN, campaignIds)
      : []),
  ]);
}
