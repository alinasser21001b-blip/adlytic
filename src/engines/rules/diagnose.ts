// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/diagnose.ts
//
//  Turns raw detected issues + their evidence into a named diagnosis with
//  a plain-language narrative. Detectors answer "WHAT happened"; this
//  module answers "WHY it happened and WHAT to do."
//
//  Narratives are Arabic-first merchant copy — no LLM, deterministic.
// ════════════════════════════════════════════════════════════════════════

import type { IssueRecord } from "../../repositories/detectedIssuesRepo";
import type { Signals } from "./types";

export interface Diagnosis {
  name: string;
  /** Stable machine key for UI mapping / tests */
  code: string;
  confidence: number;
  narrative: string;
  action: string;
  contributingIssues: string[];
}

type IssueMap = Map<string, IssueRecord>;

export function diagnose(issues: IssueRecord[], signals: Signals): Diagnosis[] {
  const m: IssueMap = new Map();
  for (const i of issues) m.set(i.issueCode, i);

  const out: Diagnosis[] = [];

  const creative = diagnoseCreativeFatigue(m, signals);
  if (creative) out.push(creative);

  const audience = diagnoseAudienceSaturation(m, signals);
  if (audience) out.push(audience);

  const auction = diagnoseAuctionPressure(m, signals);
  if (auction) out.push(auction);

  const landing = diagnoseLandingPageProblem(m, signals);
  if (landing) out.push(landing);

  const efficiency = diagnoseEfficiencyDrop(m, signals);
  if (efficiency) out.push(efficiency);

  return out;
}

// ── Pattern 1: Creative Fatigue ───────────────────────────────────────
function diagnoseCreativeFatigue(m: IssueMap, s: Signals): Diagnosis | null {
  const fatigue = m.get("AUDIENCE_FATIGUE");
  if (!fatigue) return null;

  const freq = s.currentFrequency != null ? s.currentFrequency.toFixed(1) : "؟";
  const ctrDrop = s.ctrTrend != null ? `${Math.abs(s.ctrTrend * 100).toFixed(0)}%` : "؟";
  const freqRise = s.frequencyTrend != null ? `${(s.frequencyTrend * 100).toFixed(0)}%` : "؟";

  return {
    name: "إرهاق الإعلان",
    code: "CREATIVE_FATIGUE",
    confidence: (fatigue.evidence.confidence as number) ?? 0.7,
    narrative:
      `مرات ظهور الإعلان لنفس الشخص ارتفعت ${freqRise} ووصلت إلى ${freq}، بينما تفاعل النقر انخفض ${ctrDrop}. ` +
      `الجمهور رأى نفس الإعلان كثيراً فقلّ اهتمامه.`,
    action:
      `جدّد صورة أو فيديو الإعلان، أو غيّر الجملة الافتتاحية. عادةً يتحسّن التفاعل خلال 5–7 أيام بعد التجديد.`,
    contributingIssues: ["AUDIENCE_FATIGUE", ...(m.has("HIGH_FREQUENCY") ? ["HIGH_FREQUENCY"] : []), ...(m.has("LOW_CTR") ? ["LOW_CTR"] : [])],
  };
}

// ── Pattern 2: Audience Saturation ────────────────────────────────────
function diagnoseAudienceSaturation(m: IssueMap, s: Signals): Diagnosis | null {
  if (!m.has("HIGH_FREQUENCY") || !m.has("DECLINING_RESULTS")) return null;
  if (m.has("AUDIENCE_FATIGUE")) return null;

  const freq = s.currentFrequency != null ? s.currentFrequency.toFixed(1) : "؟";
  const resultsDrop = s.resultsTrend != null ? `${Math.abs(s.resultsTrend * 100).toFixed(0)}%` : "؟";

  return {
    name: "تشبّع الجمهور",
    code: "AUDIENCE_SATURATION",
    confidence: 0.65,
    narrative:
      `مرات الظهور وصلت إلى ${freq} والنتائج انخفضت ${resultsDrop}، لكن التفاعل ما زال مقبولاً. ` +
      `الإعلان يعمل، لكنك وصلت تقريباً لكل من في هذا الجمهور.`,
    action:
      `وسّع الجمهور: زد نطاق المنطقة، أو أضف جمهوراً مشابهاً، أو جرّب اهتمامات جديدة. التصميم جيد — حجم الجمهور هو المشكلة.`,
    contributingIssues: ["HIGH_FREQUENCY", "DECLINING_RESULTS"],
  };
}

// ── Pattern 3: Auction Pressure ───────────────────────────────────────
function diagnoseAuctionPressure(m: IssueMap, s: Signals): Diagnosis | null {
  if (s.cpmTrend == null || s.cpmTrend < 0.15) return null;
  const ctrStable = s.ctrTrend == null || Math.abs(s.ctrTrend) < 0.10;
  if (!ctrStable) return null;

  const cpmRise = `${(s.cpmTrend * 100).toFixed(0)}%`;

  return {
    name: "ارتفاع تكلفة الوصول",
    code: "AUCTION_PRESSURE",
    confidence: 0.60,
    narrative:
      `تكلفة الوصول ارتفعت ${cpmRise} بينما تفاعل الإعلان بقي مستقراً. ` +
      `الإعلان نفسه بخير — الغلاء جاء من منافسة أعلى على نفس الجمهور.`,
    action:
      `جرّب: (1) نقل جزء من الميزانية لأوقات أقل ازدحاماً، (2) تضييق الجمهور لمن هم أقرب للشراء، أو (3) الإبقاء على الإنفاق إذا كانت النتائج ما زالت مربحة.`,
    contributingIssues: [...(m.has("RISING_COST_PER_RESULT") ? ["RISING_COST_PER_RESULT"] : [])],
  };
}

// ── Pattern 4: Landing/Offer Problem ──────────────────────────────────
function diagnoseLandingPageProblem(m: IssueMap, s: Signals): Diagnosis | null {
  if (!m.has("DECLINING_RESULTS")) return null;
  const ctrHealthy = s.currentCtr != null && s.currentCtr >= 1.0;
  const ctrNotDropping = s.ctrTrend == null || s.ctrTrend > -0.10;
  if (!ctrHealthy || !ctrNotDropping) return null;

  const resultsDrop = s.resultsTrend != null ? `${Math.abs(s.resultsTrend * 100).toFixed(0)}%` : "؟";
  const ctr = s.currentCtr != null ? `${s.currentCtr.toFixed(1)}%` : "؟";

  return {
    name: "مشكلة بعد النقر",
    code: "POST_CLICK_PROBLEM",
    confidence: 0.70,
    narrative:
      `النتائج انخفضت ${resultsDrop} لكن نسبة النقر جيدة عند ${ctr}. ` +
      `الناس ينقرون، لكن لا يكملون بعد النقر — المشكلة في الصفحة أو العرض أو سرعة الرد على الرسائل.`,
    action:
      `راجع: (1) سرعة فتح الصفحة، (2) تطابق وعد الإعلان مع محتوى الصفحة، (3) سرعة الرد على واتساب إن كان الهدف رسائل. الإعلان نفسه يعمل.`,
    contributingIssues: ["DECLINING_RESULTS"],
  };
}

// ── Pattern 5: Efficiency Drop ────────────────────────────────────────
function diagnoseEfficiencyDrop(m: IssueMap, s: Signals): Diagnosis | null {
  const cpr = m.get("RISING_COST_PER_RESULT");
  if (!cpr) return null;
  if (m.has("AUDIENCE_FATIGUE")) return null;

  const divergence = cpr.evidence.divergence as number | undefined;
  const divPct = divergence != null ? `${Math.abs(divergence * 100).toFixed(0)}%` : "؟";

  return {
    name: "ارتفاع تكلفة النتيجة",
    code: "RISING_COST_PER_RESULT",
    confidence: (cpr.evidence.confidence as number) ?? 0.75,
    narrative:
      `كل نتيجة أصبحت أغلى بنسبة ${divPct} تقريباً مقارنة بالإنفاق. ` +
      `تصرف ميزانية مشابهة لكن تحصل على نتائج أقل.`,
    action:
      `راجع الحملات ذات الفجوة الأكبر في التكلفة، وأوقف أو عدّل الأضعف. إن كانت المشكلة على مستوى الحساب كله، تأكد أن الحملات لا تتنافس على نفس الجمهور.`,
    contributingIssues: ["RISING_COST_PER_RESULT", ...(m.has("DECLINING_RESULTS") ? ["DECLINING_RESULTS"] : [])],
  };
}
