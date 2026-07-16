// ════════════════════════════════════════════════════════════════════════
//  scripts/execution-report.ts  — V1.1.6 Instrumentation (The Mirror)
//
//  Pull-based CLI report. Run with:
//    pnpm execution-report
//
//  Queries RecommendationExecution only. No new tables, no DTOs touched.
// ════════════════════════════════════════════════════════════════════════

import { PrismaPg } from '@prisma/adapter-pg';
import { pgSslFor } from '../src/lib/pgSsl';
import { PrismaClient, UserActionStatus } from '@prisma/client';
import pg from 'pg';

const url  = new URL(process.env['DATABASE_URL']!);
const pool = new pg.Pool({
  host:     url.hostname,
  port:     Number(url.port) || 5432,
  user:     decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl:      pgSslFor(url.hostname),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  const now = new Date();

  // ── Fetch all execution records in one pass ───────────────────────────
  const all = await prisma.recommendationExecution.findMany({
    select: {
      userAction:   true,
      successScore: true,
      evaluatedAt:  true,
      executedAt:   true,
    },
  });

  const total    = all.length;
  const executed = all.filter(r => r.userAction === UserActionStatus.EXECUTED).length;
  const ignored  = all.filter(r => r.userAction === UserActionStatus.IGNORED).length;
  const pending  = all.filter(r => r.userAction === UserActionStatus.PENDING).length;

  const executionRate = total > 0 ? (executed / total) * 100 : 0;
  const ignoreRate    = total > 0 ? (ignored  / total) * 100 : 0;

  // ── Average success score (evaluated records only) ────────────────────
  const scored = all.filter(r => r.successScore !== null).map(r => r.successScore as number);
  const avgSuccessScore = scored.length > 0
    ? scored.reduce((s, v) => s + v, 0) / scored.length
    : null;

  // ── SRE alert: EXECUTED but unevaluated past 7-day window ────────────
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const sreAlert = all.filter(
    r => r.userAction === UserActionStatus.EXECUTED
      && r.evaluatedAt === null
      && r.executedAt !== null
      && r.executedAt < sevenDaysAgo,
  ).length;

  // ── Success score distribution (4 brackets) ───────────────────────────
  const brackets = { 'neg_high': 0, 'neg_low': 0, 'pos_low': 0, 'pos_high': 0 };
  for (const s of scored) {
    if      (s >= -1.0 && s <  -0.5) brackets.neg_high++;
    else if (s >= -0.5 && s <   0.0) brackets.neg_low++;
    else if (s >=  0.0 && s <   0.5) brackets.pos_low++;
    else if (s >=  0.5 && s <=  1.0) brackets.pos_high++;
  }

  // ── Output ────────────────────────────────────────────────────────────
  const div  = '=================================';
  const line = (label: string, value: string) =>
    `  ${label.padEnd(30)} ${value}`;

  console.log('');
  console.log(div);
  console.log('  ADLYTIC EXECUTION REPORT');
  console.log(`  Generated: ${now.toISOString()}`);
  console.log(div);
  console.log('');
  console.log('  VOLUME');
  console.log(line('Total Recommendations',  String(total)));
  console.log('');
  console.log('  STATUS BREAKDOWN');
  console.log(line('Pending',                String(pending)));
  console.log(line('Executed',               String(executed)));
  console.log(line('Ignored',                String(ignored)));
  console.log('');
  console.log('  RATES');
  console.log(line('Execution Rate',         `${executionRate.toFixed(1)}%`));
  console.log(line('Ignore Rate',            `${ignoreRate.toFixed(1)}%`));
  console.log('');
  console.log('  OUTCOMES');
  console.log(line('Evaluated Records',      String(scored.length)));
  console.log(line('Avg Success Score',      avgSuccessScore !== null
    ? avgSuccessScore.toFixed(4)
    : 'n/a (no evaluated records)'));
  console.log('');
  console.log('  SUCCESS SCORE DISTRIBUTION');
  console.log(line('[-1.0 to -0.5]  (bad)',  String(brackets.neg_high)));
  console.log(line('[-0.5 to  0.0]  (weak)', String(brackets.neg_low)));
  console.log(line('[ 0.0 to  0.5]  (good)', String(brackets.pos_low)));
  console.log(line('[ 0.5 to  1.0]  (great)',String(brackets.pos_high)));
  console.log('');
  console.log('  SRE ALERT');
  console.log(line('Overdue Evaluations',
    sreAlert > 0
      ? `${sreAlert} ⚠  (EXECUTED >7d ago, not yet evaluated)`
      : '0  (all clear)'));
  console.log('');
  console.log(div);
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
