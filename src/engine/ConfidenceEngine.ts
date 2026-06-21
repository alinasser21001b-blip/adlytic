// src/engine/ConfidenceEngine.ts (المطور ليشمل Phase 2.2)
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignPhysicsOutput } from './CampaignPhysics';

export interface ConfidenceAnalysis {
  campaignId: string;
  campaignName: string;
  maturityScore: number;
  volatilityPenalty: number;       // النقاط المخصومة بسبب اضطراب المزاد
  finalConfidenceScore: number;    // الدرجة النهائية بعد الخصم [0, 100]
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  gatingStatus: "COLLECTING_DATA" | "TRUSTED";
  auctionDistressDetected: boolean;
}

export function evaluateCampaignConfidence(
  campaignPhysics: CampaignPhysicsOutput,
  rawSpend: number,
  rawMessages: number
): ConfidenceAnalysis {

  const { CONFIDENCE_ENGINE, VOLATILITY_ENGINE } = PHYSICS_CONFIG;

  // 1. حساب نضج العينة الأساسي (Phase 2.1)
  const messageMaturity = Math.min(1, rawMessages / CONFIDENCE_ENGINE.MIN_MESSAGES_FOR_TRUST);
  const spendMaturity = Math.min(1, rawSpend / CONFIDENCE_ENGINE.MIN_SPEND_FOR_TRUST);
  const maturityScore = Math.round(((messageMaturity + spendMaturity) / 2) * 100);

  // 2. حساب مؤشر اضطراب المزاد والتقلبات (Phase 2.2 - Volatility Engine)
  let volatilityPenalty = 0;
  let auctionDistressDetected = false;

  // أ) فحص انهيار جاذبية الإعلان (CTR Crash)
  if (campaignPhysics.ctr.delta <= VOLATILITY_ENGINE.CTR_CRASH_THRESHOLD) {
    volatilityPenalty += VOLATILITY_ENGINE.CTR_PENALTY_WEIGHT;
    auctionDistressDetected = true;
  }

  // ب) فحص اختناق الجمهور (Frequency Alert)
  if (campaignPhysics.frequency.delta >= VOLATILITY_ENGINE.FREQUENCY_ALERT_THRESHOLD) {
    volatilityPenalty += VOLATILITY_ENGINE.FREQUENCY_PENALTY_WEIGHT;
    auctionDistressDetected = true;
  }

  // ج) فحص الفانل المكسور (Broken Funnel — تكلفة الرسالة تنفجر = نزيف بلا تحويلات)
  // العقوبة في الـ Score تمت بالفعل في CostPerMessageEngine. هنا نرفع علم الاضطراب فقط
  // لكي يصل القرار الاستراتيجي إلى Decision Engine عبر مسار UNSTABLE_NOISE.
  if (campaignPhysics.costPerMessage.delta >= VOLATILITY_ENGINE.BROKEN_FUNNEL_DISTRESS_THRESHOLD) {
    auctionDistressDetected = true;
  }

  // حصر العقوبة تحت السقف الأعلى المحدد في الـ Config
  volatilityPenalty = Math.min(VOLATILITY_ENGINE.MAX_VOLATILITY_PENALTY, volatilityPenalty);

  // 3. استخراج درجة الثقة النهائية المجرّدة
  const finalConfidenceScore = Math.max(0, maturityScore - volatilityPenalty);

  // 4. حوكمة القرار بناءً على الدرجة النهائية الموزونة
  let confidenceLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (finalConfidenceScore >= CONFIDENCE_ENGINE.THRESHOLD_HIGH) {
    confidenceLevel = "HIGH";
  } else if (finalConfidenceScore >= CONFIDENCE_ENGINE.THRESHOLD_LOW) {
    confidenceLevel = "MEDIUM";
  }

  const gatingStatus = confidenceLevel === "HIGH" ? "TRUSTED" : "COLLECTING_DATA";

  return {
    campaignId: campaignPhysics.campaignId,
    campaignName: campaignPhysics.campaignName,
    maturityScore,
    volatilityPenalty,
    finalConfidenceScore,
    confidenceLevel,
    gatingStatus,
    auctionDistressDetected
  };
}
