import { EntityStatus } from '@prisma/client';

/** How a campaign relates to live delivery — distinct from Meta `status`. */
export type DeliveryTier =
  | 'DELIVERING_TODAY'
  | 'DELIVERING_WINDOW'
  | 'ACCOUNT_HALTED'
  | 'DORMANT_ACTIVE'
  | 'NOT_DELIVERING'
  | 'PAUSED'
  | 'ARCHIVED'
  | 'DELETED';

/** Default window for "delivering" vs "dormant" classification. */
export const DELIVERY_WINDOW_DAYS = 30;

/**
 * How long after its last recorded spend a campaign may still be called
 * "delivering" without fresh evidence.
 *
 * DELIVERING_WINDOW exists for one documented reason: "today" resets at the
 * account-timezone midnight, hours before Meta reports the new day's first
 * spend. That justifies a grace of a day or two. It does NOT justify thirty:
 * before this constant existed, any spend inside the 30-day window kept the
 * present-tense «تعمل» pill lit, so an account suspended for unpaid bills
 * showed five campaigns "working" for a month while every sparkline
 * flat-lined at zero. A merchant read "working" while Meta was delivering
 * nothing.
 */
export const DELIVERY_GRACE_DAYS = 2;

/* ── Account-level delivery hold ─────────────────────────────────────────
   Meta's `account_status` is upstream of every campaign: an UNSETTLED
   account (unpaid balance) delivers nothing, whatever each campaign's own
   status says. This is the earliest-break rule applied one level higher
   than the funnel — an upstream break mechanically stops everything
   downstream, and blaming the campaigns is the default mistake.

   The codes are Meta's, documented on the AdAccount object. The mapping to
   "halted" lives HERE and only here, so no caller re-derives it. */
export const META_ACCOUNT_STATUS = {
  ACTIVE: 1,
  DISABLED: 2,
  UNSETTLED: 3,
  PENDING_RISK_REVIEW: 7,
  PENDING_SETTLEMENT: 8,
  IN_GRACE_PERIOD: 9,
  PENDING_CLOSURE: 100,
  CLOSED: 101,
} as const;

export type AccountDeliveryHold = {
  /** True when the account itself blocks all delivery. */
  halted: boolean;
  /** Meta account_status code, echoed for the operator. */
  code: number | null;
  /** Machine key for the UI to switch on. */
  kind:
    | 'NONE'
    | 'UNSETTLED'
    | 'DISABLED'
    | 'RISK_REVIEW'
    | 'PENDING_SETTLEMENT'
    | 'GRACE_PERIOD'
    | 'CLOSED'
    | 'UNKNOWN';
  /** Merchant-facing Arabic label. Written here so every surface says the
      same thing — a hold must never be worded three ways on one screen. */
  labelAr: string;
  /** What to DO about it, in the merchant's terms. */
  adviceAr: string;
};

const NO_HOLD: AccountDeliveryHold = {
  halted: false,
  code: META_ACCOUNT_STATUS.ACTIVE,
  kind: 'NONE',
  labelAr: '',
  adviceAr: '',
};

/**
 * Interpret Meta's account_status. `null`/`undefined` (status never synced)
 * is NOT a hold — absence of evidence is not evidence of a halt, the same
 * honesty rule the data observer follows in the other direction.
 */
export function accountDeliveryHold(metaAccountStatus: number | null | undefined): AccountDeliveryHold {
  if (metaAccountStatus == null) return NO_HOLD;
  switch (metaAccountStatus) {
    case META_ACCOUNT_STATUS.ACTIVE:
      return NO_HOLD;
    case META_ACCOUNT_STATUS.UNSETTLED:
      return {
        halted: true, code: metaAccountStatus, kind: 'UNSETTLED',
        labelAr: 'الحساب الإعلاني موقوف — رصيد غير مسدَّد لدى Meta',
        adviceAr: 'سدِّد الرصيد المستحق في إعدادات الفوترة لدى Meta ليعود العرض. الحملات لن تعمل قبل ذلك مهما كانت حالتها.',
      };
    case META_ACCOUNT_STATUS.DISABLED:
      return {
        halted: true, code: metaAccountStatus, kind: 'DISABLED',
        labelAr: 'الحساب الإعلاني معطَّل من قبل Meta',
        adviceAr: 'راجع «جودة الحساب» في Meta Business لمعرفة السبب وتقديم اعتراض إن لزم.',
      };
    case META_ACCOUNT_STATUS.PENDING_RISK_REVIEW:
      return {
        halted: true, code: metaAccountStatus, kind: 'RISK_REVIEW',
        labelAr: 'الحساب قيد مراجعة أمنية لدى Meta',
        adviceAr: 'أكمل خطوات التحقق المطلوبة في Meta Business. العرض متوقف حتى انتهاء المراجعة.',
      };
    case META_ACCOUNT_STATUS.PENDING_SETTLEMENT:
      return {
        halted: true, code: metaAccountStatus, kind: 'PENDING_SETTLEMENT',
        labelAr: 'الحساب بانتظار تسوية مالية لدى Meta',
        adviceAr: 'أكمل التسوية في إعدادات الفوترة ليعود العرض.',
      };
    case META_ACCOUNT_STATUS.PENDING_CLOSURE:
    case META_ACCOUNT_STATUS.CLOSED:
      return {
        halted: true, code: metaAccountStatus, kind: 'CLOSED',
        labelAr: 'الحساب الإعلاني مغلق لدى Meta',
        adviceAr: 'هذا الحساب لم يعد يعرض إعلانات. اربط حساباً آخر أو تواصل مع Meta لإعادة فتحه.',
      };
    case META_ACCOUNT_STATUS.IN_GRACE_PERIOD:
      // Grace period: Meta may still deliver while the debt ages. A warning,
      // not a halt — calling it halted would be inventing a stop that has
      // not happened yet.
      return {
        halted: false, code: metaAccountStatus, kind: 'GRACE_PERIOD',
        labelAr: 'الحساب في مهلة سداد لدى Meta — سيتوقف العرض إذا لم يُسدَّد الرصيد',
        adviceAr: 'سدِّد الرصيد قبل انتهاء المهلة لتجنّب توقف كل الحملات.',
      };
    default:
      // An unrecognised non-ACTIVE code: report it as a hold of unknown kind
      // rather than silently treating it as healthy. Meta adds codes; "we do
      // not know" must never render as "everything is fine".
      return {
        halted: true, code: metaAccountStatus, kind: 'UNKNOWN',
        labelAr: `حالة الحساب لدى Meta غير اعتيادية (رمز ${metaAccountStatus}) — العرض متوقف على الأرجح`,
        adviceAr: 'تحقق من حالة الحساب في Meta Business Manager.',
      };
  }
}

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
  /**
   * Days since this campaign last recorded spend (account timezone).
   * null/undefined = unknown — the caller could not cheaply compute it, and
   * the classifier then behaves exactly as before this field existed.
   */
  daysSinceLastSpend?: number | null;
  /**
   * The account-level gate, from accountDeliveryHold(). When the ACCOUNT is
   * halted (unsettled bills, disabled, closed), no campaign on it delivers.
   */
  accountHalted?: boolean;
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

  // ── The account gate, before any campaign-level evidence ──────────────
  // An UNSETTLED or DISABLED account delivers nothing. This outranks even
  // spendTodayMinor: money recorded earlier today was spent BEFORE the halt
  // was observed, and the question this tier answers is "is it delivering
  // NOW". Before this gate existed, five campaigns on an account suspended
  // for unpaid bills rendered «تعمل» for a month.
  if (input.accountHalted) return 'ACCOUNT_HALTED';

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
  // VERY RECENTLY is still delivering, not dormant. That is the whole
  // justification for this tier, and it bounds it: the grace is
  // DELIVERY_GRACE_DAYS, not the 30-day window. A campaign whose last spend
  // is older than the grace has stopped — billing hold, lost auction,
  // exhausted budget — and present-tense "delivering" would be a lie the
  // sparkline contradicts on the same row. When recency is unknown
  // (daysSinceLastSpend == null) the window keeps its old meaning, so
  // callers that cannot compute recency lose nothing.
  const window = Number(input.spendWindowMinor ?? 0);
  if (isActive && window > 0) {
    const days = input.daysSinceLastSpend;
    if (days == null || days <= DELIVERY_GRACE_DAYS) return 'DELIVERING_WINDOW';
    return 'DORMANT_ACTIVE';
  }

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
    ACCOUNT_HALTED: 'Halted — account-level hold',
    DORMANT_ACTIVE: 'Active (not spending)',
    NOT_DELIVERING: 'Not delivering',
    PAUSED: 'Paused',
    ARCHIVED: 'Archived',
    DELETED: 'Deleted',
  };
  const ar: Record<DeliveryTier, string> = {
    DELIVERING_TODAY: 'تعمل',
    DELIVERING_WINDOW: 'تعمل',
    ACCOUNT_HALTED: 'متوقفة — الحساب موقوف',
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
