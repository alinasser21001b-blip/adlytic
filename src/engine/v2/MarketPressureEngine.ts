// src/engine/v2/MarketPressureEngine.ts
import { MarketPressureAnalysis, MarketBaseline, MarketPressureStatus } from './contracts';
import { MARKET_CONFIG } from './marketConfig';

/**
 * الطبقة الثامنة: محرك ضغط السوق
 * يقرأ نبض المزاد الحالي مقارنة بمتوسط آخر 48 ساعة.
 *
 * Pure function: depends only on inputs, no I/O.
 * Edge case: missing or zero data → returns a safe NORMAL verdict (no NaN leak).
 */
export function evaluateMarketPressure(
  currentCpm: number,
  marketBaseline: MarketBaseline
): MarketPressureAnalysis {

  // حماية رياضية من القسمة على صفر أو البيانات المفقودة
  if (marketBaseline.recentAverageCPM <= 0 || currentCpm <= 0) {
    return {
      status: 'NORMAL',
      marketCpmDelta: 0,
      isAuctionBleeding: false,
    };
  }

  // حساب الانحراف (Delta) بين المزاد اللحظي والمتوسط القريب
  const delta = ((currentCpm - marketBaseline.recentAverageCPM) / marketBaseline.recentAverageCPM) * 100;

  let status: MarketPressureStatus = 'NORMAL';
  let isAuctionBleeding = false;

  // تقييم حالة المزاد بناءً على الإعدادات الصارمة
  if (delta >= MARKET_CONFIG.BLOODBATH_CPM_DELTA_PERCENT) {
    status = 'BLOODBATH';
    isAuctionBleeding = true; // يتم رفع هذه الراية لتخفيف حساسية القتل في الدماغ
  } else if (delta <= MARKET_CONFIG.CHEAP_AUCTION_CPM_DELTA_PERCENT) {
    status = 'CHEAP_AUCTION';
  }

  return {
    status,
    marketCpmDelta: Math.round(delta * 100) / 100, // تقريب لمنزلتين عشريتين
    isAuctionBleeding,
  };
}
