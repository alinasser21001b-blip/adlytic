/**
 * Operator tool: repair IQD spend that raw Meta data PROVES is 100x too large.
 *
 *   DATABASE_URL=<url> npx tsx scripts/repair-iqd-factors.ts            # report only (default)
 *   DATABASE_URL=<url> npx tsx scripts/repair-iqd-factors.ts --apply    # write
 *   … --account <adAccountId>                                           # limit to one account
 *
 * Differences from the previous version of this script:
 *  · REPORT-ONLY unless --apply is given.
 *  · Row-level evidence only: a row is rewritten when raw_insights spend for that
 *    entity and date is exactly 1/100 of it. Rows without evidence are left intact
 *    and counted.
 *  · One transaction and one advisory lock PER ACCOUNT (src/lib/iqdRepair.ts); a
 *    failure on one account rolls that account back and the run continues.
 *  · No heuristic fallback, and no global UPDATE across accounts.
 *
 * Never run against production without the owner's approval of the dry-run output.
 */
import { PrismaClient } from "@prisma/client";
import { pgSslFor } from "../src/lib/pgSsl";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { repairIqdAccountScale } from "../src/lib/iqdRepair";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const only = args.includes("--account") ? args[args.indexOf("--account") + 1] : undefined;

  const parsed = new URL(url);
  const pool = new pg.Pool({
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: pgSslFor(parsed.hostname),
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const accounts = await prisma.adAccount.findMany({
    where: { currency: "IQD", ...(only ? { id: only } : {}) },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  console.log(`${apply ? "APPLY" : "REPORT ONLY (no writes)"} — ${accounts.length} IQD account(s)`);

  let overscaled = 0, rescaled = 0, intact = 0, failed = 0;
  for (const a of accounts) {
    try {
      const r = await repairIqdAccountScale(prisma, a.id, { apply });
      overscaled += r.rowsOverscaled;
      rescaled += r.accountRowsRescaled + r.campaignRowsRescaled;
      intact += r.rowsUnverifiable;
      console.log(
        `${a.id.slice(0, 8)}…  factor ${r.factorBefore}→${r.factorAfter}  proven-x100=${r.rowsOverscaled}  rescaled=${r.accountRowsRescaled + r.campaignRowsRescaled}  verified=${r.rowsVerified}  left-intact=${r.rowsUnverifiable}`,
      );
    } catch (e) {
      failed++;
      console.error(`${a.id.slice(0, 8)}…  FAILED, rolled back:`, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`\nproven over-scaled: ${overscaled} · rescaled: ${rescaled} · left intact (no evidence): ${intact} · failed accounts: ${failed}`);
  if (!apply && overscaled > 0) console.log("Re-run with --apply after reviewing the numbers above.");

  await prisma.$disconnect();
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
