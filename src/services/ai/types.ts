// src/services/ai/types.ts
//
// Shared types for the AI abstraction layer.
// Provider-agnostic — no OpenAI or Anthropic types leak here.

export type AIProvider = 'openai' | 'anthropic';

export type AITask =
  | 'chat-agent'
  | 'investigation'
  | 'narration'
  | 'creative-assessment'
  | 'report'
  | 'explanation'
  | 'general';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Only for role=tool — the tool call ID this result answers. */
  toolCallId?: string;
}

export interface AIToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AITextResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  provider: AIProvider;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'unknown';
}

export interface AIToolResponse {
  text: string;
  toolCalls: AIToolCall[];
  tokensIn: number;
  tokensOut: number;
  provider: AIProvider;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'unknown';
}

export interface AIStructuredResponse<T> {
  data: T;
  raw: string;
  tokensIn: number;
  tokensOut: number;
  provider: AIProvider;
  model: string;
}

export interface GenerateTextOptions {
  task: AITask;
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateStructuredOptions<T> {
  task: AITask;
  system: string;
  messages: AIMessage[];
  /** Zod-style parse function or JSON schema for validation. */
  parse: (raw: string) => T;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface GenerateWithToolsOptions {
  task: AITask;
  system: string;
  messages: AIMessage[];
  tools: AIToolDef[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  provider: AIProvider;
}

/** Implemented by each provider adapter. */
export interface AIProviderAdapter {
  readonly provider: AIProvider;
  generateText(opts: GenerateTextOptions, config: ProviderConfig): Promise<AITextResponse>;
  generateWithTools(opts: GenerateWithToolsOptions, config: ProviderConfig): Promise<AIToolResponse>;
}
