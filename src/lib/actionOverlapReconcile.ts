// ════════════════════════════════════════════════════════════════════════
//  src/lib/actionOverlapReconcile.ts — HISTORICAL ACTION-OVERLAP REPAIR
//
//  ── The problem ────────────────────────────────────────────────────────
//  Before P3.5, the mapper SUMMED overlapping Meta action types. Rows written
//  by that mapper can carry inflated `purchases`, `leads` and `revenueMinor`
//  (and therefore ROAS). Rows written before P0/P3 also carry `linkClicks = 0`
//  and `landingPageViews = 0` because those columns did not exist yet.
//
//  ── Why replay, not re-fetch (strategy C) ──────────────────────────────
//  Adlytic persists the raw Meta payload per (entityType, entityId, date) in
//  `raw_insights`, retained RAW_INSIGHTS_RETAIN_DAYS (default 90). So the
//  correct numbers can be RECOMPUTED LOCALLY by replaying the fixed mapper
//  over data already on disk.
//
//  Rejected alternatives:
//    A — historical re-sync from Meta. Thousands of extra Graph calls against
//        an access-tier budget gated on 500 successful calls and <15% errors.
//        Same answer, real risk, for data we already hold.
//    B — convergence via normal sync. The sync window is 7 days
//        (syncAccount backfillDays), so anything older NEVER heals. Not a
//        strategy, just a slower version of doing nothing.
//
//  ── Guarantees ─────────────────────────────────────────────────────────
//  idempotent  — recomputes from the immutable raw payload; re-running
//                converges to the same values, never compounds.
//  bounded     — hard row cap per invocation; the caller paginates.
//  observable  — returns a full report; never silently rewrites.
//  retryable   — per-row failures are isolated and counted, not fatal.
//  interruptible — each row is its own update; stopping mid-run leaves a
//                consistent (partially reconciled) table.
//  honest      — a row with NO raw payload is reported as SKIPPED_NO_RAW and
//                left untouched. An unreconstructable number stays as it is,
//                flagged, rather than being replaced by a fabricated one.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import { mapMetaInsight } from '../mappers/insightMapper';
import type { MetaInsightRow } from '../services/metaClient';

/** Hard cap per invocation so a run can never become unbounded. */
export const DEFAULT_BATCH_LIMIT = 500;
export const MAX_BATCH_LIMIT = 5_000;

export type RowOutcome =
  | 'CORRECTED'         // stored values disagreed with the replay; fixed
  | 'ALREADY_CORRECT'   // replay matched storage; nothing written
  | 'SKIPPED_NO_RAW'    // no raw payload retained — cannot verify, left alone
  | 'FAILED';           // replay threw; row untouched, counted

export interface RowResult {
  dailyStatId: string;
  entityType: EntityType;
  entityId: string;
  date: string;
  outcome: RowOutcome;
  /** Only present for CORRECTED — the fields that actually changed. */
  changes?: Record<string, { from: number; to: number }>;
  error?: string;
}

export interface ReconcileReport {
  scanned: number;
  corrected: number;
  alreadyCorrect: number;
  skippedNoRaw: number;
  failed: number;
  /** True when the batch limit was hit — the caller should run again. */
  hasMore: boolean;
  /** Cursor for the next page: the last dailyStat id processed. */
  nextCursor: string | null;
  /** Aggregate deltas, for reporting the real-world impact of the repair. */
  totals: {
    purchasesBefore: number; purchasesAfter: number;
    leadsBefore: number; leadsAfter: number;
    revenueBeforeMinor: number; revenueAfterMinor: number;
  };
  /** Per-row detail. Capped so the report itself stays bounded. */
  rows: RowResult[];
}

export interface ReconcileOptions {
  /** Max rows to process. Clamped to MAX_BATCH_LIMIT. */
  limit?: number;
  /** Resume from a previous run's nextCursor. */
  cursor?: string | null;
  /** Restrict to one account's entities (entityId list). */
  entityIds?: string[];
  /** Only rows on/after this date. */
  since?: Date;
  /** When true, compute and report but write NOTHING. */
  dryRun?: boolean;
  /** Cap on rows included in `report.rows`. Default 100. */
  maxDetailRows?: number;
}

const FIELDS = ['purchases', 'leads', 'revenueMinor', 'linkClicks', 'landingPageViews', 'messages'] as const;
type Field = typeof FIELDS[number];

/**
 * Replay the corrected mapper over stored raw payloads and repair drifted rows.
 *
 * Reads `raw_insights` and rewrites only the action-derived columns. Spend,
 * impressions, reach and clicks are deliberately NOT touched: they come from
 * scalar Meta fields that never had an overlap problem, and rewriting them
 * would widen the blast radius for no benefit.
 */
export async function reconcileActionOverlap(
  prisma: PrismaClient,
  opts: ReconcileOptions = {},
): Promise<ReconcileReport> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_BATCH_LIMIT), MAX_BATCH_LIMIT);
  const maxDetail = Math.max(0, opts.maxDetailRows ?? 100);

  const report: ReconcileReport = {
    scanned: 0, corrected: 0, alreadyCorrect: 0, skippedNoRaw: 0, failed: 0,
    hasMore: false, nextCursor: null,
    totals: {
      purchasesBefore: 0, purchasesAfter: 0,
      leadsBefore: 0, leadsAfter: 0,
      revenueBeforeMinor: 0, revenueAfterMinor: 0,
    },
    rows: [],
  };

  const stats = await prisma.dailyStat.findMany({
    where: {
      ...(opts.entityIds?.length ? { entityId: { in: opts.entityIds } } : {}),
      ...(opts.since ? { date: { gte: opts.since } } : {}),
      ...(opts.cursor ? { id: { gt: opts.cursor } } : {}),
    },
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true, entityType: true, entityId: true, date: true,
      purchases: true, leads: true, revenueMinor: true,
      linkClicks: true, landingPageViews: true, messages: true,
    },
  });

  if (stats.length === 0) return report;
  report.hasMore = stats.length === limit;
  report.nextCursor = stats[stats.length - 1]!.id;

  // One query for every raw payload in this batch — never one per row (N+1).
  const raws = await prisma.rawInsight.findMany({
    where: {
      OR: stats.map((s) => ({
        entityType: s.entityType, entityId: s.entityId, date: s.date,
      })),
    },
    select: { entityType: true, entityId: true, date: true, rawJson: true, fetchedAt: true },
    orderBy: { fetchedAt: 'asc' },
  });
  const rawKey = (t: EntityType, e: string, d: Date) => `${t}|${e}|${d.toISOString().slice(0, 10)}`;
  const rawByKey = new Map<string, unknown>();
  // Latest fetch wins — ordered ascending, so later writes overwrite earlier.
  for (const r of raws) rawByKey.set(rawKey(r.entityType, r.entityId, r.date), r.rawJson);

  // Currency factor per account, so the replayed revenue scales identically to
  // the original write. Fetched once per batch, not per row.
  const accountIds = [...new Set(stats.filter((s) => s.entityType === EntityType.ACCOUNT).map((s) => s.entityId))];
  const campaignIds = [...new Set(stats.filter((s) => s.entityType === EntityType.CAMPAIGN).map((s) => s.entityId))];
  const [accounts, campaigns] = await Promise.all([
    accountIds.length
      ? prisma.adAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, currencyMinorFactor: true } })
      : Promise.resolve([]),
    campaignIds.length
      ? prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, adAccount: { select: { currencyMinorFactor: true } } },
        })
      : Promise.resolve([]),
  ]);
  const factorByEntity = new Map<string, number>();
  for (const a of accounts) factorByEntity.set(a.id, a.currencyMinorFactor);
  for (const c of campaigns) factorByEntity.set(c.id, c.adAccount?.currencyMinorFactor ?? 100);

  for (const s of stats) {
    report.scanned++;
    const dateStr = s.date.toISOString().slice(0, 10);
    const raw = rawByKey.get(rawKey(s.entityType, s.entityId, s.date));

    if (!raw || typeof raw !== 'object') {
      // No retained payload — we cannot verify this row. Leave it EXACTLY as
      // it is and say so. Guessing a correction here would be fabrication.
      report.skippedNoRaw++;
      if (report.rows.length < maxDetail) {
        report.rows.push({
          dailyStatId: s.id, entityType: s.entityType, entityId: s.entityId,
          date: dateStr, outcome: 'SKIPPED_NO_RAW',
        });
      }
      continue;
    }

    try {
      const factor = factorByEntity.get(s.entityId) ?? 100;
      const replayed = mapMetaInsight(raw as MetaInsightRow, { currencyMinorFactor: factor });

      const stored: Record<Field, number> = {
        purchases: Number(s.purchases),
        leads: Number(s.leads),
        revenueMinor: Number(s.revenueMinor),
        linkClicks: Number(s.linkClicks),
        landingPageViews: Number(s.landingPageViews),
        messages: Number(s.messages),
      };
      const fresh: Record<Field, number> = {
        purchases: replayed.purchases,
        leads: replayed.leads,
        revenueMinor: replayed.revenueMinor,
        linkClicks: replayed.linkClicks,
        landingPageViews: replayed.landingPageViews,
        messages: replayed.messages,
      };

      const changes: Record<string, { from: number; to: number }> = {};
      for (const f of FIELDS) {
        if (stored[f] !== fresh[f]) changes[f] = { from: stored[f], to: fresh[f] };
      }

      report.totals.purchasesBefore += stored.purchases;
      report.totals.purchasesAfter += fresh.purchases;
      report.totals.leadsBefore += stored.leads;
      report.totals.leadsAfter += fresh.leads;
      report.totals.revenueBeforeMinor += stored.revenueMinor;
      report.totals.revenueAfterMinor += fresh.revenueMinor;

      if (Object.keys(changes).length === 0) {
        report.alreadyCorrect++;
        continue;
      }

      if (!opts.dryRun) {
        await prisma.dailyStat.update({
          where: { id: s.id },
          data: {
            purchases: BigInt(fresh.purchases),
            leads: BigInt(fresh.leads),
            revenueMinor: BigInt(fresh.revenueMinor),
            linkClicks: BigInt(fresh.linkClicks),
            landingPageViews: BigInt(fresh.landingPageViews),
            messages: BigInt(fresh.messages),
            // ROAS is derived; recompute from the corrected revenue so it can
            // never keep a value implied by the inflated figure.
            roas: replayed.roas,
          },
        });
      }

      report.corrected++;
      if (report.rows.length < maxDetail) {
        report.rows.push({
          dailyStatId: s.id, entityType: s.entityType, entityId: s.entityId,
          date: dateStr, outcome: 'CORRECTED', changes,
        });
      }
    } catch (e: any) {
      // Isolated: one malformed payload must not abort the batch.
      report.failed++;
      if (report.rows.length < maxDetail) {
        report.rows.push({
          dailyStatId: s.id, entityType: s.entityType, entityId: s.entityId,
          date: dateStr, outcome: 'FAILED', error: String(e?.message ?? e).slice(0, 200),
        });
      }
    }
  }

  return report;
}

/** One-line summary for logs. Never includes tokens or payload contents. */
export function summarizeReconcile(r: ReconcileReport): string {
  return [
    `scanned=${r.scanned}`,
    `corrected=${r.corrected}`,
    `ok=${r.alreadyCorrect}`,
    `noRaw=${r.skippedNoRaw}`,
    `failed=${r.failed}`,
    `purchases=${r.totals.purchasesBefore}->${r.totals.purchasesAfter}`,
    `leads=${r.totals.leadsBefore}->${r.totals.leadsAfter}`,
    `revenueMinor=${r.totals.revenueBeforeMinor}->${r.totals.revenueAfterMinor}`,
    `hasMore=${r.hasMore}`,
  ].join(' ');
}
