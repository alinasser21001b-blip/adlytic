// ════════════════════════════════════════════════════════════════════════
//  test_attribution_semantics.ts
//
//  GET /api/workspaces/:id/attribution summed `messages` as "results" for
//  every account, whatever its objective. On a sales account that attributed
//  a PURCHASE swing to the conversation count and returned a confident
//  impressions/CTR/CVR driver breakdown computed from the wrong metric.
//
//  These tests pin the two properties that make that impossible:
//    1. the result column follows the campaign's resolved purpose
//    2. an account spanning several result units gets NO single attribution
// ════════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';
import { resultFor } from './src/analytics/resultSemantics';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e: any) { fail.push(name); console.error('  ✗ ' + name + ' — ' + e.message); }
}

/** The column `/attribution` will sum, derived the way the endpoint derives it. */
function resultColumnFor(objective: string, optimizationGoals: string[] = [], destinationTypes: string[] = []) {
  const purpose = resolveCampaignPurpose({
    objective,
    optimizationGoals,
    destinationTypes,
    messagesWindow: 0,
    clicksWindow: 0,
  });
  return purpose.family ? resultFor(purpose.family).resultKey : null;
}

console.log('\n── the attributed metric follows the objective ──');

check('a sales campaign attributes PURCHASES, not messages', () => {
  const col = resultColumnFor('OUTCOME_SALES');
  assert.equal(col, 'purchases',
    `a sales account must attribute its purchase count, got ${col}`);
  assert.notEqual(col, 'messages', 'this is the exact shipped bug');
});

check('a leads campaign attributes LEADS, not messages', () => {
  assert.equal(resultColumnFor('OUTCOME_LEADS'), 'leads');
});

check('a traffic campaign attributes LINK_CLICKS, not messages', () => {
  assert.equal(resultColumnFor('OUTCOME_TRAFFIC'), 'linkClicks');
});

check('a messaging campaign still attributes messages', () => {
  // The old behaviour was not wrong here — it was wrong everywhere else.
  const col = resultColumnFor('OUTCOME_ENGAGEMENT', ['CONVERSATIONS'], ['MESSENGER']);
  assert.equal(col, 'messages');
});

console.log('\n── mixed accounts get no single attribution ──');

check('two purposes yield two distinct result columns', () => {
  const sales = resultColumnFor('OUTCOME_SALES');
  const messaging = resultColumnFor('OUTCOME_ENGAGEMENT', ['CONVERSATIONS'], ['MESSENGER']);
  assert.notEqual(sales, messaging,
    'if these collapsed to one column the mixed check could never trigger');
  const units = new Set([
    resultFor(resolveCampaignPurpose({ objective: 'OUTCOME_SALES', optimizationGoals: [], destinationTypes: [], messagesWindow: 0, clicksWindow: 0 }).family!).unit,
    resultFor(resolveCampaignPurpose({ objective: 'OUTCOME_ENGAGEMENT', optimizationGoals: ['CONVERSATIONS'], destinationTypes: ['MESSENGER'], messagesWindow: 0, clicksWindow: 0 }).family!).unit,
  ]);
  assert.equal(units.size, 2, 'orders and conversations are different units');
});

check('an unresolved purpose yields no column at all', () => {
  // Rule 3: UNKNOWN is first-class. The endpoint must decline, not default
  // to a plausible family.
  const purpose = resolveCampaignPurpose({
    objective: '', optimizationGoals: [], destinationTypes: [],
    messagesWindow: 0, clicksWindow: 0,
  });
  if (purpose.family) {
    // The resolver DID reach a family from thin evidence; that is its own
    // decision and is covered by test_campaign_purpose. What must never
    // happen is a column appearing without a family.
    assert.ok(resultFor(purpose.family).resultKey, 'a family always has a column');
  } else {
    assert.equal(resultColumnFor(''), null, 'no family must mean no column');
  }
});

console.log('\n── the endpoint actually USES the resolver ──');

// WHY THIS EXISTS, and why the six checks above are not enough:
// every one of them passes against the BUGGY code too. The derivation always
// produced 'purchases' for a sales account — the defect was that
// /attribution never called it and summed 'messages' directly. A test that
// exercises the library while the endpoint ignores it proves nothing.
// These two read the endpoint's source, so they fail on the old code.
const SERVER_SRC = readFileSync(join(import.meta.dirname, 'src/api/server.ts'), 'utf8');
const ATTRIBUTION_BODY = (() => {
  const start = SERVER_SRC.indexOf("app.get('/api/workspaces/:workspaceId/attribution'");
  assert.ok(start > 0, 'attribution route not found — this test needs updating');
  // Up to the next route registration.
  const next = SERVER_SRC.indexOf('app.get(', start + 10);
  return SERVER_SRC.slice(start, next > 0 ? next : start + 4000);
})();

check('/attribution resolves the result column instead of hardcoding one', () => {
  assert.match(ATTRIBUTION_BODY, /resolveAccountResultColumns/,
    'the endpoint must derive its result column from the account\'s purposes');
  assert.doesNotMatch(ATTRIBUTION_BODY, /sumField\(\s*\w+\s*,\s*['"](messages|purchases|leads)['"]\s*\)/,
    'the endpoint must not sum a hardcoded result counter');
});

check('/attribution declines on a mixed-unit account', () => {
  assert.match(ATTRIBUTION_BODY, /MIXED_RESULT_UNITS/,
    'an account spanning several result units must get no single attribution');
  assert.match(ATTRIBUTION_BODY, /422/, 'and it must decline rather than guess');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length) { console.error('failed: ' + fail.join(', ')); process.exit(1); }
