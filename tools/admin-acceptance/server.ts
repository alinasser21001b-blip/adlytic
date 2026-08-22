// ════════════════════════════════════════════════════════════════════════
//  tools/admin-acceptance/server.mjs
//
//  Serves the REAL Control Plane pages against fixture APIs.
//
//  The pages are the production ones — imported from src/web/pages, not
//  copies — so what this renders is what an operator sees. Only the data
//  layer is substituted, which is the point: an acceptance audit that also
//  reimplemented the UI would be auditing itself.
//
//  Scenario is chosen per-request via ?scenario=, so one browser session can
//  walk every operator state without restarting anything.
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { SCENARIOS, FIXTURE_CUSTOMERS, FIXTURE_TICKETS, USAGE } from './fixtures';
// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { controlCenterPage } from '../../src/web/pages/controlCenterPage';
import { systemGraphPage } from '../../src/web/pages/systemGraphPage';
import { metaDataWorkspacePage } from '../../src/web/pages/metaDataWorkspacePage';
import { intelligenceWorkspacePage } from '../../src/web/pages/intelligenceWorkspacePage';
import { operationsWorkspacePage } from '../../src/web/pages/operationsWorkspacePage';
import { customersWorkspacePage } from '../../src/web/pages/customersWorkspacePage';
import { supportWorkspacePage } from '../../src/web/pages/supportWorkspacePage';
import { brainObservatoryPage } from '../../src/web/pages/brainObservatoryPage';
import { addClientPage } from '../../src/web/pages/addClientPage';
import { metaReadinessPage } from '../../src/web/pages/metaReadinessPage';
import { buildArchitectureGraph } from '../../src/graph/architecture';
import { buildRuntimeOverlay } from '../../src/graph/runtime';
import { CSS_ASSETS } from '../../src/web/layout';

const PAGES: Record<string, () => string> = {
  '/admin': controlCenterPage,
  '/admin/graph': systemGraphPage,
  '/admin/meta': metaDataWorkspacePage,
  '/admin/intelligence': intelligenceWorkspacePage,
  '/admin/operations': operationsWorkspacePage,
  '/admin/customers': customersWorkspacePage,
  '/admin/support': supportWorkspacePage,
  // Sidebar destinations that are not Control Plane pages of our own making,
  // and the migrated legacy route — all three must be walkable end to end,
  // because a transition audit that skips them audits nothing.
  '/admin/brain-observatory': brainObservatoryPage,
  '/admin/add-client': addClientPage,
  '/admin/meta-readiness': metaReadinessPage,
};

const ARCH = JSON.parse(JSON.stringify(buildArchitectureGraph()));

function json(res: any, body: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** A fixture entry may carry __status to simulate an HTTP failure. */
function serveFixture(res: any, value: any, fallback: any) {
  if (value === undefined) return json(res, fallback);
  if (value && typeof value === 'object' && '__status' in value) {
    const { __status, ...body } = value;
    return json(res, body, __status);
  }
  return json(res, value);
}

/**
 * The scenario travels in a cookie, not the query string.
 *
 * The pages fetch absolute paths — '/api/admin/ops' — so a '?scenario=' on the
 * document URL never reaches them. The first audit run passed cleanly for that
 * exact reason: every scenario rendered the healthy fixture, and the audit was
 * comparing a page against itself eleven times. The page request sets the
 * cookie; every subsequent XHR from that page carries it.
 */
function scenarioOf(req: any, url: URL): string {
  const fromQuery = url.searchParams.get('scenario');
  if (fromQuery) return fromQuery;
  const m = /(?:^|;\s*)acceptance_scenario=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]!) : 'healthy';
}

const server = createServer((req: any, res: any) => {
  const url = new URL(req.url, 'http://localhost');
  const scenarioKey = scenarioOf(req, url);
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.healthy;
  const api = scenario.api ?? {};
  const p = url.pathname;

  if (CSS_ASSETS[p]) {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    return res.end(CSS_ASSETS[p]);
  }
  // Fonts are served empty rather than 404: a missing font is a harness
  // artefact, and letting it surface as a console error would bury the real
  // JS errors the audit is looking for.
  if (p.startsWith('/fonts/')) {
    res.writeHead(200, { 'Content-Type': 'font/woff2' });
    return res.end(Buffer.alloc(0));
  }

  if (p === '/api/auth/me') {
    // Legacy surfaces gate themselves on isPlatformAdmin before rendering, so
    // an audit without it walks into a redirect and reports "shell lost" on a
    // page that is fine. The harness authenticates like a real operator.
    return json(res, {
      user: { name: 'المشغّل', email: 'ops@adlytic.io', isPlatformAdmin: true },
      isPlatformAdmin: true, name: 'المشغّل', email: 'ops@adlytic.io',
    });
  }
  if (p === '/api/admin/ops') return serveFixture(res, api.ops, SCENARIOS.healthy.api.ops);
  if (p === '/api/admin/platform-stats') return serveFixture(res, api.stats, SCENARIOS.healthy.api.stats);

  if (p === '/api/admin/graph/architecture') {
    return serveFixture(res, api.graphArchitecture, { ok: true, adaptedBy: null, snapshot: ARCH });
  }
  if (p === '/api/admin/graph/runtime') {
    const opsFixture = api.ops && !('__status' in api.ops) ? api.ops : SCENARIOS.healthy.api.ops;
    return json(res, { ok: true, overlay: buildRuntimeOverlay(ARCH, opsFixture) });
  }
  if (p.startsWith('/api/admin/graph/trace/')) {
    return json(res, { ok: false, code: 'NO_SNAPSHOT',
      reason: 'No measurable window for this campaign (or it does not exist)' }, 404);
  }

  if (p.startsWith('/api/admin/onboarding')) return json(res, []);
  if (p === '/api/admin/brain-observatory/campaigns') {
    return serveFixture(res, api.campaigns, [
      { id: 'c_1', name: 'حملة الرسائل — آب' },
      { id: 'c_2', name: 'حملة المبيعات — الصيف' },
    ]);
  }
  if (p === '/api/admin/meta-usage') {
    return serveFixture(res, api.metaUsage, USAGE.healthy);
  }
  if (p === '/api/admin/meta-audit') {
    return serveFixture(res, api.metaAudit, { events: [
      { createdAt: '2026-08-20T11:00:00.000Z', event: 'TOKEN_REFRESHED', workspaceId: 'ws_1', detail: 'system user token' },
      { createdAt: '2026-08-14T08:30:00.000Z', event: 'RECONNECT_REQUIRED', workspaceId: 'ws_2', detail: 'OAuthException 190' },
    ] });
  }
  if (p === '/api/admin/overview') {
    return serveFixture(res, api.overview, { users: 2, workspaces: 3, paidSubscriptions: 1, adAccounts: 3 });
  }
  if (p === '/api/admin/customers') return serveFixture(res, api.customers, FIXTURE_CUSTOMERS);
  if (p.startsWith('/api/admin/customers/')) {
    return json(res, { user: { id: 'u_1', name: 'علي ناصر', email: 'ali@example.com' } });
  }
  if (p === '/api/admin/subscriptions') {
    return serveFixture(res, api.subscriptions, [
      { workspaceId: 'ws_1', workspaceName: 'متجر النخبة', tier: 'PREMIUM', expiresAt: '2026-12-31' },
      { workspaceId: 'ws_2', workspaceName: 'صيدلية الشفاء', tier: 'FREE', expiresAt: null },
    ]);
  }
  if (p === '/api/admin/payment-events') {
    return serveFixture(res, api.payments, [
      { createdAt: '2026-08-01T10:00:00.000Z', type: 'MANUAL_ACTIVATION', workspaceId: 'ws_1', amount: 0 },
    ]);
  }
  if (p === '/api/admin/settings') {
    return serveFixture(res, api.settings, [
      { key: 'SYNC_LOOKBACK_DAYS', value: '30' },
      { key: 'BRAIN_NARRATION_ENABLED', value: 'true' },
    ]);
  }
  if (p === '/api/admin/users') {
    return serveFixture(res, api.users, [
      { id: 'u_1', name: 'علي ناصر', email: 'ali@example.com', isActive: true },
      { id: 'u_2', name: 'سارة عبد الله', email: 'sara@example.com', isActive: false, status: 'pending' },
    ]);
  }
  if (p === '/api/admin/support/counts') {
    return serveFixture(res, api.supportCounts, { open: 2, urgent: 1, unread: 1 });
  }
  if (p === '/api/admin/support/tickets') return serveFixture(res, api.tickets, FIXTURE_TICKETS);
  if (p.startsWith('/api/admin/support/tickets/')) {
    return json(res, { ticket: FIXTURE_TICKETS[0], messages: [
      { createdAt: '2026-08-22T08:00:00.000Z', body: 'الأرقام في اللوحة أقل مما أراه في مدير الإعلانات.', authorName: 'علي' },
      { createdAt: '2026-08-22T08:20:00.000Z', body: 'نتحقّق من نافذة الإسناد الآن.', authorRole: 'ADMIN' },
    ] });
  }

  const render = PAGES[p];
  if (render) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': `acceptance_scenario=${encodeURIComponent(scenarioKey)}; Path=/; SameSite=Lax`,
    });
    // Seed the bearer token the legacy pages look for before they will render.
    return res.end(render().replace('<body>',
      `<body><script>try{localStorage.setItem('adlytic_token','acceptance-harness-token');}catch(e){}</script>`));
  }
  if (process.env.LOG_404) console.error('[acceptance] 404', p);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found: ' + p);
});

const PORT = Number(process.env.PORT || 4599);
server.listen(PORT, () => console.log(`[acceptance] listening on http://127.0.0.1:${PORT}`));
