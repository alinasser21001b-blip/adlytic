// ════════════════════════════════════════════════════════════════════════
//  scripts/evaluate-pending-executions.ts  — V1.1.5 Outcome Memory
//
//  Nightly Railway cron script.
//  Finds EXECUTED executions whose 7-day evaluation window has elapsed
//  and have not yet been scored, then evaluates each one.
//
//  Run via Railway Cron (nightly at 02:00 UTC):
//    npx tsx scripts/evaluate-pending-executions.ts
//
//  Node exits naturally after the finally block. Non-zero exit code on error.
// ════════════════════════════════════════════════════════════════════════

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserActionStatus } from '@prisma/client';
import pg from 'pg';
import { ExecutionService } from '../src/services/execution.service';

const url  = new URL(process.env['DATABASE_URL']!);
const pool = new pg.Pool({
  host:     url.hostname,
  port:     Number(url.port) || 5432,
  user:     decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl:      url.hostname.endsWith('.railway.internal') ? false : { rejectUnauthorized: false },
});

const prisma  = new PrismaClient({ adapter: new PrismaPg(pool) });
const service = new ExecutionService(prisma);

async function main(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const pending = await prisma.recommendationExecution.findMany({
    where: {
      userAction:       UserActionStatus.EXECUTED,
      evaluatedAt:      null,
      executedAt:       { lte: sevenDaysAgo },
    },
    select: { id: true, recommendationId: true },
  });

  console.log(`[evaluate-pending-executions] Found ${pending.length} execution(s) ready for evaluation.`);

  let evaluated = 0;
  let failed    = 0;

  for (const execution of pending) {
    try {
      const result = await service.evaluateOutcome(execution.id);
      console.log(`[evaluate] ${execution.id} → successScore=${result.successScore ?? 'null'}`);
      evaluated++;
    } catch (err) {
      console.error(`[evaluate] FAILED ${execution.id}:`, err);
      failed++;
    }
  }

  console.log(`[evaluate-pending-executions] Done. evaluated=${evaluated} failed=${failed}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
