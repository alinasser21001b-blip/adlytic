// ════════════════════════════════════════════════════════════════════════
//  src/api/serve.ts
//
//  Entry point.  Run with:
//    npx tsx src/api/serve.ts
//
//  Boots the Hono app via @hono/node-server on PORT (default 3001).
//  DATABASE_URL must be set (via .env or the shell environment) for
//  any route that touches Prisma.
//
//  Background sync: every SYNC_INTERVAL_MS (default 6h) this process
//  iterates all active ad accounts with a valid token and runs
//  ETL + engine pipeline. Each account is synced serially to avoid
//  hammering the Meta API.
// ════════════════════════════════════════════════════════════════════════

import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { buildRoutes, ROUTE_COUNT } from './server';
import { SyncAccountWorker } from '../workers/syncAccount';
import { MetaClient, MetaApiError } from '../services/metaClient';
import { decryptToken, TokenDecryptError } from '../services/tokenEncryption';
import { resolveAccountToken, handleMeta190 } from '../services/accountToken';
import { runEngines } from '../workers/runEngines';
import { runBrainOrchestrator } from '../workers/runBrainOrchestrator';
import { getMetaOAuthConfigStatus } from '../services/metaOAuth';
import { config, reportConfig } from '../config';
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from '../lib/advisoryLock';
import { refreshExpiringMetaTokens } from '../workers/refreshMetaTokens';
import { refreshCampaignHistoryRollups } from '../workers/rollupHistory';
import { bootQueueWorkers, shutdownQueueWorkers } from '../workers/queue';

const PORT = config.port;
// Background sync interval: default 6 hours (can be overridden via env)
const SYNC_INTERVAL_MS = config.sync.intervalMs;
// Raw insights retention: delete rows older than this many days (default 90)
const RAW_INSIGHTS_RETAIN_DAYS = config.sync.rawInsightsRetainDays;
const API_VERSION = config.meta.apiVersion;

// ── Global safety net: log unhandled rejections/exceptions instead of crashing ──
process.on('unhandledRejection', (reason) => {
  console.error('[adlytic:unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[adlytic:uncaughtException]', err);
  // uncaughtException leaves the process in an undefined state — exit after logging
  process.exit(1);
});

async function main(): Promise<void> {
  // Single validated-config checklist. In production this exits(1) when a
  // required var (JWT_SECRET / TOKEN_ENCRYPTION_KEY / DATABASE_URL) is
  // missing or invalid; in development it warns and continues.
  reportConfig();

  const dbUrl = config.database.url;
  if (!dbUrl) {
    // In development reportConfig only warns, but we still cannot construct a
    // DB pool without a URL — fail clearly here rather than crash on parse.
    console.error('[adlytic:fatal] DATABASE_URL is not set. Run with --env-file=.env or set the variable in the environment.');
    process.exit(1);
  }
  const parsed = new URL(dbUrl);
  // SSL: require for external hosts (Railway proxy, Supabase, etc.)
  //       skip for Railway's private internal network (*.railway.internal)
  const isInternalHost = parsed.hostname.endsWith('.railway.internal');
  const sslConfig = isInternalHost ? false : { rejectUnauthorized: false };
  const pool   = new pg.Pool({
    host:     parsed.hostname,
    port:     Number(parsed.port) || 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl:      sslConfig,
    max: Number(process.env['PG_POOL_MAX'] ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma  = new PrismaClient({ adapter });

  // TOKEN_ENCRYPTION_KEY validation (prod-fatal / dev-warn) + key fingerprint
  // are handled by reportConfig() above — see src/config.ts.

  // Verify the DB connection is reachable before accepting traffic
  try {
    await prisma.$connect();
  } catch (err) {
    console.warn('[adlytic] Warning: database connection failed — DB-backed routes will error.', err);
  }

  const app = buildRoutes(prisma);

  // Phase 3-a: boot BullMQ workers IN-PROCESS. When BULLMQ_ENABLED is off,
  // this is a no-op and the API behaves exactly as before. When on, the same
  // process now drains the 4 queues (sync-account, maintenance,
  // engines-and-brain, reconcile-campaigns) alongside serving HTTP traffic.
  bootQueueWorkers(prisma);

  serve(
    { fetch: app.fetch, port: PORT },
    (info) => {
      console.log(`[adlytic] Server listening on http://localhost:${info.port}`);
      console.log(`[adlytic] Routes mounted: ${ROUTE_COUNT}`);
      console.log(`[adlytic] Health:     GET http://localhost:${info.port}/api/health`);
      console.log(`[adlytic] Dashboard:  GET http://localhost:${info.port}/api/dashboard/:workspaceId`);
      console.log(`[adlytic] Auto-sync:  every ${
        SYNC_INTERVAL_MS >= 3600000
          ? `${Math.round(SYNC_INTERVAL_MS / 3600000)}h`
          : `${Math.round(SYNC_INTERVAL_MS / 60000)}m`
      }`);

      // Meta OAuth diagnostic: surface the reason at boot when it is unusable,
      // so operators see why "Connect Meta Ads" falls back to the manual modal.
      const metaStatus = getMetaOAuthConfigStatus();
      if (metaStatus.ok) {
        console.log(`[adlytic] Meta OAuth configured (redirect ${metaStatus.redirectUri}, api ${metaStatus.apiVersion})`);
      } else {
        console.warn(`[adlytic] Meta OAuth unavailable: ${metaStatus.reason}`);
      }
    }
  );

  // ── Background auto-sync ─────────────────────────────────────────────
  async function syncAllAccounts(): Promise<void> {
    const now = new Date();
    let accounts;
    try {
      accounts = await prisma.adAccount.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            // Legacy / user-OAuth / manual / direct-token accounts: token lives
            // on the account and may expire. Excludes SYSTEM_USER so behavior
            // here is byte-for-byte identical to before when the flag is off
            // (no SYSTEM_USER rows exist) and unchanged for existing rows
            // (all default to USER_OAUTH).
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
      // SYSTEM_USER accounts read the (non-expiring) token from their
      // MetaConnection (selected inline above, so no extra query); everyone
      // else uses the per-account token exactly as before.
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
      // flag the MetaConnection NEEDS_REGRANT — the token is not "expired", the
      // business must re-grant assets — and are left ACTIVE/untouched otherwise.
      // Shared with the manual "Sync now" route via handleMeta190.
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
        // 28 days covers Meta's full attribution backfill window so late-arriving
        // conversions on days 8-28 update in daily_stats instead of going stale.
        const syncResult = await worker.sync(acct.id, { backfillDays: 28 });
        if (syncResult.ok) {
          await runEngines(prisma, acct.id);
          // Refresh V6 Brain tables (campaignBrainSnapshot / campaignIntelligenceReport)
          // so the dashboard's Brain section, CMO feed, and AI context stop reading
          // stale rows in the in-process (non-BullMQ) fallback path. BullMQ path
          // already does this in syncAccountProcessor.
          try {
            await runBrainOrchestrator(prisma, metaClient, acct.id);
          } catch (brainErr) {
            console.error(`[adlytic:auto-sync] brain refresh failed for ${acct.externalAccountId}:`, brainErr);
          }
          console.log(`[adlytic:auto-sync] ✓ ${acct.externalAccountId} (${syncResult.rowsUpserted} rows, ${syncResult.durationMs}ms)`);
        } else {
          console.warn(`[adlytic:auto-sync] ✗ ${acct.externalAccountId}: ${syncResult.error}`);
          if (syncResult.error && /code.*190|190.*code|OAuthException/.test(syncResult.error)) {
            await handle190();
          }
        }
      } catch (err) {
        console.error(`[adlytic:auto-sync] Error syncing ${acct.externalAccountId}:`, err);
        // Also catch MetaApiError code 190 thrown before SyncResult is produced
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
  async function runBackgroundPass(): Promise<void> {
    const { acquired, lockId } = await tryAcquireAdvisoryLock(prisma, 'adlytic:auto-sync');
    if (!acquired) {
      console.log('[adlytic:auto-sync] Another instance holds the auto-sync lock — skipping this tick');
      return;
    }
    try {
      await refreshExpiringMetaTokens(prisma);
      await syncAllAccounts();
    } finally {
      await releaseAdvisoryLock(prisma, lockId);
    }
  }

  function scheduleSyncLoop(): void {
    setTimeout(async () => {
      await runBackgroundPass();
      scheduleSyncLoop();
    }, SYNC_INTERVAL_MS);
  }
  scheduleSyncLoop();

  // ── Raw insights retention job ───────────────────────────────────────
  // Runs once at startup (after a short delay) and then every 24 hours.
  // Deletes raw_insight rows older than RAW_INSIGHTS_RETAIN_DAYS to prevent
  // unbounded table growth. Processed data lives in daily_stats and is kept.
  async function pruneRawInsights(): Promise<void> {
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

  async function refreshHistoryRollups(): Promise<void> {
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

  async function runDailyMaintenance(): Promise<void> {
    await pruneRawInsights();
    await refreshHistoryRollups();
  }

  // Delay initial run by 30s so startup traffic settles first
  setTimeout(() => {
    void runDailyMaintenance();
    setInterval(() => { void runDailyMaintenance(); }, 24 * 60 * 60_000);
  }, 30_000);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[adlytic] ${signal} received — shutting down…`);
    // Drain in-flight BullMQ jobs first so a deploy never kills a sync mid-flight.
    // When BULLMQ_ENABLED is off this resolves immediately.
    try {
      await shutdownQueueWorkers();
    } catch (err) {
      console.error('[adlytic] queue worker shutdown error:', err);
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err) => {
  console.error('[adlytic:fatal]', err);
  process.exit(1);
});
