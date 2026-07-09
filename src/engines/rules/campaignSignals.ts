// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/campaignSignals.ts
//
//  Builds a detector-compatible Signals object from a single campaign's
//  latest raw metrics vs the account baseline. Used by the brain so
//  campaign decisions can be grounded in the same diagnose() patterns as
//  the account rules engine — without a separate campaign Analytics run.
//
//  Pure. No DB. No Meta.
//
//  These are baseline-relative proxies, NOT AnalyticsEngine period trends.
//  We only emit trend fields when absolute levels also look concerning, so
//  a merely "below-average" campaign does not look like a sudden collapse.
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { Signals } from './types';

function safeDelta(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline <= 0) return null;
  return (current - baseline) / baseline;
}

/**
 * Approximate signals for campaign-level diagnose/grounding.
 *
 * Emitted:
 * - current* absolutes (safe for LOW_CTR / HIGH_FREQUENCY)
 * - ctrTrend only if CTR is absolutely weak AND below baseline
 * - frequencyTrend only if frequency is absolutely elevated AND above baseline
 * - resultsTrend from cost-per-message efficiency vs baseline
 *
 * Omitted (would lie from a single snapshot / level comparison):
 * - cpmTrend → false AUCTION_PRESSURE
 * - spendTrend → false RISING_COST_PER_RESULT
 */
export function signalsFromCampaignRaw(
  raw: CampaignRawData,
  baseline: AccountBaseline,
): Signals {
  const currentCtr = Number.isFinite(raw.ctr) ? raw.ctr : null;
  const currentFrequency = Number.isFinite(raw.frequency) ? raw.frequency : null;

  // CTR trend proxy: only when the absolute CTR is already in "weak" territory.
  let ctrTrend: number | null = null;
  if (currentCtr != null && currentCtr < 1.0) {
    const delta = safeDelta(currentCtr, baseline.avgCTR);
    if (delta != null && delta < 0) ctrTrend = delta;
  }

  // Frequency trend proxy: only when absolute frequency is already elevated.
  let frequencyTrend: number | null = null;
  if (currentFrequency != null && currentFrequency > 3.5) {
    const delta = safeDelta(currentFrequency, baseline.avgFrequency);
    if (delta != null && delta > 0) frequencyTrend = delta;
  }

  let resultsTrend: number | null = null;
  if (raw.spend > 0 && baseline.avgCostPerMessage > 0 && Number.isFinite(raw.messages)) {
    const expectedMessages = raw.spend / baseline.avgCostPerMessage;
    if (expectedMessages > 0) {
      resultsTrend = (raw.messages - expectedMessages) / expectedMessages;
    }
  }

  return {
    ctrTrend,
    cpmTrend: null,
    frequencyTrend,
    resultsTrend,
    spendTrend: null,

    currentCtr,
    currentFrequency,
    currentCpm: Number.isFinite(raw.cpm) ? raw.cpm : null,
    currentResults: Number.isFinite(raw.messages) ? raw.messages : 0,
    currentSpend: Number.isFinite(raw.spend) ? raw.spend : 0,
  };
}
