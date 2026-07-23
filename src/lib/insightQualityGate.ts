// ════════════════════════════════════════════════════════════════════════
//  src/lib/insightQualityGate.ts
//
//  Cognitive gate for merchant-facing insights:
//  - Detect generic / useless narration templates
//  - Build deterministic Arabic copy from brain payload when LLM fails
//  - Score + select only useful, non-duplicate items for the feed
// ════════════════════════════════════════════════════════════════════════

import type { BrainTickResult } from '../engine/AdlyticBrain';
import type { CmoFeedItemDTO } from '../types/cmoFeed';
import {
  arabicEfficiencyPhrase,
  arabicResultPhrase,
} from '../knowledge/metaObjectiveStandards';

/** Titles that mark a useless generic card (LLM fallback / cron sentinel). */
export const GENERIC_INSIGHT_TITLE_MARKERS: readonly string[] = [
  'تحديث أداء الحملة',
  'Campaign Performance Update',
];

/** Body prefixes shared by fallback + sentinel — never useful to merchants. */
export const GENERIC_INSIGHT_BODY_MARKERS: readonly string[] = [
  'راجعنا أداء حملتك وصدرت توصية جديدة بناءً على البيانات الحالية',
  'تعذّر توليد التفاصيل هذه المرة',
];

export interface DeterministicNarration {
  arabicTitle: string;
  arabicNarration: string;
  creativeDirective?: string;
}

export interface InsightQualityScore {
  /** 0–100; below USEFUL_MIN should not surface when better options exist. */
  score: number;
  isGeneric: boolean;
  isUseful: boolean;
  reasons: string[];
}

/** Minimum score to keep an insight when alternatives exist. */
export const USEFUL_MIN_SCORE = 45;

export function normalizeInsightText(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function insightBodyFingerprint(title: string, body: string): string {
  // Collapse campaign-specific suffixes so identical templates collide.
  const raw = normalizeInsightText(`${title}||${body}`)
    .replace(/[«»"']/g, '')
    .replace(/\s*—\s*[^|]+$/u, '')
    .replace(/\d+/g, '#');
  return raw.slice(0, 180);
}

export function isGenericInsightNarration(
  title: string | null | undefined,
  body: string | null | undefined,
): boolean {
  const t = String(title || '').trim();
  const b = String(body || '').trim();
  if (!t && !b) return true;
  if (GENERIC_INSIGHT_TITLE_MARKERS.some((m) => t === m || t.startsWith(m))) return true;
  if (GENERIC_INSIGHT_BODY_MARKERS.some((m) => b.includes(m))) return true;
  // Near-empty / placeholder bodies
  if (b.length > 0 && b.length < 24) return true;
  return false;
}

function readAction(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const decision = (payload as Record<string, unknown>).decision;
  if (decision && typeof decision === 'object') {
    const action = (decision as Record<string, unknown>).action;
    if (typeof action === 'string') return action;
  }
  return '';
}

function readCampaignName(payload: unknown, fallback = 'حملتك'): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const name = (payload as Record<string, unknown>).campaignName;
  return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

function qualitativeCtr(payload: unknown): 'up' | 'down' | 'flat' | null {
  if (!payload || typeof payload !== 'object') return null;
  const physics = (payload as Record<string, unknown>).physics;
  if (!physics || typeof physics !== 'object') return null;
  const ctr = (physics as Record<string, unknown>).ctr;
  if (!ctr || typeof ctr !== 'object') return null;
  const delta = (ctr as Record<string, unknown>).delta;
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null;
  if (delta > 0.08) return 'up';
  if (delta < -0.08) return 'down';
  return 'flat';
}

function qualitativeSpendPressure(payload: unknown): 'high' | 'normal' | null {
  if (!payload || typeof payload !== 'object') return null;
  const v2 = (payload as Record<string, unknown>).v2;
  if (!v2 || typeof v2 !== 'object') return null;
  const velocity = (v2 as Record<string, unknown>).velocity;
  if (!velocity || typeof velocity !== 'object') return null;
  if ((velocity as Record<string, unknown>).emergencyOverride === true) return 'high';
  const burn = (velocity as Record<string, unknown>).burnRate;
  if (typeof burn === 'number' && burn > 0) {
    // burnRate is engine major units/hour — treat elevated qualitatively only.
    return 'high';
  }
  return 'normal';
}

/** Short Arabic diagnosis name from rule grounding, if present. */
function readDiagnosisHint(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const rg = (payload as Record<string, unknown>).ruleGrounding;
  if (!rg || typeof rg !== 'object') return null;
  const diagnoses = (rg as Record<string, unknown>).diagnoses;
  if (!Array.isArray(diagnoses) || diagnoses.length === 0) return null;
  const first = diagnoses[0];
  if (!first || typeof first !== 'object') return null;
  const name = (first as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function readObjective(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = (payload as Record<string, unknown>).objective;
  if (typeof obj === 'string' && obj.trim()) return obj.trim();
  // CmoPayload nests objective.raw
  if (obj && typeof obj === 'object') {
    const raw = (obj as Record<string, unknown>).raw;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

/**
 * Deterministic Arabic narration grounded in brain action + qualitative signals.
 * Used when LLM fails — never emit the generic "تحديث أداء الحملة" template.
 */
export function buildDeterministicNarration(
  brainOrPayload: BrainTickResult | unknown,
  opts?: { campaignName?: string; action?: string },
): DeterministicNarration {
  const payload = brainOrPayload as BrainTickResult | Record<string, unknown>;
  const action =
    opts?.action ||
    (payload && typeof payload === 'object' && 'decision' in payload
      ? String((payload as BrainTickResult).decision?.action || '')
      : readAction(payload)) ||
    'HOLD_AND_MONITOR';

  const campaignName =
    opts?.campaignName ||
    (payload && typeof payload === 'object' && 'campaignName' in payload
      ? String((payload as BrainTickResult).campaignName || '')
      : readCampaignName(payload)) ||
    'حملتك';

  const shortName = campaignName.length > 42 ? campaignName.slice(0, 40) + '…' : campaignName;
  const ctrDir = qualitativeCtr(payload);
  const spendPressure = qualitativeSpendPressure(payload);
  const diagnosisHint = readDiagnosisHint(payload);
  const objective =
    (payload && typeof payload === 'object' && 'objective' in payload
      ? (typeof (payload as BrainTickResult).objective === 'string'
          ? (payload as BrainTickResult).objective
          : readObjective(payload))
      : readObjective(payload)) || null;
  const resultNoun = arabicResultPhrase(objective);
  const efficiencyNoun = arabicEfficiencyPhrase(objective);
  const ctrHint =
    ctrDir === 'down'
      ? ' التفاعل مع الإعلان تراجع.'
      : ctrDir === 'up'
        ? ' التفاعل مع الإعلان يتحسّن.'
        : '';
  const spendHint = spendPressure === 'high' ? ' سرعة الإنفاق مرتفعة حالياً.' : '';
  const whyHint = diagnosisHint ? ` السبب الأرجح: ${diagnosisHint}.` : '';

  const directive =
    payload &&
    typeof payload === 'object' &&
    (payload as BrainTickResult).v2?.resonance?.creativeDirective
      ? (payload as BrainTickResult).v2!.resonance.creativeDirective
      : undefined;

  switch (action) {
    case 'EMERGENCY_PAUSE':
      return {
        arabicTitle: 'إيقاف فوري لحماية الميزانية',
        arabicNarration:
          `أوقفنا حملة «${shortName}» لأن الإنفاق يرتفع دون ${resultNoun} كافية.` +
          spendHint +
          whyHint +
          ` راجع الإبداع والاستهداف قبل إعادة التشغيل.`,
        creativeDirective: directive,
      };
    case 'PAUSE_CAMPAIGN':
      return {
        arabicTitle: 'يُفضّل إيقاف هذه الحملة',
        arabicNarration:
          `حملة «${shortName}» تستهلك ميزانية دون عائد واضح على ${resultNoun}.` +
          ctrHint +
          whyHint +
          ` أوقفها مؤقتاً وراجع التصميم أو الجمهور قبل إعادة الإطلاق.`,
        creativeDirective: directive,
      };
    case 'REFRESH_CREATIVE':
      return {
        arabicTitle: 'الإعلان يحتاج تجديداً',
        arabicNarration:
          `جمهور حملة «${shortName}» بدأ يتعب من نفس التصميم.` +
          ctrHint +
          whyHint +
          ` جدّد الصورة أو الفيديو أو الجملة الافتتاحية خلال هذا الأسبوع.`,
        creativeDirective: directive,
      };
    case 'RESCUE_WATCH':
      return {
        arabicTitle: 'راقب هذه الحملة عن قرب',
        arabicNarration:
          `حملة «${shortName}» ضعيفة لكن فيها إشارة إنقاذ محتملة.` +
          ctrHint +
          whyHint +
          ` لا توقفها الآن — راقب ${resultNoun} يومياً قبل اتخاذ قرار.`,
        creativeDirective: directive,
      };
    case 'SCALE_BUDGET':
      return {
        arabicTitle: 'فرصة لزيادة الميزانية',
        arabicNarration:
          `حملة «${shortName}» تعمل بكفاءة جيدة على ${resultNoun}.` +
          ctrHint +
          ` زِد الميزانية تدريجياً واستمر في مراقبة ${efficiencyNoun}.`,
        creativeDirective: directive,
      };
    case 'KEEP_COLLECTING':
      return {
        arabicTitle: 'نراقب ونبني خط الأساس',
        arabicNarration:
          `حملة «${shortName}» ما زالت في مرحلة جمع البيانات.` +
          ` نتابع ${resultNoun} وسننبّهك عند ظهور قرار واضح.`,
        creativeDirective: directive,
      };
    case 'HOLD_AND_MONITOR':
    default:
      return {
        arabicTitle: 'الأداء ضمن المتابعة',
        arabicNarration:
          `حملة «${shortName}» لا تحتاج تدخلاً عاجلاً الآن.` +
          ctrHint +
          spendHint +
          whyHint +
          ` نتابع ${resultNoun} و${efficiencyNoun} وسننبّهك إذا تغيّر الوضع.`,
        creativeDirective: directive,
      };
  }
}

export function scoreInsightQuality(input: {
  title: string;
  body: string;
  action?: string;
  generatedAt?: string | null;
  hasCampaignSpecifics?: boolean;
}): InsightQualityScore {
  const reasons: string[] = [];
  let score = 55;
  const generic = isGenericInsightNarration(input.title, input.body);

  if (generic) {
    score = 10;
    reasons.push('generic_template');
  } else {
    reasons.push('specific_copy');
  }

  if (!input.generatedAt) {
    score -= 15;
    reasons.push('pending_narration');
  }

  const action = input.action || '';
  if (action === 'EMERGENCY_PAUSE' || action === 'PAUSE_CAMPAIGN') {
    score += 25;
    reasons.push('high_stakes_action');
  } else if (action === 'REFRESH_CREATIVE' || action === 'SCALE_BUDGET' || action === 'RESCUE_WATCH') {
    score += 18;
    reasons.push('actionable');
  } else if (action === 'KEEP_COLLECTING') {
    score -= 12;
    reasons.push('learning_phase');
  } else if (action === 'HOLD_AND_MONITOR') {
    score -= 5;
    reasons.push('hold');
  }

  if (input.hasCampaignSpecifics || /«[^»]+»/.test(input.body) || input.body.includes(input.title.slice(0, 8))) {
    score += 8;
    reasons.push('named_campaign');
  }

  // Vague bodies without a verb of action (cover LLM + deterministic templates).
  if (
    !generic &&
    !/(أوقف|جدّد|زِد|زد|راجع|راقب|وسّع|خفّض|أعد|تابع|نبّه|أصلح)/u.test(input.body)
  ) {
    score -= 8;
    reasons.push('weak_action_language');
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    isGeneric: generic,
    isUseful: !generic && score >= USEFUL_MIN_SCORE,
    reasons,
  };
}

/**
 * Select feed items that are useful and non-duplicative.
 * Prefer high-stakes / actionable over learning-phase noise.
 */
export function selectUsefulFeedItems<T extends CmoFeedItemDTO>(
  items: T[],
  limit: number,
): T[] {
  const scored = items.map((item) => {
    const q = scoreInsightQuality({
      title: item.title,
      body: item.bodyFull || item.body,
      action: String(item.insightType || ''),
      generatedAt: item.generatedAt,
      hasCampaignSpecifics: Boolean(item.campaignName && (item.body || '').includes(item.campaignName.slice(0, 12))),
    });
    return { item, q };
  });

  // Drop pure generics when any useful alternative exists.
  const hasUseful = scored.some((s) => s.q.isUseful);
  let pool = hasUseful ? scored.filter((s) => s.q.isUseful || s.q.score >= USEFUL_MIN_SCORE) : scored.filter((s) => !s.q.isGeneric);

  // If everything was generic, keep deterministic replacements only (caller should have replaced).
  if (pool.length === 0) pool = scored.filter((s) => !s.q.isGeneric);
  if (pool.length === 0) pool = scored;

  // Cross-campaign body dedupe — keep highest score / severity.
  const byBody = new Map<string, (typeof pool)[number]>();
  for (const row of pool) {
    const fp = insightBodyFingerprint(row.item.title, row.item.body);
    const existing = byBody.get(fp);
    if (!existing) {
      byBody.set(fp, row);
      continue;
    }
    const existingSev = severityRank(existing.item.severity);
    const nextSev = severityRank(row.item.severity);
    if (row.q.score > existing.q.score || (row.q.score === existing.q.score && nextSev < existingSev)) {
      byBody.set(fp, row);
    }
  }

  // Cap learning-phase noise to 1 item workspace-wide.
  let learningKept = 0;
  const filtered: typeof pool = [];
  const sorted = Array.from(byBody.values()).sort((a, b) => {
    if (a.q.score !== b.q.score) return b.q.score - a.q.score;
    return severityRank(a.item.severity) - severityRank(b.item.severity);
  });

  for (const row of sorted) {
    const isLearning = String(row.item.insightType) === 'KEEP_COLLECTING';
    if (isLearning) {
      if (learningKept >= 1) continue;
      learningKept += 1;
    }
    filtered.push(row);
    if (filtered.length >= limit) break;
  }

  return filtered.map((r) => r.item);
}

function severityRank(sev: string): number {
  const s = String(sev || '').toUpperCase();
  if (s === 'CRITICAL') return 0;
  if (s === 'HIGH') return 1;
  return 2;
}

/**
 * Upgrade narration in-place: if generic, replace with deterministic copy from payload.
 * Returns whether a replacement happened.
 */
export function upgradeGenericNarration(
  narration: { arabicTitle: string; arabicNarration: string; creativeDirective?: string },
  payload: unknown,
  campaignName?: string,
  action?: string,
): { narration: DeterministicNarration; upgraded: boolean } {
  if (!isGenericInsightNarration(narration.arabicTitle, narration.arabicNarration)) {
    return { narration, upgraded: false };
  }
  const next = buildDeterministicNarration(payload, { campaignName, action });
  if (!next.creativeDirective && narration.creativeDirective) {
    next.creativeDirective = narration.creativeDirective;
  }
  return { narration: next, upgraded: true };
}
