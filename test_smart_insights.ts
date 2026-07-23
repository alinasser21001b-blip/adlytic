// test_smart_insights.ts — assertions for src/lib/smartInsights.ts
import {
  benchmarkCtr, benchmarkFrequency, computeForecast, detectBleed,
} from './src/lib/smartInsights';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, actual?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — got:`, actual); }
}

// ── benchmarks ──
check('ctr null in → null', benchmarkCtr(null, null, false) === null);
check('ctr above global good', benchmarkCtr(2.0, null, false)?.position === 'good');
check('ctr within global ok', benchmarkCtr(1.2, null, false)?.position === 'ok');
check('ctr below global low', benchmarkCtr(0.5, null, false)?.position === 'low');
// Furniture industry: 0.8-1.5 — a 1.2 CTR is "within", not "below" the fashion range
check('industry match (furniture)', benchmarkCtr(0.9, 'Furniture Store', false)?.position === 'ok');
check('arabic text present', (benchmarkCtr(2.0, null, true)?.text ?? '').includes('المعيار'));
check('freq healthy', benchmarkFrequency(2.1, false)?.position === 'good');
check('freq watch band', benchmarkFrequency(3.5, false)?.position === 'ok');
check('freq saturated', benchmarkFrequency(4.5, false)?.position === 'low');

// ── forecast ──
const D = (offsetDays: number, spend: number, messages: number, base: Date) => ({
  date: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - offsetDays)),
  spend, messages,
});
{
  const now = new Date(Date.UTC(2026, 6, 15)); // July 15
  const rows = Array.from({ length: 10 }, (_, i) => D(9 - i, 1000, 10, now));
  const f = computeForecast(rows, now);
  // days in July = 31, day 15 → 16 left; mtd = 10 days × 1000; pace = 1000
  check('forecast projects', f !== null && f.daysLeft === 16, f);
  check('forecast spend = mtd + pace*left', f?.projectedSpendMinor === 10_000 + 16_000, f?.projectedSpendMinor);
  check('forecast messages', f?.projectedMessages === 100 + 160, f?.projectedMessages);
}
check('forecast null on thin data', computeForecast([], new Date()) === null);

// ── bleed ──
{
  const now = new Date(Date.UTC(2026, 6, 15));
  const healthy = [...Array.from({ length: 7 }, (_, i) => D(7 - i, 1000, 10, now)), D(0, 600, 0, now)];
  const b = detectBleed(healthy, now);
  check('bleed fires on zero-result today', b !== null && b.spendTodayMinor === 600, b);

  const tooEarly = [...Array.from({ length: 7 }, (_, i) => D(7 - i, 1000, 10, now)), D(0, 100, 0, now)];
  check('bleed silent below 25% of avg spend', detectBleed(tooEarly, now) === null);

  const producing = [...Array.from({ length: 7 }, (_, i) => D(7 - i, 1000, 10, now)), D(0, 600, 3, now)];
  check('bleed silent when producing', detectBleed(producing, now) === null);

  const staleLast = Array.from({ length: 8 }, (_, i) => D(8 - i, 1000, 0, now));
  check('bleed silent when last row is not today', detectBleed(staleLast, now) === null);
}

console.log(`\n════ ${passed} passed, ${failed} failed ════`);
if (failed > 0) process.exit(1);
