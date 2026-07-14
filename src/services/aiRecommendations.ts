// ════════════════════════════════════════════════════════════════════════
//  src/services/aiRecommendations.ts
//
//  AI-powered recommendations built from Brain snapshot patterns.
//  Analyzes the last 7 days of Brain ticks across all campaigns to
//  generate strategic, actionable Arabic recommendations the merchant
//  can act on immediately.
//
//  Pipeline:
//    1. Gather Brain snapshots from last 7 days
//    2. Group by pattern (scaling, dying, stable, etc.)
//    3. Compute aggregate stats deterministically
//    4. If AI is available: generate Arabic narrative recommendations
//    5. If AI is unavailable: use deterministic template recommendations
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { generateStructured, isAIAvailable } from './ai/aiService';

export interface AIRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'scale' | 'fix' | 'pause' | 'watch' | 'optimize';
  titleAr: string;
  bodyAr: string;
  campaignIds: string[];
  confidence: number;
}

export interface AIRecommendationsDTO {
  recommendations: AIRecommendation[];
  generatedAt: string;
  source: 'ai' | 'deterministic';
}

export async function computeAIRecommendations(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<AIRecommendationsDTO> {
  const since = daysAgo(7);

  const snapshots = await prisma.campaignBrainSnapshot.findMany({
    where: {
      workspaceId,
      tickDate: { gte: since },
    },
    orderBy: { tickDate: 'desc' },
    select: {
      campaignId: true,
      action: true,
      priority: true,
      patternSignature: true,
      finalScore: true,
      payload: true,
      tickDate: true,
    },
  });

  if (snapshots.length === 0) {
    return { recommendations: [], generatedAt: new Date().toISOString(), source: 'deterministic' };
  }

  const patterns = analyzePatterns(snapshots);

  if (isAIAvailable()) {
    try {
      const aiRecs = await generateAIRecommendations(patterns);
      if (aiRecs.length > 0) {
        return { recommendations: aiRecs, generatedAt: new Date().toISOString(), source: 'ai' };
      }
    } catch (err) {
      console.warn('[ai-recommendations] AI generation failed, using deterministic:', err);
    }
  }

  const deterministicRecs = buildDeterministicRecommendations(patterns);
  return { recommendations: deterministicRecs, generatedAt: new Date().toISOString(), source: 'deterministic' };
}

interface PatternGroup {
  pattern: string;
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    action: string;
    priority: string;
    score: number;
    latestTick: Date;
  }>;
  avgScore: number;
}

interface PatternAnalysis {
  scalable: PatternGroup;
  dying: PatternGroup;
  stable: PatternGroup;
  unstable: PatternGroup;
  collecting: PatternGroup;
  totalCampaigns: number;
  criticalCount: number;
  highCount: number;
}

function analyzePatterns(snapshots: Array<{
  campaignId: string;
  action: string;
  priority: string;
  patternSignature: string;
  finalScore: number;
  payload: unknown;
  tickDate: Date;
}>): PatternAnalysis {
  const latestByCampaign = new Map<string, typeof snapshots[0]>();
  for (const s of snapshots) {
    const existing = latestByCampaign.get(s.campaignId);
    if (!existing || s.tickDate > existing.tickDate) {
      latestByCampaign.set(s.campaignId, s);
    }
  }

  const groups: Record<string, PatternGroup> = {
    SCALABLE_BEAST: { pattern: 'SCALABLE_BEAST', campaigns: [], avgScore: 0 },
    DYING_CREATIVE: { pattern: 'DYING_CREATIVE', campaigns: [], avgScore: 0 },
    STABLE_PERFORMER: { pattern: 'STABLE_PERFORMER', campaigns: [], avgScore: 0 },
    UNSTABLE_NOISE: { pattern: 'UNSTABLE_NOISE', campaigns: [], avgScore: 0 },
    UNDER_OBSERVATION: { pattern: 'UNDER_OBSERVATION', campaigns: [], avgScore: 0 },
  };

  let criticalCount = 0;
  let highCount = 0;

  for (const [, snap] of latestByCampaign) {
    const payload = snap.payload as Record<string, unknown>;
    const campaignName = String(payload['campaignName'] ?? '');
    const group = groups[snap.patternSignature] ?? groups['UNDER_OBSERVATION']!;
    group.campaigns.push({
      campaignId: snap.campaignId,
      campaignName,
      action: snap.action,
      priority: snap.priority,
      score: snap.finalScore,
      latestTick: snap.tickDate,
    });
    if (snap.priority === 'CRITICAL') criticalCount++;
    if (snap.priority === 'HIGH') highCount++;
  }

  for (const g of Object.values(groups)) {
    if (g.campaigns.length > 0) {
      g.avgScore = Math.round(g.campaigns.reduce((a, c) => a + c.score, 0) / g.campaigns.length);
    }
  }

  return {
    scalable: groups['SCALABLE_BEAST']!,
    dying: groups['DYING_CREATIVE']!,
    stable: groups['STABLE_PERFORMER']!,
    unstable: groups['UNSTABLE_NOISE']!,
    collecting: groups['UNDER_OBSERVATION']!,
    totalCampaigns: latestByCampaign.size,
    criticalCount,
    highCount,
  };
}

async function generateAIRecommendations(patterns: PatternAnalysis): Promise<AIRecommendation[]> {
  const summary = {
    totalCampaigns: patterns.totalCampaigns,
    criticalCount: patterns.criticalCount,
    highCount: patterns.highCount,
    scalable: patterns.scalable.campaigns.map(c => ({ name: c.campaignName, score: c.score, action: c.action })),
    dying: patterns.dying.campaigns.map(c => ({ name: c.campaignName, score: c.score, action: c.action })),
    stable: patterns.stable.campaigns.map(c => ({ name: c.campaignName, score: c.score })),
    unstable: patterns.unstable.campaigns.map(c => ({ name: c.campaignName, score: c.score, action: c.action })),
    collecting: patterns.collecting.campaigns.map(c => ({ name: c.campaignName })),
  };

  const system = [
    'You are an Arabic-speaking Meta Ads advisor generating weekly strategic recommendations for a merchant.',
    'Based on the campaign pattern analysis below, generate 3-5 prioritized recommendations.',
    'Each recommendation should: (1) address a specific pattern, (2) name campaigns, (3) give one clear action.',
    'RULES:',
    '- Write in Modern Standard Arabic with Iraqi/Gulf tone',
    '- Be specific: name campaigns, cite scores where relevant',
    '- Categories: scale (increase budget), fix (refresh creative), pause (stop spending), watch (monitor), optimize (adjust targeting)',
    '- Never invent campaign names not in the data',
    '- If scalable campaigns exist: recommend budget increase',
    '- If dying campaigns exist: recommend creative refresh or pause',
    '- If unstable campaigns exist: recommend monitoring',
    'Output JSON array: [{ "priority": "high"|"medium"|"low", "category": "scale"|"fix"|"pause"|"watch"|"optimize", "titleAr": string, "bodyAr": string, "campaignNames": string[] }]',
  ].join('\n');

  const result = await generateStructured<Array<{
    priority: string;
    category: string;
    titleAr: string;
    bodyAr: string;
    campaignNames: string[];
  }>>({
    task: 'report',
    system,
    messages: [{ role: 'user', content: JSON.stringify(summary) }],
    parse: (raw) => {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error('Expected array');
      return arr;
    },
    maxTokens: 1024,
    timeoutMs: 20_000,
    jsonMode: true,
  });

  const nameToId = new Map<string, string>();
  for (const group of [patterns.scalable, patterns.dying, patterns.stable, patterns.unstable, patterns.collecting]) {
    for (const c of group.campaigns) {
      nameToId.set(c.campaignName, c.campaignId);
    }
  }

  return result.data.slice(0, 5).map((r, i) => ({
    id: `ai-rec-${i}`,
    priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium') as AIRecommendation['priority'],
    category: (['scale', 'fix', 'pause', 'watch', 'optimize'].includes(r.category) ? r.category : 'optimize') as AIRecommendation['category'],
    titleAr: r.titleAr,
    bodyAr: r.bodyAr,
    campaignIds: (r.campaignNames ?? []).map(n => nameToId.get(n) ?? '').filter(Boolean),
    confidence: 0.8,
  }));
}

function buildDeterministicRecommendations(patterns: PatternAnalysis): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  if (patterns.scalable.campaigns.length > 0) {
    const names = patterns.scalable.campaigns.slice(0, 3).map(c => c.campaignName);
    recs.push({
      id: 'det-scale',
      priority: 'high',
      category: 'scale',
      titleAr: 'زيادة ميزانية الحملات الناجحة',
      bodyAr: `لديك ${patterns.scalable.campaigns.length} حملة تحقق أداءً ممتازاً (${names.join('، ')}). زِد ميزانيتها تدريجياً 20-30% للاستفادة من زخمها الحالي.`,
      campaignIds: patterns.scalable.campaigns.map(c => c.campaignId),
      confidence: 0.9,
    });
  }

  if (patterns.dying.campaigns.length > 0) {
    const names = patterns.dying.campaigns.slice(0, 3).map(c => c.campaignName);
    const action = patterns.dying.campaigns.some(c => c.priority === 'CRITICAL') ? 'pause' : 'fix';
    recs.push({
      id: 'det-dying',
      priority: 'high',
      category: action,
      titleAr: action === 'pause' ? 'إيقاف حملات منخفضة الأداء' : 'تجديد إبداعات متعبة',
      bodyAr: action === 'pause'
        ? `${patterns.dying.campaigns.length} حملة تنفق دون نتائج كافية (${names.join('، ')}). أوقفها مؤقتاً وأعد تصميم الإبداع قبل إعادة التشغيل.`
        : `${patterns.dying.campaigns.length} حملة يتراجع تفاعلها (${names.join('، ')}). جدّد الصور والنصوص الإعلانية — الجمهور اعتاد على الإبداع الحالي.`,
      campaignIds: patterns.dying.campaigns.map(c => c.campaignId),
      confidence: 0.9,
    });
  }

  if (patterns.unstable.campaigns.length > 0) {
    const names = patterns.unstable.campaigns.slice(0, 2).map(c => c.campaignName);
    recs.push({
      id: 'det-unstable',
      priority: 'medium',
      category: 'watch',
      titleAr: 'مراقبة حملات غير مستقرة',
      bodyAr: `${patterns.unstable.campaigns.length} حملة أداؤها متذبذب (${names.join('، ')}). راقبها يومين إضافيين قبل اتخاذ قرار — قد تعود لمستواها الطبيعي.`,
      campaignIds: patterns.unstable.campaigns.map(c => c.campaignId),
      confidence: 0.7,
    });
  }

  if (patterns.stable.campaigns.length > 0 && patterns.stable.avgScore >= 70) {
    recs.push({
      id: 'det-stable',
      priority: 'low',
      category: 'optimize',
      titleAr: 'تحسين الحملات المستقرة',
      bodyAr: `${patterns.stable.campaigns.length} حملة تعمل باستقرار. جرّب اختبار جمهور جديد أو إبداع مختلف في واحدة منها لاكتشاف فرص نمو إضافية.`,
      campaignIds: patterns.stable.campaigns.slice(0, 2).map(c => c.campaignId),
      confidence: 0.6,
    });
  }

  if (patterns.collecting.campaigns.length > 0) {
    recs.push({
      id: 'det-collecting',
      priority: 'low',
      category: 'watch',
      titleAr: 'حملات قيد التحليل',
      bodyAr: `${patterns.collecting.campaigns.length} حملة جديدة نراقبها ونبني لها خط أساس. لا تُجرِ تعديلات جوهرية حتى تكتمل البيانات خلال يوم أو يومين.`,
      campaignIds: patterns.collecting.campaigns.map(c => c.campaignId),
      confidence: 0.6,
    });
  }

  return recs;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
