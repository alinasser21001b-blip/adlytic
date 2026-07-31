import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config";
import type { Database, DbExecutor } from "../db/client";
import { ApiError } from "../errors";
import { requireAuth } from "../security/auth";
import {
  getIdempotentResource,
  recordIdempotency,
  requestFingerprint,
} from "../security/idempotency";
import { enforceRateLimit } from "../security/rate-limit";
import { writeAudit } from "../services/audit";
import { dispatchRequest } from "../services/matching";
import { createNotification } from "../services/notifications";
import type { AppVariables } from "../types";

const createRequestSchema = z
  .object({
    medicineName: z.string().trim().min(2).max(160),
    presentationId: z.string().uuid().or(z.string().startsWith("pres-")).optional(),
    strength: z.string().trim().max(80).optional(),
    dosageForm: z.string().trim().max(80).optional(),
    quantity: z.number().int().min(1).max(20).default(1),
    urgency: z.enum(["NOW", "TODAY", "TOMORROW"]).default("TODAY"),
    prescriptionFileId: z.string().uuid().optional(),
    area: z.string().trim().min(2).max(160),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    pickupPreferred: z.boolean().default(true),
    deliveryPreferred: z.boolean().default(false),
  })
  .strict();

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(20).nullable(),
    defaultArea: z.string().trim().min(2).max(160).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    notificationPreferences: z
      .object({
        inApp: z.boolean(),
        push: z.boolean(),
      })
      .strict(),
  })
  .strict();

function publicReference(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

async function patientRequest(
  database: DbExecutor,
  requestId: string,
  patientId: string,
) {
  const result = await database.query(
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
    [requestId, patientId],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, "REQUEST_NOT_FOUND", "الطلب غير موجود.");
  }
  return result.rows[0];
}

export function patientRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireAuth(database, ["PATIENT"]));

  routes.get("/profile", async (context) => {
    const result = await database.query(
      `SELECT u.id, u.name, u.email, u.phone, u.locale,
              p.default_area, p.latitude, p.longitude,
              p.notification_preferences
       FROM users u
       JOIN patient_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [context.get("user").id],
    );
    return context.json({ data: result.rows[0] });
  });

  routes.put("/profile", async (context) => {
    const body = profileSchema.parse(await context.req.json());
    const userId = context.get("user").id;
    await database.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE users SET name = $1, phone = $2, updated_at = now()
         WHERE id = $3`,
        [body.name, body.phone, userId],
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
          userId,
        ],
      );
    });
    return context.json({ data: { updated: true } });
  });

  routes.post("/requests", async (context) => {
    const body = createRequestSchema.parse(await context.req.json());
    const userId = context.get("user").id;
    await enforceRateLimit(database, "patient-request", userId, 8, 600);
    const key = context.req.header("Idempotency-Key");
    const fingerprint = requestFingerprint(body);
    const existingId = await getIdempotentResource(database, {
      principalId: userId,
      operation: "CREATE_REQUEST",
      key,
      requestHash: fingerprint,
    });
    if (existingId) {
      return context.json({
        data: await patientRequest(database, existingId, userId),
      });
    }

    let classification: string | null = null;
    if (body.presentationId) {
      const presentation = await database.query<{ classification: string }>(
        `SELECT m.classification
         FROM medicine_presentations mp
         JOIN medicines m ON m.id = mp.medicine_id
         WHERE mp.id = $1 AND m.active = true`,
        [body.presentationId],
      );
      if (!presentation.rows[0]) {
        throw new ApiError(
          422,
          "PRESENTATION_UNKNOWN",
          "العرض الدوائي المختار غير معروف.",
        );
      }
      classification = presentation.rows[0].classification;
    }

    if (body.prescriptionFileId) {
      const file = await database.query(
        `SELECT id FROM secure_files
         WHERE id = $1 AND owner_user_id = $2
           AND purpose = 'PRESCRIPTION' AND status = 'READY'`,
        [body.prescriptionFileId, userId],
      );
      if (!file.rows[0]) {
        throw new ApiError(422, "PRESCRIPTION_INVALID", "ملف الوصفة غير صالح.");
      }
    }

    const requestId = randomUUID();
    const status = classification === "CONTROLLED" ? "BLOCKED" : "ACTIVE";
    const expiresAt = new Date(
      Date.now() + config.requestLifetimeMinutes * 60_000,
    ).toISOString();
    const reference = publicReference("DW");

    await database.transaction(async (transaction) => {
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
          expiresAt,
        ],
      );
      if (body.prescriptionFileId) {
        await transaction.query(
          `UPDATE secure_files SET request_id = $1 WHERE id = $2`,
          [requestId, body.prescriptionFileId],
        );
      }
      await recordIdempotency(transaction, {
        principalId: userId,
        operation: "CREATE_REQUEST",
        key: key!,
        resourceId: requestId,
        requestHash: fingerprint,
      });
      await writeAudit(transaction, {
        actorUserId: userId,
        actorRole: "PATIENT",
        action: status === "BLOCKED" ? "REQUEST_BLOCKED" : "REQUEST_CREATED",
        resourceType: "MEDICINE_REQUEST",
        resourceId: requestId,
        requestId: context.get("requestId"),
      });
    });

    let dispatchedCount = 0;
    if (status === "ACTIVE") {
      dispatchedCount = await dispatchRequest(database, {
        id: requestId,
        medicine_name: body.medicineName,
        latitude: body.latitude,
        longitude: body.longitude,
        radius_km: 2,
        pickup_preferred: body.pickupPreferred,
        delivery_preferred: body.deliveryPreferred,
      });
      if (dispatchedCount === 0) {
        await database.query(
          `UPDATE medicine_requests SET status = 'NO_MATCH', updated_at = now()
           WHERE id = $1 AND status = 'ACTIVE'`,
          [requestId],
        );
      }
    }

    return context.json(
      {
        data: {
          ...(await patientRequest(database, requestId, userId)),
          dispatchedCount,
        },
      },
      201,
    );
  });

  routes.get("/requests", async (context) => {
    const limit = Math.min(
      50,
      Math.max(1, Number(context.req.query("limit") ?? 20)),
    );
    const result = await database.query(
      `SELECT
         r.*,
         (SELECT count(*)::int FROM pharmacy_offers o
          WHERE o.request_id = r.id) AS offer_count
       FROM medicine_requests r
       WHERE r.patient_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [context.get("user").id, limit],
    );
    return context.json({ data: result.rows });
  });

  routes.get("/requests/:requestId", async (context) => {
    const data = await patientRequest(
      database,
      context.req.param("requestId"),
      context.get("user").id,
    );
    const reservation = await database.query(
      `SELECT res.*, o.price_iqd, o.offered_brand, p.name AS pharmacy_name,
              b.address, b.district, b.latitude, b.longitude
       FROM reservations res
       JOIN pharmacy_offers o ON o.id = res.offer_id
       JOIN pharmacy_branches b ON b.id = res.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE res.request_id = $1
       ORDER BY res.created_at DESC LIMIT 1`,
      [context.req.param("requestId")],
    );
    return context.json({
      data: { ...data, reservation: reservation.rows[0] ?? null },
    });
  });

  routes.get("/requests/:requestId/offers", async (context) => {
    await patientRequest(
      database,
      context.req.param("requestId"),
      context.get("user").id,
    );
    const result = await database.query(
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
      [context.req.param("requestId")],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/requests/:requestId/expand", async (context) => {
    const body = z
      .object({ radiusKm: z.union([z.literal(5), z.literal(10)]) })
      .strict()
      .parse(await context.req.json());
    const userId = context.get("user").id;
    const request = (await patientRequest(
      database,
      context.req.param("requestId"),
      userId,
    )) as {
      id: string;
      status: string;
      radius_km: number;
      medicine_name: string;
      latitude: number;
      longitude: number;
      pickup_preferred: boolean;
      delivery_preferred: boolean;
      expires_at: string;
    };
    if (
      !["ACTIVE", "NO_MATCH"].includes(request.status) ||
      new Date(request.expires_at).getTime() <= Date.now() ||
      body.radiusKm <= request.radius_km
    ) {
      throw new ApiError(
        409,
        "REQUEST_NOT_EXPANDABLE",
        "لا يمكن توسيع هذا الطلب الآن.",
      );
    }
    await database.query(
      `UPDATE medicine_requests
       SET radius_km = $1, status = 'ACTIVE', version = version + 1,
           updated_at = now()
       WHERE id = $2 AND patient_id = $3`,
      [body.radiusKm, request.id, userId],
    );
    const dispatchedCount = await dispatchRequest(database, {
      id: request.id,
      medicine_name: request.medicine_name,
      latitude: request.latitude,
      longitude: request.longitude,
      radius_km: body.radiusKm,
      pickup_preferred: request.pickup_preferred,
      delivery_preferred: request.delivery_preferred,
    });
    if (dispatchedCount === 0) {
      await database.query(
        `UPDATE medicine_requests SET status = 'NO_MATCH'
         WHERE id = $1 AND status = 'ACTIVE'`,
        [request.id],
      );
    }
    return context.json({
      data: await patientRequest(database, request.id, userId),
    });
  });

  routes.post("/requests/:requestId/cancel", async (context) => {
    const userId = context.get("user").id;
    const result = await database.query(
      `UPDATE medicine_requests
       SET status = 'CANCELLED', version = version + 1, updated_at = now()
       WHERE id = $1 AND patient_id = $2
         AND status IN ('ACTIVE', 'NO_MATCH', 'HOLD_PENDING')
       RETURNING id`,
      [context.req.param("requestId"), userId],
    );
    if (!result.rows[0]) {
      throw new ApiError(
        409,
        "REQUEST_NOT_CANCELLABLE",
        "لا يمكن إلغاء هذا الطلب.",
      );
    }
    await database.query(
      `UPDATE reservations SET status = 'CANCELLED', updated_at = now()
       WHERE request_id = $1 AND status = 'PENDING_ACK'`,
      [context.req.param("requestId")],
    );
    return context.json({ data: { cancelled: true } });
  });

  routes.post("/requests/:requestId/reservations", async (context) => {
    const body = z
      .object({
        offerId: z.string().uuid(),
        fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
      })
      .strict()
      .parse(await context.req.json());
    const userId = context.get("user").id;
    const key = context.req.header("Idempotency-Key");
    const fingerprint = requestFingerprint(body);
    const existingId = await getIdempotentResource(database, {
      principalId: userId,
      operation: "SELECT_OFFER",
      key,
      requestHash: fingerprint,
    });
    if (existingId) {
      const existing = await database.query(
        "SELECT * FROM reservations WHERE id = $1 AND patient_id = $2",
        [existingId, userId],
      );
      return context.json({ data: existing.rows[0] });
    }

    const reservationId = randomUUID();
    const reference = publicReference("RSV");
    const acknowledgementDeadline = new Date(
      Date.now() + config.reservationAckMinutes * 60_000,
    ).toISOString();

    await database.transaction(async (transaction) => {
      const result = await transaction.query<{
        request_id: string;
        request_status: string;
        request_expires_at: string;
        patient_id: string;
        offer_id: string;
        offer_status: string;
        offer_type: string;
        offer_expires_at: string;
        branch_id: string;
        owner_user_id: string;
        pickup_enabled: boolean;
        delivery_enabled: boolean;
      }>(
        `SELECT
           r.id AS request_id, r.status AS request_status,
           r.expires_at AS request_expires_at, r.patient_id,
           o.id AS offer_id, o.status AS offer_status, o.offer_type,
           o.expires_at AS offer_expires_at, o.branch_id, p.owner_user_id,
           o.pickup_enabled, o.delivery_enabled
         FROM medicine_requests r
         JOIN pharmacy_offers o ON o.request_id = r.id
         JOIN pharmacy_branches b ON b.id = o.branch_id
         JOIN pharmacies p ON p.id = b.pharmacy_id
         WHERE r.id = $1 AND o.id = $2 AND r.patient_id = $3
         FOR UPDATE`,
        [context.req.param("requestId"), body.offerId, userId],
      );
      const selected = result.rows[0];
      if (
        !selected ||
        !["ACTIVE", "NO_MATCH"].includes(selected.request_status) ||
        selected.offer_status !== "ACTIVE" ||
        new Date(selected.request_expires_at).getTime() <= Date.now() ||
        new Date(selected.offer_expires_at).getTime() <= Date.now()
      ) {
        throw new ApiError(
          409,
          "OFFER_NOT_SELECTABLE",
          "انتهى العرض أو لم يعد قابلًا للاختيار.",
        );
      }
      if (selected.offer_type === "ALTERNATIVE_REVIEW_REQUIRED") {
        throw new ApiError(
          422,
          "ALTERNATIVE_REQUIRES_REVIEW",
          "البديل يحتاج تواصلًا مع الصيدلي ولا يمكن حجزه تلقائيًا.",
        );
      }
      if (
        (body.fulfillmentMethod === "PICKUP" && !selected.pickup_enabled) ||
        (body.fulfillmentMethod === "DELIVERY" && !selected.delivery_enabled)
      ) {
        throw new ApiError(
          422,
          "FULFILLMENT_UNAVAILABLE",
          "طريقة الاستلام المختارة غير متاحة لهذا العرض.",
        );
      }

      await transaction.query(
        `INSERT INTO reservations
          (id, public_reference, request_id, offer_id, patient_id, branch_id,
           fulfillment_method, acknowledgement_deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          reservationId,
          reference,
          selected.request_id,
          selected.offer_id,
          userId,
          selected.branch_id,
          body.fulfillmentMethod,
          acknowledgementDeadline,
        ],
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = 'HOLD_PENDING', version = version + 1, updated_at = now()
         WHERE id = $1`,
        [selected.request_id],
      );
      await transaction.query(
        `UPDATE pharmacy_offers SET status = 'HOLD_PENDING', updated_at = now()
         WHERE id = $1`,
        [selected.offer_id],
      );
      await recordIdempotency(transaction, {
        principalId: userId,
        operation: "SELECT_OFFER",
        key: key!,
        resourceId: reservationId,
        requestHash: fingerprint,
      });
      await createNotification(transaction, {
        userId: selected.owner_user_id,
        eventType: "OFFER_SELECTED",
        title: "اختار المريض عرضك",
        body: "افتح الحجز وأكد حفظ الدواء قبل انتهاء مهلة الرد.",
        resourceType: "RESERVATION",
        resourceId: reservationId,
      });
      await writeAudit(transaction, {
        actorUserId: userId,
        actorRole: "PATIENT",
        action: "OFFER_SELECTED",
        resourceType: "RESERVATION",
        resourceId: reservationId,
        requestId: context.get("requestId"),
      });
    });

    const result = await database.query(
      "SELECT * FROM reservations WHERE id = $1",
      [reservationId],
    );
    return context.json({ data: result.rows[0] }, 201);
  });

  routes.get("/reservations/:reservationId", async (context) => {
    const result = await database.query(
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
      [context.req.param("reservationId"), context.get("user").id],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "RESERVATION_NOT_FOUND", "الحجز غير موجود.");
    }
    return context.json({ data: result.rows[0] });
  });

  routes.get("/notifications", async (context) => {
    const result = await database.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [context.get("user").id],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/notifications/:notificationId/read", async (context) => {
    const result = await database.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [context.req.param("notificationId"), context.get("user").id],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "الإشعار غير موجود.");
    }
    return context.json({ data: { read: true } });
  });

  routes.get("/saved-pharmacies", async (context) => {
    const result = await database.query(
      `SELECT b.id, p.name AS pharmacy_name, b.name AS branch_name,
              b.district, b.address, b.pickup_enabled, b.delivery_enabled
       FROM saved_pharmacies s
       JOIN pharmacy_branches b ON b.id = s.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE s.patient_id = $1
       ORDER BY s.created_at DESC`,
      [context.get("user").id],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/saved-pharmacies/:branchId", async (context) => {
    await database.query(
      `INSERT INTO saved_pharmacies (patient_id, branch_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [context.get("user").id, context.req.param("branchId")],
    );
    return context.json({ data: { saved: true } }, 201);
  });

  routes.delete("/saved-pharmacies/:branchId", async (context) => {
    await database.query(
      "DELETE FROM saved_pharmacies WHERE patient_id = $1 AND branch_id = $2",
      [context.get("user").id, context.req.param("branchId")],
    );
    return context.json({ data: { saved: false } });
  });

  return routes;
}
