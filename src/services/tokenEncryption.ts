// ════════════════════════════════════════════════════════════════════════
//  src/services/tokenEncryption.ts
//
//  AES-256-GCM encryption for Meta access tokens stored in the database.
//
//  Key source: TOKEN_ENCRYPTION_KEY env var — 64 hex chars (32 bytes),
//  validated centrally in `src/config.ts`. If the key is absent, tokens are
//  stored as plaintext. This is acceptable for local development; set the key
//  in all other envs. A short, non-reversible key fingerprint is logged once
//  at boot (see config.reportConfig) so operators can confirm the running key
//  matches the one that encrypted the stored tokens.
//
//  Ciphertext format (all hex, ':' delimited):
//    <12-byte IV>:<16-byte auth-tag>:<ciphertext>
// ════════════════════════════════════════════════════════════════════════

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 12;   // 96-bit IV — standard for GCM
const SEP        = ':';

/**
 * Thrown when a stored ciphertext cannot be decrypted with the configured key.
 * Distinct, named error so a KEY MISMATCH is never silently confused with an
 * expired Meta token (which surfaces as a Graph API 190, not a crypto error).
 */
export class TokenDecryptError extends Error {
  readonly code = 'TOKEN_DECRYPT_FAILED';
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TokenDecryptError';
    this.cause = cause;
  }
}

/** Path to paste a fresh System User / long-lived token after a key rotation. */
export const TOKEN_DECRYPT_RECONNECT_URL = '/workspace?connect=manual';

/** User-facing message when decrypt fails — key changed or token encrypted with a different key. */
export const TOKEN_DECRYPT_USER_MESSAGE =
  'Stored access token could not be decrypted — the encryption key changed. Reconnect with a fresh Meta token in Workspace.';

/** JSON body for HTTP routes that surface decrypt failures to the client. */
export function tokenDecryptErrorJson(): {
  error: string;
  code: 'TOKEN_DECRYPT_FAILED';
  reconnectUrl: string;
  reconnectLabel: string;
} {
  return {
    error: TOKEN_DECRYPT_USER_MESSAGE,
    code: 'TOKEN_DECRYPT_FAILED',
    reconnectUrl: TOKEN_DECRYPT_RECONNECT_URL,
    reconnectLabel: 'Reconnect Meta',
  };
}

/** Meta long-lived / System User tokens are alphanumeric and typically start with EA. */
export function isLikelyMetaAccessToken(stored: string): boolean {
  if (!stored || stored.length < 32) return false;
  return /^EA[A-Za-z0-9]+$/.test(stored);
}

function getKey(): Buffer | null {
  return config.tokenEncryption.key;
}

/**
 * The key generation this process writes with. Stamp it alongside every
 * ciphertext you persist (`accessTokenKeyVersion`) so the question "which key
 * opens this row" is answerable from the data instead of by trial decryption.
 */
export const TOKEN_KEY_VERSION: number = config.tokenEncryption.keyVersion;

/**
 * Attempt a decryption with a specific key. Returns null on failure rather
 * than throwing, so the caller can try the next key without exceptions being
 * used for control flow.
 */
function tryDecryptWith(key: Buffer, ivHex: string, tagHex: string, dataHex: string): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    // GCM authentication failed: wrong key, or corrupted ciphertext. Which of
    // the two it is cannot be told apart here, and the caller decides.
    return null;
  }
}

/** True when `stored` matches the AES-256-GCM envelope (iv:tag:ciphertext hex). */
export function isEncryptedToken(stored: string): boolean {
  if (!stored || !stored.includes(SEP)) return false;
  const parts = stored.split(SEP);
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[0-9a-f]+$/i.test(part) && part.length > 0);
}

/**
 * Re-encrypt legacy plaintext tokens on the next persistence write.
 * Already-encrypted values are returned unchanged.
 */
export function ensureTokenEncrypted(stored: string): string {
  if (!stored) return stored;
  if (isEncryptedToken(stored)) return stored;
  return encryptToken(stored);
}

/**
 * Encrypt a plaintext token.
 * Returns the ciphertext string, or the original plaintext when no key is set.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // dev mode: store plaintext

  const iv       = randomBytes(IV_BYTES);
  const cipher   = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag      = cipher.getAuthTag();

  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(SEP);
}

/**
 * Decrypt a stored token.
 * Accepts both encrypted ciphertext and legacy plaintext tokens (no key set).
 * Returns plaintext.
 */
export function decryptToken(stored: string): string {
  if (!stored) return stored;

  // No encryption key — token was stored as plaintext
  const key = getKey();
  if (!key) return stored;

  // Plaintext stored before encryption was configured (no valid iv:tag:ciphertext envelope)
  if (!isEncryptedToken(stored)) return stored;

  const [ivHex, tagHex, dataHex] = stored.split(SEP) as [string, string, string];

  const current = tryDecryptWith(key, ivHex, tagHex, dataHex);
  if (current !== null) return current;

  // ── Rotation window ────────────────────────────────────────────────────
  // The current key did not open this row. If TOKEN_ENCRYPTION_KEY_PREVIOUS
  // is configured we are mid-rotation and this is expected for rows written
  // before the switch — read them with the outgoing key so the product keeps
  // working while they are re-encrypted, rather than presenting every client
  // with a reconnect banner on the day of the rotation.
  //
  // This widens nothing when no previous key is set, which is the default.
  const previous = config.tokenEncryption.previousKey;
  if (previous) {
    const legacy = tryDecryptWith(previous, ivHex, tagHex, dataHex);
    if (legacy !== null) {
      console.warn(
        '[adlytic:TOKEN_KEY_ROTATION] a stored token opened with the PREVIOUS key — ' +
        're-encrypt it under the current key and stamp accessTokenKeyVersion = ' +
        `${config.tokenEncryption.keyVersion}.`,
      );
      return legacy;
    }
  }

  // Neither key opened it — a genuine key mismatch or corrupted ciphertext.
  // We must NOT silently return the ciphertext: doing so makes a key problem
  // look like an expired/invalid Meta token (190). Log loudly with the key
  // fingerprint and throw a distinct error so callers can tell the two apart.
  const fp = config.tokenEncryption.keyFingerprint ?? '<none>';
  console.error(
    `[adlytic:TOKEN_DECRYPT_FAILED] Could not decrypt a stored token with the ` +
    `current key (fingerprint ${fp})${previous ? ' or the configured previous key' : ''}. ` +
    `This is a key mismatch or corrupted data, NOT a token expiry.`,
  );
  throw new TokenDecryptError(
    `Failed to decrypt stored token (key fingerprint ${fp}) — likely a TOKEN_ENCRYPTION_KEY mismatch`,
  );
}
