// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/fixtures.ts
//
//  Operator scenarios for the Control Plane acceptance audit.
//
//  ── Why this file is TypeScript, and why that is the whole point ──────
//
//  The previous version was .mjs and its shapes were WRITTEN FROM MEMORY.
//  The meta-usage fixture was `{ callCount, appUsage: {...} }`. Neither field
//  exists on `MetaUsageStats`. The real payload carries three large nested
//  objects — `counts`, `errorBreakdown15d`, `latest` — where the fixture had
//  one small one, so the page's `JSON.stringify(value)` fallback produced a
//  short, visually unremarkable string in the harness and three raw JSON
//  blobs in production. The audit went green on a page that was, in
//  production, dumping serialized objects at an operator.
//
//  So the fixtures are now typed against the ACTUAL service return types.
//  `MetaUsageStats` and `AdminOpsSnapshot` are imported, not described. If a
//  service changes shape, this file stops compiling — which is the only kind
//  of fixture-drift protection that does not depend on someone remembering.
//
//  A fixture that a human wrote from imagination is a test of the imagination.
// ════════════════════════════════════════════════════════════════════════
import type { MetaUsageStats } from '../../src/services/metaUsageTracker';
import type { AdminOpsSnapshot, OpsStatus, SubsystemHealth } from '../../src/services/adminOpsHealth';
import type { PlatformStats } from '../../src/services/getPlatformStats';

const build = { commit: 'a113858ffed1', environment: 'production', source: 'RAILWAY_GIT_COMMIT_SHA' };

const ws = (over: Record<string, unknown> = {}): any => ({
  workspaceId: 'ws_1', workspaceName: 'متجر النخبة', ownerEmail: 'owner@example.com',
  adAccountId: 'aa_1', adAccountName: 'النخبة — الحساب الرئيسي', externalAccountId: 'act_1029384756',
  currency: 'IQD', hasToken: true, tokenSource: 'SYSTEM_USER', tokenExpiresAt: '2026-12-01T00:00:00.000Z',
  metaAccountStatus: 1, lastSyncedAt: '2026-08-22T04:10:00.000Z', lastSyncStatus: 'COMPLETED',
  lastSyncError: null, freshestDataDate: '2026-08-21', dataAgeDays: 1,
  connection: 'HEALTHY', data: 'HEALTHY', overall: 'HEALTHY', headline: 'سليم',
  ...over,
});

const subsystems = (over: Record<string, string> = {}): SubsystemHealth[] => ([
  { key: 'database', status: (over.database as OpsStatus) ?? 'HEALTHY', summary: over.databaseSummary ?? 'يستجيب' },
  { key: 'redis', status: (over.redis as OpsStatus) ?? 'HEALTHY', summary: over.redisSummary ?? 'متصل',
    actionHref: '/admin/meta', actionLabel: 'أثر الانقطاع على عدّادات Meta' },
  { key: 'queue', status: (over.queue as OpsStatus) ?? 'HEALTHY', summary: over.queueSummary ?? 'يقبل المهام' },
  { key: 'workers', status: (over.workers as OpsStatus) ?? 'HEALTHY', summary: over.workersSummary ?? 'مزامنة ناجحة خلال 48 ساعة',
    detail: 'role=combined' },
  { key: 'meta', status: (over.meta as OpsStatus) ?? 'HEALTHY', summary: over.metaSummary ?? '1 حساب متصل',
    actionHref: '/admin#workspaces', actionLabel: 'افحص مساحات العمل' },
  { key: 'intelligence', status: 'NOT_TESTED',
    summary: 'صحة الذكاء تُقاس بالتغطية السردية في لوحة الحالة — لا يوجد فحص حي بعد' },
]);

/**
 * Attention, derived from the workspaces the way `adminOpsHealth` derives it.
 *
 * A hand-written `attention: []` beside a blocked workspace is not a scenario —
 * it is a state the service cannot produce, and it made the Control Center
 * render "nothing needs intervention" directly above a failed account. That is
 * the same fixture-realism failure that let raw JSON ship: the fixture
 * described a platform that does not exist.
 *
 * Mirrors the three per-workspace rules in adminOpsHealth.ts. Scenarios may
 * still pass an explicit list when they are testing the attention queue itself.
 */
function attentionFor(rows: any[]): any[] {
  const items: any[] = [];
  for (const r of rows.filter((x) => x.connection === 'ERROR' || x.connection === 'BLOCKED')) {
    items.push({ id: 'conn:' + r.workspaceId, severity: 'ERROR',
      title: `${r.workspaceName}: ${r.headline}`,
      because: 'لا يمكن سحب أي بيانات من Meta لهذه المساحة حتى يُحلّ السبب.',
      action: 'أعد ربط الحساب من مساحة العميل', href: '/admin/meta#connections' });
  }
  for (const r of rows.filter((x) => x.lastSyncStatus === 'FAILED'
      && x.connection !== 'BLOCKED' && x.connection !== 'ERROR')) {
    items.push({ id: 'sync:' + r.workspaceId, severity: 'WARNING',
      title: `${r.workspaceName}: آخر مزامنة فشلت`,
      because: 'البيانات المعروضة للعميل أقدم مما يظن.',
      ...(r.lastSyncError ? { action: String(r.lastSyncError).slice(0, 120) } : {}),
      href: '/admin/meta#sync' });
  }
  for (const r of rows.filter((x) => x.connection === 'HEALTHY' && x.lastSyncStatus !== 'FAILED'
      && x.dataAgeDays != null && x.dataAgeDays >= 3)) {
    items.push({ id: 'stale:' + r.workspaceId, severity: 'WARNING',
      title: `${r.workspaceName}: بيانات عمرها ${r.dataAgeDays} يوماً`,
      because: 'الاتصال سليم لكن لا بيانات جديدة تصل — قد يكون العمّال أو جدولة المزامنة.',
      href: '/admin/meta#coverage' });
  }
  return items;
}

const ops = (over: Record<string, any> = {}): AdminOpsSnapshot => ({
  computedAt: '2026-08-22T09:15:00.000Z',
  overall: over.overall ?? 'HEALTHY',
  known: over.known ?? ['database', 'redis', 'queue', 'workers', 'meta'],
  unknown: over.unknown ?? ['intelligence'],
  subsystems: over.subsystems ?? subsystems(),
  // Derived unless a scenario deliberately overrides it.
  attention: over.attention ?? attentionFor(over.workspaces ?? [ws()]),
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

/**
 * Platform stats, typed against the real service.
 *
 * This function was `any` and every field in it was invented: `reach` used
 * four names the service does not have, the budgets were pre-formatted
 * STRINGS where the service returns numbers, and `computedAt`, `fromCache`
 * and `lookbackDays` were simply missing. The rendered page said what you
 * would expect from that — four em-dashes under «الوصول», «ليس رقمًا IQD» in
 * the money table, «آخر undefined أيام» and «محسوبة منذ NaN ساعة».
 *
 * None of it was a page defect. All of it was this object, written from
 * memory, in a file whose entire argument is that fixtures must not be. The
 * return type is the fix: the invented names no longer compile.
 */
const stats = (over: Partial<PlatformStats> = {}): PlatformStats => ({
  computedAt: Date.parse('2026-08-22T09:12:00.000Z'),
  fromCache: false,
  reach: {
    totalWorkspaces: 1, totalAdAccounts: 1, activeAdAccounts: 1, activeCampaigns: 12,
    ...(over.reach ?? {}),
  },
  money: over.money ?? {
    byCurrency: [{
      currency: 'IQD', activeCampaigns: 7,
      totalDailyBudgetMajor: 1_250_000, impliedMonthlyMajor: 37_500_000,
    }],
  },
  brain: over.brain ?? {
    snapshotsLastNDays: 34, narrationsLastNDays: 31,
    narrationCoveragePct: 91, lookbackDays: 30,
  },
});

const customers = [
  { id: 'u_1', name: 'علي ناصر', email: 'ali@example.com', tier: 'PREMIUM', workspaceCount: 2 },
  { id: 'u_2', name: 'سارة عبد الله', email: 'sara@example.com', tier: 'FREE', workspaceCount: 1 },
];

/**
 * Support tickets in the shape `adminListTickets` actually returns: the user
 * and workspace RELATIONS are included objects, not flattened `userEmail` and
 * `workspaceName` strings, and each row carries `_count.messages`.
 *
 * The flattened version was another fixture written from memory. It made the
 * inbox render "—" for every requester and, because the harness also returned
 * a bare array where the service returns `{ tickets, total, take, skip }`, an
 * empty list beside a filter strip that said two tickets needed a reply.
 */
const tickets = [
  { id: 't_1', subject: 'الأرقام لا تطابق مدير الإعلانات', status: 'OPEN', priority: 'URGENT',
    category: 'BUG', isPinned: false, isStarred: false, unreadForAdmin: true,
    createdAt: '2026-08-22T08:00:00.000Z', updatedAt: '2026-08-22T08:20:00.000Z',
    user: { id: 'u_1', name: 'علي ناصر', email: 'ali@example.com' },
    workspace: { id: 'ws_1', name: 'متجر النخبة', tier: 'PREMIUM', subscriptionStatus: 'ACTIVE' },
    _count: { messages: 2 } },
  { id: 't_2', subject: 'كيف أربط حساباً ثانياً؟', status: 'AWAITING_CUSTOMER', priority: 'NORMAL',
    category: 'QUESTION', isPinned: false, isStarred: true, unreadForAdmin: false,
    createdAt: '2026-08-20T11:00:00.000Z', updatedAt: '2026-08-21T09:30:00.000Z',
    user: { id: 'u_2', name: 'سارة عبد الله', email: 'sara@example.com' },
    workspace: { id: 'ws_2', name: 'سارة ستور', tier: 'FREE', subscriptionStatus: 'TRIAL' },
    _count: { messages: 1 } },
  { id: 't_3', subject: 'الفاتورة الأخيرة لم تصل', status: 'OPEN', priority: 'HIGH',
    category: 'PAYMENT', isPinned: true, isStarred: false, unreadForAdmin: true,
    createdAt: '2026-08-19T15:40:00.000Z', updatedAt: '2026-08-22T07:05:00.000Z',
    user: { id: 'u_1', name: 'علي ناصر', email: 'ali@example.com' },
    workspace: { id: 'ws_1', name: 'متجر النخبة', tier: 'PREMIUM', subscriptionStatus: 'ACTIVE' },
    _count: { messages: 4 } },
];

/**
 * Meta usage, typed against the real service.
 *
 * THIS is the payload the previous fixture got wrong. Three nested objects,
 * not one — and every field name here is a Meta-quota implementation detail
 * (`errorRateGatePct`, `meetsErrorGate`, `recentWindowSize`) that means
 * nothing to an operator until the UI translates it.
 */
const usage = (over: Partial<MetaUsageStats> = {}): MetaUsageStats => ({
  redisAvailable: true,
  callThreshold: 500,
  errorRateGatePct: 15,
  counts: {
    today: 128, yesterday: 341, last7Days: 1_842, last15Days: 3_106,
    progressToThresholdPct: 621.2,
    errorsLast15Days: 47, errorRatePct15d: 1.5,
    recentWindowSize: 500, errorRateLast500: 1.2,
    meetsCallThreshold: true, meetsErrorGate: true,
    ...(over.counts ?? {}),
  },
  errorBreakdown15d: {
    token: 4, rate_limit: 19, permission: 6, invalid_params: 11, server: 5, other: 2,
    ...(over.errorBreakdown15d ?? {}),
  },
  latest: {
    appUsage: { callCount: 12, totalCpuTime: 3, totalTime: 5 },
    adAccountUsage: { utilizationPct: 18, tier: 'STANDARD' },
    businessUseCase: null,
    lastUpdated: '2026-08-22T09:02:00.000Z',
    ...(over.latest ?? {}),
  },
  ...(over.redisAvailable !== undefined ? { redisAvailable: over.redisAvailable } : {}),
});

/** Redis down: the tracker returns its empty shape, and every counter is a lie if shown as 0. */
const usageNoRedis = (): MetaUsageStats => ({
  redisAvailable: false,
  callThreshold: 500,
  errorRateGatePct: 15,
  counts: {
    today: 0, yesterday: 0, last7Days: 0, last15Days: 0, progressToThresholdPct: 0,
    errorsLast15Days: 0, errorRatePct15d: 0, recentWindowSize: 0, errorRateLast500: 0,
    meetsCallThreshold: false, meetsErrorGate: false,
  },
  errorBreakdown15d: { token: 0, rate_limit: 0, permission: 0, invalid_params: 0, server: 0, other: 0 },
  latest: { appUsage: null, adAccountUsage: null, businessUseCase: null, lastUpdated: null },
});

export const USAGE = {
  healthy: usage(),
  noRedis: usageNoRedis(),
  zeroCalls: usage({
    counts: {
      today: 0, yesterday: 0, last7Days: 0, last15Days: 0, progressToThresholdPct: 0,
      errorsLast15Days: 0, errorRatePct15d: 0, recentWindowSize: 0, errorRateLast500: 0,
      meetsCallThreshold: false, meetsErrorGate: false,
    },
    latest: { appUsage: null, adAccountUsage: null, businessUseCase: null, lastUpdated: null },
  }),
  highErrorRate: usage({
    counts: {
      today: 96, yesterday: 402, last7Days: 1_501, last15Days: 2_804,
      progressToThresholdPct: 560.8,
      errorsLast15Days: 812, errorRatePct15d: 22.5,
      recentWindowSize: 500, errorRateLast500: 24.6,
      meetsCallThreshold: true, meetsErrorGate: false,
    },
    errorBreakdown15d: { token: 61, rate_limit: 540, permission: 128, invalid_params: 44, server: 33, other: 6 },
  }),
};

/** Every scenario. `api` maps a route prefix to a response or an HTTP failure. */
export const SCENARIOS: Record<string, { label: string; api: Record<string, unknown> }> = {
  healthy: {
    label: 'Healthy system',
    api: { ops: ops(), stats: stats(), metaUsage: USAGE.healthy },
  },

  meta_disconnected: {
    label: 'Meta disconnected',
    api: {
      metaUsage: USAGE.healthy,
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
      metaUsage: USAGE.highErrorRate,
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
      metaUsage: USAGE.noRedis,
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
      stats: stats({
        reach: { totalWorkspaces: 0, totalAdAccounts: 0, activeAdAccounts: 0, activeCampaigns: 0 },
        money: { byCurrency: [] },
        brain: { snapshotsLastNDays: 0, narrationsLastNDays: 0, narrationCoveragePct: null, lookbackDays: 30 },
      }),
      metaUsage: USAGE.zeroCalls,
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
      stats: stats({ reach: { totalWorkspaces: 3, totalAdAccounts: 3, activeAdAccounts: 2, activeCampaigns: 31 } }),
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
      stats: stats({ brain: { snapshotsLastNDays: 0, narrationsLastNDays: 0, narrationCoveragePct: null, lookbackDays: 30 } }),
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
