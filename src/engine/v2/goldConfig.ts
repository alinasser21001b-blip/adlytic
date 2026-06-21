// src/engine/v2/goldConfig.ts
//
// Layer 9 — Gold Standard Comparator tuning dials.
// Weights are percentages that sum to 100 (CPA 50 + CTR 30 + CPM 20).

export const GOLD_CONFIG = {
  WEIGHT_CPA: 50, // تكلفة الرسالة لها الوزن الأكبر
  WEIGHT_CTR: 30, // نسبة النقر
  WEIGHT_CPM: 20, // تكلفة الظهور
  THRESHOLDS: {
    LEGENDARY_DNA: 85,
    GOOD_MATCH: 60,
  },
  DEVIATION_TOLERANCE_PERCENT: 15,
};
