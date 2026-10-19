import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config, HttpError, randomToken, sha256Hex, type Ctx } from "../lib";
import { activationStatements } from "./credits";
import { recordEvent } from "./events";
import { createVisitor, currentVisitor } from "./session";

// Google sign-in (OpenID Connect, authorization-code flow with PKCE, state and
// nonce). Only the stable `sub` is kept; no e-mail address or name is stored.
// The code is exchanged server-to-server over TLS with Google's token endpoint,
// which OIDC Core §3.1.3.7 allows as the basis for trusting the ID token's
// issuer; iss, aud, exp and nonce are still checked.

const SESSION_COOKIE = "ac_uid";
const STATE_COOKIE = "ac_oauth";
const SESSION_DAYS = 30;
const TX_TTL_MS = 10 * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface CurrentUser {
  id: string;
  createdAt: number;
}

function secure(c: Ctx): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function callbackUrl(c: Ctx): string {
  return `${new URL(c.req.url).origin}/api/auth/google/callback`;
}

/** Same-origin relative path only; anything else becomes "/". */
export function safeReturnTo(v: string | undefined): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  return /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(v) && v.length <= 200 ? v : "/";
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let s = "";
  for (const b of new Uint8Array(digest)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function loginConfigured(c: Ctx): boolean {
  const cfg = config(c.env);
  return cfg.accountsEnabled && Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);
}

/** GET /api/auth/google/start — top-level navigation; answers with redirects only. */
export async function startGoogleLogin(c: Ctx): Promise<Response> {
  if (!loginConfigured(c)) return c.redirect("/?auth=unavailable", 302);
  const cfg = config(c.env);
  const visitorId = (await currentVisitor(c)) ?? (await createVisitor(c));
  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO oauth_transactions (state_hash, visitor_id, code_verifier, nonce, return_to, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(await sha256Hex(state), visitorId, verifier, nonce, safeReturnTo(c.req.query("returnTo")), now, now + TX_TTL_MS)
    .run();
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: secure(c), sameSite: "Lax", path: "/api/auth", maxAge: TX_TTL_MS / 1000 });
  const url = new URL(cfg.googleAuthUrl);
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(c),
    response_type: "code",
    scope: "openid",
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString(), 302);
}

function fail(c: Ctx, reason: string): Response {
  console.warn(`[auth] login failed reason=${reason}`);
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth", secure: secure(c) });
  return c.redirect(`/?auth=${reason === "cancelled" ? "cancelled" : "failed"}`, 302);
}

interface IdClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email_verified?: boolean;
}

function decodeJwtPayload(jwt: string): IdClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (ch) => ch.charCodeAt(0)));
    return JSON.parse(json) as IdClaims;
  } catch {
    return null;
  }
}

/** GET /api/auth/google/callback */
export async function finishGoogleLogin(c: Ctx): Promise<Response> {
  if (!loginConfigured(c)) return c.redirect("/?auth=unavailable", 302);
  const cfg = config(c.env);
  if (c.req.query("error")) return fail(c, "cancelled");
  const state = c.req.query("state") ?? "";
  const code = c.req.query("code") ?? "";
  const cookieState = getCookie(c, STATE_COOKIE) ?? "";
  if (!TOKEN_RE.test(state) || !code || code.length > 2048 || !timingSafeEqual(state, cookieState)) return fail(c, "state_mismatch");

  // Proof of the guest session: the transaction is bound to the visitor that started it.
  const visitorId = await currentVisitor(c);
  if (!visitorId) return fail(c, "no_guest_session");
  const now = Date.now();
  const stateHash = await sha256Hex(state);
  const tx = await c.env.DB.prepare(
    "SELECT visitor_id, code_verifier, nonce, return_to, expires_at, used_at FROM oauth_transactions WHERE state_hash = ?1",
  )
    .bind(stateHash)
    .first<{ visitor_id: string; code_verifier: string; nonce: string; return_to: string; expires_at: number; used_at: number | null }>();
  if (!tx || tx.used_at || tx.expires_at <= now || tx.visitor_id !== visitorId) return fail(c, "transaction_invalid");
  const claimed = await c.env.DB.prepare("UPDATE oauth_transactions SET used_at = ?2 WHERE state_hash = ?1 AND used_at IS NULL").bind(stateHash, now).run();
  if (claimed.meta.changes !== 1) return fail(c, "transaction_replayed");

  let claims: IdClaims | null = null;
  try {
    const res = await fetch(cfg.googleTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: callbackUrl(c),
        code_verifier: tx.code_verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return fail(c, `token_http_${res.status}`);
    const body = (await res.json()) as { id_token?: string };
    claims = body.id_token ? decodeJwtPayload(body.id_token) : null;
  } catch {
    return fail(c, "token_exchange_error");
  }
  if (!claims) return fail(c, "no_id_token");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!claims.iss || !ISSUERS.has(claims.iss)) return fail(c, "bad_issuer");
  if (!aud.includes(c.env.GOOGLE_CLIENT_ID!)) return fail(c, "bad_audience");
  if (!claims.exp || claims.exp * 1000 < now - 60_000) return fail(c, "expired_token");
  if (!claims.nonce || !timingSafeEqual(claims.nonce, tx.nonce)) return fail(c, "bad_nonce");
  if (!claims.sub || claims.sub.length > 255) return fail(c, "no_subject");

  const userId = await findOrCreateUser(c.env.DB, claims.sub, claims.email_verified === true, now);
  if (!userId) return fail(c, "account_disabled");

  // Move this guest session's reports into the account (proven by the bound transaction).
  await c.env.DB.prepare("UPDATE analyses SET user_id = ?1 WHERE visitor_id = ?2 AND user_id IS NULL").bind(userId, visitorId).run();

  const token = randomToken(32);
  await c.env.DB.prepare("INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * 86_400_000)
    .run();
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth", secure: secure(c) });
  c.executionCtx.waitUntil(recordEvent(c.env.DB, "login_completed", visitorId, null));
  return c.redirect(safeReturnTo(tx.return_to), 302);
}

/** One account per Google `sub`; the activation grant is created in the same transaction. */
async function findOrCreateUser(db: D1Database, sub: string, emailVerified: boolean, now: number): Promise<string | null> {
  const existing = await db
    .prepare("SELECT u.id, u.status FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'google' AND i.subject = ?1")
    .bind(sub)
    .first<{ id: string; status: string }>();
  if (existing) return existing.status === "active" ? existing.id : null;
  const userId = randomToken(16);
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id, created_at, activated_at) VALUES (?1, ?2, ?2)").bind(userId, now),
      db.prepare("INSERT INTO identities (provider, subject, user_id, email_verified, created_at) VALUES ('google', ?1, ?2, ?3, ?4)").bind(sub, userId, emailVerified ? 1 : 0, now),
      ...activationStatements(db, userId, now),
    ]);
    return userId;
  } catch (err) {
    // A concurrent first login for the same `sub` won the race; use its account.
    if (!(err instanceof Error && /UNIQUE|constraint/i.test(err.message))) throw err;
    const row = await db.prepare("SELECT user_id FROM identities WHERE provider = 'google' AND subject = ?1").bind(sub).first<{ user_id: string }>();
    return row?.user_id ?? null;
  }
}

export async function currentUser(c: Ctx): Promise<CurrentUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !TOKEN_RE.test(token)) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.created_at FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2 AND u.status = 'active'`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<{ id: string; created_at: number }>();
  return row ? { id: row.id, createdAt: row.created_at } : null;
}

export async function requireUser(c: Ctx): Promise<CurrentUser> {
  const u = await currentUser(c);
  if (!u) throw new HttpError(401, "LOGIN_REQUIRED");
  return u;
}

/** POST /api/auth/logout */
export async function logout(c: Ctx): Promise<Response> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token && TOKEN_RE.test(token)) {
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL").bind(await sha256Hex(token), Date.now()).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secure(c) });
  return c.body(null, 204);
}
