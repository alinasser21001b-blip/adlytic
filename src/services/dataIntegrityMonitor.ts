import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

import { getCampaignCounts, type CampaignCounts } from '../lib/campaignCatalog';
import { findOwnedOrphanedCampaignEntityIds } from '../lib/campaignDataIsolation';
import { accountDeliveryHold, classifyCampaignDelivery, DELIVERY_WINDOW_DAYS } from '../lib/campaignLifecycle';
import { accountLocalDateFloor } from '../lib/campaignSpending';
import { accountHistoryEvidenceCoverage, collectScaleEvidence } from '../lib/iqdRepair';

export type IntegritySeverity = 'OK' | 'INFO' | 'WARN' | 'CRITICAL';

export type IntegrityCheck = {
  code: string;
  severity: IntegritySeverity;
  message: string;
  messageAr: string;
  value?: number | string;
  autoFixable?: boolean;
};

/**
 * How much of an IQD account's stored spend can actually be checked against raw
 * Meta data. The stored currency factor is NOT evidence: `factorIsEvidence` is
 * always false, and a factor of 1 certifies nothing about rows that have no raw
 * counterpart (everything older than RAW_INSIGHTS_RETAIN_DAYS, and any day sync
 * never captured).
 */
export type SpendScaleReport = {
  currency: 'IQD';
  storedFactor: number;
  factorIsEvidence: false;
  window: { days: number; accountRows: number; verified: number; overscaled: number; unverified: number };
  /** ACCOUNT-level rows of ALL time, and how many have no raw_insights row for their date. */
  history: { accountRows: number; withoutEvidence: number };
};

export type DataIntegrityReport = {
  workspaceId: string;
  accountId: string;
  checkedAt: string;
  windowDays: number;
  campaignCounts: CampaignCounts;
  checks: IntegrityCheck[];
  overallStatus: IntegritySeverity;
  /** Orphans whose owner is VERIFIED to be this workspace — never another tenant's, never unattributed ones. */
  orphanedCount: number;
  orphanedCampaignIds: string[];
  /** Present for IQD accounts only. */
  spendScale?: SpendScaleReport;
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
    /** Meta account_status — the upstream delivery gate. Optional so older
        callers compile; absent means "not synced yet", never "healthy". */
    metaAccountStatus?: number | null;
  },
  opts: { windowDays?: number } = {},
): Promise<DataIntegrityReport> {
  const windowDays = opts.windowDays ?? DELIVERY_WINDOW_DAYS;
  const sinceDate = accountLocalDateFloor(account.timezone, windowDays);
  const checks: IntegrityCheck[] = [];

  // Ownership is verified here, not assumed from the arguments: everything below
  // is scoped by this workspace, so the account must belong to it.
  const owns = await prisma.adAccount.findFirst({ where: { id: account.id, workspaceId }, select: { id: true } });
  if (!owns) throw new Error('data-integrity: ad account does not belong to the workspace');

  // The account-level hold is the FIRST check, because it explains every
  // other symptom at once: flat-lined spend, zero delivery, dormant-looking
  // campaigns. Reporting those without naming their upstream cause sends the
  // merchant chasing five campaign-level ghosts.
  const hold = accountDeliveryHold(account.metaAccountStatus);
  if (hold.halted) {
    checks.push({
      code: 'ACCOUNT_DELIVERY_HALTED',
      severity: 'CRITICAL',
      message: `Meta account_status ${hold.code} (${hold.kind}) — the account itself blocks all delivery`,
      messageAr: hold.labelAr,
      value: hold.code ?? undefined,
    });
  } else if (hold.kind === 'GRACE_PERIOD') {
    checks.push({
      code: 'ACCOUNT_GRACE_PERIOD',
      severity: 'WARN',
      message: 'Meta account in billing grace period — delivery stops if the balance is not settled',
      messageAr: hold.labelAr,
      value: hold.code ?? undefined,
    });
  }

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
    findOwnedOrphanedCampaignEntityIds(prisma, workspaceId, { sinceDate, limit: 500 }),
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
      accountHalted: hold.halted,
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

  // ── Spend scale (IQD) ─────────────────────────────────────────────────
  // The signal that replaces the old heal-on-GET rewrite. READ-ONLY, judged
  // from the same row-level evidence the repair uses (src/lib/iqdRepair.ts),
  // and read from the DATABASE (the caller's account object may carry an
  // in-memory canonical factor). Nothing here changes a number.
  const storedAccount = await prisma.adAccount.findUnique({
    where: { id: account.id },
    select: { currency: true, currencyMinorFactor: true },
  });
  let spendScale: SpendScaleReport | undefined;
  if (storedAccount && storedAccount.currency === 'IQD') {
    const scale = await collectScaleEvidence(prisma, account.id, { sinceDate });
    const history = await accountHistoryEvidenceCoverage(prisma, account.id);
    const windowRows = accountStats.length;
    const verified = scale.accountRows.verified;
    const overscaled = scale.accountRows.overscaled;
    const unverified = Math.max(0, windowRows - verified - overscaled);
    spendScale = {
      currency: 'IQD',
      storedFactor: storedAccount.currencyMinorFactor,
      factorIsEvidence: false,
      window: { days: windowDays, accountRows: windowRows, verified, overscaled, unverified },
      history: { accountRows: history.accountRows, withoutEvidence: history.withoutEvidence },
    };
    if (scale.overscaled.length > 0) {
      checks.push({
        code: 'SPEND_SCALE_OVERSCALED',
        severity: 'CRITICAL',
        message: `${scale.overscaled.length} daily spend row(s) in the ${windowDays}d window are exactly 100x raw Meta spend — run the IQD repair`,
        messageAr: `${scale.overscaled.length} صف إنفاق يومي خلال آخر ${windowDays} يوماً أكبر ×100 من بيانات Meta الخام — شغّل إصلاح IQD`,
        value: scale.overscaled.length,
        autoFixable: false,
      });
    } else if (unverified > 0) {
      // Driven by the ROWS, never by the factor: a stored factor of 1 certifies
      // nothing about spend that has no raw Meta counterpart to be checked against.
      checks.push({
        code: 'SPEND_SCALE_UNVERIFIED',
        severity: 'WARN',
        message: `${unverified} of ${windowRows} account-level spend row(s) in the ${windowDays}d window cannot be checked against raw Meta data — the stored currency factor (${storedAccount.currencyMinorFactor}) is not evidence of their scale; figures are shown as stored, not rewritten`,
        messageAr: `${unverified} من ${windowRows} صف إنفاق على مستوى الحساب خلال آخر ${windowDays} يوماً لا يمكن التحقق منها ببيانات Meta الخام — المعامل المحفوظ (${storedAccount.currencyMinorFactor}) ليس دليلاً على مقياسها؛ تُعرض كما هي ولا تُعدَّل`,
        value: unverified,
        autoFixable: false,
      });
    }
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
    ...(spendScale ? { spendScale } : {}),
    divergencePct,
    divergenceStatus,
    staleActiveCount,
    syncAgeHours,
  };
}
