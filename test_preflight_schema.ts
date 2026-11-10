// ═════════════════════════════════════════════════════════════════════════
//  test_preflight_schema.ts — scripts/ops/preflight-schema.ts, WITHOUT a database.
//
//  The preflight answers one question for a human operator: "is it safe to
//  point THIS build at THIS database?". Exit 0 = GO, 1 = NO-GO, 2 = NOT RUN.
//  It must be read-only, must never print a host / user / password / customer
//  value, and must never disagree with the /api/health readiness gate about
//  migration identities, tables and columns (src/lib/dbHealth.ts) — while
//  also catching the one thing that gate cannot see: a migration file edited
//  after it was applied (checksum drift).
//
//  CI runs this with no database, no Redis and no secrets (`npm run test:all`).
//  The same logic is exercised against a real Postgres, as a read-only role,
//  by test_preflight_schema_pg.ts (NOT part of test:all; exits 2 when it
//  cannot connect).
//
//  Sections
//    0  preconditions (the shipped list / required tables come from dbHealth)
//    1  the pure verdict, one case per state
//    2  agreement with dbHealth.probeReadiness on identities/tables/columns
//    3  checksums (edited-after-apply, line endings, hashing)
//    4  volume thresholds
//    5  redaction
//    6  the statement allowlist
//    7  loopback gate + argument parsing
//    8  counts evaluation (aggregates only)
//    9  main() against a fake connection: statements, secrets, exit codes
//   10  the real CLI as a subprocess (no database needed for exit 2 paths)
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}
/** A throw inside a unit case is ONE failed assertion (e.g. "export does not exist"), not a crash of the file. */
async function unit(name: string, fn: () => Promise<void> | void) {
  try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name} — threw: ${(e as Error).message}`); }
}

type P = typeof import('./scripts/ops/preflight-schema');
type Facts = import('./scripts/ops/preflight-schema').SchemaFacts;
type Check = import('./scripts/ops/preflight-schema').CheckResult;
let P: P;

const ROOT = __dirname;
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

// ── a small synthetic build ───────────────────────────────────────────────
const SHIPPED = ['20260101000000_init', '20260102000000_add_a', '20260103000000_add_b', '20260104000000_add_c'];
const REQ_TABLES = ['campaigns', 'users'];
const REQ_COLS = new Map<string, string[]>([['campaigns', ['id', 'name']], ['users', ['email', 'id']]]);
const sqlOf = (n: string) => `-- migration ${n}\nCREATE TABLE x_${n.slice(0, 14)} (id int);\n`;
const HASHES = (): Record<string, import('./scripts/ops/preflight-schema').FileHash> =>
  Object.fromEntries(SHIPPED.map((n) => [n, P.sha256Variants(Buffer.from(sqlOf(n)))]));

function healthy(): Facts {
  return {
    shipped: [...SHIPPED],
    fileHashes: HASHES(),
    history: SHIPPED.map((name) => ({ name, checksum: sha(sqlOf(name)), finished: true })),
    requiredTables: [...REQ_TABLES],
    requiredColumns: new Map([...REQ_COLS].map(([t, c]) => [t, [...c]] as [string, string[]])),
    presentTables: new Set([...REQ_TABLES, '_prisma_migrations']),
    presentColumns: new Map([...REQ_COLS].map(([t, c]) => [t, new Set(c)] as [string, Set<string>])),
  };
}
const byId = (cs: Check[], id: string) => cs.find((c) => c.id === id);

// ── fake database connection for main() ───────────────────────────────────
interface FakeOpts {
  tables?: string[]; history?: Array<{ name: string; checksum: string; finished?: boolean; rolled_back?: boolean }> | null;
  columns?: Array<{ t: string; c: string }>; dbName?: string; failOn?: string; failCode?: string;
  largest?: Array<{ name: string; bytes: string }>; dbBytes?: string;
  counts?: Record<string, Array<Record<string, unknown>>>;
  /** also provide every table/column the count statements need (a database that can answer --counts) */
  forCounts?: boolean;
}
function fakeConn(o: FakeOpts = {}) {
  const sent: string[] = [];
  const ended = { n: 0 };
  const hist = o.history === undefined ? SHIPPED.map((name) => ({ name, checksum: sha(sqlOf(name)), finished: true, rolled_back: false })) : o.history;
  let tables = o.tables ?? [...REQ_TABLES, ...(hist === null ? [] : ['_prisma_migrations'])];
  let cols = o.columns ?? [...REQ_COLS].flatMap(([t, cs]) => cs.map((c) => ({ t, c })));
  if (o.forCounts) {
    const cq = (P as unknown as { COUNT_QUERIES: Array<{ needs: ReadonlyArray<readonly string[]> }> }).COUNT_QUERIES;
    tables = [...new Set([...tables, ...cq.flatMap((q) => q.needs.map((n) => n[0]!))])];
    cols = [...cols, ...cq.flatMap((q) => q.needs.flatMap((n) => n.slice(1).map((c) => ({ t: n[0]!, c }))))];
  }
  const SQL = P.SQL as Record<string, string>;
  const conn = {
    async query(text: string): Promise<{ rows: Array<Record<string, unknown>> }> {
      sent.push(text);
      if (o.failOn && text === SQL[o.failOn]) throw Object.assign(new Error('boom: host db.internal.example user svc password S3CR3T-pw ' + MARKER), { code: o.failCode ?? '57014' });
      if (text === SQL['begin'] || text === SQL['setStatementTimeout'] || text === SQL['setLockTimeout'] || text === SQL['rollback']) return { rows: [] };
      if (text === SQL['version']) return { rows: [{ server_version: '16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)' }] };
      if (text === SQL['dbName']) return { rows: [{ name: o.dbName ?? 'railway_production_db' }] };
      if (text === SQL['tables']) return { rows: tables.map((name) => ({ name })) };
      if (text === SQL['history']) return { rows: (hist ?? []).map((r) => ({ name: r.name, checksum: r.checksum, finished: r.finished !== false, rolled_back: r.rolled_back === true })) };
      if (text === SQL['historyStats']) return { rows: [{ total: String((hist ?? []).length), rolled_back: '0', newest_finished: '2026-08-23T01:00:00Z' }] };
      if (text === SQL['columns']) return { rows: cols };
      if (text === SQL['dbSize']) return { rows: [{ bytes: o.dbBytes ?? '52428800' }] };
      if (text === SQL['largestTables']) return { rows: o.largest ?? [{ name: 'daily_stats', bytes: '30000000' }, { name: 'raw_insights', bytes: '9000000' }] };
      const cq = (P as unknown as { COUNT_QUERIES?: Array<{ id: string; sql: string }> }).COUNT_QUERIES?.find((q) => q.sql === text);
      if (cq) return { rows: o.counts?.[cq.id] ?? defaultCounts(cq.id) };
      throw new Error(`fake: unexpected statement ${text.slice(0, 60)}`);
    },
    async end() { ended.n++; },
  };
  return { conn, sent, ended };
}
function defaultCounts(id: string): Array<Record<string, unknown>> {
  if (id.startsWith('rows.')) return [{ n: '12' }];
  if (id === 'range.daily_stats') return [{ oldest: '2026-05-01', newest: '2026-08-20' }];
  if (id === 'range.sync_jobs') return [{ oldest: '2026-05-01T00:00:00Z', newest: '2026-08-20T03:00:00Z', newest_completed: '2026-08-20T03:01:00Z' }];
  if (id === 'status.sync_jobs') return [{ status: 'COMPLETED', n: '9' }, { status: 'FAILED', n: '1' }];
  if (id.startsWith('dup.')) return [{ groups: '0', extra: '0' }];
  if (id === 'orphans.daily_stats') return [{ row_count: '0', distinct_ids: '0' }];
  if (id === 'iqd.ad_accounts') return [{ iqd_total: '2', iqd_noncanonical: '0' }];
  if (id.startsWith('tokens.')) return [{ n: '2' }];
  return [{ n: '0' }];
}
function realisticDeps(conn: ReturnType<typeof fakeConn>['conn']) {
  return {
    connect: async () => conn,
    readBuild: () => ({ names: [...SHIPPED], fileHashes: HASHES(), requiredTables: [...REQ_TABLES], requiredColumns: new Map(REQ_COLS) }),
  };
}
const NOW = new Date('2026-08-23T12:00:00Z');
function cap() {
  const o: string[] = []; const e: string[] = [];
  return { io: { out: (s: string) => { o.push(s); }, err: (s: string) => { e.push(s); }, now: () => NOW }, out: () => o.join('\n'), err: () => e.join('\n'), all: () => [...o, ...e].join('\n') };
}
const MARKER = 'WEIRD_DRIVER_MARKER_7781';
const SECRET_URL = 'postgresql://svc_user:S3CR3T-pw@db.internal.example:6543/railway_production_db';
const LEAKS = ['S3CR3T-pw', 'svc_user', 'db.internal.example', '6543', 'railway_production_db', SECRET_URL];
const leaked = (s: string) => LEAKS.filter((l) => s.includes(l));

async function main() {
  P = await import('./scripts/ops/preflight-schema');
  const H = await import('./src/lib/dbHealth');

  // ── 0. preconditions ────────────────────────────────────────────────────
  console.log('\n── 0. preconditions ──');
  for (const k of ['decideVerdict', 'combineVerdict', 'evaluateVolume', 'redactDatabaseName', 'assertReadOnlySql', 'isLoopbackHost', 'parseArgs', 'sha256Variants', 'evaluateCounts', 'main']) {
    check(`export ${k} is a function`, typeof (P as unknown as Record<string, unknown>)[k] === 'function');
  }
  check('SQL constants are exported', typeof P.SQL === 'object' && Object.keys(P.SQL).length > 8, Object.keys(P.SQL ?? {}).length);
  const realShipped = H.shippedMigrationNames();
  check('this build ships migrations (the preflight reuses dbHealth.shippedMigrationNames)', !!realShipped && realShipped.length > 30, realShipped?.length);
  check('the generated client exposes required tables and columns (reused from dbHealth)', !!H.requiredTableNames() && !!H.requiredColumnNames(), null);

  // ── 1. the pure verdict ─────────────────────────────────────────────────
  console.log('\n── 1. pure verdict, one case per state ──');
  await unit('verdict', () => {
    const d = P.decideVerdict(healthy());
    check('ok → GO, state ok', d.verdict === 'GO' && d.state === 'ok', d);
    check('ok → every schema check PASS', d.checks.length >= 4 && d.checks.every((c) => c.status === 'PASS'), d.checks.map((c) => `${c.id}:${c.status}`));
    check('every check has a vocabulary status and a one-line reason', d.checks.every((c) => ['PASS', 'FAIL', 'WARN', 'NOT_RUN'].includes(c.status) && c.reason.length > 0 && !/\n/.test(c.reason)), d.checks);

    const f = healthy(); f.history!.push({ name: '29990101000000_from_newer_release', checksum: 'x', finished: true });
    const a = P.decideVerdict(f);
    check('ahead (extra applied identity) → GO, state ahead, tolerated like /api/health', a.verdict === 'GO' && a.state === 'ahead', a);
    check('ahead is visible as WARN on the identities check, not silent', byId(a.checks, 'identities')?.status === 'WARN', byId(a.checks, 'identities'));

    const p = healthy(); p.history = p.history!.slice(0, 3);
    const pd = P.decideVerdict(p);
    check('pending (a shipped identity not applied) → NO-GO, state pending', pd.verdict === 'NO-GO' && pd.state === 'pending', pd);
    check('pending names the missing migration', (byId(pd.checks, 'identities')?.details ?? []).join(' ').includes(SHIPPED[3]!), byId(pd.checks, 'identities'));

    const dv = healthy(); dv.history = dv.history!.slice(0, 3); dv.history.push({ name: '29990101000000_foreign', checksum: 'x', finished: true });
    const dd = P.decideVerdict(dv);
    check('diverged (missing AND extra) → NO-GO, state diverged', dd.verdict === 'NO-GO' && dd.state === 'diverged', dd);

    const eq = healthy(); eq.history![3] = { name: '29990101000000_bogus_identity', checksum: 'x', finished: true };
    const ed = P.decideVerdict(eq);
    check('equal-count wrong history (4 shipped, 4 applied, one name differs) → NO-GO diverged', eq.history!.length === SHIPPED.length && ed.verdict === 'NO-GO' && ed.state === 'diverged', ed);
    const det = (byId(ed.checks, 'identities')?.details ?? []).join(' ');
    check('…and BOTH the missing and the unexpected name are listed', det.includes(SHIPPED[3]!) && det.includes('29990101000000_bogus_identity'), det);

    const fl = healthy(); fl.history!.push({ name: '29990102000000_failed_one', checksum: 'x', finished: false });
    const fd = P.decideVerdict(fl);
    check('failed row (all shipped applied, tables and columns fine) → NO-GO, state failed', fd.verdict === 'NO-GO' && fd.state === 'failed' && byId(fd.checks, 'tables')?.status === 'PASS' && byId(fd.checks, 'columns')?.status === 'PASS', fd);
    check('failed row is named in the reason details', (byId(fd.checks, 'identities')?.details ?? []).join(' ').includes('29990102000000_failed_one'), byId(fd.checks, 'identities'));

    const fs = healthy(); fs.history!.push({ name: SHIPPED[1]!, checksum: sha(sqlOf(SHIPPED[1]!)), finished: false });
    check('failed row next to a finished row of the SAME shipped identity → still NO-GO failed', P.decideVerdict(fs).verdict === 'NO-GO' && P.decideVerdict(fs).state === 'failed');

    const rb = healthy(); rb.history!.unshift({ name: SHIPPED[2]!, checksum: 'old', finished: false, rolledBack: true });
    const rd = P.decideVerdict(rb);
    check('rolled-back failed attempt + the identity re-applied → GO, state ok', rd.verdict === 'GO' && rd.state === 'ok', rd);

    const ro = healthy(); ro.history = ro.history!.filter((r) => r.name !== SHIPPED[2]!); ro.history.push({ name: SHIPPED[2]!, checksum: 'old', finished: false, rolledBack: true });
    const rod = P.decideVerdict(ro);
    check('rolled-back attempt that was NEVER re-applied → NO-GO pending (a rolled-back row is not "applied")', rod.verdict === 'NO-GO' && rod.state === 'pending', rod);

    const mt = healthy(); mt.presentTables = new Set(['_prisma_migrations', 'users']);
    const mtd = P.decideVerdict(mt);
    check('missing table → NO-GO, state missing, table named', mtd.verdict === 'NO-GO' && mtd.state === 'missing' && (byId(mtd.checks, 'tables')?.details ?? []).join(' ').includes('campaigns'), mtd);

    const mc = healthy(); mc.presentColumns = new Map([['campaigns', new Set(['id', 'name'])], ['users', new Set(['id'])]]);
    const mcd = P.decideVerdict(mc);
    check('missing column (every identity applied, every table present) → NO-GO, state missing', mcd.verdict === 'NO-GO' && mcd.state === 'missing', mcd);
    check('…and the column is named table.column', (byId(mcd.checks, 'columns')?.details ?? []).join(' ').includes('users.email'), byId(mcd.checks, 'columns'));

    const xt = healthy(); xt.presentTables = new Set([...(xt.presentTables as Set<string>), 'scratch_table_not_in_schema']);
    xt.presentColumns = new Map([...xt.presentColumns!, ['scratch_table_not_in_schema', new Set(['a'])]]);
    check('extra table the schema does not know → GO (ignored, as /api/health ignores it)', P.decideVerdict(xt).verdict === 'GO');

    const em = healthy(); em.history = null; em.presentTables = new Set(); em.presentColumns = new Map();
    const emd = P.decideVerdict(em);
    check('empty database (no history table, no tables) → NO-GO, state missing', emd.verdict === 'NO-GO' && emd.state === 'missing', emd);

    const nh = healthy(); nh.history = null; nh.presentTables = new Set(REQ_TABLES);
    const nhd = P.decideVerdict(nh);
    check('schema present but no _prisma_migrations → NO-GO, state unknown (the P3005 situation)', nhd.verdict === 'NO-GO' && nhd.state === 'unknown', nhd);
  });

  await unit('fail closed', () => {
    const cases: Array<[string, (f: Facts) => void, string]> = [
      ['shipped list unreadable (null)', (f) => { f.shipped = null; }, 'identities'],
      ['shipped list empty', (f) => { f.shipped = []; }, 'identities'],
      ['required tables unreadable', (f) => { f.requiredTables = null; }, 'tables'],
      ['required columns unreadable', (f) => { f.requiredColumns = null; }, 'columns'],
      ['present columns unreadable', (f) => { f.presentColumns = null; }, 'columns'],
      ['shipped file hashes unreadable', (f) => { f.fileHashes = null; }, 'checksums'],
    ];
    for (const [name, mut, which] of cases) {
      const f = healthy(); mut(f);
      const d = P.decideVerdict(f);
      check(`${name} → NO-GO (fail closed)`, d.verdict === 'NO-GO', d);
      const own = byId(d.checks, which);
      check(`${name} → the ${which} check itself is NOT_RUN or FAIL and gating, never silently PASS`, !!own && own.gating && (own.status === 'NOT_RUN' || own.status === 'FAIL'), d.checks.map((c) => `${c.id}:${c.status}`));
    }
    const d = P.decideVerdict({ ...healthy(), shipped: null });
    check('unknown shipped list → state unknown (the same word /api/health uses)', d.state === 'unknown', d.state);
  });

  await unit('caps', () => {
    const f = healthy();
    f.requiredTables = Array.from({ length: 60 }, (_v, i) => `t_${String(i).padStart(2, '0')}`);
    f.presentTables = new Set(['_prisma_migrations']);
    f.requiredColumns = new Map();
    f.presentColumns = new Map();
    const d = P.decideVerdict(f);
    const t = byId(d.checks, 'tables');
    check('60 missing tables → NO-GO', d.verdict === 'NO-GO' && t?.status === 'FAIL', t?.status);
    check('the details list is capped (≤ 12 lines) and says how many more', (t?.details ?? []).length <= 12 && /\+\d+ more/.test((t?.details ?? []).join(' ')), t?.details?.length);
    check('the reason carries the true count (60)', /60/.test(t?.reason ?? ''), t?.reason);
  });

  // ── 2. agreement with the health gate ───────────────────────────────────
  console.log('\n── 2. the preflight and /api/health cannot disagree ──');
  function fakePrismaFrom(f: Facts) {
    return {
      $queryRaw: async (strings: TemplateStringsArray): Promise<Array<Record<string, unknown>>> => {
        const sql = strings.join(' ');
        const tables = [...(f.presentTables as Iterable<string>)];
        if (/pg_tables/.test(sql)) return tables.map((name) => ({ name }));
        if (/pg_attribute/.test(sql)) { const o: Array<Record<string, unknown>> = []; for (const [t, cs] of f.presentColumns ?? []) for (const c of cs) o.push({ t, c }); return o; }
        if (/migration_name/.test(sql)) return (f.history ?? []).filter((r) => !r.rolledBack).map((r) => ({ name: r.name, finished: r.finished }));
        throw new Error('unexpected SQL in fake');
      },
    } as unknown as import('@prisma/client').PrismaClient;
  }
  const scenarios: Array<[string, (f: Facts) => void]> = [
    ['ok', () => {}],
    ['ahead', (f) => { f.history!.push({ name: '2999_new', checksum: 'x', finished: true }); }],
    ['pending', (f) => { f.history = f.history!.slice(0, 2); }],
    ['diverged', (f) => { f.history = f.history!.slice(0, 3); f.history.push({ name: '2999_foreign', checksum: 'x', finished: true }); }],
    ['equal-count wrong history', (f) => { f.history![3] = { name: '2999_bogus', checksum: 'x', finished: true }; }],
    ['failed row', (f) => { f.history!.push({ name: '2999_failed', checksum: 'x', finished: false }); }],
    ['rolled back then re-applied', (f) => { f.history!.unshift({ name: SHIPPED[1]!, checksum: 'o', finished: false, rolledBack: true }); }],
    ['missing table', (f) => { f.presentTables = new Set(['_prisma_migrations', 'users']); }],
    ['missing column', (f) => { f.presentColumns = new Map([['campaigns', new Set(['id'])], ['users', new Set(['email', 'id'])]]); }],
    ['empty database', (f) => { f.history = null; f.presentTables = new Set(); f.presentColumns = new Map(); }],
    ['history table absent, schema present', (f) => { f.history = null; f.presentTables = new Set(REQ_TABLES); }],
  ];
  for (const [name, mut] of scenarios) {
    await unit(name, async () => {
      const f = healthy(); mut(f);
      H.__resetDbHealthStateForTests();
      const r = await H.probeReadiness(fakePrismaFrom(f), { shipped: [...SHIPPED], requiredTables: [...REQ_TABLES], requiredColumns: new Map(REQ_COLS), cacheMs: 0 });
      const d = P.decideVerdict(f);
      check(`${name}: preflight state "${d.state}" equals the /api/health state "${r.state}"`, d.state === r.state, { preflight: d.state, health: r.state });
      check(`${name}: preflight GO iff /api/health would answer 200`, (d.verdict === 'GO') === r.ready, { verdict: d.verdict, ready: r.ready });
    });
  }

  // ── 3. checksums ────────────────────────────────────────────────────────
  console.log('\n── 3. checksums ──');
  await unit('hashing', () => {
    check('sha256Variants(raw) is the sha256 of the raw bytes (known vector "abc")', P.sha256Variants(Buffer.from('abc')).sha256 === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const lf = Buffer.from('a\nb\n'); const crlf = Buffer.from('a\r\nb\r\n');
    const hl = P.sha256Variants(lf); const hc = P.sha256Variants(crlf);
    check('LF and CRLF copies of the same text hash differently when raw', hl.sha256 !== hc.sha256);
    check('…but share the same LF-normalised and CRLF-normalised variants', hl.lfSha256 === hc.lfSha256 && hl.crlfSha256 === hc.crlfSha256, { hl, hc });
    check('a different text has different variants', P.sha256Variants(Buffer.from('a\nc\n')).lfSha256 !== hl.lfSha256);
  });
  await unit('drift', () => {
    const f = healthy(); f.history![1] = { ...f.history![1]!, checksum: sha('-- migration edited after it was applied') };
    const d = P.decideVerdict(f);
    check('an applied checksum that differs from the shipped file → NO-GO', d.verdict === 'NO-GO', d);
    check('…the checksums check FAILs and names the migration', byId(d.checks, 'checksums')?.status === 'FAIL' && (byId(d.checks, 'checksums')?.details ?? []).join(' ').includes(SHIPPED[1]!), byId(d.checks, 'checksums'));
    check('…while the /api/health state stays "ok" — the gate cannot see this, which is why the preflight exists', d.state === 'ok', d.state);
    check('…and neither checksum value is printed (they identify file content, not secrets, but are noise)', !JSON.stringify(d.checks).includes(sha('-- migration edited after it was applied')), null);

    const lfOnly = healthy();
    lfOnly.history![0] = { ...lfOnly.history![0]!, checksum: P.sha256Variants(Buffer.from(sqlOf(SHIPPED[0]!).replace(/\n/g, '\r\n'))).sha256 };
    const ld = P.decideVerdict(lfOnly);
    check('a mismatch that vanishes after line-ending normalisation (a CRLF checkout) → GO with WARN, not FAIL', ld.verdict === 'GO' && byId(ld.checks, 'checksums')?.status === 'WARN', byId(ld.checks, 'checksums'));

    const extra = healthy(); extra.history!.push({ name: '29990101000000_future', checksum: 'not-a-shipped-file', finished: true });
    check('an applied identity this build does not ship has no file to compare → not a checksum FAIL', byId(P.decideVerdict(extra).checks, 'checksums')?.status !== 'FAIL');

    const dup = healthy(); dup.history!.push({ name: SHIPPED[2]!, checksum: sha('other'), finished: true });
    check('two finished rows for one identity, one of them different → NO-GO', P.decideVerdict(dup).verdict === 'NO-GO');

    // A finished, live row recorded TWICE for one identity (same name, same checksum): `prisma migrate status` calls the database
    // "up to date" and /api/health calls it ready, but the history was copied or edited by hand: the identity-based verdict must not be GO.
    const same = healthy(); same.history!.push({ name: SHIPPED[2]!, checksum: sha(sqlOf(SHIPPED[2]!)), finished: true });
    const sd = P.decideVerdict(same);
    check('the SAME identity finished twice with an identical checksum → NO-GO (history rows are evidence, not a set)', sd.verdict === 'NO-GO', sd);
    check('…the identities check FAILs, names the duplicated migration and says "more than once"', byId(sd.checks, 'identities')?.status === 'FAIL' && /more than once/.test(byId(sd.checks, 'identities')?.reason ?? '') && (byId(sd.checks, 'identities')?.details ?? []).join(' ').includes(`duplicated: ${SHIPPED[2]}`), byId(sd.checks, 'identities'));
    check('…while the /api/health state stays "ok" (the gate cannot see this either)', sd.state === 'ok', sd.state);
    const dupRb = healthy(); dupRb.history!.push({ name: SHIPPED[2]!, checksum: 'old', finished: true, rolledBack: true });
    check('a rolled-back copy of an applied identity is NOT a duplicate → GO', P.decideVerdict(dupRb).verdict === 'GO', P.decideVerdict(dupRb));
    const dupAhead = healthy(); dupAhead.history!.push({ name: '29990101000000_future', checksum: 'x', finished: true }, { name: '29990101000000_future', checksum: 'x', finished: true });
    check('a duplicated identity this build does not ship is also reported (a history copied twice)', P.decideVerdict(dupAhead).verdict === 'NO-GO' && (byId(P.decideVerdict(dupAhead).checks, 'identities')?.details ?? []).join(' ').includes('duplicated: 29990101000000_future'), byId(P.decideVerdict(dupAhead).checks, 'identities'));

    const unfinishedDrift = healthy(); unfinishedDrift.history![3] = { name: SHIPPED[3]!, checksum: sha('whatever'), finished: false };
    check('an unfinished row is judged as failed/pending, never as a checksum match', P.decideVerdict(unfinishedDrift).verdict === 'NO-GO');
  });

  // ── 4. volume ───────────────────────────────────────────────────────────
  console.log('\n── 4. volume thresholds ──');
  await unit('volume', () => {
    const mk = (pct: number) => P.evaluateVolume(pct, 100);
    check('50% → PASS', mk(50).status === 'PASS');
    check('80% exactly → PASS ("above 80" warns)', mk(80).status === 'PASS', mk(80));
    check('81% → WARN', mk(81).status === 'WARN', mk(81));
    check('95% exactly → WARN (not above 95)', mk(95).status === 'WARN', mk(95));
    check('96% → FAIL', mk(96).status === 'FAIL', mk(96));
    check('96% is gating: the volume check alone turns a GO into NO-GO', P.combineVerdict([...P.decideVerdict(healthy()).checks, mk(96)]) === 'NO-GO');
    check('81% does not block: WARN keeps the verdict GO', P.combineVerdict([...P.decideVerdict(healthy()).checks, mk(81)]) === 'GO');
    check('the percentage is in the reason', /96(\.\d)?%/.test(mk(96).reason), mk(96).reason);
    const none = P.evaluateVolume(1234, undefined);
    check('no --volume-bytes → NOT_RUN and NOT gating (nothing was asked)', none.status === 'NOT_RUN' && none.gating === false, none);
    const unreadable = P.evaluateVolume(null, 100);
    check('--volume-bytes given but the database size could not be read → NOT_RUN and gating', unreadable.status === 'NOT_RUN' && unreadable.gating === true, unreadable);
    check('the reason says the figure is the database only (WAL and other databases on the volume are not included)', /WAL|other databases/i.test(mk(50).reason), mk(50).reason);
  });

  // ── 5. redaction ────────────────────────────────────────────────────────
  console.log('\n── 5. redaction ──');
  await unit('redaction', () => {
    const r = P.redactDatabaseName('railway_production_db');
    check('first 3 characters + length', r.startsWith('rai') && /21/.test(r), r);
    check('the rest of the name does not appear', !r.includes('railway') && !r.includes('production') && !r.includes('_db'), r);
    const s = P.redactDatabaseName('ab');
    check('a name of 3 characters or fewer reveals nothing of itself', !s.includes('ab') && /2/.test(s), s);
    check('an empty name does not crash', typeof P.redactDatabaseName('') === 'string');
  });

  // ── 6. the statement allowlist ──────────────────────────────────────────
  console.log('\n── 6. statement allowlist ──');
  await unit('allowlist accepts', () => {
    const consts = Object.entries(P.SQL).filter(([, v]) => typeof v === 'string') as Array<[string, string]>;
    for (const [k, v] of consts) {
      let ok = true; try { P.assertReadOnlySql(v); } catch { ok = false; }
      check(`SQL.${k} is accepted`, ok, v.slice(0, 70));
    }
    const cq = (P as unknown as { COUNT_QUERIES?: Array<{ id: string; sql: string }> }).COUNT_QUERIES ?? [];
    check('COUNT_QUERIES is exported and non-empty', cq.length >= 20, cq.length);
    check('every count statement is accepted', cq.every((q) => { try { P.assertReadOnlySql(q.sql); return true; } catch { return false; } }), cq.filter((q) => { try { P.assertReadOnlySql(q.sql); return false; } catch { return true; } }).map((q) => q.id));
    for (const ok of ['select 1', '  SELECT 1', 'SHOW server_version', 'WITH a AS (SELECT 1) SELECT * FROM a', 'BEGIN READ ONLY', 'ROLLBACK', "SET LOCAL statement_timeout = '20s'", "SET LOCAL lock_timeout = '2s'"]) {
      let accepted = true; try { P.assertReadOnlySql(ok); } catch { accepted = false; }
      check(`accepts: ${ok}`, accepted);
    }
  });
  await unit('allowlist rejects', () => {
    const bad: Array<[string, string]> = [
      ['UPDATE', "UPDATE users SET email = 'x'"],
      ['DROP', 'DROP TABLE users'],
      ['INSERT', "INSERT INTO users (id) VALUES ('x')"],
      ['COPY', "COPY users TO '/tmp/x'"],
      ['CREATE', 'CREATE TABLE x (a int)'],
      ['DELETE', 'DELETE FROM users'],
      ['TRUNCATE', 'TRUNCATE users'],
      ['ALTER', 'ALTER TABLE users ADD COLUMN x int'],
      ['GRANT', 'GRANT ALL ON users TO public'],
      ['SELECT ... INTO', 'SELECT * INTO scratch FROM users'],
      ['stacked: SELECT 1; DROP', 'SELECT 1; DROP TABLE users'],
      ['stacked, lower case', 'select 1;update users set email = null'],
      ['stacked with a trailing semicolon', 'SELECT 1;'],
      ['comment-hidden stack', 'SELECT 1 /* x */; DROP TABLE users'],
      ['line-comment', 'SELECT 1 -- hi'],
      ['data-modifying CTE', 'WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d'],
      ['CTE with insert', "WITH i AS (INSERT INTO users (id) VALUES ('a') RETURNING *) SELECT * FROM i"],
      ['SELECT ... FOR UPDATE', 'SELECT * FROM users FOR UPDATE'],
      ['dollar quoting', 'SELECT $$; DROP TABLE users$$'],
      ['a writing function', "SELECT set_config('default_transaction_read_only', 'off', false)"],
      ['advisory lock', 'SELECT pg_advisory_lock(1)'],
      ['terminate backend', 'SELECT pg_terminate_backend(1)'],
      ['nextval', "SELECT nextval('x')"],
      ['COMMIT', 'COMMIT'],
      ['END', 'END'],
      ['plain BEGIN (read-write)', 'BEGIN'],
      ['BEGIN READ WRITE', 'BEGIN READ WRITE'],
      ['BEGIN READ ONLY; DROP', 'BEGIN READ ONLY; DROP TABLE users'],
      ['SET ROLE', 'SET ROLE postgres'],
      ['SET LOCAL something else', "SET LOCAL default_transaction_read_only = 'off'"],
      ['SET SESSION', "SET SESSION statement_timeout = '0'"],
      ['SET LOCAL with a stacked tail', "SET LOCAL statement_timeout = '1s'; DROP TABLE users"],
      ['VACUUM', 'VACUUM users'],
      ['CALL', 'CALL do_something()'],
      ['DO block', 'DO $$ BEGIN END $$'],
      ['EXPLAIN ANALYZE of a write', 'EXPLAIN ANALYZE UPDATE users SET email = null'],
      ['empty', ''],
      ['whitespace', '   '],
      ['unbalanced quote hiding a payload', "SELECT 'a; DROP TABLE users"],
      ['backslash escape', "SELECT E'\\x3b'"],
    ];
    for (const [name, sql] of bad) {
      let threw = false; try { P.assertReadOnlySql(sql); } catch { threw = true; }
      check(`rejects ${name}`, threw, sql);
    }
    let msg = ''; try { P.assertReadOnlySql("UPDATE users SET email = 'secret@x.invalid'"); } catch (e) { msg = (e as Error).message; }
    check('the rejection does not echo the statement text (it may carry values)', msg.length > 0 && !msg.includes('secret@x.invalid'), msg);
  });

  // ── 7. loopback and arguments ───────────────────────────────────────────
  console.log('\n── 7. loopback gate and arguments ──');
  await unit('loopback', () => {
    for (const h of ['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST', '::1', '[::1]']) check(`loopback: ${h}`, P.isLoopbackHost(h) === true);
    for (const h of ['10.0.0.5', 'db.internal.example', '127.0.0.1.evil.example', 'localhost.evil.example', '0.0.0.0', '128.0.0.1', '', 'postgres.railway.internal', '::2', '127.0.0']) check(`NOT loopback: ${JSON.stringify(h)}`, P.isLoopbackHost(h) === false);
  });
  await unit('args', () => {
    const a = P.parseArgs([]);
    check('no arguments → ok, defaults off', a.ok === true && !a.json && !a.counts && a.volumeBytes === undefined && !a.acknowledged, a);
    const b = P.parseArgs(['--json', '--counts', '--volume-bytes', '524288000', '--i-understand-this-reads-a-real-database']);
    check('all flags parse', b.ok === true && b.json === true && b.counts === true && b.volumeBytes === 524288000 && b.acknowledged === true, b);
    check('--volume-bytes=N form parses', (P.parseArgs(['--volume-bytes=1000']) as { volumeBytes?: number }).volumeBytes === 1000);
    for (const bad of [['--nope'], ['--volume-bytes'], ['--volume-bytes', '0'], ['--volume-bytes', '-5'], ['--volume-bytes', 'abc'], ['--volume-bytes', '1.5'], ['--volume-bytes', '9007199254740993'], ['positional']]) {
      check(`rejects ${JSON.stringify(bad)}`, P.parseArgs(bad).ok === false, P.parseArgs(bad));
    }
    check('--help is recognised', (P.parseArgs(['--help']) as { help?: boolean }).help === true);
    // A connection URL passed as an ARGUMENT (an easy mistake: the tool reads DATABASE_URL from the environment) must never be echoed back.
    for (const bad of [[SECRET_URL], ['--database-url=' + SECRET_URL], ['--json', SECRET_URL], ['--volume-bytes', SECRET_URL], ['--volume-bytes=' + SECRET_URL]]) {
      const r = P.parseArgs(bad);
      check(`an argument carrying a connection URL is refused (${bad[bad.length - 1]!.slice(0, 18)}...)`, r.ok === false, r);
      check('…and its text (user, password, host, port, database) is not in the error message', r.ok === false && leaked(r.error).length === 0 && !/S3CR3T|svc_user|railway_production/.test(r.error), r);
    }
  });

  // ── 8. counts ───────────────────────────────────────────────────────────
  console.log('\n── 8. counts evaluation (aggregates only) ──');
  const goodCounts = () => ({
    rows: { users: 5, workspaces: 4, workspace_members: 5, ad_accounts: 3, campaigns: 30, daily_stats: 900, raw_insights: 400, period_insights: 20, sync_jobs: 12, meta_connections: 2 } as Record<string, number | null>,
    dailyStats: { oldest: '2026-05-01', newest: '2026-08-21' }, syncJobs: { oldest: '2026-05-01T00:00:00Z', newest: '2026-08-21T03:00:00Z', newestCompleted: '2026-08-21T03:01:00Z' },
    syncStatus: { COMPLETED: 10, FAILED: 2 } as Record<string, number>,
    duplicates: { ad_accounts: { groups: 0, extra: 0 }, campaigns: { groups: 0, extra: 0 }, daily_stats: { groups: 0, extra: 0 }, period_insights: { groups: 0, extra: 0 }, workspace_members: { groups: 0, extra: 0 }, meta_connections: { groups: 0, extra: 0 } } as Record<string, { groups: number; extra: number } | null>,
    orphans: { rows: 0, distinctIds: 0 }, iqd: { total: 2, nonCanonical: 0 }, tokens: { adAccounts: 3, metaConnections: 1 }, notRead: [] as Array<{ id: string; reason: string }>,
  });
  await unit('counts', () => {
    const g = P.evaluateCounts(goodCounts(), NOW);
    check('healthy counts → no FAIL and no gating NOT_RUN', g.every((c) => c.status !== 'FAIL' && !(c.gating && c.status === 'NOT_RUN')), g.map((c) => `${c.id}:${c.status}`));
    check('healthy counts → every count check is non-blocking or PASS', P.combineVerdict([...P.decideVerdict(healthy()).checks, ...g]) === 'GO');

    const d = goodCounts(); d.duplicates['campaigns'] = { groups: 2, extra: 3 };
    const dc = P.evaluateCounts(d, NOW);
    check('duplicate rows against a unique key → FAIL and gating (upserts depend on the key)', dc.some((c) => c.status === 'FAIL' && c.gating) && P.combineVerdict([...P.decideVerdict(healthy()).checks, ...dc]) === 'NO-GO', dc.map((c) => `${c.id}:${c.status}`));

    const o = goodCounts(); o.orphans = { rows: 40, distinctIds: 7 };
    const oc = P.evaluateCounts(o, NOW);
    const orphan = oc.find((c) => c.id.includes('orphan'));
    check('orphaned campaign daily_stats → WARN with ROW and DISTINCT-ID counts only', orphan?.status === 'WARN' && /40/.test(orphan.reason) && /7/.test(orphan.reason), orphan);
    check('…the scheduler\'s GLOBAL cleanup is named in the warning', /global|scheduler|integrity sweep/i.test(orphan?.reason ?? ''), orphan?.reason);
    check('…WARN does not block', P.combineVerdict([...P.decideVerdict(healthy()).checks, ...oc]) === 'GO');

    const q = goodCounts(); q.iqd = { total: 4, nonCanonical: 3 };
    const qc = P.evaluateCounts(q, NOW).find((c) => c.id.includes('iqd'));
    check('IQD accounts whose factor is not 1 → WARN with the number', qc?.status === 'WARN' && /3/.test(qc.reason), qc);

    const e = goodCounts(); e.rows['daily_stats'] = 0;
    check('an empty key table → WARN', P.evaluateCounts(e, NOW).some((c) => c.status === 'WARN' && /daily_stats/.test(c.reason + (c.details ?? []).join(' '))));

    const s = goodCounts(); s.dailyStats = { oldest: '2026-05-01', newest: '2026-06-01' };
    check('newest daily_stats older than 7 days → WARN with the age', P.evaluateCounts(s, NOW).some((c) => c.status === 'WARN' && /\d+ days/.test(c.reason)), P.evaluateCounts(s, NOW).map((c) => c.reason));

    const n = goodCounts(); n.notRead = [{ id: 'rows.users', reason: 'lock_timeout' }]; n.rows['users'] = null;
    const nc = P.evaluateCounts(n, NOW);
    check('a REQUESTED count that could not be read → NOT_RUN and gating (never silently skipped)', nc.some((c) => c.status === 'NOT_RUN' && c.gating) && P.combineVerdict([...P.decideVerdict(healthy()).checks, ...nc]) === 'NO-GO', nc.map((c) => `${c.id}:${c.status}:${c.gating}`));

    const blob = JSON.stringify(P.evaluateCounts(o, NOW));
    check('the counts evaluation carries no id-shaped values (cuid) — counts only', !/c[a-z0-9]{24}/.test(blob), blob.slice(0, 200));
  });

  // ── 9. main() against a fake connection ─────────────────────────────────
  console.log('\n── 9. main() against a fake connection ──');
  await unit('healthy run', async () => {
    const { conn, sent, ended } = fakeConn();
    const c = cap();
    const code = await P.main([], { DATABASE_URL: 'postgresql://svc_user:S3CR3T-pw@127.0.0.1:6543/railway_production_db' }, c.io, realisticDeps(conn));
    check('healthy database → exit 0', code === 0, { code, out: c.out().slice(0, 400), err: c.err() });
    check('human output states the verdict GO', /VERDICT: GO/.test(c.out()), c.out().slice(-200));
    check('every check line carries one of PASS / FAIL / WARN / NOT_RUN', c.out().split('\n').filter((l) => /^\[/.test(l)).every((l) => /^\[(PASS|FAIL|WARN|NOT_RUN)\]/.test(l)) && /\[PASS\]/.test(c.out()), c.out().slice(0, 300));
    check('the first statement is BEGIN READ ONLY', sent[0] === 'BEGIN READ ONLY', sent[0]);
    check('the last statement is ROLLBACK', sent[sent.length - 1] === 'ROLLBACK', sent[sent.length - 1]);
    check('COMMIT is never sent', !sent.some((s) => /^\s*(COMMIT|END)\b/i.test(s)), sent);
    check('SET LOCAL statement_timeout and lock_timeout are sent right after BEGIN', sent.slice(1, 4).some((s) => /statement_timeout/.test(s)) && sent.slice(1, 4).some((s) => /lock_timeout/.test(s)), sent.slice(0, 4));
    check('every statement sent passes the read-only allowlist', sent.every((s) => { try { P.assertReadOnlySql(s); return true; } catch { return false; } }), sent.filter((s) => { try { P.assertReadOnlySql(s); return false; } catch { return true; } }));
    check('the connection is closed', ended.n === 1, ended.n);
    check('the database name is printed redacted, never in full', /rai/.test(c.all()) && !c.all().includes('railway_production_db'), c.out().slice(0, 300));
    check('no password, user, host, port or URL anywhere in the output', leaked(c.all()).length === 0, leaked(c.all()));
  });

  await unit('json', async () => {
    const { conn } = fakeConn();
    const c = cap();
    const code = await P.main(['--json'], { DATABASE_URL: SECRET_URL.replace('db.internal.example', '127.0.0.1') }, c.io, realisticDeps(conn));
    let j: any = null; try { j = JSON.parse(c.out()); } catch { /* checked below */ }
    check('--json prints one parseable JSON document', j !== null, c.out().slice(0, 200));
    check('--json: verdict GO, exit 0, checks array', code === 0 && j?.verdict === 'GO' && Array.isArray(j?.checks) && j.checks.length >= 5, j && { verdict: j.verdict });
    check('--json: no secret in any value', leaked(c.out()).length === 0, leaked(c.out()));
  });

  await unit('verdict mapping through main', async () => {
    const mk = async (opts: FakeOpts, args: string[] = []) => { const f = fakeConn(opts); const c = cap(); const code = await P.main(args, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/somedatabase' }, c.io, realisticDeps(f.conn)); return { code, c, f }; };
    const ok = await mk({});
    check('baseline GO', ok.code === 0);
    const wrong = await mk({ history: SHIPPED.map((name, i) => ({ name: i === 3 ? '29990101000000_bogus' : name, checksum: 'x', finished: true })) });
    check('equal-count wrong history → exit 1 NO-GO', wrong.code === 1 && /VERDICT: NO-GO/.test(wrong.c.out()), wrong.c.out().slice(-200));
    const drift = await mk({ history: SHIPPED.map((name, i) => ({ name, checksum: i === 1 ? sha('edited') : sha(sqlOf(name)), finished: true })) });
    check('checksum drift → exit 1 NO-GO', drift.code === 1 && /\[FAIL\] checksums/.test(drift.c.out()), drift.c.out().slice(0, 400));
    const dropped = await mk({ columns: [...REQ_COLS].flatMap(([t, cs]) => cs.filter((c) => !(t === 'users' && c === 'email')).map((c) => ({ t, c }))) });
    check('dropped column → exit 1 NO-GO', dropped.code === 1 && /users\.email/.test(dropped.c.out()), dropped.c.out().slice(0, 400));
    const empty = await mk({ tables: [], history: null, columns: [] });
    check('empty database → exit 1 NO-GO', empty.code === 1, empty.c.out().slice(0, 300));
    const full = await mk({ dbBytes: '500000000' }, ['--volume-bytes', '524288000']);
    check('--volume-bytes with a 95.4% full volume → exit 1 NO-GO', full.code === 1 && /\[FAIL\] volume/.test(full.c.out()), full.c.out().slice(0, 500));
    const warn = await mk({ dbBytes: '430000000' }, ['--volume-bytes', '524288000']);
    check('--volume-bytes with an 82% full volume → exit 0, WARN printed', warn.code === 0 && /\[WARN\] volume/.test(warn.c.out()), warn.c.out().slice(0, 500));
    const noCounts = await mk({});
    const CQ = (P as unknown as { COUNT_QUERIES: Array<{ sql: string }> }).COUNT_QUERIES;
    check('without --counts no count statement is sent', !noCounts.f.sent.some((s) => CQ.some((q) => q.sql === s)), noCounts.f.sent.length);
    const withCounts = await mk({ forCounts: true }, ['--counts']);
    check('with --counts, every count statement IS sent, still read-only', CQ.every((q) => withCounts.f.sent.includes(q.sql)) && withCounts.code === 0, { code: withCounts.code, out: withCounts.c.out().slice(-300) });
  });

  await unit('real build data end to end', async () => {
    const names = H.shippedMigrationNames()!;
    const dir = path.join(ROOT, 'prisma', 'migrations');
    const history = names.map((name) => ({ name, checksum: sha(readFileSync(path.join(dir, name, 'migration.sql'))), finished: true }));
    const cols = [...H.requiredColumnNames()!].flatMap(([t, cs]) => cs.map((c) => ({ t, c })));
    const { conn } = fakeConn({ history, tables: [...H.requiredTableNames()!, '_prisma_migrations'], columns: cols });
    const c = cap();
    const code = await P.main([], { DATABASE_URL: 'postgresql://u:p@localhost:5432/d' }, c.io, { connect: async () => conn });
    check('the REAL shipped list, REAL file hashes, REAL required tables/columns and a database that matches them → GO', code === 0, { code, out: c.out().slice(0, 800), err: c.err() });
    const f2 = fakeConn({ history: history.map((h, i) => (i === 7 ? { ...h, checksum: sha('edited') } : h)), tables: [...H.requiredTableNames()!, '_prisma_migrations'], columns: cols });
    const c2 = cap();
    const code2 = await P.main([], { DATABASE_URL: 'postgresql://u:p@localhost:5432/d' }, c2.io, { connect: async () => f2.conn });
    check('…and one edited checksum among the real 41 → NO-GO naming that migration', code2 === 1 && c2.out().includes(names[7]!), { code2 });
  });

  await unit('no interpolation of database-derived text into SQL', async () => {
    const evil = "x'; DROP TABLE users; --";
    const f = fakeConn({
      forCounts: true,
      tables: [...REQ_TABLES, '_prisma_migrations', evil],
      history: [...SHIPPED.map((name) => ({ name, checksum: sha(sqlOf(name)), finished: true })), { name: evil, checksum: 'x', finished: true }],
      columns: [...[...REQ_COLS].flatMap(([t, cs]) => cs.map((c) => ({ t, c }))), { t: evil, c: evil }],
      largest: [{ name: evil, bytes: '10' }],
    });
    const c = cap();
    const code = await P.main(['--counts'], { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/d' }, c.io, realisticDeps(f.conn));
    check('hostile table/migration/column names do not stop the run (ahead → GO)', code === 0, { code, out: c.out().slice(0, 400), err: c.err() });
    check('…and NO statement sent contains any part of the hostile name', !f.sent.some((s) => /DROP TABLE users/.test(s) || s.includes(evil)), f.sent.filter((s) => /DROP/.test(s)));
    check('…and the hostile text is not echoed verbatim to the operator either', !c.all().includes(evil) && !/DROP TABLE users; --/.test(c.all()), c.all().slice(0, 300));
  });

  await unit('connection failures', async () => {
    const cases: Array<[string, () => Error]> = [
      ['connection refused', () => Object.assign(new Error('connect ECONNREFUSED db.internal.example:6543 for svc_user password S3CR3T-pw ' + MARKER), { code: 'ECONNREFUSED' })],
      ['DNS failure', () => Object.assign(new Error('getaddrinfo ENOTFOUND db.internal.example ' + MARKER), { code: 'ENOTFOUND' })],
      ['auth failure', () => Object.assign(new Error('password authentication failed for user "svc_user" (S3CR3T-pw)'), { code: '28P01' })],
      ['database does not exist', () => Object.assign(new Error('database "railway_production_db" does not exist'), { code: '3D000' })],
      ['unclassified', () => new Error(`weird failure at ${SECRET_URL} ${MARKER}`)],
    ];
    for (const [name, mk] of cases) {
      const c = cap();
      const code = await P.main(['--i-understand-this-reads-a-real-database'], { DATABASE_URL: SECRET_URL }, c.io, { connect: async () => { throw mk(); }, readBuild: () => ({ names: [...SHIPPED], fileHashes: HASHES(), requiredTables: [...REQ_TABLES], requiredColumns: new Map(REQ_COLS) }) });
      check(`${name} → exit 2 (NOT RUN), not NO-GO`, code === 2, code);
      check(`${name} → says NOT RUN`, /NOT RUN/.test(c.all()), c.all());
      check(`${name} → no host, user, password, port, database name or URL printed`, leaked(c.all()).length === 0, leaked(c.all()));
      check(`${name} → driver message text is never printed (a marker the scrub does not know cannot appear)`, !c.all().includes(MARKER), c.all());
    }
    const c = cap();
    const code = await P.main(['--json', '--i-understand-this-reads-a-real-database'], { DATABASE_URL: SECRET_URL }, c.io, { connect: async () => { throw Object.assign(new Error(SECRET_URL), { code: 'ECONNREFUSED' }); }, readBuild: () => ({ names: [...SHIPPED], fileHashes: HASHES(), requiredTables: [...REQ_TABLES], requiredColumns: new Map(REQ_COLS) }) });
    let j: any = null; try { j = JSON.parse(c.out()); } catch { /* below */ }
    check('--json + cannot connect → JSON {verdict: NOT_RUN}, exit 2, no secrets', code === 2 && j?.verdict === 'NOT_RUN' && leaked(c.all()).length === 0, { code, out: c.out() });
  });

  await unit('a failing statement mid-run', async () => {
    const f = fakeConn({ failOn: 'history', failCode: '57014' });
    const c = cap();
    const code = await P.main([], { DATABASE_URL: 'postgresql://svc_user:S3CR3T-pw@127.0.0.1:6543/railway_production_db' }, c.io, realisticDeps(f.conn));
    check('a statement that times out → exit 1 (a NOT_RUN gating check), not 0', code === 1, { code, out: c.out().slice(0, 500) });
    check('…the check says NOT_RUN and names the closed-vocabulary reason (statement_timeout)', /\[NOT_RUN\]/.test(c.out()) && /statement_timeout/.test(c.out()), c.out().slice(0, 600));
    check('…ROLLBACK is still the last statement and the connection is closed', f.sent[f.sent.length - 1] === 'ROLLBACK' && f.ended.n === 1, f.sent.slice(-3));
    const idx = f.sent.indexOf(P.SQL['history']!);
    check('…after the aborted statement nothing but ROLLBACK is sent (the transaction is dead)', f.sent.slice(idx + 1).every((s) => s === 'ROLLBACK'), f.sent.slice(idx + 1));
    check('…the driver message (host, user, password, marker) is not printed', leaked(c.all()).length === 0 && !c.all().includes('S3CR3T') && !c.all().includes(MARKER), leaked(c.all()));
  });

  await unit('guard in the code path', async () => {
    const cq = (P as unknown as { COUNT_QUERIES: Array<{ id: string; sql: string; needs: unknown[] }> }).COUNT_QUERIES;
    cq.push({ id: 'rows.evil_probe', sql: 'DELETE FROM users', needs: [['users']] });
    try {
      const f = fakeConn({ forCounts: true });
      const c = cap();
      const code = await P.main(['--counts'], { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/d' }, c.io, realisticDeps(f.conn));
      check('a statement that is not read-only injected into the count list is NEVER sent to the database', !f.sent.some((s) => /DELETE/.test(s)), f.sent.filter((s) => /DELETE/.test(s)));
      check('…the run reports guard_refused and fails closed (exit 1)', /guard_refused/.test(c.out()) && code === 1, { code, out: c.out().slice(-400) });
      check('…ROLLBACK still ends the session', f.sent[f.sent.length - 1] === 'ROLLBACK', f.sent.slice(-2));
    } finally { cq.pop(); }
  });

  await unit('last-resort scrub', async () => {
    const f = fakeConn({ history: [...SHIPPED.map((name) => ({ name, checksum: sha(sqlOf(name)), finished: true })), { name: 'x_S3CR3T-pw_y', checksum: 'x', finished: true }] });
    const c = cap();
    await P.main([], { DATABASE_URL: SECRET_URL.replace('db.internal.example', '127.0.0.1') }, c.io, realisticDeps(f.conn));
    check('a database-derived name that happens to contain the password is scrubbed from the output', !c.all().includes('S3CR3T-pw') && c.all().includes('[redacted]'), c.all().slice(0, 500));
  });

  await unit('refusals', async () => {
    const c = cap();
    let connected = 0;
    const deps = { connect: async () => { connected++; return fakeConn().conn; }, readBuild: () => ({ names: [...SHIPPED], fileHashes: HASHES(), requiredTables: [...REQ_TABLES], requiredColumns: new Map(REQ_COLS) }) };
    const code = await P.main([], { DATABASE_URL: SECRET_URL }, c.io, deps);
    check('a non-loopback host without the acknowledgement flag → exit 2', code === 2, code);
    check('…and no connection was even attempted', connected === 0, connected);
    check('…the refusal names the flag to pass, and prints no host/user/password', /--i-understand-this-reads-a-real-database/.test(c.all()) && leaked(c.all()).length === 0, c.all());
    const c2 = cap();
    const code2 = await P.main(['--i-understand-this-reads-a-real-database'], { DATABASE_URL: SECRET_URL }, c2.io, deps);
    check('with the flag the connection is attempted', connected === 1, connected);
    check('…and the output still names no host/user/password', leaked(c2.all()).length === 0, { code2, leaked: leaked(c2.all()) });
    const c3 = cap();
    check('no DATABASE_URL → exit 2', (await P.main([], {}, c3.io, deps)) === 2 && /NOT RUN/.test(c3.all()));
    const c4 = cap();
    check('an unparseable DATABASE_URL → exit 2 and the value is not echoed', (await P.main([], { DATABASE_URL: 'not a url S3CR3T-pw' }, c4.io, deps)) === 2 && !c4.all().includes('S3CR3T-pw'), c4.all());
    const c5 = cap();
    check('a non-postgres URL → exit 2', (await P.main([], { DATABASE_URL: 'mysql://u:p@127.0.0.1/d' }, c5.io, deps)) === 2);
    const c6 = cap();
    check('a bad flag → exit 2 before any connection', (await P.main(['--bogus'], { DATABASE_URL: 'postgresql://u:p@127.0.0.1/d' }, c6.io, deps)) === 2 && connected === 1);
    const c7 = cap();
    check('--help → exit 0 and prints usage', (await P.main(['--help'], {}, c7.io, deps)) === 0 && /Usage/.test(c7.all()));
  });

  // ── 10. the real CLI as a subprocess ────────────────────────────────────
  console.log('\n── 10. the real CLI (subprocess, no database needed) ──');
  const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx');
  const script = path.join(ROOT, 'scripts', 'ops', 'preflight-schema.ts');
  check('tsx and the script exist', existsSync(tsx) && existsSync(script), { tsx: existsSync(tsx), script: existsSync(script) });
  const run = (args: string[], env: Record<string, string>) => {
    const r = spawnSync(tsx, [script, ...args], { cwd: ROOT, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env }, encoding: 'utf8', timeout: 60_000 });
    return { code: r.status, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
  };
  await unit('subprocess', () => {
    const a = run([], {});
    check('no DATABASE_URL → exit 2 "NOT RUN"', a.code === 2 && /NOT RUN/.test(a.text), a);
    const b = run(['--bogus'], { DATABASE_URL: 'postgresql://svc_user:S3CR3T-pw@127.0.0.1:1/railway_production_db' });
    check('a bad flag → exit 2', b.code === 2 && leaked(b.text).length === 0, b);
    const c = run([], { DATABASE_URL: SECRET_URL });
    check('non-loopback without the flag → exit 2, nothing leaked', c.code === 2 && /--i-understand-this-reads-a-real-database/.test(c.text) && leaked(c.text).length === 0, c);
    const d = run([], { DATABASE_URL: 'postgresql://svc_user:S3CR3T-pw@127.0.0.1:1/railway_production_db' });
    check('a closed loopback port → exit 2 "NOT RUN", nothing leaked', d.code === 2 && /NOT RUN/.test(d.text) && leaked(d.text).length === 0, d);
    const e = run(['--json'], { DATABASE_URL: 'postgresql://svc_user:S3CR3T-pw@127.0.0.1:1/railway_production_db' });
    let j: any = null; try { j = JSON.parse(e.text.trim().split('\n').filter((l) => l.startsWith('{')).join('')); } catch { /* below */ }
    check('--json on a closed port → a JSON document with verdict NOT_RUN, exit 2', e.code === 2 && j?.verdict === 'NOT_RUN', e);
    const h = run(['--help'], {});
    check('--help → exit 0', h.code === 0 && /Usage/.test(h.text), h);
    const u = run([SECRET_URL], {});
    check('a connection URL passed as an ARGUMENT → exit 2 and not one character of it is echoed', u.code === 2 && leaked(u.text).length === 0 && !/svc_user|S3CR3T|db\.internal/.test(u.text), u);
    const u2 = run(['postgresql://postgres:Zq9Leak7731@host.proxy.example:6543/railway'], {});
    check('…the same for a realistic URL whose user and password fall inside the first 40 characters (the old echo printed them)', u2.code === 2 && !/Zq9Leak|postgres:|host\.proxy/.test(u2.text), u2);
    const u3 = run(['--database-url=postgresql://postgres:Zq9Leak7731@host.proxy.example:6543/railway'], {});
    check('…and for --database-url=<url>: only the flag NAME may be named', u3.code === 2 && !/Zq9Leak|postgres:|host\.proxy/.test(u3.text) && /--database-url/.test(u3.text), u3);
  });

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('test crashed:', e); process.exit(1); });
