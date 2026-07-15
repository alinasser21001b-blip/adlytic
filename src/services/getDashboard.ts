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
import { performance } from "node:perf_hooks";
import { KnowledgeEngine } from "../engines/knowledge/KnowledgeEngine";
import {
  evaluateCampaign,
  evaluateBenchmarks,
  findActionsForBreaches,
  formatActionsForDisplay,
  type CampaignMetrics,
} from "../knowledge";
import {
  buildAdviceTask,
  buildAdviceTaskFromDiagnosis,
  issueActionAr,
  issueTitleAr,
  issueWhyAr,
  sanitizeIssueForMerchant,
  sanitizePriorityActionText,
  simplifyMerchantText,
  type AdviceTask,
} from "../lib/plainArabicAdvice";
import {
  resolveBenchmarkIndustryFromContext,
  toBenchmarkEvaluationOptions,
} from "../knowledge/industryRouting";
import { HEALTH_ALGORITHM_VERSION } from "../engines/health/HealthScoreEngine";
import { diagnoseRelevance } from "../knowledge/adRelevanceIntelligence";
import { EntityStatus } from "@prisma/client";
import { healAccountCurrencyAndSpend } from "../lib/iqdRepair";
import { currencyFactorNeedsHeal, resolveCurrencyMinorFactor } from "../lib/currency";
import { getCampaignCounts, type CampaignCounts } from "../lib/campaignCatalog";
import { trend as pctTrend } from "../engines/analytics/trend";
import type { CmoFeedItemDTO, CmoFeedMeta, CmoFeedSeverity } from "../types/cmoFeed";
import { RecommendationService } from "./recommendation.service";
import { computePredictions, type PredictionsDTO } from "./predictions";
import { computeAIRecommendations, type AIRecommendationsDTO } from "./aiRecommendations";
import { generateWeeklyReport, type WeeklyReportDTO } from "./weeklyReport";
import { diagnose, type Diagnosis } from "../engines/rules/diagnose";
import {
  isGenericInsightNarration,
  buildDeterministicNarration,
  selectUsefulFeedItems,
  upgradeGenericNarration,
} from "../lib/insightQualityGate";
import type { Signals } from "../engines/rules/types";
import type { IssueRecord } from "../repositories/detectedIssuesRepo";
import { attributeChange, type Attribution } from "../engines/analytics/attributeChange";

// ── Lazy-initialized standalone Prisma client (used when no client is passed in).
// When getDashboard is called from the HTTP server, the server's own prisma
// instance is injected via opts.prisma to avoid a duplicate connection pool.
// This standalone client exists for scripts, tests, and CLI tools that call
// getDashboard without a server context. Lazy-init avoids crashing importers
// that never call getDashboard (e.g. tests without DATABASE_URL).
let _standalonePrisma: PrismaClient | null = null;

function getStandalonePrisma(): PrismaClient {
  if (_standalonePrisma) return _standalonePrisma;
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    throw new Error(
      'getDashboard: DATABASE_URL is not set. ' +
      'Start the server with --env-file=.env or set DATABASE_URL in the environment.'
    );
  }
  const parsed = new URL(dbUrl);
  const isInternal = parsed.hostname.endsWith('.railway.internal');
  const caCert = process.env['DATABASE_CA_CERT'];
  const pool = new pg.Pool({
    host:     parsed.hostname,
    port:     Number(parsed.port) || 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl:      isInternal ? false : { rejectUnauthorized: true, ...(caCert ? { ca: caCert } : {}) },
    max: Number(process.env['PG_POOL_MAX'] ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _standalonePrisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return _standalonePrisma;
}

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
    /** Campaigns delivering spend in the window — primary operational "active" count. */
    activeCampaigns: number;
    /** Unified counts — same source used by AI + UI chips. */
    campaignCounts: {
      total: number;
      activeStatus: number;
      paused: number;
      archived: number;
      spendingToday: number;
      deliveringInWindow: number;
      dormantActive: number;
      withMetrics: number;
      deliveryWindowDays: number;
    };
  };
  health: {
    score: number | null;
    band: "excellent" | "good" | "attention" | "poor" | "none";
  };
  /** Account creative-health from Meta's ad-relevance grades. Null when no ad
   *  is graded yet; the UI card hides unless `needAttention > 0`. */
  creativeHealth?: CreativeHealthSummary | null;
  kpis: Array<{
    key: string;          // "spend" | "messages" | "ctr" | "cpm" | "frequency" | "reach"
    label: string;
    value: number | null;
    display: string;      // formatted for direct rendering
    deltaPct: number | null;
    direction: "up" | "down" | "flat";
    goodWhenUp: boolean;  // lets the frontend colour without knowing the metric
  }>;
  trendSeries: {
    dates: string[];
    /** Messaging conversions only — kept for AI/compat; prefer `results` in UI. */
    messages: number[];
    /** Outcome volume: messages + purchases + leads (Meta-style results). */
    results: number[];
    spend: number[];
    /** Daily CTR %; null when Meta did not return a rate (no impressions). */
    ctr: Array<number | null>;
    /** Daily frequency when present; null when Meta did not return it. */
    frequency: Array<number | null>;
    /** Daily CPM in major currency units; null when unavailable. Recomputed from spend÷impressions (stored DailyStat.cpm is minor). */
    cpm: Array<number | null>;
    /**
     * Daily cost-per-result in major units (spend / results).
     * Null when that day had zero results — never invent a fake CPA.
     */
    costPerResult: Array<number | null>;
  };
  issues: Array<{
    code: IssueCode;
    title: string;        // localized — frontend never maps codes to text
    severity: string;
    causes: string[];     // localized
    recommendations: string[]; // localized
    evidence: Record<string, unknown>;
  }>;
  /**
   * Merchant-facing task cards (فهم → قرار → فعل → تحقق).
   * Built from sanitized issues + priorityAction — primary UI contract.
   */
  merchantTasks?: AdviceTask[];
  diagnoses: Diagnosis[];
  attribution: Attribution | null;
  priorityAction: {
    actionCode: string;
    priority: string;
    text: string;         // localized headline action
    details: Record<string, unknown> | null;
  } | null;
  bestCampaign: CampaignCard | null;
  worstCampaign: CampaignCard | null;
  /** Every active campaign with its window metrics, sorted by health desc. Powers
   *  per-campaign answers in the AI assistant ("tell me about campaign X"). Optional
   *  so older/empty render paths stay valid. */
  campaigns?: CampaignCard[];
  /** Meta account lifetime spend from ad_accounts.lifetime_spend_minor (syncLifetimeTotals). */
  lifetimeSpend?: { minor: number; display: string; syncedAt: string | null };

  // ── V6 Brain section (optional — present only when CampaignBrainSnapshot has rows). ──
  // Strangler Fig: when absent, the page renders V5 sections only. When present, the
  // V6 sections render *above* the V5 ones and the V5 stays as a fallback below.
  brain?: BrainSection;

  /** Rich steady-state content when no critical actions remain (optional). */
  steadyState?: SteadyStateSummary;

  predictions?: PredictionsDTO;
  aiRecommendations?: AIRecommendationsDTO;
  weeklyReport?: WeeklyReportDTO;
}

/** Stable-account snapshot for Main Move + AI Assistant when no actions are pending. */
export interface SteadyStateCampaign {
  id: string;
  name: string;
  health: number;
  band: string;
  ctr: number | null;
  ctrDisplay: string;
  cpm: number | null;
  cpmDisplay: string;
  messages: number;
}

export interface SteadyStateBenchmark {
  key: string;
  label: string;
  valueDisplay: string;
  benchmarkLabel: string;
  verdict: string;
  positive: boolean;
}

export interface SteadyStateInsight {
  title: string;
  body: string;
}

export interface SteadyStateSummary {
  stableCampaigns: SteadyStateCampaign[];
  benchmarks: SteadyStateBenchmark[];
  backgroundSummary: string;
  mainMoveTitle: string;
  mainMoveNarrative: string;
  insights: SteadyStateInsight[];
}

// ── V6 Brain Section types ─────────────────────────────────────────────
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
  /** Deduplicated feed projection (narrationJson-only, truncated). */
  cmoFeedV2: CmoFeedItemDTO[];
  cmoFeedMeta: CmoFeedMeta;
  livePulse: LivePulse;
  ledger: InterventionsLedger;
}

export interface CampaignCard {
  id: string;
  metaId: string;
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
  trendSeries:    { dates: [], messages: [], results: [], spend: [], ctr: [], frequency: [], cpm: [], costPerResult: [] },
  issues:         [],
  merchantTasks:  [],
  diagnoses:      [],
  attribution:    null,
  priorityAction: null,
  bestCampaign:   null,
  worstCampaign:  null,
};

// ── helpers ───────────────────────────────────────────────────────────────
function band(score: number | null): "excellent" | "good" | "attention" | "poor" | "none" {
  if (score === null) return "none";
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

/** UTC date floor aligned with getDashboard / insights route window math. */
function utcDateFloor(daysAgo: number): Date {
  const since = new Date(Date.now() - daysAgo * 864e5);
  return new Date(since.toISOString().slice(0, 10));
}

/** Window-total CTR = Σclicks / Σimpressions × 100 (matches KPI aggregate math). */
function windowCtr(rows: { [k: string]: any }[]): number | null {
  const impr = sum(rows, "impressions");
  const clicks = sum(rows, "clicks");
  return impr > 0 ? (clicks / impr) * 100 : null;
}

/** Window-total CPM = (Σspend_major / Σimpressions) × 1000. */
function windowCpm(rows: { [k: string]: any }[], factor: number): number | null {
  const impr = sum(rows, "impressions");
  if (impr <= 0) return null;
  const spendMinor = sum(rows, "spend");
  const spendMajor = factor === 1 ? spendMinor : spendMinor / factor;
  return (spendMajor / impr) * 1000;
}

/**
 * KPI badge deltas: current N-day window vs the prior N-day window from daily_stats.
 * metric_trends (AnalyticsEngine, default 7d + 2d lag) remains for Rules Engine only.
 */
function computeWindowTrendDeltas(
  current: { [k: string]: any }[],
  prior: { [k: string]: any }[],
  factor: number,
): {
  spendTrend: number | null;
  resultsTrend: number | null;
  ctrTrend: number | null;
  cpmTrend: number | null;
  frequencyTrend: number | null;
} {
  const resultsVolume = (rows: { [k: string]: any }[]) =>
    sum(rows, "messages") + sum(rows, "purchases") + sum(rows, "leads");
  return {
    spendTrend: pctTrend(sum(current, "spend"), sum(prior, "spend")),
    // Align with trendSeries.results (messages + purchases + leads), not messages alone.
    resultsTrend: pctTrend(resultsVolume(current), resultsVolume(prior), { minSignal: 3 }),
    ctrTrend: pctTrend(windowCtr(current), windowCtr(prior), { noiseFloor: 0.02 }),
    cpmTrend: pctTrend(windowCpm(current, factor), windowCpm(prior, factor), { noiseFloor: 0.02 }),
    frequencyTrend: pctTrend(avg(current, "frequency"), avg(prior, "frequency"), { noiseFloor: 0.02 }),
  };
}

type KpiLocale = "EN" | "AR";

/** Strict EN/AR — any other or missing locale falls back to EN. */
function normalizeLocale(locale: Locale | string | undefined | null): KpiLocale {
  const s = locale == null ? "" : String(locale);
  return s === "AR" ? "AR" : "EN";
}

/** Localized KPI labels — keys match DashboardDTO.kpis[].key */
function kpiLabel(key: string, locale: Locale | undefined): string {
  const normalized = normalizeLocale(locale);
  const labels: Record<KpiLocale, Record<string, string>> = {
    EN: {
      spend: "Spend",
      messages: "Messages",
      ctr: "CTR",
      cpm: "CPM",
      frequency: "Frequency (daily avg)",
      reach: "Reach (latest day)",
    },
    AR: {
      spend: "الإنفاق",
      messages: "الرسائل",
      ctr: "تفاعل الإعلان",
      cpm: "تكلفة الوصول لألف شخص",
      frequency: "تكرار ظهور الإعلان",
      reach: "الأشخاص الذين شاهدوا إعلاناتك",
    },
  };
  return labels[normalized]?.[key] ?? labels.EN[key] ?? key;
}

// ════════════════════════════════════════════════════════════════════════
//  Stage instrumentation + timeout circuit breaker.
//
//  getDashboard is a pure DB reader; any indefinite hang is a stalled query
//  (pool exhaustion, row lock, runaway plan). Each major await is wrapped in
//  `timedStage`, which (a) logs the wall-clock duration of the stage and
//  (b) races it against STAGE_TIMEOUT_MS. If a stage overruns, it throws a
//  DashboardStageTimeoutError naming EXACTLY which stage stalled, so the HTTP
//  layer can return 504 instead of leaving the client spinning forever.
// ════════════════════════════════════════════════════════════════════════

/** Per-stage budget. Tunable via env; defaults to 9s (under typical 30s LB cap). */
const STAGE_TIMEOUT_MS = Number(process.env['DASHBOARD_STAGE_TIMEOUT_MS'] ?? 9000);

/** Thrown when a single getDashboard stage exceeds STAGE_TIMEOUT_MS. */
export class DashboardStageTimeoutError extends Error {
  constructor(
    public readonly stage: string,
    public readonly timeoutMs: number,
  ) {
    super(`getDashboard stage "${stage}" exceeded ${timeoutMs}ms`);
    this.name = 'DashboardStageTimeoutError';
  }
}

/**
 * Run an async stage with timing telemetry and a hard timeout. On overrun the
 * underlying query is NOT cancelled (Prisma has no cancel token) but the race
 * unblocks the request and surfaces the exact stall site. The dangling query
 * settles later harmlessly.
 */
/** Account creative-health summary from Meta's own ad-relevance grades.
 *  Bounded, single indexed query; enrichment only (null on any error, and the
 *  card hides when nothing needs attention). Never blocks the dashboard. */
export interface CreativeHealthSummary {
  gradedAds: number;
  needAttention: number;
  worst: { adName: string; titleAr: string; severity: string; code: string } | null;
}
async function buildCreativeHealth(
  prisma: PrismaClient,
  accountId: string,
): Promise<CreativeHealthSummary | null> {
  const ads = await prisma.ad.findMany({
    where: {
      rankingsSyncedAt: { not: null },
      status: EntityStatus.ACTIVE,
      adSet: { campaign: { adAccountId: accountId } },
    },
    select: {
      name: true,
      qualityRanking: true,
      engagementRanking: true,
      conversionRanking: true,
    },
    take: 300, // hard cap — a busy account never stalls this stage
  });
  if (ads.length === 0) return null;

  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
  let needAttention = 0;
  let worst: CreativeHealthSummary["worst"] = null;
  let worstRank = 99;
  for (const ad of ads) {
    const d = diagnoseRelevance({
      quality: (ad.qualityRanking ?? "unknown") as never,
      engagement: (ad.engagementRanking ?? "unknown") as never,
      conversion: (ad.conversionRanking ?? "unknown") as never,
    });
    if (d.severity === "high" || d.severity === "medium") needAttention++;
    const r = sevRank[d.severity] ?? 9;
    if (r < worstRank && (d.severity === "high" || d.severity === "medium")) {
      worstRank = r;
      worst = { adName: ad.name, titleAr: d.titleAr, severity: d.severity, code: d.code };
    }
  }
  return { gradedAds: ads.length, needAttention, worst };
}

async function timedStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DashboardStageTimeoutError(stage, STAGE_TIMEOUT_MS)),
      STAGE_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([work(), timeout]);
    console.log(`[dashboard:timing] ${stage} ${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    if (err instanceof DashboardStageTimeoutError) {
      console.error(`[dashboard:timeout] STALLED at "${stage}" after ${ms}ms (limit ${STAGE_TIMEOUT_MS}ms)`);
    } else {
      console.error(`[dashboard:error] stage "${stage}" failed after ${ms}ms:`, err);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ════════════════════════════════════════════════════════════════════════
export async function getDashboard(
  workspaceId: string,
  opts: { locale?: Locale; windowDays?: number; prisma?: PrismaClient } = {}
): Promise<DashboardDTO> {
  // Use the caller's prisma instance (e.g. from the HTTP server) when provided.
  // Fallback to the module-level standalone client for scripts and tests.
  const prisma = opts.prisma ?? getStandalonePrisma();
  const knowledge = new KnowledgeEngine(prisma);
  const recService = new RecommendationService(prisma);
  const windowDays = opts.windowDays ?? 30;

  // 1. Workspace + applied keys in parallel (independent).
  const [appliedItemKeys, ws] = await Promise.all([
    timedStage('appliedItemKeys', () => recService.getAppliedItemKeys(workspaceId)),
    timedStage('workspace+account', () =>
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: {
          industryProfile: true,
          adAccounts: true,
        },
      }),
    ),
  ]);
  const locale = opts.locale ?? Locale.EN;
  const account = ws.adAccounts[0]; // Phase 1: one account per workspace
  if (!account) return EMPTY_DASHBOARD_DTO;

  // Auto-heal stale IQD rows that still carry the schema default factor=100.
  if (currencyFactorNeedsHeal(account.currency, account.currencyMinorFactor)) {
    const healed = await timedStage('currencyHeal', () =>
      healAccountCurrencyAndSpend(prisma, account),
    );
    account.currencyMinorFactor = healed;
    console.log(
      `[currency-heal] dashboard ${account.id.slice(0, 8)}… ${account.currency} factor → ${healed}`,
    );
  }

  const curr = account.currency;
  const factor = resolveCurrencyMinorFactor(curr, account.currencyMinorFactor);
  const sinceDate = utcDateFloor(windowDays);
  const priorSinceDate = utcDateFloor(windowDays * 2);

  // 2. Independent account reads in parallel (biggest latency win).
  const [allDaily, healthRow, detected, latestTrend, rec] = await Promise.all([
    timedStage('accountDailyStats', () =>
      prisma.dailyStat.findMany({
        where: { entityType: EntityType.ACCOUNT, entityId: account.id, date: { gte: priorSinceDate } },
        orderBy: { date: "asc" },
      }),
    ),
    timedStage('accountHealthScore', () =>
      prisma.healthScore.findFirst({
        where: {
          entityType: EntityType.ACCOUNT,
          entityId: account.id,
          algorithmVersion: HEALTH_ALGORITHM_VERSION,
        },
        orderBy: { date: "desc" },
      }),
    ),
    timedStage('detectedIssues', () =>
      prisma.detectedIssue.findMany({
        where: { entityType: EntityType.ACCOUNT, entityId: account.id },
        orderBy: { severity: "desc" },
      }),
    ),
    timedStage('latestTrend', () =>
      prisma.metricTrend.findFirst({
        where: { entityType: EntityType.ACCOUNT, entityId: account.id },
        orderBy: { date: "desc" },
      }),
    ),
    timedStage('recommendation', () =>
      prisma.recommendation.findFirst({
        where: { entityType: EntityType.ACCOUNT, entityId: account.id },
        orderBy: [{ priority: "desc" }, { date: "desc" }],
      }),
    ),
  ]);

  const sinceMs = sinceDate.getTime();
  const daily = allDaily.filter((d) => d.date.getTime() >= sinceMs);
  const priorDaily = allDaily.filter((d) => d.date.getTime() < sinceMs);
  const score = healthRow?.score ?? null;

  // 4. KPI badge deltas — 30d window totals vs prior 30d (not metric_trends 7d).
  const windowTrends = computeWindowTrendDeltas(daily, priorDaily, factor);

  // 5. KPIs — current-window aggregates + aligned window-total deltas.
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

  const lifetimeMinor = Number(account.lifetimeSpendMinor ?? 0);
  const lifetimeSpend = {
    minor: lifetimeMinor,
    display: money(lifetimeMinor),
    syncedAt: account.lifetimeSyncedAt?.toISOString() ?? null,
  };

  const kpis: DashboardDTO["kpis"] = [
    { key: "spend", label: kpiLabel("spend", locale), value: totalSpendMinor, display: money(totalSpendMinor),
      deltaPct: windowTrends.spendTrend, direction: dir(windowTrends.spendTrend), goodWhenUp: false },
    { key: "messages", label: kpiLabel("messages", locale), value: totalMsgs, display: totalMsgs.toLocaleString(),
      deltaPct: windowTrends.resultsTrend, direction: dir(windowTrends.resultsTrend), goodWhenUp: true },
    { key: "ctr", label: kpiLabel("ctr", locale), value: ctrWindow ?? null,
      display: ctrWindow !== null ? `${ctrWindow.toFixed(2)}%` : "—",
      deltaPct: windowTrends.ctrTrend, direction: dir(windowTrends.ctrTrend), goodWhenUp: true },
    { key: "cpm", label: kpiLabel("cpm", locale), value: cpmWindow ?? null,
      display: cpmWindow !== null ? moneyMajor(cpmWindow) : "—",
      deltaPct: windowTrends.cpmTrend, direction: dir(windowTrends.cpmTrend), goodWhenUp: false },
    { key: "frequency", label: kpiLabel("frequency", locale), value: freqAvg ?? null,
      display: freqAvg !== null ? freqAvg.toFixed(2) : "—",
      deltaPct: windowTrends.frequencyTrend, direction: dir(windowTrends.frequencyTrend), goodWhenUp: false },
    { key: "reach", label: kpiLabel("reach", locale), value: totalReach, display: totalReach.toLocaleString(),
      deltaPct: null, direction: "flat", goodWhenUp: true },
  ];

  // 6. Trend series for charts — outcomes + efficiency, honest nulls for gaps.
  // CPM is stored in MINOR units (insightMapper). Charts expect MAJOR — always
  // recompute from spend÷impressions so cents never plot as dollars
  // (e.g. Meta CPM $3.21 stored as 321 → wrongly shown as $321).
  // CTR / frequency: null when the day had no delivery — never invent 0% / 0×.
  const trendSeries = {
    // UTC YYYY-MM-DD — matches client calendar mappers (no local TZ drift).
    dates: daily.map((d: any) => {
      const dt: Date = d.date instanceof Date ? d.date : new Date(d.date);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const day = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }),
    messages: daily.map((d: any) => Number(d.messages)),
    results: daily.map((d: any) =>
      Number(d.messages || 0) + Number(d.purchases || 0) + Number(d.leads || 0),
    ),
    spend: daily.map((d: any) => Number(d.spend)),
    ctr: daily.map((d: any) => {
      const imp = Number(d.impressions) || 0;
      if (imp <= 0) return null;
      if (d.ctr == null || !Number.isFinite(Number(d.ctr))) return null;
      return Number(d.ctr);
    }),
    frequency: daily.map((d: any) => {
      const imp = Number(d.impressions) || 0;
      if (imp <= 0) return null;
      if (d.frequency == null || !Number.isFinite(Number(d.frequency))) return null;
      return Number(d.frequency);
    }),
    cpm: daily.map((d: any) => {
      const imp = Number(d.impressions) || 0;
      if (imp <= 0) return null;
      const spendMajor = Number(d.spend) / factor;
      if (!Number.isFinite(spendMajor)) return null;
      return (spendMajor / imp) * 1000;
    }),
    costPerResult: daily.map((d: any) => {
      const results =
        Number(d.messages || 0) + Number(d.purchases || 0) + Number(d.leads || 0);
      if (results <= 0) return null;
      const spendMajor = Number(d.spend) / factor;
      return Number.isFinite(spendMajor) ? spendMajor / results : null;
    }),
  };

  // 7. Issues — join detected_issues → knowledge_rules (detected already loaded in parallel).
  const knowledgeMap = await timedStage('knowledgeLookup', () =>
    knowledge.lookupMany({
      issueCodes: (detected as any[]).map(d => d.issueCode as IssueCode),
      locale,
      industryProfileId: ws.industryProfileId,
    }),
  );

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

  // Meta Ads KB — query live KPI metrics FIRST; merge verbatim actions into issues.
  // Account-level dashboard has mixed objectives; keep shared delivery metrics
  // (ctr/cpm/frequency) and only include cost_per_message when messages exist.
  // Per-campaign objective filtering happens in campaign inspector / brain path.
  const kbMetrics: CampaignMetrics = {
    ctr: ctrWindow,
    cpm: cpmWindow,
    frequency: freqAvg,
    ...(totalMsgs > 0
      ? { cost_per_message: totalSpendMajor / totalMsgs }
      : {}),
  };
  const kbBreaches = evaluateCampaign(kbMetrics);
  const resolvedIndustry = resolveBenchmarkIndustryFromContext({ workspace: ws });
  const benchmarkInsights = evaluateBenchmarks(
    kbMetrics,
    toBenchmarkEvaluationOptions(resolvedIndustry),
  );
  const kbActionTexts = formatActionsForDisplay(findActionsForBreaches(kbBreaches));

  const METRIC_ISSUE_CODE: Record<string, IssueCode> = {
    ctr: IssueCode.LOW_CTR,
    frequency: IssueCode.HIGH_FREQUENCY,
    cpm: IssueCode.HIGH_CPM,
    cost_per_message: IssueCode.RISING_COST_PER_RESULT,
  };

  for (const breach of kbBreaches) {
    const code = METRIC_ISSUE_CODE[breach.metricKey] ?? IssueCode.LOW_CTR;
    if (appliedItemKeys.has(`issue:${code}`)) continue;
    // Prefer Arabic merchant copy — never push raw English KB strings to UI/AI.
    const texts = [
      issueActionAr(code),
      ...formatActionsForDisplay(breach.recommended_optimization_actions)
        .map(simplifyMerchantText)
        .filter(Boolean),
    ].filter((t, i, arr) => t && arr.indexOf(t) === i);
    const existing = issues.find(i => i.code === code);
    if (existing) {
      existing.recommendations = [...texts, ...existing.recommendations];
      existing.evidence = {
        ...existing.evidence,
        knowledgeBase: breach,
      };
    } else {
      issues.push({
        code,
        title: issueTitleAr(code),
        severity: breach.severity === "critical" ? "CRITICAL" : "HIGH",
        causes: [issueWhyAr(code)],
        recommendations: texts.length ? texts : [issueActionAr(code)],
        evidence: { source: "meta_ads_knowledge_base", knowledgeBase: breach },
      });
    }
  }

  // Benchmark-only insights: emit additional contextual guidance even when
  // no hard KB threshold is breached, so the dashboard explains relative gaps.
  for (const insight of benchmarkInsights) {
    if (insight.comparison === "within") continue;
    const code = METRIC_ISSUE_CODE[insight.metricKey] ?? IssueCode.LOW_CTR;
    const existing = issues.find(i => i.code === code);
    const recText =
      simplifyMerchantText(insight.inference) || issueActionAr(code);
    if (!recText) continue;
    if (existing) {
      if (!existing.recommendations.includes(recText)) {
        existing.recommendations = [...existing.recommendations, recText];
      }
      existing.evidence = {
        ...existing.evidence,
        benchmarkInsight: insight,
      };
    } else {
      issues.push({
        code,
        title: issueTitleAr(code),
        severity: "HIGH",
        causes: [issueWhyAr(code)],
        recommendations: [recText],
        evidence: { source: "industry_benchmark_intelligence", benchmarkInsight: insight },
      });
    }
  }

  // 7b. Diagnoses — re-derive from stored issues + latest trends (trend already loaded).
  const issueRecords: IssueRecord[] = (detected as any[]).map(d => ({
    issueCode: d.issueCode,
    severity: d.severity,
    evidence: (d.evidenceJson as Record<string, unknown>) ?? {},
  }));
  // Align currentResults with RulesEngine.buildSignals (sum of conversions),
  // not messages — so diagnose() evidence matches what detectors persisted.
  const totalConversions = sum(daily, "conversions");
  const signals: Signals = {
    ctrTrend: (latestTrend as any)?.ctrTrend ?? null,
    cpmTrend: (latestTrend as any)?.cpmTrend ?? null,
    frequencyTrend: (latestTrend as any)?.frequencyTrend ?? null,
    resultsTrend: (latestTrend as any)?.resultsTrend ?? null,
    spendTrend: (latestTrend as any)?.spendTrend ?? null,
    currentCtr: ctrWindow,
    currentCpm: cpmWindow,
    currentFrequency: freqAvg,
    currentResults: totalConversions,
    currentSpend: totalSpendMinor,
  };
  const diagnoses = diagnose(issueRecords, signals);

  // 7c. Attribution — decompose results change into impressions × CTR × CVR.
  // Use the same results volume as trendSeries (messages + purchases + leads).
  const priorImpr = sum(priorDaily, "impressions");
  const priorClicks = sum(priorDaily, "clicks");
  const currentResultsVol =
    sum(daily, "messages") + sum(daily, "purchases") + sum(daily, "leads");
  const priorResultsVol =
    sum(priorDaily, "messages") + sum(priorDaily, "purchases") + sum(priorDaily, "leads");
  const resultAttribution = attributeChange(
    { impressions: totalImpr, clicks: totalClicks, results: currentResultsVol },
    { impressions: priorImpr, clicks: priorClicks, results: priorResultsVol },
  );

  // 8. Priority action — recommendation already loaded in parallel.
  // Sanitize every issue at the product boundary — UI and AI never see codes/jargon.
  const merchantIssues = issues.map(sanitizeIssueForMerchant);

  // The recommendation's action text comes from the top issue's localized recs.
  // Sort by severity so "top" is actually urgent, not insertion order.
  const severityRank = (s: string) =>
    s === "CRITICAL" ? 0 : s === "HIGH" ? 1 : s === "MEDIUM" ? 2 : 3;
  const activeIssues = merchantIssues
    .filter((i) => !appliedItemKeys.has(`issue:${i.code}`))
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const topIssue = activeIssues[0];
  let priorityAction = rec
    ? {
        actionCode: rec.actionCode,
        priority: rec.priority,
        text: sanitizePriorityActionText(
          rec.actionCode,
          topIssue?.recommendations?.[0] ?? null,
        ),
        details: (rec.detailsJson as Record<string, unknown>) ?? null,
      }
    : null;

  if (priorityAction && appliedItemKeys.has(`priority:${priorityAction.actionCode}`)) {
    priorityAction = null;
  }

  // KB-first priority text when thresholds breached — always Arabic merchant copy.
  if (kbActionTexts.length > 0) {
    const kbActions = findActionsForBreaches(kbBreaches);
    const kbTop = kbBreaches[0]!;
    const kbIssueCode = METRIC_ISSUE_CODE[kbTop.metricKey] ?? IssueCode.LOW_CTR;
    const kbActionId = kbActions[0]!.id;
    const kbApplied =
      appliedItemKeys.has(`issue:${kbIssueCode}`) ||
      appliedItemKeys.has(`priority:${kbActionId}`);
    if (!kbApplied) {
      const kbText = sanitizePriorityActionText(
        kbActionId,
        simplifyMerchantText(kbActionTexts[0]!) || issueActionAr(kbIssueCode),
      );
      if (priorityAction) {
        priorityAction = {
          ...priorityAction,
          text: kbText,
          details: {
            ...(priorityAction.details ?? {}),
            recommended_optimization_actions: kbActions,
            metricBreaches: kbBreaches,
          },
        };
      } else {
        priorityAction = {
          actionCode: kbActionId,
          priority: kbTop.severity === "critical" ? "CRITICAL" : "HIGH",
          text: kbText,
          details: {
            source: "meta_ads_knowledge_base",
            recommended_optimization_actions: kbActions,
            metricBreaches: kbBreaches,
          },
        };
      }
    }
  }

  const filteredIssues = merchantIssues.filter(
    (i) => !appliedItemKeys.has(`issue:${i.code}`),
  );

  // Merchant task cards — prefer evidence-rich diagnoses (product thesis),
  // then fall back to sanitized issues / priority action.
  const diagnosisTasks: AdviceTask[] = diagnoses
    .filter((d) => {
      const issueKey = d.contributingIssues?.[0];
      return !issueKey || !appliedItemKeys.has(`issue:${issueKey}`);
    })
    .map((d, idx) =>
      buildAdviceTaskFromDiagnosis({
        name: d.name,
        code: d.code,
        confidence: d.confidence,
        narrative: d.narrative,
        action: d.action,
        contributingIssues: d.contributingIssues,
        actionCode: idx === 0 ? priorityAction?.actionCode ?? null : null,
      }),
    );

  const issueTasks: AdviceTask[] = filteredIssues
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((iss, idx) =>
      buildAdviceTask({
        code: iss.code,
        title: iss.title,
        severity: iss.severity,
        causes: iss.causes,
        recommendations: iss.recommendations,
        actionCode:
          diagnosisTasks.length === 0 && idx === 0
            ? priorityAction?.actionCode ?? null
            : null,
        priorityText:
          diagnosisTasks.length === 0 && idx === 0
            ? priorityAction?.text ?? null
            : null,
        itemKey: `issue:${iss.code}`,
      }),
    );

  // Prefer diagnoses; append issue tasks that aren't already covered.
  const coveredIssueCodes = new Set(
    diagnosisTasks.map((t) => t.issueCode).filter(Boolean) as string[],
  );
  const merchantTasks: AdviceTask[] = [
    ...diagnosisTasks,
    ...issueTasks.filter((t) => !t.issueCode || !coveredIssueCodes.has(t.issueCode)),
  ];

  // If we only have a priority action (no issues/diagnoses), still surface one task.
  if (!merchantTasks.length && priorityAction) {
    merchantTasks.push(
      buildAdviceTask({
        code: null,
        title: priorityAction.text,
        severity: priorityAction.priority,
        actionCode: priorityAction.actionCode,
        priorityText: priorityAction.text,
        itemKey: `priority:${priorityAction.actionCode}`,
      }),
    );
  }

  // 9–10. Campaign cards + brain section + AI features in parallel.
  const [cards, brain, predictions, aiRecommendations, weeklyReport, creativeHealth] = await Promise.all([
    timedStage('campaignCards', () =>
      buildCampaignCards(account.id, prisma, sinceDate, factor),
    ),
    timedStage('brainSection', () =>
      buildBrainSection(
        prisma,
        ws.id,
        account.id,
        account.currency,
        account.currencyMinorFactor,
        appliedItemKeys,
      ),
    ),
    timedStage('predictions', () =>
      computePredictions(prisma, ws.id, account.id, curr, factor).catch((err) => {
        console.warn('[dashboard] predictions failed:', err);
        return null;
      }),
    ),
    timedStage('aiRecommendations', () =>
      computeAIRecommendations(prisma, ws.id).catch((err) => {
        console.warn('[dashboard] aiRecommendations failed:', err);
        return null;
      }),
    ),
    timedStage('weeklyReport', () =>
      generateWeeklyReport(prisma, ws.id).catch((err) => {
        console.warn('[dashboard] weeklyReport failed:', err);
        return null;
      }),
    ),
    timedStage('creativeHealth', () =>
      buildCreativeHealth(prisma, account.id).catch((err) => {
        console.warn('[dashboard] creativeHealth failed:', err);
        return null;
      }),
    ),
  ]);

  const campaignCounts = await timedStage('campaignCounts', () =>
    getCampaignCounts(prisma, account.id, account.timezone, cards.all.length),
  );
  const activeCampaigns = campaignCounts.deliveringInWindow;

  const hasActionItems =
    filteredIssues.length > 0 ||
    priorityAction != null ||
    (brain?.cmoFeedV2 ?? []).some((it) => it.generatedAt);

  const roasAvg = avg(daily, "roas");
  const steadyState = !hasActionItems
    ? buildSteadyStateSummary({
        locale,
        currency: curr,
        factor,
        ctr: ctrWindow,
        cpm: cpmWindow,
        costPerMessage:
          totalMsgs > 0
            ? (factor === 1 ? totalSpendMinor : totalSpendMinor / factor) / totalMsgs
            : null,
        roas: roasAvg,
        healthScore: score,
        healthBand: band(score),
        activeCampaigns,
        campaignCounts,
        stableCampaigns: cards.stable,
        brain,
        money,
        moneyMajor,
      })
    : undefined;

  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      industry: ws.industryProfile?.name ?? null,
      locale,
      currency: curr,
      currencyMinorFactor: factor,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      activeCampaigns,
      campaignCounts,
    },
    health: { score, band: band(score) },
    creativeHealth,
    kpis,
    trendSeries,
    issues: filteredIssues,
    merchantTasks,
    diagnoses,
    attribution: resultAttribution,
    priorityAction,
    bestCampaign: cards.best,
    worstCampaign: cards.worst,
    campaigns: cards.all,
    lifetimeSpend,
    ...(brain && { brain }),
    ...(steadyState && { steadyState }),
    ...(predictions && { predictions }),
    ...(aiRecommendations && { aiRecommendations }),
    ...(weeklyReport && { weeklyReport }),
  };
}

// ── Steady-state enrichment (no pending actions) ─────────────────────────

const CTR_GOOD_BENCHMARK = 1.5;
const ROAS_GOOD_BENCHMARK = 2.0;
const CPA_GOOD_BENCHMARK = 5.0;

function buildSteadyStateSummary(input: {
  locale: Locale;
  currency: string;
  factor: number;
  ctr: number | null;
  cpm: number | null;
  costPerMessage: number | null;
  roas: number | null;
  healthScore: number | null;
  healthBand: ReturnType<typeof band>;
  activeCampaigns: number;
  campaignCounts?: CampaignCounts;
  stableCampaigns: CampaignCard[];
  brain: BrainSection | null | undefined;
  money: (minor: number) => string;
  moneyMajor: (major: number) => string;
}): SteadyStateSummary {
  const loc = normalizeLocale(input.locale);
  const t = (en: string, ar: string) => (loc === "AR" ? ar : en);

  const stableCampaigns: SteadyStateCampaign[] = input.stableCampaigns.slice(0, 6).map((c) => ({
    id: c.id,
    name: c.name,
    health: c.health,
    band: c.band,
    ctr: c.ctr,
    ctrDisplay: c.ctr != null ? `${c.ctr.toFixed(2)}%` : "—",
    cpm: c.cpm,
    cpmDisplay: c.cpm != null ? input.moneyMajor(c.cpm) : "—",
    messages: c.messages,
  }));

  const benchmarks: SteadyStateBenchmark[] = [];

  if (input.ctr != null) {
    const positive = input.ctr >= CTR_GOOD_BENCHMARK;
    benchmarks.push({
      key: "ctr",
      label: kpiLabel("ctr", input.locale),
      valueDisplay: `${input.ctr.toFixed(2)}%`,
      benchmarkLabel: t("Industry good: 1.5%+", "المعيار الجيد: ١.٥٪+"),
      verdict: positive
        ? t(`Above benchmark (${CTR_GOOD_BENCHMARK}%+)`, `فوق المعيار (${CTR_GOOD_BENCHMARK}٪+)`)
        : t(`Below benchmark (${CTR_GOOD_BENCHMARK}%)`, `تحت المعيار (${CTR_GOOD_BENCHMARK}٪)`),
      positive,
    });
  }

  if (input.costPerMessage != null && Number.isFinite(input.costPerMessage)) {
    const positive = input.costPerMessage <= CPA_GOOD_BENCHMARK;
    benchmarks.push({
      key: "cpa",
      label: t("Cost per result", "تكلفة النتيجة"),
      valueDisplay: input.moneyMajor(input.costPerMessage),
      benchmarkLabel: t(`Healthy: ≤ ${CPA_GOOD_BENCHMARK}`, `الصحي: ≤ ${CPA_GOOD_BENCHMARK}`),
      verdict: positive
        ? t("Within healthy CPA range", "ضمن نطاق CPA الصحي")
        : t("Above CPA target — monitor", "فوق هدف CPA — راقب"),
      positive,
    });
  }

  if (input.roas != null && Number.isFinite(input.roas)) {
    const positive = input.roas >= ROAS_GOOD_BENCHMARK;
    benchmarks.push({
      key: "roas",
      label: "ROAS",
      valueDisplay: `${input.roas.toFixed(2)}x`,
      benchmarkLabel: t(`Ecommerce typical: ${ROAS_GOOD_BENCHMARK}x+`, `التجارة: ${ROAS_GOOD_BENCHMARK}x+`),
      verdict: positive
        ? t("At or above ROAS target", "عند أو فوق هدف ROAS")
        : t("Below ROAS target — watch spend", "تحت هدف ROAS — راقب الإنفاق"),
      positive,
    });
  }

  if (input.cpm != null) {
    const positive = input.cpm <= 8.0;
    benchmarks.push({
      key: "cpm",
      label: kpiLabel("cpm", input.locale),
      valueDisplay: input.moneyMajor(input.cpm),
      benchmarkLabel: t("Typical: ≤ 8", "النموذجي: ≤ 8"),
      verdict: positive
        ? t("CPM within normal range", "CPM ضمن النطاق الطبيعي")
        : t("CPM elevated — auction pressure", "CPM مرتفع — ضغط مزاد"),
      positive,
    });
  }

  const pulse = input.brain?.livePulse;
  const counts = input.campaignCounts;
  const pulseParts: string[] = [];
  if (counts && counts.total > 0) {
    pulseParts.push(
      t(
        `Monitoring ${counts.total} campaigns (${counts.deliveringInWindow} delivering, ${counts.spendingToday} spending today, ${counts.dormantActive} dormant Meta-active)`,
        `مراقبة ${counts.total} حملة (${counts.deliveringInWindow} تعمل · ${counts.spendingToday} تنفق اليوم · ${counts.dormantActive} نشطة بدون إنفاق)`,
      ),
    );
  } else if (pulse?.campaignsObserved) {
    pulseParts.push(
      t(
        `Spend pace tracked on ${pulse.campaignsObserved} campaign${pulse.campaignsObserved === 1 ? "" : "s"}`,
        `وتيرة الإنفاق على ${pulse.campaignsObserved} حملة`,
      ),
    );
  }
  if (pulse?.intraDaySpendPct != null) {
    pulseParts.push(
      t(
        `today's spend at ${pulse.intraDaySpendPct.toFixed(1)}% of daily budget`,
        `إنفاق اليوم ${pulse.intraDaySpendPct.toFixed(1)}٪ من الميزانية`,
      ),
    );
  }
  if (pulse?.dnaMatchPct != null) {
    pulseParts.push(
      t(
        `creative DNA match ${pulse.dnaMatchPct.toFixed(1)}% vs top performers`,
        `تطابق DNA الإبداعي ${pulse.dnaMatchPct.toFixed(1)}٪ مع الأفضل`,
      ),
    );
  }

  const backgroundSummary =
    pulseParts.length > 0
      ? pulseParts.join(" · ")
      : t(
          `AI is watching ${input.activeCampaigns} delivering campaign${input.activeCampaigns === 1 ? "" : "s"} — health score ${input.healthScore} (${input.healthBand}).`,
          `الذكاء الاصطناعي يراقب ${input.activeCampaigns} حملة تعمل — نقاط الصحة ${input.healthScore} (${input.healthBand}).`,
        );

  const stableCount = stableCampaigns.length || input.campaignCounts?.deliveringInWindow || input.activeCampaigns;
  const namesPreview = stableCampaigns
    .slice(0, 3)
    .map((c) => c.name)
    .join(loc === "AR" ? "، " : ", ");

  const mainMoveTitle =
    stableCount > 0
      ? t(
          `${stableCount} campaign${stableCount === 1 ? "" : "s"} running stable`,
          `${stableCount} حملة تعمل باستقرار`,
        )
      : t("Account is steady — ads running normally", "الحساب مستقر — الإعلانات تعمل بشكل طبيعي");

  const metricLines = benchmarks
    .slice(0, 3)
    .map((b) => `${b.label}: ${b.valueDisplay} (${b.verdict})`)
    .join(loc === "AR" ? " · " : " · ");

  const mainMoveNarrative = [
    namesPreview
      ? t(`Active: ${namesPreview}`, `النشطة: ${namesPreview}`)
      : null,
    metricLines || null,
    backgroundSummary,
  ]
    .filter(Boolean)
    .join(loc === "AR" ? " — " : " — ");

  const insights: SteadyStateInsight[] = [];

  if (stableCampaigns.length > 0) {
    const top = stableCampaigns[0]!;
    insights.push({
      title: t("Top stable performer", "أفضل حملة مستقرة"),
      body: t(
        `${top.name} — health ${top.health}, CTR ${top.ctrDisplay}, ${top.messages} results this period.`,
        `${top.name} — صحة ${top.health}، تفاعل ${top.ctrDisplay}، ${top.messages} نتيجة هذه الفترة.`,
      ),
    });
  }

  benchmarks.slice(0, 2).forEach((b) => {
    insights.push({
      title: b.label,
      body: `${b.valueDisplay} · ${b.benchmarkLabel} · ${b.verdict}`,
    });
  });

  if (pulse) {
    insights.push({
      title: t("Background monitoring", "المراقبة في الخلفية"),
      body: backgroundSummary,
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: t("All clear", "كل شيء مستقر"),
      body: t(
        "No critical actions needed. Your account metrics are within normal ranges.",
        "لا توجد إجراءات حرجة. مؤشرات حسابك ضمن النطاقات الطبيعية.",
      ),
    });
  }

  return {
    stableCampaigns,
    benchmarks,
    backgroundSummary,
    mainMoveTitle,
    mainMoveNarrative,
    insights,
  };
}

// ── Campaign cards: 30d window aggregates + latest health score. ──
async function buildCampaignCards(
  adAccountId: string,
  prisma: PrismaClient,
  sinceDate: Date,
  factor: number,
): Promise<{ best: CampaignCard | null; worst: CampaignCard | null; stable: CampaignCard[]; all: CampaignCard[] }> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: "ACTIVE" },
  });
  if (!campaigns.length) return { best: null, worst: null, stable: [], all: [] };

  const campaignIds = campaigns.map((c) => c.id);

  // Bulk fetch: all daily stats in the dashboard window per campaign
  const windowSnaps = await prisma.dailyStat.findMany({
    where: {
      entityType: EntityType.CAMPAIGN,
      entityId: { in: campaignIds },
      date: { gte: sinceDate },
    },
    orderBy: { date: "asc" },
  });
  const snapsByCampaign = new Map<string, typeof windowSnaps>();
  for (const s of windowSnaps) {
    const rows = snapsByCampaign.get(s.entityId) ?? [];
    rows.push(s);
    snapsByCampaign.set(s.entityId, rows);
  }

  // Bulk fetch: latest health score per campaign (one row each — avoid full history).
  // DISTINCT ON is Postgres-specific; matches our production DB.
  const latestHealthRows = await prisma.$queryRaw<
    Array<{ entity_id: string; score: number }>
  >`
    SELECT DISTINCT ON (entity_id)
      entity_id, score
    FROM health_scores
    WHERE entity_type = 'CAMPAIGN'::"EntityType"
      AND entity_id = ANY(${campaignIds})
      AND algorithm_version = ${HEALTH_ALGORITHM_VERSION}
    ORDER BY entity_id, date DESC
  `;
  const healthMap = new Map<string, { score: number }>();
  for (const h of latestHealthRows) {
    healthMap.set(h.entity_id, { score: h.score });
  }

  const cards: CampaignCard[] = [];
  for (const c of campaigns) {
    const rows = snapsByCampaign.get(c.id);
    const h = healthMap.get(c.id);
    if (!rows?.length || !h) continue;
    cards.push({
      id: c.id,
      metaId: c.externalCampaignId,
      name: c.name,
      health: h.score,
      band: band(h.score),
      messages: sum(rows, "messages"),
      ctr: windowCtr(rows),
      cpm: windowCpm(rows, factor),
      frequency: avg(rows, "frequency"),
    });
  }

  if (!cards.length) return { best: null, worst: null, stable: [], all: [] };

  const sorted = [...cards].sort((a, b) => b.health - a.health);
  const stable = sorted.filter((c) => c.health >= 70);

  return {
    best: sorted[0],
    worst: sorted[sorted.length - 1],
    stable,
    all: sorted,
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

const CMO_FEED_PREVIEW_CHARS = 150 as const;
const CMO_FEED_CREATIVE_DIRECTIVE_MAX = 200;

/** Collapse internal whitespace to a single space; trim edges. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Preview truncation: word-break when feasible, ellipsis U+2026 when over max. */
function truncatePreview(text: string, max: number): string {
  const cleaned = normalizeWhitespace(text);
  if (cleaned.length <= max) return cleaned;
  const cutLen = max - 1;
  const slice = cleaned.slice(0, cutLen);
  const searchStart = Math.floor(max * 0.6);
  let breakAt = -1;
  for (let i = cutLen - 1; i >= searchStart; i--) {
    if (slice[i] === ' ') {
      breakAt = i;
      break;
    }
  }
  const base = breakAt >= 0 ? slice.slice(0, breakAt) : slice;
  return `${base}\u2026`;
}

function severityWeight(priority: string): number {
  if (priority === 'CRITICAL') return 2;
  if (priority === 'HIGH') return 1;
  return 0;
}

function toCmoFeedSeverity(priority: string): CmoFeedSeverity {
  if (priority === 'CRITICAL' || priority === 'HIGH' || priority === 'NORMAL') {
    return priority;
  }
  return 'NORMAL';
}

function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface BrainSnapshotRow {
  id: string;
  campaignId: string;
  externalCampaignId: string;
  tickDate: Date;
  action: string;
  priority: string;
  narrationJson: unknown;
  narrationGeneratedAt: Date | null;
  /** Brain tick payload — used to upgrade generic / sentinel narrations on read. */
  payload?: unknown;
}

interface CmoFeedCandidate {
  item: CmoFeedItemDTO;
  severityW: number;
  truncated: boolean;
}

function pickFeedWinner(a: CmoFeedCandidate, b: CmoFeedCandidate): CmoFeedCandidate {
  if (a.severityW !== b.severityW) return a.severityW > b.severityW ? a : b;
  const aGen = a.item.generatedAt;
  const bGen = b.item.generatedAt;
  if (aGen !== bGen) {
    if (aGen === null) return b;
    if (bGen === null) return a;
    return aGen > bGen ? a : b;
  }
  return a.item.id <= b.item.id ? a : b;
}

function sortFeedCandidates(candidates: CmoFeedCandidate[]): CmoFeedCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.severityW !== b.severityW) return b.severityW - a.severityW;
    const aGen = a.item.generatedAt;
    const bGen = b.item.generatedAt;
    if (aGen !== bGen) {
      if (aGen === null) return 1;
      if (bGen === null) return -1;
      return bGen.localeCompare(aGen);
    }
    return a.item.id.localeCompare(b.item.id);
  });
}

function mapSnapshotToFeedCandidate(
  s: BrainSnapshotRow,
  nameById: Map<string, string>,
): CmoFeedCandidate {
  const campaignName = nameById.get(s.campaignId) ?? s.externalCampaignId;
  let narration = readNarration(s.narrationJson);

  // Cognitive gate (read path): replace legacy generic / identical templates
  // with action-aware deterministic Arabic grounded in the brain payload.
  if (
    narration &&
    isGenericInsightNarration(narration.arabicTitle, narration.arabicNarration)
  ) {
    const upgraded = upgradeGenericNarration(
      narration,
      s.payload,
      campaignName,
      s.action,
    );
    narration = upgraded.narration;
  } else if (!narration) {
    narration = buildDeterministicNarration(s.payload ?? {}, {
      campaignName,
      action: s.action,
    });
  }

  const date = formatUtcDate(s.tickDate);
  const insightType = s.action;
  const dedupeKey = `${s.campaignId}:${insightType}:${date}`;

  const rawTitle = narration.arabicTitle || campaignName;
  const rawBody = normalizeWhitespace(narration.arabicNarration ?? '');
  const title = truncatePreview(rawTitle, CMO_FEED_PREVIEW_CHARS);
  const body = truncatePreview(rawBody, CMO_FEED_PREVIEW_CHARS);

  const item: CmoFeedItemDTO = {
    id: s.id,
    campaignId: s.campaignId,
    campaignName,
    insightType,
    date,
    title,
    body,
    severity: toCmoFeedSeverity(s.priority),
    dedupeKey,
    generatedAt: s.narrationGeneratedAt?.toISOString() ?? null,
  };

  if (rawBody.length > CMO_FEED_PREVIEW_CHARS) {
    item.bodyFull = rawBody;
  }
  if (narration.creativeDirective) {
    item.creativeDirective = truncatePreview(
      narration.creativeDirective,
      CMO_FEED_CREATIVE_DIRECTIVE_MAX,
    );
  }

  const truncated =
    normalizeWhitespace(rawTitle).length > CMO_FEED_PREVIEW_CHARS ||
    rawBody.length > CMO_FEED_PREVIEW_CHARS;

  return { item, severityW: severityWeight(s.priority), truncated };
}

function buildCmoFeedV2(
  snapshots: BrainSnapshotRow[],
  tickToday: Date,
  nameById: Map<string, string>,
): { items: CmoFeedItemDTO[]; meta: CmoFeedMeta } {
  let feedSnapshots = snapshots.filter(s => s.tickDate.getTime() === tickToday.getTime());
  let window: 'today' | 'rolling' = 'today';

  if (feedSnapshots.length === 0) {
    const maxTick = snapshots.reduce(
      (max, s) => Math.max(max, s.tickDate.getTime()),
      0,
    );
    feedSnapshots = snapshots.filter(s => s.tickDate.getTime() === maxTick);
    window = 'rolling';
  }

  const candidates = feedSnapshots.map(s => mapSnapshotToFeedCandidate(s, nameById));

  const byDedupeKey = new Map<string, CmoFeedCandidate>();
  for (const c of candidates) {
    const existing = byDedupeKey.get(c.item.dedupeKey);
    byDedupeKey.set(c.item.dedupeKey, existing ? pickFeedWinner(existing, c) : c);
  }

  const byCampaign = new Map<string, CmoFeedCandidate>();
  for (const c of byDedupeKey.values()) {
    const existing = byCampaign.get(c.item.campaignId);
    byCampaign.set(c.item.campaignId, existing ? pickFeedWinner(existing, c) : c);
  }

  const deduped = Array.from(byCampaign.values());
  // Prefer severity order, then let the quality gate drop generics / body twins
  // and cap learning-phase noise so merchants only see useful cards.
  const ranked = sortFeedCandidates(deduped).map(c => c.item);
  const selected = selectUsefulFeedItems(ranked, BRAIN_SECTION_CONFIG.CMO_FEED_LIMIT);
  const selectedIds = new Set(selected.map(i => i.id));
  const limited = sortFeedCandidates(deduped.filter(c => selectedIds.has(c.item.id)));

  return {
    items: selected,
    meta: {
      total: deduped.length,
      window,
      maxPreviewChars: CMO_FEED_PREVIEW_CHARS,
      truncated: limited.some(c => c.truncated),
    },
  };
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
  _currencyMinorFactor: number,
  appliedItemKeys: Set<string> = new Set(),
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

  const { items: cmoFeedV2Raw, meta: cmoFeedMeta } = buildCmoFeedV2(snapshots, tickToday, nameById);
  const cmoFeedV2 = cmoFeedV2Raw.filter(
    (item) => !appliedItemKeys.has(`feed:${item.dedupeKey}`),
  );
  const cmoFeedMetaAdjusted: CmoFeedMeta = {
    ...cmoFeedMeta,
    total: cmoFeedV2.length,
  };

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

  return { cmoFeedV2, cmoFeedMeta: cmoFeedMetaAdjusted, livePulse, ledger };

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
  const prisma = opts.prisma ?? getStandalonePrisma();

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
