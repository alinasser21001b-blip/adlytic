import {
  classifyCampaignDelivery,
  isDeliveringCampaign,
  matchesDeliveryFilter,
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

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
process.exit(fail > 0 ? 1 : 0);
