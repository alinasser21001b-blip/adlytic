// ════════════════════════════════════════════════════════════════════════
//  src/graph/runtime.ts
//
//  MODE 2 — the runtime overlay. Current operational state, drawn on the
//  SAME graph the architecture builder produced.
//
//  ── The invariant ─────────────────────────────────────────────────────
//
//  An overlay is a map from node id to observed state. It is not a graph.
//  It cannot add a node, remove one, or re-point an edge, because it has
//  nowhere to put one — and the snapshot it is handed is frozen, so an
//  attempt to write through it throws instead of corrupting the map.
//
//  That is not defensive style. It is the difference between "Postgres is
//  down" and "Postgres is no longer what DailyStat persists to". The first
//  is an incident; the second is a graph that lies for as long as the
//  incident lasts, and keeps lying if the overlay forgets to undo itself.
//
//  ── It observes nothing of its own ────────────────────────────────────
//
//  Every state here is copied from `adminOpsHealth.ts`, which is already the
//  canonical answer to "is this subsystem up". This module does not probe
//  Redis, does not time a query, and does not decide what counts as healthy.
//  A second opinion on subsystem health is a second source of truth, and the
//  console would then have two greens that could disagree.
// ════════════════════════════════════════════════════════════════════════

import type { AdminOpsSnapshot, OpsStatus, SubsystemHealth } from '../services/adminOpsHealth';
import { deployNodeId, modelNodeId, moduleNodeId, layerNodeId } from './architecture';
import type { GraphSnapshot, Provenance, RuntimeNodeState, RuntimeOverlay, RuntimeState } from './model';

/**
 * Ops vocabulary → graph vocabulary.
 *
 * Two conflations are forbidden and neither happens here:
 *   · UNKNOWN and NOT_TESTED never become HEALTHY. "Nothing objected" is
 *     not "we checked and it is fine".
 *   · Nothing becomes NOT_CONFIGURED by guesswork — see the note below.
 *
 * RUNNING collapses into HEALTHY because the graph has no third colour for
 * "busy and fine", and the original word survives verbatim in `detail`, so
 * nothing is actually lost — only the shape it is drawn in.
 *
 * WARNING → DEGRADED and BLOCKED → FAILED are the two lossy steps. Both
 * preserve the operator's decision (look now vs. look eventually); both are
 * recorded in `detail` so a reader can recover the original.
 */
const STATE_OF: Record<OpsStatus, RuntimeState> = {
  HEALTHY: 'HEALTHY',
  RUNNING: 'HEALTHY',
  UNKNOWN: 'UNKNOWN',
  NOT_TESTED: 'NOT_TESTED',
  DEGRADED: 'DEGRADED',
  WARNING: 'DEGRADED',
  BLOCKED: 'FAILED',
  ERROR: 'FAILED',
};

/**
 * Which graph node each observed subsystem describes.
 *
 * One subsystem, one node. The temptation is to fan `queue` out across the
 * four QUEUE nodes so the picture looks more alive, but `adminOpsHealth`
 * observes whether the queue SYSTEM accepts jobs — it never inspects an
 * individual queue. Four green queues from one observation would be three
 * claims nobody made. The queue nodes keep that gap in their `unknowns`.
 */
const SUBSYSTEM_NODE: Record<SubsystemHealth['key'], string> = {
  database: deployNodeId('postgres'),
  redis: deployNodeId('redis'),
  queue: moduleNodeId('src/lib/queue.ts'),
  workers: deployNodeId('worker'),
  meta: moduleNodeId('src/services/metaClient.ts'),
  intelligence: moduleNodeId('src/analytics/intelligence/hierarchy.ts'),
};

const OBSERVED = (note: string): Provenance => ({
  method: 'RUNTIME_OBSERVATION',
  source: 'src/services/adminOpsHealth.ts :: getAdminOpsSnapshot',
  note,
});

/**
 * Project an ops snapshot onto graph nodes.
 *
 * `snapshot` is read to check that a state has somewhere to land, and is
 * never written to. The check matters: a node id that stops existing after
 * a refactor would otherwise produce an overlay entry nothing renders, and
 * the subsystem would silently vanish from the map rather than showing as
 * a problem. Those ids land in `unmatched` instead.
 */
export function buildRuntimeOverlay(
  snapshot: GraphSnapshot,
  ops: AdminOpsSnapshot,
): RuntimeOverlay {
  const known = new Set(snapshot.nodes.map((n) => n.id));
  const states: RuntimeNodeState[] = [];
  const unmatched: string[] = [];

  const place = (nodeId: string, s: RuntimeNodeState): void => {
    if (known.has(nodeId)) states.push(s); else unmatched.push(nodeId);
  };

  for (const sub of ops.subsystems) {
    const nodeId = SUBSYSTEM_NODE[sub.key];
    place(nodeId, {
      nodeId,
      state: STATE_OF[sub.status],
      summary: sub.summary,
      // The original ops word travels with the state so the lossy steps
      // above stay recoverable by anyone reading the inspector.
      detail: sub.detail ? `${sub.detail} · ops=${sub.status}` : `ops=${sub.status}`,
      provenance: OBSERVED(`subsystems[${sub.key}]`),
    });
  }

  // The API process is answering — that is what serving this response means.
  // Stated as its own observation rather than borrowed from a subsystem,
  // because "the console rendered" is genuinely the evidence for it.
  if (known.has(deployNodeId('api'))) {
    states.push({
      nodeId: deployNodeId('api'),
      state: 'HEALTHY',
      summary: 'يستجيب — هذه اللقطة نفسها دليل ذلك',
      detail: `build=${ops.build.commit ?? 'unresolved'}`,
      provenance: OBSERVED('the request that produced this snapshot was served'),
    });
  } else {
    unmatched.push(deployNodeId('api'));
  }

  // The tenant node carries the aggregate, never a per-customer verdict.
  const wsNode = modelNodeId('Workspace');
  if (known.has(wsNode)) {
    const rows = ops.workspaces;
    const undetermined = rows.filter((w) => w.overall === 'UNKNOWN' || w.overall === 'NOT_TESTED').length;
    const bad = rows.filter((w) => w.overall === 'ERROR' || w.overall === 'BLOCKED').length;
    const warn = rows.filter((w) => w.overall === 'WARNING' || w.overall === 'DEGRADED').length;
    // Order matters and is the point: any determined failure outranks a
    // warning, and "we could not tell for all of them" is never healthy.
    const state: RuntimeState =
      rows.length === 0 ? 'NOT_TESTED'
        : bad > 0 ? 'FAILED'
          : warn > 0 ? 'DEGRADED'
            : undetermined === rows.length ? 'UNKNOWN'
              : 'HEALTHY';
    states.push({
      nodeId: wsNode,
      state,
      summary: rows.length === 0
        ? 'لا مساحة عمل مرتبطة بحساب إعلاني'
        : `${rows.length} مساحة · ${bad} متعثّرة · ${warn} تحتاج نظراً · ${undetermined} غير محدّدة`,
      detail: `workspaces=${rows.length}`,
      provenance: OBSERVED('workspaces[] aggregate'),
    });
  } else {
    unmatched.push(wsNode);
  }

  // Intelligence layers are NOT given a runtime state here. `adminOpsHealth`
  // reports the intelligence subsystem as NOT_TESTED and says why: narration
  // coverage is measured elsewhere and no live check exists. Painting six
  // layers from an admittedly untested subsystem would manufacture exactly
  // the certainty that module refuses to manufacture.
  void layerNodeId;

  return { generatedAt: ops.computedAt, states, unmatched };
}

/**
 * Index an overlay for rendering. Returns a plain lookup — deliberately not
 * a merged snapshot, so there is no object in the system that is half
 * architecture and half weather.
 */
export function runtimeIndex(overlay: RuntimeOverlay): Record<string, RuntimeNodeState> {
  const out: Record<string, RuntimeNodeState> = {};
  for (const s of overlay.states) out[s.nodeId] = s;
  return out;
}
