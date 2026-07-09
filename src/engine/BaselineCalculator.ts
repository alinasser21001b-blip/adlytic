// src/engine/BaselineCalculator.ts
import { PHYSICS_CONFIG } from './physicsConfig';

export interface CampaignRawData {
  campaignId: string;
  campaignName: string;
  /** Meta objective string when known (OUTCOME_AWARENESS, MESSAGES, …). */
  objective?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  frequency: number;
  messages: number;
  /** Optional richer counters for objective-aware result selection. */
  purchases?: number;
  leads?: number;
  reach?: number;
  cpm: number;
  cpc: number;
}

export interface BaselineMetadata {
  campaignCount: number;
  totalSpend: number;
  totalMessages: number;
  totalImpressions: number;
  totalClicks: number;
}

export interface BaselineConfidence {
  score: number;
  level: "low" | "medium" | "high";
}

export interface AccountBaseline {
  avgCostPerMessage: number;
  avgCTR: number;
  avgFrequency: number;
  avgCPM: number;
  avgCPC: number;
  metadata: BaselineMetadata;
  confidence: BaselineConfidence;
}

export function calculateAccountBaseline(campaigns: CampaignRawData[]): AccountBaseline {
  // 1. الفلترة: استبعاد الحملات الميتة لتجنب تلوث العينة
  const activeCampaigns = campaigns.filter(c => c.impressions > 0);

  let totalSpend = 0;
  let totalMessages = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let impressionWeightedFrequency = 0;

  activeCampaigns.forEach(campaign => {
    totalSpend += campaign.spend;
    totalMessages += campaign.messages;
    totalImpressions += campaign.impressions;
    totalClicks += campaign.clicks;

    // 2. التكرار الموزون بحجم المشاهدات
    impressionWeightedFrequency += campaign.frequency * campaign.impressions;
  });

  // 3. حساب الميتاداتا
  const metadata: BaselineMetadata = {
    campaignCount: activeCampaigns.length,
    totalSpend,
    totalMessages,
    totalImpressions,
    totalClicks
  };

  // 4. حساب مؤشر الثقة (Baseline Confidence)
  let confidenceLevel: "low" | "medium" | "high" = "low";
  let confidenceScore = 0;

  const { BASELINE_CONFIDENCE } = PHYSICS_CONFIG;

  if (totalMessages >= BASELINE_CONFIDENCE.HIGH_MIN_MESSAGES && totalSpend >= BASELINE_CONFIDENCE.HIGH_MIN_SPEND) {
    confidenceLevel = "high";
    confidenceScore = 100;
  } else if (totalMessages >= BASELINE_CONFIDENCE.MEDIUM_MIN_MESSAGES && totalSpend >= BASELINE_CONFIDENCE.MEDIUM_MIN_SPEND) {
    confidenceLevel = "medium";
    confidenceScore = 75;
  } else {
    confidenceLevel = "low";
    // حساب درجة الثقة كنسبة مئوية من الحد المتوسط
    confidenceScore = Math.min(50, Math.floor((totalMessages / BASELINE_CONFIDENCE.MEDIUM_MIN_MESSAGES) * 50));
  }

  const confidence: BaselineConfidence = {
    score: Math.max(0, confidenceScore),
    level: confidenceLevel
  };

  // 5. الفيزياء العارية: الحساب النهائي للـ Baseline
  return {
    avgCostPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
    avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    avgCPM: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    avgCPC: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avgFrequency: totalImpressions > 0 ? impressionWeightedFrequency / totalImpressions : 0,
    metadata,
    confidence
  };
}
