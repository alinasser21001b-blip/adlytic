/**
 * Meta Ads objective standards (2025–2026 public benchmarks) for analysis + Arabic narration.
 *
 * Sources (directional, not account-specific):
 * - CTR by objective (Focus Digital / industry 2025–2026 summaries)
 * - Frequency sweet spot ~1.5–3.0; fatigue risk rises sharply above ~5
 * - Awareness campaigns are judged on CPM / reach / frequency — NOT messages
 * - Messaging has no fixed public CPL; use account baseline + cost_per_message KB
 *
 * This module is the bridge between:
 *   - `objectiveKpis.ts` (which metric is primary)
 *   - knowledge evaluate / detectors (which thresholds apply)
 *   - ClaudeCMO / insightQualityGate / diagnose (how we speak in Arabic)
 */

import {
  getObjectiveKpiSpec,
  objectiveKpiFamily,
  type ObjectiveKpiFamily,
  type ObjectiveKpiSpec,
} from '../lib/objectiveKpis';

export interface MetaCtrStandard {
  /** Absolute LOW_CTR floor (%). Below this → weak creative signal. */
  lowFloorPct: number;
  /** Typical median CTR for this objective family (%). */
  typicalPct: number;
  /** Soft "good" line (%). */
  goodPct: number;
}

export interface MetaFrequencyStandard {
  /** Soft warning when frequency exceeds this. */
  warning: number;
  /** Critical fatigue risk. */
  critical: number;
  /** Merchant-facing sweet-spot description (Arabic). */
  sweetSpotAr: string;
}

export interface MetaObjectiveStandard {
  family: ObjectiveKpiFamily;
  kpi: ObjectiveKpiSpec;
  ctr: MetaCtrStandard;
  frequency: MetaFrequencyStandard;
  /** KB metric keys that are valid to evaluate for this family. */
  kbMetricKeys: string[];
  /** Arabic noun for the primary result (used in narration). */
  resultNounAr: string;
  /** Arabic noun for efficiency (used in narration). */
  efficiencyNounAr: string;
  /** Forbidden merchant vocabulary when this family is active. */
  forbiddenVocabAr: string[];
  /** Preferred merchant vocabulary. */
  preferredVocabAr: string[];
  /** One-line Arabic coaching frame for the LLM. */
  coachingFrameAr: string;
}

const FREQ_DEFAULT: MetaFrequencyStandard = {
  warning: 3.0,
  critical: 5.0,
  sweetSpotAr: 'التكرار الصحي عادة بين 1.5 و 3 مرات لنفس الشخص',
};

const FAMILY_STANDARDS: Record<ObjectiveKpiFamily, Omit<MetaObjectiveStandard, 'family' | 'kpi'>> = {
  awareness: {
    ctr: { lowFloorPct: 0.6, typicalPct: 0.9, goodPct: 1.2 },
    frequency: {
      warning: 2.5,
      critical: 4.0,
      sweetSpotAr: 'لحملات الوعي: التكرار فوق 2.5 يستحق مراقبة، وفوق 4 غالباً إرهاق',
    },
    kbMetricKeys: ['ctr', 'cpm', 'frequency', 'hook_rate', 'hold_rate', 'thruplay_rate', 'cost_per_thruplay'],
    resultNounAr: 'مرات ظهور',
    efficiencyNounAr: 'تكلفة الوصول',
    forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة', 'محادثة', 'واتساب', 'مشتريات', 'عائد الإعلان'],
    preferredVocabAr: ['مرات الظهور', 'الوصول', 'تكرار الظهور', 'تكلفة الوصول', 'الوعي بالعلامة'],
    coachingFrameAr:
      'هذه حملة وعي — احكم على الوصول وتكلفة الظهور والتكرار، ولا تتحدث عن رسائل أو مبيعات.',
  },
  traffic: {
    ctr: { lowFloorPct: 1.0, typicalPct: 1.6, goodPct: 2.0 },
    frequency: FREQ_DEFAULT,
    kbMetricKeys: ['ctr', 'link_ctr', 'cpc', 'cpm', 'frequency'],
    resultNounAr: 'نقرات',
    efficiencyNounAr: 'تكلفة النقرة',
    forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة', 'مشتريات', 'عائد الإعلان'],
    preferredVocabAr: ['نقرات', 'زيارات', 'تكلفة النقرة', 'صفحة الهبوط', 'تفاعل الإعلان'],
    coachingFrameAr:
      'هذه حملة زيارات — ركّز على النقرات وتكلفة النقرة وجودة صفحة الهبوط بعد النقر.',
  },
  engagement: {
    ctr: { lowFloorPct: 1.0, typicalPct: 1.4, goodPct: 2.0 },
    frequency: FREQ_DEFAULT,
    kbMetricKeys: ['ctr', 'cpc', 'cpm', 'frequency'],
    resultNounAr: 'تفاعلات',
    efficiencyNounAr: 'تكلفة التفاعل',
    forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة', 'مشتريات'],
    preferredVocabAr: ['تفاعل', 'نقرات', 'تكرار الظهور', 'الإبداع'],
    coachingFrameAr:
      'هذه حملة تفاعل — ركّز على نسبة التفاعل وتكلفة التفاعل وتجديد الإبداع عند التعب.',
  },
  leads: {
    ctr: { lowFloorPct: 1.2, typicalPct: 2.5, goodPct: 3.0 },
    frequency: FREQ_DEFAULT,
    kbMetricKeys: ['ctr', 'link_ctr', 'cpc', 'cpm', 'frequency', 'cvr', 'cost_per_lead'],
    resultNounAr: 'عملاء محتملين',
    efficiencyNounAr: 'تكلفة العميل المحتمل',
    forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة', 'عائد الإعلان'],
    preferredVocabAr: ['عملاء محتملون', 'نموذج', 'تكلفة العميل المحتمل', 'جودة المتابعة'],
    coachingFrameAr:
      'هذه حملة عملاء محتملين — احكم على عدد العملاء وتكلفتهم وجودة النموذج/المتابعة، لا على الرسائل.',
  },
  sales: {
    ctr: { lowFloorPct: 1.0, typicalPct: 1.4, goodPct: 2.0 },
    frequency: FREQ_DEFAULT,
    kbMetricKeys: ['ctr', 'link_ctr', 'cpc', 'cpm', 'frequency', 'cvr', 'roas', 'cart_abandonment_rate'],
    resultNounAr: 'مشتريات',
    efficiencyNounAr: 'تكلفة الشراء',
    forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة'],
    preferredVocabAr: ['مشتريات', 'عائد الإنفاق', 'صفحة الدفع', 'قيمة الطلب'],
    coachingFrameAr:
      'هذه حملة مبيعات — ركّز على المشتريات وتكلفة الشراء وعائد الإنفاق ومسار ما بعد النقر.',
  },
  messaging: {
    ctr: { lowFloorPct: 1.0, typicalPct: 1.5, goodPct: 2.0 },
    frequency: FREQ_DEFAULT,
    kbMetricKeys: ['ctr', 'cpm', 'frequency', 'cpc', 'cost_per_message'],
    resultNounAr: 'رسائل',
    efficiencyNounAr: 'تكلفة الرسالة',
    forbiddenVocabAr: [],
    preferredVocabAr: ['رسائل', 'محادثات', 'تكلفة الرسالة', 'سرعة الرد'],
    coachingFrameAr:
      'هذه حملة رسائل — احكم على عدد المحادثات وتكلفة الرسالة وسرعة الرد بعد النقر.',
  },
  app: {
    ctr: { lowFloorPct: 1.0, typicalPct: 1.5, goodPct: 2.0 },
    frequency: FREQ_DEFAULT,
    kbMetricKeys: ['ctr', 'cpc', 'cpm', 'frequency'],
    resultNounAr: 'نقرات',
    efficiencyNounAr: 'تكلفة النقرة',
    forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة'],
    preferredVocabAr: ['تثبيتات', 'نقرات', 'تكلفة التثبيت'],
    coachingFrameAr:
      'هذه حملة ترويج تطبيق — ركّز على النقرات/التثبيتات وتكلفة الاكتساب، لا على الرسائل.',
  },
};

/** Resolve full Meta standard for a campaign objective string. */
export function getMetaObjectiveStandard(
  objective: string | null | undefined,
): MetaObjectiveStandard {
  const family = objectiveKpiFamily(objective);
  const base = FAMILY_STANDARDS[family];
  return {
    family,
    kpi: getObjectiveKpiSpec(objective),
    ...base,
  };
}

/** Absolute CTR floor (%) for LOW_CTR detection — objective-aware. */
export function lowCtrFloorForObjective(objective: string | null | undefined): number {
  return getMetaObjectiveStandard(objective).ctr.lowFloorPct;
}

/** KB metric keys allowed for this objective (shared delivery metrics always included). */
export function kbMetricKeysForObjective(objective: string | null | undefined): Set<string> {
  return new Set(getMetaObjectiveStandard(objective).kbMetricKeys);
}

/**
 * Filter a metrics bag to keys relevant for the objective before KB evaluation.
 * Prevents awareness campaigns from being scored on cost_per_message / roas.
 */
export function filterMetricsForObjective(
  metrics: Record<string, number | null | undefined>,
  objective: string | null | undefined,
): Record<string, number | null | undefined> {
  const allowed = kbMetricKeysForObjective(objective);
  const out: Record<string, number | null | undefined> = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

/** Arabic coaching block injected into Claude CMO system/user context. */
export function arabicObjectiveCoachingBlock(objective: string | null | undefined): string {
  const s = getMetaObjectiveStandard(objective);
  const forbid =
    s.forbiddenVocabAr.length > 0
      ? `ممنوع في النص للعميل: ${s.forbiddenVocabAr.join('، ')}.`
      : 'لا قيود مفردات إضافية.';
  return [
    `هدف الحملة (عائلة Meta): ${s.family}`,
    `النتيجة الأساسية: ${s.resultNounAr}`,
    `مقياس الكفاءة: ${s.efficiencyNounAr}`,
    s.coachingFrameAr,
    `مفردات مفضّلة: ${s.preferredVocabAr.join('، ')}.`,
    forbid,
    `مرجع CTR: نموذجي ≈ ${s.ctr.typicalPct}% · أرضية ضعف ≈ ${s.ctr.lowFloorPct}%.`,
    s.frequency.sweetSpotAr + '.',
  ].join('\n');
}

/** Short Arabic result phrase for deterministic templates. */
export function arabicResultPhrase(objective: string | null | undefined): string {
  return getMetaObjectiveStandard(objective).resultNounAr;
}

export function arabicEfficiencyPhrase(objective: string | null | undefined): string {
  return getMetaObjectiveStandard(objective).efficiencyNounAr;
}
