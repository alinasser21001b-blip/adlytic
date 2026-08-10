import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

import { accountLocalTodayFloor, accountLocalDateFloor, isCurrentlySpending } from './campaignSpending';
import {
  classifyCampaignDelivery,
  RECENT_DELIVERY_DAYS,
  type DeliveryTier,
} from './campaignLifecycle';
import {
  resolveMetaAccountDeliveryState,
  type MetaAccountDeliveryState,
} from './metaAccountDelivery';

export interface CampaignCounts {
  /** All synced campaigns (excludes DELETED). */
  total: number;
  /** status === ACTIVE (Meta label — often higher than real delivery). */
  activeStatus: number;
  /** ACTIVE + spend today > 0 (account timezone). */
  spendingToday: number;
  /** Spend > 0 in the recent delivery window — primary "active" metric. */
  deliveringInWindow: number;
  /** ACTIVE status but zero recent spend (may still have older window spend). */
  dormantActive: number;
  /** status === PAUSED */
  paused: number;
  /** status === ARCHIVED */
  archived: number;
  /** Campaigns blocked because the ad account cannot deliver (debt, etc.). */
  accountBlocked: number;
  /** Campaigns with 30d metrics + health score in dashboard cards. */
  withMetrics: number;
  /** Days used for delivering/dormant split (full window). */
  deliveryWindowDays: number;
  /** Days used for the recent-spend delivering gate (today + yesterday). */
  recentDeliveryDays: number;
  /** Account-level Meta delivery gate (billing / disable). */
  accountDelivery: MetaAccountDeliveryState;
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

async function loadAccountDelivery(
  prisma: PrismaClient,
  adAccountId: string,
): Promise<MetaAccountDeliveryState> {
  const acct = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    select: { metaAccountStatus: true, metaDisableReason: true },
  });
  return resolveMetaAccountDeliveryState({
    metaAccountStatus: acct?.metaAccountStatus ?? null,
    metaDisableReason: acct?.metaDisableReason ?? null,
  });
}

/** Single source of truth for campaign counts shown across dashboard, AI, and lists. */
export async function getCampaignCounts(
  prisma: PrismaClient,
  adAccountId: string,
  timezone: string,
  withMetrics = 0,
  deliveryWindowDays = 30,
): Promise<CampaignCounts> {
  const accountDelivery = await loadAccountDelivery(prisma, adAccountId);
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: { not: 'DELETED' } },
    select: { id: true, status: true, metaEffectiveStatus: true },
  });

  if (!campaigns.length) {
    return {
      total: 0,
      activeStatus: 0,
      paused: 0,
      archived: 0,
      spendingToday: 0,
      deliveringInWindow: 0,
      dormantActive: 0,
      accountBlocked: 0,
      withMetrics,
      deliveryWindowDays,
      recentDeliveryDays: RECENT_DELIVERY_DAYS,
      accountDelivery,
    };
  }

  const activeRows = campaigns.filter((c) => c.status === 'ACTIVE');
  const tickToday = accountLocalTodayFloor(timezone);
  const sinceDate = accountLocalDateFloor(timezone, deliveryWindowDays);
  // Recent gate: today + (RECENT_DELIVERY_DAYS - 1) prior days → yesterday when =2.
  const recentSince = accountLocalDateFloor(timezone, RECENT_DELIVERY_DAYS - 1);
  const campaignIds = campaigns.map((c) => c.id);

  const [todayStats, windowAgg, recentAgg] = await Promise.all([
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
        })
      : Promise.resolve([]),
    campaignIds.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: campaignIds },
            date: { gte: recentSince },
          },
          _sum: { spend: true },
        })
      : Promise.resolve([]),
  ]);

  const spendTodayByCampaign = new Map(
    todayStats.map((s) => [s.entityId, Number(s.spend)]),
  );
  const spendWindowByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );
  const spendRecentByCampaign = new Map(
    recentAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );

  let spendingToday = 0;
  let deliveringInWindow = 0;
  let dormantActive = 0;
  let accountBlocked = 0;

  for (const c of campaigns) {
    const spendToday = spendTodayByCampaign.get(c.id) ?? 0;
    const spendWindow = spendWindowByCampaign.get(c.id) ?? 0;
    const spendRecent = spendRecentByCampaign.get(c.id) ?? 0;
    const tier = classifyCampaignDelivery({
      status: c.status,
      metaEffectiveStatus: c.metaEffectiveStatus,
      spendTodayMinor: spendToday,
      spendWindowMinor: spendWindow,
      spendRecentMinor: spendRecent,
      accountDeliverable: accountDelivery.deliverable,
    });
    if (tier === 'DELIVERING_TODAY') spendingToday += 1;
    if (tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW') deliveringInWindow += 1;
    if (tier === 'DORMANT_ACTIVE') dormantActive += 1;
    if (tier === 'ACCOUNT_BLOCKED') accountBlocked += 1;
  }

  return {
    total: campaigns.length,
    activeStatus: campaigns.filter((c) => c.status === 'ACTIVE').length,
    paused: campaigns.filter((c) => c.status === 'PAUSED').length,
    archived: campaigns.filter((c) => c.status === 'ARCHIVED').length,
    spendingToday,
    deliveringInWindow,
    dormantActive,
    accountBlocked,
    withMetrics,
    deliveryWindowDays,
    recentDeliveryDays: RECENT_DELIVERY_DAYS,
    accountDelivery,
  };
}

/** Full campaign catalog for AI matching and consistent UI labels. */
export async function getCampaignCatalog(
  prisma: PrismaClient,
  adAccountId: string,
  timezone: string,
  metricsById: Map<string, CampaignMetricsLookup> = new Map(),
): Promise<CampaignCatalogRow[]> {
  const accountDelivery = await loadAccountDelivery(prisma, adAccountId);
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
  const recentSince = accountLocalDateFloor(timezone, RECENT_DELIVERY_DAYS - 1);
  const allIds = campaigns.map((c) => c.id);
  const [todayStats, windowAgg, recentAgg] = await Promise.all([
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
        })
      : Promise.resolve([]),
    allIds.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: allIds },
            date: { gte: recentSince },
          },
          _sum: { spend: true },
        })
      : Promise.resolve([]),
  ]);
  const spendTodayByCampaign = new Map(
    todayStats.map((s) => [s.entityId, Number(s.spend)]),
  );
  const spendWindowByCampaign = new Map(
    windowAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );
  const spendRecentByCampaign = new Map(
    recentAgg.map((a) => [a.entityId, Number(a._sum.spend ?? 0)]),
  );

  return campaigns.map((c, index) => {
    const metrics = metricsById.get(c.id);
    const spendToday = spendTodayByCampaign.get(c.id) ?? 0;
    const spendWindow = spendWindowByCampaign.get(c.id) ?? 0;
    const spendRecent = spendRecentByCampaign.get(c.id) ?? 0;
    const spendingToday = isCurrentlySpending({
      status: c.status,
      spendTodayMinor: spendToday,
    });
    const deliveryTier = classifyCampaignDelivery({
      status: c.status,
      metaEffectiveStatus: c.metaEffectiveStatus,
      spendTodayMinor: spendToday,
      spendWindowMinor: spendWindow,
      spendRecentMinor: spendRecent,
      accountDeliverable: accountDelivery.deliverable,
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
    const blocked = counts.accountBlocked > 0
      ? ` · ${counts.accountBlocked} متوقفة بسبب الديون`
      : '';
    return `${counts.total} حملة (${counts.deliveringInWindow} تعمل · ${counts.spendingToday} تنفق اليوم · ${counts.dormantActive} نشطة بدون إنفاق${blocked} · ${counts.withMetrics} بمؤشرات)`;
  }
  const blocked = counts.accountBlocked > 0
    ? ` · ${counts.accountBlocked} billing-blocked`
    : '';
  return `${counts.total} campaigns (${counts.deliveringInWindow} delivering · ${counts.spendingToday} spending today · ${counts.dormantActive} dormant active${blocked} · ${counts.withMetrics} with metrics)`;
}

export function formatCampaignCatalogForPrompt(
  rows: CampaignCatalogRow[],
  counts: CampaignCounts,
): string {
  const lines: string[] = [
    `## Campaign catalog (${formatCampaignCountsLine(counts)})`,
    'Primary "active" = delivering (spend today or yesterday). DORMANT_ACTIVE = Meta ACTIVE but no recent spend.',
    'ACCOUNT_BLOCKED = ad account cannot deliver (unpaid Meta balance / disabled) — never tell the merchant these are running.',
    'Use this table to match user questions about a specific campaign by name, Meta id (metaId), or ref (#).',
    'If the user cites a number (e.g. "campaign 45"), try metaId first, then exact name, then ref.',
    '| ref | name | metaId | status | delivery | spending today | health | CTR% | messages |',
    '|-----|------|--------|--------|----------|----------------|--------|------|----------|',
  ];

  if (!counts.accountDelivery.deliverable) {
    lines.splice(1, 0, `ACCOUNT DELIVERY BLOCKED: ${counts.accountDelivery.labelEn}`);
  }

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
