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
import { objectiveInputOf, type Detector } from "./types";
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
  // Prefer the resolved purpose family over the raw (deprecated) objective —
  // every real Signals-builder sets purposeFamily, never objective, so
  // reading s.objective alone silently fell through to the flat 1.0%
  // fallback for every campaign, ignoring whatever family resolveCampaignPurpose
  // had already determined (awareness's true 0.6% floor, leads' 1.2%, etc.).
  const objectiveInput = objectiveInputOf(s);
  const threshold =
    objectiveInput != null && String(objectiveInput).trim() !== ""
      ? lowCtrFloorForObjective(objectiveInput)
      : DEFAULT_LOW_CTR_THRESHOLD;
  if (s.currentCtr >= threshold) return null;

  // Severity scales with how far below the threshold we are.
  const gap = (threshold - s.currentCtr) / threshold;
  const severity = severityFromMagnitude(gap);

  return {
    issueCode: IssueCode.LOW_CTR,
    severity,
    confidence: { value: 0.80, basis: 'heuristic_constant' }, // current-level signal is direct, not inferred
    window: null,
    evidence: [
      {
        metricKey: 'ctr',
        valueKind: 'level',
        unit: 'percent',
        value: s.currentCtr,
        threshold,
        relativeToThreshold: +gap.toFixed(3),
      },
    ],
  };
};
