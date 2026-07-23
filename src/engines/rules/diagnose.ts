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
import {
  arabicEfficiencyPhrase,
  arabicResultPhrase,
  getMetaObjectiveStandard,
  lowCtrFloorForObjective,
} from "../../knowledge/metaObjectiveStandards";
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

function resultNoun(s: Signals): string {
  return arabicResultPhrase(s.objective);
}

function efficiencyNoun(s: Signals): string {
  return arabicEfficiencyPhrase(s.objective);
}

function isMessagingFamily(s: Signals): boolean {
  return getMetaObjectiveStandard(s.objective).family === "messaging";
}

function isAwarenessFamily(s: Signals): boolean {
  return getMetaObjectiveStandard(s.objective).family === "awareness";
}

function isSalesOrLeads(s: Signals): boolean {
  const f = getMetaObjectiveStandard(s.objective).family;
  return f === "sales" || f === "leads";
}

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

  // Single-signal patterns — only when no richer multi-signal diagnosis fired.
  // These close the gap where detectors fire but diagnose() previously returned [].
  if (out.length === 0) {
    const weakCreative = diagnoseWeakCreative(m, signals);
    if (weakCreative) out.push(weakCreative);

    const highFreq = diagnoseHighFrequencyAlone(m, signals);
    if (highFreq) out.push(highFreq);

    const declining = diagnoseDecliningResultsAlone(m, signals);
    if (declining) out.push(declining);
  }

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
      `مرات الظهور وصلت إلى ${freq} و${resultNoun(s)} انخفضت ${resultsDrop}، لكن التفاعل ما زال مقبولاً. ` +
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
    action: isAwarenessFamily(s)
      ? `لحملة الوعي: راجع مواضع العرض الأرخص، أو وسّع الجمهور قليلاً لتخفيف ضغط المزاد، مع مراقبة التكرار.`
      : `جرّب: (1) نقل جزء من الميزانية لأوقات أقل ازدحاماً، (2) تضييق الجمهور لمن هم أقرب للشراء، أو (3) الإبقاء على الإنفاق إذا كانت ${resultNoun(s)} ما زالت مجدية.`,
    contributingIssues: [...(m.has("RISING_COST_PER_RESULT") ? ["RISING_COST_PER_RESULT"] : [])],
  };
}

// ── Pattern 4: Landing/Offer Problem ──────────────────────────────────
function diagnoseLandingPageProblem(m: IssueMap, s: Signals): Diagnosis | null {
  if (!m.has("DECLINING_RESULTS")) return null;
  // Awareness campaigns rarely have a "post-click" conversion path — skip.
  if (isAwarenessFamily(s)) return null;
  const ctrFloor = lowCtrFloorForObjective(s.objective);
  const ctrHealthy = s.currentCtr != null && s.currentCtr >= ctrFloor;
  const ctrNotDropping = s.ctrTrend == null || s.ctrTrend > -0.10;
  if (!ctrHealthy || !ctrNotDropping) return null;

  const resultsDrop = s.resultsTrend != null ? `${Math.abs(s.resultsTrend * 100).toFixed(0)}%` : "؟";
  const ctr = s.currentCtr != null ? `${s.currentCtr.toFixed(1)}%` : "؟";

  let action: string;
  if (isMessagingFamily(s)) {
    action =
      `راجع: (1) سرعة فتح الصفحة أو الشات، (2) تطابق وعد الإعلان مع رسالة الترحيب، (3) سرعة الرد على واتساب/ماسنجر. الإعلان نفسه يعمل.`;
  } else if (isSalesOrLeads(s)) {
    action =
      `راجع: (1) سرعة صفحة الهبوط، (2) تطابق وعد الإعلان مع العرض، (3) خطوات النموذج أو الدفع. الإعلان يجلب نقراً — التسريب بعد النقر.`;
  } else {
    action =
      `راجع: (1) سرعة فتح الصفحة، (2) وضوح الدعوة بعد النقر، (3) أن الوجهة تطابق وعد الإعلان. الإعلان نفسه يعمل.`;
  }

  return {
    name: "مشكلة بعد النقر",
    code: "POST_CLICK_PROBLEM",
    confidence: 0.70,
    narrative:
      `${resultNoun(s)} انخفضت ${resultsDrop} لكن نسبة النقر جيدة عند ${ctr}. ` +
      `الناس ينقرون، لكن لا يكملون بعد النقر — المشكلة في الصفحة أو العرض أو مسار ما بعد النقر.`,
    action,
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
      `${efficiencyNoun(s)} ارتفعت بنسبة ${divPct} تقريباً مقارنة بالإنفاق. ` +
      `تصرف ميزانية مشابهة لكن تحصل على ${resultNoun(s)} أقل.`,
    action:
      `راجع الحملات ذات الفجوة الأكبر في ${efficiencyNoun(s)}، وأوقف أو عدّل الأضعف. إن كانت المشكلة على مستوى الحساب كله، تأكد أن الحملات لا تتنافس على نفس الجمهور.`,
    contributingIssues: ["RISING_COST_PER_RESULT", ...(m.has("DECLINING_RESULTS") ? ["DECLINING_RESULTS"] : [])],
  };
}

// ── Pattern 6: Weak creative (LOW_CTR alone) ───────────────────────────
function diagnoseWeakCreative(m: IssueMap, s: Signals): Diagnosis | null {
  const low = m.get("LOW_CTR");
  if (!low) return null;

  const ctr = s.currentCtr != null ? `${s.currentCtr.toFixed(1)}%` : "؟";

  return {
    name: "ضعف التفاعل مع الإعلان",
    code: "WEAK_CREATIVE",
    confidence: (low.evidence.confidence as number) ?? 0.75,
    narrative:
      `نسبة النقر الحالية حوالي ${ctr} — أقل من المستوى المعتاد لحملات ${isAwarenessFamily(s) ? "الوعي" : "هذا الهدف"} حسب معايير Meta. ` +
      `كثير من الناس يرون الإعلان ويمرّون دون اهتمام كافٍ.`,
    action: isAwarenessFamily(s)
      ? `لحملة الوعي: حسّن الافتتاحية البصرية خلال أول ثانيتين، وراقب تكلفة الوصول والتكرار مع تجديد الإبداع.`
      : `جدّد الافتتاحية أو الصورة خلال هذا الأسبوع، واجعل العرض أو الدعوة أوضح في أول ثانيتين.`,
    contributingIssues: ["LOW_CTR"],
  };
}

// ── Pattern 7: High frequency alone ───────────────────────────────────
function diagnoseHighFrequencyAlone(m: IssueMap, s: Signals): Diagnosis | null {
  const hf = m.get("HIGH_FREQUENCY");
  if (!hf) return null;

  const freq = s.currentFrequency != null ? s.currentFrequency.toFixed(1) : "؟";

  return {
    name: "تكرار ظهور مرتفع",
    code: "HIGH_FREQUENCY_PRESSURE",
    confidence: (hf.evidence.confidence as number) ?? 0.65,
    narrative:
      `نفس الأشخاص يرون الإعلان بمعدل تكرار حوالي ${freq}. ` +
      `هذا قد يكون طبيعياً لجمهور ضيق، لكنه غالباً بداية تعب إن استمر دون تجديد.`,
    action:
      `راقب التفاعل يومياً. إن بدأ النقر بالانخفاض، جدّد الإبداع أو وسّع الجمهور قليلاً.`,
    contributingIssues: ["HIGH_FREQUENCY"],
  };
}

// ── Pattern 8: Declining results alone ────────────────────────────────
function diagnoseDecliningResultsAlone(m: IssueMap, s: Signals): Diagnosis | null {
  const dec = m.get("DECLINING_RESULTS");
  if (!dec) return null;

  const resultsDrop = s.resultsTrend != null ? `${Math.abs(s.resultsTrend * 100).toFixed(0)}%` : "؟";

  return {
    name: "تراجع النتائج",
    code: "DECLINING_OUTCOMES",
    confidence: (dec.evidence.confidence as number) ?? 0.8,
    narrative:
      `${resultNoun(s)} انخفضت حوالي ${resultsDrop} مقارنة بالمستوى المرجعي. ` +
      `لم يتضح بعد إن كان السبب الإبداع أو الجمهور أو العرض — لكن الاتجاه يستحق انتباهاً.`,
    action:
      `راجع أقوى إعلان في الحملة، وقارن ${efficiencyNoun(s)} مع حملاتك الأخرى، ثم عدّل الأضعف أولاً.`,
    contributingIssues: ["DECLINING_RESULTS"],
  };
}
