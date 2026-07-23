// src/knowledge/index.ts — public API for Meta Ads knowledge base.

export type {
  BenchmarkAssessment,
  BreachSeverity,
  CampaignMetrics,
  EvaluateMetricContext,
  KnowledgeMetricDefinition,
  MetaAdsKnowledgeBase,
  MetricBreach,
  OptimizationAction,
  ThresholdDirection,
} from "./types";
export { EMPTY_KNOWLEDGE_BASE } from "./types";

export {
  loadKnowledgeBase,
  resetKnowledgeBaseCache,
  setKnowledgeBaseForTests,
} from "./loadKnowledgeBase";

export {
  evaluateMetric,
  evaluateCampaign,
  findActionsForBreaches,
  formatActionsForDisplay,
  getMetricDefinition,
} from "./evaluate";

export {
  evaluateBenchmarks,
  resetBenchmarkCache,
  type BenchmarkEvaluationOptions,
} from "./benchmarkIntelligence";

export {
  resolveBenchmarkIndustry,
  resolveBenchmarkIndustryFromContext,
  resolveBenchmarkIndustryFromProfile,
  toBenchmarkEvaluationOptions,
  type IndustryProfileLike,
  type IndustryResolutionSource,
  type IndustryRoutingContext,
  type ResolvedBenchmarkIndustry,
} from "./industryRouting";

export {
  MetaKnowledgeInsightEngine,
  metaKnowledgeInsightEngine,
  type KnowledgeInsightRecommendation,
} from "./MetaKnowledgeInsightEngine";

export {
  arabicEfficiencyPhrase,
  arabicObjectiveCoachingBlock,
  arabicResultPhrase,
  filterMetricsForObjective,
  getMetaObjectiveStandard,
  kbMetricKeysForObjective,
  lowCtrFloorForObjective,
  type MetaObjectiveStandard,
} from "./metaObjectiveStandards";

import { loadKnowledgeBase as _loadKnowledgeBase } from "./loadKnowledgeBase";

/** Convenience alias matching spec naming. */
export function getKnowledgeBase() {
  return _loadKnowledgeBase();
}
