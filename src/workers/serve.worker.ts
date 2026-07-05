// ════════════════════════════════════════════════════════════════════════
//  src/workers/serve.worker.ts
//
//  Dedicated background-worker entrypoint. Run with:
//    node dist/src/workers/serve.worker.js      (prod, via `npm run start:worker`)
//    npm run start:worker:dev                   (local)
//
//  This process does NOT serve HTTP. It owns all Meta ETL: the auto-sync loop,
//  daily maintenance, and — when BULLMQ_ENABLED=true — draining the BullMQ
//  queues that the API enqueues into (manual /sync, webhook reconciles, …).
//
//  Deploy alongside the API service (SERVICE_ROLE=api) so the API event loop
//  is never blocked by a long sync and a deploy of one service can't kill an
//  in-flight sync running in the other.
//
//  The DB pool construction below intentionally MIRRORS src/api/serve.ts so the
//  two entrypoints connect identically (same SSL rules, same pool sizing).
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config, reportConfig } from '../config';
import { startBackgroundWork, cleanupOrphanedSyncJobs } from './backgroundScheduler';
import { shutdownQueueWorkers } from './queue';

// ── Global safety net: log unhandled rejections/exceptions instead of crashing ──
process.on('unhandledRejection', (reason) => {
  console.error('[adlytic:worker:unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[adlytic:worker:uncaughtException]', err);
  process.exit(1);
});

async function main(): Promise<void> {
  reportConfig();

  const dbUrl = config.database.url;
  if (!dbUrl) {
    console.error('[adlytic:worker:fatal] DATABASE_URL is not set. Run with --env-file=.env or set the variable in the environment.');
    process.exit(1);
  }
  const parsed = new URL(dbUrl);
  // SSL: require for external hosts (Railway proxy, Supabase, etc.); skip for
  // Railway's private internal network (*.railway.internal). Mirrors serve.ts.
  const isInternalHost = parsed.hostname.endsWith('.railway.internal');
  const sslConfig = isInternalHost ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: sslConfig,
    max: Number(process.env['PG_POOL_MAX'] ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
  } catch (err) {
    console.warn('[adlytic:worker] Warning: database connection failed — sync will error until DB is reachable.', err);
  }

  // Clear zombie SyncJobs left by a prior crash/deploy so new syncs aren't
  // blocked by the "reuse active job" guard.
  await cleanupOrphanedSyncJobs(prisma);

  const intervalMs = config.sync.intervalMs;
  const cadence = intervalMs >= 3600000
    ? `${Math.round(intervalMs / 3600000)}h`
    : `${Math.round(intervalMs / 60000)}m`;
  console.log('[adlytic:worker] Background worker started (no HTTP server)');
  console.log(`[adlytic:worker] Auto-sync: every ${cadence}`);
  console.log(`[adlytic:worker] BullMQ: ${config.features.bullmqEnabled ? 'enabled — draining queues' : 'disabled — auto-sync loop only'}`);

  startBackgroundWork(prisma);

  // Graceful shutdown — drain in-flight BullMQ jobs first so a deploy never
  // kills a sync mid-flight.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[adlytic:worker] ${signal} received — shutting down…`);
    try {
      await shutdownQueueWorkers();
    } catch (err) {
      console.error('[adlytic:worker] queue worker shutdown error:', err);
    }
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err) => {
  console.error('[adlytic:worker:fatal]', err);
  process.exit(1);
});
