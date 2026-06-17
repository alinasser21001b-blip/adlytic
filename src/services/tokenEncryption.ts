// ════════════════════════════════════════════════════════════════════════
//  src/services/tokenEncryption.ts
//
//  AES-256-GCM encryption for Meta access tokens stored in the database.
//
//  Key source: TOKEN_ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
//  If the key is absent, tokens are stored as plaintext.  This is
//  acceptable for local development; set the key in all other envs.
//
//  Ciphertext format (all hex, ':' delimited):
//    <12-byte IV>:<16-byte auth-tag>:<ciphertext>
// ════════════════════════════════════════════════════════════════════════

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 12;   // 96-bit IV — standard for GCM
const SEP        = ':';

function getKey(): Buffer | null {
  const hex = process.env['TOKEN_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
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
  } catch {
    // Decryption failed (wrong key, corrupted data) — return stored as-is
    // rather than throwing, to avoid crashing the server on a bad row.
    return stored;
  }
}
