// Unit tests for manual account activation helpers.
import { isUserActive, ACCOUNT_INACTIVE_BODY } from './src/services/accountAccess';
import { buildActivationWhatsappLink } from './src/services/activationWhatsappLink';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

console.log('\n── isUserActive ──');
check('null → false', isUserActive(null) === false);
check('undefined → false', isUserActive(undefined) === false);
check('isActive true → true', isUserActive({ isActive: true }) === true);
check('isActive false → false', isUserActive({ isActive: false }) === false);

console.log('\n── ACCOUNT_INACTIVE_BODY ──');
check('has code', ACCOUNT_INACTIVE_BODY.code === 'ACCOUNT_INACTIVE');
check('redirect path', ACCOUNT_INACTIVE_BODY.redirect === '/pending-activation');

console.log('\n── buildActivationWhatsappLink ──');
process.env['SUPPORT_WHATSAPP_NUMBER'] = '+964 770 123 4567';
const link = buildActivationWhatsappLink('user@example.com');
check('wa.me base', link.url.startsWith('https://wa.me/9647701234567?text='));
check('message includes email', link.message.includes('user@example.com'));
check('message mentions activation', /activate my Adlytic account/i.test(link.message));
check('message never asks for password', !/password/i.test(link.message));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
