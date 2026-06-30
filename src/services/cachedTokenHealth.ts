// ════════════════════════════════════════════════════════════════════════
//  src/services/cachedTokenHealth.ts
//
//  Phase 2 — read-through Redis cache in front of checkWorkspaceTokenHealth.
//
//  Why this exists:
//    • The unwrapped probe decrypts the stored Meta token for every call.
//      That's cheap per-call, but the UI banner polls token-health on EVERY
//      navigation, and under multi-instance scaling every dyno would
//      independently re-probe the same workspace within the same second.
//    • A 60-second cache absorbs that herd: at most one decrypt per
//      workspace per minute, regardless of instance count.
//
//  Why no feature flag:
//    • This is a purely additive optimization. When Redis is unavailable,
//      withRedis() returns the fallback path and we compute live exactly as
//      before — observably identical to current behavior.
//    • Reserve the feature-flag mechanism for changes that alter SEMANTICS
//      (webhook debounce → first-wins vs last-wins), not for opportunistic
//      caches that fall back to a no-op on outage.
//
//  Invalidation:
//    • Implicit via 60s TTL. Token-health is allowed to be slightly stale —
//      the banner is a heads-up, not the source of truth (decrypt failures
//      on the actual sync path surface immediately).
//    • If a future workflow needs to bust the cache on-demand (e.g. right
//      after a successful re-grant), call invalidateCachedTokenHealth(wsId).
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { withRedis } from '../lib/redis';
import {
  checkWorkspaceTokenHealth,
  type WorkspaceTokenHealth,
} from './checkWorkspaceTokenHealth';

const CACHE_KEY_PREFIX = 'tokenhealth:';
const CACHE_TTL_SECONDS = 60;

function key(workspaceId: string): string {
  return `${CACHE_KEY_PREFIX}${workspaceId}`;
}

/**
 * Probe the workspace token health, serving from Redis when a fresh entry
 * exists. On any Redis failure (unconfigured, unreachable, partial outage)
 * this transparently degrades to the live probe — callers cannot tell.
 */
export async function getCachedWorkspaceTokenHealth(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceTokenHealth> {
  const cacheKey = key(workspaceId);

  // 1. Read-through. `null` from withRedis means either "cache miss" OR
  //    "Redis unavailable" — we treat both the same way (compute live).
  const cached = await withRedis<string | null>(
    (r) => r.get(cacheKey),
    null,
  );
  if (typeof cached === 'string') {
    try {
      return JSON.parse(cached) as WorkspaceTokenHealth;
    } catch {
      // Corrupted entry (manual ops poke, partial write, schema drift across
      // deploys). Treat as miss and overwrite below.
    }
  }

  // 2. Cache miss — compute live.
  const health = await checkWorkspaceTokenHealth(prisma, workspaceId);

  // 3. Best-effort write. Failure is logged by withRedis() and otherwise
  //    swallowed; the response was already computed correctly.
  await withRedis(
    (r) => r.set(cacheKey, JSON.stringify(health), 'EX', CACHE_TTL_SECONDS),
    null as 'OK' | null,
  );

  return health;
}

/**
 * Bust the cached entry for one workspace. Call this from any code path that
 * mutates token state (re-grant success, token rotation, account reconnect)
 * so the next probe sees the new reality without waiting for the TTL.
 *
 * Safe to call when Redis is unavailable — no-ops via withRedis fallback.
 */
export async function invalidateCachedTokenHealth(workspaceId: string): Promise<void> {
  await withRedis(
    (r) => r.del(key(workspaceId)),
    0,
  );
}
