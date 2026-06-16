// ════════════════════════════════════════════════════════════════════════
//  src/engines/health/HealthScoreEngine.ts
//
//  Health score is explanation, not truth.
//
//  ORCHESTRATOR for Step 11.
//
//    Inputs:  metric_trends + daily_stats (current period) + recommendation
//    Output:  health_scores (one row per (entity, date, algorithmVersion))
//    Touches NOTHING else.
//
//  The score itself is a single number 0–100. The BREAKDOWN is what makes
//  it trustable — every facet's contribution, its raw input, and the
//  weights applied are persisted in breakdownJson. The dashboard renders
//  this breakdown so users can argue with components.
//
//  Versioning: the algorithm version is a constant in this file. Bumping
//  it creates NEW rows alongside old ones — v1 scores remain queryable
//  forever. NEVER silently change a weight without bumping the version.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import { HealthScoresRepo } from "../../repositories/healthScoresRepo";
import {
  scoreCtr, scoreFrequency, scoreCpm, scoreTrend,
  type FacetResult,
} from "./facets";

/**
 * Algorithm version. Bump when ANY weight, threshold, or facet definition
 * changes. Old rows with prior versions remain valid and queryable.
 *
 * v1: initial Phase 1 model.
 *     Facets: ctr, frequency, cpm, trend, recommendation.
 *     Weights: 20/15/15/30/20.
 *     RETIRED — the recommendation facet double-counted signals already
 *     captured by trend/ctr/frequency, because Rules derives the
 *     recommendation from the same metrics. Net result was an unfairly
 *     low score on bad accounts.
 *
 * v2: cleaner facet set, no double-counting.
 *     Facets: trend, ctr, frequency, cpm.
 *     Weights: 40/25/20/15.
 *     because:
 *       trend (40)     — bottom-line direction; what owners notice first.
 *       ctr (25)       — direct measure of creative working; high-signal.
 *       frequency (20) — saturation indicator; standalone level matters.
 *       cpm (15)       — most lagging/noisy; weighted least.
 *     v1 rows remain queryable forever by design.
 */
export const HEALTH_ALGORITHM_VERSION = 2;

/**
 * Facet weights. Sum to 100. See HEALTH_ALGORITHM_VERSION for rationale.
 * If you change these, BUMP THE VERSION.
 */
export const WEIGHTS = {
  trend: 40,
  ctr: 25,
  frequency: 20,
  cpm: 15,
} as const;

export interface HealthOptions {
  asOf?: Date;
  windowDays?: number;
  attributionLagDays?: number;
}

export interface HealthResult {
  entityType: EntityType;
  entityId: string;
  asOf: string;
  score: number;
  breakdown: ScoreBreakdown;
  ok: boolean;
  error?: string;
}

export interface ScoreBreakdown {
  algorithmVersion: number;
  facets: {
    trend:     { score: number; weight: number; weighted: number; evidence: Record<string, unknown> };
    ctr:       { score: number; weight: number; weighted: number; evidence: Record<string, unknown> };
    frequency: { score: number; weight: number; weighted: number; evidence: Record<string, unknown> };
    cpm:       { score: number; weight: number; weighted: number; evidence: Record<string, unknown> };
  };
  total: number;
}

export class HealthScoreEngine {
  private repo: HealthScoresRepo;

  constructor(private prisma: PrismaClient) {
    this.repo = new HealthScoresRepo(prisma);
  }

  async run(
    entityType: EntityType,
    entityId: string,
    opts: HealthOptions = {}
  ): Promise<HealthResult> {
    const asOf = opts.asOf ?? new Date();
    const windowDays = Math.max(1, opts.windowDays ?? 7);
    const lag = Math.max(0, opts.attributionLagDays ?? 2);

    const result: HealthResult = {
      entityType, entityId, asOf: ymd(asOf),
      score: 0, breakdown: emptyBreakdown(),
      ok: false,
    };

    try {
      // ── Read all inputs (no writes yet) ────────────────────────────
      // v2 no longer reads recommendations — that was double-counting in v1.
      const currentUntil = addDays(asOf, -lag);
      const currentSince = addDays(currentUntil, -(windowDays - 1));

      const [trend, dailyRows] = await Promise.all([
        this.prisma.metricTrend.findFirst({
          where: { entityType, entityId },
          orderBy: { date: "desc" },
        }),
        this.prisma.dailyStat.findMany({
          where: { entityType, entityId, date: { gte: dateOnly(currentSince), lte: dateOnly(currentUntil) } },
        }),
      ]);

      // ── Aggregate current-period signals (same shape as Rules) ─────
      let impTotal = 0, ctrNum = 0, cpmNum = 0;
      const freqVals: number[] = [];
      for (const r of dailyRows as any[]) {
        const imp = Number(r.impressions);
        impTotal += imp;
        if (r.ctr != null && imp > 0) ctrNum += r.ctr * imp;
        if (r.cpm != null && imp > 0) cpmNum += r.cpm * imp;
        if (r.frequency != null) freqVals.push(r.frequency);
      }
      const currentCtr = impTotal > 0 ? +(ctrNum / impTotal).toFixed(4) : null;
      const currentFreq = freqVals.length
        ? +(freqVals.reduce((a, b) => a + b, 0) / freqVals.length).toFixed(4)
        : null;

      // ── Score each facet (pure functions) ──────────────────────────
      const ctrFacet = scoreCtr(currentCtr);
      const freqFacet = scoreFrequency(currentFreq);
      const cpmFacet = scoreCpm(trend?.cpmTrend ?? null);
      const trendFacet = scoreTrend({
        resultsTrend: trend?.resultsTrend ?? null,
        ctrTrend: trend?.ctrTrend ?? null,
        cpmTrend: trend?.cpmTrend ?? null,
      });

      // ── Compose ────────────────────────────────────────────────────
      const breakdown = composeBreakdown({
        ctr: ctrFacet, frequency: freqFacet, cpm: cpmFacet, trend: trendFacet,
      });

      // ── Write ──────────────────────────────────────────────────────
      await this.repo.upsert({
        entityType, entityId, date: asOf,
        record: {
          score: breakdown.total,
          algorithmVersion: HEALTH_ALGORITHM_VERSION,
          breakdown: breakdown as unknown as Record<string, unknown>,
        },
      });

      result.score = breakdown.total;
      result.breakdown = breakdown;
      result.ok = true;
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  }
}

// ── pure composition (testable without DB) ────────────────────────────────
export function composeBreakdown(facets: {
  trend: FacetResult; ctr: FacetResult; frequency: FacetResult; cpm: FacetResult;
}): ScoreBreakdown {
  const w = WEIGHTS;
  const weighted = {
    trend:     (facets.trend.score     * w.trend)     / 100,
    ctr:       (facets.ctr.score       * w.ctr)       / 100,
    frequency: (facets.frequency.score * w.frequency) / 100,
    cpm:       (facets.cpm.score       * w.cpm)       / 100,
  };
  const total = Math.round(
    weighted.trend + weighted.ctr + weighted.frequency + weighted.cpm
  );
  return {
    algorithmVersion: HEALTH_ALGORITHM_VERSION,
    facets: {
      trend:     { score: facets.trend.score,     weight: w.trend,     weighted: +weighted.trend.toFixed(2),     evidence: facets.trend.evidence },
      ctr:       { score: facets.ctr.score,       weight: w.ctr,       weighted: +weighted.ctr.toFixed(2),       evidence: facets.ctr.evidence },
      frequency: { score: facets.frequency.score, weight: w.frequency, weighted: +weighted.frequency.toFixed(2), evidence: facets.frequency.evidence },
      cpm:       { score: facets.cpm.score,       weight: w.cpm,       weighted: +weighted.cpm.toFixed(2),       evidence: facets.cpm.evidence },
    },
    total,
  };
}

function emptyBreakdown(): ScoreBreakdown {
  return {
    algorithmVersion: HEALTH_ALGORITHM_VERSION,
    facets: {
      trend:     { score: 0, weight: WEIGHTS.trend,     weighted: 0, evidence: {} },
      ctr:       { score: 0, weight: WEIGHTS.ctr,       weighted: 0, evidence: {} },
      frequency: { score: 0, weight: WEIGHTS.frequency, weighted: 0, evidence: {} },
      cpm:       { score: 0, weight: WEIGHTS.cpm,       weighted: 0, evidence: {} },
    },
    total: 0,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));
