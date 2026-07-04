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

export interface RecommendationOptions {
  /** "as of" date for the run. Matches what Rules wrote. */
  asOf?: Date;
  /** Override the composition table — useful for tests. */
  rules?: CompositionRule[];
}

export interface RecommendationResult {
  entityType: EntityType;
  entityId: string;
  asOf: string;
  recommendation: RecommendationRecord | null;
  ok: boolean;
  error?: string;
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

      const codes = (issues as any[]).map(i => i.issueCode as IssueCode);
      const chosen = matchCompositionRule(codes, rules);

      // Meta Ads KB FIRST — attach verbatim actions when live metrics breach thresholds.
      const metrics = await this.loadCampaignMetrics(entityType, entityId, asOf);
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
      resultsSum += Number(r.messages ?? r.conversions ?? 0);
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
