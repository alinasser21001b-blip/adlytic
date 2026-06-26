// test_cmo_prompt.ts
// Smoke test for Claude CMO — Layer 7.
// Run: npx tsx test_cmo_prompt.ts
//
// Goal: see the exact System Prompt + Payload that will hit the LLM
// before the production wire-up, and verify the EMERGENCY short-circuit
// behaves correctly without any network call.

import { generateMerchantNarration } from './src/services/ClaudeCMO';
import { runBrainForCampaign, BrainV2Inputs } from './src/engine/AdlyticBrain';
import { CampaignRawData, AccountBaseline } from './src/engine/BaselineCalculator';

// ──────────────────────────────────────────────────────────────────────
// Fixed deterministic baseline (matches test_brain.ts).
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
    totalClicks: 3600,
  },
  confidence: { score: 90, level: 'high' },
};

// ──────────────────────────────────────────────────────────────────────
// Mock llmClientCall — prints the prompt + payload, then returns
// a fake JSON response so the parser path executes end-to-end.
// ──────────────────────────────────────────────────────────────────────
const SEP = '─'.repeat(78);

function makeMockLlm(label: string) {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    console.log(`\n${SEP}`);
    console.log(`📨  LLM CALL — ${label}`);
    console.log(SEP);
    console.log('\n── SYSTEM PROMPT ──────────────────────────────────────────────────────────');
    console.log(systemPrompt);
    console.log('\n── USER PROMPT (payload) ──────────────────────────────────────────────────');
    console.log(userPrompt);
    console.log(SEP + '\n');

    // Fake well-formed JSON the parser can ingest.
    return JSON.stringify({
      arabicTitle: '[mock] عنوان تجريبي',
      arabicNarration: '[mock] هذا نص تجريبي يحاكي ما سيُرجعه النموذج اللغوي.',
      creativeDirective: '[mock] توجيه إبداعي وهمي للتأكد من استلام الحقل.',
    });
  };
}

// Mock that NEVER gets called — used for the EMERGENCY short-circuit case.
const exploderLlm = async (): Promise<string> => {
  throw new Error('🚨 LLM was called during EMERGENCY_PAUSE — short-circuit FAILED!');
};

// ──────────────────────────────────────────────────────────────────────
// Three representative scenarios.
// ──────────────────────────────────────────────────────────────────────

// (A) V1-only — no V2 inputs, classic Layer 7 path.
const scenarioA_raw: CampaignRawData = {
  campaignId: 'cmo_v1_01',
  campaignName: '⚖️ V1-only Steady Performer',
  spend: 100, impressions: 5000, clicks: 100,
  ctr: 2.0, frequency: 2.0, messages: 20,
  cpm: 20.0, cpc: 1.0,
};

// (B) V2 enriched — full Layers 8-11 data, normal LLM path.
const scenarioB_raw: CampaignRawData = {
  campaignId: 'cmo_v2_beast_01',
  campaignName: '🦁 V2 Scalable Beast — Royal Sofa',
  spend: 200, impressions: 10000, clicks: 300,
  ctr: 3.0, frequency: 1.5, messages: 50,
  cpm: 20.0, cpc: 0.667,
};
const scenarioB_v2: BrainV2Inputs = {
  marketBaseline: { recentAverageCPM: 22.0, recentAverageCPC: 0.7 },
  goldStandard: {
    bestHistoricalCpm: 18.0,
    bestHistoricalCtr: 3.2,
    bestHistoricalCostPerMessage: 4.0,
  },
  hourlyVelocity: {
    hoursActiveToday: 6,
    totalSpendToday: 60,
    totalMessagesToday: 15,
    dailyBudget: 150,
  },
  audienceBreakdowns: {
    topAgeGroup: '25-34',
    topGender: 'female',
    bestPlacement: 'instagram_reels',
    peakTimeWindow: '21:00-01:00',
  },
  visionContext: {
    productType: 'أثاث منزلي فاخر',
    visualHook: 'SHORT_VIDEO',
  },
};

// (C) EMERGENCY_PAUSE — must short-circuit, exploder must NOT be called.
const scenarioC_raw: CampaignRawData = {
  campaignId: 'cmo_emerg_01',
  campaignName: '🚨 V2 Intra-Day Hemorrhage',
  spend: 100, impressions: 5000, clicks: 100,
  ctr: 2.0, frequency: 2.0, messages: 20,
  cpm: 20.0, cpc: 1.0,
};
const scenarioC_v2: BrainV2Inputs = {
  marketBaseline: { recentAverageCPM: 20.0, recentAverageCPC: 1.0 },
  goldStandard: {
    bestHistoricalCpm: 18.0,
    bestHistoricalCtr: 2.2,
    bestHistoricalCostPerMessage: 4.5,
  },
  hourlyVelocity: {
    hoursActiveToday: 4,
    totalSpendToday: 50,
    totalMessagesToday: 0,
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
};

// ──────────────────────────────────────────────────────────────────────
// Driver
// ──────────────────────────────────────────────────────────────────────
async function main() {
  const HEADER = '═'.repeat(78);
  console.log('\n' + HEADER);
  console.log('🧪  Claude CMO — Layer 7 Smoke Test');
  console.log(HEADER);

  // ── Scenario A: V1-only ───────────────────────────────────────────────
  const brainA = runBrainForCampaign(scenarioA_raw, baseline);
  const outA = await generateMerchantNarration(brainA, makeMockLlm('Scenario A — V1-only'));
  console.log('\n📤  OUTPUT A:');
  console.log(JSON.stringify(outA, null, 2));

  // ── Scenario B: V2 enriched ───────────────────────────────────────────
  const brainB = runBrainForCampaign(scenarioB_raw, baseline, scenarioB_v2);
  const outB = await generateMerchantNarration(brainB, makeMockLlm('Scenario B — V2 enriched'));
  console.log('\n📤  OUTPUT B:');
  console.log(JSON.stringify(outB, null, 2));

  // ── Scenario C: EMERGENCY_PAUSE short-circuit ─────────────────────────
  const brainC = runBrainForCampaign(scenarioC_raw, baseline, scenarioC_v2);
  console.log(`\n${SEP}`);
  console.log(`🚨  Scenario C — decision=${brainC.decision.action} (LLM must NOT be called)`);
  console.log(SEP);
  const outC = await generateMerchantNarration(brainC, exploderLlm);
  console.log('\n📤  OUTPUT C (deterministic template):');
  console.log(JSON.stringify(outC, null, 2));

  console.log('\n' + HEADER);
  console.log('✅  Smoke test complete.');
  console.log(HEADER + '\n');
}

main().catch(err => {
  console.error('❌ Smoke test failed:', err);
  process.exit(1);
});
