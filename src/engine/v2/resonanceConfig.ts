// src/engine/v2/resonanceConfig.ts
//
// Layer 11 — Audience & Creative Resonance tuning dials.
// All placement keywords, visual-hook tokens, penalties, and thresholds
// live here so the engine itself stays a pure heuristic with zero literals.

export const RESONANCE_CONFIG = {
  // عقوبات عدم التوافق بين نوع المحتوى ومكان العرض (Placement Mismatch Penalties)
  PENALTIES: {
    STATIC_ON_REELS: 40,        // وضع صورة ثابتة في منصة فيديو قصير (خطيئة تسويقية)
    LONG_VIDEO_ON_STORIES: 30,  // فيديو طويل في الستوريز
  },

  // عتبات التقييم
  THRESHOLDS: {
    PERFECT_ALIGNMENT: 85,
    MISALIGNED: 50,
  },

  // الكلمات المفتاحية المتعارف عليها للـ Placements القادمة من Meta API
  PLACEMENTS: {
    REELS: ['instagram_reels', 'facebook_reels'],
    STORIES: ['instagram_stories', 'facebook_stories'],
    FEED: ['instagram_feed', 'facebook_feed'],
  },

  // الكلمات المفتاحية لـ Vision AI Hooks
  HOOKS: {
    STATIC_IMAGE: 'STATIC_IMAGE',
    SHORT_VIDEO: 'SHORT_VIDEO',  // أقل من 15 ثانية
    LONG_VIDEO: 'LONG_VIDEO',    // أطول من 15 ثانية
  },
};
