// test_historical.ts — Final Freeze + historical read path unit tests (no DB).
// Run: npx tsx test_historical.ts

import { mapMetaInsight } from "./src/mappers/insightMapper";
import type { MetaInsightRow } from "./src/services/metaClient";
import {
  snapshotMonetaryFieldsFromInsight,
  costPerMessageFromTotals,
} from "./src/lib/campaignFreeze";
import { shouldTriggerCampaignFreeze } from "./src/workers/syncAccount";
import { deriveKeyTrait, deriveLessonArabic } from "./src/services/getCampaignHistory";
import { EntityStatus } from "@prisma/client";
import { buildPayload, generateMerchantNarration } from "./src/services/ClaudeCMO";
import type { BrainTickResult } from "./src/engine/AdlyticBrain";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

console.log("\n── ROAS factor invariance (H-7) ──");
const roasRow: MetaInsightRow = {
  date_start: "2026-06-01",
  spend: "100.00",
  purchase_roas: [{ action_type: "omni_purchase", value: "2.5000" }],
  action_values: [{ action_type: "omni_purchase", value: "250.00" }],
};
const usdInsight = mapMetaInsight(roasRow, { currencyMinorFactor: 100 });
const iqdInsight = mapMetaInsight(
  { ...roasRow, spend: "100000" },
  { currencyMinorFactor: 1 },
);
check("USD ROAS from Meta attribution", usdInsight.roas === 2.5, usdInsight.roas);
check("IQD ROAS identical ratio shape", iqdInsight.roas === 2.5, iqdInsight.roas);

const usdSnap = snapshotMonetaryFieldsFromInsight(usdInsight, 100);
const iqdSnap = snapshotMonetaryFieldsFromInsight(iqdInsight, 1);
check("USD spend scaled to minor", usdSnap.lifetimeSpendMinor === 10000n, usdSnap.lifetimeSpendMinor);
check("IQD spend Math.round ×1", iqdSnap.lifetimeSpendMinor === 100000n, iqdSnap.lifetimeSpendMinor);
check("ROAS never re-scaled in snapshot", usdSnap.finalRoas === iqdSnap.finalRoas, {
  usd: usdSnap.finalRoas,
  iqd: iqdSnap.finalRoas,
});

console.log("\n── Freeze trigger detection (H-1) ──");

check(
  "ACTIVE→PAUSED triggers freeze",
  shouldTriggerCampaignFreeze({
    priorStatus: EntityStatus.ACTIVE,
    newStatus: EntityStatus.PAUSED,
  }),
);
check(
  "ACTIVE→ARCHIVED triggers freeze",
  shouldTriggerCampaignFreeze({
    priorStatus: EntityStatus.ACTIVE,
    newStatus: EntityStatus.ARCHIVED,
  }),
);
check(
  "ACTIVE stays ACTIVE — no freeze",
  !shouldTriggerCampaignFreeze({
    priorStatus: EntityStatus.ACTIVE,
    newStatus: EntityStatus.ACTIVE,
  }),
);
check(
  "PAUSED stays PAUSED — no freeze (Q1: date-elapsed deferred)",
  !shouldTriggerCampaignFreeze({
    priorStatus: EntityStatus.PAUSED,
    newStatus: EntityStatus.PAUSED,
  }),
);
check(
  "terminal without prior ACTIVE — no freeze",
  !shouldTriggerCampaignFreeze({
    priorStatus: EntityStatus.PAUSED,
    newStatus: EntityStatus.ARCHIVED,
  }),
);

console.log("\n── costPerMessage helper ──");
check(
  "cost per message from totals",
  costPerMessageFromTotals(1000n, 10n) === 100,
  costPerMessageFromTotals(1000n, 10n),
);
check(
  "zero messages → null",
  costPerMessageFromTotals(1000n, 0n) === null,
);

console.log("\n── History trait / lesson derivation ──");
const past = new Date("2026-06-20T12:00:00Z");
const topRow = {
  id: "1",
  campaignId: "c1",
  name: "Winner",
  objective: "MESSAGES",
  finalStatus: "PAUSED",
  endedAt: past,
  finalRoas: 2.1,
  lifetimeSpendMinor: 5000n,
  messages: 50n,
  finalBrainJson: { patternSignature: "SCALABLE_BEAST", action: "SCALE_BUDGET" },
  breakdownJson: null,
  creativeJson: null,
};
const failRow = {
  ...topRow,
  name: "Loser",
  finalRoas: 0.4,
  finalBrainJson: { patternSignature: "DYING_CREATIVE", action: "PAUSE_CAMPAIGN" },
};
check("keyTrait mentions scalability", deriveKeyTrait(topRow).includes("توسع"));
check("lessonArabic for PAUSE verdict", deriveLessonArabic(failRow).includes("توقفت"));

console.log("\n── CmoPayload byte-identical without history (H-5) ──");
const minimalBrain = {
  campaignId: "ext_1",
  campaignName: "Test Campaign",
  physics: {
    finalScore: 70,
    costPerMessage: { value: 1.2, baseline: 1.0, delta: 20 },
    ctr: { value: 2.0, baseline: 1.8, delta: 11 },
    frequency: { value: 1.5, baseline: 1.4, delta: 7 },
  },
  confidence: { finalConfidenceScore: 80, gatingStatus: "READY" as const },
  pattern: { signature: "STABLE_PERFORMER" as const },
  recovery: { recoverySignalStrength: "NONE" as const },
  decision: {
    action: "HOLD_AND_MONITOR" as const,
    priority: "NORMAL" as const,
    reason: "stable",
  },
} as BrainTickResult;

const baselinePayloadJson = JSON.stringify(buildPayload(minimalBrain));
check(
  "buildPayload has no history key",
  !baselinePayloadJson.includes('"history"'),
);

console.log("\n── generateMerchantNarration history optional ──");
(async () => {
  let llmCalled = false;
  let payloadWithoutHistory = "";
  const mockLlm = async (_sys: string, user: string) => {
    llmCalled = true;
    payloadWithoutHistory = user;
    return JSON.stringify({
      arabicTitle: "عنوان",
      arabicNarration: "نص",
    });
  };

  await generateMerchantNarration(minimalBrain, mockLlm);
  check("LLM path works without history", llmCalled);
  check(
    "payload without history matches buildPayload",
    JSON.stringify(JSON.parse(payloadWithoutHistory)) === baselinePayloadJson,
  );

  let capturedPayload = "";
  const captureLlm = async (_sys: string, user: string) => {
    capturedPayload = user;
    return JSON.stringify({ arabicTitle: "ع", arabicNarration: "ن" });
  };
  await generateMerchantNarration(minimalBrain, captureLlm, {
    topPerformers: [{
      name: "Old Winner",
      objective: "MESSAGES",
      finalRoas: 2.0,
      costPerMessage: 0.9,
      keyTrait: "أداء قوي",
    }],
    recentFailures: [],
  });
  check("history injected when provided", capturedPayload.includes("Old Winner"));
  check("history block present in payload", capturedPayload.includes('"history"'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
