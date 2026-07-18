// ════════════════════════════════════════════════════════════════════════
//  src/services/refresh/refreshEngine.ts
//
//  Smart Refresh Engine — the event-driven synchronization layer.
//
//  Before this module, "refresh" meant: every sync re-ran every engine, and
//  a user executing a recommendation waited for the NEXT sync before the
//  dashboard's intelligence caught up. This module replaces that with an
//  event → plan → scoped-recalculation pipeline:
//
//    emit(event) ──► planRefresh(event)  (pure, tested)
//                       │  which targets are affected, which are skipped
//                       ▼
//                  runRefresh(...)       (executor)
//                       │  runs ONLY affected engines, times each,
//                       │  auto-completes recommendations the user already
//                       │  applied manually in Meta, busts affected caches
//                       ▼
//                  refresh_logs row      (observability: trigger, targets,
//                                         durations, skipped, errors)
//                  refresh_states rows   (dirty flags + last-* timestamps)
//
//  Honesty rules baked in:
//  - The engine pipeline (analytics→rules→recommendations→health) is
//    account-scoped BY DESIGN (each engine reads the previous one's output
//    for the account). "Selective" here means selecting WHICH engines run
//    and WHETHER anything runs at all — not pretending per-campaign engine
//    slices exist where they don't.
//  - A sync that changed nothing skips every engine and says so in the log.
//  - A recommendation action triggers recommendations+health ONLY (rules
//    output is unchanged by a user action) — immediately, synchronously,
//    so the client's follow-up refetch sees fresh intelligence.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, PrismaClient, Prisma, RecommendationSource, UserActionStatus } from '@prisma/client';
import type { MetaClient } from '../metaClient';
import { runEngines } from '../../workers/runEngines';
import { runBrainOrchestrator } from '../../workers/runBrainOrchestrator';
import { RecommendationEngine } from '../../engines/recommendation/RecommendationEngine';
import { HealthScoreEngine } from '../../engines/health/HealthScoreEngine';
import { bustPlatformStatsCache } from '../getPlatformStats';

// ── Events ───────────────────────────────────────────────────────────────

/** A campaign-level change detected while reconciling against Meta. */
export interface CampaignChange {
  campaignId: string;
  externalCampaignId: string;
  name: string;
  kind: 'CampaignCreated' | 'CampaignPaused' | 'CampaignActivated' | 'BudgetChanged';
  prevBudgetMinor?: string | null;
  newBudgetMinor?: string | null;
}

export type RefreshEvent =
  | {
      type: 'MetaSyncCompleted';
      adAccountId: string;
      /** Insight/stat rows written across all sync phases. */
      changedRows: number;
      campaignChanges: CampaignChange[];
    }
  | { type: 'RecommendationExecuted'; adAccountId: string; workspaceId: string; itemKey: string }
  | { type: 'RecommendationDismissed'; adAccountId: string; workspaceId: string; itemKey: string };

export type RefreshTarget =
  | 'engines'            // analytics → rules → recommendations → health (+v5 shadow)
  | 'brain'              // brain orchestrator (needs MetaClient)
  | 'recommendations'    // RecommendationEngine only
  | 'health'             // HealthScoreEngine only
  | 'autoComplete'       // match manual Meta changes against active recommendations
  | 'platformStatsCache';

export interface RefreshPlan {
  targets: RefreshTarget[];
  skipped: Array<{ target: RefreshTarget; reason: string }>;
}

// ── Dependency graph (pure — unit-tested) ────────────────────────────────

export function planRefresh(event: RefreshEvent): RefreshPlan {
  switch (event.type) {
    case 'MetaSyncCompleted': {
      const changed = event.changedRows > 0 || event.campaignChanges.length > 0;
      if (!changed) {
        // Nothing in the underlying data moved — recalculating would produce
        // byte-identical outputs. Skip everything, and say so.
        return {
          targets: [],
          skipped: [
            { target: 'engines', reason: 'no_data_changes' },
            { target: 'brain', reason: 'no_data_changes' },
          ],
        };
      }
      const targets: RefreshTarget[] = [];
      // Manual changes in Meta (budget edits) may already satisfy an active
      // recommendation — resolve those BEFORE the engines regenerate, so the
      // regenerated set doesn't re-surface an already-satisfied action.
      if (event.campaignChanges.some((c) => c.kind === 'BudgetChanged')) {
        targets.push('autoComplete');
      }
      targets.push('engines', 'brain', 'platformStatsCache');
      return { targets, skipped: [] };
    }
    case 'RecommendationExecuted':
    case 'RecommendationDismissed':
      // Rules/analytics outputs are unchanged by a user action — re-running
      // them would be pure waste. Recommendations must reflect the action
      // NOW (not next sync), and health reads the recommendation state.
      return {
        targets: ['recommendations', 'health', 'platformStatsCache'],
        skipped: [
          { target: 'engines', reason: 'source_data_unchanged_by_user_action' },
          { target: 'brain', reason: 'source_data_unchanged_by_user_action' },
        ],
      };
  }
}

// ── Auto-complete: manual Meta change ⇢ matching recommendation ──────────

const BUDGET_INCREASE_CODES = new Set(['INCREASE_BUDGET', 'SCALE_BUDGET']);
const BUDGET_DECREASE_CODES = new Set(['DECREASE_BUDGET']);

/** Pure matcher — which budget-family actionCode does this change satisfy? */
export function budgetChangeSatisfies(change: CampaignChange, actionCode: string): boolean {
  if (change.kind !== 'BudgetChanged') return false;
  const prev = change.prevBudgetMinor != null ? BigInt(change.prevBudgetMinor) : null;
  const next = change.newBudgetMinor != null ? BigInt(change.newBudgetMinor) : null;
  if (prev == null || next == null || next === prev) return false;
  const code = actionCode.toUpperCase();
  if (next > prev) return BUDGET_INCREASE_CODES.has(code);
  return BUDGET_DECREASE_CODES.has(code);
}

/**
 * The AI recommended a budget move; the merchant then made that move directly
 * inside Meta. Detect the match and mark the recommendation "completed
 * automatically" (an EXECUTED RecommendationLog carrying the itemKey the
 * dashboard's applied-keys filter reads) instead of leaving it Active.
 */
async function autoCompleteBudgetRecommendations(
  prisma: PrismaClient,
  adAccountId: string,
  changes: CampaignChange[],
): Promise<{ completed: number }> {
  const budgetChanges = changes.filter((c) => c.kind === 'BudgetChanged');
  if (budgetChanges.length === 0) return { completed: 0 };

  const account = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    select: { workspaceId: true },
  });
  if (!account) return { completed: 0 };

  // Latest budget-family recommendation for this account (rules engine writes
  // account-level recommendations; actionCode carries the budget intent).
  const recs = await prisma.recommendation.findMany({
    where: {
      entityType: EntityType.ACCOUNT,
      entityId: adAccountId,
      actionCode: { in: [...BUDGET_INCREASE_CODES, ...BUDGET_DECREASE_CODES] },
    },
    orderBy: { date: 'desc' },
    take: 5,
  });
  if (recs.length === 0) return { completed: 0 };

  // Already-applied keys (EXECUTED/IGNORED logs) — never double-complete.
  const priorLogs = await prisma.recommendationLog.findMany({
    where: {
      workspaceId: account.workspaceId,
      userAction: { in: [UserActionStatus.EXECUTED, UserActionStatus.IGNORED] },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { metricsSnapshot: true },
  });
  const appliedKeys = new Set<string>();
  for (const log of priorLogs) {
    const snap = log.metricsSnapshot as Record<string, unknown> | null;
    const key = snap && typeof snap['itemKey'] === 'string' ? (snap['itemKey'] as string) : null;
    if (key) appliedKeys.add(key);
  }

  let completed = 0;
  for (const rec of recs) {
    if (!rec.actionCode) continue;
    const itemKey = `priority:${rec.actionCode}`;
    if (appliedKeys.has(itemKey)) continue;
    const match = budgetChanges.find((c) => budgetChangeSatisfies(c, rec.actionCode!));
    if (!match) continue;

    await prisma.recommendationLog.create({
      data: {
        workspaceId: account.workspaceId,
        campaignId: match.campaignId,
        verdict: 'AUTO_COMPLETED',
        generatedBy: RecommendationSource.V1_RULES,
        userAction: UserActionStatus.EXECUTED,
        actionAppliedAt: new Date(),
        metricsSnapshot: {
          itemKey,
          autoCompleted: true,
          source: 'meta_budget_change',
          actionCode: rec.actionCode,
          campaignName: match.name,
          prevBudgetMinor: match.prevBudgetMinor,
          newBudgetMinor: match.newBudgetMinor,
        } as Prisma.InputJsonValue,
      },
    });
    appliedKeys.add(itemKey);
    completed++;
  }
  return { completed };
}

// ── Dirty-state bookkeeping ──────────────────────────────────────────────

async function touchRefreshState(
  prisma: PrismaClient,
  entityType: EntityType,
  entityId: string,
  patch: Partial<{
    isDirty: boolean;
    lastCalculatedAt: Date;
    lastMetaSyncAt: Date;
    lastUserChangeAt: Date;
    lastRecommendationExecutionAt: Date;
  }>,
): Promise<void> {
  await prisma.refreshState.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, ...patch },
    update: patch,
  });
}

// ── Executor ─────────────────────────────────────────────────────────────

export interface RefreshRunResult {
  planId: string | null;
  targetsRun: string[];
  skipped: Array<{ target: string; reason: string }>;
  errors: Array<{ target: string; error: string }>;
  durationMs: number;
}

/**
 * Execute a refresh event end-to-end: plan → scoped recalculation →
 * dirty-state update → refresh_logs row. Never throws — a refresh failure
 * must not break the sync loop or an API response; it lands in the log.
 */
export async function runRefresh(
  prisma: PrismaClient,
  metaClient: MetaClient | null,
  event: RefreshEvent,
): Promise<RefreshRunResult> {
  const started = Date.now();
  const plan = planRefresh(event);
  const targetsRun: string[] = [];
  const componentDurations: Record<string, number> = {};
  const errors: Array<{ target: string; error: string }> = [];
  const skipped: Array<{ target: string; reason: string }> = [...plan.skipped];

  async function timed(target: RefreshTarget, work: () => Promise<unknown>): Promise<void> {
    const t0 = Date.now();
    try {
      await work();
      targetsRun.push(target);
    } catch (err) {
      errors.push({ target, error: err instanceof Error ? err.message : String(err) });
    } finally {
      componentDurations[target] = Date.now() - t0;
    }
  }

  const adAccountId = event.adAccountId;

  for (const target of plan.targets) {
    switch (target) {
      case 'autoComplete':
        if (event.type === 'MetaSyncCompleted') {
          await timed(target, () =>
            autoCompleteBudgetRecommendations(prisma, adAccountId, event.campaignChanges),
          );
        }
        break;
      case 'engines':
        await timed(target, () => runEngines(prisma, adAccountId));
        break;
      case 'brain':
        if (metaClient) {
          await timed(target, () => runBrainOrchestrator(prisma, metaClient, adAccountId));
        } else {
          skipped.push({ target, reason: 'no_meta_client_in_this_context' });
        }
        break;
      case 'recommendations':
        await timed(target, () =>
          new RecommendationEngine(prisma).run(EntityType.ACCOUNT, adAccountId, { asOf: new Date() }),
        );
        break;
      case 'health':
        await timed(target, () =>
          new HealthScoreEngine(prisma).run(EntityType.ACCOUNT, adAccountId, { asOf: new Date() }),
        );
        break;
      case 'platformStatsCache':
        await timed(target, async () => bustPlatformStatsCache());
        break;
    }
  }

  // Dirty-state: the account was just recalculated (or intentionally not).
  const now = new Date();
  try {
    await touchRefreshState(prisma, EntityType.ACCOUNT, adAccountId, {
      isDirty: false,
      ...(targetsRun.length > 0 ? { lastCalculatedAt: now } : {}),
      ...(event.type === 'MetaSyncCompleted' ? { lastMetaSyncAt: now } : {}),
      ...(event.type === 'RecommendationExecuted'
        ? { lastRecommendationExecutionAt: now, lastUserChangeAt: now }
        : {}),
      ...(event.type === 'RecommendationDismissed' ? { lastUserChangeAt: now } : {}),
    });
    if (event.type === 'MetaSyncCompleted') {
      for (const c of event.campaignChanges) {
        await touchRefreshState(prisma, EntityType.CAMPAIGN, c.campaignId, {
          isDirty: false,
          lastCalculatedAt: now,
          lastMetaSyncAt: now,
        });
      }
    }
  } catch (stateErr) {
    errors.push({ target: 'refreshState' as RefreshTarget, error: stateErr instanceof Error ? stateErr.message : String(stateErr) });
  }

  const durationMs = Date.now() - started;

  // Refresh log — the observability contract. Best-effort: a logging failure
  // must never fail the refresh itself.
  let planId: string | null = null;
  try {
    const row = await prisma.refreshLog.create({
      data: {
        adAccountId,
        trigger: event.type,
        sourceEvent: sanitizeEventForLog(event) as Prisma.InputJsonValue,
        componentsUpdated: targetsRun as unknown as Prisma.InputJsonValue,
        componentDurations: componentDurations as Prisma.InputJsonValue,
        skipped: skipped as unknown as Prisma.InputJsonValue,
        errors: errors as unknown as Prisma.InputJsonValue,
        durationMs,
      },
      select: { id: true },
    });
    planId = row.id;
  } catch (logErr) {
    console.error('[refresh] failed to write refresh_logs row:', logErr);
  }

  console.log(
    `[refresh:${adAccountId.slice(0, 8)}] ${event.type} → ran [${targetsRun.join(', ') || 'nothing'}]` +
    (skipped.length ? ` skipped [${skipped.map((s) => s.target).join(', ')}]` : '') +
    (errors.length ? ` ERRORS [${errors.map((e) => e.target).join(', ')}]` : '') +
    ` in ${durationMs}ms`,
  );

  return { planId, targetsRun, skipped, errors, durationMs };
}

/** Keep the stored event compact — campaign changes only carry safe fields. */
function sanitizeEventForLog(event: RefreshEvent): Record<string, unknown> {
  if (event.type === 'MetaSyncCompleted') {
    return {
      type: event.type,
      changedRows: event.changedRows,
      campaignChanges: event.campaignChanges.map((c) => ({
        campaignId: c.campaignId,
        kind: c.kind,
        prevBudgetMinor: c.prevBudgetMinor ?? null,
        newBudgetMinor: c.newBudgetMinor ?? null,
      })),
    };
  }
  return { type: event.type, itemKey: event.itemKey };
}
