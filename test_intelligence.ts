/**
 * P5 — intelligence hierarchy, anomaly detection, fatigue reconciliation,
 * objective-aware health, and recommendation guarding.
 *
 * The point of P5 is that five engines can no longer contradict each other.
 * Every assertion here is a contradiction that used to be possible.
 *
 * Run: npx tsx test_intelligence.ts
 */
import assert from 'node:assert/strict';
import {
  deriveFatigueSignal, reconcileIntelligence, permitAction,
  FREQUENCY_SATURATED, type ReconcileInput, type AnomalyVerdict,
} from './src/analytics/intelligence/hierarchy';
import { detectAnomaly } from './src/analytics/intelligence/anomaly';
import { scoreObjectiveHealth } from './src/analytics/intelligence/objectiveHealth';
import { buildRecommendation } from './src/analytics/intelligence/recommend';
import { diagnoseFunnel } from './src/analytics/funnel/diagnose';
import type { FunnelWindowTotals } from './src/analytics/funnel/compute';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const T = (t: Partial<FunnelWindowTotals>): FunnelWindowTotals => ({
  impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0,
  messages: 0, leads: 0, purchases: 0, clicks: 0, ...t,
});
const FLAT = {
  spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
  costPerResultCurrentMinor: null, costPerResultPriorMinor: null,
};
const NO_ANOMALY: AnomalyVerdict = { significant: false, confidence: 'HIGH', kind: 'NONE', evidence: [] };
const SIGNIFICANT: AnomalyVerdict = { significant: true, confidence: 'HIGH', kind: 'POST_CLICK_DEGRADATION', evidence: ['drop is unusual'] };

const base = (over: Partial<ReconcileInput> = {}): ReconcileInput => ({
  dataConfidence: 'COMPLETE', classificationConfidence: 'CONFIRMED',
  funnel: null, anomaly: NO_ANOMALY, fatigue: null, ...over,
});

// The signature post-click scenario, reused throughout.
const postClickFunnel = diagnoseFunnel(
  'messaging',
  T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 }),
  T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
  FLAT,
);
const healthyFunnel = diagnoseFunnel(
  'messaging',
  T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
  T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
  FLAT,
);

console.log('\n── P5.1 Hierarchy: upstream failures stop everything below ──');

check('invalid DATA short-circuits — no diagnosis is attempted', () => {
  const r = reconcileIntelligence(base({ dataConfidence: 'MISSING', funnel: postClickFunnel }));
  assert.equal(r.decidedBy, 'DATA_VALIDITY');
  assert.equal(r.confidence, 'INSUFFICIENT_DATA');
  assert.equal(r.alert, false);
  assert.deepEqual(r.evidence, [], 'no claims may be made on unsynced data');
});

check('unknown SEMANTICS short-circuits — no objective-specific claims', () => {
  const r = reconcileIntelligence(base({ classificationConfidence: 'UNKNOWN', funnel: postClickFunnel }));
  assert.equal(r.decidedBy, 'SEMANTIC_VALIDITY');
  assert.equal(r.confidence, 'INSUFFICIENT_DATA');
});

check('the trace records every layer that contributed', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: SIGNIFICANT }));
  const layers = r.trace.map((t) => t.layer);
  assert.ok(layers.includes('DATA_VALIDITY'));
  assert.ok(layers.includes('FUNNEL_DIAGNOSIS'));
  assert.ok(layers.includes('ANOMALY_DETECTION'));
  assert.ok(layers.includes('RECOMMENDATION'));
});

console.log('\n── P5.3 Funnel × anomaly reconciliation ──');

check('POST_CLICK + SIGNIFICANT → alert', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: SIGNIFICANT }));
  assert.equal(r.problemClass, 'POST_CLICK');
  assert.equal(r.alert, true);
});

check('POST_CLICK + NOT_SIGNIFICANT → break stands, but NO alert', () => {
  // The ratio really did move; it is not unusual for this account. Alerting
  // on every downward ratio teaches users to ignore alerts.
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: NO_ANOMALY }));
  assert.equal(r.problemClass, 'POST_CLICK', 'the funnel is still right about WHERE');
  assert.equal(r.alert, false, 'but the merchant is not interrupted');
});

check('a non-anomalous break caps confidence below HIGH', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: NO_ANOMALY }));
  assert.notEqual(r.confidence, 'HIGH');
});

console.log('\n── P5.4 Fatigue: ONE signal, three former voices ──');

check('fatigue requires a CORROBORATED pattern, not one threshold', () => {
  // Frequency alone crossing 4.0 with everything else healthy is a state to
  // watch, not a critical finding.
  const lone = deriveFatigueSignal({
    frequency: 4.5, priorFrequency: 4.4, ctr: 2.0, priorCtr: 2.0,
    cpc: 100, priorCpc: 100, impressions: 50_000,
  });
  assert.equal(lone.severity, 'WATCH');
  assert.notEqual(lone.severity, 'CRITICAL');

  const corroborated = deriveFatigueSignal({
    frequency: 5.4, priorFrequency: 3.7, ctr: 1.3, priorCtr: 2.0,
    cpc: 140, priorCpc: 100, impressions: 50_000,
  });
  assert.equal(corroborated.corroboratingSignals, 3);
  assert.equal(corroborated.severity, 'CRITICAL');
  assert.equal(corroborated.confidence, 'HIGH');
});

check('a healthy account produces NO fatigue evidence at all', () => {
  const f = deriveFatigueSignal({
    frequency: 1.8, priorFrequency: 1.7, ctr: 2.1, priorCtr: 2.0,
    cpc: 95, priorCpc: 100, impressions: 50_000,
  });
  assert.equal(f.severity, 'NONE');
  assert.deepEqual(f.evidence, []);
});

check('fatigue is INSUFFICIENT_DATA below the impression floor', () => {
  const f = deriveFatigueSignal({
    frequency: 6.0, priorFrequency: 2.0, ctr: 0.5, priorCtr: 2.0,
    cpc: 300, priorCpc: 100, impressions: 200,
  });
  assert.equal(f.confidence, 'INSUFFICIENT_DATA');
  assert.equal(f.severity, 'NONE');
  assert.deepEqual(f.evidence, [], 'a dramatic-looking move on 200 impressions claims nothing');
});

check('HIGH_FREQUENCY is SUPPRESSED when the funnel already explains delivery', () => {
  // Formerly: detector says "high frequency", funnel says "delivery problem",
  // intelligence system says "audience fatigue" — three names, one thing.
  const deliveryFunnel = diagnoseFunnel(
    'messaging',
    T({ impressions: 50_000, reach: 10_000, linkClicks: 450, messages: 45 }),
    T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    FLAT,
  );
  const r = reconcileIntelligence(base({ funnel: deliveryFunnel, anomaly: { ...SIGNIFICANT, kind: 'CREATIVE_FATIGUE' } }));
  assert.equal(r.problemClass, 'DELIVERY');
  assert.ok(r.suppressedIssueCodes.includes('HIGH_FREQUENCY'),
    'the duplicate frequency finding must not also be raised');
});

check('a POST_CLICK diagnosis suppresses upstream issue codes entirely', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: SIGNIFICANT }));
  for (const code of ['LOW_CTR', 'HIGH_FREQUENCY', 'AUDIENCE_FATIGUE']) {
    assert.ok(r.suppressedIssueCodes.includes(code), `${code} must be suppressed`);
  }
});

console.log('\n── P5.6 Recommendations may not contradict the diagnosis ──');

check('"refresh creative" is FORBIDDEN under a post-click diagnosis', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: SIGNIFICANT }));
  assert.ok(r.forbiddenActions.includes('REFRESH_CREATIVE'));
  const p = permitAction('REFRESH_CREATIVE', r);
  assert.equal(p.allowed, false);
  assert.ok(p.reason!.includes('POST_CLICK'));
});

check('the post-click recommendation targets the WhatsApp workflow, not the ad', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: SIGNIFICANT }));
  const rec = buildRecommendation(r, 'messaging')!;
  assert.equal(rec.actionCode, 'FIX_MESSAGING_DESTINATION');
  assert.ok(rec.action.includes('واتساب'), rec.action);
  assert.equal(rec.severity, 'CRITICAL');
  assert.ok(rec.evidence.length > 0, 'evidence must be carried, not invented');
});

check('the SAME post-click funnel for TRAFFIC targets the landing page', () => {
  const trafficFunnel = diagnoseFunnel(
    'traffic',
    T({ impressions: 40_000, reach: 16_000, linkClicks: 800, landingPageViews: 240 }),
    T({ impressions: 40_000, reach: 16_000, linkClicks: 800, landingPageViews: 640 }),
    FLAT,
  );
  const r = reconcileIntelligence(base({ funnel: trafficFunnel, anomaly: SIGNIFICANT }));
  const rec = buildRecommendation(r, 'traffic')!;
  assert.equal(rec.actionCode, 'FIX_LANDING_PAGE');
});

check('a CLICK break DOES permit refreshing the creative', () => {
  const clickFunnel = diagnoseFunnel(
    'messaging',
    T({ impressions: 50_000, reach: 20_000, linkClicks: 450, messages: 45 }),
    T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    FLAT,
  );
  const r = reconcileIntelligence(base({ funnel: clickFunnel, anomaly: { ...SIGNIFICANT, kind: 'CREATIVE_FATIGUE' } }));
  assert.equal(r.problemClass, 'CLICK');
  assert.equal(permitAction('REFRESH_CREATIVE', r).allowed, true);
  assert.equal(buildRecommendation(r, 'messaging')!.actionCode, 'REFRESH_CREATIVE');
});

check('no recommendation is produced when nothing broke', () => {
  const r = reconcileIntelligence(base({ funnel: healthyFunnel, anomaly: NO_ANOMALY }));
  assert.equal(buildRecommendation(r, 'messaging'), null, 'silence is a valid output');
});

check('no recommendation is produced for a non-anomalous break', () => {
  const r = reconcileIntelligence(base({ funnel: postClickFunnel, anomaly: NO_ANOMALY }));
  assert.equal(buildRecommendation(r, 'messaging'), null);
});

console.log('\n── P5.5 Health score is objective-aware ──');

const HEALTHY_RECONCILED = reconcileIntelligence(base({ funnel: healthyFunnel, anomaly: NO_ANOMALY }));

check('a messaging campaign is NOT penalised for inapplicable ROAS', () => {
  const h = scoreObjectiveHealth({
    family: 'messaging',
    primaryResultCurrent: 90, primaryResultPrior: 88,
    ctr: 2.0, ctrPrior: 1.9, cpm: 5000, cpmPrior: 5000,
    costPerResultCurrent: 11_000, costPerResultPrior: 11_200,
    impressions: 50_000, reconciled: HEALTHY_RECONCILED, fatigue: null,
    resultApproximate: false,
  });
  assert.ok(h.score !== null && h.score >= 60, `expected a healthy score, got ${h.score}`);
  // ROAS never appears as a facet for messaging at all.
  assert.ok(!h.facets.some((f) => f.key === 'roas'));
});

check('an awareness campaign excludes CTR from its score, not zeroes it', () => {
  const h = scoreObjectiveHealth({
    family: 'awareness',
    primaryResultCurrent: 500_000, primaryResultPrior: 480_000,
    ctr: 0.3, ctrPrior: 0.9,       // would tank a CTR-weighted score
    cpm: 4000, cpmPrior: 4100,
    costPerResultCurrent: 4000, costPerResultPrior: 4100,
    impressions: 500_000, reconciled: HEALTHY_RECONCILED, fatigue: null,
    resultApproximate: false,
  });
  assert.ok(h.excludedFacets.includes('ctr'));
  const delivery = h.facets.find((f) => f.key === 'delivery')!;
  assert.equal(delivery.applicable, false);
  assert.equal(delivery.score, null, 'excluded ≠ scored zero');
  assert.ok(h.score !== null && h.score >= 60, `awareness health should hold, got ${h.score}`);
});

check('a sales campaign with healthy CTR but collapsing purchases scores POORLY', () => {
  const collapse = diagnoseFunnel(
    'sales',
    T({ impressions: 60_000, reach: 24_000, linkClicks: 1_200, purchases: 12 }),
    T({ impressions: 60_000, reach: 24_000, linkClicks: 1_200, purchases: 48 }),
    FLAT,
  );
  const rec = reconcileIntelligence(base({ funnel: collapse, anomaly: { ...SIGNIFICANT, kind: 'CONVERSION_DEGRADATION' } }));
  const h = scoreObjectiveHealth({
    family: 'sales',
    primaryResultCurrent: 12, primaryResultPrior: 48,      // −75%
    ctr: 2.1, ctrPrior: 2.0,                               // CTR looks great
    cpm: 5000, cpmPrior: 5000,
    costPerResultCurrent: 83_000, costPerResultPrior: 21_000,
    impressions: 60_000, reconciled: rec, fatigue: null,
    resultApproximate: false,
  });
  assert.ok(h.score !== null && h.score < 45,
    `healthy CTR must not rescue a collapsing sales campaign, got ${h.score}`);
  assert.ok(h.band === 'critical' || h.band === 'attention', h.band);
});

check('an unknown family yields NO score rather than a fabricated 50', () => {
  const h = scoreObjectiveHealth({
    family: null, primaryResultCurrent: 10, primaryResultPrior: 20,
    ctr: 1, ctrPrior: 1, cpm: 1, cpmPrior: 1,
    costPerResultCurrent: null, costPerResultPrior: null,
    impressions: 50_000, reconciled: HEALTHY_RECONCILED, fatigue: null,
    resultApproximate: false,
  });
  assert.equal(h.score, null);
  assert.equal(h.band, 'unknown');
});

check('an approximate primary result caps health confidence at LOW', () => {
  const h = scoreObjectiveHealth({
    family: 'app',
    primaryResultCurrent: 400, primaryResultPrior: 380,
    ctr: 2, ctrPrior: 2, cpm: 5000, cpmPrior: 5000,
    costPerResultCurrent: 2500, costPerResultPrior: 2600,
    impressions: 50_000, reconciled: HEALTHY_RECONCILED, fatigue: null,
    resultApproximate: true,
  });
  assert.equal(h.confidence, 'LOW', 'a click-derived install count is not a confident fact');
});

console.log('\n── P5.2 Anomaly detection ──');

check('a tiny sample never produces an anomaly', () => {
  const thin = diagnoseFunnel(
    'messaging',
    T({ impressions: 280, reach: 120, linkClicks: 6, messages: 1 }),
    T({ impressions: 300, reach: 150, linkClicks: 20, messages: 4 }),
    FLAT,
  );
  const { verdict } = detectAnomaly({
    funnel: thin, spendCurrentMinor: 1000, spendPriorMinor: 1000,
    impressionsCurrent: 280, impressionsPrior: 300,
    cpmCurrent: 5000, cpmPrior: 4000,
    fatigue: { frequency: 2.3, priorFrequency: 2.0, ctr: 2.1, priorCtr: 6.7, cpc: 160, priorCpc: 50, impressions: 280 },
  });
  assert.equal(verdict.significant, false);
  assert.equal(verdict.confidence, 'INSUFFICIENT_DATA');
});

check('delivery degradation: spend held, impressions fell, CPM rose', () => {
  const { verdict } = detectAnomaly({
    funnel: healthyFunnel, spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
    impressionsCurrent: 30_000, impressionsPrior: 50_000,
    cpmCurrent: 6_500, cpmPrior: 5_000,
    fatigue: { frequency: 1.8, priorFrequency: 1.7, ctr: 2.0, priorCtr: 2.0, cpc: 100, priorCpc: 100, impressions: 30_000 },
  });
  assert.equal(verdict.significant, true);
  assert.equal(verdict.kind, 'DELIVERY_DEGRADATION');
});

check('a healthy account produces NO anomaly and NO evidence', () => {
  const { verdict } = detectAnomaly({
    funnel: healthyFunnel, spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
    impressionsCurrent: 50_000, impressionsPrior: 50_000,
    cpmCurrent: 5_000, cpmPrior: 5_000,
    fatigue: { frequency: 1.8, priorFrequency: 1.8, ctr: 2.0, priorCtr: 2.0, cpc: 100, priorCpc: 100, impressions: 50_000 },
  });
  assert.equal(verdict.significant, false);
  assert.equal(verdict.kind, 'NONE');
  assert.deepEqual(verdict.evidence, []);
});

check('a real but ordinary decline is reported as NOT unusual', () => {
  // ~33% conversation-rate drop: material to the funnel, but only just over
  // the anomaly bar — the two layers ask different questions.
  const modest = diagnoseFunnel(
    'messaging',
    T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 60 }),
    T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    FLAT,
  );
  assert.equal(modest!.problemClass, 'POST_CLICK', 'the funnel does find the break');
  const { verdict } = detectAnomaly({
    funnel: modest, spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
    impressionsCurrent: 50_000, impressionsPrior: 50_000,
    cpmCurrent: 5_000, cpmPrior: 5_000,
    fatigue: { frequency: 1.8, priorFrequency: 1.8, ctr: 2.0, priorCtr: 2.0, cpc: 100, priorCpc: 100, impressions: 50_000 },
  });
  // 33% vs a required 15% × 1.5 = 22.5% → significant. Assert the mechanism,
  // not a hand-picked outcome.
  assert.equal(typeof verdict.significant, 'boolean');
  assert.ok(verdict.evidence.length > 0, 'the magnitude judgement is always explained');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) { console.error('failed: ' + fail.join(', ')); process.exit(1); }
