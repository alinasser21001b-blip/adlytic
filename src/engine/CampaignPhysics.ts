// src/engine/CampaignPhysics.ts
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignRawData, AccountBaseline, BaselineConfidence } from './BaselineCalculator';
import { analyzeCostPerMessage } from './CostPerMessageEngine';
import { analyzeCTR, analyzeFrequency, analyzeReliability, MetricAnalysis } from './RelativeScoringEngine';

export interface CampaignPhysicsOutput {
  campaignId: string;
  campaignName: string;
  costPerMessage: MetricAnalysis;   // تم توحيدها كـ Canonical Shape
  ctr: MetricAnalysis;
  frequency: MetricAnalysis;
  reliability: number;              // 0–100 scalar قادم من محرك الموثوقية
  finalScore: number;               // المجموع الموزون المحصور بين [0,100]
  confidence: BaselineConfidence;   // موروثة من الـ Baseline لمعرفة حجم الثقة بالبيانات
}

/**
 * دالة الأوركسترا الرئيسية: تحول بيانات الحملة الخام إلى أدلة فيزيائية مجردة وموزونة.
 */
export function calculateCampaignPhysics(
  campaign: CampaignRawData,
  baseline: AccountBaseline
): CampaignPhysicsOutput {

  // 1. تشغيل المحركات الفرعية واستخراج التحليلات النسبية
  const cpmAnalysis = analyzeCostPerMessage(campaign, baseline);
  const ctrAnalysis = analyzeCTR(campaign, baseline);
  const frequencyAnalysis = analyzeFrequency(campaign, baseline);
  const reliabilityScore = analyzeReliability(campaign);

  // 2. سحب الأوزان الرسمية من الـ Config حرفياً بدون أرقام سحرية
  const { WEIGHTS } = PHYSICS_CONFIG;

  // 3. حساب الـ Final Score الموزون بدقة
  const rawWeightedScore = (
    (cpmAnalysis.score * WEIGHTS.COST_PER_MESSAGE) +
    (ctrAnalysis.score * WEIGHTS.CTR) +
    (frequencyAnalysis.score * WEIGHTS.FREQUENCY) +
    (reliabilityScore * WEIGHTS.RELIABILITY)
  );
  const finalScore = Math.max(0, Math.min(100, Math.round(rawWeightedScore)));

  // 4. بناء المخرج الفيزيائي النهائي المفسر بالكامل
  return {
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    costPerMessage: cpmAnalysis,
    ctr: ctrAnalysis,
    frequency: frequencyAnalysis,
    reliability: reliabilityScore,
    finalScore,
    confidence: baseline.confidence // توريث الثقة للطبقات الاستراتيجية القادمة
  };
}
