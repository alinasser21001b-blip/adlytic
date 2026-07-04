// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/kpis.ts
//
//  Client-side renderKpis(kpis). Exported as a JS string interpolated
//  into the dashboard's IIFE `<script>` block.
//
//  Consumes: #kpi-grid.  Uses: escHtml (from lib/format).
// ════════════════════════════════════════════════════════════════════════

export const renderKpisJs = `
  function renderKpis(kpis) {
    var grid = document.getElementById('kpi-grid');
    if (!grid) return;
    if (!kpis || kpis.length === 0) { grid.innerHTML = '<div class="text-3 text-sm">No KPI data available.</div>'; return; }
    grid.innerHTML = kpis.map(function (k) {
      var deltaClass = 'flat', arrow = '→';
      if (k.deltaPct != null) {
        var good = k.goodWhenUp !== false;
        var up = k.direction === 'up';
        if (up)   { deltaClass = good ? 'up-good' : 'up-bad'; arrow = '↑'; }
        else      { deltaClass = good ? 'down-bad' : 'down-good'; arrow = '↓'; }
      }
      // deltaPct is stored as a ratio (0.05 = 5%) — multiply before display.
      var deltaHtml = k.deltaPct != null
        ? '<div class="kpi-delta ' + deltaClass + '">' + arrow + ' ' + Math.abs(Number(k.deltaPct) * 100).toFixed(1) + '%</div>'
        : '';
      return '<div class="kpi-card">'
        + '<div class="kpi-label">' + escHtml(k.label || k.key) + '</div>'
        + '<div class="kpi-value">' + escHtml(String(k.display || k.value || '—')) + '</div>'
        + deltaHtml
      + '</div>';
    }).join('');
  }
`;
