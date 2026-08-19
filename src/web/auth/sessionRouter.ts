// ════════════════════════════════════════════════════════════════════════
//  src/web/auth/sessionRouter.ts — ONE routing truth for identity.
//
//  THE DEFECT THIS EXISTS TO KILL
//  Post-login routing was implemented independently in several pages, and
//  every one of them asked "is this user active?" while none asked "is this
//  user a platform admin?". An admin who also holds a workspace membership
//  was therefore routed exactly like a customer: workspace selected, ad
//  accounts inspected, dropped on /dashboard — and then invited to connect
//  Meta for an identity that must never own an ad account.
//
//  The fix is not another redirect in another page. It is a single
//  decision, imported by every page that makes one, so the next page cannot
//  reintroduce the bug by forgetting a branch.
//
//  SECURITY BOUNDARY — READ THIS BEFORE EDITING
//  Everything here is NAVIGATION, not authorisation. The session-mode hint
//  in localStorage is a UX breadcrumb an attacker can set with one line in
//  a console. Authority lives in requirePlatformAdmin() on the server, which
//  re-derives admin status from PLATFORM_ADMIN_EMAILS and the token version
//  on every single admin call. Nothing in this file may ever be used to
//  decide what data a request is allowed to return.
//
//  Emitted as a JS string because pages are server-rendered template
//  literals with no bundler — the repository's existing pattern.
//  Remember: a lone backslash is eaten at cook time.
// ════════════════════════════════════════════════════════════════════════

/** Browser keys that belong to a CUSTOMER session and must not survive an
 *  identity switch. Deliberately explicit: blindly clearing storage would
 *  also destroy unrelated preferences a returning user expects to keep. */
export const CUSTOMER_SESSION_KEYS = [
  'adlytic_workspace_id',
  'adlytic_dash_mode',
  'adlytic_main_chart_metric',
  'adlytic_token_decrypt_banner_dismissed',
] as const;

/** Keys that are pure presentation and survive any switch. */
export const NEUTRAL_KEYS = ['adlytic_density', 'adlytic_cmd_hint_v1'] as const;

export const SESSION_ROUTER_JS = `
(function () {
  var CUSTOMER_KEYS = ${JSON.stringify(CUSTOMER_SESSION_KEYS)};

  function tok() { try { return localStorage.getItem('adlytic_token'); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /** Remove every customer-scoped key. Preferences (density, hints) survive. */
  function clearCustomerContext() {
    for (var i = 0; i < CUSTOMER_KEYS.length; i++) del(CUSTOMER_KEYS[i]);
    try { sessionStorage.removeItem('adm_sync'); } catch (e) {}
  }

  function clearSession() {
    clearCustomerContext();
    del('adlytic_token');
    del('adlytic_session_mode');
  }

  /**
   * Resolve who is holding this browser.
   *
   * Returns UNRESOLVED — never a role — when the network fails. A request
   * that did not complete is not evidence that an admin became a customer,
   * and treating it as such is what produced the bounce loop.
   */
  async function resolveSessionIdentity() {
    var t = tok();
    if (!t) return { kind: 'ANONYMOUS' };
    var res;
    try {
      res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    } catch (e) {
      return { kind: 'UNRESOLVED', reason: 'network' };
    }
    if (res.status === 401) { clearSession(); return { kind: 'ANONYMOUS' }; }
    if (!res.ok) return { kind: 'UNRESOLVED', reason: 'http ' + res.status };
    var me;
    try { me = await res.json(); } catch (e) { return { kind: 'UNRESOLVED', reason: 'parse' }; }

    // ORDER IS THE FIX. Admin outranks activation, which outranks customer.
    // A platform admin whose own user row is inactive is still an admin:
    // admin status lives in PLATFORM_ADMIN_EMAILS, not in isActive.
    if (me && me.isPlatformAdmin === true) return { kind: 'ADMIN', me: me };
    if (me && me.isActive === false) return { kind: 'PENDING', me: me };
    return { kind: 'CUSTOMER', me: me };
  }

  /** Adopt an admin identity: no workspace is ever selected for an admin. */
  function adoptAdminSession(token) {
    if (token) set('adlytic_token', token);
    clearCustomerContext();
    set('adlytic_session_mode', 'admin');
  }

  function adoptCustomerSession(token, workspaceId) {
    if (token) set('adlytic_token', token);
    set('adlytic_session_mode', 'customer');
    if (workspaceId) set('adlytic_workspace_id', workspaceId);
  }

  /** The single post-login destination decision. */
  function destinationFor(identity) {
    if (identity.kind === 'ADMIN') return '/admin';
    if (identity.kind === 'PENDING') return '/pending-activation';
    if (identity.kind === 'CUSTOMER') return '/dashboard';
    return '/login';
  }

  /**
   * Guard an ADMIN surface. Resolves before any admin chrome is revealed.
   * onReady(me) runs only for a confirmed admin.
   */
  async function requireAdminSurface(onReady, onBlocked) {
    var id = await resolveSessionIdentity();
    if (id.kind === 'ADMIN') { adoptAdminSession(null); onReady(id.me); return; }
    if (id.kind === 'ANONYMOUS') { window.location.replace('/admin/login'); return; }
    if (id.kind === 'UNRESOLVED') {
      // NOT a demotion. Show a retry gate and stay put.
      if (onBlocked) onBlocked('UNRESOLVED', id.reason);
      return;
    }
    // A real, confirmed customer on an admin surface.
    window.location.replace('/dashboard');
  }

  /** Guard a CUSTOMER surface: a confirmed admin is sent home to /admin. */
  async function requireCustomerSurface(onReady, onBlocked) {
    var id = await resolveSessionIdentity();
    if (id.kind === 'CUSTOMER') { onReady(id.me); return; }
    if (id.kind === 'ADMIN') { adoptAdminSession(null); window.location.replace('/admin'); return; }
    if (id.kind === 'PENDING') { window.location.replace('/pending-activation'); return; }
    if (id.kind === 'ANONYMOUS') { window.location.replace('/login'); return; }
    if (onBlocked) onBlocked('UNRESOLVED', id.reason);
  }

  window.AdlyticSession = {
    resolveSessionIdentity: resolveSessionIdentity,
    adoptAdminSession: adoptAdminSession,
    adoptCustomerSession: adoptCustomerSession,
    clearCustomerContext: clearCustomerContext,
    clearSession: clearSession,
    destinationFor: destinationFor,
    requireAdminSurface: requireAdminSurface,
    requireCustomerSurface: requireCustomerSurface,
    CUSTOMER_KEYS: CUSTOMER_KEYS
  };
})();
`;
