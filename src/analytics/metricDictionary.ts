// ════════════════════════════════════════════════════════════════════════
//  src/analytics/metricDictionary.ts — THE METRIC SEMANTICS LAYER
//
//  Every number Adlytic shows a merchant must be defined here first.
//
//  This file answers, for each metric: what it means, how it is computed,
//  which Meta fields it came from, which campaign objectives it is VALID
//  for, and how it may be aggregated across days. Anything not defined here
//  is not production-safe and must not reach a dashboard.
//
//  ── Two rules this file exists to enforce ──────────────────────────────
//
//  1. NO METRIC LEAKAGE. `cost_per_conversation` is meaningless on a traffic
//     campaign; `roas` is meaningless on a click-to-WhatsApp campaign. Asking
//     for one returns INSUFFICIENT/NOT_APPLICABLE — never a coerced number.
//
//  2. NO ILLEGAL AGGREGATION. Ratios (CTR, CPC, frequency, ROAS) must never
//     be summed or naively averaged across days — they are recomputed from
//     summed numerators and denominators. Reach is not additive at all: the
//     same person reached on two days is one person, so daily reach maxes
//     rather than sums (an underestimate we state honestly rather than an
//     overestimate we invent).
//
//  The dictionary is data, not behavior. Calculation lives in the analytics
//  engine; this module tells the engine what is legal.
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../lib/objectiveKpis';

/**
 * How a metric may be combined across days.
 *
 *   sum            — additive counters (spend, impressions, clicks, messages)
 *   max            — non-additive; the largest daily value is the safest floor
 *   ratio_of_sums  — recompute from summed numerator ÷ summed denominator
 *   weighted_average — average weighted by its natural denominator
 */
export type AggregationRule = 'sum' | 'max' | 'ratio_of_sums' | 'weighted_average';

/**
 * How much we trust the number.
 *
 *   exact     — Meta reported this counter directly
 *   derived   — arithmetic over exact counters (deterministic, still trustworthy)
 *   estimated — carries a modelling assumption; must be labelled in the UI
 */
export type ConfidenceLevel = 'exact' | 'derived' | 'estimated';

/** Why a metric has no value. Never render a number in these cases. */
export type MetricUnavailableReason =
  | 'NOT_APPLICABLE'      // wrong objective for this metric
  | 'INSUFFICIENT_DATA'   // denominator is zero / no rows
  | 'UNKNOWN';            // the field was never synced

export interface MetricDefinition {
  metricKey: string;
  /** Merchant-facing Arabic label. */
  labelAr: string;
  labelEn: string;
  /** Plain-language business meaning — what a merchant should conclude from it. */
  definition: string;
  /** Human-readable formula. The engine implements it; this documents it. */
  formula: string;
  /** Meta API fields / action_types this ultimately derives from. */
  sourceFields: string[];
  /** Column(s) in DailyStat this reads. Empty when computed from others. */
  storedAs: string[];
  /** Objective families for which this metric is meaningful. */
  applicableObjectives: ObjectiveKpiFamily[];
  aggregationRule: AggregationRule;
  confidenceLevel: ConfidenceLevel;
  /** May this metric be compared against a benchmark at all? */
  benchmarkable: boolean;
  /** Lower is better (cost metrics) vs higher is better (result metrics). */
  goodDirection: 'up' | 'down' | 'neutral';
  /**
   * 1 = the headline result for its objective, 2 = supporting, 3 = diagnostic
   * context. Only priority-1 metrics may lead the dashboard story.
   */
  displayPriority: 1 | 2 | 3;
}

const ALL_FAMILIES: ObjectiveKpiFamily[] = [
  'awareness', 'traffic', 'engagement', 'leads', 'sales', 'messaging', 'app',
];

/** Spend-side and delivery metrics are meaningful for every objective. */
const UNIVERSAL = ALL_FAMILIES;

function def(d: MetricDefinition): MetricDefinition {
  return d;
}

export const METRIC_DICTIONARY: Record<string, MetricDefinition> = {

  // ── Universal delivery metrics ────────────────────────────────────────
  spend: def({
    metricKey: 'spend',
    labelAr: 'المبلغ المنفق',
    labelEn: 'Spend',
    definition: 'Money actually charged by Meta for delivering the ads in the period.',
    formula: 'sum(daily spend)',
    sourceFields: ['spend'],
    storedAs: ['DailyStat.spend'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,   // an amount, not a performance ratio
    goodDirection: 'neutral',
    displayPriority: 1,
  }),

  impressions: def({
    metricKey: 'impressions',
    labelAr: 'مرات الظهور',
    labelEn: 'Impressions',
    definition: 'How many times the ads were rendered on a screen. Counts repeats.',
    formula: 'sum(daily impressions)',
    sourceFields: ['impressions'],
    storedAs: ['DailyStat.impressions'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,
    goodDirection: 'neutral',
    displayPriority: 2,
  }),

  reach: def({
    metricKey: 'reach',
    labelAr: 'الوصول',
    labelEn: 'Reach',
    definition: 'Distinct people who saw the ads. NOT additive across days — the same person seen on two days is one person.',
    formula: 'max(daily reach) — a deliberate lower bound; Meta does not expose cross-day dedup for arbitrary windows',
    sourceFields: ['reach'],
    storedAs: ['DailyStat.reach'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'max',
    confidenceLevel: 'estimated',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 2,
  }),

  frequency: def({
    metricKey: 'frequency',
    labelAr: 'معدل التكرار',
    labelEn: 'Frequency',
    definition: 'Average times each person saw the ad. Rising frequency with falling CTR is the classic audience-fatigue signature.',
    formula: 'sum(impressions) ÷ reach',
    sourceFields: ['frequency', 'impressions', 'reach'],
    storedAs: ['DailyStat.frequency'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 3,
  }),

  cpm: def({
    metricKey: 'cpm',
    labelAr: 'تكلفة الألف ظهور',
    labelEn: 'CPM',
    definition: 'Cost to show the ad 1,000 times. Primarily a measure of auction pressure and audience competitiveness, not of creative quality.',
    formula: '(sum(spend) ÷ sum(impressions)) × 1000',
    sourceFields: ['cpm', 'spend', 'impressions'],
    storedAs: ['DailyStat.cpm'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 2,
  }),

  // ── Click metrics — all-clicks vs link-clicks are DIFFERENT ───────────
  clicks: def({
    metricKey: 'clicks',
    labelAr: 'كل النقرات',
    labelEn: 'All clicks',
    definition: 'Every click on the ad — including likes, comments, shares, profile taps and photo expands. This is NOT website traffic.',
    formula: 'sum(daily clicks)',
    sourceFields: ['clicks'],
    storedAs: ['DailyStat.clicks'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,   // too noisy a mix to benchmark meaningfully
    goodDirection: 'up',
    displayPriority: 3,
  }),

  link_clicks: def({
    metricKey: 'link_clicks',
    labelAr: 'النقرات على الرابط',
    labelEn: 'Link clicks',
    definition: 'Clicks that actually opened the destination (website, WhatsApp, Messenger). This — not all-clicks — is what Ads Manager means by traffic.',
    formula: 'sum(daily inline_link_clicks)',
    sourceFields: ['inline_link_clicks'],
    storedAs: ['DailyStat.linkClicks'],
    applicableObjectives: ['traffic', 'leads', 'sales', 'messaging', 'app'],
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  landing_page_views: def({
    metricKey: 'landing_page_views',
    labelAr: 'مشاهدات صفحة الهبوط',
    labelEn: 'Landing page views',
    definition: 'People who actually ARRIVED at the destination page after clicking. The gap between link clicks and this is the landing-page problem: a click that never loads the page (slow site, broken URL, bounce before render). Meta\'s own landing_page_view action — never estimated from clicks.',
    formula: 'sum(actions.landing_page_view)',
    sourceFields: ['actions.landing_page_view'],
    storedAs: ['DailyStat.landingPageViews'],
    applicableObjectives: ['traffic'],
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 2,
  }),

  ctr: def({
    metricKey: 'ctr',
    labelAr: 'معدل النقر',
    labelEn: 'CTR (all)',
    definition: 'Share of impressions that produced any click. The single best proxy for whether the creative still interests the audience.',
    formula: '(sum(clicks) ÷ sum(impressions)) × 100',
    sourceFields: ['ctr', 'clicks', 'impressions'],
    storedAs: ['DailyStat.ctr'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'up',
    displayPriority: 2,
  }),

  cpc: def({
    metricKey: 'cpc',
    labelAr: 'تكلفة النقرة',
    labelEn: 'CPC (all)',
    definition: 'Average cost of any click. Rising CPC with stable CTR usually means auction cost, not creative fatigue.',
    formula: 'sum(spend) ÷ sum(clicks)',
    sourceFields: ['cpc', 'spend', 'clicks'],
    storedAs: ['DailyStat.cpc'],
    applicableObjectives: UNIVERSAL,
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 2,
  }),

  cost_per_link_click: def({
    metricKey: 'cost_per_link_click',
    labelAr: 'تكلفة النقرة على الرابط',
    labelEn: 'Cost per link click',
    definition: 'Cost of getting one person to actually open the destination. Ads Manager\'s default CPC column.',
    formula: 'sum(spend) ÷ sum(link_clicks)',
    sourceFields: ['spend', 'inline_link_clicks'],
    storedAs: [],
    applicableObjectives: ['traffic', 'leads', 'sales', 'messaging', 'app'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 1,
  }),

  // ── Messaging funnel — Adlytic's primary business ─────────────────────
  conversations: def({
    metricKey: 'conversations',
    labelAr: 'المحادثات',
    labelEn: 'Conversations started',
    definition: 'People who opened a chat with the business from the ad. The actual business outcome for a click-to-WhatsApp/Messenger campaign.',
    formula: 'sum(daily messages) — one canonical Meta action_type, never a sum of overlapping types',
    sourceFields: ['actions.onsite_conversion.messaging_conversation_started_7d', 'actions.onsite_conversion.total_messaging_connection'],
    storedAs: ['DailyStat.messages'],
    applicableObjectives: ['messaging'],
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  cost_per_conversation: def({
    metricKey: 'cost_per_conversation',
    labelAr: 'تكلفة المحادثة',
    labelEn: 'Cost per conversation',
    definition: 'What the business pays for one new conversation. The number an Iraqi SMB actually manages against.',
    formula: 'sum(spend) ÷ sum(conversations)',
    sourceFields: ['spend', 'actions.onsite_conversion.messaging_conversation_started_7d'],
    storedAs: ['DailyStat.costPerMessage'],
    applicableObjectives: ['messaging'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 1,
  }),

  conversation_rate: def({
    metricKey: 'conversation_rate',
    labelAr: 'معدل تحوّل النقرة إلى محادثة',
    labelEn: 'Click → conversation rate',
    definition: 'Share of link clicks that became a real conversation. Separates a delivery problem (few clicks) from an after-click problem (clicks that never convert) — the single most diagnostic metric for messaging campaigns.',
    formula: '(sum(conversations) ÷ sum(link_clicks)) × 100',
    sourceFields: ['actions.onsite_conversion.messaging_conversation_started_7d', 'inline_link_clicks'],
    storedAs: [],
    applicableObjectives: ['messaging'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  // ── Lead funnel ───────────────────────────────────────────────────────
  leads: def({
    metricKey: 'leads',
    labelAr: 'العملاء المحتملون',
    labelEn: 'Leads',
    definition: 'Completed lead-form submissions or pixel lead events.',
    formula: 'sum(daily leads)',
    sourceFields: ['actions.lead', 'actions.leadgen.other', 'actions.offsite_conversion.fb_pixel_lead'],
    storedAs: ['DailyStat.leads'],
    applicableObjectives: ['leads'],
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  cost_per_lead: def({
    metricKey: 'cost_per_lead',
    labelAr: 'تكلفة العميل المحتمل',
    labelEn: 'Cost per lead',
    definition: 'Spend per completed lead submission.',
    formula: 'sum(spend) ÷ sum(leads)',
    sourceFields: ['spend', 'actions.lead'],
    storedAs: [],
    applicableObjectives: ['leads'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 1,
  }),

  // ── Sales funnel ──────────────────────────────────────────────────────
  purchases: def({
    metricKey: 'purchases',
    labelAr: 'المشتريات',
    labelEn: 'Purchases',
    definition: 'Attributed purchase events. Depends entirely on correct pixel/CAPI setup — absence may mean no tracking rather than no sales.',
    formula: 'sum(daily purchases)',
    sourceFields: ['actions.purchase', 'actions.omni_purchase', 'actions.offsite_conversion.fb_pixel_purchase'],
    storedAs: ['DailyStat.purchases'],
    applicableObjectives: ['sales'],
    aggregationRule: 'sum',
    confidenceLevel: 'exact',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  cost_per_purchase: def({
    metricKey: 'cost_per_purchase',
    labelAr: 'تكلفة الشراء',
    labelEn: 'Cost per purchase',
    definition: 'Spend per attributed purchase (CPA).',
    formula: 'sum(spend) ÷ sum(purchases)',
    sourceFields: ['spend', 'actions.purchase'],
    storedAs: [],
    applicableObjectives: ['sales'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'down',
    displayPriority: 1,
  }),

  roas: def({
    metricKey: 'roas',
    labelAr: 'العائد على الإنفاق',
    labelEn: 'ROAS',
    definition: 'Attributed revenue per unit of spend. Only meaningful when purchase VALUE is tracked — never inferred for a messaging campaign.',
    formula: 'sum(attributed revenue) ÷ sum(spend)',
    sourceFields: ['purchase_roas', 'action_values.purchase'],
    storedAs: ['DailyStat.roas', 'DailyStat.revenueMinor'],
    applicableObjectives: ['sales'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'derived',
    benchmarkable: true,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  // ── Engagement ────────────────────────────────────────────────────────
  engagements: def({
    metricKey: 'engagements',
    labelAr: 'التفاعلات',
    labelEn: 'Engagements',
    definition: 'Social interactions with the ad (reactions, comments, shares, photo views). Valid ONLY for a genuine post-engagement campaign.',
    formula: 'sum(daily clicks) — Meta\'s all-clicks counter is the closest stored proxy for post interactions',
    sourceFields: ['clicks'],
    storedAs: ['DailyStat.clicks'],
    applicableObjectives: ['engagement'],
    aggregationRule: 'sum',
    confidenceLevel: 'estimated',
    benchmarkable: false,
    goodDirection: 'up',
    displayPriority: 1,
  }),

  cost_per_engagement: def({
    metricKey: 'cost_per_engagement',
    labelAr: 'تكلفة التفاعل',
    labelEn: 'Cost per engagement',
    definition: 'Spend per social interaction.',
    formula: 'sum(spend) ÷ sum(engagements)',
    sourceFields: ['spend', 'clicks'],
    storedAs: [],
    applicableObjectives: ['engagement'],
    aggregationRule: 'ratio_of_sums',
    confidenceLevel: 'estimated',
    benchmarkable: false,
    goodDirection: 'down',
    displayPriority: 1,
  }),
};

// ── Query helpers — the ONLY sanctioned way to ask "may I show this?" ────

export function getMetric(metricKey: string): MetricDefinition {
  const m = METRIC_DICTIONARY[metricKey];
  if (!m) throw new Error(`Unknown metric "${metricKey}" — define it in metricDictionary.ts before using it`);
  return m;
}

/** Is this metric meaningful for a campaign of this objective family? */
export function isMetricApplicable(metricKey: string, family: ObjectiveKpiFamily): boolean {
  return getMetric(metricKey).applicableObjectives.includes(family);
}

/** All metrics valid for a family, ordered by display priority. */
export function metricsForFamily(family: ObjectiveKpiFamily): MetricDefinition[] {
  return Object.values(METRIC_DICTIONARY)
    .filter((m) => m.applicableObjectives.includes(family))
    .sort((a, b) => a.displayPriority - b.displayPriority || a.metricKey.localeCompare(b.metricKey));
}

/** Only the headline metrics — what the dashboard may lead with. */
export function primaryMetricsForFamily(family: ObjectiveKpiFamily): MetricDefinition[] {
  return metricsForFamily(family).filter((m) => m.displayPriority === 1);
}

/** A value plus the reason it may be absent. Never a coerced zero. */
export type MetricValue =
  | { status: 'OK'; value: number; metricKey: string }
  | { status: 'UNAVAILABLE'; reason: MetricUnavailableReason; metricKey: string };

/**
 * Compute a metric under dictionary rules. Returns UNAVAILABLE rather than a
 * number whenever the metric does not apply to the objective or the
 * denominator is empty — the guarantee that no fabricated value reaches a UI.
 */
export function computeMetric(
  metricKey: string,
  family: ObjectiveKpiFamily,
  numerator: number | null | undefined,
  denominator?: number | null | undefined,
): MetricValue {
  if (!isMetricApplicable(metricKey, family)) {
    return { status: 'UNAVAILABLE', reason: 'NOT_APPLICABLE', metricKey };
  }
  const num = Number(numerator);
  if (!Number.isFinite(num)) {
    return { status: 'UNAVAILABLE', reason: 'UNKNOWN', metricKey };
  }
  if (denominator === undefined) {
    return { status: 'OK', value: num, metricKey };
  }
  const den = Number(denominator);
  if (!Number.isFinite(den) || den <= 0) {
    return { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_DATA', metricKey };
  }
  return { status: 'OK', value: num / den, metricKey };
}
