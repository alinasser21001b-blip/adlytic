// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminLoginPage.ts — /admin/login
//
//  A separate door, not a skin on the customer one.
//
//  WHY IT MUST BE SEPARATE
//  The customer login bounces any existing valid session straight to
//  /dashboard. An operator holding a stale customer token who tries to
//  reach the admin surface is therefore thrown into the customer product
//  before they can type anything — the exact trap this page removes. Here a
//  stale customer session is SUSPENDED, not obeyed: the form is shown.
//
//  Authorisation is still entirely server-side. This page refuses to
//  *navigate* a non-admin into the admin surface; it grants nothing.
// ════════════════════════════════════════════════════════════════════════

import { TOKENS_CSS_PATH } from '../layout';
import { SESSION_ROUTER_JS } from '../auth/sessionRouter';

export function adminLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>دخول الإدارة — Adlytic</title>
  <link rel="stylesheet" href="${TOKENS_CSS_PATH}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: var(--bg); color: var(--text);
      font-family: var(--font-body); font-size: 14px; }
    .wrap { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: min(420px, 100%); border: 1px solid var(--border); border-radius: 14px;
      background: var(--surface); padding: 28px 26px; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
    .brand span { color: var(--accent); }
    .sub { font-size: 12px; color: var(--text-3); font-weight: 700; margin-top: 4px; }
    h1 { font-size: 17px; font-weight: 800; margin: 20px 0 4px; }
    .lede { font-size: 12.5px; color: var(--text-2); line-height: 1.7; margin-bottom: 18px; }
    label { display: block; font-size: 12px; font-weight: 700; color: var(--text-2); margin: 12px 0 5px; }
    input { width: 100%; background: var(--surface-2); border: 1px solid var(--border-control);
      border-radius: 9px; padding: 10px 12px; color: var(--text); font: inherit; }
    input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
    button { width: 100%; margin-top: 18px; padding: 11px; border: none; border-radius: 9px;
      background: var(--accent); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    button[disabled] { opacity: 0.55; cursor: not-allowed; }
    .msg { margin-top: 14px; padding: 11px 13px; border-radius: 9px; font-size: 12.5px; line-height: 1.7; display: none; }
    .msg.err { display: block; background: var(--error-dim); border: 1px solid var(--error); color: var(--error); }
    .msg.ok { display: block; background: var(--success-dim); border: 1px solid var(--success); color: var(--success); }
    .note { margin-top: 16px; font-size: 11.5px; color: var(--text-3); line-height: 1.7;
      border-top: 1px solid var(--border); padding-top: 12px; }
    .gate { position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center;
      justify-content: center; gap: 10px; color: var(--text-2); font-weight: 600; z-index: 50; }
    .gate.hidden { display: none; }
    .spin { width: 24px; height: 24px; border: 3px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: sp .7s linear infinite; }
    @keyframes sp { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
<div class="gate" id="gate"><div class="spin"></div><div>جارٍ التحقق…</div></div>
<div class="wrap">
  <div class="card">
    <div class="brand">Ad<span>lytic</span></div>
    <div class="sub">نظام التشغيل الإداري</div>
    <h1>دخول الإدارة</h1>
    <p class="lede">هذا المدخل لحسابات إدارة المنصّة فقط. حساب العميل لن يُقبل هنا.</p>
    <form id="f" autocomplete="on">
      <label for="e">البريد الإلكتروني</label>
      <input id="e" name="email" type="email" required autocomplete="username" dir="ltr" />
      <label for="p">كلمة المرور</label>
      <input id="p" name="password" type="password" required autocomplete="current-password" />
      <button id="b" type="submit">دخول</button>
    </form>
    <div class="msg" id="m"></div>
    <div class="note">
      الصلاحية تُتحقَّق على الخادم في كل طلب. لا شيء في هذا المتصفح يمنح صلاحية إدارة.
    </div>
  </div>
</div>

<script>${SESSION_ROUTER_JS}</script>
<script>
(function () {
  var S = window.AdlyticSession;
  var gate = document.getElementById('gate');
  var msg = document.getElementById('m');
  var btn = document.getElementById('b');

  function say(text, kind) { msg.textContent = text; msg.className = 'msg ' + kind; }

  // An EXISTING session decides only whether we skip the form — never
  // whether we leave for the customer product. A stale customer token is
  // suspended here, not obeyed.
  S.resolveSessionIdentity().then(function (id) {
    if (id.kind === 'ADMIN') { window.location.replace('/admin'); return; }
    if (id.kind === 'CUSTOMER' || id.kind === 'PENDING') {
      S.clearSession();
      gate.classList.add('hidden');
      say('كانت هناك جلسة عميل في هذا المتصفح — أُوقفت. سجّل الدخول بحساب إدارة.', 'err');
      return;
    }
    gate.classList.add('hidden');
  }, function () { gate.classList.add('hidden'); });

  document.getElementById('f').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    btn.disabled = true;
    msg.className = 'msg';
    var email = document.getElementById('e').value.trim();
    var password = document.getElementById('p').value;
    try {
      var r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { say(d.error || 'بيانات الدخول غير صحيحة.', 'err'); btn.disabled = false; return; }

      // Verify with the NEW token before adopting anything. Never trust the
      // login response to describe the identity it just created.
      var meRes = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + d.token } });
      var me = meRes.ok ? await meRes.json() : null;

      if (!me || me.isPlatformAdmin !== true) {
        // Refuse the surface AND drop the token we just obtained: leaving it
        // behind would silently log a customer into the customer product
        // from the admin door.
        S.clearSession();
        say('هذا الحساب ليس حساب إدارة للمنصة.', 'err');
        btn.disabled = false;
        return;
      }

      S.adoptAdminSession(d.token);
      say('تم — جارٍ فتح نظام الإدارة…', 'ok');
      window.location.replace('/admin');
    } catch (e) {
      say('تعذّر الاتصال. أعد المحاولة.', 'err');
      btn.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}
