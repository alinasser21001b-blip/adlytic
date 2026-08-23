// ════════════════════════════════════════════════════════════════════════
//  src/api/client.ts — the ONLY place that calls fetch().
//
//  Every request carries `Authorization: Bearer <token>` and nothing else
//  identity-bearing — the server's own adapter comment is explicit that
//  there is deliberately no cookie fallback, so this client sets no cookie
//  and reads none. The token lives in the platform Keychain via
//  expo-secure-store (src/auth/session.ts); it is never logged, never put
//  in a URL, and this file's own request logging (observability.ts) strips
//  the Authorization header before it ever reaches a log line.
// ════════════════════════════════════════════════════════════════════════

import { API_BASE_URL } from './config';
import { ApiError, kindFromStatus } from './errors';
import { logApiFailure } from '../observability/log';

const REQUEST_TIMEOUT_MS = 20_000;

export type TokenGetter = () => Promise<string | null>;
export type OnUnauthorized = () => void;

let getToken: TokenGetter = async () => null;
let onUnauthorized: OnUnauthorized = () => {};

/** Wired once from AuthProvider at app start. Keeps this module free of React. */
export function configureApiClient(opts: { getToken: TokenGetter; onUnauthorized: OnUnauthorized }): void {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip attaching a bearer token — login/register only. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function parseErrorCode(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.code === 'string') return b.code;
    if (typeof b.error === 'string') return b.error;
  }
  return null;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Let an externally-passed signal abort us too (e.g. a screen unmounting).
  opts.signal?.addEventListener('abort', () => controller.abort());

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opts.anonymous) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof Error && e.name === 'AbortError';
    const kind = aborted ? 'TIMEOUT' : 'OFFLINE';
    logApiFailure({ path, kind, status: null });
    throw new ApiError(kind, null, null, aborted ? 'request timed out' : 'network unreachable');
  }
  clearTimeout(timeout);

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try { json = JSON.parse(text); } catch { /* non-JSON body handled below */ }
  }

  if (!res.ok) {
    const code = parseErrorCode(json);
    const kind = kindFromStatus(res.status, code);
    logApiFailure({ path, kind, status: res.status });
    if (kind === 'UNAUTHORIZED') onUnauthorized();
    throw new ApiError(kind, res.status, code, `${res.status} ${code ?? ''}`.trim());
  }

  if (text && json === null) {
    // 2xx with a non-JSON body is a contract break, not a network issue.
    logApiFailure({ path, kind: 'BAD_RESPONSE', status: res.status });
    throw new ApiError('BAD_RESPONSE', res.status, null, 'response was not JSON');
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
