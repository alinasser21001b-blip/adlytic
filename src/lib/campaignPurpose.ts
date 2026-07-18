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
   * Ad-set destination_type values (MESSENGER / WHATSAPP / INSTAGRAM_DIRECT /
   * WEBSITE / …). THE authoritative click-to-message signal: an ODAX
   * engagement campaign whose ads open a chat is a MESSAGES campaign even
   * when its ad sets optimize LINK_CLICKS or POST_ENGAGEMENT — Ads Manager
   * itself reports messaging results for these. Wins over everything else.
   */
  destinationTypes?: Array<string | null | undefined> | null;
  /**
   * Soft signal: window message count. Used ONLY when the campaign would
   * otherwise land on "engagement" — never overrides a clear
   * REACH / PURCHASE / LEADS optimization.
   */
  messagesWindow?: number | null;
  /**
   * Companion to messagesWindow for the evidence guard: incidental page
   * messages on a genuine boosted post must NOT flip it to "messages", so
   * the soft rule requires messages to be meaningful relative to clicks.
   */
  clicksWindow?: number | null;
}

export interface CampaignPurpose {
  /** Effective KPI family after destination/optimization-goal overrides. */
  family: ObjectiveKpiFamily;
  /** Raw Meta campaign objective (unchanged). */
  objective: string | null;
  /** Primary optimization goal that drove the override (if any). */
  optimizationGoal: string | null;
  /** Messaging destination that drove the override (if any). */
  destinationType: string | null;
  /** KPI spec for presentation + efficiency math. */
  kpi: ObjectiveKpiSpec;
  /** Arabic badge for the merchant (رسائل / وعي بالعلامة / …). */
  labelAr: string;
  /** Why we classified this way — for debugging / inspector. */
  reason: string;
  /** Merchant-facing Arabic explanation of the classification basis. */
  reasonAr: string;
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

/** Ad destinations that open a chat — the campaign is a MESSAGES campaign
 *  regardless of objective/optimization labels (Ads Manager behaves the same). */
const MESSAGING_DESTINATIONS = new Set([
  'MESSENGER',
  'WHATSAPP',
  'INSTAGRAM_DIRECT',
  'MESSAGING_APPS', // multi-destination click-to-message
]);

function pickMessagingDestination(
  destinations: Array<string | null | undefined> | null | undefined,
): string | null {
  for (const d of destinations ?? []) {
    const norm = normalizeGoal(d);
    if (MESSAGING_DESTINATIONS.has(norm)) return norm;
  }
  return null;
}

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

/** Merchant-facing Arabic names for messaging destinations. */
const DESTINATION_LABEL_AR: Record<string, string> = {
  MESSENGER: 'ماسنجر',
  WHATSAPP: 'واتساب',
  INSTAGRAM_DIRECT: 'رسائل إنستغرام',
  MESSAGING_APPS: 'تطبيقات المراسلة',
};

/**
 * Resolve merchant-facing purpose BEFORE choosing KPIs or Arabic labels.
 *
 * Priority (each rung fixes a real production mislabel):
 *   1. Messaging destination_type → messaging. THE authoritative signal:
 *      a click-to-WhatsApp campaign stays a messages campaign even when its
 *      ad sets optimize LINK_CLICKS or POST_ENGAGEMENT (Ads Manager agrees).
 *   2. Messaging optimization goal → messaging (even if objective is ENGAGEMENT)
 *   3. Other clear optimization goals → that family
 *   4. Campaign objective family
 *   5. Evidence: would-be-"engagement" campaign whose actual results are
 *      dominated by messaging conversations → messaging. Guarded against
 *      incidental page messages on genuine boosted posts (see below).
 */
export function resolveCampaignPurpose(input: CampaignPurposeInput): CampaignPurpose {
  const objective = input.objective != null ? String(input.objective) : null;
  const optGoal = pickPrimaryOptimizationGoal(input.optimizationGoals);
  const destination = pickMessagingDestination(input.destinationTypes);
  const fromOpt = familyFromOptimizationGoal(optGoal);
  const fromObj = objectiveKpiFamily(objective);

  let family: ObjectiveKpiFamily = fromObj;
  let reason = `objective:${fromObj}`;
  let reasonAr = 'حسب هدف الحملة المُعلن في Meta';

  if (destination) {
    family = 'messaging';
    reason = `destination:${destination}`;
    reasonAr = `إعلانات هذه الحملة تفتح محادثة (${DESTINATION_LABEL_AR[destination] ?? destination}) — تُقاس بالرسائل لا بالتفاعل`;
  } else if (fromOpt === 'messaging') {
    family = 'messaging';
    reason = `optimization_goal:${optGoal}`;
    reasonAr = 'مجموعات الإعلانات مُحسَّنة لبدء المحادثات — تُقاس بالرسائل';
  } else if (fromOpt != null) {
    // Optimization goal wins when it clearly disagrees with a vague engagement
    // objective, or when objective is missing.
    if (fromObj === 'engagement' || fromObj === 'messaging' || !objective) {
      family = fromOpt;
      reason = `optimization_goal:${optGoal}`;
      reasonAr = 'حسب هدف التحسين الفعلي لمجموعات الإعلانات';
    } else if (fromOpt !== fromObj) {
      // Strong opt goals (reach / purchase / leads) still win over mismatched objective.
      family = fromOpt;
      reason = `optimization_goal_override:${optGoal}`;
      reasonAr = 'حسب هدف التحسين الفعلي لمجموعات الإعلانات';
    }
  }

  // Evidence rung: the campaign landed on "engagement" (vague ODAX shell, or a
  // POST_ENGAGEMENT ad set on a click-to-message campaign whose destination
  // wasn't synced yet) but its ACTUAL results are messaging conversations.
  // Guard: messages must be meaningful — at least 3 AND at least 20% of clicks
  // — so a boosted post with two incidental page messages never flips.
  if (family === 'engagement') {
    const messages = Number(input.messagesWindow) || 0;
    const clicks = Number(input.clicksWindow) || 0;
    const meaningful = messages >= 3 && (clicks <= 0 || messages >= clicks * 0.2);
    if (meaningful) {
      family = 'messaging';
      reason = `evidence:messages=${messages},clicks=${clicks}`;
      reasonAr = 'نتائج الحملة الفعلية محادثات رسائل — صُنّفت كحملة رسائل';
    }
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
    destinationType: destination,
    kpi: kpiForced,
    labelAr: FAMILY_LABEL_AR[family],
    reason,
    reasonAr,
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
