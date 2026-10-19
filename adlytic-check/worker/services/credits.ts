import { FREE_CAP, FREE_ON_ACTIVATION, FREE_POLICY_VERSION, PRICE_VERSION, UNIT_PRICE_IQD, type Balance } from "../../shared/credits";

// Credits for logged-in accounts. Every movement is one D1 batch (a single
// transaction, serialized by D1), so concurrent requests cannot overspend.
// A check row in `analyses` is the reservation: status 'pending' = held,
// `reservation_expires_at` = lease. Refills are applied lazily at each event,
// with the hold count of that moment, which is exactly the eager policy:
//   available ≤ FREE_CAP − held, +1 per refill period, anchor advances even when full.

const TICKS = `MAX(0, CAST((?2 - refill_anchor) / ?3 AS INTEGER))`;
const HELD_LIVE = `(SELECT COUNT(*) FROM analyses WHERE user_id = ?1 AND credit_bucket = 'free' AND status = 'pending' AND reservation_expires_at > ?2)`;
const EXPIRED = (bucket: "free" | "paid") =>
  `(SELECT COUNT(*) FROM analyses WHERE user_id = ?1 AND credit_bucket = '${bucket}' AND status = 'pending' AND reservation_expires_at <= ?2)`;

/** Statements that settle this user's expired leases (units go back) before anything else. */
function settleExpired(db: D1Database, userId: string, now: number, refillMs: number): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE free_quota SET
           available = MIN(${FREE_CAP} - ${HELD_LIVE}, available + ${TICKS} + ${EXPIRED("free")}),
           refill_anchor = refill_anchor + ${TICKS} * ?3,
           updated_at = ?2
         WHERE user_id = ?1`,
      )
      .bind(userId, now, refillMs),
    db.prepare(`UPDATE paid_balance SET available = available + ${EXPIRED("paid")}, updated_at = ?2 WHERE user_id = ?1 AND ${EXPIRED("paid")} > 0`).bind(userId, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at)
         SELECT ?1, credit_bucket, 1, 'release', id, ?2 FROM analyses
         WHERE user_id = ?1 AND credit_bucket IS NOT NULL AND status = 'pending' AND reservation_expires_at <= ?2`,
      )
      .bind(userId, now),
    db
      .prepare(
        `UPDATE analyses SET status = 'failed', error_code = 'reservation_expired'
         WHERE user_id = ?1 AND credit_bucket IS NOT NULL AND status = 'pending' AND reservation_expires_at <= ?2`,
      )
      .bind(userId, now),
  ];
}

export interface NewCheckRow {
  id: string;
  visitorId: string;
  userId: string;
  idempotencyKey: string;
  inputHash: string;
  mode: string;
  industry: string;
  goal: string;
  now: number;
  leaseUntil: number;
  expiresAt: number;
}

export type ReserveResult = { ok: true } | { ok: false; reason: "no_free_units" | "no_paid_units" | "duplicate" };

/**
 * Atomically: settle expired leases, apply refills, and — only if a unit is
 * available in the chosen bucket — insert the check row and take the unit.
 */
export async function reserve(db: D1Database, row: NewCheckRow, bucket: "free" | "paid", refillMs: number, priceVersion: string | null): Promise<ReserveResult> {
  const balanceCheck =
    bucket === "free"
      ? `(SELECT available FROM free_quota WHERE user_id = ?12) >= 1`
      : `(SELECT available FROM paid_balance WHERE user_id = ?12) >= 1`;
  const take =
    bucket === "free"
      ? `UPDATE free_quota SET available = available - 1, updated_at = ?2 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM analyses WHERE id = ?3 AND status = 'pending' AND credit_bucket = 'free')`
      : `UPDATE paid_balance SET available = available - 1, updated_at = ?2 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM analyses WHERE id = ?3 AND status = 'pending' AND credit_bucket = 'paid')`;
  try {
    const res = await db.batch([
      ...settleExpired(db, row.userId, row.now, refillMs),
      db
        .prepare(
          `INSERT INTO analyses
             (id, visitor_id, idempotency_key, input_hash, status, mode, industry, goal, created_at, reservation_expires_at, expires_at, user_id, credit_bucket, price_version)
           SELECT ?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?8, ?9, ?10, ?12, ?11, ?13
           WHERE ${balanceCheck}`,
        )
        .bind(row.id, row.visitorId, row.idempotencyKey, row.inputHash, row.mode, row.industry, row.goal, row.now, row.leaseUntil, row.expiresAt, bucket, row.userId, priceVersion),
      db.prepare(take).bind(row.userId, row.now, row.id),
      db
        .prepare(
          `INSERT INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at)
           SELECT ?1, ?4, -1, 'reserve', ?3, ?2 WHERE EXISTS (SELECT 1 FROM analyses WHERE id = ?3 AND status = 'pending')`,
        )
        .bind(row.userId, row.now, row.id, bucket),
    ]);
    const inserted = res[4]?.meta.changes === 1;
    if (inserted) return { ok: true };
    return { ok: false, reason: bucket === "free" ? "no_free_units" : "no_paid_units" };
  } catch (err) {
    // UNIQUE(visitor_id, idempotency_key): the whole batch rolled back; the caller replays.
    if (err instanceof Error && /UNIQUE|constraint/i.test(err.message)) return { ok: false, reason: "duplicate" };
    throw err;
  }
}

/** Publish the report only if this request still holds a live lease; the unit is then spent. */
export async function consume(db: D1Database, userId: string, id: string, reportJson: string, latencyMs: number, now: number, refillMs: number): Promise<boolean> {
  const res = await db.batch([
    // Refills up to this instant are applied while the unit is still held.
    db
      .prepare(`UPDATE free_quota SET available = MIN(${FREE_CAP} - ${HELD_LIVE}, available + ${TICKS}), refill_anchor = refill_anchor + ${TICKS} * ?3, updated_at = ?2 WHERE user_id = ?1`)
      .bind(userId, now, refillMs),
    db
      .prepare(
        `UPDATE analyses SET status = 'completed', report_json = ?2, completed_at = ?3, latency_ms = ?4
         WHERE id = ?1 AND status = 'pending' AND reservation_expires_at > ?3`,
      )
      .bind(id, reportJson, now, latencyMs),
    db
      .prepare(
        `INSERT OR IGNORE INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at)
         SELECT ?1, credit_bucket, 0, 'consume', id, ?3 FROM analyses WHERE id = ?2 AND status = 'completed'`,
      )
      .bind(userId, id, now),
  ]);
  return res[1]?.meta.changes === 1;
}

/** Return the unit of a check that produced no valid report. Idempotent. */
export async function release(db: D1Database, userId: string, id: string, errorCode: string, latencyMs: number | null, now: number, refillMs: number): Promise<void> {
  const heldExcl = `(SELECT COUNT(*) FROM analyses WHERE user_id = ?1 AND credit_bucket = 'free' AND status = 'pending' AND reservation_expires_at > ?2 AND id != ?4)`;
  const mineFree = `EXISTS (SELECT 1 FROM analyses WHERE id = ?4 AND status = 'pending' AND credit_bucket = 'free')`;
  await db.batch([
    db
      .prepare(
        `UPDATE free_quota SET
           available = MIN(${FREE_CAP} - ${heldExcl}, MIN(${FREE_CAP} - ${HELD_LIVE}, available + ${TICKS}) + CASE WHEN ${mineFree} THEN 1 ELSE 0 END),
           refill_anchor = refill_anchor + ${TICKS} * ?3,
           updated_at = ?2
         WHERE user_id = ?1`,
      )
      .bind(userId, now, refillMs, id),
    db
      .prepare(`UPDATE paid_balance SET available = available + 1, updated_at = ?2 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM analyses WHERE id = ?3 AND status = 'pending' AND credit_bucket = 'paid')`)
      .bind(userId, now, id),
    db
      .prepare(
        `INSERT OR IGNORE INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at)
         SELECT ?1, credit_bucket, 1, 'release', id, ?2 FROM analyses WHERE id = ?3 AND status = 'pending' AND credit_bucket IS NOT NULL`,
      )
      .bind(userId, now, id),
    db
      .prepare(`UPDATE analyses SET status = 'failed', error_code = ?2, latency_ms = COALESCE(?3, latency_ms) WHERE id = ?1 AND status = 'pending'`)
      .bind(id, errorCode, latencyMs),
  ]);
}

/** Creates the account's buckets and the one-time activation grant. */
export function activationStatements(db: D1Database, userId: string, now: number): D1PreparedStatement[] {
  return [
    db.prepare("INSERT INTO free_grants (user_id, granted_at, amount) VALUES (?1, ?2, ?3)").bind(userId, now, FREE_ON_ACTIVATION),
    db
      .prepare("INSERT INTO free_quota (user_id, available, refill_anchor, policy_version, updated_at) VALUES (?1, ?2, ?3, ?4, ?3)")
      .bind(userId, FREE_ON_ACTIVATION, now, FREE_POLICY_VERSION),
    db.prepare("INSERT INTO paid_balance (user_id, available, updated_at) VALUES (?1, 0, ?2)").bind(userId, now),
    db
      .prepare("INSERT INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at) VALUES (?1, 'free', ?3, 'activation_grant', ?1, ?2)")
      .bind(userId, now, FREE_ON_ACTIVATION),
  ];
}

/** Read-only balance, computed exactly as the next event would settle it. */
export async function balanceOf(db: D1Database, userId: string, now: number, refillMs: number): Promise<Balance> {
  const row = await db
    .prepare(
      `SELECT f.available AS free, f.refill_anchor AS anchor, p.available AS paid,
         ${HELD_LIVE.replace(/\?1/g, "f.user_id")} AS held,
         ${EXPIRED("free").replace(/\?1/g, "f.user_id")} AS expired_free,
         ${EXPIRED("paid").replace(/\?1/g, "f.user_id")} AS expired_paid
       FROM free_quota f JOIN paid_balance p ON p.user_id = f.user_id WHERE f.user_id = ?1`,
    )
    .bind(userId, now)
    .first<{ free: number; anchor: number; paid: number; held: number; expired_free: number; expired_paid: number }>();
  if (!row) {
    return { serverNow: new Date(now).toISOString(), freeAvailable: 0, freeHeld: 0, paidAvailable: 0, nextRefillAt: null, unitPriceIQD: UNIT_PRICE_IQD, priceVersion: PRICE_VERSION, policyVersion: FREE_POLICY_VERSION };
  }
  const ticks = Math.max(0, Math.floor((now - row.anchor) / refillMs));
  const freeAvailable = Math.min(FREE_CAP - row.held, row.free + ticks + row.expired_free);
  const anchor = row.anchor + ticks * refillMs;
  return {
    serverNow: new Date(now).toISOString(),
    freeAvailable,
    freeHeld: row.held,
    paidAvailable: row.paid + row.expired_paid,
    nextRefillAt: new Date(anchor + refillMs).toISOString(),
    unitPriceIQD: UNIT_PRICE_IQD,
    priceVersion: PRICE_VERSION,
    policyVersion: FREE_POLICY_VERSION,
  };
}

/** Cron: settle every expired credited lease (runs before the generic stale-pending sweep). */
export function sweepExpiredStatements(db: D1Database, now: number): D1PreparedStatement[] {
  const heldFor = `(SELECT COUNT(*) FROM analyses a WHERE a.user_id = free_quota.user_id AND a.credit_bucket = 'free' AND a.status = 'pending' AND a.reservation_expires_at > ?1)`;
  const expFor = (t: string, b: string) => `(SELECT COUNT(*) FROM analyses a WHERE a.user_id = ${t}.user_id AND a.credit_bucket = '${b}' AND a.status = 'pending' AND a.reservation_expires_at <= ?1)`;
  return [
    db.prepare(`UPDATE free_quota SET available = MIN(${FREE_CAP} - ${heldFor}, available + ${expFor("free_quota", "free")}), updated_at = ?1 WHERE ${expFor("free_quota", "free")} > 0`).bind(now),
    db.prepare(`UPDATE paid_balance SET available = available + ${expFor("paid_balance", "paid")}, updated_at = ?1 WHERE ${expFor("paid_balance", "paid")} > 0`).bind(now),
    db
      .prepare(
        `INSERT OR IGNORE INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at)
         SELECT user_id, credit_bucket, 1, 'release', id, ?1 FROM analyses
         WHERE credit_bucket IS NOT NULL AND user_id IS NOT NULL AND status = 'pending' AND reservation_expires_at <= ?1`,
      )
      .bind(now),
  ];
}
