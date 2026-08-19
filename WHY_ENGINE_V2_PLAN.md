# WHY ENGINE V2 — IMPLEMENTATION PLAN (design only)

Extends what already works. **Nothing here is implemented yet.**

Grounded in Round 1 evidence (`META_CAPABILITY_ROUND1.md`): exactly two new
inputs are `PROVEN_USABLE` — `attribution_setting` and `budget_remaining`.
Everything the plan asks of them is bounded by that.

---

## 1. What already exists and is NOT rebuilt

| module | role in V2 |
|---|---|
| `src/analytics/funnel/compute.ts` · `diagnose.ts` | stage decomposition, earliest-break |
| `src/analytics/intelligence/anomaly.ts` | change detection |
| `src/analytics/intelligence/hierarchy.ts` | reconciliation across engines |
| `src/engines/analytics/attributeChange.ts` | impressions × CTR × CVR decomposition |
| `src/engines/rules/*` detectors | signal extraction |

V2 is an **envelope** around these, not a replacement. The arithmetic stays
deterministic and stays where it is.

## 2. The two new inputs — and their strict roles

### `attribution_setting` — INTERPRETATION ONLY

**Rule: it never enters metric arithmetic.** It is a label describing how a
row was counted, not a term in any formula. A CPA computed under a 7-day
click window and one under 1-day are both correct and not comparable; V2's
job is to refuse the comparison, not to adjust a number into agreement.

Permitted uses:
- stamp every stored conversion row with the window it was counted under
- **block** period-over-period comparison when the setting differs between
  periods, and say so in `MeasurementContext`
- **block** cross-workspace CPA comparison when settings differ
- lower `DataConfidence` when the setting changed inside the window

Forbidden: scaling, normalising, or reconciling any metric by it. Rewriting a
number so two incomparable things agree is the exact fabrication the product
exists to prevent.

### `budget_remaining` — HYPOTHESIS FALSIFIER

Its value is **negative evidence**, which is rarer and cleaner than positive:

```text
results collapsed AND budget_remaining ≈ 0
    → "budget exhausted" rises; "creative fatigue" falls
results collapsed AND budget_remaining is large
    → "budget exhausted" is ELIMINATED, not merely less likely
```

The second line is the valuable one. Most signals raise several hypotheses at
once; this one **removes** a competitor outright, which is what actually
narrows a diagnosis.

## 3. Output contract

```ts
interface WhyResultV2 {
  primary: Hypothesis;              // may be null — "we do not know" is a result
  alternatives: Hypothesis[];       // ranked, each with its own evidence
  evidence: Evidence[];             // observed facts only
  counterEvidence: Evidence[];      // facts arguing AGAINST the primary
  dataConfidence: Confidence;       // can we trust the inputs?
  diagnosisConfidence: Confidence;  // given the inputs, how sure is the call?
  measurementContext: MeasurementContext;
  recommendedAction: Action | null; // null when evidence does not support one
  evaluationPlan: EvaluationPlan;   // what would prove this right or wrong
}
```

Two separations that must not be collapsed:

**`dataConfidence` ≠ `diagnosisConfidence`.** Perfect data can still yield an
ambiguous diagnosis; excellent reasoning over stale data deserves no
confidence at all. One number cannot carry both, and averaging them hides
whichever is worse.

**`counterEvidence` is mandatory, not decorative.** A hypothesis presented
with only supporting facts is advocacy. If the engine cannot name what argues
against its own primary, it has not reasoned — it has selected.

## 4. Data-status rules — non-negotiable

```text
ACCEPTED_BUT_UNPOPULATED  →  status UNPOPULATED, value null
                             NEVER a measured zero
NOT_TESTED                →  excluded from reasoning ENTIRELY
                             not weighted low — absent
UNAVAILABLE               →  the dependent hypothesis is UNREACHABLE,
                             stated as such rather than silently dropped
```

The middle rule is the one most likely to erode under pressure: a
`NOT_TESTED` capability with a low weight *looks* cautious while still
letting an untested thing move a conclusion. It must not enter the
computation at all.

## 5. Pipeline

```text
1  load metrics            (existing)
2  attach data status      MetricValue{value,status,confidence,source}
3  DETERMINISTIC decomposition   attributeChange + funnel   ← no LLM
4  generate candidate hypotheses from RULES                 ← no LLM
5  apply falsifiers        budget_remaining eliminates competitors
6  apply measurement gate  attribution_setting blocks invalid comparisons
7  rank by evidence weight                                  ← no LLM
8  compute both confidences separately
9  LLM: WORDING ONLY — turn the chosen structure into Arabic prose
10 persist decision + evidence for later outcome evaluation
```

**Step 9 is the only LLM step, and it may not change the ranking.** The model
receives a decided structure and returns sentences. If it could choose the
diagnosis, every guarantee above becomes decorative.

## 6. Buildable now vs blocked

| layer | status | why |
|---|---|---|
| **WHY_ENGINE_CORE** | **BUILDABLE** | funnel + anomaly + decomposition already run on fields we request |
| **budget falsifier** | **BUILDABLE** | `budget_remaining` PROVEN_USABLE; needs adding to the campaign fetch |
| **measurement gate** | **BUILDABLE** | `attribution_setting` PROVEN_USABLE; needs a schema column + backfill decision |
| device / hourly / action-type drivers | **BLOCKED** | ACCEPTED_BUT_UNPOPULATED — cause unknown |
| adset-level (learning phase, auction) | **BLOCKED** | NOT_TESTED — Round 2 must resolve |
| ad-level creative drivers | **BLOCKED** | NOT_TESTED |

## 7. Slice order

1. `MetricValue` status envelope — everything downstream depends on it, and it
   is the mechanism that makes "never a measured zero" enforceable rather than
   aspirational
2. `budget_remaining` into the campaign fetch + the falsifier rule
3. `attribution_setting` storage + the comparison gate
4. the V2 envelope over the existing deterministic engines
5. decision persistence + outcome evaluation

Each slice ships with a gate. Slice 1 needs one that fails the build on any
`?? 0` fallback for a null metric — the defect class this whole plan is built
to prevent.
