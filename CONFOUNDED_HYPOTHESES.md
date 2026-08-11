# CONFOUNDED_HYPOTHESES — pre-registration

**Written BEFORE the capability probe has run.** Committed at Gate 1
(`ddc4a69`), while `META_CAPABILITY_MATRIX.md` is still entirely `NOT_TESTED`.

## Why this exists

The question "which hypotheses can we now distinguish?" cannot be answered
honestly *after* seeing the results. Read the matrix first and we will
construct the hypothesis list to fit whatever we found — hindsight bias built
into the architecture on day one, with nothing downstream able to detect it.

So the pairs are written now, from the code as it stands, with a **success
criterion declared in advance** for each. After the run, each pair gets exactly
one of:

- **SEPARATED** — the pre-declared criterion was met
- **STILL CONFOUNDED** — it was not
- **NOT_TESTED** — the probe could not ask

A pair that stays confounded stays confounded. It is announced, not quietly
dropped, and the diagnoses resting on it must say so to the merchant.

## What "confounded" means here

Two hypotheses are confounded when **the observations Adlytic can currently
make are identical under both**, so whichever diagnosis is emitted is decided
by a threshold rather than by evidence. Every pair below is grounded in the
code path that emits it — file and line — not in theory about advertising.

---

## C-1 · Creative fatigue ⟷ Audience saturation

**The most expensive pair in the product, because the two actions are opposite.**

| | |
|---|---|
| emitted by | `diagnoseCreativeFatigue` / `diagnoseAudienceSaturation`, `src/engines/rules/diagnose.ts:107,129` |
| action if fatigue | «جدّد صورة أو فيديو الإعلان» — spend money producing new creative |
| action if saturation | «وسّع الجمهور» — the creative is fine, the audience is exhausted |

### Why they are confounded

Both require `HIGH_FREQUENCY`. The **only** discriminator is whether the
`AUDIENCE_FATIGUE` flag fired (`diagnose.ts:131` returns null for saturation
when it did). And that flag is set by `detectAudienceFatigue`
(`src/engines/rules/detectAudienceFatigue.ts:38`) on:

```
frequencyTrend ≥ +0.15   ┐
ctrTrend       ≤ −0.15   ├── any 2 of 3
resultsTrend   ≤ −0.20   ┘
```

All three signals are **equally consistent with audience saturation.** A
saturated audience also shows frequency rising, CTR falling and results
falling — that is what running out of new people looks like. So the two
diagnoses are separated by a threshold on shared evidence, not by evidence
that differs between them.

### What would actually separate them

A saturated audience shows **reach flattening while impressions continue** —
the same people, more often. A fatigued creative shows **decay concentrated in
the creatives with the most cumulative exposure**, while a fresh creative
launched into the same audience recovers.

Required: per-creative cumulative impressions and per-creative CTR slope, plus
reach at the same grain as impressions.

### Pre-declared success criterion

SEPARATED **only if** all three hold:

1. ad-level insights return `impressions` **and** `reach` for the same window
   (`baseline.ad.insights` AVAILABLE with both fields returned), and
2. `field.insights.ad_relevance` returns `quality_ranking` **populated**
   (`present: true`) rather than accepted-and-empty, and
3. those can be read per creative over a multi-day window.

Anything less — including `quality_ranking` accepted but never returned —
leaves C-1 **STILL CONFOUNDED**, and both diagnoses must then be emitted as a
single "high frequency, declining engagement" finding with both actions
offered, rather than one asserted.

---

## C-2 · Auction pressure ⟷ Everything else that raises CPM

| | |
|---|---|
| emitted by | `diagnoseAuctionPressure`, `src/engines/rules/diagnose.ts:151` |
| trigger | `cpmTrend ≥ 0.15` **and** `|ctrTrend| < 0.10` |
| claim | «الإعلان نفسه بخير — الغلاء جاء من منافسة أعلى على نفس الجمهور» |

### Why it is confounded

**Adlytic never observes the auction.** There is no competitive signal in the
system at all. "CPM up, CTR stable" is the entire evidence base, and it is
produced identically by at least six mechanisms:

1. genuine competitive pressure
2. a placement-mix shift toward expensive inventory
3. audience narrowing (a smaller pool costs more per impression)
4. a bid-strategy or optimization-goal change
5. seasonality
6. Meta's own pricing/delivery changes

The narrative names cause (1) and rules out the creative — a causal claim from
one correlation, with no observation of the named cause.

### Pre-declared success criterion

**Cause (1) cannot be confirmed by any candidate in the probe set, and I do not
expect it to become confirmable.** Meta does not expose competitors' bids.

Partial credit is defined in advance:

- **(2) becomes excludable** if `breakdown.impression_device` and the existing
  `publisher_platform + platform_position` pair let CPM be decomposed by
  placement, so a mix shift can be measured and subtracted.
- **(4) becomes excludable** if `field.adset.auction_config` returns
  `bid_strategy` and `billing_event` populated, and a change in them can be
  dated.

If (2) and (4) become excludable, C-2 is **NARROWED, not SEPARATED**, and the
narrative must change from "competition rose" to "CPM rose and we have
excluded placement mix and bid strategy; the auction itself is not observable
to us." That wording change is part of the criterion — narrowing the claim
without narrowing the sentence is not success.

---

## C-3 · Post-click problem ⟷ Conversion-tracking degradation

| | |
|---|---|
| emitted by | `diagnoseLandingPageProblem`, `src/engines/rules/diagnose.ts:174` |
| trigger | results declining **while** CTR healthy and not dropping |

### Why it is confounded

A pixel that stopped firing, a CAPI outage, a consent-banner change or a
tracking-domain problem produce **exactly this signature**: clicks unchanged,
recorded conversions collapse. The merchant is then told to fix a landing page
that was never broken, while the real fault — measurement — goes unexamined
and every downstream number stays wrong.

`checkPixelHealth` exists (`src/services/agent/tools/checkPixelHealth.ts`) but
it is an **agent tool**: reachable only if the LLM chooses to call it. It is
not in the deterministic path that emits this diagnosis.

### Pre-declared success criterion

SEPARATED if `listPixels` / `getDatasetQuality` can be read for the account
**and** a dated deterioration in dataset quality can be aligned to the
conversion drop. Wiring the existing pixel-health read into the deterministic
diagnosis is then a Phase-1 change, not a new capability.

If dataset quality is not readable, C-3 stays **STILL CONFOUNDED**, and the
diagnosis must add "or your conversion tracking stopped reporting" as a
co-equal cause rather than asserting the landing page.

---

## C-4 · Real performance change ⟷ Attribution/reporting change

**The one that contaminates every other pair.**

| | |
|---|---|
| status today | **not a hypothesis the system can even form** |
| cause | no request sets an attribution window; `DailyStat` stores none — see `METRIC_LINEAGE.md` |

If a client changes their attribution window in Ads Manager, every stored
conversion count shifts meaning on that date. Adlytic sees the numbers move
and attributes the movement to campaign performance, because it has no way to
see the other cause. This is not a weak hypothesis here — it is unaskable.

### Pre-declared success criterion

SEPARATED if `field.insights.attribution_setting` is AVAILABLE **with the field
returned**, so each observation can record the window it was counted under and
a change of window becomes a dated, visible event.

If it is not available, C-4 stays **STILL CONFOUNDED**, and the honest
consequence is stated in advance: **CPA comparisons between workspaces must be
withdrawn from the product**, not shown with a footnote.

---

## C-5 · Budget exhaustion ⟷ Delivery stopping

| | |
|---|---|
| related codes | `DORMANT_ACTIVE_INFLATION`, `ACTIVE_ZERO_DELIVERING_MISMATCH` |
| shared signature | an ACTIVE campaign, spend at zero |

Opposite actions again: raise the budget, versus investigate why Meta stopped
delivering. Adlytic currently sees only "active, not spending".

### Pre-declared success criterion

SEPARATED if `field.campaign.budget_remaining` is AVAILABLE with the field
returned. Note the temporal caveat recorded at Gate 1: it is a **point-in-time**
value. It may be used to classify *now*; it may **not** be written into a daily
table, which would fabricate a history out of whenever the sync happened to run.

---

## C-6 · Scaling effect ⟷ Short-term variance

| | |
|---|---|
| status | no code path attempts this distinction |

After a budget increase, efficiency worsening may be the cost of scaling into a
broader audience, or may be noise. Adlytic has no budget-change event log, so
it cannot even align the deterioration to the change.

### Pre-declared success criterion

**No probe candidate addresses this**, and I am recording that in advance so it
cannot later be claimed as a discovery. It needs a temporal event log — Phase 5
work — not a Meta field. Expected outcome: **NOT_TESTED**.

---

## Summary — to be filled only after the run

| pair | what it decides | criterion rests on | outcome |
|---|---|---|---|
| C-1 fatigue ⟷ saturation | new creative vs wider audience | ad-level reach + populated `quality_ranking` | _pending_ |
| C-2 auction ⟷ mix/bid/season | is the creative exonerated | placement decomposition + `bid_strategy` | _pending_ |
| C-3 landing ⟷ tracking | fix the page vs fix measurement | dataset quality readable + datable | _pending_ |
| C-4 performance ⟷ attribution | is any of this real | `attribution_setting` returned | _pending_ |
| C-5 budget ⟷ delivery | raise budget vs investigate | `budget_remaining` returned | _pending_ |
| C-6 scaling ⟷ variance | intervene vs wait | (no candidate — expected NOT_TESTED) | _pending_ |

## The rule this list binds us to

A pair may only be marked SEPARATED against the criterion **as written above**,
not against a criterion adjusted after seeing the data. If a result suggests a
better criterion, the honest move is to record the pair as STILL CONFOUNDED,
write the new criterion, and test it in a later run.

And the outcome worth wanting is not six SEPARATED rows. If C-4 comes back
unavailable, the correct product change is to **remove a comparison we
currently show** — subtraction, driven by evidence. That is a better result
than adding thirty fields.
