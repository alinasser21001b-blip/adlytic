// src/services/ai/providers/anthropic.ts
//
// Anthropic (Claude) provider adapter. Translates AIService's
// provider-agnostic types into Anthropic's messages API.

import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProviderAdapter,
  AITextResponse,
  AIToolResponse,
  AIToolCall,
  GenerateTextOptions,
  GenerateWithToolsOptions,
  ProviderConfig,
} from '../types';

let _client: Anthropic | null = null;
let _lastKey: string | null = null;

function getClient(apiKey: string): Anthropic {
  if (_client && _lastKey === apiKey) return _client;
  _client = new Anthropic({ apiKey });
  _lastKey = apiKey;
  return _client;
}

function mapFinishReason(reason: string | null): AITextResponse['finishReason'] {
  if (reason === 'end_turn') return 'stop';
  if (reason === 'tool_use') return 'tool_calls';
  if (reason === 'max_tokens') return 'length';
  return 'unknown';
}

// The 4.6+ / 5 generation (Sonnet 5, Opus 4.6/4.7/4.8, Fable/Mythos 5) uses
// adaptive thinking and REJECTS sampling params — sending `temperature`,
// `top_p`, or `top_k` returns HTTP 400, which would silently drop the whole
// AI feature into its offline fallback. Older models (claude-3-*, sonnet-4-5,
// haiku-4-5) still accept them. Guard here so callers can keep passing a
// temperature without knowing the target model's generation.
function modelRejectsSampling(model: string): boolean {
  return /(fable-5|mythos-5|sonnet-5|sonnet-4-6|opus-4-[6789]|opus-[5-9])/.test(model);
}

/** Only forward a temperature when the target model actually accepts one. */
function samplingParams(model: string, temperature?: number): { temperature?: number } {
  if (temperature == null || modelRejectsSampling(model)) return {};
  return { temperature };
}

// Mark the system prompt as cacheable. Render order is tools → system →
// messages, so a single breakpoint on the system block caches the whole stable
// prefix (tool schemas + system prompt). The tool-use loop resends that prefix
// on every iteration within seconds, and repeat questions reuse it within the
// 5-minute window — cached reads bill at ~10% of input, a large saving on the
// agent's dominant cost. Below the model's minimum cacheable prefix it's a
// silent no-op, never an error.
function cacheableSystem(system: string | undefined): Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined;
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

export const anthropicProvider: AIProviderAdapter = {
  provider: 'anthropic',

  async generateText(opts: GenerateTextOptions, config: ProviderConfig): Promise<AITextResponse> {
    const client = getClient(config.apiKey);
    const messages = toAnthropicMessages(opts.messages);

    const response = await callWithTimeout(
      client,
      {
        model: config.model,
        ...(opts.system ? { system: cacheableSystem(opts.system) } : {}),
        messages,
        max_tokens: opts.maxTokens ?? 1024,
        ...samplingParams(config.model, opts.temperature),
      },
      opts.timeoutMs ?? 30_000,
    );

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const text = textBlocks.map((b) => b.text).join('\n').trim();

    return {
      text,
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
      provider: 'anthropic',
      model: config.model,
      finishReason: mapFinishReason(response.stop_reason),
    };
  },

  async generateWithTools(opts: GenerateWithToolsOptions, config: ProviderConfig): Promise<AIToolResponse> {
    const client = getClient(config.apiKey);
    const messages = toAnthropicMessages(opts.messages);

    const tools: Anthropic.Tool[] = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: stripDefaults(t.parameters.properties ?? {}),
        ...(t.parameters.required ? { required: t.parameters.required } : {}),
        additionalProperties: t.parameters.additionalProperties ?? false,
      },
    }));

    const response = await callWithTimeout(
      client,
      {
        model: config.model,
        ...(opts.system ? { system: cacheableSystem(opts.system) } : {}),
        messages,
        tools,
        max_tokens: opts.maxTokens ?? 2048,
        ...samplingParams(config.model, opts.temperature),
      },
      opts.timeoutMs ?? 45_000,
    );

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const text = textBlocks.map((b) => b.text).join('\n').trim();
    const toolCalls: AIToolCall[] = toolUseBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      arguments: b.input as Record<string, unknown>,
    }));

    return {
      text,
      toolCalls,
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
      provider: 'anthropic',
      model: config.model,
      finishReason: mapFinishReason(response.stop_reason),
    };
  },
};

// ── message mapping ─────────────────────────────────────────────

function toAnthropicMessages(
  messages: Array<{ role: string; content: string; toolCallId?: string }>,
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      out.push({ role: 'assistant', content: msg.content });
    } else if (msg.role === 'tool' && msg.toolCallId) {
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: msg.content,
          },
        ],
      });
    }
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────

function stripDefaults(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'default') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = stripDefaults(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function callWithTimeout(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  timeoutMs: number,
): Promise<Anthropic.Message> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('anthropic_timeout')), Math.max(1000, timeoutMs));
  });

  const attempt = async (retriesLeft: number): Promise<Anthropic.Message> => {
    try {
      return await Promise.race([client.messages.create(params), timeoutPromise]);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRetryable = status === 429 || status === 500 || status === 503 || status === 529;
      if (isRetryable && retriesLeft > 0) {
        await new Promise((r) => setTimeout(r, status === 429 ? 2000 : 1000));
        return attempt(retriesLeft - 1);
      }
      throw err;
    }
  };

  try {
    return await attempt(2);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
