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
  getKpiSpecForFamily,
  resolveObjectiveFamily,
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

/**
 * What the caller knows about a campaign's purpose.
 *
 * A resolved `ObjectiveKpiFamily` is the preferred input — it already carries
 * ad-set optimization goals and destination types (see campaignPurpose.ts), so
 * a click-to-WhatsApp campaign shipped under an ENGAGEMENT shell arrives here
 * already correctly identified as messaging.
 *
 * A raw Meta objective string is still accepted for call sites that genuinely
 * only have one, and 'unknown' / null is accepted for the account-level view,
 * which legitimately spans several objectives at once.
 */
export type ObjectiveInput = ObjectiveKpiFamily | 'unknown' | string | null | undefined;

const KNOWN_FAMILIES = new Set<string>([
  'awareness', 'traffic', 'engagement', 'leads', 'sales', 'messaging', 'app',
]);

export interface MetaObjectiveStandard {
  /**
   * 'unknown' when the objective could not be determined — for example the
   * account-level view, which mixes objectives. Consumers MUST NOT speak
   * objective-specific vocabulary in that case.
   */
  family: ObjectiveKpiFamily | 'unknown';
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

/**
 * Neutral standard used when the objective is genuinely unknown (account-level
 * view spanning several objectives, or an objective Meta has not told us
 * about). Deliberately forbids EVERY objective-specific noun: with mixed
 * campaigns underneath, calling the account's results "رسائل" is a guess, and
 * guessing is exactly the failure this module exists to prevent.
 */
const UNKNOWN_STANDARD: Omit<MetaObjectiveStandard, 'family' | 'kpi'> = {
  ctr: { lowFloorPct: 1.0, typicalPct: 1.5, goodPct: 2.0 },
  frequency: FREQ_DEFAULT,
  kbMetricKeys: ['ctr', 'cpm', 'frequency', 'cpc'],
  resultNounAr: 'نتائج',
  efficiencyNounAr: 'تكلفة النتيجة',
  forbiddenVocabAr: ['رسائل', 'تكلفة الرسالة', 'محادثة', 'مشتريات', 'عائد الإعلان', 'عملاء محتملون'],
  preferredVocabAr: ['نتائج', 'تكلفة النتيجة', 'الإنفاق', 'معدل النقر'],
  coachingFrameAr:
    'هذا عرض على مستوى الحساب يجمع أهدافاً مختلفة — تحدث عن الأداء العام والإنفاق ومعدل النقر، ولا تسمِّ نوع النتيجة.',
};

/**
 * Resolve the full Meta standard for a campaign.
 *
 * Accepts an already-resolved family (preferred — see ObjectiveInput) or a raw
 * Meta objective string. Anything unrecognized yields the neutral 'unknown'
 * standard rather than silently inheriting messaging vocabulary, which is what
 * previously made an awareness-only account read as a messaging account.
 */
export function getMetaObjectiveStandard(
  objective: ObjectiveInput,
): MetaObjectiveStandard {
  // Already a resolved family — trust it; it outranks any raw objective string
  // because it was derived with optimization-goal and destination context.
  if (typeof objective === 'string' && KNOWN_FAMILIES.has(objective)) {
    const family = objective as ObjectiveKpiFamily;
    return { family, kpi: getKpiSpecForFamily(family), ...FAMILY_STANDARDS[family] };
  }
  const family = resolveObjectiveFamily(objective);
  if (family === null) {
    return {
      family: 'unknown',
      kpi: getObjectiveKpiSpec(null),
      ...UNKNOWN_STANDARD,
    };
  }
  return { family, kpi: getObjectiveKpiSpec(objective), ...FAMILY_STANDARDS[family] };
}

/** Absolute CTR floor (%) for LOW_CTR detection — objective-aware. */
export function lowCtrFloorForObjective(objective: ObjectiveInput): number {
  return getMetaObjectiveStandard(objective).ctr.lowFloorPct;
}

/** KB metric keys allowed for this objective (shared delivery metrics always included). */
export function kbMetricKeysForObjective(objective: ObjectiveInput): Set<string> {
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
export function arabicResultPhrase(objective: ObjectiveInput): string {
  return getMetaObjectiveStandard(objective).resultNounAr;
}

export function arabicEfficiencyPhrase(objective: ObjectiveInput): string {
  return getMetaObjectiveStandard(objective).efficiencyNounAr;
}
