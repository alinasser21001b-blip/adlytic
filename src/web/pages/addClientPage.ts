// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/addClientPage.ts
//
//  ADD CLIENT — /admin/add-client. The guided onboarding wizard.
//
//  ── Why it now renders inside the Control Plane shell ─────────────────
//
//  Like the Brain Observatory, this is a SIDEBAR DESTINATION that used to
//  draw its own sidebar, logo, topbar and logout control. The navigation
//  transition audit caught it: clicking "إضافة عميل" from the Control Center
//  lost the shell, emptied the context bar and left no nav item active — the
//  operator walked into a different-looking application without being told.
//
//  The wizard itself — discovery, onboarding records, the audit timeline, the
//  "check now" nudge — is unchanged. Only the duplicated chrome is gone, and
//  the access gate with it: the shell and the server-side adminPage gate
//  already own that, and a second client-side gate was never a boundary.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `/* The page was authored against --font; the system calls it
       --font-body. One alias beats 40 edits. */
    :root { --font: var(--font-body); }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: none; background: none; }
@keyframes gate-spin { to { transform: rotate(360deg); }
}
.nav-item.active { background: var(--accent-dim); color: var(--accent-2); }
.btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 14px; border-radius: 9px; font-weight: 700; font-size: 13px;
      border: 1px solid transparent; transition: 0.15s;
    }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { filter: brightness(1.05); }
.btn-secondary { background: var(--surface-2); border-color: var(--border-control); color: var(--text); }
.btn-secondary:hover { border-color: var(--accent); }
.btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 7px; }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.panel {
      border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
      margin-bottom: 16px; overflow: hidden;
    }
.panel-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap;
    }
.panel-title { font-size: 15px; font-weight: 800; }
.panel-sub { font-size: 12px; color: var(--text-3); margin-top: 2px; }
.panel-body { padding: 16px; }
.intro {
      color: var(--text-2); font-size: 13.5px; line-height: 1.85; margin-bottom: 18px;
      border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
      background: linear-gradient(145deg, var(--accent-dim), var(--surface));
    }
@media (max-width: 768px) { .sidebar { display: none; }
}
.field {
      background: var(--surface-2); border: 1px solid var(--border-control); border-radius: 9px;
      padding: 9px 12px; color: var(--text); min-width: 0;
    }
.field:focus { outline: none; border-color: var(--accent); }
select.field { cursor: pointer; }
.form-grid { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 10px; align-items: end; }
@media (max-width: 900px) { .form-grid { grid-template-columns: 1fr; }
}
.form-label { display: block; font-size: 11.5px; font-weight: 700; color: var(--text-3); margin-bottom: 6px; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
/* ── State pill ─────────────────────────────────────────────────────── */
    .state-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.state-pill {
      display: inline-flex; align-items: center; gap: 9px; padding: 9px 18px; border-radius: 999px;
      font-size: 14px; font-weight: 800; border: 1px solid transparent;
    }
.state-pill .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.state-pill.live .dot { animation: pulse-dot 1.5s ease-in-out infinite; }
.state-accent { background: var(--accent-dim); color: var(--accent-2); border-color: var(--accent); }
.state-success { background: var(--success-dim); color: var(--success); border-color: var(--success); }
.state-warn { background: var(--warning-dim); color: var(--warning); border-color: var(--warning); }
.state-error { background: var(--error-dim); color: var(--error); border-color: var(--error); }
@keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1); }
50% { opacity: 0.35; transform: scale(0.8); }
}
/* ── Live plan ──────────────────────────────────────────────────────── */
    .plan { list-style: none; }
.plan-step { display: flex; gap: 12px; align-items: flex-start; padding: 13px 2px; }
.plan-step + .plan-step { border-top: 1px solid var(--border); }
.plan-dot {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12.5px;
      background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border);
    }
.plan-label { font-weight: 700; font-size: 14px; color: var(--text-2); line-height: 1.6; }
.plan-meta { font-size: 11.5px; color: var(--text-3); margin-top: 3px; }
.plan-step.done .plan-dot { background: var(--success-dim); color: var(--success); border-color: var(--success); }
.plan-step.done .plan-label { color: var(--text); }
.plan-step.active .plan-dot {
      background: var(--accent-dim); color: var(--accent-2); border-color: var(--accent);
      animation: pulse-step 1.7s ease-in-out infinite;
    }
.plan-step.active .plan-label { color: var(--accent-2); font-weight: 800; }
.plan-step.pending .plan-label { color: var(--text-3); }
@keyframes pulse-step {
      0%, 100% { box-shadow: 0 0 0 0 var(--accent-glow); }
50% { box-shadow: 0 0 0 7px transparent; }
}
@media (prefers-reduced-motion: reduce) {
      .plan-step.active .plan-dot, .state-pill.live .dot { animation: none; }
.plan-step.active .plan-dot { box-shadow: 0 0 0 3px var(--accent-glow); }
}
/* ── Requirement / error / waiting cards ────────────────────────────── */
    .callout { border-radius: 12px; padding: 16px 18px; margin-bottom: 16px; border: 1px solid transparent; }
.callout-title { font-weight: 800; font-size: 14.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.callout-text { line-height: 1.95; font-size: 13.5px; color: var(--text); }
.callout-warn { border-color: var(--warning); background: var(--warning-dim); }
.callout-warn .callout-title { color: var(--warning); }
.callout-err { border-color: var(--error); background: var(--error-dim); }
.callout-err .callout-title { color: var(--error); }
.callout-info { border-color: var(--accent); background: var(--accent-dim); }
.callout-info .callout-title { color: var(--accent-2); }
.callout-ok { border-color: var(--success); background: var(--success-dim); }
.callout-ok .callout-title { color: var(--success); }
.callout-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
/* ── Timeline ───────────────────────────────────────────────────────── */
    .tl { display: flex; flex-direction: column; }
.tl-item {
      display: grid; grid-template-columns: 138px 108px 1fr; gap: 10px;
      padding: 10px 2px; border-bottom: 1px solid var(--border); align-items: start; font-size: 12.5px;
    }
.tl-item:last-child { border-bottom: none; }
.tl-time { color: var(--text-3); font-size: 11.5px; direction: ltr; text-align: right; unicode-bidi: embed; }
.tl-msg { color: var(--text-2); line-height: 1.75; }
.tl-states { color: var(--text-3); font-size: 11px; margin-top: 3px; direction: ltr; text-align: right; unicode-bidi: embed; }
@media (max-width: 768px) { .tl-item { grid-template-columns: 1fr; gap: 4px; }
.tl-time { text-align: right; }
}
/* ── Onboarding list rows ───────────────────────────────────────────── */
    .ob-row {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 14px; border: 1px solid var(--border); border-radius: 11px;
      background: var(--surface-2); margin-bottom: 8px; text-align: right; transition: 0.15s; flex-wrap: wrap;
    }
.ob-row:hover { border-color: var(--accent); }
.ob-row.selected { border-color: var(--accent); background: var(--accent-dim); }
.ob-row:last-child { margin-bottom: 0; }
table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
table.data th {
      text-align: right; padding: 10px 12px; font-size: 11px; color: var(--text-3);
      border-bottom: 1px solid var(--border); font-weight: 700;
    }
table.data td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
table.data tr:hover td { background: var(--surface-hover); }
.table-wrap { overflow-x: auto; }
td.currency-cell { font-weight: 800; color: var(--accent-2); white-space: nowrap; }
.badge {
      display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 700; border: 1px solid transparent; white-space: nowrap;
    }
.badge-ok { background: var(--success-dim); color: var(--success); border-color: var(--success); }
.badge-warn { background: var(--warning-dim); color: var(--warning); border-color: var(--warning); }
.badge-err { background: var(--error-dim); color: var(--error); border-color: var(--error); }
.badge-muted { background: var(--surface-2); color: var(--text-3); border-color: var(--border); }
.badge-gold { background: var(--accent-dim); color: var(--accent-2); border-color: var(--accent); }
.muted { color: var(--text-3); font-size: 12px; }
.mono { font-family: monospace; direction: ltr; text-align: left; unicode-bidi: embed; }
.error-box {
      padding: 14px 16px; border-radius: 10px; border: 1px solid var(--error);
      background: var(--error-dim); color: var(--error); margin-bottom: 14px;
    }
.info-box {
      padding: 14px 16px; border-radius: 10px; border: 1px solid var(--warning);
      background: var(--warning-dim); color: var(--warning); margin-bottom: 14px; line-height: 1.8;
    }
.empty { text-align: center; padding: 28px 12px; color: var(--text-3); }
/* ══════════════════════════════════════════════════════════════════════
       MOBILE FLOW — five steps, one screen each.
       ══════════════════════════════════════════════════════════════════════
       A phone gets a different SHAPE of the same job, not a squeezed cockpit:
       one question per screen, one action per screen, and never a word about
       the machinery behind it.

       Scoped entirely to this file. This page renders its own document and
       does not consume src/web/layout.ts, so nothing below can reach the
       shared MOBILE SYSTEM block — that stays the integrator's to own.
       ══════════════════════════════════════════════════════════════════════ */
    .mflow { display: none; }
@media (max-width: 768px) {
      /* .app carries an inline display:flex once the admin gate clears, so the
         phone shell has to out-specify it. */
      body.mf-on .app { display: none !important; }
body.mf-on .mflow { display: flex; }
}
.mflow {
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;   /* excludes the browser chrome that vh ignores */
      width: 100%; max-width: 100%; overflow-x: hidden;
    }
.mf-top {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 18px; padding-top: calc(14px + env(safe-area-inset-top));
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
.mf-brand { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; }
.mf-brand span { color: var(--accent); }
.mf-dots { display: flex; gap: 6px; flex-shrink: 0; }
.mf-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border); }
.mf-dot.done { background: var(--success); }
.mf-dot.on   { background: var(--accent); transform: scale(1.35); }
.mf-dot.stop { background: var(--error); transform: scale(1.35); }
/* flex:1 0 auto pins the footer to the bottom on a short screen and lets a
       long one grow past it, so the action is always the last thing reached. */
    .mf-body { flex: 1 0 auto; padding: 28px 18px 22px; min-width: 0; }
.mf-icon { font-size: 38px; line-height: 1; margin-bottom: 16px; }
.mf-h { font-size: 22px; font-weight: 800; line-height: 1.55; margin-bottom: 10px; }
.mf-p { font-size: 15px; line-height: 1.95; color: var(--text-2); overflow-wrap: anywhere; }
.mf-note { font-size: 13px; line-height: 1.85; color: var(--text-3); margin-top: 14px; }
.mf-form { margin-top: 24px; }
.mf-label { display: block; font-size: 14px; font-weight: 700; margin-bottom: 8px; }
.mf-chip {
      display: inline-block; margin-top: 18px; padding: 9px 13px; border-radius: 10px;
      background: var(--surface-2); border: 1px solid var(--border);
      font-family: monospace; font-size: 14px; direction: ltr; unicode-bidi: embed;
    }
.mf-input, .mf-select {
      width: 100%; min-height: 52px;   /* ≥44px touch floor */
      font-size: 16px;                 /* 16px: anything smaller makes iOS Safari zoom on focus */
      padding: 12px 14px; border-radius: 12px;
      background: var(--surface-2); border: 1px solid var(--border-control); color: var(--text);
    }
.mf-input { direction: ltr; text-align: left; font-family: monospace; letter-spacing: 0.04em; }
.mf-input:focus, .mf-select:focus { outline: none; border-color: var(--accent); }
.mf-select { margin-bottom: 20px; }
.mf-err {
      margin-top: 16px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.8;
      border: 1px solid var(--error); background: var(--error-dim); color: var(--error);
    }
.mf-spin {
      width: 34px; height: 34px; border: 3px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: gate-spin 0.8s linear infinite; margin-bottom: 18px;
    }
/* Sticky, not fixed: it keeps its place in the flow (so it can never sit on
       top of the content) while staying reachable on a long screen. The bottom
       offset is the height the on-screen keyboard covers — see mfKeyboardInset. */
    .mf-foot {
      position: sticky; bottom: var(--mf-kb, 0px); flex-shrink: 0;
      background: var(--bg); border-top: 1px solid var(--border);
      padding: 14px 18px; padding-bottom: calc(14px + env(safe-area-inset-bottom));
      display: flex; flex-direction: column; gap: 10px;
    }
.mf-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; min-height: 52px; border-radius: 13px;
      font-size: 16px; font-weight: 800; border: 1px solid transparent; text-align: center;
    }
.mf-btn-primary { background: var(--accent); color: #fff; }
.mf-btn-quiet { background: transparent; border-color: var(--border); color: var(--text-2); }
.mf-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.mf-ok { color: var(--success); }
.mf-warn { color: var(--warning); }
.mf-bad { color: var(--error); }
@media (prefers-reduced-motion: reduce) { .mf-spin { animation: none; }
}`;

const HEADER = `
  <div class="phead">
    <div>
      <div class="phead-t">إضافة عميل</div>
      <div class="phead-s">منسّق الربط يقود العملية كاملة: طلب الوصول لحساب العميل الإعلاني،
        مراقبة موافقته في مدير الأعمال، ثم أول مزامنة.</div>
    </div>
    <div class="phead-actions">
      <button class="btn" id="btn-refresh">تحديث</button>
    </div>
  </div>
`;

const BODY = `
      <div id="gate-error" class="error-box" style="display:none;"></div>

      <div class="intro">
        يقود <strong>منسّق الربط</strong> عملية إضافة العميل بالكامل: يطلب الوصول لحساب العميل الإعلاني، يراقب موافقة العميل في مدير الأعمال،
        يُسند الحساب لمستخدم النظام ويربطه بالمنصة، ثم يشغّل أول مزامنة — دون تدخّل يدوي. اختر مساحة عمل العميل وألصق معرّف حسابه الإعلاني، وتابع التقدّم مباشرةً أدناه.
      </div>

      <!-- 1 ── Start a connection ─────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">ابدأ ربط عميل</div>
            <div class="panel-sub">اختر مساحة العمل وأدخل معرّف الحساب الإعلاني</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div>
              <label class="form-label" for="ws-select">مساحة عمل العميل</label>
              <select class="field" id="ws-select" style="width:100%;">
                <option value="">جارٍ تحميل مساحات العمل…</option>
              </select>
              <input class="field mono" id="ws-input" placeholder="معرّف مساحة العمل" style="width:100%;display:none;" />
            </div>
            <div>
              <label class="form-label" for="acct-input">معرّف الحساب الإعلاني</label>
              <input class="field mono" id="acct-input" placeholder="act_1234567890 أو 1234567890" style="width:100%;" />
            </div>
            <div>
              <button class="btn btn-primary" id="btn-start" style="width:100%;">ابدأ الربط</button>
            </div>
          </div>
          <div class="muted" style="margin-top:10px;line-height:1.8;">
            يمكن لصق الأرقام فقط — تُضاف البادئة <span class="mono">act_</span> تلقائياً. إعادة البدء لنفس الحساب تفتح الطلب القائم بدل إنشاء طلب مكرّر.
          </div>
          <div id="start-error" class="error-box" style="display:none;margin-top:12px;margin-bottom:0;"></div>
        </div>
      </section>

      <!-- 2 ── Live progress ──────────────────────────────────────────── -->
      <section class="panel" id="progress-panel" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">تقدّم الربط المباشر</div>
            <div class="panel-sub" id="progress-sub">—</div>
          </div>
          <div class="toolbar">
            <button class="btn btn-primary btn-sm" id="btn-check-now">تحقق الآن</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="state-row" id="state-row"></div>
          <div id="callouts"></div>
          <ol class="plan" id="plan-list"></ol>
        </div>
      </section>

      <!-- 6 ── Timeline ───────────────────────────────────────────────── -->
      <section class="panel" id="timeline-panel" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">سجل الأحداث</div>
            <div class="panel-sub">كل ما فعله المنسّق — الأحدث أولاً</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="tl" id="timeline"></div>
        </div>
      </section>

      <!-- 8 ── Existing onboardings ───────────────────────────────────── -->
      <section class="panel" id="list-panel" style="display:none;">
        <div class="panel-head">
          <div>
            <div class="panel-title">طلبات الربط لهذه المساحة</div>
            <div class="panel-sub">اضغط على أي طلب لمتابعته</div>
          </div>
        </div>
        <div class="panel-body" id="ob-list"></div>
      </section>

      <!-- Secondary ── Currently visible accounts ─────────────────────── -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">الحسابات المرئية حالياً</div>
            <div class="panel-sub" id="discover-sub">الحسابات الظاهرة لتوكن مستخدم النظام</div>
          </div>
        </div>
        <div class="panel-body" style="padding:0;">
          <div id="discover-status" class="panel-body" style="display:none;"></div>
          <div class="table-wrap">
            <table class="data" id="accounts-table" style="display:none;">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المعرّف</th>
                  <th>العملة</th>
                  <th>الحالة</th>
                  <th>مرتبط؟</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="accounts-tbody"></tbody>
            </table>
          </div>
          <div id="accounts-empty" class="empty" style="display:none;">لا حسابات مرئية بعد — تأكد من موافقة العميل وتعيين الحساب لمستخدم النظام.</div>
        </div>
      </section>
    `;

const SCRIPT = `
(function () {
  var POLL_MS = 10000;
  var MAX_POLL_FAILURES = 3;
  var BM_URL = 'https://business.facebook.com/settings/ad-accounts';

  function token() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  function logout() {
    try { localStorage.removeItem('adlytic_token'); } catch (e) {}
    window.location.href = '/login';
  }
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Local view state ────────────────────────────────────────────────────
  var view = {
    workspaces: [],
    workspaceMode: 'select',   // 'select' | 'input' (fallback when none listed)
    workspaceId: '',
    onboarding: null,
    timeline: [],
    pollTimer: null,
    pollToken: 0,              // invalidates in-flight polls after a switch
    pollFailures: 0,
    records: [],               // last onboarding list for the selected workspace
  };

  // ── Vocabulary (mirrors src/orchestrator/contracts.ts) ──────────────────
  var STATE_META = {
    REQUEST_CREATED:         { label: 'تم إنشاء الطلب',        cls: 'state-accent'  },
    WAITING_EXTERNAL_ACTION: { label: 'بانتظار إجراء العميل',  cls: 'state-warn'    },
    CONNECTING:              { label: 'جارٍ الربط',            cls: 'state-accent'  },
    VERIFYING:               { label: 'جارٍ التحقق',           cls: 'state-accent'  },
    SYNCING:                 { label: 'جارٍ المزامنة',         cls: 'state-accent'  },
    READY:                   { label: 'جاهز',                  cls: 'state-success' },
    BLOCKED:                 { label: 'متوقّف — إجراء مطلوب',  cls: 'state-error'   },
    FAILED:                  { label: 'فشل',                   cls: 'state-error'   },
  };
  var TERMINAL = { READY: true, FAILED: true };

  var EVENT_KIND_META = {
    STATE_CHANGE:      { label: 'تغيير حالة',   cls: 'badge-gold'  },
    STEP_EXECUTED:     { label: 'تنفيذ خطوة',   cls: 'badge-gold'  },
    STEP_VERIFIED:     { label: 'تحقّق',        cls: 'badge-ok'    },
    RECONCILED:        { label: 'مطابقة',       cls: 'badge-muted' },
    CAPABILITY_CHANGE: { label: 'تغيّر القدرات', cls: 'badge-muted' },
    ERROR:             { label: 'خطأ',          cls: 'badge-err'   },
    NOTE:              { label: 'ملاحظة',       cls: 'badge-muted' },
  };

  function stateMeta(s) {
    return STATE_META[s] || { label: String(s == null ? '—' : s), cls: 'state-accent' };
  }
  function stateBadgeClass(s) {
    if (s === 'READY') return 'badge-ok';
    if (s === 'BLOCKED' || s === 'FAILED') return 'badge-err';
    if (s === 'WAITING_EXTERNAL_ACTION') return 'badge-warn';
    return 'badge-gold';
  }

  // Currency code → Arabic label. Falls back to the raw code when unknown.
  var CURRENCY_AR = {
    IQD: 'دينار عراقي',
    USD: 'دولار أمريكي',
    EUR: 'يورو',
    AED: 'درهم إماراتي',
    SAR: 'ريال سعودي',
  };
  function currencyLabel(code) {
    if (!code) return '—';
    var c = String(code).toUpperCase();
    var name = CURRENCY_AR[c];
    return name ? (name + ' (' + c + ')') : c;
  }

  // Meta ad-account status codes → Arabic badge.
  function accountStatusBadge(status) {
    var map = {
      1: ['نشط', 'badge-ok'],
      2: ['معطّل', 'badge-err'],
      3: ['غير مسوّى', 'badge-warn'],
      7: ['قيد مراجعة المخاطر', 'badge-warn'],
      8: ['بانتظار التسوية', 'badge-warn'],
      9: ['فترة سماح', 'badge-warn'],
      100: ['بانتظار الإغلاق', 'badge-warn'],
      101: ['مغلق', 'badge-err'],
    };
    var entry = map[status] || ['حالة ' + status, 'badge-muted'];
    return '<span class="badge ' + entry[1] + '">' + escHtml(entry[0]) + '</span>';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  /** Human "in N minutes" / "N minutes ago" in Arabic, Latin digits. */
  function fmtRelative(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = d.getTime() - Date.now();
    var future = diff >= 0;
    var mins = Math.round(Math.abs(diff) / 60000);
    var text;
    if (mins < 1) text = 'أقل من دقيقة';
    else if (mins < 60) text = mins + ' دقيقة';
    else if (mins < 1440) text = Math.round(mins / 60) + ' ساعة';
    else text = Math.round(mins / 1440) + ' يوم';
    return future ? ('خلال ' + text) : ('قبل ' + text);
  }

  async function api(path, opts) {
    opts = opts || {};
    var res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token() || ''),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error(data.error || res.statusText || 'Request failed');
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showGateError(msg) {
    var gate = document.getElementById('gate-error');
    gate.style.display = '';
    gate.textContent = msg;
  }
  function isAuthError(e) { return !!e && (e.status === 401 || e.status === 403); }

  // ════════════════════════════════════════════════════════════════════════
  //  Workspace picker — reuses GET /api/admin/customers (owner console list)
  // ════════════════════════════════════════════════════════════════════════
  async function loadWorkspaces() {
    var sel = document.getElementById('ws-select');
    var inp = document.getElementById('ws-input');
    try {
      var res = await api('/api/admin/customers?take=200&status=all&tier=all');
      var seen = {};
      var rows = [];
      (res.customers || []).forEach(function (cust) {
        (cust.workspaces || []).forEach(function (ws) {
          if (!ws || !ws.id || seen[ws.id]) return;
          seen[ws.id] = true;
          rows.push({ id: ws.id, name: ws.name || '—', email: cust.email || '' });
        });
      });
      view.workspaces = rows;
      if (!rows.length) {
        // No workspaces to pick from — degrade to a raw id input rather than
        // blocking the operator entirely.
        view.workspaceMode = 'input';
        sel.style.display = 'none';
        inp.style.display = '';
        return;
      }
      sel.innerHTML = '<option value="">— اختر مساحة عمل —</option>' + rows.map(function (w) {
        var label = w.name + (w.email ? ' — ' + w.email : '');
        return '<option value="' + escHtml(w.id) + '">' + escHtml(label) + '</option>';
      }).join('');
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      view.workspaceMode = 'input';
      sel.style.display = 'none';
      inp.style.display = '';
      showStartError('تعذّر تحميل مساحات العمل — أدخل معرّف مساحة العمل يدوياً. (' + (e.message || '') + ')');
    }
  }

  function currentWorkspaceId() {
    if (view.workspaceMode === 'input') {
      return (document.getElementById('ws-input').value || '').trim();
    }
    return document.getElementById('ws-select').value || '';
  }

  function showStartError(msg) {
    var box = document.getElementById('start-error');
    box.style.display = '';
    box.textContent = msg;
  }
  function clearStartError() {
    var box = document.getElementById('start-error');
    box.style.display = 'none';
    box.textContent = '';
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Rendering the active onboarding
  // ════════════════════════════════════════════════════════════════════════

  /** Plan cursor: index of the step currently being worked. */
  function cursorIndex(plan, ob) {
    if (!plan.length) return 0;
    // A null cursor means either "not started yet" (step 0) or "all done".
    if (!ob.currentStepId) return ob.state === 'READY' ? plan.length : 0;
    var idx = -1;
    for (var i = 0; i < plan.length; i++) { if (plan[i] && plan[i].id === ob.currentStepId) { idx = i; break; } }
    return idx === -1 ? 0 : idx;
  }

  function renderStatePill(ob) {
    var meta = stateMeta(ob.state);
    var live = !TERMINAL[ob.state] ? ' live' : '';
    var parts = [];
    parts.push('<span class="state-pill ' + meta.cls + live + '"><span class="dot"></span>' + escHtml(meta.label) + '</span>');
    parts.push('<span class="muted mono">' + escHtml(ob.externalAccountId || '') + '</span>');
    if (ob.linkedAdAccountId) {
      parts.push('<span class="badge badge-ok">مرتبط بالمنصة</span>');
    }
    if (ob.completedAt) {
      parts.push('<span class="muted">اكتمل: ' + escHtml(fmtTime(ob.completedAt)) + '</span>');
    } else {
      parts.push('<span class="muted">بدأ: ' + escHtml(fmtTime(ob.createdAt)) + '</span>');
    }
    document.getElementById('state-row').innerHTML = parts.join('');
  }

  function renderPlan(ob) {
    var el = document.getElementById('plan-list');
    var plan = Array.isArray(ob.planJson) ? ob.planJson : [];
    if (!plan.length) {
      el.innerHTML = '<li class="muted" style="padding:12px 2px;line-height:1.8;">'
        + 'لم يُحسب مسار الخطوات بعد — يضعه المنسّق عند أول تحقّق. اضغط «تحقق الآن» لبدء التنفيذ فوراً.'
        + '</li>';
      return;
    }
    var cursor = cursorIndex(plan, ob);
    var terminalBad = ob.state === 'FAILED' || ob.state === 'BLOCKED';
    el.innerHTML = plan.map(function (step, i) {
      var cls, mark;
      if (i < cursor) { cls = 'done'; mark = '✓'; }
      else if (i === cursor) { cls = terminalBad ? 'pending' : 'active'; mark = String(i + 1); }
      else { cls = 'pending'; mark = String(i + 1); }
      var meta = '';
      if (i === cursor && !terminalBad) meta = 'الخطوة الجارية الآن';
      else if (i < cursor) meta = 'اكتملت';
      else if (i === cursor && terminalBad) meta = 'متوقّفة عند هذه الخطوة';
      else meta = 'لاحقاً';
      var target = step && step.targetState ? stateMeta(step.targetState).label : '';
      return '<li class="plan-step ' + cls + '">'
        + '<span class="plan-dot">' + escHtml(mark) + '</span>'
        + '<div style="flex:1;min-width:0;">'
        + '<div class="plan-label">' + escHtml(step && step.label ? step.label : '—') + '</div>'
        + '<div class="plan-meta">' + escHtml(meta) + (target ? ' · تنقل إلى: ' + escHtml(target) : '') + '</div>'
        + '</div>'
        + '</li>';
    }).join('');
  }

  function renderCallouts(ob) {
    var el = document.getElementById('callouts');
    var html = '';

    // 3 ── The one missing thing. Never buried.
    if (ob.state === 'BLOCKED' && ob.blockedRequirement) {
      html += '<div class="callout callout-warn">'
        + '<div class="callout-title">⚠ الإجراء المطلوب لإتمام الربط</div>'
        + '<div class="callout-text">' + escHtml(ob.blockedRequirement) + '</div>'
        + '</div>';
    } else if (ob.state === 'BLOCKED') {
      html += '<div class="callout callout-warn">'
        + '<div class="callout-title">⚠ الربط متوقّف</div>'
        + '<div class="callout-text">توقّف المنسّق عند متطلّب ناقص دون تفاصيل إضافية — راجع سجل الأحداث أدناه.</div>'
        + '</div>';
    }

    if (ob.state === 'FAILED') {
      html += '<div class="callout callout-err">'
        + '<div class="callout-title">✕ فشل الربط</div>'
        + '<div class="callout-text">' + escHtml(ob.lastError || 'لم يسجّل المنسّق سبباً — راجع سجل الأحداث أدناه.') + '</div>'
        + '<div class="callout-actions"><span class="muted">يمكنك إعادة البدء لنفس الحساب من الأعلى بعد معالجة السبب.</span></div>'
        + '</div>';
    } else if (ob.lastError) {
      // Retryable error mid-flight — surfaced, but not as a terminal failure.
      html += '<div class="callout callout-err">'
        + '<div class="callout-title">آخر خطأ (قابل لإعادة المحاولة)</div>'
        + '<div class="callout-text">' + escHtml(ob.lastError) + '</div>'
        + '</div>';
    }

    // 4 ── What the client must do.
    if (ob.state === 'WAITING_EXTERNAL_ACTION') {
      var since = ob.waitingSince ? '<div class="muted" style="margin-top:8px;">بدأ الانتظار: ' + escHtml(fmtTime(ob.waitingSince)) + ' (' + escHtml(fmtRelative(ob.waitingSince)) + ')</div>' : '';
      var nextCheck = ob.nextCheckAt
        ? '<div class="muted" style="margin-top:6px;">التحقق التلقائي التالي: ' + escHtml(fmtTime(ob.nextCheckAt)) + ' (' + escHtml(fmtRelative(ob.nextCheckAt)) + ')</div>'
        : '';
      html += '<div class="callout callout-info">'
        + '<div class="callout-title">⏳ ما الذي يجب أن يفعله العميل الآن</div>'
        + '<div class="callout-text">'
        + 'أرسل للعميل طلب <strong>الوصول كشريك (Partner Access)</strong> على الحساب '
        + '<span class="mono">' + escHtml(ob.externalAccountId || '') + '</span>، '
        + 'ثم يوافق العميل على الطلب من <strong>مدير الأعمال (Business Manager)</strong> الخاص به. '
        + 'بمجرّد الموافقة يتولّى Adlytic الباقي تلقائياً: الإسناد لمستخدم النظام، الربط، وأول مزامنة.'
        + '</div>'
        + '<div class="callout-actions">'
        + '<a class="btn btn-primary btn-sm" href="' + BM_URL + '" target="_blank" rel="noopener noreferrer">فتح إعدادات حسابات Meta الإعلانية ↗</a>'
        + '<span class="muted">يتحقق Adlytic تلقائياً — واضغط «تحقق الآن» للتحقق فوراً.</span>'
        + '</div>'
        + nextCheck
        + since
        + '</div>';
    } else if (ob.nextCheckAt && !TERMINAL[ob.state]) {
      html += '<div class="callout callout-info">'
        + '<div class="callout-title">⏱ التحقق التلقائي</div>'
        + '<div class="callout-text">التحقق التلقائي التالي: ' + escHtml(fmtTime(ob.nextCheckAt)) + ' (' + escHtml(fmtRelative(ob.nextCheckAt)) + ')</div>'
        + '</div>';
    }

    if (ob.state === 'READY') {
      html += '<div class="callout callout-ok">'
        + '<div class="callout-title">✓ الحساب جاهز</div>'
        + '<div class="callout-text">اكتمل الربط وبدأت المزامنة. أصبح الحساب متاحاً في لوحة العميل.</div>'
        + '</div>';
    }

    el.innerHTML = html;
  }

  function renderTimeline(events) {
    var el = document.getElementById('timeline');
    var rows = (events || []).slice();
    // Newest first — the server returns oldest-first.
    rows.sort(function (a, b) { return new Date(b.at).getTime() - new Date(a.at).getTime(); });
    if (!rows.length) {
      el.innerHTML = '<div class="empty">لا أحداث بعد.</div>';
      return;
    }
    el.innerHTML = rows.map(function (ev) {
      var kind = EVENT_KIND_META[ev.kind] || { label: String(ev.kind == null ? '—' : ev.kind), cls: 'badge-muted' };
      var states = '';
      if (ev.fromState || ev.toState) {
        states = '<div class="tl-states">' + escHtml(ev.fromState || '—') + ' → ' + escHtml(ev.toState || '—') + '</div>';
      }
      var step = ev.stepId ? '<div class="tl-states">' + escHtml(ev.stepId) + '</div>' : '';
      return '<div class="tl-item">'
        + '<div class="tl-time">' + escHtml(fmtTime(ev.at)) + '</div>'
        + '<div><span class="badge ' + kind.cls + '">' + escHtml(kind.label) + '</span></div>'
        + '<div><div class="tl-msg">' + escHtml(ev.message || '') + '</div>' + states + step + '</div>'
        + '</div>';
    }).join('');
  }

  function renderOnboarding() {
    var ob = view.onboarding;
    // The phone shell repaints on every state change too — same record, same
    // poll, different shape. It renders even when there is no record yet,
    // because "no record yet" is a real screen there (step 1).
    mfRender();
    var progress = document.getElementById('progress-panel');
    var timeline = document.getElementById('timeline-panel');
    if (!ob) {
      progress.style.display = 'none';
      timeline.style.display = 'none';
      return;
    }
    progress.style.display = '';
    timeline.style.display = '';
    document.getElementById('progress-sub').textContent =
      'الحساب ' + (ob.externalAccountId || '') + ' · المزوّد ' + (ob.provider || 'META');
    document.getElementById('btn-check-now').disabled = false;
    renderStatePill(ob);
    renderCallouts(ob);
    renderPlan(ob);
    renderTimeline(view.timeline);
    markSelectedRow(ob.id);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MOBILE FLOW — five steps, one screen each
  //
  //  The cockpit above answers "what is the engine doing?". A phone asks a
  //  smaller question — "what do I do next?" — so it gets five screens with
  //  one thing on each:
  //
  //    1  معرّف الحساب      → متابعة
  //    2  اطلب الوصول        → افتح Meta
  //    3  بانتظار الموافقة   → تم إرسال الطلب + تحقّق تلقائي
  //    4  تمت الموافقة       → تم ربط الحساب
  //    5  المزامنة           → بدأت المزامنة → جاهز → افتح لوحة التحكم
  //
  //  Two states fall outside the ladder. BLOCKED becomes the ONE thing still
  //  needed, said plainly. FAILED becomes an honest dead end with a way back.
  //
  //  It adds no poll of its own: renderOnboarding() calls mfRender(), so the
  //  existing 10s loop drives both shells from one request.
  // ════════════════════════════════════════════════════════════════════════
  var MF_STEPS = 5;
  var mf = {
    workspaceId: '',   // resolved once (URL param, or the only workspace, or picked)
    acct: '',          // survives a re-render while the user is typing
    error: '',
    lastStep: 1,       // where the dots sit when the flow stops on BLOCKED/FAILED
    autoOpened: false,
  };

  /** Orchestrator state → screen. Numbers are the five steps; strings are the exits. */
  function mfStep(ob) {
    if (!ob) return 1;
    switch (ob.state) {
      case 'REQUEST_CREATED':         return 2;
      case 'WAITING_EXTERNAL_ACTION': return 3;
      case 'CONNECTING':
      case 'VERIFYING':               return 4;
      case 'SYNCING':
      case 'READY':                   return 5;
      case 'BLOCKED':                 return 'BLOCKED';
      case 'FAILED':                  return 'FAILED';
      default:                        return 1;
    }
  }

  /**
   * BLOCKED, in plain Arabic.
   *
   * The server's blockedRequirement is written for an operator standing in
   * front of the cockpit: it names internal machinery by name. The phone gets
   * one curated sentence chosen by the SHAPE of that requirement, and never
   * the raw string — so nothing internal can leak into a customer-facing
   * screen even when a new requirement is added server-side.
   *
   * Matching on prose is the weak part, and it is a symptom: the record has no
   * machine-readable reason. A blockedCode field would replace this whole
   * function with a lookup (reported as an API gap).
   */
  function mfBlockedText(ob) {
    var raw = String((ob && ob.blockedRequirement) || '');
    if (/META_SYSTEM_USER_TOKEN|على الخادم/.test(raw)) {
      return 'الربط غير مُفعّل على الخادم بعد. تواصل مع فريق Adlytic لتفعيله، ثم أعد المحاولة.';
    }
    if (/إسناد|أسند|صلاحية|Business Settings/.test(raw)) {
      return 'افتح إعدادات الحسابات الإعلانية لدى العميل، وامنح Adlytic صلاحية الاطلاع على أداء هذا الحساب، ثم اضغط «تحقّق الآن».';
    }
    return 'لم تكتمل الموافقة على الوصول إلى الحساب بعد. راجع طلب الوصول لدى Meta، ثم اضغط «تحقّق الآن».';
  }

  function mfRenderDots(step) {
    var el = document.getElementById('mf-dots');
    if (!el) return;
    var stopped = (step === 'BLOCKED' || step === 'FAILED');
    var at = stopped ? mf.lastStep : step;
    var out = '';
    for (var i = 1; i <= MF_STEPS; i++) {
      var cls = i < at ? 'done' : (i === at ? (stopped ? 'stop' : 'on') : '');
      out += '<span class="mf-dot ' + cls + '"></span>';
    }
    el.innerHTML = out;
  }

  function mfChip(ob) {
    var acct = ob && ob.externalAccountId ? ob.externalAccountId : '';
    return acct ? '<div class="mf-chip">' + escHtml(acct) + '</div>' : '';
  }
  function mfErrBlock() {
    return mf.error ? '<div class="mf-err">' + escHtml(mf.error) + '</div>' : '';
  }
  var MF_OPEN_META =
    '<a class="mf-btn mf-btn-primary" href="' + BM_URL + '" target="_blank" rel="noopener noreferrer">افتح Meta</a>';
  var MF_CHECK_NOW =
    '<button class="mf-btn mf-btn-quiet" id="mf-check">تحقّق الآن</button>';

  function mfRender() {
    var body = document.getElementById('mf-body');
    var foot = document.getElementById('mf-foot');
    if (!body || !foot) return;

    var ob = view.onboarding;
    var step = mfStep(ob);
    if (typeof step === 'number') mf.lastStep = step;
    mfRenderDots(step);

    var html = '';
    var footHtml = '';

    if (step === 1) {
      // ── 1 ── The only question that needs a keyboard. ──────────────────
      // The picker only appears when the answer is genuinely a choice. A single
      // workspace, or one named in the URL, is resolved silently — and when the
      // list could not be loaded at all, the page's manual fallback is offered
      // here too, so the phone is never a dead end the desktop can escape.
      var wsHtml = '';
      if (!mf.workspaceId) {
        if (view.workspaces.length) {
          wsHtml = '<label class="mf-label" for="mf-ws">عميل Adlytic</label>'
            + '<select class="mf-select" id="mf-ws">'
            + '<option value="">— اختر العميل —</option>'
            + view.workspaces.map(function (w) {
                return '<option value="' + escHtml(w.id) + '">'
                  + escHtml(w.name + (w.email ? ' — ' + w.email : '')) + '</option>';
              }).join('')
            + '</select>';
        } else if (view.workspaceMode === 'input') {
          wsHtml = '<label class="mf-label" for="mf-ws-input">معرّف مساحة عمل العميل</label>'
            + '<input class="mf-input mf-select" id="mf-ws-input" type="text" autocomplete="off"'
            + ' autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" placeholder="ws_…" />';
        }
      }
      html = '<div class="mf-h">ابدأ ربط حساب العميل</div>'
        + '<div class="mf-p">أدخل معرّف الحساب الإعلاني كما يظهر لدى العميل.</div>'
        + '<div class="mf-form">'
        + wsHtml
        + '<label class="mf-label" for="mf-acct">معرّف الحساب الإعلاني</label>'
        + '<input class="mf-input" id="mf-acct" type="text" inputmode="numeric" autocomplete="off"'
        + ' autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr"'
        + ' placeholder="1234567890" value="' + escHtml(mf.acct) + '" />'
        + '<div class="mf-note">الأرقام وحدها تكفي — نكمل الباقي.</div>'
        + '</div>'
        + mfErrBlock();
      footHtml = '<button class="mf-btn mf-btn-primary" id="mf-cta">متابعة</button>';

    } else if (step === 2) {
      // ── 2 ── Ask the client for access. ────────────────────────────────
      html = '<div class="mf-icon">🔗</div>'
        + '<div class="mf-h">اطلب الوصول إلى الحساب</div>'
        + '<div class="mf-p">افتح Meta وأرسل طلب الوصول إلى هذا الحساب. نتابع الطلب من هنا نيابةً عنك.</div>'
        + mfChip(ob);
      footHtml = MF_OPEN_META + MF_CHECK_NOW;

    } else if (step === 3) {
      // ── 3 ── Sent. Nothing left to do but wait. ────────────────────────
      var next = ob && ob.nextCheckAt
        ? '<div class="mf-note">التحقق التالي ' + escHtml(fmtRelative(ob.nextCheckAt)) + '.</div>'
        : '';
      html = '<div class="mf-spin"></div>'
        + '<div class="mf-h">تم إرسال الطلب</div>'
        + '<div class="mf-p">بانتظار موافقة العميل. نتحقق تلقائياً — لا حاجة لأي إجراء منك الآن.</div>'
        + mfChip(ob)
        + next;
      footHtml = MF_CHECK_NOW;

    } else if (step === 4) {
      // ── 4 ── Approved. ────────────────────────────────────────────────
      html = '<div class="mf-icon mf-ok">✓</div>'
        + '<div class="mf-h">تم ربط الحساب</div>'
        + '<div class="mf-p">نجهّز الحساب الآن. تستغرق هذه الخطوة لحظات.</div>'
        + mfChip(ob);
      footHtml = '';

    } else if (step === 5) {
      // ── 5 ── Syncing, then ready. ─────────────────────────────────────
      if (ob && ob.state === 'READY') {
        html = '<div class="mf-icon mf-ok">✅</div>'
          + '<div class="mf-h">اكتملت المزامنة</div>'
          + '<div class="mf-p">أصبحت بيانات هذا الحساب متاحة في لوحة التحكم.</div>'
          + mfChip(ob);
        footHtml = '<a class="mf-btn mf-btn-primary" href="/dashboard">افتح لوحة التحكم</a>';
      } else {
        html = '<div class="mf-spin"></div>'
          + '<div class="mf-h">بدأت المزامنة</div>'
          + '<div class="mf-p">نسحب بيانات حملات هذا الحساب. قد تستغرق بضع دقائق — يمكنك إغلاق الصفحة.</div>'
          + mfChip(ob);
        footHtml = '';
      }

    } else if (step === 'BLOCKED') {
      // ── Exit A ── One thing is missing. Say only that. ────────────────
      html = '<div class="mf-icon mf-warn">⚠</div>'
        + '<div class="mf-h">مطلوب خطوة واحدة</div>'
        + '<div class="mf-p">' + escHtml(mfBlockedText(ob)) + '</div>'
        + mfChip(ob);
      footHtml = MF_OPEN_META + MF_CHECK_NOW;

    } else {
      // ── Exit B ── Honest dead end, with a way back. ───────────────────
      html = '<div class="mf-icon mf-bad">✕</div>'
        + '<div class="mf-h">تعذّر إكمال الربط</div>'
        + '<div class="mf-p">لم نتمكن من إكمال ربط هذا الحساب. تأكّد من معرّف الحساب وابدأ من جديد، أو تواصل مع فريق Adlytic.</div>'
        + mfChip(ob);
      footHtml = '<button class="mf-btn mf-btn-primary" id="mf-restart">ابدأ من جديد</button>';
    }

    body.innerHTML = html;
    foot.innerHTML = footHtml;
    foot.style.display = footHtml ? '' : 'none';
    mfWire();
  }

  /** Re-attach listeners — mfRender() replaces the nodes they were bound to. */
  function mfWire() {
    var acct = document.getElementById('mf-acct');
    if (acct) {
      acct.addEventListener('input', function () { mf.acct = this.value; });
      acct.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); mfStart(); } });
      // Belt to the sticky footer's braces: when the keyboard opens, put the
      // action back on screen even if the browser reports no viewport inset.
      acct.addEventListener('focus', function () {
        setTimeout(function () {
          var f = document.getElementById('mf-foot');
          if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
        }, 300);
      });
    }
    var ws = document.getElementById('mf-ws') || document.getElementById('mf-ws-input');
    if (ws) ws.addEventListener('change', function () { mf.error = ''; });

    var cta = document.getElementById('mf-cta');
    if (cta) cta.addEventListener('click', function () { mfStart(); });

    var check = document.getElementById('mf-check');
    if (check) check.addEventListener('click', function () { checkNow(); });

    var restart = document.getElementById('mf-restart');
    if (restart) restart.addEventListener('click', function () {
      stopPolling();
      view.onboarding = null;
      view.timeline = [];
      mf.acct = '';
      mf.error = '';
      renderOnboarding();
    });
  }

  /**
   * Step 1 → step 2. Reuses the same endpoint the cockpit posts to.
   *
   * Failures are reported as one plain sentence rather than the server's own
   * message: that text is operator-facing and names internals.
   */
  async function mfStart() {
    var ws = document.getElementById('mf-ws') || document.getElementById('mf-ws-input');
    var workspaceId = mf.workspaceId || (ws ? (ws.value || '').trim() : '') || '';
    var input = document.getElementById('mf-acct');
    var accountId = input ? (input.value || '').trim() : '';
    mf.acct = accountId;

    if (!workspaceId) { mf.error = 'اختر العميل أولاً.'; mfRender(); return; }
    if (!accountId)   { mf.error = 'أدخل معرّف الحساب الإعلاني.'; mfRender(); return; }
    mf.error = '';

    var btn = document.getElementById('mf-cta');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الإرسال…'; }
    try {
      var res = await api('/api/admin/onboarding', {
        method: 'POST',
        body: { workspaceId: workspaceId, externalAccountId: accountId },
      });
      mf.workspaceId = workspaceId;
      view.workspaceId = workspaceId;
      loadOnboardingList(workspaceId);
      if (res.onboarding && res.onboarding.id) await openOnboarding(res.onboarding.id);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      mf.error = 'تعذّر إرسال الطلب. تأكّد من معرّف الحساب وحاول مرة أخرى.';
      mfRender();
    } finally {
      var b = document.getElementById('mf-cta');
      if (b) { b.disabled = false; b.textContent = 'متابعة'; }
    }
  }

  /**
   * Pick the workspace without asking, when the answer is not a choice: an
   * explicit ?workspaceId=, or the single workspace on the account. Otherwise
   * step 1 grows a picker above the input.
   */
  function mfResolveWorkspace() {
    var fromUrl = '';
    try { fromUrl = new URLSearchParams(window.location.search).get('workspaceId') || ''; } catch (e) {}
    if (fromUrl) mf.workspaceId = fromUrl;
    else if (view.workspaces.length === 1) mf.workspaceId = view.workspaces[0].id;

    if (!mf.workspaceId) { mfRender(); return; }
    view.workspaceId = mf.workspaceId;
    loadOnboardingList(mf.workspaceId).then(mfResumeActive);
  }

  /** Resume a connection already in flight rather than restarting at step 1. */
  function mfResumeActive() {
    if (mf.autoOpened) { mfRender(); return; }
    mf.autoOpened = true;
    var records = view.records || [];
    for (var i = 0; i < records.length; i++) {
      if (!TERMINAL[records[i].state]) { openOnboarding(records[i].id); return; }
    }
    mfRender();
  }

  /**
   * The on-screen keyboard covers the bottom of the layout viewport but leaves
   * its height unchanged, so a bottom-anchored action disappears under it.
   * visualViewport reports what is actually visible; the difference is exactly
   * how far the footer must lift.
   */
  function mfKeyboardInset() {
    var vv = window.visualViewport;
    if (!vv) return;
    function apply() {
      var inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--mf-kb', Math.round(inset) + 'px');
    }
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Polling — setTimeout recursion, stops on terminal / repeated failure
  // ════════════════════════════════════════════════════════════════════════
  function stopPolling() {
    if (view.pollTimer) { clearTimeout(view.pollTimer); view.pollTimer = null; }
    view.pollToken++;
  }

  function schedulePoll() {
    stopPolling();
    var ob = view.onboarding;
    if (!ob || TERMINAL[ob.state]) return;
    var myToken = view.pollToken;
    var id = ob.id;
    view.pollTimer = setTimeout(function () {
      pollOnce(id, myToken);
    }, POLL_MS);
  }

  async function pollOnce(id, myToken) {
    if (myToken !== view.pollToken) return;   // superseded by a newer selection
    try {
      var res = await api('/api/admin/onboarding/' + encodeURIComponent(id));
      if (myToken !== view.pollToken) return;
      view.pollFailures = 0;
      view.onboarding = res.onboarding || null;
      view.timeline = res.timeline || [];
      renderOnboarding();
      if (view.onboarding && !TERMINAL[view.onboarding.state]) schedulePoll();
    } catch (e) {
      if (myToken !== view.pollToken) return;
      if (isAuthError(e)) { showGateError('غير مصرّح.'); stopPolling(); return; }
      view.pollFailures++;
      if (view.pollFailures >= MAX_POLL_FAILURES) {
        stopPolling();
        var el = document.getElementById('callouts');
        el.innerHTML = '<div class="callout callout-err">'
          + '<div class="callout-title">توقّف التحديث التلقائي</div>'
          + '<div class="callout-text">' + escHtml(e.message || 'تعذّر الاتصال بالخادم.') + ' — اضغط «تحقق الآن» لإعادة المحاولة.</div>'
          + '</div>' + el.innerHTML;
        return;
      }
      schedulePoll();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Actions
  // ════════════════════════════════════════════════════════════════════════
  async function openOnboarding(id) {
    stopPolling();
    view.pollFailures = 0;
    try {
      var res = await api('/api/admin/onboarding/' + encodeURIComponent(id));
      view.onboarding = res.onboarding || null;
      view.timeline = res.timeline || [];
      renderOnboarding();
      var panel = document.getElementById('progress-panel');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
      schedulePoll();
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      showStartError(e.message || 'تعذّر فتح طلب الربط.');
    }
  }

  async function startOnboarding() {
    clearStartError();
    var workspaceId = currentWorkspaceId();
    var accountId = (document.getElementById('acct-input').value || '').trim();
    if (!workspaceId) { showStartError('اختر مساحة عمل العميل أولاً.'); return; }
    if (!accountId) { showStartError('أدخل معرّف الحساب الإعلاني.'); return; }
    var btn = document.getElementById('btn-start');
    btn.disabled = true;
    try {
      var res = await api('/api/admin/onboarding', {
        method: 'POST',
        body: { workspaceId: workspaceId, externalAccountId: accountId },
      });
      view.workspaceId = workspaceId;
      await loadOnboardingList(workspaceId);
      if (res.onboarding && res.onboarding.id) await openOnboarding(res.onboarding.id);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      showStartError(e.message || 'تعذّر بدء الربط.');
    } finally {
      btn.disabled = false;
    }
  }

  async function checkNow() {
    var ob = view.onboarding;
    if (!ob) return;
    var btn = document.getElementById('btn-check-now');
    btn.disabled = true;
    btn.textContent = 'جارٍ التحقق…';
    stopPolling();
    try {
      var res = await api('/api/admin/onboarding/' + encodeURIComponent(ob.id) + '/check', { method: 'POST' });
      view.pollFailures = 0;
      view.onboarding = res.onboarding || view.onboarding;
      view.timeline = res.timeline || view.timeline;
      renderOnboarding();
      schedulePoll();
      if (view.workspaceId) loadOnboardingList(view.workspaceId);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      var el = document.getElementById('callouts');
      el.innerHTML = '<div class="callout callout-err">'
        + '<div class="callout-title">تعذّر التحقق</div>'
        + '<div class="callout-text">' + escHtml(e.message || 'تعذّر الاتصال بالخادم.') + '</div>'
        + '</div>' + el.innerHTML;
      schedulePoll();
    } finally {
      btn.disabled = false;
      btn.textContent = 'تحقق الآن';
    }
  }

  // ── Existing onboardings for the selected workspace ──────────────────────
  function markSelectedRow(id) {
    var rows = document.querySelectorAll('#ob-list .ob-row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-id') === id) rows[i].classList.add('selected');
      else rows[i].classList.remove('selected');
    }
  }

  function renderOnboardingList(records) {
    var el = document.getElementById('ob-list');
    var panel = document.getElementById('list-panel');
    panel.style.display = '';
    if (!records || !records.length) {
      el.innerHTML = '<div class="empty">لا طلبات ربط لهذه المساحة بعد.</div>';
      return;
    }
    el.innerHTML = records.map(function (r) {
      var meta = stateMeta(r.state);
      return '<button class="ob-row" data-id="' + escHtml(r.id) + '">'
        + '<span>'
        + '<span class="mono" style="font-weight:700;">' + escHtml(r.externalAccountId || '') + '</span>'
        + '<span class="muted" style="display:block;margin-top:4px;">بدأ: ' + escHtml(fmtTime(r.createdAt)) + '</span>'
        + '</span>'
        + '<span class="badge ' + stateBadgeClass(r.state) + '">' + escHtml(meta.label) + '</span>'
        + '</button>';
    }).join('');
    var rows = el.querySelectorAll('.ob-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        if (id) openOnboarding(id);
      });
    }
    if (view.onboarding) markSelectedRow(view.onboarding.id);
  }

  async function loadOnboardingList(workspaceId) {
    if (!workspaceId) {
      document.getElementById('list-panel').style.display = 'none';
      return;
    }
    try {
      var res = await api('/api/admin/onboarding?workspaceId=' + encodeURIComponent(workspaceId));
      view.records = res.onboardings || [];
      renderOnboardingList(view.records);
    } catch (e) {
      if (isAuthError(e)) { showGateError('غير مصرّح.'); return; }
      var panel = document.getElementById('list-panel');
      panel.style.display = '';
      document.getElementById('ob-list').innerHTML =
        '<div class="error-box" style="margin-bottom:0;">' + escHtml(e.message || 'تعذّر تحميل طلبات الربط.') + '</div>';
    }
  }

  // ── Secondary: accounts currently visible to the System User token ───────
  function renderAccounts(rows) {
    var tbody = document.getElementById('accounts-tbody');
    var table = document.getElementById('accounts-table');
    var empty = document.getElementById('accounts-empty');
    if (!rows || !rows.length) {
      tbody.innerHTML = '';
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    table.style.display = '';
    tbody.innerHTML = rows.map(function (a) {
      var linked = a.linked
        ? '<span class="badge badge-ok">مرتبط</span>'
        : '<span class="badge badge-muted">غير مرتبط</span>';
      var wsHint = a.linked && a.linkedWorkspaceId
        ? '<div class="muted mono" style="margin-top:4px;">' + escHtml(a.linkedWorkspaceId) + '</div>'
        : '';
      return '<tr>'
        + '<td style="font-weight:700;">' + escHtml(a.name || '—') + '</td>'
        + '<td class="mono muted">' + escHtml(a.id) + '</td>'
        + '<td class="currency-cell">' + escHtml(currencyLabel(a.currency)) + '</td>'
        + '<td>' + accountStatusBadge(a.accountStatus) + '</td>'
        + '<td>' + linked + wsHint + '</td>'
        + '<td><button class="btn btn-secondary btn-sm use-acct" data-id="' + escHtml(a.id) + '">استخدم</button></td>'
        + '</tr>';
    }).join('');
    var btns = tbody.querySelectorAll('.use-acct');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var id = this.getAttribute('data-id') || '';
        var input = document.getElementById('acct-input');
        input.value = id;
        input.focus();
        if (input.scrollIntoView) input.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  async function loadDiscover() {
    var statusEl = document.getElementById('discover-status');
    var sub = document.getElementById('discover-sub');
    var table = document.getElementById('accounts-table');
    var empty = document.getElementById('accounts-empty');
    statusEl.style.display = 'none';
    statusEl.className = 'panel-body';
    try {
      var res = await api('/api/admin/meta/discover-accounts');
      if (res.configured === false) {
        table.style.display = 'none';
        empty.style.display = 'none';
        statusEl.style.display = '';
        statusEl.innerHTML = '<div class="info-box">مستخدم النظام غير مُهيّأ على الخادم: ' + escHtml(res.reason || 'META_SYSTEM_USER_TOKEN غير مضبوط.') + '</div>';
        return;
      }
      if (res.error) {
        table.style.display = 'none';
        empty.style.display = 'none';
        statusEl.style.display = '';
        statusEl.innerHTML = '<div class="error-box">تعذّر الاتصال بـ Meta: ' + escHtml(res.error) + '</div>';
        return;
      }
      if (res.businessName) {
        sub.textContent = 'مدير الأعمال: ' + res.businessName;
      }
      renderAccounts(res.accounts || []);
    } catch (e) {
      if (isAuthError(e)) {
        showGateError('غير مصرّح.');
      } else {
        table.style.display = 'none';
        empty.style.display = 'none';
        statusEl.style.display = '';
        statusEl.innerHTML = '<div class="error-box">' + escHtml(e.message || 'تعذّر تحميل الحسابات.') + '</div>';
      }
    }
  }

  // ── Admin gate ────────────────────────────────────────────────────────────
  // The client-side authorization branch that used to live here is gone.
  //
  // Its markup (the access-gate overlay) was chrome the shell now owns, and
  // its logic was never a boundary: /admin/add-client is served through the
  // server-side adminPage gate, which reads the session cookie and refuses
  // before any of this reaches a browser. A page that hides a control is not
  // a guard, and keeping a second one here meant this surface redirected
  // itself out of the Control Plane whenever the check was inconclusive.

  // ── Wiring ────────────────────────────────────────────────────────────────
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-start').addEventListener('click', function () { startOnboarding(); });
  document.getElementById('btn-check-now').addEventListener('click', function () { checkNow(); });
  document.getElementById('acct-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startOnboarding();
  });
  document.getElementById('ws-select').addEventListener('change', function () {
    clearStartError();
    stopPolling();
    view.onboarding = null;
    view.timeline = [];
    renderOnboarding();
    view.workspaceId = currentWorkspaceId();
    loadOnboardingList(view.workspaceId);
  });
  document.getElementById('ws-input').addEventListener('change', function () {
    clearStartError();
    stopPolling();
    view.onboarding = null;
    view.timeline = [];
    renderOnboarding();
    view.workspaceId = currentWorkspaceId();
    loadOnboardingList(view.workspaceId);
  });
  document.getElementById('btn-refresh').addEventListener('click', function () {
    loadDiscover();
    if (view.workspaceId) loadOnboardingList(view.workspaceId);
    if (view.onboarding) openOnboarding(view.onboarding.id);
  });
  window.addEventListener('beforeunload', stopPolling);

  mfKeyboardInset();
  mfRender();                         // step 1 is on screen before any request lands
loadWorkspaces().then(mfResolveWorkspace);
    loadDiscover();
})();
`;

export function addClientPage(): string {
  return adminShell({
    active: 'add-client',
    title: 'إضافة عميل',
    subtitle: 'معالج الإعداد من الصفر حتى أول مزامنة',
    css: CSS,
    header: HEADER,
    body: BODY,
    script: SCRIPT,
    commands: [
      { label: 'اكتشاف حسابات Meta', href: '/admin/meta#entities', hint: 'Meta والبيانات' },
      { label: 'الزبائن والاشتراكات', href: '/admin/customers', hint: 'الزبائن' },
    ],
  });
}
