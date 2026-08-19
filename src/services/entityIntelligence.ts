// ════════════════════════════════════════════════════════════════════════
//  src/services/entityIntelligence.ts — ONE FUNNEL/INTELLIGENCE PIPELINE,
//  RUN AGAINST ANY ENTITY
//
//  P3/P4/P5 already produce a funnel diagnosis, an objective-aware KPI card
//  set, a health score and a recommendation. Until now that pipeline was
//  private to `getDashboard` and hard-wired to `EntityType.ACCOUNT`, so the
//  campaign inspector had no way to show the same verdicts for ONE campaign
//  without re-implementing them — which is precisely the split brain the
//  analytics rules exist to prevent.
//
//  This module is that pipeline, parameterised by entity. It contains NO new
//  analytics: every judgement still comes from `analytics/*`. It only decides
//  which rows to read and hands them to the existing deterministic engines.
//
//  The caller supplies the resolved purpose family. Resolution stays where it
//  belongs (rule 1): `resolveAccountResultKey` for an account,
//  `resolveCampaignPurpose` for a campaign. This module never re-derives a
//  family from a raw Meta objective.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import { diagnoseFunnel, type FunnelDiagnosis } from '../analytics/funnel/diagnose';
import type { FunnelWindowTotals } from '../analytics/funnel/compute';
import { detectAnomaly } from '../analytics/intelligence/anomaly';
import { reconcileIntelligence } from '../analytics/intelligence/hierarchy';
import { scoreObjectiveHealth } from '../analytics/intelligence/objectiveHealth';
import { buildRecommendation } from '../analytics/intelligence/recommend';
import { buildObjectiveKpiCards } from '../analytics/objectiveKpiCards';
import { resultFor } from '../analytics/resultSemantics';
import type { ClassificationConfidence, DataConfidence } from '../analytics/confidence';
import type { ObjectiveKpiFamily, ResultMetricKey } from '../lib/objectiveKpis';

/**
 * Window context shared by the P4 KPI cards and the P5 intelligence layer.
 * Computed ONCE from the funnel's own query — neither consumer re-reads the DB.
 */
export interface FunnelWindowContext {
  cur: FunnelWindowTotals;
  pri: FunnelWindowTotals;
  spendCur: number; spendPri: number;
  ctrCur: number | null; ctrPri: number | null;
  cpmCur: number | null; cpmPri: number | null;
  cpcCur: number | null; cpcPri: number | null;
  freqCur: number | null; freqPri: number | null;
  costPerResultCur: number | null; costPerResultPri: number | null;
  resultCur: number | null; resultPri: number | null;
  revenueMinorCur: number; revenueMinorPri: number;
  roasCur: number | null;
}

export interface EntityFunnelResult {
  funnel: FunnelDiagnosis | null;
  family: ObjectiveKpiFamily;
  windows: FunnelWindowContext;
  classificationConfidence: ClassificationConfidence;
  dataConfidence: DataConfidence;
  resultApproximate: boolean;
}

/**
 * P3 — funnel diagnosis for ONE entity: current 7-day window vs the prior 7
 * days, lagged 2 days for Meta attribution backfill (same convention as the
 * analytics engine).
 *
 * `family` must already be resolved by the caller; `resultKey` defaults to the
 * family's canonical result counter from `resultSemantics`.
 *
 * Returns null when the entity has no rows in the two windows — an entity we
 * cannot measure gets no verdict rather than a confident zero.
 */
export async function buildEntityFunnel(
  prisma: PrismaClient,
  entityType: EntityType,
  entityId: string,
  family: ObjectiveKpiFamily,
  opts?: {
    resultKey?: ResultMetricKey;
    classificationConfidence?: ClassificationConfidence;
  },
): Promise<EntityFunnelResult | null> {
  const resultKey = opts?.resultKey ?? resultFor(family).resultKey;
  const lagDays = 2, windowDays = 7;
  const now = new Date();
  const dayMs = 86_400_000;
  const floor = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const currentUntil = floor(new Date(now.getTime() - lagDays * dayMs));
  const currentSince = new Date(currentUntil.getTime() - (windowDays - 1) * dayMs);
  const priorUntil = new Date(currentSince.getTime() - dayMs);
  const priorSince = new Date(priorUntil.getTime() - (windowDays - 1) * dayMs);

  const rows = await prisma.dailyStat.findMany({
    where: {
      entityType,
      entityId,
      date: { gte: priorSince, lte: currentUntil },
    },
    select: {
      date: true, spend: true, impressions: true, reach: true, linkClicks: true,
      landingPageViews: true, messages: true, leads: true, purchases: true, clicks: true,
      ctr: true, cpm: true, cpc: true, frequency: true, revenueMinor: true, roas: true,
    },
  });
  if (rows.length === 0) return null;

  const zero = (): FunnelWindowTotals => ({
    impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0,
    messages: 0, leads: 0, purchases: 0, clicks: 0,
  });
  const cur = zero(), pri = zero();
  let spendCur = 0, spendPri = 0;
  let revCur = 0, revPri = 0;
  // Impression-weighted rate accumulators — ratios are never averaged flat.
  const rate = {
    cur: { imp: 0, ctr: 0, cpm: 0, cpc: 0, freq: [] as number[] },
    pri: { imp: 0, ctr: 0, cpm: 0, cpc: 0, freq: [] as number[] },
  };
  for (const r of rows) {
    const inCurrent = r.date.getTime() >= currentSince.getTime();
    const t = inCurrent ? cur : pri;
    const acc = inCurrent ? rate.cur : rate.pri;
    const imp = Number(r.impressions);
    acc.imp += imp;
    if (r.ctr != null && imp > 0) acc.ctr += r.ctr * imp;
    if (r.cpm != null && imp > 0) acc.cpm += r.cpm * imp;
    if (r.cpc != null && imp > 0) acc.cpc += r.cpc * imp;
    if (r.frequency != null) acc.freq.push(r.frequency);
    t.impressions += Number(r.impressions);
    // Reach maxes — not additive (same person on two days is one person).
    t.reach = Math.max(t.reach, Number(r.reach));
    t.linkClicks += Number(r.linkClicks);
    t.landingPageViews += Number(r.landingPageViews);
    t.messages += Number(r.messages);
    t.leads += Number(r.leads);
    t.purchases += Number(r.purchases);
    t.clicks += Number(r.clicks);
    if (inCurrent) { spendCur += Number(r.spend); revCur += Number(r.revenueMinor); }
    else { spendPri += Number(r.spend); revPri += Number(r.revenueMinor); }
  }

  // Supporting signals (NOT funnel stages): spend and cost per result.
  const resultCur = cur[resultKey as keyof FunnelWindowTotals] as number;
  const resultPri = pri[resultKey as keyof FunnelWindowTotals] as number;
  const signals = {
    spendCurrentMinor: spendCur,
    spendPriorMinor: spendPri,
    costPerResultCurrentMinor: resultCur > 0 ? spendCur / resultCur : null,
    costPerResultPriorMinor: resultPri > 0 ? spendPri / resultPri : null,
  };

  const funnel = diagnoseFunnel(family, cur, pri, signals);

  const wavg = (a: typeof rate.cur, key: 'ctr' | 'cpm' | 'cpc') =>
    a.imp > 0 ? +(a[key] / a.imp).toFixed(4) : null;
  const favg = (a: typeof rate.cur) =>
    a.freq.length ? +(a.freq.reduce((x, y) => x + y, 0) / a.freq.length).toFixed(4) : null;

  return {
    funnel,
    family,
    windows: {
      cur, pri, spendCur, spendPri,
      ctrCur: wavg(rate.cur, 'ctr'), ctrPri: wavg(rate.pri, 'ctr'),
      cpmCur: wavg(rate.cur, 'cpm'), cpmPri: wavg(rate.pri, 'cpm'),
      cpcCur: wavg(rate.cur, 'cpc'), cpcPri: wavg(rate.pri, 'cpc'),
      freqCur: favg(rate.cur), freqPri: favg(rate.pri),
      costPerResultCur: signals.costPerResultCurrentMinor,
      costPerResultPri: signals.costPerResultPriorMinor,
      resultCur: resultCur, resultPri: resultPri,
      revenueMinorCur: revCur, revenueMinorPri: revPri,
      // ROAS from the window's own corrected revenue and spend — never a
      // stored per-row value averaged across days.
      roasCur: spendCur > 0 && revCur > 0 ? +(revCur / spendCur).toFixed(4) : null,
    },
    classificationConfidence: opts?.classificationConfidence ?? 'CONFIRMED',
    // The window excludes the last 2 days for Meta attribution backfill, so
    // the rows in it are settled.
    dataConfidence: 'COMPLETE' as DataConfidence,
    resultApproximate: resultFor(family).approximate,
  };
}

/**
 * P4.2 — the objective's KPI card set for an already-computed window.
 *
 * A thin adapter: it maps `FunnelWindowContext` onto the `KpiSource` shape and
 * delegates every decision (which metrics apply, how each is displayed, what
 * is approximate) to `analytics/objectiveKpiCards`.
 */
export function buildEntityObjectiveKpis(
  family: ObjectiveKpiFamily | null,
  windows: FunnelWindowContext,
  money: (minor: number) => string,
) {
  return buildObjectiveKpiCards(family, {
    spendMinor: windows.spendCur,
    impressions: windows.cur.impressions,
    reach: windows.cur.reach,
    clicks: windows.cur.clicks,
    linkClicks: windows.cur.linkClicks,
    landingPageViews: windows.cur.landingPageViews,
    messages: windows.cur.messages,
    leads: windows.cur.leads,
    purchases: windows.cur.purchases,
    revenueMinor: windows.revenueMinorCur,
    ctr: windows.ctrCur,
    cpc: windows.cpcCur,
    cpm: windows.cpmCur,
    frequency: windows.freqCur,
    roas: windows.roasCur,
    money,
  });
}

/**
 * P5 — run the intelligence hierarchy over an entity's funnel.
 *
 * Reuses the SAME window totals the funnel already computed, so this adds no
 * extra database round-trips and no Meta calls.
 */
export function buildEntityIntelligence(
  funnel: FunnelDiagnosis | null,
  family: ObjectiveKpiFamily | null,
  windows: FunnelWindowContext,
  classificationConfidence: ClassificationConfidence,
  dataConfidence: DataConfidence,
  resultApproximate: boolean,
) {
  const { verdict, fatigue } = detectAnomaly({
    funnel,
    spendCurrentMinor: windows.spendCur,
    spendPriorMinor: windows.spendPri,
    impressionsCurrent: windows.cur.impressions,
    impressionsPrior: windows.pri.impressions,
    cpmCurrent: windows.cpmCur,
    cpmPrior: windows.cpmPri,
    fatigue: {
      frequency: windows.freqCur, priorFrequency: windows.freqPri,
      ctr: windows.ctrCur, priorCtr: windows.ctrPri,
      cpc: windows.cpcCur, priorCpc: windows.cpcPri,
      impressions: windows.cur.impressions,
    },
  });

  const reconciled = reconcileIntelligence({
    dataConfidence, classificationConfidence, funnel, anomaly: verdict, fatigue,
  });

  const health = scoreObjectiveHealth({
    family,
    primaryResultCurrent: windows.resultCur,
    primaryResultPrior: windows.resultPri,
    ctr: windows.ctrCur, ctrPrior: windows.ctrPri,
    cpm: windows.cpmCur, cpmPrior: windows.cpmPri,
    costPerResultCurrent: windows.costPerResultCur,
    costPerResultPrior: windows.costPerResultPri,
    impressions: windows.cur.impressions,
    reconciled, fatigue, resultApproximate,
  });

  const recommendation = buildRecommendation(reconciled, family);

  return {
    problemClass: reconciled.problemClass,
    confidence: reconciled.confidence,
    decidedBy: reconciled.decidedBy,
    alert: reconciled.alert,
    evidence: reconciled.evidence,
    trace: reconciled.trace,
    /**
     * Action codes this SAME reconciliation forbids (hierarchy.ts's
     * permitAction() already applied it to `recommendation` above). Exposed
     * so a second call site — priorityAction, a different producer's
     * primary CTA — can be checked against the identical reconciled state
     * rather than a separately-recomputed one, which would risk the two
     * checks silently drifting apart (P1-01).
     */
    forbiddenActions: reconciled.forbiddenActions,
    anomaly: { significant: verdict.significant, kind: verdict.kind, confidence: verdict.confidence },
    fatigue: fatigue.confidence === 'INSUFFICIENT_DATA' ? null : {
      frequency: fatigue.frequency, severity: fatigue.severity,
      confidence: fatigue.confidence, corroboratingSignals: fatigue.corroboratingSignals,
      evidence: fatigue.evidence,
    },
    health: {
      score: health.score, band: health.band, confidence: health.confidence,
      excludedFacets: health.excludedFacets,
      facets: health.facets.map((f) => ({
        key: f.key, score: f.score, weight: f.weight,
        applicable: f.applicable, evidence: f.evidence,
      })),
    },
    recommendation,
  };
}

/** Re-export so callers do not need a second import for the entity enum. */
export { EntityType };
