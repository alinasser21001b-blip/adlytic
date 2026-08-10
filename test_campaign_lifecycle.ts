import {
  accountDeliveryHold,
  classifyCampaignDelivery,
  DELIVERY_GRACE_DAYS,
  isDeliveringCampaign,
  matchesDeliveryFilter,
  META_ACCOUNT_STATUS,
  type DeliveryFilter,
  type DeliveryTier,
} from './src/lib/campaignLifecycle';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`);
  }
}

check(
  'DELIVERING_TODAY when active + spend today',
  classifyCampaignDelivery({ status: 'ACTIVE', spendTodayMinor: 100, spendWindowMinor: 500 }) === 'DELIVERING_TODAY',
);
check(
  'DELIVERING_WINDOW when active + window spend only',
  classifyCampaignDelivery({ status: 'ACTIVE', spendTodayMinor: 0, spendWindowMinor: 500 }) === 'DELIVERING_WINDOW',
);
check(
  'DORMANT_ACTIVE when active + no spend',
  classifyCampaignDelivery({ status: 'ACTIVE', spendTodayMinor: 0, spendWindowMinor: 0 }) === 'DORMANT_ACTIVE',
);
check(
  '17 Meta active → 4 delivering scenario',
  (() => {
    const tiers: DeliveryTier[] = [
      ...Array(4).fill('DELIVERING_WINDOW'),
      ...Array(13).fill('DORMANT_ACTIVE'),
    ] as DeliveryTier[];
    const delivering = tiers.filter(isDeliveringCampaign).length;
    const dormant = tiers.filter((t) => t === 'DORMANT_ACTIVE').length;
    return delivering === 4 && dormant === 13;
  })(),
);

check('DELIVERING filter matches today + window', matchesDeliveryFilter('DELIVERING_WINDOW', 'DELIVERING'));
check('DELIVERING filter excludes dormant', !matchesDeliveryFilter('DORMANT_ACTIVE', 'DELIVERING'));
check('DORMANT filter', matchesDeliveryFilter('DORMANT_ACTIVE', 'DORMANT'));

// Regression: just after account-timezone midnight, today's spend is 0 for
// every campaign (Meta has not reported the new day yet) but the campaign is
// running in Meta. It must stay "delivering", never drop to zero.
check(
  'midnight: active + window spend + zero today stays delivering',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    metaEffectiveStatus: 'ACTIVE',
    spendTodayMinor: 0,
    spendWindowMinor: 1_250_000,
  }) === 'DELIVERING_WINDOW',
);
check(
  'midnight: Meta-paused campaign with window spend is NOT delivering',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    metaEffectiveStatus: 'ADSET_PAUSED',
    spendTodayMinor: 0,
    spendWindowMinor: 1_250_000,
  }) === 'NOT_DELIVERING',
);
check(
  'isDeliveringCampaign covers window tier',
  isDeliveringCampaign('DELIVERING_WINDOW') && isDeliveringCampaign('DELIVERING_TODAY') && !isDeliveringCampaign('DORMANT_ACTIVE'),
);
check('ACTIVE filter includes window tier', matchesDeliveryFilter('DELIVERING_WINDOW', 'ACTIVE'));
check('TODAY filter stays today-only', !matchesDeliveryFilter('DELIVERING_WINDOW', 'TODAY'));

// ════ THE FALSE-STATE REGRESSION (unpaid-bills incident) ════════════════
//
// A real account: Meta suspended it for an unsettled balance mid-window.
// Every campaign was ACTIVE, every campaign had spend earlier in the 30-day
// window, every sparkline flat-lined — and the product showed five green
// «تعمل» pills for a month. Two independent defences must both hold.

// Defence 1: the account gate. UNSETTLED delivers nothing, whatever the
// campaign's own status and spend history say — even same-day spend, which
// was recorded BEFORE the halt was observed.
check(
  'UNSETTLED account: window spend does NOT read as delivering',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    metaEffectiveStatus: 'ACTIVE',
    spendTodayMinor: 0,
    spendWindowMinor: 3_475_000,
    accountHalted: accountDeliveryHold(META_ACCOUNT_STATUS.UNSETTLED).halted,
  }) === 'ACCOUNT_HALTED',
);
check(
  'UNSETTLED account: even TODAY spend does not read as delivering',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    spendTodayMinor: 90_000,
    spendWindowMinor: 3_475_000,
    accountHalted: true,
  }) === 'ACCOUNT_HALTED',
);
check(
  'a halted account is not "delivering" to any consumer',
  !isDeliveringCampaign('ACCOUNT_HALTED'),
);

// Defence 2: recency. DELIVERING_WINDOW exists for the midnight-reset gap,
// which justifies a grace of DELIVERY_GRACE_DAYS — not the 30-day window.
// This catches the same incident even when account_status has not synced yet.
check(
  'spend 5 days ago is NOT present-tense delivering',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    metaEffectiveStatus: 'ACTIVE',
    spendTodayMinor: 0,
    spendWindowMinor: 3_475_000,
    daysSinceLastSpend: 5,
  }) === 'DORMANT_ACTIVE',
);
check(
  'spend within the grace stays delivering (midnight-reset case)',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    metaEffectiveStatus: 'ACTIVE',
    spendTodayMinor: 0,
    spendWindowMinor: 500,
    daysSinceLastSpend: DELIVERY_GRACE_DAYS,
  }) === 'DELIVERING_WINDOW',
);
check(
  'unknown recency preserves the old meaning (callers that cannot compute it lose nothing)',
  classifyCampaignDelivery({
    status: 'ACTIVE',
    spendTodayMinor: 0,
    spendWindowMinor: 500,
    daysSinceLastSpend: null,
  }) === 'DELIVERING_WINDOW',
);

// The hold interpreter itself.
check('ACTIVE account is not a hold', !accountDeliveryHold(META_ACCOUNT_STATUS.ACTIVE).halted);
check('never-synced status is not a hold — absence of evidence is not a halt',
  !accountDeliveryHold(null).halted);
check('UNSETTLED names the debt in Arabic',
  accountDeliveryHold(META_ACCOUNT_STATUS.UNSETTLED).labelAr.includes('رصيد غير مسدَّد'));
check('grace period warns but does not halt',
  (() => { const h = accountDeliveryHold(META_ACCOUNT_STATUS.IN_GRACE_PERIOD); return !h.halted && h.kind === 'GRACE_PERIOD'; })());
check('an UNKNOWN non-active code halts rather than passing as healthy',
  accountDeliveryHold(999).halted && accountDeliveryHold(999).kind === 'UNKNOWN');

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
process.exit(fail > 0 ? 1 : 0);
