/**
 * IQD currency repair: heal stale factor=100 rows and rescale daily_stats.spend
 * when sync used the wrong minor factor against raw Meta insight majors.
 */
import { EntityType, type PrismaClient } from "@prisma/client";
import { resolveCurrencyMinorFactor } from "./currency";

function parseMetaSpend(rawJson: unknown): number | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const v = (rawJson as Record<string, unknown>).spend;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Set currencyMinorFactor=1 for all IQD ad accounts that still carry 100. */
export async function healIqdAccountFactors(prisma: PrismaClient): Promise<number> {
  const result = await prisma.adAccount.updateMany({
    where: { currency: "IQD", currencyMinorFactor: { not: 1 } },
    data: { currencyMinorFactor: 1 },
  });
  return result.count;
}

export interface RescaleIqdSpendResult {
  accountsChecked: number;
  rowsRescaled: number;
  rowsVerified: number;
}

/**
 * For IQD accounts, compare daily_stats.spend to raw_insights Meta major spend.
 * When stored ≈ meta×100 (sync used factor=100), rewrite to meta (factor=1).
 */
export async function rescaleIqdSpendFromRaw(prisma: PrismaClient): Promise<RescaleIqdSpendResult> {
  const accounts = await prisma.adAccount.findMany({
    where: { currency: "IQD" },
    select: { id: true, currencyMinorFactor: true },
  });

  let rowsRescaled = 0;
  let rowsVerified = 0;

  for (const acct of accounts) {
    const factor = resolveCurrencyMinorFactor("IQD", acct.currencyMinorFactor);
    const raws = await prisma.rawInsight.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: acct.id },
      select: { date: true, rawJson: true },
    });
    if (!raws.length) continue;

    for (const raw of raws) {
      const metaMajor = parseMetaSpend(raw.rawJson);
      if (metaMajor == null) continue;

      const expectedMinor = Math.round(metaMajor * factor);
      const stat = await prisma.dailyStat.findFirst({
        where: {
          entityType: EntityType.ACCOUNT,
          entityId: acct.id,
          date: raw.date,
        },
        select: { id: true, spend: true },
      });
      if (!stat) continue;

      const stored = Number(stat.spend);
      const overScaled =
        metaMajor > 0 &&
        Math.abs(stored / (metaMajor * 100) - 1) < 0.02 &&
        Math.abs(stored - expectedMinor) > 1;

      if (overScaled) {
        await prisma.dailyStat.update({
          where: { id: stat.id },
          data: { spend: BigInt(Math.round(metaMajor * factor)) },
        });
        rowsRescaled++;
      } else if (Math.abs(stored - expectedMinor) <= 1) {
        rowsVerified++;
      }
    }
  }

  return { accountsChecked: accounts.length, rowsRescaled, rowsVerified };
}
