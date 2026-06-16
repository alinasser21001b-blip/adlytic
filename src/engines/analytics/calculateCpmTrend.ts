// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/calculateCpmTrend.ts
//
//  CPM is a RATE (cost per 1000 impressions) — averaged, impression-weighted.
//  A rising CPM is FACT (Analytics). Whether it indicates competition pressure
//  or audience fatigue is JUDGMENT (Rules).
// ════════════════════════════════════════════════════════════════════════

import type { DailyPoint } from "./aggregate";
import { avgRate } from "./aggregate";
import { trend } from "./trend";

export function calculateCpmTrend(current: DailyPoint[], prior: DailyPoint[]): number | null {
  const cur = avgRate(current, "cpm");
  const prv = avgRate(prior, "cpm");
  return trend(cur, prv, { noiseFloor: 0.02 });
}
