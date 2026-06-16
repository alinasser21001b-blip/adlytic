// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/severity.ts
//
//  Severity computation lives HERE, in one file, so the day a user says
//  "this dashboard cried wolf at me" we change one line, not twelve.
//
//  Inputs are trend magnitudes (fractional, e.g. 0.30 for "+30%"). Outputs
//  are Severity enum values. Thresholds are educated defaults — not measured
//  on Iraqi accounts yet — and every one carries a `because:` comment that
//  names the source of the guess. Future you will worship these comments.
//
//  Confidence is tracked as a number 0..1, kept on each issue's evidence so
//  the Recommendation Engine in Step 10 can prioritize accordingly. Today
//  it's just a number; later it can drive UI hedging ("likely audience
//  fatigue" vs "audience fatigue").
// ════════════════════════════════════════════════════════════════════════

import { Severity } from "@prisma/client";

/**
 * Map a *bad-direction* fractional movement to severity.
 * E.g. a CTR drop of 0.30 (i.e. -30%) → caller passes 0.30 here.
 *
 * Why the buckets:
 *   <0.10 → LOW       :: typical week-to-week variance from creative refresh
 *   <0.25 → MEDIUM    :: large enough that an attentive operator would notice
 *   <0.50 → HIGH      :: large enough that an inattentive operator should notice
 *   ≥0.50 → CRITICAL  :: campaign-killing magnitude; action overdue
 *
 * because:
 *   These buckets mirror the rough rule-of-thumb used in Meta-ads operations
 *   forums: 10% noise, 25% notable, 50% emergency. They are NOT measured
 *   against Iraqi furniture/cosmetics data. Adjust after real users.
 */
export function severityFromMagnitude(absMovement: number): Severity {
  if (absMovement < 0.10) return Severity.LOW;
  if (absMovement < 0.25) return Severity.MEDIUM;
  if (absMovement < 0.50) return Severity.HIGH;
  return Severity.CRITICAL;
}

/**
 * Confidence is a function of how clean the signal is. Multi-signal
 * agreement (e.g. CTR down AND frequency up AND results down) raises
 * confidence; a lone movement is lower. Used by AUDIENCE_FATIGUE detection.
 *
 * Returns a number in [0, 1]. Stored on evidence as { confidence: 0.85 }.
 */
export function confidenceFromCorroboration(signals: Array<boolean>): number {
  const present = signals.filter(Boolean).length;
  const total = signals.length;
  if (total === 0) return 0;
  // Linear: 1/3 signals = 0.45, 2/3 = 0.70, 3/3 = 0.90.
  // Not 1.0 because we are never certain.
  // because:
  //   We want corroboration to matter more than the count, but not absurdly
  //   so. A floor of 0.45 prevents single-signal issues from looking
  //   dismissibly tentative; a ceiling of 0.90 keeps room for "this is
  //   definitely it" once user feedback teaches us patterns.
  return +(0.20 + (present / total) * 0.70).toFixed(2);
}
