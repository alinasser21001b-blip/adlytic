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
  const totalSpend = sum(daily, "spend");
  const totalMsgs = sum(daily, "messages");
  const totalReach = daily.length ? Number(daily[daily.length - 1].reach) : 0;
  const ctrAvg = avg(daily, "ctr");
  const cpmAvg = avg(daily, "cpm");
  const freqAvg = avg(daily, "frequency");
  const curr = account.currency;
  const money = (minor: number) =>
    `${curr === "IQD" ? Math.round(minor).toLocaleString() : (minor / 100).toFixed(2)} ${curr}`;

  const kpis: DashboardDTO["kpis"] = [
    { key: "spend", label: "Spend", value: totalSpend, display: money(totalSpend),
      deltaPct: trend?.spendTrend ?? null, direction: dir(trend?.spendTrend ?? null), goodWhenUp: true },
    { key: "messages", label: "Messages", value: totalMsgs, display: String(totalMsgs),
      deltaPct: trend?.resultsTrend ?? null, direction: dir(trend?.resultsTrend ?? null), goodWhenUp: true },
    { key: "ctr", label: "CTR", value: ctrAvg ?? 0, display: ctrAvg ? `${ctrAvg.toFixed(1)}%` : "—",
      deltaPct: trend?.ctrTrend ?? null, direction: dir(trend?.ctrTrend ?? null), goodWhenUp: true },
    { key: "cpm", label: "CPM", value: cpmAvg ?? 0, display: cpmAvg ? money(cpmAvg) : "—",
      deltaPct: trend?.cpmTrend ?? null, direction: dir(trend?.cpmTrend ?? null), goodWhenUp: false },
    { key: "frequency", label: "Frequency", value: freqAvg ?? 0, display: freqAvg ? freqAvg.toFixed(1) : "—",
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

  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      industry: ws.industryProfile?.name ?? null,
      locale,
      currency: curr,
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
