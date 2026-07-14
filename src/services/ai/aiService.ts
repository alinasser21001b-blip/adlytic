// src/services/ai/aiService.ts
//
// Central AI service — the single entry point for all AI capabilities
// across the platform. Business services call these methods; they never
// import provider SDKs directly.
//
// Responsibilities:
//   - Provider routing (via providerManager)
//   - Structured output parsing + validation
//   - Unified error handling
//   - Response caching (future)
//   - Token tracking / cost logging

import { resolveProvider, isAIAvailable } from './providerManager';
import { classifyLlmError, type ClassifiedLlmError } from '../../lib/llmErrors';
import type {
  AITask,
  AIMessage,
  AIToolDef,
  AITextResponse,
  AIToolResponse,
  AIStructuredResponse,
  GenerateTextOptions,
  GenerateWithToolsOptions,
} from './types';

export { isAIAvailable } from './providerManager';
export type { AITask, AIMessage, AIToolDef, AIToolCall, AITextResponse, AIToolResponse, AIStructuredResponse } from './types';

// ── generateText ────────────────────────────────────────────────
// Single-turn or multi-turn text generation. No tools.
// Used by: narration, explanation, report generation.

export async function generateText(opts: GenerateTextOptions): Promise<AITextResponse> {
  const { adapter, config } = resolveProvider(opts.task);
  try {
    return await adapter.generateText(opts, config);
  } catch (err) {
    logAIError(opts.task, err);
    throw err;
  }
}

// ── generateStructured ──────────────────────────────────────────
// Returns parsed, validated structured data from AI response.
// Retries once on parse failure with a correction prompt.
// Used by: investigation narratives, CMO narration, reports.

export async function generateStructured<T>(opts: {
  task: AITask;
  system: string;
  messages: AIMessage[];
  parse: (raw: string) => T;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<AIStructuredResponse<T>> {
  const { adapter, config } = resolveProvider(opts.task);
  const system = opts.jsonMode
    ? opts.system + '\n\nIMPORTANT: Output ONLY valid JSON. No markdown, no code fences, no commentary.'
    : opts.system;

  let messages = [...opts.messages];
  let lastRaw = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await adapter.generateText(
        { ...opts, system, messages },
        config,
      );
      lastRaw = response.text;
      const stripped = lastRaw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const data = opts.parse(stripped);
      return {
        data,
        raw: lastRaw,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        provider: response.provider,
        model: response.model,
      };
    } catch (parseErr) {
      if (attempt === 0 && lastRaw) {
        messages = [
          ...messages,
          { role: 'assistant', content: lastRaw },
          { role: 'user', content: 'Your last reply was not valid JSON. Output ONLY the JSON object, nothing else.' },
        ];
        continue;
      }
      throw parseErr;
    }
  }

  throw new Error('generateStructured: exhausted retries');
}

// ── generateWithTools ───────────────────────────────────────────
// Single API call that may return text, tool calls, or both.
// The caller (e.g. agent loop) owns the dispatch loop.
// Used by: chat agent, investigation pipeline.

export async function generateWithTools(opts: GenerateWithToolsOptions): Promise<AIToolResponse> {
  const { adapter, config } = resolveProvider(opts.task);
  try {
    return await adapter.generateWithTools(opts, config);
  } catch (err) {
    logAIError(opts.task, err);
    throw err;
  }
}

// ── classifyError ───────────────────────────────────────────────
// Re-export the error classifier so callers don't import llmErrors directly.

export function classifyAIError(err: unknown): ClassifiedLlmError {
  return classifyLlmError(err);
}

// ── internal ────────────────────────────────────────────────────

function logAIError(task: AITask, err: unknown): void {
  const classified = classifyLlmError(err);
  console.error(`[ai:${task}] ${classified.code}: ${classified.providerMessage}`);
}
