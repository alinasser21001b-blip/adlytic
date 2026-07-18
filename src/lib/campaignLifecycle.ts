import { EntityStatus } from '@prisma/client';

/** How a campaign relates to live delivery — distinct from Meta `status`. */
export type DeliveryTier =
  | 'DELIVERING_TODAY'
  | 'DELIVERING_WINDOW'
  | 'DORMANT_ACTIVE'
  | 'NOT_DELIVERING'
  | 'PAUSED'
  | 'ARCHIVED'
  | 'DELETED';

/** Default window for "delivering" vs "dormant" classification. */
export const DELIVERY_WINDOW_DAYS = 30;

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
  spendWindowMinor?: number | bigint | null;
};

/**
 * Classify a campaign for UI + AI based on Meta's actual delivery state.
 * Only reports "delivering" when Meta confirms ACTIVE effective_status AND
 * there is real spend evidence: today's spend → DELIVERING_TODAY, otherwise
 * spend inside the delivery window → DELIVERING_WINDOW. ACTIVE with zero
 * spend across the whole window is DORMANT_ACTIVE.
 */
export function classifyCampaignDelivery(input: CampaignDeliveryInput): DeliveryTier {
  const status = String(input.status ?? '').toUpperCase();
  if (status === EntityStatus.DELETED || status === 'DELETED') return 'DELETED';
  if (status === EntityStatus.ARCHIVED || status === 'ARCHIVED') return 'ARCHIVED';
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

  // "Today" resets at the account-timezone midnight, hours before Meta
  // reports the new day's first spend — a campaign that is ACTIVE and spent
  // inside the window is still delivering, not dormant. Without this tier
  // every dashboard "active" count drops to zero right after midnight.
  const window = Number(input.spendWindowMinor ?? 0);
  if (isActive && window > 0) return 'DELIVERING_WINDOW';

  if (isActive) return 'DORMANT_ACTIVE';
  return 'PAUSED';
}

/** True when the campaign is actively delivering (today's or window spend). */
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
    PAUSED: 'Paused',
    ARCHIVED: 'Archived',
    DELETED: 'Deleted',
  };
  const ar: Record<DeliveryTier, string> = {
    DELIVERING_TODAY: 'تعمل',
    DELIVERING_WINDOW: 'تعمل',
    DORMANT_ACTIVE: 'نشطة بدون إنفاق',
    NOT_DELIVERING: 'لا تعمل',
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
      return tier === 'NOT_DELIVERING';
    case 'ARCHIVED':
      return tier === 'ARCHIVED';
    default:
      return true;
  }
}
