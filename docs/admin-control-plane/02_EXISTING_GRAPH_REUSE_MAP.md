# 02 — Existing graph reuse map

This audit ran **before** any graph code was written. Its purpose was to
establish what already existed, so the answer to "build a dependency graph"
could be "extend the one that is already drift-tested" rather than "write a
second one".

## The search

Repository, docs, tests, schemas and the last three days of commit history were
searched for: Graphify, graph, architecture graph, dependency graph, Meta
dependency graph, intelligence trace, system topology, Brain Observatory, admin
observability, build identity, runtime health, capability graph, entity
discovery, admin information architecture.

```
EXISTING_GRAPH_ASSETS       = src/intelligence/metaDependencyGraph.ts
                              src/intelligence/platformChange.ts
                              test_dependency_drift.ts
EXISTING_GRAPH_MODELS       = MetaResource, ProductFeature, BlastRadius
                              (metaDependencyGraph.ts)
EXISTING_GRAPH_BUILDERS     = resolveBlastRadius()  — resource → affected features
EXISTING_GRAPH_UI           = NONE
EXISTING_GRAPH_TESTS        = test_dependency_drift.ts (registry vs. production drift)
                              test_intelligence_slice.ts (consumes the registry)
EXISTING_RUNTIME_OVERLAYS   = src/services/adminOpsHealth.ts :: AdminOpsSnapshot
                              (subsystems, attention, workspaces, activity, boundary, build)
EXISTING_BRAIN_TRACE_ASSETS = src/services/brainObservatory.ts :: TraceStage[]
                              src/analytics/intelligence/hierarchy.ts :: LAYER_ORDER
```

## The critical finding about the word "Graphify"

`graphify` appears in this repository in exactly three places, and in all three
it is **a git branch name** — `claude/adlytic-graphify-analysis-ai34bu`, the
branch on which the Brain Observatory and the intelligence architecture were
built. There is no Graphify engine, no Graphify export format, and no Graphify
artifact committed anywhere.

That matters for two decisions:

1. Graphify is an **external** tool. The Control Plane must accept a snapshot
   from it through an adapter (doc 05) rather than reimplement it.
2. There was no existing graph *rendering* to reuse — so the UI is genuinely
   new, while the *data* is genuinely not.

## GraphQL: checked, and deliberately not introduced

Searched: no GraphQL server, client, schema or dependency exists. The only hits
are an unrelated string in `test_deploy_gate.ts` and a skill asset.

"Graphify" and "GraphQL" are different things, and the mission's use of the word
"graph" means the system map. Introducing a GraphQL layer because the word
appeared would have been a large, risky rewrite justified by a pun.

## Disposition

```
REUSE      = metaDependencyGraph.ts (META_RESOURCES, PRODUCT_FEATURES, dependsOn edges)
             hierarchy.ts LAYER_ORDER (the six reasoning layers, in their own order)
             adminOpsHealth.ts AdminOpsSnapshot (the entire runtime overlay source)
             brainObservatory.ts TraceStage[] (the entire trace overlay source)
             adminStatus.ts (status vocabulary — unchanged)
             adminSurfaceNav.ts ADMIN_IA (evolved, not replaced)
             lib/queue.ts QUEUE_NAMES, lib/buildIdentity.ts

EXTEND     = ADMIN_IA — same module, same exported name, destinations changed from
             historical pages to domains; ADMIN_LEGACY added beside it
             adminSurfaceNav's AdminSurface union — new ids added, old ones kept

DEPRECATE  = nothing. No graph asset was removed. Five legacy ROUTES are marked
             for eventual retirement in doc 04, and none is retired here.

MISSING    = a snapshot contract              → src/graph/model.ts
             an external-format boundary      → src/graph/adapter.ts
             the join between the registries  → src/graph/architecture.ts
             overlay projections              → src/graph/runtime.ts, trace.ts
             any rendering at all             → src/web/pages/systemGraphView.ts
```

## What the builder does NOT do

It does not resolve dependencies. `resolveBlastRadius()` already answers "what
breaks if Meta changes this", and `test_dependency_drift.ts` fails when
production requests a field the registry has not heard of — a gate that has
already caught a live omission (`conversion_rate_ranking`, requested in
production and absent from the registry on the drift test's first run).

Re-deriving those edges would create a second answer to "what depends on spend",
and the losing answer would still be rendered somewhere. So
`buildArchitectureGraph()` reads `PRODUCT_FEATURES[].dependsOn` and reshapes it
into module → resource edges, carrying each feature's user impact and failure
mode into the edge's provenance note so the blast radius survives the reshaping.

```
GRAPH_EXISTING_ASSETS_REUSED    = 8
GRAPH_DUPLICATE_ENGINES_CREATED = 0
```

A test asserts the second line: `test_system_graph.ts` scans `src/graph/` for
more than one `build*Graph` export and for the names `GraphEngine2`,
`SystemGraphV2` and `GraphBuilderV2`.
