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
//    createdb -T adlytic_repro_heal adlytic_repro_wronghist   # then rename ONE history row to a bogus identity (count stays equal)
//    createdb -T adlytic_repro_heal adlytic_repro_ahead       # then add one extra applied row with a future identity
//  (scripts/repro/health_matrix_prepare.sh does all of it.)
//
//    PGBASE=postgresql://adlytic@127.0.0.1:54329 REPRO_OUT=/path/out.json npx tsx scripts/repro/health_matrix.ts
//
//  Per case it records the HTTP status, the exact public body (and its key
//  list), and every `[adlytic:health]` log line the server wrote. The
//  rate-limit memory is reset between cases so that a later case is not
//  silenced by an earlier one with the same reason.
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

// Databases are <prefix>_empty|failedmig|behind|wronghist|ahead (see health_matrix_prepare.sh). The migrated
// source is adlytic_repro_heal and is only read. Prefix must start with adlytic_repro.
const PFX = process.env['REPRO_DB_PREFIX'] ?? 'adlytic_repro';
const SRC = process.env['REPRO_SRC_DB'] ?? 'adlytic_repro_heal';

interface Case { name: string; host: string; port: number; db: string; user: string; note: string }
const mk = (name: string, db: string, note: string, o: Partial<Case> = {}): Case =>
  ({ name, host: b.hostname, port: Number(b.port) || 5432, db, user: decodeURIComponent(b.username), note, ...o });

const CASES: Case[] = [
  mk('H0_healthy_migrated', SRC, 'control: fully migrated database'),
  mk('H1_port_closed', SRC, 'DB service removed / wrong port', { port: 1 }),
  mk('H2_dns_failure', SRC, 'private-network hostname no longer resolves', { host: 'no-such-host.invalid' }),
  mk('H3_database_missing', 'adlytic_repro_does_not_exist', 'server up, database dropped'),
  mk('H4_role_missing', SRC, 'credentials rotated / role gone', { user: 'nobody_here' }),
  mk('H5_schema_empty', `${PFX}_empty`, 'restored/created WITHOUT migrations: app routes will 500'),
  mk('H6_failed_migration_row', `${PFX}_failedmig`, '_prisma_migrations holds an unfinished (failed) row'),
  mk('H7_migrations_behind', `${PFX}_behind`, 'last two migrations not applied (older snapshot)'),
  mk('H8_equal_count_wrong_history', `${PFX}_wronghist`, '41 applied / 41 shipped, none failed, all tables present - but one applied identity is not shipped'),
  mk('H9_ahead', `${PFX}_ahead`, 'every shipped identity applied plus one extra (older build against a newer database)'),
];
for (const c of CASES) if (!/^adlytic_repro/.test(c.db)) { console.error(`REFUSED: ${c.db} is not an adlytic_repro* database`); process.exit(2); }

async function main(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('../../src/api/server');
  const { __resetDbHealthStateForTests } = await import('../../src/lib/dbHealth');

  const results: Record<string, unknown> = {};
  for (const c of CASES) {
    __resetDbHealthStateForTests();
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
    const bodyKeys = body && typeof body === 'object' ? Object.keys(body as object) : [];
    results[c.name] = {
      note: c.note, status, body, bodyKeys,
      serverLogLinesNamingTheFailure: mentionsFailure.length,
      serverLogLines: mentionsFailure,
      errorShape, appQueryWorks,
    };
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
  const json = JSON.stringify({ generatedBy: 'scripts/repro/health_matrix.ts', cases: results }, null, 2);
  console.log(json);
  if (process.env['REPRO_OUT']) writeFileSync(process.env['REPRO_OUT'], json);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
