// ════════════════════════════════════════════════════════════════════════
//  test_admin_revocation.ts — the admin kill switch must actually kill.
//
//  WHY THIS EXISTS
//  sessionRouter.ts deliberately ranks ADMIN above PENDING, so a platform
//  admin whose own user row is inactive still reaches the console. That
//  ordering is only defensible if a REAL revocation path exists and works —
//  otherwise "isActive does not revoke admins" would just mean "admins
//  cannot be revoked".
//
//  This gate proves the two authorities that DO revoke, against the real
//  requirePlatformAdmin(), with real signed tokens. It is the evidence the
//  frozen role policy points at.
// ════════════════════════════════════════════════════════════════════════
import { requirePlatformAdmin, isPlatformAdminEmail, _resetAdminAllowlistCache } from './src/api/adminGuard';
import { signToken } from './src/services/jwtAuth';
import type { ApiRequest } from './src/api/adapter';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

const ADMIN_EMAIL = 'owner@adlytic.test';
const USER_ID = 'user_1';

function setAllowlist(v: string | undefined) {
  if (v === undefined) delete process.env['PLATFORM_ADMIN_EMAILS'];
  else process.env['PLATFORM_ADMIN_EMAILS'] = v;
  _resetAdminAllowlistCache();
}

/** Prisma stand-in returning one user with a controllable tokenVersion. */
function prismaWith(tokenVersion: number, email = ADMIN_EMAIL) {
  return {
    user: { findUnique: async () => ({ tokenVersion, email }) },
  } as never;
}

const req = (token: string | null): ApiRequest =>
  ({ bearerToken: token, params: {}, query: {}, body: null } as unknown as ApiRequest);

async function main() {
  console.log('\n── A. a valid admin on the allowlist is allowed ──');
  {
    setAllowlist(ADMIN_EMAIL);
    const token = signToken({ sub: USER_ID, email: ADMIN_EMAIL, ver: 3 });
    const gate = await requirePlatformAdmin(req(token), prismaWith(3));
    if (!gate.ok) bad(`a valid admin was blocked: ${JSON.stringify(gate.response.body)}`);
    else ok(`valid allowlist + matching tokenVersion → allowed (${gate.email})`);
  }

  console.log('\n── B. removal from the allowlist revokes immediately ──');
  {
    // Same token, same tokenVersion — only the allowlist changed. This is
    // the primary kill switch and must not require a token change.
    const token = signToken({ sub: USER_ID, email: ADMIN_EMAIL, ver: 3 });
    setAllowlist('someone.else@adlytic.test');
    const gate = await requirePlatformAdmin(req(token), prismaWith(3));
    if (gate.ok) bad('an email removed from PLATFORM_ADMIN_EMAILS still passed the admin gate');
    else if (gate.response.status !== 403) bad(`expected 403 after allowlist removal, got ${gate.response.status}`);
    else ok('email removed from the allowlist → 403, with the SAME still-valid token');

    if (isPlatformAdminEmail(ADMIN_EMAIL)) bad('isPlatformAdminEmail still reports true after removal');
    else ok('the UI hint helper also reports false after removal');
  }

  console.log('\n── C. a tokenVersion bump revokes the existing token ──');
  {
    setAllowlist(ADMIN_EMAIL);
    const token = signToken({ sub: USER_ID, email: ADMIN_EMAIL, ver: 3 });
    // The DB row moved on (password reset, logout-all); the token did not.
    const gate = await requirePlatformAdmin(req(token), prismaWith(4));
    if (gate.ok) bad('a token whose version no longer matches the DB still passed');
    else if (gate.response.status !== 401) bad(`expected 401 on a stale tokenVersion, got ${gate.response.status}`);
    else ok('stale tokenVersion → 401, even for an allowlisted email');
  }

  console.log('\n── D. the browser hint carries ZERO server authority ──');
  {
    setAllowlist(ADMIN_EMAIL);
    // Simulate the attack directly: no bearer token at all, only the client
    // claiming to be in admin mode. The server has no way to see that claim
    // and must refuse.
    const gate = await requirePlatformAdmin(req(null), prismaWith(3));
    if (gate.ok) bad('a request with no token was authorized');
    else if (gate.response.status !== 401) bad(`expected 401 with no token, got ${gate.response.status}`);
    else ok('no bearer token → 401 regardless of any client-side claim');

    // And the literal key must appear nowhere in the server bundle.
    const { readFileSync } = await import('node:fs');
    const guard = readFileSync('src/api/adminGuard.ts', 'utf8');
    const server = readFileSync('src/api/server.ts', 'utf8');
    if (/session_mode/.test(guard) || /session_mode/.test(server)) {
      bad('adlytic_session_mode is referenced in server code — it must never be read there');
    } else ok('adlytic_session_mode appears nowhere in adminGuard.ts or server.ts');

    const forged = signToken({ sub: USER_ID, email: 'attacker@evil.test', ver: 3 });
    const g2 = await requirePlatformAdmin(req(forged), prismaWith(3, 'attacker@evil.test'));
    if (g2.ok) bad('a validly-signed token for a non-allowlisted email was authorized');
    else ok('a valid signature for a non-allowlisted email is still refused');
  }

  console.log('\n── E. an unset allowlist fails CLOSED ──');
  {
    setAllowlist(undefined);
    const token = signToken({ sub: USER_ID, email: ADMIN_EMAIL, ver: 3 });
    const gate = await requirePlatformAdmin(req(token), prismaWith(3));
    if (gate.ok) bad('admin routes served while PLATFORM_ADMIN_EMAILS was unset');
    else if (gate.response.status !== 503) bad(`expected 503 when the lock has no combination, got ${gate.response.status}`);
    else ok('unset allowlist → 503, refusing to serve rather than failing open');
    setAllowlist(ADMIN_EMAIL);
  }

  console.log('\n── F. inactive admin: routed as ADMIN, still revocable ──');
  {
    // The policy case. requirePlatformAdmin does not read isActive at all —
    // which is exactly why removal from the allowlist above still worked.
    setAllowlist(ADMIN_EMAIL);
    const token = signToken({ sub: USER_ID, email: ADMIN_EMAIL, ver: 1 });
    const gate = await requirePlatformAdmin(req(token), prismaWith(1));
    if (!gate.ok) bad('an allowlisted admin was blocked (isActive is not consulted, so this should pass)');
    else ok('requirePlatformAdmin never consults isActive — activation is not the admin gate');

    const guardSrc = (await import('node:fs')).readFileSync('src/api/adminGuard.ts', 'utf8');
    if (/isActive/.test(guardSrc)) {
      bad('adminGuard now reads isActive — that would make a business lifecycle flag a security control');
    } else ok('adminGuard reads only the allowlist and tokenVersion');
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
