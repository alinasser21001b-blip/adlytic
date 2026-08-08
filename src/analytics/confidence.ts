// ════════════════════════════════════════════════════════════════════════
//  src/analytics/confidence.ts — THREE KINDS OF CONFIDENCE, KEPT APART
//
//  Adlytic previously had one blurry notion of "confidence" that mixed
//  incompatible questions. They must stay separate, because they fail
//  independently and a merchant needs different actions from each:
//
//    CLASSIFICATION confidence — "how sure are we what this campaign IS?"
//        Fails when Meta gives a vague ODAX shell with no destination synced.
//        Low classification confidence means: do not speak objective-specific
//        vocabulary, and prompt the operator to check the campaign setup.
//
//    DATA confidence — "how sure are we these NUMBERS are complete and real?"
//        Fails on partial days, unsynced backfill, attribution windows still
//        open, or a metric whose source column was never populated.
//        Low data confidence means: show the number with a caveat, never
//        trigger an alert from it.
//
//    BENCHMARK confidence — "is there enough of a SAMPLE to compare against?"
//        Fails at small spend, short windows, or a peer cohort too thin to
//        publish. Low benchmark confidence means: show the raw value with no
//        verdict attached. Never "you're below average" from 40 impressions.
//
//  A campaign can be perfectly classified (high classification) with complete
//  data (high data) and still be uncomparable (no benchmark) — that is a
//  normal, common state for an Iraqi SMB account, and the system must be able
//  to express it rather than manufacture a verdict.
// ════════════════════════════════════════════════════════════════════════

/** How sure we are what the campaign is trying to achieve. */
export type ClassificationConfidence =
  | 'CONFIRMED'   // destination_type or an explicit optimization goal decided it
  | 'INFERRED'    // decided by the campaign objective alone
  | 'EVIDENCE'    // decided by observed results (the guarded evidence rung)
  | 'UNKNOWN';    // no basis — must not be replaced by a guess

/** How sure we are the numbers are complete. */
export type DataConfidence =
  | 'COMPLETE'      // full days, synced, source column populated
  | 'PARTIAL'       // includes today, or an attribution window still open
  | 'BACKFILLING'   // column exists but rows predate it (e.g. link_clicks)
  | 'MISSING';      // never synced

/** Whether a comparison may be published at all. */
export type BenchmarkStatus = 'OK' | 'LOW_CONFIDENCE' | 'UNAVAILABLE';

// ── Sample-size gates ───────────────────────────────────────────────────
//
// Deliberately conservative. These are not statistical significance tests —
// claiming that precision would be its own dishonesty. They are floors below
// which a comparison is obviously noise, chosen for the spend levels Adlytic's
// clients actually run at.

/** A rate (CTR, conversation rate) needs enough denominator to be stable. */
export const MIN_IMPRESSIONS_FOR_RATE = 1_000;
/** A cost-per-result needs enough results that one more would not move it much. */
export const MIN_RESULTS_FOR_COST = 10;
/** Fewer days than this and a daily average is dominated by day-of-week effects. */
export const MIN_DAYS_FOR_TREND = 7;
/** Below this the value is shown, but with no verdict attached. */
export const LOW_CONFIDENCE_IMPRESSIONS = 5_000;
export const LOW_CONFIDENCE_RESULTS = 30;

export interface BenchmarkSample {
  /** Denominator behind the metric — impressions for rates, results for costs. */
  size: number;
  /** Distinct days contributing. */
  days?: number;
}

export interface BenchmarkGate {
  status: BenchmarkStatus;
  /** Machine-readable cause; the UI maps it to merchant-facing Arabic. */
  reason?: 'SAMPLE_TOO_SMALL' | 'WINDOW_TOO_SHORT' | 'NO_DATA';
  /** Always carried so the UI can disclose n, per the Databox discipline. */
  sampleSize: number;
}

/**
 * Decide whether a rate metric (CTR, conversation rate) may be compared.
 *
 * Returns UNAVAILABLE below the hard floor, LOW_CONFIDENCE in the grey band
 * (value may be shown, verdict may not), OK above it.
 */
export function gateRateBenchmark(sample: BenchmarkSample): BenchmarkGate {
  const size = Number(sample.size) || 0;
  if (size <= 0) return { status: 'UNAVAILABLE', reason: 'NO_DATA', sampleSize: 0 };
  if (size < MIN_IMPRESSIONS_FOR_RATE) {
    return { status: 'UNAVAILABLE', reason: 'SAMPLE_TOO_SMALL', sampleSize: size };
  }
  if (sample.days !== undefined && sample.days < MIN_DAYS_FOR_TREND) {
    return { status: 'LOW_CONFIDENCE', reason: 'WINDOW_TOO_SHORT', sampleSize: size };
  }
  if (size < LOW_CONFIDENCE_IMPRESSIONS) {
    return { status: 'LOW_CONFIDENCE', reason: 'SAMPLE_TOO_SMALL', sampleSize: size };
  }
  return { status: 'OK', sampleSize: size };
}

/** Decide whether a cost-per-result metric may be compared. */
export function gateCostBenchmark(sample: BenchmarkSample): BenchmarkGate {
  const size = Number(sample.size) || 0;
  if (size <= 0) return { status: 'UNAVAILABLE', reason: 'NO_DATA', sampleSize: 0 };
  if (size < MIN_RESULTS_FOR_COST) {
    return { status: 'UNAVAILABLE', reason: 'SAMPLE_TOO_SMALL', sampleSize: size };
  }
  if (size < LOW_CONFIDENCE_RESULTS) {
    return { status: 'LOW_CONFIDENCE', reason: 'SAMPLE_TOO_SMALL', sampleSize: size };
  }
  return { status: 'OK', sampleSize: size };
}

/**
 * Classification confidence from the resolver's own reason string.
 *
 * Reads the evidence rung that decided the classification rather than
 * re-deriving anything — the resolver stays canonical (architecture rule 1).
 */
export function classificationConfidenceFromReason(
  reason: string | null | undefined,
  /**
   * Additive evidence metadata from the resolver — a second independent signal
   * agreed. It can only RAISE reported confidence for an objective-only
   * decision; it never changes which family was chosen (rule 1, and the
   * `corroborated` contract in campaignPurpose.ts).
   */
  corroborated = false,
): ClassificationConfidence {
  const r = String(reason || '');
  if (r.startsWith('destination:')) return 'CONFIRMED';
  if (r.startsWith('optimization_goal')) return 'CONFIRMED';
  if (r.startsWith('evidence:')) return 'EVIDENCE';
  if (r.startsWith('objective:')) return corroborated ? 'CONFIRMED' : 'INFERRED';
  return 'UNKNOWN';
}

/**
 * Merchant-facing Arabic for a gate that blocked a comparison.
 * Always states the sample size — never a bare "not enough data".
 */
export function benchmarkGateTextAr(gate: BenchmarkGate): string | null {
  if (gate.status === 'OK') return null;
  switch (gate.reason) {
    case 'NO_DATA':
      return 'لا توجد بيانات كافية للمقارنة بعد';
    case 'WINDOW_TOO_SHORT':
      return `الفترة قصيرة جداً للمقارنة — نحتاج ${MIN_DAYS_FOR_TREND} أيام على الأقل`;
    case 'SAMPLE_TOO_SMALL':
      return `العيّنة صغيرة (${gate.sampleSize.toLocaleString('en-US')}) — نعرض الرقم بدون حكم عليه`;
    default:
      return 'المقارنة غير متاحة';
  }
}
