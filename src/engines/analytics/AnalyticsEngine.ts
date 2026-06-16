// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/AnalyticsEngine.ts
//
//  ORCHESTRATOR for Step 7.
//
//    Input:  daily_stats
//    Output: metric_trends (one row per (entity, date))
//    Touches NOTHING else.
//
//  Default window: 7 days vs the previous 7 days, BUT LAGGED BY 2 DAYS
//  to avoid Meta's attribution backfill polluting the comparison. So as of
//  Jun 14, the "current 7 days" is Jun 5–11 and "prior 7 days" is May 29–Jun 4.
//  The Rules Engine in step 8 reads metric_trends — it doesn't know or care
//  what window was used, only what the numbers say.
//
//  This engine is PURE FACTS. It never emits:
//    AUDIENCE_FATIGUE, LOW_CTR, DECLINING_RESULTS, severities, judgments.
//  Those belong to step 8.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import { MetricTrendsRepo } from "../../repositories/metricTrendsRepo";
import type { DailyPoint } from "./aggregate";
import { calculateCtrTrend } from "./calculateCtrTrend";
import { calculateCpmTrend } from "./calculateCpmTrend";
import { calculateFrequencyTrend } from "./calculateFrequencyTrend";
import { calculateResultsTrend } from "./calculateResultsTrend";
import { calculateSpendTrend } from "./calculateSpendTrend";

export interface AnalyticsOptions {
  /** Length of each comparison window in days. Default 7. */
  windowDays?: number;
  /** Days to lag the comparison by, to avoid Meta's attribution backfill. Default 2. */
  attributionLagDays?: number;
  /** Override "as of" date — useful for backfilling history and tests. */
  asOf?: Date;
}

export interface AnalyticsResult {
  entityType: EntityType;
  entityId: string;
  asOf: string;
  windowDays: number;
  currentSince: string;
  currentUntil: string;
  priorSince: string;
  priorUntil: string;
  trends: {
    ctrTrend: number | null;
    cpmTrend: number | null;
    frequencyTrend: number | null;
    resultsTrend: number | null;
    spendTrend: number | null;
  };
  ok: boolean;
  error?: string;
}

export class AnalyticsEngine {
  private trendsRepo: MetricTrendsRepo;

  constructor(private prisma: PrismaClient) {
    this.trendsRepo = new MetricTrendsRepo(prisma);
  }

  /** Run analytics for a single entity (account level in Phase 1). */
  async run(
    entityType: EntityType,
    entityId: string,
    opts: AnalyticsOptions = {}
  ): Promise<AnalyticsResult> {
    const windowDays = Math.max(1, opts.windowDays ?? 7);
    const lag = Math.max(0, opts.attributionLagDays ?? 2);
    const asOf = opts.asOf ?? new Date();

    // Window math: as-of is "today" from the analyzer's perspective.
    // attributionLagDays=N means "exclude the last N days because Meta is
    // still backfilling attribution on them". So with as-of Jun 14, lag 2,
    // the latest INCLUDED day is Jun 12 (we drop Jun 13 and Jun 14).
    const currentUntil = addDays(asOf, -lag);            // inclusive
    const currentSince = addDays(currentUntil, -(windowDays - 1));
    const priorUntil = addDays(currentSince, -1);
    const priorSince = addDays(priorUntil, -(windowDays - 1));

    const result: AnalyticsResult = {
      entityType, entityId,
      asOf: ymd(asOf),
      windowDays,
      currentSince: ymd(currentSince), currentUntil: ymd(currentUntil),
      priorSince: ymd(priorSince), priorUntil: ymd(priorUntil),
      trends: { ctrTrend: null, cpmTrend: null, frequencyTrend: null, resultsTrend: null, spendTrend: null },
      ok: false,
    };

    try {
      // Single DB read: union of both windows, fetched once
      const points = await this.loadPoints(entityType, entityId, priorSince, currentUntil);
      const current = points.filter(p => p.date >= ymd(currentSince) && p.date <= ymd(currentUntil));
      const prior = points.filter(p => p.date >= ymd(priorSince) && p.date <= ymd(priorUntil));

      // Pure calculators — no DB, no I/O
      result.trends = {
        ctrTrend: calculateCtrTrend(current, prior),
        cpmTrend: calculateCpmTrend(current, prior),
        frequencyTrend: calculateFrequencyTrend(current, prior),
        resultsTrend: calculateResultsTrend(current, prior),
        spendTrend: calculateSpendTrend(current, prior),
      };

      // Single write — through the repo
      await this.trendsRepo.upsert({
        entityType, entityId, date: asOf,
        values: { ...result.trends, windowDays },
      });

      result.ok = true;
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  }

  /**
   * Read daily_stats for [since, until] inclusive and translate to DailyPoint.
   * BigInt fields are coerced to Number — safe at ad-account scale.
   */
  private async loadPoints(
    entityType: EntityType,
    entityId: string,
    since: Date,
    until: Date
  ): Promise<DailyPoint[]> {
    const rows = await this.prisma.dailyStat.findMany({
      where: { entityType, entityId, date: { gte: dateOnly(since), lte: dateOnly(until) } },
      orderBy: { date: "asc" },
    });
    return rows.map((r: any) => ({
      date: r.date.toISOString().slice(0, 10),
      spend: Number(r.spend),
      messages: Number(r.messages),
      impressions: Number(r.impressions),
      reach: Number(r.reach),
      clicks: Number(r.clicks),
      ctr: r.ctr,
      cpm: r.cpm,
      frequency: r.frequency,
      conversions: Number(r.conversions),
    }));
  }
}

// ── date helpers ─────────────────────────────────────────────────────────
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400_000); }
function dateOnly(d: Date): Date { return new Date(d.toISOString().slice(0, 10)); }
