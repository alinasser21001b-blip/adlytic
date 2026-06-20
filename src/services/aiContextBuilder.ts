// ════════════════════════════════════════════════════════════════════════
//  src/services/aiContextBuilder.ts
//
//  Converts a DashboardDTO + user message into a dense, token-minimal
//  context string optimised for Claude's attention mechanism.
//  Uses markdown tables so Claude reads structured data efficiently.
// ════════════════════════════════════════════════════════════════════════

import type { DashboardDTO } from './getDashboard';

export function buildAiContext(dto: DashboardDTO, message: string): string {
  if (dto.empty) {
    return [
      '## Workspace: (no ad account connected)',
      '## Status: No data available — user has not linked a Meta Ad Account yet.',
      '',
      `## Question: ${message}`,
    ].join('\n');
  }

  const ws = dto.workspace;
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────
  lines.push(
    `## Workspace: ${ws?.name ?? '—'} | Industry: ${ws?.industry ?? '—'} | Currency: ${ws?.currency ?? 'USD'}`,
    `## Period: last 30d | Last sync: ${ws?.lastSyncedAt ?? 'never'} | Health: ${dto.health.score}/100 (${dto.health.band}) | Active campaigns: ${ws?.activeCampaigns ?? 0}`,
  );

  // ── KPIs ────────────────────────────────────────────────────────────
  if (dto.kpis.length > 0) {
    lines.push('## KPIs', '| Metric | Value | Δ% | Dir |', '|--------|-------|-----|-----|');
    for (const k of dto.kpis) {
      const delta = k.deltaPct !== null ? `${k.deltaPct > 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%` : '—';
      lines.push(`| ${k.label} | ${k.display} | ${delta} | ${k.direction} |`);
    }
  }

  // ── Issues ──────────────────────────────────────────────────────────
  if (dto.issues.length > 0) {
    lines.push(`## Issues (${dto.issues.length})`, '| Code | Severity | Evidence |', '|------|----------|----------|');
    for (const iss of dto.issues) {
      const ev = Object.entries(iss.evidence)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      lines.push(`| ${iss.code} | ${iss.severity} | ${ev || '—'} |`);
    }
  } else {
    lines.push('## Issues: none detected');
  }

  // ── Priority action ─────────────────────────────────────────────────
  if (dto.priorityAction) {
    lines.push(`## Priority Action: ${dto.priorityAction.actionCode} (${dto.priorityAction.priority}): ${dto.priorityAction.text}`);
  }

  // ── Campaign cards ───────────────────────────────────────────────────
  if (dto.bestCampaign) {
    const b = dto.bestCampaign;
    lines.push(`## Best campaign: "${b.name}" | health:${b.health}/100 | CTR:${b.ctr?.toFixed(2) ?? '—'}% | CPM:${b.cpm?.toFixed(2) ?? '—'} | freq:${b.frequency?.toFixed(2) ?? '—'}`);
  }
  if (dto.worstCampaign) {
    const w = dto.worstCampaign;
    lines.push(`## Worst campaign: "${w.name}" | health:${w.health}/100 | CTR:${w.ctr?.toFixed(2) ?? '—'}% | CPM:${w.cpm?.toFixed(2) ?? '—'}`);
  }

  // ── Trend summary (last 3 data points to stay token-lean) ────────────
  const td = dto.trendSeries;
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

  lines.push('', `## Question: ${message}`);
  return lines.join('\n');
}
