import { getCookie, setCookie } from "hono/cookie";
import type { SessionInfo } from "../../shared/schemas";
import { currentUser } from "./auth";
import { providerBlocked } from "./events";
import { paymentsReady } from "./payments";
import { clientIp, config, hmacHex, HttpError, QUOTA_WINDOW_MS, randomToken, sha256Hex, takeRateSlot, utcDay, type Ctx } from "../lib";

const COOKIE = "ac_sid";
const COOKIE_MAX_AGE_S = 60 * 86_400;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Resolve the caller's visitor id from the HttpOnly cookie, or null. */
export async function currentVisitor(c: Ctx): Promise<string | null> {
  const token = getCookie(c, COOKIE);
  if (!token || !TOKEN_RE.test(token)) return null;
  const id = await sha256Hex(token);
  const now = Date.now();
  const row = await c.env.DB.prepare("SELECT last_seen_at FROM visitors WHERE id = ?1").bind(id).first<{ last_seen_at: number }>();
  if (!row) return null;
  if (now - row.last_seen_at > 3_600_000) {
    await c.env.DB.prepare("UPDATE visitors SET last_seen_at = ?2 WHERE id = ?1").bind(id, now).run();
  }
  return id;
}

export async function requireVisitor(c: Ctx): Promise<string> {
  const id = await currentVisitor(c);
  if (!id) throw new HttpError(401, "SESSION_REQUIRED");
  return id;
}

/**
 * Create a visitor, guarded by a service-wide daily ceiling and a lenient
 * per-network hourly limit (HMAC of the IP with a day-rotated salt — the raw
 * IP is never stored).
 */
export async function createVisitor(c: Ctx): Promise<string> {
  const cfg = config(c.env);
  const now = Date.now();
  if (!(await takeRateSlot(c.env.DB, "sessions:global", 86_400_000, cfg.maxNewSessionsPerDay, now))) {
    throw new HttpError(429, "RATE_LIMITED", { retryAfter: 3600 });
  }
  const ip = clientIp(c);
  if (ip && c.env.IP_HASH_SECRET) {
    const ipKey = await hmacHex(c.env.IP_HASH_SECRET, `${utcDay(now)}|${ip}`);
    if (!(await takeRateSlot(c.env.DB, `sessions:ip:${ipKey.slice(0, 32)}`, 3_600_000, cfg.maxSessionsPerIpHour, now))) {
      throw new HttpError(429, "RATE_LIMITED", { retryAfter: 900 });
    }
  }
  const token = randomToken(32);
  const id = await sha256Hex(token);
  await c.env.DB.prepare("INSERT INTO visitors (id, created_at, last_seen_at) VALUES (?1, ?2, ?2)").bind(id, now).run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return id;
}

/** Usage counted against the weekly quota: completed checks (deleted or not) + live reservations. */
export async function quotaFor(db: D1Database, visitorId: string, limit: number, now: number) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS used, MIN(created_at) AS oldest FROM analyses
       WHERE visitor_id = ?1 AND created_at > ?2
         AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > ?3))`,
    )
    .bind(visitorId, now - QUOTA_WINDOW_MS, now)
    .first<{ used: number; oldest: number | null }>();
  const used = row?.used ?? 0;
  const resetsAtMs = row?.oldest != null ? row.oldest + QUOTA_WINDOW_MS : null;
  return { limit, used, remaining: Math.max(0, limit - used), resetsAtMs };
}

export async function sessionInfo(c: Ctx, visitorId: string): Promise<SessionInfo> {
  const cfg = config(c.env);
  const q = await quotaFor(c.env.DB, visitorId, cfg.weeklyLimit, Date.now());
  return {
    quota: {
      limit: q.limit,
      used: q.used,
      remaining: q.remaining,
      resetsAt: q.resetsAtMs != null ? new Date(q.resetsAtMs).toISOString() : null,
    },
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? "",
    analysisAvailable:
      cfg.analysisEnabled && Boolean(c.env.ANTHROPIC_API_KEY) && Boolean(c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY) && !(await providerBlocked(c.env.DB)),
    accounts: {
      enabled: cfg.accountsEnabled,
      loginAvailable: cfg.accountsEnabled && Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
      loggedIn: Boolean(await currentUser(c)),
      paymentsEnabled: paymentsReady(c.env),
    },
    videoEnabled: cfg.videoEnabled,
  };
}
