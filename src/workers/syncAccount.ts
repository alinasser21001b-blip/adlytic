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

/**
 * Stable 32-bit integer hash of a string — safe as a Postgres advisory lock key.
 * Advisory locks take a bigint; we keep it positive and under 2^31 to stay within
 * the signed 32-bit range that pg_try_advisory_lock accepts as an int4 pair.
 */
function advisoryLockId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  // Force positive signed 32-bit integer
  return h >>> 1;
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
   *
   * Concurrency: uses a Postgres advisory lock (pg_try_advisory_lock) so that
   * multi-instance deployments are also protected. The lock is session-scoped —
   * if the Node process crashes the DB connection is dropped and Postgres
   * releases the lock automatically. No schema migration required.
   */
  async sync(adAccountId: string, opts: SyncOptions = {}): Promise<SyncResult> {
    const lockId = advisoryLockId(adAccountId);

    // Try to acquire a Postgres advisory lock — non-blocking (try_ variant).
    // Returns false immediately if another instance already holds it.
    const [{ pg_try_advisory_lock: acquired }] = await this.prisma.$queryRawUnsafe<
      [{ pg_try_advisory_lock: boolean }]
    >(`SELECT pg_try_advisory_lock($1)`, lockId);

    if (!acquired) {
      console.warn(`[sync:${adAccountId.slice(0, 8)}] Sync already in progress (advisory lock held) — skipping`);
      return {
        adAccountId,
        externalAccountId: adAccountId,
        rowsFetched: 0,
        rowsUpserted: 0,
        windowSince: '',
        windowUntil: '',
        durationMs: 0,
        ok: false,
        error: 'Sync already in progress for this account',
      };
    }

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
    } finally {
      // Release the advisory lock. This is a no-op if the connection was already
      // dropped (Postgres releases session locks automatically on disconnect).
      await this.prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock($1)`, lockId);
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
