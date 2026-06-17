// ════════════════════════════════════════════════════════════════════════
//  scripts/create-user.ts
//
//  Production user-provisioning script for Adlytic.
//
//  Usage (production — Railway injects DATABASE_URL automatically):
//    railway run npm run create-user
//
//  Usage (local dev — uses .env DATABASE_URL):
//    npm run create-user
//
//  Usage (manual DATABASE_URL override):
//    DATABASE_URL="postgresql://..." npm run create-user
//
//  What it does:
//    1. Asks for name, email, password (and optional workspace name).
//    2. Validates all inputs before touching the database.
//    3. Prevents duplicate emails.
//    4. Hashes the password with SHA-256 — identical to /api/auth/login.
//    5. Creates the user row.
//    6. Creates a workspace row.
//    7. Creates a workspace_members row with role = OWNER.
//    8. Verifies login by re-querying with the same hash logic.
//    9. Prints every step; never works silently.
// ════════════════════════════════════════════════════════════════════════

import { createHash }                from 'node:crypto';
import { createInterface }           from 'node:readline/promises';
import { stdin as input, stdout as output, exit } from 'node:process';
import { PrismaClient }              from '@prisma/client';

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  grey:   '\x1b[90m',
};

const hr   = ()          => console.log(`${C.grey}${'─'.repeat(62)}${C.reset}`);
const step = (n: number, msg: string) =>
  console.log(`\n${C.bold}[Step ${n}]${C.reset} ${msg}`);
const ok   = (msg: string) => console.log(`  ${C.green}✔${C.reset}  ${msg}`);
const info = (msg: string) => console.log(`  ${C.cyan}ℹ${C.reset}  ${msg}`);
const warn = (msg: string) => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const fail = (msg: string): never => {
  console.error(`\n  ${C.red}✘  FAILED:${C.reset} ${msg}\n`);
  exit(1);
};

// ── Password hashing ─────────────────────────────────────────────────────────

/**
 * Produces the same hash as POST /api/auth/login in src/api/server.ts:
 *   createHash('sha256').update(body.password).digest('hex')
 */
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// ── Prompt helper ─────────────────────────────────────────────────────────────

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  const answer = await rl.question(`  ${C.bold}${question}${C.reset} `);
  return answer.trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
      '    To run against Railway production DB:\n' +
      '      railway run npm run create-user\n\n' +
      '    To run locally (uses .env file):\n' +
      '      npm run create-user\n\n' +
      '    To pass the URL manually:\n' +
      '      DATABASE_URL="postgresql://..." npm run create-user'
    );
  }

  // Mask the password segment before printing
  const safeUrl = dbUrl.replace(/:([^:@\s]+)@/, ':***@');
  ok(`DATABASE_URL = ${safeUrl}`);

  // ── Step 1: collect inputs ────────────────────────────────────────────────
  step(1, 'Collecting user details …');

  const rl = createInterface({ input, output, terminal: false });

  const rawName     = await prompt(rl, 'Full name   :');
  const rawEmail    = await prompt(rl, 'Email       :');
  const rawPassword = await prompt(rl, 'Password    :');
  const rawWs       = await prompt(rl, 'Workspace   : (press Enter → "<name>\'s Workspace")');

  rl.close();

  // ── validate ──────────────────────────────────────────────────────────────
  const name  = rawName;
  const email = rawEmail.toLowerCase();

  if (!name)  fail('Full name cannot be empty.');
  if (!email) fail('Email cannot be empty.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`"${email}" is not a valid email address.`);
  }
  if (!rawPassword)         fail('Password cannot be empty.');
  if (rawPassword.length < 8) fail('Password must be at least 8 characters long.');

  const workspaceName = rawWs.length > 0 ? rawWs : `${name}'s Workspace`;

  info(`Name      : ${name}`);
  info(`Email     : ${email}`);
  info(`Password  : ${'●'.repeat(rawPassword.length)}`);
  info(`Workspace : ${workspaceName}`);

  ok('All inputs validated.');

  // ── Step 2: connect to database ───────────────────────────────────────────
  step(2, 'Connecting to database …');

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    fail(`Cannot connect to database:\n    ${String(err)}`);
  }

  ok('Connection established.');

  // ── Step 3: check for duplicate email ────────────────────────────────────
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
  info('Algorithm : SHA-256 (identical to /api/auth/login)');

  const passwordHash = hashPassword(rawPassword);

  ok(`Hash produced : ${passwordHash.slice(0, 16)}…  (${passwordHash.length} hex chars)`);

  // ── Step 5: create user ───────────────────────────────────────────────────
  step(5, 'Creating user row …');

  let user: { id: string; email: string; name: string; createdAt: Date };

  try {
    user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    fail(`Failed to create user:\n    ${String(err)}`);
  }

  ok(`User created.`);
  info(`id        : ${user.id}`);
  info(`email     : ${user.email}`);
  info(`name      : ${user.name}`);
  info(`createdAt : ${user.createdAt.toISOString()}`);

  // ── Step 6: create workspace ──────────────────────────────────────────────
  step(6, 'Creating workspace row …');

  let workspace: { id: string; name: string; plan: string; createdAt: Date };

  try {
    workspace = await prisma.workspace.create({
      data: { name: workspaceName, plan: 'free' },
      select: { id: true, name: true, plan: true, createdAt: true },
    });
  } catch (err) {
    // Best-effort rollback: delete the orphan user
    warn('Workspace creation failed — rolling back user …');
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    fail(`Failed to create workspace:\n    ${String(err)}`);
  }

  ok(`Workspace created.`);
  info(`id        : ${workspace.id}`);
  info(`name      : ${workspace.name}`);
  info(`plan      : ${workspace.plan}`);

  // ── Step 7: create workspace_member (OWNER) ───────────────────────────────
  step(7, 'Adding user to workspace as OWNER …');

  let member: { id: string; role: string };

  try {
    member = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId:      user.id,
        role:        'OWNER',
      },
      select: { id: true, role: true },
    });
  } catch (err) {
    warn('WorkspaceMember creation failed — rolling back workspace and user …');
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    fail(`Failed to create workspace member:\n    ${String(err)}`);
  }

  ok(`WorkspaceMember created.`);
  info(`id        : ${member.id}`);
  info(`role      : ${member.role}`);

  // ── Step 8: verify login ──────────────────────────────────────────────────
  step(8, 'Verifying login (DB re-query with same hash logic as /api/auth/login) …');

  const loginCheck = await prisma.user.findFirst({
    where: { email, passwordHash: hashPassword(rawPassword) },
    select: { id: true },
  });

  await prisma.$disconnect();

  if (!loginCheck || loginCheck.id !== user.id) {
    fail(
      'Login verification FAILED — the stored hash does not match.\n' +
      '    This should never happen. Please check the database manually.'
    );
  }

  const token = Buffer.from(`${user.id}:${user.email}`).toString('base64');

  ok(`Login verified — credentials are correct.`);
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
  console.log(`  https://adlytic-production.up.railway.app`);
  hr();
  console.log('');
}

main().catch((err: unknown) => {
  console.error(`\n${C.red}[FATAL]${C.reset}`, err);
  exit(1);
});
