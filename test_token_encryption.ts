/**
 * Token encryption: round-trip, legacy plaintext, key mismatch, and rotation.
 *
 * WHY THIS FILE SETS ITS OWN KEYS
 * It used to say `Run: TOKEN_ENCRYPTION_KEY=<64-hex> npx tsx …`, and nobody
 * ever did. Without a key `encryptToken` returns its input and `decryptToken`
 * returns its input, so "encrypt produces envelope" failed while "round-trip
 * decrypt" PASSED — two identity functions agreeing with each other. The suite
 * reported green on a code path it never executed, and that is the layer that
 * should have caught the key-mismatch incident (AUDIT-REPORT.md D-1).
 *
 * WHY ROTATION IS TESTED IN CHILD PROCESSES
 * src/config.ts reads process.env exactly once, at module load — that is the
 * point of it. Mutating env afterwards proves nothing. Each rotation scenario
 * therefore boots a fresh process with a different key configuration, which is
 * also precisely how a rotation reaches production: a redeploy.
 *
 * Run: npx tsx test_token_encryption.ts
 */
import { execFileSync } from 'node:child_process';

const KEY_GEN_1 = 'a'.repeat(64);
const KEY_GEN_2 = 'b'.repeat(64);

process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = KEY_GEN_1;
process.env.TOKEN_ENCRYPTION_KEY_VERSION = '1';

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  decryptToken,
  encryptToken,
  isEncryptedToken,
  isLikelyMetaAccessToken,
  TOKEN_KEY_VERSION,
  TokenDecryptError,
  tokenDecryptErrorJson,
} = require('./src/services/tokenEncryption') as typeof import('./src/services/tokenEncryption');

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

/** Boot a fresh process with `env` and return what `body` printed. */
function inChildProcess(env: Record<string, string | undefined>, body: string): string {
  const script =
    "const m = require('./src/services/tokenEncryption');\n" + body;
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  return execFileSync('npx', ['tsx', '-e', script], {
    env: childEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const sampleToken = 'EAA' + 'x'.repeat(40);

console.log('\n── tokenEncryption ──');

check('isLikelyMetaAccessToken accepts EA… token', isLikelyMetaAccessToken(sampleToken));
check('isLikelyMetaAccessToken rejects short strings', !isLikelyMetaAccessToken('EAAabc'));

// ── The path that was never executed ──────────────────────────────────
const encrypted = encryptToken(sampleToken);
check('a key IS configured — otherwise everything below is an identity test',
  encrypted !== sampleToken, encrypted);
check('encrypt produces envelope', isEncryptedToken(encrypted));
check('envelope is iv:tag:ciphertext, all hex', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(encrypted));
check('round-trip decrypt', decryptToken(encrypted) === sampleToken);
check('legacy plaintext decrypt (no envelope)', decryptToken(sampleToken) === sampleToken);
check('ciphertext is non-deterministic (fresh IV per call)',
  encryptToken(sampleToken) !== encryptToken(sampleToken));
check('this process reports its key generation', TOKEN_KEY_VERSION === 1, TOKEN_KEY_VERSION);

// ── A key mismatch must be LOUD ───────────────────────────────────────
// The whole purpose of TokenDecryptError. A ciphertext this key cannot open
// must never be handed back to the caller: a caller that receives a string
// treats it as a working Meta token and reports the eventual Graph failure as
// an expired token (190) — sending the operator to re-auth a customer whose
// token was fine, while the real cause goes unexamined.
{
  const foreign = 'aabbccddeeff00112233445566:0011223344556677889900aabbccddee:deadbeef';
  let threw: unknown = null;
  try { decryptToken(foreign); } catch (e) { threw = e; }
  check('a ciphertext this key cannot open THROWS', threw instanceof TokenDecryptError, threw);
}

// ── Rotation ──────────────────────────────────────────────────────────
{
  const gen2WithPrevious = inChildProcess(
    {
      TOKEN_ENCRYPTION_KEY: KEY_GEN_2,
      TOKEN_ENCRYPTION_KEY_PREVIOUS: KEY_GEN_1,
      TOKEN_ENCRYPTION_KEY_VERSION: '2',
    },
    `console.log(JSON.stringify({
       version: m.TOKEN_KEY_VERSION,
       legacyOpens: m.decryptToken(${JSON.stringify(encrypted)}) === ${JSON.stringify(sampleToken)},
       freshRoundTrips: m.decryptToken(m.encryptToken('x')) === 'x',
     }));`,
  ).split('\n').pop() as string;
  const r = JSON.parse(gen2WithPrevious) as { version: number; legacyOpens: boolean; freshRoundTrips: boolean };
  check('mid-rotation, this process writes generation 2', r.version === 2, r.version);
  check('mid-rotation, a generation-1 row STILL OPENS', r.legacyOpens);
  check('mid-rotation, new writes round-trip under the new key', r.freshRoundTrips);
}

{
  // Same generation-1 ciphertext, previous key withdrawn. It must now fail —
  // which proves the fallback above is what saved it, not coincidence, and
  // that dropping the old key is a real, observable end to the rotation.
  const withoutPrevious = inChildProcess(
    {
      TOKEN_ENCRYPTION_KEY: KEY_GEN_2,
      TOKEN_ENCRYPTION_KEY_PREVIOUS: undefined,
      TOKEN_ENCRYPTION_KEY_VERSION: '2',
    },
    `let name = 'none';
     try { m.decryptToken(${JSON.stringify(encrypted)}); }
     catch (e) { name = e && e.name; }
     console.log(JSON.stringify({ name }));`,
  ).split('\n').pop() as string;
  const r = JSON.parse(withoutPrevious) as { name: string };
  check('withdraw the previous key and the generation-1 row is undecryptable',
    r.name === 'TokenDecryptError', r.name);
}

check('tokenDecryptErrorJson reconnectUrl', tokenDecryptErrorJson().reconnectUrl === '/workspace?connect=manual');
check('tokenDecryptErrorJson code', tokenDecryptErrorJson().code === 'TOKEN_DECRYPT_FAILED');
check('TokenDecryptError code field', new TokenDecryptError('x').code === 'TOKEN_DECRYPT_FAILED');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
