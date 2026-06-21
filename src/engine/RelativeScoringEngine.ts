// src/engine/RelativeScoringEngine.ts
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignRawData, AccountBaseline } from './BaselineCalculator';

export interface MetricAnalysis {
  value: number;
  baseline: number;
  delta: number;
  score: number;
}

/**
 * 1. محرك تقييم نسبة النقر (CTR Engine) - الأعلى أفضل
 */
export function analyzeCTR(campaign: CampaignRawData, baseline: AccountBaseline): MetricAnalysis {
  const baselineValue = baseline.avgCTR;
  const { BASE_SCORE, DELTA_MULTIPLIER, ZERO_CTR_PENALTY_SCORE } = PHYSICS_CONFIG.CTR_ENGINE;

  if (campaign.ctr === 0 && campaign.impressions > 0) {
    return { value: 0, baseline: baselineValue, delta: -100, score: ZERO_CTR_PENALTY_SCORE };
  }

  if (baselineValue === 0) {
    return { value: campaign.ctr, baseline: 0, delta: 0, score: BASE_SCORE };
  }

  // دلتا موجبة تعني CTR أعلى = أفضل
  const delta = ((campaign.ctr - baselineValue) / baselineValue) * 100;
  const rawScore = BASE_SCORE + (delta * DELTA_MULTIPLIER);

  return {
    value: Number(campaign.ctr.toFixed(2)),
    baseline: Number(baselineValue.toFixed(2)),
    delta: Number(delta.toFixed(1)),
    score: Math.max(0, Math.min(100, Math.round(rawScore)))
  };
}

/**
 * 2. محرك تقييم التكرار (Frequency Engine) - الأقل أفضل
 */
export function analyzeFrequency(campaign: CampaignRawData, baseline: AccountBaseline): MetricAnalysis {
  const baselineValue = baseline.avgFrequency;
  const { BASE_SCORE, DELTA_MULTIPLIER } = PHYSICS_CONFIG.FREQUENCY_ENGINE;

  if (baselineValue === 0 || campaign.frequency === 0) {
    return { value: campaign.frequency, baseline: baselineValue, delta: 0, score: BASE_SCORE };
  }

  // دلتا موجبة تعني تكرار أعلى = أسوأ للتاجر (لذلك نطرحها من الـ Base Score)
  const delta = ((campaign.frequency - baselineValue) / baselineValue) * 100;
  const rawScore = BASE_SCORE - (delta * DELTA_MULTIPLIER);

  return {
    value: Number(campaign.frequency.toFixed(2)),
    baseline: Number(baselineValue.toFixed(2)),
    delta: Number(delta.toFixed(1)),
    score: Math.max(0, Math.min(100, Math.round(rawScore)))
  };
}

/**
 * 3. محرك الموثوقية الإحصائية (Reliability Engine - Phase 1.4)
 */
export function analyzeReliability(campaign: CampaignRawData): number {
  const { MIN_MESSAGES, MIN_SPEND } = PHYSICS_CONFIG.THRESHOLDS;

  if (campaign.spend === 0) return 0;
  if (campaign.messages >= MIN_MESSAGES && campaign.spend >= MIN_SPEND) return 100;

  // حساب النسبة المتدرجة العادلة للحملات الجديدة
  const messageRatio = Math.min(1, campaign.messages / MIN_MESSAGES);
  const spendRatio = Math.min(1, campaign.spend / MIN_SPEND);

  return Math.round(((messageRatio + spendRatio) / 2) * 100);
}
