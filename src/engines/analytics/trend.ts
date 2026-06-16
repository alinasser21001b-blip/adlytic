// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/trend.ts
//
//  THE single division operation in the whole engine. Every calculator
//  delegates here so the contract is identical for every metric:
//
//    1. If prior is null → return null (no comparison possible)
//    2. If prior is 0 → return null (would be Infinity; honest answer is "unknown")
//    3. If both periods have insufficient signal → return null
//    4. Otherwise return (current - prior) / prior, rounded to 4 decimals
//
//  Returning null is correct, not lazy. The Rules Engine reads metric_trends
//  and decides what to do with nulls — that is its job, not ours.
//  Returning 999% or Infinity here would be a judgment, and judgments belong
//  to Step 8.
// ════════════════════════════════════════════════════════════════════════

export interface TrendOptions {
  /** Minimum total volume (sum of weights) required in EACH period for a trend
   *  to be considered signal. Below this, return null. Default 1. */
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
  if (minSignal > 0 && Math.abs(prior) < minSignal && Math.abs(current) < minSignal) return null;

  const delta = (current - prior) / prior;
  const floor = opts.noiseFloor ?? 0;
  if (floor > 0 && Math.abs(delta) < floor) return 0;
  return +delta.toFixed(4);
}
