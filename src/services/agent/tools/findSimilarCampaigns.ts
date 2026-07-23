// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/findSimilarCampaigns.ts   —  T10
//
//  Find campaigns structurally similar to a reference campaign by
//  objective, placement mix, audience (age/gender) mix, and a coarse
//  creative-video signal. Similarity is cosine over a normalized feature
//  vector — a number, not an LLM opinion.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.4 T10
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

interface FindSimilarCampaignsArgs {
  referenceCampaignId: string;
  limit: number;
  minSimilarity: number;
}

interface PerformanceDelta {
  cost_per_message: number | null;   // negative = reference is cheaper than the candidate
  ctr: number | null;
  roas: number | null;
}

interface SimilarCampaign {
  campaignId: string;
  campaignName: string;
  similarity: number;
  performanceDelta: PerformanceDelta;
  differentiator: string;
}

interface FindSimilarCampaignsResult {
  reference: { id: string; name: string };
  similar: SimilarCampaign[];
}

/** Comparison window for performanceDelta — fixed, not caller-configurable,
 *  to keep the tool's contract simple (similarity is the point; the delta
 *  is a supporting fact). */
const PERFORMANCE_WINDOW_DAYS = 30;

export function findSimilarCampaignsHandler(): ToolHandler<FindSimilarCampaignsArgs, FindSimilarCampaignsResult> {
  return {
    name: 'find_similar_campaigns',
    description:
      "Find campaigns SIMILAR to a reference campaign by objective, placement mix, and audience (age/gender) mix. Similarity is cosine similarity over a normalized feature vector — a computed number, not an LLM guess. Use to answer 'حملات مشابهة لـ X' or to explain a performance gap: 'الحملة A تشبه B هيكلياً لكن B تحقق نصف تكلفة الرسالة — هذا فرق حقيقي يستحق التحقيق'. Returns each similar campaign's performanceDelta (30-day cost_per_message/ctr/roas vs the reference) and a one-line differentiator naming what's structurally different.",
    schema: {
      type: 'object',
      properties: {
        referenceCampaignId: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        minSimilarity: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
      },
      required: ['referenceCampaignId'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 600,
    timeoutMs: 6000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      const refCamp = await prisma.campaign.findFirst({
        where: { id: args.referenceCampaignId, adAccount: { workspaceId } },
        include: { adAccount: true },
      });
      if (!refCamp) {
        return fail('NOT_FOUND', `Campaign "${args.referenceCampaignId}" not found in this workspace`, {
          field: 'referenceCampaignId', retryable: false,
          suggestion: 'Call list_campaigns to see valid campaign ids.',
        });
      }

      const account = refCamp.adAccount;
      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);
      const otherCampaigns = await prisma.campaign.findMany({
        where: { adAccountId: account.id, id: { not: refCamp.id } },
      });
      if (otherCampaigns.length === 0) {
        return ok<FindSimilarCampaignsResult>(
          { reference: { id: refCamp.id, name: refCamp.name }, similar: [] },
          {
            sourceTable: 'campaigns',
            latestRowDate: null,
            stalenessMinutes: account.lastSyncedAt
              ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
              : null,
          },
        );
      }

      const allCampaignIds = [refCamp.id, ...otherCampaigns.map((c) => c.id)];
      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - PERFORMANCE_WINDOW_DAYS * 864e5);

      // Bulk fetch: breakdown rows (age/gender/placement) + daily stats + ad video ratio.
      const [breakdownRows, dailyRows, ads] = await Promise.all([
        prisma.breakdownStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: allCampaignIds },
            breakdownKey: { in: ['age', 'gender', 'platform_position'] },
            date: { gte: sinceDate },
          },
        }),
        prisma.dailyStat.findMany({
          where: { entityType: EntityType.CAMPAIGN, entityId: { in: allCampaignIds }, date: { gte: sinceDate } },
        }),
        prisma.ad.findMany({
          where: { adSet: { campaignId: { in: allCampaignIds } } },
          include: { creative: true, adSet: true },
        }),
      ]);

      const vectors = buildFeatureVectors(allCampaignIds, refCamp.objective, otherCampaigns, breakdownRows, ads);
      const refVector = vectors.get(refCamp.id)!;

      const dailyByCampaign = new Map<string, typeof dailyRows>();
      for (const r of dailyRows) {
        const arr = dailyByCampaign.get(r.entityId) ?? [];
        arr.push(r);
        dailyByCampaign.set(r.entityId, arr);
      }
      const refPerf = computePerformance(dailyByCampaign.get(refCamp.id) ?? [], factor);

      const scored: SimilarCampaign[] = [];
      for (const cand of otherCampaigns) {
        const candVector = vectors.get(cand.id)!;
        const similarity = cosineSimilarity(refVector, candVector);
        if (similarity < args.minSimilarity) continue;

        const candPerf = computePerformance(dailyByCampaign.get(cand.id) ?? [], factor);
        const performanceDelta: PerformanceDelta = {
          cost_per_message: deltaOf(refPerf.costPerMessage, candPerf.costPerMessage),
          ctr: deltaOf(refPerf.ctr, candPerf.ctr),
          roas: deltaOf(refPerf.roas, candPerf.roas),
        };

        scored.push({
          campaignId: cand.id,
          campaignName: cand.name,
          similarity: +similarity.toFixed(3),
          performanceDelta,
          differentiator: buildDifferentiator(refCamp.objective, cand.objective, refVector, candVector),
        });
      }

      scored.sort((a, b) => b.similarity - a.similarity);
      const limited = scored.slice(0, args.limit);

      const latestRowDate = dailyRows.length > 0
        ? dailyRows.map((r) => r.date.getTime()).reduce((a, b) => Math.max(a, b), 0)
        : 0;

      return ok<FindSimilarCampaignsResult>(
        {
          reference: { id: refCamp.id, name: refCamp.name },
          similar: limited,
        },
        {
          sourceTable: 'campaigns',
          latestRowDate: latestRowDate > 0 ? new Date(latestRowDate).toISOString().slice(0, 10) : null,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<FindSimilarCampaignsArgs, FindSimilarCampaignsResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

type FeatureVector = Map<string, number>;

/**
 * Build a normalized feature vector per campaign:
 *   - objective:<value>         one-hot (1.0 on the campaign's own objective)
 *   - age:<bucket>               share of spend in that age bucket (sums to 1 within block)
 *   - gender:<value>             share of spend in that gender (sums to 1 within block)
 *   - placement:<value>          share of spend in that placement (sums to 1 within block)
 *   - creative:video_ratio       fraction of the campaign's ads that have video (0..1 scalar)
 *
 * Each block is independently normalized so no block dominates purely from
 * having more distinct categories or higher raw spend.
 */
function buildFeatureVectors(
  campaignIds: string[],
  refObjective: string | null,
  otherCampaigns: Array<{ id: string; objective: string | null }>,
  breakdownRows: Array<{ entityId: string; breakdownKey: string; breakdownValue: string; spend: bigint }>,
  ads: Array<{ adSet: { campaignId: string }; creative: { videoId: string | null } | null }>,
): Map<string, FeatureVector> {
  const objectiveByCampaign = new Map<string, string | null>();
  objectiveByCampaign.set(campaignIds[0]!, refObjective);
  for (const c of otherCampaigns) objectiveByCampaign.set(c.id, c.objective);

  const byCampaignBreakdown = new Map<string, typeof breakdownRows>();
  for (const r of breakdownRows) {
    const arr = byCampaignBreakdown.get(r.entityId) ?? [];
    arr.push(r);
    byCampaignBreakdown.set(r.entityId, arr);
  }

  const adsByCampaign = new Map<string, typeof ads>();
  for (const a of ads) {
    const arr = adsByCampaign.get(a.adSet.campaignId) ?? [];
    arr.push(a);
    adsByCampaign.set(a.adSet.campaignId, arr);
  }

  const vectors = new Map<string, FeatureVector>();
  for (const campaignId of campaignIds) {
    const vec: FeatureVector = new Map();

    const objective = objectiveByCampaign.get(campaignId);
    if (objective) vec.set(`objective:${objective}`, 1.0);

    const rows = byCampaignBreakdown.get(campaignId) ?? [];
    for (const dim of ['age', 'gender', 'platform_position'] as const) {
      const dimRows = rows.filter((r) => r.breakdownKey === dim);
      const total = dimRows.reduce((a, r) => a + Number(r.spend), 0);
      if (total <= 0) continue;
      const byValue = new Map<string, number>();
      for (const r of dimRows) byValue.set(r.breakdownValue, (byValue.get(r.breakdownValue) ?? 0) + Number(r.spend));
      for (const [value, spend] of byValue) {
        vec.set(`${dim}:${value}`, spend / total);
      }
    }

    const campaignAds = adsByCampaign.get(campaignId) ?? [];
    if (campaignAds.length > 0) {
      const videoCount = campaignAds.filter((a) => a.creative?.videoId != null).length;
      vec.set('creative:video_ratio', videoCount / campaignAds.length);
    }

    vectors.set(campaignId, vec);
  }
  return vectors;
}

function cosineSimilarity(a: FeatureVector, b: FeatureVector): number {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    const av = a.get(k) ?? 0;
    const bv = b.get(k) ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface PerformanceSummary {
  costPerMessage: number | null;
  ctr: number | null;
  roas: number | null;
}

function computePerformance(rows: Array<{ spend: bigint; messages: bigint; impressions: bigint; clicks: bigint; roas: number | null }>, factor: number): PerformanceSummary {
  const spend = rows.reduce((a, r) => a + Number(r.spend), 0);
  const messages = rows.reduce((a, r) => a + Number(r.messages), 0);
  const impressions = rows.reduce((a, r) => a + Number(r.impressions), 0);
  const clicks = rows.reduce((a, r) => a + Number(r.clicks), 0);
  const spendMajor = factor === 1 ? spend : spend / factor;
  const roasVals = rows.map((r) => r.roas).filter((v): v is number => v != null);
  return {
    costPerMessage: messages > 0 ? +(spendMajor / messages).toFixed(4) : null,
    ctr: impressions > 0 ? +(clicks / impressions * 100).toFixed(4) : null,
    roas: roasVals.length ? +(roasVals.reduce((a, b) => a + b, 0) / roasVals.length).toFixed(4) : null,
  };
}

/** reference - candidate. Negative means reference is LOWER (cheaper for cost_per_message,
 *  worse for ctr/roas — caller interprets per-metric direction). */
function deltaOf(ref: number | null, cand: number | null): number | null {
  if (ref == null || cand == null) return null;
  return +(ref - cand).toFixed(4);
}

/** Name the single biggest structural difference between two feature vectors,
 *  in Arabic, for the "why are these different" narrative. */
function buildDifferentiator(
  refObjective: string | null,
  candObjective: string | null,
  refVec: FeatureVector,
  candVec: FeatureVector,
): string {
  if (refObjective && candObjective && refObjective !== candObjective) {
    return `هدف مختلف: ${refObjective} مقابل ${candObjective}`;
  }
  // Find the single key with the largest absolute difference across both vectors.
  const keys = new Set([...refVec.keys(), ...candVec.keys()]);
  let maxKey: string | null = null;
  let maxDiff = 0;
  for (const k of keys) {
    if (k.startsWith('objective:')) continue;
    const diff = Math.abs((refVec.get(k) ?? 0) - (candVec.get(k) ?? 0));
    if (diff > maxDiff) { maxDiff = diff; maxKey = k; }
  }
  if (!maxKey || maxDiff < 0.15) return 'هيكل مشابه جداً — لا فرق كبير في الاستهداف أو الإبداع';
  const [block, value] = maxKey.split(':');
  const blockArabic: Record<string, string> = {
    age: 'الفئة العمرية',
    gender: 'الجنس',
    platform_position: 'مكان الظهور',
    creative: 'خصائص الإبداع',
  };
  return `فرق رئيسي في ${blockArabic[block!] ?? block}: ${value} (فرق ${Math.round(maxDiff * 100)}%)`;
}

export type { FindSimilarCampaignsArgs, FindSimilarCampaignsResult };
void (undefined as unknown as PrismaClient | undefined);
