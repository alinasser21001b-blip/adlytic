// ════════════════════════════════════════════════════════════════════════
//  src/knowledge/adRelevanceIntelligence.ts
//
//  Meta's OWN diagnosis, translated into a decision.
//
//  Meta grades every ad on three axes vs peers competing for the same
//  audience with the same objective:
//    • quality_ranking          — how the ad's quality compares (perceived)
//    • engagement_rate_ranking  — expected engagement vs peers
//    • conversion_rate_ranking  — expected conversion vs peers
//  Each is one of: above_average | average | below_average_35 |
//  below_average_20 | unknown.
//
//  These are the single highest-signal, lowest-inference fields Meta exposes:
//  the platform is telling us *why* an ad underdelivers. This module turns the
//  raw triple into a named cause + advisor-grade Arabic/English copy. It is a
//  PURE function of the triple — no DB, no LLM, no dependence on our own
//  metrics — so it is trivially testable and safe to call anywhere.
//
//  Design intent (roadmap Wave 1.1): the output `cause` codes are chosen to
//  COMPLEMENT the existing engines/rules/diagnose.ts vocabulary, never to
//  contradict it. When rankings confirm a metric-derived diagnosis we raise
//  confidence; when they reveal something metrics can't see (clickbait
//  perception, landing/offer weakness) they add a diagnosis metrics alone
//  would miss.
//
//  Tested in test_ad_relevance.ts (repo tsx convention).
// ════════════════════════════════════════════════════════════════════════

/** The five values Meta returns; `unknown` also covers null/absent. */
export type MetaRanking =
  | "above_average"
  | "average"
  | "below_average_35"
  | "below_average_20"
  | "unknown";

/** The neutral triple every connector maps INTO (mirrors the mapper cordon). */
export interface AdRelevanceTriple {
  quality: MetaRanking;
  engagement: MetaRanking;
  conversion: MetaRanking;
}

/** Machine-stable cause codes. Deliberately disjoint from diagnose.ts codes
 *  EXCEPT where a ranking corroborates an existing metric diagnosis. */
export type RelevanceCauseCode =
  | "RELEVANCE_HEALTHY"
  | "CLICKBAIT_PERCEPTION" // engagement fine but quality poor → over-promises / misleads
  | "WEAK_CREATIVE_RELEVANCE" // engagement poor → the creative itself isn't landing
  | "LANDING_OR_OFFER_WEAKNESS" // clicks fine but conversion poor → post-click leak (corroborates POST_CLICK_PROBLEM)
  | "BROAD_UNDERPERFORMANCE" // multiple axes below average → structural mismatch
  | "RELEVANCE_UNKNOWN"; // not enough delivery for Meta to grade yet

export interface RelevanceDiagnosis {
  code: RelevanceCauseCode;
  /** 0..1 — how strongly the ranking pattern implies this cause. */
  confidence: number;
  /** Severity hint so callers can rank vs other issues without re-deriving. */
  severity: "none" | "low" | "medium" | "high";
  /** Advisor copy — the product. The rankings themselves are only evidence. */
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  actionAr: string;
  actionEn: string;
  /** Which axes drove this call — for an evidence chip in the UI. */
  evidence: Array<{ axis: "quality" | "engagement" | "conversion"; value: MetaRanking }>;
}

// ── helpers ─────────────────────────────────────────────────────────────

const BELOW = new Set<MetaRanking>(["below_average_35", "below_average_20"]);
const KNOWN = new Set<MetaRanking>([
  "above_average",
  "average",
  "below_average_35",
  "below_average_20",
]);

function isBelow(r: MetaRanking): boolean {
  return BELOW.has(r);
}
/** below_average_20 is the bottom 20% — a harder signal than bottom 35%. */
function isBottom20(r: MetaRanking): boolean {
  return r === "below_average_20";
}

/**
 * Normalize any incoming value (Meta string, null, undefined, unexpected
 * casing) into a MetaRanking. Defensive on purpose — this is a cordon.
 */
export function normalizeRanking(raw: unknown): MetaRanking {
  if (typeof raw !== "string") return "unknown";
  const v = raw.trim().toLowerCase();
  if (KNOWN.has(v as MetaRanking)) return v as MetaRanking;
  // Meta has historically also emitted these spellings.
  if (v === "below_average") return "below_average_35";
  if (v === "" || v === "unknown" || v === "not_available") return "unknown";
  return "unknown";
}

/** Localized label for a single ranking value (for chips / tables). */
export function rankingLabel(r: MetaRanking, locale: "AR" | "EN" = "AR"): string {
  const ar: Record<MetaRanking, string> = {
    above_average: "أعلى من المتوسط",
    average: "متوسط",
    below_average_35: "أقل من المتوسط (أدنى 35%)",
    below_average_20: "أقل من المتوسط (أدنى 20%)",
    unknown: "غير متاح بعد",
  };
  const en: Record<MetaRanking, string> = {
    above_average: "Above average",
    average: "Average",
    below_average_35: "Below average (bottom 35%)",
    below_average_20: "Below average (bottom 20%)",
    unknown: "Not enough data yet",
  };
  return (locale === "AR" ? ar : en)[r];
}

// ── the core: triple → named diagnosis ──────────────────────────────────

/**
 * Resolve Meta's relevance triple into one advisor diagnosis.
 *
 * Priority order matters: the most specific, most actionable pattern wins so
 * the caller never has to choose between overlapping calls. A single ad has
 * exactly ONE relevance diagnosis (the dominant one), matching the product
 * rule "one diagnosis, not four warnings".
 */
export function diagnoseRelevance(triple: AdRelevanceTriple): RelevanceDiagnosis {
  const quality = normalizeRanking(triple.quality);
  const engagement = normalizeRanking(triple.engagement);
  const conversion = normalizeRanking(triple.conversion);

  const known = [quality, engagement, conversion].filter((r) => KNOWN.has(r));
  // Meta hasn't graded this ad yet (too little delivery) — say so honestly.
  if (known.length === 0) {
    return {
      code: "RELEVANCE_UNKNOWN",
      confidence: 0,
      severity: "none",
      titleAr: "لم يقيّم Meta هذا الإعلان بعد",
      titleEn: "Meta hasn't graded this ad yet",
      bodyAr: "لم يظهر الإعلان بما يكفي ليمنحه Meta تقييم جودة. انتظر تراكم المزيد من الظهور.",
      bodyEn: "The ad hasn't delivered enough for Meta to grade it. Wait for more impressions.",
      actionAr: "لا إجراء الآن — راقب بعد يوم أو يومين.",
      actionEn: "No action yet — check back in a day or two.",
      evidence: [],
    };
  }

  const belowCount = [quality, engagement, conversion].filter(isBelow).length;
  const ev = (
    axis: "quality" | "engagement" | "conversion",
    value: MetaRanking,
  ) => ({ axis, value });

  // ── Pattern A: broad underperformance — two+ axes below average ─────────
  // Structural mismatch (wrong audience/offer/creative fit); highest severity.
  if (belowCount >= 2) {
    const evidence = [
      ev("quality", quality),
      ev("engagement", engagement),
      ev("conversion", conversion),
    ].filter((e) => isBelow(e.value));
    return {
      code: "BROAD_UNDERPERFORMANCE",
      confidence: 0.85,
      severity: "high",
      titleAr: "الإعلان أضعف من منافسيه على أكثر من محور",
      titleEn: "Ad trails competitors on multiple axes",
      bodyAr:
        "يصنّف Meta هذا الإعلان أقل من المتوسط في أكثر من جانب مقارنةً بالإعلانات المنافسة على نفس الجمهور. " +
        "هذا غالباً عدم تطابق بين الإعلان والجمهور والعرض — لا مشكلة جزئية واحدة.",
      bodyEn:
        "Meta ranks this ad below average on more than one axis versus ads competing for the same audience. " +
        "That usually means an ad–audience–offer mismatch, not a single local problem.",
      actionAr:
        "ابدأ من جديد بهذا الإعلان: إبداع مختلف تماماً (زاوية/رسالة جديدة) أو جمهور أقرب للعرض. التعديلات الصغيرة نادراً ما تنقذ إعلاناً بهذا التصنيف.",
      actionEn:
        "Rebuild this ad: a genuinely different creative (new angle/message) or an audience closer to the offer. Small tweaks rarely rescue an ad ranked this low.",
      evidence,
    };
  }

  // ── Pattern B: landing/offer weakness — only conversion is below ────────
  // The ad earns attention & clicks but the post-click path leaks. This
  // CORROBORATES engines/rules diagnose POST_CLICK_PROBLEM from a second,
  // independent source (Meta's own grade), so confidence is high.
  if (isBelow(conversion) && !isBelow(quality) && !isBelow(engagement)) {
    return {
      code: "LANDING_OR_OFFER_WEAKNESS",
      confidence: isBottom20(conversion) ? 0.82 : 0.72,
      severity: isBottom20(conversion) ? "high" : "medium",
      titleAr: "المشكلة بعد النقر — لا في الإعلان",
      titleEn: "The leak is after the click — not the ad",
      bodyAr:
        "جودة الإعلان وتفاعله جيدان، لكن Meta يتوقع تحويلاً أقل من المنافسين. " +
        "الناس ينقرون لكنهم لا يكملون — الضعف في الصفحة أو العرض أو سرعة الرد بعد النقر.",
      bodyEn:
        "The ad's quality and engagement are fine, but Meta expects lower conversion than peers. " +
        "People click but don't complete — the weakness is the page, the offer, or post-click response speed.",
      actionAr:
        "راجع ما بعد النقر: سرعة فتح الصفحة/الشات، تطابق وعد الإعلان مع رسالة الترحيب أو العرض، وسرعة الرد على واتساب/ماسنجر. لا تغيّر الإعلان نفسه بعد.",
      actionEn:
        "Fix the post-click path: page/chat load speed, ad-promise vs landing/greeting match, and reply speed on WhatsApp/Messenger. Don't change the ad itself yet.",
      evidence: [ev("conversion", conversion)],
    };
  }

  // ── Pattern C: clickbait perception — engagement OK but quality poor ────
  // People interact, but Meta's quality signal (incl. negative feedback,
  // hide/report, ad–landing mismatch) is low → the ad over-promises.
  if (isBelow(quality) && !isBelow(engagement)) {
    return {
      code: "CLICKBAIT_PERCEPTION",
      confidence: isBottom20(quality) ? 0.78 : 0.68,
      severity: isBottom20(quality) ? "high" : "medium",
      titleAr: "الإعلان يجذب النقر لكن يُنظر إليه كمبالغة",
      titleEn: "The ad draws clicks but reads as over-promising",
      bodyAr:
        "التفاعل مقبول، لكن Meta يقيّم جودة الإعلان منخفضة — عادةً بسبب ملاحظات سلبية أو إخفاء/إبلاغ، أو لأن ما بعد النقر لا يطابق وعد الإعلان. " +
        "هذا يرفع تكلفتك ويقلّل توصيلك مع الوقت.",
      bodyEn:
        "Engagement is acceptable, but Meta rates the ad's quality low — usually negative feedback, hides/reports, or a landing experience that doesn't match the ad's promise. " +
        "This raises your cost and throttles delivery over time.",
      actionAr:
        "اجعل الإعلان صادقاً مع ما بعده: طابق العنوان والصورة مع العرض الفعلي، واحذف المبالغة. راجع أيضاً تعليقات الإعلان وأخفِ أو ردّ على السلبية.",
      actionEn:
        "Make the ad honest to what follows: match headline and image to the real offer, drop the hype. Also review ad comments and hide/answer negative ones.",
      evidence: [ev("quality", quality)],
    };
  }

  // ── Pattern D: weak creative relevance — engagement below ───────────────
  // The creative itself isn't landing with this audience.
  if (isBelow(engagement)) {
    return {
      code: "WEAK_CREATIVE_RELEVANCE",
      confidence: isBottom20(engagement) ? 0.75 : 0.65,
      severity: isBottom20(engagement) ? "high" : "medium",
      titleAr: "الإبداع لا يجذب هذا الجمهور",
      titleEn: "The creative isn't landing with this audience",
      bodyAr:
        "يتوقع Meta تفاعلاً أقل من المنافسين لهذا الإعلان مع هذا الجمهور. " +
        "الافتتاحية البصرية أو الرسالة لا تلفت الانتباه بما يكفي في أول ثانيتين.",
      bodyEn:
        "Meta expects lower engagement than peers for this ad with this audience. " +
        "The visual hook or message isn't grabbing attention in the first two seconds.",
      actionAr:
        "جرّب افتتاحية بصرية جديدة أو زاوية رسالة مختلفة. اختبر ٢–٣ بدائل بدل تعديل واحد صغير.",
      actionEn:
        "Try a new visual hook or a different message angle. Test 2–3 variants rather than one small tweak.",
      evidence: [ev("engagement", engagement)],
    };
  }

  // ── Healthy: nothing below average ──────────────────────────────────────
  const aboveCount = [quality, engagement, conversion].filter(
    (r) => r === "above_average",
  ).length;
  return {
    code: "RELEVANCE_HEALTHY",
    confidence: aboveCount >= 2 ? 0.9 : 0.6,
    severity: "none",
    titleAr: aboveCount >= 2 ? "إعلان قوي حسب تقييم Meta" : "تقييم Meta سليم",
    titleEn: aboveCount >= 2 ? "A strong ad by Meta's grade" : "Healthy by Meta's grade",
    bodyAr:
      aboveCount >= 2
        ? "يصنّف Meta هذا الإعلان أعلى من المتوسط مقابل منافسيه — توصيل أرخص وأداء أفضل."
        : "لا يوجد محور أقل من المتوسط في تقييم Meta لهذا الإعلان.",
    bodyEn:
      aboveCount >= 2
        ? "Meta ranks this ad above average versus competitors — cheaper delivery and better performance."
        : "No axis is below average in Meta's grade for this ad.",
    actionAr: aboveCount >= 2 ? "مرشّح جيد لزيادة الميزانية تدريجياً مع مراقبة التكرار." : "أبقِه كما هو وراقب.",
    actionEn: aboveCount >= 2 ? "A good candidate to scale budget gradually while watching frequency." : "Keep as-is and monitor.",
    evidence: [],
  };
}

/**
 * One-line advisor summary for compact surfaces (KPI chip, table cell).
 * Never exposes raw enum strings — always the plain sentence.
 */
export function relevanceOneLiner(
  triple: AdRelevanceTriple,
  locale: "AR" | "EN" = "AR",
): string {
  const d = diagnoseRelevance(triple);
  return locale === "AR" ? d.titleAr : d.titleEn;
}
