// ════════════════════════════════════════════════════════════════════════
//  src/workers/queue/maintenanceProcessor.ts
//
//  BullMQ processor for the `maintenance-v1` queue.
//
//  This queue is MULTIPLEXED on job.name. Producers pick the name; this
//  processor dispatches to the right handler. Each branch is a 1:1 port of
//  the corresponding former setImmediate body in src/api/server.ts.
//
//  Branches:
//    'lifetime-totals'      { adAccountId } → worker.syncLifetimeTotals
//    'mock-seed'            { adAccountId } → seedMockAdAccountData
//    'webhook-event'        { payload }     → processMetaWebhookEvent
//    'initial-sync-kickoff' { adAccountId, triggeredBy } → kickoffInitialSync
//
//  Multiplexing trade-off: one queue means one worker pool sharing concurrency
//  across all four kinds of maintenance work. That's fine at our volume —
//  maintenance jobs are short and bursty; if a single type ever dominates we
//  can split it into its own `-v1` queue without touching producers (the
//  enqueue-or-fallback wrapper at each call-site is the single seam).
// ════════════════════════════════════════════════════════════════════════

import { Job } from 'bullmq';
import { type PrismaClient } from '@prisma/client';
import { SyncAccountWorker } from '../syncAccount';
import { MetaClient } from '../../services/metaClient';
import { resolveAccountToken } from '../../services/accountToken';
import { decryptToken, TokenDecryptError } from '../../services/tokenEncryption';
import { processMetaWebhookEvent } from '../../services/metaWebhook';
import { seedMockAdAccountData } from '../../services/mockMeta';
import { kickoffInitialSync } from '../../lib/initialSync';
import { config } from '../../config';

// ── job payload contracts (per name) ────────────────────────────────────────

export interface LifetimeTotalsJobData {
  adAccountId: string;
}

export interface MockSeedJobData {
  adAccountId: string;
}

export interface WebhookEventJobData {
  payload: unknown;
}

export interface InitialSyncKickoffJobData {
  adAccountId: string;
  triggeredBy: string;
}

export type MaintenanceJobData =
  | LifetimeTotalsJobData
  | MockSeedJobData
  | WebhookEventJobData
  | InitialSyncKickoffJobData;

// ── handlers ────────────────────────────────────────────────────────────────

async function handleLifetimeTotals(
  prisma: PrismaClient,
  data: LifetimeTotalsJobData,
): Promise<void> {
  const account = await prisma.adAccount.findUnique({ where: { id: data.adAccountId } });
  if (!account) return;

  const resolved = await resolveAccountToken(prisma, account);
  if (!resolved.encrypted) {
    console.warn(
      `[adlytic:queue:lifetime-totals] ${account.externalAccountId} — no token available, skipping`,
    );
    return;
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(resolved.encrypted);
  } catch (err) {
    if (err instanceof TokenDecryptError) {
      console.error(
        `[adlytic:queue:lifetime-totals] ${account.externalAccountId} — token decrypt failed: ${err.message}`,
      );
      return;
    }
    throw err;
  }

  const metaClient = new MetaClient({ apiVersion: config.meta.apiVersion, accessToken , timezone: account.timezone });
  const worker = new SyncAccountWorker(prisma, metaClient);
  await worker.syncLifetimeTotals(data.adAccountId);
}

async function handleMockSeed(prisma: PrismaClient, data: MockSeedJobData): Promise<void> {
  await seedMockAdAccountData(prisma, data.adAccountId);
}

async function handleWebhookEvent(prisma: PrismaClient, data: WebhookEventJobData): Promise<void> {
  await processMetaWebhookEvent(prisma, data.payload);
}

async function handleInitialSyncKickoff(
  prisma: PrismaClient,
  data: InitialSyncKickoffJobData,
): Promise<void> {
  await kickoffInitialSync(prisma, data.adAccountId, data.triggeredBy);
}

// ── dispatch ────────────────────────────────────────────────────────────────

export function createMaintenanceProcessor(prisma: PrismaClient) {
  return async function processMaintenanceJob(job: Job<MaintenanceJobData>): Promise<void> {
    switch (job.name) {
      case 'lifetime-totals':
        await handleLifetimeTotals(prisma, job.data as LifetimeTotalsJobData);
        return;
      case 'mock-seed':
        await handleMockSeed(prisma, job.data as MockSeedJobData);
        return;
      case 'webhook-event':
        await handleWebhookEvent(prisma, job.data as WebhookEventJobData);
        return;
      case 'initial-sync-kickoff':
        await handleInitialSyncKickoff(prisma, job.data as InitialSyncKickoffJobData);
        return;
      default:
        // Unknown name — log and acknowledge so it doesn't infinite-retry.
        console.warn(`[adlytic:queue:maintenance] unknown job name "${job.name}" — ignoring`);
        return;
    }
  };
}
