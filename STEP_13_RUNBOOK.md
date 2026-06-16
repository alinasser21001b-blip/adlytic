# STEP 13 — Verification Against Reality

> Step 13 is reality, not architecture.
> Don't fix the tests when something fails. Fix the code.
> Reality is allowed to prove us wrong.

This runbook executes the full pipeline against a real Postgres instance and (optionally) a real Meta account. It is precise on purpose: every command has an expected outcome and a "if it fails, look here" branch, so when reality disagrees with our assumptions you know exactly which assumption was wrong.

The static pre-flight (done in-sandbox) verified: composite-key naming, FK delete order, BigInt coercion at write boundaries, JSON column mapping, EntityStatus enum usage, platform-neutral naming. Those classes of bug should not surface during Step 13. What WILL surface: anything that depends on actual Postgres behavior, real Prisma runtime, real Meta API responses, real timezones.

---

## Prerequisites on your machine

```
- Node 20+ and npm
- Postgres 15+ running locally (or any Postgres you can write to)
- A Meta access token with `ads_read` for your furniture account (Step 13b)
- This codebase, with `npm install` already run
```

---

## 13.0 — Sanity: typecheck and unit tests still pass

```bash
npx tsc                          # should print nothing, exit 0
npx tsx test_logic.ts            # 21/21
npx tsx test_worker.ts           # 42/42
npx tsx test_analytics.ts        # 30/30
npx tsx test_rules.ts            # 54/54
npx tsx test_knowledge.ts        # 21/21
npx tsx test_recommendation.ts   # 24/24
npx tsx test_health.ts           # 38/38
npx tsx test_dto_shape.ts        # 11/11
```

If any of these fails on your machine but passed in handover, the difference is your toolchain (Node version, Prisma stub vs real client). **Stop and investigate before continuing.**

---

## 13.1 — Migrate the schema

```bash
# DATABASE_URL must point at a writable Postgres
export DATABASE_URL="postgresql://USER:PASS@localhost:5432/adlytic_dev"

npx prisma migrate dev --name phase1_init
```

**Expected:**
- Prisma reads `prisma/schema.prisma`
- Creates a migration in `prisma/migrations/<timestamp>_phase1_init/`
- Applies it to your DB
- Regenerates the Prisma client at `node_modules/@prisma/client`
- Prints `Your database is now in sync with your schema`

**If it fails:**
- `Engine binary not found`: your machine can probably reach `binaries.prisma.sh`; mine couldn't. Run `npx prisma generate` first to download engines.
- `relation already exists`: drop and recreate the database, or use `npx prisma migrate reset` (DESTRUCTIVE — only for dev).
- `enum value already exists`: the schema's enum values must be valid Postgres identifiers (uppercase, no spaces). They are; if this fires, something else is wrong with the connection.

**Verify the schema landed:**

```bash
npx prisma studio
```

Open in browser. You should see 15 models including `workspaces`, `ad_accounts`, `daily_stats`, `metric_trends`, `detected_issues`, `recommendations`, `health_scores`, `knowledge_rules`, `industry_profiles`. Each should have zero rows.

---

## 13.2 — Run the seed

```bash
# package.json needs:  "prisma": { "seed": "tsx prisma/seed.ts" }
npx prisma db seed
```

**Expected console output:**
```
⟳ Resetting seed tables…
⟳ Industry profiles…
⟳ Knowledge rules (EN + AR)…
⟳ Users, workspaces, members…
⟳ Ad accounts, campaigns…
⟳ Daily stats (30d)…
⟳ Campaign snapshots, trends, issues, recs, health…
✓ Seed complete.
  Furniture: health 82 · AUDIENCE_FATIGUE + DECLINING_RESULTS → REFRESH_CREATIVES
  Cosmetics: health 91 · LOW_CTR → IMPROVE_HOOKS (cosmetics-specific knowledge)
```

> **Important note about the seed's printed health scores (82, 91):**
> These are the OLD v1 numbers the seed writes for the *initial* state. Step 13.4 will run HealthScoreEngine v2 over the seeded data and OVERWRITE these with the honest v2 numbers (51, 67). The seed values are placeholder — they get replaced by real engine computation.

**Verify in Studio:**
- `workspaces` has 2 rows
- `ad_accounts` has 2 rows, currency = "IQD"
- `daily_stats` has ~62 rows total (30 days × 2 accounts + 4 campaign snapshots)
- `knowledge_rules` has 8 rows (4 codes × 2 locales)
- `industry_profiles` has 2 rows: furniture, cosmetics

**If the seed throws an FK violation:** the static check verified delete order in code; if it still fails, it means Postgres has DEFERRED constraints active somewhere, or the seed isn't running in a transaction. Wrap the whole `main()` body in `prisma.$transaction(async (tx) => { ... })` if needed.

**If BigInt fields complain:** the seed writes BigInt literals (e.g. `13000n`). If Prisma rejects them with "value out of range", check that the column is actually `BigInt` in the migration (Postgres type `bigint`, not `integer`).

---

## 13.3 — Run the engines manually (no Meta yet)

Create a one-off script to drive the engine chain against the seeded data:

```ts
// runEngines.ts (create at project root for Step 13)
import { PrismaClient, EntityType } from "@prisma/client";
import { AnalyticsEngine } from "./src/engines/analytics/AnalyticsEngine";
import { RulesEngine } from "./src/engines/rules/RulesEngine";
import { RecommendationEngine } from "./src/engines/recommendation/RecommendationEngine";
import { HealthScoreEngine } from "./src/engines/health/HealthScoreEngine";

const prisma = new PrismaClient();

async function main() {
  // Find the furniture ad account
  const furnitureWs = await prisma.workspace.findFirst({
    where: { name: "Furniture Showroom" },
    include: { adAccounts: true },
  });
  if (!furnitureWs) throw new Error("Furniture workspace not found — did you seed?");
  const acc = furnitureWs.adAccounts[0];
  if (!acc) throw new Error("No ad account on furniture workspace");

  console.log(`Running engines for ad_account ${acc.id} (${acc.name})\n`);

  const asOf = new Date("2026-06-14T12:00:00Z");

  // 1. Analytics
  const analytics = new AnalyticsEngine(prisma);
  const a = await analytics.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Analytics:", a.ok ? "ok" : a.error);
  console.log("  trends:", a.trends);

  // 2. Rules
  const rules = new RulesEngine(prisma);
  const r = await rules.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Rules:", r.ok ? "ok" : r.error);
  console.log("  issues:", r.issues.map(i => `${i.issueCode}/${i.severity}`));

  // 3. Recommendation
  const rec = new RecommendationEngine(prisma);
  const rc = await rec.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Recommendation:", rc.ok ? "ok" : rc.error);
  console.log("  action:", rc.recommendation?.actionCode, "priority:", rc.recommendation?.priority);

  // 4. Health Score (v2)
  const health = new HealthScoreEngine(prisma);
  const h = await health.run(EntityType.ACCOUNT, acc.id, { asOf });
  console.log("Health:", h.ok ? "ok" : h.error);
  console.log("  score:", h.score);
  console.log("  breakdown:", JSON.stringify(h.breakdown.facets, null, 2));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
```

```bash
npx tsx runEngines.ts
```

**Expected output (approximate — the exact numbers depend on the seed's daily values):**

```
Analytics: ok
  trends: { ctrTrend: -0.28, cpmTrend: 0.14, frequencyTrend: 0.23, resultsTrend: -0.32, spendTrend: 0.06 }
Rules: ok
  issues: [ 'AUDIENCE_FATIGUE/MEDIUM', 'DECLINING_RESULTS/HIGH', 'HIGH_FREQUENCY/LOW', ... ]
Recommendation: ok
  action: REFRESH_CREATIVES priority: HIGH
  (or PAUSE_AND_RELAUNCH/CRITICAL if 3 corroborating signals fired)
Health: ok
  score: ~50  (give or take 5 — depends on exact seed numbers your run sees)
  breakdown: { trend: {...}, ctr: {...}, frequency: {...}, cpm: {...} }
```

> **The exact numbers may differ from the in-sandbox tests** because the seed's `daysAgo(0)` is "today on YOUR machine" not "2026-06-14 in the test". The shapes and codes should match.

**If Analytics returns all-null trends:** the seed's date range doesn't overlap the engine's window (`asOf - lag - windowDays` to `asOf - lag`). Look at `runEngines.ts`'s `asOf` vs what dates the seed actually wrote. The seed uses `daysAgo(0)` = today; if you set `asOf = new Date("2026-06-14")` but today is a different date, the windows miss.

**If Rules returns zero issues but Analytics had real trends:** the rules thresholds didn't fire. Print `signals` from inside `RulesEngine.buildSignals` to debug.

**If Health returns score 0 or NaN:** check `breakdown.facets` — one of the facets is producing a non-number. Most likely culprit: a daily_stat row has `frequency: null` and the `Number(null)` coercion in `avgRate` is producing NaN. The code defends against this; if it's still happening, the daily row shape from Postgres differs from what the in-memory mock returned.

---

## 13.4 — Verify getDashboard produces the DTO from real data

```ts
// runDashboard.ts
import { getDashboard } from "./src/services/getDashboard";

async function main() {
  // Need the workspace ID from seed
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const ws = await prisma.workspace.findFirst({ where: { name: "Furniture Showroom" } });
  if (!ws) throw new Error("seed not run");

  const dto = await getDashboard(ws.id);

  console.log("\n══ DashboardDTO ══");
  console.log(JSON.stringify(dto, null, 2));

  // Spot-checks
  console.log("\n══ Spot-checks ══");
  console.log("health.score:", dto.health.score, "band:", dto.health.band);
  console.log("issues:", dto.issues.length, "→", dto.issues.map(i => i.code).join(", "));
  console.log("priorityAction:", dto.priorityAction?.actionCode, "/", dto.priorityAction?.text);
  console.log("bestCampaign:", dto.bestCampaign?.name, dto.bestCampaign?.health);
  console.log("worstCampaign:", dto.worstCampaign?.name, dto.worstCampaign?.health);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
```

```bash
npx tsx runDashboard.ts
```

**Expected:** a DashboardDTO matching `test_dto_shape.ts`'s shape. The v2 health score should match what Step 13.3 wrote (around 50). Issues localized via KnowledgeEngine — `dto.issues[0].title` should be in English (the locale defaults to EN).

**Critical check — DTO shape parity:**
The JSON output should have exactly these top-level keys: `workspace, health, kpis, trendSeries, issues, priorityAction, bestCampaign, worstCampaign`. **No extras.** If you see `algorithmVersion` or `breakdownJson` leaking out, the boundary leaked and Step 12 has a bug.

**If issues[0].title is the issue CODE (e.g. "AUDIENCE_FATIGUE") instead of human text:** KnowledgeEngine returned null. Either the seed didn't write the rule, or `industryProfileId` lookup failed. Verify with: `SELECT * FROM knowledge_rules WHERE issue_code = 'AUDIENCE_FATIGUE';` — should return 2 rows (EN + AR universal default).

**If recommendations from cosmetics don't show the cosmetics-specific text:** the industry override failed. Check that `workspace.industry_profile_id` matches `industry_profiles.id` for the cosmetics row.

---

## 13.5 — Wire HTML to the DTO (optional but recommended)

If you want to *see* the verdict the system actually produces:

```bash
# Save the DTO to JSON, inject into the dashboard mockup
npx tsx runDashboard.ts > /tmp/dto_raw.txt
# Extract just the JSON (the script also prints spot-checks at the end)
# Easiest: tweak runDashboard.ts to emit JUST the JSON to a file
```

Then in `dashboard.html`, replace the embedded `ALL` object with `{ ws_furn: <your DTO>, ws_cosm: <cosmetics DTO> }` and open the file. The dashboard renders. If the verdict is recognizable to a furniture owner, Step 13 is structurally done.

**The honest test of this whole step:** open the HTML, look at it for 30 seconds, and ask yourself "if I were the furniture client, would this surprise me, or would I nod?" If you'd nod, the architecture survived contact with reality. If you'd be confused, *that confusion is the data* — fix the code that produced it, not the test.

---

## 13.6 — Meta sync (optional for Step 13; required for Step 14)

Once 13.0–13.5 pass against seeded data, swap the seeded daily_stats for real Meta data:

```ts
// runSync.ts
import { PrismaClient } from "@prisma/client";
import { MetaClient } from "./src/services/metaClient";
import { SyncAccountWorker } from "./src/workers/syncAccount";

const prisma = new PrismaClient();
const meta = new MetaClient({
  apiVersion: "v20.0",
  accessToken: process.env.META_ACCESS_TOKEN!,
});

async function main() {
  const acc = await prisma.adAccount.findFirst({
    where: { name: "Furniture — Meta" },
  });
  if (!acc) throw new Error("seed first");

  // Update externalAccountId to the REAL Meta account id (act_<numeric>)
  // before running. The seed wrote a placeholder.
  await prisma.adAccount.update({
    where: { id: acc.id },
    data: { externalAccountId: process.env.META_ACCOUNT_ID! },
  });

  const worker = new SyncAccountWorker(prisma, meta);
  const result = await worker.sync(acc.id, { backfillDays: 7 });
  console.log(result);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
```

```bash
export META_ACCESS_TOKEN="..."   # your real long-lived token
export META_ACCOUNT_ID="act_..." # your real Meta ad account id
npx tsx runSync.ts
```

**Expected:**
- `result.ok === true`
- `result.rowsFetched` matches days in the backfill window
- `daily_stats` rows updated with real numbers for the past 7 days
- `raw_insights` rows appended (audit trail)

**Then re-run the engines** (13.3) and **re-run getDashboard** (13.4). The health score is now based on real Meta numbers. Whatever it produces is the truth about that account.

**The first time you do this, the dashboard will surprise you.** That's the point of Step 15. Write down what surprises you. Each surprise is a candidate fix — but BEFORE fixing, ask: "is the engine wrong, or is my prior wrong?" Often it's the prior.

---

## What success looks like

You've completed Step 13 when:

1. All in-sandbox tests still pass on your machine (13.0).
2. `prisma migrate dev` and `prisma db seed` complete without error (13.1, 13.2).
3. `runEngines.ts` runs the full chain and produces a DashboardDTO-compatible state in the DB (13.3).
4. `runDashboard.ts` produces a DTO whose shape matches `test_dto_shape.ts` exactly (13.4).
5. (Optional) The HTML renders the DTO and you can read the verdict.
6. (Required for Step 14) `runSync.ts` pulls real Meta data and the engines re-run cleanly against it.

**You have NOT completed Step 13 if:**

- You changed the test fixtures to make them pass against real data. Tests assert intent; reality should change the *code*, not the *test*.
- You added fields to DashboardDTO to handle something unexpected. The DTO is frozen; surprises become engine-level fixes.
- You bumped HEALTH_ALGORITHM_VERSION because a real number looked "too low". v2 is honest; if the number is wrong, the model is wrong, but you fix that AFTER Step 15 (real users).
- You skipped 13.6 because the seeded numbers were already nice.

---

## When something breaks

The static pre-flight caught the categories most likely to break. What remains is dynamic behavior:

| Symptom | Most likely cause |
|---|---|
| All trends null | Date window mismatch (asOf vs seed dates) |
| Rules find no issues | Trends are null, OR thresholds didn't fire |
| Recommendation null | No issues, OR no composition rule matched |
| Health score 0 | One facet produced NaN — print breakdown to find which |
| Issue title is the CODE | KnowledgeEngine returned null; check knowledge_rules table |
| Cosmetics override not applied | Workspace.industry_profile_id not set correctly |
| DTO has extra fields | Boundary leaked; revert that change |
| Prisma "Unknown arg" | Composite key spelling drift; static-check missed something |
| BigInt serialization error | JSON.stringify of BigInt — Prisma's BigInt fields need coercion in API responses |

That last one is worth flagging because it WILL happen the first time you try to JSON.stringify the DTO. JavaScript's BigInt is not JSON-serializable by default. The DTO already coerces `Number(r.messages)` etc. inside `getDashboard()`, so the DTO itself is BigInt-free. But if you log raw Prisma results, you'll see the error. That's the boundary working.

---

## Reality may force NEW files. Don't pre-build them.

Examples of legitimate new files that might appear during Step 13:
- `runEngines.ts`, `runDashboard.ts`, `runSync.ts` (orchestration scripts, not production code)
- A logger wrapper if engines need observability under real load
- A `.env.example` documenting required environment variables

Examples that would mean architecture leaked:
- A new engine
- A new DTO field
- A new schema model
- A new "AI" anything
- A new feature

If you find yourself reaching for the second list, **stop**. Reality didn't force that — your instinct did. Save it for after Step 15.
