import {
  classifyCampaignDelivery,
  isDeliveringCampaign,
  matchesCampaignScope,
} from './src/lib/campaignLifecycle';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

// ── Count semantics (17 Meta active vs 4 delivering) ─────────────────────
check(
  'delivering count excludes dormant Meta-ACTIVE',
  [4, 13].reduce(
    (acc, n, i) => acc + (isDeliveringCampaign(i === 0 ? 'DELIVERING_WINDOW' : 'DORMANT_ACTIVE') ? 1 : 0),
    0,
  ) === 1,
);

check(
  'ARCHIVED excluded from live scope',
  matchesCampaignScope('ARCHIVED', 'live') === false
    && matchesCampaignScope('DELIVERING_WINDOW', 'live') === true,
);

check(
  'historical scope only archived/deleted',
  matchesCampaignScope('ARCHIVED', 'historical') === true
    && matchesCampaignScope('DELIVERING_WINDOW', 'historical') === false,
);

check(
  'DORMANT_ACTIVE is not delivering',
  !isDeliveringCampaign(classifyCampaignDelivery({
    status: 'ACTIVE',
    spendTodayMinor: 0,
    spendWindowMinor: 0,
  })),
);

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
process.exit(fail > 0 ? 1 : 0);
