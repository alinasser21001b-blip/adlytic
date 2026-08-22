// ════════════════════════════════════════════════════════════════════════
//  src/graph/model.ts
//
//  THE SYSTEM GRAPH MODEL — one vocabulary for "what exists and how it is
//  connected", shared by the builder, the adapter, the overlays and the UI.
//
//  ── The rule that shapes every type here ──────────────────────────────
//
//  A node or an edge is a CLAIM about this system. Claims without a source
//  are rumours, and a rumour rendered as a diagram is worse than no diagram:
//  it is confidently wrong, and it looks authoritative. So `provenance` is
//  required on every node and every edge, with no default. There is no way
//  to add a fact to this graph without saying where it came from.
//
//  ── What this model deliberately cannot express ───────────────────────
//
//  · No health field on GraphNode. Runtime state arrives as a SEPARATE
//    overlay keyed by node id (see runtime.ts). If a node could carry its
//    own status, an overlay would mutate architecture truth to show it, and
//    "what depends on what" would start changing every time Redis blinked.
//  · No conclusion field either. The intelligence trace is likewise an
//    overlay (see trace.ts). The graph shows WHICH layers participated; the
//    Brain owns WHAT they concluded.
//  · No mutation verbs anywhere. Nothing in this module, or anything that
//    consumes it, can write to Meta, trigger a sync, or store a decision.
//    The graph observes.
// ════════════════════════════════════════════════════════════════════════

/**
 * Schema version of the canonical snapshot shape.
 *
 * Semver. The adapter accepts a snapshot whose MAJOR matches and whose
 * MINOR is not ahead of ours — a newer minor may carry fields we would
 * silently drop, and silently dropping half a graph is exactly the failure
 * mode this version check exists to prevent.
 */
export const GRAPH_SCHEMA_VERSION = '1.0.0';

/** Node classes. Only concepts this repository actually contains. */
export const NODE_CLASSES = [
  'PAGE',
  'API_ROUTE',
  'SERVICE',
  'ENGINE',
  'INTELLIGENCE_LAYER',
  'DB_MODEL',
  'QUEUE',
  'META_CAPABILITY',
  'META_ENTITY',
  'WORKSPACE',
  'DEPLOYMENT_SERVICE',
  'PERSISTENCE_OWNER',
] as const;
export type NodeClass = (typeof NODE_CLASSES)[number];

/** Relationship kinds. An edge kind exists only where a real fact needs it. */
export const EDGE_KINDS = [
  'CALLS',
  'READS',
  'WRITES',
  'PRODUCES',
  'CONSUMES',
  'GUARDED_BY',
  'DEPENDS_ON',
  'PERSISTS_TO',
  'RENDERS',
  'DEPLOYED_AS',
  'AUTHORIZED_BY',
  'OWNED_BY',
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/**
 * How a fact in this graph is known.
 *
 * The distinction that matters is REGISTRY_ENTRY vs REPOSITORY_DECLARATION:
 * the first means a human curated the row (and could be stale), the second
 * means the fact is a literal in the source tree. A reader who cannot tell
 * those apart cannot judge how much to trust the picture.
 */
export const PROVENANCE_METHODS = [
  /** A literal in the source tree — a route string, an exported const. */
  'REPOSITORY_DECLARATION',
  /** A curated registry row, itself read out of the source tree. */
  'REGISTRY_ENTRY',
  /** Observed at runtime by a canonical service. Overlays only. */
  'RUNTIME_OBSERVATION',
  /** Produced by a canonical service snapshot (e.g. the Brain Observatory). */
  'CANONICAL_SNAPSHOT',
  /** Imported from an external graph tool through the adapter boundary. */
  'EXTERNAL_SNAPSHOT',
] as const;
export type ProvenanceMethod = (typeof PROVENANCE_METHODS)[number];

export interface Provenance {
  method: ProvenanceMethod;
  /** The exact file, route or module the fact was read from. Never vague. */
  source: string;
  /** Optional qualifier — which export, which line, which run. */
  note?: string;
}

export interface GraphNode {
  id: string;
  nodeClass: NodeClass;
  /** Operator-facing name. */
  label: string;
  /** WHAT IS THIS? — one human sentence, no jargon-only answers. */
  what: string;
  /** CANONICAL OWNER — the exact service, module or model. */
  owner: string;
  provenance: Provenance;
  /** Where an operator goes to act on it, when a canonical surface exists. */
  href?: string;
  /**
   * WHAT WE DO NOT KNOW about this node.
   *
   * Present in the model rather than left to the UI, because a blind spot
   * that lives only in a rendering decision gets dropped by the next
   * rendering decision. Unknowns are data.
   */
  unknowns?: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  provenance: Provenance;
}

/**
 * The versioned snapshot contract.
 *
 * This is the shape the Control Plane accepts — from its own builder or,
 * through the adapter, from an external graph tool. Field names are
 * deliberately the plain ones a foreign exporter would guess.
 */
export interface GraphSnapshot {
  version: string;
  generatedAt: string;
  /** Who produced it: 'adlytic-internal' or an external tool identifier. */
  source: string;
  /** The commit the facts describe. null when it cannot be resolved. */
  repositoryCommit: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: Record<string, string | number | boolean | null>;
}

// ── Overlays ────────────────────────────────────────────────────────────
//
// Both overlays are keyed by node id and carry no structure of their own.
// That is the mechanism, not a convention: an overlay CANNOT add a node,
// remove one, or re-point an edge, because it has nowhere to put one.

/**
 * Runtime states.
 *
 * NOT_CONFIGURED is separate from FAILED and UNKNOWN on purpose. A queue
 * that was never enabled is not broken and is not unknown — we know exactly
 * what it is doing, which is nothing, by configuration. Collapsing the three
 * is how an operator learns to ignore the colour.
 */
export const RUNTIME_STATES = [
  'HEALTHY', 'DEGRADED', 'FAILED', 'UNKNOWN', 'NOT_TESTED', 'NOT_CONFIGURED',
] as const;
export type RuntimeState = (typeof RUNTIME_STATES)[number];

export interface RuntimeNodeState {
  nodeId: string;
  state: RuntimeState;
  /** One short clause an operator reads without expanding. */
  summary: string;
  /** Optional LTR technical line. Never a secret. */
  detail?: string;
  provenance: Provenance;
}

export interface RuntimeOverlay {
  generatedAt: string;
  states: RuntimeNodeState[];
  /**
   * Node ids the runtime source mentioned that this graph does not contain.
   * Surfaced rather than dropped: a silent mismatch between the map and the
   * territory is how a graph goes quietly out of date.
   */
  unmatched: string[];
}

/** A layer either participated in a decision or it did not. No middle. */
export type TraceState = 'REACHED' | 'NOT_REACHED';

export interface TraceNodeState {
  nodeId: string;
  state: TraceState;
  /** Position in hierarchy.ts's own LAYER_ORDER. Copied, never re-ranked. */
  ordinal: number;
  /** The canonical conclusion, verbatim. null when NOT_REACHED. */
  conclusion: string | null;
  /** Why it is absent — stated by the Brain, never guessed here. */
  absenceReason: string | null;
  /** Who owned this verdict, per the Observatory. */
  canonicalSource: string;
  /** What that owner consumed, per the Observatory. */
  inputSource: string;
}

export interface IntelligenceTraceOverlay {
  generatedAt: string;
  campaignId: string;
  campaignName: string;
  stages: TraceNodeState[];
  unmatched: string[];
}

// ── Read helpers. Pure, no IO ───────────────────────────────────────────

export function nodeById(s: GraphSnapshot, id: string): GraphNode | undefined {
  return s.nodes.find((n) => n.id === id);
}

/** Edges pointing AT a node — "what depends on it". */
export function incomingEdges(s: GraphSnapshot, id: string): GraphEdge[] {
  return s.edges.filter((e) => e.to === id);
}

/** Edges leaving a node — "what it depends on". */
export function outgoingEdges(s: GraphSnapshot, id: string): GraphEdge[] {
  return s.edges.filter((e) => e.from === id);
}

/** What a node reads: the READS/CONSUMES targets. */
export function readsOf(s: GraphSnapshot, id: string): GraphEdge[] {
  return outgoingEdges(s, id).filter((e) => e.kind === 'READS' || e.kind === 'CONSUMES');
}

/** What a node writes: the WRITES/PERSISTS_TO/PRODUCES targets. */
export function writesOf(s: GraphSnapshot, id: string): GraphEdge[] {
  return outgoingEdges(s, id)
    .filter((e) => e.kind === 'WRITES' || e.kind === 'PERSISTS_TO' || e.kind === 'PRODUCES');
}

/**
 * Deep-freeze a snapshot so architecture truth cannot be edited in place.
 *
 * The overlays are the reason this exists. Both are handed the snapshot to
 * key against, and the cheapest possible bug — `node.state = ...` inside an
 * overlay loop — would turn a read-only map into a mutable one and make
 * ownership depend on whether Redis was up. Freezing makes that a thrown
 * TypeError in strict mode instead of a silent corruption.
 */
export function freezeSnapshot(s: GraphSnapshot): GraphSnapshot {
  for (const n of s.nodes) {
    if (n.unknowns) Object.freeze(n.unknowns);
    Object.freeze(n.provenance);
    Object.freeze(n);
  }
  for (const e of s.edges) {
    Object.freeze(e.provenance);
    Object.freeze(e);
  }
  Object.freeze(s.nodes);
  Object.freeze(s.edges);
  Object.freeze(s.metadata);
  return Object.freeze(s);
}
