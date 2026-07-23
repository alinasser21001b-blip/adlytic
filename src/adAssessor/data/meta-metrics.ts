import type {
  BenchmarkRange,
  CampaignGoal,
  MetricDefinition,
  MetaObjective,
} from "../types";

export const CAMPAIGN_GOALS: {
  value: CampaignGoal;
  labelAr: string;
  labelEn: string;
  objective: MetaObjective;
}[] = [
  { value: "sales", labelAr: "أريد مبيعات", labelEn: "I want sales", objective: "OUTCOME_SALES" },
  { value: "traffic", labelAr: "أريد زيارات للموقع", labelEn: "I want website visits", objective: "OUTCOME_TRAFFIC" },
  { value: "awareness", labelAr: "أريد تعريف بالعلامة", labelEn: "I want brand awareness", objective: "OUTCOME_AWARENESS" },
  { value: "leads", labelAr: "أريد عملاء محتملين", labelEn: "I want leads", objective: "OUTCOME_LEADS" },
];

export function goalToObjective(goal: CampaignGoal): MetaObjective {
  return CAMPAIGN_GOALS.find((g) => g.value === goal)?.objective ?? "OUTCOME_SALES";
}

export const OBJECTIVES: { value: MetaObjective; labelAr: string; labelEn: string }[] = [
  { value: "OUTCOME_AWARENESS", labelAr: "الوعي بالعلامة", labelEn: "Awareness" },
  { value: "OUTCOME_TRAFFIC", labelAr: "الزيارات", labelEn: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", labelAr: "التفاعل", labelEn: "Engagement" },
  { value: "OUTCOME_LEADS", labelAr: "جمع العملاء المحتملين", labelEn: "Leads" },
  { value: "OUTCOME_APP_PROMOTION", labelAr: "ترويج التطبيق", labelEn: "App Promotion" },
  { value: "OUTCOME_SALES", labelAr: "المبيعات والتحويلات", labelEn: "Sales / Conversions" },
];

export const INDUSTRIES = [
  { value: "ecommerce", labelAr: "التجارة الإلكترونية", labelEn: "E-commerce" },
  { value: "saas", labelAr: "برمجيات كخدمة (SaaS)", labelEn: "SaaS" },
  { value: "real_estate", labelAr: "العقارات", labelEn: "Real Estate" },
  { value: "healthcare", labelAr: "الرعاية الصحية", labelEn: "Healthcare" },
  { value: "education", labelAr: "التعليم", labelEn: "Education" },
  { value: "food_beverage", labelAr: "الأطعمة والمشروبات", labelEn: "Food & Beverage" },
  { value: "fashion", labelAr: "الأزياء والجمال", labelEn: "Fashion & Beauty" },
  { value: "finance", labelAr: "المالية والتأمين", labelEn: "Finance & Insurance" },
  { value: "travel", labelAr: "السفر والسياحة", labelEn: "Travel & Tourism" },
  { value: "local_business", labelAr: "أعمال محلية", labelEn: "Local Business" },
  { value: "automotive", labelAr: "السيارات", labelEn: "Automotive" },
  { value: "entertainment", labelAr: "الترفيه", labelEn: "Entertainment" },
  { value: "other", labelAr: "أخرى", labelEn: "Other" },
];

export const CTA_OPTIONS = [
  "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "DOWNLOAD", "BOOK_NOW",
  "GET_OFFER", "CONTACT_US", "APPLY_NOW", "SUBSCRIBE", "WHATSAPP_MESSAGE",
];

export const QUALITY_RANKINGS = [
  "ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE_35", "BELOW_AVERAGE_20", "BELOW_AVERAGE_10", "UNKNOWN",
];

export const METRIC_CATEGORIES = [
  { id: "delivery", labelAr: "التوصيل والوصول", labelEn: "Delivery & Reach" },
  { id: "engagement", labelAr: "التفاعل والنقرات", labelEn: "Engagement & Clicks" },
  { id: "cost", labelAr: "التكلفة والكفاءة", labelEn: "Cost & Efficiency" },
  { id: "conversion", labelAr: "التحويلات والنتائج", labelEn: "Conversions & Results" },
  { id: "video", labelAr: "مقاييس الفيديو", labelEn: "Video Metrics" },
  { id: "funnel", labelAr: "قمع المبيعات", labelEn: "Funnel Metrics" },
  { id: "quality", labelAr: "الجودة والتصنيف", labelEn: "Quality Rankings" },
  { id: "messaging", labelAr: "الرسائل والتطبيقات", labelEn: "Messaging & Apps" },
];

export const METRICS: MetricDefinition[] = [
  // Delivery
  { id: "impressions", apiField: "impressions", labelAr: "مرات الظهور", labelEn: "Impressions", category: "delivery", unit: "count", descriptionAr: "عدد مرات ظهور الإعلان على الشاشة", descriptionEn: "Times ad was on screen", inputType: "number" },
  { id: "reach", apiField: "reach", labelAr: "الوصول", labelEn: "Reach", category: "delivery", unit: "people", descriptionAr: "عدد الأشخاص الفريدين الذين شاهدوا الإعلان", descriptionEn: "Unique people who saw the ad", inputType: "number" },
  { id: "frequency", apiField: "frequency", labelAr: "التكرار", labelEn: "Frequency", category: "delivery", formula: "impressions ÷ reach", descriptionAr: "متوسط مرات مشاهدة نفس الشخص للإعلان", descriptionEn: "Avg times each person saw the ad", inputType: "number" },
  { id: "spend", apiField: "spend", labelAr: "المبلغ المنفق", labelEn: "Amount Spent", category: "delivery", unit: "currency", descriptionAr: "إجمالي الإنفاق على الحملة", descriptionEn: "Total ad spend", inputType: "currency" },

  // Engagement
  { id: "clicks", apiField: "clicks", labelAr: "النقرات (الكل)", labelEn: "Clicks (All)", category: "engagement", unit: "count", descriptionAr: "جميع أنواع النقرات بما فيها التفاعلات", descriptionEn: "All click types including social interactions", inputType: "number", optional: true },
  { id: "link_clicks", apiField: "inline_link_clicks", labelAr: "نقرات الرابط", labelEn: "Link Clicks", category: "engagement", unit: "count", descriptionAr: "نقرات على روابط الوجهة", descriptionEn: "Clicks on destination links", inputType: "number" },
  { id: "outbound_clicks", apiField: "outbound_clicks", labelAr: "النقرات الخارجية", labelEn: "Outbound Clicks", category: "engagement", unit: "count", descriptionAr: "نقرات تخرج من منصات Meta", descriptionEn: "Clicks leaving Meta properties", inputType: "number", optional: true },
  { id: "ctr", apiField: "ctr", labelAr: "معدل النقر (CTR)", labelEn: "CTR (All)", category: "engagement", unit: "%", formula: "(clicks ÷ impressions) × 100", descriptionAr: "نسبة النقرات من مرات الظهور", descriptionEn: "Click-through rate for all clicks", inputType: "percent" },
  { id: "link_ctr", apiField: "inline_link_click_ctr", labelAr: "معدل نقر الرابط", labelEn: "Link CTR", category: "engagement", unit: "%", descriptionAr: "نسبة نقرات الرابط من مرات الظهور", descriptionEn: "Link click-through rate", inputType: "percent" },
  { id: "landing_page_views", apiField: "landing_page_view", labelAr: "مشاهدات صفحة الهبوط", labelEn: "Landing Page Views", category: "engagement", unit: "count", descriptionAr: "مرات تحميل صفحة الهبوط بالكامل", descriptionEn: "Times landing page fully loaded", inputType: "number", optional: true },
  { id: "post_engagement", apiField: "post_engagement", labelAr: "تفاعل المنشور", labelEn: "Post Engagement", category: "engagement", unit: "count", descriptionAr: "إجمالي تفاعلات المنشور", descriptionEn: "Total post engagements", inputType: "number", optional: true },
  { id: "page_engagement", apiField: "page_engagement", labelAr: "تفاعل الصفحة", labelEn: "Page Engagement", category: "engagement", unit: "count", descriptionAr: "تفاعلات مع صفحة فيسبوك", descriptionEn: "Facebook page engagements", inputType: "number", optional: true },

  // Cost
  { id: "cpm", apiField: "cpm", labelAr: "تكلفة الألف ظهور (CPM)", labelEn: "CPM", category: "cost", unit: "currency", formula: "(spend ÷ impressions) × 1000", descriptionAr: "التكلفة لكل 1000 ظهور", descriptionEn: "Cost per 1,000 impressions", inputType: "currency" },
  { id: "cpc", apiField: "cpc", labelAr: "تكلفة النقرة (CPC)", labelEn: "CPC (All)", category: "cost", unit: "currency", formula: "spend ÷ clicks", descriptionAr: "متوسط تكلفة النقرة", descriptionEn: "Average cost per click", inputType: "currency" },
  { id: "cpc_link", apiField: "cost_per_inline_link_click", labelAr: "تكلفة نقر الرابط", labelEn: "CPC (Link Click)", category: "cost", unit: "currency", descriptionAr: "تكلفة كل نقرة رابط", descriptionEn: "Cost per link click", inputType: "currency" },
  { id: "cpp", apiField: "cpp", labelAr: "تكلفة الوصول (CPP)", labelEn: "CPP", category: "cost", unit: "currency", formula: "(spend ÷ reach) × 1000", descriptionAr: "تكلفة الوصول لكل 1000 شخص", descriptionEn: "Cost per 1,000 people reached", inputType: "currency", optional: true },
  { id: "cost_per_result", apiField: "cost_per_result", labelAr: "تكلفة النتيجة", labelEn: "Cost Per Result", category: "cost", unit: "currency", descriptionAr: "متوسط تكلفة كل نتيجة حسب الهدف", descriptionEn: "Average cost per objective result", inputType: "currency" },

  // Conversions
  { id: "results", apiField: "results", labelAr: "النتائج", labelEn: "Results", category: "conversion", unit: "count", descriptionAr: "عدد النتائج حسب هدف الحملة", descriptionEn: "Outcomes based on campaign objective", inputType: "number" },
  { id: "result_rate", apiField: "result_rate", labelAr: "معدل النتائج", labelEn: "Result Rate", category: "conversion", unit: "%", descriptionAr: "نسبة مرات الظهور التي أنتجت نتيجة", descriptionEn: "Percentage of impressions with a result", inputType: "percent", optional: true },
  { id: "purchases", apiField: "purchase", labelAr: "المشتريات", labelEn: "Purchases", category: "conversion", unit: "count", descriptionAr: "عدد عمليات الشراء المنسوبة", descriptionEn: "Attributed purchase events", inputType: "number", optional: true },
  { id: "purchase_value", apiField: "purchase_value", labelAr: "قيمة المشتريات", labelEn: "Purchase Value", category: "conversion", unit: "currency", descriptionAr: "إجمالي قيمة المبيعات", descriptionEn: "Total purchase value", inputType: "currency", optional: true },
  { id: "roas", apiField: "purchase_roas", labelAr: "عائد الإعلان (ROAS)", labelEn: "ROAS", category: "conversion", unit: "x", formula: "purchase value ÷ spend", descriptionAr: "العائد على كل دولار منفق", descriptionEn: "Return on ad spend", inputType: "number" },
  { id: "cpa", apiField: "cost_per_action_type", labelAr: "تكلفة الاكتساب (CPA)", labelEn: "CPA", category: "conversion", unit: "currency", descriptionAr: "تكلفة كل تحويل أو شراء", descriptionEn: "Cost per acquisition/conversion", inputType: "currency", optional: true },
  { id: "leads", apiField: "lead", labelAr: "العملاء المحتملين", labelEn: "Leads", category: "conversion", unit: "count", descriptionAr: "عدد العملاء المحتملين", descriptionEn: "Lead form submissions", inputType: "number", optional: true },
  { id: "cpl", apiField: "cost_per_lead", labelAr: "تكلفة العميل المحتمل (CPL)", labelEn: "CPL", category: "conversion", unit: "currency", descriptionAr: "تكلفة كل عميل محتمل", descriptionEn: "Cost per lead", inputType: "currency", optional: true },
  { id: "conversion_rate", apiField: "conversion_rate", labelAr: "معدل التحويل", labelEn: "Conversion Rate", category: "conversion", unit: "%", descriptionAr: "نسبة الزوار الذين حولوا", descriptionEn: "Percentage of visitors who converted", inputType: "percent", optional: true },
  { id: "app_installs", apiField: "app_install", labelAr: "تثبيتات التطبيق", labelEn: "App Installs", category: "conversion", unit: "count", descriptionAr: "عدد تثبيتات التطبيق", descriptionEn: "Mobile app installs", inputType: "number", optional: true },
  { id: "cpi", apiField: "cost_per_app_install", labelAr: "تكلفة التثبيت (CPI)", labelEn: "CPI", category: "conversion", unit: "currency", descriptionAr: "تكلفة كل تثبيت تطبيق", descriptionEn: "Cost per install", inputType: "currency", optional: true },

  // Funnel
  { id: "add_to_cart", apiField: "offsite_conversion.fb_pixel_add_to_cart", labelAr: "إضافة للسلة", labelEn: "Add to Cart", category: "funnel", unit: "count", descriptionAr: "إضافات المنتج للسلة", descriptionEn: "Add to cart events", inputType: "number", optional: true },
  { id: "initiate_checkout", apiField: "offsite_conversion.fb_pixel_initiate_checkout", labelAr: "بدء الدفع", labelEn: "Initiate Checkout", category: "funnel", unit: "count", descriptionAr: "بدء عملية الدفع", descriptionEn: "Checkout initiated", inputType: "number", optional: true },
  { id: "view_content", apiField: "offsite_conversion.fb_pixel_view_content", labelAr: "مشاهدة المحتوى", labelEn: "View Content", category: "funnel", unit: "count", descriptionAr: "مشاهدات صفحات المنتج", descriptionEn: "Content/product page views", inputType: "number", optional: true },
  { id: "complete_registration", apiField: "offsite_conversion.fb_pixel_complete_registration", labelAr: "إكمال التسجيل", labelEn: "Complete Registration", category: "funnel", unit: "count", descriptionAr: "إكمال التسجيل أو الاشتراك", descriptionEn: "Registration completions", inputType: "number", optional: true },

  // Video
  { id: "video_views", apiField: "video_view", labelAr: "مشاهدات الفيديو", labelEn: "Video Views", category: "video", unit: "count", descriptionAr: "مشاهدات الفيدio لمدة 3 ثوانٍ على الأقل", descriptionEn: "3-second video views", inputType: "number", optional: true },
  { id: "thruplay", apiField: "video_thruplay_watched_actions", labelAr: "ThruPlay", labelEn: "ThruPlay", category: "video", unit: "count", descriptionAr: "مشاهدة 15 ثانية أو اكتمال الفيديو", descriptionEn: "15s views or full video completion", inputType: "number", optional: true },
  { id: "video_p25", apiField: "video_p25_watched_actions", labelAr: "مشاهدة 25%", labelEn: "Video 25% Watched", category: "video", unit: "count", descriptionAr: "مشاهدة 25% من الفيديو", descriptionEn: "Watched 25% of video", inputType: "number", optional: true },
  { id: "video_p50", apiField: "video_p50_watched_actions", labelAr: "مشاهدة 50%", labelEn: "Video 50% Watched", category: "video", unit: "count", descriptionAr: "مشاهدة 50% من الفideo", descriptionEn: "Watched 50% of video", inputType: "number", optional: true },
  { id: "video_p75", apiField: "video_p75_watched_actions", labelAr: "مشاهدة 75%", labelEn: "Video 75% Watched", category: "video", unit: "count", descriptionAr: "مشاهدة 75% من الفيديو", descriptionEn: "Watched 75% of video", inputType: "number", optional: true },
  { id: "video_p100", apiField: "video_p100_watched_actions", labelAr: "مشاهدة 100%", labelEn: "Video Completion", category: "video", unit: "count", descriptionAr: "إكمال مشاهدة الفيديو", descriptionEn: "Full video completion", inputType: "number", optional: true },
  { id: "cost_per_thruplay", apiField: "cost_per_thruplay", labelAr: "تكلفة ThruPlay", labelEn: "Cost Per ThruPlay", category: "video", unit: "currency", descriptionAr: "تكلفة كل مشاهدة ThruPlay", descriptionEn: "Cost per ThruPlay view", inputType: "currency", optional: true },

  // Quality
  { id: "quality_ranking", apiField: "quality_ranking", labelAr: "تصنيف الجودة", labelEn: "Quality Ranking", category: "quality", descriptionAr: "جودة الإعلان مقارنة بالمنافسين", descriptionEn: "Ad quality vs competitors", inputType: "select", optional: true },
  { id: "engagement_ranking", apiField: "engagement_rate_ranking", labelAr: "تصنيف التفاعل", labelEn: "Engagement Rate Ranking", category: "quality", descriptionAr: "معدل التفاعل المتوقع", descriptionEn: "Expected engagement rate ranking", inputType: "select", optional: true },
  { id: "conversion_ranking", apiField: "conversion_rate_ranking", labelAr: "تصنيف التحويل", labelEn: "Conversion Rate Ranking", category: "quality", descriptionAr: "معدل التحويل المتوقع", descriptionEn: "Expected conversion rate ranking", inputType: "select", optional: true },

  // Messaging
  { id: "messaging_conversations", apiField: "onsite_conversion.messaging_conversation_started_7d", labelAr: "محادثات Messenger", labelEn: "Messaging Conversations", category: "messaging", unit: "count", descriptionAr: "محادثات Messenger التي بدأت", descriptionEn: "Messenger conversations started", inputType: "number", optional: true },
  { id: "whatsapp_clicks", apiField: "click_to_whatsapp", labelAr: "نقرات واتساب", labelEn: "WhatsApp Clicks", category: "messaging", unit: "count", descriptionAr: "نقرات للتواصل عبر واتساب", descriptionEn: "Click to WhatsApp actions", inputType: "number", optional: true },
];

export const BENCHMARKS: Record<MetaObjective, Record<string, BenchmarkRange>> = {
  // Floors/ranges aligned with public Meta 2025–2026 objective benchmarks
  // (Focus Digital / industry summaries). Account baselines still override.
  OUTCOME_AWARENESS: {
    cpm: { good: { max: 10 }, average: { min: 10, max: 18 }, poor: { min: 18 }, unit: "USD" },
    frequency: { good: { max: 2.5 }, average: { min: 2.5, max: 4 }, poor: { min: 4 }, unit: "x" },
    // Brand/reach CTR is naturally lower than traffic/lead objectives.
    ctr: { good: { min: 1.0 }, average: { min: 0.6, max: 1.0 }, poor: { max: 0.6 }, unit: "%" },
  },
  OUTCOME_TRAFFIC: {
    cpc_link: { good: { max: 0.8 }, average: { min: 0.8, max: 1.5 }, poor: { min: 1.5 }, unit: "USD" },
    link_ctr: { good: { min: 1.5 }, average: { min: 0.9, max: 1.5 }, poor: { max: 0.9 }, unit: "%" },
    cpm: { good: { max: 12 }, average: { min: 12, max: 22 }, poor: { min: 22 }, unit: "USD" },
  },
  OUTCOME_ENGAGEMENT: {
    cpc: { good: { max: 0.35 }, average: { min: 0.35, max: 0.7 }, poor: { min: 0.7 }, unit: "USD" },
    ctr: { good: { min: 2 }, average: { min: 1.2, max: 2 }, poor: { max: 1.2 }, unit: "%" },
    frequency: { good: { max: 3 }, average: { min: 3, max: 5 }, poor: { min: 5 }, unit: "x" },
  },
  OUTCOME_LEADS: {
    cpl: { good: { max: 18 }, average: { min: 18, max: 40 }, poor: { min: 40 }, unit: "USD" },
    conversion_rate: { good: { min: 8 }, average: { min: 3, max: 8 }, poor: { max: 3 }, unit: "%" },
    link_ctr: { good: { min: 1.5 }, average: { min: 0.8, max: 1.5 }, poor: { max: 0.8 }, unit: "%" },
  },
  OUTCOME_APP_PROMOTION: {
    cpi: { good: { max: 2.5 }, average: { min: 2.5, max: 5 }, poor: { min: 5 }, unit: "USD" },
    ctr: { good: { min: 1.5 }, average: { min: 0.8, max: 1.5 }, poor: { max: 0.8 }, unit: "%" },
  },
  OUTCOME_SALES: {
    roas: { good: { min: 2.5 }, average: { min: 1.5, max: 2.5 }, poor: { max: 1.5 }, unit: "x" },
    cpa: { good: { max: 28 }, average: { min: 28, max: 55 }, poor: { min: 55 }, unit: "USD" },
    conversion_rate: { good: { min: 2.5 }, average: { min: 1, max: 2.5 }, poor: { max: 1 }, unit: "%" },
    add_to_cart_rate: { good: { min: 8 }, average: { min: 4, max: 8 }, poor: { max: 4 }, unit: "%" },
  },
};

export const CAMPAIGN_DIMENSIONS = [
  { field: "objective", labelAr: "هدف الحملة", labelEn: "Campaign Objective" },
  { field: "bid_strategy", labelAr: "استراتيجية المزايدة", labelEn: "Bid Strategy" },
  { field: "buying_type", labelAr: "نوع الشراء", labelEn: "Buying Type" },
  { field: "daily_budget", labelAr: "الميزانية اليومية", labelEn: "Daily Budget" },
  { field: "lifetime_budget", labelAr: "الميزانية الإجمالية", labelEn: "Lifetime Budget" },
  { field: "attribution_setting", labelAr: "نافذة الإسناد", labelEn: "Attribution Window" },
  { field: "special_ad_category", labelAr: "فئة الإعلان الخاص", labelEn: "Special Ad Category" },
  { field: "learning_stage", labelAr: "مرحلة التعلم", labelEn: "Learning Stage" },
];

export const ADSET_DIMENSIONS = [
  { field: "optimization_goal", labelAr: "هدف التحسين", labelEn: "Optimization Goal" },
  { field: "billing_event", labelAr: "حدث الفوترة", labelEn: "Billing Event" },
  { field: "destination_type", labelAr: "نوع الوجهة", labelEn: "Destination Type" },
  { field: "placement", labelAr: "مواضع العرض", labelEn: "Placements" },
  { field: "target_age", labelAr: "الفئة العمرية", labelEn: "Age Targeting" },
  { field: "target_gender", labelAr: "الجنس", labelEn: "Gender Targeting" },
  { field: "target_location", labelAr: "الموقع الجغرافي", labelEn: "Geo Targeting" },
  { field: "custom_audience", labelAr: "جمهور مخصص", labelEn: "Custom Audience" },
  { field: "lookalike", labelAr: "جمهور مشابه", labelEn: "Lookalike Audience" },
];

export const CREATIVE_DIMENSIONS = [
  { field: "format", labelAr: "صيغة الإعلان", labelEn: "Ad Format" },
  { field: "primary_text", labelAr: "النص الأساسي", labelEn: "Primary Text" },
  { field: "headline", labelAr: "العنوان", labelEn: "Headline" },
  { field: "description", labelAr: "الوصف", labelEn: "Description" },
  { field: "call_to_action", labelAr: "زر الدعوة للإجراء", labelEn: "Call to Action" },
  { field: "link_url", labelAr: "رابط الوجهة", labelEn: "Destination URL" },
  { field: "video_length", labelAr: "مدة الفيديو", labelEn: "Video Length" },
  { field: "aspect_ratio", labelAr: "نسبة العرض", labelEn: "Aspect Ratio" },
];

export function getMetricsByCategory(categoryId: string): MetricDefinition[] {
  return METRICS.filter((m) => m.category === categoryId);
}

export function getPrimaryKpis(objective: MetaObjective): string[] {
  const map: Record<MetaObjective, string[]> = {
    OUTCOME_AWARENESS: ["cpm", "reach", "frequency"],
    OUTCOME_TRAFFIC: ["cpc_link", "link_ctr", "landing_page_views"],
    OUTCOME_ENGAGEMENT: ["cpc", "post_engagement", "ctr"],
    OUTCOME_LEADS: ["cpl", "leads", "conversion_rate"],
    OUTCOME_APP_PROMOTION: ["cpi", "app_installs", "ctr"],
    OUTCOME_SALES: ["roas", "cpa", "purchases", "conversion_rate"],
  };
  return map[objective];
}
