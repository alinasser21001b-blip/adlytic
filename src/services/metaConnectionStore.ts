// ════════════════════════════════════════════════════════════════════════
//  src/services/metaConnectionStore.ts — the one place a Meta token is stored
//
//  MetaConnection is the SINGLE SOURCE OF AUTHENTICATION TRUTH for Meta.
//  A connection row owns the encrypted System User token, the granted
//  scopes, the granted asset ids, and the ACTIVE/NEEDS_REGRANT/REVOKED
//  lifecycle. Nothing else in the codebase should persist a Meta System
//  User token.
//
//  AdAccount, by contrast, is a pure representation of an ad account: id,
//  name, currency, timezone, status. Rows whose `tokenSource` is
//  'SYSTEM_USER' intentionally carry `accessTokenEncrypted: null` and read
//  their token through `connection.accessTokenEncrypted` at use time. That
//  indirection is the whole point — rotating the System User token in the
//  environment updates exactly one row (the connection) and every account
//  hanging off it immediately picks up the new value, instead of leaving a
//  fleet of AdAccount rows holding stale encrypted copies.
//
//  Legacy / user-OAuth / manual accounts are unaffected: they keep their
//  own `accessTokenEncrypted` with a real `tokenExpiresAt`, and the
//  background auto-sync branches on `tokenSource` to tell the two apart
//  (see src/workers/backgroundScheduler.ts).
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { encryptToken } from './tokenEncryption';

/**
 * Create or update the MetaConnection row for a workspace+business. Encrypts
 * the System User token, records granted scopes/assets, and marks it ACTIVE
 * with a null expiry (System User tokens do not expire). Returns the row id.
 *
 * Takes `prisma` explicitly so both the API routes (which own a client via
 * their closure) and the orchestrator adapters (which get one on the step
 * context) can share one implementation. Never logs the token.
 */
export async function upsertMetaConnection(
  prisma: PrismaClient,
  params: {
    workspaceId:     string;
    businessId:      string;
    businessName?:   string | null;
    systemUserId?:   string | null;
    token:           string;
    scopes:          string[];
    grantedAssetIds: string[];
    configId?:       string | null;
  },
): Promise<string> {
  const encrypted = encryptToken(params.token);
  const data = {
    businessName:         params.businessName ?? undefined,
    systemUserId:         params.systemUserId ?? undefined,
    accessTokenEncrypted: encrypted,
    tokenType:            'SYSTEM_USER' as const,
    tokenExpiresAt:       null,
    grantedScopes:        params.scopes,
    grantedAssetIds:      params.grantedAssetIds,
    configId:             params.configId ?? undefined,
    status:               'ACTIVE' as const,
    lastValidatedAt:      new Date(),
  };
  const existing = await prisma.metaConnection.findUnique({
    where: { workspaceId_businessId: { workspaceId: params.workspaceId, businessId: params.businessId } },
  });
  if (existing) {
    await prisma.metaConnection.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.metaConnection.create({
    data: { workspaceId: params.workspaceId, businessId: params.businessId, ...data },
  });
  return created.id;
}
