// ════════════════════════════════════════════════════════════════════════
//  src/analytics/resultSemantics.ts — WHAT COUNTS AS A RESULT
//
//  Replaces the ambiguous `DailyStat.conversions` column, which was
//  `messages || purchases || leads` — a first-non-zero fallback, not a
//  semantic decision. One column carried a different meaning per row, with
//  no record of which, and summing it across an account added conversations
//  to purchases to leads as though they were one quantity.
//
//  This module makes three things explicit that were previously conflated:
//
//    resultKey        — the platform event we counted        ("messages")
//    businessOutcome  — what it means to the merchant        ("qualified_conversations")
//    unit             — what kind of thing it is             ("conversation")
//
//  The unit is what makes illegal aggregation structurally impossible: two
//  results of different units cannot be added, and the aggregator returns
//  per-unit subtotals rather than a fabricated single total.
//
//  ── Source data ────────────────────────────────────────────────────────
//  Reads the per-type columns (messages / purchases / leads / clicks /
//  impressions) that have ALWAYS been stored separately and correctly.
//  `conversions` was only ever a derived convenience, so every historical
//  row is re-interpretable from data already on disk. No backfill, no
//  re-fetch from Meta.
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily, ResultMetricKey } from '../lib/objectiveKpis';
import type { DataConfidence } from './confidence';
import type { MetricUnavailableReason } from './metricDictionary';

/**
 * What the merchant actually cares about — named in their world, not Meta's.
 *
 * Deliberately distinct from `resultKey`: "messages" is what the platform
 * counted; "qualified_conversations" is the outcome the shop owner is buying.
 * Collapsing the two is how an engagement label ended up describing a WhatsApp
 * campaign.
 */
export type BusinessOutcome =
  | 'qualified_conversations'
  | 'site_visits'
  | 'lead_submissions'
  | 'orders'
  | 'social_interactions'
  | 'brand_exposure'
  | 'app_installs';

/**
 * The kind of thing being counted. Two results may be added ONLY when their
 * units match — this is the type-level guard against the summing bug that
 * `conversions` institutionalised.
 */
export type ResultUnit =
  | 'conversation'
  | 'visit'
  | 'lead'
  | 'order'
  | 'interaction'
  | 'impression'
  | 'install';

export interface ResultDefinition {
  /** Purpose family this definition serves. */
  family: ObjectiveKpiFamily;
  /** Which stored counter carries this purpose's result. */
  resultKey: ResultMetricKey;
  businessOutcome: BusinessOutcome;
  unit: ResultUnit;
  labelAr: string;
  labelEn: string;
  /** Cost metric paired with this result — a key into METRIC_DICTIONARY. */
  costMetricKey: string;
  /** Rate metric measuring conversion INTO this result, when one exists. */
  rateMetricKey: string | null;
  /**
   * True when this result is an approximation rather than a direct count.
   * Engagement uses all-clicks as a proxy for post interactions (approved to
   * remain as-is for now), so anything consuming it must disclose that.
   */
  approximate: boolean;
}

const DEFINITIONS: Record<ObjectiveKpiFamily, ResultDefinition> = {
  messaging: {
    family: 'messaging',
    resultKey: 'messages',
    businessOutcome: 'qualified_conversations',
    unit: 'conversation',
    labelAr: 'محادثة',
    labelEn: 'conversation',
    costMetricKey: 'cost_per_conversation',
    rateMetricKey: 'conversation_rate',
    approximate: false,
  },
  traffic: {
    family: 'traffic',
    resultKey: 'clicks',
    businessOutcome: 'site_visits',
    unit: 'visit',
    labelAr: 'زيارة',
    labelEn: 'visit',
    costMetricKey: 'cost_per_link_click',
    rateMetricKey: 'ctr',
    approximate: false,
  },
  leads: {
    family: 'leads',
    resultKey: 'leads',
    businessOutcome: 'lead_submissions',
    unit: 'lead',
    labelAr: 'عميل محتمل',
    labelEn: 'lead',
    costMetricKey: 'cost_per_lead',
    rateMetricKey: null,
    approximate: false,
  },
  sales: {
    family: 'sales',
    resultKey: 'purchases',
    businessOutcome: 'orders',
    unit: 'order',
    labelAr: 'طلب',
    labelEn: 'order',
    costMetricKey: 'cost_per_purchase',
    rateMetricKey: null,
    approximate: false,
  },
  engagement: {
    family: 'engagement',
    resultKey: 'clicks',
    businessOutcome: 'social_interactions',
    unit: 'interaction',
    labelAr: 'تفاعل',
    labelEn: 'interaction',
    costMetricKey: 'cost_per_engagement',
    rateMetricKey: null,
    // All-clicks is a proxy for post interactions, not a direct count. Approved
    // to remain an approximation for now; flagged so consumers disclose it.
    approximate: true,
  },
  awareness: {
    family: 'awareness',
    resultKey: 'impressions',
    businessOutcome: 'brand_exposure',
    unit: 'impression',
    labelAr: 'ظهور',
    labelEn: 'impression',
    costMetricKey: 'cpm',
    rateMetricKey: null,
    approximate: false,
  },
  app: {
    family: 'app',
    resultKey: 'clicks',
    businessOutcome: 'app_installs',
    unit: 'install',
    labelAr: 'تثبيت',
    labelEn: 'install',
    costMetricKey: 'cost_per_link_click',
    rateMetricKey: null,
    approximate: true,
  },
};

/** The result definition for a resolved purpose family. */
export function resultFor(family: ObjectiveKpiFamily): ResultDefinition {
  return DEFINITIONS[family];
}

/** Every definition — for tests and dictionary cross-checks. */
export function allResultDefinitions(): ResultDefinition[] {
  return Object.values(DEFINITIONS);
}

// ── A result that knows what it is ──────────────────────────────────────

/**
 * A bare `number` can be added to anything. A ResultValue carries its unit, so
 * the aggregator can REFUSE an illegal sum instead of computing a wrong one.
 */
export type ResultValue =
  | {
      status: 'OK';
      count: number;
      unit: ResultUnit;
      outcome: BusinessOutcome;
      definition: ResultDefinition;
      dataConfidence: DataConfidence;
    }
  | {
      status: 'UNAVAILABLE';
      reason: MetricUnavailableReason;
      definition: ResultDefinition | null;
    };

/** The stored counters a daily row can supply. Any may be absent. */
export interface DailyResultRow {
  messages?: number | bigint | null;
  purchases?: number | bigint | null;
  leads?: number | bigint | null;
  clicks?: number | bigint | null;
  impressions?: number | bigint | null;
}

function toNum(v: number | bigint | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the result for ONE row under its campaign's purpose.
 *
 * `family` null means the purpose could not be determined (rule 3: UNKNOWN is
 * first-class). We do NOT fall back to a plausible family — that fabrication
 * is the exact behaviour this work removed.
 */
export function resolveResult(
  family: ObjectiveKpiFamily | null | undefined,
  row: DailyResultRow,
  dataConfidence: DataConfidence = 'COMPLETE',
): ResultValue {
  if (!family) {
    return { status: 'UNAVAILABLE', reason: 'NOT_APPLICABLE', definition: null };
  }
  const definition = resultFor(family);
  const raw = toNum(row[definition.resultKey as keyof DailyResultRow]);
  if (raw === null) {
    // The column was never populated for this row — distinct from a real zero.
    return { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_DATA', definition };
  }
  return {
    status: 'OK',
    count: raw,
    unit: definition.unit,
    outcome: definition.businessOutcome,
    definition,
    dataConfidence,
  };
}

/** Sum one purpose's rows. Same family throughout, so the unit is constant. */
export function resolveResultTotal(
  family: ObjectiveKpiFamily | null | undefined,
  rows: DailyResultRow[],
  dataConfidence: DataConfidence = 'COMPLETE',
): ResultValue {
  if (!family) {
    return { status: 'UNAVAILABLE', reason: 'NOT_APPLICABLE', definition: null };
  }
  const definition = resultFor(family);
  if (rows.length === 0) {
    return { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_DATA', definition };
  }
  let total = 0;
  let sawValue = false;
  for (const row of rows) {
    const n = toNum(row[definition.resultKey as keyof DailyResultRow]);
    if (n !== null) { total += n; sawValue = true; }
  }
  if (!sawValue) {
    return { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_DATA', definition };
  }
  return {
    status: 'OK',
    count: total,
    unit: definition.unit,
    outcome: definition.businessOutcome,
    definition,
    dataConfidence,
  };
}

// ── Mixed-purpose aggregation ───────────────────────────────────────────

export interface UnitSubtotal {
  unit: ResultUnit;
  outcome: BusinessOutcome;
  count: number;
  /** How many campaigns contributed. */
  campaigns: number;
  labelAr: string;
  labelEn: string;
  /** True when any contributing definition is an approximation. */
  approximate: boolean;
  /** Spend attributed to this unit, minor units — drives `dominant`. */
  spendMinor: number;
}

export interface MixedResultTotal {
  /** Per-unit subtotals. NEVER flattened into a single number. */
  byUnit: UnitSubtotal[];
  /** True when more than one unit is present — the UI must not show one total. */
  mixed: boolean;
  /**
   * Highest-spend unit, for HEADLINE FRAMING ONLY.
   *
   * Display-only by contract: never sum into it, never let it stand in for the
   * other units. `byUnit` must always be exposed alongside it. An account
   * running messaging and sales has no single result count, and saying "96
   * نتيجة" instead of "84 محادثة · 12 طلب" is a fabrication.
   */
  dominant: { unit: ResultUnit; outcome: BusinessOutcome; count: number; spendShare: number } | null;
  /** Total spend across all contributions, minor units. */
  totalSpendMinor: number;
}

export interface CampaignResultContribution {
  family: ObjectiveKpiFamily | null | undefined;
  rows: DailyResultRow[];
  spendMinor: number;
}

/**
 * Aggregate results across campaigns of possibly different purposes.
 *
 * Returns per-unit subtotals. There is deliberately NO field carrying a single
 * cross-unit total, because no correct value exists — the type makes the
 * fabrication unrepresentable rather than merely discouraged.
 *
 * Contributions whose family is unknown are skipped, not guessed at.
 */
export function aggregateMixedResults(
  contributions: CampaignResultContribution[],
): MixedResultTotal {
  const byUnit = new Map<ResultUnit, UnitSubtotal>();
  let totalSpendMinor = 0;

  for (const c of contributions) {
    const value = resolveResultTotal(c.family, c.rows);
    const spend = Number(c.spendMinor) || 0;
    if (value.status !== 'OK') continue;   // unknown purpose: skipped, never guessed
    totalSpendMinor += spend;

    const existing = byUnit.get(value.unit);
    if (existing) {
      existing.count += value.count;
      existing.campaigns += 1;
      existing.spendMinor += spend;
      existing.approximate = existing.approximate || value.definition.approximate;
    } else {
      byUnit.set(value.unit, {
        unit: value.unit,
        outcome: value.outcome,
        count: value.count,
        campaigns: 1,
        labelAr: value.definition.labelAr,
        labelEn: value.definition.labelEn,
        approximate: value.definition.approximate,
        spendMinor: spend,
      });
    }
  }

  const units = [...byUnit.values()].sort((a, b) => b.spendMinor - a.spendMinor);
  const top = units[0];

  return {
    byUnit: units,
    mixed: units.length > 1,
    dominant: top
      ? {
          unit: top.unit,
          outcome: top.outcome,
          count: top.count,
          spendShare: totalSpendMinor > 0 ? +(top.spendMinor / totalSpendMinor).toFixed(4) : 0,
        }
      : null,
    totalSpendMinor,
  };
}

/**
 * Add two results — ONLY when their units match.
 *
 * Throws on a unit mismatch rather than returning a wrong number. Aggregating
 * conversations with orders is a programming error, and a silent one is exactly
 * what `conversions` produced for years; failing loudly is the point.
 */
export function addResults(a: ResultValue, b: ResultValue): ResultValue {
  if (a.status !== 'OK') return a;
  if (b.status !== 'OK') return b;
  if (a.unit !== b.unit) {
    throw new Error(
      `Illegal cross-purpose aggregation: cannot add "${a.unit}" to "${b.unit}". ` +
      `Use aggregateMixedResults() for per-unit subtotals — there is no correct single total.`,
    );
  }
  return {
    ...a,
    count: a.count + b.count,
    // The weaker confidence wins: a total is only as trustworthy as its worst part.
    dataConfidence: a.dataConfidence === 'COMPLETE' ? b.dataConfidence : a.dataConfidence,
  };
}

/**
 * The result count when the account has exactly ONE unit, else null.
 *
 * This — not `dominant` — is what computation may consume. `dominant` is a
 * display-only framing helper for the headline; using its count as "the"
 * result would quietly discard the other units, which is the same fabrication
 * `conversions` committed, just with better manners.
 *
 * Null for a mixed account is the honest answer: no single result count
 * exists. Callers must fall back to per-unit detail rather than a number.
 */
export function singleUnitCount(total: MixedResultTotal): number | null {
  if (total.byUnit.length !== 1) return null;
  return total.byUnit[0]!.count;
}

/** The stored column to count, when one unit governs the whole set. */
export function singleUnitResultKey(total: MixedResultTotal): ResultMetricKey | null {
  if (total.byUnit.length !== 1) return null;
  const unit = total.byUnit[0]!.unit;
  const def = allResultDefinitions().find((d) => d.unit === unit);
  return def ? def.resultKey : null;
}

/** Merchant-facing Arabic for per-unit subtotals: "84 محادثة · 12 طلب". */
export function describeMixedAr(total: MixedResultTotal): string {
  if (total.byUnit.length === 0) return 'لا توجد نتائج بعد';
  return total.byUnit
    .map((u) => `${u.count.toLocaleString('en-US')} ${u.labelAr}`)
    .join(' · ');
}

export function describeMixedEn(total: MixedResultTotal): string {
  if (total.byUnit.length === 0) return 'No results yet';
  return total.byUnit
    .map((u) => `${u.count.toLocaleString('en-US')} ${u.labelEn}${u.count === 1 ? '' : 's'}`)
    .join(' · ');
}
