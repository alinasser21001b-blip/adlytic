// ════════════════════════════════════════════════════════════════════════
//  src/workers/queue/reconcileCampaignsProcessor.ts
//
//  BullMQ processor for the `reconcile-campaigns-v1` queue.
//
//  STATUS: Scaffolded for a future phase. In Phase 3-a the Meta webhook
//  debounce in src/services/metaWebhook.ts still schedules the actual
//  reconcile via setTimeout inside the winning instance. The next phase
//  will replace that setTimeout with `queues.reconcileCampaigns.add(...,
//  { delay: 5000 })` so a crashed winner is recovered by another worker.
//
//  This processor exists so the queue topology has a real consumer attached
//  at boot — switching producers to enqueue here becomes a one-line change
//  in metaWebhook.ts when we're ready.
//
//  Job payload contract (when used):
//    { adAccountId: string }
//
//  The processor rebuilds the MetaClient from the stored token and runs
//  `worker.reconcileCampaignStatuses(adAccountId)`. All failures throw so
//  BullMQ records the attempt and applies the configured retry policy —
//  the periodic polling loop in serve.ts remains the durable safety net.
// ════════════════════════════════════════════════════════════════════════

import { Job } from 'bullmq';
import { type PrismaClient } from '@prisma/client';
import { SyncAccountWorker } from '../syncAccount';
import { MetaClient } from '../../services/metaClient';
import { resolveAccountToken } from '../../services/accountToken';
import { decryptToken, TokenDecryptError } from '../../services/tokenEncryption';
import { config } from '../../config';
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from '../../lib/advisoryLock';

export interface ReconcileCampaignsJobData {
  adAccountId: string;
}

export function createReconcileCampaignsProcessor(prisma: PrismaClient) {
  return async function processReconcileCampaignsJob(
    job: Job<ReconcileCampaignsJobData>,
  ): Promise<void> {
    const account = await prisma.adAccount.findUnique({ where: { id: job.data.adAccountId } });
    if (!account) return;

    const resolved = await resolveAccountToken(prisma, account);
    if (!resolved.encrypted) {
      console.warn(
        `[adlytic:queue:reconcile-campaigns] ${account.externalAccountId} — no token available, skipping`,
      );
      return;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(resolved.encrypted);
    } catch (err) {
      if (err instanceof TokenDecryptError) {
        console.error(
          `[adlytic:queue:reconcile-campaigns] ${account.externalAccountId} — token decrypt failed: ${err.message}`,
        );
        return;
      }
      throw err;
    }

    const metaClient = new MetaClient({ apiVersion: config.meta.apiVersion, accessToken , timezone: account.timezone });
    const worker = new SyncAccountWorker(prisma, metaClient);
    // Same per-account advisory lock sync()/backgroundScheduler.ts hold for
    // their whole pipeline — reconcileCampaignStatuses() reads a Campaign-row
    // snapshot and upserts against it, so an account-level sync running
    // concurrently would otherwise race its own snapshot against this job's.
    const { acquired, lockId } = await tryAcquireAdvisoryLock(prisma, account.id);
    if (!acquired) {
      console.warn(`[adlytic:queue:reconcile-campaigns] ${account.externalAccountId} — sync already in progress, skipping`);
      return;
    }
    try {
      await worker.reconcileCampaignStatuses(account.id, { now: new Date() });
    } finally {
      await releaseAdvisoryLock(prisma, lockId);
    }
  };
}
