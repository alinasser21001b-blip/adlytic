# P3 — Funnel Intelligence Design

**Status:** DESIGN — awaiting approval. No implementation has begun.
**Depends on:** P0 (link clicks persisted), P2 (typed result semantics).
**Governed by:** `ANALYTICS_RULES.md` rules 1–9.

---

## The thesis

A universal `Impressions → Clicks → Conversions` funnel is the same category of
error as the `conversions` column: it forces four different businesses into one
shape and then reports a number that means something different for each.

The funnel must be **objective-aware**, because a funnel is not a chart — it is
a *diagnostic instrument*. Its whole value is that a chain of ratios localises a
failure to exactly one link. That only works if the links are real for the
campaign being diagnosed.

The output of P3 is not a visualisation. It is an answer to:

> **Is this a delivery problem, a click problem, a post-click problem, or a
> conversion problem?**

Those four demand completely different actions, and today Adlytic cannot tell
them apart.

---

## 1. Objective-aware funnel shapes

Each purpose family gets its own chain. Stages are **not** padded to a common
length — a messaging funnel has four links because it has four links.

```
MESSAGING   Impressions → Reach → Link Clicks → Conversations
TRAFFIC     Impressions → Reach → Link Clicks → Landing Page Views
LEADS       Impressions → Reach → Link Clicks → Leads
SALES       Impressions → Reach → Link Clicks → Purchases
AWARENESS   Impressions → Reach                      (terminal: no click stage)
ENGAGEMENT  Impressions → Reach → Interactions*      (*approximate)
APP         Impressions → Reach → Link Clicks → Installs*   (*approximate)
```

**Why `Reach` is a stage and not a footnote.** Impressions ÷ Reach is frequency,
and frequency rising while the click ratio falls is the single most reliable
fatigue signature in Meta advertising. Making reach a stage means fatigue falls
out of the funnel arithmetic instead of needing a separate detector.

**Why awareness terminates early.** An awareness campaign has no click
objective, so a "click ratio" for it is a vanity metric. The funnel ends where
the campaign's intent ends. Forcing a fourth stage would invite a diagnosis
about a problem the advertiser never asked to solve.

**Approximate terminals** (engagement, app) inherit `approximate: true` from
their `ResultDefinition` under rule 8. Their final stage may be *displayed* but
must never produce a high-confidence diagnosis.

---

## 2. Stage definitions

Every stage declares the full contract, mirroring `metricDictionary.ts`.

### Common stages

| Field | `impressions` | `reach` | `link_clicks` |
|---|---|---|---|
| **source metric** | `DailyStat.impressions` | `DailyStat.reach` | `DailyStat.linkClicks` |
| **semantic meaning** | Times the ad rendered | Distinct people who saw it | Clicks that opened the destination |
| **numerator** | — (funnel entry) | `reach` | `linkClicks` |
| **denominator** | — | `impressions` | `reach` |
| **ratio meaning** | — | 1 ÷ frequency | click-through per person reached |
| **applicable** | all | all | all except awareness |
| **confidence** | exact | **estimated** (max, not additive) | exact |
| **approximate** | no | no | no |
| **min sample** | 1,000 impressions | 1,000 impressions | 1,000 impressions |

> **The reach caveat is load-bearing.** Window reach is `max(daily reach)` — a
> deliberate lower bound, because Meta does not expose cross-day dedup for
> arbitrary windows. So the reach stage's ratio is a *floor*, and any diagnosis
> derived from it must carry `DataConfidence: 'ESTIMATED'`. A funnel that
> silently treated it as exact would over-report fatigue.

### Terminal stages

| Family | Stage | Source | Numerator ÷ Denominator | Confidence | Approx | Min sample |
|---|---|---|---|---|---|---|
| messaging | `conversations` | `DailyStat.messages` | conversations ÷ link clicks | exact | no | 10 conversations |
| traffic | `landing_page_views` | *not yet synced* | LPV ÷ link clicks | exact | no | 10 LPV |
| leads | `leads` | `DailyStat.leads` | leads ÷ link clicks | exact | no | 10 leads |
| sales | `purchases` | `DailyStat.purchases` | purchases ÷ link clicks | exact | no | 10 purchases |
| engagement | `interactions` | `DailyStat.clicks` | interactions ÷ reach | **estimated** | **yes** | 30 interactions |
| app | `installs` | `DailyStat.clicks` | installs ÷ link clicks | **estimated** | **yes** | 30 |

**Open dependency — landing page views.** Meta exposes
`actions.landing_page_view`, which Adlytic does not currently map or store. The
traffic funnel's terminal stage cannot be built without it. This is the same
shape as the P0 link-clicks gap. **Decision needed:** add it in P3 (one mapper
field + one column + one migration, mirroring P0 exactly), or ship P3 with the
traffic funnel terminating at link clicks and mark the stage `UNAVAILABLE`.
*Recommendation: add it* — the work is small, already rehearsed, and without it
the traffic funnel cannot distinguish a click problem from a landing-page
problem, which is its entire purpose.

### The stage contract in code

```ts
export interface FunnelStage {
  stageKey: string;
  labelAr: string;
  labelEn: string;
  /** What this stage means in the merchant's world. */
  meaning: string;
  /** Dictionary metric supplying the count. */
  metricKey: string;
  sourceColumn: string;
  /** Ratio INTO this stage: numerator ÷ previous stage's count. */
  ratioLabelAr: string;
  applicableFamilies: ObjectiveKpiFamily[];
  confidenceLevel: ConfidenceLevel;      // exact | derived | estimated
  approximate: boolean;                   // rule 8
  /** Below this the stage reports INSUFFICIENT_DATA, never a ratio. */
  minSampleForRatio: number;
}
```

### Stage values obey rules 7 and 8

```ts
export type FunnelStageValue =
  | { status: 'OK'; count: number; ratioFromPrevious: number | null;
      confidence: ConfidenceLevel; approximate: boolean }
  | { status: 'UNAVAILABLE'; reason: 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA' | 'UNKNOWN' };
```

A zero ratio and an unmeasurable ratio stay distinct, exactly as `computeMetric`
already requires.

---

## 3. The diagnosis: localising the break

This is the part that makes Adlytic an intelligence product rather than a
reporting one. Each ratio maps to one problem class, and **only one link may be
named as the break** — a diagnosis that says "everything is down" is not a
diagnosis.

| Broken link | Ratio that fell | Problem class | Merchant-facing (Arabic) |
|---|---|---|---|
| Impressions not growing at flat spend | — | **DELIVERY** | المزاد أغلى أو الجمهور ضيّق |
| Reach ÷ Impressions falling (frequency rising) | reach | **DELIVERY** (saturation) | الجمهور صغير — نفس الناس يرون الإعلان مراراً |
| Link clicks ÷ Reach falling | click | **CLICK** (creative) | التصميم لم يعد يجذب الانتباه |
| Terminal ÷ Link clicks falling | conversion | **POST-CLICK** | الناس تضغط ولا تكمل |
| Terminal flat, cost per result rising | — | **EFFICIENCY** | النتائج ثابتة والتكلفة ترتفع |

### The two scenarios you named, resolved

**Scenario A — CTR healthy, CPC healthy, link clicks healthy, conversations falling.**

Every upstream ratio holds; only the terminal ratio drops. The funnel localises
to **POST-CLICK**, and the diagnosis is specific because the arithmetic is:

> «إعلانك يعمل جيداً: وصل لنفس عدد الناس وضغطوا بنفس المعدل. المشكلة بعد الضغط —
> 260 شخصاً فتحوا واتساب لكن 12 فقط بدأوا محادثة. تحقّق من: رقم واتساب صحيح،
> رسالة الترحيب واضحة، وسرعة الرد.»

Critically, this diagnosis **must not** recommend changing the creative — the
creative is measurably fine. Today's system, lacking the link-click denominator,
would have blamed the ad.

**Scenario B — CTR falling, CPC rising, frequency rising.**

The break is upstream, at the reach and click links. **DELIVERY + CLICK**, and
the recommendation is the opposite:

> «الجمهور بدأ يمل: نفس الأشخاص رأوا الإعلان 5.4 مرة، ومعدل الضغط انخفض 33%.
> جدّد التصميم أو وسّع الجمهور.»

The same product, told two contradictory things — correctly — because the funnel
knows which link broke.

### The localisation algorithm

1. Compute each stage's ratio for the current window and the prior window.
2. Discard any stage whose sample is below `minSampleForRatio` → `INSUFFICIENT_DATA`.
3. Compute the relative change per ratio.
4. **The break is the EARLIEST stage whose ratio degraded materially.** Earliest,
   not largest: a click collapse mechanically depresses everything downstream, so
   naming the biggest absolute drop would systematically blame the terminal stage
   for an upstream failure.
5. If the earliest break is downstream of an approximate stage, cap the
   diagnosis confidence (rule 8).
6. If no ratio degraded but cost per result rose, classify **EFFICIENCY**.
7. If nothing degraded, emit nothing. Silence is a valid output.

---

## 4. What P3 will NOT do

- **No anomaly detection.** That is P5, and it must not be smuggled in as "the
  funnel noticing things". P3 computes and localises; P5 decides what is unusual.
- **No dashboard redesign.** P3 produces a funnel DTO. P4 renders it.
- **No new providers, no Google Ads.**
- **No LLM in the computation path.** The funnel is deterministic arithmetic;
  the LLM may only phrase the resulting finding.
- **No conversation-outcome stages** (answered / qualified / order). The
  architecture stays capable of appending them — the chain is a list, so later
  links extend it rather than reshaping it — but they need data Adlytic does not
  yet collect.

---

## 5. Proposed sequence within P3

| Step | Work | Risk |
|---|---|---|
| 3a | `funnelDefinitions.ts` — stages per family, pure data, no I/O | very low |
| 3b | `computeFunnel(family, rows)` — counts, ratios, sample gating | low |
| 3c | Regression suite: one golden funnel per family + the two scenarios above | low |
| 3d | *(pending decision)* persist `landing_page_view`, mirroring P0 | low |
| 3e | `localiseBreak(current, prior)` — the earliest-material-break algorithm | medium |
| 3f | Expose `funnel` on the dashboard DTO (data only; P4 renders) | low |

Steps 3a–3c are self-contained and independently reviewable. 3e is where the
judgement lives and deserves its own review pass.

---

## 6. Decisions needed before implementation

1. **Landing page views** — add the column in P3 (recommended), or ship the
   traffic funnel with an `UNAVAILABLE` terminal stage?

2. **Minimum samples** — I propose 1,000 impressions for upstream ratios and 10
   terminal events for the conversion ratio, consistent with P1's benchmark
   gates. At Iraqi SMB spend this will withhold funnel diagnosis from the
   smallest accounts for their first days. Is that acceptable? *Recommendation:
   yes* — a confident funnel diagnosis from 40 impressions is exactly the failure
   P1 was built to prevent.

3. **Engagement and app funnels** — build them with approximate terminals and a
   visible caveat, or omit their terminal stage entirely until a real signal
   exists? *Recommendation: build with the caveat*, since rule 8's machinery
   already carries the approximation honestly.

4. **Frequency's home** — reach ÷ impressions IS frequency inverted. Should the
   existing `HIGH_FREQUENCY` detector be reframed as a funnel break to avoid two
   systems reporting the same fact in different words, or left alone this phase?
   *Recommendation: leave it for P5*, when detectors and funnel semantics get
   reconciled together rather than piecemeal.
