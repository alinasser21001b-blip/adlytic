/**
 * Meta objective standards — analysis + narration vocabulary.
 * Run: npx tsx test_meta_objective_standards.ts
 */
import assert from 'node:assert/strict';
import {
  arabicEfficiencyPhrase,
  arabicResultPhrase,
  filterMetricsForObjective,
  getMetaObjectiveStandard,
  lowCtrFloorForObjective,
} from './src/knowledge/metaObjectiveStandards';
import { evaluateCampaign } from './src/knowledge/evaluate';
import { detectLowCtr } from './src/engines/rules/detectLowCtr';
import { diagnose } from './src/engines/rules/diagnose';
import type { Signals } from './src/engines/rules/types';
import { IssueCode, Severity } from '@prisma/client';
import { buildDeterministicNarration } from './src/lib/insightQualityGate';
import { signalsFromCampaignRaw } from './src/engines/rules/campaignSignals';
import type { AccountBaseline, CampaignRawData } from './src/engine/BaselineCalculator';

// ── Awareness must not use messaging vocabulary / thresholds ─────────────
const awareness = getMetaObjectiveStandard('OUTCOME_AWARENESS');
assert.equal(awareness.family, 'awareness');
assert.equal(awareness.resultNounAr, 'مرات ظهور');
assert.equal(awareness.efficiencyNounAr, 'تكلفة الوصول');
assert.ok(awareness.forbiddenVocabAr.includes('رسائل'));
assert.equal(lowCtrFloorForObjective('OUTCOME_AWARENESS'), 0.6);
assert.equal(arabicResultPhrase('OUTCOME_AWARENESS'), 'مرات ظهور');

// CTR 0.8% is BELOW messaging floor (1.0) but ABOVE awareness floor (0.6)
const awarenessSignals: Signals = {
  ctrTrend: null,
  cpmTrend: null,
  frequencyTrend: null,
  resultsTrend: null,
  spendTrend: null,
  currentCtr: 0.8,
  currentFrequency: 1.5,
  currentCpm: 10,
  currentResults: 5000,
  currentSpend: 100,
  objective: 'OUTCOME_AWARENESS',
};
assert.equal(detectLowCtr(awarenessSignals), null, 'awareness CTR 0.8% should not fire LOW_CTR');

const messagingSignals: Signals = { ...awarenessSignals, objective: 'MESSAGES' };
assert.ok(detectLowCtr(messagingSignals), 'messaging CTR 0.8% should fire LOW_CTR');

// KB filter: awareness must not evaluate cost_per_message
const filtered = filterMetricsForObjective(
  { ctr: 0.9, cpm: 12, frequency: 2, cost_per_message: 5, roas: 0.5 },
  'OUTCOME_AWARENESS',
);
assert.equal(filtered.cost_per_message, undefined);
assert.equal(filtered.roas, undefined);
assert.equal(filtered.ctr, 0.9);

const breaches = evaluateCampaign(
  { ctr: 0.9, cpm: 12, frequency: 2, cost_per_message: 999 },
  { objective: 'OUTCOME_AWARENESS' },
);
assert.ok(
  !breaches.some((b) => b.metricKey === 'cost_per_message'),
  'awareness must not breach on cost_per_message',
);

// Diagnose POST_CLICK skipped for awareness; messaging gets WhatsApp action
const decliningIssue = {
  issueCode: IssueCode.DECLINING_RESULTS,
  severity: Severity.HIGH,
  evidence: { confidence: 0.8 },
} as any;

const awarenessDiag = diagnose([decliningIssue], {
  ...awarenessSignals,
  currentCtr: 1.5,
  resultsTrend: -0.3,
  ctrTrend: 0.05,
});
assert.ok(
  !awarenessDiag.some((d) => d.code === 'POST_CLICK_PROBLEM'),
  'awareness should not get POST_CLICK_PROBLEM',
);

const msgDiag = diagnose([decliningIssue], {
  ...messagingSignals,
  currentCtr: 1.5,
  resultsTrend: -0.3,
  ctrTrend: 0.05,
  objective: 'MESSAGES',
});
const postClick = msgDiag.find((d) => d.code === 'POST_CLICK_PROBLEM');
assert.ok(postClick);
assert.ok(postClick!.action.includes('واتساب') || postClick!.action.includes('ماسنجر'));

// signalsFromCampaignRaw uses impressions for awareness, not messages
const raw: CampaignRawData = {
  campaignId: 'x',
  campaignName: 'وعي 46',
  objective: 'OUTCOME_AWARENESS',
  spend: 10,
  impressions: 12000,
  clicks: 50,
  ctr: 0.4,
  frequency: 1.2,
  messages: 0,
  cpm: 5,
  cpc: 0.2,
};
const baseline = {
  avgCostPerMessage: 1,
  avgCTR: 1,
  avgFrequency: 2,
  avgCPM: 10,
  avgCPC: 0.5,
  metadata: { campaignCount: 1, totalSpend: 10, totalMessages: 0, totalImpressions: 12000, totalClicks: 50 },
  confidence: { score: 50, level: 'low' },
} satisfies AccountBaseline;
const abs = signalsFromCampaignRaw(raw, baseline);
assert.equal(abs.currentResults, 12000);
assert.equal(abs.objective, 'OUTCOME_AWARENESS');

// Deterministic narration uses awareness vocabulary
const narr = buildDeterministicNarration({
  campaignName: 'وعي 46',
  objective: 'OUTCOME_AWARENESS',
  decision: { action: 'SCALE_BUDGET' },
});
assert.ok(narr.arabicNarration.includes('مرات ظهور'));
assert.ok(!narr.arabicNarration.includes('رسائل'));
assert.ok(narr.arabicNarration.includes('تكلفة الوصول'));

assert.equal(arabicEfficiencyPhrase('OUTCOME_TRAFFIC'), 'تكلفة النقرة');
assert.equal(arabicResultPhrase('OUTCOME_SALES'), 'مشتريات');
assert.equal(arabicResultPhrase('MESSAGES'), 'رسائل');

console.log('test_meta_objective_standards: ok');
