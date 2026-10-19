import { z } from "zod";

// ── Input ────────────────────────────────────────────────────────────────

import { CLIENT_EVENT_NAMES, GOALS, INDUSTRIES, LIMITS, type Goal, type Industry } from "./constants";
export * from "./constants";

const industryValues = INDUSTRIES.map((i) => i.value) as [Industry, ...Industry[]];
const goalValues = GOALS.map((g) => g.value) as [Goal, ...Goal[]];

export const analysisInputSchema = z.object({
  industry: z.enum(industryValues),
  goal: z.enum(goalValues),
  adCopy: z.string().trim().max(LIMITS.adCopy).optional().default(""),
  audience: z.string().trim().max(LIMITS.audience).optional().default(""),
  additionalContext: z.string().trim().max(LIMITS.additionalContext).optional().default(""),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  turnstileToken: z.string().max(4096).optional().default(""),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;

// ── Report ───────────────────────────────────────────────────────────────

export const assessmentStatus = z.enum(["strong", "needs_improvement", "not_assessed"]);
export const evidenceSource = z.enum(["image", "ad_copy", "business_context"]);
export const priority = z.enum(["high", "medium", "low"]);
export type AssessmentStatus = z.infer<typeof assessmentStatus>;
export type EvidenceSource = z.infer<typeof evidenceSource>;
export type AnalysisMode = "image_and_text" | "image_only" | "text_only";

const short = (max: number) => z.string().trim().min(1).max(max);

const assessmentItem = z.object({
  status: assessmentStatus,
  observation: short(400),
  evidenceSource,
  improvement: z.string().trim().max(400).optional(),
});
export type AssessmentItem = z.infer<typeof assessmentItem>;

const issue = z.object({
  priority,
  observation: short(400),
  evidenceSource,
  whyItMatters: short(400),
  recommendedChange: short(400),
});
export type Issue = z.infer<typeof issue>;

/** What the provider must return (validated before anything is stored). */
export const providerReportSchema = z.object({
  summary: short(400),
  perceivedMessage: short(400),
  primaryIssue: z.string().trim().max(400).nullable(),
  imageTextLegibility: z.enum(["clear", "partially_legible", "illegible", "no_text_in_image", "no_image"]),
  factsReadFromImage: z.array(short(200)).max(8),
  assessments: z.object({
    hook: assessmentItem,
    messageClarity: assessmentItem,
    visualReadability: assessmentItem,
    callToAction: assessmentItem,
  }),
  issues: z.array(issue).max(3),
  actionItems: z.array(short(300)).min(2).max(3),
  improvedCopy: z.object({
    opening: short(300),
    body: short(1200),
    headline: short(120),
    callToAction: short(80),
  }),
  missingInformation: z.array(short(200)).max(5),
  limitations: z.array(short(300)).max(4),
  shareableTips: z.array(short(200)).max(3),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ProviderReport = z.infer<typeof providerReportSchema>;

export interface AnalysisReport extends Omit<ProviderReport, "shareableTips"> {
  schemaVersion: "1";
  id: string;
  mode: AnalysisMode;
  industry: Industry;
  goal: Goal;
  createdAt: string;
  expiresAt: string;
  /** Sanitized, store-detail-free tips — the only free text a share link may carry. */
  shareableTips: string[];
}

/** The public share DTO — built from an allowlist, never by hiding fields. */
export interface PublicShareView {
  createdAt: string;
  mode: AnalysisMode;
  axes: Record<"hook" | "messageClarity" | "visualReadability" | "callToAction", AssessmentStatus>;
  tips: string[];
}

// ── API envelopes ────────────────────────────────────────────────────────

export type ErrorCode =
  | "INVALID_INPUT"
  | "SESSION_REQUIRED"
  | "VERIFICATION_FAILED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "HEIC_UNSUPPORTED"
  | "QUOTA_EXCEEDED"
  | "SERVICE_DAILY_LIMIT"
  | "RATE_LIMITED"
  | "ANALYSIS_UNAVAILABLE"
  | "ANALYSIS_DISABLED"
  | "REPORT_NOT_FOUND"
  | "REQUEST_IN_PROGRESS"
  | "IDEMPOTENCY_CONFLICT"
  | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND"
  | "INTERNAL"
  | "LOGIN_REQUIRED"
  | "AUTH_UNAVAILABLE"
  | "FREE_QUOTA_EXHAUSTED"
  | "PAID_CONSENT_REQUIRED"
  | "PRICE_CHANGED"
  | "INSUFFICIENT_CREDITS"
  | "PAYMENTS_UNAVAILABLE"
  | "PAYMENT_NOT_FOUND";

export interface ApiError {
  error: { code: ErrorCode; message: string; requestId: string; retryAfter?: number; retryable?: boolean };
}

export interface SessionInfo {
  quota: { limit: number; used: number; remaining: number; resetsAt: string | null };
  turnstileSiteKey: string;
  analysisAvailable: boolean;
  /** Accounts mode: checks need a Google login and run on the account's credits. */
  accounts: { enabled: boolean; loginAvailable: boolean; loggedIn: boolean; paymentsEnabled: boolean };
}

export interface ShareInfo {
  url: string;
  createdAt: string;
}

export const clientEventSchema = z
  .object({
    name: z.enum(CLIENT_EVENT_NAMES),
    analysisId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  })
  .strict();

// ── V2 report (Analyzer V2) ──────────────────────────────────────────────
// V1 reports stay readable: the client renders by schemaVersion.

export const DIMENSION_IDS = ["offer_clarity", "cta", "opening", "legibility", "consistency", "sound_off", "details", "safe_zone", "brand"] as const;
export type DimensionId = (typeof DIMENSION_IDS)[number];
export const dimensionStatus = z.enum(["strong", "needs_improvement", "unknown", "not_applicable"]);
export type DimensionStatus = z.infer<typeof dimensionStatus>;
export const evidenceKind = z.enum(["user_supplied", "visible_text", "visual_observation", "audio_transcript", "measured_metadata"]);
export type EvidenceKind = z.infer<typeof evidenceKind>;
const evidenceId = z.string().regex(/^[UMTVA]\d{1,2}$/);
const ruleId = z.string().regex(/^[A-Z]-[A-Z]+-\d{2}$/);

const providerEvidence = z.object({
  id: z.string().regex(/^[TVA]\d{1,2}$/),
  source: z.enum(["visible_text", "visual_observation", "audio_transcript"]),
  text: short(220),
  location: z.enum(["top", "middle", "bottom", "whole", "unknown"]).optional(),
  /** For visible_text: how large the text is relative to the image. */
  size: z.enum(["large", "medium", "small", "tiny"]).optional(),
  timeSec: z.number().min(0).max(600).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

const providerDimension = z.object({
  dimension: z.enum(DIMENSION_IDS),
  status: dimensionStatus,
  level: z.number().int().min(0).max(4).nullable(),
  evidenceIds: z.array(evidenceId).max(4),
  ruleIds: z.array(ruleId).max(3),
  observation: short(300),
});

const providerFix = z.object({
  dimension: z.enum(DIMENSION_IDS),
  change: short(300),
  why: short(240),
  evidenceIds: z.array(evidenceId).max(4),
  ruleIds: z.array(ruleId).max(3),
});

const copyBlock = z.object({
  opening: short(300),
  body: short(1200),
  headline: short(120),
  callToAction: short(80),
});

export const providerReportV2Schema = z.object({
  evidence: z.array(providerEvidence).max(16),
  imageTextLegibility: z.enum(["clear", "partially_legible", "illegible", "no_text_in_image", "no_image"]),
  summary: short(300),
  perceivedMessage: short(300),
  dimensions: z.array(providerDimension).min(1).max(9),
  fixes: z.array(providerFix).max(3),
  actionSteps: z.array(short(240)).min(1).max(3),
  improvedCopy: copyBlock,
  alternateOpenings: z.array(short(200)).max(2),
  alternateCallsToAction: z.array(short(80)).max(2),
  missingInformation: z.array(short(200)).max(5),
  limitations: z.array(short(300)).max(3),
  shareableTips: z.array(short(200)).max(3),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ProviderReportV2 = z.infer<typeof providerReportV2Schema>;

export interface EvidenceItem {
  id: string;
  source: EvidenceKind;
  text: string;
  location?: "top" | "middle" | "bottom" | "whole" | "unknown";
  size?: "large" | "medium" | "small" | "tiny";
  timeSec?: number | null;
  confidence: "high" | "medium" | "low";
}

export interface DimensionResult {
  dimension: DimensionId;
  labelAr: string;
  weight: number;
  status: DimensionStatus;
  level: number | null;
  evidenceIds: string[];
  ruleIds: string[];
  observation: string;
}

export interface FixResult {
  dimension: DimensionId;
  labelAr: string;
  change: string;
  why: string;
  evidenceIds: string[];
  ruleIds: string[];
}

export interface Citation {
  sourceId: string;
  title: string;
  publisher: string;
  url: string | null;
  evidenceType: string;
  access: "full_text" | "search_excerpt";
  publishedAt: string | null;
  secondaryOnly: boolean;
}

export interface CheckedRule {
  ruleId: string;
  dimension: string;
  principleAr: string;
  judgeability: "detectable" | "inference" | "not_judgeable";
  evidenceStrength: "strong" | "moderate" | "weak" | "hypothesis";
  sourceIds: string[];
}

export interface QualityIndex {
  /** 0–100, server-computed from anchored levels; null when nothing was measurable. */
  value: number | null;
  /** Share of applicable rubric weight that was actually measured (0–1). */
  coverage: number;
  measured: number;
  applicable: number;
  /** Feature flag: the UI shows the number only when true. */
  shown: boolean;
}

export interface MediaInfo {
  kind: "image" | "none";
  width?: number;
  height?: number;
  aspect?: "vertical" | "portrait" | "square" | "landscape";
}

export interface AnalysisReportV2 {
  schemaVersion: "2";
  id: string;
  mode: AnalysisMode;
  industry: Industry;
  goal: Goal;
  createdAt: string;
  expiresAt: string;
  versions: { rubricVersion: string; knowledgeVersion: string; promptVersion: string; providerModel: string | null };
  summary: string;
  perceivedMessage: string;
  imageTextLegibility: ProviderReportV2["imageTextLegibility"];
  media: MediaInfo;
  evidence: EvidenceItem[];
  dimensions: DimensionResult[];
  index: QualityIndex;
  fixes: FixResult[];
  actionSteps: string[];
  originalCopy: string;
  improvedCopy: ProviderReportV2["improvedCopy"];
  alternateOpenings: string[];
  alternateCallsToAction: string[];
  missingInformation: string[];
  limitations: string[];
  checkedRules: CheckedRule[];
  citations: Citation[];
  shareableTips: string[];
  confidence: "high" | "medium" | "low";
}

export type AnyAnalysisReport = AnalysisReport | AnalysisReportV2;
