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

import {
  resolveProvider,
  isAIAvailable,
  buildAlternateConfig,
  buildSafeModelConfig,
} from './providerManager';
import { classifyLlmError, type ClassifiedLlmError } from '../../lib/llmErrors';
import type {
  AITask,
  AIMessage,
  AIToolDef,
  AITextResponse,
  AIToolResponse,
  AIStructuredResponse,
  AIProviderAdapter,
  ProviderConfig,
  GenerateTextOptions,
  GenerateWithToolsOptions,
} from './types';

export { isAIAvailable } from './providerManager';
export type { AITask, AIMessage, AIToolDef, AIToolCall, AITextResponse, AIToolResponse, AIStructuredResponse } from './types';

// ── call-time failover ──────────────────────────────────────────
// resolveProvider only falls back when a provider's key is ABSENT. That is
// not enough in production: a key can be present but broken (invalid, out of
// credits), or an env-configured model ID can be retired and 404. Both used
// to silently kill the AI feature while a perfectly working second provider
// (or the provider's safe default model) sat unused. This ladder rescues at
// call time:
//   1. primary provider/model
//   2. same provider, safe default model  (when the model looks misconfigured)
//   3. the OTHER configured provider      (when one is configured)
// Timeouts are NOT failed over — the caller's deadline is already spent.

function isModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const status = (err as { status?: number })?.status;
  return status === 404 || /not_found_error|model.{0,30}not (found|exist|supported)/i.test(msg);
}

function isTimeout(err: unknown): boolean {
  return classifyLlmError(err).code === 'AI_TIMEOUT';
}

async function callWithFailover<T>(
  task: AITask,
  call: (adapter: AIProviderAdapter, config: ProviderConfig) => Promise<T>,
): Promise<T> {
  const { adapter, config } = resolveProvider(task);
  try {
    return await call(adapter, config);
  } catch (err) {
    logAIError(task, err);
    if (isTimeout(err)) throw err;

    // Rung 2: same provider, safe default model (bad CLAUDE_MODEL/OPENAI_MODEL).
    if (isModelNotFound(err)) {
      const safe = buildSafeModelConfig(config);
      if (safe) {
        console.warn(`[ai:${task}] model "${config.model}" rejected — retrying with ${safe.config.model}`);
        try {
          return await call(safe.adapter, safe.config);
        } catch (safeErr) {
          logAIError(task, safeErr);
        }
      }
    }

    // Rung 3: the other configured provider (with its own bad-model rescue).
    const alt = buildAlternateConfig(config.provider);
    if (alt) {
      console.warn(`[ai:${task}] ${config.provider}/${config.model} failed — failing over to ${alt.config.provider}/${alt.config.model}`);
      try {
        return await call(alt.adapter, alt.config);
      } catch (altErr) {
        logAIError(task, altErr);
        if (isModelNotFound(altErr)) {
          const altSafe = buildSafeModelConfig(alt.config);
          if (altSafe) {
            console.warn(`[ai:${task}] fallback model "${alt.config.model}" rejected — retrying with ${altSafe.config.model}`);
            return await call(altSafe.adapter, altSafe.config);
          }
        }
        throw altErr;
      }
    }
    throw err;
  }
}

// ── generateText ────────────────────────────────────────────────
// Single-turn or multi-turn text generation. No tools.
// Used by: narration, explanation, report generation.

export async function generateText(opts: GenerateTextOptions): Promise<AITextResponse> {
  return callWithFailover(opts.task, (adapter, config) => adapter.generateText(opts, config));
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
  const system = opts.jsonMode
    ? opts.system + '\n\nIMPORTANT: Output ONLY valid JSON. No markdown, no code fences, no commentary.'
    : opts.system;

  let messages = [...opts.messages];
  let lastRaw = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await callWithFailover(opts.task, (adapter, config) =>
        adapter.generateText({ ...opts, system, messages }, config),
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
  return callWithFailover(opts.task, (adapter, config) => adapter.generateWithTools(opts, config));
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
