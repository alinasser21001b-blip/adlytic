import { z } from "zod";

export const campaignGoalSchema = z.enum([
  "sales",
  "traffic",
  "awareness",
  "leads",
]);

export type CampaignGoal = z.infer<typeof campaignGoalSchema>;

export const assessRequestSchema = z.object({
  industry: z.string().min(1, "اختر مجال عملك"),
  goal: campaignGoalSchema,
  targetAudience: z.string().optional(),
  creative: z.object({
    primaryText: z.string().optional(),
    headline: z.string().optional(),
    desiredAction: z.string().optional(),
  }),
  metrics: z
    .object({
      spend: z.number().optional(),
      impressions: z.number().optional(),
      clicks: z.number().optional(),
      conversions: z.number().optional(),
      roasOrCpl: z.number().optional(),
      currency: z.string().default("USD"),
    })
    .optional(),
  hasMetrics: z.boolean().default(false),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
  /** When set, assessment is grounded in live Adlytic campaign data. */
  workspaceId: z.string().optional(),
  campaignId: z.string().optional(),
  adId: z.string().optional(),
  windowDays: z.number().int().min(7).max(90).optional(),
});

export type AssessRequest = z.infer<typeof assessRequestSchema>;

const breakdownItemSchema = z.object({
  score: z.number().min(0).max(100),
  labelAr: z.string(),
  labelEn: z.string(),
  explanationAr: z.string(),
  explanationEn: z.string(),
});

const bilingualSchema = z.object({ ar: z.string(), en: z.string() });

export const trendContextSchema = z.object({
  source: z.enum(["meta_ad_library", "curated_fallback"]),
  summaryAr: z.string(),
  summaryEn: z.string(),
  hooks: z.array(z.string()),
  ctaPatterns: z.array(z.string()),
  themes: z.array(z.string()),
  exampleAds: z.array(
    z.object({
      pageName: z.string(),
      body: z.string(),
      headline: z.string().optional(),
    }),
  ),
  totalAdsAnalyzed: z.number(),
});

export type TrendContextPayload = z.infer<typeof trendContextSchema>;

export const assessmentResultSchema = z.object({
  audienceMessage: bilingualSchema,
  summaryAr: z.string(),
  summaryEn: z.string(),
  creativeBreakdown: z.object({
    hook: breakdownItemSchema,
    messageClarity: breakdownItemSchema,
    visualImpact: breakdownItemSchema,
    ctaStrength: breakdownItemSchema,
  }),
  trendComparison: bilingualSchema,
  actionItems: z
    .array(bilingualSchema)
    .min(3)
    .max(5),
  industryTips: z.array(bilingualSchema),
  strengths: z.array(bilingualSchema),
  performanceInsight: bilingualSchema.optional(),
});

export type AssessmentResultPayload = z.infer<typeof assessmentResultSchema>;

export const assessmentResponseSchema = assessmentResultSchema.extend({
  trendContext: trendContextSchema,
});

export type AssessmentResponsePayload = z.infer<typeof assessmentResponseSchema>;
