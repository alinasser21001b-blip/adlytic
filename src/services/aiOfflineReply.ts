// ════════════════════════════════════════════════════════════════════════
//  src/services/aiOfflineReply.ts
//
//  Deterministic merchant reply when Claude/Anthropic is unavailable.
//  Uses live dashboard diagnoses / merchantTasks — no LLM required.
// ════════════════════════════════════════════════════════════════════════

import type { DashboardDTO } from './getDashboard';
import { classifyLlmError, llmErrorMessage, type LlmErrorCode } from '../lib/llmErrors';

function looksArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

function confLabel(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return '';
  const n = c > 1 ? c / 100 : c;
  const pct = Math.round(Math.max(0, Math.min(1, n)) * 100);
  const level = n >= 0.75 ? 'ثقة عالية' : n >= 0.5 ? 'ثقة متوسطة' : 'ثقة منخفضة';
  return `${level} ${pct}%`;
}

/**
 * Build a plain-Arabic answer from the current diagnosis / task card.
 * Returns null when there is nothing useful to say offline.
 */
export function buildOfflineDiagnosisReply(
  dto: DashboardDTO | null | undefined,
  userMessage: string,
): string | null {
  if (!dto || dto.empty) return null;

  const task = dto.merchantTasks?.[0];
  const diagnosis = dto.diagnoses?.[0];

  const title = task?.title || diagnosis?.name || null;
  const why = task?.why || diagnosis?.narrative || null;
  const action = task?.action || diagnosis?.action || null;
  const expect = task?.expect || null;
  const confidence = task?.confidence ?? diagnosis?.confidence ?? null;

  if (!title || (!why && !action)) return null;

  const conf = confLabel(confidence);
  const lines = [
    `## الوضع`,
    title + (conf ? ` · ${conf}` : ''),
    '',
    `## الدليل / التشخيص`,
    why || 'راجع أرقام لوحة التحكم للتفاصيل.',
    '',
    `## التوصية — ماذا تفعل الآن؟`,
    action || 'افتح المهام في لوحة التحكم وطبّق الخطوة الأولى.',
  ];
  if (expect) {
    lines.push('', `## متى تراجع؟`, expect);
  }
  lines.push(
    '',
    `_ملاحظة: هذا رد من بيانات حسابك مباشرة (بدون نموذج لغوي) لأن المساعد السحابي غير متاح مؤقتاً._`,
  );

  // If the user asked in English, keep Arabic product voice but acknowledge.
  if (!looksArabic(userMessage) && userMessage.trim()) {
    lines.unshift('Here is the current diagnosis from your live account data:', '');
  }

  return lines.join('\n');
}

export function buildAiUnavailableReply(opts: {
  err: unknown;
  dto?: DashboardDTO | null;
  userMessage?: string;
  locale?: 'AR' | 'EN';
}): { reply: string; code: LlmErrorCode; usedOffline: boolean; httpStatus: number } {
  const classified = classifyLlmError(opts.err);
  const locale =
    opts.locale ?? (looksArabic(opts.userMessage || '') ? 'AR' : 'AR');
  const offline = buildOfflineDiagnosisReply(opts.dto ?? null, opts.userMessage || '');
  if (offline) {
    return {
      reply: offline,
      code: classified.code,
      usedOffline: true,
      httpStatus: 200,
    };
  }
  return {
    reply: llmErrorMessage(opts.err, locale),
    code: classified.code,
    usedOffline: false,
    httpStatus: classified.httpStatus,
  };
}
