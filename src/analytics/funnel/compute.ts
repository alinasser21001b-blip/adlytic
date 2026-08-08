// ════════════════════════════════════════════════════════════════════════
//  src/analytics/funnel/compute.ts — STAGE VALUES AND RATIOS
//
//  Deterministic arithmetic only. No LLM anywhere in this path (locked
//  condition 10): the model may later PHRASE a finding, but every number and
//  every decision here is reproducible from the inputs.
//
//  Sample gating is enforced HERE, in the analytics layer — a stage below its
//  floor carries INSUFFICIENT_DATA and no ratio, so no caller can quietly
//  render a confident ratio from 40 impressions (locked condition 5).
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../../lib/objectiveKpis';
import {
  funnelShapeFor,
  TERMINAL_MIN_EVENTS,
  APPROX_TERMINAL_MIN_EVENTS,
  type FunnelStageDef,
  type FunnelStageKey,
} from './definitions';

/** Window totals the funnel reads. Aggregated by the caller's repo query. */
export interface FunnelWindowTotals {
  impressions: number;
  /** max(daily reach) — NOT a sum; see the reach stage contract. */
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  messages: number;
  leads: number;
  purchases: number;
  clicks: number;
}

export type FunnelStageValue =
  | {
      status: 'OK';
      stageKey: FunnelStageKey;
      count: number;
      /** Ratio into this stage (count ÷ previous stage's count); null at entry. */
      ratioFromPrevious: number | null;
      approximate: boolean;
      /** 'estimated' propagates from reach's lower-bound semantics. */
      confidence: 'exact' | 'derived' | 'estimated';
    }
  | {
      status: 'UNAVAILABLE';
      stageKey: FunnelStageKey;
      reason: 'INSUFFICIENT_DATA' | 'UNKNOWN';
      /** The raw count still travels for display; the RATIO is what's gated. */
      count: number | null;
    };

export interface ComputedFunnel {
  family: ObjectiveKpiFamily;
  stages: FunnelStageValue[];
}

function readColumn(totals: FunnelWindowTotals, def: FunnelStageDef): number {
  const v = totals[def.sourceColumn as keyof FunnelWindowTotals];
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

/** The minimum PRIOR-window terminal events for a terminal ratio to be judged. */
export function terminalFloor(def: FunnelStageDef): number {
  return def.approximate ? APPROX_TERMINAL_MIN_EVENTS : TERMINAL_MIN_EVENTS;
}

/**
 * Compute one window's funnel: counts and stage-to-stage ratios, sample-gated.
 *
 * `family` null (unresolvable purpose) computes NOTHING — an unknown campaign
 * has no funnel shape, and picking one would be the guess rule 3 forbids.
 */
export function computeFunnel(
  family: ObjectiveKpiFamily | null | undefined,
  totals: FunnelWindowTotals,
): ComputedFunnel | null {
  if (!family) return null;
  const shape = funnelShapeFor(family);
  const stages: FunnelStageValue[] = [];

  let previousCount: number | null = null;
  let previousOk = true;

  for (const def of shape) {
    const count = readColumn(totals, def);
    const isEntry = previousCount === null;

    if (isEntry) {
      stages.push({
        status: 'OK',
        stageKey: def.stageKey,
        count,
        ratioFromPrevious: null,
        approximate: def.approximate,
        confidence: def.confidenceLevel,
      });
      previousCount = count;
      continue;
    }

    // Ratio gate: the DENOMINATOR (previous stage) must clear this stage's
    // floor, and the previous stage itself must have been computable.
    const denominator = previousCount ?? 0;
    if (!previousOk || denominator < def.minDenominatorForRatio || denominator <= 0) {
      stages.push({
        status: 'UNAVAILABLE',
        stageKey: def.stageKey,
        reason: 'INSUFFICIENT_DATA',
        count,
      });
      // Downstream ratios inherit the gap: their denominator chain is broken.
      previousCount = count;
      previousOk = false;
      continue;
    }

    stages.push({
      status: 'OK',
      stageKey: def.stageKey,
      count,
      ratioFromPrevious: +(count / denominator).toFixed(6),
      approximate: def.approximate,
      confidence: def.confidenceLevel,
    });
    previousCount = count;
    previousOk = true;
  }

  return { family, stages };
}
