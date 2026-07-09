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
import { buildDeterministicInvestigationNarratives } from './investigateNarratives';
import { classifyLlmError } from '../../lib/llmErrors';

const ANALYST_MODEL = process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-5';
const MAX_TOKENS = 1536;
const MAX_POSTCHECK_RETRIES = 2;
const OVERALL_TIMEOUT_MS = 45_000;

let _client: Anthropic | null = null;
function tryGetClient(): Anthropic | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
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
  /** True when narratives came from tool data without Claude. */
  usedOffline?: boolean;
  /** Stable product code when offline due to LLM failure. */
  offlineCode?: string;
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

const UNAVAILABLE_SECTIONS: Record<string, string> = {};

/**
 * Fixed pipeline: 6 parallel tool calls (no LLM in this phase), then one
 * Sonnet turn to write the narrative, guarded by the same deterministic
 * anti-hallucination post-check the chat agent uses. check_pixel_health is
 * the one LIVE Meta call in the batch (9s timeout) — it runs alongside the
 * five fast Postgres-backed reads, not after them, so it doesn't add extra
 * latency beyond its own worst case.
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

  const [details, anomaly, audience, creative, hourly, pixel] = await Promise.all([
    dispatcher.dispatch('get_campaign_details', { campaignId }),
    dispatcher.dispatch('detect_anomaly', { scope: 'campaign', campaignId }),
    dispatcher.dispatch('get_audience_breakdown', { campaignId, dimension: 'placement' }),
    dispatcher.dispatch('get_creative_performance', { campaignId }),
    dispatcher.dispatch('get_hourly_pattern', { scope: 'campaign', campaignId }),
    dispatcher.dispatch('check_pixel_health', {}),
  ]);

  const toolResults = [
    { toolName: 'get_campaign_details', result: details },
    { toolName: 'detect_anomaly', result: anomaly },
    { toolName: 'get_audience_breakdown', result: audience },
    { toolName: 'get_creative_performance', result: creative },
    { toolName: 'get_hourly_pattern', result: hourly },
    { toolName: 'check_pixel_health', result: pixel },
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
    pixel_health: pixel.ok ? pixel.data : null,
    historical_trend: details.ok ? (details.data as { historicalBaseline?: unknown; vsBaseline?: unknown }) : null,
  };

  // Prefer Claude narratives when available; always fall back to deterministic
  // Arabic from the same tool JSON so the tab never hard-fails on credits /
  // timeout / missing API key. Skip the LLM call entirely when the chat-v2
  // flag is off — tools alone are enough for a useful report.
  let narratives: Record<string, string> = {};
  let usedOffline = false;
  let offlineCode: string | undefined;
  const llmEnabled = process.env['AI_AGENT_V2_ENABLED'] === 'true' && !!process.env['ANTHROPIC_API_KEY'];
  if (llmEnabled) {
    try {
      narratives = await writeNarratives(availableKeys, dataForPrompt, toolResults);
    } catch (err) {
      const classified = classifyLlmError(err);
      console.warn('[adlytic:investigate] LLM narrative failed, using offline:', classified.code, classified.providerMessage);
      offlineCode = classified.code;
      usedOffline = true;
    }
  } else {
    usedOffline = true;
    offlineCode = process.env['ANTHROPIC_API_KEY'] ? 'AI_UNAVAILABLE' : 'AI_AUTH_FAILED';
  }

  const offlineNarratives = buildDeterministicInvestigationNarratives(dataForPrompt, availableKeys);
  if (!Object.keys(narratives).length) {
    narratives = offlineNarratives;
    usedOffline = true;
  } else {
    // Fill any missing section from deterministic data rather than blank no_data.
    for (const key of availableKeys) {
      if (!narratives[key] && offlineNarratives[key]) {
        narratives[key] = offlineNarratives[key]!;
        usedOffline = true;
      }
    }
  }

  const sections: InvestigationSection[] = SECTION_DEFS.map((def) => {
    if (def.key in UNAVAILABLE_SECTIONS) {
      return { key: def.key, title: def.title, status: 'unavailable', narrative: UNAVAILABLE_SECTIONS[def.key]! };
    }
    // check_pixel_health is a live Meta call expected to fail on many
    // accounts (no pixel, no Conversions API, permission scope). Surface
    // its real, deterministic error message directly rather than let the
    // LLM paraphrase — this is diagnostic text, not a claim to verify.
    if (def.key === 'pixel_health' && !pixel.ok) {
      return { key: def.key, title: def.title, status: 'unavailable', narrative: pixelHealthErrorNarrative(pixel.error) };
    }
    const narrative = narratives[def.key];
    if (!narrative) {
      return { key: def.key, title: def.title, status: 'no_data', narrative: 'لا تتوفر بيانات كافية لهذا القسم حالياً.' };
    }
    return { key: def.key, title: def.title, status: 'ok', narrative };
  });

  return {
    campaignId,
    generatedAt: new Date().toISOString(),
    sections,
    ...(usedOffline ? { usedOffline: true, offlineCode } : {}),
  };
}

function pixelHealthErrorNarrative(error: { code: string; message: string }): string {
  if (error.code === 'NOT_FOUND') {
    return 'لا يوجد Pixel أو Dataset مرتبط بحساب الإعلانات هذا — يحتاج العميل لإعداد Pixel أو Conversions API في Meta Events Manager أولاً.';
  }
  if (error.code === 'FORBIDDEN') {
    return 'تعذّر الوصول لبيانات صحة التتبّع — على الأغلب هذا الحساب لا يملك صلاحية Conversions API الكافية بعد.';
  }
  return 'تعذّر فحص صحة التتبّع الآن (' + error.message + ').';
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
  const client = tryGetClient();
  if (!client) {
    // No API key — caller fills from deterministic narratives.
    return {};
  }
  const system = [
    'You are writing a structured campaign investigation report for an Arabic-speaking Meta Ads merchant.',
    'Follow global media-buyer standards: evidence → diagnosis → recommended check. Write 2-3 short sentences per section in Modern Standard Arabic.',
    'For each section with data: (1) state the key evidence with numbers from JSON, (2) give a brief diagnosis, (3) one practical next check or action.',
    'STRICT RULE: every number you write MUST appear verbatim in the provided JSON. Never compute a new number, never estimate, never round differently than the source.',
    'If a section\'s JSON is null or empty, write exactly: "لا تتوفر بيانات كافية لهذا القسم حالياً." — do not guess.',
    'Disclose uncertainty when sample size is thin or fields are missing — do not overstate confidence.',
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
