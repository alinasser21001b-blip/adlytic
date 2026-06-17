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
      scope:         'ads_management,ads_read,read_insights',
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
 * Factory: builds a MetaOAuth instance from env vars.
 * Returns null when META_APP_ID or META_APP_SECRET are not configured.
 */
export function buildMetaOAuth(): MetaOAuth | null {
  const appId      = process.env['META_APP_ID'];
  const appSecret  = process.env['META_APP_SECRET'];
  if (!appId || !appSecret) return null;

  const redirectUri = process.env['META_REDIRECT_URI']
    ?? 'http://localhost:3001/api/meta/oauth/callback';
  const apiVersion  = process.env['META_API_VERSION'] ?? 'v20.0';

  return new MetaOAuth(appId, appSecret, redirectUri, apiVersion);
}
