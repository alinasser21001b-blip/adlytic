// ════════════════════════════════════════════════════════════════════════
//  src/services/metaUsageTracker.ts
//
//  Phase A2 — raw Meta API call counter + usage-header snapshot in Redis.
//
//  Tracks cumulative 2xx responses toward the Meta Marketing API Access Tier
//  threshold: ≥500 successful Marketing API calls over a rolling 15-day window
//  with a <15% error rate computed over the LAST 500 calls. Meets those two
//  conditions → the app qualifies to request the higher access tier. Also
//  persists the latest x-app-usage / x-ad-account-usage / x-business-use-case-
//  usage headers for ops visibility, plus a per-category error breakdown.
//
//  All Redis writes go through withRedis(); when Redis is unavailable every
//  function degrades to a no-op (record) or zeroed stats (read).
// ════════════════════════════════════════════════════════════════════════

import { withRedis } from '../lib/redis';
import type { Redis } from 'ioredis';

const COUNT_KEY_PREFIX = 'meta:usage:count:';
const ERROR_KEY_PREFIX = 'meta:usage:error:';
// Per-category daily error counters (breakdown by Meta failure type). Key shape:
// `${ERROR_CAT_KEY_PREFIX}${category}:${YYYY-MM-DD}`.
const ERROR_CAT_KEY_PREFIX = 'meta:usage:errcat:';
// Capped rolling log of the outcome ('ok' | 'err') of the most recent Meta
// calls, newest first. Used to compute the error rate over the LAST 500 calls
// exactly the way Meta measures it.
const RECENT_KEY = 'meta:usage:recent';
const RECENT_WINDOW = 500;
const LATEST_KEY = 'meta:usage:latest';
const COUNT_TTL_SECONDS = 30 * 86400;
// Meta Marketing API Access Tier: ≥500 successful calls over the rolling
// 15-day window.
const UPGRADE_THRESHOLD = 500;
// Meta requires a <15% error rate (over the last 500 calls) to qualify for and
// keep the higher Marketing API access tier. Errors are HTTP status ≥400
// (client + server errors, incl. 429 rate-limits); successes are 2xx.
const ERROR_RATE_GATE_PCT = 15;

/** The Meta error categories we bucket failures into for the breakdown. */
export type MetaErrorCategory =
  | 'token'          // OAuth/token errors (code 190, 102, 463, 467) — reconnect needed
  | 'rate_limit'     // 429 or code 4/17/32/613 — throttling / quota
  | 'permission'     // 403 or code 10/200-299 — missing scope/permission
  | 'invalid_params' // 400 with a param/validation error (code 100 w/o token subcode)
  | 'server'         // 5xx — Meta-side failure
  | 'other';         // anything else

type StatsData = {
  today: string | null;
  yesterday: string | null;
  last7Days: number;
  last15Days: number;
  errorsLast15Days: number;
  recent: string[];
  breakdown: Record<MetaErrorCategory, number>;
  hash: Record<string, string>;
};

type LastTier = 'standard_access' | 'development' | 'unknown';

export interface MetaUsageStats {
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

function countKey(date: Date): string {
  return `${COUNT_KEY_PREFIX}${date.toISOString().slice(0, 10)}`;
}

function errorCountKey(date: Date): string {
  return `${ERROR_KEY_PREFIX}${date.toISOString().slice(0, 10)}`;
}

function dateDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function parseLastTier(tier: unknown): LastTier {
  if (tier === 'standard_access' || tier === 'development') return tier;
  return 'unknown';
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

function errorCatKey(category: MetaErrorCategory, date: Date): string {
  return `${ERROR_CAT_KEY_PREFIX}${category}:${date.toISOString().slice(0, 10)}`;
}

/**
 * Record a categorized Meta error (in addition to the aggregate error counter
 * incremented by recordMetaResponseHeaders). Fire-and-forget; never throws.
 * Called by MetaClient's error path where the Meta error code is available.
 */
export async function recordMetaErrorCategory(status: number, metaErrorCode?: number): Promise<void> {
  try {
    const category = categorizeMetaError(status, metaErrorCode);
    const key = errorCatKey(category, new Date());
    await withRedis(async (r) => {
      const multi = r.multi();
      multi.incr(key);
      multi.expire(key, COUNT_TTL_SECONDS);
      await multi.exec();
    }, null);
  } catch {
    // never throw — caller is fire-and-forget
  }
}

function parseLatestAppUsage(
  raw: string | undefined,
): MetaUsageStats['latest']['appUsage'] {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      callCount: Number(obj.call_count ?? 0),
      totalCpuTime: Number(obj.total_cputime ?? 0),
      totalTime: Number(obj.total_time ?? 0),
    };
  } catch {
    return null;
  }
}

function parseLatestAdAccountUsage(
  raw: string | undefined,
): MetaUsageStats['latest']['adAccountUsage'] {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      utilizationPct: Number(obj.acc_id_util_pct ?? 0),
      tier: String(obj.ads_api_access_tier ?? 'unknown'),
    };
  } catch {
    return null;
  }
}

function parseLatestBusinessUseCase(
  raw: string | undefined,
): MetaUsageStats['latest']['businessUseCase'] {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function sumDayCounts(
  r: Redis,
  days: number,
  keyFn: (d: Date) => string = countKey,
): Promise<number> {
  const keys = Array.from({ length: days }, (_, i) => keyFn(dateDaysAgo(i)));
  const values = await r.mget(...keys);
  return values.reduce((sum, v) => sum + (v ? parseInt(v, 10) : 0), 0);
}

/**
 * Fire-and-forget hook from MetaClient after every fetch response. Per Meta's
 * tier-upgrade requirements: INCRs the daily success counter on 2xx responses
 * (toward the 500-call threshold) and the daily error counter on status >= 400
 * (client errors 4xx + server errors 5xx, including 429 rate-limits, used to
 * calculate the <15% error-rate gate). It also appends the outcome to a capped
 * rolling window so the error rate over the LAST 500 calls can be computed the
 * way Meta measures it. 3xx redirects are not counted as either (only successful
 * terminal responses are 2xx; only actual errors are ≥400). Always persists
 * usage-header snapshots when present. Each HTTP attempt/retry is a distinct
 * event, matching Meta's own 15-day measurement. Never throws — failures are
 * swallowed via withRedis fallback.
 */
export async function recordMetaResponseHeaders(
  headers: Headers,
  status?: number,
): Promise<void> {
  try {
    const appUsageRaw = headers.get('x-app-usage');
    const adAccountRaw = headers.get('x-ad-account-usage');
    const businessUseCaseRaw = headers.get('x-business-use-case-usage');

    let appUsage: string | undefined;
    let adAccountUsage: string | undefined;
    let businessUseCase: string | undefined;
    let lastTier: LastTier = 'unknown';

    if (appUsageRaw) {
      try {
        JSON.parse(appUsageRaw);
        appUsage = appUsageRaw;
      } catch {
        // ignore malformed header
      }
    }

    if (adAccountRaw) {
      try {
        const parsed = JSON.parse(adAccountRaw) as Record<string, unknown>;
        adAccountUsage = adAccountRaw;
        lastTier = parseLastTier(parsed.ads_api_access_tier);
      } catch {
        // ignore malformed header
      }
    }

    if (businessUseCaseRaw) {
      try {
        JSON.parse(businessUseCaseRaw);
        businessUseCase = businessUseCaseRaw;
      } catch {
        // ignore malformed header
      }
    }

    const is2xx = status !== undefined && status >= 200 && status < 300;
    const isError = status !== undefined && status >= 400;
    const now = new Date();
    const todayKey = countKey(now);
    const todayErrorKey = errorCountKey(now);
    const hasSnapshot = appUsage !== undefined
      || adAccountUsage !== undefined
      || businessUseCase !== undefined;

    await withRedis(async (r) => {
      const multi = r.multi();

      if (is2xx) {
        multi.incr(todayKey);
        multi.expire(todayKey, COUNT_TTL_SECONDS);
      } else if (isError) {
        multi.incr(todayErrorKey);
        multi.expire(todayErrorKey, COUNT_TTL_SECONDS);
      }

      // Maintain the capped rolling window of the last RECENT_WINDOW outcomes
      // (newest first) so we can compute Meta's "error rate over the last 500
      // calls" exactly. Only terminal outcomes (2xx or ≥400) are recorded.
      if (is2xx || isError) {
        multi.lpush(RECENT_KEY, is2xx ? 'ok' : 'err');
        multi.ltrim(RECENT_KEY, 0, RECENT_WINDOW - 1);
        multi.expire(RECENT_KEY, COUNT_TTL_SECONDS);
      }

      if (hasSnapshot) {
        const hashFields: Record<string, string> = {
          lastUpdated: now.toISOString(),
          lastTier,
        };
        if (appUsage) hashFields.appUsage = appUsage;
        if (adAccountUsage) hashFields.adAccountUsage = adAccountUsage;
        if (businessUseCase) hashFields.businessUseCase = businessUseCase;
        multi.hset(LATEST_KEY, hashFields);
      }

      await multi.exec();
    }, null);
  } catch {
    // never throw — caller is fire-and-forget
  }
}

/** Read cumulative call counts and the latest usage-header snapshot. */
export async function getMetaUsageStats(): Promise<MetaUsageStats> {
  const categories: MetaErrorCategory[] = ['token', 'rate_limit', 'permission', 'invalid_params', 'server', 'other'];
  const data = await withRedis<StatsData | null>(async (r) => {
    const [today, yesterday, last7Days, last15Days, errorsLast15Days, recent, hash, ...catSums] = await Promise.all([
      r.get(countKey(new Date())),
      r.get(countKey(dateDaysAgo(1))),
      sumDayCounts(r, 7),
      sumDayCounts(r, 15),
      sumDayCounts(r, 15, errorCountKey),
      r.lrange(RECENT_KEY, 0, RECENT_WINDOW - 1),
      r.hgetall(LATEST_KEY),
      ...categories.map((cat) => sumDayCounts(r, 15, (d) => errorCatKey(cat, d))),
    ]);
    const breakdown = emptyErrorBreakdown();
    categories.forEach((cat, i) => { breakdown[cat] = catSums[i] ?? 0; });
    return { today, yesterday, last7Days, last15Days, errorsLast15Days, recent, breakdown, hash };
  }, null);

  if (!data) return emptyStats(false);

  const last15Days = data.last15Days;
  const errorsLast15Days = data.errorsLast15Days;
  const totalLast15Days = last15Days + errorsLast15Days;
  const errorRatePct15d = totalLast15Days > 0
    ? Math.round((errorsLast15Days / totalLast15Days) * 1000) / 10
    : 0;

  const recent = data.recent ?? [];
  const recentWindowSize = recent.length;
  const recentErrors = recent.reduce((n, v) => n + (v === 'err' ? 1 : 0), 0);
  const errorRateLast500 = recentWindowSize > 0
    ? Math.round((recentErrors / recentWindowSize) * 1000) / 10
    : 0;
  // Only assert the error gate once we have a meaningful sample. Before the
  // window fills, an early error would otherwise spike the rate artificially.
  const meetsErrorGate = recentWindowSize >= RECENT_WINDOW && errorRateLast500 < ERROR_RATE_GATE_PCT;

  return {
    redisAvailable: true,
    callThreshold: UPGRADE_THRESHOLD,
    errorRateGatePct: ERROR_RATE_GATE_PCT,
    counts: {
      today: parseInt(data.today ?? '0', 10),
      yesterday: parseInt(data.yesterday ?? '0', 10),
      last7Days: data.last7Days,
      last15Days,
      progressToThresholdPct: Math.round((last15Days / UPGRADE_THRESHOLD) * 1000) / 10,
      errorsLast15Days,
      errorRatePct15d,
      recentWindowSize,
      errorRateLast500,
      meetsCallThreshold: last15Days >= UPGRADE_THRESHOLD,
      meetsErrorGate,
    },
    errorBreakdown15d: data.breakdown,
    latest: {
      appUsage: parseLatestAppUsage(data.hash.appUsage),
      adAccountUsage: parseLatestAdAccountUsage(data.hash.adAccountUsage),
      businessUseCase: parseLatestBusinessUseCase(data.hash.businessUseCase),
      lastUpdated: data.hash.lastUpdated ?? null,
    },
  };
}
