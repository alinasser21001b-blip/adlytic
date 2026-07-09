// ════════════════════════════════════════════════════════════════════════
//  src/services/claudeClient.ts
//
//  Thin wrapper around @anthropic-ai/sdk.
//  Reads ANTHROPIC_API_KEY from env. Returns the assistant text reply.
// ════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { getExpertSystemPrompt } from './aiKnowledgeContext';
import { sanitizeLlmUserContent } from '../lib/dataSanitizer';

const MODEL   = process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-5';
// Detailed, evidence-based analysis (live value vs benchmark + a fix) needs more
// room than a one-line answer — especially in Arabic, which runs longer per idea.
const MAX_TOKENS = 1024;

// Prepended to the system prompt when the user is writing in Arabic. The base
// prompt already asks the model to reply in the user's language, but the entire
// knowledge base is in English so answers drift toward English phrasing. This
// override forces Arabic-only prose and pins the tone.
const ARABIC_LANGUAGE_OVERRIDE = `

LANGUAGE OVERRIDE (highest priority)
- The user is Arabic-speaking. Reply ENTIRELY in clear, natural Modern Standard Arabic with an Iraqi/Gulf-friendly tone.
- Structure every answer as a merchant TASK: فهم → قرار → خطوات (1–3) → تحقق.
- Prefer Arabic metric nouns (نسبة النقر، تكلفة الوصول، مرات الظهور، تكلفة النتيجة). Do NOT lead with Latin acronyms.
- NEVER echo internal engine codes (LOW_CTR, REFRESH_CREATIVES, RESCUE_WATCH, KEEP_COLLECTING, etc.).
- Do NOT write English sentences, English section headers, or English paragraphs.
- Use Latin digits (0-9), not Arabic-Indic digits (٠-٩) — the dashboard renders Latin digits.
- Sound like a warm, direct Arab e-commerce advisor: no filler, no marketing jargon.`;

/** Presence of any character in the Arabic Unicode block (U+0600..U+06FF). */
function looksArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export async function askClaude(context: string): Promise<string> {
  const client = getClient();
  const system = looksArabic(context)
    ? getExpertSystemPrompt() + ARABIC_LANGUAGE_OVERRIDE
    : getExpertSystemPrompt();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: sanitizeLlmUserContent(context) }],
  });

  const block = message.content[0];
  if (block?.type === 'text') return block.text;
  return 'Sorry, I could not generate a response.';
}

/**
 * Lower-level variant used when the caller owns the system prompt (e.g. ClaudeCMO's
 * strict anti-hallucination contract). Mirrors the signature ClaudeCMO expects:
 *   `(systemPrompt, userPrompt) => Promise<string>`.
 *
 * `maxTokens` defaults higher than `askClaude` because narration payloads
 * (Arabic title + multi-sentence narration + optional creative directive) can
 * legitimately exceed the conversational-default 512-token budget.
 */
export async function askClaudeWithSystem(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {},
): Promise<string> {
  const client = getClient();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: sanitizeLlmUserContent(userPrompt) }],
  });

  const block = message.content[0];
  if (block?.type === 'text') return block.text;
  // ClaudeCMO's caller is responsible for fallback narration — return empty
  // string here so its JSON.parse hits the catch path cleanly.
  return '';
}
