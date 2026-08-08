// ════════════════════════════════════════════════════════════════════════
//  src/analytics/accountResultKey.ts
//
//  Which stored counter carries "results" for a whole ad account?
//
//  Often: none. An account running click-to-WhatsApp campaigns AND a sales
//  campaign has no single result counter, because conversations and orders
//  are different quantities. The honest answer there is null, and callers
//  must degrade to delivery signals (CTR, CPM, frequency, spend) rather than
//  summing across units — which is exactly what `DailyStat.conversions` did.
//
//  Deliberately does NOT consult `dominant`: that is a display-only framing
//  helper for the headline. Choosing the biggest spender's unit and calling
//  it "the account's results" would quietly discard the others.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import { resolveCampaignPurpose } from '../lib/campaignPurpose';
import type { ObjectiveKpiFamily, ResultMetricKey } from '../lib/objectiveKpis';
import { resultFor } from './resultSemantics';

export interface AccountResultKey {
  /** The counter to sum, or null when the account mixes purposes. */
  resultKey: ResultMetricKey | null;
  /** Distinct purpose families found. Length > 1 means mixed. */
  families: ObjectiveKpiFamily[];
  mixed: boolean;
}

/**
 * Resolve an account's single result counter, if it has one.
 *
 * Campaigns with no window data are ignored: a paused sales campaign that
 * spent nothing this window should not make a live messaging account "mixed"
 * and strip its result trends.
 */
export async function resolveAccountResultKey(
  prisma: PrismaClient,
  adAccountId: string,
  since: Date,
  until?: Date,
): Promise<AccountResultKey> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId },
    select: {
      id: true,
      objective: true,
      adSets: { select: { optimizationGoal: true, destinationType: true } },
    },
  });
  if (campaigns.length === 0) return { resultKey: null, families: [], mixed: false };

  const rows = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaigns.map((c) => c.id) },
      date: until ? { gte: since, lte: until } : { gte: since },
    },
    select: { entityId: true, messages: true, clicks: true, spend: true },
  });

  const windowByCampaign = new Map<string, { messages: number; clicks: number; spend: number }>();
  for (const r of rows) {
    const acc = windowByCampaign.get(r.entityId) ?? { messages: 0, clicks: 0, spend: 0 };
    acc.messages += Number(r.messages);
    acc.clicks += Number(r.clicks);
    acc.spend += Number(r.spend);
    windowByCampaign.set(r.entityId, acc);
  }

  const families = new Set<ObjectiveKpiFamily>();
  for (const c of campaigns) {
    const w = windowByCampaign.get(c.id);
    // No delivery in this window — cannot influence what the account measures.
    if (!w || (w.spend === 0 && w.messages === 0 && w.clicks === 0)) continue;
    families.add(
      resolveCampaignPurpose({
        objective: c.objective,
        optimizationGoals: c.adSets.map((a) => a.optimizationGoal),
        destinationTypes: c.adSets.map((a) => a.destinationType),
        messagesWindow: w.messages,
        clicksWindow: w.clicks,
      }).family,
    );
  }

  const list = [...families];
  if (list.length !== 1) {
    return { resultKey: null, families: list, mixed: list.length > 1 };
  }
  return { resultKey: resultFor(list[0]!).resultKey, families: list, mixed: false };
}
