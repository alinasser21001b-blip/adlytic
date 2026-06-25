/**
 * One-time repair: set currency_minor_factor=1 for all IQD ad accounts.
 * Run: railway run npx tsx scripts/repair-iqd-factors.ts
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

  const wrong = await prisma.adAccount.findMany({
    where: { currency: "IQD", currencyMinorFactor: { not: 1 } },
    select: {
      id: true,
      name: true,
      currencyMinorFactor: true,
      workspace: { select: { name: true, members: { select: { user: { select: { email: true } } } } } },
    },
  });

  console.log(`Found ${wrong.length} IQD account(s) with wrong factor`);
  for (const a of wrong) {
    console.log(
      `  ${a.id} factor=${a.currencyMinorFactor} ws=${a.workspace.name} users=${a.workspace.members.map((m) => m.user.email).join(",")}`,
    );
  }

  if (wrong.length === 0) {
    console.log("Nothing to repair.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  const result = await prisma.adAccount.updateMany({
    where: { currency: "IQD", currencyMinorFactor: { not: 1 } },
    data: { currencyMinorFactor: 1 },
  });
  console.log(`Repaired ${result.count} ad account(s). Trigger a sync to refresh spend from Meta.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
