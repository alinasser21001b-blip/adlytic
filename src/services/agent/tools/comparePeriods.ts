// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/comparePeriods.ts   —  T3
//
//  Explicit A vs B window comparison for any entity (account or campaign).
//  Returns:
//    • both windows with totals + ratios
//    • per-metric delta%
//    • deterministic verdict + reasons (Arabic) so Claude can quote them
//      verbatim rather than opinion-generate them
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 T3
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';
import { agentDay, agentSpendWindow, describeAgentSpend, lowerConfidence, type AgentSpendEvidence } from '../spendGate';

interface WindowSpec {
  sinceDaysAgo: number;
  untilDaysAgo: number;
}

interface ComparePeriodsArgs {
  entityType: 'ACCOUNT' | 'CAMPAIGN' | 'ADSET' | 'AD';
  entityId: string;
  windowA: WindowSpec;
  windowB: WindowSpec;
}

interface WindowSummary {
  since: string;
  until: string;
  days: number;
  totals: {
    spend: number;
    messages: number;
    impressions: number;
    clicks: number;
  };
  ratios: {
    ctr: number | null;
    cpm: number | null;
    cost_per_message: number | null;
    roas: number | null;
  };
}

interface ComparePeriodsResult {
  entityType: string;
  entityId: string;
  entityName: string;
  windowA: WindowSummary;
  windowB: WindowSummary;
  deltas: {
    spendPct: number | null;
    messagesPct: number | null;
    ctrPct: number | null;
    cpmPct: number | null;
    costPerMessagePct: number | null;
    roasPct: number | null;
  };
  verdicts: {
    overall: 'better' | 'worse' | 'flat' | 'mixed';
    confidence: 'high' | 'low';
    reasons: string[];
  };
  /**
   * Present ONLY when the IQD spend of the compared range is not verified against raw Meta data (src/services/agent/spendGate.ts):
   * the spend / CPM / cost-per-message deltas are then null, the verdict is made from what does not rest on spend, and
   * confidence is 'low'. Absent — not null — for a USD account and for a verified range.
   */
  spendEvidence?: AgentSpendEvidence;
}

export function comparePeriodsHandler(): ToolHandler<ComparePeriodsArgs, ComparePeriodsResult> {
  return {
    name: 'compare_periods',
    description:
      "Explicit A vs B window comparison for any entity (account, campaign, adset, or ad). Use when the merchant asks 'قارن هذا الأسبوع بالماضي' or 'كيف كان الشهر الماضي مقابل هذا الشهر'. Each window is defined by sinceDaysAgo (start) and untilDaysAgo (end, 0 = today). Returns totals + ratios for both windows, per-metric delta%, and a deterministic verdict (better/worse/flat/mixed) with reasons — quote the reasons verbatim rather than paraphrase them. Confidence is 'high' when both windows have >=7 days of data, 'low' otherwise.",
    schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD'] },
        entityId: { type: 'string', minLength: 1 },
        windowA: {
          type: 'object',
          properties: {
            sinceDaysAgo: { type: 'integer', minimum: 1, maximum: 365 },
            untilDaysAgo: { type: 'integer', minimum: 0, maximum: 365 },
          },
          required: ['sinceDaysAgo', 'untilDaysAgo'],
          additionalProperties: false,
        },
        windowB: {
          type: 'object',
          properties: {
            sinceDaysAgo: { type: 'integer', minimum: 1, maximum: 365 },
            untilDaysAgo: { type: 'integer', minimum: 0, maximum: 365 },
          },
          required: ['sinceDaysAgo', 'untilDaysAgo'],
          additionalProperties: false,
        },
      },
      required: ['entityType', 'entityId', 'windowA', 'windowB'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 120,
    timeoutMs: 5000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      // Validate window ordering
      if (args.windowA.sinceDaysAgo <= args.windowA.untilDaysAgo) {
        return fail('INVALID_INPUT', 'windowA.sinceDaysAgo must be > windowA.untilDaysAgo', {
          field: 'windowA', retryable: true,
        });
      }
      if (args.windowB.sinceDaysAgo <= args.windowB.untilDaysAgo) {
        return fail('INVALID_INPUT', 'windowB.sinceDaysAgo must be > windowB.untilDaysAgo', {
          field: 'windowB', retryable: true,
        });
      }

      // Scope check + resolve name/currency.
      let entityName = args.entityId;
      let currency = 'USD';
      let factor = 100;
      let stalenessMinutes: number | null = null;
      // The ad account the entity belongs to — what the spend-evidence verdict is read for.
      let evidenceAccount: { id: string; currency: string } | null = null;

      if (args.entityType === 'CAMPAIGN') {
        const camp = await prisma.campaign.findFirst({
          where: { id: args.entityId, adAccount: { workspaceId } },
          include: { adAccount: true },
        });
        if (!camp) {
          return fail('NOT_FOUND', `Campaign "${args.entityId}" not found`, {
            field: 'entityId', retryable: false,
            suggestion: 'Call list_campaigns first.',
          });
        }
        entityName = camp.name;
        evidenceAccount = { id: camp.adAccount.id, currency: camp.adAccount.currency };
        currency = camp.adAccount.currency;
        factor = resolveCurrencyMinorFactor(currency, camp.adAccount.currencyMinorFactor);
        stalenessMinutes = camp.adAccount.lastSyncedAt
          ? Math.round((Date.now() - camp.adAccount.lastSyncedAt.getTime()) / 60_000)
          : null;
      } else if (args.entityType === 'ACCOUNT') {
        const acct = await prisma.adAccount.findFirst({
          where: { id: args.entityId, workspaceId },
        });
        if (!acct) {
          return fail('NOT_FOUND', `AdAccount "${args.entityId}" not found`, {
            field: 'entityId', retryable: false,
          });
        }
        entityName = acct.name;
        evidenceAccount = { id: acct.id, currency: acct.currency };
        currency = acct.currency;
        factor = resolveCurrencyMinorFactor(currency, acct.currencyMinorFactor);
        stalenessMinutes = acct.lastSyncedAt
          ? Math.round((Date.now() - acct.lastSyncedAt.getTime()) / 60_000)
          : null;
      } else if (args.entityType === 'ADSET') {
        const adset = await prisma.adSet.findFirst({
          where: { id: args.entityId, campaign: { adAccount: { workspaceId } } },
          include: { campaign: { include: { adAccount: true } } },
        });
        if (!adset) return fail('NOT_FOUND', `AdSet "${args.entityId}" not found`, { field: 'entityId', retryable: false });
        entityName = adset.name;
        evidenceAccount = { id: adset.campaign.adAccount.id, currency: adset.campaign.adAccount.currency };
        currency = adset.campaign.adAccount.currency;
        factor = resolveCurrencyMinorFactor(currency, adset.campaign.adAccount.currencyMinorFactor);
        stalenessMinutes = adset.campaign.adAccount.lastSyncedAt
          ? Math.round((Date.now() - adset.campaign.adAccount.lastSyncedAt.getTime()) / 60_000)
          : null;
      } else if (args.entityType === 'AD') {
        const ad = await prisma.ad.findFirst({
          where: { id: args.entityId, adSet: { campaign: { adAccount: { workspaceId } } } },
          include: { adSet: { include: { campaign: { include: { adAccount: true } } } } },
        });
        if (!ad) return fail('NOT_FOUND', `Ad "${args.entityId}" not found`, { field: 'entityId', retryable: false });
        entityName = ad.name;
        evidenceAccount = { id: ad.adSet.campaign.adAccount.id, currency: ad.adSet.campaign.adAccount.currency };
        currency = ad.adSet.campaign.adAccount.currency;
        factor = resolveCurrencyMinorFactor(currency, ad.adSet.campaign.adAccount.currencyMinorFactor);
        stalenessMinutes = ad.adSet.campaign.adAccount.lastSyncedAt
          ? Math.round((Date.now() - ad.adSet.campaign.adAccount.lastSyncedAt.getTime()) / 60_000)
          : null;
      }

      const now = new Date();
      const aStart = utcMidnight(now.getTime() - args.windowA.sinceDaysAgo * 864e5);
      const aEnd = utcMidnight(now.getTime() - args.windowA.untilDaysAgo * 864e5);
      const bStart = utcMidnight(now.getTime() - args.windowB.sinceDaysAgo * 864e5);
      const bEnd = utcMidnight(now.getTime() - args.windowB.untilDaysAgo * 864e5);
      const earliest = aStart.getTime() < bStart.getTime() ? aStart : bStart;
      const latest = aEnd.getTime() > bEnd.getTime() ? aEnd : bEnd;

      const rows = await prisma.dailyStat.findMany({
        where: {
          entityType: toDbEntityType(args.entityType),
          entityId: args.entityId,
          date: { gte: earliest, lte: latest },
        },
      });

      const inWindow = (d: Date, start: Date, end: Date) =>
        d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
      const rowsA = rows.filter((r) => inWindow(r.date, aStart, aEnd));
      const rowsB = rows.filter((r) => inWindow(r.date, bStart, bEnd));

      const summary = (r: typeof rows, since: Date, until: Date): WindowSummary => {
        const spend = r.reduce((a, x) => a + Number(x.spend), 0);
        const impressions = r.reduce((a, x) => a + Number(x.impressions), 0);
        const clicks = r.reduce((a, x) => a + Number(x.clicks), 0);
        const messages = r.reduce((a, x) => a + Number(x.messages), 0);
        const spendMajor = factor === 1 ? spend : spend / factor;
        const roasAvg = (() => {
          const vals = r.map((x) => x.roas).filter((v): v is number => v != null);
          return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4) : null;
        })();
        return {
          since: since.toISOString().slice(0, 10),
          until: until.toISOString().slice(0, 10),
          days: Math.round((until.getTime() - since.getTime()) / 864e5) + 1,
          totals: { spend, messages, impressions, clicks },
          ratios: {
            ctr: impressions > 0 ? +(clicks / impressions * 100).toFixed(4) : null,
            cpm: impressions > 0 ? +(spendMajor / impressions * 1000).toFixed(4) : null,
            cost_per_message: messages > 0 ? +(spendMajor / messages).toFixed(4) : null,
            roas: roasAvg,
          },
        };
      };

      const A = summary(rowsA, aStart, aEnd);
      const B = summary(rowsB, bStart, bEnd);

      const deltas = {
        spendPct: pctChange(A.totals.spend, B.totals.spend),
        messagesPct: pctChange(A.totals.messages, B.totals.messages),
        ctrPct: pctChange(A.ratios.ctr, B.ratios.ctr),
        cpmPct: pctChange(A.ratios.cpm, B.ratios.cpm),
        costPerMessagePct: pctChange(A.ratios.cost_per_message, B.ratios.cost_per_message),
        roasPct: pctChange(A.ratios.roas, B.ratios.roas),
      };

      let confidence: 'high' | 'low' = A.days >= 7 && B.days >= 7 ? 'high' : 'low';

      // Spend-evidence gate (IQD only; src/services/agent/spendGate.ts), judged over exactly the rows read above: an account
      // comparison at ACCOUNT level, anything below it (campaign, ad set, ad) at CAMPAIGN level — the account row must be verified
      // AND the campaigns must add up to it. Not clean (or unreadable) → the spend, CPM and cost-per-message CHANGES are not
      // reported (across a x100 boundary they read as a 99 % swing), the verdict is made from what does not rest on spend, and
      // confidence is low. The absolute totals stay as stored. A USD account and a verified range skip all of this: no key is added.
      const spendEvidence = evidenceAccount
        ? describeAgentSpend(
            await agentSpendWindow(prisma, evidenceAccount, args.entityType === 'ACCOUNT' ? 'ACCOUNT' : 'CAMPAIGN', earliest, latest),
            ['deltas.spendPct', 'deltas.cpmPct', 'deltas.costPerMessagePct', 'the spend / CPM / cost-per-message reasons of the verdict', 'verdicts.confidence (lowered to low)'],
          )
        : null;
      if (spendEvidence) {
        deltas.spendPct = null;
        deltas.cpmPct = null;
        deltas.costPerMessagePct = null;
        confidence = lowerConfidence(confidence);
      }
      const verdict = deriveVerdict(deltas);
      if (spendEvidence) verdict.reasons.push('لم يُتحقق من الإنفاق ببيانات Meta الخام، لذلك لم تُقارَن الفترتان من حيث الإنفاق وCPM وتكلفة الرسالة.');

      return ok<ComparePeriodsResult>(
        {
          entityType: args.entityType,
          entityId: args.entityId,
          entityName,
          windowA: A,
          windowB: B,
          deltas,
          verdicts: {
            overall: verdict.overall,
            confidence,
            reasons: verdict.reasons,
          },
          ...(spendEvidence ? { spendEvidence } : {}),
        },
        {
          sourceTable: 'daily_stats',
          latestRowDate: rows.length > 0 ? rows[rows.length - 1]!.date.toISOString().slice(0, 10) : null,
          stalenessMinutes,
        },
      );
    },
  } satisfies ToolHandler<ComparePeriodsArgs, ComparePeriodsResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

/** Tool schema exposes 'ADSET' (matches Meta's terminology) but Prisma's
 *  EntityType enum column is 'AD_SET'. Map explicitly — a blind `as EntityType`
 *  cast would silently send an invalid enum value to Postgres. */
function toDbEntityType(t: ComparePeriodsArgs['entityType']): EntityType {
  return t === 'ADSET' ? EntityType.AD_SET : (t as EntityType);
}

function pctChange(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  if (b === 0) return a === 0 ? 0 : null;
  return +(((a - b) / b) * 100).toFixed(2);
}

interface Deltas {
  spendPct: number | null;
  messagesPct: number | null;
  ctrPct: number | null;
  cpmPct: number | null;
  costPerMessagePct: number | null;
  roasPct: number | null;
}

/** Verdict rules — deterministic, no LLM guessing. */
function deriveVerdict(d: Deltas): { overall: 'better' | 'worse' | 'flat' | 'mixed'; reasons: string[] } {
  const reasons: string[] = [];
  let betterCount = 0;
  let worseCount = 0;

  const check = (
    value: number | null,
    higherIsBetter: boolean,
    label: string,
    threshold = 5,
  ) => {
    if (value == null || Math.abs(value) < threshold) return;
    const direction = value > 0;
    const isGood = direction === higherIsBetter;
    const arabicDir = value > 0 ? 'ارتفع' : 'انخفض';
    reasons.push(`${label} ${arabicDir} ${Math.abs(value)}%`);
    if (isGood) betterCount++;
    else worseCount++;
  };

  check(d.messagesPct, true, 'الرسائل');
  check(d.ctrPct, true, 'CTR');
  check(d.roasPct, true, 'ROAS');
  check(d.spendPct, false, 'الإنفاق');
  check(d.cpmPct, false, 'CPM');
  check(d.costPerMessagePct, false, 'تكلفة الرسالة');

  if (betterCount === 0 && worseCount === 0) return { overall: 'flat', reasons: ['لا تغيير جوهري بين الفترتين'] };
  if (betterCount > 0 && worseCount === 0) return { overall: 'better', reasons };
  if (worseCount > 0 && betterCount === 0) return { overall: 'worse', reasons };
  return { overall: 'mixed', reasons };
}

export type { ComparePeriodsArgs, ComparePeriodsResult };
void (undefined as unknown as PrismaClient | undefined);
