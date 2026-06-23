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

import { PrismaClient, EntityType, SyncJobStatus } from "@prisma/client";
import { MetaClient, MetaApiError } from "../services/metaClient";
import { mapMetaInsight } from "../mappers/insightMapper";
import { RawInsightsRepo } from "../repositories/rawInsightsRepo";
import { DailyStatsRepo } from "../repositories/dailyStatsRepo";

// ── Chunked sync constants ──────────────────────────────────────────────
/** Days per chunk. 7 keeps each Meta call small enough to dodge rate limits. */
const CHUNK_SIZE_DAYS = 7;
/** Politeness pause between chunks to keep Meta happy. */
const INTER_CHUNK_DELAY_MS = 300;

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

  // ════════════════════════════════════════════════════════════════════════
  //  LIFETIME TOTALS — one-shot account-level lifetime spend.
  //
  //  Bypasses the chunked DailyStat pipeline: Meta returns a single aggregated
  //  row for `date_preset=lifetime`, which we sum and write straight onto
  //  AdAccount. Cheap, idempotent, safe to call from OAuth callback as a
  //  fire-and-forget. Does NOT touch DailyStat or raw_insights.
  // ════════════════════════════════════════════════════════════════════════
  async syncLifetimeTotals(adAccountId: string): Promise<void> {
    const acct = await this.prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
    const tag = `[syncLifetime:${acct.externalAccountId}]`;
    try {
      console.log(`${tag} Fetching lifetime totals from Meta…`);
      const rows = await this.meta.getLifetimeTotals(acct.externalAccountId);
      let spendMajor = 0;
      for (const r of rows) {
        const v = r.spend;
        const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
        if (Number.isFinite(n)) spendMajor += n;
      }
      const spendMinor = BigInt(Math.round(spendMajor * acct.currencyMinorFactor));
      await this.prisma.adAccount.update({
        where: { id: adAccountId },
        data: {
          lifetimeSpendMinor: spendMinor,
          lifetimeSyncedAt: new Date(),
        },
      });
      console.log(`${tag} Lifetime spend updated — ${spendMinor.toString()} minor units (${rows.length} row${rows.length === 1 ? '' : 's'} aggregated)`);
    } catch (e) {
      const msg = e instanceof MetaApiError
        ? `Meta ${e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e);
      console.error(`${tag} FAILED — ${msg}`);
      // Non-fatal: lifetime is best-effort; the chunked sync still runs.
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CHUNKED SYNC — drives a SyncJob row over a configurable window.
  //
  //  Reads SyncJob.windowSince/until/windowDays from the DB (the route only
  //  persists intent — never passes args). Loops most-recent-first in
  //  7-day chunks; updates progress/chunksDone/cursorDate after each chunk.
  //
  //  Same idempotency guarantees as `sync()` — daily_stats upserts on the
  //  composite unique key, so partial completions converge on retry.
  // ════════════════════════════════════════════════════════════════════════
  async syncChunked(jobId: string): Promise<void> {
    const job = await this.prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } });
    const adAccountId = job.adAccountId;
    const lockId = advisoryLockId(adAccountId);
    const tag = `[syncChunked:${jobId.slice(0, 8)}]`;

    // Advisory lock — belt-and-suspenders alongside the SyncJob status row.
    const [{ pg_try_advisory_lock: acquired }] = await this.prisma.$queryRawUnsafe<
      [{ pg_try_advisory_lock: boolean }]
    >(`SELECT pg_try_advisory_lock($1)`, lockId);

    if (!acquired) {
      console.warn(`${tag} Advisory lock held — another sync running. Marking FAILED.`);
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: SyncJobStatus.FAILED,
          error: 'Another sync is already in progress for this account',
          completedAt: new Date(),
        },
      });
      return;
    }

    const acct = await this.prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
    const since = job.windowSince;
    const until = job.windowUntil;

    // Build chunks: most-recent-first, CHUNK_SIZE_DAYS each, last chunk may be short.
    const chunks: Array<{ since: Date; until: Date }> = [];
    let cursor = new Date(until);
    while (cursor.getTime() >= since.getTime()) {
      const chunkUntil = new Date(cursor);
      const chunkSince = new Date(cursor.getTime() - (CHUNK_SIZE_DAYS - 1) * 86400 * 1000);
      const clampedSince = chunkSince.getTime() < since.getTime() ? new Date(since) : chunkSince;
      chunks.push({ since: clampedSince, until: chunkUntil });
      cursor = new Date(clampedSince.getTime() - 86400 * 1000);
    }

    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: SyncJobStatus.PROCESSING,
        startedAt: new Date(),
        chunksTotal: chunks.length,
      },
    });

    console.log(`${tag} START — ${chunks.length} chunks over ${ymd(since)} → ${ymd(until)}`);

    let totalFetched = 0;
    let totalUpserted = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        console.log(`${tag} chunk ${i + 1}/${chunks.length} — ${ymd(chunk.since)} → ${ymd(chunk.until)}`);

        const rows = await this.meta.getInsights({
          externalId: acct.externalAccountId,
          level: 'account',
          since: chunk.since,
          until: chunk.until,
        });
        totalFetched += rows.length;

        if (rows.length > 0) {
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
          totalUpserted += dailyBatch.length;
        }

        const chunksDone = i + 1;
        const progress = Math.round((chunksDone / chunks.length) * 100);
        await this.prisma.syncJob.update({
          where: { id: jobId },
          data: {
            chunksDone,
            progress,
            cursorDate: chunk.since,
            rowsFetched: totalFetched,
            rowsUpserted: totalUpserted,
          },
        });

        if (i < chunks.length - 1) await sleep(INTER_CHUNK_DELAY_MS);
      }

      await this.markSynced(adAccountId, new Date());
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: SyncJobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
        },
      });
      console.log(`${tag} COMPLETE — ${totalUpserted} rows upserted across ${chunks.length} chunks`);
    } catch (e) {
      const error = e instanceof MetaApiError
        ? `Meta ${e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e);
      console.error(`${tag} FAILED — ${error}`);
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: SyncJobStatus.FAILED,
          error,
          completedAt: new Date(),
        },
      });
    } finally {
      await this.prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock($1)`, lockId);
    }
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
