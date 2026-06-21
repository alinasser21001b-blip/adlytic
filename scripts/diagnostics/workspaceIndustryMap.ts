import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const dbUrl = process.env['DATABASE_URL']!;
const parsed = new URL(dbUrl);
const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.replace(/^\//, ''), ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const workspaces = await prisma.workspace.findMany({
    include: { adAccounts: { select: { externalAccountId: true } }, industryProfile: true }
  });
  for (const w of workspaces) {
    console.log(w.name, '| industryProfileId:', w.industryProfileId, '| profile:', w.industryProfile?.name ?? 'NULL');
  }
  await prisma.$disconnect(); await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
