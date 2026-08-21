// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/lib/confidence.ts
//
//  Client-side confidence-band helper. Exported as a JS string that gets
//  interpolated inside the page's IIFE `<script>` block.
//
//  Provides: confBadge(confidence) -> { level, label, pct } | null
//
//  Normalizes both a 0-1 fraction and a 0-100 percentage to the same bands
//  before applying the threshold, so a caller passing either shape gets the
//  same classification. This was previously reimplemented three times across
//  dashboardPage.ts / beginnerDashboardPage.ts / diagnoses.ts — one of those
//  copies applied the threshold directly to the raw value with no
//  normalization step, so a 0-100 confidence would misclassify (e.g. 45 as a
//  raw number reads as >= 0.75, landing in the wrong band).
// ════════════════════════════════════════════════════════════════════════

export const confidenceHelpersJs = `
  function confBadge(confidence) {
    if (confidence == null || !isFinite(Number(confidence))) return null;
    var c = Number(confidence);
    if (c > 1) c = c / 100;
    c = Math.max(0, Math.min(1, c));
    var level = c >= 0.75 ? 'high' : c >= 0.5 ? 'medium' : 'low';
    var label = c >= 0.75 ? 'ثقة عالية' : c >= 0.5 ? 'ثقة متوسطة' : 'ثقة منخفضة';
    return { level: level, label: label, pct: Math.round(c * 100) };
  }
`;
