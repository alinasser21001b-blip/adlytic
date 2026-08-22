// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminOsPage.ts — the original Admin operating system.
//
//  Organised around the operator's JOBS rather than our database tables, with
//  the epistemic ladder and the capability-probe experiments in their first
//  form. Both are still reachable here exactly as they were.
//
//  ── Why it renders inside the Control Plane shell ─────────────────────
//
//  It drew its own rail, its own top bar and its own command palette. An
//  operator who reached it — from a bookmark, or from the command palette
//  entry that names it — left the Control Plane and arrived somewhere that
//  looked like a different application.
//
//  Its own navigation is gone; the shell owns that. Everything it renders is
//  untouched, because the ladder's four rungs and the experiments view are the
//  reason this route still exists at all.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `:root { --font: var(--font-body); --rail: 244px; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; border: none; background: none; }
/* Technical values are LTR monospace ALWAYS. An account id or an error
       string reversed by RTL is not merely ugly — it is unsearchable and
       unquotable, and an operator pastes these into tickets. */
    .ev { direction: ltr; text-align: left; font-family: ui-monospace, "SF Mono", Consolas, monospace;
      font-size: 11.5px; color: var(--text-3); word-break: break-all; }
.ev-inline { display: inline-block; }
.gate { position: fixed; inset: 0; z-index: 999; background: var(--bg);
      display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--text-2); font-weight: 600; }
.gate.hidden { display: none; }
.spin { width: 26px; height: 26px; border: 3px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: sp 0.7s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); }
}
.nav-item.active { background: var(--accent-dim); color: var(--accent-2); }
.nav-item.active .nav-item-hint { color: var(--accent-2); opacity: 0.75; }
.nav-count { margin-right: auto; font-size: 11px; font-weight: 800; }
.view { display: none; }
.view.on { display: block; }
.h2 { font-size: 13px; font-weight: 800; color: var(--text-2); margin: 0 0 10px;
      display: flex; align-items: baseline; gap: 10px; }
.h2 .muted { font-weight: 600; }
.muted { color: var(--text-3); font-size: 12px; }
.card { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: 14px 16px; }
.stack > * + * { margin-top: 10px; }
.sec + .sec { margin-top: 26px; }
/* ── Status: glyph + word + colour. Never colour alone. ──────────── */
    .st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.st-g { width: 15px; text-align: center; font-size: 11px; }
.st-HEALTHY { color: var(--success); }
.st-RUNNING { color: var(--accent-2); }
.st-DEGRADED, .st-WARNING { color: var(--warning); }
.st-ERROR, .st-BLOCKED { color: var(--error); }
/* UNKNOWN and NOT_TESTED are DELIBERATELY not red. "We could not
       determine this" is not "this is broken", and colouring them alike
       teaches the operator to ignore both. */
    .st-UNKNOWN, .st-NOT_TESTED { color: var(--text-3); }
/* ── System pulse ─────────────────────────────────────────────────── */
    .pulse { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.pulse-main { font-size: 20px; font-weight: 800; }
.pulse-known { font-size: 12px; color: var(--text-3); }
.pulse-unknown { font-size: 12px; color: var(--warning); font-weight: 700; }
.grid { display: grid; gap: 10px; }
.g3 { grid-template-columns: repeat(3, 1fr); }
.g2 { grid-template-columns: repeat(2, 1fr); }
@media (max-width: 900px) { .g3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 620px) { .g3, .g2 { grid-template-columns: 1fr; }
}
/* ── Attention: severity by rail, never by fill ───────────────────── */
    .att { display: block; border: 1px solid var(--border); border-right-width: 3px; border-radius: 10px;
      background: var(--surface); padding: 12px 14px; }
.att-ERROR { border-right-color: var(--error); }
.att-WARNING { border-right-color: var(--warning); }
.att-INFO { border-right-color: var(--accent); }
.att-t { font-weight: 800; font-size: 13.5px; margin-bottom: 3px; }
.att-w { font-size: 12.5px; color: var(--text-2); line-height: 1.65; }
.att-a { font-size: 12px; color: var(--accent-2); font-weight: 700; margin-top: 6px; display: inline-block; }
.clear { padding: 20px; text-align: center; color: var(--success); font-weight: 700;
      border: 1px solid var(--success); border-radius: 10px; background: var(--success-dim); }
/* ── Boundary: the signature surface ──────────────────────────────── */
    .bnd { border: 1px dashed var(--border-control); border-radius: 10px; background: var(--surface); padding: 13px 15px; }
.bnd-h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 5px; }
.bnd-s { font-weight: 800; font-size: 13.5px; }
.bnd-w { font-size: 12.5px; color: var(--text-2); line-height: 1.65; }
.bnd-r { font-size: 12px; margin-top: 6px; }
.bnd-r b { color: var(--accent-2); }
table.t { width: 100%; border-collapse: collapse; font-size: 13px; }
table.t th { text-align: right; padding: 9px 10px; font-size: 10.5px; color: var(--text-3);
      border-bottom: 1px solid var(--border); font-weight: 800; letter-spacing: 0.03em; }
table.t td { padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
table.t tbody tr:hover td { background: var(--surface-hover); cursor: pointer; }
.empty { text-align: center; padding: 26px 12px; color: var(--text-3); }
.field { background: var(--surface-2); border: 1px solid var(--border-control); border-radius: 8px;
      padding: 7px 11px; color: var(--text); font-size: 12.5px; }
.field:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      font-weight: 700; font-size: 12.5px; border: 1px solid transparent; }
.btn-p { background: var(--accent); color: #fff; }
.btn-s { background: var(--surface-2); border-color: var(--border-control); color: var(--text); }
.btn-s:hover { border-color: var(--accent); }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* ── The epistemic ladder: four layers, visually unmergeable ─────── */
    .ladder { display: flex; flex-direction: column; gap: 0; }
.rung { border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
      padding: 14px 16px; position: relative; }
.rung + .rung { margin-top: 22px; }
/* The connector is the argument: each layer RESTS on the one below it,
       and a break anywhere below invalidates everything above. */
    .rung + .rung::before { content: '\\2193'; position: absolute; top: -19px; right: 26px;
      color: var(--text-3); font-size: 15px; }
.rung-n { font-size: 10.5px; font-weight: 800; color: var(--text-3); letter-spacing: 0.08em; }
.rung-t { font-size: 15px; font-weight: 800; margin: 3px 0 6px; }
.rung-d { font-size: 12.5px; color: var(--text-2); line-height: 1.7; }
.rung-ex { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
.rung-lbl { font-size: 10.5px; font-weight: 800; color: var(--text-3); letter-spacing: 0.05em; }
/* ── Step flow for the probe: configure → review → run → results ──── */
    .steps { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.step { font-size: 11.5px; font-weight: 700; color: var(--text-3); padding: 5px 11px;
      border: 1px solid var(--border); border-radius: 999px; }
.step.on { color: var(--accent-2); border-color: var(--accent); background: var(--accent-dim); }
.step.done { color: var(--success); border-color: var(--success); }
.doc { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px;
      max-height: 420px; overflow: auto; font-family: ui-monospace, "SF Mono", Consolas, monospace;
      font-size: 11.5px; line-height: 1.6; white-space: pre; direction: ltr; text-align: left; }
.tally { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0; }
.tally span { border: 1px solid var(--border); border-radius: 999px; padding: 3px 11px; font-size: 11.5px; color: var(--text-2); }
.tally span b { color: var(--text); }
/* ── Command bar ──────────────────────────────────────────────────── */
    .cmd { position: fixed; inset: 0; z-index: 90; background: var(--scrim); display: none;
      align-items: flex-start; justify-content: center; padding-top: 12vh; }
.cmd.open { display: flex; }
.cmd-row.sel { background: var(--accent-dim); color: var(--accent-2); }
/* ── Responsive: the rail folds, tables become labelled cards ─────── */
    @media (max-width: 1000px) {
      .os { flex-direction: column; }
}
@media (max-width: 760px) {
      table.t thead { display: none; }
table.t tr { display: block; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; padding: 4px 0; }
table.t td { display: flex; justify-content: space-between; gap: 12px; border: none; padding: 7px 12px; }
table.t td::before { content: attr(data-th); font-size: 10.5px; font-weight: 800; color: var(--text-3); flex-shrink: 0; }
}`;

const HEADER = `
  <div class="phead">
    <div>
      <div class="phead-t">نظام التشغيل الإداري</div>
      <div class="phead-s">العرض الأصلي للسلّم المعرفي والتجارب — محفوظ كما كان، داخل لوحة التحكّم الواحدة.</div>
    </div>
    <div class="phead-actions"><a class="btn" href="/admin">الحالة الآن</a></div>
  </div>
`;

const BODY = `
      <!-- ══ الآن — the decision surface ══ -->
      <section class="view on" id="v-now">
        <div class="sec">
          <div class="card">
            <div class="pulse">
              <span class="st st-UNKNOWN" id="pulse-st"><span class="st-g">○</span><span>جارٍ الفحص…</span></span>
              <span class="pulse-known" id="pulse-known"></span>
            </div>
            <div class="pulse-unknown" id="pulse-unknown" style="margin-top:6px;"></div>
          </div>
        </div>

        <div class="sec">
          <div class="h2">يحتاجك الآن <span class="muted" id="now-att-n"></span></div>
          <div class="stack" id="now-att"><div class="muted">جارٍ التحميل…</div></div>
        </div>

        <div class="sec">
          <div class="h2">مساحات متأثرة <span class="muted" id="now-ws-n"></span></div>
          <div id="now-ws"></div>
        </div>

        <div class="sec">
          <div class="h2">حدود معرفتنا <span class="muted">ما لا يستطيع هذا الكونسول تحديده</span></div>
          <div class="stack" id="now-bnd"></div>
        </div>
      </section>

      <!-- ══ الانتباه ══ -->
      <section class="view" id="v-attention">
        <div class="stack" id="att-all"></div>
      </section>

      <!-- ══ النشاط ══ -->
      <section class="view" id="v-activity">
        <table class="t">
          <thead><tr><th>الوقت</th><th>مساحة العمل</th><th>الحدث</th><th>التفصيل</th></tr></thead>
          <tbody id="act-body"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody>
        </table>
      </section>

      <!-- ══ مساحات العمل ══ -->
      <section class="view" id="v-workspaces">
        <div class="sec" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <input class="field" id="ws-q" placeholder="بحث…" style="min-width:200px;" />
          <select class="field" id="ws-f">
            <option value="all">الكل</option>
            <option value="problems">المشاكل فقط</option>
            <option value="BLOCKED">محجوب</option>
            <option value="WARNING">تحذير</option>
            <option value="HEALTHY">سليم</option>
            <option value="NOT_TESTED">لم يُربط</option>
          </select>
        </div>
        <table class="t">
          <thead><tr><th>مساحة العمل</th><th>الاتصال</th><th>البيانات</th><th>آخر مزامنة</th><th>الأثر</th></tr></thead>
          <tbody id="ws-body"><tr><td colspan="5" class="empty">جارٍ التحميل…</td></tr></tbody>
        </table>
        <div id="ws-detail" style="margin-top:14px;"></div>
      </section>

      <!-- ══ العمليات ══ -->
      <section class="view" id="v-operations">
        <div class="card" style="margin-bottom:14px;">
          <div class="h2" style="margin-bottom:6px;">الإصدار العامل الآن</div>
          <div id="ops-build"><span class="muted">—</span></div>
          <div class="att-w" style="margin-top:8px;">
            سجلّ git يوثّق ما دُفع، لا ما يُنفَّذ. هذا السطر يُقرأ من العملية نفسها،
            وهو المرجع الوحيد عند السؤال «هل نُشر التعديل؟».
          </div>
        </div>
        <div class="grid g3" id="ops-sys"></div>
      </section>

      <!-- ══ حدود المعرفة ══ -->
      <section class="view" id="v-boundary">
        <p class="muted" style="line-height:1.8;margin-bottom:14px;max-width:70ch;">
          هذه ليست قائمة نواقص. كل بند هنا شيء لا يستطيع الكونسول تحديده الآن، ومعه ما الذي
          يحسمه. المشغّل الذي يرى حافة الخريطة يتنقّل أفضل ممن رأى خريطة بلا حافة.
        </p>
        <div class="stack" id="bnd-all"></div>
      </section>

      <!-- ══ الذكاء — the epistemic ladder made visible ══ -->
      <section class="view" id="v-intelligence">
        <p class="muted" style="line-height:1.8;margin-bottom:16px;max-width:72ch;">
          كل رقم يعرضه Adlytic يقع على واحدة من أربع طبقات. الخلط بينها هو أصل
          «أنا أشكّ بالأرقام» — فرقمٌ مُلاحَظ ورقمٌ مُستنتَج يبدوان متطابقين على الشاشة
          بينما يستحقان ثقتين مختلفتين تماماً. هذه الصفحة تفصلهما.
        </p>
        <div class="ladder" id="intel-ladder"></div>
      </section>

      <!-- ══ التجارب — probe as a flow ══ -->
      <section class="view" id="v-experiments">
        <div class="steps">
          <span class="step on" id="s1">١ · الإعداد</span>
          <span class="step" id="s2">٢ · المراجعة</span>
          <span class="step" id="s3">٣ · التشغيل</span>
          <span class="step" id="s4">٤ · النتائج</span>
          <span class="step" id="s5">٥ · الدليل</span>
        </div>

        <div class="card sec">
          <div class="h2">١ · الإعداد</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <label for="pr-ws" class="muted">مساحة العمل</label>
            <select class="field" id="pr-ws" style="min-width:220px;"><option value="">جارٍ التحميل…</option></select>
          </div>
        </div>

        <div class="card sec" id="pr-review" style="display:none;">
          <div class="h2">٢ · المراجعة — قبل إنفاق أي نداء</div>
          <div id="pr-review-body" class="att-w"></div>
          <button class="btn btn-p" id="pr-run" style="margin-top:12px;" disabled>٣ · شغّل المرقاب</button>
          <span class="muted" id="pr-status" style="margin-right:10px;"></span>
        </div>

        <div class="sec" id="pr-out" style="display:none;">
          <div class="h2">٤ · النتائج</div>
          <div class="tally" id="pr-tally"></div>
          <div class="card" id="pr-interp" style="margin-bottom:12px;"></div>
          <div class="h2">٥ · الدليل الخام</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <button class="btn btn-s" type="button" data-copy="pr-matrix">نسخ المصفوفة</button>
            <button class="btn btn-s" type="button" data-copy="pr-report">نسخ التقرير</button>
          </div>
          <pre class="doc" id="pr-matrix"></pre>
          <pre class="doc" id="pr-report" style="margin-top:10px;"></pre>
        </div>
      </section>

      <!-- ══ إدارة — kept, deliberately secondary ══ -->
      <section class="view" id="v-customers">
        <table class="t">
          <thead><tr><th>الزبون</th><th>الحالة</th><th>الخطة</th><th>مساحات</th></tr></thead>
          <tbody id="cu-body"><tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr></tbody>
        </table>
      </section>
      <section class="view" id="v-revenue">
        <div class="grid g2" id="rev-cards"></div>
      </section>
      <section class="view" id="v-platform">
        <div class="card"><div class="h2">إعدادات المنصة</div>
          <p class="muted" style="line-height:1.8;">الإعدادات والاشتراكات وصندوق الدعم في الكونسول الكلاسيكي.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <a class="btn btn-s" href="/admin/classic">الكونسول الكلاسيكي</a>
            <a class="btn btn-s" href="/admin/inbox">صندوق الدعم</a>
            <a class="btn btn-s" href="/admin/observability">مراقبة المنصة</a>
            <a class="btn btn-s" href="/admin/add-client">إضافة عميل</a>
            <a class="btn btn-s" href="/admin/meta-readiness">جاهزية Meta</a>
            <a class="btn btn-s" href="/dashboard">العودة للتطبيق</a>
          </div>
        </div>
      </section>
    `;

const SCRIPT = `
(function () {
  var S = { ops: null, customers: [], stats: null, view: 'now' };
  var ST = {
    HEALTHY: ['\\u25CF', 'سليم'], RUNNING: ['\\u25D0', 'قيد التشغيل'],
    UNKNOWN: ['?', 'غير معروف'], NOT_TESTED: ['\\u25CB', 'لم يُختبَر'],
    DEGRADED: ['\\u25D1', 'متدهور'], WARNING: ['\\u25B2', 'تحذير'],
    BLOCKED: ['\\u25A0', 'محجوب'], ERROR: ['\\u2715', 'خطأ']
  };
  var SYS = { database: 'قاعدة البيانات', redis: 'Redis', queue: 'طابور المهام',
    workers: 'العمّال الخلفيون', meta: 'تكامل Meta', intelligence: 'الذكاء' };
  var TITLES = { now: ['الآن', 'ما الذي يحدث في المنصة'], attention: ['الانتباه', 'ما يحتاج تدخلاً'],
    activity: ['النشاط', 'ما تغيّر مؤخراً'], workspaces: ['مساحات العمل', 'من المتأثر ولماذا'],
    operations: ['العمليات', 'حالة البنية التحتية'], boundary: ['حدود المعرفة', 'ما لا نستطيع تحديده'],
    intelligence: ['الذكاء', 'أين تنتهي الملاحظة ويبدأ الاستدلال'],
    experiments: ['التجارب', 'مرقاب قدرات Meta'], customers: ['الزبائن', ''],
    revenue: ['الإيرادات', ''], platform: ['إعدادات المنصة', ''] };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function chip(s) {
    var d = ST[s] || ['?', s || '—'];
    return '<span class="st st-' + esc(s) + '"><span class="st-g" aria-hidden="true">' + d[0] +
      '</span><span>' + esc(d[1]) + '</span></span>';
  }
  function ago(iso) {
    if (!iso) return 'لم يحدث';
    var s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 90) return 'قبل ' + s + ' ثانية';
    var m = Math.round(s / 60);
    if (m < 90) return 'قبل ' + m + ' دقيقة';
    var h = Math.round(m / 60);
    if (h < 36) return 'قبل ' + h + ' ساعة';
    return 'قبل ' + Math.round(h / 24) + ' يوم';
  }
  function token() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  async function api(p, o) {
    o = o || {};
    var r = await fetch(p, { method: o.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token() || '') },
      body: o.body ? JSON.stringify(o.body) : undefined });
    var d = await r.json().catch(function () { return {}; });
    if (r.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!r.ok) { var e = new Error(d.error || 'Request failed'); e.code = d.code; e.detail = d.detail; e.status = r.status; throw e; }
    return d;
  }
  function logout() {
    // Clears the token, the session-mode hint and every customer-scoped key,
    // then returns to the ADMIN door. Sending an admin to /login on logout is
    // what let a stale customer session reassert itself on the next visit.
    window.AdlyticSession.clearSession();
    var go = function () { window.location.replace('/admin/login'); };
    try { fetch('/api/auth/logout', { method: 'POST' }).then(go, go); } catch (e) { go(); }
  }

  // ── Views ────────────────────────────────────────────────────────────
  function show(v) {
    if (!TITLES[v]) v = 'now';
    S.view = v;
    // Switching, the active tab and the hash are the shell's job — it renders
    // the tab strip and owns .view/#v-<id>. This function keeps only what is
    // genuinely this page's: the per-view lazy loads.
    if (window.adminShowView) window.adminShowView(v);
    else load(v);
  }

  function load(v) {
    S.view = v;
    if (v === 'experiments') loadProbeWs();
    if (v === 'customers') renderCustomers();
    if (v === 'revenue') renderRevenue();
    if (v === 'intelligence') renderIntel();
  }
  // The shell drives tab clicks and the hash; listen to its event instead of
  // racing it with a second hashchange handler. It calls load(), not show():
  // show() asks the shell to switch, and the shell answers with this event —
  // routing that back into show() is a loop, not a refresh.
  document.addEventListener('view:show', function (e) { load(e.detail); });

  function attHtml(a) {
    return '<div class="att att-' + esc(a.severity) + '">' +
      '<div class="att-t">' + esc(a.title) + '</div>' +
      '<div class="att-w">' + esc(a.because) + '</div>' +
      (a.action ? (a.href ? '<a class="att-a" href="' + esc(a.href) + '">' + esc(a.action) + ' \\u2190</a>'
                          : '<div class="att-a">' + esc(a.action) + '</div>') : '') + '</div>';
  }
  function bndHtml(b) {
    return '<div class="bnd">' +
      '<div class="bnd-h">' + chip(b.state) + '<span class="bnd-s">' + esc(b.subject) + '</span></div>' +
      '<div class="bnd-w">' + esc(b.why) + '</div>' +
      '<div class="bnd-r">يُحسم بـ: <b>' + esc(b.resolvedBy) + '</b></div>' + '</div>';
  }

  function renderOps(o) {
    S.ops = o;
    var unk = o.unknown || [], kn = o.known || [];
    var pulseSt = (o.overall === 'HEALTHY' && unk.length) ? 'UNKNOWN' : o.overall;
    var word = (o.overall === 'HEALTHY' && unk.length)
      ? 'يعمل \\u2014 مع ' + unk.length + ' مجهول' : (ST[o.overall] || ['', o.overall])[1];
    var p = document.getElementById('pulse-st');
    p.className = 'st st-' + pulseSt + ' pulse-main';
    p.innerHTML = '<span class="st-g" aria-hidden="true">' +
      ((o.overall === 'HEALTHY' && unk.length) ? '\\u25D0' : (ST[o.overall] || ['?'])[0]) +
      '</span><span>' + esc(word) + '</span>';
    document.getElementById('pulse-known').textContent =
      kn.length ? 'مرصود: ' + kn.map(function (k) { return SYS[k] || k; }).join(' \\u00B7 ') : '';
    document.getElementById('pulse-unknown').textContent =
      unk.length ? 'غير مرصود: ' + unk.map(function (k) { return SYS[k] || k; }).join(' \\u00B7 ') : '';

    var att = o.attention || [];
    document.getElementById('now-att-n').textContent = att.length ? att.length + ' بند' : '';
    document.getElementById('now-att').innerHTML = att.length
      ? att.slice(0, 3).map(attHtml).join('')
      : '<div class="clear">\\u2713 لا شيء يحتاج تدخلاً الآن</div>';
    document.getElementById('att-all').innerHTML = att.length
      ? att.map(attHtml).join('')
      : '<div class="clear">\\u2713 لا شيء يحتاج تدخلاً الآن</div>';

    var bad = (o.workspaces || []).filter(function (w) { return w.overall !== 'HEALTHY' && w.overall !== 'NOT_TESTED'; });
    document.getElementById('now-ws-n').textContent = bad.length ? bad.length + ' من ' + (o.workspaces || []).length : '';
    document.getElementById('now-ws').innerHTML = bad.length
      ? '<table class="t"><tbody>' + bad.slice(0, 5).map(function (w) {
          return '<tr data-ws="' + esc(w.workspaceId) + '"><td data-th="مساحة"><b>' + esc(w.workspaceName) +
            '</b></td><td data-th="الحالة">' + chip(w.overall) + '</td><td data-th="السبب">' +
            esc(w.headline) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="muted">لا مساحة متأثرة.</div>';

    var bnd = o.boundary || [];
    document.getElementById('now-bnd').innerHTML = bnd.slice(0, 3).map(bndHtml).join('') || '<div class="muted">—</div>';
    document.getElementById('bnd-all').innerHTML = bnd.map(bndHtml).join('') || '<div class="muted">لا حدود مسجّلة.</div>';

    // A resolved build gets NO status chip. Identifying which commit runs is
    // not a judgement that the commit is good, and a green chip here would
    // say exactly that — the manufactured certainty this console exists to
    // refuse. Only the unresolved case carries a chip, because not knowing
    // IS a state worth flagging.
    var bld = o.build || {};
    document.getElementById('ops-build').innerHTML = bld.resolved
      ? '<span class="ev">' + esc(bld.shortCommit || '') + '</span>' +
        (bld.branch ? ' <span class="ev">' + esc(bld.branch) + '</span>' : '') +
        (bld.message ? '<div class="att-w" style="margin-top:6px;">' + esc(bld.message) + '</div>' : '') +
        '<div class="att-w" style="margin-top:6px;">أُقلعت العملية: ' + esc(ago(bld.bootedAt)) + '</div>'
      : chip('UNKNOWN') + ' <span class="att-w">لم تُحقن بصمة commit — لا يمكن إثبات ما هو منشور.</span>';

    document.getElementById('ops-sys').innerHTML = (o.subsystems || []).map(function (s) {
      return '<div class="card"><div class="h2" style="margin-bottom:6px;">' + esc(SYS[s.key] || s.key) + '</div>' +
        chip(s.status) + '<div class="att-w" style="margin-top:6px;">' + esc(s.summary) + '</div>' +
        (s.detail ? '<div class="ev" style="margin-top:6px;">' + esc(s.detail) + '</div>' : '') + '</div>';
    }).join('');

    document.getElementById('act-body').innerHTML = (o.activity || []).map(function (a) {
      return '<tr><td data-th="الوقت"><span class="muted">' + esc(ago(a.at)) + '</span></td>' +
        '<td data-th="مساحة">' + esc(a.workspaceName) + '</td>' +
        '<td data-th="الحدث">' + chip(a.status === 'COMPLETED' ? 'HEALTHY' : a.status === 'FAILED' ? 'ERROR' : 'RUNNING') +
        ' <span class="ev ev-inline">' + esc(a.status) + '</span></td>' +
        '<td data-th="التفصيل">' + (a.detail ? '<span class="ev">' + esc(a.detail) + '</span>' : '<span class="muted">—</span>') + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">لا نشاط مسجّل.</td></tr>';

    renderWs();
    renderIntel();
    var nc = document.querySelector('[data-view="attention"] .nav-item-hint');
    if (nc) nc.textContent = att.length ? att.length + ' بند' : 'لا شيء';
  }

  function wsFiltered() {
    if (!S.ops) return [];
    var q = (document.getElementById('ws-q').value || '').trim().toLowerCase();
    var f = document.getElementById('ws-f').value;
    return (S.ops.workspaces || []).filter(function (w) {
      if (f === 'problems' && (w.overall === 'HEALTHY' || w.overall === 'NOT_TESTED')) return false;
      if (f !== 'all' && f !== 'problems' && w.overall !== f) return false;
      if (!q) return true;
      return ((w.workspaceName || '') + ' ' + (w.ownerEmail || '')).toLowerCase().indexOf(q) !== -1;
    });
  }
  function renderWs() {
    var rows = wsFiltered();
    document.getElementById('ws-body').innerHTML = rows.map(function (w) {
      return '<tr data-ws="' + esc(w.workspaceId) + '">' +
        '<td data-th="مساحة"><b>' + esc(w.workspaceName) + '</b><div class="muted">' + esc(w.ownerEmail || '—') + '</div></td>' +
        '<td data-th="الاتصال">' + chip(w.connection) + '</td>' +
        '<td data-th="البيانات">' + chip(w.data) + '<div class="muted">' +
          (w.dataAgeDays == null ? 'لا بيانات' : w.dataAgeDays === 0 ? 'اليوم' : 'قبل ' + w.dataAgeDays + ' يوم') + '</div></td>' +
        '<td data-th="آخر مزامنة"><span class="muted">' + esc(ago(w.lastSyncedAt)) + '</span></td>' +
        '<td data-th="الأثر">' + esc(w.headline) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">لا مساحات مطابقة.</td></tr>';
  }

  // Detail: FACT and INTERPRETATION are visually separated, always.
  function openWs(id) {
    if (!S.ops) return;
    var w = (S.ops.workspaces || []).filter(function (x) { return x.workspaceId === id; })[0];
    var host = document.getElementById('ws-detail');
    if (!w || !host) return;
    show('workspaces');
    host.innerHTML = '<div class="card">' +
      '<div class="h2">' + esc(w.workspaceName) + ' <span class="muted">' + esc(w.ownerEmail || '') + '</span></div>' +
      '<div class="grid g2" style="margin-bottom:12px;">' +
        '<div><div class="muted">الاتصال</div>' + chip(w.connection) + '</div>' +
        '<div><div class="muted">البيانات</div>' + chip(w.data) + '</div>' +
      '</div>' +
      '<div class="h2" style="margin-bottom:6px;">قراءتنا</div>' +
      '<div class="att-w">' + esc(w.headline) + '</div>' +
      '<div class="h2" style="margin:12px 0 6px;">الوقائع المرصودة</div>' +
      '<table class="t"><tbody>' +
        row('حساب Meta', w.externalAccountId || '—', true) +
        row('رمز محفوظ', w.hasToken ? 'نعم' : 'لا', false) +
        row('مصدر الرمز', w.tokenSource || '—', true) +
        row('انتهاء الرمز', w.tokenExpiresAt || 'غير محدّد', true) +
        row('حالة حساب Meta', w.metaAccountStatus == null ? 'غير معروفة' : String(w.metaAccountStatus), true) +
        row('آخر مزامنة', ago(w.lastSyncedAt) + ' (' + (w.lastSyncStatus || '—') + ')', false) +
        row('أحدث يوم بيانات', w.freshestDataDate || 'لا يوجد', true) +
        (w.lastSyncError ? row('نص آخر خطأ', w.lastSyncError, true) : '') +
      '</tbody></table></div>';
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function row(k, v, mono) {
    return '<tr><td data-th="' + esc(k) + '" style="width:34%;"><span class="muted">' + esc(k) + '</span></td>' +
      '<td data-th="القيمة">' + (mono ? '<span class="ev">' + esc(v) + '</span>' : esc(v)) + '</td></tr>';
  }

  function renderCustomers() {
    document.getElementById('cu-body').innerHTML = (S.customers || []).map(function (u) {
      return '<tr><td data-th="الزبون"><b>' + esc(u.name) + '</b><div class="muted">' + esc(u.email) + '</div></td>' +
        '<td data-th="الحالة">' + chip(u.isActive ? 'HEALTHY' : 'NOT_TESTED') + '</td>' +
        '<td data-th="الخطة">' + (u.hasPremium ? 'Premium' : 'مجاني') + '</td>' +
        '<td data-th="مساحات">' + ((u.workspaces || []).length) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">لا زبائن.</td></tr>';
  }
  function renderRevenue() {
    var s = S.stats;
    var host = document.getElementById('rev-cards');
    if (!s) { host.innerHTML = '<div class="muted">جارٍ التحميل…</div>'; return; }
    var m = (s.money && s.money.byCurrency) || [];
    host.innerHTML = '<div class="card"><div class="h2">الأموال المُدارة</div>' +
      (m.length ? m.map(function (r) {
        return '<div style="margin-top:8px;"><b>' + esc(r.currency) + '</b> \\u00B7 ' + r.activeCampaigns +
          ' حملة \\u00B7 <b>' + r.totalDailyBudgetMajor + '</b> يومياً \\u00B7 <b>' + r.impliedMonthlyMajor + '</b> شهرياً</div>';
      }).join('') : '<div class="muted">لا حملات نشطة بميزانية.</div>') + '</div>' +
      '<div class="card"><div class="h2">التغطية السردية</div>' +
      '<div class="pulse-main">' + (s.brain && s.brain.narrationCoveragePct != null ? s.brain.narrationCoveragePct + '%' : 'لا لقطات') + '</div>' +
      '<div class="muted" style="margin-top:6px;">' + ((s.brain && s.brain.snapshotsLastNDays) || 0) + ' لقطة \\u00B7 ' +
      ((s.brain && s.brain.narrationsLastNDays) || 0) + ' مسرودة</div></div>';
  }


  // ── The epistemic ladder ─────────────────────────────────────────────
  // Four layers, each labelled with what it IS and what we currently know
  // about it. The state on each rung is derived ONLY from evidence we hold:
  // observation from the ops snapshot, calculation from narration coverage,
  // and the top two rungs stay NOT_TESTED because no live check exists —
  // which is the honest answer, not a gap to paper over.
  function renderIntel() {
    var host = document.getElementById('intel-ladder');
    if (!host) return;
    var o = S.ops, st = S.stats;
    var fresh = o ? (o.workspaces || []).filter(function (w) { return w.data === 'HEALTHY'; }).length : 0;
    var connected = o ? (o.workspaces || []).filter(function (w) { return w.adAccountId; }).length : 0;
    var cov = st && st.brain ? st.brain.narrationCoveragePct : null;
    var snaps = st && st.brain ? st.brain.snapshotsLastNDays : 0;

    var rungs = [
      { n: '\u0661 \u00B7 OBSERVED FACT', t: 'واقعة مرصودة',
        d: 'ما قالته Meta حرفياً، أو ما قرأناه من قاعدة بياناتنا. لا تفسير، لا حساب.',
        state: connected ? (fresh ? 'HEALTHY' : 'WARNING') : 'NOT_TESTED',
        ev: connected
          ? fresh + ' من ' + connected + ' حساب ببيانات طازجة (يوم أو أقل)'
          : 'لا حساب إعلاني مرتبط — لا وقائع تُرصَد',
        note: 'المصدر: daily_stats \u00B7 sync_jobs \u00B7 ad_accounts' },
      { n: '\u0662 \u00B7 DERIVED SIGNAL', t: 'إشارة مشتقّة',
        d: 'ما حسبناه نحن من الوقائع: CTR، التكرار، الاتجاهات. صحيحة حسابياً بقدر صحّة مدخلاتها فقط.',
        state: fresh ? 'HEALTHY' : connected ? 'DEGRADED' : 'NOT_TESTED',
        ev: fresh
          ? 'تُحسب من الحسابات الطازجة أعلاه'
          : 'بلا بيانات طازجة تحتها، أي إشارة مشتقّة تصف الماضي لا الحاضر',
        note: 'الاعتماد: كل ما في الطبقة \u0661' },
      { n: '\u0663 \u00B7 INTERPRETATION', t: 'تفسير',
        d: 'حكم النظام على الإشارات: «إرهاق إعلان»، «تشبّع جمهور». هنا يبدأ الاستدلال، وهنا يبدأ احتمال الخطأ.',
        state: 'NOT_TESTED',
        ev: snaps ? snaps + ' لقطة \u00B7 تغطية سردية ' + (cov == null ? '\u2014' : cov + '%')
                  : 'لا لقطات في نافذة الرصد',
        note: 'لا فحص حيّ لصحّة محرّك التفسير \u2014 التغطية السردية مؤشر جانبي، لا قياس' },
      { n: '\u0664 \u00B7 RECOMMENDATION', t: 'توصية',
        d: 'ما نطلب من التاجر فعله. لا تكون أقوى من التفسير تحتها، ولا التفسير أقوى من إشارته.',
        state: 'NOT_TESTED',
        ev: 'لم تُقَس دقّة التوصيات مقابل نتائج حقيقية',
        note: 'يُحسم بـ: تتبّع أثر التوصيات المطبَّقة \u2014 غير مبنيّ' }
    ];

    host.innerHTML = rungs.map(function (r) {
      return '<div class="rung">' +
        '<div class="rung-n">' + r.n + '</div>' +
        '<div class="rung-t">' + esc(r.t) + ' ' + chip(r.state) + '</div>' +
        '<div class="rung-d">' + esc(r.d) + '</div>' +
        '<div class="rung-ex">' +
          '<div class="rung-lbl">ما نعرفه الآن</div>' +
          '<div class="rung-d">' + esc(r.ev) + '</div>' +
          '<div class="muted" style="margin-top:5px;line-height:1.7;">' + esc(r.note) +
            (r.tech ? ' <span class="ev ev-inline">' + esc(r.tech) + '</span>' : '') + '</div>' +
        '</div></div>';
    }).join('');
  }

  // ── Probe: configure → review → run → results → evidence ─────────────
  var prLoaded = false, prRunning = false;
  var FIX = {
    TOKEN_DECRYPT_FAILED: 'مفتاح التشفير تغيّر \\u2014 أعد ربط حساب Meta. ليست انتهاء صلاحية: السببان مختلفان.',
    NO_AD_ACCOUNT: 'اربط حساباً إعلانياً بهذه المساحة أولاً.',
    NO_TOKEN: 'الحساب موجود بلا رمز محفوظ \\u2014 أعد الربط.',
    META_UNREACHABLE: 'قيد شبكة على الخادم، لا حكم على أي قدرة.',
    PROBE_FAILED: 'فشل غير مصنَّف \\u2014 راجع سجلّ الخادم (ابحث: capability-probe).'
  };
  function step(n) {
    for (var i = 1; i <= 5; i++) {
      var e = document.getElementById('s' + i);
      if (!e) continue;
      e.className = 'step' + (i === n ? ' on' : i < n ? ' done' : '');
    }
  }
  async function loadProbeWs() {
    if (prLoaded) return;
    var sel = document.getElementById('pr-ws');
    try {
      var d = await api('/api/admin/customers?status=all&take=200');
      var seen = {}, opts = [];
      (d.customers || []).forEach(function (u) {
        (u.workspaces || []).forEach(function (w) {
          var n = w.adAccountCount != null ? w.adAccountCount : (w.adAccounts || []).length;
          if (!w || !w.id || seen[w.id] || !n) return;
          seen[w.id] = true; opts.push(w);
        });
      });
      sel.innerHTML = opts.length
        ? '<option value="">اختر…</option>' + opts.map(function (o) {
            return '<option value="' + esc(o.id) + '">' + esc(o.name || o.id) + '</option>'; }).join('')
        : '<option value="">لا مساحة بحساب إعلاني مرتبط</option>';
      prLoaded = true;
    } catch (e) { sel.innerHTML = '<option value="">تعذّر التحميل</option>'; }
  }
  function review() {
    var sel = document.getElementById('pr-ws');
    var box = document.getElementById('pr-review');
    var body = document.getElementById('pr-review-body');
    var btn = document.getElementById('pr-run');
    if (!sel.value) { box.style.display = 'none'; step(1); return; }
    box.style.display = ''; step(2); btn.disabled = false;
    var w = S.ops ? (S.ops.workspaces || []).filter(function (x) { return x.workspaceId === sel.value; })[0] : null;
    body.innerHTML =
      '<div>سيُرسَل <b>حتى ٤٠ نداء قراءة</b> إلى Meta على حساب هذه المساحة، وتُحتسب على حصتها.</div>' +
      '<div>كل النداءات GET \\u2014 لا كتابة في Meta ولا في قاعدة بياناتنا.</div>' +
      (w ? '<div style="margin-top:8px;">الحساب: <span class="ev ev-inline">' + esc(w.externalAccountId || '\\u2014') +
           '</span> \\u00B7 الاتصال: ' + chip(w.connection) +
           (w.connection === 'BLOCKED' ? '<div style="color:var(--error);font-weight:700;margin-top:4px;">' +
             'الاتصال محجوب \\u2014 التشغيل سيفشل على الأرجح: ' + esc(w.headline) + '</div>' : '') + '</div>'
         : '<div class="muted" style="margin-top:8px;">حالة الاتصال غير معروفة بعد.</div>') +
      '<div class="muted" style="margin-top:8px;">حارس النقر يمنع تشغيلين من <b>هذه الصفحة</b> فقط. ' +
      'لا قفل على مستوى الحساب \\u2014 تبويب أو مسؤول آخر يستطيع بدء تشغيل موازٍ.</div>';
  }
  function tally(results) {
    var t = {};
    (results || []).forEach(function (r) {
      var k = r.verdict;
      // AVAILABLE and POPULATED are different observations. Counting them
      // as one silently upgrades "we asked and got nothing" into a signal.
      if (k === 'AVAILABLE') k = (r.evidence && r.evidence.present) ? 'AVAILABLE + عاد الحقل' : 'AVAILABLE بلا حقل';
      t[k] = (t[k] || 0) + 1;
    });
    var keys = Object.keys(t).sort(function (a, b) { return t[b] - t[a]; });
    document.getElementById('pr-tally').innerHTML = keys.map(function (k) {
      return '<span>' + esc(k) + ' <b>' + t[k] + '</b></span>'; }).join('');
    return t;
  }
  function interpret(t, ctx) {
    var withField = t['AVAILABLE + عاد الحقل'] || 0;
    var empty = t['AVAILABLE بلا حقل'] || 0;
    var perm = t['PERMISSION_REQUIRED'] || 0;
    var nt = t['NOT_TESTED'] || 0;
    document.getElementById('pr-interp').innerHTML =
      '<div class="h2">ماذا يعني هذا \\u2014 وماذا لا يعني</div>' +
      '<div class="att-w">' +
        '<div><b>' + withField + '</b> قدرة قُبل طلبها وعاد حقلها.</div>' +
        (empty ? '<div><b>' + empty + '</b> قُبل طلبها ولم يعد الحقل \\u2014 <b>ليست قدرة مُثبَتة</b>.</div>' : '') +
        (perm ? '<div><b>' + perm + '</b> تحتاج صلاحية \\u2014 فجوة قابلة للإصلاح، لا قدرة غائبة.</div>' : '') +
        (nt ? '<div><b>' + nt + '</b> لم تُختبَر \\u2014 لم نسأل، وليس حكماً من Meta.</div>' : '') +
      '</div>' +
      '<div class="bnd" style="margin-top:10px;">' +
        '<div class="bnd-w">حتى «عاد الحقل» لا يعني أن الإشارة مفيدة. التسلسل الذي لم يُقطع بعد:</div>' +
        '<div class="ev" style="margin-top:6px;">AVAILABLE \\u2260 POPULATED \\u2260 VARIABLE \\u2260 DISCRIMINATIVE \\u2260 DECISION-USEFUL</div>' +
        '<div class="bnd-r">يُحسم بـ: <b>تجارب لاحقة على نوافذ زمنية وكيانات متعددة</b></div>' +
      '</div>' +
      '<div class="muted" style="margin-top:8px;">' + esc((ctx && ctx.calls) || '؟') + ' نداء من ' +
        esc((ctx && ctx.budget) || '؟') + ' \\u00B7 الحساب ' + esc((ctx && ctx.account) || '؟') + '</div>';
  }
  async function runProbe() {
    if (prRunning) return;
    var sel = document.getElementById('pr-ws'), btn = document.getElementById('pr-run');
    var st = document.getElementById('pr-status');
    if (!sel.value) return;
    prRunning = true; btn.disabled = true; btn.textContent = 'جارٍ التشغيل…';
    st.textContent = 'يسأل Meta \\u2014 قد يستغرق دقيقة.'; step(3);
    try {
      var o = await api('/api/admin/capability-probe', { method: 'POST', body: { workspaceId: sel.value } });
      document.getElementById('pr-matrix').textContent = o.matrix || '';
      document.getElementById('pr-report').textContent = o.report || '';
      document.getElementById('pr-out').style.display = '';
      interpret(tally(o.results), o.context);
      st.textContent = 'اكتمل.'; step(5);
    } catch (e) {
      st.textContent = '';
      document.getElementById('pr-out').style.display = '';
      document.getElementById('pr-tally').innerHTML = '';
      document.getElementById('pr-interp').innerHTML =
        '<div class="h2" style="color:var(--error);">فشل التشغيل</div>' +
        '<div class="att-w">' + esc(e.message || 'فشل') + '</div>' +
        (e.code && FIX[e.code] ? '<div class="att-a">ما العمل: ' + esc(FIX[e.code]) + '</div>' : '') +
        '<div class="bnd" style="margin-top:10px;"><div class="bnd-w">' +
          'لم تُسجَّل أي نتيجة قدرة. هذا فشل <b>تشغيل</b>، وليس حكماً على أي قدرة في Meta.' +
        '</div></div>' +
        '<div class="ev" style="margin-top:8px;">code: ' + esc(e.code || '\\u2014') +
          ' \\u00B7 http: ' + esc(e.status || '\\u2014') +
          (e.detail ? '\\u00B7 detail: ' + esc(e.detail) : '') + '</div>';
      document.getElementById('pr-matrix').textContent = '';
      document.getElementById('pr-report').textContent = '';
      step(4);
    } finally {
      prRunning = false; btn.disabled = false; btn.textContent = '٣ · شغّل المرقاب';
    }
  }

  // ── What this surface puts in the palette ────────────────────────────
  //
  // The page used to ship its own palette, writing #cmd, #cmd-in and #cmd-list
  // — the SHELL's element ids — so two components fought over the same three
  // nodes and both bound Ctrl+K. Removing the duplicate was right; removing
  // what it could DO would not have been. Its one capability the shell's
  // static command list cannot express is finding a workspace by name and
  // opening its evidence, because the workspaces are not known until the ops
  // snapshot loads. So the page contributes them live instead.
  window.adminCommandSource = function () {
    var out = Object.keys(TITLES).map(function (k) {
      return { label: TITLES[k][0], hint: TITLES[k][1] || 'انتقال',
        run: function () { show(k); } };
    });
    if (S.ops) (S.ops.workspaces || []).forEach(function (w) {
      out.push({ label: w.workspaceName, hint: 'مساحة عمل \u00B7 ' + w.headline,
        run: function () { openWs(w.workspaceId); } });
    });
    return out;
  };

  // ── Wiring ───────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var t = e.target;
    var nav = t.closest ? t.closest('.nav-item[data-view]') : null;
    if (nav) { e.preventDefault(); show(nav.getAttribute('data-view')); return; }
    var tr = t.closest ? t.closest('tr[data-ws]') : null;
    if (tr) { openWs(tr.getAttribute('data-ws')); return; }
    var cp = t.getAttribute && t.getAttribute('data-copy');
    if (cp) {
      var el = document.getElementById(cp);
      if (el && navigator.clipboard) navigator.clipboard.writeText(el.textContent || '');
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'pr-ws') review();
    if (e.target.id === 'ws-f') renderWs();
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'ws-q') renderWs(); });
  document.getElementById('pr-run').addEventListener('click', runProbe);
  // Logout is the shell's control; logout() below stays because the shared
  // session guard's contract still requires this page to own the admin exit.

  async function boot() {
    // One shared guard. A network failure yields UNRESOLVED and holds the
    // gate — it must never be read as "this admin became a customer", which
    // is the demotion that produced the /admin ↔ /dashboard bounce loop.
    await window.AdlyticSession.requireAdminSurface(onAdminReady, function (kind, reason) {
      var host = document.getElementById('now-att');
      if (host) host.innerHTML =
        '<div class="att att-ERROR"><div class="att-t">تعذّر التحقق من الهوية</div>'
        + '<div class="att-w">لم يتغيّر حسابك — هذه مشكلة اتصال. '
        + '<a href="javascript:location.reload()" style="color:var(--accent);">أعد المحاولة</a></div>'
        + '<div class="ev" style="margin-top:6px;">' + esc(String(reason || kind)) + '</div></div>';
    });
  }

  function onAdminReady(me) {
    // #gate, #os and #who were the old page's own chrome; the Control Plane
    // shell renders identity and needs no reveal, so there is nothing to paint
    // here any more. The guard itself is unchanged.
    try { sessionStorage.removeItem('adm_sync'); } catch (e) {}
    show((location.hash || '').replace('#', '') || 'now');

    api('/api/admin/ops').then(renderOps, function (e) {
      document.getElementById('now-att').innerHTML =
        '<div class="att att-ERROR"><div class="att-t">تعذّر تحميل لقطة التشغيل</div>' +
        '<div class="att-w">' + esc(e.message || '') + '</div>' +
        '<div class="ev" style="margin-top:6px;">code: ' + esc(e.code || '\\u2014') + '</div></div>';
    });
    api('/api/admin/customers?take=100').then(function (d) { S.customers = d.customers || []; renderCustomers(); }, function () {});
    api('/api/admin/platform-stats').then(function (d) { S.stats = d; renderIntel(); if (S.view === 'revenue') renderRevenue(); }, function () {});
  }
  boot();
})();
`;

export function adminOsPage(): string {
  return adminShell({
    active: 'console',
    title: 'نظام التشغيل الإداري',
    subtitle: 'العرض الأصلي — السلّم المعرفي والتجارب',
    css: CSS,
    header: HEADER,
    body: BODY,
    script: SCRIPT,
    views: [
      { id: 'now',          label: 'الآن',            hint: 'ما الذي يحدث في المنصة' },
      { id: 'attention',    label: 'الانتباه',         hint: 'ما يحتاج تدخلاً' },
      { id: 'activity',     label: 'النشاط',           hint: 'ما تغيّر مؤخراً' },
      { id: 'workspaces',   label: 'مساحات العمل',     hint: 'من المتأثر ولماذا' },
      { id: 'operations',   label: 'العمليات',         hint: 'حالة البنية التحتية' },
      { id: 'boundary',     label: 'حدود المعرفة',     hint: 'ما لا نستطيع تحديده' },
      { id: 'intelligence', label: 'الذكاء',           hint: 'أين تنتهي الملاحظة ويبدأ الاستدلال' },
      { id: 'experiments',  label: 'التجارب',          hint: 'مرقاب قدرات Meta' },
      { id: 'customers',    label: 'الزبائن' },
      { id: 'revenue',      label: 'الإيرادات' },
      { id: 'platform',     label: 'إعدادات المنصة' },
    ],
    commands: [
      { label: 'الحالة الآن', href: '/admin', hint: 'مركز التحكّم' },
      { label: 'السلّم المعرفي', href: '/admin/intelligence#ladder', hint: 'الذكاء' },
    ],
  });
}
