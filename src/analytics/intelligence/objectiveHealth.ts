// ════════════════════════════════════════════════════════════════════════
//  src/analytics/intelligence/objectiveHealth.ts — OBJECTIVE-AWARE HEALTH
//
//  The existing HealthScoreEngine scores one fixed facet set (trend, CTR,
//  frequency, CPM) for every campaign. Two failures follow (locked P5.5):
//
//    · a messaging campaign is penalised for ROAS = 0, when ROAS is
//      NOT_APPLICABLE to it — a metric it can never earn points on
//    · a sales campaign scores WELL on healthy CTR while purchases collapse,
//      because its actual result never enters the score
//
//  This module scores what the campaign is actually TRYING to do. Metrics
//  that are NOT_APPLICABLE for the objective are excluded from the weighting
//  entirely — not scored zero, which would be a silent penalty for a metric
//  the campaign was never buying.
//
//  Deterministic. Consumes the reconciled intelligence rather than forming a
//  sixth independent opinion.
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../../lib/objectiveKpis';
import { resultFor } from '../resultSemantics';
import { isMetricApplicable } from '../metricDictionary';
import type { ReconciledIntelligence, FatigueSignal, Verdict } from './hierarchy';

export interface HealthFacetScore {
  key: string;
  /** 0–100, or null when NOT_APPLICABLE to this objective. */
  score: number | null;
  weight: number;
  applicable: boolean;
  evidence: string;
}

export interface ObjectiveHealthResult {
  /** 0–100 over APPLICABLE facets only, or null when nothing is scoreable. */
  score: number | null;
  band: 'excellent' | 'good' | 'attention' | 'critical' | 'unknown';
  family: ObjectiveKpiFamily | null;
  facets: HealthFacetScore[];
  /** Facets excluded because the metric does not apply to this objective. */
  excludedFacets: string[];
  confidence: Verdict;
  evidence: string[];
}

export interface ObjectiveHealthInput {
  family: ObjectiveKpiFamily | null;
  /** The campaign's OWN primary result count in the current window. */
  primaryResultCurrent: number | null;
  primaryResultPrior: number | null;
  ctr: number | null;
  ctrPrior: number | null;
  cpm: number | null;
  cpmPrior: number | null;
  /** Cost per the objective's own result, minor units. */
  costPerResultCurrent: number | null;
  costPerResultPrior: number | null;
  impressions: number;
  reconciled: ReconciledIntelligence;
  fatigue: FatigueSignal | null;
  /** True when the primary result is a proxy (engagement/app). Rule 8. */
  resultApproximate: boolean;
}

/** Weights per facet. Re-normalised over whatever is applicable. */
const BASE_WEIGHTS = {
  primaryResult: 40,   // the thing the campaign is buying — dominant by design
  funnelHealth: 25,    // where the deterministic diagnosis landed
  efficiency: 20,      // cost per that result
  delivery: 15,        // CTR / frequency / CPM as supporting context
} as const;

const rel = (cur: number | null, prior: number | null): number | null =>
  cur !== null && prior !== null && prior > 0 ? (cur - prior) / prior : null;

/** Map a relative change to 0–100. Flat = 60; +50% ≈ 95; −50% ≈ 10. */
function scoreFromChange(change: number | null, goodWhenUp = true): number | null {
  if (change === null) return null;
  const signed = goodWhenUp ? change : -change;
  const raw = 60 + signed * 70;
  return Math.max(0, Math.min(95, Math.round(raw)));
}

function bandFor(score: number | null): ObjectiveHealthResult['band'] {
  if (score === null) return 'unknown';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'attention';
  return 'critical';
}

/**
 * Score an entity's health against its OWN objective.
 *
 * Returns null (band 'unknown') rather than a number when the purpose is
 * unresolved or nothing is scoreable — an unknown campaign has no meaningful
 * health, and inventing 50/100 would be a fabricated fact.
 */
export function scoreObjectiveHealth(input: ObjectiveHealthInput): ObjectiveHealthResult {
  const { family, reconciled } = input;

  if (!family) {
    return {
      score: null, band: 'unknown', family: null, facets: [], excludedFacets: [],
      confidence: 'INSUFFICIENT_DATA',
      evidence: [],
    };
  }

  // HIERARCHY GUARD (P5.1): a downstream layer may not claim more than an
  // upstream one established. When reconciliation could not reach a verdict —
  // unsynced data, unresolved purpose, or a sample too thin for the funnel to
  // judge — there is no health to report.
  //
  // Without this, a brand-new account with 400 impressions scored 28/100
  // "critical" purely because 1 conversation followed 4: a confident-looking
  // condemnation of a merchant who has barely started spending. Withholding
  // the score is the honest answer, and the UI already renders that state.
  if (reconciled.confidence === 'INSUFFICIENT_DATA') {
    return {
      score: null, band: 'unknown', family, facets: [], excludedFacets: [],
      confidence: 'INSUFFICIENT_DATA', evidence: [],
    };
  }

  const def = resultFor(family);
  const facets: HealthFacetScore[] = [];
  const excluded: string[] = [];
  const evidence: string[] = [];

  // ── Facet 1: the objective's OWN primary result ────────────────────────
  const resultChange = rel(input.primaryResultCurrent, input.primaryResultPrior);
  const resultScore = scoreFromChange(resultChange, true);
  facets.push({
    key: 'primaryResult',
    score: resultScore,
    weight: BASE_WEIGHTS.primaryResult,
    applicable: true,
    evidence: resultChange === null
      ? `لا يوجد أساس للمقارنة في ${def.labelAr}`
      : `${def.labelAr}: ${(resultChange * 100).toFixed(1)}%`,
  });
  if (resultChange !== null && resultChange <= -0.2) {
    evidence.push(`${def.labelAr} انخفضت ${(Math.abs(resultChange) * 100).toFixed(1)}%`);
  }

  // ── Facet 2: funnel health from the reconciled diagnosis ───────────────
  const funnelScore =
    reconciled.problemClass === 'NO_MATERIAL_BREAK' ? 85
    : !reconciled.alert ? 60                       // a break, but not unusual
    : reconciled.problemClass === 'EFFICIENCY' ? 50
    : reconciled.confidence === 'HIGH' ? 25
    : 40;
  facets.push({
    key: 'funnelHealth',
    score: funnelScore,
    weight: BASE_WEIGHTS.funnelHealth,
    applicable: true,
    evidence: `التشخيص: ${reconciled.problemClass}${reconciled.alert ? ' (إنذار)' : ''}`,
  });

  // ── Facet 3: efficiency — cost per THIS objective's result ─────────────
  // Gated on applicability: ROAS/cost-per-purchase must not touch a messaging
  // campaign's score, and cost-per-conversation must not touch a sales one.
  const costMetricApplicable = isMetricApplicable(def.costMetricKey, family);
  const costChange = rel(input.costPerResultCurrent, input.costPerResultPrior);
  if (costMetricApplicable && costChange !== null) {
    const effScore = scoreFromChange(costChange, false);   // cost rising is bad
    facets.push({
      key: 'efficiency', score: effScore, weight: BASE_WEIGHTS.efficiency,
      applicable: true,
      evidence: `${def.costMetricKey}: ${(costChange * 100).toFixed(1)}%`,
    });
    if (costChange >= 0.2) evidence.push(`تكلفة ${def.labelAr} ارتفعت ${(costChange * 100).toFixed(1)}%`);
  } else {
    facets.push({
      key: 'efficiency', score: null, weight: BASE_WEIGHTS.efficiency,
      applicable: false,
      evidence: costMetricApplicable
        ? 'لا يوجد أساس للمقارنة'
        : `${def.costMetricKey} لا ينطبق على هذا الهدف`,
    });
    excluded.push(def.costMetricKey);
  }

  // ── Facet 4: delivery context (CTR, fatigue) ───────────────────────────
  // CTR is meaningless as a health signal for awareness campaigns, which buy
  // impressions rather than clicks.
  const ctrApplies = isMetricApplicable('ctr', family) && family !== 'awareness';
  if (ctrApplies) {
    const ctrChange = rel(input.ctr, input.ctrPrior);
    let deliveryScore = scoreFromChange(ctrChange, true) ?? 60;
    if (input.fatigue?.severity === 'CRITICAL') deliveryScore = Math.min(deliveryScore, 25);
    else if (input.fatigue?.severity === 'HIGH') deliveryScore = Math.min(deliveryScore, 40);
    facets.push({
      key: 'delivery', score: deliveryScore, weight: BASE_WEIGHTS.delivery,
      applicable: true,
      evidence: input.fatigue?.severity && input.fatigue.severity !== 'NONE'
        ? `إجهاد الجمهور: ${input.fatigue.severity}`
        : ctrChange === null ? 'CTR بلا أساس للمقارنة' : `CTR: ${(ctrChange * 100).toFixed(1)}%`,
    });
  } else {
    facets.push({
      key: 'delivery', score: null, weight: BASE_WEIGHTS.delivery,
      applicable: false,
      evidence: 'CTR لا ينطبق على حملات الوعي',
    });
    excluded.push('ctr');
  }

  // ── Compose over APPLICABLE facets only, re-normalising the weights ────
  const usable = facets.filter((f) => f.applicable && f.score !== null);
  if (usable.length === 0) {
    return {
      score: null, band: 'unknown', family, facets, excludedFacets: excluded,
      confidence: 'INSUFFICIENT_DATA', evidence: [],
    };
  }
  const totalWeight = usable.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    usable.reduce((sum, f) => sum + (f.score! * f.weight), 0) / totalWeight,
  );

  // Confidence inherits the reconciled verdict, and an approximate primary
  // result caps it — a proxy must never yield a confident health claim.
  let confidence: Verdict = reconciled.confidence;
  if (input.resultApproximate) confidence = 'LOW';

  return {
    score, band: bandFor(score), family, facets, excludedFacets: excluded,
    confidence, evidence,
  };
}
