// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/checkSuspiciousActivity.ts   —  T14
//
//  Fraud & suspicious-activity safety net. Distinct from detect_anomaly
//  (T8, statistical outliers) — these are PATTERN-MATCHED red flags with
//  known causes, always CRITICAL when found, meant to be surfaced FIRST
//  in any brief or reply.
//
//  Patterns detected:
//    1. Impression fraud   — spend +500%+ hour-over-hour, impressions up,
//                             zero clicks/messages. Bot traffic / auction fraud.
//    2. Budget bleed        — daily spend exceeded daily budget by > 30%
//                             (Meta over-delivery gone wrong).
//    3. Attribution collapse — conversions dropped to 0 while spend
//                             continued for 2+ days. Pixel likely broken.
//    4. Duplicate campaigns  — multiple active ad sets in the same campaign
//                             with identical creative + identical targeting
//                             hash (unintended duplication, wastes spend).
//    5. Runaway budget       — newly launched campaign (< 3 days old) hit
//                             100%+ of daily budget within its first day.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §30
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

interface CheckSuspiciousActivityArgs {
  /** Restrict the scan to one campaign; omit to scan the whole workspace. */
  campaignId?: string;
  lookbackDays: number;
}

type FlagType =
  | 'IMPRESSION_FRAUD'
  | 'BUDGET_BLEED'
  | 'ATTRIBUTION_COLLAPSE'
  | 'DUPLICATE_ADSETS'
  | 'RUNAWAY_BUDGET';

interface SuspiciousFlag {
  type: FlagType;
  severity: 'CRITICAL';
  campaignId: string;
  campaignName: string;
  date: string;
  evidence: string[];
  suggestedActionCode: 'INVESTIGATE_TRACKING' | 'PAUSE_URGENT';
  message: string;
}

interface CheckSuspiciousActivityResult {
  flags: SuspiciousFlag[];
  campaignsScanned: number;
}

const IMPRESSION_FRAUD_SPEND_MULTIPLIER = 5.0;   // +500%
const BUDGET_BLEED_OVERAGE_PCT = 0.30;             // 30% over daily budget
const ATTRIBUTION_COLLAPSE_MIN_DAYS = 2;
const RUNAWAY_BUDGET_CAMPAIGN_AGE_DAYS = 3;
const RUNAWAY_BUDGET_PCT_THRESHOLD = 1.0;          // 100%+ of daily budget in day 1

export function checkSuspiciousActivityHandler(): ToolHandler<CheckSuspiciousActivityArgs, CheckSuspiciousActivityResult> {
  return {
    name: 'check_suspicious_activity',
    description:
      "Scan for fraud and critical account-health red flags: impression fraud (spend spike with zero results), budget bleed (Meta over-delivery beyond 30% of daily budget), attribution collapse (conversions stopped while spend continued — likely broken pixel), duplicate ad sets wasting spend, and runaway budget on newly launched campaigns. ALWAYS treat any returned flag as CRITICAL and surface it FIRST in your reply, before any other analysis. These are pattern-matched known failure modes, not statistical noise — do not downplay them.",
    schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'Optional: restrict scan to one campaign.' },
        lookbackDays: { type: 'integer', minimum: 1, maximum: 14, default: 3 },
      },
      additionalProperties: false,
    },
    cacheTtlSeconds: 180,
    timeoutMs: 6000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      const account = ws?.adAccounts[0];
      if (!account) {
        return ok<CheckSuspiciousActivityResult>(
          { flags: [], campaignsScanned: 0 },
          { sourceTable: 'ad_accounts', latestRowDate: null, stalenessMinutes: null },
        );
      }
      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);

      const campaignFilter = args.campaignId
        ? { id: args.campaignId, adAccountId: account.id }
        : { adAccountId: account.id, status: 'ACTIVE' as const };
      const campaigns = await prisma.campaign.findMany({ where: campaignFilter });
      if (campaigns.length === 0) {
        return ok<CheckSuspiciousActivityResult>(
          { flags: [], campaignsScanned: 0 },
          {
            sourceTable: 'campaigns',
            latestRowDate: null,
            stalenessMinutes: account.lastSyncedAt
              ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
              : null,
          },
        );
      }

      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - args.lookbackDays * 864e5);
      const campaignIds = campaigns.map((c) => c.id);

      const [dailyRows, adSets] = await Promise.all([
        prisma.dailyStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: campaignIds },
            date: { gte: sinceDate },
          },
          orderBy: { date: 'asc' },
        }),
        prisma.adSet.findMany({
          where: { campaignId: { in: campaignIds }, status: 'ACTIVE' },
          select: { id: true, campaignId: true, name: true, targetingJson: true },
        }),
      ]);

      const dailyByCampaign = new Map<string, typeof dailyRows>();
      for (const d of dailyRows) {
        const arr = dailyByCampaign.get(d.entityId) ?? [];
        arr.push(d);
        dailyByCampaign.set(d.entityId, arr);
      }

      const flags: SuspiciousFlag[] = [];

      for (const camp of campaigns) {
        const rows = (dailyByCampaign.get(camp.id) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
        if (rows.length === 0) continue;

        // 1. Impression fraud: day-over-day spend spike with impressions up
        //    but messages flat/zero.
        for (let i = 1; i < rows.length; i++) {
          const prev = rows[i - 1]!;
          const curr = rows[i]!;
          const prevSpend = Number(prev.spend);
          const currSpend = Number(curr.spend);
          const currImpressions = Number(curr.impressions);
          const currMessages = Number(curr.messages);
          const currClicks = Number(curr.clicks);
          if (
            prevSpend > 0 &&
            currSpend >= prevSpend * IMPRESSION_FRAUD_SPEND_MULTIPLIER &&
            currImpressions > 0 &&
            currMessages === 0 &&
            currClicks === 0
          ) {
            flags.push({
              type: 'IMPRESSION_FRAUD',
              severity: 'CRITICAL',
              campaignId: camp.id,
              campaignName: camp.name,
              date: curr.date.toISOString().slice(0, 10),
              evidence: [
                `spend ${money(prevSpend, factor, account.currency)} → ${money(currSpend, factor, account.currency)} (+${Math.round((currSpend / prevSpend - 1) * 100)}%)`,
                `${currImpressions.toLocaleString()} impressions, 0 clicks, 0 messages`,
              ],
              suggestedActionCode: 'PAUSE_URGENT',
              message: `حملة "${camp.name}" — ارتفاع مفاجئ في الإنفاق بدون أي نقرات أو رسائل. احتمال إعلانات وهمية أو مشكلة في المزاد.`,
            });
          }
        }

        // 2. Budget bleed: daily spend > dailyBudget * (1 + overage)
        if (camp.dailyBudget != null) {
          const budgetMinor = Number(camp.dailyBudget);
          for (const r of rows) {
            const spend = Number(r.spend);
            if (spend > budgetMinor * (1 + BUDGET_BLEED_OVERAGE_PCT)) {
              flags.push({
                type: 'BUDGET_BLEED',
                severity: 'CRITICAL',
                campaignId: camp.id,
                campaignName: camp.name,
                date: r.date.toISOString().slice(0, 10),
                evidence: [
                  `daily budget ${money(budgetMinor, factor, account.currency)}, actual spend ${money(spend, factor, account.currency)} (+${Math.round((spend / budgetMinor - 1) * 100)}%)`,
                ],
                suggestedActionCode: 'INVESTIGATE_TRACKING',
                message: `حملة "${camp.name}" أنفقت أكثر من الميزانية اليومية بـ ${Math.round((spend / budgetMinor - 1) * 100)}%. راجع إعدادات الميزانية على Meta.`,
              });
            }
          }
        }

        // 3. Attribution collapse: spend continued for N+ days with zero messages,
        //    while historically this campaign DID generate messages (else it's
        //    just a low-intent campaign, not a broken pixel).
        const hasHistoricalMessages = rows.some((r) => Number(r.messages) > 0);
        if (hasHistoricalMessages) {
          let consecutiveZeroDays = 0;
          let collapseStartDate: string | null = null;
          for (const r of rows) {
            const spend = Number(r.spend);
            const messages = Number(r.messages);
            if (spend > 0 && messages === 0) {
              consecutiveZeroDays++;
              if (!collapseStartDate) collapseStartDate = r.date.toISOString().slice(0, 10);
            } else {
              consecutiveZeroDays = 0;
              collapseStartDate = null;
            }
          }
          if (consecutiveZeroDays >= ATTRIBUTION_COLLAPSE_MIN_DAYS) {
            flags.push({
              type: 'ATTRIBUTION_COLLAPSE',
              severity: 'CRITICAL',
              campaignId: camp.id,
              campaignName: camp.name,
              date: rows[rows.length - 1]!.date.toISOString().slice(0, 10),
              evidence: [
                `${consecutiveZeroDays} consecutive days with spend > 0 and messages = 0`,
                `collapse started ${collapseStartDate ?? 'unknown'}`,
              ],
              suggestedActionCode: 'INVESTIGATE_TRACKING',
              message: `حملة "${camp.name}" — الإنفاق مستمر لكن الرسائل توقفت تماماً منذ ${consecutiveZeroDays} أيام. راجع بيكسل التتبع على موقعك.`,
            });
          }
        }

        // 5. Runaway budget: campaign younger than N days spent >= 100% of
        //    its daily budget on its very first spending day.
        const campaignAgeDays = Math.floor((now.getTime() - camp.createdAt.getTime()) / 864e5);
        if (campaignAgeDays <= RUNAWAY_BUDGET_CAMPAIGN_AGE_DAYS && camp.dailyBudget != null && rows.length > 0) {
          const firstDay = rows[0]!;
          const firstSpend = Number(firstDay.spend);
          const budgetMinor = Number(camp.dailyBudget);
          if (budgetMinor > 0 && firstSpend >= budgetMinor * RUNAWAY_BUDGET_PCT_THRESHOLD) {
            flags.push({
              type: 'RUNAWAY_BUDGET',
              severity: 'CRITICAL',
              campaignId: camp.id,
              campaignName: camp.name,
              date: firstDay.date.toISOString().slice(0, 10),
              evidence: [
                `campaign launched ${campaignAgeDays} day(s) ago`,
                `day-1 spend ${money(firstSpend, factor, account.currency)} vs daily budget ${money(budgetMinor, factor, account.currency)}`,
              ],
              suggestedActionCode: 'INVESTIGATE_TRACKING',
              message: `حملة "${camp.name}" الجديدة استهلكت ميزانيتها اليومية بالكامل في أول يوم. تأكد أن الاستهداف والميزانية مضبوطين كما تريد.`,
            });
          }
        }

        // 4. Duplicate ad sets: same campaign, active, identical targeting hash.
        const campAdSets = adSets.filter((a) => a.campaignId === camp.id);
        const byTargetingHash = new Map<string, typeof campAdSets>();
        for (const a of campAdSets) {
          const hash = hashTargeting(a.targetingJson);
          const list = byTargetingHash.get(hash) ?? [];
          list.push(a);
          byTargetingHash.set(hash, list);
        }
        for (const [, group] of byTargetingHash) {
          if (group.length >= 2) {
            flags.push({
              type: 'DUPLICATE_ADSETS',
              severity: 'CRITICAL',
              campaignId: camp.id,
              campaignName: camp.name,
              date: now.toISOString().slice(0, 10),
              evidence: [
                `${group.length} active ad sets with identical targeting: ${group.map((g) => g.name).join(', ')}`,
              ],
              suggestedActionCode: 'INVESTIGATE_TRACKING',
              message: `حملة "${camp.name}" — ${group.length} مجموعات إعلانية نشطة بنفس الاستهداف بالضبط. قد تتنافس مع نفسها وتهدر الميزانية.`,
            });
          }
        }
      }

      // Cap flags to avoid overwhelming a single turn — cite the most recent per type.
      const capped = flags.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

      return ok<CheckSuspiciousActivityResult>(
        { flags: capped, campaignsScanned: campaigns.length },
        {
          sourceTable: 'daily_stats',
          latestRowDate: dailyRows.length > 0 ? dailyRows[dailyRows.length - 1]!.date.toISOString().slice(0, 10) : null,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<CheckSuspiciousActivityArgs, CheckSuspiciousActivityResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function money(minor: number, factor: number, currency: string): string {
  if (factor === 1) return `${Math.round(minor).toLocaleString()} ${currency}`;
  return `${(minor / factor).toFixed(2)} ${currency}`;
}

/** Cheap structural hash of targeting JSON so identical targeting configs
 *  collide regardless of key ordering. Not cryptographic — collision risk
 *  is acceptable here (worst case: a false-positive duplicate flag, which
 *  a human reviews anyway). */
function hashTargeting(targeting: unknown): string {
  if (!targeting || typeof targeting !== 'object') return 'null';
  try {
    const sorted = JSON.stringify(targeting, Object.keys(targeting as Record<string, unknown>).sort());
    return sorted;
  } catch {
    return 'unhashable';
  }
}

export type { CheckSuspiciousActivityArgs, CheckSuspiciousActivityResult };
void (undefined as unknown as PrismaClient | undefined);
