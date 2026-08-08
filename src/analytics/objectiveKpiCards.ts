// ════════════════════════════════════════════════════════════════════════
//  src/analytics/objectiveKpiCards.ts — WHICH KPIs THIS OBJECTIVE CARES ABOUT
//
//  P4.2: there is no universal KPI layout. A messaging campaign leads with
//  conversations and cost per conversation; a sales campaign leads with
//  purchases, revenue and ROAS; an awareness campaign leads with reach and
//  frequency and should never be shown a conversion rate it isn't buying.
//
//  This lives in the ANALYTICS layer, not the dashboard, deliberately. If the
//  frontend held a per-objective layout table, every new objective would need
//  a frontend change, and the "which metrics are valid here" rule would exist
//  in two places — which is how the original split brain started.
//
//  Every card is gated through the metric dictionary, so an inapplicable
//  metric cannot be listed even by mistake (rule 6).
// ════════════════════════════════════════════════════════════════════════

import type { ObjectiveKpiFamily } from '../lib/objectiveKpis';
import { isMetricApplicable, getMetric } from './metricDictionary';
import { resultFor } from './resultSemantics';

export interface KpiCard {
  key: string;
  labelAr: string;
  value: number | null;
  display: string;
  approximate: boolean;
  priority: number;
}

/** Raw window figures the cards are formatted from. All pre-computed. */
export interface KpiSource {
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  messages: number;
  leads: number;
  purchases: number;
  revenueMinor: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
  roas: number | null;
  /** Formatter supplied by the caller so currency rules stay in one place. */
  money: (minor: number) => string;
}

/**
 * Ordered metric keys per objective. Mirrors the locked P4.2 lists.
 * `null` entries are computed rates that have no dictionary counterpart.
 */
const CARD_PLAN: Record<ObjectiveKpiFamily, string[]> = {
  messaging: ['conversations', 'cost_per_conversation', 'link_clicks', 'conversation_rate', 'ctr', 'cpc', 'frequency', 'spend'],
  traffic:   ['link_clicks', 'landing_page_views', 'lpv_rate', 'ctr', 'cpc', 'cpm', 'frequency', 'spend'],
  leads:     ['leads', 'cost_per_lead', 'link_clicks', 'lead_rate', 'ctr', 'cpc', 'frequency', 'spend'],
  sales:     ['purchases', 'revenue', 'cost_per_purchase', 'roas', 'link_clicks', 'purchase_rate', 'ctr', 'spend'],
  engagement:['engagements', 'cost_per_engagement', 'reach', 'ctr', 'frequency', 'spend'],
  awareness: ['impressions', 'reach', 'frequency', 'cpm', 'spend'],
  app:       ['link_clicks', 'cost_per_link_click', 'ctr', 'cpc', 'frequency', 'spend'],
};

const LABELS_AR: Record<string, string> = {
  conversations: 'المحادثات',
  cost_per_conversation: 'تكلفة المحادثة',
  conversation_rate: 'نسبة النقرة إلى محادثة',
  link_clicks: 'النقرات على الرابط',
  landing_page_views: 'مشاهدات صفحة الهبوط',
  lpv_rate: 'نسبة النقرة إلى زيارة',
  leads: 'العملاء المحتملون',
  cost_per_lead: 'تكلفة العميل المحتمل',
  lead_rate: 'نسبة النقرة إلى عميل',
  purchases: 'المشتريات',
  revenue: 'الإيرادات',
  cost_per_purchase: 'تكلفة الشراء',
  purchase_rate: 'نسبة النقرة إلى شراء',
  roas: 'العائد على الإنفاق',
  engagements: 'التفاعلات',
  cost_per_engagement: 'تكلفة التفاعل',
  impressions: 'مرات الظهور',
  reach: 'الوصول',
  frequency: 'معدل التكرار',
  ctr: 'معدل النقر',
  cpc: 'تكلفة النقرة',
  cpm: 'تكلفة الألف ظهور',
  cost_per_link_click: 'تكلفة النقرة على الرابط',
  spend: 'المبلغ المنفق',
};

/** Rates computed from two counts. Null denominator → null, never zero. */
function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
function costPer(spendMinor: number, count: number): number | null {
  return count > 0 ? spendMinor / count : null;
}
const pctDisplay = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const numDisplay = (v: number | null) => (v === null ? '—' : v.toLocaleString('en-US'));

/**
 * Build the objective's KPI cards.
 *
 * Returns null for an unresolved family — an unknown campaign gets no
 * objective-specific layout, because we do not know what it is buying.
 */
export function buildObjectiveKpiCards(
  family: ObjectiveKpiFamily | null | undefined,
  src: KpiSource,
): { family: string; cards: KpiCard[] } | null {
  if (!family) return null;
  const plan = CARD_PLAN[family];
  const def = resultFor(family);
  const cards: KpiCard[] = [];

  for (const key of plan) {
    // Dictionary-gated: an inapplicable metric can never be listed (rule 6).
    // Rate keys are local compositions with no dictionary entry — allow those.
    const LOCAL_RATES = new Set(['conversation_rate', 'lpv_rate', 'lead_rate', 'purchase_rate', 'revenue']);
    if (!LOCAL_RATES.has(key)) {
      const metric = getMetric(key);
      if (metric && !isMetricApplicable(key, family)) continue;
    }

    let value: number | null = null;
    let display = '—';
    let priority = 3;
    // A card inherits approximation from the objective's result definition
    // whenever it describes that result (rule 8).
    let approximate = false;

    switch (key) {
      case 'conversations':
        value = src.messages; display = numDisplay(value); priority = 1;
        approximate = def.approximate; break;
      case 'cost_per_conversation':
        value = costPer(src.spendMinor, src.messages);
        display = value === null ? '—' : src.money(Math.round(value)); priority = 1; break;
      case 'conversation_rate':
        value = rate(src.messages, src.linkClicks); display = pctDisplay(value); priority = 1; break;

      case 'link_clicks':
        value = src.linkClicks; display = numDisplay(value);
        priority = family === 'traffic' || family === 'app' ? 1 : 2; break;
      case 'landing_page_views':
        value = src.landingPageViews; display = numDisplay(value); priority = 1; break;
      case 'lpv_rate':
        value = rate(src.landingPageViews, src.linkClicks); display = pctDisplay(value); priority = 1; break;

      case 'leads':
        value = src.leads; display = numDisplay(value); priority = 1; break;
      case 'cost_per_lead':
        value = costPer(src.spendMinor, src.leads);
        display = value === null ? '—' : src.money(Math.round(value)); priority = 1; break;
      case 'lead_rate':
        value = rate(src.leads, src.linkClicks); display = pctDisplay(value); priority = 1; break;

      case 'purchases':
        value = src.purchases; display = numDisplay(value); priority = 1; break;
      case 'revenue':
        value = src.revenueMinor; display = src.money(src.revenueMinor); priority = 1; break;
      case 'cost_per_purchase':
        value = costPer(src.spendMinor, src.purchases);
        display = value === null ? '—' : src.money(Math.round(value)); priority = 1; break;
      case 'purchase_rate':
        value = rate(src.purchases, src.linkClicks); display = pctDisplay(value); priority = 2; break;
      case 'roas':
        value = src.roas; display = value === null ? '—' : `${value.toFixed(2)}x`; priority = 1; break;

      case 'engagements':
        // All-clicks as a proxy for post interactions — always disclosed.
        value = src.clicks; display = numDisplay(value); priority = 1;
        approximate = true; break;
      case 'cost_per_engagement':
        value = costPer(src.spendMinor, src.clicks);
        display = value === null ? '—' : src.money(Math.round(value)); priority = 1;
        approximate = true; break;

      case 'impressions':
        value = src.impressions; display = numDisplay(value);
        priority = family === 'awareness' ? 1 : 3; break;
      case 'reach':
        value = src.reach; display = numDisplay(value);
        priority = family === 'awareness' || family === 'engagement' ? 1 : 2; break;
      case 'frequency':
        value = src.frequency; display = value === null ? '—' : value.toFixed(2); priority = 3; break;
      case 'ctr':
        value = src.ctr; display = value === null ? '—' : `${value.toFixed(2)}%`; priority = 2; break;
      case 'cpc':
        value = src.cpc; display = value === null ? '—' : src.money(Math.round(value)); priority = 2; break;
      case 'cpm':
        value = src.cpm; display = value === null ? '—' : src.money(Math.round(value)); priority = 2; break;
      case 'cost_per_link_click':
        value = costPer(src.spendMinor, src.linkClicks);
        display = value === null ? '—' : src.money(Math.round(value)); priority = 1; break;
      case 'spend':
        value = src.spendMinor; display = src.money(src.spendMinor); priority = 2; break;
      default:
        continue;
    }

    cards.push({ key, labelAr: LABELS_AR[key] ?? key, value, display, approximate, priority });
  }

  return { family, cards };
}
