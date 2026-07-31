import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import argon2 from "argon2";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { config } from "../config";
import type { Database, DbExecutor } from "../db/client";
import { ApiError } from "../errors";
import type { AppVariables, AuthUser, UserRole } from "../types";

export const SESSION_COOKIE_NAME = config.secureCookies
  ? "__Host-dawai_session"
  : "dawai_session";

export interface SessionRow extends AuthUser {
  session_id: string;
  csrf_token_hash: string;
}

function hashSecret(value: string): string {
  return createHash("sha256")
    .update(`${config.sessionPepper}:${value}`)
    .digest("hex");
}

function equalHashes(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function createSession(
  database: DbExecutor,
  userId: string,
  deviceLabel?: string,
): Promise<{ token: string; csrfToken: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();

  await database.query(
    `INSERT INTO sessions
      (id, user_id, token_hash, csrf_token_hash, device_label, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      userId,
      hashSecret(token),
      hashSecret(csrfToken),
      deviceLabel?.slice(0, 120) ?? null,
      expiresAt,
    ],
  );

  return { token, csrfToken, expiresAt };
}

export function setWebSession(
  context: Parameters<typeof setCookie>[0],
  token: string,
  expiresAt: string,
): void {
  setCookie(context, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearWebSession(
  context: Parameters<typeof deleteCookie>[0],
): void {
  deleteCookie(context, SESSION_COOKIE_NAME, {
    secure: config.secureCookies,
    path: "/",
  });
}

export async function resolveSession(
  database: Database,
  token: string,
): Promise<SessionRow | null> {
  const result = await database.query<SessionRow>(
    `SELECT
       u.id, u.role, u.status, u.name, u.email, u.phone,
       s.id AS session_id, s.csrf_token_hash
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.status = 'ACTIVE'
     LIMIT 1`,
    [hashSecret(token)],
  );
  return result.rows[0] ?? null;
}

export function requireAuth(
  database: Database,
  roles?: readonly UserRole[],
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    const cookieToken = getCookie(context, SESSION_COOKIE_NAME);
    const authorization = context.req.header("Authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : undefined;

    if (cookieToken && bearerToken && cookieToken !== bearerToken) {
      throw new ApiError(
        401,
        "CONFLICTING_AUTHENTICATION",
        "تعذر التحقق من الجلسة.",
      );
    }

    const token = bearerToken ?? cookieToken;
    if (!token) {
      throw new ApiError(401, "AUTHENTICATION_REQUIRED", "سجّل الدخول للمتابعة.");
    }

    const row = await resolveSession(database, token);
    if (!row) {
      throw new ApiError(401, "SESSION_INVALID", "انتهت الجلسة أو أُلغيت.");
    }

    if (roles && !roles.includes(row.role)) {
      throw new ApiError(403, "ROLE_FORBIDDEN", "لا تملك صلاحية هذا الإجراء.");
    }

    const method = context.req.method.toUpperCase();
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (cookieToken && mutating) {
      const origin = context.req.header("Origin");
      const csrf = context.req.header("X-CSRF-Token");
      if (
        origin !== config.webOrigin ||
        !csrf ||
        !equalHashes(hashSecret(csrf), row.csrf_token_hash)
      ) {
        throw new ApiError(403, "CSRF_REJECTED", "تعذر التحقق من الطلب الآمن.");
      }
    }

    context.set("user", {
      id: row.id,
      role: row.role,
      status: row.status,
      name: row.name,
      email: row.email,
      phone: row.phone,
    });
    context.set("session", {
      id: row.session_id,
      csrfTokenHash: row.csrf_token_hash,
      usedCookie: Boolean(cookieToken),
    });

    void database.query(
      `UPDATE sessions SET last_seen_at = now()
       WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
      [row.session_id],
    );

    await next();
  };
}

export async function revokeSession(
  database: Database,
  sessionId: string,
): Promise<void> {
  await database.query(
    `UPDATE sessions SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

export async function revokeAllUserSessions(
  database: DbExecutor,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await database.query(
    `UPDATE sessions SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND ($2::text IS NULL OR id <> $2)
     RETURNING id`,
    [userId, exceptSessionId ?? null],
  );
  return result.rowCount;
}

export function hashToken(value: string): string {
  return hashSecret(value);
}

export async function rotateCsrfToken(
  database: Database,
  sessionId: string,
): Promise<string> {
  const csrfToken = randomBytes(24).toString("base64url");
  const result = await database.query(
    `UPDATE sessions SET csrf_token_hash = $1
     WHERE id = $2 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id`,
    [hashSecret(csrfToken), sessionId],
  );
  if (!result.rows[0]) {
    throw new ApiError(401, "SESSION_INVALID", "انتهت الجلسة أو أُلغيت.");
  }
  return csrfToken;
}
