// ════════════════════════════════════════════════════════════════════════
//  src/services/campaignWhy.ts
//
//  THE CUSTOMER'S VIEW OF WHY.
//
//  Brain Observatory answers "how did this system reach that conclusion?" for
//  an engineer: module paths, DailyStat column names, permitAction()
//  jurisdiction, the LLM's ownership note. All of that is real and all of it
//  must stay — for the operator consoles that already read it.
//
//  A merchant in Baghdad needs a different answer to the same question, and
//  giving them the operator's answer would be two failures at once: it leaks
//  internal structure, and it does not actually explain anything to them.
//
//  So this file PROJECTS. It:
//    · calls buildBrainObservatory() — the existing canonical snapshot,
//    · keeps only the verdicts a customer is entitled to,
//    · localizes canonical CODES into Arabic through the vocabulary
//      plainArabicAdvice.ts already owns,
//    · and drops every engineering-provenance field.
//
//  ── WHAT THIS FILE MAY NOT DO ─────────────────────────────────────────
//
//  It computes NO metric, decides NO problem class, caps NO confidence,
//  chooses NO action and suppresses NO issue. Every verdict below is copied
//  from the snapshot it was handed. If the Brain did not reach a layer, this
//  says so; it does not fill the gap with a plausible-sounding stage.
//
//  It also never renders the snapshot's English `conclusion` / `absenceReason`
//  prose. Those strings are engineer-facing, interpolated, and untranslated —
//  shipping them into an Arabic customer UI would be leaking the debugger.
//  Where a canonical CODE supports an Arabic sentence, one is emitted; where
//  it does not, the field is null and the app says nothing rather than
//  guessing.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import {
  buildBrainObservatory,
  type BrainObservatorySnapshot,
  type TraceStage,
} from './brainObservatory';
import { actionLabelAr, issueTitleAr, severityLabelAr } from '../lib/plainArabicAdvice';

// ── Localization of canonical codes ───────────────────────────────────────
//
// Code → Arabic, server-side, exactly as issueTitleAr() already does for
// IssueCode. The client never maps a code to text; that rule is why these
// tables live here and not in the app bundle.

/** The six layers of analytics/intelligence/hierarchy.ts, in its own order. */
const LAYER_LABEL_AR: Record<string, string> = {
  DATA_VALIDITY:     'هل البيانات كافية؟',
  SEMANTIC_VALIDITY: 'ما هدف هذه الحملة؟',
  FUNNEL_DIAGNOSIS:  'أين تتعثّر الحملة؟',
  ANOMALY_DETECTION: 'هل هذا خارج عن المعتاد؟',
  HEALTH_IMPACT:     'ما حجم الأثر؟',
  RECOMMENDATION:    'ما الخطوة المقترحة؟',
};

const PROBLEM_CLASS_AR: Record<string, string> = {
  DELIVERY:          'الإعلان لا يصل إلى عدد كافٍ من الناس',
  CLICK:             'الناس يرون الإعلان ولا ينقرون',
  POST_CLICK:        'الناس ينقرون ثم يغادرون قبل الوصول',
  CONVERSION:        'الناس يصلون ولا يكملون الإجراء',
  EFFICIENCY:        'الكلفة لكل نتيجة ارتفعت',
  NO_MATERIAL_BREAK: 'لا يوجد خلل جوهري في المسار',
};

const CONFIDENCE_AR: Record<string, string> = {
  HIGH:              'ثقة عالية',
  MEDIUM:            'ثقة متوسطة',
  LOW:               'ثقة منخفضة',
  INSUFFICIENT_DATA: 'البيانات غير كافية للحكم',
};

/**
 * `semantics.classificationConfidence` is NOT the same vocabulary as the
 * table above — confirmed by tracing analytics/confidence.ts's
 * `ClassificationConfidence` type (CONFIRMED/INFERRED/EVIDENCE/UNKNOWN),
 * and by a live /why call during Alpha testing that returned
 * `classificationConfidence: "CONFIRMED"` and silently fell through
 * CONFIDENCE_AR to null. Kept as a separate table so the two enums can
 * never again be conflated through a shared lookup.
 */
const CLASSIFICATION_CONFIDENCE_AR: Record<string, string> = {
  CONFIRMED: 'محدَّد بدقة من إعدادات الحملة',
  INFERRED:  'مُستنتَج من هدف الحملة',
  EVIDENCE:  'مبني على النتائج الفعلية المرصودة',
  UNKNOWN:   'غير محدَّد',
};

const DATA_CONFIDENCE_AR: Record<string, string> = {
  COMPLETE: 'كل أيام الفترة مغطاة',
  PARTIAL:  'بعض أيام الفترة بلا بيانات',
};

const PRESENCE_AR: Record<string, string> = {
  AVAILABLE: 'توجد بيانات مخزّنة لهذه الفترة',
  MISSING:   'لا توجد بيانات مخزّنة لهذه الفترة',
};

const COVERAGE_AR: Record<string, string> = {
  FULL:           'التغطية كاملة',
  UNKNOWN:        'التغطية غير معروفة',
  NOT_APPLICABLE: 'لا ينطبق',
};

const SETTLEMENT_AR: Record<string, string> = {
  SETTLED:     'الأرقام مستقرّة',
  PROVISIONAL: 'الأرقام قد تتغيّر — ما زالت ضمن فترة تحديث Meta',
};

const ANOMALY_KIND_AR: Record<string, string> = {
  NONE:            'لا شيء غير معتاد',
  SPIKE:           'قفزة مفاجئة',
  DROP:            'هبوط مفاجئ',
  DRIFT:           'انحراف تدريجي',
  FATIGUE:         'إرهاق الجمهور',
  INSUFFICIENT:    'العيّنة أصغر من أن يُحكم عليها',
};

/** Localize, or return null. Never returns the raw code as if it were prose. */
function ar(table: Record<string, string>, code: string | null | undefined): string | null {
  if (!code) return null;
  return table[code] ?? null;
}

// ── The customer-facing shape ─────────────────────────────────────────────

/** One link in the reasoning chain the app draws. */
export interface WhyStage {
  /** Position in hierarchy.ts's own LAYER_ORDER (1-based). Copied, not chosen. */
  ordinal: number;
  /** Canonical layer code. The app keys its icons off this, never off the label. */
  stage: string;
  /** Arabic question this layer answers. */
  labelAr: string;
  /** Copied verbatim from the Brain's own trace. */
  status: 'REACHED' | 'NOT_REACHED';
  /**
   * Arabic statement of what this layer concluded, built ONLY from canonical
   * codes. Null when the layer was not reached, or when no code-backed
   * sentence exists — never a translation of the engineer-facing prose.
   */
  findingAr: string | null;
  /**
   * Why an unreached layer is absent, when a canonical code explains it.
   * Null otherwise: an unexplained gap is shown as a gap.
   */
  absenceAr: string | null;
}

/** How far the underlying data can be trusted. Codes + labels, no verdict of our own. */
export interface WhyDataTruth {
  presence: string;
  presenceAr: string | null;
  coverage: string;
  coverageAr: string | null;
  settlement: string;
  settlementAr: string | null;
  /** buildEntityFunnel().dataConfidence — the gate DATA_VALIDITY actually consumes. */
  dataConfidence: string;
  dataConfidenceAr: string | null;
  daysStored: number;
  daysMissing: number;
  windowSince: string;
  windowUntil: string;
  lastSyncedAt: string | null;
  /**
   * Deliberately absent as a verdict. brainObservatory.ts withholds a
   * freshness judgement because no canonical freshness policy exists; this
   * projection does not invent one either.
   */
  freshness: 'UNKNOWN';
}

export interface WhyEvidenceItem {
  issueCode: string;
  titleAr: string;
  severity: string;
  severityAr: string;
  date: string;
}

export interface CampaignWhyDTO {
  campaign: { id: string; name: string; status: string };
  /** The chain, always six entries in LAYER_ORDER — a gap is visible as NOT_REACHED. */
  chain: WhyStage[];
  dataTruth: WhyDataTruth;
  /** What the campaign is FOR, as the semantics layer resolved it. */
  purpose: {
    family: string;
    reasonAr: string | null;
    classificationConfidence: string;
    classificationConfidenceAr: string | null;
    primaryKpi: string;
    primaryKpiLabelAr: string;
    resultUnit: string;
    /** True when the count is a proxy. The app MUST label it. */
    resultApproximate: boolean;
  };
  diagnosis: {
    problemClass: string;
    problemClassAr: string | null;
    confidence: string;
    confidenceAr: string | null;
    /** Which layer owns this verdict — a layer code, not a module path. */
    decidedByStage: string;
    decidedByStageAr: string | null;
    alert: boolean;
    /**
     * Canonical competing explanations the reconciler outranked, localized
     * from their issue codes. Reading them is the point: one noisy metric
     * should not look unopposed.
     */
    counterEvidenceAr: string[];
    /** The reconciler's own "real, but not statistically unusual" finding. */
    breakPresentButNotUnusual: boolean;
  };
  evidence: WhyEvidenceItem[];
  recommendation: {
    actionCode: string | null;
    actionAr: string | null;
    /** Actions this diagnosis structurally forbids, localized. */
    forbiddenAr: string[];
  } | null;
  /**
   * True when the whole chain reconstructs without any LLM statement.
   * Copied from the snapshot. The narration itself is NOT exposed here:
   * it is not authoritative, so it has no place in a provenance surface.
   */
  deterministic: boolean;
}

// ── Projection ────────────────────────────────────────────────────────────

/**
 * Why an unreached layer is absent — derived from canonical STATE, never
 * from parsing the snapshot's English prose.
 *
 * The reconciler short-circuits, so the cause of a gap is always one of the
 * upstream states below. When none of them holds, this returns null and the
 * app shows the stage as simply not used.
 */
function absenceFromCanonicalState(s: BrainObservatorySnapshot): string | null {
  if (s.temporal.dataPresence === 'MISSING') {
    return 'لا توجد بيانات مُزامَنة لهذه الفترة، فتوقّف التحليل عند هذا الحد.';
  }
  if (s.semantics.purposeFamily === 'UNKNOWN' || s.semantics.purposeFamily === 'UNRESOLVED') {
    return 'هدف الحملة غير محدَّد، فامتنعت المنظومة عن أي حكم مرتبط بالهدف.';
  }
  if (s.diagnosis.confidence === 'INSUFFICIENT_DATA') {
    return 'العيّنة أصغر من أن تُبنى عليها نتيجة، فتوقّف التحليل عند هذا الحد.';
  }
  return null;
}

/** Arabic finding for a REACHED layer, from canonical codes only. */
function findingFor(stage: string, s: BrainObservatorySnapshot): string | null {
  switch (stage) {
    case 'DATA_VALIDITY':
      return ar(DATA_CONFIDENCE_AR, s.temporal.dataConfidence);
    case 'SEMANTIC_VALIDITY': {
      const conf = ar(CLASSIFICATION_CONFIDENCE_AR, s.semantics.classificationConfidence);
      return conf ? `${s.semantics.primaryKpiLabelAr} — ${conf}` : s.semantics.primaryKpiLabelAr;
    }
    case 'FUNNEL_DIAGNOSIS':
      return ar(PROBLEM_CLASS_AR, s.diagnosis.problemClass);
    case 'ANOMALY_DETECTION': {
      if (!s.anomalies.significant) return 'الحركة ضمن التقلّب الطبيعي لهذا الحساب';
      const kind = ar(ANOMALY_KIND_AR, s.anomalies.kind);
      const conf = ar(CONFIDENCE_AR, s.anomalies.confidence);
      return [kind, conf].filter(Boolean).join(' — ') || null;
    }
    case 'HEALTH_IMPACT':
      return ar(CONFIDENCE_AR, s.diagnosis.confidence);
    case 'RECOMMENDATION': {
      const code = s.decision.recommendedAction;
      if (!code) return null;
      return actionLabelAr(code) || null;
    }
    default:
      return null;
  }
}

function projectStage(t: TraceStage, s: BrainObservatorySnapshot): WhyStage {
  const reached = t.status === 'REACHED';
  return {
    ordinal: t.ordinal,
    stage: t.stage,
    labelAr: LAYER_LABEL_AR[t.stage] ?? t.stage,
    status: t.status,
    findingAr: reached ? findingFor(t.stage, s) : null,
    absenceAr: reached ? null : absenceFromCanonicalState(s),
  };
}

/**
 * Project a canonical Brain Observatory snapshot into the customer's view.
 *
 * Pure. Takes a snapshot, returns a projection. Every field it emits is
 * traceable to a field it was given.
 */
export function projectCampaignWhy(s: BrainObservatorySnapshot): CampaignWhyDTO {
  const counterEvidenceAr = s.diagnosis.suppressedIssueCodes
    .map((code) => issueTitleAr(code))
    .filter((t): t is string => Boolean(t));

  const breakPresentButNotUnusual =
    s.diagnosis.problemClass !== 'NO_MATERIAL_BREAK' && !s.anomalies.significant;

  const recAction = s.decision.recommendedAction;

  return {
    campaign: {
      id: s.campaign.id,
      name: s.campaign.name,
      status: s.campaign.status,
    },
    chain: s.trace.map((t) => projectStage(t, s)),
    dataTruth: {
      presence: s.temporal.dataPresence,
      presenceAr: ar(PRESENCE_AR, s.temporal.dataPresence),
      coverage: s.temporal.temporalCoverage,
      coverageAr: ar(COVERAGE_AR, s.temporal.temporalCoverage),
      settlement: s.temporal.settlement,
      settlementAr: ar(SETTLEMENT_AR, s.temporal.settlement),
      dataConfidence: s.temporal.dataConfidence,
      dataConfidenceAr: ar(DATA_CONFIDENCE_AR, s.temporal.dataConfidence),
      daysStored: s.temporal.uniqueDateCount,
      daysMissing: s.temporal.datesWithoutRows.length,
      windowSince: s.temporal.requestedSpan.since,
      windowUntil: s.temporal.requestedSpan.until,
      lastSyncedAt: s.temporal.lastSyncedAt,
      freshness: 'UNKNOWN',
    },
    purpose: {
      family: s.semantics.purposeFamily,
      reasonAr: s.semantics.purposeReasonAr,
      classificationConfidence: s.semantics.classificationConfidence,
      classificationConfidenceAr: ar(CLASSIFICATION_CONFIDENCE_AR, s.semantics.classificationConfidence),
      primaryKpi: s.semantics.primaryKpi,
      primaryKpiLabelAr: s.semantics.primaryKpiLabelAr,
      resultUnit: s.semantics.resultUnit,
      resultApproximate: s.semantics.resultApproximate,
    },
    diagnosis: {
      problemClass: s.diagnosis.problemClass,
      problemClassAr: ar(PROBLEM_CLASS_AR, s.diagnosis.problemClass),
      confidence: s.diagnosis.confidence,
      confidenceAr: ar(CONFIDENCE_AR, s.diagnosis.confidence),
      decidedByStage: s.diagnosis.decidedBy,
      decidedByStageAr: ar(LAYER_LABEL_AR, s.diagnosis.decidedBy),
      alert: s.diagnosis.alert,
      counterEvidenceAr,
      breakPresentButNotUnusual,
    },
    evidence: s.evidence.items.map((it) => ({
      issueCode: it.issueCode,
      titleAr: issueTitleAr(it.issueCode),
      severity: it.severity,
      severityAr: severityLabelAr(it.severity),
      date: it.date,
    })),
    recommendation: recAction
      ? {
          actionCode: recAction,
          actionAr: actionLabelAr(recAction) || null,
          forbiddenAr: s.decision.forbiddenActions
            .map((c) => actionLabelAr(c))
            .filter((t): t is string => Boolean(t)),
        }
      : null,
    deterministic: s.backwardTraceComplete,
  };
}

/**
 * Build the customer's Why for one campaign.
 *
 * Returns null when the Brain holds no measurable window for it — the caller
 * turns that into a 404 with an honest reason. It does NOT assemble a partial
 * chain that would read as a complete one; that is the same rule
 * /api/admin/graph/trace already follows.
 *
 * CALLER CONTRACT: this function does not scope the campaign to an account.
 * `buildBrainObservatory` looks a campaign up by id alone, so the route MUST
 * prove the campaign belongs to the caller's workspace before calling in.
 */
export async function getCampaignWhy(
  prisma: PrismaClient,
  campaignId: string,
): Promise<CampaignWhyDTO | null> {
  const snapshot = await buildBrainObservatory(prisma, campaignId);
  if (!snapshot) return null;
  return projectCampaignWhy(snapshot);
}
