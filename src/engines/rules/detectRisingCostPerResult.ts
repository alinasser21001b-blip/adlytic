// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectRisingCostPerResult.ts
//
//  Fires when results are falling AND spend is roughly flat or rising —
//  i.e. each result is costing more than it used to. This is functionally
//  what users notice first ("messages cost more this week"), and it's a
//  cheap rule to add now because Analytics already produces both signals.
//
//  Distinct from DECLINING_RESULTS: results can drop because budget
//  dropped (intentional), in which case cost-per-result might be fine.
//  This rule isolates the cases where the unit economics actually got worse.
// ════════════════════════════════════════════════════════════════════════

import { IssueCode } from "@prisma/client";
import type { Detector } from "./types";
import { severityFromMagnitude } from "./severity";

/**
 * Fires when resultsTrend - spendTrend < -0.15, i.e. results dropped at
 * least 15 percentage points more than spend did.
 *
 * because:
 *   We don't store cost_per_result directly — but the math is equivalent:
 *   resultsTrend < spendTrend means each unit of spend is producing fewer
 *   results than before. A 15-point gap is the line above which an attentive
 *   operator would notice without us pointing it out, so we point it out below it.
 *   This threshold is the most arbitrary of the five; first to revisit.
 */
const COST_PER_RESULT_DIVERGENCE = 0.15;

export const detectRisingCostPerResult: Detector = (s) => {
  if (s.resultsTrend == null || s.spendTrend == null) return null;
  const divergence = s.resultsTrend - s.spendTrend;
  if (divergence > -COST_PER_RESULT_DIVERGENCE) return null;

  // Severity from the size of the divergence, not the absolute results drop
  const magnitude = Math.abs(divergence);
  const severity = severityFromMagnitude(magnitude);

  // `divergence` itself is not stored as its own Evidence item — it isn't a
  // single observed metric, it's resultsTrend minus spendTrend. Both source
  // values ARE stored below, so any reader (including diagnose.ts) recovers
  // it exactly by reading both, rather than trusting a third, derived number
  // that could theoretically drift from its own inputs.
  return {
    issueCode: IssueCode.RISING_COST_PER_RESULT,
    severity,
    confidence: { value: 0.75, basis: 'heuristic_constant' },
    window: null,
    evidence: [
      {
        metricKey: 'resultsTrend',
        valueKind: 'trend',
        unit: 'percent',
        value: s.resultsTrend,
        threshold: null,
        relativeToThreshold: null,
      },
      {
        metricKey: 'spendTrend',
        valueKind: 'trend',
        unit: 'percent',
        value: s.spendTrend,
        threshold: null,
        relativeToThreshold: null,
      },
    ],
  };
};
