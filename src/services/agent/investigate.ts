// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/investigate.ts
//
//  AI Investigation — a FIXED PIPELINE, not an agentic loop. Per
//  PHASE3_IFA_DESIGN.md §1: five existing tools are called directly and in
//  parallel (bypassing Claude's own tool-selection step entirely for the
//  data-gathering phase), then a single Sonnet turn writes the narrative
//  connective tissue between sections. This keeps the report's structure
//  fixed (the merchant learns to scan the same 8 sections every time) and
//  keeps the anti-hallucination post-check directly reusable, since its
//  corpus is exactly these five tool results.
//
//  Two of the eight sections from the original brief are genuine gaps
//  (learning phase, pixel/conversion health) — no existing tool surfaces
//  them, so they ship labeled "not yet available" rather than a fabricated
//  verdict. See PHASE3_IFA_DESIGN.md §1.3.
// ════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';
import type { ToolHandler } from './dispatcher';
import { ToolDispatcher } from './dispatcher';
import { buildAgentToolHandlers } from './tools';
import { postCheckReply, buildRetryNudge } from './postcheck';

const ANALYST_MODEL = process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-5';
const MAX_TOKENS = 1536;
const MAX_POSTCHECK_RETRIES = 2;
const OVERALL_TIMEOUT_MS = 45_000;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface InvestigationSection {
  key: string;
  title: string;
  status: 'ok' | 'unavailable' | 'no_data';
  narrative: string;
}

export interface InvestigationReport {
  campaignId: string;
  generatedAt: string;
  sections: InvestigationSection[];
}

const SECTION_DEFS = [
  { key: 'structure', title: 'بنية الحملة' },
  { key: 'budget', title: 'توزيع الميزانية' },
  { key: 'learning_phase', title: 'مرحلة التعلّم' },
  { key: 'audience', title: 'جودة الجمهور' },
  { key: 'creative_fatigue', title: 'تعب الإبداع' },
  { key: 'placement', title: 'أداء المواضع' },
  { key: 'pixel_health', title: 'صحة التتبّع (Pixel)' },
  { key: 'historical_trend', title: 'الاتجاه التاريخي' },
] as const;

const UNAVAILABLE_SECTIONS: Record<string, string> = {
  pixel_health:
    'لا تتوفر أداة لفحص صحة التتبّع (Pixel) حالياً. هذا القسم يحتاج أداة مخصصة لم تُبنَ بعد.',
};

/**
 * Fixed pipeline: 5 parallel tool calls (no LLM in this phase), then one
 * Sonnet turn to write the narrative, guarded by the same deterministic
 * anti-hallucination post-check the chat agent uses.
 */
export async function investigateCampaign(args: {
  prisma: PrismaClient;
  workspaceId: string;
  userId: string;
  campaignId: string;
}): Promise<InvestigationReport> {
  const { prisma, workspaceId, userId, campaignId } = args;
  const handlers = buildAgentToolHandlers();
  const dispatcher = new ToolDispatcher(
    handlers as unknown as ToolHandler<unknown, unknown>[],
    { prisma, workspaceId, userId },
  );

  const [details, anomaly, audience, creative, hourly] = await Promise.all([
    dispatcher.dispatch('get_campaign_details', { campaignId }),
    dispatcher.dispatch('detect_anomaly', { scope: 'campaign', campaignId }),
    dispatcher.dispatch('get_audience_breakdown', { campaignId, dimension: 'placement' }),
    dispatcher.dispatch('get_creative_performance', { campaignId }),
    dispatcher.dispatch('get_hourly_pattern', { scope: 'campaign', campaignId }),
  ]);

  const toolResults = [
    { toolName: 'get_campaign_details', result: details },
    { toolName: 'detect_anomaly', result: anomaly },
    { toolName: 'get_audience_breakdown', result: audience },
    { toolName: 'get_creative_performance', result: creative },
    { toolName: 'get_hourly_pattern', result: hourly },
  ];

  // Sections with no tool call at all — genuine gaps, never sent to the LLM.
  const availableKeys = SECTION_DEFS.filter((s) => !(s.key in UNAVAILABLE_SECTIONS)).map((s) => s.key);

  // learning_stage_info is only ever synced for ad sets touched since this
  // field was added — reportedAdSets===0 means "we have no signal yet" for
  // this campaign, not "all ad sets exited learning". Null it out so the
  // prompt's own "empty JSON -> say not enough data" rule handles it,
  // instead of the model reasoning from an all-zero object.
  const learningPhaseData = details.ok
    ? (details.data as { learningPhase?: { reportedAdSets: number } }).learningPhase
    : null;
  const learningPhaseForPrompt = learningPhaseData && learningPhaseData.reportedAdSets > 0 ? learningPhaseData : null;

  const dataForPrompt: Record<string, unknown> = {
    structure: details.ok ? details.data : null,
    budget: details.ok ? (details.data as { spendPacing?: unknown }).spendPacing ?? null : null,
    learning_phase: learningPhaseForPrompt,
    audience: audience.ok ? audience.data : null,
    creative_fatigue: {
      creative: creative.ok ? creative.data : null,
      anomaly: anomaly.ok ? anomaly.data : null,
    },
    placement: audience.ok ? audience.data : null,
    historical_trend: details.ok ? (details.data as { historicalBaseline?: unknown; vsBaseline?: unknown }) : null,
  };

  const narratives = await writeNarratives(availableKeys, dataForPrompt, toolResults);

  const sections: InvestigationSection[] = SECTION_DEFS.map((def) => {
    if (def.key in UNAVAILABLE_SECTIONS) {
      return { key: def.key, title: def.title, status: 'unavailable', narrative: UNAVAILABLE_SECTIONS[def.key]! };
    }
    const narrative = narratives[def.key];
    if (!narrative) {
      return { key: def.key, title: def.title, status: 'no_data', narrative: 'لا تتوفر بيانات كافية لهذا القسم حالياً.' };
    }
    return { key: def.key, title: def.title, status: 'ok', narrative };
  });

  return { campaignId, generatedAt: new Date().toISOString(), sections };
}

/**
 * The only LLM call in the pipeline: one Sonnet turn writing 2-3 sentences
 * per section from the already-gathered tool data. Guarded by the same
 * postCheckReply() the chat loop uses — if the model cites a number not in
 * the tool corpus, retry with a nudge; after MAX_POSTCHECK_RETRIES, degrade
 * to a flat "not enough verified data" line per section rather than ship
 * unverified prose.
 */
async function writeNarratives(
  keys: string[],
  dataForPrompt: Record<string, unknown>,
  toolResults: Array<{ toolName: string; result: unknown }>,
): Promise<Record<string, string>> {
  const client = getClient();
  const system = [
    'You are writing a structured campaign investigation report for an Arabic-speaking Meta Ads merchant.',
    'You will receive JSON data from several analytics tools. Write 2-3 short sentences per section, in Modern Standard Arabic.',
    'STRICT RULE: every number you write MUST appear verbatim in the provided JSON. Never compute a new number, never estimate, never round differently than the source.',
    'If a section\'s JSON is null or empty, write exactly: "لا تتوفر بيانات كافية لهذا القسم حالياً." — do not guess.',
    'Output ONLY a JSON object mapping each section key to its narrative string. No markdown, no code fences, no extra keys.',
    `Section keys: ${keys.join(', ')}`,
  ].join('\n');

  const userContent = JSON.stringify(dataForPrompt);
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];
  let attempt = 0;

  while (attempt <= MAX_POSTCHECK_RETRIES) {
    attempt++;
    const response = await Promise.race([
      client.messages.create({
        model: ANALYST_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('investigation_llm_timeout')), Math.max(1000, deadline - Date.now())),
      ),
    ]);

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    const raw = textBlock?.text?.trim() ?? '';
    const parsed = parseNarrativeJson(raw, keys);
    if (!parsed) {
      // Unparseable — treat like a failed post-check and nudge once, then degrade.
      if (attempt > MAX_POSTCHECK_RETRIES) return {};
      messages = [...messages, { role: 'assistant', content: raw }, {
        role: 'user',
        content: 'Your last reply was not valid JSON. Output ONLY the JSON object, nothing else.',
      }];
      continue;
    }

    const combinedReply = Object.values(parsed).join('\n\n');
    const check = postCheckReply({
      reply: combinedReply,
      userMessage: '',
      toolResults: toolResults as Array<{ toolName: string; result: import('./envelope').ToolResult<unknown> }>,
    });
    if (check.ok) return parsed;
    if (attempt > MAX_POSTCHECK_RETRIES) return {};
    messages = [...messages, { role: 'assistant', content: raw }, {
      role: 'user',
      content: buildRetryNudge(check.offendingTokens, 'AR'),
    }];
  }
  return {};
}

function parseNarrativeJson(raw: string, keys: string[]): Record<string, string> | null {
  try {
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return null;
  }
}
