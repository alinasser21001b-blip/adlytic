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
import {
  aggregateSnapshots,
  buildCohortObjectives,
  filterSnapshotsForCohort,
  rollupObjectiveKey,
  windowCutoff,
  type SnapshotForRollup,
} from "./src/workers/rollupHistory";
import { HISTORY_OBJECTIVE_ALL } from "./src/types/campaignHistory";
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

console.log("\n── Rollup objective sentinel (§2.4) ──");
check(
  "null objective maps to __ALL__",
  rollupObjectiveKey(null) === HISTORY_OBJECTIVE_ALL,
);
check(
  "real objective unchanged",
  rollupObjectiveKey("MESSAGES") === "MESSAGES",
);

console.log("\n── Rollup window filtering (Q4: LAST_90D) ──");
const now = new Date("2026-06-28T12:00:00Z");
const snapshots: SnapshotForRollup[] = [
  {
    objective: "MESSAGES",
    finalRoas: 2.0,
    lifetimeSpendMinor: 1000n,
    revenueMinor: 2000n,
    messages: 10n,
    purchases: 1n,
    currency: "USD",
    currencyMinorFactor: 100,
    endedAt: new Date("2026-06-01T00:00:00Z"),
  },
  {
    objective: "REACH",
    finalRoas: 1.5,
    lifetimeSpendMinor: 500n,
    revenueMinor: 750n,
    messages: 0n,
    purchases: 0n,
    currency: "USD",
    currencyMinorFactor: 100,
    endedAt: new Date("2026-03-01T00:00:00Z"),
  },
  {
    objective: "MESSAGES",
    finalRoas: 0.8,
    lifetimeSpendMinor: 300n,
    revenueMinor: 240n,
    messages: 5n,
    purchases: 0n,
    currency: "USD",
    currencyMinorFactor: 100,
    endedAt: new Date("2026-06-20T00:00:00Z"),
  },
];

const allTimeMessages = filterSnapshotsForCohort(snapshots, "MESSAGES", "ALL_TIME", now);
check("ALL_TIME MESSAGES cohort count", allTimeMessages.length === 2, allTimeMessages.length);

const last90d = filterSnapshotsForCohort(snapshots, HISTORY_OBJECTIVE_ALL, "LAST_90D", now);
check("LAST_90D excludes March campaign", last90d.length === 2, last90d.length);

const last30d = filterSnapshotsForCohort(snapshots, HISTORY_OBJECTIVE_ALL, "LAST_30D", now);
check("LAST_30D only June campaigns", last30d.length === 2, last30d.length);

const cutoff90 = windowCutoff("LAST_90D", now)!;
check(
  "90d cutoff is ~90 days before now",
  Math.round((now.getTime() - cutoff90.getTime()) / 86_400_000) === 90,
);

console.log("\n── Rollup aggregation (H-6/H-7/H-10) ──");
const agg = aggregateSnapshots(allTimeMessages);
check("campaign count", agg.campaignCount === 2, agg.campaignCount);
check("total spend sums minor units", agg.totalSpendMinor === 1300n, agg.totalSpendMinor);
check("total revenue sums minor units", agg.totalRevenueMinor === 2240n, agg.totalRevenueMinor);
check("avgRoas is simple mean", agg.avgRoas === 1.4, agg.avgRoas);
check(
  "weightedRoas = revenue/spend (no re-scale)",
  agg.weightedRoas === 2240 / 1300,
  agg.weightedRoas,
);
check(
  "avgCostPerMsgMinor = totalSpend/totalMessages",
  agg.avgCostPerMsgMinor === 1300n / 15n,
  agg.avgCostPerMsgMinor,
);
check("dominant currency USD", agg.currency === "USD", agg.currency);

const cohorts = buildCohortObjectives(snapshots);
check(
  "cohorts include distinct objectives + __ALL__",
  cohorts.includes("MESSAGES") && cohorts.includes("REACH") && cohorts.includes(HISTORY_OBJECTIVE_ALL),
  cohorts,
);

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
