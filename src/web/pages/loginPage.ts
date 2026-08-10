// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/loginPage.ts  —  Login page
// ════════════════════════════════════════════════════════════════════════

import { BASE_CSS_PATH, FLOORS_CSS_PATH } from '../layout';
import { AUTH_STYLES, logoSvg } from './authShared';

/**
 * PHASE 13 — auth form behaviour on a phone.
 *
 * Shared by /login and /register (registerPage imports it from here). It is
 * emitted AFTER MOBILE_FLOORS_CSS so it can build on the 44px / 16px floors
 * rather than fight them: nothing below re-declares input font-size or
 * min-height, it only fixes what the floors cannot reach.
 *
 * Three real failures on a phone, each addressed once:
 *
 *   1. THE SUBMIT BUTTON DISAPPEARS. .auth-page is min-height:100vh with the
 *      form vertically centred. Open the keyboard and the visual viewport
 *      halves, but 100vh does not — so the card stays centred against the
 *      FULL height and its lower half, including the submit button, sits
 *      behind the keyboard with nothing to scroll to. Anchoring to the top on
 *      short viewports makes the button reachable by scrolling.
 *   2. THE ERROR IS ABOVE THE FOLD YOU ARE LOOKING AT. A single alert at the
 *      top of the card is off-screen while the keyboard is open and the user
 *      is looking at the field they just got wrong. Per-field messages put
 *      the message where the mistake is.
 *   3. NO VISIBLE FOCUS. The floors do not style focus. A 3px accent ring
 *      plus :focus-visible on the buttons makes the caret position obvious.
 */
export const AUTH_FORM_MOBILE_CSS = `
/* Focus is a state the user must be able to SEE, not infer from the caret. */
.form-input:focus-visible,
.auth-submit:focus-visible,
.pw-toggle:focus-visible,
.auth-alt a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Password field + reveal control. The control is a real 44px target inside
   the field's padding, not an 18px glyph overlapping the text. */
.pw-wrap { position: relative; }
/* PHYSICAL sides, deliberately. Three things share this one field and they
   do not agree on what "start" means:
     · the lock icon is pinned with right:14px (physical);
     · the toggle is positioned against .pw-wrap, which is RTL;
     · the input itself carries dir="ltr" so a password never reorders,
       which flips ITS inline axis relative to its own wrapper.
   Logical properties gave the toggle the wrapper's left edge and the
   padding the input's right edge — the control ended up sitting on the
   text it was supposed to sit beside. Physical sides make the three
   agree: lock on the right, reveal on the left, padding for each. */
.pw-wrap .form-input { padding-left: 56px; }
.pw-toggle {
  position: absolute; left: 4px; top: 50%;
  transform: translateY(-50%);
  min-width: 44px; min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-3); font-size: 12px; font-weight: 700;
  border-radius: 8px;
}
.pw-toggle:active { color: var(--accent); }

/* Per-field validation. Hidden until a field actually fails. */
.field-error {
  display: none;
  font-size: 12px; line-height: 1.5; color: var(--error);
  margin-top: 6px;
}
.field-error.is-shown { display: block; }
.form-input[aria-invalid="true"] {
  border-color: var(--error);
  box-shadow: 0 0 0 3px var(--error-dim);
}

/* The banner alerts announce themselves and stay legible at the text floor. */
#error-msg, #success-msg { font-size: 13px; }

/* MEASURED, not assumed. test_mobile_viewport reported the primary CTA at
   250x40 and the "create an account" link at 64x15 on every phone width.
   MOBILE_FLOORS_CSS never reaches either: the submit is .auth-submit (not
   .btn) and the link is a bare <a> inside .auth-alt. Both are the single most
   important target on their screen. */
.auth-submit { min-height: 44px; }
.auth-alt a {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding-inline: 8px;
}

@media (max-width: 900px) {
  /* Safe area: the card must clear the home indicator when the page is
     scrolled to the bottom. */
  .auth-form-side {
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }
}

/* Keyboard open (or a short phone in landscape): stop centring, start at the
   top, and let the page scroll to the submit button. dvh tracks the visual
   viewport where it is supported; the 100vh above it remains the fallback. */
@media (max-height: 640px) {
  .auth-page { min-height: auto; }
  .auth-form-side { align-items: flex-start; padding-top: 20px; }
  .auth-mobile-logo { margin-bottom: 18px; }
  .auth-card-header { margin-bottom: 18px; }
}
@supports (height: 100dvh) {
  .auth-page { min-height: 100dvh; }
}
`;

export function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#F2F7F4">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>تسجيل الدخول — Adlytic</title>
  <link rel="stylesheet" href="${BASE_CSS_PATH}">
  <style>
    ${AUTH_STYLES}
    ${AUTH_FORM_MOBILE_CSS}
  </style>
  <link rel="stylesheet" href="${FLOORS_CSS_PATH}">
</head>
<body>
  <div id="toast-container"></div>

  <!-- Ambient glow -->
  <div class="auth-ambient"></div>

  <div class="auth-page">
    <!-- Left: brand panel -->
    <div class="auth-brand">
      <div class="auth-brand-inner">
        ${logoSvg(56, 'login-brand')}
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
          ${logoSvg(40, 'login-mobile')}
          <span class="auth-mobile-logo-text">Adlytic</span>
        </div>

        <div class="auth-card">
          <div class="auth-card-header">
            <h2 class="auth-title">مرحباً بعودتك</h2>
            <p class="auth-subtitle">سجّل الدخول إلى حسابك</p>
          </div>

          <div id="error-msg" class="alert alert-error" role="alert" aria-live="assertive"></div>
          <div id="success-msg" class="alert alert-success" role="status" aria-live="polite"></div>

          <form id="login-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="email">البريد الإلكتروني</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M22 7l-10 6L2 7"/></svg>
                <input type="email" id="email" class="form-input has-icon" placeholder="you@company.com" required
                       autocomplete="email" inputmode="email" enterkeyhint="next"
                       autocapitalize="none" autocorrect="off" spellcheck="false"
                       aria-describedby="email-error" dir="ltr">
              </div>
              <div class="field-error" id="email-error"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="password">كلمة المرور</label>
              <div class="input-wrap pw-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <input type="password" id="password" class="form-input has-icon" placeholder="••••••••" required
                       autocomplete="current-password" enterkeyhint="go"
                       autocapitalize="none" autocorrect="off" spellcheck="false"
                       aria-describedby="password-error" dir="ltr">
                <button type="button" class="pw-toggle" id="pw-toggle" aria-controls="password" aria-pressed="false">إظهار</button>
              </div>
              <div class="field-error" id="password-error"></div>
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

    // ── Per-field validation ────────────────────────────────────────────
    // The banner alert sits at the top of the card. With the keyboard open on
    // a phone it is off-screen while the user stares at the field they got
    // wrong, so every failure is ALSO written next to its own input, the
    // input is marked aria-invalid, and the first offender is focused and
    // scrolled into the visible band.
    function fieldError(id, msg) {
      var input = document.getElementById(id);
      var slot  = document.getElementById(id + '-error');
      if (!input || !slot) return;
      if (msg) {
        slot.textContent = msg;
        slot.classList.add('is-shown');
        input.setAttribute('aria-invalid', 'true');
      } else {
        slot.textContent = '';
        slot.classList.remove('is-shown');
        input.removeAttribute('aria-invalid');
      }
    }
    function clearFieldErrors() {
      ['email', 'password'].forEach(function (id) { fieldError(id, ''); });
    }
    function focusFirstInvalid() {
      var first = document.querySelector('.form-input[aria-invalid="true"]');
      if (!first) return;
      try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      first.focus();
    }

    ['email', 'password'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () { fieldError(id, ''); });
    });

    // Reveal control: a 44px target, and its label says what it will DO.
    var pwToggle = document.getElementById('pw-toggle');
    if (pwToggle) {
      pwToggle.addEventListener('click', function () {
        var pw = document.getElementById('password');
        var reveal = pw.type === 'password';
        pw.type = reveal ? 'text' : 'password';
        pwToggle.textContent = reveal ? 'إخفاء' : 'إظهار';
        pwToggle.setAttribute('aria-pressed', reveal ? 'true' : 'false');
        pw.focus();
      });
    }

    function showError(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'flex';
      sucEl.style.display = 'none';
      try { errEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
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

      clearFieldErrors();
      var invalid = false;
      if (!email) { fieldError('email', 'أدخل بريدك الإلكتروني.'); invalid = true; }
      else if (email.indexOf('@') < 1 || email.indexOf('.', email.indexOf('@')) < 0) {
        fieldError('email', 'صيغة البريد الإلكتروني غير صحيحة.'); invalid = true;
      }
      if (!password) { fieldError('password', 'أدخل كلمة المرور.'); invalid = true; }
      if (invalid) { showError('راجع الحقول المعلّمة بالأحمر.'); focusFirstInvalid(); return; }

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

        // ── Full client-state reset before adopting the new identity ──────
        // Switching accounts must not inherit ANY state from a previous
        // session (token, workspace, cached selections, sync state, service
        // worker shell caches). Otherwise a stale workspaceId or cached page
        // could mix data between accounts. Clear everything, THEN set the new
        // identity as the single source of truth.
        try {
          const keep = new Set();
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.indexOf('adlytic_') === 0 && !keep.has(k)) localStorage.removeItem(k);
          }
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k.indexOf('adlytic_') === 0) sessionStorage.removeItem(k);
          }
          // Defensively expire any legacy session cookie (server no longer reads it).
          document.cookie = 'adlytic_session=; Path=/; Max-Age=0; SameSite=Lax';
          // Drop cached HTML shells so the next account never sees a prior shell.
          if (window.caches && caches.keys) {
            caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
          }
        } catch (e) { /* storage may be unavailable; non-fatal */ }

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

    // Autofocus only where a keyboard is already present. On a phone,
    // focusing on load throws the software keyboard up over the page before
    // the merchant has seen it, and on iOS also zooms and re-anchors the
    // scroll position.
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      document.getElementById('email').focus();
    }
  </script>
</body>
</html>`;
}
