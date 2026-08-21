// ════════════════════════════════════════════════════════════════════════
//  src/workers/syncHorizon.ts
//
//  The campaign backfill horizon — and NOTHING else.
//
//  This constant lives alone in a leaf module for one reason: the Brain
//  Observatory needs to read the real horizon (an absent DailyStat row means
//  something different inside it than outside it), and the Observatory is
//  required to be structurally incapable of writing anything.
//
//  Importing the constant from backgroundScheduler.ts would have loaded that
//  module's entire graph — SyncAccountWorker, MetaClient, bootQueueWorkers
//  (BullMQ), the orchestrator and its Meta adapter — into a read-only
//  inspector. Verified, not assumed: importing backgroundScheduler pulls in
//  both `bullmq` and `metaClient`. Even with no top-level side effects today,
//  that module graph makes "this inspector cannot enqueue a job or mutate
//  Meta" a claim about discipline rather than about structure.
//
//  This file must therefore keep ZERO imports. A test asserts that.
// ════════════════════════════════════════════════════════════════════════

/**
 * How far back the scheduler's Phase 2 re-requests campaign-level daily
 * insights on EVERY pass.
 *
 * This is the horizon that decides whether an absent DailyStat row can mean
 * "never requested": inside it, the day WAS asked for and Meta returned
 * nothing; outside it, absence proves nothing at all. Wider than Meta's
 * attribution backfill on purpose, so a settled day that arrives late still
 * lands inside the window.
 */
export const CAMPAIGN_BACKFILL_DAYS = 28;
