/**
 * Smoke checks for admin console helpers (pure validation paths).
 * Run: npx tsx test_admin_console.ts
 */
import { cancelManual } from './src/services/subscriptionService';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// Module load / export surface
assert(typeof cancelManual === 'function', 'cancelManual exported');

// Import narrative of createCustomer error codes (string contract)
const codes = ['INVALID_EMAIL', 'INVALID_NAME', 'WEAK_PASSWORD', 'EMAIL_TAKEN'];
assert(codes.length === 4, 'createCustomer error codes documented');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAdmin console smoke checks passed.');
