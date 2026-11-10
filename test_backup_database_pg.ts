// ═════════════════════════════════════════════════════════════════════════
//  test_backup_database_pg.ts — backup_database.command against a REAL Postgres
//
//  On a SYNTHETIC local Postgres (loopback, database adlytic_repro*); not part of
//  test:all (CI has no database); exits 2 — never green — if it cannot run:
//
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc1 \
//      npm run test:backup-database-pg
//
//  Proves, with the real pg_dump / gzip / psql:
//    1. a valid dump RESTORES in an isolated database and the copy equals the source
//       (every table: row count + content digest; columns, indexes, constraints, enums)
//    2. taking the backup writes nothing to the source (digest before = after)
//    3. a dump that fails — a role that cannot read, the real stream cut off midway (exit 1 or
//       exit 0), an unreachable server, a missing database — FAILS the command and leaves no file
// ═════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('NOT RUN: DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}
for (const t of ['pg_dump', 'psql', 'gzip']) {
  if (spawnSync('sh', ['-c', `command -v ${t}`]).status !== 0) { console.error(`NOT RUN: ${t} not found`); process.exit(2); }
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

type Digest = { tables: Record<string, string>; columns: string; indexes: string; constraints: string; enums: string };

async function main() {
  const pg = (await import('pg')).default;
  const base = { host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) };
  const admin = new pg.Pool({ ...base, database: 'postgres', max: 2, connectionTimeoutMillis: 4000 });
  try { await admin.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic server:', (e as Error).message); process.exit(2); }
  const sfx = Math.random().toString(36).slice(2, 8);
  const restoreDb = `adlytic_repro_bkrestore_${sfx}`;
  const roleNoRead = `adlytic_bk_noread_${sfx}`;
  const work = mkdtempSync(path.join(tmpdir(), 'adlytic-backup-pg-'));
  const SCRIPT = path.join(process.cwd(), 'backup_database.command');
  const srcUrl = `postgresql://${base.user}@${base.host}:${base.port}/${dbName}`;
  const srcPool = new pg.Pool({ ...base, database: dbName, max: 2 });

  const digest = async (pool: InstanceType<typeof pg.Pool>): Promise<Digest> => {
    const names: string[] = (await pool.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).rows.map((r) => r.table_name);
    const tables: Record<string, string> = {};
    for (const t of names) {
      const r = await pool.query(`select count(*)::text as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from "${t}" x`);
      tables[t] = `${r.rows[0].n}:${r.rows[0].h}`;
    }
    const one = async (q: string) => (await pool.query(q)).rows[0].h as string;
    return {
      tables,
      columns: await one(`select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), '|' order by table_name, column_name)) h from information_schema.columns where table_schema='public'`),
      indexes: await one(`select md5(string_agg(indexdef, '|' order by indexname)) h from pg_indexes where schemaname='public'`),
      constraints: await one(`select md5(string_agg(conrelid::regclass::text||':'||conname||':'||contype::text, '|' order by conrelid::regclass::text, conname)) h from pg_constraint where connamespace='public'::regnamespace`),
      enums: await one(`select md5(coalesce(string_agg(t.typname||':'||e.enumlabel, '|' order by t.typname, e.enumsortorder), '')) h from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typnamespace='public'::regnamespace`),
    };
  };
  const backup = (dbUrl: string, dir: string, env: Record<string, string> = {}) =>
    spawnSync('bash', [SCRIPT], { env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', TMPDIR: work, DATABASE_URL: dbUrl, BACKUP_DIR: dir, ...env }, encoding: 'utf8', timeout: 120_000 });
  const filesIn = (d: string) => (existsSync(d) ? readdirSync(d) : []);

  try {
    // ── 1. a good backup, restored in isolation ─────────────────────────
    console.log('\n── 1. the real backup restores in an isolated database and equals the source ──');
    const before = await digest(srcPool);
    const nTables = Object.keys(before.tables).length;
    const nRows = Object.values(before.tables).reduce((a, v) => a + Number(v.split(':')[0]), 0);
    check(`(setup) the source has ${nTables} tables and ${nRows} rows`, nTables >= 40 && nRows > 0, [nTables, nRows]);
    const dir1 = path.join(work, 'ok');
    const r = backup(srcUrl, dir1);
    const files = filesIn(dir1);
    check('the command exits 0 and says "Backup complete"', r.status === 0 && /Backup complete/.test(r.stdout), [r.status, r.stderr.slice(-300)]);
    check('…one .sql.gz, no .partial, mode 0600, a complete pg_dump file (completion marker, gzip intact)', files.length === 1 && /\.sql\.gz$/.test(files[0] ?? '') && (statSync(path.join(dir1, files[0]!)).mode & 0o777) === 0o600
      && gunzipSync(readFileSync(path.join(dir1, files[0]!))).toString().includes('-- PostgreSQL database dump complete'), files);
    check('…the output names the database and host only (no user, no URL, no password)', /Database: \S+ on 127\.0\.0\.1:\d+/.test(r.stdout) && !/postgres(ql)?:\/\//.test(r.stdout + r.stderr), r.stdout.slice(0, 300));
    const file = path.join(dir1, files[0] ?? 'missing');

    const sourceAfter = await digest(srcPool);
    check('taking the backup wrote NOTHING to the source: every table, column, index, constraint and enum is identical afterwards', JSON.stringify(before) === JSON.stringify(sourceAfter), Object.keys(before.tables).filter((t) => before.tables[t] !== sourceAfter.tables[t]));

    await admin.query(`create database "${restoreDb}" template template0`);
    const restoreUrl = `postgresql://${base.user}@${base.host}:${base.port}/${restoreDb}`;
    const restored = spawnSync('bash', ['-c', `gunzip < "${file}" | psql -q --set ON_ERROR_STOP=1 --single-transaction "${restoreUrl}" > /dev/null`], { env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' }, encoding: 'utf8', timeout: 120_000 });
    check('the dump restores into a NEW empty database (ON_ERROR_STOP, one transaction) with exit 0', restored.status === 0, [restored.status, restored.stderr.slice(-300)]);
    check('…and the restored database is a different database from the source', restoreDb !== dbName && (await admin.query(`select count(*)::int n from pg_database where datname in ($1,$2)`, [restoreDb, dbName])).rows[0].n === 2);
    const copyPool = new pg.Pool({ ...base, database: restoreDb, max: 2 });
    const copy = await digest(copyPool);
    const diffTables = Object.keys(before.tables).filter((t) => before.tables[t] !== copy.tables[t]);
    check(`every one of the ${nTables} tables has the same row count and content digest as the source (${nRows} rows)`, diffTables.length === 0 && Object.keys(copy.tables).length === nTables, diffTables.slice(0, 5));
    check('…columns (types, nullability, defaults), indexes, constraints and enum values are identical', copy.columns === before.columns && copy.indexes === before.indexes && copy.constraints === before.constraints && copy.enums === before.enums, { columns: copy.columns === before.columns, indexes: copy.indexes === before.indexes, constraints: copy.constraints === before.constraints, enums: copy.enums === before.enums });
    const migs = await copyPool.query(`select count(*)::int n from _prisma_migrations`);
    check('…including the Prisma migration history (the readiness gate\'s evidence)', migs.rows[0].n === Number(before.tables['_prisma_migrations']?.split(':')[0]) && migs.rows[0].n > 0, migs.rows[0]);
    await copyPool.end();
    check('restoring wrote nothing to the source either', JSON.stringify(await digest(srcPool)) === JSON.stringify(before));

    // ── 2. failures, with the real pg_dump ──────────────────────────────
    console.log('\n── 2. a dump that fails fails the command, with the real pg_dump ──');
    await admin.query(`create role "${roleNoRead}" login`);
    await admin.query(`grant connect on database "${dbName}" to "${roleNoRead}"`);
    // pg_dump disables statement_timeout for its own session, so a mid-stream failure is simulated on the REAL pg_dump output:
    // a shim in front of it cuts the real stream after 40 KB (once exiting 0, once exiting 1), exactly what a killed
    // or disconnected dump looks like to the script.
    const realPgDump = spawnSync('sh', ['-c', 'command -v pg_dump'], { encoding: 'utf8' }).stdout.trim();
    const cutDir = path.join(work, 'cut'); mkdirSync(cutDir);
    for (const [name, code] of [['pg_dump_cut_exit0', 0], ['pg_dump_cut_exit1', 1]] as const) {
      const d = path.join(work, name); mkdirSync(d);
      writeFileSync(path.join(d, 'pg_dump'), `#!/bin/bash\n"${realPgDump}" "$@" | head -c 40000\nexit ${code}\n`); chmodSync(path.join(d, 'pg_dump'), 0o755);
    }
    const cases: Array<[string, string, Record<string, string>]> = [
      ['a role that cannot read the tables (the real pg_dump fails after it started)', `postgresql://${roleNoRead}@${base.host}:${base.port}/${dbName}`, {}],
      ['the real dump cut off after 40 KB and the process exits 1 (killed / disconnected)', srcUrl, { PATH: `${path.join(work, 'pg_dump_cut_exit1')}:${process.env['PATH'] ?? ''}` }],
      ['the real dump cut off after 40 KB and the process exits 0 (only the completion marker can tell)', srcUrl, { PATH: `${path.join(work, 'pg_dump_cut_exit0')}:${process.env['PATH'] ?? ''}` }],
      ['an unreachable server (nothing listens on that port)', `postgresql://${base.user}@${base.host}:1/${dbName}`, {}],
      ['a database that does not exist', `postgresql://${base.user}@${base.host}:${base.port}/adlytic_repro_does_not_exist_${sfx}`, {}],
    ];
    for (const [label, u, env] of cases) {
      const d = path.join(work, `fail_${cases.findIndex((c) => c[0] === label)}`);
      const f = backup(u, d, env);
      check(`${label}: non-zero exit, no "Backup complete", no file left (no .sql.gz, no .partial)`, f.status !== 0 && !/Backup complete/.test(f.stdout + f.stderr) && filesIn(d).length === 0, [f.status, filesIn(d), (f.stderr || f.stdout).slice(-200)]);
      check('   …it says no backup was written, and nothing secret is printed', /no backup was written/i.test(f.stderr) && !/postgres(ql)?:\/\//.test(f.stdout + f.stderr), f.stderr.slice(-300));
    }
    check('the failed runs changed nothing in the source', JSON.stringify(await digest(srcPool)) === JSON.stringify(before));
    // the old failure mode, for the record: pg_dump | gzip reported gzip's exit status
    const oldPipeline = spawnSync('bash', ['-c', `PGPASSWORD="" pg_dump -h 127.0.0.1 -p 1 -U x -d y --no-password 2>/dev/null | gzip > "${work}/old.gz"; echo $?`], { encoding: 'utf8' });
    check('(for the record) the old pipeline pattern reports exit 0 for a failed dump and leaves a ~20-byte file — which is why the script now uses pipefail and verifies the dump', oldPipeline.stdout.trim() === '0' && statSync(`${work}/old.gz`).size < 60, [oldPipeline.stdout, statSync(`${work}/old.gz`).size]);
  } finally {
    await admin.query(`drop database if exists "${restoreDb}"`).catch(() => {});
    await admin.query(`drop owned by "${roleNoRead}"`).catch(() => {});
    await admin.query(`drop role if exists "${roleNoRead}"`).catch(() => {});
    await srcPool.end().catch(() => {}); await admin.end().catch(() => {});
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`\n${pass} passed, ${fail} failed   (source: ${dbName}, restored into: ${restoreDb}, dropped)`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_backup_database_pg crashed:', e); process.exit(1); });
