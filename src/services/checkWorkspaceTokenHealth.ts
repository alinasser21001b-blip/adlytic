// ════════════════════════════════════════════════════════════════════════
//  src/services/checkWorkspaceTokenHealth.ts
//
//  Probe whether stored Meta tokens for a workspace can be decrypted with
//  the current TOKEN_ENCRYPTION_KEY. Used by the global UI banner and any
//  workspace-scoped health endpoints.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { resolveAccountToken } from './accountToken';
import { decryptToken, TokenDecryptError, tokenDecryptErrorJson } from './tokenEncryption';

export interface TokenHealthAccountFailure {
  adAccountId: string;
  externalAccountId: string;
  name: string;
}

export type WorkspaceTokenHealth =
  | { ok: true }
  | ({
      ok: false;
      code: 'TOKEN_DECRYPT_FAILED';
      error: string;
      reconnectUrl: string;
      reconnectLabel: string;
      accounts: TokenHealthAccountFailure[];
    });

/**
 * Attempt to decrypt every ad account token in the workspace. Returns ok:false
 * with TOKEN_DECRYPT_FAILED when any stored ciphertext fails (key mismatch).
 */
export async function checkWorkspaceTokenHealth(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceTokenHealth> {
  const accounts = await prisma.adAccount.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      externalAccountId: true,
      accessTokenEncrypted: true,
      tokenSource: true,
      connectionId: true,
    },
  });

  const failed: TokenHealthAccountFailure[] = [];

  for (const acct of accounts) {
    const resolved = await resolveAccountToken(prisma, acct);
    if (!resolved.encrypted) continue;

    try {
      decryptToken(resolved.encrypted);
    } catch (err) {
      if (err instanceof TokenDecryptError) {
        failed.push({
          adAccountId: acct.id,
          externalAccountId: acct.externalAccountId,
          name: acct.name,
        });
      } else {
        throw err;
      }
    }
  }

  if (failed.length === 0) return { ok: true };

  const body = tokenDecryptErrorJson();
  return {
    ok: false,
    code: body.code,
    error: body.error,
    reconnectUrl: body.reconnectUrl,
    reconnectLabel: body.reconnectLabel,
    accounts: failed,
  };
}
