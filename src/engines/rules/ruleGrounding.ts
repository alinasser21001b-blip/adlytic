// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/ruleGrounding.ts
//
//  Pure bridge between detectors/diagnose and the V6 brain.
//  Prefers real period Signals when provided; falls back to absolute-only
//  snapshot signals (no fabricated trends).
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { CampaignDecision } from '../../engine/DecisionEngine';
import { signalsFromCampaignRaw } from './campaignSignals';
import { runDetectorPipeline } from './runDetectorPipeline';
import type { Signals } from './types';

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
  /** Whether grounding used real period trends (vs absolute snapshot). */
  evidenceSource: 'period_trends' | 'absolute_levels';
}

export function buildRuleGrounding(
  raw: CampaignRawData,
  baseline: AccountBaseline,
  periodSignals?: Signals | null,
): RuleGrounding {
  const evidenceSource: RuleGrounding['evidenceSource'] =
    periodSignals != null ? 'period_trends' : 'absolute_levels';
  const signals = periodSignals ?? signalsFromCampaignRaw(raw, baseline);
  const { issues, diagnoses } = runDetectorPipeline(signals);

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
    evidenceSource,
  };
}

/**
 * Soft fusion: adjust a brain decision when rule diagnoses agree/disagree
 * with the physics/pattern verdict.
 *
 * Guardrails:
 * - Never invents EMERGENCY_PAUSE.
 * - Never upgrades KEEP_COLLECTING.
 * - WEAK_CREATIVE alone does NOT upgrade HOLD (awareness/brand false positives).
 *   Only multi-signal CREATIVE_FATIGUE upgrades creative refresh.
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

  // Multi-signal creative fatigue only — not bare LOW_CTR / WEAK_CREATIVE.
  if (codes.has('CREATIVE_FATIGUE') && next.action === 'HOLD_AND_MONITOR') {
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
