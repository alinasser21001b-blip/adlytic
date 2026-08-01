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
  requireVerifiedPharmacyUser,
} from "../services/clinical";
import {
  evaluateInteractions,
  outcomeMessageAr,
  validateOverride,
  type InteractionPair,
} from "../services/interactions";
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

const interactionCheckSchema = z.object({
  patientUserId: z.string().min(1).optional(),
  // Ingredients being added on top of the patient's active regimen.
  addingIngredients: z.array(z.string().trim().min(2).max(120)).min(1).max(20),
});

const overrideSchema = z.object({
  reason: z.string().trim().min(10).max(500),
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
         -- Append-only means a correction is a NEW row, so the read model must
         -- collapse each dose slot to its latest event before counting; a flat
         -- COUNT(*) would let a corrected MISSED still count as TAKEN.
         -- Scoped to the current dispense cycle so a lifetime total cannot
         -- exceed one pack's quantity and permanently suppress days-of-cover.
         LEFT JOIN (
           SELECT latest.dose_schedule_id,
                  COUNT(*) FILTER (WHERE latest.status = 'TAKEN') AS count,
                  MAX(latest.confirmed_at) FILTER (WHERE latest.status = 'TAKEN')
                    AS last_confirmed_at
             FROM (
               SELECT DISTINCT ON (e.dose_schedule_id, e.scheduled_at)
                      e.dose_schedule_id, e.scheduled_at, e.status, e.confirmed_at
                 FROM dose_events e
                 JOIN dose_schedules ds ON ds.id = e.dose_schedule_id
                WHERE ds.dispensed_at IS NULL OR e.scheduled_at >= ds.dispensed_at
                ORDER BY e.dose_schedule_id, e.scheduled_at, e.confirmed_at DESC
             ) latest
            GROUP BY latest.dose_schedule_id
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

    // Pharmacist provenance requires a VERIFIED pharmacy, not merely the
    // PHARMACY role — the role is self-selected at registration, so gating on
    // it lets anyone stamp an instruction as pharmacist-authored.
    if (body.sigSource === "PHARMACIST") {
      await requireVerifiedPharmacyUser(database, caller.id, caller.role);
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

    // A proxy writing to someone else's clinical record must leave a trail —
    // this is the highest-privilege proxy action in the module.
    if (link) {
      await writeAudit(database, {
        actorUserId: caller.id,
        actorRole: caller.role,
        action: "PROXY_DOSE_CONFIRMED",
        resourceType: "DOSE_SCHEDULE",
        resourceId: scheduleId,
        requestId: context.get("requestId"),
        metadata: {
          patientUserId: schedule.patient_user_id,
          familyMemberId: link.id,
          status: body.status,
          duplicate,
        },
      });
    }

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
          // Day-granular so a multi-dose regimen yields one reassurance a day,
          // not one card per administration.
          dedupeKey: `dose-confirm:${scheduleId}:${body.scheduledAt.slice(0, 10)}`,
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
    const snoozeLink = await requirePatientAuthority(
      database,
      caller.id,
      schedule.patient_user_id,
      "ORDER",
    );
    if (snoozeLink) {
      await writeAudit(database, {
        actorUserId: caller.id,
        actorRole: caller.role,
        action: "PROXY_REORDER_SNOOZED",
        resourceType: "DOSE_SCHEDULE",
        resourceId: scheduleId,
        requestId: context.get("requestId"),
        metadata: { patientUserId: schedule.patient_user_id, familyMemberId: snoozeLink.id },
      });
    }

    await database.query(
      `UPDATE dose_schedules
          SET reorder_snoozed_until = now() + ($2 || ' days')::interval,
              updated_at = now()
        WHERE id = $1`,
      [scheduleId, String(days)],
    );
    // Clear any pending reorder nudge so the snooze is honoured immediately.
    // Matched on the resource rather than a key literal, so it stays correct
    // whichever producer raised it.
    await database.query(
      `UPDATE attention_events SET dismissed_at = now()
        WHERE kind = 'REORDER_DUE'
          AND resource_type = 'DOSE_SCHEDULE'
          AND resource_id = $1
          AND dismissed_at IS NULL`,
      [scheduleId],
    );
    return context.json({ data: { snoozedDays: days } });
  });

  // ── Family proxy: two-sided consent ───────────────────────────────────────

  routes.get("/family", async (context) => {
    const caller = context.get("user");
    const result = await database.query(
      // The subject must be able to see WHO holds access, not just the label
      // the requester typed about them. Without the counterparty identity the
      // consent screen cannot answer "who can read my medicines?".
      `SELECT f.id, f.display_name, f.relation, f.proxy_scope,
              f.consent_granted_at, f.member_user_id,
              CASE WHEN f.owner_user_id = $1 THEN 'PROXY' ELSE 'SUBJECT' END AS side,
              CASE WHEN f.owner_user_id = $1 THEN member_u.name ELSE owner_u.name END
                AS counterparty_name,
              CASE WHEN f.owner_user_id = $1 THEN member_u.email ELSE owner_u.email END
                AS counterparty_email
         FROM family_members f
         LEFT JOIN users owner_u ON owner_u.id = f.owner_user_id
         LEFT JOIN users member_u ON member_u.id = f.member_user_id
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

  // ── Interaction safety (MM-X2) ────────────────────────────────────────────

  /**
   * Checks a proposed addition against the patient's active regimen.
   *
   * Severity tiering is the whole point: only CONTRAINDICATED/SEVERE interrupt,
   * because alert fatigue (46–96% override rates in the literature) is what
   * makes safety alerts worthless. Every check is persisted — including the
   * ones that could not be answered — so override rate stays measurable.
   */
  routes.post("/interaction-check", async (context) => {
    const caller = context.get("user");
    const body = interactionCheckSchema.parse(await context.req.json());
    const target = body.patientUserId ?? caller.id;
    await requirePatientAuthority(database, caller.id, target, "VIEW");

    const active = await database.query<{ medicine_name: string }>(
      `SELECT medicine_name FROM dose_schedules
        WHERE patient_user_id = $1 AND active`,
      [target],
    );
    const ingredients = [
      ...active.rows.map((row) => row.medicine_name),
      ...body.addingIngredients,
    ];
    const normalized = [...new Set(ingredients.map((v) => v.trim().toLowerCase()))];

    // Coverage, pairs, and dataset freshness are all read from the DB; a
    // failure to read any of them degrades to UNAVAILABLE rather than CLEAR.
    let coveredIngredients: string[] = [];
    let knownPairs: InteractionPair[] = [];
    let datasetUpdatedAt: Date | null = null;
    let lookupFailed = false;

    try {
      const [covered, pairs, meta] = await Promise.all([
        database.query<{ ingredient: string }>(
          `SELECT ingredient FROM interaction_ingredients WHERE ingredient = ANY($1::text[])`,
          [normalized],
        ),
        database.query<{
          ingredient_a: string;
          ingredient_b: string;
          severity: InteractionPair["severity"];
          summary_ar: string;
          source: string;
        }>(
          `SELECT ingredient_a, ingredient_b, severity, summary_ar, source
             FROM drug_interactions
            WHERE ingredient_a = ANY($1::text[]) AND ingredient_b = ANY($1::text[])`,
          [normalized],
        ),
        database.query<{ updated_at: string }>(
          `SELECT MAX(updated_at) AS updated_at FROM interaction_dataset_meta`,
        ),
      ]);
      coveredIngredients = covered.rows.map((row) => row.ingredient);
      knownPairs = pairs.rows.map((row) => ({
        a: row.ingredient_a,
        b: row.ingredient_b,
        severity: row.severity,
        summaryAr: row.summary_ar,
        source: row.source,
      }));
      datasetUpdatedAt = meta.rows[0]?.updated_at
        ? new Date(meta.rows[0].updated_at)
        : null;
    } catch {
      lookupFailed = true;
    }

    const outcome = evaluateInteractions({
      ingredients: normalized,
      coveredIngredients,
      knownPairs,
      datasetUpdatedAt,
      lookupFailed,
    });

    const checkId = randomUUID();
    await database.query(
      `INSERT INTO interaction_checks
         (id, patient_user_id, checked_by_user_id, ingredients, outcome,
          unavailable_reason, findings)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)`,
      [
        checkId,
        target,
        caller.id,
        JSON.stringify(normalized),
        outcome.kind,
        outcome.kind === "UNAVAILABLE" ? outcome.reason : null,
        JSON.stringify(
          outcome.kind === "INTERRUPT"
            ? [...outcome.interrupting, ...outcome.passive]
            : outcome.kind === "INFO"
              ? outcome.passive
              : [],
        ),
      ],
    );

    // A severe interaction is the canonical SEV_ALERT: it blocks, and it is not
    // dismissible from the client. The dedupe key must therefore describe the
    // CONDITION, not the request — keying it on a fresh checkId would mint an
    // unclearable alert on every check and permanently bury the Pill Bar.
    if (outcome.kind === "INTERRUPT") {
      const conditionKey = outcome.interrupting
        .map((p) => [p.a, p.b].sort().join("+"))
        .sort()
        .join("|");
      await raiseAttention(database, {
        recipientUserId: caller.id,
        priority: "SEV_ALERT",
        kind: "INTERACTION_SEVERE",
        title: "تعارض دوائي مهم",
        body: outcome.interrupting[0]?.summaryAr,
        resourceType: "INTERACTION_CHECK",
        resourceId: checkId,
        dedupeKey: `interaction:${target}:${conditionKey}`,
      });
    }

    return context.json({
      data: {
        checkId,
        outcome,
        message: outcomeMessageAr(outcome),
        // The UI must not render a green state on anything but CLEAR.
        safeToProceedWithoutReview: outcome.kind === "CLEAR",
      },
    });
  });

  /** Records a clinical override of an interrupting alert, with its reason. */
  routes.post("/interaction-check/:checkId/override", async (context) => {
    const caller = context.get("user");
    // Only a VERIFIED dispensing professional may override a safety interrupt.
    await requireVerifiedPharmacyUser(database, caller.id, caller.role);
    const checkId = context.req.param("checkId");
    const body = overrideSchema.parse(await context.req.json());

    const existing = await database.query<{
      outcome: string;
      overridden_at: string | null;
      patient_user_id: string | null;
      checked_by_user_id: string;
    }>(
      `SELECT outcome, overridden_at, patient_user_id, checked_by_user_id
         FROM interaction_checks WHERE id = $1`,
      [checkId],
    );
    const check = existing.rows[0];
    if (!check) throw new ApiError(404, "CHECK_NOT_FOUND", "الفحص غير موجود.");
    // Being a pharmacy is not a relationship to THIS patient. Without this the
    // endpoint lets any pharmacy account clear an unrelated patient's alert.
    if (check.patient_user_id) {
      await requirePatientAuthority(database, caller.id, check.patient_user_id, "VIEW");
    }
    if (check.overridden_at) {
      throw new ApiError(409, "ALREADY_OVERRIDDEN", "سُجّل التجاوز مسبقًا.");
    }

    const validation = validateOverride({
      outcome:
        check.outcome === "INTERRUPT"
          ? { kind: "INTERRUPT", checked: 0, interrupting: [], passive: [], requiresOverrideReason: true }
          : { kind: "CLEAR", checked: 0 },
      reason: body.reason,
    });
    if (!validation.ok) {
      throw new ApiError(422, validation.code, validation.message);
    }

    await database.query(
      `UPDATE interaction_checks
          SET overridden_at = now(), override_reason = $2, override_by_user_id = $3
        WHERE id = $1`,
      [checkId, body.reason, caller.id],
    );
    await writeAudit(database, {
      actorUserId: caller.id,
      actorRole: caller.role,
      action: "INTERACTION_ALERT_OVERRIDDEN",
      resourceType: "INTERACTION_CHECK",
      resourceId: checkId,
      requestId: context.get("requestId"),
    });
    // Resolving the cause is what clears the SEV_ALERT — never a client tap.
    // Scoped to the event's own recipient so an override cannot silence
    // someone else's alert that happens to share a key.
    await database.query(
      `UPDATE attention_events SET dismissed_at = now()
        WHERE resource_type = 'INTERACTION_CHECK'
          AND resource_id = $1
          AND recipient_user_id = $2
          AND dismissed_at IS NULL`,
      [checkId, check.checked_by_user_id],
    );

    return context.json({ data: { overridden: true } });
  });

  return routes;
}
