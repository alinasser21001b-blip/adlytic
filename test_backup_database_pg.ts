// ═════════════════════════════════════════════════════════════════════════
//  test_backup_database_pg.ts — backup_database.command against a REAL Postgres
//
//  On a SYNTHETIC local Postgres (loopback, database adlytic_repro*); not part of
//  test:all (CI has no database); exits 2 — never green — if it cannot run:
//
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc1 \
//      npm run test:backup-database-pg
//
//  Needs the PostgreSQL server binaries (initdb, pg_ctl) as well: section 4 starts its OWN throwaway
//  cluster on a loopback port (scram-sha-256 on TCP; as the `postgres` OS user when run as root) so the
//  password path is exercised against a real server without touching the shared cluster's pg_hba.
//  BACKUP_SCRIPT=<path> runs the suite against another copy of the script (used to show it RED on the old one).
//
//  Proves, with the real pg_dump / gzip / psql:
//    1. a valid dump RESTORES, through the restore command the script PRINTS (verbatim, target substituted),
//       in an isolated database and the copy equals the source
//       (every table: row count + content digest; columns, indexes, constraints, enums)
//    2. taking the backup writes nothing to the source (digest before = after)
//    3. a dump that fails — a role that cannot read, the real stream cut off midway (exit 1 or
//       exit 0), an unreachable server, a missing database — FAILS the command and leaves no file;
//       a role that does not exist is reported without naming it
//    4. the printed restore command REFUSES a truncated, bit-flipped or marker-less backup — exit non-zero
//       AND the target database is exactly as it was (no table, no row) — where the old
//       `gunzip < f | psql --single-transaction` exited 0 and committed a partial database
//    5. against a real scram-sha-256 server: passwords with @ : %40 ' " $ and spaces (raw or encoded)
//       authenticate; neither stdout, stderr nor a file name holds any 3+ character piece of the password,
//       and a failed login does not name the user
// ═════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { chmodSync, chownSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

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
  const SCRIPT = path.resolve(process.env['BACKUP_SCRIPT'] ?? path.join(process.cwd(), 'backup_database.command'));
  const srcUrl = `postgresql://${base.user}@${base.host}:${base.port}/${dbName}`;
  const srcPool = new pg.Pool({ ...base, database: dbName, max: 2 });
  const extraDbs: string[] = [];
  let scram: { stop: () => void } | undefined;

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
  // the restore command exactly as the script prints it (the line after "Restore (…"), and a runner that substitutes only the target
  const printedRestore = (out: string) => { const l = out.split('\n'); const i = l.findIndex((x) => /^Restore \(/.test(x)); return i >= 0 ? (l[i + 1] ?? '').replace(/^ {2}/, '') : ''; };
  const runRestore = (cmdLine: string, targetDb: string) => spawnSync('bash', ['-c', cmdLine.replace('<target-connection-string>', `'postgresql://${base.user}@${base.host}:${base.port}/${targetDb}'`)], { env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' }, encoding: 'utf8', timeout: 120_000 });
  // what a target database holds: tables, schema objects, rows — "unchanged" means this is identical
  const snapshot = async (db: string) => {
    const p = new pg.Pool({ ...base, database: db, max: 1 });
    try {
      const t = (await p.query(`select table_name from information_schema.tables where table_schema='public' order by 1`)).rows.map((x) => x.table_name as string);
      const objs = (await p.query(`select count(*)::int n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public'`)).rows[0].n as number;
      let rows = 0;
      for (const n of t) rows += Number((await p.query(`select count(*)::int n from "${n}"`)).rows[0].n);
      return { tables: t.length, objects: objs, rows };
    } finally { await p.end(); }
  };

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
    check('…one .sql.gz, no .partial, mode 0600, a complete pg_dump file (gzip intact, ends with the completion marker)', files.length === 1 && /\.sql\.gz$/.test(files[0] ?? '') && (statSync(path.join(dir1, files[0]!)).mode & 0o777) === 0o600
      && /\n-- PostgreSQL database dump complete\n--\n/.test(gunzipSync(readFileSync(path.join(dir1, files[0]!))).toString()), files);
    check('…the output names the database and host only (no user, no URL, no password)', /Database: \S+ on 127\.0\.0\.1:\d+/.test(r.stdout) && !/postgres(ql)?:\/\//.test(r.stdout + r.stderr), r.stdout.slice(0, 300));
    const file = path.join(dir1, files[0] ?? 'missing');
    const ver = spawnSync('bash', [SCRIPT, '--verify', file], { env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' }, encoding: 'utf8' });
    check('…and `--verify FILE` (the check the printed restore command starts with) accepts it: exit 0, on a real pg_dump 16 file with its \\unrestrict trailer', ver.status === 0, [ver.status, ver.stderr]);
    const printed = printedRestore(r.stdout);
    check('…it prints a restore command naming this file and a <target-connection-string> placeholder', printed.includes(file) && printed.includes('<target-connection-string>'), r.stdout.slice(-400));

    const sourceAfter = await digest(srcPool);
    check('taking the backup wrote NOTHING to the source: every table, column, index, constraint and enum is identical afterwards', JSON.stringify(before) === JSON.stringify(sourceAfter), Object.keys(before.tables).filter((t) => before.tables[t] !== sourceAfter.tables[t]));

    await admin.query(`create database "${restoreDb}" template template0`);
    const restored = runRestore(printed, restoreDb);
    check('the PRINTED restore command, run as printed into a NEW empty database, exits 0', restored.status === 0, [restored.status, restored.stderr.slice(-300)]);
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
    const roleGone = `adlytic_bk_nosuch_${sfx}`;
    const cases: Array<[string, string, Record<string, string>]> = [
      ['a role that does not exist (the server\'s message names it; the relay must not)', `postgresql://${roleGone}@${base.host}:${base.port}/${dbName}`, {}],
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
    const gone = backup(`postgresql://${roleGone}@${base.host}:${base.port}/${dbName}`, path.join(work, 'fail_gone'));
    check('the real server says `role "…" does not exist`; the relayed message has <user> in its place and the user name appears nowhere in stdout, stderr or the file names', /role "<user>" does not exist/.test(gone.stderr) && !(gone.stdout + gone.stderr).includes(roleGone) && filesIn(path.join(work, 'fail_gone')).length === 0, gone.stderr.slice(-300));
    // a successful run as a role whose name is NOT a piece of the database name (the shared role "adlytic" is, so it could never prove this)
    const roleRead = `adlytic_bk_reader_${sfx}`;
    await admin.query(`create role "${roleRead}" login`);
    await admin.query(`grant pg_read_all_data to "${roleRead}"`);
    const rd = backup(`postgresql://${roleRead}@${base.host}:${base.port}/${dbName}`, path.join(work, 'ok_reader'));
    check('a successful backup as a different login role: exit 0, and the role name appears nowhere in stdout, stderr or the file names', rd.status === 0 && /Backup complete/.test(rd.stdout) && !(rd.stdout + rd.stderr + filesIn(path.join(work, 'ok_reader')).join('\n')).includes(roleRead), [rd.status, rd.stderr.slice(-300)]);
    check('the failed runs changed nothing in the source', JSON.stringify(await digest(srcPool)) === JSON.stringify(before));
    // the old failure mode, for the record: pg_dump | gzip reported gzip's exit status
    const oldPipeline = spawnSync('bash', ['-c', `PGPASSWORD="" pg_dump -h 127.0.0.1 -p 1 -U x -d y --no-password 2>/dev/null | gzip > "${work}/old.gz"; echo $?`], { encoding: 'utf8' });
    check('(for the record) the old pipeline pattern reports exit 0 for a failed dump and leaves a ~20-byte file — which is why the script now uses pipefail and verifies the dump', oldPipeline.stdout.trim() === '0' && statSync(`${work}/old.gz`).size < 60, [oldPipeline.stdout, statSync(`${work}/old.gz`).size]);

    // ── 3. the printed restore command refuses what is damaged, and the target stays as it was ──
    console.log('\n── 3. the printed restore command: damaged backups restore NOTHING (exit non-zero, target unchanged) ──');
    check('(setup) the printed restore command is the one-line form with --verify, BEGIN/COMMIT and ON_ERROR_STOP', /--verify/.test(printed) && /BEGIN;/.test(printed) && /COMMIT;/.test(printed) && /ON_ERROR_STOP=1/.test(printed), printed);
    const goodBytes = readFileSync(file);
    const sql = gunzipSync(goodBytes).toString();
    const lines = sql.split('\n');
    const ci = lines.findIndex((l, i) => /^COPY .* FROM stdin;$/.test(l) && lines[i + 3] !== undefined && lines[i + 3] !== '\\.' && lines[i + 1] !== '\\.' && lines[i + 2] !== '\\.');
    const cutAfterRows = lines.slice(0, ci + 3).join('\n') + '\n';          // ends right after the 2nd data row of a COPY: psql treats EOF inside COPY as the end of the data
    const noMarker = sql.slice(0, sql.indexOf('--\n-- PostgreSQL database dump complete'));        // every table, key and index — and not the marker
    const flip = (at: number, bit = 0x04) => { const z = Buffer.from(goodBytes); z[Math.floor(z.length * at)] ^= bit; return z; };
    const cutZ = gzipSync(Buffer.from(cutAfterRows));
    const damaged: Array<[string, Buffer]> = [
      ['the file cut at 25% (a download that stopped)', goodBytes.subarray(0, Math.floor(goodBytes.length * 0.25))],
      ['the file cut at 55%', goodBytes.subarray(0, Math.floor(goodBytes.length * 0.55))],
      ['the file cut at 85%', goodBytes.subarray(0, Math.floor(goodBytes.length * 0.85))],
      ['a gzip of the SQL cut right after a data row, its 8-byte trailer missing (gunzip says "unexpected end of file" but has produced all of the prefix)', cutZ.subarray(0, cutZ.length - 8)],
      ['a bit flipped at 30% of the compressed data', flip(0.3)],
      ['a bit flipped at 60%', flip(0.6)],
      ['a bit flipped at 90%', flip(0.9)],
      ['a bit flipped in the CRC at the end (every byte decompresses, nothing vouches for it)', flip(1 - 7 / goodBytes.length, 0x01)],
      ['a VALID gzip of the SQL cut right after a data row (no completion marker)', cutZ],
      ['a VALID gzip of the whole dump except the completion marker (all tables, keys and indexes are there)', gzipSync(Buffer.from(noMarker))],
      ['an empty file', Buffer.alloc(0)],
    ];
    check('(setup) found a COPY block with data rows to cut inside, and the marker to remove', ci >= 0 && noMarker.length > 0 && noMarker.length < sql.length, [ci, noMarker.length, sql.length]);
    let vi = 0;
    const committed: string[] = [];
    for (const [label, bytes] of damaged) {
      const db = `${restoreDb}_v${++vi}`;
      extraDbs.push(db);
      await admin.query(`create database "${db}" template template0`);
      writeFileSync(file, bytes);                                      // the damaged bytes take the intact backup's place; the command is run exactly as printed
      const before = await snapshot(db);
      const x = runRestore(printed, db);
      const after = await snapshot(db);
      if (JSON.stringify(after) !== JSON.stringify(before)) committed.push(`${label}: ${JSON.stringify(after)} exit ${x.status}`);
      check(`${label}: the command exits non-zero AND the target is unchanged (${before.tables} tables, ${before.rows} rows before → ${after.tables} tables, ${after.rows} rows after)`, x.status !== null && x.status !== 0 && JSON.stringify(after) === JSON.stringify(before), [x.status, after, x.stderr.slice(-160)]);
      await admin.query(`drop database "${db}"`);
    }
    writeFileSync(file, goodBytes);
    if (committed.length > 0) console.log(`  · partial databases that were COMMITTED:\n    ${committed.join('\n    ')}`);
    {
      // a VALID, verified file that fails half-way through the restore (a target that already holds one of its tables) leaves nothing behind: BEGIN … COMMIT
      const late = [...sql.matchAll(/^CREATE TABLE public\.("?\w+"?) \(/gm)].pop()?.[1];
      const db = `${restoreDb}_halfway`; extraDbs.push(db);
      await admin.query(`create database "${db}" template template0`);
      const tp = new pg.Pool({ ...base, database: db, max: 1 });
      await tp.query(`create table public.${late} (x int)`);
      await tp.end();
      const before2 = await snapshot(db);
      const x = runRestore(printed, db);
      const after2 = await snapshot(db);
      check(`an error half-way through a restore of an intact file (the target already has public.${late}, created late in the dump): non-zero exit, and none of the tables before it were kept (${before2.tables} → ${after2.tables} tables)`, !!late && x.status !== null && x.status !== 0 && JSON.stringify(after2) === JSON.stringify(before2) && after2.tables === 1 && /already exists/.test(x.stderr), [late, x.status, after2, x.stderr.slice(-200)]);
      await admin.query(`drop database "${db}"`);
    }
    {
      const db = `${restoreDb}_again`; extraDbs.push(db);
      await admin.query(`create database "${db}" template template0`);
      const x = runRestore(printed, db);
      const againPool = new pg.Pool({ ...base, database: db, max: 1 });
      const again = await digest(againPool); await againPool.end();
      check('control: after all of that the intact file still restores through the same command, and equals the source', x.status === 0 && JSON.stringify(again) === JSON.stringify(before), [x.status, x.stderr.slice(-200)]);
      await admin.query(`drop database "${db}"`);
    }
    {
      const zsh = spawnSync('sh', ['-c', 'command -v zsh'], { encoding: 'utf8' }).stdout.trim();
      if (!zsh) console.log('  · NOT_RUN: zsh is not installed here; the printed line uses only ( ), { }, &&, `set -o pipefail` and quoted words, which bash and zsh share');
    }

    // ── 4. the password path, against a real scram-sha-256 server (a throwaway cluster of its own) ──
    console.log('\n── 4. real scram-sha-256 authentication: passwords with @ : %40 \' " $ and spaces; nothing of them, and no user name, is ever printed ──');
    const bin = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout.trim();
    if (!bin || !existsSync(path.join(bin, 'initdb')) || !existsSync(path.join(bin, 'pg_ctl'))) { console.error('NOT RUN: initdb / pg_ctl not found (pg_config --bindir)'); process.exit(2); }
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const asPg = (cmd: string) => isRoot ? spawnSync('su', ['-s', '/bin/bash', 'postgres', '-c', cmd], { encoding: 'utf8' }) : spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
    const cdir = mkdtempSync('/tmp/adlytic-bk-scram-');                 // /tmp, not os.tmpdir(): the postgres OS user must be able to reach it
    if (isRoot) { const uid = Number(spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).stdout), gid = Number(spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).stdout); chownSync(cdir, uid, gid); chmodSync(cdir, 0o700); }
    const cport = await new Promise<number>((res, rej) => { const sv = net.createServer(); sv.on('error', rej); sv.listen(0, '127.0.0.1', () => { const pt = (sv.address() as net.AddressInfo).port; sv.close(() => res(pt)); }); });
    scram = { stop: () => { asPg(`${bin}/pg_ctl -D ${cdir}/data -m immediate stop >/dev/null 2>&1`); rmSync(cdir, { recursive: true, force: true }); } };
    const init = asPg(`${bin}/initdb -D ${cdir}/data -U bkadmin --auth-local=trust --auth-host=scram-sha-256 -E UTF8 >${cdir}/initdb.log 2>&1`);
    const start = init.status === 0 ? asPg(`${bin}/pg_ctl -D ${cdir}/data -l ${cdir}/server.log -w -o '-p ${cport} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${cdir} -c fsync=off -c password_encryption=scram-sha-256' start >/dev/null 2>&1`) : init;
    if (init.status !== 0 || start.status !== 0) { console.error('NOT RUN: could not start a throwaway scram cluster:', init.stderr || start.stderr); scram.stop(); process.exit(2); }
    const sadmin = new pg.Pool({ host: cdir, port: cport, user: 'bkadmin', database: 'postgres', max: 2 });
    const hba = (await sadmin.query(`select auth_method from pg_hba_file_rules where type = 'host' and address = '127.0.0.1'`)).rows.map((x) => x.auth_method);
    check('(setup) the throwaway cluster listens on 127.0.0.1 and requires scram-sha-256 on TCP (a wrong or missing password cannot connect)', hba.length > 0 && hba.every((m: string) => m === 'scram-sha-256'), hba);
    await sadmin.query('create database bkdb');
    await sadmin.query('create database "db with space"');
    for (const d of ['bkdb', 'db with space']) {
      const q = new pg.Pool({ host: cdir, port: cport, user: 'bkadmin', database: d, max: 1 });
      await q.query('create table notes (id int primary key, body text)');
      await q.query(`insert into notes select g, 'row ' || g from generate_series(1, 40) g`);
      await q.end();
    }
    const frags = (v: string) => { const o = new Set<string>(); for (let i = 0; i < v.length; i++) for (let j = i + 3; j <= v.length; j++) o.add(v.slice(i, j)); return [...o]; };
    // every alphanumeric run is at most 2 long, so no 3-character fragment is plain text that could turn up in a path or a message
    const PW_ALL = ['Zq', '@', '7x', ':', 'Kd', '\'', '9m', '"', 'Wp', '$', 'Rt', ' ', 'Lv', '%', 'Xn', '\\', 'Bc', '!', '4h', '*', 'Jy'].join('');
    const sc: Array<{ label: string; role: string; pw: string; enc: string; db?: string; dbEnc?: string }> = [
      { label: 'every URL-hostile character, percent-encoded', role: 'bk.user', pw: PW_ALL, enc: encodeURIComponent(PW_ALL) },
      { label: 'a RAW @ and : (user:Zq@7x:Kd@host — the review\'s shape)', role: 'bk.raw', pw: 'Zq@7x:Kd', enc: 'Zq@7x:Kd' },
      { label: 'two raw @', role: 'bk.two', pw: 'Tr@0u@Hx', enc: 'Tr@0u@Hx' },
      { label: '%40 and %3A (encoded @ and :)', role: 'bk.enc', pw: 'Zq@7x:Kd', enc: 'Zq%407x%3AKd' },
      { label: 'the literal text %40 (encoded as %2540)', role: 'bk.pct', pw: 'Zq%407xKd', enc: 'Zq%25407xKd' },
      { label: 'quotes, $ and a space, a user name with a space, a database name with a space', role: 'we ird-user', pw: 'Pw\'9m"Wp$Rt Lv', enc: 'Pw\'9m"Wp%24Rt%20Lv', db: 'db with space', dbEnc: 'db%20with%20space' },
      { label: 'a newline inside the password', role: 'bk.nl', pw: 'Zq\n7x', enc: 'Zq%0A7x' },
    ];
    const cl = await sadmin.connect();
    for (const c of sc) { await cl.query(`create role "${c.role}" login password ${cl.escapeLiteral(c.pw)}`); await cl.query(`grant pg_read_all_data to "${c.role}"`); }
    cl.release();
    const leaks = (out: string, pw: string, enc: string, user: string, userEnc: string) => [...frags(pw).filter((f) => out.includes(f)), ...[enc, user, userEnc].filter((f) => f.length >= 3 && out.includes(f))];
    const scramRun = (userEnc: string, pwEnc: string | null, db: string, tag: string) => {
      const dir = path.join(work, `scram_${tag}`);
      const u = `postgresql://${userEnc}${pwEnc === null ? '' : ':' + pwEnc}@127.0.0.1:${cport}/${db}`;
      const x = backup(u, dir);
      return { x, files: filesIn(dir), dir, all: x.stdout + x.stderr + '\n' + filesIn(dir).join('\n') };
    };
    let n = 0;
    for (const c of sc) {
      const userEnc = encodeURIComponent(c.role);
      const good = scramRun(userEnc, c.enc, c.dbEnc ?? 'bkdb', `ok${++n}`);
      const dumped = good.files.length === 1 ? gunzipSync(readFileSync(path.join(good.dir, good.files[0]!))).toString() : '';
      check(`[${c.label}] a correct password authenticates: exit 0, "Backup complete", a dump that holds the table`, good.x.status === 0 && /Backup complete/.test(good.x.stdout) && dumped.includes('COPY public.notes') && dumped.includes('row 40'), [good.x.status, good.x.stderr.slice(-300), good.x.stdout.slice(-200)]);
      const lk = leaks(good.all, c.pw, c.enc, c.role, userEnc);
      check('   …stdout, stderr and the file name contain no 3+ character piece of the password, not its encoded form, not the user name, no URL', lk.length === 0 && !/postgres(ql)?:\/\//.test(good.all), lk);
      const bad = scramRun(userEnc, encodeURIComponent(c.pw + 'Q'), c.dbEnc ?? 'bkdb', `bad${n}`);
      const lk2 = [...leaks(bad.all, c.pw + 'Q', encodeURIComponent(c.pw + 'Q'), c.role, userEnc), ...leaks(bad.all, c.pw, c.enc, c.role, userEnc)];
      check('   …a WRONG password is refused by the server: exit non-zero, no file, "password authentication failed for user "<user>"", nothing of either password and no user name', bad.x.status !== 0 && bad.files.length === 0 && /password authentication failed for user "<user>"/.test(bad.x.stderr) && lk2.length === 0, [bad.x.status, bad.x.stderr.slice(-300), lk2]);
    }
    const nopw = scramRun('bk.user', null, 'bkdb', 'nopw');
    check('no password at all: the server wants one — exit non-zero, no file, no user name', nopw.x.status !== 0 && nopw.files.length === 0 && /no password supplied/.test(nopw.x.stderr) && !nopw.all.includes('bk.user'), [nopw.x.status, nopw.x.stderr.slice(-200)]);
    const ghost = scramRun('nobody.here', 'x', 'bkdb', 'ghost');
    check('a role that does not exist: refused, no file, the user name is not printed', ghost.x.status !== 0 && ghost.files.length === 0 && /<user>/.test(ghost.x.stderr) && !ghost.all.includes('nobody.here'), [ghost.x.status, ghost.x.stderr.slice(-200)]);
    const forged = scramRun('bk.user', encodeURIComponent(PW_ALL), 'x%0A%1B[0;32m%E2%9C%93%20Backup%20complete%1B[0m%0A%20%20File:%20backups/fake.sql.gz', 'forged');
    check('a database name that forges a "Backup complete" line and an escape sequence is refused before any connection (real server: no login attempt, nothing echoed)', forged.x.status !== 0 && !/Backup complete/.test(forged.all) && !forged.all.replace(/\u001b\[0(;3\d)?m/g, '').includes('\u001b') && !/fake\.sql/.test(forged.all) && forged.files.length === 0, [forged.x.status, JSON.stringify(forged.all.slice(0, 300))]);
  } finally {
    await admin.query(`drop database if exists "${restoreDb}"`).catch(() => {});
    await admin.query(`drop owned by "${roleNoRead}"`).catch(() => {});
    await admin.query(`drop role if exists "${roleNoRead}"`).catch(() => {});
    await admin.query(`drop owned by "adlytic_bk_reader_${sfx}"`).catch(() => {});
    await admin.query(`drop role if exists "adlytic_bk_reader_${sfx}"`).catch(() => {});
    for (const d of extraDbs) await admin.query(`drop database if exists "${d}"`).catch(() => {});
    scram?.stop();
    await srcPool.end().catch(() => {}); await admin.end().catch(() => {});
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`\n${pass} passed, ${fail} failed   (source: ${dbName}, restored into: ${restoreDb}, dropped)`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_backup_database_pg crashed:', e); process.exit(1); });
