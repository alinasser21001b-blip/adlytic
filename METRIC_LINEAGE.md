# METRIC_LINEAGE

Where every important number comes from, measured from source on the current
commit. Documentation was not consulted; the code is the evidence.

---

## The path a number takes

```
Meta Graph API v20.0
  └ MetaClient            src/services/metaClient.ts      transport only, returns raw JSON
    └ insightMapper       src/mappers/insightMapper.ts    the cordon — the only place Meta field names may appear
      └ RawInsight        raw_json, verbatim, per (entityType, entityId, date)
      └ DailyStat         20 numeric columns, per (entityType, entityId, date)
        └ getDashboard    src/services/getDashboard.ts    window aggregation + KPI assembly
        └ server.ts       /api/*                          list endpoints, their own aggregation
        └ agent tools     src/services/agent/tools/*      ~14 tools, their own aggregation
          └ DTO → UI      src/web/pages/*                 renders; must not compute
          └ LLM           explanation only
```

The cordon holds: Meta field names appear in `insightMapper.ts` and
`metaClient.ts` and essentially nowhere else. That is a real architectural
strength and the reason a measurement kernel is achievable at all.

---

## What travels with a number: nothing

`DailyStat` (prisma/schema.prisma:405) is
`entityType, entityId, date` + 20 numbers + `createdAt`.

There is **no** column for:

| context | why its absence bites |
|---|---|
| attribution window | conversions from two accounts are not comparable, and a client changing the window in Ads Manager silently rewrites history — see `META_CAPABILITY_MATRIX.md` Part 2 |
| currency / minor factor | held on the AdAccount and re-derived by each consumer; this is the shape that once printed 40,000 IQD as "USD 400.00" |
| timezone | `MetaClient` converts `time_range` to the account timezone (metaClient.ts:97) — correctly — but the stored row does not record which calendar it belongs to |
| API version | a v20→v21 field-semantics change would be invisible in the history |
| freshness / confidence | every downstream layer treats a 4-hour-old row and a 4-week-old row identically |

**This is the central finding of Phase 0.** Everything the brief asks for above
Level 2 — diagnosis, state, forecast, scenarios — rests on evidence whose
context is not recorded. Confidence cannot be computed from data that does not
carry its own provenance.

---

## Competing realities

The brief (§3) asks where one conceptual metric is computed more than once.
Counted from source:

| metric | independent implementations | where |
|---|---|---|
| CTR | **8** | `getDashboard.ts` ×2, `detectAnomaly`, `analyzeCreativePatterns`, `findSimilarCampaigns`, `getCreativePerformance`, `rankCampaigns`, `getAudienceBreakdown` |
| CPM | **9** | `getDashboard.ts` ×3, `detectAnomaly`, `analyzeCreativePatterns`, `getCampaignDetails`, `getCreativePerformance`, `rankCampaigns`, `getAudienceBreakdown`, `comparePeriods`, `getHourlyPattern` |

There is **no shared metric module.** `src/lib/` has 23 files —
`campaignLifecycle`, `campaignPurpose`, `objectiveKpis`, `currency` — but
nothing that owns "what CTR is".

### Do they disagree?

Mostly the formula is the same (`Σclicks / Σimpressions × 100`, ratio-of-sums,
not mean-of-ratios — which is correct). The divergence is not in the algebra:

1. **Null and zero behaviour differ.** `detectAnomaly.ts:251` falls back to the
   stored `row.ctr` when impressions are 0; the agent tools return `null`;
   `getDashboard` returns `null`. A zero-impression day is therefore "no data"
   on one surface and "Meta's stored value" on another.
2. **Rounding differs.** Agent tools `.toFixed(4)`; `getDashboard` does not.
   Small, but it means two surfaces can print different last digits for the
   same window and nothing notices.
3. **Each one re-derives major units from minor independently.** This is the
   dangerous one — it is the same shape as the IQD defect that printed spend at
   1/100 scale. Nine independent `spendMajor` derivations are nine chances to
   get the factor wrong for one account.

**Not fixed in this phase, deliberately.** Per the brief §32, a metric
implementation is replaced by running old and new side by side and reporting
the discrepancy first. Collapsing nine implementations into one without that
comparison would silently change production numbers — which is the failure mode
this whole project exists to prevent.

---

## Metric classification (brief §4)

Applied to what exists today:

| class | example | today's status |
|---|---|---|
| OBSERVED | `spend`, `impressions`, `clicks`, `reach` | stored raw in `DailyStat`, no context columns |
| NORMALIZED | `messages`, `purchases`, `leads` (from `actions[]`) | mapped in `insightMapper`, unit semantics enforced by `resultSemantics.ts` |
| DERIVED | CTR, CPM, CPC, cost-per-result | **computed 8–9 times independently, no owner** |
| INTELLIGENCE | health score, diagnoses, recommendations | separate engines; `test_health_single_source.ts` already enforces one health source |

The invariant "no intelligence output may silently become an observed metric"
holds today — `test_analytics_architecture.ts` (27 assertions) and
`test_health_single_source.ts` guard it. The invariant "no downstream layer
independently redefines a canonical metric" **does not hold**: that is the 8/9
count above.

---

## What Phase 1 must do, in order

1. **Capture attribution context.** Add `attribution_setting` to requested
   fields and store it. Changes no existing number; unlocks the hypothesis that
   is currently unaskable. Gated on the probe returning AVAILABLE.
2. **Give `DailyStat` its provenance columns** — attribution setting, currency
   + minor factor as-of-write, source API version, fetched-at. Additive; no
   existing read changes.
3. **Introduce the kernel for DERIVED metrics only**, behind a comparison path:
   compute both, report discrepancies, migrate per-metric once the discrepancy
   report is empty or explained.

Nothing above Level 2 of the brief's ladder should be built before step 1 and
step 2 land. Building a forecast on evidence that cannot state its own
attribution window produces a confident number with no meaning.
