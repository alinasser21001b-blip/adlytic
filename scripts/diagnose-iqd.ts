/**
 * Read-only production diagnostic for IQD currency / spend mismatch.
 * Usage: npx tsx --env-file=.env scripts/diagnose-iqd.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const emails = ["wqqwq@gmail.com", "ygdgh@adlytic.ai"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const parsed = new URL(url);
  const pool = new pg.Pool({
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: parsed.hostname.endsWith(".railway.internal")
      ? false
      : { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      memberships: {
        select: {
          workspace: {
            select: {
              id: true,
              name: true,
              adAccounts: {
                select: {
                  id: true,
                  name: true,
                  currency: true,
                  currencyMinorFactor: true,
                  status: true,
                  lastSyncedAt: true,
                  externalAccountId: true,
                  campaigns: {
                    where: { status: "ACTIVE" },
                    select: { id: true, name: true, dailyBudget: true },
                    take: 3,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  console.log("=== USERS & AD ACCOUNTS ===");
  for (const u of users) {
    console.log(`\nUser: ${u.email}`);
    for (const m of u.memberships) {
      const ws = m.workspace;
      console.log(`  Workspace: ${ws.name} (${ws.id})`);
      for (const acct of ws.adAccounts) {
        console.log(
          `    AdAccount: ${acct.name} | ${acct.currency} | factor=${acct.currencyMinorFactor} | status=${acct.status} | lastSync=${acct.lastSyncedAt?.toISOString() ?? "never"}`,
        );
        for (const c of acct.campaigns) {
          console.log(
            `      Campaign: ${c.name} dailyBudget=${c.dailyBudget?.toString() ?? "null"}`,
          );
        }

        const stats = await prisma.dailyStat.findMany({
          where: { entityType: "ACCOUNT", entityId: acct.id },
          orderBy: { date: "desc" },
          take: 10,
          select: { date: true, spend: true, messages: true },
        });
        const total30 = await prisma.dailyStat.aggregate({
          where: {
            entityType: "ACCOUNT",
            entityId: acct.id,
            date: { gte: new Date(Date.now() - 30 * 864e5) },
          },
          _sum: { spend: true },
        });
        console.log(`    30d spend sum (minor): ${total30._sum.spend?.toString() ?? "0"}`);
        console.log(`    Recent daily_stats:`);
        for (const s of stats) {
          console.log(
            `      ${s.date.toISOString().slice(0, 10)} spend=${s.spend.toString()} msgs=${s.messages}`,
          );
        }

        const raw = await prisma.rawInsight.findFirst({
          where: { entityType: "ACCOUNT", entityId: acct.id },
          orderBy: { date: "desc" },
          select: { date: true, rawJson: true },
        });
        if (raw) {
          const j = raw.rawJson as Record<string, unknown>;
          console.log(
            `    Latest raw Meta spend: ${String(j.spend ?? "?")} (${raw.date.toISOString().slice(0, 10)})`,
          );
        }
      }
    }
  }

  const allIqd = await prisma.adAccount.findMany({
    where: { currency: "IQD" },
    select: {
      id: true,
      currencyMinorFactor: true,
      workspace: { select: { name: true, members: { select: { user: { select: { email: true } } } } } },
    },
  });
  console.log("\n=== ALL IQD ACCOUNTS ===");
  for (const a of allIqd) {
    const wrongFactor = a.currencyMinorFactor !== 1;
    console.log(
      `  ${a.id} factor=${a.currencyMinorFactor}${wrongFactor ? " ⚠️ WRONG" : ""} ws=${a.workspace.name} users=${a.workspace.members.map((m) => m.user.email).join(",")}`,
    );
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
