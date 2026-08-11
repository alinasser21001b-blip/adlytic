# IMPLEMENTATION_PLAN

Derived from what Phase 0 actually found, not from the generic phase list.
Two findings reorder everything:

- **The cordon holds.** Meta field names are confined to `metaClient.ts` and
  `insightMapper.ts`. A measurement kernel is achievable without a rewrite.
- **Stored numbers carry no context.** No attribution window, currency,
  timezone, API version or freshness on `DailyStat`. Every layer above
  Level 2 of the brief's ladder would rest on evidence that cannot state its
  own provenance.

So the order is: **context first, kernel second, intelligence third.** Anything
else builds confidence intervals on sand.

---

## Phase 1 — Measurement context (no number changes)

| Step | Change | Blast radius |
|---|---|---|
| 1.1 | Run the probe against one real workspace; fill `META_CAPABILITY_MATRIX.md` | none — read-only |
| 1.2 | Add `attribution_setting` to requested insight fields | **none** — it reports the applied window, it does not select one |
| 1.3 | Migration: `daily_stats` gains `attribution_setting`, `currency`, `minor_factor`, `source_api_version`, `fetched_at` | additive; every existing read unaffected |
| 1.4 | Backfill marker: rows written before 1.3 are `attribution_setting = NULL` = "written before this was recorded", never "no attribution" | — |
| 1.5 | Surface it: any conversion figure whose window is unknown says so | UI copy only |

**Gate for 1.2/1.3:** the probe must return AVAILABLE for
`insights.attribution_setting`. If it returns PERMISSION_REQUIRED, the
deliverable for this phase is the permission request, not a workaround.

**Migration approval required** before 1.3 runs — per the standing rule, the
migration is written and shown, not applied.

## Phase 2 — Capability discovery, completed

Fill the matrix from real runs across several workspaces (an account-specific
refusal is not a capability verdict). Assign tiers **after** the token result.
Then, and only then, decide which candidates earn ingestion.

## Phase 3 — Measurement kernel, behind a comparison path

Collapse the 8 CTR and 9 CPM implementations into one owner — but per §32:
compute old and new, emit `MEASUREMENT_DISCREPANCY_REPORT.md`, explain every
difference, then migrate one metric at a time. The likely findings are already
known: divergent null/zero handling, divergent rounding, and nine independent
minor→major derivations.

## Phase 4 — Signal registry

Only signals whose inputs now carry context. A signal built on a
context-free conversion count inherits its ambiguity.

## Phase 5 — Campaign state model + temporal memory

The `ACCOUNT_HALTED` work already showed the shape: an exhaustive tier set with
one owner beats scattered booleans. State dimensions follow the same rule —
each with value, evidence, confidence, and a previous value.

## Phase 6 — Diagnostic hypotheses

Buildable only after Phase 1, because "this is a reporting change" is one of
the required competing hypotheses and it is currently unaskable.
**"Insufficient evidence" must be a first-class verdict**, as the campaigns
page's data observer already demonstrates.

## Phase 7 — Forecast + backtest

No forecast ships before its backtest. Report error, direction accuracy,
lead time, false positive/negative rates, and calibration.

## Phase 8 — Scenarios

`PREDICTED` / `SIMULATED` / `HYPOTHETICAL` must be distinguishable in the DTO,
not only in the prose.

## Phase 9 — LLM explanation + hardening

The boundary already exists and is tested. Extend it to the new objects.

---

## What is done

- `src/services/metaCapabilityProbe.ts` — read-only, budgeted, quota-aware
  capability prober.
- `test_meta_capability_probe.ts` — 35 assertions. Found two defects in the
  probe before it ever ran: an ad-set node read addressed to the ad account
  (a valid field would have been recorded UNAVAILABLE), and a permission
  refusal filed as UNAVAILABLE (a fixable scope gap recorded as an absent
  capability).
- `META_CAPABILITY_MATRIX.md` — skeleton, token column deliberately empty.
- `METRIC_LINEAGE.md` — measured lineage, the context gap, the 8/9 count.

## What is NOT done, and cannot be from here

- **The probe has never been run.** No Meta token, and no egress to
  `graph.facebook.com` from this sandbox. Every capability claim in the matrix
  is therefore absent rather than assumed.
- No forecast, scenario or diagnostic engine exists yet. None should, until
  Phase 1 lands.
