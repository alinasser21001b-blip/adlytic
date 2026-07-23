// ════════════════════════════════════════════════════════════════════════
//  src/services/mockMeta.ts
//
//  MOCK META OAUTH + DATA SEEDER — staging escape hatch.
//
//  When `META_MOCK_AUTH=true`, the OAuth flow bypasses Facebook entirely
//  and the post-connect step seeds a realistic-looking dataset (campaigns,
//  ad-sets, ads, creatives, daily-stats, breakdown-stats) so the full
//  Adlytic dashboard can be exercised end-to-end without depending on
//  Meta's App-Review / Developer-Role gating.
//
//  Why this exists:
//  ────────────────
//  Meta's 2026 Login-for-Business rules block both `ads_read` (requires
//  App Review + Business Verification) and `public_profile` (not supported
//  by the Business Login product) for non-admin users. Adding a Developer
//  role requires the target Facebook account itself to be onboarded as a
//  developer — which is an out-of-band manual step that cannot be scripted.
//  Until App Review completes, there is NO real Meta credential we can
//  use to exercise the dashboard. This module unblocks that.
//
//  Safety contract:
//  ────────────────
//  • Off by default. Mock mode requires explicit `META_MOCK_AUTH=true`.
//  • Loud `console.warn` on every mock-flow request — never silently mocks.
//  • A clearly fake token (`MOCK_ACCESS_TOKEN`) is stored encrypted on the
//    AdAccount; the sync worker would refuse to authenticate with it, so
//    even if mock mode is later disabled, no real Meta call ever uses it.
//  • Mock account IDs use a `mock_act_*` prefix so they cannot collide with
//    real Meta IDs (which always start with `act_`).
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType, EntityStatus } from "@prisma/client";
import type { MetaAdAccountInfo } from "./metaOAuth";

let warnedMockBlockedInProduction = false;

/**
 * Returns true iff `META_MOCK_AUTH` is set to a truthy value AND the process
 * is not running in production. Mock auth fabricates fake ad accounts and a
 * sentinel token — a hard compliance and correctness hazard on a live
 * deployment (and instant App Review rejection material), so production
 * ignores the flag entirely and logs why, once.
 */
export function isMockAuthEnabled(): boolean {
  const v = (process.env["META_MOCK_AUTH"] ?? "").trim().toLowerCase();
  const enabled = v === "true" || v === "1" || v === "yes";
  if (!enabled) return false;

  const nodeEnv = (process.env["NODE_ENV"] ?? "development").trim().toLowerCase();
  const isProduction = nodeEnv !== "development" && nodeEnv !== "test";
  if (isProduction) {
    if (!warnedMockBlockedInProduction) {
      warnedMockBlockedInProduction = true;
      console.error(
        "[adlytic:mock-meta] META_MOCK_AUTH is set but NODE_ENV is production — " +
        "mock auth is HARD-DISABLED in production. Remove the env var.",
      );
    }
    return false;
  }
  return true;
}

/** Sentinel token stored on the AdAccount when connected via mock flow.
 *  Begins with `mock_` so any accidental Meta call fails fast and obvious. */
export const MOCK_ACCESS_TOKEN = "mock_access_token_not_real_do_not_call_meta";

/** Fake but well-shaped MetaAdAccountInfo list returned to the connect UI. */
export const MOCK_ACCOUNTS: MetaAdAccountInfo[] = [
  {
    id:             "mock_act_100000001",
    name:           "حساب تجريبي - متجر إلكتروني",
    currency:       "USD",
    timezone_name:  "Asia/Baghdad",
    account_status: 1,
  },
];

// ── Seed corpus ─────────────────────────────────────────────────────────
// Three campaigns of distinct character so the dashboard exercises:
//   • a high-performer worth showcasing,
//   • a middling baseline,
//   • a struggling one the brain should flag.
// All Arabic names render correctly in the RTL UI.
const MOCK_CAMPAIGNS: ReadonlyArray<{
  externalId: string;
  name: string;
  objective: string;
  status: EntityStatus;
  /** Daily spend in account MAJOR currency units (will be scaled per-day). */
  dailyBudgetMajor: number;
  /** Relative performance scalar — higher = better cost-per-message. */
  performance: number;
}> = [
  { externalId: "mock_cmp_summer",   name: "حملة العروض الصيفية",      objective: "MESSAGES", status: EntityStatus.ACTIVE, dailyBudgetMajor: 50, performance: 1.4 },
  { externalId: "mock_cmp_brand",    name: "حملة الوعي بالعلامة",      objective: "REACH",    status: EntityStatus.ACTIVE, dailyBudgetMajor: 30, performance: 1.0 },
  { externalId: "mock_cmp_clearance", name: "حملة تصفية المخزون",       objective: "MESSAGES", status: EntityStatus.PAUSED, dailyBudgetMajor: 20, performance: 0.6 },
];

const MOCK_ADSETS_PER_CAMPAIGN: ReadonlyArray<{ suffix: string; name: string }> = [
  { suffix: "broad",    name: "جمهور واسع" },
  { suffix: "lookalike", name: "جمهور مشابه ١٪" },
];

const MOCK_ADS_PER_ADSET: ReadonlyArray<{ suffix: string; name: string; copy: string }> = [
  { suffix: "img_a", name: "إعلان صورة - عرض ٢٥٪", copy: "خصم ٢٥٪ لفترة محدودة! تواصل معنا الآن لمعرفة التفاصيل." },
  { suffix: "img_b", name: "إعلان صورة - شحن مجاني", copy: "شحن مجاني لجميع المدن. اطلب الآن قبل نفاد الكمية." },
];

const MOCK_CREATIVES: ReadonlyArray<{
  externalId: string;
  name: string;
  primaryText: string;
  headline: string;
  callToActionType: string;
}> = [
  { externalId: "mock_crv_summer_25", name: "Summer 25% Off",  primaryText: "خصم ٢٥٪ على كل الأصناف خلال الصيف.",  headline: "وفر ٢٥٪ الآن",   callToActionType: "MESSAGE_PAGE" },
  { externalId: "mock_crv_free_ship", name: "Free Shipping",   primaryText: "شحن مجاني داخل المدينة لجميع الطلبات.", headline: "اطلب الآن",      callToActionType: "MESSAGE_PAGE" },
  { externalId: "mock_crv_brand_v1",  name: "Brand Awareness", primaryText: "علامتنا التجارية تخدمك منذ ٢٠١٨.",     headline: "تعرف علينا",    callToActionType: "LEARN_MORE" },
];

/** Tiny deterministic PRNG so seed values are stable across re-seeds —
 *  matters when the dashboard would otherwise show different numbers on
 *  every page reload during demos. Mulberry32. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_DAYS = 30;

/**
 * Seed a realistic 30-day dataset onto the given AdAccount. Idempotent:
 * uses upserts everywhere keyed on the same unique constraints the real
 * sync worker uses, so re-running over the same account converges.
 *
 * This intentionally does NOT call the brain orchestrator or engines —
 * those have their own test harnesses; the goal here is dashboard E2E.
 */
export async function seedMockAdAccountData(
  prisma: PrismaClient,
  adAccountId: string,
): Promise<void> {
  const acct = await prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
  const factor = acct.currencyMinorFactor;
  const tag = `[mock-seed:${acct.id.slice(0, 8)}]`;
  console.warn(`${tag} seeding mock data — this is NOT real Meta data`);

  const now = new Date();
  const days: Date[] = [];
  for (let d = SEED_DAYS - 1; d >= 0; d--) {
    const dt = new Date(now);
    dt.setUTCHours(0, 0, 0, 0);
    dt.setUTCDate(dt.getUTCDate() - d);
    days.push(dt);
  }

  // ── Upsert creatives first (referenced by ads via creativeId) ─────────
  const creativeIds = new Map<string, string>();
  for (const c of MOCK_CREATIVES) {
    const row = await prisma.adCreative.upsert({
      where: { adAccountId_externalCreativeId: { adAccountId: acct.id, externalCreativeId: c.externalId } },
      create: {
        adAccountId:        acct.id,
        externalCreativeId: c.externalId,
        name:               c.name,
        primaryText:        c.primaryText,
        headline:           c.headline,
        callToActionType:   c.callToActionType,
        raw:                { mock: true, externalId: c.externalId },
      },
      update: {
        name:             c.name,
        primaryText:      c.primaryText,
        headline:         c.headline,
        callToActionType: c.callToActionType,
      },
      select: { id: true },
    });
    creativeIds.set(c.externalId, row.id);
  }

  // ── Per-campaign: campaign + ad-sets + ads, then daily-stats, then
  //    breakdown-stats. We accumulate account-level daily totals so the
  //    ACCOUNT-level DailyStat reflects the sum of its campaigns exactly.
  const accountDaily = new Map<string, { spend: bigint; imp: bigint; clk: bigint; msg: bigint; rev: bigint }>();
  for (const day of days) {
    accountDaily.set(day.toISOString().slice(0, 10), { spend: 0n, imp: 0n, clk: 0n, msg: 0n, rev: 0n });
  }

  for (let cIdx = 0; cIdx < MOCK_CAMPAIGNS.length; cIdx++) {
    const camp = MOCK_CAMPAIGNS[cIdx]!;
    const dailyBudgetMinor = BigInt(Math.round(camp.dailyBudgetMajor * factor));
    const campaignRow = await prisma.campaign.upsert({
      where: { adAccountId_externalCampaignId: { adAccountId: acct.id, externalCampaignId: camp.externalId } },
      create: {
        adAccountId:        acct.id,
        externalCampaignId: camp.externalId,
        name:               camp.name,
        objective:          camp.objective,
        status:             camp.status,
        dailyBudget:        dailyBudgetMinor,
      },
      update: {
        name:        camp.name,
        objective:   camp.objective,
        status:      camp.status,
        dailyBudget: dailyBudgetMinor,
      },
      select: { id: true },
    });

    // ── Ad-sets + ads under this campaign ──────────────────────────────
    let adIdxInCampaign = 0;
    for (const aset of MOCK_ADSETS_PER_CAMPAIGN) {
      const adSetRow = await prisma.adSet.upsert({
        where: {
          campaignId_externalAdSetId: {
            campaignId: campaignRow.id,
            externalAdSetId: `${camp.externalId}_${aset.suffix}`,
          },
        },
        create: {
          campaignId:       campaignRow.id,
          externalAdSetId:  `${camp.externalId}_${aset.suffix}`,
          name:             aset.name,
          status:           camp.status,
          dailyBudget:      dailyBudgetMinor / 2n,
          optimizationGoal: camp.objective === "MESSAGES" ? "CONVERSATIONS" : "REACH",
        },
        update: {
          name:             aset.name,
          status:           camp.status,
          dailyBudget:      dailyBudgetMinor / 2n,
          optimizationGoal: camp.objective === "MESSAGES" ? "CONVERSATIONS" : "REACH",
        },
        select: { id: true },
      });

      for (const ad of MOCK_ADS_PER_ADSET) {
        // Rotate creatives across ads so the dedupe path is exercised:
        // ad 0 → creative 0, ad 1 → creative 1, ad 2 → creative 0, etc.
        const creative = MOCK_CREATIVES[adIdxInCampaign % MOCK_CREATIVES.length]!;
        const creativeInternalId = creativeIds.get(creative.externalId) ?? null;
        await prisma.ad.upsert({
          where: {
            adSetId_externalAdId: {
              adSetId: adSetRow.id,
              externalAdId: `${camp.externalId}_${aset.suffix}_${ad.suffix}`,
            },
          },
          create: {
            adSetId:      adSetRow.id,
            externalAdId: `${camp.externalId}_${aset.suffix}_${ad.suffix}`,
            name:         ad.name,
            status:       camp.status,
            creativeId:   creativeInternalId,
            creativeJson: { mock: true, copy: ad.copy },
          },
          update: {
            name:         ad.name,
            status:       camp.status,
            creativeId:   creativeInternalId,
            creativeJson: { mock: true, copy: ad.copy },
          },
        });
        adIdxInCampaign++;
      }
    }

    // ── Daily-stats for this campaign + roll-up into account-level ─────
    const r = rng(cIdx * 100003 + 17);
    for (const day of days) {
      // Realistic shape: spend ≈ daily budget × jitter, impressions
      // proportional to spend, clicks ≈ 2% CTR, messages ≈ 10% of clicks
      // scaled by the campaign's performance multiplier.
      const jitter      = 0.7 + r() * 0.6;                                 // 0.7–1.3×
      const spendMajor  = camp.dailyBudgetMajor * jitter;
      const spendMinor  = BigInt(Math.round(spendMajor * factor));
      const impressions = BigInt(Math.round(spendMajor * 200 * (0.8 + r() * 0.4)));
      const clicks      = BigInt(Math.round(Number(impressions) * (0.018 + r() * 0.012)));
      const baseMsgRate = 0.10 * camp.performance;
      const messages    = BigInt(Math.round(Number(clicks) * (baseMsgRate * (0.8 + r() * 0.4))));
      const purchases   = camp.objective === "MESSAGES" ? 0n : BigInt(Math.round(Number(messages) * 0.15));
      const revenueMajor = Number(purchases) * (25 + r() * 15);
      const revenueMinor = BigInt(Math.round(revenueMajor * factor));

      const ctr = Number(impressions) > 0 ? (Number(clicks) / Number(impressions)) * 100 : null;
      const cpc = Number(clicks) > 0 ? (spendMajor / Number(clicks)) : null;
      const cpm = Number(impressions) > 0 ? (spendMajor * 1000 / Number(impressions)) : null;
      const costPerMessage = Number(messages) > 0 ? (spendMajor / Number(messages)) : null;
      const frequency = 1.1 + r() * 0.7;

      await prisma.dailyStat.upsert({
        where: {
          entityType_entityId_date: {
            entityType: EntityType.CAMPAIGN,
            entityId:   campaignRow.id,
            date:       day,
          },
        },
        create: {
          entityType: EntityType.CAMPAIGN,
          entityId:   campaignRow.id,
          date:       day,
          spend: spendMinor, impressions, reach: impressions / 2n, clicks, uniqueClicks: clicks * 9n / 10n,
          messages, purchases, leads: 0n, conversions: messages,
          revenueMinor,
          ctr, uniqueCtr: ctr, cpc, cpm, costPerMessage, frequency, roas: null,
        },
        update: {
          spend: spendMinor, impressions, reach: impressions / 2n, clicks, uniqueClicks: clicks * 9n / 10n,
          messages, purchases, leads: 0n, conversions: messages,
          revenueMinor,
          ctr, uniqueCtr: ctr, cpc, cpm, costPerMessage, frequency, roas: null,
        },
      });

      // Accumulate into the account-level rollup.
      const key = day.toISOString().slice(0, 10);
      const a = accountDaily.get(key)!;
      a.spend += spendMinor;
      a.imp   += impressions;
      a.clk   += clicks;
      a.msg   += messages;
      a.rev   += revenueMinor;
    }

    // ── BreakdownStats for this campaign × 4 dimensions ───────────────
    // We slice the campaign totals across realistic segment splits and
    // emit one row per (date, dimension, value). The Audience tab UI
    // aggregates these across the window — same math as production.
    const dimensions: Array<{ key: string; segments: Array<{ value: string; share: number; cpmMul: number }> }> = [
      { key: "age", segments: [
        { value: "18-24", share: 0.18, cpmMul: 1.10 },
        { value: "25-34", share: 0.42, cpmMul: 0.85 },
        { value: "35-44", share: 0.25, cpmMul: 0.95 },
        { value: "45-54", share: 0.10, cpmMul: 1.20 },
        { value: "55-64", share: 0.05, cpmMul: 1.50 },
      ]},
      { key: "gender", segments: [
        { value: "male",   share: 0.55, cpmMul: 0.90 },
        { value: "female", share: 0.43, cpmMul: 1.05 },
        { value: "unknown", share: 0.02, cpmMul: 1.30 },
      ]},
      { key: "publisher_platform", segments: [
        { value: "facebook",  share: 0.55, cpmMul: 0.95 },
        { value: "instagram", share: 0.40, cpmMul: 1.00 },
        { value: "messenger", share: 0.05, cpmMul: 1.15 },
      ]},
      { key: "platform_position", segments: [
        { value: "feed",              share: 0.45, cpmMul: 0.90 },
        { value: "instagram_stories", share: 0.25, cpmMul: 1.10 },
        { value: "reels",             share: 0.20, cpmMul: 0.95 },
        { value: "facebook_stories",  share: 0.10, cpmMul: 1.15 },
      ]},
    ];

    for (const dim of dimensions) {
      for (const day of days) {
        // Pull the same day's campaign totals so segments sum to campaign.
        const dayStat = await prisma.dailyStat.findUniqueOrThrow({
          where: { entityType_entityId_date: { entityType: EntityType.CAMPAIGN, entityId: campaignRow.id, date: day } },
        });
        for (const seg of dim.segments) {
          const segSpend = BigInt(Math.round(Number(dayStat.spend) * seg.share * seg.cpmMul));
          const segImp   = BigInt(Math.round(Number(dayStat.impressions) * seg.share));
          const segClk   = BigInt(Math.round(Number(dayStat.clicks) * seg.share / seg.cpmMul));
          const segMsg   = BigInt(Math.round(Number(dayStat.messages) * seg.share / seg.cpmMul));
          await prisma.breakdownStat.upsert({
            where: {
              entityType_entityId_date_breakdownKey_breakdownValue: {
                entityType:     EntityType.CAMPAIGN,
                entityId:       campaignRow.id,
                date:           day,
                breakdownKey:   dim.key,
                breakdownValue: seg.value,
              },
            },
            create: {
              entityType: EntityType.CAMPAIGN, entityId: campaignRow.id, date: day,
              breakdownKey: dim.key, breakdownValue: seg.value,
              spend: segSpend, impressions: segImp, clicks: segClk, messages: segMsg,
            },
            update: { spend: segSpend, impressions: segImp, clicks: segClk, messages: segMsg },
          });
        }
      }
    }
  }

  // ── Account-level rollup DailyStats ───────────────────────────────────
  for (const day of days) {
    const key = day.toISOString().slice(0, 10);
    const a = accountDaily.get(key)!;
    const spendMajor = Number(a.spend) / factor;
    const ctr = Number(a.imp) > 0 ? (Number(a.clk) / Number(a.imp)) * 100 : null;
    const cpc = Number(a.clk) > 0 ? spendMajor / Number(a.clk) : null;
    const cpm = Number(a.imp) > 0 ? (spendMajor * 1000) / Number(a.imp) : null;
    const cpmsg = Number(a.msg) > 0 ? spendMajor / Number(a.msg) : null;
    await prisma.dailyStat.upsert({
      where: {
        entityType_entityId_date: { entityType: EntityType.ACCOUNT, entityId: acct.id, date: day },
      },
      create: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date: day,
        spend: a.spend, impressions: a.imp, reach: a.imp / 2n, clicks: a.clk,
        uniqueClicks: a.clk * 9n / 10n, messages: a.msg, purchases: 0n, leads: 0n,
        conversions: a.msg, revenueMinor: a.rev,
        ctr, uniqueCtr: ctr, cpc, cpm, costPerMessage: cpmsg, frequency: 1.4, roas: null,
      },
      update: {
        spend: a.spend, impressions: a.imp, reach: a.imp / 2n, clicks: a.clk,
        uniqueClicks: a.clk * 9n / 10n, messages: a.msg, purchases: 0n, leads: 0n,
        conversions: a.msg, revenueMinor: a.rev,
        ctr, uniqueCtr: ctr, cpc, cpm, costPerMessage: cpmsg, frequency: 1.4, roas: null,
      },
    });
  }

  // Mark lifetime totals so the dashboard's lifetime-spend KPI populates.
  const lifetimeTotal = Array.from(accountDaily.values()).reduce((sum, a) => sum + a.spend, 0n);
  await prisma.adAccount.update({
    where: { id: acct.id },
    data: {
      lifetimeSpendMinor: lifetimeTotal,
      lifetimeSyncedAt:   new Date(),
      lastSyncedAt:       new Date(),
    },
  });

  console.warn(`${tag} mock seed complete — ${MOCK_CAMPAIGNS.length} campaigns, ${SEED_DAYS} days`);
}
