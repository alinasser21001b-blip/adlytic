// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/lookupKnowledge.ts   —  T7
//
//  On-demand retrieval from metaAdsKnowledgeBase + benchmarks_by_industry.
//  Replaces the current bulk KB injection in every system prompt.
//
//  This is the v1 keyword-match implementation. The design (§3.3 T7) plans
//  to upgrade to embeddings-based RAG in Phase 2.5; the tool contract is
//  the same so callers don't change. Small vocabulary means keyword match
//  actually performs well — no vector store dependency for MVP.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 T7
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolHandler } from '../dispatcher';
import { ok } from '../envelope';

interface LookupKnowledgeArgs {
  topic: string;
  industry?: string;
}

interface Snippet {
  id: string;
  title: string;
  content: string;
  source: string;
  similarity: number;
  industry?: string;
}

interface LookupKnowledgeResult {
  query: string;
  snippets: Snippet[];
  /** True when nothing scored above the confidence floor; caller should be cautious. */
  fallbackUsed: boolean;
}

// ── knowledge base loading (cached at module load) ──────────────────────

interface IndexedDoc {
  id: string;
  title: string;
  content: string;
  source: string;
  /** Precomputed lower-case word set for fast scoring. */
  tokens: Set<string>;
  industry?: string;
}

let _index: IndexedDoc[] | null = null;
let _loadError: string | null = null;

function loadIndex(): IndexedDoc[] {
  if (_index !== null) return _index;
  if (_loadError) throw new Error(_loadError);

  const docs: IndexedDoc[] = [];
  try {
    const kbPath = resolve(process.cwd(), 'src/knowledge/metaAdsKnowledgeBase.json');
    const raw = JSON.parse(readFileSync(kbPath, 'utf-8')) as {
      metrics?: Array<{
        key: string;
        label: string;
        description?: string;
        warning_threshold?: number;
        critical_threshold?: number;
        recommended_optimization_actions?: {
          warning?: Array<{ id: string; title: string; description: string; priority: string }>;
          critical?: Array<{ id: string; title: string; description: string; priority: string }>;
        };
      }>;
    };
    for (const m of raw.metrics ?? []) {
      // Description doc
      docs.push({
        id: `metric:${m.key}`,
        title: m.label,
        content: [
          m.description ?? '',
          m.warning_threshold != null ? `Warning threshold: ${m.warning_threshold}` : '',
          m.critical_threshold != null ? `Critical threshold: ${m.critical_threshold}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        source: `meta_ads_kb:metric:${m.key}`,
        tokens: tokenize(`${m.label} ${m.description ?? ''} ${m.key}`),
      });
      // Each remediation action as its own snippet — Claude can cite the exact action.
      const actions = [
        ...(m.recommended_optimization_actions?.warning ?? []),
        ...(m.recommended_optimization_actions?.critical ?? []),
      ];
      for (const a of actions) {
        docs.push({
          id: `action:${a.id}`,
          title: a.title,
          content: `${a.description} (priority: ${a.priority}, metric: ${m.label})`,
          source: `meta_ads_kb:action:${a.id}`,
          tokens: tokenize(`${a.title} ${a.description} ${m.label} ${m.key} ${a.priority}`),
        });
      }
    }
  } catch (err) {
    _loadError = `Failed to load metaAdsKnowledgeBase.json: ${err instanceof Error ? err.message : err}`;
    throw new Error(_loadError);
  }

  try {
    const bmPath = resolve(process.cwd(), 'src/knowledge/benchmarks_by_industry.json');
    const raw = JSON.parse(readFileSync(bmPath, 'utf-8')) as {
      benchmarks?: Array<{
        industry?: string;
        metric?: string;
        value?: number | string;
        source?: string;
        note?: string;
      }>;
    };
    for (const b of raw.benchmarks ?? []) {
      if (!b.metric || !b.industry) continue;
      docs.push({
        id: `benchmark:${b.industry}:${b.metric}`,
        title: `${b.industry} — ${b.metric}`,
        content: `${b.metric}: ${b.value ?? '—'}. ${b.note ?? ''} (source: ${b.source ?? 'industry_benchmarks_2026'})`,
        source: `industry_benchmarks_2026:${b.industry}:${b.metric}`,
        tokens: tokenize(`${b.industry} ${b.metric} ${b.note ?? ''} benchmark`),
        industry: b.industry,
      });
    }
  } catch {
    // benchmarks file is optional — silently continue when absent.
  }

  _index = docs;
  return docs;
}

/** Split into lowercase tokens ≥ 3 chars. Removes common punctuation. */
function tokenize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[.,;:()"«»'!?]/g, ' ');
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 3);
  return new Set(words);
}

// ── the handler ─────────────────────────────────────────────────────────

const SIMILARITY_FLOOR = 0.15;
const MIN_SNIPPETS = 3;
const MAX_SNIPPETS = 5;

export function lookupKnowledgeHandler(): ToolHandler<LookupKnowledgeArgs, LookupKnowledgeResult> {
  return {
    name: 'lookup_knowledge',
    description:
      "Retrieve Meta Ads best-practice guidance from the internal knowledge base. Use when you need to explain WHY a threshold matters, cite Meta's playbook for a specific issue, or find remediation actions for a metric problem. Returns 3-5 relevant snippets with source references. Prefer this over stating best-practice knowledge from memory — it's the sourced-truth for CTR/CPM/ROAS/CPA thresholds and Meta-approved remediation actions.",
    schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          minLength: 2,
          maxLength: 200,
          description: "Free-text query, e.g. 'low CTR remediation' or 'placement optimization' or 'ROAS benchmark for e-commerce'.",
        },
        industry: {
          type: 'string',
          maxLength: 60,
          description: 'Optional: when set, upweight snippets from that industry cell in the benchmark corpus.',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 3600,
    timeoutMs: 2000,
    async run(args) {
      const index = loadIndex();
      const queryTokens = tokenize(args.topic);
      if (queryTokens.size === 0) {
        return ok<LookupKnowledgeResult>(
          { query: args.topic, snippets: [], fallbackUsed: true },
          { sourceTable: 'metaAdsKnowledgeBase.json', latestRowDate: null, stalenessMinutes: null },
        );
      }

      // Score every doc by Jaccard similarity of token sets.
      const industryWanted = args.industry?.toLowerCase() ?? null;
      const scored = index.map((doc) => {
        const intersection = intersectionSize(queryTokens, doc.tokens);
        const union = queryTokens.size + doc.tokens.size - intersection;
        let sim = union === 0 ? 0 : intersection / union;
        // Industry boost — modest so a great generic match still wins over a bad industry match.
        if (industryWanted && doc.industry?.toLowerCase() === industryWanted) sim *= 1.4;
        return { doc, sim };
      });

      scored.sort((a, b) => b.sim - a.sim);

      const above = scored.filter((s) => s.sim >= SIMILARITY_FLOOR);
      const fallbackUsed = above.length < MIN_SNIPPETS;
      const chosen = (fallbackUsed ? scored.slice(0, MIN_SNIPPETS) : above).slice(0, MAX_SNIPPETS);

      // Diversity filter: skip a snippet whose source shares the same category
      // prefix ("metric:ctr") as one already chosen — favor coverage over depth.
      const seenPrefixes = new Set<string>();
      const diverse: Snippet[] = [];
      for (const { doc, sim } of chosen) {
        const prefix = doc.id.split(':').slice(0, 2).join(':');
        if (seenPrefixes.has(prefix) && diverse.length >= MIN_SNIPPETS) continue;
        seenPrefixes.add(prefix);
        diverse.push({
          id: doc.id,
          title: doc.title,
          content: doc.content.length > 400 ? `${doc.content.slice(0, 397)}…` : doc.content,
          source: doc.source,
          similarity: +sim.toFixed(3),
          ...(doc.industry && { industry: doc.industry }),
        });
      }

      return ok<LookupKnowledgeResult>(
        { query: args.topic, snippets: diverse, fallbackUsed },
        { sourceTable: 'metaAdsKnowledgeBase.json', latestRowDate: null, stalenessMinutes: null },
      );
    },
  } satisfies ToolHandler<LookupKnowledgeArgs, LookupKnowledgeResult>;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of smaller) if (larger.has(x)) count++;
  return count;
}

export type { LookupKnowledgeArgs, LookupKnowledgeResult };
