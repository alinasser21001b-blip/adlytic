// ════════════════════════════════════════════════════════════════════════
//  src/lib/cmoInsightDedupe.ts
//
//  Idempotency helpers for CMO / brain insight narration — especially the
//  cold-start "gathering initial data" learning phase that was flooding the
//  feed when re-generated on every sync/cron tick.
// ════════════════════════════════════════════════════════════════════════

import { Prisma, PrismaClient } from '@prisma/client';

/** Canonical cold-start title from ClaudeCMO system prompt (active-tone). */
export const LEARNING_PHASE_TITLE = 'نراقب حملتك الآن ونبني خط الأساس';

/**
 * Distinctive substrings that mark a cold-start / learning-phase title.
 * Includes the legacy passive title still persisted in older DB rows so that
 * dedupe keeps recognising them after the active-tone copy revamp.
 */
const LEARNING_PHASE_TITLE_MARKERS: readonly string[] = [
  'نبني خط الأساس', // active-tone canonical title
  'نراقب المؤشرات', // active-tone alternate example
  'جاري جمع',       // legacy passive cold-start titles already in the feed
];

export const LEARNING_PHASE_ACTIONS: ReadonlySet<string> = new Set(['KEEP_COLLECTING']);

export interface ReusableNarration {
  narrationJson: Prisma.InputJsonValue;
  narrationGeneratedAt: Date | null;
}

/** UTC date floor — matches BrainPersistence.toUtcMidnight. */
export function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function readNarrationTitle(narrationJson: unknown): string | null {
  if (!narrationJson || typeof narrationJson !== 'object') return null;
  const title = (narrationJson as Record<string, unknown>)['arabicTitle'];
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : null;
}

export function isLearningPhaseAction(action: string): boolean {
  return LEARNING_PHASE_ACTIONS.has(action);
}

export function isColdStartPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p['coldStart'] === true) return true;
  const confidence = p['confidence'];
  if (confidence && typeof confidence === 'object') {
    const gating = (confidence as Record<string, unknown>)['gatingStatus'];
    if (gating === 'COLLECTING_DATA') return true;
  }
  return false;
}

export function isLearningPhaseSnapshot(row: { action: string; payload: unknown }): boolean {
  return isLearningPhaseAction(row.action) || isColdStartPayload(row.payload);
}

export function isLearningPhaseNarration(narrationJson: unknown): boolean {
  const title = readNarrationTitle(narrationJson);
  if (!title) return false;
  if (title === LEARNING_PHASE_TITLE) return true;
  return LEARNING_PHASE_TITLE_MARKERS.some((marker) => title.includes(marker));
}

export function learningInsightDedupeKey(campaignId: string, insightType: string): string {
  return `${campaignId}:${insightType}:learning`;
}

/**
 * True when both snapshots are in the learning / cold-start phase — used to
 * preserve narration across action-string churn (e.g. KEEP_COLLECTING ↔ payload
 * gating flips) without re-entering the narration queue.
 */
export function isSameLearningPhaseTransition(
  before: { action: string; payload: unknown },
  after: { action: string; payload: unknown },
): boolean {
  return isLearningPhaseSnapshot(before) && isLearningPhaseSnapshot(after);
}

/**
 * Any narrated learning-phase row for this campaign — NO date or action filter.
 * This is the authoritative guard against cron/sync re-generating "gathering
 * initial data" on every tick.
 */
export async function findExistingLearningInsightForCampaign(
  prisma: PrismaClient,
  campaignId: string,
  excludeId?: string,
): Promise<(ReusableNarration & { id: string }) | null> {
  const rows = await prisma.campaignBrainSnapshot.findMany({
    where: {
      campaignId,
      narrationJson: { not: Prisma.AnyNull },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ narrationGeneratedAt: 'desc' }, { tickDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      action: true,
      payload: true,
      narrationJson: true,
      narrationGeneratedAt: true,
    },
    take: 30,
  });

  for (const row of rows) {
    if (!row.narrationJson) continue;
    const narratedLearning = isLearningPhaseNarration(row.narrationJson);
    const snapshotLearning = isLearningPhaseSnapshot(row);
    if (narratedLearning || snapshotLearning) {
      return {
        id: row.id,
        narrationJson: row.narrationJson as Prisma.InputJsonValue,
        narrationGeneratedAt: row.narrationGeneratedAt,
      };
    }
  }

  return null;
}

/**
 * Rate-limit learning-phase narrations: reuse an existing narration when the
 * campaign is still in the same statistical state (learning / cold-start).
 */
export async function findReusableLearningNarration(
  prisma: PrismaClient,
  row: { id: string; campaignId: string; tickDate: Date; action: string; payload: unknown },
): Promise<ReusableNarration | null> {
  if (!isLearningPhaseSnapshot(row)) return null;

  const existing = await findExistingLearningInsightForCampaign(
    prisma,
    row.campaignId,
    row.id,
  );
  if (existing) {
    return {
      narrationJson: existing.narrationJson,
      narrationGeneratedAt: existing.narrationGeneratedAt,
    };
  }

  return null;
}

/** Pure helper for tests — block LLM when campaign already has learning narration. */
export function shouldBlockLearningGeneration(
  row: { action: string; payload: unknown },
  existing: ReusableNarration | null,
): boolean {
  return isLearningPhaseSnapshot(row) && existing != null;
}
