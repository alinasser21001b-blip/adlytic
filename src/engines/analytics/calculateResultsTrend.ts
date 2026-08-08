// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/calculateResultsTrend.ts
//
//  "Results" is the objective-aware count: messages for message campaigns,
//  purchases for purchase campaigns, leads for lead campaigns.
//
//  The caller supplies the result KEY, resolved from the campaign's purpose
//  (see analytics/resultSemantics.ts). It used to sum the mapper's
//  `conversions` field, which was `messages || purchases || leads` — so a
//  sales campaign that also received page messages had its "results trend"
//  silently computed from message counts. Passing the key explicitly means the
//  trend is always measured in ONE unit, and the caller must have decided
//  which one.
//
//  Results trend is a COUNT trend — SUM the window, then compare.
//  A "results dropped 31%" reading is FACT. "DECLINING_RESULTS" is JUDGMENT.
// ════════════════════════════════════════════════════════════════════════

import type { DailyPoint } from "./aggregate";
import { sumCount } from "./aggregate";
import { trend } from "./trend";
import type { ResultMetricKey } from "../../lib/objectiveKpis";

/**
 * REQUIRED, not defaulted: a forgotten argument must be a compile error, not a
 * silently null trend.
 *
 * @param resultKey Which stored counter carries this entity's result. Null
 *   when the purpose could not be resolved (an account spanning several
 *   objectives) — the trend is then null rather than a cross-unit sum.
 */
export function calculateResultsTrend(
  current: DailyPoint[],
  prior: DailyPoint[],
  resultKey: ResultMetricKey | null,
): number | null {
  if (resultKey === null) return null;
  const cur = sumCount(current, resultKey as keyof DailyPoint);
  const prv = sumCount(prior, resultKey as keyof DailyPoint);
  // minSignal: at least 3 results in the prior period to call it a trend;
  // 1 → 2 is noise, not a doubling.
  return trend(cur, prv, { minSignal: 3 });
}
