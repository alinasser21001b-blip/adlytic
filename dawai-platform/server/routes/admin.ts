import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { hashPassword, normalizeEmail, requireAuth } from "../security/auth";
import { writeAudit } from "../services/audit";
import { createNotification } from "../services/notifications";
import type { AppVariables } from "../types";

export async function bootstrapAdmin(
  database: Database,
  email: string | undefined,
  password: string | undefined,
): Promise<void> {
  if (!email && !password) return;
  if (!email || !password || password.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_REQUIRES_EMAIL_AND_12_CHAR_PASSWORD");
  }
  const normalized = normalizeEmail(email);
  const existing = await database.query(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [normalized],
  );
  if (existing.rows[0]) return;
  const id = randomUUID();
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO users
        (id, role, name, email, password_hash)
       VALUES ($1, 'ADMIN', 'Dawai Administrator', $2, $3)`,
      [id, normalized, await hashPassword(password)],
    );
    await writeAudit(transaction, {
      actorUserId: id,
      actorRole: "ADMIN",
      action: "ADMIN_BOOTSTRAPPED",
      resourceType: "USER",
      resourceId: id,
    });
  });
}

export function adminRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireAuth(database, ["ADMIN"]));

  routes.get("/dashboard", async (context) => {
    const result = await database.query(
      `SELECT
         (SELECT count(*)::int FROM users WHERE status = 'ACTIVE') AS active_users,
         (SELECT count(*)::int FROM pharmacies
          WHERE verification_status IN ('PENDING', 'UNDER_REVIEW')) AS pending_verifications,
         (SELECT count(*)::int FROM pharmacies
          WHERE verification_status = 'VERIFIED') AS verified_pharmacies,
         (SELECT count(*)::int FROM medicine_requests
          WHERE status IN ('ACTIVE', 'HOLD_PENDING', 'RESERVED', 'READY', 'NEEDS_CLARIFICATION')) AS active_requests,
         (SELECT count(*)::int FROM reservations
          WHERE status = 'COMPLETED'
            AND completed_at >= date_trunc('day', now())) AS completed_today,
         (SELECT count(*)::int FROM reports WHERE status = 'OPEN') AS open_reports,
         (SELECT count(*)::int FROM reservations
          WHERE status IN ('PENDING_ACK', 'ACTIVE', 'READY')) AS active_holds,
         (SELECT count(*)::int FROM reservations
          WHERE status = 'EXPIRED'
            AND updated_at >= now() - interval '24 hours') AS expired_holds_24h,
         (SELECT count(*)::int FROM reservations
          WHERE status = 'FAILED'
            AND updated_at >= now() - interval '24 hours') AS failed_fulfillment_24h,
         (SELECT count(*)::int FROM reservations
          WHERE status = 'NO_SHOW'
            AND updated_at >= now() - interval '24 hours') AS no_shows_24h,
         (SELECT count(*)::int FROM medicine_requests
          WHERE status = 'BLOCKED'
            AND created_at >= now() - interval '7 days') AS safety_blocks_7d,
         (SELECT COALESCE(SUM(confirmed_not_found), 0)::int
          FROM reliability_metrics) AS confirmed_not_found_total`,
    );
    const pilot = await database.query<{
      reservation_pickup_success_rate: number | null;
      median_first_offer_seconds: number | null;
      matchable_with_offer_rate: number | null;
      reservation_success_rate: number | null;
      confirmed_not_found_rate: number | null;
      avg_notifications_per_success: number | null;
    }>(
      `SELECT
         (
           SELECT CASE WHEN count(*) = 0 THEN NULL
             ELSE count(*) FILTER (WHERE status = 'COMPLETED')::float
                  / NULLIF(count(*) FILTER (
                      WHERE status IN ('COMPLETED', 'FAILED', 'EXPIRED', 'NO_SHOW', 'CANCELLED')
                        AND acknowledged_at IS NOT NULL
                    ), 0)
           END
           FROM reservations
           WHERE created_at >= now() - interval '7 days'
         ) AS reservation_pickup_success_rate,
         (
           SELECT (
             SELECT EXTRACT(EPOCH FROM (first_offer - created_at))
             FROM (
               SELECT r.created_at, min(o.created_at) AS first_offer
               FROM medicine_requests r
               JOIN pharmacy_offers o ON o.request_id = r.id
               WHERE r.created_at >= now() - interval '7 days'
                 AND r.status NOT IN ('BLOCKED', 'NEEDS_CLARIFICATION')
               GROUP BY r.id, r.created_at
             ) timed
             ORDER BY EXTRACT(EPOCH FROM (first_offer - created_at))
             LIMIT 1 OFFSET (
               SELECT GREATEST(
                 0,
                 (count(*) - 1) / 2
               )
               FROM (
                 SELECT r.id
                 FROM medicine_requests r
                 JOIN pharmacy_offers o ON o.request_id = r.id
                 WHERE r.created_at >= now() - interval '7 days'
                   AND r.status NOT IN ('BLOCKED', 'NEEDS_CLARIFICATION')
                 GROUP BY r.id
               ) c
             )
           )
         ) AS median_first_offer_seconds,
         (
           SELECT CASE WHEN count(*) = 0 THEN NULL
             ELSE count(*) FILTER (WHERE offer_count > 0)::float / count(*)
           END
           FROM (
             SELECT r.id,
                    (SELECT count(*) FROM pharmacy_offers o WHERE o.request_id = r.id) AS offer_count
             FROM medicine_requests r
             WHERE r.created_at >= now() - interval '7 days'
               AND r.status NOT IN ('BLOCKED', 'DRAFT', 'NEEDS_CLARIFICATION')
           ) matchable
         ) AS matchable_with_offer_rate,
         (
           SELECT CASE WHEN count(*) = 0 THEN NULL
             ELSE count(*) FILTER (WHERE status IN ('ACTIVE', 'READY', 'COMPLETED'))::float
                  / NULLIF(count(*), 0)
           END
           FROM reservations
           WHERE created_at >= now() - interval '7 days'
         ) AS reservation_success_rate,
         (
           SELECT CASE
             WHEN COALESCE(SUM(completed_requests + confirmed_not_found), 0) = 0 THEN NULL
             ELSE SUM(confirmed_not_found)::float
                  / NULLIF(SUM(completed_requests + confirmed_not_found), 0)
           END
           FROM reliability_metrics
         ) AS confirmed_not_found_rate,
         (
           SELECT CASE WHEN success_count = 0 THEN NULL
             ELSE notification_count::float / success_count
           END
           FROM (
             SELECT
               (SELECT count(*)::int FROM reservations
                WHERE status = 'COMPLETED'
                  AND completed_at >= now() - interval '7 days') AS success_count,
               (SELECT count(*)::int FROM notifications
                WHERE event_type = 'NEARBY_REQUEST'
                  AND created_at >= now() - interval '7 days') AS notification_count
           ) counts
         ) AS avg_notifications_per_success`,
    );
    return context.json({
      data: {
        ...result.rows[0],
        pilot_metrics: {
          window: "7d",
          targets: {
            median_first_offer_seconds: 300,
            matchable_with_offer_rate: 0.6,
            reservation_success_rate: 0.7,
            confirmed_not_found_rate: 0.05,
            avg_notifications_per_success: 8,
          },
          ...pilot.rows[0],
        },
      },
    });
  });

  routes.get("/verifications", async (context) => {
    const status = context.req.query("status") ?? "PENDING";
    if (
      !["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"].includes(
        status,
      )
    ) {
      throw new ApiError(422, "STATUS_INVALID", "حالة التحقق غير صالحة.");
    }
    const result = await database.query(
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
      [status],
    );
    return context.json({ data: result.rows });
  });

  routes.get("/verifications/:pharmacyId", async (context) => {
    const result = await database.query(
      `SELECT
         p.*, b.id AS branch_id, b.name AS branch_name, b.governorate,
         b.district, b.address, b.landmark, b.latitude, b.longitude,
         b.opening_hours, b.pickup_enabled, b.delivery_enabled,
         u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
       FROM pharmacies p
       JOIN users u ON u.id = p.owner_user_id
       JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       WHERE p.id = $1 LIMIT 1`,
      [context.req.param("pharmacyId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "PHARMACY_NOT_FOUND", "الصيدلية غير موجودة.");
    }
    const documents = await database.query(
      `SELECT id, document_type, status, secure_file_id, created_at
       FROM verification_documents WHERE pharmacy_id = $1`,
      [context.req.param("pharmacyId")],
    );
    return context.json({
      data: { ...result.rows[0], documents: documents.rows },
    });
  });

  routes.post("/verifications/:pharmacyId/approve", async (context) => {
    const admin = context.get("user");
    await database.transaction(async (transaction) => {
      const docs = await transaction.query(
        `SELECT id FROM verification_documents
         WHERE pharmacy_id = $1 AND document_type = 'LICENSE'
         LIMIT 1`,
        [context.req.param("pharmacyId")],
      );
      if (!docs.rows[0]) {
        throw new ApiError(
          422,
          "LICENSE_DOCUMENT_REQUIRED",
          "لا يمكن الاعتماد بدون صورة إجازة صيدلية مرفقة.",
        );
      }
      const result = await transaction.query<{ owner_user_id: string }>(
        `UPDATE pharmacies
         SET verification_status = 'VERIFIED', verification_reason = NULL,
             verified_at = now(), verified_by = $1, updated_at = now()
         WHERE id = $2
           AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'REJECTED')
         RETURNING owner_user_id`,
        [admin.id, context.req.param("pharmacyId")],
      );
      const pharmacy = result.rows[0];
      if (!pharmacy) {
        throw new ApiError(
          409,
          "VERIFICATION_NOT_APPROVABLE",
          "لا يمكن اعتماد هذه الصيدلية من حالتها الحالية.",
        );
      }
      await transaction.query(
        `UPDATE verification_documents
         SET status = 'ACCEPTED'
         WHERE pharmacy_id = $1 AND document_type = 'LICENSE'`,
        [context.req.param("pharmacyId")],
      );
      await transaction.query(
        `UPDATE pharmacy_branches
         SET accepting_requests = true, operational_status = 'ACTIVE',
             updated_at = now()
         WHERE pharmacy_id = $1`,
        [context.req.param("pharmacyId")],
      );
      await createNotification(transaction, {
        userId: pharmacy.owner_user_id,
        eventType: "PHARMACY_VERIFIED",
        title: "تم اعتماد الصيدلية",
        body: "يمكنك الآن استقبال طلبات الدواء القريبة.",
        resourceType: "PHARMACY",
        resourceId: context.req.param("pharmacyId"),
      });
      await writeAudit(transaction, {
        actorUserId: admin.id,
        actorRole: "ADMIN",
        action: "PHARMACY_VERIFIED",
        resourceType: "PHARMACY",
        resourceId: context.req.param("pharmacyId"),
        requestId: context.get("requestId"),
      });
    });
    return context.json({ data: { status: "VERIFIED" } });
  });

  routes.post("/verifications/:pharmacyId/reject", async (context) => {
    const body = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(await context.req.json());
    const admin = context.get("user");
    const result = await database.query<{ owner_user_id: string }>(
      `UPDATE pharmacies
       SET verification_status = 'REJECTED', verification_reason = $1,
           verified_by = $2, updated_at = now()
       WHERE id = $3
         AND verification_status IN ('PENDING', 'UNDER_REVIEW')
       RETURNING owner_user_id`,
      [body.reason, admin.id, context.req.param("pharmacyId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "VERIFICATION_NOT_REJECTABLE", "تعذر رفض الطلب.");
    }
    await createNotification(database, {
      userId: result.rows[0].owner_user_id,
      eventType: "PHARMACY_VERIFICATION_REJECTED",
      title: "تحتاج بيانات الصيدلية إلى تعديل",
      body: "افتح حالة التحقق للاطلاع على سبب القرار.",
      resourceType: "PHARMACY",
      resourceId: context.req.param("pharmacyId"),
    });
    return context.json({ data: { status: "REJECTED" } });
  });

  routes.get("/users", async (context) => {
    const result = await database.query(
      `SELECT id, role, status, name, email, phone, created_at, updated_at
       FROM users ORDER BY created_at DESC LIMIT 200`,
    );
    return context.json({ data: result.rows });
  });

  routes.post("/users/:userId/suspend", async (context) => {
    const body = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(await context.req.json());
    const admin = context.get("user");
    if (context.req.param("userId") === admin.id) {
      throw new ApiError(409, "SELF_SUSPENSION_FORBIDDEN", "لا يمكن تعليق حسابك.");
    }
    await database.transaction(async (transaction) => {
      const result = await transaction.query<{ id: string; role: string }>(
        `UPDATE users SET status = 'SUSPENDED', updated_at = now()
         WHERE id = $1 AND status = 'ACTIVE' AND role <> 'ADMIN'
         RETURNING id, role`,
        [context.req.param("userId")],
      );
      if (!result.rows[0]) {
        throw new ApiError(409, "USER_NOT_SUSPENDABLE", "تعذر تعليق المستخدم.");
      }
      await transaction.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [context.req.param("userId")],
      );
      await writeAudit(transaction, {
        actorUserId: admin.id,
        actorRole: "ADMIN",
        action: "USER_SUSPENDED",
        resourceType: "USER",
        resourceId: context.req.param("userId"),
        requestId: context.get("requestId"),
        metadata: { reasonRecorded: Boolean(body.reason) },
      });
    });
    return context.json({ data: { status: "SUSPENDED" } });
  });

  routes.post("/users/:userId/restore", async (context) => {
    const result = await database.query(
      `UPDATE users SET status = 'ACTIVE', updated_at = now()
       WHERE id = $1 AND status = 'SUSPENDED' AND role <> 'ADMIN'
       RETURNING id`,
      [context.req.param("userId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "USER_NOT_RESTORABLE", "تعذر استعادة المستخدم.");
    }
    return context.json({ data: { status: "ACTIVE" } });
  });

  routes.get("/pharmacies", async (context) => {
    const result = await database.query(
      `SELECT p.id, p.name, p.pharmacist_name, p.verification_status,
              p.license_number, p.created_at, b.id AS branch_id,
              b.district, b.operational_status, b.accepting_requests,
              rm.response_rate, rm.completed_requests, rm.confirmed_not_found
       FROM pharmacies p
       JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       ORDER BY p.created_at DESC LIMIT 200`,
    );
    return context.json({ data: result.rows });
  });

  routes.post("/pharmacies/:pharmacyId/suspend", async (context) => {
    const body = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(await context.req.json());
    const admin = context.get("user");
    await database.transaction(async (transaction) => {
      const result = await transaction.query<{ owner_user_id: string }>(
        `UPDATE pharmacies
         SET verification_status = 'SUSPENDED', verification_reason = $1,
             updated_at = now()
         WHERE id = $2 AND verification_status = 'VERIFIED'
         RETURNING owner_user_id`,
        [body.reason, context.req.param("pharmacyId")],
      );
      if (!result.rows[0]) {
        throw new ApiError(409, "PHARMACY_NOT_SUSPENDABLE", "تعذر تعليق الصيدلية.");
      }
      await transaction.query(
        `UPDATE pharmacy_branches
         SET operational_status = 'SUSPENDED', accepting_requests = false,
             updated_at = now()
         WHERE pharmacy_id = $1`,
        [context.req.param("pharmacyId")],
      );
      await transaction.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [result.rows[0].owner_user_id],
      );
      await writeAudit(transaction, {
        actorUserId: admin.id,
        actorRole: "ADMIN",
        action: "PHARMACY_SUSPENDED",
        resourceType: "PHARMACY",
        resourceId: context.req.param("pharmacyId"),
        requestId: context.get("requestId"),
        metadata: { reason: "recorded-separately" },
      });
    });
    return context.json({ data: { status: "SUSPENDED" } });
  });

  routes.post("/pharmacies/:pharmacyId/restore", async (context) => {
    const admin = context.get("user");
    const result = await database.query(
      `UPDATE pharmacies
       SET verification_status = 'VERIFIED', verification_reason = NULL,
           verified_by = $1, verified_at = now(), updated_at = now()
       WHERE id = $2 AND verification_status = 'SUSPENDED'
       RETURNING id`,
      [admin.id, context.req.param("pharmacyId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "PHARMACY_NOT_RESTORABLE", "تعذر استعادة الصيدلية.");
    }
    await database.query(
      `UPDATE pharmacy_branches
       SET operational_status = 'ACTIVE', accepting_requests = true,
           updated_at = now()
       WHERE pharmacy_id = $1`,
      [context.req.param("pharmacyId")],
    );
    return context.json({ data: { status: "VERIFIED" } });
  });

  routes.get("/requests", async (context) => {
    const result = await database.query(
      `SELECT r.id, r.public_reference, r.status, r.medicine_name, r.strength,
              r.dosage_form, r.quantity, r.urgency, r.area, r.radius_km,
              r.coarse_geohash, r.prescription_status, r.expires_at, r.created_at,
              u.name AS patient_name,
              (SELECT count(*)::int FROM request_dispatches d
               WHERE d.request_id = r.id) AS dispatch_count,
              (SELECT count(*)::int FROM pharmacy_offers o
               WHERE o.request_id = r.id) AS offer_count
       FROM medicine_requests r
       JOIN users u ON u.id = r.patient_id
       ORDER BY r.created_at DESC LIMIT 200`,
    );
    return context.json({ data: result.rows });
  });

  routes.get("/requests/:requestId", async (context) => {
    const request = await database.query(
      `SELECT r.id, r.public_reference, r.status, r.medicine_name, r.strength,
              r.dosage_form, r.quantity, r.urgency, r.area, r.radius_km,
              r.coarse_geohash, r.prescription_status, r.expires_at, r.created_at,
              r.updated_at, r.version,
              u.name AS patient_name
       FROM medicine_requests r
       JOIN users u ON u.id = r.patient_id
       WHERE r.id = $1`,
      [context.req.param("requestId")],
    );
    if (!request.rows[0]) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "الطلب غير موجود.");
    }
    const dispatches = await database.query(
      `SELECT d.id, d.distance_km, d.match_score, d.status, d.sent_at,
              p.name AS pharmacy_name, b.name AS branch_name
       FROM request_dispatches d
       JOIN pharmacy_branches b ON b.id = d.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE d.request_id = $1 ORDER BY d.sent_at`,
      [context.req.param("requestId")],
    );
    const offers = await database.query(
      `SELECT o.id, o.status, o.offer_type, o.offered_brand, o.offered_strength,
              o.price_iqd, o.available_quantity, o.created_at, o.expires_at,
              p.name AS pharmacy_name
       FROM pharmacy_offers o
       JOIN pharmacy_branches b ON b.id = o.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE o.request_id = $1 ORDER BY o.created_at`,
      [context.req.param("requestId")],
    );
    const reservations = await database.query(
      `SELECT id, public_reference, status, fulfillment_method,
              acknowledgement_deadline, hold_expires_at, created_at, completed_at
       FROM reservations WHERE request_id = $1 ORDER BY created_at`,
      [context.req.param("requestId")],
    );
    return context.json({
      data: {
        request: request.rows[0],
        dispatches: dispatches.rows,
        offers: offers.rows,
        reservations: reservations.rows,
      },
    });
  });

  routes.get("/reports", async (context) => {
    const result = await database.query(
      `SELECT r.*, u.name AS reporter_name
       FROM reports r JOIN users u ON u.id = r.reporter_user_id
       ORDER BY CASE r.status WHEN 'OPEN' THEN 0 WHEN 'INVESTIGATING' THEN 1 ELSE 2 END,
                r.created_at DESC
       LIMIT 200`,
    );
    return context.json({ data: result.rows });
  });

  routes.post("/reports/:reportId/resolve", async (context) => {
    const body = z
      .object({
        status: z.enum(["RESOLVED", "DISMISSED"]),
        resolution: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(await context.req.json());
    const result = await database.query(
      `UPDATE reports SET status = $1, resolution = $2, resolved_by = $3,
             resolved_at = now()
       WHERE id = $4 AND status IN ('OPEN', 'INVESTIGATING')
       RETURNING id`,
      [body.status, body.resolution, context.get("user").id, context.req.param("reportId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "REPORT_NOT_RESOLVABLE", "تعذر إغلاق البلاغ.");
    }
    return context.json({ data: { status: body.status } });
  });

  routes.get("/audit-events", async (context) => {
    const result = await database.query(
      `SELECT id, actor_user_id, actor_role, action, resource_type,
              resource_id, result, request_id, metadata, created_at
       FROM audit_events ORDER BY created_at DESC LIMIT 300`,
    );
    return context.json({ data: result.rows });
  });

  return routes;
}
