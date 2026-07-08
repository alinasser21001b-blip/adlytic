// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/recommendationsPage.ts — Plain-Arabic recommendations
//  Goal: simplify numbers/jargon into clear next steps for the merchant.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function recommendationsPage(): string {
  const content = `
<div class="rec-page">
  <div class="page-header rec-header">
    <div>
      <div class="page-title">التوصيات</div>
      <div class="page-subtitle">خطوات واضحة من بيانات حسابك — بدون اختصارات معقّدة</div>
    </div>
    <button class="btn btn-secondary btn-sm" id="refresh-btn">↻ تحديث</button>
  </div>

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
      <div class="rec-stat-label">آخر مزامنة</div>
      <div class="rec-stat-value rec-stat-sm" id="rec-sync">—</div>
    </div>
    <div class="rec-account-stat">
      <div class="rec-stat-label">نافذة التحليل</div>
      <div class="rec-stat-value rec-stat-sm" id="rec-window">30 يوم</div>
    </div>
  </div>

  <div class="rec-toolbar">
    <div class="tabs" id="severity-tabs">
      <button class="tab active" data-filter="all">الكل</button>
      <button class="tab" data-filter="CRITICAL">مستعجل</button>
      <button class="tab" data-filter="HIGH">مهم</button>
      <button class="tab" data-filter="MEDIUM">للمتابعة</button>
      <button class="tab" data-filter="LOW">معلومة</button>
    </div>
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="form-input search-input" id="search-input" placeholder="ابحث في التوصيات…" style="width:220px;">
    </div>
  </div>

  <div class="rec-kpi-row" id="summary-grid">
    <div class="rec-kpi"><div class="rec-kpi-label">كل التوصيات</div><div class="rec-kpi-val" id="stat-total">—</div></div>
    <div class="rec-kpi rec-kpi-critical"><div class="rec-kpi-label">مستعجل</div><div class="rec-kpi-val" id="stat-critical">—</div></div>
    <div class="rec-kpi rec-kpi-high"><div class="rec-kpi-label">مهم</div><div class="rec-kpi-val" id="stat-high">—</div></div>
    <div class="rec-kpi rec-kpi-medium"><div class="rec-kpi-label">للمتابعة</div><div class="rec-kpi-val" id="stat-medium">—</div></div>
    <div class="rec-kpi rec-kpi-accent"><div class="rec-kpi-label">الخطوة الأولى</div><div class="rec-kpi-val rec-kpi-action" id="stat-action">—</div></div>
  </div>

  <div id="issues-container">
    <div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ تحميل التوصيات…</div></div>
  </div>
</div>

<style>
  .rec-page { direction: rtl; max-width: 920px; margin: 0 auto; }
  .rec-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .rec-account-bar {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
    padding: 14px 16px; margin-bottom: 18px;
    background: linear-gradient(145deg, rgba(217,167,89,0.08), rgba(255,255,255,0.02));
    border: 1px solid rgba(217,167,89,0.22); border-radius: 16px;
  }
  @media (max-width: 720px) { .rec-account-bar { grid-template-columns: 1fr 1fr; } }
  .rec-stat-label { font-size: 11px; font-weight: 700; color: var(--text-3); margin-bottom: 4px; }
  .rec-stat-value { font-size: 20px; font-weight: 800; color: var(--accent-2); font-variant-numeric: tabular-nums; }
  .rec-stat-value.rec-stat-sm { font-size: 13px; font-weight: 600; color: var(--text); }
  .rec-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .rec-kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 22px; }
  @media (max-width: 900px) { .rec-kpi-row { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 520px) { .rec-kpi-row { grid-template-columns: repeat(2, 1fr); } }
  .rec-kpi {
    background: var(--surface); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px;
    padding: 14px 16px; text-align: center;
  }
  .rec-kpi-label { font-size: 11px; color: var(--text-3); margin-bottom: 6px; }
  .rec-kpi-val { font-size: 22px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
  .rec-kpi-val.rec-kpi-action { font-size: 12.5px; font-weight: 700; color: var(--accent-2); line-height: 1.45; }
  .rec-kpi-critical .rec-kpi-val { color: var(--critical); }
  .rec-kpi-high .rec-kpi-val { color: var(--error); }
  .rec-kpi-medium .rec-kpi-val { color: var(--warning); }
  .rec-group { margin-bottom: 26px; }
  .rec-group-title {
    display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    font-size: 12px; font-weight: 800; color: var(--text-2);
  }
  .rec-group-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }
  .rec-card {
    background: var(--surface); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px;
    padding: 18px 18px 16px; margin-bottom: 12px;
    border-inline-start: 4px solid var(--border);
  }
  .rec-card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .rec-sev {
    font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; white-space: nowrap;
  }
  .rec-card-title { font-size: 15px; font-weight: 800; color: var(--text); flex: 1; min-width: 0; line-height: 1.4; }
  .rec-plain { font-size: 13.5px; color: var(--text-2); line-height: 1.65; margin-bottom: 12px; }
  .rec-action-box {
    background: rgba(217,167,89,0.07); border: 1px solid rgba(217,167,89,0.18);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;
  }
  .rec-action-label { font-size: 11px; font-weight: 800; color: var(--accent-2); margin-bottom: 4px; }
  .rec-action-text { font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.5; }
  .rec-why { font-size: 12.5px; color: var(--text-3); line-height: 1.55; }
  .rec-evidence { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
  .rec-evidence-chip {
    font-size: 11.5px; padding: 5px 10px; border-radius: 10px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: var(--text-2);
  }
  .rec-evidence-chip b { color: var(--text); font-weight: 700; }
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

  function severityLabel(sev) {
    const s = String(sev || 'LOW').toUpperCase();
    if (s === 'CRITICAL') return { text: 'مستعجل', color: 'var(--critical)' };
    if (s === 'HIGH') return { text: 'مهم', color: 'var(--error)' };
    if (s === 'MEDIUM') return { text: 'للمتابعة', color: 'var(--warning)' };
    return { text: 'معلومة', color: 'var(--text-3)' };
  }

  function issueTitle(issue) {
    if (issue.title && !/^[A-Z0-9_]+$/.test(String(issue.title))) return issue.title;
    const code = issueKey(issue);
    const titles = {
      LOW_CTR: 'الإعلان لا يجذب النقرات بما يكفي',
      HIGH_CPM: 'تكلفة الوصول أصبحت مرتفعة',
      HIGH_FREQUENCY: 'نفس الأشخاص يرون الإعلان كثيراً',
      AUDIENCE_FATIGUE: 'الجمهور بدأ يتعب من الإعلان',
      DECLINING_RESULTS: 'النتائج تتراجع',
      BUDGET_BURNING_FAST: 'الميزانية تُصرف بسرعة',
      LOW_REACH: 'الوصول للجمهور محدود',
      RISING_COST_PER_RESULT: 'تكلفة كل نتيجة ترتفع',
      STALLED_DELIVERY: 'الحملة توقفت عن الظهور',
      CPMSG_PAUSE_BLEEDERS: 'بعض الحملات تخسر أكثر مما تفيد',
    };
    return titles[code] || String(code || 'ملاحظة').replace(/_/g, ' ');
  }

  function actionLabel(code) {
    const map = {
      IMPROVE_HOOKS: 'حسّن بداية الإعلان',
      REFRESH_CREATIVES: 'جدّد صورة أو فيديو الإعلان',
      EXPAND_AUDIENCE: 'وسّع الجمهور',
      BROADEN_AUDIENCE: 'وسّع الجمهور',
      PAUSE_CAMPAIGN: 'أوقف الحملة مؤقتاً',
      PAUSE_AND_RELAUNCH: 'أوقف ثم أعد الإطلاق بتصميم جديد',
      REDUCE_BUDGET: 'خفّض الميزانية',
      SCALE_BUDGET: 'زِد الميزانية بحذر',
      REVIEW_BUDGET_PACING: 'راجع سرعة صرف الميزانية',
      CHECK_TARGETING: 'راجع استهداف الجمهور',
      CPMSG_PAUSE_BLEEDERS: 'أوقف الحملات الخاسرة أولاً',
      PAUSE_URGENT: 'أوقف الحملة فوراً',
      REFRESH_CREATIVE: 'جدّد التصميم',
    };
    return map[code] || '';
  }

  function simplifyText(text) {
    if (!text) return '';
    var t = String(text);
    // Strip English jargon / keep meaning in plain Arabic.
    t = t.replace(/\\bCTR\\b/gi, 'نسبة النقر');
    t = t.replace(/\\bCPM\\b/gi, 'تكلفة الوصول');
    t = t.replace(/\\bCPC\\b/gi, 'تكلفة النقرة');
    t = t.replace(/\\bCPA\\b/gi, 'تكلفة النتيجة');
    t = t.replace(/\\bROAS\\b/gi, 'العائد على الإنفاق');
    t = t.replace(/\\bfrequency\\b/gi, 'مرات الظهور لنفس الشخص');
    t = t.replace(/\\blookalike\\b/gi, 'جمهور مشابه');
    t = t.replace(/\\bad set(s)?\\b/gi, 'مجموعة إعلانات');
    t = t.replace(/\\bcreative(s)?\\b/gi, 'التصميم');
    t = t.replace(/\\bauction\\b/gi, 'المزاد');
    t = t.replace(/\\bbreak-even\\b/gi, 'نقطة التعادل');
    t = t.replace(/\\(Source:[^)]+\\)/gi, '');
    t = t.replace(/Click-Through Rate/gi, 'نسبة النقر');
    t = t.replace(/Cost per (message|result|conversation)/gi, 'تكلفة النتيجة');
    // Soften English-only sentences that slipped through KB.
    if (/[A-Za-z]{4,}/.test(t) && !/[\\u0600-\\u06FF]/.test(t)) {
      return '';
    }
    return t.replace(/\\s+/g, ' ').trim();
  }

  function plainWhy(issue) {
    const causes = Array.isArray(issue.causes) ? issue.causes.map(simplifyText).filter(Boolean) : [];
    if (causes.length) return causes.slice(0, 2).join(' · ');
    const code = issueKey(issue);
    const fallback = {
      LOW_CTR: 'الناس يرون الإعلان لكن قليل منهم ينقرون عليه.',
      HIGH_FREQUENCY: 'نفس الأشخاص يشاهدون الإعلان مرات كثيرة فتقلّ استجابتهم.',
      AUDIENCE_FATIGUE: 'التصميم أو الجمهور أصبح مألوفاً جداً للجمهور الحالي.',
      DECLINING_RESULTS: 'النتائج أضعف من الفترة السابقة.',
      RISING_COST_PER_RESULT: 'تدفع أكثر مقابل كل نتيجة مقارنة بما قبل.',
      HIGH_CPM: 'الوصول لنفس العدد من الناس أصبح أغلى.',
      BUDGET_BURNING_FAST: 'الميزانية اليومية تُستهلك أسرع من المعتاد.',
    };
    return fallback[code] || 'راجع الحملة واتخذ خطوة بسيطة اليوم.';
  }

  function plainAction(issue, rec) {
    if (rec && rec.actionCode) {
      const labeled = actionLabel(rec.actionCode);
      if (labeled) return labeled;
    }
    const list = Array.isArray(issue.recommendations) ? issue.recommendations : [];
    for (var i = 0; i < list.length; i++) {
      var s = simplifyText(list[i]);
      if (s) return s;
    }
    if (dashData && dashData.priorityAction && dashData.priorityAction.text) {
      var p = simplifyText(dashData.priorityAction.text);
      if (p) return p;
    }
    const code = issueKey(issue);
    const fallback = {
      LOW_CTR: 'جرّب صورة أو جملة افتتاحية جديدة خلال هذا الأسبوع',
      HIGH_FREQUENCY: 'أوقف أضعف إعلان وقدّم تصميماً جديداً',
      AUDIENCE_FATIGUE: 'جدّد التصميم ووسّع الجمهور قليلاً',
      DECLINING_RESULTS: 'راجع أفضل إعلان وأوقف الأضعف',
      RISING_COST_PER_RESULT: 'خفّض الميزانية على الأغلى وأبقِ الأفضل',
      HIGH_CPM: 'راجع الاستهداف والميزانية قبل زيادة الإنفاق',
      BUDGET_BURNING_FAST: 'خفّض الميزانية اليومية حتى تستقر النتائج',
    };
    return fallback[code] || 'افتح الحملات وطبّق تعديلاً واحداً واضحاً';
  }

  function evidenceChips(issue) {
    const evidence = issue.evidence || issue.evidenceJson || {};
    const labels = {
      currentCtr: 'نسبة النقر الحالية',
      current_ctr: 'نسبة النقر الحالية',
      threshold: 'الحد الصحي',
      gapBelowThreshold: 'الفجوة عن الحد الصحي',
      frequencyTrend: 'اتجاه التكرار',
      ctrTrend: 'اتجاه التفاعل',
      resultsTrend: 'اتجاه النتائج',
      signalsPresent: 'إشارات مؤكدة',
      confidence: 'درجة الثقة',
      frequency: 'مرات الظهور لنفس الشخص',
      cpm: 'تكلفة الوصول',
      costPerMessage: 'تكلفة النتيجة',
      cost_per_message: 'تكلفة النتيجة',
    };
    const skip = { knowledgeBase: 1, recommended_optimization_actions: 1, metricBreaches: 1, source: 1, benchmarkInsights: 1 };
    return Object.keys(evidence).filter(function(k) {
      if (skip[k]) return false;
      var v = evidence[k];
      return v != null && typeof v !== 'object';
    }).slice(0, 4).map(function(k) {
      var v = evidence[k];
      var val = typeof v === 'number'
        ? (Math.abs(v) < 1 && v !== 0 ? Number(v).toFixed(2) : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
        : String(v);
      var label = labels[k] || String(k).replace(/_/g, ' ');
      if (/^[a-z0-9 ]+$/i.test(label) && !labels[k]) {
        // Hide raw engineer keys that we don't recognize.
        return '';
      }
      return '<span class="rec-evidence-chip"><b>' + escHtml(label) + '</b> ' + escHtml(val) + '</span>';
    }).filter(Boolean).join('');
  }

  function renderAccountBar() {
    const bar = document.getElementById('rec-account-bar');
    if (!bar || !dashData || !dashData.workspace) return;
    const cc = dashData.workspace.campaignCounts || {};
    const win = cc.deliveryWindowDays || 30;
    document.getElementById('rec-delivering').textContent = cc.deliveringInWindow ?? dashData.workspace.activeCampaigns ?? '—';
    document.getElementById('rec-today').textContent = cc.spendingToday ?? '—';
    const synced = dashData.workspace.lastSyncedAt;
    document.getElementById('rec-sync').textContent = synced
      ? fmtTime(synced) + ' · ' + fmtDate(synced).split(',')[0]
      : '—';
    document.getElementById('rec-window').textContent = win + ' يوم';
    bar.style.display = 'grid';
  }

  function severityRank(sev) {
    const s = String(sev || '').toUpperCase();
    if (s === 'CRITICAL') return 0;
    if (s === 'HIGH') return 1;
    if (s === 'MEDIUM') return 2;
    return 3;
  }

  function findRec(issue) {
    const code = issueKey(issue);
    return recs.find(function(r) {
      const src = r.sourceIssuesJson;
      return Array.isArray(src) && src.includes(code);
    }) || null;
  }

  function renderCard(issue) {
    const rec = findRec(issue);
    const sev = severityLabel(issue.severity);
    const action = plainAction(issue, rec);
    const why = plainWhy(issue);
    const chips = evidenceChips(issue);
    const ask = 'اشرح لي ببساطة: ' + issueTitle(issue) + ' وماذا أفعل الآن؟';

    return '<article class="rec-card" style="border-inline-start-color:' + sev.color + ';" data-severity="' + escHtml(String(issue.severity || '').toUpperCase()) + '">'
      + '<div class="rec-card-head">'
      +   '<span class="rec-sev" style="background:' + sev.color + '22;color:' + sev.color + ';">' + escHtml(sev.text) + '</span>'
      +   '<div class="rec-card-title">' + escHtml(issueTitle(issue)) + '</div>'
      + '</div>'
      + '<div class="rec-plain">' + escHtml(why) + '</div>'
      + '<div class="rec-action-box">'
      +   '<div class="rec-action-label">ماذا تفعل الآن؟</div>'
      +   '<div class="rec-action-text">' + escHtml(action) + '</div>'
      + '</div>'
      + (chips ? '<div class="rec-evidence">' + chips + '</div>' : '')
      + '<div class="rec-card-actions">'
      +   '<a class="btn btn-secondary btn-sm" href="/ai?q=' + encodeURIComponent(ask) + '">اسأل المساعد ببساطة</a>'
      +   '<a class="btn btn-ghost btn-sm" href="/campaigns">افتح الحملات</a>'
      + '</div>'
      + '</article>';
  }

  function render() {
    const q = (document.getElementById('search-input').value || '').toLowerCase();
    let issues = (allIssues || []).slice();

    document.getElementById('stat-total').textContent = issues.length;
    document.getElementById('stat-critical').textContent = issues.filter(i => String(i.severity).toUpperCase() === 'CRITICAL').length;
    document.getElementById('stat-high').textContent = issues.filter(i => String(i.severity).toUpperCase() === 'HIGH').length;
    document.getElementById('stat-medium').textContent = issues.filter(i => String(i.severity).toUpperCase() === 'MEDIUM').length;

    const topIssue = issues.slice().sort(function(a, b) {
      return severityRank(a.severity) - severityRank(b.severity);
    })[0];
    document.getElementById('stat-action').textContent = topIssue
      ? plainAction(topIssue, findRec(topIssue))
      : 'لا إجراء مطلوب';

    if (activeFilter !== 'all') {
      issues = issues.filter(i => String(i.severity || '').toUpperCase() === activeFilter);
    }
    if (q) {
      issues = issues.filter(i =>
        issueTitle(i).toLowerCase().includes(q) ||
        plainAction(i, findRec(i)).toLowerCase().includes(q) ||
        plainWhy(i).toLowerCase().includes(q)
      );
    }

    issues.sort(function(a, b) {
      const sr = severityRank(a.severity) - severityRank(b.severity);
      if (sr !== 0) return sr;
      return 0;
    });

    const container = document.getElementById('issues-container');
    if (!issues.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">'
        + (activeFilter === 'all' ? 'لا توجد توصيات الآن' : 'لا توجد توصيات في هذه الفئة')
        + '</div><div class="empty-text">حسابك يبدو مستقراً. حدّث الصفحة بعد المزامنة إن أردت أحدث قراءة.</div></div>';
      return;
    }

    const urgent = issues.filter(i => ['CRITICAL', 'HIGH'].includes(String(i.severity || '').toUpperCase()));
    const later = issues.filter(i => !['CRITICAL', 'HIGH'].includes(String(i.severity || '').toUpperCase()));
    let html = '';
    if (urgent.length) {
      html += '<section class="rec-group"><div class="rec-group-title">ابدأ من هنا · ' + urgent.length + '</div>'
        + urgent.map(renderCard).join('') + '</section>';
    }
    if (later.length) {
      html += '<section class="rec-group"><div class="rec-group-title">للمتابعة لاحقاً · ' + later.length + '</div>'
        + later.map(renderCard).join('') + '</section>';
    }
    container.innerHTML = html;
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
