// ════════════════════════════════════════════════════════════════════════
//  src/services/aiContextBuilder.ts
//
//  Converts a DashboardDTO + user message into a dense, token-minimal
//  context string optimised for Claude's attention mechanism.
//  Uses markdown tables so Claude reads structured data efficiently.
// ════════════════════════════════════════════════════════════════════════

import type { DashboardDTO } from './getDashboard';
import { sanitizeDashboardForLlm, scrubString } from '../lib/dataSanitizer';

export function buildAiContext(dto: DashboardDTO, message: string): string {
  const safeDto = sanitizeDashboardForLlm(dto);
  const safeMessage = scrubString(message);

  if (safeDto.empty) {
    return [
      '## Workspace: (no ad account connected)',
      '## Status: No data available — user has not linked a Meta Ad Account yet.',
      '',
      `## Question: ${safeMessage}`,
    ].join('\n');
  }

  const ws = safeDto.workspace;
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────
  lines.push(
    `## Workspace: ${ws?.name ?? '—'} | Industry: ${ws?.industry ?? '—'} | Currency: ${ws?.currency ?? 'USD'}`,
    `## Period: last 30d | Last sync: ${ws?.lastSyncedAt ?? 'never'} | Health: ${safeDto.health.score}/100 (${safeDto.health.band}) | Active campaigns: ${ws?.activeCampaigns ?? 0}`,
  );

  // ── KPIs ────────────────────────────────────────────────────────────
  if (safeDto.kpis.length > 0) {
    lines.push('## KPIs', '| Metric | Value | Δ% | Dir |', '|--------|-------|-----|-----|');
    for (const k of safeDto.kpis) {
      const delta = k.deltaPct !== null ? `${k.deltaPct > 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%` : '—';
      lines.push(`| ${k.label} | ${k.display} | ${delta} | ${k.direction} |`);
    }
  }

  // ── Issues ──────────────────────────────────────────────────────────
  if (safeDto.issues.length > 0) {
    lines.push(`## Issues (${safeDto.issues.length})`, '| Code | Severity | Evidence |', '|------|----------|----------|');
    for (const iss of safeDto.issues) {
      const ev = Object.entries(iss.evidence)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      lines.push(`| ${iss.code} | ${iss.severity} | ${ev || '—'} |`);
    }
  } else {
    lines.push('## Issues: none detected');
  }

  // ── Priority action ─────────────────────────────────────────────────
  if (safeDto.priorityAction) {
    lines.push(`## Priority Action: ${safeDto.priorityAction.actionCode} (${safeDto.priorityAction.priority}): ${safeDto.priorityAction.text}`);
  }

  // ── Per-campaign breakdown ───────────────────────────────────────────
  // Full active-campaign list (sorted by health desc) so the assistant can
  // answer about a specific campaign by name instead of only best/worst.
  // Capped to stay token-lean on large accounts.
  const CAMPAIGN_ROW_CAP = 25;
  const campaigns = safeDto.campaigns ?? [];
  if (campaigns.length > 0) {
    lines.push(
      `## Campaigns (${campaigns.length} active, sorted by health desc)`,
      '| Campaign | Health | CTR% | CPM | Freq | Messages |',
      '|----------|--------|------|-----|------|----------|',
    );
    for (const c of campaigns.slice(0, CAMPAIGN_ROW_CAP)) {
      lines.push(
        `| ${c.name} | ${c.health}/100 (${c.band}) | ${c.ctr?.toFixed(2) ?? '—'} | ${c.cpm?.toFixed(2) ?? '—'} | ${c.frequency?.toFixed(2) ?? '—'} | ${c.messages} |`,
      );
    }
    if (campaigns.length > CAMPAIGN_ROW_CAP) {
      lines.push(`_(+${campaigns.length - CAMPAIGN_ROW_CAP} more lower-health campaigns omitted)_`);
    }
  } else {
    // Fallback for render paths that only carry best/worst (e.g. legacy/empty DTO).
    if (safeDto.bestCampaign) {
      const b = safeDto.bestCampaign;
      lines.push(`## Best campaign: "${b.name}" | health:${b.health}/100 | CTR:${b.ctr?.toFixed(2) ?? '—'}% | CPM:${b.cpm?.toFixed(2) ?? '—'} | freq:${b.frequency?.toFixed(2) ?? '—'}`);
    }
    if (safeDto.worstCampaign) {
      const w = safeDto.worstCampaign;
      lines.push(`## Worst campaign: "${w.name}" | health:${w.health}/100 | CTR:${w.ctr?.toFixed(2) ?? '—'}% | CPM:${w.cpm?.toFixed(2) ?? '—'}`);
    }
  }

  // ── Trend summary (last 3 data points to stay token-lean) ────────────
  const td = safeDto.trendSeries;
  if (td.dates.length > 0) {
    const last3 = Math.max(0, td.dates.length - 3);
    const dates    = td.dates.slice(last3);
    const messages = td.messages.slice(last3);
    const spend    = td.spend.slice(last3);
    lines.push('## Recent trend (last 3 days)', '| Date | Messages | Spend |', '|------|----------|-------|');
    for (let i = 0; i < dates.length; i++) {
      lines.push(`| ${dates[i]} | ${messages[i]} | ${spend[i].toFixed(2)} |`);
    }
  }

  lines.push('', `## Question: ${safeMessage}`);
  return lines.join('\n');
}
