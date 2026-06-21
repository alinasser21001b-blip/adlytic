// src/engine/v2/marketConfig.ts
//
// V2 Market Pressure tuning dials. Isolated from V1 `physicsConfig.ts` to
// prevent cross-contamination. All thresholds for Layer 8 live here.

export const MARKET_CONFIG = {
  // إذا ارتفع الـ CPM بنسبة 40% عن متوسط آخر 48 ساعة، السوق ينزف
  BLOODBATH_CPM_DELTA_PERCENT: 40,

  // إذا انخفض الـ CPM بنسبة 20%، المزاد رخيص وفرصة للهجوم
  CHEAP_AUCTION_CPM_DELTA_PERCENT: -20,
};
