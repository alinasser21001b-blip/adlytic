// ════════════════════════════════════════════════════════════════════════
//  scripts/repro/health_matrix.ts — what does GET /api/health say, per DB state?
//
//  Builds the REAL Hono app (buildRoutes) in-process against a matrix of
//  database situations and records, for each: HTTP status, the JSON body, and
//  whether the server wrote ANY log line that names the failure. The point is
//  to answer "can an operator tell these situations apart from outside, and
//  does the endpoint lie?" — both before and after a change.
//
//  Safety: loopback only, databases named adlytic_repro*, synthetic schema only.
//
//  Prepare (once), from a migrated source database adlytic_repro_heal:
//    createdb adlytic_repro_empty
//    createdb -T adlytic_repro_heal adlytic_repro_failedmig   # then insert an unfinished _prisma_migrations row
//    createdb -T adlytic_repro_heal adlytic_repro_behind      # then delete the last two history rows + drop their tables
//  (scripts/repro/health_matrix_prepare.sh does all of it.)
//
//    PGBASE=postgresql://adlytic@127.0.0.1:54329 npx tsx scripts/repro/health_matrix.ts
// ════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
delete process.env['REDIS_URL'];

import { writeFileSync } from 'node:fs';

const base = process.env['PGBASE'] ?? '';
let b: URL;
try { b = new URL(base); } catch { console.error('PGBASE missing/invalid (e.g. postgresql://adlytic@127.0.0.1:54329)'); process.exit(2); }
if (!['127.0.0.1', 'localhost'].includes(b.hostname)) { console.error('REFUSED: PGBASE must be loopback'); process.exit(2); }

interface Case { name: string; host: string; port: number; db: string; user: string; note: string }
const mk = (name: string, db: string, note: string, o: Partial<Case> = {}): Case =>
  ({ name, host: b.hostname, port: Number(b.port) || 5432, db, user: decodeURIComponent(b.username), note, ...o });

const CASES: Case[] = [
  mk('H0_healthy_migrated', 'adlytic_repro_heal', 'control: fully migrated database'),
  mk('H1_port_closed', 'adlytic_repro_heal', 'DB service removed / wrong port', { port: 1 }),
  mk('H2_dns_failure', 'adlytic_repro_heal', 'private-network hostname no longer resolves', { host: 'no-such-host.invalid' }),
  mk('H3_database_missing', 'adlytic_repro_does_not_exist', 'server up, database dropped'),
  mk('H4_role_missing', 'adlytic_repro_heal', 'credentials rotated / role gone', { user: 'nobody_here' }),
  mk('H5_schema_empty', 'adlytic_repro_empty', 'restored/created WITHOUT migrations: app routes will 500'),
  mk('H6_failed_migration_row', 'adlytic_repro_failedmig', '_prisma_migrations holds an unfinished (failed) row'),
  mk('H7_migrations_behind', 'adlytic_repro_behind', 'last two migrations not applied (older snapshot)'),
];

async function main(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('../../src/api/server');

  const results: Record<string, unknown> = {};
  for (const c of CASES) {
    const pool = new pg.Pool({ host: c.host, port: c.port, user: c.user, database: c.db, max: 2, connectionTimeoutMillis: 3000 });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const app = buildRoutes(prisma);

    // Capture everything the process logs while serving the request.
    const logs: string[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    for (const k of ['log', 'warn', 'error', 'info'] as const) (console as any)[k] = (...a: unknown[]) => logs.push(a.map(String).join(' '));
    let status = 0, body: unknown = null;
    try {
      const res = await app.request('/api/health');
      status = res.status; body = await res.json();
    } finally { Object.assign(console, orig); }

    // The raw error shape a classifier would have to work with (no message text kept).
    let errorShape: unknown = null;
    try { await prisma.$queryRaw`SELECT 1`; } catch (e: any) {
      errorShape = { name: e?.name, code: e?.code, adapter: e?.meta?.driverAdapterError?.name, cause: e?.meta?.driverAdapterError?.cause?.kind ?? e?.meta?.driverAdapterError?.cause?.originalCode };
    }

    // Ground truth: would a real app query work?
    let appQueryWorks: boolean | string = 'n/a';
    if (!errorShape) { try { await prisma.user.count(); appQueryWorks = true; } catch (e: any) { appQueryWorks = `NO (${e?.code ?? e?.name})`; } }

    const mentionsFailure = logs.filter((l) => /health|unreachable|db_reason|dbReason|probe/i.test(l) && !/^(<--|-->)/.test(l));
    results[c.name] = { note: c.note, status, body, serverLogLinesNamingTheFailure: mentionsFailure.length, errorShape, appQueryWorks };
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
  const json = JSON.stringify({ generatedBy: 'scripts/repro/health_matrix.ts', cases: results }, null, 2);
  console.log(json);
  if (process.env['REPRO_OUT']) writeFileSync(process.env['REPRO_OUT'], json);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
