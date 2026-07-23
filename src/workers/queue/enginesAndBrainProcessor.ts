// ════════════════════════════════════════════════════════════════════════
//  src/workers/queue/enginesAndBrainProcessor.ts
//
//  BullMQ processor for the `engines-and-brain-v1` queue.
//
//  STATUS: Scaffolded for a future phase. In Phase 3-a the sync-account
//  processor inlines `runEngines` + `runBrainOrchestrator` on COMPLETED
//  rather than enqueueing a separate job — that preserves the existing
//  end-of-sync atomicity (engines see the freshly-written rows in the
//  same logical pass).
//
//  This processor exists so that:
//    • The 4-queue topology declared in src/lib/queue.ts has a real
//      consumer attached at boot, instead of an orphaned Queue handle.
//    • A follow-up phase that wants to split engines off the sync tail
//      (e.g. to run them on a dedicated worker class) can start enqueuing
//      to `engines-and-brain-v1` without touching the worker boot code.
//
//  Job payload contract (when used):
//    { adAccountId: string }
//
//  The processor rebuilds the MetaClient from the stored token, then runs
//  runEngines + runBrainOrchestrator. All failures throw so BullMQ records
//  the attempt and applies the configured retry policy.
// ════════════════════════════════════════════════════════════════════════

import { Job } from 'bullmq';
import { type PrismaClient } from '@prisma/client';
import { runEngines } from '../runEngines';
import { runBrainOrchestrator } from '../runBrainOrchestrator';
import { MetaClient } from '../../services/metaClient';
import { resolveAccountToken } from '../../services/accountToken';
import { decryptToken, TokenDecryptError } from '../../services/tokenEncryption';
import { config } from '../../config';

export interface EnginesAndBrainJobData {
  adAccountId: string;
}

export function createEnginesAndBrainProcessor(prisma: PrismaClient) {
  return async function processEnginesAndBrainJob(job: Job<EnginesAndBrainJobData>): Promise<void> {
    const account = await prisma.adAccount.findUnique({ where: { id: job.data.adAccountId } });
    if (!account) return;

    const resolved = await resolveAccountToken(prisma, account);
    if (!resolved.encrypted) {
      console.warn(
        `[adlytic:queue:engines-and-brain] ${account.externalAccountId} — no token available, skipping`,
      );
      return;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(resolved.encrypted);
    } catch (err) {
      if (err instanceof TokenDecryptError) {
        console.error(
          `[adlytic:queue:engines-and-brain] ${account.externalAccountId} — token decrypt failed: ${err.message}`,
        );
        return;
      }
      throw err;
    }

    const metaClient = new MetaClient({ apiVersion: config.meta.apiVersion, accessToken , timezone: account.timezone });
    await runEngines(prisma, account.id);
    await runBrainOrchestrator(prisma, metaClient, account.id);
  };
}
