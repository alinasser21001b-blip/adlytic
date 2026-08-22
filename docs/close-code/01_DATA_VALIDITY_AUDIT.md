# 01 — Data validity audit

## The defect

`buildEntityFunnel` returned `dataConfidence: 'COMPLETE' as DataConfidence` —
a literal constant, not a measurement. Three consequences followed from that
one line:

1. `DATA_VALIDITY`, the first rung of the hierarchy, could never observe
   anything but COMPLETE. The layer was decorative.
2. `reconcileIntelligence()` has a PARTIAL rule that caps confidence at
   MEDIUM. It could never fire for a data reason.
3. A window holding one row out of fourteen days reached full confidence.

## Answers

```
CAN_TEMPORAL_UNKNOWN_BE_TREATED_AS_COMPLETE   = NO  (was YES)
CAN_PARTIAL_STORAGE_RAISE_DECISION_CONFIDENCE = NO
CAN_DATA_VALIDITY_OBSERVE_MISSING             = YES (no rows in span → null funnel)
CAN_DATA_VALIDITY_OBSERVE_PARTIAL             = YES (was NO)
CAN_DATA_VALIDITY_OBSERVE_UNKNOWN             = expressed as PARTIAL — see below
CAN_ONE_ROW_OF_FOURTEEN_DAYS_APPEAR_COMPLETE  = NO  (was YES)
CURRENT_BEHAVIORAL_RISK                       = NONE for this path
```

## The fix

Coverage is derived from the rows the query already read. COMPLETE only when
every calendar day in the span carries a row — the one case with no absence
left to explain. Otherwise PARTIAL.

**Why PARTIAL and not a new enum member.** `DataConfidence` is the type whose
stated purpose is "how sure we are the numbers are complete". Its PARTIAL doc
comment was too narrow, so the comment was widened rather than the enum. Three
situations now share the value because they share one consequence — the window
cannot be vouched for: the span includes today, an attribution window is still
open, or day coverage cannot be confirmed.

**Choosing PARTIAL does not assert the absent days should have held data.**
`time_increment=1` omits zero-delivery days, and `Campaign` stores no Meta
start/stop time, so absence stays undecidable between no-delivery,
never-synced and not-yet-running. The only claim made is "this window cannot
be vouched for", which is true in all three cases. The precise dates live in
the Observatory's `temporal` block; `dataConfidence` is the coarse gate that
feeds the confidence cap.

**No freshness threshold was invented.** `freshness` remains UNKNOWN, with
`adminOpsHealth.ts`'s two conflicting ops-scoped rules named and declined.

## Proof

`test_brain_observatory.ts`, "sparse coverage cannot reach HIGH confidence".
Same fixture, same funnel break, same `problemClass`: full coverage reaches
HIGH, and dropping a single day caps it to MEDIUM. **Both halves are
asserted**, so the test cannot pass by blanket-downgrading everything.

Also asserted: a fully covered span still reports COMPLETE; the reconciler's
`DATA_VALIDITY` trace line reports the measured value; zero delivery stays
distinguishable from an absent row (doc 02).
