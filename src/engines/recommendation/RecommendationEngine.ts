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

import { PrismaClient, EntityType, IssueCode } from "@prisma/client";
import { RecommendationsRepo, type RecommendationRecord } from "../../repositories/recommendationsRepo";
import { COMPOSITION_RULES, type CompositionRule } from "./compositionRules";
import { matchCompositionRule } from "./matchCompositionRule";

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

      const recommendation: RecommendationRecord | null = chosen
        ? {
            actionCode: chosen.actionCode,
            priority: chosen.priority,
            sourceIssues: chosen.requiredIssues,
            details: null, // Phase 1: no per-recommendation parameters
          }
        : null;

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
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));
