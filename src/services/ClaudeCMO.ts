// src/services/ClaudeCMO.ts
import { BrainTickResult } from '../engine/AdlyticBrain';

export interface CmoNarration {
  campaignId: string;
  arabicTitle: string;
  arabicNarration: string;
}

/**
 * الطبقة السابعة والنهائية: المدير التسويقي (Claude CMO)
 * ترجمة قرار المحرك الرياضي إلى رسالة استراتيجية للتاجر البشري باللغة العربية.
 */
export async function generateMerchantNarration(
  brainResult: BrainTickResult,
  llmClientCall: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<CmoNarration> {

  // 1. هندسة الأوامر الصارمة (System Prompt) - إجبار النموذج على هيكل JSON
  const systemPrompt = `
You are an elite Arabic Chief Marketing Officer (CMO).
Your task is to analyze the automated media buying decision provided in JSON and translate it into a concise, professional, and empathetic Arabic report for the business owner.

STRICT RULES:
1. Tone: Professional, reassuring, and strategic Arabic. Speak directly to the merchant (e.g., "لقد قمنا...").
2. No Hallucinations: Use ONLY the metrics provided. Do not invent numbers or metrics.
3. Explain the "Why": Translate the "Decision Action" into a clear business rationale.
4. Format Requirement: You MUST output a valid JSON object with exactly two keys: "title" (string) and "narration" (string). DO NOT wrap the JSON in markdown blocks. Output raw JSON only.
`.trim();

  // 2. تجميع البيانات بصيغة نظيفة لتسهيل قراءتها على الـ LLM
  const contextPayload = {
    campaignName: brainResult.campaignName,
    action: brainResult.decision.action,
    pattern: brainResult.pattern.signature,
    physicsScore: brainResult.physics.finalScore,
    confidenceLevel: brainResult.confidence.finalConfidenceScore,
    cpmDeltaPercent: brainResult.physics.costPerMessage.delta,
    ctrDeltaPercent: brainResult.physics.ctr.delta,
    systemReason: brainResult.decision.reason
  };

  const userPrompt = JSON.stringify(contextPayload, null, 2);

  try {
    // 3. استدعاء العقل اللغوي
    const responseText = await llmClientCall(systemPrompt, userPrompt);

    // 4. تنظيف النص تحسباً لهلوسات تنسيق الـ Markdown واستخراج الـ JSON
    const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedResponse = JSON.parse(cleanJsonText);

    return {
      campaignId: brainResult.campaignId,
      arabicTitle: parsedResponse.title || 'تحديث استراتيجي للحملة',
      arabicNarration: parsedResponse.narration || responseText
    };

  } catch (error) {
    // 5. Fallback آمن للإنتاج لمنع توقف النظام بسبب خطأ في الـ LLM أو خطأ في الـ Parse
    console.error(`[Claude CMO] LLM Generation failed for campaign ${brainResult.campaignId}`, error);

    return {
      campaignId: brainResult.campaignId,
      arabicTitle: 'إشعار استراتيجي آلي',
      arabicNarration: `قام النظام الآلي باتخاذ إجراء (${brainResult.decision.action}) استناداً إلى أداء المزاد ومؤشرات الثقة الحالية. يرجى مراجعة تفاصيل الحملة في لوحة التحكم.`
    };
  }
}
