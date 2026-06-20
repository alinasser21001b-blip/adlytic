// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/registerPage.ts  —  Registration page
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function registerPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create account — Adlytic</title>
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
      <div class="auth-title">Create your account</div>
      <div class="auth-subtitle">Start analyzing your Meta Ads with AI</div>

      <div id="error-msg" class="alert alert-error"></div>
      <div id="success-msg" class="alert alert-success"></div>

      <form id="register-form">
        <div class="form-group">
          <label class="form-label" for="name">Full name</label>
          <input type="text" id="name" class="form-input" placeholder="Ali Ahmed" autocomplete="name">
        </div>
        <div class="form-group">
          <label class="form-label" for="email">Email address</label>
          <input type="email" id="email" class="form-input" placeholder="you@company.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <input type="password" id="password" class="form-input" placeholder="8+ characters" required autocomplete="new-password" minlength="8">
        </div>
        <button type="submit" class="btn btn-primary btn-lg" id="submit-btn" style="width:100%;justify-content:center;margin-top:4px;">
          <span id="btn-text">Create account</span>
          <span id="btn-spinner" class="spinner" style="display:none;width:16px;height:16px;border-width:2px;"></span>
        </button>
      </form>

      <hr class="auth-divider">
      <div style="font-size:12.5px;color:var(--text-3);text-align:center;">
        Already have an account? <a href="/login" style="color:var(--accent);text-decoration:none;">Sign in</a>
      </div>
    </div>
    <div class="auth-footer">
      Adlytic Ads Intelligence Platform
    </div>
  </div>

  <script>
    if (localStorage.getItem('adlytic_token')) {
      window.location.href = '/dashboard';
    }

    const form    = document.getElementById('register-form');
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
    function setLoading(on) {
      btn.disabled = on;
      btnText.textContent = on ? 'Creating account…' : 'Create account';
      btnSpin.style.display = on ? 'inline-block' : 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name     = document.getElementById('name').value.trim();
      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) { showError('Email and password are required.'); return; }
      if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }

      setLoading(true);
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Registration failed. Please try again.');
          setLoading(false);
          return;
        }

        localStorage.setItem('adlytic_token', data.token);
        if (data.workspaceId) localStorage.setItem('adlytic_workspace_id', data.workspaceId);

        sucEl.textContent = 'Account created! Redirecting to dashboard…';
        sucEl.style.display = 'flex';
        setTimeout(() => { window.location.href = '/dashboard'; }, 800);

      } catch (err) {
        showError('Network error. Please try again.');
        setLoading(false);
      }
    });

    document.getElementById('name').focus();
  </script>
</body>
</html>`;
}
