// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/analyzeCreativePatterns.ts   —  T16
//
//  Creative Intelligence — cross-campaign creative pattern analysis.
//  Unlike T6 (single campaign), this looks across ALL campaigns in the
//  workspace to identify which creative characteristics (format, copy
//  length, CTA type, emoji usage, video vs image) correlate with
//  performance across the entire account.
//
//  Replaces the impossible "Ad Library benchmark" (Meta's Ad Library API
//  has no performance data for commercial ads) with a self-benchmark:
//  compare your own creatives against each other to find winning patterns.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

type Metric = 'ctr' | 'cpm' | 'cost_per_message' | 'spend' | 'messages';

interface AnalyzeCreativePatternsArgs {
  windowDays: number;
  metric: Metric;
  minAds: number;
}

interface PatternInsight {
  feature: string;
  value: string;
  avgMetric: number;
  avgMetricDisplay: string;
  adCount: number;
  vsAccountAvg: number;
  verdict: 'winning' | 'losing' | 'neutral';
}

interface TopCreative {
  adId: string;
  adName: string;
  campaignName: string;
  metricValue: number;
  metricDisplay: string;
  format: string;
  textLength: string;
}

interface AnalyzeCreativePatternsResult {
  metric: Metric;
  windowDays: number;
  totalAdsAnalyzed: number;
  accountAvgMetric: number;
  accountAvgDisplay: string;
  patterns: PatternInsight[];
  topCreatives: TopCreative[];
  recommendations: string[];
}

const HIGHER_IS_BETTER: Record<Metric, boolean> = {
  ctr: true,
  messages: true,
  cpm: false,
  cost_per_message: false,
  spend: false,
};

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function textLengthBucket(body: string | null): 'short' | 'medium' | 'long' | 'unknown' {
  if (!body) return 'unknown';
  const len = body.length;
  if (len < 80) return 'short';
  if (len < 200) return 'medium';
  return 'long';
}

export function analyzeCreativePatternsHandler(): ToolHandler<AnalyzeCreativePatternsArgs, AnalyzeCreativePatternsResult> {
  return {
    name: 'analyze_creative_patterns',
    description:
      "Cross-campaign creative intelligence: analyzes ALL ads in the workspace to identify which creative characteristics (video vs image, short vs long copy, CTA type, emoji usage, carousel) correlate with the chosen metric. Returns ranked pattern insights and top-performing creatives. Use when the merchant asks 'أي نوع محتوى يشتغل أحسن' or 'ما هو أفضل أسلوب إعلاني' or wants to understand what makes their best-performing ads work. This is a self-benchmark (your ads vs each other) since Meta's Ad Library has no performance data for competitor ads.",
    schema: {
      type: 'object',
      properties: {
        windowDays: { type: 'integer', minimum: 7, maximum: 90, default: 30 },
        metric: {
          type: 'string',
          enum: ['ctr', 'cpm', 'cost_per_message', 'spend', 'messages'],
          default: 'ctr',
        },
        minAds: { type: 'integer', minimum: 3, maximum: 50, default: 5, description: 'Min ads with data to produce a pattern insight (prevents noise from small samples).' },
      },
      required: [],
      additionalProperties: false,
    },
    cacheTtlSeconds: 600,
    timeoutMs: 8000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;
      const windowDays = args.windowDays ?? 30;
      const metric = args.metric ?? 'ctr';
      const minAds = args.minAds ?? 5;

      const accounts = await prisma.adAccount.findMany({
        where: { workspaceId, status: 'ACTIVE' },
        select: { id: true, currency: true, currencyMinorFactor: true },
      });
      if (accounts.length === 0) {
        return fail('NOT_FOUND', 'No active ad accounts in this workspace', { retryable: false });
      }

      const accountIds = accounts.map(a => a.id);
      const factor = resolveCurrencyMinorFactor(
        accounts[0].currency,
        accounts[0].currencyMinorFactor,
      );

      const sinceDate = new Date(Date.now() - windowDays * 864e5);
      sinceDate.setUTCHours(0, 0, 0, 0);

      const ads = await prisma.ad.findMany({
        where: { adSet: { campaign: { adAccountId: { in: accountIds } } } },
        include: {
          creative: true,
          adSet: { include: { campaign: { select: { name: true } } } },
        },
      });

      if (ads.length === 0) {
        return ok<AnalyzeCreativePatternsResult>({
          metric,
          windowDays,
          totalAdsAnalyzed: 0,
          accountAvgMetric: 0,
          accountAvgDisplay: '—',
          patterns: [],
          topCreatives: [],
          recommendations: ['No ads found. Ensure campaigns have synced ad-level data.'],
        });
      }

      const adIds = ads.map(a => a.id);
      const dailyRows = await prisma.dailyStat.findMany({
        where: {
          entityType: EntityType.AD,
          entityId: { in: adIds },
          date: { gte: sinceDate },
        },
      });

      // Aggregate per ad
      interface AdAgg {
        spend: number;
        impressions: number;
        clicks: number;
        messages: number;
      }
      const aggMap = new Map<string, AdAgg>();
      for (const row of dailyRows) {
        const existing = aggMap.get(row.entityId) ?? { spend: 0, impressions: 0, clicks: 0, messages: 0 };
        existing.spend += Number(row.spend);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.messages += Number(row.messages);
        aggMap.set(row.entityId, existing);
      }

      // Compute metric per ad
      interface AdWithMetric {
        adId: string;
        adName: string;
        campaignName: string;
        metricValue: number;
        format: string;
        textLength: string;
        hasVideo: boolean;
        hasCarousel: boolean;
        hasEmoji: boolean;
        ctaType: string;
      }

      const adsWithMetric: AdWithMetric[] = [];
      for (const ad of ads) {
        const agg = aggMap.get(ad.id);
        if (!agg || agg.impressions === 0) continue;

        let metricValue: number;
        switch (metric) {
          case 'ctr':
            metricValue = agg.clicks / agg.impressions * 100;
            break;
          case 'cpm':
            metricValue = (agg.spend / factor) / agg.impressions * 1000;
            break;
          case 'cost_per_message':
            metricValue = agg.messages > 0 ? (agg.spend / factor) / agg.messages : Infinity;
            if (!isFinite(metricValue)) continue;
            break;
          case 'spend':
            metricValue = agg.spend / factor;
            break;
          case 'messages':
            metricValue = agg.messages;
            break;
          default:
            metricValue = 0;
        }

        const primaryText = ad.creative?.primaryText ?? '';
        const isVideo = ad.creative?.videoId != null;
        const raw = ad.creative?.raw as Record<string, unknown> | null;
        const isCarousel = raw != null && (
          Array.isArray((raw as any)?.object_story_spec?.link_data?.child_attachments)
          || String(raw?.['effective_object_story_id'] ?? '').includes('carousel')
        );

        adsWithMetric.push({
          adId: ad.id,
          adName: ad.name ?? '—',
          campaignName: ad.adSet?.campaign?.name ?? '—',
          metricValue,
          format: isVideo ? 'video' : isCarousel ? 'carousel' : 'image',
          textLength: textLengthBucket(primaryText),
          hasVideo: isVideo,
          hasCarousel: isCarousel,
          hasEmoji: EMOJI_REGEX.test(primaryText),
          ctaType: ad.creative?.callToActionType ?? 'none',
        });
      }

      if (adsWithMetric.length < 3) {
        return ok<AnalyzeCreativePatternsResult>({
          metric,
          windowDays,
          totalAdsAnalyzed: adsWithMetric.length,
          accountAvgMetric: 0,
          accountAvgDisplay: '—',
          patterns: [],
          topCreatives: [],
          recommendations: ['Not enough ad-level data yet. Wait for the next sync cycle to accumulate stats.'],
        });
      }

      // Account average
      const accountAvg = adsWithMetric.reduce((s, a) => s + a.metricValue, 0) / adsWithMetric.length;

      // Pattern analysis — group by features
      const patterns: PatternInsight[] = [];
      function analyzeFeature(featureName: string, groupFn: (a: AdWithMetric) => string) {
        const groups = new Map<string, number[]>();
        for (const a of adsWithMetric) {
          const key = groupFn(a);
          const arr = groups.get(key) ?? [];
          arr.push(a.metricValue);
          groups.set(key, arr);
        }
        for (const [value, values] of groups) {
          if (values.length < minAds) continue;
          const avg = values.reduce((s, v) => s + v, 0) / values.length;
          const vsAvg = accountAvg > 0 ? (avg - accountAvg) / accountAvg : 0;
          const higherBetter = HIGHER_IS_BETTER[metric];
          const isWinning = higherBetter ? vsAvg > 0.1 : vsAvg < -0.1;
          const isLosing = higherBetter ? vsAvg < -0.1 : vsAvg > 0.1;
          patterns.push({
            feature: featureName,
            value,
            avgMetric: Math.round(avg * 100) / 100,
            avgMetricDisplay: formatMetric(avg, metric, factor),
            adCount: values.length,
            vsAccountAvg: Math.round(vsAvg * 1000) / 10,
            verdict: isWinning ? 'winning' : isLosing ? 'losing' : 'neutral',
          });
        }
      }

      analyzeFeature('format', a => a.format);
      analyzeFeature('text_length', a => a.textLength);
      analyzeFeature('has_emoji', a => a.hasEmoji ? 'yes' : 'no');
      analyzeFeature('cta_type', a => a.ctaType || 'none');

      // Sort: winning first, then losing, then neutral
      const verdictOrder = { winning: 0, losing: 1, neutral: 2 };
      patterns.sort((a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict] || Math.abs(b.vsAccountAvg) - Math.abs(a.vsAccountAvg));

      // Top creatives
      const sorted = [...adsWithMetric].sort((a, b) =>
        HIGHER_IS_BETTER[metric] ? b.metricValue - a.metricValue : a.metricValue - b.metricValue
      );
      const topCreatives: TopCreative[] = sorted.slice(0, 5).map(a => ({
        adId: a.adId,
        adName: a.adName,
        campaignName: a.campaignName,
        metricValue: Math.round(a.metricValue * 100) / 100,
        metricDisplay: formatMetric(a.metricValue, metric, factor),
        format: a.format,
        textLength: a.textLength,
      }));

      // Generate recommendations
      const recommendations: string[] = [];
      const winningPatterns = patterns.filter(p => p.verdict === 'winning');
      const losingPatterns = patterns.filter(p => p.verdict === 'losing');

      if (winningPatterns.length > 0) {
        const best = winningPatterns[0];
        recommendations.push(`${best.feature} = "${best.value}" outperforms account average by ${Math.abs(best.vsAccountAvg)}% — create more ads with this characteristic.`);
      }
      if (losingPatterns.length > 0) {
        const worst = losingPatterns[0];
        recommendations.push(`${worst.feature} = "${worst.value}" underperforms by ${Math.abs(worst.vsAccountAvg)}% — consider refreshing or pausing ads with this characteristic.`);
      }
      if (adsWithMetric.length >= 10) {
        const formats = new Set(adsWithMetric.map(a => a.format));
        if (formats.size === 1) {
          recommendations.push('All ads use the same format — test alternative formats (video if using images, carousel for multi-product) to find new winners.');
        }
      }
      if (recommendations.length === 0) {
        recommendations.push('Creative performance is relatively uniform. Test new angles (different copy styles, formats, CTAs) to find differentiation.');
      }

      return ok<AnalyzeCreativePatternsResult>(
        {
          metric,
          windowDays,
          totalAdsAnalyzed: adsWithMetric.length,
          accountAvgMetric: Math.round(accountAvg * 100) / 100,
          accountAvgDisplay: formatMetric(accountAvg, metric, factor),
          patterns: patterns.slice(0, 12),
          topCreatives,
          recommendations,
        },
        { sourceTable: 'daily_stats', latestRowDate: null, stalenessMinutes: null },
      );
    },
  };
}

function formatMetric(value: number, metric: Metric, factor: number): string {
  switch (metric) {
    case 'ctr': return value.toFixed(2) + '%';
    case 'cpm': return '$' + value.toFixed(2);
    case 'cost_per_message': return '$' + value.toFixed(2);
    case 'spend': return '$' + value.toFixed(0);
    case 'messages': return Math.round(value).toString();
    default: return value.toFixed(2);
  }
}
