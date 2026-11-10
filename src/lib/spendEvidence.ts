// ════════════════════════════════════════════════════════════════════════
//  src/lib/spendEvidence.ts — which IQD spend can be trusted, per PERIOD, and
//  which recommendations may be built on it. READ-ONLY: nothing here writes.
//
//  WHY. IQD spend is stored in minor units with a canonical factor of 1, but
//  an account that once carried the schema default (100) may hold rows that
//  are exactly ×100. The only evidence is raw Meta spend in raw_insights
//  (ACCOUNT-level rows only, several per day, pruned after
//  RAW_INSIGHTS_RETAIN_DAYS). The stored factor is NOT evidence: after the
//  repair flips it to 1, every row it did not PROVE is as unproven as before.
//  delivery/core/SPEND_EVIDENCE_GATING.md has the full model and its limits.
//
//  WHAT. Three things, all driven by the rows and never by the factor:
//
//   1. PERIODS. Contiguous runs of ACCOUNT rows that are neither VERIFIED by a
//      raw counterpart nor proven OVERSCALED — listed for ALL history, not a
//      rolling window, so time moving forward never clears them.
//   2. A WINDOW VERDICT for any (account, level, date range): clean, or why not.
//      ACCOUNT level judges the account rows. CAMPAIGN level is stricter: a
//      campaign day is verified only if the account row of that day is verified
//      AND that day's campaign spends add up to it (production stores raws for
//      ACCOUNT rows only, so a campaign row can never be proven directly).
//   3. A CLASSIFICATION of what depends on spend (issue codes, action codes,
//      knowledge-base metrics) so every producer and reader of recommendations
//      applies the same policy: withhold the spend-dependent ones when the
//      window they were computed from is not clean; leave the rest alone.
//
//  The per-day rule is shared with the repair (src/lib/spendScaleRule.ts).
//  This module is Prisma-type-only and I/O only through `$queryRaw`.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { judgeDayAgainstRaws, parseMetaSpend } from './spendScaleRule';

type Db = Pick<PrismaClient, '$queryRaw'>;
type EntityDb = Db & Pick<PrismaClient, 'adAccount' | 'campaign'>;

// ── vocabulary ──────────────────────────────────────────────────────────

export const SPEND_SCALE_UNVERIFIED = 'SPEND_SCALE_UNVERIFIED' as const;
export const SPEND_SCALE_OVERSCALED = 'SPEND_SCALE_OVERSCALED' as const;
export type SpendGateReason = typeof SPEND_SCALE_UNVERIFIED | typeof SPEND_SCALE_OVERSCALED;

/** At most this many periods are returned per list, newest first. The totals are always exact. */
export const SPEND_PERIODS_CAP = 24;

/**
 * A campaign day reconciles with its account row when the campaign spends add up
 * to the account spend within this share (the OK band of the existing
 * ACCOUNT_CAMPAIGN_DIVERGENCE check is also 2 %) …
 */
export const CAMPAIGN_RECONCILE_TOLERANCE = 0.02;
/** … or within (campaign rows + 1) minor units, which is what per-row integer rounding can add up to. */
export const CAMPAIGN_RECONCILE_SLACK_PER_ROW = 1;

export type DayStatus = 'VERIFIED' | 'OVERSCALED' | 'UNVERIFIED';
export type EvidenceLevel = 'ACCOUNT' | 'CAMPAIGN';

export interface SpendPeriod {
  /** First day of the run (YYYY-MM-DD). */
  from: string;
  /** Last day of the run (YYYY-MM-DD). */
  to: string;
  /** Number of ACCOUNT-level rows in the run (days without a row do not break a run). */
  rows: number;
}

export interface DayEvidence {
  day: string;
  /** null = the account has no daily_stats row for that day. */
  account: DayStatus | null;
  accountSpend: number | null;
  /** Σ spend of the account's campaign rows of that day, and how many rows. */
  campaignSpend: number;
  campaignRows: number;
}

export interface SpendWindowEvidence {
  /** false for any account that is not IQD: nothing to verify, nothing is ever withheld. */
  applies: boolean;
  level: EvidenceLevel;
  from: string | null;
  to: string | null;
  /** Rows judged at this level inside the window. */
  rows: number;
  verified: number;
  overscaled: number;
  unverified: number;
  clean: boolean;
  /** Why it is not clean (over-scale outranks unverified). */
  reason: SpendGateReason | null;
  /** Unverified runs inside the window, newest first, capped at SPEND_PERIODS_CAP. */
  periods: SpendPeriod[];
}

// ── dates ───────────────────────────────────────────────────────────────

export const isoDay = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
export const addDaysIso = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function isIqd(currency: string | null | undefined): boolean {
  return (currency ?? '').trim().toUpperCase() === 'IQD';
}

// ── pure: periods and windows ───────────────────────────────────────────

/**
 * Pure. Runs of consecutive ROWS (ascending by day) that carry `status`. A row of
 * any other status ends a run; a calendar day with no row does not (there is no
 * spend on it that could be wrong). Newest run first. `total*` are exact even
 * when the list is capped.
 */
export function buildPeriods(
  rows: Array<{ day: string; status: DayStatus }>,
  status: Exclude<DayStatus, 'VERIFIED'>,
  cap: number = SPEND_PERIODS_CAP,
): { periods: SpendPeriod[]; totalPeriods: number; totalRows: number; truncated: boolean } {
  const all: SpendPeriod[] = [];
  let cur: SpendPeriod | null = null;
  let totalRows = 0;
  for (const r of rows) {
    if (r.status === status) {
      totalRows++;
      if (cur) { cur.to = r.day; cur.rows++; } else { cur = { from: r.day, to: r.day, rows: 1 }; all.push(cur); }
    } else {
      cur = null;
    }
  }
  const newestFirst = all.slice().reverse();
  return { periods: newestFirst.slice(0, Math.max(0, cap)), totalPeriods: all.length, totalRows, truncated: newestFirst.length > cap };
}

/** Pure. Do a campaign day's spends add up to its (verified) account row? */
export function campaignSumReconciles(accountSpend: number, campaignSum: number, campaignRows: number): boolean {
  if (!Number.isFinite(accountSpend) || !Number.isFinite(campaignSum)) return false;
  const tolerance = Math.max(CAMPAIGN_RECONCILE_TOLERANCE * accountSpend, (campaignRows + 1) * CAMPAIGN_RECONCILE_SLACK_PER_ROW);
  return Math.abs(campaignSum - accountSpend) <= tolerance;
}

/**
 * Pure. The status of one day AT a level, or null when the day has nothing to
 * judge there (ACCOUNT: no account row. CAMPAIGN: no campaign row).
 *
 * CAMPAIGN level is deliberately conservative: only a day whose account row is
 * VERIFIED by a raw counterpart AND whose campaign spends reconcile with it is
 * VERIFIED. A reconciling campaign sum next to an unproven account row proves
 * nothing (both may be ×100 together), so that day stays UNVERIFIED.
 */
export function dayStatusAtLevel(d: DayEvidence, level: EvidenceLevel): DayStatus | null {
  if (level === 'ACCOUNT') return d.account;
  if (d.campaignRows === 0) return null;
  if (d.account === null) return 'UNVERIFIED';
  if (d.account !== 'VERIFIED') return d.account;
  return campaignSumReconciles(d.accountSpend ?? 0, d.campaignSpend, d.campaignRows) ? 'VERIFIED' : 'UNVERIFIED';
}

export const notApplicable = (level: EvidenceLevel, from: string | null, to: string | null): SpendWindowEvidence => ({
  applies: false, level, from, to, rows: 0, verified: 0, overscaled: 0, unverified: 0, clean: true, reason: null, periods: [],
});

/** Pure. Summarise per-day evidence over [from, to] (inclusive; null = open) at one level. */
export function summarizeWindow(
  days: DayEvidence[],
  level: EvidenceLevel,
  from: string | null,
  to: string | null,
): SpendWindowEvidence {
  const judged: Array<{ day: string; status: DayStatus }> = [];
  for (const d of days.slice().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (from && d.day < from) continue;
    if (to && d.day > to) continue;
    const status = dayStatusAtLevel(d, level);
    if (status) judged.push({ day: d.day, status });
  }
  const verified = judged.filter((r) => r.status === 'VERIFIED').length;
  const overscaled = judged.filter((r) => r.status === 'OVERSCALED').length;
  const unverified = judged.length - verified - overscaled;
  const reason: SpendGateReason | null = overscaled > 0 ? SPEND_SCALE_OVERSCALED : unverified > 0 ? SPEND_SCALE_UNVERIFIED : null;
  return {
    applies: true, level, from, to, rows: judged.length, verified, overscaled, unverified,
    clean: reason === null, reason, periods: buildPeriods(judged, 'UNVERIFIED').periods,
  };
}

// ── reads ───────────────────────────────────────────────────────────────

/**
 * READ-ONLY. Per-day evidence for ONE account over [from, to] (inclusive; open
 * when omitted): the ACCOUNT row judged against its raw_insights by the shared
 * rule, plus — when asked — the day's campaign spend total.
 *
 * Three small queries, none of which reads raw_json whole: raws are
 * GROUPed to distinct (day, spend) pairs because sync appends one per run.
 */
export async function loadDayEvidence(
  db: Db,
  accountId: string,
  opts: { from?: string | null; to?: string | null; withCampaigns?: boolean } = {},
): Promise<DayEvidence[]> {
  const from = opts.from ?? '1970-01-01';
  const to = opts.to ?? '9999-12-31';

  const accountRows = await db.$queryRaw<Array<{ day: string; spend: string }>>`
    SELECT to_char(date, 'YYYY-MM-DD') AS day, spend::text AS spend
    FROM daily_stats
    WHERE entity_type = 'ACCOUNT'::"EntityType" AND entity_id = ${accountId}
      AND date >= ${from}::date AND date <= ${to}::date
    ORDER BY date`;

  const raws = await db.$queryRaw<Array<{ day: string; spend: string | null }>>`
    SELECT to_char(date, 'YYYY-MM-DD') AS day, raw_json->>'spend' AS spend
    FROM raw_insights
    WHERE entity_type = 'ACCOUNT'::"EntityType" AND entity_id = ${accountId}
      AND date >= ${from}::date AND date <= ${to}::date
    GROUP BY date, raw_json->>'spend'`;

  const campaigns = opts.withCampaigns
    ? await db.$queryRaw<Array<{ day: string; total: string; n: number }>>`
        SELECT to_char(d.date, 'YYYY-MM-DD') AS day, sum(d.spend)::text AS total, count(*)::int AS n
        FROM daily_stats d
        WHERE d.entity_type = 'CAMPAIGN'::"EntityType"
          AND d.entity_id IN (SELECT id FROM campaigns WHERE ad_account_id = ${accountId})
          AND d.date >= ${from}::date AND d.date <= ${to}::date
        GROUP BY d.date`
    : [];

  const seenByDay = new Map<string, number[]>();
  for (const r of raws) {
    const s = parseMetaSpend({ spend: r.spend });
    const list = seenByDay.get(r.day) ?? [];
    if (s != null) list.push(s);
    seenByDay.set(r.day, list);
  }

  const out = new Map<string, DayEvidence>();
  for (const r of accountRows) {
    const stored = Number(r.spend);
    const verdict = judgeDayAgainstRaws(stored, seenByDay.get(r.day) ?? []).verdict;
    out.set(r.day, {
      day: r.day,
      account: verdict === 'VERIFIED' ? 'VERIFIED' : verdict === 'OVERSCALED' ? 'OVERSCALED' : 'UNVERIFIED',
      accountSpend: stored, campaignSpend: 0, campaignRows: 0,
    });
  }
  for (const c of campaigns) {
    const e = out.get(c.day) ?? { day: c.day, account: null, accountSpend: null, campaignSpend: 0, campaignRows: 0 };
    e.campaignSpend = Number(c.total);
    e.campaignRows = Number(c.n);
    out.set(c.day, e);
  }
  return [...out.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** READ-ONLY. The verdict for one account over one date range at one level. Non-IQD: not applicable, no query. */
export async function evaluateSpendWindow(
  db: Db,
  account: { id: string; currency: string | null | undefined },
  from: string | Date | null,
  to: string | Date | null,
  level: EvidenceLevel,
): Promise<SpendWindowEvidence> {
  const f = from == null ? null : isoDay(from);
  const t = to == null ? null : isoDay(to);
  if (!isIqd(account.currency)) return notApplicable(level, f, t);
  const days = await loadDayEvidence(db, account.id, { from: f, to: t, withCampaigns: level === 'CAMPAIGN' });
  return summarizeWindow(days, level, f, t);
}

export interface SpendScalePeriods {
  unverifiedPeriods: SpendPeriod[];
  unverifiedPeriodsTotal: number;
  unverifiedRowsTotal: number;
  unverifiedPeriodsTruncated: boolean;
  overscaledPeriods: SpendPeriod[];
  overscaledPeriodsTotal: number;
  overscaledRowsTotal: number;
  overscaledPeriodsTruncated: boolean;
  periodsCap: number;
}

/**
 * READ-ONLY. Every unverified and every over-scaled ACCOUNT-level period of the
 * account's WHOLE history (newest first, capped; totals exact). Independent of the
 * stored factor and of any rolling window.
 */
export async function listSpendPeriods(db: Db, accountId: string, cap: number = SPEND_PERIODS_CAP): Promise<SpendScalePeriods> {
  const days = await loadDayEvidence(db, accountId);
  const rows = days.filter((d) => d.account !== null).map((d) => ({ day: d.day, status: d.account as DayStatus }));
  const u = buildPeriods(rows, 'UNVERIFIED', cap);
  const o = buildPeriods(rows, 'OVERSCALED', cap);
  return {
    unverifiedPeriods: u.periods, unverifiedPeriodsTotal: u.totalPeriods, unverifiedRowsTotal: u.totalRows, unverifiedPeriodsTruncated: u.truncated,
    overscaledPeriods: o.periods, overscaledPeriodsTotal: o.totalPeriods, overscaledRowsTotal: o.totalRows, overscaledPeriodsTruncated: o.truncated,
    periodsCap: cap,
  };
}

// ── the flag a period read carries ──────────────────────────────────────

export interface SpendScaleFlag {
  code: SpendGateReason;
  severity: 'WARN' | 'CRITICAL';
  message: string;
  messageAr: string;
  /** Which rows were judged: ACCOUNT rows, or the stricter CAMPAIGN days. */
  level: EvidenceLevel;
  /** Rows in the requested range that are not verified (or are over-scaled). */
  rows: number;
  /** Account-level rows of the requested range. */
  of: number;
  from: string | null;
  to: string | null;
  /** Unverified runs inside the range, newest first, capped. */
  periods: SpendPeriod[];
}

/** Pure. null for a clean or not-applicable window. */
export function flagFromWindow(w: SpendWindowEvidence): SpendScaleFlag | null {
  if (!w.applies || w.clean || !w.reason) return null;
  const over = w.reason === SPEND_SCALE_OVERSCALED;
  const n = over ? w.overscaled : w.unverified;
  const span = `${w.from ?? '…'} → ${w.to ?? '…'}`;
  const campaign = w.level === 'CAMPAIGN';
  const what = campaign ? 'campaign-level day(s)' : 'account-level spend row(s)';
  const whatAr = campaign ? 'يوم على مستوى الحملات' : 'صف إنفاق على مستوى الحساب';
  return {
    code: w.reason,
    severity: over ? 'CRITICAL' : 'WARN',
    message: over
      ? `${n} of ${w.rows} ${what} in ${span} are exactly 100x raw Meta spend — spend figures for this period are inflated`
      : `${n} of ${w.rows} ${what} in ${span} cannot be checked against raw Meta data${campaign ? ' (account row unproven, or the campaigns do not add up to it)' : ''} — shown as stored, and spend-based advice for this period is withheld`,
    messageAr: over
      ? `${n} من ${w.rows} ${whatAr} في ${span} أكبر ×100 من بيانات Meta الخام — أرقام الإنفاق لهذه الفترة مضخّمة`
      : `${n} من ${w.rows} ${whatAr} في ${span} لا يمكن التحقق منها ببيانات Meta الخام — تُعرض كما هي، وتُحجب التوصيات المبنية على الإنفاق لهذه الفترة`,
    level: w.level, rows: n, of: w.rows, from: w.from, to: w.to, periods: w.periods,
  };
}

/**
 * READ-ONLY. The flag for a requested date range, or null when the account is not
 * IQD or the range holds no unverified / over-scaled row. Any period read that
 * overlaps an affected period carries it, however old that period is.
 */
export async function spendScaleFlagForRange(
  db: Db,
  account: { id: string; currency: string | null | undefined },
  from: string | Date | null,
  to: string | Date | null,
  level: EvidenceLevel = 'ACCOUNT',
): Promise<SpendScaleFlag | null> {
  return flagFromWindow(await evaluateSpendWindow(db, account, from, to, level));
}

/** Header value for array-shaped reads, which cannot grow a key. */
export const DATA_QUALITY_HEADER = 'X-Data-Quality';

// ── classification: what depends on spend ───────────────────────────────

/** Detector codes derived from spend (cost per result, CPM, burn rate). */
export const SPEND_DEPENDENT_ISSUE_CODES: ReadonlySet<string> = new Set([
  'RISING_COST_PER_RESULT', 'HIGH_CPM', 'BUDGET_BURNING_FAST',
]);

/**
 * Action codes whose justification is spend: budget, pacing, scaling, pause-for-waste.
 * By PRODUCER: V1 composition (PAUSE_AND_RELAUNCH needs RISING_COST_PER_RESULT,
 * REVIEW_BUDGET_PACING is budget); the AI agent's vocabulary (budget moves and pauses —
 * the code alone cannot say why it paused, so it is withheld too); the Brain's
 * DecisionAction (scale / pause / emergency); the V5 shadow engine (ADJUST_BID).
 * Creative, audience, hook, tracking and targeting actions are NOT here.
 */
export const SPEND_DEPENDENT_ACTION_CODES: ReadonlySet<string> = new Set([
  'PAUSE_AND_RELAUNCH', 'REVIEW_BUDGET_PACING',
  'INCREASE_BUDGET', 'DECREASE_BUDGET', 'PAUSE', 'PAUSE_URGENT',
  'SCALE_BUDGET', 'PAUSE_CAMPAIGN', 'EMERGENCY_PAUSE',
  'ADJUST_BID',
]);

/** Knowledge-base metrics computed from spend (a cost, or a return on it). */
export const SPEND_DERIVED_KB_METRICS: ReadonlySet<string> = new Set([
  'cpm', 'cpc', 'cost_per_message', 'cost_per_thruplay', 'roas',
]);

/** Brain verdicts that are blends including cost-per-message (and the velocity override). */
export const BRAIN_SPEND_DEPENDENT_ACTIONS: ReadonlySet<string> = new Set([
  'SCALE_BUDGET', 'PAUSE_CAMPAIGN', 'RESCUE_WATCH', 'REFRESH_CREATIVE', 'EMERGENCY_PAUSE',
]);

export const isSpendDependentIssueCode = (code: unknown): boolean => SPEND_DEPENDENT_ISSUE_CODES.has(String(code));
export const isSpendDependentActionCode = (code: unknown): boolean => SPEND_DEPENDENT_ACTION_CODES.has(String(code));

/** Pure. A copy of the metrics with every spend-derived one removed (a missing metric is never evaluated). */
export function withholdSpendDerivedMetrics<T extends Record<string, number | null | undefined>>(metrics: T): T {
  const out: Record<string, number | null | undefined> = { ...metrics };
  for (const k of Object.keys(out)) if (SPEND_DERIVED_KB_METRICS.has(k)) delete out[k];
  return out as T;
}

export interface RecommendationLike {
  actionCode: string;
  /** IssueCode[] for V1 rows; an object for AI rows. */
  sourceIssues?: unknown;
  details?: unknown;
}

/**
 * Pure. Does this recommendation rest on spend? Decided from what the row itself
 * says, in this order: its action code, the issues it was composed from, and — for a
 * knowledge-base recommendation — the metric whose breach produced the action.
 */
export function spendDependenceOfRecommendation(rec: RecommendationLike): { dependent: boolean; basis: 'ACTION_CODE' | 'SOURCE_ISSUE' | 'KB_METRIC' | null } {
  if (isSpendDependentActionCode(rec.actionCode)) return { dependent: true, basis: 'ACTION_CODE' };
  if (Array.isArray(rec.sourceIssues) && rec.sourceIssues.some(isSpendDependentIssueCode)) return { dependent: true, basis: 'SOURCE_ISSUE' };
  const d = rec.details;
  if (d && typeof d === 'object' && (d as Record<string, unknown>)['source'] === 'meta_ads_knowledge_base') {
    const breaches = (d as Record<string, unknown>)['metricBreaches'];
    if (Array.isArray(breaches)) {
      type B = { metricKey?: unknown; recommended_optimization_actions?: Array<{ id?: unknown }> };
      const owning = (breaches as B[]).filter((b) => (b.recommended_optimization_actions ?? []).some((a) => a?.id === rec.actionCode));
      // The breach that owns this action decides; if none can be matched, any spend-derived breach does.
      const decisive = owning.length > 0 ? owning : (breaches as B[]);
      if (decisive.some((b) => SPEND_DERIVED_KB_METRICS.has(String(b.metricKey)))) return { dependent: true, basis: 'KB_METRIC' };
    }
  }
  return { dependent: false, basis: null };
}

/** Where a stored recommendation was withheld, and why. */
export interface SuppressedRecommendation {
  id: string | null;
  actionCode: string;
  reason: SpendGateReason;
  basis: 'ACTION_CODE' | 'SOURCE_ISSUE' | 'KB_METRIC';
  entityType: string;
  entityId: string;
  date: string;
  window: { from: string | null; to: string | null; rows: number; unverified: number; overscaled: number };
}

// ── evaluation windows per producer ─────────────────────────────────────

/**
 * The span of daily rows each producer reads, so the gate looks at exactly what the
 * recommendation was computed from. `lagDays` = Meta attribution lag, `spanDays` =
 * current + prior window.
 *   · engine  — RulesEngine / RecommendationEngine / V5: 7d current + 7d prior, 2d lag.
 *   · brain   — loadCampaignSignalsBatch (same 14d, 2d lag) plus the latest row of the
 *               last 7 days, so the window ends at "now" and starts 15 days earlier.
 *   · aiAgent — a chat answer reads up to 30 days.
 */
export const EVIDENCE_WINDOWS = {
  engine: { lagDays: 2, spanDays: 14 },
  brain: { lagDays: 0, spanDays: 16 },
  aiAgent: { lagDays: 0, spanDays: 30 },
} as const;

/** [from, to] (ISO days) of a producer's window for an as-of day. */
export function windowForAsOf(asOf: string | Date, w: { lagDays: number; spanDays: number }): { from: string; to: string } {
  const to = addDaysIso(isoDay(asOf), -w.lagDays);
  return { from: addDaysIso(to, -(w.spanDays - 1)), to };
}

/**
 * READ-ONLY. Resolve the account (id + currency) an entity belongs to: the entity
 * itself for ACCOUNT, its parent account for CAMPAIGN. null for any other type —
 * no producer emits ad-set / ad recommendations, and their rows have no
 * account-level proof to compare with — or when the entity does not exist.
 * (The model API, not SQL: producers already read the account this way.)
 */
export async function resolveEntityAccount(
  db: Pick<PrismaClient, 'adAccount' | 'campaign'>,
  entityType: string,
  entityId: string,
): Promise<{ id: string; currency: string } | null> {
  if (entityType === 'ACCOUNT') {
    const a = await db.adAccount.findFirst({ where: { id: entityId }, select: { id: true, currency: true } });
    return a && typeof a.currency === 'string' ? { id: a.id ?? entityId, currency: a.currency } : null;
  }
  if (entityType === 'CAMPAIGN') {
    const c = await db.campaign.findFirst({ where: { id: entityId }, select: { adAccount: { select: { id: true, currency: true } } } });
    const a = c?.adAccount;
    return a && typeof a.currency === 'string' ? { id: a.id, currency: a.currency } : null;
  }
  return null;
}

/**
 * READ-ONLY. The verdict for the data an entity-level producer reads, ending at
 * `asOf`. ACCOUNT entities are judged at ACCOUNT level, CAMPAIGN entities at the
 * stricter CAMPAIGN level. Anything else, or an unknown entity, is not applicable.
 */
export async function evaluateEntityWindow(
  db: EntityDb,
  entityType: string,
  entityId: string,
  asOf: string | Date,
  window: { lagDays: number; spanDays: number } = EVIDENCE_WINDOWS.engine,
): Promise<SpendWindowEvidence> {
  const level: EvidenceLevel = entityType === 'CAMPAIGN' ? 'CAMPAIGN' : 'ACCOUNT';
  const { from, to } = windowForAsOf(asOf, window);
  const account = await resolveEntityAccount(db, entityType, entityId);
  if (!account) return notApplicable(level, from, to);
  return evaluateSpendWindow(db, account, from, to, level);
}

// ── the read-time gate over STORED recommendations ──────────────────────

export interface StoredRecommendation {
  id?: string;
  entityType: string;
  entityId: string;
  date: Date | string;
  actionCode: string;
  source?: string | null;
  sourceIssuesJson?: unknown;
  detailsJson?: unknown;
}

export interface PartitionedRecommendations<T> {
  kept: T[];
  suppressed: SuppressedRecommendation[];
  /** The verdicts behind the suppression, one per distinct (entity, window). */
  windows: SpendWindowEvidence[];
}

/**
 * READ-ONLY. THE display gate: split stored recommendations into those that may be
 * shown and those withheld because the window they were computed from holds spend
 * that is not verified. A recommendation is judged by ITS OWN date (an old one built
 * on a verified week stays; a new one built on an unverified week goes), by the
 * window its producer reads, at the level of its entity. Spend-independent
 * recommendations are always kept, whatever the evidence says. Non-IQD: all kept.
 *
 * If the evidence cannot be read, spend-dependent recommendations are withheld
 * (reason SPEND_SCALE_UNVERIFIED) — never shown on a guess.
 */
export async function partitionRecommendationsBySpendEvidence<T extends StoredRecommendation>(
  db: EntityDb,
  recs: T[],
): Promise<PartitionedRecommendations<T>> {
  const suppressedIdx = new Set<number>();
  const suppressed: SuppressedRecommendation[] = [];
  const windows: SpendWindowEvidence[] = [];

  // Only spend-dependent recommendations need evidence. Group them by entity and
  // producer window so the day-level evidence is read ONCE per group, whatever the
  // number of stored rows (GET /recommendations returns every date).
  type Item = { i: number; r: T; dep: NonNullable<ReturnType<typeof spendDependenceOfRecommendation>['basis']>; asOf: string; win: { lagDays: number; spanDays: number } };
  const groups = new Map<string, Item[]>();
  recs.forEach((r, i) => {
    const dep = spendDependenceOfRecommendation({ actionCode: r.actionCode, sourceIssues: r.sourceIssuesJson, details: r.detailsJson });
    if (!dep.dependent) return;
    const win = r.source === 'AI_AGENT' ? EVIDENCE_WINDOWS.aiAgent : EVIDENCE_WINDOWS.engine;
    const key = `${r.entityType}|${r.entityId}|${win.lagDays}|${win.spanDays}`;
    const g = groups.get(key) ?? [];
    g.push({ i, r, dep: dep.basis!, asOf: isoDay(r.date), win });
    groups.set(key, g);
  });

  for (const items of groups.values()) {
    const first = items[0]!;
    const level: EvidenceLevel = first.r.entityType === 'CAMPAIGN' ? 'CAMPAIGN' : 'ACCOUNT';
    const spans = items.map((it) => ({ it, ...windowForAsOf(it.asOf, it.win) }));
    const lo = spans.reduce((m, s) => (s.from < m ? s.from : m), spans[0]!.from);
    const hi = spans.reduce((m, s) => (s.to > m ? s.to : m), spans[0]!.to);

    let days: DayEvidence[] | null = null;
    let applies = true;
    try {
      const account = await resolveEntityAccount(db, first.r.entityType, first.r.entityId);
      if (!account || !isIqd(account.currency)) applies = false;
      else days = await loadDayEvidence(db, account.id, { from: lo, to: hi, withCampaigns: level === 'CAMPAIGN' });
    } catch {
      days = null; // evidence unreadable: fail closed below
    }
    if (!applies) continue;

    for (const { it, from, to } of spans) {
      const w: SpendWindowEvidence = days
        ? summarizeWindow(days, level, from, to)
        : { applies: true, level, from, to, rows: 0, verified: 0, overscaled: 0, unverified: 0, clean: false, reason: SPEND_SCALE_UNVERIFIED, periods: [] };
      if (w.clean) continue;
      suppressedIdx.add(it.i);
      windows.push(w);
      suppressed.push({
        id: it.r.id ?? null, actionCode: it.r.actionCode, reason: w.reason ?? SPEND_SCALE_UNVERIFIED, basis: it.dep,
        entityType: it.r.entityType, entityId: it.r.entityId, date: it.asOf,
        window: { from: w.from, to: w.to, rows: w.rows, unverified: w.unverified, overscaled: w.overscaled },
      });
    }
  }

  return { kept: recs.filter((_, i) => !suppressedIdx.has(i)), suppressed, windows };
}
