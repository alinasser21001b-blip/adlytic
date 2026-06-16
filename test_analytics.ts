// Exercises:
//   1. Each calculator with realistic furniture/cosmetics data
//   2. Edge cases: zero prior, null values, empty windows, noise floor
//   3. Cordon: engine writes ONLY metric_trends — never daily_stats,
//      detected_issues, recommendations, health_scores
//   4. Idempotency: re-running converges via upsert
//   5. Lagged window math: as-of Jun 14 → current Jun 5–11, prior May 29–Jun 4

import { calculateCtrTrend } from "./src/engines/analytics/calculateCtrTrend";
import { calculateCpmTrend } from "./src/engines/analytics/calculateCpmTrend";
import { calculateFrequencyTrend } from "./src/engines/analytics/calculateFrequencyTrend";
import { calculateResultsTrend } from "./src/engines/analytics/calculateResultsTrend";
import { calculateSpendTrend } from "./src/engines/analytics/calculateSpendTrend";
import type { DailyPoint } from "./src/engines/analytics/aggregate";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

// ── helper: build a synthetic 7-day window with constant rates ─────────
function days(n: number, vals: Partial<DailyPoint>): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      date: `2026-06-${String(i+1).padStart(2,'0')}`,
      spend: 13000, messages: 5, impressions: 2500, reach: 1800, clicks: 65,
      ctr: 2.6, cpm: 5.2, frequency: 1.4, conversions: 5,
      ...vals,
    });
  }
  return out;
}

// ════════════════ CALCULATOR CORRECTNESS ════════════════
console.log("\n── CTR trend ──");
{
  // Furniture story: CTR 3.0 → 2.0 = -33.3%
  const prior = days(7, { ctr: 3.0 });
  const current = days(7, { ctr: 2.0 });
  const t = calculateCtrTrend(current, prior);
  check("3.0% → 2.0% ≈ -33.3%", t !== null && Math.abs(t - (-0.3333)) < 0.001, t);
}
{
  // Cosmetics: CTR essentially flat at 1.1
  const prior = days(7, { ctr: 1.10 });
  const current = days(7, { ctr: 1.11 });
  const t = calculateCtrTrend(current, prior);
  check("1.10% → 1.11% within noise floor → 0", t === 0, t);
}
{
  const prior = days(7, { ctr: null, impressions: 0 });
  const current = days(7, { ctr: 2.5 });
  const t = calculateCtrTrend(current, prior);
  check("no prior data → null (not Infinity)", t === null, t);
}
{
  // Weighting: 1 huge day at 1.0%, 6 tiny days at 5.0% → weighted ~1.something
  const current: DailyPoint[] = [
    { ...days(1, {})[0], ctr: 1.0, impressions: 100000 },
    ...Array.from({length:6}, (_,i) => ({ ...days(1, {})[0], date: `2026-06-${i+2}`, ctr: 5.0, impressions: 100 })),
  ];
  const prior = days(7, { ctr: 2.0, impressions: 1000 });
  const t = calculateCtrTrend(current, prior);
  // Weighted CTR ≈ (1.0*100000 + 5.0*600) / 100600 ≈ 1.0238
  // vs prior 2.0 → ~-49%
  check("impression-weighted (big day dominates)", t !== null && t < -0.4, t);
}

console.log("\n── Frequency trend ──");
{
  // 3.7 → 5.4 ≈ +46%
  const prior = days(7, { frequency: 3.7 });
  const current = days(7, { frequency: 5.4 });
  const t = calculateFrequencyTrend(current, prior);
  check("3.7 → 5.4 ≈ +46%", t !== null && Math.abs(t - 0.4595) < 0.001, t);
}
{
  // Unweighted: a single high day shouldn't dominate
  const current: DailyPoint[] = [
    ...Array.from({length:6}, (_,i) => ({ ...days(1, {})[0], date: `2026-06-${i+1}`, frequency: 2.0 })),
    { ...days(1, {})[0], date: `2026-06-07`, frequency: 8.0 },
  ];
  const prior = days(7, { frequency: 3.0 });
  const t = calculateFrequencyTrend(current, prior);
  // Unweighted avg = (6*2 + 8)/7 ≈ 2.857. Trend vs 3.0 → ~-5%
  check("frequency averaged unweighted", t !== null && Math.abs(t - (-0.0476)) < 0.01, t);
}

console.log("\n── Results trend ──");
{
  // Furniture: messages 42 → 28 ≈ -33.3%
  const prior = days(7, { conversions: 6 }); // 7×6 = 42
  const current = days(7, { conversions: 4 }); // 7×4 = 28
  const t = calculateResultsTrend(current, prior);
  check("42 → 28 ≈ -33.3%", t !== null && Math.abs(t - (-0.3333)) < 0.001, t);
}
{
  // Small numbers: prior had 1 result, current has 2 — should be null (noise)
  const prior = days(7, { conversions: 0 }); // 0 results total
  const prior2 = [...prior];
  prior2[0] = { ...prior2[0], conversions: 1 };
  const current = days(7, { conversions: 0 });
  current[0] = { ...current[0], conversions: 2 };
  const t = calculateResultsTrend(current, prior2);
  check("1 → 2 below minSignal=3 → null", t === null, t);
}
{
  // Zero prior — null, not Infinity
  const prior = days(7, { conversions: 0 });
  const current = days(7, { conversions: 5 });
  const t = calculateResultsTrend(current, prior);
  check("0 prior → null", t === null, t);
}

console.log("\n── Spend trend ──");
{
  // Spend $220 → $240 = +9.09%
  const prior = days(7, { spend: 220 / 7 * 1300 }); // ~40857/day, ~$220 total
  const current = days(7, { spend: 240 / 7 * 1300 });
  const t = calculateSpendTrend(current, prior);
  // Actually using the ~ approximations: just verify it's positive ~9%
  check("spend rising ≈ +9%", t !== null && t > 0.08 && t < 0.10, t);
}

console.log("\n── CPM trend ──");
{
  // Furniture story: $4.2 → $5.1 = +21.4%
  const prior = days(7, { cpm: 4.2 });
  const current = days(7, { cpm: 5.1 });
  const t = calculateCpmTrend(current, prior);
  check("4.2 → 5.1 ≈ +21.4%", t !== null && Math.abs(t - 0.2143) < 0.001, t);
}

// ════════════════ NO JUDGMENTS — ANALYTICS RETURNS FACTS ONLY ════════════════
console.log("\n── Cordon: no judgments in output ──");
{
  // The output of every calculator is a number or null. Verify the API
  // surface NEVER includes severity, codes, or boolean "is bad" flags.
  const prior = days(7, { ctr: 3.0 });
  const current = days(7, { ctr: 2.0 });
  const t = calculateCtrTrend(current, prior);
  check("calculator returns plain number, no judgment object", typeof t === "number", typeof t);
}

// ════════════════ ENGINE ORCHESTRATION + CORDON ════════════════
console.log("\n── AnalyticsEngine: orchestration + cordon ──");

interface Call { table: string; op: string; data?: any; where?: any }
const calls: Call[] = [];

// Build a 16-day fixture matching the furniture story:
//   - days -15..-9 (prior 7-day, ending 2-day lag): ctr 3.0, msgs 6/day
//   - days -8..-2  (current 7-day):                  ctr 2.0, msgs 4/day
// as-of = 2026-06-14, lag = 2, window = 7
//   currentUntil = 06-12, currentSince = 06-06   (msgs 4/day → 28 total)
//   priorUntil   = 06-05, priorSince   = 05-30   (msgs 6/day → 42 total)
const fixtureRows = (() => {
  const rows: any[] = [];
  function row(date: string, ctr: number, msgs: number, freq: number) {
    return {
      date: new Date(date),
      spend: 13000n, impressions: 2500n, reach: 1800n, clicks: 65n,
      messages: BigInt(msgs), purchases: 0n, leads: 0n, conversions: BigInt(msgs),
      ctr, cpm: 5.2, frequency: freq,
    };
  }
  // Prior window (May 30 – Jun 5, 7 days): strong
  ["2026-05-30","2026-05-31","2026-06-01","2026-06-02","2026-06-03","2026-06-04","2026-06-05"]
    .forEach(d => rows.push(row(d, 3.0, 6, 3.7)));
  // Current window (Jun 6 – Jun 12, 7 days): weakening
  ["2026-06-06","2026-06-07","2026-06-08","2026-06-09","2026-06-10","2026-06-11","2026-06-12"]
    .forEach(d => rows.push(row(d, 2.0, 4, 5.4)));
  // Backfill-window days (Jun 13–14): present but MUST be EXCLUDED by lag
  rows.push(row("2026-06-13", 1.0, 2, 6.4));
  rows.push(row("2026-06-14", 0.8, 1, 6.8));
  return rows;
})();

const trendStore = new Map<string, any>();
const mockPrisma: any = {
  dailyStat: {
    findMany: async ({ where }: any) => {
      calls.push({ table: "daily_stats", op: "read", where });
      const since = where.date.gte;
      const until = where.date.lte;
      return fixtureRows.filter(r => r.date >= since && r.date <= until);
    },
  },
  metricTrend: {
    upsert: async ({ where, create, update }: any) => {
      const k = JSON.stringify(where);
      calls.push({ table: "metric_trends", op: "upsert", where, data: create });
      if (trendStore.has(k)) trendStore.set(k, { ...trendStore.get(k), ...update });
      else trendStore.set(k, { ...create });
      return trendStore.get(k);
    },
  },
  // Cordon sentinels — engine must not touch these
  dailyStat_create: { create: () => { throw new Error("VIOLATION: analytics wrote daily_stats"); } },
  rawInsight: { create: () => { throw new Error("VIOLATION: analytics wrote raw_insights"); } },
  detectedIssue: { create: () => { throw new Error("VIOLATION: analytics wrote detected_issues"); } },
  recommendation: { create: () => { throw new Error("VIOLATION: analytics wrote recommendations"); } },
  healthScore: { create: () => { throw new Error("VIOLATION: analytics wrote health_scores"); } },
  knowledgeRule: { create: () => { throw new Error("VIOLATION: analytics wrote knowledge_rules"); } },
  adAccount: { update: () => { throw new Error("VIOLATION: analytics wrote ad_accounts"); } },
};

async function main() {
  const { AnalyticsEngine } = await import("./src/engines/analytics/AnalyticsEngine");
  const { EntityType } = await import("@prisma/client");
  const engine = new AnalyticsEngine(mockPrisma);

  const result = await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T12:00:00Z"),
    windowDays: 7,
    attributionLagDays: 2,
  });

  check("engine ok", result.ok === true, result);
  check("current window starts 2026-06-06", result.currentSince === "2026-06-06", result.currentSince);
  check("current window ends 2026-06-12", result.currentUntil === "2026-06-12", result.currentUntil);
  check("prior window starts 2026-05-30", result.priorSince === "2026-05-30", result.priorSince);
  check("prior window ends 2026-06-05", result.priorUntil === "2026-06-05", result.priorUntil);

  // Trend values — furniture story
  check("ctrTrend ≈ -33% (3.0 → 2.0)",
    result.trends.ctrTrend !== null && Math.abs(result.trends.ctrTrend - (-0.3333)) < 0.001,
    result.trends.ctrTrend);
  check("resultsTrend ≈ -33% (42 → 28)",
    result.trends.resultsTrend !== null && Math.abs(result.trends.resultsTrend - (-0.3333)) < 0.001,
    result.trends.resultsTrend);
  check("frequencyTrend ≈ +46% (3.7 → 5.4)",
    result.trends.frequencyTrend !== null && Math.abs(result.trends.frequencyTrend - 0.4595) < 0.001,
    result.trends.frequencyTrend);
  check("cpmTrend ≈ 0 (flat at 5.2)",
    result.trends.cpmTrend === 0,
    result.trends.cpmTrend);
  check("spendTrend ≈ 0 (flat at 13000/day)",
    result.trends.spendTrend === 0,
    result.trends.spendTrend);

  // Cordon
  const tables = new Set(calls.map(c => c.table));
  check("engine only touched daily_stats (read) + metric_trends (write)",
    tables.size === 2 && tables.has("daily_stats") && tables.has("metric_trends"),
    [...tables]);
  check("metric_trends got exactly one upsert",
    calls.filter(c => c.table === "metric_trends").length === 1);
  check("trend row stored",
    trendStore.size === 1, trendStore.size);

  // Backfill-window days (Jun 13–14) were NOT included
  // (We can verify indirectly: if they'd been included, ctrTrend would be different,
  //  because the current window would have lower CTR. The asserted -33% confirms it.)
  // But let's also verify the read range explicitly:
  const readCall = calls.find(c => c.table === "daily_stats");
  const readUntil = readCall?.where?.date?.lte;
  check("read window stops at currentUntil=2026-06-12 (excludes backfill-window days 13–14)",
    readUntil instanceof Date && readUntil.toISOString().slice(0,10) === "2026-06-12",
    readUntil);

  // ── IDEMPOTENCY ──
  console.log("\n── Idempotency ──");
  const sizeBefore = trendStore.size;
  await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T13:00:00Z"),
    windowDays: 7,
    attributionLagDays: 2,
  });
  check("rerun on same as-of date → no duplicate rows",
    trendStore.size === sizeBefore, { before: sizeBefore, after: trendStore.size });

  // ── BACKFILL-AWARE: changing as-of advances the window ──
  console.log("\n── Lagged window advances ──");
  await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-21T12:00:00Z"),
    windowDays: 7,
    attributionLagDays: 2,
  });
  check("different as-of → new row in metric_trends", trendStore.size === 2, trendStore.size);

  // ── NULL HANDLING ──
  console.log("\n── Empty data ──");
  fixtureRows.length = 0; // wipe fixture
  const emptyResult = await engine.run(EntityType.ACCOUNT, "acc_empty", {
    asOf: new Date("2026-06-14T12:00:00Z"),
  });
  check("empty data → all trends null", Object.values(emptyResult.trends).every(v => v === null), emptyResult.trends);
  check("engine still ok on empty data", emptyResult.ok === true, emptyResult.ok);

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
