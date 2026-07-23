// ════════════════════════════════════════════════════════════════════════
//  src/lib/performanceDrain.ts
//
//  "What is the current degradation costing, in money?"
//
//  Pure function over account daily_stats: compares the last 7 days'
//  cost-per-result against the prior 7 days. When efficiency worsened, the
//  excess is expressed in minor currency units — the single most persuasive
//  number on the dashboard ("this is costing you ~120,000 IQD a week"),
//  following the money-framing rule that wins in world-class ad platforms.
//
//  Honesty constraints:
//    • ONE account-level figure. We deliberately do NOT attribute cost per
//      issue — multiple issues share the same excess spend and per-issue
//      splits would double-count.
//    • Conservative: returns null when there is no prior baseline, too few
//      days, or performance actually improved. No number beats a fake one.
// ════════════════════════════════════════════════════════════════════════

export interface DrainInput {
  /** Daily rows sorted ascending by date. BigInt-bearing Prisma rows OK. */
  spend: number;    // minor units
  messages: number; // primary result unit
}

export interface PerformanceDrain {
  /** Estimated excess spend over the last 7 days vs the prior-7-day
   *  baseline, in minor currency units. Always > 0 (else null is returned). */
  weeklyExcessMinor: number;
  /** Cost-per-result change vs baseline, in percent (positive = worse).
   *  Null for the zero-results case where the ratio is undefined. */
  cprChangePct: number | null;
  /** Which formula produced the estimate. */
  basis: 'cpr_regression' | 'spend_without_results';
}

/**
 * Compute the drain from the last 14 daily rows (7 current + 7 baseline).
 * Fewer than 8 rows, missing baseline, or improving efficiency → null.
 */
export function computePerformanceDrain(daily: DrainInput[]): PerformanceDrain | null {
  if (daily.length < 8) return null;
  const last14 = daily.slice(-14);
  const split = Math.max(1, last14.length - 7);
  const prev = last14.slice(0, split);
  const now = last14.slice(split);

  const sum = (rows: DrainInput[], k: keyof DrainInput) =>
    rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  const spendNow = sum(now, 'spend');
  const msgsNow = sum(now, 'messages');
  const spendPrev = sum(prev, 'spend');
  const msgsPrev = sum(prev, 'messages');

  if (spendNow <= 0 || spendPrev <= 0) return null;

  // Case 1: spending but producing nothing, while the baseline DID produce.
  // The whole current spend is the drain.
  if (msgsNow === 0 && msgsPrev > 0) {
    return {
      weeklyExcessMinor: Math.round(spendNow),
      cprChangePct: null,
      basis: 'spend_without_results',
    };
  }

  if (msgsNow === 0 || msgsPrev === 0) return null;

  const cprNow = spendNow / msgsNow;
  const cprPrev = spendPrev / msgsPrev;
  if (cprNow <= cprPrev) return null; // efficiency same or better — no drain

  const excess = (cprNow - cprPrev) * msgsNow;
  // Ignore noise: less than 2% of current spend isn't a story worth telling.
  if (excess < spendNow * 0.02) return null;

  return {
    weeklyExcessMinor: Math.round(excess),
    cprChangePct: Math.round(((cprNow - cprPrev) / cprPrev) * 1000) / 10,
    basis: 'cpr_regression',
  };
}
