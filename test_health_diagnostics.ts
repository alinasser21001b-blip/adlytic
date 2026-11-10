// ═════════════════════════════════════════════════════════════════════════
//  test_health_diagnostics.ts
//
//  GET /api/health must (1) tell different database failures apart, (2) never
//  say "ok" for a database the app cannot use, (3) keep every field existing
//  consumers read, and (4) never leak driver text.
//
//  Reproduced beforehand with scripts/repro/health_matrix.ts against a real
//  local Postgres: four different failures returned the identical 503 and
//  logged nothing; an empty schema returned 200 "ok" while queries failed with
//  P2021. The error shapes used below are the ones that run actually produced.
//
//  No database, Redis or network: the Prisma client is a fake that answers only
//  what the health path asks.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

type Row = Record<string, unknown>;
/** Fake client: `$queryRaw` is a tagged template; route by the SQL text. */
function fakePrisma(o: {
  liveness?: 'ok' | Error;
  rel?: { core: boolean; history: boolean } | Error;
  counts?: { applied: number; failed: number };
  calls?: { n: number };
}) {
  return {
    $queryRaw: async (strings: TemplateStringsArray): Promise<Row[]> => {
      if (o.calls) o.calls.n++;
      const sql = strings.join(' ');
      if (/SELECT\s+1\b/.test(sql) && !/to_regclass/.test(sql)) {
        if (o.liveness instanceof Error) throw o.liveness;
        return [{ '?column?': 1 }];
      }
      if (/to_regclass/.test(sql)) {
        if (o.rel instanceof Error) throw o.rel;
        return [o.rel ?? { core: true, history: true }];
      }
      if (/_prisma_migrations/.test(sql)) return [o.counts ?? { applied: 41, failed: 0 }];
      throw new Error(`unexpected SQL in fake: ${sql.slice(0, 60)}`);
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

async function main() {
  const H = await import('./src/lib/dbHealth');
  const { buildRoutes } = await import('./src/api/server');

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

  // ── 2. expected migrations on disk ───────────────────────────────────
  console.log('\n── 2. expectedMigrationCount ──');
  const tmp = mkdtempSync(path.join(tmpdir(), 'adlytic-mig-'));
  try {
    for (const n of ['20260101000000_a', '20260102000000_b']) { mkdirSync(path.join(tmp, n)); writeFileSync(path.join(tmp, n, 'migration.sql'), '-- x'); }
    mkdirSync(path.join(tmp, '20260103000000_no_sql'));            // directory without migration.sql: not a migration
    writeFileSync(path.join(tmp, 'migration_lock.toml'), 'x');      // file: not a migration
    check('counts only directories that hold migration.sql', H.expectedMigrationCount([tmp]) === 2, H.expectedMigrationCount([tmp]));
    check('unreadable directory → null, not 0', H.expectedMigrationCount([path.join(tmp, 'nope')]) === null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const real = H.expectedMigrationCount();
  check('the real prisma/migrations directory is found and non-empty', typeof real === 'number' && real > 0, real);

  // ── 3. schema probe ──────────────────────────────────────────────────
  console.log('\n── 3. probeSchema ──');
  const P = (p: import('@prisma/client').PrismaClient, expected: number | null = 41) => H.probeSchema(p, { expected, cacheMs: 0 });
  check('core table absent → missing', (await P(fakePrisma({ rel: { core: false, history: false } }))).state === 'missing');
  check('core present, no history table → unknown', (await P(fakePrisma({ rel: { core: true, history: false } }))).state === 'unknown');
  const okS = await P(fakePrisma({ counts: { applied: 41, failed: 0 } }));
  check('all shipped migrations applied → ok (applied/expected reported)', okS.state === 'ok' && okS.applied === 41 && okS.expected === 41, okS);
  const pend = await P(fakePrisma({ counts: { applied: 39, failed: 0 } }));
  check('fewer applied than shipped → pending', pend.state === 'pending' && pend.applied === 39, pend);
  check('an unfinished row → failed (even when the count looks complete)', (await P(fakePrisma({ counts: { applied: 41, failed: 1 } }))).state === 'failed');
  check('shipped count unknown → unknown, never a guess', (await P(fakePrisma({}), null)).state === 'unknown');
  const errS = await P(fakePrisma({ rel: new Error('boom') }));
  check('probe error → unknown (never throws into the route)', errS.state === 'unknown' && errS.applied === null, errS);

  const calls = { n: 0 };
  const cached = fakePrisma({ calls });
  let t = 1_000_000;
  await H.probeSchema(cached, { expected: 41, now: () => t, cacheMs: 30_000 });
  const afterFirst = calls.n;
  await H.probeSchema(cached, { expected: 41, now: () => t + 5_000, cacheMs: 30_000 });
  check('a second probe inside the cache window issues no queries', calls.n === afterFirst, calls.n);
  await H.probeSchema(cached, { expected: 41, now: () => t + 31_000, cacheMs: 30_000 });
  check('after the window it queries again', calls.n > afterFirst, calls.n);

  // ── 4. the route ─────────────────────────────────────────────────────
  console.log('\n── 4. GET /api/health ──');
  const LEGACY = ['status', 'service', 'version', 'timestamp', 'db', 'role', 'runsBackgroundSync', 'bullmq', 'build'];
  const hasLegacy = (b: Record<string, unknown>) => LEGACY.every((k) => k in b);

  async function hit(p: import('@prisma/client').PrismaClient) {
    const app = buildRoutes(p);
    const warn: string[] = [];
    const origWarn = console.warn; console.warn = (...a: unknown[]) => { warn.push(a.map(String).join(' ')); };
    try {
      const res = await app.request('/api/health');
      return { status: res.status, body: await res.json() as Record<string, any>, warn };
    } finally { console.warn = origWarn; }
  }

  H.__resetDbHealthStateForTests();
  const healthy = await hit(fakePrisma({ counts: { applied: H.expectedMigrationCount() ?? 0, failed: 0 } }));
  check('healthy → 200, db ok', healthy.status === 200 && healthy.body['db'] === 'ok' && healthy.body['status'] === 'ok', healthy);
  check('healthy → schema.state ok', healthy.body['schema']?.state === 'ok', healthy.body['schema']);
  check('healthy keeps every legacy field', hasLegacy(healthy.body), Object.keys(healthy.body));
  check('healthy has no dbReason', !('dbReason' in healthy.body));

  H.__resetDbHealthStateForTests();
  const down = await hit(fakePrisma({ liveness: adapterErr('DatabaseNotReachable') }));
  check('db unreachable → 503, status degraded, db unavailable', down.status === 503 && down.body['status'] === 'degraded' && down.body['db'] === 'unavailable', down);
  check('db unreachable → dbReason=unreachable', down.body['dbReason'] === 'unreachable', down.body['dbReason']);
  check('failure body keeps every legacy field', hasLegacy(down.body), Object.keys(down.body));
  const bodyText = JSON.stringify(down.body);
  check('no driver text, host, user or secret in the body', !/svc|S3CR3T|db\.internal|postgresql:|password/i.test(bodyText), bodyText);
  check('exactly one server log line, naming the reason', down.warn.length === 1 && /reason=unreachable/.test(down.warn[0] ?? ''), down.warn);
  check('the log line carries no driver text, host, user or secret', !/svc|S3CR3T|db\.internal|postgresql:|password/i.test(down.warn.join(' ')), down.warn);

  const down2 = await hit(fakePrisma({ liveness: adapterErr('DatabaseNotReachable') }));
  check('repeat failure inside the minute: still 503 + reason, but NO second log line', down2.status === 503 && down2.body['dbReason'] === 'unreachable' && down2.warn.length === 0, down2.warn);

  const auth = await hit(fakePrisma({ liveness: adapterErr('DatabaseAccessDenied') }));
  const gone = await hit(fakePrisma({ liveness: adapterErr('DatabaseDoesNotExist') }));
  check('credentials rejected and database dropped are distinguishable', auth.body['dbReason'] === 'auth' && gone.body['dbReason'] === 'database_missing', [auth.body['dbReason'], gone.body['dbReason']]);

  H.__resetDbHealthStateForTests();
  const empty = await hit(fakePrisma({ rel: { core: false, history: false } }));
  check('reachable database with NO schema → 503 (was a false 200)', empty.status === 503 && empty.body['status'] === 'degraded', empty);
  check('…and it still says db: "ok" (the database IS reachable) with schema.state=missing', empty.body['db'] === 'ok' && empty.body['schema']?.state === 'missing', empty.body);

  H.__resetDbHealthStateForTests();
  const pending = await hit(fakePrisma({ counts: { applied: 1, failed: 0 } }));
  check('pending migrations are REPORTED but do not fail the check', pending.status === 200 && pending.body['schema']?.state === 'pending', pending.body['schema']);
  H.__resetDbHealthStateForTests();
  const failed = await hit(fakePrisma({ counts: { applied: 41, failed: 1 } }));
  check('a failed migration row is REPORTED but does not fail the check', failed.status === 200 && failed.body['schema']?.state === 'failed', failed.body['schema']);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('test_health_diagnostics crashed:', e); process.exit(1); });
