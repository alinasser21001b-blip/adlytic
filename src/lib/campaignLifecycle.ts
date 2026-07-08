import { EntityStatus } from '@prisma/client';

/** How a campaign relates to live delivery — distinct from Meta `status`. */
export type DeliveryTier =
  | 'DELIVERING_TODAY'
  | 'DELIVERING_WINDOW'
  | 'DORMANT_ACTIVE'
  | 'PAUSED'
  | 'ARCHIVED'
  | 'DELETED';

/** Default window for "delivering" vs "dormant" classification. */
export const DELIVERY_WINDOW_DAYS = 30;

export type CampaignDeliveryInput = {
  status: EntityStatus | string;
  spendTodayMinor?: number | bigint | null;
  spendWindowMinor?: number | bigint | null;
};

/**
 * Classify a campaign for UI + AI. Meta often leaves campaigns ACTIVE while
 * they are not delivering — those become DORMANT_ACTIVE until spend resumes.
 */
export function classifyCampaignDelivery(input: CampaignDeliveryInput): DeliveryTier {
  const status = String(input.status ?? '').toUpperCase();
  if (status === EntityStatus.DELETED || status === 'DELETED') return 'DELETED';
  if (status === EntityStatus.ARCHIVED || status === 'ARCHIVED') return 'ARCHIVED';
  if (status === EntityStatus.PAUSED || status === 'PAUSED') return 'PAUSED';

  const today = Number(input.spendTodayMinor ?? 0);
  if (today > 0) return 'DELIVERING_TODAY';

  const windowSpend = Number(input.spendWindowMinor ?? 0);
  if (windowSpend > 0) return 'DELIVERING_WINDOW';

  if (status === EntityStatus.ACTIVE || status === 'ACTIVE') return 'DORMANT_ACTIVE';
  return 'PAUSED';
}

/** True when the campaign is actively delivering in the selected window. */
export function isDeliveringCampaign(tier: DeliveryTier): boolean {
  return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW';
}

/** True for live operational views — excludes archived/deleted history. */
export function isLiveOperationalTier(tier: DeliveryTier): boolean {
  return tier !== 'ARCHIVED' && tier !== 'DELETED';
}

export function deliveryTierLabel(tier: DeliveryTier, locale: 'EN' | 'AR' = 'AR'): string {
  const en: Record<DeliveryTier, string> = {
    DELIVERING_TODAY: 'Spending today',
    DELIVERING_WINDOW: 'Delivering',
    DORMANT_ACTIVE: 'Active (no spend)',
    PAUSED: 'Paused',
    ARCHIVED: 'Archived',
    DELETED: 'Deleted',
  };
  const ar: Record<DeliveryTier, string> = {
    DELIVERING_TODAY: 'تنفق اليوم',
    DELIVERING_WINDOW: 'تعمل',
    DORMANT_ACTIVE: 'نشطة بدون إنفاق',
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
  | 'ARCHIVED';

export function matchesDeliveryFilter(tier: DeliveryTier, filter: DeliveryFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'DELIVERING':
      return isDeliveringCampaign(tier);
    case 'TODAY':
      return tier === 'DELIVERING_TODAY';
    case 'DORMANT':
      return tier === 'DORMANT_ACTIVE';
    case 'ACTIVE':
      return tier === 'DELIVERING_TODAY' || tier === 'DELIVERING_WINDOW' || tier === 'DORMANT_ACTIVE';
    case 'PAUSED':
      return tier === 'PAUSED';
    case 'ARCHIVED':
      return tier === 'ARCHIVED';
    default:
      return true;
  }
}
