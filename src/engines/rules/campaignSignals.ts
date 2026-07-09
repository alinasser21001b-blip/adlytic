// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/campaignSignals.ts
//
//  Builds a detector-compatible Signals object from a single campaign's
//  latest raw metrics vs the account baseline. Used by the brain so
//  campaign decisions can be grounded in the same diagnose() patterns as
//  the account rules engine — without a separate campaign Analytics run.
//
//  Pure. No DB. No Meta.
// ════════════════════════════════════════════════════════════════════════

import type { AccountBaseline, CampaignRawData } from '../../engine/BaselineCalculator';
import type { Signals } from './types';

function safeDelta(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline <= 0) return null;
  return (current - baseline) / baseline;
}

/**
 * Approximate period-over-period trends using account baseline as the
 * "previous period" proxy. Weaker than AnalyticsEngine trends, but available
 * per-campaign at brain-tick time and enough to fire diagnose() patterns.
 */
export function signalsFromCampaignRaw(
  raw: CampaignRawData,
  baseline: AccountBaseline,
): Signals {
  // Results vs what baseline cost-per-message implies for this spend.
  let resultsTrend: number | null = null;
  if (raw.spend > 0 && baseline.avgCostPerMessage > 0 && Number.isFinite(raw.messages)) {
    const expectedMessages = raw.spend / baseline.avgCostPerMessage;
    if (expectedMessages > 0) {
      resultsTrend = (raw.messages - expectedMessages) / expectedMessages;
    }
  }

  // Treat spend as flat at the campaign snapshot so rising cost-per-result
  // fires when results underperform the baseline expectation (unit economics).
  const spendTrend: number | null = resultsTrend != null ? 0 : null;

  return {
    ctrTrend: safeDelta(raw.ctr, baseline.avgCTR),
    cpmTrend: safeDelta(raw.cpm, baseline.avgCPM),
    frequencyTrend: safeDelta(raw.frequency, baseline.avgFrequency),
    resultsTrend,
    spendTrend,

    currentCtr: Number.isFinite(raw.ctr) ? raw.ctr : null,
    currentFrequency: Number.isFinite(raw.frequency) ? raw.frequency : null,
    currentCpm: Number.isFinite(raw.cpm) ? raw.cpm : null,
    currentResults: Number.isFinite(raw.messages) ? raw.messages : 0,
    // Detectors only need magnitude; keep major units (brain already uses major).
    currentSpend: Number.isFinite(raw.spend) ? raw.spend : 0,
  };
}
