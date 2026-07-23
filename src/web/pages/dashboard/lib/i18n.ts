// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/lib/i18n.ts
//
//  Client-side i18n helpers for the dashboard. Exported as a JS string
//  that gets interpolated inside the page's IIFE `<script>` block.
//
//  Depends on: `state.locale` (defined in data/state.ts).
//  Provides:   isArabic(), lbl(en, ar), kpiLabel(key)
// ════════════════════════════════════════════════════════════════════════

export const i18nHelpersJs = `
  function isArabic() { return state.locale === 'AR'; }
  function lbl(en, ar) { return isArabic() ? ar : en; }
  var KPI_LABELS_EN = {
    spend: 'Spend', impressions: 'Impressions', reach: 'Reach (latest day)',
    clicks: 'Clicks', ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', messages: 'Messages',
  };
  // Arabic labels follow Meta Ads Manager's official terminology.
  var KPI_LABELS_AR = {
    spend: 'المبلغ المنفق', impressions: 'مرات الظهور', reach: 'الوصول (آخر يوم)',
    clicks: 'النقرات', ctr: 'معدل النقر (CTR)', cpc: 'التكلفة لكل نقرة (CPC)',
    cpm: 'التكلفة لكل 1000 ظهور (CPM)', messages: 'محادثات الرسائل',
  };
  function kpiLabel(key) {
    var map = isArabic() ? KPI_LABELS_AR : KPI_LABELS_EN;
    return map[key] || key;
  }
  // Meta objective enums → Arabic. Raw values like OUTCOME_ENGAGEMENT mean
  // nothing to a client; unknown values degrade to a cleaned English label.
  var OBJECTIVE_AR = {
    OUTCOME_SALES: 'مبيعات', OUTCOME_ENGAGEMENT: 'تفاعل', OUTCOME_LEADS: 'عملاء محتملون',
    OUTCOME_AWARENESS: 'وعي بالعلامة', OUTCOME_TRAFFIC: 'زيارات', OUTCOME_APP_PROMOTION: 'ترويج تطبيق',
    MESSAGES: 'رسائل', CONVERSIONS: 'تحويلات', LINK_CLICKS: 'نقرات الرابط', REACH: 'وصول',
    VIDEO_VIEWS: 'مشاهدات فيديو', LEAD_GENERATION: 'توليد عملاء', POST_ENGAGEMENT: 'تفاعل المنشور',
  };
  function translateObjective(obj) {
    if (!obj) return '—';
    return OBJECTIVE_AR[obj] || String(obj).replace(/^OUTCOME_/, '').replace(/_/g, ' ');
  }
`;
