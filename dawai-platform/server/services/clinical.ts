import { randomUUID } from "node:crypto";
import type { DbExecutor } from "../db/client";
import { ApiError } from "../errors";

/**
 * Clinical domain services — the adherence data graph.
 *
 * Two rules govern everything here and are enforced server-side, not in the UI:
 *  1. Clinical confirmations are append-only. A dose_event is never updated or
 *     deleted; a correction is a new row. Offline replay is deduped on
 *     (schedule, client_event_id) so retries cannot double-count adherence.
 *  2. Proxy access is never implicit. Reading or confirming on behalf of another
 *     patient requires a live, granted, scope-sufficient family link, and every
 *     such access is audited by the caller.
 */

export type ProxyScope = "VIEW" | "ORDER" | "CONFIRM";

/**
 * Asserts the caller is a VERIFIED pharmacy.
 *
 * The PHARMACY role is self-selected at registration, so `role === "PHARMACY"`
 * proves nothing: an attacker registers as a pharmacy, never onboards, and can
 * otherwise stamp instructions as pharmacist-authored or override safety
 * alerts. Verification lives on pharmacies.verification_status and must be the
 * gate for any clinically-authoritative action.
 */
export async function requireVerifiedPharmacyUser(
  database: DbExecutor,
  userId: string,
  role: string,
): Promise<{ pharmacyId: string; branchId: string }> {
  if (role !== "PHARMACY") {
    throw new ApiError(
      403,
      "PHARMACY_ACCOUNT_REQUIRED",
      "هذا الإجراء متاح لحساب صيدلية موثّق فقط.",
    );
  }
  const result = await database.query<{
    pharmacy_id: string;
    branch_id: string;
    verification_status: string;
  }>(
    `SELECT p.id AS pharmacy_id, b.id AS branch_id, p.verification_status
       FROM pharmacies p
       JOIN pharmacy_branches b ON b.pharmacy_id = p.id
      WHERE p.owner_user_id = $1
      LIMIT 1`,
    [userId],
  );
  const pharmacy = result.rows[0];
  if (!pharmacy || pharmacy.verification_status !== "VERIFIED") {
    throw new ApiError(
      403,
      "PHARMACY_NOT_VERIFIED",
      "يلزم اعتماد ترخيص الصيدلية قبل هذا الإجراء.",
    );
  }
  return { pharmacyId: pharmacy.pharmacy_id, branchId: pharmacy.branch_id };
}

const SCOPE_RANK: Record<ProxyScope, number> = {
  VIEW: 1,
  ORDER: 2,
  CONFIRM: 3,
};

export interface FamilyLink {
  id: string;
  owner_user_id: string;
  member_user_id: string | null;
  display_name: string;
  proxy_scope: ProxyScope;
}

/**
 * Resolves the caller's authority over `patientUserId`.
 *
 * Returns the family link used when acting as a proxy, or null when the caller
 * is the patient themselves. Throws rather than returning a boolean so a
 * missing check cannot silently fall through to a permissive branch.
 */
export async function requirePatientAuthority(
  database: DbExecutor,
  callerUserId: string,
  patientUserId: string,
  required: ProxyScope,
): Promise<FamilyLink | null> {
  if (callerUserId === patientUserId) return null;

  const result = await database.query<FamilyLink>(
    `SELECT id, owner_user_id, member_user_id, display_name, proxy_scope
       FROM family_members
      WHERE owner_user_id = $1
        AND member_user_id = $2
        AND consent_granted_at IS NOT NULL
        AND revoked_at IS NULL
      -- Deterministic even if historical data holds duplicate live links:
      -- always resolve to the LEAST privilege, never the luckiest row.
      ORDER BY CASE proxy_scope
                 WHEN 'VIEW' THEN 1 WHEN 'ORDER' THEN 2 ELSE 3
               END,
               created_at
      LIMIT 1`,
    [callerUserId, patientUserId],
  );

  const link = result.rows[0];
  if (!link) {
    // 404, not 403: an unauthorized caller must not learn the profile exists.
    throw new ApiError(
      404,
      "PATIENT_NOT_FOUND",
      "لا يوجد وصول لهذا الملف.",
    );
  }
  if (SCOPE_RANK[link.proxy_scope] < SCOPE_RANK[required]) {
    throw new ApiError(
      403,
      "PROXY_SCOPE_INSUFFICIENT",
      "صلاحيتك على هذا الملف لا تسمح بهذا الإجراء.",
    );
  }
  return link;
}

export interface DaysOfCover {
  scheduleId: string;
  medicineName: string;
  /** null when the data is insufficient or self-contradictory. */
  daysRemaining: number | null;
  runsOutOn: string | null;
  suppressed: boolean;
  suppressionReason?: string;
}

/**
 * Days-of-cover from dispensed quantity and dose frequency.
 *
 * The blueprint gates this feature on "≥1 full dispense cycle per patient-med"
 * and requires suppression when data conflicts. We return an honest null rather
 * than a guess: a wrong "you'll run out Thursday" trains users to ignore us.
 */
export function computeDaysOfCover(input: {
  scheduleId: string;
  medicineName: string;
  quantityDispensed: number | null;
  dosesPerDay: number;
  /** Units consumed per administration (2 tablets twice daily = 2). */
  unitsPerDose?: number;
  dispensedAt: Date | null;
  takenCount: number;
  snoozedUntil: Date | null;
  now?: Date;
}): DaysOfCover {
  const now = input.now ?? new Date();
  const base: DaysOfCover = {
    scheduleId: input.scheduleId,
    medicineName: input.medicineName,
    daysRemaining: null,
    runsOutOn: null,
    suppressed: true,
  };

  if (input.snoozedUntil && input.snoozedUntil > now) {
    return { ...base, suppressionReason: "SNOOZED" };
  }
  if (!input.quantityDispensed || !input.dispensedAt) {
    // No completed dispense cycle yet — the minimum dataset is not met.
    return { ...base, suppressionReason: "NO_DISPENSE_CYCLE" };
  }
  const unitsPerDose = input.unitsPerDose ?? 1;
  if (input.dosesPerDay <= 0 || unitsPerDose <= 0) {
    return { ...base, suppressionReason: "INVALID_FREQUENCY" };
  }
  // Units consumed per day, not administrations: a 2-tablet dose taken twice
  // daily exhausts a 30-tablet pack in 7 days, not 15.
  const unitsPerDay = input.dosesPerDay * unitsPerDose;

  // A dispense timestamp in the future is corrupt input, not zero elapsed time.
  if (input.dispensedAt.getTime() > now.getTime()) {
    return { ...base, suppressionReason: "CONFLICTING_DATA" };
  }
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - input.dispensedAt.getTime()) / 86_400_000),
  );
  const expectedConsumed = elapsedDays * unitsPerDay;

  // Confirmed doses exceeding what the dispensed pack could contain means the
  // patient has stock we don't know about, or the schedule is wrong. Either
  // way, we must not predict a run-out date from it.
  const unitsConfirmed = input.takenCount * unitsPerDose;
  if (unitsConfirmed > input.quantityDispensed) {
    return { ...base, suppressionReason: "CONFLICTING_DATA" };
  }

  // Trust confirmed intake when we have it; fall back to elapsed-time decay.
  const consumed = Math.max(
    unitsConfirmed,
    Math.min(expectedConsumed, input.quantityDispensed),
  );
  const unitsLeft = Math.max(0, input.quantityDispensed - consumed);
  const daysRemaining = Math.floor(unitsLeft / unitsPerDay);

  const runsOut = new Date(now.getTime() + daysRemaining * 86_400_000);
  return {
    scheduleId: input.scheduleId,
    medicineName: input.medicineName,
    daysRemaining,
    runsOutOn: runsOut.toISOString(),
    suppressed: false,
  };
}

/** Default reorder threshold from the blueprint's MM-P2 (5 days of cover). */
export const REORDER_THRESHOLD_DAYS = 5;

/**
 * Raises an attention event, deduped by key so a recurring condition cannot
 * flood the patient. Returns the event id, or null when suppressed as a repeat.
 */
export async function raiseAttention(
  database: DbExecutor,
  input: {
    recipientUserId: string;
    priority: "SEV_ALERT" | "ACTION_REQUIRED" | "IN_PROGRESS" | "SUGGESTION";
    kind: string;
    title: string;
    body?: string;
    resourceType?: string;
    resourceId?: string;
    dedupeKey?: string;
    expiresAt?: Date;
  },
): Promise<string | null> {
  // A severe alert that expires on a timer would route around the rule that it
  // clears only at its cause. Refuse the combination outright.
  const expiresAt = input.priority === "SEV_ALERT" ? null : (input.expiresAt ?? null);
  const id = randomUUID();
  const result = await database.query<{ id: string }>(
    `INSERT INTO attention_events
       (id, recipient_user_id, priority, kind, title, body,
        resource_type, resource_id, dedupe_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      id,
      input.recipientUserId,
      input.priority,
      input.kind,
      input.title,
      input.body ?? null,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.dedupeKey ?? null,
      expiresAt,
    ],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * SKU trust score for passive inventory (blueprint: Data Strategy).
 *
 * trust = f(movement density, reconciliation recency, variance). Only SKUs at
 * or above the threshold feed forecasting; everything else is excluded outright.
 */
export const SKU_TRUST_THRESHOLD = 0.6;

export function computeSkuTrust(input: {
  movementCount: number;
  lastCountedAt: Date | null;
  lastVariance: number;
  now?: Date;
}): number {
  const now = input.now ?? new Date();

  // Density: the blueprint wants 6–8 weeks of movements before forecasting.
  const density = Math.min(1, input.movementCount / 40);

  // Recency: a spot-count raises trust; it decays over ~90 days.
  const recency = input.lastCountedAt
    ? Math.max(
        0,
        1 - (now.getTime() - input.lastCountedAt.getTime()) / (90 * 86_400_000),
      )
    : 0;

  // Variance: a large unexplained delta at the last count lowers trust sharply.
  // A reconciliation that matched the ledger has variance 0 and is the
  // strongest possible trust signal — it must not be indistinguishable from
  // "never counted", which `recency` already handles via lastCountedAt.
  const variancePenalty = Math.min(1, Math.abs(input.lastVariance) / 20);

  const score = density * 0.5 + recency * 0.5 - variancePenalty * 0.5;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}
