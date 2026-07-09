// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/recommendationsPage.ts
//
//  Recommendations as merchant TASKS:
//    فهم → قرار → فعل → تحقق
//  Plain Arabic only. Apply / ignore closed-loop via existing API.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function recommendationsPage(): string {
  const content = `
<div class="rec-page">
  <div class="page-header rec-header">
    <div>
      <div class="page-title">مهامك اليوم</div>
      <div class="page-subtitle">افهم ما يحدث → قرّر → نفّذ خطوة → راجع النتيجة</div>
    </div>
    <button class="btn btn-secondary btn-sm" id="refresh-btn" type="button">↻ تحديث</button>
  </div>

  <div class="rec-loop" aria-hidden="true">
    <span class="rec-loop-step is-on">١ فهم</span>
    <span class="rec-loop-sep">→</span>
    <span class="rec-loop-step is-on">٢ قرار</span>
    <span class="rec-loop-sep">→</span>
    <span class="rec-loop-step is-on">٣ فعل</span>
    <span class="rec-loop-sep">→</span>
    <span class="rec-loop-step is-on">٤ تحقق</span>
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
      <button class="tab active" data-filter="all" type="button">الكل</button>
      <button class="tab" data-filter="CRITICAL" type="button">مستعجل</button>
      <button class="tab" data-filter="HIGH" type="button">مهم</button>
      <button class="tab" data-filter="MEDIUM" type="button">للمتابعة</button>
      <button class="tab" data-filter="LOW" type="button">معلومة</button>
    </div>
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="form-input search-input" id="search-input" placeholder="ابحث في المهام…" style="width:220px;">
    </div>
  </div>

  <div class="rec-kpi-row" id="summary-grid">
    <div class="rec-kpi"><div class="rec-kpi-label">كل المهام</div><div class="rec-kpi-val" id="stat-total">—</div></div>
    <div class="rec-kpi rec-kpi-critical"><div class="rec-kpi-label">مستعجل</div><div class="rec-kpi-val" id="stat-critical">—</div></div>
    <div class="rec-kpi rec-kpi-high"><div class="rec-kpi-label">مهم</div><div class="rec-kpi-val" id="stat-high">—</div></div>
    <div class="rec-kpi rec-kpi-medium"><div class="rec-kpi-label">للمتابعة</div><div class="rec-kpi-val" id="stat-medium">—</div></div>
    <div class="rec-kpi rec-kpi-accent"><div class="rec-kpi-label">ابدأ بهذه</div><div class="rec-kpi-val rec-kpi-action" id="stat-action">—</div></div>
  </div>

  <div id="issues-container">
    <div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ تحميل المهام…</div></div>
  </div>
</div>

<div id="rec-task-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this) closeRecTaskModal()">
  <div class="modal" style="max-width:460px;">
    <div class="modal-title" id="rec-task-modal-title">طبّق المهمة</div>
    <div class="modal-subtitle" id="rec-task-modal-sub">اتبع الخطوات في مدير إعلانات فيسبوك ثم أكّد.</div>
    <div id="rec-task-modal-steps" class="rec-modal-steps"></div>
    <div class="modal-footer" style="gap:8px;">
      <button type="button" class="btn btn-secondary btn-sm" id="rec-task-modal-cancel">إلغاء</button>
      <button type="button" class="btn btn-primary btn-sm" id="rec-task-modal-confirm">نفّذت المهمة</button>
    </div>
  </div>
</div>

<style>
  .rec-page { direction: rtl; max-width: 920px; margin: 0 auto; }
  .rec-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .rec-loop {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin: -6px 0 18px; padding: 10px 14px;
    background: rgba(217,167,89,0.06); border: 1px solid rgba(217,167,89,0.18);
    border-radius: 999px; width: fit-content; max-width: 100%;
  }
  .rec-loop-step { font-size: 11.5px; font-weight: 800; color: var(--text-3); }
  .rec-loop-step.is-on { color: var(--accent-2); }
  .rec-loop-sep { color: var(--text-3); opacity: 0.5; font-size: 12px; }
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
    transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
  }
  .rec-card:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(0,0,0,0.16); }
  .rec-card.is-done { opacity: 0.55; }
  .rec-card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .rec-sev {
    font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; white-space: nowrap;
  }
  .rec-card-title { font-size: 15px; font-weight: 800; color: var(--text); flex: 1; min-width: 0; line-height: 1.4; }
  .rec-block { margin-bottom: 12px; }
  .rec-block-label { font-size: 11px; font-weight: 800; color: var(--accent-2); margin-bottom: 4px; letter-spacing: 0.02em; }
  .rec-block-text { font-size: 13.5px; color: var(--text-2); line-height: 1.65; }
  .rec-action-box {
    background: rgba(217,167,89,0.07); border: 1px solid rgba(217,167,89,0.18);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;
  }
  .rec-action-label { font-size: 11px; font-weight: 800; color: var(--accent-2); margin-bottom: 4px; }
  .rec-action-text { font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.5; }
  .rec-steps { margin: 0; padding-inline-start: 18px; }
  .rec-steps li { font-size: 13px; color: var(--text-2); line-height: 1.55; margin-bottom: 4px; }
  .rec-expect {
    font-size: 12.5px; color: var(--text-3); line-height: 1.55;
    padding: 10px 12px; border-radius: 10px;
    background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.08);
  }
  .rec-card-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .rec-modal-steps { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 4px; }
  .rec-modal-step {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 10px 12px; border-radius: 10px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    font-size: 13px; color: var(--text-2); line-height: 1.5;
  }
  .rec-modal-step b {
    width: 22px; height: 22px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(217,167,89,0.16); color: var(--accent-2);
    font-size: 11px; flex-shrink: 0;
  }
</style>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { window.location.href = '/dashboard'; return; }

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  var nameEl = document.getElementById('user-name');
  var emailEl = document.getElementById('user-email');
  var avEl = document.getElementById('user-avatar-initials') || document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = me.name || me.email;
  if (emailEl) emailEl.textContent = me.email;
  if (avEl) avEl.textContent = (me.name || me.email || '?')[0].toUpperCase();
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  var wsNameEl = document.getElementById('ws-name');
  if (wsNameEl) wsNameEl.textContent = wsM?.workspace?.name || 'مساحة العمل';

  let allIssues = [];
  let recs = [];
  let dashData = null;
  let activeFilter = 'all';
  let pendingTask = null;

  // ── Shared plain-Arabic maps (mirrors src/lib/plainArabicAdvice.ts) ──
  var ISSUE_TITLES = {
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
  var ISSUE_WHY = {
    LOW_CTR: 'الناس يرون الإعلان لكن قليل منهم ينقرون عليه.',
    HIGH_FREQUENCY: 'نفس الأشخاص يشاهدون الإعلان مرات كثيرة فتقلّ استجابتهم.',
    AUDIENCE_FATIGUE: 'التصميم أو الجمهور أصبح مألوفاً جداً للجمهور الحالي.',
    DECLINING_RESULTS: 'النتائج أضعف من الفترة السابقة.',
    RISING_COST_PER_RESULT: 'تدفع أكثر مقابل كل نتيجة مقارنة بما قبل.',
    HIGH_CPM: 'الوصول لنفس العدد من الناس أصبح أغلى.',
    BUDGET_BURNING_FAST: 'الميزانية اليومية تُستهلك أسرع من المعتاد.',
    LOW_REACH: 'الإعلان يصل لعدد أقل من الأشخاص مما تحتاج.',
    STALLED_DELIVERY: 'الحملة لا تظهر بشكل منتظم للجمهور.',
  };
  var ISSUE_ACTION = {
    LOW_CTR: 'جرّب صورة أو جملة افتتاحية جديدة خلال هذا الأسبوع',
    HIGH_FREQUENCY: 'أوقف أضعف إعلان وقدّم تصميماً جديداً',
    AUDIENCE_FATIGUE: 'جدّد التصميم ووسّع الجمهور قليلاً',
    DECLINING_RESULTS: 'راجع أفضل إعلان وأوقف الأضعف',
    RISING_COST_PER_RESULT: 'خفّض الميزانية على الأغلى وأبقِ الأفضل',
    HIGH_CPM: 'راجع الاستهداف والميزانية قبل زيادة الإنفاق',
    BUDGET_BURNING_FAST: 'خفّض الميزانية اليومية حتى تستقر النتائج',
    LOW_REACH: 'وسّع الجمهور أو زد الميزانية بحذر',
    STALLED_DELIVERY: 'راجع حالة الحملة والميزانية في مدير الإعلانات',
  };
  var ISSUE_EXPECT = {
    LOW_CTR: 'بعد ٣–٥ أيام راقب هل زاد عدد النقرات دون رفع التكلفة كثيراً.',
    HIGH_FREQUENCY: 'خلال ٥–٧ أيام يفترض أن يتحسن التفاعل إذا وصل التصميم الجديد لجمهور أوسع.',
    AUDIENCE_FATIGUE: 'خلال أسبوع راقب انخفاض مرات الظهور لنفس الشخص وتحسّن النتائج.',
    DECLINING_RESULTS: 'راجع بعد ٤٨–٧٢ ساعة: هل توقفت النتائج عن التراجع؟',
    RISING_COST_PER_RESULT: 'خلال ٣–٥ أيام راقب تكلفة كل نتيجة — الهدف أن تتوقف عن الارتفاع.',
    HIGH_CPM: 'خلال أيام قليلة راقب هل انخفضت تكلفة الوصول بعد تعديل الاستهداف.',
    BUDGET_BURNING_FAST: 'خلال يومين راقب سرعة الصرف — يجب أن تصبح أقرب للوتيرة اليومية المعتادة.',
    LOW_REACH: 'خلال ٣ أيام راقب هل زاد عدد الأشخاص الذين رأوا الإعلان.',
    STALLED_DELIVERY: 'خلال ٢٤ ساعة تأكد أن الحملة تظهر وتنفق بشكل طبيعي.',
  };
  var ISSUE_STEPS = {
    LOW_CTR: ['افتح أفضل حملة حالياً في مدير إعلانات فيسبوك.', 'بدّل الصورة أو الجملة الأولى فقط — لا تغيّر كل شيء دفعة واحدة.', 'اترك التعديل يعمل ٣–٥ أيام ثم راجع عدد النقرات.'],
    HIGH_FREQUENCY: ['حدد الإعلان الذي يظهر كثيراً لنفس الأشخاص.', 'أوقفه مؤقتاً أو استبدله بتصميم جديد.', 'وسّع الجمهور قليلاً إن أمكن.'],
    AUDIENCE_FATIGUE: ['قدّم تصميماً جديداً (صورة/فيديو/نص مختلف).', 'وسّع الجمهور أو أضف شريحة مشابهة.', 'راقب التفاعل خلال أسبوع.'],
    DECLINING_RESULTS: ['قارن أفضل حملة بأضعف حملة.', 'أوقف الأضعف أو خفّض ميزانيته.', 'أبقِ الميزانية على ما يعمل.'],
    RISING_COST_PER_RESULT: ['حدد الحملات الأغلى مقابل كل نتيجة.', 'خفّض ميزانيتها أو أوقفها.', 'راجع بعد ٣ أيام هل التكلفة استقرت.'],
    HIGH_CPM: ['راجع الاستهداف — هل الجمهور ضيق جداً؟', 'لا ترفع الميزانية قبل تحسين التصميم أو الجمهور.', 'راقب تكلفة الوصول خلال أيام.'],
    BUDGET_BURNING_FAST: ['خفّض الميزانية اليومية قليلاً.', 'تأكد أن الحملات لا تتنافس على نفس الجمهور.', 'راقب الصرف خلال يومين.'],
  };
  var ACTION_LABELS = {
    IMPROVE_HOOKS: 'حسّن بداية الإعلان',
    REFRESH_CREATIVES: 'جدّد صورة أو فيديو الإعلان',
    REFRESH_CREATIVE: 'جدّد التصميم',
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
    HOLD_AND_MONITOR: 'راقب دون تغيير كبير الآن',
    KEEP_COLLECTING: 'اترك الحملة تجمع بيانات أكثر',
    RESCUE_WATCH: 'راقب إشارة تحسّن قبل الإيقاف',
    EMERGENCY_PAUSE: 'أوقف الحملة فوراً',
    CTR_TEST_NEW_HOOKS: 'جرّب افتتاحية جديدة للإعلان',
    CTR_REFRESH_CREATIVES: 'جدّد تصميم الإعلان',
    FREQ_EXPAND_AUDIENCE: 'وسّع الجمهور لتقليل التكرار',
    FREQ_REFRESH_CREATIVE: 'جدّد التصميم لأن الجمهور تكرّر عليه',
  };

  function simplifyText(text) {
    if (!text) return '';
    var t = String(text);
    t = t.replace(/\\bCTR\\b/gi, 'نسبة النقر');
    t = t.replace(/\\bCPM\\b/gi, 'تكلفة الوصول');
    t = t.replace(/\\bCPC\\b/gi, 'تكلفة النقرة');
    t = t.replace(/\\bCPA\\b/gi, 'تكلفة النتيجة');
    t = t.replace(/\\bROAS\\b/gi, 'العائد على الإنفاق');
    t = t.replace(/\\bfrequency\\b/gi, 'مرات الظهور لنفس الشخص');
    t = t.replace(/\\blookalike\\b/gi, 'جمهور مشابه');
    t = t.replace(/\\bad set(s)?\\b/gi, 'مجموعة إعلانات');
    t = t.replace(/\\bcreative(s)?\\b/gi, 'التصميم');
    t = t.replace(/\\(Source:[^)]+\\)/gi, '');
    t = t.replace(/Click-Through Rate/gi, 'نسبة النقر');
    t = t.replace(/Cost per (message|result|conversation)/gi, 'تكلفة النتيجة');
    t = t.replace(/\\b(REFRESH_CREATIVES?|BROADEN_AUDIENCE|IMPROVE_HOOKS|PAUSE_AND_RELAUNCH|REVIEW_BUDGET_PACING|CHECK_TARGETING|RESCUE_WATCH|KEEP_COLLECTING|EMERGENCY_PAUSE|SCALE_BUDGET|HOLD_AND_MONITOR)\\b/g, function(m) {
      return ACTION_LABELS[m] || 'إجراء مقترح';
    });
    t = t.replace(/\\b(LOW_CTR|HIGH_CPM|HIGH_FREQUENCY|AUDIENCE_FATIGUE|DECLINING_RESULTS|BUDGET_BURNING_FAST|LOW_REACH|RISING_COST_PER_RESULT|STALLED_DELIVERY)\\b/g, function(m) {
      return ISSUE_TITLES[m] || m;
    });
    if (/[A-Za-z]{4,}/.test(t) && !/[\\u0600-\\u06FF]/.test(t)) return '';
    return t.replace(/\\s+/g, ' ').trim();
  }

  function issueKey(issue) { return issue.code || issue.issueCode || ''; }

  function severityLabel(sev) {
    var s = String(sev || 'LOW').toUpperCase();
    if (s === 'CRITICAL') return { text: 'مستعجل', color: 'var(--critical)', key: 'CRITICAL' };
    if (s === 'HIGH') return { text: 'مهم', color: 'var(--error)', key: 'HIGH' };
    if (s === 'MEDIUM') return { text: 'للمتابعة', color: 'var(--warning)', key: 'MEDIUM' };
    return { text: 'معلومة', color: 'var(--text-3)', key: 'LOW' };
  }

  function findRec(issue) {
    var code = issueKey(issue);
    return recs.find(function(r) {
      var src = r.sourceIssuesJson;
      return Array.isArray(src) && src.includes(code);
    }) || null;
  }

  function buildTask(issue) {
    var code = issueKey(issue);
    var rec = findRec(issue);
    var actionCode = rec && rec.actionCode ? rec.actionCode : null;
    var title = (issue.title && !/^[A-Z0-9_]+$/.test(String(issue.title)))
      ? simplifyText(issue.title) || ISSUE_TITLES[code] || 'ملاحظة على الحساب'
      : (ISSUE_TITLES[code] || 'ملاحظة على الحساب');
    var causes = Array.isArray(issue.causes) ? issue.causes.map(simplifyText).filter(Boolean) : [];
    var why = causes.length ? causes.slice(0, 2).join(' · ') : (ISSUE_WHY[code] || 'راجع الحملة واتخذ خطوة بسيطة اليوم.');
    var action = '';
    if (actionCode && ACTION_LABELS[actionCode]) action = ACTION_LABELS[actionCode];
    if (!action) {
      var list = Array.isArray(issue.recommendations) ? issue.recommendations : [];
      for (var i = 0; i < list.length; i++) {
        var s = simplifyText(list[i]);
        if (s) { action = s; break; }
      }
    }
    if (!action) action = ISSUE_ACTION[code] || 'افتح الحملات وطبّق تعديلاً واحداً واضحاً';
    var steps = ISSUE_STEPS[code] ? ISSUE_STEPS[code].slice() : [];
    if (!steps.length) {
      var recSteps = (issue.recommendations || []).map(simplifyText).filter(Boolean).slice(0, 3);
      steps = recSteps.length ? recSteps : [action, 'طبّق التعديل في مدير إعلانات فيسبوك.', 'راجع النتيجة بعد بضعة أيام.'];
    }
    var expect = ISSUE_EXPECT[code] || 'راجع النتيجة خلال ٣–٧ أيام بعد تطبيق الخطوة.';
    var sev = severityLabel(issue.severity);
    return {
      itemKey: 'issue:' + (code || 'UNKNOWN'),
      issueCode: code,
      actionCode: actionCode,
      severity: sev,
      title: title,
      why: why,
      action: action,
      steps: steps,
      expect: expect,
      askAi: 'اشرح لي ببساطة: ' + title + '. ماذا أفعل الآن خطوة بخطوة؟ ومتى أراجع النتيجة؟',
    };
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('ar-u-nu-latn', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return String(iso).slice(0, 10); }
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function renderAccountBar() {
    var bar = document.getElementById('rec-account-bar');
    if (!bar || !dashData || !dashData.workspace) return;
    var cc = dashData.workspace.campaignCounts || {};
    var win = cc.deliveryWindowDays || 30;
    document.getElementById('rec-delivering').textContent = cc.deliveringInWindow ?? dashData.workspace.activeCampaigns ?? '—';
    document.getElementById('rec-today').textContent = cc.spendingToday ?? '—';
    var synced = dashData.workspace.lastSyncedAt;
    document.getElementById('rec-sync').textContent = synced
      ? fmtTime(synced) + ' · ' + fmtDate(synced).split(',')[0]
      : '—';
    document.getElementById('rec-window').textContent = win + ' يوم';
    bar.style.display = 'grid';
  }

  function severityRank(sev) {
    var s = String(sev || '').toUpperCase();
    if (s === 'CRITICAL') return 0;
    if (s === 'HIGH') return 1;
    if (s === 'MEDIUM') return 2;
    return 3;
  }

  function taskSeverity(task) {
    if (task && task.severity && typeof task.severity === 'object' && task.severity.key) {
      return task.severity;
    }
    return severityLabel(task && task.severity);
  }

  function renderCardFromTask(task) {
    var sev = taskSeverity(task);
    return '<article class="rec-card" style="border-inline-start-color:' + sev.color + ';" data-severity="' + escHtml(sev.key) + '" data-item-key="' + escHtml(task.itemKey) + '">'
      + '<div class="rec-card-head">'
      +   '<span class="rec-sev" style="background:' + sev.color + '22;color:' + sev.color + ';">' + escHtml(task.severityLabel || sev.text) + '</span>'
      +   '<div class="rec-card-title">' + escHtml(task.title) + '</div>'
      + '</div>'
      + '<div class="rec-block"><div class="rec-block-label">١ · ماذا يحدث؟</div><div class="rec-block-text">' + escHtml(task.why) + '</div></div>'
      + '<div class="rec-action-box">'
      +   '<div class="rec-action-label">٢ · ماذا تفعل الآن؟</div>'
      +   '<div class="rec-action-text">' + escHtml(task.action) + '</div>'
      + '</div>'
      + '<div class="rec-block"><div class="rec-block-label">٣ · الخطوات</div><ol class="rec-steps">'
      + (task.steps || []).map(function(s) { return '<li>' + escHtml(s) + '</li>'; }).join('')
      + '</ol></div>'
      + '<div class="rec-expect"><b>٤ · تحقق:</b> ' + escHtml(task.expect) + '</div>'
      + '<div class="rec-card-actions">'
      +   '<button type="button" class="btn btn-primary btn-sm rec-do-btn" data-item-key="' + escHtml(task.itemKey) + '">نفّذت المهمة</button>'
      +   '<button type="button" class="btn btn-secondary btn-sm rec-ignore-btn" data-item-key="' + escHtml(task.itemKey) + '">تجاهل</button>'
      +   '<a class="btn btn-ghost btn-sm" href="/ai?q=' + encodeURIComponent(task.askAi || '') + '">اسأل المساعد</a>'
      +   '<a class="btn btn-ghost btn-sm" href="/campaigns">افتح الحملات</a>'
      + '</div>'
      + '</article>';
  }

  function allTasks() {
    if (Array.isArray(dashData && dashData.merchantTasks) && dashData.merchantTasks.length) {
      return dashData.merchantTasks.slice();
    }
    return (allIssues || []).map(buildTask);
  }

  function render() {
    var q = (document.getElementById('search-input').value || '').toLowerCase();
    var tasks = allTasks();

    document.getElementById('stat-total').textContent = tasks.length;
    document.getElementById('stat-critical').textContent = tasks.filter(i => String(i.severity).toUpperCase() === 'CRITICAL').length;
    document.getElementById('stat-high').textContent = tasks.filter(i => String(i.severity).toUpperCase() === 'HIGH').length;
    document.getElementById('stat-medium').textContent = tasks.filter(i => String(i.severity).toUpperCase() === 'MEDIUM').length;

    var topTask = tasks.slice().sort(function(a, b) {
      return severityRank(a.severity) - severityRank(b.severity);
    })[0];
    document.getElementById('stat-action').textContent = topTask
      ? topTask.action
      : 'لا مهمة مطلوبة';

    if (activeFilter !== 'all') {
      tasks = tasks.filter(i => String(i.severity || '').toUpperCase() === activeFilter);
    }
    if (q) {
      tasks = tasks.filter(function(t) {
        return (t.title || '').toLowerCase().includes(q) || (t.action || '').toLowerCase().includes(q) || (t.why || '').toLowerCase().includes(q);
      });
    }

    tasks.sort(function(a, b) {
      return severityRank(a.severity) - severityRank(b.severity);
    });

    var container = document.getElementById('issues-container');
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">'
        + (activeFilter === 'all' ? 'لا توجد مهام الآن' : 'لا توجد مهام في هذه الفئة')
        + '</div><div class="empty-text">حسابك يبدو مستقراً. حدّث الصفحة بعد المزامنة إن أردت أحدث قراءة.</div></div>';
      return;
    }

    var urgent = tasks.filter(i => ['CRITICAL', 'HIGH'].includes(String(i.severity || '').toUpperCase()));
    var later = tasks.filter(i => !['CRITICAL', 'HIGH'].includes(String(i.severity || '').toUpperCase()));
    var html = '';
    if (urgent.length) {
      html += '<section class="rec-group"><div class="rec-group-title">ابدأ من هنا · ' + urgent.length + '</div>'
        + urgent.map(renderCardFromTask).join('') + '</section>';
    }
    if (later.length) {
      html += '<section class="rec-group"><div class="rec-group-title">للمتابعة لاحقاً · ' + later.length + '</div>'
        + later.map(renderCardFromTask).join('') + '</section>';
    }
    container.innerHTML = html;
  }

  function findTaskByKey(itemKey) {
    return allTasks().find(function(t) { return t.itemKey === itemKey; }) || null;
  }

  window.closeRecTaskModal = function() {
    var modal = document.getElementById('rec-task-modal');
    if (modal) modal.style.display = 'none';
    pendingTask = null;
  };

  function openDoModal(itemKey) {
    var task = findTaskByKey(itemKey);
    if (!task) return;
    pendingTask = task;
    document.getElementById('rec-task-modal-title').textContent = task.action;
    document.getElementById('rec-task-modal-sub').textContent = 'اتبع الخطوات ثم أكّد أنك نفّذتها — سنراقب النتيجة خلال ٧ أيام.';
    document.getElementById('rec-task-modal-steps').innerHTML = (task.steps || []).map(function(s, idx) {
      return '<div class="rec-modal-step"><b>' + (idx + 1) + '</b><span>' + escHtml(s) + '</span></div>';
    }).join('');
    document.getElementById('rec-task-modal').style.display = 'flex';
  }

  async function postAction(action, task) {
    await apiFetch('/api/workspaces/' + encodeURIComponent(wsId) + '/recommendations/action', {
      method: 'POST',
      body: JSON.stringify({
        action: action,
        itemKey: task.itemKey,
        itemKind: 'issue',
        actionCode: task.actionCode || null,
        title: task.title,
      }),
    });
  }

  async function confirmDo() {
    if (!pendingTask) return;
    var btn = document.getElementById('rec-task-modal-confirm');
    if (btn) btn.disabled = true;
    try {
      await postAction('EXECUTED', pendingTask);
      toast('تم تسجيل المهمة — سنراقب النتائج خلال ٧ أيام', 'success');
      closeRecTaskModal();
      await loadData();
    } catch (e) {
      toast(e.message || 'تعذّر تسجيل المهمة', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function ignoreTask(itemKey) {
    var task = findTaskByKey(itemKey);
    if (!task) return;
    try {
      await postAction('IGNORED', task);
      toast('تم تجاهل المهمة', 'info');
      await loadData();
    } catch (e) {
      toast(e.message || 'تعذّر التجاهل', 'error');
    }
  }

  document.getElementById('issues-container').addEventListener('click', function(e) {
    var doBtn = e.target.closest('.rec-do-btn');
    if (doBtn) { openDoModal(doBtn.getAttribute('data-item-key')); return; }
    var igBtn = e.target.closest('.rec-ignore-btn');
    if (igBtn) { ignoreTask(igBtn.getAttribute('data-item-key')); }
  });
  document.getElementById('rec-task-modal-cancel').addEventListener('click', closeRecTaskModal);
  document.getElementById('rec-task-modal-confirm').addEventListener('click', confirmDo);

  async function loadData() {
    document.getElementById('issues-container').innerHTML =
      '<div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ التحميل…</div></div>';
    try {
      var results = await Promise.all([
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

  document.getElementById('severity-tabs').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#severity-tabs .tab').forEach(function(t) { t.classList.toggle('active', t === btn); });
    render();
  });
  document.getElementById('search-input').addEventListener('input', render);
  document.getElementById('refresh-btn').addEventListener('click', loadData);

  await loadData();
})();
</script>`;

  return layout({ title: 'المهام', active: 'recommendations', content, scripts });
}
