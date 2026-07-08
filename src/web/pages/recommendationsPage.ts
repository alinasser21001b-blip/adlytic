// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/recommendationsPage.ts — Smart recommendations timeline
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function recommendationsPage(): string {
  const content = `
<div class="rec-page">
  <div class="page-header rec-header">
    <div>
      <div class="page-title">التوصيات الذكية</div>
      <div class="page-subtitle">تحليل مرتب زمنياً من بيانات حسابك — كل توصية مربوطة بمؤشرات فعلية</div>
    </div>
    <button class="btn btn-secondary btn-sm" id="refresh-btn">↻ تحديث</button>
  </div>

  <!-- Account snapshot — tied to live dashboard DTO -->
  <div class="rec-account-bar" id="rec-account-bar" style="display:none;">
    <div class="rec-account-stat">
      <div class="rec-stat-label">حملات تعمل</div>
      <div class="rec-stat-value" id="rec-delivering">—</div>
    </div>
    <div class="rec-account-stat">
      <div class="rec-stat-label">تنفق اليوم</div>
      <div class="rec-stat-value" id="rec-today">—</div>
    </div>
    <div class="rec-account-stat">
      <div class="rec-stat-label">Meta نشطة</div>
      <div class="rec-stat-value rec-stat-muted" id="rec-meta">—</div>
    </div>
    <div class="rec-account-stat">
      <div class="rec-stat-label">آخر مزامنة</div>
      <div class="rec-stat-value rec-stat-sm" id="rec-sync">—</div>
    </div>
    <div class="rec-account-stat rec-stat-wide">
      <div class="rec-stat-label">نافذة التحليل</div>
      <div class="rec-stat-value rec-stat-sm" id="rec-window">30 يوم</div>
    </div>
  </div>

  <!-- Filters -->
  <div class="rec-toolbar">
    <div class="tabs" id="severity-tabs">
      <button class="tab active" data-filter="all">الكل</button>
      <button class="tab" data-filter="CRITICAL">حرجة</button>
      <button class="tab" data-filter="HIGH">عالية</button>
      <button class="tab" data-filter="MEDIUM">متوسطة</button>
      <button class="tab" data-filter="LOW">منخفضة</button>
    </div>
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="form-input search-input" id="search-input" placeholder="ابحث في التوصيات…" style="width:220px;">
    </div>
  </div>

  <!-- Summary KPI row -->
  <div class="rec-kpi-row" id="summary-grid">
    <div class="rec-kpi"><div class="rec-kpi-label">إجمالي الملاحظات</div><div class="rec-kpi-val" id="stat-total">—</div></div>
    <div class="rec-kpi rec-kpi-critical"><div class="rec-kpi-label">حرجة</div><div class="rec-kpi-val" id="stat-critical">—</div></div>
    <div class="rec-kpi rec-kpi-high"><div class="rec-kpi-label">عالية</div><div class="rec-kpi-val" id="stat-high">—</div></div>
    <div class="rec-kpi rec-kpi-medium"><div class="rec-kpi-label">متوسطة</div><div class="rec-kpi-val" id="stat-medium">—</div></div>
    <div class="rec-kpi rec-kpi-accent"><div class="rec-kpi-label">أعلى إجراء</div><div class="rec-kpi-val rec-kpi-action" id="stat-action">—</div></div>
  </div>

  <!-- Chronological timeline -->
  <div id="issues-container">
    <div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ تحميل التوصيات…</div></div>
  </div>
</div>

<style>
  .rec-page { direction: rtl; max-width: 960px; margin: 0 auto; }
  .rec-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .rec-account-bar {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;
    padding: 14px 16px; margin-bottom: 20px;
    background: linear-gradient(135deg, rgba(217,167,89,0.08), rgba(255,255,255,0.02));
    border: 1px solid rgba(217,167,89,0.25); border-radius: var(--radius-lg);
  }
  .rec-stat-label { font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .rec-stat-value { font-size: 20px; font-weight: 800; color: var(--accent-2); font-variant-numeric: tabular-nums; }
  .rec-stat-value.rec-stat-muted { color: var(--text-2); font-size: 18px; }
  .rec-stat-value.rec-stat-sm { font-size: 13px; font-weight: 600; color: var(--text); }
  .rec-stat-wide { grid-column: span 2; }
  @media (max-width: 640px) { .rec-stat-wide { grid-column: span 1; } }
  .rec-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .rec-kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px; }
  @media (max-width: 900px) { .rec-kpi-row { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 520px) { .rec-kpi-row { grid-template-columns: repeat(2, 1fr); } }
  .rec-kpi {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 14px 16px; text-align: center;
  }
  .rec-kpi-label { font-size: 11px; color: var(--text-3); margin-bottom: 6px; }
  .rec-kpi-val { font-size: 22px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
  .rec-kpi-val.rec-kpi-action { font-size: 12px; font-weight: 700; color: var(--accent-2); line-height: 1.4; }
  .rec-kpi-critical .rec-kpi-val { color: var(--critical); }
  .rec-kpi-high .rec-kpi-val { color: var(--error); }
  .rec-kpi-medium .rec-kpi-val { color: var(--warning); }
  .rec-timeline-day { margin-bottom: 28px; }
  .rec-timeline-date {
    display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
    font-size: 12px; font-weight: 700; color: var(--text-2);
  }
  .rec-timeline-date::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .rec-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 18px 20px; margin-bottom: 12px;
    border-inline-start: 4px solid var(--border);
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .rec-card:hover { box-shadow: var(--shadow-sm); }
  .rec-card-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .rec-card-title { font-size: 14px; font-weight: 700; color: var(--text); flex: 1; min-width: 0; }
  .rec-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .rec-card-grid { grid-template-columns: 1fr; } }
  .rec-block-label { font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .rec-block-body { font-size: 13px; color: var(--text-2); line-height: 1.65; }
  .rec-evidence { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; }
  .rec-evidence-chip {
    font-size: 11px; padding: 4px 10px; border-radius: 999px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--text-3);
  }
  .rec-evidence-chip b { color: var(--text-2); font-weight: 600; }
  .rec-card-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
</style>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { window.location.href = '/dashboard'; return; }

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  document.getElementById('user-name').textContent  = me.name || me.email;
  document.getElementById('user-email').textContent = me.email;
  document.getElementById('user-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  document.getElementById('ws-name').textContent = wsM?.workspace?.name || 'مساحة العمل';

  let allIssues = [];
  let recs = [];
  let dashData = null;
  let activeFilter = 'all';
  let userLocale = (me.locale || 'AR').toUpperCase();

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('ar-u-nu-latn', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return String(iso).slice(0, 10); }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function issueKey(issue) {
    return issue.code || issue.issueCode || '';
  }

  function issueTitle(issue) {
    if (issue.title) return issue.title;
    const code = issueKey(issue);
    const titles = {
      AR: {
        LOW_CTR: 'تفاعل الإعلان منخفض', HIGH_CPM: 'تكلفة الوصول مرتفعة',
        HIGH_FREQUENCY: 'تكرار الإعلان مرتفع', AUDIENCE_FATIGUE: 'إرهاق الجمهور',
        DECLINING_RESULTS: 'تراجع النتائج', BUDGET_BURNING_FAST: 'إنفاق الميزانية بسرعة',
        LOW_REACH: 'وصول محدود', RISING_COST_PER_RESULT: 'ارتفاع تكلفة النتيجة',
        STALLED_DELIVERY: 'توقف التسليم', CPMSG_PAUSE_BLEEDERS: 'إيقاف الحملات الخاسرة',
      },
      EN: {
        LOW_CTR: 'Low ad engagement', HIGH_CPM: 'High reach cost',
        HIGH_FREQUENCY: 'High ad repetition', AUDIENCE_FATIGUE: 'Audience fatigue',
        DECLINING_RESULTS: 'Declining results', BUDGET_BURNING_FAST: 'Budget spending fast',
        LOW_REACH: 'Low reach', RISING_COST_PER_RESULT: 'Rising cost per result',
        STALLED_DELIVERY: 'Stalled delivery', CPMSG_PAUSE_BLEEDERS: 'Pause bleeding campaigns',
      },
    };
    const map = userLocale === 'AR' ? titles.AR : titles.EN;
    return map[code] || code.replace(/_/g, ' ');
  }

  function actionLabel(code) {
    const map = {
      IMPROVE_HOOKS: 'تحسين بداية الإعلان', REFRESH_CREATIVES: 'تجديد التصاميم',
      EXPAND_AUDIENCE: 'توسيع الجمهور', PAUSE_CAMPAIGN: 'إيقاف الحملة',
      REDUCE_BUDGET: 'تقليل الميزانية', SCALE_BUDGET: 'زيادة الميزانية',
      CPMSG_PAUSE_BLEEDERS: 'إيقاف الحملات الخاسرة',
    };
    return map[code] || String(code || '').replace(/_/g, ' ');
  }

  function categoryLabel(code) {
    const mapAr = {
      LOW_CTR: 'الإبداع / الجمهور', HIGH_CPM: 'الميزانية / المزايدة',
      HIGH_FREQUENCY: 'التكرار / إرهاق الإعلان', AUDIENCE_FATIGUE: 'الجمهور',
      DECLINING_RESULTS: 'التحسين', BUDGET_BURNING_FAST: 'الميزانية',
      CPMSG_PAUSE_BLEEDERS: 'التحسين / الميزانية',
    };
    return mapAr[code] || 'عام';
  }

  function renderAccountBar() {
    const bar = document.getElementById('rec-account-bar');
    if (!bar || !dashData || !dashData.workspace) return;
    const cc = dashData.workspace.campaignCounts || {};
    const win = cc.deliveryWindowDays || 30;
    document.getElementById('rec-delivering').textContent = cc.deliveringInWindow ?? dashData.workspace.activeCampaigns ?? '—';
    document.getElementById('rec-today').textContent = cc.spendingToday ?? '—';
    document.getElementById('rec-meta').textContent = cc.activeStatus ?? '—';
    const synced = dashData.workspace.lastSyncedAt;
    document.getElementById('rec-sync').textContent = synced
      ? fmtTime(synced) + ' · ' + fmtDate(synced).split(',')[0]
      : '—';
    document.getElementById('rec-window').textContent = win + ' يوم';
    bar.style.display = 'grid';
  }

  function groupByDate(issues) {
    const map = {};
    issues.forEach(function(issue) {
      const raw = issue.date || issue.detectedAt || '';
      const key = raw ? new Date(raw).toISOString().slice(0, 10) : 'unknown';
      if (!map[key]) map[key] = [];
      map[key].push(issue);
    });
    return Object.keys(map).sort(function(a, b) { return b.localeCompare(a); }).map(function(k) {
      return { date: k, items: map[k] };
    });
  }

  function findRec(issue) {
    const code = issueKey(issue);
    return recs.find(function(r) {
      const src = r.sourceIssuesJson;
      return Array.isArray(src) && src.includes(code);
    }) || recs.find(function(r) { return r.actionCode && code && r.actionCode.indexOf(code.split('_')[0]) >= 0; });
  }

  function renderCard(issue) {
    const code = issueKey(issue);
    const rec = findRec(issue);
    const sev = (issue.severity || 'LOW').toUpperCase();
    const sevColor = { CRITICAL: 'var(--critical)', HIGH: 'var(--error)', MEDIUM: 'var(--warning)', LOW: 'var(--text-3)' }[sev] || 'var(--text-3)';
    const evidence = issue.evidence || issue.evidenceJson || {};
    const evidenceHtml = Object.entries(evidence).slice(0, 6).map(function(pair) {
      const k = pair[0], v = pair[1];
      const val = typeof v === 'number' ? Number(v).toFixed(2) : v;
      return '<span class="rec-evidence-chip"><b>' + escHtml(k.replace(/_/g, ' ')) + '</b> ' + escHtml(String(val)) + '</span>';
    }).join('');
    const causes = Array.isArray(issue.causes) ? issue.causes.join(' · ') : '';
    const recsText = Array.isArray(issue.recommendations) ? issue.recommendations[0] : (issue.recommendations || '');
    const recDate = rec && rec.date ? fmtDate(rec.date) : '';
    const issueDate = issue.date ? fmtDate(issue.date) : '';

    return '<article class="rec-card" style="border-inline-start-color:' + sevColor + ';" data-severity="' + sev + '">'
      + '<div class="rec-card-head">'
      +   '<span class="badge" style="background:' + sevColor + '22;color:' + sevColor + ';">' + escHtml(sev) + '</span>'
      +   '<div class="rec-card-title">' + escHtml(issueTitle(issue)) + '</div>'
      +   '<span style="font-size:11px;color:var(--text-3);white-space:nowrap;">' + escHtml(issueDate) + '</span>'
      + '</div>'
      + (evidenceHtml ? '<div class="rec-evidence">' + evidenceHtml + '</div>' : '')
      + '<div class="rec-card-grid">'
      +   '<div><div class="rec-block-label">الإجراء الموصى به</div>'
      +     '<div class="rec-block-body" style="color:var(--accent-2);font-weight:600;">'
      +       escHtml(rec ? actionLabel(rec.actionCode) : (recsText || '—'))
      +     '</div>'
      +     (rec ? '<div style="font-size:11px;color:var(--text-3);margin-top:4px;">الأولوية: ' + escHtml(rec.priority) + (recDate ? ' · ' + escHtml(recDate) : '') + '</div>' : '')
      +   '</div>'
      +   '<div><div class="rec-block-label">السبب / الفئة</div>'
      +     '<div class="rec-block-body">' + escHtml(causes || categoryLabel(code)) + '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="rec-card-actions">'
      +   '<a class="btn btn-secondary btn-sm" href="/ai?q=' + encodeURIComponent('لماذا ' + issueTitle(issue) + '؟') + '">اسأل الذكاء الاصطناعي</a>'
      +   '<a class="btn btn-ghost btn-sm" href="/campaigns">عرض الحملات</a>'
      + '</div>'
      + '</article>';
  }

  function render() {
    const q = (document.getElementById('search-input').value || '').toLowerCase();
    let issues = (allIssues || []).slice();

    document.getElementById('stat-total').textContent = issues.length;
    document.getElementById('stat-critical').textContent = issues.filter(i => i.severity === 'CRITICAL').length;
    document.getElementById('stat-high').textContent = issues.filter(i => i.severity === 'HIGH').length;
    document.getElementById('stat-medium').textContent = issues.filter(i => i.severity === 'MEDIUM').length;
    const topRec = recs && recs[0];
    document.getElementById('stat-action').textContent = topRec
      ? actionLabel(topRec.actionCode)
      : '—';

    if (activeFilter !== 'all') issues = issues.filter(i => i.severity === activeFilter);
    if (q) {
      issues = issues.filter(i =>
        issueTitle(i).toLowerCase().includes(q) ||
        issueKey(i).toLowerCase().includes(q) ||
        (i.severity || '').toLowerCase().includes(q)
      );
    }

    const container = document.getElementById('issues-container');
    if (!issues.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">'
        + (activeFilter === 'all' ? 'لا توجد ملاحظات حالياً' : 'لا توجد ملاحظات من هذه الفئة')
        + '</div><div class="empty-text">البيانات مرتبطة بآخر مزامنة لحسابك. جرّب التحديث بعد المزامنة.</div></div>';
      return;
    }

    const groups = groupByDate(issues);
    container.innerHTML = groups.map(function(g) {
      const label = g.date === 'unknown' ? 'بدون تاريخ' : fmtDate(g.date);
      return '<section class="rec-timeline-day">'
        + '<div class="rec-timeline-date">' + escHtml(label) + ' · ' + g.items.length + ' ملاحظة</div>'
        + g.items.map(renderCard).join('')
        + '</section>';
    }).join('');
  }

  async function loadData() {
    document.getElementById('issues-container').innerHTML =
      '<div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ التحميل…</div></div>';
    try {
      const results = await Promise.all([
        apiFetch('/api/dashboard/' + wsId),
        apiFetch('/api/workspaces/' + wsId + '/recommendations'),
      ]);
      dashData = results[0] || {};
      recs = Array.isArray(results[1]) ? results[1] : [];
      allIssues = Array.isArray(dashData.issues) ? dashData.issues : [];
      allIssues.sort(function(a, b) {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });
      renderAccountBar();
      render();
    } catch (e) {
      document.getElementById('issues-container').innerHTML =
        '<div class="alert alert-error">' + escHtml(e.message || 'تعذّر التحميل') + '</div>';
    }
  }

  document.getElementById('severity-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#severity-tabs .tab').forEach(t => t.classList.toggle('active', t === btn));
    render();
  });
  document.getElementById('search-input').addEventListener('input', render);
  document.getElementById('refresh-btn').addEventListener('click', loadData);

  await loadData();
})();
</script>`;

  return layout({ title: 'التوصيات', active: 'recommendations', content, scripts });
}
