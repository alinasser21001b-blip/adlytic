// ════════════════════════════════════════════════════════════════════════
//  src/graph/adapter.ts
//
//  THE GRAPHIFY INTEGRATION BOUNDARY — and the only door into the graph.
//
//  ── The problem this solves ───────────────────────────────────────────
//
//  Graphify runs OUTSIDE this repository. We do not control its export
//  format, its version cadence, or whether the file we are handed today
//  resembles the one we were handed last month. Two failure modes follow,
//  and both are worse than having no graph at all:
//
//   1. LOCKING THE UI TO A GUESSED FORMAT. If the Admin pages read the
//      external shape directly, the first format change breaks the Control
//      Plane, and we would have invented that shape ourselves anyway —
//      committing the product to a contract its owner never agreed to.
//
//   2. RENDERING A BROKEN GRAPH. A snapshot with an edge pointing at a node
//      that is not there is not "mostly fine". It is a diagram that omits a
//      dependency, read by an operator deciding whether something is safe to
//      restart.
//
//  So: everything enters through `importGraphSnapshot`, external shapes are
//  translated by REGISTERED adapters, and the result is validated against
//  the canonical model before anything downstream sees it.
//
//  ── Fail closed, and never throw ──────────────────────────────────────
//
//  Every rejection returns a typed result naming the reason. Nothing here
//  throws, because the caller is an admin route: a malformed graph must
//  degrade the graph view, never take down the surface an operator uses to
//  find out what is wrong. That is the whole point of an operations console.
// ════════════════════════════════════════════════════════════════════════

import {
  EDGE_KINDS, GRAPH_SCHEMA_VERSION, NODE_CLASSES, PROVENANCE_METHODS,
  freezeSnapshot,
  type EdgeKind, type GraphEdge, type GraphNode, type GraphSnapshot,
  type NodeClass, type Provenance, type ProvenanceMethod,
} from './model';

/** Why a snapshot was refused. Machine-readable so the UI can explain it. */
export type GraphRejectionCode =
  | 'NOT_AN_OBJECT'
  | 'MISSING_VERSION'
  | 'MALFORMED_VERSION'
  | 'UNSUPPORTED_MAJOR_VERSION'
  | 'FUTURE_MINOR_VERSION'
  | 'MISSING_NODES'
  | 'MISSING_EDGES'
  | 'MALFORMED_NODE'
  | 'MALFORMED_EDGE'
  | 'UNKNOWN_NODE_CLASS'
  | 'UNKNOWN_EDGE_KIND'
  | 'MISSING_PROVENANCE'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_EDGE_ID'
  | 'DANGLING_EDGE'
  | 'UNRECOGNISED_FORMAT';

export type GraphParseResult =
  | { ok: true; snapshot: GraphSnapshot; adaptedBy: string | null }
  | { ok: false; code: GraphRejectionCode; reason: string };

const SUPPORTED = parseVersion(GRAPH_SCHEMA_VERSION)!;

function parseVersion(v: unknown): { major: number; minor: number; patch: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reject(code: GraphRejectionCode, reason: string): GraphParseResult {
  return { ok: false, code, reason };
}

function parseProvenance(v: unknown): Provenance | null {
  if (!isRecord(v)) return null;
  const method = v['method'];
  const source = v['source'];
  if (typeof method !== 'string' || !PROVENANCE_METHODS.includes(method as ProvenanceMethod)) return null;
  if (typeof source !== 'string' || source.trim().length === 0) return null;
  const p: Provenance = { method: method as ProvenanceMethod, source };
  if (typeof v['note'] === 'string') p.note = v['note'];
  return p;
}

/**
 * Validate a canonical snapshot.
 *
 * Order matters: version first, because a snapshot from a schema we do not
 * understand must be refused as a VERSION problem, not reported as fifty
 * malformed nodes. An operator reading "unsupported major version 2" knows
 * to update; one reading "node 37 is malformed" goes looking for a bug that
 * is not there.
 */
export function parseGraphSnapshot(raw: unknown): GraphParseResult {
  if (!isRecord(raw)) return reject('NOT_AN_OBJECT', 'snapshot is not an object');

  if (!('version' in raw)) return reject('MISSING_VERSION', 'snapshot carries no schema version');
  const v = parseVersion(raw['version']);
  if (!v) return reject('MALFORMED_VERSION', `version is not semver: ${String(raw['version'])}`);
  if (v.major !== SUPPORTED.major) {
    return reject('UNSUPPORTED_MAJOR_VERSION',
      `snapshot schema ${String(raw['version'])} is incompatible with ${GRAPH_SCHEMA_VERSION}`);
  }
  if (v.minor > SUPPORTED.minor) {
    // Newer minor: it may carry structure we would silently drop. Refusing a
    // partial read is the honest outcome — half a dependency graph is not a
    // conservative subset of a whole one, it is a different, wrong graph.
    return reject('FUTURE_MINOR_VERSION',
      `snapshot schema ${String(raw['version'])} is newer than ${GRAPH_SCHEMA_VERSION}; fields would be dropped`);
  }

  const rawNodes = raw['nodes'];
  if (!Array.isArray(rawNodes)) return reject('MISSING_NODES', 'nodes is not an array');
  const rawEdges = raw['edges'];
  if (!Array.isArray(rawEdges)) return reject('MISSING_EDGES', 'edges is not an array');

  const nodes: GraphNode[] = [];
  const seenNodes = new Set<string>();
  for (const [i, rn] of rawNodes.entries()) {
    if (!isRecord(rn)) return reject('MALFORMED_NODE', `node ${i} is not an object`);
    const id = rn['id'];
    if (typeof id !== 'string' || id.trim().length === 0) {
      return reject('MALFORMED_NODE', `node ${i} has no id`);
    }
    if (seenNodes.has(id)) return reject('DUPLICATE_NODE_ID', `node id appears twice: ${id}`);
    const nodeClass = rn['nodeClass'];
    if (typeof nodeClass !== 'string' || !NODE_CLASSES.includes(nodeClass as NodeClass)) {
      return reject('UNKNOWN_NODE_CLASS', `node ${id} has class ${String(nodeClass)}`);
    }
    for (const f of ['label', 'what', 'owner'] as const) {
      if (typeof rn[f] !== 'string' || (rn[f] as string).trim().length === 0) {
        return reject('MALFORMED_NODE', `node ${id} has no ${f}`);
      }
    }
    const provenance = parseProvenance(rn['provenance']);
    if (!provenance) return reject('MISSING_PROVENANCE', `node ${id} carries no usable provenance`);

    const node: GraphNode = {
      id, nodeClass: nodeClass as NodeClass,
      label: rn['label'] as string, what: rn['what'] as string, owner: rn['owner'] as string,
      provenance,
    };
    if (typeof rn['href'] === 'string') node.href = rn['href'];
    if (Array.isArray(rn['unknowns'])) {
      node.unknowns = rn['unknowns'].filter((u): u is string => typeof u === 'string');
    }
    seenNodes.add(id);
    nodes.push(node);
  }

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const [i, re] of rawEdges.entries()) {
    if (!isRecord(re)) return reject('MALFORMED_EDGE', `edge ${i} is not an object`);
    const id = re['id'];
    if (typeof id !== 'string' || id.trim().length === 0) {
      return reject('MALFORMED_EDGE', `edge ${i} has no id`);
    }
    if (seenEdges.has(id)) return reject('DUPLICATE_EDGE_ID', `edge id appears twice: ${id}`);
    const kind = re['kind'];
    if (typeof kind !== 'string' || !EDGE_KINDS.includes(kind as EdgeKind)) {
      return reject('UNKNOWN_EDGE_KIND', `edge ${id} has kind ${String(kind)}`);
    }
    const from = re['from'], to = re['to'];
    if (typeof from !== 'string' || typeof to !== 'string') {
      return reject('MALFORMED_EDGE', `edge ${id} has no endpoints`);
    }
    // The failure that makes a graph lie: an edge to a node that is not drawn.
    if (!seenNodes.has(from)) return reject('DANGLING_EDGE', `edge ${id} starts at unknown node ${from}`);
    if (!seenNodes.has(to)) return reject('DANGLING_EDGE', `edge ${id} ends at unknown node ${to}`);
    const provenance = parseProvenance(re['provenance']);
    if (!provenance) return reject('MISSING_PROVENANCE', `edge ${id} carries no usable provenance`);

    seenEdges.add(id);
    edges.push({ id, from, to, kind: kind as EdgeKind, provenance });
  }

  const generatedAt = typeof raw['generatedAt'] === 'string' ? raw['generatedAt'] : new Date(0).toISOString();
  const source = typeof raw['source'] === 'string' ? raw['source'] : 'unknown';
  const repositoryCommit = typeof raw['repositoryCommit'] === 'string' ? raw['repositoryCommit'] : null;
  const metadata: Record<string, string | number | boolean | null> = {};
  if (isRecord(raw['metadata'])) {
    for (const [k, val] of Object.entries(raw['metadata'])) {
      if (val === null || ['string', 'number', 'boolean'].includes(typeof val)) {
        metadata[k] = val as string | number | boolean | null;
      }
    }
  }

  return {
    ok: true,
    adaptedBy: null,
    snapshot: freezeSnapshot({
      version: `${v.major}.${v.minor}.${v.patch}`,
      generatedAt, source, repositoryCommit, nodes, edges, metadata,
    }),
  };
}

// ── The external adapter registry ───────────────────────────────────────

/**
 * A translator from one external graph export to our canonical shape.
 *
 * `detect` must be cheap and specific. A greedy detector that claims every
 * object is its own format turns the fail-closed guarantee off for everyone
 * else, so a detector should look for a marker the format actually carries.
 */
export interface ExternalGraphAdapter {
  /** Stable identifier, e.g. 'graphify/v1'. Reported to the operator. */
  id: string;
  detect(raw: unknown): boolean;
  /** Translate to the canonical shape. Validation happens afterwards. */
  adapt(raw: unknown): unknown;
}

const ADAPTERS: ExternalGraphAdapter[] = [];

export function registerExternalAdapter(a: ExternalGraphAdapter): void {
  const at = ADAPTERS.findIndex((x) => x.id === a.id);
  if (at >= 0) ADAPTERS[at] = a; else ADAPTERS.push(a);
}

/** Test seam and hot-reload helper. */
export function _clearExternalAdapters(): void { ADAPTERS.length = 0; }

export function externalAdapterIds(): string[] { return ADAPTERS.map((a) => a.id); }

/**
 * THE ONLY DOOR. Canonical snapshots pass straight through; a recognised
 * external export is translated first; anything else is refused by name.
 *
 * Note what does NOT happen here: no best-effort salvage, no "import the
 * nodes we understood". An operator who is shown 60% of a dependency graph
 * with no indication which 60% is worse off than one who is shown an error.
 */
export function importGraphSnapshot(raw: unknown): GraphParseResult {
  if (isRecord(raw) && typeof raw['version'] === 'string' && Array.isArray(raw['nodes'])) {
    return parseGraphSnapshot(raw);
  }
  for (const a of ADAPTERS) {
    let claims = false;
    try { claims = a.detect(raw); } catch { claims = false; }
    if (!claims) continue;
    let adapted: unknown;
    try {
      adapted = a.adapt(raw);
    } catch (e) {
      // A throwing third-party adapter is a rejected snapshot, not an
      // exception that reaches the admin route.
      return reject('UNRECOGNISED_FORMAT', `adapter ${a.id} failed: ${(e as Error).message}`);
    }
    const parsed = parseGraphSnapshot(adapted);
    return parsed.ok ? { ...parsed, adaptedBy: a.id } : parsed;
  }
  return reject('UNRECOGNISED_FORMAT',
    `no adapter recognised this snapshot (registered: ${ADAPTERS.map((a) => a.id).join(', ') || 'none'})`);
}
