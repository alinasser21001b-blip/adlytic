// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/agentTools.ts
//
//  Convert ToolHandler[] into AIToolDef[] (provider-agnostic).
//  Replaces anthropicTools.ts — the provider adapter handles
//  format differences (input_schema vs function.parameters).
// ════════════════════════════════════════════════════════════════════════

import type { ToolHandler } from './dispatcher';
import type { AIToolDef } from '../ai/types';

export function handlerToAIToolDef(handler: ToolHandler<unknown, unknown>): AIToolDef {
  const schema = handler.schema;
  return {
    name: handler.name,
    description: handler.description,
    parameters: {
      type: 'object',
      properties: schema.properties ?? {},
      ...(schema.required ? { required: schema.required } : {}),
      additionalProperties: schema.additionalProperties ?? false,
    },
  };
}

export function handlersToAIToolDefs(handlers: ToolHandler<unknown, unknown>[]): AIToolDef[] {
  return handlers.map(handlerToAIToolDef);
}
