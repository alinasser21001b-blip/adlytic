/**
 * Objective → primary KPI family.
 *
 * Phase 1 UI hard-coded messaging KPIs (messages / cost-per-message) for every
 * campaign. Awareness / traffic / sales / leads campaigns must surface their
 * own result + efficiency metrics instead.
 *
 * DailyStat only stores a fixed set of counters (impressions, reach, clicks,
 * messages, purchases, leads, …). Families below map Meta objectives onto
 * those columns — never invent metrics we don't store.
 */

export type ObjectiveKpiFamily =
  | 'awareness'
  | 'traffic'
  | 'engagement'
  | 'leads'
  | 'sales'
  | 'messaging'
  | 'app';

export type ResultMetricKey =
  | 'impressions'
  | 'reach'
  | 'clicks'
  | 'messages'
  | 'purchases'
  | 'leads';

export type EfficiencyMetricKey =
  | 'cpm'
  | 'cpc'
  | 'costPerMessage'
  | 'costPerPurchase'
  | 'costPerLead'
  | 'roas';

export type SignalMetricKey = 'ctr' | 'frequency' | 'cpm' | 'cpc' | 'costPerMessage';

export interface ObjectiveKpiSpec {
  family: ObjectiveKpiFamily;
  /** Window counter used as "النتائج" in lists / inspector. */
  resultKey: ResultMetricKey;
  resultLabelAr: string;
  /** Efficiency metric paired with the result (تكلفة النتيجة). */
  efficiencyKey: EfficiencyMetricKey;
  efficiencyLabelAr: string;
  /** Info-popover metric ids used by the layout glossary. */
  resultInfoId: string;
  efficiencyInfoId: string;
  /** 7d-vs-prior signal keys (direction of "good" is fixed per key). */
  signalKeys: SignalMetricKey[];
}

const SIGNAL_GOOD: Record<SignalMetricKey, 'up' | 'down'> = {
  ctr: 'up',
  frequency: 'down',
  cpm: 'down',
  cpc: 'down',
  costPerMessage: 'down',
};

const SPECS: Record<ObjectiveKpiFamily, ObjectiveKpiSpec> = {
  awareness: {
    family: 'awareness',
    resultKey: 'impressions',
    resultLabelAr: 'مرات الظهور',
    efficiencyKey: 'cpm',
    efficiencyLabelAr: 'تكلفة الألف ظهور',
    resultInfoId: 'impressions',
    efficiencyInfoId: 'cpm',
    signalKeys: ['cpm', 'frequency', 'ctr'],
  },
  traffic: {
    family: 'traffic',
    resultKey: 'clicks',
    resultLabelAr: 'النقرات',
    efficiencyKey: 'cpc',
    efficiencyLabelAr: 'تكلفة النقرة',
    resultInfoId: 'clicks',
    efficiencyInfoId: 'cpc',
    signalKeys: ['ctr', 'cpc', 'cpm'],
  },
  engagement: {
    family: 'engagement',
    resultKey: 'clicks',
    resultLabelAr: 'التفاعلات',
    efficiencyKey: 'cpc',
    efficiencyLabelAr: 'تكلفة التفاعل',
    resultInfoId: 'clicks',
    efficiencyInfoId: 'cpc',
    signalKeys: ['ctr', 'cpc', 'frequency'],
  },
  leads: {
    family: 'leads',
    resultKey: 'leads',
    resultLabelAr: 'العملاء المحتملون',
    efficiencyKey: 'costPerLead',
    efficiencyLabelAr: 'تكلفة العميل المحتمل',
    resultInfoId: 'leads',
    efficiencyInfoId: 'cost_per_result',
    signalKeys: ['ctr', 'cpm', 'cpc'],
  },
  sales: {
    family: 'sales',
    resultKey: 'purchases',
    resultLabelAr: 'المشتريات',
    efficiencyKey: 'costPerPurchase',
    efficiencyLabelAr: 'تكلفة الشراء',
    resultInfoId: 'purchases',
    efficiencyInfoId: 'cost_per_result',
    signalKeys: ['ctr', 'cpm', 'cpc'],
  },
  messaging: {
    family: 'messaging',
    resultKey: 'messages',
    resultLabelAr: 'إجمالي الرسائل',
    efficiencyKey: 'costPerMessage',
    efficiencyLabelAr: 'تكلفة الرسالة',
    resultInfoId: 'messages',
    efficiencyInfoId: 'cost_per_messaging_conversation',
    signalKeys: ['ctr', 'frequency', 'cpm', 'costPerMessage'],
  },
  app: {
    family: 'app',
    resultKey: 'clicks',
    resultLabelAr: 'النقرات',
    efficiencyKey: 'cpc',
    efficiencyLabelAr: 'تكلفة النقرة',
    resultInfoId: 'clicks',
    efficiencyInfoId: 'cpc',
    signalKeys: ['ctr', 'cpc', 'cpm'],
  },
};

/** Normalize Meta objective strings (legacy + Outcome-era) into a KPI family. */
export function objectiveKpiFamily(objective: string | null | undefined): ObjectiveKpiFamily {
  const raw = String(objective || '').trim().toUpperCase();
  if (!raw) return 'messaging'; // historical Phase-1 default when Meta omitted objective

  if (
    raw === 'OUTCOME_AWARENESS' ||
    raw === 'AWARENESS' ||
    raw === 'BRAND_AWARENESS' ||
    raw === 'REACH' ||
    raw === 'OUTCOME_REACH'
  ) {
    return 'awareness';
  }
  if (
    raw === 'OUTCOME_TRAFFIC' ||
    raw === 'TRAFFIC' ||
    raw === 'LINK_CLICKS' ||
    raw === 'OUTCOME_LINK_CLICKS'
  ) {
    return 'traffic';
  }
  if (
    raw === 'OUTCOME_LEADS' ||
    raw === 'LEADS' ||
    raw === 'LEAD_GENERATION' ||
    raw === 'OUTCOME_LEAD_GENERATION'
  ) {
    return 'leads';
  }
  if (
    raw === 'OUTCOME_SALES' ||
    raw === 'SALES' ||
    raw === 'CONVERSIONS' ||
    raw === 'PRODUCT_CATALOG_SALES' ||
    raw === 'OUTCOME_CONVERSIONS'
  ) {
    return 'sales';
  }
  if (
    raw === 'OUTCOME_APP_PROMOTION' ||
    raw === 'APP_INSTALLS' ||
    raw === 'APP_PROMOTION'
  ) {
    return 'app';
  }
  if (
    raw === 'MESSAGES' ||
    raw === 'OUTCOME_MESSAGES' ||
    raw === 'MESSAGING' ||
    raw.includes('MESSAGE')
  ) {
    return 'messaging';
  }
  // Engagement shell is often used for Messenger/WhatsApp in MENA, but the
  // true purpose is decided by ad-set optimization_goal (see campaignPurpose.ts).
  // Without that context, keep a neutral engagement family — callers that have
  // optimization goals MUST use resolveCampaignPurpose() instead.
  if (raw === 'OUTCOME_ENGAGEMENT' || raw === 'ENGAGEMENT' || raw === 'POST_ENGAGEMENT' || raw === 'PAGE_LIKES') {
    return 'engagement';
  }
  if (raw === 'VIDEO_VIEWS' || raw === 'OUTCOME_VIDEO_VIEWS') {
    return 'awareness';
  }
  return 'messaging';
}

export function getObjectiveKpiSpec(objective: string | null | undefined): ObjectiveKpiSpec {
  return SPECS[objectiveKpiFamily(objective)];
}

export function signalGoodDirection(key: SignalMetricKey): 'up' | 'down' {
  return SIGNAL_GOOD[key];
}

export interface WindowTotals {
  spendMinor: number;
  impressions: number;
  /** Best-effort unique reach for the window (max daily reach — not additive). */
  reach: number;
  clicks: number;
  messages: number;
  purchases: number;
  leads: number;
  revenueMinor: number;
}

/** Pick the objective's result count from window totals. */
export function resultCountForObjective(
  objective: string | null | undefined,
  totals: Pick<WindowTotals, ResultMetricKey>,
): number {
  const key = getObjectiveKpiSpec(objective).resultKey;
  return Number(totals[key]) || 0;
}

/**
 * Efficiency value in MAJOR currency units (or ROAS as a unitless ratio).
 * Returns null when the denominator is zero / missing.
 */
export function efficiencyForObjective(
  objective: string | null | undefined,
  totals: WindowTotals,
  currencyMinorFactor: number,
): number | null {
  const factor = currencyMinorFactor > 0 ? currencyMinorFactor : 100;
  const spendMajor = totals.spendMinor / factor;
  const spec = getObjectiveKpiSpec(objective);
  const safe = (num: number, den: number): number | null =>
    den > 0 && Number.isFinite(num) && Number.isFinite(den) ? num / den : null;

  switch (spec.efficiencyKey) {
    case 'cpm':
      return safe(spendMajor * 1000, totals.impressions);
    case 'cpc':
      return safe(spendMajor, totals.clicks);
    case 'costPerMessage':
      return safe(spendMajor, totals.messages);
    case 'costPerPurchase':
      return safe(spendMajor, totals.purchases);
    case 'costPerLead':
      return safe(spendMajor, totals.leads);
    case 'roas': {
      const revenueMajor = totals.revenueMinor / factor;
      return safe(revenueMajor, spendMajor);
    }
    default:
      return null;
  }
}

/** Efficiency in MINOR units (for list-table formatters that expect minor). */
export function efficiencyMinorForObjective(
  objective: string | null | undefined,
  totals: WindowTotals,
  currencyMinorFactor: number,
): number | null {
  const spec = getObjectiveKpiSpec(objective);
  if (spec.efficiencyKey === 'roas') return null; // unitless — not a money amount
  const major = efficiencyForObjective(objective, totals, currencyMinorFactor);
  if (major == null) return null;
  const factor = currencyMinorFactor > 0 ? currencyMinorFactor : 100;
  return major * factor;
}
