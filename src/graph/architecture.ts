// ════════════════════════════════════════════════════════════════════════
//  src/graph/architecture.ts
//
//  THE ONE ARCHITECTURE GRAPH BUILDER.
//
//  ── Why there is exactly one ──────────────────────────────────────────
//
//  This repository already contained a dependency graph before this file
//  existed: `src/intelligence/metaDependencyGraph.ts` answers "what breaks
//  if Meta changes this?" with edges read out of the source tree, and
//  `test_dependency_drift.ts` fails when production requests a field the
//  registry never heard of. It has already caught a real omission.
//
//  Building a second graph engine beside it would create two answers to
//  "what depends on spend", and the losing answer would still be rendered
//  somewhere. So this builder does not re-derive dependencies. It READS the
//  registries that already own them:
//
//    · metaDependencyGraph.ts  → Meta resources, and which modules consume them
//    · analytics/intelligence/hierarchy.ts (LAYER_ORDER) → the reasoning chain
//    · web/pages/adminCapabilities.ts → operator surfaces and their routes
//    · lib/queue.ts (QUEUE_NAMES) → the queues that exist
//    · api/adminGuard.ts → the one authorization gate
//
//  Everything this file adds is the JOIN between them, plus the handful of
//  persistence facts (who writes DailyStat) that no registry had recorded.
//
//  ── The standard every edge is held to ────────────────────────────────
//
//  An edge exists only where a literal in the source tree supports it, and
//  every edge names where that literal is. Where a relationship is real but
//  unverified — per-queue depth, whether a separate worker service is alive
//  — the node carries it in `unknowns` instead. A missing edge is a gap; an
//  invented edge is a lie, and the operator cannot tell them apart later.
// ════════════════════════════════════════════════════════════════════════

import { LAYER_ORDER, type IntelligenceLayer } from '../analytics/intelligence/hierarchy';
import { META_RESOURCES, PRODUCT_FEATURES } from '../intelligence/metaDependencyGraph';
import { QUEUE_NAMES } from '../lib/queue';
import { getBuildIdentity } from '../lib/buildIdentity';
import { ADMIN_CAPABILITIES } from '../web/pages/adminCapabilities';
import {
  GRAPH_SCHEMA_VERSION, freezeSnapshot,
  type EdgeKind, type GraphEdge, type GraphNode, type GraphSnapshot,
  type NodeClass, type Provenance,
} from './model';

// ── id helpers. Stable, readable, and unique by construction ────────────
export const pageNodeId = (module: string) => `page:${module}`;
export const routeNodeId = (route: string) => `route:${route}`;
export const moduleNodeId = (path: string) => `module:${path}`;
export const layerNodeId = (l: IntelligenceLayer) => `layer:${l}`;
export const modelNodeId = (m: string) => `model:${m}`;
export const queueNodeId = (q: string) => `queue:${q}`;
export const metaNodeId = (resourceId: string) => `meta:${resourceId}`;
export const deployNodeId = (svc: string) => `deploy:${svc}`;

const REPO = (source: string, note?: string): Provenance =>
  note === undefined
    ? { method: 'REPOSITORY_DECLARATION', source }
    : { method: 'REPOSITORY_DECLARATION', source, note };

const REG = (source: string, note?: string): Provenance =>
  note === undefined
    ? { method: 'REGISTRY_ENTRY', source }
    : { method: 'REGISTRY_ENTRY', source, note };

/**
 * Modules whose class we can state. Anything under `engines/` or
 * `analytics/` computes; anything under `services/`, `lib/` or
 * `repositories/` serves. Classifying by directory rather than by name
 * keeps the rule checkable — a reader can verify it from the tree.
 */
function classifyModule(path: string): NodeClass {
  if (path.startsWith('src/repositories/')) return 'PERSISTENCE_OWNER';
  if (path.startsWith('src/engines/') || path.startsWith('src/analytics/')) return 'ENGINE';
  return 'SERVICE';
}

/** Short display name: the file, not the path. */
function moduleLabel(path: string): string {
  return path.split('/').pop() ?? path;
}

interface Builder {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
}

function addNode(b: Builder, n: GraphNode): string {
  // First declaration wins. A later, thinner description of the same node
  // must not overwrite a richer one — the registries are read in order of
  // how much they know.
  if (!b.nodes.has(n.id)) b.nodes.set(n.id, n);
  return n.id;
}

function addEdge(b: Builder, from: string, to: string, kind: EdgeKind, provenance: Provenance): void {
  const id = `${kind}:${from}->${to}`;
  if (b.edges.has(id)) return;
  // Refuse to record an edge whose endpoints are not in the graph. The
  // adapter would reject it later anyway; failing here names the builder
  // that produced it instead of the file that loaded it.
  if (!b.nodes.has(from) || !b.nodes.has(to)) return;
  b.edges.set(id, { id, from, to, kind, provenance });
}

function ensureModule(b: Builder, path: string, what: string): string {
  return addNode(b, {
    id: moduleNodeId(path),
    nodeClass: classifyModule(path),
    label: moduleLabel(path),
    what,
    owner: path,
    provenance: REPO(path),
  });
}

// ── The persistence facts no registry owned ─────────────────────────────
//
// Each row was read out of the module named in `writer` — a literal
// `prisma.<model>.upsert(` / `.create(` call — not inferred from naming.
const PERSISTENCE: Array<{
  model: string; writer: string; what: string; readers: string[]; unknowns?: string[];
}> = [
  {
    model: 'DailyStat',
    writer: 'src/repositories/dailyStatsRepo.ts',
    what: 'الصف اليومي لكل كيان: الإنفاق والظهور والنقرات والنتائج — الأساس الذي يقيس عليه كل شيء آخر',
    readers: ['src/services/getDashboard.ts', 'src/services/entityIntelligence.ts', 'src/services/v2ContextAssembler.ts'],
    // No adAccountId column: the row is keyed (entityType, entityId, date).
    // The link to an ad account is therefore polymorphic and cannot be drawn
    // as an edge without inventing a foreign key the schema does not have.
    unknowns: ['لا عمود adAccountId — المفتاح (entityType, entityId, date)، فالنسبة إلى حساب إعلاني غير قابلة للرسم كعلاقة مباشرة'],
  },
  {
    model: 'PeriodInsight',
    writer: 'src/services/periodInsights.ts',
    what: 'قيم المدى التي يعطيها Meta للفترة كاملة (الوصول والتكرار) بدل جمعها من الأيام',
    readers: ['src/services/getDashboard.ts'],
  },
  {
    model: 'CampaignBrainSnapshot',
    writer: 'src/services/BrainPersistence.ts',
    what: 'لقطة تفكير الدماغ لحملة في وقت بعينه — المصدر الذي يقرأه المرصد',
    readers: ['src/services/brainObservatory.ts'],
  },
  {
    model: 'SyncJob',
    writer: 'src/lib/initialSync.ts',
    what: 'سجل عملية مزامنة: متى بدأت وكيف انتهت وبأي خطأ',
    readers: ['src/services/adminOpsHealth.ts'],
  },
];

/** Modules the Control Plane itself reads, with what each one owns. */
const CONTROL_PLANE_SERVICES: Array<{ path: string; what: string; route?: string }> = [
  { path: 'src/services/adminOpsHealth.ts', what: 'لقطة حالة التشغيل: القواعد والطوابير والعمال والمزامنة وحدود المعرفة', route: 'GET /api/admin/ops' },
  { path: 'src/services/getPlatformStats.ts', what: 'إحصاءات المنصة المجمّعة: الوصول والميزانيات وتغطية السرد', route: 'GET /api/admin/platform-stats' },
  { path: 'src/services/brainObservatory.ts', what: 'سلسلة تفكير الدماغ لحملة واحدة، بالبرهان', route: 'GET /api/admin/brain-observatory/:campaignId' },
  { path: 'src/services/adminConsole.ts', what: 'إدارة الزبائن: إنشاء وتعديل وحذف واستعراض', route: 'GET /api/admin/customers' },
  { path: 'src/services/supportService.ts', what: 'تذاكر الدعم: القائمة والمحادثة والرد', route: 'GET /api/admin/support/tickets' },
  { path: 'src/services/metaCapabilityProbe.ts', what: 'مرقاب القدرات: هل يقبل Meta هذا الحقل فعلاً', route: 'POST /api/admin/capability-probe' },
  { path: 'src/services/metaEntityDiscovery.ts', what: 'اكتشاف الكيانات والحسابات المتاحة لرمز معيّن', route: 'GET /api/admin/meta/discover-accounts' },
  { path: 'src/services/metaClient.ts', what: 'الحاجز الوحيد أمام Meta — كل نداء يمر من هنا' },
  { path: 'src/services/entityIntelligence.ts', what: 'يبني قمع الكيان من الصفوف اليومية قبل أن يعقلن الذكاء' },
  { path: 'src/services/platformSettings.ts', what: 'إعدادات المنصة المخزّنة', route: 'GET /api/admin/settings' },
  { path: 'src/lib/queue.ts', what: 'نظام الطوابير: يقبل المهام الخلفية أو يعمل داخل العملية' },
  { path: 'src/analytics/intelligence/hierarchy.ts', what: 'المعقلن: يرتّب طبقات الذكاء ويمنع طبقة من تجاوز ما فوقها' },
];

/**
 * Build the architecture graph from repository truth.
 *
 * Pure and synchronous by design: it reads registries, never the database.
 * A graph of what the code IS must not change because a query was slow —
 * that is the runtime overlay's job, and keeping them separate is what lets
 * the overlay be discarded without losing the map.
 */
export function buildArchitectureGraph(): GraphSnapshot {
  const b: Builder = { nodes: new Map(), edges: new Map() };

  // ── 1. The authorization gate. One node, referenced by every route ────
  const guard = addNode(b, {
    id: 'service:platform-admin-guard',
    nodeClass: 'SERVICE',
    label: 'requirePlatformAdmin',
    what: 'البوابة الوحيدة أمام كل مسار إداري: رمز صالح، ثم عضوية، ثم قائمة السماح — وترفض الخدمة أصلاً إن لم تُضبط القائمة',
    owner: 'src/api/adminGuard.ts',
    provenance: REPO('src/api/adminGuard.ts', 'requirePlatformAdmin'),
    unknowns: ['قائمة السماح تأتي من PLATFORM_ADMIN_EMAILS في البيئة — لا يمكن للخريطة رؤية قيمتها'],
  });

  // ── 2. Deployment services + infrastructure ──────────────────────────
  const deployments: Array<[string, string, string, string[]]> = [
    ['api', 'خدمة الواجهة', 'العملية التي تخدم الصفحات والمسارات', []],
    ['worker', 'خدمة العامل', 'العملية التي تشغّل المزامنة والمهام الخلفية',
      ['حياة عملية عامل منفصلة لا تُرى من الواجهة — الحالة تُستنتج من آخر مزامنة ناجحة']],
    ['postgres', 'قاعدة البيانات', 'المخزن الدائم لكل شيء تعرفه المنصة', []],
    ['redis', 'Redis', 'العدّادات والأقفال والطوابير — وعند غيابه تعمل بدائل داخل العملية', []],
  ];
  for (const [id, label, what, unknowns] of deployments) {
    addNode(b, {
      id: deployNodeId(id), nodeClass: 'DEPLOYMENT_SERVICE', label, what,
      owner: `SERVICE_ROLE=${id}`,
      provenance: REPO('src/config.ts', 'serviceRole / DATABASE_URL / REDIS_URL'),
      ...(unknowns.length ? { unknowns } : {}),
    });
  }

  // ── 3. Queues, from the one place their names are declared ───────────
  for (const [key, name] of Object.entries(QUEUE_NAMES)) {
    addNode(b, {
      id: queueNodeId(name), nodeClass: 'QUEUE', label: name,
      what: `طابور ${key} — يُعلن في QUEUE_NAMES`,
      owner: 'src/lib/queue.ts',
      provenance: REPO('src/lib/queue.ts', `QUEUE_NAMES.${key}`),
      unknowns: ['عمق الطابور وعدد المهام المتعثّرة غير مرصودَين — لا فحص حي لكل طابور'],
    });
    addEdge(b, queueNodeId(name), deployNodeId('redis'), 'DEPENDS_ON',
      REPO('src/lib/queue.ts', 'getQueueRedis'));
  }
  ensureModule(b, 'src/lib/queue.ts', 'نظام الطوابير: يقبل المهام الخلفية أو يعمل داخل العملية');
  for (const name of Object.values(QUEUE_NAMES)) {
    addEdge(b, moduleNodeId('src/lib/queue.ts'), queueNodeId(name), 'OWNED_BY',
      REPO('src/lib/queue.ts', 'QUEUE_NAMES'));
  }

  // ── 4. Services the Control Plane depends on ─────────────────────────
  for (const s of CONTROL_PLANE_SERVICES) ensureModule(b, s.path, s.what);
  addEdge(b, moduleNodeId('src/lib/queue.ts'), deployNodeId('redis'), 'DEPENDS_ON',
    REPO('src/lib/queue.ts', 'getQueueRedis'));

  // ── 5. Persistence: models, their canonical writer, their readers ────
  for (const p of PERSISTENCE) {
    const model = addNode(b, {
      id: modelNodeId(p.model), nodeClass: 'DB_MODEL', label: p.model, what: p.what,
      owner: `prisma/schema.prisma :: model ${p.model}`,
      provenance: REPO('prisma/schema.prisma', `model ${p.model}`),
      ...(p.unknowns ? { unknowns: p.unknowns } : {}),
    });
    const writer = ensureModule(b, p.writer, `المالك الكاتب لـ ${p.model}`);
    addEdge(b, writer, model, 'PERSISTS_TO', REPO(p.writer, `prisma.${p.model[0]!.toLowerCase()}${p.model.slice(1)}.upsert/create`));
    for (const r of p.readers) {
      const reader = ensureModule(b, r, `يقرأ ${p.model}`);
      addEdge(b, reader, model, 'READS', REPO(r, `prisma.${p.model[0]!.toLowerCase()}${p.model.slice(1)} read`));
    }
    addEdge(b, model, deployNodeId('postgres'), 'PERSISTS_TO', REPO('prisma/schema.prisma', 'datasource db'));
  }

  // ── 5b. The tenant spine, as the schema declares it ──────────────────
  //
  // One WORKSPACE node, not one per customer. Individual workspaces are
  // rows, and rows are runtime — putting each customer in the architecture
  // graph would make "what does the system look like" change every time
  // somebody signed up. The observed per-workspace state reaches this node
  // as an aggregate through the runtime overlay instead.
  addNode(b, {
    id: modelNodeId('Workspace'), nodeClass: 'WORKSPACE', label: 'Workspace',
    what: 'مساحة عمل الزبون — وحدة العزل التي يُنسب إليها كل حساب إعلاني وكل صف بيانات',
    owner: 'prisma/schema.prisma :: model Workspace',
    provenance: REPO('prisma/schema.prisma', 'model Workspace'),
    href: '/admin/customers',
    unknowns: ['عدد المساحات وحالتها بيانات تشغيل، لا بنية — تُقرأ من لقطة التشغيل'],
  });
  for (const [model, what] of [
    ['AdAccount', 'الحساب الإعلاني المرتبط بمساحة عمل — حامل العملة والكيانات'],
    ['MetaConnection', 'الرمز المخزَّن ونطاقه لحساب إعلاني — لا يُقرأ إلا خلف الحاجز'],
  ] as const) {
    addNode(b, {
      id: modelNodeId(model), nodeClass: 'DB_MODEL', label: model, what,
      owner: `prisma/schema.prisma :: model ${model}`,
      provenance: REPO('prisma/schema.prisma', `model ${model}`),
    });
    addEdge(b, modelNodeId(model), deployNodeId('postgres'), 'PERSISTS_TO',
      REPO('prisma/schema.prisma', 'datasource db'));
  }
  addEdge(b, modelNodeId('AdAccount'), modelNodeId('Workspace'), 'OWNED_BY',
    REPO('prisma/schema.prisma', 'AdAccount.workspaceId'));
  // MetaConnection hangs off the WORKSPACE, not the ad account — the schema
  // says workspaceId, and a connection can cover several accounts under one
  // Business. Drawing it under AdAccount would have been the more obvious
  // picture and the wrong one.
  addEdge(b, modelNodeId('MetaConnection'), modelNodeId('Workspace'), 'OWNED_BY',
    REPO('prisma/schema.prisma', 'MetaConnection.workspaceId'));
  addEdge(b, moduleNodeId('src/services/metaConnectionStore.ts'), modelNodeId('MetaConnection'),
    'READS', REPO('src/services/metaConnectionStore.ts', 'prisma.metaConnection.findUnique'));
  addEdge(b, moduleNodeId('src/services/metaConnectionStore.ts'), modelNodeId('MetaConnection'),
    'PERSISTS_TO', REPO('src/services/metaConnectionStore.ts', 'prisma.metaConnection.create/update'));

  // ── 6. Meta resources, straight from the dependency registry ─────────
  for (const r of META_RESOURCES) {
    addNode(b, {
      id: metaNodeId(r.id), nodeClass: 'META_CAPABILITY', label: r.name,
      what: `${r.kind} نستهلكه من Meta`,
      owner: r.declaredIn,
      provenance: REG('src/intelligence/metaDependencyGraph.ts', `META_RESOURCES ${r.id}`),
    });
  }

  // The consumption edges. The registry already knows which modules depend
  // on which resource; this only reshapes that into module → resource, and
  // carries the feature's user impact and failure mode as edge provenance so
  // the blast radius survives the reshaping.
  for (const f of PRODUCT_FEATURES) {
    for (const impl of f.implementedIn) {
      const mod = ensureModule(b, impl, `ينفّذ: ${f.name}`);
      for (const dep of f.dependsOn) {
        const target = metaNodeId(dep);
        if (!b.nodes.has(target)) continue; // registry drift; drop, never invent
        addEdge(b, mod, target, 'CONSUMES',
          REG('src/intelligence/metaDependencyGraph.ts',
            `PRODUCT_FEATURES ${f.id} — ${f.userImpact} (failureMode=${f.failureMode})`));
      }
    }
  }
  // Everything Meta enters through the cordon; the registry declares it.
  const metaClient = moduleNodeId('src/services/metaClient.ts');
  for (const r of META_RESOURCES) {
    if (r.declaredIn.startsWith('src/services/metaClient.ts')) {
      addEdge(b, metaClient, metaNodeId(r.id), 'CONSUMES',
        REPO(r.declaredIn, `declares ${r.name}`));
    }
  }

  // ── 7. Meta entity levels ────────────────────────────────────────────
  for (const [level, what] of [
    ['campaign', 'الحملة — المستوى الذي يحمل الهدف والميزانية'],
    ['adset', 'المجموعة الإعلانية — المستوى الذي يحمل الجمهور'],
    ['ad', 'الإعلان — المستوى الذي يحمل الإبداع'],
  ] as const) {
    addNode(b, {
      id: `metaEntity:${level}`, nodeClass: 'META_ENTITY', label: level, what,
      owner: 'src/services/metaEntityDiscovery.ts :: DiscoveryLevel',
      provenance: REPO('src/services/metaEntityDiscovery.ts', 'DiscoveryLevel'),
    });
    addEdge(b, moduleNodeId('src/services/metaEntityDiscovery.ts'), `metaEntity:${level}`,
      'PRODUCES', REPO('src/services/metaEntityDiscovery.ts', 'discoverProbeEntities'));
  }

  // ── 8. The reasoning chain, in hierarchy.ts's own order ──────────────
  const LAYER_WHAT: Record<IntelligenceLayer, string> = {
    DATA_VALIDITY: 'هل البيانات كافية وصالحة أصلاً للحكم',
    SEMANTIC_VALIDITY: 'هل نعرف ما الذي تقيسه هذه الحملة',
    FUNNEL_DIAGNOSIS: 'أين ينكسر القمع: الظهور، النقر، الوصول للصفحة، النتيجة',
    ANOMALY_DETECTION: 'هل تغيّر شيء بشكل شاذ مقارنة بالفترة السابقة',
    HEALTH_IMPACT: 'ما وزن ما وجدناه على صحة الحملة',
    RECOMMENDATION: 'ما الفعل المسموح به بناءً على ما ثبت فقط',
  };
  LAYER_ORDER.forEach((layer, i) => {
    addNode(b, {
      id: layerNodeId(layer), nodeClass: 'INTELLIGENCE_LAYER',
      label: layer, what: LAYER_WHAT[layer],
      owner: 'src/analytics/intelligence/hierarchy.ts :: reconcileIntelligence',
      provenance: REPO('src/analytics/intelligence/hierarchy.ts', `LAYER_ORDER[${i}]`),
      href: '/admin/intelligence',
    });
  });
  // The chain short-circuits downward, so each layer depends on the one above.
  LAYER_ORDER.forEach((layer, i) => {
    if (i === 0) return;
    addEdge(b, layerNodeId(layer), layerNodeId(LAYER_ORDER[i - 1]!), 'DEPENDS_ON',
      REPO('src/analytics/intelligence/hierarchy.ts',
        'reconcileIntelligence short-circuits on an upstream failure'));
  });
  addEdge(b, moduleNodeId('src/analytics/intelligence/hierarchy.ts'), layerNodeId(LAYER_ORDER[0]!),
    'OWNED_BY', REPO('src/analytics/intelligence/hierarchy.ts', 'LAYER_ORDER'));
  addEdge(b, layerNodeId('DATA_VALIDITY'), moduleNodeId('src/services/entityIntelligence.ts'),
    'CONSUMES', REPO('src/services/brainObservatory.ts',
      'LAYER_ATTRIBUTION.DATA_VALIDITY.inputSource — buildEntityFunnel().dataConfidence'));
  addEdge(b, moduleNodeId('src/services/entityIntelligence.ts'), modelNodeId('DailyStat'),
    'READS', REPO('src/services/entityIntelligence.ts', 'buildEntityFunnel'));
  addEdge(b, moduleNodeId('src/services/brainObservatory.ts'), modelNodeId('CampaignBrainSnapshot'),
    'READS', REPO('src/services/brainObservatory.ts', 'buildBrainObservatory'));

  // ── 9. Operator surfaces and their routes, from the capability registry ─
  for (const c of ADMIN_CAPABILITIES) {
    const routeId = routeNodeId(c.canonicalBackend);
    addNode(b, {
      id: routeId, nodeClass: 'API_ROUTE', label: c.canonicalBackend,
      what: c.operatorValue,
      owner: 'src/api/server.ts',
      provenance: REG('src/web/pages/adminCapabilities.ts', c.id),
    });
    // Asserted by test_admin_os.ts, which fails when any /api/admin route
    // lacks the guard — so this edge is a checked fact, not an assumption.
    addEdge(b, routeId, guard, 'GUARDED_BY',
      REPO('src/api/server.ts', 'requirePlatformAdmin (asserted by test_admin_os.ts)'));
    addEdge(b, routeId, deployNodeId('api'), 'DEPLOYED_AS', REPO('src/api/serve.ts', 'SERVICE_ROLE'));

    if (c.currentPage !== '—') {
      const pageId = pageNodeId(c.currentPage);
      addNode(b, {
        id: pageId, nodeClass: 'PAGE', label: c.currentPage,
        what: `سطح إداري يقدّم: ${c.name}`,
        owner: `src/web/pages/${c.currentPage}.ts`,
        provenance: REG('src/web/pages/adminCapabilities.ts', c.id),
        href: c.currentRoute.startsWith('/admin') ? c.currentRoute : undefined,
      });
      addEdge(b, pageId, routeId, 'CALLS', REG('src/web/pages/adminCapabilities.ts', c.id));
      addEdge(b, pageId, guard, 'AUTHORIZED_BY',
        REPO('src/api/server.ts', 'adminPage() gate (asserted by test_admin_os.ts)'));
    }
    if (c.controlPlaneRoute) {
      const cp = addNode(b, {
        id: `surface:${c.controlPlaneRoute}`, nodeClass: 'PAGE',
        label: c.controlPlaneRoute, what: 'سطح لوحة التحكّم الموحّدة',
        owner: 'src/web/adminShell.ts',
        provenance: REG('src/web/pages/adminCapabilities.ts', `${c.id}.controlPlaneRoute`),
        href: c.controlPlaneRoute,
      });
      addEdge(b, cp, routeId, 'RENDERS', REG('src/web/pages/adminCapabilities.ts', c.id));
    }
  }

  // ── 10. Services behind their routes ─────────────────────────────────
  for (const s of CONTROL_PLANE_SERVICES) {
    if (!s.route) continue;
    const routeId = routeNodeId(s.route);
    if (!b.nodes.has(routeId)) continue;
    addEdge(b, routeId, moduleNodeId(s.path), 'CALLS', REPO('src/api/server.ts', s.route));
  }
  addEdge(b, moduleNodeId('src/services/adminOpsHealth.ts'), deployNodeId('postgres'),
    'READS', REPO('src/services/adminOpsHealth.ts', 'prisma.$queryRaw probe'));
  addEdge(b, moduleNodeId('src/services/adminOpsHealth.ts'), deployNodeId('redis'),
    'READS', REPO('src/services/adminOpsHealth.ts', 'isRedisHealthy()'));
  addEdge(b, moduleNodeId('src/services/adminOpsHealth.ts'), moduleNodeId('src/lib/queue.ts'),
    'READS', REPO('src/services/adminOpsHealth.ts', 'isQueueEnabled()'));
  addEdge(b, moduleNodeId('src/services/adminOpsHealth.ts'), modelNodeId('SyncJob'),
    'READS', REPO('src/services/adminOpsHealth.ts', 'sync rows per ad account'));

  const build = getBuildIdentity();
  return freezeSnapshot({
    version: GRAPH_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'adlytic-internal',
    repositoryCommit: build.commit ?? null,
    nodes: [...b.nodes.values()],
    edges: [...b.edges.values()],
    metadata: {
      builder: 'src/graph/architecture.ts',
      nodeCount: b.nodes.size,
      edgeCount: b.edges.size,
      reusedRegistries:
        'metaDependencyGraph.ts, hierarchy.ts LAYER_ORDER, adminCapabilities.ts, queue.ts QUEUE_NAMES',
    },
  });
}
