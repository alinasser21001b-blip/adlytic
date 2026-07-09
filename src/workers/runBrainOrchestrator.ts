// ════════════════════════════════════════════════════════════════════════
//  src/workers/runBrainOrchestrator.ts
//
//  Final closure of the V6 AdlyticBrain V2 pipeline.
//
//  This worker is the ONE place in the codebase that wires together:
//
//      DailyStat (V1 baseline & raw) ──┐
//                                       │
//      v2ContextAssembler ──┐           │
//        (Meta API + DB)    ▼           ▼
//                          runBrainForCampaign(raw, baseline, v2Inputs?)
//                                       │
//                                       ▼
//                          persistBrainBatch(prisma, ...)
//
//  Architectural guardrails (signed off by user 2026-06-22):
//
//    1. Concurrency: campaigns are processed in chunks of CONCURRENCY_LIMIT
//       to stay well under Meta's per-app/per-account rate limits.
//
//    2. Fault tolerance: each campaign is wrapped in Promise.allSettled so
//       one failing campaign (expired token, network blip, malformed row)
//       cannot abort the whole batch. Errors are logged and counted.
//
//    3. Data flow is strictly:
//         build raw → compute baseline once → per-campaign assemble V2
//         → run Brain → collect snapshots → persistBrainBatch (one upsert
//         loop, idempotent on campaignId+tickDate).
//
//    4. ClaudeCMO is intentionally NOT called from this worker. Narration
//       is a presentation concern triggered by UI or notification dispatch;
//       persisting the Brain snapshot is what makes that narration possible.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from '@prisma/client';
import { MetaClient } from '../services/metaClient';
import { calculateAccountBaseline, CampaignRawData } from '../engine/BaselineCalculator';
import { runBrainForCampaign, BrainTickResult } from '../engine/AdlyticBrain';
import { assembleV2Inputs } from '../services/v2ContextAssembler';
import { persistBrainBatch, BrainSnapshotInput } from '../services/BrainPersistence';
import { loadCampaignSignalsBatch } from '../engines/rules/loadCampaignSignals';

// ── Tuning dials ────────────────────────────────────────────────────────
const ORCHESTRATOR_CONFIG = {
  /** Max concurrent campaigns being processed (Meta API rate-limit guard). */
  CONCURRENCY_LIMIT: 5,
  /** How far back to look for the latest DailyStat row per campaign.
   *  Meta backfills ~72h; 7d gives slack for paused/intermittent campaigns. */
  RAW_LOOKBACK_DAYS: 7,
};

export interface BrainOrchestratorResult {
  ok: boolean;
  adAccountId: string;
  durationMs: number;
  campaignsConsidered: number;
  campaignsProcessed: number;       // reached Brain successfully
  campaignsSkipped: number;         // no recent DailyStat row
  campaignsFailed: number;          // threw during Brain or V2 assembly
  upserted: number;                 // persisted snapshots
  tickDate?: string;                // YYYY-MM-DD
  error?: string;                   // only set when ok === false
}

/**
 * Run the V6 Brain over every campaign under one AdAccount.
 *
 * Designed to be called AFTER `runEngines` (V1 engines) in the post-sync
 * pipeline, or independently on a schedule. Idempotent on (campaignId, tickDate).
 */
export async function runBrainOrchestrator(
  prisma: PrismaClient,
  metaClient: MetaClient,
  adAccountId: string,
  opts?: { now?: Date },
): Promise<BrainOrchestratorResult> {
  const start = Date.now();
  const now = opts?.now ?? new Date();
  const tag = `[brain:${adAccountId.slice(0, 8)}]`;

  try {
    // ── 1. Account context (workspace, currency, timezone, external id) ──
    const account = await prisma.adAccount.findUnique({
      where: { id: adAccountId },
      select: {
        id: true,
        workspaceId: true,
        externalAccountId: true,
        currencyMinorFactor: true,
        timezone: true,
        campaigns: {
          select: {
            id: true,
            externalCampaignId: true,
            name: true,
            dailyBudget: true,
          },
        },
      },
    });

    if (!account) {
      return failResult(adAccountId, start, `AdAccount ${adAccountId} not found`);
    }
    const campaigns = account.campaigns;
    if (campaigns.length === 0) {
      console.log(`${tag} no campaigns under account — nothing to do`);
      return {
        ok: true,
        adAccountId,
        durationMs: Date.now() - start,
        campaignsConsidered: 0,
        campaignsProcessed: 0,
        campaignsSkipped: 0,
        campaignsFailed: 0,
        upserted: 0,
      };
    }

    // ── 2. Build CampaignRawData for every campaign (latest DailyStat row). ──
    const rawByCampaignId = await loadRawDataForCampaigns(
      prisma,
      campaigns.map(c => c.id),
      account.currencyMinorFactor,
      now,
    );

    // Filter to campaigns we actually have data for.
    const dataReady = campaigns
      .map(c => ({ campaign: c, raw: rawByCampaignId.get(c.id) }))
      .filter((x): x is { campaign: typeof campaigns[number]; raw: CampaignRawData } => !!x.raw);

    const campaignsSkipped = campaigns.length - dataReady.length;
    if (dataReady.length === 0) {
      console.log(`${tag} no campaigns with recent stats — nothing to score`);
      return {
        ok: true,
        adAccountId,
        durationMs: Date.now() - start,
        campaignsConsidered: campaigns.length,
        campaignsProcessed: 0,
        campaignsSkipped,
        campaignsFailed: 0,
        upserted: 0,
      };
    }

    // ── 3. Account-level baseline (one computation, shared across all campaigns). ──
    const baseline = calculateAccountBaseline(dataReady.map(d => d.raw));
    console.log(`${tag} baseline computed — confidence=${baseline.confidence.level} (${baseline.confidence.score})`);

    // ── 3b. Real period Signals for rule grounding (same math as Analytics). ──
    // One batched DailyStat read; campaigns without enough history simply fall
    // back to absolute-only grounding inside buildRuleGrounding.
    const periodSignalsByCampaign = await loadCampaignSignalsBatch(
      prisma,
      dataReady.map((d) => d.campaign.id),
      { asOf: now },
    );
    console.log(`${tag} period signals loaded for ${periodSignalsByCampaign.size}/${dataReady.length} campaigns`);

    // ── 4. Per-campaign V2 assembly + Brain tick, chunked + failure-isolated. ──
    const snapshots: BrainSnapshotInput[] = [];
    let failed = 0;

    for (const batch of chunks(dataReady, ORCHESTRATOR_CONFIG.CONCURRENCY_LIMIT)) {
      const settled = await Promise.allSettled(
        batch.map(async ({ campaign, raw }) => {
          const v2Inputs = await assembleV2Inputs(prisma, metaClient, {
            campaignId: campaign.id,
            externalCampaignId: campaign.externalCampaignId,
            adAccountId: account.id,
            externalAccountId: account.externalAccountId,
            timezone: account.timezone,
            currencyMinorFactor: account.currencyMinorFactor,
            dailyBudgetMinor: campaign.dailyBudget,
            nowUtc: now,
          });

          const result: BrainTickResult = runBrainForCampaign(
            raw,
            baseline,
            v2Inputs ?? undefined,
            { periodSignals: periodSignalsByCampaign.get(campaign.id) ?? null },
          );

          return {
            internalCampaignId: campaign.id,
            externalCampaignId: campaign.externalCampaignId,
            result,
          } satisfies BrainSnapshotInput;
        }),
      );

      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (!r) continue;
        if (r.status === 'fulfilled') {
          snapshots.push(r.value);
        } else {
          failed++;
          const camp = batch[i]?.campaign;
          const cid = camp?.externalCampaignId ?? 'unknown';
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          console.error(`${tag} campaign ${cid} failed → ${msg}`);
        }
      }
    }

    // ── 5. Persist the batch (idempotent per-day upsert). ───────────────
    let upserted = 0;
    let tickDate: string | undefined;
    if (snapshots.length > 0) {
      const summary = await persistBrainBatch(prisma, account.workspaceId, snapshots, now);
      upserted = summary.upserted;
      tickDate = summary.tickDate;
    }

    const durationMs = Date.now() - start;
    console.log(
      `${tag} DONE — processed=${snapshots.length} skipped=${campaignsSkipped} ` +
      `failed=${failed} upserted=${upserted} (${durationMs}ms)`
    );

    return {
      ok: true,
      adAccountId,
      durationMs,
      campaignsConsidered: campaigns.length,
      campaignsProcessed: snapshots.length,
      campaignsSkipped,
      campaignsFailed: failed,
      upserted,
      tickDate,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`${tag} ORCHESTRATOR FAILED — ${error}`);
    return failResult(adAccountId, start, error);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function failResult(adAccountId: string, start: number, error: string): BrainOrchestratorResult {
  return {
    ok: false,
    adAccountId,
    durationMs: Date.now() - start,
    campaignsConsidered: 0,
    campaignsProcessed: 0,
    campaignsSkipped: 0,
    campaignsFailed: 0,
    upserted: 0,
    error,
  };
}

/** Yield `xs` in slices of size `size` — pure, no allocations beyond the slice itself. */
function* chunks<T>(xs: T[], size: number): Generator<T[]> {
  for (let i = 0; i < xs.length; i += size) {
    yield xs.slice(i, i + size);
  }
}

/**
 * Load latest DailyStat per campaign within the lookback window and convert
 * to the engine's `CampaignRawData` shape (major-unit currency, plain numbers).
 *
 * Returns a Map keyed by internal Campaign.id. Campaigns with no qualifying
 * row are simply absent from the map — caller treats absence as "skip".
 */
async function loadRawDataForCampaigns(
  prisma: PrismaClient,
  campaignIds: string[],
  currencyMinorFactor: number,
  now: Date,
): Promise<Map<string, CampaignRawData>> {
  const since = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - ORCHESTRATOR_CONFIG.RAW_LOOKBACK_DAYS,
  ));

  // Pull all DailyStat rows for these campaigns in the window, then pick the
  // most-recent row per campaign in-memory (avoids N round-trips for N campaigns).
  const rows = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaignIds },
      date: { gte: since },
    },
    orderBy: { date: 'desc' },
    select: {
      entityId: true,
      date: true,
      spend: true, impressions: true, clicks: true, messages: true,
      ctr: true, cpc: true, cpm: true, frequency: true,
    },
  });

  // Campaign names for CampaignRawData.campaignName.
  const camps = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, externalCampaignId: true, name: true },
  });
  const byId = new Map(camps.map(c => [c.id, c]));

  const out = new Map<string, CampaignRawData>();
  for (const r of rows) {
    if (out.has(r.entityId)) continue;  // already took the most recent row for this campaign
    const c = byId.get(r.entityId);
    if (!c) continue;

    const factor = currencyMinorFactor > 0 ? currencyMinorFactor : 1;
    const spendMajor = Number(r.spend) / factor;
    const cpmMajor   = (r.cpm ?? 0)   / factor;
    const cpcMajor   = (r.cpc ?? 0)   / factor;

    out.set(r.entityId, {
      campaignId:   c.externalCampaignId,   // engine-visible id = Meta id (matches existing test fixtures)
      campaignName: c.name,
      spend:        spendMajor,
      impressions:  Number(r.impressions),
      clicks:       Number(r.clicks),
      messages:     Number(r.messages),
      ctr:          r.ctr ?? 0,
      cpc:          cpcMajor,
      cpm:          cpmMajor,
      frequency:    r.frequency ?? 0,
    });
  }
  return out;
}
