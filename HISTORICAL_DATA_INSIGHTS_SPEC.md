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
2. Any genuinely aggregate rollup (e.g. account-wide historical trend) is
   computed by a **low-frequency background job or a materialized summary row**,
   not synchronously in the advisor request. If a rollup table is needed, add it
   as additive (`CampaignHistoryRollup`) — out of scope to design fully here,
   flagged as open question Q3.

> **INVARIANT (H-4):** no historical query executed on a user-facing or
> AI-generation request path performs an unbounded scan / live aggregation over
> `daily_stats`. Reads hit the pre-aggregated snapshot (or a materialized rollup)
> via the indexes in §1.3.

## 2.3 Retention asymmetry — verify

`campaign_history_snapshots` is **exempt** from `pruneRawInsights` (it is not a
raw_insight). Confirm the prune job's `where` targets only `raw_insights` and
cannot cascade to the new table (it can't — different model — but state it so the
reviewer checks). The whole point is that history **outlives** raw pruning.

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
  topPerformers: Array<{        // up to 3, same objective, highest finalRoas
    name: string;               // already-stored campaign name (data, pre-existing)
    objective: string;
    finalRoas: number | null;
    costPerMessage: number | null;
    keyTrait: string;           // engine-derived, PRE-TRANSLATED Arabic phrase
  }>;
  recentFailures: Array<{       // up to 2, recently ended, low finalRoas / PAUSE verdict
    name: string;
    finalRoas: number | null;
    lessonArabic: string;       // engine-derived, PRE-TRANSLATED Arabic phrase
  }>;
}
```

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
(the narration cron, `brainNarrationCron.ts`), NOT inside `ClaudeCMO`. It queries
the Part 2 read path (`getCampaignHistory`) for the campaign's `workspaceId` +
`objective`, maps the top/worst rows into the closed-set block, and passes it in.
`ClaudeCMO` stays a pure translator. This preserves the cordon: `ClaudeCMO`
imports no Prisma model and knows no DB shape.

---

## 4. Files in scope

| File | Part | Nature |
|---|---|---|
| `prisma/schema.prisma` + new migration | 1 | **additive** model `CampaignHistorySnapshot` (no existing-table changes) |
| `src/workers/syncAccount.ts` | 1 | status-transition detection → enqueue one-shot freeze (branch in existing write) |
| `src/lib/campaignFreeze.ts` (new) | 1 | deep-harvest assembly; reuses `MetaClient`, `mapMetaInsight`, `resolveCurrencyMinorFactor` |
| `src/services/getCampaignHistory.ts` (new) | 2 | history read path (no status filter); isolated from `getDashboard` |
| `src/services/ClaudeCMO.ts` | 3 | additive optional `history` payload field + one gated `SYSTEM_PROMPT` section |
| `src/workers/brainNarrationCron.ts` | 3 | assemble `history` block, pass into `generateMerchantNarration` |

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

---

## 6. Open questions before kickoff

1. **Freeze trigger fidelity (Q1).** Status-transition detection inside the sync
   write is reliable for `ACTIVE → PAUSED/ARCHIVED`. But a campaign whose
   `end_time` elapsed while *already paused* won't re-transition. Do we also want
   to persist Meta's `stop_time`/`end_time` on `Campaign` (a small additive
   column) so the freeze can fire on date-elapse too? **Recommend yes**, as a
   follow-up — Part 1 ships on status-transition first.

2. **Backfill (Q2).** Campaigns already closed *before* this ships have no freeze
   row (and their `raw_insights` may already be pruned). Do we run a one-time
   backfill that freezes existing `PAUSED`/`ARCHIVED` campaigns from whatever
   `daily_stats` survive (degraded fidelity, no raw audit), or only freeze
   campaigns that close *after* deploy? **Recommend forward-only** to avoid
   fabricating low-confidence history; flag backfilled rows if we do them.

3. **Rollup table (Q3).** §2.2 leaves account-wide historical trend as either a
   materialized `CampaignHistoryRollup` or on-demand-but-cached. Which do you
   want? Depends on whether the AI advisor needs cross-campaign aggregates beyond
   the top-N/worst-N per-objective queries the snapshot indexes already serve.

4. **History recency window for AI (Q4).** For §3.2 `recentFailures`, how far
   back is "recent" — last 30/60/90 days of `endedAt`? And should `topPerformers`
   be all-time or windowed? Pure product-tuning of the payload query; your call.

Answer these and the epic is execution-ready. I'll review Corsair's diffs against
H-1..H-9 (which subsume the still-active C-1..C-5 currency invariants) before any
commit.
