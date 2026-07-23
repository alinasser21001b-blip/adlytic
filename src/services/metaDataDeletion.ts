// ════════════════════════════════════════════════════════════════════════
//  src/services/metaDataDeletion.ts
//
//  Meta Data Deletion Request Callback support.
//
//  When a person removes the app from their Facebook settings, Meta POSTs a
//  `signed_request` (HMAC-SHA256, app-secret signed) to the app's Data
//  Deletion Callback URL. The app must erase the person's platform data and
//  respond with { url, confirmation_code } pointing at a human-readable
//  status page. Spec: developers.facebook.com/docs/development/create-an-app
//  /app-dashboard/data-deletion-callback
// ════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { purgeAccountAnalytics } from './accountDataPurge';

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verify + decode a Meta `signed_request`. Returns the payload when the
 * HMAC-SHA256 signature matches the app secret, else null. Constant-time
 * comparison; malformed input never throws.
 */
export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): SignedRequestPayload | null {
  const dot = signedRequest.indexOf('.');
  if (dot <= 0) return null;
  const sigB64 = signedRequest.slice(0, dot);
  const payloadB64 = signedRequest.slice(dot + 1);
  if (!payloadB64) return null;

  try {
    const expected = createHmac('sha256', appSecret).update(payloadB64).digest();
    const given = base64UrlDecode(sigB64);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as SignedRequestPayload;
    if (String(payload.algorithm ?? '').toUpperCase() !== 'HMAC-SHA256') return null;
    return payload;
  } catch {
    return null;
  }
}

export interface DataDeletionResult {
  confirmationCode: string;
  connectionsDeleted: number;
  accountsDeleted: number;
}

/**
 * Erase everything Adlytic holds that was provisioned by the given Facebook
 * user id: MetaConnections whose System User was created by that person,
 * their linked ad accounts, and all Meta-derived analytics rows (via the
 * canonical purge). Legacy user-OAuth accounts do not store a Facebook user
 * id, so they cannot be matched here — those are erased when the workspace
 * owner disconnects the account (documented on the /data-deletion page).
 */
export async function handleMetaDataDeletion(
  prisma: PrismaClient,
  fbUserId: string,
): Promise<DataDeletionResult> {
  const confirmationCode = `adl_del_${randomBytes(8).toString('hex')}`;

  const connections = await prisma.metaConnection.findMany({
    where: { systemUserId: fbUserId },
    select: { id: true },
  });

  let accountsDeleted = 0;
  for (const conn of connections) {
    const accounts = await prisma.adAccount.findMany({
      where: { connectionId: conn.id },
      select: { id: true },
    });
    for (const acct of accounts) {
      await purgeAccountAnalytics(prisma, acct.id);
      // FK cascades remove campaigns, ad sets, ads, creatives, snapshots.
      await prisma.adAccount.delete({ where: { id: acct.id } });
      accountsDeleted++;
    }
    await prisma.metaConnection.delete({ where: { id: conn.id } });
  }

  console.log(
    `[meta-data-deletion] ${confirmationCode}: fb_user=${fbUserId} — ` +
    `${connections.length} connection(s), ${accountsDeleted} account(s) erased`,
  );

  return {
    confirmationCode,
    connectionsDeleted: connections.length,
    accountsDeleted,
  };
}
