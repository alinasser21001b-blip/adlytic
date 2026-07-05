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
import { getMetaOAuthConfigStatus } from '../services/metaOAuth';
import { config, reportConfig } from '../config';
import { shutdownQueueWorkers } from '../workers/queue';
import { startBackgroundWork, cleanupOrphanedSyncJobs } from '../workers/backgroundScheduler';

const PORT = config.port;
// Auto-sync tick (used only for the boot log; the loop itself lives in
// backgroundScheduler and runs when this process is 'combined' role).
const SYNC_INTERVAL_MS = config.sync.intervalMs;

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

  // Clean up zombie SyncJobs left by a prior crash/deploy so new sync
  // requests aren't blocked by the "reuse active job" logic.
  await cleanupOrphanedSyncJobs(prisma);

  const app = buildRoutes(prisma);

  serve(
    { fetch: app.fetch, port: PORT },
    (info) => {
      console.log(`[adlytic] Server listening on http://localhost:${info.port}`);
      console.log(`[adlytic] Routes mounted: ${ROUTE_COUNT}`);
      console.log(`[adlytic] Health:     GET http://localhost:${info.port}/api/health`);
      console.log(`[adlytic] Dashboard:  GET http://localhost:${info.port}/api/dashboard/:workspaceId`);
      console.log(`[adlytic] Auto-sync:  ${
        config.role === 'combined'
          ? `every ${SYNC_INTERVAL_MS >= 3600000 ? `${Math.round(SYNC_INTERVAL_MS / 3600000)}h` : `${Math.round(SYNC_INTERVAL_MS / 60000)}m`} (in-process)`
          : 'delegated to worker service (SERVICE_ROLE=api)'
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

  // ── Background work ──────────────────────────────────────────────────
  // In 'combined' role (the default) this process ALSO runs the auto-sync
  // loop, daily maintenance, and BullMQ workers — identical to the previous
  // single-service deploy. In 'api' role a dedicated worker service
  // (src/workers/serve.worker.ts) owns all of that, so the API event loop is
  // never blocked by Meta ETL. The logic itself lives in backgroundScheduler.
  if (config.role === 'combined') {
    startBackgroundWork(prisma);
  } else {
    console.log('[adlytic] SERVICE_ROLE=api — background sync/queues run in the worker service');
  }

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
