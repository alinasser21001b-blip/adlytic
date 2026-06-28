// ════════════════════════════════════════════════════════════════════════
//  src/services/claudeClient.ts
//
//  Thin wrapper around @anthropic-ai/sdk.
//  Reads ANTHROPIC_API_KEY from env. Returns the assistant text reply.
// ════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { getExpertSystemPrompt } from './aiKnowledgeContext';

const MODEL   = 'claude-sonnet-4-6';
// Detailed, evidence-based analysis (live value vs benchmark + a fix) needs more
// room than a one-line answer — especially in Arabic, which runs longer per idea.
const MAX_TOKENS = 1024;

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
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: getExpertSystemPrompt(),
    messages: [{ role: 'user', content: context }],
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
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = message.content[0];
  if (block?.type === 'text') return block.text;
  // ClaudeCMO's caller is responsible for fallback narration — return empty
  // string here so its JSON.parse hits the catch path cleanly.
  return '';
}
