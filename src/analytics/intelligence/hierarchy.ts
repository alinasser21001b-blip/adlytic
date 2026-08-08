// ════════════════════════════════════════════════════════════════════════
//  src/analytics/intelligence/hierarchy.ts — ONE COHERENT INTERPRETATION
//
//  Adlytic had five systems forming opinions independently: RulesEngine,
//  HealthScoreEngine, RecommendationEngine, FunnelDiagnosis and the trend
//  engine. Nothing ordered them, so the same account could be told
//  "high frequency", "delivery problem" and "creative fatigue" as if these
//  were three findings rather than three names for one thing.
//
//  ── The hierarchy (locked P5.1) ────────────────────────────────────────
//
//      DATA VALIDITY        can these numbers be trusted at all?
//            ↓
//      SEMANTIC VALIDITY    do we know what this campaign IS?
//            ↓
//      FUNNEL DIAGNOSIS     WHERE did it break?          (deterministic)
//            ↓
//      ANOMALY DETECTION    is that break UNUSUAL?       (deterministic)
//            ↓
//      HEALTH IMPACT        how much does it matter?
//            ↓
//      RECOMMENDATION       what should the merchant do?
//
//  RULE: a downstream layer may never override a higher-confidence upstream
//  fact without evidence. Concretely — if the funnel says CLICK is healthy,
//  no recommendation may say "change your creative", however much a
//  downstream heuristic wants to. `reconcile()` enforces that mechanically
//  rather than trusting each engine to behave.
// ════════════════════════════════════════════════════════════════════════

import type { FunnelDiagnosis } from '../funnel/diagnose';
import type { ProblemClass } from '../funnel/definitions';
import type { ClassificationConfidence, DataConfidence } from '../confidence';

/** Where a layer's conclusion came from, for the audit trail. */
export type IntelligenceLayer =
  | 'DATA_VALIDITY'
  | 'SEMANTIC_VALIDITY'
  | 'FUNNEL_DIAGNOSIS'
  | 'ANOMALY_DETECTION'
  | 'HEALTH_IMPACT'
  | 'RECOMMENDATION';

export const LAYER_ORDER: readonly IntelligenceLayer[] = [
  'DATA_VALIDITY',
  'SEMANTIC_VALIDITY',
  'FUNNEL_DIAGNOSIS',
  'ANOMALY_DETECTION',
  'HEALTH_IMPACT',
  'RECOMMENDATION',
];

export type Verdict = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

/** Rank so a downstream layer can be checked against an upstream one. */
const VERDICT_RANK: Record<Verdict, number> = {
  HIGH: 3, MEDIUM: 2, LOW: 1, INSUFFICIENT_DATA: 0,
};

export function isStrongerThan(a: Verdict, b: Verdict): boolean {
  return VERDICT_RANK[a] > VERDICT_RANK[b];
}

// ── The shared fatigue signal (locked P5.4) ─────────────────────────────

/**
 * ONE semantic representation of audience fatigue.
 *
 * Previously three systems described the same phenomenon in different words:
 * the HIGH_FREQUENCY detector, the funnel's reach-stage break, and the
 * intelligence system's AUDIENCE_FATIGUE rule. They are now all views of this
 * single signal, so they can no longer contradict each other.
 *
 * NOTE: the legacy HIGH_FREQUENCY detector is deliberately NOT deleted in this
 * phase — it still writes DetectedIssue rows that the recommendations page and
 * stored history depend on. It is instead SUBORDINATED: when a FatigueSignal
 * exists, it is the canonical description, and `reconcile()` suppresses the
 * duplicate frequency finding rather than emitting both.
 */
export interface FatigueSignal {
  /** Current average frequency (impressions ÷ reach). */
  frequency: number | null;
  /** Relative change vs the prior window. Positive = rising = worse. */
  frequencyChange: number | null;
  /** Relative CTR change. Negative = falling = worse. */
  ctrChange: number | null;
  /** Relative CPC change. Positive = rising = worse. */
  cpcChange: number | null;
  confidence: Verdict;
  severity: 'NONE' | 'WATCH' | 'HIGH' | 'CRITICAL';
  /** How many of the three corroborating signals fired. */
  corroboratingSignals: number;
  evidence: string[];
}

/** Meta's community fatigue band; also used by the frequency benchmark. */
export const FREQUENCY_WATCH = 3.0;
export const FREQUENCY_SATURATED = 4.0;
/** A frequency move smaller than this is noise, not fatigue. */
export const FATIGUE_MIN_FREQ_RISE = 0.15;
export const FATIGUE_MIN_CTR_DROP = 0.15;

export interface FatigueInput {
  frequency: number | null;
  priorFrequency: number | null;
  ctr: number | null;
  priorCtr: number | null;
  cpc: number | null;
  priorCpc: number | null;
  /** Impressions in the current window — the sample behind all three ratios. */
  impressions: number;
  /** Minimum impressions before fatigue may be claimed at all. */
  minImpressions?: number;
}

const rel = (cur: number | null, prior: number | null): number | null =>
  cur !== null && prior !== null && prior > 0 ? (cur - prior) / prior : null;

/**
 * Derive the single fatigue signal. Pure.
 *
 * Fatigue is a CORROBORATED pattern, never one metric crossing a line:
 * frequency rising AND clicks getting rarer AND each click costing more. One
 * of those alone is noise or a different problem wearing fatigue's clothes.
 */
export function deriveFatigueSignal(input: FatigueInput): FatigueSignal {
  const minImpressions = input.minImpressions ?? 1_000;
  const frequencyChange = rel(input.frequency, input.priorFrequency);
  const ctrChange = rel(input.ctr, input.priorCtr);
  const cpcChange = rel(input.cpc, input.priorCpc);

  const evidence: string[] = [];

  if (input.impressions < minImpressions) {
    return {
      frequency: input.frequency, frequencyChange, ctrChange, cpcChange,
      confidence: 'INSUFFICIENT_DATA', severity: 'NONE',
      corroboratingSignals: 0,
      evidence: [],   // nothing measured → nothing claimed
    };
  }

  const freqRising = frequencyChange !== null && frequencyChange >= FATIGUE_MIN_FREQ_RISE;
  const ctrFalling = ctrChange !== null && ctrChange <= -FATIGUE_MIN_CTR_DROP;
  const cpcRising = cpcChange !== null && cpcChange >= FATIGUE_MIN_FREQ_RISE;
  const corroborating = [freqRising, ctrFalling, cpcRising].filter(Boolean).length;

  const absHigh = input.frequency !== null && input.frequency >= FREQUENCY_SATURATED;
  const absWatch = input.frequency !== null && input.frequency >= FREQUENCY_WATCH;

  if (freqRising) {
    evidence.push(`التكرار ارتفع ${(frequencyChange! * 100).toFixed(1)}% إلى ${input.frequency?.toFixed(2)}`);
  } else if (absWatch) {
    evidence.push(`التكرار ${input.frequency?.toFixed(2)} داخل نطاق الإشباع (${FREQUENCY_WATCH}-${FREQUENCY_SATURATED})`);
  }
  if (ctrFalling) evidence.push(`معدل النقر انخفض ${(Math.abs(ctrChange!) * 100).toFixed(1)}%`);
  if (cpcRising) evidence.push(`تكلفة النقرة ارتفعت ${(cpcChange! * 100).toFixed(1)}%`);

  // Severity needs the PATTERN, not a single threshold crossing.
  let severity: FatigueSignal['severity'] = 'NONE';
  let confidence: Verdict = 'LOW';

  if (corroborating >= 3 || (corroborating >= 2 && absHigh)) {
    severity = 'CRITICAL'; confidence = 'HIGH';
  } else if (corroborating >= 2) {
    severity = 'HIGH'; confidence = 'HIGH';
  } else if (corroborating === 1 && absWatch) {
    severity = 'WATCH'; confidence = 'MEDIUM';
  } else if (absHigh) {
    // Frequency is high but nothing is degrading — a state, not yet a problem.
    severity = 'WATCH'; confidence = 'MEDIUM';
  } else {
    severity = 'NONE'; confidence = corroborating > 0 ? 'LOW' : 'HIGH';
    if (corroborating === 0) evidence.length = 0;   // healthy → say nothing
  }

  return {
    frequency: input.frequency, frequencyChange, ctrChange, cpcChange,
    confidence, severity, corroboratingSignals: corroborating, evidence,
  };
}

// ── The reconciled verdict ──────────────────────────────────────────────

export interface AnomalyVerdict {
  significant: boolean;
  confidence: Verdict;
  kind:
    | 'CREATIVE_FATIGUE'
    | 'DELIVERY_DEGRADATION'
    | 'POST_CLICK_DEGRADATION'
    | 'CONVERSION_DEGRADATION'
    | 'EFFICIENCY_DEGRADATION'
    | 'NONE';
  evidence: string[];
}

export interface ReconcileInput {
  /** Layer 1: are the numbers trustworthy? */
  dataConfidence: DataConfidence;
  /** Layer 2: do we know what this campaign is? */
  classificationConfidence: ClassificationConfidence;
  /** Layer 3: deterministic funnel output (P3). */
  funnel: FunnelDiagnosis | null;
  /** Layer 4: is the break unusual? */
  anomaly: AnomalyVerdict;
  /** The shared fatigue representation, if any. */
  fatigue: FatigueSignal | null;
}

export interface ReconciledIntelligence {
  /** The single problem class the whole system agrees on. */
  problemClass: ProblemClass;
  /** Overall confidence after every cap has been applied. */
  confidence: Verdict;
  /** Which layer decided the outcome. */
  decidedBy: IntelligenceLayer;
  /** Should the merchant be alerted at all? */
  alert: boolean;
  /**
   * Issue codes a downstream engine must NOT raise, because a higher layer
   * already explains the same phenomenon. This is what stops three systems
   * describing one thing three ways.
   */
  suppressedIssueCodes: string[];
  /**
   * Actions a recommendation engine is FORBIDDEN to suggest, because the
   * funnel measured that part of the machine as healthy.
   */
  forbiddenActions: string[];
  evidence: string[];
  /** Human-readable trace of how each layer contributed. */
  trace: Array<{ layer: IntelligenceLayer; conclusion: string }>;
}

/** Actions that only make sense when the CLICK stage is the problem. */
const CREATIVE_ACTIONS = ['REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'CHANGE_CREATIVE', 'NEW_CREATIVE'];
/** Actions that only make sense when DELIVERY is the problem. */
const AUDIENCE_ACTIONS = ['EXPAND_AUDIENCE', 'WIDEN_TARGETING', 'INCREASE_BUDGET'];

/**
 * Collapse every layer into ONE verdict, enforcing the hierarchy.
 *
 * Deterministic. No LLM participates in this decision — see PART D.
 */
export function reconcileIntelligence(input: ReconcileInput): ReconciledIntelligence {
  const trace: ReconciledIntelligence['trace'] = [];
  const suppressed: string[] = [];
  const forbidden: string[] = [];

  // ── Layer 1: DATA VALIDITY. Nothing downstream matters if this fails. ──
  if (input.dataConfidence === 'MISSING') {
    trace.push({ layer: 'DATA_VALIDITY', conclusion: 'source data never synced — no interpretation is possible' });
    return {
      problemClass: 'NO_MATERIAL_BREAK', confidence: 'INSUFFICIENT_DATA',
      decidedBy: 'DATA_VALIDITY', alert: false,
      suppressedIssueCodes: [], forbiddenActions: [], evidence: [], trace,
    };
  }
  trace.push({ layer: 'DATA_VALIDITY', conclusion: `data ${input.dataConfidence.toLowerCase()}` });

  // ── Layer 2: SEMANTIC VALIDITY. Unknown purpose → no objective claims. ──
  if (input.classificationConfidence === 'UNKNOWN') {
    trace.push({ layer: 'SEMANTIC_VALIDITY', conclusion: 'campaign purpose unresolved — objective-specific claims withheld' });
    return {
      problemClass: 'NO_MATERIAL_BREAK', confidence: 'INSUFFICIENT_DATA',
      decidedBy: 'SEMANTIC_VALIDITY', alert: false,
      suppressedIssueCodes: [], forbiddenActions: [], evidence: [], trace,
    };
  }
  trace.push({ layer: 'SEMANTIC_VALIDITY', conclusion: `classification ${input.classificationConfidence.toLowerCase()}` });

  // ── Layer 3: FUNNEL DIAGNOSIS — WHERE it broke. ────────────────────────
  const funnel = input.funnel;
  if (!funnel || funnel.status === 'INSUFFICIENT_DATA') {
    trace.push({ layer: 'FUNNEL_DIAGNOSIS', conclusion: 'insufficient sample to locate a break' });
    return {
      problemClass: 'NO_MATERIAL_BREAK', confidence: 'INSUFFICIENT_DATA',
      decidedBy: 'FUNNEL_DIAGNOSIS', alert: false,
      suppressedIssueCodes: [], forbiddenActions: [], evidence: [], trace,
    };
  }

  if (funnel.status === 'NO_MATERIAL_BREAK') {
    trace.push({ layer: 'FUNNEL_DIAGNOSIS', conclusion: 'no funnel ratio materially degraded' });
    // Fatigue can still be a standing state worth watching even with no break.
    if (input.fatigue && input.fatigue.severity !== 'NONE' && input.fatigue.confidence !== 'INSUFFICIENT_DATA') {
      suppressed.push('HIGH_FREQUENCY');   // the FatigueSignal is canonical
      trace.push({ layer: 'ANOMALY_DETECTION', conclusion: `fatigue ${input.fatigue.severity.toLowerCase()} without a funnel break` });
      return {
        problemClass: 'DELIVERY', confidence: input.fatigue.confidence,
        decidedBy: 'ANOMALY_DETECTION',
        alert: input.fatigue.severity === 'CRITICAL' || input.fatigue.severity === 'HIGH',
        suppressedIssueCodes: suppressed, forbiddenActions: [],
        evidence: input.fatigue.evidence, trace,
      };
    }
    return {
      problemClass: 'NO_MATERIAL_BREAK', confidence: 'HIGH',
      decidedBy: 'FUNNEL_DIAGNOSIS', alert: false,
      suppressedIssueCodes: [], forbiddenActions: [], evidence: [], trace,
    };
  }

  const problemClass = funnel.problemClass;
  trace.push({ layer: 'FUNNEL_DIAGNOSIS', conclusion: `break at ${funnel.degradedStage ?? 'efficiency'} → ${problemClass}` });

  // THE KEY GUARD (P5.6): the funnel measured which parts of the machine are
  // fine. Downstream may not contradict that measurement.
  if (problemClass === 'POST_CLICK' || problemClass === 'CONVERSION') {
    // Upstream (impressions → reach → clicks) was verified healthy.
    forbidden.push(...CREATIVE_ACTIONS, ...AUDIENCE_ACTIONS);
    suppressed.push('LOW_CTR', 'HIGH_FREQUENCY', 'AUDIENCE_FATIGUE');
  } else if (problemClass === 'CLICK') {
    // The creative IS the problem — audience-size actions would misdirect.
    forbidden.push(...AUDIENCE_ACTIONS);
  } else if (problemClass === 'DELIVERY') {
    // Fatigue/saturation is the canonical description; don't also blame creative.
    suppressed.push('HIGH_FREQUENCY');
  }

  // ── Layer 4: ANOMALY — is that break UNUSUAL? (P5.3) ───────────────────
  const anomaly = input.anomaly;
  trace.push({
    layer: 'ANOMALY_DETECTION',
    conclusion: anomaly.significant
      ? `${anomaly.kind} judged significant`
      : 'break present but not statistically unusual',
  });

  // A funnel break that is NOT anomalous is real but not alert-worthy: the
  // ratio moved, the movement is within this account's normal variation.
  const alert = anomaly.significant;

  // ── Confidence: the WEAKEST link in the chain wins. ────────────────────
  let confidence: Verdict = (funnel.confidence ?? 'LOW') as Verdict;
  if (!anomaly.significant && isStrongerThan(confidence, 'MEDIUM')) confidence = 'MEDIUM';
  if (isStrongerThan(confidence, anomaly.confidence)) confidence = anomaly.confidence;
  if (funnel.approximateInvolved) confidence = 'LOW';           // rule 8
  if (input.classificationConfidence === 'EVIDENCE' && isStrongerThan(confidence, 'MEDIUM')) {
    confidence = 'MEDIUM';   // classification itself was inferred from results
  }
  if (input.dataConfidence === 'PARTIAL' && isStrongerThan(confidence, 'MEDIUM')) {
    confidence = 'MEDIUM';
  }

  const evidence = [...funnel.evidence];
  if (anomaly.significant) evidence.push(...anomaly.evidence);
  // Fatigue evidence only belongs where fatigue is the explanation.
  if (input.fatigue && problemClass === 'DELIVERY' && input.fatigue.severity !== 'NONE') {
    evidence.push(...input.fatigue.evidence);
  }

  trace.push({ layer: 'HEALTH_IMPACT', conclusion: `confidence capped at ${confidence}` });
  trace.push({
    layer: 'RECOMMENDATION',
    conclusion: forbidden.length
      ? `forbidden: ${forbidden.slice(0, 3).join(', ')}${forbidden.length > 3 ? '…' : ''}`
      : 'no action constraints',
  });

  return {
    problemClass, confidence, decidedBy: 'FUNNEL_DIAGNOSIS', alert,
    suppressedIssueCodes: [...new Set(suppressed)],
    forbiddenActions: [...new Set(forbidden)],
    evidence, trace,
  };
}

/**
 * Guard a recommendation against the reconciled diagnosis.
 *
 * Returns null when the action contradicts a measured-healthy stage. Used by
 * the recommendation layer so "change your creative" cannot survive a
 * POST_CLICK diagnosis, however confident the heuristic that produced it.
 */
export function permitAction(
  actionCode: string | null | undefined,
  reconciled: ReconciledIntelligence,
): { allowed: boolean; reason?: string } {
  if (!actionCode) return { allowed: true };
  if (reconciled.forbiddenActions.includes(actionCode)) {
    return {
      allowed: false,
      reason: `"${actionCode}" contradicts the funnel: the ${reconciled.problemClass} diagnosis rests on the upstream stages being measured healthy`,
    };
  }
  return { allowed: true };
}
