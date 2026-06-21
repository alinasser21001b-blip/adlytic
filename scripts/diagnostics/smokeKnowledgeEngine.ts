import { PrismaClient, IssueCode, Locale } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { KnowledgeEngine } from "../src/engines/knowledge/KnowledgeEngine";

const dbUrl = process.env['DATABASE_URL']!;
const parsed = new URL(dbUrl);
const pool = new pg.Pool({
  host: parsed.hostname, port: Number(parsed.port) || 5432,
  user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''), ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const knowledge = new KnowledgeEngine(prisma);
  const result = await knowledge.lookupMany({
    issueCodes: [IssueCode.DECLINING_RESULTS, IssueCode.HIGH_FREQUENCY],
    locale: Locale.EN,
    industryProfileId: null,
  });
  for (const [code, entry] of result) {
    console.log(`\n${code}:`);
    console.log("  title:", entry?.title);
    console.log("  causes:", entry?.causes);
    console.log("  recommendations:", entry?.recommendations);
  }
  await prisma.$disconnect(); await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
