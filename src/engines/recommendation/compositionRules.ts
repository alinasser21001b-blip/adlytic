// ════════════════════════════════════════════════════════════════════════
//  src/engines/recommendation/compositionRules.ts
//
//  Recommendation is composition, not creativity.
//
//  This file IS the recommendation behavior. The engine is a matcher; the
//  intelligence is here, as data. When a user says "this dashboard cried
//  wolf because LOW_CTR alone shouldn't be HIGH priority" — we edit a row
//  in this file. We do not edit code paths.
//
//  Rule semantics:
//    1. A rule MATCHES when its `requiredIssues` is a SUBSET of the detected
//       issues for the entity. Order doesn't matter.
//    2. Among matching rules, the rule with the MOST required issues wins
//       (most-specific). Ties broken by `priority` (higher wins). Final
//       ties broken by file order (top wins).
//    3. The engine emits at most ONE recommendation per (entity, date).
//    4. If no rule matches, no recommendation is written. The dashboard
//       decides what to show; this engine never invents.
//
//  actionCode is a STABLE CODE, not text. The dashboard / Knowledge Engine
//  / Reports / future automation each render their own presentation of
//  REFRESH_CREATIVES. The code is the contract.
// ════════════════════════════════════════════════════════════════════════

import { IssueCode, RecommendationPriority } from "@prisma/client";

/** The vocabulary of actions the system can recommend. Add a code here
 *  before adding any rule that emits it. Same discipline as IssueCode. */
export const ActionCode = {
  REFRESH_CREATIVES: "REFRESH_CREATIVES",
  BROADEN_AUDIENCE: "BROADEN_AUDIENCE",
  IMPROVE_HOOKS: "IMPROVE_HOOKS",
  PAUSE_AND_RELAUNCH: "PAUSE_AND_RELAUNCH",
  REVIEW_BUDGET_PACING: "REVIEW_BUDGET_PACING",
  CHECK_TARGETING: "CHECK_TARGETING",
} as const;
export type ActionCode = typeof ActionCode[keyof typeof ActionCode];

export interface CompositionRule {
  /** Set of issue codes that must ALL be present in detected_issues for the
   *  rule to match. Subset matching — extra issues are fine. */
  requiredIssues: IssueCode[];
  priority: RecommendationPriority;
  actionCode: ActionCode;
  /** Short rationale — for code-readers, not users. Helps future-us remember
   *  why this composition exists when we revisit thresholds. */
  rationale: string;
}

/**
 * The composition table. Ordered for tie-breaking but ranked primarily by
 * specificity (length of requiredIssues) and priority at runtime.
 *
 * Add rules sparingly. Every rule here is a claim about what to do when a
 * pattern appears. Claims we can't defend should not be rules.
 */
export const COMPOSITION_RULES: CompositionRule[] = [
  // ── CRITICAL: campaign actively dying ────────────────────────────────
  {
    requiredIssues: [IssueCode.AUDIENCE_FATIGUE, IssueCode.DECLINING_RESULTS, IssueCode.RISING_COST_PER_RESULT],
    priority: RecommendationPriority.CRITICAL,
    actionCode: ActionCode.PAUSE_AND_RELAUNCH,
    rationale:
      "Three corroborating signals of fatigue + worsening unit economics → " +
      "creative refresh alone may not be enough. Pause and relaunch with new creative + audience.",
  },

  // ── HIGH: classic fatigue pattern ────────────────────────────────────
  {
    requiredIssues: [IssueCode.AUDIENCE_FATIGUE, IssueCode.DECLINING_RESULTS],
    priority: RecommendationPriority.HIGH,
    actionCode: ActionCode.REFRESH_CREATIVES,
    rationale:
      "Fatigue diagnosis corroborated by results decline. Creative refresh is the " +
      "highest-leverage single action.",
  },
  {
    requiredIssues: [IssueCode.AUDIENCE_FATIGUE, IssueCode.HIGH_FREQUENCY],
    priority: RecommendationPriority.HIGH,
    actionCode: ActionCode.BROADEN_AUDIENCE,
    rationale:
      "Fatigue + sustained high frequency points more to audience saturation than " +
      "creative staleness. Broaden first; refresh second if it persists.",
  },

  // ── MEDIUM: single-signal issues ─────────────────────────────────────
  {
    requiredIssues: [IssueCode.AUDIENCE_FATIGUE],
    priority: RecommendationPriority.MEDIUM,
    actionCode: ActionCode.REFRESH_CREATIVES,
    rationale: "Standalone fatigue diagnosis (2/3 signals). Refresh creatives.",
  },
  {
    requiredIssues: [IssueCode.DECLINING_RESULTS],
    priority: RecommendationPriority.MEDIUM,
    actionCode: ActionCode.REFRESH_CREATIVES,
    rationale: "Results down without other corroborating signals. Most common fix is creative.",
  },
  {
    requiredIssues: [IssueCode.RISING_COST_PER_RESULT],
    priority: RecommendationPriority.MEDIUM,
    actionCode: ActionCode.REVIEW_BUDGET_PACING,
    rationale:
      "Unit economics worsening without fatigue/results decline → likely budget pacing " +
      "or auction pressure, not creative.",
  },
  {
    requiredIssues: [IssueCode.HIGH_FREQUENCY],
    priority: RecommendationPriority.MEDIUM,
    actionCode: ActionCode.BROADEN_AUDIENCE,
    rationale: "Frequency above ceiling, no other issues. Broaden audience.",
  },
  {
    requiredIssues: [IssueCode.LOW_CTR],
    priority: RecommendationPriority.MEDIUM,
    actionCode: ActionCode.IMPROVE_HOOKS,
    rationale:
      "Low absolute CTR — the opening frames aren't earning the click. Action is " +
      "industry-specific text (see knowledge_rules); the code stays generic.",
  },
];
