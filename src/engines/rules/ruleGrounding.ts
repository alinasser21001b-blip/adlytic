// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/ruleGrounding.ts
//
//  Pure bridge between detectors/diagnose and the V6 brain.
//  Uses the shared detector pipeline + absolute campaign signals.
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { CampaignDecision } from '../../engine/DecisionEngine';
import { signalsFromCampaignRaw } from './campaignSignals';
import { runDetectorPipeline } from './runDetectorPipeline';

export interface RuleGrounding {
  issues: Array<{ code: string; severity: string }>;
  diagnoses: Array<{
    code: string;
    name: string;
    confidence: number;
    narrative: string;
    action: string;
  }>;
  /** Top diagnosis code, if any. */
  primaryCode: string | null;
}

export function buildRuleGrounding(
  raw: CampaignRawData,
  baseline: AccountBaseline,
): RuleGrounding {
  const { issues, diagnoses } = runDetectorPipeline(signalsFromCampaignRaw(raw, baseline));

  return {
    issues: issues.map((i) => ({
      code: String(i.issueCode),
      severity: String(i.severity),
    })),
    diagnoses: diagnoses.map((d) => ({
      code: d.code,
      name: d.name,
      confidence: d.confidence,
      narrative: d.narrative,
      action: d.action,
    })),
    primaryCode: diagnoses[0]?.code ?? null,
  };
}

/**
 * Soft fusion: adjust a brain decision when rule diagnoses agree/disagree
 * with the physics/pattern verdict.
 *
 * Guardrails:
 * - Never invents EMERGENCY_PAUSE.
 * - Never upgrades KEEP_COLLECTING.
 * - POST_CLICK_PROBLEM always outranks creative-refresh upgrades.
 */
export function applyRuleGroundingToDecision(
  decision: CampaignDecision,
  grounding: RuleGrounding | null | undefined,
): CampaignDecision {
  if (!grounding || grounding.diagnoses.length === 0) return decision;

  const codes = new Set(grounding.diagnoses.map((d) => d.code));
  const primary = grounding.primaryCode;
  let next = decision;

  if (
    (codes.has('CREATIVE_FATIGUE') || codes.has('WEAK_CREATIVE')) &&
    next.action === 'HOLD_AND_MONITOR'
  ) {
    next = {
      ...next,
      action: 'REFRESH_CREATIVE',
      priority: 'HIGH',
      reason:
        `${next.reason} | Rule grounding: ${primary} — creative refresh is the primary lever.`,
      overriddenAction: next.action,
    };
  }

  if (
    codes.has('AUCTION_PRESSURE') &&
    next.action === 'PAUSE_CAMPAIGN' &&
    !codes.has('CREATIVE_FATIGUE') &&
    !codes.has('WEAK_CREATIVE')
  ) {
    next = {
      ...next,
      action: 'HOLD_AND_MONITOR',
      priority: 'HIGH',
      reason:
        `${next.reason} | Rule grounding: auction pressure — creative may be fine; market is expensive.`,
      overriddenAction: next.overriddenAction ?? next.action,
    };
  }

  if (codes.has('AUDIENCE_SATURATION') && next.action === 'REFRESH_CREATIVE') {
    next = {
      ...next,
      reason:
        `${next.reason} | Rule grounding: audience saturation — refresh creative and consider expanding audience.`,
    };
  }

  if (
    codes.has('CREATIVE_FATIGUE') &&
    next.action === 'REFRESH_CREATIVE' &&
    next.priority === 'NORMAL'
  ) {
    next = { ...next, priority: 'HIGH' };
  }

  if (codes.has('POST_CLICK_PROBLEM') && next.action === 'REFRESH_CREATIVE') {
    next = {
      ...next,
      action: 'HOLD_AND_MONITOR',
      priority: 'HIGH',
      reason:
        `${next.reason} | Rule grounding: post-click/offer problem — hold creative, fix landing/response.`,
      overriddenAction: next.overriddenAction ?? 'REFRESH_CREATIVE',
    };
  }

  return next;
}
