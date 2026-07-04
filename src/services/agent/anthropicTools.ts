// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/anthropicTools.ts
//
//  Convert our ToolHandler[] into Anthropic's tools[] schema format.
//
//  Anthropic expects:
//    { name, description, input_schema: { type: 'object', properties, required } }
//
//  Our ToolHandler.schema is already JSON Schema — just rename `schema` →
//  `input_schema` and pass through. We DO NOT emit workspaceId as a property
//  even if a handler used it internally — dispatcher injects that, so it's
//  invisible to Claude by construction.
// ════════════════════════════════════════════════════════════════════════

import type { ToolHandler } from './dispatcher';

/** Minimal shape matching @anthropic-ai/sdk's Tool type. */
export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Convert one handler's schema to Anthropic's tool spec. Recursively strips
 * `default` from JSON Schema nodes because Anthropic's tool-use API doesn't
 * accept them (validators outside the model handle defaults instead).
 */
export function handlerToAnthropicTool(handler: ToolHandler<unknown, unknown>): AnthropicToolDef {
  const schema = handler.schema;
  return {
    name: handler.name,
    description: handler.description,
    input_schema: {
      type: 'object',
      properties: stripDefaults(schema.properties ?? {}),
      ...(schema.required ? { required: schema.required } : {}),
      // `additionalProperties: false` is critical for tool safety — it blocks
      // Claude from injecting fields the handler doesn't expect.
      additionalProperties: schema.additionalProperties ?? false,
    },
  };
}

/** Convert every handler at once. */
export function handlersToAnthropicTools(handlers: ToolHandler<unknown, unknown>[]): AnthropicToolDef[] {
  return handlers.map(handlerToAnthropicTool);
}

/** Deeply drop `default` fields from a JSON Schema tree. Anthropic's tool
 *  specs don't accept them; defaults are applied by our validator instead. */
function stripDefaults(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'default') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = stripDefaults(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Enums are arrays of primitives — pass through.
      out[key] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}
