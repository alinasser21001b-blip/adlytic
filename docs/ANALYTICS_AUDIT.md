# Adlytic Analytics Audit — Semantic Integrity Review

**Date:** 2026-08-08
**Scope:** Meta ingestion → normalization → classification → metrics → diagnosis → AI → UI
**Method:** end-to-end code trace of every module that reads a campaign objective or computes a KPI.

---

## Executive summary

The suspicion in the brief was correct, but the mechanism is more specific — and more fixable — than "the system mixes up campaign types."

**Adlytic already had a correct semantic classifier.** `src/lib/campaignPurpose.ts` resolves a click-to-WhatsApp campaign shipped under an ODAX `OUTCOME_ENGAGEMENT` shell to `messaging`, using ad-set `destination_type` and `optimization_goal` — exactly the right evidence, in the right priority order. It is well-tested and it works.

**The failure was that most of the system did not use it.** Three consumers re-derived the campaign family from the *raw* Meta objective string, and one silently fabricated a family when the objective was absent. The result was a **split brain**: the same campaign was `messaging` in the campaigns API and `engagement` in the diagnosis engine, the AI narration, and the Arabic vocabulary guard.

This was not a labelling bug. A misclassified campaign gets the wrong CTR floor, the wrong "result" noun, the wrong forbidden-vocabulary list, and a diagnosis written for the wrong funnel.

---

## Finding 1 — CRITICAL: fabricated family for an unknown objective

**Location:** `src/lib/objectiveKpis.ts:139` (before fix)

```ts
if (!raw) return 'messaging'; // historical Phase-1 default when Meta omitted objective
```

An empty, null, or unrecognized objective resolved to **`messaging`**. Not "unknown" — messaging, a fully-specified family with its own CTR floors and Arabic nouns.

**Why it mattered most:** `getDashboard.ts:963` builds the account-level `Signals` object **without an `objective` field at all**. Every account-level diagnosis therefore ran as `family === 'messaging'`:

- `isMessagingFamily(s)` returned `true` for every workspace, always.
- An awareness-only or traffic-only account received messaging-funnel diagnoses ("راجع سرعة الرد على واتساب") regardless of what it actually ran.
- The account-level CTR floor was messaging's 1.0%, not the correct family's.

For Adlytic's current Iraqi WhatsApp-shop clients this was *accidentally right*, which is exactly why it survived: the default matched the customer base. It would have broken on the first awareness or e-commerce client.

**Classification:** architectural — a fabricated value where the honest answer was "unknown".

**Fix:** `resolveObjectiveFamily()` now returns `ObjectiveKpiFamily | null`. `getMetaObjectiveStandard` returns `family: 'unknown'` with a neutral standard whose `forbiddenVocabAr` blocks *every* objective-specific noun, so account-level narration says "نتائج" and "تكلفة النتيجة" rather than asserting a result type it cannot know. The legacy `objectiveKpiFamily()` is retained (still falling back to `messaging`) and marked `@deprecated` so existing call sites keep their behavior until individually migrated.

---

## Finding 2 — CRITICAL: the split brain (resolved purpose discarded)

**Locations:** `src/engines/rules/diagnose.ts:40,44,49`, `src/services/ClaudeCMO.ts:154`

```ts
// diagnose.ts — before
function isMessagingFamily(s: Signals): boolean {
  return getMetaObjectiveStandard(s.objective).family === "messaging";
}
```

`Signals.objective` carried the **raw** Meta objective. For the exact production case — `OUTCOME_ENGAGEMENT` + WhatsApp destination — `campaignPurpose` said `messaging` while `diagnose` said `engagement`, and `engagement`'s standard lists `'رسائل'` and `'تكلفة الرسالة'` as **forbidden vocabulary**. The system was contractually forbidden from using the correct words for a campaign it had already correctly classified.

**Classification:** architectural — the semantic resolver existed but was not the single source of truth.

**Fix:** `Signals` gained `purposeFamily?: ObjectiveKpiFamily | null`, which takes precedence over the deprecated `objective`. `getMetaObjectiveStandard` now accepts an already-resolved family directly (`ObjectiveInput`), so a resolved classification is never re-derived from a raw string.

---

## Finding 3 — HIGH: lossy synthetic-objective round-trip

**Location:** `src/workers/runBrainOrchestrator.ts:342-350` (before fix)

The brain orchestrator *did* call `resolveCampaignPurpose` correctly — then converted the resolved family **back into a fake objective string** so a downstream helper could re-parse it:

```ts
const effectiveObjective =
  purpose.family === 'messaging' ? 'MESSAGES'
  : purpose.family === 'awareness' ? 'OUTCOME_AWARENESS'
  : /* … */;
```

Family → synthetic string → `objectiveKpiFamily()` → family. The round-trip was information-losing (the *reason* for the classification — destination vs optimization goal vs evidence — was destroyed) and created a second place where the mapping could drift out of sync with `campaignPurpose.ts`.

**Classification:** implementation — right intent, wrong plumbing.

**Fix:** the resolved family is passed straight through. `getKpiSpecForFamily(family)` added so no caller ever needs a string round-trip again.

---

## Finding 4 — HIGH: link clicks fetched, then discarded

**Locations:** `src/services/metaClient.ts:46` requests `inline_link_clicks`; `src/mappers/insightMapper.ts` never mapped it.

Adlytic asked Meta for `inline_link_clicks` on every insights call — and threw the value away at the cordon. Downstream, Meta's `clicks` field was used as "النقرات" and as the CPC denominator.

`clicks` is **all clicks**: link clicks *plus* reactions, comments, shares, profile taps, and photo expands. Consequences:

- Reported "traffic" was inflated, often 3–5× on engagement-heavy creative.
- `cpc = spend ÷ clicks` was systematically **lower** than Ads Manager's default "CPC (cost per link click)" column, so a merchant comparing the two screens saw Adlytic under-report their true click cost.
- The single most diagnostic messaging metric — **click → conversation rate** — was uncomputable, because the honest denominator did not exist.

**Classification:** implementation — a lineage gap, not a modelling error.

**Fix:** `NormalizedInsight.linkClicks` added and mapped. This unlocks `conversation_rate` and `cost_per_link_click` in the dictionary.

> **Note:** the value is now normalized but not yet persisted — `DailyStat` has no `link_clicks` column. Adding it is a schema migration, deliberately held for the implementation phase (see Next Steps).

---

## Finding 5 — MEDIUM: `conversions` is objective-blind

**Location:** `src/mappers/insightMapper.ts:83`

```ts
const conversions = messages || purchases || leads;
```

A first-non-zero fallback, not a semantic choice. A sales campaign that also generated page messages reports **messages** as its conversions, because messages is evaluated first. `getDashboard.ts:962` then uses this field as `currentResults` for the account-level diagnosis.

**Classification:** architectural — one column carrying different meanings per row, with no record of which.

**Status:** documented, not yet fixed. The correct fix is to stop storing an ambiguous aggregate and resolve results per-campaign from the purpose family (`resultCountForObjective`), which already exists and is correct. Deferred to implementation because it touches the daily-stats write path and needs a backfill decision.

---

## Finding 6 — MEDIUM: benchmarks have no sample-size guard

**Location:** `src/knowledge/benchmarkIntelligence.ts:121`

```ts
function confidenceForComparison(comparison: "below" | "within" | "above" | "unscored")
```

Confidence is derived from *which side of the benchmark* a value falls on — not from how much data produced it. A campaign with 40 impressions and one lucky click yields a 2.5% CTR and is reported "above benchmark, high confidence."

For Adlytic's client base this is the most commercially dangerous finding after the classification bug: Iraqi SMB campaigns routinely run at spend levels where a single day's noise dominates. The system currently cannot say "I don't have enough data to judge this."

**Classification:** architectural — missing concept (statistical confidence) rather than a broken calculation.

**Status:** documented; `benchmarkStatus: 'UNAVAILABLE' | 'LOW_CONFIDENCE'` is specified in the architecture proposal and enforced by the dictionary's `benchmarkable` flag, but the sample-size gate itself is implementation-phase work.

---

## Finding 7 — LOW: reach aggregation is a silent estimate

`reach` is not additive — the same person reached Monday and Tuesday is one person. The codebase already handles this correctly (`WindowTotals.reach` documents "max daily reach — not additive"), but nothing surfaced to the user that this is a **lower bound**, not a measurement.

**Fix:** the dictionary marks `reach` as `confidenceLevel: 'estimated'` with `aggregationRule: 'max'`, and the regression suite asserts it can never be declared summable.

---

## What is genuinely good and must be kept

An honest audit records what not to touch:

1. **`campaignPurpose.ts` is excellent.** The priority ladder (destination → optimization goal → objective → guarded evidence) is the right model, with each rung documented against the production mislabel it fixed. The evidence rung's guard (`messages >= 3 && messages >= clicks * 0.2`) correctly prevents a boosted post with two incidental messages from flipping to messaging.

2. **`insightMapper.ts` is a real cordon.** The strict `pickMessages` preference order — never summing `messaging_conversation_started_7d` with `total_messaging_connection` — is exactly right, and the comment records the production incident it fixed (163 reported vs 87 in Ads Manager). This discipline is why messaging *counts* are trustworthy even though *classification* was not.

3. **`metaObjectiveStandards.ts`'s forbidden/preferred vocabulary** is an unusually good idea: it constrains what the LLM may say per objective, structurally preventing "your messages campaign got 400 impressions" nonsense. It was pointed at the wrong family; the mechanism itself is sound and now does more work, not less.

4. **The `WindowTotals` / `resultCountForObjective` / `efficiencyForObjective` trio** is already objective-aware and correct. It was simply bypassed by the diagnosis path.

---

## Data lineage — current state

| Metric | Meta source | Normalized | Stored | Derived | Confidence | Traceable? |
|---|---|---|---|---|---|---|
| spend | `spend` | `spendMinor` | `DailyStat.spend` | sum | exact | ✅ |
| impressions | `impressions` | `impressions` | `DailyStat.impressions` | sum | exact | ✅ |
| reach | `reach` | `reach` | `DailyStat.reach` | max (lower bound) | estimated | ✅ (now labelled) |
| clicks (all) | `clicks` | `clicks` | `DailyStat.clicks` | sum | exact | ✅ |
| **link clicks** | `inline_link_clicks` | **was discarded** | ❌ no column | — | exact | ⚠️ mapped, not persisted |
| conversations | `actions[messaging_conversation_started_7d]` | `messages` | `DailyStat.messages` | sum | exact | ✅ |
| cost/conversation | `cost_per_action_type` | `costPerMessage` | `DailyStat.costPerMessage` | ratio of sums | derived | ✅ |
| **conversation rate** | — | — | — | needs link clicks | derived | ❌ not computable until persisted |
| purchases / revenue / ROAS | `actions`, `action_values`, `purchase_roas` | `purchases`, `revenueMinor`, `roas` | `DailyStat.*` | ratio of sums | derived | ✅ |
| **conversions** | first-non-zero of messages/purchases/leads | `conversions` | `DailyStat.conversions` | ambiguous | **unknown** | ❌ Finding 5 |

Two lineage gaps remain, both documented above and both requiring a schema change.

---

## What was fixed in this pass

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Unknown objective fabricated as `messaging` | CRITICAL | ✅ fixed + 4 tests |
| 2 | Split brain: resolved purpose discarded by diagnosis/AI | CRITICAL | ✅ fixed + 5 tests |
| 3 | Lossy synthetic-objective round-trip in the brain | HIGH | ✅ fixed |
| 4 | `inline_link_clicks` fetched then discarded | HIGH | ✅ mapped + 2 tests (persistence pending) |
| 5 | `conversions` column is objective-blind | MEDIUM | 📋 documented, deferred |
| 6 | Benchmarks ignore sample size | MEDIUM | 📋 specified, deferred |
| 7 | Reach estimate not disclosed | LOW | ✅ declared in dictionary + test |

Plus the new **metric semantics layer** (`src/analytics/metricDictionary.ts`): 19 metrics, each with definition, formula, source fields, applicable objectives, aggregation rule, confidence level, and display priority — enforced by 7 structural tests including "no ratio metric may be declared summable" and "no family may surface a primary metric it cannot compute."

**Regression suite:** `test_analytics_semantics.ts`, 19 assertions, all passing. Every assertion maps to a named production symptom.

---

## Next steps (implementation phase — awaiting approval)

Ordered by value per unit of risk:

1. **Persist `link_clicks`** (migration + sync write path) → unlocks `conversation_rate` and `cost_per_link_click`. This is the single highest-value remaining item: click→conversation rate is what separates "delivery problem" from "after-click problem," which is the diagnosis Adlytic's merchants most need and currently cannot receive.
2. **Sample-size gating on benchmarks** → `benchmarkStatus: UNAVAILABLE | LOW_CONFIDENCE` when impressions or results fall below threshold.
3. **Retire the ambiguous `conversions` column** in favour of per-purpose result resolution.
4. **Funnel anomaly detection** — specifically the "clicks stable, conversations collapsed" pattern, which is only computable after step 1.
5. **Objective-aware dashboard sections** — drive the visible KPI set from `primaryMetricsForFamily()` rather than a fixed layout.

Steps 1 and 2 are self-contained and low-risk. Steps 3–5 change what merchants see and should follow a real-client verification pass.
