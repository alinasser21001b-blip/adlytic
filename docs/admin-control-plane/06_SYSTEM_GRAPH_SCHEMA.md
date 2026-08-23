# 06 — System graph schema

```
GRAPH_NODES = 135
GRAPH_EDGES = 275
```

## Node classes (12)

| Class | Count | Source |
|---|---|---|
| `META_CAPABILITY` | 28 | `metaDependencyGraph.ts :: META_RESOURCES` |
| `SERVICE` | 20 | module paths under `src/services/`, `src/lib/` |
| `API_ROUTE` | 39 | `adminCapabilities.ts :: canonicalBackend` |
| `PAGE` | 17 | `adminCapabilities.ts :: currentPage` + Control Plane routes |
| `ENGINE` | 7 | modules under `src/engines/`, `src/analytics/` |
| `INTELLIGENCE_LAYER` | 6 | `hierarchy.ts :: LAYER_ORDER` |
| `DB_MODEL` | 5 | `prisma/schema.prisma` |
| `DEPLOYMENT_SERVICE` | 4 | `config.ts :: serviceRole`, DATABASE_URL, REDIS_URL |
| `QUEUE` | 4 | `lib/queue.ts :: QUEUE_NAMES` |
| `META_ENTITY` | 3 | `metaEntityDiscovery.ts :: DiscoveryLevel` |
| `PERSISTENCE_OWNER` | 1 | `src/repositories/` |
| `WORKSPACE` | 1 | `prisma/schema.prisma :: model Workspace` |

## Edge kinds (11 of 12 in use)

`CONSUMES` 65 · `CALLS` 47 · `RENDERS` 41 · `GUARDED_BY` 39 · `DEPLOYED_AS` 39 ·
`PERSISTS_TO` 8 · `DEPENDS_ON` 10 · `READS` 8 · `AUTHORIZED_BY` 8 ·
`OWNED_BY` 7 · `PRODUCES` 3

`WRITES` is declared in the vocabulary and currently **unused**: every write this
graph can source is a persistence write, and `PERSISTS_TO` says that more
precisely. It stays in the type for external snapshots that draw the
distinction; emitting it here to fill the table would have meant duplicating
edges we already have.

## Provenance is mandatory

Every node and every edge carries `{ method, source, note? }` with no default.
There is no way to add a fact to this graph without saying where it came from —
claims without a source are rumours, and a rumour rendered as a diagram looks
authoritative.

| Method | Nodes | Edges | Meaning |
|---|---|---|---|
| `REPOSITORY_DECLARATION` | 51 | 152 | a literal in the source tree |
| `REGISTRY_ENTRY` | 84 | 123 | a curated row, itself read out of the tree |
| `RUNTIME_OBSERVATION` | — | — | overlays only (doc 07) |
| `CANONICAL_SNAPSHOT` | — | — | overlays only (doc 08) |
| `EXTERNAL_SNAPSHOT` | — | — | imported through the adapter |

The distinction that matters is the first two: a registry row was curated by a
human and could be stale; a repository declaration is a literal. A reader who
cannot tell them apart cannot judge how much to trust the picture.

## Unknowns are data

Eight nodes carry an `unknowns[]` list, and the inspector renders it as a
first-class block. Examples:

- each **queue** — depth and stalled-job counts are not observed;
- the **worker** service — a separate process's liveness is not visible from the
  API; the state is inferred from the last successful sync;
- the **platform-admin guard** — the allowlist comes from an environment
  variable the graph cannot read;
- **DailyStat** — it has no `adAccountId` column (the key is
  `(entityType, entityId, date)`), so its link to an ad account is polymorphic
  and cannot be drawn as an edge.

**`PeriodInsight` is deliberately absent from this graph.** Its migration is
mid-rollout and owned by another engineer, whose gate asserts that only three
modules mention period facts at all. A graph node would document the model, not
read it — but that gate is a grep, it is theirs, and it is live. Deferred rather
than argued; see doc 12.

That last unknown is the discipline working. The obvious picture is
`DailyStat → AdAccount`, and the schema does not support it. Two similar edges
were written and then removed on checking `prisma/schema.prisma`:
`MetaConnection` hangs off `Workspace`, not `AdAccount`.

## What the model cannot express

- **No health field on a node.** Runtime state is a separate overlay. If a node
  carried its own status, an overlay would mutate architecture truth to show it,
  and "what depends on what" would change every time Redis blinked.
- **No conclusion field.** The intelligence trace is likewise an overlay. The
  graph shows *which* layers participated; the Brain owns *what* they concluded.
- **No mutation verbs.** Nothing here can write.

## What is a node, and what is not

One `WORKSPACE` node, not one per customer. Individual workspaces are rows, and
rows are runtime — putting each customer in the architecture graph would make
"what does the system look like" change every time somebody signed up. Observed
per-workspace state reaches that node as an aggregate through the runtime
overlay instead.

---

## Schema 1.1.0 — optional dependencies and fallback paths

**Additive.** A 1.0.0 snapshot still validates: both additions are optional and
a reader that ignores them sees exactly the graph it saw before.

### `GraphEdge.requiredness?: 'REQUIRED' | 'OPTIONAL'`

A bare `DEPENDS_ON` could not distinguish *"BullMQ requires Redis"* from *"the
queue runtime optionally uses BullMQ"*. That mattered operationally: a reader
tracing outward from a dead Redis concluded background work had stopped, when
`enqueueOrFallback()` keeps it running in-process — which is the production
configuration.

Left **undefined** where the evidence supports no claim either way. An
unqualified edge is honest; a guessed one is not.

### `FALLS_BACK_TO` edge kind

`A → B`: when A's preferred path is unavailable, A continues via B. Genuinely a
different relationship from `DEPENDS_ON`, not a qualifier on one — the queue
runtime does not *depend on* in-process execution, it *retreats to* it.

Currently one instance:
`src/lib/queue.ts --FALLS_BACK_TO--> src/lib/queue.ts#in-process`,
provenance `REPOSITORY_DECLARATION :: enqueueOrFallback`.

### Reading blast radius correctly

Traverse **`REQUIRED`** edges only. An `OPTIONAL` edge means the dependant
survives the target's loss. Structural blast radius is what *could* be
affected; it is not observed state, and the graph must never mark a downstream
node failed on the strength of a traversal.

### Provenance is still mandatory

Every node and every edge — new kinds included — carries provenance.
`test_system_graph.ts` fails the build otherwise.
