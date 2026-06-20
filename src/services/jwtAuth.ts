// ════════════════════════════════════════════════════════════════════════
//  src/services/jwtAuth.ts
//
//  Authentication primitives: bcrypt password hashing and JWT tokens.
//
//  PASSWORD STRATEGY
//  -----------------
//  New passwords are always hashed with bcrypt (12 rounds).
//  Existing SHA-256 hashes are detected by their hex-only, 64-char format.
//  On login, if a SHA-256 hash is verified successfully, it is immediately
//  upgraded to bcrypt — transparent to the user, no re-login required.
//
//  JWT STRATEGY
//  ------------
//  Tokens are signed with JWT_SECRET (min 32 chars).
//  Payload: { sub: userId, email, ver: tokenVersion }.
//  Default TTL: 7 days.
//  Revocation: incrementing `tokenVersion` on the User row invalidates all
//  outstanding tokens for that user. Used by "logout all devices" and
//  password change.
//
//  JWT_SECRET MUST be set in production. If absent in development, a
//  hard-coded insecure default is used with a loud console warning.
// ════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ── constants ─────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

/** Access token TTL.  7 days is long enough for a primary token. */
const JWT_EXPIRES_IN = '7d';

/** SHA-256 hex digest: exactly 64 lowercase hex characters. */
const SHA256_RE = /^[a-f0-9]{64}$/;

// ── secret resolution ─────────────────────────────────────────────────────

let _secret: string | null = null;

function getJwtSecret(): string {
  if (_secret) return _secret;
  const s = process.env['JWT_SECRET'] ?? '';
  if (s.length < 32) {
    if ((process.env['NODE_ENV'] ?? 'development') !== 'development') {
      // Fatal in production — don't start with an insecure key.
      console.error(
        '[adlytic:SECURITY] JWT_SECRET is missing or too short (must be ≥32 chars).\n' +
        '  Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
        '  Set JWT_SECRET in your Railway environment variables.'
      );
      process.exit(1);
    }
    console.warn('[adlytic] JWT_SECRET not configured — using insecure dev default. DO NOT USE IN PRODUCTION.');
    _secret = 'adlytic-insecure-dev-secret-do-not-use-in-production-ever';
  } else {
    _secret = s;
  }
  return _secret;
}

// ── passwords ─────────────────────────────────────────────────────────────

/** True when `hash` is a legacy SHA-256 hex digest (not bcrypt). */
export function isLegacySha256(hash: string): boolean {
  return SHA256_RE.test(hash);
}

/** Hash a plaintext password with bcrypt (12 rounds). */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a stored hash.
 *
 * Handles both bcrypt (new) and SHA-256 hex (legacy) formats.
 * `needsUpgrade = true` when the stored hash is legacy — caller should
 * re-hash with bcrypt and persist the new hash transparently.
 */
export async function verifyPassword(
  plaintext: string,
  storedHash: string,
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (isLegacySha256(storedHash)) {
    const sha = createHash('sha256').update(plaintext).digest('hex');
    return { ok: sha === storedHash, needsUpgrade: true };
  }
  const ok = await bcrypt.compare(plaintext, storedHash);
  return { ok, needsUpgrade: false };
}

// ── JWT ───────────────────────────────────────────────────────────────────

export interface TokenPayload {
  /** userId */
  sub: string;
  email: string;
  /** tokenVersion — must match User.tokenVersion for the token to be valid */
  ver: number;
  /** Standard JWT fields — present after verification */
  iat?: number;
  exp?: number;
}

/** Sign a new JWT access token for a user. */
export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verify and decode a JWT access token.
 * Returns the payload on success, or null on any failure (expired, wrong
 * signature, malformed, etc.).  Never throws.
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}
