// ════════════════════════════════════════════════════════════════════════
//  src/services/brainObservatory.ts — AN X-RAY, NOT A SECOND BRAIN
//
//  Assembles one campaign's complete reasoning chain for developer/admin
//  inspection: Meta → Semantics → Anomaly → Evidence → Diagnosis → Decision
//  → LLM, with every value tagged by what KIND of fact it is.
//
//  ── THE ONE INVARIANT THIS MODULE MUST NEVER BREAK ────────────────────
//
//  It computes NO intelligence of its own. Every value below is copied
//  verbatim out of the SAME canonical producer the production path uses:
//
//    · window totals / ratios  → buildEntityFunnel()      (entityIntelligence.ts)
//    · purpose family          → resolveCampaignPurpose() (lib/campaignPurpose.ts)
//    · primary KPI + result    → getKpiSpecForFamily() / resultFor()
//    · anomaly + fatigue       → buildEntityIntelligence().anomaly/.fatigue
//    · canonical Evidence      → detected_issues + issueEvidenceFieldsFromJson()
//    · diagnosis + confidence  → buildEntityIntelligence().problemClass/.confidence
//    · trace                   → reconcileIntelligence()'s own .trace
//    · decision + forbidden    → buildEntityIntelligence().recommendation/.forbiddenActions
//    · permitted/blocked       → permitAction()           (hierarchy.ts)
//    · LLM narration           → campaign_brain_snapshots.narrationJson (read)
//
//  buildEntityFunnel() + buildEntityIntelligence() are exactly what the
//  campaign-inspector route (api/server.ts) already calls to produce the
//  merchant-facing verdict. Calling them here READS that canonical output;
//  it does not create a parallel one. If this module ever computes a
//  threshold, a ratio, or a verdict of its own, it has become the second
//  brain it exists to inspect — test_brain_observatory.ts fails the build
//  on exactly that.
//
//  Read-only by construction: no Prisma write call appears anywhere in this
//  file, and nothing it returns is consumed by any production decision path.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import { buildEntityFunnel, buildEntityIntelligence } from './entityIntelligence';
import { permitAction } from '../analytics/intelligence/hierarchy';
import { resolveCampaignPurpose } from '../lib/campaignPurpose';
import { getKpiSpecForFamily } from '../lib/objectiveKpis';
import { resultFor } from '../analytics/resultSemantics';
import { classificationConfidenceFromReason } from '../analytics/confidence';
import { issueEvidenceFieldsFromJson } from '../analytics/evidence';
import type { Evidence } from '../analytics/evidence';

/**
 * What KIND of statement each line is. Part 3 of the validation mission
 * requires every surfaced item to declare this explicitly, so a reviewer can
 * tell a measured number from an engine's inference from an LLM's prose
 * without reading the source.
 */
export type FactKind =
  | 'OBSERVED_FACT'    // straight from normalized Meta data (a stored counter)
  | 'DERIVED_FACT'     // computed by a canonical engine from observed facts
  | 'ANOMALY'          // a canonical engine's "this is unusual" verdict
  | 'DIAGNOSIS'        // a canonical engine's "this is what broke" verdict
  | 'RECOMMENDATION'   // the guarded action the system advises
  | 'DO_NOT_DO'        // an action the diagnosis structurally forbids
  | 'LLM_EXPLANATION'; // narration — never authoritative, never an input

export interface ObservatoryFact {
  kind: FactKind;
  label: string;
  value: string | number | null;
  /** Which canonical module produced this — the provenance a reviewer traces. */
  source: string;
  /** Prior-window comparison, when the canonical producer supplies one. */
  baseline?: string | number | null;
}

export interface BrainObservatorySnapshot {
  campaign: { id: string; name: string; externalCampaignId: string; status: string };
  /** 1. META TRUTH — canonical metrics + the windows they were measured over. */
  metaTruth: {
    currentWindow: { since: string; until: string };
    priorWindow: { since: string; until: string };
    dataStatus: string;
    dailyRowsInWindow: number;
    facts: ObservatoryFact[];
  };
  /** 2. SEMANTICS — purpose, primary KPI, result unit, semantic validity. */
  semantics: {
    objective: string | null;
    purposeFamily: string;
    purposeReasonAr: string | null;
    classificationConfidence: string;
    primaryKpi: string;
    primaryKpiLabelAr: string;
    resultUnit: string;
    resultApproximate: boolean;
    facts: ObservatoryFact[];
  };
  /** 3. ANOMALIES — type, significance, confidence, fatigue facet. */
  anomalies: {
    significant: boolean;
    kind: string;
    confidence: string;
    fatigue: {
      severity: string;
      confidence: string;
      corroboratingSignals: number;
      evidence: string[];
    } | null;
    facts: ObservatoryFact[];
  };
  /** 4. EVIDENCE — canonical Evidence items from detected_issues. */
  evidence: {
    count: number;
    items: Array<{
      issueCode: string;
      severity: string;
      date: string;
      suppressed: boolean;
      metrics: Evidence[];
    }>;
  };
  /** 5. DIAGNOSIS — problem class, confidence, suppressed competitors. */
  diagnosis: {
    problemClass: string;
    confidence: string;
    decidedBy: string;
    alert: boolean;
    evidenceNarrative: string[];
    suppressedIssueCodes: string[];
    facts: ObservatoryFact[];
  };
  /** 6. DECISION — permitted action, blocked actions + why, source. */
  decision: {
    recommendedAction: string | null;
    recommendationSource: string;
    forbiddenActions: string[];
    actionAudit: Array<{ actionCode: string; permitted: boolean; reason: string | null }>;
    facts: ObservatoryFact[];
  };
  /** 7. LLM LAYER — narration, always labeled non-authoritative. */
  llmLayer: {
    authoritative: false;
    narrationAvailable: boolean;
    brainAction: string | null;
    narrationText: string | null;
    tickDate: string | null;
    /** Whether Brain's own action survives THIS campaign's funnel diagnosis. */
    brainActionPermitted: boolean | null;
    brainActionBlockedReason: string | null;
    facts: ObservatoryFact[];
  };
  /** 8. TRACE — reconcileIntelligence()'s own layer-by-layer record. */
  trace: Array<{ layer: string; conclusion: string }>;
  /** True when the chain reconstructs without needing any LLM statement. */
  backwardTraceComplete: boolean;
}

/**
 * Every action code the guard can meaningfully rule on, so the Observatory
 * can show "what WOULD be blocked here" rather than only the one action that
 * happened to be recommended. Union of the vocabularies permitAction()
 * actually recognises (hierarchy.ts's CREATIVE_ACTIONS + AUDIENCE_ACTIONS)
 * plus the always-safe codes, so a reviewer sees both sides of the guard.
 */
const AUDITED_ACTION_CODES = [
  'REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'IMPROVE_HOOKS',
  'EXPAND_AUDIENCE', 'NARROW_AUDIENCE', 'INCREASE_BUDGET', 'DECREASE_BUDGET',
  'CHECK_TARGETING', 'REVIEW_BUDGET_PACING',
  'PAUSE', 'MONITOR', 'INVESTIGATE_TRACKING',
] as const;

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Assemble one campaign's full reasoning chain. Returns null when the
 * campaign does not exist or has no measurable window — the same honest
 * absence the production path returns, never a fabricated snapshot.
 */
export async function buildBrainObservatory(
  prisma: PrismaClient,
  campaignId: string,
): Promise<BrainObservatorySnapshot | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true, name: true, externalCampaignId: true, status: true, objective: true,
      messagingCtaAds: true, adAccountId: true,
      adSets: { select: { optimizationGoal: true, destinationType: true } },
    },
  });
  if (!campaign) return null;

  // Same 7d-vs-prior-7d lagged windows buildEntityFunnel itself uses — read
  // here only to LABEL which days were measured, never to re-measure them.
  const lagDays = 2, windowDays = 7, dayMs = 86_400_000;
  const floor = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const currentUntil = floor(new Date(Date.now() - lagDays * dayMs));
  const currentSince = new Date(currentUntil.getTime() - (windowDays - 1) * dayMs);
  const priorUntil = new Date(currentSince.getTime() - dayMs);
  const priorSince = new Date(priorUntil.getTime() - (windowDays - 1) * dayMs);

  const windowRows = await prisma.dailyStat.findMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: campaignId, date: { gte: priorSince, lte: currentUntil } },
    select: { messages: true, clicks: true, linkClicks: true },
  });
  let messagesW = 0, clicksW = 0, linkClicksW = 0;
  for (const r of windowRows) {
    messagesW += Number(r.messages); clicksW += Number(r.clicks); linkClicksW += Number(r.linkClicks);
  }

  // ── 2. SEMANTICS — canonical resolver only (rule 1: never re-derived). ──
  const purpose = resolveCampaignPurpose({
    objective: campaign.objective,
    optimizationGoals: campaign.adSets.map((a) => a.optimizationGoal),
    destinationTypes: campaign.adSets.map((a) => a.destinationType),
    messagesWindow: messagesW, clicksWindow: clicksW, linkClicksWindow: linkClicksW,
    messagingCtaAds: campaign.messagingCtaAds,
  });
  const classificationConfidence = classificationConfidenceFromReason(purpose.reason, purpose.corroborated);
  const kpiSpec = getKpiSpecForFamily(purpose.family);
  const resultDef = resultFor(purpose.family);

  // ── The canonical chain, run exactly as the inspector route runs it. ──
  const entityFunnel = await buildEntityFunnel(
    prisma, EntityType.CAMPAIGN, campaignId, purpose.family, { classificationConfidence },
  );
  if (!entityFunnel) return null;

  const intel = buildEntityIntelligence(
    entityFunnel.funnel, entityFunnel.family, entityFunnel.windows,
    entityFunnel.classificationConfidence, entityFunnel.dataConfidence, entityFunnel.resultApproximate,
  );

  const w = entityFunnel.windows;

  // ── 1. META TRUTH — stored canonical values, copied, never recomputed. ──
  const metaFacts: ObservatoryFact[] = [
    { kind: 'OBSERVED_FACT', label: 'Impressions', value: w.cur.impressions, baseline: w.pri.impressions, source: 'daily_stats.impressions (via buildEntityFunnel)' },
    { kind: 'OBSERVED_FACT', label: 'Reach', value: w.cur.reach, baseline: w.pri.reach, source: 'daily_stats.reach' },
    { kind: 'OBSERVED_FACT', label: 'Link clicks', value: w.cur.linkClicks, baseline: w.pri.linkClicks, source: 'daily_stats.link_clicks' },
    { kind: 'OBSERVED_FACT', label: 'Landing page views', value: w.cur.landingPageViews, baseline: w.pri.landingPageViews, source: 'daily_stats.landing_page_views' },
    { kind: 'OBSERVED_FACT', label: 'Messages', value: w.cur.messages, baseline: w.pri.messages, source: 'daily_stats.messages' },
    { kind: 'OBSERVED_FACT', label: 'Leads', value: w.cur.leads, baseline: w.pri.leads, source: 'daily_stats.leads' },
    { kind: 'OBSERVED_FACT', label: 'Purchases', value: w.cur.purchases, baseline: w.pri.purchases, source: 'daily_stats.purchases' },
    { kind: 'OBSERVED_FACT', label: 'Spend (minor units)', value: w.spendCur, baseline: w.spendPri, source: 'daily_stats.spend' },
    { kind: 'OBSERVED_FACT', label: 'CTR (%)', value: w.ctrCur, baseline: w.ctrPri, source: "daily_stats.ctr — Meta's own reported value" },
    { kind: 'OBSERVED_FACT', label: 'CPM (minor units)', value: w.cpmCur, baseline: w.cpmPri, source: "daily_stats.cpm — Meta's own reported value" },
    { kind: 'OBSERVED_FACT', label: 'CPC (minor units)', value: w.cpcCur, baseline: w.cpcPri, source: 'daily_stats.cpc' },
    { kind: 'OBSERVED_FACT', label: 'Frequency', value: w.freqCur, baseline: w.freqPri, source: 'daily_stats.frequency' },
    { kind: 'DERIVED_FACT', label: 'Primary result count', value: w.resultCur, baseline: w.resultPri, source: 'analytics/resultSemantics.ts (unit-safe)' },
    { kind: 'DERIVED_FACT', label: 'Cost per result (minor units)', value: w.costPerResultCur, baseline: w.costPerResultPri, source: 'buildEntityFunnel window context' },
  ];

  // ── 4. EVIDENCE — canonical detected_issues for this campaign's window. ──
  const detected = await prisma.detectedIssue.findMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: campaignId, date: { gte: priorSince } },
    orderBy: { date: 'desc' },
    take: 25,
  });
  const suppressedSet = new Set(intel.suppressedIssueCodes);
  const evidenceItems = detected.map((d) => ({
    issueCode: String(d.issueCode),
    severity: String(d.severity),
    date: iso(d.date),
    suppressed: suppressedSet.has(String(d.issueCode)),
    metrics: issueEvidenceFieldsFromJson(d.evidenceJson).evidence,
  }));

  // ── 6. DECISION — the guard's verdict across the full audited vocabulary. ──
  const actionAudit = AUDITED_ACTION_CODES.map((code) => {
    const permit = permitAction(code, intel);
    return { actionCode: code, permitted: permit.allowed, reason: permit.allowed ? null : (permit.reason ?? null) };
  });

  // ── 7. LLM LAYER — read Brain's narration; never treat it as an input. ──
  const snapshot = await prisma.campaignBrainSnapshot.findFirst({
    where: { campaignId },
    orderBy: { tickDate: 'desc' },
    select: { action: true, narrationJson: true, tickDate: true },
  });
  const brainPermit = snapshot ? permitAction(snapshot.action, intel) : null;
  const narrationText = ((): string | null => {
    const n = snapshot?.narrationJson as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== 'object') return null;
    const candidate = n['arabicNarration'] ?? n['narration'] ?? n['text'];
    return typeof candidate === 'string' ? candidate : null;
  })();

  return {
    campaign: {
      id: campaign.id, name: campaign.name,
      externalCampaignId: campaign.externalCampaignId, status: String(campaign.status),
    },
    metaTruth: {
      currentWindow: { since: iso(currentSince), until: iso(currentUntil) },
      priorWindow: { since: iso(priorSince), until: iso(priorUntil) },
      dataStatus: entityFunnel.dataConfidence,
      dailyRowsInWindow: windowRows.length,
      facts: metaFacts,
    },
    semantics: {
      objective: campaign.objective,
      purposeFamily: purpose.family,
      purposeReasonAr: purpose.reasonAr ?? null,
      classificationConfidence,
      primaryKpi: kpiSpec.resultKey,
      primaryKpiLabelAr: kpiSpec.resultLabelAr,
      resultUnit: resultDef.unit,
      resultApproximate: entityFunnel.resultApproximate,
      facts: [
        { kind: 'DERIVED_FACT', label: 'Purpose family', value: purpose.family, source: 'lib/campaignPurpose.ts::resolveCampaignPurpose' },
        { kind: 'DERIVED_FACT', label: 'Primary KPI', value: kpiSpec.resultKey, source: 'lib/objectiveKpis.ts::getKpiSpecForFamily' },
        { kind: 'DERIVED_FACT', label: 'Result unit', value: resultDef.unit, source: 'analytics/resultSemantics.ts::resultFor' },
        { kind: 'DERIVED_FACT', label: 'Classification confidence', value: classificationConfidence, source: 'analytics/confidence.ts' },
      ],
    },
    anomalies: {
      significant: intel.anomaly.significant,
      kind: intel.anomaly.kind,
      confidence: intel.anomaly.confidence,
      fatigue: intel.fatigue
        ? {
            severity: intel.fatigue.severity,
            confidence: intel.fatigue.confidence,
            corroboratingSignals: intel.fatigue.corroboratingSignals,
            evidence: intel.fatigue.evidence,
          }
        : null,
      facts: [
        { kind: 'ANOMALY', label: 'Anomaly kind', value: intel.anomaly.kind, source: 'analytics/intelligence/anomaly.ts::detectAnomaly' },
        { kind: 'ANOMALY', label: 'Significant', value: String(intel.anomaly.significant), source: 'analytics/intelligence/anomaly.ts::detectAnomaly' },
        { kind: 'ANOMALY', label: 'Anomaly confidence', value: intel.anomaly.confidence, source: 'analytics/intelligence/anomaly.ts::detectAnomaly' },
      ],
    },
    evidence: { count: evidenceItems.length, items: evidenceItems },
    diagnosis: {
      problemClass: intel.problemClass,
      confidence: intel.confidence,
      decidedBy: intel.decidedBy,
      alert: intel.alert,
      evidenceNarrative: intel.evidence,
      suppressedIssueCodes: intel.suppressedIssueCodes,
      facts: [
        { kind: 'DIAGNOSIS', label: 'Problem class', value: intel.problemClass, source: 'analytics/intelligence/hierarchy.ts::reconcileIntelligence' },
        { kind: 'DIAGNOSIS', label: 'Confidence', value: intel.confidence, source: 'reconcileIntelligence (weakest-link cap)' },
        { kind: 'DIAGNOSIS', label: 'Decided by layer', value: intel.decidedBy, source: 'reconcileIntelligence' },
      ],
    },
    decision: {
      recommendedAction: intel.recommendation?.action ?? null,
      recommendationSource: 'analytics/intelligence/recommend.ts::buildRecommendation',
      forbiddenActions: intel.forbiddenActions,
      actionAudit,
      facts: [
        { kind: 'RECOMMENDATION', label: 'Recommended action', value: intel.recommendation?.action ?? null, source: 'analytics/intelligence/recommend.ts' },
        ...intel.forbiddenActions.map((a): ObservatoryFact => ({
          kind: 'DO_NOT_DO', label: 'Forbidden action', value: a,
          source: 'hierarchy.ts::reconcileIntelligence forbiddenActions',
        })),
      ],
    },
    llmLayer: {
      authoritative: false,
      narrationAvailable: narrationText !== null,
      brainAction: snapshot?.action ?? null,
      narrationText,
      tickDate: snapshot ? iso(snapshot.tickDate) : null,
      brainActionPermitted: brainPermit ? brainPermit.allowed : null,
      brainActionBlockedReason: brainPermit && !brainPermit.allowed ? (brainPermit.reason ?? null) : null,
      facts: narrationText
        ? [{ kind: 'LLM_EXPLANATION', label: 'Brain narration (NON-AUTHORITATIVE)', value: narrationText, source: 'campaign_brain_snapshots.narration_json' }]
        : [],
    },
    trace: intel.trace.map((t) => ({ layer: String(t.layer), conclusion: t.conclusion })),
    // The chain reconstructs from engine output alone whenever the reconciler
    // reached a real verdict with its own trace — no narration participates.
    backwardTraceComplete: intel.trace.length > 0 && intel.problemClass !== undefined,
  };
}
