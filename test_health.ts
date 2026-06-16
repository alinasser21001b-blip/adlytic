// Exercises:
//   1. Each facet correctness (pure functions, no I/O)
//   2. Composition: weights sum to 100, weighted sum = total
//   3. Breakdown is FULLY persisted — every facet's score, weight,
//      weighted contribution, and evidence
//   4. Versioning: algorithmVersion is in every breakdown + every row
//   5. Cordon: writes ONLY health_scores
//   6. Idempotency: rerun on same (entity, date, version) converges
//   7. SANITY: accept whatever score furniture gets — don't tune.
//      Just verify it's "legibly low" given the inputs.

import { scoreCtr, scoreFrequency, scoreCpm, scoreTrend } from "./src/engines/health/facets";
import { composeBreakdown, WEIGHTS, HEALTH_ALGORITHM_VERSION } from "./src/engines/health/HealthScoreEngine";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

// ════════════════ FACETS ════════════════
console.log("\n── scoreCtr ──");
{
  const r = scoreCtr(null);
  check("null CTR → neutral 50, marked as no-data", r.score === 50 && (r.evidence as any).note);
}
{
  const r = scoreCtr(2.0);
  check("CTR 2.0% (mid-range) → between 50 and 80", r.score > 50 && r.score < 80, r);
}
{
  const r = scoreCtr(0.4);
  check("CTR 0.4% (below floor) → 0", r.score === 0, r);
}
{
  const r = scoreCtr(3.5);
  check("CTR 3.5% (above ceiling) → capped at 95", r.score === 95, r);
}

console.log("\n── scoreFrequency ──");
{
  check("freq 2.5 → ~95 (ideal)", scoreFrequency(2.5).score === 95);
  check("freq 5.0 → 50 (at threshold)", scoreFrequency(5.0).score === 50);
  check("freq 6.0 → 30 (over threshold)", scoreFrequency(6.0).score === 30);
  check("freq 8.0 → 10 (severe)", scoreFrequency(8.0).score === 10);
  check("freq 1.0 → 70 (low end ok)", scoreFrequency(1.0).score === 70);
}

console.log("\n── scoreCpm ──");
{
  check("CPM trend 0 → 85 (stable healthy)", scoreCpm(0).score === 85);
  check("CPM trend +0.30 → 30 (sharp rise bad)", scoreCpm(0.30).score === 30);
  check("CPM trend -0.10 → 90 (gentle drop ideal)", scoreCpm(-0.10).score === 90);
  check("CPM trend +0.50 → 15 (runaway)", scoreCpm(0.50).score === 15);
}

console.log("\n── scoreTrend ──");
{
  // Furniture story: results -33%, ctr -28%, cpm 0%
  const r = scoreTrend({ resultsTrend: -0.33, ctrTrend: -0.28, cpmTrend: 0 });
  // results -33 (weight 3) → ~28; ctr -28 (weight 2) → ~33; cpm 0 inv → 80 (weight 1)
  // weighted: (28*3 + 33*2 + 80*1) / 6 = (84 + 66 + 80) / 6 = 230/6 ≈ 38
  check("furniture trend ≈ low (results -33, ctr -28)", r.score > 25 && r.score < 50, r);
}
{
  // Cosmetics: small +ve trends
  const r = scoreTrend({ resultsTrend: 0.08, ctrTrend: -0.04, cpmTrend: 0.03 });
  check("cosmetics trend ≈ healthy (small movements)", r.score > 70 && r.score < 90, r);
}
{
  const r = scoreTrend({ resultsTrend: null, ctrTrend: null, cpmTrend: null });
  check("no signal → neutral 50, not 0", r.score === 50);
}

// scoreRecommendation was retired in v2 to eliminate double-counting.
// (Tests removed alongside the function.)

// ════════════════ COMPOSITION ════════════════
console.log("\n── Weights ──");
{
  const sum = WEIGHTS.trend + WEIGHTS.ctr + WEIGHTS.frequency + WEIGHTS.cpm;
  check("v2 weights sum to exactly 100", sum === 100, sum);
  check("v2: trend has highest weight (40)", WEIGHTS.trend === 40);
}

console.log("\n── composeBreakdown ──");
{
  // All facets at 80 → total should be 80 (weighted average)
  const allEighty = {
    trend:     { score: 80, evidence: {} },
    ctr:       { score: 80, evidence: {} },
    frequency: { score: 80, evidence: {} },
    cpm:       { score: 80, evidence: {} },
  };
  const b = composeBreakdown(allEighty);
  check("all facets 80 → total 80", b.total === 80, b.total);
  check("algorithmVersion in breakdown is 2", b.algorithmVersion === 2);
  check("each facet has score, weight, weighted, evidence",
    Object.values(b.facets).every(f =>
      typeof f.score === "number" &&
      typeof f.weight === "number" &&
      typeof f.weighted === "number" &&
      f.evidence !== undefined
    ));
  // weighted contributions sum to total (modulo rounding)
  const weightedSum = Object.values(b.facets).reduce((a, f) => a + f.weighted, 0);
  check("weighted contributions sum to total", Math.abs(weightedSum - b.total) < 1, { weightedSum, total: b.total });
  // v2 should have exactly 4 facets, no `recommendation` key
  const facetKeys = Object.keys(b.facets).sort();
  check("v2 breakdown has exactly 4 facets, no `recommendation`",
    JSON.stringify(facetKeys) === JSON.stringify(["cpm", "ctr", "frequency", "trend"]),
    facetKeys);
}

// ════════════════ ENGINE + CORDON + SANITY ════════════════
console.log("\n── Engine: orchestration + cordon ──");

interface Call { table: string; op: string; data?: any; where?: any }
const calls: Call[] = [];
const scoreStore = new Map<string, any>();

// Furniture fixture: the full bad-account story
const furnitureTrend = { ctrTrend: -0.33, cpmTrend: 0, frequencyTrend: 0.46, resultsTrend: -0.33, spendTrend: 0 };
const furnitureDaily = ["2026-06-06","2026-06-07","2026-06-08","2026-06-09","2026-06-10","2026-06-11","2026-06-12"]
  .map(d => ({
    date: new Date(d),
    spend: 13000n, impressions: 2500n, reach: 500n, clicks: 50n,
    messages: 4n, purchases: 0n, leads: 0n, conversions: 4n,
    ctr: 2.0, cpm: 5.2, frequency: 5.4,
  }));
const furnitureRec = { priority: "CRITICAL" };

const cosmeticsTrend = { ctrTrend: -0.04, cpmTrend: 0.03, frequencyTrend: 0.10, resultsTrend: 0.08, spendTrend: 0.05 };
const cosmeticsDaily = ["2026-06-06","2026-06-07","2026-06-08","2026-06-09","2026-06-10","2026-06-11","2026-06-12"]
  .map(d => ({
    date: new Date(d),
    spend: 13000n, impressions: 4000n, reach: 2700n, clicks: 44n,
    messages: 10n, purchases: 0n, leads: 0n, conversions: 10n,
    ctr: 1.1, cpm: 3.2, frequency: 1.5,
  }));
const cosmeticsRec = { priority: "MEDIUM" };

let currentTrend: any = furnitureTrend;
let currentDaily: any = furnitureDaily;
let currentRec: any = furnitureRec;

const mockPrisma: any = {
  metricTrend: {
    findFirst: async () => { calls.push({ table: "metric_trends", op: "read" }); return currentTrend; },
  },
  dailyStat: {
    findMany: async () => { calls.push({ table: "daily_stats", op: "read" }); return currentDaily; },
  },
  healthScore: {
    upsert: async ({ where, create, update }: any) => {
      calls.push({ table: "health_scores", op: "upsert", where, data: create });
      const k = JSON.stringify(where);
      if (scoreStore.has(k)) scoreStore.set(k, { ...scoreStore.get(k), ...update });
      else scoreStore.set(k, { ...create });
      return scoreStore.get(k);
    },
  },
  // Cordon sentinels — engine must not touch these (v2 also doesn't read recommendations)
  rawInsight:          { create: () => { throw new Error("VIOLATION: health wrote raw_insights"); } },
  dailyStat_write:     { create: () => { throw new Error("VIOLATION: health wrote daily_stats"); } },
  metricTrend_write:   { upsert: () => { throw new Error("VIOLATION: health wrote metric_trends"); } },
  detectedIssue:       { create: () => { throw new Error("VIOLATION: health wrote detected_issues"); } },
  recommendation:      { create: () => { throw new Error("VIOLATION: health wrote recommendations"); },
                         findFirst: () => { throw new Error("VIOLATION: v2 health should NOT read recommendations (was double-counting in v1)"); } },
  knowledgeRule:       { create: () => { throw new Error("VIOLATION: health wrote knowledge_rules"); } },
  adAccount:           { update: () => { throw new Error("VIOLATION: health wrote ad_accounts"); } },
};

async function main() {
  const { HealthScoreEngine } = await import("./src/engines/health/HealthScoreEngine");
  const { EntityType } = await import("@prisma/client");
  const engine = new HealthScoreEngine(mockPrisma);

  // ── FURNITURE: ACCEPT THE SCORE, DON'T TUNE ──
  console.log("\n══════ SANITY: furniture (don't tune — accept) ══════");
  currentTrend = furnitureTrend; currentDaily = furnitureDaily; currentRec = furnitureRec;
  calls.length = 0;
  const furn = await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T12:00:00Z"),
  });
  check("furniture: engine ok", furn.ok === true, furn);
  console.log(`    [observed] furniture score = ${furn.score}`);
  console.log(`    [observed] breakdown:`, JSON.stringify(furn.breakdown.facets, null, 2).split("\n").map(l => "    " + l).join("\n"));

  // The DISCIPLINE check: the furniture story has 3 HIGH issues + an AUDIENCE_FATIGUE
  // diagnosis + declining results. The score MUST be in a "legibly bad" range.
  // It must NOT come out 80+. That would be the engine lying about a bad account.
  check("furniture score is legibly bad (< 65) — engine doesn't sugarcoat",
    furn.score < 65, { score: furn.score });
  // But not catastrophically zero — the CTR is OK (2.0%), so SOME facets are healthy.
  check("furniture score not catastrophically zero (>20)",
    furn.score > 20, { score: furn.score });
  // The CTR facet should be middling (2.0% is fine, not great)
  check("breakdown: CTR facet middling for 2.0%",
    furn.breakdown.facets.ctr.score > 40 && furn.breakdown.facets.ctr.score < 80);
  // Breakdown has versioning
  check("breakdown carries algorithmVersion=2",
    furn.breakdown.algorithmVersion === 2);
  // v2: no recommendation facet
  check("v2: no recommendation facet in breakdown",
    !("recommendation" in furn.breakdown.facets));

  // ── COSMETICS: ACCEPT THE SCORE ──
  console.log("\n══════ SANITY: cosmetics ══════");
  currentTrend = cosmeticsTrend; currentDaily = cosmeticsDaily; currentRec = cosmeticsRec;
  const cosm = await engine.run(EntityType.ACCOUNT, "acc_cosm", {
    asOf: new Date("2026-06-14T13:00:00Z"),
  });
  console.log(`    [observed] cosmetics score = ${cosm.score}`);
  console.log(`    [observed] breakdown:`, JSON.stringify(cosm.breakdown.facets, null, 2).split("\n").map(l => "    " + l).join("\n"));
  // Cosmetics has one MEDIUM issue (LOW_CTR), no fatigue, positive results trend.
  // Should be middling-to-decent.
  check("cosmetics score noticeably higher than furniture's",
    cosm.score > furn.score, { cosm: cosm.score, furn: furn.score });
  check("cosmetics score not perfect (LOW_CTR is real)",
    cosm.score < 90, { score: cosm.score });

  // ── NO-RECOMMENDATION CASE ──
  console.log("\n── No-recommendation case ──");
  currentRec = null;
  // Reset other fixtures to "healthy account"
  currentTrend = { ctrTrend: 0.05, cpmTrend: -0.05, frequencyTrend: 0, resultsTrend: 0.10, spendTrend: 0.03 };
  currentDaily = furnitureDaily.map(d => ({ ...d, ctr: 2.5, frequency: 2.5 }));
  const healthy = await engine.run(EntityType.ACCOUNT, "acc_healthy", {
    asOf: new Date("2026-06-14T14:00:00Z"),
  });
  console.log(`    [observed] healthy score = ${healthy.score}`);
  check("healthy account scores well (>= 80)", healthy.score >= 80, { score: healthy.score });

  // ── CORDON ──
  console.log("\n── Cordon ──");
  const tables = new Set(calls.map(c => c.table));
  check("v2 cordon: only metric_trends, daily_stats (reads) + health_scores (write)",
    tables.size === 3 &&
    tables.has("metric_trends") && tables.has("daily_stats") && tables.has("health_scores"),
    [...tables]);
  // Explicitly verify the engine did NOT touch recommendations
  check("v2 cordon: recommendations table NEVER touched",
    !tables.has("recommendations"));

  // ── IDEMPOTENCY (same version overwrites) ──
  console.log("\n── Idempotency ──");
  currentTrend = furnitureTrend; currentDaily = furnitureDaily; currentRec = furnitureRec;
  const before = scoreStore.size;
  await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T15:00:00Z"),
  });
  check("rerun same (entity, date, version) → no new row",
    scoreStore.size === before, { before, after: scoreStore.size });

  // ── BREAKDOWN PERSISTED ──
  console.log("\n── Breakdown persistence ──");
  const lastUpsert = calls.filter(c => c.table === "health_scores" && c.op === "upsert").pop();
  const persistedBreakdown = lastUpsert?.data?.breakdownJson;
  check("breakdownJson persisted in DB write (v2)",
    persistedBreakdown && persistedBreakdown.algorithmVersion === 2 && persistedBreakdown.facets,
    persistedBreakdown);
  // Every facet's evidence persisted
  check("CTR evidence persisted with ceiling/floor",
    (persistedBreakdown?.facets?.ctr?.evidence?.ceil) === 3.0);
  // Weighted contributions persisted
  check("weighted contribution per facet persisted",
    typeof persistedBreakdown?.facets?.ctr?.weighted === "number");

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
