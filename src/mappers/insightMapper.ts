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

/** The neutral metric vocabulary every connector translates INTO. */
export interface NormalizedInsight {
  date: string;                 // YYYY-MM-DD, the day this row covers

  // counts (BigInt-safe integers; mapper returns number, repo coerces)
  spendMinor: number;           // account currency minor units
  impressions: number;
  reach: number;
  clicks: number;
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
  const uniqueClicks = int(row.unique_clicks);

  // Meta packs results inside actions: [{ action_type: "...", value: "..." }]
  const actions = Array.isArray(row.actions) ? (row.actions as ActionRow[]) : [];
  // STRICT MESSAGES — see pickMessages() below. Do NOT sum the action set:
  // `onsite_conversion.messaging_conversation_started_7d` and
  // `onsite_conversion.messaging_first_reply` are two distinct events
  // (a started conversation, then any reply within it). Adding them
  // double-counts and produced a 163 vs Meta-Ads-Manager-reported 87 in
  // production. We pick exactly ONE canonical action_type per row.
  const messages = pickMessages(actions);
  const purchases = sumActions(actions, PURCHASE_ACTION_TYPES);
  const leads = sumActions(actions, LEAD_ACTION_TYPES);
  // "conversions" is intentionally objective-agnostic: whichever result the
  // campaign optimized for. We default to messages since that's our Phase 1
  // primary KPI; future objectives can refine this without leaking Meta names.
  const conversions = messages || purchases || leads;

  // Action values (revenue) — for ROAS when present
  const actionValues = Array.isArray(row.action_values) ? (row.action_values as ActionRow[]) : [];
  const revenueMajor = sumActions(actionValues, PURCHASE_ACTION_TYPES);
  const revenueMinor = Math.round(revenueMajor * opts.currencyMinorFactor);
  // Prefer Meta's own purchase_roas attribution when present; fall back to
  // computed value/spend ratio so we never lose a signal.
  const metaRoas = pickPurchaseRoas(row);
  const computedRoas = spendMinor > 0 && revenueMinor > 0 ? +(revenueMinor / spendMinor).toFixed(4) : null;
  const roas = metaRoas ?? computedRoas;

  // Cost-per-action breakdowns — Meta returns per action_type, we surface the
  // most-relevant for our Phase 1 KPI (messaging conversations).
  const costPerMessage = pickCostPerAction(row.cost_per_action_type, MESSAGE_ACTION_TYPES, opts.currencyMinorFactor);

  return {
    date,
    spendMinor,
    impressions, reach, clicks, uniqueClicks,
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

/**
 * Meta returns `purchase_roas` as an array keyed by action_type. Sum only the
 * action_types we recognize as purchases so we don't double-count overlapping
 * attribution windows.
 */
function pickPurchaseRoas(row: MetaInsightRow): number | null {
  const raw = row.purchase_roas;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  let total = 0;
  for (const r of raw as ActionRow[]) {
    if (r.action_type && PURCHASE_ACTION_TYPES.has(r.action_type)) total += num(r.value);
  }
  return total > 0 ? +total.toFixed(4) : null;
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

// ── action-type mappings ─────────────────────────────────────────────────
// These constants are the ONLY place Meta's action-type vocabulary lives.
// Each future platform supplies its own equivalent list; consumers see the
// neutral fields above (messages / purchases / leads / conversions).

// Canonical "a conversation was started" events ONLY. Used both by
// pickMessages() (count) and pickCostPerAction() (cost/message). We
// intentionally OMIT `onsite_conversion.messaging_first_reply` — that's a
// different funnel stage and summing it with conversation-started inflated
// the count ~1.9× in production (163 reported vs 87 in Meta Ads Manager).
const MESSAGE_ACTION_TYPES = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  // legacy:
  "messaging_conversation_started",
]);

// Strict preference order for pickMessages — NEVER summed. The first
// action_type present on the row wins; this guarantees parity with what Meta
// Ads Manager itself reports as "Messaging conversations started".
const MESSAGE_ACTION_PREFERENCE: readonly string[] = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started",
];

function pickMessages(actions: ActionRow[]): number {
  for (const preferred of MESSAGE_ACTION_PREFERENCE) {
    for (const a of actions) {
      if (a.action_type === preferred) {
        const n = num(a.value);
        if (Number.isFinite(n) && n >= 0) return Math.round(n);
      }
    }
  }
  return 0;
}
const PURCHASE_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
]);
const LEAD_ACTION_TYPES = new Set([
  "lead",
  "leadgen.other",
  "offsite_conversion.fb_pixel_lead",
]);

interface ActionRow { action_type?: string; value?: string | number }

function sumActions(actions: ActionRow[], allowed: Set<string>): number {
  let total = 0;
  for (const a of actions) {
    if (a.action_type && allowed.has(a.action_type)) total += num(a.value);
  }
  return total;
}

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
