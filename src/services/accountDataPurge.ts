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
    prisma.refreshState.deleteMany({ where }),
  ];
}

/**
 * Delete every Meta-derived analytics row for one ad account — account-level
 * AND campaign-level (campaign ids resolved here). Does NOT delete the
 * AdAccount row itself; FK-cascading rows (campaigns, ad sets, ads,
 * creatives, snapshots) are removed by Prisma when the caller deletes the
 * account. Idempotent: re-running on an already-purged account is a no-op.
 *
 * Also covers two tables the original 7-table list predates:
 *   - campaign_brain_snapshots: keyed by campaignId, not entityType/entityId,
 *     so it doesn't fit entityDeletes()'s shape — deleted directly here by
 *     the same campaignIds already resolved above.
 *   - campaign_intelligence_reports (V5): adAccountId is a plain String with
 *     no @relation to AdAccount, so Prisma's own FK cascade never reaches
 *     it — every purge path in the codebase orphaned these rows permanently
 *     until now. Its children (campaign_signals/issues/recommendations) DO
 *     have onDelete: Cascade back to the report (schema.prisma), so deleting
 *     the report is enough; no migration needed either way.
 * Before this, adminConsole.ts's admin-delete-customer path independently
 * purged campaign_brain_snapshots (via its own, separately-maintained table
 * list) while every other deletion path — self-service account deletion,
 * Meta account disconnect, the Meta data-deletion callback — did not; this
 * is now the one place either concern lives, for all four call sites alike.
 *
 * Also covers, found in a later audit:
 *   - refresh_states: entityType/entityId-keyed exactly like entityDeletes()'s
 *     other tables — folded into that helper directly.
 *   - refresh_logs: adAccountId-keyed, deleted directly here.
 *   - recommendation_logs: campaignId-keyed for the rows this function CAN
 *     attribute to this account (scoped by the same campaignIds resolved
 *     above). Rows with campaignId IS NULL are account-level log entries
 *     but the table only stores workspaceId, not adAccountId — a workspace
 *     with more than one ad account has no way to tell which account such a
 *     row belongs to, so those rows are deliberately left alone rather than
 *     risk deleting another still-connected account's history. Documented
 *     as a known limitation, not silently claimed as fully covered.
 *   - campaign_history_rollups is deliberately NOT covered: it aggregates
 *     across every campaign in a workspace matching an objective (no
 *     campaignId/adAccountId column at all), so a workspace with multiple
 *     ad accounts has no per-account slice to delete — only a full
 *     recompute from the remaining accounts would be correct, which is a
 *     rollup-recomputation feature, not a purge fix. Needs product
 *     direction on whether disconnecting one of several accounts in a
 *     workspace should trigger that recompute.
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
    ...(campaignIds.length
      ? [
          prisma.campaignBrainSnapshot.deleteMany({ where: { campaignId: { in: campaignIds } } }),
          prisma.recommendationLog.deleteMany({ where: { campaignId: { in: campaignIds } } }),
        ]
      : []),
    prisma.campaignIntelligenceReport.deleteMany({ where: { adAccountId: accountId } }),
    prisma.refreshLog.deleteMany({ where: { adAccountId: accountId } }),
  ]);
}
