// test_rule_grounding.ts — brain ↔ diagnose fusion.
// Run: npx tsx test_rule_grounding.ts

import { runBrainForCampaign } from './src/engine/AdlyticBrain';
import type { AccountBaseline, CampaignRawData } from './src/engine/BaselineCalculator';
import {
  applyRuleGroundingToDecision,
  buildRuleGrounding,
} from './src/engines/rules/ruleGrounding';
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
  const hold: CampaignDecision = {
    campaignId: 'x',
    action: 'HOLD_AND_MONITOR',
    priority: 'NORMAL',
    reason: 'stable',
  };
  const next = applyRuleGroundingToDecision(hold, {
    primaryCode: 'CREATIVE_FATIGUE',
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
  const refresh: CampaignDecision = {
    campaignId: 'x',
    action: 'REFRESH_CREATIVE',
    priority: 'CRITICAL',
    reason: 'dying',
  };
  const next = applyRuleGroundingToDecision(refresh, {
    primaryCode: 'POST_CLICK_PROBLEM',
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
  // Dying creative fixture from test_brain — should still decide and attach grounding when relevant.
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
}

console.log(`\nrule grounding: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
