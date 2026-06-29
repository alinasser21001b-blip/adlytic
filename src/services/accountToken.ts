// ════════════════════════════════════════════════════════════════════════
//  src/services/accountToken.ts
//
//  Phase 2 — shared token-resolution + 190-handling for ad accounts.
//
//  An AdAccount's authoritative access token can live in one of two places:
//    • Legacy / user-OAuth / direct / manual accounts → the (possibly
//      expiring) token on the AdAccount row itself (`accessTokenEncrypted`).
//    • System User accounts (tokenSource = SYSTEM_USER) → the non-expiring
//      token on the linked MetaConnection.
//
//  Both the background auto-sync (serve.ts) and the manual "Sync now" route
//  (server.ts) need this exact same logic, so it lives here once. These
//  helpers perform no decryption — callers decrypt the returned ciphertext
//  with their own `TokenDecryptError` handling, because the response on a
//  decrypt failure differs (auto-sync skips the account; the HTTP route
//  returns an error to the client).
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { invalidateCachedTokenHealth } from './cachedTokenHealth';

/** Minimal shape needed to resolve which encrypted token an account uses. */
export interface AccountTokenInput {
  accessTokenEncrypted: string | null;
  /** MetaTokenSource enum value at runtime is its string, e.g. 'SYSTEM_USER'. */
  tokenSource: string;
  connectionId: string | null;
  /**
   * Optionally pre-loaded MetaConnection. `undefined` = not loaded (the helper
   * will query it); `null` = loaded but absent. Auto-sync selects this inline
   * to avoid an extra round-trip.
   */
  connection?: { accessTokenEncrypted: string | null } | null;
}

export interface ResolvedAccountToken {
  /** Encrypted token ciphertext to decrypt, or null when none is available. */
  encrypted: string | null;
  /** True when this account draws its token from a MetaConnection. */
  isSystemUser: boolean;
  /** The MetaConnection id (system-user accounts only), else null. */
  connectionId: string | null;
}

/**
 * Resolve WHICH encrypted token an account should use for syncing. For
 * SYSTEM_USER accounts with a connectionId, loads the MetaConnection token
 * (unless already provided); everyone else uses the per-account token. Does
 * NOT decrypt — the caller decrypts and handles TokenDecryptError.
 */
export async function resolveAccountToken(
  prisma: PrismaClient,
  account: AccountTokenInput,
): Promise<ResolvedAccountToken> {
  const isSystemUser = account.tokenSource === 'SYSTEM_USER' && !!account.connectionId;
  if (!isSystemUser) {
    return {
      encrypted: account.accessTokenEncrypted,
      isSystemUser: false,
      connectionId: account.connectionId ?? null,
    };
  }

  let connection = account.connection;
  if (connection === undefined) {
    connection = await prisma.metaConnection.findUnique({
      where: { id: account.connectionId as string },
      select: { accessTokenEncrypted: true },
    });
  }
  return {
    encrypted: connection?.accessTokenEncrypted ?? null,
    isSystemUser: true,
    connectionId: account.connectionId ?? null,
  };
}

/**
 * Handle a Meta 190 (expired/invalid token) consistently across sync paths:
 *   • SYSTEM_USER accounts → flag the MetaConnection NEEDS_REGRANT. The token
 *     is not "expired"; the business must re-grant assets. The account is left
 *     ACTIVE so it resumes automatically once the connection is re-granted.
 *   • Everyone else        → PAUSE the account and null its token; the owner
 *     must reconnect.
 */
export async function handleMeta190(
  prisma: PrismaClient,
  params: {
    accountId: string;
    externalAccountId: string;
    isSystemUser: boolean;
    connectionId: string | null;
    workspaceId: string;
  },
): Promise<void> {
  if (params.isSystemUser && params.connectionId) {
    await prisma.metaConnection.update({
      where: { id: params.connectionId },
      data: { status: 'NEEDS_REGRANT' },
    });
    console.warn(
      `[adlytic:sync] MetaConnection for ${params.externalAccountId} set NEEDS_REGRANT — System User access must be re-granted (190).`,
    );
  } else {
    await prisma.adAccount.update({
      where: { id: params.accountId },
      data: { status: 'PAUSED', accessTokenEncrypted: null },
    });
    console.warn(
      `[adlytic:sync] Marked ${params.externalAccountId} PAUSED — token invalid (190). Owner must reconnect.`,
    );
  }

  // P3-13 — bust the read-through token-health cache so the next probe
  // returns the new PAUSED/NEEDS_REGRANT state without waiting for TTL.
  await invalidateCachedTokenHealth(params.workspaceId);
}
