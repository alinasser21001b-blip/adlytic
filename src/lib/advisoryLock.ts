// ════════════════════════════════════════════════════════════════════════
//  src/lib/advisoryLock.ts
//
//  Shared Postgres advisory-lock helpers. Used by backgroundScheduler (the
//  scheduled per-account pass), syncAccount (sync()/syncChunked(), the manual
//  and BullMQ path), metaWebhook, reconcileCampaignsProcessor and the
//  onboarding orchestrator, so multi-instance Railway deploys don't duplicate
//  background work.
//
//  ── WHY THERE IS AN IN-PROCESS REGISTRY AS WELL AS THE DB LOCK ──────────
//
//  `pg_try_advisory_lock` excludes across SESSIONS. It is RE-ENTRANT within
//  one session: a session that already holds a key is granted it again, and
//  Postgres just increments a counter. That is correct Postgres behaviour and
//  it is exactly what breaks a lock taken over a connection POOL.
//
//  Prisma runs each `$queryRawUnsafe` on whichever pooled connection is free.
//  node-postgres hands out the most-recently-released idle client — LIFO — so
//  under the light concurrency this service normally runs at, consecutive
//  queries usually land on the SAME connection. Four producers contend for the
//  same per-account key inside ONE process (the scheduler pass, a manual or
//  BullMQ syncChunked, a Meta webhook reconcile, the reconcile-campaigns job).
//  Two of them racing would each issue `pg_try_advisory_lock`, both would very
//  likely be served by the same session, and both would be told YES — two
//  concurrent full syncs of one account, past the guard that exists to stop
//  precisely that.
//
//  The database cannot tell those two callers apart. This process can. So the
//  key is reserved HERE first, synchronously, before any await — a caller that
//  finds the key already reserved is refused without touching the database.
//  Cross-process exclusion stays Postgres's job, which it does correctly
//  because separate processes are separate sessions.
//
//  ── THE RESIDUAL, STATED RATHER THAN HIDDEN ─────────────────────────────
//
//  Acquire and release are still two independent pooled queries, so an unlock
//  can be executed on a session that does not hold the lock. Postgres then
//  returns false and the DB-side lock stays held by the original session until
//  that connection closes (pg.Pool idleTimeoutMillis is 30s, and process exit
//  drops it regardless). The unlock result is no longer discarded, so this is
//  now visible in the log instead of silent.
//
//  Note the direction of that failure: it OVER-blocks. The leaking process has
//  already released its own registry entry and can proceed; another instance
//  is refused and retries on its next pass. A skipped pass is a liveness
//  delay, not a correctness violation — unlike the re-entrant double-acquire
//  above, which was one. Pinning a dedicated session for the whole
//  acquire → work → release lifetime would close it, and is recorded as debt
//  rather than done here: it would mean these helpers stop going through
//  Prisma, and the concurrency suite that exercises them would then need a
//  live database, which the test suite deliberately does not have.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

/**
 * Stable 32-bit integer hash of a string — safe as a Postgres advisory lock key.
 * Advisory locks take a bigint; we keep it positive and under 2^31 to stay within
 * the signed 32-bit range that pg_try_advisory_lock accepts as an int4 pair.
 */
export function advisoryLockId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h >>> 1;
}

/**
 * Lock ids this process currently holds or is in the middle of acquiring.
 *
 * Module scope on purpose: every producer inside one process must consult the
 * same set, or the producer that skipped it is the one that breaks exclusion.
 */
const heldInProcess = new Set<number>();

/** Test/diagnostic view. Never mutate the returned array. */
export function locksHeldInProcess(): number[] {
  return [...heldInProcess];
}

/** Non-blocking advisory lock acquire. Returns false when the lock is already held. */
export async function tryAcquireAdvisoryLock(
  prisma: PrismaClient,
  key: string,
): Promise<{ acquired: boolean; lockId: number }> {
  const lockId = advisoryLockId(key);

  // Reserve BEFORE the first await. Node is single-threaded, so a synchronous
  // check-then-add cannot interleave; doing the check before the await and the
  // add after it could, and two racing callers would both pass the check.
  if (heldInProcess.has(lockId)) return { acquired: false, lockId };
  heldInProcess.add(lockId);

  try {
    const [{ pg_try_advisory_lock: acquired }] = await prisma.$queryRawUnsafe<
      [{ pg_try_advisory_lock: boolean }]
    >(`SELECT pg_try_advisory_lock($1)`, lockId);
    // Another PROCESS holds it: give the reservation back, or this process
    // would refuse itself forever after one contended attempt.
    if (!acquired) heldInProcess.delete(lockId);
    return { acquired, lockId };
  } catch (err) {
    heldInProcess.delete(lockId);
    throw err;
  }
}

/** Release a session-scoped advisory lock acquired via tryAcquireAdvisoryLock. */
export async function releaseAdvisoryLock(prisma: PrismaClient, lockId: number): Promise<void> {
  // Released locally first and unconditionally: whatever the database says,
  // this process is no longer working under the lock, and a registry entry
  // left behind would block this process from ever taking the key again.
  heldInProcess.delete(lockId);

  // The result used to be discarded. pg_advisory_unlock returns FALSE when the
  // executing session does not hold the lock — the pooled-connection case
  // described at the top of this file — and that is the difference between
  // "released" and "leaked until the connection closes". Log it; a warning is
  // recoverable and a silent leak is not diagnosable.
  const rows = await prisma.$queryRawUnsafe<[{ pg_advisory_unlock: boolean }]>(
    `SELECT pg_advisory_unlock($1)`,
    lockId,
  );
  if (rows?.[0]?.pg_advisory_unlock !== true) {
    console.warn(
      `[adlytic:advisory-lock] unlock of ${lockId} returned false — this pooled connection `
      + 'does not hold it, so the DB-side lock stays until that session closes. This process '
      + 'has released it locally; another instance may skip a pass until then.',
    );
  }
}
