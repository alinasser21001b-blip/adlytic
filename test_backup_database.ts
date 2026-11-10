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
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

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
for (const t of ['bash', 'sh', 'env', 'sed', 'tail', 'head', 'grep', 'gzip', 'gunzip', 'cat', 'rm', 'mv', 'mkdir', 'mktemp', 'date', 'ls', 'awk', 'dirname', 'basename', 'cut', 'tr', 'wc', 'chmod', 'cp', 'true', 'false']) {
  const r = spawnSync('sh', ['-c', `command -v ${t}`], { encoding: 'utf8' });
  const p = r.stdout.trim();
  if (p) symlinkSync(p, path.join(binDir, t));
}
const SHIM_LOG = path.join(work, 'shim.log');
const shim = (name: string, body: string) => { const f = path.join(shimDir, name); writeFileSync(f, `#!/bin/bash\n${body}\n`); chmodSync(f, 0o755); };
shim('pg_dump', `
{ echo "ARGS:$*"; echo "ENV:PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER PGDATABASE=$PGDATABASE PGSSLMODE=\${PGSSLMODE:-}"; echo "PASSWORD_SET:\${PGPASSWORD:+yes}"; echo "PASSWORD_VALUE:\${PGPASSWORD:-}"; } >> "$SHIM_LOG"
case "$SHIM_MODE" in
  ok)        printf -- '-- PostgreSQL database dump\\nCREATE TABLE t (id int);\\nCOPY t FROM stdin;\\n1\\n\\\\.\\n-- PostgreSQL database dump complete\\n'; exit 0;;
  fail)      echo "pg_dump: error: connection to server failed: FATAL:  no pg_hba.conf entry" >&2; exit 1;;
  partial)   printf -- '-- PostgreSQL database dump\\nCREATE TABLE t (id int);\\nCOPY t FROM stdin;\\n1\\n'; echo "pg_dump: error: query failed: permission denied for table t" >&2; exit 1;;
  empty)     exit 0;;
  truncated) printf -- '-- PostgreSQL database dump\\nCREATE TABLE t (id int);\\nCOPY t FROM stdin;\\n1\\n'; exit 0;;
  echopass)  echo "pg_dump: error: password authentication failed (password was: $PGPASSWORD)" >&2; exit 1;;
esac
exit 3`);
shim('date', 'echo 20260101_000000');                     // a fixed clock: two runs in the "same second"
shim('npx', 'echo "npx $*" >> "$SHIM_LOG_CALLS"; exit 0');
shim('prisma', 'echo "prisma $*" >> "$SHIM_LOG_CALLS"; exit 0');
shim('psql', 'echo "psql $*" >> "$SHIM_LOG_CALLS"; exit 0');
const CALLS_LOG = path.join(work, 'calls.log');

interface Run { status: number | null; out: string; err: string; all: string; files: string[]; dir: string; shimLog: string; calls: string }
let seq = 0;
function run(opts: { env?: string | null; mode?: string; noPgDump?: boolean; extraEnv?: Record<string, string>; before?: (dir: string) => void }): Run {
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
    PATH: opts.noPgDump ? `${noPgDir}:${binDir}` : pathVar, HOME: work, TMPDIR: work, SHIM_MODE: opts.mode ?? 'ok', SHIM_LOG, SHIM_LOG_CALLS: CALLS_LOG, ...(opts.extraEnv ?? {}),
  };
  const r = spawnSync(path.join(binDir, 'bash'), [script], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });
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
const b = spawnSync(path.join(binDir, 'bash'), [path.join(a.dir, 'backup_database.command')], { cwd: a.dir, env: { PATH: `${shimDir}:${binDir}`, HOME: work, TMPDIR: work, SHIM_MODE: 'ok', SHIM_LOG, SHIM_LOG_CALLS: CALLS_LOG }, encoding: 'utf8' });
const both = readdirSync(path.join(a.dir, 'backups')).sort();
check('two successful runs in the SAME second (fixed clock) produce two distinct files — the first is not overwritten', a.status === 0 && b.status === 0 && JSON.stringify(both) === JSON.stringify(['adlytic_backup_20260101_000000.sql.gz', 'adlytic_backup_20260101_000000_1.sql.gz']), both);

// ── 6. the default output directory holds the whole customer database: never committed, never in the image ──
console.log('\n── 6. everything the script can create in its default directory is ignored by git and by docker ──');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
