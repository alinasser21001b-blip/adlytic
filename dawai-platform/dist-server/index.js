import {
  ApiError,
  createNotification,
  deleteEncryptedImage,
  readEncryptedImage,
  runLifecycleSweep,
  storeEncryptedImage
} from "./chunk-VG7NKIZF.js";
import {
  config,
  createDatabase
} from "./chunk-CHICJPPN.js";

// server/index.ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

// server/app.ts
import { randomUUID as randomUUID10 } from "crypto";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Hono as Hono8 } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";

// server/routes/admin.ts
import { randomUUID as randomUUID3 } from "crypto";
import { Hono } from "hono";
import { z } from "zod";

// server/security/auth.ts
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "crypto";
import argon2 from "argon2";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
var COOKIE_NAME = config.secureCookies ? "__Host-dawai_session" : "dawai_session";
function hashSecret(value) {
  return createHash("sha256").update(`${config.sessionPepper}:${value}`).digest("hex");
}
function equalHashes(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function normalizeEmail(email) {
  return email.trim().toLocaleLowerCase("en-US");
}
async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}
async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
async function createSession(database2, userId, deviceLabel) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
  await database2.query(
    `INSERT INTO sessions
      (id, user_id, token_hash, csrf_token_hash, device_label, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      userId,
      hashSecret(token),
      hashSecret(csrfToken),
      (deviceLabel == null ? void 0 : deviceLabel.slice(0, 120)) ?? null,
      expiresAt
    ]
  );
  return { token, csrfToken, expiresAt };
}
function setWebSession(context, token, expiresAt) {
  setCookie(context, COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt)
  });
}
function clearWebSession(context) {
  deleteCookie(context, COOKIE_NAME, {
    secure: config.secureCookies,
    path: "/"
  });
}
async function resolveSession(database2, token) {
  const result = await database2.query(
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
    [hashSecret(token)]
  );
  return result.rows[0] ?? null;
}
function requireAuth(database2, roles) {
  return async (context, next) => {
    const cookieToken = getCookie(context, COOKIE_NAME);
    const authorization = context.req.header("Authorization");
    const bearerToken = (authorization == null ? void 0 : authorization.startsWith("Bearer ")) ? authorization.slice(7).trim() : void 0;
    if (cookieToken && bearerToken && cookieToken !== bearerToken) {
      throw new ApiError(
        401,
        "CONFLICTING_AUTHENTICATION",
        "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062C\u0644\u0633\u0629."
      );
    }
    const token = bearerToken ?? cookieToken;
    if (!token) {
      throw new ApiError(401, "AUTHENTICATION_REQUIRED", "\u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629.");
    }
    const row = await resolveSession(database2, token);
    if (!row) {
      throw new ApiError(401, "SESSION_INVALID", "\u0627\u0646\u062A\u0647\u062A \u0627\u0644\u062C\u0644\u0633\u0629 \u0623\u0648 \u0623\u064F\u0644\u063A\u064A\u062A.");
    }
    if (roles && !roles.includes(row.role)) {
      throw new ApiError(403, "ROLE_FORBIDDEN", "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.");
    }
    const method = context.req.method.toUpperCase();
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (cookieToken && mutating) {
      const origin = context.req.header("Origin");
      const csrf = context.req.header("X-CSRF-Token");
      if (origin !== config.webOrigin || !csrf || !equalHashes(hashSecret(csrf), row.csrf_token_hash)) {
        throw new ApiError(403, "CSRF_REJECTED", "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0622\u0645\u0646.");
      }
    }
    context.set("user", {
      id: row.id,
      role: row.role,
      status: row.status,
      name: row.name,
      email: row.email,
      phone: row.phone
    });
    context.set("session", {
      id: row.session_id,
      csrfTokenHash: row.csrf_token_hash,
      usedCookie: Boolean(cookieToken)
    });
    void database2.query(
      `UPDATE sessions SET last_seen_at = now()
       WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
      [row.session_id]
    );
    await next();
  };
}
async function revokeSession(database2, sessionId) {
  await database2.query(
    `UPDATE sessions SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId]
  );
}
async function rotateCsrfToken(database2, sessionId) {
  const csrfToken = randomBytes(24).toString("base64url");
  const result = await database2.query(
    `UPDATE sessions SET csrf_token_hash = $1
     WHERE id = $2 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id`,
    [hashSecret(csrfToken), sessionId]
  );
  if (!result.rows[0]) {
    throw new ApiError(401, "SESSION_INVALID", "\u0627\u0646\u062A\u0647\u062A \u0627\u0644\u062C\u0644\u0633\u0629 \u0623\u0648 \u0623\u064F\u0644\u063A\u064A\u062A.");
  }
  return csrfToken;
}

// server/services/audit.ts
import { randomUUID as randomUUID2 } from "crypto";
async function writeAudit(database2, input) {
  await database2.query(
    `INSERT INTO audit_events
      (id, actor_user_id, actor_role, action, resource_type, resource_id, result, request_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      randomUUID2(),
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.result ?? "SUCCESS",
      input.requestId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

// server/routes/admin.ts
async function bootstrapAdmin(database2, email, password) {
  if (!email && !password) return;
  if (!email || !password || password.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_REQUIRES_EMAIL_AND_12_CHAR_PASSWORD");
  }
  const normalized = normalizeEmail(email);
  const existing = await database2.query(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [normalized]
  );
  if (existing.rows[0]) return;
  const id = randomUUID3();
  await database2.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO users
        (id, role, name, email, password_hash)
       VALUES ($1, 'ADMIN', 'Dawai Administrator', $2, $3)`,
      [id, normalized, await hashPassword(password)]
    );
    await writeAudit(transaction, {
      actorUserId: id,
      actorRole: "ADMIN",
      action: "ADMIN_BOOTSTRAPPED",
      resourceType: "USER",
      resourceId: id
    });
  });
}
function adminRoutes(database2) {
  const routes = new Hono();
  routes.use("*", requireAuth(database2, ["ADMIN"]));
  routes.get("/dashboard", async (context) => {
    const result = await database2.query(
      `SELECT
         (SELECT count(*)::int FROM users WHERE status = 'ACTIVE') AS active_users,
         (SELECT count(*)::int FROM pharmacies
          WHERE verification_status IN ('PENDING', 'UNDER_REVIEW')) AS pending_verifications,
         (SELECT count(*)::int FROM pharmacies
          WHERE verification_status = 'VERIFIED') AS verified_pharmacies,
         (SELECT count(*)::int FROM medicine_requests
          WHERE status IN ('ACTIVE', 'HOLD_PENDING', 'RESERVED', 'READY')) AS active_requests,
         (SELECT count(*)::int FROM reservations
          WHERE status = 'COMPLETED'
            AND completed_at >= date_trunc('day', now())) AS completed_today,
         (SELECT count(*)::int FROM reports WHERE status = 'OPEN') AS open_reports`
    );
    return context.json({ data: result.rows[0] });
  });
  routes.get("/verifications", async (context) => {
    const status = context.req.query("status") ?? "PENDING";
    if (!["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"].includes(
      status
    )) {
      throw new ApiError(422, "STATUS_INVALID", "\u062D\u0627\u0644\u0629 \u0627\u0644\u062A\u062D\u0642\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
    }
    const result = await database2.query(
      `SELECT
         p.*, b.id AS branch_id, b.name AS branch_name, b.governorate,
         b.district, b.address, b.latitude, b.longitude, b.opening_hours,
         b.pickup_enabled, b.delivery_enabled, u.name AS owner_name,
         u.email AS owner_email, u.phone AS owner_phone,
         (SELECT count(*)::int FROM verification_documents d
          WHERE d.pharmacy_id = p.id) AS document_count
       FROM pharmacies p
       JOIN users u ON u.id = p.owner_user_id
       JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       WHERE p.verification_status = $1
       ORDER BY p.created_at ASC
       LIMIT 100`,
      [status]
    );
    return context.json({ data: result.rows });
  });
  routes.get("/verifications/:pharmacyId", async (context) => {
    const result = await database2.query(
      `SELECT
         p.*, b.id AS branch_id, b.name AS branch_name, b.governorate,
         b.district, b.address, b.landmark, b.latitude, b.longitude,
         b.opening_hours, b.pickup_enabled, b.delivery_enabled,
         u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
       FROM pharmacies p
       JOIN users u ON u.id = p.owner_user_id
       JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       WHERE p.id = $1 LIMIT 1`,
      [context.req.param("pharmacyId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "PHARMACY_NOT_FOUND", "\u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
    }
    const documents = await database2.query(
      `SELECT id, document_type, status, secure_file_id, created_at
       FROM verification_documents WHERE pharmacy_id = $1`,
      [context.req.param("pharmacyId")]
    );
    return context.json({
      data: { ...result.rows[0], documents: documents.rows }
    });
  });
  routes.post("/verifications/:pharmacyId/approve", async (context) => {
    const admin = context.get("user");
    await database2.transaction(async (transaction) => {
      const result = await transaction.query(
        `UPDATE pharmacies
         SET verification_status = 'VERIFIED', verification_reason = NULL,
             verified_at = now(), verified_by = $1, updated_at = now()
         WHERE id = $2
           AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'REJECTED')
         RETURNING owner_user_id`,
        [admin.id, context.req.param("pharmacyId")]
      );
      const pharmacy = result.rows[0];
      if (!pharmacy) {
        throw new ApiError(
          409,
          "VERIFICATION_NOT_APPROVABLE",
          "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0639\u062A\u0645\u0627\u062F \u0647\u0630\u0647 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0645\u0646 \u062D\u0627\u0644\u062A\u0647\u0627 \u0627\u0644\u062D\u0627\u0644\u064A\u0629."
        );
      }
      await transaction.query(
        `UPDATE pharmacy_branches
         SET accepting_requests = true, operational_status = 'ACTIVE',
             updated_at = now()
         WHERE pharmacy_id = $1`,
        [context.req.param("pharmacyId")]
      );
      await createNotification(transaction, {
        userId: pharmacy.owner_user_id,
        eventType: "PHARMACY_VERIFIED",
        title: "\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629",
        body: "\u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0622\u0646 \u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u062F\u0648\u0627\u0621 \u0627\u0644\u0642\u0631\u064A\u0628\u0629.",
        resourceType: "PHARMACY",
        resourceId: context.req.param("pharmacyId")
      });
      await writeAudit(transaction, {
        actorUserId: admin.id,
        actorRole: "ADMIN",
        action: "PHARMACY_VERIFIED",
        resourceType: "PHARMACY",
        resourceId: context.req.param("pharmacyId"),
        requestId: context.get("requestId")
      });
    });
    return context.json({ data: { status: "VERIFIED" } });
  });
  routes.post("/verifications/:pharmacyId/reject", async (context) => {
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).strict().parse(await context.req.json());
    const admin = context.get("user");
    const result = await database2.query(
      `UPDATE pharmacies
       SET verification_status = 'REJECTED', verification_reason = $1,
           verified_by = $2, updated_at = now()
       WHERE id = $3
         AND verification_status IN ('PENDING', 'UNDER_REVIEW')
       RETURNING owner_user_id`,
      [body.reason, admin.id, context.req.param("pharmacyId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "VERIFICATION_NOT_REJECTABLE", "\u062A\u0639\u0630\u0631 \u0631\u0641\u0636 \u0627\u0644\u0637\u0644\u0628.");
    }
    await createNotification(database2, {
      userId: result.rows[0].owner_user_id,
      eventType: "PHARMACY_VERIFICATION_REJECTED",
      title: "\u062A\u062D\u062A\u0627\u062C \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0625\u0644\u0649 \u062A\u0639\u062F\u064A\u0644",
      body: "\u0627\u0641\u062A\u062D \u062D\u0627\u0644\u0629 \u0627\u0644\u062A\u062D\u0642\u0642 \u0644\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0633\u0628\u0628 \u0627\u0644\u0642\u0631\u0627\u0631.",
      resourceType: "PHARMACY",
      resourceId: context.req.param("pharmacyId")
    });
    return context.json({ data: { status: "REJECTED" } });
  });
  routes.get("/users", async (context) => {
    const result = await database2.query(
      `SELECT id, role, status, name, email, phone, created_at, updated_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    );
    return context.json({ data: result.rows });
  });
  routes.post("/users/:userId/suspend", async (context) => {
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).strict().parse(await context.req.json());
    const admin = context.get("user");
    if (context.req.param("userId") === admin.id) {
      throw new ApiError(409, "SELF_SUSPENSION_FORBIDDEN", "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u0644\u064A\u0642 \u062D\u0633\u0627\u0628\u0643.");
    }
    await database2.transaction(async (transaction) => {
      const result = await transaction.query(
        `UPDATE users SET status = 'SUSPENDED', updated_at = now()
         WHERE id = $1 AND status = 'ACTIVE' AND role <> 'ADMIN'
         RETURNING id, role`,
        [context.req.param("userId")]
      );
      if (!result.rows[0]) {
        throw new ApiError(409, "USER_NOT_SUSPENDABLE", "\u062A\u0639\u0630\u0631 \u062A\u0639\u0644\u064A\u0642 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645.");
      }
      await transaction.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [context.req.param("userId")]
      );
      await writeAudit(transaction, {
        actorUserId: admin.id,
        actorRole: "ADMIN",
        action: "USER_SUSPENDED",
        resourceType: "USER",
        resourceId: context.req.param("userId"),
        requestId: context.get("requestId"),
        metadata: { reasonRecorded: Boolean(body.reason) }
      });
    });
    return context.json({ data: { status: "SUSPENDED" } });
  });
  routes.post("/users/:userId/restore", async (context) => {
    const result = await database2.query(
      `UPDATE users SET status = 'ACTIVE', updated_at = now()
       WHERE id = $1 AND status = 'SUSPENDED' AND role <> 'ADMIN'
       RETURNING id`,
      [context.req.param("userId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "USER_NOT_RESTORABLE", "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645.");
    }
    return context.json({ data: { status: "ACTIVE" } });
  });
  routes.get("/pharmacies", async (context) => {
    const result = await database2.query(
      `SELECT p.id, p.name, p.pharmacist_name, p.verification_status,
              p.license_number, p.created_at, b.id AS branch_id,
              b.district, b.operational_status, b.accepting_requests,
              rm.response_rate, rm.completed_requests, rm.confirmed_not_found
       FROM pharmacies p
       JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       ORDER BY p.created_at DESC LIMIT 200`
    );
    return context.json({ data: result.rows });
  });
  routes.post("/pharmacies/:pharmacyId/suspend", async (context) => {
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).strict().parse(await context.req.json());
    const admin = context.get("user");
    await database2.transaction(async (transaction) => {
      const result = await transaction.query(
        `UPDATE pharmacies
         SET verification_status = 'SUSPENDED', verification_reason = $1,
             updated_at = now()
         WHERE id = $2 AND verification_status = 'VERIFIED'
         RETURNING owner_user_id`,
        [body.reason, context.req.param("pharmacyId")]
      );
      if (!result.rows[0]) {
        throw new ApiError(409, "PHARMACY_NOT_SUSPENDABLE", "\u062A\u0639\u0630\u0631 \u062A\u0639\u0644\u064A\u0642 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629.");
      }
      await transaction.query(
        `UPDATE pharmacy_branches
         SET operational_status = 'SUSPENDED', accepting_requests = false,
             updated_at = now()
         WHERE pharmacy_id = $1`,
        [context.req.param("pharmacyId")]
      );
      await transaction.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [result.rows[0].owner_user_id]
      );
      await writeAudit(transaction, {
        actorUserId: admin.id,
        actorRole: "ADMIN",
        action: "PHARMACY_SUSPENDED",
        resourceType: "PHARMACY",
        resourceId: context.req.param("pharmacyId"),
        requestId: context.get("requestId"),
        metadata: { reason: "recorded-separately" }
      });
    });
    return context.json({ data: { status: "SUSPENDED" } });
  });
  routes.post("/pharmacies/:pharmacyId/restore", async (context) => {
    const admin = context.get("user");
    const result = await database2.query(
      `UPDATE pharmacies
       SET verification_status = 'VERIFIED', verification_reason = NULL,
           verified_by = $1, verified_at = now(), updated_at = now()
       WHERE id = $2 AND verification_status = 'SUSPENDED'
       RETURNING id`,
      [admin.id, context.req.param("pharmacyId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "PHARMACY_NOT_RESTORABLE", "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629.");
    }
    await database2.query(
      `UPDATE pharmacy_branches
       SET operational_status = 'ACTIVE', accepting_requests = true,
           updated_at = now()
       WHERE pharmacy_id = $1`,
      [context.req.param("pharmacyId")]
    );
    return context.json({ data: { status: "VERIFIED" } });
  });
  routes.get("/requests", async (context) => {
    const result = await database2.query(
      `SELECT r.*, u.name AS patient_name,
              (SELECT count(*)::int FROM request_dispatches d
               WHERE d.request_id = r.id) AS dispatch_count,
              (SELECT count(*)::int FROM pharmacy_offers o
               WHERE o.request_id = r.id) AS offer_count
       FROM medicine_requests r
       JOIN users u ON u.id = r.patient_id
       ORDER BY r.created_at DESC LIMIT 200`
    );
    return context.json({ data: result.rows });
  });
  routes.get("/requests/:requestId", async (context) => {
    const request = await database2.query(
      `SELECT r.*, u.name AS patient_name, u.email AS patient_email
       FROM medicine_requests r
       JOIN users u ON u.id = r.patient_id
       WHERE r.id = $1`,
      [context.req.param("requestId")]
    );
    if (!request.rows[0]) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    const dispatches = await database2.query(
      `SELECT d.*, p.name AS pharmacy_name, b.name AS branch_name
       FROM request_dispatches d
       JOIN pharmacy_branches b ON b.id = d.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE d.request_id = $1 ORDER BY d.sent_at`,
      [context.req.param("requestId")]
    );
    const offers = await database2.query(
      `SELECT o.*, p.name AS pharmacy_name
       FROM pharmacy_offers o
       JOIN pharmacy_branches b ON b.id = o.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE o.request_id = $1 ORDER BY o.created_at`,
      [context.req.param("requestId")]
    );
    const reservations = await database2.query(
      `SELECT * FROM reservations WHERE request_id = $1 ORDER BY created_at`,
      [context.req.param("requestId")]
    );
    return context.json({
      data: {
        request: request.rows[0],
        dispatches: dispatches.rows,
        offers: offers.rows,
        reservations: reservations.rows
      }
    });
  });
  routes.get("/reports", async (context) => {
    const result = await database2.query(
      `SELECT r.*, u.name AS reporter_name
       FROM reports r JOIN users u ON u.id = r.reporter_user_id
       ORDER BY CASE r.status WHEN 'OPEN' THEN 0 WHEN 'INVESTIGATING' THEN 1 ELSE 2 END,
                r.created_at DESC
       LIMIT 200`
    );
    return context.json({ data: result.rows });
  });
  routes.post("/reports/:reportId/resolve", async (context) => {
    const body = z.object({
      status: z.enum(["RESOLVED", "DISMISSED"]),
      resolution: z.string().trim().min(3).max(1e3)
    }).strict().parse(await context.req.json());
    const result = await database2.query(
      `UPDATE reports SET status = $1, resolution = $2, resolved_by = $3,
             resolved_at = now()
       WHERE id = $4 AND status IN ('OPEN', 'INVESTIGATING')
       RETURNING id`,
      [body.status, body.resolution, context.get("user").id, context.req.param("reportId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "REPORT_NOT_RESOLVABLE", "\u062A\u0639\u0630\u0631 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0628\u0644\u0627\u063A.");
    }
    return context.json({ data: { status: body.status } });
  });
  routes.get("/audit-events", async (context) => {
    const result = await database2.query(
      `SELECT id, actor_user_id, actor_role, action, resource_type,
              resource_id, result, request_id, metadata, created_at
       FROM audit_events ORDER BY created_at DESC LIMIT 300`
    );
    return context.json({ data: result.rows });
  });
  return routes;
}

// server/routes/auth.ts
import { randomUUID as randomUUID4 } from "crypto";
import { Hono as Hono2 } from "hono";
import { z as z2 } from "zod";

// server/security/rate-limit.ts
import { createHash as createHash2 } from "crypto";
function keyHash(value) {
  return createHash2("sha256").update(value).digest("hex");
}
async function enforceRateLimit(database2, scope, subject, limit, windowSeconds) {
  var _a;
  const key = `${scope}:${keyHash(subject)}`;
  const result = await database2.query(
    `INSERT INTO rate_limits (key, count, window_started_at, expires_at)
     VALUES ($1, 1, now(), now() + ($3 * interval '1 second'))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.expires_at <= now() THEN 1
         ELSE rate_limits.count + 1
       END,
       window_started_at = CASE
         WHEN rate_limits.expires_at <= now() THEN now()
         ELSE rate_limits.window_started_at
       END,
       expires_at = CASE
         WHEN rate_limits.expires_at <= now()
           THEN now() + ($3 * interval '1 second')
         ELSE rate_limits.expires_at
       END
     RETURNING count, count > $2 AS blocked`,
    [key, limit, windowSeconds]
  );
  if ((_a = result.rows[0]) == null ? void 0 : _a.blocked) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629. \u0627\u0646\u062A\u0638\u0631 \u0642\u0644\u064A\u0644\u064B\u0627 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.",
      { retryAfterSeconds: windowSeconds }
    );
  }
}

// server/routes/auth.ts
var registerSchema = z2.object({
  role: z2.enum(["PATIENT", "PHARMACY"]),
  name: z2.string().trim().min(2).max(120),
  email: z2.string().email().max(254),
  phone: z2.string().trim().min(8).max(20).optional(),
  password: z2.string().min(10).max(128),
  clientType: z2.enum(["web", "mobile"]).default("web"),
  deviceLabel: z2.string().max(120).optional()
}).strict();
var loginSchema = z2.object({
  email: z2.string().email().max(254),
  password: z2.string().min(1).max(128),
  expectedRole: z2.enum(["PATIENT", "PHARMACY", "ADMIN"]).optional(),
  clientType: z2.enum(["web", "mobile"]).default("web"),
  deviceLabel: z2.string().max(120).optional()
}).strict();
function ipSubject(request) {
  var _a, _b;
  return ((_b = (_a = request.headers.get("x-forwarded-for")) == null ? void 0 : _a.split(",")[0]) == null ? void 0 : _b.trim()) ?? "local";
}
function authRoutes(database2) {
  const routes = new Hono2();
  routes.post("/register", async (context) => {
    const body = registerSchema.parse(await context.req.json());
    const email = normalizeEmail(body.email);
    await enforceRateLimit(
      database2,
      "register",
      `${ipSubject(context.req.raw)}:${email}`,
      5,
      3600
    );
    const existing = await database2.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    if (existing.rowCount > 0) {
      throw new ApiError(
        409,
        "ACCOUNT_EXISTS",
        "\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0645\u0631\u062A\u0628\u0637 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F."
      );
    }
    const userId = randomUUID4();
    const passwordHash = await hashPassword(body.password);
    await database2.transaction(async (transaction) => {
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
          passwordHash
        ]
      );
      if (body.role === "PATIENT") {
        await transaction.query(
          "INSERT INTO patient_profiles (user_id) VALUES ($1)",
          [userId]
        );
      }
      await writeAudit(transaction, {
        actorUserId: userId,
        actorRole: body.role,
        action: "ACCOUNT_REGISTERED",
        resourceType: "USER",
        resourceId: userId,
        requestId: context.get("requestId")
      });
    });
    const session = await createSession(database2, userId, body.deviceLabel);
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
            email
          },
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
          token: body.clientType === "mobile" ? session.token : void 0
        }
      },
      201
    );
  });
  routes.post("/login", async (context) => {
    const body = loginSchema.parse(await context.req.json());
    const email = normalizeEmail(body.email);
    await enforceRateLimit(
      database2,
      "login",
      `${ipSubject(context.req.raw)}:${email}`,
      8,
      900
    );
    const result = await database2.query(
      `SELECT id, role, status, name, email, phone, password_hash
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    const user = result.rows[0];
    const valid = user && user.status === "ACTIVE" && await verifyPassword(user.password_hash, body.password);
    if (!valid) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "\u0627\u0644\u0628\u0631\u064A\u062F \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629."
      );
    }
    if (body.expectedRole && user.role !== body.expectedRole) {
      throw new ApiError(
        403,
        "ROLE_MISMATCH",
        "\u0627\u0633\u062A\u062E\u062F\u0645 \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u062F\u0648\u0631."
      );
    }
    const session = await createSession(database2, user.id, body.deviceLabel);
    if (body.clientType === "web") {
      setWebSession(context, session.token, session.expiresAt);
    }
    await writeAudit(database2, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "SESSION_CREATED",
      resourceType: "SESSION",
      requestId: context.get("requestId")
    });
    return context.json({
      data: {
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          email: user.email,
          phone: user.phone
        },
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        token: body.clientType === "mobile" ? session.token : void 0
      }
    });
  });
  routes.get("/me", requireAuth(database2), async (context) => {
    const user = context.get("user");
    let pharmacy = null;
    if (user.role === "PHARMACY") {
      const result = await database2.query(
        `SELECT p.id, p.name, p.verification_status, p.verification_reason,
                b.id AS branch_id, b.district, b.accepting_requests,
                b.operational_status
         FROM pharmacies p
         LEFT JOIN pharmacy_branches b ON b.pharmacy_id = p.id
         WHERE p.owner_user_id = $1 LIMIT 1`,
        [user.id]
      );
      pharmacy = result.rows[0] ?? null;
    }
    return context.json({ data: { user, pharmacy } });
  });
  routes.get("/csrf", requireAuth(database2), async (context) => {
    const csrfToken = await rotateCsrfToken(
      database2,
      context.get("session").id
    );
    return context.json({ data: { csrfToken } });
  });
  routes.post("/logout", requireAuth(database2), async (context) => {
    await revokeSession(database2, context.get("session").id);
    clearWebSession(context);
    return context.json({ data: { loggedOut: true } });
  });
  return routes;
}

// server/routes/files.ts
import { randomUUID as randomUUID5 } from "crypto";
import { Hono as Hono3 } from "hono";
var purposes = [
  "PRESCRIPTION",
  "PHARMACY_LICENSE",
  "PHARMACIST_ID"
];
function fileRoutes(database2) {
  const routes = new Hono3();
  routes.use("*", requireAuth(database2));
  routes.post("/", async (context) => {
    var _a;
    const body = await context.req.parseBody();
    const purpose = String(body.purpose ?? "");
    const file = body.file;
    const user = context.get("user");
    if (!purposes.includes(purpose)) {
      throw new ApiError(422, "FILE_PURPOSE_INVALID", "\u063A\u0631\u0636 \u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
    }
    if (user.role === "PATIENT" && purpose !== "PRESCRIPTION" || user.role === "PHARMACY" && purpose === "PRESCRIPTION" || user.role === "ADMIN") {
      throw new ApiError(403, "FILE_PURPOSE_FORBIDDEN", "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0631\u0641\u0639 \u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641.");
    }
    if (!(file instanceof File)) {
      throw new ApiError(422, "FILE_REQUIRED", "\u0627\u062E\u062A\u0631 \u0635\u0648\u0631\u0629 \u0635\u0627\u0644\u062D\u0629.");
    }
    let pharmacyId;
    if (user.role === "PHARMACY") {
      const pharmacy = await database2.query(
        "SELECT id FROM pharmacies WHERE owner_user_id = $1 LIMIT 1",
        [user.id]
      );
      pharmacyId = (_a = pharmacy.rows[0]) == null ? void 0 : _a.id;
      if (!pharmacyId) {
        throw new ApiError(
          403,
          "PHARMACY_ONBOARDING_REQUIRED",
          "\u0623\u0643\u0645\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0642\u0628\u0644 \u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A."
        );
      }
    }
    const stored = await storeEncryptedImage(database2, {
      ownerUserId: user.id,
      purpose,
      bytes: Buffer.from(await file.arrayBuffer()),
      pharmacyId
    });
    if (pharmacyId) {
      await database2.query(
        `INSERT INTO verification_documents
          (id, pharmacy_id, secure_file_id, document_type)
         VALUES ($1, $2, $3, $4)`,
        [
          randomUUID5(),
          pharmacyId,
          stored.id,
          purpose === "PHARMACY_LICENSE" ? "LICENSE" : "PHARMACIST_ID"
        ]
      );
    }
    await writeAudit(database2, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "SECURE_FILE_UPLOADED",
      resourceType: "SECURE_FILE",
      resourceId: stored.id,
      requestId: context.get("requestId"),
      metadata: { purpose }
    });
    return context.json({ data: stored }, 201);
  });
  routes.get("/:fileId", async (context) => {
    const user = context.get("user");
    const fileId = context.req.param("fileId");
    const metadata = await database2.query(
      `SELECT owner_user_id, purpose, request_id, pharmacy_id
       FROM secure_files WHERE id = $1 AND status = 'READY'`,
      [fileId]
    );
    const file = metadata.rows[0];
    if (!file) {
      throw new ApiError(404, "FILE_NOT_FOUND", "\u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    let allowed = file.owner_user_id === user.id || user.role === "ADMIN";
    if (!allowed && user.role === "PHARMACY" && file.purpose === "PRESCRIPTION") {
      const access = await database2.query(
        `SELECT res.id
         FROM reservations res
         JOIN pharmacy_branches b ON b.id = res.branch_id
         JOIN pharmacies p ON p.id = b.pharmacy_id
         JOIN medicine_requests r ON r.id = res.request_id
         WHERE p.owner_user_id = $1
           AND r.prescription_file_id = $2
           AND res.status IN ('ACTIVE', 'READY')
           AND res.hold_expires_at > now()
         LIMIT 1`,
        [user.id, fileId]
      );
      allowed = Boolean(access.rows[0]);
    }
    if (!allowed) {
      await writeAudit(database2, {
        actorUserId: user.id,
        actorRole: user.role,
        action: "SECURE_FILE_ACCESSED",
        resourceType: "SECURE_FILE",
        resourceId: fileId,
        result: "DENIED",
        requestId: context.get("requestId")
      });
      throw new ApiError(404, "FILE_NOT_FOUND", "\u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    const decrypted = await readEncryptedImage(database2, fileId);
    await writeAudit(database2, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "SECURE_FILE_ACCESSED",
      resourceType: "SECURE_FILE",
      resourceId: fileId,
      requestId: context.get("requestId"),
      metadata: { purpose: decrypted.row.purpose }
    });
    context.header("Cache-Control", "no-store, private");
    context.header("Content-Type", decrypted.row.media_type);
    context.header("Content-Disposition", 'inline; filename="secure-image.jpg"');
    const body = decrypted.data.buffer.slice(
      decrypted.data.byteOffset,
      decrypted.data.byteOffset + decrypted.data.byteLength
    );
    return context.body(body);
  });
  routes.delete("/:fileId", async (context) => {
    const user = context.get("user");
    const result = await database2.query(
      `SELECT id FROM secure_files
       WHERE id = $1 AND owner_user_id = $2 AND status = 'READY'`,
      [context.req.param("fileId"), user.id]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "FILE_NOT_FOUND", "\u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    await deleteEncryptedImage(database2, context.req.param("fileId"));
    return context.json({ data: { deleted: true } });
  });
  return routes;
}

// server/routes/patient.ts
import { randomUUID as randomUUID7 } from "crypto";
import { Hono as Hono4 } from "hono";
import { z as z3 } from "zod";

// server/security/idempotency.ts
import { createHash as createHash3 } from "crypto";
function requestFingerprint(value) {
  return createHash3("sha256").update(JSON.stringify(value)).digest("hex");
}
async function getIdempotentResource(database2, input) {
  if (!input.key || input.key.length < 8 || input.key.length > 200) {
    throw new ApiError(
      422,
      "IDEMPOTENCY_KEY_REQUIRED",
      "\u064A\u0644\u0632\u0645 \u0645\u0641\u062A\u0627\u062D \u0622\u0645\u0646 \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629."
    );
  }
  const result = await database2.query(
    `SELECT resource_id, request_hash FROM idempotency_keys
     WHERE principal_id = $1 AND operation = $2 AND key = $3
       AND expires_at > now()`,
    [input.principalId, input.operation, input.key]
  );
  const existing = result.rows[0];
  if (!existing) return null;
  if (existing.request_hash !== input.requestHash) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "\u0627\u0633\u062A\u064F\u062E\u062F\u0645 \u0645\u0641\u062A\u0627\u062D \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0637\u0644\u0628 \u0645\u062E\u062A\u0644\u0641."
    );
  }
  return existing.resource_id;
}
async function recordIdempotency(database2, input) {
  await database2.query(
    `INSERT INTO idempotency_keys
      (principal_id, operation, key, resource_id, request_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '24 hours')`,
    [
      input.principalId,
      input.operation,
      input.key,
      input.resourceId,
      input.requestHash
    ]
  );
}

// server/services/matching.ts
import { randomUUID as randomUUID6 } from "crypto";
function radians(value) {
  return value * Math.PI / 180;
}
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}
function isBranchOpen(openingHours, timezone, now = /* @__PURE__ */ new Date()) {
  var _a, _b, _c;
  if (!openingHours || Object.keys(openingHours).length === 0) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Asia/Baghdad",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const weekday = ((_a = parts.find((part) => part.type === "weekday")) == null ? void 0 : _a.value) ?? "Sun";
  const hour = ((_b = parts.find((part) => part.type === "hour")) == null ? void 0 : _b.value) ?? "00";
  const minute = ((_c = parts.find((part) => part.type === "minute")) == null ? void 0 : _c.value) ?? "00";
  const dayIndex = {
    Sun: "0",
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6"
  };
  const current = `${hour === "24" ? "00" : hour}:${minute}`;
  return (openingHours[dayIndex[weekday]] ?? []).some(
    ([start, end]) => start <= current && current <= end
  );
}
function scoreCandidate(request, candidate) {
  const distanceKm = haversineDistanceKm(
    request.latitude,
    request.longitude,
    candidate.latitude,
    candidate.longitude
  );
  if (distanceKm > request.radius_km) return null;
  if (!isBranchOpen(candidate.opening_hours, candidate.timezone)) return null;
  const distanceScore = Math.max(0, 1 - distanceKm / request.radius_km);
  const responseScore = candidate.response_rate ?? 0.55;
  const speedScore = Math.max(
    0,
    1 - (candidate.average_response_seconds ?? 300) / 900
  );
  const serviceFit = request.delivery_preferred && candidate.delivery_enabled || request.pickup_preferred && candidate.pickup_enabled ? 1 : 0.35;
  const score = 0.42 * distanceScore + 0.25 * responseScore + 0.18 * speedScore + 0.15 * serviceFit;
  const reasons = [
    `${distanceKm.toFixed(2)} km`,
    candidate.delivery_enabled ? "delivery" : "pickup",
    `response:${Math.round(responseScore * 100)}`
  ];
  return { ...candidate, distanceKm, score, reasons };
}
async function dispatchRequest(database2, request) {
  const latitudeDelta = request.radius_km / 111;
  const longitudeDelta = request.radius_km / (111 * Math.max(0.2, Math.cos(radians(request.latitude))));
  const result = await database2.query(
    `SELECT
       b.id, p.owner_user_id, b.latitude, b.longitude, b.opening_hours,
       b.timezone, b.pickup_enabled, b.delivery_enabled,
       rm.response_rate, rm.average_response_seconds
     FROM pharmacy_branches b
     JOIN pharmacies p ON p.id = b.pharmacy_id
     JOIN users u ON u.id = p.owner_user_id
     LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
     WHERE p.verification_status = 'VERIFIED'
       AND b.operational_status = 'ACTIVE'
       AND b.accepting_requests = true
       AND u.status = 'ACTIVE'
       AND b.latitude BETWEEN $1 AND $2
       AND b.longitude BETWEEN $3 AND $4`,
    [
      request.latitude - latitudeDelta,
      request.latitude + latitudeDelta,
      request.longitude - longitudeDelta,
      request.longitude + longitudeDelta
    ]
  );
  const ranked = result.rows.map((candidate) => scoreCandidate(request, candidate)).filter((candidate) => candidate !== null).sort((a, b) => b.score - a.score).slice(0, request.radius_km === 2 ? 6 : 8);
  await database2.transaction(async (transaction) => {
    for (const candidate of ranked) {
      const inserted = await transaction.query(
        `INSERT INTO request_dispatches
          (id, request_id, branch_id, distance_km, match_score, match_reasons)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (request_id, branch_id) DO NOTHING
         RETURNING id`,
        [
          randomUUID6(),
          request.id,
          candidate.id,
          candidate.distanceKm,
          candidate.score,
          JSON.stringify(candidate.reasons)
        ]
      );
      if (inserted.rowCount > 0) {
        await createNotification(transaction, {
          userId: candidate.owner_user_id,
          eventType: "NEARBY_REQUEST",
          title: "\u0637\u0644\u0628 \u062F\u0648\u0627\u0621 \u0642\u0631\u064A\u0628 \u062C\u062F\u064A\u062F",
          body: "\u064A\u0648\u062C\u062F \u0637\u0644\u0628 \u0645\u0637\u0627\u0628\u0642 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642 \u0641\u0631\u0639\u0643. \u0627\u0641\u062A\u062D \u062F\u0648\u0627\u0626\u064A \u0644\u0645\u0631\u0627\u062C\u0639\u062A\u0647.",
          resourceType: "REQUEST",
          resourceId: request.id
        });
      }
    }
  });
  return ranked.length;
}

// server/routes/patient.ts
var createRequestSchema = z3.object({
  medicineName: z3.string().trim().min(2).max(160),
  presentationId: z3.string().uuid().or(z3.string().startsWith("pres-")).optional(),
  strength: z3.string().trim().max(80).optional(),
  dosageForm: z3.string().trim().max(80).optional(),
  quantity: z3.number().int().min(1).max(20).default(1),
  urgency: z3.enum(["NOW", "TODAY", "TOMORROW"]).default("TODAY"),
  prescriptionFileId: z3.string().uuid().optional(),
  area: z3.string().trim().min(2).max(160),
  latitude: z3.number().min(-90).max(90),
  longitude: z3.number().min(-180).max(180),
  pickupPreferred: z3.boolean().default(true),
  deliveryPreferred: z3.boolean().default(false)
}).strict();
var profileSchema = z3.object({
  name: z3.string().trim().min(2).max(120),
  phone: z3.string().trim().min(8).max(20).nullable(),
  defaultArea: z3.string().trim().min(2).max(160).nullable(),
  latitude: z3.number().min(-90).max(90).nullable(),
  longitude: z3.number().min(-180).max(180).nullable(),
  notificationPreferences: z3.object({
    inApp: z3.boolean(),
    push: z3.boolean()
  }).strict()
}).strict();
function publicReference(prefix) {
  return `${prefix}-${randomUUID7().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}
async function patientRequest(database2, requestId, patientId) {
  const result = await database2.query(
    `SELECT
       r.*,
       (
         SELECT count(*)::int FROM request_dispatches d
         WHERE d.request_id = r.id
       ) AS dispatched_count,
       (
         SELECT count(*)::int FROM pharmacy_offers o
         WHERE o.request_id = r.id
           AND o.status IN ('ACTIVE', 'HOLD_PENDING', 'HELD')
           AND o.expires_at > now()
       ) AS offer_count
     FROM medicine_requests r
     WHERE r.id = $1 AND r.patient_id = $2
     LIMIT 1`,
    [requestId, patientId]
  );
  if (!result.rows[0]) {
    throw new ApiError(404, "REQUEST_NOT_FOUND", "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  }
  return result.rows[0];
}
function patientRoutes(database2) {
  const routes = new Hono4();
  routes.use("*", requireAuth(database2, ["PATIENT"]));
  routes.get("/profile", async (context) => {
    const result = await database2.query(
      `SELECT u.id, u.name, u.email, u.phone, u.locale,
              p.default_area, p.latitude, p.longitude,
              p.notification_preferences
       FROM users u
       JOIN patient_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [context.get("user").id]
    );
    return context.json({ data: result.rows[0] });
  });
  routes.put("/profile", async (context) => {
    const body = profileSchema.parse(await context.req.json());
    const userId = context.get("user").id;
    await database2.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE users SET name = $1, phone = $2, updated_at = now()
         WHERE id = $3`,
        [body.name, body.phone, userId]
      );
      await transaction.query(
        `UPDATE patient_profiles
         SET default_area = $1, latitude = $2, longitude = $3,
             notification_preferences = $4::jsonb, updated_at = now()
         WHERE user_id = $5`,
        [
          body.defaultArea,
          body.latitude,
          body.longitude,
          JSON.stringify(body.notificationPreferences),
          userId
        ]
      );
    });
    return context.json({ data: { updated: true } });
  });
  routes.post("/requests", async (context) => {
    const body = createRequestSchema.parse(await context.req.json());
    const userId = context.get("user").id;
    await enforceRateLimit(database2, "patient-request", userId, 8, 600);
    const key = context.req.header("Idempotency-Key");
    const fingerprint = requestFingerprint(body);
    const existingId = await getIdempotentResource(database2, {
      principalId: userId,
      operation: "CREATE_REQUEST",
      key,
      requestHash: fingerprint
    });
    if (existingId) {
      return context.json({
        data: await patientRequest(database2, existingId, userId)
      });
    }
    let classification = null;
    if (body.presentationId) {
      const presentation = await database2.query(
        `SELECT m.classification
         FROM medicine_presentations mp
         JOIN medicines m ON m.id = mp.medicine_id
         WHERE mp.id = $1 AND m.active = true`,
        [body.presentationId]
      );
      if (!presentation.rows[0]) {
        throw new ApiError(
          422,
          "PRESENTATION_UNKNOWN",
          "\u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u062F\u0648\u0627\u0626\u064A \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641."
        );
      }
      classification = presentation.rows[0].classification;
    }
    if (body.prescriptionFileId) {
      const file = await database2.query(
        `SELECT id FROM secure_files
         WHERE id = $1 AND owner_user_id = $2
           AND purpose = 'PRESCRIPTION' AND status = 'READY'`,
        [body.prescriptionFileId, userId]
      );
      if (!file.rows[0]) {
        throw new ApiError(422, "PRESCRIPTION_INVALID", "\u0645\u0644\u0641 \u0627\u0644\u0648\u0635\u0641\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
      }
    }
    const requestId = randomUUID7();
    const status = classification === "CONTROLLED" ? "BLOCKED" : "ACTIVE";
    const expiresAt = new Date(
      Date.now() + config.requestLifetimeMinutes * 6e4
    ).toISOString();
    const reference = publicReference("DW");
    await database2.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO medicine_requests
          (id, public_reference, patient_id, status, medicine_name,
           presentation_id, strength, dosage_form, quantity, urgency,
           prescription_file_id, prescription_status, area, latitude, longitude,
           pickup_preferred, delivery_preferred, expires_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15, $16, $17, $18)`,
        [
          requestId,
          reference,
          userId,
          status,
          body.medicineName,
          body.presentationId ?? null,
          body.strength ?? null,
          body.dosageForm ?? null,
          body.quantity,
          body.urgency,
          body.prescriptionFileId ?? null,
          body.prescriptionFileId ? "PROVIDED" : "NOT_PROVIDED",
          body.area,
          body.latitude,
          body.longitude,
          body.pickupPreferred,
          body.deliveryPreferred,
          expiresAt
        ]
      );
      if (body.prescriptionFileId) {
        await transaction.query(
          `UPDATE secure_files SET request_id = $1 WHERE id = $2`,
          [requestId, body.prescriptionFileId]
        );
      }
      await recordIdempotency(transaction, {
        principalId: userId,
        operation: "CREATE_REQUEST",
        key,
        resourceId: requestId,
        requestHash: fingerprint
      });
      await writeAudit(transaction, {
        actorUserId: userId,
        actorRole: "PATIENT",
        action: status === "BLOCKED" ? "REQUEST_BLOCKED" : "REQUEST_CREATED",
        resourceType: "MEDICINE_REQUEST",
        resourceId: requestId,
        requestId: context.get("requestId")
      });
    });
    let dispatchedCount = 0;
    if (status === "ACTIVE") {
      dispatchedCount = await dispatchRequest(database2, {
        id: requestId,
        medicine_name: body.medicineName,
        latitude: body.latitude,
        longitude: body.longitude,
        radius_km: 2,
        pickup_preferred: body.pickupPreferred,
        delivery_preferred: body.deliveryPreferred
      });
      if (dispatchedCount === 0) {
        await database2.query(
          `UPDATE medicine_requests SET status = 'NO_MATCH', updated_at = now()
           WHERE id = $1 AND status = 'ACTIVE'`,
          [requestId]
        );
      }
    }
    return context.json(
      {
        data: {
          ...await patientRequest(database2, requestId, userId),
          dispatchedCount
        }
      },
      201
    );
  });
  routes.get("/requests", async (context) => {
    const limit = Math.min(
      50,
      Math.max(1, Number(context.req.query("limit") ?? 20))
    );
    const result = await database2.query(
      `SELECT
         r.*,
         (SELECT count(*)::int FROM pharmacy_offers o
          WHERE o.request_id = r.id) AS offer_count
       FROM medicine_requests r
       WHERE r.patient_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [context.get("user").id, limit]
    );
    return context.json({ data: result.rows });
  });
  routes.get("/requests/:requestId", async (context) => {
    const data = await patientRequest(
      database2,
      context.req.param("requestId"),
      context.get("user").id
    );
    const reservation = await database2.query(
      `SELECT res.*, o.price_iqd, o.offered_brand, p.name AS pharmacy_name,
              b.address, b.district, b.latitude, b.longitude
       FROM reservations res
       JOIN pharmacy_offers o ON o.id = res.offer_id
       JOIN pharmacy_branches b ON b.id = res.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE res.request_id = $1
       ORDER BY res.created_at DESC LIMIT 1`,
      [context.req.param("requestId")]
    );
    return context.json({
      data: { ...data, reservation: reservation.rows[0] ?? null }
    });
  });
  routes.get("/requests/:requestId/offers", async (context) => {
    await patientRequest(
      database2,
      context.req.param("requestId"),
      context.get("user").id
    );
    const result = await database2.query(
      `SELECT
         o.*, p.name AS pharmacy_name, b.name AS branch_name, b.district,
         b.address, b.latitude, b.longitude, d.distance_km,
         rm.response_rate, rm.average_response_seconds,
         rm.successful_reservations, rm.confirmed_not_found
       FROM pharmacy_offers o
       JOIN pharmacy_branches b ON b.id = o.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       JOIN request_dispatches d
         ON d.request_id = o.request_id AND d.branch_id = o.branch_id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       WHERE o.request_id = $1
         AND o.status IN ('ACTIVE', 'HOLD_PENDING', 'HELD')
         AND (o.expires_at > now() OR o.status = 'HELD')
       ORDER BY
         CASE o.offer_type WHEN 'EXACT' THEN 0 WHEN 'PARTIAL' THEN 1 ELSE 2 END,
         o.price_iqd, d.distance_km`,
      [context.req.param("requestId")]
    );
    return context.json({ data: result.rows });
  });
  routes.post("/requests/:requestId/expand", async (context) => {
    const body = z3.object({ radiusKm: z3.union([z3.literal(5), z3.literal(10)]) }).strict().parse(await context.req.json());
    const userId = context.get("user").id;
    const request = await patientRequest(
      database2,
      context.req.param("requestId"),
      userId
    );
    if (!["ACTIVE", "NO_MATCH"].includes(request.status) || new Date(request.expires_at).getTime() <= Date.now() || body.radiusKm <= request.radius_km) {
      throw new ApiError(
        409,
        "REQUEST_NOT_EXPANDABLE",
        "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0648\u0633\u064A\u0639 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0622\u0646."
      );
    }
    await database2.query(
      `UPDATE medicine_requests
       SET radius_km = $1, status = 'ACTIVE', version = version + 1,
           updated_at = now()
       WHERE id = $2 AND patient_id = $3`,
      [body.radiusKm, request.id, userId]
    );
    const dispatchedCount = await dispatchRequest(database2, {
      id: request.id,
      medicine_name: request.medicine_name,
      latitude: request.latitude,
      longitude: request.longitude,
      radius_km: body.radiusKm,
      pickup_preferred: request.pickup_preferred,
      delivery_preferred: request.delivery_preferred
    });
    if (dispatchedCount === 0) {
      await database2.query(
        `UPDATE medicine_requests SET status = 'NO_MATCH'
         WHERE id = $1 AND status = 'ACTIVE'`,
        [request.id]
      );
    }
    return context.json({
      data: await patientRequest(database2, request.id, userId)
    });
  });
  routes.post("/requests/:requestId/cancel", async (context) => {
    const userId = context.get("user").id;
    const result = await database2.query(
      `UPDATE medicine_requests
       SET status = 'CANCELLED', version = version + 1, updated_at = now()
       WHERE id = $1 AND patient_id = $2
         AND status IN ('ACTIVE', 'NO_MATCH', 'HOLD_PENDING')
       RETURNING id`,
      [context.req.param("requestId"), userId]
    );
    if (!result.rows[0]) {
      throw new ApiError(
        409,
        "REQUEST_NOT_CANCELLABLE",
        "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0644\u063A\u0627\u0621 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628."
      );
    }
    await database2.query(
      `UPDATE reservations SET status = 'CANCELLED', updated_at = now()
       WHERE request_id = $1 AND status = 'PENDING_ACK'`,
      [context.req.param("requestId")]
    );
    return context.json({ data: { cancelled: true } });
  });
  routes.post("/requests/:requestId/reservations", async (context) => {
    const body = z3.object({ offerId: z3.string().uuid() }).strict().parse(
      await context.req.json()
    );
    const userId = context.get("user").id;
    const key = context.req.header("Idempotency-Key");
    const fingerprint = requestFingerprint(body);
    const existingId = await getIdempotentResource(database2, {
      principalId: userId,
      operation: "SELECT_OFFER",
      key,
      requestHash: fingerprint
    });
    if (existingId) {
      const existing = await database2.query(
        "SELECT * FROM reservations WHERE id = $1 AND patient_id = $2",
        [existingId, userId]
      );
      return context.json({ data: existing.rows[0] });
    }
    const reservationId = randomUUID7();
    const reference = publicReference("RSV");
    const acknowledgementDeadline = new Date(
      Date.now() + config.reservationAckMinutes * 6e4
    ).toISOString();
    await database2.transaction(async (transaction) => {
      const result2 = await transaction.query(
        `SELECT
           r.id AS request_id, r.status AS request_status,
           r.expires_at AS request_expires_at, r.patient_id,
           o.id AS offer_id, o.status AS offer_status, o.offer_type,
           o.expires_at AS offer_expires_at, o.branch_id, p.owner_user_id
         FROM medicine_requests r
         JOIN pharmacy_offers o ON o.request_id = r.id
         JOIN pharmacy_branches b ON b.id = o.branch_id
         JOIN pharmacies p ON p.id = b.pharmacy_id
         WHERE r.id = $1 AND o.id = $2 AND r.patient_id = $3
         FOR UPDATE`,
        [context.req.param("requestId"), body.offerId, userId]
      );
      const selected = result2.rows[0];
      if (!selected || !["ACTIVE", "NO_MATCH"].includes(selected.request_status) || selected.offer_status !== "ACTIVE" || new Date(selected.request_expires_at).getTime() <= Date.now() || new Date(selected.offer_expires_at).getTime() <= Date.now()) {
        throw new ApiError(
          409,
          "OFFER_NOT_SELECTABLE",
          "\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u0639\u0631\u0636 \u0623\u0648 \u0644\u0645 \u064A\u0639\u062F \u0642\u0627\u0628\u0644\u064B\u0627 \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631."
        );
      }
      if (selected.offer_type === "ALTERNATIVE_REVIEW_REQUIRED") {
        throw new ApiError(
          422,
          "ALTERNATIVE_REQUIRES_REVIEW",
          "\u0627\u0644\u0628\u062F\u064A\u0644 \u064A\u062D\u062A\u0627\u062C \u062A\u0648\u0627\u0635\u0644\u064B\u0627 \u0645\u0639 \u0627\u0644\u0635\u064A\u062F\u0644\u064A \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u062C\u0632\u0647 \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627."
        );
      }
      await transaction.query(
        `INSERT INTO reservations
          (id, public_reference, request_id, offer_id, patient_id, branch_id,
           acknowledgement_deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reservationId,
          reference,
          selected.request_id,
          selected.offer_id,
          userId,
          selected.branch_id,
          acknowledgementDeadline
        ]
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = 'HOLD_PENDING', version = version + 1, updated_at = now()
         WHERE id = $1`,
        [selected.request_id]
      );
      await transaction.query(
        `UPDATE pharmacy_offers SET status = 'HOLD_PENDING', updated_at = now()
         WHERE id = $1`,
        [selected.offer_id]
      );
      await recordIdempotency(transaction, {
        principalId: userId,
        operation: "SELECT_OFFER",
        key,
        resourceId: reservationId,
        requestHash: fingerprint
      });
      await createNotification(transaction, {
        userId: selected.owner_user_id,
        eventType: "OFFER_SELECTED",
        title: "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0645\u0631\u064A\u0636 \u0639\u0631\u0636\u0643",
        body: "\u0627\u0641\u062A\u062D \u0627\u0644\u062D\u062C\u0632 \u0648\u0623\u0643\u062F \u062D\u0641\u0638 \u0627\u0644\u062F\u0648\u0627\u0621 \u0642\u0628\u0644 \u0627\u0646\u062A\u0647\u0627\u0621 \u0645\u0647\u0644\u0629 \u0627\u0644\u0631\u062F.",
        resourceType: "RESERVATION",
        resourceId: reservationId
      });
      await writeAudit(transaction, {
        actorUserId: userId,
        actorRole: "PATIENT",
        action: "OFFER_SELECTED",
        resourceType: "RESERVATION",
        resourceId: reservationId,
        requestId: context.get("requestId")
      });
    });
    const result = await database2.query(
      "SELECT * FROM reservations WHERE id = $1",
      [reservationId]
    );
    return context.json({ data: result.rows[0] }, 201);
  });
  routes.get("/reservations/:reservationId", async (context) => {
    const result = await database2.query(
      `SELECT
         res.*, r.medicine_name, r.strength, r.quantity,
         o.offered_brand, o.offered_strength, o.offered_form, o.price_iqd,
         o.preparation_minutes, o.pickup_enabled, o.delivery_enabled,
         p.name AS pharmacy_name, p.phone AS pharmacy_phone,
         b.name AS branch_name, b.district, b.address, b.landmark,
         b.latitude, b.longitude,
         c.id AS conversation_id
       FROM reservations res
       JOIN medicine_requests r ON r.id = res.request_id
       JOIN pharmacy_offers o ON o.id = res.offer_id
       JOIN pharmacy_branches b ON b.id = res.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       LEFT JOIN conversations c ON c.reservation_id = res.id
       WHERE res.id = $1 AND res.patient_id = $2`,
      [context.req.param("reservationId"), context.get("user").id]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "RESERVATION_NOT_FOUND", "\u0627\u0644\u062D\u062C\u0632 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    return context.json({ data: result.rows[0] });
  });
  routes.get("/notifications", async (context) => {
    const result = await database2.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [context.get("user").id]
    );
    return context.json({ data: result.rows });
  });
  routes.post("/notifications/:notificationId/read", async (context) => {
    const result = await database2.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [context.req.param("notificationId"), context.get("user").id]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "\u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    return context.json({ data: { read: true } });
  });
  routes.get("/saved-pharmacies", async (context) => {
    const result = await database2.query(
      `SELECT b.id, p.name AS pharmacy_name, b.name AS branch_name,
              b.district, b.address, b.pickup_enabled, b.delivery_enabled
       FROM saved_pharmacies s
       JOIN pharmacy_branches b ON b.id = s.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE s.patient_id = $1
       ORDER BY s.created_at DESC`,
      [context.get("user").id]
    );
    return context.json({ data: result.rows });
  });
  routes.post("/saved-pharmacies/:branchId", async (context) => {
    await database2.query(
      `INSERT INTO saved_pharmacies (patient_id, branch_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [context.get("user").id, context.req.param("branchId")]
    );
    return context.json({ data: { saved: true } }, 201);
  });
  routes.delete("/saved-pharmacies/:branchId", async (context) => {
    await database2.query(
      "DELETE FROM saved_pharmacies WHERE patient_id = $1 AND branch_id = $2",
      [context.get("user").id, context.req.param("branchId")]
    );
    return context.json({ data: { saved: false } });
  });
  return routes;
}

// server/routes/pharmacy.ts
import { randomUUID as randomUUID8 } from "crypto";
import { Hono as Hono5 } from "hono";
import { z as z4 } from "zod";
var onboardingSchema = z4.object({
  pharmacyName: z4.string().trim().min(2).max(160),
  pharmacistName: z4.string().trim().min(2).max(160),
  phone: z4.string().trim().min(8).max(20),
  licenseNumber: z4.string().trim().min(3).max(100),
  licenseIssuer: z4.string().trim().min(2).max(160),
  licenseExpiresAt: z4.string().date().nullable(),
  branchName: z4.string().trim().min(2).max(160),
  governorate: z4.string().trim().min(2).max(120),
  district: z4.string().trim().min(2).max(120),
  address: z4.string().trim().min(5).max(300),
  landmark: z4.string().trim().max(200).nullable(),
  latitude: z4.number().min(-90).max(90),
  longitude: z4.number().min(-180).max(180),
  openingHours: z4.record(
    z4.string(),
    z4.array(z4.tuple([z4.string().regex(/^\d{2}:\d{2}$/), z4.string().regex(/^\d{2}:\d{2}$/)]))
  ),
  pickupEnabled: z4.boolean(),
  deliveryEnabled: z4.boolean()
}).strict();
var offerSchema = z4.object({
  offerType: z4.enum([
    "EXACT",
    "PARTIAL",
    "ALTERNATIVE_REVIEW_REQUIRED",
    "ORDERABLE"
  ]),
  offeredBrand: z4.string().trim().min(2).max(160),
  offeredStrength: z4.string().trim().min(1).max(80),
  offeredForm: z4.string().trim().min(1).max(80),
  availableQuantity: z4.number().int().min(1).max(1e3),
  priceIqd: z4.number().int().min(0).max(1e8),
  pickupEnabled: z4.boolean(),
  deliveryEnabled: z4.boolean(),
  preparationMinutes: z4.number().int().min(0).max(1440),
  note: z4.string().trim().max(500).nullable()
}).strict();
async function ownedPharmacy(database2, userId) {
  const result = await database2.query(
    `SELECT p.id AS pharmacy_id, b.id AS branch_id, p.owner_user_id,
            p.verification_status, b.operational_status, b.accepting_requests
     FROM pharmacies p
     JOIN pharmacy_branches b ON b.pharmacy_id = p.id
     WHERE p.owner_user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}
async function requireVerifiedPharmacy(database2, userId) {
  const pharmacy = await ownedPharmacy(database2, userId);
  if (!pharmacy) {
    throw new ApiError(
      403,
      "PHARMACY_ONBOARDING_REQUIRED",
      "\u0623\u0643\u0645\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0623\u0648\u0644\u064B\u0627."
    );
  }
  if (pharmacy.verification_status !== "VERIFIED" || pharmacy.operational_status !== "ACTIVE") {
    throw new ApiError(
      403,
      "PHARMACY_NOT_VERIFIED",
      "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0642\u0628\u0644 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629."
    );
  }
  return pharmacy;
}
function pharmacyRoutes(database2) {
  const routes = new Hono5();
  routes.use("*", requireAuth(database2, ["PHARMACY"]));
  routes.post("/onboarding", async (context) => {
    const body = onboardingSchema.parse(await context.req.json());
    const user = context.get("user");
    const existing = await ownedPharmacy(database2, user.id);
    if (existing) {
      throw new ApiError(
        409,
        "PHARMACY_ALREADY_EXISTS",
        "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0645\u0633\u0628\u0642\u064B\u0627."
      );
    }
    const pharmacyId = randomUUID8();
    const branchId = randomUUID8();
    await database2.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO pharmacies
          (id, owner_user_id, name, pharmacist_name, phone, email,
           license_number, license_issuer, license_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          pharmacyId,
          user.id,
          body.pharmacyName,
          body.pharmacistName,
          body.phone,
          user.email,
          body.licenseNumber,
          body.licenseIssuer,
          body.licenseExpiresAt
        ]
      );
      await transaction.query(
        `INSERT INTO pharmacy_branches
          (id, pharmacy_id, name, governorate, district, address, landmark,
           latitude, longitude, opening_hours, pickup_enabled, delivery_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)`,
        [
          branchId,
          pharmacyId,
          body.branchName,
          body.governorate,
          body.district,
          body.address,
          body.landmark,
          body.latitude,
          body.longitude,
          JSON.stringify(body.openingHours),
          body.pickupEnabled,
          body.deliveryEnabled
        ]
      );
      await transaction.query(
        "INSERT INTO reliability_metrics (branch_id) VALUES ($1)",
        [branchId]
      );
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: "PHARMACY",
        action: "PHARMACY_APPLICATION_SUBMITTED",
        resourceType: "PHARMACY",
        resourceId: pharmacyId,
        requestId: context.get("requestId")
      });
    });
    return context.json(
      {
        data: {
          pharmacyId,
          branchId,
          verificationStatus: "PENDING"
        }
      },
      201
    );
  });
  routes.get("/profile", async (context) => {
    const result = await database2.query(
      `SELECT p.*, b.id AS branch_id, b.name AS branch_name, b.governorate,
              b.district, b.address, b.landmark, b.latitude, b.longitude,
              b.opening_hours, b.pickup_enabled, b.delivery_enabled,
              b.accepting_requests, b.operational_status
       FROM pharmacies p
       LEFT JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       WHERE p.owner_user_id = $1 LIMIT 1`,
      [context.get("user").id]
    );
    return context.json({ data: result.rows[0] ?? null });
  });
  routes.put("/settings", async (context) => {
    const body = z4.object({
      openingHours: onboardingSchema.shape.openingHours,
      pickupEnabled: z4.boolean(),
      deliveryEnabled: z4.boolean(),
      acceptingRequests: z4.boolean(),
      operationalStatus: z4.enum(["ACTIVE", "PAUSED"])
    }).strict().parse(await context.req.json());
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    await database2.query(
      `UPDATE pharmacy_branches
       SET opening_hours = $1::jsonb, pickup_enabled = $2,
           delivery_enabled = $3, accepting_requests = $4,
           operational_status = $5, updated_at = now()
       WHERE id = $6`,
      [
        JSON.stringify(body.openingHours),
        body.pickupEnabled,
        body.deliveryEnabled,
        body.acceptingRequests,
        body.operationalStatus,
        pharmacy.branch_id
      ]
    );
    return context.json({ data: { updated: true } });
  });
  routes.get("/dashboard", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `SELECT
         (SELECT count(*)::int FROM request_dispatches
          WHERE branch_id = $1 AND sent_at >= date_trunc('day', now())) AS requests_today,
         (SELECT count(*)::int FROM request_dispatches
          WHERE branch_id = $1 AND status IN ('SENT', 'VIEWED')) AS waiting,
         (SELECT count(*)::int FROM pharmacy_offers
          WHERE branch_id = $1 AND created_at >= date_trunc('day', now())) AS offers_today,
         (SELECT count(*)::int FROM reservations
          WHERE branch_id = $1 AND status = 'COMPLETED'
            AND completed_at >= date_trunc('day', now())) AS completed_today,
         rm.response_rate, rm.average_response_seconds,
         rm.successful_reservations, rm.completed_requests,
         rm.confirmed_not_found
       FROM reliability_metrics rm WHERE rm.branch_id = $1`,
      [pharmacy.branch_id]
    );
    return context.json({ data: result.rows[0] });
  });
  routes.get("/inbox", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `SELECT
         r.id, r.public_reference, r.medicine_name, r.strength, r.dosage_form,
         r.quantity, r.urgency, r.prescription_status, r.area, r.status,
         r.expires_at, r.created_at, d.distance_km, d.match_score, d.status AS dispatch_status,
         o.id AS offer_id, o.status AS offer_status
       FROM request_dispatches d
       JOIN medicine_requests r ON r.id = d.request_id
       LEFT JOIN pharmacy_offers o
         ON o.request_id = r.id AND o.branch_id = d.branch_id
         AND o.status IN ('ACTIVE', 'HOLD_PENDING', 'HELD')
       WHERE d.branch_id = $1
         AND r.status IN ('ACTIVE', 'HOLD_PENDING')
         AND r.expires_at > now()
       ORDER BY
         CASE d.status WHEN 'SENT' THEN 0 WHEN 'VIEWED' THEN 1 ELSE 2 END,
         d.match_score DESC, r.created_at DESC
       LIMIT 100`,
      [pharmacy.branch_id]
    );
    return context.json({ data: result.rows });
  });
  routes.get("/inbox/:requestId", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `SELECT
         r.id, r.public_reference, r.medicine_name, r.strength, r.dosage_form,
         r.quantity, r.urgency, r.prescription_status, r.area, r.status,
         r.expires_at, r.created_at, d.distance_km, d.match_score,
         d.match_reasons, d.status AS dispatch_status
       FROM request_dispatches d
       JOIN medicine_requests r ON r.id = d.request_id
       WHERE d.branch_id = $1 AND r.id = $2 LIMIT 1`,
      [pharmacy.branch_id, context.req.param("requestId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    await database2.query(
      `UPDATE request_dispatches SET status = 'VIEWED',
         viewed_at = COALESCE(viewed_at, now())
       WHERE request_id = $1 AND branch_id = $2 AND status = 'SENT'`,
      [context.req.param("requestId"), pharmacy.branch_id]
    );
    return context.json({ data: result.rows[0] });
  });
  routes.post("/inbox/:requestId/decline", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `UPDATE request_dispatches
       SET status = 'DECLINED', responded_at = now()
       WHERE request_id = $1 AND branch_id = $2
         AND status IN ('SENT', 'VIEWED')
       RETURNING id`,
      [context.req.param("requestId"), pharmacy.branch_id]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "REQUEST_ALREADY_ANSWERED", "\u062A\u0645 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628.");
    }
    return context.json({ data: { declined: true } });
  });
  routes.post("/inbox/:requestId/offers", async (context) => {
    const body = offerSchema.parse(await context.req.json());
    const user = context.get("user");
    const pharmacy = await requireVerifiedPharmacy(database2, user.id);
    const key = context.req.header("Idempotency-Key");
    const fingerprint = requestFingerprint(body);
    const existingId = await getIdempotentResource(database2, {
      principalId: user.id,
      operation: "CREATE_OFFER",
      key,
      requestHash: fingerprint
    });
    if (existingId) {
      const existing = await database2.query(
        "SELECT * FROM pharmacy_offers WHERE id = $1 AND branch_id = $2",
        [existingId, pharmacy.branch_id]
      );
      return context.json({ data: existing.rows[0] });
    }
    const offerId = randomUUID8();
    const expiresAt = new Date(
      Date.now() + config.offerLifetimeMinutes * 6e4
    ).toISOString();
    await database2.transaction(async (transaction) => {
      const request = await transaction.query(
        `SELECT r.patient_id, r.status, r.expires_at, r.medicine_name,
                r.presentation_id
         FROM medicine_requests r
         JOIN request_dispatches d ON d.request_id = r.id
         WHERE r.id = $1 AND d.branch_id = $2
           AND d.status IN ('SENT', 'VIEWED')
         FOR UPDATE`,
        [context.req.param("requestId"), pharmacy.branch_id]
      );
      const row = request.rows[0];
      if (!row || row.status !== "ACTIVE" || new Date(row.expires_at).getTime() <= Date.now()) {
        throw new ApiError(
          409,
          "REQUEST_NOT_OFFERABLE",
          "\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u0637\u0644\u0628 \u0623\u0648 \u0644\u0645 \u064A\u0639\u062F \u064A\u0642\u0628\u0644 \u0639\u0631\u0648\u0636\u064B\u0627."
        );
      }
      await transaction.query(
        `INSERT INTO pharmacy_offers
          (id, request_id, branch_id, offer_type, offered_brand,
           offered_strength, offered_form, available_quantity, price_iqd,
           pickup_enabled, delivery_enabled, preparation_minutes, note, expires_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          offerId,
          context.req.param("requestId"),
          pharmacy.branch_id,
          body.offerType,
          body.offeredBrand,
          body.offeredStrength,
          body.offeredForm,
          body.availableQuantity,
          body.priceIqd,
          body.pickupEnabled,
          body.deliveryEnabled,
          body.preparationMinutes,
          body.note,
          expiresAt
        ]
      );
      await transaction.query(
        `UPDATE request_dispatches
         SET status = 'RESPONDED', responded_at = now()
         WHERE request_id = $1 AND branch_id = $2`,
        [context.req.param("requestId"), pharmacy.branch_id]
      );
      if (body.offerType === "EXACT" || body.offerType === "PARTIAL") {
        await transaction.query(
          `INSERT INTO availability_signals
            (id, branch_id, presentation_id, medicine_name, source, state,
             quantity, expires_at)
           VALUES ($1, $2, $3, $4, 'PHARMACIST_CONFIRMATION', $5, $6,
             now() + interval '15 minutes')`,
          [
            randomUUID8(),
            pharmacy.branch_id,
            row.presentation_id,
            row.medicine_name,
            body.offerType === "EXACT" ? "AVAILABLE" : "LOW",
            body.availableQuantity
          ]
        );
      }
      await recordIdempotency(transaction, {
        principalId: user.id,
        operation: "CREATE_OFFER",
        key,
        resourceId: offerId,
        requestHash: fingerprint
      });
      await createNotification(transaction, {
        userId: row.patient_id,
        eventType: "OFFER_RECEIVED",
        title: "\u0648\u0635\u0644 \u0639\u0631\u0636 \u062C\u062F\u064A\u062F",
        body: "\u0631\u062F\u0651\u062A \u0635\u064A\u062F\u0644\u064A\u0629 \u0642\u0631\u064A\u0628\u0629 \u0639\u0644\u0649 \u0637\u0644\u0628\u0643. \u0627\u0641\u062A\u062D \u062F\u0648\u0627\u0626\u064A \u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644.",
        resourceType: "REQUEST",
        resourceId: context.req.param("requestId")
      });
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: "PHARMACY",
        action: "OFFER_CREATED",
        resourceType: "PHARMACY_OFFER",
        resourceId: offerId,
        requestId: context.get("requestId")
      });
    });
    const result = await database2.query(
      "SELECT * FROM pharmacy_offers WHERE id = $1",
      [offerId]
    );
    return context.json({ data: result.rows[0] }, 201);
  });
  routes.get("/reservations", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `SELECT
         res.*, r.public_reference AS request_reference, r.medicine_name,
         r.strength, r.quantity, o.price_iqd, o.offered_brand,
         o.preparation_minutes
       FROM reservations res
       JOIN medicine_requests r ON r.id = res.request_id
       JOIN pharmacy_offers o ON o.id = res.offer_id
       WHERE res.branch_id = $1
       ORDER BY
         CASE res.status
           WHEN 'PENDING_ACK' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'READY' THEN 2
           ELSE 3 END,
         res.created_at DESC
       LIMIT 100`,
      [pharmacy.branch_id]
    );
    return context.json({ data: result.rows });
  });
  routes.post("/reservations/:reservationId/acknowledge", async (context) => {
    const user = context.get("user");
    const pharmacy = await requireVerifiedPharmacy(database2, user.id);
    const holdExpiresAt = new Date(
      Date.now() + config.reservationHoldMinutes * 6e4
    ).toISOString();
    await database2.transaction(async (transaction) => {
      const result2 = await transaction.query(
        `SELECT id, request_id, offer_id, patient_id, status,
                acknowledgement_deadline
         FROM reservations
         WHERE id = $1 AND branch_id = $2
         FOR UPDATE`,
        [context.req.param("reservationId"), pharmacy.branch_id]
      );
      const reservation = result2.rows[0];
      if (!reservation || reservation.status !== "PENDING_ACK" || new Date(reservation.acknowledgement_deadline).getTime() <= Date.now()) {
        throw new ApiError(
          409,
          "RESERVATION_NOT_ACKNOWLEDGEABLE",
          "\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u0629 \u062A\u0623\u0643\u064A\u062F \u0647\u0630\u0627 \u0627\u0644\u062D\u062C\u0632."
        );
      }
      await transaction.query(
        `UPDATE reservations
         SET status = 'ACTIVE', acknowledged_at = now(), hold_expires_at = $1,
             updated_at = now()
         WHERE id = $2`,
        [holdExpiresAt, reservation.id]
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = 'RESERVED', version = version + 1, updated_at = now()
         WHERE id = $1 AND status = 'HOLD_PENDING'`,
        [reservation.request_id]
      );
      await transaction.query(
        `UPDATE pharmacy_offers SET status = CASE
           WHEN id = $1 THEN 'HELD' ELSE 'SUPERSEDED' END,
           updated_at = now()
         WHERE request_id = $2
           AND status IN ('ACTIVE', 'HOLD_PENDING')`,
        [reservation.offer_id, reservation.request_id]
      );
      await transaction.query(
        `INSERT INTO conversations
          (id, reservation_id, patient_id, branch_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (reservation_id) DO NOTHING`,
        [
          randomUUID8(),
          reservation.id,
          reservation.patient_id,
          pharmacy.branch_id
        ]
      );
      await createNotification(transaction, {
        userId: reservation.patient_id,
        eventType: "RESERVATION_ACCEPTED",
        title: "\u0623\u0643\u062F\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u062D\u062C\u0632",
        body: "\u062D\u064F\u0641\u0638 \u0627\u0644\u062F\u0648\u0627\u0621 \u0645\u0624\u0642\u062A\u064B\u0627. \u0627\u0641\u062A\u062D \u062F\u0648\u0627\u0626\u064A \u0644\u0645\u0639\u0631\u0641\u0629 \u0627\u0644\u0648\u0642\u062A \u0648\u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A.",
        resourceType: "RESERVATION",
        resourceId: reservation.id
      });
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: "PHARMACY",
        action: "RESERVATION_ACKNOWLEDGED",
        resourceType: "RESERVATION",
        resourceId: reservation.id,
        requestId: context.get("requestId")
      });
    });
    const result = await database2.query(
      "SELECT * FROM reservations WHERE id = $1",
      [context.req.param("reservationId")]
    );
    return context.json({ data: result.rows[0] });
  });
  routes.post("/reservations/:reservationId/ready", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `UPDATE reservations SET status = 'READY', updated_at = now()
       WHERE id = $1 AND branch_id = $2 AND status = 'ACTIVE'
         AND hold_expires_at > now()
       RETURNING patient_id`,
      [context.req.param("reservationId"), pharmacy.branch_id]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "RESERVATION_NOT_READYABLE", "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062D\u062C\u0632.");
    }
    await database2.query(
      `UPDATE medicine_requests SET status = 'READY', updated_at = now()
       WHERE id = (SELECT request_id FROM reservations WHERE id = $1)`,
      [context.req.param("reservationId")]
    );
    await createNotification(database2, {
      userId: result.rows[0].patient_id,
      eventType: "READY_FOR_PICKUP",
      title: "\u062F\u0648\u0627\u0624\u0643 \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u0644\u0627\u0645",
      body: "\u0623\u0643\u062F\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u062D\u062C\u0632. \u0627\u0641\u062A\u062D \u062F\u0648\u0627\u0626\u064A \u0644\u0644\u062A\u0641\u0627\u0635\u064A\u0644.",
      resourceType: "RESERVATION",
      resourceId: context.req.param("reservationId")
    });
    return context.json({ data: { status: "READY" } });
  });
  routes.post("/reservations/:reservationId/complete", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    await database2.transaction(async (transaction) => {
      const result = await transaction.query(
        `UPDATE reservations
         SET status = 'COMPLETED', completed_at = now(), updated_at = now()
         WHERE id = $1 AND branch_id = $2
           AND status IN ('ACTIVE', 'READY')
           AND hold_expires_at > now()
         RETURNING request_id, offer_id, patient_id`,
        [context.req.param("reservationId"), pharmacy.branch_id]
      );
      const reservation = result.rows[0];
      if (!reservation) {
        throw new ApiError(
          409,
          "RESERVATION_NOT_COMPLETABLE",
          "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0643\u0645\u0627\u0644 \u0647\u0630\u0627 \u0627\u0644\u062D\u062C\u0632."
        );
      }
      await transaction.query(
        `UPDATE medicine_requests SET status = 'COMPLETED', updated_at = now()
         WHERE id = $1`,
        [reservation.request_id]
      );
      await transaction.query(
        `UPDATE pharmacy_offers SET status = 'FULFILLED', updated_at = now()
         WHERE id = $1`,
        [reservation.offer_id]
      );
      await transaction.query(
        `UPDATE reliability_metrics
         SET successful_reservations = successful_reservations + 1,
             completed_requests = completed_requests + 1,
             updated_at = now()
         WHERE branch_id = $1`,
        [pharmacy.branch_id]
      );
      await createNotification(transaction, {
        userId: reservation.patient_id,
        eventType: "REQUEST_COMPLETED",
        title: "\u0627\u0643\u062A\u0645\u0644 \u0637\u0644\u0628 \u0627\u0644\u062F\u0648\u0627\u0621",
        body: "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0628\u0646\u062C\u0627\u062D.",
        resourceType: "RESERVATION",
        resourceId: context.req.param("reservationId")
      });
    });
    return context.json({ data: { status: "COMPLETED" } });
  });
  routes.post("/reservations/:reservationId/fail", async (context) => {
    const body = z4.object({ reason: z4.string().trim().min(3).max(300) }).strict().parse(await context.req.json());
    const pharmacy = await requireVerifiedPharmacy(
      database2,
      context.get("user").id
    );
    const result = await database2.query(
      `UPDATE reservations
       SET status = 'FAILED', failure_reason = $1, updated_at = now()
       WHERE id = $2 AND branch_id = $3
         AND status IN ('PENDING_ACK', 'ACTIVE', 'READY')
       RETURNING patient_id, request_id`,
      [body.reason, context.req.param("reservationId"), pharmacy.branch_id]
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "RESERVATION_NOT_FAILABLE", "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062D\u062C\u0632.");
    }
    await database2.query(
      `UPDATE medicine_requests
       SET status = CASE WHEN expires_at > now() THEN 'ACTIVE' ELSE 'EXPIRED' END,
           updated_at = now()
       WHERE id = $1`,
      [result.rows[0].request_id]
    );
    await createNotification(database2, {
      userId: result.rows[0].patient_id,
      eventType: "RESERVATION_FAILED",
      title: "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062D\u062C\u0632",
      body: "\u0623\u0628\u0644\u063A\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0639\u0646 \u0645\u0634\u0643\u0644\u0629. \u064A\u0645\u0643\u0646\u0643 \u0645\u0631\u0627\u062C\u0639\u0629 \u0637\u0644\u0628\u0643 \u0644\u0644\u0628\u062D\u062B \u0645\u062C\u062F\u062F\u064B\u0627.",
      resourceType: "REQUEST",
      resourceId: result.rows[0].request_id
    });
    return context.json({ data: { status: "FAILED" } });
  });
  routes.get("/notifications", async (context) => {
    const result = await database2.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [context.get("user").id]
    );
    return context.json({ data: result.rows });
  });
  return routes;
}

// server/routes/public.ts
import { Hono as Hono6 } from "hono";
import { z as z5 } from "zod";
var locationQuery = z5.object({
  lat: z5.coerce.number().min(-90).max(90),
  lng: z5.coerce.number().min(-180).max(180),
  radiusKm: z5.coerce.number().min(0.5).max(20).default(5)
});
function publicRoutes(database2) {
  const routes = new Hono6();
  routes.get("/medicines/search", async (context) => {
    const query = z5.string().trim().min(2).max(100).parse(context.req.query("q"));
    const normalized = query.toLocaleLowerCase("en-US");
    const result = await database2.query(
      `SELECT DISTINCT
         mp.id, mp.brand_name, mp.strength, mp.dosage_form, mp.pack_size,
         m.generic_name, m.classification
       FROM medicine_presentations mp
       JOIN medicines m ON m.id = mp.medicine_id
       LEFT JOIN medicine_aliases ma ON ma.presentation_id = mp.id
       WHERE m.active = true
         AND (
           lower(mp.brand_name) LIKE '%' || $1 || '%'
           OR lower(m.generic_name) LIKE '%' || $1 || '%'
           OR ma.normalized_alias LIKE '%' || $1 || '%'
         )
       ORDER BY mp.brand_name
       LIMIT 20`,
      [normalized]
    );
    return context.json({ data: result.rows });
  });
  routes.get("/pharmacies", async (context) => {
    const location = locationQuery.parse(context.req.query());
    const result = await database2.query(
      `SELECT
         b.id, p.id AS pharmacy_id, p.name AS pharmacy_name,
         b.name AS branch_name, b.district, b.address, b.latitude, b.longitude,
         b.pickup_enabled, b.delivery_enabled, b.accepting_requests,
         rm.response_rate, rm.average_response_seconds, rm.successful_reservations
       FROM pharmacy_branches b
       JOIN pharmacies p ON p.id = b.pharmacy_id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       WHERE p.verification_status = 'VERIFIED'
         AND b.operational_status = 'ACTIVE'`
    );
    const data = result.rows.map((branch) => ({
      ...branch,
      distanceKm: haversineDistanceKm(
        location.lat,
        location.lng,
        branch.latitude,
        branch.longitude
      )
    })).filter((branch) => branch.distanceKm <= location.radiusKm).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 50);
    return context.json({ data });
  });
  routes.get("/pharmacies/:branchId", async (context) => {
    const result = await database2.query(
      `SELECT
         b.id, p.id AS pharmacy_id, p.name AS pharmacy_name,
         b.name AS branch_name, b.governorate, b.district, b.address, b.landmark,
         b.latitude, b.longitude, b.opening_hours, b.pickup_enabled,
         b.delivery_enabled, b.accepting_requests, p.verification_status,
         rm.response_rate, rm.average_response_seconds,
         rm.successful_reservations, rm.completed_requests,
         rm.confirmed_not_found
       FROM pharmacy_branches b
       JOIN pharmacies p ON p.id = b.pharmacy_id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       WHERE b.id = $1
         AND p.verification_status = 'VERIFIED'
         AND b.operational_status = 'ACTIVE'
       LIMIT 1`,
      [context.req.param("branchId")]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "PHARMACY_NOT_FOUND", "\u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
    }
    return context.json({ data: result.rows[0] });
  });
  routes.get("/availability", async (context) => {
    const query = z5.object({
      medicine: z5.string().trim().min(2).max(120),
      lat: z5.coerce.number().min(-90).max(90),
      lng: z5.coerce.number().min(-180).max(180),
      radiusKm: z5.coerce.number().min(0.5).max(20).default(5)
    }).parse(context.req.query());
    const result = await database2.query(
      `SELECT DISTINCT ON (s.branch_id)
         s.id AS signal_id, s.medicine_name, s.state, s.source,
         s.observed_at, s.expires_at, b.id AS branch_id,
         p.name AS pharmacy_name, b.district, b.latitude, b.longitude,
         b.pickup_enabled, b.delivery_enabled,
         (
           SELECT o.price_iqd FROM pharmacy_offers o
           WHERE o.branch_id = b.id
             AND lower(o.offered_brand) LIKE '%' || lower($1) || '%'
             AND o.created_at > now() - interval '24 hours'
           ORDER BY o.created_at DESC LIMIT 1
         ) AS latest_price_iqd
       FROM availability_signals s
       JOIN pharmacy_branches b ON b.id = s.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE lower(s.medicine_name) LIKE '%' || lower($1) || '%'
         AND s.expires_at > now()
         AND s.state IN ('AVAILABLE', 'LOW', 'ORDERABLE')
         AND p.verification_status = 'VERIFIED'
         AND b.operational_status = 'ACTIVE'
       ORDER BY s.branch_id, s.observed_at DESC`,
      [query.medicine]
    );
    const data = result.rows.map((signal) => ({
      ...signal,
      distanceKm: haversineDistanceKm(
        query.lat,
        query.lng,
        signal.latitude,
        signal.longitude
      )
    })).filter((signal) => signal.distanceKm <= query.radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
    return context.json({ data });
  });
  return routes;
}

// server/routes/shared.ts
import { randomUUID as randomUUID9 } from "crypto";
import { Hono as Hono7 } from "hono";
import { z as z6 } from "zod";
async function authorizedConversation(database2, conversationId, userId) {
  const result = await database2.query(
    `SELECT c.id, c.patient_id, p.owner_user_id AS pharmacy_owner_id,
            res.status AS reservation_status
     FROM conversations c
     JOIN reservations res ON res.id = c.reservation_id
     JOIN pharmacy_branches b ON b.id = c.branch_id
     JOIN pharmacies p ON p.id = b.pharmacy_id
     WHERE c.id = $1
       AND ($2 = c.patient_id OR $2 = p.owner_user_id)
     LIMIT 1`,
    [conversationId, userId]
  );
  const conversation = result.rows[0];
  if (!conversation) {
    throw new ApiError(404, "CONVERSATION_NOT_FOUND", "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  }
  return conversation;
}
function sharedRoutes(database2) {
  const routes = new Hono7();
  routes.use("*", requireAuth(database2));
  routes.get("/notifications", async (context) => {
    const result = await database2.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [context.get("user").id]
    );
    return context.json({ data: result.rows });
  });
  routes.post("/notifications/:notificationId/read", async (context) => {
    const result = await database2.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [context.req.param("notificationId"), context.get("user").id]
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "\u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
    }
    return context.json({ data: { read: true } });
  });
  routes.get("/conversations", async (context) => {
    const user = context.get("user");
    const result = await database2.query(
      `SELECT
         c.id, c.reservation_id, c.created_at, res.status AS reservation_status,
         r.medicine_name, p.name AS pharmacy_name,
         (SELECT body FROM messages m WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       JOIN reservations res ON res.id = c.reservation_id
       JOIN medicine_requests r ON r.id = res.request_id
       JOIN pharmacy_branches b ON b.id = c.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE c.patient_id = $1 OR p.owner_user_id = $1
       ORDER BY c.created_at DESC`,
      [user.id]
    );
    return context.json({ data: result.rows });
  });
  routes.get("/conversations/:conversationId/messages", async (context) => {
    await authorizedConversation(
      database2,
      context.req.param("conversationId"),
      context.get("user").id
    );
    const result = await database2.query(
      `SELECT m.id, m.sender_user_id, u.name AS sender_name, m.body, m.created_at
       FROM messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC LIMIT 200`,
      [context.req.param("conversationId")]
    );
    return context.json({ data: result.rows });
  });
  routes.post("/conversations/:conversationId/messages", async (context) => {
    const body = z6.object({ body: z6.string().trim().min(1).max(1e3) }).strict().parse(await context.req.json());
    const user = context.get("user");
    await enforceRateLimit(database2, "message", user.id, 30, 60);
    const conversation = await authorizedConversation(
      database2,
      context.req.param("conversationId"),
      user.id
    );
    if (!["ACTIVE", "READY"].includes(conversation.reservation_status)) {
      throw new ApiError(
        409,
        "CONVERSATION_CLOSED",
        "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0645\u062A\u0627\u062D\u0629 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u062D\u062C\u0632 \u0627\u0644\u0646\u0634\u0637 \u0641\u0642\u0637."
      );
    }
    const messageId = randomUUID9();
    const recipientId = user.id === conversation.patient_id ? conversation.pharmacy_owner_id : conversation.patient_id;
    await database2.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO messages (id, conversation_id, sender_user_id, body)
         VALUES ($1, $2, $3, $4)`,
        [messageId, conversation.id, user.id, body.body]
      );
      await createNotification(transaction, {
        userId: recipientId,
        eventType: "NEW_MESSAGE",
        title: "\u0631\u0633\u0627\u0644\u0629 \u062C\u062F\u064A\u062F\u0629",
        body: "\u0644\u062F\u064A\u0643 \u0631\u0633\u0627\u0644\u0629 \u062C\u062F\u064A\u062F\u0629 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u062D\u062C\u0632 \u0646\u0634\u0637.",
        resourceType: "CONVERSATION",
        resourceId: conversation.id
      });
    });
    return context.json(
      {
        data: {
          id: messageId,
          conversationId: conversation.id,
          senderUserId: user.id,
          body: body.body,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      },
      201
    );
  });
  routes.post("/reports", async (context) => {
    const body = z6.object({
      targetType: z6.enum(["USER", "PHARMACY", "REQUEST", "RESERVATION"]),
      targetId: z6.string().min(1).max(100),
      category: z6.string().trim().min(2).max(100),
      description: z6.string().trim().min(10).max(2e3)
    }).strict().parse(await context.req.json());
    const id = randomUUID9();
    await database2.query(
      `INSERT INTO reports
        (id, reporter_user_id, target_type, target_id, category, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        context.get("user").id,
        body.targetType,
        body.targetId,
        body.category,
        body.description
      ]
    );
    return context.json({ data: { id, status: "OPEN" } }, 201);
  });
  return routes;
}

// server/app.ts
function createApp(database2) {
  const app2 = new Hono8();
  app2.use("*", async (context, next) => {
    const requestId = context.req.header("X-Request-ID") ?? randomUUID10();
    context.set("requestId", requestId);
    context.set("db", database2);
    context.header("X-Request-ID", requestId);
    await next();
  });
  app2.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", config.webOrigin],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"]
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: "no-referrer"
    })
  );
  app2.use(
    "/api/*",
    cors({
      origin: (origin) => origin === config.webOrigin ? origin : "",
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "Idempotency-Key",
        "X-Request-ID"
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600
    })
  );
  app2.use(
    "/api/*",
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (context) => context.json(
        {
          error: {
            code: "BODY_TOO_LARGE",
            message: "\u062D\u062C\u0645 \u0627\u0644\u0637\u0644\u0628 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0645\u0633\u0645\u0648\u062D.",
            requestId: context.get("requestId"),
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        },
        413
      )
    })
  );
  app2.get(
    "/health/live",
    (context) => context.json({ status: "ok", service: "dawai-api" })
  );
  app2.get("/health/ready", async (context) => {
    await database2.query("SELECT 1 AS ready");
    return context.json({ status: "ready", database: "connected" });
  });
  app2.route("/api/v1/auth", authRoutes(database2));
  app2.route("/api/v1", publicRoutes(database2));
  app2.route("/api/v1/patient", patientRoutes(database2));
  app2.route("/api/v1/pharmacy", pharmacyRoutes(database2));
  app2.route("/api/v1/admin", adminRoutes(database2));
  app2.route("/api/v1/files", fileRoutes(database2));
  app2.route("/api/v1", sharedRoutes(database2));
  app2.notFound(
    (context) => context.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.",
          requestId: context.get("requestId") ?? randomUUID10(),
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      },
      404
    )
  );
  app2.onError((error, context) => {
    const requestId = context.get("requestId") ?? randomUUID10();
    if (error instanceof ZodError) {
      return context.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062F\u062E\u0644\u0629.",
            details: error.issues.map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
              message: issue.message
            })),
            requestId,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        },
        422
      );
    }
    if (error instanceof ApiError) {
      if (error.status === 429 && typeof error.details === "object") {
        const retryAfter = error.details.retryAfterSeconds;
        if (retryAfter) context.header("Retry-After", String(retryAfter));
      }
      return context.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        },
        error.status
      );
    }
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        name: error.name,
        message: error.message
      })
    );
    return context.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.",
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      },
      500
    );
  });
  return app2;
}

// server/index.ts
var database = await createDatabase({ migrate: config.nodeEnv !== "production" });
await bootstrapAdmin(database, config.adminEmail, config.adminPassword);
var app = createApp(database);
if (config.nodeEnv === "production") {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}
var server = serve(
  {
    fetch: app.fetch,
    port: config.port
  },
  (info) => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "dawai-api-listening",
        port: info.port,
        mode: config.nodeEnv
      })
    );
  }
);
var sweep = setInterval(() => {
  void runLifecycleSweep(database).catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "lifecycle-sweep-failed",
        error: error instanceof Error ? error.message : "unknown"
      })
    );
  });
}, 3e4);
sweep.unref();
async function shutdown(signal) {
  clearInterval(sweep);
  server.close();
  await database.close();
  console.log(JSON.stringify({ level: "info", message: "shutdown", signal }));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
//# sourceMappingURL=index.js.map