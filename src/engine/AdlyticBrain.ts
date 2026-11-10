// src/engine/AdlyticBrain.ts
import { calculateCampaignPhysics, CampaignPhysicsOutput } from './CampaignPhysics';
import { CampaignRawData, AccountBaseline } from './BaselineCalculator';
import { evaluateCampaignConfidence, ConfidenceAnalysis } from './ConfidenceEngine';
import { recognizeCampaignPattern, PatternAnalysis } from './PatternEngine';
import { evaluateRecoveryPotential, RecoveryAnalysis } from './RecoveryGate';
import { decideCampaignAction, CampaignDecision } from './DecisionEngine';
import {
  applyRuleGroundingToDecision,
  buildRuleGrounding,
  type RuleGrounding,
} from '../engines/rules/ruleGrounding';
import type { Signals } from '../engines/rules/types';
import { BRAIN_SPEND_DEPENDENT_ACTIONS, type SpendGateReason } from '../lib/spendEvidence';

// ── V2 wiring ────────────────────────────────────────────────────────────
import type {
  MarketBaseline,
  GoldStandardDNA,
  BreakdownData,
  VisionAIPayload,
  BrainV2Extension,
} from './v2/contracts';
import { evaluateMarketPressure } from './v2/MarketPressureEngine';
import { evaluateGoldStandard } from './v2/GoldStandardEngine';
import { evaluateVelocity, DetailedHourlyVelocity } from './v2/VelocityTrackerEngine';
import { evaluateCreativeResonance } from './v2/CreativeResonanceEngine';

/**
 * Optional extras for runBrainForCampaign beyond V2 market/DNA/velocity.
 * Kept separate so V1 callers stay unchanged.
 */
export interface BrainGroundingInputs {
  /** Real period-over-period Signals (from loadCampaignSignalsBatch). */
  periodSignals?: Signals | null;
  /**
   * Set when the spend the Brain reads for this campaign is not verified (IQD; the
   * orchestrator evaluates it — src/lib/spendEvidence.ts). Every verdict that rests on
   * cost (scale, pause, rescue, creative refresh by physics score, the spend-velocity
   * emergency) is then withheld and said so; absent/null changes nothing.
   */
  spendWithheld?: SpendGateReason | null;
}

/**
 * Pure. Replace a spend-dependent verdict with HOLD_AND_MONITOR, keeping the original in
 * `overriddenAction` (the precedent ruleGrounding already uses) and saying why in `reason`
 * and `spendEvidence`. Verdicts that do not rest on spend (HOLD_AND_MONITOR,
 * KEEP_COLLECTING) are returned untouched. The Brain's score blends cost-per-message into
 * every verdict, so there is no spend-free remainder of a physics decision to keep.
 */
export function withholdSpendDependentDecision(decision: CampaignDecision, reason: SpendGateReason): CampaignDecision {
  if (!BRAIN_SPEND_DEPENDENT_ACTIONS.has(decision.action)) return decision;
  return {
    campaignId: decision.campaignId,
    action: 'HOLD_AND_MONITOR',
    priority: 'NORMAL',
    reason: `[${reason}] Withheld: the spend this verdict was computed from is not verified against raw Meta data, so "${decision.action}" is not issued. Original reasoning: ${decision.reason}`,
    overriddenAction: decision.action,
    spendEvidence: { withheld: true, reason, withheldAction: decision.action },
  };
}

/**
 * مدخلات V2 الاختيارية — كل المحركات الأربعة الجديدة تستهلك من هنا.
 * `bestHistoricalCostPerMessage` يأتي بدوره من `goldStandard.bestHistoricalCostPerMessage`
 * تلقائياً داخل الـ orchestrator، فلا حاجة لتمريره مرتين.
 */
export interface BrainV2Inputs {
  marketBaseline: MarketBaseline;
  goldStandard: GoldStandardDNA;
  hourlyVelocity: {
    hoursActiveToday: number;
    totalSpendToday: number;
    totalMessagesToday: number;
    dailyBudget: number;
  };
  audienceBreakdowns: BreakdownData;
  visionContext: VisionAIPayload;
}

/**
 * المخرج الشامل لكل حملة بعد المرور بكامل طبقات الدماغ.
 * `v2` يظهر فقط عندما تُمرر `BrainV2Inputs` — V1 callers يحصلون على نفس الشكل القديم تماماً.
 */
export interface BrainTickResult {
  campaignId: string;
  campaignName: string;
  /** Meta objective when known — drives narration vocabulary + KPI framing. */
  objective?: string | null;
  physics: CampaignPhysicsOutput;
  confidence: ConfidenceAnalysis;
  pattern: PatternAnalysis;
  recovery: RecoveryAnalysis;
  decision: CampaignDecision;
  v2?: BrainV2Extension;
  /** Rule-engine diagnoses grounded against account baseline (understanding layer). */
  ruleGrounding?: RuleGrounding;
}

/**
 * محرك التنسيق الرئيسي (The Orchestrator) — الطبقة 5
 * المدخل الوحيد المسموح لبقية النظام (Workers, API, UI) للحديث مع الدماغ.
 * يمرر بيانات الحملة عبر الطبقات بالترتيب الصارم:
 *   Layer 1: Physics → Layer 2: Confidence → Layer 3: Pattern + Recovery → Layer 4: Decision
 *   (اختياري) Layer 8–11: V2 extension → فحص emergencyOverride → استبدال القرار إذا لزم
 */
export function runBrainForCampaign(
  raw: CampaignRawData,
  baseline: AccountBaseline,
  v2Inputs?: BrainV2Inputs,
  groundingInputs?: BrainGroundingInputs,
): BrainTickResult {

  // Layer 1: Physics Engine — الأرقام المجردة والدلتا الموزونة
  const physics = calculateCampaignPhysics(raw, baseline);

  // Layer 2: Confidence Engine — هل البيانات ناضجة وخالية من الاضطراب؟
  const confidence = evaluateCampaignConfidence(physics, raw.spend, raw.messages);

  // Layer 3: التشخيصات الاستراتيجية
  const pattern = recognizeCampaignPattern(physics, confidence);
  const recovery = evaluateRecoveryPotential(physics);

  // Layer 4: Decision Engine — الترجمة إلى Action قابل للتنفيذ (يبقى أعمى ونقياً)
  let decision = decideCampaignAction(physics, confidence, pattern, recovery);
  const spendWithheld = groundingInputs?.spendWithheld ?? null;
  // Withhold BEFORE rule grounding: grounding may still raise a creative-fatigue refresh on
  // frequency/CTR evidence, which does not rest on spend (its spend-derived signals are
  // already nulled by the signals loader).
  if (spendWithheld) decision = withholdSpendDependentDecision(decision, spendWithheld);

  // Layer 4b: Rule grounding — prefer real period Signals when available;
  // otherwise absolute-only snapshot (no fabricated trends).
  const ruleGrounding = buildRuleGrounding(
    raw,
    baseline,
    groundingInputs?.periodSignals,
  );
  decision = applyRuleGroundingToDecision(decision, ruleGrounding);

  let v2Extension: BrainV2Extension | undefined;

  // ── V2 cognitive extension (Layers 8–11) ──────────────────────────────
  if (v2Inputs) {
    // Layer 8: Market Pressure — auction CPM is the raw auction metric, not the conversion cost
    const marketPressure = evaluateMarketPressure(raw.cpm, v2Inputs.marketBaseline);

    // Layer 9: Gold Standard DNA — current vs best-historical (same workspace)
    const goldStandard = evaluateGoldStandard(
      {
        cpm: raw.cpm,                                     // auction metric من Raw
        ctr: raw.ctr,                                     // auction metric من Raw
        costPerMessage: physics.costPerMessage.value,     // conversion metric من Physics
      },
      v2Inputs.goldStandard
    );

    // Layer 10: Velocity Tracker — ينتزع bestHistoricalCostPerMessage من Layer 9's contract
    const velocityData: DetailedHourlyVelocity = {
      ...v2Inputs.hourlyVelocity,
      bestHistoricalCostPerMessage: v2Inputs.goldStandard.bestHistoricalCostPerMessage,
    };
    const velocity = evaluateVelocity(velocityData);

    // Layer 11: Creative Resonance — heuristic match between audience & visual hook
    const resonance = evaluateCreativeResonance(v2Inputs.audienceBreakdowns, v2Inputs.visionContext);

    v2Extension = { marketPressure, goldStandard, velocity, resonance };

    // ── Emergency Override: Layer 10 outranks Layer 4 ───────────────────
    // The orchestrator (not DecisionEngine) is the only place this can fire.
    if (velocity.emergencyOverride) {
      const emergency: CampaignDecision = {
        campaignId: decision.campaignId,
        action: 'EMERGENCY_PAUSE',
        priority: 'CRITICAL',
        reason: `[تجاوز طوارئ — إنفاق مرتفع]: ${decision.reason} | سرعة الإنفاق مرتفعة جداً.`,
        overriddenAction: decision.action,
      };
      // The velocity override IS spend (spent-so-far against budget): never issued on unverified spend.
      decision = spendWithheld ? withholdSpendDependentDecision(emergency, spendWithheld) : emergency;
    }
  }

  return {
    campaignId: raw.campaignId,
    campaignName: raw.campaignName,
    objective: raw.objective ?? null,
    physics,
    confidence,
    pattern,
    recovery,
    decision,
    ...(v2Extension && { v2: v2Extension }),
    ...(ruleGrounding.diagnoses.length > 0 || ruleGrounding.issues.length > 0
      ? { ruleGrounding }
      : {}),
  };
}

/**
 * تشغيل الدماغ على حزمة من الحملات (Batch Processor).
 * كل عنصر يحمل بياناته الخام مع الـ baseline المرجعي (عادةً مشترك لكامل الحساب)،
 * وقد يحمل اختيارياً مدخلات V2 الخاصة بكل حملة.
 */
export function runBrainBatch(
  campaigns: Array<{
    raw: CampaignRawData;
    baseline: AccountBaseline;
    v2Inputs?: BrainV2Inputs;
    groundingInputs?: BrainGroundingInputs;
  }>
): BrainTickResult[] {
  return campaigns.map(c =>
    runBrainForCampaign(c.raw, c.baseline, c.v2Inputs, c.groundingInputs),
  );
}
