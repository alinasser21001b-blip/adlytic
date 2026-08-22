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
import { permitAction, LAYER_ORDER, PERMIT_ACTION_DOMAIN } from '../analytics/intelligence/hierarchy';
import type { IntelligenceLayer } from '../analytics/intelligence/hierarchy';
import { resolveCampaignPurpose } from '../lib/campaignPurpose';
import { getKpiSpecForFamily } from '../lib/objectiveKpis';
import { resultFor } from '../analytics/resultSemantics';
import { classificationConfidenceFromReason } from '../analytics/confidence';
import { issueEvidenceFieldsFromJson } from '../analytics/evidence';
import type { Evidence } from '../analytics/evidence';
// The level vocabulary is reused from the discovery module rather than
// restated here, so "campaign" means the same thing in both places.
import type { DiscoveryLevel } from './metaEntityDiscovery';
// The real horizon the sync re-requests every pass — read, never restated.
// Imported from the leaf constants module, NOT from backgroundScheduler:
// that module's graph pulls in BullMQ, MetaClient and the orchestrator, and
// a read-only inspector must not be able to reach a queue or a Meta writer.
import { CAMPAIGN_BACKFILL_DAYS } from '../workers/syncHorizon';

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
  | 'LLM_EXPLANATION'  // narration — never authoritative, never an input
  | 'NOT_MEASURED';    // Adlytic holds no value for this — absence, stated

export interface ObservatoryFact {
  kind: FactKind;
  label: string;
  value: string | number | null;
  /** Which canonical module produced this — the provenance a reviewer traces. */
  source: string;
  /** Prior-window comparison, when the canonical producer supplies one. */
  baseline?: string | number | null;
}

/**
 * Whether an action may be advised, decomposed so "not forbidden" can never
 * be misread as "advised". Only states an EXISTING canonical source can
 * support are emitted:
 *
 *   RECOMMENDED  — the canonical recommendation names this action AND
 *                  permitAction() allows it.
 *   NOT_VETOED   — permitAction() allows it, but nothing canonical advises
 *                  it. Absence of a veto, not an endorsement.
 *   FORBIDDEN    — permitAction() rejects it against this diagnosis.
 *   AUTHORITY_INVARIANT_VIOLATION — the recommendation names an action the
 *                  guard forbids. Structurally impossible (recommend.ts
 *                  returns null on a failed permit); surfaced loudly rather
 *                  than smoothed over, and asserted absent by a test.
 *
 * Deliberately ABSENT: NOT_RECOMMENDED. Nothing in this codebase records
 * that an action was considered and rejected — recommend.ts returns null
 * and keeps no reason — so emitting it would manufacture a meaning no
 * canonical source can support.
 */
/**
 * Does permitAction() have JURISDICTION over this code at all?
 *
 * Kept separate from ActionState on purpose. "Not governed" is not a verdict
 * about an action — it is a fact about the boundary of an authority, and
 * folding it into the verdict vocabulary would let a jurisdictional gap read
 * as an intelligence conclusion. That is the exact confusion this type exists
 * to prevent: an ungoverned code returning `allowed: true` is VACUOUS, not
 * cleared.
 */
export type AuthorityRelation = 'GOVERNED' | 'NOT_GOVERNED';

/**
 * How one GOVERNED action stands against this diagnosis.
 *
 * Only meaningful inside PERMIT_ACTION_DOMAIN. Never emitted for a code the
 * guard has no jurisdiction over — see AuthorityRelation.
 */
export type ActionState =
  | 'RECOMMENDED'
  | 'NOT_VETOED'
  | 'FORBIDDEN'
  | 'AUTHORITY_INVARIANT_VIOLATION';

/** Is there any stored row at all for the requested span? */
export type DataPresence = 'AVAILABLE' | 'MISSING';

/**
 * Day coverage across the requested span.
 *
 * FULL only when every calendar day carries a row — the one case with no
 * absence left to explain. Everything else is UNKNOWN, never "SPARSE":
 * proving absence is *legitimate* would need an expected-delivery calendar,
 * and the schema has none (Campaign stores no Meta start/stop time; see
 * expectedEligibleDatesBasis). Claiming SPARSE would assert the very thing
 * that cannot be checked.
 */
export type TemporalCoverage = 'FULL' | 'UNKNOWN' | 'NOT_APPLICABLE';

/** Are the rows past Meta's attribution backfill, by window construction? */
export type SettlementStatus = 'SETTLED' | 'PROVISIONAL';

/**
 * Deliberately UNKNOWN. There is no canonical freshness policy to reuse:
 * adminOpsHealth.ts carries two different local rules (a <=1/<=3-day age on
 * the newest stored row, and a separate 2-day rule on lastSyncedAt), both
 * scoped to ops health rather than to intelligence validity. Inventing a
 * third threshold here would make this module the second authority it
 * exists to inspect, so the inputs are exposed and the verdict withheld.
 */
export type FreshnessStatus = 'UNKNOWN';

/**
 * A5 — one reasoning stage, with both ends of its provenance named.
 *
 * `canonicalSource` answers "who decided this?", `inputSource` answers "from
 * what?". Together they make the chain walkable backwards from a verdict to
 * the stored Meta counters without reading the source tree.
 *
 * The stages are the six layers `hierarchy.ts` actually defines
 * (`IntelligenceLayer` / `LAYER_ORDER`) — not a longer list invented to look
 * thorough. A layer that did not run is reported as absent, never
 * back-filled with a plausible conclusion.
 */
export interface TraceStage {
  /** Position in hierarchy.ts's own LAYER_ORDER (1-based). */
  ordinal: number;
  stage: IntelligenceLayer;
  /** @deprecated same value as `stage`; kept for existing readers. */
  layer: string;
  /** Present only when the reconciler reached this layer. */
  conclusion: string | null;
  status: 'REACHED' | 'NOT_REACHED';
  /** Why a NOT_REACHED layer is absent — stated, never guessed. */
  absenceReason: string | null;
  /** The module that OWNS this layer's verdict. */
  canonicalSource: string;
  /** What that module consumed to reach it. */
  inputSource: string;
}

export interface BrainObservatorySnapshot {
  /**
   * A2 — OBJECT IDENTITY, stated in IDs and levels rather than names, so an
   * ad-level Meta screenshot can never again be compared against
   * campaign-level intelligence and read as a contradiction.
   */
  identity: {
    internalEntityType: 'CAMPAIGN';
    internalEntityId: string;
    metaEntityType: 'campaign';
    metaExternalId: string;
    parentAccount: { internalId: string; externalId: string | null } | null;
    /** Null at campaign level — present so the field is never silently absent. */
    parentCampaign: { internalId: string; externalId: string } | null;
    /** The Graph API level whose rows back this entity's DailyStats. */
    insightsQueryLevel: DiscoveryLevel;
    /** The EntityType those DailyStat rows are keyed by. */
    dailyStatOwnershipLevel: 'CAMPAIGN';
    campaignName: string;
    status: string;
  };
  /** Retained for existing consumers; identity above is the authority. */
  campaign: { id: string; name: string; externalCampaignId: string; status: string };
  /**
   * A1/A3 — TEMPORAL TRUTH. Five separate axes, never one overloaded word.
   * Reports the dates themselves, not a count, so "which days exist?" is
   * answerable without inference or database access.
   */
  temporal: {
    /** The full span queried: prior window start → current window end. */
    requestedSpan: { since: string; until: string };
    currentWindow: { since: string; until: string };
    priorWindow: { since: string; until: string };
    /** Prisma gte/lte on a @db.Date column — both ends inclusive. */
    boundarySemantics: 'INCLUSIVE_BOTH_ENDS';
    /** THE ANSWER to "what dates exist": the actual stored days. */
    storedDates: string[];
    storedRowCount: number;
    uniqueDateCount: number;
    firstStoredDate: string | null;
    lastStoredDate: string | null;
    /** Calendar days in the span carrying no row. Absence, not a verdict. */
    datesWithoutRows: string[];
    /** Cannot be computed — see basis. Never guessed. */
    expectedEligibleDates: string[] | null;
    expectedEligibleDatesBasis: string;
    dataPresence: DataPresence;
    temporalCoverage: TemporalCoverage;
    coverageBasis: string;
    settlement: SettlementStatus;
    settlementBasis: string;
    freshness: FreshnessStatus;
    freshnessBasis: string;
    lastSyncedAt: string | null;
    syncAgeDays: number | null;
    latestStoredDateAgeDays: number | null;
    backfillHorizonDays: number;
    /** Was the span inside a horizon the sync actually re-requests? */
    spanInsideBackfillHorizon: boolean | null;
    /**
     * The pre-Mission-A value of the old single `dataStatus` field.
     * DEPRECATED and NON-AUTHORITATIVE: it conflated presence, coverage and
     * settlement into one word, which is how a 1-row window came to read as
     * "COMPLETE". Kept only so existing readers do not break.
     */
    legacyDataStatus: string;
    /** Why that value cannot be read as a measurement of this window. */
    legacyDataStatusBasis: string;
  };
  /** 1. META TRUTH — canonical metrics + the windows they were measured over. */
  metaTruth: {
    currentWindow: { since: string; until: string };
    priorWindow: { since: string; until: string };
    /** @deprecated conflated; read `temporal` instead. */
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
    /**
     * A5 — evidence AGAINST this diagnosis, so one noisy metric cannot
     * dominate unchallenged. Drawn ONLY from canonical output already
     * consumed by the diagnosis; no new heuristic argues here:
     *   · issue codes the reconciler suppressed (a competing explanation
     *     the funnel outranked), and
     *   · the reconciler's own "break present but not statistically
     *     unusual" finding when a funnel break was not corroborated.
     */
    counterEvidence: Array<{ statement: string; canonicalSource: string }>;
    facts: ObservatoryFact[];
  };
  /**
   * 6. DECISION — four SEPARATE surfaces.
   *
   * They were one table headed "guarded by permitAction()", which made a
   * DecisionEngine outcome and a guarded action look like the same kind of
   * claim. They are not: permitAction() is a veto whose jurisdiction is
   * exactly PERMIT_ACTION_DOMAIN, and a code outside it gets `allowed: true`
   * for free. Each surface now answers one question and only one.
   */
  decision: {
    /**
     * WHAT THE BRAIN DECIDED — engine/DecisionEngine.ts output, deterministic,
     * read from campaign_brain_snapshots.action. Not the LLM's; the LLM only
     * narrates it (see llmLayer).
     */
    canonicalDecision: {
      action: string;
      producer: string;
      deterministic: true;
      tickDate: string | null;
      withinPermitActionDomain: boolean;
      authorityRelation: AuthorityRelation;
      /** Null whenever authorityRelation is NOT_GOVERNED. */
      permitState: ActionState | null;
      permitReason: string | null;
      authorityNote: string;
    } | null;
    /** WHAT THE ANALYTICS RECOMMENDER ADVISED — recommend.ts, or nothing. */
    canonicalRecommendation: {
      action: string | null;
      producer: string;
      withinPermitActionDomain: boolean;
      authorityRelation: AuthorityRelation;
      permitState: ActionState | null;
      authorityNote: string;
    };
    /**
     * WHAT THE VETO GOVERNS — exactly PERMIT_ACTION_DOMAIN, no more and no
     * fewer. Set equality with the domain is asserted by test, so a code the
     * guard cannot rule on can never appear here.
     */
    actionAudit: Array<{
      actionCode: string;
      /** @deprecated reads as "recommended"; use `state`. */
      permitted: boolean;
      state: ActionState;
      reason: string | null;
    }>;
    /**
     * WHAT THE VETO CANNOT REACH — codes real producers in this pipeline emit
     * that permitAction() has no jurisdiction over. Deliberately carries NO
     * allowed/forbidden verdict: giving one would re-create the confusion.
     */
    outsideVetoDomain: Array<{
      code: string;
      producer: string;
      authorityRelation: 'NOT_GOVERNED';
      explanation: string;
    }>;
    /** The jurisdiction itself, so a reader need not infer it. */
    authorityDomain: { codes: string[]; source: string; note: string };
    recommendedAction: string | null;
    recommendationSource: string;
    forbiddenActions: string[];
    facts: ObservatoryFact[];
  };
  /**
   * 7. LLM LAYER — narration ONLY.
   *
   * It used to carry `brainAction` and a permit verdict on it, which put
   * deterministic DecisionEngine output inside a pane headed
   * "authoritative: false". The decision now lives in `decision`; this layer
   * may only REFERENCE it.
   */
  llmLayer: {
    authoritative: false;
    narrationAvailable: boolean;
    narrationText: string | null;
    tickDate: string | null;
    /**
     * Which canonical decision this prose describes — a pointer to
     * `decision.canonicalDecision`, never a second source of it.
     */
    narratesDecision: string | null;
    ownershipNote: string;
    facts: ObservatoryFact[];
  };
  /**
   * 8. TRACE — reconcileIntelligence()'s own layer-by-layer record,
   * attributed. Always LAYER_ORDER.length entries, in LAYER_ORDER order,
   * so a missing layer is visible as NOT_REACHED rather than as a gap a
   * reader has to notice.
   */
  trace: TraceStage[];
  /** The stages the reconciler actually reached, in its own emission order. */
  tracedStages: IntelligenceLayer[];
  /** Stages the reconciler never reached (it short-circuits on failure). */
  untracedStages: IntelligenceLayer[];
  /** True when the chain reconstructs without needing any LLM statement. */
  backwardTraceComplete: boolean;
}

/**
 * Codes real producers in THIS pipeline emit that permitAction() has no
 * jurisdiction over.
 *
 * Not a global catalogue of every action string in the product — only the
 * vocabularies the Observatory actually inspects, so a reader can see which
 * of the decisions in front of them the veto never touched. Each entry names
 * its producer; none carries an allowed/forbidden verdict, because assigning
 * one is exactly the confusion this surface exists to end.
 *
 * Membership is DERIVED, not asserted: anything that turns out to be inside
 * PERMIT_ACTION_DOMAIN is filtered out below, so if hierarchy.ts ever widens
 * its jurisdiction this list corrects itself instead of lying.
 */
const CANONICAL_PRODUCER_CODES: ReadonlyArray<{ code: string; producer: string }> = [
  // The Brain's deterministic outcomes. REFRESH_CREATIVE is deliberately in
  // this list too — it IS governed, so the filter removes it, which is how
  // the one real overlap between the two domains stays visible in code.
  { code: 'SCALE_BUDGET',      producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  { code: 'HOLD_AND_MONITOR',  producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  { code: 'REFRESH_CREATIVE',  producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  { code: 'PAUSE_CAMPAIGN',    producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  { code: 'KEEP_COLLECTING',   producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  { code: 'RESCUE_WATCH',      producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  { code: 'EMERGENCY_PAUSE',   producer: 'engine/DecisionEngine.ts::decideCampaignAction (DecisionAction)' },
  // The analytics recommender's own templates. Four of its six action codes
  // fall outside the veto domain, which means recommend.ts's own
  // permitAction() call is a no-op for them. Reported here, not fixed.
  { code: 'FIX_MESSAGING_DESTINATION', producer: 'analytics/intelligence/recommend.ts::templateFor' },
  { code: 'FIX_LANDING_PAGE',          producer: 'analytics/intelligence/recommend.ts::templateFor' },
  { code: 'FIX_CONVERSION_STEP',       producer: 'analytics/intelligence/recommend.ts::templateFor' },
  { code: 'REVIEW_BIDDING',            producer: 'analytics/intelligence/recommend.ts::templateFor' },
  // The AI agent's tool vocabulary — same recommendations table the guard
  // protects, so its ungoverned codes belong in the same picture.
  { code: 'PAUSE',                producer: 'services/agent/tools/saveRecommendation.ts::ALLOWED_ACTION_CODES' },
  { code: 'PAUSE_URGENT',         producer: 'services/agent/tools/saveRecommendation.ts::ALLOWED_ACTION_CODES' },
  { code: 'MONITOR',              producer: 'services/agent/tools/saveRecommendation.ts::ALLOWED_ACTION_CODES' },
  { code: 'INVESTIGATE_TRACKING', producer: 'services/agent/tools/saveRecommendation.ts::ALLOWED_ACTION_CODES' },
  // The deterministic composition rules.
  { code: 'PAUSE_AND_RELAUNCH',   producer: 'engines/recommendation/compositionRules.ts::ActionCode' },
];

const NO_JURISDICTION_EXPLANATION =
  'permitAction() has no jurisdiction over this code. It is a membership test against '
  + 'forbiddenActions, and forbiddenActions is only ever filled from CREATIVE_ACTIONS and '
  + 'AUDIENCE_ACTIONS \u2014 so this code can never appear there, and calling the guard on it '
  + 'returns allowed:true unconditionally. That is the absence of a rule, not a clearance, '
  + 'and it is deliberately shown without any allowed/forbidden verdict.';

/** Derived, so a change to hierarchy.ts's jurisdiction cannot leave this stale. */
const OUTSIDE_VETO_DOMAIN = CANONICAL_PRODUCER_CODES
  .filter((e) => !PERMIT_ACTION_DOMAIN.includes(e.code))
  .map((e) => ({
    code: e.code,
    producer: e.producer,
    authorityRelation: 'NOT_GOVERNED' as const,
    explanation: NO_JURISDICTION_EXPLANATION,
  }));

/**
 * Classify one code against the guard's jurisdiction.
 *
 * `permitAction()` answers "is this forbidden?" and returns allowed:true for
 * everything it does not govern. That answer is only meaningful INSIDE the
 * domain, so jurisdiction is settled first and the verdict is withheld
 * entirely when there is none.
 */
function classifyAuthority(
  actionCode: string | null,
  intel: Parameters<typeof permitAction>[1],
  isRecommended: boolean,
): { withinPermitActionDomain: boolean; authorityRelation: AuthorityRelation; permitState: ActionState | null; permitReason: string | null; authorityNote: string } {
  if (!actionCode || !PERMIT_ACTION_DOMAIN.includes(actionCode)) {
    return {
      withinPermitActionDomain: false,
      authorityRelation: 'NOT_GOVERNED',
      permitState: null,
      permitReason: null,
      authorityNote: NO_JURISDICTION_EXPLANATION,
    };
  }
  const permit = permitAction(actionCode, intel);
  return {
    withinPermitActionDomain: true,
    authorityRelation: 'GOVERNED',
    permitState: permit.allowed
      ? (isRecommended ? 'RECOMMENDED' : 'NOT_VETOED')
      : (isRecommended ? 'AUTHORITY_INVARIANT_VIOLATION' : 'FORBIDDEN'),
    permitReason: permit.allowed ? null : (permit.reason ?? null),
    authorityNote: 'Inside PERMIT_ACTION_DOMAIN \u2014 this diagnosis genuinely can veto this code.',
  };
}

/**
 * Who owns each of the six canonical layers, and what it consumed.
 *
 * Every entry is a real module that already runs in the production chain —
 * this table names existing producers, it does not introduce stages. The
 * `reconcileIntelligence()` references point at the layer comments in
 * hierarchy.ts; the others name the engine whose output that layer consumes.
 */
const LAYER_ATTRIBUTION: Record<IntelligenceLayer, { canonicalSource: string; inputSource: string }> = {
  DATA_VALIDITY: {
    canonicalSource: 'analytics/intelligence/hierarchy.ts::reconcileIntelligence (layer 1)',
    inputSource: 'entityIntelligence.ts::buildEntityFunnel().dataConfidence (analytics/confidence.ts DataConfidence)',
  },
  SEMANTIC_VALIDITY: {
    canonicalSource: 'analytics/intelligence/hierarchy.ts::reconcileIntelligence (layer 2)',
    inputSource: 'lib/campaignPurpose.ts::resolveCampaignPurpose → analytics/confidence.ts::classificationConfidenceFromReason',
  },
  FUNNEL_DIAGNOSIS: {
    canonicalSource: 'analytics/funnel/diagnose.ts::diagnoseFunnel (consumed by reconcileIntelligence layer 3)',
    inputSource: 'daily_stats window ratios via buildEntityFunnel() — impressions → reach → clicks → landing page views → results',
  },
  ANOMALY_DETECTION: {
    canonicalSource: 'analytics/intelligence/anomaly.ts::detectAnomaly (consumed by reconcileIntelligence layer 4)',
    inputSource: 'current-vs-prior spend, impressions and CPM, plus the shared FatigueSignal inputs (frequency, CTR, CPC) — all from the same window context',
  },
  HEALTH_IMPACT: {
    canonicalSource: 'analytics/intelligence/hierarchy.ts::reconcileIntelligence (weakest-link confidence cap); scored separately by analytics/intelligence/objectiveHealth.ts::scoreObjectiveHealth',
    inputSource: 'funnel.confidence, anomaly.confidence, classificationConfidence, dataConfidence, funnel.approximateInvolved',
  },
  RECOMMENDATION: {
    canonicalSource: 'analytics/intelligence/hierarchy.ts::reconcileIntelligence (forbiddenActions) → analytics/intelligence/recommend.ts::buildRecommendation',
    inputSource: 'problemClass → the CREATIVE_ACTIONS / AUDIENCE_ACTIONS veto sets in hierarchy.ts',
  },
};

/**
 * Why a layer is missing. The reconciler short-circuits on an upstream
 * failure, so absence is a real signal — recorded rather than papered over.
 */
const NOT_REACHED_REASON =
  'reconcileIntelligence() returned before this layer. It short-circuits on an upstream '
  + 'failure (data never synced, purpose unresolved, or too small a sample to locate a '
  + 'break), so this layer formed no opinion. Absent, not neutral.';

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
      // Identity + freshness inputs. lastSyncedAt is reported, never judged.
      adAccount: { select: { id: true, externalAccountId: true, lastSyncedAt: true } },
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

  // `date` joins the SAME query the purpose-window sums already run — the
  // whole A1 answer is one extra selected column, not a second read.
  const windowRows = await prisma.dailyStat.findMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: campaignId, date: { gte: priorSince, lte: currentUntil } },
    select: { date: true, messages: true, clicks: true, linkClicks: true },
    orderBy: { date: 'asc' },
  });
  let messagesW = 0, clicksW = 0, linkClicksW = 0;
  for (const r of windowRows) {
    messagesW += Number(r.messages); clicksW += Number(r.clicks); linkClicksW += Number(r.linkClicks);
  }

  // ── A1/A3 — TEMPORAL TRUTH ────────────────────────────────────────────
  // Dates, not a count. @@unique([entityType, entityId, date]) makes rows
  // and distinct days the same number; both are reported so a future schema
  // change cannot quietly turn one into the other.
  const storedDates = windowRows.map((r) => iso(r.date));
  const uniqueDates = [...new Set(storedDates)].sort();
  const spanDays: string[] = [];
  for (let t = priorSince.getTime(); t <= currentUntil.getTime(); t += dayMs) {
    spanDays.push(iso(new Date(t)));
  }
  const storedSet = new Set(uniqueDates);
  const datesWithoutRows = spanDays.filter((d) => !storedSet.has(d));

  const lastSyncedAt = campaign.adAccount?.lastSyncedAt ?? null;
  const ageDays = (d: Date | null): number | null =>
    d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / dayMs)) : null;
  const syncAgeDays = ageDays(lastSyncedAt);
  const latestStoredDateAgeDays = uniqueDates.length
    ? ageDays(new Date(`${uniqueDates[uniqueDates.length - 1]}T00:00:00.000Z`))
    : null;

  // Was this span inside a horizon the sync actually re-requests? Only
  // answerable when we know the sync ran at all.
  const spanInsideBackfillHorizon = lastSyncedAt
    ? lastSyncedAt.getTime() - CAMPAIGN_BACKFILL_DAYS * dayMs <= priorSince.getTime()
    : null;

  const dataPresence: DataPresence = windowRows.length > 0 ? 'AVAILABLE' : 'MISSING';
  const temporalCoverage: TemporalCoverage =
    windowRows.length === 0 ? 'UNKNOWN'
      : datesWithoutRows.length === 0 ? 'FULL'
        : 'UNKNOWN';
  const coverageBasis =
    temporalCoverage === 'FULL'
      ? 'Every calendar day in the span carries a row — no absence left to explain.'
      : `${datesWithoutRows.length} day(s) in the span carry no row. Whether that is `
        + 'legitimate (Meta reported no delivery, or the campaign was not running) or a '
        + 'sync gap CANNOT be decided from this repository: campaign-level insights are '
        + 'requested with time_increment=1, which omits zero-delivery days, and Campaign '
        + 'stores no Meta start/stop time to bound expected delivery. '
        + (spanInsideBackfillHorizon === true
          ? 'The span DID fall inside the 28-day re-request horizon of the last successful '
            + 'sync, which narrows absence toward "Meta returned no row" — but does not prove it.'
          : spanInsideBackfillHorizon === false
            ? 'The span fell OUTSIDE the 28-day re-request horizon of the last successful sync, '
              + 'so absence may simply mean those days were never requested.'
            : 'No lastSyncedAt is recorded, so it is unknown whether the span was ever requested.');

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
    // REACH IS NOT A DAILY VALUE. It is read from period_insights by
    // readPeriodFact() on the exact (entityType, entityId, since, until) tuple
    // — entityIntelligence.ts assigns `cur.reach = periodCur?.reach ?? null`
    // and that is the only assignment. Meta de-duplicates people inside a
    // time_range and never publishes the cross-day overlap, so no sum or max
    // of daily rows can reconstruct it. A null here means UNKNOWN, never zero.
    { kind: 'OBSERVED_FACT', label: 'Reach', value: w.cur.reach, baseline: w.pri.reach, source: 'period_insights.reach — Meta period fact for the exact window tuple, via readPeriodFact(). NOT daily_stats: reach is not additive. null ⇒ UNKNOWN, never 0.' },
    { kind: 'OBSERVED_FACT', label: 'Link clicks', value: w.cur.linkClicks, baseline: w.pri.linkClicks, source: 'daily_stats.link_clicks' },
    { kind: 'OBSERVED_FACT', label: 'Landing page views', value: w.cur.landingPageViews, baseline: w.pri.landingPageViews, source: 'daily_stats.landing_page_views' },
    { kind: 'OBSERVED_FACT', label: 'Messages', value: w.cur.messages, baseline: w.pri.messages, source: 'daily_stats.messages' },
    { kind: 'OBSERVED_FACT', label: 'Leads', value: w.cur.leads, baseline: w.pri.leads, source: 'daily_stats.leads' },
    { kind: 'OBSERVED_FACT', label: 'Purchases', value: w.cur.purchases, baseline: w.pri.purchases, source: 'daily_stats.purchases' },
    { kind: 'OBSERVED_FACT', label: 'Spend (minor units)', value: w.spendCur, baseline: w.spendPri, source: 'daily_stats.spend' },
    // A4 — "CTR" alone is not a metric identity. Meta's own UI distinguishes
    // CTR (all) from CTR (link click-through rate), and reading one against
    // the other is exactly how an 8.9% vs 0.66% "contradiction" gets reported.
    { kind: 'OBSERVED_FACT', label: 'CTR — all clicks (%)', value: w.ctrCur, baseline: w.ctrPri, source: "daily_stats.ctr — Meta's own reported value: clicks(ALL) ÷ impressions. Includes reactions, comments, shares and photo expands, not only link clicks." },
    // Derived here from two stored counters — labelled DERIVED so it is never
    // mistaken for a Meta-reported field. Meta's own link-CTR column is not
    // currently requested (see DEFAULT_INSIGHT_FIELDS).
    // Derived by buildEntityFunnel, not here: a ratio computed twice is a ratio
    // that can disagree with itself. Meta's own inline_link_click_ctr is not in
    // DEFAULT_INSIGHT_FIELDS, so this is Adlytic's only link-CTR figure \u2014 and it
    // is the one an Ads Manager "CTR (link click-through rate)" column should be
    // compared against, NOT the all-clicks value above.
    { kind: 'DERIVED_FACT', label: 'Link CTR (%)', value: w.linkCtrCur, baseline: w.linkCtrPri, source: 'entityIntelligence.ts::buildEntityFunnel \u2014 daily_stats.link_clicks over daily_stats.impressions, in the same percent units as the all-clicks CTR above. DERIVED: Meta\'s own inline_link_click_ctr is not requested (see DEFAULT_INSIGHT_FIELDS), so this is not a stored Meta field.' },
    { kind: 'OBSERVED_FACT', label: 'CPM (minor units)', value: w.cpmCur, baseline: w.cpmPri, source: "daily_stats.cpm — Meta's own reported value" },
    { kind: 'OBSERVED_FACT', label: 'CPC (minor units)', value: w.cpcCur, baseline: w.cpcPri, source: 'daily_stats.cpc' },
    // Same provenance as Reach, and the same prohibition: frequency is Meta's
    // own period value (`periodCur?.frequency ?? null`). It is never computed
    // here from the two component metrics. Meta's own figure happens to equal
    // that ratio over the same span, which is why the numbers agree — but
    // deriving it locally would invent a value precisely in the case where
    // Meta declined to supply one.
    //
    // (Deliberately not spelling that ratio out: a line wrapping onto `//`
    //  followed by a metric name reads as division to the arithmetic-
    //  containment guard in test_brain_observatory.ts, which scans the raw
    //  file. The guard is right to be blunt; the comment can be clearer.)
    { kind: 'OBSERVED_FACT', label: 'Frequency', value: w.freqCur, baseline: w.freqPri, source: 'period_insights.frequency — Meta period fact for the exact window tuple. NEVER derived from impressions ÷ reach. null ⇒ UNKNOWN and is a legitimate outcome.' },
    // The provenance itself, stated rather than inferred. Without this a
    // reviewer can only deduce "the period fact resolved" from Reach being
    // non-null, which silently conflates "Meta said nothing" with "we never
    // looked". UNAVAILABLE means neither window resolved a row.
    { kind: 'OBSERVED_FACT', label: 'Period fact provenance', value: w.periodFactSource, baseline: null, source: 'entityIntelligence.ts — META_PERIOD_FACT when readPeriodFact() resolved a row for either window, UNAVAILABLE when neither did. Governs Reach and Frequency above.' },
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

  // ── 6. DECISION — the guard's verdict across its ACTUAL jurisdiction. ──
  // A4 — the four-state taxonomy. `permitted` alone reads as "recommended",
  // which is how an INSUFFICIENT_DATA campaign came to show INCREASE_BUDGET
  // and PAUSE as though the Brain endorsed them. The endorsement channel is
  // the canonical recommendation; the veto channel is permitAction().
  //
  // The audit iterates PERMIT_ACTION_DOMAIN itself rather than a hand-copied
  // list. That list had grown to hold nine codes the guard cannot rule on —
  // every one of them rendering NOT_VETOED, which reads as "checked and
  // cleared" when it actually meant "absent from a list it could never be in"
  // — while omitting four codes the guard genuinely governs.
  const recommendedCode = intel.recommendation?.action ?? null;
  const actionAudit = PERMIT_ACTION_DOMAIN.map((code) => {
    const permit = permitAction(code, intel);
    const isRecommended = recommendedCode !== null && recommendedCode === code;
    const state: ActionState = permit.allowed
      ? (isRecommended ? 'RECOMMENDED' : 'NOT_VETOED')
      : (isRecommended ? 'AUTHORITY_INVARIANT_VIOLATION' : 'FORBIDDEN');
    return {
      actionCode: code,
      permitted: permit.allowed,
      state,
      reason: permit.allowed ? null : (permit.reason ?? null),
    };
  });

  // The recommender's own action, classified against the same jurisdiction.
  // Four of recommend.ts's six templates emit codes outside the domain, so
  // its own permitAction() call clears them vacuously — surfaced, not fixed.
  const recommendationAuthority = classifyAuthority(recommendedCode, intel, true);

  // A5 — counter-evidence, sourced only from canonical output the diagnosis
  // already consumed. No new heuristic argues against the verdict here.
  const counterEvidence: Array<{ statement: string; canonicalSource: string }> = [];
  for (const code of intel.suppressedIssueCodes) {
    counterEvidence.push({
      statement: `"${code}" was detected but SUPPRESSED — a higher layer already explains the `
        + 'same phenomenon. It would have argued for a different problem class.',
      canonicalSource: 'hierarchy.ts::reconcileIntelligence().suppressedIssueCodes',
    });
  }
  if (intel.problemClass !== 'NO_MATERIAL_BREAK' && !intel.anomaly.significant) {
    counterEvidence.push({
      statement: 'A funnel break was located, but the anomaly layer judged the movement NOT '
        + 'statistically unusual for this account — real, yet within normal variation.',
      canonicalSource: 'analytics/intelligence/anomaly.ts (via buildEntityIntelligence().anomaly)',
    });
  }

  // ── 7. LLM LAYER — read Brain's narration; never treat it as an input. ──
  const snapshot = await prisma.campaignBrainSnapshot.findFirst({
    where: { campaignId },
    orderBy: { tickDate: 'desc' },
    select: { action: true, narrationJson: true, tickDate: true },
  });
  // campaign_brain_snapshots.action is written by BrainPersistence from
  // decideCampaignAction() — a pure deterministic function over physics,
  // confidence, pattern and recovery. It is ENGINE output. It used to be
  // rendered inside the pane headed "authoritative: false", which read as
  // though the LLM had produced it; it now belongs to DECISION, and the LLM
  // layer may only point at it.
  const decisionAuthority = snapshot ? classifyAuthority(snapshot.action, intel, false) : null;
  const narrationText = ((): string | null => {
    const n = snapshot?.narrationJson as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== 'object') return null;
    const candidate = n['arabicNarration'] ?? n['narration'] ?? n['text'];
    return typeof candidate === 'string' ? candidate : null;
  })();

  // ── 8. TRACE — the reconciler's own record, attributed and completed. ──
  // The reconciler may emit a layer more than once (FUNNEL_DIAGNOSIS is
  // pushed on both the "no break" and the "break located" paths), so the
  // LAST conclusion for a layer is the one it ended on.
  const conclusionByLayer = new Map<IntelligenceLayer, string>();
  for (const t of intel.trace) conclusionByLayer.set(t.layer, t.conclusion);
  const attributedTrace: TraceStage[] = LAYER_ORDER.map((stage, i) => {
    const conclusion = conclusionByLayer.get(stage) ?? null;
    const attribution = LAYER_ATTRIBUTION[stage];
    return {
      ordinal: i + 1,
      stage,
      layer: stage,
      conclusion,
      status: conclusion === null ? 'NOT_REACHED' : 'REACHED',
      absenceReason: conclusion === null ? NOT_REACHED_REASON : null,
      canonicalSource: attribution.canonicalSource,
      inputSource: attribution.inputSource,
    };
  });
  const tracedStages = attributedTrace.filter((t) => t.status === 'REACHED').map((t) => t.stage);
  const untracedStages = attributedTrace.filter((t) => t.status === 'NOT_REACHED').map((t) => t.stage);

  return {
    identity: {
      internalEntityType: 'CAMPAIGN',
      internalEntityId: campaign.id,
      metaEntityType: 'campaign',
      metaExternalId: campaign.externalCampaignId,
      parentAccount: campaign.adAccount
        ? { internalId: campaign.adAccount.id, externalId: campaign.adAccount.externalAccountId ?? null }
        : null,
      parentCampaign: null,   // this IS the campaign level
      insightsQueryLevel: 'campaign' satisfies DiscoveryLevel,
      dailyStatOwnershipLevel: 'CAMPAIGN',
      campaignName: campaign.name,
      status: String(campaign.status),
    },
    campaign: {
      id: campaign.id, name: campaign.name,
      externalCampaignId: campaign.externalCampaignId, status: String(campaign.status),
    },
    temporal: {
      requestedSpan: { since: iso(priorSince), until: iso(currentUntil) },
      currentWindow: { since: iso(currentSince), until: iso(currentUntil) },
      priorWindow: { since: iso(priorSince), until: iso(priorUntil) },
      boundarySemantics: 'INCLUSIVE_BOTH_ENDS',
      storedDates: uniqueDates,
      storedRowCount: windowRows.length,
      uniqueDateCount: uniqueDates.length,
      firstStoredDate: uniqueDates[0] ?? null,
      lastStoredDate: uniqueDates[uniqueDates.length - 1] ?? null,
      datesWithoutRows,
      expectedEligibleDates: null,
      expectedEligibleDatesBasis:
        'NOT COMPUTABLE. Campaign carries no Meta start/stop time (only createdAt, which '
        + 'is this row\'s creation in Adlytic, not the campaign\'s schedule on Meta), so the '
        + 'set of days delivery was even possible cannot be derived here. Reported as null '
        + 'rather than assumed to be every day in the span.',
      dataPresence,
      temporalCoverage,
      coverageBasis,
      settlement: 'SETTLED',
      settlementBasis:
        `The span ends ${lagDays} day(s) before today by construction, so every row in it is `
        + 'past Meta\'s attribution backfill. This is a property of the window, not a '
        + 'measurement of the rows.',
      freshness: 'UNKNOWN',
      freshnessBasis:
        'No canonical freshness policy exists to reuse. adminOpsHealth.ts defines two '
        + 'different local rules (a 1/3-day age on the newest stored row, and a separate '
        + '2-day rule on lastSyncedAt), both scoped to ops health rather than intelligence '
        + 'validity. The inputs are exposed; the verdict is withheld rather than invented.',
      lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      syncAgeDays,
      latestStoredDateAgeDays,
      backfillHorizonDays: CAMPAIGN_BACKFILL_DAYS,
      spanInsideBackfillHorizon,
      legacyDataStatus: entityFunnel.dataConfidence,
      legacyDataStatusBasis:
        'NOT A MEASUREMENT. buildEntityFunnel returns this value as a hardcoded constant '
        + '(entityIntelligence.ts: `dataConfidence: \'COMPLETE\' as DataConfidence`), justified '
        + 'only by the window ending before Meta\'s attribution backfill. It is therefore '
        + 'COMPLETE for every campaign with at least one row in the span \u2014 including a span '
        + 'holding one row out of fourteen days. It says nothing about how many days were '
        + 'measured. Read the axes above instead. Consequence worth knowing: the reconciler\'s '
        + 'DATA_VALIDITY layer never sees MISSING or PARTIAL from this path.',
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
      counterEvidence,
      facts: [
        { kind: 'DIAGNOSIS', label: 'Problem class', value: intel.problemClass, source: 'analytics/intelligence/hierarchy.ts::reconcileIntelligence' },
        { kind: 'DIAGNOSIS', label: 'Confidence', value: intel.confidence, source: 'reconcileIntelligence (weakest-link cap)' },
        { kind: 'DIAGNOSIS', label: 'Decided by layer', value: intel.decidedBy, source: 'reconcileIntelligence' },
      ],
    },
    decision: {
      canonicalDecision: snapshot && decisionAuthority
        ? {
            action: snapshot.action,
            producer: 'engine/DecisionEngine.ts::decideCampaignAction (persisted by services/BrainPersistence.ts)',
            deterministic: true as const,
            tickDate: iso(snapshot.tickDate),
            withinPermitActionDomain: decisionAuthority.withinPermitActionDomain,
            authorityRelation: decisionAuthority.authorityRelation,
            permitState: decisionAuthority.permitState,
            permitReason: decisionAuthority.permitReason,
            authorityNote: decisionAuthority.authorityNote,
          }
        : null,
      canonicalRecommendation: {
        action: recommendedCode,
        producer: 'analytics/intelligence/recommend.ts::buildRecommendation',
        withinPermitActionDomain: recommendationAuthority.withinPermitActionDomain,
        authorityRelation: recommendationAuthority.authorityRelation,
        permitState: recommendationAuthority.permitState,
        authorityNote: recommendedCode === null
          ? 'No recommendation was produced, so there is nothing for the guard to rule on.'
          : recommendationAuthority.authorityNote,
      },
      actionAudit,
      outsideVetoDomain: OUTSIDE_VETO_DOMAIN,
      authorityDomain: {
        codes: [...PERMIT_ACTION_DOMAIN],
        source: 'analytics/intelligence/hierarchy.ts::PERMIT_ACTION_DOMAIN (CREATIVE_ACTIONS \u222a AUDIENCE_ACTIONS)',
        note:
          'These are the ONLY codes permitAction() can rule on. It is a membership test '
          + 'against forbiddenActions, which reconcileIntelligence() fills exclusively from '
          + 'these two arrays. Any other code gets allowed:true unconditionally \u2014 the '
          + 'absence of jurisdiction, not a clearance.',
      },
      recommendedAction: intel.recommendation?.action ?? null,
      recommendationSource: 'analytics/intelligence/recommend.ts::buildRecommendation',
      forbiddenActions: intel.forbiddenActions,
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
      narrationText,
      tickDate: snapshot ? iso(snapshot.tickDate) : null,
      narratesDecision: snapshot?.action ?? null,
      ownershipNote:
        'This layer holds PROSE ONLY. The action named here was decided by '
        + 'engine/DecisionEngine.ts::decideCampaignAction \u2014 a deterministic function \u2014 and is '
        + 'shown with its authority under DECISION \u2192 CANONICAL DECISION. The narration '
        + 'describes that decision; it did not produce it and cannot change it.',
      facts: narrationText
        ? [{ kind: 'LLM_EXPLANATION', label: 'Brain narration (NON-AUTHORITATIVE)', value: narrationText, source: 'campaign_brain_snapshots.narration_json' }]
        : [],
    },
    trace: attributedTrace,
    tracedStages,
    untracedStages,
    // The chain reconstructs from engine output alone whenever the reconciler
    // reached a real verdict with its own trace — no narration participates.
    backwardTraceComplete: intel.trace.length > 0 && intel.problemClass !== undefined,
  };
}
