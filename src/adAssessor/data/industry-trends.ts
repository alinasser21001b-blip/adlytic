import type { CampaignGoal, IndustryCategory } from "../types";

export interface IndustryTrendData {
  industry: IndustryCategory;
  labelAr: string;
  searchKeywords: Record<CampaignGoal, string[]>;
  successfulPatterns: { ar: string; en: string }[];
  hooks: { ar: string; en: string }[];
  visualTrends: { ar: string; en: string }[];
  ctaPatterns: { ar: string; en: string }[];
  whatWorksMena: { ar: string; en: string }[];
  exampleAdSnippets: { pageName: string; body: string; headline?: string }[];
}

const MENA_PATTERNS = {
  urgency: { ar: "العروض المحدودة بالوقت تُحدث FOMO قوياً في الخليج", en: "Time-limited offers create strong FOMO in the Gulf" },
  socialProof: { ar: "«أكثر من X عميل» و«تقييم 4.9» يبنيان ثقة سريعة", en: "'Over X customers' and '4.9 rating' build quick trust" },
  localDialect: { ar: "اللهجة المحلية (خليجي/مصري) تزيد التفاعل أكثر من الفصحى الرسمية", en: "Local dialect (Gulf/Egyptian) outperforms formal Arabic" },
  whatsapp: { ar: "CTA عبر واتساب يتفوق على «تسوق الآن» للخدمات المحلية", en: "WhatsApp CTA beats 'Shop Now' for local services" },
  mobileFirst: { ar: "90%+ من المشاهدات على الجوال — نص كبير وصورة واضحة", en: "90%+ views on mobile — large text and clear visuals" },
};

export const INDUSTRY_TRENDS: IndustryTrendData[] = [
  {
    industry: "ecommerce",
    labelAr: "التجارة الإلكترونية",
    searchKeywords: {
      sales: ["تسوق", "خصم", "عرض", "online shopping", "sale"],
      traffic: ["متجر", "ecommerce", "shop now"],
      awareness: ["brand", "collection", "مجموعة"],
      leads: ["اشترك", "newsletter", "عرض حصري"],
    },
    successfulPatterns: [
      { ar: "خصم واضح في أول سطر + عدّاد تنازلي", en: "Clear discount in first line + countdown" },
      { ar: "صورة المنتج على خلفية نظيفة مع سعر بارز", en: "Product on clean background with prominent price" },
      MENA_PATTERNS.urgency,
      MENA_PATTERNS.socialProof,
    ],
    hooks: [
      { ar: "«خصم 50% — اليوم فقط»", en: "'50% off — today only'" },
      { ar: "«شحن مجاني لكل الطلبات»", en: "'Free shipping on all orders'" },
      { ar: "«الأكثر مبيعاً هذا الأسبوع»", en: "'Best seller this week'" },
    ],
    visualTrends: [
      { ar: "UGC (مستخدم حقيقي) يتفوق على الصور الاستوديو", en: "UGC outperforms studio shots" },
      { ar: "كاروسيل للمنتجات المتعددة", en: "Carousel for multiple products" },
      { ar: "فيديو قصير 6-15 ثانية للمنتجات", en: "Short 6-15s product videos" },
    ],
    ctaPatterns: [
      { ar: "تسوق الآن / اطلب الآن", en: "Shop Now / Order Now" },
      { ar: "احصل على العرض", en: "Get the Offer" },
    ],
    whatWorksMena: [MENA_PATTERNS.mobileFirst, MENA_PATTERNS.localDialect, MENA_PATTERNS.urgency],
    exampleAdSnippets: [
      { pageName: "متجر إلكتروني — السعودية", body: "🔥 خصم 40% على كل المنتجات — 48 ساعة فقط! شحن مجاني فوق 200 ريال.", headline: "تسوق الآن" },
      { pageName: "Fashion Store AE", body: "مجموعة الصيف وصلت 🌴 أكثر من 10,000 عميل سعيد — اطلب قبل نفاد الكمية", headline: "اكتشف المجموعة" },
    ],
  },
  {
    industry: "saas",
    labelAr: "برمجيات كخدمة",
    searchKeywords: {
      sales: ["software", "SaaS", "اشتراك", "platform"],
      traffic: ["demo", "تجربة مجانية", "free trial"],
      awareness: ["حلول", "digital transformation"],
      leads: ["تسجيل", "webinar", "demo"],
    },
    successfulPatterns: [
      { ar: "مشكلة → حل → نتيجة في 3 جمل", en: "Problem → solution → result in 3 sentences" },
      { ar: "لقطة شاشة للمنتج مع سهم يوضح الميزة", en: "Product screenshot with feature highlight" },
      { ar: "«جرّب مجاناً 14 يوم» كـ hook رئيسي", en: "'Try free for 14 days' as main hook" },
    ],
    hooks: [
      { ar: "«وفر 10 ساعات أسبوعياً»", en: "'Save 10 hours per week'" },
      { ar: "«بدون بطاقة ائتمان»", en: "'No credit card required'" },
    ],
    visualTrends: [
      { ar: "رسوم متحركة للواجهة", en: "UI motion graphics" },
      { ar: "شهادات عملاء B2B", en: "B2B client testimonials" },
    ],
    ctaPatterns: [
      { ar: "ابدأ تجربتك المجانية", en: "Start Free Trial" },
      { ar: "احجز عرضاً توضيحياً", en: "Book a Demo" },
    ],
    whatWorksMena: [
      { ar: "دعم عربي ومحلي مهم للثقة", en: "Arabic and local support matters for trust" },
      MENA_PATTERNS.mobileFirst,
    ],
    exampleAdSnippets: [
      { pageName: "SaaS Platform MENA", body: "هل تضيع وقتك في مهام يدوية؟ منصتنا ت automate 80% من عملك — جرّب مجاناً 14 يوم", headline: "ابدأ الآن" },
    ],
  },
  {
    industry: "real_estate",
    labelAr: "العقارات",
    searchKeywords: {
      sales: ["شقة", "فيلا", "عقار", "real estate", "للبيع"],
      traffic: ["مشروع", "compound", "مجمع سكني"],
      awareness: ["developer", "مطور عقاري"],
      leads: ["استفسار", "حجز زيارة", "موعد"],
    },
    successfulPatterns: [
      { ar: "صورة جوية أو render عالي الجودة", en: "Aerial photo or high-quality render" },
      { ar: "الموقع + السعر + المساحة في headline", en: "Location + price + size in headline" },
      MENA_PATTERNS.whatsapp,
    ],
    hooks: [
      { ar: "«فرصة استثمارية — عائد 8%»", en: "'Investment opportunity — 8% yield'" },
      { ar: "«آخر 3 وحدات»", en: "'Last 3 units'" },
    ],
    visualTrends: [
      { ar: "فيديو جولة داخلية 30 ثانية", en: "30s interior walkthrough video" },
      { ar: "خريطة الموقع مع landmarks", en: "Location map with landmarks" },
    ],
    ctaPatterns: [
      { ar: "تواصل عبر واتساب", en: "Contact via WhatsApp" },
      { ar: "احجز معاينة", en: "Book a Viewing" },
    ],
    whatWorksMena: [
      { ar: "الثقة بالمطور أهم من السعر — اذكر مشاريع سابقة", en: "Developer trust beats price — mention past projects" },
      MENA_PATTERNS.whatsapp,
    ],
    exampleAdSnippets: [
      { pageName: "مطور عقاري — الرياض", body: "شقق فاخرة في حي النرجس — تقسيط حتى 10 سنوات. آخر 5 وحدات بأسعار الإطلاق.", headline: "استفسر عبر واتساب" },
    ],
  },
  {
    industry: "healthcare",
    labelAr: "الرعاية الصحية",
    searchKeywords: {
      sales: ["عيادة", "clinic", "علاج", "healthcare"],
      traffic: ["معلومات", "health tips"],
      awareness: ["طبيب", "مستشفى", "hospital"],
      leads: ["حجز موعد", "استشارة", "appointment"],
    },
    successfulPatterns: [
      { ar: "صورة طبيب/فريق موثوق + credentials", en: "Trusted doctor/team photo + credentials" },
      { ar: "«موعدك خلال 24 ساعة»", en: "'Appointment within 24 hours'" },
    ],
    hooks: [
      { ar: "«استشارة مجانية»", en: "'Free consultation'" },
      { ar: "«أطباء معتمدون»", en: "'Certified doctors'" },
    ],
    visualTrends: [
      { ar: "بيئة نظيفة ومريحة", en: "Clean, calming environment" },
      { ar: "before/after (حسب السياسات)", en: "Before/after (policy-compliant)" },
    ],
    ctaPatterns: [
      { ar: "احجز موعدك", en: "Book Appointment" },
      { ar: "اتصل الآن", en: "Call Now" },
    ],
    whatWorksMena: [
      { ar: "الخصوصية والثقة أهم من العروض", en: "Privacy and trust matter more than discounts" },
      MENA_PATTERNS.whatsapp,
    ],
    exampleAdSnippets: [
      { pageName: "عيادة — دبي", body: "فحص شامل + استشارة مجانية مع أطباء معتمدين. احجز موعدك اليوم — بدون انتظار.", headline: "احجز الآن" },
    ],
  },
  {
    industry: "education",
    labelAr: "التعليم",
    searchKeywords: {
      sales: ["دورة", "course", "تعليم", "training"],
      traffic: ["محتوى تعليمي", "webinar"],
      awareness: ["أكademy", "معهد", "university"],
      leads: ["سجّل", "register", "enroll"],
    },
    successfulPatterns: [
      { ar: "نتيجة واضحة: «تعلم X في Y أسابيع»", en: "Clear outcome: 'Learn X in Y weeks'" },
      { ar: "شهادة أو اعتماد في العنوان", en: "Certificate or accreditation in headline" },
    ],
    hooks: [
      { ar: "«ابدأ مسيرتك المهنية»", en: "'Start your career'" },
      { ar: "«خصم للتسجيل المبكر»", en: "'Early bird discount'" },
    ],
    visualTrends: [
      { ar: "طلاب حقيقيون + instructor", en: "Real students + instructor" },
      { ar: "infographic للمنهج", en: "Curriculum infographic" },
    ],
    ctaPatterns: [
      { ar: "سجّل الآن", en: "Enroll Now" },
      { ar: "حمّل المنهج", en: "Download Syllabus" },
    ],
    whatWorksMena: [
      { ar: "الدورات بالعربي تتفوق على الإنجليزي للجمهور المحلي", en: "Arabic courses outperform English for local audience" },
      MENA_PATTERNS.socialProof,
    ],
    exampleAdSnippets: [
      { pageName: "أكاديمية — مصر", body: "دورة تسويق رقمي معتمدة — 8 أسابيع، مشاريع عملية، شهادة معتمدة. التسجيل مفتوح!", headline: "سجّل الآن" },
    ],
  },
  {
    industry: "food_beverage",
    labelAr: "الأطعمة والمشروبات",
    searchKeywords: {
      sales: ["مطعم", "توصيل", "restaurant", "food delivery"],
      traffic: ["menu", "قائمة", "اطلب"],
      awareness: ["brand", "مطعم", "cafe"],
      leads: ["اشترك", "loyalty", "برنامج ولاء"],
    },
    successfulPatterns: [
      { ar: "صورة طعام شهية close-up", en: "Appetizing food close-up" },
      { ar: "عرض combo واضح بالسعر", en: "Clear combo offer with price" },
      MENA_PATTERNS.urgency,
    ],
    hooks: [
      { ar: "«توصيل مجاني»", en: "'Free delivery'" },
      { ar: "«جرب X مجاناً مع طلبك»", en: "'Try X free with your order'" },
    ],
    visualTrends: [
      { ar: "فيديو سريع لتحضير الطبق", en: "Quick dish preparation video" },
      { ar: "ألوان دافئة وشهية", en: "Warm, appetizing colors" },
    ],
    ctaPatterns: [
      { ar: "اطلب الآن", en: "Order Now" },
      { ar: "احصل على العرض", en: "Get Offer" },
    ],
    whatWorksMena: [MENA_PATTERNS.mobileFirst, MENA_PATTERNS.localDialect],
    exampleAdSnippets: [
      { pageName: "مطعم — جدة", body: "🍔 برجر + بطاطس + مشروب = 29 ريال فقط! توصيل خلال 30 دقيقة.", headline: "اطلب الآن" },
    ],
  },
  {
    industry: "fashion",
    labelAr: "الأزياء والجمال",
    searchKeywords: {
      sales: ["fashion", "ملابس", "beauty", "مكياج"],
      traffic: ["collection", "مجموعة", "new arrival"],
      awareness: ["brand", "designer"],
      leads: ["اشترك", "VIP", "exclusive"],
    },
    successfulPatterns: [
      { ar: "model/influencer يرتدي المنتج", en: "Model/influencer wearing product" },
      { ar: "before/after للجمال", en: "Beauty before/after" },
      MENA_PATTERNS.socialProof,
    ],
    hooks: [
      { ar: "«مجموعة Ramadan/الصيف»", en: "'Ramadan/Summer collection'" },
      { ar: "«خصم VIP حصري»", en: "'Exclusive VIP discount'" },
    ],
    visualTrends: [
      { ar: "Reels-style vertical video", en: "Reels-style vertical video" },
      { ar: "lifestyle shots وليس product-only", en: "Lifestyle shots not product-only" },
    ],
    ctaPatterns: [
      { ar: "تسوق المجموعة", en: "Shop Collection" },
      { ar: "اكتشف المزيد", en: "Discover More" },
    ],
    whatWorksMena: [
      { ar: "التأثيرات المحلية (micro-influencers) أفضل من المشاهير", en: "Local micro-influencers beat celebrities" },
      MENA_PATTERNS.mobileFirst,
    ],
    exampleAdSnippets: [
      { pageName: "Brand Fashion — AE", body: "مجموعة العيد وصلت ✨ أناقة عربية بلمسة عصرية — خصم 25% للطلبات الأولى", headline: "تسوق الآن" },
    ],
  },
  {
    industry: "finance",
    labelAr: "المالية والتأمين",
    searchKeywords: {
      sales: ["تمويل", "loan", "finance", "insurance"],
      traffic: ["calculator", "حاسبة", "compare"],
      awareness: ["bank", "بنك", "financial"],
      leads: ["استفسار", "apply", "تقديم"],
    },
    successfulPatterns: [
      { ar: "أرقام واضحة: نسبة، مدة، مبلغ", en: "Clear numbers: rate, term, amount" },
      { ar: "trust badges وتراخيص", en: "Trust badges and licenses" },
    ],
    hooks: [
      { ar: "«موافقة خلال 24 ساعة»", en: "'Approval within 24 hours'" },
      { ar: "«بدون رسوم مخفية»", en: "'No hidden fees'" },
    ],
    visualTrends: [
      { ar: "تصميم نظيف واحترافي", en: "Clean professional design" },
      { ar: "infographic للمقارنة", en: "Comparison infographic" },
    ],
    ctaPatterns: [
      { ar: "قدّم الآن", en: "Apply Now" },
      { ar: "احسب قسطك", en: "Calculate Your Payment" },
    ],
    whatWorksMena: [
      { ar: "الشفافية في الرسوم والشروط ضرورية", en: "Fee and terms transparency is essential" },
    ],
    exampleAdSnippets: [
      { pageName: "بنك — السعودية", body: "تمويل شخصي بمرونة — موافقة سريعة، أقساط تبدأ من 500 ريال. بدون رسوم إدارية.", headline: "قدّم طلبك" },
    ],
  },
  {
    industry: "travel",
    labelAr: "السفر والسياحة",
    searchKeywords: {
      sales: ["رحلة", "travel", "hotel", "package"],
      traffic: ["destination", "وجهة", "tourism"],
      awareness: ["agency", "وكالة سفر"],
      leads: ["استفسار", "quote", "عرض سعر"],
    },
    successfulPatterns: [
      { ar: "صورة وجهة خلابة + سعر شامل", en: "Stunning destination + all-inclusive price" },
      { ar: "«X ليالٍ + طيران + فندق»", en: "'X nights + flight + hotel'" },
    ],
    hooks: [
      { ar: "«عرض محدود — X مقاعد»", en: "'Limited offer — X seats'" },
      { ar: "«وجهة الأحلام بأسعار لا تُصدَّق»", en: "'Dream destination at unbelievable prices'" },
    ],
    visualTrends: [
      { ar: "drone shots وفيديو وجهة", en: "Drone shots and destination video" },
      { ar: "UGC من مسافرين", en: "Traveler UGC" },
    ],
    ctaPatterns: [
      { ar: "احجز رحلتك", en: "Book Your Trip" },
      { ar: "اطلب عرض سعر", en: "Get a Quote" },
    ],
    whatWorksMena: [MENA_PATTERNS.urgency, MENA_PATTERNS.socialProof],
    exampleAdSnippets: [
      { pageName: "وكالة سفر — الكويت", body: "🇹🇷 اسطنbul 5 أيام — طيران + فندق 4 نجوم + جولات = 899 د.ك فقط!", headline: "احجز الآن" },
    ],
  },
  {
    industry: "local_business",
    labelAr: "أعمال محلية",
    searchKeywords: {
      sales: ["خدمة", "service", "local", "محلي"],
      traffic: ["موقع", "location", "near me"],
      awareness: ["business", "محل", "store"],
      leads: ["اتصل", "contact", "quote"],
    },
    successfulPatterns: [
      { ar: "خدمة + منطقة + رقم تواصل", en: "Service + area + contact number" },
      MENA_PATTERNS.whatsapp,
      MENA_PATTERNS.socialProof,
    ],
    hooks: [
      { ar: "«خدمة في [الحي/المدينة]»", en: "'Service in [neighborhood/city]'" },
      { ar: "«استجابة خلال ساعة»", en: "'Response within an hour'" },
    ],
    visualTrends: [
      { ar: "صور قبل/بعد للخدمات", en: "Before/after for services" },
      { ar: "فريق العمل المحلي", en: "Local team photos" },
    ],
    ctaPatterns: [
      { ar: "تواصل عبر واتساب", en: "Contact via WhatsApp" },
      { ar: "اطلب عرض سعر", en: "Request Quote" },
    ],
    whatWorksMena: [MENA_PATTERNS.whatsapp, MENA_PATTERNS.localDialect],
    exampleAdSnippets: [
      { pageName: "خدمات منزلية — الرياض", body: "تنظيف منازل احترافي في الرياض — فريق معتمد، أسعار ثابتة. تواصل واتساب للحجز الفوري.", headline: "احجز الآن" },
    ],
  },
  {
    industry: "automotive",
    labelAr: "السيارات",
    searchKeywords: {
      sales: ["سيارة", "car", "automotive", "dealership"],
      traffic: ["showroom", "test drive"],
      awareness: ["brand", "model", "موديل"],
      leads: ["استفسار", "test drive", "تجربة قيادة"],
    },
    successfulPatterns: [
      { ar: "صورة السيارة + السعر/التقسيط", en: "Car photo + price/financing" },
      { ar: "«0% down payment» أو «تقسيط مريح»", en: "'0% down' or 'Easy installments'" },
    ],
    hooks: [
      { ar: "«2025 models — وصلت»", en: "'2025 models — now available'" },
      { ar: "«عرض نهاية الموسم»", en: "'End of season offer'" },
    ],
    visualTrends: [
      { ar: "فيديو قيادة/جولة", en: "Drive/walkaround video" },
      { ar: "interior luxury shots", en: "Interior luxury shots" },
    ],
    ctaPatterns: [
      { ar: "احجز تجربة قيادة", en: "Book Test Drive" },
      { ar: "اطلب عرض سعر", en: "Get Quote" },
    ],
    whatWorksMena: [
      { ar: "التقسيط والضمان أهم من الخصم", en: "Financing and warranty beat discounts" },
    ],
    exampleAdSnippets: [
      { pageName: "معرض سيارات — الإمارات", body: "SUV 2025 — تقسيط 0% down، ضمان 5 سنوات. جرّب القيادة هذا الأسبوع.", headline: "احجز تجربة قيادة" },
    ],
  },
  {
    industry: "entertainment",
    labelAr: "الترفيه",
    searchKeywords: {
      sales: ["ticket", "تذكرة", "event", "concert"],
      traffic: ["show", "عرض", "entertainment"],
      awareness: ["brand", "venue"],
      leads: ["subscribe", "notify", "notify me"],
    },
    successfulPatterns: [
      { ar: "poster جذاب + تاريخ + venue", en: "Eye-catching poster + date + venue" },
      MENA_PATTERNS.urgency,
    ],
    hooks: [
      { ar: "«بيعت 80% من التذاكر»", en: "'80% of tickets sold'" },
      { ar: "«early bird — X% off»", en: "'Early bird — X% off'" },
    ],
    visualTrends: [
      { ar: "فيديو teaser قصير", en: "Short teaser video" },
      { ar: "celebrity/influencer promo", en: "Celebrity/influencer promo" },
    ],
    ctaPatterns: [
      { ar: "احجز تذكرتك", en: "Book Your Ticket" },
      { ar: "اشترِ الآن", en: "Buy Now" },
    ],
    whatWorksMena: [MENA_PATTERNS.urgency, MENA_PATTERNS.socialProof],
    exampleAdSnippets: [
      { pageName: "Events — KSA", body: "🎤 حفل [فنان] — 15 مارس الرياض. تذاكر VIP متبقية — لا تفوّت!", headline: "احجز الآن" },
    ],
  },
  {
    industry: "other",
    labelAr: "أخرى",
    searchKeywords: {
      sales: ["offer", "عرض", "sale", "discount"],
      traffic: ["learn more", "اكتشف"],
      awareness: ["brand", "company"],
      leads: ["contact", "sign up", "سجّل"],
    },
    successfulPatterns: [
      { ar: "رسالة واحدة واضحة في أول 3 ثوانٍ", en: "One clear message in first 3 seconds" },
      MENA_PATTERNS.mobileFirst,
      MENA_PATTERNS.localDialect,
    ],
    hooks: [
      { ar: "«عرض حصري»", en: "'Exclusive offer'" },
      { ar: "«اكتشف المزيد»", en: "'Discover more'" },
    ],
    visualTrends: [
      { ar: "صورة عالية الجودة مع نص قليل", en: "High-quality image with minimal text" },
    ],
    ctaPatterns: [
      { ar: "تعرّف أكثر", en: "Learn More" },
      { ar: "تواصل معنا", en: "Contact Us" },
    ],
    whatWorksMena: [MENA_PATTERNS.mobileFirst, MENA_PATTERNS.whatsapp],
    exampleAdSnippets: [
      { pageName: "Business — MENA", body: "نقدّم حلولاً مبتكرة لعملك — تواصل معنا اليوم لعرض مجاني.", headline: "تواصل الآن" },
    ],
  },
];

export function getIndustryTrends(industry: string): IndustryTrendData {
  return (
    INDUSTRY_TRENDS.find((t) => t.industry === industry) ??
    INDUSTRY_TRENDS.find((t) => t.industry === "other")!
  );
}

export function buildSearchTerms(industry: string, goal: CampaignGoal): string {
  const trends = getIndustryTrends(industry);
  const keywords = trends.searchKeywords[goal] ?? trends.searchKeywords.sales;
  return keywords.slice(0, 3).join(" ");
}

export function buildCuratedTrendSummary(
  industry: string,
  goal: CampaignGoal,
): {
  summaryAr: string;
  summaryEn: string;
  hooks: string[];
  ctaPatterns: string[];
  themes: string[];
  copyLengthInsight: string;
  exampleAds: { pageName: string; body: string; headline?: string }[];
} {
  const trends = getIndustryTrends(industry);
  const goalKeywords = trends.searchKeywords[goal] ?? trends.searchKeywords.sales;
  const hooks = trends.hooks.map((h) => h.ar);
  const ctaPatterns = trends.ctaPatterns.map((c) => c.ar);
  const themes = trends.successfulPatterns.map((p) => p.ar);

  const summaryAr = [
    `في مجال ${trends.labelAr}، الإعلانات الناجحة في MENA عادةً:`,
    ...trends.whatWorksMena.map((w) => `• ${w.ar}`),
    ...trends.visualTrends.slice(0, 2).map((v) => `• ${v.ar}`),
    `• كلمات بحث شائعة لهدفك: ${goalKeywords.slice(0, 3).join("، ")}`,
  ].join("\n");

  const summaryEn = [
    `In ${trends.labelAr}, successful MENA ads typically:`,
    ...trends.whatWorksMena.map((w) => `• ${w.en}`),
    ...trends.visualTrends.slice(0, 2).map((v) => `• ${v.en}`),
    `• Common search terms for your goal: ${goalKeywords.slice(0, 3).join(", ")}`,
  ].join("\n");

  return {
    summaryAr,
    summaryEn,
    hooks,
    ctaPatterns,
    themes,
    copyLengthInsight: "النصوص القصيرة (50-120 حرف) للـ hook + تفاصيل في headline تتفوق على الفقرات الطويلة",
    exampleAds: trends.exampleAdSnippets.slice(0, 3),
  };
}
