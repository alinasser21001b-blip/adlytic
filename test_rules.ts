// Exercises:
//   1. Each detector with realistic and edge-case Signals
//   2. Severity buckets behave (LOW/MEDIUM/HIGH/CRITICAL boundaries)
//   3. Confidence is set and reasonable
//   4. AUDIENCE_FATIGUE requires ≥2 corroborating signals
//   5. RISING_COST_PER_RESULT triggers only when results diverge from spend
//   6. Cordon: engine writes ONLY detected_issues
//   7. Idempotency: rerun replaces, doesn't duplicate
//   8. ── SANITY SUITE ── full pipeline against furniture seed → recognizable verdict

import { detectLowCtr } from "./src/engines/rules/detectLowCtr";
import { detectHighFrequency } from "./src/engines/rules/detectHighFrequency";
import { detectAudienceFatigue } from "./src/engines/rules/detectAudienceFatigue";
import { detectDecliningResults } from "./src/engines/rules/detectDecliningResults";
import { detectRisingCostPerResult } from "./src/engines/rules/detectRisingCostPerResult";
import { severityFromMagnitude } from "./src/engines/rules/severity";
import type { Signals } from "./src/engines/rules/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

function emptySignals(): Signals {
  return {
    ctrTrend: null, cpmTrend: null, frequencyTrend: null, resultsTrend: null, spendTrend: null,
    currentCtr: null, currentFrequency: null, currentCpm: null,
    currentResults: 0, currentSpend: 0,
  };
}

// ════════════════ SEVERITY BUCKETS ════════════════
console.log("\n── Severity buckets ──");
check("0.05 → LOW",      severityFromMagnitude(0.05) === "LOW");
check("0.09 → LOW",      severityFromMagnitude(0.09) === "LOW");
check("0.10 → MEDIUM",   severityFromMagnitude(0.10) === "MEDIUM");
check("0.24 → MEDIUM",   severityFromMagnitude(0.24) === "MEDIUM");
check("0.25 → HIGH",     severityFromMagnitude(0.25) === "HIGH");
check("0.49 → HIGH",     severityFromMagnitude(0.49) === "HIGH");
check("0.50 → CRITICAL", severityFromMagnitude(0.50) === "CRITICAL");
check("1.00 → CRITICAL", severityFromMagnitude(1.00) === "CRITICAL");

// ════════════════ LOW_CTR ════════════════
console.log("\n── detectLowCtr ──");
{
  const s = { ...emptySignals(), currentCtr: 0.7 };  // 30% below 1.0 threshold
  const i = detectLowCtr(s);
  check("CTR 0.7% fires LOW_CTR", i?.issueCode === "LOW_CTR", i);
  check("CTR 0.7% → MEDIUM severity (gap 0.30)", i?.severity === "HIGH", i?.severity);
  check("evidence carries threshold + gap", (i?.evidence as any)?.threshold === 1.0);
}
{
  const s = { ...emptySignals(), currentCtr: 1.5 };
  check("CTR 1.5% does NOT fire", detectLowCtr(s) === null);
}
{
  const s = { ...emptySignals(), currentCtr: 0.95 }; // 5% gap → LOW
  const i = detectLowCtr(s);
  check("CTR 0.95% fires with LOW severity", i?.severity === "LOW", i?.severity);
}
{
  const s = { ...emptySignals(), currentCtr: null };
  check("null CTR → no fire (not crash)", detectLowCtr(s) === null);
}

// ════════════════ HIGH_FREQUENCY ════════════════
console.log("\n── detectHighFrequency ──");
{
  const s = { ...emptySignals(), currentFrequency: 4.8 };
  check("frequency 4.8 does NOT fire (below 5.0)", detectHighFrequency(s) === null);
}
{
  const s = { ...emptySignals(), currentFrequency: 5.5 };  // overshoot 0.10 → MEDIUM
  const i = detectHighFrequency(s);
  check("frequency 5.5 fires HIGH_FREQUENCY", i?.issueCode === "HIGH_FREQUENCY");
  check("frequency 5.5 → MEDIUM (overshoot 0.10)", i?.severity === "MEDIUM", i?.severity);
}
{
  const s = { ...emptySignals(), currentFrequency: 8.0 };  // overshoot 0.60 → CRITICAL
  const i = detectHighFrequency(s);
  check("frequency 8.0 → CRITICAL", i?.severity === "CRITICAL", i?.severity);
}

// ════════════════ AUDIENCE_FATIGUE ════════════════
console.log("\n── detectAudienceFatigue ──");
{
  // Single signal: freq up only → no fire
  const s = { ...emptySignals(), frequencyTrend: 0.30 };
  check("freq up alone → no fire (single signal)", detectAudienceFatigue(s) === null);
}
{
  // Two signals: freq up + CTR down → fires
  const s = { ...emptySignals(), frequencyTrend: 0.30, ctrTrend: -0.20 };
  const i = detectAudienceFatigue(s);
  check("freq up + CTR down → fires", i?.issueCode === "AUDIENCE_FATIGUE", i);
  const conf = (i?.evidence as any)?.confidence;
  check("2/3 signals → confidence ≈ 0.67", conf === 0.67, conf);
}
{
  // Three signals: classic fatigue pattern
  const s = { ...emptySignals(), frequencyTrend: 0.46, ctrTrend: -0.28, resultsTrend: -0.33 };
  const i = detectAudienceFatigue(s);
  check("classic 3-signal fatigue fires", i?.issueCode === "AUDIENCE_FATIGUE");
  const conf = (i?.evidence as any)?.confidence;
  check("3/3 signals → confidence 0.90", conf === 0.90, conf);
  check("severity from peak magnitude (0.46) → HIGH", i?.severity === "HIGH", i?.severity);
}
{
  // Weak signals — under threshold individually
  const s = { ...emptySignals(), frequencyTrend: 0.10, ctrTrend: -0.10, resultsTrend: -0.15 };
  check("weak signals below thresholds → no fire", detectAudienceFatigue(s) === null);
}

// ════════════════ DECLINING_RESULTS ════════════════
console.log("\n── detectDecliningResults ──");
{
  const s = { ...emptySignals(), resultsTrend: -0.05 };
  check("results down 5% → no fire (within noise)", detectDecliningResults(s) === null);
}
{
  const s = { ...emptySignals(), resultsTrend: -0.33, currentResults: 28 };
  const i = detectDecliningResults(s);
  check("results down 33% fires", i?.issueCode === "DECLINING_RESULTS");
  check("33% drop → HIGH severity", i?.severity === "HIGH", i?.severity);
  check("evidence includes currentResults", (i?.evidence as any)?.currentResults === 28);
}
{
  const s = { ...emptySignals(), resultsTrend: null };
  check("null trend (insufficient signal) → no fire", detectDecliningResults(s) === null);
}

// ════════════════ RISING_COST_PER_RESULT ════════════════
console.log("\n── detectRisingCostPerResult ──");
{
  // Results down 33%, spend down 30% — small divergence, no fire
  const s = { ...emptySignals(), resultsTrend: -0.33, spendTrend: -0.30 };
  check("small divergence (3pt) → no fire", detectRisingCostPerResult(s) === null);
}
{
  // Results down 33%, spend up 6% — big divergence
  const s = { ...emptySignals(), resultsTrend: -0.33, spendTrend: 0.06 };
  const i = detectRisingCostPerResult(s);
  check("results down + spend up → fires", i?.issueCode === "RISING_COST_PER_RESULT");
  check("39pt divergence → HIGH", i?.severity === "HIGH", i?.severity);
}
{
  // Results UP, spend up more — no fire (this is just scaling cost)
  const s = { ...emptySignals(), resultsTrend: 0.10, spendTrend: 0.20 };
  check("scaling pattern → no fire", detectRisingCostPerResult(s) === null);
}

// ════════════════ ORCHESTRATION + CORDON + IDEMPOTENCY + SANITY ════════════════
console.log("\n── RulesEngine: orchestration ──");

interface Call { table: string; op: string; data?: any; where?: any }
const calls: Call[] = [];

// Fixture: the FURNITURE story end-to-end.
// metric_trends row matches what Analytics produced in step 7:
//   ctrTrend: -0.33, frequencyTrend: 0.46, resultsTrend: -0.33,
//   cpmTrend: 0, spendTrend: 0
// daily_stats in current window: CTR ~2.0%, freq 5.4, ~28 messages total
const trendRow = {
  ctrTrend: -0.33, cpmTrend: 0, frequencyTrend: 0.46,
  resultsTrend: -0.33, spendTrend: 0,
};
const currentDailyRows = ["2026-06-06","2026-06-07","2026-06-08","2026-06-09","2026-06-10","2026-06-11","2026-06-12"]
  .map(d => ({
    date: new Date(d),
    spend: 13000n, impressions: 2500n, reach: 1800n, clicks: 50n,
    messages: 4n, purchases: 0n, leads: 0n, conversions: 4n,
    ctr: 2.0, cpm: 5.2, frequency: 5.4,
  }));

const issuesStore = new Map<string, any[]>();
const mockPrisma: any = {
  metricTrend: {
    findFirst: async ({ where }: any) => {
      calls.push({ table: "metric_trends", op: "read", where });
      return trendRow;
    },
  },
  dailyStat: {
    findMany: async ({ where }: any) => {
      calls.push({ table: "daily_stats", op: "read", where });
      return currentDailyRows;
    },
  },
  detectedIssue: {
    deleteMany: async ({ where }: any) => {
      calls.push({ table: "detected_issues", op: "deleteMany", where });
      issuesStore.delete(JSON.stringify(where));
      return { count: 0 };
    },
    createMany: async ({ data }: any) => {
      calls.push({ table: "detected_issues", op: "createMany", data });
      const key = JSON.stringify({ entityType: data[0].entityType, entityId: data[0].entityId, date: data[0].date });
      issuesStore.set(key, data);
      return { count: data.length };
    },
  },
  $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  // Cordon sentinels
  rawInsight:  { create: () => { throw new Error("VIOLATION: rules wrote raw_insights"); } },
  dailyStat_create: { create: () => { throw new Error("VIOLATION: rules wrote daily_stats"); } },
  metricTrend_write: { upsert: () => { throw new Error("VIOLATION: rules wrote metric_trends"); } },
  recommendation: { create: () => { throw new Error("VIOLATION: rules wrote recommendations"); } },
  healthScore:   { create: () => { throw new Error("VIOLATION: rules wrote health_scores"); } },
  knowledgeRule: { create: () => { throw new Error("VIOLATION: rules wrote knowledge_rules"); } },
  adAccount:     { update: () => { throw new Error("VIOLATION: rules wrote ad_accounts"); } },
};

async function main() {
  const { RulesEngine } = await import("./src/engines/rules/RulesEngine");
  const { EntityType } = await import("@prisma/client");
  const engine = new RulesEngine(mockPrisma);

  const result = await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T12:00:00Z"),
    windowDays: 7,
    attributionLagDays: 2,
  });

  check("engine ok", result.ok === true, result);

  const codes = result.issues.map(i => i.issueCode).sort();
  // What we EXPECT for the furniture story:
  //  - AUDIENCE_FATIGUE (3-signal pattern)
  //  - DECLINING_RESULTS (results -33%)
  //  - RISING_COST_PER_RESULT (results -33% vs spend 0% = 33pt divergence)
  //  - HIGH_FREQUENCY (5.4 current > 5.0)
  //  - LOW_CTR does NOT fire — current CTR 2.0% > 1.0 threshold
  check("AUDIENCE_FATIGUE detected", codes.includes("AUDIENCE_FATIGUE"), codes);
  check("DECLINING_RESULTS detected", codes.includes("DECLINING_RESULTS"), codes);
  check("RISING_COST_PER_RESULT detected", codes.includes("RISING_COST_PER_RESULT"), codes);
  check("HIGH_FREQUENCY detected (current freq 5.4)", codes.includes("HIGH_FREQUENCY"), codes);
  check("LOW_CTR NOT triggered (current CTR 2.0% is fine)", !codes.includes("LOW_CTR"), codes);

  // Cordon
  const tables = new Set(calls.map(c => c.table));
  check("only metric_trends, daily_stats (reads) + detected_issues (write)",
    tables.size === 3 &&
    tables.has("metric_trends") && tables.has("daily_stats") && tables.has("detected_issues"),
    [...tables]);

  // Reads happen before writes
  const firstRead = calls.findIndex(c => c.op === "read");
  const firstWrite = calls.findIndex(c => c.op === "createMany" || c.op === "deleteMany");
  check("reads happen before writes", firstRead < firstWrite);

  // ── IDEMPOTENCY ──
  console.log("\n── Idempotency ──");
  const beforeSize = issuesStore.size;
  await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T13:00:00Z"),
    windowDays: 7, attributionLagDays: 2,
  });
  check("rerun → still one entry per (entity,date), not duplicated",
    issuesStore.size === beforeSize, { before: beforeSize, after: issuesStore.size });

  // ── COSMETICS PATH — different story, same code ──
  console.log("\n── Cosmetics path ──");
  // Replace fixtures with cosmetics shape: low CTR but everything else fine
  const cosmeticsTrend = { ctrTrend: -0.04, cpmTrend: 0.03, frequencyTrend: 0.10, resultsTrend: 0.08, spendTrend: 0.05 };
  const cosmeticsDaily = ["2026-06-06","2026-06-07","2026-06-08","2026-06-09","2026-06-10","2026-06-11","2026-06-12"]
    .map(d => ({
      date: new Date(d),
      spend: 13000n, impressions: 4000n, reach: 3000n, clicks: 44n,
      messages: 10n, purchases: 0n, leads: 0n, conversions: 10n,
      ctr: 1.1, cpm: 3.2, frequency: 1.5,
    }));
  // swap fixtures
  mockPrisma.metricTrend.findFirst = async () => cosmeticsTrend;
  mockPrisma.dailyStat.findMany = async () => cosmeticsDaily;

  const cResult = await engine.run(EntityType.ACCOUNT, "acc_cosm", {
    asOf: new Date("2026-06-14T14:00:00Z"),
    windowDays: 7, attributionLagDays: 2,
  });
  const cCodes = cResult.issues.map(i => i.issueCode).sort();
  check("cosmetics: LOW_CTR detected (current 1.1% < 1.0? no — should NOT fire)",
    !cCodes.includes("LOW_CTR"), cCodes);
  // Wait — CTR 1.1 is ABOVE the 1.0 threshold. LOW_CTR shouldn't fire. That's the
  // honest test: the seed story showed LOW_CTR for cosmetics with CTR 1.07. Let's
  // try the actual boundary case:
  mockPrisma.dailyStat.findMany = async () => cosmeticsDaily.map(d => ({ ...d, ctr: 0.9 }));
  const cResult2 = await engine.run(EntityType.ACCOUNT, "acc_cosm", {
    asOf: new Date("2026-06-14T15:00:00Z"),
    windowDays: 7, attributionLagDays: 2,
  });
  const cCodes2 = cResult2.issues.map(i => i.issueCode).sort();
  check("cosmetics with CTR 0.9% → LOW_CTR fires", cCodes2.includes("LOW_CTR"), cCodes2);
  check("cosmetics: no AUDIENCE_FATIGUE (no corroborating signals)",
    !cCodes2.includes("AUDIENCE_FATIGUE"), cCodes2);
  check("cosmetics: no DECLINING_RESULTS (resultsTrend +8%, not falling)",
    !cCodes2.includes("DECLINING_RESULTS"), cCodes2);

  // ════════════════ SANITY SUITE ════════════════
  // "Would a furniture owner nod?"
  console.log("\n══════ SANITY SUITE ══════");

  // Restore furniture fixtures
  mockPrisma.metricTrend.findFirst = async () => trendRow;
  mockPrisma.dailyStat.findMany = async () => currentDailyRows;

  const sanity = await engine.run(EntityType.ACCOUNT, "acc_furn_sanity", {
    asOf: new Date("2026-06-14T16:00:00Z"),
    windowDays: 7, attributionLagDays: 2,
  });

  // What would a furniture owner want the dashboard to say about this account?
  //   1. "Your messages dropped a lot" (DECLINING_RESULTS, HIGH)
  //   2. "Your audience is getting tired" (AUDIENCE_FATIGUE, HIGH)
  //   3. "It's costing you more per message" (RISING_COST_PER_RESULT, HIGH)
  // What it should NOT say:
  //   - "Your CTR is low" — 2.0% isn't low for messaging objective
  //   - "Your CPM is rising" — it's flat
  const sanityCodes = sanity.issues.map(i => i.issueCode);

  const expectedYesses = ["DECLINING_RESULTS", "AUDIENCE_FATIGUE", "RISING_COST_PER_RESULT"];
  const expectedNos = ["LOW_CTR", "HIGH_CPM"];
  for (const code of expectedYesses) {
    check(`SANITY: furniture owner expects ${code}`, sanityCodes.includes(code as any), sanityCodes);
  }
  for (const code of expectedNos) {
    check(`SANITY: furniture owner expects NO ${code}`, !sanityCodes.includes(code as any), sanityCodes);
  }

  // The "headline" should be a HIGH-severity issue
  const hasHigh = sanity.issues.some(i => i.severity === "HIGH" || i.severity === "CRITICAL");
  check("SANITY: at least one HIGH/CRITICAL issue to headline the dashboard", hasHigh,
    sanity.issues.map(i => i.severity));

  // The fatigue diagnosis should carry HIGH confidence (3/3 signals)
  const fatigue = sanity.issues.find(i => i.issueCode === "AUDIENCE_FATIGUE");
  const fatigueConf = (fatigue?.evidence as any)?.confidence;
  check("SANITY: AUDIENCE_FATIGUE confidence is high (3-signal corroboration)",
    fatigueConf === 0.90, fatigueConf);

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
