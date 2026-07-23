// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/types.ts
//
//  Shared shapes for the detectors. Detectors are pure: take a Signals
//  object (trends + current aggregates), return either an IssueRecord
//  or null. Never write to the DB; the orchestrator does that.
// ════════════════════════════════════════════════════════════════════════

import type { IssueRecord } from "../../repositories/detectedIssuesRepo";

/**
 * Everything a detector might want to look at. Compact and explicit — no
 * raw daily_stats rows here, because at the detector level we should be
 * reasoning about aggregates and trends, not iterating data.
 */
export interface Signals {
  // From metric_trends (Analytics output)
  ctrTrend: number | null;
  cpmTrend: number | null;
  frequencyTrend: number | null;
  resultsTrend: number | null;
  spendTrend: number | null;

  // Current-period aggregates (the "is it bad now" view, complementing trends'
  // "is it getting worse" view). A trend of 0% on CTR=1.0% is still bad CTR.
  currentCtr: number | null;          // %
  currentFrequency: number | null;
  currentCpm: number | null;          // minor units
  currentResults: number;             // total in current window
  currentSpend: number;               // minor units total

  /**
   * Meta campaign objective (OUTCOME_AWARENESS, MESSAGES, …).
   * Optional for backward compatibility; when set, detectors/diagnose use
   * Meta objective standards (CTR floors, Arabic result vocabulary).
   */
  objective?: string | null;
}

export type Detector = (s: Signals) => IssueRecord | null;
export type { IssueRecord };
