// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/loginPage.ts  —  Login page
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in — Adlytic</title>
  <style>
    ${SHARED_CSS}
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--bg); }
    .auth-wrap { width: 100%; max-width: 400px; padding: 0 16px; }
    .auth-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 36px; justify-content: center; }
    .auth-logo-mark { width: 36px; height: 36px; background: var(--accent); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; color: #fff; }
    .auth-logo-text { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: var(--text); }
    .auth-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; }
    .auth-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .auth-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 28px; }
    .auth-divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
    .auth-footer { text-align: center; margin-top: 20px; font-size: 12.5px; color: var(--text-3); }
    #error-msg { display: none; }
    #success-msg { display: none; }
  </style>
</head>
<body>
  <div id="toast-container"></div>
  <div class="auth-wrap">
    <div class="auth-logo">
      <div class="auth-logo-mark">A</div>
      <span class="auth-logo-text">Adlytic</span>
    </div>
    <div class="auth-card">
      <div class="auth-title">Welcome back</div>
      <div class="auth-subtitle">Sign in to your Adlytic account</div>

      <div id="error-msg" class="alert alert-error"></div>
      <div id="success-msg" class="alert alert-success"></div>

      <form id="login-form">
        <div class="form-group">
          <label class="form-label" for="email">Email address</label>
          <input type="email" id="email" class="form-input" placeholder="you@company.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label" for="password">
            Password
          </label>
          <input type="password" id="password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary btn-lg" id="submit-btn" style="width:100%;justify-content:center;margin-top:4px;">
          <span id="btn-text">Sign in</span>
          <span id="btn-spinner" class="spinner" style="display:none;width:16px;height:16px;border-width:2px;"></span>
        </button>
      </form>

      <hr class="auth-divider">
      <div style="font-size:12.5px;color:var(--text-3);text-align:center;">
        Don't have an account? <a href="/register" style="color:var(--accent);text-decoration:none;">Create one</a>
      </div>
    </div>
    <div class="auth-footer">
      Adlytic Ads Intelligence Platform &nbsp;·&nbsp; Phase 1
    </div>
  </div>

  <script>
    async function redirectIfLoggedIn() {
      if (!localStorage.getItem('adlytic_token')) return;
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + localStorage.getItem('adlytic_token') },
        });
        if (!meRes.ok) return;
        const me = await meRes.json();
        window.location.href = me.isActive === false ? '/pending-activation' : '/dashboard';
      } catch (_) { /* stay on login */ }
    }
    redirectIfLoggedIn();

    const form    = document.getElementById('login-form');
    const errEl   = document.getElementById('error-msg');
    const sucEl   = document.getElementById('success-msg');
    const btnText = document.getElementById('btn-text');
    const btnSpin = document.getElementById('btn-spinner');
    const btn     = document.getElementById('submit-btn');

    function showError(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'flex';
      sucEl.style.display = 'none';
    }
    function showSuccess(msg) {
      sucEl.textContent = msg;
      sucEl.style.display = 'flex';
      errEl.style.display = 'none';
    }
    function setLoading(on) {
      btn.disabled = on;
      btnText.textContent = on ? 'Signing in…' : 'Sign in';
      btnSpin.style.display = on ? 'inline-block' : 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) { showError('Please fill in all fields.'); return; }

      setLoading(true);
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Login failed. Please check your credentials.');
          setLoading(false);
          return;
        }

        // Store token + workspace
        localStorage.setItem('adlytic_token', data.token);
        const firstWs = data.user?.memberships?.[0]?.workspaceId;

        // Fetch full user to get workspace memberships
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + data.token }
        });
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.isActive === false) {
            showSuccess('Signed in! Redirecting…');
            setTimeout(() => { window.location.href = '/pending-activation'; }, 400);
            return;
          }
          const wsId = me.memberships?.[0]?.workspaceId;
          if (wsId) localStorage.setItem('adlytic_workspace_id', wsId);
          else if (firstWs) localStorage.setItem('adlytic_workspace_id', firstWs);
        } else if (firstWs) {
          localStorage.setItem('adlytic_workspace_id', firstWs);
        }

        showSuccess('Signed in successfully! Redirecting…');
        setTimeout(async () => {
          try {
            const wsId = localStorage.getItem('adlytic_workspace_id');
            if (wsId) {
              const wsRes = await fetch('/api/workspaces/' + wsId, {
                headers: { Authorization: 'Bearer ' + data.token }
              });
              if (wsRes.ok) {
                const ws = await wsRes.json();
                if (!ws.adAccounts || ws.adAccounts.length === 0) {
                  window.location.href = '/welcome';
                  return;
                }
              }
            }
          } catch (_) { /* fall through to dashboard */ }
          window.location.href = '/dashboard';
        }, 600);

      } catch (err) {
        showError('Network error. Please try again.');
        setLoading(false);
      }
    });

    // Focus email field
    document.getElementById('email').focus();
  </script>
</body>
</html>`;
}
