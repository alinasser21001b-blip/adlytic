// ════════════════════════════════════════════════════════════════════════
//  src/engines/health/facets.ts
//
//  Health score is explanation, not truth.
//
//  Each facet maps ONE signal to a 0–100 score. The facet doesn't know its
//  weight or how it composes with other facets — that lives in the
//  orchestrator. This separation is what makes the score legible: the
//  facet says "CTR scored 70 because it's 1.5%", the orchestrator says
//  "and that contributed 17.5 points to the total because CTR weight is 25%."
//
//  All thresholds carry `because:` comments. None of them are measured
//  against Iraqi accounts yet. The default scores are intentionally
//  modest — there is no "100/100" for any facet, because perfection is
//  not a thing the dashboard should claim.
// ════════════════════════════════════════════════════════════════════════

// (no @prisma/client imports needed — facets are pure number-in, number-out)

export interface FacetResult {
  /** 0–100. Higher = healthier. */
  score: number;
  /** What we measured + the thresholds used. The dashboard renders this
   *  so users can see "CTR scored 70 because CTR is 1.5% vs floor 1.0%". */
  evidence: Record<string, unknown>;
}

// ── CTR facet ────────────────────────────────────────────────────────────
/**
 * Maps current-period CTR to 0–100.
 *
 * because:
 *   CTR is the most direct measure of whether creative is working. We use a
 *   linear ramp from 0 (CTR ≤ 0.5%) to 95 (CTR ≥ 3.0%). The 0.5% floor and
 *   3.0% ceiling come from Meta's published messaging-objective benchmarks;
 *   the ceiling is 95 (not 100) because a single excellent metric should
 *   not be allowed to claim perfection.
 */
export function scoreCtr(currentCtr: number | null): FacetResult {
  if (currentCtr == null) return { score: 50, evidence: { ctr: null, note: "no data → neutral default" } };
  const floor = 0.5, ceil = 3.0;
  const clamped = Math.max(floor, Math.min(ceil, currentCtr));
  const score = Math.round(((clamped - floor) / (ceil - floor)) * 95);
  return { score, evidence: { ctr: currentCtr, floor, ceil } };
}

// ── Frequency facet ──────────────────────────────────────────────────────
/**
 * Maps current-period frequency to 0–100.
 *
 * because:
 *   Frequency below ~2.5 is healthy (audience has seen ads but isn't
 *   saturated). Above 5.0 is Meta's fatigue threshold. Between those we
 *   ramp DOWN — higher frequency means worse facet score. Below the ideal
 *   we also penalize slightly because frequency near 1.0 often means an
 *   audience too broad to convert.
 */
export function scoreFrequency(freq: number | null): FacetResult {
  if (freq == null) return { score: 50, evidence: { frequency: null, note: "no data → neutral default" } };
  // Curve: f=1.0 → 70, f=2.5 → 95, f=5.0 → 50, f=7.0 → 10
  let score: number;
  if (freq <= 2.5) {
    // Below ideal: linear from 70 (at f=1) to 95 (at f=2.5)
    score = 70 + ((freq - 1.0) / (2.5 - 1.0)) * 25;
  } else if (freq <= 5.0) {
    // Ideal to threshold: linear from 95 (at f=2.5) to 50 (at f=5)
    score = 95 - ((freq - 2.5) / (5.0 - 2.5)) * 45;
  } else {
    // Above threshold: linear from 50 (at f=5) to 10 (at f=7), floor 10
    score = Math.max(10, 50 - ((freq - 5.0) / 2.0) * 40);
  }
  return { score: Math.round(Math.max(0, Math.min(95, score))), evidence: { frequency: freq, idealMin: 2.5, threshold: 5.0 } };
}

// ── CPM facet ────────────────────────────────────────────────────────────
/**
 * Maps current-period CPM trend (period-over-period) to 0–100.
 *
 * because:
 *   Absolute CPM is meaningless without a market baseline — what's
 *   "expensive" varies wildly by country, vertical, audience size. So we
 *   score CPM by *movement*, not level. Stable CPM scores well; rising CPM
 *   scores poorly; falling CPM scores best (but capped at 90 because
 *   falling CPM can also mean delivery problems).
 */
export function scoreCpm(cpmTrend: number | null): FacetResult {
  if (cpmTrend == null) return { score: 50, evidence: { cpmTrend: null, note: "no data → neutral default" } };
  let score: number;
  if (cpmTrend <= -0.20) score = 70;       // big drop: could be good, could be delivery issue → middling
  else if (cpmTrend <= -0.05) score = 90;  // gentle drop: ideal
  else if (cpmTrend <= 0.05) score = 85;   // stable: healthy
  else if (cpmTrend <= 0.20) score = 55;   // rising: concerning
  else if (cpmTrend <= 0.40) score = 30;   // sharp rise: bad
  else score = 15;                          // runaway: very bad
  return { score, evidence: { cpmTrend } };
}

// ── Trend facet ──────────────────────────────────────────────────────────
/**
 * Maps overall trend signal to 0–100. This is the only facet that combines
 * multiple inputs, because "trend" is inherently composite.
 *
 * because:
 *   Business owners notice declining results within days but tolerate CPM
 *   swings for weeks, so we weight results trend 2× CTR trend and 3× CPM.
 *   The composite trend is the bottom-line direction of the campaign;
 *   it deserves to be a separate facet from level metrics.
 */
export function scoreTrend(args: {
  resultsTrend: number | null;
  ctrTrend: number | null;
  cpmTrend: number | null;
}): FacetResult {
  // because: business owners care most about results moving. CTR second
  // (early signal). CPM last (lagging, noisy).
  const components: Array<{ key: string; trend: number | null; weight: number }> = [
    { key: "resultsTrend", trend: args.resultsTrend, weight: 3 },
    { key: "ctrTrend", trend: args.ctrTrend, weight: 2 },
    { key: "cpmTrend", trend: args.cpmTrend, weight: 1 },
  ];
  // CPM is "good when down" — invert for scoring symmetry
  const effective = components.map(c =>
    c.key === "cpmTrend" && c.trend != null ? { ...c, trend: -c.trend } : c
  );

  let weightedSum = 0, totalWeight = 0;
  for (const c of effective) {
    if (c.trend == null) continue;
    // Map trend → facet score: -0.30 → 30, 0 → 80, +0.20 → 95.
    // (Asymmetric: rising is GOOD here because we inverted CPM.)
    const t = c.trend;
    let s: number;
    if (t >= 0.10) s = 95;
    else if (t >= 0) s = 80 + (t / 0.10) * 15;
    else if (t >= -0.10) s = 60 + ((t + 0.10) / 0.10) * 20;
    else if (t >= -0.25) s = 40 + ((t + 0.25) / 0.15) * 20;
    else if (t >= -0.50) s = 15 + ((t + 0.50) / 0.25) * 25;
    else s = 5;
    weightedSum += s * c.weight;
    totalWeight += c.weight;
  }

  const score = totalWeight === 0
    ? 50  // no signal — neutral, not 0
    : Math.round(weightedSum / totalWeight);

  return {
    score,
    evidence: {
      resultsTrend: args.resultsTrend,
      ctrTrend: args.ctrTrend,
      cpmTrend: args.cpmTrend,
      weights: { results: 3, ctr: 2, cpm: 1 },
    },
  };
}

// ── Recommendation facet ─────────────────────────────────────────────────
// RETIRED in v2 of HealthScoreEngine.
// In v1, this facet mapped a recommendation priority to a 0–100 score so the
// system's own verdict influenced the total. The reviewer correctly pointed
// out this was DOUBLE-COUNTING: the recommendation was already derived from
// the same metrics other facets measure (CTR, frequency, trends). Penalizing
// for the metric AND for the conclusion drawn from it unfairly compressed
// scores on bad accounts.
//
// Keeping the comment as a forensic record. The function itself has been
// removed. Git history preserves the v1 implementation if we ever need it.
//
// Cross-reference: HEALTH_ALGORITHM_VERSION bump from 1 → 2 in HealthScoreEngine.ts.
