// ════════════════════════════════════════════════════════════════════════
//  src/workers/runWeeklyReportWorker.ts
//
//  Standalone entry point for weekly report generation.
//
//  Recommended invocation: Railway Cron, once per week (e.g. Sunday 06:00 UTC):
//      npx tsx src/workers/runWeeklyReportWorker.ts
//
//  For each workspace that has an ad account, generates a weekly report
//  and stores it in PlatformSetting as JSON for dashboard retrieval.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgSslFor } from '../lib/pgSsl';
import pg from 'pg';
import { generateWeeklyReport } from '../services/weeklyReport';

process.on('unhandledRejection', (reason) => {
  console.error('[weekly-report:unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[weekly-report:uncaughtException]', err);
  process.exit(1);
});

async function main(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('[weekly-report:fatal] DATABASE_URL is not set.');
    process.exit(1);
  }

  const parsed = new URL(dbUrl);
  const sslConfig = pgSslFor(parsed.hostname);
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
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true },
    });

    let generated = 0;
    let skipped = 0;

    for (const ws of workspaces) {
      try {
        const report = await generateWeeklyReport(prisma, ws.id);
        if (!report) {
          skipped++;
          continue;
        }

        await prisma.platformSetting.upsert({
          where: { key: `weekly-report:${ws.id}` },
          create: {
            key: `weekly-report:${ws.id}`,
            value: JSON.stringify(report),
          },
          update: {
            value: JSON.stringify(report),
          },
        });
        generated++;
        console.log(`[weekly-report] ${ws.name}: generated (${report.source})`);
      } catch (err) {
        console.error(`[weekly-report] ${ws.name} failed:`, err);
      }
    }

    console.log(`[weekly-report] done: generated=${generated} skipped=${skipped}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[weekly-report:fatal]', err);
  process.exit(1);
});
