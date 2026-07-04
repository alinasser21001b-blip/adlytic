// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/getCreativePerformance.ts   —  T6
//
//  Rank the ads (creatives) inside ONE campaign by a chosen metric, with
//  creative feature extraction (has_video, has_carousel, text_length_bucket,
//  cta_type, headline_first_word, has_emoji) and feature-vs-metric
//  correlations so the agent can say WHAT characteristic correlates with
//  performance, not just WHICH ad is best.
//
//  Depends on syncAccount.ts's syncAdInsights() (Pass D) populating
//  DailyStat with entityType=AD — added alongside this tool since ad-level
//  metrics were never synced before (see that commit for the full story).
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 T6
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

type Metric = 'cost_per_message' | 'ctr' | 'cpm' | 'spend' | 'messages';

interface GetCreativePerformanceArgs {
  campaignId: string;
  windowDays: number;
  limit: number;
  metric: Metric;
}

interface CreativeFeatures {
  hasVideo: boolean;
  hasCarousel: boolean;
  textLengthBucket: 'short' | 'medium' | 'long' | 'unknown';
  ctaType: string | null;
  headlineFirstWord: string | null;
  hasEmoji: boolean;
}

interface RankedAd {
  rank: number;
  adId: string;
  adName: string;
  creativeId: string | null;
  thumbnailUrl: string | null;
  metricValue: number | null;
  metricDisplay: string;
  spend: number;
  messages: number;
  features: CreativeFeatures;
}

interface FeatureCorrelation {
  feature: string;
  /** Simplified correlation: (mean metric WITH feature - mean metric WITHOUT) / mean WITHOUT, as a ratio. */
  correlation: number;
  note: string;
}

interface GetCreativePerformanceResult {
  campaignId: string;
  campaignName: string;
  metric: Metric;
  windowDays: number;
  ranked: RankedAd[];
  featureCorrelations: FeatureCorrelation[];
  totalAdsWithData: number;
}

const HIGHER_IS_BETTER: Record<Metric, boolean> = {
  ctr: true,
  messages: true,
  cpm: false,
  cost_per_message: false,
  spend: false,
};

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function getCreativePerformanceHandler(): ToolHandler<GetCreativePerformanceArgs, GetCreativePerformanceResult> {
  return {
    name: 'get_creative_performance',
    description:
      "Rank the ads (creatives) inside ONE campaign by a metric, with extracted creative features (has_video, has_carousel, text_length_bucket, cta_type, headline_first_word, has_emoji) and featureCorrelations showing which characteristics correlate with the metric. Use when the merchant asks 'أي إعلان يشتغل أفضل' or 'ليش الإعلان ما يشتغل'. Requires ad-level sync data — if totalAdsWithData is 0, the campaign's ads haven't accumulated daily stats yet (wait for the next sync cycle) rather than having no ads at all.",
    schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', minLength: 1 },
        windowDays: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        metric: {
          type: 'string',
          enum: ['cost_per_message', 'ctr', 'cpm', 'spend', 'messages'],
          default: 'cost_per_message',
        },
      },
      required: ['campaignId'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 300,
    timeoutMs: 6000,
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
      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - args.windowDays * 864e5);

      const ads = await prisma.ad.findMany({
        where: { adSet: { campaignId: camp.id } },
        include: { creative: true },
      });
      if (ads.length === 0) {
        return ok<GetCreativePerformanceResult>(
          {
            campaignId: camp.id,
            campaignName: camp.name,
            metric: args.metric,
            windowDays: args.windowDays,
            ranked: [],
            featureCorrelations: [],
            totalAdsWithData: 0,
          },
          {
            sourceTable: 'ads',
            latestRowDate: null,
            stalenessMinutes: camp.adAccount.lastSyncedAt
              ? Math.round((Date.now() - camp.adAccount.lastSyncedAt.getTime()) / 60_000)
              : null,
          },
        );
      }

      const adIds = ads.map((a) => a.id);
      const dailyRows = await prisma.dailyStat.findMany({
        where: { entityType: EntityType.AD, entityId: { in: adIds }, date: { gte: sinceDate } },
      });

      const byAd = new Map<string, typeof dailyRows>();
      for (const r of dailyRows) {
        const arr = byAd.get(r.entityId) ?? [];
        arr.push(r);
        byAd.set(r.entityId, arr);
      }

      const currency = camp.adAccount.currency;
      const items: RankedAd[] = [];
      for (const ad of ads) {
        const rows = byAd.get(ad.id) ?? [];
        if (rows.length === 0) continue;   // no ad-level data yet for this ad

        const spend = rows.reduce((a, r) => a + Number(r.spend), 0);
        const messages = rows.reduce((a, r) => a + Number(r.messages), 0);
        const impressions = rows.reduce((a, r) => a + Number(r.impressions), 0);
        const clicks = rows.reduce((a, r) => a + Number(r.clicks), 0);
        const spendMajor = factor === 1 ? spend : spend / factor;

        const metricValue = computeMetric(args.metric, { spend, messages, impressions, clicks, spendMajor });
        const features = extractFeatures(ad.creative);

        items.push({
          rank: 0,   // assigned after sort
          adId: ad.id,
          adName: ad.name,
          creativeId: ad.creativeId,
          thumbnailUrl: ad.creative?.thumbnailUrl ?? null,
          metricValue,
          metricDisplay: formatMetric(args.metric, metricValue, currency, factor),
          spend,
          messages,
          features,
        });
      }

      const higherBetter = HIGHER_IS_BETTER[args.metric];
      items.sort((a, b) => {
        const av = a.metricValue ?? (higherBetter ? -Infinity : Infinity);
        const bv = b.metricValue ?? (higherBetter ? -Infinity : Infinity);
        return higherBetter ? bv - av : av - bv;
      });
      items.forEach((it, idx) => { it.rank = idx + 1; });
      const limited = items.slice(0, args.limit);

      const featureCorrelations = computeFeatureCorrelations(items, args.metric, higherBetter);

      const latestRowDate = dailyRows.length > 0
        ? dailyRows.map((r) => r.date.getTime()).reduce((a, b) => Math.max(a, b), 0)
        : 0;

      return ok<GetCreativePerformanceResult>(
        {
          campaignId: camp.id,
          campaignName: camp.name,
          metric: args.metric,
          windowDays: args.windowDays,
          ranked: limited,
          featureCorrelations,
          totalAdsWithData: items.length,
        },
        {
          sourceTable: 'daily_stats',
          latestRowDate: latestRowDate > 0 ? new Date(latestRowDate).toISOString().slice(0, 10) : null,
          stalenessMinutes: camp.adAccount.lastSyncedAt
            ? Math.round((Date.now() - camp.adAccount.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<GetCreativePerformanceArgs, GetCreativePerformanceResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function computeMetric(
  metric: Metric,
  totals: { spend: number; messages: number; impressions: number; clicks: number; spendMajor: number },
): number | null {
  switch (metric) {
    case 'spend': return totals.spend;
    case 'messages': return totals.messages;
    case 'ctr': return totals.impressions > 0 ? +(totals.clicks / totals.impressions * 100).toFixed(4) : null;
    case 'cpm': return totals.impressions > 0 ? +(totals.spendMajor / totals.impressions * 1000).toFixed(4) : null;
    case 'cost_per_message': return totals.messages > 0 ? +(totals.spendMajor / totals.messages).toFixed(4) : null;
  }
}

function formatMetric(metric: Metric, value: number | null, currency: string, factor: number): string {
  if (value == null) return '—';
  switch (metric) {
    case 'ctr': return `${value.toFixed(2)}%`;
    case 'messages': return Math.round(value).toLocaleString();
    case 'spend': {
      const major = factor === 1 ? value : value / factor;
      return factor === 1 ? `${Math.round(major).toLocaleString()} ${currency}` : `${major.toFixed(2)} ${currency}`;
    }
    case 'cpm':
    case 'cost_per_message':
      return factor === 1 ? `${Math.round(value).toLocaleString()} ${currency}` : `${value.toFixed(2)} ${currency}`;
  }
}

interface CreativeRow {
  videoId: string | null;
  primaryText: string | null;
  headline: string | null;
  callToActionType: string | null;
  raw: unknown;
}

function extractFeatures(creative: CreativeRow | null): CreativeFeatures {
  if (!creative) {
    return {
      hasVideo: false,
      hasCarousel: false,
      textLengthBucket: 'unknown',
      ctaType: null,
      headlineFirstWord: null,
      hasEmoji: false,
    };
  }

  const hasVideo = creative.videoId != null;
  const hasCarousel = detectCarousel(creative.raw);
  const textLen = creative.primaryText?.length ?? 0;
  const textLengthBucket: CreativeFeatures['textLengthBucket'] =
    creative.primaryText == null ? 'unknown' : textLen < 60 ? 'short' : textLen <= 160 ? 'medium' : 'long';
  const headlineFirstWord = creative.headline?.trim().split(/\s+/)[0] ?? null;
  const hasEmoji = creative.primaryText != null && EMOJI_REGEX.test(creative.primaryText);

  return {
    hasVideo,
    hasCarousel,
    textLengthBucket,
    ctaType: creative.callToActionType,
    headlineFirstWord,
    hasEmoji,
  };
}

function detectCarousel(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  const oss = r['object_story_spec'] as Record<string, unknown> | undefined;
  const linkData = oss?.['link_data'] as Record<string, unknown> | undefined;
  const children = linkData?.['child_attachments'];
  return Array.isArray(children) && children.length > 1;
}

/**
 * For each boolean/categorical feature, split ranked items into "has" vs
 * "doesn't have" and compare mean metric values. Returns up to 3 features
 * with the largest |relative difference|, each requiring at least 2 items
 * in both groups to avoid a single-ad artifact masquerading as a pattern.
 */
function computeFeatureCorrelations(
  items: RankedAd[],
  metric: Metric,
  higherBetter: boolean,
): FeatureCorrelation[] {
  const MIN_GROUP_SIZE = 2;
  const withValues = items.filter((i) => i.metricValue != null);
  if (withValues.length < MIN_GROUP_SIZE * 2) return [];

  const checks: Array<{ label: string; predicate: (i: RankedAd) => boolean }> = [
    { label: 'has_video', predicate: (i) => i.features.hasVideo },
    { label: 'has_carousel', predicate: (i) => i.features.hasCarousel },
    { label: 'has_emoji', predicate: (i) => i.features.hasEmoji },
    { label: 'text_length_bucket=short', predicate: (i) => i.features.textLengthBucket === 'short' },
    { label: 'text_length_bucket=long', predicate: (i) => i.features.textLengthBucket === 'long' },
  ];

  const results: FeatureCorrelation[] = [];
  for (const check of checks) {
    const withFeature = withValues.filter(check.predicate);
    const withoutFeature = withValues.filter((i) => !check.predicate(i));
    if (withFeature.length < MIN_GROUP_SIZE || withoutFeature.length < MIN_GROUP_SIZE) continue;

    const meanWith = mean(withFeature.map((i) => i.metricValue!));
    const meanWithout = mean(withoutFeature.map((i) => i.metricValue!));
    if (meanWithout === 0) continue;
    const relDiff = (meanWith - meanWithout) / Math.abs(meanWithout);
    if (Math.abs(relDiff) < 0.1) continue;   // < 10% difference — not worth reporting

    // For higher-is-better metrics, a positive relDiff (with > without) is good.
    // For lower-is-better metrics, a negative relDiff (with < without) is good.
    const direction = higherBetter
      ? (relDiff > 0 ? 'أفضل' : 'أضعف')
      : (relDiff < 0 ? 'أفضل' : 'أضعف');

    results.push({
      feature: check.label,
      correlation: +relDiff.toFixed(3),
      note: `إعلانات بـ ${check.label}: ${metric} ${direction} بـ ${Math.round(Math.abs(relDiff) * 100)}% في المتوسط`,
    });
  }

  results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  return results.slice(0, 3);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export type { GetCreativePerformanceArgs, GetCreativePerformanceResult };
void (undefined as unknown as PrismaClient | undefined);
