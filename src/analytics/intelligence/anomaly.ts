// ════════════════════════════════════════════════════════════════════════
//  src/analytics/intelligence/anomaly.ts — IS THE BREAK UNUSUAL?
//
//  Different responsibility from the funnel (locked P5.3):
//
//    FUNNEL  → WHERE did it break?          (a location)
//    ANOMALY → is that break UNUSUAL?       (a judgement about magnitude)
//
//  Both are needed. A ratio can be lower without being remarkable: accounts
//  wobble, weekends differ from weekdays, one WhatsApp message either way
//  swings a small denominator. Alerting on every downward ratio is how a
//  monitoring product teaches its users to ignore it.
//
//    funnel POST_CLICK + anomaly SIGNIFICANT      → POST_CLICK DEGRADATION
//    funnel POST_CLICK + anomaly NOT_SIGNIFICANT  → no major alert
//
//  Deterministic. Reuses the P1 sample-confidence framework rather than
//  inventing a second notion of "enough data".
// ════════════════════════════════════════════════════════════════════════

import type { FunnelDiagnosis } from '../funnel/diagnose';
import { gateRateBenchmark } from '../confidence';
import {
  deriveFatigueSignal,
  type AnomalyVerdict,
  type FatigueSignal,
  type FatigueInput,
  type Verdict,
} from './hierarchy';

/**
 * A degradation must clear this multiple of the funnel's own materiality
 * floor to count as unusual rather than merely real.
 *
 * The funnel already refuses to call anything below ~15% a break. Anomaly asks
 * a stricter question, so it wants meaningful headroom above that line —
 * otherwise the two layers would be the same test twice, and the anomaly
 * layer would add nothing but the appearance of rigour.
 */
export const ANOMALY_MAGNITUDE_MULTIPLE = 1.5;

export interface AnomalyInput {
  funnel: FunnelDiagnosis | null;
  /** Delivery-side context — supporting signals, not funnel stages. */
  spendCurrentMinor: number;
  spendPriorMinor: number;
  impressionsCurrent: number;
  impressionsPrior: number;
  cpmCurrent: number | null;
  cpmPrior: number | null;
  /** Everything the shared fatigue signal needs. */
  fatigue: FatigueInput;
}

export interface AnomalyResult {
  verdict: AnomalyVerdict;
  /** The shared fatigue representation — canonical for all consumers. */
  fatigue: FatigueSignal;
}

const rel = (cur: number | null, prior: number | null): number | null =>
  cur !== null && prior !== null && prior > 0 ? (cur - prior) / prior : null;
const pct = (x: number) => `${(Math.abs(x) * 100).toFixed(1)}%`;

/**
 * Judge whether the funnel's break is unusual, and derive the fatigue signal.
 *
 * Objective-aware by construction: it reads the funnel's own problem class,
 * which was already chosen from the campaign's objective-specific chain.
 */
export function detectAnomaly(input: AnomalyInput): AnomalyResult {
  const fatigue = deriveFatigueSignal(input.fatigue);
  const funnel = input.funnel;
  const evidence: string[] = [];

  // ── No usable funnel → nothing to judge. Never invent an anomaly. ──────
  if (!funnel || funnel.status === 'INSUFFICIENT_DATA') {
    return {
      verdict: { significant: false, confidence: 'INSUFFICIENT_DATA', kind: 'NONE', evidence: [] },
      fatigue,
    };
  }

  // Sample gate — the same framework P1 uses for benchmarks.
  const gate = gateRateBenchmark({ size: input.impressionsCurrent });
  if (gate.status === 'UNAVAILABLE') {
    return {
      verdict: { significant: false, confidence: 'INSUFFICIENT_DATA', kind: 'NONE', evidence: [] },
      fatigue,
    };
  }
  const sampleConfidence: Verdict = gate.status === 'LOW_CONFIDENCE' ? 'MEDIUM' : 'HIGH';

  // ── Delivery degradation: more money, fewer impressions, dearer auction ─
  const spendChange = rel(input.spendCurrentMinor, input.spendPriorMinor);
  const imprChange = rel(input.impressionsCurrent, input.impressionsPrior);
  const cpmChange = rel(input.cpmCurrent, input.cpmPrior);
  const deliveryDegraded =
    spendChange !== null && spendChange >= -0.05 &&      // spend held or grew
    imprChange !== null && imprChange <= -0.15 &&        // reach of delivery fell
    cpmChange !== null && cpmChange >= 0.15;             // and it cost more

  // ── No funnel break: only a standing fatigue or delivery state remains ──
  if (funnel.status === 'NO_MATERIAL_BREAK') {
    if (fatigue.severity === 'CRITICAL' || fatigue.severity === 'HIGH') {
      return {
        verdict: {
          significant: true, confidence: fatigue.confidence,
          kind: 'CREATIVE_FATIGUE', evidence: fatigue.evidence,
        },
        fatigue,
      };
    }
    if (deliveryDegraded) {
      evidence.push(`الإنفاق ثابت أو مرتفع بينما الظهور انخفض ${pct(imprChange!)} وتكلفة الألف ارتفعت ${pct(cpmChange!)}`);
      return {
        verdict: { significant: true, confidence: sampleConfidence, kind: 'DELIVERY_DEGRADATION', evidence },
        fatigue,
      };
    }
    return {
      verdict: { significant: false, confidence: 'HIGH', kind: 'NONE', evidence: [] },
      fatigue,
    };
  }

  // ── A break exists. Is its magnitude unusual? ──────────────────────────
  const brokenRatio = funnel.ratios.find((r) => r.stageKey === funnel.degradedStage);
  const change = brokenRatio?.relativeChange ?? null;
  const required = (brokenRatio?.requiredDrop ?? 0.15) * ANOMALY_MAGNITUDE_MULTIPLE;
  const magnitudeUnusual = change !== null && Math.abs(change) >= required;

  // EFFICIENCY breaks carry no stage ratio — judge them on the cost move the
  // funnel already validated rather than pretending a ratio exists.
  const isEfficiency = funnel.problemClass === 'EFFICIENCY';
  const significant = isEfficiency ? true : magnitudeUnusual;

  const kind: AnomalyVerdict['kind'] =
    funnel.problemClass === 'POST_CLICK' ? 'POST_CLICK_DEGRADATION'
    : funnel.problemClass === 'CONVERSION' ? 'CONVERSION_DEGRADATION'
    : funnel.problemClass === 'EFFICIENCY' ? 'EFFICIENCY_DEGRADATION'
    : funnel.problemClass === 'CLICK'
        ? (fatigue.severity === 'HIGH' || fatigue.severity === 'CRITICAL' ? 'CREATIVE_FATIGUE' : 'DELIVERY_DEGRADATION')
    : deliveryDegraded || fatigue.severity !== 'NONE' ? 'CREATIVE_FATIGUE'
    : 'DELIVERY_DEGRADATION';

  if (significant && change !== null) {
    evidence.push(`الانخفاض ${pct(change)} يتجاوز عتبة الأهمية (${pct(required)}) — تغيّر غير اعتيادي لهذا الحساب`);
  } else if (!significant && change !== null) {
    evidence.push(`الانخفاض ${pct(change)} حقيقي لكنه ضمن التقلب الطبيعي — لا إنذار`);
  }
  // A CLICK break corroborated by fatigue is the same story, told once.
  if (kind === 'CREATIVE_FATIGUE' && fatigue.severity !== 'NONE') {
    evidence.push(...fatigue.evidence);
  }

  // Confidence is capped by the sample AND by the funnel's own confidence.
  let confidence: Verdict = sampleConfidence;
  const funnelConf = (funnel.confidence ?? 'LOW') as Verdict;
  if (funnelConf === 'LOW' || funnel.approximateInvolved) confidence = 'LOW';
  else if (funnelConf === 'MEDIUM' && confidence === 'HIGH') confidence = 'MEDIUM';

  return { verdict: { significant, confidence, kind: significant ? kind : 'NONE', evidence }, fatigue };
}
