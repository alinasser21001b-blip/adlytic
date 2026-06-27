// src/knowledge/evaluate.ts — threshold comparison against live metrics.

import { loadKnowledgeBase } from "./loadKnowledgeBase";
import type {
  BreachSeverity,
  CampaignMetrics,
  EvaluateMetricContext,
  KnowledgeMetricDefinition,
  MetaAdsKnowledgeBase,
  MetricBreach,
  OptimizationAction,
} from "./types";

function breachSeverity(
  value: number,
  def: KnowledgeMetricDefinition,
): BreachSeverity | null {
  const { direction, warning_threshold, critical_threshold } = def;

  if (direction === "below") {
    if (value <= critical_threshold) return "critical";
    if (value <= warning_threshold) return "warning";
    return null;
  }

  // above — higher is worse
  if (value >= critical_threshold) return "critical";
  if (value >= warning_threshold) return "warning";
  return null;
}

function actionsForSeverity(
  def: KnowledgeMetricDefinition,
  severity: BreachSeverity,
): OptimizationAction[] {
  const bucket =
    severity === "critical"
      ? def.recommended_optimization_actions.critical
      : def.recommended_optimization_actions.warning;
  // Verbatim copy — downstream must not mutate.
  return bucket.map(a => ({ ...a }));
}

export function evaluateMetric(
  metricKey: string,
  value: number | null | undefined,
  context?: EvaluateMetricContext,
): MetricBreach | null {
  if (value == null || !Number.isFinite(value)) return null;

  const kb = context?.kb ?? loadKnowledgeBase();
  const def = kb.metrics.find(m => m.key === metricKey);
  if (!def) return null;

  const severity = breachSeverity(value, def);
  if (!severity) return null;

  return {
    metricKey,
    metricLabel: def.label,
    value,
    severity,
    threshold: severity === "critical" ? def.critical_threshold : def.warning_threshold,
    direction: def.direction,
    recommended_optimization_actions: actionsForSeverity(def, severity),
  };
}

export function evaluateCampaign(
  metrics: CampaignMetrics,
  context?: EvaluateMetricContext,
): MetricBreach[] {
  const kb = context?.kb ?? loadKnowledgeBase();
  const breaches: MetricBreach[] = [];

  for (const def of kb.metrics) {
    const breach = evaluateMetric(def.key, metrics[def.key], { kb });
    if (breach) breaches.push(breach);
  }

  return breaches.sort((a, b) => {
    const sev = (s: BreachSeverity) => (s === "critical" ? 1 : 0);
    if (sev(a.severity) !== sev(b.severity)) return sev(b.severity) - sev(a.severity);
    return a.metricKey.localeCompare(b.metricKey);
  });
}

/** Flatten actions from breaches; critical actions first; dedupe by id. */
export function findActionsForBreaches(breaches: MetricBreach[]): OptimizationAction[] {
  const seen = new Set<string>();
  const out: OptimizationAction[] = [];

  const sorted = [...breaches].sort((a, b) => {
    const sev = (s: BreachSeverity) => (s === "critical" ? 1 : 0);
    return sev(b.severity) - sev(a.severity);
  });

  for (const breach of sorted) {
    for (const action of breach.recommended_optimization_actions) {
      if (seen.has(action.id)) continue;
      seen.add(action.id);
      out.push({ ...action });
    }
  }

  return out;
}

/** Human-readable strings for dashboard issues.recommendations (verbatim titles). */
export function formatActionsForDisplay(actions: OptimizationAction[]): string[] {
  return actions.map(a =>
    a.description ? `${a.title}: ${a.description}` : a.title,
  );
}

export function getMetricDefinition(
  metricKey: string,
  kb?: MetaAdsKnowledgeBase,
): KnowledgeMetricDefinition | undefined {
  return (kb ?? loadKnowledgeBase()).metrics.find(m => m.key === metricKey);
}
