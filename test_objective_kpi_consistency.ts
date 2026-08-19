/**
 * P1-02 — Objective KPI result-column consistency regression suite.
 *
 * Guards the fix to src/lib/objectiveKpis.ts: traffic/app previously
 * resolved their "result" to `clicks` there while
 * src/analytics/objectiveKpiCards.ts's headline card for the same families
 * already (correctly) used `linkClicks` — two authoritative consumers,
 * one campaign-row DTO, disagreeing on which Meta column the result is.
 *
 * metricDictionary.ts's own entries settle which was right:
 *   clicks:      "Every click... including likes, comments... NOT website traffic."
 *   link_clicks: "Clicks that actually opened the destination... this — not
 *                 all-clicks — is what Ads Manager means by traffic."
 * objectiveKpiCards.ts was already correct; objectiveKpis.ts is the one
 * that changed, to converge on the same (dictionary-backed) canonical
 * answer — not a new resolver.
 *
 * Run: npx tsx test_objective_kpi_consistency.ts
 */
import assert from 'node:assert/strict';
import {
  resultCountForObjective,
  getKpiSpecForFamily,
  getObjectiveKpiSpec,
  type WindowTotals,
  type ObjectiveKpiFamily,
} from './src/lib/objectiveKpis';
import { buildObjectiveKpiCards, type KpiSource } from './src/analytics/objectiveKpiCards';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

function totals(overrides: Partial<WindowTotals> = {}): WindowTotals {
  return {
    spendMinor: 10_000, impressions: 5000, reach: 3000,
    clicks: 100, linkClicks: 37, messages: 0, purchases: 0, leads: 0,
    revenueMinor: 0,
    ...overrides,
  };
}

function kpiSource(overrides: Partial<KpiSource> = {}): KpiSource {
  return {
    spendMinor: 10_000, impressions: 5000, reach: 3000,
    clicks: 100, linkClicks: 37, landingPageViews: 20,
    messages: 0, leads: 0, purchases: 0, revenueMinor: 0,
    ctr: 2.0, cpc: 100, cpm: 200, frequency: 1.5, roas: null,
    money: (m: number) => `$${(m / 100).toFixed(2)}`,
    ...overrides,
  };
}

const OBJECTIVE_FOR: Record<ObjectiveKpiFamily, string> = {
  awareness: 'OUTCOME_AWARENESS', traffic: 'OUTCOME_TRAFFIC', engagement: 'OUTCOME_ENGAGEMENT',
  leads: 'OUTCOME_LEADS', sales: 'OUTCOME_SALES', messaging: 'MESSAGES', app: 'OUTCOME_APP_PROMOTION',
};

console.log('\n── The adversarial case named in the remediation brief ──');

check('clicks=100, linkClicks=37 — traffic\'s canonical result is 37 (linkClicks), never 100 (clicks)', () => {
  const t = totals({ clicks: 100, linkClicks: 37 });
  const result = resultCountForObjective('OUTCOME_TRAFFIC', t);
  assert.equal(result, 37);
  assert.notEqual(result, 100);
});

check('app: same adversarial case — canonical result is also linkClicks (37), not clicks (100)', () => {
  const t = totals({ clicks: 100, linkClicks: 37 });
  assert.equal(resultCountForObjective('OUTCOME_APP_PROMOTION', t), 37);
});

console.log('\n── Both authoritative consumers agree, per family ──');

for (const family of ['awareness', 'traffic', 'engagement', 'leads', 'sales', 'messaging', 'app'] as ObjectiveKpiFamily[]) {
  check(`${family}: objectiveKpis.ts's resultCountForObjective and objectiveKpiCards.ts's headline card read the SAME column`, () => {
    const t = totals({ clicks: 100, linkClicks: 37, messages: 55, leads: 12, purchases: 8, impressions: 9000, reach: 6000 });
    const spec = getKpiSpecForFamily(family);
    const canonicalResult = resultCountForObjective(OBJECTIVE_FOR[family], t);

    const src = kpiSource({ clicks: 100, linkClicks: 37, messages: 55, leads: 12, purchases: 8, impressions: 9000, reach: 6000 });
    const cardResult = buildObjectiveKpiCards(family, src);
    assert.ok(cardResult, `${family}: cards must resolve`);

    // Map objectiveKpis.ts's resultKey to objectiveKpiCards.ts's headline
    // (priority 1) card for the SAME concept, and assert their values match.
    const headline = cardResult!.cards.filter((c) => c.priority === 1);
    const RESULT_KEY_TO_CARD_KEY: Record<string, string> = {
      impressions: 'impressions', clicks: 'engagements', linkClicks: 'link_clicks',
      messages: 'conversations', purchases: 'purchases', leads: 'leads',
    };
    const cardKey = RESULT_KEY_TO_CARD_KEY[spec.resultKey];
    const matchingCard = cardResult!.cards.find((c) => c.key === cardKey);
    assert.ok(matchingCard, `${family}: expected a '${cardKey}' card representing resultKey '${spec.resultKey}'`);
    assert.equal(matchingCard!.value, canonicalResult,
      `${family}: card '${cardKey}' (${matchingCard!.value}) must equal resultCountForObjective (${canonicalResult})`);
    void headline;
  });
}

console.log('\n── Per-family Meta field / semantic mapping (inventory, asserted) ──');

check('traffic → linkClicks (site-visit outcome)', () => {
  assert.equal(getKpiSpecForFamily('traffic').resultKey, 'linkClicks');
});
check('app → linkClicks (install-intent proxy)', () => {
  assert.equal(getKpiSpecForFamily('app').resultKey, 'linkClicks');
});
check('engagement → clicks (all-clicks proxy for post interactions — unchanged, dictionary excludes engagement from link_clicks\' applicableObjectives)', () => {
  assert.equal(getKpiSpecForFamily('engagement').resultKey, 'clicks');
});
check('messaging → messages', () => {
  assert.equal(getKpiSpecForFamily('messaging').resultKey, 'messages');
});
check('leads → leads', () => {
  assert.equal(getKpiSpecForFamily('leads').resultKey, 'leads');
});
check('sales/conversions → purchases', () => {
  assert.equal(getKpiSpecForFamily('sales').resultKey, 'purchases');
});
check('awareness → impressions', () => {
  assert.equal(getKpiSpecForFamily('awareness').resultKey, 'impressions');
});

console.log('\n── Edge cases ──');

check('unknown/unsupported objective → falls back to messaging family (existing, documented legacy behavior — unchanged by this fix)', () => {
  const t = totals({ clicks: 100, linkClicks: 37, messages: 42 });
  assert.equal(resultCountForObjective('SOME_FUTURE_OBJECTIVE_NOT_YET_SUPPORTED', t), 42);
});

check('missing linkClicks (legacy caller, e.g. src/engine/BaselineCalculator-based) degrades to clicks — documented, deliberate, unchanged from pre-fix behavior for that caller', () => {
  const legacyTotals = { spendMinor: 0, impressions: 100, reach: 50, clicks: 100, messages: 0, purchases: 0, leads: 0, revenueMinor: 0 };
  assert.equal(resultCountForObjective('OUTCOME_TRAFFIC', legacyTotals), 100);
});

check('missing clicks (present linkClicks, clicks=0) — traffic still correctly reads linkClicks', () => {
  const t = totals({ clicks: 0, linkClicks: 37 });
  assert.equal(resultCountForObjective('OUTCOME_TRAFFIC', t), 37);
});

check('zero-value metric: both clicks and linkClicks are 0 → result is honestly 0, not null-coerced to something else', () => {
  const t = totals({ clicks: 0, linkClicks: 0 });
  assert.equal(resultCountForObjective('OUTCOME_TRAFFIC', t), 0);
});

check('linkClicks explicitly 0 while clicks is nonzero — must NOT fall back to clicks (0 is a real, present value, not "missing")', () => {
  const t = totals({ clicks: 100, linkClicks: 0 });
  assert.equal(resultCountForObjective('OUTCOME_TRAFFIC', t), 0,
    'linkClicks=0 is a genuine answer (nullish-coalescing only falls back on null/undefined, not 0)');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
