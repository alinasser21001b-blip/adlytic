import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const dbUrl = process.env['DATABASE_URL']!;
const parsed = new URL(dbUrl);
const pool = new pg.Pool({
  host: parsed.hostname, port: Number(parsed.port) || 5432,
  user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''), ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const rules = await prisma.knowledgeRule.findMany({
    select: { issueCode: true, locale: true, industryProfileId: true, title: true }
  });
  for (const r of rules) {
    console.log(r.issueCode, r.locale, r.industryProfileId ? 'industry-specific' : 'UNIVERSAL', '->', r.title);
  }
  await prisma.$disconnect(); await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
