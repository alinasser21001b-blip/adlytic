/**
 * Full production diagnostic: all accounts, spend rows, budgets, user mapping.
 * Usage: DATABASE_URL=<public-url> npx tsx scripts/diagnose-iqd-full.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

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

  const accounts = await prisma.adAccount.findMany({
    include: {
      workspace: {
        include: { members: { include: { user: { select: { email: true } } } } },
      },
    },
  });

  console.log(`=== ALL AD ACCOUNTS (${accounts.length}) ===`);
  for (const a of accounts) {
    const emails = a.workspace.members.map((m) => m.user.email).join(",");
    const total30 = await prisma.dailyStat.aggregate({
      where: {
        entityType: "ACCOUNT",
        entityId: a.id,
        date: { gte: new Date(Date.now() - 30 * 864e5) },
      },
      _sum: { spend: true },
    });
    const recent = await prisma.dailyStat.findMany({
      where: { entityType: "ACCOUNT", entityId: a.id },
      orderBy: { date: "desc" },
      take: 5,
      select: { date: true, spend: true, messages: true },
    });
    const camps = await prisma.campaign.findMany({
      where: { adAccountId: a.id },
      select: { name: true, status: true, dailyBudget: true },
      take: 5,
    });
    const raw = await prisma.rawInsight.findFirst({
      where: { entityType: "ACCOUNT", entityId: a.id },
      orderBy: { date: "desc" },
      select: { date: true, rawJson: true },
    });

    console.log(
      `\n${a.name} | ${a.currency} | factor=${a.currencyMinorFactor} | ext=${a.externalAccountId}`,
    );
    console.log(`  ws=${a.workspace.name} (${a.workspaceId}) users=${emails}`);
    console.log(`  lastSync=${a.lastSyncedAt?.toISOString() ?? "never"}`);
    console.log(`  30d spend sum (raw minor): ${total30._sum.spend?.toString() ?? "0"}`);
    if (recent.length) {
      console.log("  recent daily_stats:");
      for (const s of recent) {
        console.log(
          `    ${s.date.toISOString().slice(0, 10)} spend=${s.spend.toString()} msgs=${s.messages}`,
        );
      }
    } else {
      console.log("  recent daily_stats: (none)");
    }
    if (camps.length) {
      console.log("  campaigns:");
      for (const c of camps) {
        console.log(
          `    ${c.name} [${c.status}] dailyBudget=${c.dailyBudget?.toString() ?? "null"}`,
        );
      }
    }
    if (raw) {
      const j = raw.rawJson as Record<string, unknown>;
      console.log(
        `  latest raw Meta spend: ${String(j.spend ?? "?")} (${raw.date.toISOString().slice(0, 10)})`,
      );
    }
  }

  // Users with no ad account (empty dashboard path)
  const emptyWs = await prisma.workspace.findMany({
    where: { adAccounts: { none: {} } },
    include: { members: { include: { user: { select: { email: true } } } } },
  });
  console.log(`\n=== WORKSPACES WITH NO AD ACCOUNT (${emptyWs.length}) ===`);
  for (const w of emptyWs) {
    console.log(
      `  ${w.name} (${w.id}) users=${w.members.map((m) => m.user.email).join(",")}`,
    );
  }

  // Hunt tiny spend values that would display as ~12 after /100
  const tiny = await prisma.dailyStat.findMany({
    where: { entityType: "ACCOUNT", spend: { lte: 50, gt: 0 } },
    orderBy: { date: "desc" },
    take: 20,
    select: { entityId: true, date: true, spend: true },
  });
  console.log(`\n=== ACCOUNT DAILY_STATS WITH SPEND 1-50 (${tiny.length} rows) ===`);
  for (const t of tiny) {
    console.log(`  entity=${t.entityId.slice(0, 12)} date=${t.date.toISOString().slice(0, 10)} spend=${t.spend}`);
  }

  // Budget ~800
  const budget800 = await prisma.campaign.findMany({
    where: { dailyBudget: { gte: 750, lte: 850 } },
    select: { name: true, dailyBudget: true, adAccountId: true },
  });
  console.log(`\n=== CAMPAIGNS WITH BUDGET ~800 (${budget800.length}) ===`);
  for (const c of budget800) {
    console.log(`  ${c.name} budget=${c.dailyBudget?.toString()} acct=${c.adAccountId.slice(0, 12)}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
