// ════════════════════════════════════════════════════════════════════════
//  src/lib/llmErrors.ts
//
//  Classify Anthropic / LLM provider failures into stable product codes
//  so APIs and UI never leak raw JSON to merchants.
// ════════════════════════════════════════════════════════════════════════

export type LlmErrorCode =
  | 'AI_CREDITS_EXHAUSTED'
  | 'AI_RATE_LIMITED'
  | 'AI_AUTH_FAILED'
  | 'AI_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_UNKNOWN';

export interface ClassifiedLlmError {
  code: LlmErrorCode;
  /** Merchant-facing Arabic message (safe to show). */
  messageAr: string;
  /** Merchant-facing English message. */
  messageEn: string;
  /** HTTP status to return from API routes. */
  httpStatus: 402 | 429 | 503 | 500;
  /** Original provider message (logs only). */
  providerMessage: string;
}

function blobFromUnknown(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const anyErr = err as Error & { error?: unknown; status?: number; statusCode?: number };
    const nested =
      anyErr.error != null
        ? typeof anyErr.error === 'string'
          ? anyErr.error
          : JSON.stringify(anyErr.error)
        : '';
    return `${anyErr.message} ${nested} ${anyErr.status ?? ''} ${anyErr.statusCode ?? ''}`;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function classifyLlmError(err: unknown): ClassifiedLlmError {
  const blob = blobFromUnknown(err);
  const lower = blob.toLowerCase();

  if (
    /credit balance is too low|purchase credits|plans & billing|billing|insufficient.?credit|payment.?required/i.test(
      blob,
    )
  ) {
    return {
      code: 'AI_CREDITS_EXHAUSTED',
      messageAr:
        'المساعد الذكي غير متاح مؤقتاً بسبب نفاد رصيد مزوّد الذكاء الاصطناعي. يمكنك متابعة التشخيص والتوصيات من لوحة التحكم، أو المحاولة لاحقاً بعد تجديد الرصيد.',
      messageEn:
        'The AI assistant is temporarily unavailable because the AI provider balance is exhausted. Use the dashboard diagnosis cards for now, or try again after credits are topped up.',
      httpStatus: 402,
      providerMessage: blob.slice(0, 400),
    };
  }

  if (/rate.?limit|too many requests|429/.test(lower)) {
    return {
      code: 'AI_RATE_LIMITED',
      messageAr: 'وصلنا حد الطلبات مؤقتاً. انتظر دقيقة ثم أعد المحاولة.',
      messageEn: 'We hit a temporary rate limit. Wait a minute and try again.',
      httpStatus: 429,
      providerMessage: blob.slice(0, 400),
    };
  }

  if (/invalid.?api.?key|authentication|unauthorized|401|permission/.test(lower) && /anthropic|api.?key/i.test(blob)) {
    return {
      code: 'AI_AUTH_FAILED',
      messageAr: 'إعدادات المساعد الذكي غير مكتملة حالياً. جرّب لاحقاً أو راجع لوحة التحكم.',
      messageEn: 'AI assistant configuration is incomplete right now. Try later or use the dashboard.',
      httpStatus: 503,
      providerMessage: blob.slice(0, 400),
    };
  }

  if (/timed? ?out|deadline|ETIMEDOUT|AbortError/i.test(blob)) {
    return {
      code: 'AI_TIMEOUT',
      messageAr: 'انتهت مهلة الرد من المساعد الذكي. أعد المحاولة بسؤال أقصر.',
      messageEn: 'The AI assistant timed out. Retry with a shorter question.',
      httpStatus: 503,
      providerMessage: blob.slice(0, 400),
    };
  }

  if (/overloaded|unavailable|503|502|500|internal server/i.test(lower)) {
    return {
      code: 'AI_UNAVAILABLE',
      messageAr: 'المساعد الذكي غير متاح مؤقتاً. جرّب بعد لحظات أو راجع التشخيص في لوحة التحكم.',
      messageEn: 'The AI assistant is temporarily unavailable. Try again shortly or use the dashboard diagnosis.',
      httpStatus: 503,
      providerMessage: blob.slice(0, 400),
    };
  }

  return {
    code: 'AI_UNKNOWN',
    messageAr: 'تعذّر إكمال رد المساعد الآن. جرّب بعد لحظة، أو اسأل من لوحة التحكم عن التشخيص الحالي.',
    messageEn: 'Could not complete the AI reply right now. Try again shortly, or use the dashboard diagnosis.',
    httpStatus: 500,
    providerMessage: blob.slice(0, 400),
  };
}

export function llmErrorMessage(err: unknown, locale: 'AR' | 'EN' = 'AR'): string {
  const c = classifyLlmError(err);
  return locale === 'AR' ? c.messageAr : c.messageEn;
}
