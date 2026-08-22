# 15 — The 48th capability

```
CAPABILITY   = cap.ops.reconcileActions
ROUTE        = POST /api/admin/reconcile-actions
CLASSIFICATION = D — dangerous / manual-only operation
CONTROL_PLANE_ROUTE = null, deliberately
```

## What it actually does

Read out of `src/api/server.ts` and `src/lib/actionOverlapReconcile.ts`, not
from its name:

- It replays a **corrected mapper** over stored `raw_insights` and rewrites the
  derived action rows. It repairs history.
- It makes **zero Meta API calls**. Nothing leaves the platform.
- It is **dry-run by default**: `{"apply": true}` is required to write, and the
  report is byte-identical either way, so an operator always sees the exact
  impact before committing to it.
- It is **bounded and cursor-paginated** — 500 rows default, 5,000 hard cap —
  so it can never become an unbounded background job.
- It is invoked after a mapper correction. That is a rare event a human
  supervises, not a routine operation.

## Against the five options

| | |
|---|---|
| **A — internal implementation detail** | No. It is operator-triggered and platform-admin gated. |
| **B — operator capability that needs UI** | No, and this is the interesting one. See below. |
| **C — obsolete** | No. It is mounted, guarded, and remains the repair path after any mapper fix. |
| **D — dangerous / manual-only** | **Yes.** It rewrites stored measurement history in bulk. |
| **E — future capability** | No. It exists and works today. |

## Why B is wrong, specifically

The tempting reading is "an operator capability with no UI is a gap". It is
not, because **the friction is the feature**.

The route is already well-designed for manual use: dry-run first, explicit
`apply`, a cursor the caller must advance, a hard row cap. A Control Plane UI
would have to either

- reproduce that flow faithfully — a real multi-step feature nobody asked for,
  serving an operation that runs a handful of times in the platform's life; or
- simplify it to a button — which deletes the step where the operator reads the
  dry-run report before rewriting stored history.

The second is what a UI built to reach 48/48 would actually be. Building it
would make the number look better and the platform less safe, which is the
exact trade this registry exists to prevent.

## What was done instead

The classification now lives **in the registry**, not only in this document.
`AdminCapability.unhostedReason` is required whenever `controlPlaneRoute` is
null, and `test_admin_control_plane.ts` asserts both that it is present and
that this capability's kind is `MANUAL_ONLY`.

That matters because "we did not get to it" and "a button here would be
dangerous" look identical in a table of nulls. Without the classification the
second decays into a to-do that somebody later "fixes" by adding the button —
which is precisely how a bulk rewrite of measurement history acquires a
one-click UI.

## The correct invocation

Dry run first, always:

```
POST /api/admin/reconcile-actions
Authorization: Bearer <platform-admin token>
{ "limit": 500 }
```

Read the report. Only then:

```
POST /api/admin/reconcile-actions
{ "limit": 500, "apply": true, "cursor": "<from the dry run>" }
```

## Final count

```
ADMIN_CAPABILITY_TOTAL      = 48
HOSTED_IN_CONTROL_PLANE     = 47
DELIBERATELY_MANUAL_ONLY    = 1
ADMIN_CAPABILITIES_LOST     = 0
```

`ADMIN_CAPABILITY_PARITY = 47/47 hostable · 100%`, with the 48th classified
rather than counted as a gap.
