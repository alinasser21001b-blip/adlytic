# Baseline acceptance case — pre/post Mission A

One real campaign, captured from the live Brain Observatory **before** Mission A
landed, kept as the first post-implementation comparison. The campaign's
identity is deliberately not recorded here: the regression fixture in
`test_brain_observatory.ts` (`buildBaselineShapeRows`) reproduces its **shape**,
because a fixture pinned to one campaign id stops being a regression test the
moment that campaign changes.

## What was captured

Observed window `2026-08-13 → 2026-08-19`.

```
dailyRows            = 5
legacy dataStatus    = COMPLETE

current   impressions=0     reach=0     linkClicks=0   messages=0   spend=0
prior     impressions=5872  reach=2371  linkClicks=32  messages=22  spend=761
          ctr=2.0776

diagnosis    NO_MATERIAL_BREAK, confidence=INSUFFICIENT_DATA
Brain action KEEP_COLLECTING
actions      multiple codes rendered PERMITTED
trace        DATA_VALIDITY, SEMANTIC_VALIDITY, FUNNEL_DIAGNOSIS only
```

## What the capture proves, traced to code

**The window is 14 days, not 7.** `dailyRows` counts the full span
`priorSince → currentUntil`. Run on 2026-08-21 UTC that is `2026-08-06 →
2026-08-19`: current `08-13 → 08-19`, prior `08-06 → 08-12`. So 5 rows sit
across 14 calendar days.

**Five rows with all-zero current metrics is genuinely ambiguous.** Every
current-window total is a sum, and `reach` is a `Math.max`
(`entityIntelligence.ts`). "0 rows in the current window" and "7 rows present
but zero-delivery" therefore produce *byte-identical* aggregates, an identical
funnel verdict and an identical confidence. No metric can separate them.
`temporal.storedDates[]` is the only field that can — which is why it exists,
and why it must never be replaced by a count. Asserted in
`test_brain_observatory.ts` §9, "zero-delivery rows are distinguishable from
absent rows ONLY by storedDates".

**`dataStatus = COMPLETE` was never a measurement.** `buildEntityFunnel`
returns `dataConfidence: 'COMPLETE' as DataConfidence` — a hardcoded constant,
justified only by the window ending before Meta's attribution backfill. It
reads COMPLETE for every campaign holding at least one row in the span,
including this one. A consequence worth knowing separately: the reconciler's
`DATA_VALIDITY` layer can never observe `MISSING` or `PARTIAL` from this path.

**The 3-layer trace is a short-circuit, not a truncated display.**
`hierarchy.ts`: `if (!funnel || funnel.status === 'INSUFFICIENT_DATA')` pushes
`FUNNEL_DIAGNOSIS` and returns immediately. `ANOMALY_DETECTION`,
`HEALTH_IMPACT` and `RECOMMENDATION` never form an opinion.

**"Multiple actions PERMITTED" was the same short-circuit.** That early return
also carries `forbiddenActions: []`. `permitAction()` is a pure veto, so with
nothing forbidden it allows every code — while `recommend.ts` returns `null` on
both `NO_MATERIAL_BREAK` and `INSUFFICIENT_DATA`. Every action therefore
rendered as PERMITTED under a verdict of "not enough data to judge". That is
the concrete case for the four-state taxonomy.

**CTR 2.0776% vs link CTR ~0.545%.** `insightMapper` stores Meta's `ctr` in
percent units, and Meta's `ctr` is clicks(ALL) ÷ impressions. Link CTR is
`32 / 5872 × 100 = 0.545%` — a different numerator over the same denominator.
Both figures are correct; only the shared label was wrong.

## Checklist → emitted field

| Required answer | Field | Notes |
|---|---|---|
| exact storedDates[] | `temporal.storedDates` | actual days, ascending |
| exact missingDates[] | `temporal.datesWithoutRows` | **named differently on purpose** — "missing" asserts the days *should* have carried data, which cannot be proven: `time_increment=1` omits zero-delivery days and `Campaign` stores no Meta start/stop time |
| coverage FULL/SPARSE/UNKNOWN + why | `temporal.temporalCoverage`, `temporal.coverageBasis` | **`SPARSE` is not in the type.** `FULL` only when every day carries a row; otherwise `UNKNOWN` |
| lastSyncedAt | `temporal.lastSyncedAt` | from `AdAccount` |
| syncAge | `temporal.syncAgeDays` | plus `latestStoredDateAgeDays`, `backfillHorizonDays` (28, read from `workers/syncHorizon.ts`) and `spanInsideBackfillHorizon` |
| freshness=UNKNOWN unless canonical policy | `temporal.freshness`, `temporal.freshnessBasis` | always `UNKNOWN`; the basis names `adminOpsHealth.ts`'s two conflicting ops-scoped rules and declines to adopt either |
| stored CTR semantic label | fact `CTR — all clicks (%)` | `OBSERVED_FACT`; source states clicks(ALL) ÷ impressions |
| derived Link CTR | fact `Link CTR (%)` | `DERIVED_FACT` from `buildEntityFunnel`'s `linkCtrCur`/`linkCtrPri` — derived in the canonical window context, not in the Observatory, so the two can never disagree |
| object identity / insights level / DailyStat ownership | `identity.*` | `insightsQueryLevel`, `dailyStatOwnershipLevel` |
| recommended vs merely not-vetoed | `decision.actionAudit[].state` | `RECOMMENDED` / `NOT_VETOED` / `FORBIDDEN` / `AUTHORITY_INVARIANT_VIOLATION`, over **exactly** the 13 codes `permitAction` governs. `NOT_RECOMMENDED` is never emitted — nothing records that an action was considered and rejected |
| what the Brain decided | `decision.canonicalDecision` | DecisionEngine output, `deterministic: true`. Carries `authorityRelation`; `permitState` is null when the guard has no jurisdiction — see `docs/AUTHORITY_DOMAINS.md` |
| what the veto cannot reach | `decision.outsideVetoDomain` | ungoverned producer codes, each with `authorityRelation: NOT_GOVERNED` and **no** allowed/forbidden verdict |
| canonical trace provenance | `trace[]` | all six `LAYER_ORDER` layers with `canonicalSource`, `inputSource`, `status`, `absenceReason` |
| — | `temporal.legacyDataStatus` + `legacyDataStatusBasis` | the old value, labelled as a constant |

## Predicted post-Mission-A output

Stated in advance so the comparison is falsifiable rather than confirmatory.
Every value below is produced by the regression fixture, which reproduces the
captured shape.

```
identity      CAMPAIGN / metaEntityType=campaign
              insightsQueryLevel=campaign, dailyStatOwnershipLevel=CAMPAIGN

temporal      requestedSpan   2026-08-06 → 2026-08-19   (14 days, inclusive)
              currentWindow   2026-08-13 → 2026-08-19
              priorWindow     2026-08-06 → 2026-08-12
              storedRowCount  5
              storedDates     the 5 actual days  ← THE DISCRIMINATOR
              datesWithoutRows 9 days
              dataPresence    AVAILABLE
              temporalCoverage UNKNOWN
              settlement      SETTLED
              freshness       UNKNOWN
              legacyDataStatus COMPLETE  (+ basis: hardcoded constant)

metaTruth     CTR — all clicks (%)   current null   prior 2.0776
              Link CTR (%) [DERIVED] current null   prior 0.545
              Impressions            current 0      prior 5872
              Messages               current 0      prior 22

diagnosis     NO_MATERIAL_BREAK, INSUFFICIENT_DATA, decidedBy FUNNEL_DIAGNOSIS

decision      canonicalDecision       KEEP_COLLECTING
                                      producer engine/DecisionEngine.ts
                                      deterministic=true
                                      authorityRelation=NOT_GOVERNED
                                      permitState=null   ← never NOT_VETOED
              canonicalRecommendation action=null (nothing advised)
              actionAudit             13 codes = PERMIT_ACTION_DOMAIN exactly,
                                      ALL NOT_VETOED (forbiddenActions is empty)
                                      0 RECOMMENDED, 0 FORBIDDEN, 0 VIOLATION
              outsideVetoDomain       the ungoverned producer codes, no verdict
              forbiddenActions        []

trace         6 layers
              REACHED     DATA_VALIDITY, SEMANTIC_VALIDITY, FUNNEL_DIAGNOSIS
              NOT_REACHED ANOMALY_DETECTION, HEALTH_IMPACT, RECOMMENDATION
                          each with an absenceReason and a null conclusion
```

The Brain action no longer appears under LLM LAYER. `KEEP_COLLECTING` is
deterministic `DecisionEngine` output, so it is owned by DECISION; the LLM
pane holds narration and a `narratesDecision` reference only.

Note the rate fields are **`null`, not `0`**. Zero impressions is no sample,
not a 0% rate; reporting 0 would invite "CTR collapsed to zero" when nothing
was served at all.

## Two conditions the comparison depends on

**The service must be redeployed.** The baseline was read from a build
predating every Mission A commit. Check `/api/health` reports the integration
branch's current HEAD before comparing anything.

**The window moves with `Date.now()`.** These windows are computed live, not
stored. A run on 2026-08-22 shifts the current window to `2026-08-14 →
2026-08-20`, changing which rows fall in which half and possibly the row count.
Compare on 2026-08-21 UTC, or record the `requestedSpan` the Observatory prints
alongside the results — it prints it for exactly this reason.

## Status

`REAL_CAMPAIGNS_VALIDATED = 0`. This document is instrument evidence, not
validation. The gate stays closed until five real campaigns are checked by a
human.
