// ════════════════════════════════════════════════════════════════════════
//  src/services/claudeClient.ts
//
//  Provider-agnostic AI text generation.
//  Routes through AIService → ProviderManager (OpenAI or Anthropic
//  depending on env config). Returns the assistant text reply.
// ════════════════════════════════════════════════════════════════════════

import { generateText, isAIAvailable } from './ai/aiService';
import { getExpertSystemPrompt } from './aiKnowledgeContext';
import { sanitizeLlmUserContent } from '../lib/dataSanitizer';

const ARABIC_LANGUAGE_OVERRIDE = `

LANGUAGE OVERRIDE (highest priority)
- The user is Arabic-speaking. Reply ENTIRELY in clear, natural Modern Standard Arabic with an Iraqi/Gulf-friendly tone.
- Structure every answer as a merchant TASK: فهم → قرار → خطوات (1–3) → تحقق.
- Prefer Arabic metric nouns (نسبة النقر، تكلفة الوصول، مرات الظهور، تكلفة النتيجة). Do NOT lead with Latin acronyms.
- NEVER echo internal engine codes (LOW_CTR, REFRESH_CREATIVES, RESCUE_WATCH, KEEP_COLLECTING, etc.).
- Do NOT write English sentences, English section headers, or English paragraphs.
- Use Latin digits (0-9), not Arabic-Indic digits (٠-٩) — the dashboard renders Latin digits.
- Sound like a warm, direct Arab e-commerce advisor: no filler, no marketing jargon.`;

function looksArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

export async function askClaude(context: string): Promise<string> {
  if (!isAIAvailable()) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  const system = looksArabic(context)
    ? getExpertSystemPrompt() + ARABIC_LANGUAGE_OVERRIDE
    : getExpertSystemPrompt();

  const response = await generateText({
    task: 'general',
    system,
    messages: [{ role: 'user', content: sanitizeLlmUserContent(context) }],
    maxTokens: 1024,
  });

  return response.text || 'Sorry, I could not generate a response.';
}

export async function askClaudeWithSystem(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {},
): Promise<string> {
  if (!isAIAvailable()) {
    return '';
  }

  const response = await generateText({
    task: 'narration',
    system: systemPrompt,
    messages: [{ role: 'user', content: sanitizeLlmUserContent(userPrompt) }],
    maxTokens: opts.maxTokens ?? 800,
  });

  return response.text || '';
}
