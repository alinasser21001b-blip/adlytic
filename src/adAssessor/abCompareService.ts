import OpenAI from 'openai';

import { CAMPAIGN_GOALS, INDUSTRIES } from './data/meta-metrics';
import { getTrendContext } from './meta-ad-library';
import { abCompareRequestSchema, abCompareResultSchema, type AbCompareResult as AbCompareResultPayload } from './schemas';
import { config } from '../config';

const SYSTEM_PROMPT = `You are a Meta ads creative coach comparing TWO ad variants (A and B) for the same campaign.
Goal: decide which variant is closer to winning patterns in this category (from Meta Ad Library trends) AND explain why in warm Arabic + concise English.
Rules:
- Focus on hook, clarity, visual impact, CTA, and alignment with extracted trends.
- Be specific about which variant is stronger where.
- Return ONLY JSON with the required schema.`;

const RESPONSE_HINT = `Return JSON with this exact structure:
{
  "betterVariant": "A" | "B" | "tie",
  "rationaleAr": string,
  "rationaleEn": string,
  "scores": { "A": number (0-100), "B": number (0-100) }
}`;

export type AbCompareResult =
  | { ok: true; data: AbCompareResultPayload }
  | { ok: false; status: number; error: string; details?: unknown };

export async function runAbCompare(body: unknown): Promise<AbCompareResult> {
  const parsed = abCompareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: 'بيانات غير صالحة',
      details: parsed.error.flatten(),
    };
  }

  const data = parsed.data;
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: 'خدمة الذكاء الاصطناعي غير متوفرة حالياً للمقارنة',
    };
  }

  try {
    const trendContext = await getTrendContext({
      industry: data.industry,
      goal: data.goal,
    });

    const goal = CAMPAIGN_GOALS.find((g) => g.value === data.goal);
    const industry = INDUSTRIES.find((i) => i.value === data.industry);
    const openai = new OpenAI({ apiKey });

    const userText = `Compare two ad variants for the same campaign.

## Context
- Industry: ${industry?.labelEn} (${industry?.labelAr})
- Goal: ${goal?.labelAr}
- Trend summary (EN):
${trendContext.summaryEn}

## Variant A
- Primary text: ${data.creativeA.primaryText || 'Not provided'}
- Headline: ${data.creativeA.headline || 'Not provided'}
- Desired action: ${data.creativeA.desiredAction || 'Not provided'}

## Variant B
- Primary text: ${data.creativeB.primaryText || 'Not provided'}
- Headline: ${data.creativeB.headline || 'Not provided'}
- Desired action: ${data.creativeB.desiredAction || 'Not provided'}

Explain in Arabic (rationaleAr) and English (rationaleEn).`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
      { role: 'system', content: RESPONSE_HINT },
    ];

    const hasImageA = data.creativeA.imageBase64 && data.creativeA.imageMimeType;
    const hasImageB = data.creativeB.imageBase64 && data.creativeB.imageMimeType;

    if (hasImageA || hasImageB) {
      const imageParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
      if (hasImageA) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${data.creativeA.imageMimeType};base64,${data.creativeA.imageBase64}`,
            detail: 'high',
          },
        });
      }
      if (hasImageB) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${data.creativeB.imageMimeType};base64,${data.creativeB.imageBase64}`,
            detail: 'high',
          },
        });
      }
      messages.push({ role: 'user', content: imageParts });
    }

    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsedResult: unknown;
    try {
      parsedResult = JSON.parse(raw);
    } catch {
      return { ok: false, status: 503, error: 'تعذّر تحليل نتيجة المقارنة' };
    }

    const validated = abCompareResultSchema.safeParse(parsedResult);
    if (!validated.success) {
      return {
        ok: false,
        status: 503,
        error: 'نتيجة المقارنة غير صالحة',
        details: validated.error.flatten(),
      };
    }

    return { ok: true, data: validated.data };
  } catch (err) {
    console.error('[ad-assessor] ab-compare error:', err);
    return { ok: false, status: 503, error: 'الخدمة غير متوفرة مؤقتاً' };
  }
}
