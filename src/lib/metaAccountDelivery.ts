/**
 * Meta ad-account delivery gate.
 *
 * Campaign `effective_status` can stay ACTIVE while the ad account itself is
 * blocked (unpaid balance / unsettled billing / disabled). In that case every
 * campaign is a false "تعمل" unless we honour Meta's account_status.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-account
 */

/** Meta `account_status` numeric codes we treat as able to deliver ads. */
const DELIVERABLE_ACCOUNT_STATUSES = new Set<number>([
  1, // ACTIVE
  9, // IN_GRACE_PERIOD — Meta may still deliver briefly
]);

export type MetaAccountBlockReason =
  | 'DISABLED'
  | 'UNSETTLED'
  | 'PENDING_RISK_REVIEW'
  | 'PENDING_SETTLEMENT'
  | 'PENDING_CLOSURE'
  | 'CLOSED'
  | 'OTHER';

export interface MetaAccountDeliveryState {
  /** True when Meta may deliver ads for this account. */
  deliverable: boolean;
  metaAccountStatus: number | null;
  metaDisableReason: number | null;
  reason: MetaAccountBlockReason | null;
  labelAr: string;
  labelEn: string;
}

export function parseMetaAccountStatus(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function isMetaAccountDeliverable(
  accountStatus: number | null | undefined,
): boolean {
  // Unknown / not yet synced → do not invent a block (spend-recent heuristic
  // still protects against stale DELIVERING_WINDOW).
  if (accountStatus == null) return true;
  return DELIVERABLE_ACCOUNT_STATUSES.has(accountStatus);
}

export function metaAccountBlockReason(
  accountStatus: number | null | undefined,
): MetaAccountBlockReason | null {
  if (accountStatus == null || isMetaAccountDeliverable(accountStatus)) {
    return null;
  }
  switch (accountStatus) {
    case 2:
      return 'DISABLED';
    case 3:
      return 'UNSETTLED';
    case 7:
      return 'PENDING_RISK_REVIEW';
    case 8:
      return 'PENDING_SETTLEMENT';
    case 100:
      return 'PENDING_CLOSURE';
    case 101:
      return 'CLOSED';
    default:
      return 'OTHER';
  }
}

const REASON_LABELS: Record<
  MetaAccountBlockReason,
  { ar: string; en: string }
> = {
  DISABLED: {
    ar: 'الحساب معطّل في Meta — الحملات لا تُسلَّم',
    en: 'Ad account disabled on Meta — campaigns are not delivering',
  },
  UNSETTLED: {
    ar: 'الحساب متوقف بسبب ديون/فاتورة غير مسددة في Meta — الحملات لا تعمل',
    en: 'Ad account unsettled (unpaid Meta balance) — campaigns are not delivering',
  },
  PENDING_RISK_REVIEW: {
    ar: 'الحساب قيد مراجعة المخاطر في Meta — التسليم متوقف',
    en: 'Ad account pending Meta risk review — delivery stopped',
  },
  PENDING_SETTLEMENT: {
    ar: 'الحساب بانتظار تسوية مالية في Meta — الحملات متوقفة',
    en: 'Ad account pending settlement on Meta — campaigns stopped',
  },
  PENDING_CLOSURE: {
    ar: 'الحساب بانتظار الإغلاق في Meta — لا تسليم',
    en: 'Ad account pending closure on Meta — not delivering',
  },
  CLOSED: {
    ar: 'الحساب مغلق في Meta — لا تسليم',
    en: 'Ad account closed on Meta — not delivering',
  },
  OTHER: {
    ar: 'حساب الإعلانات غير قادر على التسليم في Meta',
    en: 'Ad account cannot deliver on Meta',
  },
};

/** Short badge copy for campaign rows (not the long banner). */
export const ACCOUNT_BLOCKED_BADGE = {
  ar: 'متوقفة (ديون)',
  en: 'Stopped (billing)',
} as const;

export function resolveMetaAccountDeliveryState(args: {
  metaAccountStatus?: number | null;
  metaDisableReason?: number | null;
}): MetaAccountDeliveryState {
  const metaAccountStatus = args.metaAccountStatus ?? null;
  const metaDisableReason = args.metaDisableReason ?? null;
  const deliverable = isMetaAccountDeliverable(metaAccountStatus);
  const reason = metaAccountBlockReason(metaAccountStatus);
  if (deliverable || !reason) {
    return {
      deliverable: true,
      metaAccountStatus,
      metaDisableReason,
      reason: null,
      labelAr: '',
      labelEn: '',
    };
  }
  const labels = REASON_LABELS[reason];
  return {
    deliverable: false,
    metaAccountStatus,
    metaDisableReason,
    reason,
    labelAr: labels.ar,
    labelEn: labels.en,
  };
}
