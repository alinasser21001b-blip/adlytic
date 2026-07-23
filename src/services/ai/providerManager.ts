// src/services/ai/providerManager.ts
//
// Routes AI tasks to the right provider based on configuration.
// Switching providers requires only env var changes, not code changes.
//
// ENV VARS:
//   AI_DEFAULT_PROVIDER   = 'openai' | 'anthropic'
//     (unset → auto: prefer whichever provider key is present, Anthropic first)
//   AI_CHAT_PROVIDER      = override for chat-agent task
//   AI_NARRATION_PROVIDER  = override for narration task
//   AI_INVESTIGATION_PROVIDER = override for investigation task
//   OPENAI_API_KEY        = required when using openai
//   OPENAI_MODEL          = default: 'gpt-4o-mini'
//   ANTHROPIC_API_KEY     = required when using anthropic
//   CLAUDE_MODEL          = default: 'claude-haiku-4-5' (cheapest tier;
//                           set to claude-sonnet-5 / claude-opus-4-8 for more depth)

import type { AIProvider, AIProviderAdapter, AITask, ProviderConfig } from './types';
import { openaiProvider } from './providers/openai';
import { anthropicProvider } from './providers/anthropic';

const adapters: Record<AIProvider, AIProviderAdapter> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

function envProvider(key: string): AIProvider | null {
  const v = process.env[key];
  if (v === 'openai' || v === 'anthropic') return v;
  return null;
}

function getDefaultProvider(): AIProvider {
  // Explicit operator choice always wins.
  const explicit = envProvider('AI_DEFAULT_PROVIDER');
  if (explicit) return explicit;
  // Otherwise auto-detect from the keys actually present. This app is
  // Claude-first (models default to claude-*), so prefer Anthropic when its
  // key exists — that way a stale/empty OPENAI_API_KEY can never shadow a
  // working Anthropic key and silently push chat into the offline fallback.
  if (process.env['ANTHROPIC_API_KEY']) return 'anthropic';
  if (process.env['OPENAI_API_KEY']) return 'openai';
  return 'anthropic';
}

const TASK_ENV_MAP: Partial<Record<AITask, string>> = {
  'chat-agent': 'AI_CHAT_PROVIDER',
  narration: 'AI_NARRATION_PROVIDER',
  investigation: 'AI_INVESTIGATION_PROVIDER',
  'creative-assessment': 'AI_CREATIVE_PROVIDER',
  report: 'AI_REPORT_PROVIDER',
};

export function resolveProvider(task: AITask): { adapter: AIProviderAdapter; config: ProviderConfig } {
  const envKey = TASK_ENV_MAP[task];
  const provider = (envKey ? envProvider(envKey) : null) ?? getDefaultProvider();

  const config = buildConfig(provider);
  if (!config) {
    const fallback = provider === 'openai' ? 'anthropic' : 'openai';
    const fallbackConfig = buildConfig(fallback);
    if (!fallbackConfig) {
      throw new Error(`No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.`);
    }
    console.warn(`[ai:provider] ${provider} not configured for task=${task}, falling back to ${fallback}`);
    return { adapter: adapters[fallback], config: fallbackConfig };
  }

  return { adapter: adapters[provider], config };
}

/** Known-good default model per provider — the rescue target when a
 *  misconfigured model ID (retired/typo'd env var) 404s at call time. */
export const SAFE_DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
};

function buildConfig(provider: AIProvider): ProviderConfig | null {
  if (provider === 'openai') {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) return null;
    return {
      provider: 'openai',
      apiKey,
      model: process.env['OPENAI_MODEL'] ?? SAFE_DEFAULT_MODEL.openai,
    };
  }
  if (provider === 'anthropic') {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return null;
    return {
      provider: 'anthropic',
      apiKey,
      // Cheapest capable tier by default to keep spend low. Override with
      // CLAUDE_MODEL on the server for deeper reasoning when needed.
      model: process.env['CLAUDE_MODEL'] ?? SAFE_DEFAULT_MODEL.anthropic,
    };
  }
  return null;
}

/** Cross-provider config for call-time failover: the OTHER configured
 *  provider, or null when only one key exists. */
export function buildAlternateConfig(
  failed: AIProvider,
): { adapter: AIProviderAdapter; config: ProviderConfig } | null {
  const other: AIProvider = failed === 'openai' ? 'anthropic' : 'openai';
  const config = buildConfig(other);
  return config ? { adapter: adapters[other], config } : null;
}

/** Same provider, safe default model — rescue for invalid CLAUDE_MODEL /
 *  OPENAI_MODEL env values that 404 at call time. */
export function buildSafeModelConfig(
  failed: ProviderConfig,
): { adapter: AIProviderAdapter; config: ProviderConfig } | null {
  const safeModel = SAFE_DEFAULT_MODEL[failed.provider];
  if (!safeModel || failed.model === safeModel) return null;
  return {
    adapter: adapters[failed.provider],
    config: { ...failed, model: safeModel },
  };
}

/** Check if any AI provider is available. */
export function isAIAvailable(): boolean {
  return !!process.env['OPENAI_API_KEY'] || !!process.env['ANTHROPIC_API_KEY'];
}

/** Get configured provider name for logging. */
export function getActiveProviderName(task: AITask): string {
  try {
    const { config } = resolveProvider(task);
    return `${config.provider}/${config.model}`;
  } catch {
    return 'none';
  }
}
