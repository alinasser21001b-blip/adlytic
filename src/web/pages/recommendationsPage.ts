// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/recommendationsPage.ts
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function recommendationsPage(): string {
  const content = `
<div class="page-header flex items-center justify-between">
  <div>
    <div class="page-title">التوصيات</div>
    <div class="page-subtitle">إجراءات مدعومة بالمساعد الذكي لتحسين أداء الحملات</div>
  </div>
  <button class="btn btn-secondary btn-sm" id="refresh-btn">↻ تحديث</button>
</div>

<!-- Filters row -->
<div class="flex items-center gap-2 section-gap" style="flex-wrap:wrap;">
  <div class="tabs" id="severity-tabs">
    <button class="tab active" data-filter="all">الكل</button>
    <button class="tab" data-filter="CRITICAL">حرجة</button>
    <button class="tab" data-filter="HIGH">عالية</button>
    <button class="tab" data-filter="MEDIUM">متوسطة</button>
    <button class="tab" data-filter="LOW">منخفضة</button>
  </div>
  <div class="search-wrap" style="margin-left:auto;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="text" class="form-input search-input" id="search-input" placeholder="ابحث في التوصيات…" style="width:240px;">
  </div>
</div>

<!-- Summary stats -->
<div class="kpi-grid" id="summary-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-bottom:20px;">
  <div class="kpi-card"><div class="kpi-label">إجمالي الملاحظات</div><div class="kpi-value" id="stat-total">—</div></div>
  <div class="kpi-card"><div class="kpi-label">حرجة</div><div class="kpi-value" id="stat-critical" style="color:var(--critical)">—</div></div>
  <div class="kpi-card"><div class="kpi-label">عالية</div><div class="kpi-value" id="stat-high" style="color:var(--error)">—</div></div>
  <div class="kpi-card"><div class="kpi-label">متوسطة</div><div class="kpi-value" id="stat-medium" style="color:var(--warning)">—</div></div>
  <div class="kpi-card"><div class="kpi-label">أعلى أولوية</div><div class="kpi-value" id="stat-action" style="font-size:13px;color:var(--accent-2)">—</div></div>
</div>

<!-- Main issues + recommendations list -->
<div id="issues-container">
  <div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ تحميل التوصيات…</div></div>
</div>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { window.location.href = '/dashboard'; return; }

  // Populate user
  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  document.getElementById('user-name').textContent  = me.name || me.email;
  document.getElementById('user-email').textContent = me.email;
  document.getElementById('user-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  document.getElementById('ws-name').textContent = wsM?.workspace?.name || 'مساحة العمل';

  let allIssues = [];
  let recs = [];
  let activeFilter = 'all';
  let userLocale = (me.locale || 'EN').toUpperCase();

  async function loadData() {
    document.getElementById('issues-container').innerHTML =
      '<div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ التحميل…</div></div>';
    try {
      [allIssues, recs] = await Promise.all([
        apiFetch('/api/workspaces/' + wsId + '/issues'),
        apiFetch('/api/workspaces/' + wsId + '/recommendations'),
      ]);
      render();
    } catch(e) {
      document.getElementById('issues-container').innerHTML =
        '<div class="alert alert-error">' + (e.message||'تعذّر التحميل') + '</div>';
    }
  }

  function render() {
    const q = document.getElementById('search-input').value.toLowerCase();
    let issues = allIssues || [];

    // Stats
    document.getElementById('stat-total').textContent    = issues.length;
    document.getElementById('stat-critical').textContent = issues.filter(i => i.severity==='CRITICAL').length;
    document.getElementById('stat-high').textContent     = issues.filter(i => i.severity==='HIGH').length;
    document.getElementById('stat-medium').textContent   = issues.filter(i => i.severity==='MEDIUM').length;
    const topRec = recs?.[0];
    document.getElementById('stat-action').textContent   = topRec ? (userLocale === 'AR' ? actionLabel(topRec.actionCode) : topRec.actionCode.replace(/_/g,' ')) : '—';

    // Filter
    if (activeFilter !== 'all') issues = issues.filter(i => i.severity === activeFilter);
    if (q) issues = issues.filter(i =>
      issueTitle(i.issueCode).toLowerCase().includes(q) ||
      (i.severity||'').toLowerCase().includes(q)
    );

    if (!issues.length) {
      document.getElementById('issues-container').innerHTML =
        '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">' +
        (activeFilter==='all' ? 'لم يتم رصد أي ملاحظات' : 'لا توجد ملاحظات من فئة ' + activeFilter) + '</div>' +
        '<div class="empty-text">حملاتك تبدو بحالة جيدة أو لم تتم مزامنة أي بيانات بعد.</div></div>';
      return;
    }

    const cards = issues.map((issue, idx) => {
      const rec = recs?.find(r => {
        const src = r.sourceIssuesJson;
        return Array.isArray(src) && src.includes(issue.issueCode);
      });
      const sev = issue.severity || 'LOW';
      const sevColor = {CRITICAL:'var(--critical)',HIGH:'var(--error)',MEDIUM:'var(--warning)',LOW:'var(--text-3)'}[sev] || 'var(--text-3)';
      const sevBg    = {CRITICAL:'var(--critical-dim)',HIGH:'var(--error-dim)',MEDIUM:'var(--warning-dim)',LOW:'rgba(255,255,255,0.04)'}[sev] || 'rgba(255,255,255,0.04)';
      const evidenceLines = Object.entries(issue.evidenceJson||{}).map(([k,v]) =>
        '<span style="color:var(--text-3);font-size:11.5px;">' + k.replace(/_/g,' ') + ':</span> ' +
        '<span style="color:var(--text-2);font-size:11.5px;">' + (typeof v==='number'?Number(v).toFixed(2):v) + '</span>'
      ).join(' &nbsp;·&nbsp; ');

      return \`
<div class="card section-gap" style="border-left:3px solid \${sevColor};" data-severity="\${sev}" data-idx="\${idx}">
  <div class="flex items-center gap-2" style="margin-bottom:12px;">
    <span class="badge" style="background:\${sevBg};color:\${sevColor};">\${sev}</span>
    <span style="font-size:13px;font-weight:700;color:var(--text);">\${escHtml(issueTitle(issue.issueCode))}</span>
    <span style="margin-left:auto;font-size:11px;color:var(--text-3);">\${issue.date ? new Date(issue.date).toLocaleDateString() : ''}</span>
  </div>

  \${evidenceLines ? '<div style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px;">' + evidenceLines + '</div>' : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px;">
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">الإجراء الموصى به</div>
      <div style="font-size:13px;color:var(--accent-2);font-weight:500;">\${rec ? (userLocale === 'AR' ? actionLabel(rec.actionCode) : rec.actionCode.replace(/_/g,' ')) : '—'}</div>
      \${rec ? '<div style="font-size:11.5px;color:var(--text-3);margin-top:3px;">الأولوية: ' + rec.priority + '</div>' : ''}
    </div>
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">الفئة</div>
      <div style="font-size:13px;color:var(--text-2);">\${categoryLabel(issue.issueCode)}</div>
    </div>
  </div>
</div>\`;
    });

    document.getElementById('issues-container').innerHTML = cards.join('');
  }

  function issueTitle(code) {
    const titles = {
      EN: {
        LOW_CTR: 'Low ad engagement',
        HIGH_CPM: 'High reach cost',
        HIGH_FREQUENCY: 'High ad repetition',
        AUDIENCE_FATIGUE: 'Audience fatigue',
        DECLINING_RESULTS: 'Declining results',
        BUDGET_BURNING_FAST: 'Budget spending fast',
        LOW_REACH: 'Low reach',
        RISING_COST_PER_RESULT: 'Rising cost per result',
        STALLED_DELIVERY: 'Stalled delivery',
      },
      AR: {
        LOW_CTR: 'تفاعل الإعلان منخفض',
        HIGH_CPM: 'تكلفة الوصول مرتفعة',
        HIGH_FREQUENCY: 'تكرار الإعلان مرتفع',
        AUDIENCE_FATIGUE: 'إرهاق الجمهور',
        DECLINING_RESULTS: 'تراجع النتائج',
        BUDGET_BURNING_FAST: 'إنفاق الميزانية بسرعة',
        LOW_REACH: 'وصول محدود',
        RISING_COST_PER_RESULT: 'ارتفاع تكلفة النتيجة',
        STALLED_DELIVERY: 'توقف التسليم',
      },
    };
    const map = userLocale === 'AR' ? titles.AR : titles.EN;
    return map[code] || (userLocale === 'AR' ? 'ملاحظة أداء' : String(code || '').replace(/_/g, ' '));
  }

  function actionLabel(code) {
    const map = {
      IMPROVE_HOOKS: 'تحسين بداية الإعلان',
      REFRESH_CREATIVES: 'تجديد التصاميم',
      EXPAND_AUDIENCE: 'توسيع الجمهور',
      PAUSE_CAMPAIGN: 'إيقاف الحملة',
      REDUCE_BUDGET: 'تقليل الميزانية',
      SCALE_BUDGET: 'زيادة الميزانية',
    };
    return map[code] || String(code || '').replace(/_/g, ' ');
  }

  function categoryLabel(code) {
    const mapEn = {
      LOW_CTR: 'Creative / Audience',
      HIGH_CPM: 'Budget / Bidding',
      HIGH_FREQUENCY: 'Frequency / Ad Fatigue',
      AUDIENCE_FATIGUE: 'Audience',
      DECLINING_RESULTS: 'Optimization',
      BUDGET_BURNING_FAST: 'Budget',
      LOW_REACH: 'Audience / Bidding',
      RISING_COST_PER_RESULT: 'Budget / Optimization',
      STALLED_DELIVERY: 'Delivery',
    };
    const mapAr = {
      LOW_CTR: 'الإبداع / الجمهور',
      HIGH_CPM: 'الميزانية / المزايدة',
      HIGH_FREQUENCY: 'التكرار / إرهاق الإعلان',
      AUDIENCE_FATIGUE: 'الجمهور',
      DECLINING_RESULTS: 'التحسين',
      BUDGET_BURNING_FAST: 'الميزانية',
      LOW_REACH: 'الجمهور / المزايدة',
      RISING_COST_PER_RESULT: 'الميزانية / التحسين',
      STALLED_DELIVERY: 'التسليم',
    };
    const map = userLocale === 'AR' ? mapAr : mapEn;
    return map[code] || (userLocale === 'AR' ? 'عام' : 'General');
  }

  // Severity tabs
  document.getElementById('severity-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#severity-tabs .tab').forEach(t => t.classList.toggle('active', t===btn));
    render();
  });

  // Search
  document.getElementById('search-input').addEventListener('input', render);

  // Refresh
  document.getElementById('refresh-btn').addEventListener('click', loadData);

  await loadData();
})();
</script>`;

  return layout({ title: 'التوصيات', active: 'recommendations', content, scripts });
}
