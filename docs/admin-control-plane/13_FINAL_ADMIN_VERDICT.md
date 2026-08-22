# 13 — Final admin verdict

```
ADMIN_CONTROL_PLANE_STATUS = COMPLETE
```

Against the eight conditions the mission set for that word.

## 1. No important existing Admin capability was lost

48 capabilities registered, 47 with a proven Control Plane home. The 48th
(`cap.ops.reconcileActions`) never had an operator surface in either previous
console; it is registered rather than quietly dropped, and a test asserts it is
the only permitted gap.

Every one of the seventeen capabilities the mission named as
must-not-disappear is reachable (doc 11).

## 2. One Control Plane reaches every important operator function

Six domains, one shell, one command palette over every destination. Five legacy
routes remain mounted as strangler hosts, out of the sidebar, each linked from
the surface that replaced it — asserted, not asserted-to.

## 3. Historical consoles no longer behave like competing products

`adminConsolePage` and `adminOsPage` were the two competing Admin products. Both
are now strangler hosts behind `/admin/classic` and `/admin/os`; neither is a
sidebar destination; the settings, subscriptions and payment-event capabilities
unique to the classic console were extracted into the Customers workspace
**first**, exactly as required — and no route was redirected into another.

Enforced structurally: there is one function in the codebase that produces an
admin document, no Control Plane surface may contain `<!DOCTYPE html>`, and none
may render the navigation map itself.

## 4. Existing graph work was reused, not duplicated

`metaDependencyGraph.ts` (already drift-tested, already caught a live omission),
`hierarchy.ts` `LAYER_ORDER`, `adminOpsHealth`'s snapshot, the Brain
Observatory's trace, `adminStatus.ts`, `ADMIN_IA`, `QUEUE_NAMES` and
`buildIdentity`. The builder adds the joins between them and nothing else.

`GRAPH_DUPLICATE_ENGINES_CREATED = 0`, asserted by scanning `src/graph/` for
more than one `build*Graph` export and for `GraphEngine2` / `SystemGraphV2` /
`GraphBuilderV2`.

No GraphQL was introduced. None existed; the word "graph" here means the system
map, and rewriting the API layer on a pun would have been a large risk for no
return.

## 5. Graphify has an explicit integration boundary

`src/graph/adapter.ts`. Versioned contract, registered external adapters,
fail-closed on ten refusal codes, no partial import, no import endpoint, and our
own builder validated through the same door. A future Graphify format is a new
adapter, not a UI change.

## 6. All three modes work from canonical sources

| Mode | Source | Computes |
|---|---|---|
| Architecture | repository registries | joins only |
| Runtime | `adminOpsHealth.getAdminOpsSnapshot()` | nothing |
| Intelligence trace | `brainObservatory.buildBrainObservatory()` | nothing |

One component, one layout, three paintings. Mode switching never re-lays-out,
adds a node, or removes an edge.

## 7. Authorization remains safe

`ADMIN_AUTH_GAPS = 0`. Every new page route behind `adminPage`; every new API
route behind `requirePlatformAdmin`; no client-side authorization branch on any
new surface or in the shell. Privileged actions confirm; the destructive one
requires typing the customer's email.

## 8. The graph UI never becomes a second intelligence engine

`GRAPH_REDERIVES_BRAIN_LOGIC = NO`. `trace.ts` copies `status`, `conclusion`,
`absenceReason`, `canonicalSource` and `inputSource` verbatim. A test scans it
(comments stripped) for any derivation of reached-ness from a conclusion, any
call into the reconciler, and any numeric threshold.

`GRAPH_READ_ONLY = YES`, `GRAPH_MUTATION_PATHS = 0` — three GET routes, no
database client reachable from any graph module, no mutating fetch and no form
in the component.

## What is honestly incomplete

- **`cap.ops.reconcileActions` has no UI.** It never did. Building one was
  outside this scope; claiming it had one would have been worse.
- **`NOT_CONFIGURED` is not yet distinguishable from `NOT_TESTED`** in the
  runtime overlay, because `adminOpsHealth` does not draw that distinction.
  Changing its semantics ripples into the Admin OS and its tests — a separate
  change with its own review. Both mission rules still hold: unconfigured never
  reads as failed, unknown never reads as healthy. Recorded in doc 07.
- **Five legacy routes remain** at 100% capability parity, because each still
  owns *presentation* the replacement has not matched. Retiring them is a
  deliberate follow-up, not a side effect of this branch.
- **The parity gate prevents silent capability loss, not a worse rendering** of a
  capability that is present. Stated in doc 11 rather than left implied.
- **Per-queue depth, separate-worker liveness and the admin allowlist** are not
  observable. They are recorded as node `unknowns` and rendered, not hidden.

## Verdict

The Control Plane is one product. The graph is one engine with three modes,
built on work that already existed, bounded by an adapter, and structurally
incapable of writing anything or deciding anything the Brain owns.

`ADMIN_CONTROL_PLANE_STATUS = COMPLETE`
