// ════════════════════════════════════════════════════════════════════════
//  src/services/execution.service.ts  — V1.1.5 Outcome Memory
//
//  Two responsibilities only:
//    1. Record that a user executed a recommendation (with immutable KPI snapshot).
//    2. Evaluate outcome 7 days later by comparing snapshot vs current daily_stats.
//
//  Do NOT add confidence scoring, evidence chains, or external calls here.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, UserActionStatus, EntityType } from '@prisma/client';

export interface MetricsSnapshot {
  ctr?:       number | null;
  cpm?:       number | null;
  roas?:      number | null;
  frequency?: number | null;
  spend?:     number | null;
  [key: string]: unknown;
}

export class ExecutionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Record that a recommendation was executed by the user.
   * Upserts the execution row; metricsSnapshot is IMMUTABLE after first write.
   */
  async recordExecution(recommendationId: string, snapshot: MetricsSnapshot) {
    // Resolve workspaceId: recommendation.entityId is an AdAccount.id
    const rec = await this.prisma.recommendation.findUniqueOrThrow({
      where: { id: recommendationId },
      select: { entityId: true },
    });
    const account = await this.prisma.adAccount.findUniqueOrThrow({
      where: { id: rec.entityId },
      select: { workspaceId: true },
    });

    return this.prisma.recommendationExecution.upsert({
      where:  { recommendationId },
      create: {
        workspaceId:     account.workspaceId,
        recommendationId,
        metricsSnapshot: snapshot as object,
        userAction:      UserActionStatus.EXECUTED,
        executedAt:      new Date(),
      },
      // On conflict: only update mutable execution fields — snapshot stays immutable.
      update: {
        userAction: UserActionStatus.EXECUTED,
        executedAt: new Date(),
      },
    });
  }

  /**
   * Evaluate outcome for a single execution.
   * Computes successScore by comparing the immutable snapshot against
   * the 7-day aggregate of current daily_stats for the same entity.
   */
  async evaluateOutcome(executionId: string) {
    const execution = await this.prisma.recommendationExecution.findUniqueOrThrow({
      where:   { id: executionId },
      include: { recommendation: { select: { entityId: true } } },
    });

    const entityId = execution.recommendation.entityId;
    const since    = new Date(Date.now() - 7 * 86_400_000);

    const rows = await this.prisma.dailyStat.findMany({
      where: {
        entityType: EntityType.ACCOUNT,
        entityId,
        date: { gte: since },
      },
    });

    const snapshot    = execution.metricsSnapshot as MetricsSnapshot;
    const successScore = computeSuccessScore(snapshot, rows);

    return this.prisma.recommendationExecution.update({
      where: { id: executionId },
      data:  {
        successScore,
        evaluationVersion: 'v1.0',
        evaluatedAt:       new Date(),
      },
    });
  }
}

// ── Pure helper — no side effects ─────────────────────────────────────────

/**
 * Compare snapshot KPIs against current aggregated daily_stats rows.
 * Returns a score in [-1.0, +1.0]: positive = improved, negative = degraded.
 * Primary signal: CTR delta (impression-weighted). Fallback: spend delta.
 * Returns 0 when there is no signal to compare.
 */
function computeSuccessScore(
  snapshot: MetricsSnapshot,
  rows: Array<{ impressions: bigint; clicks: bigint; spend: bigint }>,
): number {
  if (rows.length === 0) return 0;

  const totalImpressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
  const totalClicks      = rows.reduce((s, r) => s + Number(r.clicks), 0);

  const currentCtr = totalImpressions > 0
    ? (totalClicks / totalImpressions) * 100
    : null;

  if (currentCtr !== null && snapshot.ctr != null && snapshot.ctr > 0) {
    const delta = (currentCtr - snapshot.ctr) / snapshot.ctr;
    return clamp(delta, -1, 1);
  }

  // Fallback: spend delta (lower spend for similar activity is better)
  const currentSpend  = rows.reduce((s, r) => s + Number(r.spend), 0);
  const snapshotSpend = snapshot.spend;
  if (snapshotSpend != null && snapshotSpend > 0) {
    const delta = (snapshotSpend - currentSpend) / snapshotSpend; // inverted: spend drop = positive
    return clamp(delta, -1, 1);
  }

  return 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, parseFloat(v.toFixed(4))));
}
