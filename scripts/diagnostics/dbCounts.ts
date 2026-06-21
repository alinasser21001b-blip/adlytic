import { PrismaClient, EntityType } from "@prisma/client";
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
  console.log("\n=== AD ACCOUNTS ===");
  const accounts = await prisma.adAccount.findMany({
    select: { id: true, externalAccountId: true, name: true, status: true, lastSyncedAt: true, tokenExpiresAt: true, accessTokenEncrypted: true }
  });
  for (const a of accounts) {
    console.log({
      id: a.id, externalId: a.externalAccountId, name: a.name,
      status: a.status, lastSyncedAt: a.lastSyncedAt,
      tokenExpiresAt: a.tokenExpiresAt,
      hasToken: !!a.accessTokenEncrypted,
      tokenPreview: a.accessTokenEncrypted ? a.accessTokenEncrypted.slice(0, 40) + '...' : null,
    });
  }

  console.log("\n=== DAILY STATS COUNT ===");
  const statsCount = await prisma.dailyStat.count();
  console.log("total rows:", statsCount);
  if (statsCount > 0) {
    const recent = await prisma.dailyStat.findMany({ take: 3, orderBy: { date: 'desc' } });
    console.log("recent rows:", recent.map(r => ({ entityType: r.entityType, entityId: r.entityId.slice(0,8), date: r.date, spend: r.spend?.toString() })));
  }

  console.log("\n=== METRIC TRENDS COUNT ===");
  const trendsCount = await prisma.metricTrend.count();
  console.log("total rows:", trendsCount);

  console.log("\n=== HEALTH SCORES COUNT ===");
  const healthCount = await prisma.healthScore.count();
  console.log("total rows:", healthCount);

  console.log("\n=== RECOMMENDATIONS COUNT ===");
  const recCount = await prisma.recommendation.count();
  console.log("total rows:", recCount);

  await prisma.$disconnect();
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
