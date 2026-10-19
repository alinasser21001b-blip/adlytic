import { config, HttpError, type Ctx } from "../lib";

export const TURNSTILE_ACTION = "check";

interface SiteverifyResult {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

/**
 * Server-side Turnstile check for a NEW analysis. Fails closed: a missing
 * secret, an unreachable siteverify, a hostname or action mismatch, or a
 * reused/expired token all reject the request before any cost is taken.
 */
export async function verifyTurnstile(c: Ctx, token: string, idempotencyKey: string): Promise<void> {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret || !c.env.TURNSTILE_SITE_KEY) {
    console.error("[turnstile] not configured — refusing new analysis");
    throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: false });
  }
  if (!token) throw new HttpError(403, "VERIFICATION_FAILED", { retryable: true });

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  body.append("idempotency_key", idempotencyKey);
  const ip = c.req.header("cf-connecting-ip");
  if (ip) body.append("remoteip", ip);

  let result: SiteverifyResult;
  try {
    const res = await fetch(config(c.env).turnstileVerifyUrl, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    result = (await res.json()) as SiteverifyResult;
  } catch (err) {
    console.error("[turnstile] siteverify unreachable:", err instanceof Error ? err.message : err);
    throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: true });
  }

  const expectedHost = new URL(c.req.url).hostname;
  if (!result.success) {
    console.warn("[turnstile] rejected:", (result["error-codes"] ?? []).join(","));
    throw new HttpError(403, "VERIFICATION_FAILED", { retryable: true });
  }
  if (result.hostname !== expectedHost || result.action !== TURNSTILE_ACTION) {
    console.warn(`[turnstile] mismatch host=${result.hostname} action=${result.action}`);
    throw new HttpError(403, "VERIFICATION_FAILED", { retryable: true });
  }
}
