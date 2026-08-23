// ════════════════════════════════════════════════════════════════════════
//  src/services/operationalTruth.ts
//
//  THE CANONICAL OPERATIONAL TRUTH MODEL.
//
//  ── WHY THIS EXISTS ───────────────────────────────────────────────────
//
//  adminOpsHealth.ts had ONE scalar enum — HEALTHY, RUNNING, UNKNOWN,
//  NOT_TESTED, DEGRADED, WARNING, BLOCKED, ERROR — ranked by a single
//  SEVERITY index. That one value was forced to answer six independent
//  questions at once, and the console's worst symptoms were all the same
//  bug wearing different clothes:
//
//    • Redis is deliberately not configured    → rendered NOT_TESTED
//    • BullMQ is deliberately disabled          → rendered NOT_TESTED
//    • No workspace has been selected           → folded into subsystem health
//    • Telemetry could not be read              → rendered as the number 0
//    • A 48-hour-old success                    → rendered as current health
//
//  None of those are the same kind of fact, and NOT_TESTED ranked WORSE
//  than UNKNOWN in that severity table, so an optional dependency nobody
//  ever needed dragged an aggregate down through worstOf().
//
//  The fix is not more enum values. It is to stop asking one scalar to
//  answer six questions. Health, knowledge, configuration, requiredness,
//  context and freshness are INDEPENDENT DIMENSIONS. A subsystem can be
//  perfectly healthy AND not configured AND not required — that is exactly
//  what Redis is in this deployment, and the old model could not say it.
//
//  ── THE RULE THAT KILLS THE FALSE FAILURES ────────────────────────────
//
//  Health answers "what is the operational consequence RIGHT NOW".
//  Configuration answers "did we set it up".
//  Requiredness answers "does the CURRENT topology need it".
//
//  A NOT_CONFIGURED dependency that is OPTIONAL or NOT_REQUIRED is
//  HEALTHY, because the consequence is nothing. It is not broken, not
//  unknown, and not untested. It is off on purpose and everything works.
//
//  ── THE RULE THAT KILLS THE FABRICATED ZEROS ──────────────────────────
//
//  measurement=NOT_MEASURABLE means we could not measure. A consumer that
//  reads a number in that state is reading a value that was never observed.
//  Numeric carriers in this model are `number | null`, never a defaulted 0,
//  so "we did not measure" cannot be typed as "we measured zero".
//
//  ── WHAT THIS MODULE IS NOT ───────────────────────────────────────────
//
//  Not an observability framework. It observes NOTHING — no probes, no
//  network, no database. It is a vocabulary plus the projection rules that
//  keep that vocabulary honest. Producers (adminOpsHealth and friends) do
//  the observing and hand their evidence here to be shaped.
// ════════════════════════════════════════════════════════════════════════

// ── the six independent dimensions ──────────────────────────────────────

/**
 * EFFECT — the operational consequence right now, and nothing else.
 *
 * Deliberately has no NOT_TESTED and no NOT_CONFIGURED member: those are
 * answers to different questions and live on their own axes below. That
 * separation is the entire point of this model.
 */
export const OPS_HEALTH = ['HEALTHY', 'DEGRADED', 'FAILED', 'BLOCKED', 'UNKNOWN'] as const;
export type OpsHealth = (typeof OPS_HEALTH)[number];

/**
 * KNOWLEDGE — how we came to the health value.
 *
 * NOT_TESTED means a meaningful probe EXISTS and has not run yet.
 * NOT_MEASURABLE means the system genuinely cannot measure the fact —
 * the telemetry backend is absent, so there is no number to be had.
 * The two are not interchangeable, and neither one is a zero.
 */
export const OPS_MEASUREMENT = ['OBSERVED', 'NOT_TESTED', 'NOT_MEASURABLE', 'UNKNOWN'] as const;
export type OpsMeasurement = (typeof OPS_MEASUREMENT)[number];

/** CONFIGURATION — did an operator set this up. Says nothing about health. */
export const OPS_CONFIGURATION = ['CONFIGURED', 'NOT_CONFIGURED', 'NOT_APPLICABLE'] as const;
export type OpsConfiguration = (typeof OPS_CONFIGURATION)[number];

/**
 * REQUIREDNESS — does the CURRENT topology and mode need this.
 *
 * Evaluated against the running configuration, not against some ideal
 * deployment: BullMQ is NOT_REQUIRED while the queue runs in-process, and
 * background execution is NOT_REQUIRED on a SERVICE_ROLE=api reader.
 */
export const OPS_REQUIREDNESS = ['REQUIRED', 'OPTIONAL', 'NOT_REQUIRED'] as const;
export type OpsRequiredness = (typeof OPS_REQUIREDNESS)[number];

/**
 * CONTEXT — operator/user selection. NOT infrastructure health.
 *
 * "No workspace selected" is a statement about the person using the
 * console, not about the platform. It must never colour a subsystem.
 */
export const OPS_CONTEXT = ['SELECTED', 'NOT_SELECTED', 'NOT_APPLICABLE'] as const;
export type OpsContext = (typeof OPS_CONTEXT)[number];

/** FRESHNESS — is the evidence still inside its confidence window. */
export const OPS_FRESHNESS = ['CURRENT', 'STALE', 'UNKNOWN'] as const;
export type OpsFreshness = (typeof OPS_FRESHNESS)[number];

/** ACTIONABILITY — can a human do anything, and is it theirs to do. */
export const OPS_ACTIONABILITY = [
  'NONE',            // nothing to do; this is the intended state
  'INFO',            // worth knowing, no action
  'WAIT',            // transient upstream condition; retry resolves it
  'OPERATOR_ACTION', // a platform operator must act
  'USER_CONTEXT',    // the viewer must choose something (not a fault)
] as const;
export type OpsActionability = (typeof OPS_ACTIONABILITY)[number];

/** Presentation severity. Derived, never a second source of truth. */
export const OPS_SEVERITY = ['NONE', 'INFO', 'WARNING', 'ERROR'] as const;
export type OpsSeverity = (typeof OPS_SEVERITY)[number];

// ── reason codes ────────────────────────────────────────────────────────

/**
 * Machine-readable causes. The Admin UI renders from THESE, never by
 * parsing the Arabic `summary` — a consumer that string-matches human copy
 * breaks the first time someone improves a sentence.
 *
 * Every code here must be provable by a producer in this repository. Codes
 * nobody can prove are not aspirations, they are lies with a constant name.
 */
export const OPS_REASON_CODES = [
  // generic
  'OK',
  'NOT_CONFIGURED_OPTIONAL',
  'NOT_CONFIGURED_REQUIRED',
  'NEVER_PROBED',
  'TELEMETRY_UNAVAILABLE',
  'CONTEXT_NOT_SELECTED',
  'OBSERVATION_STALE',
  // database
  'DB_UNREACHABLE',
  // queue / redis
  'QUEUE_IN_PROCESS_FALLBACK',
  'QUEUE_BULLMQ_ACTIVE',
  'QUEUE_BULLMQ_ENABLED_BUT_BROKER_DOWN',
  'REDIS_ABSENT_BY_DESIGN',
  'REDIS_CONFIGURED_BUT_UNREACHABLE',
  // background execution
  'BACKGROUND_NOT_REQUIRED_FOR_ROLE',
  'BACKGROUND_RECENT_SUCCESS',
  'BACKGROUND_NO_RECENT_EVIDENCE',
  // meta — token axis
  'META_NO_TOKEN',
  'META_TOKEN_EXPIRED',
  // meta — account axis
  'META_ACCOUNT_DISABLED_BY_META',
  /** Meta's IN_GRACE_PERIOD — still delivering, will stop unless the
   *  outstanding balance is paid. A real, named, NON-halted state per
   *  campaignLifecycle.ts's accountDeliveryHold(); distinct from an actual
   *  block so a still-delivering account is not reported as one. */
  'META_ACCOUNT_GRACE_PERIOD',
  'META_ACCOUNT_INACTIVE_LOCALLY',
  // meta — transport / data axis
  'META_SYNC_FAILED',
  'META_DATA_STALE',
  'META_NO_ACCOUNT_CONNECTED',
  // intelligence
  'BRAIN_DETERMINISTIC_OK',
  'LLM_NOT_CONFIGURED',
  'LLM_NOT_PROBED',
] as const;
export type OpsReasonCode = (typeof OPS_REASON_CODES)[number];

// ── the assessment ──────────────────────────────────────────────────────

/**
 * One subsystem's operational truth.
 *
 * `observedAt` is null exactly when nothing was observed. A consumer can
 * therefore tell "healthy as of ten seconds ago" from "healthy because the
 * question does not apply" without reading prose.
 */
export interface OperationalAssessment {
  /** Stable machine key. The UI maps this to a label; it is not a label. */
  key: string;
  health: OpsHealth;
  reasonCode: OpsReasonCode;
  /** One short Arabic clause. Human copy — never parsed for state. */
  summary: string;
  /** Optional LTR technical line. Sanitized. Never a secret. */
  detail?: string;
  configuration: OpsConfiguration;
  requiredness: OpsRequiredness;
  measurement: OpsMeasurement;
  context: OpsContext;
  /** Subsystem-specific operating mode, e.g. queue IN_PROCESS vs BULLMQ. */
  mode?: string;
  /** When the evidence was gathered. null ⇔ nothing was observed. */
  observedAt: string | null;
  freshness: OpsFreshness;
  severity: OpsSeverity;
  actionability: OpsActionability;
  /** Which producer resolved this — provenance, not decoration. */
  source: string;
  /** Short machine-ish evidence note. Sanitized. */
  evidence?: string;
}

// ── derivation rules ────────────────────────────────────────────────────

/**
 * Severity from the dimensions. ONE place, so the console cannot drift
 * from the graph.
 *
 * The first rule is the one that removes the false failures: an absent
 * dependency the current topology does not need is not a problem, and
 * saying so in colour is how an operator learns to ignore colour.
 */
export function deriveSeverity(a: Omit<OperationalAssessment, 'severity'>): OpsSeverity {
  if (a.configuration === 'NOT_CONFIGURED' && a.requiredness !== 'REQUIRED') return 'NONE';
  if (a.context === 'NOT_SELECTED') return 'INFO';
  switch (a.health) {
    case 'HEALTHY': return a.freshness === 'STALE' ? 'INFO' : 'NONE';
    case 'DEGRADED': return 'WARNING';
    case 'BLOCKED': return 'ERROR';
    case 'FAILED': return 'ERROR';
    case 'UNKNOWN': return a.requiredness === 'REQUIRED' ? 'WARNING' : 'INFO';
  }
}

/**
 * Freshness from an observation time and a domain-specific window.
 *
 * The window is a PARAMETER on purpose. A Meta token expiry and a Redis
 * ping do not age at the same rate, and one universal TTL would either
 * call a fresh token stale or call a dead connection current.
 */
export function deriveFreshness(observedAt: string | null, maxAgeMs: number, now = Date.now()): OpsFreshness {
  if (observedAt === null) return 'UNKNOWN';
  const t = Date.parse(observedAt);
  if (!Number.isFinite(t)) return 'UNKNOWN';
  return now - t <= maxAgeMs ? 'CURRENT' : 'STALE';
}

// ── the legacy projection — exactly one ─────────────────────────────────

/**
 * The pre-existing scalar vocabulary, kept so the shipped Admin console
 * keeps rendering while it migrates to the fields above.
 *
 * THIS IS THE ONLY PLACE THE LEGACY VALUE IS DERIVED. Admin, the graph
 * overlay and every route read it from here. The alternative — each
 * consumer mapping for itself — is how three surfaces end up disagreeing
 * about one subsystem, which is the failure this whole module exists to
 * end.
 *
 * Note what it deliberately does: an intentionally-absent optional
 * dependency projects to HEALTHY, not NOT_TESTED. That single line is what
 * turns "Redis — not tested" and "Queue — disabled" from warnings into the
 * accurate statement that nothing is wrong.
 */
export type LegacyOpsStatus =
  | 'HEALTHY' | 'RUNNING' | 'UNKNOWN' | 'NOT_TESTED'
  | 'DEGRADED' | 'WARNING' | 'BLOCKED' | 'ERROR';

export function toLegacyOpsStatus(a: OperationalAssessment): LegacyOpsStatus {
  if (a.configuration === 'NOT_CONFIGURED' && a.requiredness !== 'REQUIRED') return 'HEALTHY';
  if (a.context === 'NOT_SELECTED') return 'NOT_TESTED';
  if (a.measurement === 'NOT_TESTED') return 'NOT_TESTED';
  if (a.measurement === 'NOT_MEASURABLE') return 'UNKNOWN';
  switch (a.health) {
    case 'HEALTHY': return 'HEALTHY';
    case 'DEGRADED': return 'DEGRADED';
    case 'BLOCKED': return 'BLOCKED';
    case 'FAILED': return 'ERROR';
    case 'UNKNOWN': return 'UNKNOWN';
  }
}

// ── builders for the shapes that recur ──────────────────────────────────

type Base = {
  key: string;
  summary: string;
  source: string;
  detail?: string;
  evidence?: string;
  mode?: string;
};

function finish(a: Omit<OperationalAssessment, 'severity'>): OperationalAssessment {
  return { ...a, severity: deriveSeverity(a) };
}

/**
 * Something we genuinely looked at, right now.
 * `observedAt` is required — an observation without a time is a claim
 * without an expiry date, which is how a 48-hour-old success gets rendered
 * as current health.
 */
export function observed(
  b: Base & {
    health: OpsHealth;
    reasonCode: OpsReasonCode;
    observedAt: string;
    requiredness?: OpsRequiredness;
    freshness?: OpsFreshness;
    actionability?: OpsActionability;
    context?: OpsContext;
  },
): OperationalAssessment {
  return finish({
    key: b.key,
    health: b.health,
    reasonCode: b.reasonCode,
    summary: b.summary,
    ...(b.detail !== undefined ? { detail: b.detail } : {}),
    ...(b.evidence !== undefined ? { evidence: b.evidence } : {}),
    ...(b.mode !== undefined ? { mode: b.mode } : {}),
    configuration: 'CONFIGURED',
    requiredness: b.requiredness ?? 'REQUIRED',
    measurement: 'OBSERVED',
    context: b.context ?? 'NOT_APPLICABLE',
    observedAt: b.observedAt,
    freshness: b.freshness ?? 'CURRENT',
    actionability: b.actionability ?? (b.health === 'HEALTHY' ? 'NONE' : 'OPERATOR_ACTION'),
    source: b.source,
  });
}

/**
 * Off on purpose, and nothing needs it. The single most important builder
 * here: this is Redis and BullMQ in the current production deployment, and
 * it is the difference between an honest console and a red one.
 */
export function notConfiguredOptional(
  b: Base & { reasonCode: OpsReasonCode; requiredness?: 'OPTIONAL' | 'NOT_REQUIRED' },
): OperationalAssessment {
  return finish({
    key: b.key,
    health: 'HEALTHY',
    reasonCode: b.reasonCode,
    summary: b.summary,
    ...(b.detail !== undefined ? { detail: b.detail } : {}),
    ...(b.evidence !== undefined ? { evidence: b.evidence } : {}),
    ...(b.mode !== undefined ? { mode: b.mode } : {}),
    configuration: 'NOT_CONFIGURED',
    requiredness: b.requiredness ?? 'OPTIONAL',
    // We know exactly what it is doing — nothing, by configuration. That is
    // knowledge, not an absence of it, so this is OBSERVED rather than
    // NOT_TESTED. Calling it untested implies a probe we owe and never ran.
    measurement: 'OBSERVED',
    context: 'NOT_APPLICABLE',
    observedAt: null,
    freshness: 'UNKNOWN',
    actionability: 'NONE',
    source: b.source,
  });
}

/** Configured and needed, but absent — a real problem. */
export function notConfiguredRequired(b: Base & { reasonCode: OpsReasonCode }): OperationalAssessment {
  return finish({
    key: b.key,
    health: 'FAILED',
    reasonCode: b.reasonCode,
    summary: b.summary,
    ...(b.detail !== undefined ? { detail: b.detail } : {}),
    ...(b.evidence !== undefined ? { evidence: b.evidence } : {}),
    configuration: 'NOT_CONFIGURED',
    requiredness: 'REQUIRED',
    measurement: 'OBSERVED',
    context: 'NOT_APPLICABLE',
    observedAt: null,
    freshness: 'UNKNOWN',
    actionability: 'OPERATOR_ACTION',
    source: b.source,
  });
}

/**
 * A probe exists and has not run. Health is UNKNOWN because we do not
 * know — not HEALTHY, and not FAILED.
 */
export function notTested(b: Base & { requiredness?: OpsRequiredness }): OperationalAssessment {
  return finish({
    key: b.key,
    health: 'UNKNOWN',
    reasonCode: 'NEVER_PROBED',
    summary: b.summary,
    ...(b.detail !== undefined ? { detail: b.detail } : {}),
    ...(b.evidence !== undefined ? { evidence: b.evidence } : {}),
    configuration: 'CONFIGURED',
    requiredness: b.requiredness ?? 'OPTIONAL',
    measurement: 'NOT_TESTED',
    context: 'NOT_APPLICABLE',
    observedAt: null,
    freshness: 'UNKNOWN',
    actionability: 'INFO',
    source: b.source,
  });
}

/**
 * The fact cannot be measured at all — the telemetry source is gone.
 * Callers pairing this with a numeric MUST emit null, never 0.
 */
export function notMeasurable(b: Base & { requiredness?: OpsRequiredness }): OperationalAssessment {
  return finish({
    key: b.key,
    health: 'UNKNOWN',
    reasonCode: 'TELEMETRY_UNAVAILABLE',
    summary: b.summary,
    ...(b.detail !== undefined ? { detail: b.detail } : {}),
    ...(b.evidence !== undefined ? { evidence: b.evidence } : {}),
    configuration: 'CONFIGURED',
    requiredness: b.requiredness ?? 'OPTIONAL',
    measurement: 'NOT_MEASURABLE',
    context: 'NOT_APPLICABLE',
    observedAt: null,
    freshness: 'UNKNOWN',
    actionability: 'INFO',
    source: b.source,
  });
}

/**
 * The viewer has not chosen a workspace / account / entity.
 * Health stays HEALTHY: nothing is broken, the question is simply not
 * answerable until someone picks something.
 */
export function contextNotSelected(b: Base): OperationalAssessment {
  return finish({
    key: b.key,
    health: 'HEALTHY',
    reasonCode: 'CONTEXT_NOT_SELECTED',
    summary: b.summary,
    ...(b.detail !== undefined ? { detail: b.detail } : {}),
    configuration: 'NOT_APPLICABLE',
    requiredness: 'NOT_REQUIRED',
    measurement: 'OBSERVED',
    context: 'NOT_SELECTED',
    observedAt: null,
    freshness: 'UNKNOWN',
    actionability: 'USER_CONTEXT',
    source: b.source,
  });
}

// ── aggregation ─────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<OpsSeverity, number> = { NONE: 0, INFO: 1, WARNING: 2, ERROR: 3 };

/**
 * Roll several assessments into the worst SEVERITY, not the worst status.
 *
 * Aggregating on severity rather than on the old status index is what stops
 * an intentionally-absent optional dependency from dominating the summary:
 * its severity is NONE, so it contributes nothing, which is correct.
 */
export function worstSeverity(list: OperationalAssessment[]): OpsSeverity {
  let worst: OpsSeverity = 'NONE';
  for (const a of list) if (SEVERITY_ORDER[a.severity] > SEVERITY_ORDER[worst]) worst = a.severity;
  return worst;
}
