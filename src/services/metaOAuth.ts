// ════════════════════════════════════════════════════════════════════════
//  src/services/metaOAuth.ts
//
//  Meta (Facebook) OAuth 2.0 flow — code exchange, token refresh, and
//  ad-account discovery.
//
//  This class is a transport layer only: it calls the Facebook Graph API
//  and returns raw data. No database writes happen here.
// ════════════════════════════════════════════════════════════════════════

import { config } from '../config';

/** Shape returned by Meta's /me/adaccounts endpoint. */
export interface MetaAdAccountInfo {
  id:              string;   // "act_123456"
  name:            string;
  currency:        string;
  timezone_name:   string;
  account_status:  number;   // 1 = ACTIVE
  /** Owning Business, when the field is requested + available (Phase 2). */
  business?:       { id: string; name?: string };
}

/**
 * Phase 2 — normalized result of inspecting a token via Graph `/debug_token`.
 * Used to validate a System User token and discover its identity + scopes.
 */
export interface MetaTokenDebugInfo {
  isValid:   boolean;
  /** Meta token type, e.g. "USER", "SYSTEM_USER", "PAGE". */
  type:      string | undefined;
  /** System user / user id behind the token (user_id or profile_id). */
  userId:    string | undefined;
  scopes:    string[];
  /** Expiry, or null when the token never expires (typical for System Users). */
  expiresAt: Date | null;
  appId:     string | undefined;
  raw:       Record<string, unknown>;
}

/**
 * Phase 2 — normalized System User connection snapshot, ready to persist as a
 * MetaConnection row. Pure transport result; no DB writes happen here.
 */
export interface MetaSystemUserConnection {
  systemUserId: string | undefined;
  businessId:   string | undefined;
  businessName: string | undefined;
  scopes:       string[];
  /** Expiry of the token, or null when it never expires. */
  expiresAt:    Date | null;
  accounts:     MetaAdAccountInfo[];
}

const META_AD_ACCOUNT_FIELDS = 'id,name,currency,timezone_name,account_status,business{id,name}';

function normalizeMetaAdAccountId(rawId: string): string {
  const id = rawId.trim();
  if (!id) return id;
  if (id.startsWith('act_')) return id;
  // Some Graph edges return bare numeric ids; normalize for consistent linking.
  if (/^\d+$/.test(id)) return `act_${id}`;
  return id;
}

function normalizeAndDedupeMetaAdAccounts(accounts: MetaAdAccountInfo[]): MetaAdAccountInfo[] {
  const out: MetaAdAccountInfo[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    if (!account?.id) continue;
    const normalizedId = normalizeMetaAdAccountId(String(account.id));
    if (!normalizedId || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    out.push({ ...account, id: normalizedId });
  }
  return out;
}

export class MetaOAuth {
  private base: string;

  constructor(
    private appId:       string,
    private appSecret:   string,
    private redirectUri: string,
    private apiVersion = config.meta.apiVersion,
    /** OAuth scope string sent in the authorization dialog. Defaults to
     *  `ads_read` (the production scope). Operators can downgrade via
     *  env to e.g. `public_profile` to validate the redirect handshake
     *  before Meta's App Review has approved `ads_read`. */
    private scope = 'ads_read',
  ) {
    this.base = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /** Build the URL users visit to grant permission to this app. */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:     this.appId,
      redirect_uri:  this.redirectUri,
      scope:         this.scope,
      state,
      response_type: 'code',
    });
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params}`;
  }

  /**
   * Phase 2 — Build the FB Login for Business "configuration" authorization
   * URL. Instead of the classic `scope` dialog, this references a pre-built
   * Login configuration by `config_id`; Meta then presents the business asset
   * selection flow (System User provisioning, ad-account/page grants, etc.)
   * defined by that configuration. The redirect/callback contract (code+state)
   * is identical to the classic flow.
   */
  getBusinessLoginUrl(state: string, configId: string): string {
    const params = new URLSearchParams({
      client_id:     this.appId,
      redirect_uri:  this.redirectUri,
      config_id:     configId,
      response_type: 'code',
      state,
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
      // `business{id,name}` is additive — legacy callers ignore the extra field,
      // while the Phase 2 System User flow uses it to discover the BM id.
      fields:       META_AD_ACCOUNT_FIELDS,
      access_token: accessToken,
      limit:        '50',
    });
    const res  = await fetch(`${this.base}/me/adaccounts?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Failed to list ad accounts');
    return normalizeAndDedupeMetaAdAccounts((data['data'] ?? []) as MetaAdAccountInfo[]);
  }

  /**
   * Phase 2 — Inspect a token via Graph `/debug_token` using the app access
   * token (`{appId}|{appSecret}`). Returns validity, type, owning id, granted
   * scopes, and expiry. Used to validate + identify a System User token.
   */
  async inspectToken(inputToken: string): Promise<MetaTokenDebugInfo> {
    const appToken = `${this.appId}|${this.appSecret}`;
    const params = new URLSearchParams({ input_token: inputToken, access_token: appToken });
    const res  = await fetch(`${this.base}/debug_token?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Token inspection failed');
    const d = (data['data'] ?? {}) as Record<string, unknown>;
    const expRaw = Number(d['expires_at'] ?? 0);
    return {
      isValid:   Boolean(d['is_valid']),
      type:      d['type'] ? String(d['type']) : undefined,
      // System User tokens expose the system user via `profile_id`; classic
      // user tokens use `user_id`. Prefer whichever is present.
      userId:    d['user_id'] ? String(d['user_id'])
               : d['profile_id'] ? String(d['profile_id'])
               : undefined,
      scopes:    Array.isArray(d['scopes']) ? (d['scopes'] as string[]) : [],
      // expires_at = 0 means the token never expires (System User tokens).
      expiresAt: expRaw > 0 ? new Date(expRaw * 1000) : null,
      appId:     d['app_id'] ? String(d['app_id']) : undefined,
      raw:       d,
    };
  }

  /**
   * Phase 2 — List the ad accounts owned by a specific Business, using a
   * System User token scoped to that Business. Complements `getAdAccounts`
   * (which is token-holder centric via `/me/adaccounts`).
   */
  async getBusinessAdAccounts(businessId: string, token: string): Promise<MetaAdAccountInfo[]> {
    const params = new URLSearchParams({
      fields:       META_AD_ACCOUNT_FIELDS,
      access_token: token,
      limit:        '100',
    });
    const res  = await fetch(`${this.base}/${encodeURIComponent(businessId)}/owned_ad_accounts?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Failed to list business owned ad accounts');
    return normalizeAndDedupeMetaAdAccounts((data['data'] ?? []) as MetaAdAccountInfo[]);
  }

  /**
   * Phase 2 — List ad accounts assigned to this business as client accounts.
   * Some FB Login for Business grants expose assets here instead of
   * `owned_ad_accounts`, so System User discovery must check both.
   */
  async getBusinessClientAdAccounts(businessId: string, token: string): Promise<MetaAdAccountInfo[]> {
    const params = new URLSearchParams({
      fields:       META_AD_ACCOUNT_FIELDS,
      access_token: token,
      limit:        '100',
    });
    const res  = await fetch(`${this.base}/${encodeURIComponent(businessId)}/client_ad_accounts?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Failed to list business client ad accounts');
    return normalizeAndDedupeMetaAdAccounts((data['data'] ?? []) as MetaAdAccountInfo[]);
  }

  /**
   * Phase 2 — List the Business Managers (BMs) the token holder belongs to /
   * owns, via Graph `/me/businesses`. For a System User token this returns the
   * business(es) that provisioned the system user — the authoritative source
   * for the owning BM id + name when an ad account doesn't expose
   * `business{id,name}`. Returns [] (not an error) when the token has no
   * business_management grant or owns no businesses.
   */
  async getOwnedBusinesses(token: string): Promise<Array<{ id: string; name?: string }>> {
    const params = new URLSearchParams({
      fields:       'id,name',
      access_token: token,
      limit:        '50',
    });
    const res  = await fetch(`${this.base}/me/businesses?${params}`);
    const data = await res.json() as Record<string, unknown>;
    this.throwIfError(data, 'Failed to list businesses');
    return (data['data'] ?? []) as Array<{ id: string; name?: string }>;
  }

  /**
   * Phase 2 — Validate a System User token and resolve everything needed to
   * persist a MetaConnection: the system user id, owning Business, granted
   * scopes, expiry, and the granted ad accounts. Network I/O only.
   *
   * Business discovery strategy (best → fallback):
   *   1. `/me/adaccounts` yields the owning `business{id,name}` per account —
   *      preferred because it's the BM that actually owns the ad assets.
   *   2. If no account exposes a business (missing grant on the account), fall
   *      back to `/me/businesses` (the BM(s) that own the System User itself)
   *      and take the first. A final `su_<id>`/'unknown' fallback lives in the
   *      caller for when even this returns nothing.
   */
  async resolveSystemUserConnection(token: string): Promise<MetaSystemUserConnection> {
    const debug = await this.inspectToken(token);
    if (!debug.isValid) {
      throw new Error('[Meta] System User token is not valid (debug_token is_valid=false)');
    }

    const meAccounts = await this.getAdAccounts(token);
    let businesses: Array<{ id: string; name?: string }> = [];
    try {
      businesses = await this.getOwnedBusinesses(token);
    } catch (err) {
      // Non-fatal: account discovery can still continue via /me/adaccounts.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Meta] /me/businesses lookup failed during System User resolution: ${msg}`);
    }

    const businessIds = new Set<string>();
    for (const account of meAccounts) {
      if (account.business?.id) businessIds.add(account.business.id);
    }
    for (const business of businesses) {
      if (business.id) businessIds.add(business.id);
    }

    const discovered: MetaAdAccountInfo[] = [...meAccounts];
    const meAccountsCount = meAccounts.length;
    let ownedAccountsCount = 0;
    let clientAccountsCount = 0;
    for (const businessId of businessIds) {
      try {
        const ownedAccounts = await this.getBusinessAdAccounts(businessId, token);
        ownedAccountsCount += ownedAccounts.length;
        discovered.push(...ownedAccounts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Meta] owned_ad_accounts lookup failed for business ${businessId}: ${msg}`);
      }
      try {
        const clientAccounts = await this.getBusinessClientAdAccounts(businessId, token);
        clientAccountsCount += clientAccounts.length;
        discovered.push(...clientAccounts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Meta] client_ad_accounts lookup failed for business ${businessId}: ${msg}`);
      }
    }
    const accounts = normalizeAndDedupeMetaAdAccounts(discovered);
    console.info(
      `[Meta] System User account discovery counts: /me/adaccounts=${meAccountsCount}, owned_ad_accounts=${ownedAccountsCount}, client_ad_accounts=${clientAccountsCount}, businesses=${businessIds.size}, unique_total=${accounts.length}`,
    );
    const biz = accounts.find(a => a.business?.id)?.business ?? businesses[0];

    return {
      systemUserId: debug.userId,
      businessId:   biz?.id,
      businessName: biz?.name,
      scopes:       debug.scopes,
      expiresAt:    debug.expiresAt,
      accounts,
    };
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
  | { ok: true;  redirectUri: string; apiVersion: string; scope: string }
  | { ok: false; reason: string };

/**
 * Inspect the current Meta OAuth configuration and return an explicit reason
 * when it is unusable. Pure function — performs no network I/O.
 */
export function getMetaOAuthConfigStatus(): MetaOAuthConfigStatus {
  const appId     = config.meta.appId;
  const appSecret = config.meta.appSecret;
  if (!appId)     return { ok: false, reason: 'Missing META_APP_ID' };
  if (!appSecret) return { ok: false, reason: 'Missing META_APP_SECRET' };

  // redirectUri carries a localhost default from config; still validate it
  // here so a malformed override surfaces an explicit reason.
  const redirectUri = config.meta.redirectUri;
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: `Invalid META_REDIRECT_URI: protocol must be http or https (got "${parsed.protocol}")` };
    }
  } catch {
    return { ok: false, reason: `Invalid META_REDIRECT_URI: "${redirectUri}" is not a valid URL` };
  }

  // apiVersion is already validated + normalized in config (falls back to the
  // default on a malformed value), so no re-check is needed here.
  const apiVersion = config.meta.apiVersion;

  // OAuth scope is intentionally permissive: any whitespace-separated list of
  // Meta scope tokens is accepted. We do NOT pin a closed allowlist because
  // Meta evolves the available scopes faster than we ship; rejecting an
  // unknown scope here would lock operators out of a valid future permission.
  // Empty / whitespace-only values fall back to the production default
  // `ads_read` so an accidentally-blanked env var never sends `scope=`.
  const scope = config.meta.oauthScope;

  return { ok: true, redirectUri, apiVersion, scope };
}

/**
 * Standalone Graph API call to list ad accounts using only a raw access
 * token + apiVersion — no App ID / App Secret needed.
 *
 * Exists for the `META_DIRECT_TOKEN` bypass: when an operator pastes a
 * Graph-API-Explorer or long-lived user token directly into env, we can
 * fetch the accounts without ever invoking the OAuth dialog. This is the
 * sibling of `MetaOAuth.getAdAccounts` but free of constructor coupling.
 */
export async function fetchMetaAdAccountsByToken(
  token: string,
  apiVersion = config.meta.apiVersion,
): Promise<MetaAdAccountInfo[]> {
  const params = new URLSearchParams({
    fields:       META_AD_ACCOUNT_FIELDS,
    access_token: token,
    limit:        '50',
  });
  const url = `https://graph.facebook.com/${apiVersion}/me/adaccounts?${params}`;
  const res  = await fetch(url);
  const data = await res.json() as Record<string, unknown>;
  if (data['error']) {
    const e = data['error'] as Record<string, unknown>;
    throw new Error(`[Meta] Direct token list-accounts failed: ${String(e['message'] ?? e['type'] ?? 'unknown error')}`);
  }
  return normalizeAndDedupeMetaAdAccounts((data['data'] ?? []) as MetaAdAccountInfo[]);
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
  const appId     = config.meta.appId as string;
  const appSecret = config.meta.appSecret as string;

  return new MetaOAuth(appId, appSecret, status.redirectUri, status.apiVersion, status.scope);
}
