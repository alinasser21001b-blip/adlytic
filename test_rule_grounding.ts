// test_rule_grounding.ts — brain ↔ diagnose fusion.
// Run: npx tsx test_rule_grounding.ts

import { runBrainForCampaign } from './src/engine/AdlyticBrain';
import type { AccountBaseline, CampaignRawData } from './src/engine/BaselineCalculator';
import {
  applyRuleGroundingToDecision,
  buildRuleGrounding,
} from './src/engines/rules/ruleGrounding';
import { signalsFromCampaignRaw } from './src/engines/rules/campaignSignals';
import type { CampaignDecision } from './src/engine/DecisionEngine';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`);
  }
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

console.log('\nrule grounding');

{
  const raw: CampaignRawData = {
    campaignId: 'low_ctr_01',
    campaignName: 'إعلان ضعيف',
    spend: 80,
    impressions: 10000,
    clicks: 40,
    ctr: 0.4,
    frequency: 2.1,
    messages: 8,
    cpm: 8,
    cpc: 2,
  };
  const g = buildRuleGrounding(raw, baseline);
  check('low CTR produces issues or diagnoses', g.issues.length + g.diagnoses.length > 0, g);
  check(
    'weak creative or fatigue diagnosis',
    g.diagnoses.some((d) => d.code === 'WEAK_CREATIVE' || d.code === 'CREATIVE_FATIGUE' || d.code === 'DECLINING_OUTCOMES'),
    g.diagnoses.map((d) => d.code),
  );
}

{
  // Expensive / inefficient vs baseline must NOT invent temporal decline.
  const raw: CampaignRawData = {
    campaignId: 'expensive_01',
    campaignName: 'حملة غالية',
    spend: 100,
    impressions: 5000,
    clicks: 100,
    ctr: 2.0,
    frequency: 2.0,
    messages: 20,
    cpm: 20,
    cpc: 1,
  };
  const signals = signalsFromCampaignRaw(raw, baseline);
  check('campaignSignals omits all trends', 
    signals.cpmTrend === null && signals.spendTrend === null &&
    signals.ctrTrend === null && signals.resultsTrend === null &&
    signals.frequencyTrend === null, signals);
  const g = buildRuleGrounding(raw, baseline);
  check('no false AUCTION_PRESSURE', !g.diagnoses.some((d) => d.code === 'AUCTION_PRESSURE'), g.diagnoses);
  check('no false POST_CLICK / DECLINING from inefficiency', 
    !g.diagnoses.some((d) => d.code === 'POST_CLICK_PROBLEM' || d.code === 'DECLINING_OUTCOMES'), g.diagnoses);
}

{
  // New inefficient campaign with healthy CTR — previously hallucinated "dropped 80%".
  const raw: CampaignRawData = {
    campaignId: 'new_01',
    campaignName: 'حملة جديدة',
    spend: 50,
    impressions: 8000,
    clicks: 160,
    ctr: 2.0,
    frequency: 1.5,
    messages: 2,
    cpm: 6.25,
    cpc: 0.31,
  };
  const g = buildRuleGrounding(raw, baseline);
  check('new campaign has no fake decline diagnosis', g.diagnoses.length === 0, g.diagnoses);
}

{
  const hold: CampaignDecision = {
    campaignId: 'x',
    action: 'HOLD_AND_MONITOR',
    priority: 'NORMAL',
    reason: 'stable',
  };
  const next = applyRuleGroundingToDecision(hold, {
    primaryCode: 'CREATIVE_FATIGUE',
    evidenceSource: 'period_trends',
    issues: [{ code: 'AUDIENCE_FATIGUE', severity: 'HIGH' }],
    diagnoses: [{
      code: 'CREATIVE_FATIGUE',
      name: 'إرهاق الإعلان',
      confidence: 0.85,
      narrative: 'تعب',
      action: 'جدّد',
    }],
  });
  check('fatigue upgrades HOLD to REFRESH', next.action === 'REFRESH_CREATIVE', next);
  check('stores overriddenAction', next.overriddenAction === 'HOLD_AND_MONITOR', next);
}

{
  const hold: CampaignDecision = {
    campaignId: 'x',
    action: 'HOLD_AND_MONITOR',
    priority: 'NORMAL',
    reason: 'stable',
  };
  const next = applyRuleGroundingToDecision(hold, {
    primaryCode: 'WEAK_CREATIVE',
    evidenceSource: 'absolute_levels',
    issues: [{ code: 'LOW_CTR', severity: 'MEDIUM' }],
    diagnoses: [{
      code: 'WEAK_CREATIVE',
      name: 'ضعف التفاعل',
      confidence: 0.8,
      narrative: 'ضعيف',
      action: 'جدّد',
    }],
  });
  check('WEAK_CREATIVE alone does NOT upgrade HOLD', next.action === 'HOLD_AND_MONITOR', next);
}

{
  const collecting: CampaignDecision = {
    campaignId: 'x',
    action: 'KEEP_COLLECTING',
    priority: 'NORMAL',
    reason: 'cold start',
  };
  const next = applyRuleGroundingToDecision(collecting, {
    primaryCode: 'WEAK_CREATIVE',
    evidenceSource: 'absolute_levels',
    issues: [{ code: 'LOW_CTR', severity: 'MEDIUM' }],
    diagnoses: [{
      code: 'WEAK_CREATIVE',
      name: 'ضعف التفاعل',
      confidence: 0.9,
      narrative: 'ضعيف',
      action: 'جدّد',
    }],
  });
  check('does NOT upgrade KEEP_COLLECTING', next.action === 'KEEP_COLLECTING', next);
}

{
  const refresh: CampaignDecision = {
    campaignId: 'x',
    action: 'REFRESH_CREATIVE',
    priority: 'CRITICAL',
    reason: 'dying',
  };
  const next = applyRuleGroundingToDecision(refresh, {
    primaryCode: 'POST_CLICK_PROBLEM',
    evidenceSource: 'period_trends',
    issues: [{ code: 'DECLINING_RESULTS', severity: 'HIGH' }],
    diagnoses: [{
      code: 'POST_CLICK_PROBLEM',
      name: 'مشكلة بعد النقر',
      confidence: 0.8,
      narrative: 'صفحة',
      action: 'راجع الصفحة',
    }],
  });
  check('post-click blocks wrong creative refresh', next.action === 'HOLD_AND_MONITOR', next);
}

{
  // Dual diagnosis: fatigue would upgrade HOLD→REFRESH, but post-click must win.
  const hold: CampaignDecision = {
    campaignId: 'x',
    action: 'HOLD_AND_MONITOR',
    priority: 'NORMAL',
    reason: 'stable',
  };
  const next = applyRuleGroundingToDecision(hold, {
    primaryCode: 'CREATIVE_FATIGUE',
    evidenceSource: 'period_trends',
    issues: [
      { code: 'AUDIENCE_FATIGUE', severity: 'HIGH' },
      { code: 'DECLINING_RESULTS', severity: 'HIGH' },
    ],
    diagnoses: [
      {
        code: 'CREATIVE_FATIGUE',
        name: 'إرهاق الإعلان',
        confidence: 0.85,
        narrative: 'تعب',
        action: 'جدّد',
      },
      {
        code: 'POST_CLICK_PROBLEM',
        name: 'مشكلة بعد النقر',
        confidence: 0.8,
        narrative: 'صفحة',
        action: 'راجع الصفحة',
      },
    ],
  });
  check('post-click outranks fatigue upgrade', next.action === 'HOLD_AND_MONITOR', next);
}

{
  const raw: CampaignRawData = {
    campaignId: 'dying_01',
    campaignName: 'Tired Promo',
    spend: 100,
    impressions: 5000,
    clicks: 50,
    ctr: 1.0,
    frequency: 2.5,
    messages: 10,
    cpm: 20.0,
    cpc: 2.0,
  };
  const tick = runBrainForCampaign(raw, baseline);
  check('brain still returns a decision', Boolean(tick.decision?.action), tick.decision);
  check(
    'ruleGrounding present when issues/diagnoses exist OR absent when none',
    tick.ruleGrounding == null || Array.isArray(tick.ruleGrounding.diagnoses),
    tick.ruleGrounding,
  );
  check(
    'absolute fallback marks evidenceSource',
    !tick.ruleGrounding || tick.ruleGrounding.evidenceSource === 'absolute_levels',
    tick.ruleGrounding?.evidenceSource,
  );
}

{
  // Period signals enable true decline diagnosis without inventing from baseline.
  const raw: CampaignRawData = {
    campaignId: 'period_01',
    campaignName: 'تراجع حقيقي',
    spend: 100,
    impressions: 8000,
    clicks: 160,
    ctr: 2.0,
    frequency: 2.0,
    messages: 5,
    cpm: 12,
    cpc: 0.6,
  };
  const periodSignals = {
    ctrTrend: 0.02,
    cpmTrend: null,
    frequencyTrend: null,
    resultsTrend: -0.45,
    spendTrend: 0.05,
    currentCtr: 2.0,
    currentFrequency: 2.0,
    currentCpm: 12,
    currentResults: 5,
    currentSpend: 10000,
  };
  const g = buildRuleGrounding(raw, baseline, periodSignals);
  check('period evidenceSource', g.evidenceSource === 'period_trends', g.evidenceSource);
  check(
    'period signals can diagnose decline/post-click',
    g.diagnoses.some((d) => d.code === 'POST_CLICK_PROBLEM' || d.code === 'DECLINING_OUTCOMES' || d.code === 'RISING_COST_PER_RESULT'),
    g.diagnoses.map((d) => d.code),
  );
  const tick = runBrainForCampaign(raw, baseline, undefined, { periodSignals });
  check(
    'brain tick carries period evidenceSource',
    tick.ruleGrounding?.evidenceSource === 'period_trends',
    tick.ruleGrounding?.evidenceSource,
  );
}

console.log(`\nrule grounding: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
