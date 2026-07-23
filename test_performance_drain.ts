// test_performance_drain.ts — assertions for src/lib/performanceDrain.ts
import { computePerformanceDrain } from './src/lib/performanceDrain';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, actual?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — got:`, actual); }
}

const day = (spend: number, messages: number) => ({ spend, messages });

// 1. Too little data → null
check('null on <8 days', computePerformanceDrain([day(100, 1)]) === null);

// 2. Flat efficiency → null (cpr identical both windows)
{
  const rows = Array.from({ length: 14 }, () => day(1000, 10));
  check('null when flat', computePerformanceDrain(rows) === null);
}

// 3. Improving efficiency → null
{
  const rows = [
    ...Array.from({ length: 7 }, () => day(1000, 5)),   // cpr 200
    ...Array.from({ length: 7 }, () => day(1000, 10)),  // cpr 100 (better)
  ];
  check('null when improving', computePerformanceDrain(rows) === null);
}

// 4. Worsening cpr → excess = (cprNow - cprPrev) * msgsNow
{
  const rows = [
    ...Array.from({ length: 7 }, () => day(1000, 10)),  // cpr 100
    ...Array.from({ length: 7 }, () => day(1000, 5)),   // cpr 200
  ];
  const d = computePerformanceDrain(rows);
  // (200-100) * 35 msgs = 3500
  check('cpr regression excess', d !== null && d.weeklyExcessMinor === 3500, d);
  check('cpr regression basis', d?.basis === 'cpr_regression', d?.basis);
  check('cpr change pct = 100', d?.cprChangePct === 100, d?.cprChangePct);
}

// 5. Spend with zero results while baseline produced → full current spend
{
  const rows = [
    ...Array.from({ length: 7 }, () => day(1000, 10)),
    ...Array.from({ length: 7 }, () => day(500, 0)),
  ];
  const d = computePerformanceDrain(rows);
  check('zero-results drain = spend', d !== null && d.weeklyExcessMinor === 3500, d);
  check('zero-results basis', d?.basis === 'spend_without_results', d?.basis);
}

// 6. Noise below 2% of current spend → null
{
  const rows = [
    ...Array.from({ length: 7 }, () => day(100000, 1000)),  // cpr 100
    ...Array.from({ length: 7 }, () => day(100000, 999)),   // cpr ≈ 100.1
  ];
  check('null on sub-2% noise', computePerformanceDrain(rows) === null);
}

// 7. Both windows zero results → null (no baseline to compare)
{
  const rows = Array.from({ length: 14 }, () => day(1000, 0));
  check('null when never producing', computePerformanceDrain(rows) === null);
}

console.log(`\n════ ${passed} passed, ${failed} failed ════`);
if (failed > 0) process.exit(1);
