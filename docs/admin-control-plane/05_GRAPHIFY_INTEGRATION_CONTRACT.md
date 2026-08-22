# 05 — Graphify integration contract

```
GRAPHIFY_INTEGRATION_CONTRACT = ADAPTER (src/graph/adapter.ts)
GRAPH_SCHEMA_VERSION          = 1.0.0
```

## The premise

Graphify runs **outside** this repository. We do not control its export format,
its version cadence, or whether the file we are handed today resembles the one
we were handed last month. The audit in doc 02 confirmed there is no Graphify
artifact, format or engine committed here — only a branch named after it.

So the contract is a boundary, not an implementation.

## The two failure modes it prevents

**Locking the UI to a guessed format.** If admin pages read an external shape
directly, the first format change breaks the Control Plane — and we would have
invented that shape ourselves anyway, committing the product to a contract its
owner never agreed to.

**Rendering a broken graph.** A snapshot with an edge pointing at a node that is
not there is not "mostly fine". It is a diagram that omits a dependency, read by
an operator deciding whether something is safe to restart.

## The contract

```ts
interface GraphSnapshot {
  version: string;                 // semver; major must match, minor may not lead
  generatedAt: string;
  source: string;                  // 'adlytic-internal' | 'graphify:<version>'
  repositoryCommit: string | null;
  nodes: GraphNode[];              // id, nodeClass, label, what, owner, provenance
  edges: GraphEdge[];              // id, from, to, kind, provenance
  metadata: Record<string, string | number | boolean | null>;
}
```

Field names are deliberately the plain ones a foreign exporter would guess.

## The door

`importGraphSnapshot(raw)` is the only entry point:

1. Already canonical → validate and return.
2. A registered `ExternalGraphAdapter` claims it → translate, **then validate**.
3. Nothing claims it → `UNRECOGNISED_FORMAT`, naming the registered adapters.

Adapters are registered with `registerExternalAdapter({ id, detect, adapt })`.
A future Graphify export is a new adapter; the Admin UI does not change.

An adapter is a shape converter, never a trust boundary of its own — validation
always runs afterwards, so an adapter cannot smuggle a dangling edge through. A
throwing adapter is a refusal, not an exception reaching the admin route. Both
are tested.

## Fail closed

| Code | Refused because |
|---|---|
| `UNSUPPORTED_MAJOR_VERSION` | schema we do not understand |
| `FUTURE_MINOR_VERSION` | newer minor may carry fields we would silently drop |
| `MISSING_VERSION` / `MALFORMED_VERSION` | unversioned or non-semver |
| `DANGLING_EDGE` | an edge to a node that is not drawn |
| `MISSING_PROVENANCE` | a fact with no stated source |
| `UNKNOWN_NODE_CLASS` / `UNKNOWN_EDGE_KIND` | vocabulary we do not have |
| `DUPLICATE_NODE_ID` / `DUPLICATE_EDGE_ID` | two facts claiming one identity |
| `MISSING_NODES` / `MISSING_EDGES` / `MALFORMED_*` | structural |
| `UNRECOGNISED_FORMAT` | no adapter, and not canonical |

**There is no partial import.** No "load the nodes we understood". An operator
shown 60% of a dependency graph with no indication which 60% is worse off than
one shown an error — the first looks complete.

Version ordering is deliberate: the check runs before node validation, so a
snapshot from schema 2.0.0 is reported as a version problem rather than as fifty
malformed nodes. An operator reading "incompatible schema" knows to update; one
reading "node 37 is malformed" goes hunting a bug that is not there.

## Nothing throws

Every rejection is a typed result. The caller is an admin route, and a malformed
graph must degrade the graph panel while the rest of the console keeps working:
the screen you use to find out what is broken must not be the screen that breaks.

## No import endpoint

There is no `POST /api/admin/graph/import`. Accepting a graph over the wire
would make the map writable by whoever could reach the route, and the map is
what an operator trusts when deciding whether something is safe to touch. A
future Graphify snapshot arrives as a deployed artifact read server-side through
this same adapter — the boundary is the code path, not an HTTP door.

## Our own builder goes through the same door

`GET /api/admin/graph/architecture` validates `buildArchitectureGraph()`'s output
before returning it. That is not ceremony: a builder bug producing a dangling
edge is refused at the route rather than rendered as a dependency that does not
exist.
