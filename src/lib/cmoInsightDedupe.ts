// ════════════════════════════════════════════════════════════════════════
//  src/lib/cmoInsightDedupe.ts
//
//  Idempotency helpers for CMO / brain insight narration — especially the
//  cold-start "gathering initial data" learning phase that was flooding the
//  feed when re-generated on every sync/cron tick.
// ════════════════════════════════════════════════════════════════════════

import { Prisma, PrismaClient } from '@prisma/client';

/** Canonical cold-start title from ClaudeCMO system prompt. */
export const LEARNING_PHASE_TITLE = 'حملة جديدة: جاري جمع البيانات الأولية';

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
  return title === LEARNING_PHASE_TITLE || title.includes('جاري جمع');
}

export function learningInsightDedupeKey(
  campaignId: string,
  insightType: string,
  tickDate: Date,
): string {
  return `${campaignId}:${insightType}:${toUtcMidnight(tickDate).toISOString().slice(0, 10)}`;
}

/**
 * Another narrated learning-phase row for the same campaign + UTC day + action.
 * Handles rare duplicate DB rows (pre-unique-index data or manual inserts).
 */
export async function findExistingLearningInsightToday(
  prisma: PrismaClient,
  campaignId: string,
  tickDate: Date,
  action: string,
  excludeId?: string,
): Promise<(ReusableNarration & { id: string }) | null> {
  const day = toUtcMidnight(tickDate);
  const row = await prisma.campaignBrainSnapshot.findFirst({
    where: {
      campaignId,
      tickDate: day,
      action,
      narrationJson: { not: Prisma.AnyNull },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ narrationGeneratedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, narrationJson: true, narrationGeneratedAt: true },
  });
  if (!row?.narrationJson || !isLearningPhaseNarration(row.narrationJson)) return null;
  return {
    id: row.id,
    narrationJson: row.narrationJson as Prisma.InputJsonValue,
    narrationGeneratedAt: row.narrationGeneratedAt,
  };
}

/**
 * Rate-limit learning-phase narrations: reuse an existing narration when the
 * campaign is still in the same statistical state (action unchanged).
 */
export async function findReusableLearningNarration(
  prisma: PrismaClient,
  row: { id: string; campaignId: string; tickDate: Date; action: string; payload: unknown },
): Promise<ReusableNarration | null> {
  if (!isLearningPhaseSnapshot(row)) return null;

  const sameDay = await findExistingLearningInsightToday(
    prisma,
    row.campaignId,
    row.tickDate,
    row.action,
    row.id,
  );
  if (sameDay) {
    return {
      narrationJson: sameDay.narrationJson,
      narrationGeneratedAt: sameDay.narrationGeneratedAt,
    };
  }

  const day = toUtcMidnight(row.tickDate);
  const prior = await prisma.campaignBrainSnapshot.findFirst({
    where: {
      campaignId: row.campaignId,
      action: row.action,
      tickDate: { lt: day },
      narrationJson: { not: Prisma.AnyNull },
    },
    orderBy: { tickDate: 'desc' },
    select: { narrationJson: true, narrationGeneratedAt: true, action: true, payload: true },
  });
  if (
    prior?.narrationJson &&
    isLearningPhaseSnapshot(prior) &&
    isLearningPhaseNarration(prior.narrationJson)
  ) {
    return {
      narrationJson: prior.narrationJson as Prisma.InputJsonValue,
      narrationGeneratedAt: prior.narrationGeneratedAt,
    };
  }

  return null;
}
