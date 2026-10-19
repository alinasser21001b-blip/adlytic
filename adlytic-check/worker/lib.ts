import type { Context } from "hono";
import type { ErrorCode } from "../shared/schemas";

export type Bindings = Env & {
  ANTHROPIC_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  IP_HASH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ZAINCASH_CLIENT_ID?: string;
  ZAINCASH_CLIENT_SECRET?: string;
  /** Non-production only: point the provider / siteverify / IdP at local doubles. */
  PROVIDER_BASE_URL?: string;
  TURNSTILE_VERIFY_URL?: string;
  GOOGLE_AUTH_URL?: string;
  GOOGLE_TOKEN_URL?: string;
  FREE_REFILL_MS?: string;
};

export type AppEnv = { Bindings: Bindings; Variables: { requestId: string } };
export type Ctx = Context<AppEnv>;

// ── Errors ───────────────────────────────────────────────────────────────

const MESSAGES_AR: Record<ErrorCode, string> = {
  INVALID_INPUT: "بعض البيانات غير مكتملة أو غير صحيحة. راجع الحقول وحاول مرة أخرى.",
  SESSION_REQUIRED: "انتهت جلستك. حدّث الصفحة وحاول مرة أخرى.",
  VERIFICATION_FAILED: "لم نتمكن من التحقق من المتصفح. أعد التحقق وحاول مرة أخرى.",
  FILE_TOO_LARGE: "حجم الصورة أكبر من المسموح (3 ميغابايت). صغّرها أو التقط لقطة شاشة للإعلان.",
  UNSUPPORTED_FILE: "صيغة الملف غير مدعومة. ارفع صورة JPEG أو PNG أو WebP.",
  HEIC_UNSUPPORTED: "صيغة HEIC من الآيفون غير مدعومة حالياً. التقط لقطة شاشة للإعلان أو احفظ الصورة بصيغة JPEG ثم ارفعها.",
  QUOTA_EXCEEDED: "استخدمت كل الفحوص المجانية لهذا الأسبوع. تتجدد الحصة تلقائياً.",
  SERVICE_DAILY_LIMIT: "وصلت الخدمة لحدّها اليومي من التحليلات. حاول غداً — لم تُحتسب هذه المحاولة من حصتك.",
  RATE_LIMITED: "طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.",
  ANALYSIS_UNAVAILABLE: "تعذّر إكمال التحليل الآن. لم تُحتسب المحاولة من حصتك — حاول مرة أخرى.",
  ANALYSIS_DISABLED: "التحليل متوقف مؤقتاً للصيانة. حاول لاحقاً.",
  REPORT_NOT_FOUND: "التقرير غير موجود أو انتهت صلاحيته.",
  REQUEST_IN_PROGRESS: "هذا الطلب قيد التحليل حالياً. انتظر لحظات.",
  IDEMPOTENCY_CONFLICT: "تغيّرت بيانات الطلب أثناء الإرسال. أرسل الفحص من جديد.",
  FORBIDDEN_ORIGIN: "طلب غير مسموح.",
  NOT_FOUND: "المسار غير موجود.",
  INTERNAL: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  LOGIN_REQUIRED: "سجّل الدخول لاستخدام فحوصك المجانية اليومية.",
  AUTH_UNAVAILABLE: "تسجيل الدخول غير متاح حالياً.",
  FREE_QUOTA_EXHAUSTED: "استخدمت فحوصك المجانية. يُضاف فحص مجاني جديد كل 24 ساعة (بحد أقصى فحصين).",
  PAID_CONSENT_REQUIRED: "لا توجد فحوص مجانية متاحة الآن. يمكنك استخدام فحص مدفوع إذا وافقت على ذلك.",
  PRICE_CHANGED: "تغيّر سعر الفحص. راجع السعر الجديد ووافق عليه ثم أعد المحاولة.",
  INSUFFICIENT_CREDITS: "لا يوجد رصيد فحوص مدفوعة كافٍ.",
  PAYMENTS_UNAVAILABLE: "الدفع الإلكتروني غير متاح حالياً.",
  PAYMENT_NOT_FOUND: "عملية الدفع غير موجودة.",
  VIDEO_UNAVAILABLE: "فحص الفيديو غير متاح حالياً. ارفع لقطة شاشة من الإعلان بدلاً منه.",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    public opts: { retryAfter?: number; retryable?: boolean; detail?: string } = {},
  ) {
    super(code);
  }
}

export function errorJson(c: Ctx, err: HttpError): Response {
  const body = {
    error: {
      code: err.code,
      message: MESSAGES_AR[err.code],
      requestId: c.get("requestId") ?? "unknown",
      ...(err.opts.retryAfter != null ? { retryAfter: err.opts.retryAfter } : {}),
      ...(err.opts.retryable != null ? { retryable: err.opts.retryable } : {}),
    },
  };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (err.opts.retryAfter != null) headers["Retry-After"] = String(err.opts.retryAfter);
  return c.json(body, err.status as 400, headers);
}

// ── Config ───────────────────────────────────────────────────────────────

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function config(bindings: Bindings) {
  // Vars are typed as their wrangler.jsonc literals; at runtime they are overridable strings.
  const env = bindings as unknown as Record<string, string | undefined>;
  const production = env.ENVIRONMENT === "production";
  return {
    production,
    model: env.VISION_MODEL || "claude-haiku-4-5",
    analysisEnabled: env.ANALYSIS_ENABLED !== "false",
    analyzer: (env.ANALYZER_VERSION === "v2" ? "v2" : "v1") as "v1" | "v2",
    showQualityIndex: env.SHOW_QUALITY_INDEX === "true",
    weeklyLimit: Math.floor(num(env.FREE_WEEKLY_LIMIT, 3)),
    maxProviderCallsPerDay: Math.floor(num(env.MAX_PROVIDER_CALLS_PER_DAY, 100)),
    maxOutputTokens: Math.floor(num(env.MAX_OUTPUT_TOKENS, 3000)),
    retentionMs: num(env.REPORT_RETENTION_DAYS, 7) * 86_400_000,
    providerTimeoutMs: num(env.PROVIDER_TIMEOUT_MS, 45_000),
    reservationTtlMs: num(env.RESERVATION_TTL_SECONDS, 120) * 1000,
    maxNewSessionsPerDay: Math.floor(num(env.MAX_NEW_SESSIONS_PER_DAY, 3000)),
    maxSessionsPerIpHour: Math.floor(num(env.MAX_SESSIONS_PER_IP_HOUR, 30)),
    // Test doubles are honoured only outside production.
    providerBaseUrl: !production && env.PROVIDER_BASE_URL ? env.PROVIDER_BASE_URL : "https://api.anthropic.com",
    turnstileVerifyUrl:
      !production && env.TURNSTILE_VERIFY_URL
        ? env.TURNSTILE_VERIFY_URL
        : "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    accountsEnabled: env.ACCOUNTS_ENABLED === "true",
    googleAuthUrl: !production && env.GOOGLE_AUTH_URL ? env.GOOGLE_AUTH_URL : "https://accounts.google.com/o/oauth2/v2/auth",
    googleTokenUrl: !production && env.GOOGLE_TOKEN_URL ? env.GOOGLE_TOKEN_URL : "https://oauth2.googleapis.com/token",
    // The 24 h refill period can only be shortened outside production (tests).
    freeRefillMs: !production && env.FREE_REFILL_MS ? num(env.FREE_REFILL_MS, 86_400_000) : 86_400_000,
    paymentsEnabled: env.PAYMENTS_ENABLED === "true",
    videoEnabled: env.VIDEO_ENABLED === "true",
  };
}
export type Config = ReturnType<typeof config>;

export const QUOTA_WINDOW_MS = 7 * 86_400_000;

// ── Crypto ───────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Read a request body with a hard byte ceiling — Content-Length is advisory. */
export async function readBodyLimited(req: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, "FILE_TOO_LARGE");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "FILE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

/** Atomic fixed-window counter. Returns true when the increment was admitted. */
export async function takeRateSlot(db: D1Database, key: string, windowMs: number, limit: number, now: number): Promise<boolean> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const row = await db
    .prepare(
      `INSERT INTO rate_buckets (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 WHERE count < ?3
       RETURNING count`,
    )
    .bind(key, windowStart, limit)
    .first<{ count: number }>();
  return row != null;
}

export function clientIp(c: Ctx): string | null {
  return c.req.header("cf-connecting-ip") ?? null;
}
