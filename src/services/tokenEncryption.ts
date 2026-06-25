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

function getKey(): Buffer | null {
  return config.tokenEncryption.key;
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

  // Plaintext stored before encryption was configured
  if (!stored.includes(SEP)) return stored;

  const parts = stored.split(SEP);
  if (parts.length !== 3) return stored; // malformed — return as-is

  try {
    const [ivHex, tagHex, dataHex] = parts as [string, string, string];
    const iv      = Buffer.from(ivHex, 'hex');
    const tag     = Buffer.from(tagHex, 'hex');
    const data    = Buffer.from(dataHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    // Decryption failed — almost always a KEY MISMATCH (the prod key differs
    // from the one that encrypted this row) or corrupted ciphertext. We must
    // NOT silently return the ciphertext: doing so makes a key problem look
    // like an expired/invalid Meta token (190). Log loudly with the key
    // fingerprint and throw a distinct error so callers can tell the two apart.
    const fp = config.tokenEncryption.keyFingerprint ?? '<none>';
    console.error(
      `[adlytic:TOKEN_DECRYPT_FAILED] Could not decrypt a stored token with the ` +
      `current key (fingerprint ${fp}). This is a key mismatch or corrupted data, ` +
      `NOT a token expiry.`,
    );
    throw new TokenDecryptError(
      `Failed to decrypt stored token (key fingerprint ${fp}) — likely a TOKEN_ENCRYPTION_KEY mismatch`,
      err,
    );
  }
}
