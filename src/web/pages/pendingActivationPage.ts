// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/pendingActivationPage.ts
//
//  Shown to authenticated users whose account is not yet manually activated.
//  Only actions: contact support via WhatsApp, or logout.
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function pendingActivationPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pending activation — Adlytic</title>
  <style>
    ${SHARED_CSS}
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--bg); padding: 24px 16px; }
    .auth-wrap { width: 100%; max-width: 440px; }
    .auth-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; justify-content: center; }
    .auth-logo-mark { width: 36px; height: 36px; background: var(--accent); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; color: #fff; }
    .auth-logo-text { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: var(--text); }
    .auth-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; text-align: center; }
    .pending-icon { font-size: 44px; line-height: 1; margin-bottom: 16px; }
    .auth-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .auth-subtitle { font-size: 13.5px; color: var(--text-2); margin-bottom: 24px; line-height: 1.55; }
    .user-email { font-size: 13px; color: var(--text); font-weight: 600; margin-bottom: 20px; word-break: break-all; }
    .wa-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 12px 18px; font-size: 14px; font-weight: 600;
      background: #25D366; color: #fff; border: none; border-radius: var(--radius-sm);
      text-decoration: none; margin-bottom: 12px;
    }
    .wa-btn:hover { background: #1ebe57; color: #fff; }
    .wa-btn[disabled] { opacity: 0.5; pointer-events: none; }
    #error-msg { display: none; margin-bottom: 16px; text-align: left; }
    .logout-link { display: inline-block; margin-top: 8px; font-size: 13px; color: var(--text-3); cursor: pointer; background: none; border: none; }
    .logout-link:hover { color: var(--text-2); }
  </style>
</head>
<body>
  <div class="auth-wrap">
    <div class="auth-logo">
      <div class="auth-logo-mark">A</div>
      <span class="auth-logo-text">Adlytic</span>
    </div>
    <div class="auth-card">
      <div class="pending-icon">⏳</div>
      <div class="auth-title">Account pending activation</div>
      <div class="auth-subtitle">
        Your account has been created. Contact our team on WhatsApp to activate access — we never ask for your password.
      </div>

      <div id="error-msg" class="alert alert-error"></div>
      <div class="user-email" id="user-email"></div>

      <a id="wa-btn" class="wa-btn" href="#" target="_blank" rel="noopener noreferrer" style="display:none;">
        Contact us on WhatsApp
      </a>
      <button type="button" class="wa-btn" id="wa-loading" disabled style="display:none;">Loading WhatsApp link…</button>

      <div>
        <button type="button" class="logout-link" id="logout-btn">Sign out</button>
      </div>
    </div>
  </div>

  <script>
    function getToken() { return localStorage.getItem('adlytic_token') || ''; }
    function logout() {
      localStorage.removeItem('adlytic_token');
      localStorage.removeItem('adlytic_workspace_id');
      window.location.href = '/login';
    }
    function showError(msg) {
      var el = document.getElementById('error-msg');
      el.textContent = msg;
      el.style.display = 'flex';
    }

    (async function init() {
      var token = getToken();
      if (!token) { window.location.href = '/login'; return; }

      document.getElementById('logout-btn').addEventListener('click', logout);
      document.getElementById('wa-loading').style.display = 'inline-flex';

      try {
        var meRes = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (meRes.status === 401) { logout(); return; }
        if (!meRes.ok) throw new Error('Could not load your account.');
        var me = await meRes.json();

        if (me.isActive === true) {
          window.location.href = '/welcome';
          return;
        }

        document.getElementById('user-email').textContent = me.email || '';

        var linkRes = await fetch('/api/activation/whatsapp-link', {
          headers: { Authorization: 'Bearer ' + token },
        });
        document.getElementById('wa-loading').style.display = 'none';

        if (!linkRes.ok) {
          var err = await linkRes.json().catch(function () { return {}; });
          showError(err.error || 'WhatsApp link is unavailable. Please try again later.');
          return;
        }

        var link = await linkRes.json();
        var btn = document.getElementById('wa-btn');
        btn.href = link.url;
        btn.style.display = 'inline-flex';
      } catch (e) {
        document.getElementById('wa-loading').style.display = 'none';
        showError(e.message || 'Something went wrong. Please refresh the page.');
      }
    })();
  </script>
</body>
</html>`;
}
