// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/campaignSignals.ts
//
//  Builds a detector-compatible Signals object from a single campaign's
//  latest raw metrics for brain rule-grounding.
//
//  Pure. No DB. No Meta.
//
//  HONESTY CONTRACT (red-team):
//  A single DailyStat snapshot cannot observe period-over-period movement.
//  Comparing a campaign to the account baseline is a LEVEL comparison, not a
//  TREND. Emitting *Trend fields from that comparison previously caused:
//    - false AUCTION_PRESSURE (cpm vs avgCPM)
//    - false RISING_COST_PER_RESULT (fabricated spendTrend=0)
//    - false DECLINING_RESULTS / POST_CLICK_PROBLEM ("dropped 80%") on new
//      campaigns that were simply less efficient than account winners
//
//  Therefore every *Trend field is null here. Absolute current* levels still
//  drive LOW_CTR / HIGH_FREQUENCY detectors and their single-signal diagnoses.
//  True trends remain the job of AnalyticsEngine → RulesEngine (account path).
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { Signals } from './types';

/**
 * Absolute-level signals only. `baseline` is accepted for API symmetry with
 * callers that already have it, but is intentionally unused for trends.
 */
export function signalsFromCampaignRaw(
  raw: CampaignRawData,
  _baseline: AccountBaseline,
): Signals {
  return {
    ctrTrend: null,
    cpmTrend: null,
    frequencyTrend: null,
    resultsTrend: null,
    spendTrend: null,

    currentCtr: Number.isFinite(raw.ctr) ? raw.ctr : null,
    currentFrequency: Number.isFinite(raw.frequency) ? raw.frequency : null,
    currentCpm: Number.isFinite(raw.cpm) ? raw.cpm : null,
    currentResults: Number.isFinite(raw.messages) ? raw.messages : 0,
    currentSpend: Number.isFinite(raw.spend) ? raw.spend : 0,
  };
}
