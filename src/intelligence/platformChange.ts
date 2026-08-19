// ════════════════════════════════════════════════════════════════════════
//  src/intelligence/platformChange.ts
//
//  PLATFORM CHANGE → IMPACT → ACTION. The first vertical slice of the
//  change radar: a structured record of something that changed outside us,
//  scored against what we actually depend on.
//
//  THE RULE THAT SHAPES THIS FILE
//  Impact is scored from DEPENDENCY, never from novelty. A dramatic Meta
//  announcement touching nothing we consume scores near zero; a quiet
//  deprecation of a field behind a headline number scores high. A radar
//  that ranks by excitement is a news feed, and a news feed is exactly what
//  an operator already has too much of.
//
//  No LLM runs here. Classification, scoring and blast radius are
//  deterministic — an LLM may later summarise or word a change, but it must
//  never decide whether we are affected. That is arithmetic over a registry.
// ════════════════════════════════════════════════════════════════════════

import { resolveBlastRadius, type BlastRadius } from './metaDependencyGraph';

export type ChangeSourceType =
  | 'META_OFFICIAL' | 'DOCUMENTATION' | 'CHANGELOG'
  | 'RESEARCH' | 'COMPETITOR' | 'INDUSTRY' | 'OBSERVED';

export type ChangeCategory =
  | 'API' | 'MEASUREMENT' | 'ATTRIBUTION' | 'REPORTING' | 'AI'
  | 'DELIVERY' | 'AUTOMATION' | 'CREATIVE' | 'PRIVACY' | 'COMPETITOR' | 'OTHER';

/** Deliberately mirrors the probe's vocabulary: unverified is a state, not a flaw. */
export type ChangeStatus =
  | 'UNVERIFIED' | 'VERIFIED' | 'ACTIVE' | 'UPCOMING' | 'DEPRECATED' | 'RESOLVED';

export interface PlatformChange {
  id: string;
  source: string;
  sourceType: ChangeSourceType;
  title: string;
  summary: string;
  detectedAt: string;
  effectiveAt?: string;
  category: ChangeCategory;
  /** Meta resource NAMES exactly as Meta writes them. Resolved, not trusted. */
  affectedResources: string[];
  affectedApiVersions: string[];
  evidenceUrls: string[];
  status: ChangeStatus;
}

export type Classification =
  | 'IGNORE' | 'WATCH' | 'PRODUCT_OPPORTUNITY' | 'ENGINEERING_RISK'
  | 'MEASUREMENT_RISK' | 'COMPETITIVE_THREAT' | 'CONTENT_OPPORTUNITY'
  | 'COMMERCIAL_OPPORTUNITY' | 'STRATEGIC_SHIFT';

export interface ChangeImpact {
  changeId: string;
  classifications: Classification[];
  /** 0–100, from dependency and consequence — never from novelty. */
  impactScore: number;
  urgencyScore: number;
  /** How much we trust our OWN analysis, separate from the source's reliability. */
  analysisConfidence: number;
  /** Every scoring step, in order, so a score can be argued with. */
  reasoning: string[];
  blastRadius: BlastRadius;
  engineeringActions: string[];
  productOpportunities: string[];
  contentAngles: string[];
  /** Questions we cannot answer yet. Never silently dropped. */
  openQuestions: string[];
}

/** Tier 1 sources are believable on their own; the rest need corroboration. */
const SOURCE_WEIGHT: Record<ChangeSourceType, number> = {
  META_OFFICIAL: 1.0, CHANGELOG: 1.0, DOCUMENTATION: 0.9,
  RESEARCH: 0.6, INDUSTRY: 0.5, COMPETITOR: 0.5, OBSERVED: 0.4,
};

const DAY = 86_400_000;

/**
 * Score a change against what we actually depend on.
 *
 * Pure and synchronous by design: the same change scores the same way every
 * time, and the reasoning array lets a human check the arithmetic rather
 * than trust it.
 */
export function analyzePlatformChange(change: PlatformChange, now = Date.now()): ChangeImpact {
  const blast = resolveBlastRadius(change.affectedResources);
  const reasoning: string[] = [];
  const classifications = new Set<Classification>();
  let score = 0;

  // 1. Dependency is the dominant term. No dependency, no impact.
  if (blast.features.length === 0) {
    reasoning.push('لا ميزة واحدة في المنتج تعتمد على أي مورد ذكره هذا التغيير.');
    if (blast.unknownResourceIds.length) {
      // The honest branch: an unmapped resource is OUR gap, not a null result.
      reasoning.push(
        `تحذير: ${blast.unknownResourceIds.length} مورد غير مسجَّل في خريطة التبعيات `
        + `(${blast.unknownResourceIds.join(', ')}) — «غير معروف» وليس «غير مستخدَم».`,
      );
      score += 25;
      classifications.add('WATCH');
    } else {
      classifications.add('IGNORE');
    }
  } else {
    const perFeature = Math.min(blast.features.length * 8, 32);
    score += perFeature;
    reasoning.push(`${blast.features.length} ميزة تعتمد على موارد متأثرة (+${perFeature}).`);

    // 2. Failure mode outranks feature count. One silently wrong number is
    //    worse than three visibly empty panels: the operator can see an empty
    //    panel, and acts on a wrong number without knowing.
    if (blast.worstFailureMode === 'SILENT_CORRUPTION') {
      score += 35;
      reasoning.push('أسوأ نمط فشل: فساد صامت — رقم خاطئ يتصرّف عليه التاجر دون أن يعلم (+35).');
      classifications.add('MEASUREMENT_RISK');
      classifications.add('ENGINEERING_RISK');
    } else if (blast.worstFailureMode === 'DEGRADED_DETAIL') {
      score += 18;
      reasoning.push('أسوأ نمط فشل: تفصيل منقوص — الرقم الرئيسي يبقى صحيحاً (+18).');
      classifications.add('ENGINEERING_RISK');
    } else {
      score += 10;
      reasoning.push('أسوأ نمط فشل: غياب ظاهر — الواجهة تصمت بدل أن تكذب (+10).');
      classifications.add('WATCH');
    }
  }

  // 3. Category weighting.
  if (change.category === 'MEASUREMENT' || change.category === 'ATTRIBUTION') {
    score += 15;
    reasoning.push('فئة قياس/إسناد — تمسّ صلاحية الأرقام نفسها لا عرضها (+15).');
    classifications.add('MEASUREMENT_RISK');
  }
  if (change.category === 'AI' || change.category === 'AUTOMATION') {
    classifications.add('COMPETITIVE_THREAT');
    reasoning.push('فئة ذكاء/أتمتة — تُقيَّم كتهديد تنافسي محتمل.');
  }
  if (change.category === 'COMPETITOR') classifications.add('COMPETITIVE_THREAT');

  // 4. Status.
  if (change.status === 'DEPRECATED') {
    score += 20;
    reasoning.push('مورد مُهمَل — الكسر مسألة وقت لا احتمال (+20).');
    classifications.add('ENGINEERING_RISK');
  }

  // 5. Urgency is TIME, kept separate from impact. A severe change six
  //    months out and a trivial one tomorrow must not collapse into one number.
  let urgency = 20;
  if (change.effectiveAt) {
    const days = Math.floor((Date.parse(change.effectiveAt) - now) / DAY);
    if (Number.isFinite(days)) {
      urgency = days <= 0 ? 100 : days <= 7 ? 90 : days <= 30 ? 70 : days <= 90 ? 45 : 25;
      reasoning.push(`يسري خلال ${days} يوم → إلحاح ${urgency}.`);
    }
  } else {
    reasoning.push('لا تاريخ سريان معروف → إلحاح افتراضي 20، لا صفر: غياب التاريخ ليس دليل بُعده.');
  }

  // 6. Source quality scales our CONFIDENCE, never the impact. A real
  //    dependency does not become less real because a blog reported it.
  const weight = SOURCE_WEIGHT[change.sourceType];
  let confidence = Math.round(weight * 100);
  if (change.status === 'UNVERIFIED') {
    confidence = Math.round(confidence * 0.6);
    reasoning.push('غير مُتحقَّق منه — الثقة في التحليل مخفوضة، والأثر كما هو.');
  }
  if (!change.evidenceUrls.length) {
    confidence = Math.round(confidence * 0.7);
    reasoning.push('بلا رابط دليل — الثقة مخفوضة.');
  }

  score = Math.max(0, Math.min(100, score));

  // 7. Actions, derived from the blast radius rather than composed freely.
  const engineeringActions: string[] = [];
  const productOpportunities: string[] = [];
  const contentAngles: string[] = [];
  const openQuestions: string[] = [];

  if (blast.features.length) {
    engineeringActions.push(
      `تحقّق من توفّر الموارد المتأثرة قبل ${change.effectiveAt ?? 'السريان'}، وأضف حالة بديلة صريحة `
      + `(لا صفر) في: ${blast.implementationSites.join(' · ')}`,
    );
    if (blast.worstFailureMode === 'SILENT_CORRUPTION') {
      engineeringActions.push('أضف بوابة تفشل البناء إذا اختفى المورد بدل أن يمرّ كصفر.');
      contentAngles.push('«البيانات الناقصة ليست صفراً» — كيف يكشف Adlytic هذا تلقائياً.');
    }
  }
  if (blast.unknownResourceIds.length) {
    engineeringActions.push(`سجّل الموارد غير المعروفة في خريطة التبعيات: ${blast.unknownResourceIds.join(', ')}`);
    openQuestions.push('هل نعتمد على هذه الموارد فعلاً في مسار لم يُسجَّل بعد؟');
  }
  if (classifications.has('MEASUREMENT_RISK')) {
    productOpportunities.push('بطاقة «ثقة القياس»: تعرض أثر التغيير على صلاحية المقارنات.');
  }
  if (change.status === 'UNVERIFIED') {
    openQuestions.push('يحتاج تأكيداً من مصدر Tier 1 قبل أي إجراء هندسي.');
  }

  if (classifications.size === 0) classifications.add('WATCH');
  if (contentAngles.length) classifications.add('CONTENT_OPPORTUNITY');
  if (productOpportunities.length) classifications.add('PRODUCT_OPPORTUNITY');

  return {
    changeId: change.id,
    classifications: [...classifications],
    impactScore: score,
    urgencyScore: urgency,
    analysisConfidence: confidence,
    reasoning,
    blastRadius: blast,
    engineeringActions,
    productOpportunities,
    contentAngles,
    openQuestions,
  };
}
