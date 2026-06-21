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
  },
  CONFIDENCE_ENGINE: {
    MIN_MESSAGES_FOR_TRUST: 20,      // الحد الأدنى من الرسائل لاعتبار القراءة مستقرة
    MIN_SPEND_FOR_TRUST: 50,         // الحد الأدنى من الصرف بالدولار لضمان تجاوز عشوائية المزاد
    THRESHOLD_LOW: 35,               // تحت هذه الدرجة: جمع بيانات فقط
    THRESHOLD_HIGH: 75               // فوق هذه الدرجة: بيانات موثوقة تماماً ومستقرة
  },
  VOLATILITY_ENGINE: {
    CTR_CRASH_THRESHOLD: -30,        // إذا هبط الـ CTR بنسبة 30% أو أكثر عن الأساس
    FREQUENCY_ALERT_THRESHOLD: 20,   // إذا زاد التكرار بنسبة 20% أو أكثر عن الأساس
    MAX_VOLATILITY_PENALTY: 40,      // أقصى خصم من نقاط الثقة عند اضطراب المزاد
    CTR_PENALTY_WEIGHT: 20,          // وزن العقوبة عند رصد انهيار جاذبية الإعلان
    FREQUENCY_PENALTY_WEIGHT: 20     // وزن العقوبة عند رصد اختناق الجمهور
  },
  PATTERN_ENGINE: {
    BEAST: {
      MIN_FINAL_SCORE: 75,           // يجب أن تكون التكلفة والأداء العام ممتازين
      MIN_CONFIDENCE_SCORE: 80       // ثقة حديدية لمنع ضربات الحظ
    },
    DYING_CREATIVE: {
      MIN_MATURITY_SCORE: 60,        // ناضجة تاريخياً ولها سجل طويل
      MAX_FINAL_SCORE: 45            // أداؤها الحالي العام سيء أو متراجع
    }
  },
  RECOVERY_GATE: {
    CPM_DROP_THRESHOLD: -15,         // CPM انخفض بنسبة 15% أو أكثر (السوق أصبح أرخص)
    CTR_JUMP_THRESHOLD: 10           // CTR قفز بنسبة 10% أو أكثر (تجدد اهتمام الجمهور)
  }
} as const;
