/**
 * P2 — Result semantics regression suite.
 *
 * Guards the replacement of the ambiguous `DailyStat.conversions` column
 * (`messages || purchases || leads`) with explicit, typed result semantics.
 *
 * Every assertion maps to a way the old model was wrong. Do not relax one
 * without reproducing the failure it guards.
 *
 * Run: npx tsx test_result_semantics.ts
 */
import assert from 'node:assert/strict';
import {
  resultFor,
  resolveResult,
  resolveResultTotal,
  aggregateMixedResults,
  addResults,
  singleUnitCount,
  singleUnitResultKey,
  describeMixedAr,
  describeMixedEn,
  allResultDefinitions,
  type CampaignResultContribution,
} from './src/analytics/resultSemantics';
import { METRIC_DICTIONARY } from './src/analytics/metricDictionary';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';
import { classificationConfidenceFromReason } from './src/analytics/confidence';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

// Realistic daily rows. A messaging campaign that ALSO records incidental
// purchases/leads — the shape that made `conversions` ambiguous.
const msgRows = [
  { messages: 30, purchases: 0, leads: 0, clicks: 200, impressions: 12000 },
  { messages: 24, purchases: 1, leads: 0, clicks: 180, impressions: 11000 },
  { messages: 30, purchases: 0, leads: 2, clicks: 190, impressions: 11500 },
];
const salesRows = [
  { messages: 5, purchases: 7, leads: 0, clicks: 300, impressions: 20000 },
  { messages: 3, purchases: 5, leads: 0, clicks: 280, impressions: 19000 },
];
const leadRows = [
  { messages: 0, purchases: 0, leads: 9, clicks: 150, impressions: 9000 },
  { messages: 2, purchases: 0, leads: 6, clicks: 140, impressions: 8500 },
];

console.log('\n── 1. A result knows what it is ──');

check('every family has a definition with unit, outcome and cost metric', () => {
  for (const d of allResultDefinitions()) {
    assert.ok(d.unit, `${d.family}: missing unit`);
    assert.ok(d.businessOutcome, `${d.family}: missing businessOutcome`);
    assert.ok(d.labelAr && d.labelEn, `${d.family}: missing labels`);
    assert.ok(METRIC_DICTIONARY[d.costMetricKey],
      `${d.family}: costMetricKey "${d.costMetricKey}" is not in the metric dictionary`);
    if (d.rateMetricKey) {
      assert.ok(METRIC_DICTIONARY[d.rateMetricKey],
        `${d.family}: rateMetricKey "${d.rateMetricKey}" is not in the metric dictionary`);
    }
  }
});

check('resultKey and businessOutcome are DIFFERENT concepts', () => {
  // "messages" is what the platform counted; "qualified_conversations" is what
  // the merchant is buying. Collapsing them is how engagement ended up
  // describing a WhatsApp campaign.
  const m = resultFor('messaging');
  assert.equal(m.resultKey, 'messages');
  assert.equal(m.businessOutcome, 'qualified_conversations');
  assert.notEqual(String(m.resultKey), String(m.businessOutcome));
});

check('engagement is flagged as an approximation, others are not', () => {
  assert.equal(resultFor('engagement').approximate, true);
  assert.equal(resultFor('messaging').approximate, false);
  assert.equal(resultFor('sales').approximate, false);
});

console.log('\n── 2. Results are objective-aware, not first-non-zero ──');

check('a messaging campaign counts messages, ignoring incidental purchases', () => {
  const r = resolveResultTotal('messaging', msgRows);
  assert.equal(r.status, 'OK');
  assert.equal((r as any).count, 84);
  assert.equal((r as any).unit, 'conversation');
});

check('a sales campaign counts purchases, NOT its incidental messages', () => {
  // The old fallback returned `messages || purchases || leads`, so this
  // campaign reported 5 messages as its "conversions" — messages is evaluated
  // first and was non-zero.
  const r = resolveResultTotal('sales', salesRows);
  assert.equal((r as any).count, 12, 'must be 7+5 purchases, not 5+3 messages');
  assert.equal((r as any).unit, 'order');
});

check('a leads campaign counts leads, not its incidental messages', () => {
  const r = resolveResultTotal('leads', leadRows);
  assert.equal((r as any).count, 15);
  assert.equal((r as any).unit, 'lead');
});

check('an awareness campaign counts impressions', () => {
  const r = resolveResultTotal('awareness', msgRows);
  assert.equal((r as any).count, 34500);
  assert.equal((r as any).unit, 'impression');
});

console.log('\n── 3. UNKNOWN and INSUFFICIENT_DATA stay distinct from zero ──');

check('an unresolvable purpose is NOT_APPLICABLE, never 0', () => {
  const r = resolveResult(null, msgRows[0]!);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal((r as any).reason, 'NOT_APPLICABLE');
});

check('an empty row set is INSUFFICIENT_DATA, never 0', () => {
  const r = resolveResultTotal('messaging', []);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal((r as any).reason, 'INSUFFICIENT_DATA');
});

check('an unpopulated column is INSUFFICIENT_DATA, never 0', () => {
  const r = resolveResult('sales', { messages: 10 });   // purchases absent
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal((r as any).reason, 'INSUFFICIENT_DATA');
});

check('a REAL zero is OK with count 0 — not an error', () => {
  const r = resolveResult('sales', { purchases: 0, messages: 40 });
  assert.equal(r.status, 'OK');
  assert.equal((r as any).count, 0,
    'a measured zero must remain a value, distinguishable from "unknown"');
});

console.log('\n── 4. Illegal cross-purpose summing fails structurally ──');

check('adding conversations to orders THROWS', () => {
  const conversations = resolveResultTotal('messaging', msgRows);
  const orders = resolveResultTotal('sales', salesRows);
  assert.throws(() => addResults(conversations, orders), /Illegal cross-purpose aggregation/,
    'the model must refuse the sum, not compute a wrong number');
});

check('adding two results of the SAME unit is allowed', () => {
  const a = resolveResultTotal('messaging', msgRows);
  const b = resolveResultTotal('messaging', [{ messages: 16 }]);
  const sum = addResults(a, b);
  assert.equal(sum.status, 'OK');
  assert.equal((sum as any).count, 100);
});

check('MixedResultTotal has no single cross-unit total field', () => {
  const total = aggregateMixedResults([
    { family: 'messaging', rows: msgRows, spendMinor: 900_000 },
    { family: 'sales', rows: salesRows, spendMinor: 100_000 },
  ]);
  // The fabrication must be unrepresentable, not merely discouraged.
  assert.equal((total as any).total, undefined);
  assert.equal((total as any).count, undefined);
  assert.equal((total as any).results, undefined);
});

console.log('\n── 5. Mixed-purpose account: honest subtotals ──');

const mixed: CampaignResultContribution[] = [
  { family: 'messaging', rows: msgRows, spendMinor: 900_000 },
  { family: 'sales', rows: salesRows, spendMinor: 100_000 },
];

check('mixed account reports per-unit subtotals', () => {
  const t = aggregateMixedResults(mixed);
  assert.equal(t.mixed, true);
  assert.equal(t.byUnit.length, 2);
  const conv = t.byUnit.find((u) => u.unit === 'conversation')!;
  const ord = t.byUnit.find((u) => u.unit === 'order')!;
  assert.equal(conv.count, 84);
  assert.equal(ord.count, 12);
});

check('mixed account has NO single result count for computation', () => {
  assert.equal(singleUnitCount(aggregateMixedResults(mixed)), null,
    'computation must get null, forcing a fall back to per-unit detail');
  assert.equal(singleUnitResultKey(aggregateMixedResults(mixed)), null);
});

check('dominant is the highest-SPEND unit, and is framing only', () => {
  const t = aggregateMixedResults(mixed);
  assert.equal(t.dominant!.unit, 'conversation');
  assert.equal(t.dominant!.spendShare, 0.9);
  // dominant.count must never be mistaken for the account's total: it is 84,
  // and the account also produced 12 orders that it does not represent.
  assert.notEqual(t.dominant!.count, 84 + 12);
  assert.ok(t.byUnit.length > 1, 'per-unit detail must always remain exposed');
});

check('the merchant-facing summary lists every unit, never one total', () => {
  const t = aggregateMixedResults(mixed);
  const ar = describeMixedAr(t);
  assert.ok(ar.includes('84') && ar.includes('محادثة'), ar);
  assert.ok(ar.includes('12') && ar.includes('طلب'), ar);
  assert.ok(!ar.includes('96'), 'must never present a fabricated combined total');
  assert.ok(describeMixedEn(t).includes('conversation'), describeMixedEn(t));
});

console.log('\n── 6. Single-purpose accounts keep a usable single number ──');

check('messaging-only account resolves to one unit and a real count', () => {
  const t = aggregateMixedResults([
    { family: 'messaging', rows: msgRows, spendMinor: 500_000 },
    { family: 'messaging', rows: [{ messages: 16 }], spendMinor: 200_000 },
  ]);
  assert.equal(t.mixed, false);
  assert.equal(singleUnitCount(t), 100);
  assert.equal(singleUnitResultKey(t), 'messages');
  assert.equal(t.byUnit[0]!.campaigns, 2);
});

check('sales-only account resolves to orders', () => {
  const t = aggregateMixedResults([{ family: 'sales', rows: salesRows, spendMinor: 300_000 }]);
  assert.equal(t.mixed, false);
  assert.equal(singleUnitCount(t), 12);
  assert.equal(singleUnitResultKey(t), 'purchases');
});

check('leads-only account resolves to leads', () => {
  const t = aggregateMixedResults([{ family: 'leads', rows: leadRows, spendMinor: 150_000 }]);
  assert.equal(t.mixed, false);
  assert.equal(singleUnitCount(t), 15);
  assert.equal(singleUnitResultKey(t), 'leads');
});

console.log('\n── 7. Unknown purpose is skipped, never guessed ──');

check('a contribution with an unknown family is excluded, not defaulted', () => {
  const t = aggregateMixedResults([
    { family: 'messaging', rows: msgRows, spendMinor: 500_000 },
    { family: null, rows: salesRows, spendMinor: 400_000 },
  ]);
  assert.equal(t.byUnit.length, 1, 'the unknown campaign must not invent a unit');
  assert.equal(t.byUnit[0]!.unit, 'conversation');
  assert.equal(t.totalSpendMinor, 500_000,
    'spend from an unclassifiable campaign must not inflate the share denominator');
});

check('an account with only unknown campaigns yields no results at all', () => {
  const t = aggregateMixedResults([{ family: null, rows: msgRows, spendMinor: 100 }]);
  assert.equal(t.byUnit.length, 0);
  assert.equal(t.dominant, null);
  assert.equal(singleUnitCount(t), null);
  assert.equal(describeMixedAr(t), 'لا توجد نتائج بعد');
});

console.log('\n── 8. corroborated is additive evidence, never a classifier ──');

check('corroborated does not change the resolved family', () => {
  // Removing corroboration must lower reported confidence and nothing else.
  const cases = [
    { objective: 'OUTCOME_TRAFFIC', optimizationGoals: ['LINK_CLICKS'] },
    { objective: 'OUTCOME_ENGAGEMENT', optimizationGoals: ['CONVERSATIONS'] },
    { objective: 'OUTCOME_AWARENESS', optimizationGoals: ['REACH'] },
    { objective: 'OUTCOME_SALES', optimizationGoals: ['OFFSITE_CONVERSIONS'] },
  ];
  const expected = ['traffic', 'messaging', 'awareness', 'sales'];
  cases.forEach((input, i) => {
    const p = resolveCampaignPurpose(input);
    assert.equal(p.family, expected[i],
      `corroboration must not have altered classification for case ${i}`);
    assert.equal(typeof p.corroborated, 'boolean');
  });
});

check('agreeing signals raise reported confidence only', () => {
  const p = resolveCampaignPurpose({ objective: 'OUTCOME_TRAFFIC', optimizationGoals: ['LINK_CLICKS'] });
  assert.equal(p.corroborated, true, 'objective and goal agree');
  assert.equal(p.reason, 'objective:traffic', 'the reason string must be unchanged');
  assert.equal(classificationConfidenceFromReason(p.reason, p.corroborated), 'CONFIRMED');
  assert.equal(classificationConfidenceFromReason(p.reason, false), 'INFERRED',
    'without corroboration the same decision reports lower confidence — and nothing else changes');
});

check('a lone objective with no corroborating goal stays INFERRED', () => {
  const p = resolveCampaignPurpose({ objective: 'OUTCOME_SALES' });
  assert.equal(p.family, 'sales');
  assert.equal(p.corroborated, false);
  assert.equal(classificationConfidenceFromReason(p.reason, p.corroborated), 'INFERRED');
});

console.log('\n── 9. History is re-interpretable from data already on disk ──');

check('every result key is a column that predates this work', () => {
  // The whole no-backfill argument: messages / purchases / leads / clicks /
  // impressions have always been stored separately and correctly. If a result
  // definition ever points at a NEW column, this fails and the backfill
  // question must be answered explicitly.
  const PRE_EXISTING = new Set(['messages', 'purchases', 'leads', 'clicks', 'impressions']);
  for (const d of allResultDefinitions()) {
    assert.ok(PRE_EXISTING.has(d.resultKey),
      `${d.family} resolves results from "${d.resultKey}", which is not a pre-existing column — a backfill decision is now required`);
  }
});

check('no result definition reads the ambiguous conversions column', () => {
  for (const d of allResultDefinitions()) {
    assert.notEqual(String(d.resultKey), 'conversions',
      `${d.family} must not depend on the frozen ambiguous column`);
  }
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
