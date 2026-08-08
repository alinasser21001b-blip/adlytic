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
  singleUnitResult,
  isApproximate,
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

console.log('\n── 10. Approximate results MUST remain approximate ──');

check('traffic clicks and engagement clicks are NOT the same business event', () => {
  // Both read the SAME source column. The column does not determine meaning.
  const traffic = resultFor('traffic');
  const engagement = resultFor('engagement');
  assert.equal(traffic.resultKey, 'clicks');
  assert.equal(engagement.resultKey, 'clicks');
  assert.notEqual(traffic.businessOutcome, engagement.businessOutcome);
  assert.notEqual(traffic.unit, engagement.unit);
  assert.equal(traffic.businessOutcome, 'site_visits');
  assert.equal(engagement.businessOutcome, 'social_interactions');
});

check('app "installs" are clicks, and are marked approximate', () => {
  const app = resultFor('app');
  assert.equal(app.resultKey, 'clicks', 'we do not have a real install signal');
  assert.equal(app.businessOutcome, 'app_installs');
  assert.equal(app.approximate, true,
    'a click proxy must never be presented as a measured install');
});

check('exact families are NOT marked approximate', () => {
  for (const f of ['messaging', 'sales', 'leads', 'traffic', 'awareness'] as const) {
    assert.equal(resultFor(f).approximate, false, `${f} should be an exact count`);
  }
});

check('an approximate result stays flagged through aggregation', () => {
  const t = aggregateMixedResults([
    { family: 'app', rows: [{ clicks: 400 }], spendMinor: 100_000 },
  ]);
  assert.equal(t.byUnit[0]!.approximate, true);
  assert.equal(isApproximate(t), true);
  assert.equal(singleUnitResult(t)!.approximate, true);
});

check('mixing approximate with exact PRESERVES the approximation flag', () => {
  const t = aggregateMixedResults([
    { family: 'messaging', rows: msgRows, spendMinor: 800_000 },   // exact
    { family: 'app', rows: [{ clicks: 400 }], spendMinor: 200_000 }, // approximate
  ]);
  assert.equal(isApproximate(t), true, 'one approximate contributor taints the whole');
  const conv = t.byUnit.find((u) => u.outcome === 'qualified_conversations')!;
  const inst = t.byUnit.find((u) => u.outcome === 'app_installs')!;
  assert.equal(conv.approximate, false, 'the exact subtotal stays exact');
  assert.equal(inst.approximate, true, 'the approximate subtotal stays approximate');
});

check('approximation is contagious WITHIN one outcome', () => {
  const t = aggregateMixedResults([
    { family: 'engagement', rows: [{ clicks: 100 }], spendMinor: 50_000 },
    { family: 'engagement', rows: [{ clicks: 50 }], spendMinor: 50_000 },
  ]);
  assert.equal(t.byUnit.length, 1);
  assert.equal(t.byUnit[0]!.approximate, true);
});

console.log('\n── 11. `unit` must not hide semantic differences ──');

check('aggregation groups by businessOutcome, not by unit or source column', () => {
  // Three families read `clicks`. If aggregation keyed on the column — or on a
  // unit two definitions happened to share — they would silently merge into
  // one meaningless number.
  const t = aggregateMixedResults([
    { family: 'traffic', rows: [{ clicks: 100 }], spendMinor: 100_000 },
    { family: 'engagement', rows: [{ clicks: 200 }], spendMinor: 100_000 },
    { family: 'app', rows: [{ clicks: 300 }], spendMinor: 100_000 },
  ]);
  assert.equal(t.byUnit.length, 3, 'three distinct business outcomes must stay separate');
  const outcomes = t.byUnit.map((u) => u.outcome).sort();
  assert.deepEqual(outcomes, ['app_installs', 'site_visits', 'social_interactions']);
  assert.equal(t.byUnit.find((u) => u.outcome === 'site_visits')!.count, 100);
  assert.equal(t.byUnit.find((u) => u.outcome === 'social_interactions')!.count, 200);
  assert.equal(t.byUnit.find((u) => u.outcome === 'app_installs')!.count, 300);
  assert.equal(singleUnitCount(t), null, 'no single number may represent all three');
});

check('no two definitions share a unit while meaning different outcomes', () => {
  // Invariant. If this ever fails, aggregation is still safe (it keys on
  // outcome) but the UNIT vocabulary has become misleading and needs a new
  // member rather than a reused one.
  const byUnit = new Map<string, Set<string>>();
  for (const d of allResultDefinitions()) {
    const set = byUnit.get(d.unit) ?? new Set<string>();
    set.add(d.businessOutcome);
    byUnit.set(d.unit, set);
  }
  for (const [unit, outcomes] of byUnit) {
    assert.equal(outcomes.size, 1,
      `unit "${unit}" is used for several outcomes (${[...outcomes].join(', ')}) — add a distinct unit`);
  }
});

check('two results of the same unit but different outcomes never merge', () => {
  const traffic = resolveResultTotal('traffic', [{ clicks: 10 }]);
  const engagement = resolveResultTotal('engagement', [{ clicks: 10 }]);
  assert.notEqual((traffic as any).outcome, (engagement as any).outcome);
  // Different units today, so addResults rejects them outright.
  assert.throws(() => addResults(traffic, engagement), /Illegal cross-purpose aggregation/);
});

console.log('\n── 12. dominant is not consumable by calculation ──');

check('dominant carries no result key — it cannot drive a computation', () => {
  const t = aggregateMixedResults(mixed);
  assert.equal((t.dominant as any).resultKey, undefined,
    'dominant must not expose what to count; only singleUnitResultKey may');
  assert.equal((t.dominant as any).rows, undefined);
  assert.equal((t.dominant as any).definition, undefined);
});

check('a mixed account gives calculation NOTHING, even though dominant exists', () => {
  const t = aggregateMixedResults(mixed);
  assert.ok(t.dominant, 'dominant exists for the headline');
  assert.equal(singleUnitCount(t), null, 'but calculation gets null');
  assert.equal(singleUnitResultKey(t), null);
  assert.equal(singleUnitResult(t), null);
});

check('an approximate single result is withheld from calculation', () => {
  const t = aggregateMixedResults([
    { family: 'app', rows: [{ clicks: 400 }], spendMinor: 100_000 },
  ]);
  // singleUnitCount still returns the raw number, but the caller MUST consult
  // the approximation flag — getDashboard withholds it from the diagnosis.
  assert.equal(singleUnitResult(t)!.approximate, true);
  assert.equal(isApproximate(t), true,
    'consumers must be able to detect this without reaching into definitions');
});

console.log('\n── 13. Unknown purpose never yields a guessed result ──');

check('a row full of data with an unknown purpose produces NOTHING', () => {
  // The old failure mode: pick whichever field happens to be non-zero.
  const rich = { messages: 50, purchases: 30, leads: 20, clicks: 500, impressions: 90000 };
  const r = resolveResult(null, rich);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal((r as any).reason, 'NOT_APPLICABLE');
  assert.equal((r as any).count, undefined, 'no count may be produced at all');
});

check('unknown purpose does not fall back to the busiest field', () => {
  const t = aggregateMixedResults([
    { family: undefined, rows: [{ messages: 999, purchases: 5 }], spendMinor: 900_000 },
  ]);
  assert.equal(t.byUnit.length, 0);
  assert.equal(t.dominant, null);
  assert.equal(isApproximate(t), false);
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
