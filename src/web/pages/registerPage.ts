// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/registerPage.ts  —  Registration page
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';
import { AUTH_STYLES, logoSvg } from './authShared';

export function registerPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#100E0D">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>إنشاء حساب — Adlytic</title>
  <style>
    ${SHARED_CSS}
    ${AUTH_STYLES}
  </style>
</head>
<body>
  <div id="toast-container"></div>

  <div class="auth-ambient"></div>

  <div class="auth-page">
    <!-- Brand panel -->
    <div class="auth-brand">
      <div class="auth-brand-inner">
        ${logoSvg(56)}
        <h1 class="auth-brand-title">Adlytic</h1>
        <p class="auth-brand-tagline">منصة ذكاء إعلاني تدير حملاتك على Meta بأسلوب احترافي — تحليلات عميقة، توصيات فورية، وحماية ذكية لميزانيتك.</p>
        <div class="auth-brand-features">
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 3v18"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">لوحة تحكم شاملة</div>
              <div class="auth-feature-desc">كل حساباتك الإعلانية في مكان واحد</div>
            </div>
          </div>
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">محادثة بالعربية</div>
              <div class="auth-feature-desc">اسأل بلغتك واحصل على إجابات دقيقة</div>
            </div>
          </div>
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">ذكاء إبداعي</div>
              <div class="auth-feature-desc">اكتشف أي محتوى يحقق أفضل أداء</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Form -->
    <div class="auth-form-side">
      <div class="auth-form-wrap">
        <div class="auth-mobile-logo">
          ${logoSvg(40)}
          <span class="auth-mobile-logo-text">Adlytic</span>
        </div>

        <div class="auth-card">
          <div class="auth-card-header">
            <h2 class="auth-title">أنشئ حسابك</h2>
            <p class="auth-subtitle">ابدأ بتحليل إعلاناتك بالذكاء الاصطناعي</p>
          </div>

          <div id="error-msg" class="alert alert-error"></div>
          <div id="success-msg" class="alert alert-success"></div>

          <form id="register-form">
            <div class="form-group">
              <label class="form-label" for="name">الاسم الكامل</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input type="text" id="name" class="form-input has-icon" placeholder="علي أحمد" autocomplete="name">
              </div>
            </div>
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
                <input type="password" id="password" class="form-input has-icon" placeholder="8 أحرف على الأقل" required autocomplete="new-password" minlength="8" dir="ltr">
              </div>
            </div>
            <button type="submit" class="auth-submit" id="submit-btn">
              <span id="btn-text">إنشاء حساب</span>
              <span id="btn-spinner" class="spinner" style="display:none;width:16px;height:16px;border-width:2px;"></span>
              <svg class="auth-submit-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
          </form>

          <div class="auth-alt">
            لديك حساب بالفعل؟ <a href="/login">سجّل الدخول</a>
          </div>
        </div>

        <div class="auth-footer">
          <span class="auth-footer-dot"></span>
          Adlytic — منصة تحليل الإعلانات الذكية
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
      btn.classList.toggle('loading', on);
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
