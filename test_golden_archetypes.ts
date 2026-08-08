/**
 * PART F — the final golden dataset: 15 real campaign archetypes.
 *
 * Each archetype runs the FULL deterministic pipeline end to end:
 *
 *   raw Meta actions → mapper → purpose → result semantics → funnel
 *   → anomaly → reconciliation → health → recommendation
 *
 * and asserts every layer's output. This is the regression net for the whole
 * analytics system: if any layer silently changes meaning, an archetype's
 * expected verdict stops matching and the build fails.
 *
 * Run: npx tsx test_golden_archetypes.ts
 */
import assert from 'node:assert/strict';
import { mapMetaInsight } from './src/mappers/insightMapper';
import { resolveCampaignPurpose } from './src/lib/campaignPurpose';
import { resultFor, aggregateMixedResults, singleUnitCount } from './src/analytics/resultSemantics';
import { diagnoseFunnel } from './src/analytics/funnel/diagnose';
import type { FunnelWindowTotals } from './src/analytics/funnel/compute';
import { detectAnomaly } from './src/analytics/intelligence/anomaly';
import { reconcileIntelligence } from './src/analytics/intelligence/hierarchy';
import { scoreObjectiveHealth } from './src/analytics/intelligence/objectiveHealth';
import { buildRecommendation } from './src/analytics/intelligence/recommend';
import { classificationConfidenceFromReason } from './src/analytics/confidence';
import type { ObjectiveKpiFamily } from './src/lib/objectiveKpis';

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

interface Archetype {
  id: string;
  name: string;
  purposeInput: Parameters<typeof resolveCampaignPurpose>[0];
  cur: FunnelWindowTotals;
  pri: FunnelWindowTotals;
  spendCur: number; spendPri: number;
  ctrCur: number | null; ctrPri: number | null;
  cpcCur: number | null; cpcPri: number | null;
  cpmCur: number | null; cpmPri: number | null;
  freqCur: number | null; freqPri: number | null;
  expect: {
    family: ObjectiveKpiFamily | null;
    problemClass: string;
    alert: boolean;
    confidence: string;
    /** null = no recommendation must be produced. */
    actionCode: string | null;
    healthBand?: string;
    resultApproximate?: boolean;
  };
}

/** Run every deterministic layer for one archetype. */
function runPipeline(a: Archetype) {
  const purpose = resolveCampaignPurpose(a.purposeInput);
  const family = purpose.family;
  const def = resultFor(family);
  const classification = classificationConfidenceFromReason(purpose.reason, purpose.corroborated);

  const resultCur = a.cur[def.resultKey as keyof FunnelWindowTotals] as number;
  const resultPri = a.pri[def.resultKey as keyof FunnelWindowTotals] as number;

  const funnel = diagnoseFunnel(family, a.cur, a.pri, {
    spendCurrentMinor: a.spendCur, spendPriorMinor: a.spendPri,
    costPerResultCurrentMinor: resultCur > 0 ? a.spendCur / resultCur : null,
    costPerResultPriorMinor: resultPri > 0 ? a.spendPri / resultPri : null,
  });

  const { verdict, fatigue } = detectAnomaly({
    funnel,
    spendCurrentMinor: a.spendCur, spendPriorMinor: a.spendPri,
    impressionsCurrent: a.cur.impressions, impressionsPrior: a.pri.impressions,
    cpmCurrent: a.cpmCur, cpmPrior: a.cpmPri,
    fatigue: {
      frequency: a.freqCur, priorFrequency: a.freqPri,
      ctr: a.ctrCur, priorCtr: a.ctrPri,
      cpc: a.cpcCur, priorCpc: a.cpcPri,
      impressions: a.cur.impressions,
    },
  });

  const reconciled = reconcileIntelligence({
    dataConfidence: 'COMPLETE', classificationConfidence: classification,
    funnel, anomaly: verdict, fatigue,
  });

  const health = scoreObjectiveHealth({
    family, primaryResultCurrent: resultCur, primaryResultPrior: resultPri,
    ctr: a.ctrCur, ctrPrior: a.ctrPri, cpm: a.cpmCur, cpmPrior: a.cpmPri,
    costPerResultCurrent: resultCur > 0 ? a.spendCur / resultCur : null,
    costPerResultPrior: resultPri > 0 ? a.spendPri / resultPri : null,
    impressions: a.cur.impressions, reconciled, fatigue,
    resultApproximate: def.approximate,
  });

  const recommendation = buildRecommendation(reconciled, family);
  return { purpose, family, def, classification, funnel, verdict, fatigue, reconciled, health, recommendation };
}

// ── The 15 archetypes ───────────────────────────────────────────────────

const WA = {
  objective: 'OUTCOME_ENGAGEMENT',
  optimizationGoals: ['POST_ENGAGEMENT'],
  destinationTypes: ['WHATSAPP'],
};

const ARCHETYPES: Archetype[] = [
  {
    id: '01', name: 'WhatsApp Messages — healthy',
    purposeInput: { ...WA, messagesWindow: 90, clicksWindow: 900 },
    cur: T({ impressions: 120_000, reach: 32_000, linkClicks: 1_420, messages: 142, clicks: 2_000 }),
    pri: T({ impressions: 118_000, reach: 31_500, linkClicks: 1_400, messages: 140, clicks: 1_980 }),
    spendCur: 1_000_000, spendPri: 1_000_000,
    ctrCur: 1.7, ctrPri: 1.7, cpcCur: 700, cpcPri: 700, cpmCur: 8_300, cpmPri: 8_400,
    freqCur: 3.75, freqPri: 3.74,
    expect: { family: 'messaging', problemClass: 'NO_MATERIAL_BREAK', alert: false, confidence: 'HIGH', actionCode: null, healthBand: 'good' },
  },
  {
    id: '02', name: 'WhatsApp Messages — post-click collapse',
    purposeInput: { ...WA, messagesWindow: 84, clicksWindow: 1_420 },
    cur: T({ impressions: 120_000, reach: 32_000, linkClicks: 1_420, messages: 84, clicks: 2_000 }),
    pri: T({ impressions: 120_000, reach: 32_000, linkClicks: 1_420, messages: 240, clicks: 2_000 }),
    spendCur: 1_000_000, spendPri: 1_000_000,
    ctrCur: 1.18, ctrPri: 1.18, cpcCur: 700, cpcPri: 700, cpmCur: 8_300, cpmPri: 8_300,
    freqCur: 3.75, freqPri: 3.75,
    expect: { family: 'messaging', problemClass: 'POST_CLICK', alert: true, confidence: 'HIGH', actionCode: 'FIX_MESSAGING_DESTINATION' },
  },
  {
    id: '03', name: 'Traffic — landing page degradation',
    purposeInput: { objective: 'OUTCOME_TRAFFIC', optimizationGoals: ['LINK_CLICKS'] },
    cur: T({ impressions: 80_000, reach: 26_000, linkClicks: 1_600, landingPageViews: 480 }),
    pri: T({ impressions: 80_000, reach: 26_000, linkClicks: 1_600, landingPageViews: 1_280 }),
    spendCur: 800_000, spendPri: 800_000,
    ctrCur: 2.0, ctrPri: 2.0, cpcCur: 500, cpcPri: 500, cpmCur: 10_000, cpmPri: 10_000,
    freqCur: 3.1, freqPri: 3.1,
    expect: { family: 'traffic', problemClass: 'POST_CLICK', alert: true, confidence: 'HIGH', actionCode: 'FIX_LANDING_PAGE' },
  },
  {
    id: '04', name: 'Leads — lead conversion collapse',
    purposeInput: { objective: 'OUTCOME_LEADS', optimizationGoals: ['LEAD_GENERATION'] },
    cur: T({ impressions: 60_000, reach: 24_000, linkClicks: 1_200, leads: 24 }),
    pri: T({ impressions: 60_000, reach: 24_000, linkClicks: 1_200, leads: 96 }),
    spendCur: 900_000, spendPri: 900_000,
    ctrCur: 2.0, ctrPri: 2.0, cpcCur: 750, cpcPri: 750, cpmCur: 15_000, cpmPri: 15_000,
    freqCur: 2.5, freqPri: 2.5,
    expect: { family: 'leads', problemClass: 'CONVERSION', alert: true, confidence: 'HIGH', actionCode: 'FIX_CONVERSION_STEP' },
  },
  {
    id: '05', name: 'Sales — purchase collapse',
    purposeInput: { objective: 'OUTCOME_SALES', optimizationGoals: ['OFFSITE_CONVERSIONS'] },
    cur: T({ impressions: 90_000, reach: 30_000, linkClicks: 1_800, purchases: 15 }),
    pri: T({ impressions: 90_000, reach: 30_000, linkClicks: 1_800, purchases: 60 }),
    spendCur: 1_200_000, spendPri: 1_200_000,
    ctrCur: 2.0, ctrPri: 2.0, cpcCur: 660, cpcPri: 660, cpmCur: 13_300, cpmPri: 13_300,
    freqCur: 3.0, freqPri: 3.0,
    expect: { family: 'sales', problemClass: 'CONVERSION', alert: true, confidence: 'HIGH', actionCode: 'FIX_CONVERSION_STEP', healthBand: 'critical' },
  },
  {
    id: '06', name: 'Sales — ROAS deterioration (efficiency, ratios hold)',
    purposeInput: { objective: 'OUTCOME_SALES', optimizationGoals: ['OFFSITE_CONVERSIONS'] },
    cur: T({ impressions: 90_000, reach: 30_000, linkClicks: 1_800, purchases: 60 }),
    pri: T({ impressions: 90_000, reach: 30_000, linkClicks: 1_800, purchases: 60 }),
    spendCur: 1_800_000, spendPri: 1_200_000,     // same orders, 50% more spend
    ctrCur: 2.0, ctrPri: 2.0, cpcCur: 1_000, cpcPri: 660, cpmCur: 20_000, cpmPri: 13_300,
    freqCur: 3.0, freqPri: 3.0,
    expect: { family: 'sales', problemClass: 'EFFICIENCY', alert: true, confidence: 'MEDIUM', actionCode: 'REVIEW_BIDDING' },
  },
  {
    id: '07', name: 'Engagement — approximate result',
    purposeInput: { objective: 'OUTCOME_ENGAGEMENT', optimizationGoals: ['POST_ENGAGEMENT'], messagesWindow: 0, clicksWindow: 800 },
    cur: T({ impressions: 70_000, reach: 28_000, clicks: 600 }),
    pri: T({ impressions: 70_000, reach: 28_000, clicks: 1_800 }),
    spendCur: 500_000, spendPri: 500_000,
    ctrCur: 0.86, ctrPri: 2.57, cpcCur: 833, cpcPri: 278, cpmCur: 7_100, cpmPri: 7_100,
    freqCur: 2.5, freqPri: 2.5,
    expect: { family: 'engagement', problemClass: 'CONVERSION', alert: true, confidence: 'LOW', actionCode: 'FIX_CONVERSION_STEP', resultApproximate: true },
  },
  {
    id: '08', name: 'Awareness — reach/frequency saturation',
    purposeInput: { objective: 'OUTCOME_AWARENESS', optimizationGoals: ['REACH'] },
    cur: T({ impressions: 200_000, reach: 40_000 }),
    pri: T({ impressions: 200_000, reach: 80_000 }),
    spendCur: 600_000, spendPri: 600_000,
    ctrCur: 0.4, ctrPri: 0.45, cpcCur: 900, cpcPri: 850, cpmCur: 3_000, cpmPri: 3_000,
    freqCur: 5.0, freqPri: 2.5,
    expect: { family: 'awareness', problemClass: 'DELIVERY', alert: true, confidence: 'MEDIUM', actionCode: 'EXPAND_AUDIENCE' },
  },
  {
    id: '09', name: 'Creative fatigue — freq ↑, CTR ↓, CPC ↑',
    purposeInput: { ...WA, messagesWindow: 45, clicksWindow: 700 },
    cur: T({ impressions: 100_000, reach: 26_000, linkClicks: 700, messages: 70, clicks: 1_000 }),
    pri: T({ impressions: 100_000, reach: 27_000, linkClicks: 1_400, messages: 140, clicks: 2_000 }),
    spendCur: 900_000, spendPri: 900_000,
    ctrCur: 1.0, ctrPri: 2.0, cpcCur: 1_285, cpcPri: 642, cpmCur: 9_000, cpmPri: 9_000,
    freqCur: 3.85, freqPri: 3.70,
    expect: { family: 'messaging', problemClass: 'CLICK', alert: true, confidence: 'HIGH', actionCode: 'REFRESH_CREATIVE' },
  },
  {
    id: '12', name: 'Insufficient data — a brand-new account',
    purposeInput: { ...WA, messagesWindow: 2, clicksWindow: 15 },
    cur: T({ impressions: 400, reach: 300, linkClicks: 12, messages: 1 }),
    pri: T({ impressions: 300, reach: 250, linkClicks: 20, messages: 4 }),
    spendCur: 20_000, spendPri: 18_000,
    ctrCur: 3.0, ctrPri: 6.7, cpcCur: 1_600, cpcPri: 900, cpmCur: 50_000, cpmPri: 60_000,
    freqCur: 1.3, freqPri: 1.2,
    expect: { family: 'messaging', problemClass: 'NO_MATERIAL_BREAK', alert: false, confidence: 'INSUFFICIENT_DATA', actionCode: null, healthBand: 'unknown' },
  },
  {
    id: '15', name: 'Healthy account, no anomaly — deliberate silence',
    purposeInput: { objective: 'OUTCOME_SALES', optimizationGoals: ['OFFSITE_CONVERSIONS'] },
    cur: T({ impressions: 90_000, reach: 30_000, linkClicks: 1_800, purchases: 62 }),
    pri: T({ impressions: 89_000, reach: 29_800, linkClicks: 1_790, purchases: 60 }),
    spendCur: 1_200_000, spendPri: 1_200_000,
    ctrCur: 2.0, ctrPri: 2.0, cpcCur: 660, cpcPri: 660, cpmCur: 13_300, cpmPri: 13_400,
    freqCur: 3.0, freqPri: 2.99,
    expect: { family: 'sales', problemClass: 'NO_MATERIAL_BREAK', alert: false, confidence: 'HIGH', actionCode: null, healthBand: 'good' },
  },
];

console.log('\n── Archetypes 1–9, 12, 15: full pipeline ──');

for (const a of ARCHETYPES) {
  check(`${a.id} ${a.name}`, () => {
    const r = runPipeline(a);
    assert.equal(r.family, a.expect.family, `family: got ${r.family}`);
    assert.equal(r.reconciled.problemClass, a.expect.problemClass,
      `problemClass: got ${r.reconciled.problemClass} (funnel said ${r.funnel?.problemClass}, anomaly ${r.verdict.kind}/${r.verdict.significant})`);
    assert.equal(r.reconciled.alert, a.expect.alert, `alert: got ${r.reconciled.alert}`);
    assert.equal(r.reconciled.confidence, a.expect.confidence, `confidence: got ${r.reconciled.confidence}`);
    assert.equal(r.recommendation?.actionCode ?? null, a.expect.actionCode,
      `actionCode: got ${r.recommendation?.actionCode ?? null}`);
    if (a.expect.healthBand) {
      assert.equal(r.health.band, a.expect.healthBand, `healthBand: got ${r.health.band} (score ${r.health.score})`);
    }
    if (a.expect.resultApproximate !== undefined) {
      assert.equal(r.def.approximate, a.expect.resultApproximate);
    }
    // Universal invariants, asserted for EVERY archetype.
    if (r.reconciled.problemClass === 'NO_MATERIAL_BREAK') {
      assert.equal(r.recommendation, null, 'no advice may be manufactured without a break');
    }
    if (!r.reconciled.alert) {
      assert.equal(r.recommendation, null, 'a non-anomalous break must not interrupt the merchant');
    }
    if (r.reconciled.confidence === 'INSUFFICIENT_DATA') {
      assert.deepEqual(r.reconciled.evidence, [], 'nothing measured → nothing claimed');
    }
  });
}

console.log('\n── 10. Mixed-purpose account ──');

check('10 mixed account reports per-unit subtotals and NO single result', () => {
  const total = aggregateMixedResults([
    { family: 'messaging', rows: [{ messages: 84 }], spendMinor: 900_000 },
    { family: 'sales', rows: [{ purchases: 12 }], spendMinor: 100_000 },
  ]);
  assert.equal(total.mixed, true);
  assert.equal(total.byUnit.length, 2);
  assert.equal(singleUnitCount(total), null, 'computation must receive nothing to sum');
  assert.equal(total.dominant!.unit, 'conversation');
  // The fabricated total must be unrepresentable.
  assert.equal((total as any).total, undefined);
});

console.log('\n── 11. Unknown objective ──');

check('11 unknown objective yields no funnel, no diagnosis, no advice', () => {
  const r = reconcileIntelligence({
    dataConfidence: 'COMPLETE', classificationConfidence: 'UNKNOWN',
    funnel: null, anomaly: { significant: false, confidence: 'INSUFFICIENT_DATA', kind: 'NONE', evidence: [] },
    fatigue: null,
  });
  assert.equal(r.decidedBy, 'SEMANTIC_VALIDITY');
  assert.equal(r.confidence, 'INSUFFICIENT_DATA');
  assert.equal(buildRecommendation(r, null), null);
  assert.equal(diagnoseFunnel(null, T({ impressions: 50_000 }), T({ impressions: 50_000 }), {
    spendCurrentMinor: 0, spendPriorMinor: 0, costPerResultCurrentMinor: null, costPerResultPriorMinor: null,
  }), null);
});

console.log('\n── 13. Overlapping Meta actions ──');

check('13 overlapping purchase/lead/LPV representations count ONCE', () => {
  const A = (t: string, v: number) => ({ action_type: t, value: String(v) });
  const n = mapMetaInsight({
    date_start: '2026-08-01', spend: '1000', impressions: '50000', reach: '20000',
    clicks: '900', inline_link_clicks: '400',
    actions: [
      A('purchase', 12), A('offsite_conversion.fb_pixel_purchase', 12), A('omni_purchase', 15),
      A('lead', 10), A('leadgen.other', 6),
      A('landing_page_view', 320), A('omni_landing_page_view', 320),
      A('onsite_conversion.messaging_conversation_started_7d', 87),
      A('onsite_conversion.messaging_first_reply', 76),
    ],
    action_values: [A('purchase', 3600), A('omni_purchase', 4500)],
  } as any, { currencyMinorFactor: 1 });

  assert.equal(n.purchases, 12, 'was 39 before P3.5');
  assert.equal(n.leads, 10, 'was 16');
  assert.equal(n.landingPageViews, 320, 'was 640');
  assert.equal(n.messages, 87, 'was 163');
  assert.equal(n.revenueMinor, 3600, 'was 8100');
  assert.equal(n.roas, 3.6, `ROAS was 8.1; got ${n.roas}`);
});

console.log('\n── 14. Historical incomplete data ──');

check('14 rows predating link_clicks/LPV yield INSUFFICIENT_DATA, not fake ratios', () => {
  // A pre-P0 row: counts exist, but linkClicks was never persisted (0).
  const funnel = diagnoseFunnel(
    'messaging',
    T({ impressions: 120_000, reach: 32_000, linkClicks: 0, messages: 84 }),
    T({ impressions: 118_000, reach: 31_000, linkClicks: 0, messages: 90 }),
    { spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000, costPerResultCurrentMinor: null, costPerResultPriorMinor: null },
  )!;
  const conv = funnel.stages.current.find((s) => s.stageKey === 'conversations')!;
  assert.equal(conv.status, 'UNAVAILABLE', 'a zero link-click denominator is unknown, not a real zero');
  assert.equal((conv as any).reason, 'INSUFFICIENT_DATA');
  const convRatio = funnel.ratios.find((r) => r.stageKey === 'conversations')!;
  assert.equal(convRatio.judgeable, false);
  assert.equal(convRatio.currentRatio, null, 'no ratio may be fabricated from a missing denominator');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) { console.error('failed: ' + fail.join(', ')); process.exit(1); }
