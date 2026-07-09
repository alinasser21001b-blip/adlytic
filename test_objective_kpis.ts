/**
 * Objective → KPI family unit tests.
 * Run: npx tsx test_objective_kpis.ts
 */
import assert from 'node:assert/strict';
import {
  efficiencyForObjective,
  getObjectiveKpiSpec,
  objectiveKpiFamily,
  resultCountForObjective,
  type WindowTotals,
} from './src/lib/objectiveKpis';

function totals(partial: Partial<WindowTotals> = {}): WindowTotals {
  return {
    spendMinor: 134, // $1.34 at factor 100
    impressions: 12_000,
    reach: 4_500,
    clicks: 80,
    messages: 0,
    purchases: 0,
    leads: 0,
    revenueMinor: 0,
    ...partial,
  };
}

// ── Family mapping ──────────────────────────────────────────────────────────
assert.equal(objectiveKpiFamily('OUTCOME_AWARENESS'), 'awareness');
assert.equal(objectiveKpiFamily('BRAND_AWARENESS'), 'awareness');
assert.equal(objectiveKpiFamily('REACH'), 'awareness');
assert.equal(objectiveKpiFamily('OUTCOME_TRAFFIC'), 'traffic');
assert.equal(objectiveKpiFamily('LINK_CLICKS'), 'traffic');
assert.equal(objectiveKpiFamily('OUTCOME_SALES'), 'sales');
assert.equal(objectiveKpiFamily('CONVERSIONS'), 'sales');
assert.equal(objectiveKpiFamily('OUTCOME_LEADS'), 'leads');
assert.equal(objectiveKpiFamily('MESSAGES'), 'messaging');
assert.equal(objectiveKpiFamily('OUTCOME_ENGAGEMENT'), 'engagement');
assert.equal(objectiveKpiFamily(null), 'messaging'); // Phase-1 fallback

// ── Awareness must NOT use messages KPIs ────────────────────────────────────
const awareness = getObjectiveKpiSpec('OUTCOME_AWARENESS');
assert.equal(awareness.resultKey, 'impressions');
assert.equal(awareness.efficiencyKey, 'cpm');
assert.equal(awareness.resultLabelAr, 'مرات الظهور');
assert.ok(!awareness.signalKeys.includes('costPerMessage'));

const t = totals();
assert.equal(resultCountForObjective('OUTCOME_AWARENESS', t), 12_000);
const cpm = efficiencyForObjective('OUTCOME_AWARENESS', t, 100);
assert.ok(cpm != null);
// spend $1.34 / 12k impressions * 1000 = ~0.1117
assert.ok(Math.abs(cpm! - (1.34 * 1000) / 12_000) < 1e-9);

// Messaging still uses messages
const messaging = getObjectiveKpiSpec('MESSAGES');
assert.equal(messaging.resultKey, 'messages');
assert.equal(messaging.efficiencyKey, 'costPerMessage');

const msgTotals = totals({ messages: 10, spendMinor: 500 });
assert.equal(resultCountForObjective('MESSAGES', msgTotals), 10);
assert.equal(efficiencyForObjective('MESSAGES', msgTotals, 100), 0.5);

// Sales uses purchases
assert.equal(getObjectiveKpiSpec('OUTCOME_SALES').resultKey, 'purchases');
assert.equal(resultCountForObjective('OUTCOME_SALES', totals({ purchases: 3 })), 3);

console.log('test_objective_kpis: ok');
