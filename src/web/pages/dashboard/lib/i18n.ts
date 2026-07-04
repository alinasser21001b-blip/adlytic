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
  var KPI_LABELS_AR = {
    spend: 'الإنفاق', impressions: 'مرات الظهور', reach: 'الوصول (آخر يوم)',
    clicks: 'النقرات', ctr: 'تفاعل الإعلان', cpc: 'تكلفة النقرة', cpm: 'تكلفة الوصول لألف شخص', messages: 'الرسائل',
  };
  function kpiLabel(key) {
    var map = isArabic() ? KPI_LABELS_AR : KPI_LABELS_EN;
    return map[key] || key;
  }
`;
