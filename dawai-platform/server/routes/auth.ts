import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { config } from "../config";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import {
  clearWebSession,
  createSession,
  hashPassword,
  hashToken,
  normalizeEmail,
  requireAuth,
  resolveSession,
  revokeAllUserSessions,
  revokeSession,
  rotateCsrfToken,
  SESSION_COOKIE_NAME,
  setWebSession,
  verifyPassword,
} from "../security/auth";
import { enforceRateLimit } from "../security/rate-limit";
import { writeAudit } from "../services/audit";
import type { AppVariables, UserRole } from "../types";

const LEGAL_VERSIONS = {
  PRIVACY_POLICY: "2026-07-31",
  TERMS_OF_SERVICE: "2026-07-31",
  PHARMACY_TERMS: "2026-07-31",
} as const;

const registerSchema = z
  .object({
    role: z.enum(["PATIENT", "PHARMACY"]),
    name: z.string().trim().min(2).max(120),
    email: z.string().email().max(254),
    phone: z.string().trim().min(8).max(20).optional(),
    password: z.string().min(10).max(128),
    clientType: z.enum(["web", "mobile"]).default("web"),
    deviceLabel: z.string().max(120).optional(),
    acceptPrivacy: z.literal(true),
    acceptTerms: z.literal(true),
    acceptPharmacyTerms: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.role === "PHARMACY" && value.acceptPharmacyTerms !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptPharmacyTerms"],
        message: "موافقة شروط الصيدلية مطلوبة.",
      });
    }
  });

const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
    expectedRole: z.enum(["PATIENT", "PHARMACY", "ADMIN"]).optional(),
    clientType: z.enum(["web", "mobile"]).default("web"),
    deviceLabel: z.string().max(120).optional(),
  })
  .strict();

interface LoginUser {
  id: string;
  role: UserRole;
  status: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
}

function ipSubject(request: Request): string {
  if (config.trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "local";
}

export function authRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.post("/register", async (context) => {
    const body = registerSchema.parse(await context.req.json());
    const email = normalizeEmail(body.email);
    await enforceRateLimit(
      database,
      "register",
      `${ipSubject(context.req.raw)}:${email}`,
      5,
      3600,
    );

    const existing = await database.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email],
    );
    if (existing.rowCount > 0) {
      throw new ApiError(
        409,
        "ACCOUNT_EXISTS",
        "يوجد حساب مرتبط بهذا البريد.",
      );
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(body.password);
    await database.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO users
          (id, role, name, email, phone, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          body.role,
          body.name,
          email,
          body.phone ?? null,
          passwordHash,
        ],
      );
      if (body.role === "PATIENT") {
        await transaction.query(
          "INSERT INTO patient_profiles (user_id) VALUES ($1)",
          [userId],
        );
      }
      const consents: Array<[keyof typeof LEGAL_VERSIONS, boolean]> = [
        ["PRIVACY_POLICY", true],
        ["TERMS_OF_SERVICE", true],
        ["PHARMACY_TERMS", body.role === "PHARMACY"],
      ];
      for (const [consentType, accepted] of consents) {
        if (!accepted) continue;
        await transaction.query(
          `INSERT INTO user_consents
            (id, user_id, consent_type, document_version, ip_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            randomUUID(),
            userId,
            consentType,
            LEGAL_VERSIONS[consentType],
            createHash("sha256").update(ipSubject(context.req.raw)).digest("hex"),
          ],
        );
      }
      await writeAudit(transaction, {
        actorUserId: userId,
        actorRole: body.role,
        action: "ACCOUNT_REGISTERED",
        resourceType: "USER",
        resourceId: userId,
        requestId: context.get("requestId"),
      });
    });

    const session = await createSession(database, userId, body.deviceLabel);
    if (body.clientType === "web") {
      setWebSession(context, session.token, session.expiresAt);
    }

    return context.json(
      {
        data: {
          user: {
            id: userId,
            role: body.role,
            name: body.name,
            email,
          },
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
          token: body.clientType === "mobile" ? session.token : undefined,
        },
      },
      201,
    );
  });

  routes.post("/login", async (context) => {
    const body = loginSchema.parse(await context.req.json());
    const email = normalizeEmail(body.email);
    await enforceRateLimit(
      database,
      "login",
      `${ipSubject(context.req.raw)}:${email}`,
      8,
      900,
    );

    const result = await database.query<LoginUser>(
      `SELECT id, role, status, name, email, phone, password_hash
       FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    const valid =
      user &&
      user.status === "ACTIVE" &&
      (await verifyPassword(user.password_hash, body.password));
    if (!valid) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "البريد أو كلمة المرور غير صحيحة.",
      );
    }
    if (body.expectedRole && user.role !== body.expectedRole) {
      throw new ApiError(
        403,
        "ROLE_MISMATCH",
        "استخدم بوابة الحساب المناسبة لهذا الدور.",
      );
    }

    const session = await createSession(database, user.id, body.deviceLabel);
    if (body.clientType === "web") {
      setWebSession(context, session.token, session.expiresAt);
    }
    await writeAudit(database, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "SESSION_CREATED",
      resourceType: "SESSION",
      requestId: context.get("requestId"),
    });

    return context.json({
      data: {
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        token: body.clientType === "mobile" ? session.token : undefined,
      },
    });
  });

  routes.get("/status", async (context) => {
    const cookieToken = getCookie(context, SESSION_COOKIE_NAME);
    const authorization = context.req.header("Authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : undefined;
    if (cookieToken && bearerToken && cookieToken !== bearerToken) {
      return context.json({ data: null });
    }
    const token = bearerToken ?? cookieToken;
    const row = token ? await resolveSession(database, token) : null;
    if (!row) return context.json({ data: null });
    let pharmacy = null;
    if (row.role === "PHARMACY") {
      const result = await database.query(
        `SELECT p.id, p.name, p.verification_status, p.verification_reason,
                b.id AS branch_id, b.district, b.accepting_requests,
                b.operational_status
         FROM pharmacies p
         LEFT JOIN pharmacy_branches b ON b.pharmacy_id = p.id
         WHERE p.owner_user_id = $1 LIMIT 1`,
        [row.id],
      );
      pharmacy = result.rows[0] ?? null;
    }
    return context.json({
      data: {
        user: {
          id: row.id,
          role: row.role,
          status: row.status,
          name: row.name,
          email: row.email,
          phone: row.phone,
        },
        pharmacy,
      },
    });
  });

  routes.get("/me", requireAuth(database), async (context) => {
    const user = context.get("user");
    let pharmacy = null;
    if (user.role === "PHARMACY") {
      const result = await database.query(
        `SELECT p.id, p.name, p.verification_status, p.verification_reason,
                b.id AS branch_id, b.district, b.accepting_requests,
                b.operational_status
         FROM pharmacies p
         LEFT JOIN pharmacy_branches b ON b.pharmacy_id = p.id
         WHERE p.owner_user_id = $1 LIMIT 1`,
        [user.id],
      );
      pharmacy = result.rows[0] ?? null;
    }
    return context.json({ data: { user, pharmacy } });
  });

  routes.get("/csrf", requireAuth(database), async (context) => {
    const csrfToken = await rotateCsrfToken(
      database,
      context.get("session").id,
    );
    return context.json({ data: { csrfToken } });
  });

  routes.post("/logout", requireAuth(database), async (context) => {
    await revokeSession(database, context.get("session").id);
    clearWebSession(context);
    return context.json({ data: { loggedOut: true } });
  });

  routes.post("/logout-all", requireAuth(database), async (context) => {
    const revoked = await revokeAllUserSessions(
      database,
      context.get("user").id,
    );
    clearWebSession(context);
    return context.json({ data: { revoked } });
  });

  /**
   * Password reset request — always returns the same message to avoid email enumeration.
   * In production the opaque token is delivered by the SMS/email provider (external).
   * Non-production returns resetToken for local verification only.
   */
  routes.post("/password-reset/request", async (context) => {
    const body = z
      .object({ email: z.string().email().max(254) })
      .strict()
      .parse(await context.req.json());
    const email = normalizeEmail(body.email);
    await enforceRateLimit(
      database,
      "password-reset",
      `${ipSubject(context.req.raw)}:${email}`,
      5,
      3600,
    );
    const user = await database.query<{ id: string }>(
      `SELECT id FROM users
       WHERE email = $1 AND status = 'ACTIVE' LIMIT 1`,
      [email],
    );
    let resetToken: string | undefined;
    if (user.rows[0]) {
      resetToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(
        Date.now() + config.passwordResetTtlMinutes * 60_000,
      ).toISOString();
      await database.query(
        `UPDATE password_reset_tokens SET used_at = now()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.rows[0].id],
      );
      await database.query(
        `INSERT INTO password_reset_tokens
          (id, user_id, token_hash, expires_at, requested_ip_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          user.rows[0].id,
          hashToken(resetToken),
          expiresAt,
          createHash("sha256").update(ipSubject(context.req.raw)).digest("hex"),
        ],
      );
      await writeAudit(database, {
        actorUserId: user.rows[0].id,
        actorRole: undefined,
        action: "PASSWORD_RESET_REQUESTED",
        resourceType: "USER",
        resourceId: user.rows[0].id,
        requestId: context.get("requestId"),
      });
    }
    return context.json({
      data: {
        accepted: true,
        message:
          "إن وُجد حساب بهذا البريد ستصلك تعليمات إعادة التعيين خلال دقائق.",
        ...(config.isProtected || !resetToken
          ? {}
          : { resetToken, expiresInMinutes: config.passwordResetTtlMinutes }),
      },
    });
  });

  routes.post("/password-reset/confirm", async (context) => {
    const body = z
      .object({
        token: z.string().min(20).max(200),
        password: z.string().min(10).max(128),
      })
      .strict()
      .parse(await context.req.json());
    await enforceRateLimit(
      database,
      "password-reset-confirm",
      ipSubject(context.req.raw),
      10,
      3600,
    );
    const token = await database.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [hashToken(body.token)],
    );
    if (!token.rows[0]) {
      throw new ApiError(
        400,
        "RESET_TOKEN_INVALID",
        "رابط إعادة التعيين غير صالح أو منتهٍ.",
      );
    }
    const passwordHash = await hashPassword(body.password);
    await database.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE users SET password_hash = $1, updated_at = now()
         WHERE id = $2 AND status = 'ACTIVE'`,
        [passwordHash, token.rows[0].user_id],
      );
      await transaction.query(
        `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`,
        [token.rows[0].id],
      );
      await revokeAllUserSessions(transaction, token.rows[0].user_id);
      await writeAudit(transaction, {
        actorUserId: token.rows[0].user_id,
        action: "PASSWORD_RESET_COMPLETED",
        resourceType: "USER",
        resourceId: token.rows[0].user_id,
        requestId: context.get("requestId"),
      });
    });
    return context.json({ data: { reset: true } });
  });

  routes.post("/account/delete", requireAuth(database), async (context) => {
    const user = context.get("user");
    if (user.role === "ADMIN") {
      throw new ApiError(
        403,
        "ADMIN_DELETE_FORBIDDEN",
        "لا يمكن حذف حساب المشرف بهذه الطريقة.",
      );
    }
    await database.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE users
         SET status = 'DELETED', deleted_at = now(),
             email = $1, updated_at = now()
         WHERE id = $2`,
        [`deleted+${user.id}@dawai.invalid`, user.id],
      );
      await revokeAllUserSessions(transaction, user.id);
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: user.role,
        action: "ACCOUNT_SOFT_DELETED",
        resourceType: "USER",
        resourceId: user.id,
        requestId: context.get("requestId"),
      });
    });
    clearWebSession(context);
    return context.json({ data: { deleted: true } });
  });

  return routes;
}
