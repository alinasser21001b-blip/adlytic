// ════════════════════════════════════════════════════════════════════════
//  src/adAssessor/adlyticContext.ts
//
//  Assembles live Adlytic account data for advanced ad assessment:
//  DailyStat metrics, health, diagnoses, brain narrations, creatives,
//  and a lightweight account self-benchmark. Keeps the assessor grounded
//  in the merchant's real performance instead of generic templates.
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import { resolveCurrencyMinorFactor } from '../lib/currency';
import { diagnose, type Diagnosis } from '../engines/rules/diagnose';
import type { Signals } from '../engines/rules/types';
import type { IssueRecord } from '../repositories/detectedIssuesRepo';
import { INDUSTRIES } from './data/meta-metrics';
import { campaignGoalSchema, type CampaignGoal } from './schemas';

export interface AdlyticMetricSnapshot {
  windowDays: number;
  spendMajor: number;
  impressions: number;
  clicks: number;
  messages: number;
  purchases: number;
  leads: number;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
  costPerMessage: number | null;
  currency: string;
}

export interface AdlyticCreativePrefill {
  adId: string;
  adName: string;
  primaryText: string | null;
  headline: string | null;
  callToActionType: string | null;
  thumbnailUrl: string | null;
}

export interface AdlyticBrainInsight {
  action: string;
  priority: string;
  arabicTitle: string | null;
  arabicNarration: string | null;
  tickDate: string;
}

export interface AdlyticSelfBenchmark {
  totalAdsAnalyzed: number;
  accountAvgCtr: number | null;
  winningPatterns: string[];
  recommendations: string[];
}

export interface AdlyticAssessmentContext {
  workspaceId: string;
  campaignId: string;
  campaignName: string;
  objective: string | null;
  status: string;
  industryHint: string | null;
  goalHint: CampaignGoal | null;
  currency: string;
  currencyMinorFactor: number;
  metrics: AdlyticMetricSnapshot;
  healthScore: number | null;
  healthBand: string | null;
  diagnoses: Array<{ title: string; explanation: string; action: string; severity: string }>;
  brain: AdlyticBrainInsight | null;
  creative: AdlyticCreativePrefill | null;
  selfBenchmark: AdlyticSelfBenchmark | null;
  source: 'adlytic';
}

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

function toMajor(minor: number, factor: number): number {
  const f = factor > 0 ? factor : 1;
  return minor / f;
}

function healthBandFromScore(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'attention';
  return 'poor';
}

function mapObjectiveToGoal(objective: string | null | undefined): CampaignGoal | null {
  const o = String(objective || '').toUpperCase();
  if (!o) return null;
  if (o.includes('SALES') || o.includes('CONVERSION') || o.includes('CATALOG')) return 'sales';
  if (o.includes('TRAFFIC') || o.includes('LINK_CLICK')) return 'traffic';
  if (o.includes('AWARENESS') || o.includes('REACH') || o.includes('VIDEO')) return 'awareness';
  if (o.includes('LEAD') || o.includes('MESSAGE')) return 'leads';
  if (o.includes('ENGAGEMENT')) return 'traffic';
  return null;
}

function mapProfileToAssessorIndustry(profileName: string | null | undefined): string | null {
  if (!profileName) return null;
  const n = profileName.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    furniture: 'ecommerce',
    homewares: 'ecommerce',
    homewares_furniture_interiors: 'ecommerce',
    cosmetics: 'fashion',
    beauty: 'fashion',
    beauty_cosmetics: 'fashion',
    fashion: 'fashion',
    apparel: 'fashion',
    fashion_apparel: 'fashion',
    ecommerce: 'ecommerce',
    saas: 'saas',
    b2b_saas: 'saas',
    finance: 'finance',
    insurance: 'finance',
    health: 'healthcare',
    wellness: 'healthcare',
    education: 'education',
    real_estate: 'real_estate',
    food: 'food_beverage',
    food_beverage: 'food_beverage',
    travel: 'travel',
    automotive: 'automotive',
    entertainment: 'entertainment',
    local_business: 'local_business',
  };
  const mapped = map[n] || null;
  if (mapped && INDUSTRIES.some((i) => i.value === mapped)) return mapped;
  return INDUSTRIES.some((i) => i.value === n) ? n : null;
}

function readNarration(json: unknown): { arabicTitle: string | null; arabicNarration: string | null } {
  if (!json || typeof json !== 'object') return { arabicTitle: null, arabicNarration: null };
  const obj = json as Record<string, unknown>;
  return {
    arabicTitle: typeof obj.arabicTitle === 'string' ? obj.arabicTitle : null,
    arabicNarration: typeof obj.arabicNarration === 'string' ? obj.arabicNarration : null,
  };
}

async function aggregateCampaignMetrics(
  prisma: PrismaClient,
  campaignId: string,
  windowDays: number,
  currency: string,
  minorFactor: number,
): Promise<AdlyticMetricSnapshot> {
  const since = new Date(Date.now() - windowDays * 86400 * 1000);
  const rows = await prisma.dailyStat.findMany({
    where: { entityType: EntityType.CAMPAIGN, entityId: campaignId, date: { gte: since } },
  });

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let messages = 0;
  let purchases = 0;
  let leads = 0;
  let reach = 0;
  let freqWeighted = 0;
  let freqWeight = 0;

  for (const r of rows) {
    const s = Number(r.spend) || 0;
    const imp = Number(r.impressions) || 0;
    spend += s;
    impressions += imp;
    clicks += Number(r.clicks) || 0;
    messages += Number(r.messages) || 0;
    purchases += Number(r.purchases) || 0;
    leads += Number(r.leads) || 0;
    reach += Number(r.reach) || 0;
    if (r.frequency != null && imp > 0) {
      freqWeighted += Number(r.frequency) * imp;
      freqWeight += imp;
    }
  }

  const spendMajor = toMajor(spend, minorFactor);
  const ctr = safeDiv(clicks * 100, impressions);
  const cpm = impressions > 0 ? safeDiv(spendMajor * 1000, impressions) : null;
  const frequency = freqWeight > 0 ? freqWeighted / freqWeight : safeDiv(impressions, reach);
  const costPerMessage = messages > 0 ? safeDiv(spendMajor, messages) : null;

  return {
    windowDays,
    spendMajor: +spendMajor.toFixed(minorFactor === 1 ? 0 : 2),
    impressions,
    clicks,
    messages,
    purchases,
    leads,
    ctr: ctr != null ? +ctr.toFixed(2) : null,
    cpm: cpm != null ? +cpm.toFixed(2) : null,
    frequency: frequency != null ? +frequency.toFixed(2) : null,
    costPerMessage: costPerMessage != null ? +costPerMessage.toFixed(2) : null,
    currency,
  };
}

async function loadSelfBenchmark(
  prisma: PrismaClient,
  adAccountId: string,
  windowDays: number,
): Promise<AdlyticSelfBenchmark | null> {
  const since = new Date(Date.now() - windowDays * 86400 * 1000);
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      adSets: {
        select: {
          ads: {
            select: {
              id: true,
              creative: {
                select: {
                  primaryText: true,
                  callToActionType: true,
                  videoId: true,
                },
              },
            },
            take: 8,
          },
        },
        take: 5,
      },
    },
    take: 20,
  });

  const adMeta = new Map<string, { format: string; textLen: string; cta: string }>();
  for (const camp of campaigns) {
    for (const set of camp.adSets) {
      for (const ad of set.ads) {
        const body = ad.creative?.primaryText || '';
        adMeta.set(ad.id, {
          format: ad.creative?.videoId ? 'فيديو' : 'صورة',
          textLen: body.length < 80 ? 'قصير' : body.length < 200 ? 'متوسط' : 'طويل',
          cta: ad.creative?.callToActionType || 'بدون CTA',
        });
      }
    }
  }

  const adIds = Array.from(adMeta.keys());
  if (adIds.length < 3) return null;

  const stats = await prisma.dailyStat.findMany({
    where: { entityType: EntityType.AD, entityId: { in: adIds }, date: { gte: since } },
    select: { entityId: true, impressions: true, clicks: true },
  });

  const agg = new Map<string, { impressions: number; clicks: number }>();
  for (const s of stats) {
    const cur = agg.get(s.entityId) || { impressions: 0, clicks: 0 };
    cur.impressions += Number(s.impressions) || 0;
    cur.clicks += Number(s.clicks) || 0;
    agg.set(s.entityId, cur);
  }

  type Row = { ctr: number; format: string; textLen: string; cta: string };
  const rows: Row[] = [];
  for (const [adId, meta] of adMeta) {
    const a = agg.get(adId);
    if (!a || a.impressions < 200) continue;
    rows.push({
      ctr: (a.clicks * 100) / a.impressions,
      format: meta.format,
      textLen: meta.textLen,
      cta: meta.cta,
    });
  }

  if (rows.length < 3) return null;

  const avgCtr = rows.reduce((a, r) => a + r.ctr, 0) / rows.length;
  const byFeature = (key: 'format' | 'textLen' | 'cta', label: string) => {
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const k = r[key];
      const arr = groups.get(k) || [];
      arr.push(r.ctr);
      groups.set(k, arr);
    }
    const out: string[] = [];
    for (const [value, vals] of groups) {
      if (vals.length < 2) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const delta = ((avg - avgCtr) / Math.max(avgCtr, 0.01)) * 100;
      if (delta >= 8) {
        out.push(`${label} «${value}» أعلى من متوسط حسابك بـ ${delta.toFixed(0)}%`);
      }
    }
    return out;
  };

  const winningPatterns = [
    ...byFeature('format', 'التنسيق'),
    ...byFeature('textLen', 'طول النص'),
    ...byFeature('cta', 'الدعوة للإجراء'),
  ].slice(0, 4);

  const recommendations: string[] = winningPatterns.length
    ? ['استلهم من أنماط إعلاناتك الفائزة داخل الحساب قبل نسخ اتجاهات السوق العامة.']
    : ['لا يوجد نمط فائز واضح بعد — ركّز على اختبار افتتاحية أقوى وقياس التفاعل أسبوعياً.'];

  return {
    totalAdsAnalyzed: rows.length,
    accountAvgCtr: +avgCtr.toFixed(2),
    winningPatterns,
    recommendations,
  };
}

export async function listCampaignsForAssessor(
  prisma: PrismaClient,
  adAccountId: string,
): Promise<Array<{ id: string; name: string; objective: string | null; status: string; spendWindowMinor: number }>> {
  const since = new Date(Date.now() - 30 * 86400 * 1000);
  const camps = await prisma.campaign.findMany({
    where: { adAccountId },
    select: { id: true, name: true, objective: true, status: true },
    orderBy: { updatedAt: 'desc' },
    take: 80,
  });

  const ids = camps.map((c) => c.id);
  const stats = ids.length
    ? await prisma.dailyStat.groupBy({
        by: ['entityId'],
        where: {
          entityType: EntityType.CAMPAIGN,
          entityId: { in: ids },
          date: { gte: since },
        },
        _sum: { spend: true },
      })
    : [];
  const spendById = new Map(stats.map((s) => [s.entityId, Number(s._sum.spend || 0)]));

  return camps
    .map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      spendWindowMinor: spendById.get(c.id) || 0,
    }))
    .sort((a, b) => b.spendWindowMinor - a.spendWindowMinor);
}

export async function assembleAdlyticAssessmentContext(opts: {
  prisma: PrismaClient;
  workspaceId: string;
  adAccountId: string;
  campaignId: string;
  adId?: string | null;
  windowDays?: number;
}): Promise<AdlyticAssessmentContext | null> {
  const { prisma, workspaceId, adAccountId, campaignId } = opts;
  const windowDays = Math.max(7, Math.min(90, opts.windowDays ?? 30));

  const [campaign, account, workspace] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: campaignId, adAccountId },
      select: { id: true, name: true, objective: true, status: true },
    }),
    prisma.adAccount.findUnique({
      where: { id: adAccountId },
      select: { currency: true, currencyMinorFactor: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        industryProfile: { select: { name: true } },
      },
    }),
  ]);

  if (!campaign || !account) return null;

  const currency = account.currency || 'USD';
  const minorFactor = resolveCurrencyMinorFactor(currency, account.currencyMinorFactor);

  const metrics = await aggregateCampaignMetrics(
    prisma,
    campaign.id,
    windowDays,
    currency,
    minorFactor,
  );

  const health =
    (await prisma.healthScore.findFirst({
      where: { entityType: EntityType.CAMPAIGN, entityId: campaign.id },
      orderBy: { date: 'desc' },
    })) ||
    (await prisma.healthScore.findFirst({
      where: { entityType: EntityType.ACCOUNT, entityId: adAccountId },
      orderBy: { date: 'desc' },
    }));

  const sinceIssues = new Date(Date.now() - windowDays * 86400 * 1000);
  const issues = await prisma.detectedIssue.findMany({
    where: {
      OR: [
        { entityType: EntityType.CAMPAIGN, entityId: campaign.id },
        { entityType: EntityType.ACCOUNT, entityId: adAccountId },
      ],
      date: { gte: sinceIssues },
    },
    orderBy: { date: 'desc' },
    take: 12,
  });

  // Deduplicate by issueCode (keep highest severity / newest).
  const byCode = new Map<string, (typeof issues)[number]>();
  for (const iss of issues) {
    if (!byCode.has(iss.issueCode)) byCode.set(iss.issueCode, iss);
  }

  const issueRecords: IssueRecord[] = Array.from(byCode.values()).map((iss) => ({
    issueCode: iss.issueCode,
    severity: iss.severity,
    evidence:
      iss.evidenceJson && typeof iss.evidenceJson === 'object'
        ? (iss.evidenceJson as Record<string, unknown>)
        : {},
  }));

  const signals: Signals = {
    ctrTrend: null,
    cpmTrend: null,
    frequencyTrend: null,
    resultsTrend: null,
    spendTrend: null,
    currentCtr: metrics.ctr,
    currentFrequency: metrics.frequency,
    currentCpm: metrics.cpm != null ? metrics.cpm * minorFactor : null,
    currentResults: metrics.messages + metrics.purchases + metrics.leads,
    currentSpend: metrics.spendMajor * minorFactor,
  };

  let diagnoses: Diagnosis[] = [];
  try {
    diagnoses = diagnose(issueRecords, signals).slice(0, 4);
  } catch {
    diagnoses = [];
  }

  const brainRow = await prisma.campaignBrainSnapshot.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { tickDate: 'desc' },
  });
  let brain: AdlyticBrainInsight | null = null;
  if (brainRow) {
    const narr = readNarration(brainRow.narrationJson);
    brain = {
      action: brainRow.action,
      priority: brainRow.priority,
      arabicTitle: narr.arabicTitle,
      arabicNarration: narr.arabicNarration,
      tickDate: brainRow.tickDate.toISOString().slice(0, 10),
    };
  }

  let creative: AdlyticCreativePrefill | null = null;
  if (opts.adId) {
    const ad = await prisma.ad.findFirst({
      where: {
        id: opts.adId,
        adSet: { campaignId: campaign.id },
      },
      include: { creative: true },
    });
    if (ad?.creative) {
      creative = {
        adId: ad.id,
        adName: ad.name,
        primaryText: ad.creative.primaryText,
        headline: ad.creative.headline,
        callToActionType: ad.creative.callToActionType,
        thumbnailUrl: ad.creative.thumbnailUrl,
      };
    }
  }
  if (!creative) {
    const campAds = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: {
        adSets: {
          select: {
            ads: {
              include: { creative: true },
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
          take: 5,
        },
      },
    });
    const first = campAds?.adSets.flatMap((s) => s.ads).find((a) => a.creative);
    if (first?.creative) {
      creative = {
        adId: first.id,
        adName: first.name,
        primaryText: first.creative.primaryText,
        headline: first.creative.headline,
        callToActionType: first.creative.callToActionType,
        thumbnailUrl: first.creative.thumbnailUrl,
      };
    }
  }

  let selfBenchmark: AdlyticSelfBenchmark | null = null;
  try {
    selfBenchmark = await loadSelfBenchmark(prisma, adAccountId, windowDays);
  } catch (e) {
    console.warn('[ad-assessor] self-benchmark skipped:', e);
  }

  const industryHint = mapProfileToAssessorIndustry(workspace?.industryProfile?.name);
  const goalHintRaw = mapObjectiveToGoal(campaign.objective);
  const goalParsed = goalHintRaw ? campaignGoalSchema.safeParse(goalHintRaw) : null;

  return {
    workspaceId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    industryHint,
    goalHint: goalParsed?.success ? goalParsed.data : null,
    currency,
    currencyMinorFactor: minorFactor,
    metrics,
    healthScore: health?.score ?? null,
    healthBand: healthBandFromScore(health?.score ?? null),
    diagnoses: diagnoses.map((d) => ({
      title: d.name,
      explanation: d.narrative,
      action: d.action,
      severity: d.confidence >= 0.75 ? 'HIGH' : 'MEDIUM',
    })),
    brain,
    creative,
    selfBenchmark,
    source: 'adlytic',
  };
}

/** Format Adlytic context as a prompt block for the LLM. */
export function formatAdlyticContextForPrompt(ctx: AdlyticAssessmentContext): string {
  const m = ctx.metrics;
  const lines: string[] = [
    '## Adlytic live account context (GROUND TRUTH — prefer over generic benchmarks)',
    `- Campaign: ${ctx.campaignName}`,
    `- Status: ${ctx.status}`,
    `- Window: last ${m.windowDays} days`,
    `- Currency: ${m.currency}`,
    `- Spend: ${m.spendMajor} ${m.currency}`,
    `- Impressions: ${m.impressions}`,
    `- Clicks: ${m.clicks}`,
    `- Messages/results: ${m.messages}`,
    `- Purchases: ${m.purchases}`,
    `- Leads: ${m.leads}`,
    `- CTR: ${m.ctr != null ? m.ctr + '%' : 'n/a'}`,
    `- CPM: ${m.cpm != null ? m.cpm + ' ' + m.currency : 'n/a'}`,
    `- Frequency: ${m.frequency != null ? m.frequency : 'n/a'}`,
    `- Cost per message: ${m.costPerMessage != null ? m.costPerMessage + ' ' + m.currency : 'n/a'}`,
  ];

  if (ctx.healthScore != null) {
    lines.push(`- Health score: ${ctx.healthScore}/100 (${ctx.healthBand || 'n/a'})`);
  }

  if (ctx.diagnoses.length) {
    lines.push('- Active diagnoses (Arabic, already merchant-facing):');
    for (const d of ctx.diagnoses) {
      lines.push(`  • [${d.severity}] ${d.title}: ${d.explanation}`);
      lines.push(`    Action: ${d.action}`);
    }
  }

  if (ctx.brain) {
    lines.push('- Latest Adlytic brain insight:');
    lines.push(`  • Priority: ${ctx.brain.priority} @ ${ctx.brain.tickDate}`);
    if (ctx.brain.arabicTitle) lines.push(`  • Title: ${ctx.brain.arabicTitle}`);
    if (ctx.brain.arabicNarration) lines.push(`  • Narration: ${ctx.brain.arabicNarration}`);
  }

  if (ctx.selfBenchmark) {
    lines.push('- Account self-benchmark (your ads vs each other):');
    lines.push(`  • Ads analyzed: ${ctx.selfBenchmark.totalAdsAnalyzed}`);
    if (ctx.selfBenchmark.accountAvgCtr != null) {
      lines.push(`  • Account avg CTR: ${ctx.selfBenchmark.accountAvgCtr}%`);
    }
    for (const p of ctx.selfBenchmark.winningPatterns) {
      lines.push(`  • Winning pattern: ${p}`);
    }
    for (const r of ctx.selfBenchmark.recommendations) {
      lines.push(`  • Rec: ${r}`);
    }
  }

  lines.push(
    '',
    'Rules for using this context:',
    '- performanceInsight MUST reference these real numbers (not invented benchmarks).',
    '- actionItems should address diagnoses / brain insight when present.',
    '- Prefer account self-benchmark patterns over Ad Library for performance claims.',
    '- Keep Arabic merchant-friendly; never expose enum codes like KEEP_COLLECTING.',
  );

  return lines.join('\n');
}
