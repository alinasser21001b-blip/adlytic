// ════════════════════════════════════════════════════════════════════════
//  src/workers/queue/index.ts
//
//  Worker registry. Called once at boot by src/api/serve.ts to attach one
//  BullMQ Worker to each of the 4 queues declared in src/lib/queue.ts.
//
//  Phase 3-a runs workers IN THE SAME PROCESS as the API for a smooth,
//  zero-regression rollout. Once we're confident, Phase 3-b will split
//  this module into a separate `worker.ts` entrypoint that runs on its
//  own dyno class (same code, no API routes). For now: one process, two
//  hats — same behavior as before BullMQ when the flag is off.
//
//  Concurrency is sized per-queue. The numbers below are conservative
//  starting points; tune from production metrics, not from speculation.
//
//  Crash safety: each Worker registers an `error` listener that LOGS but
//  never crashes the process. BullMQ retries failed jobs per the queue's
//  defaultJobOptions (3 attempts, exponential backoff — see queue.ts).
// ════════════════════════════════════════════════════════════════════════

import { Worker, type WorkerOptions } from 'bullmq';
import { type PrismaClient } from '@prisma/client';
import { QUEUE_NAMES, getQueueRedis, closeQueues } from '../../lib/queue';
import { config } from '../../config';
import { createSyncAccountProcessor } from './syncAccountProcessor';
import { createMaintenanceProcessor } from './maintenanceProcessor';
import { createEnginesAndBrainProcessor } from './enginesAndBrainProcessor';
import { createReconcileCampaignsProcessor } from './reconcileCampaignsProcessor';

/** Per-queue concurrency. Workers can run this many jobs in parallel within
 *  the same process. Total in-flight = sum of these values. */
const CONCURRENCY = {
  syncAccount: 2,         // long-running, Meta-API heavy; keep low
  enginesAndBrain: 2,     // CPU + DB heavy; pairs with syncAccount
  reconcileCampaigns: 4,  // short calls; safe to fan out
  maintenance: 4,         // mixed; mostly short
};

let workers: Worker[] | null = null;

/**
 * Boot the BullMQ workers attached to the queues declared in src/lib/queue.ts.
 *
 * No-op when:
 *   • BULLMQ_ENABLED is off (the flag-gated default — preserves pre-Phase-3
 *     behavior end-to-end: enqueue sites fall back to setImmediate, and no
 *     workers exist to drain a queue anyway).
 *   • REDIS_URL is unset (no client to attach to — same reason).
 *
 * Returns the number of workers actually started. Safe to call multiple
 * times; subsequent calls are no-ops.
 */
export function bootQueueWorkers(prisma: PrismaClient): number {
  if (workers !== null) return workers.length;
  if (!config.features.bullmqEnabled) {
    console.log('[adlytic:queue] BULLMQ_ENABLED=false — workers not started');
    return 0;
  }
  const connection = getQueueRedis();
  if (!connection) {
    console.warn('[adlytic:queue] BULLMQ_ENABLED=true but REDIS_URL is unset — workers not started');
    return 0;
  }

  const baseOpts = (concurrency: number): WorkerOptions => ({
    connection,
    concurrency,
    // Workers must NEVER quietly drop jobs because lock expired mid-process.
    // The default 30s lock is too short for long Meta syncs; bump to 5min.
    lockDuration: 5 * 60_000,
  });

  const w1 = new Worker(
    QUEUE_NAMES.syncAccount,
    createSyncAccountProcessor(prisma),
    baseOpts(CONCURRENCY.syncAccount),
  );
  const w2 = new Worker(
    QUEUE_NAMES.maintenance,
    createMaintenanceProcessor(prisma),
    baseOpts(CONCURRENCY.maintenance),
  );
  const w3 = new Worker(
    QUEUE_NAMES.enginesAndBrain,
    createEnginesAndBrainProcessor(prisma),
    baseOpts(CONCURRENCY.enginesAndBrain),
  );
  const w4 = new Worker(
    QUEUE_NAMES.reconcileCampaigns,
    createReconcileCampaignsProcessor(prisma),
    baseOpts(CONCURRENCY.reconcileCampaigns),
  );

  const all = [w1, w2, w3, w4];
  for (const w of all) {
    w.on('error', (err: Error) => {
      console.error(`[adlytic:queue:${w.name}] worker error: ${err.message}`);
    });
    w.on('failed', (job, err) => {
      const id = job?.id ?? '<unknown>';
      console.error(`[adlytic:queue:${w.name}] job ${id} failed: ${err.message}`);
    });
  }

  workers = all;
  console.log(
    `[adlytic:queue] workers started — sync-account×${CONCURRENCY.syncAccount}, ` +
      `maintenance×${CONCURRENCY.maintenance}, engines-and-brain×${CONCURRENCY.enginesAndBrain}, ` +
      `reconcile-campaigns×${CONCURRENCY.reconcileCampaigns}`,
  );
  return all.length;
}

/**
 * Gracefully drain in-flight jobs and close worker connections, then close
 * the queues + dedicated redis client. Called from the SIGTERM handler in
 * src/api/serve.ts so a deploy doesn't kill a job mid-flight.
 *
 * Idempotent. Returns when every worker has finished its current jobs (up to
 * the bullmq default close timeout — the killed process is the harder cap).
 */
export async function shutdownQueueWorkers(): Promise<void> {
  if (workers) {
    await Promise.allSettled(workers.map((w) => w.close()));
    workers = null;
  }
  await closeQueues();
}
