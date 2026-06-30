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

    const metaClient = new MetaClient({ apiVersion: config.meta.apiVersion, accessToken });
    const worker = new SyncAccountWorker(prisma, metaClient);
    await worker.reconcileCampaignStatuses(account.id, { now: new Date() });
  };
}
