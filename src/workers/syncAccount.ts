// ════════════════════════════════════════════════════════════════════════
//  src/workers/syncAccount.ts
//
//  ETL ORCHESTRATOR for one ad account.
//
//    Extract:    metaClient.getInsights(...)
//    Transform:  mapMetaInsight(...)
//    Load:       rawInsightsRepo.append + dailyStatsRepo.upsert
//
//  This worker NEVER writes to: metric_trends, detected_issues, knowledge_rules,
//  recommendations, health_scores. Those are downstream engines' jobs.
//
//  Idempotent: re-running over the same window converges, because daily_stats
//  is upserted on (entity_type, entity_id, date). raw_insights is append-only
//  by design — re-runs accumulate raw rows, which is correct (an audit trail).
//
//  Backfill window: Meta's attribution updates results for ~72 hours. The
//  worker re-pulls the last `backfillDays` (default 3) every run so updated
//  numbers overwrite stale daily_stats. This is a FEATURE of upsert, not a bug.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import { MetaClient, MetaApiError } from "../services/metaClient";
import { mapMetaInsight } from "../mappers/insightMapper";
import { RawInsightsRepo } from "../repositories/rawInsightsRepo";
import { DailyStatsRepo } from "../repositories/dailyStatsRepo";

export interface SyncResult {
  adAccountId: string;
  externalAccountId: string;
  rowsFetched: number;
  rowsUpserted: number;
  windowSince: string;
  windowUntil: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface SyncOptions {
  /** Days back to pull each run. ≥3 to capture Meta's attribution backfill. */
  backfillDays?: number;
  /** Override "now" — useful for tests and replays. */
  now?: Date;
}

export class SyncAccountWorker {
  private rawRepo: RawInsightsRepo;
  private dailyRepo: DailyStatsRepo;

  constructor(
    private prisma: PrismaClient,
    private meta: MetaClient
  ) {
    this.rawRepo = new RawInsightsRepo(prisma);
    this.dailyRepo = new DailyStatsRepo(prisma);
  }

  /**
   * Sync ONE ad account at the ACCOUNT level (Phase 1 scope).
   * Campaign/adset/ad-level sync is a strict extension — same pipeline,
   * different `level` and `entityType`. Add when the dashboard needs them.
   */
  async sync(adAccountId: string, opts: SyncOptions = {}): Promise<SyncResult> {
    const start = Date.now();
    const now = opts.now ?? new Date();
    const backfillDays = Math.max(1, opts.backfillDays ?? 3);

    const since = new Date(now.getTime() - backfillDays * 86400 * 1000);
    const until = now;

    const acct = await this.prisma.adAccount.findUniqueOrThrow({
      where: { id: adAccountId },
    });

    const result: SyncResult = {
      adAccountId,
      externalAccountId: acct.externalAccountId,
      rowsFetched: 0,
      rowsUpserted: 0,
      windowSince: ymd(since),
      windowUntil: ymd(until),
      durationMs: 0,
      ok: false,
    };

    try {
      // ─ Extract ────────────────────────────────────────────────────────
      const rows = await this.meta.getInsights({
        externalId: acct.externalAccountId,
        level: "account",
        since,
        until,
      });
      result.rowsFetched = rows.length;

      if (rows.length === 0) {
        // Genuinely empty windows are valid (a fresh or paused account).
        // We still mark lastSyncedAt so the operator knows the call succeeded.
        await this.markSynced(adAccountId, now);
        result.ok = true;
        result.durationMs = Date.now() - start;
        return result;
      }

      // ─ Transform + Load ──────────────────────────────────────────────
      // Raw first (append-only audit trail) → daily second (upsert).
      // If daily_stats write fails for one row, raw still has it for replay.
      const rawBatch = rows.map((r) => ({
        entityType: EntityType.ACCOUNT,
        entityId: adAccountId,
        date: new Date(String(r.date_start)),
        rawJson: r,
      }));
      await this.rawRepo.appendMany(rawBatch);

      const dailyBatch = rows.map((r) => ({
        entityType: EntityType.ACCOUNT,
        entityId: adAccountId,
        insight: mapMetaInsight(r, { currencyMinorFactor: acct.currencyMinorFactor }),
      }));
      await this.dailyRepo.upsertMany(dailyBatch);

      result.rowsUpserted = dailyBatch.length;
      await this.markSynced(adAccountId, now);
      result.ok = true;
    } catch (e) {
      result.ok = false;
      result.error = e instanceof MetaApiError
        ? `Meta ${e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e);
      // Intentionally do NOT mark synced on failure.
    }

    result.durationMs = Date.now() - start;
    return result;
  }

  private async markSynced(adAccountId: string, when: Date) {
    await this.prisma.adAccount.update({
      where: { id: adAccountId },
      data: { lastSyncedAt: when },
    });
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
