// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/campaignSignals.ts
//
//  Absolute-level Signals for consumers that only have a snapshot (brain
//  grounding, ad assessor). A single snapshot cannot observe period trends —
//  every *Trend field is null. True trends come from AnalyticsEngine.
//
//  Pure. No DB. No Meta.
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { Signals } from './types';
import type { IssueRecord } from '../../repositories/detectedIssuesRepo';

export interface AbsoluteMetricLevels {
  currentCtr: number | null;
  currentFrequency: number | null;
  currentCpm: number | null;
  currentResults: number;
  currentSpend: number;
}

/** Issue codes that require period-over-period trends to diagnose honestly. */
const TREND_DEPENDENT_ISSUE_CODES = new Set([
  'AUDIENCE_FATIGUE',
  'DECLINING_RESULTS',
  'RISING_COST_PER_RESULT',
]);

/** Build absolute-only Signals (all *Trend = null). */
export function absoluteLevelSignals(levels: AbsoluteMetricLevels): Signals {
  return {
    ctrTrend: null,
    cpmTrend: null,
    frequencyTrend: null,
    resultsTrend: null,
    spendTrend: null,
    currentCtr: levels.currentCtr,
    currentFrequency: levels.currentFrequency,
    currentCpm: levels.currentCpm,
    currentResults: levels.currentResults,
    currentSpend: levels.currentSpend,
  };
}

/**
 * Campaign raw → absolute Signals for brain rule-grounding.
 * `baseline` is unused (API kept for call-site stability); trends are never
 * inferred from baseline levels.
 */
export function signalsFromCampaignRaw(
  raw: CampaignRawData,
  _baseline: AccountBaseline,
): Signals {
  return absoluteLevelSignals({
    currentCtr: Number.isFinite(raw.ctr) ? raw.ctr : null,
    currentFrequency: Number.isFinite(raw.frequency) ? raw.frequency : null,
    currentCpm: Number.isFinite(raw.cpm) ? raw.cpm : null,
    currentResults: Number.isFinite(raw.messages) ? raw.messages : 0,
    currentSpend: Number.isFinite(raw.spend) ? raw.spend : 0,
  });
}

/**
 * Drop trend-dependent stored issues when Signals have no trends.
 * Prevents diagnose() from narrating "انخفضت ؟%" against absolute-only inputs
 * (ad assessor mixing account issues with campaign snapshot metrics).
 */
export function issuesCompatibleWithSignals(
  issues: IssueRecord[],
  signals: Signals,
): IssueRecord[] {
  const hasTrend =
    signals.ctrTrend != null ||
    signals.cpmTrend != null ||
    signals.frequencyTrend != null ||
    signals.resultsTrend != null ||
    signals.spendTrend != null;
  if (hasTrend) return issues;
  return issues.filter((i) => !TREND_DEPENDENT_ISSUE_CODES.has(String(i.issueCode)));
}
