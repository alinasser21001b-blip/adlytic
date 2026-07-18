import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

import { getCampaignCounts, type CampaignCounts } from '../lib/campaignCatalog';
import {
  cleanupOrphanedCampaignStats,
  findGloballyOrphanedCampaignEntityIds,
} from '../lib/campaignDataIsolation';
import { classifyCampaignDelivery, DELIVERY_WINDOW_DAYS } from '../lib/campaignLifecycle';
import { accountLocalDateFloor } from '../lib/campaignSpending';

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
  const sinceDate = accountLocalDateFloor(account.timezone, windowDays);
  const checks: IntegrityCheck[] = [];

  const knownCampaigns = await prisma.campaign.findMany({
    where: { adAccountId: account.id },
    select: { id: true, status: true, metaEffectiveStatus: true },
  });
  const campaignIdSet = new Set(knownCampaigns.map((c) => c.id));

  const [accountStats, campaignAgg, windowAgg, orphanedEntityIds] = await Promise.all([
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
    findGloballyOrphanedCampaignEntityIds(prisma, { sinceDate, limit: 500 }),
  ]);

  const spendWindowByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );
  let staleActiveCount = 0;
  for (const c of knownCampaigns) {
    const tier = classifyCampaignDelivery({
      status: c.status,
      metaEffectiveStatus: c.metaEffectiveStatus,
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

  if (orphanedEntityIds.length > 0) {
    checks.push({
      code: 'ORPHANED_CAMPAIGN_STATS',
      severity: 'WARN',
      message: `${orphanedEntityIds.length} deleted campaign(s) still have daily stats that can mix with live totals`,
      messageAr: `${orphanedEntityIds.length} حملة محذوفة — بياناتها القديمة قد تختلط مع البيانات الحية`,
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

  // The exact "Meta says running, Adlytic says zero" symptom: campaigns are
  // ACTIVE and the account spent inside the window, yet no campaign carries
  // window spend — campaign-level daily stats are missing or lagging behind
  // account-level stats. This is a sync gap, never a normal state.
  if (
    campaignCounts.activeStatus > 0 &&
    campaignCounts.deliveringInWindow === 0 &&
    accountTotalSpend > 0
  ) {
    checks.push({
      code: 'ACTIVE_ZERO_DELIVERING_MISMATCH',
      severity: 'WARN',
      message: `${campaignCounts.activeStatus} Meta-ACTIVE campaign(s) show zero delivering while the account spent in the ${windowDays}d window — campaign daily stats missing or lagging`,
      messageAr: `${campaignCounts.activeStatus} حملة نشطة في Meta لكن لا تظهر أي حملة "تعمل" رغم وجود إنفاق خلال ${windowDays} يوماً — بيانات الحملات اليومية ناقصة أو متأخرة`,
      value: campaignCounts.activeStatus,
    });
  }

  if (staleActiveCount > 0 && campaignCounts.activeStatus > campaignCounts.deliveringInWindow) {
    checks.push({
      code: 'DORMANT_ACTIVE_INFLATION',
      severity: 'INFO',
      message: `${staleActiveCount} campaign(s) are Meta-ACTIVE but spent nothing in ${windowDays}d — use delivering (${campaignCounts.deliveringInWindow}) not Meta active (${campaignCounts.activeStatus})`,
      messageAr: `${staleActiveCount} حملة Meta نشطة بدون إنفاق — العدد الفعلي ${campaignCounts.deliveringInWindow} وليس ${campaignCounts.activeStatus}`,
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

export { cleanupOrphanedCampaignStats, findGloballyOrphanedCampaignEntityIds };
