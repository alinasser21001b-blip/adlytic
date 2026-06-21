// ════════════════════════════════════════════════════════════════════════
//  src/services/v2ContextAssembler.ts
//
//  Provenance bridge between the persistence layer (Prisma + Meta API) and
//  the V6 Brain V2 cognitive extension (Layers 8–11).
//
//  Owns ONE entry point: `assembleV2Inputs(prisma, metaClient, args)` →
//  returns a fully populated `BrainV2Inputs` or `null` when V2 cannot be
//  assembled at all (core signals missing). Engines stay pure; this file
//  carries every I/O concern so the engine layer never touches a DB or HTTP.
//
//  Partial Capabilities strategy:
//    • Core signals (marketBaseline / goldStandard / hourlyVelocity):
//      If ANY core builder fails → return null, run V1-only path.
//    • Soft signals (audienceBreakdowns / visionContext):
//      On failure → substitute neutral fallback so Layers 8–10 still run.
//      Layer 11 will compute against neutrals (no penalty) rather than
//      ghosting the entire V2 extension.
//
//  Vision (Layer 11) is currently deferred — see `buildVisionContext`.
//  Once Meta creative sync populates `Ad.creativeJson`, that builder is the
//  ONLY function in this file that needs to change.
//
//  Time math:
//    • Layer 8/9 windows use UTC calendar days (DailyStat granularity).
//    • Layer 10 (`hoursActiveToday`) uses the AdAccount's reporting timezone,
//      matching what Meta returns from `date_preset=today`.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { MetaClient, MetaInsightRow } from './metaClient';
import type { BrainV2Inputs } from '../engine/AdlyticBrain';
import type {
  MarketBaseline,
  GoldStandardDNA,
  BreakdownData,
  VisionAIPayload,
} from '../engine/v2/contracts';

// ── Tuning dials — data-quality thresholds for V2 context provenance ────
const CONTEXT_CONFIG = {
  MARKET_BASELINE_WINDOW_DAYS: 2,        // "recent" CPM/CPC window for Layer 8
  GOLD_HISTORY_WINDOW_DAYS: 90,          // historical horizon for Layer 9
  GOLD_MIN_SPEND_MAJOR: 50,              // economic-significance gate per campaign
  AUDIENCE_BREAKDOWN_WINDOW_DAYS: 7,     // Layer 11 demographic sample window
};

const UNKNOWN_TOKEN = 'UNKNOWN';

const NEUTRAL_BREAKDOWN: BreakdownData = {
  topAgeGroup: UNKNOWN_TOKEN,
  topGender: UNKNOWN_TOKEN,
  bestPlacement: 'unknown',     // lowercase: won't match any RESONANCE_CONFIG.PLACEMENTS bucket
  peakTimeWindow: UNKNOWN_TOKEN,
};

const NEUTRAL_VISION: VisionAIPayload = {
  productType: UNKNOWN_TOKEN,
  visualHook: UNKNOWN_TOKEN,    // doesn't match HOOKS.STATIC_IMAGE / SHORT_VIDEO / LONG_VIDEO → no penalty
};

// ── Public surface ──────────────────────────────────────────────────────
export interface AssembleV2InputsArgs {
  /** Internal Campaign.id — used for DailyStat lookups. */
  campaignId: string;
  /** Meta's campaign id — used for live insight calls. */
  externalCampaignId: string;
  /** Internal AdAccount.id — used for sibling-campaign aggregations. */
  adAccountId: string;
  /** Meta's account id (e.g. "act_123456789") — used for account-level Meta calls. */
  externalAccountId: string;
  /** IANA tz, e.g. "Asia/Baghdad" — controls Layer 10's hours-elapsed window. */
  timezone: string;
  /** AdAccount.currencyMinorFactor — converts DailyStat BigInt minor units to engine-major. */
  currencyMinorFactor: number;
  /** Campaign.dailyBudget — minor units, may be null. */
  dailyBudgetMinor: bigint | null;
  /** Test seam — defaults to `new Date()` at call time. */
  nowUtc?: Date;
}

/**
 * Build BrainV2Inputs for a single campaign, or return null if V2 cannot
 * meaningfully run (no market context, no historical winners, no live
 * intra-day stats). The caller falls back to V1-only when null is returned.
 *
 * Builders execute in parallel — each is independently failure-isolated.
 */
export async function assembleV2Inputs(
  prisma: PrismaClient,
  metaClient: MetaClient,
  args: AssembleV2InputsArgs,
): Promise<BrainV2Inputs | null> {
  const now = args.nowUtc ?? new Date();

  const [
    marketBaseline,
    goldStandard,
    hourlyVelocity,
    audienceBreakdowns,
    visionContext,
  ] = await Promise.all([
    safe('marketBaseline',     () => buildMarketBaseline(prisma, args, now)),
    safe('goldStandard',       () => buildGoldStandard(prisma, args, now)),
    safe('hourlyVelocity',     () => buildHourlyVelocity(metaClient, args, now)),
    safe('audienceBreakdowns', () => buildAudienceBreakdowns(metaClient, args, now)),
    safe('visionContext',      () => buildVisionContext()),
  ]);

  // Core signals are non-negotiable. If any is missing, V2 is meaningless.
  if (!marketBaseline || !goldStandard || !hourlyVelocity) {
    return null;
  }

  return {
    marketBaseline,
    goldStandard,
    hourlyVelocity,
    audienceBreakdowns: audienceBreakdowns ?? NEUTRAL_BREAKDOWN,
    visionContext:      visionContext     ?? NEUTRAL_VISION,
  };
}

// ── Builder: Layer 8 input (Market Baseline) ────────────────────────────
async function buildMarketBaseline(
  prisma: PrismaClient,
  args: AssembleV2InputsArgs,
  now: Date,
): Promise<MarketBaseline | null> {
  const since = utcMidnightOffset(now, -CONTEXT_CONFIG.MARKET_BASELINE_WINDOW_DAYS);

  // All sibling-campaign IDs under this AdAccount — defines "the market" for this account.
  const siblings = await prisma.campaign.findMany({
    where: { adAccountId: args.adAccountId },
    select: { id: true },
  });
  if (siblings.length === 0) return null;
  const siblingIds = siblings.map(c => c.id);

  const rows = await prisma.dailyStat.findMany({
    where: {
      entityType: 'CAMPAIGN',
      entityId: { in: siblingIds },
      date: { gte: since },
    },
    select: { impressions: true, cpm: true, cpc: true },
  });

  // Impression-weighted averages — bigger spenders count more.
  let weightedCpmMinor = 0;
  let weightedCpcMinor = 0;
  let totalImpressions = 0;
  for (const r of rows) {
    const imp = Number(r.impressions);
    if (imp <= 0) continue;
    if (r.cpm != null) weightedCpmMinor += r.cpm * imp;
    if (r.cpc != null) weightedCpcMinor += r.cpc * imp;
    totalImpressions += imp;
  }
  if (totalImpressions === 0) return null;

  const cpmMinor = weightedCpmMinor / totalImpressions;
  const cpcMinor = weightedCpcMinor / totalImpressions;

  return {
    recentAverageCPM: minorToMajor(cpmMinor, args.currencyMinorFactor),
    recentAverageCPC: minorToMajor(cpcMinor, args.currencyMinorFactor),
  };
}

// ── Builder: Layer 9 input (Gold Standard DNA) ──────────────────────────
async function buildGoldStandard(
  prisma: PrismaClient,
  args: AssembleV2InputsArgs,
  now: Date,
): Promise<GoldStandardDNA | null> {
  const since = utcMidnightOffset(now, -CONTEXT_CONFIG.GOLD_HISTORY_WINDOW_DAYS);

  const siblings = await prisma.campaign.findMany({
    where: { adAccountId: args.adAccountId },
    select: { id: true },
  });
  if (siblings.length === 0) return null;
  const siblingIds = siblings.map(c => c.id);

  const rows = await prisma.dailyStat.findMany({
    where: {
      entityType: 'CAMPAIGN',
      entityId: { in: siblingIds },
      date: { gte: since },
    },
    select: {
      entityId: true,
      spend: true, impressions: true, clicks: true, messages: true,
      cpm: true, ctr: true,
    },
  });

  // Aggregate by campaign — we want per-campaign performance, then pick the winners.
  interface PerCampaign {
    spendMinor: number; impressions: number; clicks: number; messages: number;
    weightedCpmMinor: number; weightedCtr: number;
  }
  const byCampaign = new Map<string, PerCampaign>();
  for (const r of rows) {
    const c = byCampaign.get(r.entityId) ?? {
      spendMinor: 0, impressions: 0, clicks: 0, messages: 0,
      weightedCpmMinor: 0, weightedCtr: 0,
    };
    const imp = Number(r.impressions);
    c.spendMinor   += Number(r.spend);
    c.impressions  += imp;
    c.clicks       += Number(r.clicks);
    c.messages     += Number(r.messages);
    if (r.cpm != null && imp > 0) c.weightedCpmMinor += r.cpm * imp;
    if (r.ctr != null && imp > 0) c.weightedCtr      += r.ctr * imp;
    byCampaign.set(r.entityId, c);
  }

  // Keep only campaigns above the economic-significance gate.
  const minSpendMinor = CONTEXT_CONFIG.GOLD_MIN_SPEND_MAJOR * args.currencyMinorFactor;
  let bestCpmMinor   = Number.POSITIVE_INFINITY;  // lower is better
  let bestCtr        = 0;                         // higher is better
  let bestCpmMinorPerMessage = Number.POSITIVE_INFINITY; // lower is better
  let qualifyingCount = 0;

  for (const c of byCampaign.values()) {
    if (c.spendMinor < minSpendMinor) continue;
    qualifyingCount++;

    if (c.impressions > 0) {
      const avgCpmMinor = c.weightedCpmMinor / c.impressions;
      const avgCtr      = c.weightedCtr      / c.impressions;
      if (avgCpmMinor > 0 && avgCpmMinor < bestCpmMinor) bestCpmMinor = avgCpmMinor;
      if (avgCtr > bestCtr) bestCtr = avgCtr;
    }
    if (c.messages > 0) {
      const cpmPerMsg = c.spendMinor / c.messages;
      if (cpmPerMsg < bestCpmMinorPerMessage) bestCpmMinorPerMessage = cpmPerMsg;
    }
  }
  if (qualifyingCount === 0) return null;

  // If any "best" remained at its sentinel, fall back to 0 — the engine treats
  // 0 as "no historical signal" (Velocity skips the CPA branch, Gold weights flat).
  return {
    bestHistoricalCpm:            Number.isFinite(bestCpmMinor)
      ? minorToMajor(bestCpmMinor, args.currencyMinorFactor)
      : 0,
    bestHistoricalCtr:            bestCtr,
    bestHistoricalCostPerMessage: Number.isFinite(bestCpmMinorPerMessage)
      ? minorToMajor(bestCpmMinorPerMessage, args.currencyMinorFactor)
      : 0,
  };
}

// ── Builder: Layer 10 input (Intra-day Velocity) ────────────────────────
async function buildHourlyVelocity(
  metaClient: MetaClient,
  args: AssembleV2InputsArgs,
  now: Date,
): Promise<BrainV2Inputs['hourlyVelocity'] | null> {
  if (args.dailyBudgetMinor == null) return null;
  const dailyBudgetMajor = Number(args.dailyBudgetMinor) / args.currencyMinorFactor;
  if (!Number.isFinite(dailyBudgetMajor) || dailyBudgetMajor <= 0) return null;

  const rows = await metaClient.getTodayInsights({
    externalId: args.externalCampaignId,
    level: 'campaign',
  });

  let totalSpendToday = 0;
  let totalMessagesToday = 0;
  for (const r of rows) {
    totalSpendToday    += numField(r.spend);
    totalMessagesToday += sumMessageActions(r.actions);
  }

  return {
    hoursActiveToday:    hoursElapsedTodayInTimezone(now, args.timezone),
    totalSpendToday,
    totalMessagesToday,
    dailyBudget:         dailyBudgetMajor,
  };
}

// ── Builder: Layer 11 input (Audience Breakdowns) ───────────────────────
async function buildAudienceBreakdowns(
  metaClient: MetaClient,
  args: AssembleV2InputsArgs,
  now: Date,
): Promise<BreakdownData | null> {
  const since = utcMidnightOffset(now, -CONTEXT_CONFIG.AUDIENCE_BREAKDOWN_WINDOW_DAYS);
  const until = utcMidnightOffset(now, 0);

  // Two parallel Meta queries — one for age+gender, one for placement.
  const [ageGenderRows, placementRows] = await Promise.all([
    metaClient.getInsights({
      externalId: args.externalCampaignId,
      level: 'campaign',
      since, until,
      breakdowns: ['age', 'gender'],
    }),
    metaClient.getInsights({
      externalId: args.externalCampaignId,
      level: 'campaign',
      since, until,
      breakdowns: ['publisher_platform', 'platform_position'],
    }),
  ]);

  const topAge    = pickBestBucket(ageGenderRows, 'age');
  const topGender = pickBestBucket(ageGenderRows, 'gender');

  // Placement: "platform_position" is the granular slot (e.g. "instagram_reels");
  // fall back to publisher_platform when slot is absent.
  const bestPlacement =
    pickBestBucket(placementRows, 'platform_position') ??
    pickBestBucket(placementRows, 'publisher_platform');

  if (!topAge && !topGender && !bestPlacement) return null;

  return {
    topAgeGroup:    topAge       ?? UNKNOWN_TOKEN,
    topGender:      topGender    ?? UNKNOWN_TOKEN,
    bestPlacement:  bestPlacement ?? 'unknown',
    // Intraday breakdown is a separate Meta call (`hourly_stats_aggregated_by_advertiser_time_zone`)
    // — deferred to a follow-up commit. UNKNOWN here yields a clean message in the directive.
    peakTimeWindow: UNKNOWN_TOKEN,
  };
}

// ── Builder: Layer 11 input (Vision Context) ─DEFERRED ──────────────────
async function buildVisionContext(): Promise<VisionAIPayload | null> {
  // Path A (signed off): Meta creative sync does not populate Ad.creativeJson
  // yet — there is no data source for visualHook detection in the DB. Returning
  // null causes the assembler to substitute NEUTRAL_VISION, which leaves Layer 11
  // running on demographics only (no placement penalty applied for UNKNOWN hooks).
  // When the ETL is extended (commit N+1), replace this body with real heuristic.
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Wrap a builder so individual failures never cascade. */
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[v2ContextAssembler] ${label} builder failed → null: ${msg}`);
    return null;
  }
}

/** UTC-midnight aligned date `n` days offset from `now`. Used for DailyStat window queries. */
function utcMidnightOffset(now: Date, deltaDays: number): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + deltaDays,
  ));
}

/** DailyStat stores money in minor units; engine expects major. */
function minorToMajor(minor: number, factor: number): number {
  if (factor <= 0) return minor;
  return +(minor / factor).toFixed(4);
}

/**
 * Return decimal hours elapsed in `timezone` since local midnight.
 * Uses Intl.DateTimeFormat with en-GB (24-hour, never returns "24:00").
 */
function hoursElapsedTodayInTimezone(now: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
    const h = get('hour');
    const m = get('minute');
    const s = get('second');
    return (h === 24 ? 0 : h) + m / 60 + s / 3600;
  } catch {
    // Invalid timezone string → fall back to UTC.
    return now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  }
}

/** Numeric coercion mirroring insightMapper's defensive style — Meta returns strings. */
function numField(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Meta packs results in actions[]. Mirrors insightMapper.MESSAGE_ACTION_TYPES. */
const MESSAGE_ACTION_TYPES = new Set([
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'messaging_conversation_started',
]);

interface MetaActionRow { action_type?: string; value?: string | number }

function sumMessageActions(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions as MetaActionRow[]) {
    if (a.action_type && MESSAGE_ACTION_TYPES.has(a.action_type)) {
      total += numField(a.value);
    }
  }
  return total;
}

/**
 * Among Meta breakdown rows, return the value of `key` for the bucket that
 * produced the most conversions (`messages`); fall back to impressions when
 * conversions are flat across buckets. Returns null when no bucket scores > 0.
 */
function pickBestBucket(rows: MetaInsightRow[], key: string): string | null {
  if (rows.length === 0) return null;

  // Sum per-bucket score; messages wins, impressions is fallback.
  const messagesByBucket   = new Map<string, number>();
  const impressionsByBucket = new Map<string, number>();

  for (const r of rows) {
    const bucket = r[key];
    if (typeof bucket !== 'string' || bucket.length === 0) continue;
    const msgs = sumMessageActions(r.actions);
    const imps = numField(r.impressions);
    messagesByBucket.set(bucket,    (messagesByBucket.get(bucket)    ?? 0) + msgs);
    impressionsByBucket.set(bucket, (impressionsByBucket.get(bucket) ?? 0) + imps);
  }

  const ranked = (m: Map<string, number>): string | null => {
    let bestKey: string | null = null;
    let bestVal = 0;
    for (const [k, v] of m.entries()) {
      if (v > bestVal) { bestVal = v; bestKey = k; }
    }
    return bestKey;
  };

  return ranked(messagesByBucket) ?? ranked(impressionsByBucket);
}
