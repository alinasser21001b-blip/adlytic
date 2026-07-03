// ════════════════════════════════════════════════════════════════════════
//  test_tenant_isolation.ts
//
//  Cross-tenant isolation test. Proves that a user who is a member of
//  Workspace A can NEVER read data belonging to Workspace B through the
//  workspace-scoped API routes. The security boundary under test is the
//  `checkMember` guard that every workspace route calls before touching data.
//
//  Strategy: build the real Hono app (buildRoutes) with an in-memory fake
//  Prisma that models two users, each owning a separate workspace. We then
//  issue real HTTP requests via app.request():
//    • Positive control — user A → workspace A  ⇒ 200 (proves the mock can
//      distinguish members, so a 403 below is meaningful, not a broken mock).
//    • Isolation        — user A → workspace B  ⇒ 403 Access denied, across
//      several representative read endpoints.
//
//  No real database or Redis is required; the fake Prisma answers only the
//  handful of methods the auth + guard path invokes.
// ════════════════════════════════════════════════════════════════════════

// Env must be set BEFORE config.ts is imported (it validates on load). We use a
// dynamic import below so these assignments run first.
process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
// A dummy DATABASE_URL satisfies modules that read it at import time. No real
// connection is opened — buildRoutes uses the injected fake Prisma below.
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// Two tenants. userA ∈ wsA only; userB ∈ wsB only.
const USERS: Record<string, { id: string; tokenVersion: number; isActive: boolean }> = {
  userA: { id: 'userA', tokenVersion: 0, isActive: true },
  userB: { id: 'userB', tokenVersion: 0, isActive: true },
};
// membershipKey = `${userId}:${workspaceId}`
const MEMBERSHIPS = new Set<string>(['userA:wsA', 'userB:wsB']);
const WORKSPACES = new Set<string>(['wsA', 'wsB']);

// ── In-memory fake Prisma ───────────────────────────────────────────────────
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const u = USERS[where.id];
      return u ? { id: u.id, tokenVersion: u.tokenVersion, isActive: u.isActive } : null;
    },
  },
  workspaceMember: {
    findFirst: async ({ where }: { where: { userId: string; workspaceId: string } }) => {
      const key = `${where.userId}:${where.workspaceId}`;
      return MEMBERSHIPS.has(key)
        ? { id: `m_${key}`, userId: where.userId, workspaceId: where.workspaceId, role: 'OWNER' }
        : null;
    },
    findMany: async () => [],
  },
  workspace: {
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      if (!WORKSPACES.has(where.id)) throw new Error('workspace not found');
      // Minimal shape the GET /api/workspaces/:id route needs (no ad accounts →
      // the currency-heal loop is skipped, so no further prisma calls happen).
      return { id: where.id, name: `Workspace ${where.id}`, industryProfile: null, adAccounts: [] };
    },
  },
  campaign: { findMany: async () => [] },
} as unknown as import('@prisma/client').PrismaClient;

async function main() {
  const { buildRoutes } = await import('./src/api/server');
  const { signToken } = await import('./src/services/jwtAuth');

  const app = buildRoutes(fakePrisma);

  const tokenA = signToken({ sub: 'userA', email: 'a@example.com', ver: 0 });
  const tokenB = signToken({ sub: 'userB', email: 'b@example.com', ver: 0 });

  const get = (path: string, token: string) =>
    app.request(path, { headers: { Authorization: `Bearer ${token}` } });

  console.log('\n── Positive control (member CAN read own workspace) ──');
  const ownRes = await get('/api/workspaces/wsA', tokenA);
  check('userA → wsA returns 200', ownRes.status === 200, ownRes.status);
  const ownBody = await ownRes.json().catch(() => ({}));
  check('userA → wsA returns wsA data', (ownBody as { id?: string }).id === 'wsA', ownBody);

  console.log('\n── Cross-tenant isolation (member CANNOT read other workspace) ──');
  const isolationPaths = [
    '/api/workspaces/wsB',
    '/api/workspaces/wsB/campaigns',
    '/api/workspaces/wsB/insights',
    '/api/workspaces/wsB/members',
    '/api/workspaces/wsB/recommendations',
  ];
  for (const path of isolationPaths) {
    const res = await get(path, tokenA);
    check(`userA → ${path} is blocked (403)`, res.status === 403, res.status);
    const body = await res.json().catch(() => ({}));
    // Must NOT leak wsB data — the body should be the denial, never a payload.
    check(`userA → ${path} leaks no wsB data`, (body as { error?: string }).error === 'Access denied', body);
  }

  console.log('\n── Symmetry check (userB blocked from wsA) ──');
  const symRes = await get('/api/workspaces/wsA', tokenB);
  check('userB → wsA is blocked (403)', symRes.status === 403, symRes.status);

  console.log('\n── No token / invalid token is rejected ──');
  const noAuth = await app.request('/api/workspaces/wsB');
  check('no bearer → 401/403 (never 200)', noAuth.status === 401 || noAuth.status === 403, noAuth.status);
  const badTok = await get('/api/workspaces/wsB', 'not-a-real-jwt');
  check('invalid token → 401 (never 200)', badTok.status === 401, badTok.status);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('test_tenant_isolation crashed:', e);
  process.exit(1);
});
