// ════════════════════════════════════════════════════════════════════════
//  src/mappers/insightMapper.ts
//
//  THE CORDON.
//
//  Meta-shaped data enters this file. Platform-neutral data leaves it.
//  Nothing downstream — engines, repositories, getDashboard, dashboard —
//  is permitted to import a Meta type or know a Meta field name. When Google
//  Ads becomes connector #2, it gets its own mapper writing into the SAME
//  NormalizedInsight shape, and everything above this line stays untouched.
//
//  Tested directly (no DB needed) in tests/insightMapper.test.ts.
// ════════════════════════════════════════════════════════════════════════

import type { MetaInsightRow } from "../services/metaClient";
import { normalizeRanking, type MetaRanking } from "../knowledge/adRelevanceIntelligence";
import {
  ACTION_FAMILIES,
  resolveActionCount,
  resolveActionValuePairedTo,
  resolveAction,
  type ActionFamilyDef,
} from "../analytics/actionSemantics";

/** The neutral metric vocabulary every connector translates INTO. */
export interface NormalizedInsight {
  date: string;                 // YYYY-MM-DD, the day this row covers

  // counts (BigInt-safe integers; mapper returns number, repo coerces)
  spendMinor: number;           // account currency minor units
  impressions: number;
  reach: number;
  clicks: number;
  /**
   * Clicks that opened the destination (site, WhatsApp, Messenger).
   *
   * Distinct from `clicks`, which also counts likes, comments, shares and
   * photo expands. Reporting all-clicks as "traffic" overstates visits and
   * understates cost-per-click against what Ads Manager shows by default.
   */
  linkClicks: number;
  /**
   * People who actually ARRIVED at the destination page.
   *
   * Distinct from linkClicks: a click that never loads the page (slow site,
   * bounce before render, broken URL) counts as a click but not a view. The
   * gap between the two IS the landing-page problem, which is why traffic
   * campaigns cannot be diagnosed without this.
   *
   * Meta's own `landing_page_view` action — never estimated from clicks.
   */
  landingPageViews: number;
  uniqueClicks: number;
  messages: number;
  purchases: number;
  leads: number;
  conversions: number;
  revenueMinor: number;         // purchase-attributed revenue, minor units

  // ratios (computed by Meta but mirrored neutrally)
  ctr: number | null;           // %
  uniqueCtr: number | null;     // % — unique clickers ÷ unique impressions
  cpc: number | null;           // minor units per click
  cpm: number | null;           // minor units per 1000 impressions
  costPerMessage: number | null; // minor units per messaging conversation
  frequency: number | null;
  roas: number | null;
}

export interface MapOptions {
  /** Multiplier to convert account-currency major units → minor units.
   *  IQD has no practical minor unit → factor 1. USD/EUR → factor 100. */
  currencyMinorFactor: number;
}

/**
 * Translate ONE Meta insight row into one NormalizedInsight.
 *
 * Defensive on every field: Meta omits keys when zero, returns numbers as
 * strings, and packs results inside an `actions` array keyed by action_type.
 * All of that complexity ends here.
 */
export function mapMetaInsight(row: MetaInsightRow, opts: MapOptions): NormalizedInsight {
  const date = String(row.date_start ?? row.date_stop ?? "").slice(0, 10);
  if (!date) throw new Error("Meta row missing date_start/date_stop");

  const spendMajor = num(row.spend);
  const spendMinor = Math.round(spendMajor * opts.currencyMinorFactor);

  const impressions = int(row.impressions);
  const reach = int(row.reach);
  const clicks = int(row.clicks);
  const linkClicks = int((row as Record<string, unknown>)["inline_link_clicks"]);
  const uniqueClicks = int(row.unique_clicks);

  // Meta packs results inside actions: [{ action_type: "...", value: "..." }]
  const actions = Array.isArray(row.actions) ? (row.actions as ActionRow[]) : [];
  // EVERY action-derived count goes through the canonical resolver.
  //
  // Meta's `actions` array is not a list of independent events — it describes
  // the SAME business event at several granularities (canonical / umbrella /
  // channel-specific) with no marker separating those from genuinely distinct
  // events. Summing it therefore double-counts, which is exactly what
  // happened here for messages (163 vs Ads Manager's 87), landing page views,
  // purchases, leads AND revenue.
  //
  // See analytics/actionSemantics.ts for each family's preference order and
  // the reasoning behind every rank.
  const messagesResolved = resolveActionCount(actions, ACTION_FAMILIES['messages']!);
  const lpvResolved = resolveActionCount(actions, ACTION_FAMILIES['landing_page_views']!);
  const purchasesResolved = resolveActionCount(actions, ACTION_FAMILIES['purchases']!);
  const leadsResolved = resolveActionCount(actions, ACTION_FAMILIES['leads']!);

  const messages = messagesResolved.value;
  const landingPageViews = lpvResolved.value;
  const purchases = purchasesResolved.value;
  const leads = leadsResolved.value;
  // LEGACY, FROZEN (see docs/ANALYTICS_RULES.md rule 4).
  //
  // This first-non-zero fallback is NOT a semantic decision: a sales campaign
  // that also received page messages reports `messages` here, because messages
  // is evaluated first. One column, a different meaning per row, no record of
  // which — which made summing it across an account add conversations to
  // purchases to leads as though they were one quantity.
  //
  // Nothing may branch on this value any more. Result meaning now comes from
  // analytics/resultSemantics.ts, which reads the per-type columns below
  // (messages / purchases / leads / clicks / impressions) under the campaign's
  // resolved purpose. Those have always been stored separately and correctly,
  // which is why no backfill was required.
  //
  // Still written so the column stays populated for rollback safety while the
  // migration completes. It will stop being written, then dropped.
  const conversions = messages || purchases || leads;

  // Revenue — PAIRED to whichever representation won the purchase COUNT.
  //
  // Resolving value independently could match `omni_purchase` while the count
  // matched `purchase`, giving a ROAS that divides omnichannel revenue by
  // website orders. A correct count with a mismatched value is still a broken
  // analytics system, so the two are resolved together by construction.
  const actionValues = Array.isArray(row.action_values) ? (row.action_values as ActionRow[]) : [];
  const revenueResolved = resolveActionValuePairedTo(
    actionValues, ACTION_FAMILIES['purchases']!, purchasesResolved.matchedType,
  );
  const revenueMajor = revenueResolved.value;
  const revenueMinor = Math.round(revenueMajor * opts.currencyMinorFactor);
  // Prefer Meta's own purchase_roas attribution when present; fall back to
  // computed value/spend ratio so we never lose a signal.
  const metaRoas = pickPurchaseRoas(row);
  const computedRoas = spendMinor > 0 && revenueMinor > 0 ? +(revenueMinor / spendMinor).toFixed(4) : null;
  const roas = metaRoas ?? computedRoas;

  // Cost-per-action breakdowns — Meta returns per action_type, we surface the
  // most-relevant for our Phase 1 KPI (messaging conversations).
  // Cost per message — same family, same preference order, so the cost and
  // the count always describe the same event representation.
  const costPerMessage = pickCostPerActionForFamily(
    row.cost_per_action_type, ACTION_FAMILIES['messages']!, opts.currencyMinorFactor,
  );

  return {
    date,
    spendMinor,
    impressions, reach, clicks, linkClicks, landingPageViews, uniqueClicks,
    messages, purchases, leads, conversions,
    revenueMinor,
    ctr: nullableFloat(row.ctr),
    uniqueCtr: nullableFloat(row.unique_ctr),
    cpc: nullableFloat(row.cpc, opts.currencyMinorFactor),
    cpm: nullableFloat(row.cpm, opts.currencyMinorFactor),
    costPerMessage,
    frequency: nullableFloat(row.frequency),
    roas,
  };
}

/** Neutral ad-relevance triple (Meta's own grades), normalized. All three
 *  are 'unknown' when Meta hasn't graded the ad yet. */
export interface NormalizedAdRelevance {
  quality: MetaRanking;
  engagement: MetaRanking;
  conversion: MetaRanking;
}

/**
 * Extract Meta's relevance grades from an ad-level insight row. Returns null
 * when the row carries no ranking keys at all (e.g. account/campaign level),
 * so callers can skip cheaply. Meta field names never escape this cordon.
 */
export function mapAdRelevance(row: MetaInsightRow): NormalizedAdRelevance | null {
  const r = row as Record<string, unknown>;
  const hasAny =
    "quality_ranking" in r ||
    "engagement_rate_ranking" in r ||
    "conversion_rate_ranking" in r;
  if (!hasAny) return null;
  return {
    quality: normalizeRanking(r["quality_ranking"]),
    engagement: normalizeRanking(r["engagement_rate_ranking"]),
    conversion: normalizeRanking(r["conversion_rate_ranking"]),
  };
}

/**
 * Meta returns `purchase_roas` as an array keyed by action_type. Pick one —
 * overlapping entries must never be summed.
 *
 * Resolves through the PURCHASES family's own preference order, deliberately.
 * This picker previously preferred `omni_purchase` FIRST while the purchase
 * COUNT preferred `purchase`, so a row carrying both reported an
 * omni-scoped return against a website-scoped order count: two different
 * universes divided by each other. Sharing one preference list makes that
 * mismatch structurally impossible.
 */
function pickPurchaseRoas(row: MetaInsightRow): number | null {
  const raw = row.purchase_roas;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const resolved = resolveAction(raw as ActionRow[], ACTION_FAMILIES['purchases']!);
  if (resolved.matchedType === null || !(resolved.value > 0)) return null;
  return +resolved.value.toFixed(4);
}

/**
 * Pick the first matching `cost_per_action_type` value for an allowed action
 * set, scaled to minor units. Returns null when the breakdown is missing or
 * all matches are zero/invalid.
 */
function pickCostPerAction(raw: unknown, allowed: Set<string>, scale: number): number | null {
  if (!Array.isArray(raw)) return null;
  for (const r of raw as ActionRow[]) {
    if (r.action_type && allowed.has(r.action_type)) {
      const n = num(r.value);
      if (Number.isFinite(n) && n > 0) return +(n * scale).toFixed(4);
    }
  }
  return null;
}

/** Per-segment metrics for a single breakdown dimension (age, gender, etc.). */
export interface NormalizedBreakdown {
  date: string;
  breakdownKey: string;
  breakdownValue: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  messages: number;
}

/**
 * Translate ONE Meta insight row sliced by a breakdown dimension into a
 * NormalizedBreakdown. Reuses the main cordon for metric extraction so the
 * messaging-count rules stay in lock-step. Returns null when the row has no
 * value for the requested breakdown key (Meta sometimes omits it).
 */
export function mapMetaBreakdownInsight(
  row: MetaInsightRow,
  breakdownKey: string,
  opts: MapOptions,
): NormalizedBreakdown | null {
  const raw = (row as Record<string, unknown>)[breakdownKey];
  if (raw === undefined || raw === null || raw === "") return null;
  const base = mapMetaInsight(row, opts);
  return {
    date: base.date,
    breakdownKey,
    breakdownValue: String(raw),
    spendMinor: base.spendMinor,
    impressions: base.impressions,
    clicks: base.clicks,
    messages: base.messages,
  };
}

// ── action-type mappings ─────────────────────────────────────────────────
//
// The vocabulary itself now lives in analytics/actionSemantics.ts, which owns
// the preference order and the overlap reasoning for every family. This file
// keeps only the cost-per-action helper, because `cost_per_action_type` has
// the same overlap hazard and must resolve through the SAME preference list
// as the count it accompanies.

/**
 * Pick the cost for a family's canonical representation, scaled to minor units.
 *
 * Walks the family's preference order so the cost and the count always
 * describe the same event. Returns null when no representation is present.
 */
function pickCostPerActionForFamily(
  raw: unknown,
  family: ActionFamilyDef,
  scale: number,
): number | null {
  if (!Array.isArray(raw)) return null;
  const resolved = resolveAction(raw as ActionRow[], family);
  if (resolved.matchedType === null || !(resolved.value > 0)) return null;
  return +(resolved.value * scale).toFixed(4);
}

interface ActionRow { action_type?: string; value?: string | number }

// `sumActions()` used to live here. It is deliberately GONE, not merely
// unused: summing a filtered set of Meta action types is the defect P3.5
// removed, and leaving the helper in place would invite the next author to
// reach for it. Every action family now resolves through
// analytics/actionSemantics.ts, which picks one representation per event.

// ── primitives ───────────────────────────────────────────────────────────
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function int(v: unknown): number {
  return Math.round(num(v));
}
function nullableFloat(v: unknown, scale = 1): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return scale === 1 ? +n.toFixed(4) : +(n * scale).toFixed(4);
}
