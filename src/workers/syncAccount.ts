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

    const tag = `[sync:${acct.externalAccountId}]`;
    console.log(`${tag} SYNC START — window ${ymd(since)} → ${ymd(until)}`);

    try {
      // ─ Extract ────────────────────────────────────────────────────────
      console.log(`${tag} Fetching account-level insights from Meta…`);
      const rows = await this.meta.getInsights({
        externalId: acct.externalAccountId,
        level: "account",
        since,
        until,
      });
      result.rowsFetched = rows.length;
      console.log(`${tag} Fetched ${rows.length} insight rows`);

      if (rows.length === 0) {
        // Genuinely empty windows are valid (a fresh or paused account).
        // We still mark lastSyncedAt so the operator knows the call succeeded.
        console.log(`${tag} No insight rows returned — account may be paused or have no spend in window`);
        await this.markSynced(adAccountId, now);
        result.ok = true;
        result.durationMs = Date.now() - start;
        console.log(`${tag} SYNC COMPLETE (empty window) — ${result.durationMs}ms`);
        return result;
      }

      // ─ Transform + Load ──────────────────────────────────────────────
      console.log(`${tag} Saving raw insights (audit trail)…`);
      const rawBatch = rows.map((r) => ({
        entityType: EntityType.ACCOUNT,
        entityId: adAccountId,
        date: new Date(String(r.date_start)),
        rawJson: r,
      }));
      await this.rawRepo.appendMany(rawBatch);
      console.log(`${tag} Saved ${rawBatch.length} raw rows`);

      console.log(`${tag} Saving daily stats (upsert)…`);
      const dailyBatch = rows.map((r) => ({
        entityType: EntityType.ACCOUNT,
        entityId: adAccountId,
        insight: mapMetaInsight(r, { currencyMinorFactor: acct.currencyMinorFactor }),
      }));
      await this.dailyRepo.upsertMany(dailyBatch);
      console.log(`${tag} Upserted ${dailyBatch.length} daily stat rows`);

      result.rowsUpserted = dailyBatch.length;
      await this.markSynced(adAccountId, now);
      result.ok = true;
      result.durationMs = Date.now() - start;
      console.log(`${tag} SYNC COMPLETE — ${result.rowsUpserted} rows, ${result.durationMs}ms`);
      return result;
    } catch (e) {
      result.ok = false;
      result.error = e instanceof MetaApiError
        ? `Meta ${e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e);
      result.durationMs = Date.now() - start;
      console.error(`${tag} SYNC FAILED — ${result.error}`);
      if (e instanceof MetaApiError) {
        console.error(`${tag} Meta API error body:`, JSON.stringify(e.body).slice(0, 500));
      }
      // Intentionally do NOT mark synced on failure.
    }

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
