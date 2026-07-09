// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectLowCtr.ts
//
//  Fires when the current-period CTR is below an industry-generic threshold.
//  Does NOT fire on a falling-but-still-healthy CTR (3.5% → 3.0% is healthy,
//  Analytics already flagged the movement). This rule answers a different
//  question: "is the CURRENT level itself bad?"
// ════════════════════════════════════════════════════════════════════════

import { IssueCode } from "@prisma/client";
import { lowCtrFloorForObjective } from "../../knowledge/metaObjectiveStandards";
import type { Detector } from "./types";
import { severityFromMagnitude } from "./severity";

/**
 * Objective-aware CTR floor from Meta 2025–2026 benchmarks:
 *   awareness ~0.6% (brand/reach CTRs are naturally lower)
 *   traffic / messaging / sales ~1.0%
 *   leads ~1.2% (lead-gen typically higher engagement)
 *
 * Industry overrides can still refine recommendation text; detection uses
 * the Meta objective floor so awareness campaigns are not falsely flagged.
 */
const DEFAULT_LOW_CTR_THRESHOLD = 1.0; // percent — messaging/traffic fallback

export const detectLowCtr: Detector = (s) => {
  if (s.currentCtr == null) return null;
  const threshold =
    s.objective != null && String(s.objective).trim() !== ""
      ? lowCtrFloorForObjective(s.objective)
      : DEFAULT_LOW_CTR_THRESHOLD;
  if (s.currentCtr >= threshold) return null;

  // Severity scales with how far below the threshold we are.
  const gap = (threshold - s.currentCtr) / threshold;
  const severity = severityFromMagnitude(gap);

  return {
    issueCode: IssueCode.LOW_CTR,
    severity,
    evidence: {
      currentCtr: s.currentCtr,
      threshold,
      objective: s.objective ?? null,
      gapBelowThreshold: +gap.toFixed(3),
      confidence: 0.80, // current-level signal is direct, not inferred
    },
  };
};
