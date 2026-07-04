// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/getHourlyPattern.ts   —  T9
//
//  Hour-of-day × day-of-week performance heatmap. Reads the
//  'hourly_stats_aggregated_by_advertiser_time_zone' breakdown dimension
//  added to syncBreakdowns() in Phase 2.1b — Meta returns this as a
//  breakdownValue string like "13:00:00 - 13:59:59"; we parse the start
//  hour out of it.
//
//  breakdownStat rows are CAMPAIGN-scoped (syncBreakdowns iterates
//  campaigns, not the account as a whole) — 'account' scope here means
//  "sum across every campaign in the workspace's ad account", not a
//  separately-synced account-level row.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.4 T9
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

const HOURLY_KEY = 'hourly_stats_aggregated_by_advertiser_time_zone';

type Metric = 'ctr' | 'cpm' | 'messages' | 'cost_per_message';

interface GetHourlyPatternArgs {
  scope: 'account' | 'campaign';
  campaignId?: string;
  metric: Metric;
  windowDays: number;
}

interface Slot {
  dayOfWeek: number;   // 0 = Sunday .. 6 = Saturday (UTC)
  hour: number;        // 0-23
  value: number;
  sampleSize: number;  // number of distinct dates contributing to this cell
}

interface GetHourlyPatternResult {
  metric: Metric;
  /** 7 rows (day 0 = Sunday) × 24 columns (hour). null when no data for that cell. */
  heatmap: (number | null)[][];
  bestSlots: Slot[];
  worstSlots: Slot[];
  reliability: 'high' | 'medium' | 'low';
}

/** Below this average sample count per populated cell, flag reliability low. */
const RELIABILITY_LOW_THRESHOLD = 2;
const RELIABILITY_HIGH_THRESHOLD = 4;
const MIN_SLOTS_FOR_RANKING = 3;   // need at least this many populated cells to rank best/worst

export function getHourlyPatternHandler(): ToolHandler<GetHourlyPatternArgs, GetHourlyPatternResult> {
  return {
    name: 'get_hourly_pattern',
    description:
      "Hour-of-day x day-of-week performance heatmap for a campaign or the whole account. Reveals WHEN ads perform best — useful for suggesting a dayparting change. Reads Meta's hourly_stats_aggregated_by_advertiser_time_zone breakdown (in the ad account's own reporting timezone, so no timezone conversion needed). Returns the top-3 best hours and bottom-3 worst hours with a reliability flag based on how many distinct days contributed to each cell. Use when merchant asks about timing, or before suggesting a schedule change.",
    schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['account', 'campaign'], default: 'account' },
        campaignId: { type: 'string', description: "Required when scope='campaign'" },
        metric: { type: 'string', enum: ['ctr', 'cpm', 'messages', 'cost_per_message'], default: 'cost_per_message' },
        windowDays: { type: 'integer', minimum: 7, maximum: 60, default: 30 },
      },
      additionalProperties: false,
    },
    cacheTtlSeconds: 900,
    timeoutMs: 6000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      if (args.scope === 'campaign' && !args.campaignId) {
        return fail('INVALID_INPUT', "campaignId is required when scope='campaign'", {
          field: 'campaignId', retryable: true,
        });
      }

      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      const account = ws?.adAccounts[0];
      if (!account) {
        return ok<GetHourlyPatternResult>(
          { metric: args.metric, heatmap: emptyHeatmap(), bestSlots: [], worstSlots: [], reliability: 'low' },
          { sourceTable: 'ad_accounts', latestRowDate: null, stalenessMinutes: null },
        );
      }
      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);

      let campaignIds: string[];
      if (args.scope === 'campaign') {
        const camp = await prisma.campaign.findFirst({
          where: { id: args.campaignId!, adAccountId: account.id },
        });
        if (!camp) {
          return fail('NOT_FOUND', `Campaign "${args.campaignId}" not found in this workspace`, {
            field: 'campaignId', retryable: false,
          });
        }
        campaignIds = [camp.id];
      } else {
        const campaigns = await prisma.campaign.findMany({
          where: { adAccountId: account.id },
          select: { id: true },
        });
        campaignIds = campaigns.map((c) => c.id);
      }

      if (campaignIds.length === 0) {
        return ok<GetHourlyPatternResult>(
          { metric: args.metric, heatmap: emptyHeatmap(), bestSlots: [], worstSlots: [], reliability: 'low' },
          { sourceTable: 'breakdown_stats', latestRowDate: null, stalenessMinutes: null },
        );
      }

      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - args.windowDays * 864e5);

      const rows = await prisma.breakdownStat.findMany({
        where: {
          entityType: EntityType.CAMPAIGN,
          entityId: { in: campaignIds },
          breakdownKey: HOURLY_KEY,
          date: { gte: sinceDate },
        },
      });

      if (rows.length === 0) {
        return ok<GetHourlyPatternResult>(
          { metric: args.metric, heatmap: emptyHeatmap(), bestSlots: [], worstSlots: [], reliability: 'low' },
          {
            sourceTable: 'breakdown_stats',
            latestRowDate: null,
            stalenessMinutes: account.lastSyncedAt
              ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
              : null,
          },
        );
      }

      // Aggregate per (dayOfWeek, hour): sum spend/impressions/clicks/messages,
      // and track the SET of distinct dates seen (sample size = date count, not row count,
      // since a campaign scope='account' run sums multiple campaigns per date/hour).
      interface Cell { spend: number; impressions: number; clicks: number; messages: number; dates: Set<string> }
      const cells = new Map<string, Cell>();   // key = `${dow}:${hour}`

      for (const r of rows) {
        const hour = parseHourFromBreakdownValue(r.breakdownValue);
        if (hour == null) continue;
        const dow = r.date.getUTCDay();
        const key = `${dow}:${hour}`;
        const cell = cells.get(key) ?? { spend: 0, impressions: 0, clicks: 0, messages: 0, dates: new Set<string>() };
        cell.spend += Number(r.spend);
        cell.impressions += Number(r.impressions);
        cell.clicks += Number(r.clicks);
        cell.messages += Number(r.messages);
        cell.dates.add(r.date.toISOString().slice(0, 10));
        cells.set(key, cell);
      }

      const heatmap: (number | null)[][] = emptyHeatmap();
      const slots: Slot[] = [];
      let totalSampleSum = 0;
      let populatedCells = 0;

      for (const [key, cell] of cells) {
        const [dowStr, hourStr] = key.split(':');
        const dow = Number(dowStr);
        const hour = Number(hourStr);
        const spendMajor = factor === 1 ? cell.spend : cell.spend / factor;
        const value = computeCellMetric(args.metric, cell, spendMajor);
        if (value == null) continue;
        heatmap[dow]![hour] = value;
        const sampleSize = cell.dates.size;
        slots.push({ dayOfWeek: dow, hour, value, sampleSize });
        totalSampleSum += sampleSize;
        populatedCells++;
      }

      const avgSample = populatedCells > 0 ? totalSampleSum / populatedCells : 0;
      const reliability: GetHourlyPatternResult['reliability'] =
        avgSample >= RELIABILITY_HIGH_THRESHOLD ? 'high' : avgSample >= RELIABILITY_LOW_THRESHOLD ? 'medium' : 'low';

      const higherBetter = args.metric === 'ctr' || args.metric === 'messages';
      const eligible = slots.filter((s) => s.sampleSize >= 2);   // require >=2 distinct days to rank
      const sorted = [...eligible].sort((a, b) => higherBetter ? b.value - a.value : a.value - b.value);
      const bestSlots = sorted.slice(0, 3);
      const worstSlots = eligible.length >= MIN_SLOTS_FOR_RANKING ? sorted.slice(-3).reverse() : [];

      const latestRowDate = rows.map((r) => r.date.getTime()).reduce((a, b) => Math.max(a, b), 0);

      return ok<GetHourlyPatternResult>(
        {
          metric: args.metric,
          heatmap,
          bestSlots,
          worstSlots,
          reliability,
        },
        {
          sourceTable: 'breakdown_stats',
          latestRowDate: latestRowDate > 0 ? new Date(latestRowDate).toISOString().slice(0, 10) : null,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<GetHourlyPatternArgs, GetHourlyPatternResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function emptyHeatmap(): (number | null)[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null));
}

/** Meta's hourly breakdown value is a string like "13:00:00 - 13:59:59".
 *  Extract the leading hour. Returns null when unparseable. */
function parseHourFromBreakdownValue(value: string): number | null {
  const match = value.match(/^(\d{1,2}):/);
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

function computeCellMetric(
  metric: Metric,
  cell: { spend: number; impressions: number; clicks: number; messages: number },
  spendMajor: number,
): number | null {
  switch (metric) {
    case 'messages': return cell.messages;
    case 'ctr': return cell.impressions > 0 ? +(cell.clicks / cell.impressions * 100).toFixed(4) : null;
    case 'cpm': return cell.impressions > 0 ? +(spendMajor / cell.impressions * 1000).toFixed(4) : null;
    case 'cost_per_message': return cell.messages > 0 ? +(spendMajor / cell.messages).toFixed(4) : null;
  }
}

export type { GetHourlyPatternArgs, GetHourlyPatternResult };
void (undefined as unknown as PrismaClient | undefined);
