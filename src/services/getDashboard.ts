// ════════════════════════════════════════════════════════════════════════
//  src/services/getDashboard.ts
//
//  THE PRODUCT BOUNDARY.
//
//  Everything downstream consumes this one function: the web dashboard, the
//  future mobile app, PDF reports, alerts, and eventually AI narration. If
//  this object is well-shaped, all of them are well-shaped.
//
//  The frontend must never know that metric_trends, detected_issues,
//  knowledge_rules, recommendations, or health_scores exist as tables.
//  Those are joined and localized here and handed over as a single,
//  presentation-ready object. The page stays stupid.
//
//  As of Step 12, this function reads ENGINE OUTPUTS, not seed-derived
//  values. Health, trends, issues, recommendations all come from their
//  proper engine-output tables. Knowledge text comes via KnowledgeEngine
//  (one source of truth for the fallback rule).
//
//  Step 12 is connection, not invention. The DTO shape is unchanged.
//  The HTML rendering it is unchanged. Swap the engines for new ones and
//  this function's output stays identical in shape.
//
//  NO AI. NO Meta. Reads only from the database the engines populated.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType, Locale, IssueCode } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { KnowledgeEngine } from "../engines/knowledge/KnowledgeEngine";
import { HEALTH_ALGORITHM_VERSION } from "../engines/health/HealthScoreEngine";
import { currencyFactorNeedsHeal, resolveCurrencyMinorFactor } from "../lib/currency";

// ── Module-level Prisma client (used when no client is passed in).
// When getDashboard is called from the HTTP server, the server's own prisma
// instance is injected via opts.prisma to avoid a duplicate connection pool.
// This standalone client exists for scripts, tests, and CLI tools that call
// getDashboard without a server context.
const _dbUrl = process.env['DATABASE_URL'];
if (!_dbUrl) {
  throw new Error(
    'getDashboard: DATABASE_URL is not set. ' +
    'Start the server with --env-file=.env or set DATABASE_URL in the environment.'
  );
}
const _parsed  = new URL(_dbUrl);
const _isInternal = _parsed.hostname.endsWith('.railway.internal');
const _pool    = new pg.Pool({
  host:     _parsed.hostname,
  port:     Number(_parsed.port) || 5432,
  user:     decodeURIComponent(_parsed.username),
  password: decodeURIComponent(_parsed.password),
  database: _parsed.pathname.replace(/^\//, ''),
  ssl:      _isInternal ? false : { rejectUnauthorized: false },
});
const _standalonePrisma = new PrismaClient({ adapter: new PrismaPg(_pool) });

// ── The public shape. This is the contract every consumer codes against. ──
export interface DashboardDTO {
  /** Present and true only when the workspace has no ad account yet. */
  empty?: true;
  workspace?: {
    id: string;
    name: string;
    industry: string | null;
    locale: Locale;
    currency: string;
    /** Minor-unit factor for the account currency (100 for USD/EUR/…, 1 for IQD).
     *  Clients use this to render BigInt minor values without hard-coding the
     *  IQD-vs-everything-else rule. */
    currencyMinorFactor: number;
    lastSyncedAt: string | null;
    activeCampaigns: number;
  };
  health: {
    score: number;
    band: "excellent" | "good" | "attention" | "poor" | "none";
  };
  kpis: Array<{
    key: string;          // "spend" | "messages" | "ctr" | "cpm" | "frequency" | "reach"
    label: string;
    value: number;
    display: string;      // formatted for direct rendering
    deltaPct: number | null;
    direction: "up" | "down" | "flat";
    goodWhenUp: boolean;  // lets the frontend colour without knowing the metric
  }>;
  trendSeries: {
    dates: string[];
    messages: number[];
    spend: number[];
    ctr: number[];
  };
  issues: Array<{
    code: IssueCode;
    title: string;        // localized — frontend never maps codes to text
    severity: string;
    causes: string[];     // localized
    recommendations: string[]; // localized
    evidence: Record<string, unknown>;
  }>;
  priorityAction: {
    actionCode: string;
    priority: string;
    text: string;         // localized headline action
    details: Record<string, unknown> | null;
  } | null;
  bestCampaign: CampaignCard | null;
  worstCampaign: CampaignCard | null;

  // ── V6 Brain section (optional — present only when CampaignBrainSnapshot has rows). ──
  // Strangler Fig: when absent, the page renders V5 sections only. When present, the
  // V6 sections render *above* the V5 ones and the V5 stays as a fallback below.
  brain?: BrainSection;
}

// ── V6 Brain Section types ─────────────────────────────────────────────
export interface BrainCmoFeedItem {
  campaignId: string;
  campaignName: string;
  priority: string;       // CRITICAL | HIGH | NORMAL
  action: string;         // DecisionAction string
  /** Null when the cron narration worker hasn't written this row yet. */
  narration: {
    arabicTitle: string;
    arabicNarration: string;
    creativeDirective?: string;
  } | null;
  generatedAt: string | null;   // ISO timestamp
  tickDate: string;             // YYYY-MM-DD
}

export interface LivePulse {
  /** Aggregate burn rate across today's V2-enabled campaigns, in account-currency major units. */
  burnRate: number;
  burnRateDisplay: string;
  /** sum(today_spend) / sum(daily_budgets) × 100 — null when no budgets known. 0-100. */
  intraDaySpendPct: number | null;
  /** Average dnaMatchPercentage across today's V2 campaigns. 0-100. Null when no V2 ran. */
  dnaMatchPct: number | null;
  /** Campaigns reflected in today's aggregate. */
  campaignsObserved: number;
  /** Last brain tickDate that produced this pulse (YYYY-MM-DD). Null when no tick today. */
  tickDate: string | null;
}

export interface InterventionsLedger {
  /** Hero: estimated wasted spend prevented in last 7d, in account-currency major. */
  savedSpend: number;
  savedSpendDisplay: string;
  /** Recent interventions (auto-pause / refresh-creative) for the table. */
  recentActions: Array<{
    campaignId: string;
    campaignName: string;
    action: string;
    priority: string;
    tickDate: string;
  }>;
}

export interface BrainSection {
  cmoFeed: BrainCmoFeedItem[];
  livePulse: LivePulse;
  ledger: InterventionsLedger;
}

interface CampaignCard {
  id: string;
  name: string;
  health: number;
  band: string;
  messages: number;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
}

// ── Empty DTO — returned when workspace has no ad account connected yet ───────
export const EMPTY_DASHBOARD_DTO: DashboardDTO = {
  empty:          true,
  health:         { score: 0, band: "none" },
  kpis:           [],
  trendSeries:    { dates: [], messages: [], spend: [], ctr: [] },
  issues:         [],
  priorityAction: null,
  bestCampaign:   null,
  worstCampaign:  null,
};

// ── helpers ───────────────────────────────────────────────────────────────
function band(score: number): "excellent" | "good" | "attention" | "poor" {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "attention";
  return "poor";
}

function dir(delta: number | null): "up" | "down" | "flat" {
  if (delta === null || Math.abs(delta) < 0.005) return "flat";
  return delta > 0 ? "up" : "down";
}

/** Sum a numeric field across a set of daily rows (BigInt-safe). */
const sum = (rows: { [k: string]: any }[], f: string) =>
  rows.reduce((a, r) => a + Number(r[f] ?? 0), 0);

/** Average a nullable float field across rows that have it. */
function avg(rows: { [k: string]: any }[], f: string): number | null {
  const vals = rows.map((r) => r[f]).filter((v) => v != null) as number[];
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ════════════════════════════════════════════════════════════════════════
export async function getDashboard(
  workspaceId: string,
  opts: { locale?: Locale; windowDays?: number; prisma?: PrismaClient } = {}
): Promise<DashboardDTO> {
  // Use the caller's prisma instance (e.g. from the HTTP server) when provided.
  // Fallback to the module-level standalone client for scripts and tests.
  const prisma = opts.prisma ?? _standalonePrisma;
  const knowledge = new KnowledgeEngine(prisma);
  const windowDays = opts.windowDays ?? 30;

  // 1. Workspace + industry + the (single) ad account.
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: {
      industryProfile: true,
      adAccounts: { include: { campaigns: { where: { status: "ACTIVE" } } } },
    },
  });
  const locale = opts.locale ?? Locale.EN;
  const account = ws.adAccounts[0]; // Phase 1: one account per workspace
  if (!account) return EMPTY_DASHBOARD_DTO;

  // Auto-heal stale IQD rows that still carry the schema default factor=100.
  if (currencyFactorNeedsHeal(account.currency, account.currencyMinorFactor)) {
    const healed = resolveCurrencyMinorFactor(account.currency, null);
    await prisma.adAccount.update({
      where: { id: account.id },
      data: { currencyMinorFactor: healed },
    });
    account.currencyMinorFactor = healed;
    console.log(
      `[currency-heal] dashboard ${account.id.slice(0, 8)}… ${account.currency} factor → ${healed}`,
    );
  }

  const since = new Date(Date.now() - windowDays * 864e5);
  const sinceDate = new Date(since.toISOString().slice(0, 10));

  // 2. Account-level daily stats over the window (the trend + KPI source).
  const daily = await prisma.dailyStat.findMany({
    where: { entityType: EntityType.ACCOUNT, entityId: account.id, date: { gte: sinceDate } },
    orderBy: { date: "asc" },
  });

  // 3. Latest stored health score for the CURRENT algorithm version only.
  //    v1 rows may coexist for the same date; we explicitly pick v2.
  const healthRow = await prisma.healthScore.findFirst({
    where: {
      entityType: EntityType.ACCOUNT,
      entityId: account.id,
      algorithmVersion: HEALTH_ALGORITHM_VERSION,
    },
    orderBy: { date: "desc" },
  });
  const score = healthRow?.score ?? 0;

  // 4. Trends (Analytics Engine output) for KPI deltas.
  const trend = await prisma.metricTrend.findFirst({
    where: { entityType: EntityType.ACCOUNT, entityId: account.id },
    orderBy: { date: "desc" },
  });

  // 5. KPIs — current-window aggregates + deltas from the trend row.
  // ── Math audit note ──────────────────────────────────────────────────
  // CTR and CPM are RATIOS. Window-aggregated ratios must be computed from
  // window totals (Σnum / Σden), NOT as the arithmetic mean of per-day rates.
  // The mean-of-rates form treats every day equally regardless of impressions,
  // and overweights low-traffic days. This is the codebase's stated convention.
  const totalSpendMinor = sum(daily, "spend");
  const totalMsgs       = sum(daily, "messages");
  const totalReach      = daily.length ? Number(daily[daily.length - 1]!.reach) : 0;
  const totalImpr       = sum(daily, "impressions");
  const totalClicks     = sum(daily, "clicks");
  const curr            = account.currency;
  const factor          = resolveCurrencyMinorFactor(curr, account.currencyMinorFactor);

  /** Format a minor-unit value into account-currency major units. */
  const money = (minor: number): string => {
    if (!Number.isFinite(minor)) return `0 ${curr}`;
    // IQD has no practical minor unit; render the integer directly. For all
    // other currencies divide by their declared factor (not a hardcoded 100).
    if (factor === 1) return `${Math.round(minor).toLocaleString()} ${curr}`;
    return `${(minor / factor).toFixed(2)} ${curr}`;
  };
  /** Format an already-major-unit value (e.g. computed CPM) into currency. */
  const moneyMajor = (major: number): string => {
    if (!Number.isFinite(major)) return `0 ${curr}`;
    if (factor === 1) return `${Math.round(major).toLocaleString()} ${curr}`;
    return `${major.toFixed(2)} ${curr}`;
  };

  // Window-total CTR = Σclicks / Σimpressions × 100. Returns null when there
  // are zero impressions — silent zero would be a lie.
  const ctrWindow: number | null = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : null;
  // Window-total CPM = (Σspend_major / Σimpressions) × 1000.
  const totalSpendMajor = factor === 1 ? totalSpendMinor : totalSpendMinor / factor;
  const cpmWindow: number | null = totalImpr > 0 ? (totalSpendMajor / totalImpr) * 1000 : null;
  // Frequency: the true windowed value would need unique reach over the whole
  // window (Meta returns daily reach, not lifetime). Without that we keep the
  // daily-mean form but mark the limitation. Engines that need exact values
  // should pull from MetricTrend, not from this aggregate.
  const freqAvg = avg(daily, "frequency");

  const kpis: DashboardDTO["kpis"] = [
    { key: "spend", label: "Spend", value: totalSpendMinor, display: money(totalSpendMinor),
      deltaPct: trend?.spendTrend ?? null, direction: dir(trend?.spendTrend ?? null), goodWhenUp: true },
    { key: "messages", label: "Messages", value: totalMsgs, display: totalMsgs.toLocaleString(),
      deltaPct: trend?.resultsTrend ?? null, direction: dir(trend?.resultsTrend ?? null), goodWhenUp: true },
    { key: "ctr", label: "CTR", value: ctrWindow ?? 0,
      display: ctrWindow !== null ? `${ctrWindow.toFixed(2)}%` : "—",
      deltaPct: trend?.ctrTrend ?? null, direction: dir(trend?.ctrTrend ?? null), goodWhenUp: true },
    { key: "cpm", label: "CPM", value: cpmWindow ?? 0,
      display: cpmWindow !== null ? moneyMajor(cpmWindow) : "—",
      deltaPct: trend?.cpmTrend ?? null, direction: dir(trend?.cpmTrend ?? null), goodWhenUp: false },
    { key: "frequency", label: "Frequency", value: freqAvg ?? 0,
      display: freqAvg !== null ? freqAvg.toFixed(2) : "—",
      deltaPct: trend?.frequencyTrend ?? null, direction: dir(trend?.frequencyTrend ?? null), goodWhenUp: false },
    { key: "reach", label: "Reach", value: totalReach, display: totalReach.toLocaleString(),
      deltaPct: null, direction: "flat", goodWhenUp: true },
  ];

  // 6. Trend series for the chart.
  const trendSeries = {
    dates: daily.map((d: any) => d.date.toISOString().slice(0, 10)),
    messages: daily.map((d: any) => Number(d.messages)),
    spend: daily.map((d: any) => Number(d.spend)),
    ctr: daily.map((d: any) => d.ctr ?? 0),
  };

  // 7. Issues — join detected_issues → knowledge_rules, localized AND
  //    industry-specialized. The fallback rule (industry → universal) lives
  //    inside KnowledgeEngine; this function only consumes the result.
  const detected = await prisma.detectedIssue.findMany({
    where: { entityType: EntityType.ACCOUNT, entityId: account.id },
    orderBy: { severity: "desc" },
  });

  const knowledgeMap = await knowledge.lookupMany({
    issueCodes: (detected as any[]).map(d => d.issueCode as IssueCode),
    locale,
    industryProfileId: ws.industryProfileId,
  });

  const issues: DashboardDTO["issues"] = (detected as any[]).map(di => {
    const entry = knowledgeMap.get(di.issueCode as IssueCode);
    return {
      code: di.issueCode,
      title: entry?.title ?? di.issueCode,            // code as fallback when no rule exists
      severity: di.severity,
      causes: entry?.causes ?? [],
      recommendations: entry?.recommendations ?? [],
      evidence: di.evidenceJson as Record<string, unknown>,
    };
  });

  // 8. Priority action — highest-priority recommendation, rendered to text.
  const rec = await prisma.recommendation.findFirst({
    where: { entityType: EntityType.ACCOUNT, entityId: account.id },
    orderBy: [{ priority: "desc" }, { date: "desc" }],
  });
  // The recommendation's action text comes from the top issue's localized recs.
  const topIssue = issues[0];
  const priorityAction = rec
    ? {
        actionCode: rec.actionCode,
        priority: rec.priority,
        text: topIssue?.recommendations?.[0] ?? rec.actionCode,
        details: (rec.detailsJson as Record<string, unknown>) ?? null,
      }
    : null;

  // 9. Best / worst campaign — join campaign daily snapshot + campaign health.
  const cards = await buildCampaignCards(account.id, prisma);

  // 10. V6 Brain section — read CampaignBrainSnapshot, derive feed/pulse/ledger.
  //     Returns undefined when no snapshots exist for this workspace (V5-only render).
  const brain = await buildBrainSection(prisma, ws.id, account.id, account.currency, account.currencyMinorFactor);

  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      industry: ws.industryProfile?.name ?? null,
      locale,
      currency: curr,
      currencyMinorFactor: factor,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      activeCampaigns: account.campaigns.length,
    },
    health: { score, band: band(score) },
    kpis,
    trendSeries,
    issues,
    priorityAction,
    bestCampaign: cards.best,
    worstCampaign: cards.worst,
    ...(brain && { brain }),
  };
}

// ── Campaign cards: most-recent snapshot per campaign + its health score. ──
// Uses two bulk queries instead of 2N individual queries (no N+1).
async function buildCampaignCards(adAccountId: string, prisma: PrismaClient): Promise<{ best: CampaignCard | null; worst: CampaignCard | null }> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: "ACTIVE" },
  });
  if (!campaigns.length) return { best: null, worst: null };

  const campaignIds = campaigns.map((c) => c.id);

  // Bulk fetch: latest daily stat per campaign
  const allSnaps = await prisma.dailyStat.findMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: { in: campaignIds } },
    orderBy: { date: "desc" },
  });
  // Bulk fetch: latest health score per campaign
  const allHealth = await prisma.healthScore.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaignIds },
      algorithmVersion: HEALTH_ALGORITHM_VERSION,
    },
    orderBy: { date: "desc" },
  });

  // Build lookup maps: entityId → most-recent row (already ordered desc)
  const snapMap = new Map<string, (typeof allSnaps)[number]>();
  for (const s of allSnaps) if (!snapMap.has(s.entityId)) snapMap.set(s.entityId, s);
  const healthMap = new Map<string, (typeof allHealth)[number]>();
  for (const h of allHealth) if (!healthMap.has(h.entityId)) healthMap.set(h.entityId, h);

  const cards: CampaignCard[] = [];
  for (const c of campaigns) {
    const snap = snapMap.get(c.id);
    const h    = healthMap.get(c.id);
    if (!snap || !h) continue;
    cards.push({
      id: c.id,
      name: c.name,
      health: h.score,
      band: band(h.score),
      messages: Number(snap.messages),
      ctr: snap.ctr,
      cpm: snap.cpm,
      frequency: snap.frequency,
    });
  }

  if (!cards.length) return { best: null, worst: null };

  const sorted = [...cards].sort((a, b) => b.health - a.health);

  return {
    best: sorted[0],
    worst: sorted[sorted.length - 1],
  };
}

// ════════════════════════════════════════════════════════════════════════
//  V6 Brain Section — assembled from CampaignBrainSnapshot rows.
// ════════════════════════════════════════════════════════════════════════

/** Dials for derived figures the dashboard surfaces. Tunable, deliberately conservative. */
const BRAIN_SECTION_CONFIG = {
  CMO_FEED_LIMIT: 5,
  LEDGER_TABLE_LIMIT: 10,
  LEDGER_LOOKBACK_DAYS: 7,
  /** Conservative "hours of bleed prevented" assumption for the savedSpend hero number.
   *  Real-world the pause prevents the remainder of the day, but we don't know the local
   *  pause-hour from payload alone — 4h is a defensible underestimate that grows the
   *  hero number honestly rather than optimistically. */
  ASSUMED_HOURS_SAVED_PER_PAUSE: 4,
} as const;

const PAUSE_ACTIONS = new Set(['PAUSE_CAMPAIGN', 'EMERGENCY_PAUSE']);
const LEDGER_ACTIONS = new Set(['PAUSE_CAMPAIGN', 'EMERGENCY_PAUSE', 'REFRESH_CREATIVE', 'RESCUE_WATCH']);

interface CmoNarration {
  arabicTitle: string;
  arabicNarration: string;
  creativeDirective?: string;
}

/** Defensive read of payload.v2.velocity.burnRate — engine major units. */
function readBurnRate(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const v2 = (payload as Record<string, unknown>).v2;
  if (!v2 || typeof v2 !== 'object') return 0;
  const velocity = (v2 as Record<string, unknown>).velocity;
  if (!velocity || typeof velocity !== 'object') return 0;
  const br = (velocity as Record<string, unknown>).burnRate;
  return typeof br === 'number' && Number.isFinite(br) ? br : 0;
}

/** Defensive read of payload.v2.goldStandard.dnaMatchPercentage (0-100). */
function readDnaMatch(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const v2 = (payload as Record<string, unknown>).v2;
  if (!v2 || typeof v2 !== 'object') return null;
  const gold = (v2 as Record<string, unknown>).goldStandard;
  if (!gold || typeof gold !== 'object') return null;
  const pct = (gold as Record<string, unknown>).dnaMatchPercentage;
  return typeof pct === 'number' && Number.isFinite(pct) ? pct : null;
}

/** Defensive read of narrationJson into the typed CmoNarration shape. */
function readNarration(json: unknown): CmoNarration | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const t = obj['arabicTitle'];
  const n = obj['arabicNarration'];
  if (typeof t !== 'string' || typeof n !== 'string') return null;
  const dir = obj['creativeDirective'];
  const out: CmoNarration = { arabicTitle: t, arabicNarration: n };
  if (typeof dir === 'string' && dir.length > 0) out.creativeDirective = dir;
  return out;
}

/**
 * Build the V6 brain section for the workspace. Returns null when no brain
 * snapshots exist (V5-only render path stays valid).
 */
async function buildBrainSection(
  prisma: PrismaClient,
  workspaceId: string,
  adAccountId: string,
  currency: string,
  currencyMinorFactor: number,
): Promise<BrainSection | null> {
  // Today @ UTC midnight, matching BrainPersistence.toUtcMidnight semantics.
  const today = new Date();
  const tickToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Ledger window: last 7d.
  const ledgerSince = new Date(tickToday);
  ledgerSince.setUTCDate(ledgerSince.getUTCDate() - BRAIN_SECTION_CONFIG.LEDGER_LOOKBACK_DAYS);

  // Pull all relevant snapshots in one query — windowed at the ledger horizon,
  // wide enough to cover today's pulse + recent CMO feed + ledger. Bounded by workspace.
  const snapshots = await prisma.campaignBrainSnapshot.findMany({
    where: { workspaceId, tickDate: { gte: ledgerSince } },
    orderBy: { tickDate: 'desc' },
  });

  if (snapshots.length === 0) return null;

  // Resolve campaign names once (avoid per-snapshot N+1).
  const campaignIds = Array.from(new Set(snapshots.map(s => s.campaignId)));
  const camps = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(camps.map(c => [c.id, c.name]));

  // ── CMO Feed: top critical/high snapshots from today (or most recent tick). ──
  const sortedByPriority = [...snapshots].sort((a, b) => {
    // priority weight: CRITICAL > HIGH > NORMAL
    const w = (p: string) => (p === 'CRITICAL' ? 2 : p === 'HIGH' ? 1 : 0);
    const dp = w(b.priority) - w(a.priority);
    if (dp !== 0) return dp;
    return b.tickDate.getTime() - a.tickDate.getTime();
  });
  const cmoFeed: BrainCmoFeedItem[] = sortedByPriority
    .slice(0, BRAIN_SECTION_CONFIG.CMO_FEED_LIMIT)
    .map(s => ({
      campaignId: s.campaignId,
      campaignName: nameById.get(s.campaignId) ?? s.externalCampaignId,
      priority: s.priority,
      action: s.action,
      narration: readNarration(s.narrationJson),
      generatedAt: s.narrationGeneratedAt?.toISOString() ?? null,
      tickDate: s.tickDate.toISOString().slice(0, 10),
    }));

  // ── Live Pulse: aggregate across today's tick. ──
  const todaySnapshots = snapshots.filter(s => s.tickDate.getTime() === tickToday.getTime());

  let burnRate = 0;
  const dnaSamples: number[] = [];
  let campaignsObserved = 0;
  for (const s of todaySnapshots) {
    const br = readBurnRate(s.payload);
    if (br > 0) {
      burnRate += br;
      campaignsObserved++;
    }
    const dna = readDnaMatch(s.payload);
    if (dna !== null) dnaSamples.push(dna);
  }
  const dnaMatchPct = dnaSamples.length
    ? dnaSamples.reduce((a, b) => a + b, 0) / dnaSamples.length
    : null;

  // intraDaySpendPct: sum(today's campaign-level spend) / sum(daily budgets) × 100.
  // Independent of payload — pulls from DailyStat + Campaign.dailyBudget.
  const campaignsForBudget = await prisma.campaign.findMany({
    where: { adAccountId, status: 'ACTIVE' },
    select: { id: true, dailyBudget: true },
  });
  const totalDailyBudgetMinor = campaignsForBudget.reduce(
    (a, c) => a + (c.dailyBudget ? Number(c.dailyBudget) : 0),
    0,
  );
  const todaysCampaignStats = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaignsForBudget.map(c => c.id) },
      date: tickToday,
    },
    select: { spend: true },
  });
  const totalSpendTodayMinor = todaysCampaignStats.reduce((a, r) => a + Number(r.spend), 0);
  const intraDaySpendPct = totalDailyBudgetMinor > 0
    ? +(totalSpendTodayMinor / totalDailyBudgetMinor * 100).toFixed(1)
    : null;

  const pulseTickDate = todaySnapshots.length > 0
    ? todaySnapshots[0]?.tickDate.toISOString().slice(0, 10) ?? null
    : null;

  const livePulse: LivePulse = {
    burnRate: +burnRate.toFixed(2),
    burnRateDisplay: fmtMajor(burnRate, currency),
    intraDaySpendPct,
    dnaMatchPct: dnaMatchPct !== null ? +dnaMatchPct.toFixed(1) : null,
    campaignsObserved,
    tickDate: pulseTickDate,
  };

  // ── Interventions Ledger: 7d window. ──
  const interventionRows = snapshots.filter(s => LEDGER_ACTIONS.has(s.action));

  // savedSpend: sum(burnRate × ASSUMED_HOURS_SAVED_PER_PAUSE) over pause-class actions in 7d.
  let savedSpend = 0;
  for (const s of interventionRows) {
    if (!PAUSE_ACTIONS.has(s.action)) continue;
    const br = readBurnRate(s.payload);
    savedSpend += br * BRAIN_SECTION_CONFIG.ASSUMED_HOURS_SAVED_PER_PAUSE;
  }

  const ledger: InterventionsLedger = {
    savedSpend: +savedSpend.toFixed(2),
    savedSpendDisplay: fmtMajor(savedSpend, currency),
    recentActions: interventionRows
      .slice(0, BRAIN_SECTION_CONFIG.LEDGER_TABLE_LIMIT)
      .map(s => ({
        campaignId: s.campaignId,
        campaignName: nameById.get(s.campaignId) ?? s.externalCampaignId,
        action: s.action,
        priority: s.priority,
        tickDate: s.tickDate.toISOString().slice(0, 10),
      })),
  };

  return { cmoFeed, livePulse, ledger };

  // Helper local to this fn — formats a major-unit number into the account currency.
  // Mirrors the `money()` minor-unit formatter above but for engine major units.
  function fmtMajor(v: number, ccy: string): string {
    if (!Number.isFinite(v)) return `0 ${ccy}`;
    if (ccy === 'IQD') return `${Math.round(v).toLocaleString()} ${ccy}`;
    return `${v.toFixed(2)} ${ccy}`;
  }
}

// ════════════════════════════════════════════════════════════════════════
//  /api/dashboard/pulse — lean polling DTO
//
//  Returns only volatile data the UI refreshes every 60s: aggregate burn rate,
//  intra-day spend %, dnaMatchPct, observed-campaign count, tickDate. No payload
//  decode beyond `readBurnRate` and `readDnaMatch`; no cmoFeed; no ledger.
//  Returns null when the workspace has no ad account (mirrors getDashboard EMPTY).
// ════════════════════════════════════════════════════════════════════════

export interface DashboardPulseDTO extends LivePulse {
  workspaceId: string;
}

export async function getDashboardPulse(
  workspaceId: string,
  opts: { prisma?: PrismaClient } = {},
): Promise<DashboardPulseDTO | null> {
  const prisma = opts.prisma ?? _standalonePrisma;

  // Account context — same Phase-1 "one account per workspace" assumption.
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { adAccounts: { select: { id: true, currency: true } } },
  });
  const account = ws?.adAccounts[0];
  if (!account) return null;

  const today = new Date();
  const tickToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Today's snapshots (one tick per campaign per UTC day).
  const todaySnapshots = await prisma.campaignBrainSnapshot.findMany({
    where: { workspaceId, tickDate: tickToday },
    select: { payload: true, tickDate: true },
  });

  let burnRate = 0;
  let campaignsObserved = 0;
  const dnaSamples: number[] = [];
  for (const s of todaySnapshots) {
    const br = readBurnRate(s.payload);
    if (br > 0) {
      burnRate += br;
      campaignsObserved++;
    }
    const dna = readDnaMatch(s.payload);
    if (dna !== null) dnaSamples.push(dna);
  }
  const dnaMatchPct = dnaSamples.length
    ? +(dnaSamples.reduce((a, b) => a + b, 0) / dnaSamples.length).toFixed(1)
    : null;

  // intraDaySpendPct — independent of brain payload (DailyStat + dailyBudget).
  const campaignsForBudget = await prisma.campaign.findMany({
    where: { adAccountId: account.id, status: 'ACTIVE' },
    select: { id: true, dailyBudget: true },
  });
  const totalDailyBudgetMinor = campaignsForBudget.reduce(
    (a, c) => a + (c.dailyBudget ? Number(c.dailyBudget) : 0),
    0,
  );
  const todaysCampaignStats = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaignsForBudget.map(c => c.id) },
      date: tickToday,
    },
    select: { spend: true },
  });
  const totalSpendTodayMinor = todaysCampaignStats.reduce((a, r) => a + Number(r.spend), 0);
  const intraDaySpendPct = totalDailyBudgetMinor > 0
    ? +(totalSpendTodayMinor / totalDailyBudgetMinor * 100).toFixed(1)
    : null;

  const tickDate = todaySnapshots.length > 0 ? tickToday.toISOString().slice(0, 10) : null;
  const ccy = account.currency;
  const burnRateDisplay = ccy === 'IQD'
    ? `${Math.round(burnRate).toLocaleString()} ${ccy}`
    : `${burnRate.toFixed(2)} ${ccy}`;

  return {
    workspaceId,
    burnRate: +burnRate.toFixed(2),
    burnRateDisplay,
    intraDaySpendPct,
    dnaMatchPct,
    campaignsObserved,
    tickDate,
  };
}
