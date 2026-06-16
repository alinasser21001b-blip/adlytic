// ════════════════════════════════════════════════════════════════════════
//  src/engines/recommendation/matchCompositionRule.ts
//
//  Pure function. Inputs: set of detected issue codes + the rule table.
//  Output: the single matching rule, or null.
//
//  No I/O. No DB. No knowledge of severities, confidences, or human text.
//  This is the entire "creativity" the engine is allowed: a deterministic
//  selection over the table.
// ════════════════════════════════════════════════════════════════════════

import { IssueCode, RecommendationPriority } from "@prisma/client";
import type { CompositionRule } from "./compositionRules";

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};

/**
 * Pick the single best-matching rule for a given set of detected issues.
 *
 * Selection (in order):
 *   1. requiredIssues must be a SUBSET of detected — else the rule does not match.
 *   2. Among matching rules, the MOST SPECIFIC wins (longest requiredIssues).
 *   3. Ties on specificity broken by PRIORITY (higher wins).
 *   4. Final ties broken by FILE ORDER (earlier in COMPOSITION_RULES wins).
 *
 * Returns null when no rule matches. The engine does NOT invent a fallback
 * recommendation — that would be creativity.
 */
export function matchCompositionRule(
  detectedIssueCodes: IssueCode[],
  rules: CompositionRule[]
): CompositionRule | null {
  if (detectedIssueCodes.length === 0) return null;
  const present = new Set(detectedIssueCodes);

  let best: { rule: CompositionRule; index: number } | null = null;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Subset check
    const matches = rule.requiredIssues.every(code => present.has(code));
    if (!matches) continue;

    if (best === null) {
      best = { rule, index: i };
      continue;
    }

    // 2. Specificity
    if (rule.requiredIssues.length > best.rule.requiredIssues.length) {
      best = { rule, index: i };
      continue;
    }
    if (rule.requiredIssues.length < best.rule.requiredIssues.length) continue;

    // 3. Priority
    const rulePri = PRIORITY_RANK[rule.priority];
    const bestPri = PRIORITY_RANK[best.rule.priority];
    if (rulePri > bestPri) {
      best = { rule, index: i };
      continue;
    }
    if (rulePri < bestPri) continue;

    // 4. File order — already wins because `best` was set first.
  }

  return best?.rule ?? null;
}
