// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/envelope.ts
//
//  The one response shape every AI-agent tool returns. Predictable success
//  and failure structure lets Claude never guess whether it got what it
//  asked for.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.1
// ════════════════════════════════════════════════════════════════════════

/** Success or structured failure — Claude branches on `ok`. */
export type ToolResult<T> =
  | { ok: true; data: T; meta: ToolMeta }
  | { ok: false; error: ToolError };

/** Per-call metadata surfaced to Claude so it can reason about staleness. */
export interface ToolMeta {
  toolName: string;
  executionMs: number;
  /** Present when the response was served from the in-process cache. */
  cachedSeconds?: number;
  /** Response was upserted by an idempotent write and the key already existed. */
  deduplicated?: boolean;
  /**
   * Data-source freshness. Every read tool populates this so the assistant can
   * honestly acknowledge "بيانات آخر مزامنة قبل N دقيقة". Absent on pure-write
   * tools that don't read state.
   */
  dataFreshness?: DataFreshness;
}

export interface DataFreshness {
  /** Postgres table that produced the data (e.g. "daily_stats"). */
  sourceTable: string;
  /** YYYY-MM-DD of the newest row read from that table. Null when no rows. */
  latestRowDate: string | null;
  /** now - account.lastSyncedAt, in whole minutes. Null when never synced. */
  stalenessMinutes: number | null;
}

/** Structured error — enum code + retryability + optional field. */
export interface ToolError {
  code: ToolErrorCode;
  message: string;
  /** Which input parameter failed validation, when known. */
  field?: string;
  /** True when Claude should retry the same call after backoff. */
  retryable: boolean;
  /** Actionable hint for Claude on how to recover. */
  suggestion?: string;
}

export type ToolErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'STALE_DATA';

/** Convenience: build a success envelope. `meta.toolName` and `executionMs`
 *  are stamped by the dispatcher; handlers only fill `dataFreshness`. */
export function ok<T>(data: T, dataFreshness?: DataFreshness): { ok: true; data: T; partialMeta: Omit<ToolMeta, 'toolName' | 'executionMs'> } {
  return { ok: true, data, partialMeta: dataFreshness ? { dataFreshness } : {} };
}

/** Convenience: build a failure envelope. */
export function fail(
  code: ToolErrorCode,
  message: string,
  opts: { field?: string; retryable?: boolean; suggestion?: string } = {},
): ToolResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(opts.field !== undefined && { field: opts.field }),
      retryable: opts.retryable ?? false,
      ...(opts.suggestion !== undefined && { suggestion: opts.suggestion }),
    },
  };
}
