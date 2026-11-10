// ════════════════════════════════════════════════════════════════════════
//  src/services/recommendationWriteGuard.ts
//
//  Ownership and input checks that must pass BEFORE a recommendation write or a
//  refresh. See delivery/core/RECOMMENDATION_WRITE_AUTH.md for the guard order.
//
//  Two layers use this file:
//    · the routes (server.ts) validate the request first, so a refused request
//      leaves no row changed anywhere;
//    · the services (RecommendationService, ExecutionService, runRefresh) call
//      the same assertions again, so a future route that forgets still cannot
//      stamp a foreign campaign / ad account / log into a workspace.
//
//  A foreign id and an unknown id are deliberately the SAME error: the caller
//  must not be able to tell whether another tenant's id exists.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

export type OwnedKind = 'campaign' | 'adAccount' | 'recommendationLog' | 'recommendation';

/** The identifier is not (known to be) this workspace's. Maps to HTTP 404. */
export class WorkspaceOwnershipError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly kind: OwnedKind) {
    super(`${kind} not found in this workspace`);
    this.name = 'WorkspaceOwnershipError';
  }
}

/**
 * Prisma treats `{ id: undefined }` as "no filter". An id that is not a
 * non-empty string must therefore be refused BEFORE it reaches a `where`,
 * or `findFirst({ where: { id: undefined, … } })` would match any row.
 */
function usable(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0;
}

/** The campaign belongs to ANY ad account of the stated workspace. */
export async function assertCampaignInWorkspace(
  prisma: Pick<PrismaClient, 'campaign'>,
  workspaceId: string,
  campaignId: string,
): Promise<void> {
  if (!usable(workspaceId) || !usable(campaignId)) throw new WorkspaceOwnershipError('campaign');
  const row = await prisma.campaign.findFirst({
    where: { id: campaignId, adAccount: { workspaceId } },
    select: { id: true },
  });
  if (!row) throw new WorkspaceOwnershipError('campaign');
}

/** The ad account belongs to the stated workspace. */
export async function assertAdAccountInWorkspace(
  prisma: Pick<PrismaClient, 'adAccount'>,
  workspaceId: string,
  adAccountId: string,
): Promise<void> {
  if (!usable(workspaceId) || !usable(adAccountId)) throw new WorkspaceOwnershipError('adAccount');
  const row = await prisma.adAccount.findFirst({
    where: { id: adAccountId, workspaceId },
    select: { id: true },
  });
  if (!row) throw new WorkspaceOwnershipError('adAccount');
}

// ── Request-body validation (pure; no database) ──────────────────────────

export const LIMITS = {
  id: 128,
  itemKey: 512,
  feedKey: 512,
  itemKind: 64,
  actionCode: 100,
  title: 1000,
} as const;

export interface RecommendationActionInput {
  action: 'EXECUTED' | 'IGNORED';
  itemKey: string;
  itemKind: string | null;
  actionCode: string | null;
  campaignId: string | null;
  adAccountId: string | null;
  feedKey: string | null;
  title: string | null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9_.:-]+$/;

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/**
 * Characters Postgres cannot store in text/jsonb: NUL, and a LONE surrogate half (valid JSON can
 * carry one as "\ud800", JSON.parse accepts it, and the later INSERT fails with a 500 — after the
 * execution row was already written: the half-write the review reproduced for itemKey, title,
 * feedKey and itemKind). Refused at the door so the answer is 400 and nothing is written.
 */
const UNSTORABLE_TEXT = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export function hasUnstorableText(v: string): boolean {
  return UNSTORABLE_TEXT.test(v);
}

/** `undefined`, `null` and '' all mean "not supplied". Anything else must be a string within `max`. */
function optionalString(
  body: Record<string, unknown>,
  field: string,
  max: number,
): ParseResult<string | null> {
  const v = body[field];
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: `${field} must be a string` };
  if (v.length > max) return { ok: false, error: `${field} is too long (max ${max} characters)` };
  if (hasUnstorableText(v)) return { ok: false, error: `${field} contains an invalid character` };
  return { ok: true, value: v };
}

function optionalId(body: Record<string, unknown>, field: string): ParseResult<string | null> {
  const r = optionalString(body, field, LIMITS.id);
  if (!r.ok || r.value === null) return r;
  if (!ID_RE.test(r.value)) return { ok: false, error: `${field} is malformed` };
  return r;
}

/** Body of POST …/recommendations/action. Never reads the database. */
export function parseRecommendationActionBody(raw: unknown): ParseResult<RecommendationActionInput> {
  if (!isPlainObject(raw)) return { ok: false, error: 'Request body must be a JSON object' };
  const action = raw['action'];
  if (action !== 'EXECUTED' && action !== 'IGNORED') {
    return { ok: false, error: 'action must be EXECUTED or IGNORED' };
  }
  const itemKey = raw['itemKey'];
  if (typeof itemKey !== 'string' || itemKey.length === 0) return { ok: false, error: 'itemKey is required' };
  if (itemKey.length > LIMITS.itemKey) return { ok: false, error: `itemKey is too long (max ${LIMITS.itemKey} characters)` };
  if (hasUnstorableText(itemKey)) return { ok: false, error: 'itemKey contains an invalid character' };

  const itemKind = optionalString(raw, 'itemKind', LIMITS.itemKind);
  if (!itemKind.ok) return itemKind;
  const actionCode = optionalString(raw, 'actionCode', LIMITS.actionCode);
  if (!actionCode.ok) return actionCode;
  const feedKey = optionalString(raw, 'feedKey', LIMITS.feedKey);
  if (!feedKey.ok) return feedKey;
  const title = optionalString(raw, 'title', LIMITS.title);
  if (!title.ok) return title;
  const campaignId = optionalId(raw, 'campaignId');
  if (!campaignId.ok) return campaignId;
  const adAccountId = optionalId(raw, 'adAccountId');
  if (!adAccountId.ok) return adAccountId;

  return {
    ok: true,
    value: {
      action,
      itemKey,
      itemKind: itemKind.value,
      actionCode: actionCode.value,
      campaignId: campaignId.value,
      adAccountId: adAccountId.value,
      feedKey: feedKey.value,
      title: title.value,
    },
  };
}

/** Body of POST …/recommendations/:logId/action. */
export function parseLogActionBody(raw: unknown): ParseResult<{ action: 'EXECUTED' | 'IGNORED' }> {
  if (!isPlainObject(raw)) return { ok: false, error: 'Request body must be a JSON object' };
  const action = raw['action'];
  if (action !== 'EXECUTED' && action !== 'IGNORED') {
    return { ok: false, error: 'action must be EXECUTED or IGNORED' };
  }
  return { ok: true, value: { action } };
}
