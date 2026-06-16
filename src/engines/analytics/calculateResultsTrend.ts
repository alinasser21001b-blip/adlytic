// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/calculateResultsTrend.ts
//
//  "Results" is the objective-aware count: messages for message campaigns,
//  purchases for purchase campaigns, leads for lead campaigns. The mapper
//  already collapsed these into `conversions` (objective-agnostic), so we
//  just sum that field across each window.
//
//  Results trend is a COUNT trend — SUM the window, then compare.
//  A "results dropped 31%" reading is FACT. "DECLINING_RESULTS" is JUDGMENT.
// ════════════════════════════════════════════════════════════════════════

import type { DailyPoint } from "./aggregate";
import { sumCount } from "./aggregate";
import { trend } from "./trend";

export function calculateResultsTrend(current: DailyPoint[], prior: DailyPoint[]): number | null {
  const cur = sumCount(current, "conversions");
  const prv = sumCount(prior, "conversions");
  // minSignal: at least 3 results in the prior period to call it a trend;
  // 1 → 2 is noise, not a doubling.
  return trend(cur, prv, { minSignal: 3 });
}
