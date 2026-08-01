import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { requireAuth } from "../security/auth";
import { writeAudit } from "../services/audit";
import {
  computeDaysOfCover,
  raiseAttention,
  REORDER_THRESHOLD_DAYS,
  requirePatientAuthority,
} from "../services/clinical";
import type { AppVariables } from "../types";

const scheduleSchema = z.object({
  patientUserId: z.string().min(1).optional(),
  medicineName: z.string().min(2).max(200),
  strength: z.string().max(80).nullish(),
  sigTextAr: z.string().min(2).max(400),
  sigSource: z
    .enum(["PHARMACIST", "MONOGRAPH_TEMPLATE", "PATIENT_SELF_REPORT"])
    .default("PATIENT_SELF_REPORT"),
  timesOfDay: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(12).default([]),
  dosesPerDay: z.number().int().min(1).max(12).default(1),
  quantityDispensed: z.number().int().positive().max(1000).nullish(),
});

const doseEventSchema = z.object({
  scheduledAt: z.string().datetime(),
  status: z.enum(["TAKEN", "MISSED", "SNOOZED", "UNKNOWN"]),
  clientEventId: z.string().min(8).max(200).optional(),
  recordedOffline: z.boolean().default(false),
});

const familyInviteSchema = z.object({
  memberEmail: z.string().email().optional(),
  displayName: z.string().min(2).max(120),
  relation: z.string().min(2).max(60),
  proxyScope: z.enum(["VIEW", "ORDER", "CONFIRM"]).default("VIEW"),
});

interface ScheduleRow {
  id: string;
  patient_user_id: string;
  medicine_name: string;
  strength: string | null;
  sig_text_ar: string;
  sig_source: string;
  doses_per_day: number;
  quantity_dispensed: number | null;
  dispensed_at: string | null;
  reorder_snoozed_until: string | null;
  active: boolean;
  taken_count: string | number;
  last_confirmed_at: string | null;
}

export function clinicalRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireAuth(database));

  /**
   * Medication timeline — the patient's whole story on one card (MM-X3).
   * `patientUserId` lets a consented proxy read a relative's timeline; the
   * authority check is server-side and every proxy read is audited.
   */
  routes.get("/timeline", async (context) => {
    const caller = context.get("user");
    const target = context.req.query("patientUserId") ?? caller.id;
    const link = await requirePatientAuthority(database, caller.id, target, "VIEW");

    if (link) {
      await writeAudit(database, {
        actorUserId: caller.id,
        actorRole: caller.role,
        action: "PROXY_TIMELINE_VIEW",
        resourceType: "PATIENT",
        resourceId: target,
        requestId: context.get("requestId"),
        metadata: { familyMemberId: link.id, scope: link.proxy_scope },
      });
    }

    const result = await database.query<ScheduleRow>(
      `SELECT s.id, s.patient_user_id, s.medicine_name, s.strength,
              s.sig_text_ar, s.sig_source, s.doses_per_day,
              s.quantity_dispensed, s.dispensed_at, s.reorder_snoozed_until,
              s.active,
              COALESCE(taken.count, 0) AS taken_count,
              taken.last_confirmed_at
         FROM dose_schedules s
         LEFT JOIN (
           SELECT dose_schedule_id,
                  COUNT(*) AS count,
                  MAX(confirmed_at) AS last_confirmed_at
             FROM dose_events
            WHERE status = 'TAKEN'
            GROUP BY dose_schedule_id
         ) taken ON taken.dose_schedule_id = s.id
        WHERE s.patient_user_id = $1 AND s.active
        ORDER BY s.created_at DESC`,
      [target],
    );

    const now = new Date();
    const data = result.rows.map((row) => {
      const cover = computeDaysOfCover({
        scheduleId: row.id,
        medicineName: row.medicine_name,
        quantityDispensed: row.quantity_dispensed,
        dosesPerDay: row.doses_per_day,
        dispensedAt: row.dispensed_at ? new Date(row.dispensed_at) : null,
        takenCount: Number(row.taken_count),
        snoozedUntil: row.reorder_snoozed_until
          ? new Date(row.reorder_snoozed_until)
          : null,
        now,
      });
      return {
        id: row.id,
        medicineName: row.medicine_name,
        strength: row.strength,
        sigTextAr: row.sig_text_ar,
        sigSource: row.sig_source,
        dosesPerDay: row.doses_per_day,
        takenCount: Number(row.taken_count),
        lastConfirmedAt: row.last_confirmed_at,
        cover,
        needsReorder:
          !cover.suppressed &&
          cover.daysRemaining !== null &&
          cover.daysRemaining <= REORDER_THRESHOLD_DAYS,
      };
    });

    return context.json({
      data,
      meta: { patientUserId: target, viewedAsProxy: Boolean(link) },
    });
  });

  routes.post("/schedules", async (context) => {
    const caller = context.get("user");
    const body = scheduleSchema.parse(await context.req.json());
    const target = body.patientUserId ?? caller.id;
    await requirePatientAuthority(database, caller.id, target, "ORDER");

    // A pharmacist-sourced sig may only be recorded by a pharmacy account:
    // patients cannot self-assert that a pharmacist approved an instruction.
    if (body.sigSource === "PHARMACIST" && caller.role !== "PHARMACY") {
      throw new ApiError(
        403,
        "SIG_SOURCE_NOT_ALLOWED",
        "توثيق تعليمات الصيدلي متاح لحساب الصيدلية فقط.",
      );
    }

    const id = randomUUID();
    await database.query(
      `INSERT INTO dose_schedules
         (id, patient_user_id, medicine_name, strength, sig_text_ar, sig_source,
          confirmed_by_user_id, times_of_day, doses_per_day, quantity_dispensed,
          dispensed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
               CASE WHEN $10::int IS NULL THEN NULL ELSE now() END)`,
      [
        id,
        target,
        body.medicineName,
        body.strength ?? null,
        body.sigTextAr,
        body.sigSource,
        body.sigSource === "PHARMACIST" ? caller.id : null,
        JSON.stringify(body.timesOfDay),
        body.dosesPerDay,
        body.quantityDispensed ?? null,
      ],
    );

    await writeAudit(database, {
      actorUserId: caller.id,
      actorRole: caller.role,
      action: "DOSE_SCHEDULE_CREATED",
      resourceType: "DOSE_SCHEDULE",
      resourceId: id,
      requestId: context.get("requestId"),
      metadata: { patientUserId: target, sigSource: body.sigSource },
    });

    return context.json({ data: { id } }, 201);
  });

  /**
   * Confirm a dose. APPEND-ONLY and idempotent on clientEventId so an offline
   * queue can replay safely without inflating adherence.
   */
  routes.post("/schedules/:scheduleId/events", async (context) => {
    const caller = context.get("user");
    const scheduleId = context.req.param("scheduleId");
    const body = doseEventSchema.parse(await context.req.json());

    const scheduleResult = await database.query<{
      id: string;
      patient_user_id: string;
      active: boolean;
    }>(
      `SELECT id, patient_user_id, active FROM dose_schedules WHERE id = $1`,
      [scheduleId],
    );
    const schedule = scheduleResult.rows[0];
    if (!schedule) {
      throw new ApiError(404, "SCHEDULE_NOT_FOUND", "الجدول غير موجود.");
    }
    const link = await requirePatientAuthority(
      database,
      caller.id,
      schedule.patient_user_id,
      "CONFIRM",
    );
    if (!schedule.active) {
      throw new ApiError(409, "SCHEDULE_INACTIVE", "هذا الجدول غير نشط.");
    }

    const id = randomUUID();
    const inserted = await database.query<{ id: string }>(
      `INSERT INTO dose_events
         (id, dose_schedule_id, patient_user_id, scheduled_at, status,
          confirmed_by_user_id, confirmed_via_family_member_id,
          client_event_id, recorded_offline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        id,
        scheduleId,
        schedule.patient_user_id,
        body.scheduledAt,
        body.status,
        caller.id,
        link?.id ?? null,
        body.clientEventId ?? null,
        body.recordedOffline,
      ],
    );

    // Replay of an already-recorded event: report success without a new row.
    const duplicate = inserted.rows.length === 0;

    // Caregiver reassurance (MM-P7): only ever with a live consented link, and
    // only to the proxy who holds it — never broadcast to the family.
    if (!duplicate && body.status === "TAKEN" && !link) {
      const proxies = await database.query<{ owner_user_id: string; display_name: string }>(
        `SELECT owner_user_id, display_name
           FROM family_members
          WHERE member_user_id = $1
            AND proxy_scope = 'CONFIRM'
            AND consent_granted_at IS NOT NULL
            AND revoked_at IS NULL`,
        [schedule.patient_user_id],
      );
      for (const proxy of proxies.rows) {
        await raiseAttention(database, {
          recipientUserId: proxy.owner_user_id,
          priority: "SUGGESTION",
          kind: "CAREGIVER_DOSE_CONFIRMED",
          title: "تم تأكيد الجرعة",
          body: `${proxy.display_name} أكّد تناول الجرعة.`,
          resourceType: "DOSE_SCHEDULE",
          resourceId: scheduleId,
          dedupeKey: `dose-confirm:${scheduleId}:${body.scheduledAt}`,
        });
      }
    }

    return context.json({ data: { id: inserted.rows[0]?.id ?? null, duplicate } }, duplicate ? 200 : 201);
  });

  /** Snooze a reorder suggestion — "already have it?" must always be available. */
  routes.post("/schedules/:scheduleId/snooze", async (context) => {
    const caller = context.get("user");
    const scheduleId = context.req.param("scheduleId");
    const days = z
      .object({ days: z.number().int().min(1).max(60).default(14) })
      .parse(await context.req.json().catch(() => ({}))).days;

    const scheduleResult = await database.query<{ patient_user_id: string }>(
      `SELECT patient_user_id FROM dose_schedules WHERE id = $1`,
      [scheduleId],
    );
    const schedule = scheduleResult.rows[0];
    if (!schedule) {
      throw new ApiError(404, "SCHEDULE_NOT_FOUND", "الجدول غير موجود.");
    }
    await requirePatientAuthority(database, caller.id, schedule.patient_user_id, "ORDER");

    await database.query(
      `UPDATE dose_schedules
          SET reorder_snoozed_until = now() + ($2 || ' days')::interval,
              updated_at = now()
        WHERE id = $1`,
      [scheduleId, String(days)],
    );
    // Clear any pending reorder nudge so the snooze is honoured immediately.
    await database.query(
      `UPDATE attention_events SET dismissed_at = now()
        WHERE dedupe_key = $1 AND dismissed_at IS NULL`,
      [`reorder:${scheduleId}`],
    );
    return context.json({ data: { snoozedDays: days } });
  });

  // ── Family proxy: two-sided consent ───────────────────────────────────────

  routes.get("/family", async (context) => {
    const caller = context.get("user");
    const result = await database.query(
      `SELECT f.id, f.display_name, f.relation, f.proxy_scope,
              f.consent_granted_at, f.member_user_id,
              CASE WHEN f.owner_user_id = $1 THEN 'PROXY' ELSE 'SUBJECT' END AS side
         FROM family_members f
        WHERE (f.owner_user_id = $1 OR f.member_user_id = $1)
          AND f.revoked_at IS NULL
        ORDER BY f.created_at DESC`,
      [caller.id],
    );
    return context.json({ data: result.rows });
  });

  /** Invite: creates a PENDING link. No access exists until the subject grants. */
  routes.post("/family", async (context) => {
    const caller = context.get("user");
    const body = familyInviteSchema.parse(await context.req.json());

    let memberUserId: string | null = null;
    if (body.memberEmail) {
      const member = await database.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND role = 'PATIENT' AND status = 'ACTIVE'`,
        [body.memberEmail],
      );
      // Do not reveal whether the account exists; the link simply stays pending.
      memberUserId = member.rows[0]?.id ?? null;
      if (memberUserId === caller.id) {
        throw new ApiError(422, "SELF_LINK_REJECTED", "لا يمكن ربط حسابك بنفسه.");
      }
    }

    const id = randomUUID();
    await database.query(
      `INSERT INTO family_members
         (id, owner_user_id, member_user_id, display_name, relation, proxy_scope)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, caller.id, memberUserId, body.displayName, body.relation, body.proxyScope],
    );

    if (memberUserId) {
      await raiseAttention(database, {
        recipientUserId: memberUserId,
        priority: "ACTION_REQUIRED",
        kind: "FAMILY_CONSENT_REQUESTED",
        title: "طلب وصول لملفك الدوائي",
        body: `${caller.name ?? "أحد أفراد عائلتك"} يطلب صلاحية ${
          body.proxyScope === "CONFIRM" ? "تأكيد الجرعات" : body.proxyScope === "ORDER" ? "الطلب نيابةً عنك" : "الاطلاع"
        }. لن يُمنح شيء قبل موافقتك.`,
        resourceType: "FAMILY_MEMBER",
        resourceId: id,
        dedupeKey: `family-consent:${id}`,
      });
    }

    await writeAudit(database, {
      actorUserId: caller.id,
      actorRole: caller.role,
      action: "FAMILY_LINK_REQUESTED",
      resourceType: "FAMILY_MEMBER",
      resourceId: id,
      requestId: context.get("requestId"),
      metadata: { scope: body.proxyScope, resolved: Boolean(memberUserId) },
    });

    return context.json({ data: { id, pending: true } }, 201);
  });

  /** Grant: only the subject may grant, and only for themselves. */
  routes.post("/family/:linkId/grant", async (context) => {
    const caller = context.get("user");
    const linkId = context.req.param("linkId");
    const result = await database.query<{ id: string }>(
      `UPDATE family_members
          SET consent_granted_at = now()
        WHERE id = $1 AND member_user_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [linkId, caller.id],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "FAMILY_LINK_NOT_FOUND", "طلب الوصول غير موجود.");
    }
    await database.query(
      `UPDATE attention_events SET dismissed_at = now()
        WHERE dedupe_key = $1 AND dismissed_at IS NULL`,
      [`family-consent:${linkId}`],
    );
    await writeAudit(database, {
      actorUserId: caller.id,
      actorRole: caller.role,
      action: "FAMILY_CONSENT_GRANTED",
      resourceType: "FAMILY_MEMBER",
      resourceId: linkId,
      requestId: context.get("requestId"),
    });
    return context.json({ data: { granted: true } });
  });

  /** Revoke: either side may revoke, instantly and without explanation. */
  routes.post("/family/:linkId/revoke", async (context) => {
    const caller = context.get("user");
    const linkId = context.req.param("linkId");
    const result = await database.query<{ id: string }>(
      `UPDATE family_members
          SET revoked_at = now()
        WHERE id = $1
          AND (member_user_id = $2 OR owner_user_id = $2)
          AND revoked_at IS NULL
        RETURNING id`,
      [linkId, caller.id],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "FAMILY_LINK_NOT_FOUND", "الرابط غير موجود.");
    }
    await writeAudit(database, {
      actorUserId: caller.id,
      actorRole: caller.role,
      action: "FAMILY_CONSENT_REVOKED",
      resourceType: "FAMILY_MEMBER",
      resourceId: linkId,
      requestId: context.get("requestId"),
    });
    return context.json({ data: { revoked: true } });
  });

  // ── Attention feed (drives the Pill Bar) ──────────────────────────────────

  routes.get("/attention", async (context) => {
    const caller = context.get("user");
    const result = await database.query(
      `SELECT id, priority, kind, title, body, resource_type, resource_id,
              acknowledged_at, created_at
         FROM attention_events
        WHERE recipient_user_id = $1
          AND dismissed_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY CASE priority
                   WHEN 'SEV_ALERT' THEN 1
                   WHEN 'ACTION_REQUIRED' THEN 2
                   WHEN 'IN_PROGRESS' THEN 3
                   ELSE 4
                 END,
                 created_at DESC
        LIMIT 20`,
      [caller.id],
    );
    return context.json({ data: result.rows });
  });

  /**
   * Dismiss an attention event. SEV_ALERT cannot be dismissed by the client —
   * a severe safety alert is cleared by resolving its cause, never by tapping.
   */
  routes.post("/attention/:eventId/dismiss", async (context) => {
    const caller = context.get("user");
    const eventId = context.req.param("eventId");
    const result = await database.query<{ id: string }>(
      `UPDATE attention_events
          SET dismissed_at = now(), acknowledged_at = COALESCE(acknowledged_at, now())
        WHERE id = $1 AND recipient_user_id = $2
          AND dismissed_at IS NULL
          AND priority <> 'SEV_ALERT'
        RETURNING id`,
      [eventId, caller.id],
    );
    if (!result.rows[0]) {
      const exists = await database.query<{ priority: string }>(
        `SELECT priority FROM attention_events WHERE id = $1 AND recipient_user_id = $2`,
        [eventId, caller.id],
      );
      if (exists.rows[0]?.priority === "SEV_ALERT") {
        throw new ApiError(
          409,
          "SEV_ALERT_NOT_DISMISSIBLE",
          "تنبيه السلامة لا يُغلق يدويًا — يُغلق بمعالجة سببه.",
        );
      }
      throw new ApiError(404, "ATTENTION_NOT_FOUND", "التنبيه غير موجود.");
    }
    return context.json({ data: { dismissed: true } });
  });

  return routes;
}
