#!/usr/bin/env npx tsx
/**
 * Upsert a specific owner login (create or reset password + activate).
 *
 * Usage (production):
 *   railway run --service adlytic npx tsx scripts/upsert-owner-login.ts
 *
 * Or with env:
 *   OWNER_EMAIL=i6900612@gmail.com OWNER_PASSWORD='Aa213213' \
 *   OWNER_NAME='Ali' DATABASE_URL=... npx tsx scripts/upsert-owner-login.ts
 *
 * Never prints the password.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../src/services/jwtAuth';

const email = (process.env['OWNER_EMAIL'] || 'i6900612@gmail.com').trim().toLowerCase();
const password = process.env['OWNER_PASSWORD'] || 'Aa213213';
const name = (process.env['OWNER_NAME'] || 'Ali').trim() || 'Ali';
const workspaceName = (process.env['OWNER_WORKSPACE'] || 'Ali Workspace').trim();

async function main() {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const u = new URL(dbUrl);
  const pool = new pg.Pool({
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isActive: true, memberships: { select: { id: true }, take: 1 } },
    });

    let userId: string;
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          tokenVersion: { increment: 1 },
          isActive: true,
          activatedAt: existing.isActive ? undefined : new Date(),
          activatedBy: existing.isActive ? undefined : 'upsert-owner-login',
        },
        select: { id: true, email: true, isActive: true },
      });
      userId = updated.id;
      console.log(`Updated existing user ${updated.email} (active=${updated.isActive})`);
      if (!existing.memberships.length) {
        const ws = await prisma.workspace.create({
          data: { name: workspaceName, tier: 'PREMIUM', subscriptionStatus: 'ACTIVE' },
        });
        await prisma.workspaceMember.create({
          data: { workspaceId: ws.id, userId, role: 'OWNER' },
        });
        console.log(`Created workspace ${ws.name} and OWNER membership`);
      }
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash,
            locale: 'AR',
            isActive: true,
            activatedAt: new Date(),
            activatedBy: 'upsert-owner-login',
          },
          select: { id: true, email: true },
        });
        const ws = await tx.workspace.create({
          data: {
            name: workspaceName,
            tier: 'PREMIUM',
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: new Date(Date.now() + 365 * 864e5),
            paymentMethod: 'WHATSAPP_MANUAL',
          },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' },
        });
        await tx.paymentEvent.create({
          data: {
            workspaceId: ws.id,
            eventType: 'ACTIVATED',
            source: 'WHATSAPP_MANUAL',
            tierAfter: 'PREMIUM',
            note: 'Owner bootstrap via upsert-owner-login',
            triggeredBy: 'upsert-owner-login',
          },
        });
        return { user, workspaceId: ws.id };
      });
      userId = created.user.id;
      console.log(`Created user ${created.user.email} + Premium workspace`);
    }

    const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, email: true } });
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      console.error('Password verification failed after write');
      process.exit(1);
    }

    const allow = (process.env['PLATFORM_ADMIN_EMAILS'] || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = allow.includes(email);
    console.log(`Login ready for ${row.email}`);
    console.log(
      isAdmin
        ? 'PLATFORM_ADMIN_EMAILS includes this email — /admin will work.'
        : 'WARNING: add this email to PLATFORM_ADMIN_EMAILS on Railway for /admin access.',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
