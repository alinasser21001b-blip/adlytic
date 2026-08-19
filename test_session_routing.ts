// ════════════════════════════════════════════════════════════════════════
//  test_session_routing.ts — identity routing invariants.
//
//  The recurring defect was never a styling problem: post-login routing was
//  implemented independently in several pages, and every copy asked "is the
//  user active?" while none asked "is the user a platform admin?". An admin
//  holding a workspace membership was therefore routed as a customer.
//
//  These checks run against the SHIPPED page sources and the shared router,
//  so a future page that reintroduces its own redirect fails the build.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { SESSION_ROUTER_JS, CUSTOMER_SESSION_KEYS } from './src/web/auth/sessionRouter';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

/** Run the router in a sandbox with a scripted /api/auth/me. */
function sandbox(meBody: unknown, opts: { status?: number; networkFail?: boolean } = {}) {
  const store: Record<string, string> = {};
  const nav: string[] = [];
  const ctx: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async () => {
      if (opts.networkFail) throw new Error('network down');
      return { ok: (opts.status ?? 200) < 400, status: opts.status ?? 200, json: async () => meBody };
    },
    window: {} as Record<string, unknown>,
  };
  ctx['window'] = { location: { replace: (u: string) => nav.push(u), href: '' } };
  vm.createContext(ctx);
  vm.runInContext(SESSION_ROUTER_JS.replace(/\bwindow\.AdlyticSession\b/g, 'window.AdlyticSession'), ctx);
  const S = (ctx['window'] as Record<string, unknown>)['AdlyticSession'] as Record<string, Function>;
  return { S, store, nav };
}

const ADMIN = { id: 'u', email: 'a@x', isActive: true, isPlatformAdmin: true, memberships: [{ workspaceId: 'w1' }] };
const CUSTOMER = { id: 'u', email: 'c@x', isActive: true, isPlatformAdmin: false, memberships: [{ workspaceId: 'w9' }] };
const INACTIVE = { id: 'u', email: 'p@x', isActive: false, isPlatformAdmin: false, memberships: [] };

async function main() {
  console.log('\n── 1. identity resolution ordering ──');
  {
    // The critical case: an admin who ALSO holds a membership. The old code
    // saw the membership and routed them as a customer.
    const a = sandbox(ADMIN); a.store['adlytic_token'] = 't';
    const idA = await a.S['resolveSessionIdentity']!();
    if (idA.kind !== 'ADMIN') bad(`admin WITH a workspace membership resolved as ${idA.kind}`);
    else ok('admin with a workspace membership resolves ADMIN, not CUSTOMER');

    const c = sandbox(CUSTOMER); c.store['adlytic_token'] = 't';
    if ((await c.S['resolveSessionIdentity']!()).kind !== 'CUSTOMER') bad('customer did not resolve CUSTOMER');
    else ok('customer resolves CUSTOMER');

    const p = sandbox(INACTIVE); p.store['adlytic_token'] = 't';
    if ((await p.S['resolveSessionIdentity']!()).kind !== 'PENDING') bad('inactive user did not resolve PENDING');
    else ok('inactive user resolves PENDING');

    const anon = sandbox(CUSTOMER);
    if ((await anon.S['resolveSessionIdentity']!()).kind !== 'ANONYMOUS') bad('no token did not resolve ANONYMOUS');
    else ok('no token resolves ANONYMOUS');
  }

  console.log('\n── 2. a network failure must not demote an admin ──');
  {
    const n = sandbox(ADMIN, { networkFail: true }); n.store['adlytic_token'] = 't';
    const id = await n.S['resolveSessionIdentity']!();
    if (id.kind !== 'UNRESOLVED') bad(`network failure resolved as ${id.kind} — an incomplete request is not evidence of a role`);
    else ok('network failure resolves UNRESOLVED, never a role');

    let blocked = false;
    await n.S['requireAdminSurface']!(() => { bad('admin surface opened on an unresolved identity'); },
      () => { blocked = true; });
    if (!blocked) bad('no retry gate shown on an unresolved identity');
    else ok('admin surface holds a retry gate instead of redirecting');
    if (n.nav.length) bad(`network failure navigated to ${n.nav.join(', ')} — this is the bounce loop`);
    else ok('network failure performs NO navigation at all');
  }

  console.log('\n── 3. destinations ──');
  {
    const s = sandbox(ADMIN).S;
    const d = s['destinationFor'] as Function;
    if (d({ kind: 'ADMIN' }) !== '/admin') bad('admin destination is not /admin');
    else ok('ADMIN → /admin');
    if (d({ kind: 'CUSTOMER' }) !== '/dashboard') bad('customer destination wrong');
    else ok('CUSTOMER → /dashboard');
    if (d({ kind: 'PENDING' }) !== '/pending-activation') bad('pending destination wrong');
    else ok('PENDING → /pending-activation');
  }

  console.log('\n── 4. identity switching leaves no residue ──');
  {
    // Scenario A: customer session, then an admin logs in on the same browser.
    const a = sandbox(ADMIN);
    a.store['adlytic_token'] = 'customer-token';
    a.store['adlytic_workspace_id'] = 'w9';
    a.store['adlytic_dash_mode'] = 'pro';
    a.store['adlytic_density'] = 'compact';
    a.S['adoptAdminSession']!('admin-token');
    if (a.store['adlytic_workspace_id']) bad('admin session inherited a customer workspace id');
    else ok('adopting an admin session clears the workspace id');
    if (a.store['adlytic_dash_mode']) bad('customer dashboard mode survived the switch');
    else ok('customer-scoped keys are cleared');
    if (a.store['adlytic_density'] !== 'compact') bad('a neutral preference was destroyed');
    else ok('neutral preferences survive (density kept)');
    if (a.store['adlytic_token'] !== 'admin-token') bad('the new token was not adopted');
    else ok('the new token is adopted');
    if (a.store['adlytic_session_mode'] !== 'admin') bad('session mode hint not set');
    else ok('session mode hint set to admin');

    // Logout must leave nothing.
    a.S['clearSession']!();
    const residue = Object.keys(a.store).filter((k) => k === 'adlytic_token' || k === 'adlytic_session_mode' || (CUSTOMER_SESSION_KEYS as readonly string[]).includes(k));
    if (residue.length) bad(`logout left identity residue: ${residue.join(', ')}`);
    else ok('logout leaves no token, no mode, no customer context');
  }

  console.log('\n── 5. surface guards ──');
  {
    // Scenario B: admin opens a customer surface.
    const b = sandbox(ADMIN); b.store['adlytic_token'] = 't';
    await b.S['requireCustomerSurface']!(() => bad('customer surface opened for an admin'), () => {});
    if (b.nav[0] !== '/admin') bad(`admin on a customer surface went to ${b.nav[0]}`);
    else ok('admin on a customer surface is sent to /admin');

    // Scenario C: customer opens an admin surface.
    const c = sandbox(CUSTOMER); c.store['adlytic_token'] = 't';
    let opened = false;
    await c.S['requireAdminSurface']!(() => { opened = true; }, () => {});
    if (opened) bad('admin surface opened for a customer');
    else ok('admin surface never opens for a customer');
    if (c.nav[0] !== '/dashboard') bad(`customer on an admin surface went to ${c.nav[0]}`);
    else ok('customer on an admin surface is sent to /dashboard');

    // Anonymous on an admin surface goes to the ADMIN door, not /login.
    const anon = sandbox(CUSTOMER);
    await anon.S['requireAdminSurface']!(() => bad('opened for anonymous'), () => {});
    if (anon.nav[0] !== '/admin/login') bad(`anonymous on an admin surface went to ${anon.nav[0]}`);
    else ok('anonymous on an admin surface is sent to /admin/login');
  }

  console.log('\n── 6. the shipped pages use the shared decision ──');
  {
    const login = readFileSync('src/web/pages/loginPage.ts', 'utf8');
    if (!/isPlatformAdmin\s*===\s*true/.test(login)) bad('loginPage still routes without checking isPlatformAdmin');
    else ok('loginPage checks isPlatformAdmin before routing');
    if (!login.includes('adoptAdminSession')) bad('loginPage does not adopt an admin session');
    else ok('loginPage adopts an admin session for admins');
    // The exact old defect: an unconditional dashboard destination in the
    // existing-session branch.
    if (/isActive === false \? '\/pending-activation' : '\/dashboard'/.test(login)) {
      bad('loginPage still contains the original unconditional /dashboard branch');
    } else ok('the original unconditional /dashboard branch is gone');

    const os = readFileSync('src/web/pages/adminOsPage.ts', 'utf8');
    if (!os.includes('requireAdminSurface')) bad('adminOsPage does not use the shared admin guard');
    else ok('adminOsPage uses the shared admin guard');
    if (!os.includes("replace('/admin/login')")) bad('admin logout does not return to the admin door');
    else ok('admin logout returns to /admin/login');

    const layout = readFileSync('src/web/layout.ts', 'utf8');
    if (!/isPlatformAdmin === true/.test(layout)) bad('the customer shell has no admin guard');
    else ok('the customer shell redirects a confirmed admin to /admin');

    const adminLogin = readFileSync('src/web/pages/adminLoginPage.ts', 'utf8');
    if (/window\.location\.(replace|href)\s*=?\s*\(?['"]\/dashboard/.test(adminLogin)) {
      bad('/admin/login can bounce to the customer dashboard');
    } else ok('/admin/login never bounces to the customer dashboard');
    if (!adminLogin.includes('ليس حساب إدارة للمنصة')) bad('/admin/login does not reject non-admins with a message');
    else ok('/admin/login rejects non-admins explicitly');
  }

  console.log('\n── 7. the browser hint is never authority ──');
  {
    const server = readFileSync('src/api/server.ts', 'utf8');
    if (/session_mode/.test(server)) bad('the server references the browser session-mode hint');
    else ok('the server never reads adlytic_session_mode');
    const guard = readFileSync('src/api/adminGuard.ts', 'utf8');
    if (!/PLATFORM_ADMIN_EMAILS/.test(guard) || !/tokenVersion/.test(guard)) {
      bad('adminGuard no longer derives authority from the allowlist + token version');
    } else ok('server authority is still allowlist + tokenVersion, untouched');
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
