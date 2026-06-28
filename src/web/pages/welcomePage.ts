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
    .welcome-topbar {
      display: flex; align-items: center; justify-content: flex-end; gap: 12px;
      margin-bottom: 20px; font-size: 13px;
    }
    .welcome-topbar a {
      color: var(--text-2); text-decoration: none; font-weight: 500;
      padding: 6px 12px; border-radius: var(--radius-sm);
      transition: color var(--transition), background var(--transition);
    }
    .welcome-topbar a:hover { color: var(--text); background: var(--surface-2); }
    .welcome-topbar a.welcome-topbar-primary {
      color: #fff; background: var(--accent);
    }
    .welcome-topbar a.welcome-topbar-primary:hover { background: #4f46e5; color: #fff; }
    .welcome-signed-in {
      display: none; font-size: 12.5px; color: var(--text-2); text-align: center;
      margin-bottom: 16px; line-height: 1.5;
    }
    .welcome-signed-in a { color: var(--accent); text-decoration: none; }
    .welcome-signed-in a:hover { color: var(--accent-2); }
    .welcome-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .welcome-email-btn {
      width: 100%; justify-content: center;
      padding: 12px 18px; font-size: 14px; font-weight: 600;
    }
    .welcome-register-btn {
      width: 100%; justify-content: center;
      padding: 12px 18px; font-size: 14px; font-weight: 600;
    }
    .welcome-or {
      display: flex; align-items: center; gap: 12px;
      margin: 4px 0 16px; font-size: 12px; color: var(--text-3); text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .welcome-or::before, .welcome-or::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }
    .welcome-meta-hint {
      font-size: 12px; color: var(--text-3); text-align: center; margin-top: 8px;
    }
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
    .welcome-manual-btn {
      width: 100%; justify-content: center;
      padding: 10px 18px; font-size: 13px; font-weight: 500;
      margin-top: 4px;
    }
    .welcome-divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
    .welcome-footer {
      text-align: center; margin-top: 20px;
      font-size: 12px; color: var(--text-3);
    }
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
    <div class="welcome-topbar" id="welcome-topbar">
      <a href="/login" id="topbar-login">Log in</a>
      <a href="/register" class="welcome-topbar-primary" id="topbar-register">Sign up</a>
    </div>
    <div class="welcome-logo">
      <div class="welcome-logo-mark">A</div>
      <span class="welcome-logo-text">Adlytic</span>
    </div>
    <div class="welcome-card" id="welcome-card">
      <div class="welcome-hero">
        <div class="welcome-emoji">📊</div>
        <div class="welcome-title" id="welcome-title">Welcome to Adlytic</div>
        <div class="welcome-subtitle" id="welcome-subtitle">
          Sign in to connect your Meta Ads account and unlock AI-powered insights.
        </div>
      </div>

      <div id="error-msg" class="alert alert-error"></div>

      <div class="welcome-signed-in" id="welcome-signed-in">
        <span id="signed-in-label">Signed in as</span>
        <strong id="signed-in-email"></strong>.
        <a href="#" id="switch-account-link">Use a different account</a>
      </div>

      <div class="welcome-actions" id="guest-actions">
        <a href="/login" class="btn btn-primary welcome-email-btn" id="manual-login-btn">Sign in with email</a>
        <a href="/register" class="btn btn-secondary welcome-register-btn" id="register-btn">Create account</a>
      </div>

      <div id="meta-section">
        <div class="welcome-or" id="welcome-or">or</div>
        <button type="button" class="btn btn-primary meta-connect-btn" id="connect-meta-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span id="connect-btn-label">Connect with Meta</span>
        </button>
        <div class="welcome-meta-hint" id="meta-hint">Sign in first, then connect your ad account.</div>
        <div id="connect-loading">
          <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
          <span id="connect-loading-text">Redirecting to Meta…</span>
        </div>
        <a href="/workspace?connect=manual" class="btn btn-ghost welcome-manual-btn" id="manual-connect-link" style="display:none;">
          <span id="manual-connect-label">Connect manually (access token)</span>
        </a>
      </div>

      <hr class="welcome-divider">

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
    </div>
    <div class="welcome-footer">Adlytic Ads Intelligence Platform</div>
  </div>

  <script>
    const I18N = {
      EN: {
        title: 'Welcome to Adlytic',
        subtitleGuest: 'Sign in to connect your Meta Ads account and unlock AI-powered insights.',
        subtitleAuth: 'Connect your Meta Ads account to unlock AI-powered insights.',
        b1Title: 'Instant performance overview',
        b1Text: 'See spend, reach, and engagement across all campaigns.',
        b2Title: 'AI recommendations',
        b2Text: 'Get prioritized actions tailored to your ad account.',
        b3Title: 'Secure connection',
        b3Text: 'Your tokens are encrypted. We only read ad performance data.',
        connect: 'Connect with Meta',
        signInEmail: 'Sign in with email',
        createAccount: 'Create account',
        topbarLogin: 'Log in',
        topbarRegister: 'Sign up',
        orDivider: 'or',
        metaHint: 'Sign in first, then connect your ad account.',
        signedInAs: 'Signed in as',
        switchAccount: 'Use a different account',
        connecting: 'Redirecting to Meta…',
        signInRequired: 'Please sign in first to connect Meta.',
        oauthExpired: 'That connection attempt expired. Please try again.',
        oauthMissing: 'Meta did not return the expected information. Please try again.',
        oauthNotConfigured: 'Meta connection is not set up on this server yet.',
        oauthNoAccounts: 'Meta login succeeded, but no ad account was granted. Assign at least one Ad Account in Meta Business Settings, then reconnect.',
        oauthDenied: 'Permission was not granted. Please approve access to connect.',
        oauthGeneric: 'Could not connect to Meta. Please try again.',
        metaUnavailable: 'Meta connection is temporarily unavailable.',
        manualConnect: 'Connect manually (access token)',
      },
      AR: {
        title: 'مرحباً بك في Adlytic',
        subtitleGuest: 'سجّل الدخول لربط حساب إعلانات Meta والحصول على رؤى ذكية.',
        subtitleAuth: 'اربط حساب إعلانات Meta لتحصل على رؤى ذكية خلال دقائق.',
        b1Title: 'نظرة فورية على الأداء',
        b1Text: 'تابع الإنفاق والوصول والتفاعل لكل الحملات.',
        b2Title: 'توصيات ذكية',
        b2Text: 'احصل على إجراءات مقترحة مخصّصة لحسابك الإعلاني.',
        b3Title: 'اتصال آمن',
        b3Text: 'بيانات الدخول مشفّرة — نقرأ أداء الإعلانات فقط.',
        connect: 'الربط مع Meta',
        signInEmail: 'تسجيل الدخول بالبريد',
        createAccount: 'إنشاء حساب',
        topbarLogin: 'تسجيل الدخول',
        topbarRegister: 'إنشاء حساب',
        orDivider: 'أو',
        metaHint: 'سجّل الدخول أولاً، ثم اربط حسابك الإعلاني.',
        signedInAs: 'مسجّل الدخول كـ',
        switchAccount: 'استخدام حساب آخر',
        connecting: 'جاري التحويل إلى Meta…',
        signInRequired: 'سجّل الدخول أولاً لربط Meta.',
        oauthExpired: 'انتهت صلاحية محاولة الربط. حاول مرة أخرى.',
        oauthMissing: 'لم يُرجع Meta المعلومات المتوقعة. حاول مرة أخرى.',
        oauthNotConfigured: 'ربط Meta غير مُعدّ على هذا الخادم بعد.',
        oauthNoAccounts: 'نجح تسجيل الدخول لكن لم يُمنح أي حساب إعلاني. عيّن حساباً في إعدادات Meta Business ثم أعد الربط.',
        oauthDenied: 'لم تتم الموافقة على الأذونات. وافق على الوصول للمتابعة.',
        oauthGeneric: 'تعذّر الربط مع Meta. حاول مرة أخرى.',
        metaUnavailable: 'ربط Meta غير متاح مؤقتاً.',
        manualConnect: 'الربط اليدوي بميتا',
      },
    };

    let locale = 'EN';
    let isAuthenticated = false;
    let userEmail = '';

    function t(key) {
      const pack = I18N[locale] || I18N.EN;
      return pack[key] || I18N.EN[key] || key;
    }

    function switchAccount(e) {
      if (e) e.preventDefault();
      localStorage.removeItem('adlytic_token');
      localStorage.removeItem('adlytic_workspace_id');
      window.location.href = '/login';
    }

    function applyLocale() {
      const isAr = locale === 'AR';
      document.documentElement.lang = isAr ? 'ar' : 'en';
      document.documentElement.dir = isAr ? 'rtl' : 'ltr';
      document.getElementById('welcome-title').textContent = t('title');
      document.getElementById('welcome-subtitle').textContent = isAuthenticated ? t('subtitleAuth') : t('subtitleGuest');
      document.getElementById('connect-btn-label').textContent = t('connect');
      document.getElementById('connect-loading-text').textContent = t('connecting');
      document.getElementById('manual-login-btn').textContent = t('signInEmail');
      document.getElementById('register-btn').textContent = t('createAccount');
      document.getElementById('topbar-login').textContent = t('topbarLogin');
      document.getElementById('topbar-register').textContent = t('topbarRegister');
      document.getElementById('welcome-or').textContent = t('orDivider');
      document.getElementById('meta-hint').textContent = t('metaHint');
      document.getElementById('signed-in-label').textContent = t('signedInAs') + ' ';
      document.getElementById('switch-account-link').textContent = t('switchAccount');
      document.getElementById('manual-connect-label').textContent = t('manualConnect');
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

    function setGuestMode() {
      isAuthenticated = false;
      userEmail = '';
      document.getElementById('guest-actions').style.display = 'flex';
      document.getElementById('welcome-topbar').style.display = 'flex';
      document.getElementById('welcome-or').style.display = 'flex';
      document.getElementById('meta-hint').style.display = 'block';
      document.getElementById('welcome-signed-in').style.display = 'none';
      document.getElementById('manual-connect-link').style.display = 'none';
      applyLocale();
    }

    function setAuthenticatedMode(email) {
      isAuthenticated = true;
      userEmail = email || '';
      document.getElementById('guest-actions').style.display = 'none';
      document.getElementById('welcome-topbar').style.display = 'none';
      document.getElementById('welcome-or').style.display = 'none';
      document.getElementById('meta-hint').style.display = 'none';
      document.getElementById('welcome-signed-in').style.display = 'block';
      document.getElementById('signed-in-email').textContent = userEmail;
      document.getElementById('manual-connect-link').style.display = 'flex';
      applyLocale();
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
    let token = localStorage.getItem('adlytic_token');
    let wsId = localStorage.getItem('adlytic_workspace_id');

    if (token) {
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (!meRes.ok) {
          localStorage.removeItem('adlytic_token');
          localStorage.removeItem('adlytic_workspace_id');
          token = null;
          wsId = null;
          setGuestMode();
        } else {
          const me = await meRes.json();
          if (me.isActive === false) {
            window.location.href = '/pending-activation';
            return;
          }
          locale = (me.locale || 'EN').toUpperCase();
          if (!wsId) {
            wsId = me.memberships?.[0]?.workspaceId || null;
            if (wsId) localStorage.setItem('adlytic_workspace_id', wsId);
          }

          if (wsId) {
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
          }
          setAuthenticatedMode(me.email || '');
        }
      } catch (e) {
        console.warn('[welcome] init check failed:', e);
        setGuestMode();
      }
    } else {
      setGuestMode();
    }

    document.getElementById('switch-account-link').addEventListener('click', switchAccount);

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

      const activeToken = localStorage.getItem('adlytic_token');
      const activeWsId = localStorage.getItem('adlytic_workspace_id');
      if (!activeToken || !activeWsId) {
        window.location.href = '/login';
        return;
      }

      btn.disabled = true;
      loading.style.display = 'flex';

      try {
        const res = await fetch('/api/meta/oauth/start?workspaceId=' + encodeURIComponent(activeWsId), {
          headers: { Authorization: 'Bearer ' + activeToken },
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
