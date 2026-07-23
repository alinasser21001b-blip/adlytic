// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/detectAnomaly.ts   —  T8
//
//  Statistical z-score anomaly detection: finds daily metrics that are
//  unusually far from a 30-day rolling baseline for the entity. Enables
//  the proactive-discovery mode (daily brief + real-time alerts) — this
//  tool is what the assistant runs FIRST when the merchant greets it in
//  the morning.
//
//  Method:
//    For each (entity, metric):
//      1. Compute μ + σ over the 30 days BEFORE the lookback window.
//      2. For each day in the lookback window, flag |value - μ| / σ ≥ minAbsZ.
//      3. Direction: 'better' if higher-is-better metric moved up (or lower-
//         is-better moved down); else 'worse'.
//    Skip rule-engine issues — those are surfaced elsewhere.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.4 T8
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

interface DetectAnomalyArgs {
  scope: 'workspace' | 'campaign';
  campaignId?: string;
  lookbackDays: number;
  minAbsZ: number;
}

interface AnomalyRow {
  date: string;
  entityType: 'ACCOUNT' | 'CAMPAIGN';
  entityId: string;
  entityName: string;
  metric: string;
  value: number;
  baselineMean: number;
  baselineStd: number;
  zScore: number;
  direction: 'better' | 'worse';
  severity: 'high' | 'medium' | 'low';
  likelyCause: string | null;
}

interface DetectAnomalyResult {
  anomalies: AnomalyRow[];
  totalChecked: number;
  windowScanned: { since: string; until: string };
  baselineWindow: { since: string; until: string };
}

const BASELINE_DAYS = 30;

/** Metric definitions checked. `key` = daily_stats field or 'ctr'/'cpm'/'cost_per_message'. */
type MetricSpec = { key: string; higherIsBetter: boolean; label: string };
const METRIC_SPECS: MetricSpec[] = [
  { key: 'spend', higherIsBetter: false, label: 'الإنفاق' },
  { key: 'messages', higherIsBetter: true, label: 'الرسائل' },
  { key: 'ctr', higherIsBetter: true, label: 'CTR' },
  { key: 'cpm', higherIsBetter: false, label: 'CPM' },
  { key: 'cost_per_message', higherIsBetter: false, label: 'تكلفة الرسالة' },
];

export function detectAnomalyHandler(): ToolHandler<DetectAnomalyArgs, DetectAnomalyResult> {
  return {
    name: 'detect_anomaly',
    description:
      "Statistical anomaly detection: finds daily metrics that are unusually far from the entity's 30-day rolling baseline. Use PROACTIVELY when the merchant opens the app in the morning ('صباح الخير' greeting) or when they ask 'شنو الجديد'. Returns anomalies with severity (high/medium/low), direction (better/worse), z-score, and a likelyCause hint when we can infer one. Does NOT return known rule-engine issues (those come from get_campaign_details.topIssues). Scope 'workspace' checks the account-level metrics; scope 'campaign' checks a specific campaign — provide campaignId in that case.",
    schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['workspace', 'campaign'], default: 'workspace' },
        campaignId: { type: 'string', description: "Required when scope='campaign'" },
        lookbackDays: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          default: 7,
          description: 'How many recent days to scan for anomalies. Baseline is always the 30 days BEFORE this window.',
        },
        minAbsZ: {
          type: 'number',
          minimum: 1.5,
          maximum: 5,
          default: 2.0,
          description: 'Minimum |z-score| to report. 2.0 = ~5% chance under normal distribution.',
        },
      },
      additionalProperties: false,
    },
    cacheTtlSeconds: 300,
    timeoutMs: 6000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      if (args.scope === 'campaign' && !args.campaignId) {
        return fail('INVALID_INPUT', "campaignId is required when scope='campaign'", {
          field: 'campaignId', retryable: true,
        });
      }

      // Resolve target entities: either the workspace's ad account or a single campaign.
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      if (!ws) return fail('NOT_FOUND', 'Workspace not found', { retryable: false });
      const account = ws.adAccounts[0];
      if (!account) {
        return ok<DetectAnomalyResult>(
          { anomalies: [], totalChecked: 0, windowScanned: { since: '', until: '' }, baselineWindow: { since: '', until: '' } },
          { sourceTable: 'ad_accounts', latestRowDate: null, stalenessMinutes: null },
        );
      }
      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);

      const targets: Array<{ entityType: EntityType; entityId: string; name: string }> = [];
      if (args.scope === 'workspace') {
        targets.push({ entityType: EntityType.ACCOUNT, entityId: account.id, name: account.name });
      } else {
        const camp = await prisma.campaign.findFirst({
          where: { id: args.campaignId!, adAccount: { workspaceId } },
        });
        if (!camp) {
          return fail('NOT_FOUND', `Campaign "${args.campaignId}" not found in this workspace`, {
            field: 'campaignId', retryable: false,
          });
        }
        targets.push({ entityType: EntityType.CAMPAIGN, entityId: camp.id, name: camp.name });
      }

      const now = new Date();
      const windowUntil = utcMidnight(now.getTime());
      const windowSince = utcMidnight(now.getTime() - (args.lookbackDays - 1) * 864e5);
      const baselineUntil = utcMidnight(now.getTime() - args.lookbackDays * 864e5);
      const baselineSince = utcMidnight(now.getTime() - (args.lookbackDays + BASELINE_DAYS) * 864e5);

      const rows = await prisma.dailyStat.findMany({
        where: {
          entityType: { in: targets.map((t) => t.entityType) },
          entityId: { in: targets.map((t) => t.entityId) },
          date: { gte: baselineSince, lte: windowUntil },
        },
        orderBy: { date: 'asc' },
      });

      const anomalies: AnomalyRow[] = [];
      let totalChecked = 0;

      for (const target of targets) {
        const targetRows = rows.filter(
          (r) => r.entityType === target.entityType && r.entityId === target.entityId,
        );
        // Split by phase
        const baselineRows = targetRows.filter(
          (r) => r.date.getTime() >= baselineSince.getTime() && r.date.getTime() < windowSince.getTime(),
        );
        const scanRows = targetRows.filter((r) => r.date.getTime() >= windowSince.getTime());
        if (baselineRows.length < 7) continue;   // baseline too thin for a meaningful σ

        for (const spec of METRIC_SPECS) {
          const baselineValues = baselineRows
            .map((r) => extractMetric(r, spec.key, factor))
            .filter((v): v is number => v != null);
          if (baselineValues.length < 7) continue;
          const mean = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
          const variance = baselineValues.reduce((a, v) => a + (v - mean) ** 2, 0) / baselineValues.length;
          const std = Math.sqrt(variance);
          if (std <= 0) continue;

          for (const day of scanRows) {
            totalChecked++;
            const value = extractMetric(day, spec.key, factor);
            if (value == null) continue;
            const z = (value - mean) / std;
            if (Math.abs(z) < args.minAbsZ) continue;

            const wentUp = z > 0;
            const isGoodDirection = wentUp === spec.higherIsBetter;
            const severity: AnomalyRow['severity'] =
              Math.abs(z) >= 3 ? 'high' : Math.abs(z) >= 2.5 ? 'medium' : 'low';

            anomalies.push({
              date: day.date.toISOString().slice(0, 10),
              entityType: target.entityType as 'ACCOUNT' | 'CAMPAIGN',
              entityId: target.entityId,
              entityName: target.name,
              metric: spec.key,
              value: +value.toFixed(4),
              baselineMean: +mean.toFixed(4),
              baselineStd: +std.toFixed(4),
              zScore: +z.toFixed(2),
              direction: isGoodDirection ? 'better' : 'worse',
              severity,
              likelyCause: guessLikelyCause(spec.key, day.date, wentUp),
            });
          }
        }
      }

      // Sort by |z| desc so highest-severity ones surface first.
      anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

      return ok<DetectAnomalyResult>(
        {
          anomalies,
          totalChecked,
          windowScanned: {
            since: windowSince.toISOString().slice(0, 10),
            until: windowUntil.toISOString().slice(0, 10),
          },
          baselineWindow: {
            since: baselineSince.toISOString().slice(0, 10),
            until: baselineUntil.toISOString().slice(0, 10),
          },
        },
        {
          sourceTable: 'daily_stats',
          latestRowDate: rows.length > 0 ? rows[rows.length - 1]!.date.toISOString().slice(0, 10) : null,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<DetectAnomalyArgs, DetectAnomalyResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function extractMetric(
  row: { spend: bigint; messages: bigint; ctr: number | null; cpm: number | null; impressions: bigint; clicks: bigint },
  key: string,
  factor: number,
): number | null {
  const spend = Number(row.spend);
  const impressions = Number(row.impressions);
  const clicks = Number(row.clicks);
  const messages = Number(row.messages);
  const spendMajor = factor === 1 ? spend : spend / factor;
  switch (key) {
    case 'spend': return spend;
    case 'messages': return messages;
    case 'ctr': return impressions > 0 ? clicks / impressions * 100 : row.ctr ?? null;
    case 'cpm': return impressions > 0 ? spendMajor / impressions * 1000 : row.cpm ?? null;
    case 'cost_per_message': return messages > 0 ? spendMajor / messages : null;
    default: return null;
  }
}

/** Rough heuristic to name a likely cause. Not deterministic knowledge — just
 *  a hint the LLM can weigh. Returns null when no reasonable guess. */
function guessLikelyCause(metric: string, date: Date, wentUp: boolean): string | null {
  const dayOfWeek = date.getUTCDay();   // 0 = Sunday, 5 = Friday
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  if (metric === 'spend' && wentUp) {
    if (isWeekend) return 'إنفاق مرتفع في عطلة نهاية الأسبوع — طبيعي أحياناً';
    return null;
  }
  if (metric === 'messages' && !wentUp) {
    if (isWeekend) return 'يوم عطلة عادةً يقلل الرسائل — راقب لكن قد لا يكون مشكلة';
    return null;
  }
  if ((metric === 'cpm' || metric === 'cost_per_message') && wentUp) {
    return 'ارتفاع مفاجئ في التكلفة — احتمالات: ضغط المزاد، إعلانات تعبت، جمهور مشبع';
  }
  return null;
}

export type { DetectAnomalyArgs, DetectAnomalyResult };
void (undefined as unknown as PrismaClient | undefined);
