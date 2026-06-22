// ════════════════════════════════════════════════════════════════════════
//  src/workers/runNarrationWorker.ts
//
//  Standalone entry point for the brain narration cron.
//
//  Recommended invocation: external scheduler (Railway Cron) every 10 minutes:
//      npx tsx src/workers/runNarrationWorker.ts
//
//  Each invocation:
//    1. Builds its own Prisma client (driver adapter, same as src/api/serve.ts)
//    2. Calls `runBrainNarrationCron` once (bounded BATCH_LIMIT, sequential)
//    3. Exits with code 0 on success / 1 on catastrophic failure
//
//  No internal infinite loop, no daemon state — clean process per run.
//  This keeps blast radius bounded and makes Railway-side observability simple
//  (one cron entry == one log stream per run).
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { runBrainNarrationCron } from './brainNarrationCron';

// ── Global safety net (same posture as src/api/serve.ts) ──
process.on('unhandledRejection', (reason) => {
  console.error('[narration-cron:unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[narration-cron:uncaughtException]', err);
  process.exit(1);
});

async function main(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('[narration-cron:fatal] DATABASE_URL is not set.');
    process.exit(1);
  }
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('[narration-cron:fatal] ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const parsed = new URL(dbUrl);
  const isInternalHost = parsed.hostname.endsWith('.railway.internal');
  const sslConfig = isInternalHost ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({
    host:     parsed.hostname,
    port:     Number(parsed.port) || 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl:      sslConfig,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await runBrainNarrationCron(prisma);
    if (!result.ok) {
      console.error('[narration-cron] run failed:', result.error);
      process.exit(1);
    }
    console.log(
      `[narration-cron] OK considered=${result.considered} ` +
      `narrated=${result.narrated} sentinels=${result.sentinels} ` +
      `durationMs=${result.durationMs}`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[narration-cron:fatal]', err);
  process.exit(1);
});
