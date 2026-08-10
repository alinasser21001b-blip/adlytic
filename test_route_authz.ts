// ════════════════════════════════════════════════════════════════════════
//  test_route_authz.ts — every /api route must authenticate, and every
//  workspace-scoped route must additionally prove membership.
//
//  WHY THIS EXISTS
//  The /api/* middleware in server.ts is NOT an auth gate. Read it:
//
//      const authHeader = c.req.header('authorization');
//      if (!authHeader?.startsWith('Bearer ')) return next();   // ← no token: through
//      const userId = await getUserId(authHeader.slice(7));
//      if (!userId) return next();                              // ← bad token: through
//
//  Every failure path calls next(). It is an ACTIVE-USER gate: it exists to
//  block deactivated accounts, and it deliberately lets anonymous requests
//  reach the handler so that public routes work. That is a defensible
//  design — but it means authentication is enforced ONE ROUTE AT A TIME, by
//  hand, 132 times. A route that forgets the check is not caught by a type,
//  a middleware, or a test. It is simply open.
//
//  Cross-workspace access has the same shape: checkMember(userId, wsId) is
//  documented as being called by "every workspace-scoped route", and that
//  claim was never checked by anything.
//
//  This test checks both claims mechanically, so the next forgotten route
//  fails the build instead of shipping.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/api/server.ts', 'utf8');

/** Routes that are public BY DESIGN. Each needs a reason, not a shrug. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'POST /api/auth/register': 'account creation',
  'POST /api/auth/login': 'credential exchange',
  'GET /api/health': 'liveness probe — must answer without a DB user',
  'GET /api/health/ai': 'liveness probe for the LLM provider; returns no customer data',
  'GET /api/meta/oauth/callback': 'Meta redirects the browser here; consumeOAuthState() is the guard',
  'GET /api/meta/oauth/mock-callback': 'refuses to run unless META_MOCK_AUTH is on, and still consumes a one-time state token',
  'POST /api/dashboard-mode': 'sets a presentation-only cookie (pro/beginner); touches no workspace data',
  'POST /api/webhooks/stripe': 'Stripe signs the raw body; there is no user session',
  'GET /api/webhooks/meta': 'Meta subscription handshake; hub.verify_token is the guard',
  'POST /api/webhooks/meta': 'Meta signs the raw body (X-Hub-Signature-256, constant-time compare)',
  'POST /api/webhooks/meta/data-deletion': 'Meta signed_request is the guard',
  'POST /api/meta/data-deletion': 'Meta signed_request is the guard',
};

/**
 * Public routes that receive a signed payload must actually verify it.
 * Listing a route above is a claim; this checks the claim.
 */
const MUST_VERIFY_SIGNATURE = [
  'POST /api/webhooks/stripe',
  'POST /api/webhooks/meta',
  'POST /api/webhooks/meta/data-deletion',
  'POST /api/meta/data-deletion',
];

/** Path params that name a workspace, directly or by ownership. */
const WS_PARAM = /:workspaceId|:wsId/;

type Route = { method: string; path: string; body: string; line: number };

function extractRoutes(src: string): Route[] {
  const out: Route[] = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*(['`])([^'`]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Balanced-brace scan from the handler's opening brace to its close, so a
    // nested function or object literal cannot truncate the body.
    const from = re.lastIndex;
    const open = src.indexOf('{', from);
    if (open < 0) continue;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    out.push({
      method: m[1].toUpperCase(),
      path: m[3],
      body: src.slice(open, i + 1),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

const routes = extractRoutes(SRC).filter((r) => r.path.startsWith('/api/'));

let failures = 0;
const fail = (msg: string) => { console.error('  ✗ ' + msg); failures++; };

console.log(`\n── /api route authorisation ──\n${routes.length} routes registered\n`);

let authed = 0;
let wsScoped = 0;
for (const r of routes) {
  const id = `${r.method} ${r.path}`;
  if (PUBLIC_BY_DESIGN[id]) continue;

  // 1. AUTHENTICATION. The handler must resolve a caller identity itself —
  //    the middleware will not do it.
  const hasAuth =
    /getUserId\(/.test(r.body) ||
    /requirePlatformAdmin\(/.test(r.body) ||
    /requireActiveUser\(/.test(r.body);
  if (!hasAuth) {
    fail(`${id} (server.ts:${r.line}) resolves no caller identity — the /api/* middleware calls next() on a missing or invalid token, so this handler runs for anonymous requests`);
    continue;
  }
  authed++;

  // 2. WORKSPACE OWNERSHIP. A route that takes a workspace id and does not
  //    check membership serves workspace A's data to workspace B.
  if (WS_PARAM.test(r.path)) {
    wsScoped++;
    const hasMember = /checkMember\(/.test(r.body) || /requirePlatformAdmin\(/.test(r.body);
    if (!hasMember) {
      fail(`${id} (server.ts:${r.line}) takes a workspace id but never calls checkMember — any authenticated user can read another workspace's data`);
    }
  }
}

console.log(`  ✓ ${authed} routes resolve a caller identity`);
console.log(`  ✓ ${wsScoped} workspace-scoped routes checked for membership`);
console.log(`  · ${Object.keys(PUBLIC_BY_DESIGN).length} routes public by design (each with a stated reason)`);

// 3. A public route that takes a signed payload must verify the signature —
//    otherwise "public by design" is just "open".
for (const id of MUST_VERIFY_SIGNATURE) {
  const r = routes.find((x) => `${x.method} ${x.path}` === id);
  if (!r) { fail(`${id} is listed as signature-verified but is not registered`); continue; }
  if (!/constructEvent|createHmac|timingSafeEqual|verifyMetaSignature|verifySignature|signed_request/i.test(r.body)) {
    fail(`${id} (server.ts:${r.line}) is public and unauthenticated but never verifies a signature`);
  }
}
console.log(`  ✓ ${MUST_VERIFY_SIGNATURE.length} unauthenticated webhook routes verify their signature`);

// 3. The middleware must not be mistaken for an auth gate by a future reader.
//    If someone "fixes" it to return 401, every public route breaks; if
//    someone deletes a per-route check trusting it, everything opens. Pin the
//    comment that explains which one it is.
const mw = SRC.match(/app\.use\('\/api\/\*'[\s\S]{0,1400}?\n  \}\);/);
if (!mw) {
  fail('the /api/* middleware could not be located — this test is measuring nothing');
} else if (!/ACTIVE-USER GATE, NOT AN AUTH GATE/.test(SRC)) {
  fail('the /api/* middleware is not labelled — a reader cannot tell it lets anonymous requests through, which is the single most dangerous thing about this codebase');
}

console.log(`\n════ ${failures === 0 ? 'route authorisation OK' : failures + ' FAILURES'} ════\n`);
process.exit(failures ? 1 : 0);
