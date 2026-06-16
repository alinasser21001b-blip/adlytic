// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/calculateCtrTrend.ts
//
//  CTR is a RATE — averaged across the window, weighted by impressions.
//  A day with 10,000 impressions matters more than a day with 100 when
//  computing "the period's CTR".
// ════════════════════════════════════════════════════════════════════════

import type { DailyPoint } from "./aggregate";
import { avgRate } from "./aggregate";
import { trend } from "./trend";

export function calculateCtrTrend(current: DailyPoint[], prior: DailyPoint[]): number | null {
  const cur = avgRate(current, "ctr");
  const prv = avgRate(prior, "ctr");
  return trend(cur, prv, { noiseFloor: 0.02 }); // ignore sub-2% movement
}
