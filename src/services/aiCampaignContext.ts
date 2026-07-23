import type { PrismaClient } from '@prisma/client';

import {
  formatCampaignCatalogForPrompt,
  getCampaignCatalog,
  getCampaignCounts,
  type CampaignCatalogRow,
  type CampaignCounts,
  type CampaignMetricsLookup,
} from '../lib/campaignCatalog';
import type { DashboardDTO } from './getDashboard';

export interface AiCampaignContext {
  counts: CampaignCounts;
  catalog: CampaignCatalogRow[];
  promptBlock: string;
}

function metricsMapFromDto(dto: DashboardDTO | null | undefined): Map<string, CampaignMetricsLookup> {
  const map = new Map<string, CampaignMetricsLookup>();
  for (const c of dto?.campaigns ?? []) {
    map.set(c.id, { health: c.health, ctr: c.ctr, messages: c.messages });
  }
  return map;
}

/** Build the canonical campaign block appended to every AI chat request. */
export async function buildAiCampaignContext(
  prisma: PrismaClient,
  adAccountId: string,
  timezone: string,
  dto?: DashboardDTO | null,
): Promise<AiCampaignContext> {
  const metricsById = metricsMapFromDto(dto);
  const withMetrics = dto?.campaigns?.length ?? metricsById.size;
  const counts = dto?.workspace?.campaignCounts
    ?? await getCampaignCounts(prisma, adAccountId, timezone, withMetrics);
  const catalog = await getCampaignCatalog(prisma, adAccountId, timezone, metricsById);
  const promptBlock = formatCampaignCatalogForPrompt(catalog, counts);
  return { counts, catalog, promptBlock };
}

export function mergeCampaignBlockIntoContext(baseContext: string, campaignBlock: string): string {
  if (!campaignBlock.trim()) return baseContext;
  return `${baseContext.trim()}\n\n${campaignBlock}`;
}
