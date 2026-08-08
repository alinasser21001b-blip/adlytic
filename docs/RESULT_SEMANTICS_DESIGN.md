# P2 — Result Semantics Design

**Status:** DESIGN — awaiting approval. No implementation has begun.
**Replaces:** the ambiguous `DailyStat.conversions` column (frozen under Rule 4).
**Governed by:** `ANALYTICS_RULES.md`

---

## The problem, precisely

```ts
const conversions = messages || purchases || leads;   // insightMapper.ts
```

This is a first-non-zero fallback, not a semantic decision. Three consequences:

1. **The column means something different per row.** A sales campaign that also
   received page messages reports *messages* as its conversions, because messages
   is evaluated first. Nothing records which meaning a given row carries.
2. **Aggregation across campaigns is meaningless.** Summing `conversions` over an
   account adds conversations to purchases to leads — different units, summed as
   if they were one quantity.
3. **It is load-bearing anyway.** `getDashboard` uses it as `currentResults` for
   the account-level diagnosis, so a nonsense aggregate drives real advice.

The fix is not a better fallback. It is to stop storing an answer to a question
that has no single answer, and store the *question's inputs* instead.

---

## The model

### `ResultDefinition` — what counts as a result, and why

```ts
/** What a campaign of this purpose is actually trying to produce. */
export interface ResultDefinition {
  /** Which stored counter carries this purpose's result. */
  resultKey: ResultMetricKey;          // 'messages' | 'purchases' | 'leads' | 'clicks' | 'impressions'
  /** The business outcome, not the platform event. */
  businessOutcome: BusinessOutcome;
  /** Merchant-facing nouns. */
  labelAr: string;
  labelEn: string;
  /** Cost metric paired with this result. */
  costMetricKey: string;               // key into METRIC_DICTIONARY
  /** Rate metric that measures conversion INTO this result, when one exists. */
  rateMetricKey: string | null;
  /** Units — makes cross-purpose summing a type error, not a silent bug. */
  unit: ResultUnit;
}

export type BusinessOutcome =
  | 'qualified_conversations'   // messaging: a person the merchant can now sell to
  | 'site_visits'               // traffic
  | 'lead_submissions'          // leads
  | 'orders'                    // sales
  | 'social_interactions'       // engagement
  | 'brand_exposure'            // awareness
  | 'app_installs';             // app

/** Two results with different units may never be added. */
export type ResultUnit = 'conversation' | 'visit' | 'lead' | 'order' | 'interaction' | 'impression' | 'install';
```

The four concepts stay separate exactly as Rule 1 requires:

| Concept | Example | Source |
|---|---|---|
| `campaignObjective` | `OUTCOME_ENGAGEMENT` | Meta, stored raw, never overwritten |
| `optimizationGoal` | `POST_ENGAGEMENT` | Meta ad set |
| `destinationType` | `WHATSAPP` | Meta ad set |
| `purposeFamily` | `messaging` | `resolveCampaignPurpose` (canonical) |
| **`resultType`** | `messages` | `ResultDefinition.resultKey` |
| **`businessOutcome`** | `qualified_conversations` | `ResultDefinition.businessOutcome` |

`resultType` is the *platform event we count*. `businessOutcome` is *what it
means to the merchant*. Conflating them is how "engagement" ended up describing
a WhatsApp campaign.

### `ResultValue` — a result that knows what it is

```ts
export type ResultValue =
  | { status: 'OK'; count: number; unit: ResultUnit; outcome: BusinessOutcome;
      definition: ResultDefinition; dataConfidence: DataConfidence }
  | { status: 'UNAVAILABLE'; reason: MetricUnavailableReason; definition: ResultDefinition };
```

A bare `number` can be added to anything. A `ResultValue` carries its unit, so
the aggregator can refuse an illegal sum instead of computing a wrong one.

### Aggregation across mixed purposes

```ts
export interface MixedResultTotal {
  /** Per-unit subtotals. Never flattened into one number. */
  byUnit: Array<{ unit: ResultUnit; outcome: BusinessOutcome; count: number; campaigns: number }>;
  /** True when more than one unit is present — the UI must NOT show a single total. */
  mixed: boolean;
  /** The dominant unit by spend, for headline framing only. Never summed into. */
  dominant: { unit: ResultUnit; spendShare: number } | null;
}
```

An account running messaging and sales campaigns has **no single result count**,
and the honest presentation says so: *"84 محادثة · 12 طلب"*, not *"96 نتيجة"*.
`dominant` exists so the dashboard can still lead with the thing the merchant
spends most on, without pretending the others are the same quantity.

---

## Migration path

Reads are switched before writes are removed; nothing is deleted until every
consumer is off it.

| Step | Change | Reversible? |
|---|---|---|
| 1 | Add `ResultDefinition` + `resultFor(purposeFamily)`. Pure, no I/O, no schema. | yes — additive |
| 2 | Add `resolveResult(purposeFamily, dailyRow): ResultValue` reading the *existing* per-type columns (`messages`/`purchases`/`leads`), which are already stored correctly and unambiguously. | yes — additive |
| 3 | Migrate consumers off `conversions` one at a time, dropping each from the Rule-4 ratchet as it goes. Each is an independently shippable commit. | yes |
| 4 | When the ratchet reaches zero: stop *writing* `conversions`. Column retained, no longer read. | yes |
| 5 | Drop the column in a later release, once a full sync cycle has confirmed nothing regressed. | no — final |

**No backfill is required.** This is the design's main advantage: `messages`,
`purchases` and `leads` have always been stored separately and correctly.
`conversions` was only ever a derived convenience. Every historical row can be
re-interpreted correctly from data already on disk — so step 2 gains full
history immediately, with no reprocessing and no Meta re-fetch.

---

## What this unlocks

- **Honest account-level results.** Today's diagnosis consumes a summed
  apples-and-oranges figure; afterwards it consumes per-unit subtotals.
- **Objective-correct cost metrics.** Cost per result stops dividing spend by a
  mixed denominator.
- **Funnel intelligence (P3).** The click → conversation rate needs a *typed*
  result and a link-click denominator. P0 delivered the denominator; this
  delivers the numerator.
- **Conversation Outcome Intelligence (long-term).** `businessOutcome` is
  deliberately named for the merchant's world, not Meta's, so later stages —
  answered, qualified, order, revenue — extend the same enum instead of
  requiring a second parallel model.

---

## Open questions for approval

1. **`dominant` framing.** Is leading the dashboard with the highest-spend
   purpose acceptable, or should a mixed account show all units with equal
   weight? Recommendation: `dominant` for the headline, all units in the detail —
   most Adlytic accounts are ~90% messaging, and forcing equal weight would bury
   the number that matters.

2. **The corroboration gap** (found while building the golden dataset). When
   objective and optimization goal *agree*, the resolver records only
   `objective:`, so classification confidence reads `INFERRED` for a case two
   independent signals actually confirm. It under-claims, which is safe.
   Recommendation: add `corroborated: boolean` to the purpose result during P2,
   since it touches the resolver and Rule 1 says that must be a deliberate change.

3. **Engagement's result key.** `engagement` currently uses `clicks` as its
   result, marked `estimated` in the dictionary because all-clicks is only a
   proxy for post interactions. Meta exposes `post_engagement` as an action type.
   Should P2 fetch and store it properly, or is engagement rare enough among
   Adlytic's clients to leave as an approximation? Recommendation: leave it,
   and revisit only if a client actually runs engagement campaigns at volume.

---

## Explicitly not in P2

Funnel intelligence (P3), objective-driven dashboard sections (P4), anomaly
detection (P5), any provider beyond Meta, and Conversation Outcome capture.
P2 ends when `conversions` has no readers and results carry their own meaning.
