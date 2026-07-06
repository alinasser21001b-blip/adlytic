import OpenAI from 'openai';
import { z } from 'zod';

import { buildCuratedTrendSummary, getIndustryTrends } from './data/industry-trends';
import {
  buildAssessmentSystemPrompt,
  buildAssessmentUserPrompt,
} from './assessment-prompt';
import { buildFallbackAssessment } from './fallback-assessment';
import { getTrendContext, type TrendInsights } from './meta-ad-library';
import { assessRequestSchema, assessmentResultSchema, campaignGoalSchema, type AssessmentResponsePayload } from './schemas';
import type { CampaignGoal } from './types';
import type { AssessmentResultPayload } from './schemas';
import { config } from '../config';

const SERVICE_UNAVAILABLE = 'الخدمة غير متوفرة مؤقتاً';

type AssessmentApiResponse = AssessmentResultPayload & {
  trendContext: ReturnType<typeof toTrendContextPayload>;
  analysisMode: 'ai' | 'curated_fallback';
};

function buildCuratedTrendContext(industry: string, goal: CampaignGoal): TrendInsights {
  const curated = getIndustryTrends(industry);
  const fallback = buildCuratedTrendSummary(industry, goal);
  return {
    source: 'curated_fallback',
    ...fallback,
    totalAdsAnalyzed: 0,
    themes: [...fallback.themes, ...curated.whatWorksMena.map((w) => w.ar)].slice(0, 6),
  };
}

async function loadTrendContext(industry: string, goal: CampaignGoal): Promise<TrendInsights> {
  try {
    return await getTrendContext({ industry, goal });
  } catch (error) {
    console.error('[ad-assessor] Ad Library trend fetch failed, using curated fallback:', error);
    return buildCuratedTrendContext(industry, goal);
  }
}

function isOpenAIUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const status = (error as { status?: number }).status;
  return status === 401 || status === 403 || status === 429 || status === 500 || status === 503;
}

function logOpenAIError(error: unknown): void {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const apiError = error as { status?: number; code?: string; type?: string; message?: string };
    console.error('[ad-assessor] OpenAI API error:', {
      status: apiError.status,
      code: apiError.code,
      type: apiError.type,
      message: apiError.message,
    });
    return;
  }
  console.error('[ad-assessor] Unexpected error:', error);
}

const RESPONSE_SCHEMA_HINT = `Return JSON with this exact structure:
{
  "audienceMessage": {"ar": string, "en": string},
  "summaryAr": string,
  "summaryEn": string,
  "creativeBreakdown": {
    "hook": {"score": number, "labelAr": "الافتتاحية", "labelEn": "Hook", "explanationAr": string, "explanationEn": string},
    "messageClarity": {"score": number, "labelAr": "وضوح الرسالة", "labelEn": "Message Clarity", "explanationAr": string, "explanationEn": string},
    "visualImpact": {"score": number, "labelAr": "التأثير البصري", "labelEn": "Visual Impact", "explanationAr": string, "explanationEn": string},
    "ctaStrength": {"score": number, "labelAr": "قوة الدعوة للإجراء", "labelEn": "CTA Strength", "explanationAr": string, "explanationEn": string}
  },
  "trendComparison": {"ar": string, "en": string},
  "actionItems": [{"ar": string, "en": string}] (3-5 items),
  "industryTips": [{"ar": string, "en": string}] (2-4 items),
  "strengths": [{"ar": string, "en": string}] (2-3 items),
  "performanceInsight"?: {"ar": string, "en": string} (only if metrics provided)
}`;

async function callOpenAI(
  openai: OpenAI,
  data: Parameters<typeof buildAssessmentUserPrompt>[0],
  trendContext: TrendInsights,
  extraInstruction?: string,
): Promise<string | null> {
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: buildAssessmentUserPrompt(data, trendContext) },
  ];

  if (data.imageBase64 && data.imageMimeType) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${data.imageMimeType};base64,${data.imageBase64}`,
        detail: 'high',
      },
    });
  }

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildAssessmentSystemPrompt() },
      { role: 'user', content: userContent },
      {
        role: 'system',
        content: extraInstruction
          ? `${RESPONSE_SCHEMA_HINT}\n\nFix validation issues:\n${extraInstruction}`
          : RESPONSE_SCHEMA_HINT,
      },
    ],
  });

  return completion.choices[0]?.message?.content ?? null;
}

function parseAssessmentResponse(raw: string) {
  try {
    const json = JSON.parse(raw);
    return assessmentResultSchema.safeParse(json);
  } catch (error) {
    console.error('[ad-assessor] Failed to parse OpenAI JSON:', error);
    return { success: false as const, error: null };
  }
}

function toTrendContextPayload(trendContext: TrendInsights) {
  return {
    source: trendContext.source,
    summaryAr: trendContext.summaryAr,
    summaryEn: trendContext.summaryEn,
    hooks: trendContext.hooks,
    ctaPatterns: trendContext.ctaPatterns,
    themes: trendContext.themes,
    exampleAds: trendContext.exampleAds,
    totalAdsAnalyzed: trendContext.totalAdsAnalyzed,
  };
}

export type AssessResult =
  | { ok: true; data: AssessmentApiResponse }
  | { ok: false; status: number; error: string; details?: unknown };

export async function runAdAssessment(body: unknown): Promise<AssessResult> {
  const parsedBody = assessRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    console.warn('[ad-assessor] Validation failed:', parsedBody.error.flatten());
    return {
      ok: false,
      status: 400,
      error: 'بيانات غير صالحة',
      details: parsedBody.error.flatten(),
    };
  }

  const data = parsedBody.data;

  try {
    const trendContext = await loadTrendContext(data.industry, data.goal);
    const apiKey = config.openai.apiKey;

    if (!apiKey) {
      console.error('[ad-assessor] OPENAI_API_KEY not configured — using curated fallback');
      const fallback = buildFallbackAssessment(data, trendContext);
      return {
        ok: true,
        data: {
          ...fallback,
          trendContext: toTrendContextPayload(trendContext),
          analysisMode: 'curated_fallback',
        },
      };
    }

    const openai = new OpenAI({ apiKey });

    try {
      let raw = await callOpenAI(openai, data, trendContext);
      if (!raw) {
        console.error('[ad-assessor] OpenAI returned empty content — using curated fallback');
        const fallback = buildFallbackAssessment(data, trendContext);
        return {
          ok: true,
          data: {
            ...fallback,
            trendContext: toTrendContextPayload(trendContext),
            analysisMode: 'curated_fallback',
          },
        };
      }

      let result = parseAssessmentResponse(raw);
      if (!result.success) {
        console.warn(
          '[ad-assessor] AI response schema mismatch, retrying once:',
          result.error?.flatten?.() ?? 'invalid JSON',
        );
        raw = await callOpenAI(
          openai,
          data,
          trendContext,
          'Ensure actionItems has 3-5 items, strengths has 2-3, industryTips has 2-4, all scores are 0-100.',
        );
        if (raw) {
          result = parseAssessmentResponse(raw);
        }
      }

      if (result.success) {
        return {
          ok: true,
          data: {
            ...result.data,
            trendContext: toTrendContextPayload(trendContext),
            analysisMode: 'ai',
          },
        };
      }

      console.error(
        '[ad-assessor] AI response still invalid after retry — using curated fallback:',
        result.error?.flatten?.(),
      );
      const fallback = buildFallbackAssessment(data, trendContext);
      return {
        ok: true,
        data: {
          ...fallback,
          trendContext: toTrendContextPayload(trendContext),
          analysisMode: 'curated_fallback',
        },
      };
    } catch (error) {
      logOpenAIError(error);

      if (isOpenAIUnavailable(error)) {
        const fallback = buildFallbackAssessment(data, trendContext);
        return {
          ok: true,
          data: {
            ...fallback,
            trendContext: toTrendContextPayload(trendContext),
            analysisMode: 'curated_fallback',
          },
        };
      }

      throw error;
    }
  } catch (error) {
    logOpenAIError(error);
    return { ok: false, status: 503, error: SERVICE_UNAVAILABLE };
  }
}

export async function searchAdLibraryTrends(body: unknown) {
  const searchRequestSchema = z.object({
    industry: z.string().min(1),
    goal: campaignGoalSchema,
    countries: z.array(z.string()).optional(),
  });

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      error: 'بيانات غير صالحة',
      details: parsed.error.flatten(),
    };
  }

  try {
    let trends;
    try {
      trends = await getTrendContext(parsed.data);
    } catch (error) {
      console.error('[ad-assessor] Ad library search failed, using curated fallback:', error);
      const curated = getIndustryTrends(parsed.data.industry);
      const fallback = buildCuratedTrendSummary(parsed.data.industry, parsed.data.goal);
      trends = {
        source: 'curated_fallback' as const,
        ...fallback,
        totalAdsAnalyzed: 0,
        themes: [...fallback.themes, ...curated.whatWorksMena.map((w) => w.ar)].slice(0, 6),
      };
    }
    return { ok: true as const, data: trends };
  } catch (error) {
    console.error('[ad-assessor] Ad library search error:', error);
    return { ok: false as const, status: 503, error: 'الخدمة غير متوفرة مؤقتاً' };
  }
}
