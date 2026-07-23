// ════════════════════════════════════════════════════════════════════════
//  src/services/metaAudit.ts
//
//  Append-only audit trail for Meta account lifecycle events (P1-10).
//  A single fire-and-forget writer plus a reader used by the admin API.
//
//  Events recorded:
//    • CONNECTED           — a workspace linked a Meta ad account
//    • DISCONNECTED        — a workspace removed a Meta ad account
//    • TOKEN_EXPIRED       — a stored token passed its expiry and was flagged
//    • RECONNECT_REQUIRED  — a token could no longer be used (decrypt/regrant)
//
//  The writer NEVER throws — a failed audit write must not break the user-facing
//  connect/disconnect/refresh flow it hangs off of. No tokens or secrets are
//  ever stored here, only ids + a short human-readable detail string.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient, MetaAuditEvent } from '@prisma/client';

export interface MetaAuditInput {
  workspaceId: string;
  event: MetaAuditEvent;
  adAccountId?: string | null;
  externalAccountId?: string | null;
  actorUserId?: string | null;
  detail?: string | null;
}

/**
 * Record a Meta lifecycle event. Fire-and-forget: callers may `void` this and
 * continue. Any failure is logged and swallowed so the surrounding request or
 * worker pass is never affected.
 */
export async function recordMetaAuditEvent(
  prisma: PrismaClient,
  input: MetaAuditInput,
): Promise<void> {
  try {
    await prisma.metaAuditLog.create({
      data: {
        workspaceId:       input.workspaceId,
        event:             input.event,
        adAccountId:       input.adAccountId ?? null,
        externalAccountId: input.externalAccountId ?? null,
        actorUserId:       input.actorUserId ?? null,
        detail:            input.detail ?? null,
      },
    });
  } catch (err) {
    console.error('[adlytic:meta-audit] failed to record event', input.event, err);
  }
}

export interface MetaAuditEntry {
  id: string;
  workspaceId: string;
  event: MetaAuditEvent;
  adAccountId: string | null;
  externalAccountId: string | null;
  actorUserId: string | null;
  detail: string | null;
  createdAt: string;
}

/**
 * Read the most recent audit entries (newest first), optionally scoped to a
 * single workspace. Used by the platform-admin audit endpoint.
 */
export async function listMetaAuditEvents(
  prisma: PrismaClient,
  opts: { workspaceId?: string; limit?: number } = {},
): Promise<MetaAuditEntry[]> {
  const take = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = await prisma.metaAuditLog.findMany({
    where: opts.workspaceId ? { workspaceId: opts.workspaceId } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r) => ({
    id:                r.id,
    workspaceId:       r.workspaceId,
    event:             r.event,
    adAccountId:       r.adAccountId,
    externalAccountId: r.externalAccountId,
    actorUserId:       r.actorUserId,
    detail:            r.detail,
    createdAt:         r.createdAt.toISOString(),
  }));
}
