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
  /** Stable dashboard item id (issue:CODE, priority:ACTION, feed:DEDUPE_KEY). */
  itemKey?: string;
  itemKind?: string;
  actionCode?: string | null;
  campaignId?: string | null;
  feedKey?: string | null;
  title?: string | null;
  [key: string]: unknown;
}

/** Days to suppress EXECUTED/IGNORED dashboard items from active priorities. */
export const APPLIED_ACTION_LOOKBACK_DAYS = 7;

export function extractItemKey(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const key = (snapshot as MetricsSnapshot).itemKey;
  return typeof key === 'string' && key.length > 0 ? key : null;
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
   * Log a dashboard Main Move action with a stable itemKey for closed-loop filtering.
   */
  async recordDashboardAction(params: {
    workspaceId: string;
    action: 'EXECUTED' | 'IGNORED';
    itemKey: string;
    itemKind?: string;
    actionCode?: string | null;
    campaignId?: string | null;
    feedKey?: string | null;
    title?: string | null;
    metricsSnapshot?: MetricsSnapshot;
  }) {
    const snapshot: MetricsSnapshot = {
      ...(params.metricsSnapshot ?? {}),
      itemKey: params.itemKey,
      itemKind: params.itemKind,
      actionCode: params.actionCode ?? null,
      campaignId: params.campaignId ?? null,
      feedKey: params.feedKey ?? null,
      title: params.title ?? null,
    };
    return this.prisma.recommendationLog.create({
      data: {
        workspaceId: params.workspaceId,
        campaignId: params.campaignId ?? null,
        verdict: `${params.action}:${params.itemKey}`,
        generatedBy: RecommendationSource.V1_RULES,
        metricsSnapshot: snapshot as object,
        userAction: params.action === 'EXECUTED' ? UserActionStatus.EXECUTED : UserActionStatus.IGNORED,
        actionAppliedAt: params.action === 'EXECUTED' ? new Date() : null,
      },
    });
  }

  /**
   * Item keys the user marked EXECUTED or IGNORED within the lookback window.
   */
  async getAppliedItemKeys(
    workspaceId: string,
    lookbackDays = APPLIED_ACTION_LOOKBACK_DAYS,
  ): Promise<Set<string>> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - lookbackDays);

    const logs = await this.prisma.recommendationLog.findMany({
      where: {
        workspaceId,
        userAction: { in: [UserActionStatus.EXECUTED, UserActionStatus.IGNORED] },
        createdAt: { gte: since },
      },
      select: { metricsSnapshot: true },
    });

    const keys = new Set<string>();
    for (const log of logs) {
      const key = extractItemKey(log.metricsSnapshot);
      if (key) keys.add(key);
    }
    return keys;
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
