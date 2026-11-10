// ═════════════════════════════════════════════════════════════════════════
//  test_health_migration_gate.ts
//
//  GET /api/health is the platform's healthcheck. Release readiness is decided
//  by the IDENTITY of every migration this build ships and the presence of
//  every table of the Prisma schema — never by comparing two counts.
//
//  The case that makes a count comparison unsafe: 41 migrations ship, 41 are
//  recorded as applied, none failed — but one applied name is not one this
//  build ships (a squashed/renamed/foreign history). applied >= shipped, so
//  the count says "ok"; the database is not the one this code was written for.
//  Reproduced on a real Postgres by scripts/repro/health_matrix.ts (H8).
//
//  States and verdicts (READY = ok | ahead; everything else is 503):
//     ok        every shipped identity applied, nothing else
//     ahead     every shipped identity applied + extras (an older build running
//               against a newer database — tolerated)
//     pending   some shipped identity not applied, no extras
//     diverged  some shipped identity not applied AND extras present
//               (includes equal-count wrong histories)
//     failed    any unfinished, not-rolled-back history row
//     missing   a table of the Prisma schema is absent
//     unknown   shipped list unreadable / history table absent / probe errored
//
//  No database, Redis or network: the Prisma client is a fake that answers only
//  what the health path asks. The SQL itself is exercised against a real
//  Postgres by scripts/repro/health_matrix.ts.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}
/** A throw inside a unit case is ONE failed assertion (e.g. "export does not exist"), not a crash of the file. */
async function unit(name: string, fn: () => Promise<void>) {
  try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name} — threw: ${(e as Error).message}`); }
}

// ── ground truth, read WITHOUT the module under test ──────────────────────
const ROOT = __dirname;
const MIG_DIR = path.join(ROOT, 'prisma', 'migrations');
const SHIPPED: string[] = readdirSync(MIG_DIR)
  .filter((n) => statSync(path.join(MIG_DIR, n)).isDirectory() && existsSync(path.join(MIG_DIR, n, 'migration.sql')))
  .sort();

/** Table of every `model` in schema.prisma: its @@map, else the model name. */
function tablesFromSchemaFile(): string[] {
  const out: string[] = [];
  let model: string | null = null;
  let mapped: string | null = null;
  for (const line of readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8').split('\n')) {
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) { model = m[1]!; mapped = null; continue; }
    if (model) {
      const mm = /@@map\("([^"]+)"\)/.exec(line);
      if (mm) mapped = mm[1]!;
      if (/^\}/.test(line)) { out.push(mapped ?? model); model = null; }
    }
  }
  return out.sort();
}
const REQUIRED = tablesFromSchemaFile();

// ── fake database ─────────────────────────────────────────────────────────
interface Hist { name: string; finished?: boolean; rolledBack?: boolean }
interface Db {
  liveness?: Error;
  tables?: string[] | Error;
  history?: Hist[] | Error;
  calls?: { n: number; sql: string[] };
}
const healthyDb = (): Db => ({
  tables: [...REQUIRED, '_prisma_migrations'],
  history: SHIPPED.map((name) => ({ name })),
});

/** `$queryRaw` is a tagged template; the fake routes by SQL text and re-reads `db` on every call. */
function fakePrisma(db: Db) {
  return {
    $queryRaw: async (strings: TemplateStringsArray): Promise<Array<Record<string, unknown>>> => {
      const sql = strings.join(' ');
      if (db.calls) { db.calls.n++; db.calls.sql.push(sql); }
      const hist = () => { if (db.history instanceof Error) throw db.history; return db.history ?? []; };
      const tabs = () => { if (db.tables instanceof Error) throw db.tables; return db.tables ?? []; };
      if (/to_regclass/.test(sql)) {                       // the previous, count-based probe
        const t = tabs();
        return [{ core: t.includes('users'), history: t.includes('_prisma_migrations') }];
      }
      if (/count\(\*\)/.test(sql)) {                        // the previous, count-based probe
        const h = hist().filter((r) => !r.rolledBack);
        return [{ applied: h.filter((r) => r.finished !== false).length, failed: h.filter((r) => r.finished === false).length }];
      }
      if (/pg_tables/.test(sql)) return tabs().map((name) => ({ name }));
      if (/migration_name/.test(sql)) return hist().filter((r) => !r.rolledBack).map((r) => ({ name: r.name, finished: r.finished !== false }));
      if (/SELECT\s+1\b/.test(sql)) { if (db.liveness) throw db.liveness; return [{ '?column?': 1 }]; }
      throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

/** Same shape the Prisma 7 adapter really raises; the message deliberately carries host, user, secret, SQL. */
const SECRET_TEXT = 'password authentication failed for user "svc" at db.internal:5432 (postgresql://svc:S3CR3T@db.internal:5432/app) while running SELECT migration_name FROM public._prisma_migrations';
const adapterErr = (kind: string) => Object.assign(new Error(`Raw query failed. Message: ${SECRET_TEXT}`), {
  name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { kind } } },
});
const LEAK = /svc|S3CR3T|db\.internal|postgresql:|password|5432|SELECT|FROM public/i;

type Resp = { status: number; body: Record<string, any>; logs: string[] };
let H: typeof import('./src/lib/dbHealth');
let buildRoutes: typeof import('./src/api/server').buildRoutes;

async function hit(p: import('@prisma/client').PrismaClient): Promise<Resp> {
  const app = buildRoutes(p);
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of ['log', 'warn', 'error', 'info'] as const) (console as any)[k] = (...a: unknown[]) => logs.push(a.map(String).join(' '));
  try {
    const res = await app.request('/api/health');
    return { status: res.status, body: await res.json() as Record<string, any>, logs: logs.filter((l) => !/^(<--|-->)/.test(l)) };
  } finally { Object.assign(console, orig); }
}
const fresh = () => { H.__resetDbHealthStateForTests(); };

async function main() {
  H = await import('./src/lib/dbHealth');
  buildRoutes = (await import('./src/api/server')).buildRoutes;

  // ── 0. ground truth ───────────────────────────────────────────────────
  console.log('\n── 0. ground truth (read without the module under test) ──');
  check('this build ships migrations', SHIPPED.length > 30, SHIPPED.length);
  check('the Prisma schema has models and every model has a table name', REQUIRED.length > 30 && REQUIRED.every((t) => /^\w+$/.test(t)), REQUIRED.length);

  // ── 1. identities and required tables, as the module derives them ─────
  console.log('\n── 1. shipped identities + required tables ──');
  await unit('shippedMigrationNames', async () => {
    const names = H.shippedMigrationNames();
    check('shippedMigrationNames() returns the NAMES of the migration directories', JSON.stringify([...(names ?? [])].sort()) === JSON.stringify(SHIPPED), names?.length);
    check('an unreadable directory → null, not an empty list', H.shippedMigrationNames([path.join(ROOT, 'no-such-dir')]) === null);
  });
  await unit('requiredTableNames', async () => {
    const tables = H.requiredTableNames();
    check('requiredTableNames() (from the generated client) equals the tables parsed from prisma/schema.prisma', JSON.stringify([...(tables ?? [])].sort()) === JSON.stringify(REQUIRED), { got: tables?.length, want: REQUIRED.length });
    check('…and does not include the migration history table (it is not a model)', !(tables ?? []).includes('_prisma_migrations'));
  });

  // ── 2. the route, one case per state ──────────────────────────────────
  console.log('\n── 2. GET /api/health per history state ──');
  const LEGACY = ['status', 'service', 'version', 'timestamp', 'db', 'role', 'runsBackgroundSync', 'bullmq', 'build'];

  fresh();
  const ok = await hit(fakePrisma(healthyDb()));
  check('ok: every shipped identity applied → 200, status ok, db ok', ok.status === 200 && ok.body['status'] === 'ok' && ok.body['db'] === 'ok', ok);
  check('ok: nothing is logged', ok.logs.length === 0, ok.logs);

  fresh();
  const aheadDb = healthyDb(); aheadDb.history = [...(aheadDb.history as Hist[]), { name: '29990101000000_from_a_newer_release' }];
  const ahead = await hit(fakePrisma(aheadDb));
  check('ahead: extra applied identity (rolled-back release on a newer database) is TOLERATED → 200', ahead.status === 200 && ahead.body['status'] === 'ok' && ahead.body['db'] === 'ok', ahead);
  check('ahead: nothing is logged', ahead.logs.length === 0, ahead.logs);

  fresh();
  const pendDb = healthyDb(); pendDb.history = (pendDb.history as Hist[]).slice(0, -1);
  const pend = await hit(fakePrisma(pendDb));
  const lastName = SHIPPED[SHIPPED.length - 1]!;
  check('pending (one shipped identity missing) → 503, status degraded, db STILL ok (the database is reachable)', pend.status === 503 && pend.body['status'] === 'degraded' && pend.body['db'] === 'ok', pend);
  check('pending: the log names the state and the missing identity', pend.logs.length === 1 && /state=pending/.test(pend.logs[0] ?? '') && (pend.logs[0] ?? '').includes(lastName), pend.logs);
  check('pending: the log carries applied/shipped counts', new RegExp(`applied=${SHIPPED.length - 1} shipped=${SHIPPED.length}\\b`).test(pend.logs[0] ?? ''), pend.logs);

  fresh();
  const pend3Db = healthyDb(); pend3Db.history = (pend3Db.history as Hist[]).slice(0, -3);
  const pend3 = await hit(fakePrisma(pend3Db));
  check('pending by several → 503', pend3.status === 503 && pend3.body['db'] === 'ok', pend3);
  check('pending by several: all three missing identities are named', SHIPPED.slice(-3).every((n) => (pend3.logs[0] ?? '').includes(n)), pend3.logs);

  fresh();
  const failDb = healthyDb(); failDb.history = [...(failDb.history as Hist[]), { name: '29990101000000_half_applied', finished: false }];
  const failed = await hit(fakePrisma(failDb));
  check('failed row, EVERY shipped identity applied → 503 (an unfinished row is never ok)', failed.status === 503 && failed.body['status'] === 'degraded' && failed.body['db'] === 'ok', failed);
  check('failed: the log says state=failed and names the row', /state=failed/.test(failed.logs[0] ?? '') && (failed.logs[0] ?? '').includes('29990101000000_half_applied'), failed.logs);

  fresh();
  const rbDb = healthyDb(); rbDb.history = [...(rbDb.history as Hist[]), { name: '29990101000000_was_retried', finished: false, rolledBack: true }];
  const rolled = await hit(fakePrisma(rbDb));
  check('a failed row that was resolved --rolled-back is ignored → 200', rolled.status === 200, rolled);

  // ── the case a count comparison cannot see ───────────────────────────
  fresh();
  const wrongDb = healthyDb();
  const renamed = SHIPPED[SHIPPED.length - 2]!;
  wrongDb.history = (wrongDb.history as Hist[]).map((r) => r.name === renamed ? { name: '29990101000000_bogus_identity' } : r);
  const appliedCount = (wrongDb.history as Hist[]).filter((r) => r.finished !== false && !r.rolledBack).length;
  check('EQUAL-COUNT precondition: applied.length === shipped.length, so a COUNT comparison would have said ok', appliedCount === SHIPPED.length, { appliedCount, shipped: SHIPPED.length });
  check('EQUAL-COUNT precondition: no unfinished row and every table present', (wrongDb.history as Hist[]).every((r) => r.finished !== false) && REQUIRED.every((t) => (wrongDb.tables as string[]).includes(t)));
  const wrong = await hit(fakePrisma(wrongDb));
  check('EQUAL-COUNT WRONG HISTORY → 503, status degraded, db ok', wrong.status === 503 && wrong.body['status'] === 'degraded' && wrong.body['db'] === 'ok', wrong);
  check('EQUAL-COUNT WRONG HISTORY → logged as state=diverged', /state=diverged/.test(wrong.logs[0] ?? ''), wrong.logs);
  check('…naming BOTH the shipped identity that is missing and the applied one nobody ships', (wrong.logs[0] ?? '').includes(renamed) && (wrong.logs[0] ?? '').includes('29990101000000_bogus_identity'), wrong.logs);
  check('…and the counts are equal in the line (that is the point)', new RegExp(`applied=${SHIPPED.length} shipped=${SHIPPED.length}\\b`).test(wrong.logs[0] ?? ''), wrong.logs);

  fresh();
  const noTableDb = healthyDb(); noTableDb.tables = (noTableDb.tables as string[]).filter((t) => t !== 'period_insights');
  const noTable = await hit(fakePrisma(noTableDb));
  check('a table of the schema is absent while the history looks complete → 503, db ok', noTable.status === 503 && noTable.body['status'] === 'degraded' && noTable.body['db'] === 'ok', noTable);
  check('missing table: state=missing and the table is named', /state=missing/.test(noTable.logs[0] ?? '') && (noTable.logs[0] ?? '').includes('period_insights'), noTable.logs);

  fresh();
  const noHistDb = healthyDb(); noHistDb.tables = (noHistDb.tables as string[]).filter((t) => t !== '_prisma_migrations');
  const noHist = await hit(fakePrisma(noHistDb));
  check('every table present but NO history table → 503 (unknown: nothing proves the schema belongs to this build)', noHist.status === 503 && noHist.body['db'] === 'ok', noHist);
  check('history table absent: state=unknown with its reason', /state=unknown/.test(noHist.logs[0] ?? '') && /history_absent/.test(noHist.logs[0] ?? ''), noHist.logs);

  fresh();
  const emptyDb: Db = { tables: [], history: [] };
  const empty = await hit(fakePrisma(emptyDb));
  check('a reachable but EMPTY database → 503 (still the false-green this endpoint used to give), state=missing', empty.status === 503 && /state=missing/.test(empty.logs[0] ?? ''), empty);

  fresh();
  const errDb = healthyDb(); errDb.tables = adapterErr('DatabaseNotReachable');
  const probeErr = await hit(fakePrisma(errDb));
  check('the readiness probe itself throws → 503, never a 200, never a 500', probeErr.status === 503 && probeErr.body['status'] === 'degraded', probeErr);
  check('probe error: state=unknown reason=probe_error, with the classified cause', /state=unknown/.test(probeErr.logs[0] ?? '') && /probe_error/.test(probeErr.logs[0] ?? '') && /reason=unreachable/.test(probeErr.logs[0] ?? ''), probeErr.logs);
  check('probe error: one log line, and no driver text, host, user, secret or SQL in it', probeErr.logs.length === 1 && !LEAK.test(probeErr.logs.join(' ')), probeErr.logs);

  fresh();
  const hErrDb = healthyDb(); hErrDb.history = new Error(SECRET_TEXT);
  const histErr = await hit(fakePrisma(hErrDb));
  check('the history query throws → 503', histErr.status === 503, histErr);
  check('history query error: one log line, nothing sensitive in it', histErr.logs.length === 1 && !LEAK.test(histErr.logs.join(' ')), histErr.logs);

  // ── 3. fail closed when the shipped list or table list cannot be read ─
  console.log('\n── 3. fail closed ──');
  await unit('shipped unreadable', async () => {
    fresh();
    const r = await H.probeReadiness(fakePrisma(healthyDb()), { shipped: null, cacheMs: 0 });
    check('shipped list unreadable → not ready, state unknown (never a silent pass)', r.ready === false && r.state === 'unknown' && r.unknownReason === 'shipped_unreadable', r);
    check('…and it does not pretend to know a shipped count', r.shipped === null, r);
  });
  await unit('required tables unreadable', async () => {
    fresh();
    const r = await H.probeReadiness(fakePrisma(healthyDb()), { shipped: SHIPPED, requiredTables: null, cacheMs: 0 });
    check('required-table list unreadable → not ready, state unknown', r.ready === false && r.state === 'unknown' && r.unknownReason === 'tables_unreadable', r);
  });
  await unit('shipped empty', async () => {
    fresh();
    const r = await H.probeReadiness(fakePrisma(healthyDb()), { shipped: [], cacheMs: 0 });
    check('an EMPTY shipped list is as unusable as an unreadable one (a build with zero migrations is not a build)', r.ready === false && r.state === 'unknown', r);
  });
  await unit('probe never throws', async () => {
    const throwing = { $queryRaw: () => { throw new Error(SECRET_TEXT); } } as unknown as import('@prisma/client').PrismaClient;
    const r = await H.probeReadiness(throwing, { shipped: SHIPPED, requiredTables: REQUIRED, cacheMs: 0 });
    check('a client that throws synchronously still yields a not-ready result, not an exception', r.ready === false && r.state === 'unknown', r);
  });

  // ── 4. truth table, unit level ───────────────────────────────────────
  console.log('\n── 4. state truth table ──');
  const S = ['m1', 'm2', 'm3'];
  const T = ['users', 'ads'];
  const tabs = [...T, '_prisma_migrations'];
  const probe = (h: Hist[], t: string[] = tabs) => H.probeReadiness(fakePrisma({ tables: t, history: h }), { shipped: S, requiredTables: T, cacheMs: 0 });
  await unit('truth table', async () => {
    fresh();
    const cases: Array<[string, Hist[], string[], string, boolean]> = [
      ['exact match', [{ name: 'm1' }, { name: 'm2' }, { name: 'm3' }], tabs, 'ok', true],
      ['extra applied identity', [{ name: 'm1' }, { name: 'm2' }, { name: 'm3' }, { name: 'z9' }], tabs, 'ahead', true],
      ['one shipped identity not applied', [{ name: 'm1' }, { name: 'm2' }], tabs, 'pending', false],
      ['nothing applied', [], tabs, 'pending', false],
      ['one missing + extras present', [{ name: 'm1' }, { name: 'm2' }, { name: 'z9' }], tabs, 'diverged', false],
      ['equal count, one renamed', [{ name: 'm1' }, { name: 'm2' }, { name: 'x3' }], tabs, 'diverged', false],
      ['all applied + unfinished row', [{ name: 'm1' }, { name: 'm2' }, { name: 'm3' }, { name: 'm4', finished: false }], tabs, 'failed', false],
      ['unfinished row beats pending', [{ name: 'm1' }, { name: 'm2', finished: false }], tabs, 'failed', false],
      ['table absent, history complete', [{ name: 'm1' }, { name: 'm2' }, { name: 'm3' }], ['users', '_prisma_migrations'], 'missing', false],
      ['pending outranks a missing table (the table is a symptom of the pending migration)', [{ name: 'm1' }, { name: 'm2' }], ['users', '_prisma_migrations'], 'pending', false],
      ['tables present, no history table', [], T, 'unknown', false],
      ['nothing at all', [], [], 'missing', false],
    ];
    for (const [label, h, t, state, ready] of cases) {
      const r = await probe(h, t);
      check(`${label} → ${state}${ready ? ' (ready)' : ' (NOT ready)'}`, r.state === state && r.ready === ready, { state: r.state, ready: r.ready });
    }
    const r = await probe([{ name: 'm1' }, { name: 'm2' }, { name: 'x3' }]);
    check('diverged reports the exact sets', JSON.stringify(r.missingMigrations) === '["m3"]' && JSON.stringify(r.unexpectedMigrations) === '["x3"]' && r.applied === 3 && r.shipped === 3, r);
  });

  // ── 5. caching: ready results only ───────────────────────────────────
  console.log('\n── 5. cache: READY for 30 s, never a not-ready result ──');
  await unit('unit cache', async () => {
    fresh();
    const calls = { n: 0, sql: [] as string[] };
    const p = fakePrisma({ ...healthyDb(), calls });
    let t = 1_000_000;
    const opts = { shipped: SHIPPED, requiredTables: REQUIRED, now: () => t, cacheMs: 30_000 };
    const a = await H.probeReadiness(p, opts);
    const afterFirst = calls.n;
    t += 5_000;
    await H.probeReadiness(p, opts);
    check('a READY result is served from cache inside 30 s (no queries)', a.ready && calls.n === afterFirst, calls.n);
    t += 26_000;
    await H.probeReadiness(p, opts);
    check('after 30 s it queries again', calls.n > afterFirst, calls.n);

    fresh();
    const calls2 = { n: 0, sql: [] as string[] };
    const db2: Db = { ...healthyDb(), calls: calls2 };
    db2.tables = (db2.tables as string[]).filter((x) => x !== 'users');
    const p2 = fakePrisma(db2);
    t = 1_000_000;
    const first = await H.probeReadiness(p2, opts);
    const n1 = calls2.n;
    const second = await H.probeReadiness(p2, opts);
    check('a NOT-ready result is NOT cached: the same instant, a second probe queries again', !first.ready && !second.ready && calls2.n > n1, { n1, n: calls2.n });
    db2.tables = [...REQUIRED, '_prisma_migrations'];
    const recovered = await H.probeReadiness(p2, opts);
    check('recovery is seen on the very next probe (no waiting for a window)', recovered.ready === true && recovered.state === 'ok', recovered);

    fresh();
    const db3 = healthyDb(); db3.tables = new Error(SECRET_TEXT);
    const p3 = fakePrisma(db3);
    const e1 = await H.probeReadiness(p3, opts);
    db3.tables = [...REQUIRED, '_prisma_migrations'];
    const e2 = await H.probeReadiness(p3, opts);
    check('an ERRORED probe is not cached either', !e1.ready && e2.ready, [e1.state, e2.state]);

    fresh();
    const db4 = healthyDb();
    const p4 = fakePrisma(db4);
    t = 1_000_000;
    await H.probeReadiness(p4, opts);
    db4.history = (db4.history as Hist[]).slice(0, -1);
    t += 31_000;
    const stale = await H.probeReadiness(p4, opts);
    check('a ready result that went bad is noticed once the window ends', !stale.ready && stale.state === 'pending', stale);
  });

  await (async () => {
    fresh();
    const calls = { n: 0, sql: [] as string[] };
    const db = { ...healthyDb(), calls };
    const p = fakePrisma(db);
    const r1 = await hit(p);
    const n1 = calls.n;
    const r2 = await hit(p);
    check('route: first request issues liveness + readiness queries', r1.status === 200 && n1 >= 3, n1);
    check('route: a READY result is cached — the second request adds exactly one query (the liveness SELECT 1)', r2.status === 200 && calls.n === n1 + 1, { n1, n: calls.n });
    db.liveness = adapterErr('DatabaseNotReachable');
    const r3 = await hit(p);
    check('route: liveness is NOT cached — a database that dies behind a cached ready result is 503 db=unavailable at once', r3.status === 503 && r3.body['db'] === 'unavailable', r3);

    fresh();
    const calls2 = { n: 0, sql: [] as string[] };
    const db2: Db = { ...healthyDb(), calls: calls2 };
    db2.history = (db2.history as Hist[]).slice(0, -1);
    const p2 = fakePrisma(db2);
    const a = await hit(p2);
    const na = calls2.n;
    const b = await hit(p2);
    check('route: a NOT-ready result is re-evaluated on every request (second request queries again)', a.status === 503 && b.status === 503 && calls2.n - na >= 3, { na, n: calls2.n });
    check('route: …but the log line is rate-limited: one line for two identical requests', a.logs.length === 1 && b.logs.length === 0, [a.logs.length, b.logs.length]);
    db2.history = SHIPPED.map((name) => ({ name }));
    const c = await hit(p2);
    check('route: recovery is visible on the very next request (503 before, 200 now, no waiting for a window)', a.status === 503 && c.status === 200 && c.body['status'] === 'ok', [a.status, c.status]);
  })();

  // ── 6. logs: sanitised, bounded, rate-limited ────────────────────────
  console.log('\n── 6. log lines ──');
  fresh();
  const hostile: Db = healthyDb();
  const nasty = '29990101000000_x\n[adlytic:health] FORGED postgresql://svc:S3CR3T@db.internal:5432/app';
  hostile.history = [...(hostile.history as Hist[]).slice(0, -1), { name: nasty }];
  const hostileRes = await hit(fakePrisma(hostile));
  const hostileLine = hostileRes.logs[0] ?? '';
  check('a hostile identity read from the database yields exactly ONE log line (no injected lines)', hostileRes.logs.length === 1 && !/[\r\n]/.test(hostileLine), hostileRes.logs);
  check('…with no URL, userinfo or whitespace inside the name', !/:\/\/|@/.test(hostileLine) && /unexpectedMigrations=\S+/.test(hostileLine), hostileLine);

  fresh();
  const many = healthyDb(); many.history = [];
  const manyRes = await hit(fakePrisma(many));
  const line = manyRes.logs[0] ?? '';
  const shownMissing = (/missingMigrations=(\S+)/.exec(line)?.[1] ?? '').split(',').filter((x) => /^\d{14}_/.test(x));
  check('with every identity missing, the line names at most 5', shownMissing.length === 5, shownMissing.length);
  check('…and says how many more there are', new RegExp(`\\+${SHIPPED.length - 5}more`).test(line), line);
  check('…and stays one short line', manyRes.logs.length === 1 && line.length < 900, line.length);

  fresh();
  const wlDb = healthyDb(); wlDb.history = (wlDb.history as Hist[]).slice(0, -1);
  const w1 = await hit(fakePrisma(wlDb));
  const w2 = await hit(fakePrisma(wlDb));
  check('same state inside a minute: one line only', w1.logs.length === 1 && w2.logs.length === 0, [w1.logs.length, w2.logs.length]);
  const w3Db = healthyDb(); w3Db.history = [...(w3Db.history as Hist[]), { name: '29990101000000_half_applied', finished: false }];
  const w3 = await hit(fakePrisma(w3Db));
  check('a DIFFERENT state (failed) is logged even inside the minute pending was logged', w3.logs.length === 1 && /state=failed/.test(w3.logs[0] ?? ''), w3.logs);

  fresh();
  const down = await hit(fakePrisma({ ...healthyDb(), liveness: adapterErr('DatabaseAccessDenied') }));
  check('connectivity failure keeps the dbReason vocabulary — in the LOG, not the body', down.status === 503 && down.logs.length === 1 && /reason=auth/.test(down.logs[0] ?? '') && !('dbReason' in down.body), { logs: down.logs, keys: Object.keys(down.body) });
  check('connectivity log carries no driver text, host, user, secret or SQL', !LEAK.test(down.logs.join(' ')), down.logs);

  // ── 7. the public contract verify-live.yml reads ─────────────────────
  console.log('\n── 7. public body: exactly the legacy keys ──');
  fresh();
  const wf = readFileSync(path.join(ROOT, '.github', 'workflows', 'verify-live.yml'), 'utf8');
  const wfTop = [...new Set([...wf.matchAll(/\bf\("(\w+)"\)/g)].map((m) => m[1]!))];
  const wfBuild = [...new Set([...wf.matchAll(/\bb\("(\w+)"\)/g)].map((m) => m[1]!))];
  check('verify-live.yml reads status, db, role, runsBackgroundSync, bullmq', ['status', 'db', 'role', 'runsBackgroundSync', 'bullmq'].every((k) => wfTop.includes(k)), wfTop);
  check('verify-live.yml reads build.resolved/commit/shortCommit/branch', ['resolved', 'commit', 'shortCommit', 'branch'].every((k) => wfBuild.includes(k)), wfBuild);

  const bodies: Array<[string, Resp]> = [
    ['ready 200', ok],
    ['not ready 503 (pending)', pend],
    ['not ready 503 (equal-count wrong history)', wrong],
    ['not ready 503 (missing table)', noTable],
    ['not ready 503 (probe error)', probeErr],
    ['database unavailable 503', down],
  ];
  for (const [label, r] of bodies) {
    const keys = Object.keys(r.body);
    check(`${label}: keys are EXACTLY ${LEGACY.join(',')} (same order)`, JSON.stringify(keys) === JSON.stringify(LEGACY), keys);
    check(`${label}: no dbReason, no schema, no migration detail in the body`, !/dbReason|schema|migration|applied|pending|diverged/i.test(JSON.stringify(r.body)), r.body);
  }
  check('every key verify-live.yml reads is present with its meaning (top level)', wfTop.every((k) => k in ok.body), wfTop);
  check('…and under build', wfBuild.every((k) => k in (ok.body['build'] ?? {})), wfBuild);
  check('role/runsBackgroundSync/bullmq keep their types', typeof ok.body['role'] === 'string' && typeof ok.body['runsBackgroundSync'] === 'boolean' && ['enabled', 'disabled'].includes(ok.body['bullmq']), ok.body);
  check('service and version are the legacy literals', ok.body['service'] === 'adlytic' && ok.body['version'] === '0.1.0', ok.body);
  check('timestamp is an ISO instant', !Number.isNaN(Date.parse(ok.body['timestamp'])) && /T.*Z$/.test(ok.body['timestamp']), ok.body['timestamp']);
  check('the three outcomes: ready = ok/ok, not ready = degraded/ok, unreachable = degraded/unavailable',
    ok.body['status'] === 'ok' && ok.body['db'] === 'ok'
    && wrong.body['status'] === 'degraded' && wrong.body['db'] === 'ok'
    && down.body['status'] === 'degraded' && down.body['db'] === 'unavailable',
    [ok.body['status'], ok.body['db'], wrong.body['status'], wrong.body['db'], down.body['status'], down.body['db']]);

  // ── 8. WHERE the shipped list is read from (review findings) ─────────
  //  The shipped list is the definition of "what this build needs". It must come
  //  from THIS build's own files, never from whatever directory the process
  //  happens to run in, and a broken working directory must not turn the
  //  endpoint into a 500.
  console.log('\n── 8. the shipped list belongs to the build, not to the working directory ──');
  await unit('cwd decoy', async () => {
    const decoyRoot = mkdtempSync(path.join(tmpdir(), 'health-decoy-'));
    // The nastiest decoy: a copy of this build's list MINUS the newest migration (an older checkout). Read as
    // "shipped", it makes a database that lacks the newest migration look completely ready.
    for (const n of SHIPPED.slice(0, -1)) {
      mkdirSync(path.join(decoyRoot, 'prisma', 'migrations', n), { recursive: true });
      writeFileSync(path.join(decoyRoot, 'prisma', 'migrations', n, 'migration.sql'), 'select 1;\n');
    }
    const before = process.cwd();
    try {
      process.chdir(decoyRoot);
      fresh();
      const names = H.shippedMigrationNames();
      check('run from a directory that has its OWN prisma/migrations: the shipped list is still THIS build\'s (not the decoy)',
        JSON.stringify(names) === JSON.stringify(SHIPPED), { got: names?.length, want: SHIPPED.length });
      const r = await H.probeReadiness(fakePrisma(healthyDb()), { cacheMs: 0 });
      check('…so a healthy database is still ok, judged against the build\'s own list', r.ready === true && r.state === 'ok' && r.shipped === SHIPPED.length, r);
      const pend = healthyDb(); pend.history = (pend.history as Hist[]).slice(0, -1);
      const r2 = await H.probeReadiness(fakePrisma(pend), { cacheMs: 0 });
      check('…and a database that lacks the NEWEST migration is pending, not ok (the decoy list would have said ok)', r2.ready === false && r2.state === 'pending', r2);
    } finally { process.chdir(before); rmSync(decoyRoot, { recursive: true, force: true }); fresh(); }
  });
  await unit('deleted cwd', async () => {
    const gone = mkdtempSync(path.join(tmpdir(), 'health-gone-'));
    const before = process.cwd();
    try {
      process.chdir(gone);
      rmdirSync(gone);
      fresh();
      let threw: string | null = null;
      let r: Awaited<ReturnType<typeof H.probeReadiness>> | null = null;
      try { r = await H.probeReadiness(fakePrisma(healthyDb()), { cacheMs: 0 }); } catch (e) { threw = (e as Error).message; }
      check('the working directory no longer exists: probeReadiness still does not throw', threw === null, threw);
      check('…and still finds the build\'s own migrations (ok, not unknown)', r?.ready === true && r?.state === 'ok', r);
      fresh();
      const res = await hit(fakePrisma(healthyDb()));
      check('…so GET /api/health is the 200 contract, not a 500 {error}', res.status === 200 && JSON.stringify(Object.keys(res.body)) === JSON.stringify(LEGACY), { status: res.status, keys: Object.keys(res.body) });
    } finally { process.chdir(before); fresh(); }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('test_health_migration_gate crashed:', e); process.exit(1); });
