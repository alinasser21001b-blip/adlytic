// ════════════════════════════════════════════════════════════════════════
//  src/api/adminGuard.ts
//
//  Platform-admin authorization helper.
//
//  Mirrors the inline auth pattern used inside `buildRoutes` (verifyToken →
//  DB tokenVersion check → membership) but adds a platform-level allowlist
//  check on top. The allowlist lives in `PLATFORM_ADMIN_EMAILS` (env var,
//  CSV) — chosen over a DB column because the platform currently has a
//  single owner; promoting to a Boolean `isPlatformAdmin` column is a
//  trivial follow-up when ≥2 admins exist.
//
//  Contract — `requirePlatformAdmin(req, prisma)` returns:
//    • { ok: true, userId, email }         on success
//    • { ok: false, response: ApiResponse } when the route should respond
//      with the embedded ApiResponse directly (401/403/503)
//
//  503 is reserved for "PLATFORM_ADMIN_EMAILS is unset" — we refuse to serve
//  admin routes when the lock has no combination, rather than fail open.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { verifyToken } from '../services/jwtAuth';
import type { ApiRequest, ApiResponse } from './adapter';

export type AdminGuardResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: ApiResponse };

/**
 * Parse the CSV `PLATFORM_ADMIN_EMAILS` env var into a normalised Set.
 * Cached at module level — env doesn't change inside a single process.
 *
 * Returns null when the variable is missing/empty — the guard treats this
 * as "lock not installed" and refuses to serve (fail closed).
 */
let _allowlist: ReadonlySet<string> | null | undefined;
let _foldedAllowlist: ReadonlySet<string> | undefined;
function getAllowlist(): ReadonlySet<string> | null {
  if (_allowlist !== undefined) return _allowlist;
  const raw = process.env['PLATFORM_ADMIN_EMAILS'];
  if (!raw || raw.trim().length === 0) {
    _allowlist = null;
    return null;
  }
  const emails = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
  _allowlist = new Set(emails);
  return _allowlist;
}

/**
 * For tests / hot config reload only — clears the memoised env parse so the
 * next call re-reads PLATFORM_ADMIN_EMAILS. Not used by production code.
 */
export function _resetAdminAllowlistCache(): void {
  _allowlist = undefined;
  _foldedAllowlist = undefined;
}

/**
 * Comparison key for "is this address one a platform admin could sign in as?".
 * The guard itself compares `trim().toLowerCase()` (above, and in
 * requirePlatformAdmin); the extra NFKC step maps compatibility look-alikes
 * (full-width letters, ligatures, …) onto their plain form. It is used ONLY to
 * refuse signups, never to grant anything, so being wider than the guard is the
 * safe direction.
 */
function foldAddress(email: string): string {
  return email.trim().toLowerCase().normalize('NFKC').toLowerCase().trim();
}

function getFoldedAllowlist(): ReadonlySet<string> | null {
  const allowlist = getAllowlist();
  if (!allowlist) return null;
  if (_foldedAllowlist === undefined) _foldedAllowlist = new Set([...allowlist].map(foldAddress));
  return _foldedAllowlist;
}

/**
 * True when a public signup (or any self-service change of a user's address)
 * must be REFUSED because the address is, or reads as, a platform admin's.
 *
 *   1. `isPlatformAdminEmail(email)` — the exact predicate requirePlatformAdmin
 *      applies to a stored address. Any string for which it is true would make
 *      the new account an admin, so it can never be registered. Using the guard's
 *      own function (not a re-implementation) is what keeps the two from drifting.
 *   2. the NFKC-folded forms are equal — so a later widening of the guard's
 *      normalisation cannot silently re-open the door.
 *
 * Plus-addressing (`admin+x@…`) and dots (`a.dmin@…`) are NOT folded: the guard
 * compares whole addresses, so such an account is an ordinary customer and cannot
 * become an admin; refusing them would only lock the admin's own aliases out.
 *
 * Fails open when PLATFORM_ADMIN_EMAILS is unset — there is no admin to
 * impersonate and the guard itself fails closed (503) in that state.
 */
export function isReservedForPlatformAdmin(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  if (isPlatformAdminEmail(email)) return true;
  const folded = getFoldedAllowlist();
  return folded !== null && folded.has(foldAddress(email));
}

/**
 * Pure, no-IO check used by `/api/auth/me` to set `isPlatformAdmin` on the
 * response. The flag is a UI hint only — the real security boundary lives
 * inside `requirePlatformAdmin` which is called per admin route.
 *
 * Returns false when the env var is missing (fail closed for the UI hint too).
 */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = getAllowlist();
  if (!allowlist) return false;
  return allowlist.has(email.trim().toLowerCase());
}

/**
 * Verify the request carries a valid bearer token AND the resolved user is on
 * the platform-admin allowlist. Returns a discriminated result so the route
 * stays single-shaped: `if (!gate.ok) return c.json(gate.response.body, gate.response.status)`.
 */
export async function requirePlatformAdmin(
  req: ApiRequest,
  prisma: PrismaClient,
): Promise<AdminGuardResult> {
  const allowlist = getAllowlist();
  if (!allowlist) {
    // Fail closed. Logged once per process start so ops sees the misconfig.
    console.error('[adminGuard] PLATFORM_ADMIN_EMAILS is not set — admin routes locked');
    return {
      ok: false,
      response: {
        status: 503,
        body: { error: 'Admin surface is not configured on this server' },
      },
    };
  }

  if (!req.bearerToken) {
    return { ok: false, response: { status: 401, body: { error: 'Unauthorized' } } };
  }

  const payload = verifyToken(req.bearerToken);
  if (!payload) {
    return { ok: false, response: { status: 401, body: { error: 'Invalid token' } } };
  }

  // Revocation check — identical to inline `getUserId` in server.ts, plus
  // we pull the email here because the JWT payload may carry a stale one
  // (the user could rename/change-email and the token would still be valid
  // until tokenVersion bumps).
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true, email: true },
  });
  if (!user || user.tokenVersion !== payload.ver) {
    return { ok: false, response: { status: 401, body: { error: 'Invalid token' } } };
  }

  const email = user.email.trim().toLowerCase();
  if (!allowlist.has(email)) {
    return { ok: false, response: { status: 403, body: { error: 'Forbidden' } } };
  }

  return { ok: true, userId: payload.sub, email };
}
