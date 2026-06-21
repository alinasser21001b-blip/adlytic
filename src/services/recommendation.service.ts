// ════════════════════════════════════════════════════════════════════════
//  src/services/recommendation.service.ts
//
//  Closed-loop RecommendationLog service.
//  Logs recommendation snapshots, tracks user actions, and evaluates
//  performance deltas once outcome data is available.
// ════════════════════════════════════════════════════════════════════════

import { RecommendationSource, UserActionStatus, type PrismaClient } from '@prisma/client';

export interface MetricsSnapshot {
  ctr?: number | null;
  cpm?: number | null;
  cpc?: number | null;
  roas?: number | null;
  spend?: number | null;
  impressions?: number | null;
  conversions?: number | null;
  frequency?: number | null;
  [key: string]: unknown;
}

export class RecommendationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Log a recommendation snapshot at the moment it was surfaced to the user.
   * Call this when serving the GET recommendations endpoint.
   */
  async logRecommendation(params: {
    workspaceId: string;
    campaignId?: string;
    verdict: string;
    generatedBy?: RecommendationSource;
    metricsSnapshot: MetricsSnapshot;
  }) {
    return this.prisma.recommendationLog.create({
      data: {
        workspaceId: params.workspaceId,
        campaignId: params.campaignId ?? null,
        verdict: params.verdict,
        generatedBy: params.generatedBy ?? RecommendationSource.V1_RULES,
        metricsSnapshot: params.metricsSnapshot as object,
        userAction: UserActionStatus.PENDING,
      },
    });
  }

  /**
   * Record whether the user acted on the recommendation.
   */
  async trackUserAction(logId: string, action: 'EXECUTED' | 'IGNORED') {
    return this.prisma.recommendationLog.update({
      where: { id: logId },
      data: {
        userAction: action === 'EXECUTED' ? UserActionStatus.EXECUTED : UserActionStatus.IGNORED,
        actionAppliedAt: action === 'EXECUTED' ? new Date() : null,
      },
    });
  }

  /**
   * Evaluate outcome delta against the snapshot taken at logging time.
   * Call this 7–14 days after the recommendation was acted on.
   * Returns null if the log cannot be found or if action was not EXECUTED.
   */
  async evaluateOutcome(logId: string, currentMetrics: MetricsSnapshot) {
    const log = await this.prisma.recommendationLog.findUnique({
      where: { id: logId },
    });

    if (!log || log.userAction !== UserActionStatus.EXECUTED) return null;

    const snapshot = log.metricsSnapshot as MetricsSnapshot;

    // Primary signal: ROAS delta. Fallback to CTR delta, then spend delta.
    const delta = this.computePrimaryDelta(snapshot, currentMetrics);

    const updated = await this.prisma.recommendationLog.update({
      where: { id: logId },
      data: {
        performanceDelta: delta,
        isSuccessful: delta !== null ? delta > 0 : null,
      },
    });

    return updated;
  }

  /**
   * Retrieve logged recommendations for a workspace, newest first.
   */
  async getLogsForWorkspace(workspaceId: string, limit = 50) {
    return this.prisma.recommendationLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private computePrimaryDelta(
    before: MetricsSnapshot,
    after: MetricsSnapshot,
  ): number | null {
    for (const key of ['roas', 'ctr', 'conversions'] as const) {
      const b = before[key];
      const a = after[key];
      if (typeof b === 'number' && b > 0 && typeof a === 'number') {
        return (a - b) / b; // relative delta, e.g. +0.15 = +15%
      }
    }
    return null;
  }
}
