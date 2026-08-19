/**
 * P0-01 — Service-layer result-semantics regression suite.
 *
 * Guards src/services/getDashboard.ts's Results / Cost-per-result / account
 * funnel attribution against re-summing incompatible result units. This is
 * the service-layer counterpart to test_result_semantics.ts (which tests
 * src/analytics/resultSemantics.ts's own primitives) and to
 * test_analytics_architecture.ts (which regex-scans source for the pattern);
 * this file exercises the actual functions getDashboard() calls, not their
 * building blocks or a text scan.
 *
 * THE BUG THIS GUARDS (characterized below, not just asserted against):
 * getDashboard.ts computed merchant-facing "Results" and "Cost per result"
 * via `Number(d.messages||0) + Number(d.purchases||0) + Number(d.leads||0)`
 * — literally adding conversations to orders to leads, in four places
 * (trendSeries.results, trendSeries.costPerResult, the windowTrends
 * resultsTrend delta, and the account funnel's resultAttribution). A prior,
 * correctly-gated client-side fallback already existed in dashboardPage.ts
 * but was unconditionally overwritten by this same unsafe value — see that
 * file's fix in the same change as this test.
 *
 * Run: npx tsx test_result_semantics_service.ts
 */
import assert from 'node:assert/strict';
import {
  computeWindowTrendDeltas,
  resolveResultsColumn,
  buildResultsAndCostSeries,
} from './src/services/getDashboard';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\n── 0. Characterize the bug being fixed ──');

check('the OLD formula really did fabricate a cross-unit total (documented, not just asserted)', () => {
  // This is exactly src/services/getDashboard.ts's pre-fix expression,
  // reproduced here verbatim so the regression this suite guards is
  // undeniable, not inferred.
  const oldBuggyFormula = (d: { messages?: number; purchases?: number; leads?: number }) =>
    Number(d.messages || 0) + Number(d.purchases || 0) + Number(d.leads || 0);
  const row = { messages: 5, purchases: 2, leads: 0 };
  assert.equal(oldBuggyFormula(row), 7,
    'confirms the old code would have reported "7 results" for 5 conversations + 2 orders');
  // The fixed function must NOT reproduce this number for the same row —
  // proven in scenario D below.
});

console.log('\n── 1. resolveResultsColumn — single-unit-or-null resolution ──');

check('H. objective with a canonical single result unit resolves to its column', () => {
  const breakdown = { byUnit: [{ dailyColumn: 'purchases' }] };
  assert.equal(resolveResultsColumn(breakdown), 'purchases');
});

check('I. an account mixing purposes (2+ units) has NO single result column — null, not a guess', () => {
  const breakdown = { byUnit: [{ dailyColumn: 'messages' }, { dailyColumn: 'purchases' }] };
  assert.equal(resolveResultsColumn(breakdown), null);
});

check('no resolvable breakdown at all (empty byUnit) is also null', () => {
  assert.equal(resolveResultsColumn({ byUnit: [] }), null);
});

check('a null breakdown (resolution failed upstream) is null, not a crash', () => {
  assert.equal(resolveResultsColumn(null), null);
});

console.log('\n── 2. buildResultsAndCostSeries — per-day results, gated to ONE unit ──');

const factor = 100; // USD-like minor-unit factor

check('A. messages only populated', () => {
  const { results } = buildResultsAndCostSeries(
    [{ messages: 5, purchases: 0, leads: 0, spend: 1000 }], 'messages', factor,
  );
  assert.deepEqual(results, [5]);
});

check('B. purchases only populated', () => {
  const { results } = buildResultsAndCostSeries(
    [{ messages: 0, purchases: 3, leads: 0, spend: 900 }], 'purchases', factor,
  );
  assert.deepEqual(results, [3]);
});

check('C. leads only populated', () => {
  const { results } = buildResultsAndCostSeries(
    [{ messages: 0, purchases: 0, leads: 4, spend: 800 }], 'leads', factor,
  );
  assert.deepEqual(results, [4]);
});

check('D. messages=5 AND purchases=2 simultaneously — Results is 5, explicitly NOT 7', () => {
  // The exact case named in the remediation brief. The account's resolved
  // purpose is messaging (resultsColumn='messages'), so the incidental
  // purchases column must be ignored entirely, not added in.
  const { results } = buildResultsAndCostSeries(
    [{ messages: 5, purchases: 2, leads: 0, spend: 1000 }], 'messages', factor,
  );
  assert.deepEqual(results, [5]);
  assert.notEqual(results[0], 7, 'must not silently sum messages+purchases into 7');
});

check('E. leads=6 AND purchases=2 simultaneously — Results is 6, NOT 8', () => {
  const { results } = buildResultsAndCostSeries(
    [{ messages: 0, purchases: 2, leads: 6, spend: 500 }], 'leads', factor,
  );
  assert.deepEqual(results, [6]);
  assert.notEqual(results[0], 8);
});

check('F. all three counters populated — only the resolved column counts, NOT the sum of all three', () => {
  const { results } = buildResultsAndCostSeries(
    [{ messages: 3, purchases: 9, leads: 1, spend: 2000 }], 'purchases', factor,
  );
  assert.deepEqual(results, [9]);
  assert.notEqual(results[0], 13, 'must not sum 3+9+1');
});

check('G. zero results on the resolved column — 0, not null, and no cost-per-result division', () => {
  const { results, costPerResult } = buildResultsAndCostSeries(
    [{ messages: 0, purchases: 0, leads: 0, spend: 500 }], 'messages', factor,
  );
  assert.deepEqual(results, [0]);
  assert.deepEqual(costPerResult, [null], 'zero results must not divide spend by zero-ish and must not read as "no data"');
});

check('I. mixed/unresolvable purpose (resultsColumn null) — every day is null, never a fallback sum', () => {
  const { results, costPerResult } = buildResultsAndCostSeries(
    [{ messages: 5, purchases: 2, leads: 0, spend: 1000 }], null, factor,
  );
  assert.deepEqual(results, [null]);
  assert.deepEqual(costPerResult, [null]);
});

check('cost-per-result divides spend (major units) by the SAME resolved-column result count', () => {
  const { costPerResult } = buildResultsAndCostSeries(
    [{ messages: 0, purchases: 5, leads: 0, spend: 2500 }], 'purchases', factor,
  );
  assert.equal(costPerResult[0], 5); // 2500 minor / 100 factor = 25 major / 5 results = 5
});

check('multi-day window: absent days on the resolved column read as 0, not null (existing daily-row shape)', () => {
  const { results } = buildResultsAndCostSeries(
    [
      { messages: 5, purchases: 0, leads: 0, spend: 1000 },
      { messages: 0, purchases: 0, leads: 0, spend: 300 }, // no messages this day
      { messages: 8, purchases: 0, leads: 0, spend: 1200 },
    ],
    'messages', factor,
  );
  assert.deepEqual(results, [5, 0, 8]);
});

console.log('\n── 3. computeWindowTrendDeltas — resultsTrend uses the SAME resolved column ──');

check('resultsTrend reflects only the resolved column, not a cross-unit sum', () => {
  const current = [{ messages: 10, purchases: 5, leads: 0, spend: 1000, impressions: 1000, clicks: 50, frequency: 1.2 }];
  const prior = [{ messages: 5, purchases: 0, leads: 0, spend: 900, impressions: 900, clicks: 40, frequency: 1.1 }];
  const withMessagesResolved = computeWindowTrendDeltas(current, prior, factor, 'messages');
  // messages: 10 vs 5 → +100%. If the old bug were present it would compare
  // 15 (10+5 purchases) vs 5, i.e. +200% — a different, wrong number.
  assert.equal(withMessagesResolved.resultsTrend, 1.0);
});

check('resultsTrend is null for a mixed/unresolvable account — never computed from a fabricated sum', () => {
  const current = [{ messages: 10, purchases: 5, leads: 0, spend: 1000, impressions: 1000, clicks: 50, frequency: 1.2 }];
  const prior = [{ messages: 5, purchases: 0, leads: 0, spend: 900, impressions: 900, clicks: 40, frequency: 1.1 }];
  const mixed = computeWindowTrendDeltas(current, prior, factor, null);
  assert.equal(mixed.resultsTrend, null);
});

check('other trend fields (spend/ctr/cpm/frequency) are unaffected by resultsColumn', () => {
  const current = [{ messages: 10, purchases: 5, leads: 0, spend: 1000, impressions: 1000, clicks: 50, frequency: 1.2 }];
  const prior = [{ messages: 5, purchases: 0, leads: 0, spend: 900, impressions: 900, clicks: 40, frequency: 1.1 }];
  const a = computeWindowTrendDeltas(current, prior, factor, 'messages');
  const b = computeWindowTrendDeltas(current, prior, factor, null);
  assert.equal(a.spendTrend, b.spendTrend);
  assert.equal(a.ctrTrend, b.ctrTrend);
  assert.equal(a.cpmTrend, b.cpmTrend);
  assert.equal(a.frequencyTrend, b.frequencyTrend);
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
