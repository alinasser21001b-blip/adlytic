// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/ownerPage.ts  —  Owner Mode dashboard
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';
import { AUTH_STYLES, logoSvg } from './authShared';

export function ownerPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#100E0D">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>وضع المالك — Adlytic</title>
  <style>
    ${SHARED_CSS}
    ${AUTH_STYLES}
  </style>
</head>
<body>
  <div id="toast-container"></div>
  <div class="auth-ambient"></div>
  <div class="auth-page">
    <div class="auth-brand">
      <div class="auth-brand-inner">
        ${logoSvg(56)}
        <h1 class="auth-brand-title">وضع المالك</h1>
        <p class="auth-brand-tagline">لوحة التحكم الخاصة بك</p>
        <div class="auth-brand-features">
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">إدارة المنتجات</div>
              <div class="auth-feature-desc">تعديل الأسعار والصور والتوفرية</div>
            </div>
          </div>
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">مراقبة التحليلات</div>
              <div class="auth-feature-desc">رؤى على استخدام المستشار والتحويلات</div>
            </div>
          </div>
          <div class="auth-feature">
            <div class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            </div>
            <div>
              <div class="auth-feature-title">تخزين آمن</div>
              <div class="auth-feature-desc">جميع بياناتك مشفرة وآمنة</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="auth-form-side">
      <div class="auth-form-wrap">
        <div class="auth-mobile-logo">
          ${logoSvg(40)}
          <span class="auth-mobile-logo-text">المالك</span>
        </div>

        <div class="auth-card">
          <div class="auth-card-header">
            <h2 class="auth-title">تسجيل الدخول</h2>
            <p class="auth-subtitle">أدخل رمز PIN للوصول لوضع المالك</p>
          </div>

          <form id="owner-form" class="auth-form">
            <div class="auth-field">
              <label class="auth-label">رمز PIN</label>
              <input
                type="password"
                id="pin-input"
                placeholder="أدخل الرمز"
                class="auth-input"
                inputmode="numeric"
                maxlength="6"
              >
            </div>

            <button type="submit" class="auth-button">
              <span>دخول</span>
            </button>

            <div id="error-msg" class="auth-error" style="display: none;"></div>
            <div id="loading" class="auth-loading" style="display: none;">جاري التحقق...</div>
          </form>

          <div class="auth-footer">
            <p style="font-size: 12px; color: #999; text-align: center;">
              اتصل بدعم العملاء إذا نسيت الرمز
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById('owner-form');
    const pinInput = document.getElementById('pin-input');
    const errorMsg = document.getElementById('error-msg');
    const loadingEl = document.getElementById('loading');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      loadingEl.style.display = 'block';

      const pin = pinInput.value.trim();
      if (!pin) {
        showError('أدخل الرمز');
        return;
      }

      try {
        const res = await fetch('/.netlify/functions/owner-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('owner_token', data.token);
          localStorage.setItem('owner_token_expires', data.expiresAt);
          window.location.href = '/owner/dashboard';
        } else {
          const err = await res.json();
          showError(err.error || 'فشل التحقق');
        }
      } catch (err) {
        showError('خطأ في الاتصال');
      } finally {
        loadingEl.style.display = 'none';
      }
    });

    function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.style.display = 'block';
    }
  </script>
</body>
</html>`;
}
