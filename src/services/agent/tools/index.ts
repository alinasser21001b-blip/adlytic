// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/index.ts
//
//  Registry of all AI-agent tool handlers. Import order matters only for
//  the string ordering of the dispatcher's error-listing suggestion; not
//  for correctness.
//
//  As more tools land (T2, T3, T5-T11, T13-T15), append them here.
// ════════════════════════════════════════════════════════════════════════

import type { ToolHandler } from '../dispatcher';
import { listCampaignsHandler } from './listCampaigns';
import { getCampaignDetailsHandler } from './getCampaignDetails';
import { rankCampaignsHandler } from './rankCampaigns';
import { comparePeriodsHandler } from './comparePeriods';
import { detectAnomalyHandler } from './detectAnomaly';
import { getAudienceBreakdownHandler } from './getAudienceBreakdown';
import { lookupKnowledgeHandler } from './lookupKnowledge';
import { simulateBudgetShiftHandler } from './simulateBudgetShift';
import { checkSuspiciousActivityHandler } from './checkSuspiciousActivity';
import { getCreativePerformanceHandler } from './getCreativePerformance';
import { getHourlyPatternHandler } from './getHourlyPattern';
import { findSimilarCampaignsHandler } from './findSimilarCampaigns';
import { saveRecommendationHandler } from './saveRecommendation';

/** Build the full tool set. Called once per HTTP request by the dispatcher. */
export function buildAgentToolHandlers(): ToolHandler<unknown, unknown>[] {
  return [
    listCampaignsHandler(),
    getCampaignDetailsHandler(),
    rankCampaignsHandler(),
    comparePeriodsHandler(),
    detectAnomalyHandler(),
    getAudienceBreakdownHandler(),
    lookupKnowledgeHandler(),
    simulateBudgetShiftHandler(),
    checkSuspiciousActivityHandler(),
    getCreativePerformanceHandler(),
    getHourlyPatternHandler(),
    findSimilarCampaignsHandler(),
    saveRecommendationHandler(),
  ] as unknown as ToolHandler<unknown, unknown>[];
}
