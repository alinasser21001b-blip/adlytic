// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/issues.ts
//
//  Client-side renderIssues(issues). Exported as a JS string interpolated
//  into the dashboard's IIFE `<script>` block.
//
//  Consumes: #issues-list.  Uses: escHtml (from lib/format) and
//  severityBadge (from layout SHARED_JS).
// ════════════════════════════════════════════════════════════════════════

export const renderIssuesJs = `
  function renderIssues(issues) {
    var el = document.getElementById('issues-list');
    if (!issues || issues.length === 0) {
      el.innerHTML = '<div class="text-3 text-sm">لا توجد مشاكل — حسابك يعمل بشكل جيد.</div>';
      return;
    }
    el.innerHTML = issues.map(function (iss) {
      var sev = (iss.severity || 'low').toUpperCase();
      var causes = Array.isArray(iss.causes) ? iss.causes.join(', ') : (iss.causes || '');
      var recs = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      return '<div style="padding:10px 0;border-top:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'
          + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + escHtml(iss.title || iss.code) + '</div>'
          + severityBadge(sev)
        + '</div>'
        + (causes ? '<div class="text-sm text-2" style="margin-top:3px;">' + escHtml(causes) + '</div>' : '')
        + (recs ? '<div class="text-xs text-3" style="margin-top:2px;font-style:italic;">' + escHtml(recs) + '</div>' : '')
      + '</div>';
    }).join('');
  }
`;
