// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/RulesEngine.ts
//
//  ORCHESTRATOR for Step 8.
//
//    Input:  metric_trends (Step 7) + daily_stats (Step 6) for current period
//    Output: detected_issues (one batch per entity, per as-of date)
//    Touches NOTHING else.
//
//  Every detector runs every time. A detector that returns null still ran
//  — that fact is preserved in evaluation order. (We don't persist non-
//  firings today; that's a Phase 2 observability concern.)
//
//  This engine emits issue CODES, never human text. Codes → text happens
//  in the Knowledge Engine (Step 9) at read time, with industry overrides.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import { DetectedIssuesRepo, type IssueRecord } from "../../repositories/detectedIssuesRepo";
import type { Detector, Signals } from "./types";
import { detectLowCtr } from "./detectLowCtr";
import { detectHighFrequency } from "./detectHighFrequency";
import { detectAudienceFatigue } from "./detectAudienceFatigue";
import { detectDecliningResults } from "./detectDecliningResults";
import { detectRisingCostPerResult } from "./detectRisingCostPerResult";
import { diagnose, type Diagnosis } from "./diagnose";

/** The full detector registry. Adding a new rule = adding to this list. */
export const ALL_DETECTORS: Detector[] = [
  detectAudienceFatigue,   // composite — runs first so its evidence is most authoritative
  detectDecliningResults,
  detectRisingCostPerResult,
  detectHighFrequency,
  detectLowCtr,
];

export interface RulesOptions {
  /** "as of" date for the run. Must match the date used by AnalyticsEngine. */
  asOf?: Date;
  /** Number of recent days to aggregate for current-period signals. Default 7. */
  windowDays?: number;
  /** Days to lag the window by (Meta attribution backfill). Default 2. */
  attributionLagDays?: number;
  /** Override the detector set — useful for tests. */
  detectors?: Detector[];
}

export interface RulesResult {
  entityType: EntityType;
  entityId: string;
  asOf: string;
  issues: IssueRecord[];
  diagnoses: Diagnosis[];
  ok: boolean;
  error?: string;
}

export class RulesEngine {
  private issuesRepo: DetectedIssuesRepo;

  constructor(private prisma: PrismaClient) {
    this.issuesRepo = new DetectedIssuesRepo(prisma);
  }

  async run(
    entityType: EntityType,
    entityId: string,
    opts: RulesOptions = {}
  ): Promise<RulesResult> {
    const windowDays = Math.max(1, opts.windowDays ?? 7);
    const lag = Math.max(0, opts.attributionLagDays ?? 2);
    const asOf = opts.asOf ?? new Date();
    const detectors = opts.detectors ?? ALL_DETECTORS;

    const result: RulesResult = {
      entityType, entityId, asOf: ymd(asOf), issues: [], diagnoses: [], ok: false,
    };

    try {
      const signals = await this.buildSignals(entityType, entityId, asOf, windowDays, lag);

      // Run every detector. Each is a pure function — order doesn't change outputs,
      // only the array order of issues returned.
      const issues: IssueRecord[] = [];
      for (const detect of detectors) {
        const issue = detect(signals);
        if (issue) issues.push(issue);
      }

      await this.issuesRepo.replaceForDate({
        entityType, entityId, date: asOf, issues,
      });

      result.issues = issues;
      result.diagnoses = diagnose(issues, signals);
      result.ok = true;
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  }

  /**
   * Build the Signals object that detectors consume:
   *   - latest metric_trends row for the entity (the period-over-period view)
   *   - current-window daily_stats aggregated to current levels
   */
  private async buildSignals(
    entityType: EntityType, entityId: string,
    asOf: Date, windowDays: number, lag: number
  ): Promise<Signals> {
    // Window: [currentSince, currentUntil] — must match AnalyticsEngine math.
    const currentUntil = addDays(asOf, -lag);
    const currentSince = addDays(currentUntil, -(windowDays - 1));

    // Trends row for this asOf — the newest row AT OR BEFORE asOf, so a backfill
    // for a past date pairs with that date's trends, not today's. (Reading the
    // globally-newest row corrupted historical runs.)
    const trend = await this.prisma.metricTrend.findFirst({
      where: { entityType, entityId, date: { lte: dateOnly(asOf) } },
      orderBy: { date: "desc" },
    });
    const staleDays = lag + 1;
    if (!trend || daysBetween(trend.date, asOf) > staleDays) {
      console.warn(
        `[RulesEngine] stale/missing trends: entity=${entityId} asOf=${ymd(asOf)} trendDate=${trend ? ymd(trend.date) : "none"} staleDays=${staleDays}`
      );
    }

    const daily = await this.prisma.dailyStat.findMany({
      where: {
        entityType, entityId,
        date: { gte: dateOnly(currentSince), lte: dateOnly(currentUntil) },
      },
    });

    // Current-period aggregates — same rates-vs-counts discipline as Analytics.
    // Rates: impression-weighted average. Counts: sum.
    let impTotal = 0, ctrNum = 0, cpmNum = 0;
    let freqVals: number[] = [];
    let resultsSum = 0, spendSum = 0;
    for (const r of daily as any[]) {
      const imp = Number(r.impressions);
      impTotal += imp;
      if (r.ctr != null && imp > 0) ctrNum += r.ctr * imp;
      if (r.cpm != null && imp > 0) cpmNum += r.cpm * imp;
      if (r.frequency != null) freqVals.push(r.frequency);
      resultsSum += Number(r.conversions);
      spendSum += Number(r.spend);
    }

    return {
      ctrTrend: trend?.ctrTrend ?? null,
      cpmTrend: trend?.cpmTrend ?? null,
      frequencyTrend: trend?.frequencyTrend ?? null,
      resultsTrend: trend?.resultsTrend ?? null,
      spendTrend: trend?.spendTrend ?? null,

      currentCtr: impTotal > 0 ? +(ctrNum / impTotal).toFixed(4) : null,
      currentCpm: impTotal > 0 ? +(cpmNum / impTotal).toFixed(4) : null,
      currentFrequency: freqVals.length
        ? +(freqVals.reduce((a, b) => a + b, 0) / freqVals.length).toFixed(4)
        : null,
      currentResults: resultsSum,
      currentSpend: spendSum,
    };
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const dateOnly = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const daysBetween = (a: Date, b: Date) =>
  Math.abs(Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / 86400_000));
