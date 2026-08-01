import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { computeSkuTrust, SKU_TRUST_THRESHOLD } from "../services/clinical";
import { normalizeSkuKey } from "../services/sku-key";
import { config } from "../config";
import type { Database, DbExecutor } from "../db/client";
import { ApiError } from "../errors";
import { requireAuth } from "../security/auth";
import {
  getIdempotentResource,
  recordIdempotency,
  requestFingerprint,
} from "../security/idempotency";
import { writeAudit } from "../services/audit";
import {
  recordConfirmedNotFound,
  recordPharmacyResponseMetrics,
} from "../services/matching";
import { createNotification } from "../services/notifications";
import type { AppVariables } from "../types";

const onboardingSchema = z
  .object({
    pharmacyName: z.string().trim().min(2).max(160),
    pharmacistName: z.string().trim().min(2).max(160),
    phone: z.string().trim().min(8).max(20),
    licenseNumber: z.string().trim().min(3).max(100),
    licenseIssuer: z.string().trim().min(2).max(160),
    licenseExpiresAt: z.string().date().nullable(),
    branchName: z.string().trim().min(2).max(160),
    governorate: z.string().trim().min(2).max(120),
    district: z.string().trim().min(2).max(120),
    address: z.string().trim().min(5).max(300),
    landmark: z.string().trim().max(200).nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    openingHours: z.record(
      z.string(),
      z.array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)])),
    ),
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
  })
  .strict();

const offerSchema = z
  .object({
    offerType: z.enum([
      "EXACT",
      "PARTIAL",
      "ALTERNATIVE_REVIEW_REQUIRED",
      "ORDERABLE",
    ]),
    offeredBrand: z.string().trim().min(2).max(160),
    offeredStrength: z.string().trim().min(1).max(80),
    offeredForm: z.string().trim().min(1).max(80),
    availableQuantity: z.number().int().min(1).max(1000),
    priceIqd: z.number().int().min(0).max(100_000_000),
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    preparationMinutes: z.number().int().min(0).max(1440),
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

const movementSchema = z
  .object({
    // Normalized below before it becomes a ledger grouping key; raw casing
    // would split one SKU's on-hand across "Panadol" and "panadol".
    medicineName: z.string().trim().min(2).max(200),
    // Additive delta, never an absolute quantity — this is what makes
    // concurrent offline edits safe to merge.
    deltaQty: z.number().int().refine((value) => value !== 0, "delta must be non-zero"),
    reason: z.enum(["SALE", "PURCHASE", "ADJUST", "RETURN", "COUNT"]),
    refType: z.string().trim().max(40).nullish(),
    refId: z.string().trim().max(80).nullish(),
    clientEventId: z.string().trim().min(8).max(200).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .strict();

interface PharmacyContext {
  pharmacy_id: string;
  branch_id: string;
  owner_user_id: string;
  verification_status: string;
  operational_status: string;
  accepting_requests: boolean;
}

async function ownedPharmacy(
  database: DbExecutor,
  userId: string,
): Promise<PharmacyContext | null> {
  const result = await database.query<PharmacyContext>(
    `SELECT p.id AS pharmacy_id, b.id AS branch_id, p.owner_user_id,
            p.verification_status, b.operational_status, b.accepting_requests
     FROM pharmacies p
     JOIN pharmacy_branches b ON b.pharmacy_id = p.id
     WHERE p.owner_user_id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function requireVerifiedPharmacy(
  database: DbExecutor,
  userId: string,
): Promise<PharmacyContext> {
  const pharmacy = await ownedPharmacy(database, userId);
  if (!pharmacy) {
    throw new ApiError(
      403,
      "PHARMACY_ONBOARDING_REQUIRED",
      "أكمل بيانات الصيدلية أولًا.",
    );
  }
  if (
    pharmacy.verification_status !== "VERIFIED" ||
    pharmacy.operational_status !== "ACTIVE"
  ) {
    throw new ApiError(
      403,
      "PHARMACY_NOT_VERIFIED",
      "لا يمكن تنفيذ هذا الإجراء قبل اعتماد الصيدلية.",
    );
  }
  return pharmacy;
}

export function pharmacyRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireAuth(database, ["PHARMACY"]));

  routes.post("/onboarding", async (context) => {
    const body = onboardingSchema.parse(await context.req.json());
    const user = context.get("user");
    const existing = await ownedPharmacy(database, user.id);
    if (existing && existing.verification_status !== "REJECTED") {
      throw new ApiError(
        409,
        "PHARMACY_ALREADY_EXISTS",
        "تم إرسال بيانات الصيدلية مسبقًا.",
      );
    }
    const deliveryEnabled = config.mvpDeliveryEnabled
      ? body.deliveryEnabled
      : false;
    const pharmacyId = existing?.pharmacy_id ?? randomUUID();
    const branchId = existing?.branch_id ?? randomUUID();
    await database.transaction(async (transaction) => {
      if (existing?.verification_status === "REJECTED") {
        await transaction.query(
          `UPDATE pharmacies
           SET name = $1, pharmacist_name = $2, phone = $3, email = $4,
               license_number = $5, license_issuer = $6,
               license_expires_at = $7, verification_status = 'PENDING',
               verification_reason = NULL, resubmitted_at = now(),
               updated_at = now()
           WHERE id = $8 AND owner_user_id = $9`,
          [
            body.pharmacyName,
            body.pharmacistName,
            body.phone,
            user.email,
            body.licenseNumber,
            body.licenseIssuer,
            body.licenseExpiresAt,
            pharmacyId,
            user.id,
          ],
        );
        await transaction.query(
          `UPDATE pharmacy_branches
           SET name = $1, governorate = $2, district = $3, address = $4,
               landmark = $5, latitude = $6, longitude = $7,
               opening_hours = $8::jsonb, pickup_enabled = $9,
               delivery_enabled = $10, accepting_requests = false,
               operational_status = 'ACTIVE', updated_at = now()
           WHERE id = $11 AND pharmacy_id = $12`,
          [
            body.branchName,
            body.governorate,
            body.district,
            body.address,
            body.landmark,
            body.latitude,
            body.longitude,
            JSON.stringify(body.openingHours),
            body.pickupEnabled,
            deliveryEnabled,
            branchId,
            pharmacyId,
          ],
        );
      } else {
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
            body.licenseExpiresAt,
          ],
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
            deliveryEnabled,
          ],
        );
        await transaction.query(
          "INSERT INTO reliability_metrics (branch_id) VALUES ($1)",
          [branchId],
        );
      }
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: "PHARMACY",
        action: existing
          ? "PHARMACY_APPLICATION_RESUBMITTED"
          : "PHARMACY_APPLICATION_SUBMITTED",
        resourceType: "PHARMACY",
        resourceId: pharmacyId,
        requestId: context.get("requestId"),
      });
    });
    return context.json(
      {
        data: {
          pharmacyId,
          branchId,
          verificationStatus: "PENDING",
        },
      },
      existing ? 200 : 201,
    );
  });

  routes.get("/profile", async (context) => {
    const result = await database.query(
      `SELECT p.*, b.id AS branch_id, b.name AS branch_name, b.governorate,
              b.district, b.address, b.landmark, b.latitude, b.longitude,
              b.opening_hours, b.pickup_enabled, b.delivery_enabled,
              b.accepting_requests, b.operational_status
       FROM pharmacies p
       LEFT JOIN pharmacy_branches b ON b.pharmacy_id = p.id
       WHERE p.owner_user_id = $1 LIMIT 1`,
      [context.get("user").id],
    );
    return context.json({ data: result.rows[0] ?? null });
  });

  routes.put("/settings", async (context) => {
    const body = z
      .object({
        openingHours: onboardingSchema.shape.openingHours,
        pickupEnabled: z.boolean(),
        deliveryEnabled: z.boolean(),
        acceptingRequests: z.boolean(),
        operationalStatus: z.enum(["ACTIVE", "PAUSED"]),
      })
      .strict()
      .parse(await context.req.json());
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    await database.query(
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
        pharmacy.branch_id,
      ],
    );
    return context.json({ data: { updated: true } });
  });

  routes.get("/dashboard", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query(
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
      [pharmacy.branch_id],
    );
    return context.json({ data: result.rows[0] });
  });

  routes.get("/inbox", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query(
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
      [pharmacy.branch_id],
    );
    return context.json({ data: result.rows });
  });

  routes.get("/inbox/:requestId", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query(
      `SELECT
         r.id, r.public_reference, r.medicine_name, r.strength, r.dosage_form,
         r.quantity, r.urgency, r.prescription_status, r.area, r.status,
         r.expires_at, r.created_at, d.distance_km, d.match_score,
         d.match_reasons, d.status AS dispatch_status
       FROM request_dispatches d
       JOIN medicine_requests r ON r.id = d.request_id
       WHERE d.branch_id = $1 AND r.id = $2 LIMIT 1`,
      [pharmacy.branch_id, context.req.param("requestId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "الطلب غير موجود.");
    }
    await database.query(
      `UPDATE request_dispatches SET status = 'VIEWED',
         viewed_at = COALESCE(viewed_at, now())
       WHERE request_id = $1 AND branch_id = $2 AND status = 'SENT'`,
      [context.req.param("requestId"), pharmacy.branch_id],
    );
    return context.json({ data: result.rows[0] });
  });

  routes.post("/inbox/:requestId/decline", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query<{
      id: string;
      sent_at: string;
    }>(
      `UPDATE request_dispatches
       SET status = 'DECLINED', responded_at = now()
       WHERE request_id = $1 AND branch_id = $2
         AND status IN ('SENT', 'VIEWED')
       RETURNING id, sent_at`,
      [context.req.param("requestId"), pharmacy.branch_id],
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "REQUEST_ALREADY_ANSWERED", "تم الرد على الطلب.");
    }
    const responseSeconds =
      (Date.now() - new Date(result.rows[0].sent_at).getTime()) / 1000;
    await recordPharmacyResponseMetrics(
      database,
      pharmacy.branch_id,
      responseSeconds,
    );
    return context.json({ data: { declined: true } });
  });

  routes.post("/inbox/:requestId/offers", async (context) => {
    const body = offerSchema.parse(await context.req.json());
    const user = context.get("user");
    const pharmacy = await requireVerifiedPharmacy(database, user.id);
    const key = context.req.header("Idempotency-Key");
    const fingerprint = requestFingerprint(body);
    const existingId = await getIdempotentResource(database, {
      principalId: user.id,
      operation: "CREATE_OFFER",
      key,
      requestHash: fingerprint,
    });
    if (existingId) {
      const existing = await database.query(
        "SELECT * FROM pharmacy_offers WHERE id = $1 AND branch_id = $2",
        [existingId, pharmacy.branch_id],
      );
      return context.json({ data: existing.rows[0] });
    }

    const offerId = randomUUID();
    const expiresAt = new Date(
      Date.now() + config.offerLifetimeMinutes * 60_000,
    ).toISOString();
    await database.transaction(async (transaction) => {
      const request = await transaction.query<{
        patient_id: string;
        status: string;
        expires_at: string;
        medicine_name: string;
        presentation_id: string | null;
      }>(
        `SELECT r.patient_id, r.status, r.expires_at, r.medicine_name,
                r.presentation_id
         FROM medicine_requests r
         JOIN request_dispatches d ON d.request_id = r.id
         WHERE r.id = $1 AND d.branch_id = $2
           AND d.status IN ('SENT', 'VIEWED')
         FOR UPDATE`,
        [context.req.param("requestId"), pharmacy.branch_id],
      );
      const row = request.rows[0];
      if (
        !row ||
        row.status !== "ACTIVE" ||
        new Date(row.expires_at).getTime() <= Date.now()
      ) {
        throw new ApiError(
          409,
          "REQUEST_NOT_OFFERABLE",
          "انتهى الطلب أو لم يعد يقبل عروضًا.",
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
          config.mvpDeliveryEnabled ? body.deliveryEnabled : false,
          body.preparationMinutes,
          body.note,
          expiresAt,
        ],
      );
      const dispatch = await transaction.query<{ sent_at: string }>(
        `UPDATE request_dispatches
         SET status = 'RESPONDED', responded_at = now()
         WHERE request_id = $1 AND branch_id = $2
         RETURNING sent_at`,
        [context.req.param("requestId"), pharmacy.branch_id],
      );
      if (dispatch.rows[0]) {
        const responseSeconds =
          (Date.now() - new Date(dispatch.rows[0].sent_at).getTime()) / 1000;
        await recordPharmacyResponseMetrics(
          transaction,
          pharmacy.branch_id,
          responseSeconds,
        );
      }
      if (body.offerType === "EXACT" || body.offerType === "PARTIAL") {
        await transaction.query(
          `INSERT INTO availability_signals
            (id, branch_id, presentation_id, medicine_name, source, state,
             quantity, expires_at)
           VALUES ($1, $2, $3, $4, 'PHARMACIST_CONFIRMATION', $5, $6,
             now() + interval '15 minutes')`,
          [
            randomUUID(),
            pharmacy.branch_id,
            row.presentation_id,
            row.medicine_name,
            body.offerType === "EXACT" ? "AVAILABLE" : "LOW",
            body.availableQuantity,
          ],
        );
      }
      await recordIdempotency(transaction, {
        principalId: user.id,
        operation: "CREATE_OFFER",
        key: key!,
        resourceId: offerId,
        requestHash: fingerprint,
      });
      await createNotification(transaction, {
        userId: row.patient_id,
        eventType: "OFFER_RECEIVED",
        title: "وصل عرض جديد",
        body: "ردّت صيدلية قريبة على طلبك. افتح دوائي لمراجعة التفاصيل.",
        resourceType: "REQUEST",
        resourceId: context.req.param("requestId"),
      });
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: "PHARMACY",
        action: "OFFER_CREATED",
        resourceType: "PHARMACY_OFFER",
        resourceId: offerId,
        requestId: context.get("requestId"),
      });
    });
    const result = await database.query(
      "SELECT * FROM pharmacy_offers WHERE id = $1",
      [offerId],
    );
    return context.json({ data: result.rows[0] }, 201);
  });

  routes.get("/reservations", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query(
      `SELECT
         res.*, r.public_reference AS request_reference, r.medicine_name,
         r.strength, r.quantity, r.prescription_file_id, r.prescription_status,
         o.price_iqd, o.offered_brand, o.preparation_minutes,
         c.id AS conversation_id
       FROM reservations res
       JOIN medicine_requests r ON r.id = res.request_id
       JOIN pharmacy_offers o ON o.id = res.offer_id
       LEFT JOIN conversations c ON c.reservation_id = res.id
       WHERE res.branch_id = $1
       ORDER BY
         CASE res.status
           WHEN 'PENDING_ACK' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'READY' THEN 2
           ELSE 3 END,
         res.created_at DESC
       LIMIT 100`,
      [pharmacy.branch_id],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/reservations/:reservationId/acknowledge", async (context) => {
    const user = context.get("user");
    const pharmacy = await requireVerifiedPharmacy(database, user.id);
    const holdExpiresAt = new Date(
      Date.now() + config.reservationHoldMinutes * 60_000,
    ).toISOString();
    await database.transaction(async (transaction) => {
      const result = await transaction.query<{
        id: string;
        request_id: string;
        offer_id: string;
        patient_id: string;
        status: string;
        acknowledgement_deadline: string;
      }>(
        `SELECT id, request_id, offer_id, patient_id, status,
                acknowledgement_deadline
         FROM reservations
         WHERE id = $1 AND branch_id = $2
         FOR UPDATE`,
        [context.req.param("reservationId"), pharmacy.branch_id],
      );
      const reservation = result.rows[0];
      if (
        !reservation ||
        reservation.status !== "PENDING_ACK" ||
        new Date(reservation.acknowledgement_deadline).getTime() <= Date.now()
      ) {
        throw new ApiError(
          409,
          "RESERVATION_NOT_ACKNOWLEDGEABLE",
          "انتهت مهلة تأكيد هذا الحجز.",
        );
      }
      await transaction.query(
        `UPDATE reservations
         SET status = 'ACTIVE', acknowledged_at = now(), hold_expires_at = $1,
             updated_at = now()
         WHERE id = $2`,
        [holdExpiresAt, reservation.id],
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = 'RESERVED', version = version + 1, updated_at = now()
         WHERE id = $1 AND status = 'HOLD_PENDING'`,
        [reservation.request_id],
      );
      await transaction.query(
        `UPDATE pharmacy_offers SET status = CASE
           WHEN id = $1 THEN 'HELD' ELSE 'SUPERSEDED' END,
           updated_at = now()
         WHERE request_id = $2
           AND status IN ('ACTIVE', 'HOLD_PENDING')`,
        [reservation.offer_id, reservation.request_id],
      );
      await transaction.query(
        `INSERT INTO conversations
          (id, reservation_id, patient_id, branch_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (reservation_id) DO NOTHING`,
        [
          randomUUID(),
          reservation.id,
          reservation.patient_id,
          pharmacy.branch_id,
        ],
      );
      await createNotification(transaction, {
        userId: reservation.patient_id,
        eventType: "RESERVATION_ACCEPTED",
        title: "أكدت الصيدلية الحجز",
        body: "حُفظ الدواء مؤقتًا. افتح دوائي لمعرفة الوقت والاتجاهات.",
        resourceType: "RESERVATION",
        resourceId: reservation.id,
      });
      await writeAudit(transaction, {
        actorUserId: user.id,
        actorRole: "PHARMACY",
        action: "RESERVATION_ACKNOWLEDGED",
        resourceType: "RESERVATION",
        resourceId: reservation.id,
        requestId: context.get("requestId"),
      });
    });
    const result = await database.query(
      "SELECT * FROM reservations WHERE id = $1",
      [context.req.param("reservationId")],
    );
    return context.json({ data: result.rows[0] });
  });

  routes.post("/reservations/:reservationId/ready", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query<{ patient_id: string }>(
      `UPDATE reservations SET status = 'READY', updated_at = now()
       WHERE id = $1 AND branch_id = $2 AND status = 'ACTIVE'
         AND hold_expires_at > now()
       RETURNING patient_id`,
      [context.req.param("reservationId"), pharmacy.branch_id],
    );
    if (!result.rows[0]) {
      throw new ApiError(409, "RESERVATION_NOT_READYABLE", "تعذر تحديث الحجز.");
    }
    await database.query(
      `UPDATE medicine_requests SET status = 'READY', updated_at = now()
       WHERE id = (SELECT request_id FROM reservations WHERE id = $1)`,
      [context.req.param("reservationId")],
    );
    await createNotification(database, {
      userId: result.rows[0].patient_id,
      eventType: "READY_FOR_PICKUP",
      title: "دواؤك جاهز للاستلام",
      body: "أكدت الصيدلية تجهيز الحجز. افتح دوائي للتفاصيل.",
      resourceType: "RESERVATION",
      resourceId: context.req.param("reservationId"),
    });
    return context.json({ data: { status: "READY" } });
  });

  routes.post("/reservations/:reservationId/complete", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    await database.transaction(async (transaction) => {
      const result = await transaction.query<{
        request_id: string;
        offer_id: string;
        patient_id: string;
      }>(
        `UPDATE reservations
         SET status = 'COMPLETED', completed_at = now(), updated_at = now()
         WHERE id = $1 AND branch_id = $2
           AND status IN ('ACTIVE', 'READY')
           AND hold_expires_at > now()
         RETURNING request_id, offer_id, patient_id`,
        [context.req.param("reservationId"), pharmacy.branch_id],
      );
      const reservation = result.rows[0];
      if (!reservation) {
        throw new ApiError(
          409,
          "RESERVATION_NOT_COMPLETABLE",
          "لا يمكن إكمال هذا الحجز.",
        );
      }
      await transaction.query(
        `UPDATE medicine_requests SET status = 'COMPLETED', updated_at = now()
         WHERE id = $1`,
        [reservation.request_id],
      );
      await transaction.query(
        `UPDATE pharmacy_offers SET status = 'FULFILLED', updated_at = now()
         WHERE id = $1`,
        [reservation.offer_id],
      );
      await transaction.query(
        `UPDATE reliability_metrics
         SET successful_reservations = successful_reservations + 1,
             completed_requests = completed_requests + 1,
             updated_at = now()
         WHERE branch_id = $1`,
        [pharmacy.branch_id],
      );
      await createNotification(transaction, {
        userId: reservation.patient_id,
        eventType: "REQUEST_COMPLETED",
        title: "اكتمل طلب الدواء",
        body: "تم تسجيل الاستلام بنجاح.",
        resourceType: "RESERVATION",
        resourceId: context.req.param("reservationId"),
      });
    });
    return context.json({ data: { status: "COMPLETED" } });
  });

  routes.post("/reservations/:reservationId/fail", async (context) => {
    const body = z
      .object({ reason: z.string().trim().min(3).max(300) })
      .strict()
      .parse(await context.req.json());
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const failed = await database.transaction(async (transaction) => {
      const locked = await transaction.query<{
        patient_id: string;
        request_id: string;
        offer_id: string;
        status: string;
      }>(
        `SELECT patient_id, request_id, offer_id, status
         FROM reservations
         WHERE id = $1 AND branch_id = $2
           AND status IN ('PENDING_ACK', 'ACTIVE', 'READY')
         FOR UPDATE`,
        [context.req.param("reservationId"), pharmacy.branch_id],
      );
      const row = locked.rows[0];
      if (!row) {
        throw new ApiError(409, "RESERVATION_NOT_FAILABLE", "تعذر تحديث الحجز.");
      }
      const priorStatus = row.status;
      await transaction.query(
        `UPDATE reservations
         SET status = 'FAILED', failure_reason = $1, updated_at = now()
         WHERE id = $2`,
        [body.reason, context.req.param("reservationId")],
      );
      await transaction.query(
        `UPDATE pharmacy_offers
         SET status = 'FAILED', updated_at = now()
         WHERE id = $1`,
        [row.offer_id],
      );
      await transaction.query(
        `UPDATE pharmacy_offers
         SET status = 'ACTIVE', updated_at = now()
         WHERE request_id = $1
           AND status = 'SUPERSEDED'
           AND expires_at > now()`,
        [row.request_id],
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = CASE WHEN expires_at > now() THEN 'ACTIVE' ELSE 'EXPIRED' END,
             version = version + 1, updated_at = now()
         WHERE id = $1`,
        [row.request_id],
      );
      if (priorStatus === "ACTIVE" || priorStatus === "READY") {
        await recordConfirmedNotFound(transaction, pharmacy.branch_id);
      }
      await createNotification(transaction, {
        userId: row.patient_id,
        eventType: "RESERVATION_FAILED",
        title: "تعذر تنفيذ الحجز",
        body: "أبلغت الصيدلية عن مشكلة. يمكنك مراجعة طلبك للبحث مجددًا.",
        resourceType: "REQUEST",
        resourceId: row.request_id,
      });
      await writeAudit(transaction, {
        actorUserId: context.get("user").id,
        actorRole: "PHARMACY",
        action: "RESERVATION_FAILED",
        resourceType: "RESERVATION",
        resourceId: context.req.param("reservationId"),
        requestId: context.get("requestId"),
        metadata: { reason: body.reason },
      });
      return row;
    });
    return context.json({ data: { status: "FAILED", requestId: failed.request_id } });
  });

  routes.post("/reservations/:reservationId/no-show", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.transaction(async (transaction) => {
      const locked = await transaction.query<{
        patient_id: string;
        request_id: string;
        offer_id: string;
      }>(
        `UPDATE reservations
         SET status = 'NO_SHOW', updated_at = now()
         WHERE id = $1 AND branch_id = $2
           AND status IN ('ACTIVE', 'READY')
         RETURNING patient_id, request_id, offer_id`,
        [context.req.param("reservationId"), pharmacy.branch_id],
      );
      const row = locked.rows[0];
      if (!row) {
        throw new ApiError(
          409,
          "RESERVATION_NOT_NO_SHOW",
          "لا يمكن تسجيل عدم الحضور لهذا الحجز.",
        );
      }
      await transaction.query(
        `UPDATE medicine_requests
         SET status = 'EXPIRED', version = version + 1, updated_at = now()
         WHERE id = $1`,
        [row.request_id],
      );
      await transaction.query(
        `UPDATE pharmacy_offers
         SET status = 'EXPIRED', updated_at = now()
         WHERE id = $1`,
        [row.offer_id],
      );
      await createNotification(transaction, {
        userId: row.patient_id,
        eventType: "PATIENT_NO_SHOW",
        title: "لم يتم الاستلام",
        body: "سجّلت الصيدلية عدم الحضور ضمن مهلة الحجز.",
        resourceType: "RESERVATION",
        resourceId: context.req.param("reservationId"),
      });
      await writeAudit(transaction, {
        actorUserId: context.get("user").id,
        actorRole: "PHARMACY",
        action: "PATIENT_NO_SHOW",
        resourceType: "RESERVATION",
        resourceId: context.req.param("reservationId"),
        requestId: context.get("requestId"),
      });
      return row;
    });
    return context.json({ data: { status: "NO_SHOW", requestId: result.request_id } });
  });

  routes.get("/inventory", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const result = await database.query(
      `SELECT DISTINCT ON (lower(medicine_name))
         id, presentation_id, medicine_name, source, state, quantity,
         observed_at, expires_at
       FROM availability_signals
       WHERE branch_id = $1
       ORDER BY lower(medicine_name), observed_at DESC`,
      [pharmacy.branch_id],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/inventory", async (context) => {
    const body = z
      .object({
        medicineName: z.string().trim().min(2).max(160),
        presentationId: z.string().max(100).nullable().default(null),
        state: z.enum(["AVAILABLE", "LOW", "UNAVAILABLE", "ORDERABLE"]),
        quantity: z.number().int().min(0).max(100_000).nullable(),
        freshnessMinutes: z.number().int().min(15).max(1440).default(360),
      })
      .strict()
      .parse(await context.req.json());
    const pharmacy = await requireVerifiedPharmacy(
      database,
      context.get("user").id,
    );
    const id = randomUUID();
    await database.query(
      `INSERT INTO availability_signals
        (id, branch_id, presentation_id, medicine_name, source, state,
         quantity, expires_at)
       VALUES ($1, $2, $3, $4, 'MANUAL_STOCK', $5, $6,
         now() + ($7 * interval '1 minute'))`,
      [
        id,
        pharmacy.branch_id,
        body.presentationId,
        body.medicineName,
        body.state,
        body.quantity,
        body.freshnessMinutes,
      ],
    );
    return context.json(
      {
        data: {
          id,
          medicineName: body.medicineName,
          state: body.state,
          expiresInMinutes: body.freshnessMinutes,
        },
      },
      201,
    );
  });

  routes.get("/notifications", async (context) => {
    const result = await database.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [context.get("user").id],
    );
    return context.json({ data: result.rows });
  });

  /**
   * Passive inventory ledger — the blueprint's "stock list that just appeared".
   *
   * Deliberately NOT an ERP: there is no editable quantity field anywhere.
   * on-hand is derived as sum(delta_qty), so two devices selling the same SKU
   * offline both apply correctly on sync instead of overwriting each other.
   * Every row carries an optional client_event_id, making replay idempotent.
   */
  routes.post("/inventory/movements", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(database, context.get("user").id);
    const body = movementSchema.parse(await context.req.json());

    // Orthography-folded, not merely case-folded: Arabic is caseless, so a
    // lowercase() call normalizes nothing for this product's main language.
    const medicineKey = normalizeSkuKey(body.medicineName);

    // The ledger append and the trust recompute are one unit. As separate
    // autocommitted statements they interleave, and the later upsert
    // overwrites the earlier one's count from a stale read.
    const result = await database.transaction(async (tx) => {
      const id = randomUUID();
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO stock_movements
           (id, branch_id, medicine_name, delta_qty, reason, ref_type, ref_id,
            client_event_id, occurred_at, recorded_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()), $10)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          id,
          pharmacy.branch_id,
          medicineKey,
          body.deltaQty,
          body.reason,
          body.refType ?? null,
          body.refId ?? null,
          body.clientEventId ?? null,
          body.occurredAt ?? null,
          context.get("user").id,
        ],
      );
      const duplicate = inserted.rows.length === 0;
      if (duplicate) return { id: null, duplicate };

      // Trust is recomputed from the ledger itself rather than a counter.
      const stats = await tx.query<{
        movement_count: string;
        last_counted_at: string | null;
      }>(
        `SELECT COUNT(*) AS movement_count,
                MAX(CASE WHEN reason = 'COUNT' THEN occurred_at END) AS last_counted_at
           FROM stock_movements
          WHERE branch_id = $1 AND medicine_name = $2`,
        [pharmacy.branch_id, medicineKey],
      );
      const row = stats.rows[0];

      // A failed reconciliation must keep gating this SKU until the NEXT
      // count. Recomputing with variance 0 on the following sale would erase
      // the penalty and quietly re-admit an untrusted SKU to forecasting.
      // FOR UPDATE serializes concurrent movements for this SKU; without it
      // two transactions both read the pre-insert count and the later upsert
      // writes a stale absolute movement_count.
      const prior = await tx.query<{ last_variance: number }>(
        `SELECT last_variance FROM sku_trust
          WHERE branch_id = $1 AND medicine_name = $2 FOR UPDATE`,
        [pharmacy.branch_id, medicineKey],
      );
      const variance =
        body.reason === "COUNT"
          ? body.deltaQty
          : Number(prior.rows[0]?.last_variance ?? 0);

      const score = computeSkuTrust({
        movementCount: Number(row?.movement_count ?? 0),
        lastCountedAt: row?.last_counted_at ? new Date(row.last_counted_at) : null,
        lastVariance: variance,
      });

      await tx.query(
        `INSERT INTO sku_trust
           (branch_id, medicine_name, movement_count, last_counted_at, last_variance, trust_score, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (branch_id, medicine_name) DO UPDATE
           SET movement_count = EXCLUDED.movement_count,
               last_counted_at = COALESCE(EXCLUDED.last_counted_at, sku_trust.last_counted_at),
               last_variance = EXCLUDED.last_variance,
               trust_score = EXCLUDED.trust_score,
               updated_at = now()`,
        [
          pharmacy.branch_id,
          medicineKey,
          Number(row?.movement_count ?? 0),
          row?.last_counted_at ?? null,
          variance,
          score,
        ],
      );

      return { id: inserted.rows[0]?.id ?? null, duplicate };
    });

    return context.json({ data: result }, result.duplicate ? 200 : 201);
  });

  /**
   * Derived stock view. SKUs below the trust threshold are returned with
   * forecastReady=false and no days-of-cover: an untrustworthy number is worse
   * than an absent one.
   */
  routes.get("/inventory/on-hand", async (context) => {
    const pharmacy = await requireVerifiedPharmacy(database, context.get("user").id);
    const result = await database.query<{
      medicine_name: string;
      on_hand: string;
      movements: string;
      last_movement_at: string;
      trust_score: string | null;
    }>(
      `SELECT m.medicine_name,
              SUM(m.delta_qty) AS on_hand,
              COUNT(*) AS movements,
              MAX(m.occurred_at) AS last_movement_at,
              t.trust_score
         FROM stock_movements m
         LEFT JOIN sku_trust t
           ON t.branch_id = m.branch_id AND t.medicine_name = m.medicine_name
        WHERE m.branch_id = $1
        GROUP BY m.medicine_name, t.trust_score
        ORDER BY MAX(m.occurred_at) DESC
        LIMIT 200`,
      [pharmacy.branch_id],
    );

    return context.json({
      // The blueprint excludes low-trust SKUs from FORECASTING, not from the
      // pharmacist's sight. Dropping the row entirely removed the observed
      // ledger balance too — hiding stock a pharmacist needs to see. Every SKU
      // is listed; only the forecast-derived fields are withheld.
      data: result.rows.map((row) => {
        const trust = Number(row.trust_score ?? 0);
        const forecastReady = trust >= SKU_TRUST_THRESHOLD;
        return {
          medicineName: row.medicine_name,
          onHand: Number(row.on_hand),
          movements: Number(row.movements),
          lastMovementAt: row.last_movement_at,
          trustScore: trust,
          forecastReady,
          // No forecast-derived signal at all below the threshold.
          reorderHint: forecastReady ? Number(row.on_hand) <= 5 : null,
        };
      }),
      meta: {
        trustThreshold: SKU_TRUST_THRESHOLD,
        forecastableCount: result.rows.filter(
          (row) => Number(row.trust_score ?? 0) >= SKU_TRUST_THRESHOLD,
        ).length,
      },
    });
  });

  return routes;
}
