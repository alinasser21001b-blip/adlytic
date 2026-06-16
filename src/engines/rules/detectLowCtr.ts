// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectLowCtr.ts
//
//  Fires when the current-period CTR is below an industry-generic threshold.
//  Does NOT fire on a falling-but-still-healthy CTR (3.5% → 3.0% is healthy,
//  Analytics already flagged the movement). This rule answers a different
//  question: "is the CURRENT level itself bad?"
// ════════════════════════════════════════════════════════════════════════

import { IssueCode } from "@prisma/client";
import type { Detector } from "./types";
import { severityFromMagnitude } from "./severity";

/**
 * Threshold: CTR < 1.0%.
 *
 * because:
 *   Across Meta's published benchmarks for messaging/lead objectives, ~1.0%
 *   is roughly the line between "engaged audience" and "scroll-past". Below
 *   it, almost any creative refresh is worth trying. This is GENERIC, not
 *   industry-aware — the cosmetics override in knowledge_rules already
 *   handles industry-specific recommendation text; the *detection*
 *   threshold can stay universal at this stage.
 *
 *   Move to industry_profiles.knowledgeJson.ctrBenchmark once we have real
 *   data showing furniture and cosmetics need different LOW_CTR floors.
 */
const LOW_CTR_THRESHOLD = 1.0; // percent

export const detectLowCtr: Detector = (s) => {
  if (s.currentCtr == null) return null;
  if (s.currentCtr >= LOW_CTR_THRESHOLD) return null;

  // Severity scales with how far below the threshold we are.
  // E.g. CTR 0.7% is 30% below the 1.0% line → MEDIUM.
  const gap = (LOW_CTR_THRESHOLD - s.currentCtr) / LOW_CTR_THRESHOLD;
  const severity = severityFromMagnitude(gap);

  return {
    issueCode: IssueCode.LOW_CTR,
    severity,
    evidence: {
      currentCtr: s.currentCtr,
      threshold: LOW_CTR_THRESHOLD,
      gapBelowThreshold: +gap.toFixed(3),
      confidence: 0.80, // current-level signal is direct, not inferred
    },
  };
};
