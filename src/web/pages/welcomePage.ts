// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/welcomePage.ts
//
//  Phase 2 — frictionless onboarding welcome screen for new users who have
//  not connected a Meta ad account yet. Wires into the existing OAuth flow.
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function welcomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome — Adlytic</title>
  <style>
    ${SHARED_CSS}
    body {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: var(--bg);
      padding: 24px 16px;
    }
    .welcome-wrap { width: 100%; max-width: 520px; }
    .welcome-logo {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 32px; justify-content: center;
    }
    .welcome-logo-mark {
      width: 40px; height: 40px; background: var(--accent);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 17px; color: #fff;
    }
    .welcome-logo-text { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: var(--text); }
    .welcome-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 36px 32px;
    }
    .welcome-hero {
      text-align: center;
      margin-bottom: 28px;
    }
    .welcome-emoji { font-size: 44px; line-height: 1; margin-bottom: 14px; }
    .welcome-title {
      font-size: 24px; font-weight: 800; color: var(--text);
      letter-spacing: -0.5px; line-height: 1.25;
    }
    .welcome-subtitle {
      font-size: 14px; color: var(--text-2);
      margin-top: 8px; line-height: 1.55;
    }
    .welcome-benefits {
      display: flex; flex-direction: column; gap: 12px;
      margin-bottom: 28px;
    }
    .welcome-benefit {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 14px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .welcome-benefit-icon {
      width: 32px; height: 32px; flex-shrink: 0;
      background: var(--accent-dim);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
    }
    .welcome-benefit-title { font-size: 13.5px; font-weight: 600; color: var(--text); }
    .welcome-benefit-text { font-size: 12.5px; color: var(--text-2); margin-top: 2px; line-height: 1.45; }
    .meta-connect-btn {
      width: 100%; justify-content: center;
      padding: 12px 18px; font-size: 14px; font-weight: 600;
      background: #1877F2; border: none;
    }
    .meta-connect-btn:hover { background: #166fe5; }
    .meta-connect-btn svg { flex-shrink: 0; }
    .welcome-footer {
      text-align: center; margin-top: 20px;
      font-size: 12px; color: var(--text-3);
    }
    .welcome-skip {
      display: block; text-align: center; margin-top: 14px;
      font-size: 12.5px; color: var(--text-3);
    }
    .welcome-skip a { color: var(--text-2); }
    .welcome-skip a:hover { color: var(--text); }
    #error-msg { display: none; margin-bottom: 16px; }
    #connect-loading {
      display: none; align-items: center; justify-content: center;
      gap: 10px; margin-top: 14px;
      font-size: 13px; color: var(--text-2);
    }
    [dir="rtl"] .welcome-benefit { text-align: right; }
  </style>
</head>
<body>
  <div id="toast-container"></div>
  <div class="welcome-wrap">
    <div class="welcome-logo">
      <div class="welcome-logo-mark">A</div>
      <span class="welcome-logo-text">Adlytic</span>
    </div>
    <div class="welcome-card" id="welcome-card">
      <div class="welcome-hero">
        <div class="welcome-emoji">📊</div>
        <div class="welcome-title" id="welcome-title">Welcome to Adlytic</div>
        <div class="welcome-subtitle" id="welcome-subtitle">
          Connect your Meta Ads account to unlock AI-powered insights in minutes.
        </div>
      </div>

      <div id="error-msg" class="alert alert-error"></div>

      <div class="welcome-benefits" id="welcome-benefits">
        <div class="welcome-benefit">
          <div class="welcome-benefit-icon">⚡</div>
          <div>
            <div class="welcome-benefit-title" data-i18n="b1-title">Instant performance overview</div>
            <div class="welcome-benefit-text" data-i18n="b1-text">See spend, reach, and engagement across all campaigns.</div>
          </div>
        </div>
        <div class="welcome-benefit">
          <div class="welcome-benefit-icon">🧠</div>
          <div>
            <div class="welcome-benefit-title" data-i18n="b2-title">AI recommendations</div>
            <div class="welcome-benefit-text" data-i18n="b2-text">Get prioritized actions tailored to your ad account.</div>
          </div>
        </div>
        <div class="welcome-benefit">
          <div class="welcome-benefit-icon">🔒</div>
          <div>
            <div class="welcome-benefit-title" data-i18n="b3-title">Secure connection</div>
            <div class="welcome-benefit-text" data-i18n="b3-text">Your tokens are encrypted. We only read ad performance data.</div>
          </div>
        </div>
      </div>

      <button type="button" class="btn btn-primary meta-connect-btn" id="connect-meta-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
        <span id="connect-btn-label">Connect with Meta</span>
      </button>

      <div id="connect-loading">
        <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
        <span id="connect-loading-text">Redirecting to Meta…</span>
      </div>

      <div class="welcome-skip">
        <a href="/dashboard" id="skip-link">Skip for now</a>
      </div>
    </div>
    <div class="welcome-footer">Adlytic Ads Intelligence Platform</div>
  </div>

  <script>
    const I18N = {
      EN: {
        title: 'Welcome to Adlytic',
        subtitle: 'Connect your Meta Ads account to unlock AI-powered insights in minutes.',
        b1Title: 'Instant performance overview',
        b1Text: 'See spend, reach, and engagement across all campaigns.',
        b2Title: 'AI recommendations',
        b2Text: 'Get prioritized actions tailored to your ad account.',
        b3Title: 'Secure connection',
        b3Text: 'Your tokens are encrypted. We only read ad performance data.',
        connect: 'Connect with Meta',
        connecting: 'Redirecting to Meta…',
        skip: 'Skip for now',
        oauthExpired: 'That connection attempt expired. Please try again.',
        oauthMissing: 'Meta did not return the expected information. Please try again.',
        oauthNotConfigured: 'Meta connection is not set up on this server yet.',
        oauthNoAccounts: 'Meta login succeeded, but no ad account was granted. Assign at least one Ad Account in Meta Business Settings, then reconnect.',
        oauthDenied: 'Permission was not granted. Please approve access to connect.',
        oauthGeneric: 'Could not connect to Meta. Please try again.',
        metaUnavailable: 'Meta connection is temporarily unavailable.',
      },
      AR: {
        title: 'مرحباً بك في Adlytic',
        subtitle: 'اربط حساب إعلانات Meta لتحصل على رؤى ذكية خلال دقائق.',
        b1Title: 'نظرة فورية على الأداء',
        b1Text: 'تابع الإنفاق والوصول والتفاعل لكل الحملات.',
        b2Title: 'توصيات ذكية',
        b2Text: 'احصل على إجراءات مقترحة مخصّصة لحسابك الإعلاني.',
        b3Title: 'اتصال آمن',
        b3Text: 'بيانات الدخول مشفّرة — نقرأ أداء الإعلانات فقط.',
        connect: 'الربط مع Meta',
        connecting: 'جاري التحويل إلى Meta…',
        skip: 'تخطي الآن',
        oauthExpired: 'انتهت صلاحية محاولة الربط. حاول مرة أخرى.',
        oauthMissing: 'لم يُرجع Meta المعلومات المتوقعة. حاول مرة أخرى.',
        oauthNotConfigured: 'ربط Meta غير مُعدّ على هذا الخادم بعد.',
        oauthNoAccounts: 'نجح تسجيل الدخول لكن لم يُمنح أي حساب إعلاني. عيّن حساباً في إعدادات Meta Business ثم أعد الربط.',
        oauthDenied: 'لم تتم الموافقة على الأذونات. وافق على الوصول للمتابعة.',
        oauthGeneric: 'تعذّر الربط مع Meta. حاول مرة أخرى.',
        metaUnavailable: 'ربط Meta غير متاح مؤقتاً.',
      },
    };

    let locale = 'EN';

    function t(key) {
      const pack = I18N[locale] || I18N.EN;
      return pack[key] || I18N.EN[key] || key;
    }

    function applyLocale() {
      const isAr = locale === 'AR';
      document.documentElement.lang = isAr ? 'ar' : 'en';
      document.documentElement.dir = isAr ? 'rtl' : 'ltr';
      document.getElementById('welcome-title').textContent = t('title');
      document.getElementById('welcome-subtitle').textContent = t('subtitle');
      document.getElementById('connect-btn-label').textContent = t('connect');
      document.getElementById('connect-loading-text').textContent = t('connecting');
      document.getElementById('skip-link').textContent = t('skip');
      const map = [
        ['b1-title', 'b1Title'], ['b1-text', 'b1Text'],
        ['b2-title', 'b2Title'], ['b2-text', 'b2Text'],
        ['b3-title', 'b3Title'], ['b3-text', 'b3Text'],
      ];
      map.forEach(([attr, key]) => {
        const el = document.querySelector('[data-i18n="' + attr + '"]');
        if (el) el.textContent = t(key);
      });
    }

    function showError(msg) {
      const el = document.getElementById('error-msg');
      el.textContent = msg;
      el.style.display = 'flex';
    }

    function friendlyOAuthError(code) {
      if (code === 'expired_state') return t('oauthExpired');
      if (code === 'missing_params') return t('oauthMissing');
      if (code === 'not_configured') return t('oauthNotConfigured');
      if (code === 'no_ad_accounts_granted' || /no ad accounts? (was|were) granted|0 ad accounts/i.test(code)) {
        return t('oauthNoAccounts');
      }
      if (/permissions?|denied|access_denied/i.test(code)) return t('oauthDenied');
      return t('oauthGeneric');
    }

  (async () => {
    const token = localStorage.getItem('adlytic_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    const wsId = localStorage.getItem('adlytic_workspace_id');
    if (!wsId) {
      window.location.href = '/login';
      return;
    }

    try {
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!meRes.ok) {
        localStorage.removeItem('adlytic_token');
        window.location.href = '/login';
        return;
      }
      const me = await meRes.json();
      locale = (me.locale || 'EN').toUpperCase();
      applyLocale();

      const wsRes = await fetch('/api/workspaces/' + wsId, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (wsRes.ok) {
        const ws = await wsRes.json();
        if (ws.adAccounts && ws.adAccounts.length > 0) {
          window.location.href = '/dashboard';
          return;
        }
      }
    } catch (e) {
      console.warn('[welcome] init check failed:', e);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_error')) {
      const code = decodeURIComponent(params.get('oauth_error'));
      showError(friendlyOAuthError(code));
      window.history.replaceState({}, '', '/welcome');
    }

    document.getElementById('connect-meta-btn').addEventListener('click', async () => {
      const btn = document.getElementById('connect-meta-btn');
      const loading = document.getElementById('connect-loading');
      document.getElementById('error-msg').style.display = 'none';
      btn.disabled = true;
      loading.style.display = 'flex';

      try {
        const res = await fetch('/api/meta/oauth/start?workspaceId=' + encodeURIComponent(wsId), {
          headers: { Authorization: 'Bearer ' + token },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || t('metaUnavailable'));
        }
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error(t('metaUnavailable'));
      } catch (e) {
        showError(e.message || t('metaUnavailable'));
        btn.disabled = false;
        loading.style.display = 'none';
      }
    });
  })();
  </script>
</body>
</html>`;
}
