import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

import { getCampaignCounts, type CampaignCounts } from '../lib/campaignCatalog';
import { classifyCampaignDelivery, DELIVERY_WINDOW_DAYS } from '../lib/campaignLifecycle';

export type IntegritySeverity = 'OK' | 'INFO' | 'WARN' | 'CRITICAL';

export type IntegrityCheck = {
  code: string;
  severity: IntegritySeverity;
  message: string;
  messageAr: string;
  value?: number | string;
  autoFixable?: boolean;
};

export type DataIntegrityReport = {
  workspaceId: string;
  accountId: string;
  checkedAt: string;
  windowDays: number;
  campaignCounts: CampaignCounts;
  checks: IntegrityCheck[];
  overallStatus: IntegritySeverity;
  orphanedCount: number;
  orphanedCampaignIds: string[];
  divergencePct: number;
  divergenceStatus: 'OK' | 'MODERATE' | 'HIGH';
  staleActiveCount: number;
  syncAgeHours: number | null;
};

function maxSeverity(checks: IntegrityCheck[]): IntegritySeverity {
  const order: IntegritySeverity[] = ['CRITICAL', 'WARN', 'INFO', 'OK'];
  for (const level of order) {
    if (checks.some((c) => c.severity === level)) return level;
  }
  return 'OK';
}

/**
 * Automated data-integrity observer — compares account vs campaign totals,
 * detects orphaned historical rows, and flags dormant ACTIVE campaigns that
 * inflate "active" counts in Meta.
 */
export async function runDataIntegrityCheck(
  prisma: PrismaClient,
  workspaceId: string,
  account: {
    id: string;
    timezone: string;
    lastSyncedAt: Date | null;
  },
  opts: { windowDays?: number } = {},
): Promise<DataIntegrityReport> {
  const windowDays = opts.windowDays ?? DELIVERY_WINDOW_DAYS;
  const sinceDate = new Date(new Date(Date.now() - windowDays * 864e5).toISOString().slice(0, 10));
  const checks: IntegrityCheck[] = [];

  const knownCampaigns = await prisma.campaign.findMany({
    where: { adAccountId: account.id },
    select: { id: true, status: true },
  });
  const campaignIdSet = new Set(knownCampaigns.map((c) => c.id));

  const [accountStats, campaignAgg, allCampaignStats, windowAgg] = await Promise.all([
    prisma.dailyStat.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id, date: { gte: sinceDate } },
      select: { spend: true },
    }),
    knownCampaigns.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: [...campaignIdSet] },
            date: { gte: sinceDate },
          },
          _sum: { spend: true },
        })
      : Promise.resolve([]),
    prisma.dailyStat.findMany({
      where: { entityType: EntityType.CAMPAIGN, date: { gte: sinceDate } },
      select: { entityId: true },
      distinct: ['entityId'],
    }),
    knownCampaigns.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: [...campaignIdSet] },
            date: { gte: sinceDate },
          },
          _sum: { spend: true },
        })
      : Promise.resolve([]),
  ]);

  const spendWindowByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );
  let staleActiveCount = 0;
  for (const c of knownCampaigns) {
    const tier = classifyCampaignDelivery({
      status: c.status,
      spendWindowMinor: spendWindowByCampaign.get(c.id) ?? 0,
    });
    if (tier === 'DORMANT_ACTIVE') staleActiveCount += 1;
  }

  const campaignCounts = await getCampaignCounts(
    prisma,
    account.id,
    account.timezone,
    0,
    windowDays,
  );

  const accountTotalSpend = accountStats.reduce((a, s) => a + Number(s.spend), 0);
  const campaignTotalSpend = campaignAgg.reduce((a, g) => a + Number(g._sum.spend ?? 0), 0);
  const divergence = accountTotalSpend - campaignTotalSpend;
  const divergencePct = accountTotalSpend > 0
    ? +((Math.abs(divergence) / accountTotalSpend) * 100).toFixed(2)
    : 0;
  const divergenceStatus: DataIntegrityReport['divergenceStatus'] =
    divergencePct > 10 ? 'HIGH' : divergencePct > 2 ? 'MODERATE' : 'OK';

  const orphanedEntityIds = allCampaignStats
    .map((s) => s.entityId)
    .filter((id) => !campaignIdSet.has(id));

  if (orphanedEntityIds.length > 0) {
    checks.push({
      code: 'ORPHANED_CAMPAIGN_STATS',
      severity: 'WARN',
      message: `${orphanedEntityIds.length} deleted campaign(s) still have daily stats mixed with live data`,
      messageAr: `${orphanedEntityIds.length} حملة محذوفة لا تزال بياناتها مدمجة مع البيانات الحية`,
      value: orphanedEntityIds.length,
      autoFixable: true,
    });
  }

  if (divergenceStatus === 'HIGH') {
    checks.push({
      code: 'ACCOUNT_CAMPAIGN_DIVERGENCE',
      severity: 'CRITICAL',
      message: `Account vs campaign spend diverges by ${divergencePct}% (${windowDays}d window)`,
      messageAr: `فرق ${divergencePct}% بين إجمالي الحساب ومجموع الحملات (${windowDays} يوم)`,
      value: divergencePct,
    });
  } else if (divergenceStatus === 'MODERATE') {
    checks.push({
      code: 'ACCOUNT_CAMPAIGN_DIVERGENCE',
      severity: 'WARN',
      message: `Account vs campaign spend diverges by ${divergencePct}% (${windowDays}d window)`,
      messageAr: `فرق ${divergencePct}% بين إجمالي الحساب ومجموع الحملات (${windowDays} يوم)`,
      value: divergencePct,
    });
  }

  if (staleActiveCount > 0 && campaignCounts.activeStatus > campaignCounts.deliveringInWindow) {
    checks.push({
      code: 'DORMANT_ACTIVE_INFLATION',
      severity: 'INFO',
      message: `${staleActiveCount} campaign(s) are Meta-ACTIVE but spent nothing in ${windowDays}d — use "delivering" count (${campaignCounts.deliveringInWindow}) not Meta active (${campaignCounts.activeStatus})`,
      messageAr: `${staleActiveCount} حملة بحالة Meta نشطة بدون إنفاق خلال ${windowDays} يوم — العدد الفعلي ${campaignCounts.deliveringInWindow} وليس ${campaignCounts.activeStatus}`,
      value: staleActiveCount,
    });
  }

  const syncAgeHours = account.lastSyncedAt
    ? +((Date.now() - account.lastSyncedAt.getTime()) / 3_600_000).toFixed(1)
    : null;
  if (syncAgeHours != null && syncAgeHours > 24) {
    checks.push({
      code: 'STALE_SYNC',
      severity: syncAgeHours > 72 ? 'WARN' : 'INFO',
      message: `Last sync was ${syncAgeHours}h ago`,
      messageAr: `آخر مزامنة منذ ${syncAgeHours} ساعة`,
      value: syncAgeHours,
    });
  }

  if (checks.length === 0) {
    checks.push({
      code: 'ALL_CLEAR',
      severity: 'OK',
      message: 'Data integrity checks passed',
      messageAr: 'فحص سلامة البيانات سليم',
    });
  }

  return {
    workspaceId,
    accountId: account.id,
    checkedAt: new Date().toISOString(),
    windowDays,
    campaignCounts,
    checks,
    overallStatus: maxSeverity(checks),
    orphanedCount: orphanedEntityIds.length,
    orphanedCampaignIds: orphanedEntityIds,
    divergencePct,
    divergenceStatus,
    staleActiveCount,
    syncAgeHours,
  };
}

/** Delete daily_stat rows for campaigns no longer in the account (historical isolation). */
export async function cleanupOrphanedCampaignStats(
  prisma: PrismaClient,
  adAccountId: string,
): Promise<number> {
  const knownIds = (await prisma.campaign.findMany({
    where: { adAccountId },
    select: { id: true },
  })).map((c) => c.id);

  if (!knownIds.length) return 0;

  const orphans = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { notIn: knownIds },
    },
    select: { entityId: true },
    distinct: ['entityId'],
    take: 500,
  });
  if (!orphans.length) return 0;

  const orphanIds = orphans.map((o) => o.entityId);
  const { count } = await prisma.dailyStat.deleteMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: { in: orphanIds } },
  });
  return count;
}
