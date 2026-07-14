// src/services/ai/providerManager.ts
//
// Routes AI tasks to the right provider based on configuration.
// Switching providers requires only env var changes, not code changes.
//
// ENV VARS:
//   AI_DEFAULT_PROVIDER   = 'openai' | 'anthropic'  (default: 'openai')
//   AI_CHAT_PROVIDER      = override for chat-agent task
//   AI_NARRATION_PROVIDER  = override for narration task
//   AI_INVESTIGATION_PROVIDER = override for investigation task
//   OPENAI_API_KEY        = required when using openai
//   OPENAI_MODEL          = default: 'gpt-4o-mini'
//   ANTHROPIC_API_KEY     = required when using anthropic
//   CLAUDE_MODEL          = default: 'claude-sonnet-5'

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
  return envProvider('AI_DEFAULT_PROVIDER') ?? 'openai';
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

function buildConfig(provider: AIProvider): ProviderConfig | null {
  if (provider === 'openai') {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) return null;
    return {
      provider: 'openai',
      apiKey,
      model: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
    };
  }
  if (provider === 'anthropic') {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return null;
    return {
      provider: 'anthropic',
      apiKey,
      model: process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-5',
    };
  }
  return null;
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
