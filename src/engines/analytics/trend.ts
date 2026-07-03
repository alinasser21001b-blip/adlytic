// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/trend.ts
//
//  THE single division operation in the whole engine. Every calculator
//  delegates here so the contract is identical for every metric:
//
//    1. If prior is null → return null (no comparison possible)
//    2. If prior is 0 → return null (would be Infinity; honest answer is "unknown")
//    3. If the prior (baseline/denominator) has insufficient signal → return null
//    4. Otherwise return (current - prior) / prior, rounded to 4 decimals
//
//  Returning null is correct, not lazy. The Rules Engine reads metric_trends
//  and decides what to do with nulls — that is its job, not ours.
//  Returning 999% or Infinity here would be a judgment, and judgments belong
//  to Step 8.
// ════════════════════════════════════════════════════════════════════════

export interface TrendOptions {
  /** Minimum volume required in the PRIOR period (the baseline/denominator)
   *  for a trend to be considered signal. If the baseline is noise, the trend
   *  is noise regardless of the current value. Below this, return null.
   *
   *  Default 0 (disabled) — appropriate for RATE metrics (CTR, frequency, CPM)
   *  where values below 1 are normal. Volume metrics (conversions, spend,
   *  impressions) MUST pass an explicit minSignal (e.g. 3 for conversions). */
  minSignal?: number;
  /** Minimum absolute movement to treat as a trend; below this → 0.
   *  Prevents noise like CPM 5.000 → 5.001 reading as +0.02%. Default 0. */
  noiseFloor?: number;
}

/**
 * Compute fractional change from prior → current.
 * Returns:
 *   number  — e.g. -0.28 meaning "down 28%"
 *   null    — when comparison is not meaningful
 */
export function trend(
  current: number | null,
  prior: number | null,
  opts: TrendOptions = {}
): number | null {
  if (current == null || prior == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (prior === 0) return null;          // honest answer to "0 → 5" is unknown
  const minSignal = opts.minSignal ?? 0;
  // Guard on the PRIOR only: it is the denominator and the baseline. A noisy
  // baseline (e.g. prior=1) makes the trend meaningless even if current is large
  // (1 → 6 is not a real +500%). Guarding on both would let that noise through.
  if (minSignal > 0 && Math.abs(prior) < minSignal) return null;

  const delta = +((current - prior) / prior).toFixed(4);
  const floor = opts.noiseFloor ?? 0;
  if (floor > 0 && Math.abs(delta) < floor) return 0;
  return delta;
}
