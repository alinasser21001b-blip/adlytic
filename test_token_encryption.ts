/**
 * Token encryption round-trip + legacy plaintext handling.
 * Run: TOKEN_ENCRYPTION_KEY=<64-hex> npx tsx test_token_encryption.ts
 */
import {
  decryptToken,
  encryptToken,
  isEncryptedToken,
  isLikelyMetaAccessToken,
  TokenDecryptError,
  tokenDecryptErrorJson,
} from './src/services/tokenEncryption';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`, detail ?? '');
  }
}

const sampleToken = 'EAA' + 'x'.repeat(40);

console.log('\n── tokenEncryption ──');

check('isLikelyMetaAccessToken accepts EA… token', isLikelyMetaAccessToken(sampleToken));
check('isLikelyMetaAccessToken rejects short strings', !isLikelyMetaAccessToken('EAAabc'));

const encrypted = encryptToken(sampleToken);
check('encrypt produces envelope', isEncryptedToken(encrypted));
check('round-trip decrypt', decryptToken(encrypted) === sampleToken);
check('legacy plaintext decrypt (no envelope)', decryptToken(sampleToken) === sampleToken);

check('tokenDecryptErrorJson reconnectUrl', tokenDecryptErrorJson().reconnectUrl === '/workspace?connect=manual');
check('tokenDecryptErrorJson code', tokenDecryptErrorJson().code === 'TOKEN_DECRYPT_FAILED');
check('TokenDecryptError code field', new TokenDecryptError('x').code === 'TOKEN_DECRYPT_FAILED');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
