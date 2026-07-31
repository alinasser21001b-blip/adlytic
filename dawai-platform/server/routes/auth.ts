import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import {
  clearWebSession,
  createSession,
  hashPassword,
  normalizeEmail,
  requireAuth,
  revokeSession,
  rotateCsrfToken,
  setWebSession,
  verifyPassword,
} from "../security/auth";
import { enforceRateLimit } from "../security/rate-limit";
import { writeAudit } from "../services/audit";
import type { AppVariables, UserRole } from "../types";

const registerSchema = z
  .object({
    role: z.enum(["PATIENT", "PHARMACY"]),
    name: z.string().trim().min(2).max(120),
    email: z.string().email().max(254),
    phone: z.string().trim().min(8).max(20).optional(),
    password: z.string().min(10).max(128),
    clientType: z.enum(["web", "mobile"]).default("web"),
    deviceLabel: z.string().max(120).optional(),
  })
  .strict();

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
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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

  return routes;
}
