// src/engine/PatternEngine.ts
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignPhysicsOutput } from './CampaignPhysics';
import { ConfidenceAnalysis } from './ConfidenceEngine';

export type CampaignPatternSignature =
  | 'SCALABLE_BEAST'
  | 'DYING_CREATIVE'
  | 'STABLE_PERFORMER'
  | 'UNSTABLE_NOISE'
  | 'UNDER_OBSERVATION';

export interface PatternAnalysis {
  campaignId: string;
  signature: CampaignPatternSignature;
  reason: string;
}

/**
 * محرك التعرف على الأنماط الاستراتيجية (Pattern Engine)
 * الطبقة 3.1: ترجمة الأرقام الجافة إلى تشخيصات حية
 */
export function recognizeCampaignPattern(
  physics: CampaignPhysicsOutput,
  confidence: ConfidenceAnalysis
): PatternAnalysis {

  const { BEAST, DYING_CREATIVE } = PHYSICS_CONFIG.PATTERN_ENGINE;

  // 1. نمط: الوحش القابل للتوسع (The Scalable Beast)
  // أداء فائق + ثقة عالية جداً + لا يوجد اضطراب في المزاد
  if (
    physics.finalScore >= BEAST.MIN_FINAL_SCORE &&
    confidence.finalConfidenceScore >= BEAST.MIN_CONFIDENCE_SCORE &&
    confidence.gatingStatus === 'TRUSTED' &&
    !confidence.auctionDistressDetected
  ) {
    return {
      campaignId: physics.campaignId,
      signature: 'SCALABLE_BEAST',
      reason: `High performance (Score: ${physics.finalScore}) backed by solid statistical confidence (${confidence.finalConfidenceScore}%). Ready for budget scaling.`
    };
  }

  // 2. نمط: الإعلان المحتضر (The Dying Creative)
  // ناضج إحصائياً ولكنه يعاني حالياً من انهيار في النقر أو تكرار مميت
  if (
    confidence.maturityScore >= DYING_CREATIVE.MIN_MATURITY_SCORE &&
    physics.finalScore <= DYING_CREATIVE.MAX_FINAL_SCORE &&
    confidence.auctionDistressDetected === true
  ) {
    return {
      campaignId: physics.campaignId,
      signature: 'DYING_CREATIVE',
      reason: `Historically mature, but currently collapsing due to intense auction distress or creative fatigue.`
    };
  }

  // 3. نمط: الأداء المستقر العادي (Stable Performer)
  // بيانات موثوقة وأداء متوسط يقع في المنطقة الآمنة
  if (
    confidence.gatingStatus === 'TRUSTED' &&
    physics.finalScore > DYING_CREATIVE.MAX_FINAL_SCORE &&
    physics.finalScore < BEAST.MIN_FINAL_SCORE
  ) {
    return {
      campaignId: physics.campaignId,
      signature: 'STABLE_PERFORMER',
      reason: 'Campaign performance is within acceptable baseline margins with stable auction health.'
    };
  }

  // 4. نمط: الضوضاء غير المستقرة (Unstable Noise)
  // بيانات غير ناضجة وتترافق مع اضطراب عالي
  if (confidence.gatingStatus === 'COLLECTING_DATA' && confidence.auctionDistressDetected === true) {
    return {
      campaignId: physics.campaignId,
      signature: 'UNSTABLE_NOISE',
      reason: 'Low data maturity combined with heavy volatility. High risk of capital bleeding.'
    };
  }

  // 5. النمط الافتراضي (Under Observation)
  // بيانات لم تنضج بعد ولا يوجد بها شذوذ خطير
  return {
    campaignId: physics.campaignId,
    signature: 'UNDER_OBSERVATION',
    reason: 'Data is still accumulating normally. No critical patterns triggered yet.'
  };
}
