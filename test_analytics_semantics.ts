/**
 * Analytics semantic integrity — regression suite.
 *
 * These tests exist because the analytics layer had a SPLIT BRAIN: the
 * campaigns API resolved a click-to-WhatsApp campaign as "messaging" while
 * the diagnosis / AI / brain layers re-derived the family from the RAW Meta
 * objective and got "engagement" — or, at account level, silently defaulted
 * an absent objective to "messaging".
 *
 * Every assertion below maps to a production symptom. Do not relax one
 * without reproducing the symptom it guards.
 *
 * Run: npx tsx test_analytics_semantics.ts
 */
import assert from 'node:assert/strict';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';
import { objectiveKpiFamily, resolveObjectiveFamily } from './src/lib/objectiveKpis';
import { getMetaObjectiveStandard } from './src/knowledge/metaObjectiveStandards';
import {
  getMetric,
  isMetricApplicable,
  metricsForFamily,
  primaryMetricsForFamily,
  METRIC_DICTIONARY,
} from './src/analytics/metricDictionary';
import { mapMetaInsight } from './src/mappers/insightMapper';
import { resolveCampaignPurpose as resolvePurpose } from './src/lib/campaignPurpose';
import { GOLDEN_CASES, GOLDEN_UNKNOWN_OBJECTIVES } from './src/analytics/goldenDataset';
import {
  gateRateBenchmark, gateCostBenchmark, classificationConfidenceFromReason,
  MIN_IMPRESSIONS_FOR_RATE, MIN_RESULTS_FOR_COST,
} from './src/analytics/confidence';
import { benchmarkCtr, benchmarkFrequency } from './src/lib/smartInsights';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\n── 1. Unknown objective must NOT be fabricated as messaging ──');

check('resolveObjectiveFamily(undefined) is null, not "messaging"', () => {
  assert.equal(resolveObjectiveFamily(undefined), null);
  assert.equal(resolveObjectiveFamily(null), null);
  assert.equal(resolveObjectiveFamily(''), null);
});

check('an unrecognized objective string resolves to null, not messaging', () => {
  assert.equal(resolveObjectiveFamily('SOME_FUTURE_META_OBJECTIVE'), null);
});

check('getMetaObjectiveStandard(null) reports family "unknown"', () => {
  // Was: silently "messaging" — so an awareness account got messaging
  // diagnoses and Arabic messaging vocabulary at account level.
  assert.equal(getMetaObjectiveStandard(null).family, 'unknown');
});

check('legacy objectiveKpiFamily still resolves KNOWN objectives identically', () => {
  assert.equal(objectiveKpiFamily('OUTCOME_AWARENESS'), 'awareness');
  assert.equal(objectiveKpiFamily('MESSAGES'), 'messaging');
  assert.equal(objectiveKpiFamily('OUTCOME_SALES'), 'sales');
});

console.log('\n── 2. Message campaigns are never classified as engagement ──');

// The exact production shape: ODAX engagement shell, click-to-WhatsApp ads.
const clickToWhatsApp = {
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['POST_ENGAGEMENT'],
  destinationTypes: ['WHATSAPP'],
  messagesWindow: 41,
  clicksWindow: 260,
};

check('destination WHATSAPP beats an ENGAGEMENT objective + POST_ENGAGEMENT goal', () => {
  const p = resolveCampaignPurpose(clickToWhatsApp);
  assert.equal(p.family, 'messaging');
  assert.equal(p.kpi.resultKey, 'messages');
});

check('the resolved family survives the trip into objective standards', () => {
  // THE SPLIT-BRAIN REGRESSION. Previously the brain laundered family through
  // a synthetic objective string and every other consumer re-parsed the raw
  // objective — landing on "engagement" for the same campaign.
  const p = resolveCampaignPurpose(clickToWhatsApp);
  const std = getMetaObjectiveStandard(p.family);
  assert.equal(std.family, 'messaging',
    'objective standards must accept a resolved family, not re-derive from raw objective');
  assert.equal(std.kpi.resultKey, 'messages');
});

check('optimization goal CONVERSATIONS alone is enough', () => {
  assert.equal(resolveCampaignPurpose({
    objective: 'OUTCOME_ENGAGEMENT',
    optimizationGoals: ['CONVERSATIONS'],
  }).family, 'messaging');
});

check('a genuine boosted post stays engagement (no false messaging flip)', () => {
  const p = resolveCampaignPurpose({
    objective: 'OUTCOME_ENGAGEMENT',
    optimizationGoals: ['POST_ENGAGEMENT'],
    destinationTypes: ['WEBSITE'],
    messagesWindow: 2,      // incidental page messages
    clicksWindow: 900,
  });
  assert.equal(p.family, 'engagement');
});

check('a reach campaign is never flipped to messaging by message volume', () => {
  const p = resolveCampaignPurpose({
    objective: 'OUTCOME_AWARENESS',
    optimizationGoals: ['REACH'],
    messagesWindow: 500,
    clicksWindow: 10,
  });
  assert.equal(p.family, 'awareness');
});

console.log('\n── 3. No invalid metric leakage across objectives ──');

check('cost_per_conversation is NOT applicable to a traffic campaign', () => {
  assert.equal(isMetricApplicable('cost_per_conversation', 'traffic'), false);
  assert.equal(isMetricApplicable('cost_per_conversation', 'messaging'), true);
});

check('roas is NOT applicable to a messaging campaign', () => {
  assert.equal(isMetricApplicable('roas', 'messaging'), false);
  assert.equal(isMetricApplicable('roas', 'sales'), true);
});

check('cost_per_lead is NOT applicable to awareness', () => {
  assert.equal(isMetricApplicable('cost_per_lead', 'awareness'), false);
});

check('no family surfaces a primary metric it cannot compute', () => {
  for (const family of ['awareness', 'traffic', 'engagement', 'leads', 'sales', 'messaging', 'app'] as const) {
    for (const m of primaryMetricsForFamily(family)) {
      assert.ok(m.applicableObjectives.includes(family),
        `${m.metricKey} is primary for ${family} but not applicable to it`);
    }
  }
});

check('every metric in the dictionary declares full lineage', () => {
  for (const m of Object.values(METRIC_DICTIONARY)) {
    assert.ok(m.definition.length > 10, `${m.metricKey}: missing definition`);
    assert.ok(m.formula.length > 0, `${m.metricKey}: missing formula`);
    assert.ok(m.sourceFields.length > 0, `${m.metricKey}: missing sourceFields`);
    assert.ok(m.applicableObjectives.length > 0, `${m.metricKey}: applies to nothing`);
    assert.ok(['exact', 'derived', 'estimated'].includes(m.confidenceLevel),
      `${m.metricKey}: bad confidenceLevel`);
    assert.ok(['sum', 'weighted_average', 'max', 'ratio_of_sums'].includes(m.aggregationRule),
      `${m.metricKey}: bad aggregationRule`);
  }
});

check('ratio metrics are never declared summable', () => {
  // Summing daily CTRs is the classic aggregation bug. The dictionary must
  // make that structurally impossible to declare.
  for (const key of ['ctr', 'cpc', 'cpm', 'frequency', 'roas', 'cost_per_conversation'] as const) {
    assert.notEqual(getMetric(key).aggregationRule, 'sum',
      `${key} must not aggregate by sum`);
  }
});

check('reach aggregates by max, never by sum (it is not additive)', () => {
  assert.equal(getMetric('reach').aggregationRule, 'max');
});

console.log('\n── 4. Link clicks are distinct from all clicks ──');

check('mapper preserves inline_link_clicks separately from clicks', () => {
  // Meta `clicks` counts likes, comments, photo expands — NOT just link
  // clicks. Reporting it as "النقرات" and dividing spend by it overstates
  // traffic and understates CPC versus Ads Manager's default columns.
  const row: any = {
    date_start: '2026-08-01',
    spend: '100',
    impressions: '10000',
    reach: '8000',
    clicks: '500',              // all clicks
    inline_link_clicks: '120',  // actual link clicks
    unique_clicks: '450',
    actions: [],
  };
  const n = mapMetaInsight(row, { currencyMinorFactor: 1 });
  assert.equal(n.clicks, 500);
  assert.equal(n.linkClicks, 120, 'inline_link_clicks must be preserved, not discarded');
});

check('link clicks default to 0 when Meta omits the field', () => {
  const row: any = { date_start: '2026-08-01', spend: '10', impressions: '100', clicks: '5', actions: [] };
  assert.equal(mapMetaInsight(row, { currencyMinorFactor: 1 }).linkClicks, 0);
});

check('landing page views come from the REAL Meta action, never from clicks', () => {
  // P3: the traffic funnel's diagnostic value lives in the GAP between a
  // click and an arrival. Estimating LPV from clicks would close that gap by
  // definition and destroy the signal.
  const row: any = {
    date_start: '2026-08-01', spend: '100', impressions: '10000', reach: '8000',
    clicks: '500', inline_link_clicks: '120', unique_clicks: '450',
    actions: [
      { action_type: 'landing_page_view', value: '95' },
      { action_type: 'link_click', value: '120' },   // must NOT leak into LPV
    ],
  };
  const n = mapMetaInsight(row, { currencyMinorFactor: 1 });
  assert.equal(n.landingPageViews, 95);
  assert.ok(n.landingPageViews !== n.linkClicks, 'LPV must be independent of link clicks');
});

check('landing page views default to 0 when the action is absent', () => {
  const row: any = { date_start: '2026-08-01', spend: '10', impressions: '100', clicks: '5', actions: [] };
  assert.equal(mapMetaInsight(row, { currencyMinorFactor: 1 }).landingPageViews, 0);
});

console.log('\n── 5. Messaging counts stay parity-correct with Ads Manager ──');

check('conversation-started wins over messaging-connection (never summed)', () => {
  const row: any = {
    date_start: '2026-08-01', spend: '10', impressions: '100', clicks: '5',
    actions: [
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '87' },
      { action_type: 'onsite_conversion.total_messaging_connection', value: '76' },
      { action_type: 'onsite_conversion.messaging_first_reply', value: '40' },
    ],
  };
  // Production bug: summing produced 163 against Ads Manager's 87.
  assert.equal(mapMetaInsight(row, { currencyMinorFactor: 1 }).messages, 87);
});

console.log('\n── 6. GOLDEN DATASET — no campaign may silently change meaning ──');

for (const g of GOLDEN_CASES) {
  check(`${g.id} ${g.description.slice(0, 62)}`, () => {
    const p = resolvePurpose(g.input);
    assert.equal(p.family, g.expectedFamily,
      `${g.id}: expected family ${g.expectedFamily}, got ${p.family} (reason: ${p.reason})`);
    assert.ok(p.reason.startsWith(g.expectedReasonPrefix),
      `${g.id}: expected the "${g.expectedReasonPrefix}" rung to decide this, but reason was "${p.reason}" — right answer via the wrong evidence is still a regression`);
  });
}

check('every golden case has a unique, stable id', () => {
  const ids = GOLDEN_CASES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const obj of GOLDEN_UNKNOWN_OBJECTIVES) {
  check(`unknown objective "${obj || '(empty)'}" never resolves to a family`, () => {
    assert.equal(resolveObjectiveFamily(obj), null);
  });
}

console.log('\n── 7. Benchmark confidence is sample-gated (P1) ──');

check('a rate benchmark below the hard floor is UNAVAILABLE', () => {
  const g = gateRateBenchmark({ size: 40 });
  assert.equal(g.status, 'UNAVAILABLE');
  assert.equal(g.reason, 'SAMPLE_TOO_SMALL');
});

check('the grey band returns LOW_CONFIDENCE, not a verdict', () => {
  assert.equal(gateRateBenchmark({ size: MIN_IMPRESSIONS_FOR_RATE + 1, days: 30 }).status, 'LOW_CONFIDENCE');
});

check('a healthy sample passes', () => {
  assert.equal(gateRateBenchmark({ size: 50_000, days: 30 }).status, 'OK');
});

check('a short window is LOW_CONFIDENCE even with many impressions', () => {
  assert.equal(gateRateBenchmark({ size: 100_000, days: 3 }).status, 'LOW_CONFIDENCE');
});

check('cost benchmarks gate on result count, not impressions', () => {
  assert.equal(gateCostBenchmark({ size: MIN_RESULTS_FOR_COST - 1 }).status, 'UNAVAILABLE');
  assert.equal(gateCostBenchmark({ size: 100 }).status, 'OK');
});

check('40 impressions yields NO CTR verdict (the production hazard)', () => {
  // Previously: one lucky click on 40 impressions = "2.5% CTR, above benchmark,
  // high confidence." At Iraqi SMB spend that is noise wearing a verdict.
  assert.equal(benchmarkCtr(2.5, null, false, { size: 40, days: 2 }), null);
});

check('a mid-size sample shows the value but withholds the judgement', () => {
  const b = benchmarkCtr(2.5, null, true, { size: 2_000, days: 30 });
  assert.ok(b, 'should still return something to render');
  assert.equal(b!.position, null, 'position must be null — no verdict');
  assert.equal(b!.status, 'LOW_CONFIDENCE');
  assert.equal(b!.sampleSize, 2_000, 'n must always be disclosed');
});

check('frequency benchmarks are gated on the same sample', () => {
  assert.equal(benchmarkFrequency(4.5, false, { size: 100 }), null);
  assert.equal(benchmarkFrequency(4.5, false, { size: 50_000, days: 30 })?.position, 'low');
});

console.log('\n── 8. Classification confidence is separate from data/benchmark ──');

check('destination-decided classification is CONFIRMED', () => {
  const p = resolvePurpose(clickToWhatsApp);
  assert.equal(classificationConfidenceFromReason(p.reason), 'CONFIRMED');
});

check('objective-decided classification is INFERRED, not CONFIRMED', () => {
  // When objective and optimization goal agree the resolver records only the
  // objective rung, so confidence reads INFERRED even though two signals
  // corroborate. Under-claiming is the safe direction — see the corroboration
  // note in goldenDataset.ts, flagged for the P2 review.
  const p = resolvePurpose({ objective: 'OUTCOME_TRAFFIC', optimizationGoals: ['LINK_CLICKS'] });
  assert.equal(p.reason, 'objective:traffic');
  assert.equal(classificationConfidenceFromReason(p.reason), 'INFERRED');
});

check('an explicit optimization goal that DECIDES is CONFIRMED', () => {
  const p = resolvePurpose({ objective: 'OUTCOME_ENGAGEMENT', optimizationGoals: ['CONVERSATIONS'] });
  assert.equal(classificationConfidenceFromReason(p.reason), 'CONFIRMED');
});

check('evidence-rung classification is flagged as EVIDENCE, not CONFIRMED', () => {
  const p = resolvePurpose({
    objective: 'OUTCOME_ENGAGEMENT', optimizationGoals: ['POST_ENGAGEMENT'],
    messagesWindow: 30, clicksWindow: 100,
  });
  assert.equal(p.family, 'messaging');
  assert.equal(classificationConfidenceFromReason(p.reason), 'EVIDENCE',
    'a classification inferred from results must not claim the same confidence as one read from destination_type');
});

check('an unresolvable classification is UNKNOWN', () => {
  assert.equal(classificationConfidenceFromReason(null), 'UNKNOWN');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
