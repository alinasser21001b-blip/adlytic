// ═════════════════════════════════════════════════════════════════════════
//  test_backup_database.ts — backup_database.command
//
//  The script used to (1) print DATABASE_URL, password included; (2) run
//  `PGPASSWORD="" pg_dump … 2>/dev/null | gzip > file` — the pipeline's status is
//  gzip's, so a failed dump left a 20-byte file and the script said "Backup
//  complete"; (3) when pg_dump was missing, run `npx prisma db push` against the
//  database — a SCHEMA WRITE in a "backup" script.
//
//  No database here: pg_dump is a shim that records how it was called and
//  misbehaves on demand. The proof against a real server (a valid dump restores
//  in an isolated database; a role that cannot read fails the command) is
//  test_backup_database_pg.ts. BACKUP_SCRIPT=<path> points this test at another
//  copy of the script (used to show it is RED on the old one).
// ═════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

const ROOT = process.cwd();
const SCRIPT = path.resolve(process.env['BACKUP_SCRIPT'] ?? path.join(ROOT, 'backup_database.command'));
const PASSWORD = 'S3cr3t:P@ss/w0rd#1?x';                    // synthetic; every URL-significant character
const PASSWORD_ENC = encodeURIComponent(PASSWORD);
const USER = 'bk.user';
const URL_FULL = `postgresql://${USER}:${PASSWORD_ENC}@db.example.invalid:6543/prod_db?sslmode=require&application_name=a=b`;

const work = mkdtempSync(path.join(tmpdir(), 'adlytic-backup-test-'));
const binDir = path.join(work, 'bin');            // the tools the script may use — and no pg_dump, npx or prisma
const shimDir = path.join(work, 'shims');         // pg_dump / npx / prisma / pg_restore / psql shims
mkdirSync(binDir); mkdirSync(shimDir);
for (const t of ['bash', 'sh', 'env', 'sed', 'tail', 'head', 'grep', 'gzip', 'gunzip', 'cat', 'rm', 'mv', 'mkdir', 'mktemp', 'date', 'ls', 'awk', 'dirname', 'basename', 'cut', 'tr', 'wc', 'chmod', 'cp', 'true', 'false', 'printf', 'od']) {
  const r = spawnSync('sh', ['-c', `command -v ${t}`], { encoding: 'utf8' });
  const p = r.stdout.trim();
  if (p) symlinkSync(p, path.join(binDir, t));
}
const SHIM_LOG = path.join(work, 'shim.log');
const shim = (name: string, body: string) => { const f = path.join(shimDir, name); writeFileSync(f, `#!/bin/bash\n${body}\n`); chmodSync(f, 0o755); };
shim('pg_dump', `
hex=""; for ((i = 0; i < \${#PGPASSWORD}; i++)); do printf -v x '%02x' "'\${PGPASSWORD:i:1}"; hex+=$x; done
{ echo "ARGS:$*"; echo "ENV:PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER PGDATABASE=$PGDATABASE PGSSLMODE=\${PGSSLMODE:-}"; echo "PASSWORD_SET:\${PGPASSWORD:+yes}"; echo "PASSWORD_VALUE:\${PGPASSWORD:-}"; echo "PASSWORD_HEX:$hex"; echo "USER_HEX:$(printf '%s' "$PGUSER" | od -An -tx1 | tr -d ' \\n')"; } >> "$SHIM_LOG"
if [ -f "$DUMP_DIR/$SHIM_MODE.sql" ]; then                 # data-driven modes: the exact bytes pg_dump writes, what it says on stderr, and how it exits
  cat "$DUMP_DIR/$SHIM_MODE.sql"
  if [ -f "$DUMP_DIR/$SHIM_MODE.err" ]; then e="$(cat "$DUMP_DIR/$SHIM_MODE.err")"; e="\${e//@USER_ENC@/\${ENC_USER:-}}"; e="\${e//@PASS_ENC@/\${ENC_PASS:-}}"; e="\${e//@USER@/$PGUSER}"; e="\${e//@PASS@/$PGPASSWORD}"; echo "$e" >&2; fi
  exit "$(cat "$DUMP_DIR/$SHIM_MODE.exit")"
fi
case "$SHIM_MODE" in
  ok)        printf -- '-- PostgreSQL database dump\\nCREATE TABLE t (id int);\\nCOPY t FROM stdin;\\n1\\n\\\\.\\n-- PostgreSQL database dump complete\\n'; exit 0;;
  fail)      echo "pg_dump: error: connection to server failed: FATAL:  no pg_hba.conf entry" >&2; exit 1;;
  partial)   printf -- '-- PostgreSQL database dump\\nCREATE TABLE t (id int);\\nCOPY t FROM stdin;\\n1\\n'; echo "pg_dump: error: query failed: permission denied for table t" >&2; exit 1;;
  empty)     exit 0;;
  truncated) printf -- '-- PostgreSQL database dump\\nCREATE TABLE t (id int);\\nCOPY t FROM stdin;\\n1\\n'; exit 0;;
  echopass)  echo "pg_dump: error: password authentication failed (password was: $PGPASSWORD)" >&2; exit 1;;
esac
exit 3`);
// gzip: delegates to the real one, except that it can damage the stream it WRITES (flip a byte, drop the trailer, append garbage),
// or claim that `gzip -t` fails (GZIP_MODE=lie_t: the only way to tell the -t check apart from the decompress-and-read-it check)
shim('gzip', `
case " $* " in
  *" -t "*) if [ "\${GZIP_MODE:-}" = lie_t ]; then echo "gzip: shim says the stream is corrupt" >&2; exit 1; fi; exec "$REAL_GZIP" "$@";;
  *" -d"*|*" -c "*)   # GZIP_DEC_FAIL_AFTER=N: the (N+1)th decompression dies half-way (a file that changed or a read error AFTER it was verified)
    if [ -n "\${GZIP_DEC_FAIL_AFTER:-}" ]; then n=$(( $(cat "$GZIP_COUNTER" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$GZIP_COUNTER"
      if [ "$n" -gt "$GZIP_DEC_FAIL_AFTER" ]; then "$REAL_GZIP" "$@" | head -c 100; echo "gzip: shim: read error" >&2; exit 1; fi; fi
    exec "$REAL_GZIP" "$@";;
esac
echo "GZIP_ENV: PGPASSWORD=\${PGPASSWORD:+set} PGUSER=\${PGUSER:+set}" >> "$SHIM_LOG"
if [ -n "\${GZIP_MODE:-}" ] && [ "$GZIP_MODE" != lie_t ]; then exec "$NODE_BIN" "$DAMAGE_JS" "$GZIP_MODE"; fi
exec "$REAL_GZIP" "$@"`);
shim('date', 'echo 20260101_000000');                     // a fixed clock: two runs in the "same second"
shim('npx', 'echo "npx $*" >> "$SHIM_LOG_CALLS"; exit 0');
shim('prisma', 'echo "prisma $*" >> "$SHIM_LOG_CALLS"; exit 0');
shim('psql', 'echo "psql $*" >> "$SHIM_LOG_CALLS"; if [ -n "${PSQL_STDIN_LOG:-}" ]; then cat > "$PSQL_STDIN_LOG"; fi; exit "${PSQL_EXIT:-0}"');
const CALLS_LOG = path.join(work, 'calls.log');

// ── fixtures: what a pg_dump writes, byte for byte (modes of the shim above) ──
// A real pg_dump 16 ends   `--` / `-- PostgreSQL database dump complete` / `--` / blank / `\unrestrict <key>` / blank.
const MARK = '-- PostgreSQL database dump complete';
const KEY = 'Zk3Qm9Wr7TbXc2Lp';
const TOP = `--\n-- PostgreSQL database dump\n--\n\n\\restrict ${KEY}\n\nCREATE TABLE public.t (id integer);\n\nCOPY public.t (id) FROM stdin;\n1\n2\n\\.\n\n`;
const END_NEW = `\n--\n${MARK}\n--\n\n\\unrestrict ${KEY}\n\n`;     // pg_dump >= the 2025-08 minor releases
const END_OLD = `\n--\n${MARK}\n--\n\n`;                         // older pg_dump: no \unrestrict
const dumps: Record<string, { sql: string; exit?: number; err?: string }> = {
  // accepted: a complete dump
  real_trailer:        { sql: TOP + END_NEW },
  old_trailer:         { sql: TOP + END_OLD },
  marker_row_but_closed: { sql: `${TOP}CREATE TABLE public.n (note text);\n\nCOPY public.n (note) FROM stdin;\n${MARK}\n\\.\n${END_NEW}` },   // a table whose ROW is the marker text, COPY closed, dump complete: must not be refused
  // refused: pg_dump exits 0, the stream is not a complete dump — every one of them has the marker text in it
  cut_marker_row_open_copy: { sql: `${TOP}COPY public.n (note) FROM stdin;\nrow 1\n${MARK}\n` },                    // one-column table, a row that IS the marker, cut right there: a line-anchored check alone accepts it
  cut_marker_row_then_rows: { sql: `${TOP}COPY public.n (id, note) FROM stdin;\n1\tx\n2\t${MARK}\n3\ty\n4\tz\n` },    // marker inside the last 5 lines, mid-table
  cut_marker_substring:     { sql: `${TOP}COPY public.n (id, note) FROM stdin;\n1\tx\n2\tfoo ${MARK} bar\n` },
  cut_after_marker_stuff:   { sql: `${TOP}SELECT 1;\n${END_OLD}SELECT 2;\nSELECT 3;\n` },                              // a marker mid-stream, 4 lines before the cut
  cut_after_marker_far:     { sql: `${TOP}SELECT 1;\n${END_OLD}SELECT 2;\nSELECT 3;\nSELECT 4;\nSELECT 5;\nSELECT 6;\nSELECT 7;\nSELECT 8;\n` },   // …and 8 lines
  garbage_after_complete:   { sql: `${TOP}${END_NEW}DROP TABLE public.users;\n` },
  second_dump_cut:          { sql: `${TOP}${END_NEW}COPY public.u (a) FROM stdin;\nx\n` },
  second_copy_closed:       { sql: `${TOP}${END_NEW}COPY public.u (a) FROM stdin;\nx\n\\.\n` },     // a complete dump, then another COPY that is closed but has no marker after it
  // refused: pg_dump itself reports a failure
  complete_then_exit1:      { sql: TOP + END_NEW, exit: 1, err: 'pg_dump: error: connection to the server was lost' },
  // messages that name the user and the password (a libpq that says who failed; a build that echoes the password)
  auth_failed:    { sql: '', exit: 1, err: 'pg_dump: error: connection to server at "db.example.invalid" (10.0.0.9), port 6543 failed: FATAL:  password authentication failed for user "@USER@"' },
  role_missing:   { sql: '', exit: 1, err: 'pg_dump: error: connection to server at "db.example.invalid" (10.0.0.9), port 6543 failed: FATAL:  role "@USER@" does not exist' },
  echo_both:      { sql: '', exit: 1, err: 'pg_dump: error: could not connect as @USER@ with password @PASS@ (user=@USER@ password=@PASS@)' },
  echo_enc:       { sql: '', exit: 1, err: 'pg_dump: error: invalid connection string postgresql://@USER_ENC@:@PASS_ENC@@db.example.invalid/prod_db' },
};
const DUMP_DIR = path.join(work, 'dumps');
mkdirSync(DUMP_DIR);
for (const [name, d] of Object.entries(dumps)) {
  writeFileSync(path.join(DUMP_DIR, `${name}.sql`), d.sql);
  writeFileSync(path.join(DUMP_DIR, `${name}.exit`), String(d.exit ?? 0));
  if (d.err !== undefined) writeFileSync(path.join(DUMP_DIR, `${name}.err`), d.err);
}
// the stream the gzip shim writes when it is told to damage it (stdin = what pg_dump wrote)
const DAMAGE_JS = path.join(work, 'damage.js');
writeFileSync(DAMAGE_JS, `const zlib = require('zlib'); const mode = process.argv[2]; const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => { let z = zlib.gzipSync(Buffer.concat(chunks));
  if (mode === 'flip') z[Math.floor(z.length / 2)] ^= 0x40;
  else if (mode === 'notrailer') z = z.subarray(0, z.length - 8);
  else if (mode === 'garbage') z = Buffer.concat([z, Buffer.from('trailing-garbage')]);
  else if (mode === 'truncate') z = z.subarray(0, Math.floor(z.length * 0.6));
  process.stdout.write(z); });\n`);
const REAL_GZIP = spawnSync('sh', ['-c', 'command -v gzip'], { encoding: 'utf8' }).stdout.trim();

interface Run { status: number | null; out: string; err: string; all: string; files: string[]; dir: string; shimLog: string; calls: string }
let seq = 0;
function run(opts: { env?: string | null; mode?: string; noPgDump?: boolean; extraEnv?: Record<string, string>; before?: (dir: string) => void; args?: string[]; cwd?: string }): Run {
  const dir = path.join(work, `case${++seq}`);
  mkdirSync(dir);
  const script = path.join(dir, 'backup_database.command');
  copyFileSync(SCRIPT, script); chmodSync(script, 0o755);
  if (opts.env !== null && opts.env !== undefined) writeFileSync(path.join(dir, '.env'), opts.env);
  opts.before?.(dir);
  writeFileSync(SHIM_LOG, ''); writeFileSync(CALLS_LOG, '');
  const pathVar = opts.noPgDump ? `${binDir}` : `${shimDir}:${binDir}`;
  // npx/prisma must be findable (so a fallback COULD run) even when pg_dump is absent: put them in a second shim dir
  const noPgDir = path.join(work, 'shims_no_pgdump');
  if (opts.noPgDump && !existsSync(noPgDir)) { mkdirSync(noPgDir); for (const n of ['npx', 'prisma', 'psql']) symlinkSync(path.join(shimDir, n), path.join(noPgDir, n)); }
  const env: Record<string, string> = {
    PATH: opts.noPgDump ? `${noPgDir}:${binDir}` : pathVar, HOME: work, TMPDIR: work, SHIM_MODE: opts.mode ?? 'ok', SHIM_LOG, SHIM_LOG_CALLS: CALLS_LOG,
    DUMP_DIR, REAL_GZIP, NODE_BIN: process.execPath, DAMAGE_JS, GZIP_COUNTER: path.join(work, 'gzip.counter'), ...(opts.extraEnv ?? {}),
  };
  const r = spawnSync(path.join(binDir, 'bash'), [script, ...(opts.args ?? [])], { cwd: opts.cwd ?? dir, env, encoding: 'utf8', timeout: 60_000 });
  const bdir = path.join(dir, 'backups');
  return {
    status: r.status, out: r.stdout ?? '', err: r.stderr ?? '', all: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    files: existsSync(bdir) ? readdirSync(bdir) : [], dir, shimLog: readFileSync(SHIM_LOG, 'utf8'), calls: readFileSync(CALLS_LOG, 'utf8'),
  };
}
const dotenv = (extra = '') => `${extra}DATABASE_URL=${URL_FULL}\n`;
const secrets = (s: string) => [PASSWORD, PASSWORD_ENC, USER, 'S3cr3t'].filter((x) => s.includes(x));
const COMPLETE = '-- PostgreSQL database dump\nCREATE TABLE t (id int);\nCOPY t FROM stdin;\n1\n\\.\n-- PostgreSQL database dump complete\n';

// ── 1. the good path ────────────────────────────────────────────────────
console.log('\n── 1. a complete dump: backed up, verified, and no secret printed ──');
let r = run({ env: dotenv(), mode: 'ok' });
const good = r.files.filter((f) => f.endsWith('.sql.gz'));
check('exit 0 and "Backup complete"', r.status === 0 && /Backup complete/.test(r.out), [r.status, r.out.slice(-200)]);
check('exactly one backups/adlytic_backup_*.sql.gz — and no *.partial left', good.length === 1 && r.files.length === 1 && /^adlytic_backup_\d{8}_\d{6}\.sql\.gz$/.test(good[0] ?? ''), r.files);
check('…it is a valid gzip of the dump pg_dump produced', good.length === 1 && gunzipSync(readFileSync(path.join(r.dir, 'backups', good[0]!))).toString() === COMPLETE);
check('…readable by the owner only (0600): it holds customer data', good.length === 1 && (statSync(path.join(r.dir, 'backups', good[0]!)).mode & 0o777) === 0o600, good.length === 1 ? (statSync(path.join(r.dir, 'backups', good[0]!)).mode & 0o777).toString(8) : null);
check('NOTHING secret is printed: not the password (plain or encoded), not the user name, not the URL', secrets(r.all).length === 0 && !/postgres(ql)?:\/\//.test(r.all) && !/s3cr3t/i.test(r.all), secrets(r.all));
check('…it names only the database and host:port', /Database: prod_db on db\.example\.invalid:6543/.test(r.out));
check('pg_dump got the decoded password through its ENVIRONMENT, and not on its command line', /PASSWORD_VALUE:S3cr3t:P@ss\/w0rd#1\?x/.test(r.shimLog) && !/ARGS:.*(S3cr3t|P@ss|bk\.user)/.test(r.shimLog), r.shimLog);
check('…user, host, port, database and sslmode were decoded from the URL', /PGHOST=db\.example\.invalid PGPORT=6543 PGUSER=bk\.user PGDATABASE=prod_db PGSSLMODE=require/.test(r.shimLog), r.shimLog);
check('…pg_dump was called with --no-password (never prompts) and nothing that writes', /ARGS:--no-password --no-owner --no-privileges\b/.test(r.shimLog) && !/--clean|--create|-f |--file/.test(r.shimLog), r.shimLog);
check('…and neither npx nor prisma was ever run', r.calls === '', r.calls);

// ── 2. every way a dump can fail, fails the command ─────────────────────
console.log('\n── 2. a failing dump fails the command and leaves no file ──');
const modes: Array<[string, string]> = [
  ['pg_dump exits 1 with nothing on stdout (the old script: gzip\'s status won, "Backup complete", a 20-byte file)', 'fail'],
  ['pg_dump writes half a dump, then exits 1', 'partial'],
  ['pg_dump exits 0 and writes NOTHING (an empty gzip)', 'empty'],
  ['pg_dump exits 0 but the dump has no completion marker (cut off)', 'truncated'],
];
for (const [label, mode] of modes) {
  r = run({ env: dotenv(), mode });
  check(`${label}: non-zero exit`, r.status !== null && r.status !== 0, r.status);
  check('   …no "Backup complete", no file of any kind in backups/ (no .sql.gz, no .partial)', !/Backup complete/.test(r.all) && r.files.length === 0, [r.files, r.all.slice(-160)]);
  check('   …it says it failed and nothing was written, and prints no secret', /no backup was written/i.test(r.all) && secrets(r.all).length === 0, [secrets(r.all), r.all.slice(-200)]);
  check('   …npx/prisma not run', r.calls === '', r.calls);
}
r = run({ env: dotenv(), mode: 'fail' });
check('pg_dump\'s own error text is shown (a failure must be diagnosable)', /no pg_hba\.conf entry/.test(r.err), r.err);
r = run({ env: dotenv(), mode: 'echopass' });
check('even if a pg_dump build echoed the password into its error, the script redacts it', r.status !== 0 && !r.all.includes(PASSWORD) && /\*\*\*/.test(r.all), r.all);

// ── 3. no schema-writing fallback ───────────────────────────────────────
console.log('\n── 3. without pg_dump the script stops; it never writes to the database ──');
r = run({ env: dotenv(), noPgDump: true });
check('pg_dump missing: non-zero exit, a message naming pg_dump and the install hint', r.status !== null && r.status !== 0 && /pg_dump not found/.test(r.all) && /postgresql-client|libpq/.test(r.all), [r.status, r.all.slice(-200)]);
check('…`npx prisma db push` (or any npx/prisma/psql command) was NOT run', r.calls === '', r.calls);
check('…no backup file, no "Backup complete"', r.files.length === 0 && !/Backup complete/.test(r.all), r.files);
const src = readFileSync(SCRIPT, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
check('the script text has no db push, no prisma, no npx, no `|| true`, no `2>/dev/null` on pg_dump, and uses pipefail', !/db push|prisma|npx|\|\|\s*true/.test(src) && !/pg_dump[^\n]*2>\/dev\/null/.test(src) && /set -euo pipefail/.test(src), src.match(/db push|prisma|npx|\|\|\s*true/g));
check('…it never echoes the connection string or its parts (no echo/printf of url, password or user)', !/(echo|printf)[^\n]*\$\{?(url|db_pass|db_user|DATABASE_URL|PGPASSWORD|PGUSER)\b/.test(src.replace(/pct_decode[^\n]*/g, '')), src.match(/(echo|printf)[^\n]*\$\{?(url|db_pass|db_user|DATABASE_URL)\b[^\n]*/g));

// ── 4. configuration ────────────────────────────────────────────────────
console.log('\n── 4. where the URL comes from, and refusing a bad one without echoing it ──');
r = run({ env: null, mode: 'ok' });
check('no DATABASE_URL anywhere → fails, pg_dump never called', r.status !== 0 && /DATABASE_URL is not set/.test(r.all) && r.shimLog === '' && r.files.length === 0, [r.status, r.all.slice(-150)]);
r = run({ env: '# DATABASE_URL=postgresql://x:y@z/db\nSHADOW_DATABASE_URL=postgresql://shadow:pw@h/shadow\n', mode: 'ok' });
check('a commented line and SHADOW_DATABASE_URL are not DATABASE_URL → fails, pg_dump never called', r.status !== 0 && r.shimLog === '', [r.status, r.all.slice(-150)]);
r = run({ env: `# DATABASE_URL=postgresql://wrong:wrong@wrong/wrong\nSHADOW_DATABASE_URL=postgresql://shadow:pw@h/shadow\nexport DATABASE_URL="${URL_FULL}"\r\nOTHER=1\n`, mode: 'ok' });
check('an `export`ed, double-quoted, CRLF line is read; the comment and the shadow URL are ignored', r.status === 0 && /PGHOST=db\.example\.invalid .*PGDATABASE=prod_db/.test(r.shimLog), r.shimLog);
r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: URL_FULL } });
check('DATABASE_URL from the environment works without a .env file', r.status === 0 && /PGHOST=db\.example\.invalid/.test(r.shimLog), [r.status, r.all.slice(-150)]);
r = run({ env: 'DATABASE_URL=postgresql://nouser-nopass-nohost\n', mode: 'ok' });
check('a malformed URL → fails WITHOUT printing it; pg_dump never called', r.status !== 0 && !r.all.includes('nouser') && /not of the form/.test(r.all) && r.shimLog === '', r.all);
r = run({ env: 'DATABASE_URL=postgresql://u:p4ss%2Fw@h.example.invalid/db?x=1\n', mode: 'ok' });
check('no explicit port → 5432; a password with %2F decodes to /', r.status === 0 && /PGPORT=5432/.test(r.shimLog) && /PASSWORD_VALUE:p4ss\/w/.test(r.shimLog), r.shimLog);
r = run({ env: 'DATABASE_URL=postgresql://u@h.example.invalid/db\n', mode: 'ok' });
check('a URL without a password → PGPASSWORD is not set (never an empty string that overrides ~/.pgpass)', r.status === 0 && /PASSWORD_SET:\n/.test(r.shimLog), r.shimLog);

// ── 5. existing backups are never touched ───────────────────────────────
console.log('\n── 5. an earlier backup survives a later failure, and is never overwritten ──');
const keep = (d: string) => { mkdirSync(path.join(d, 'backups')); writeFileSync(path.join(d, 'backups', 'adlytic_backup_older.sql.gz'), 'previous good backup'); };
r = run({ env: dotenv(), mode: 'fail', before: keep });
check('a failed run leaves the earlier backup exactly as it was, and removes only its own partial file', r.files.length === 1 && r.files[0] === 'adlytic_backup_older.sql.gz' && readFileSync(path.join(r.dir, 'backups', 'adlytic_backup_older.sql.gz'), 'utf8') === 'previous good backup', r.files);
const a = run({ env: dotenv(), mode: 'ok' });
const b = spawnSync(path.join(binDir, 'bash'), [path.join(a.dir, 'backup_database.command')], { cwd: a.dir, env: { PATH: `${shimDir}:${binDir}`, HOME: work, TMPDIR: work, SHIM_MODE: 'ok', SHIM_LOG, SHIM_LOG_CALLS: CALLS_LOG, DUMP_DIR, REAL_GZIP, NODE_BIN: process.execPath, DAMAGE_JS }, encoding: 'utf8' });
const both = readdirSync(path.join(a.dir, 'backups')).sort();
check('two successful runs in the SAME second (fixed clock) produce two distinct files — the first is not overwritten', a.status === 0 && b.status === 0 && JSON.stringify(both) === JSON.stringify(['adlytic_backup_20260101_000000.sql.gz', 'adlytic_backup_20260101_000000_1.sql.gz']), both);

// ── 6. "complete" means the dump ENDS with pg_dump's marker, not that the marker text occurs near the end ──
console.log('\n── 6. a dump is complete only if it ENDS with pg_dump\'s completion marker ──');
const readBackup = (x: Run) => gunzipSync(readFileSync(path.join(x.dir, 'backups', x.files[0]!))).toString();
for (const [label, mode] of [
  ['a real pg_dump 16 ending: marker, --, blank, \\unrestrict <key>, blank', 'real_trailer'],
  ['an older pg_dump ending: marker, --, blank (no \\unrestrict)', 'old_trailer'],
  ['a table with a ROW that is the marker text, COPY closed, dump complete (must not be refused)', 'marker_row_but_closed'],
] as const) {
  r = run({ env: dotenv(), mode });
  check(`accepted: ${label}`, r.status === 0 && /Backup complete/.test(r.out) && r.files.length === 1 && r.files[0]!.endsWith('.sql.gz') && readBackup(r) === dumps[mode]!.sql, [r.status, r.files, r.all.slice(-200)]);
}
for (const [label, mode] of [
  ['the marker text is the LAST LINE but it is a row of an unfinished COPY (one-column table, cut right there)', 'cut_marker_row_open_copy'],
  ['the marker text is a data row with 2 more rows after it, inside the last 5 lines', 'cut_marker_row_then_rows'],
  ['the marker text is inside a data cell (a substring of the last line)', 'cut_marker_substring'],
  ['a real-looking ending in the MIDDLE of the stream, 4 lines before the cut', 'cut_after_marker_stuff'],
  ['…and 8 lines before the cut', 'cut_after_marker_far'],
  ['a complete dump followed by more SQL (the marker is not the end)', 'garbage_after_complete'],
  ['a complete dump followed by the start of another COPY that never ends', 'second_dump_cut'],
  ['a complete dump followed by another COPY block that ends but is not followed by a marker', 'second_copy_closed'],
] as const) {
  r = run({ env: dotenv(), mode });
  check(`refused (pg_dump exits 0): ${label}`, r.status !== null && r.status !== 0 && !/Backup complete/.test(r.all) && r.files.length === 0 && /incomplete/.test(r.err) && /no backup was written/i.test(r.err), [r.status, r.files, r.all.slice(-200)]);
}

// ── 7. the gzip stream is verified, and pg_dump's exit status counts even when the stream looks complete ──
console.log('\n── 7. a damaged gzip, or a pg_dump that failed after writing a complete-looking dump, is refused ──');
for (const [label, gz] of [['one byte flipped in the middle', 'flip'], ['the 8-byte CRC/length trailer missing', 'notrailer'], ['garbage appended after the stream', 'garbage'], ['cut at 60%', 'truncate']] as const) {
  r = run({ env: dotenv(), mode: 'real_trailer', extraEnv: { GZIP_MODE: gz } });
  check(`refused: gzip output with ${label} (the dump itself is complete)`, r.status !== null && r.status !== 0 && !/Backup complete/.test(r.all) && r.files.length === 0 && /not a valid gzip/.test(r.err), [r.status, r.files, r.err.slice(-200)]);
}
r = run({ env: dotenv(), mode: 'real_trailer', extraEnv: { GZIP_MODE: 'lie_t' } });
check('refused: `gzip -t` reports the stream corrupt (decompressing it still works): the verdict of gzip -t is honoured', r.status !== null && r.status !== 0 && r.files.length === 0 && /not a valid gzip/.test(r.err), [r.status, r.files, r.err]);
r = run({ env: dotenv(), mode: 'complete_then_exit1' });
check('refused: pg_dump writes a COMPLETE dump (marker and all) and then exits 1 — pipefail, not the stream, decides', r.status !== null && r.status !== 0 && !/Backup complete/.test(r.all) && r.files.length === 0 && /pg_dump failed/.test(r.err), [r.status, r.files, r.err]);

// ── 8. nothing that identifies the login is printed: not the password in any form, not the user name ──
console.log('\n── 8. no part of the password and not the user name is printed, whatever shape of URL carries them ──');
const frags = (v: string) => { const o = new Set<string>(); for (let i = 0; i < v.length; i++) for (let j = i + 3; j <= v.length; j++) o.add(v.slice(i, j)); return [...o]; };
const leaks = (out: string, pw: string, pwEnc: string, user: string, userEnc: string, userFrags = false) => [...frags(pw).filter((f) => out.includes(f)), ...(userFrags ? frags(user).filter((f) => out.includes(f)) : []), ...[pwEnc, user, userEnc].filter((f) => f.length >= 3 && out.includes(f))];
// every alphanumeric run is at most 2 long, so no 3-character fragment is plain text that could occur in a path or a message
const PW_ALL = ['Zq', '@', '7x', ':', 'Kd', '\'', '9m', '"', 'Wp', '$', 'Rt', ' ', 'Lv', '%', 'Xn', '\\', 'Bc', '!', '4h', '*', 'Jy'].join('');
const pwCases: Array<{ label: string; userinfo: string; user: string; pw: string; userFrags?: boolean }> = [
  { label: 'every URL-hostile character, percent-encoded', userinfo: `${USER}:${encodeURIComponent(PW_ALL)}`, user: USER, pw: PW_ALL },
  { label: 'a RAW @ and : in the password (the review\'s repro shape: user:Zq7@Hx4Kd@host)', userinfo: `${USER}:Zq@7x:Kd`, user: USER, pw: 'Zq@7x:Kd' },
  { label: 'two raw @ in the password', userinfo: `${USER}:Tr@0u@Hx`, user: USER, pw: 'Tr@0u@Hx' },
  { label: 'a raw @ right at the end of the password', userinfo: `${USER}:Qv9Lm@`, user: USER, pw: 'Qv9Lm@' },
  { label: '%40 (an encoded @) and %3A', userinfo: `${USER}:Zq%407x%3AKd`, user: USER, pw: 'Zq@7x:Kd' },
  { label: 'the literal text %40 in the password (encoded as %2540)', userinfo: `${USER}:Zq%25407xKd`, user: USER, pw: 'Zq%407xKd' },
  { label: 'quotes, $ and a space (%20), and a user name with a space', userinfo: `we%20ird-user:Pw'9m"Wp$Rt%20Lv`, user: 'we ird-user', pw: 'Pw\'9m"Wp$Rt Lv' },
  { label: 'a newline inside the password (%0A): a message that wraps it must not show either half', userinfo: `${USER}:Zq%0A7x`, user: USER, pw: 'Zq\n7x' },
  { label: 'the password is a piece of the user name (svc-Zq7Kd / Zq7): redacting the password first would leave the rest of the user name', userinfo: 'svc-Zq7Kd:Zq7', user: 'svc-Zq7Kd', pw: 'Zq7', userFrags: true },
];
for (const c of pwCases) {
  const url = `postgresql://${c.userinfo}@db.example.invalid:6543/prod_db`;
  const userEnc = c.userinfo.split(':')[0]!;
  const pwEnc = c.userinfo.slice(userEnc.length + 1);
  const ok = run({ env: null, mode: 'real_trailer', extraEnv: { DATABASE_URL: url } });
  check(`[${c.label}] exit 0, and pg_dump got exactly this password (in its environment) and this host`, ok.status === 0 && ok.shimLog.includes(`PASSWORD_VALUE:${c.pw}\n`) && /PGHOST=db\.example\.invalid PGPORT=6543 /.test(ok.shimLog), [ok.status, ok.shimLog, ok.all.slice(-200)]);
  check('   …nothing printed contains the password (any 3+ character piece of it, or its encoded form), the user name, or the URL', leaks(ok.all + ok.files.join('\n'), c.pw, pwEnc, c.user, userEnc).length === 0 && !/postgres(ql)?:\/\//.test(ok.all), leaks(ok.all, c.pw, pwEnc, c.user, userEnc));
  for (const mode of ['echo_both', 'echo_enc', 'auth_failed', 'role_missing'] as const) {
    const f = run({ env: null, mode, extraEnv: { DATABASE_URL: url, ENC_USER: userEnc, ENC_PASS: pwEnc } });
    const what = mode === 'echo_both' ? ' and echoes the password' : mode === 'echo_enc' ? ' and the password in their %-encoded URL form' : '';
    const lk = leaks(f.all + f.files.join('\n'), c.pw, pwEnc, c.user, userEnc, c.userFrags);
    check(`   …[${mode}: pg_dump names the user${what}] the failure is relayed with both redacted`, f.status !== null && f.status !== 0 && /no backup was written/i.test(f.err) && /<user>/.test(f.err) && lk.length === 0, [f.status, f.err.slice(-300), lk]);
  }
}
r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: 'postgresql://u@h.example.invalid/db', PGPASSWORD: 'ambient-from-the-caller' } });
check('a URL without a password never picks up a PGPASSWORD of the caller\'s environment (it would be sent to whatever host the URL names)', r.status === 0 && /PASSWORD_SET:\n/.test(r.shimLog) && !r.shimLog.includes('ambient-from-the-caller'), r.shimLog);
r = run({ env: dotenv(), mode: 'ok' });
check('the password and the user reach pg_dump ONLY: the gzip that reads its output has neither in its environment', /GZIP_ENV: PGPASSWORD= PGUSER=\n/.test(r.shimLog) && /PASSWORD_SET:yes/.test(r.shimLog), r.shimLog);
r = run({ env: null, mode: 'auth_failed', extraEnv: { DATABASE_URL: URL_FULL } });
check('the relayed message keeps its meaning (what failed, host and port) and has no doubled "pg_dump: pg_dump:" prefix', /password authentication failed for user "<user>"/.test(r.err) && /db\.example\.invalid/.test(r.err) && !/pg_dump: pg_dump:/.test(r.err), r.err);
r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: 'postgresql://u:Zq7Kd@Hx4@127.0.0.1:54391/bkdb' } });
check('the review\'s exact repro shape: host is 127.0.0.1, not "Hx4@127.0.0.1" — it is not echoed as a host', r.status === 0 && /PGHOST=127\.0\.0\.1 PGPORT=54391 PGUSER=u PGDATABASE=bkdb/.test(r.shimLog) && /Database: bkdb on 127\.0\.0\.1:54391/.test(r.out) && !/Hx4|Zq7Kd/.test(r.all), [r.out, r.shimLog]);
for (const [label, u] of [
  ['@ in the host position cannot happen: nothing after the last @ may contain one', 'postgresql://u:pw@ho$t/db'],
  ['a host with a space', 'postgresql://u:pw@host name/db'],
  ['an empty host', 'postgresql://u:pw@/db'],
  ['a non-numeric port', 'postgresql://u:pw@host:port/db'],
  ['an IPv6 literal (documented as unsupported)', 'postgresql://u:pw@[::1]:5432/db'],
  ['no @ at all', 'postgresql://hostonly/db'],
  ['an unescaped / in the password', 'postgresql://u:pa/ss@host/db'],
  ['a fragment', 'postgresql://u:pw@host/db#frag'],
  ['an empty user', 'postgresql://:pw@host/db'],
  ['an empty database name', 'postgresql://u:pw@host/'],
  ['another scheme', 'mysql://u:pw@host/db'],
] as const) {
  r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: u } });
  check(`refused without echoing it: ${label}`, r.status !== null && r.status !== 0 && /not of the form/.test(r.err) && r.shimLog === '' && r.files.length === 0 && !/ho\$t|host name|frag|pa\/ss|mysql|pw/.test(r.all), [r.status, r.all, r.shimLog]);
}
r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: `postgresql://u:pw@h.example.invalid/${'d'.repeat(9000)}` } });
check('a DATABASE_URL of 9000+ characters is refused (an oversized environment makes every later exec fail with E2BIG); the value is not shown', r.status !== null && r.status !== 0 && /too long/.test(r.err) && r.shimLog === '' && !/ddddd/.test(r.all), [r.status, r.all.slice(0, 200)]);

// ── 9. a database or user name cannot forge output lines or drive the terminal; a malformed %-escape is refused ──
console.log('\n── 9. control characters in names and malformed %-escapes are refused without being echoed ──');
const REVIEW_NAME = 'x%0A%1B[0;32m%E2%9C%93%20Backup%20complete%1B[0m%0A%20%20File:%20backups/fake.sql.gz';
for (const [label, u] of [
  ['the review\'s forged database name: a fake "Backup complete" line, a fake "File:" line and ESC sequences', `postgresql://u:pw@h.example.invalid/${REVIEW_NAME}`],
  ['a newline in the database name', 'postgresql://u:pw@h.example.invalid/a%0Ab'],
  ['a carriage return in the database name', 'postgresql://u:pw@h.example.invalid/a%0Db'],
  ['ESC in the database name', 'postgresql://u:pw@h.example.invalid/a%1Bb'],
  ['a tab in the database name', 'postgresql://u:pw@h.example.invalid/a%09b'],
  ['DEL in the database name', 'postgresql://u:pw@h.example.invalid/a%7Fb'],
  ['the C1 control U+009B (CSI) in the database name', 'postgresql://u:pw@h.example.invalid/a%C2%9Bb'],
  ['a control character in the USER name', 'postgresql://bk%0Auser:pw@h.example.invalid/db'],
  ['ESC in the USER name', 'postgresql://bk%1B[2Juser:pw@h.example.invalid/db'],
] as const) {
  r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: u } });
  check(`refused, nothing echoed: ${label}`, r.status !== null && r.status !== 0 && /control character/.test(r.err) && r.shimLog === '' && r.files.length === 0 && !/Backup complete/.test(r.all) && !r.all.replace(/\u001b\[0(;3\d)?m/g, '').includes('\u001b') && !/fake\.sql\.gz|File:/.test(r.all) && !/bk|\bb\b/.test(r.out), [r.status, JSON.stringify(r.all)]);
}
for (const [label, u] of [
  ['%ZZ in the password', 'postgresql://u:p%ZZw@h.example.invalid/db'],
  ['a lone % at the end of the password', 'postgresql://u:100%@h.example.invalid/db'],
  ['%4 (one hex digit) in the user', 'postgresql://u%4:pw@h.example.invalid/db'],
  ['%00 (NUL) in the password', 'postgresql://u:pw%00x@h.example.invalid/db'],
  ['%%41 in the database name', 'postgresql://u:pw@h.example.invalid/d%%41'],
] as const) {
  r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: u } });
  check(`refused, nothing echoed: ${label}`, r.status !== null && r.status !== 0 && /malformed %-escape/.test(r.err) && r.shimLog === '' && r.files.length === 0 && !/ZZ|100|%4|%%41/.test(r.all), [r.status, r.all, r.shimLog]);
}
r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: 'postgresql://u%2Bx:ab%0A@h.example.invalid/db%20n%E2%9C%93me' } });
check('a trailing newline (%0A) in the password is kept, %2B decodes in the user, a space and a non-ASCII letter in the database name are accepted and shown as they are', r.status === 0 && /PASSWORD_HEX:61620a\n/.test(r.shimLog) && /PGUSER=u\+x /.test(r.shimLog) && /PGDATABASE=db n✓me\b/.test(r.shimLog) && /Database: db n✓me on h\.example\.invalid:5432/.test(r.out), [r.status, r.shimLog, r.out]);
r = run({ env: null, mode: 'ok', extraEnv: { DATABASE_URL: 'postgresql://u:a%2541%25%5Cx41@h.example.invalid/db' } });
check('%25 decodes to a literal %, so %2541 is the text "%41", and %5C is a backslash that is not re-interpreted ("a%41%\\x41")', r.status === 0 && r.shimLog.includes('PASSWORD_VALUE:a%41%\\x41\n'), r.shimLog);

// ── 10. the restore command the script prints cannot commit a partial restore ──
console.log('\n── 10. the printed restore command verifies first and commits only a complete stream ──');
const printedRestore = (out: string) => { const m = out.split('\n'); const i = m.findIndex((l) => /^Restore \(/.test(l)); return i >= 0 ? (m[i + 1] ?? '').replace(/^ {2}/, '') : ''; };
const base = run({ env: dotenv(), mode: 'real_trailer' });
const goodFile = path.join(base.dir, 'backups', base.files[0]!);
const printed = printedRestore(base.out);
const realSql = gunzipSync(readFileSync(goodFile)).toString();
check('the script prints ONE restore command line naming the file, the script itself (--verify), gzip -dc, BEGIN/COMMIT, ON_ERROR_STOP and the target placeholder', printed.includes(goodFile) && printed.includes('--verify') && printed.includes('backup_database.command') && /gzip -dc/.test(printed) && /BEGIN;/.test(printed) && /COMMIT;/.test(printed) && /ON_ERROR_STOP=1/.test(printed) && printed.includes('<target-connection-string>') && !printed.includes('\n'), printed);
check('…it is not the old "gunzip < file | psql --single-transaction", which commits whatever psql read before the end of a cut-off stream', !/gunzip </.test(printed) && !/--single-transaction/.test(printed), printed);
const sqlCut = (s: string) => { const i = s.indexOf('COPY public.t (id) FROM stdin;\n1\n'); return s.slice(0, i + 'COPY public.t (id) FROM stdin;\n1\n'.length); };   // right after a data row: psql treats EOF inside COPY as the end of the data
const goodGz = readFileSync(goodFile);
const flipAt = (b: Buffer, i: number, bit: number) => { const z = Buffer.from(b); z[i] ^= bit; return z; };
const cutSql = gzipSync(Buffer.from(sqlCut(realSql)));
const variants: Array<[string, Buffer, 'gzip' | 'marker']> = [
  ['the file cut at 60% (a download that stopped)', goodGz.subarray(0, Math.floor(goodGz.length * 0.6)), 'gzip'],
  ['the gzip of a prefix of the SQL that ends right after a data row, with its 8-byte trailer missing (gunzip prints "unexpected end of file" but has already produced the whole prefix)', cutSql.subarray(0, cutSql.length - 8), 'gzip'],
  ['a bit flipped in the middle of the compressed data', flipAt(goodGz, Math.floor(goodGz.length / 2), 0x04), 'gzip'],
  ['a bit flipped in the CRC (all the data decompresses, but nothing vouches for it)', flipAt(goodGz, goodGz.length - 7, 0x01), 'gzip'],
  ['a VALID gzip of an SQL file cut right after a data row (no completion marker)', cutSql, 'marker'],
  ['a valid gzip whose SQL is cut and ends in the marker text as a row of an open COPY', gzipSync(Buffer.from(`${TOP}COPY public.n (note) FROM stdin;\nrow 1\n${MARK}\n`)), 'marker'],
  ['an empty file', Buffer.alloc(0), 'gzip'],
];
const PSQL_IN = path.join(work, 'psql.stdin');
const runPrinted = (cmdLine: string, extra: Record<string, string> = {}, shell = path.join(binDir, 'bash'), cwd = base.dir) => {
  writeFileSync(PSQL_IN, ''); writeFileSync(CALLS_LOG, ''); rmSync(path.join(work, 'gzip.counter'), { force: true });
  const x = spawnSync(shell, ['-c', cmdLine.replace('<target-connection-string>', "'postgresql://target@127.0.0.1:1/empty_db'")], {
    encoding: 'utf8', timeout: 60_000, cwd,
    env: { PATH: `${shimDir}:${binDir}`, HOME: work, TMPDIR: work, REAL_GZIP, NODE_BIN: process.execPath, DAMAGE_JS, GZIP_COUNTER: path.join(work, 'gzip.counter'), SHIM_LOG, SHIM_LOG_CALLS: CALLS_LOG, DUMP_DIR, PSQL_STDIN_LOG: PSQL_IN, ...extra },
  });
  return { status: x.status, err: x.stderr, sent: readFileSync(PSQL_IN, 'utf8'), calls: readFileSync(CALLS_LOG, 'utf8') };
};
let rr = runPrinted(printed);
check('(a) the intact backup: the command exits 0 and psql is sent BEGIN; + the whole dump + COMMIT;', rr.status === 0 && rr.sent === `BEGIN;\n${realSql}COMMIT;\n` && /ON_ERROR_STOP=1/.test(rr.calls) && /postgresql:\/\/target@/.test(rr.calls), [rr.status, rr.sent.slice(0, 40), rr.sent.slice(-60), rr.calls]);
for (const [label, bytes] of variants) {
  writeFileSync(goodFile, bytes);                       // the damaged bytes sit where the intact backup was: the printed command is run exactly as printed
  rr = runPrinted(printed);
  check(`(refused) ${label}: non-zero exit, and COMMIT is never sent`, rr.status !== null && rr.status !== 0 && !/COMMIT;/.test(rr.sent), [rr.status, rr.sent.slice(-60)]);
}
rmSync(goodFile);
rr = runPrinted(printed);
check('(refused) a file that does not exist: non-zero exit, nothing sent to psql', rr.status !== null && rr.status !== 0 && !/COMMIT;/.test(rr.sent), [rr.status, rr.calls]);
writeFileSync(goodFile, goodGz);
rr = runPrinted(printed, { GZIP_DEC_FAIL_AFTER: '1' });
check('(refused) a file that verifies but then fails mid-read (the second decompression dies): non-zero exit, psql got BEGIN; and part of the dump but NO COMMIT;, so nothing is committed', rr.status !== null && rr.status !== 0 && rr.sent.startsWith('BEGIN;\n') && !/COMMIT;/.test(rr.sent) && rr.sent.length > 10, [rr.status, rr.sent.slice(0, 60), rr.calls]);
rr = runPrinted(printed, { PSQL_EXIT: '3' });
check('(refused) psql itself fails (ON_ERROR_STOP exit 3): the command exits non-zero', rr.status !== null && rr.status !== 0, rr.status);
{
  const zsh = spawnSync('sh', ['-c', 'command -v zsh'], { encoding: 'utf8' }).stdout.trim();
  if (zsh) {
    rr = runPrinted(printed, {}, zsh);
    check('(zsh) the same command line, run by zsh, exits 0 on the intact backup and sends BEGIN/COMMIT', rr.status === 0 && rr.sent === `BEGIN;\n${realSql}COMMIT;\n`, [rr.status, rr.err]);
    writeFileSync(goodFile, variants[0]![1]); rr = runPrinted(printed, {}, zsh); writeFileSync(goodFile, goodGz);
    check('(zsh) …and refuses the cut file without sending COMMIT', rr.status !== null && rr.status !== 0 && !/COMMIT;/.test(rr.sent), rr.status);
  } else console.log('  · NOT_RUN: zsh is not installed here — the printed line uses only ( ), { }, &&, set -o pipefail and quoted words, which zsh and bash share');
}
{
  // a path with a space: the printed line must still work when pasted
  const spaced = path.join(work, 'with space'); mkdirSync(spaced);
  const x = run({ env: dotenv(), mode: 'real_trailer', extraEnv: { BACKUP_DIR: path.join(spaced, 'my backups') } });
  const line = printedRestore(x.out);
  const dumped = readdirSync(path.join(spaced, 'my backups'));
  rr = runPrinted(line, {}, path.join(binDir, 'bash'), x.dir);
  check('a backup directory with a space in its name: the printed command is quoted so that it still verifies and restores', x.status === 0 && dumped.length === 1 && rr.status === 0 && rr.sent.startsWith('BEGIN;\n') && rr.sent.endsWith('COMMIT;\n'), [x.status, line, rr.status, rr.err]);
}

// ── 11. the verifier is the script's own, usable on any file: ./backup_database.command --verify FILE ──
console.log('\n── 11. --verify FILE: exit 0 only for an intact gzip that ends with the completion marker ──');
const scriptOf = (x: Run) => path.join(x.dir, 'backup_database.command');
const vdir = path.join(work, 'vfiles'); mkdirSync(vdir);
const verify = (file: string, cwd = base.dir) => run({ env: null, noPgDump: true, args: ['--verify', file], cwd, extraEnv: {} });
let v = verify(goodFile);
check('an intact complete backup: exit 0, says OK, needs no DATABASE_URL and no pg_dump, writes and prints nothing secret', v.status === 0 && /OK/.test(v.out) && !/Backup complete/.test(v.out) && v.shimLog === '', [v.status, v.all]);
for (const [label, bytes, kind] of variants) {
  const f = path.join(vdir, 'v.sql.gz'); writeFileSync(f, bytes);
  v = verify(f);
  check(`--verify refuses ${label}, and says which check failed (${kind === 'gzip' ? 'not a valid gzip stream' : 'incomplete: no completion marker'})`, v.status !== null && v.status !== 0 && v.out === '' && (kind === 'gzip' ? /not a valid gzip/.test(v.err) : /incomplete/.test(v.err)), [v.status, v.all]);
}
v = verify(path.join(vdir, 'missing.sql.gz'));
check('--verify refuses a file that does not exist', v.status !== null && v.status !== 0, v.status);
v = run({ env: null, noPgDump: true, args: ['--verify'] });
check('--verify without a file is a usage error (exit 2)', v.status === 2 && /usage/i.test(v.err), [v.status, v.err]);
v = run({ env: null, noPgDump: true, args: ['--restore', 'x'] });
check('an unknown argument is a usage error (exit 2), not a silent backup', v.status === 2 && /usage/i.test(v.err) && v.files.length === 0, [v.status, v.err]);
{
  const cwd = path.join(work, 'elsewhere'); mkdirSync(cwd); copyFileSync(goodFile, path.join(cwd, 'rel.sql.gz'));
  v = verify('rel.sql.gz', cwd);
  check('--verify resolves a relative FILE against the caller\'s directory (the script changes directory to its own)', v.status === 0, [v.status, v.all]);
}

// ── 12. relative BACKUP_DIR / ENV_FILE are the caller's; the printed paths are absolute ──
console.log('\n── 12. relative BACKUP_DIR and ENV_FILE belong to the directory the command was run from ──');
{
  const sd = path.join(work, 'scriptdir'); mkdirSync(sd);
  const sc = path.join(sd, 'backup_database.command'); copyFileSync(SCRIPT, sc); chmodSync(sc, 0o755);
  const caller = path.join(work, 'caller'); mkdirSync(caller);
  writeFileSync(path.join(caller, 'my.env'), dotenv());
  const env = { PATH: `${shimDir}:${binDir}`, HOME: work, TMPDIR: work, SHIM_MODE: 'real_trailer', SHIM_LOG, SHIM_LOG_CALLS: CALLS_LOG, DUMP_DIR, REAL_GZIP, NODE_BIN: process.execPath, DAMAGE_JS, GZIP_COUNTER: path.join(work, 'gzip.counter') };
  const x = spawnSync(path.join(binDir, 'bash'), [sc], { cwd: caller, env: { ...env, BACKUP_DIR: 'mine', ENV_FILE: 'my.env' }, encoding: 'utf8' });
  const landed = existsSync(path.join(caller, 'mine')) ? readdirSync(path.join(caller, 'mine')) : [];
  check('from another directory: ENV_FILE=my.env is read from there, BACKUP_DIR=mine is created there (not in the script\'s directory)', x.status === 0 && landed.length === 1 && !existsSync(path.join(sd, 'mine')), [x.status, landed, x.stderr]);
  check('…and the printed File: path is absolute and exists', (() => { const m = /File: (\S+)/.exec(x.stdout); return !!m && path.isAbsolute(m[1]!) && existsSync(m[1]!); })(), x.stdout);
  writeFileSync(path.join(sd, '.env'), dotenv());
  const y = spawnSync(path.join(binDir, 'bash'), [sc], { cwd: caller, env, encoding: 'utf8' });
  check('with neither set, the defaults are still the script\'s own directory (.env and backups/ next to the script), wherever it is run from (a double-click starts in $HOME)', y.status === 0 && existsSync(path.join(sd, 'backups')) && readdirSync(path.join(sd, 'backups')).length === 1 && !existsSync(path.join(caller, 'backups')), [y.status, y.stderr]);
}

// ── 13. the default output directory holds the whole customer database: never committed, never in the image ──
console.log('\n── 13. everything the script can create in its default directory is ignored by git and by docker ──');
{
  // The paths the script can create: the directory itself, a finished dump, the *.partial it writes first.
  const created = ['backups/adlytic_backup_20260101_000000.sql.gz', 'backups/adlytic_backup_20260101_000000_1.sql.gz', 'backups/adlytic_backup_20260101_000000.sql.gz.partial'];
  const gi = path.join(work, 'gitcheck');
  mkdirSync(gi);
  const git = (args: string[]) => spawnSync('git', args, { cwd: gi, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  const haveGit = git(['init', '-q']).status === 0;
  check('(setup) git is available to run `git check-ignore`', haveGit);
  if (haveGit) {
    copyFileSync(path.join(ROOT, '.gitignore'), path.join(gi, '.gitignore'));   // the repo's real rules, in an isolated repo (no user-level excludes)
    mkdirSync(path.join(gi, 'backups')); mkdirSync(path.join(gi, 'nested', 'backups'), { recursive: true });   // git treats a missing path as a file: a `backups/` rule needs the directory to exist
    for (const p of [...created, 'backups', 'backups/anything-else.dat', 'elsewhere/by-hand.sql.gz', 'elsewhere/by-hand.sql.gz.partial', 'nested/backups/adlytic_backup_x.sql.gz']) {
      const c = git(['check-ignore', '-q', '--no-index', p]);
      check(`.gitignore ignores ${p} (git check-ignore exit 0)`, c.status === 0, [c.status, c.stderr]);
    }
    writeFileSync(path.join(gi, 'backups', 'adlytic_backup_20260101_000000.sql.gz'), 'x'); writeFileSync(path.join(gi, 'backups', 'a.sql.gz.partial'), 'x');
    const st = git(['status', '--porcelain', '--untracked-files=all']);
    check('`git add -A` would stage nothing from backups/ (git status shows only .gitignore)', st.stdout.trim() === '?? .gitignore', st.stdout);
    check('control: a file that is NOT a backup is not ignored by these rules (the check is not vacuous)', git(['check-ignore', '-q', '--no-index', 'src/index.ts']).status === 1);
  }
  // docker: no CLI here, so evaluate .dockerignore with Docker's documented rules (last matching pattern wins; `**` spans directories; a match excludes everything under it)
  const dockerPatterns = readFileSync(path.join(ROOT, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const toRe = (pat: string) => new RegExp('^' + pat.replace(/\/+$/, '').replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '(?:/.*)?$');
  const dockerIgnored = (p: string) => { let ig = false; for (const pat of dockerPatterns) { const neg = pat.startsWith('!'); if (toRe(neg ? pat.slice(1) : pat).test(p)) ig = !neg; } return ig; };
  for (const p of [...created, 'backups/anything-else.dat', 'elsewhere/by-hand.sql.gz', 'elsewhere/by-hand.sql.gz.partial']) check(`.dockerignore excludes ${p} from the build context`, dockerIgnored(p), dockerPatterns.filter((x) => /backup|sql/.test(x)));
  check('control: .dockerignore does not exclude src/index.ts (the matcher is not vacuous)', !dockerIgnored('src/index.ts'));
}

rmSync(work, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
