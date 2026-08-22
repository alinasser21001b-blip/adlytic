// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/fixtures.mjs
//
//  Operator scenarios for the Control Plane acceptance audit.
//
//  Each scenario is a complete set of admin API responses describing one
//  state the platform can genuinely be in. They exist because judging an
//  operations console from its happy path is how consoles ship with an
//  empty state nobody ever looked at, and an error state that renders as a
//  blank card.
//
//  Shapes are copied from the real services — adminOpsHealth.AdminOpsSnapshot,
//  getPlatformStats.PlatformStats, the support and customer routes — so a
//  scenario that renders here renders in production.
// ════════════════════════════════════════════════════════════════════════

const build = { commit: 'a113858ffed1', environment: 'production', source: 'RAILWAY_GIT_COMMIT_SHA' };

const ws = (over = {}) => ({
  workspaceId: 'ws_1', workspaceName: 'متجر النخبة', ownerEmail: 'owner@example.com',
  adAccountId: 'aa_1', adAccountName: 'النخبة — الحساب الرئيسي', externalAccountId: 'act_1029384756',
  currency: 'IQD', hasToken: true, tokenSource: 'SYSTEM_USER', tokenExpiresAt: '2026-12-01T00:00:00.000Z',
  metaAccountStatus: 1, lastSyncedAt: '2026-08-22T04:10:00.000Z', lastSyncStatus: 'COMPLETED',
  lastSyncError: null, freshestDataDate: '2026-08-21', dataAgeDays: 1,
  connection: 'HEALTHY', data: 'HEALTHY', overall: 'HEALTHY', headline: 'سليم',
  ...over,
});

const subsystems = (over = {}) => ([
  { key: 'database', status: over.database ?? 'HEALTHY', summary: over.databaseSummary ?? 'يستجيب' },
  { key: 'redis', status: over.redis ?? 'HEALTHY', summary: over.redisSummary ?? 'متصل',
    actionHref: '/admin/meta', actionLabel: 'أثر الانقطاع على عدّادات Meta' },
  { key: 'queue', status: over.queue ?? 'HEALTHY', summary: over.queueSummary ?? 'يقبل المهام' },
  { key: 'workers', status: over.workers ?? 'HEALTHY', summary: over.workersSummary ?? 'مزامنة ناجحة خلال 48 ساعة',
    detail: 'role=combined' },
  { key: 'meta', status: over.meta ?? 'HEALTHY', summary: over.metaSummary ?? '1 حساب متصل',
    actionHref: '/admin#workspaces', actionLabel: 'افحص مساحات العمل' },
  { key: 'intelligence', status: 'NOT_TESTED',
    summary: 'صحة الذكاء تُقاس بالتغطية السردية في لوحة الحالة — لا يوجد فحص حي بعد' },
]);

const ops = (over = {}) => ({
  computedAt: '2026-08-22T09:15:00.000Z',
  overall: over.overall ?? 'HEALTHY',
  known: over.known ?? ['database', 'redis', 'queue', 'workers', 'meta'],
  unknown: over.unknown ?? ['intelligence'],
  subsystems: over.subsystems ?? subsystems(),
  attention: over.attention ?? [],
  workspaces: over.workspaces ?? [ws()],
  activity: over.activity ?? [
    { at: '2026-08-22T04:10:00.000Z', workspaceName: 'متجر النخبة', kind: 'SYNC', status: 'COMPLETED' },
    { at: '2026-08-21T04:10:00.000Z', workspaceName: 'متجر النخبة', kind: 'SYNC', status: 'COMPLETED' },
  ],
  boundary: over.boundary ?? [
    { state: 'NOT_TESTED', subject: 'صحة طبقة الذكاء',
      why: 'لا يوجد فحص حي يقيس صحة الاستدلال — التغطية السردية تُقاس في إحصاءات المنصة فقط.',
      resolvedBy: 'فحص دوري يشغّل المعقلن على حملة معروفة ويقارن الخلاصة', href: '/admin/intelligence' },
  ],
  build: over.build ?? build,
});

const stats = (over = {}) => ({
  reach: { workspaces: 1, accounts: 1, activeAccounts: 1, campaigns: 12, ...(over.reach ?? {}) },
  money: { byCurrency: [{ currency: 'IQD', activeCampaigns: 7, totalDailyBudgetMajor: '1,250,000', impliedMonthlyMajor: '37,500,000' }] },
  brain: over.brain ?? { snapshotsLastNDays: 34, narrationsLastNDays: 31, narrationCoveragePct: 91 },
});

const customers = [
  { id: 'u_1', name: 'علي ناصر', email: 'ali@example.com', tier: 'PREMIUM', workspaceCount: 2 },
  { id: 'u_2', name: 'سارة عبد الله', email: 'sara@example.com', tier: 'FREE', workspaceCount: 1 },
];

const tickets = [
  { id: 't_1', subject: 'الأرقام لا تطابق مدير الإعلانات', status: 'OPEN', priority: 'URGENT',
    userEmail: 'ali@example.com', workspaceName: 'متجر النخبة', unreadForAdmin: true },
  { id: 't_2', subject: 'كيف أربط حساباً ثانياً؟', status: 'PENDING', priority: 'NORMAL',
    userEmail: 'sara@example.com', workspaceName: 'سارة ستور', unreadForAdmin: false },
];

/** Every scenario. `api` maps a route prefix to a response or an HTTP failure. */
export const SCENARIOS = {
  healthy: {
    label: 'Healthy system',
    api: { ops: ops(), stats: stats() },
  },

  meta_disconnected: {
    label: 'Meta disconnected',
    api: {
      ops: ops({
        overall: 'ERROR',
        subsystems: subsystems({ meta: 'ERROR', metaSummary: '1 من 1 حساب محجوب' }),
        attention: [{ id: 'meta', severity: 'ERROR', title: 'حساب Meta غير متصل',
          because: 'المزامنة متوقفة، وكل رقم يراه الزبون يتقادم من هذه اللحظة.',
          action: 'أعد الربط', href: '/admin/meta' }],
        workspaces: [ws({ hasToken: false, tokenSource: null, tokenExpiresAt: null,
          connection: 'ERROR', overall: 'ERROR', headline: 'لا رمز مخزَّن — الربط مقطوع',
          lastSyncStatus: 'FAILED', lastSyncError: 'OAuthException: Error validating access token' })],
      }),
      stats: stats(),
    },
  },

  meta_permission_failure: {
    label: 'Meta permission failure',
    api: {
      ops: ops({
        subsystems: subsystems({ meta: 'WARNING', metaSummary: 'نطاق ads_read غير ممنوح' }),
        attention: [{ id: 'scope', severity: 'WARNING', title: 'صلاحية ناقصة على Meta',
          because: 'التقارير التفصيلية لن تُجلب حتى يُمنح ads_read.',
          action: 'راجع القدرات', href: '/admin/meta' }],
        workspaces: [ws({ connection: 'WARNING', overall: 'WARNING', headline: 'صلاحية ناقصة' })],
      }),
      stats: stats(),
    },
  },

  database_unhealthy: {
    label: 'Database unhealthy',
    api: {
      ops: ops({
        overall: 'ERROR', known: [], unknown: ['redis', 'queue', 'workers', 'meta', 'intelligence'],
        subsystems: [{ key: 'database', status: 'ERROR',
          summary: 'لا يستجيب — لا يمكن قراءة أي حالة أخرى بثقة',
          detail: "Can't reach database server at db:5432" }],
        attention: [{ id: 'db', severity: 'ERROR', title: 'قاعدة البيانات لا تستجيب',
          because: 'كل حالة أخرى في هذه الصفحة غير قابلة للتحديد حتى تعود.' }],
        workspaces: [], activity: [],
        boundary: [{ state: 'UNKNOWN', subject: 'كل شيء عدا قاعدة البيانات',
          why: 'اللقطة تتوقّف عند أول فشل في القاعدة — القراءات اللاحقة لن تكون موثوقة.',
          resolvedBy: 'عودة القاعدة' }],
      }),
      stats: { __status: 503, error: 'database unavailable' },
    },
  },

  redis_unavailable: {
    label: 'Redis unavailable',
    api: {
      ops: ops({
        subsystems: subsystems({ redis: 'ERROR', redisSummary: 'غير متصل — العدّادات تقرأ صفراً',
          queue: 'ERROR', queueSummary: 'لا يقبل المهام — المزامنة الخلفية متوقفة' }),
        attention: [{ id: 'redis', severity: 'ERROR', title: 'Redis غير متصل',
          because: 'عدّادات استخدام Meta تقرأ صفراً، والأقفال والطوابير تعمل ببدائل داخل العملية فقط.',
          action: 'افحص REDIS_URL وسجلّ الإقلاع', href: '/admin/meta' }],
      }),
      stats: stats(),
    },
  },

  redis_not_configured: {
    label: 'Redis NOT_CONFIGURED (reported NOT_TESTED)',
    api: {
      ops: ops({
        unknown: ['redis', 'queue', 'intelligence'],
        subsystems: subsystems({
          redis: 'NOT_TESTED', redisSummary: 'غير مضبوط — العدّادات والأقفال تعمل بالبدائل داخل العملية',
          queue: 'NOT_TESTED', queueSummary: 'الطابور معطّل بالإعداد — المزامنة تعمل داخل العملية' }),
      }),
      stats: stats(),
    },
  },

  worker_unavailable: {
    label: 'Worker unavailable',
    api: {
      ops: ops({
        unknown: ['workers', 'intelligence'],
        subsystems: subsystems({ workers: 'UNKNOWN',
          workersSummary: 'لا مزامنة خلال 48 ساعة — لا نستطيع تأكيد عمل العمّال من هنا' }),
        workspaces: [ws({ lastSyncedAt: '2026-08-18T04:00:00.000Z', data: 'WARNING',
          overall: 'WARNING', dataAgeDays: 4, freshestDataDate: '2026-08-18',
          headline: 'البيانات متأخّرة 4 أيام' })],
      }),
      stats: stats(),
    },
  },

  no_workspaces: {
    label: 'No workspaces at all',
    api: {
      ops: ops({
        known: ['database', 'redis', 'queue'], unknown: ['workers', 'meta', 'intelligence'],
        subsystems: subsystems({ workers: 'NOT_TESTED', workersSummary: 'لا حساب مرتبط — لا عمل خلفي متوقع',
          meta: 'NOT_TESTED', metaSummary: 'لا حساب إعلاني مرتبط في المنصة' }),
        workspaces: [], activity: [],
      }),
      stats: stats({ reach: { workspaces: 0, accounts: 0, activeAccounts: 0, campaigns: 0 },
        brain: { snapshotsLastNDays: 0, narrationsLastNDays: 0, narrationCoveragePct: null } }),
      customers: [], tickets: [],
    },
  },

  workspace_without_meta: {
    label: 'Workspace without a Meta account',
    api: {
      ops: ops({
        workspaces: [ws({ adAccountId: null, adAccountName: null, externalAccountId: null,
          hasToken: false, tokenSource: null, tokenExpiresAt: null, metaAccountStatus: null,
          lastSyncedAt: null, lastSyncStatus: null, freshestDataDate: null, dataAgeDays: null,
          connection: 'NOT_TESTED', data: 'NOT_TESTED', overall: 'NOT_TESTED',
          headline: 'لا حساب إعلاني مرتبط' })],
      }),
      stats: stats(),
    },
  },

  stale_workspace: {
    label: 'Stale workspace data',
    api: {
      ops: ops({
        subsystems: subsystems({ workers: 'WARNING', workersSummary: 'آخر مزامنة قبل 9 أيام' }),
        attention: [{ id: 'stale', severity: 'WARNING', title: 'بيانات متقادمة',
          because: 'أحدث يوم مخزَّن عمره 9 أيام — التوصيات تُبنى على ماضٍ بعيد.',
          action: 'افحص المزامنة', href: '/admin/meta#sync' }],
        workspaces: [ws({ lastSyncedAt: '2026-08-13T04:00:00.000Z', freshestDataDate: '2026-08-13',
          dataAgeDays: 9, data: 'WARNING', overall: 'WARNING', headline: 'البيانات متأخّرة 9 أيام' })],
      }),
      stats: stats(),
    },
  },

  partial_data: {
    label: 'Partial data across workspaces',
    api: {
      ops: ops({
        overall: 'WARNING',
        subsystems: subsystems({ meta: 'WARNING', metaSummary: '1 من 3 حساب محجوب' }),
        workspaces: [
          ws(),
          ws({ workspaceId: 'ws_2', workspaceName: 'صيدلية الشفاء', adAccountName: 'الشفاء',
            externalAccountId: 'act_5566778899', connection: 'ERROR', data: 'UNKNOWN',
            overall: 'ERROR', dataAgeDays: null, freshestDataDate: null,
            lastSyncStatus: 'FAILED', lastSyncError: 'account is blocked',
            headline: 'الحساب محجوب على Meta' }),
          ws({ workspaceId: 'ws_3', workspaceName: 'مطعم بغداد الكبير للمأكولات الشرقية والغربية',
            adAccountName: 'بغداد — حساب طويل الاسم جداً لاختبار الفيض',
            externalAccountId: 'act_1122334455', connection: 'HEALTHY', data: 'NOT_TESTED',
            overall: 'NOT_TESTED', dataAgeDays: null, freshestDataDate: null,
            lastSyncedAt: null, lastSyncStatus: null, headline: 'لم تُشغَّل مزامنة بعد' }),
        ],
      }),
      stats: stats({ reach: { workspaces: 3, accounts: 3, activeAccounts: 2, campaigns: 31 } }),
    },
  },

  unknown_intelligence: {
    label: 'UNKNOWN intelligence state',
    api: {
      ops: ops({
        boundary: [
          { state: 'UNKNOWN', subject: 'تغطية السرد',
            why: 'لا لقطات دماغ في النافذة — النسبة غير محسوبة، وليست صفراً.',
            resolvedBy: 'أول تشغيل ناجح للمعقلن على حملة لها بيانات', href: '/admin/intelligence' },
          { state: 'NOT_TESTED', subject: 'صحة طبقة الذكاء',
            why: 'لا يوجد فحص حي يقيس صحة الاستدلال.',
            resolvedBy: 'فحص دوري يقارن خلاصة معروفة' },
        ],
      }),
      stats: stats({ brain: { snapshotsLastNDays: 0, narrationsLastNDays: 0, narrationCoveragePct: null } }),
      campaigns: [],
    },
  },

  api_errors: {
    label: 'Admin APIs failing',
    api: {
      ops: { __status: 500, error: 'ops snapshot failed' },
      stats: { __status: 500, error: 'platform stats failed' },
      graphArchitecture: { __status: 500, ok: false, code: 'BUILD_FAILED', reason: 'graph build failed' },
    },
  },

  graph_unavailable: {
    label: 'Graphify source unavailable',
    api: { ops: ops(), stats: stats(), graphArchitecture: { __status: 503, error: 'graph source unavailable' } },
  },

  graph_adapter_failure: {
    label: 'Graphify adapter rejects the snapshot',
    api: {
      ops: ops(), stats: stats(),
      graphArchitecture: { ok: false, code: 'FUTURE_MINOR_VERSION',
        reason: 'snapshot schema 1.7.0 is newer than 1.0.0; fields would be dropped' },
    },
  },

  graph_empty: {
    label: 'Empty graph',
    api: {
      ops: ops(), stats: stats(),
      graphArchitecture: { ok: true, adaptedBy: null, snapshot: {
        version: '1.0.0', generatedAt: '2026-08-22T09:00:00.000Z', source: 'adlytic-internal',
        repositoryCommit: null, nodes: [], edges: [], metadata: {} } },
    },
  },
};

export const FIXTURE_CUSTOMERS = customers;
export const FIXTURE_TICKETS = tickets;
