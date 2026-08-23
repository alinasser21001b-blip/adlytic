// ════════════════════════════════════════════════════════════════════════
//  src/api/errors.ts — every failure mode the client can name, and NOTHING
//  the user ever sees that looks like `undefined`, `[object Object]`, a
//  stack trace, or a raw HTTP status.
// ════════════════════════════════════════════════════════════════════════

export type ApiErrorKind =
  | 'OFFLINE'          // fetch itself threw — no route to the server
  | 'TIMEOUT'          // request exceeded the client timeout
  | 'UNAUTHORIZED'     // 401 — token missing/invalid/revoked
  | 'FORBIDDEN'        // 403 — authenticated, not entitled
  | 'NOT_FOUND'        // 404
  | 'RATE_LIMITED'     // 429
  | 'SERVER_DOWN'      // 5xx, or 503 from a dependency (e.g. token-health)
  | 'TIMED_OUT_UPSTREAM' // 504 DASHBOARD_TIMEOUT — a real, named backend state
  | 'BAD_RESPONSE'     // 2xx but the body failed shape validation
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Machine code from the body (`error.code` / `error`), when present. Never shown verbatim to the user. */
  readonly code: string | null;

  constructor(kind: ApiErrorKind, status: number | null, code: string | null, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function kindFromStatus(status: number, code: string | null): ApiErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 504 && code === 'DASHBOARD_TIMEOUT') return 'TIMED_OUT_UPSTREAM';
  if (status >= 500) return 'SERVER_DOWN';
  return 'UNKNOWN';
}
