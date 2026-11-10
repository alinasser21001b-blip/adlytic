// ════════════════════════════════════════════════════════════════════════
//  src/engines/recommendation/RecommendationEngine.ts
//
//  Recommendation is composition, not creativity.
//
//  ORCHESTRATOR for Step 10.
//
//    Input:  detected_issues for (entity, date) — Step 8 output
//    Output: at most ONE recommendation per (entity, date) — codes only
//    Touches NOTHING else.
//
//  Knows nothing about:
//    - Human text (Step 9 owns language)
//    - Severity (Rules emits it; we read it via evidence but don't compose
//      with it; the composition rules don't reference severity)
//    - Confidence (carried on issue evidence; engine doesn't gate on it today)
//    - Health scores (Step 11)
//    - AI (Phase 16+)
//
//  Adding new behavior = adding a row to compositionRules.ts. NOT a branch
//  here. If you find yourself wanting to write `if (...)` in this file,
//  the answer is "add a CompositionRule".
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType, IssueCode, RecommendationPriority } from "@prisma/client";
import { RecommendationsRepo, type RecommendationRecord } from "../../repositories/recommendationsRepo";
import { COMPOSITION_RULES, type CompositionRule } from "./compositionRules";
import { matchCompositionRule } from "./matchCompositionRule";
import { resolveCampaignPurpose } from "../../lib/campaignPurpose";
import { resultFor } from "../../analytics/resultSemantics";
import { resolveAccountResultKey } from "../../analytics/accountResultKey";
import type { ResultMetricKey } from "../../lib/objectiveKpis";
import {
  evaluateCampaign,
  evaluateBenchmarks,
  findActionsForBreaches,
  type CampaignMetrics,
} from "../../knowledge";
import {
  resolveBenchmarkIndustry,
  toBenchmarkEvaluationOptions,
} from "../../knowledge/industryRouting";
import {
  EVIDENCE_WINDOWS,
  evaluateEntityWindow,
  isSpendDependentIssueCode,
  spendDependenceOfRecommendation,
  withholdSpendDerivedMetrics,
  SPEND_DERIVED_KB_METRICS,
  type SpendGateReason,
} from "../../lib/spendEvidence";

export interface RecommendationOptions {
  /** "as of" date for the run. Matches what Rules wrote. */
  asOf?: Date;
  /** Override the composition table — useful for tests. */
  rules?: CompositionRule[];
}

/**
 * What this run left out because the spend it would have used is not verified
 * (IQD only; src/lib/spendEvidence.ts). ABSENT when nothing was withheld, so a clean
 * or non-IQD run returns exactly what it always did.
 */
export interface RecommendationSpendEvidence {
  reason: SpendGateReason;
  window: { from: string | null; to: string | null; rows: number; unverified: number; overscaled: number };
  /** Detected issues dropped before composition (e.g. RISING_COST_PER_RESULT). */
  withheldIssueCodes: string[];
  /** Knowledge-base metrics not evaluated (cpm, cpc, cost_per_message …). */
  withheldMetrics: string[];
  /** The composed recommendation itself depended on spend and was not written. */
  recommendationWithheld: boolean;
}

export interface RecommendationResult {
  entityType: EntityType;
  entityId: string;
  asOf: string;
  recommendation: RecommendationRecord | null;
  ok: boolean;
  error?: string;
  spendEvidence?: RecommendationSpendEvidence;
}

export class RecommendationEngine {
  private repo: RecommendationsRepo;

  constructor(private prisma: PrismaClient) {
    this.repo = new RecommendationsRepo(prisma);
  }

  async run(
    entityType: EntityType,
    entityId: string,
    opts: RecommendationOptions = {}
  ): Promise<RecommendationResult> {
    const asOf = opts.asOf ?? new Date();
    const rules = opts.rules ?? COMPOSITION_RULES;

    const result: RecommendationResult = {
      entityType, entityId, asOf: ymd(asOf), recommendation: null, ok: false,
    };

    try {
      // Read detected_issues for this entity + date.
      const date = dateOnly(asOf);
      const issues = await this.prisma.detectedIssue.findMany({
        where: { entityType, entityId, date },
      });

      // SPEND EVIDENCE. A recommendation that rests on spend (cost per result, CPM/CPC/
      // cost-per-message, budget pacing) is composed only from spend that is verified.
      // For an IQD window holding unverified or over-scaled rows those inputs are left out
      // BEFORE composition: the spend-dependent detected issues, and the spend-derived
      // knowledge-base metrics. Recommendations that do not rest on spend (fatigue,
      // frequency, CTR) are composed exactly as before.
      const spendWindow = await evaluateEntityWindow(this.prisma, entityType, entityId, asOf, EVIDENCE_WINDOWS.engine);
      const spendWithheld = spendWindow.clean ? null : spendWindow.reason;

      const allCodes = (issues as any[]).map(i => i.issueCode as IssueCode);
      const codes = spendWithheld ? allCodes.filter((c) => !isSpendDependentIssueCode(c)) : allCodes;
      const withheldIssueCodes = allCodes.filter((c) => !codes.includes(c));
      const chosen = matchCompositionRule(codes, rules);

      // Meta Ads KB FIRST — attach verbatim actions when live metrics breach thresholds.
      const rawMetrics = await this.loadCampaignMetrics(entityType, entityId, asOf);
      const metrics = spendWithheld ? withholdSpendDerivedMetrics(rawMetrics) : rawMetrics;
      const withheldMetrics = spendWithheld
        ? Object.keys(rawMetrics).filter((k) => SPEND_DERIVED_KB_METRICS.has(k) && rawMetrics[k] != null)
        : [];
      const industry =
        entityType === EntityType.ACCOUNT
          ? await resolveBenchmarkIndustry(this.prisma, { adAccountId: entityId })
          : await resolveBenchmarkIndustry(this.prisma, {});
      const benchmarkOptions = toBenchmarkEvaluationOptions(industry);
      const kbBreaches = evaluateCampaign(metrics);
      const benchmarkInsights = evaluateBenchmarks(metrics, benchmarkOptions);
      const kbActions = findActionsForBreaches(kbBreaches);

      let recommendation: RecommendationRecord | null = null;

      if (kbActions.length > 0) {
        const top = kbBreaches[0]!;
        recommendation = {
          actionCode: kbActions[0]!.id,
          priority: top.severity === "critical"
            ? RecommendationPriority.CRITICAL
            : RecommendationPriority.HIGH,
          sourceIssues: chosen?.requiredIssues ?? [],
          details: {
            source: "meta_ads_knowledge_base",
            metricBreaches: kbBreaches,
            recommended_optimization_actions: kbActions,
            benchmarkInsights,
          },
        };
      } else if (chosen) {
        recommendation = {
          actionCode: chosen.actionCode,
          priority: chosen.priority,
          sourceIssues: chosen.requiredIssues,
          details: null,
        };
      }

      // Safety net: whatever was composed, a recommendation that still rests on spend
      // (by its action code, its source issues or its knowledge-base metric) is not written.
      let recommendationWithheld = false;
      if (spendWithheld && recommendation &&
          spendDependenceOfRecommendation({ actionCode: recommendation.actionCode, sourceIssues: recommendation.sourceIssues, details: recommendation.details }).dependent) {
        recommendation = null;
        recommendationWithheld = true;
      }

      if (spendWithheld && (withheldIssueCodes.length > 0 || withheldMetrics.length > 0 || recommendationWithheld)) {
        const evidence: RecommendationSpendEvidence = {
          reason: spendWithheld,
          window: { from: spendWindow.from, to: spendWindow.to, rows: spendWindow.rows, unverified: spendWindow.unverified, overscaled: spendWindow.overscaled },
          withheldIssueCodes, withheldMetrics, recommendationWithheld,
        };
        result.spendEvidence = evidence;
        // A recommendation that survives says, on the row itself, what it was composed without.
        if (recommendation) {
          recommendation = { ...recommendation, details: { ...(recommendation.details ?? {}), spendEvidence: evidence } };
        }
      }

      await this.repo.replaceForDate({
        entityType, entityId, date: asOf, recommendation,
      });

      result.recommendation = recommendation;
      result.ok = true;
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  }

  /** Window aggregates aligned with RulesEngine signal math (7d + 2d lag). */
  private async loadCampaignMetrics(
    entityType: EntityType,
    entityId: string,
    asOf: Date,
  ): Promise<CampaignMetrics> {
    const windowDays = 7;
    const lag = 2;
    const currentUntil = addDays(asOf, -lag);
    const currentSince = addDays(currentUntil, -(windowDays - 1));

    const daily = await this.prisma.dailyStat.findMany({
      where: {
        entityType,
        entityId,
        date: { gte: dateOnly(currentSince), lte: dateOnly(currentUntil) },
      },
    });

    // Which counter is this entity's result? Resolved from its own purpose;
    // null for an account spanning objectives, where no single unit applies.
    let resultKey: ResultMetricKey | null = null;
    try {
      if (entityType === EntityType.CAMPAIGN) {
        const meta = await this.prisma.campaign.findUnique({
          where: { id: entityId },
          select: {
            objective: true,
            messagingCtaAds: true,
            adSets: { select: { optimizationGoal: true, destinationType: true } },
          },
        });
        if (meta) {
          let wMsgs = 0, wClicks = 0, wLink = 0;
          for (const r of daily as any[]) { wMsgs += Number(r.messages); wClicks += Number(r.clicks); wLink += Number(r.linkClicks ?? 0); }
          resultKey = resultFor(resolveCampaignPurpose({
            objective: meta.objective,
            optimizationGoals: meta.adSets.map((a) => a.optimizationGoal),
            destinationTypes: meta.adSets.map((a) => a.destinationType),
            messagesWindow: wMsgs,
            clicksWindow: wClicks,
            linkClicksWindow: wLink,
            messagingCtaAds: meta.messagingCtaAds,
          }).family).resultKey;
        }
      } else {
        resultKey = (await resolveAccountResultKey(
          this.prisma, entityId, dateOnly(currentSince), dateOnly(currentUntil),
        )).resultKey;
      }
    } catch {
      resultKey = null;
    }

    let impTotal = 0;
    let clickTotal = 0;
    let ctrNum = 0;
    let cpmNum = 0;
    const freqVals: number[] = [];
    let resultsSum = 0;
    let spendSum = 0;

    for (const r of daily as any[]) {
      const imp = Number(r.impressions);
      const clicks = Number(r.clicks ?? 0);
      impTotal += imp;
      clickTotal += clicks;
      if (r.ctr != null && imp > 0) ctrNum += r.ctr * imp;
      if (r.cpm != null && imp > 0) cpmNum += r.cpm * imp;
      if (r.frequency != null) freqVals.push(r.frequency);
      // Objective-aware: count THIS entity's own result. Was
      // `messages ?? conversions`, which hard-coded messages as "results" for
      // every campaign and fell back to the ambiguous column when absent —
      // so a sales campaign's recommendations were driven by message volume.
      resultsSum += resultKey ? Number(r[resultKey]) || 0 : 0;
      spendSum += Number(r.spend);
    }

    return {
      ctr: impTotal > 0 ? +(ctrNum / impTotal).toFixed(4) : null,
      cpm: impTotal > 0 ? +(cpmNum / impTotal).toFixed(4) : null,
      cpc: clickTotal > 0 ? +(spendSum / clickTotal).toFixed(4) : null,
      frequency: freqVals.length
        ? +(freqVals.reduce((a, b) => a + b, 0) / freqVals.length).toFixed(4)
        : null,
      cost_per_message: resultsSum > 0 ? +(spendSum / resultsSum).toFixed(4) : null,
    };
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
