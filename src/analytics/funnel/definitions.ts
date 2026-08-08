// ════════════════════════════════════════════════════════════════════════
//  src/analytics/funnel/definitions.ts — OBJECTIVE-AWARE FUNNEL SHAPES
//
//  Pure data. No I/O, no computation.
//
//  There is deliberately NO universal impressions → clicks → conversions
//  funnel: that forces four different businesses into one shape and then
//  reports a number that means something different for each. Every purpose
//  family declares its own chain, and chains are NOT padded to a common
//  length — awareness ends at reach because an awareness campaign has no
//  click objective, and a click ratio for it would be a vanity metric.
//
//  ── Funnel ratios vs supporting signals (locked condition 3) ───────────
//  A funnel ratio is stage[n] ÷ stage[n-1] — the chain the diagnosis walks.
//  Spend, CPM, CPC, CTR, frequency and budget utilisation are SUPPORTING
//  SIGNALS: they inform the diagnosis (delivery pressure, efficiency) but
//  they are not links in the chain and must never be modelled as stages.
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../../lib/objectiveKpis';
import type { ConfidenceLevel } from '../metricDictionary';

/** Every stage a funnel can contain, across all families. */
export type FunnelStageKey =
  | 'impressions'
  | 'reach'
  | 'link_clicks'
  | 'conversations'
  | 'landing_page_views'
  | 'leads'
  | 'purchases'
  | 'interactions'
  | 'installs';

/**
 * The five deterministic problem classes a funnel break maps onto, plus the
 * explicit no-break state. The UI renders these; it never derives them.
 */
export type ProblemClass =
  | 'DELIVERY'
  | 'CLICK'
  | 'POST_CLICK'
  | 'CONVERSION'
  | 'EFFICIENCY'
  | 'NO_MATERIAL_BREAK';

export interface FunnelStageDef {
  stageKey: FunnelStageKey;
  labelAr: string;
  labelEn: string;
  /** What this stage means in the merchant's world. */
  meaning: string;
  /** DailyStat column supplying the count (post-aggregation window total). */
  sourceColumn: 'impressions' | 'reach' | 'linkClicks' | 'landingPageViews' | 'messages' | 'leads' | 'purchases' | 'clicks';
  /** Metric dictionary key documenting this number. */
  metricKey: string;
  /**
   * How the window total is built from daily rows. Reach maxes because it is
   * not additive — the same person on two days is one person.
   */
  aggregation: 'sum' | 'max';
  confidenceLevel: ConfidenceLevel;
  /** Rule 8: a proxy, not a measurement. Caps any diagnosis it feeds. */
  approximate: boolean;
  /**
   * Sample floor for the ratio INTO this stage, measured on the PREVIOUS
   * stage's count (the denominator). Below it: INSUFFICIENT_DATA, no ratio,
   * no diagnosis. Enforced in the analytics layer, not hidden by the UI.
   */
  minDenominatorForRatio: number;
  /** Problem class when the ratio INTO this stage is the earliest break. */
  breakClass: ProblemClass;
  /** Merchant-facing Arabic for that break. */
  breakLabelAr: string;
}

// ── Shared upstream stages ──────────────────────────────────────────────

const IMPRESSIONS: FunnelStageDef = {
  stageKey: 'impressions',
  labelAr: 'مرات الظهور',
  labelEn: 'Impressions',
  meaning: 'Times the ad rendered on a screen. The funnel entry — has no ratio into it.',
  sourceColumn: 'impressions',
  metricKey: 'impressions',
  aggregation: 'sum',
  confidenceLevel: 'exact',
  approximate: false,
  minDenominatorForRatio: 0,      // entry stage — never has a ratio
  breakClass: 'DELIVERY',
  breakLabelAr: 'مشكلة وصول الإعلان',
};

const REACH: FunnelStageDef = {
  stageKey: 'reach',
  labelAr: 'الوصول',
  labelEn: 'Reach',
  meaning: 'Distinct people who saw the ad. reach ÷ impressions is the inverse of frequency, so this ratio falling IS the audience saturating.',
  sourceColumn: 'reach',
  metricKey: 'reach',
  aggregation: 'max',             // NOT additive; max(daily) is an honest floor
  confidenceLevel: 'estimated',   // window reach is a lower bound — see metric dictionary
  approximate: false,
  minDenominatorForRatio: 1_000,  // impressions
  breakClass: 'DELIVERY',
  breakLabelAr: 'الجمهور مُشبع — نفس الأشخاص يرون الإعلان مراراً',
};

const LINK_CLICKS: FunnelStageDef = {
  stageKey: 'link_clicks',
  labelAr: 'النقرات على الرابط',
  labelEn: 'Link clicks',
  meaning: 'Clicks that opened the destination. link clicks ÷ reach is how well the creative earns attention from the people who see it.',
  sourceColumn: 'linkClicks',
  metricKey: 'link_clicks',
  aggregation: 'sum',
  confidenceLevel: 'exact',
  approximate: false,
  minDenominatorForRatio: 1_000,  // reach
  breakClass: 'CLICK',
  breakLabelAr: 'التصميم لم يعد يجذب الانتباه',
};

// ── Terminal stages ─────────────────────────────────────────────────────

const CONVERSATIONS: FunnelStageDef = {
  stageKey: 'conversations',
  labelAr: 'المحادثات',
  labelEn: 'Conversations',
  meaning: 'People who clicked through to WhatsApp/Messenger AND started a conversation. The gap to link clicks is the post-click drop-off.',
  sourceColumn: 'messages',
  metricKey: 'conversations',
  aggregation: 'sum',
  confidenceLevel: 'exact',
  approximate: false,
  minDenominatorForRatio: 10,     // link clicks — but see TERMINAL_MIN_EVENTS too
  breakClass: 'CONVERSION',
  breakLabelAr: 'الناس تضغط ولا تبدأ محادثة',
};

const LANDING_PAGE_VIEWS: FunnelStageDef = {
  stageKey: 'landing_page_views',
  labelAr: 'مشاهدات صفحة الهبوط',
  labelEn: 'Landing page views',
  meaning: 'People who actually ARRIVED at the page after clicking. This ratio falling while link clicks hold means the landing page — not the ad — is losing them.',
  sourceColumn: 'landingPageViews',
  metricKey: 'landing_page_views',
  aggregation: 'sum',
  confidenceLevel: 'exact',
  approximate: false,
  minDenominatorForRatio: 10,
  breakClass: 'POST_CLICK',
  breakLabelAr: 'الصفحة لا تفتح أو بطيئة — النقرة لا تصل',
};

const LEADS: FunnelStageDef = {
  stageKey: 'leads',
  labelAr: 'العملاء المحتملون',
  labelEn: 'Leads',
  meaning: 'Submitted lead forms. The gap to link clicks is form friction.',
  sourceColumn: 'leads',
  metricKey: 'leads',
  aggregation: 'sum',
  confidenceLevel: 'exact',
  approximate: false,
  minDenominatorForRatio: 10,
  breakClass: 'CONVERSION',
  breakLabelAr: 'الناس تضغط ولا تكمل النموذج',
};

const PURCHASES: FunnelStageDef = {
  stageKey: 'purchases',
  labelAr: 'المشتريات',
  labelEn: 'Purchases',
  meaning: 'Completed purchases. The gap to link clicks spans the whole shop funnel.',
  sourceColumn: 'purchases',
  metricKey: 'purchases',
  aggregation: 'sum',
  confidenceLevel: 'exact',
  approximate: false,
  minDenominatorForRatio: 10,
  breakClass: 'CONVERSION',
  breakLabelAr: 'الناس تضغط ولا تشتري',
};

const INTERACTIONS: FunnelStageDef = {
  stageKey: 'interactions',
  labelAr: 'التفاعلات',
  labelEn: 'Interactions',
  meaning: 'APPROXIMATE — derived from all-clicks as a proxy for post interactions. May be displayed; may never drive a high-confidence diagnosis.',
  sourceColumn: 'clicks',
  metricKey: 'clicks',
  aggregation: 'sum',
  confidenceLevel: 'estimated',
  approximate: true,
  minDenominatorForRatio: 1_000,  // reach (this family has no link-click stage)
  breakClass: 'CONVERSION',
  breakLabelAr: 'التفاعل مع المنشور انخفض',
};

const INSTALLS: FunnelStageDef = {
  stageKey: 'installs',
  labelAr: 'التثبيتات',
  labelEn: 'Installs',
  meaning: 'APPROXIMATE — derived from all-clicks; Adlytic has no real install signal. May be displayed; may never drive a high-confidence diagnosis.',
  sourceColumn: 'clicks',
  metricKey: 'clicks',
  aggregation: 'sum',
  confidenceLevel: 'estimated',
  approximate: true,
  minDenominatorForRatio: 30,
  breakClass: 'CONVERSION',
  breakLabelAr: 'النقرات لا تتحول إلى تثبيتات',
};

// ── The approved shapes — no padding, no universal funnel ───────────────

export const FUNNEL_SHAPES: Record<ObjectiveKpiFamily, readonly FunnelStageDef[]> = {
  messaging:  [IMPRESSIONS, REACH, LINK_CLICKS, CONVERSATIONS],
  traffic:    [IMPRESSIONS, REACH, LINK_CLICKS, LANDING_PAGE_VIEWS],
  leads:      [IMPRESSIONS, REACH, LINK_CLICKS, LEADS],
  sales:      [IMPRESSIONS, REACH, LINK_CLICKS, PURCHASES],
  awareness:  [IMPRESSIONS, REACH],
  engagement: [IMPRESSIONS, REACH, INTERACTIONS],
  app:        [IMPRESSIONS, REACH, LINK_CLICKS, INSTALLS],
};

/**
 * Terminal-event floor (locked condition 5): below this many terminal events
 * in the PRIOR window, the conversion ratio's change is noise — one WhatsApp
 * message either way swings it wildly.
 */
export const TERMINAL_MIN_EVENTS = 10;
/** Approximate terminals need more events before their ratio says anything. */
export const APPROX_TERMINAL_MIN_EVENTS = 30;

export function funnelShapeFor(family: ObjectiveKpiFamily): readonly FunnelStageDef[] {
  return FUNNEL_SHAPES[family];
}
