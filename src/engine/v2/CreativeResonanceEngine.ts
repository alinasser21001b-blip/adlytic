// src/engine/v2/CreativeResonanceEngine.ts
//
// الطبقة 11: محرك صدى المنتج والمحتوى (Audience & Creative Resonance)
// يأخذ بيانات المنصة والجمهور + التحليل البصري للإعلان، ويُخرج درجة توافق
// وتوجيهاً إبداعياً نصياً جاهزاً ليستهلكه Claude CMO عند الصياغة للتاجر.
//
// Pure function — no I/O, no model calls. Heuristic only.

import { BreakdownData, VisionAIPayload, ResonanceAnalysis } from './contracts';
import { RESONANCE_CONFIG } from './resonanceConfig';

const STARTING_SCORE = 100;

export function evaluateCreativeResonance(
  breakdowns: BreakdownData,
  vision: VisionAIPayload
): ResonanceAnalysis {

  let score = STARTING_SCORE;
  const mismatchReasons: string[] = [];
  let directive = '';

  const bestPlacement = breakdowns.bestPlacement.toLowerCase();
  const visualHook = vision.visualHook.toUpperCase();

  // 1. تقييم التوافق بين المحتوى (Visual Hook) والمنصة (Placement)
  const isReels = RESONANCE_CONFIG.PLACEMENTS.REELS.some(p => bestPlacement.includes(p));
  const isStories = RESONANCE_CONFIG.PLACEMENTS.STORIES.some(p => bestPlacement.includes(p));

  if (isReels && visualHook === RESONANCE_CONFIG.HOOKS.STATIC_IMAGE) {
    score -= RESONANCE_CONFIG.PENALTIES.STATIC_ON_REELS;
    mismatchReasons.push('استخدام صورة ثابتة في مساحة مخصصة للفيديو القصير (Reels)');
  }

  if (isStories && visualHook === RESONANCE_CONFIG.HOOKS.LONG_VIDEO) {
    score -= RESONANCE_CONFIG.PENALTIES.LONG_VIDEO_ON_STORIES;
    mismatchReasons.push('الفيديو طويل جداً لمساحة القصص (Stories) السريعة');
  }

  // 2. صياغة التوجيه الإبداعي (Creative Directive) الموجه لـ Claude CMO
  const audienceSummary =
    `المنتج (${vision.productType}) يحقق أفضل مبيعاته مع (${breakdowns.topGender}) في الفئة العمرية ` +
    `(${breakdowns.topAgeGroup}) عبر منصة (${breakdowns.bestPlacement}) في وقت الذروة ` +
    `(${breakdowns.peakTimeWindow}).`;

  if (score >= RESONANCE_CONFIG.THRESHOLDS.PERFECT_ALIGNMENT) {
    directive =
      `${audienceSummary} الإعلان الحالي متوافق بصرياً بشكل ممتاز. ` +
      `التوجيه: ضاعف الميزانية واطلب من التاجر إنتاج نسخ مشابهة (Variations) بنفس الطابع.`;
  } else if (score < RESONANCE_CONFIG.THRESHOLDS.MISALIGNED) {
    directive =
      `${audienceSummary} **تحذير عدم توافق:** رصدنا (${mismatchReasons.join(' و ')}). ` +
      `التوجيه: اطلب من التاجر إيقاف هدر المال على هذا التنسيق، وتصميم محتوى مخصص يتناسب مع طبيعة المنصة الناجحة.`;
  } else {
    directive =
      `${audienceSummary} التوافق البصري متوسط. ` +
      `التوجيه: اختبر طابعاً بصرياً مختلفاً لتحسين نسبة النقر.`;
  }

  return {
    audienceAlignmentScore: Math.max(0, score),
    creativeDirective: directive,
  };
}
