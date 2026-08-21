# Action authority domains

Three different systems in Adlytic emit "action codes". They look alike and
are not alike, and conflating them produced a live defect: the Brain
Observatory rendered eighteen codes in one table headed *"guarded by
permitAction()"*, every one reading `NOT_VETOED`, when the guard could only
rule on nine of them.

## permitAction() is a veto, not a validator

```ts
export function permitAction(actionCode, reconciled) {
  if (!actionCode) return { allowed: true };
  if (reconciled.forbiddenActions.includes(actionCode)) return { allowed: false, reason };
  return { allowed: true };
}
```

It is a **membership test against `forbiddenActions`**, and
`reconcileIntelligence()` fills `forbiddenActions` from exactly two arrays:
`CREATIVE_ACTIONS` and `AUDIENCE_ACTIONS`.

So for any code outside those arrays it returns `allowed: true`
**unconditionally** — it would return `allowed: true` for the string
`"BANANA"`. That result is the **absence of jurisdiction**, not a clearance.
Presenting it as `NOT_VETOED` claims a check happened that structurally could
not.

## PERMIT_ACTION_DOMAIN — 13 codes

`analytics/intelligence/hierarchy.ts::PERMIT_ACTION_DOMAIN`, derived from the
same two arrays the reconciler pushes onto `forbidden`, so the two can never
disagree.

| Group | Codes |
|---|---|
| `CREATIVE_ACTIONS` (5) | `REFRESH_CREATIVE`, `REFRESH_CREATIVES`, `CHANGE_CREATIVE`, `NEW_CREATIVE`, `IMPROVE_HOOKS` |
| `AUDIENCE_ACTIONS` (8) | `EXPAND_AUDIENCE`, `WIDEN_TARGETING`, `INCREASE_BUDGET`, `DECREASE_BUDGET`, `BROADEN_AUDIENCE`, `CHECK_TARGETING`, `REVIEW_BUDGET_PACING`, `NARROW_AUDIENCE` |

## DECISION_ENGINE_DOMAIN — 7 codes

`engine/DecisionEngine.ts::DecisionAction`, produced by the pure function
`decideCampaignAction(physics, confidence, pattern, recovery)` and persisted
to `campaign_brain_snapshots.action` by `services/BrainPersistence.ts`.

`SCALE_BUDGET`, `HOLD_AND_MONITOR`, `REFRESH_CREATIVE`, `PAUSE_CAMPAIGN`,
`KEEP_COLLECTING`, `RESCUE_WATCH`, `EMERGENCY_PAUSE`

These are **outcomes**, not guardable actions. `KEEP_COLLECTING` is not a
lever anyone pulls; it is the engine saying the sample has not matured.

## The overlap is real — do not make the domains disjoint

**`REFRESH_CREATIVE` is in both**, and it is load-bearing: it is the code
behind the cmoFeedV2 authority gap. When the Brain decides `REFRESH_CREATIVE`
on a campaign the funnel diagnosed `POST_CLICK`, the guard genuinely forbids
it. A regression test pins this.

## Other producers

| Producer | Codes | Ungoverned |
|---|---|---|
| `engines/recommendation/compositionRules.ts::ActionCode` | 6 | `PAUSE_AND_RELAUNCH` |
| `services/agent/tools/saveRecommendation.ts::ALLOWED_ACTION_CODES` | 9 | `PAUSE`, `PAUSE_URGENT`, `MONITOR`, `INVESTIGATE_TRACKING` |
| `analytics/intelligence/recommend.ts::templateFor` | 6 | see below |

## Open finding — RECOMMEND_TS_UNGOVERNED_ACTIONS

`recommend.ts::templateFor` emits six action codes and **four are outside the
veto domain**: `FIX_MESSAGING_DESTINATION`, `FIX_LANDING_PAGE`,
`FIX_CONVERSION_STEP`, `REVIEW_BIDDING`.

`recommend.ts:153` calls `permitAction(template.actionCode, reconciled)` and
drops the recommendation when it fails — but for these four the call can never
fail. **The guard is a no-op for four of the six actions it appears to
protect.**

Reported, not fixed. Widening `permitAction()` to cover them would be a
semantic claim about which problem classes contradict which fixes, and that
claim is not currently derivable from the funnel. The Observatory instead
reports `authorityRelation: NOT_GOVERNED` whenever the recommended action is
one of these, so the gap is visible rather than silently papered over.

## Follow-up debt — DTO_AUTHORITY_LABEL_OVERCLAIM

`services/getDashboard.ts` (`applyCmoFeedAuthorityGuard`) calls
`permitAction(item.actionCode ?? item.insightType, intel)`, where
`insightType` is `CmoInsightType` — the **DecisionEngine** vocabulary. So for
`KEEP_COLLECTING` the call returns a vacuous `allowed: true` and the DTO
stamps `permitted: true, permittedReason: null`.

**Behavior is correct.** No problem class has grounds to forbid
`KEEP_COLLECTING`, so keeping the item is right; the Part A fix still drops
genuinely contradicted items such as `REFRESH_CREATIVE` under `POST_CLICK`.

**The label overclaims.** `permitted: true` on an ungoverned code asserts a
check that did not occur — the same conflation the Observatory just fixed,
one layer down.

Not fixed here: the `permitted` field is consumed by `dashboardPage.ts`, so
correcting it ripples into merchant-facing rendering, which is outside the
scope of the Observatory blocker. This does **not** block Mission A
instrumentation closure unless live validation shows a behavioral
contradiction — only a labelling one is known.

## Invariants under test

`test_brain_observatory.ts` §10 asserts:

1. `codes(actionAudit) === PERMIT_ACTION_DOMAIN` — **set equality**, so no
   ungoverned code can be shown and no governed code hidden.
2. `permitAction('__NOT_A_REAL_ACTION__', …).allowed === true` — the vacuity
   demonstrated, not argued.
3. Every code in the table appears in `forbiddenActions` on some real
   `reconcileIntelligence()` path — it can actually be vetoed.
4. No `DecisionAction` except the `REFRESH_CREATIVE` overlap appears in the
   table.
5. `REFRESH_CREATIVE` is in both domains and stays `FORBIDDEN` under
   `POST_CLICK`.
6. The outside-domain surface carries `authorityRelation` and a producer, and
   **no** `permitted` / `state` / `permitState` field.
7. `llmLayer` carries no `brainAction*` field; the decision lives under
   `decision.canonicalDecision` with a producer naming `DecisionEngine`.
