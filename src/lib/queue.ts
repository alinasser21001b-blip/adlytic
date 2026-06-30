// ════════════════════════════════════════════════════════════════════════
//  src/lib/queue.ts
//
//  Phase 3 of the horizontal-scaling roadmap — BullMQ distributed queues
//  for every fire-and-forget background workflow the API currently runs
//  via `setImmediate`.
//
//  Why we need a SECOND ioredis instance (not the singleton in lib/redis.ts):
//
//    • The lib/redis.ts client is tuned for fail-fast app traffic:
//        maxRetriesPerRequest: 1     // bounded blocking
//        enableOfflineQueue:   false // don't queue forever
//      This lets withRedis(fn, fallback) reject in <1s when Redis blinks,
//      keeping the API hot.
//
//    • BullMQ workers BLPOP / XREAD their queues with long-running blocking
//      reads. ioredis BLOCKS these forever-or-until-job semantically, but
//      requires maxRetriesPerRequest: null. With maxRetriesPerRequest > 0
//      BullMQ throws "maxRetriesPerRequest must be null" on construction
//      (see ioredis docs + bullmq#1873).
//
//  So this module owns a dedicated, BullMQ-compatible ioredis connection,
//  built from the same REDIS_URL as the singleton. Workers and queues share
//  it (BullMQ's recommended pattern is one connection per Queue / Worker;
//  we follow that — ONE shared dedicated connection for all queues, plus
//  ONE per worker spawned at boot).
//
//  Graceful degradation: when REDIS_URL is unset or the dedicated client is
//  unhealthy, isQueueEnabled() returns false and every call-site falls back
//  to its original setImmediate body. The API NEVER blocks on queue health.
// ════════════════════════════════════════════════════════════════════════

import IORedis, { type Redis } from 'ioredis';
import { Queue, type QueueOptions } from 'bullmq';
import { config } from '../config';

// ── queue identifiers ───────────────────────────────────────────────────────
//
// `-v1` suffix is deliberate. If the payload shape of a queue ever needs to
// change in a non-backward-compatible way, we ship a parallel `-v2` queue and
// drain `-v1` over a release, instead of teaching workers to parse two
// schemas in one queue.

export const QUEUE_NAMES = {
  /** Long-running per-syncJob ETL: syncChunked → engines+brain on COMPLETED. */
  syncAccount: 'sync-account-v1',
  /** Standalone engines+brain pass for an adAccountId. Scaffolded for a
   *  future phase that splits engines off the sync tail; unused in Phase 3-a. */
  enginesAndBrain: 'engines-and-brain-v1',
  /** Per-adAccount campaign-status reconcile triggered by Meta webhooks.
   *  Scaffolded for a follow-up phase that replaces the in-process debounce
   *  setTimeout with a delayed BullMQ job; unused in Phase 3-a. */
  reconcileCampaigns: 'reconcile-campaigns-v1',
  /** Multiplexed by job NAME. Subscribers branch on `job.name`:
   *    'lifetime-totals'      → { adAccountId }
   *    'mock-seed'            → { adAccountId }
   *    'webhook-event'        → { payload }
   *    'initial-sync-kickoff' → { adAccountId, triggeredBy }            */
  maintenance: 'maintenance-v1',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── dedicated ioredis (BullMQ-compatible) ───────────────────────────────────

let dedicatedClient: Redis | null = null;
let dedicatedHealthy = false;
let dedicatedInitialized = false;
let dedicatedLastError: string | null = null;

/** Lazily build the BullMQ-only ioredis client. Returns null when REDIS_URL
 *  is unset — callers MUST gate on isQueueEnabled() before using the queues. */
function getDedicatedClient(): Redis | null {
  if (dedicatedInitialized) return dedicatedClient;
  dedicatedInitialized = true;
  const url = config.redis.url;
  if (!url) {
    return null;
  }

  const c = new IORedis(url, {
    // BullMQ requirement: blocking commands (BRPOPLPUSH etc.) must not be
    // capped at 1 retry, otherwise they reject mid-block.
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    // Eager connect so health flips in the boot logs, not on first enqueue.
    lazyConnect: false,
    retryStrategy: (times: number) => Math.min(50 * 2 ** times, 5_000),
    reconnectOnError: (err: Error) => /READONLY/.test(err.message),
    keepAlive: 30_000,
    connectionName: `adlytic-bullmq-${config.nodeEnv}-${process.pid}`,
  });

  c.on('connect', () => {
    dedicatedHealthy = true;
    dedicatedLastError = null;
    console.log('[adlytic:queue] dedicated redis connected');
  });
  c.on('ready', () => {
    dedicatedHealthy = true;
  });
  c.on('end', () => {
    dedicatedHealthy = false;
    console.warn('[adlytic:queue] dedicated redis ended — queue ops will fall back');
  });
  c.on('error', (err: Error) => {
    if (err.message !== dedicatedLastError) {
      dedicatedLastError = err.message;
      dedicatedHealthy = false;
      console.error(`[adlytic:queue] dedicated redis error: ${err.message}`);
    }
  });

  dedicatedClient = c;
  return c;
}

/** Exposed so workers (src/workers/queue/*) can attach to the same client.
 *  Returns null when REDIS_URL is unset. */
export function getQueueRedis(): Redis | null {
  return getDedicatedClient();
}

// ── queue singletons ────────────────────────────────────────────────────────

let queues: {
  syncAccount: Queue;
  enginesAndBrain: Queue;
  reconcileCampaigns: Queue;
  maintenance: Queue;
} | null = null;

function buildQueueOptions(): QueueOptions | null {
  const c = getDedicatedClient();
  if (!c) return null;
  return {
    connection: c,
    defaultJobOptions: {
      // Idempotency: most processors re-read DB state, so a retried job
      // either no-ops (idempotent re-read) or completes the original work.
      // 3 attempts with exponential backoff covers transient Meta / DB hiccups.
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      // Keep last 100 completed for ops introspection; failed kept longer.
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  };
}

/** Construct (once) and return the queue map. Null when Redis is unavailable. */
export function getQueues() {
  if (queues) return queues;
  const opts = buildQueueOptions();
  if (!opts) return null;
  queues = {
    syncAccount: new Queue(QUEUE_NAMES.syncAccount, opts),
    enginesAndBrain: new Queue(QUEUE_NAMES.enginesAndBrain, opts),
    reconcileCampaigns: new Queue(QUEUE_NAMES.reconcileCampaigns, opts),
    maintenance: new Queue(QUEUE_NAMES.maintenance, opts),
  };
  return queues;
}

/**
 * True when the BULLMQ_ENABLED flag is on AND a dedicated Redis client is
 * configured AND it's currently healthy. Used at every enqueue site to decide
 * "use BullMQ" vs "fall back to setImmediate". Cheap & non-blocking.
 */
export function isQueueEnabled(): boolean {
  if (!config.features.bullmqEnabled) return false;
  if (!getDedicatedClient()) return false;
  return dedicatedHealthy;
}

/** Last error from the dedicated client. Safe to log. */
export function lastQueueError(): string | null {
  return dedicatedLastError;
}

// ── enqueue helper (the single migration primitive) ─────────────────────────

/**
 * Try-enqueue-or-fall-back. The migration primitive used at every former
 * `setImmediate` site:
 *
 *   enqueueOrFallback(
 *     () => queues.syncAccount.add('default', { syncJobId: id, ... }),
 *     () => setImmediate(() => { /* original sync body * / }),
 *   );
 *
 * Synchronous return: the call site is non-blocking exactly like the previous
 * setImmediate. Internally:
 *   • If isQueueEnabled() is false → call fallback() synchronously, return.
 *   • Otherwise kick off enqueueFn(). If it rejects (Redis went down between
 *     the healthy-check and the SET, etc.), call fallback().
 *
 * This means we NEVER lose work: every former setImmediate body still runs,
 * either as a BullMQ job (preferred) or as the original in-process closure.
 */
export function enqueueOrFallback(
  enqueueFn: () => Promise<unknown>,
  fallbackFn: () => void,
): void {
  if (!isQueueEnabled()) {
    fallbackFn();
    return;
  }
  enqueueFn().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[adlytic:queue] enqueue failed, falling back to setImmediate — ${msg}`);
    try {
      fallbackFn();
    } catch (fbErr) {
      console.error('[adlytic:queue] fallback ALSO threw:', fbErr);
    }
  });
}

// ── shutdown ────────────────────────────────────────────────────────────────

/** Best-effort close. Called by serve.ts on SIGTERM after workers stop. */
export async function closeQueues(): Promise<void> {
  if (queues) {
    await Promise.allSettled([
      queues.syncAccount.close(),
      queues.enginesAndBrain.close(),
      queues.reconcileCampaigns.close(),
      queues.maintenance.close(),
    ]);
    queues = null;
  }
  if (dedicatedClient) {
    try {
      await dedicatedClient.quit();
    } catch {
      // already disconnected — ignore
    }
    dedicatedClient = null;
    dedicatedHealthy = false;
    dedicatedInitialized = false;
    dedicatedLastError = null;
  }
}
