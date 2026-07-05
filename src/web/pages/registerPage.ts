// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/registerPage.ts  —  Registration page
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function registerPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#100E0D">
  <title>إنشاء حساب — Adlytic</title>
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
      <div class="auth-title">أنشئ حسابك</div>
      <div class="auth-subtitle">ابدأ بتحليل إعلانات Meta بالذكاء الاصطناعي</div>

      <div id="error-msg" class="alert alert-error"></div>
      <div id="success-msg" class="alert alert-success"></div>

      <form id="register-form">
        <div class="form-group">
          <label class="form-label" for="name">الاسم الكامل</label>
          <input type="text" id="name" class="form-input" placeholder="علي أحمد" autocomplete="name">
        </div>
        <div class="form-group">
          <label class="form-label" for="email">البريد الإلكتروني</label>
          <input type="email" id="email" class="form-input" placeholder="you@company.com" required autocomplete="email" dir="ltr">
        </div>
        <div class="form-group">
          <label class="form-label" for="password">كلمة المرور</label>
          <input type="password" id="password" class="form-input" placeholder="8 أحرف على الأقل" required autocomplete="new-password" minlength="8" dir="ltr">
        </div>
        <button type="submit" class="btn btn-primary btn-lg" id="submit-btn" style="width:100%;justify-content:center;margin-top:4px;">
          <span id="btn-text">إنشاء حساب</span>
          <span id="btn-spinner" class="spinner" style="display:none;width:16px;height:16px;border-width:2px;"></span>
        </button>
      </form>

      <hr class="auth-divider">
      <div style="font-size:12.5px;color:var(--text-3);text-align:center;">
        لديك حساب بالفعل؟ <a href="/login" style="color:var(--accent);text-decoration:none;">سجّل الدخول</a>
      </div>
    </div>
    <div class="auth-footer">
      Adlytic — منصة تحليل الإعلانات الذكية
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
        window.location.href = me.isActive === false ? '/pending-activation' : '/welcome';
      } catch (_) { /* stay on register */ }
    }
    redirectIfLoggedIn();

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
      btnText.textContent = on ? 'جارٍ إنشاء الحساب…' : 'إنشاء حساب';
      btnSpin.style.display = on ? 'inline-block' : 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name     = document.getElementById('name').value.trim();
      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) { showError('البريد الإلكتروني وكلمة المرور مطلوبان.'); return; }
      if (password.length < 8) { showError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.'); return; }

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
          showError(data.error || 'فشل إنشاء الحساب. حاول مرة أخرى.');
          setLoading(false);
          return;
        }

        localStorage.setItem('adlytic_token', data.token);
        if (data.workspaceId) localStorage.setItem('adlytic_workspace_id', data.workspaceId);

        sucEl.textContent = 'تم إنشاء الحساب! خطوة أخيرة…';
        sucEl.style.display = 'flex';
        setTimeout(() => { window.location.href = '/pending-activation'; }, 800);

      } catch (err) {
        showError('خطأ في الشبكة. حاول مرة أخرى.');
        setLoading(false);
      }
    });

    document.getElementById('name').focus();
  </script>
</body>
</html>`;
}
