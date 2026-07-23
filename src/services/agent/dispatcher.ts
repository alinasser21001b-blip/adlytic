// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/dispatcher.ts
//
//  The one place tool calls flow through. Workspace-isolated by construction:
//  every handler receives `workspaceId` from the dispatcher (never from the
//  LLM), which was in turn resolved from the merchant's JWT at the HTTP
//  boundary. There is no path for Claude to name another workspace.
//
//  Responsibilities per call:
//    1. Rate limit  → RATE_LIMIT error if exceeded (retryable).
//    2. Validate    → INVALID_INPUT error with the failing field (retryable).
//    3. Cache read  → return cached success when hit (bypassed for writes).
//    4. Handler run → wrapped in per-tool timeout via Promise.race.
//    5. Cache write → for read tools only.
//    6. Envelope stamp — toolName, executionMs, cachedSeconds.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §5 (Agent loop) + §19 (guards)
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import type { ToolResult, ToolMeta } from './envelope';
import { fail } from './envelope';
import type { JsonSchema } from './validator';
import { validate } from './validator';
import { ToolCache, toolCache as defaultCache } from './cache';
import { RateLimiter, toolRateLimiter as defaultRateLimiter } from './rateLimit';

/**
 * The typed contract every tool handler implements. Handlers receive:
 *   • ctx: workspaceId + prisma + userId — always injected, never trusted from LLM.
 *   • args: validated + defaults filled + coerced by the dispatcher.
 * They return an unwrapped `ToolResult<T>` — dispatcher stamps meta.
 */
export interface ToolHandlerCtx {
  prisma: PrismaClient;
  workspaceId: string;
  userId: string;
}

export interface ToolHandler<Args, Data> {
  /** Tool name Claude sees in the tools[] list. Also the cache key prefix. */
  name: string;
  /** Description Claude reads to pick the tool. Keep specific + actionable. */
  description: string;
  /** JSON Schema Claude sees. workspaceId is NEVER a property here. */
  schema: JsonSchema;
  /** Cache TTL for the response. 0 = never cache (writes). */
  cacheTtlSeconds: number;
  /** Per-call timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** The handler. Args are validated + defaulted; ctx is trusted. */
  run(args: Args, ctx: ToolHandlerCtx): Promise<ToolResult<Data> | { ok: true; data: Data; partialMeta?: Partial<ToolMeta> }>;
}

export interface DispatcherOptions {
  cache?: ToolCache;
  rateLimiter?: RateLimiter;
  /** Fires on every call for observability. Non-blocking. */
  onCall?: (event: DispatcherEvent) => void;
}

export interface DispatcherEvent {
  workspaceId: string;
  userId: string;
  toolName: string;
  status: 'success' | 'failure' | 'cached';
  errorCode?: string;
  executionMs: number;
  argsHash: string;
}

/**
 * Dispatcher instance bound to a single (workspaceId, userId) pair — i.e.
 * one HTTP request. Build one per request, discard when done.
 */
export class ToolDispatcher {
  private readonly handlers: Map<string, ToolHandler<unknown, unknown>>;
  private readonly cache: ToolCache;
  private readonly rateLimiter: RateLimiter;
  private readonly onCall?: (event: DispatcherEvent) => void;

  constructor(
    handlers: ToolHandler<unknown, unknown>[],
    private readonly ctx: ToolHandlerCtx,
    options: DispatcherOptions = {},
  ) {
    this.handlers = new Map(handlers.map((h) => [h.name, h]));
    this.cache = options.cache ?? defaultCache;
    this.rateLimiter = options.rateLimiter ?? defaultRateLimiter;
    if (options.onCall) this.onCall = options.onCall;
  }

  /**
   * Dispatch one tool call. Returns the ToolResult envelope Claude reads.
   * NEVER throws — every failure becomes a structured error the LLM can act on.
   */
  async dispatch(toolName: string, rawArgs: unknown): Promise<ToolResult<unknown>> {
    const start = Date.now();
    const handler = this.handlers.get(toolName) as ToolHandler<unknown, unknown> | undefined;

    // Unknown tool — return a NOT_FOUND with the list of tools that DO exist,
    // so Claude can self-correct on the next iteration.
    if (!handler) {
      const known = Array.from(this.handlers.keys()).sort().join(', ');
      const result = fail('NOT_FOUND', `Unknown tool "${toolName}"`, {
        retryable: false,
        suggestion: `Available tools: ${known}`,
      });
      this.emit(toolName, 'failure', Date.now() - start, '', 'NOT_FOUND');
      return result;
    }

    // Rate limit
    const gate = this.rateLimiter.tryConsume(this.ctx.workspaceId);
    if (!gate.allowed) {
      const result = fail(
        'RATE_LIMIT',
        `Rate limit exceeded for this workspace. Try again in ~${Math.ceil((gate.retryAfterMs ?? 60_000) / 1000)}s.`,
        { retryable: true, suggestion: 'Wait, then retry with the same arguments.' },
      );
      this.emit(toolName, 'failure', Date.now() - start, '', 'RATE_LIMIT');
      return result;
    }

    // Validate arguments — additionalProperties: false blocks Claude from
    // injecting workspaceId or other fields not in the schema.
    const validation = validate(rawArgs, handler.schema);
    if (!validation.valid) {
      const first = validation.errors[0]!;
      const result = fail(
        'INVALID_INPUT',
        `Invalid argument at "${first.path}": ${first.message}`,
        { field: first.path, retryable: true, suggestion: 'Fix the field and retry.' },
      );
      this.emit(toolName, 'failure', Date.now() - start, '', 'INVALID_INPUT');
      return result;
    }
    const args = validation.value as Record<string, unknown>;

    // Cache read (skip for write tools where TTL = 0)
    const cacheKey = ToolCache.key(this.ctx.workspaceId, toolName, args);
    if (handler.cacheTtlSeconds > 0) {
      const cached = this.cache.get<ToolResult<unknown>>(cacheKey);
      if (cached && cached.value.ok) {
        const stamped: ToolResult<unknown> = {
          ok: true,
          data: cached.value.data,
          meta: {
            ...cached.value.meta,
            toolName,
            executionMs: Date.now() - start,
            cachedSeconds: cached.ageSeconds,
          },
        };
        this.emit(toolName, 'cached', Date.now() - start, cacheKey);
        return stamped;
      }
    }

    // Execute with timeout
    const timeoutMs = handler.timeoutMs ?? 5000;
    let handlerResult: ToolResult<unknown> | { ok: true; data: unknown; partialMeta?: Partial<ToolMeta> };
    try {
      handlerResult = await Promise.race([
        handler.run(args, this.ctx),
        new Promise<ToolResult<unknown>>((resolve) =>
          setTimeout(
            () =>
              resolve(
                fail('TIMEOUT', `Tool "${toolName}" exceeded ${timeoutMs}ms`, {
                  retryable: true,
                  suggestion: 'Try again with a narrower window or fewer items.',
                }),
              ),
            timeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      // Should be rare — handlers should return failure, not throw.
      const msg = err instanceof Error ? err.message : String(err);
      const result = fail('INTERNAL_ERROR', `Tool "${toolName}" threw: ${msg}`, { retryable: false });
      this.emit(toolName, 'failure', Date.now() - start, cacheKey, 'INTERNAL_ERROR');
      return result;
    }

    // Stamp meta and cache success
    if (handlerResult.ok) {
      const partialMeta = 'partialMeta' in handlerResult ? handlerResult.partialMeta ?? {} : ('meta' in handlerResult ? handlerResult.meta : {});
      const stamped: ToolResult<unknown> = {
        ok: true,
        data: handlerResult.data,
        meta: {
          ...partialMeta,
          toolName,
          executionMs: Date.now() - start,
        },
      };
      if (handler.cacheTtlSeconds > 0) {
        this.cache.set(cacheKey, stamped, handler.cacheTtlSeconds);
      }
      this.emit(toolName, 'success', Date.now() - start, cacheKey);
      return stamped;
    }

    // Handler returned a failure envelope — pass through as-is.
    this.emit(toolName, 'failure', Date.now() - start, cacheKey, handlerResult.error.code);
    return handlerResult;
  }

  /** Enumerate registered handlers — used to build the Anthropic `tools` array. */
  listHandlers(): ToolHandler<unknown, unknown>[] {
    return Array.from(this.handlers.values());
  }

  private emit(toolName: string, status: DispatcherEvent['status'], ms: number, argsHash: string, errorCode?: string): void {
    if (!this.onCall) return;
    try {
      this.onCall({
        workspaceId: this.ctx.workspaceId,
        userId: this.ctx.userId,
        toolName,
        status,
        executionMs: ms,
        argsHash,
        ...(errorCode !== undefined && { errorCode }),
      });
    } catch {
      // Observability must never break the request.
    }
  }
}
