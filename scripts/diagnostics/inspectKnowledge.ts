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
  console.log("=== Knowledge Rules ===");
  const rules = await prisma.knowledgeRule.findMany();
  console.log("count:", rules.length);
  if (rules.length > 0) console.log("first:", JSON.stringify(rules[0]).slice(0, 200));

  console.log("\n=== Detected Issues ===");
  const issues = await prisma.detectedIssue.findMany({ take: 5, orderBy: { date: 'desc' } });
  console.log("count:", issues.length);
  for (const i of issues) console.log({ issueCode: i.issueCode, severity: i.severity, date: i.date });

  console.log("\n=== Recommendations ===");
  const recs = await prisma.recommendation.findMany({ take: 5 });
  for (const r of recs) console.log({ actionCode: r.actionCode, priority: r.priority, date: r.date });

  await prisma.$disconnect(); await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
