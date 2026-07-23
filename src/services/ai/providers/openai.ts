// src/services/ai/providers/openai.ts
//
// OpenAI provider adapter. Translates AIService's provider-agnostic
// types into OpenAI's chat completions API.

import OpenAI from 'openai';
import type {
  AIProviderAdapter,
  AITextResponse,
  AIToolResponse,
  AIToolCall,
  GenerateTextOptions,
  GenerateWithToolsOptions,
  ProviderConfig,
} from '../types';

let _client: OpenAI | null = null;
let _lastKey: string | null = null;

function getClient(apiKey: string): OpenAI {
  if (_client && _lastKey === apiKey) return _client;
  _client = new OpenAI({ apiKey });
  _lastKey = apiKey;
  return _client;
}

function mapFinishReason(reason: string | null): AITextResponse['finishReason'] {
  if (reason === 'stop') return 'stop';
  if (reason === 'tool_calls') return 'tool_calls';
  if (reason === 'length') return 'length';
  return 'unknown';
}

export const openaiProvider: AIProviderAdapter = {
  provider: 'openai',

  async generateText(opts: GenerateTextOptions, config: ProviderConfig): Promise<AITextResponse> {
    const client = getClient(config.apiKey);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.system },
      ...opts.messages.map(toOpenAIMessage),
    ];

    const response = await callWithTimeout(
      client,
      {
        model: config.model,
        messages,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
      },
      opts.timeoutMs ?? 30_000,
    );

    const choice = response.choices[0];
    return {
      text: choice?.message?.content?.trim() ?? '',
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      provider: 'openai',
      model: config.model,
      finishReason: mapFinishReason(choice?.finish_reason ?? null),
    };
  },

  async generateWithTools(opts: GenerateWithToolsOptions, config: ProviderConfig): Promise<AIToolResponse> {
    const client = getClient(config.apiKey);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.system },
      ...opts.messages.map(toOpenAIMessage),
    ];

    const tools: OpenAI.ChatCompletionTool[] = opts.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

    const response = await callWithTimeout(
      client,
      {
        model: config.model,
        messages,
        tools,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.3,
      },
      opts.timeoutMs ?? 45_000,
    );

    const choice = response.choices[0];
    const text = choice?.message?.content?.trim() ?? '';

    const toolCalls: AIToolCall[] = (choice?.message?.tool_calls ?? [])
      .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments),
      }));

    return {
      text,
      toolCalls,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      provider: 'openai',
      model: config.model,
      finishReason: mapFinishReason(choice?.finish_reason ?? null),
    };
  },
};

function toOpenAIMessage(msg: { role: string; content: string; toolCallId?: string }): OpenAI.ChatCompletionMessageParam {
  if (msg.role === 'tool' && msg.toolCallId) {
    return { role: 'tool', content: msg.content, tool_call_id: msg.toolCallId };
  }
  if (msg.role === 'assistant') {
    return { role: 'assistant', content: msg.content };
  }
  return { role: 'user', content: msg.content };
}

function safeParseArgs(args: string): Record<string, unknown> {
  try {
    return JSON.parse(args) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function callWithTimeout(
  client: OpenAI,
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  timeoutMs: number,
): Promise<OpenAI.ChatCompletion> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('openai_timeout')), Math.max(1000, timeoutMs));
  });

  const attempt = async (retriesLeft: number): Promise<OpenAI.ChatCompletion> => {
    try {
      return await Promise.race([client.chat.completions.create(params), timeoutPromise]);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRetryable = status === 429 || status === 500 || status === 503;
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
