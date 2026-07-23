import { CAMPAIGN_GOALS, INDUSTRIES } from "./data/meta-metrics";
import { getIndustryTrends } from "./data/industry-trends";
import type { AssessRequest } from "./schemas";
import type { AssessmentResultPayload } from "./schemas";
import type { TrendInsights } from "./meta-ad-library";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasCta(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  const ctaWords = [
    "shop", "buy", "order", "get", "book", "sign", "download", "apply", "learn",
    "تسوق", "اطلب", "احجز", "سجّل", "حمّل", "احصل", "تواصل", "اكتشف", "عرض", "خصم", "الآن",
  ];
  if (ctaWords.some((w) => lower.includes(w))) return true;
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function scoreHook(primaryText: string, trendHooks: string[]): number {
  if (!primaryText.trim()) return 25;
  let score = 45;
  const firstLine = primaryText.split(/[\n.!?؟]/)[0]?.trim() ?? primaryText;
  if (firstLine.length >= 20 && firstLine.length <= 120) score += 20;
  if (/[%0-9]/.test(firstLine)) score += 10;
  if (trendHooks.some((h) => primaryText.includes(h.slice(0, 8)))) score += 15;
  if (firstLine.length < 15) score -= 10;
  return clampScore(score);
}

function scoreMessageClarity(primaryText: string, headline: string): number {
  if (!primaryText.trim() && !headline.trim()) return 20;
  let score = 50;
  if (primaryText.trim().length >= 30) score += 15;
  if (headline.trim().length >= 5) score += 15;
  if (primaryText.trim().length > 250) score -= 10;
  return clampScore(score);
}

function scoreVisualImpact(hasImage: boolean): number {
  return hasImage ? 65 : 40;
}

function scoreCta(
  primaryText: string,
  headline: string,
  desiredAction: string,
  ctaPatterns: string[],
): number {
  const combined = `${primaryText} ${headline} ${desiredAction}`;
  if (!combined.trim()) return 20;
  if (hasCta(combined, ctaPatterns)) return clampScore(70);
  if (desiredAction.trim()) return 55;
  return 35;
}

function breakdownItem(
  score: number,
  labelAr: string,
  labelEn: string,
  explanationAr: string,
  explanationEn: string,
) {
  return { score, labelAr, labelEn, explanationAr, explanationEn };
}

export function buildFallbackAssessment(
  data: AssessRequest,
  trendContext: TrendInsights,
): AssessmentResultPayload {
  const industry = INDUSTRIES.find((i) => i.value === data.industry);
  const goal = CAMPAIGN_GOALS.find((g) => g.value === data.goal);
  const curated = getIndustryTrends(data.industry);

  const primaryText = data.creative.primaryText ?? "";
  const headline = data.creative.headline ?? "";
  const desiredAction = data.creative.desiredAction ?? "";
  const hasImage = Boolean(data.imageBase64);

  const hookScore = scoreHook(primaryText, trendContext.hooks);
  const clarityScore = scoreMessageClarity(primaryText, headline);
  const visualScore = scoreVisualImpact(hasImage);
  const ctaScore = scoreCta(primaryText, headline, desiredAction, trendContext.ctaPatterns);

  const audienceAr = primaryText.trim()
    ? `إعلانك في مجال ${industry?.labelAr ?? "عملك"} يوجّه رسالة ${goal?.labelAr ?? "تسويقية"} — ${primaryText.slice(0, 120)}${primaryText.length > 120 ? "…" : ""}`
    : `لم تُدخل نصاً إعلانياً بعد — أضف primary text لنفهم رسالتك بدقة في مجال ${industry?.labelAr ?? "عملك"}.`;

  const audienceEn = primaryText.trim()
    ? `Your ${industry?.labelEn ?? "business"} ad communicates a ${goal?.labelEn ?? "marketing"} message: ${primaryText.slice(0, 120)}${primaryText.length > 120 ? "…" : ""}`
    : `No primary text provided yet — add copy so we can interpret your message for ${industry?.labelEn ?? "your business"}.`;

  const trendComparisonAr = [
    `بناءً على اتجاهات ${industry?.labelAr ?? "مجالك"} في MENA:`,
    trendContext.hooks.length > 0
      ? `• الافتتاحيات الشائعة: ${trendContext.hooks.slice(0, 2).join("، ")}`
      : "",
    trendContext.ctaPatterns.length > 0
      ? `• CTAs ناجحة: ${trendContext.ctaPatterns.slice(0, 2).join("، ")}`
      : "",
    hookScore >= 60
      ? "• افتتاحيتك قريبة من الأنماط الناجحة — واصل تحسينها."
      : "• افتتاحيتك تحتاج تقارب أكثر مع hooks الفئة (خصم/فائدة/إلحاح).",
  ]
    .filter(Boolean)
    .join("\n");

  const trendComparisonEn = [
    `Based on ${industry?.labelEn ?? "your category"} trends in MENA:`,
    trendContext.hooks.length > 0
      ? `• Common hooks: ${trendContext.hooks.slice(0, 2).join(", ")}`
      : "",
    trendContext.ctaPatterns.length > 0
      ? `• Winning CTAs: ${trendContext.ctaPatterns.slice(0, 2).join(", ")}`
      : "",
    hookScore >= 60
      ? "• Your hook aligns somewhat with category patterns — keep refining."
      : "• Your hook should move closer to category winners (offer, benefit, urgency).",
  ]
    .filter(Boolean)
    .join("\n");

  const actionItems = [
    {
      ar: primaryText.trim()
        ? "قوِّ أول سطر ليتضمن فائدة أو عرضاً واضحاً خلال 3 ثوانٍ"
        : "أضف primary text يبدأ بفائدة مباشرة أو عرض محدود",
      en: primaryText.trim()
        ? "Strengthen the first line with a clear benefit or offer within 3 seconds"
        : "Add primary text that opens with a direct benefit or limited offer",
    },
    {
      ar: headline.trim()
        ? "تأكد أن headline يكمّل النص ولا يكرره"
        : "أضف headline قصيراً يوضح العرض أو CTA",
      en: headline.trim()
        ? "Ensure the headline complements the body instead of repeating it"
        : "Add a short headline that states the offer or CTA",
    },
    {
      ar: hasCta(`${primaryText} ${headline}`, trendContext.ctaPatterns)
        ? "جرّب CTA أقوى (واتساب/اطلب الآن/احصل على العرض) حسب مجالك"
        : "أضف CTA صريحاً — «اطلب الآن» أو «تواصل واتساب» حسب نوع عملك",
      en: hasCta(`${primaryText} ${headline}`, trendContext.ctaPatterns)
        ? "Test a stronger CTA (WhatsApp / Order Now / Get Offer) for your category"
        : "Add an explicit CTA — Order Now or WhatsApp contact depending on your business",
    },
    {
      ar: hasImage
        ? "تأكد أن النص على الصورة مقروء على الجوال (نص كبير، تباين عالٍ)"
        : "ارفع صورة الإعلان — التحليل البصري يرفع دقة التقييم كثيراً",
      en: hasImage
        ? "Ensure on-image text is mobile-readable (large type, high contrast)"
        : "Upload your ad creative — visual analysis greatly improves accuracy",
    },
  ];

  const industryTips = curated.whatWorksMena.slice(0, 3).map((w) => ({
    ar: w.ar,
    en: w.en,
  }));

  const strengths: { ar: string; en: string }[] = [];
  if (primaryText.trim()) {
    strengths.push({
      ar: "أدخلت نصاً إعلانياً — أساس جيد للتحليل",
      en: "You provided ad copy — a solid foundation for analysis",
    });
  }
  if (headline.trim()) {
    strengths.push({
      ar: "العنوان موجود ويساعد على توضيح العرض",
      en: "Headline is present and helps clarify the offer",
    });
  }
  if (hasImage) {
    strengths.push({
      ar: "أرفقت صورة — يمكن مقارنة الأسلوب البصري بالاتجاهات",
      en: "Image attached — visual style can be compared to trends",
    });
  }
  if (strengths.length < 2) {
    strengths.push({
      ar: "اخترت مجالاً وهدفاً واضحين — يسهّل المقارنة بالمعايير",
      en: "Clear industry and goal selection enables meaningful benchmarks",
    });
  }

  const avgScore = Math.round((hookScore + clarityScore + visualScore + ctaScore) / 4);

  const result: AssessmentResultPayload = {
    audienceMessage: { ar: audienceAr, en: audienceEn },
    summaryAr: `تحليل مبني على معايير MENA لـ${industry?.labelAr ?? "مجالك"} (وضع offline — خدمة الذكاء الاصطناعي غير متاحة مؤقتاً). التقييم الإجمالي التقريبي: ${avgScore}/100.`,
    summaryEn: `MENA benchmark analysis for ${industry?.labelEn ?? "your category"} (offline mode — AI service temporarily unavailable). Approximate overall score: ${avgScore}/100.`,
    creativeBreakdown: {
      hook: breakdownItem(
        hookScore,
        "الافتتاحية",
        "Hook",
        hookScore >= 60
          ? "الافتتاحية تحتوي عناصر جذب — قارنها بـ hooks الشائعة في مجالك"
          : "الافتتاحية ضعيفة أو غير موجودة — أضف عرضاً أو فائدة في أول سطر",
        hookScore >= 60
          ? "Opening has attention elements — compare with common category hooks"
          : "Hook is weak or missing — lead with an offer or benefit",
      ),
      messageClarity: breakdownItem(
        clarityScore,
        "وضوح الرسالة",
        "Message Clarity",
        clarityScore >= 60
          ? "الرسالة مفهومة نسبياً — حسّن headline لتعزيز الوضوح"
          : "الرسالة غير واضحة — اذكر من المستهدف وماذا يحصل عليه",
        clarityScore >= 60
          ? "Message is fairly clear — strengthen headline for clarity"
          : "Message unclear — state who it's for and what they get",
      ),
      visualImpact: breakdownItem(
        visualScore,
        "التأثير البصري",
        "Visual Impact",
        hasImage
          ? "صورة مرفقة — تأكد من mobile-first وتباين النص"
          : "بدون صورة — أضف creative لتحليل التأثير البصري",
        hasImage
          ? "Image attached — ensure mobile-first layout and text contrast"
          : "No image — add creative for visual impact analysis",
      ),
      ctaStrength: breakdownItem(
        ctaScore,
        "قوة الدعوة للإجراء",
        "CTA Strength",
        ctaScore >= 60
          ? "CTA موجود — جرّب صياغة أقوى من أنماط الفئة"
          : "CTA ضعيف أو مفقود — أضف دعوة واضحة للإجراء",
        ctaScore >= 60
          ? "CTA present — try stronger wording from category patterns"
          : "CTA weak or missing — add a clear call to action",
      ),
    },
    trendComparison: { ar: trendComparisonAr, en: trendComparisonEn },
    actionItems,
    industryTips,
    strengths: strengths.slice(0, 3),
  };

  if (data.hasMetrics && data.metrics) {
    result.performanceInsight = {
      ar: "تم استلام أرقام الأداء — التحليل التفصيلي للمقاييس يتطلب خدمة الذكاء الاصطناعي.",
      en: "Performance metrics received — detailed metric analysis requires the AI service.",
    };
  }

  return result;
}
