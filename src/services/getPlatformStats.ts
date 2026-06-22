// ════════════════════════════════════════════════════════════════════════
//  src/services/getPlatformStats.ts
//
//  Platform-wide aggregations for the admin dashboard.
//
//  Surfaces three families of numbers:
//
//    1. Reach — how many workspaces / ad accounts / active campaigns are
//       under V6 Brain protection.
//
//    2. Money — total daily budget across active campaigns, grouped by
//       currency (one row per ccy), each in MAJOR units. Implied monthly
//       run-rate is daily × 30.
//
//    3. Brain health — narration coverage (% of recent snapshots that have
//       narrationJson populated) so we can spot a stalled cron at a glance.
//
//  Performance posture:
//    • One findMany per stat, in parallel via Promise.all.
//    • In-memory TTL cache (PLATFORM_STATS_TTL_MS) — admin opens the page
//      → first hit warms the cache, subsequent reloads inside the TTL are
//      served from RAM in microseconds. Cache lives in this module; dies
//      with the process. Single-replica safe; horizontally-scaled deploys
//      get per-replica caches, which is fine for the admin surface.
//    • `bustPlatformStatsCache()` exposes a manual invalidation hook (the
//      admin route POSTs to it after we ship a hotfix).
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

const PLATFORM_STATS_TTL_MS = 60 * 60_000;       // 1 hour
const NARRATION_COVERAGE_LOOKBACK_DAYS = 7;
const IMPLIED_MONTH_DAYS = 30;

// ── Public DTO ──────────────────────────────────────────────────────────
export interface PlatformBudgetByCurrency {
  /** ISO currency code as stored on AdAccount (e.g. "USD", "IQD", "SAR"). */
  currency: string;
  /** Count of ACTIVE campaigns under accounts with this currency. */
  activeCampaigns: number;
  /** Sum of daily_budget across those campaigns, in MAJOR units. */
  totalDailyBudgetMajor: number;
  /** daily × 30, in MAJOR units. */
  impliedMonthlyMajor: number;
}

export interface PlatformStats {
  /** UNIX ms the cached row was computed at. */
  computedAt: number;
  /** Whether this response came from the in-memory cache. */
  fromCache: boolean;
  reach: {
    totalWorkspaces: number;
    totalAdAccounts: number;
    activeAdAccounts: number;          // status === 'ACTIVE'
    activeCampaigns: number;           // status === 'ACTIVE' across all accounts
  };
  money: {
    /** One row per distinct currency among ACTIVE campaigns. */
    byCurrency: PlatformBudgetByCurrency[];
  };
  brain: {
    /** Snapshots produced in the last N days (lookback window). */
    snapshotsLastNDays: number;
    /** Of those, how many have a non-null narrationJson. */
    narrationsLastNDays: number;
    /** narrations / snapshots × 100, or null when snapshots = 0. */
    narrationCoveragePct: number | null;
    /** Lookback window used (for caller transparency). */
    lookbackDays: number;
  };
}

// ── Module-level cache (single-replica safe) ────────────────────────────
interface CacheEntry {
  at: number;
  data: Omit<PlatformStats, 'fromCache'>;
}
let _cache: CacheEntry | null = null;

/**
 * Drop the in-memory cache. Next call to `getPlatformStats` recomputes.
 * Exposed for the `POST /api/admin/cache/bust` route.
 */
export function bustPlatformStatsCache(): void {
  _cache = null;
}

/** For tests / hot config reload only. */
export function _peekPlatformStatsCache(): CacheEntry | null {
  return _cache;
}

// ── Entry point ─────────────────────────────────────────────────────────
export async function getPlatformStats(prisma: PrismaClient): Promise<PlatformStats> {
  const now = Date.now();
  if (_cache && now - _cache.at < PLATFORM_STATS_TTL_MS) {
    return { ...(_cache.data), fromCache: true };
  }

  const data = await computeFreshStats(prisma);
  _cache = { at: now, data };
  return { ...data, fromCache: false };
}

// ── Implementation ──────────────────────────────────────────────────────
async function computeFreshStats(prisma: PrismaClient): Promise<Omit<PlatformStats, 'fromCache'>> {
  const lookbackStart = new Date();
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - NARRATION_COVERAGE_LOOKBACK_DAYS);

  const [
    totalWorkspaces,
    totalAdAccounts,
    activeAdAccounts,
    activeCampaigns,
    accountsForBudget,
    snapshotsLastNDays,
    narrationsLastNDays,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.adAccount.count(),
    prisma.adAccount.count({ where: { status: 'ACTIVE' } }),
    prisma.campaign.count({ where: { status: 'ACTIVE' } }),
    // For per-currency budget aggregation we need to pair each campaign with
    // its account's currency + minorFactor. One findMany scoped to ACTIVE
    // accounts gets us everything in a single round-trip.
    prisma.adAccount.findMany({
      where: { status: 'ACTIVE' },
      select: {
        currency: true,
        currencyMinorFactor: true,
        campaigns: {
          where: { status: 'ACTIVE', dailyBudget: { not: null } },
          select: { dailyBudget: true },
        },
      },
    }),
    prisma.campaignBrainSnapshot.count({
      where: { tickDate: { gte: lookbackStart } },
    }),
    prisma.campaignBrainSnapshot.count({
      where: {
        tickDate: { gte: lookbackStart },
        narrationJson: { not: { equals: null } },
      },
    }),
  ]);

  // ── Money rollup: group accounts → currency buckets. ────────────────────
  // Multiple AdAccounts may share a currency; we aggregate them.
  const byCurrency = new Map<string, PlatformBudgetByCurrency>();
  for (const acct of accountsForBudget) {
    const factor = acct.currencyMinorFactor > 0 ? acct.currencyMinorFactor : 1;
    for (const c of acct.campaigns) {
      const minor = c.dailyBudget ? Number(c.dailyBudget) : 0;
      if (minor <= 0) continue;
      const major = minor / factor;
      const existing = byCurrency.get(acct.currency);
      if (existing) {
        existing.activeCampaigns += 1;
        existing.totalDailyBudgetMajor += major;
        existing.impliedMonthlyMajor += major * IMPLIED_MONTH_DAYS;
      } else {
        byCurrency.set(acct.currency, {
          currency: acct.currency,
          activeCampaigns: 1,
          totalDailyBudgetMajor: major,
          impliedMonthlyMajor: major * IMPLIED_MONTH_DAYS,
        });
      }
    }
  }

  // Round to 2 decimals — currencies without minor units (IQD via factor=1)
  // come out as whole integers naturally.
  const moneyRows = Array.from(byCurrency.values())
    .map(r => ({
      ...r,
      totalDailyBudgetMajor: +r.totalDailyBudgetMajor.toFixed(2),
      impliedMonthlyMajor: +r.impliedMonthlyMajor.toFixed(2),
    }))
    .sort((a, b) => b.impliedMonthlyMajor - a.impliedMonthlyMajor);

  const narrationCoveragePct = snapshotsLastNDays > 0
    ? +(narrationsLastNDays / snapshotsLastNDays * 100).toFixed(1)
    : null;

  return {
    computedAt: Date.now(),
    reach: {
      totalWorkspaces,
      totalAdAccounts,
      activeAdAccounts,
      activeCampaigns,
    },
    money: {
      byCurrency: moneyRows,
    },
    brain: {
      snapshotsLastNDays,
      narrationsLastNDays,
      narrationCoveragePct,
      lookbackDays: NARRATION_COVERAGE_LOOKBACK_DAYS,
    },
  };
}
