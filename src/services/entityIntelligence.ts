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
import { classificationConfidenceFromReason, type ClassificationConfidence, type DataConfidence } from '../analytics/confidence';
import type { ObjectiveKpiFamily, ResultMetricKey } from '../lib/objectiveKpis';
import { resolveCampaignPurpose } from '../lib/campaignPurpose';
import { resolveAccountResultKey } from '../analytics/accountResultKey';
import { resolveAnalysisWindows } from '../lib/analysisWindow';
import { readPeriodFact } from './periodInsights';

/**
 * Window context shared by the P4 KPI cards and the P5 intelligence layer.
 * Computed ONCE from the funnel's own query — neither consumer re-reads the DB.
 */
export interface FunnelWindowContext {
  cur: FunnelWindowTotals;
  pri: FunnelWindowTotals;
  spendCur: number; spendPri: number;
  /**
   * Meta's own reported CTR: clicks(ALL) ÷ impressions, impression-weighted
   * across the window. Includes reactions, comments, shares and photo
   * expands — NOT only link clicks.
   */
  ctrCur: number | null; ctrPri: number | null;
  /**
   * Link click-through rate, derived here: link clicks ÷ impressions, in the
   * same percent units as `ctrCur` so the two are directly comparable.
   *
   * Derived rather than stored because Meta's own inline_link_click_ctr is
   * not in DEFAULT_INSIGHT_FIELDS, so it is never fetched. It lives in this
   * canonical window context — not in a display layer — for the same reason
   * ctrCur does: a ratio computed twice is a ratio that can disagree with
   * itself. Reading one against the other is how an 8.9%-vs-0.66%
   * "contradiction" gets reported when nothing is actually wrong.
   */
  linkCtrCur: number | null; linkCtrPri: number | null;
  cpmCur: number | null; cpmPri: number | null;
  cpcCur: number | null; cpcPri: number | null;
  /**
   * Meta's own period frequency, or null when Meta did not supply one for
   * this exact entity and span. NEVER the mean of daily frequencies: a
   * person reached on five days counts once in period reach but washes out
   * of a daily mean, so that mean sits below the truth and is fed straight
   * into ABSOLUTE fatigue thresholds. Null means UNKNOWN — fatigue withholds.
   */
  freqCur: number | null; freqPri: number | null;
  /**
   * Meta's own period reach, or null when unavailable. Not derivable from
   * daily rows at all — Meta de-duplicates people inside a span and does not
   * publish the overlap, so max(daily) is only a lower bound.
   */
  reachCur: number | null; reachPri: number | null;
  /** Where reach/frequency came from, so a null is explainable. */
  periodFactSource: 'META_PERIOD_FACT' | 'UNAVAILABLE';
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
  const dayMs = 86_400_000;
  // ONE window resolver, shared with the sync that writes period facts. A
  // one-day drift between writer and reader would turn every period lookup
  // into a miss, silently reporting UNKNOWN as though Meta had gone quiet.
  const { currentSince, currentUntil, priorSince, priorUntil } = resolveAnalysisWindows();

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
    impressions: 0, reach: null, linkClicks: 0, landingPageViews: 0,
    messages: 0, leads: 0, purchases: 0, clicks: 0,
  });
  const cur = zero(), pri = zero();
  let spendCur = 0, spendPri = 0;
  let revCur = 0, revPri = 0;
  // Impression-weighted rate accumulators — ratios are never averaged flat.
  const rate = {
    cur: { imp: 0, ctr: 0, cpm: 0, cpc: 0 },
    pri: { imp: 0, ctr: 0, cpm: 0, cpc: 0 },
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
    t.impressions += Number(r.impressions);
    // Reach is NOT accumulated from daily rows in any form. `max(daily)` was
    // removed after an adversarial test disproved the claim that its bias
    // cancels across windows: with identical impressions and identical daily
    // reach, a current window of total audience overlap against a prior window
    // of none makes TRUE reach ÷ impressions fall 85.7% while the estimator
    // reports 0% change. Cross-day overlap differs between windows, so the
    // estimator can mask a real break and invent an absent one — it is not
    // decision-safe even for relative comparison. The funnel's reach comes
    // from META_PERIOD_FACT below, or the reach-dependent ratios go UNKNOWN.
    t.linkClicks += Number(r.linkClicks);
    t.landingPageViews += Number(r.landingPageViews);
    t.messages += Number(r.messages);
    t.leads += Number(r.leads);
    t.purchases += Number(r.purchases);
    t.clicks += Number(r.clicks);
    if (inCurrent) { spendCur += Number(r.spend); revCur += Number(r.revenueMinor); }
    else { spendPri += Number(r.spend); revPri += Number(r.revenueMinor); }
  }

  // ── META PERIOD FACTS — reach and frequency, or UNKNOWN ───────────────
  // Read from storage on an EXACT (entity, span) match; the sync is the only
  // writer. A miss means Meta never answered for this exact window, and the
  // answer is UNKNOWN — never max(daily reach), never sum(daily reach), never
  // average(daily frequency), never impressions ÷ max(daily reach).
  //
  // Frequency is the reason this matters. It feeds ABSOLUTE thresholds
  // (FREQUENCY_WATCH 3.0 / FREQUENCY_SATURATED 4.0), so there is no
  // current-vs-prior comparison to cancel an estimator's bias. The previous
  // flat mean of daily frequencies sat well below the true period figure — a
  // person reached on five days counts once in period reach but washes out of
  // a daily mean — so fatigue was under-detected by construction. An UNKNOWN
  // that withholds is correct; a plausible number that under-fires is not.
  const [periodCur, periodPri] = await Promise.all([
    readPeriodFact(prisma, entityType, entityId, currentSince, currentUntil),
    readPeriodFact(prisma, entityType, entityId, priorSince, priorUntil),
  ]);
  const periodFactSource: 'META_PERIOD_FACT' | 'UNAVAILABLE' =
    periodCur || periodPri ? 'META_PERIOD_FACT' : 'UNAVAILABLE';

  // Supporting signals (NOT funnel stages): spend and cost per result.
  const resultCur = cur[resultKey as keyof FunnelWindowTotals] as number;
  const resultPri = pri[resultKey as keyof FunnelWindowTotals] as number;
  const signals = {
    spendCurrentMinor: spendCur,
    spendPriorMinor: spendPri,
    costPerResultCurrentMinor: resultCur > 0 ? spendCur / resultCur : null,
    costPerResultPriorMinor: resultPri > 0 ? spendPri / resultPri : null,
  };

  // The funnel's reach IS the Meta period value, or null. Null makes
  // reach ÷ impressions and link clicks ÷ reach UNAVAILABLE while leaving the
  // downstream conversion ratio — which never depended on reach — judgeable.
  cur.reach = periodCur?.reach ?? null;
  pri.reach = periodPri?.reach ?? null;

  const funnel = diagnoseFunnel(family, cur, pri, signals);

  // ── DATA VALIDITY, measured rather than asserted ──────────────────────
  // This was `dataConfidence: 'COMPLETE'` — a literal constant. It meant the
  // DATA_VALIDITY layer could never observe anything but COMPLETE, so
  // reconcileIntelligence()'s weakest-link cap never fired for a data reason
  // and a window holding one row out of fourteen days reached full
  // confidence. Coverage is now derived from the rows actually read.
  //
  // COMPLETE only when every calendar day in the span carries a row — the one
  // case with no absence left to explain. Otherwise PARTIAL, which caps
  // confidence at MEDIUM without asserting the missing days SHOULD have held
  // data: `time_increment=1` omits zero-delivery days and Campaign stores no
  // Meta start/stop time, so absence is genuinely undecidable. The claim made
  // here is only "this window cannot be vouched for", which is true in every
  // one of those cases. The precise dates live in the Observatory's temporal
  // block; this is the coarse gate that feeds the confidence cap.
  const daysInSpan = new Set<string>();
  for (let t = priorSince.getTime(); t <= currentUntil.getTime(); t += dayMs) {
    daysInSpan.add(new Date(t).toISOString().slice(0, 10));
  }
  for (const r of rows) daysInSpan.delete(r.date.toISOString().slice(0, 10));
  const dataConfidence: DataConfidence = daysInSpan.size === 0 ? 'COMPLETE' : 'PARTIAL';

  const wavg = (a: typeof rate.cur, key: 'ctr' | 'cpm' | 'cpc') =>
    a.imp > 0 ? +(a[key] / a.imp).toFixed(4) : null;
  // Total link clicks ÷ total impressions. Equal to the impression-weighted
  // average of the daily link CTRs, so it is built the same way `wavg` builds
  // ctr — and ×100 to match the percent units insightMapper stores `ctr` in.
  const linkCtr = (t: FunnelWindowTotals) =>
    t.impressions > 0 ? +((t.linkClicks / t.impressions) * 100).toFixed(4) : null;

  return {
    funnel,
    family,
    windows: {
      cur, pri, spendCur, spendPri,
      ctrCur: wavg(rate.cur, 'ctr'), ctrPri: wavg(rate.pri, 'ctr'),
      linkCtrCur: linkCtr(cur), linkCtrPri: linkCtr(pri),
      cpmCur: wavg(rate.cur, 'cpm'), cpmPri: wavg(rate.pri, 'cpm'),
      cpcCur: wavg(rate.cur, 'cpc'), cpcPri: wavg(rate.pri, 'cpc'),
      freqCur: periodCur?.frequency ?? null, freqPri: periodPri?.frequency ?? null,
      reachCur: periodCur?.reach ?? null, reachPri: periodPri?.reach ?? null,
      periodFactSource,
      costPerResultCur: signals.costPerResultCurrentMinor,
      costPerResultPri: signals.costPerResultPriorMinor,
      resultCur: resultCur, resultPri: resultPri,
      revenueMinorCur: revCur, revenueMinorPri: revPri,
      // ROAS from the window's own corrected revenue and spend — never a
      // stored per-row value averaged across days.
      roasCur: spendCur > 0 && revCur > 0 ? +(revCur / spendCur).toFixed(4) : null,
    },
    classificationConfidence: opts?.classificationConfidence ?? 'CONFIRMED',
    // Derived above from the span's real day coverage. The 2-day lag makes
    // the rows SETTLED; it does not make the window COMPLETE, and conflating
    // the two is what this replaced.
    dataConfidence,
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
    /**
     * Issue codes THIS SAME reconciliation says a higher layer already
     * explains (e.g. HIGH_FREQUENCY when the funnel's own fatigue signal is
     * the explanation) — so a detected_issues-driven consumer (getDashboard's
     * `issues`/`diagnoses`/`merchantTasks`) can drop the redundant finding
     * instead of showing it alongside this reconciled verdict as if they were
     * two independent opinions. Same reasoning as forbiddenActions above.
     */
    suppressedIssueCodes: reconciled.suppressedIssueCodes,
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

/**
 * Resolve one entity's CURRENT reconciled intelligence from scratch —
 * independently of any caller-supplied claim about its family/objective —
 * for guards that must decide whether an action code is safe to persist or
 * surface for this entity right now (permitAction() needs `problemClass` +
 * `forbiddenActions`, which only reconcileIntelligence() produces).
 *
 * Mirrors getDashboard.ts's own buildAccountFunnel (ACCOUNT) and the
 * campaign-inspector route's own purpose resolution (CAMPAIGN) exactly —
 * family still resolves via resolveAccountResultKey / resolveCampaignPurpose
 * only (rule 1), never re-derived here. ADSET/AD have no purpose resolver:
 * null, not a guess.
 */
export async function resolveEntityIntelligenceForGuard(
  prisma: PrismaClient,
  entityType: EntityType,
  entityId: string,
): Promise<ReturnType<typeof buildEntityIntelligence> | null> {
  const { currentSince, currentUntil, priorSince, priorUntil } = resolveAnalysisWindows();

  let family: ObjectiveKpiFamily | null;
  let classificationConfidence: ClassificationConfidence = 'CONFIRMED';

  if (entityType === EntityType.ACCOUNT) {
    const { resultKey, families } = await resolveAccountResultKey(prisma, entityId, priorSince, currentUntil);
    if (!resultKey || families.length !== 1) return null;
    family = families[0]!;
  } else if (entityType === EntityType.CAMPAIGN) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: entityId },
      select: {
        objective: true, messagingCtaAds: true,
        adSets: { select: { optimizationGoal: true, destinationType: true } },
      },
    });
    if (!campaign) return null;
    const rows = await prisma.dailyStat.findMany({
      where: { entityType: EntityType.CAMPAIGN, entityId, date: { gte: priorSince, lte: currentUntil } },
      select: { messages: true, clicks: true, linkClicks: true },
    });
    let messagesW = 0, clicksW = 0, linkClicksW = 0;
    for (const r of rows) {
      messagesW += Number(r.messages); clicksW += Number(r.clicks); linkClicksW += Number(r.linkClicks);
    }
    const purpose = resolveCampaignPurpose({
      objective: campaign.objective,
      optimizationGoals: campaign.adSets.map((a) => a.optimizationGoal),
      destinationTypes: campaign.adSets.map((a) => a.destinationType),
      messagesWindow: messagesW, clicksWindow: clicksW, linkClicksWindow: linkClicksW,
      messagingCtaAds: campaign.messagingCtaAds,
    });
    family = purpose.family;
    classificationConfidence = classificationConfidenceFromReason(purpose.reason, purpose.corroborated);
  } else {
    return null;
  }
  if (!family) return null;

  const entityFunnel = await buildEntityFunnel(prisma, entityType, entityId, family, { classificationConfidence });
  if (!entityFunnel) return null;

  return buildEntityIntelligence(
    entityFunnel.funnel, entityFunnel.family, entityFunnel.windows,
    entityFunnel.classificationConfidence, entityFunnel.dataConfidence, entityFunnel.resultApproximate,
  );
}

/** Re-export so callers do not need a second import for the entity enum. */
export { EntityType };
