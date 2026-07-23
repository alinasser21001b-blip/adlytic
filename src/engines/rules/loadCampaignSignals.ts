// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/loadCampaignSignals.ts
//
//  Batch-load real period-over-period Signals for campaigns using the SAME
//  window math and calculators as AnalyticsEngine / RulesEngine.buildSignals.
//
//  Read-only: does not write metric_trends. Used by the brain orchestrator
//  so rule grounding can diagnose with true trends instead of absolute-only
//  snapshot proxies.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { DailyPoint } from '../analytics/aggregate';
import { calculateCtrTrend } from '../analytics/calculateCtrTrend';
import { calculateCpmTrend } from '../analytics/calculateCpmTrend';
import { calculateFrequencyTrend } from '../analytics/calculateFrequencyTrend';
import { calculateResultsTrend } from '../analytics/calculateResultsTrend';
import { calculateSpendTrend } from '../analytics/calculateSpendTrend';
import type { Signals } from './types';

export interface LoadCampaignSignalsOptions {
  asOf?: Date;
  windowDays?: number;
  attributionLagDays?: number;
}

/**
 * Load Signals for many campaigns in one DailyStat query.
 * Missing / empty campaigns are simply absent from the map.
 */
export async function loadCampaignSignalsBatch(
  prisma: PrismaClient,
  campaignIds: string[],
  opts: LoadCampaignSignalsOptions = {},
): Promise<Map<string, Signals>> {
  const out = new Map<string, Signals>();
  if (campaignIds.length === 0) return out;

  const windowDays = Math.max(1, opts.windowDays ?? 7);
  const lag = Math.max(0, opts.attributionLagDays ?? 2);
  const asOf = opts.asOf ?? new Date();

  const currentUntil = addDays(asOf, -lag);
  const currentSince = addDays(currentUntil, -(windowDays - 1));
  const priorUntil = addDays(currentSince, -1);
  const priorSince = addDays(priorUntil, -(windowDays - 1));

  const rows = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaignIds },
      date: { gte: dateOnly(priorSince), lte: dateOnly(currentUntil) },
    },
    orderBy: { date: 'asc' },
  });

  const byCampaign = new Map<string, DailyPoint[]>();
  for (const r of rows as any[]) {
    const list = byCampaign.get(r.entityId) ?? [];
    list.push({
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
    });
    byCampaign.set(r.entityId, list);
  }

  const curSinceY = ymd(currentSince);
  const curUntilY = ymd(currentUntil);
  const priSinceY = ymd(priorSince);
  const priUntilY = ymd(priorUntil);

  for (const [campaignId, points] of byCampaign) {
    const current = points.filter((p) => p.date >= curSinceY && p.date <= curUntilY);
    const prior = points.filter((p) => p.date >= priSinceY && p.date <= priUntilY);
    if (current.length === 0) continue;

    let impTotal = 0;
    let ctrNum = 0;
    let cpmNum = 0;
    const freqVals: number[] = [];
    let resultsSum = 0;
    let spendSum = 0;
    for (const p of current) {
      const imp = p.impressions;
      impTotal += imp;
      if (p.ctr != null && imp > 0) ctrNum += p.ctr * imp;
      if (p.cpm != null && imp > 0) cpmNum += p.cpm * imp;
      if (p.frequency != null) freqVals.push(p.frequency);
      resultsSum += p.conversions;
      spendSum += p.spend;
    }

    out.set(campaignId, {
      ctrTrend: calculateCtrTrend(current, prior),
      cpmTrend: calculateCpmTrend(current, prior),
      frequencyTrend: calculateFrequencyTrend(current, prior),
      resultsTrend: calculateResultsTrend(current, prior),
      spendTrend: calculateSpendTrend(current, prior),
      currentCtr: impTotal > 0 ? +(ctrNum / impTotal).toFixed(4) : null,
      currentCpm: impTotal > 0 ? +(cpmNum / impTotal).toFixed(4) : null,
      currentFrequency: freqVals.length
        ? +(freqVals.reduce((a, b) => a + b, 0) / freqVals.length).toFixed(4)
        : null,
      currentResults: resultsSum,
      currentSpend: spendSum,
    });
  }

  return out;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400_000);
}
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
