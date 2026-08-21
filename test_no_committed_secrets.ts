/**
 * Committed-credential regression guard.
 *
 * WHY THIS EXISTS: a live production PostgreSQL password was committed to this
 * repository in its very first commit and sat in 8 tracked files — five of them
 * pairing it with Railway's PUBLIC TCP proxy hostname, one of them an
 * executable deploy script — until it was found during a deployment audit and
 * rotated. HEAD is now clean. This file's job is to keep it that way: it fails
 * the build if a real-looking database credential is ever committed again.
 *
 * WHAT IT IS NOT: a general-purpose secret scanner. It targets the shape that
 * actually bit this repo — a managed-provider-generated database password
 * embedded in a connection string — plus the two adjacent forms (libpq
 * `password=`, `PGPASSWORD=`). It is deliberately narrow and explainable
 * rather than broad and noisy. Adopt a dedicated scanner (gitleaks, trufflehog)
 * if you want full coverage; this is the tripwire for the known failure mode.
 *
 * HOW IT DECIDES. Every credential-shaped match is classified, never trusted
 * by filename or directory:
 *   SAFE   — a template reference (${VAR}, {{ handlebars }}, <PLACEHOLDER>),
 *            an allow-listed documentation placeholder, shorter than
 *            MIN_REAL_LENGTH, or drawn from a single character class.
 *   REAL   — anything else. Provider-generated credentials are long AND mix
 *            character classes; every legitimate placeholder in this repo is
 *            short, single-class, or a template reference. That is the whole
 *            separating signature, and it is asserted below so the allow-list
 *            can never silently start covering a real secret.
 *
 * OUTPUT DISCIPLINE: findings report file, line, length and character-class
 * summary ONLY. This file never prints, echoes, or embeds a discovered value —
 * a test that leaks the secret it found would defeat its own purpose.
 *
 * Run: npx tsx test_no_committed_secrets.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

// ── Policy ───────────────────────────────────────────────────────────────

/**
 * Below this length a credential is treated as a placeholder. Every real
 * placeholder in this repo is ≤ 11 chars; the credential that leaked was 32.
 * Managed providers (Railway, Neon, Supabase, RDS) generate ≥ 16.
 */
const MIN_REAL_LENGTH = 16;

/**
 * Documentation/example values that may legitimately appear in a connection
 * string. Grounded in what this repo actually contains (.env.example,
 * README_DEPLOYMENT.md, STEP_13_RUNBOOK.md, test_tenant_isolation.ts,
 * dawai-platform/*, .claude/skills/*) — not a speculative list. Compared
 * case-insensitively.
 */
const PLACEHOLDERS = new Set([
  'pass', 'password', 'password123', 'passwd', 'pwd',
  'postgres', 'user', 'username', 'root', 'admin',
  'change-me', 'changeme', 'secret', 'test', 'example', 'dev', 'local',
  'redacted', 'your-password', 'your_password', 'yourpassword',
  'xxx', 'xxxx', 'placeholder', 'none', 'null',
]);

/** Substitution syntax — the value is supplied at runtime, not committed. */
const TEMPLATE = /[$`{}<>%\\]|\.\.\.|%s|%v/;

/**
 * Bounds. Minified bundles and embedded base64/gzip blobs are single lines of
 * hundreds of KB; they contain no readable credential and scanning them costs
 * real time. Skipped by SHAPE (line length / file size), not by an allow-list
 * of paths, so a newly-added vendor bundle is handled without touching this
 * file — and every skip is COUNTED and reported, never silently dropped.
 */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINE = 4000;

// ── Detection ────────────────────────────────────────────────────────────

interface Finding { file: string; line: number; kind: string; length: number; classes: string }

/** Character classes present — used for reporting AND classification. */
function classesOf(v: string): string[] {
  const c: string[] = [];
  if (/[a-z]/.test(v)) c.push('lower');
  if (/[A-Z]/.test(v)) c.push('upper');
  if (/[0-9]/.test(v)) c.push('digit');
  if (/[^A-Za-z0-9]/.test(v)) c.push('symbol');
  return c;
}

/** The one judgement call, isolated so it can be tested directly (below). */
export function looksLikeRealCredential(value: string): boolean {
  if (!value) return false;
  if (TEMPLATE.test(value)) return false;
  if (PLACEHOLDERS.has(value.toLowerCase())) return false;
  if (value.length < MIN_REAL_LENGTH) return false;
  return classesOf(value).length >= 2;
}

const MATCHERS: { kind: string; re: RegExp }[] = [
  // scheme://user:PASSWORD@host
  { kind: 'db-connection-uri', re: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^:/@\s]+:([^@\s"'`]+)@/g },
  // libpq keyword form: password=PASSWORD
  { kind: 'libpq-password', re: /\bpassword=([^\s;"'`&]+)/gi },
  // PGPASSWORD=PASSWORD (empty value is fine — populated at runtime)
  { kind: 'pgpassword-env', re: /\bPGPASSWORD=["']?([^\s"';]+)/g },
];

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: __dirname, maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

const skipped: string[] = [];

function scanRepo(): Finding[] {
  const findings: Finding[] = [];
  for (const rel of trackedFiles()) {
    const abs = join(__dirname, rel);
    let size: number;
    try { size = statSync(abs).size; } catch { continue; }   // deleted-but-tracked
    if (size > MAX_BYTES) { skipped.push(`${rel} (>${MAX_BYTES} bytes)`); continue; }

    let buf: Buffer;
    try { buf = readFileSync(abs); } catch { continue; }
    if (buf.includes(0)) continue;                            // binary
    const lines = buf.toString('utf8').split('\n');

    lines.forEach((line, i) => {
      if (line.length > MAX_LINE) { skipped.push(`${rel}:${i + 1} (minified/blob line)`); return; }
      for (const { kind, re } of MATCHERS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const value = m[1] ?? '';
          if (!looksLikeRealCredential(value)) continue;
          findings.push({
            file: rel, line: i + 1, kind,
            length: value.length, classes: classesOf(value).join('+'),
          });
        }
      }
    });
  }
  return findings;
}

/** Redacted rendering — file, line, shape. Never the value. */
const describe = (f: Finding) =>
  `${f.file}:${f.line} [${f.kind}] length=${f.length} classes=${f.classes}`;

// ── The guard ────────────────────────────────────────────────────────────

console.log('\n── 1. No real-looking database credential is committed at HEAD ──');

const findings = scanRepo();

check('every tracked text file is free of real-looking DB credentials', () => {
  assert.deepEqual(
    findings.map(describe), [],
    `committed credential(s) detected — ROTATE the credential FIRST, then remove it from these files:\n      ` +
    findings.map(describe).join('\n      '),
  );
});

console.log('\n── 2. The classifier separates real credentials from placeholders ──');

check('a provider-shaped credential (long, mixed-case) is classified REAL', () => {
  // Synthetic, never a real secret: 32 chars, mixed case — the shape that leaked.
  const synthetic = 'Aa'.repeat(8) + 'Bb'.repeat(8);
  assert.equal(synthetic.length, 32);
  assert.equal(looksLikeRealCredential(synthetic), true,
    'the guard must flag a 32-char mixed-case credential, or it would not have caught the real one');
});

check('every placeholder this repo actually uses is classified SAFE', () => {
  // Exactly the values present in .env.example, README_DEPLOYMENT.md,
  // STEP_13_RUNBOOK.md, test_tenant_isolation.ts, dawai-platform/*,
  // and .claude/skills/* — enumerated from the tree, not invented.
  for (const p of [
    'PASS', 'PASSWORD', 'pass', 'password', 'password123',
    'postgres', 'change-me', '${POSTGRES_PASSWORD}', '{{password}}',
    '{{ .Data.password }}', 'REDACTED',
  ]) {
    assert.equal(looksLikeRealCredential(p), false, `"${p}" must not be treated as a real credential`);
  }
});

check('the allow-list cannot mask a long mixed-case value', () => {
  // Guards the guard: if someone ever adds a real secret to PLACEHOLDERS,
  // this fails. Every entry must be short or single-class on its own merits.
  for (const p of PLACEHOLDERS) {
    const longAndMixed = p.length >= MIN_REAL_LENGTH && classesOf(p).length >= 2;
    assert.equal(longAndMixed, false,
      `PLACEHOLDERS entry "${p}" has the shape of a real credential — remove it`);
  }
});

console.log('\n── 3. The remediated files stay remediated ──');

const REMEDIATED = [
  'ADD_DB_LOG.txt', 'FINAL_CHECK_LOG.txt', 'MONITOR_LOG.txt',
  'CLEANUP_V2_LOG.txt', 'CLEANUP_V3_LOG.txt',
  'PRODUCTION_DEPLOYMENT_READY.md', 'DEPLOYMENT_INSTRUCTIONS.txt',
  'deploy_production.command',
];

check('all 8 previously-leaking files are clean and still present (redacted, not deleted)', () => {
  for (const rel of REMEDIATED) {
    const text = readFileSync(join(__dirname, rel), 'utf8');
    assert.ok(text.length > 0, `${rel} must still exist — content is preserved, only the credential was removed`);
    const hits = findings.filter((f) => f.file === rel);
    assert.deepEqual(hits.map(describe), [], `${rel} still carries a credential`);
  }
});

check('deploy_production.command sources DATABASE_URL from the environment, never a literal', () => {
  const script = readFileSync(join(__dirname, 'deploy_production.command'), 'utf8');
  assert.ok(
    /:\s*"\$\{DATABASE_URL:\?/.test(script),
    'the script must require DATABASE_URL from the environment (${DATABASE_URL:?...}), matching src/config.ts/src/api/serve.ts',
  );
  assert.ok(
    !/DATABASE_URL=["']?(?:postgres|postgresql):\/\//.test(script),
    'the script must never assign a literal connection string to DATABASE_URL',
  );
});

// No silent caps: say exactly what was not scanned, so "clean" never means
// "clean apart from the parts we quietly skipped".
console.log(`\nscan coverage: ${skipped.length} location(s) skipped as minified/oversized blobs`);
skipped.slice(0, 10).forEach((s) => console.log(`    · ${s}`));
if (skipped.length > 10) console.log(`    · …and ${skipped.length - 10} more`);

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
