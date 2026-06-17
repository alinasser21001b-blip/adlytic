// ════════════════════════════════════════════════════════════════════════
//  scripts/create-user-auto.ts
//
//  Zero-input user creation for Adlytic.
//  Generates name, email, password, and workspace automatically.
//  No prompts. No input required.
//
//  Usage:
//    npm run create-user:auto
//    railway run npm run create-user:auto
// ════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import { PrismaClient, WorkspaceRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// ── Generation data ───────────────────────────────────────────────────────────

const FIRST_NAMES = ['Ali', 'Ahmed', 'Sara', 'Noor', 'Omar'] as const;

function randomName(): string {
  return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
}

/** 4-digit number, padded, e.g. "0847" → we use 1000–9999 for readability */
function randomSuffix(): string {
  return String(Math.floor(Math.random() * 9000) + 1000);
}

// ── DB setup ──────────────────────────────────────────────────────────────────

function buildPrisma(dbUrl: string): { prisma: PrismaClient; pool: pg.Pool } {
  const p = new URL(dbUrl);
  const pool = new pg.Pool({
    host:     p.hostname,
    port:     Number(p.port) || 5432,
    user:     decodeURIComponent(p.username),
    password: decodeURIComponent(p.password),
    database: p.pathname.replace(/^\//, ''),
    ssl:      { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Verify DATABASE_URL
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const { prisma, pool } = buildPrisma(dbUrl);

  try {
    // 2. Generate credentials
    const name   = randomName();
    const suffix = randomSuffix();
    const email  = `${name.toLowerCase()}-${suffix}@adlytic.io`;
    const password    = `${name}${suffix}`;          // e.g. Ali8472
    const wsName      = `${name} Workspace`;
    const passwordHash = createHash('sha256').update(password).digest('hex');

    // 3. Guard: retry if email already exists (astronomically unlikely but safe)
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Re-run with a fresh suffix — just restart the process
      console.error(`Email ${email} already exists. Re-run to get a new one.`);
      process.exit(2);
    }

    // 4. Create user
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    // 5. Create workspace + OWNER membership
    const workspace = await prisma.workspace.create({
      data: {
        name: wsName,
        plan: 'free',
        members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
      },
    });

    // 6. Print result
    console.log('');
    console.log('==================================');
    console.log('ACCOUNT CREATED');
    console.log('==================================');
    console.log('');
    console.log('Name:');
    console.log(name);
    console.log('');
    console.log('Email:');
    console.log(email);
    console.log('');
    console.log('Password:');
    console.log(password);
    console.log('');
    console.log('Workspace:');
    console.log(wsName);
    console.log('');
    console.log('User ID:');
    console.log(user.id);
    console.log('');
    console.log('Workspace ID:');
    console.log(workspace.id);
    console.log('');
    console.log('Login URL:');
    console.log('http://localhost:3001/login');
    console.log('');
    console.log('==================================');
    console.log('');

  } finally {
    await (pool as any).end();
  }
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
