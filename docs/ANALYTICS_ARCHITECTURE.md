# Adlytic Analytics Architecture Proposal

**Status:** design — implementation of stages 3–7 awaits approval
**Companion documents:** `ANALYTICS_AUDIT.md` (what is wrong today), `COMPETITIVE_ANALYTICS_STUDY.md` (what 17 competitors do)

---

## The principle

> Do not trust raw Meta fields as business truth.

Every number a merchant sees must be traceable through an explicit chain, and every link in that chain must be able to say **"I don't know"** instead of guessing. The audit found that the previous system's single worst behaviour was not a wrong calculation — it was a fabricated default (`objective ?? 'messaging'`) that made an unknown look like a fact.

## The pipeline

```
Meta raw
  → ingestion        metaClient.ts — transport, pacing, retry. Knows Meta. Knows nothing else.
  → normalization    insightMapper.ts — THE CORDON. Meta field names die here.
  → classification   campaignPurpose.ts — the ONE semantic authority.
  → metric calc      metricDictionary.ts + analytics engine — legality, then arithmetic.
  → validation       confidence + sample-size gates. May return UNAVAILABLE.
  → benchmark        own-account baseline first; peer cohort only with disclosed n.
  → anomaly          funnel-ratio localisation, not threshold checks.
  → diagnosis        deterministic. Names the broken link in the chain.
  → recommendation   evidence + confidence + expected outcome. Never generic.
  → UI               renders only what the objective permits.
```

Two rules govern the whole pipeline:

1. **The analytics engine is the source of truth. The LLM may phrase, translate and prioritise — it may never compute or invent a number.** The competitive study makes this urgent: reviewers report Triple Whale's AI hallucinating below ~$5M revenue, and every Adlytic client is far below that line.
2. **Each layer may only consume the layer below through its published contract.** No module below `classification` may read a Meta field name; no module above may re-derive a campaign's family.

---

## 1. The campaign semantic model

Four concepts the old code conflated. They are now distinct, and their separation exists **in code**, not only in documentation:

| Concept | Meaning | Source | Where it lives |
|---|---|---|---|
| `campaignObjective` | What the advertiser declared in Meta | `campaign.objective` | `Campaign.objective` (raw, never overwritten) |
| `optimizationGoal` | What Meta's delivery system actually optimises | ad set `optimization_goal` | `AdSet.optimizationGoal` |
| `destinationType` | Where the ad sends the user | ad set `destination_type` | `AdSet.destinationType` |
| `purposeFamily` | **The business truth Adlytic reasons about** | resolved from the three above | `resolveCampaignPurpose()` |

`purposeFamily` is derived, not stored, and is the **only** value any analytics consumer may branch on.

### Why the resolution ladder is ordered as it is

```
1. destinationType ∈ {WHATSAPP, MESSENGER, INSTAGRAM_DIRECT}  → messaging
2. optimizationGoal ∈ {CONVERSATIONS, REPLIES, …}             → messaging
3. optimizationGoal → its own family (REACH → awareness, …)
4. campaignObjective → its family
5. evidence rung (guarded): would-be-engagement whose actual
   results are conversations                                   → messaging
6. otherwise                                                    → null / unknown
```

The ladder is ordered by **proximity to what the ad actually does**. A campaign's declared objective is the advertiser's intention; the ad set's destination is the observable behaviour. When they disagree, behaviour wins — and Ads Manager itself agrees, reporting messaging results for exactly this configuration.

Rung 5 is guarded (`messages ≥ 3 && messages ≥ clicks × 0.2`) so a genuine boosted post with two incidental page messages never flips. Rung 6 returning `null` is the fix for the audit's most severe finding: **"unknown" is a valid answer and must never be replaced by a plausible-looking family.**

### Account level is legitimately `unknown`

A workspace runs several campaigns with several objectives. There is no account-level `purposeFamily`. The standards layer therefore returns `family: 'unknown'` with a neutral vocabulary that forbids *every* objective-specific noun — the account view says "نتائج" and "تكلفة النتيجة", never "رسائل". Previously it silently claimed to be a messaging account.

---

## 2. The metric semantics layer

`src/analytics/metricDictionary.ts` — implemented, 19 metrics, enforced by tests.

Each metric declares:

```ts
metricKey · labelAr/labelEn · definition · formula · sourceFields · storedAs
applicableObjectives · aggregationRule · confidenceLevel · benchmarkable
goodDirection · displayPriority
```

Three structural guarantees, each backed by a regression test:

**No metric leakage.** `isMetricApplicable('roas', 'messaging') === false`. Asking for an inapplicable metric returns `{status:'UNAVAILABLE', reason:'NOT_APPLICABLE'}` — never a coerced zero. A messages campaign must never render a ROAS column; the competitive study is explicit that showing a blank ROAS teaches SMB owners the tool is broken.

**No illegal aggregation.** `aggregationRule` makes summing a ratio structurally undeclarable. CTR, CPC, CPM, frequency, ROAS and cost-per-conversation are all `ratio_of_sums` — recomputed from summed numerators and denominators, never averaged across days. `reach` is `max`, because the same person reached on two days is one person; it is marked `confidenceLevel: 'estimated'` so the UI can disclose that it is a lower bound rather than a measurement.

**No unlabelled uncertainty.** `confidenceLevel` is `exact` (Meta reported it), `derived` (deterministic arithmetic over exact counters), or `estimated` (carries a modelling assumption). Only `estimated` values require a UI caveat, but all three are declared, so the caveat can never be forgotten.

---

## 3. Objective-aware KPI ladders

The dashboard's visible metric set is driven by `primaryMetricsForFamily(family)`, not a fixed layout.

| Family | Primary metrics |
|---|---|
| **messaging** | conversations · cost per conversation · **click→conversation rate** · link clicks |
| traffic | link clicks · cost per link click |
| leads | leads · cost per lead |
| sales | purchases · cost per purchase · ROAS |
| engagement | engagements · cost per engagement |
| awareness | reach · impressions · CPM · frequency |

**Click→conversation rate is the flagship.** It is the single metric that separates a *delivery* problem (few clicks) from an *after-click* problem (clicks that never convert) — the distinction Adlytic's merchants most need and currently cannot receive, because the denominator (`inline_link_clicks`) was fetched from Meta and then discarded at the cordon. Finding 4 fixed the mapping; persisting it is the top implementation item.

---

## 4. Benchmark engine — confidence before comparison

The competitive study's clearest lesson, from Databox and Motion: **disclose n, show distributions, suppress thin cells.**

```ts
type BenchmarkResult =
  | { status: 'OK'; position: 'good'|'ok'|'low'; median: number; p25: number; p75: number; n: number }
  | { status: 'LOW_CONFIDENCE'; reason: string; n: number }
  | { status: 'UNAVAILABLE'; reason: string };
```

Comparison order, strongest evidence first:

1. **Own-account baseline** (trailing 90-day distribution) — needs no peer data, immune to sample-size objections, and is what the merchant actually cares about: *"cost per conversation is 3,200 IQD; your own 90-day median is 1,900."*
2. **Campaign baseline** — this campaign versus its own history.
3. **Previous period** — current window versus prior window of equal length.
4. **Local peer cohort** — gated: minimum distinct accounts *and* minimum volume per cell, segmented by spend tier, always printing n.
5. **Industry benchmark** — last resort, and never for Iraqi accounts without a caveat. Published CTR/CPM figures are dominated by US/EU e-commerce; Iraqi auction density and purchasing power are structurally different, so importing them makes clients look good or bad at random.

The current `benchmarkIntelligence.ts` derives "confidence" from which side of the benchmark a value falls on — not from how much data produced it (audit Finding 6). A campaign with 40 impressions and one lucky click currently reports "above benchmark, high confidence." Sample-size gating is the fix and is implementation-phase work.

---

## 5. Anomaly detection — localise the break, don't threshold the metric

The funnel is a chain of ratios, so underperformance **always localises to exactly one link**:

```
impressions → link clicks → conversations → replies → qualified → sale
             CTR          conv. rate      reply rate
```

| Broken link | Meaning | Merchant-facing diagnosis |
|---|---|---|
| Low CTR | Creative fails to interest | جدّد التصميم أو الجملة الافتتاحية |
| CTR fine, low conversation rate | They clicked but never messaged | رقم واتساب خاطئ · رابط معطّل · بطء الفتح |
| Conversations start, no replies | **Business-side failure, not an ad failure** | فريقك لا يردّ بسرعة كافية |
| Frequency ↑ while CTR ↓ | Audience fatigue | وسّع الجمهور أو جدّد الإبداع |
| CPM ↑ with CTR stable | Auction pressure, not creative decay | الإعلان بخير — المنافسة ارتفعت |
| Spend ↑ without result growth | Efficiency decay | راجع التوزيع قبل زيادة الميزانية |

The third row is the highest-value insight in the entire competitive study and **nothing in the 17-platform survey can produce it.** For an Iraqi SMB the most common cause of "my ads don't work" is likely an unanswered WhatsApp message, not the campaign. A tool that can say *"your ads delivered 84 conversations; 51 were never answered"* is worth more than every attribution model in that report combined.

Rows 1, 2, 4, 5 and 6 are computable from Meta data alone once link clicks are persisted. Row 3 requires conversation-outcome capture (WhatsApp Business API or lightweight merchant input) and is a later phase.

---

## 6. Recommendation engine

Every recommendation carries a full evidence record:

```ts
interface Recommendation {
  problem: string;            // the broken link, named
  evidence: EvidenceItem[];   // metric · value · baseline · window · sample size
  confidence: 'confident' | 'early_signal' | 'insufficient_data';
  severity: 'critical' | 'high' | 'normal';
  suggestedAction: string;    // specific and executable
  expectedOutcome: string;    // grounded in RecommendationExecution history
}
```

Hard constraints, all traceable to a documented competitor failure:

- **No generic advice.** "Improve performance" is not a recommendation. If the engine cannot name the broken link and cite the numbers, it emits nothing.
- **No recommendation above its confidence.** `insufficient_data` findings are shown as observations, never as instructions.
- **Recommend, never auto-execute.** At SMB spend a single day's noise trips any sane threshold; auto-pausing a campaign having a bad Tuesday, for a client who does not understand what happened, is an unrecoverable trust failure. Revealbot's and Madgicx's autonomous model does not transfer to this market.
- **The LLM phrases; the engine decides.** Findings are computed deterministically and injected into a constrained Arabic template.

---

## 7. Implementation sequence

| # | Change | Risk | Value | Status |
|---|---|---|---|---|
| 0 | Semantic single-source-of-truth; unknown ≠ messaging; metric dictionary | low | critical | ✅ **done** |
| 1 | Persist `link_clicks` (migration + sync write path) | low | **highest remaining** | pending approval |
| 2 | `conversation_rate` + `cost_per_link_click` end-to-end | low | high | after 1 |
| 3 | Benchmark sample-size gating (`UNAVAILABLE`/`LOW_CONFIDENCE`) | low | high | pending approval |
| 4 | Retire the ambiguous `conversions` column | medium | medium | needs backfill decision |
| 5 | Funnel anomaly detection (rows 1,2,4,5,6) | medium | high | after 2 |
| 6 | Objective-driven dashboard sections | medium | high | after 5 |
| 7 | Conversation-outcome capture (unanswered-chat detection) | high | **transformational** | separate project |

Steps 1–3 are self-contained and independently shippable. Steps 4–6 change what merchants see and should follow a real-client verification pass. Step 7 is the defensible moat and deserves its own design.

---

## What this architecture deliberately refuses to build

From the competitive study, with reasons:

- **Multi-touch attribution / pixel journey stitching** — the conversion happens inside end-to-end-encrypted WhatsApp, invisible to any pixel. Many clients have no website at all. This would be the most expensive wrong turn available.
- **Marketing mix modelling / incrementality holdouts** — MMM on a $400/month account is numerology.
- **Global industry benchmarks as a primary comparison** — US/EU e-commerce figures make Iraqi accounts look good or bad at random.
- **Autonomous auto-pause/auto-scale** — variance at small spend makes it actively harmful.
- **Complex rule builders** — the users are shop and clinic owners, not media buyers.
- **Feature breadth** — with 15 clients, one thing done uniquely well beats twenty done adequately.
