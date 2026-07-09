// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/issues.ts
//
//  Client-side renderIssues(issues) — Arabic severity + plain next step.
// ════════════════════════════════════════════════════════════════════════

export const renderIssuesJs = `
  function renderIssues(issues) {
    var el = document.getElementById('issues-list');
    if (!issues || issues.length === 0) {
      el.innerHTML = '<div class="adv-empty-ok">لا توجد مشاكل — حسابك يعمل بشكل جيد.</div>';
      return;
    }
    function sevAr(sev) {
      var s = String(sev || '').toUpperCase();
      if (s === 'CRITICAL') return { text: 'مستعجل', cls: 'critical' };
      if (s === 'HIGH') return { text: 'مهم', cls: 'high' };
      if (s === 'MEDIUM') return { text: 'للمتابعة', cls: 'medium' };
      return { text: 'معلومة', cls: 'low' };
    }
    function simplifyIssueText(text) {
      if (!text) return '';
      var t = String(text);
      t = t.replace(/\\bCTR\\b/gi, 'نسبة النقر');
      t = t.replace(/\\bCPM\\b/gi, 'تكلفة الوصول');
      t = t.replace(/\\bROAS\\b/gi, 'العائد على الإنفاق');
      t = t.replace(/\\bfrequency\\b/gi, 'مرات الظهور');
      if (/[A-Za-z]{5,}/.test(t) && !/[\\u0600-\\u06FF]/.test(t)) return '';
      return t.replace(/\\s+/g, ' ').trim();
    }
    el.innerHTML = '<div class="adv-issues-list">' + issues.map(function (iss) {
      var sev = sevAr(iss.severity);
      var causesRaw = Array.isArray(iss.causes) ? iss.causes : [];
      var causes = causesRaw.map(simplifyIssueText).filter(Boolean).slice(0, 2).join(' · ');
      var recsRaw = Array.isArray(iss.recommendations) ? iss.recommendations[0] : (iss.recommendations || '');
      var recs = simplifyIssueText(recsRaw);
      var title = iss.title && !/^[A-Z0-9_]+$/.test(String(iss.title))
        ? iss.title
        : (iss.title || iss.code || 'ملاحظة');
      return '<div class="adv-issue-row">'
        + '<div class="adv-issue-top">'
          + '<div class="adv-issue-title">' + escHtml(title) + '</div>'
          + '<span class="adv-issue-sev ' + sev.cls + '">' + escHtml(sev.text) + '</span>'
        + '</div>'
        + (causes ? '<div class="adv-issue-why">' + escHtml(causes) + '</div>' : '')
        + (recs ? '<div class="adv-issue-action"><b>الخطوة:</b> ' + escHtml(recs) + '</div>' : '')
      + '</div>';
    }).join('') + '</div>';
  }
`;
