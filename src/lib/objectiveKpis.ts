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
  | 'linkClicks'
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
    // linkClicks, not clicks (P1-02): metricDictionary.ts's own definition —
    // "Clicks that actually opened the destination... this — not all-clicks
    // — is what Ads Manager means by traffic." Matches objectiveKpiCards.ts,
    // which already used linkClicks here.
    resultKey: 'linkClicks',
    resultLabelAr: 'النقرات على الرابط',
    efficiencyKey: 'cpc',
    efficiencyLabelAr: 'تكلفة النقرة',
    resultInfoId: 'link_clicks',
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
    // Same reasoning as traffic above (P1-02).
    resultKey: 'linkClicks',
    resultLabelAr: 'النقرات على الرابط',
    efficiencyKey: 'cpc',
    efficiencyLabelAr: 'تكلفة النقرة',
    resultInfoId: 'link_clicks',
    efficiencyInfoId: 'cpc',
    signalKeys: ['ctr', 'cpc', 'cpm'],
  },
};

/**
 * Resolve a Meta objective string to a family, or null when it genuinely
 * cannot be determined.
 *
 * `null` is a real answer, not a failure: an account-level view spans mixed
 * objectives, and an unsynced or future Meta objective has no family. The
 * older `objectiveKpiFamily` collapsed both cases to 'messaging', which meant
 * an awareness-only account received messaging diagnoses and messaging Arabic
 * vocabulary. Callers that must degrade gracefully should branch on null
 * rather than inherit a guess.
 */
export function resolveObjectiveFamily(
  objective: string | null | undefined,
): ObjectiveKpiFamily | null {
  const raw = String(objective || '').trim().toUpperCase();
  if (!raw) return null;
  const family = matchKnownObjective(raw);
  return family;
}

/**
 * Legacy resolver: same mapping, but falls back to 'messaging' for anything
 * unrecognized.
 *
 * @deprecated Prefer `resolveObjectiveFamily` (returns null) for new code, and
 * `resolveCampaignPurpose` whenever ad-set optimization goals or destination
 * types are available — the campaign objective alone misclassifies every
 * click-to-WhatsApp campaign that ships under an ENGAGEMENT shell.
 */
export function objectiveKpiFamily(objective: string | null | undefined): ObjectiveKpiFamily {
  return resolveObjectiveFamily(objective) ?? 'messaging';
}

function matchKnownObjective(raw: string): ObjectiveKpiFamily | null {

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
  // Unrecognized (a future Meta objective, or a typo): say so honestly.
  return null;
}

export function getObjectiveKpiSpec(objective: string | null | undefined): ObjectiveKpiSpec {
  return SPECS[objectiveKpiFamily(objective)];
}

/**
 * KPI spec for an ALREADY-RESOLVED family.
 *
 * Prefer this over `getObjectiveKpiSpec` wherever the caller has run
 * `resolveCampaignPurpose`. Converting a resolved family back into a synthetic
 * objective string just to re-parse it is lossy: 'messaging' derived from a
 * WhatsApp destination and 'messaging' derived from a MESSAGES objective are
 * the same answer, and the round-trip only creates opportunities to disagree.
 */
export function getKpiSpecForFamily(family: ObjectiveKpiFamily): ObjectiveKpiSpec {
  return SPECS[family];
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
  /** Clicks that opened the destination — the traffic/app result (P1-02). */
  linkClicks: number;
  messages: number;
  purchases: number;
  leads: number;
  revenueMinor: number;
}

/**
 * Pick the objective's result count from window totals.
 *
 * `linkClicks` is optional on the input type for one reason: callers built
 * on src/engine/BaselineCalculator's CampaignRawData (the deterministic
 * Brain/rule-grounding pipeline — src/engines/rules/campaignSignals.ts)
 * do not carry that field, and extending CampaignRawData is architecture
 * work outside this fix's boundary (P1-02 follow-up, reported not silently
 * expanded into). For an objective whose canonical result is linkClicks
 * (traffic, app), such a caller degrades to the legacy `clicks` reading
 * rather than crash or silently return 0 — every other caller now supplies
 * `linkClicks` and gets the corrected value.
 */
export function resultCountForObjective(
  objective: string | null | undefined,
  totals: Pick<WindowTotals, Exclude<ResultMetricKey, 'linkClicks'>> & { linkClicks?: number },
): number {
  const key = getObjectiveKpiSpec(objective).resultKey;
  if (key === 'linkClicks') {
    return totals.linkClicks ?? (Number(totals.clicks) || 0);
  }
  return Number(totals[key as Exclude<ResultMetricKey, 'linkClicks'>]) || 0;
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
