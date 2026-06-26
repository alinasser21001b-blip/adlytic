// ════════════════════════════════════════════════════════════════════════
//  src/lib/campaignFreeze.ts
//
//  Final Freeze — one-shot deep harvest when a campaign leaves active delivery.
//  Idempotent via CampaignHistorySnapshot @@unique([campaignId]).
//
//  Reuses MetaClient (transport), mapMetaInsight (cordon), and
//  resolveCurrencyMinorFactor (IQD Math.round ×1). ROAS is stored as the
//  factor-invariant ratio from mapMetaInsight — never re-scaled.
// ════════════════════════════════════════════════════════════════════════

import {
  PrismaClient,
  EntityType,
  EntityStatus,
  Prisma,
} from "@prisma/client";
import { MetaClient } from "../services/metaClient";
import { mapMetaInsight } from "../mappers/insightMapper";
import { resolveCurrencyMinorFactor } from "../lib/currency";

export interface FreezeResult {
  ok: boolean;
  skipped: boolean;
  campaignId: string;
  error?: string;
}

const BREAKDOWN_KEYS = ["age", "gender", "publisher_platform", "platform_position"] as const;
const TOP_CREATIVES_LIMIT = 5;
const AD_LIFETIME_CONCURRENCY = 3;

function currencyFactorForMapper(currency: string, storedFactor: number, context: string): number {
  const factor = resolveCurrencyMinorFactor(currency, storedFactor);
  if (currency === "IQD" && factor !== 1) {
    throw new Error(
      `[currency-assert] ${context}: IQD account passed factor=${factor}, expected 1`,
    );
  }
  return factor;
}

function parseMetaDateTime(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d : null;
}

function costPerMessageFromTotals(spendMinor: bigint, messages: bigint): number | null {
  if (messages <= 0n) return null;
  return +(Number(spendMinor) / Number(messages)).toFixed(4);
}

interface BreakdownAggregate {
  breakdownKey: string;
  breakdownValue: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  messages: number;
}

async function aggregateBreakdownStats(
  prisma: PrismaClient,
  campaignId: string,
): Promise<BreakdownAggregate[]> {
  const rows = await prisma.breakdownStat.groupBy({
    by: ["breakdownKey", "breakdownValue"],
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: campaignId,
    },
    _sum: {
      spend: true,
      impressions: true,
      clicks: true,
      messages: true,
    },
  });

  return rows
    .filter((r) => BREAKDOWN_KEYS.includes(r.breakdownKey as typeof BREAKDOWN_KEYS[number]))
    .map((r) => ({
      breakdownKey: r.breakdownKey,
      breakdownValue: r.breakdownValue,
      spendMinor: Number(r._sum.spend ?? 0n),
      impressions: Number(r._sum.impressions ?? 0n),
      clicks: Number(r._sum.clicks ?? 0n),
      messages: Number(r._sum.messages ?? 0n),
    }))
    .sort((a, b) => b.spendMinor - a.spendMinor);
}

interface CreativePerformanceRow {
  creativeId: string;
  externalCreativeId: string;
  name: string | null;
  spendMinor: number;
  messages: number;
  impressions: number;
}

async function harvestTopCreatives(
  prisma: PrismaClient,
  meta: MetaClient,
  campaignId: string,
  currency: string,
  currencyMinorFactor: number,
): Promise<CreativePerformanceRow[]> {
  const ads = await prisma.ad.findMany({
    where: {
      adSet: { campaignId },
      creativeId: { not: null },
    },
    select: {
      externalAdId: true,
      creativeId: true,
      creative: {
        select: {
          id: true,
          externalCreativeId: true,
          name: true,
        },
      },
    },
  });

  if (ads.length === 0) return [];

  const factor = currencyFactorForMapper(currency, currencyMinorFactor, "freeze creatives");
  const byCreative = new Map<string, CreativePerformanceRow>();

  for (let i = 0; i < ads.length; i += AD_LIFETIME_CONCURRENCY) {
    const slice = ads.slice(i, i + AD_LIFETIME_CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map(async (ad) => {
        if (!ad.creative) return null;
        const rows = await meta.getLifetimeTotalsForEntity({
          externalId: ad.externalAdId,
          level: "ad",
        });
        if (rows.length === 0) return null;
        const norm = mapMetaInsight(rows[0]!, { currencyMinorFactor: factor });
        return {
          creativeId: ad.creative.id,
          externalCreativeId: ad.creative.externalCreativeId,
          name: ad.creative.name,
          spendMinor: norm.spendMinor,
          messages: norm.messages,
          impressions: norm.impressions,
        };
      }),
    );

    for (const r of settled) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const row = r.value;
      const existing = byCreative.get(row.creativeId);
      if (existing) {
        existing.spendMinor += row.spendMinor;
        existing.messages += row.messages;
        existing.impressions += row.impressions;
      } else {
        byCreative.set(row.creativeId, { ...row });
      }
    }
  }

  return [...byCreative.values()]
    .sort((a, b) => b.spendMinor - a.spendMinor || b.messages - a.messages)
    .slice(0, TOP_CREATIVES_LIMIT);
}

/**
 * Deep-harvest and persist an immutable post-mortem snapshot.
 * No-op when a row already exists for campaignId (idempotent).
 */
export async function freezeCampaign(
  prisma: PrismaClient,
  meta: MetaClient,
  campaignId: string,
  opts?: { now?: Date },
): Promise<FreezeResult> {
  const now = opts?.now ?? new Date();
  const tag = `[freeze:${campaignId.slice(0, 8)}]`;

  const existing = await prisma.campaignHistorySnapshot.findUnique({
    where: { campaignId },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, skipped: true, campaignId };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      adAccount: {
        select: {
          id: true,
          workspaceId: true,
          externalAccountId: true,
          currency: true,
          currencyMinorFactor: true,
        },
      },
    },
  });

  if (!campaign) {
    return { ok: false, skipped: false, campaignId, error: "Campaign not found" };
  }

  const acct = campaign.adAccount;
  const factor = currencyFactorForMapper(
    acct.currency,
    acct.currencyMinorFactor,
    `${tag} lifetime totals`,
  );

  try {
    const lifetimeRows = await meta.getLifetimeTotalsForEntity({
      externalId: campaign.externalCampaignId,
      level: "campaign",
    });

    if (lifetimeRows.length === 0) {
      console.warn(`${tag} Meta returned no lifetime rows — skipping freeze`);
      return { ok: false, skipped: false, campaignId, error: "No lifetime insight rows" };
    }

    const totals = mapMetaInsight(lifetimeRows[0]!, { currencyMinorFactor: factor });

    const [breakdownAgg, topCreatives, latestBrain] = await Promise.all([
      aggregateBreakdownStats(prisma, campaignId),
      harvestTopCreatives(prisma, meta, campaignId, acct.currency, acct.currencyMinorFactor),
      prisma.campaignBrainSnapshot.findFirst({
        where: { campaignId },
        orderBy: { tickDate: "desc" },
        select: {
          patternSignature: true,
          action: true,
          finalScore: true,
          narrationJson: true,
          payload: true,
          tickDate: true,
        },
      }),
    ]);

    const metaCampaignRows = await meta.listCampaigns(acct.externalAccountId);
    const metaCamp = metaCampaignRows.find(
      (r) => String(r["id"]) === campaign.externalCampaignId,
    );
    const startedAt = parseMetaDateTime(metaCamp?.["start_time"]) ?? campaign.createdAt;
    const endedAt = campaign.endedAt ?? parseMetaDateTime(metaCamp?.["stop_time"]) ?? now;

    const finalBrainJson = latestBrain
      ? {
          patternSignature: latestBrain.patternSignature,
          action: latestBrain.action,
          finalScore: latestBrain.finalScore,
          narrationJson: latestBrain.narrationJson,
          tickDate: latestBrain.tickDate.toISOString().slice(0, 10),
          payload: latestBrain.payload,
        }
      : null;

    await prisma.campaignHistorySnapshot.create({
      data: {
        workspaceId: acct.workspaceId,
        campaignId: campaign.id,
        externalCampaignId: campaign.externalCampaignId,
        adAccountId: acct.id,
        name: campaign.name,
        objective: campaign.objective,
        finalStatus: campaign.status,
        startedAt,
        endedAt,
        lifetimeSpendMinor: BigInt(totals.spendMinor),
        impressions: BigInt(totals.impressions),
        reach: BigInt(totals.reach),
        clicks: BigInt(totals.clicks),
        messages: BigInt(totals.messages),
        purchases: BigInt(totals.purchases),
        leads: BigInt(totals.leads),
        revenueMinor: BigInt(totals.revenueMinor),
        finalRoas: totals.roas,
        currency: acct.currency,
        currencyMinorFactor: factor,
        breakdownJson: breakdownAgg.length > 0
          ? (breakdownAgg as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        creativeJson: topCreatives.length > 0
          ? (topCreatives as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        finalBrainJson: finalBrainJson
          ? (finalBrainJson as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    console.log(`${tag} frozen — spend=${totals.spendMinor} roas=${totals.roas ?? "null"}`);
    return { ok: true, skipped: false, campaignId };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: true, skipped: true, campaignId };
    }
    const error = e instanceof Error ? e.message : String(e);
    console.error(`${tag} FAILED — ${error}`);
    return { ok: false, skipped: false, campaignId, error };
  }
}

/** Exported for tests — ROAS and spend must not be re-scaled after mapMetaInsight. */
export function snapshotMonetaryFieldsFromInsight(
  insight: ReturnType<typeof mapMetaInsight>,
  factor: number,
): {
  lifetimeSpendMinor: bigint;
  revenueMinor: bigint;
  finalRoas: number | null;
  currencyMinorFactor: number;
} {
  return {
    lifetimeSpendMinor: BigInt(insight.spendMinor),
    revenueMinor: BigInt(insight.revenueMinor),
    finalRoas: insight.roas,
    currencyMinorFactor: factor,
  };
}

export { costPerMessageFromTotals };
