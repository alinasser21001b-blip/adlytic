import { EntityStatus } from '@prisma/client';

/** How a campaign relates to live delivery — distinct from Meta `status`. */
export type DeliveryTier =
  | 'DELIVERING_TODAY'
  | 'DELIVERING_WINDOW'
  | 'DORMANT_ACTIVE'
  | 'NOT_DELIVERING'
  | 'ACCOUNT_BLOCKED'
  | 'PAUSED'
  | 'ARCHIVED'
  | 'DELETED';

/** Default window for "delivering" vs "dormant" classification. */
export const DELIVERY_WINDOW_DAYS = 30;

/**
 * How many account-local calendar days (including today) count as "recent"
 * enough to keep DELIVERING_WINDOW after midnight. Day 0 = today, day 1 =
 * yesterday — so a campaign that spent yesterday still reads as delivering
 * when Meta has not yet reported today's first spend. Two or more consecutive
 * zero-spend days (typical of an unsettled/debt-stopped account) fall out of
 * this window and become DORMANT_ACTIVE instead of a false "تعمل".
 */
export const RECENT_DELIVERY_DAYS = 2;

/**
 * Meta effective_status values that indicate the campaign is NOT actually
 * delivering, even though our simplified EntityStatus may map to ACTIVE.
 */
const META_NOT_DELIVERING_STATUSES = new Set([
  'PAUSED',
  'CAMPAIGN_PAUSED',
  'ADSET_PAUSED',
  'PENDING_REVIEW',
  'PENDING_BILLING_INFO',
  'IN_PROCESS',
  'WITH_ISSUES',
  'DISAPPROVED',
  'PREAPPROVED',
  'DELETED',
  'ARCHIVED',
]);

export type CampaignDeliveryInput = {
  status: EntityStatus | string;
  metaEffectiveStatus?: string | null;
  spendTodayMinor?: number | bigint | null;
  /** Spend inside the full delivery window (default 30d). */
  spendWindowMinor?: number | bigint | null;
  /**
   * Spend inside the recent delivery window (today + yesterday). Required for
   * DELIVERING_WINDOW — 30d history alone must not keep a debt-stopped
   * campaign marked "تعمل".
   */
  spendRecentMinor?: number | bigint | null;
  /**
   * False when Meta's ad-account account_status blocks delivery (unsettled
   * balance, disabled, closed, …). Null/undefined = unknown → do not invent
   * an account block.
   */
  accountDeliverable?: boolean | null;
};

/**
 * Classify a campaign for UI + AI based on Meta's actual delivery state.
 * Only reports "delivering" when Meta confirms ACTIVE effective_status AND
 * there is real spend evidence: today's spend → DELIVERING_TODAY, otherwise
 * recent (today/yesterday) spend → DELIVERING_WINDOW. ACTIVE with older
 * window spend only is DORMANT_ACTIVE. Account-level billing blocks win over
 * every campaign-level signal.
 */
export function classifyCampaignDelivery(input: CampaignDeliveryInput): DeliveryTier {
  const status = String(input.status ?? '').toUpperCase();
  if (status === EntityStatus.DELETED || status === 'DELETED') return 'DELETED';
  if (status === EntityStatus.ARCHIVED || status === 'ARCHIVED') return 'ARCHIVED';

  // Account billing / disable gate — Meta can leave campaigns ACTIVE while
  // the whole ad account is unsettled. Those must never read as "تعمل".
  if (input.accountDeliverable === false) {
    return 'ACCOUNT_BLOCKED';
  }

  if (status === EntityStatus.PAUSED || status === 'PAUSED') return 'PAUSED';

  const metaEff = input.metaEffectiveStatus
    ? String(input.metaEffectiveStatus).toUpperCase()
    : null;

  // If Meta tells us the campaign is in a non-delivering state, trust that
  // over any spend history. This catches paused-at-ad-set-level, pending
  // review, billing issues, etc.
  if (metaEff && META_NOT_DELIVERING_STATUSES.has(metaEff)) {
    return 'NOT_DELIVERING';
  }

  const today = Number(input.spendTodayMinor ?? 0);
  if (today > 0) return 'DELIVERING_TODAY';

  const isActive = status === EntityStatus.ACTIVE || status === 'ACTIVE';

  // Midnight-safe recent window: ACTIVE + spend today-or-yesterday stays
  // delivering. Older 30d spend without recent activity is dormant — this is
  // what stops debt-frozen campaigns with a green "تعمل" badge.
  // Callers must pass spendRecentMinor (0 is meaningful). When omitted, fall
  // back to the full window so legacy call sites keep the prior midnight
  // contract until they are wired.
  const recent =
    input.spendRecentMinor !== undefined
      ? Number(input.spendRecentMinor ?? 0)
      : Number(input.spendWindowMinor ?? 0);
  if (isActive && recent > 0) return 'DELIVERING_WINDOW';

  if (isActive) return 'DORMANT_ACTIVE';
  return 'PAUSED';
}

/** True when the campaign is actively delivering (today's or recent window spend). */
export function isDeliveringCampaign(tier: DeliveryTier): boolean {
  return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW';
}

/** True for live operational views — excludes archived/deleted history. */
export function isLiveOperationalTier(tier: DeliveryTier): boolean {
  return tier !== 'ARCHIVED' && tier !== 'DELETED';
}

export function deliveryTierLabel(tier: DeliveryTier, locale: 'EN' | 'AR' = 'AR'): string {
  const en: Record<DeliveryTier, string> = {
    DELIVERING_TODAY: 'Delivering',
    DELIVERING_WINDOW: 'Delivering',
    DORMANT_ACTIVE: 'Active (not spending)',
    NOT_DELIVERING: 'Not delivering',
    ACCOUNT_BLOCKED: 'Stopped (billing)',
    PAUSED: 'Paused',
    ARCHIVED: 'Archived',
    DELETED: 'Deleted',
  };
  const ar: Record<DeliveryTier, string> = {
    DELIVERING_TODAY: 'تعمل',
    DELIVERING_WINDOW: 'تعمل',
    DORMANT_ACTIVE: 'نشطة بدون إنفاق',
    NOT_DELIVERING: 'لا تعمل',
    ACCOUNT_BLOCKED: 'متوقفة (ديون)',
    PAUSED: 'متوقفة',
    ARCHIVED: 'مؤرشفة',
    DELETED: 'محذوفة',
  };
  return locale === 'AR' ? ar[tier] : en[tier];
}

export type CampaignScopeFilter = 'live' | 'all' | 'historical';

/** Filter campaigns for list views — keeps old archived data out of "live" by default. */
export function matchesCampaignScope(
  tier: DeliveryTier,
  scope: CampaignScopeFilter,
): boolean {
  switch (scope) {
    case 'all':
      return true;
    case 'historical':
      return tier === 'ARCHIVED' || tier === 'DELETED';
    case 'live':
    default:
      return isLiveOperationalTier(tier);
  }
}

export type DeliveryFilter =
  | 'ALL'
  | 'DELIVERING'
  | 'TODAY'
  | 'DORMANT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'NOT_DELIVERING'
  | 'ARCHIVED';

export function matchesDeliveryFilter(tier: DeliveryTier, filter: DeliveryFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'DELIVERING':
      return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW';
    case 'TODAY':
      return tier === 'DELIVERING_TODAY';
    case 'DORMANT':
      return tier === 'DORMANT_ACTIVE';
    case 'ACTIVE':
      return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW' || tier === 'DORMANT_ACTIVE';
    case 'PAUSED':
      return tier === 'PAUSED';
    case 'NOT_DELIVERING':
      return tier === 'NOT_DELIVERING' || tier === 'ACCOUNT_BLOCKED';
    case 'ARCHIVED':
      return tier === 'ARCHIVED';
    default:
      return true;
  }
}
