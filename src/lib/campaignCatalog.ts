import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

import { accountLocalTodayFloor, accountLocalDateFloor, isCurrentlySpending } from './campaignSpending';
import { accountDeliveryHold, classifyCampaignDelivery, type DeliveryTier } from './campaignLifecycle';

/**
 * The account-level gate plus per-campaign spend recency, fetched HERE so no
 * caller can forget them. The extra cost is one indexed AdAccount read and a
 * _max aggregate on a groupBy that was already running.
 */
async function accountHaltedFor(prisma: PrismaClient, adAccountId: string): Promise<boolean> {
  const acct = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    select: { metaAccountStatus: true },
  });
  return accountDeliveryHold(acct?.metaAccountStatus).halted;
}

function daysSince(tickToday: Date, lastDate: Date | null | undefined): number | null {
  if (!lastDate) return null;
  return Math.floor((tickToday.getTime() - lastDate.getTime()) / 86400000);
}

export interface CampaignCounts {
  /** All synced campaigns (excludes DELETED). */
  total: number;
  /** status === ACTIVE (Meta label — often higher than real delivery). */
  activeStatus: number;
  /** ACTIVE + spend today > 0 (account timezone). */
  spendingToday: number;
  /** Spend > 0 in the delivery window (default 30d) — primary "active" metric. */
  deliveringInWindow: number;
  /** ACTIVE status but zero spend in the delivery window. */
  dormantActive: number;
  /** status === PAUSED */
  paused: number;
  /** status === ARCHIVED */
  archived: number;
  /** Campaigns with 30d metrics + health score in dashboard cards. */
  withMetrics: number;
  /** Days used for delivering/dormant split. */
  deliveryWindowDays: number;
  /**
   * Every campaign, counted under the tier it actually classified as.
   *
   * The named counters above cover only four of the eight tiers, and the two
   * status strips are built from them — so a merchant whose account Meta had
   * suspended for unpaid bills saw a strip titled «حملاتك الـ12 — أين تقف
   * فعلًا؟» above four zeroes and an empty bar: every campaign classified
   * ACCOUNT_HALTED, and nothing counted that. NOT_DELIVERING vanished the
   * same way.
   *
   * This record is exhaustive by construction — sum(byTier) === total — so a
   * consumer that spends it all can never drop a campaign, and a new tier
   * added to DeliveryTier is a type error here rather than a silent hole.
   */
  byTier: Record<DeliveryTier, number>;
}

/** A zeroed tally with one slot per tier — the exhaustiveness lives here. */
export function emptyTierTally(): Record<DeliveryTier, number> {
  return {
    DELIVERING_TODAY: 0,
    DELIVERING_WINDOW: 0,
    ACCOUNT_HALTED: 0,
    DORMANT_ACTIVE: 0,
    NOT_DELIVERING: 0,
    PAUSED: 0,
    ARCHIVED: 0,
    DELETED: 0,
  };
}

export interface CampaignCatalogRow {
  /** 1-based row index for AI / UI disambiguation. */
  ref: number;
  name: string;
  /** Meta external campaign id — safe to expose to LLM for "campaign 45" matching. */
  metaId: string;
  status: string;
  deliveryTier: DeliveryTier;
  spendingToday: boolean;
  deliveringInWindow: boolean;
  health?: number;
  ctr?: number | null;
  messages?: number;
}

export interface CampaignMetricsLookup {
  health: number;
  ctr: number | null;
  messages: number;
}

/** Single source of truth for campaign counts shown across dashboard, AI, and lists. */
export async function getCampaignCounts(
  prisma: PrismaClient,
  adAccountId: string,
  timezone: string,
  withMetrics = 0,
  deliveryWindowDays = 30,
): Promise<CampaignCounts> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: { not: 'DELETED' } },
    select: { id: true, status: true, metaEffectiveStatus: true },
  });

  if (!campaigns.length) {
    return {
      byTier: emptyTierTally(),
      total: 0,
      activeStatus: 0,
      paused: 0,
      archived: 0,
      spendingToday: 0,
      deliveringInWindow: 0,
      dormantActive: 0,
      withMetrics,
      deliveryWindowDays,
    };
  }

  const activeRows = campaigns.filter((c) => c.status === 'ACTIVE');
  const tickToday = accountLocalTodayFloor(timezone);
  const sinceDate = accountLocalDateFloor(timezone, deliveryWindowDays);
  const campaignIds = campaigns.map((c) => c.id);

  const [todayStats, windowAgg] = await Promise.all([
    activeRows.length
      ? prisma.dailyStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: activeRows.map((c) => c.id) },
            date: tickToday,
          },
          select: { entityId: true, spend: true },
        })
      : Promise.resolve([]),
    campaignIds.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: campaignIds },
            date: { gte: sinceDate },
          },
          _sum: { spend: true },
          _max: { date: true },
        })
      : Promise.resolve([]),
  ]);
  const accountHalted = await accountHaltedFor(prisma, adAccountId);

  const spendTodayByCampaign = new Map(
    todayStats.map((s) => [s.entityId, Number(s.spend)]),
  );
  const spendWindowByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );
  const lastSpendByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, a._max?.date ?? null]),
  );

  let spendingToday = 0;
  let deliveringInWindow = 0;
  let dormantActive = 0;
  const byTier = emptyTierTally();

  for (const c of campaigns) {
    const spendToday = spendTodayByCampaign.get(c.id) ?? 0;
    const spendWindow = spendWindowByCampaign.get(c.id) ?? 0;
    const tier = classifyCampaignDelivery({
      status: c.status,
      metaEffectiveStatus: c.metaEffectiveStatus,
      spendTodayMinor: spendToday,
      spendWindowMinor: spendWindow,
      daysSinceLastSpend: daysSince(tickToday, lastSpendByCampaign.get(c.id)),
      accountHalted,
    });
    byTier[tier] += 1;
    if (tier === 'DELIVERING_TODAY') spendingToday += 1;
    if (tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW') deliveringInWindow += 1;
    if (tier === 'DORMANT_ACTIVE') dormantActive += 1;
  }

  return {
    byTier,
    total: campaigns.length,
    activeStatus: campaigns.filter((c) => c.status === 'ACTIVE').length,
    paused: campaigns.filter((c) => c.status === 'PAUSED').length,
    archived: campaigns.filter((c) => c.status === 'ARCHIVED').length,
    spendingToday,
    deliveringInWindow,
    dormantActive,
    withMetrics,
    deliveryWindowDays,
  };
}

/** Full campaign catalog for AI matching and consistent UI labels. */
export async function getCampaignCatalog(
  prisma: PrismaClient,
  adAccountId: string,
  timezone: string,
  metricsById: Map<string, CampaignMetricsLookup> = new Map(),
): Promise<CampaignCatalogRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: { not: 'DELETED' } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      externalCampaignId: true,
      status: true,
      metaEffectiveStatus: true,
    },
  });

  if (!campaigns.length) return [];

  const activeIds = campaigns.filter((c) => c.status === 'ACTIVE').map((c) => c.id);
  const tickToday = accountLocalTodayFloor(timezone);
  const sinceDate = accountLocalDateFloor(timezone, 30);
  const allIds = campaigns.map((c) => c.id);
  const [todayStats, windowAgg] = await Promise.all([
    activeIds.length
      ? prisma.dailyStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: activeIds },
            date: tickToday,
          },
          select: { entityId: true, spend: true },
        })
      : Promise.resolve([]),
    allIds.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: allIds },
            date: { gte: sinceDate },
          },
          _sum: { spend: true },
          _max: { date: true },
        })
      : Promise.resolve([]),
  ]);
  const accountHalted = await accountHaltedFor(prisma, adAccountId);
  const spendTodayByCampaign = new Map(
    todayStats.map((s) => [s.entityId, Number(s.spend)]),
  );
  const spendWindowByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );
  const lastSpendByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, a._max?.date ?? null]),
  );

  return campaigns.map((c, index) => {
    const metrics = metricsById.get(c.id);
    const spendToday = spendTodayByCampaign.get(c.id) ?? 0;
    const spendWindow = spendWindowByCampaign.get(c.id) ?? 0;
    const spendingToday = isCurrentlySpending({
      status: c.status,
      spendTodayMinor: spendToday,
    });
    const deliveryTier = classifyCampaignDelivery({
      status: c.status,
      metaEffectiveStatus: c.metaEffectiveStatus,
      spendTodayMinor: spendToday,
      spendWindowMinor: spendWindow,
      daysSinceLastSpend: daysSince(tickToday, lastSpendByCampaign.get(c.id)),
      accountHalted,
    });
    return {
      ref: index + 1,
      name: c.name,
      metaId: c.externalCampaignId,
      status: c.status,
      deliveryTier,
      spendingToday,
      deliveringInWindow: deliveryTier === 'DELIVERING_TODAY' || deliveryTier === 'DELIVERING_WINDOW',
      ...(metrics
        ? { health: metrics.health, ctr: metrics.ctr, messages: metrics.messages }
        : {}),
    };
  });
}

export function formatCampaignCountsLine(counts: CampaignCounts, locale: 'EN' | 'AR' = 'EN'): string {
  if (locale === 'AR') {
    return `${counts.total} حملة (${counts.deliveringInWindow} تعمل · ${counts.spendingToday} تنفق اليوم · ${counts.dormantActive} نشطة بدون إنفاق · ${counts.withMetrics} بمؤشرات)`;
  }
  return `${counts.total} campaigns (${counts.deliveringInWindow} delivering · ${counts.spendingToday} spending today · ${counts.dormantActive} dormant active · ${counts.withMetrics} with metrics)`;
}

export function formatCampaignCatalogForPrompt(
  rows: CampaignCatalogRow[],
  counts: CampaignCounts,
): string {
  const lines: string[] = [
    `## Campaign catalog (${formatCampaignCountsLine(counts)})`,
    'Primary "active" = delivering (spend in window). DORMANT_ACTIVE = Meta ACTIVE but no recent spend.',
    'Use this table to match user questions about a specific campaign by name, Meta id (metaId), or ref (#).',
    'If the user cites a number (e.g. "campaign 45"), try metaId first, then exact name, then ref.',
    '| ref | name | metaId | status | delivery | spending today | health | CTR% | messages |',
    '|-----|------|--------|--------|----------|----------------|--------|------|----------|',
  ];

  const cap = 40;
  for (const row of rows.slice(0, cap)) {
    lines.push(
      `| ${row.ref} | ${row.name} | ${row.metaId} | ${row.status} | ${row.deliveryTier} | ${row.spendingToday ? 'yes' : 'no'} | ${row.health ?? '—'} | ${row.ctr != null ? row.ctr.toFixed(2) : '—'} | ${row.messages ?? '—'} |`,
    );
  }
  if (rows.length > cap) {
    lines.push(`_(+${rows.length - cap} more campaigns omitted — ask user to clarify name or Meta id)_`);
  }
  return lines.join('\n');
}
