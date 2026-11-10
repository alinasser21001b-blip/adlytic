// ═════════════════════════════════════════════════════════════════════════
//  test_health_diagnostics.ts
//
//  GET /api/health must (1) tell different database failures apart — IN THE
//  SERVER LOG, (2) never say "ok" for a database the app cannot use, (3) keep
//  EXACTLY the public fields verify-live.yml and the platform read, and
//  (4) never leak driver text, in the body or in any log line.
//
//  Reproduced beforehand with scripts/repro/health_matrix.ts against a real
//  local Postgres: four different failures returned the identical 503 and
//  logged nothing; an empty schema returned 200 "ok" while queries failed with
//  P2021. The error shapes used below are the ones that run actually produced.
//
//  Owner decisions applied here: the reason (dbReason) lives in sanitised
//  internal logs only — never in the public JSON; the public body keeps the
//  legacy keys and nothing else. Release readiness (migration identities,
//  required tables) is covered by test_health_migration_gate.ts.
//
//  No database, Redis or network: the Prisma client is a fake that answers only
//  what the health path asks.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

/** The error Prisma 7 + adapter-pg really raises (captured from a live local run). */
const adapterErr = (kind: string, extra: Record<string, unknown> = {}) => Object.assign(
  new Error('Raw query failed. Message: password authentication failed for user "svc" at db.internal:5432 (postgresql://svc:S3CR3T@db.internal:5432/app)'),
  { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { kind, ...extra } } } },
);

/** Fake client: `$queryRaw` is a tagged template; route by the SQL text. A complete, correct database by default. */
function fakePrisma(o: {
  liveness?: Error;
  tables?: string[] | Error;
  history?: Array<{ name: string; finished?: boolean }> | Error;
  calls?: { n: number };
}) {
  const columnRows = (): Array<Record<string, unknown>> => {
    const out: Array<Record<string, unknown>> = [];
    for (const [t, cs] of REQUIRED_COLUMNS ?? []) for (const c of cs) out.push({ t, c });
    return out;
  };
  return {
    $queryRaw: async (strings: TemplateStringsArray): Promise<Array<Record<string, unknown>>> => {
      if (o.calls) o.calls.n++;
      const sql = strings.join(' ');
      if (/pg_tables/.test(sql)) {
        if (o.tables instanceof Error) throw o.tables;
        return (o.tables ?? [...SCHEMA_TABLES, '_prisma_migrations']).map((name) => ({ name }));
      }
      if (/pg_attribute/.test(sql)) return columnRows();   // a database that has every column the client selects
      if (/migration_name/.test(sql)) {
        if (o.history instanceof Error) throw o.history;
        return (o.history ?? SHIPPED.map((name): { name: string; finished?: boolean } => ({ name }))).map((r) => ({ name: r.name, finished: r.finished !== false }));
      }
      if (/SELECT\s+1\b/.test(sql)) {
        if (o.liveness instanceof Error) throw o.liveness;
        return [{ '?column?': 1 }];
      }
      throw new Error(`unexpected SQL in fake: ${sql.slice(0, 60)}`);
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

/** What this build ships and what its schema needs — read from disk without the module under test. */
const MIG_DIR = path.join(__dirname, 'prisma', 'migrations');
const SHIPPED = readdirSync(MIG_DIR).filter((n) => statSync(path.join(MIG_DIR, n)).isDirectory() && existsSync(path.join(MIG_DIR, n, 'migration.sql'))).sort();
/** Columns this build's client selects, table → columns (set once the module under test is loaded; only the "healthy database" default uses it). */
let REQUIRED_COLUMNS: Map<string, string[]> | null = null;
const SCHEMA_TABLES: string[] = [];
{
  let model: string | null = null; let mapped: string | null = null;
  for (const line of readFileSync(path.join(__dirname, 'prisma', 'schema.prisma'), 'utf8').split('\n')) {
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) { model = m[1]!; mapped = null; continue; }
    if (model) { const mm = /@@map\("([^"]+)"\)/.exec(line); if (mm) mapped = mm[1]!; if (/^\}/.test(line)) { SCHEMA_TABLES.push(mapped ?? model); model = null; } }
  }
}

async function main() {
  const H = await import('./src/lib/dbHealth');
  const { buildRoutes } = await import('./src/api/server');
  REQUIRED_COLUMNS = H.requiredColumnNames();

  // ── 1. classifier ────────────────────────────────────────────────────
  console.log('\n── 1. classifyDbError: structure, never message text ──');
  const C = H.classifyDbError;
  check('adapter DatabaseNotReachable → unreachable', C(adapterErr('DatabaseNotReachable')) === 'unreachable');
  check('adapter DatabaseDoesNotExist → database_missing', C(adapterErr('DatabaseDoesNotExist')) === 'database_missing');
  check('adapter DatabaseAccessDenied → auth', C(adapterErr('DatabaseAccessDenied')) === 'auth');
  check('adapter TlsConnectionError → tls', C(adapterErr('TlsConnectionError')) === 'tls');
  check('adapter SocketTimeout → timeout', C(adapterErr('SocketTimeout')) === 'timeout');
  check('adapter kind outranks the generic prisma code', C(adapterErr('DatabaseDoesNotExist')) !== 'unknown');
  check('prisma P1001 → unreachable', C({ code: 'P1001' }) === 'unreachable');
  check('prisma P1000 → auth', C({ code: 'P1000' }) === 'auth');
  check('node ECONNREFUSED → unreachable', C({ code: 'ECONNREFUSED' }) === 'unreachable');
  check('node ENOTFOUND (DNS) → unreachable', C({ code: 'ENOTFOUND' }) === 'unreachable');
  check('nested cause ETIMEDOUT → timeout', C({ cause: { code: 'ETIMEDOUT' } }) === 'timeout');
  check('pg SQLSTATE 28P01 → auth', C({ code: '28P01' }) === 'auth');
  check('adapter originalCode 3D000 → database_missing', C(adapterErr('Other', { originalCode: '3D000' })) === 'database_missing');
  check('message text alone is NOT trusted → unknown', C(new Error('password authentication failed')) === 'unknown');
  check('null / string / number → unknown', C(null) === 'unknown' && C('boom') === 'unknown' && C(42) === 'unknown');

  // ── 2. shipped migration identities on disk ──────────────────────────
  console.log('\n── 2. shippedMigrationNames ──');
  try {
    const tmp = mkdtempSync(path.join(tmpdir(), 'adlytic-mig-'));
    try {
      for (const n of ['20260101000000_a', '20260102000000_b']) { mkdirSync(path.join(tmp, n)); writeFileSync(path.join(tmp, n, 'migration.sql'), '-- x'); }
      mkdirSync(path.join(tmp, '20260103000000_no_sql'));            // directory without migration.sql: not a migration
      writeFileSync(path.join(tmp, 'migration_lock.toml'), 'x');      // file: not a migration
      const names = H.shippedMigrationNames([tmp]);
      check('returns the NAMES of directories that hold migration.sql — not a count', JSON.stringify([...(names ?? [])].sort()) === JSON.stringify(['20260101000000_a', '20260102000000_b']), names);
      check('unreadable directory → null, not an empty list', H.shippedMigrationNames([path.join(tmp, 'nope')]) === null);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    const real = H.shippedMigrationNames();
    check('the real prisma/migrations directory is found and matches what is on disk', JSON.stringify([...(real ?? [])].sort()) === JSON.stringify(SHIPPED) && SHIPPED.length > 0, real?.length);
  } catch (e) { fail++; console.log(`  ✗ shippedMigrationNames — threw: ${(e as Error).message}`); }

  // ── 3. the route ─────────────────────────────────────────────────────
  console.log('\n── 3. GET /api/health ──');
  const LEGACY = ['status', 'service', 'version', 'timestamp', 'db', 'role', 'runsBackgroundSync', 'bullmq', 'build'];
  const exactLegacy = (b: Record<string, unknown>) => JSON.stringify(Object.keys(b)) === JSON.stringify(LEGACY);

  async function hit(p: import('@prisma/client').PrismaClient) {
    const app = buildRoutes(p);
    const warn: string[] = [];
    const origWarn = console.warn; console.warn = (...a: unknown[]) => { warn.push(a.map(String).join(' ')); };
    try {
      const res = await app.request('/api/health');
      return { status: res.status, body: await res.json() as Record<string, any>, warn };
    } finally { console.warn = origWarn; }
  }
  const LEAK = /svc|S3CR3T|db\.internal|postgresql:|password/i;

  H.__resetDbHealthStateForTests();
  const healthy = await hit(fakePrisma({}));
  check('healthy → 200, db ok, status ok', healthy.status === 200 && healthy.body['db'] === 'ok' && healthy.body['status'] === 'ok', healthy);
  check('healthy → public keys are EXACTLY the legacy ones, in order', exactLegacy(healthy.body), Object.keys(healthy.body));
  check('healthy → no schema block, no dbReason in the body', !('schema' in healthy.body) && !('dbReason' in healthy.body));
  check('healthy → nothing logged', healthy.warn.length === 0, healthy.warn);

  H.__resetDbHealthStateForTests();
  const down = await hit(fakePrisma({ liveness: adapterErr('DatabaseNotReachable') }));
  check('db unreachable → 503, status degraded, db unavailable', down.status === 503 && down.body['status'] === 'degraded' && down.body['db'] === 'unavailable', down);
  check('db unreachable → public keys are EXACTLY the legacy ones (no dbReason)', exactLegacy(down.body), Object.keys(down.body));
  const bodyText = JSON.stringify(down.body);
  check('no driver text, host, user or secret in the body', !LEAK.test(bodyText), bodyText);
  check('exactly one server log line, naming the reason', down.warn.length === 1 && /reason=unreachable/.test(down.warn[0] ?? ''), down.warn);
  check('the log line carries no driver text, host, user or secret', !LEAK.test(down.warn.join(' ')), down.warn);

  const down2 = await hit(fakePrisma({ liveness: adapterErr('DatabaseNotReachable') }));
  check('repeat failure inside the minute: still 503, but NO second log line', down2.status === 503 && down2.warn.length === 0, down2.warn);

  // The reasons the body used to carry are now readable from the log, one per distinguishable cause.
  const reasons: Array<[string, Error, string]> = [
    ['credentials rejected', adapterErr('DatabaseAccessDenied'), 'auth'],
    ['database dropped', adapterErr('DatabaseDoesNotExist'), 'database_missing'],
    ['TLS failure', adapterErr('TlsConnectionError'), 'tls'],
    ['timeout', adapterErr('SocketTimeout'), 'timeout'],
    ['unclassifiable', new Error('boom'), 'unknown'],
  ];
  H.__resetDbHealthStateForTests();
  for (const [label, err, reason] of reasons) {
    const r = await hit(fakePrisma({ liveness: err }));
    check(`${label} → 503, log says reason=${reason}, body carries none of it`, r.status === 503 && r.warn.length === 1 && new RegExp(`reason=${reason}\\b`).test(r.warn[0] ?? '') && exactLegacy(r.body) && !LEAK.test(r.warn.join(' ') + JSON.stringify(r.body)), { warn: r.warn, keys: Object.keys(r.body) });
  }

  H.__resetDbHealthStateForTests();
  const empty = await hit(fakePrisma({ tables: [], history: [] }));
  check('reachable database with NO schema → 503 (was a false 200), db STILL ok', empty.status === 503 && empty.body['status'] === 'degraded' && empty.body['db'] === 'ok', empty);
  check('…public keys exactly the legacy ones; the detail is in the log only', exactLegacy(empty.body) && empty.warn.length === 1 && /state=missing/.test(empty.warn[0] ?? ''), { keys: Object.keys(empty.body), warn: empty.warn });

  H.__resetDbHealthStateForTests();
  const pending = await hit(fakePrisma({ history: SHIPPED.slice(0, 1).map((name) => ({ name })) }));
  check('pending migrations now FAIL the check (503, db ok) — readiness is gated, see test_health_migration_gate.ts', pending.status === 503 && pending.body['db'] === 'ok' && /state=pending/.test(pending.warn[0] ?? ''), pending);
  H.__resetDbHealthStateForTests();
  const failed = await hit(fakePrisma({ history: [...SHIPPED.map((name) => ({ name })), { name: '29990101000000_half', finished: false }] }));
  check('a failed migration row now FAILS the check (503, db ok)', failed.status === 503 && failed.body['db'] === 'ok' && /state=failed/.test(failed.warn[0] ?? ''), failed);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('test_health_diagnostics crashed:', e); process.exit(1); });
