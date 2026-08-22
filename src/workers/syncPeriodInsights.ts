// ════════════════════════════════════════════════════════════════════════
//  src/workers/syncPeriodInsights.ts
//
//  THE WRITER for Meta period facts.
//
//  Reach and frequency for a span cannot be reconstructed from daily rows —
//  Meta de-duplicates people inside a time_range and never publishes the
//  overlap. So they are asked for directly, at the exact entity level and the
//  exact span the analytics window will later request, and stored under that
//  key. The reader (`buildEntityFunnel`) matches on the tuple exactly; a miss
//  is UNKNOWN, never a daily-derived substitute.
//
//  Two windows per entity per pass — current and prior — because the
//  intelligence layer compares them. Both must exist for a change to be
//  judged; either may be absent, and absence is a legitimate answer.
//
//  Cost is deliberate. Correctness first; request batching is an optimisation
//  to make only once the semantics are proven, not before.
//
//  FAILURE IS NOT FATAL. A Meta error, a rate limit, a missing permission or a
//  campaign Meta will not report on simply leaves no row, and the reader says
//  UNKNOWN. Nothing downstream is allowed to guess in its place.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { MetaClient } from '../services/metaClient';
import { resolveAnalysisWindows } from '../lib/analysisWindow';
import { normalizePeriodRow, writePeriodFact, timeRangeFor } from '../services/periodInsights';

export interface PeriodSyncResult {
  requested: number;
  stored: number;
  failed: number;
}

/** One (entity, window) fetch. Returns true when a row was stored. */
async function fetchAndStore(
  prisma: PrismaClient,
  meta: MetaClient,
  entityType: EntityType,
  entityId: string,
  externalId: string,
  level: 'account' | 'campaign',
  since: Date,
  until: Date,
): Promise<boolean> {
  const range = timeRangeFor(since, until);
  const rows = await meta.getPeriodInsights({ externalId, level, since: range.since, until: range.until });
  const fact = normalizePeriodRow(rows[0] as never);
  // A row with nothing trustworthy in it is not worth storing: an absent row
  // and a row of nulls both mean UNKNOWN, and the absent one is cheaper.
  if (fact.reach === null && fact.frequency === null && fact.impressions === null) return false;
  await writePeriodFact(prisma, entityType, entityId, since, until, fact);
  return true;
}

/**
 * Populate period facts for one ad account and its campaigns, for the exact
 * current and prior analysis windows.
 */
export async function syncPeriodInsightsForAccount(
  prisma: PrismaClient,
  meta: MetaClient,
  adAccountId: string,
): Promise<PeriodSyncResult> {
  const { currentSince, currentUntil, priorSince, priorUntil } = resolveAnalysisWindows();
  const windows: Array<[Date, Date]> = [
    [currentSince, currentUntil],
    [priorSince, priorUntil],
  ];

  const account = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    select: { id: true, externalAccountId: true },
  });
  if (!account?.externalAccountId) return { requested: 0, stored: 0, failed: 0 };

  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId },
    select: { id: true, externalCampaignId: true },
  });

  const targets: Array<{ entityType: EntityType; entityId: string; externalId: string; level: 'account' | 'campaign' }> = [
    { entityType: EntityType.ACCOUNT, entityId: account.id, externalId: account.externalAccountId, level: 'account' },
    ...campaigns
      .filter((c) => c.externalCampaignId)
      .map((c) => ({
        entityType: EntityType.CAMPAIGN,
        entityId: c.id,
        externalId: c.externalCampaignId,
        level: 'campaign' as const,
      })),
  ];

  let requested = 0, stored = 0, failed = 0;
  for (const t of targets) {
    for (const [since, until] of windows) {
      requested++;
      try {
        if (await fetchAndStore(prisma, meta, t.entityType, t.entityId, t.externalId, t.level, since, until)) {
          stored++;
        }
      } catch (err) {
        // Absence, not failure of the sync. The reader reports UNKNOWN.
        failed++;
        console.warn(
          `[period-insights] ${t.entityType} ${t.entityId} ${timeRangeFor(since, until).since}..${timeRangeFor(since, until).until}: `
          + `no period fact (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }
  }
  return { requested, stored, failed };
}
