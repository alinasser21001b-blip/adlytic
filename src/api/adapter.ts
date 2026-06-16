// ════════════════════════════════════════════════════════════════════════
//  src/api/adapter.ts
//
//  Framework-agnostic request/response layer.
//
//  Every route handler in server.ts receives an ApiRequest and returns an
//  ApiResponse — zero Hono imports inside the handlers. The adapter here
//  is the only file that knows about Hono's Context.
//
//  Protected routes accept credentials from either:
//    • Authorization: Bearer <token>    (preferred)
//    • adlytic_session cookie           (browser fallback)
// ════════════════════════════════════════════════════════════════════════

import type { Context } from 'hono';

// ── Types ─────────────────────────────────────────────────────────────────

/** Normalised, framework-agnostic inbound request. */
export interface ApiRequest {
  method: string;
  url: string;
  path: string;
  /** Route path parameters, e.g. { workspaceId: "abc" }. */
  params: Record<string, string>;
  /** Parsed query-string values. */
  query: Record<string, string>;
  /** All request headers, lower-cased. */
  headers: Record<string, string>;
  /** Parsed JSON body, or null for non-JSON / empty requests. */
  body: unknown;
  /** Parsed cookies. */
  cookies: Record<string, string>;
  /**
   * Resolved bearer token. Populated from the Authorization header first,
   * then the adlytic_session cookie. Null when neither is present.
   */
  bearerToken: string | null;
}

/** Normalised outbound response. */
export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** Signature every route handler must satisfy. */
export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

// ── Hono → ApiRequest ─────────────────────────────────────────────────────

/**
 * Converts a Hono Context into an ApiRequest.
 * Call this at the top of every handler that needs the normalised shape.
 */
export async function honoToApiRequest(c: Context): Promise<ApiRequest> {
  const url = new URL(c.req.url);

  // Query parameters
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  // Request headers (lower-cased by the Fetch API)
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k] = v;
  });

  // Cookies — manual parse so we have zero extra dependencies
  const cookies: Record<string, string> = {};
  const cookieHeader = c.req.header('cookie') ?? '';
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const sep = part.indexOf('=');
      if (sep !== -1) {
        const k = part.slice(0, sep).trim();
        const v = part.slice(sep + 1).trim();
        if (k) cookies[k] = v;
      }
    }
  }

  // Body — only consumed when Content-Type is application/json
  let body: unknown = null;
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      body = await c.req.json();
    } catch {
      // Malformed JSON — leave body null; handler decides whether to reject
    }
  }

  // Bearer token resolution
  const authHeader = c.req.header('authorization') ?? '';
  let bearerToken: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.slice(7).trim() || null;
  } else if (cookies['adlytic_session']) {
    bearerToken = cookies['adlytic_session'];
  }

  return {
    method: c.req.method,
    url: c.req.url,
    path: url.pathname,
    // c.req.param() returns Record<string,string> on a generic Context
    params: c.req.param() as Record<string, string>,
    query,
    headers,
    body,
    cookies,
    bearerToken,
  };
}
