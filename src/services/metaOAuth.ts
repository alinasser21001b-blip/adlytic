// ════════════════════════════════════════════════════════════════════════
//  src/services/metaOAuth.ts
//
//  Meta (Facebook) OAuth 2.0 flow — code exchange, token refresh, and
//  ad-account discovery.
//
//  This class is a transport layer only: it calls the Facebook Graph API
//  and returns raw data. No database writes happen here.
// ════════════════════════════════════════════════════════════════════════

/** Shape returned by Meta's /me/adaccounts endpoint. */
export interface MetaAdAccountInfo {
  id:              string;   // "act_123456"
  name:            string;
  currency:        string;
  timezone_name:   string;
  account_status:  number;   // 1 = ACTIVE
}

export class MetaOAuth {
  private base: string;

  constructor(
    private appId:       string,
    private appSecret:   string,
    private redirectUri: string,
    private apiVersion = 'v20.0',
  ) {
    this.base = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /** Build the URL users visit to grant permission to this app. */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:     this.appId,
      redirect_uri:  this.redirectUri,
      scope:         'ads_read,read_insights',
      state,
      response_type: 'code',
    });
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params}`;
  }

  /**
   * Exchange a one-time auth code for a short-lived (~1h) user access token.
   * Call this immediately from the OAuth callback.
   */
  async exchangeCode(code: string): Promise<string> {
    const params = new URLSearchParams({
      client_id:     this.appId,
      client_secret: this.appSecret,
      redirect_uri:  this.redirectUri,
      code,
    });
    const res  = await fetch(`${this.base}/oauth/access_token?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Code exchange failed');
    return String(data['access_token']);
  }

  /**
   * Exchange a short-lived user token for a 60-day long-lived token.
   * Returns the token and its TTL in seconds.
   */
  async getLongLivedToken(shortToken: string): Promise<{ token: string; expiresInSeconds: number }> {
    const params = new URLSearchParams({
      grant_type:        'fb_exchange_token',
      client_id:         this.appId,
      client_secret:     this.appSecret,
      fb_exchange_token: shortToken,
    });
    const res  = await fetch(`${this.base}/oauth/access_token?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Long-lived token exchange failed');
    return {
      token:           String(data['access_token']),
      expiresInSeconds: Number(data['expires_in'] ?? 5_184_000), // 60d default
    };
  }

  /** List all ad accounts accessible to the token holder. */
  async getAdAccounts(accessToken: string): Promise<MetaAdAccountInfo[]> {
    const params = new URLSearchParams({
      fields:       'id,name,currency,timezone_name,account_status',
      access_token: accessToken,
      limit:        '50',
    });
    const res  = await fetch(`${this.base}/me/adaccounts?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Failed to list ad accounts');
    return (data['data'] ?? []) as MetaAdAccountInfo[];
  }

  private throwIfError(data: Record<string, unknown>, context: string): void {
    if (data['error']) {
      const e = data['error'] as Record<string, unknown>;
      throw new Error(`[Meta] ${context}: ${String(e['message'] ?? e['type'] ?? 'unknown error')}`);
    }
  }
}

/**
 * Discriminated diagnostic result for Meta OAuth configuration.
 *  - ok=true  → all required env vars are present and well-formed.
 *  - ok=false → reason is a human-readable string suitable for logs and API responses.
 *
 * UI callers can rely on `ok` and surface `reason` for diagnostics; existing
 * callers that only care about the boolean continue to work via `buildMetaOAuth()`.
 */
export type MetaOAuthConfigStatus =
  | { ok: true;  redirectUri: string; apiVersion: string }
  | { ok: false; reason: string };

/**
 * Inspect the current Meta OAuth configuration and return an explicit reason
 * when it is unusable. Pure function — performs no network I/O.
 */
export function getMetaOAuthConfigStatus(): MetaOAuthConfigStatus {
  const appId     = (process.env['META_APP_ID']     ?? '').trim();
  const appSecret = (process.env['META_APP_SECRET'] ?? '').trim();
  if (!appId)     return { ok: false, reason: 'Missing META_APP_ID' };
  if (!appSecret) return { ok: false, reason: 'Missing META_APP_SECRET' };

  const redirectUri = (process.env['META_REDIRECT_URI'] ?? '').trim()
    || 'http://localhost:3001/api/meta/oauth/callback';
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: `Invalid META_REDIRECT_URI: protocol must be http or https (got "${parsed.protocol}")` };
    }
  } catch {
    return { ok: false, reason: `Invalid META_REDIRECT_URI: "${redirectUri}" is not a valid URL` };
  }

  const apiVersion = (process.env['META_API_VERSION'] ?? '').trim() || 'v20.0';
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    return { ok: false, reason: `Invalid META_API_VERSION: "${apiVersion}" (expected format like "v20.0")` };
  }

  return { ok: true, redirectUri, apiVersion };
}

/**
 * Factory: builds a MetaOAuth instance from env vars.
 * Returns null when META_APP_ID or META_APP_SECRET are not configured.
 * For diagnostic detail use `getMetaOAuthConfigStatus()`.
 */
export function buildMetaOAuth(): MetaOAuth | null {
  const status = getMetaOAuthConfigStatus();
  if (!status.ok) return null;

  // Safe to non-null assert: getMetaOAuthConfigStatus guarantees presence above.
  const appId     = (process.env['META_APP_ID']     ?? '').trim();
  const appSecret = (process.env['META_APP_SECRET'] ?? '').trim();

  return new MetaOAuth(appId, appSecret, status.redirectUri, status.apiVersion);
}
