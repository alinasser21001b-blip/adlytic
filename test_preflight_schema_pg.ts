// ═════════════════════════════════════════════════════════════════════════
//  test_preflight_schema_pg.ts — scripts/ops/preflight-schema.ts on a REAL Postgres.
//
//  NOT part of test:all (CI has no database). Run:
//
//    PREFLIGHT_PG_URL=postgresql://adlytic@127.0.0.1:54329/postgres npm run test:preflight-schema-pg
//
//  It REFUSES to run unless the host is loopback, creates only databases named
//  adlytic_repro_ops_t_* (from the migrated template adlytic_repro_heal, which is
//  only ever READ as a template), drops them again, and exits 2 ("NOT RUN") —
//  never a silent green — when it cannot connect or the template is unsuitable.
//  It also creates one throw-away role, adlytic_repro_ops_ro, and drops it.
//
//  What it proves that the no-database test cannot
//    · the preflight's verdict for every state, on the real catalog (healthy, empty, failed
//      row, behind, equal-count wrong history, ahead, dropped column, dropped table, checksum
//      edited in _prisma_migrations, a migration FILE edited after apply, CRLF checkout,
//      rolled-back-and-reapplied, duplicates against a dropped unique index)
//    · its state is the same word /api/health's probeReadiness returns for the same database
//    · the checksum it computes equals the one `prisma migrate deploy` stored, for all rows
//    · READ-ONLY: every table's content AND xmin are identical before and after every run,
//      the same method DOES see a write (positive control), Postgres itself refuses writes
//      inside the BEGIN READ ONLY the script sends, and a role that cannot write works
//    · a lock held by a writer cannot hang it (lock_timeout)
//    · --counts reports aggregates only
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))?.slice(0, 700)}`); }
}
async function unit(name: string, fn: () => Promise<void>) {
  try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name} — threw: ${(e as Error).message}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

const ROOT = __dirname;
const MIG_DIR = path.join(ROOT, 'prisma', 'migrations');
const TEMPLATE = process.env['PREFLIGHT_PG_TEMPLATE'] ?? 'adlytic_repro_heal';
const OPS_DB = /^adlytic_repro_ops_t_[a-z0-9_]{1,40}$/;
const RO_ROLE = 'adlytic_repro_ops_ro';

let admin: URL;
try { admin = new URL(process.env['PREFLIGHT_PG_URL'] ?? 'postgresql://adlytic@127.0.0.1:54329/postgres'); } catch { console.error('NOT RUN: PREFLIGHT_PG_URL is not a valid URL'); process.exit(2); }
const adminHost = admin.hostname.replace(/^\[|\]$/g, '');
if (!['127.0.0.1', 'localhost', '::1'].includes(adminHost)) { console.error('REFUSED: the host must be loopback'); process.exit(2); }
if (!/^adlytic_repro_/.test(TEMPLATE)) { console.error('REFUSED: the template database must be named adlytic_repro_*'); process.exit(2); }

const dbUrl = (db: string, user = decodeURIComponent(admin.username)) => `postgresql://${encodeURIComponent(user)}@${adminHost.includes(':') ? `[${adminHost}]` : adminHost}:${admin.port || 5432}/${db}`;

type PgClient = import('pg').Client;
let pgMod: typeof import('pg');
let P: typeof import('./scripts/ops/preflight-schema');
let H: typeof import('./src/lib/dbHealth');

async function client(db: string, user?: string): Promise<PgClient> {
  const c = new pgMod.Client({ host: adminHost, port: Number(admin.port) || 5432, user: user ?? decodeURIComponent(admin.username), database: db, connectionTimeoutMillis: 4000 });
  c.on('error', () => { /* ignore */ });
  await c.connect();
  return c;
}
async function withDb<T>(db: string, fn: (c: PgClient) => Promise<T>, user?: string): Promise<T> {
  const c = await client(db, user);
  try { return await fn(c); } finally { await c.end(); }
}

const created: string[] = [];
async function createDb(name: string, template?: string): Promise<void> {
  if (!OPS_DB.test(name)) throw new Error(`refusing to touch database ${name}`);
  await withDb('postgres', async (c) => {
    await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    for (let i = 0; ; i++) {
      try { await c.query(`CREATE DATABASE "${name}"${template ? ` TEMPLATE "${template}"` : ''}`); break; }
      catch (e) {
        if ((e as { code?: string }).code === '55006' && i < 10) { await sleep(1000); continue; }   // template briefly in use: wait, never kill its sessions
        throw e;
      }
    }
  });
  created.push(name);
}
async function dropDb(name: string): Promise<void> {
  if (!OPS_DB.test(name)) throw new Error(`refusing to touch database ${name}`);
  await withDb('postgres', (c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}

/** Content + xmin digest of every table in schema public. xmin changes on ANY write, including an UPDATE that changes nothing. */
async function snapshot(db: string): Promise<Record<string, string>> {
  return withDb(db, async (c) => {
    const tabs = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map((r) => r.tablename as string);
    const out: Record<string, string> = {};
    for (const t of tabs) {
      const r = await c.query(`SELECT count(*)::text AS n, md5(coalesce(string_agg(md5(x::text) || x.xmin::text, ',' ORDER BY x.ctid), '')) AS h FROM public.${pgMod.escapeIdentifier(t)} x`);
      out[t] = `${r.rows[0].n}:${r.rows[0].h}`;
    }
    return out;
  });
}
const sameSnapshot = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a) === JSON.stringify(b);
const diffTables = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((t) => a[t] !== b[t]);

interface Run { code: number; json: any; text: string; err: string; ms: number }
async function pf(db: string, args: string[] = [], user?: string, json = true): Promise<Run> {
  const out: string[] = []; const err: string[] = [];
  const t0 = Date.now();
  const code = await P.main(json ? ['--json', ...args] : args, { DATABASE_URL: dbUrl(db, user) }, { out: (s) => out.push(s), err: (s) => err.push(s) });
  const text = out.join('\n');
  let parsed: any = null; if (json) { try { parsed = JSON.parse(text); } catch { /* leave null */ } }
  return { code, json: parsed, text, err: err.join('\n'), ms: Date.now() - t0 };
}
const status = (r: Run, id: string): string | undefined => r.json?.checks?.find((c: any) => c.id === id)?.status;
const checkOf = (r: Run, id: string): any => r.json?.checks?.find((c: any) => c.id === id);
const detailsOf = (r: Run, id: string): string => (checkOf(r, id)?.details ?? []).join(' ');

/** What the real /api/health gate says about this database. */
async function healthState(db: string): Promise<{ state: string; ready: boolean }> {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pool = new pgMod.Pool({ host: adminHost, port: Number(admin.port) || 5432, user: decodeURIComponent(admin.username), database: db, max: 2, connectionTimeoutMillis: 4000 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try { H.__resetDbHealthStateForTests(); const r = await H.probeReadiness(prisma, { cacheMs: 0 }); return { state: r.state, ready: r.ready }; }
  finally { await prisma.$disconnect(); await pool.end(); }
}

/** One scenario: a fresh database from the template, a setup, a preflight run, and the invariants every run must keep. */
async function scenario(id: string, setup: ((c: PgClient) => Promise<void>) | null, args: string[], then: (r: Run, db: string) => Promise<void> | void, opts: { template?: string | null; keep?: boolean } = {}): Promise<string> {
  const db = `adlytic_repro_ops_t_${id}`;
  console.log(`\n── ${id} ──`);
  await createDb(db, opts.template === null ? undefined : (opts.template ?? TEMPLATE));
  // A few synthetic rows, so "nothing was written" is checked against data and not against empty tables
  // (an UPDATE that matches no row would leave an empty table looking untouched).
  if (opts.template !== null) await withDb(db, async (c) => {
    await c.query(`insert into users (id, email, password_hash, name, updated_at) values ('u_${id}', '${id}@repro.invalid', 'x', 'Synthetic', now())`);
    await c.query(`insert into workspaces (id, name, updated_at) values ('w_${id}', 'Synthetic', now())`);
    await c.query(`insert into workspace_members (id, workspace_id, user_id) values ('m_${id}', 'w_${id}', 'u_${id}')`);
  });
  if (setup) await withDb(db, setup);
  const before = await snapshot(db);
  const r = await pf(db, args);
  const after = await snapshot(db);
  check(`${id}: READ-ONLY — every table's content and xmin are identical before and after the run`, sameSnapshot(before, after), diffTables(before, after));
  check(`${id}: the run produced a JSON document and a documented exit code (0 or 1)`, r.json !== null && (r.code === 0 || r.code === 1), { code: r.code, text: r.text.slice(0, 200), err: r.err });
  if (r.json) {
    check(`${id}: exit code ${r.code} matches the verdict ${r.json.verdict}`, (r.code === 0) === (r.json.verdict === 'GO'), r.json.verdict);
    const h = await healthState(db);
    check(`${id}: preflight state "${r.json.state}" equals the /api/health state "${h.state}"`, r.json.state === h.state, { preflight: r.json.state, health: h.state });
    check(`${id}: a GO is never given where /api/health would answer 503`, r.json.verdict !== 'GO' || h.ready, { verdict: r.json.verdict, ready: h.ready });
  }
  try { await then(r, db); } catch (e) { fail++; console.log(`  ✗ ${id}: the assertions threw — ${(e as Error).message}`); }
  if (!opts.keep) await dropDb(db);
  return db;
}

// ── the synthetic two-tenant seed for --counts ───────────────────────────
interface Seeded { users: number; workspaces: number; members: number; accounts: number; campaigns: number; dailyStats: number; rawInsights: number; periodInsights: number; syncJobs: number; metaConnections: number; orphanRows: number; orphanIds: number; iqdTotal: number; iqdNonCanonical: number; tokenAccounts: number; tokenConnections: number }
async function seed(db: string): Promise<Seeded> {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pool = new pgMod.Pool({ host: adminHost, port: Number(admin.port) || 5432, user: decodeURIComponent(admin.username), database: db, max: 3 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };
  const s: Seeded = { users: 0, workspaces: 0, members: 0, accounts: 0, campaigns: 0, dailyStats: 0, rawInsights: 0, periodInsights: 0, syncJobs: 0, metaConnections: 0, orphanRows: 0, orphanIds: 0, iqdTotal: 0, iqdNonCanonical: 0, tokenAccounts: 0, tokenConnections: 0 };
  try {
    for (const tenant of ['A', 'B']) {
      const user = await prisma.user.create({ data: { email: `tenant-${tenant.toLowerCase()}@repro.invalid`, passwordHash: 'x', name: `Tenant ${tenant}`, isActive: true } }); s.users++;
      const ws = await prisma.workspace.create({ data: { name: `Synthetic ${tenant}` } }); s.workspaces++;
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' } }); s.members++;
      const conn = await prisma.metaConnection.create({ data: { workspaceId: ws.id, businessId: `biz_${tenant}`, accessTokenEncrypted: 'v1:synthetic-not-a-real-token', grantedScopes: [], grantedAssetIds: [] } }); s.metaConnections++; s.tokenConnections++;
      const accounts = tenant === 'A'
        ? [{ currency: 'IQD', factor: 100, token: true }]                                   // IQD, non-canonical factor
        : [{ currency: 'USD', factor: 100, token: false }, { currency: 'IQD', factor: 1, token: true }];
      let k = 0;
      for (const a of accounts) {
        const acct = await prisma.adAccount.create({
          data: { workspaceId: ws.id, externalAccountId: `act_${tenant}${++k}`, name: `Synthetic account ${tenant}${k}`, currency: a.currency, currencyMinorFactor: a.factor, timezone: 'UTC', metaAccountStatus: 1, lastSyncedAt: new Date(), ...(a.token ? { accessTokenEncrypted: 'v1:synthetic-not-a-real-token', connectionId: conn.id } : {}) },
        }); s.accounts++;
        if (a.currency === 'IQD') { s.iqdTotal++; if (a.factor !== 1) s.iqdNonCanonical++; }
        if (a.token) s.tokenAccounts++;
        await prisma.dailyStat.create({ data: { entityType: 'ACCOUNT', entityId: acct.id, date: day(1), spend: 150000n, impressions: 25000n } }); s.dailyStats++;
        for (let c = 1; c <= 2; c++) {
          const camp = await prisma.campaign.create({ data: { adAccountId: acct.id, externalCampaignId: `cmp_${tenant}${k}_${c}`, name: `Synthetic campaign ${tenant}${k}-${c}` } }); s.campaigns++;
          for (const d of [1, 2]) { await prisma.dailyStat.create({ data: { entityType: 'CAMPAIGN', entityId: camp.id, date: day(d), spend: 75000n, impressions: 12000n } }); s.dailyStats++; }
          await prisma.rawInsight.create({ data: { entityType: 'CAMPAIGN', entityId: camp.id, date: day(1), rawJson: { spend: '750.00' } } }); s.rawInsights++;
          await prisma.periodInsight.create({ data: { entityType: 'CAMPAIGN', entityId: camp.id, since: day(7), until: day(1), reach: 9000n } }); s.periodInsights++;
        }
        await prisma.syncJob.create({ data: { adAccountId: acct.id, status: 'COMPLETED', windowDays: 3, windowSince: day(3), windowUntil: day(1), startedAt: new Date(Date.now() - 2 * 864e5), completedAt: new Date(Date.now() - 2 * 864e5 + 60_000) } }); s.syncJobs++;
        if (tenant === 'B') { await prisma.syncJob.create({ data: { adAccountId: acct.id, status: 'FAILED', windowDays: 3, windowSince: day(3), windowUntil: day(1), error: 'synthetic' } }); s.syncJobs++; }
      }
      // orphaned campaign stats: the campaign row is gone, its daily_stats remain (tenant A: 2 ids, 3 rows; tenant B: 1 id, 1 row)
      const orphanIds = tenant === 'A' ? ['orphan_a_1', 'orphan_a_2'] : ['orphan_b_1'];
      for (const [i, id] of orphanIds.entries()) for (const d of tenant === 'A' && i === 0 ? [3, 4] : [3]) { await prisma.dailyStat.create({ data: { entityType: 'CAMPAIGN', entityId: id, date: day(d), spend: 1000n } }); s.dailyStats++; s.orphanRows++; }
      s.orphanIds += orphanIds.length;
    }
  } finally { await prisma.$disconnect(); await pool.end(); }
  return s;
}

async function main() {
  pgMod = (await import('pg')).default as unknown as typeof import('pg');
  P = await import('./scripts/ops/preflight-schema');
  H = await import('./src/lib/dbHealth');

  // ── connect, or NOT RUN ────────────────────────────────────────────────
  try { await withDb('postgres', (c) => c.query('select 1')); }
  catch { console.error('NOT RUN: cannot reach the synthetic Postgres (set PREFLIGHT_PG_URL; the test never starts one)'); process.exit(2); }
  const tpl = await withDb('postgres', (c) => c.query(`select count(*)::int as n from pg_database where datname = $1`, [TEMPLATE]));
  if (tpl.rows[0].n !== 1) { console.error(`NOT RUN: template database ${TEMPLATE} does not exist`); process.exit(2); }

  const SHIPPED = H.shippedMigrationNames()!;
  check('precondition: this build ships migrations', SHIPPED.length > 30, SHIPPED.length);

  try {
    // ── ground truth: the checksum Prisma stored is sha256(file bytes) ────
    console.log('\n── 0. the checksum this tool computes is the one `prisma migrate deploy` stored ──');
    await createDb('adlytic_repro_ops_t_migrated');
    const mig = 'adlytic_repro_ops_t_migrated';
    const dep = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], { cwd: ROOT, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', DATABASE_URL: dbUrl(mig) }, encoding: 'utf8', timeout: 120_000 });
    check('prisma migrate deploy on an empty database exits 0 and applies everything', dep.status === 0 && /successfully applied/.test(`${dep.stdout}${dep.stderr}`), { status: dep.status, tail: `${dep.stdout}${dep.stderr}`.slice(-300) });
    const stored = await withDb(mig, async (c) => (await c.query(`select migration_name as n, checksum as c from _prisma_migrations order by 1`)).rows as Array<{ n: string; c: string }>);
    const mismatches = stored.filter((r) => r.c !== sha(readFileSync(path.join(MIG_DIR, r.n, 'migration.sql'))));
    check(`sha256(raw file bytes) equals the stored checksum for ALL ${stored.length} rows (computed here, without the module under test)`, stored.length === SHIPPED.length && mismatches.length === 0, { rows: stored.length, mismatches: mismatches.map((m) => m.n) });
    const hashes = Object.fromEntries(SHIPPED.map((n) => [n, P.sha256Variants(readFileSync(path.join(MIG_DIR, n, 'migration.sql'))).sha256]));
    check('the module\'s own sha256Variants().sha256 agrees for every shipped file', SHIPPED.every((n) => hashes[n] === stored.find((r) => r.n === n)?.c));

    const r0 = await pf(mig, ['--counts']);
    check('a database migrated by prisma migrate deploy → GO, exit 0', r0.code === 0 && r0.json?.verdict === 'GO', { code: r0.code, checks: r0.json?.checks?.map((c: any) => `${c.id}:${c.status}`) });
    check(`…identities PASS ${SHIPPED.length}/${SHIPPED.length} and checksums PASS ${SHIPPED.length}/${SHIPPED.length}`, status(r0, 'identities') === 'PASS' && status(r0, 'checksums') === 'PASS' && new RegExp(`${SHIPPED.length}/${SHIPPED.length}`).test(checkOf(r0, 'checksums')?.reason ?? ''), r0.json?.checks);
    check('…an empty migrated database: counts WARN (key tables empty) but do not block', status(r0, 'counts.rows') === 'WARN', status(r0, 'counts.rows'));

    // ── the verdict, one database per state ────────────────────────────────
    console.log('\n── 1. one database per state (each from the template) ──');
    await scenario('healthy', null, [], async (r) => {
      check('healthy (from the template) → GO, exit 0', r.code === 0 && r.json.verdict === 'GO' && r.json.state === 'ok', { code: r.code, state: r.json?.state, checks: r.json?.checks?.map((c: any) => `${c.id}:${c.status}:${c.reason.slice(0, 70)}`) });
      check('…every schema check PASS (identities, checksums, tables, columns)', ['identities', 'checksums', 'tables', 'columns'].every((id) => status(r, id) === 'PASS'), r.json?.checks);
      check('…restore_point and size are informational PASS', status(r, 'restore_point') === 'PASS' && status(r, 'size') === 'PASS');
      check('…the 10 largest tables are listed (names and sizes only)', checkOf(r, 'size')?.details?.length > 0 && checkOf(r, 'size').details.length <= 10, checkOf(r, 'size'));
      check('…volume is NOT_RUN and non-gating without --volume-bytes', status(r, 'volume') === 'NOT_RUN' && checkOf(r, 'volume').gating === false);
      check('…the database name is redacted (first 3 characters + length) and no connection detail is in the JSON', /adl\*\*\*\(len=\d+\)/.test(r.text) && !r.text.includes('adlytic_repro_ops') && !r.text.includes('54329') && !/127\.0\.0\.1/.test(r.text), r.json?.target);
    });

    await scenario('empty', null, [], (r) => {
      check('empty database → NO-GO, exit 1, state missing', r.code === 1 && r.json.state === 'missing', { code: r.code, state: r.json?.state });
      check('…identities FAIL (no history table), tables FAIL, checksums NOT_RUN (gating)', status(r, 'identities') === 'FAIL' && status(r, 'tables') === 'FAIL' && status(r, 'checksums') === 'NOT_RUN' && checkOf(r, 'checksums').gating === true, r.json?.checks?.map((c: any) => `${c.id}:${c.status}`));
    }, { template: null });

    await scenario('failedrow', async (c) => {
      await c.query(`insert into _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) values (gen_random_uuid()::text, 'x', '29990101000000_synthetic_failed', now(), 0)`);
    }, [], (r) => {
      check('a failed migration row with EVERYTHING ELSE fine → NO-GO, state failed', r.code === 1 && r.json.state === 'failed', { code: r.code, state: r.json?.state });
      check('…tables, columns and checksums are PASS: only the failed row blocks', status(r, 'tables') === 'PASS' && status(r, 'columns') === 'PASS' && status(r, 'checksums') === 'PASS' && status(r, 'identities') === 'FAIL', r.json?.checks?.map((c: any) => `${c.id}:${c.status}`));
      check('…the failed migration is named', detailsOf(r, 'identities').includes('29990101000000_synthetic_failed'), detailsOf(r, 'identities'));
    });

    await scenario('failedsame', async (c) => {
      await c.query(`insert into _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) values (gen_random_uuid()::text, 'x', $1, now(), 0)`, [SHIPPED[5]]);
    }, [], (r) => {
      check('an unfinished row next to the finished row of the SAME shipped identity → NO-GO failed', r.code === 1 && r.json.state === 'failed', { code: r.code, state: r.json?.state });
    });

    await scenario('rolledback', async (c) => {
      await c.query(`insert into _prisma_migrations (id, checksum, migration_name, started_at, rolled_back_at, applied_steps_count) values (gen_random_uuid()::text, 'x', $1, now(), now(), 0)`, [SHIPPED[5]]);
    }, [], (r) => {
      check('a rolled-back failed attempt of an identity that was then re-applied → GO, state ok', r.code === 0 && r.json.state === 'ok', { code: r.code, state: r.json?.state });
      check('…restore_point counts the rolled-back row', /1 rolled back/.test(checkOf(r, 'restore_point')?.reason ?? ''), checkOf(r, 'restore_point')?.reason);
    });

    await scenario('behind', async (c) => {
      await c.query(`delete from _prisma_migrations where migration_name = any($1)`, [SHIPPED.slice(-2)]);
      await c.query(`drop table if exists period_insights, meta_usage_daily, meta_usage_outcomes, meta_usage_state`);
    }, [], (r) => {
      check('behind (the last two migrations never applied, their tables absent) → NO-GO, state pending', r.code === 1 && r.json.state === 'pending', { code: r.code, state: r.json?.state });
      check('…both missing migrations are named', SHIPPED.slice(-2).every((n) => detailsOf(r, 'identities').includes(n)), detailsOf(r, 'identities'));
      check('…and the absent tables are listed too', status(r, 'tables') === 'FAIL' && detailsOf(r, 'tables').includes('period_insights'), detailsOf(r, 'tables'));
    });

    await scenario('wronghist', async (c) => {
      await c.query(`update _prisma_migrations set migration_name = '29990101000000_bogus_identity' where migration_name = $1`, [SHIPPED[SHIPPED.length - 1]]);
    }, [], async (r, db) => {
      const n = await withDb(db, async (c) => (await c.query(`select count(*)::int as n from _prisma_migrations where finished_at is not null and rolled_back_at is null`)).rows[0].n as number);
      check(`equal-count wrong history (${n} applied = ${SHIPPED.length} shipped, one name differs) → NO-GO, state diverged`, n === SHIPPED.length && r.code === 1 && r.json.state === 'diverged', { n, code: r.code, state: r.json?.state });
      check('…both names are listed', detailsOf(r, 'identities').includes(SHIPPED[SHIPPED.length - 1]!) && detailsOf(r, 'identities').includes('29990101000000_bogus_identity'), detailsOf(r, 'identities'));
    });

    await scenario('ahead', async (c) => {
      await c.query(`insert into _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) values (gen_random_uuid()::text, 'x', '29990102000000_future_release', now(), now(), 1)`);
    }, [], (r) => {
      check('ahead (an older build on a newer database) → GO, exit 0, state ahead', r.code === 0 && r.json.verdict === 'GO' && r.json.state === 'ahead', { code: r.code, state: r.json?.state });
      check('…identities is a WARN, not a silent PASS', status(r, 'identities') === 'WARN', status(r, 'identities'));
    });

    await scenario('duprow', async (c) => {
      await c.query(`insert into _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        select gen_random_uuid()::text, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count from _prisma_migrations where migration_name = $1`, [SHIPPED[5]]);
    }, [], async (r, db) => {
      const n = await withDb(db, async (c) => (await c.query(`select count(*)::int as rows, count(distinct migration_name)::int as names from _prisma_migrations`)).rows[0] as { rows: number; names: number });
      check(`a finished row copied for one identity (${n.rows} rows, ${n.names} identities) → NO-GO, exit 1`, n.rows === SHIPPED.length + 1 && n.names === SHIPPED.length && r.code === 1 && r.json.verdict === 'NO-GO', { n, code: r.code });
      check('…identities FAIL names the duplicated migration; every other schema check is PASS', status(r, 'identities') === 'FAIL' && detailsOf(r, 'identities').includes(`duplicated: ${SHIPPED[5]}`) && ['checksums', 'tables', 'columns'].every((id) => status(r, id) === 'PASS'), r.json?.checks?.map((c: any) => `${c.id}:${c.status}`));
      check('…and /api/health still says "ok" for it (state ok): only the preflight sees the copied row', r.json.state === 'ok', r.json?.state);
    });

    // The count statements name tables unqualified. With the role's default search_path ("$user", public), a schema named like the
    // role holding a table of the same name would be counted instead of public's.
    const roleName = decodeURIComponent(admin.username);
    await scenario('searchpath', async (c) => {
      await c.query(`create schema ${pgMod.escapeIdentifier(roleName)}`);
      await c.query(`create table ${pgMod.escapeIdentifier(roleName)}.users (id text)`);
      await c.query(`create table ${pgMod.escapeIdentifier(roleName)}.campaigns (id text)`);
    }, ['--counts'], async (r, db) => {
      const truth = await withDb(db, async (c) => (await c.query(`select (select count(*) from public.users)::int as users, (select count(*) from public.campaigns)::int as campaigns`)).rows[0] as { users: number; campaigns: number });
      check(`a same-named table in a schema named like the role is NOT what is counted (public.users = ${truth.users}, public.campaigns = ${truth.campaigns})`, r.json?.counts?.rows?.users === truth.users && r.json.counts.rows.campaigns === truth.campaigns && truth.users > 0, { counted: r.json?.counts?.rows, truth });
      check('…and the run is still GO', r.code === 0, r.code);
    });

    await scenario('nocolumn', async (c) => { await c.query('alter table users drop column email'); }, [], (r) => {
      check('a dropped column (every identity applied, every table present) → NO-GO, state missing', r.code === 1 && r.json.state === 'missing', { code: r.code, state: r.json?.state });
      check('…users.email is named, identities and tables are PASS', detailsOf(r, 'columns').includes('users.email') && status(r, 'identities') === 'PASS' && status(r, 'tables') === 'PASS', r.json?.checks?.map((c: any) => `${c.id}:${c.status}`));
    });

    await scenario('notable', async (c) => { await c.query('drop table platform_settings'); }, [], (r) => {
      check('a dropped table → NO-GO, state missing', r.code === 1 && r.json.state === 'missing', { code: r.code, state: r.json?.state });
      check('…platform_settings is named', detailsOf(r, 'tables').includes('platform_settings'), detailsOf(r, 'tables'));
    });

    await scenario('extratable', async (c) => { await c.query('create table scratch_not_in_schema (a int)'); }, [], (r) => {
      check('an extra table the schema does not know → GO (ignored, as /api/health ignores it)', r.code === 0 && r.json.state === 'ok', { code: r.code, state: r.json?.state });
    });

    // ── checksums ──────────────────────────────────────────────────────────
    console.log('\n── 2. checksum drift ──');
    const EDITED = '20260710120000_add_platform_settings';
    await scenario('checksumdb', async (c) => {
      await c.query(`update _prisma_migrations set checksum = encode(sha256('edited after apply'::bytea), 'hex') where migration_name = $1`, [EDITED]);
    }, [], async (r, db) => {
      check('a checksum changed in _prisma_migrations → NO-GO, exit 1', r.code === 1 && r.json.verdict === 'NO-GO', { code: r.code });
      check('…the checksums check FAILs and names the migration', status(r, 'checksums') === 'FAIL' && detailsOf(r, 'checksums').includes(EDITED), checkOf(r, 'checksums'));
      check('…every other check is PASS: drift is the only finding', ['identities', 'tables', 'columns'].every((id) => status(r, id) === 'PASS'));
      const h = await healthState(db);
      check('THE REAL /api/health GATE CALLS THIS DATABASE READY (state ok, ready true): it cannot see checksum drift', h.ready === true && h.state === 'ok', h);
    });

    // A migration FILE edited after it was applied (a scratch copy of the build, so the repository's own files are never touched)
    const tmpRoot = process.env['PREFLIGHT_TMPDIR'] ?? tmpdir();
    const scratch = mkdtempSync(path.join(tmpRoot, 'adlytic_preflight_'));
    try {
      mkdirSync(path.join(scratch, 'scripts', 'ops'), { recursive: true });
      mkdirSync(path.join(scratch, 'src', 'lib'), { recursive: true });
      cpSync(path.join(ROOT, 'scripts', 'ops', 'preflight-schema.ts'), path.join(scratch, 'scripts', 'ops', 'preflight-schema.ts'));
      cpSync(path.join(ROOT, 'src', 'lib', 'dbHealth.ts'), path.join(scratch, 'src', 'lib', 'dbHealth.ts'));
      cpSync(path.join(ROOT, 'src', 'lib', 'pgSsl.ts'), path.join(scratch, 'src', 'lib', 'pgSsl.ts'));
      cpSync(path.join(ROOT, 'prisma'), path.join(scratch, 'prisma'), { recursive: true });
      cpSync(path.join(ROOT, 'prisma.config.ts'), path.join(scratch, 'prisma.config.ts'));
      cpSync(path.join(ROOT, 'package.json'), path.join(scratch, 'package.json'));
      symlinkSync(path.join(ROOT, 'node_modules'), path.join(scratch, 'node_modules'));
      const env = (db: string) => ({ PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', DATABASE_URL: dbUrl(db) });
      const edit = path.join(scratch, 'prisma', 'migrations', EDITED, 'migration.sql');
      const crlf = path.join(scratch, 'prisma', 'migrations', SHIPPED[3]!, 'migration.sql');
      const bytes = readFileSync(edit);

      await scenario('fileedit', null, [], async (_r, db) => {
        // 1. baseline in the scratch build: GO
        const base = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'tsx'), [path.join(scratch, 'scripts', 'ops', 'preflight-schema.ts'), '--json'], { cwd: scratch, env: env(db), encoding: 'utf8', timeout: 60_000 });
        check('scratch copy of the build, files unedited → GO (the copy judges the same as the repository)', base.status === 0, { status: base.status, out: `${base.stdout}${base.stderr}`.slice(0, 300) });
        // 2. edit the migration file AFTER it was applied
        writeFileSync(edit, Buffer.concat([bytes, Buffer.from('\n-- edited after it was applied\n')]));
        const deploy = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], { cwd: scratch, env: env(db), encoding: 'utf8', timeout: 120_000 });
        check('`prisma migrate deploy` with an applied migration file EDITED afterwards exits 0 ("No pending migrations": it does not verify checksums)', deploy.status === 0 && /No pending migrations/.test(`${deploy.stdout}${deploy.stderr}`), { status: deploy.status, tail: `${deploy.stdout}${deploy.stderr}`.slice(-200) });
        const run = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'tsx'), [path.join(scratch, 'scripts', 'ops', 'preflight-schema.ts'), '--json'], { cwd: scratch, env: env(db), encoding: 'utf8', timeout: 60_000 });
        let j: any = null; try { j = JSON.parse(run.stdout); } catch { /* below */ }
        check('the preflight on the same database and the edited file → NO-GO, exit 1', run.status === 1 && j?.verdict === 'NO-GO', { status: run.status, out: `${run.stdout}${run.stderr}`.slice(0, 300) });
        check('…the checksums check FAILs and names the edited migration; the health state is still "ok"', j?.checks?.find((c: any) => c.id === 'checksums')?.status === 'FAIL' && (j.checks.find((c: any) => c.id === 'checksums').details ?? []).join(' ').includes(EDITED) && j.state === 'ok', j?.checks?.find((c: any) => c.id === 'checksums'));
        // 3. restore the file; make ANOTHER migration a CRLF checkout of the same text
        writeFileSync(edit, bytes);
        writeFileSync(crlf, Buffer.from(readFileSync(crlf).toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1'));
        const run2 = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'tsx'), [path.join(scratch, 'scripts', 'ops', 'preflight-schema.ts'), '--json'], { cwd: scratch, env: env(db), encoding: 'utf8', timeout: 60_000 });
        let j2: any = null; try { j2 = JSON.parse(run2.stdout); } catch { /* below */ }
        const c2 = j2?.checks?.find((c: any) => c.id === 'checksums');
        check('a CRLF checkout of an LF-applied migration → GO with a checksums WARN naming "line-endings only" (the SQL text is identical)', run2.status === 0 && c2?.status === 'WARN' && (c2.details ?? []).join(' ').includes(SHIPPED[3]!), { status: run2.status, c2 });
        // 4. the repository's own build (unedited files) judges the same database GO
        const repoRun = await pf(db);
        check('the repository\'s own build (files unedited) on that same database → GO: the verdict is relative to the checkout, as documented', repoRun.code === 0, { code: repoRun.code });
      });
    } finally {
      try { unlinkSync(path.join(scratch, 'node_modules')); } catch { /* ignore */ }
      rmSync(scratch, { recursive: true, force: true });
    }

    // ── counts: aggregates only ────────────────────────────────────────────
    console.log('\n── 3. --counts on a two-tenant synthetic database (aggregates only) ──');
    const S = await seed(mig);
    const snapSeeded = await snapshot(mig);
    const rc = await pf(mig, ['--counts']);
    const cn = rc.json?.counts;
    check('--counts → exit 0 and a counts document', rc.code === 0 && !!cn, { code: rc.code, text: rc.text.slice(0, 300) });
    check('row counts equal what the seed inserted (users, workspaces, members, accounts, campaigns, daily_stats, raw_insights, period_insights, sync_jobs, meta_connections)',
      cn?.rows?.users === S.users && cn.rows.workspaces === S.workspaces && cn.rows.workspace_members === S.members && cn.rows.ad_accounts === S.accounts && cn.rows.campaigns === S.campaigns && cn.rows.daily_stats === S.dailyStats && cn.rows.raw_insights === S.rawInsights && cn.rows.period_insights === S.periodInsights && cn.rows.sync_jobs === S.syncJobs && cn.rows.meta_connections === S.metaConnections, { cn: cn?.rows, S });
    check(`orphaned campaign daily_stats: ${S.orphanRows} ROWS across ${S.orphanIds} DISTINCT ids (counts only), WARN, non-blocking`, cn?.orphans?.rows === S.orphanRows && cn.orphans.distinctIds === S.orphanIds && status(rc, 'counts.orphans') === 'WARN' && checkOf(rc, 'counts.orphans').gating === false, cn?.orphans);
    check(`IQD accounts with currency_minor_factor <> 1: ${S.iqdNonCanonical} of ${S.iqdTotal}`, cn?.iqd?.nonCanonical === S.iqdNonCanonical && cn.iqd.total === S.iqdTotal && status(rc, 'counts.iqd') === 'WARN', cn?.iqd);
    check(`access tokens present (counted): ${S.tokenAccounts} on accounts, ${S.tokenConnections} on connections`, cn?.tokens?.adAccounts === S.tokenAccounts && cn.tokens.metaConnections === S.tokenConnections, cn?.tokens);
    check('SyncJob status distribution: COMPLETED = one per account, FAILED = the two tenant-B accounts', cn?.syncStatus?.COMPLETED === S.accounts && cn.syncStatus.FAILED === 2, cn?.syncStatus);
    check('no duplicate rows against any unique key', status(rc, 'counts.duplicates') === 'PASS' && Object.values(cn?.duplicates ?? {}).every((d: any) => d.groups === 0), cn?.duplicates);
    check('daily_stats and sync_jobs timestamps are present and recent (≤ 7 days: freshness PASS)', status(rc, 'counts.freshness') === 'PASS' && /^\d{4}-\d{2}-\d{2}$/.test(cn?.dailyStats?.newest ?? ''), { fresh: checkOf(rc, 'counts.freshness') });
    const blob = JSON.stringify(rc.json) + rc.text;
    const seededValues = ['tenant-a@repro.invalid', 'tenant-b@repro.invalid', 'Tenant A', 'Synthetic campaign', 'Synthetic account', 'orphan_a_1', 'orphan_b_1', 'act_A1', 'v1:synthetic-not-a-real-token', 'biz_A'];
    check('NO customer-level value in the output: no email, name, campaign/account name, external id, orphan id or token', seededValues.every((v) => !blob.includes(v)), seededValues.filter((v) => blob.includes(v)));
    const ids = await withDb(mig, async (c) => (await c.query(`select id from campaigns union select id from ad_accounts union select id from users union select id from workspaces`)).rows.map((r) => r.id as string));
    check('…and none of the seeded row ids (cuid) appears either', ids.length > 5 && ids.every((i) => !blob.includes(i)), ids.filter((i) => blob.includes(i)));
    check('READ-ONLY: the seeded database is byte-identical (content and xmin) after the --counts run', sameSnapshot(snapSeeded, await snapshot(mig)), diffTables(snapSeeded, await snapshot(mig)));

    // positive control: the snapshot method DOES see a write
    const ctl = await snapshot(mig);
    await withDb(mig, (c) => c.query(`update users set name = name where email = 'tenant-a@repro.invalid'`));
    check('positive control: the same snapshot method detects an UPDATE that changes no value (xmin moves)', !sameSnapshot(ctl, await snapshot(mig)) && diffTables(ctl, await snapshot(mig)).includes('users'), diffTables(ctl, await snapshot(mig)));

    // ── duplicates against a missing unique index ──────────────────────────
    console.log('\n── 4. duplicates against a dropped unique index ──');
    // Duplicates are proved on the seeded database (it has ad accounts and campaigns).
    await withDb(mig, async (c) => {
      const ix = (await c.query(`select indexname from pg_indexes where schemaname = 'public' and tablename = 'campaigns' and indexdef ilike '%unique%' and indexdef ilike '%external_campaign_id%'`)).rows[0]?.indexname as string;
      await c.query(`drop index "${ix}"`);
      await c.query(`insert into campaigns (id, ad_account_id, external_campaign_id, name, updated_at) select 'dup_' || id, ad_account_id, external_campaign_id, name, now() from campaigns limit 2`);
    });
    const rd = await pf(mig, ['--counts']);
    check('duplicate campaigns against a dropped unique index → NO-GO, exit 1, counts.duplicates FAIL and gating', rd.code === 1 && status(rd, 'counts.duplicates') === 'FAIL' && checkOf(rd, 'counts.duplicates').gating === true, { code: rd.code, dup: checkOf(rd, 'counts.duplicates') });
    check('…the schema checks themselves are still PASS: only the duplicates block', ['identities', 'checksums', 'tables', 'columns'].every((id) => status(rd, id) === 'PASS'));
    check('…2 duplicate groups, 2 extra rows reported (aggregates)', rd.json?.counts?.duplicates?.campaigns?.groups === 2 && rd.json.counts.duplicates.campaigns.extra === 2, rd.json?.counts?.duplicates?.campaigns);
    await withDb(mig, (c) => c.query(`delete from campaigns where id like 'dup\\_%'`));

    // ── volume ─────────────────────────────────────────────────────────────
    console.log('\n── 5. --volume-bytes ──');
    const size = await withDb(mig, async (c) => Number((await c.query('select pg_database_size(current_database()) as b')).rows[0].b));
    const v50 = await pf(mig, ['--volume-bytes', String(size * 2)]);
    const v81 = await pf(mig, ['--volume-bytes', String(Math.ceil(size / 0.81))]);
    const v96 = await pf(mig, ['--volume-bytes', String(Math.ceil(size / 0.96))]);
    check('database at 50% of the volume → volume PASS, exit 0', status(v50, 'volume') === 'PASS' && v50.code === 0, { s: status(v50, 'volume'), code: v50.code, reason: checkOf(v50, 'volume')?.reason });
    check('database at 81% → volume WARN, exit 0 (a warning does not block)', status(v81, 'volume') === 'WARN' && v81.code === 0, { s: status(v81, 'volume'), code: v81.code, reason: checkOf(v81, 'volume')?.reason });
    check('database at 96% → volume FAIL, exit 1 (a full volume makes writes and migrations fail)', status(v96, 'volume') === 'FAIL' && v96.code === 1, { s: status(v96, 'volume'), code: v96.code, reason: checkOf(v96, 'volume')?.reason });
    check('…the other checks are unaffected by the volume', ['identities', 'checksums', 'tables', 'columns'].every((id) => status(v96, id) === 'PASS'));

    // ── server-side read-only ──────────────────────────────────────────────
    console.log('\n── 6. Postgres itself refuses writes inside the transaction the script opens ──');
    await withDb(mig, async (c) => {
      await c.query(P.SQL.begin);
      const attempts: Array<[string, string]> = [
        ['UPDATE', `update users set name = name`], ['INSERT', `insert into platform_settings (key, value, updated_at) values ('x', 'y', now())`], ['DELETE', 'delete from users'],
        ['TRUNCATE', 'truncate users cascade'], ['CREATE TABLE', 'create table zz_probe (a int)'], ['SELECT INTO', 'select * into zz_probe from users'], ['DROP TABLE', 'drop table users'], ['ALTER', 'alter table users add column zz int'],
      ];
      for (const [name, sql] of attempts) {
        let code = ''; try { await c.query(sql); } catch (e) { code = (e as { code?: string }).code ?? ''; }
        check(`inside \`${P.SQL.begin}\`: ${name} is refused by the server (SQLSTATE 25006)`, code === '25006', code);
        await c.query('ROLLBACK'); await c.query(P.SQL.begin);
      }
      await c.query('ROLLBACK');
    });
    const zz = await withDb(mig, async (c) => (await c.query(`select to_regclass('public.zz_probe') as z`)).rows[0].z);
    check('…and nothing was created or changed by those attempts', zz === null);

    // ── a role that cannot write ───────────────────────────────────────────
    console.log('\n── 7. a read-only role (cannot write) ──');
    await withDb('postgres', async (c) => { try { await c.query(`CREATE ROLE ${RO_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`); } catch (e) { if ((e as { code?: string }).code !== '42710') throw e; } });
    try {
      await withDb(mig, async (c) => {
        await c.query(`GRANT CONNECT ON DATABASE ${mig} TO ${RO_ROLE}`);
        await c.query(`GRANT USAGE ON SCHEMA public TO ${RO_ROLE}`);
        await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RO_ROLE}`);
      });
      await withDb(mig, async (c) => {
        let upd = ''; try { await c.query(`update users set name = name`); } catch (e) { upd = (e as { code?: string }).code ?? ''; }
        let crt = ''; try { await c.query(`create table zz_ro (a int)`); } catch (e) { crt = (e as { code?: string }).code ?? ''; }
        check('positive control: the role really cannot write (UPDATE and CREATE TABLE → 42501)', upd === '42501' && crt === '42501', { upd, crt });
      }, RO_ROLE);
      const beforeRo = await snapshot(mig);
      const asRo = await pf(mig, ['--counts'], RO_ROLE);
      check('the preflight AS THAT ROLE works: exit 0 and GO', asRo.code === 0 && asRo.json?.verdict === 'GO', { code: asRo.code, text: asRo.text.slice(0, 300), err: asRo.err });
      check('…with the same counts a superuser sees', JSON.stringify(asRo.json?.counts?.rows) === JSON.stringify(rc.json?.counts?.rows) || asRo.json?.counts?.rows?.users === S.users, asRo.json?.counts?.rows);
      check('…and it wrote nothing', sameSnapshot(beforeRo, await snapshot(mig)), diffTables(beforeRo, await snapshot(mig)));
      await withDb(mig, (c) => c.query(`REVOKE SELECT ON users FROM ${RO_ROLE}`));
      const noSel = await pf(mig, ['--counts'], RO_ROLE);
      check('a role that cannot read a table: the schema checks are PASS but the REQUESTED counts could not run → NO-GO (never a silent skip)', noSel.code === 1 && status(noSel, 'counts.unread') === 'NOT_RUN' && checkOf(noSel, 'counts.unread').gating === true, { code: noSel.code, unread: checkOf(noSel, 'counts.unread') });
      check('…the reason is the closed-vocabulary permission_denied, not driver text', detailsOf(noSel, 'counts.unread').includes('permission_denied') && !/permission denied for table/i.test(noSel.text), detailsOf(noSel, 'counts.unread'));
    } finally {
      await withDb(mig, (c) => c.query(`DROP OWNED BY ${RO_ROLE}`)).catch(() => undefined);
      await withDb('postgres', (c) => c.query(`DROP ROLE IF EXISTS ${RO_ROLE}`)).catch(() => undefined);
    }

    // ── a lock held by a writer cannot hang it ─────────────────────────────
    console.log('\n── 8. lock_timeout: a writer holding ACCESS EXCLUSIVE cannot hang the preflight ──');
    const locker = await client(mig);
    try {
      await locker.query('BEGIN');
      await locker.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
      const locked = await pf(mig, ['--counts']);
      check('with users locked the run FINISHES within 8 s (lock_timeout 2 s), it does not queue behind the writer', locked.ms < 8000, locked.ms);
      check('…the schema checks (catalog only) are unaffected: PASS', ['identities', 'checksums', 'tables', 'columns'].every((id) => status(locked, id) === 'PASS'), locked.json?.checks?.map((c: any) => `${c.id}:${c.status}`));
      check('…the count that needed the lock is NOT_RUN with the reason lock_timeout, and the verdict is NO-GO (a requested check that did not run)', locked.code === 1 && detailsOf(locked, 'counts.unread').includes('lock_timeout'), { code: locked.code, unread: detailsOf(locked, 'counts.unread') });
    } finally { await locker.query('ROLLBACK').catch(() => undefined); await locker.end(); }
    const afterLock = await pf(mig);
    check('once the lock is released the same database is GO again', afterLock.code === 0, afterLock.code);

    // ── cannot connect ─────────────────────────────────────────────────────
    console.log('\n── 9. cannot connect → exit 2 (NOT RUN), never a verdict ──');
    const nodb = await pf('adlytic_repro_ops_t_doesnotexist');
    check('a database that does not exist → exit 2, NOT_RUN, reason database_missing', nodb.code === 2 && nodb.json?.verdict === 'NOT_RUN' && /database_missing/.test(nodb.text), { code: nodb.code, text: nodb.text });
    check('…and the output does not contain its name', !nodb.text.includes('doesnotexist'), nodb.text);
    const nouser = await pf(mig, [], 'adlytic_repro_ops_nosuchrole');
    check('a role that does not exist → exit 2, NOT_RUN', nouser.code === 2 && nouser.json?.verdict === 'NOT_RUN', { code: nouser.code, text: nouser.text });
    check('…and the output does not contain the role name', !nouser.text.includes('nosuchrole'), nouser.text);

    // ── the CLI itself ─────────────────────────────────────────────────────
    console.log('\n── 10. the CLI wrapper (exit codes through a real process) ──');
    const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    const cli = (db: string, args: string[]) => spawnSync(tsx, [path.join(ROOT, 'scripts', 'ops', 'preflight-schema.ts'), ...args], { cwd: ROOT, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', DATABASE_URL: dbUrl(db) }, encoding: 'utf8', timeout: 60_000 });
    const go = cli(mig, []);
    check('CLI on a healthy database: exit 0, human output ends with "VERDICT: GO"', go.status === 0 && /VERDICT: GO/.test(go.stdout), { status: go.status, tail: go.stdout.slice(-200) });
    check('…every line that starts with a bracket carries PASS / FAIL / WARN / NOT_RUN', go.stdout.split('\n').filter((l) => l.startsWith('[')).every((l) => /^\[(PASS|FAIL|WARN|NOT_RUN)\] /.test(l)));
    await createDb('adlytic_repro_ops_t_cliwrong', TEMPLATE);
    await withDb('adlytic_repro_ops_t_cliwrong', (c) => c.query(`update _prisma_migrations set migration_name = '29990101000000_bogus' where migration_name = $1`, [SHIPPED[SHIPPED.length - 1]]));
    const no = cli('adlytic_repro_ops_t_cliwrong', []);
    check('CLI on an equal-count wrong history: exit 1, "VERDICT: NO-GO", the check line says FAIL', no.status === 1 && /VERDICT: NO-GO/.test(no.stdout) && /\[FAIL\] identities/.test(no.stdout), { status: no.status, out: no.stdout.slice(0, 400) });
    await dropDb('adlytic_repro_ops_t_cliwrong');
  } finally {
    for (const db of [...created]) { try { await dropDb(db); } catch { /* best effort */ } }
    await withDb('postgres', (c) => c.query(`DROP ROLE IF EXISTS ${RO_ROLE}`)).catch(() => undefined);
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// A crash after the preconditions held is a FAILURE (exit 1); exit 2 is reserved for "could not run at all" (handled above).
main().catch((e) => { console.error('test crashed:', (e as Error).message); process.exit(1); });
