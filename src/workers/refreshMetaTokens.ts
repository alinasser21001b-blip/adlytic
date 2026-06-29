// ════════════════════════════════════════════════════════════════════════
//  src/workers/refreshMetaTokens.ts
//
//  Periodic pass: re-exchange USER_OAUTH Meta tokens that expire within N
//  days via getLongLivedToken() (server-side, no re-consent). Fully expired
//  tokens are flagged PAUSED so the UI prompts reconnection. System User
//  tokens (tokenSource = SYSTEM_USER) are skipped — they never expire.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { buildMetaOAuth } from '../services/metaOAuth';
import { decryptToken, encryptToken, TokenDecryptError } from '../services/tokenEncryption';

/** Refresh tokens expiring within this window (default 7 days). */
const REFRESH_THRESHOLD_MS = 7 * 864e5;

async function flagAccountNeedsRegrant(
  prisma: PrismaClient,
  accountId: string,
  externalAccountId: string,
  workspaceId: string,
): Promise<void> {
  // AdAccount has no NEEDS_REGRANT enum — PAUSE + clear token matches the
  // existing 190-handling contract and surfaces reconnect in the workspace UI.
  await prisma.adAccount.update({
    where: { id: accountId },
    data: { status: 'PAUSED', accessTokenEncrypted: null },
  });
  console.warn(
    `[adlytic:token-refresh] workspaceId=${workspaceId} adAccountId=${accountId} ` +
    `externalAccountId=${externalAccountId} — marked PAUSED (token expired); owner must reconnect.`,
  );
}

/** Decrypt failure — key mismatch; PAUSE so UI prompts reconnect (keep ciphertext for ops). */
async function flagAccountDecryptFailed(
  prisma: PrismaClient,
  accountId: string,
  externalAccountId: string,
  workspaceId: string,
  detail: string,
): Promise<void> {
  await prisma.adAccount.update({
    where: { id: accountId },
    data: { status: 'PAUSED' },
  });
  console.error(
    `[adlytic:TOKEN_DECRYPT_FAILED][token-refresh] workspaceId=${workspaceId} ` +
    `adAccountId=${accountId} externalAccountId=${externalAccountId} — ${detail}`,
  );
}

function isTokenRefreshError(msg: string): boolean {
  return /code.*190|190.*code|OAuthException|expired|invalid.*token/i.test(msg);
}

/**
 * Refresh USER_OAUTH tokens nearing expiry; flag fully expired accounts for
 * re-grant. No-op when Meta OAuth env is not configured.
 */
export async function refreshExpiringMetaTokens(prisma: PrismaClient): Promise<void> {
  const oauth = buildMetaOAuth();
  if (!oauth) {
    console.warn('[adlytic:token-refresh] Meta OAuth not configured — skipping');
    return;
  }

  const now = new Date();
  const threshold = new Date(now.getTime() + REFRESH_THRESHOLD_MS);

  let expired;
  let expiring;
  try {
    [expired, expiring] = await Promise.all([
      prisma.adAccount.findMany({
        where: {
          tokenSource: { not: 'SYSTEM_USER' },
          accessTokenEncrypted: { not: null },
          tokenExpiresAt: { not: null, lte: now },
          status: 'ACTIVE',
        },
        select: { id: true, workspaceId: true, externalAccountId: true },
      }),
      prisma.adAccount.findMany({
        where: {
          tokenSource: { not: 'SYSTEM_USER' },
          accessTokenEncrypted: { not: null },
          tokenExpiresAt: { gt: now, lte: threshold },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          workspaceId: true,
          externalAccountId: true,
          accessTokenEncrypted: true,
        },
      }),
    ]);
  } catch (err) {
    console.error('[adlytic:token-refresh] Failed to list accounts:', err);
    return;
  }

  if (expired.length === 0 && expiring.length === 0) return;

  console.log(
    `[adlytic:token-refresh] ${expiring.length} to refresh, ${expired.length} fully expired`,
  );

  for (const acct of expired) {
    await flagAccountNeedsRegrant(prisma, acct.id, acct.externalAccountId, acct.workspaceId);
  }

  for (const acct of expiring) {
    let currentToken: string;
    try {
      currentToken = decryptToken(acct.accessTokenEncrypted as string);
    } catch (decErr) {
      if (decErr instanceof TokenDecryptError) {
        await flagAccountDecryptFailed(
          prisma,
          acct.id,
          acct.externalAccountId,
          acct.workspaceId,
          decErr.message,
        );
        continue;
      }
      throw decErr;
    }

    try {
      const { token, expiresInSeconds } = await oauth.getLongLivedToken(currentToken);
      const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      await prisma.adAccount.update({
        where: { id: acct.id },
        data: {
          accessTokenEncrypted: encryptToken(token),
          tokenExpiresAt,
        },
      });
      console.log(
        `[adlytic:token-refresh] ✓ ${acct.externalAccountId} refreshed — expires ${tokenExpiresAt.toISOString()}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[adlytic:token-refresh] ✗ ${acct.externalAccountId}: ${msg}`);
      if (isTokenRefreshError(msg)) {
        await flagAccountNeedsRegrant(prisma, acct.id, acct.externalAccountId, acct.workspaceId);
      }
    }
  }
}
