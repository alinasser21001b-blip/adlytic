// ════════════════════════════════════════════════════════════════════════
//  src/workers/backgroundScheduler.ts
//
//  All the recurring background work that used to live inside serve.ts's
//  main(): the auto-sync loop, daily maintenance, and BullMQ worker boot.
//
//  Extracted so it can run in EITHER of two processes:
//    • the combined API process (SERVICE_ROLE=combined, the default — behaves
//      exactly like the pre-split single service), or
//    • a dedicated worker process (src/workers/serve.worker.ts), so the API
//      never runs Meta ETL on its event loop.
//
//  Nothing here serves HTTP. startBackgroundWork() is the single entry point;
//  the API calls it only in 'combined' role, the worker always calls it.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { SyncAccountWorker } from './syncAccount';
import { MetaClient, MetaApiError } from '../services/metaClient';
import { decryptToken, TokenDecryptError } from '../services/tokenEncryption';
import { resolveAccountToken, handleMeta190 } from '../services/accountToken';
import { runEngines } from './runEngines';
import { runBrainOrchestrator } from './runBrainOrchestrator';
import { config } from '../config';
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from '../lib/advisoryLock';
import { refreshExpiringMetaTokens } from './refreshMetaTokens';
import { refreshCampaignHistoryRollups } from './rollupHistory';
import { bootQueueWorkers } from './queue';

const SYNC_INTERVAL_MS = config.sync.intervalMs;
const RAW_INSIGHTS_RETAIN_DAYS = config.sync.rawInsightsRetainDays;
const API_VERSION = config.meta.apiVersion;

/**
 * Clean up zombie SyncJobs left by a prior crash/deploy. Any job that was
 * PENDING or PROCESSING when the process died will never complete — mark it
 * FAILED so new sync requests aren't blocked by the "reuse active job" logic.
 * Idempotent (time-filtered updateMany) so it's safe to run from any process.
 */
export async function cleanupOrphanedSyncJobs(prisma: PrismaClient): Promise<void> {
  try {
    const { count } = await prisma.syncJob.updateMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      data: { status: 'FAILED', error: 'Server restarted — job was orphaned', completedAt: new Date() },
    });
    if (count > 0) console.log(`[adlytic:startup] Cleaned up ${count} orphaned sync job(s)`);
  } catch (err) {
    console.warn('[adlytic:startup] Failed to clean up orphaned sync jobs:', err);
  }
}

// ── Background auto-sync ─────────────────────────────────────────────
async function syncAllAccounts(prisma: PrismaClient): Promise<void> {
  const now = new Date();
  let accounts;
  try {
    accounts = await prisma.adAccount.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          // Legacy / user-OAuth / manual / direct-token accounts: token lives
          // on the account and may expire. Excludes SYSTEM_USER so behavior
          // here is byte-for-byte identical to before when the flag is off.
          {
            tokenSource: { not: 'SYSTEM_USER' },
            accessTokenEncrypted: { not: null },
            OR: [
              { tokenExpiresAt: null },
              { tokenExpiresAt: { gt: now } },
            ],
          },
          // Phase 2 — System User accounts: token lives on the MetaConnection
          // and never expires. Only sync while the connection is ACTIVE so a
          // NEEDS_REGRANT/REVOKED connection is skipped (no retry storm).
          {
            tokenSource: 'SYSTEM_USER',
            connectionId: { not: null },
            connection: { is: { status: 'ACTIVE', accessTokenEncrypted: { not: null } } },
          },
        ],
      },
      select: {
        id: true,
        workspaceId: true,
        externalAccountId: true,
        accessTokenEncrypted: true,
        tokenSource: true,
        connectionId: true,
        connection: { select: { id: true, status: true, accessTokenEncrypted: true } },
      },
    });
  } catch (err) {
    console.error('[adlytic:auto-sync] Failed to list accounts:', err);
    return;
  }

  if (accounts.length === 0) return;
  console.log(`[adlytic:auto-sync] Syncing ${accounts.length} account(s)…`);

  for (const acct of accounts) {
    // Phase 2 — resolve the authoritative token via the shared helper.
    const { encrypted, isSystemUser, connectionId } = await resolveAccountToken(prisma, acct);
    if (!encrypted) continue;

    // Decrypt up front so a TOKEN_ENCRYPTION_KEY mismatch is never mistaken
    // for an expired/invalid Meta token (190). On decrypt failure, skip this
    // account this cycle without touching its status/token.
    let accessToken: string;
    try {
      accessToken = decryptToken(encrypted);
    } catch (decErr) {
      if (decErr instanceof TokenDecryptError) {
        console.error(`[adlytic:auto-sync] Skipping ${acct.externalAccountId} — token decrypt failed (key mismatch, not a 190): ${decErr.message}`);
        continue;
      }
      throw decErr;
    }

    // On a Meta 190 (expired/invalid token): legacy accounts are PAUSED and
    // their token nulled (owner must reconnect). SYSTEM_USER accounts instead
    // flag the MetaConnection NEEDS_REGRANT. Shared with the manual "Sync now"
    // route via handleMeta190.
    const handle190 = (): Promise<void> => handleMeta190(prisma, {
      accountId: acct.id,
      externalAccountId: acct.externalAccountId,
      isSystemUser,
      connectionId,
      workspaceId: acct.workspaceId,
    });

    try {
      const metaClient = new MetaClient({ apiVersion: API_VERSION, accessToken });
      const worker = new SyncAccountWorker(prisma, metaClient);
      const tag = `[adlytic:auto-sync:${acct.externalAccountId}]`;
      const syncStart = Date.now();

      // Phase 0: Intra-day velocity (single fast call — "today so far")
      try {
        await worker.syncToday(acct.id);
      } catch (todayErr) {
        console.error(`${tag} syncToday failed (non-fatal):`, todayErr instanceof Error ? todayErr.message : todayErr);
      }

      // Phase 1: Account-level daily stats (28-day backfill for attribution lag)
      const syncResult = await worker.sync(acct.id, { backfillDays: 28 });
      if (!syncResult.ok) {
        console.warn(`${tag} account sync ✗: ${syncResult.error}`);
        if (syncResult.error && /code.*190|190.*code|OAuthException/.test(syncResult.error)) {
          await handle190();
        }
        continue;
      }

      // Phase 2: Campaign-level daily stats + status reconciliation
      const since = new Date(Date.now() - 28 * 864e5);
      const until = new Date();
      try {
        const campResult = await worker.syncCampaigns(acct.id, { since, until });
        console.log(`${tag} campaigns: ${campResult.dailyRowsUpserted} daily rows`);
      } catch (campErr) {
        console.error(`${tag} syncCampaigns failed (non-fatal):`, campErr instanceof Error ? campErr.message : campErr);
      }

      // Phase 3: Ad-set + Ad + Creative discovery
      try {
        const adsResult = await worker.syncAdSetsAndAds(acct.id, { since });
        console.log(`${tag} ads: ${adsResult.adsUpserted} ads, ${adsResult.creativesUpserted} creatives`);
      } catch (adsErr) {
        console.error(`${tag} syncAdSetsAndAds failed (non-fatal):`, adsErr instanceof Error ? adsErr.message : adsErr);
      }

      // Phase 4: Ad-level daily stats (feeds get_creative_performance)
      try {
        const adInsResult = await worker.syncAdInsights(acct.id, { since, until });
        console.log(`${tag} ad insights: ${adInsResult.rowsUpserted} rows`);
      } catch (aiErr) {
        console.error(`${tag} syncAdInsights failed (non-fatal):`, aiErr instanceof Error ? aiErr.message : aiErr);
      }

      // Phase 5: Breakdowns (age/gender/platform — feeds audience tool)
      try {
        const bdResult = await worker.syncBreakdowns(acct.id, { since, until });
        console.log(`${tag} breakdowns: ${bdResult.rowsUpserted} segment rows`);
      } catch (bdErr) {
        console.error(`${tag} syncBreakdowns failed (non-fatal):`, bdErr instanceof Error ? bdErr.message : bdErr);
      }

      // Phase 6: Engines + Brain
      await runEngines(prisma, acct.id);
      try {
        await runBrainOrchestrator(prisma, metaClient, acct.id);
      } catch (brainErr) {
        console.error(`${tag} brain refresh failed:`, brainErr instanceof Error ? brainErr.message : brainErr);
      }

      console.log(`${tag} ✓ full sync done (${Date.now() - syncStart}ms)`);
    } catch (err) {
      console.error(`[adlytic:auto-sync] Error syncing ${acct.externalAccountId}:`, err);
      if (err instanceof MetaApiError) {
        const body = err.body as Record<string, any>;
        if (body?.error?.code === 190) {
          await handle190();
        }
      }
    }
  }
}

// Recursive setTimeout so the next pass only starts after the previous one
// fully completes. setInterval would queue overlapping runs if a sync takes
// longer than SYNC_INTERVAL_MS (e.g. many accounts, slow Meta API).
async function runBackgroundPass(prisma: PrismaClient): Promise<void> {
  const { acquired, lockId } = await tryAcquireAdvisoryLock(prisma, 'adlytic:auto-sync');
  if (!acquired) {
    console.log('[adlytic:auto-sync] Another instance holds the auto-sync lock — skipping this tick');
    return;
  }
  try {
    await refreshExpiringMetaTokens(prisma);
    await syncAllAccounts(prisma);
  } finally {
    await releaseAdvisoryLock(prisma, lockId);
  }
}

function scheduleSyncLoop(prisma: PrismaClient): void {
  setTimeout(async () => {
    await runBackgroundPass(prisma);
    scheduleSyncLoop(prisma);
  }, SYNC_INTERVAL_MS);
}

// ── Raw insights retention job ───────────────────────────────────────
// Deletes raw_insight rows older than RAW_INSIGHTS_RETAIN_DAYS to prevent
// unbounded table growth. Processed data lives in daily_stats and is kept.
async function pruneRawInsights(prisma: PrismaClient): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RAW_INSIGHTS_RETAIN_DAYS * 864e5);
    const result = await prisma.rawInsight.deleteMany({
      where: { fetchedAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[adlytic:retention] Deleted ${result.count} raw_insight rows older than ${RAW_INSIGHTS_RETAIN_DAYS} days`);
    }
  } catch (err) {
    console.error('[adlytic:retention] Failed to prune raw_insights:', err);
  }
}

async function refreshHistoryRollups(prisma: PrismaClient): Promise<void> {
  try {
    const result = await refreshCampaignHistoryRollups(prisma);
    if (result.upserted > 0) {
      console.log(
        `[adlytic:rollup] Refreshed ${result.upserted} rollup row(s) across ${result.workspaces} workspace(s)`,
      );
    }
  } catch (err) {
    console.error('[adlytic:rollup] Failed to refresh campaign history rollups:', err);
  }
}

async function runDailyMaintenance(prisma: PrismaClient): Promise<void> {
  await pruneRawInsights(prisma);
  await refreshHistoryRollups(prisma);
}

/**
 * Boot every recurring background workflow: BullMQ workers (no-op when
 * BULLMQ_ENABLED is off), the auto-sync loop, and daily maintenance. Called
 * by the combined API process (default) or the dedicated worker service.
 */
export function startBackgroundWork(prisma: PrismaClient): void {
  // BullMQ workers drain the 4 queues (sync-account, maintenance,
  // engines-and-brain, reconcile-campaigns). No-op when BULLMQ_ENABLED is off.
  bootQueueWorkers(prisma);

  scheduleSyncLoop(prisma);

  // Delay initial maintenance by 30s so startup traffic settles first.
  setTimeout(() => {
    void runDailyMaintenance(prisma);
    setInterval(() => { void runDailyMaintenance(prisma); }, 24 * 60 * 60_000);
  }, 30_000);
}
