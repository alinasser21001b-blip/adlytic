// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/calculateSpendTrend.ts
//
//  Spend is a COUNT — total spent in the window. SUM and compare.
//  Rising spend may be intentional (scaling) or unintentional (runaway
//  budget). Analytics reports the movement; Rules decides if it's a problem.
// ════════════════════════════════════════════════════════════════════════

import type { DailyPoint } from "./aggregate";
import { sumCount } from "./aggregate";
import { trend } from "./trend";

export function calculateSpendTrend(current: DailyPoint[], prior: DailyPoint[]): number | null {
  const cur = sumCount(current, "spend");
  const prv = sumCount(prior, "spend");
  return trend(cur, prv, { minSignal: 3 });
}
