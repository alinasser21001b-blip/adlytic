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
import { decryptToken } from '../services/tokenEncryption';
import { runEngines } from '../workers/runEngines';

const PORT = Number(process.env['PORT'] ?? 3001);
// Background sync interval: default 6 hours (can be overridden via env)
const SYNC_INTERVAL_MS = Number(process.env['SYNC_INTERVAL_MS'] ?? 6 * 60 * 60 * 1000);
// Raw insights retention: delete rows older than this many days (default 90)
const RAW_INSIGHTS_RETAIN_DAYS = Number(process.env['RAW_INSIGHTS_RETAIN_DAYS'] ?? 90);
const API_VERSION = process.env['META_API_VERSION'] ?? 'v20.0';

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
  const dbUrl  = process.env['DATABASE_URL'];
  if (!dbUrl) {
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
  });
  const adapter = new PrismaPg(pool);
  const prisma  = new PrismaClient({ adapter });

  // Warn loudly when TOKEN_ENCRYPTION_KEY is absent in non-dev environments.
  // Without this key, Meta access tokens are stored as plaintext in the database.
  if (!process.env['TOKEN_ENCRYPTION_KEY'] || process.env['TOKEN_ENCRYPTION_KEY'].length !== 64) {
    const env = process.env['NODE_ENV'] ?? 'development';
    if (env !== 'development') {
      console.error(
        '[adlytic:SECURITY] TOKEN_ENCRYPTION_KEY is not set or invalid (must be 64 hex chars).\n' +
        '  Meta access tokens would be stored as PLAINTEXT in the database.\n' +
        '  Generate a key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        '  Set TOKEN_ENCRYPTION_KEY in your Railway environment variables.'
      );
      process.exit(1);
    } else {
      console.warn('[adlytic] TOKEN_ENCRYPTION_KEY not set — tokens stored as plaintext (dev mode).');
    }
  }

  // Verify the DB connection is reachable before accepting traffic
  try {
    await prisma.$connect();
  } catch (err) {
    console.warn('[adlytic] Warning: database connection failed — DB-backed routes will error.', err);
  }

  const app = buildRoutes(prisma);

  serve(
    { fetch: app.fetch, port: PORT },
    (info) => {
      console.log(`[adlytic] Server listening on http://localhost:${info.port}`);
      console.log(`[adlytic] Routes mounted: ${ROUTE_COUNT}`);
      console.log(`[adlytic] Health:     GET http://localhost:${info.port}/api/health`);
      console.log(`[adlytic] Dashboard:  GET http://localhost:${info.port}/api/dashboard/:workspaceId`);
      console.log(`[adlytic] Auto-sync:  every ${Math.round(SYNC_INTERVAL_MS / 3600000)}h`);
    }
  );

  // ── Background auto-sync ─────────────────────────────────────────────
  async function syncAllAccounts(): Promise<void> {
    const now = new Date();
    let accounts;
    try {
      accounts = await prisma.adAccount.findMany({
        where: {
          accessTokenEncrypted: { not: null },
          status: 'ACTIVE',
          OR: [
            { tokenExpiresAt: null },
            { tokenExpiresAt: { gt: now } },
          ],
        },
        select: { id: true, externalAccountId: true, accessTokenEncrypted: true },
      });
    } catch (err) {
      console.error('[adlytic:auto-sync] Failed to list accounts:', err);
      return;
    }

    if (accounts.length === 0) return;
    console.log(`[adlytic:auto-sync] Syncing ${accounts.length} account(s)…`);

    for (const acct of accounts) {
      if (!acct.accessTokenEncrypted) continue;
      try {
        const metaClient = new MetaClient({ apiVersion: API_VERSION, accessToken: decryptToken(acct.accessTokenEncrypted) });
        const worker = new SyncAccountWorker(prisma, metaClient);
        const syncResult = await worker.sync(acct.id);
        if (syncResult.ok) {
          await runEngines(prisma, acct.id);
          console.log(`[adlytic:auto-sync] ✓ ${acct.externalAccountId} (${syncResult.rowsUpserted} rows, ${syncResult.durationMs}ms)`);
        } else {
          console.warn(`[adlytic:auto-sync] ✗ ${acct.externalAccountId}: ${syncResult.error}`);
          // Detect expired/invalid OAuth token (Meta error code 190).
          // Mark the account PAUSED so the sync loop skips it until the owner
          // reconnects via the Workspace page.
          if (syncResult.error && /code.*190|190.*code|OAuthException/.test(syncResult.error)) {
            await prisma.adAccount.update({
              where: { id: acct.id },
              data: { status: 'PAUSED', accessTokenEncrypted: null },
            });
            console.warn(`[adlytic:auto-sync] Marked ${acct.externalAccountId} PAUSED — token invalid (190). Owner must reconnect.`);
          }
        }
      } catch (err) {
        console.error(`[adlytic:auto-sync] Error syncing ${acct.externalAccountId}:`, err);
        // Also catch MetaApiError code 190 thrown before SyncResult is produced
        if (err instanceof MetaApiError) {
          const body = err.body as Record<string, any>;
          if (body?.error?.code === 190) {
            await prisma.adAccount.update({
              where: { id: acct.id },
              data: { status: 'PAUSED', accessTokenEncrypted: null },
            });
            console.warn(`[adlytic:auto-sync] Marked ${acct.externalAccountId} PAUSED — token invalid (190). Owner must reconnect.`);
          }
        }
      }
    }
  }

  // Recursive setTimeout so the next sync only starts after the previous one
  // fully completes. setInterval would queue overlapping runs if a sync takes
  // longer than SYNC_INTERVAL_MS (e.g. many accounts, slow Meta API).
  function scheduleSyncLoop(): void {
    setTimeout(async () => {
      await syncAllAccounts();
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

  // Delay initial run by 30s so startup traffic settles first
  setTimeout(() => {
    void pruneRawInsights();
    setInterval(() => { void pruneRawInsights(); }, 24 * 60 * 60_000);
  }, 30_000);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[adlytic] ${signal} received — shutting down…`);
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
