// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminSessionSyncPage.ts
//
//  Served by GET /admin* when the SESSION COOKIE is missing or invalid.
//
//  WHY THIS EXISTS
//  The app authenticates two ways at once: the SPA keeps a JWT in
//  localStorage, and the server-rendered /admin gate reads an HttpOnly
//  cookie. The two desynchronize legitimately — the cookie expires on its
//  own 30-day clock, a tokenVersion bump kills it, logout used to clear
//  only localStorage — and when they do, a user whose SPA session is
//  perfectly valid gets bounced from /admin to /login. That bounce was the
//  operator's "clicking the admin item logs me out" bug.
//
//  This page heals the desync instead of punting: if a bearer token exists
//  in localStorage, it asks the server to re-issue the cookie from it
//  (POST /api/auth/session-cookie — bearer-gated, same revocation check as
//  every API call), then reloads the original URL. No token → /login.
//
//  LOOP GUARD: one attempt per browser tab (sessionStorage). If the reload
//  still lands here, the bearer is dead too and /login is correct. The
//  console clears the guard after a successful admin load so a future
//  desync can heal again.
//
//  Leaks nothing: no admin markup, no data, no email — just a spinner.
// ════════════════════════════════════════════════════════════════════════

export function adminSessionSyncPage(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Adlytic — التحقق من الجلسة</title>
  <style>
    html, body { height: 100%; margin: 0; background: #f4f7f4; color: #4a5a50;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .gate { height: 100%; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px; font-size: 14px; font-weight: 600; }
    .spin { width: 28px; height: 28px; border: 3px solid #d7e0d9; border-top-color: #1d4b39;
      border-radius: 50%; animation: s 0.7s linear infinite; }
    @keyframes s { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="gate"><div class="spin"></div><div>جارٍ التحقق من الجلسة…</div></div>
  <script>
  (function () {
    var t = null;
    try { t = localStorage.getItem('adlytic_token'); } catch (e) {}
    var tried = false;
    try { tried = sessionStorage.getItem('adm_sync') === '1'; } catch (e) {}
    if (!t || tried) { location.replace('/login'); return; }
    try { sessionStorage.setItem('adm_sync', '1'); } catch (e) {}
    fetch('/api/auth/session-cookie', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t },
    }).then(function (r) {
      if (r.ok) { location.replace(location.pathname + location.hash); }
      else { location.replace('/login'); }
    }, function () { location.replace('/login'); });
  })();
  </script>
</body>
</html>`;
}
