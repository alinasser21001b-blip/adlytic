/** Quick compare raw_insights vs daily_stats for one account. */
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

  const extId = process.argv[2] ?? "act_2040815276495175";
  const acct = await prisma.adAccount.findFirst({ where: { externalAccountId: extId } });
  if (!acct) {
    console.log("no account for", extId);
    return;
  }
  console.log(`Account ${acct.name} ${acct.currency} factor=${acct.currencyMinorFactor}`);

  const since = new Date("2026-06-20");
  const raw = await prisma.rawInsight.findMany({
    where: { entityType: "ACCOUNT", entityId: acct.id, date: { gte: since } },
    orderBy: { date: "desc" },
  });
  const stats = await prisma.dailyStat.findMany({
    where: { entityType: "ACCOUNT", entityId: acct.id, date: { gte: since } },
    orderBy: { date: "desc" },
  });
  const statByDate = new Map(stats.map((s) => [s.date.toISOString().slice(0, 10), s]));

  for (const r of raw) {
    const d = r.date.toISOString().slice(0, 10);
    const j = r.rawJson as Record<string, unknown>;
    const actions = (j.actions as Array<{ action_type?: string; value?: string }>) ?? [];
    const msg = actions.find((a) =>
      a.action_type?.includes("messaging_conversation_started"),
    );
    const s = statByDate.get(d);
    const metaSpend = j.spend;
    const storedSpend = s?.spend?.toString() ?? "—";
    const metaMsg = msg?.value ?? "—";
    const storedMsg = s?.messages?.toString() ?? "—";
    const spendMatch = s && String(metaSpend) === storedSpend;
    const msgMatch = s && String(metaMsg) === storedMsg;
    console.log(
      d,
      `spend meta=${metaSpend} stored=${storedSpend}${spendMatch ? " OK" : " MISMATCH"}`,
      `msg meta=${metaMsg} stored=${storedMsg}${msgMatch ? " OK" : " MISMATCH"}`,
      `reach meta=${j.reach} stored=${s?.reach ?? "—"}`,
    );
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
