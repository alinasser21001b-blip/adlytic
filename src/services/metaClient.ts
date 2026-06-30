// ════════════════════════════════════════════════════════════════════════
//  src/services/metaClient.ts
//
//  The ONLY file in the system allowed to know Meta API URLs and response
//  shapes. Returns raw Meta JSON. Does not translate, does not persist.
//  Translation happens in mappers/insightMapper.ts; persistence happens in
//  repositories/*Repo.ts. This file is a transport layer, nothing else.
//
//  If Meta deprecates v20.0 → v21.0, only this file changes.
// ════════════════════════════════════════════════════════════════════════

import { recordMetaResponseHeaders } from './metaUsageTracker';

export interface MetaClientConfig {
  apiVersion: string;          // e.g. "v20.0"
  accessToken: string;         // long-lived user/system-user token
  baseUrl?: string;            // override for tests
  maxRetries?: number;
  retryBaseMs?: number;
  fetchImpl?: typeof fetch;    // injectable for tests
}

/** Raw Meta insight row — kept as-is, never reshaped here. */
export type MetaInsightRow = Record<string, unknown>;

export class MetaApiError extends Error {
  constructor(public status: number, public body: unknown, msg: string) {
    super(msg);
  }
}

const DEFAULT_FIELDS = [
  "date_start", "date_stop",
  "spend", "impressions", "reach", "clicks",
  "inline_link_clicks", "unique_clicks",
  "ctr", "unique_ctr", "cpc", "cpm", "frequency",
  "actions", "action_values",
  "cost_per_action_type", "cost_per_unique_action_type",
  "purchase_roas",
].join(",");

export class MetaClient {
  private base: string;
  private token: string;
  private maxRetries: number;
  private retryBaseMs: number;
  private fetchFn: typeof fetch;

  constructor(cfg: MetaClientConfig) {
    this.base = `${cfg.baseUrl ?? "https://graph.facebook.com"}/${cfg.apiVersion}`;
    this.token = cfg.accessToken;
    this.maxRetries = cfg.maxRetries ?? 5;
    this.retryBaseMs = cfg.retryBaseMs ?? 500;
    this.fetchFn = cfg.fetchImpl ?? fetch;
  }

  /**
   * Fetch daily insights for an entity (account/campaign/adset/ad) over a
   * date range. Returns raw Meta rows; the mapper translates them.
   * Backfill window: callers should pass `since` 3+ days ago to capture
   * Meta's attribution backfill of recent days.
   */
  async getInsights(args: {
    externalId: string;               // "act_<id>" | "<campaign_id>" | ...
    level: "account" | "campaign" | "adset" | "ad";
    since: Date;                      // inclusive
    until: Date;                      // inclusive
    fields?: string;
    breakdowns?: string[];            // optional, e.g. ["age","gender"] | ["publisher_platform","platform_position"]
  }): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      level: args.level,
      time_increment: "1",            // one row per day
      fields: args.fields ?? DEFAULT_FIELDS,
      time_range: JSON.stringify({
        since: ymd(args.since),
        until: ymd(args.until),
      }),
      access_token: this.token,
      limit: "500",
    });
    if (args.breakdowns && args.breakdowns.length > 0) {
      params.set("breakdowns", args.breakdowns.join(","));
    }

    const url = `${this.base}/${args.externalId}/insights?${params.toString()}`;
    return this.paginated(url);
  }

  /**
   * Fetch *intra-day* insights for an entity using Meta's `date_preset=today`.
   * Meta evaluates the preset in the ad account's reporting timezone, so the
   * caller does not need to pass one — the account's timezone is implicit on
   * Meta's side. Used by Layer 10 (Velocity Tracker) to detect intra-day
   * bleeding; safe to call multiple times per hour.
   */
  async getTodayInsights(args: {
    externalId: string;
    level: "account" | "campaign" | "adset" | "ad";
    fields?: string;
    breakdowns?: string[];
  }): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      level: args.level,
      date_preset: "today",
      fields: args.fields ?? DEFAULT_FIELDS,
      access_token: this.token,
      limit: "500",
    });
    if (args.breakdowns && args.breakdowns.length > 0) {
      params.set("breakdowns", args.breakdowns.join(","));
    }

    const url = `${this.base}/${args.externalId}/insights?${params.toString()}`;
    return this.paginated(url);
  }

  /**
   * Fetch the *account-level all-time totals* using Meta's `date_preset=maximum`.
   * Returns a single aggregated row (no time_increment). Used to surface
   * true lifetime spend on the dashboard without backfilling years of
   * DailyStat rows. The mapper is NOT used here — caller reads spend
   * directly from the raw row.
   *
   * Note: Meta does NOT accept `date_preset=lifetime` on the insights endpoint
   * (returns OAuthException #100). `maximum` is the documented preset for the
   * full available history (typically up to 37 months).
   */
  async getLifetimeTotals(externalAccountId: string): Promise<MetaInsightRow[]> {
    return this.getLifetimeTotalsForEntity({
      externalId: externalAccountId,
      level: "account",
    });
  }

  /**
   * Fetch all-time totals for any entity (account/campaign/adset/ad) using
   * Meta's `date_preset=maximum`. Returns a single aggregated row.
   */
  async getLifetimeTotalsForEntity(args: {
    externalId: string;
    level: "account" | "campaign" | "adset" | "ad";
    fields?: string;
  }): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      level: args.level,
      date_preset: "maximum",
      fields: args.fields ?? "spend,impressions,clicks,reach,actions,action_values,purchase_roas,cost_per_action_type",
      access_token: this.token,
      limit: "1",
    });
    const url = `${this.base}/${args.externalId}/insights?${params.toString()}`;
    return this.paginated(url, 1);
  }

  /** List campaigns under an account — used for entity discovery. */
  async listCampaigns(externalAccountId: string): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time",
      access_token: this.token,
      limit: "200",
    });
    return this.paginated(`${this.base}/${externalAccountId}/campaigns?${params.toString()}`);
  }

  /** List ad sets under a campaign — used for AdSet discovery (Phase 5 Pass A). */
  async listAdSets(externalCampaignId: string): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      fields: "id,name,status,effective_status,daily_budget,optimization_goal,targeting",
      access_token: this.token,
      limit: "200",
    });
    return this.paginated(`${this.base}/${externalCampaignId}/adsets?${params.toString()}`);
  }

  /**
   * List ads under an ad set, with the creative expanded inline so we get
   * the creative's id + media + copy in one round-trip (instead of N+1
   * follow-up calls). Used by Phase 5 Pass B. The full creative blob is
   * preserved on the row under the `creative` key so the mapper can
   * normalize it into AdCreative.
   */
  async listAds(externalAdSetId: string): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      fields: [
        "id", "name", "status", "effective_status",
        // Field expansion: pull the related creative inline.
        "creative{id,name,thumbnail_url,image_hash,video_id,object_story_spec,asset_feed_spec,call_to_action_type,body,title}",
      ].join(","),
      access_token: this.token,
      limit: "200",
    });
    return this.paginated(`${this.base}/${externalAdSetId}/ads?${params.toString()}`);
  }

  /** Internal: follow paging.next until exhausted, with retry on transient errors. */
  private async paginated(initialUrl: string, maxPages = 500): Promise<MetaInsightRow[]> {
    const out: MetaInsightRow[] = [];
    let url: string | null = initialUrl;
    let pages = 0;
    while (url && pages < maxPages) {
      const page = await this.requestWithRetry(url);
      const data = (page.data ?? []) as MetaInsightRow[];
      out.push(...data);
      url = page.paging?.next ?? null;
      pages++;
    }
    if (url !== null && pages >= maxPages) {
      console.warn(`[MetaClient] Pagination truncated at ${maxPages} pages — possible runaway cursor`);
    }
    return out;
  }

  private async requestWithRetry(url: string): Promise<MetaPage> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchFn(url);
        void recordMetaResponseHeaders(res.headers, res.status).catch(() => {});
        if (res.status === 429 || res.status >= 500) {
          // retryable: throw to trigger backoff
          const body = await safeJson(res);
          throw new MetaApiError(res.status, body, `Meta ${res.status}`);
        }
        if (!res.ok) {
          // non-retryable client error (4xx other than 429)
          const body = await safeJson(res);
          throw new MetaApiError(res.status, body, `Meta ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
        }
        return (await res.json()) as MetaPage;
      } catch (e) {
        lastErr = e;
        const retryable =
          e instanceof MetaApiError ? (e.status === 429 || e.status >= 500) : true;
        if (!retryable || attempt === this.maxRetries) throw e;
        // exponential backoff with jitter
        const wait = this.retryBaseMs * 2 ** attempt + Math.random() * 200;
        await sleep(wait);
      }
    }
    throw lastErr;
  }
}

interface MetaPage {
  data?: MetaInsightRow[];
  paging?: { next?: string };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safeJson = async (r: Response) => {
  try { return await r.json(); } catch { return null; }
};
