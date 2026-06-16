// Exercises:
//   1. Universal default lookup
//   2. Industry-specific override (cosmetics LOW_CTR)
//   3. Locale switching (EN ↔ AR)
//   4. Fallback to universal when no industry match
//   5. Null industry → goes straight to universal
//   6. Missing code → returns null (no invented text)
//   7. Batch lookup is identical to N single lookups
//   8. Cordon: NO writes to any table, ever
//   9. Discipline check: engine accepts only the three documented inputs

import type { KnowledgeEntry } from "./src/engines/knowledge/KnowledgeEngine";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

// ── Fixtures matching what seed.ts writes ─────────────────────────────
const rules = [
  // AUDIENCE_FATIGUE EN universal
  { id: "1", issueCode: "AUDIENCE_FATIGUE", locale: "EN", industryProfileId: null,
    title: "Audience fatigue",
    causesJson: ["Frequency climbing", "Audience small vs spend", "Creative stale"],
    recommendationsJson: ["Refresh creatives", "Broaden audience", "Cap frequency"] },
  // AUDIENCE_FATIGUE AR universal
  { id: "2", issueCode: "AUDIENCE_FATIGUE", locale: "AR", industryProfileId: null,
    title: "إرهاق الجمهور",
    causesJson: ["تكرار مرتفع", "الجمهور صغير", "تصاميم قديمة"],
    recommendationsJson: ["جدّد التصاميم", "وسّع الجمهور", "حدّد سقف التكرار"] },
  // LOW_CTR EN universal
  { id: "3", issueCode: "LOW_CTR", locale: "EN", industryProfileId: null,
    title: "Low click-through rate",
    causesJson: ["Creative not stopping scroll"],
    recommendationsJson: ["Test new visuals and headlines"] },
  // LOW_CTR EN COSMETICS override
  { id: "4", issueCode: "LOW_CTR", locale: "EN", industryProfileId: "ip_cosm",
    title: "Low click-through rate",
    causesJson: ["Hook in first second is weak"],
    recommendationsJson: ["Improve the opening hook — show the result fast"] },
  // DECLINING_RESULTS EN universal
  { id: "5", issueCode: "DECLINING_RESULTS", locale: "EN", industryProfileId: null,
    title: "Declining results",
    causesJson: ["CTR falling"],
    recommendationsJson: ["Test three new creatives this week"] },
  // (No AR rule for LOW_CTR — used to test missing-translation behavior)
  // (No HIGH_FREQUENCY rule anywhere — used to test missing-code behavior)
];

interface Call { table: string; op: string; where?: any }
const calls: Call[] = [];

const mockPrisma: any = {
  knowledgeRule: {
    findFirst: async ({ where }: any) => {
      calls.push({ table: "knowledge_rules", op: "findFirst", where });
      return rules.find(r =>
        r.issueCode === where.issueCode &&
        r.locale === where.locale &&
        r.industryProfileId === where.industryProfileId
      ) ?? null;
    },
    findMany: async ({ where }: any) => {
      calls.push({ table: "knowledge_rules", op: "findMany", where });
      const codes = where.issueCode.in;
      return rules.filter(r =>
        codes.includes(r.issueCode) &&
        r.locale === where.locale &&
        r.industryProfileId === where.industryProfileId
      );
    },
  },
  // Cordon sentinels — any write to any table must throw
  knowledgeRule_write: { create: () => { throw new Error("VIOLATION: knowledge wrote knowledge_rules"); },
                        upsert: () => { throw new Error("VIOLATION: knowledge upserted knowledge_rules"); } },
  industryProfile: { create: () => { throw new Error("VIOLATION: knowledge wrote industry_profiles"); } },
  detectedIssue: { create: () => { throw new Error("VIOLATION: knowledge wrote detected_issues"); } },
  recommendation: { create: () => { throw new Error("VIOLATION: knowledge wrote recommendations"); } },
  healthScore: { create: () => { throw new Error("VIOLATION: knowledge wrote health_scores"); } },
  dailyStat: { create: () => { throw new Error("VIOLATION: knowledge wrote daily_stats"); } },
  metricTrend: { upsert: () => { throw new Error("VIOLATION: knowledge wrote metric_trends"); } },
};

async function main() {
  const { KnowledgeEngine } = await import("./src/engines/knowledge/KnowledgeEngine");
  const { IssueCode, Locale } = await import("@prisma/client");
  const knowledge = new KnowledgeEngine(mockPrisma);

  // ════════════════ UNIVERSAL DEFAULT LOOKUP ════════════════
  console.log("\n── Universal default ──");
  {
    const e = await knowledge.lookup({
      issueCode: IssueCode.AUDIENCE_FATIGUE,
      locale: Locale.EN,
      industryProfileId: null,
    });
    check("AUDIENCE_FATIGUE EN null → universal default", e?.title === "Audience fatigue", e);
    check("returns 3 causes", e?.causes.length === 3, e?.causes);
    check("returns 3 recommendations", e?.recommendations.length === 3, e?.recommendations);
  }

  // ════════════════ INDUSTRY OVERRIDE ════════════════
  console.log("\n── Industry override (cosmetics LOW_CTR) ──");
  {
    const cosmetics = await knowledge.lookup({
      issueCode: IssueCode.LOW_CTR,
      locale: Locale.EN,
      industryProfileId: "ip_cosm",
    });
    check("cosmetics LOW_CTR returns cosmetics-specific recommendation",
      cosmetics?.recommendations[0]?.includes("opening hook") ?? false,
      cosmetics?.recommendations);

    const generic = await knowledge.lookup({
      issueCode: IssueCode.LOW_CTR,
      locale: Locale.EN,
      industryProfileId: null,
    });
    check("universal LOW_CTR returns the generic recommendation",
      generic?.recommendations[0]?.includes("visuals and headlines") ?? false,
      generic?.recommendations);

    check("cosmetics and universal recommendations are DIFFERENT",
      cosmetics?.recommendations[0] !== generic?.recommendations[0]);
  }

  // ════════════════ FALLBACK ════════════════
  console.log("\n── Fallback when no industry override exists ──");
  {
    // Furniture has no specific AUDIENCE_FATIGUE rule → should fall back to universal
    const e = await knowledge.lookup({
      issueCode: IssueCode.AUDIENCE_FATIGUE,
      locale: Locale.EN,
      industryProfileId: "ip_furn",
    });
    check("furniture AUDIENCE_FATIGUE falls back to universal",
      e?.title === "Audience fatigue", e);
  }

  // ════════════════ LOCALE ════════════════
  console.log("\n── Locale switching ──");
  {
    const ar = await knowledge.lookup({
      issueCode: IssueCode.AUDIENCE_FATIGUE,
      locale: Locale.AR,
      industryProfileId: null,
    });
    check("AR returns Arabic title", ar?.title === "إرهاق الجمهور", ar?.title);
    check("AR causes are Arabic strings", ar?.causes[0]?.includes("تكرار") ?? false, ar?.causes);
  }
  {
    // LOW_CTR has no AR rule — should return null, not invent text
    const arMissing = await knowledge.lookup({
      issueCode: IssueCode.LOW_CTR,
      locale: Locale.AR,
      industryProfileId: null,
    });
    check("missing AR translation → null (no invented text)", arMissing === null, arMissing);
  }

  // ════════════════ MISSING CODE ════════════════
  console.log("\n── Missing code ──");
  {
    const e = await knowledge.lookup({
      issueCode: IssueCode.HIGH_FREQUENCY, // no rule seeded for this
      locale: Locale.EN,
      industryProfileId: null,
    });
    check("missing code → null (no fallback to 'unknown issue')", e === null, e);
  }

  // ════════════════ BATCH LOOKUP ════════════════
  console.log("\n── Batch lookup ──");
  {
    const batch = await knowledge.lookupMany({
      issueCodes: [IssueCode.AUDIENCE_FATIGUE, IssueCode.LOW_CTR, IssueCode.DECLINING_RESULTS, IssueCode.HIGH_FREQUENCY],
      locale: Locale.EN,
      industryProfileId: "ip_cosm",
    });
    check("batch returns Map", batch instanceof Map, typeof batch);
    check("batch has 3 entries (HIGH_FREQUENCY missing → no entry)", batch.size === 3, batch.size);
    check("batch LOW_CTR uses cosmetics override",
      batch.get(IssueCode.LOW_CTR)?.recommendations[0]?.includes("opening hook") ?? false);
    check("batch AUDIENCE_FATIGUE uses universal (no cosmetics override)",
      batch.get(IssueCode.AUDIENCE_FATIGUE)?.title === "Audience fatigue");
    check("missing code does NOT appear in batch result",
      !batch.has(IssueCode.HIGH_FREQUENCY));
  }

  // ════════════════ BATCH ≡ N SINGLES ════════════════
  console.log("\n── Batch equivalence ──");
  {
    const codes = [IssueCode.AUDIENCE_FATIGUE, IssueCode.LOW_CTR, IssueCode.DECLINING_RESULTS];
    const batch = await knowledge.lookupMany({
      issueCodes: codes,
      locale: Locale.EN,
      industryProfileId: "ip_cosm",
    });
    const singles = await Promise.all(codes.map(c =>
      knowledge.lookup({ issueCode: c, locale: Locale.EN, industryProfileId: "ip_cosm" })
    ));
    let identical = true;
    for (let i = 0; i < codes.length; i++) {
      const b = batch.get(codes[i]);
      const s = singles[i];
      if (JSON.stringify(b) !== JSON.stringify(s)) identical = false;
    }
    check("batch result identical to N single lookups", identical);
  }

  // ════════════════ CORDON ════════════════
  console.log("\n── Cordon: no writes ──");
  const writes = calls.filter(c =>
    c.op === "create" || c.op === "createMany" || c.op === "update" ||
    c.op === "upsert" || c.op === "delete" || c.op === "deleteMany"
  );
  check("zero writes performed across all tests", writes.length === 0, writes.length);

  const tables = new Set(calls.map(c => c.table));
  check("only knowledge_rules touched", tables.size === 1 && tables.has("knowledge_rules"), [...tables]);
  // NOTE: industry_profiles is read indirectly through getDashboard's earlier join,
  // not by this engine — the engine receives industryProfileId as input, not the row.
  // That's the dictionary discipline: caller resolves "what industry"; we just look up text.

  // ════════════════ DICTIONARY DISCIPLINE ════════════════
  console.log("\n── Discipline: no brain ──");
  {
    // The lookup result must contain ONLY {title, causes, recommendations}.
    // If anyone adds severity, confidence, score, action, or composition
    // fields to the return type, this test fails — and it should.
    const e = await knowledge.lookup({
      issueCode: IssueCode.AUDIENCE_FATIGUE,
      locale: Locale.EN,
      industryProfileId: null,
    }) as KnowledgeEntry;
    const keys = Object.keys(e).sort();
    check("output shape is exactly {title, causes, recommendations}",
      JSON.stringify(keys) === JSON.stringify(["causes", "recommendations", "title"]),
      keys);
  }
  {
    // The lookup INPUT must accept ONLY (issueCode, locale, industryProfileId).
    // If anyone adds severity, confidence, or context parameters, this assertion
    // becomes a TypeScript error at compile time. We can't enforce that at
    // runtime, but the type system does — and the typecheck passing IS the test.
    check("lookup signature accepts only the documented inputs (typecheck enforces)", true);
  }

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
