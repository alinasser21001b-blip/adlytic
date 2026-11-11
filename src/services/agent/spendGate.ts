// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/spendGate.ts — the spend-evidence rule for the AI agent's READ tools.
//
//  WHY. `save_recommendation` already refuses a budget move or a pause on IQD spend that is not
//  verified against raw Meta data (src/lib/spendEvidence.ts). The read tools never asked: simulate_budget_shift,
//  rank_campaigns, compare_periods, detect_anomaly, list_campaigns and get_campaign_details answered "confidence:
//  high, caveats: []" on the very rows the dashboard says it cannot verify, and the campaign "investigate" tab
//  turned get_campaign_details.spendPacing into "raise the daily budget". A chat answer is built from these results, so
//  the gate has to be in the results themselves (review round 3, SP-1 / SP-2).
//
//  RULE. The same one the rest of the code uses: IQD only; a window is clean only if every row in it is VERIFIED
//  (src/lib/spendEvidence.ts::evaluateSpendWindow), judged at CAMPAIGN level for campaign rows (the account row must
//  be verified AND the campaigns must add up to it) and at ACCOUNT level for the account's own rows; an evidence read
//  that fails is "not clean" (fail closed). The window is the span of rows the tool actually reads, ending today.
//
//  WHAT A GATED RESULT LOOKS LIKE. Spend-dependent OUTPUTS are withheld (a budget projection is refused like
//  save_recommendation refuses; pacing, burn rate, spend / CPM / cost-per-result COMPARISONS, spend-ranked orderings and
//  the cost-blended anomaly metrics are left out) and the result carries `spendEvidence` — reason code, window, counts,
//  what was left out, and an instruction for the model. Spend-independent outputs (CTR, messages, rank by CTR / health,
//  creative and audience findings) are untouched. Absolute spend FIGURES stay as stored, exactly like the dashboard's KPI
//  cards: the gate withholds advice and comparisons, it does not rewrite money.
//
//  BYTE-IDENTICAL FOR EVERYONE ELSE. A non-IQD account makes no evidence query; a clean IQD window returns `null` from
//  `describeAgentSpend`, so a tool adds NO key and changes NO value. See delivery/core/SPEND_EVIDENCE_GATING.md.
//
//  READ-ONLY: nothing here writes.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import {
  SPEND_SCALE_UNVERIFIED, evaluateSpendWindow, isIqd, isoDay, unreadableWindow,
  type EvidenceLevel, type SpendGateReason, type SpendWindowEvidence,
} from '../../lib/spendEvidence';

type Db = Pick<PrismaClient, '$queryRaw'>;

/** The `spendEvidence` key a gated tool result carries. Absent (never `null`) when the window is clean or not IQD. */
export interface AgentSpendEvidence {
  /** The same reason code the dashboard, the weekly report and save_recommendation use. */
  code: SpendGateReason;
  level: EvidenceLevel;
  from: string | null;
  to: string | null;
  /** Rows (or campaign-days) judged in the window, and how many are not verified / are proven x100. */
  rows: number;
  unverified: number;
  overscaled: number;
  /** true = the evidence could not be READ, so the window is treated as unverified. */
  unreadable?: true;
  /** What THIS result left out because of it (field names, in the tool's own vocabulary). */
  withheld: string[];
  /** For the model: what happened and what it must not do. Always English; the model answers in the merchant's language. */
  note: string;
}

/** Spend-derived metric keys: a ranking or a z-score over them rests on stored spend. */
export const SPEND_METRIC_KEYS: ReadonlySet<string> = new Set(['spend', 'cpm', 'cost_per_message']);

const DAY_MS = 86_400_000;
/** The UTC calendar day `n` days before `now` — the same `utcMidnight(now − n·day)` every agent tool uses for its window. */
export const agentDay = (now: Date, daysAgo: number): string => new Date(now.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);

/**
 * READ-ONLY. The verdict for `[from, to]` (UTC days, inclusive) on one account at one level. A non-IQD account is "not
 * applicable" and costs no query. An evidence read that fails is NOT clean (fail closed, reason SPEND_SCALE_UNVERIFIED,
 * `unreadable`) — the tool then withholds rather than answering on a guess.
 */
export async function agentSpendWindow(
  db: Db,
  account: { id: string; currency: string | null | undefined },
  level: EvidenceLevel,
  from: Date | string,
  to: Date | string,
): Promise<SpendWindowEvidence> {
  const f = isoDay(from);
  const t = isoDay(to);
  try {
    return await evaluateSpendWindow(db, account, f, t, level);
  } catch (err) {
    if (!isIqd(account.currency)) return unreadableWindow(account.currency, level, f, t);
    console.error('[agent-spend-gate] evidence read failed — withholding spend-dependent output:', err instanceof Error ? err.message : err);
    return unreadableWindow(account.currency, level, f, t);
  }
}

/** Pure. true when the window must withhold: an IQD window that is not clean (including an unreadable one). */
export const isSpendGated = (w: SpendWindowEvidence | null | undefined): w is SpendWindowEvidence => !!w && w.applies && !w.clean;

/**
 * Pure. The `spendEvidence` object for a verdict, or `null` when the window is clean / not IQD (the caller then adds
 * nothing at all). `withheld` names what the caller left out.
 */
export function describeAgentSpend(w: SpendWindowEvidence | null | undefined, withheld: string[]): AgentSpendEvidence | null {
  if (!isSpendGated(w)) return null;
  const code: SpendGateReason = w.reason ?? SPEND_SCALE_UNVERIFIED;
  const span = `${w.from ?? '…'}..${w.to ?? '…'}`;
  const unit = w.level === 'CAMPAIGN' ? 'campaign-level day(s)' : 'account-level row(s)';
  const why = w.unreadable
    ? `the raw Meta evidence for ${span} could not be read, so the spend is treated as unverified`
    : code === 'SPEND_SCALE_OVERSCALED'
      ? `${w.overscaled} of ${w.rows} ${unit} in ${span} are exactly 100x raw Meta spend`
      : `${w.unverified} of ${w.rows} ${unit} in ${span} cannot be checked against raw Meta data`;
  const left = withheld.length > 0 ? ` Left out of this result: ${withheld.join('; ')}.` : '';
  return {
    code,
    level: w.level,
    from: w.from,
    to: w.to,
    rows: w.rows,
    unverified: w.unverified,
    overscaled: w.overscaled,
    ...(w.unreadable ? { unreadable: true as const } : {}),
    withheld,
    note:
      `${code}: ${why}.${left} Spend figures that remain in this result are shown as stored and may be wrong. ` +
      'Do NOT give budget, pacing, forecast, pause-for-cost or cost-per-result advice from this result, and do not rank by spend, CPM or cost per result; ' +
      'tell the merchant their spend for this period cannot be verified yet, and give only advice that does not depend on spend (creative, audience, tracking, CTR).',
  };
}

/**
 * Pure. The message of the refusal a spend-only tool returns (simulate_budget_shift, rank by a spend metric) — the same
 * wording save_recommendation uses: `SPEND_SCALE_UNVERIFIED` first, then why.
 */
export function spendRefusalMessage(what: string, w: SpendWindowEvidence): string {
  const code: SpendGateReason = w.reason ?? SPEND_SCALE_UNVERIFIED;
  return `${code}: ${what} rests on spend that could not be verified against raw Meta data` +
    (w.unreadable
      ? ` (the evidence for ${w.from}..${w.to} could not be read)`
      : ` (${w.unverified} unverified, ${w.overscaled} over-scaled of ${w.rows} day(s) in ${w.from}..${w.to})`);
}

export const SPEND_REFUSAL_SUGGESTION =
  'Do not give a budget move, a projection or a spend / cost ranking for this period. Tell the merchant their spend for it cannot be verified yet, ' +
  'and answer from what does not depend on spend (CTR, messages, health, creative, audience, tracking).';

/** Pure. A confidence level can only go down because of unverified spend. */
export const lowerConfidence = <T extends string>(_c: T): 'low' => 'low';
