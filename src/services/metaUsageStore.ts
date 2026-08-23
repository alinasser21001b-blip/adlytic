// ════════════════════════════════════════════════════════════════════════
//  src/services/metaUsageStore.ts
//
//  DURABLE Meta Marketing API usage telemetry. The persistence owner.
//
//  ── THE DEFECT THIS REPLACES ──────────────────────────────────────────
//
//  Usage telemetry lived only in Redis, behind REDIS_URL — a variable this
//  deployment deliberately does not set. The reader's Redis-absent branch
//  returned a fully zeroed struct:
//
//      last15Days: 0, recentWindowSize: 0, errorRateLast500: 0,
//      meetsCallThreshold: false
//
//  which the console rendered as "0 / 500". Nothing in those numbers said
//  "not measured". A zero is a measurement; the absence of telemetry is not.
//  The evidence behind a Marketing API access-tier application was therefore
//  both unobtainable and indistinguishable from a real, terrible result.
//
//  ── OWNERSHIP (one writer, several readers) ───────────────────────────
//
//    WRITER          Meta transport instrumentation only — metaClient, via
//                    metaUsageTracker. Nothing else may write.
//    READERS         readiness computation, operational truth, the graph
//                    overlay and the Admin API — all read-only.
//    RETENTION       the existing daily maintenance job. Never an Admin GET:
//                    a console refresh must not trigger a delete sweep.
//
//  ── HISTORY STAYS UNKNOWN ─────────────────────────────────────────────
//
//  Production already ran for weeks with no counters. Those calls are gone.
//  measurementStartedAt records when observation actually began, and days
//  before it are UNKNOWN — never backfilled with zero. A 15-day statistic
//  computed over three days of coverage says so instead of implying twelve
//  silent days of nothing.
//
//  ── WHAT IS NEVER STORED ──────────────────────────────────────────────
//
//  No tokens, no Authorization headers, no URLs, no response bodies, no
//  campaign or creative data. Counters, a boolean outcome, a category enum,
//  and parsed numeric usage headers. That is the whole surface.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

import type { MetaErrorCategory } from './metaUsageTracker';

/** The policy window Meta judges the error rate over. */
export const RECENT_WINDOW = 500;
/** Rolling window for the successful-call threshold. */
export const USAGE_WINDOW_DAYS = 15;
/**
 * Ledger retention: enough to satisfy the 500-call policy window several
 * times over for diagnostics, and bounded so the table cannot grow forever.
 */
export const OUTCOME_RETENTION_ROWS = RECENT_WINDOW * 4;

// ── boot registration ───────────────────────────────────────────────────
//
// MetaClient is constructed deep inside sync paths that do not carry a
// PrismaClient, and threading one through every call site would touch the
// Meta cordon this closure is not allowed to disturb. So the writer is
// registered once at boot instead. When it is NOT registered — unit tests,
// a CLI — every write is a silent no-op and every read reports
// UNAVAILABLE, which is the truthful answer rather than a zero.

let writer: PrismaClient | null = null;

/** Called once from serve.ts. Idempotent. */
export function registerMetaUsagePrisma(prisma: PrismaClient): void {
  writer = prisma;
}

/** Test seam. */
export function __resetMetaUsagePrisma(): void {
  writer = null;
}

export function isMetaUsageDurable(): boolean {
  return writer !== null;
}

// ── writes ──────────────────────────────────────────────────────────────

function utcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const EMPTY_BREAKDOWN: Record<MetaErrorCategory, number> = {
  token: 0, rate_limit: 0, permission: 0, invalid_params: 0, server: 0, other: 0,
};

/**
 * Record ONE terminal call outcome.
 *
 * Fire-and-forget by contract: telemetry must never add latency to a Meta
 * call and must never fail one. Errors are swallowed after a single warn —
 * a telemetry outage degrades measurement, and measurement degradation is
 * reported honestly by the reader rather than by throwing here.
 */
export function recordOutcome(ok: boolean, category?: MetaErrorCategory): void {
  const prisma = writer;
  if (!prisma) return;
  const day = utcDay();

  void (async () => {
    try {
      const inc = ok
        ? { successCount: { increment: 1 } }
        : { errorCount: { increment: 1 } };

      // The category breakdown is a JSON column rather than six columns:
      // the set of Meta error categories is owned by metaUsageTracker and
      // has changed before. A read-modify-write is safe here because the
      // row is per-day and contention is one process's own calls.
      const existing = ok
        ? null
        : await prisma.metaUsageDaily.findUnique({ where: { date: day } });

      let breakdown: Record<string, number> | undefined;
      if (!ok) {
        const cur = (existing?.errorByCategory as Record<string, number> | null) ?? { ...EMPTY_BREAKDOWN };
        const key = category ?? 'other';
        breakdown = { ...EMPTY_BREAKDOWN, ...cur, [key]: (cur[key] ?? 0) + 1 };
      }

      await prisma.metaUsageDaily.upsert({
        where: { date: day },
        create: {
          date: day,
          successCount: ok ? 1 : 0,
          errorCount: ok ? 0 : 1,
          errorByCategory: breakdown ?? { ...EMPTY_BREAKDOWN },
        },
        update: { ...inc, ...(breakdown ? { errorByCategory: breakdown } : {}) },
      });

      await prisma.metaUsageOutcome.create({
        data: { ok, ...(ok ? {} : { category: category ?? 'other' }) },
      });

      // Establish the coverage origin on the very first write, and never
      // move it afterwards — it is the boundary between measured and unknown.
      await prisma.metaUsageState.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton' },
        update: {},
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[adlytic:meta-usage] telemetry write failed (measurement will report a gap): ${msg}`);
    }
  })();
}

/** Latest parsed usage headers. Numeric fields only — never a raw body. */
export function recordHeaders(h: {
  appUsage?: unknown;
  adAccountUsage?: unknown;
  businessUseCase?: unknown;
}): void {
  const prisma = writer;
  if (!prisma) return;
  void (async () => {
    try {
      const data = {
        latestObservedAt: new Date(),
        ...(h.appUsage !== undefined ? { appUsage: h.appUsage as object } : {}),
        ...(h.adAccountUsage !== undefined ? { adAccountUsage: h.adAccountUsage as object } : {}),
        ...(h.businessUseCase !== undefined ? { businessUseCase: h.businessUseCase as object } : {}),
      };
      await prisma.metaUsageState.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', ...data },
        update: data,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[adlytic:meta-usage] header snapshot failed: ${msg}`);
    }
  })();
}

// ── retention ───────────────────────────────────────────────────────────

/**
 * Trim the outcome ledger. Called by the daily maintenance job, never by a
 * read path. Keeps the newest OUTCOME_RETENTION_ROWS by id — id is a
 * BIGSERIAL, so "newest" is a cheap ordered scan rather than a date math.
 */
export async function pruneUsageOutcomes(prisma: PrismaClient, keep = OUTCOME_RETENTION_ROWS): Promise<number> {
  const nth = await prisma.metaUsageOutcome.findMany({
    select: { id: true },
    orderBy: { id: 'desc' },
    skip: keep,
    take: 1,
  });
  if (nth.length === 0) return 0;
  const cutoff = nth[0]!.id;
  const res = await prisma.metaUsageOutcome.deleteMany({ where: { id: { lte: cutoff } } });
  return res.count;
}

// ── reads ───────────────────────────────────────────────────────────────

/**
 * What the measurement itself is worth.
 *
 * UNAVAILABLE  no durable store reachable — every metric is null.
 * PARTIAL      measuring, but coverage starts inside the policy window, so
 *              the 15-day figure describes fewer than 15 measured days.
 * MEASURED     coverage spans the whole window.
 */
export type UsageMeasurementState = 'MEASURED' | 'PARTIAL' | 'UNAVAILABLE';

export interface DurableUsageTelemetry {
  measurement: UsageMeasurementState;
  measurementStartedAt: string | null;
  /** Measured days actually covered by the window. null when UNAVAILABLE. */
  coveredDays: number | null;
  windowDays: number;
  /** null means NOT MEASURED. It never means zero. */
  successfulCalls: number | null;
  errorCalls: number | null;
  errorsByCategory: Record<string, number> | null;
  /** Size of the recent terminal window actually available (≤ RECENT_WINDOW). */
  recentWindowSize: number | null;
  /** Error rate over the recent terminal window, percent. null if unmeasured. */
  errorRatePct: number | null;
  latestHeaders: {
    observedAt: string | null;
    appUsage: unknown;
    adAccountUsage: unknown;
    businessUseCase: unknown;
  } | null;
}

/** Everything-null telemetry. The honest answer when we cannot measure. */
export function unavailableTelemetry(): DurableUsageTelemetry {
  return {
    measurement: 'UNAVAILABLE',
    measurementStartedAt: null,
    coveredDays: null,
    windowDays: USAGE_WINDOW_DAYS,
    successfulCalls: null,
    errorCalls: null,
    errorsByCategory: null,
    recentWindowSize: null,
    errorRatePct: null,
    latestHeaders: null,
  };
}

export async function readUsageTelemetry(prisma?: PrismaClient): Promise<DurableUsageTelemetry> {
  const db = prisma ?? writer;
  if (!db) return unavailableTelemetry();

  try {
    const since = utcDay();
    since.setUTCDate(since.getUTCDate() - (USAGE_WINDOW_DAYS - 1));

    const [rows, state, recent] = await Promise.all([
      db.metaUsageDaily.findMany({ where: { date: { gte: since } }, orderBy: { date: 'asc' } }),
      db.metaUsageState.findUnique({ where: { id: 'singleton' } }),
      db.metaUsageOutcome.findMany({ select: { ok: true }, orderBy: { id: 'desc' }, take: RECENT_WINDOW }),
    ]);

    // No state row ⇒ the writer has never run. That is UNAVAILABLE, not a
    // measured zero: reporting 0/500 here is the original defect.
    if (!state) return unavailableTelemetry();

    const startedAt = state.measurementStartedAt;
    let success = 0;
    let errors = 0;
    const byCat: Record<string, number> = {};
    for (const r of rows) {
      success += r.successCount;
      errors += r.errorCount;
      const b = (r.errorByCategory as Record<string, number> | null) ?? {};
      for (const [k, v] of Object.entries(b)) byCat[k] = (byCat[k] ?? 0) + (v ?? 0);
    }

    // Coverage is measured from when observation began, not from how many
    // rows happen to exist — a day with zero calls is a measured zero and
    // still counts as covered.
    const dayMs = 86_400_000;
    const elapsedDays = Math.floor((Date.now() - startedAt.getTime()) / dayMs) + 1;
    const coveredDays = Math.max(0, Math.min(USAGE_WINDOW_DAYS, elapsedDays));
    const measurement: UsageMeasurementState =
      coveredDays >= USAGE_WINDOW_DAYS ? 'MEASURED' : 'PARTIAL';

    const recentWindowSize = recent.length;
    const recentErrors = recent.filter((r) => !r.ok).length;
    const errorRatePct = recentWindowSize > 0
      ? Math.round((recentErrors / recentWindowSize) * 1000) / 10
      : null;

    return {
      measurement,
      measurementStartedAt: startedAt.toISOString(),
      coveredDays,
      windowDays: USAGE_WINDOW_DAYS,
      successfulCalls: success,
      errorCalls: errors,
      errorsByCategory: byCat,
      recentWindowSize,
      errorRatePct,
      latestHeaders: {
        observedAt: state.latestObservedAt ? state.latestObservedAt.toISOString() : null,
        appUsage: state.appUsage ?? null,
        adAccountUsage: state.adAccountUsage ?? null,
        businessUseCase: state.businessUseCase ?? null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[adlytic:meta-usage] telemetry read failed: ${msg}`);
    return unavailableTelemetry();
  }
}
