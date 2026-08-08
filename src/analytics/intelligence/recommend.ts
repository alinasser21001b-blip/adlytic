// ════════════════════════════════════════════════════════════════════════
//  src/analytics/intelligence/recommend.ts — RECOMMENDATIONS, DOWNSTREAM
//
//  A recommendation is the LAST layer of the hierarchy, so it may only say
//  things the layers above it have already established (locked P5.6).
//
//  The failure this prevents is concrete: with CTR healthy, link clicks
//  healthy and post-click conversion broken, the old engines could still emit
//  "refresh your creative" — advice that costs a merchant a week of redesign
//  work on the one part of the machine that was measurably fine.
//
//  Here, that recommendation cannot be constructed: `permitAction()` rejects
//  it against the reconciled diagnosis before it is ever built. The guard is
//  structural, not a convention downstream authors must remember.
//
//  Deterministic. The AI layer may rephrase these strings for a merchant;
//  it may not choose the action, invent the evidence, or alter the
//  confidence (PART D).
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../../lib/objectiveKpis';
import { resultFor } from '../resultSemantics';
import { permitAction, type ReconciledIntelligence, type Verdict } from './hierarchy';

export type RecommendationSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'INFO';

export interface AnalyticsRecommendation {
  /** What is wrong, in the merchant's terms. */
  problem: string;
  /** Measured facts only — never generated prose. */
  evidence: string[];
  severity: RecommendationSeverity;
  confidence: Verdict;
  /** Stable code the execution/outcome loop keys on. */
  actionCode: string;
  /** What to do. */
  action: string;
  /** What should change if it works — honest about uncertainty. */
  expectedImpact: string;
  /** Which funnel stage this addresses, for the UI to anchor it. */
  targetStage: string | null;
}

interface Template {
  actionCode: string;
  problem: string;
  action: string;
  expectedImpact: string;
}

/**
 * One template per problem class. Objective-aware where the wording depends
 * on what the campaign is buying — a messaging campaign's post-click problem
 * is a WhatsApp workflow problem; a traffic campaign's is a landing page.
 */
function templateFor(
  problemClass: ReconciledIntelligence['problemClass'],
  family: ObjectiveKpiFamily,
): Template | null {
  const def = resultFor(family);

  switch (problemClass) {
    case 'CLICK':
      return {
        actionCode: 'REFRESH_CREATIVE',
        problem: 'التصميم لم يعد يجذب الانتباه',
        action: 'جدّد الصورة أو الفيديو والنص الأساسي، واختبر تصميمين مختلفين',
        expectedImpact: 'ارتفاع معدل النقر خلال 5–7 أيام إذا كان الإجهاد هو السبب',
      };

    case 'POST_CLICK':
      return family === 'messaging'
        ? {
            actionCode: 'FIX_MESSAGING_DESTINATION',
            problem: 'الناس تضغط لكنها لا تصل إلى المحادثة',
            action: 'تحقّق من رقم واتساب، رسالة الترحيب، وسرعة الرد في أوقات الذروة',
            expectedImpact: `ارتفاع نسبة التحويل إلى ${def.labelAr} دون الحاجة لتغيير الإعلان`,
          }
        : {
            actionCode: 'FIX_LANDING_PAGE',
            problem: 'النقرة لا تصل إلى الصفحة',
            action: 'افحص سرعة الصفحة على الجوال، صحة الرابط، وتجربة التحميل',
            expectedImpact: 'ارتفاع مشاهدات صفحة الهبوط بنفس عدد النقرات الحالي',
          };

    case 'CONVERSION':
      return {
        actionCode: 'FIX_CONVERSION_STEP',
        problem: `الزيارات لا تتحول إلى ${def.labelAr}`,
        action: family === 'sales'
          ? 'راجع صفحة المنتج والسعر وخطوات إتمام الشراء'
          : family === 'leads'
            ? 'بسّط النموذج وقلّل عدد الحقول المطلوبة'
            : `راجع الخطوة الأخيرة قبل ${def.labelAr}`,
        expectedImpact: `ارتفاع نسبة التحويل إلى ${def.labelAr} بنفس حجم الزيارات`,
      };

    case 'DELIVERY':
      return {
        actionCode: 'EXPAND_AUDIENCE',
        problem: 'الجمهور مُشبع أو ضيّق — نفس الأشخاص يرون الإعلان مراراً',
        action: 'وسّع الاستهداف أو استبعد من تفاعل مؤخراً، وجدّد التصميم بالتوازي',
        expectedImpact: 'انخفاض التكرار وارتفاع الوصول بنفس الميزانية',
      };

    case 'EFFICIENCY':
      return {
        actionCode: 'REVIEW_BIDDING',
        problem: `النتائج ثابتة لكن تكلفة ${def.labelAr} ترتفع`,
        action: 'راجع استراتيجية المزايدة والجدولة، وقارن التكلفة بين مجموعات الإعلانات',
        expectedImpact: 'استقرار التكلفة دون فقدان حجم النتائج',
      };

    default:
      return null;
  }
}

const SEVERITY_BY_CLASS: Record<string, RecommendationSeverity> = {
  CLICK: 'HIGH',
  POST_CLICK: 'CRITICAL',   // spend is converting to nothing
  CONVERSION: 'CRITICAL',
  DELIVERY: 'HIGH',
  EFFICIENCY: 'NORMAL',
};

/**
 * Build the recommendation implied by the reconciled diagnosis.
 *
 * Returns null — deliberately, and often — when:
 *   · there is no material break                 (silence is valid)
 *   · the break is not anomalous                 (real, but not alert-worthy)
 *   · confidence is INSUFFICIENT_DATA            (nothing to advise on)
 *   · the implied action contradicts the funnel  (the structural guard)
 *
 * A product that recommends something every time it is asked is not advising;
 * it is filling space.
 */
export function buildRecommendation(
  reconciled: ReconciledIntelligence,
  family: ObjectiveKpiFamily | null,
): AnalyticsRecommendation | null {
  if (!family) return null;
  if (reconciled.problemClass === 'NO_MATERIAL_BREAK') return null;
  if (reconciled.confidence === 'INSUFFICIENT_DATA') return null;
  if (!reconciled.alert) return null;

  const template = templateFor(reconciled.problemClass, family);
  if (!template) return null;

  // THE GUARD. If the funnel measured this part of the machine as healthy,
  // the advice does not get to exist — regardless of what produced it.
  const permission = permitAction(template.actionCode, reconciled);
  if (!permission.allowed) return null;

  return {
    problem: template.problem,
    evidence: reconciled.evidence,     // measured facts, carried verbatim
    severity: SEVERITY_BY_CLASS[reconciled.problemClass] ?? 'NORMAL',
    confidence: reconciled.confidence,
    actionCode: template.actionCode,
    action: template.action,
    expectedImpact: template.expectedImpact,
    targetStage: reconciled.problemClass === 'EFFICIENCY' ? null : reconciled.problemClass,
  };
}
