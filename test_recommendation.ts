// Exercises:
//   1. Matcher correctness — subset semantics, specificity, priority, file order
//   2. Edge cases — empty issues, single issue, no matching rule
//   3. Cordon — engine reads detected_issues + daily_stats (KB metrics), writes ONLY recommendations
//   4. Idempotency — rerun replaces atomically
//   5. SANITY — full furniture story → PAUSE_AND_RELAUNCH; cosmetics → IMPROVE_HOOKS
//   6. No-match → no recommendation written (the engine never invents)

import { matchCompositionRule } from "./src/engines/recommendation/matchCompositionRule";
import { COMPOSITION_RULES, ActionCode } from "./src/engines/recommendation/compositionRules";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

async function main() {
  const { IssueCode, EntityType, RecommendationPriority } = await import("@prisma/client");

  // ════════════════ MATCHER ════════════════
  console.log("\n── Matcher: subset semantics ──");
  {
    const r = matchCompositionRule([IssueCode.LOW_CTR], COMPOSITION_RULES);
    check("single LOW_CTR → IMPROVE_HOOKS", r?.actionCode === ActionCode.IMPROVE_HOOKS, r);
  }
  {
    // Empty input
    const r = matchCompositionRule([], COMPOSITION_RULES);
    check("empty issues → null (no recommendation)", r === null);
  }
  {
    // Issue with no matching rule (HIGH_CPM doesn't appear in any rule)
    const r = matchCompositionRule([IssueCode.HIGH_CPM], COMPOSITION_RULES);
    check("HIGH_CPM alone → null (no invented fallback)", r === null);
  }

  console.log("\n── Matcher: specificity wins ──");
  {
    // AUDIENCE_FATIGUE alone matches single-issue rule (MEDIUM).
    // AUDIENCE_FATIGUE + DECLINING_RESULTS matches the HIGH 2-issue rule.
    // The 2-issue rule MUST win on specificity.
    const r = matchCompositionRule(
      [IssueCode.AUDIENCE_FATIGUE, IssueCode.DECLINING_RESULTS],
      COMPOSITION_RULES
    );
    check("2-issue match beats subset 1-issue match",
      r?.priority === RecommendationPriority.HIGH && r?.actionCode === ActionCode.REFRESH_CREATIVES, r);
  }
  {
    // Three issues → matches the CRITICAL 3-issue rule, which must beat both
    // the 2-issue and the 1-issue rules.
    const r = matchCompositionRule(
      [IssueCode.AUDIENCE_FATIGUE, IssueCode.DECLINING_RESULTS, IssueCode.RISING_COST_PER_RESULT],
      COMPOSITION_RULES
    );
    check("3-issue CRITICAL beats 2-issue HIGH",
      r?.priority === RecommendationPriority.CRITICAL && r?.actionCode === ActionCode.PAUSE_AND_RELAUNCH, r);
  }

  console.log("\n── Matcher: subset extras don't break match ──");
  {
    // Detected: {AUDIENCE_FATIGUE, DECLINING_RESULTS, HIGH_FREQUENCY}.
    // Both the {AUDIENCE_FATIGUE, DECLINING_RESULTS} rule (HIGH, REFRESH)
    // and {AUDIENCE_FATIGUE, HIGH_FREQUENCY} rule (HIGH, BROADEN) match.
    // Same specificity (2), same priority (HIGH) → file order tie-break.
    // REFRESH_CREATIVES appears first → it wins.
    const r = matchCompositionRule(
      [IssueCode.AUDIENCE_FATIGUE, IssueCode.DECLINING_RESULTS, IssueCode.HIGH_FREQUENCY],
      COMPOSITION_RULES
    );
    check("equal specificity + priority → file-order tie-break (REFRESH wins)",
      r?.actionCode === ActionCode.REFRESH_CREATIVES, r);
  }

  console.log("\n── Matcher: priority breaks specificity ties ──");
  {
    // Custom rule table to exercise priority tie-break cleanly
    const rules = [
      { requiredIssues: [IssueCode.LOW_CTR], priority: RecommendationPriority.MEDIUM,
        actionCode: ActionCode.IMPROVE_HOOKS, rationale: "" },
      { requiredIssues: [IssueCode.LOW_CTR], priority: RecommendationPriority.HIGH,
        actionCode: ActionCode.REFRESH_CREATIVES, rationale: "" },
    ];
    const r = matchCompositionRule([IssueCode.LOW_CTR], rules);
    check("higher priority wins same-specificity tie",
      r?.priority === RecommendationPriority.HIGH && r?.actionCode === ActionCode.REFRESH_CREATIVES, r);
  }

  console.log("\n── Matcher: subset, not equality ──");
  {
    // Required: {AUDIENCE_FATIGUE}. Detected: {AUDIENCE_FATIGUE, LOW_CTR}.
    // Extra issues should not prevent the AUDIENCE_FATIGUE rule from being a candidate.
    // (The LOW_CTR rule also matches, both 1-issue rules. Priority? Both MEDIUM.
    //  File order: AUDIENCE_FATIGUE rule comes first in COMPOSITION_RULES.)
    const r = matchCompositionRule(
      [IssueCode.AUDIENCE_FATIGUE, IssueCode.LOW_CTR],
      COMPOSITION_RULES
    );
    check("subset matching ignores extra detected issues",
      r?.actionCode === ActionCode.REFRESH_CREATIVES, r);
  }

  // ════════════════ ENGINE ORCHESTRATION ════════════════
  console.log("\n── Engine: orchestration + cordon ──");

  interface Call { table: string; op: string; where?: any; data?: any }
  const calls: Call[] = [];

  // The furniture story's detected issues (matches Step 8's output).
  const furnitureIssues = [
    { issueCode: IssueCode.AUDIENCE_FATIGUE, severity: "HIGH", evidenceJson: { confidence: 0.90 } },
    { issueCode: IssueCode.DECLINING_RESULTS, severity: "HIGH", evidenceJson: { confidence: 0.85 } },
    { issueCode: IssueCode.RISING_COST_PER_RESULT, severity: "HIGH", evidenceJson: { confidence: 0.75 } },
    { issueCode: IssueCode.HIGH_FREQUENCY, severity: "MEDIUM", evidenceJson: { confidence: 0.70 } },
  ];
  const cosmeticsIssues = [
    { issueCode: IssueCode.LOW_CTR, severity: "MEDIUM", evidenceJson: { confidence: 0.80 } },
  ];

  let currentFixture = furnitureIssues;
  const recStore = new Map<string, any>();

  const mockPrisma: any = {
    detectedIssue: {
      findMany: async ({ where }: any) => {
        calls.push({ table: "detected_issues", op: "read", where });
        return currentFixture;
      },
    },
    dailyStat: {
      findMany: async ({ where }: any) => {
        calls.push({ table: "daily_stats", op: "read", where });
        return [];
      },
      create: () => { throw new Error("VIOLATION: rec wrote daily_stats"); },
    },
    recommendation: {
      deleteMany: async ({ where }: any) => {
        calls.push({ table: "recommendations", op: "deleteMany", where });
        recStore.delete(JSON.stringify(where));
        return { count: 0 };
      },
      create: async ({ data }: any) => {
        calls.push({ table: "recommendations", op: "create", data });
        const key = JSON.stringify({ entityType: data.entityType, entityId: data.entityId, date: data.date });
        recStore.set(key, data);
        return data;
      },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
    // Cordon sentinels
    rawInsight:   { create: () => { throw new Error("VIOLATION: rec wrote raw_insights"); } },
    metricTrend:  { upsert: () => { throw new Error("VIOLATION: rec wrote metric_trends"); } },
    detectedIssue_write: { create: () => { throw new Error("VIOLATION: rec wrote detected_issues"); } },
    healthScore:  { create: () => { throw new Error("VIOLATION: rec wrote health_scores"); } },
    knowledgeRule:{ create: () => { throw new Error("VIOLATION: rec wrote knowledge_rules"); } },
    adAccount:    { update: () => { throw new Error("VIOLATION: rec wrote ad_accounts"); } },
  };

  const { RecommendationEngine } = await import("./src/engines/recommendation/RecommendationEngine");
  const engine = new RecommendationEngine(mockPrisma);

  // ── FURNITURE SANITY ──
  console.log("\n══════ SANITY: furniture story ══════");
  currentFixture = furnitureIssues;
  calls.length = 0;
  const furn = await engine.run(EntityType.ACCOUNT, "acc_furn", {
    asOf: new Date("2026-06-14T12:00:00Z"),
  });
  check("furniture: engine ok", furn.ok === true);
  check("furniture: priority CRITICAL (3-signal pattern triggers PAUSE_AND_RELAUNCH)",
    furn.recommendation?.priority === RecommendationPriority.CRITICAL, furn.recommendation);
  check("furniture: actionCode PAUSE_AND_RELAUNCH",
    furn.recommendation?.actionCode === ActionCode.PAUSE_AND_RELAUNCH);
  check("furniture: sourceIssues includes the three corroborating codes",
    furn.recommendation?.sourceIssues.length === 3 &&
    furn.recommendation.sourceIssues.includes(IssueCode.AUDIENCE_FATIGUE) &&
    furn.recommendation.sourceIssues.includes(IssueCode.DECLINING_RESULTS) &&
    furn.recommendation.sourceIssues.includes(IssueCode.RISING_COST_PER_RESULT));

  // ── COSMETICS SANITY ──
  console.log("\n══════ SANITY: cosmetics story ══════");
  currentFixture = cosmeticsIssues;
  calls.length = 0;
  const cosm = await engine.run(EntityType.ACCOUNT, "acc_cosm", {
    asOf: new Date("2026-06-14T13:00:00Z"),
  });
  check("cosmetics: engine ok", cosm.ok === true);
  check("cosmetics: priority MEDIUM",
    cosm.recommendation?.priority === RecommendationPriority.MEDIUM, cosm.recommendation);
  check("cosmetics: actionCode IMPROVE_HOOKS (industry-text rendered later by Knowledge)",
    cosm.recommendation?.actionCode === ActionCode.IMPROVE_HOOKS);
  check("cosmetics: sourceIssues = [LOW_CTR]",
    cosm.recommendation?.sourceIssues.length === 1 &&
    cosm.recommendation.sourceIssues[0] === IssueCode.LOW_CTR);

  // ── CORDON ──
  console.log("\n── Cordon ──");
  const tables = new Set(calls.map(c => c.table));
  check("reads detected_issues + daily_stats (KB); writes recommendations only",
    tables.size === 3 &&
    tables.has("detected_issues") &&
    tables.has("daily_stats") &&
    tables.has("recommendations"),
    [...tables]);
  // Verify no human-readable leakage in the recommendation record
  const rec = cosm.recommendation!;
  const keys = Object.keys(rec).sort();
  check("recommendation shape: actionCode, details, priority, sourceIssues — codes only",
    JSON.stringify(keys) === JSON.stringify(["actionCode", "details", "priority", "sourceIssues"]),
    keys);
  // sourceIssues are codes, not human text
  check("sourceIssues are IssueCode enum values, not text",
    rec.sourceIssues.every(c => typeof c === "string" && c.toUpperCase() === c),
    rec.sourceIssues);

  // ── IDEMPOTENCY ──
  console.log("\n── Idempotency ──");
  currentFixture = furnitureIssues;
  const beforeSize = recStore.size;
  await engine.run(EntityType.ACCOUNT, "acc_furn", { asOf: new Date("2026-06-14T14:00:00Z") });
  check("rerun on same date → still 2 entries total (furniture + cosmetics), no duplicates",
    recStore.size === beforeSize, { before: beforeSize, after: recStore.size });

  // ── NO MATCH → NO WRITE ──
  console.log("\n── No-match: engine writes nothing ──");
  currentFixture = [{ issueCode: IssueCode.HIGH_CPM, severity: "MEDIUM", evidenceJson: {} }];
  const noMatch = await engine.run(EntityType.ACCOUNT, "acc_nomatch", {
    asOf: new Date("2026-06-14T15:00:00Z"),
  });
  check("HIGH_CPM alone has no rule → recommendation is null",
    noMatch.recommendation === null);
  check("engine still ok (no-match is not an error)", noMatch.ok === true);
  // The deleteMany should still happen (in case a prior rec existed), but
  // no create. Look for create call to acc_nomatch.
  const createCallsForNomatch = calls.filter(
    c => c.table === "recommendations" && c.op === "create" && c.data?.entityId === "acc_nomatch"
  );
  check("no create called when no rule matches", createCallsForNomatch.length === 0);

  // ── EMPTY DETECTED ISSUES ──
  console.log("\n── Empty detected_issues ──");
  currentFixture = [];
  const empty = await engine.run(EntityType.ACCOUNT, "acc_empty", {
    asOf: new Date("2026-06-14T16:00:00Z"),
  });
  check("empty issues → null recommendation, not crash",
    empty.recommendation === null && empty.ok === true);

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
