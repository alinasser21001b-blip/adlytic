/**
 * IQD currency repair: heal stale factor=100 rows and rescale daily_stats monetary
 * fields when sync used the wrong minor factor against raw Meta insight majors.
 */
import { EntityType, type PrismaClient } from "@prisma/client";
import { currencyFactorNeedsHeal, resolveCurrencyMinorFactor } from "./currency";

const OVERSCALE_DIVISOR = 100;
const OVERSCALE_TOLERANCE = 0.02;

function parseMetaSpend(rawJson: unknown): number | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const v = (rawJson as Record<string, unknown>).spend;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type MonetaryStatRow = {
  id: string;
  spend: bigint;
  impressions?: bigint;
  cpc?: number | null;
  cpm?: number | null;
  costPerMessage?: number | null;
  revenueMinor?: bigint;
};

/** Divide all mapper-scaled monetary fields by 100 (sync used factor=100 on IQD). */
function rescaleMonetaryFields(row: MonetaryStatRow, divisor = OVERSCALE_DIVISOR) {
  const data: {
    spend: bigint;
    cpc?: number;
    cpm?: number;
    costPerMessage?: number;
    revenueMinor?: bigint;
  } = {
    spend: BigInt(Math.round(Number(row.spend) / divisor)),
  };
  if (row.cpc != null && Number.isFinite(row.cpc)) data.cpc = row.cpc / divisor;
  if (row.cpm != null && Number.isFinite(row.cpm)) data.cpm = row.cpm / divisor;
  if (row.costPerMessage != null && Number.isFinite(row.costPerMessage)) {
    data.costPerMessage = row.costPerMessage / divisor;
  }
  if (row.revenueMinor != null && Number(row.revenueMinor) > 0) {
    data.revenueMinor = BigInt(Math.round(Number(row.revenueMinor) / divisor));
  }
  return data;
}

/**
 * Detect campaign rows synced with factor=100 (no raw_insights backup).
 * spend and cpm were both multiplied by 100 in insightMapper.
 */
function campaignRowOverscaled(row: MonetaryStatRow): boolean {
  const spend = Number(row.spend);
  if (spend < OVERSCALE_DIVISOR) return false;
  const impr = Number(row.impressions ?? 0);
  if (impr <= 0) return row.cpm != null && row.cpm > 200_000;
  const rescaledCpm = (spend / OVERSCALE_DIVISOR) / impr * 1000;
  const cpmStored = row.cpm;
  if (cpmStored == null) return spend >= 10_000;
  if (cpmStored > 200_000) return true;
  if (rescaledCpm >= 50 && rescaledCpm <= 500_000 && cpmStored > rescaledCpm * 50) return true;
  return false;
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
  campaignRowsRescaled: number;
}

/** Rescale daily_stats for one IQD account from raw_insights (account) + heuristics (campaign). */
export async function rescaleIqdSpendForAccount(
  prisma: PrismaClient,
  accountId: string,
): Promise<{ rowsRescaled: number; rowsVerified: number; campaignRowsRescaled: number }> {
  const acct = await prisma.adAccount.findUnique({
    where: { id: accountId },
    select: { id: true, currency: true, currencyMinorFactor: true },
  });
  if (!acct || acct.currency !== "IQD") {
    return { rowsRescaled: 0, rowsVerified: 0, campaignRowsRescaled: 0 };
  }
  const accountResult = await rescaleIqdAccountRows(prisma, acct);
  const campaignRowsRescaled = await rescaleIqdCampaignRows(prisma, accountId);
  return { ...accountResult, campaignRowsRescaled };
}

export async function rescaleIqdSpendFromRaw(prisma: PrismaClient): Promise<RescaleIqdSpendResult> {
  const accounts = await prisma.adAccount.findMany({
    where: { currency: "IQD" },
    select: { id: true, currencyMinorFactor: true },
  });

  let rowsRescaled = 0;
  let rowsVerified = 0;
  let campaignRowsRescaled = 0;

  for (const acct of accounts) {
    const result = await rescaleIqdAccountRows(prisma, acct);
    rowsRescaled += result.rowsRescaled;
    rowsVerified += result.rowsVerified;
    campaignRowsRescaled += await rescaleIqdCampaignRows(prisma, acct.id);
  }

  return { accountsChecked: accounts.length, rowsRescaled, rowsVerified, campaignRowsRescaled };
}

async function rescaleIqdAccountRows(
  prisma: PrismaClient,
  acct: { id: string; currencyMinorFactor: number },
): Promise<{ rowsRescaled: number; rowsVerified: number }> {
  let rowsRescaled = 0;
  let rowsVerified = 0;
  const factor = resolveCurrencyMinorFactor("IQD", acct.currencyMinorFactor);
  const raws = await prisma.rawInsight.findMany({
    where: { entityType: EntityType.ACCOUNT, entityId: acct.id },
    select: { date: true, rawJson: true },
  });
  if (!raws.length) return { rowsRescaled, rowsVerified };

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
      select: {
        id: true,
        spend: true,
        cpc: true,
        cpm: true,
        costPerMessage: true,
        revenueMinor: true,
      },
    });
    if (!stat) continue;

    const stored = Number(stat.spend);
    const overScaled =
      metaMajor > 0 &&
      Math.abs(stored / (metaMajor * OVERSCALE_DIVISOR) - 1) < OVERSCALE_TOLERANCE &&
      Math.abs(stored - expectedMinor) > 1;

    if (overScaled) {
      await prisma.dailyStat.update({
        where: { id: stat.id },
        data: rescaleMonetaryFields(stat),
      });
      rowsRescaled++;
    } else if (Math.abs(stored - expectedMinor) <= 1) {
      rowsVerified++;
    }
  }
  return { rowsRescaled, rowsVerified };
}

async function rescaleIqdCampaignRows(prisma: PrismaClient, accountId: string): Promise<number> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId: accountId },
    select: { id: true },
  });
  if (!campaigns.length) return 0;

  let rowsRescaled = 0;
  for (const camp of campaigns) {
    const stats = await prisma.dailyStat.findMany({
      where: { entityType: EntityType.CAMPAIGN, entityId: camp.id },
      select: {
        id: true,
        spend: true,
        impressions: true,
        cpc: true,
        cpm: true,
        costPerMessage: true,
        revenueMinor: true,
      },
    });
    for (const stat of stats) {
      if (!campaignRowOverscaled(stat)) continue;
      await prisma.dailyStat.update({
        where: { id: stat.id },
        data: rescaleMonetaryFields(stat),
      });
      rowsRescaled++;
    }
  }
  return rowsRescaled;
}

/** Rescale lifetimeSpendMinor when it matches the ×100 overscale pattern. */
async function healLifetimeSpendMinor(prisma: PrismaClient, accountId: string): Promise<void> {
  const acct = await prisma.adAccount.findUnique({
    where: { id: accountId },
    select: { lifetimeSpendMinor: true },
  });
  if (!acct || Number(acct.lifetimeSpendMinor) <= 0) return;

  const since = new Date(Date.now() - 90 * 864e5);
  const sum90 = await prisma.dailyStat.aggregate({
    where: { entityType: EntityType.ACCOUNT, entityId: accountId, date: { gte: since } },
    _sum: { spend: true },
  });
  const windowSum = Number(sum90._sum.spend ?? 0);
  const lifetime = Number(acct.lifetimeSpendMinor);
  if (windowSum <= 0) return;

  const looksOverScaled =
    lifetime / windowSum > 50 &&
    Math.abs(lifetime / (windowSum * OVERSCALE_DIVISOR) - 1) < 0.15;
  if (!looksOverScaled) return;

  await prisma.adAccount.update({
    where: { id: accountId },
    data: { lifetimeSpendMinor: BigInt(Math.round(lifetime / OVERSCALE_DIVISOR)) },
  });
}

/**
 * Heal stale currencyMinorFactor on an ad account and rescale IQD monetary rows
 * when raw_insights prove sync used factor=100. Returns the resolved factor.
 */
export async function healAccountCurrencyAndSpend(
  prisma: PrismaClient,
  account: { id: string; currency: string; currencyMinorFactor: number },
): Promise<number> {
  let factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);
  if (currencyFactorNeedsHeal(account.currency, account.currencyMinorFactor)) {
    factor = resolveCurrencyMinorFactor(account.currency, null);
    await prisma.adAccount.update({
      where: { id: account.id },
      data: { currencyMinorFactor: factor },
    });
    if (account.currency === "IQD") {
      await rescaleIqdSpendForAccount(prisma, account.id);
      await healLifetimeSpendMinor(prisma, account.id);
    }
  }
  return factor;
}
