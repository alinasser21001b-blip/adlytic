// ════════════════════════════════════════════════════════════════════════
//  src/services/aiKnowledgeContext.ts
//
//  Builds the Adlytic AI "deep expert" system prompt for the chat assistant.
//
//  The repo already ships a rich, sourced knowledge base under src/knowledge/
//  (metric glossary + 2026 industry benchmarks, grounded in the Meta Audience
//  Network Glossary, Motion, Good Morning Marketing, and Pengwing's 2026
//  benchmarks). Until now the chat assistant never loaded any of it — it ran on
//  a 4-line system prompt. This module digests those files into a compact,
//  token-lean reference and wraps it with the analyst persona + analysis rules,
//  so every chat answer is grounded in real definitions and benchmark ranges.
//
//  Files are read with fs + dir-candidates (the same strategy as
//  loadKnowledgeBase.ts) because the build is plain `tsc` with no JSON copy and
//  resolveJsonModule is off. If the files are missing at runtime the assistant
//  degrades gracefully to the persona + rules alone — it never throws.
// ════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

// ── Persona + analysis contract (the part that is always present) ──────────
const EXPERT_PREAMBLE = `You are Adlytic AI — a senior Meta Ads performance strategist embedded in the Adlytic dashboard. You read the client's live campaign data the way an expert media buyer does and advise them directly.

GROUNDING
- A KNOWLEDGE BASE of metric definitions and 2026 industry benchmarks is provided below. Use its exact terminology and benchmark ranges as your reference for what counts as weak / average / good / excellent.
- It is grounded in: the Meta Audience Network Glossary, Motion, Good Morning Marketing, and Pengwing's Meta Ads Benchmarks 2026. Treat benchmarks as industry averages and guardrails — not official Meta guarantees.

HOW TO ANALYSE (always evidence-based)
- Compare every metric in the live data against the matching benchmark, and against the workspace's INDUSTRY row when one is given.
- For each judgement, SHOW THE EVIDENCE: state the live value, the benchmark range, and whether it sits below / within / above it. Never give a verdict ("good", "weak", "needs work") without the numbers behind it.
- Prefer the account's own trend/baseline when present: a metric can be fine versus the industry yet declining versus itself — say which.
- When a metric breaches its warning/critical threshold, name the most likely cause and the concrete fix drawn from the knowledge base, not generic advice.
- Read metrics together, not in isolation (e.g. high CTR + low CVR points downstream of the creative; rising frequency + falling CTR signals fatigue).

STRICT DATA RULES (no hallucination)
- Use ONLY numbers present in the live data block. Never invent, round-trip, or estimate a metric that was not provided. If a metric you need is missing, say exactly what is missing and what the client should connect or open to get it.
- Money is shown in the workspace currency. Compare currency metrics (CPM / CPC / CPL) only loosely across currencies and say so; ratio metrics (CTR %, ROAS, frequency) compare directly to benchmarks.

VOICE
- Act as an advisor: direct, confident, and practical. Always end with a clear recommended next step.
- Reply in the user's language. If they write in Arabic, answer in clear, natural Arabic and keep metric acronyms (CTR, CPM, ROAS, CPA) in Latin letters. The first time you use a term, explain it in a few plain words.
- Be thorough but focused. Use short labelled points for longer answers; no markdown headers. Flawless, simple, easy-to-read language with zero filler.`;

const SOURCES_LINE =
  'Sources: Meta Audience Network Glossary; Motion; Good Morning Marketing; Pengwing Meta Ads Benchmarks 2026.';

// ── Loose shapes for the JSON we digest (validated defensively) ────────────
interface RefMetric {
  name?: string;
  definition?: string;
  better_when?: string;
  unit?: string;
  benchmark?: Record<string, unknown>;
  warning?: string;
  critical?: string;
}

let _cachedPrompt: string | null = null;

function knowledgeDirCandidates(): string[] {
  const dirs = new Set<string>();
  // this module lives in src/services → knowledge is a sibling dir
  dirs.add(path.join(__dirname, '..', 'knowledge'));
  dirs.add(path.join(process.cwd(), 'src', 'knowledge'));
  dirs.add(path.join(process.cwd(), 'dist', 'src', 'knowledge'));
  return [...dirs];
}

function readKnowledgeJson(filename: string): Record<string, unknown> | null {
  for (const dir of knowledgeDirCandidates()) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Compact a benchmark object into "key range, key range" dropping the source tag. */
function compactBenchmark(b: Record<string, unknown> | undefined): string {
  if (!b || typeof b !== 'object') return '';
  return Object.entries(b)
    .filter(([k]) => k !== 'source')
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${String(v)}`)
    .join(', ');
}

/** First sentence of a definition, trimmed to keep the digest token-lean. */
function firstSentence(text: string | undefined): string {
  if (!text) return '';
  const dot = text.indexOf('. ');
  const s = dot > 0 ? text.slice(0, dot) : text;
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}

function buildMetricGlossary(): string {
  const ref = readKnowledgeJson('reference_core_metrics.json');
  const metrics = ref?.['metrics'];
  if (!metrics || typeof metrics !== 'object') return '';

  const lines: string[] = [];
  for (const [key, raw] of Object.entries(metrics as Record<string, RefMetric>)) {
    const m = raw ?? {};
    const dir = m.better_when ? `${m.better_when} is better` : '';
    const bench = compactBenchmark(m.benchmark);
    const parts: string[] = [];
    parts.push(`- ${key}${m.name ? ` (${m.name})` : ''} — ${firstSentence(m.definition)}.`);
    if (dir) parts.push(`${dir}.`);
    if (bench) parts.push(`Benchmark: ${bench}.`);
    if (m.warning) parts.push(`Warn: ${m.warning}`);
    if (m.critical) parts.push(`Critical: ${m.critical}`);
    lines.push(parts.join(' '));
  }
  return lines.length ? `## Metric glossary & 2026 benchmarks\n${lines.join('\n')}` : '';
}

function buildBenchmarkTables(): string {
  const bm = readKnowledgeJson('benchmarks_by_industry.json');
  if (!bm) return '';

  const out: string[] = [];

  const ga = bm['global_averages'];
  if (ga && typeof ga === 'object') {
    const rows = Object.entries(ga as Record<string, Record<string, unknown>>).map(
      ([metric, ranges]) => `- ${metric}: ${compactBenchmark(ranges)}`,
    );
    if (rows.length) out.push(`## Global 2026 averages\n${rows.join('\n')}`);
  }

  const inds = bm['industries'];
  if (inds && typeof inds === 'object') {
    const rows = Object.values(inds as Record<string, Record<string, unknown>>).map((i) => {
      const label = String(i['label'] ?? '');
      const fields = ['CTR', 'CPM', 'CPC', 'ROAS', 'CPL']
        .filter((f) => i[f] != null)
        .map((f) => `${f} ${String(i[f])}`)
        .join(' | ');
      const note = i['notes'] ? ` — ${firstSentence(String(i['notes']))}` : '';
      return `- ${label}: ${fields}${note}`;
    });
    if (rows.length) out.push(`## Industry benchmarks (match the workspace's industry)\n${rows.join('\n')}`);
  }

  const seas = bm['seasonality'];
  if (seas && typeof seas === 'object') {
    const rows = Object.entries(seas as Record<string, unknown>)
      .filter(([k]) => k !== 'source')
      .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${String(v)}`);
    if (rows.length) out.push(`## Seasonality\n${rows.join('\n')}`);
  }

  return out.join('\n\n');
}

/**
 * Assemble (once, cached) the full deep-expert system prompt: persona + analysis
 * rules + the digested knowledge base. Falls back to persona + rules alone if the
 * knowledge files cannot be read, so the chat assistant never breaks.
 */
export function getExpertSystemPrompt(): string {
  if (_cachedPrompt) return _cachedPrompt;

  const glossary = buildMetricGlossary();
  const benchmarks = buildBenchmarkTables();
  const knowledge = [glossary, benchmarks].filter(Boolean).join('\n\n');

  _cachedPrompt = knowledge
    ? `${EXPERT_PREAMBLE}\n\n${'='.repeat(40)}\n# ADLYTIC KNOWLEDGE BASE (grounding — use these ranges, do not invent numbers)\n${SOURCES_LINE}\n\n${knowledge}`
    : EXPERT_PREAMBLE;

  return _cachedPrompt;
}

/** Test hook — clear the cached prompt so a fresh build can be asserted. */
export function resetExpertSystemPromptCache(): void {
  _cachedPrompt = null;
}
