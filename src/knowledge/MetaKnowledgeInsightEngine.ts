// src/knowledge/MetaKnowledgeInsightEngine.ts
//
// AI Insight hook: query the Meta Ads KB FIRST, then fall back to legacy
// recommendation text. Used by AdlyticIntelligenceSystem and getDashboard.

import {
  evaluateCampaign,
  findActionsForBreaches,
  formatActionsForDisplay,
} from "./evaluate";
import { loadKnowledgeBase } from "./loadKnowledgeBase";
import type { CampaignMetrics, MetricBreach, OptimizationAction } from "./types";

export interface KnowledgeInsightRecommendation {
  entityId: string;
  actionCode: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  strength: number;
  text: string;
  /** Verbatim KB actions attached to this recommendation. */
  recommended_optimization_actions: OptimizationAction[];
  metricBreaches: MetricBreach[];
}

const SEVERITY_STRENGTH: Record<string, number> = {
  warning: 0.55,
  critical: 0.85,
};

const SEVERITY_PRIORITY: Record<string, KnowledgeInsightRecommendation["priority"]> = {
  warning: "HIGH",
  critical: "CRITICAL",
};

export class MetaKnowledgeInsightEngine {
  /** Evaluate live metrics against KB thresholds. */
  evaluateMetrics(metrics: CampaignMetrics): MetricBreach[] {
    return evaluateCampaign(metrics);
  }

  /**
   * Derive recommendations from KB breaches. Returns [] when KB is empty or
   * no thresholds are breached — callers should fall back to legacy logic.
   */
  deriveRecommendations(
    metrics: CampaignMetrics,
    entityId: string,
  ): KnowledgeInsightRecommendation[] {
    const breaches = this.evaluateMetrics(metrics);
    if (breaches.length === 0) return [];

    const actions = findActionsForBreaches(breaches);
    if (actions.length === 0) return [];

    const topSeverity = breaches[0]!.severity;
    const topBreach = breaches[0]!;
    const primary = topBreach.recommended_optimization_actions[0] ?? actions[0]!;

    return [{
      entityId,
      actionCode: primary.id,
      priority: SEVERITY_PRIORITY[topSeverity] ?? "HIGH",
      strength: SEVERITY_STRENGTH[topSeverity] ?? 0.6,
      text: primary.description
        ? `${primary.title}: ${primary.description}`
        : primary.title,
      recommended_optimization_actions: actions.map(a => ({ ...a })),
      metricBreaches: breaches.map(b => ({
        ...b,
        recommended_optimization_actions: b.recommended_optimization_actions.map(a => ({ ...a })),
      })),
    }];
  }

  /** Display strings for dashboard issues.recommendations — verbatim from KB. */
  recommendationsForDashboard(metrics: CampaignMetrics): string[] {
    const breaches = this.evaluateMetrics(metrics);
    const actions = findActionsForBreaches(breaches);
    return formatActionsForDisplay(actions);
  }

  isLoaded(): boolean {
    return loadKnowledgeBase().metrics.length > 0;
  }
}

/** Singleton for pipeline use — stateless aside from cached KB load. */
export const metaKnowledgeInsightEngine = new MetaKnowledgeInsightEngine();
