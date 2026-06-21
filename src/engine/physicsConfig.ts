// src/engine/physicsConfig.ts

export const PHYSICS_CONFIG = {
  WEIGHTS: {
    COST_PER_MESSAGE: 0.60,
    CTR: 0.20,
    FREQUENCY: 0.15,
    RELIABILITY: 0.05
  },
  THRESHOLDS: {
    MIN_MESSAGES: 5,
    MIN_SPEND: 10
  },
  BASELINE_CONFIDENCE: {
    HIGH_MIN_MESSAGES: 100,
    HIGH_MIN_SPEND: 100,
    MEDIUM_MIN_MESSAGES: 30,
    MEDIUM_MIN_SPEND: 30
  },
  CPM_ENGINE: {
    BASE_SCORE: 50,
    DELTA_MULTIPLIER: 1.5,
    NO_MESSAGE_MULTIPLIER: 5
  },
  CTR_ENGINE: {
    BASE_SCORE: 50,
    DELTA_MULTIPLIER: 2.0,      // حساسية مضاعفة لأن فروق الـ CTR صغيرة وحاسمة
    ZERO_CTR_PENALTY_SCORE: 0   // عقوبة فورية إذا كان الـ CTR صفراً مع وجود مشاهدات
  },
  FREQUENCY_ENGINE: {
    BASE_SCORE: 50,
    DELTA_MULTIPLIER: 1.0       // إذا زاد التكرار بنسبة 50% يهبط الـ Score إلى صفر
  }
} as const;
