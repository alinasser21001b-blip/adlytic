// src/engine/AdlyticBrain.ts
import { calculateCampaignPhysics, CampaignPhysicsOutput } from './CampaignPhysics';
import { CampaignRawData, AccountBaseline } from './BaselineCalculator';
import { evaluateCampaignConfidence, ConfidenceAnalysis } from './ConfidenceEngine';
import { recognizeCampaignPattern, PatternAnalysis } from './PatternEngine';
import { evaluateRecoveryPotential, RecoveryAnalysis } from './RecoveryGate';
import { decideCampaignAction, CampaignDecision } from './DecisionEngine';

/**
 * المخرج الشامل لكل حملة بعد المرور بكامل طبقات الدماغ.
 */
export interface BrainTickResult {
  campaignId: string;
  campaignName: string;
  physics: CampaignPhysicsOutput;
  confidence: ConfidenceAnalysis;
  pattern: PatternAnalysis;
  recovery: RecoveryAnalysis;
  decision: CampaignDecision;
}

/**
 * محرك التنسيق الرئيسي (The Orchestrator) — الطبقة 5
 * المدخل الوحيد المسموح لبقية النظام (Workers, API, UI) للحديث مع الدماغ.
 * يمرر بيانات الحملة عبر الطبقات بالترتيب الصارم:
 *   Layer 1: Physics → Layer 2: Confidence → Layer 3: Pattern + Recovery → Layer 4: Decision
 */
export function runBrainForCampaign(
  raw: CampaignRawData,
  baseline: AccountBaseline
): BrainTickResult {

  // Layer 1: Physics Engine — الأرقام المجردة والدلتا الموزونة
  const physics = calculateCampaignPhysics(raw, baseline);

  // Layer 2: Confidence Engine — هل البيانات ناضجة وخالية من الاضطراب؟
  const confidence = evaluateCampaignConfidence(physics, raw.spend, raw.messages);

  // Layer 3: التشخيصات الاستراتيجية
  const pattern = recognizeCampaignPattern(physics, confidence);
  const recovery = evaluateRecoveryPotential(physics);

  // Layer 4: Decision Engine — الترجمة إلى Action قابل للتنفيذ
  const decision = decideCampaignAction(physics, confidence, pattern, recovery);

  return {
    campaignId: raw.campaignId,
    campaignName: raw.campaignName,
    physics,
    confidence,
    pattern,
    recovery,
    decision
  };
}

/**
 * تشغيل الدماغ على حزمة من الحملات (Batch Processor).
 * كل عنصر يحمل بياناته الخام مع الـ baseline المرجعي (عادةً مشترك لكامل الحساب).
 */
export function runBrainBatch(
  campaigns: Array<{ raw: CampaignRawData; baseline: AccountBaseline }>
): BrainTickResult[] {
  return campaigns.map(c => runBrainForCampaign(c.raw, c.baseline));
}
