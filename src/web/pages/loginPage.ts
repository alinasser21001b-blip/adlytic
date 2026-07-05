// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/loginPage.ts  —  Login page
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';
import { AUTH_STYLES, logoSvg } from './authShared';

export function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#100E0D">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>تسجيل الدخول — Adlytic</title>
  <style>
    ${SHARED_CSS}
    ${AUTH_STYLES}
  </style>
</head>
<body>
  <div id="toast-container"></div>

  <!-- Ambient glow -->
  <div class="auth-ambient"></div>

  <div class="auth-page">
    <!-- Left: brand panel -->
    <div class="auth-brand">
      <div class="auth-brand-inner">
        ${logoSvg(56)}
        <h1 class="auth-brand-title">Adlytic</h1>
        <p class="auth-brand-tagline">ذكاء إعلاني يقود نموّك</p>
        <div class="auth-brand-features">
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">تحليل فوري</div>
              <div class="auth-feature-desc">رؤى أداء حملاتك لحظة بلحظة</div>
            </div>
          </div>
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93M8 6a4 4 0 018 0M12 22v-4"/><circle cx="12" cy="14" r="4"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">مساعد ذكي</div>
              <div class="auth-feature-desc">استشارات فورية بالعربية من مدير تسويق AI</div>
            </div>
          </div>
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">حماية ميزانيتك</div>
              <div class="auth-feature-desc">كشف الإنفاق المريب وتنبيهات استباقية</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: form -->
    <div class="auth-form-side">
      <div class="auth-form-wrap">
        <div class="auth-mobile-logo">
          ${logoSvg(40)}
          <span class="auth-mobile-logo-text">Adlytic</span>
        </div>

        <div class="auth-card">
          <div class="auth-card-header">
            <h2 class="auth-title">مرحباً بعودتك</h2>
            <p class="auth-subtitle">سجّل الدخول إلى حسابك</p>
          </div>

          <div id="error-msg" class="alert alert-error"></div>
          <div id="success-msg" class="alert alert-success"></div>

          <form id="login-form">
            <div class="form-group">
              <label class="form-label" for="email">البريد الإلكتروني</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M22 7l-10 6L2 7"/></svg>
                <input type="email" id="email" class="form-input has-icon" placeholder="you@company.com" required autocomplete="email" dir="ltr">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="password">كلمة المرور</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <input type="password" id="password" class="form-input has-icon" placeholder="••••••••" required autocomplete="current-password" dir="ltr">
              </div>
            </div>
            <button type="submit" class="auth-submit" id="submit-btn">
              <span id="btn-text">تسجيل الدخول</span>
              <span id="btn-spinner" class="spinner" style="display:none;width:16px;height:16px;border-width:2px;"></span>
              <svg class="auth-submit-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
          </form>

          <div class="auth-alt">
            ليس لديك حساب؟ <a href="/register">أنشئ حساباً</a>
          </div>
        </div>

        <div class="auth-footer">
          <span class="auth-footer-dot"></span>
          Adlytic Ads Intelligence Platform
        </div>
      </div>
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
      btn.classList.toggle('loading', on);
      btnText.textContent = on ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول';
      btnSpin.style.display = on ? 'inline-block' : 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) { showError('يرجى ملء جميع الحقول.'); return; }

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
          showError(data.error || 'فشل تسجيل الدخول. تحقق من بياناتك.');
          setLoading(false);
          return;
        }

        localStorage.setItem('adlytic_token', data.token);
        const firstWs = data.user?.memberships?.[0]?.workspaceId;

        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + data.token }
        });
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.isActive === false) {
            showSuccess('تم تسجيل الدخول! جارٍ التحويل…');
            setTimeout(() => { window.location.href = '/pending-activation'; }, 400);
            return;
          }
          const wsId = me.memberships?.[0]?.workspaceId;
          if (wsId) localStorage.setItem('adlytic_workspace_id', wsId);
          else if (firstWs) localStorage.setItem('adlytic_workspace_id', firstWs);
        } else if (firstWs) {
          localStorage.setItem('adlytic_workspace_id', firstWs);
        }

        showSuccess('تم تسجيل الدخول بنجاح! جارٍ التحويل…');
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
        showError('خطأ في الشبكة. حاول مرة أخرى.');
        setLoading(false);
      }
    });

    document.getElementById('email').focus();
  </script>
</body>
</html>`;
}
