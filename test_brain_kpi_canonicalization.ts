/**
 * PHASE 2.5 — Close the last objective-KPI canonicalization gap.
 *
 * P1-02 fixed src/lib/objectiveKpis.ts so traffic/app read linkClicks
 * (Meta inline_link_clicks) instead of all-clicks, matching
 * objectiveKpiCards.ts and metricDictionary.ts. One caller was deliberately
 * left on the documented clicks-fallback: src/engines/rules/campaignSignals.ts
 * → CampaignRawData (src/engine/BaselineCalculator.ts) never carried
 * linkClicks, so resultCountForObjective()'s `totals.linkClicks ?? clicks`
 * fallback always took the clicks branch for Brain-grounded traffic/app
 * campaigns.
 *
 * This suite guards the fix:
 *   - CampaignRawData gained an OPTIONAL `linkClicks?: number` field
 *     (src/engine/BaselineCalculator.ts) — purely additive, no existing
 *     producer/consumer signature changed.
 *   - The one producer, src/workers/runBrainOrchestrator.ts's
 *     loadRawDataForCampaigns(), now selects DailyStat.linkClicks and
 *     populates it.
 *   - src/engines/rules/campaignSignals.ts's signalsFromCampaignRaw() now
 *     passes raw.linkClicks through to resultCountForObjective() — the SAME
 *     canonical resolver objectiveKpis.ts and objectiveKpiCards.ts already
 *     agree on. No new resolver. No duplicated objective-mapping logic.
 *
 * Run: npx tsx test_brain_kpi_canonicalization.ts
 */
import assert from 'node:assert/strict';
import { signalsFromCampaignRaw } from './src/engines/rules/campaignSignals';
import type { CampaignRawData, AccountBaseline } from './src/engine/BaselineCalculator';
import { resultCountForObjective, type WindowTotals } from './src/lib/objectiveKpis';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const baseline: AccountBaseline = {
  avgCostPerMessage: 5.0,
  avgCTR: 2.0,
  avgFrequency: 2.0,
  avgCPM: 10.0,
  avgCPC: 0.5,
  metadata: {
    campaignCount: 12,
    totalSpend: 1800,
    totalMessages: 360,
    totalImpressions: 180000,
    totalClicks: 3600,
  },
  confidence: { score: 90, level: 'high' },
};

function campaign(overrides: Partial<CampaignRawData> = {}): CampaignRawData {
  return {
    campaignId: 'c1',
    campaignName: 'حملة اختبار',
    objective: 'OUTCOME_TRAFFIC',
    spend: 120,
    impressions: 9000,
    clicks: 100,
    ctr: 1.1,
    frequency: 1.8,
    messages: 0,
    cpm: 13.3,
    cpc: 1.2,
    ...overrides,
  };
}

function totals(overrides: Partial<WindowTotals> = {}): WindowTotals {
  return {
    spendMinor: 12_000, impressions: 9000, reach: 6000,
    clicks: 100, linkClicks: 37, messages: 0, purchases: 0, leads: 0,
    revenueMinor: 0,
    ...overrides,
  };
}

console.log('\n── TRAFFIC_ADVERSARIAL_TEST ──');

check('traffic: clicks=100, linkClicks=37 → Brain currentResults is 37, never 100', () => {
  const raw = campaign({ objective: 'OUTCOME_TRAFFIC', clicks: 100, linkClicks: 37 });
  const signals = signalsFromCampaignRaw(raw, baseline);
  assert.equal(signals.currentResults, 37);
  assert.notEqual(signals.currentResults, 100);
});

console.log('\n── APP_ADVERSARIAL_TEST ──');

check('app: clicks=100, linkClicks=37 → Brain currentResults is also 37, not 100', () => {
  const raw = campaign({ objective: 'OUTCOME_APP_PROMOTION', clicks: 100, linkClicks: 37 });
  const signals = signalsFromCampaignRaw(raw, baseline);
  assert.equal(signals.currentResults, 37);
});

console.log('\n── ZERO_VS_MISSING_TEST ──');

check('linkClicks explicitly 0 (clicks=100) → result is honestly 0, must NOT fall back to clicks', () => {
  const raw = campaign({ objective: 'OUTCOME_TRAFFIC', clicks: 100, linkClicks: 0 });
  const signals = signalsFromCampaignRaw(raw, baseline);
  assert.equal(signals.currentResults, 0,
    'linkClicks=0 is a genuine present value (nullish-coalescing only falls back on null/undefined)');
});

check('linkClicks entirely omitted (legacy CampaignRawData literal, e.g. an untouched test fixture) → degrades to clicks', () => {
  const raw = campaign({ objective: 'OUTCOME_TRAFFIC', clicks: 100 });
  delete (raw as any).linkClicks;
  assert.equal('linkClicks' in raw, false, 'precondition: key truly absent, not merely undefined');
  const signals = signalsFromCampaignRaw(raw, baseline);
  assert.equal(signals.currentResults, 100, 'documented, deliberate fallback — unchanged from pre-Phase-2.5 behavior');
});

check('app family also degrades to clicks when linkClicks is omitted', () => {
  const raw = campaign({ objective: 'OUTCOME_APP_PROMOTION', clicks: 64 });
  delete (raw as any).linkClicks;
  const signals = signalsFromCampaignRaw(raw, baseline);
  assert.equal(signals.currentResults, 64);
});

console.log('\n── CROSS_PIPELINE_CONSISTENCY_TEST ──');
console.log('   (campaignSignals.ts Brain path vs objectiveKpis.ts merchant-facing path — same inputs, same answer)');

for (const objective of ['OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION']) {
  check(`${objective}: signalsFromCampaignRaw() and resultCountForObjective() agree given the same clicks/linkClicks`, () => {
    const raw = campaign({ objective, clicks: 100, linkClicks: 37 });
    const brainResult = signalsFromCampaignRaw(raw, baseline).currentResults;
    const merchantResult = resultCountForObjective(objective, totals({ clicks: 100, linkClicks: 37 }));
    assert.equal(brainResult, merchantResult);
    assert.equal(brainResult, 37);
  });
}

for (const objective of ['MESSAGES', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT']) {
  check(`${objective}: unaffected families still agree across both pipelines (regression guard)`, () => {
    const raw = campaign({
      objective, clicks: 100, linkClicks: 37, messages: 55, purchases: 8, leads: 12,
      impressions: 9000, reach: 6000,
    });
    const brainResult = signalsFromCampaignRaw(raw, baseline).currentResults;
    const merchantResult = resultCountForObjective(objective, totals({
      clicks: 100, linkClicks: 37, messages: 55, purchases: 8, leads: 12,
      impressions: 9000, reach: 6000,
    }));
    assert.equal(brainResult, merchantResult);
  });
}

console.log('\n── BRAIN_KPI_BEFORE / BRAIN_KPI_AFTER (worked reproduction of the closed gap) ──');

check('reproduction: pre-Phase-2.5 the Brain would have reported 100 results for this traffic campaign; it now correctly reports 37', () => {
  const raw = campaign({ objective: 'OUTCOME_TRAFFIC', clicks: 100, linkClicks: 37 });
  const brainKpiAfter = signalsFromCampaignRaw(raw, baseline).currentResults;
  // BRAIN_KPI_BEFORE: CampaignRawData had no linkClicks field at all, so the
  // resolver's totals.linkClicks was always undefined, always falling back to
  // totals.clicks — reproduced here directly to document the value that
  // changed, not to re-test already-covered fallback logic.
  const brainKpiBefore = raw.clicks;
  assert.equal(brainKpiBefore, 100);
  assert.equal(brainKpiAfter, 37);
  assert.notEqual(brainKpiBefore, brainKpiAfter);
});

console.log('\n── Side effect of wiring linkClicks into the producer: resolveCampaignPurpose() evidence rung ──');
console.log('   (runBrainOrchestrator.ts\'s Prisma select previously omitted DailyStat.linkClicks, so the');
console.log('    already-written `linkClicksWindow: Number((r as any).linkClicks ?? 0)` was always fed 0.');
console.log('    Adding the select field activates dormant, already-tested campaignPurpose.ts logic —');
console.log('    verified here with the exact function, not re-implemented.)');

check('BEFORE (linkClicksWindow always 0, the pre-fix bug): engagement campaign with low messages/all-clicks ratio stays "engagement"', () => {
  const before = resolveCampaignPurpose({
    objective: 'OUTCOME_ENGAGEMENT',
    optimizationGoals: ['POST_ENGAGEMENT'],
    messagesWindow: 10,
    clicksWindow: 100,
    linkClicksWindow: 0,
  });
  assert.equal(before.family, 'engagement');
});

check('AFTER (linkClicksWindow now real): the SAME messages count against a real (smaller) linkClicks denominator meaningfully flips to "messaging"', () => {
  const after = resolveCampaignPurpose({
    objective: 'OUTCOME_ENGAGEMENT',
    optimizationGoals: ['POST_ENGAGEMENT'],
    messagesWindow: 10,
    clicksWindow: 100,
    linkClicksWindow: 30,
  });
  assert.equal(after.family, 'messaging');
  assert.ok(after.reason.startsWith('evidence:'));
});

console.log('\n── CampaignRawData additive-typing regression guard ──');

check('CampaignRawData literal with NO linkClicks key at all still typechecks and runs (pre-existing fixtures like test_rule_grounding.ts stay valid)', () => {
  const raw: CampaignRawData = {
    campaignId: 'legacy_01',
    campaignName: 'حملة قديمة',
    spend: 80,
    impressions: 10000,
    clicks: 40,
    ctr: 0.4,
    frequency: 2.1,
    messages: 8,
    cpm: 8,
    cpc: 2,
  };
  const signals = signalsFromCampaignRaw(raw, baseline);
  assert.equal(signals.currentResults, 8, 'messaging objective unaffected — messages counter, not clicks/linkClicks');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
