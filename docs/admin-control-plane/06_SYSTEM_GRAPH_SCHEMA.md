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

### `DEPENDS_ON` carries a strength

`GraphEdge.strength` is an optional `'REQUIRED' | 'OPTIONAL_FALLBACK'`, only
meaningful on `DEPENDS_ON`. It exists because "QUEUE `DEPENDS_ON` redis" was
true and misleading at once: the literal is real (`getQueueRedis` reads
`REDIS_URL`), but a reader who stopped at the edge kind would reasonably
conclude Redis absence breaks the queue. It does not — `enqueueOrFallback()`
is proven at every call site to run the same work in-process instead.

```
DEPENDS_ON = 10:  5 OPTIONAL_FALLBACK (queue → redis, ×4 queues + the queue
                    module itself) · 5 REQUIRED (the intelligence-layer chain,
                    which genuinely short-circuits on an upstream failure)
```

Unset (`undefined`) is itself a legitimate value, not a gap to fill in later —
it means "this edge kind never claimed a dependency-strength distinction",
which is true of every non-`DEPENDS_ON` kind. The adapter treats a present but
unrecognised `strength` the same way it treats a bad `unknowns` entry: dropped,
not a reason to refuse the whole edge (`MISSING_PROVENANCE` and friends are
for fields with no safe default; this one has one — "not stated").

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
