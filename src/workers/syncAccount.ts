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

import { PrismaClient, EntityType, EntityStatus, SyncJobStatus, Prisma } from "@prisma/client";
import { MetaClient, MetaApiError } from "../services/metaClient";
import { mapMetaInsight } from "../mappers/insightMapper";
import { mapMetaAdSet, mapMetaAd } from "../mappers/creativeMapper";
import { RawInsightsRepo } from "../repositories/rawInsightsRepo";
import { DailyStatsRepo } from "../repositories/dailyStatsRepo";

// ── Chunked sync constants ──────────────────────────────────────────────
/** Days per chunk. 7 keeps each Meta call small enough to dodge rate limits. */
const CHUNK_SIZE_DAYS = 7;
/** Politeness pause between chunks to keep Meta happy. */
const INTER_CHUNK_DELAY_MS = 300;
/** Parallel campaign-insight fetches. 3 balances throughput vs Meta rate limits. */
const CAMPAIGN_CONCURRENCY = 3;

/**
 * Defensive map: Meta's campaign status strings → our EntityStatus enum.
 * Meta returns lowercase variants and occasional review states that aren't
 * in our enum. Unknown values fall back to ARCHIVED so an unexpected string
 * never throws inside an upsert (and never silently masquerades as ACTIVE).
 */
function mapMetaCampaignStatus(raw: unknown): EntityStatus {
  return mapMetaEntityStatus(raw);
}

/**
 * Same rules as campaign-status, shared with ad-sets and ads in Phase 5.
 * Meta's `effective_status` enum has many transient states (DISAPPROVED,
 * PENDING_REVIEW, IN_PROCESS, WITH_ISSUES, …) that aren't actionable to us;
 * we collapse them to ARCHIVED so a sync run never silently surfaces them
 * as ACTIVE.
 */
function mapMetaEntityStatus(raw: unknown): EntityStatus {
  const s = String(raw ?? "").toUpperCase();
  switch (s) {
    case "ACTIVE":   return EntityStatus.ACTIVE;
    case "PAUSED":   return EntityStatus.PAUSED;
    case "DELETED":  return EntityStatus.DELETED;
    case "ARCHIVED": return EntityStatus.ARCHIVED;
    default:         return EntityStatus.ARCHIVED;
  }
}

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
  //  CAMPAIGN DISCOVERY + CAMPAIGN-LEVEL DAILY STATS
  //
  //  Without Campaign rows, the brain orchestrator returns "no campaigns
  //  under account — nothing to do" and the V2 cognitive layer can't build
  //  market baselines (both query prisma.campaign by adAccountId).
  //
  //  This method:
  //    1. Lists campaigns from Meta and upserts the Campaign table on
  //       (adAccountId, externalCampaignId) — idempotent.
  //    2. For each campaign, pulls campaign-level daily insights over the
  //       supplied window, maps them, and upserts DailyStat with
  //       entityType=CAMPAIGN, entityId=internal Campaign.id (NOT Meta id —
  //       the brain joins on the internal cuid).
  //
  //  Concurrency=3 balances throughput against Meta's per-account rate
  //  limits; raw_insights is intentionally NOT written here (audit trail
  //  for accounts is sufficient for now; revisit if attribution disputes
  //  require per-campaign provenance).
  // ════════════════════════════════════════════════════════════════════════
  async syncCampaigns(
    adAccountId: string,
    opts: { since: Date; until: Date }
  ): Promise<{ campaignsUpserted: number; dailyRowsUpserted: number }> {
    const acct = await this.prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
    const tag = `[syncCampaigns:${acct.externalAccountId}]`;
    console.log(`${tag} listing campaigns…`);

    const metaCampaigns = await this.meta.listCampaigns(acct.externalAccountId);
    console.log(`${tag} fetched ${metaCampaigns.length} campaign(s) from Meta`);

    // ── Upsert Campaign rows in a single transaction ──────────────────────
    await this.prisma.$transaction(
      metaCampaigns.map((mc) => {
        const externalId = String(mc['id']);
        const name = String(mc['name'] ?? '(unnamed)');
        const objective = mc['objective'] != null ? String(mc['objective']) : null;
        const status = mapMetaCampaignStatus(mc['status']);
        const dailyBudget = mc['daily_budget'] != null
          ? BigInt(String(mc['daily_budget']))
          : null;
        const lifetimeBudget = mc['lifetime_budget'] != null
          ? BigInt(String(mc['lifetime_budget']))
          : null;

        return this.prisma.campaign.upsert({
          where: { adAccountId_externalCampaignId: { adAccountId, externalCampaignId: externalId } },
          create: {
            adAccountId,
            externalCampaignId: externalId,
            name,
            objective,
            status,
            dailyBudget,
            lifetimeBudget,
          },
          update: {
            name,
            objective,
            status,
            dailyBudget,
            lifetimeBudget,
          },
        });
      })
    );

    // Re-read with internal IDs so we can write DailyStat rows.
    const campaigns = await this.prisma.campaign.findMany({ where: { adAccountId } });
    console.log(`${tag} upserted ${campaigns.length} campaign row(s) — now pulling daily insights…`);

    let totalDailyUpserted = 0;

    // ── Bounded-concurrency loop over campaigns ───────────────────────────
    for (let i = 0; i < campaigns.length; i += CAMPAIGN_CONCURRENCY) {
      const slice = campaigns.slice(i, i + CAMPAIGN_CONCURRENCY);
      const results = await Promise.allSettled(
        slice.map(async (camp) => {
          const rows = await this.meta.getInsights({
            externalId: camp.externalCampaignId,
            level: 'campaign',
            since: opts.since,
            until: opts.until,
          });
          if (rows.length === 0) return 0;

          const dailyBatch = rows.map((r) => ({
            entityType: EntityType.CAMPAIGN,
            entityId: camp.id,
            insight: mapMetaInsight(r, { currencyMinorFactor: acct.currencyMinorFactor }),
          }));
          await this.dailyRepo.upsertMany(dailyBatch);
          return dailyBatch.length;
        })
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j]!;
        const camp = slice[j]!;
        if (r.status === 'fulfilled') {
          totalDailyUpserted += r.value;
        } else {
          const err = r.reason;
          const msg = err instanceof MetaApiError
            ? `Meta ${err.status}: ${err.message}`
            : err instanceof Error ? err.message : String(err);
          console.error(`${tag} campaign=${camp.externalCampaignId} insights FAILED — ${msg}`);
          // Continue with other campaigns; partial success is better than abort.
        }
      }

      if (i + CAMPAIGN_CONCURRENCY < campaigns.length) {
        await sleep(INTER_CHUNK_DELAY_MS);
      }
    }

    console.log(`${tag} done — ${campaigns.length} campaigns, ${totalDailyUpserted} daily rows`);
    return { campaignsUpserted: campaigns.length, dailyRowsUpserted: totalDailyUpserted };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  AD-SET + AD + CREATIVE DISCOVERY  (Phase 5 — Pass A + B)
  //
  //  Walks every campaign already persisted under `adAccountId`, fetches its
  //  ad sets and ads, and upserts the AdSet / Ad / AdCreative tables.
  //
  //  Key design choices:
  //
  //    1. Discovery only — NO insights pull here. Daily stats for ads/ad-sets
  //       are deliberately deferred (the Brain still operates at campaign
  //       level for Phase 1). Adding ad-level DailyStat is a future Pass D.
  //
  //    2. Creative dedupe — many Meta ads share one creative (boosted post,
  //       carousel reused, etc.). We upsert AdCreative on
  //       (adAccountId, externalCreativeId) FIRST, then point Ad.creativeId
  //       at it. Net effect: 100 ads using 1 creative = 1 AdCreative row.
  //
  //    3. Bounded concurrency — campaigns processed in batches of
  //       CAMPAIGN_CONCURRENCY; INTER_CHUNK_DELAY_MS pause between batches.
  //       Inside a campaign we serialize ad-sets to keep total RPS under
  //       Meta's per-account rate ceiling.
  //
  //    4. Fault isolation — Promise.allSettled at the campaign level and
  //       try/catch around each ad-set fetch so one bad campaign cannot
  //       abort the whole pass. Errors are logged with context.
  // ════════════════════════════════════════════════════════════════════════
  async syncAdSetsAndAds(
    adAccountId: string
  ): Promise<{ adSetsUpserted: number; adsUpserted: number; creativesUpserted: number }> {
    const acct = await this.prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
    const tag = `[syncAdsAndCreatives:${acct.externalAccountId}]`;

    const campaigns = await this.prisma.campaign.findMany({
      where: { adAccountId },
      select: { id: true, externalCampaignId: true, name: true },
    });
    if (campaigns.length === 0) {
      console.log(`${tag} no campaigns under account — nothing to discover`);
      return { adSetsUpserted: 0, adsUpserted: 0, creativesUpserted: 0 };
    }

    console.log(`${tag} walking ${campaigns.length} campaign(s) for ad-sets, ads, and creatives…`);

    let adSetsUpserted = 0;
    let adsUpserted = 0;
    let creativesUpserted = 0;
    // Track creative dedupe inside a single run so we don't issue redundant
    // upserts when N ads in the same batch share one creative.
    const creativeIdCache = new Map<string, string>();   // externalCreativeId → internal AdCreative.id

    for (let i = 0; i < campaigns.length; i += CAMPAIGN_CONCURRENCY) {
      const slice = campaigns.slice(i, i + CAMPAIGN_CONCURRENCY);

      const settled = await Promise.allSettled(
        slice.map(async (camp) => {
          // ── Pass A: AdSets ─────────────────────────────────────────────
          const metaAdSets = await this.meta.listAdSets(camp.externalCampaignId);
          let localAdSets = 0;
          let localAds = 0;
          let localCreatives = 0;

          for (const rawAdSet of metaAdSets) {
            const norm = mapMetaAdSet(rawAdSet);
            const adSetRow = await this.prisma.adSet.upsert({
              where: {
                campaignId_externalAdSetId: {
                  campaignId: camp.id,
                  externalAdSetId: norm.externalAdSetId,
                },
              },
              create: {
                campaignId: camp.id,
                externalAdSetId: norm.externalAdSetId,
                name: norm.name,
                status: mapMetaEntityStatus(norm.status),
                dailyBudget: norm.dailyBudgetMinor,
                optimizationGoal: norm.optimizationGoal,
                targetingJson: norm.targeting as Prisma.InputJsonValue ?? Prisma.JsonNull,
              },
              update: {
                name: norm.name,
                status: mapMetaEntityStatus(norm.status),
                dailyBudget: norm.dailyBudgetMinor,
                optimizationGoal: norm.optimizationGoal,
                targetingJson: norm.targeting as Prisma.InputJsonValue ?? Prisma.JsonNull,
              },
              select: { id: true },
            });
            localAdSets++;

            // ── Pass B: Ads under this ad-set (+ inline creatives) ──────
            const metaAds = await this.meta.listAds(norm.externalAdSetId);

            for (const rawAd of metaAds) {
              const adNorm = mapMetaAd(rawAd);

              // Resolve/upsert creative FIRST so we have its internal id
              // for the Ad.creativeId FK.
              let creativeInternalId: string | null = null;
              if (adNorm.creative) {
                const cached = creativeIdCache.get(adNorm.creative.externalCreativeId);
                if (cached) {
                  creativeInternalId = cached;
                } else {
                  const cRow = await this.prisma.adCreative.upsert({
                    where: {
                      adAccountId_externalCreativeId: {
                        adAccountId,
                        externalCreativeId: adNorm.creative.externalCreativeId,
                      },
                    },
                    create: {
                      adAccountId,
                      externalCreativeId: adNorm.creative.externalCreativeId,
                      name: adNorm.creative.name,
                      thumbnailUrl: adNorm.creative.thumbnailUrl,
                      imageHash: adNorm.creative.imageHash,
                      videoId: adNorm.creative.videoId,
                      primaryText: adNorm.creative.primaryText,
                      headline: adNorm.creative.headline,
                      description: adNorm.creative.description,
                      callToActionType: adNorm.creative.callToActionType,
                      raw: adNorm.creative.raw as Prisma.InputJsonValue,
                    },
                    update: {
                      name: adNorm.creative.name,
                      thumbnailUrl: adNorm.creative.thumbnailUrl,
                      imageHash: adNorm.creative.imageHash,
                      videoId: adNorm.creative.videoId,
                      primaryText: adNorm.creative.primaryText,
                      headline: adNorm.creative.headline,
                      description: adNorm.creative.description,
                      callToActionType: adNorm.creative.callToActionType,
                      raw: adNorm.creative.raw as Prisma.InputJsonValue,
                    },
                    select: { id: true },
                  });
                  creativeInternalId = cRow.id;
                  creativeIdCache.set(adNorm.creative.externalCreativeId, cRow.id);
                  localCreatives++;
                }
              }

              await this.prisma.ad.upsert({
                where: {
                  adSetId_externalAdId: {
                    adSetId: adSetRow.id,
                    externalAdId: adNorm.externalAdId,
                  },
                },
                create: {
                  adSetId: adSetRow.id,
                  externalAdId: adNorm.externalAdId,
                  name: adNorm.name,
                  status: mapMetaEntityStatus(adNorm.status),
                  creativeId: creativeInternalId,
                  // Keep the legacy blob populated until consumers migrate fully.
                  creativeJson: (adNorm.creative?.raw as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                },
                update: {
                  name: adNorm.name,
                  status: mapMetaEntityStatus(adNorm.status),
                  creativeId: creativeInternalId,
                  creativeJson: (adNorm.creative?.raw as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                },
              });
              localAds++;
            }
          }

          return { localAdSets, localAds, localCreatives, campLabel: camp.externalCampaignId };
        })
      );

      for (let j = 0; j < settled.length; j++) {
        const r = settled[j]!;
        const camp = slice[j]!;
        if (r.status === 'fulfilled') {
          adSetsUpserted += r.value.localAdSets;
          adsUpserted += r.value.localAds;
          creativesUpserted += r.value.localCreatives;
        } else {
          const err = r.reason;
          const msg = err instanceof MetaApiError
            ? `Meta ${err.status}: ${err.message}`
            : err instanceof Error ? err.message : String(err);
          console.error(`${tag} campaign=${camp.externalCampaignId} ad-set/ad sync FAILED — ${msg}`);
          // Continue with other campaigns; partial success is better than abort.
        }
      }

      if (i + CAMPAIGN_CONCURRENCY < campaigns.length) {
        await sleep(INTER_CHUNK_DELAY_MS);
      }
    }

    console.log(`${tag} done — ${adSetsUpserted} ad-sets, ${adsUpserted} ads, ${creativesUpserted} creatives`);
    return { adSetsUpserted, adsUpserted, creativesUpserted };
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

      // Campaign discovery + campaign-level daily stats. Same window as the
      // account-level sync so the brain orchestrator has matching data when
      // it joins on Campaign.id → DailyStat.entityId. Non-fatal: failures
      // here don't roll back the account-level rows already written.
      try {
        const campResult = await this.syncCampaigns(adAccountId, { since, until });
        console.log(`${tag} campaigns: ${campResult.campaignsUpserted} upserted, ${campResult.dailyRowsUpserted} daily rows`);
      } catch (e) {
        const msg = e instanceof MetaApiError
          ? `Meta ${e.status}: ${e.message}`
          : e instanceof Error ? e.message : String(e);
        console.error(`${tag} syncCampaigns FAILED (non-fatal) — ${msg}`);
      }

      // Phase 5 Pass A + B — discover ad-sets, ads, and dedupe creatives.
      // Non-fatal so an outage on this newer surface area cannot regress the
      // already-working account/campaign sync. Runs AFTER syncCampaigns so the
      // Campaign rows it walks are guaranteed to exist.
      try {
        const adsResult = await this.syncAdSetsAndAds(adAccountId);
        console.log(
          `${tag} ads/creatives: ${adsResult.adSetsUpserted} ad-sets, ` +
          `${adsResult.adsUpserted} ads, ${adsResult.creativesUpserted} creatives`
        );
      } catch (e) {
        const msg = e instanceof MetaApiError
          ? `Meta ${e.status}: ${e.message}`
          : e instanceof Error ? e.message : String(e);
        console.error(`${tag} syncAdSetsAndAds FAILED (non-fatal) — ${msg}`);
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
