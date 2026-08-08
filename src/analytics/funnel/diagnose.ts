// ════════════════════════════════════════════════════════════════════════
//  src/analytics/funnel/diagnose.ts — EARLIEST BREAK, DETERMINISTIC CLASS
//
//  The diagnostic core of P3. Walks the objective-specific funnel from the
//  top and names the EARLIEST materially degraded ratio — never the largest
//  downstream decline, because an upstream break mechanically depresses
//  everything below it, and ranking by magnitude would systematically blame
//  the terminal stage for a creative or delivery failure.
//
//  ── Material degradation (locked condition 6) ──────────────────────────
//  A change is material only when ALL of:
//    · both windows clear the stage's sample floor          (sample size)
//    · a prior baseline exists (prior ratio > 0)            (baseline)
//    · relative drop ≥ a floor that GROWS as samples shrink (relative)
//    · absolute drop ≥ a minimum ratio delta                (absolute)
//    · terminal stages: enough prior events to judge at all
//  A tiny change never becomes a diagnosis just because it crossed an
//  arbitrary percentage; at small samples the required drop scales up.
//
//  ── Silence is valid (locked condition 8) ──────────────────────────────
//  No material break → NO_MATERIAL_BREAK, degradedStage null, no evidence
//  invented. The system is comfortable saying "nothing significant".
//
//  Deterministic throughout. No LLM computes, chooses, or phrases anything
//  here — every string below is a template filled with measured numbers.
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../../lib/objectiveKpis';
import {
  funnelShapeFor,
  type FunnelStageDef,
  type FunnelStageKey,
  type ProblemClass,
} from './definitions';
import {
  computeFunnel,
  terminalFloor,
  type ComputedFunnel,
  type FunnelWindowTotals,
} from './compute';

// ── Material-degradation policy ─────────────────────────────────────────

/** Base relative drop below which a change is never material. */
export const BASE_MATERIAL_DROP = 0.15;
/**
 * Small-sample scaling: required relative drop = max(BASE, K ÷ √min(n)).
 * At n=1,000 → 0.15 (base holds); n=100 → 0.40; n=25 → 0.80. Deterministic
 * and deliberately conservative — this is a noise guard, not a significance
 * test, and it claims nothing more.
 */
export const SMALL_SAMPLE_K = 4;
/** Absolute ratio-delta floor: microscopic ratios can't trigger on noise. */
export const MIN_ABSOLUTE_RATIO_DROP = 0.001;

export interface MaterialityInput {
  currentRatio: number | null;
  priorRatio: number | null;
  /** Denominator counts behind each ratio (the previous stage's count). */
  currentDenominator: number;
  priorDenominator: number;
  /** Sample floor for this stage's ratio (from its definition). */
  minDenominator: number;
}

export interface MaterialityVerdict {
  judgeable: boolean;                 // false → INSUFFICIENT_DATA, no opinion
  material: boolean;
  relativeChange: number | null;      // negative = degradation
  requiredDrop: number | null;
  reason:
    | 'OK'
    | 'NO_BASELINE'
    | 'SAMPLE_TOO_SMALL'
    | 'BELOW_RELATIVE_FLOOR'
    | 'BELOW_ABSOLUTE_FLOOR';
}

/** The explicit material-degradation decision. Pure; exported for tests. */
export function judgeMateriality(input: MaterialityInput): MaterialityVerdict {
  const { currentRatio, priorRatio, currentDenominator, priorDenominator, minDenominator } = input;

  if (currentRatio === null || priorRatio === null || priorRatio <= 0) {
    return { judgeable: false, material: false, relativeChange: null, requiredDrop: null, reason: 'NO_BASELINE' };
  }
  if (currentDenominator < minDenominator || priorDenominator < minDenominator) {
    return { judgeable: false, material: false, relativeChange: null, requiredDrop: null, reason: 'SAMPLE_TOO_SMALL' };
  }

  const relativeChange = (currentRatio - priorRatio) / priorRatio;
  const smallestSample = Math.max(1, Math.min(currentDenominator, priorDenominator));
  const requiredDrop = Math.max(BASE_MATERIAL_DROP, SMALL_SAMPLE_K / Math.sqrt(smallestSample));

  if (relativeChange > -requiredDrop) {
    return { judgeable: true, material: false, relativeChange, requiredDrop, reason: 'BELOW_RELATIVE_FLOOR' };
  }
  if (priorRatio - currentRatio < MIN_ABSOLUTE_RATIO_DROP) {
    return { judgeable: true, material: false, relativeChange, requiredDrop, reason: 'BELOW_ABSOLUTE_FLOOR' };
  }
  return { judgeable: true, material: true, relativeChange, requiredDrop, reason: 'OK' };
}

// ── Supporting signals (locked condition 3 — NOT funnel stages) ─────────

/**
 * Diagnostic context that informs the verdict without being a funnel link.
 * "Impressions flat while spend rises" is a delivery/efficiency signal, not a
 * ratio in the chain — keeping it here keeps the chain honest.
 */
export interface SupportingSignals {
  spendCurrentMinor: number;
  spendPriorMinor: number;
  /** Cost per this funnel's terminal result, minor units. Null when no results. */
  costPerResultCurrentMinor: number | null;
  costPerResultPriorMinor: number | null;
}

// ── The diagnosis contract (locked condition 9) ─────────────────────────

export type DiagnosisConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface StageRatioComparison {
  stageKey: FunnelStageKey;
  currentRatio: number | null;
  priorRatio: number | null;
  relativeChange: number | null;
  judgeable: boolean;
  material: boolean;
  requiredDrop: number | null;
}

export interface FunnelDiagnosis {
  family: ObjectiveKpiFamily;
  status: 'BREAK_FOUND' | 'NO_MATERIAL_BREAK' | 'INSUFFICIENT_DATA';
  /** Both windows' computed stages — the UI renders these verbatim. */
  stages: { current: ComputedFunnel['stages']; prior: ComputedFunnel['stages'] };
  /** Every judged ratio, material or not — the audit trail of the decision. */
  ratios: StageRatioComparison[];
  /** The EARLIEST materially degraded stage, or null. */
  degradedStage: FunnelStageKey | null;
  problemClass: ProblemClass;
  /** Null when there is nothing to be confident about. */
  confidence: DiagnosisConfidence | null;
  /** True when an approximate stage was involved in the identified break. */
  approximateInvolved: boolean;
  /** Deterministic, template-filled facts. The LLM may rephrase, never add. */
  evidence: string[];
}

const pct = (x: number) => `${(Math.abs(x) * 100).toFixed(1)}%`;

/**
 * Diagnose one funnel: current window vs prior window.
 *
 * Returns null only for an unresolvable purpose (rule 3: no shape, no guess).
 */
export function diagnoseFunnel(
  family: ObjectiveKpiFamily | null | undefined,
  currentTotals: FunnelWindowTotals,
  priorTotals: FunnelWindowTotals,
  signals: SupportingSignals,
): FunnelDiagnosis | null {
  const current = computeFunnel(family, currentTotals);
  const prior = computeFunnel(family, priorTotals);
  if (!current || !prior || !family) return null;

  const shape = funnelShapeFor(family);
  const ratios: StageRatioComparison[] = [];
  const evidence: string[] = [];

  // ── 1. Entry-stage delivery check (supporting signal, earliest of all) ──
  // Impressions materially down while spend held or rose: the auction is
  // delivering less for the same money. Not a funnel ratio — a signal.
  const imprVerdict = judgeMateriality({
    currentRatio: currentTotals.impressions,
    priorRatio: priorTotals.impressions,
    currentDenominator: priorTotals.impressions,   // its own scale is the sample
    priorDenominator: priorTotals.impressions,
    minDenominator: shape[0]!.minDenominatorForRatio || 1_000,
  });
  const spendHeld =
    signals.spendPriorMinor > 0 &&
    signals.spendCurrentMinor >= signals.spendPriorMinor * 0.9;
  const deliveryBreak = imprVerdict.judgeable && imprVerdict.material && spendHeld;

  // ── 2. Walk the chain: judge every ratio, remember the EARLIEST break ──
  let earliest: { def: FunnelStageDef; verdict: MaterialityVerdict } | null = null;
  let anyJudgeable = false;
  let approximateUpstream = false;

  for (let i = 1; i < shape.length; i++) {
    const def = shape[i]!;
    const cur = current.stages[i]!;
    const pri = prior.stages[i]!;
    const curPrev = current.stages[i - 1]!;
    const priPrev = prior.stages[i - 1]!;

    const curRatio = cur.status === 'OK' ? cur.ratioFromPrevious : null;
    const priRatio = pri.status === 'OK' ? pri.ratioFromPrevious : null;

    // Terminal stages additionally need enough PRIOR events to judge at all.
    const isTerminal = i === shape.length - 1 && def.stageKey !== 'reach';
    const priorEvents = pri.status === 'OK' ? pri.count : (pri.count ?? 0);
    const terminalTooThin = isTerminal && priorEvents < terminalFloor(def);

    const verdict = terminalTooThin
      ? ({ judgeable: false, material: false, relativeChange: null, requiredDrop: null, reason: 'SAMPLE_TOO_SMALL' } as MaterialityVerdict)
      : judgeMateriality({
          currentRatio: curRatio,
          priorRatio: priRatio,
          currentDenominator: curPrev.status === 'OK' ? curPrev.count : 0,
          priorDenominator: priPrev.status === 'OK' ? priPrev.count : 0,
          minDenominator: def.minDenominatorForRatio,
        });

    ratios.push({
      stageKey: def.stageKey,
      currentRatio: curRatio,
      priorRatio: priRatio,
      relativeChange: verdict.relativeChange,
      judgeable: verdict.judgeable,
      material: verdict.material,
      requiredDrop: verdict.requiredDrop,
    });

    anyJudgeable = anyJudgeable || verdict.judgeable;
    if (verdict.material && earliest === null) {
      earliest = { def, verdict };
      approximateUpstream = shape.slice(0, i + 1).some((s) => s.approximate);
    }
  }

  // ── 3. Resolve to a verdict, earliest wins ─────────────────────────────

  if (deliveryBreak) {
    // Earlier than any ratio: the funnel's entry itself shrank at held spend.
    evidence.push(
      `مرات الظهور انخفضت ${pct(imprVerdict.relativeChange ?? 0)} (${priorTotals.impressions.toLocaleString('en-US')} ← ${currentTotals.impressions.toLocaleString('en-US')}) بينما الإنفاق ${signals.spendCurrentMinor >= signals.spendPriorMinor ? 'ارتفع أو ثبت' : 'شبه ثابت'} — نفس المال يشتري وصولاً أقل`,
    );
    if (earliest) {
      evidence.push(`التدهور اللاحق في «${earliest.def.labelAr}» متوقع نتيجة الانكماش الأعلى — لا يُلام بذاته`);
    }
    return {
      family,
      status: 'BREAK_FOUND',
      stages: { current: current.stages, prior: prior.stages },
      ratios,
      degradedStage: 'impressions',
      problemClass: 'DELIVERY',
      confidence: 'HIGH',
      approximateInvolved: false,
      evidence,
    };
  }

  if (earliest) {
    const { def, verdict } = earliest;
    // Confidence (locked condition 7): approximate involvement caps at LOW;
    // a reach-based (estimated lower bound) break caps at MEDIUM; a break
    // that barely cleared the materiality floor is MEDIUM, not HIGH.
    let confidence: DiagnosisConfidence = 'HIGH';
    const margin = Math.abs(verdict.relativeChange ?? 0) / (verdict.requiredDrop || 1);
    if (margin < 1.5) confidence = 'MEDIUM';
    if (def.stageKey === 'reach') confidence = confidence === 'HIGH' ? 'MEDIUM' : confidence;
    if (approximateUpstream || def.approximate) confidence = 'LOW';

    const ratioRow = ratios.find((r) => r.stageKey === def.stageKey)!;
    evidence.push(
      `نسبة «${def.labelAr}» انخفضت ${pct(verdict.relativeChange ?? 0)} (${((ratioRow.priorRatio ?? 0) * 100).toFixed(2)}% ← ${((ratioRow.currentRatio ?? 0) * 100).toFixed(2)}%) — أول حلقة تنكسر في القمع`,
    );
    // Downstream stages that also fell: expected, named as such, never blamed.
    // Two distinct shapes of "fell":
    //   ratio material  — the stage degraded on its own terms too
    //   ratio held but the COUNT dropped — the pure mechanical echo of the
    //   upstream break, which is what the merchant actually sees ("my
    //   conversations halved!") and exactly what must NOT be blamed.
    const breakIdx = shape.findIndex((st) => st.stageKey === def.stageKey);
    for (let j = breakIdx + 1; j < shape.length; j++) {
      const st = shape[j]!;
      const r = ratios.find((x) => x.stageKey === st.stageKey);
      const curStage = current.stages[j]!;
      const priStage = prior.stages[j]!;
      const curCount = curStage.status === 'OK' ? curStage.count : (curStage.count ?? 0);
      const priCount = priStage.status === 'OK' ? priStage.count : (priStage.count ?? 0);
      const countFell = priCount > 0 && (priCount - curCount) / priCount >= BASE_MATERIAL_DROP;
      if (r?.material) {
        evidence.push(`انخفاض «${st.labelAr}» اللاحق نتيجة متوقعة للكسر الأعلى`);
      } else if (countFell) {
        evidence.push(`انخفاض «${st.labelAr}» (${priCount.toLocaleString('en-US')} ← ${curCount.toLocaleString('en-US')}) نتيجة متوقعة للكسر الأعلى — نسبته الخاصة ثابتة`);
      }
    }
    if (def.approximate) {
      evidence.push('هذا المؤشر تقريبي (مشتق من مجموع النقرات) — الثقة محدودة بطبيعته');
    }

    return {
      family,
      status: 'BREAK_FOUND',
      stages: { current: current.stages, prior: prior.stages },
      ratios,
      degradedStage: def.stageKey,
      problemClass: def.breakClass,
      confidence,
      approximateInvolved: approximateUpstream || def.approximate,
      evidence,
    };
  }

  // ── 4. No ratio broke. Efficiency? (supporting signal, not a stage) ────
  if (
    anyJudgeable &&
    signals.costPerResultCurrentMinor !== null &&
    signals.costPerResultPriorMinor !== null &&
    signals.costPerResultPriorMinor > 0
  ) {
    const costChange =
      (signals.costPerResultCurrentMinor - signals.costPerResultPriorMinor) /
      signals.costPerResultPriorMinor;
    if (costChange >= BASE_MATERIAL_DROP) {
      evidence.push(
        `كل نسب القمع ثابتة لكن تكلفة النتيجة ارتفعت ${pct(costChange)} — نفس النتائج بمال أكثر (ضغط مزاد غالباً)`,
      );
      return {
        family,
        status: 'BREAK_FOUND',
        stages: { current: current.stages, prior: prior.stages },
        ratios,
        degradedStage: null,          // efficiency is not a stage break
        problemClass: 'EFFICIENCY',
        confidence: 'MEDIUM',
        approximateInvolved: false,
        evidence,
      };
    }
  }

  // ── 5. Nothing material — or nothing judgeable at all ──────────────────
  if (!anyJudgeable) {
    return {
      family,
      status: 'INSUFFICIENT_DATA',
      stages: { current: current.stages, prior: prior.stages },
      ratios,
      degradedStage: null,
      problemClass: 'NO_MATERIAL_BREAK',
      confidence: null,
      approximateInvolved: false,
      evidence: [],                   // nothing measured → nothing claimed
    };
  }

  return {
    family,
    status: 'NO_MATERIAL_BREAK',
    stages: { current: current.stages, prior: prior.stages },
    ratios,
    degradedStage: null,
    problemClass: 'NO_MATERIAL_BREAK',
    confidence: null,
    approximateInvolved: false,
    evidence: [],                     // silence is a valid output
  };
}
