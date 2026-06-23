// src/services/ClaudeCMO.ts
//
// الطبقة السابعة: المدير التسويقي (Claude CMO)
// Brain-to-Mouth Pipeline: ترجمة قرار الدماغ الرياضي إلى رسالة عربية للتاجر.
//
// Architecture:
//   1. Build a strict, anti-hallucination JSON payload (CmoPayload) from BrainTickResult
//   2. If decision is EMERGENCY_PAUSE → short-circuit to a deterministic template (no LLM call)
//   3. Otherwise → call LLM with strict system prompt + JSON payload
//   4. Strip markdown fences, parse, fallback safely on any error
//
// Output shape stays backward-compatible:
//   { campaignId, arabicTitle, arabicNarration, creativeDirective? }

import { BrainTickResult } from '../engine/AdlyticBrain';
import { DecisionAction } from '../engine/DecisionEngine';

// ════════════════════════════════════════════════════════════════════════
// Public output contract
// ════════════════════════════════════════════════════════════════════════
export interface CmoNarration {
  campaignId: string;
  arabicTitle: string;
  arabicNarration: string;
  /**
   * التوجيه الإبداعي من Layer 11 — معروض في بطاقة UI منفصلة مع أيقونة 💡.
   * يظهر فقط عند توفر بيانات V2 (Resonance Engine).
   */
  creativeDirective?: string;
}

// ════════════════════════════════════════════════════════════════════════
// LLM-facing payload contract — the only data Claude is allowed to see.
// Every field is either a closed-set string, a number, or pre-translated Arabic
// text that came out of a deterministic engine. No raw metrics that could
// tempt invented comparisons.
// ════════════════════════════════════════════════════════════════════════
interface CmoPayload {
  campaignName: string;

  decision: {
    action: DecisionAction;
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
    reason: string;
    overriddenAction?: DecisionAction;
  };

  pattern:
    | 'SCALABLE_BEAST'
    | 'DYING_CREATIVE'
    | 'STABLE_PERFORMER'
    | 'UNSTABLE_NOISE'
    | 'UNDER_OBSERVATION';

  recoverySignal: 'NONE' | 'MODERATE' | 'STRONG';

  scores: {
    physicsFinalScore: number;
    confidenceFinalScore: number;
  };

  deltas: {
    costPerMessagePercent: number;
    ctrPercent: number;
  };

  // Authorized for quoting in narration. All numbers in account-major units
  // (currency for costPerMessage; raw % for ctr; ratio for frequency).
  absolutes: {
    costPerMessage: { current: number; baseline: number };
    ctr:            { current: number; baseline: number };
    frequency:      { current: number; baseline: number };
  };

  v2?: {
    marketPressure: {
      status: 'CHEAP_AUCTION' | 'NORMAL' | 'BLOODBATH';
      isAuctionBleeding: boolean;
    };
    dna: {
      verdict: 'LEGENDARY_DNA' | 'GOOD_MATCH' | 'POOR_MATCH';
      matchPercent: number;
      deviations: string[];
    };
    velocity: {
      status: 'HEALTHY' | 'MICRO_BLEEDING' | 'HEMORRHAGE';
      burnRatePerHour: number;
      emergencyTriggered: boolean;
    };
    resonance: {
      alignmentScore: number;
      directive: string;
    };
  };
}

// ════════════════════════════════════════════════════════════════════════
// Payload builder — pure transformation from BrainTickResult → CmoPayload.
// All Arabic text inside `deviations` and `directive` flows through unchanged.
// ════════════════════════════════════════════════════════════════════════
function buildPayload(b: BrainTickResult): CmoPayload {
  const payload: CmoPayload = {
    campaignName: b.campaignName,
    decision: {
      action: b.decision.action,
      priority: b.decision.priority,
      reason: b.decision.reason,
      ...(b.decision.overriddenAction && { overriddenAction: b.decision.overriddenAction }),
    },
    pattern: b.pattern.signature,
    recoverySignal: b.recovery.recoverySignalStrength,
    scores: {
      physicsFinalScore: b.physics.finalScore,
      confidenceFinalScore: b.confidence.finalConfidenceScore,
    },
    deltas: {
      costPerMessagePercent: b.physics.costPerMessage.delta,
      ctrPercent: b.physics.ctr.delta,
    },
    absolutes: {
      costPerMessage: {
        current:  b.physics.costPerMessage.value,
        baseline: b.physics.costPerMessage.baseline,
      },
      ctr: {
        current:  b.physics.ctr.value,
        baseline: b.physics.ctr.baseline,
      },
      frequency: {
        current:  b.physics.frequency.value,
        baseline: b.physics.frequency.baseline,
      },
    },
  };

  if (b.v2) {
    payload.v2 = {
      marketPressure: {
        status: b.v2.marketPressure.status,
        isAuctionBleeding: b.v2.marketPressure.isAuctionBleeding,
      },
      dna: {
        verdict: b.v2.goldStandard.verdict,
        matchPercent: b.v2.goldStandard.dnaMatchPercentage,
        deviations: b.v2.goldStandard.deviations,
      },
      velocity: {
        status: b.v2.velocity.status,
        burnRatePerHour: b.v2.velocity.burnRate,
        emergencyTriggered: b.v2.velocity.emergencyOverride,
      },
      resonance: {
        alignmentScore: b.v2.resonance.audienceAlignmentScore,
        directive: b.v2.resonance.creativeDirective,
      },
    };
  }

  return payload;
}

// ════════════════════════════════════════════════════════════════════════
// Emergency template — deterministic, zero LLM round-trip.
// Used when capital is bleeding and the merchant cannot wait for tokens.
// ════════════════════════════════════════════════════════════════════════
function buildEmergencyNarration(b: BrainTickResult): CmoNarration {
  // Read from the engine's canonical field name (`burnRate`), not the payload's renamed field.
  const burnRate = b.v2?.velocity.burnRate ?? 0;
  const overridden = b.decision.overriddenAction
    ? ` تجاوزنا التوصية الأولية (${b.decision.overriddenAction}) بسبب خطورة النزيف.`
    : '';

  const narration =
    `🚨 إيقاف طوارئ فوري لحملة "${b.campaignName}". ` +
    `رصدنا نزيفاً مالياً لحظياً بمعدل حرق ${burnRate} لكل ساعة دون نتائج كافية تبرر هذا الإنفاق.` +
    overridden +
    ` لقد أوقفنا الحملة لحماية رأس مالك قبل أن يتفاقم الضرر. ` +
    `يرجى مراجعة الإبداع البصري والاستهداف قبل إعادة التشغيل.`;

  const result: CmoNarration = {
    campaignId: b.campaignId,
    arabicTitle: '🚨 إيقاف طوارئ — نزيف لحظي',
    arabicNarration: narration,
  };

  if (b.v2?.resonance.creativeDirective) {
    result.creativeDirective = b.v2.resonance.creativeDirective;
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════
// System prompt — engineered to make Claude a translator, not an inventor.
// ════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `
You are an elite Arabic Chief Marketing Officer (CMO) speaking directly to a business owner (merchant).
Your single job: translate the structured JSON decision below into a clear, professional Arabic report.

═══════════════════════════════════════════════════════════════
ABSOLUTE RULES (violating any of these = system failure)
═══════════════════════════════════════════════════════════════
1. ZERO HALLUCINATION. Use ONLY numbers, statuses, and text present in the JSON payload.
   - Never invent metrics, dates, audiences, or product attributes.
   - If a number is not in the payload, do NOT mention it.

1b. ABSOLUTE METRIC QUOTING — the "absolutes" block contains the canonical
   engine output. You ARE authorized to quote these exact values verbatim
   inside the narration to make advice specific (e.g. "تكلفة الرسالة الحالية
   1.45 مقابل متوسط الحساب 1.10، بزيادة 31%"). Round to at most 2 decimals.
   Do NOT append currency symbols or units — quote the bare number.
   "deltas.*" remain the source of truth for percent changes; "absolutes.*"
   are for the underlying values that produced those deltas.

2. PRE-TRANSLATED ARABIC IS SACRED.
   - Strings inside "v2.dna.deviations[]" are already written in correct Arabic by the engine. Use them verbatim or rephrase with surgical care; do NOT contradict them.
   - The string inside "v2.resonance.directive" is the canonical creative directive. Quote it faithfully in the "creativeDirective" output field.

3. STRICT JSON OUTPUT. Output a raw JSON object with EXACTLY these keys:
   { "title": string, "narration": string, "creativeDirective"?: string }
   - No markdown fences. No commentary. No leading/trailing text.
   - "creativeDirective" appears ONLY if v2.resonance is present in the payload.

═══════════════════════════════════════════════════════════════
TONE MATRIX (driven by decision.action)
═══════════════════════════════════════════════════════════════
- SCALE_BUDGET     → احتفالي + يحفّز على مضاعفة الميزانية وإنتاج variations
- RESCUE_WATCH     → متفائل حذر، نطلب الصبر بضع أيام قبل أي قرار إعدام
- REFRESH_CREATIVE → بنّاء + يقترح تجديد الإبداع (انسج التوجيه من v2.resonance.directive إن وُجد)
- PAUSE_CAMPAIGN   → حازم لكن متعاطف، نوضح أن المال يحترق دون نتائج
- KEEP_COLLECTING  → صبور ومطمئن، الحملة لم تنضج بعد إحصائياً
- HOLD_AND_MONITOR → هادئ تقليدي، الأداء طبيعي ولا تدخل مطلوب
- EMERGENCY_PAUSE  → (هذا الفرع يُعالَج خارج LLM. لن يصلك أبداً.)

═══════════════════════════════════════════════════════════════
V2 CONTEXTUAL RULES (apply only if v2 exists)
═══════════════════════════════════════════════════════════════
- v2.marketPressure.isAuctionBleeding === true:
    ليّن أي إنذار سلبي بإضافة جملة مثل "السوق ككل يمر بضغط مزاد مرتفع اليوم، وهذا يفسر جزءاً من الأرقام."
- v2.dna.verdict === 'LEGENDARY_DNA' (matchPercent ≥ 85):
    استشهد بالنسبة كنقطة فخر، مثلاً: "حملتك تتطابق بنسبة <matchPercent>% مع حمضك التسويقي الذهبي."
- v2.dna.deviations.length > 0:
    انسج أهم انحراف واحد أو اثنين داخل السرد بلباقة (لا تُسرد قائمة جافة).
- v2.resonance.directive موجود:
    ضع نصه (أو إعادة صياغة لباقة جداً لمضمونه) في حقل "creativeDirective" المنفصل.

═══════════════════════════════════════════════════════════════
LENGTH
═══════════════════════════════════════════════════════════════
- title: 3–7 كلمات عربية واضحة
- narration: 2–4 جمل عربية متماسكة
- creativeDirective (إن وُجد): جملة أو جملتان قابلتان للتنفيذ مباشرة
`.trim();

// ════════════════════════════════════════════════════════════════════════
// Public entry — backward compatible signature.
// ════════════════════════════════════════════════════════════════════════
export async function generateMerchantNarration(
  brainResult: BrainTickResult,
  llmClientCall: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<CmoNarration> {

  // 1. SHORT-CIRCUIT: capital-bleed emergency bypasses the LLM entirely.
  if (brainResult.decision.action === 'EMERGENCY_PAUSE') {
    return buildEmergencyNarration(brainResult);
  }

  // 2. Build the strict, anti-hallucination payload.
  const payload = buildPayload(brainResult);
  const userPrompt = JSON.stringify(payload, null, 2);

  try {
    // 3. Call the language model.
    const responseText = await llmClientCall(SYSTEM_PROMPT, userPrompt);

    // 4. Strip any stray markdown fences and parse strict JSON.
    const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJsonText);

    const out: CmoNarration = {
      campaignId: brainResult.campaignId,
      arabicTitle: parsed.title || 'تحديث استراتيجي للحملة',
      arabicNarration: parsed.narration || responseText,
    };

    // Only surface creativeDirective if the model actually produced one
    // OR if we have a deterministic directive available from Layer 11.
    if (typeof parsed.creativeDirective === 'string' && parsed.creativeDirective.length > 0) {
      out.creativeDirective = parsed.creativeDirective;
    } else if (brainResult.v2?.resonance.creativeDirective) {
      out.creativeDirective = brainResult.v2.resonance.creativeDirective;
    }

    return out;

  } catch (error) {
    // 5. Production-safe fallback — degrades gracefully if LLM fails or returns malformed JSON.
    console.error(`[Claude CMO] LLM Generation failed for campaign ${brainResult.campaignId}`, error);

    const fallback: CmoNarration = {
      campaignId: brainResult.campaignId,
      arabicTitle: 'إشعار استراتيجي آلي',
      arabicNarration: `قام النظام الآلي باتخاذ إجراء (${brainResult.decision.action}) استناداً إلى أداء المزاد ومؤشرات الثقة الحالية. يرجى مراجعة تفاصيل الحملة في لوحة التحكم.`,
    };

    if (brainResult.v2?.resonance.creativeDirective) {
      fallback.creativeDirective = brainResult.v2.resonance.creativeDirective;
    }

    return fallback;
  }
}
