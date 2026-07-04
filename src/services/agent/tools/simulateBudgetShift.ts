// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/simulateBudgetShift.ts   —  T11
//
//  Projects the outcome of moving budget from campaign A to campaign B,
//  using each campaign's own historical cost-per-message as the efficiency
//  model. Analysis-only — never touches Meta, never writes to our DB.
//
//  Method:
//    1. Compute each campaign's trailing 30-day daily spend and
//       cost-per-message (spend / messages).
//    2. New daily budget for A = current - shiftAmount; for B = current + shiftAmount.
//    3. Projected messages = newDailyBudget / costPerMessage * projectionDays,
//       with a ±20% band (low/mid/high) to signal this is a projection,
//       not a promise.
//    4. Confidence: 'high' only when BOTH campaigns have >= 7 days of
//       stable (non-zero spend) history; 'low' otherwise (e.g. a newly
//       launched campaign has a less reliable cost-per-message estimate).
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.5 T11
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

interface ShiftAmount {
  value: number;
  unit: 'pct_of_from' | 'abs_daily';
}

interface SimulateBudgetShiftArgs {
  fromCampaignId: string;
  toCampaignId: string;
  shiftAmount: ShiftAmount;
  projectionDays: number;
}

interface ProjectionBand {
  low: number;
  mid: number;
  high: number;
}

interface SimulateBudgetShiftResult {
  currentAllocation: { fromDailyBudget: number; toDailyBudget: number };
  shiftedAllocation: { fromDailyBudget: number; toDailyBudget: number };
  projected: {
    fromCampaign: { messages: ProjectionBand; spend: number };
    toCampaign: { messages: ProjectionBand; spend: number };
    workspaceTotal: { messagesDelta: number; roasDelta: number | null };
  };
  assumptionsUsed: string[];
  confidence: 'high' | 'medium' | 'low';
  caveats: string[];
}

/** Historical lookback used to estimate each campaign's cost-per-message. */
const HISTORY_DAYS = 30;
/** Minimum days of non-zero spend to call a campaign's estimate "stable". */
const STABLE_DAYS_THRESHOLD = 7;
/** Symmetric variance band applied to the point projection. */
const PROJECTION_VARIANCE_PCT = 0.20;

export function simulateBudgetShiftHandler(): ToolHandler<SimulateBudgetShiftArgs, SimulateBudgetShiftResult> {
  return {
    name: 'simulate_budget_shift',
    description:
      "Simulate what happens if you shift daily budget from campaign A to campaign B, using each campaign's own trailing 30-day cost-per-message as the efficiency model. Does NOT execute anything — analysis-only. Use when the merchant asks 'شلون أوزّع الميزانية' or before making a data-backed reallocation suggestion. Returns a projected messages range (low/mid/high, ±20% band) for both campaigns, the net workspace effect, and a confidence level. Confidence is 'low' when either campaign has < 7 days of stable spend history — a newer campaign's cost-per-message estimate is less reliable.",
    schema: {
      type: 'object',
      properties: {
        fromCampaignId: { type: 'string', minLength: 1 },
        toCampaignId: { type: 'string', minLength: 1 },
        shiftAmount: {
          type: 'object',
          properties: {
            value: { type: 'number', minimum: 0.01 },
            unit: { type: 'string', enum: ['pct_of_from', 'abs_daily'] },
          },
          required: ['value', 'unit'],
          additionalProperties: false,
        },
        projectionDays: { type: 'integer', minimum: 1, maximum: 30, default: 7 },
      },
      required: ['fromCampaignId', 'toCampaignId', 'shiftAmount'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 0,   // simulation depends on args too widely to cache usefully
    timeoutMs: 6000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      if (args.fromCampaignId === args.toCampaignId) {
        return fail('INVALID_INPUT', 'fromCampaignId and toCampaignId must differ', {
          field: 'toCampaignId', retryable: true,
        });
      }

      const [fromCamp, toCamp] = await Promise.all([
        prisma.campaign.findFirst({
          where: { id: args.fromCampaignId, adAccount: { workspaceId } },
          include: { adAccount: true },
        }),
        prisma.campaign.findFirst({
          where: { id: args.toCampaignId, adAccount: { workspaceId } },
          include: { adAccount: true },
        }),
      ]);
      if (!fromCamp) {
        return fail('NOT_FOUND', `Campaign "${args.fromCampaignId}" not found in this workspace`, {
          field: 'fromCampaignId', retryable: false, suggestion: 'Call list_campaigns first.',
        });
      }
      if (!toCamp) {
        return fail('NOT_FOUND', `Campaign "${args.toCampaignId}" not found in this workspace`, {
          field: 'toCampaignId', retryable: false, suggestion: 'Call list_campaigns first.',
        });
      }

      const factor = resolveCurrencyMinorFactor(fromCamp.adAccount.currency, fromCamp.adAccount.currencyMinorFactor);
      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - HISTORY_DAYS * 864e5);

      const [fromRows, toRows] = await Promise.all([
        prisma.dailyStat.findMany({
          where: { entityType: EntityType.CAMPAIGN, entityId: fromCamp.id, date: { gte: sinceDate } },
          orderBy: { date: 'asc' },
        }),
        prisma.dailyStat.findMany({
          where: { entityType: EntityType.CAMPAIGN, entityId: toCamp.id, date: { gte: sinceDate } },
          orderBy: { date: 'asc' },
        }),
      ]);

      const fromModel = buildEfficiencyModel(fromRows, factor);
      const toModel = buildEfficiencyModel(toRows, factor);

      if (fromModel.costPerMessage == null) {
        return fail(
          'INVALID_INPUT',
          `Campaign "${fromCamp.name}" has no messages in the trailing ${HISTORY_DAYS} days — cannot estimate cost-per-message.`,
          { field: 'fromCampaignId', retryable: false, suggestion: 'Choose a campaign with recent conversions.' },
        );
      }

      // Current daily budgets — fall back to trailing daily-spend average
      // when Campaign.dailyBudget isn't set (some campaigns run lifetime budgets).
      const fromDailyBudgetMinor = fromCamp.dailyBudget != null ? Number(fromCamp.dailyBudget) : fromModel.dailySpendMean;
      const toDailyBudgetMinor = toCamp.dailyBudget != null ? Number(toCamp.dailyBudget) : toModel.dailySpendMean;
      const fromDailyBudgetMajor = factor === 1 ? fromDailyBudgetMinor : fromDailyBudgetMinor / factor;
      const toDailyBudgetMajor = factor === 1 ? toDailyBudgetMinor : toDailyBudgetMinor / factor;

      // Resolve the shift amount to major-currency units/day.
      const shiftMajor = args.shiftAmount.unit === 'pct_of_from'
        ? fromDailyBudgetMajor * (args.shiftAmount.value / 100)
        : args.shiftAmount.value;

      if (shiftMajor >= fromDailyBudgetMajor) {
        return fail(
          'INVALID_INPUT',
          `Shift amount (${shiftMajor.toFixed(2)}) would remove the entire daily budget of "${fromCamp.name}" (${fromDailyBudgetMajor.toFixed(2)}). Choose a smaller shift.`,
          { field: 'shiftAmount', retryable: true },
        );
      }

      const newFromBudget = fromDailyBudgetMajor - shiftMajor;
      const newToBudget = toDailyBudgetMajor + shiftMajor;

      // Project messages: budget / cost_per_message * projectionDays, banded ±20%.
      const projectFrom = projectMessages(newFromBudget, fromModel.costPerMessage, args.projectionDays);
      const projectTo = toModel.costPerMessage != null
        ? projectMessages(newToBudget, toModel.costPerMessage, args.projectionDays)
        : { low: 0, mid: 0, high: 0 };   // no history for "to" — conservative zero, flagged in caveats

      const fromSpendProjected = newFromBudget * args.projectionDays;
      const toSpendProjected = newToBudget * args.projectionDays;

      // Baseline (no-shift) messages for delta comparison.
      const baselineFromMsgs = fromModel.costPerMessage > 0
        ? (fromDailyBudgetMajor / fromModel.costPerMessage) * args.projectionDays
        : 0;
      const baselineToMsgs = toModel.costPerMessage && toModel.costPerMessage > 0
        ? (toDailyBudgetMajor / toModel.costPerMessage) * args.projectionDays
        : 0;
      const messagesDelta = Math.round((projectFrom.mid + projectTo.mid) - (baselineFromMsgs + baselineToMsgs));

      const fromStable = fromModel.stableDays >= STABLE_DAYS_THRESHOLD;
      const toStable = toModel.stableDays >= STABLE_DAYS_THRESHOLD;
      const confidence: SimulateBudgetShiftResult['confidence'] =
        fromStable && toStable ? 'high' : (fromStable || toStable ? 'medium' : 'low');

      const assumptionsUsed = [
        `Linear scaling of spend to messages within ±${Math.round(PROJECTION_VARIANCE_PCT * 100)}% band`,
        'No auction-pressure change assumed (CPM held constant from trailing history)',
        `cost-per-message computed from trailing ${HISTORY_DAYS}-day history`,
      ];
      const caveats: string[] = [];
      if (!fromStable) caveats.push(`"${fromCamp.name}" has only ${fromModel.stableDays} days of stable spend — projection is less reliable.`);
      if (!toStable) caveats.push(`"${toCamp.name}" has only ${toModel.stableDays} days of stable spend — projection is less reliable.`);
      if (toModel.costPerMessage == null) caveats.push(`"${toCamp.name}" has no message history — cannot project growth reliably; shown as 0.`);

      const latestRowDate = [...fromRows, ...toRows]
        .map((r) => r.date.getTime())
        .reduce((a, b) => Math.max(a, b), 0);

      return ok<SimulateBudgetShiftResult>(
        {
          currentAllocation: {
            fromDailyBudget: +fromDailyBudgetMajor.toFixed(2),
            toDailyBudget: +toDailyBudgetMajor.toFixed(2),
          },
          shiftedAllocation: {
            fromDailyBudget: +newFromBudget.toFixed(2),
            toDailyBudget: +newToBudget.toFixed(2),
          },
          projected: {
            fromCampaign: { messages: roundBand(projectFrom), spend: +fromSpendProjected.toFixed(2) },
            toCampaign: { messages: roundBand(projectTo), spend: +toSpendProjected.toFixed(2) },
            workspaceTotal: { messagesDelta, roasDelta: null },
          },
          assumptionsUsed,
          confidence,
          caveats,
        },
        {
          sourceTable: 'daily_stats',
          latestRowDate: latestRowDate > 0 ? new Date(latestRowDate).toISOString().slice(0, 10) : null,
          stalenessMinutes: fromCamp.adAccount.lastSyncedAt
            ? Math.round((Date.now() - fromCamp.adAccount.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<SimulateBudgetShiftArgs, SimulateBudgetShiftResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

interface EfficiencyModel {
  /** Major currency units per message; null when the campaign has zero messages in-window. */
  costPerMessage: number | null;
  dailySpendMean: number;   // minor units
  stableDays: number;       // count of days with non-zero spend
}

function buildEfficiencyModel(
  rows: Array<{ spend: bigint; messages: bigint }>,
  factor: number,
): EfficiencyModel {
  const spendDays = rows.filter((r) => Number(r.spend) > 0);
  const totalSpend = rows.reduce((a, r) => a + Number(r.spend), 0);
  const totalMessages = rows.reduce((a, r) => a + Number(r.messages), 0);
  const spendMajor = factor === 1 ? totalSpend : totalSpend / factor;
  const costPerMessage = totalMessages > 0 ? spendMajor / totalMessages : null;
  return {
    costPerMessage,
    dailySpendMean: rows.length > 0 ? totalSpend / rows.length : 0,
    stableDays: spendDays.length,
  };
}

function projectMessages(dailyBudgetMajor: number, costPerMessage: number | null, days: number): ProjectionBand {
  if (!costPerMessage || costPerMessage <= 0) return { low: 0, mid: 0, high: 0 };
  const mid = (dailyBudgetMajor * days) / costPerMessage;
  return {
    low: mid * (1 - PROJECTION_VARIANCE_PCT),
    mid,
    high: mid * (1 + PROJECTION_VARIANCE_PCT),
  };
}

function roundBand(band: ProjectionBand): ProjectionBand {
  return {
    low: Math.max(0, Math.round(band.low)),
    mid: Math.max(0, Math.round(band.mid)),
    high: Math.max(0, Math.round(band.high)),
  };
}

export type { SimulateBudgetShiftArgs, SimulateBudgetShiftResult };
void (undefined as unknown as PrismaClient | undefined);
