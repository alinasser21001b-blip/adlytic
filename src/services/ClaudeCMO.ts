// src/services/ClaudeCMO.ts
//
// Layer 7 — Claude CMO (Brain-to-Mouth)
// Translates BrainTickResult into Arabic narration stored in narrationJson.
//
// Pipeline:
//   1. Build anti-hallucination JSON payload (CmoPayload) from BrainTickResult
//   2. EMERGENCY_PAUSE → deterministic template (no LLM)
//   3. Otherwise → LLM with strict system prompt + payload
//   4. Parse V2 narration JSON; fallback safely on error
//
// narrationJson contract (severity/insightType come from snapshot columns, not LLM):
//   { arabicTitle, arabicNarration, creativeDirective? }

import { BrainTickResult } from '../engine/AdlyticBrain';
import { DecisionAction } from '../engine/DecisionEngine';

// ════════════════════════════════════════════════════════════════════════
// Public output contract — persisted to narrationJson (campaignId omitted at write)
// ════════════════════════════════════════════════════════════════════════
export interface CmoNarration {
  campaignId: string;
  arabicTitle: string;
  arabicNarration: string;
  /** Layer 11 creative directive — optional UI sub-line. */
  creativeDirective?: string;
}

/** Strict LLM JSON output — keys match narrationJson field names. */
interface LlmNarrationOutput {
  arabicTitle: string;
  arabicNarration: string;
  creativeDirective?: string;
}

// ════════════════════════════════════════════════════════════════════════
// LLM-facing payload — closed-set strings, numbers, pre-translated Arabic only.
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

  coldStart: boolean;

  scores: {
    physicsFinalScore: number;
    confidenceFinalScore: number;
  };

  deltas: {
    costPerMessagePercent: number;
    ctrPercent: number;
  };

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

  history?: {
    topPerformers: Array<{
      name: string;
      objective: string;
      finalRoas: number | null;
      costPerMessage: number | null;
      keyTrait: string;
    }>;
    recentFailures: Array<{
      name: string;
      finalRoas: number | null;
      lessonArabic: string;
    }>;
  };
}

/** Closed-set historical context block — assembled by the narration cron caller. */
export type CmoHistoryBlock = NonNullable<CmoPayload['history']>;

export function buildPayload(b: BrainTickResult): CmoPayload {
  const baselinesAllZero =
    (b.physics.costPerMessage.baseline || 0) === 0 &&
    (b.physics.ctr.baseline || 0) === 0 &&
    (b.physics.frequency.baseline || 0) === 0;
  const coldStart =
    b.confidence.gatingStatus === 'COLLECTING_DATA' || baselinesAllZero;

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
    coldStart,
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

function buildEmergencyNarration(b: BrainTickResult): CmoNarration {
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
   - The string inside "v2.resonance.directive" is the canonical creative directive. Quote it faithfully in "creativeDirective" when present.

3. STRICT JSON OUTPUT. Output a raw JSON object with EXACTLY these keys:
   { "arabicTitle": string, "arabicNarration": string, "creativeDirective"?: string }
   - No markdown fences. No commentary. No leading/trailing text.
   - Do NOT emit severity, insightType, tickDate, campaignId, or any other keys.
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

═══════════════════════════════════════════════════════════════
COLD-START MODE (applies when payload.coldStart === true)
═══════════════════════════════════════════════════════════════
The campaign has no statistically meaningful history yet — baselines are
zero/missing or the confidence layer is still collecting data. In this mode:
- DO NOT cite any "deltas.*" percentage. They are arithmetically meaningless
  against a zero baseline and would mislead the merchant.
- DO NOT use comparative phrasing such as "ارتفع", "انخفض", "مقارنة بالسابق".
- DO quote raw values from "absolutes.*current" as the *current* reading
  (without a "baseline" or "vs" comparison).
- Frame the narration as an early-collection update. A safe template:
  arabicTitle:     "حملة جديدة: جاري جمع البيانات الأولية"
  arabicNarration: explain that the campaign is still in its learning phase, the
             system is gathering enough impressions to issue trustworthy
             recommendations, and the current absolute readings so far.
- Tone: مطمئن، صبور، شفّاف. لا توصِ بتغييرات جذرية في هذه المرحلة.

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
HISTORICAL CONTEXT (apply only if "history" is present)
═══════════════════════════════════════════════════════════════
When the payload includes a "history" block, you MAY weave at most ONE
comparative sentence into arabicNarration — for example:
"حملتك الحالية تشبه «<name>» التي حققت أفضل أداء سابق…"
- Use ONLY names, finalRoas, costPerMessage, keyTrait, and lessonArabic
  values present in history.*. Never invent a comparison or trait.
- Quote keyTrait and lessonArabic verbatim or with minimal rephrasing —
  they are engine-pre-translated Arabic, same as v2.dna.deviations[].
- Do NOT cite any number not explicitly in the history block.
- Keep the total arabicNarration within the 2–4 sentence budget above;
  the historical sentence replaces one generic sentence, not an addition.

═══════════════════════════════════════════════════════════════
LENGTH
═══════════════════════════════════════════════════════════════
- arabicTitle: 3–7 كلمات عربية واضحة
- arabicNarration: 2–4 جمل عربية متماسكة
- creativeDirective (إن وُجد): جملة أو جملتان قابلتان للتنفيذ مباشرة
`.trim();

function stripMarkdownFences(text: string): string {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

function parseLlmNarrationOutput(raw: unknown): LlmNarrationOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('LLM output is not a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  const arabicTitle = obj['arabicTitle'];
  const arabicNarration = obj['arabicNarration'];
  if (typeof arabicTitle !== 'string' || arabicTitle.trim().length === 0) {
    throw new Error('LLM output missing non-empty arabicTitle');
  }
  if (typeof arabicNarration !== 'string' || arabicNarration.trim().length === 0) {
    throw new Error('LLM output missing non-empty arabicNarration');
  }

  const out: LlmNarrationOutput = {
    arabicTitle: arabicTitle.trim(),
    arabicNarration: arabicNarration.trim(),
  };

  const directive = obj['creativeDirective'];
  if (typeof directive === 'string' && directive.trim().length > 0) {
    out.creativeDirective = directive.trim();
  }

  return out;
}

function buildFallbackNarration(b: BrainTickResult): CmoNarration {
  const fallback: CmoNarration = {
    campaignId: b.campaignId,
    arabicTitle: 'إشعار استراتيجي آلي',
    arabicNarration:
      `قام النظام الآلي باتخاذ إجراء (${b.decision.action}) استناداً إلى أداء المزاد ومؤشرات الثقة الحالية. ` +
      'يرجى مراجعة تفاصيل الحملة في لوحة التحكم.',
  };

  if (b.v2?.resonance.creativeDirective) {
    fallback.creativeDirective = b.v2.resonance.creativeDirective;
  }

  return fallback;
}

function attachCreativeDirective(
  out: CmoNarration,
  brainResult: BrainTickResult,
  llmDirective?: string,
): void {
  if (llmDirective) {
    out.creativeDirective = llmDirective;
  } else if (brainResult.v2?.resonance.creativeDirective) {
    out.creativeDirective = brainResult.v2.resonance.creativeDirective;
  }
}

export async function generateMerchantNarration(
  brainResult: BrainTickResult,
  llmClientCall: (systemPrompt: string, userPrompt: string) => Promise<string>,
  history?: CmoHistoryBlock,
): Promise<CmoNarration> {
  if (brainResult.decision.action === 'EMERGENCY_PAUSE') {
    return buildEmergencyNarration(brainResult);
  }

  const payload = history
    ? { ...buildPayload(brainResult), history }
    : buildPayload(brainResult);
  const userPrompt = JSON.stringify(payload, null, 2);

  try {
    const responseText = await llmClientCall(SYSTEM_PROMPT, userPrompt);
    const parsed = parseLlmNarrationOutput(JSON.parse(stripMarkdownFences(responseText)));

    const out: CmoNarration = {
      campaignId: brainResult.campaignId,
      arabicTitle: parsed.arabicTitle,
      arabicNarration: parsed.arabicNarration,
    };
    attachCreativeDirective(out, brainResult, parsed.creativeDirective);

    return out;
  } catch (error) {
    console.error(
      `[Claude CMO] LLM Generation failed for campaign ${brainResult.campaignId}`,
      error,
    );
    return buildFallbackNarration(brainResult);
  }
}
