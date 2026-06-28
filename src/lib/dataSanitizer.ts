// ════════════════════════════════════════════════════════════════════════
//  src/lib/dataSanitizer.ts
//
//  Strips PII and sensitive identifiers from payloads before they are sent
//  to external LLM providers. Keeps performance metrics, benchmarks, health
//  scores, objective types, and aggregated campaign stats.
// ════════════════════════════════════════════════════════════════════════

import type { DashboardDTO } from '../services/getDashboard';
import type { CmoHistoricalContext } from '../services/getCampaignHistory';

/** Keys removed entirely from objects bound for LLM context. */
const SENSITIVE_KEYS = new Set([
  'id',
  'workspaceId',
  'adAccountId',
  'externalAccountId',
  'campaignId',
  'connectionId',
  'userId',
  'memberId',
  'email',
  'phone',
  'phoneNumber',
  'accessToken',
  'access_token',
  'token',
  'password',
  'iban',
  'accountNumber',
  'routingNumber',
  'ssn',
  'stripeCustomerId',
  'stripeSubscriptionId',
]);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/g;
const META_ACT_ID_RE = /\bact_\d{7,}\b/gi;
const CUID_RE = /\bc[a-z0-9]{20,30}\b/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;

/** Scrub inline PII patterns from free text while preserving metric meaning. */
export function scrubString(text: string): string {
  if (!text) return text;
  return text
    .replace(META_ACT_ID_RE, '[redacted-ad-account]')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]')
    .replace(IBAN_RE, '[redacted-account]')
    .replace(CARD_RE, '[redacted-card]')
    .replace(CUID_RE, '[redacted-id]');
}

/** Deep-clone an arbitrary JSON value, redacting sensitive keys and scrubbing strings. */
export function sanitizeObjectForLlm<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      out[key] = sanitizeValue(child);
    }
    return out;
  }
  return value;
}

/** Dashboard DTO → LLM-safe shape (metrics + labels, no internal ids). */
export function sanitizeDashboardForLlm(dto: DashboardDTO): DashboardDTO {
  const sanitized = sanitizeObjectForLlm(dto) as DashboardDTO;
  if (sanitized.workspace) {
    sanitized.workspace = {
      ...sanitized.workspace,
      name: scrubString(sanitized.workspace.name),
    };
  }
  if (sanitized.bestCampaign) {
    sanitized.bestCampaign = {
      ...sanitized.bestCampaign,
      name: scrubString(sanitized.bestCampaign.name),
    };
  }
  if (sanitized.worstCampaign) {
    sanitized.worstCampaign = {
      ...sanitized.worstCampaign,
      name: scrubString(sanitized.worstCampaign.name),
    };
  }
  return sanitized;
}

/** Historical CMO context — keep traits/lessons, scrub names of PII patterns. */
export function sanitizeCmoHistoricalContext(
  ctx: CmoHistoricalContext,
): CmoHistoricalContext {
  return {
    topPerformers: ctx.topPerformers.map((row) => ({
      ...row,
      name: scrubString(row.name),
      keyTrait: scrubString(row.keyTrait),
      objective: scrubString(row.objective),
    })),
    recentFailures: ctx.recentFailures.map((row) => ({
      ...row,
      name: scrubString(row.name),
      lessonArabic: scrubString(row.lessonArabic),
    })),
  };
}

/** Final gate for any user/assistant context string sent to an LLM. */
export function sanitizeLlmUserContent(text: string): string {
  return scrubString(text);
}
