import type { PrismaClient } from '@prisma/client';
import { EntityType } from '@prisma/client';

import { accountLocalTodayFloor, isCurrentlySpending } from './campaignSpending';

export interface CampaignCounts {
  /** All synced campaigns (excludes DELETED). */
  total: number;
  /** status === ACTIVE */
  activeStatus: number;
  /** status === PAUSED */
  paused: number;
  /** status === ARCHIVED */
  archived: number;
  /** ACTIVE + spend today > 0 (account timezone). */
  spendingToday: number;
  /** Campaigns with 30d metrics + health score in dashboard cards. */
  withMetrics: number;
}

export interface CampaignCatalogRow {
  /** 1-based row index for AI / UI disambiguation. */
  ref: number;
  name: string;
  /** Meta external campaign id — safe to expose to LLM for "campaign 45" matching. */
  metaId: string;
  status: string;
  spendingToday: boolean;
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
): Promise<CampaignCounts> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: { not: 'DELETED' } },
    select: { id: true, status: true },
  });

  if (!campaigns.length) {
    return {
      total: 0,
      activeStatus: 0,
      paused: 0,
      archived: 0,
      spendingToday: 0,
      withMetrics,
    };
  }

  const activeRows = campaigns.filter((c) => c.status === 'ACTIVE');
  const tickToday = accountLocalTodayFloor(timezone);
  const todayStats = activeRows.length
    ? await prisma.dailyStat.findMany({
        where: {
          entityType: EntityType.CAMPAIGN,
          entityId: { in: activeRows.map((c) => c.id) },
          date: tickToday,
        },
        select: { entityId: true, spend: true },
      })
    : [];
  const spendTodayByCampaign = new Map(
    todayStats.map((s) => [s.entityId, Number(s.spend)]),
  );

  const spendingToday = activeRows.filter((c) =>
    isCurrentlySpending({
      status: c.status,
      spendTodayMinor: spendTodayByCampaign.get(c.id) ?? 0,
    }),
  ).length;

  return {
    total: campaigns.length,
    activeStatus: campaigns.filter((c) => c.status === 'ACTIVE').length,
    paused: campaigns.filter((c) => c.status === 'PAUSED').length,
    archived: campaigns.filter((c) => c.status === 'ARCHIVED').length,
    spendingToday,
    withMetrics,
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
    },
  });

  if (!campaigns.length) return [];

  const activeIds = campaigns.filter((c) => c.status === 'ACTIVE').map((c) => c.id);
  const tickToday = accountLocalTodayFloor(timezone);
  const todayStats = activeIds.length
    ? await prisma.dailyStat.findMany({
        where: {
          entityType: EntityType.CAMPAIGN,
          entityId: { in: activeIds },
          date: tickToday,
        },
        select: { entityId: true, spend: true },
      })
    : [];
  const spendTodayByCampaign = new Map(
    todayStats.map((s) => [s.entityId, Number(s.spend)]),
  );

  return campaigns.map((c, index) => {
    const metrics = metricsById.get(c.id);
    return {
      ref: index + 1,
      name: c.name,
      metaId: c.externalCampaignId,
      status: c.status,
      spendingToday: isCurrentlySpending({
        status: c.status,
        spendTodayMinor: spendTodayByCampaign.get(c.id) ?? 0,
      }),
      ...(metrics
        ? { health: metrics.health, ctr: metrics.ctr, messages: metrics.messages }
        : {}),
    };
  });
}

export function formatCampaignCountsLine(counts: CampaignCounts, locale: 'EN' | 'AR' = 'EN'): string {
  if (locale === 'AR') {
    return `${counts.total} حملة (${counts.activeStatus} نشطة · ${counts.spendingToday} تنفق اليوم · ${counts.withMetrics} بمؤشرات)`;
  }
  return `${counts.total} campaigns (${counts.activeStatus} active · ${counts.spendingToday} spending today · ${counts.withMetrics} with metrics)`;
}

export function formatCampaignCatalogForPrompt(
  rows: CampaignCatalogRow[],
  counts: CampaignCounts,
): string {
  const lines: string[] = [
    `## Campaign catalog (${formatCampaignCountsLine(counts)})`,
    'Use this table to match user questions about a specific campaign by name, Meta id (metaId), or ref (#).',
    'If the user cites a number (e.g. "campaign 45"), try metaId first, then exact name, then ref.',
    '| ref | name | metaId | status | spending today | health | CTR% | messages |',
    '|-----|------|--------|--------|----------------|--------|------|----------|',
  ];

  const cap = 40;
  for (const row of rows.slice(0, cap)) {
    lines.push(
      `| ${row.ref} | ${row.name} | ${row.metaId} | ${row.status} | ${row.spendingToday ? 'yes' : 'no'} | ${row.health ?? '—'} | ${row.ctr != null ? row.ctr.toFixed(2) : '—'} | ${row.messages ?? '—'} |`,
    );
  }
  if (rows.length > cap) {
    lines.push(`_(+${rows.length - cap} more campaigns omitted — ask user to clarify name or Meta id)_`);
  }
  return lines.join('\n');
}
