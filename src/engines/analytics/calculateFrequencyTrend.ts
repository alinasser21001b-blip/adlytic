// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/calculateFrequencyTrend.ts
//
//  Frequency is a RATE (impressions per reached person). Already a period
//  computation in Meta's payload, so we average unweighted.
//  Rising frequency is FACT. "Audience fatigue" is JUDGMENT — not here.
// ════════════════════════════════════════════════════════════════════════

import type { DailyPoint } from "./aggregate";
import { avgRate } from "./aggregate";
import { trend } from "./trend";

export function calculateFrequencyTrend(current: DailyPoint[], prior: DailyPoint[]): number | null {
  const cur = avgRate(current, "frequency");
  const prv = avgRate(prior, "frequency");
  return trend(cur, prv, { noiseFloor: 0.01 });
}
