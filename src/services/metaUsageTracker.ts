// ════════════════════════════════════════════════════════════════════════
//  src/services/metaUsageTracker.ts
//
//  Phase A2 — raw Meta API call counter + usage-header snapshot in Redis.
//
//  Tracks cumulative 2xx responses toward the Marketing API Access Tier
//  call threshold Meta requires before upgrading an app from development
//  (300/hr) to standard access (100K/hr). Since Meta's May 2026 revision
//  ("Ads Management Standard Access" → "Marketing API Access Tier") the
//  gate is 500 successful calls in the trailing 15 days (was 1500), with
//  an error rate below 15% over the last 500 calls. Also persists the
//  latest x-app-usage / x-ad-account-usage / x-business-use-case-usage
//  headers for ops visibility.
//
//  All Redis writes go through withRedis(); when Redis is unavailable every
//  function degrades to a no-op (record) or zeroed stats (read).
// ════════════════════════════════════════════════════════════════════════

import { withRedis } from '../lib/redis';
import type { Redis } from 'ioredis';

const COUNT_KEY_PREFIX = 'meta:usage:count:';
const ERROR_KEY_PREFIX = 'meta:usage:error:';
const LATEST_KEY = 'meta:usage:latest';
const COUNT_TTL_SECONDS = 30 * 86400;
// Meta's Marketing API Access Tier gate (revised May 2026): 500 successful
// calls in the trailing 15 days. Was 1500 before the revision.
const UPGRADE_THRESHOLD = 500;
// Meta requires a <10% error rate over the rolling 15-day window to qualify for
// (and keep) the higher Marketing API access tier. Meta's formula: errors are HTTP
// status ≥400 (client + server errors); successes are 2xx. The 10% threshold is
// the stricter of documented 10%/15%, chosen defensively for the approval phase.
const ERROR_RATE_GATE_PCT = 9; // Target 9% to have 1% safety buffer under strictest rule

type StatsData = {
  today: string | null;
  yesterday: string | null;
  last7Days: number;
  last15Days: number;
  errorsLast15Days: number;
  hash: Record<string, string>;
};

type LastTier = 'standard_access' | 'development' | 'unknown';

export interface MetaUsageStats {
  redisAvailable: boolean;
  counts: {
    today: number;
    yesterday: number;
    last7Days: number;
    last15Days: number;
    /** The current Marketing API Access Tier call threshold (500 since May 2026). */
    threshold: number;
    progressToThresholdPct: number;
    errorsLast15Days: number;
    errorRatePct15d: number;
    meetsCallThreshold: boolean;
    meetsErrorGate: boolean;
  };
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

function emptyStats(redisAvailable: boolean): MetaUsageStats {
  return {
    redisAvailable,
    counts: {
      today: 0,
      yesterday: 0,
      last7Days: 0,
      last15Days: 0,
      threshold: UPGRADE_THRESHOLD,
      progressToThresholdPct: 0,
      errorsLast15Days: 0,
      errorRatePct15d: 0,
      meetsCallThreshold: false,
      meetsErrorGate: false,
    },
    latest: {
      appUsage: null,
      adAccountUsage: null,
      businessUseCase: null,
      lastUpdated: null,
    },
  };
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
 * (toward the 500-call access-tier threshold) and the daily error counter on status >= 400
 * (client errors 4xx + server errors 5xx, including 429 rate-limits, used to
 * calculate the <10% error-rate gate). 3xx redirects are not counted as either
 * (only successful terminal responses are 2xx; only actual errors are ≥400).
 * Always persists usage-header snapshots when present. Each HTTP attempt/retry
 * is a distinct event, matching Meta's own 15-day measurement. Never throws —
 * failures are swallowed via withRedis fallback.
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
  const data = await withRedis<StatsData | null>(async (r) => {
    const [today, yesterday, last7Days, last15Days, errorsLast15Days, hash] = await Promise.all([
      r.get(countKey(new Date())),
      r.get(countKey(dateDaysAgo(1))),
      sumDayCounts(r, 7),
      sumDayCounts(r, 15),
      sumDayCounts(r, 15, errorCountKey),
      r.hgetall(LATEST_KEY),
    ]);
    return { today, yesterday, last7Days, last15Days, errorsLast15Days, hash };
  }, null);

  if (!data) return emptyStats(false);

  const last15Days = data.last15Days;
  const errorsLast15Days = data.errorsLast15Days;
  const totalLast15Days = last15Days + errorsLast15Days;
  const errorRatePct15d = totalLast15Days > 0
    ? Math.round((errorsLast15Days / totalLast15Days) * 1000) / 10
    : 0;
  return {
    redisAvailable: true,
    counts: {
      today: parseInt(data.today ?? '0', 10),
      yesterday: parseInt(data.yesterday ?? '0', 10),
      last7Days: data.last7Days,
      last15Days,
      threshold: UPGRADE_THRESHOLD,
      progressToThresholdPct: Math.round((last15Days / UPGRADE_THRESHOLD) * 1000) / 10,
      errorsLast15Days,
      errorRatePct15d,
      meetsCallThreshold: last15Days >= UPGRADE_THRESHOLD,
      meetsErrorGate: errorRatePct15d < ERROR_RATE_GATE_PCT,
    },
    latest: {
      appUsage: parseLatestAppUsage(data.hash.appUsage),
      adAccountUsage: parseLatestAdAccountUsage(data.hash.adAccountUsage),
      businessUseCase: parseLatestBusinessUseCase(data.hash.businessUseCase),
      lastUpdated: data.hash.lastUpdated ?? null,
    },
  };
}
