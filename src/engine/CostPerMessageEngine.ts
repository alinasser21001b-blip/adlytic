// src/engine/CostPerMessageEngine.ts
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignRawData, AccountBaseline } from './BaselineCalculator';
import { MetricAnalysis } from './RelativeScoringEngine';

/**
 * محرك تقييم تكلفة الرسالة (Cost Per Message Engine) - الـ 60% الحاكمة.
 * يحلل كفاءة الصرف مقابل خط الأساس للحساب مع فرض عقوبات صارمة على الفانل المكسور.
 */
export function analyzeCostPerMessage(
  campaign: CampaignRawData,
  baseline: AccountBaseline
): MetricAnalysis {

  const baselineValue = baseline.avgCostPerMessage;
  const { BASE_SCORE, DELTA_MULTIPLIER, NO_MESSAGE_MULTIPLIER } = PHYSICS_CONFIG.CPM_ENGINE;

  // 1. معالجة حالة: لا يوجد خط أساس للحساب (Account-wide zero messages)
  if (baselineValue === 0) {
    return {
      value: campaign.messages > 0 ? campaign.spend / campaign.messages : 0,
      baseline: 0,
      delta: 0,
      score: BASE_SCORE // ارتداد محايد (50) لغياب المسطرة الحسابية
    };
  }

  // 2. معالجة حالة: حملة غير نشطة (Zero Spend & Zero Messages)
  if (campaign.spend === 0 && campaign.messages === 0) {
    return {
      value: 0,
      baseline: baselineValue,
      delta: 0,
      score: BASE_SCORE // محايد لأنها لم تبدأ الصرف بعد
    };
  }

  let currentValue = 0;
  let isPenalized = false;

  // 3. تطبيق عقوبة الفانل المكسور (Broken-Funnel Hard Penalty)
  if (campaign.messages === 0 && campaign.spend > 0) {
    // إذا صرفت ولم تأت برأس مال (رسائل)، تُعاقب بفرض تكلفة تخيلية تساوي 5 أضعاف الـ Baseline
    currentValue = baselineValue * NO_MESSAGE_MULTIPLIER;
    isPenalized = true;
  } else {
    currentValue = campaign.spend / campaign.messages;
  }

  // 4. حساب الدلتا المئوية العارية
  // القيمة الأقل تعني دلتا سالبة (توفير)، والقيمة الأعلى تعني دلتا موجبة (زيادة تكلفة)
  const delta = ((currentValue - baselineValue) / baselineValue) * 100;

  // 5. حساب الـ Score وحصره [0, 100]
  // بما أن التكلفة الأقل أفضل، نطرح الدلتا المضروبة في المعامل من الـ Base Score
  const rawScore = BASE_SCORE - (delta * DELTA_MULTIPLIER);

  // إذا كانت الحملة معاقبة بالفانل المكسور، نضمن رياضياً هبوطها للـ 0
  // (لأن دلتا العقوبة ستكون دائماً +400%، و 50 - (400 * 1.5) = -550)
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    value: isPenalized ? 0 : Number(currentValue.toFixed(3)), // نعيد القيمة الفعالية 0 في حال العقوبة للحفاظ على منطق الـ UI
    baseline: Number(baselineValue.toFixed(3)),
    delta: Number(delta.toFixed(1)),
    score
  };
}
