// ════════════════════════════════════════════════════════════════════════
//  src/services/metaUsageTracker.ts
//
//  Raw Meta API call counter + usage-header snapshot, durably persisted.
//
//  Tracks cumulative 2xx responses toward the Meta Marketing API Access Tier
//  threshold: ≥500 successful Marketing API calls over a rolling 15-day window
//  with a <15% error rate computed over the LAST 500 calls. Meets those two
//  conditions → the app qualifies to request the higher access tier. Also
//  persists the latest x-app-usage / x-ad-account-usage / x-business-use-case-
//  usage headers for ops visibility, plus a per-category error breakdown.
//
//  ── Why Postgres, not Redis ────────────────────────────────────────────
//
//  Every other Redis consumer in this codebase (queue.ts, redis.ts, the
//  webhook debounce, the session store) degrades to a FUNCTIONALLY EQUIVALENT
//  in-process fallback when Redis is absent — slower or non-cross-instance,
//  never wrong. This module was the one exception: `emptyStats(false)`
//  returns hard zeros, not a fallback. In any environment where REDIS_URL is
//  unset — which has always been true in production; Redis is documented
//  everywhere else as optional — every readiness number reads permanently
//  0/500 forever, not "temporarily degraded". That is not a fallback, it is
//  silent data loss wearing a fallback's clothes. Postgres is not optional
//  in this app the way Redis is, so it is the correct durable home for a
//  counter this module's own callers depend on for a real go/no-go decision.
//
//  Own connection pool, deliberately small (see getStandalonePrisma below):
//  these are tiny, frequent upserts from a fire-and-forget hook deep inside
//  MetaClient's response handling, not a place worth threading the server's
//  main PrismaClient through every call site for.
// ════════════════════════════════════════════════════════════════════════

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { pgSslFor } from '../lib/pgSsl';

// ── Lazy-initialized standalone Prisma client, mirroring getDashboard.ts's
// _standalonePrisma pattern: MetaClient's fire-and-forget hooks have no
// caller-supplied PrismaClient to reuse, and lazy-init keeps this module
// importable in tests/scripts that never call it and have no DATABASE_URL.
let _standalonePrisma: PrismaClient | null = null;

function getStandalonePrisma(): PrismaClient {
  if (_standalonePrisma) return _standalonePrisma;
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) throw new Error('metaUsageTracker: DATABASE_URL is not set.');
  const parsed = new URL(dbUrl);
  const pool = new pg.Pool({
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: pgSslFor(parsed.hostname),
    // Small on purpose: fire-and-forget counter upserts, not query fan-out —
    // this pool never needs to compete with the server's main one for slots.
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _standalonePrisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return _standalonePrisma;
}

// Meta Marketing API Access Tier: ≥500 successful calls over the rolling
// 15-day window.
const UPGRADE_THRESHOLD = 500;
// Meta requires a <15% error rate (over the last 500 calls) to qualify for and
// keep the higher Marketing API access tier. Errors are HTTP status ≥400
// (client + server errors, incl. 429 rate-limits); successes are 2xx.
const ERROR_RATE_GATE_PCT = 15;
// Capped rolling window of the outcome of the most recent Meta calls. Used to
// compute the error rate over the LAST 500 calls exactly the way Meta
// measures it. MetaUsageRecentCall is trimmed to this many rows on insert.
const RECENT_WINDOW = 500;
const SNAPSHOT_ID = 'singleton';

/** The Meta error categories we bucket failures into for the breakdown. */
export type MetaErrorCategory =
  | 'token'          // OAuth/token errors (code 190, 102, 463, 467) — reconnect needed
  | 'rate_limit'     // 429 or code 4/17/32/613 — throttling / quota
  | 'permission'     // 403 or code 10/200-299 — missing scope/permission
  | 'invalid_params' // 400 with a param/validation error (code 100 w/o token subcode)
  | 'server'         // 5xx — Meta-side failure
  | 'other';         // anything else

export interface MetaUsageStats {
  /** Legacy name (kept for wire-compatibility with metaReadinessPage.ts and
   *  metaDataWorkspacePage.ts, which read this field as untyped client JS
   *  with no compiler to catch a rename). Means "was the durable counter
   *  store reachable for this read" — true in virtually every real request,
   *  since Postgres answering is already implied by the route that calls
   *  this having reached this far at all. */
  redisAvailable: boolean;
  callThreshold: number;
  errorRateGatePct: number;
  counts: {
    today: number;
    yesterday: number;
    last7Days: number;
    last15Days: number;
    progressToThresholdPct: number;
    errorsLast15Days: number;
    errorRatePct15d: number;
    /** Number of calls in the rolling last-500 window (may be < 500 early on). */
    recentWindowSize: number;
    /** Error rate over the LAST 500 calls — the exact metric Meta gates on. */
    errorRateLast500: number;
    meetsCallThreshold: boolean;
    meetsErrorGate: boolean;
  };
  /** Per-category error counts over the rolling 15-day window. */
  errorBreakdown15d: Record<MetaErrorCategory, number>;
  latest: {
    appUsage: { callCount: number; totalCpuTime: number; totalTime: number } | null;
    adAccountUsage: { utilizationPct: number; tier: string } | null;
    businessUseCase: Record<string, unknown> | null;
    lastUpdated: string | null;
  };
}

function emptyErrorBreakdown(): Record<MetaErrorCategory, number> {
  return { token: 0, rate_limit: 0, permission: 0, invalid_params: 0, server: 0, other: 0 };
}

function emptyStats(redisAvailable: boolean): MetaUsageStats {
  return {
    redisAvailable,
    callThreshold: UPGRADE_THRESHOLD,
    errorRateGatePct: ERROR_RATE_GATE_PCT,
    counts: {
      today: 0,
      yesterday: 0,
      last7Days: 0,
      last15Days: 0,
      progressToThresholdPct: 0,
      errorsLast15Days: 0,
      errorRatePct15d: 0,
      recentWindowSize: 0,
      errorRateLast500: 0,
      meetsCallThreshold: false,
      meetsErrorGate: false,
    },
    errorBreakdown15d: emptyErrorBreakdown(),
    latest: {
      appUsage: null,
      adAccountUsage: null,
      businessUseCase: null,
      lastUpdated: null,
    },
  };
}

/** Midnight UTC of the given date's calendar day — matches the @db.Date column. */
function utcDateOnly(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function dateDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return utcDateOnly(d);
}

/**
 * Bucket a failed Meta response into one of the MetaErrorCategory values, using
 * the HTTP status plus (when available) the Meta error code from the JSON body.
 * Meta error codes: 190/102/463/467 = token/session; 4/17/32/613 = rate/quota;
 * 10 & 200-299 = permission; 100 = invalid parameter (unless a token subcode).
 */
export function categorizeMetaError(status: number, metaErrorCode?: number): MetaErrorCategory {
  if (metaErrorCode != null) {
    if ([190, 102, 463, 467, 458, 459, 460].includes(metaErrorCode)) return 'token';
    if ([4, 17, 32, 341, 613].includes(metaErrorCode)) return 'rate_limit';
    if (metaErrorCode === 10 || (metaErrorCode >= 200 && metaErrorCode <= 299)) return 'permission';
    if (metaErrorCode === 100) return 'invalid_params';
  }
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status === 401) return 'token';
  if (status === 403) return 'permission';
  if (status === 400) return 'invalid_params';
  return 'other';
}

/**
 * Atomically increment ONE category column on today's daily-counter row.
 * An explicit switch rather than a computed property: Prisma's generated
 * input types are exact-shape, and a `[field]: 1` computed key does not
 * type-check cleanly against them — six cases is cheap insurance against a
 * silently-wrong field name.
 */
async function incrementDailyErrorCategory(
  prisma: PrismaClient, date: Date, category: MetaErrorCategory,
): Promise<void> {
  switch (category) {
    case 'token':
      await prisma.metaUsageDailyCounter.upsert({
        where: { date }, create: { date, errTokenCount: 1 },
        update: { errTokenCount: { increment: 1 } },
      });
      return;
    case 'rate_limit':
      await prisma.metaUsageDailyCounter.upsert({
        where: { date }, create: { date, errRateLimitCount: 1 },
        update: { errRateLimitCount: { increment: 1 } },
      });
      return;
    case 'permission':
      await prisma.metaUsageDailyCounter.upsert({
        where: { date }, create: { date, errPermissionCount: 1 },
        update: { errPermissionCount: { increment: 1 } },
      });
      return;
    case 'invalid_params':
      await prisma.metaUsageDailyCounter.upsert({
        where: { date }, create: { date, errInvalidParamsCount: 1 },
        update: { errInvalidParamsCount: { increment: 1 } },
      });
      return;
    case 'server':
      await prisma.metaUsageDailyCounter.upsert({
        where: { date }, create: { date, errServerCount: 1 },
        update: { errServerCount: { increment: 1 } },
      });
      return;
    case 'other':
      await prisma.metaUsageDailyCounter.upsert({
        where: { date }, create: { date, errOtherCount: 1 },
        update: { errOtherCount: { increment: 1 } },
      });
      return;
  }
}

/**
 * Record a categorized Meta error (in addition to the aggregate error counter
 * incremented by recordMetaResponseHeaders). Fire-and-forget; never throws.
 * Called by MetaClient's error path where the Meta error code is available.
 * This is the SOLE writer of the per-category daily columns — the total
 * error count is derived by summing them, so there is exactly one place a
 * "how many errors today" answer can come from.
 */
export async function recordMetaErrorCategory(
  status: number, metaErrorCode?: number, prisma?: PrismaClient,
): Promise<void> {
  try {
    const category = categorizeMetaError(status, metaErrorCode);
    await incrementDailyErrorCategory(prisma ?? getStandalonePrisma(), utcDateOnly(new Date()), category);
  } catch {
    // never throw — caller is fire-and-forget
  }
}

/**
 * Fire-and-forget hook from MetaClient after every fetch response. Per Meta's
 * tier-upgrade requirements: upserts today's success counter on 2xx responses
 * (toward the 500-call threshold). It also appends the outcome to a capped
 * rolling window (trimmed to RECENT_WINDOW rows) so the error rate over the
 * LAST 500 calls can be computed the way Meta measures it. 3xx redirects are
 * not counted as either (only successful terminal responses are 2xx; only
 * actual errors are ≥400). Always persists usage-header snapshots when
 * present. Each HTTP attempt/retry is a distinct event, matching Meta's own
 * 15-day measurement. Never throws — failures are swallowed.
 */
export async function recordMetaResponseHeaders(
  headers: Headers,
  status?: number,
  injectedPrisma?: PrismaClient,
): Promise<void> {
  try {
    const appUsageRaw = headers.get('x-app-usage');
    const adAccountRaw = headers.get('x-ad-account-usage');
    const businessUseCaseRaw = headers.get('x-business-use-case-usage');

    let appUsage: Record<string, unknown> | undefined;
    let adAccountUsage: Record<string, unknown> | undefined;
    let businessUseCase: Record<string, unknown> | undefined;
    let lastTier: string | undefined;

    if (appUsageRaw) {
      try {
        const parsed = JSON.parse(appUsageRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) appUsage = parsed;
      } catch {
        // ignore malformed header
      }
    }

    if (adAccountRaw) {
      try {
        const parsed = JSON.parse(adAccountRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          adAccountUsage = parsed;
          const tier = (parsed as Record<string, unknown>)['ads_api_access_tier'];
          lastTier = tier === 'standard_access' || tier === 'development' ? tier : 'unknown';
        }
      } catch {
        // ignore malformed header
      }
    }

    if (businessUseCaseRaw) {
      try {
        const parsed = JSON.parse(businessUseCaseRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) businessUseCase = parsed;
      } catch {
        // ignore malformed header
      }
    }

    const is2xx = status !== undefined && status >= 200 && status < 300;
    const isError = status !== undefined && status >= 400;
    const prisma = injectedPrisma ?? getStandalonePrisma();
    const today = utcDateOnly(new Date());
    const ops: Promise<unknown>[] = [];

    if (is2xx) {
      ops.push(prisma.metaUsageDailyCounter.upsert({
        where: { date: today }, create: { date: today, callCount: 1 },
        update: { callCount: { increment: 1 } },
      }));
    }

    if (is2xx || isError) {
      ops.push(
        prisma.metaUsageRecentCall.create({ data: { success: is2xx } }).then(async () => {
          // Trim to the most recent RECENT_WINDOW rows. A soft cap — under
          // concurrent writes this may keep a row or two more/fewer than
          // exactly RECENT_WINDOW, which is immaterial to a threshold gate
          // that is already an approximation of Meta's own measurement.
          const cutoff = await prisma.metaUsageRecentCall.findMany({
            orderBy: { createdAt: 'desc' }, skip: RECENT_WINDOW - 1, take: 1,
            select: { createdAt: true },
          });
          if (cutoff.length) {
            await prisma.metaUsageRecentCall.deleteMany({
              where: { createdAt: { lt: cutoff[0]!.createdAt } },
            });
          }
        }),
      );
    }

    if (appUsage || adAccountUsage || businessUseCase) {
      ops.push(prisma.metaUsageLatestSnapshot.upsert({
        where: { id: SNAPSHOT_ID },
        create: {
          id: SNAPSHOT_ID,
          ...(appUsage ? { appUsage: appUsage as Prisma.InputJsonValue } : {}),
          ...(adAccountUsage ? { adAccountUsage: adAccountUsage as Prisma.InputJsonValue } : {}),
          ...(businessUseCase ? { businessUseCase: businessUseCase as Prisma.InputJsonValue } : {}),
          ...(lastTier ? { lastTier } : {}),
        },
        update: {
          ...(appUsage ? { appUsage: appUsage as Prisma.InputJsonValue } : {}),
          ...(adAccountUsage ? { adAccountUsage: adAccountUsage as Prisma.InputJsonValue } : {}),
          ...(businessUseCase ? { businessUseCase: businessUseCase as Prisma.InputJsonValue } : {}),
          ...(lastTier ? { lastTier } : {}),
        },
      }));
    }

    await Promise.all(ops);
  } catch {
    // never throw — caller is fire-and-forget
  }
}

/** Read cumulative call counts and the latest usage-header snapshot. */
export async function getMetaUsageStats(injectedPrisma?: PrismaClient): Promise<MetaUsageStats> {
  try {
    const prisma = injectedPrisma ?? getStandalonePrisma();
    const today = utcDateOnly(new Date());
    const yesterday = dateDaysAgo(1);
    const since7 = dateDaysAgo(6);
    const since15 = dateDaysAgo(14);

    const [dailyRows, recentCalls, snapshot] = await Promise.all([
      prisma.metaUsageDailyCounter.findMany({ where: { date: { gte: since15 } } }),
      prisma.metaUsageRecentCall.findMany({
        orderBy: { createdAt: 'desc' }, take: RECENT_WINDOW, select: { success: true },
      }),
      prisma.metaUsageLatestSnapshot.findUnique({ where: { id: SNAPSHOT_ID } }),
    ]);

    let todayCount = 0, yesterdayCount = 0, last7Days = 0, last15Days = 0;
    const breakdown = emptyErrorBreakdown();
    for (const r of dailyRows) {
      last15Days += r.callCount;
      if (r.date.getTime() >= since7.getTime()) last7Days += r.callCount;
      if (r.date.getTime() === today.getTime()) todayCount = r.callCount;
      if (r.date.getTime() === yesterday.getTime()) yesterdayCount = r.callCount;
      breakdown.token += r.errTokenCount;
      breakdown.rate_limit += r.errRateLimitCount;
      breakdown.permission += r.errPermissionCount;
      breakdown.invalid_params += r.errInvalidParamsCount;
      breakdown.server += r.errServerCount;
      breakdown.other += r.errOtherCount;
    }
    const errorsLast15Days = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const totalLast15Days = last15Days + errorsLast15Days;
    const errorRatePct15d = totalLast15Days > 0
      ? Math.round((errorsLast15Days / totalLast15Days) * 1000) / 10
      : 0;

    const recentWindowSize = recentCalls.length;
    const recentErrors = recentCalls.reduce((n, c) => n + (c.success ? 0 : 1), 0);
    const errorRateLast500 = recentWindowSize > 0
      ? Math.round((recentErrors / recentWindowSize) * 1000) / 10
      : 0;
    // Only assert the error gate once we have a meaningful sample. Before the
    // window fills, an early error would otherwise spike the rate artificially.
    const meetsErrorGate = recentWindowSize >= RECENT_WINDOW && errorRateLast500 < ERROR_RATE_GATE_PCT;

    const appUsageJson = snapshot?.appUsage as Record<string, unknown> | null | undefined;
    const adAccountUsageJson = snapshot?.adAccountUsage as Record<string, unknown> | null | undefined;
    const businessUseCaseJson = snapshot?.businessUseCase as Record<string, unknown> | null | undefined;

    return {
      redisAvailable: true,
      callThreshold: UPGRADE_THRESHOLD,
      errorRateGatePct: ERROR_RATE_GATE_PCT,
      counts: {
        today: todayCount,
        yesterday: yesterdayCount,
        last7Days,
        last15Days,
        progressToThresholdPct: Math.round((last15Days / UPGRADE_THRESHOLD) * 1000) / 10,
        errorsLast15Days,
        errorRatePct15d,
        recentWindowSize,
        errorRateLast500,
        meetsCallThreshold: last15Days >= UPGRADE_THRESHOLD,
        meetsErrorGate,
      },
      errorBreakdown15d: breakdown,
      latest: {
        appUsage: appUsageJson
          ? {
              callCount: Number(appUsageJson['call_count'] ?? 0),
              totalCpuTime: Number(appUsageJson['total_cputime'] ?? 0),
              totalTime: Number(appUsageJson['total_time'] ?? 0),
            }
          : null,
        adAccountUsage: adAccountUsageJson
          ? {
              utilizationPct: Number(adAccountUsageJson['acc_id_util_pct'] ?? 0),
              tier: String(adAccountUsageJson['ads_api_access_tier'] ?? 'unknown'),
            }
          : null,
        businessUseCase: businessUseCaseJson ?? null,
        lastUpdated: snapshot?.updatedAt ? snapshot.updatedAt.toISOString() : null,
      },
    };
  } catch {
    // The durable store itself is unreachable — extremely rare (this app's
    // whole persistence layer would be failing, not just this reader), but
    // stay honest rather than fabricate a healthy-looking zero.
    return emptyStats(false);
  }
}
