# 08 — Intelligence trace overlay (mode 3)

```
INTELLIGENCE_TRACE_GRAPH_MODE = src/graph/trace.ts → GET /api/admin/graph/trace/:campaignId
SOURCE                        = brainObservatory.ts :: buildBrainObservatory()
GRAPH_REDERIVES_BRAIN_LOGIC   = NO
```

## The line this module must not cross

The graph does not reason. It cannot decide that a layer was reached, cannot
infer a conclusion from the layer before it, and cannot fill a gap with a
plausible verdict. Every value is **copied** from a `BrainObservatorySnapshot` —
itself a read-only view of what `reconcileIntelligence` already concluded.

The failure this prevents is specific and easy to commit. A trace view that
"helpfully" marks `FUNNEL_DIAGNOSIS` reached because its diagnosis string is
non-empty has just become a second intelligence engine — with no tests, no
authority boundary, and a different answer from the Brain whenever the two
disagree.

So `trace.ts` contains no conditional on a metric, no threshold, and no
derivation. It maps `stage` to node id and copies `status`, `conclusion`,
`absenceReason`, `canonicalSource`, `inputSource` and `ordinal` verbatim.

A test asserts this by scanning the module (comments stripped) for
`conclusion !== null`, `conclusion &&`, `if (… conclusion`, any call to
`reconcileIntelligence`, `diagnoseFunnel`, `detectAnomaly`,
`buildEntityIntelligence` or `scoreObjectiveHealth`, and any numeric threshold.

## Absence is copied too

A `NOT_REACHED` layer keeps the Brain's own `absenceReason` — usually that
`reconcileIntelligence()` short-circuited on an upstream failure. It is never
redrawn as neutral and never dropped from the overlay, because a chain that
silently omits the layers it never reached looks complete.

Tested: the fixture has three unreached layers, and each must survive with a
non-empty reason and a `null` conclusion.

## Order comes from the Brain

The Observatory emits stages in `hierarchy.ts`'s own `LAYER_ORDER`, and this
module sorts by the ordinal it was given. It holds no opinion about what the
order should be.

A separate test asserts the graph's `INTELLIGENCE_LAYER` nodes are exactly
`LAYER_ORDER` — six layers, not a longer list invented to look thorough.

## The chain it highlights

```
Meta Truth → Data Validity → Semantics → Funnel → Anomaly
  → Evidence → Diagnosis → Decision → Recommendation → Authority → LLM Narration
```

The graph highlights the six layers the reconciler actually defines. The
remaining stages of that chain are panes in the Brain Observatory, which stays
the full-screen deep inspection surface and is reachable from the graph page,
the Intelligence workspace and the sidebar.

The graph does not reproduce the Observatory. It answers a different question —
*which parts of the system took part in this decision* — and hands off for
*what they concluded*.

## Reading the database

`trace.ts` does not. A test asserts the module never mentions `prisma`, and that
the route delegates to `buildBrainObservatory()`. Brain data reaches the graph
through exactly one canonical service.

## When there is no snapshot

`GET /api/admin/graph/trace/:campaignId` returns `NO_SNAPSHOT` with a reason when
the campaign has no measurable window — the same honest absence the production
path returns. It does not assemble a partial chain that would read as a complete
one.
