// ════════════════════════════════════════════════════════════════════════
//  scripts/create-user.ts
//
//  Production user-provisioning script for Adlytic.
//
//  Usage (production — Railway injects DATABASE_URL automatically):
//    railway run npm run create-user
//
//  Usage (local dev — .env DATABASE_URL loaded automatically by Prisma):
//    npm run create-user
//
//  Usage (explicit override):
//    DATABASE_URL="postgresql://..." npm run create-user
//
//  What it does:
//    1. Verifies DATABASE_URL is set.
//    2. Asks for name, email, password, workspace name.
//    3. Validates all inputs before touching the database.
//    4. Prevents duplicate emails.
//    5. Hashes the password with SHA-256 — identical to /api/auth/login.
//    6. Creates the user row.
//    7. Creates a workspace row.
//    8. Creates a workspace_members row with role = OWNER.
//    9. Verifies login by re-querying with the same hash logic.
//   10. Prints every step; never works silently.
//
//  Input: uses readline/promises correctly (no terminal:false — that was
//  the root cause of ^M). Works on macOS Terminal and railway run.
// ════════════════════════════════════════════════════════════════════════

import { createHash }     from 'node:crypto';
import { pgSslFor } from '../src/lib/pgSsl';
import { Writable }       from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { PrismaClient }   from '@prisma/client';
import { PrismaPg }       from '@prisma/adapter-pg';
import pg                 from 'pg';

// ── ANSI colour constants ─────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  grey:   '\x1b[90m',
} as const;

// ── Logging helpers (named functions → TS control-flow + definite-assignment) ──

function hr(): void {
  console.log(`${C.grey}${'─'.repeat(62)}${C.reset}`);
}

function step(n: number, msg: string): void {
  console.log(`\n${C.bold}[Step ${n}]${C.reset} ${msg}`);
}

function ok(msg: string): void {
  console.log(`  ${C.green}✔${C.reset}  ${msg}`);
}

function info(msg: string): void {
  console.log(`  ${C.cyan}ℹ${C.reset}  ${msg}`);
}

function warn(msg: string): void {
  console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
}

function fail(msg: string): never {
  console.error(`\n  ${C.red}✘  FAILED:${C.reset} ${msg}\n`);
  process.exit(1);
}

// ── Password hashing ──────────────────────────────────────────────────────────

/**
 * Produces the same hash as POST /api/auth/login in src/api/server.ts:
 *   createHash('sha256').update(body.password).digest('hex')
 */
function hashPassword(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

// ── Prompt helpers ────────────────────────────────────────────────────────────

/**
 * Prompt for a visible text value.
 * Uses readline/promises without terminal:false — that option was the sole
 * cause of the original ^M / hang bug.
 * Strips trailing \r so the script works correctly on all platforms.
 */
async function ask(label: string): Promise<string> {
  const rl = createInterface({
    input:  process.stdin,
    output: process.stdout,
    // terminal omitted — defaults to process.stdout.isTTY.
    // Never set terminal:false here; that disables line processing and
    // causes the input to hang and return raw ^M characters.
  });
  try {
    const raw = await rl.question(`  ${C.bold}${label}${C.reset} `);
    return raw.replace(/\r$/, '').trim();
  } finally {
    rl.close();
  }
}

/**
 * Prompt for a password.
 *
 * - TTY (interactive): mutes echo so typed characters are not shown.
 * - Non-TTY (piped stdin / automated test): falls back to plain ask()
 *   so the piped value is read normally without terminal manipulation.
 */
async function askPassword(label: string): Promise<string> {
  // If stdin is not a TTY (piped input / automated test) read it like a
  // normal line so we don't try to set raw mode on a non-interactive fd.
  if (!process.stdin.isTTY) {
    return ask(label);
  }

  process.stdout.write(`  ${C.bold}${label}${C.reset} `);

  // Use a real Writable that discards all output. readline internally calls
  // output.on() and other EventEmitter methods — a plain object literal with
  // only a .write property causes "output.on is not a function". A Writable
  // from node:stream is a proper EventEmitter and satisfies readline's needs.
  const muted = new Writable({
    write(_chunk: unknown, _encoding: unknown, callback: () => void) {
      callback();
    },
  });

  const rl = createInterface({
    input:    process.stdin,
    output:   muted,
    terminal: true, // required for muted-echo to work on a real TTY
  });

  try {
    const raw = await rl.question('');
    process.stdout.write('\n'); // move to next line after hidden input
    return raw.replace(/\r$/, '').trim();
  } finally {
    rl.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  hr();
  console.log(`${C.bold}  Adlytic — Create Production User${C.reset}`);
  console.log(`${C.dim}  Provisions user + workspace in the connected database.${C.reset}`);
  hr();

  // ── Step 0: verify DATABASE_URL ───────────────────────────────────────────

  step(0, 'Checking DATABASE_URL …');

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    fail(
      'DATABASE_URL is not set.\n\n' +
      '    Railway (recommended):\n' +
      '      railway run npm run create-user\n\n' +
      '    Local .env:\n' +
      '      npm run create-user\n\n' +
      '    Explicit URL:\n' +
      '      DATABASE_URL="postgresql://..." npm run create-user'
    );
  }

  const safeUrl = dbUrl.replace(/:([^:@\s]+)@/, ':***@');
  ok(`DATABASE_URL = ${safeUrl}`);

  // ── Step 1: collect inputs ─────────────────────────────────────────────────

  step(1, 'Collecting user details …');
  console.log(`${C.dim}  (Type each value and press Enter. Ctrl+C to abort.)${C.reset}\n`);

  const rawName     = await ask('Full name     :');
  const rawEmail    = await ask('Email         :');
  const rawPassword = await askPassword('Password      :');
  const defaultWs   = `${rawName || 'My'}'s Workspace`;
  console.log(`  ${C.bold}Workspace name:${C.reset} ${C.dim}(Enter = "${defaultWs}")${C.reset}`);
  const rawWsInput  = await ask('              :');

  // ── validate ──────────────────────────────────────────────────────────────

  const name          = rawName;
  const email         = rawEmail.toLowerCase();
  const workspaceName = rawWsInput.trim() || defaultWs;

  if (!name)  fail('Full name cannot be empty.');
  if (!email) fail('Email cannot be empty.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`"${email}" is not a valid email address.`);
  }
  if (!rawPassword)           fail('Password cannot be empty.');
  if (rawPassword.length < 8) fail('Password must be at least 8 characters long.');

  console.log('');
  info(`Name      : ${name}`);
  info(`Email     : ${email}`);
  info(`Password  : ${'*'.repeat(rawPassword.length)}`);
  info(`Workspace : ${workspaceName}`);
  ok('All inputs validated.');

  // ── Step 2: connect to database ───────────────────────────────────────────

  step(2, 'Connecting to database …');

  const parsed  = new URL(dbUrl);
  const pool    = new pg.Pool({
    host:     parsed.hostname,
    port:     Number(parsed.port) || 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: pgSslFor(parsed.hostname),
  });
  const adapter = new PrismaPg(pool);
  const prisma  = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    fail(`Cannot connect to database:\n    ${String(err)}`);
  }

  ok('Connection established.');

  // ── Step 3: check for duplicate email ─────────────────────────────────────

  step(3, 'Checking for duplicate email …');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.$disconnect().catch(() => undefined);
    fail(
      `A user with email "${email}" already exists.\n` +
      `    Existing user id : ${existing.id}\n` +
      `    Created at       : ${existing.createdAt.toISOString()}`
    );
  }

  ok(`No existing user found for "${email}". Safe to proceed.`);

  // ── Step 4: hash password ─────────────────────────────────────────────────

  step(4, 'Hashing password …');
  info('Algorithm : SHA-256 (identical to /api/auth/login in src/api/server.ts)');

  const passwordHash = hashPassword(rawPassword);

  ok(`Hash produced : ${passwordHash.slice(0, 16)}…  (${passwordHash.length} hex chars)`);

  // ── Step 5: create user ───────────────────────────────────────────────────

  step(5, 'Creating user row …');

  const user = await prisma.user.create({
    data:   { email, passwordHash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  }).catch((err: unknown) => {
    void prisma.$disconnect().catch(() => undefined);
    fail(`Failed to create user:\n    ${String(err)}`);
  });

  ok('User created.');
  info(`id        : ${user.id}`);
  info(`email     : ${user.email}`);
  info(`name      : ${user.name}`);
  info(`createdAt : ${user.createdAt.toISOString()}`);

  // ── Step 6: create workspace ──────────────────────────────────────────────

  step(6, 'Creating workspace row …');

  const workspace = await prisma.workspace.create({
    data:   { name: workspaceName, plan: 'free' },
    select: { id: true, name: true, plan: true, createdAt: true },
  }).catch(async (err: unknown) => {
    warn('Workspace creation failed — rolling back user …');
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    void prisma.$disconnect().catch(() => undefined);
    fail(`Failed to create workspace:\n    ${String(err)}`);
  });

  ok('Workspace created.');
  info(`id        : ${workspace.id}`);
  info(`name      : ${workspace.name}`);
  info(`plan      : ${workspace.plan}`);

  // ── Step 7: create workspace_member (OWNER) ───────────────────────────────

  step(7, 'Adding user to workspace as OWNER …');

  const member = await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId:      user.id,
      role:        'OWNER',
    },
    select: { id: true, role: true },
  }).catch(async (err: unknown) => {
    warn('WorkspaceMember creation failed — rolling back workspace and user …');
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    void prisma.$disconnect().catch(() => undefined);
    fail(`Failed to create workspace member:\n    ${String(err)}`);
  });

  ok('WorkspaceMember created.');
  info(`id        : ${member.id}`);
  info(`role      : ${member.role}`);

  // ── Step 8: verify login ──────────────────────────────────────────────────

  step(8, 'Verifying login (DB re-query — same hash as /api/auth/login) …');

  const loginCheck = await prisma.user.findFirst({
    where:  { email, passwordHash: hashPassword(rawPassword) },
    select: { id: true },
  });

  await prisma.$disconnect();

  if (!loginCheck || loginCheck.id !== user.id) {
    fail(
      'Login verification FAILED — stored hash does not match.\n' +
      '    This should never happen. Check the database manually.'
    );
  }

  const token = Buffer.from(`${user.id}:${user.email}`).toString('base64');

  ok('Login verified — credentials are correct.');
  info(`Auth token : ${token.slice(0, 24)}… (base64 userId:email)`);

  // ── Done ──────────────────────────────────────────────────────────────────

  hr();
  console.log(`${C.bold}${C.green}  ✔  User provisioned successfully${C.reset}`);
  hr();
  console.log(`  Name      : ${user.name}`);
  console.log(`  Email     : ${user.email}`);
  console.log(`  User ID   : ${user.id}`);
  console.log(`  Workspace : ${workspace.name}`);
  console.log(`  Ws ID     : ${workspace.id}`);
  console.log(`  Role      : OWNER`);
  hr();
  console.log(`  ${C.bold}The user can now log in at:${C.reset}`);
  console.log('  https://adlytic-production.up.railway.app');
  hr();
  console.log('');
}

main().catch((err: unknown) => {
  console.error(`\n${C.red}[FATAL]${C.reset}`, err);
  process.exit(1);
});
