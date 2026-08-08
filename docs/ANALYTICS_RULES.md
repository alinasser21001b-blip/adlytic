# Analytics Architecture Rules

**Status:** LOCKED. Approved 2026-08-08.

These seven rules govern every change to the analytics layer. They are not
aspirational — each one is **enforced by an executable fitness test** in
`test_analytics_architecture.ts`, which reads the source tree and fails when a
rule is violated. Unit tests catch broken behaviour; these catch erosion, where
each individual violation still "works" and the system degrades anyway.

To change a rule, change this document first, in a commit that does nothing
else. A test weakened without a corresponding edit here is a review failure.

---

## Rule 1 — Resolved purpose is the canonical classification

`resolveCampaignPurpose()` is the single semantic authority. No downstream
consumer may re-derive a campaign's family from the raw Meta objective.

**Why:** this is the exact defect that produced the split brain. The same
campaign read as `messaging` in the campaigns API and `engagement` in the
diagnosis engine, because two places each decided for themselves.

**Enforced by:** a source scan that fails if `objectiveKpiFamily(` or
`getObjectiveKpiSpec(` is called outside the four semantic-core files. Consumers
receive an already-resolved family or call the resolver.

---

## Rule 2 — The raw objective is preserved for traceability

`Campaign.objective` stores what Meta told us, verbatim, forever. An inferred
family is never written back over it.

**Why:** the raw objective is the audit trail. Overwriting it with our inference
would make a future classification bug unfixable — we could never re-derive,
compare, or disagree, because the evidence would be gone.

**Enforced by:** a scan for an inferred family being assigned to an `objective`
field, plus a check that the sync write path reads Meta's payload directly and
never imports the resolver.

---

## Rule 3 — `UNKNOWN` is a first-class state

When evidence is insufficient, the system says so. It never infers a business
objective to fill the gap.

**Why:** the worst behaviour found in the audit was not a wrong calculation but
a fabricated default — `objective ?? 'messaging'` — which made an unknown look
like a fact and gave every account messaging vocabulary regardless of what it
advertised.

**Enforced by:** `resolveObjectiveFamily` must be typed to return
`ObjectiveKpiFamily | null`, and the standards layer must model `'unknown'` as a
real family with its own neutral vocabulary.

---

## Rule 4 — The ambiguous `conversions` field is frozen

`DailyStat.conversions` is `messages || purchases || leads` — a first-non-zero
fallback, so one column carries a different meaning per row with no record of
which. **No new code may read it** until P2 replaces it with an objective-aware
`ResultDefinition`.

**Why:** a foundation you cannot interpret is worse than no foundation. Every
new consumer deepens the dependency and raises the cost of fixing it.

**Enforced by:** a ratchet holding a measured per-file usage baseline. Any new
file, or any growth in an existing file's count, fails the build.

**P2 status: the field no longer drives analytics meaning.** Every engine that
branched on it now resolves the result from the campaign's purpose
(`analytics/resultSemantics.ts`). The remaining references are deprecation
comments plus the legacy write kept for rollback safety — the column is still
populated, but nothing reads it to decide anything. A second fitness test
forbids reintroducing the fallback expression itself (`messages || purchases`,
`messages ?? conversions`) anywhere outside the frozen mapper line.

Counts only go DOWN from here. Raising one requires justifying why a new reader
of an ambiguous field is acceptable.

---

## Rule 5 — Three confidences stay separate

| Type | Question | Failure mode | Correct response |
|---|---|---|---|
| **Classification** | What is this campaign? | Vague ODAX shell, destination unsynced | Stop using objective-specific vocabulary |
| **Data** | Are these numbers complete? | Partial day, open attribution window, unsynced column | Show with a caveat; never alert on it |
| **Benchmark** | Is there enough sample to compare? | Small spend, short window, thin cohort | Show the value, withhold the verdict |

**Why:** they fail independently and demand different actions. A campaign can be
perfectly classified, with complete data, and still be uncomparable — a normal
state for an Iraqi SMB account, and one the system must be able to express
rather than paper over.

**Enforced by:** three distinct exported types in `analytics/confidence.ts`, and
a check that no blanket `Confidence` union is introduced.

---

## Rule 6 — Applicability is enforced by the analytics layer, not the UI

The engine decides whether a metric may be shown. The UI renders what it is
given.

**Why:** a UI-level guard is one forgotten conditional away from leaking. Worse,
every new surface — API consumer, export, AI prompt, weekly email — has to
re-implement the same rule and will eventually get it wrong.

**Enforced by:** `computeMetric` gates on `isMetricApplicable` before computing,
and every benchmark helper takes `sample` as a **required** parameter. An
optional sample would let a caller silently skip the confidence gate, so the
test explicitly forbids `sample?:`.

---

## Rule 8 — Approximate results must remain approximate

`engagement` and `app` derive their results from all-clicks. That is a proxy,
not a measurement, and the flag must survive every hop of the pipeline.

**Why:** converting `clicks → app installs` into a confident business result is
the same class of error as `objective ?? 'messaging'` — a guess wearing the
costume of a fact. Benchmarks, anomaly detection and recommendations must all be
able to ask "is this measured?" without reaching back into definitions.

**Enforced by:** `ResultDefinition.approximate`; `UnitSubtotal.approximate`,
which is contagious within an outcome; `isApproximate()` on the aggregate; and
`getDashboard` withholding an approximate single-unit count from the diagnosis
entirely. Tests assert the flag survives aggregation and that mixing approximate
with exact preserves both.

---

## Rule 9 — `unit` must not hide semantic differences

A shared unit does not make two results interchangeable, and a shared *source
column* certainly does not.

**Why:** `traffic`, `engagement` and `app` all count `clicks`, but they mean
site visits, social interactions and app installs. Aggregating by unit was safe
only because today's units happen to be distinct — luck, not design.

**Enforced by:** `aggregateMixedResults` keys on `businessOutcome`, not `unit`;
`singleUnitResultKey` resolves by outcome; and an invariant test fails if any two
definitions ever share a unit while meaning different outcomes.

---

## Rule 7 — `NOT_APPLICABLE`, `INSUFFICIENT_DATA` and zero are distinct

Three different facts that must never collapse into `0`:

- `NOT_APPLICABLE` — this metric is meaningless for this objective (ROAS on a messages campaign)
- `INSUFFICIENT_DATA` — valid metric, empty denominator (cost per conversation with no conversations yet)
- `0` — a real, measured zero

**Why:** a merchant seeing `0` cannot tell "you got nothing" from "this does not
apply to you" from "we do not know yet", and each demands a different action.

**Enforced by:** distinct members on `MetricUnavailableReason`, plus runtime
assertions that a zero denominator returns `INSUFFICIENT_DATA` and an
inapplicable metric returns `NOT_APPLICABLE`.

---

## Standing requirement — golden dataset before every phase

Before each implementation phase, add or update `src/analytics/goldenDataset.ts`
so that a campaign cannot silently change semantic meaning.

Each golden case asserts **both** the expected family **and** which rung of the
resolution ladder decided it. Asserting only the family would let a classifier
reach the right answer via the wrong evidence — which passes today and breaks
the next case tomorrow.

A code change that flips a golden classification fails the suite. The author
must then either fix the code, or edit the dataset deliberately — which surfaces
in review as a semantic decision rather than an invisible side effect.

---

## Phase scope (current)

**Completed:** P0 link clicks, P1 benchmark confidence, P2 result semantics,
P3 funnel intelligence (objective-aware funnels, landing-page views persisted,
earliest-break diagnosis, material-degradation gating, `FunnelDiagnosis` DTO).

**P2 exit conditions — all met (2026-08-08):**

| Condition | Evidence |
|---|---|
| `conversions` has zero analytics readers | code-only scan: 12 files, all legacy write / form field / prose |
| `ResultDefinition` is the source of truth | every engine resolves results through it |
| Mixed results cannot be flattened | `MixedResultTotal` has no cross-unit total field |
| Result units are protected | aggregation keys on `businessOutcome` |
| Business outcomes preserved | `resultKey ≠ businessOutcome ≠ unit`, all three stored |
| Approximate results explicitly marked | `approximate` propagates and is contagious |
| Unknown results remain unknown | `null` family yields `NOT_APPLICABLE`, never a guess |
| All tests green | 24 suites; result-semantics 42, architecture 16 |
| No P3 code introduced | funnel work is design-only |

**Next, on approval:** P4 objective-driven dashboard sections, P5 anomaly
detection — in that order, and not before. P5 also reconciles the existing
HIGH_FREQUENCY detector with the funnel's reach stage so two systems never
describe the same phenomenon differently.

**Explicitly out of scope:** Google Ads or any additional provider, large UI
redesigns, unrelated architecture work. Enforced by a test that fails if a
`adapters/google` or `adapters/tiktok` path appears.

---

## Preserved long-term direction — Conversation Outcome Intelligence

```
Ad → Click → Conversation → Answered → Qualified → Order → Revenue
└──────── Meta gives us this ────────┘└──── Adlytic's opportunity ────┘
```

**Not to be built now.** The architecture must simply stay capable of it:

- The metric dictionary already models stages as independent metrics with their
  own applicability and confidence, so later stages slot in without reshaping it.
- `DataConfidence` already distinguishes `MISSING` from a measured zero, which is
  what an unanswered-conversation stage will need from day one.
- The funnel model localises a break to one link, so appending links extends the
  diagnosis rather than rewriting it.

No schema or interface added during P0–P5 may make this harder to reach.
