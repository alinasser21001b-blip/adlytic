# 04 — Legacy console migration

The strangler contract, and where each historical route stands.

## The rule

A legacy route may be deprecated only when **`MISSING_CAPABILITIES = 0`**, and
"migrated" is not a judgement — it is computed by `routeParity()` over the
capability registry, gated by an assertion that the page claiming to serve a
capability really calls its backend.

That last clause is the whole gate. Without it the registry would be a wish
list: a developer types a route into `controlPlaneRoute`, parity reads 100%,
and the legacy page gets deleted along with the capability nobody rebuilt. On
its first run the assertion caught **six** capabilities claiming homes their
pages did not serve.

## Status

| LEGACY_ROUTE | CAPABILITIES | MIGRATED | MISSING | PARITY | SAFE_TO_DEPRECATE |
|---|---|---|---|---|---|
| `/admin/classic` | 18 | 18 | 0 | 100% | yes |
| `/admin/os` | 8 | 8 | 0 | 100% | yes |
| `/admin/inbox` | 5 | 5 | 0 | 100% | yes |
| `/admin/observability` | 4 | 4 | 0 | 100% | yes |
| `/admin/meta-readiness` | 3 | 3 | 0 | 100% | yes |

```
LEGACY_ADMIN_PRODUCTS_BEFORE = 6
LEGACY_ADMIN_PRODUCTS_AFTER  = 1
LEGACY_ROUTES_REMAINING      = 5
```

## Why five routes remain at 100% parity

**Parity is necessary, not sufficient.** Every capability has a Control Plane
home that provably calls the same backend — but each legacy page still owns
*presentation* the replacement has not matched: the classic console's deep edit
drawers, observability's detailed reach and money tables, readiness's full quota
breakdown, the inbox's original thread rendering, the Admin OS's epistemic
ladder.

Deleting a route the day its last capability is served elsewhere is how a
migration produces a regression that is technically not a capability loss. The
registry says these are *safe* to deprecate; retiring them is a separate,
deliberate step with its own review, and this branch does not take it.

## What "consolidated" means here

Each legacy route is:

- **still mounted** — asserted by test;
- **absent from the global sidebar** — asserted by test;
- **linked from the surface that replaced it** — asserted by test, against
  `ADMIN_LEGACY[].reachableFrom`;
- **declared with what it still owns** — a non-empty reason, asserted by test.

A route dropped from the menu but not linked from its successor is not
consolidated. It is hidden, and hiding is how capability gets lost while
everyone believes it was migrated.

## adminConsolePage and adminOsPage

`docs/close-code/12` left this open explicitly: the classic console is a
functional **superset** of the Admin OS — it alone owned settings, subscriptions,
payment events and the overview API — so redirecting one into the other would
have silently removed operator capability, and both pages rendering the same
menu only fixed the symptom.

They are no longer competing products. Neither is a destination in the sidebar.
`/admin` is the Control Center; the Admin OS moved to `/admin/os` and the classic
console stayed at `/admin/classic`, both as strangler hosts under
`CUSTOMERS`/`CONTROL_CENTER` respectively. Their unique functions — settings,
subscriptions, payment events — were extracted first, into
`customersWorkspacePage`, exactly as the mission required.

## The one duplicate

`cap.meta.probe.os` duplicates `cap.meta.probe`: the same
`POST /api/admin/capability-probe`, rendered by two consoles. Both now point at
`/admin/meta`, marked `MERGE`. A test asserts a capability marked as a duplicate
shares its target's backend — otherwise it is not a duplicate, it is a second
implementation wearing the label.
