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
import { resultCountForObjective } from '../../lib/objectiveKpis';
import type { Signals } from './types';
import type { IssueRecord } from '../../repositories/detectedIssuesRepo';

export interface AbsoluteMetricLevels {
  currentCtr: number | null;
  currentFrequency: number | null;
  currentCpm: number | null;
  currentResults: number;
  currentSpend: number;
  objective?: string | null;
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
    objective: levels.objective ?? null,
  };
}

/**
 * Campaign raw → absolute Signals for brain rule-grounding.
 * `baseline` is unused (API kept for call-site stability); trends are never
 * inferred from baseline levels.
 *
 * Results follow Meta objective (impressions for awareness, messages for
 * messaging, …) — never hard-code messages for every campaign.
 */
export function signalsFromCampaignRaw(
  raw: CampaignRawData,
  _baseline: AccountBaseline,
): Signals {
  const results = resultCountForObjective(raw.objective, {
    impressions: Number.isFinite(raw.impressions) ? raw.impressions : 0,
    reach: Number.isFinite(raw.reach) ? Number(raw.reach) : 0,
    clicks: Number.isFinite(raw.clicks) ? raw.clicks : 0,
    messages: Number.isFinite(raw.messages) ? raw.messages : 0,
    purchases: Number.isFinite(raw.purchases) ? Number(raw.purchases) : 0,
    leads: Number.isFinite(raw.leads) ? Number(raw.leads) : 0,
  });
  return absoluteLevelSignals({
    currentCtr: Number.isFinite(raw.ctr) ? raw.ctr : null,
    currentFrequency: Number.isFinite(raw.frequency) ? raw.frequency : null,
    currentCpm: Number.isFinite(raw.cpm) ? raw.cpm : null,
    currentResults: results,
    currentSpend: Number.isFinite(raw.spend) ? raw.spend : 0,
    objective: raw.objective ?? null,
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
