// src/engine/RecoveryGate.ts
import { PHYSICS_CONFIG } from './physicsConfig';
import { CampaignPhysicsOutput } from './CampaignPhysics';

export interface RecoveryAnalysis {
  campaignId: string;
  isRecovering: boolean;
  recoverySignalStrength: 'NONE' | 'MODERATE' | 'STRONG';
  reason: string;
}

/**
 * بوابة الإنعاش (Recovery Gate)
 * الطبقة 3.2: البحث عن إشارات التحسن المفاجئ في المزاد للحملات المتعثرة
 */
export function evaluateRecoveryPotential(
  physics: CampaignPhysicsOutput
): RecoveryAnalysis {

  const { CPM_DROP_THRESHOLD, CTR_JUMP_THRESHOLD } = PHYSICS_CONFIG.RECOVERY_GATE;

  // فحص إشارات الحياة من المزاد
  // هل التكلفة تنخفض بشدة؟
  const isCpmImproving = physics.costPerMessage.delta <= CPM_DROP_THRESHOLD;
  // هل النقر يرتفع بشكل ملحوظ؟
  const isCtrImproving = physics.ctr.delta >= CTR_JUMP_THRESHOLD;

  if (isCpmImproving && isCtrImproving) {
    return {
      campaignId: physics.campaignId,
      isRecovering: true,
      recoverySignalStrength: 'STRONG',
      reason: `Strong recovery detected: CPM dropped by ${Math.abs(physics.costPerMessage.delta)}% and CTR jumped by ${physics.ctr.delta}%. The auction is highly favorable right now.`
    };
  }

  if (isCpmImproving || isCtrImproving) {
    const singleReason = isCpmImproving
      ? `Moderate recovery: CPM is getting cheaper (${Math.abs(physics.costPerMessage.delta)}% drop).`
      : `Moderate recovery: Audience engagement is rising (CTR jumped ${physics.ctr.delta}%).`;

    return {
      campaignId: physics.campaignId,
      isRecovering: true,
      recoverySignalStrength: 'MODERATE',
      reason: singleReason
    };
  }

  return {
    campaignId: physics.campaignId,
    isRecovering: false,
    recoverySignalStrength: 'NONE',
    reason: 'No significant positive market shifts detected.'
  };
}
