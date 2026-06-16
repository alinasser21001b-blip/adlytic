// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/aggregate.ts
//
//  Shared aggregation primitives. The distinction these enforce is the
//  single most important one in this engine:
//
//    COUNTS  (spend, messages, impressions, clicks, reach) → SUM the window
//    RATES   (ctr, cpm, frequency)                         → AVG the window
//
//  Conflating them silently produces wrong numbers — averaging spend across
//  a 7-day window understates totals by 7x; summing CTR across a window is
//  meaningless. Every calculator below routes through these two helpers.
// ════════════════════════════════════════════════════════════════════════

/** A daily_stats row, shaped for analytics consumption (numbers, not BigInt). */
export interface DailyPoint {
  date: string;                 // YYYY-MM-DD
  spend: number;                // minor units
  messages: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;           // %
  cpm: number | null;           // minor units per 1000 impressions
  frequency: number | null;
  conversions: number;
}

/** Sum a count field across the window. Missing values count as zero. */
export function sumCount(points: DailyPoint[], field: keyof DailyPoint): number {
  let t = 0;
  for (const p of points) {
    const v = p[field];
    if (typeof v === "number" && Number.isFinite(v)) t += v;
  }
  return t;
}

/**
 * Average a rate field across the window. Returns null when no data points
 * have a value — averaging zeros silently is wrong for rates (a campaign
 * that didn't run has no CTR, not a zero CTR).
 *
 * Weighted by impressions when sensible (CTR, CPM): a day with 1000
 * impressions matters more than a day with 10. Frequency is unweighted
 * because Meta already computes it per-period.
 */
export function avgRate(
  points: DailyPoint[],
  field: "ctr" | "cpm" | "frequency"
): number | null {
  if (field === "frequency") {
    const vals = points.map(p => p.frequency).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4);
  }
  // Weighted by impressions
  let numerator = 0, weight = 0;
  for (const p of points) {
    const v = p[field];
    if (v == null || !Number.isFinite(v)) continue;
    const w = p.impressions || 0;
    if (w <= 0) continue;
    numerator += v * w;
    weight += w;
  }
  if (weight === 0) return null;
  return +(numerator / weight).toFixed(4);
}
