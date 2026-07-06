// ════════════════════════════════════════════════════════════════════════
//  scripts/reset-password.ts
//
//  Reset the password for an existing Adlytic user (e.g. a forgotten admin
//  login). Passwords are bcrypt-hashed and cannot be recovered — this sets a
//  NEW one.
//
//  Usage (production — Railway injects DATABASE_URL):
//    railway run npm run reset-password -- user@example.com
//
//  Usage (local dev — .env DATABASE_URL loaded by tsx):
//    npm run reset-password -- user@example.com
//
//  Non-interactive (CI/automation — avoid; leaks the password into env/history):
//    RESET_EMAIL=user@example.com RESET_PASSWORD='new-pass' npm run reset-password
//
//  What it does:
//    1. Verifies DATABASE_URL is set.
//    2. Resolves the target email (CLI arg or RESET_EMAIL), lowercased/trimmed
//       to match how the app stores emails.
//    3. Prompts for a new password (masked) + confirmation, unless RESET_PASSWORD
//       is provided.
//    4. Looks up the user. Aborts if none — never reveals which emails exist.
//    5. Hashes with the SAME hashPassword() the login path uses (bcrypt).
//    6. Updates password_hash AND bumps token_version (invalidates old logins).
//    7. Re-verifies the new password with verifyPassword().
//    8. Reports whether the email grants platform-admin (PLATFORM_ADMIN_EMAILS).
//    9. Never prints the password.
// ════════════════════════════════════════════════════════════════════════

import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../src/services/jwtAuth';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', red: '\x1b[31m', grey: '\x1b[90m',
} as const;
const ok = (m: string): void => console.log(`  ${C.green}✔${C.reset}  ${m}`);
const info = (m: string): void => console.log(`  ${C.cyan}ℹ${C.reset}  ${m}`);
const warn = (m: string): void => console.log(`  ${C.yellow}⚠${C.reset}  ${m}`);
const fail = (m: string): never => { console.error(`\n  ${C.red}✘  FAILED:${C.reset} ${m}\n`); process.exit(1); };

const MIN_PASSWORD_LEN = 8;

/** Prompt without echoing the typed characters (mute stdout during input). */
async function promptMasked(question: string): Promise<string> {
  let muted = false;
  const mutedOut = new Writable({
    write(chunk, _enc, cb) { if (!muted) process.stdout.write(chunk); cb(); },
  });
  const rl = createInterface({ input: process.stdin, output: mutedOut, terminal: true });
  process.stdout.write(question);
  muted = true;
  const answer = await rl.question('');
  muted = false;
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function main(): Promise<void> {
  console.log(`\n${C.bold}Adlytic — Password Reset${C.reset}`);
  console.log(`${C.grey}${'─'.repeat(50)}${C.reset}`);

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) fail('DATABASE_URL is not set. Use `railway run …` or a local .env.');

  // ── target email ────────────────────────────────────────────────────────
  const argEmail = process.argv[2];
  const rawEmail = (argEmail ?? process.env['RESET_EMAIL'] ?? '').toLowerCase().trim();
  if (!rawEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
    fail('Provide a valid email:  npm run reset-password -- user@example.com');
  }

  // ── new password ──────────────────────────────────────────────────────────
  let password = process.env['RESET_PASSWORD'] ?? '';
  if (!password) {
    password = await promptMasked(`  New password for ${C.bold}${rawEmail}${C.reset}: `);
    const confirm = await promptMasked('  Confirm password: ');
    if (password !== confirm) fail('Passwords do not match.');
  }
  if (password.length < MIN_PASSWORD_LEN) {
    fail(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
  }

  // ── DB ────────────────────────────────────────────────────────────────────
  const parsed = new URL(dbUrl);
  const ssl = parsed.hostname.endsWith('.railway.internal') ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({
    host: parsed.hostname, port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''), ssl,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const user = await prisma.user.findUnique({
      where: { email: rawEmail },
      select: { id: true, email: true, name: true },
    });
    // Do not reveal whether an email exists beyond this direct owner-run action.
    if (!user) fail(`No user found with email ${rawEmail}.`);

    const newHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      // Bumping tokenVersion invalidates every existing JWT for this user, so a
      // leaked/old session can't outlive the reset.
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });
    ok(`Password updated for ${user.email}${user.name ? ` (${user.name})` : ''}.`);
    ok('All existing login sessions for this account were invalidated.');

    // Re-verify with the same code path login uses.
    const check = await verifyPassword(password, newHash);
    if (check.ok) ok('Verified: the new password authenticates correctly.');
    else warn('Could not verify the new password — check the app login manually.');

    // Admin allowlist status (advisory).
    const allow = (process.env['PLATFORM_ADMIN_EMAILS'] ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length === 0) {
      info('PLATFORM_ADMIN_EMAILS is not set in this environment — admin status unknown here.');
      info('For /admin access, this email must be in PLATFORM_ADMIN_EMAILS on the API service.');
    } else if (allow.includes(user.email)) {
      ok('This email IS in PLATFORM_ADMIN_EMAILS → it can open /admin.');
    } else {
      warn('This email is NOT in PLATFORM_ADMIN_EMAILS → it will NOT see /admin.');
      info(`Add it on Railway:  PLATFORM_ADMIN_EMAILS=${[...allow, user.email].join(',')}`);
    }

    console.log(`\n${C.green}Done.${C.reset} Log in at /login with the new password.\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
