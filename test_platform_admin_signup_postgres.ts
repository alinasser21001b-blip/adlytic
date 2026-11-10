// ═════════════════════════════════════════════════════════════════════════
//  test_platform_admin_signup_postgres.ts — public signup cannot grant
//  platform-admin access. Real Hono app, real (synthetic, loopback) Postgres.
//
//  Not part of test:all (CI has no database); exits 2 — never green — when it
//  cannot run:
//
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc3 \
//      npm run test:platform-admin-signup-pg
//
//  The weakness: platform-admin authority is "your address is in
//  PLATFORM_ADMIN_EMAILS" (src/api/adminGuard.ts) and POST /api/auth/register
//  does not verify an address — so whoever registered an allowlisted address
//  FIRST became a platform admin. Here the allowlist holds
//     platform-admin-<sfx>@repro.invalid          (an admin row exists, out of band)
//     Kareem.Admin-<sfx>@Repro.Invalid            (nobody has registered it yet — the target)
//  written with mixed case and stray spaces, as an operator might.
//
//  A REFUSED signup must: answer 409 (the same answer as "address already in
//  use", so admin addresses are not revealed), issue no token and no cookie, and
//  leave EVERY row of EVERY table unchanged (xmin snapshot — see
//  tests/support/dbSnapshot.ts). An address that merely RESEMBLES an admin's
//  (plus-addressed, dotted, …) is an ordinary customer: it must sign up, and it
//  must not reach /api/admin/*, /admin, or be advertised as admin by /api/auth/me.
// ═════════════════════════════════════════════════════════════════════════

const sfx = Math.random().toString(36).slice(2, 8);
const ADMIN_EXISTING = `platform-admin-${sfx}@repro.invalid`;
const ADMIN_TARGET = `kareem.admin-${sfx}@repro.invalid`;
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env['PLATFORM_ADMIN_EMAILS'] = ` ${ADMIN_EXISTING.toUpperCase()} ,, Kareem.Admin-${sfx}@Repro.Invalid `;
delete process.env['REDIS_URL'];

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('NOT RUN: DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`); }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('./src/api/server');
  const { hashPassword } = await import('./src/services/jwtAuth');
  const { snapshotAll, diffSnapshots, listTables, tablesIn } = await import('./tests/support/dbSnapshot');

  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: dbName, max: 10, connectionTimeoutMillis: 4000 });
  try { await pool.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic database:', (e as Error).message); process.exit(2); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);
  const tables = await listTables(pool);

  const quiet = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const l = console.log; const w = console.warn; console.log = () => {}; console.warn = () => {};
    try { return await fn(); } finally { console.log = l; console.warn = w; }
  };
  type Res = { status: number; body: any; setCookie: string | null; location: string | null; text: string };
  let ipSeq = 0;
  const send = (method: string, path: string, opts: { token?: string; cookie?: string; body?: unknown; raw?: string } = {}): Promise<Res> => quiet(async () => {
    // registration is rate limited per client IP (5/hour): every request pretends to come from its own
    const headers: Record<string, string> = { 'x-forwarded-for': `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` };
    if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
    if (opts.cookie) headers['cookie'] = opts.cookie;
    const init: RequestInit = { method, headers, redirect: 'manual' };
    if (opts.raw !== undefined) { init.body = opts.raw; headers['content-type'] = 'application/json'; }
    else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); headers['content-type'] = 'application/json'; }
    const r = await app.request(path, init);
    const text = await r.text();
    let body: any = null; try { body = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, body, setCookie: r.headers.get('set-cookie'), location: r.headers.get('location'), text };
  });
  const PW = 'Synthetic-pw-12345';
  const register = (email: string, extra: Record<string, unknown> = {}) => send('POST', '/api/auth/register', { body: { email, password: PW, name: 'Synthetic', ...extra } });
  const adminProbe = async (token: string) => ({
    orphans: (await send('GET', '/api/admin/data-health/orphans', { token })).status,
    customers: (await send('GET', '/api/admin/customers', { token })).status,
    platformStats: (await send('GET', '/api/admin/platform-stats', { token })).status,
  });
  const nTables = tables.length;

  const admin = await prisma.user.create({ data: { email: ADMIN_EXISTING, passwordHash: await hashPassword(PW), name: 'Platform Admin', isActive: true } });
  console.log(`fixture: allowlist = [${ADMIN_EXISTING} (a row exists), ${ADMIN_TARGET} (no row yet)]; ${nTables} tables (database: ${dbName})`);

  // ── 1. the attack: signing up AS the admin ───────────────────────────
  console.log('\n── 1. signup with an allowlisted address (or anything the guard reads as one) is refused and writes nothing ──');
  const refusedSignup = async (name: string, email: string, credentialsValid = false) => {
    const before = await snapshotAll(pool, tables);
    const r = await register(email);
    const after = await snapshotAll(pool, tables);
    const d = diffSnapshots(before, after);
    const probe = r.body?.token ? await adminProbe(r.body.token) : null;   // what the attacker could do with the token, if one was issued
    const login = await send('POST', '/api/auth/login', { body: { email: email.trim().toLowerCase(), password: PW } });
    check(`${name} → 409, no token, no cookie, no row changed in any of ${nTables} tables, and ${credentialsValid ? 'no new session' : 'the credentials do not log in'}`,
      r.status === 409 && !r.body?.token && !r.setCookie && d.length === 0 && (credentialsValid ? true : login.status === 401),
      { status: r.status, tokenIssued: !!r.body?.token, cookie: !!r.setCookie, changed: d.slice(0, 5), adminAccessWithThatToken: probe, loginStatus: login.status });
    return r;
  };
  const exactRefusal = await refusedSignup('exact address of an admin whose row does not exist yet', ADMIN_TARGET);
  await refusedSignup('UPPER-CASE', ADMIN_TARGET.toUpperCase());
  await refusedSignup('Mixed-case (as written in the allowlist)', `Kareem.Admin-${sfx}@Repro.Invalid`);
  await refusedSignup('padded with spaces', `   ${ADMIN_TARGET}   `);
  await refusedSignup('padded with tab / newline / carriage return', `\t\r\n${ADMIN_TARGET}\n\t`);
  await refusedSignup('padded with NBSP (U+00A0) — trim() strips it', ` ${ADMIN_TARGET} `);
  await refusedSignup('with a leading byte-order mark (U+FEFF) — trim() strips it', `﻿${ADMIN_TARGET}`);
  await refusedSignup('Kelvin sign K (U+212A) for k — toLowerCase() turns it into ASCII k', `Kareem.admin-${sfx}@repro.invalid`);
  await refusedSignup('full-width letters (NFKC look-alike) — not equal under the guard\'s own normalisation, refused as defence in depth', `ｋareem.admin-${sfx}@repro.invalid`);
  const takenRefusal = await refusedSignup('exact address of an admin whose row exists', ADMIN_EXISTING, true);
  await refusedSignup('…the existing admin, UPPER-CASE', ADMIN_EXISTING.toUpperCase(), true);
  await refusedSignup('…the existing admin, padded', ` ${ADMIN_EXISTING}\t`, true);
  check('the refusal is the same answer as "already in use": it does not reveal which addresses are admins', JSON.stringify(exactRefusal.body) === JSON.stringify(takenRefusal.body) && exactRefusal.status === takenRefusal.status, [exactRefusal.body, takenRefusal.body]);
  const plainTaken = await register(`ordinary-${sfx}@repro.invalid`); const plainTaken2 = await register(`ordinary-${sfx}@repro.invalid`);
  check('…and identical to the answer for an ordinary address that is already taken', plainTaken.status === 201 && plainTaken2.status === 409 && JSON.stringify(plainTaken2.body) === JSON.stringify(exactRefusal.body), [plainTaken.status, plainTaken2.body]);

  // ── 2. look-alikes are ordinary customers ────────────────────────────
  console.log('\n── 2. addresses that only RESEMBLE an admin\'s are ordinary customers: they sign up, and have no admin authority anywhere ──');
  const lookalikes: Array<[string, string]> = [
    ['plus-addressed', `kareem.admin-${sfx}+promo@repro.invalid`],
    ['plus-addressed (the existing admin)', `platform-admin-${sfx}+x@repro.invalid`],
    ['dot removed from the local part', `kareemadmin-${sfx}@repro.invalid`],
    ['dot added to the local part', `kar.eem.admin-${sfx}@repro.invalid`],
    ['fully-qualified trailing dot on the domain', `kareem.admin-${sfx}@repro.invalid.`],
    ['zero-width space (U+200B) inside the local part', `kareem.admin​-${sfx}@repro.invalid`],
    ['different domain', `kareem.admin-${sfx}@repro.example`],
  ];
  for (const [name, email] of lookalikes) {
    const before = await snapshotAll(pool, tables);
    const r = await register(email);
    const after = await snapshotAll(pool, tables);
    const d = diffSnapshots(before, after);
    const token: string | undefined = r.body?.token;
    const me = token ? await send('GET', '/api/auth/me', { token }) : null;
    const probe = token ? await adminProbe(token) : null;
    const ssr = token ? await send('GET', '/admin', { cookie: `adlytic_session=${token}` }) : null;
    const row = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    check(`${name}: signs up (201) as an ordinary customer — /api/auth/me says isPlatformAdmin=false, /api/admin/* → 403, GET /admin → redirect to /dashboard`,
      r.status === 201 && !!token && row !== null && me?.body?.isPlatformAdmin === false && probe?.orphans === 403 && probe?.customers === 403 && probe?.platformStats === 403 && ssr?.status === 302 && ssr?.location === '/dashboard' && tablesIn(d).every((t) => ['users', 'workspaces', 'workspace_members'].includes(t)),
      { status: r.status, me: me?.body?.isPlatformAdmin, probe, ssr: [ssr?.status, ssr?.location], touched: tablesIn(d) });
  }

  // ── 3. positive controls ─────────────────────────────────────────────
  console.log('\n── 3. positive controls: ordinary signup works; a provisioned admin still reaches the admin surface ──');
  const ord = await register(`new-customer-${sfx}@repro.invalid`);
  const ordMe = ord.body?.token ? await send('GET', '/api/auth/me', { token: ord.body.token }) : null;
  const ordMembership = ord.body?.user?.id ? await prisma.workspaceMember.findMany({ where: { userId: ord.body.user.id } }) : [];
  check('an ordinary new user signs up: 201, token, cookie, a workspace and an OWNER membership', ord.status === 201 && !!ord.body?.token && !!ord.setCookie && typeof ord.body?.workspaceId === 'string' && ordMembership.length === 1 && ordMembership[0]!.role === 'OWNER', [ord.status, ordMembership]);
  check('…and is not advertised as a platform admin (/api/auth/me isPlatformAdmin=false; pending activation does not change that)', ordMe?.status === 200 && ordMe.body?.isPlatformAdmin === false && ordMe.body?.isActive === false, ordMe?.body);
  const ordProbe = await adminProbe(ord.body.token);
  check('…and every /api/admin/* route answers 403', ordProbe.orphans === 403 && ordProbe.customers === 403 && ordProbe.platformStats === 403, ordProbe);
  const orphanPost = await send('POST', '/api/admin/data-health/orphans/cleanup?expectedRows=0', { token: ord.body.token });
  check('…including the destructive global orphan cleanup (403)', orphanPost.status === 403, orphanPost.status);
  const login = await send('POST', '/api/auth/login', { body: { email: ADMIN_EXISTING, password: PW } });
  check('a pre-existing admin row (provisioned out of band) still logs in', login.status === 200 && !!login.body?.token, login.status);
  const adminProbeRes = await adminProbe(login.body?.token ?? '');
  check('…and reaches /api/admin/data-health/orphans, /api/admin/customers, /api/admin/platform-stats (200)', adminProbeRes.orphans === 200 && adminProbeRes.customers === 200 && adminProbeRes.platformStats === 200, adminProbeRes);
  const adminMe = await send('GET', '/api/auth/me', { token: login.body?.token });
  check('…/api/auth/me advertises isPlatformAdmin=true to the admin', adminMe.body?.isPlatformAdmin === true, adminMe.body);
  const adminSsr = await send('GET', '/admin', { cookie: `adlytic_session=${login.body?.token}` });
  check('…and GET /admin serves the console to the admin (200), not a redirect', adminSsr.status === 200, [adminSsr.status, adminSsr.location]);
  const upper = await send('POST', '/api/auth/login', { body: { email: ` ${ADMIN_EXISTING.toUpperCase()} `, password: PW } });
  check('login normalises case and padding the same way (an admin typing it differently still gets in)', upper.status === 200, upper.status);

  // ── 4. every other way an address or a user is created or changed ────
  console.log('\n── 4. other paths that create a user or touch an email — each is refused, or proven unable to confer admin ──');
  const refusedWith = async (name: string, expect: number, call: () => Promise<Res>) => {
    const before = await snapshotAll(pool, tables);
    const r = await call();
    const after = await snapshotAll(pool, tables);
    const d = diffSnapshots(before, after);
    check(`${name} → ${expect}, and no row in any of ${nTables} tables changed`, r.status === expect && d.length === 0, { status: r.status, body: r.body, changed: d.slice(0, 5) });
    return r;
  };
  const ordTok: string = ord.body.token;
  // the workspace routes below sit behind the manual-activation gate (a customer is activated by support, not by the signup)
  await prisma.user.update({ where: { id: ord.body.user.id }, data: { isActive: true, activatedAt: new Date() } });
  await refusedWith('POST /api/auth/login with the (unregistered) allowlisted address', 401, () => send('POST', '/api/auth/login', { body: { email: ADMIN_TARGET, password: PW } }));
  await refusedWith('POST /api/admin/customers (create a user with an allowlisted address) as an ordinary customer', 403, () => send('POST', '/api/admin/customers', { token: ordTok, body: { email: ADMIN_TARGET, name: 'X', password: PW } }));
  await refusedWith('PATCH /api/admin/customers/:id {email: <allowlisted>} as an ordinary customer', 403, () => send('PATCH', `/api/admin/customers/${ord.body.user.id}`, { token: ordTok, body: { email: ADMIN_TARGET } }));
  await refusedWith('POST /api/admin/users/activate as an ordinary customer', 403, () => send('POST', '/api/admin/users/activate', { token: ordTok, body: { userId: ord.body.user.id } }));
  await refusedWith('POST /api/admin/customers/:id/reset-password (take over an account) as an ordinary customer', 403, () => send('POST', `/api/admin/customers/${admin.id}/reset-password`, { token: ordTok, body: { password: 'attacker-pw-123' } }));
  await refusedWith('POST /api/workspaces/:id/members/invite of an allowlisted address that has no account — nothing is created', 404, () => send('POST', `/api/workspaces/${ord.body.workspaceId}/members/invite`, { token: ordTok, body: { email: ADMIN_TARGET, role: 'OWNER' } }));
  const profile = await send('PATCH', '/api/auth/profile', { token: ordTok, body: { name: 'Renamed', email: ADMIN_TARGET } });
  const afterProfile = await prisma.user.findUnique({ where: { id: ord.body.user.id } });
  const profileProbe = await adminProbe(ordTok);
  check('PATCH /api/auth/profile ignores an `email` field: the address is unchanged, and the account is still not an admin', profile.status === 200 && afterProfile?.email === `new-customer-${sfx}@repro.invalid` && afterProfile?.name === 'Renamed' && profileProbe.orphans === 403, [profile.status, afterProfile?.email, profileProbe]);
  const inviteBefore = await snapshotAll(pool, tables);
  const invite = await send('POST', `/api/workspaces/${ord.body.workspaceId}/members/invite`, { token: ordTok, body: { email: ADMIN_EXISTING, role: 'OWNER' } });
  const inviteDiff = diffSnapshots(inviteBefore, await snapshotAll(pool, tables));
  const afterInvite = await adminProbe(ordTok);
  check('inviting the (existing) admin into a customer\'s workspace adds a membership row and nothing else — it gives the inviter no admin authority, and the admin keeps theirs', invite.status === 201 && tablesIn(inviteDiff).join() === 'workspace_members' && afterInvite.orphans === 403 && (await adminProbe(login.body.token)).orphans === 200, [invite.status, tablesIn(inviteDiff), afterInvite]);
  const bearerOfAdminAfterInvite = await send('GET', '/api/auth/me', { token: ordTok });
  check('…and /api/auth/me still says isPlatformAdmin=false for the inviter', bearerOfAdminAfterInvite.body?.isPlatformAdmin === false, bearerOfAdminAfterInvite.body);

  // ── 5. malformed signup bodies are 400, not 500, and write nothing ───
  console.log('\n── 5. malformed signup bodies ──');
  const bad: Array<[string, () => Promise<Res>]> = [
    ['email is a number', () => send('POST', '/api/auth/register', { body: { email: 12345, password: PW } })],
    ['email is an array', () => send('POST', '/api/auth/register', { body: { email: [ADMIN_TARGET], password: PW } })],
    ['email is an object', () => send('POST', '/api/auth/register', { body: { email: { toString: 'x' }, password: PW } })],
    ['password is a number', () => send('POST', '/api/auth/register', { body: { email: `x-${sfx}@repro.invalid`, password: 123456789 } })],
    ['name is an object', () => send('POST', '/api/auth/register', { body: { email: `y-${sfx}@repro.invalid`, password: PW, name: { a: 1 } } })],
    ['body is the JSON null', () => send('POST', '/api/auth/register', { raw: 'null' })],
    ['body is not JSON', () => send('POST', '/api/auth/register', { raw: '{"email":' })],
  ];
  for (const [name, call] of bad) await refusedWith(`malformed: ${name}`, 400, call);

  // ── 6. the guard still fails closed ──────────────────────────────────
  console.log('\n── 6. the admin guard itself is unchanged: no token → 401, ordinary token → 403 ──');
  check('GET /api/admin/data-health/orphans: anonymous 401, invalid token 401', (await send('GET', '/api/admin/data-health/orphans')).status === 401 && (await send('GET', '/api/admin/data-health/orphans', { token: 'nope' })).status === 401);

  console.log(`\n${pass} passed, ${fail} failed   (database: ${dbName})`);
  await prisma.$disconnect(); await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_platform_admin_signup_postgres crashed:', e); process.exit(1); });
