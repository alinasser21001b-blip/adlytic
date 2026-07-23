// ════════════════════════════════════════════════════════════════════════
//  src/services/aiContextBuilder.ts
//
//  Converts a DashboardDTO + user message into a dense, token-minimal
//  context string optimised for Claude's attention mechanism.
//  Merchant-facing Arabic labels — never raw engine codes.
// ════════════════════════════════════════════════════════════════════════

import type { DashboardDTO } from './getDashboard';
import { formatCampaignCountsLine } from '../lib/campaignCatalog';
import { sanitizeDashboardForLlm, scrubString } from '../lib/dataSanitizer';
import {
  actionLabelAr,
  issueTitleAr,
  sanitizePriorityActionText,
  severityLabelAr,
} from '../lib/plainArabicAdvice';

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

  lines.push(
    `## Workspace: ${ws?.name ?? '—'} | Industry: ${ws?.industry ?? '—'} | Currency: ${ws?.currency ?? 'USD'}`,
    `## Period: last 30d | Last sync: ${ws?.lastSyncedAt ?? 'never'} | Health: ${safeDto.health.score}/100 (${safeDto.health.band})`,
    ws?.campaignCounts
      ? `## Campaign counts: ${formatCampaignCountsLine(ws.campaignCounts)}`
      : `## Active campaigns spending today: ${ws?.activeCampaigns ?? 0}`,
  );

  if (safeDto.kpis.length > 0) {
    lines.push('## KPIs', '| Metric | Value | Δ% | Dir |', '|--------|-------|-----|-----|');
    for (const k of safeDto.kpis) {
      const delta = k.deltaPct !== null ? `${k.deltaPct > 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%` : '—';
      lines.push(`| ${k.label} | ${k.display} | ${delta} | ${k.direction} |`);
    }
  }

  if (safeDto.issues.length > 0) {
    lines.push(
      `## Issues (${safeDto.issues.length}) — use Arabic titles with the merchant; never echo internal codes`,
      '| Title (Arabic) | Severity | Why | What to do |',
      '|----------------|----------|-----|------------|',
    );
    for (const iss of safeDto.issues) {
      const title = issueTitleAr(iss.code, iss.title);
      const sev = severityLabelAr(iss.severity);
      const why = (iss.causes && iss.causes[0]) || '—';
      const action = (iss.recommendations && iss.recommendations[0]) || '—';
      lines.push(`| ${title} | ${sev} | ${why} | ${action} |`);
    }
  } else {
    lines.push('## Issues: none detected');
  }

  if (safeDto.priorityAction) {
    const paText = sanitizePriorityActionText(
      safeDto.priorityAction.actionCode,
      safeDto.priorityAction.text,
    );
    const paLabel =
      actionLabelAr(safeDto.priorityAction.actionCode) || paText;
    lines.push(
      `## Priority Action (merchant Arabic): ${paLabel}`,
      `## Priority detail: ${paText}`,
    );
  }

  if (safeDto.diagnoses && safeDto.diagnoses.length > 0) {
    lines.push('## Diagnoses (preferred Arabic narratives)');
    for (const d of safeDto.diagnoses.slice(0, 4)) {
      lines.push(`- ${d.name}: ${d.narrative}`);
      if (d.action) lines.push(`  Action: ${d.action}`);
    }
  }

  const CAMPAIGN_ROW_CAP = 25;
  const campaigns = safeDto.campaigns ?? [];
  if (campaigns.length > 0) {
    lines.push(
      `## Campaigns with 30d metrics (${campaigns.length} rows, sorted by health desc)`,
      'Match user questions by exact name, metaId, or ref from the full catalog block when present.',
      '| ref | name | metaId | health | click rate % | reach cost | frequency | Messages |',
      '|-----|------|--------|--------|------|-----|------|----------|',
    );
    for (const [i, c] of campaigns.slice(0, CAMPAIGN_ROW_CAP).entries()) {
      lines.push(
        `| ${i + 1} | ${c.name} | ${c.metaId ?? '—'} | ${c.health}/100 (${c.band}) | ${c.ctr?.toFixed(2) ?? '—'} | ${c.cpm?.toFixed(2) ?? '—'} | ${c.frequency?.toFixed(2) ?? '—'} | ${c.messages} |`,
      );
    }
  } else {
    if (safeDto.bestCampaign) {
      const b = safeDto.bestCampaign;
      lines.push(
        `## Best campaign: ${b.name} | health ${b.health}/100 | messages ${b.messages} | click rate ${b.ctr?.toFixed(2) ?? '—'}%`,
      );
    }
    if (safeDto.worstCampaign) {
      const w = safeDto.worstCampaign;
      lines.push(
        `## Weakest campaign: ${w.name} | health ${w.health}/100 | messages ${w.messages} | click rate ${w.ctr?.toFixed(2) ?? '—'}%`,
      );
    }
  }

  const ts = safeDto.trendSeries;
  if (ts.dates.length >= 2) {
    const last = ts.dates.length - 1;
    const slice = Math.min(3, ts.dates.length);
    lines.push('## Recent daily trend (last days)');
    for (let i = last - slice + 1; i <= last; i++) {
      const results = (ts.results && ts.results[i] != null) ? ts.results[i] : ts.messages[i];
      lines.push(`- ${ts.dates[i]}: spend ${ts.spend[i]} · results ${results}`);
    }
  }

  lines.push('', `## Question: ${safeMessage}`);
  return lines.join('\n');
}
