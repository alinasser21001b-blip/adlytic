import {
  isMetaAccountDeliverable,
  metaAccountBlockReason,
  parseMetaAccountStatus,
  resolveMetaAccountDeliveryState,
  ACCOUNT_BLOCKED_BADGE,
} from './src/lib/metaAccountDelivery';

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

console.log('\n── metaAccountDelivery ──');
check('parse number', parseMetaAccountStatus('3') === 3);
check('parse null', parseMetaAccountStatus(null) === null);
check('ACTIVE deliverable', isMetaAccountDeliverable(1));
check('IN_GRACE deliverable', isMetaAccountDeliverable(9));
check('UNSETTLED blocked', !isMetaAccountDeliverable(3));
check('DISABLED blocked', !isMetaAccountDeliverable(2));
check('CLOSED blocked', !isMetaAccountDeliverable(101));
check('null status does not invent block', isMetaAccountDeliverable(null));
check('UNSETTLED reason', metaAccountBlockReason(3) === 'UNSETTLED');
check(
  'resolve unsettled Arabic',
  resolveMetaAccountDeliveryState({ metaAccountStatus: 3 }).labelAr.includes('ديون'),
);
check(
  'resolve active deliverable',
  resolveMetaAccountDeliveryState({ metaAccountStatus: 1 }).deliverable === true,
);
check('badge AR', ACCOUNT_BLOCKED_BADGE.ar === 'متوقفة (ديون)');

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
process.exit(fail > 0 ? 1 : 0);
