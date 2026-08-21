// ════════════════════════════════════════════════════════════════════════
//  src/analytics/evidence.ts — WHAT WAS OBSERVED, not what it means
//
//  Evidence is a single measured fact: one metric, one value, kept
//  structurally separate from interpretation. A Diagnosis narrative may
//  read Evidence to ground its prose in real numbers; Evidence itself
//  never carries diagnosis text, and a Recommendation is never stored as
//  if it were Evidence.
//
//  First production slice (Phase 3): the five rule detectors
//  (src/engines/rules/detect*.ts) and detected_issues.evidence_json,
//  replacing that column's previous ad hoc Record<string, unknown> shape
//  (a different, independently-authored bag per detector, with only an
//  informal `confidence` key in common). Other producers — V5's
//  CampaignIssue.evidence (pre-rendered prose, deliberately not JSON),
//  the Brain's physics/pattern/decision output, funnel diagnosis — are
//  NOT migrated onto this type yet. See the Phase 3 session report for
//  the full inventory and why this slice was chosen first.
// ════════════════════════════════════════════════════════════════════════

/**
 * 'level'  — an absolute current-period snapshot (e.g. currentCtr = 0.8).
 * 'trend'  — a period-over-period fractional delta (e.g. frequencyTrend =
 *            0.22, meaning "+22%" — see severity.ts's own "fractional,
 *            e.g. 0.30 for +30%" convention, which this mirrors).
 */
export type EvidenceValueKind = 'level' | 'trend';

/** Only the units this migration's producers actually emit. */
export type EvidenceUnit = 'percent' | 'ratio' | 'count';

/** One observed metric value. Never a diagnosis, never a recommendation. */
export interface Evidence {
  /**
   * Matches this repo's existing Signals/DailyStat field vocabulary (ctr,
   * frequency, resultsTrend, spendTrend, results, ...) — no new metric
   * vocabulary invented, no second objective-mapping table.
   */
  metricKey: string;
  valueKind: EvidenceValueKind;
  unit: EvidenceUnit;
  value: number;
  /**
   * The detector's own threshold for this metric, when it fired as a
   * single-metric threshold check. Null when the detector doesn't gate on
   * this specific metric alone (e.g. one corroborating signal inside a
   * multi-signal pattern, where no individual metric has its own line).
   */
  threshold: number | null;
  /**
   * How far past threshold, in the same fractional-magnitude units
   * severity.ts's severityFromMagnitude() already consumes. Null when no
   * threshold applies to this metric.
   */
  relativeToThreshold: number | null;
}

/**
 * How a confidence NUMBER was arrived at. The detectors migrated in this
 * slice have exactly two kinds today — a real corroboration-count formula
 * (AUDIENCE_FATIGUE) versus an author-assigned constant (the other four) —
 * and they are not equivalent, so the basis travels with the number rather
 * than being merged away.
 */
export type ConfidenceBasis = 'measured_corroboration' | 'heuristic_constant';

export interface IssueConfidence {
  /** 0..1 — same range and same numbers this repo already used. */
  value: number;
  basis: ConfidenceBasis;
}

/**
 * detected_issues.evidence_json's on-the-wire shape. Wraps evidence +
 * confidence + window into the ONE existing Json column — purely additive,
 * no migration: the column already accepted any JSON-serializable value.
 */
export interface PersistedIssueEvidence {
  metrics: Evidence[];
  confidence: IssueConfidence;
  window: { days: number } | null;
}

export type ParsedIssueEvidence =
  | {
      status: 'CANONICAL';
      metrics: Evidence[];
      confidence: IssueConfidence;
      window: { days: number } | null;
    }
  | { status: 'LEGACY'; raw: Record<string, unknown> };

/**
 * Reads a detected_issues.evidence_json value back into typed form.
 *
 * Rows written before this migration carry the OLD flat shape
 * ({currentCtr, threshold, confidence, ...} — a single object, no
 * `metrics` array). Detected by the presence of a `metrics` array; never
 * guessed at. A row that doesn't match is explicitly LEGACY, not silently
 * misread as canonical with fields missing — the caller decides how (or
 * whether) to degrade, rather than this function fabricating an answer.
 */
export function parseIssueEvidenceJson(raw: unknown): ParsedIssueEvidence {
  if (
    raw != null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Array.isArray((raw as Record<string, unknown>).metrics) &&
    typeof (raw as Record<string, unknown>).confidence === 'object' &&
    (raw as Record<string, unknown>).confidence !== null
  ) {
    const r = raw as unknown as PersistedIssueEvidence;
    return {
      status: 'CANONICAL',
      metrics: r.metrics,
      confidence: r.confidence,
      window: r.window ?? null,
    };
  }
  return {
    status: 'LEGACY',
    raw:
      raw != null && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {},
  };
}

/**
 * Reconstructs the (evidence, confidence, window) trio an IssueRecord needs
 * from a raw detected_issues.evidence_json value — the one place this
 * degradation logic lives, so every reader (getDashboard.ts, adAssessor's
 * adlyticContext.ts, ...) shares it instead of re-deriving it independently.
 *
 * Legacy rows keep their old confidence NUMBER (read back under its old key,
 * not fabricated) but lose their per-metric evidence array, since the old
 * shape's fields don't line up with Evidence — an honest, disclosed
 * degradation rather than a guess at what they meant.
 */
export function issueEvidenceFieldsFromJson(raw: unknown): {
  evidence: Evidence[];
  confidence: IssueConfidence;
  window: { days: number } | null;
} {
  const parsed = parseIssueEvidenceJson(raw);
  if (parsed.status === 'CANONICAL') {
    return { evidence: parsed.metrics, confidence: parsed.confidence, window: parsed.window };
  }
  const legacyConfidence =
    typeof parsed.raw.confidence === 'number' ? parsed.raw.confidence : 0.5;
  return {
    evidence: [],
    confidence: { value: legacyConfidence, basis: 'heuristic_constant' },
    window: null,
  };
}
