// ════════════════════════════════════════════════════════════════════════
//  src/services/adminOpsHealth.ts
//
//  The evidence layer behind the Admin Operations Console.
//
//  DESIGN RULE — this module reports only what it can OBSERVE.
//  Every subsystem resolves to one of a fixed status vocabulary, and
//  `UNKNOWN` is a first-class answer meaning "we could not determine this",
//  never a quiet substitute for "fine". A console that cannot tell those
//  apart teaches its operator to distrust every green light on it.
//
//  Frozen-boundary note: nothing here reads or re-derives a metric. It
//  reports plumbing state (does the DB answer, is Redis connected, when did
//  a sync last succeed) — measurement and intelligence semantics are
//  untouched.
// ════════════════════════════════════════════════════════════════════════
import type { PrismaClient } from '@prisma/client';

import { config } from '../config';
import { isQueueEnabled, lastQueueError } from '../lib/queue';
import { isRedisHealthy, lastRedisError } from '../lib/redis';

/**
 * The console's whole status vocabulary. Deliberately small: every extra
 * word is another thing the operator has to learn, and an operator who has
 * to think about what a badge means is not reading the badge.
 *
 * Ordered by severity so `worstOf()` can just take the max index.
 */
export const OPS_STATUSES = [
  'HEALTHY',    // observed working
  'RUNNING',    // work in flight, nothing wrong
  'UNKNOWN',    // we could NOT determine this — not a synonym for healthy
  'NOT_TESTED', // nobody has asked yet (probe-style: an absence of evidence)
  'DEGRADED',   // working, but below what it should be
  'WARNING',    // needs a human eventually
  'BLOCKED',    // cannot proceed without an operator action
  'ERROR',      // observed broken
] as const;
export type OpsStatus = (typeof OPS_STATUSES)[number];

const SEVERITY: Record<OpsStatus, number> = {
  HEALTHY: 0, RUNNING: 1, UNKNOWN: 2, NOT_TESTED: 3,
  DEGRADED: 4, WARNING: 5, BLOCKED: 6, ERROR: 7,
};

export function worstOf(statuses: OpsStatus[]): OpsStatus {
  let worst: OpsStatus = 'HEALTHY';
  for (const s of statuses) if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  return worst;
}

export interface SubsystemHealth {
  /** Stable machine key — the UI maps this to an Arabic label. */
  key: 'database' | 'redis' | 'queue' | 'workers' | 'meta' | 'intelligence';
  status: OpsStatus;
  /** One short Arabic clause the operator can read without expanding. */
  summary: string;
  /** Optional LTR technical line (error text, host, code). Never a secret. */
  detail?: string;
  /** Where to go to act on this, when there is somewhere. */
  actionHref?: string;
  actionLabel?: string;
}

export interface AttentionItem {
  id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  /** Why this matters — impact, not restatement of the title. */
  because: string;
  /** The single next action. */
  action?: string;
  href?: string;
}

export interface WorkspaceOpsRow {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string | null;
  /** null when the workspace has no ad account at all. */
  adAccountId: string | null;
  adAccountName: string | null;
  externalAccountId: string | null;
  currency: string | null;
  /** Whether a usable token is stored — NEVER the token itself. */
  hasToken: boolean;
  tokenSource: string | null;
  tokenExpiresAt: string | null;
  /** Meta's own account_status integer, when we have synced it. */
  metaAccountStatus: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  /** Most recent daily_stats date we hold for this account. */
  freshestDataDate: string | null;
  /** Whole days between freshestDataDate and today; null when no data. */
  dataAgeDays: number | null;
  connection: OpsStatus;
  data: OpsStatus;
  overall: OpsStatus;
  /** Short Arabic phrase naming the worst thing about this row. */
  headline: string;
}

export interface AdminOpsSnapshot {
  computedAt: string;
  /**
   * Worst status among subsystems we could actually OBSERVE.
   *
   * Deliberately excludes UNKNOWN and NOT_TESTED, because folding them in
   * makes one scalar carry two incompatible claims. A single value can say
   * "something is broken" or "nothing we checked is broken" — it cannot also
   * say "and here is what we never checked". That belongs in `unknown`, and
   * an audit caught this console claiming plain health while a subsystem was
   * untested, which is exactly the manufactured certainty it exists to avoid.
   */
  overall: OpsStatus;
  /** Subsystem keys whose state was positively observed. */
  known: string[];
  /** Subsystem keys we could NOT determine — never counted as healthy. */
  unknown: string[];
  subsystems: SubsystemHealth[];
  attention: AttentionItem[];
  workspaces: WorkspaceOpsRow[];
}

/** True when a status means "we did not find out", not "we found it fine". */
export function isUndetermined(s: OpsStatus): boolean {
  return s === 'UNKNOWN' || s === 'NOT_TESTED';
}

const DAY_MS = 86_400_000;

/** Whole days elapsed, floor. Negative clamps to 0 (clock skew, future rows). */
function daysSince(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Build the whole console snapshot in a bounded number of queries.
 *
 * Deliberately NOT one giant include: the ad-account list is the spine, and
 * the sync/freshness lookups are two grouped queries over it. An admin page
 * that costs a query per workspace stops being usable exactly when the
 * platform grows enough to need it.
 */
export async function getAdminOpsSnapshot(prisma: PrismaClient): Promise<AdminOpsSnapshot> {
  // ── 1. Database ────────────────────────────────────────────────────────
  let dbStatus: OpsStatus = 'UNKNOWN';
  let dbDetail: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'HEALTHY';
  } catch (err) {
    dbStatus = 'ERROR';
    dbDetail = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
  }

  // ── 2. Workspaces + accounts (the spine) ───────────────────────────────
  //
  // THE TRAP THIS GUARDS: this snapshot both REPORTS ON the database and
  // READS FROM it. When the database is down every query below throws, the
  // route returns a generic 500, and the operator — who opened the console
  // precisely BECAUSE something is broken — learns nothing about what.
  //
  // So a database failure short-circuits into a snapshot that still answers.
  // Every other subsystem degrades to UNKNOWN rather than HEALTHY: with an
  // unreadable database we have no evidence about them either, and a green
  // badge resting on an unread query is the exact lie this console forbids.
  if (dbStatus !== 'HEALTHY') {
    const blind: SubsystemHealth[] = [
      {
        key: 'database', status: 'ERROR',
        summary: 'لا يستجيب — لا يمكن قراءة أي حالة أخرى بثقة',
        ...(dbDetail ? { detail: dbDetail } : {}),
      },
      ...(['redis', 'queue', 'workers', 'meta', 'intelligence'] as const).map((key) => ({
        key,
        status: 'UNKNOWN' as OpsStatus,
        summary: 'غير معروف — تعذّرت قراءة قاعدة البيانات',
      })),
    ];
    return {
      computedAt: new Date().toISOString(),
      overall: 'ERROR',
      known: ['database'],
      unknown: ['redis', 'queue', 'workers', 'meta', 'intelligence'],
      subsystems: blind,
      attention: [{
        id: 'db', severity: 'ERROR',
        title: 'قاعدة البيانات لا تستجيب',
        because: 'كل شيء في المنصة يتوقف — لا قراءة ولا كتابة. وبقية حالات النظام غير معروفة لأنها تُقرأ من القاعدة نفسها.',
        action: 'افحص خدمة Postgres في Railway',
      }],
      workspaces: [],
    };
  }

  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      members: {
        where: { role: 'OWNER' },
        select: { user: { select: { email: true } } },
        take: 1,
      },
      adAccounts: {
        select: {
          id: true, name: true, externalAccountId: true, currency: true,
          status: true, accessTokenEncrypted: true, connectionId: true,
          tokenSource: true, tokenExpiresAt: true, lastSyncedAt: true,
          metaAccountStatus: true, metaDisableReason: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const accountIds = workspaces.flatMap((w) => w.adAccounts.map((a) => a.id));

  // Latest sync job per account, and freshest daily row per account —
  // two grouped queries rather than 2×N.
  const [latestSyncs, freshest] = await Promise.all([
    accountIds.length
      ? prisma.syncJob.findMany({
          where: { adAccountId: { in: accountIds } },
          orderBy: { createdAt: 'desc' },
          select: { adAccountId: true, status: true, error: true, createdAt: true, completedAt: true },
          take: Math.min(accountIds.length * 4, 400),
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.dailyStat.groupBy({
          by: ['entityId'],
          where: { entityType: 'ACCOUNT', entityId: { in: accountIds } },
          _max: { date: true },
        })
      : Promise.resolve([] as { entityId: string; _max: { date: Date | null } }[]),
  ]);

  const syncByAccount = new Map<string, (typeof latestSyncs)[number]>();
  for (const s of latestSyncs) if (!syncByAccount.has(s.adAccountId)) syncByAccount.set(s.adAccountId, s);
  const freshestByAccount = new Map<string, Date | null>();
  for (const f of freshest) freshestByAccount.set(f.entityId, f._max.date ?? null);

  // ── 3. Per-workspace rows ──────────────────────────────────────────────
  const rows: WorkspaceOpsRow[] = workspaces.map((w) => {
    const acct = w.adAccounts[0] ?? null;
    const ownerEmail = w.members[0]?.user.email ?? null;

    if (!acct) {
      return {
        workspaceId: w.id, workspaceName: w.name, ownerEmail,
        adAccountId: null, adAccountName: null, externalAccountId: null, currency: null,
        hasToken: false, tokenSource: null, tokenExpiresAt: null, metaAccountStatus: null,
        lastSyncedAt: null, lastSyncStatus: null, lastSyncError: null,
        freshestDataDate: null, dataAgeDays: null,
        // No account is a SETUP state, not a failure: nothing is broken, the
        // workspace simply has not been connected yet.
        connection: 'NOT_TESTED', data: 'NOT_TESTED', overall: 'NOT_TESTED',
        headline: 'بلا حساب إعلاني — لم يُربط بعد',
      };
    }

    const hasToken = Boolean(acct.accessTokenEncrypted) || Boolean(acct.connectionId);
    const expired = acct.tokenExpiresAt ? acct.tokenExpiresAt.getTime() < Date.now() : false;
    const sync = syncByAccount.get(acct.id) ?? null;
    const fresh = freshestByAccount.get(acct.id) ?? null;
    const ageDays = daysSince(fresh);

    // Connection: the token/account axis only.
    let connection: OpsStatus = 'HEALTHY';
    let headline = 'سليم';
    if (!hasToken) { connection = 'BLOCKED'; headline = 'بلا رمز Meta محفوظ — أعد الربط'; }
    else if (expired) { connection = 'BLOCKED'; headline = 'انتهت صلاحية رمز Meta'; }
    else if (acct.metaAccountStatus != null && acct.metaAccountStatus !== 1) {
      // Meta's own verdict on the ad account outranks ours: an unsettled or
      // disabled account delivers nothing no matter how healthy our plumbing is.
      connection = 'BLOCKED';
      headline = `حساب Meta غير نشط (الحالة ${acct.metaAccountStatus})`;
    } else if (acct.status !== 'ACTIVE') { connection = 'WARNING'; headline = 'الحساب الإعلاني غير نشط عندنا'; }

    // Data: the freshness axis only. Kept separate because a live token with
    // stale data and a dead token are different incidents with different fixes.
    let data: OpsStatus;
    if (ageDays == null) { data = 'NOT_TESTED'; if (connection === 'HEALTHY') headline = 'لا توجد بيانات مُزامَنة بعد'; }
    else if (ageDays <= 1) data = 'HEALTHY';
    else if (ageDays <= 3) { data = 'DEGRADED'; if (connection === 'HEALTHY') headline = `أحدث بيانات عمرها ${ageDays} يوم`; }
    else { data = 'WARNING'; if (connection === 'HEALTHY') headline = `بيانات قديمة — ${ageDays} يوماً بلا تحديث`; }

    if (sync?.status === 'FAILED' && connection === 'HEALTHY') {
      headline = 'آخر مزامنة فشلت';
    }

    const overall = worstOf([
      connection,
      data,
      sync?.status === 'FAILED' ? 'ERROR' : 'HEALTHY',
    ]);

    return {
      workspaceId: w.id, workspaceName: w.name, ownerEmail,
      adAccountId: acct.id, adAccountName: acct.name,
      externalAccountId: acct.externalAccountId, currency: acct.currency,
      hasToken, tokenSource: acct.tokenSource, tokenExpiresAt: iso(acct.tokenExpiresAt),
      metaAccountStatus: acct.metaAccountStatus,
      lastSyncedAt: iso(acct.lastSyncedAt),
      lastSyncStatus: sync?.status ?? null,
      lastSyncError: sync?.error ? sync.error.slice(0, 300) : null,
      freshestDataDate: fresh ? fresh.toISOString().slice(0, 10) : null,
      dataAgeDays: ageDays,
      connection, data, overall, headline,
    };
  });

  // ── 4. Subsystems ──────────────────────────────────────────────────────
  const redisOk = isRedisHealthy();
  const redisErr = lastRedisError();
  const redisConfigured = Boolean(config.redis.url);
  const queueOn = isQueueEnabled();
  const queueErr = lastQueueError();

  const connected = rows.filter((r) => r.adAccountId);
  const blockedConns = connected.filter((r) => r.connection === 'BLOCKED');
  const staleData = connected.filter((r) => r.data === 'WARNING');
  const failedSyncs = rows.filter((r) => r.lastSyncStatus === 'FAILED');

  const subsystems: SubsystemHealth[] = [
    {
      key: 'database',
      status: dbStatus,
      summary: dbStatus === 'HEALTHY' ? 'يستجيب' : 'لا يستجيب',
      ...(dbDetail ? { detail: dbDetail } : {}),
    },
    {
      key: 'redis',
      status: !redisConfigured ? 'NOT_TESTED' : redisOk ? 'HEALTHY' : 'ERROR',
      summary: !redisConfigured
        ? 'غير مضبوط — العدّادات والأقفال تعمل بالبدائل داخل العملية'
        : redisOk ? 'متصل' : 'غير متصل — العدّادات تقرأ صفراً',
      ...(redisErr && !redisOk ? { detail: redisErr.slice(0, 200) } : {}),
      actionHref: '/admin/meta-readiness',
      actionLabel: 'أثر الانقطاع على عدّادات Meta',
    },
    {
      key: 'queue',
      status: !config.features.bullmqEnabled ? 'NOT_TESTED' : queueOn ? 'HEALTHY' : 'ERROR',
      summary: !config.features.bullmqEnabled
        ? 'الطابور معطّل بالإعداد — المزامنة تعمل داخل العملية'
        : queueOn ? 'يقبل المهام' : 'لا يقبل المهام — المزامنة الخلفية متوقفة',
      ...(queueErr && !queueOn ? { detail: queueErr.slice(0, 200) } : {}),
    },
    {
      key: 'workers',
      // We can observe whether THIS process runs background work, and whether
      // any sync ran recently. We cannot observe a separate worker service's
      // liveness from here — so when nothing ran we say UNKNOWN, not ERROR.
      status: (() => {
        if (failedSyncs.length && failedSyncs.length === connected.length && connected.length > 0) return 'ERROR';
        const anyRecent = rows.some((r) => r.lastSyncedAt && Date.now() - Date.parse(r.lastSyncedAt) < 2 * DAY_MS);
        if (anyRecent) return 'HEALTHY';
        if (connected.length === 0) return 'NOT_TESTED';
        return 'UNKNOWN';
      })(),
      summary: (() => {
        const anyRecent = rows.some((r) => r.lastSyncedAt && Date.now() - Date.parse(r.lastSyncedAt) < 2 * DAY_MS);
        if (connected.length === 0) return 'لا حساب مرتبط — لا عمل خلفي متوقع';
        if (anyRecent) return 'مزامنة ناجحة خلال 48 ساعة';
        return 'لا مزامنة خلال 48 ساعة — لا نستطيع تأكيد عمل العمّال من هنا';
      })(),
      detail: `role=${config.role}`,
    },
    {
      key: 'meta',
      status: connected.length === 0
        ? 'NOT_TESTED'
        : blockedConns.length === connected.length ? 'ERROR'
        : blockedConns.length ? 'WARNING' : 'HEALTHY',
      summary: connected.length === 0
        ? 'لا حساب إعلاني مرتبط في المنصة'
        : blockedConns.length
          ? `${blockedConns.length} من ${connected.length} حساب محجوب`
          : `${connected.length} حساب متصل`,
      actionHref: '/admin#workspaces',
      actionLabel: 'افحص مساحات العمل',
    },
    {
      key: 'intelligence',
      // Deliberately NOT_TESTED rather than a fabricated score: narration
      // coverage lives in platform-stats and is shown there. Claiming an
      // intelligence health number here without measuring it is the exact
      // manufactured certainty this console exists to avoid.
      status: 'NOT_TESTED',
      summary: 'صحة الذكاء تُقاس بالتغطية السردية في لوحة الحالة — لا يوجد فحص حي بعد',
    },
  ];

  // ── 5. Attention queue — ONLY things a human must act on ───────────────
  // (A database outage is handled by the short-circuit above and can no
  // longer reach here — tsc proved the old branch unreachable.)
  const attention: AttentionItem[] = [];
  if (redisConfigured && !redisOk) {
    attention.push({
      id: 'redis', severity: 'ERROR',
      title: 'Redis غير متصل',
      because: 'عدّادات استخدام Meta تقرأ صفراً، والأقفال والطوابير تعمل ببدائل داخل العملية فقط.',
      action: 'افحص REDIS_URL وسجلّ الإقلاع',
      href: '/admin/meta-readiness',
    });
  }
  if (config.features.bullmqEnabled && !queueOn) {
    attention.push({
      id: 'queue', severity: 'ERROR',
      title: 'طابور المهام لا يقبل مهاماً',
      because: 'المزامنة والصيانة ومعالجة الذكاء لا تعمل، والتطبيق يبدو سليماً رغم ذلك.',
      action: 'افحص اتصال Redis المخصص للطابور',
    });
  }
  for (const r of blockedConns) {
    attention.push({
      id: 'conn:' + r.workspaceId, severity: 'ERROR',
      title: `${r.workspaceName}: ${r.headline}`,
      because: 'لا يمكن سحب أي بيانات من Meta لهذه المساحة حتى يُحلّ السبب.',
      action: 'أعد ربط الحساب من مساحة العميل',
      href: '/admin#workspaces',
    });
  }
  for (const r of failedSyncs.filter((x) => x.connection !== 'BLOCKED')) {
    attention.push({
      id: 'sync:' + r.workspaceId, severity: 'WARNING',
      title: `${r.workspaceName}: آخر مزامنة فشلت`,
      because: 'البيانات المعروضة للعميل أقدم مما يظن.',
      ...(r.lastSyncError ? { action: r.lastSyncError.slice(0, 120) } : {}),
      href: '/admin#workspaces',
    });
  }
  for (const r of staleData.filter((x) => x.connection === 'HEALTHY' && x.lastSyncStatus !== 'FAILED')) {
    attention.push({
      id: 'stale:' + r.workspaceId, severity: 'WARNING',
      title: `${r.workspaceName}: بيانات عمرها ${r.dataAgeDays} يوماً`,
      because: 'الاتصال سليم لكن لا بيانات جديدة تصل — قد يكون العمّال أو جدولة المزامنة.',
      href: '/admin#workspaces',
    });
  }

  const observed = subsystems.filter((s) => !isUndetermined(s.status));
  return {
    computedAt: new Date().toISOString(),
    overall: worstOf(observed.map((s) => s.status)),
    known: observed.map((s) => s.key),
    unknown: subsystems.filter((s) => isUndetermined(s.status)).map((s) => s.key),
    subsystems,
    attention,
    workspaces: rows,
  };
}
