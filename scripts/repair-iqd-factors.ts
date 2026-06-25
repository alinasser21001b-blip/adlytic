/**
 * One-time repair: heal IQD currencyMinorFactor and rescale daily_stats.spend
 * from raw Meta insight majors when sync used factor=100.
 *
 * Run: DATABASE_URL=<public-url> npx tsx scripts/repair-iqd-factors.ts
 * Or:  railway run npx tsx scripts/repair-iqd-factors.ts  (from service with DB access)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { healIqdAccountFactors, rescaleIqdSpendFromRaw } from "../src/lib/iqdRepair";

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

  const factorsHealed = await healIqdAccountFactors(prisma);
  console.log(`Healed currencyMinorFactor on ${factorsHealed} IQD account(s).`);

  const rescale = await rescaleIqdSpendFromRaw(prisma);
  console.log(
    `Rescaled ${rescale.rowsRescaled} daily_stat row(s) across ${rescale.accountsChecked} IQD account(s); ${rescale.rowsVerified} already correct.`,
  );

  if (rescale.rowsRescaled > 0 || factorsHealed > 0) {
    console.log("Trigger a 90-day sync from the workspace UI or POST /api/workspaces/:id/repair-iqd.");
  } else {
    console.log("Nothing to repair.");
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
