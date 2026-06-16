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
  messages: number;
  purchases: number;
  leads: number;
  conversions: number;

  // ratios (computed by Meta but mirrored neutrally)
  ctr: number | null;           // %
  cpc: number | null;           // minor units per click
  cpm: number | null;           // minor units per 1000 impressions
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

  // Meta packs results inside actions: [{ action_type: "...", value: "..." }]
  const actions = Array.isArray(row.actions) ? (row.actions as ActionRow[]) : [];
  const messages = sumActions(actions, MESSAGE_ACTION_TYPES);
  const purchases = sumActions(actions, PURCHASE_ACTION_TYPES);
  const leads = sumActions(actions, LEAD_ACTION_TYPES);
  // "conversions" is intentionally objective-agnostic: whichever result the
  // campaign optimized for. We default to messages since that's our Phase 1
  // primary KPI; future objectives can refine this without leaking Meta names.
  const conversions = messages || purchases || leads;

  // Action values (revenue) — for ROAS when present
  const actionValues = Array.isArray(row.action_values) ? (row.action_values as ActionRow[]) : [];
  const revenueMajor = sumActions(actionValues, PURCHASE_ACTION_TYPES);
  const revenueMinor = revenueMajor * opts.currencyMinorFactor;
  const roas = spendMinor > 0 && revenueMinor > 0 ? +(revenueMinor / spendMinor).toFixed(4) : null;

  return {
    date,
    spendMinor,
    impressions, reach, clicks,
    messages, purchases, leads, conversions,
    ctr: nullableFloat(row.ctr),
    cpc: nullableFloat(row.cpc, opts.currencyMinorFactor),
    cpm: nullableFloat(row.cpm, opts.currencyMinorFactor),
    frequency: nullableFloat(row.frequency),
    roas,
  };
}

// ── action-type mappings ─────────────────────────────────────────────────
// These constants are the ONLY place Meta's action-type vocabulary lives.
// Each future platform supplies its own equivalent list; consumers see the
// neutral fields above (messages / purchases / leads / conversions).

const MESSAGE_ACTION_TYPES = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
  // legacy:
  "messaging_conversation_started",
]);
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
