import OpenAI from 'openai';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

import { buildCuratedTrendSummary, getIndustryTrends } from './data/industry-trends';
import {
  buildAssessmentSystemPrompt,
  buildAssessmentUserPrompt,
} from './assessment-prompt';
import { buildFallbackAssessment } from './fallback-assessment';
import { getTrendContext, type TrendInsights } from './meta-ad-library';
import {
  assessRequestSchema,
  assessmentResultSchema,
  campaignGoalSchema,
  type AssessmentResultPayload,
  type AssessRequest,
} from './schemas';
import type { CampaignGoal } from './types';
import { config } from '../config';
import {
  assembleAdlyticAssessmentContext,
  type AdlyticAssessmentContext,
} from './adlyticContext';

const SERVICE_UNAVAILABLE = 'الخدمة غير متوفرة مؤقتاً';

type AssessmentApiResponse = AssessmentResultPayload & {
  trendContext: ReturnType<typeof toTrendContextPayload>;
  analysisMode: 'ai' | 'curated_fallback';
  dataContext?: AdlyticAssessmentContext | null;
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
  "performanceInsight"?: {"ar": string, "en": string} (required when Adlytic live metrics or manual metrics exist)
}`;

const CTA_LABEL_AR: Record<string, string> = {
  SHOP_NOW: 'تسوق الآن',
  LEARN_MORE: 'اعرف المزيد',
  SIGN_UP: 'سجّل الآن',
  BOOK_TRAVEL: 'احجز',
  CONTACT_US: 'تواصل معنا',
  DOWNLOAD: 'حمّل',
  GET_OFFER: 'احصل على العرض',
  GET_QUOTE: 'اطلب عرض سعر',
  APPLY_NOW: 'قدّم الآن',
  BUY_NOW: 'اشترِ الآن',
  ORDER_NOW: 'اطلب الآن',
  SUBSCRIBE: 'اشترك',
  WATCH_MORE: 'شاهد المزيد',
  SEND_MESSAGE: 'أرسل رسالة',
  WHATSAPP_MESSAGE: 'راسل عبر واتساب',
  INSTAGRAM_MESSAGE: 'راسل عبر إنستغرام',
  GET_DIRECTIONS: 'احصل على الاتجاهات',
  CALL_NOW: 'اتصل الآن',
  NO_BUTTON: 'بدون زر',
};

function ctaLabelAr(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const key = String(raw).toUpperCase();
  return CTA_LABEL_AR[key] || String(raw).replace(/_/g, ' ');
}

/** Fetch a remote creative thumbnail into base64 for vision analysis. */
async function fetchThumbnailAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (contentType && !contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Cap at ~4MB raw to avoid blowing the OpenAI payload.
    if (buf.length < 32 || buf.length > 4 * 1024 * 1024) return null;
    const mimeType = contentType.startsWith('image/') ? contentType : 'image/jpeg';
    return { base64: buf.toString('base64'), mimeType };
  } catch (e) {
    console.warn('[ad-assessor] thumbnail fetch failed:', e);
    return null;
  }
}

function applyAdlyticPrefill(
  data: AssessRequest,
  ctx: AdlyticAssessmentContext,
): AssessRequest {
  const next: AssessRequest = { ...data, creative: { ...data.creative } };

  if (ctx.industryHint && (!next.industry || next.industry === 'other')) {
    next.industry = ctx.industryHint;
  }
  if (ctx.goalHint) next.goal = ctx.goalHint;

  if (ctx.creative) {
    if (!next.creative.primaryText && ctx.creative.primaryText) {
      next.creative.primaryText = ctx.creative.primaryText;
    }
    if (!next.creative.headline && ctx.creative.headline) {
      next.creative.headline = ctx.creative.headline;
    }
    if (!next.creative.desiredAction && ctx.creative.callToActionType) {
      next.creative.desiredAction = ctaLabelAr(ctx.creative.callToActionType);
    }
  }

  const m = ctx.metrics;
  const conversions =
    next.goal === 'leads'
      ? m.leads
      : next.goal === 'sales'
        ? m.purchases
        : m.messages;
  next.metrics = {
    spend: m.spendMajor,
    impressions: m.impressions,
    clicks: m.clicks,
    conversions,
    currency: m.currency,
    roasOrCpl: m.costPerMessage ?? undefined,
  };
  next.hasMetrics = m.impressions > 0 || m.spendMajor > 0 || conversions > 0;

  return next;
}

function enrichFallbackWithAdlytic(
  fallback: AssessmentResultPayload,
  ctx: AdlyticAssessmentContext,
): AssessmentResultPayload {
  const m = ctx.metrics;
  const parts: string[] = [];
  parts.push(
    `خلال آخر ${m.windowDays} يوماً أنفقت حملة «${ctx.campaignName}» ${m.spendMajor} ${m.currency}`,
  );
  if (m.ctr != null) parts.push(`وتفاعل الإعلان ${m.ctr}%`);
  if (m.frequency != null) parts.push(`بتكرار ظهور ${m.frequency}`);
  if (m.costPerMessage != null) {
    parts.push(`وتكلفة النتيجة حوالي ${m.costPerMessage} ${m.currency}`);
  }
  if (ctx.healthScore != null) {
    parts.push(`وصحة الحملة ${ctx.healthScore}/100`);
  }
  if (ctx.diagnoses[0]) {
    parts.push(`وأبرز ملاحظة: ${ctx.diagnoses[0].title}`);
  }

  fallback.performanceInsight = {
    ar: parts.join('، ') + '.',
    en:
      `In the last ${m.windowDays} days, campaign "${ctx.campaignName}" spent ${m.spendMajor} ${m.currency}` +
      (m.ctr != null ? ` with CTR ${m.ctr}%` : '') +
      '.',
  };

  const grounded: Array<{ ar: string; en: string }> = [];
  for (const d of ctx.diagnoses.slice(0, 2)) {
    grounded.push({ ar: d.action, en: d.action });
  }
  if (ctx.brain?.arabicNarration) {
    grounded.push({
      ar: ctx.brain.arabicTitle
        ? `${ctx.brain.arabicTitle}: راجع التوصية في لوحة الحملات.`
        : 'راجع توصية مراقب الذكاء الاصطناعي لهذه الحملة.',
      en: 'Review the AI monitor recommendation for this campaign.',
    });
  }
  if (ctx.selfBenchmark?.recommendations[0]) {
    grounded.push({
      ar: ctx.selfBenchmark.recommendations[0],
      en: ctx.selfBenchmark.recommendations[0],
    });
  }
  if (grounded.length >= 2) {
    const merged = [...grounded, ...fallback.actionItems].slice(0, 5);
    while (merged.length < 3) {
      merged.push(fallback.actionItems[merged.length] || grounded[0]!);
    }
    fallback.actionItems = merged.slice(0, 5);
  }

  return fallback;
}

async function callOpenAI(
  openai: OpenAI,
  data: Parameters<typeof buildAssessmentUserPrompt>[0],
  trendContext: TrendInsights,
  adlyticContext: AdlyticAssessmentContext | null,
  extraInstruction?: string,
): Promise<string | null> {
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: buildAssessmentUserPrompt(data, trendContext, adlyticContext) },
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
      { role: 'system', content: buildAssessmentSystemPrompt(Boolean(adlyticContext)) },
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

export async function runAdAssessment(
  body: unknown,
  opts?: { prisma?: PrismaClient; workspaceId?: string; adAccountId?: string },
): Promise<AssessResult> {
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

  let data = parsedBody.data;
  let adlyticContext: AdlyticAssessmentContext | null = null;

  const workspaceId = opts?.workspaceId || data.workspaceId;
  const campaignId = data.campaignId;
  if (opts?.prisma && workspaceId && opts.adAccountId && campaignId) {
    try {
      adlyticContext = await assembleAdlyticAssessmentContext({
        prisma: opts.prisma,
        workspaceId,
        adAccountId: opts.adAccountId,
        campaignId,
        adId: data.adId,
        windowDays: data.windowDays,
      });
      if (adlyticContext) {
        data = applyAdlyticPrefill(data, adlyticContext);
        // When the merchant picked an existing campaign, pull the stored
        // thumbnail so vision analysis works without a re-upload.
        if (!data.imageBase64 && adlyticContext.creative?.thumbnailUrl) {
          const fetched = await fetchThumbnailAsBase64(adlyticContext.creative.thumbnailUrl);
          if (fetched) {
            data = {
              ...data,
              imageBase64: fetched.base64,
              imageMimeType: fetched.mimeType,
            };
          }
        }
      }
    } catch (e) {
      console.warn('[ad-assessor] failed to assemble Adlytic context:', e);
    }
  }

  try {
    const trendContext = await loadTrendContext(data.industry, data.goal);
    const apiKey = config.openai.apiKey;

    if (!apiKey) {
      console.error('[ad-assessor] OPENAI_API_KEY not configured — using curated fallback');
      let fallback = buildFallbackAssessment(data, trendContext);
      if (adlyticContext) fallback = enrichFallbackWithAdlytic(fallback, adlyticContext);
      return {
        ok: true,
        data: {
          ...fallback,
          trendContext: toTrendContextPayload(trendContext),
          analysisMode: 'curated_fallback',
          dataContext: adlyticContext,
        },
      };
    }

    const openai = new OpenAI({ apiKey });

    try {
      let raw = await callOpenAI(openai, data, trendContext, adlyticContext);
      if (!raw) {
        console.error('[ad-assessor] OpenAI returned empty content — using curated fallback');
        let fallback = buildFallbackAssessment(data, trendContext);
        if (adlyticContext) fallback = enrichFallbackWithAdlytic(fallback, adlyticContext);
        return {
          ok: true,
          data: {
            ...fallback,
            trendContext: toTrendContextPayload(trendContext),
            analysisMode: 'curated_fallback',
            dataContext: adlyticContext,
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
          adlyticContext,
          'Ensure actionItems has 3-5 items, strengths has 2-3, industryTips has 2-4, all scores are 0-100.' +
            (adlyticContext ? ' Include performanceInsight citing Adlytic live metrics.' : ''),
        );
        if (raw) {
          result = parseAssessmentResponse(raw);
        }
      }

      if (result.success) {
        const payload = result.data;
        if (adlyticContext && !payload.performanceInsight) {
          enrichFallbackWithAdlytic(payload, adlyticContext);
        }
        return {
          ok: true,
          data: {
            ...payload,
            trendContext: toTrendContextPayload(trendContext),
            analysisMode: 'ai',
            dataContext: adlyticContext,
          },
        };
      }

      console.error(
        '[ad-assessor] AI response still invalid after retry — using curated fallback:',
        result.error?.flatten?.(),
      );
      let fallback = buildFallbackAssessment(data, trendContext);
      if (adlyticContext) fallback = enrichFallbackWithAdlytic(fallback, adlyticContext);
      return {
        ok: true,
        data: {
          ...fallback,
          trendContext: toTrendContextPayload(trendContext),
          analysisMode: 'curated_fallback',
          dataContext: adlyticContext,
        },
      };
    } catch (error) {
      logOpenAIError(error);

      if (isOpenAIUnavailable(error)) {
        let fallback = buildFallbackAssessment(data, trendContext);
        if (adlyticContext) fallback = enrichFallbackWithAdlytic(fallback, adlyticContext);
        return {
          ok: true,
          data: {
            ...fallback,
            trendContext: toTrendContextPayload(trendContext),
            analysisMode: 'curated_fallback',
            dataContext: adlyticContext,
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
