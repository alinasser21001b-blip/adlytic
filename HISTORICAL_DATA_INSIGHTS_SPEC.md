# Historical Data & AI Insight Engine — Architecture & Execution Spec

> Major architectural epic in three parts: **(1)** Post-Campaign "Final Freeze"
> deep harvest, **(2)** a Longitudinal/Historical store the AI advisor can query
> without the active-status cordon filtering it out, and **(3)** Advanced AI
> Insight Prompts that inject historical context for proactive, comparative
> advice. As with every prior phase: **this document is the spec; Corsair
> implements; I review each diff against the §6 invariants before any commit.**
>
> Convention from prior phases — **EXISTS** = already in production, do not
> recreate; **GAP** = net-new build; **HARDEN** = tighten an existing path.
> All line numbers current as of inspection.

---

## 0. Why this epic exists (the data-loss problem)

The platform is excellent at the **present** and blind to the **past**. Three
independent mechanisms quietly erase a campaign's history the moment it stops
running:

1. **The active-status cordon.** Every read path filters
   `where: { status: "ACTIVE" }` — `getDashboard.ts:267, 465, 823, 946`;
   `getPlatformStats.ts:123–134`. The instant Meta reports a campaign as
   paused/ended, `mapMetaEntityStatus` (`syncAccount.ts:72–81`) collapses it to
   `PAUSED`/`ARCHIVED` and it **disappears from every dashboard and brain query**.
   Its `daily_stats` rows still exist in the DB but nothing reads them.

2. **Raw-insight pruning.** `pruneRawInsights` (`serve.ts:232–250`, 24h cycle)
   deletes `raw_insights` past retention. That is the IQD repair's ground-truth
   source (`iqdRepair.ts` raw-backed rescale). Once pruned, a closed campaign's
   forensic record is gone forever.

3. **No post-mortem snapshot.** `campaign_brain_snapshots` are per-tick and only
   written while the brain ticks a **live** campaign. When ticking stops, no
   final, immutable "this is how the campaign ended" record is ever produced.

**Net effect:** ended campaigns become un-queryable, their raw audit trail is
pruned, and the AI advisor has **zero institutional memory** — it cannot say
"your last three MESSAGES campaigns that beat a 1.10 cost-per-message all shared
trait X." This epic fixes all three without touching the live hot path.

---

# PART 1 — Post-Campaign Data Harvesting ("The Final Freeze")

## 1.1 Trigger model — GAP

A campaign should be frozen **exactly once**, when it transitions out of an
actively-delivering state. Detection sources, in priority order:

| Signal | Source (EXISTS) | Note |
|---|---|---|
| Status transition `ACTIVE → PAUSED/ARCHIVED` | `syncAccount.ts` writes campaign `status` each sync via `mapMetaEntityStatus` (`:72–81`) | primary trigger; compare prior DB status vs incoming |
| `stop_time` / end-date elapsed | Meta campaign fields (not currently persisted) | secondary; `GAP` — needs a campaign `endedAt` column |
| Manual operator close | n/a | out of scope this epic |

**Spec:** detect the transition inside the existing sync write, NOT a new poller.
When `syncAccount` is about to persist a campaign whose **stored** status is a
live state and whose **incoming** status is terminal (`PAUSED`/`ARCHIVED`),
enqueue a **one-shot Final-Freeze job** for that campaign. Idempotency: a freeze
row already existing for `(campaignId)` short-circuits — re-freezing is a no-op
(see §1.3 unique key). This guarantees the freeze fires **once** and never
re-runs on subsequent syncs of an already-closed campaign.

> **INVARIANT (H-1):** the freeze trigger is a *branch inside the existing sync
> write*, gated on a status transition. It introduces **no new cron interval and
> does not change the 6h loop** (`serve.ts` `scheduleSyncLoop :220–226`).

## 1.2 Deep-harvest payload — GAP

When the freeze fires, perform **one** deep pull (reusing the existing
transport-only `MetaClient`, no new client) and assemble an immutable snapshot.
Capture, at campaign granularity:

| Bucket | Source method (EXISTS) | Field notes |
|---|---|---|
| Lifetime delivery totals | `metaClient.getLifetimeTotals` | spend (minor, via mapper), impressions, reach, clicks, messages, purchases, leads |
| Final ROAS | `mapMetaInsight` → `roas` (`insightMapper.ts:92`) | **factor-invariant ratio — store as-is, never re-scale** (see C-3) |
| Breakdown matrix | `breakdown_stats` (EXISTS) + `mapMetaBreakdownInsight` | aggregate the campaign's age / gender / publisher_platform / platform_position rows into the frozen blob |
| Asset/creative performance | `AdCreative` (EXISTS, `schema:255`) joined via `Ad.creativeId` | top creatives by spend/messages at close |
| Final brain verdict | latest `campaign_brain_snapshots` row for the campaign | last `patternSignature`, `action`, `finalScore`, `narrationJson` |
| Currency context | `adAccount.currency` + resolved `currencyMinorFactor` | persist the factor **used**, so a future reader never re-guesses |

**Money rule (non-negotiable):** all monetary fields pass through the existing
cordon (`mapMetaInsight`) so they are scaled **exactly once** by the resolved
factor. IQD stays `Math.round(major × 1)` — **the Final Freeze must reuse
`resolveCurrencyMinorFactor`, never inline a literal factor.** This keeps C-1/C-2
intact (see FINAL_POLISH_SPEC Part 1).

> **INVARIANT (H-2):** the freeze captures `raw_insights` ground truth **before**
> `pruneRawInsights` can delete it. Either the freeze copies the raw rows into the
> frozen blob, or it runs the deep pull fresh from Meta at freeze time. Pruning
> retention is **not** shortened or otherwise touched.

## 1.3 Storage — GAP (new immutable model)

A frozen post-mortem is **append-only and immutable** — semantically unlike the
upsert-converging `daily_stats`/`breakdown_stats`. It earns its own model.

**Proposed model `CampaignHistorySnapshot`** (additive migration; **no column or
key changes to any existing table** — preserves C-5):

```
model CampaignHistorySnapshot {
  id                 String   @id @default(cuid())
  workspaceId        String   @map("workspace_id")
  campaignId         String   @map("campaign_id")        // internal Campaign.id
  externalCampaignId String   @map("external_campaign_id")
  adAccountId        String   @map("ad_account_id")

  name               String                              // campaign name at close
  objective          String?                             // MESSAGES / REACH / ...
  finalStatus        String   @map("final_status")       // PAUSED | ARCHIVED
  startedAt          DateTime? @map("started_at")
  endedAt            DateTime? @map("ended_at")

  // Frozen lifetime totals — minor units, scaled ONCE via the cordon
  lifetimeSpendMinor BigInt   @map("lifetime_spend_minor")
  impressions        BigInt
  reach              BigInt
  clicks             BigInt
  messages           BigInt
  purchases          BigInt
  leads              BigInt
  revenueMinor       BigInt   @map("revenue_minor")
  finalRoas          Float?   @map("final_roas")         // factor-invariant ratio

  currency           String
  currencyMinorFactor Int     @map("currency_minor_factor") // the factor USED

  // Forensic blobs — breakdown matrix, top creatives, final brain verdict
  breakdownJson      Json?    @map("breakdown_json")
  creativeJson       Json?    @map("creative_json")
  finalBrainJson     Json?    @map("final_brain_json")   // last snapshot's payload + narration

  frozenAt           DateTime @default(now()) @map("frozen_at")

  @@unique([campaignId])                                  // one freeze per campaign (idempotent)
  @@index([workspaceId, endedAt])
  @@index([workspaceId, objective, finalRoas])            // AI "top performers by objective" query
  @@map("campaign_history_snapshots")
}
```

The `@@unique([campaignId])` is the idempotency guarantee from §1.1. The
`(workspaceId, objective, finalRoas)` index directly serves the Part 3 AI query
("top-3 past performers for this objective") so it is **pre-aggregated and
indexed, never a full scan** (honors the "cached/pre-aggregated" invariant).

---

# PART 2 — Longitudinal / Historical Store (queryable past)

## 2.1 The cordon problem restated — GAP

The history rows from Part 1 are useless if the same `status = "ACTIVE"` filter
hides them. **Spec:** historical reads go through a **dedicated read path that
never inherits the active-status filter.** Concretely:

- A new read module (e.g. `getCampaignHistory.ts`) queries
  `campaign_history_snapshots` **by `workspaceId` only** — status is irrelevant
  because every row is, by definition, a closed campaign.
- This module is **isolated** from `getDashboard.ts`. The live dashboard's
  `where: { status: "ACTIVE" }` clauses stay **byte-identical** — we do not
  relax them (that would leak ended campaigns into the live KPIs). History is a
  **separate surface**, not a widening of the live query.

> **INVARIANT (H-3):** no existing `status: "ACTIVE"` filter is loosened or
> removed. Historical data is exposed through a **new, additive** read path that
> queries the new table only. The live dashboard's result set is unchanged.

## 2.2 Pre-aggregation & caching — HARDEN

Deep historical questions ("rolling 12-month avg ROAS by objective") must never
run an unbounded scan on a request path. Spec:

1. The Part 1 freeze **pre-computes** lifetime totals at write time, so the
   common AI queries (top-N by `finalRoas`, worst-N by `finalRoas`, count by
   `objective`) are **single indexed reads** against `campaign_history_snapshots`
   — no aggregation over `daily_stats` at request time.
2. Any genuinely aggregate rollup (account-wide / cross-campaign historical
   trend) is computed by a **low-frequency background job into a materialized
   `CampaignHistoryRollup` row**, never synchronously in the advisor request.
   This is now a **confirmed** part of the build (Q3 decided) — fully designed in
   §2.4 below.

> **INVARIANT (H-4):** no historical query executed on a user-facing or
> AI-generation request path performs an unbounded scan / live aggregation over
> `daily_stats`. Reads hit the pre-aggregated snapshot (or a materialized rollup)
> via the indexes in §1.3.

## 2.3 Retention asymmetry — verify

`campaign_history_snapshots` is **exempt** from `pruneRawInsights` (it is not a
raw_insight). Confirm the prune job's `where` targets only `raw_insights` and
cannot cascade to the new table (it can't — different model — but state it so the
reviewer checks). The whole point is that history **outlives** raw pruning.

## 2.4 Account-wide rollup — GAP (materialized `CampaignHistoryRollup`) — Q3 DECIDED

The AI advisor needs cross-campaign, account-wide historical narration (e.g.
"your beauty campaigns averaged 2.1× ROAS across the last quarter"). Computing
that on the advisor request path would mean aggregating across every snapshot row
per call — exactly the unbounded request-path scan H-4 forbids. **Spec:**
pre-compute it into a **materialized rollup table**, refreshed by a low-frequency
background job, and have the advisor read **one indexed row**.

**Grain:** one row per `(workspaceId, objective, windowKey)`, where `windowKey`
is a closed enum of named windows — `ALL_TIME`, `LAST_90D`, `LAST_30D` — so the
advisor never passes a free-form date range. (`ALL_TIME` backs `topPerformers`;
`LAST_90D` backs the `recentFailures` cohort per Q4.) The
**account-wide-across-all-objectives** aggregate is held in a row whose
`objective` is the **sentinel literal** `"__ALL__"`, **not `NULL`**.

> **Postgres NULL-uniqueness fix (flagged by Cursor in Part 1 review).** Postgres
> treats `NULL` as *distinct from every other NULL*, so a nullable `objective` in
> `@@unique([workspaceId, objective, windowKey])` would **not** prevent duplicate
> account-wide rows — two `(ws, NULL, ALL_TIME)` rows would both be admitted, and
> the rollup upsert would have no deterministic conflict target. **Decision:**
> make `objective` **`NOT NULL`** and use a reserved sentinel `"__ALL__"` for the
> all-objectives aggregate. The double-underscore prefix cannot collide with any
> real Meta objective (Meta objectives are bare uppercase tokens — `MESSAGES`,
> `REACH`, `OUTCOME_SALES`, `OUTCOME_ENGAGEMENT`, … — never underscore-prefixed).
> With no NULL in the key, the plain composite `@@unique` is sufficient and the
> upsert conflict target is well-defined; **no partial index is required.**
> The writer maps `objective ?? "__ALL__"` on the way in; the reader maps it back
> (or queries the sentinel directly for account-wide). The per-objective rows keep
> their real objective string unchanged.

```
model CampaignHistoryRollup {
  id              String   @id @default(cuid())
  workspaceId     String   @map("workspace_id")
  objective       String                               // real objective, or sentinel "__ALL__" (NOT NULL)
  windowKey       String   @map("window_key")          // ALL_TIME | LAST_90D | LAST_30D

  // Aggregates over the matching CampaignHistorySnapshot rows
  campaignCount   Int      @map("campaign_count")
  avgRoas         Float?   @map("avg_roas")             // simple mean of finalRoas (factor-invariant)
  weightedRoas    Float?   @map("weighted_roas")        // revenue-weighted, spend/revenue both minor
  avgCostPerMsgMinor BigInt? @map("avg_cost_per_msg_minor")
  totalSpendMinor BigInt   @map("total_spend_minor")    // minor units — already scaled in snapshots
  totalRevenueMinor BigInt @map("total_revenue_minor")
  totalMessages   BigInt
  totalPurchases  BigInt

  // Tie-break / display context (factor for the dominant currency in the cohort)
  currency        String?
  currencyMinorFactor Int? @map("currency_minor_factor")

  computedAt      DateTime @default(now()) @map("computed_at")

  @@unique([workspaceId, objective, windowKey])         // one row per cohort/window — upsert target
  @@index([workspaceId, windowKey])
  @@map("campaign_history_rollups")
}
```

**Refresh job (low-frequency, additive — NOT a new fast cron):**

- Runs on a **slow cadence** (daily is sufficient; the data only changes when a
  campaign freezes). It must be a *separate* low-frequency schedule and must
  **not** ride the 6h sync loop or shorten any interval (preserves H-1 in spirit:
  no live-hot-path change). A daily tick or a piggyback on an existing slow
  maintenance pass (alongside `pruneRawInsights`'s 24h cycle) is acceptable;
  the per-tick **freeze** does NOT recompute the rollup inline.
- For each `(workspaceId, objective ∈ {distinct real objectives} ∪ {"__ALL__"},
  windowKey)` it aggregates the matching `campaign_history_snapshots` and
  **upserts** the rollup row. The `"__ALL__"` cohort aggregates **all** of the
  workspace's snapshots regardless of objective (it is not a row in the data — it
  is the union). Because `objective` is `NOT NULL`, the composite `@@unique` is a
  valid, deterministic upsert conflict target — converging like `daily_stats`,
  not append-only.
- **Money rule:** snapshot monetary fields are **already** scaled once (§1.2), so
  the rollup only **sums minor-unit values** — it performs **no second scaling**
  and inlines **no factor** (preserves H-6). ROAS fields are factor-invariant
  ratios, aggregated as ratios, **never re-scaled** (H-7). `weightedRoas` uses
  `ΣrevenueMinor / ΣspendMinor`, which is factor-invariant because both numerator
  and denominator carry the same factor.
- Cohorts mixing currencies: `weightedRoas` stays valid (dimensionless);
  `total*Minor` sums are only meaningful within a single currency, so the rollup
  records the cohort's dominant `currency`/`currencyMinorFactor` for the reader,
  and the advisor narrates **ratios** (ROAS) cross-currency, **absolute money**
  only single-currency.

> **INVARIANT (H-10):** the account-wide rollup is a **materialized, upserted**
> table refreshed by a **low-frequency background job** — never computed on a
> user/AI request path (subsumes H-4 for cross-campaign aggregates). Its refresh
> introduces **no new fast cron and does not touch the 6h sync loop**. It sums
> already-scaled minor-unit money (no second scaling, no inlined factor) and
> treats ROAS as a factor-invariant ratio (inherits H-6/H-7).

---

# PART 3 — Advanced AI Insight Prompts (Contextual Learning)

> **HARD CONSTRAINT:** `ClaudeCMO` `SYSTEM_PROMPT` (`ClaudeCMO.ts:193–267`)
> enforces **ZERO HALLUCINATION** — the model may use *only* values present in
> the JSON payload. Therefore historical context is injected as **structured,
> closed-set, pre-translated payload data**, NEVER as free-text instructions, and
> NEVER by relaxing the anti-hallucination rule.

## 3.1 Current state — EXISTS

`generateMerchantNarration` (`ClaudeCMO.ts:329`) builds `CmoPayload` from a
**single** `BrainTickResult` — it is entirely present-tick. There is no
comparative or longitudinal context. The merchant gets per-campaign-per-tick
narration with no memory of past campaigns.

## 3.2 Historical context block — GAP (additive payload field)

Extend `CmoPayload` with an **optional** `history` field (additive — when absent,
behavior is byte-identical to today, so existing narration is unchanged):

```
history?: {
  topPerformers: Array<{        // up to 3, same objective, highest finalRoas, ALL-TIME (Q4)
    name: string;               // already-stored campaign name (data, pre-existing)
    objective: string;
    finalRoas: number | null;
    costPerMessage: number | null;
    keyTrait: string;           // engine-derived, PRE-TRANSLATED Arabic phrase
  }>;
  recentFailures: Array<{       // up to 2, ended within LAST 90 DAYS (Q4), low finalRoas / PAUSE verdict
    name: string;
    finalRoas: number | null;
    lessonArabic: string;       // engine-derived, PRE-TRANSLATED Arabic phrase
  }>;
}
```

**Window rule (Q4 DECIDED):** `topPerformers` is drawn **all-time** (the
`ALL_TIME` cohort — a persistent "hall of fame" of winning strategies), ranked by
`finalRoas` within the same `objective`. `recentFailures` is restricted to
campaigns whose `endedAt` falls in the **last 90 days** (the `LAST_90D` cohort),
keeping lessons tied to current market conditions. Both windows map directly onto
the §2.4 rollup `windowKey` enum, so the caller reads pre-aggregated rows rather
than scanning snapshots at request time.

**Sourcing rule:** every string in this block is either (a) stored data
(campaign name) or (b) an **engine-computed, pre-translated Arabic phrase** —
mirroring the existing treatment of `v2.dna.deviations[]` and
`v2.resonance.directive`, which `SYSTEM_PROMPT` already declares "SACRED" and
quotable verbatim (`ClaudeCMO.ts:212–214`). The LLM **composes** with these
phrases; it never invents a comparison. This keeps ZERO-HALLUCINATION intact.

## 3.3 Prompt rules — GAP (additive SYSTEM_PROMPT section)

Add **one** new bounded section to `SYSTEM_PROMPT` (no edits to existing rules):

- *"HISTORICAL CONTEXT (apply only if `history` is present)"* — instruct the CMO
  to weave at most **one** comparative sentence ("حملتك الحالية تشبه «<name>» التي
  حققت أفضل أداء سابق…") drawn strictly from `history.*`. Forbid citing any
  number not in the block. Forbid inventing traits beyond the supplied
  `keyTrait`/`lessonArabic`. Cap added length to preserve the 2–4-sentence
  `arabicNarration` budget (`ClaudeCMO.ts:264–266`).

> **INVARIANT (H-5):** the AI change is **purely additive** — an optional payload
> field plus one gated prompt section. With `history` absent, `CmoPayload`,
> `buildPayload`, and the generated narration are **byte-identical** to current
> production. No existing prompt rule, tone-matrix row, or output-key contract is
> modified.

## 3.4 Where the context is built — GAP

The `history` block is assembled by the **caller** of `generateMerchantNarration`
(the narration cron, `brainNarrationCron.ts`), NOT inside `ClaudeCMO`. It reads
the Part 2 path (`getCampaignHistory`) for the campaign's `workspaceId` +
`objective`: `topPerformers` from the `ALL_TIME` rollup cohort (or the indexed
`(workspaceId, objective, finalRoas)` snapshot top-N), `recentFailures` from the
`LAST_90D` cohort. It maps the rows into the closed-set block and passes it in.
`ClaudeCMO` stays a pure translator. This preserves the cordon: `ClaudeCMO`
imports no Prisma model and knows no DB shape.

---

## 4. Files in scope

| File | Part | Nature |
|---|---|---|
| `prisma/schema.prisma` + new migration | 1, 2 | **additive** models `CampaignHistorySnapshot` (Part 1) and `CampaignHistoryRollup` (Part 2 §2.4) — no existing-table changes |
| `src/workers/syncAccount.ts` | 1 | status-transition detection → enqueue one-shot freeze (branch in existing write) |
| `src/lib/campaignFreeze.ts` (new) | 1 | deep-harvest assembly; reuses `MetaClient`, `mapMetaInsight`, `resolveCurrencyMinorFactor` |
| `src/services/getCampaignHistory.ts` (new) | 2 | history read path (no status filter); isolated from `getDashboard` |
| `src/workers/rollupHistory.ts` (new) | 2 | low-frequency job: upsert `CampaignHistoryRollup` per `(workspaceId, objective, windowKey)`; sums already-scaled money, no re-scale (§2.4) |
| `src/services/ClaudeCMO.ts` | 3 | additive optional `history` payload field + one gated `SYSTEM_PROMPT` section |
| `src/workers/brainNarrationCron.ts` | 3 | assemble `history` block (all-time top / 90d failures), pass into `generateMerchantNarration` |

**Untouched:** `insightMapper.ts` (cordon), `iqdRepair.ts`, `currency.ts`,
`getDashboard.ts` live queries, `serve.ts` sync loop interval, all frontend
(`dashboardPage.ts`, layout bounds).

---

## 5. Invariants — review checklist

| ID | Invariant |
|---|---|
| H-1 | Freeze is a branch in the existing sync write, gated on a status transition. **No new cron, no change to the 6h loop interval.** |
| H-2 | Freeze captures ground truth **before** `pruneRawInsights` deletes it; pruning retention is untouched. |
| H-3 | **No** existing `status:"ACTIVE"` filter is loosened/removed; history is a new additive read path against the new table only. |
| H-4 | No user/AI request path runs an unbounded scan or live `daily_stats` aggregation; reads hit pre-aggregated indexed snapshots. |
| H-5 | AI change is additive: optional `history` field + one gated prompt section. With it absent, payload + narration are byte-identical. |
| H-6 | Money scaled **exactly once** via `mapMetaInsight` + `resolveCurrencyMinorFactor`; IQD `Math.round(×1)` preserved (inherits C-1/C-2/C-4). |
| H-7 | ROAS stored as the factor-invariant ratio — never re-scaled (inherits C-3). |
| H-8 | New table is additive; **no column/key change** to any existing model (inherits C-5). No frontend layout bound altered. |
| H-9 | `ClaudeCMO` stays a pure translator — imports no Prisma model; ZERO-HALLUCINATION rule unaltered; historical strings are stored data or engine-pre-translated only. |
| H-10 | Account-wide rollup is a **materialized, upserted** table refreshed by a **low-frequency background job** — never computed on a user/AI request path. No new fast cron; the 6h sync loop is untouched. Sums already-scaled minor-unit money (no second scaling, no inlined factor); ROAS treated as factor-invariant (inherits H-6/H-7). |

---

## 6. Resolved decisions (kickoff-locked, 2026-06-28)

All four open questions are decided. The epic is execution-ready.

1. **Freeze trigger fidelity (Q1) — DECIDED: status-transition first; `end_time`
   elapse is a follow-up.** Part 1 ships on the `ACTIVE → PAUSED/ARCHIVED`
   transition only (§1.1). Persisting Meta's `stop_time`/`end_time` on `Campaign`
   to also fire the freeze on date-elapse (for campaigns that expire while already
   paused) is a **deferred follow-up**, not in this epic's scope. Tracked as a
   known coverage gap: a campaign that lapses by end-date *while already paused*
   will not freeze until the follow-up lands.

2. **Backfill (Q2) — DECIDED: forward-only.** No backfill of pre-existing
   `PAUSED`/`ARCHIVED` campaigns. We start accumulating high-fidelity history from
   deploy forward and never fabricate low-confidence rows from surviving
   `daily_stats`. Campaigns closed before deploy simply have no snapshot; the AI
   treats "no history" as "no history," never as a zero.

3. **Rollup table (Q3) — DECIDED: materialized `CampaignHistoryRollup`.** The AI
   advisor *does* need account-wide / cross-campaign historical narration, so
   §2.2's account-wide trend is served by a **materialized rollup table**
   maintained by a low-frequency background job — never an on-demand aggregate on
   the request path. Full design now in §2.4 (previously out of scope).

4. **History recency window for AI (Q4) — DECIDED.** In §3.2: `recentFailures`
   window = **last 90 days** of `endedAt` (keeps lessons tied to current market
   conditions). `topPerformers` = **all-time** ("hall of fame" of winning
   strategies for the AI to learn from). Encoded in the §3.2 sourcing rule.

I'll review Corsair's diffs against H-1..H-10 (which subsume the still-active
C-1..C-5 currency invariants) before any commit.
