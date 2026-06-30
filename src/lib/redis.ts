// ════════════════════════════════════════════════════════════════════════
//  src/lib/redis.ts
//
//  Phase 1 of the horizontal-scaling roadmap.
//
//  This module owns the single, lazily-constructed Redis client for the
//  process. It MUST stay completely optional at the operational level:
//
//    • When REDIS_URL is unset → getRedis() returns null. Every caller is
//      expected to go through withRedis(fn, fallback), which transparently
//      returns the fallback path so the API keeps serving traffic.
//
//    • When REDIS_URL is set but Redis is unreachable (network partition,
//      Railway → managed-Redis outage, AUTH error, restart loop) → the
//      client surfaces 'error' / 'end' events, isRedisHealthy() flips to
//      false, and withRedis() catches per-operation failures, again falling
//      back. The API never crashes for Redis reasons.
//
//  No business logic lives here. Higher layers (webhook debounce, token
//  health cache, distributed locks, BullMQ queues) consume getRedis() and
//  decide their own fallback semantics.
//
//  Singleton rationale: ioredis manages its own internal pool of one TCP
//  connection per Redis client instance + a separate subscriber per pub/sub
//  consumer. Constructing more than one client per process wastes file
//  descriptors and produces inconsistent health signals — keep it to ONE.
// ════════════════════════════════════════════════════════════════════════

import IORedis, { type Redis, type RedisOptions } from 'ioredis';
import { config } from '../config';

/** Hard cap on reconnect backoff. After this delay we still keep trying but
 *  never hammer Redis faster than once every 5s. */
const RECONNECT_MAX_DELAY_MS = 5_000;

let client: Redis | null = null;
let healthy = false;
/** Memoize the "did we already try to construct?" decision so a missing
 *  REDIS_URL logs its warning exactly once instead of on every getRedis() call. */
let initialized = false;
/** Last error message — surfaced in /health style endpoints if needed. */
let lastError: string | null = null;

function buildClient(url: string): Redis {
  const opts: RedisOptions = {
    // Connect eagerly so an unreachable Redis surfaces in the boot logs,
    // not on the first cache-read hours later.
    lazyConnect: false,

    // Bounded exponential backoff. We never reject reconnects entirely —
    // a transient partition between Railway and managed Redis should heal
    // automatically once the network recovers.
    retryStrategy: (times: number) => Math.min(50 * 2 ** times, RECONNECT_MAX_DELAY_MS),

    // Fail individual commands fast during an outage instead of queueing them
    // up forever. Combined with enableOfflineQueue:false below, this is what
    // makes withRedis() return its fallback in <1s rather than hanging.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,

    // On READONLY (replica promoted, primary lost) — force a reconnect so we
    // re-resolve the writer. This is a Redis-cluster / managed-Redis concern.
    reconnectOnError: (err: Error) => /READONLY/.test(err.message),

    // Survive NAT idle timeouts (Railway's egress, cloud load balancers).
    keepAlive: 30_000,

    // Identifies this process in `CLIENT LIST` for ops visibility.
    connectionName: `adlytic-${config.nodeEnv}-${process.pid}`,
  };

  const c = new IORedis(url, opts);

  c.on('connect', () => {
    healthy = true;
    lastError = null;
    console.log('[adlytic:redis] connected');
  });
  c.on('ready', () => {
    healthy = true;
  });
  c.on('end', () => {
    healthy = false;
    console.warn('[adlytic:redis] connection ended — operations will fall back until reconnect');
  });
  c.on('reconnecting', (delay: number) => {
    console.warn(`[adlytic:redis] reconnecting in ${delay}ms`);
  });
  c.on('error', (err: Error) => {
    // De-dupe: ioredis emits the same error repeatedly during a sustained
    // outage. Log only when the message changes so prod logs stay readable.
    if (err.message !== lastError) {
      lastError = err.message;
      healthy = false;
      console.error(`[adlytic:redis] error: ${err.message}`);
    }
  });

  return c;
}

/**
 * Return the singleton Redis client, constructing it on first call. Returns
 * null when REDIS_URL is unset — callers should detect this via withRedis()
 * rather than checking for null themselves.
 */
export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;
  const url = config.redis.url;
  if (!url) {
    console.warn(
      '[adlytic:redis] REDIS_URL not set — Redis-backed features (debounce, distributed locks, queues) will use in-process fallbacks',
    );
    return null;
  }
  client = buildClient(url);
  return client;
}

/**
 * True when Redis is configured AND the last event we observed was a
 * successful connect/ready. Cheap & non-blocking. Use this from health-check
 * endpoints; do NOT use it to gate individual ops — prefer withRedis() which
 * handles a healthy → unhealthy race within a single request.
 */
export function isRedisHealthy(): boolean {
  return healthy && client !== null;
}

/** Last error message observed on the client, or null. Safe to log. */
export function lastRedisError(): string | null {
  return lastError;
}

/**
 * Run `fn` against the Redis client when one is available. On ANY failure
 * (no client, unhealthy, command rejected, network error) returns `fallback`
 * so callers degrade gracefully without try/catch noise at every site.
 *
 * Example — webhook debounce will look like:
 *
 *   const isNew = await withRedis(
 *     (r) => r.set(`debounce:${id}`, '1', 'EX', 5, 'NX'),
 *     null,                                // fallback: in-process Map
 *   );
 *
 * The cost of the wrapper is one extra Promise hop on the success path; the
 * trade is a single place that decides degradation policy.
 */
export async function withRedis<T>(
  fn: (client: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  const c = getRedis();
  if (!c) return fallback;
  try {
    return await fn(c);
  } catch (err) {
    // We do NOT flip `healthy` here — ioredis already emits 'error' which
    // does that. We just log once per distinct message and return fallback.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== lastError) {
      lastError = msg;
      console.error(`[adlytic:redis] op failed, using fallback — ${msg}`);
    }
    return fallback;
  }
}

/**
 * Gracefully close the singleton. For tests and SIGTERM handlers; production
 * paths normally let ioredis handle process exit. Idempotent.
 */
export async function closeRedis(): Promise<void> {
  if (!client) {
    initialized = false;
    return;
  }
  try {
    await client.quit();
  } catch {
    // quit() can reject if already disconnected — that's the goal anyway.
  }
  client = null;
  healthy = false;
  initialized = false;
  lastError = null;
}
