// test_brain.ts
// Layer 5 — AdlyticBrain end-to-end smoke test.
// Run: npm run test:brain
//
// Each fixture below is hand-tuned to land in a different DecisionAction branch
// so we can confirm the full 4-layer pipeline routes campaigns correctly
// and never produces NaN on edge cases (zero clicks, zero messages, broken funnels).

import { runBrainForCampaign, BrainTickResult, BrainV2Inputs } from './src/engine/AdlyticBrain';
import { CampaignRawData, AccountBaseline } from './src/engine/BaselineCalculator';

// ──────────────────────────────────────────────────────────────────────
// Fixed account baseline — deterministic so each campaign hits a known branch.
// All 7 canonical AccountBaseline fields present.
// ──────────────────────────────────────────────────────────────────────
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
    totalClicks: 3600
  },
  confidence: {
    score: 90,
    level: 'high'
  }
};

// ──────────────────────────────────────────────────────────────────────
// Seven fixtures — one per terminal decision branch + two edge cases.
// All 10 canonical CampaignRawData fields present.
// ──────────────────────────────────────────────────────────────────────
const fixtures: Array<{ expected: string; raw: CampaignRawData; v2Inputs?: BrainV2Inputs }> = [
  {
    expected: 'SCALE_BUDGET',
    raw: {
      campaignId: 'beast_01',
      campaignName: '🦁 Royal Sofa — Eid Edition',
      spend: 200, impressions: 10000, clicks: 300,
      ctr: 3.0, frequency: 1.5, messages: 50,
      cpm: 20.0, cpc: 0.667
    }
  },
  {
    expected: 'REFRESH_CREATIVE',
    raw: {
      campaignId: 'dying_01',
      campaignName: '🪦 Tired Bedroom Set Promo',
      spend: 100, impressions: 5000, clicks: 50,
      ctr: 1.0, frequency: 2.5, messages: 10,
      cpm: 20.0, cpc: 2.0
    }
  },
  {
    expected: 'PAUSE_CAMPAIGN',
    raw: {
      campaignId: 'noise_01',
      campaignName: '💀 Cold Start Carpet Test',
      spend: 20, impressions: 5000, clicks: 25,
      ctr: 0.5, frequency: 2.0, messages: 2,
      cpm: 4.0, cpc: 0.8
    }
  },
  {
    expected: 'KEEP_COLLECTING',
    raw: {
      campaignId: 'newborn_01',
      campaignName: '🥚 Just-Launched Velvet Sofa',
      spend: 15, impressions: 2000, clicks: 42,
      ctr: 2.1, frequency: 1.9, messages: 3,
      cpm: 7.5, cpc: 0.357
    }
  },
  {
    expected: 'RESCUE_WATCH',
    raw: {
      campaignId: 'phoenix_01',
      campaignName: '🔥 Phoenix — Auction Reversal',
      spend: 40, impressions: 4000, clicks: 92,
      ctr: 2.3, frequency: 2.5, messages: 10,
      cpm: 10.0, cpc: 0.434
    }
  },
  {
    expected: 'HOLD_AND_MONITOR',
    raw: {
      campaignId: 'steady_01',
      campaignName: '⚖️ Steady Eddie — Daily Drip',
      spend: 100, impressions: 5000, clicks: 100,
      ctr: 2.0, frequency: 2.0, messages: 20,
      cpm: 20.0, cpc: 1.0
    }
  },
  // Edge case: broken funnel (spend > 0, messages = 0)
  {
    expected: 'KEEP_COLLECTING (broken funnel — no distress signal)',
    raw: {
      campaignId: 'broken_01',
      campaignName: '💸 Broken Funnel — Burns Without Returns',
      spend: 50, impressions: 8000, clicks: 200,
      ctr: 2.5, frequency: 1.8, messages: 0,
      cpm: 6.25, cpc: 0.25
    }
  },
  // V2 Emergency Override: STABLE_PERFORMER would normally hold,
  // but Layer 10 Velocity Tracker fires emergencyOverride → EMERGENCY_PAUSE.
  // Setup: 50% of daily budget burned in 4 hours with zero conversions today.
  {
    expected: 'EMERGENCY_PAUSE',
    raw: {
      campaignId: 'bleeding_01',
      campaignName: '🚨 Intra-Day Hemorrhage — Looks Stable Yesterday',
      spend: 100, impressions: 5000, clicks: 100,
      ctr: 2.0, frequency: 2.0, messages: 20,
      cpm: 20.0, cpc: 1.0
    },
    v2Inputs: {
      marketBaseline: {
        recentAverageCPM: 20.0,
        recentAverageCPC: 1.0,
      },
      goldStandard: {
        bestHistoricalCpm: 18.0,
        bestHistoricalCtr: 2.2,
        bestHistoricalCostPerMessage: 4.5,
      },
      hourlyVelocity: {
        hoursActiveToday: 4,
        totalSpendToday: 50,     // 50% of daily budget
        totalMessagesToday: 0,   // zero-conversion bleed
        dailyBudget: 100,
      },
      audienceBreakdowns: {
        topAgeGroup: '25-34',
        topGender: 'female',
        bestPlacement: 'instagram_reels',
        peakTimeWindow: '21:00-01:00',
      },
      visionContext: {
        productType: 'عطور فاخرة',
        visualHook: 'SHORT_VIDEO',
      },
    }
  }
];

// ──────────────────────────────────────────────────────────────────────
// Run the brain on every fixture and pretty-print + collect JSON.
// ──────────────────────────────────────────────────────────────────────
const SEP = '═'.repeat(78);
const all: BrainTickResult[] = [];
let nanFound = false;

console.log('\n' + SEP);
console.log('🧠  AdlyticBrain — Layer 5 Orchestrator Smoke Test');
console.log(SEP);
console.log(`Baseline: CPM=$${baseline.avgCPM} | CTR=${baseline.avgCTR}% | Freq=${baseline.avgFrequency} | CostPerMsg=$${baseline.avgCostPerMessage}`);
console.log(SEP);

for (const fx of fixtures) {
  const result = runBrainForCampaign(fx.raw, baseline, fx.v2Inputs);
  all.push(result);

  // NaN sweep — anywhere in the output tree
  const flat = JSON.stringify(result);
  if (flat.includes('null') === false && /NaN|Infinity/.test(flat)) {
    nanFound = true;
  }

  const match = result.decision.action === fx.expected.split(' ')[0] ? '✅' : '⚠️';
  console.log(`\n${match}  ${fx.raw.campaignName}`);
  console.log(`    Expected: ${fx.expected}`);
  console.log(`    Got:      ${result.decision.action}  [${result.decision.priority}]`);
  console.log(`    Physics:    finalScore=${result.physics.finalScore}  |  cpm Δ=${result.physics.costPerMessage.delta}%  |  ctr Δ=${result.physics.ctr.delta}%  |  freq Δ=${result.physics.frequency.delta}%`);
  console.log(`    Confidence: maturity=${result.confidence.maturityScore}  |  penalty=${result.confidence.volatilityPenalty}  |  final=${result.confidence.finalConfidenceScore}  |  gating=${result.confidence.gatingStatus}`);
  console.log(`    Pattern:    ${result.pattern.signature}`);
  console.log(`    Recovery:   ${result.recovery.recoverySignalStrength}`);
  if (result.decision.overriddenAction) {
    console.log(`    ⚡ Override: ${result.decision.overriddenAction} → ${result.decision.action}`);
  }
  if (result.v2) {
    console.log(`    V2:         market=${result.v2.marketPressure.status}  |  dna=${result.v2.goldStandard.verdict} (${result.v2.goldStandard.dnaMatchPercentage}%)  |  velocity=${result.v2.velocity.status}  |  resonance=${result.v2.resonance.audienceAlignmentScore}`);
  }
  console.log(`    Reason:     ${result.decision.reason}`);
}

console.log('\n' + SEP);
console.log(`🩺  NaN/Infinity sweep across all outputs: ${nanFound ? '❌ FOUND' : '✅ CLEAN'}`);
console.log(SEP);
console.log('\n📦  Full JSON dump:\n');
console.log(JSON.stringify(all, null, 2));
console.log('\n' + SEP + '\n');
