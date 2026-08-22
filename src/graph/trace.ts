// ════════════════════════════════════════════════════════════════════════
//  src/graph/trace.ts
//
//  MODE 3 — the intelligence trace overlay. Which parts of the system
//  actually took part in one campaign's decision.
//
//  ── The line this module must not cross ───────────────────────────────
//
//  The graph does not reason. It cannot decide that a layer was reached, it
//  cannot infer a conclusion from the layer before it, and it cannot fill a
//  gap with a plausible verdict. Every value here is COPIED from a
//  `BrainObservatorySnapshot` — the canonical output of
//  `src/services/brainObservatory.ts`, which is itself a read-only view of
//  what `reconcileIntelligence` already concluded.
//
//  The failure this prevents is specific and easy to commit. A trace view
//  that "helpfully" marks FUNNEL_DIAGNOSIS reached because a diagnosis
//  string is non-empty has just become a second intelligence engine — one
//  with no tests, no authority boundary, and a different answer from the
//  Brain whenever the two disagree. So this file contains no conditional on
//  a metric, no threshold, and no derivation: it maps `stage` to node id and
//  copies the rest verbatim.
//
//  Absence is copied too. A NOT_REACHED layer keeps the Brain's own
//  `absenceReason`; it is never redrawn as neutral, and never dropped from
//  the overlay, because a chain that silently omits the layers it never
//  reached looks complete.
// ════════════════════════════════════════════════════════════════════════

import type { BrainObservatorySnapshot } from '../services/brainObservatory';
import { layerNodeId } from './architecture';
import type { GraphSnapshot, IntelligenceTraceOverlay, TraceNodeState } from './model';

/**
 * Project one Observatory snapshot onto the intelligence-layer nodes.
 *
 * `snapshot` is read only to confirm each stage has a node to land on.
 * Stages whose node is missing are reported in `unmatched` rather than
 * dropped: a layer the Brain traced but the graph cannot draw is a defect
 * in the graph, and hiding it would make the graph look complete while it
 * quietly lost a step in the chain.
 */
export function buildTraceOverlay(
  snapshot: GraphSnapshot,
  observatory: BrainObservatorySnapshot,
): IntelligenceTraceOverlay {
  const known = new Set(snapshot.nodes.map((n) => n.id));
  const stages: TraceNodeState[] = [];
  const unmatched: string[] = [];

  for (const t of observatory.trace) {
    const nodeId = layerNodeId(t.stage);
    if (!known.has(nodeId)) { unmatched.push(nodeId); continue; }
    stages.push({
      nodeId,
      // Copied. Not recomputed from `conclusion !== null`, which would make
      // this module the authority on whether a layer ran.
      state: t.status,
      ordinal: t.ordinal,
      conclusion: t.conclusion,
      absenceReason: t.absenceReason,
      canonicalSource: t.canonicalSource,
      inputSource: t.inputSource,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    campaignId: observatory.campaign.id,
    campaignName: observatory.campaign.name,
    // The Observatory already emits the stages in hierarchy.ts's LAYER_ORDER.
    // Sorting by the ordinal it supplied preserves that order without this
    // module holding an opinion about what the order should be.
    stages: stages.sort((a, b) => a.ordinal - b.ordinal),
    unmatched,
  };
}

/** Node ids that took part in the decision — the highlight set. */
export function reachedNodeIds(overlay: IntelligenceTraceOverlay): string[] {
  return overlay.stages.filter((s) => s.state === 'REACHED').map((s) => s.nodeId);
}

export function traceIndex(overlay: IntelligenceTraceOverlay): Record<string, TraceNodeState> {
  const out: Record<string, TraceNodeState> = {};
  for (const s of overlay.stages) out[s.nodeId] = s;
  return out;
}
