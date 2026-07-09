/**
 * Resolve the *true* advertising purpose of a Meta campaign.
 *
 * Meta's campaign `objective` alone is not enough:
 *   OUTCOME_ENGAGEMENT + optimization_goal=CONVERSATIONS
 *   → merchant-facing "رسائل" (messaging), NOT post engagement / clicks.
 *
 * Meta Ads Manager shows "Messaging conversations started" for that case.
 * Adlytic must classify the same way before choosing KPIs or Arabic labels.
 *
 * Inputs:
 *   - campaign.objective (OUTCOME_*, legacy MESSAGES, …)
 *   - ad-set optimization_goal values (CONVERSATIONS, REACH, LINK_CLICKS, …)
 *   - optional message volume as a soft signal when optimization goals are missing
 */

import {
  getObjectiveKpiSpec,
  objectiveKpiFamily,
  type ObjectiveKpiFamily,
  type ObjectiveKpiSpec,
} from './objectiveKpis';

export interface CampaignPurposeInput {
  objective?: string | null;
  /** Distinct optimization_goal values from the campaign's ad sets. */
  optimizationGoals?: Array<string | null | undefined> | null;
  /**
   * Soft signal: window message count. Used ONLY when objective is engagement
   * (or unknown) and no optimization goals are available — never overrides a
   * clear REACH / LINK_CLICKS / PURCHASE optimization.
   */
  messagesWindow?: number | null;
}

export interface CampaignPurpose {
  /** Effective KPI family after optimization-goal override. */
  family: ObjectiveKpiFamily;
  /** Raw Meta campaign objective (unchanged). */
  objective: string | null;
  /** Primary optimization goal that drove the override (if any). */
  optimizationGoal: string | null;
  /** KPI spec for presentation + efficiency math. */
  kpi: ObjectiveKpiSpec;
  /** Arabic badge for the merchant (رسائل / وعي بالعلامة / …). */
  labelAr: string;
  /** Why we classified this way — for debugging / inspector. */
  reason: string;
}

const FAMILY_LABEL_AR: Record<ObjectiveKpiFamily, string> = {
  awareness: 'وعي بالعلامة',
  traffic: 'زيارات',
  engagement: 'تفاعل',
  leads: 'عملاء محتملون',
  sales: 'مبيعات',
  messaging: 'رسائل',
  app: 'ترويج تطبيق',
};

/** Optimization goals that mean "this is a messaging / conversations campaign". */
const MESSAGING_OPT_GOALS = new Set([
  'CONVERSATIONS',
  'REPLIES',
  'MESSAGING_PURCHASE_CONVERSION',
  'CONVERSATION',
  'MESSAGE_DESTINATION',
  'QUALITY_CALL', // sometimes paired with click-to-message funnels
]);

/** Optimization goals that mean awareness / reach (never messaging). */
const AWARENESS_OPT_GOALS = new Set([
  'REACH',
  'IMPRESSIONS',
  'AD_RECALL_LIFT',
  'THRUPLAY',
  'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS',
]);

/** Traffic / click optimization. */
const TRAFFIC_OPT_GOALS = new Set([
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'QUALITY_LINK_CLICK',
]);

/** Sales / conversion optimization. */
const SALES_OPT_GOALS = new Set([
  'OFFSITE_CONVERSIONS',
  'VALUE',
  'PURCHASE',
]);

/** Lead optimization. */
const LEADS_OPT_GOALS = new Set([
  'LEAD_GENERATION',
  'QUALITY_LEAD',
]);

/** Post engagement (true social engagement, not messages). */
const ENGAGEMENT_OPT_GOALS = new Set([
  'POST_ENGAGEMENT',
  'PAGE_LIKES',
  'EVENT_RESPONSES',
  'VIDEO_VIEWS',
]);

function normalizeGoal(g: string | null | undefined): string {
  return String(g || '').trim().toUpperCase();
}

function pickPrimaryOptimizationGoal(
  goals: Array<string | null | undefined> | null | undefined,
): string | null {
  const cleaned = (goals ?? [])
    .map(normalizeGoal)
    .filter((g) => g.length > 0);
  if (cleaned.length === 0) return null;
  // Prefer messaging goals if any ad set is conversations-optimized.
  const messaging = cleaned.find((g) => MESSAGING_OPT_GOALS.has(g) || g.includes('CONVERSATION') || g.includes('MESSAGE'));
  if (messaging) return messaging;
  // Otherwise first distinct goal (stable).
  return cleaned[0] ?? null;
}

/**
 * Map an optimization_goal to a KPI family override, or null if it should
 * not override the campaign objective.
 */
export function familyFromOptimizationGoal(
  optimizationGoal: string | null | undefined,
): ObjectiveKpiFamily | null {
  const g = normalizeGoal(optimizationGoal);
  if (!g) return null;
  if (MESSAGING_OPT_GOALS.has(g) || g.includes('CONVERSATION') || g.includes('MESSAGE')) {
    return 'messaging';
  }
  if (AWARENESS_OPT_GOALS.has(g)) return 'awareness';
  if (TRAFFIC_OPT_GOALS.has(g)) return 'traffic';
  if (SALES_OPT_GOALS.has(g)) return 'sales';
  if (LEADS_OPT_GOALS.has(g)) return 'leads';
  if (ENGAGEMENT_OPT_GOALS.has(g)) return 'engagement';
  if (g === 'APP_INSTALLS' || g === 'APP_EVENTS') return 'app';
  return null;
}

/**
 * Resolve merchant-facing purpose BEFORE choosing KPIs or Arabic labels.
 *
 * Priority:
 *   1. Messaging optimization goal → messaging (even if objective is ENGAGEMENT)
 *   2. Other clear optimization goals → that family
 *   3. Campaign objective family
 *   4. Soft: engagement/unknown + messages > 0 → messaging
 */
export function resolveCampaignPurpose(input: CampaignPurposeInput): CampaignPurpose {
  const objective = input.objective != null ? String(input.objective) : null;
  const optGoal = pickPrimaryOptimizationGoal(input.optimizationGoals);
  const fromOpt = familyFromOptimizationGoal(optGoal);
  const fromObj = objectiveKpiFamily(objective);

  let family: ObjectiveKpiFamily = fromObj;
  let reason = `objective:${fromObj}`;

  if (fromOpt === 'messaging') {
    family = 'messaging';
    reason = `optimization_goal:${optGoal}`;
  } else if (fromOpt != null) {
    // Optimization goal wins when it clearly disagrees with a vague engagement
    // objective, or when objective is missing.
    if (fromObj === 'engagement' || fromObj === 'messaging' || !objective) {
      family = fromOpt;
      reason = `optimization_goal:${optGoal}`;
    } else if (fromOpt !== fromObj) {
      // Strong opt goals (reach / purchase / leads) still win over mismatched objective.
      family = fromOpt;
      reason = `optimization_goal_override:${optGoal}`;
    }
  } else if (
    (fromObj === 'engagement' || !objective) &&
    Number(input.messagesWindow) > 0
  ) {
    // Soft fallback for older syncs missing optimization_goal: if Meta stored
    // messaging conversations and the shell objective is engagement, treat as messages.
    family = 'messaging';
    reason = 'soft:engagement_with_messages';
  }

  const kpi = getObjectiveKpiSpec(
    family === fromObj ? objective : familyToSyntheticObjective(family),
  );
  // Force family on the returned kpi (getObjectiveKpiSpec via synthetic is fine,
  // but keep family explicit).
  const kpiForced: ObjectiveKpiSpec = { ...kpi, family };

  return {
    family,
    objective,
    optimizationGoal: optGoal,
    kpi: kpiForced,
    labelAr: FAMILY_LABEL_AR[family],
    reason,
  };
}

/** Synthetic objective string so getObjectiveKpiSpec returns the right SPECS entry. */
function familyToSyntheticObjective(family: ObjectiveKpiFamily): string {
  switch (family) {
    case 'awareness':
      return 'OUTCOME_AWARENESS';
    case 'traffic':
      return 'OUTCOME_TRAFFIC';
    case 'engagement':
      return 'OUTCOME_ENGAGEMENT';
    case 'leads':
      return 'OUTCOME_LEADS';
    case 'sales':
      return 'OUTCOME_SALES';
    case 'messaging':
      return 'MESSAGES';
    case 'app':
      return 'OUTCOME_APP_PROMOTION';
  }
}

/** Convenience: purpose → KPI helpers already used across the API. */
export function purposeKpiSpec(input: CampaignPurposeInput): ObjectiveKpiSpec {
  return resolveCampaignPurpose(input).kpi;
}
