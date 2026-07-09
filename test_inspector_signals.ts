/**
 * Inspector signal honesty checks (comparable / volume / zero-base).
 * Run: npx tsx test_inspector_signals.ts
 *
 * Mirrors the comparable + pctChange rules used in the inspector API.
 */

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function pctChange(curr: number | null, base: number | null): number | null {
  if (curr == null || base == null || !Number.isFinite(curr) || !Number.isFinite(base)) return null;
  if (base === 0) return curr === 0 ? 0 : 100;
  return ((curr - base) / base) * 100;
}

function isComparable(opts: {
  recentDays: number;
  priorDays: number;
  recentSpend: number;
  priorSpend: number;
  recentResults: number;
  priorResults: number;
}): boolean {
  return (
    opts.recentDays >= 3 &&
    opts.priorDays >= 3 &&
    (opts.recentSpend > 0 || opts.recentResults > 0) &&
    (opts.priorSpend > 0 || opts.priorResults > 0)
  );
}

assert(
  !isComparable({
    recentDays: 2,
    priorDays: 7,
    recentSpend: 10,
    priorSpend: 10,
    recentResults: 5,
    priorResults: 5,
  }),
  'thin recent window → not comparable',
);

assert(
  !isComparable({
    recentDays: 7,
    priorDays: 0,
    recentSpend: 10,
    priorSpend: 0,
    recentResults: 5,
    priorResults: 0,
  }),
  'missing prior window → not comparable',
);

assert(
  !isComparable({
    recentDays: 7,
    priorDays: 7,
    recentSpend: 0,
    priorSpend: 0,
    recentResults: 0,
    priorResults: 0,
  }),
  'zero delivery both windows → not comparable',
);

assert(
  isComparable({
    recentDays: 7,
    priorDays: 7,
    recentSpend: 100,
    priorSpend: 90,
    recentResults: 20,
    priorResults: 18,
  }),
  'full windows with delivery → comparable',
);

assert(pctChange(10, 0) === 100, 'zero base with activity → 100% change');
assert(pctChange(0, 0) === 0, 'zero to zero → 0');
assert(Math.abs((pctChange(110, 100) ?? 0) - 10) < 1e-9, '110 vs 100 → +10%');
assert(pctChange(null, 100) == null, 'null current → null');

const spendDelta = pctChange(150, 100);
assert(spendDelta != null && Math.abs(spendDelta) >= 3, 'volume move ≥3% is material');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll inspector signal checks passed.');
