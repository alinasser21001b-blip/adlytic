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
  | "INTERNAL";

export interface ApiError {
  error: { code: ErrorCode; message: string; requestId: string; retryAfter?: number; retryable?: boolean };
}

export interface SessionInfo {
  quota: { limit: number; used: number; remaining: number; resetsAt: string | null };
  turnstileSiteKey: string;
  analysisAvailable: boolean;
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
