// ════════════════════════════════════════════════════════════════════════
//  src/lib/advisoryLock.ts
//
//  Shared Postgres advisory-lock helpers. Used by syncAccount (per-account
//  locks) and serve.ts (coarse auto-sync pass lock) so multi-instance
//  Railway deploys don't duplicate background work.
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

/** Non-blocking advisory lock acquire. Returns false when another session holds it. */
export async function tryAcquireAdvisoryLock(
  prisma: PrismaClient,
  key: string,
): Promise<{ acquired: boolean; lockId: number }> {
  const lockId = advisoryLockId(key);
  const [{ pg_try_advisory_lock: acquired }] = await prisma.$queryRawUnsafe<
    [{ pg_try_advisory_lock: boolean }]
  >(`SELECT pg_try_advisory_lock($1)`, lockId);
  return { acquired, lockId };
}

/** Release a session-scoped advisory lock acquired via tryAcquireAdvisoryLock. */
export async function releaseAdvisoryLock(prisma: PrismaClient, lockId: number): Promise<void> {
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock($1)`, lockId);
}
