// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/getAudienceBreakdown.ts   —  T5
//
//  Split a campaign's metrics by ONE Meta breakdown dimension:
//    age | gender | country | placement | platform | device
//
//  Reads breakdownStat (synced by syncBreakdowns() in syncAccount.ts). Only
//  dimensions we sync will return data — new keys added at sync-time appear
//  here automatically without a code change.
//
//  Adds two v3 features (§3.3 T5):
//    • segmentSignificance — is the sample size trustworthy for THIS metric?
//    • concentrationIndex   — how concentrated is spend across segments?
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 T5
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

/** Meta dimension names — verbatim from syncBreakdowns DIMENSIONS array. */
const DIMENSION_MAP: Record<string, string[]> = {
  age: ['age'],
  gender: ['gender'],
  placement: ['platform_position'],
  platform: ['publisher_platform'],
  country: ['country'],   // reserved: not yet synced but harmless
  device: ['device_platform', 'impression_device'],   // reserved
};

/** Metrics computable from breakdownStat's four columns (+ derived ratios). */
type Metric = 'spend' | 'messages' | 'ctr' | 'cpm' | 'cost_per_message' | 'roas';

interface GetAudienceBreakdownArgs {
  campaignId: string;
  dimension: 'age' | 'gender' | 'country' | 'placement' | 'platform' | 'device';
  metric: Metric;
  windowDays: number;
  limit: number;
}

interface SegmentRow {
  segment: string;
  spend: number;
  messages: number;
  impressions: number;
  clicks: number;
  metricValue: number | null;
  metricDisplay: string;
  shareOfSpendPct: number;
  significant: boolean;
  significanceReason?: string;
}

interface AudienceBreakdownResult {
  campaignId: string;
  campaignName: string;
  dimension: string;
  metric: string;
  windowDays: number;
  segments: SegmentRow[];
  best: { segment: string; reason: string } | null;
  worst: { segment: string; reason: string } | null;
  /** Herfindahl-style spend concentration index (0..1). 1 = one segment eats all spend. */
  concentrationIndex: number | null;
  /** True when the campaign's spend concentrates in a single segment. */
  concentrationVerdict: 'narrow' | 'balanced' | 'broad';
}

/** Minimum row totals for a metric to be considered statistically meaningful.
 *  Below these the segment is still returned but flagged non-significant. */
const SIGNIFICANCE = {
  ctr_min_impressions: 100,
  cpm_min_impressions: 100,
  cost_per_message_min_messages: 10,
  roas_min_messages: 5,
  messages_min_spend_pct: 0.01,   // 1% of workspace total spend
} as const;

export function getAudienceBreakdownHandler(): ToolHandler<GetAudienceBreakdownArgs, AudienceBreakdownResult> {
  return {
    name: 'get_audience_breakdown',
    description:
      "Split a campaign's metrics by one audience/placement dimension (age, gender, country, placement, platform, device). Reads pre-synced breakdown data — no live Meta API call. Returns segments with per-segment metrics, shareOfSpendPct, best and worst segment with an Arabic reason, and a concentrationIndex (0-1) that tells you if spend is narrow (one segment eats all) or broad. Each segment has a `significant` flag — false when the sample is too thin for the metric to be trustworthy (e.g. cost_per_message with < 10 messages). Use when merchant asks about who the ad is reaching or which platform/age is working.",
    schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', minLength: 1 },
        dimension: {
          type: 'string',
          enum: ['age', 'gender', 'country', 'placement', 'platform', 'device'],
        },
        metric: {
          type: 'string',
          enum: ['spend', 'messages', 'ctr', 'cpm', 'cost_per_message', 'roas'],
          default: 'cost_per_message',
        },
        windowDays: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
        limit: { type: 'integer', minimum: 1, maximum: 30, default: 10 },
      },
      required: ['campaignId', 'dimension'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 300,
    timeoutMs: 5000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      const camp = await prisma.campaign.findFirst({
        where: { id: args.campaignId, adAccount: { workspaceId } },
        include: { adAccount: true },
      });
      if (!camp) {
        return fail('NOT_FOUND', `Campaign "${args.campaignId}" not found in this workspace`, {
          field: 'campaignId', retryable: false,
          suggestion: 'Call list_campaigns to see valid campaign ids.',
        });
      }

      const factor = resolveCurrencyMinorFactor(camp.adAccount.currency, camp.adAccount.currencyMinorFactor);
      const dimensionKeys = DIMENSION_MAP[args.dimension] ?? [];
      if (dimensionKeys.length === 0) {
        return fail('INVALID_INPUT', `Unsupported dimension "${args.dimension}"`, {
          field: 'dimension', retryable: false,
        });
      }

      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - args.windowDays * 864e5);

      const rows = await prisma.breakdownStat.findMany({
        where: {
          entityType: EntityType.CAMPAIGN,
          entityId: camp.id,
          breakdownKey: { in: dimensionKeys },
          date: { gte: sinceDate },
        },
      });

      if (rows.length === 0) {
        return ok<AudienceBreakdownResult>(
          {
            campaignId: camp.id,
            campaignName: camp.name,
            dimension: args.dimension,
            metric: args.metric,
            windowDays: args.windowDays,
            segments: [],
            best: null,
            worst: null,
            concentrationIndex: null,
            concentrationVerdict: 'balanced',
          },
          {
            sourceTable: 'breakdown_stats',
            latestRowDate: null,
            stalenessMinutes: camp.adAccount.lastSyncedAt
              ? Math.round((Date.now() - camp.adAccount.lastSyncedAt.getTime()) / 60_000)
              : null,
          },
        );
      }

      // Bucket rows per segment
      const bySegment = new Map<string, {
        spend: number; messages: number; impressions: number; clicks: number;
      }>();
      for (const r of rows) {
        const seg = r.breakdownValue;
        const acc = bySegment.get(seg) ?? { spend: 0, messages: 0, impressions: 0, clicks: 0 };
        acc.spend += Number(r.spend);
        acc.messages += Number(r.messages);
        acc.impressions += Number(r.impressions);
        acc.clicks += Number(r.clicks);
        bySegment.set(seg, acc);
      }

      const totalSpend = Array.from(bySegment.values()).reduce((a, r) => a + r.spend, 0);
      const currency = camp.adAccount.currency;

      const segments: SegmentRow[] = Array.from(bySegment.entries()).map(([segment, totals]) => {
        const spendMajor = factor === 1 ? totals.spend : totals.spend / factor;
        const metricValue = computeSegmentMetric(totals, args.metric, factor);
        const shareOfSpendPct = totalSpend > 0 ? +(totals.spend / totalSpend * 100).toFixed(2) : 0;
        const sig = evaluateSignificance(totals, totalSpend, args.metric);
        return {
          segment,
          spend: totals.spend,
          messages: totals.messages,
          impressions: totals.impressions,
          clicks: totals.clicks,
          metricValue,
          metricDisplay: formatSegmentMetric(args.metric, metricValue, currency, factor, spendMajor),
          shareOfSpendPct,
          significant: sig.ok,
          ...(sig.reason && { significanceReason: sig.reason }),
        };
      });

      // Sort segments best-first for the chosen metric.
      const higherBetter = args.metric === 'messages' || args.metric === 'ctr' || args.metric === 'roas';
      segments.sort((a, b) => {
        const av = a.metricValue ?? (higherBetter ? -Infinity : Infinity);
        const bv = b.metricValue ?? (higherBetter ? -Infinity : Infinity);
        return higherBetter ? bv - av : av - bv;
      });
      const limited = segments.slice(0, args.limit);

      // Best/worst only among significant + non-null
      const eligible = segments.filter((s) => s.significant && s.metricValue != null);
      const best = eligible[0] ?? null;
      const worst = eligible[eligible.length - 1] ?? null;

      // Herfindahl index (sum of squared spend shares).
      const concentrationIndex = totalSpend > 0
        ? +Array.from(bySegment.values())
            .reduce((a, r) => a + Math.pow(r.spend / totalSpend, 2), 0)
            .toFixed(3)
        : null;
      const concentrationVerdict: AudienceBreakdownResult['concentrationVerdict'] =
        concentrationIndex == null ? 'balanced'
          : concentrationIndex >= 0.6 ? 'narrow'
            : concentrationIndex <= 0.25 ? 'broad'
              : 'balanced';

      const latestRowDate = rows
        .map((r) => r.date.getTime())
        .reduce((a, b) => Math.max(a, b), 0);

      return ok<AudienceBreakdownResult>(
        {
          campaignId: camp.id,
          campaignName: camp.name,
          dimension: args.dimension,
          metric: args.metric,
          windowDays: args.windowDays,
          segments: limited,
          best: best ? { segment: best.segment, reason: buildReason(best.segment, args.metric, best.metricDisplay, 'أفضل') } : null,
          worst: worst && worst.segment !== best?.segment
            ? { segment: worst.segment, reason: buildReason(worst.segment, args.metric, worst.metricDisplay, 'أضعف') }
            : null,
          concentrationIndex,
          concentrationVerdict,
        },
        {
          sourceTable: 'breakdown_stats',
          latestRowDate: latestRowDate > 0 ? new Date(latestRowDate).toISOString().slice(0, 10) : null,
          stalenessMinutes: camp.adAccount.lastSyncedAt
            ? Math.round((Date.now() - camp.adAccount.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<GetAudienceBreakdownArgs, AudienceBreakdownResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function computeSegmentMetric(
  totals: { spend: number; messages: number; impressions: number; clicks: number },
  metric: Metric,
  factor: number,
): number | null {
  const spendMajor = factor === 1 ? totals.spend : totals.spend / factor;
  switch (metric) {
    case 'spend': return totals.spend;
    case 'messages': return totals.messages;
    case 'ctr': return totals.impressions > 0 ? +(totals.clicks / totals.impressions * 100).toFixed(4) : null;
    case 'cpm': return totals.impressions > 0 ? +(spendMajor / totals.impressions * 1000).toFixed(4) : null;
    case 'cost_per_message': return totals.messages > 0 ? +(spendMajor / totals.messages).toFixed(4) : null;
    case 'roas': return null;   // breakdownStat doesn't carry roas — return null with reason
  }
}

function formatSegmentMetric(
  metric: Metric,
  value: number | null,
  currency: string,
  factor: number,
  spendMajor: number,
): string {
  if (value == null) return '—';
  switch (metric) {
    case 'ctr': return `${value.toFixed(2)}%`;
    case 'messages': return Math.round(value).toLocaleString();
    case 'spend': return factor === 1 ? `${Math.round(spendMajor).toLocaleString()} ${currency}` : `${spendMajor.toFixed(2)} ${currency}`;
    case 'cpm':
    case 'cost_per_message':
      return factor === 1 ? `${Math.round(value).toLocaleString()} ${currency}` : `${value.toFixed(2)} ${currency}`;
    case 'roas': return `${value.toFixed(2)}x`;
  }
}

function evaluateSignificance(
  totals: { spend: number; messages: number; impressions: number },
  totalSpend: number,
  metric: Metric,
): { ok: boolean; reason?: string } {
  const spendShare = totalSpend > 0 ? totals.spend / totalSpend : 0;
  if (spendShare < SIGNIFICANCE.messages_min_spend_pct) {
    return { ok: false, reason: 'حصة إنفاق ضئيلة (< 1%)' };
  }
  switch (metric) {
    case 'ctr':
    case 'cpm':
      if (totals.impressions < SIGNIFICANCE.ctr_min_impressions) {
        return { ok: false, reason: `عيّنة صغيرة (< ${SIGNIFICANCE.ctr_min_impressions} ظهور)` };
      }
      return { ok: true };
    case 'cost_per_message':
      if (totals.messages < SIGNIFICANCE.cost_per_message_min_messages) {
        return { ok: false, reason: `عدد رسائل قليل (< ${SIGNIFICANCE.cost_per_message_min_messages})` };
      }
      return { ok: true };
    case 'roas':
      return { ok: false, reason: 'ROAS غير متاح على مستوى الشريحة (يُقاس على مستوى الحملة).' };
    default:
      return { ok: true };
  }
}

function buildReason(segment: string, metric: Metric, display: string, qualifier: string): string {
  const metricArabic: Record<Metric, string> = {
    ctr: 'CTR',
    cpm: 'CPM',
    cost_per_message: 'تكلفة الرسالة',
    spend: 'الإنفاق',
    messages: 'الرسائل',
    roas: 'ROAS',
  };
  return `${qualifier} شريحة بـ ${metricArabic[metric]}: ${segment} (${display})`;
}

export type { GetAudienceBreakdownArgs, AudienceBreakdownResult };
void (undefined as unknown as PrismaClient | undefined);
