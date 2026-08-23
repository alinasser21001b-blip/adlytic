# 07 — Runtime overlay (mode 2)

```
RUNTIME_GRAPH_MODE = src/graph/runtime.ts → GET /api/admin/graph/runtime
SOURCE             = adminOpsHealth.ts :: getAdminOpsSnapshot()  (canonical, unchanged)
```

## The invariant

An overlay is a map from node id to observed state. It is **not** a graph. It
cannot add a node, remove one, or re-point an edge, because it has nowhere to
put one — `RuntimeOverlay.states[]` has exactly five fields and none of them is
structural.

The snapshot it is handed is deep-frozen, so a write attempt fails instead of
landing. That is not defensive style: it is the difference between "Postgres is
down" and "Postgres is no longer what DailyStat persists to". The first is an
incident; the second is a graph that lies for as long as the incident lasts, and
keeps lying if the overlay forgets to undo itself.

Tested by asserting the values do not change after an attempted write — not by
asserting a throw, since whether a rejected assignment throws depends on the
caller's strict mode, and the invariant must hold either way.

## It observes nothing of its own

Every state is copied from `adminOpsHealth`, which is already the canonical
answer to "is this subsystem up". This module does not probe Redis, time a
query, or decide what counts as healthy. A second opinion on subsystem health is
a second source of truth, and the console would then have two greens that could
disagree.

## Subsystem → node

| Ops subsystem | Graph node |
|---|---|
| `database` | `deploy:postgres` |
| `redis` | `deploy:redis` |
| `queue` | `module:src/lib/queue.ts` |
| `workers` | `deploy:worker` |
| `meta` | `module:src/services/metaClient.ts` |
| `intelligence` | `module:src/analytics/intelligence/hierarchy.ts` |

Plus `deploy:api`, whose evidence is that the request was served, and
`model:Workspace`, which receives the per-workspace aggregate.

**One subsystem, one node.** The temptation is to fan `queue` out across the four
QUEUE nodes so the picture looks more alive — but `adminOpsHealth` observes
whether the queue *system* accepts jobs and never inspects an individual queue.
Four green queues from one observation would be three claims nobody made. Those
nodes keep the gap in their `unknowns` instead.

## State mapping

| Ops status | Runtime state | Note |
|---|---|---|
| `HEALTHY` | `HEALTHY` | |
| `RUNNING` | `HEALTHY` | no third colour for "busy and fine"; original in `detail` |
| `UNKNOWN` | `UNKNOWN` | **never** HEALTHY |
| `NOT_TESTED` | `NOT_TESTED` | **never** FAILED |
| `DEGRADED` | `DEGRADED` | |
| `WARNING` | `DEGRADED` | lossy; original in `detail` |
| `BLOCKED` | `FAILED` | lossy; original in `detail` |
| `ERROR` | `FAILED` | |

Every mapped state carries `ops=<original>` in `detail`, so the two lossy steps
stay recoverable by anyone reading the inspector rather than being decided
silently on their behalf.

Absence — `UNKNOWN`, `NOT_TESTED`, `NOT_CONFIGURED` — is drawn **dashed and
unfilled**, neither green nor red, matching `adminStatus.ts`. FAILED is solid
red; UNKNOWN never is. "We could not tell" reading as "it is broken" teaches
operators to ignore red.

## The honest gap: NOT_CONFIGURED

`RuntimeState` includes `NOT_CONFIGURED`, and **`adminOpsHealth` cannot currently
produce it.** When Redis has no URL or BullMQ is disabled by config, that module
reports `NOT_TESTED` — which is not the same claim: we know exactly what those
components are doing (nothing, by configuration), rather than never having asked.

This overlay maps faithfully and does not guess. Distinguishing them would mean
changing `adminOpsHealth`'s status semantics, which ripples into the Admin OS
rendering and its tests — a change with its own review, not a side effect of a
graph feature. The state stays in the vocabulary for external runtime sources
that draw the distinction, and the gap is recorded here.

Both mission rules hold regardless: `NOT_CONFIGURED` is never rendered as
`FAILED` (it maps to an absence state), and `UNKNOWN` is never rendered as
`HEALTHY`.

## Mismatches are surfaced

Node ids the ops snapshot mentions that the graph does not contain land in
`overlay.unmatched` rather than being dropped. A silent mismatch between the map
and the territory is how a graph goes quietly out of date.

## Intelligence layers get no runtime state

`adminOpsHealth` reports the intelligence subsystem as `NOT_TESTED` and says why:
narration coverage is measured in `platform-stats` and no live check exists.
Painting six layers from an admittedly untested subsystem would manufacture
exactly the certainty that module refuses to manufacture.

---

## The overlay consumes canonical operational truth

`RuntimeNodeState` now also carries `reasonCode`, `mode`, `observedAt`,
`freshness` and `requiredness`. These are **forwarded** from
`AdminOpsSnapshot.assessments` — the overlay does not compute them. That is the
only way the System Graph and the Operations Console are guaranteed to agree
about a subsystem.

These fields live on the overlay, never on `GraphNode`: architecture is what
exists, runtime is what is currently true, and the map must not change shape
because Redis went down.

### The overlay observes nothing

`src/graph/runtime.ts` may not ping Redis, call Meta, read telemetry, or
compute readiness or Brain health. It is a projection.

This is enforced **by import path**, not by a list of function names.
The first version of the guard listed names (`getRedis`, `withRedis`, …) and a
negative test planted `isRedisHealthy` straight through it. A guard you can
evade by choosing a different export from the same module is not a boundary,
so the check now rejects any *value* import from `lib/redis`, `lib/queue`,
`services/meta*`, `@prisma/client`, plus direct `fetch(` / `prisma.` /
`process.env` use. `import type` remains fine — a type cannot probe anything.
