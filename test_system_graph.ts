/**
 * The system graph — fails closed, stays read-only, and never becomes a
 * second intelligence engine.
 *
 * The graph is the one surface an operator trusts when deciding whether
 * something is safe to touch. That makes three failure modes unacceptable,
 * and each has its own section here:
 *
 *  1. A GRAPH THAT LIES. An edge to a node that is not drawn omits a
 *     dependency. A snapshot from a schema we do not understand, partially
 *     read, is not a conservative subset — it is a different, wrong graph.
 *     Both must be REFUSED, not salvaged.
 *
 *  2. A GRAPH THAT WRITES. Observation that can mutate is not observation.
 *     There is no POST under /api/admin/graph, and the overlays cannot alter
 *     the architecture they are painted onto — that one is enforced by
 *     freezing, so a bug throws instead of silently re-pointing an edge.
 *
 *  3. A GRAPH THAT REASONS. The trace overlay copies the Brain's verdicts. If
 *     it ever decided a layer was reached, it would be a second intelligence
 *     engine with no authority boundary and a different answer whenever the
 *     two disagreed.
 *
 * The load-bearing guards are negative-tested: a planted defect must fail.
 *
 * Run: npx tsx test_system_graph.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GRAPH_SCHEMA_VERSION, NODE_CLASSES, EDGE_KINDS, RUNTIME_STATES, freezeSnapshot,
  type GraphSnapshot,
} from './src/graph/model';
import {
  _clearExternalAdapters, externalAdapterIds, importGraphSnapshot,
  parseGraphSnapshot, registerExternalAdapter,
} from './src/graph/adapter';
import { buildArchitectureGraph, layerNodeId, deployNodeId, modelNodeId, moduleNodeId } from './src/graph/architecture';
import { buildRuntimeOverlay, runtimeIndex } from './src/graph/runtime';
import { buildTraceOverlay, reachedNodeIds } from './src/graph/trace';
import { LAYER_ORDER } from './src/analytics/intelligence/hierarchy';
import type { AdminOpsSnapshot } from './src/services/adminOpsHealth';
import type { BrainObservatorySnapshot } from './src/services/brainObservatory';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

/** Source with comments removed, for guards that must judge code, not prose. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const graph = buildArchitectureGraph();
const plain = (): any => JSON.parse(JSON.stringify(graph));

/** A minimal valid snapshot, so each rejection test breaks exactly one thing. */
function minimal(): any {
  return {
    version: GRAPH_SCHEMA_VERSION,
    generatedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
    repositoryCommit: null,
    nodes: [{
      id: 'n1', nodeClass: 'SERVICE', label: 'n1', what: 'a node', owner: 'test',
      provenance: { method: 'REPOSITORY_DECLARATION', source: 'test.ts' },
    }, {
      id: 'n2', nodeClass: 'DB_MODEL', label: 'n2', what: 'another', owner: 'test',
      provenance: { method: 'REPOSITORY_DECLARATION', source: 'test.ts' },
    }],
    edges: [{
      id: 'e1', from: 'n1', to: 'n2', kind: 'READS',
      provenance: { method: 'REPOSITORY_DECLARATION', source: 'test.ts' },
    }],
    metadata: {},
  };
}

function rejects(mutate: (s: any) => any, code: string, why: string) {
  const s = mutate(minimal());
  const r = parseGraphSnapshot(s);
  assert.equal(r.ok, false, `expected refusal (${code}): ${why}`);
  assert.equal((r as any).code, code, `expected ${code}, got ${(r as any).code}: ${why}`);
}

function run() {
  console.log('\n── 1. The adapter fails closed ──');

  check('a valid snapshot is accepted', () => {
    const r = parseGraphSnapshot(minimal());
    assert.equal(r.ok, true, (r as any).reason);
  });

  check('an unsupported MAJOR version is refused as a version problem', () => {
    // Reported as a version fault, not fifty malformed nodes: an operator
    // reading "incompatible schema" knows to update; one reading "node 37 is
    // malformed" goes hunting a bug that is not there.
    rejects((s) => { s.version = '2.0.0'; return s; }, 'UNSUPPORTED_MAJOR_VERSION', 'newer major');
    rejects((s) => { s.version = '0.9.0'; return s; }, 'UNSUPPORTED_MAJOR_VERSION', 'older major');
  });

  check('a newer MINOR version is refused rather than partially read', () => {
    rejects((s) => { s.version = '1.99.0'; return s; }, 'FUTURE_MINOR_VERSION', 'fields would be dropped');
  });

  check('a missing or malformed version is refused', () => {
    rejects((s) => { delete s.version; return s; }, 'MISSING_VERSION', 'no version at all');
    rejects((s) => { s.version = 'v1'; return s; }, 'MALFORMED_VERSION', 'not semver');
    rejects((s) => { s.version = 1; return s; }, 'MALFORMED_VERSION', 'not a string');
  });

  check('malformed input never crashes the parser', () => {
    for (const bad of [null, undefined, 42, 'a string', [], true, NaN]) {
      const r = parseGraphSnapshot(bad);
      assert.equal(r.ok, false, `${String(bad)} must be refused, not accepted`);
      assert.ok((r as any).reason.length > 0, 'a refusal must say why');
    }
  });

  check('an edge to a node that is not drawn is refused', () => {
    // The failure that makes a graph lie: a dependency the picture omits.
    rejects((s) => { s.edges[0].to = 'ghost'; return s; }, 'DANGLING_EDGE', 'unknown target');
    rejects((s) => { s.edges[0].from = 'ghost'; return s; }, 'DANGLING_EDGE', 'unknown source');
  });

  check('unknown node classes and edge kinds are refused', () => {
    rejects((s) => { s.nodes[0].nodeClass = 'WORMHOLE'; return s; }, 'UNKNOWN_NODE_CLASS', 'invented class');
    rejects((s) => { s.edges[0].kind = 'VIBES_WITH'; return s; }, 'UNKNOWN_EDGE_KIND', 'invented kind');
  });

  check('a fact without provenance is refused', () => {
    // Claims without a source are rumours, and a rumour rendered as a diagram
    // is worse than no diagram: it looks authoritative.
    rejects((s) => { delete s.nodes[0].provenance; return s; }, 'MISSING_PROVENANCE', 'node');
    rejects((s) => { delete s.edges[0].provenance; return s; }, 'MISSING_PROVENANCE', 'edge');
    rejects((s) => { s.nodes[0].provenance = { method: 'VIBES', source: 'x' }; return s; },
      'MISSING_PROVENANCE', 'unknown method');
    rejects((s) => { s.nodes[0].provenance = { method: 'REGISTRY_ENTRY', source: '  ' }; return s; },
      'MISSING_PROVENANCE', 'empty source');
  });

  check('duplicate ids and structural gaps are refused', () => {
    rejects((s) => { s.nodes.push({ ...s.nodes[0] }); return s; }, 'DUPLICATE_NODE_ID', 'same node twice');
    rejects((s) => { s.edges.push({ ...s.edges[0] }); return s; }, 'DUPLICATE_EDGE_ID', 'same edge twice');
    rejects((s) => { delete s.nodes; return s; }, 'MISSING_NODES', 'no nodes array');
    rejects((s) => { delete s.edges; return s; }, 'MISSING_EDGES', 'no edges array');
    rejects((s) => { delete s.nodes[0].what; return s; }, 'MALFORMED_NODE', 'a node with no explanation');
    rejects((s) => { delete s.nodes[0].owner; return s; }, 'MALFORMED_NODE', 'a node with no owner');
  });

  console.log('\n── 2. Graphify is an adapter boundary, not a hard-coded format ──');

  check('an unrecognised external format is refused by name', () => {
    _clearExternalAdapters();
    const r = importGraphSnapshot({ someForeignShape: true, things: [] });
    assert.equal(r.ok, false);
    assert.equal((r as any).code, 'UNRECOGNISED_FORMAT');
  });

  check('a registered adapter maps a foreign export without the UI changing', () => {
    _clearExternalAdapters();
    registerExternalAdapter({
      id: 'graphify/test-v1',
      detect: (raw: any) => !!raw && raw.tool === 'graphify' && raw.schema === 'test-v1',
      adapt: (raw: any) => ({
        version: GRAPH_SCHEMA_VERSION,
        generatedAt: raw.at, source: 'graphify:test-v1', repositoryCommit: raw.sha,
        nodes: raw.vertices.map((v: any) => ({
          id: v.key, nodeClass: 'SERVICE', label: v.title, what: v.desc, owner: v.module,
          provenance: { method: 'EXTERNAL_SNAPSHOT', source: 'graphify', note: 'test-v1' },
        })),
        edges: raw.links.map((l: any, i: number) => ({
          id: 'e' + i, from: l.a, to: l.b, kind: 'DEPENDS_ON',
          provenance: { method: 'EXTERNAL_SNAPSHOT', source: 'graphify' },
        })),
        metadata: {},
      }),
    });
    assert.deepEqual(externalAdapterIds(), ['graphify/test-v1']);
    const r = importGraphSnapshot({
      tool: 'graphify', schema: 'test-v1', at: '2026-01-01T00:00:00.000Z', sha: 'abc123',
      vertices: [{ key: 'a', title: 'A', desc: 'the a', module: 'src/a.ts' },
                 { key: 'b', title: 'B', desc: 'the b', module: 'src/b.ts' }],
      links: [{ a: 'a', b: 'b' }],
    });
    assert.equal(r.ok, true, (r as any).reason);
    assert.equal((r as any).adaptedBy, 'graphify/test-v1');
    assert.equal((r as any).snapshot.nodes.length, 2);
    assert.equal((r as any).snapshot.source, 'graphify:test-v1');
  });

  check('an adapter cannot smuggle an invalid graph past validation', () => {
    // Translation happens first, validation always happens after. An adapter
    // is a shape converter, never a trust boundary of its own.
    _clearExternalAdapters();
    registerExternalAdapter({
      id: 'bad/v1',
      detect: (raw: any) => !!raw && raw.tool === 'bad',
      adapt: () => ({
        version: GRAPH_SCHEMA_VERSION, generatedAt: 'x', source: 'bad', repositoryCommit: null,
        nodes: [], edges: [{ id: 'e', from: 'nope', to: 'nope', kind: 'CALLS',
          provenance: { method: 'EXTERNAL_SNAPSHOT', source: 'bad' } }],
        metadata: {},
      }),
    });
    const r = importGraphSnapshot({ tool: 'bad' });
    assert.equal(r.ok, false);
    assert.equal((r as any).code, 'DANGLING_EDGE');
  });

  check('a throwing adapter is a refusal, not an exception in the admin route', () => {
    _clearExternalAdapters();
    registerExternalAdapter({
      id: 'throws/v1',
      detect: (raw: any) => !!raw && raw.tool === 'throws',
      adapt: () => { throw new Error('boom'); },
    });
    const r = importGraphSnapshot({ tool: 'throws' });
    assert.equal(r.ok, false);
    assert.equal((r as any).code, 'UNRECOGNISED_FORMAT');
    assert.ok((r as any).reason.includes('boom'));
    _clearExternalAdapters();
  });

  check('the Control Plane holds no hard-coded Graphify format', () => {
    // The word may appear in prose; a parser keyed to a guessed export shape
    // may not. If Graphify changes, an adapter changes — not the Admin UI.
    for (const f of ['src/graph/architecture.ts', 'src/graph/runtime.ts', 'src/graph/trace.ts',
                     'src/web/pages/systemGraphView.ts']) {
      assert.ok(!/graphify/i.test(src(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
        `${f} references a Graphify format outside the adapter`);
    }
  });

  console.log('\n── 3. The builder reuses; it does not duplicate ──');

  check('the builder accepts its own output', () => {
    const r = parseGraphSnapshot(plain());
    assert.equal(r.ok, true, `the builder produced a graph its own adapter refuses: ${(r as any).reason}`);
  });

  check('there is exactly one architecture graph builder', () => {
    // A second builder is a second answer to "what depends on spend", and the
    // losing answer would still be rendered somewhere.
    const files = ['src/graph/architecture.ts', 'src/graph/runtime.ts', 'src/graph/trace.ts',
                   'src/graph/model.ts', 'src/graph/adapter.ts'];
    const builders = files.filter((f) => /export function build[A-Za-z]*Graph\b/.test(src(f)));
    assert.deepEqual(builders, ['src/graph/architecture.ts'],
      `more than one graph builder exists: ${builders.join(', ')}`);
    for (const forbidden of ['GraphEngine2', 'SystemGraphV2', 'GraphBuilderV2']) {
      for (const f of files) {
        assert.ok(!src(f).includes(forbidden), `${f} introduces ${forbidden} — duplicate authority`);
      }
    }
  });

  check('the builder reads the registries that already own dependencies', () => {
    const s = src('src/graph/architecture.ts');
    for (const [reg, why] of [
      ['metaDependencyGraph', 'the Meta dependency registry already exists and is drift-tested'],
      ['hierarchy', 'LAYER_ORDER already owns the reasoning chain'],
      ['adminCapabilities', 'the capability registry already owns the operator surfaces'],
      ['QUEUE_NAMES', 'queue names are already declared once'],
    ] as const) {
      assert.ok(s.includes(reg), `the builder must reuse ${reg}: ${why}`);
    }
  });

  check('every node and edge carries provenance', () => {
    for (const n of graph.nodes) {
      assert.ok(n.provenance && n.provenance.source.trim().length > 0,
        `node ${n.id} has no provenance`);
      assert.ok(n.what.trim().length > 0 && n.owner.trim().length > 0,
        `node ${n.id} must say what it is and who owns it`);
    }
    for (const e of graph.edges) {
      assert.ok(e.provenance && e.provenance.source.trim().length > 0,
        `edge ${e.id} has no provenance`);
    }
  });

  check('the intelligence layers are hierarchy.ts own layers, not a longer list', () => {
    const layers = graph.nodes.filter((n) => n.nodeClass === 'INTELLIGENCE_LAYER').map((n) => n.id).sort();
    assert.deepEqual(layers, LAYER_ORDER.map(layerNodeId).sort(),
      'the graph invented reasoning layers the reconciler does not have');
  });

  check('node classes and edge kinds stay inside the declared vocabulary', () => {
    for (const n of graph.nodes) {
      assert.ok((NODE_CLASSES as readonly string[]).includes(n.nodeClass), `${n.id}: ${n.nodeClass}`);
    }
    for (const e of graph.edges) {
      assert.ok((EDGE_KINDS as readonly string[]).includes(e.kind), `${e.id}: ${e.kind}`);
    }
  });

  console.log('\n── 4. The runtime overlay cannot change the architecture ──');

  const ops: AdminOpsSnapshot = {
    computedAt: '2026-01-01T00:00:00.000Z',
    overall: 'HEALTHY', known: ['database'], unknown: ['workers'],
    subsystems: [
      { key: 'database', status: 'HEALTHY', summary: 'يستجيب' },
      { key: 'redis', status: 'NOT_TESTED', summary: 'غير مضبوط' },
      { key: 'queue', status: 'ERROR', summary: 'لا يقبل المهام' },
      { key: 'workers', status: 'UNKNOWN', summary: 'لا مزامنة حديثة', detail: 'role=api' },
      { key: 'meta', status: 'WARNING', summary: 'حساب محجوب' },
      { key: 'intelligence', status: 'NOT_TESTED', summary: 'لا فحص حي' },
    ],
    attention: [], workspaces: [], activity: [], boundary: [],
    build: { commit: 'deadbeefcafe', environment: 'test', source: 'test' } as never,
  };

  check('the overlay maps every ops status without inventing one', () => {
    const overlay = buildRuntimeOverlay(graph, ops);
    for (const s of overlay.states) {
      assert.ok((RUNTIME_STATES as readonly string[]).includes(s.state), `${s.nodeId}: ${s.state}`);
    }
    const idx = runtimeIndex(overlay);
    assert.equal(idx[deployNodeId('postgres')]!.state, 'HEALTHY');
    assert.equal(idx[deployNodeId('worker')]!.state, 'UNKNOWN');
    assert.equal(idx[moduleNodeId('src/lib/queue.ts')]!.state, 'FAILED');
  });

  check('UNKNOWN and NOT_TESTED never become HEALTHY', () => {
    const idx = runtimeIndex(buildRuntimeOverlay(graph, ops));
    assert.notEqual(idx[deployNodeId('worker')]!.state, 'HEALTHY',
      'we could not tell must never read as we checked and it is fine');
    assert.equal(idx[deployNodeId('redis')]!.state, 'NOT_TESTED');
    assert.notEqual(idx[deployNodeId('redis')]!.state, 'FAILED',
      'unconfigured must never read as broken');
  });

  check('the lossy ops mappings stay recoverable', () => {
    // WARNING → DEGRADED and BLOCKED → FAILED lose a distinction the ops
    // vocabulary draws. The original word travels in `detail` so a reader can
    // get it back rather than the console quietly deciding for them.
    const idx = runtimeIndex(buildRuntimeOverlay(graph, ops));
    assert.ok(idx[moduleNodeId('src/services/metaClient.ts')]!.detail!.includes('ops=WARNING'));
  });

  check('an overlay cannot mutate the architecture it is painted onto', () => {
    // Enforced by freezing. The assertion is that the write DOES NOT LAND —
    // not that it throws: whether a rejected assignment throws depends on the
    // caller's strict mode, and the invariant must hold either way. Ownership
    // must not become editable just because a module was compiled sloppy.
    const frozen = buildArchitectureGraph();
    assert.ok(Object.isFrozen(frozen), 'the snapshot itself must be frozen');
    assert.ok(Object.isFrozen(frozen.nodes), 'the node list must be frozen');
    assert.ok(Object.isFrozen(frozen.edges), 'the edge list must be frozen');
    assert.ok(Object.isFrozen(frozen.nodes[0]), 'each node must be frozen');

    const owner = frozen.nodes[0]!.owner;
    const target = frozen.edges[0]!.to;
    const nodeCount = frozen.nodes.length;
    try { (frozen.nodes[0] as any).owner = 'someone else'; } catch { /* strict mode */ }
    try { (frozen.edges[0] as any).to = 'elsewhere'; } catch { /* strict mode */ }
    try { (frozen.nodes as any).push({ id: 'planted' }); } catch { /* strict mode */ }
    assert.equal(frozen.nodes[0]!.owner, owner, 'a node owner was rewritten in place');
    assert.equal(frozen.edges[0]!.to, target, 'an edge was re-pointed in place');
    assert.equal(frozen.nodes.length, nodeCount, 'a node was added to a frozen graph');
  });

  check('the overlay adds no node and re-points no edge', () => {
    const before = JSON.stringify({ n: graph.nodes.map((n) => n.id), e: graph.edges.map((e) => `${e.from}>${e.to}`) });
    const overlay = buildRuntimeOverlay(graph, ops);
    const after = JSON.stringify({ n: graph.nodes.map((n) => n.id), e: graph.edges.map((e) => `${e.from}>${e.to}`) });
    assert.equal(before, after, 'the graph changed while an overlay was built');
    // The overlay has nowhere to put a node: its only shape is nodeId → state.
    for (const s of overlay.states) {
      assert.deepEqual(Object.keys(s).sort(),
        ['detail', 'nodeId', 'provenance', 'state', 'summary'].filter((k) => k in s).sort());
    }
  });

  check('a runtime state with no node is surfaced, not dropped', () => {
    const tiny: GraphSnapshot = freezeSnapshot({
      version: GRAPH_SCHEMA_VERSION, generatedAt: 'x', source: 'test', repositoryCommit: null,
      nodes: [], edges: [], metadata: {},
    });
    const overlay = buildRuntimeOverlay(tiny, ops);
    assert.equal(overlay.states.length, 0);
    assert.ok(overlay.unmatched.length > 0,
      'a subsystem the map cannot draw must be reported, or it silently vanishes');
  });

  console.log('\n── 5. The trace overlay visualises; it does not reason ──');

  const observatory = {
    campaign: { id: 'c1', name: 'حملة اختبار', externalCampaignId: 'x', status: 'ACTIVE' },
    trace: LAYER_ORDER.map((stage, i) => ({
      ordinal: i + 1, stage, layer: stage,
      conclusion: i < 3 ? `خلاصة ${stage}` : null,
      status: (i < 3 ? 'REACHED' : 'NOT_REACHED') as 'REACHED' | 'NOT_REACHED',
      absenceReason: i < 3 ? null : 'reconcileIntelligence() returned before this layer.',
      canonicalSource: `owner-of-${stage}`, inputSource: `input-of-${stage}`,
    })),
  } as unknown as BrainObservatorySnapshot;

  check('every stage is copied verbatim from the Observatory', () => {
    const overlay = buildTraceOverlay(graph, observatory);
    assert.equal(overlay.stages.length, LAYER_ORDER.length);
    for (const [i, s] of overlay.stages.entries()) {
      const from = observatory.trace[i]!;
      assert.equal(s.state, from.status);
      assert.equal(s.conclusion, from.conclusion);
      assert.equal(s.absenceReason, from.absenceReason);
      assert.equal(s.canonicalSource, from.canonicalSource);
      assert.equal(s.inputSource, from.inputSource);
      assert.equal(s.ordinal, from.ordinal);
    }
  });

  check('NOT_REACHED layers are kept, with the Brain own reason', () => {
    // A chain that silently omits the layers it never reached looks complete.
    const overlay = buildTraceOverlay(graph, observatory);
    const absent = overlay.stages.filter((s) => s.state === 'NOT_REACHED');
    assert.ok(absent.length > 0, 'the fixture has unreached layers; they must survive');
    for (const a of absent) {
      assert.equal(a.conclusion, null, 'an unreached layer must not acquire a conclusion');
      assert.ok(a.absenceReason && a.absenceReason.length > 0, 'absence must state its reason');
    }
    assert.equal(reachedNodeIds(overlay).length, 3);
  });

  check('the trace module holds no reasoning of its own', () => {
    // Comments stripped first: the module explains the trap it is avoiding,
    // and a guard that fires on the explanation would push authors to delete
    // the explanation.
    const s = stripComments(src('src/graph/trace.ts'));
    // Deciding reached-ness from a conclusion being non-empty is exactly how
    // this becomes a second Brain with a different answer.
    assert.ok(!/conclusion\s*!==\s*null|conclusion\s*&&|\bif\s*\(.*conclusion/.test(s),
      'trace.ts derives reached-ness from the conclusion instead of copying status');
    for (const forbidden of ['reconcileIntelligence(', 'diagnoseFunnel(', 'detectAnomaly(',
                             'buildEntityIntelligence(', 'scoreObjectiveHealth(']) {
      assert.ok(!s.includes(forbidden), `trace.ts calls ${forbidden} — that is a second engine`);
    }
    assert.ok(!/[<>]=?\s*0?\.\d+/.test(s), 'trace.ts holds a numeric threshold');
  });

  check('Brain data reaches the graph only through the Observatory', () => {
    const s = src('src/graph/trace.ts');
    assert.ok(s.includes('BrainObservatorySnapshot'),
      'the trace overlay must consume the canonical Observatory snapshot');
    assert.ok(!s.includes('prisma'), 'the trace overlay must not read the database itself');
    const routes = src('src/api/server.ts');
    assert.ok(/graph\/trace[\s\S]{0,1200}buildBrainObservatory\(/.test(routes),
      'the trace route must delegate to buildBrainObservatory');
  });

  console.log('\n── 6. The graph is read-only, structurally ──');

  check('there is no mutating route under /api/admin/graph', () => {
    const routes = [...src('src/api/server.ts')
      .matchAll(/app\.(get|post|patch|put|delete)\('(\/api\/admin\/graph[^']*)'/g)];
    assert.ok(routes.length >= 3, 'the three graph modes must be mounted');
    const mutating = routes.filter((m) => m[1] !== 'get').map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(mutating, [], `the graph must never accept a write: ${mutating.join(', ')}`);
  });

  check('the graph never writes to Meta, a queue, or the database', () => {
    // NAMING a write in a provenance string is how the graph documents who
    // owns a model — that is the feature. PERFORMING one is the defect. So
    // this checks for the call and for the client ever being reachable, not
    // for the substring.
    for (const f of ['src/graph/architecture.ts', 'src/graph/runtime.ts', 'src/graph/trace.ts',
                     'src/graph/model.ts', 'src/graph/adapter.ts', 'src/web/pages/systemGraphView.ts']) {
      const s = stripComments(src(f));
      assert.ok(!/from '.*(@prisma\/client|lib\/prisma)'/.test(s),
        `${f} imports a database client — the graph must not be able to reach one`);
      assert.ok(!/\bawait\s+prisma\./.test(s), `${f} awaits a prisma call`);
      assert.ok(!/\bprisma\.[a-zA-Z]+\.[a-zA-Z]+\(/.test(s), `${f} performs a prisma call`);
      for (const forbidden of ['.upsert(', '.createMany(', '.deleteMany(', '.updateMany(',
                               'enqueue(', 'metaClient.fetch', 'runCapabilityProbe']) {
        assert.ok(!s.includes(forbidden), `${f} contains ${forbidden} — the graph observes, it does not act`);
      }
    }
  });

  check('the graph client issues GET only', () => {
    const view = src('src/web/pages/systemGraphView.ts');
    assert.ok(!/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(view),
      'the graph component must not issue a mutating request');
    assert.ok(!/<form/i.test(view), 'the graph component must not carry a form');
  });

  console.log('\n── 7. Negative tests: the guards actually bite ──');

  check('planting a dangling edge is caught', () => {
    const s = plain();
    s.edges.push({
      id: 'planted', from: s.nodes[0].id, to: 'node-that-does-not-exist', kind: 'CALLS',
      provenance: { method: 'REPOSITORY_DECLARATION', source: 'planted' },
    });
    const r = parseGraphSnapshot(s);
    assert.equal(r.ok, false, 'a planted dangling edge passed validation');
    assert.equal((r as any).code, 'DANGLING_EDGE');
  });

  check('planting a provenance-free node is caught', () => {
    const s = plain();
    s.nodes.push({ id: 'planted', nodeClass: 'SERVICE', label: 'p', what: 'p', owner: 'p' });
    assert.equal((parseGraphSnapshot(s) as any).code, 'MISSING_PROVENANCE');
  });

  check('planting a future schema version is caught', () => {
    const s = plain();
    s.version = '1.' + (Number(GRAPH_SCHEMA_VERSION.split('.')[1]) + 1) + '.0';
    assert.equal((parseGraphSnapshot(s) as any).code, 'FUTURE_MINOR_VERSION');
  });

  check('a graph model node still names its persistence owner', () => {
    // The DailyStat inspector must be able to answer "who writes this".
    const daily = graph.nodes.find((n) => n.id === modelNodeId('DailyStat'));
    assert.ok(daily, 'DailyStat must be in the graph');
    const writers = graph.edges.filter((e) => e.to === daily!.id && e.kind === 'PERSISTS_TO');
    assert.ok(writers.length > 0, 'DailyStat has no canonical writer edge');
    const readers = graph.edges.filter((e) => e.to === daily!.id && e.kind === 'READS');
    assert.ok(readers.length > 0, 'DailyStat has no reader edges');
    assert.ok(daily!.unknowns && daily!.unknowns.length > 0,
      'DailyStat has no adAccountId column; that blind spot must stay visible');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════\n`);
  if (failures.length) process.exit(1);
}

run();
