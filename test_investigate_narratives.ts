/**
 * Deterministic investigation narratives — no Claude required.
 * Run: npx tsx test_investigate_narratives.ts
 */
import { buildDeterministicInvestigationNarratives } from './src/services/agent/investigateNarratives';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const keys = [
  'structure',
  'budget',
  'learning_phase',
  'audience',
  'creative_fatigue',
  'placement',
  'pixel_health',
  'historical_trend',
];

const data = {
  structure: {
    campaign: { name: 'وعي ٤٦', status: 'ACTIVE', objective: 'OUTCOME_AWARENESS' },
    windowMetrics: {
      spend: { current: 120000, prior: 100000, deltaPct: 20 },
      ctr: { current: 1.25, prior: 1.4, deltaPct: -10.7 },
    },
    topIssues: [{ code: 'HIGH_FREQUENCY', severity: 'medium', evidence: ['frequency 3.2'], strength: 0.7 }],
    topRecommendations: [{ text: 'جدّد الإبداع خلال 48 ساعة', priority: 'high', strength: 0.8 }],
  },
  budget: {
    todaySpend: 45000,
    dailyBudget: 100000,
    pctOfBudget: 45,
    burnRatePerHour: 3750,
  },
  learning_phase: {
    totalAdSets: 3,
    reportedAdSets: 3,
    inLearning: 1,
    learningLimited: 0,
    success: 2,
    other: [],
  },
  audience: {
    best: { segment: '25-34', reason: 'أفضل شريحة بـ تكلفة الرسالة: 25-34 (12.50 IQD)' },
    worst: { segment: '55-64', reason: 'أضعف شريحة بـ تكلفة الرسالة: 55-64 (40 IQD)' },
    concentrationVerdict: 'balanced',
    segments: [{ segment: '25-34', shareOfSpendPct: 42 }],
  },
  creative_fatigue: {
    creative: {
      totalAdsWithData: 4,
      ranked: [{ adName: 'إعلان فيديو 1', metricDisplay: '12.5 IQD' }],
      featureCorrelations: [{ note: 'إعلانات بـ has_video: cost_per_message أفضل بـ 25% في المتوسط' }],
    },
    anomaly: {
      anomalies: [{ metric: 'ctr', direction: 'worse', zScore: -2.4 }],
    },
  },
  placement: {
    best: { segment: 'feed', reason: 'أفضل موضع: feed' },
    worst: { segment: 'audience_network', reason: 'أضعف موضع: audience_network' },
    concentrationVerdict: 'narrow',
    segments: [{ segment: 'feed', shareOfSpendPct: 70 }],
  },
  pixel_health: {
    pixelName: 'Adlytic Pixel',
    lastFiredAt: '2026-07-09T10:00:00.000Z',
    eventCoverage: [{ eventName: 'Purchase', coveragePct: 40, goalPct: 80 }],
  },
  historical_trend: {
    historicalBaseline: { days: 90, ctrMean: 1.5 },
    vsBaseline: { ctrPct: -20, spendPct: 10, messagesPct: -5, cpmPct: 8 },
  },
};

const out = buildDeterministicInvestigationNarratives(data, keys);
for (const k of keys) {
  assert(typeof out[k] === 'string' && out[k]!.length > 20, `${k} has narrative`);
  assert(!/request_id|invalid_request_error|credit balance/i.test(out[k]!), `${k} has no provider JSON`);
}
assert(out.structure!.includes('وعي ٤٦'), 'structure cites campaign name');
assert(out.budget!.includes('45'), 'budget cites pct');
assert(out.learning_phase!.includes('التعلّم'), 'learning mentions phase');
assert(out.audience!.includes('25-34') || out.audience!.includes('أفضل'), 'audience cites segment');
assert(out.creative_fatigue!.includes('إعلان') || out.creative_fatigue!.includes('تعب'), 'creative narrative');
assert(out.placement!.includes('feed') || out.placement!.includes('موضع'), 'placement narrative');
assert(out.pixel_health!.includes('Pixel') || out.pixel_health!.includes('تغطية'), 'pixel narrative');
assert(out.historical_trend!.includes('90') || out.historical_trend!.includes('الأساس'), 'historical narrative');

const empty = buildDeterministicInvestigationNarratives({}, keys);
assert(empty.structure === 'لا تتوفر بيانات كافية لهذا القسم حالياً.', 'empty structure → no_data text');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll investigate narrative checks passed.');
