// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/ruleGrounding.ts
//
//  Pure bridge between account-style detectors/diagnose and the V6 brain.
//  Produces a compact grounding object that DecisionEngine + ClaudeCMO can
//  consume without importing Prisma or touching the DB.
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { CampaignDecision } from '../../engine/DecisionEngine';
import { diagnose } from './diagnose';
import { signalsFromCampaignRaw } from './campaignSignals';
import { ALL_DETECTORS } from './detectors';
import type { IssueRecord } from '../../repositories/detectedIssuesRepo';

export interface RuleGrounding {
  issues: Array<{ code: string; severity: string }>;
  diagnoses: Array<{
    code: string;
    name: string;
    confidence: number;
    narrative: string;
    action: string;
  }>;
  /** Top diagnosis code, if any — convenient for DecisionEngine switches. */
  primaryCode: string | null;
}

export function buildRuleGrounding(
  raw: CampaignRawData,
  baseline: AccountBaseline,
): RuleGrounding {
  const signals = signalsFromCampaignRaw(raw, baseline);
  const issues: IssueRecord[] = [];
  for (const detect of ALL_DETECTORS) {
    const issue = detect(signals);
    if (issue) issues.push(issue);
  }
  const diagnoses = diagnose(issues, signals);

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
 * Soft fusion: adjust a brain decision when rule diagnoses strongly agree
 * or disagree with the physics/pattern verdict.
 *
 * Guardrails:
 * - Never invents EMERGENCY_PAUSE (orchestrator/V2 only).
 * - Never upgrades KEEP_COLLECTING — cold-start must finish collecting.
 * - Never silently downgrades CRITICAL pauses without a clear alternate cause.
 */
export function applyRuleGroundingToDecision(
  decision: CampaignDecision,
  grounding: RuleGrounding | null | undefined,
): CampaignDecision {
  if (!grounding || grounding.diagnoses.length === 0) return decision;

  const codes = new Set(grounding.diagnoses.map((d) => d.code));
  const primary = grounding.primaryCode;

  // Landing/offer problem: creative refresh is the wrong lever.
  if (
    codes.has('POST_CLICK_PROBLEM') &&
    decision.action === 'REFRESH_CREATIVE'
  ) {
    return {
      ...decision,
      action: 'HOLD_AND_MONITOR',
      priority: 'HIGH',
      reason:
        `${decision.reason} | Rule grounding: post-click/offer problem — hold creative, fix landing/response.`,
      overriddenAction: decision.action,
    };
  }

  // Creative fatigue / weak creative: upgrade passive HOLD into refresh.
  // KEEP_COLLECTING is intentionally excluded — interrupting cold-start with
  // a refresh recommendation invents confidence the sample does not have.
  if (
    (codes.has('CREATIVE_FATIGUE') || codes.has('WEAK_CREATIVE')) &&
    decision.action === 'HOLD_AND_MONITOR'
  ) {
    return {
      ...decision,
      action: 'REFRESH_CREATIVE',
      priority: 'HIGH',
      reason:
        `${decision.reason} | Rule grounding: ${primary} — creative refresh is the primary lever.`,
      overriddenAction: decision.action,
    };
  }

  // Auction pressure: prefer hold over pause when physics wanted to kill on
  // noise AND we have no creative-fatigue diagnosis. Only applies when the
  // auction diagnosis itself is present (requires issue corroboration now).
  if (
    codes.has('AUCTION_PRESSURE') &&
    decision.action === 'PAUSE_CAMPAIGN' &&
    !codes.has('CREATIVE_FATIGUE') &&
    !codes.has('WEAK_CREATIVE')
  ) {
    return {
      ...decision,
      action: 'HOLD_AND_MONITOR',
      priority: 'HIGH',
      reason:
        `${decision.reason} | Rule grounding: auction pressure — creative may be fine; market is expensive.`,
      overriddenAction: decision.action,
    };
  }

  // Audience saturation: reinforce expand messaging when already refreshing.
  if (codes.has('AUDIENCE_SATURATION') && decision.action === 'REFRESH_CREATIVE') {
    return {
      ...decision,
      reason:
        `${decision.reason} | Rule grounding: audience saturation — refresh creative and consider expanding audience.`,
    };
  }

  // Align dying creative pattern with fatigue diagnosis — bump priority.
  if (
    codes.has('CREATIVE_FATIGUE') &&
    decision.action === 'REFRESH_CREATIVE' &&
    decision.priority === 'NORMAL'
  ) {
    return { ...decision, priority: 'HIGH' };
  }

  return decision;
}
