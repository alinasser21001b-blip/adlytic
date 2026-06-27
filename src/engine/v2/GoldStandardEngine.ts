// src/engine/v2/GoldStandardEngine.ts
//
// الطبقة التاسعة: محرك المعيار الذهبي (الحمض النووي)
// يقارن أداء الحملة الحالية بأفضل حملة تاريخية للحساب نفسه.
// Pure function — no I/O, no clocks, no randomness.

import { GoldStandardAnalysis, GoldStandardDNA, DnaMatchVerdict } from './contracts';
import { GOLD_CONFIG } from './goldConfig';

export interface CurrentCampaignMetrics {
  cpm: number;
  ctr: number;
  costPerMessage: number;
}

export function evaluateGoldStandard(
  current: CurrentCampaignMetrics,
  gold: GoldStandardDNA
): GoldStandardAnalysis {

  const deviations: string[] = [];

  // حماية من الأرقام الصفرية
  if (gold.bestHistoricalCpm <= 0 || gold.bestHistoricalCtr <= 0 || gold.bestHistoricalCostPerMessage <= 0) {
    return {
      dnaMatchPercentage: 0,
      verdict: 'POOR_MATCH',
      deviations: ['بيانات المعيار المرجعي غير مكتملة.'],
    };
  }

  // 1. CPA Score (أقل = أفضل)
  const cpaDelta = ((current.costPerMessage - gold.bestHistoricalCostPerMessage) / gold.bestHistoricalCostPerMessage) * 100;
  const cpaScore = cpaDelta <= 0 ? 100 : Math.max(0, 100 - cpaDelta);
  if (cpaDelta > GOLD_CONFIG.DEVIATION_TOLERANCE_PERCENT) {
    deviations.push(`تكلفة الرسالة أعلى بـ ${Math.round(cpaDelta)}% من أفضل حملاتك السابقة.`);
  }

  // 2. CTR Score (أعلى = أفضل، فالمعادلة معكوسة)
  const ctrDelta = ((gold.bestHistoricalCtr - current.ctr) / gold.bestHistoricalCtr) * 100;
  const ctrScore = ctrDelta <= 0 ? 100 : Math.max(0, 100 - ctrDelta);
  if (ctrDelta > GOLD_CONFIG.DEVIATION_TOLERANCE_PERCENT) {
    deviations.push(`نسبة النقر (CTR) أقل بـ ${Math.round(ctrDelta)}% من المعيار المرجعي.`);
  }

  // 3. CPM Score (أقل = أفضل)
  const cpmDelta = ((current.cpm - gold.bestHistoricalCpm) / gold.bestHistoricalCpm) * 100;
  const cpmScore = cpmDelta <= 0 ? 100 : Math.max(0, 100 - cpmDelta);
  if (cpmDelta > GOLD_CONFIG.DEVIATION_TOLERANCE_PERCENT) {
    deviations.push(`تكلفة الألف ظهور (CPM) أعلى بـ ${Math.round(cpmDelta)}% من أفضل حملاتك السابقة.`);
  }

  // Weighted blend — weights sum to 100 by contract (50 + 30 + 20)
  const weightedScore =
    (cpaScore * (GOLD_CONFIG.WEIGHT_CPA / 100)) +
    (ctrScore * (GOLD_CONFIG.WEIGHT_CTR / 100)) +
    (cpmScore * (GOLD_CONFIG.WEIGHT_CPM / 100));

  const dnaMatchPercentage = Math.round(weightedScore);

  let verdict: DnaMatchVerdict = 'POOR_MATCH';
  if (dnaMatchPercentage >= GOLD_CONFIG.THRESHOLDS.LEGENDARY_DNA) {
    verdict = 'LEGENDARY_DNA';
  } else if (dnaMatchPercentage >= GOLD_CONFIG.THRESHOLDS.GOOD_MATCH) {
    verdict = 'GOOD_MATCH';
  }

  if (deviations.length === 0) {
    deviations.push('الأداء متوافق مع أفضل حملاتك السابقة.');
  }

  return { dnaMatchPercentage, verdict, deviations };
}
