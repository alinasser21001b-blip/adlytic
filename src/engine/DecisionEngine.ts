// src/engine/DecisionEngine.ts
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignPhysicsOutput } from './CampaignPhysics';
import { ConfidenceAnalysis } from './ConfidenceEngine';
import { PatternAnalysis } from './PatternEngine';
import { RecoveryAnalysis } from './RecoveryGate';

export type DecisionAction =
  | 'SCALE_BUDGET'        // الوحش الموثوق → ضخ رأس مال
  | 'HOLD_AND_MONITOR'    // كل شيء طبيعي، لا تتدخل
  | 'REFRESH_CREATIVE'    // المحتوى أرهق الجمهور
  | 'PAUSE_CAMPAIGN'      // ينزف رأس مال بلا أمل
  | 'KEEP_COLLECTING'     // البيانات لم تنضج
  | 'RESCUE_WATCH'        // Recovery Gate رصد إشارة حياة → لا تقتل بعد
  | 'EMERGENCY_PAUSE';    // V2 Layer 10 (Velocity Tracker) رفع راية النزيف اللحظي
                          //   → orchestrator-only override، لا تُصدرها decideCampaignAction أبداً

export interface CampaignDecision {
  campaignId: string;
  action: DecisionAction;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  reason: string;
  // إذا تم تجاوز قرار Layer 4 بواسطة V2 emergencyOverride،
  // نحفظ القرار الأصلي هنا للديباغ والشفافية. لا يُضبط داخل decideCampaignAction.
  overriddenAction?: DecisionAction;
}

/**
 * محرك القرار الاستراتيجي (Decision Engine)
 * الطبقة 4: تجميع التشخيصات (Patterns + Recovery + Confidence) وترجمتها إلى Action.
 * دالة نقية. لا تكتب، لا تنفذ، لا تتصل بالـ API. فقط تقول للنظام: "افعل كذا".
 */
export function decideCampaignAction(
  physics: CampaignPhysicsOutput,
  confidence: ConfidenceAnalysis,
  pattern: PatternAnalysis,
  recovery: RecoveryAnalysis
): CampaignDecision {

  const { KILL_THRESHOLD, SCALE_MIN_CONFIDENCE } = PHYSICS_CONFIG.DECISION_ENGINE;

  // Rule 1: RESCUE_WATCH — إشارة حياة قوية في حملة كانت محسوبة على الموتى
  if (
    recovery.recoverySignalStrength === 'STRONG' &&
    (pattern.signature === 'DYING_CREATIVE' || pattern.signature === 'UNSTABLE_NOISE')
  ) {
    return {
      campaignId: physics.campaignId,
      action: 'RESCUE_WATCH',
      priority: 'HIGH',
      reason: `Auction reversal detected on a struggling campaign. ${recovery.reason} Do not kill — observe closely.`
    };
  }

  // Rule 2: SCALE_BUDGET — الوحش القابل للتوسع بثقة حديدية فوق سقف التضخيم
  if (
    pattern.signature === 'SCALABLE_BEAST' &&
    confidence.finalConfidenceScore >= SCALE_MIN_CONFIDENCE
  ) {
    return {
      campaignId: physics.campaignId,
      action: 'SCALE_BUDGET',
      priority: 'HIGH',
      reason: `${pattern.reason} Confidence ${confidence.finalConfidenceScore}% clears scaling floor (${SCALE_MIN_CONFIDENCE}%).`
    };
  }

  // Rule 3: REFRESH_CREATIVE — إعلان محتضر بدون إشارة إنقاذ قوية (Rule 1 استوعب القوية)
  if (pattern.signature === 'DYING_CREATIVE') {
    return {
      campaignId: physics.campaignId,
      action: 'REFRESH_CREATIVE',
      priority: 'CRITICAL',
      reason: `Mature campaign with collapsing performance. ${pattern.reason} Creative fatigue is the prime suspect.`
    };
  }

  // Rule 4: PAUSE_CAMPAIGN — ضوضاء غير مستقرة تحت أرضية الإعدام
  if (
    pattern.signature === 'UNSTABLE_NOISE' &&
    physics.finalScore < KILL_THRESHOLD
  ) {
    return {
      campaignId: physics.campaignId,
      action: 'PAUSE_CAMPAIGN',
      priority: 'CRITICAL',
      reason: `Score ${physics.finalScore} is below kill floor (${KILL_THRESHOLD}) with active auction distress and no maturity. Capital bleeding — pause immediately.`
    };
  }

  // Rule 5: KEEP_COLLECTING — العينة لم تنضج بعد للحكم
  if (confidence.gatingStatus === 'COLLECTING_DATA') {
    return {
      campaignId: physics.campaignId,
      action: 'KEEP_COLLECTING',
      priority: 'NORMAL',
      reason: `Sample not yet mature (maturity ${confidence.maturityScore}%, confidence ${confidence.finalConfidenceScore}%). No verdict possible — let it gather signal.`
    };
  }

  // Rule 6: HOLD_AND_MONITOR — أداء مستقر طبيعي
  if (pattern.signature === 'STABLE_PERFORMER') {
    return {
      campaignId: physics.campaignId,
      action: 'HOLD_AND_MONITOR',
      priority: 'NORMAL',
      reason: `${pattern.reason} No intervention warranted.`
    };
  }

  // Rule 7: Default fallthrough — لا تشخيص حاد، فلا تدخل
  return {
    campaignId: physics.campaignId,
    action: 'HOLD_AND_MONITOR',
    priority: 'NORMAL',
    reason: `No critical signal triggered. Pattern: ${pattern.signature}. Holding position.`
  };
}
