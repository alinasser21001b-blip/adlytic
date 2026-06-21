// src/engine/v2/velocityConfig.ts
//
// Layer 10 — Intra-Day Velocity Tracker tuning dials.

export const VELOCITY_CONFIG = {
  // الحد الأدنى من الساعات قبل بدء الحكم (لا نحكم على حملة في أول ساعة من اليوم)
  MIN_HOURS_ACTIVE_TO_JUDGE: 3,

  // عتبات النزيف بناءً على نسبة استهلاك الميزانية اليومية بدون نتائج (0 رسائل)
  HEMORRHAGE_SPEND_PERCENT_NO_RESULTS: 40,
  MICRO_BLEED_SPEND_PERCENT_NO_RESULTS: 20,

  // عتبات النزيف في حال وجود نتائج ولكن بتكلفة جنونية
  HEMORRHAGE_CPA_MULTIPLIER: 3,

  // الحد الأدنى من نسبة استهلاك الميزانية قبل تفعيل فحص "Insane CPA Bleed"
  // (نحمي الحملة من الحكم المبكر على عيّنة صغيرة من الإنفاق)
  HEMORRHAGE_CPA_MIN_SPEND_PERCENT: 30,
};
