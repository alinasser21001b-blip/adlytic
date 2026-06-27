// src/knowledge/types.ts
//
// Drop-in schema for Meta Ads metric knowledge. Claude (or any author) fills
// metaAdsKnowledgeBase.json or metaAdsKnowledgeBase.ts — the loader validates
// shape loosely and evaluation reads thresholds verbatim.

/** Whether a breach fires when the live value is above or below the threshold. */
export type ThresholdDirection = "above" | "below";

export interface OptimizationAction {
  id: string;
  title: string;
  description: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface MetricRecommendedActions {
  warning: OptimizationAction[];
  critical: OptimizationAction[];
}

export interface KnowledgeMetricDefinition {
  /** Live metric key — must match evaluateCampaign input (ctr, cpm, frequency, …). */
  key: string;
  label: string;
  unit?: string;
  description?: string;
  direction: ThresholdDirection;
  warning_threshold: number;
  critical_threshold: number;
  recommended_optimization_actions: MetricRecommendedActions;
}

export interface MetaAdsKnowledgeBase {
  version: string;
  platform: "meta_ads";
  updatedAt?: string;
  metrics: KnowledgeMetricDefinition[];
}

export type BreachSeverity = "warning" | "critical";

export interface MetricBreach {
  metricKey: string;
  metricLabel: string;
  value: number;
  severity: BreachSeverity;
  threshold: number;
  direction: ThresholdDirection;
  /** Copied verbatim from the KB entry for this severity — never rewritten. */
  recommended_optimization_actions: OptimizationAction[];
}

export interface CampaignMetrics {
  [metricKey: string]: number | null | undefined;
}

export interface EvaluateMetricContext {
  kb?: MetaAdsKnowledgeBase;
}

/** Empty KB — safe fallback when no drop-in file exists yet. */
export const EMPTY_KNOWLEDGE_BASE: MetaAdsKnowledgeBase = {
  version: "0",
  platform: "meta_ads",
  metrics: [],
};
