// ═════════════════════════════════════════════════════════════════════════
//  test_platform_admin_signup.ts — CI-SAFE (no database, no Redis, no secrets).
//  Public signup cannot grant platform-admin access.
//
//  Platform-admin authority is "the user's stored address is in
//  PLATFORM_ADMIN_EMAILS" (src/api/adminGuard.ts) and registration does not verify
//  an address, so before this change whoever registered an allowlisted address
//  first became a platform admin. This file pins the rule that closes that:
//
//    1. isReservedForPlatformAdmin: the predicate registration uses. It is the
//       guard's OWN predicate plus an NFKC fold, so no address the guard would
//       accept can be registered — fuzzed over case / whitespace / Unicode /
//       plus / dot variants through the SAME normalisation registration applies;
//    2. the allowlist cache (read once per process) — behaviour pinned, not hidden;
//    3. POST /api/auth/register: the check runs before any read or write, before
//       any token, and answers exactly like "address already in use";
//    4. every place in src/ that creates, updates or deletes a user — an
//       allow-list, so a new path that could land an address on an account forces
//       a review of this rule;
//    5. the pieces of the admin surface this rule leans on (INACTIVE_ALLOWED_API,
//       /api/auth/me, requirePlatformAdmin reading the address from the database).
//
//  The behaviour against a real database is test_platform_admin_signup_postgres.ts.
//
//  Run: npx tsx test_platform_admin_signup.ts      (also in `npm run test:all`)
// ═════════════════════════════════════════════════════════════════════════

process.env['PLATFORM_ADMIN_EMAILS'] = ' Platform-Admin@Example.Test ,, Kareem.Admin@Example.Test ,owner+ops@example.test';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { _resetAdminAllowlistCache, isPlatformAdminEmail, isReservedForPlatformAdmin } from './src/api/adminGuard';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${got === undefined ? '' : ` — got: ${JSON.stringify(got)}`}`); }
}
const src = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });

/** Exactly what POST /api/auth/register does to the address before it stores it. */
const storedByRegister = (input: string) => input.toLowerCase().trim();
const REGISTER_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Would registration accept `input` — shape check, then the reservation. */
const wouldRegister = (input: string) => { const e = storedByRegister(input); return e.length <= 254 && REGISTER_SHAPE.test(e) && !isReservedForPlatformAdmin(e); };

function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function main() {
  // ── 1. the predicate ──────────────────────────────────────────────────
  console.log('\n── 1. isReservedForPlatformAdmin ──');
  const ADMIN = 'platform-admin@example.test';
  const reserved: Array<[string, string]> = [
    ['exact', ADMIN], ['UPPER', ADMIN.toUpperCase()], ['as written in the allowlist', 'Platform-Admin@Example.Test'],
    ['space padded', `  ${ADMIN}  `], ['tab / CR / LF padded', `\t\r\n${ADMIN}\n`], ['NBSP padded', ` ${ADMIN} `], ['BOM prefixed', `﻿${ADMIN}`],
    ['ideographic space padded', `　${ADMIN}　`], ['em space padded', ` ${ADMIN}`],
    ['Kelvin sign for k (second admin)', 'Kareem.admin@example.test'],
    ['full-width letters (NFKC)', 'ｐlatform-admin@example.test'], ['full-width domain (NFKC)', 'platform-admin@ｅxample.test'],
    ['ligature (NFKC): "ﬁ" has no match here but "ａ" does', 'plａtform-admin@example.test'],
    ['the allowlist entry that itself contains a plus', 'owner+ops@example.test'],
  ];
  for (const [name, email] of reserved) check(`reserved: ${name}`, isReservedForPlatformAdmin(email), email);
  const free: Array<[string, string]> = [
    ['plus-addressed', 'platform-admin+x@example.test'], ['dot removed', 'platformadmin@example.test'], ['dot added', 'platform.admin@example.test'],
    ['trailing dot on the domain', 'platform-admin@example.test.'], ['zero-width space inside', 'platform​-admin@example.test'],
    ['another domain', 'platform-admin@example.org'], ['a prefix of it', 'platform-admin@example.tes'], ['an ordinary customer', 'someone@example.test'],
    ['the plus entry\'s base address', 'owner@example.test'], ['empty', ''],
  ];
  for (const [name, email] of free) check(`ordinary (not reserved): ${name}`, !isReservedForPlatformAdmin(email), email);
  check('non-strings are not reserved (and cannot be registered: the route rejects them first)', [undefined, null, 5, {}, [ADMIN]].every((v) => !isReservedForPlatformAdmin(v)));
  check('plus-addressing is NOT folded: it would only lock the admin\'s own aliases out, and the guard compares whole addresses', isPlatformAdminEmail('platform-admin+x@example.test') === false);

  // the invariant that matters: if registration accepts a string, the guard does not treat the stored address as an admin
  const rnd = mulberry32(20260901);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const PAD = [' ', '\t', '\n', '\r', ' ', '﻿', ' ', '　', '​', '\u0085', '᠎', ' '];
  const LOOK: Record<string, string[]> = { k: ['K', 'ｋ', 'K'], a: ['ａ', 'A', 'à'], i: ['İ', 'ı', 'I', 'ｉ'], s: ['ſ', 'S'], t: ['T', 'ｔ'], '@': ['＠', '@'], '.': ['․', '．', '.'], '-': ['‐', '−', '-'], e: ['E', 'ｅ'], n: ['N', 'ñ'] };
  const BASES = [ADMIN, 'kareem.admin@example.test', 'owner+ops@example.test'];
  let guardWouldAccept = 0; let registerAccepts = 0; let violations: string[] = [];
  const N = 20000;
  for (let n = 0; n < N; n++) {
    let s = pick(BASES);
    const ops = 1 + Math.floor(rnd() * 5);
    for (let o = 0; o < ops; o++) {
      const r = rnd();
      if (r < 0.25) s = pick(PAD).repeat(1 + Math.floor(rnd() * 2)) + s;
      else if (r < 0.5) s = s + pick(PAD).repeat(1 + Math.floor(rnd() * 2));
      else if (r < 0.75) { const i = Math.floor(rnd() * s.length); const alts = LOOK[s[i]!]; if (alts) s = s.slice(0, i) + pick(alts) + s.slice(i + 1); }
      else if (r < 0.85) { const i = Math.floor(rnd() * s.length); s = s.slice(0, i) + pick(['+x', '.', '​', '́']) + s.slice(i); }
      else if (r < 0.95) s = [...s].map((ch) => (rnd() < 0.4 ? ch.toUpperCase() : ch)).join('');
      else s = s.normalize(pick(['NFC', 'NFD', 'NFKC', 'NFKD'] as const));
    }
    const stored = storedByRegister(s);
    const guardSays = isPlatformAdminEmail(stored);                   // what requirePlatformAdmin concludes for the stored row
    const accepted = wouldRegister(s);
    if (guardSays && REGISTER_SHAPE.test(stored)) guardWouldAccept++;
    if (accepted) registerAccepts++;
    if (accepted && guardSays) violations.push(s);
  }
  check(`fuzz (${N} variants of the allowlisted addresses): no string registration accepts is an address the guard would treat as an admin`, violations.length === 0, violations.slice(0, 3).map((v) => JSON.stringify(v)));
  check('…and the fuzz is not vacuous: thousands of variants WERE ones the guard would have accepted, and thousands were ordinary after registration', guardWouldAccept > 2000 && registerAccepts > 2000, { guardWouldAccept, registerAccepts });

  // ── 2. the allowlist cache ────────────────────────────────────────────
  console.log('\n── 2. the allowlist is read once per process ──');
  const guardSrc = src('src/api/adminGuard.ts');
  check('adminGuard parses PLATFORM_ADMIN_EMAILS once and memoises it at module level', /let _allowlist: ReadonlySet<string> \| null \| undefined;/.test(guardSrc) && /if \(_allowlist !== undefined\) return _allowlist;/.test(guardSrc));
  const before = isPlatformAdminEmail(ADMIN);
  process.env['PLATFORM_ADMIN_EMAILS'] = 'somebody-else@example.test';
  check('changing the variable inside a running process changes nothing (a redeploy/restart is how an admin is added or revoked)', before === true && isPlatformAdminEmail(ADMIN) === true && isPlatformAdminEmail('somebody-else@example.test') === false);
  _resetAdminAllowlistCache();
  check('…until the cache is reset (tests only): then the new value applies to the guard AND to the signup reservation together', isPlatformAdminEmail(ADMIN) === false && isPlatformAdminEmail('somebody-else@example.test') === true && !isReservedForPlatformAdmin(ADMIN) && isReservedForPlatformAdmin(' SOMEBODY-ELSE@example.test'));
  delete process.env['PLATFORM_ADMIN_EMAILS'];
  _resetAdminAllowlistCache();
  check('with the variable unset nothing is reserved (the guard itself fails closed with 503, so there is no admin to impersonate)', !isReservedForPlatformAdmin('somebody-else@example.test') && !isPlatformAdminEmail('somebody-else@example.test'));
  process.env['PLATFORM_ADMIN_EMAILS'] = ' Platform-Admin@Example.Test ,, Kareem.Admin@Example.Test ,owner+ops@example.test';
  _resetAdminAllowlistCache();
  const reservedFn = guardSrc.slice(guardSrc.indexOf('export function isReservedForPlatformAdmin'));
  check('isReservedForPlatformAdmin is built ON the guard\'s own predicate (isPlatformAdminEmail), not a second copy of its normalisation — structural, so the two cannot drift', /if \(isPlatformAdminEmail\(email\)\) return true;/.test(reservedFn));
  check('the reservation and the guard share one allowlist and one cache reset', _resetCoversFold(guardSrc));
  function _resetCoversFold(g: string) { return /export function _resetAdminAllowlistCache\(\): void \{\s*_allowlist = undefined;\s*_foldedAllowlist = undefined;\s*\}/.test(g); }
  check('the guard compares the DATABASE address (trim + lower-case), never the one inside the token', /select: \{ tokenVersion: true, email: true \}/.test(guardSrc) && /user\.email\.trim\(\)\.toLowerCase\(\)/.test(guardSrc) && !/payload\.email/.test(guardSrc));
  check('isPlatformAdminEmail still normalises with trim().toLowerCase() — the normalisation the signup fuzz above assumes', /return allowlist\.has\(email\.trim\(\)\.toLowerCase\(\)\);/.test(guardSrc) && /\.map\(s => s\.trim\(\)\.toLowerCase\(\)\)/.test(guardSrc));

  // ── 3. POST /api/auth/register ────────────────────────────────────────
  console.log('\n── 3. POST /api/auth/register ──');
  const SERVER = src('src/api/server.ts');
  const at = SERVER.indexOf("app.post('/api/auth/register'");
  const REGISTER = SERVER.slice(at, SERVER.indexOf("app.post('/api/auth/login'"));
  check('the register route is found', at > 0 && REGISTER.length > 800, REGISTER.length);
  check('it normalises the address exactly as the fuzz above assumes: toLowerCase().trim()', /const email = body\.email\.toLowerCase\(\)\.trim\(\);/.test(REGISTER));
  const idx = (n: string | RegExp) => (typeof n === 'string' ? REGISTER.indexOf(n) : REGISTER.search(n));
  const iShape = idx(/REGISTER_SHAPE|\^\[\^\\s@\]\+@/); const iReserve = idx('isReservedForPlatformAdmin(email)'); const iFind = idx('prisma.user.findUnique'); const iHash = idx('hashPassword('); const iCreate = idx('prisma.user.create'); const iWs = idx('prisma.workspace.create'); const iToken = idx('signToken('); const iCookie = idx('setSessionCookie(');
  check('the reservation runs after the shape check and BEFORE the user lookup, the password hash, any create, the token and the cookie', iShape >= 0 && iShape < iReserve && iReserve < iFind && iReserve < iHash && iReserve < iCreate && iReserve < iWs && iReserve < iToken && iReserve < iCookie, { iShape, iReserve, iFind, iHash, iCreate, iWs, iToken, iCookie });
  check('…it refuses with 409 and the SAME body as an address that is already in use (an admin address is not revealed)', /if \(isReservedForPlatformAdmin\(email\)\) return c\.json\(\{ error: 'Email already in use' \}, 409\);\s*const existing = await prisma\.user\.findUnique\(\{ where: \{ email \} \}\);\s*if \(existing\) return c\.json\(\{ error: 'Email already in use' \}, 409\);/.test(REGISTER));
  check('email and password must be strings (a non-string used to be a 500 from .toLowerCase())', /typeof body\.email !== 'string' \|\| typeof body\.password !== 'string'/.test(REGISTER));
  check('the route creates a user exactly once and a workspace owned by that user (no other way to leave an account behind)', (REGISTER.match(/prisma\.user\.create\(/g) ?? []).length === 1 && (REGISTER.match(/prisma\.workspace\.create\(/g) ?? []).length === 1);
  check('registration is the only route that issues a token besides login', (SERVER.match(/signToken\(/g) ?? []).length === 2 && /signToken\(/.test(REGISTER) && /signToken\(/.test(SERVER.slice(SERVER.indexOf("app.post('/api/auth/login'"), SERVER.indexOf("app.get('/api/auth/me'"))));
  const bootstrap = src('src/api/server.ts');
  void bootstrap;

  // ── 4. every writer of the users table ───────────────────────────────
  console.log('\n── 4. every place in src/ that creates, updates or deletes a user ──');
  const files = walk('src').filter((p) => !p.startsWith('src/web/'));
  const found: Record<string, number> = {};
  for (const p of files) { const m = src(p).match(/\b(?:user|users)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g); if (m) found[p] = m.length; }
  const EXPECTED: Record<string, number> = {
    // self-service (a bearer token of the user itself, or none for register/login):
    //   server.ts — register (create), login SHA-256→bcrypt upgrade (update passwordHash), PATCH profile (update NAME ONLY),
    //               change password (update), logout-all (update tokenVersion), DELETE account (delete)
    'src/api/server.ts': 6,
    // platform-admin only (requirePlatformAdmin on every route that reaches them):
    //   adminConsole.ts — createCustomerUser (create), updateCustomerUser (update: name/email/locale), setCustomerActive,
    //                     adminResetPassword (update), deleteCustomer (delete)
    'src/services/adminConsole.ts': 5,
  };
  check('the set of files that write the users table, and how many call sites each, is exactly the audited one — a new path must be reviewed against the signup rule', JSON.stringify(found) === JSON.stringify(EXPECTED), found);
  check('no raw SQL writes the users table from src/', !files.some((p) => /(INSERT INTO|UPDATE|DELETE FROM)\s+"?users"?\b/i.test(src(p))), files.filter((p) => /(INSERT INTO|UPDATE|DELETE FROM)\s+"?users"?\b/i.test(src(p))));
  const profileAt = SERVER.indexOf("app.patch('/api/auth/profile'");
  const PROFILE = SERVER.slice(profileAt, SERVER.indexOf("app.post('/api/auth/password'"));
  check('PATCH /api/auth/profile (the only self-service edit) writes `name` and nothing else: there is no self-service change of address', /data: \{ name: body\.name\.trim\(\) \},/.test(PROFILE) && (PROFILE.match(/prisma\.user\.update\(/g) ?? []).length === 1);
  const dataObjectAfter = (text: string, from: number) => { const d = text.indexOf('data:', from); let i = text.indexOf('{', d); let depth = 0; const start = i; for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; } return text.slice(start, i + 1); };
  const selfServiceUpdates = [...SERVER.matchAll(/prisma\.user\.update\(/g)].map((m) => dataObjectAfter(SERVER, m.index!));
  check('…and none of the self-service updates in server.ts sets `email`', selfServiceUpdates.length >= 4 && selfServiceUpdates.every((d) => !/\bemail\b/.test(d)), selfServiceUpdates);
  const admin = src('src/services/adminConsole.ts');
  check('the only code that sets an address after creation is updateCustomerUser, behind requirePlatformAdmin', (admin.match(/data\.email = /g) ?? []).length === 1 && /\/api\/admin\/customers\/:userId'[\s\S]{0,400}requirePlatformAdmin/.test(SERVER));
  for (const [route, fnName] of [["app.post('/api/admin/customers'", 'createCustomer('], ["app.patch('/api/admin/customers/:userId'", 'updateCustomerUser(']] as const) {
    const i = SERVER.indexOf(route);
    const body = SERVER.slice(i, i + 900);
    check(`${route.slice(4, -1)} reaches ${fnName.slice(0, -1)} only after requirePlatformAdmin`, i > 0 && body.indexOf('requirePlatformAdmin(') > 0 && body.indexOf('requirePlatformAdmin(') < body.indexOf(fnName), route);
  }
  const OAUTH_AND_OTHERS = ['/api/meta/oauth/connect', '/api/meta/oauth/callback', '/api/meta/oauth/mock-callback', '/api/auth/session-cookie'];
  check('Meta OAuth and the session-cookie route authenticate or consume state; none creates a user or a token (the only signToken calls are register and login)', OAUTH_AND_OTHERS.every((r) => SERVER.includes(`'${r}'`)) && (SERVER.match(/signToken\(/g) ?? []).length === 2);
  const lib = files.filter((p) => /magic|reset-?token|passwordReset|forgot|invite[A-Z]|invitation/i.test(p));
  check('there is no magic-link / password-reset-by-mail / invitation-token module in src/ (an address is never proven by mail anywhere)', lib.length === 0, lib);

  // ── 5. the admin surface this rule leans on ──────────────────────────
  console.log('\n── 5. INACTIVE_ALLOWED_API, /api/auth/me ──');
  const inactive = [...(SERVER.match(/const INACTIVE_ALLOWED_API = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '').matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]);
  check('INACTIVE_ALLOWED_API is exactly /api/auth/me, /api/activation/whatsapp-link, /api/auth/session-cookie — adding an admin-adjacent path would let a not-yet-activated account through', JSON.stringify(inactive) === JSON.stringify(['/api/auth/me', '/api/activation/whatsapp-link', '/api/auth/session-cookie']), inactive);
  const ME = SERVER.slice(SERVER.indexOf("app.get('/api/auth/me'"), SERVER.indexOf("app.get('/api/activation/whatsapp-link'"));
  check('/api/auth/me derives isPlatformAdmin from the stored address with the guard\'s own predicate (a hint only; every admin route still calls requirePlatformAdmin)', /isPlatformAdmin: isPlatformAdminEmail\(user\.email\)/.test(ME));
  const adminRoutes = [...SERVER.matchAll(/app\.(get|post|put|patch|delete)\(\s*'(\/api\/admin\/[^']*)'[\s\S]*?(?=\n {2}app\.|\n {2}\/\*\*)/g)];
  const ungated = adminRoutes.filter((m) => !/requirePlatformAdmin\(/.test(m[0])).map((m) => `${m[1]!.toUpperCase()} ${m[2]}`);
  check(`every one of the ${adminRoutes.length} /api/admin/* routes calls requirePlatformAdmin`, adminRoutes.length >= 30 && ungated.length === 0, ungated);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test_platform_admin_signup crashed:', e); process.exit(1); });
