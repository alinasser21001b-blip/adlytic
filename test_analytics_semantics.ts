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

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
