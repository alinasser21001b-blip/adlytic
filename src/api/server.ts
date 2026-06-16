// ════════════════════════════════════════════════════════════════════════
//  src/api/server.ts
//
//  Hono application factory.
//
//  buildRoutes(prisma) mounts ALL routes using existing project infrastructure:
//    • getDashboard service
//    • SyncAccountWorker + MetaClient
//    • Direct Prisma queries (no new repos or business-logic files)
//
//  Routes (20):
//    Auth          POST /api/auth/register
//                  POST /api/auth/login
//                  GET  /api/auth/me
//    Health        GET  /api/health
//    Dashboard     GET  /api/dashboard/:workspaceId
//    Settings      GET  /api/workspaces/:workspaceId
//                  PATCH /api/workspaces/:workspaceId
//    Members       GET  /api/workspaces/:workspaceId/members
//                  POST /api/workspaces/:workspaceId/members
//    Campaigns     GET  /api/workspaces/:workspaceId/campaigns
//                  GET  /api/workspaces/:workspaceId/campaigns/:campaignId
//    Ad Sets       GET  /api/workspaces/:workspaceId/campaigns/:campaignId/adsets
//                  GET  /api/workspaces/:workspaceId/adsets/:adSetId
//    Ads           GET  /api/workspaces/:workspaceId/adsets/:adSetId/ads
//                  GET  /api/workspaces/:workspaceId/ads/:adId
//    Insights      GET  /api/workspaces/:workspaceId/insights
//                  GET  /api/workspaces/:workspaceId/insights/trends
//    Recs/Issues   GET  /api/workspaces/:workspaceId/recommendations
//                  GET  /api/workspaces/:workspaceId/issues
//    Sync          POST /api/workspaces/:workspaceId/sync
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType, WorkspaceRole } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { honoToApiRequest } from './adapter';
import { getDashboard } from '../services/getDashboard';
import { SyncAccountWorker } from '../workers/syncAccount';
import { MetaClient } from '../services/metaClient';

// ── Route count ───────────────────────────────────────────────────────────

export const ROUTE_COUNT = 20;

// ── Utilities ─────────────────────────────────────────────────────────────

/** Replacer that converts BigInt → Number so JSON.stringify never throws. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

/**
 * Serialize an object to a JSON-safe plain value, converting any BigInt
 * fields to Number. Call this before passing Prisma rows to c.json().
 */
function safeJson(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, bigintReplacer)) as unknown;
}

// ── Application factory ───────────────────────────────────────────────────

export function buildRoutes(prisma: PrismaClient): Hono {
  const app = new Hono();

  // ── Load dashboard HTML once at startup ───────────────────────────────────
  const dashboardPath = join(process.cwd(), 'dashboard_wired.html');
  const dashboardHtml = existsSync(dashboardPath)
    ? readFileSync(dashboardPath, 'utf-8')
    : '<html><body><h1>Adlytic — dashboard_wired.html not found</h1></body></html>';

  // ── Middleware ───────────────────────────────────────────────────────────

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  app.use('*', logger());

  // ── Dashboard HTML ───────────────────────────────────────────────────────

  /** GET / — serve the wired dashboard. */
  app.get('/', (c) => c.html(dashboardHtml));

  // ── Shared helper ────────────────────────────────────────────────────────

  /** Resolve the primary AdAccount for a workspace (Phase 1: one account). */
  async function getAccount(workspaceId: string) {
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { adAccounts: true },
    });
    return { workspace: ws, account: ws.adAccounts[0] ?? null };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  AUTH — minimal dev-time implementation (no JWT library dependency)
  //  Token format:  base64( userId : email )
  //  Replace with a real JWT / session strategy before production.
  // ════════════════════════════════════════════════════════════════════════

  /** POST /api/auth/register — create a new user account. */
  app.post('/api/auth/register', async (c) => {
    const body = await c.req.json() as { email: string; password: string; name: string };
    const passwordHash = createHash('sha256').update(body.password).digest('hex');
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, name: body.name },
    });
    return c.json({ id: user.id, email: user.email, name: user.name }, 201);
  });

  /** POST /api/auth/login — exchange credentials for a token. */
  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json() as { email: string; password: string };
    const passwordHash = createHash('sha256').update(body.password).digest('hex');
    const user = await prisma.user.findFirst({ where: { email: body.email, passwordHash } });
    if (!user) return c.json({ error: 'Invalid credentials' }, 401);
    const token = Buffer.from(`${user.id}:${user.email}`).toString('base64');
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  /** GET /api/auth/me — resolve bearer token to a user record. */
  app.get('/api/auth/me', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    let userId: string;
    try {
      const decoded = Buffer.from(req.bearerToken, 'base64').toString('utf8');
      userId = decoded.split(':')[0] ?? '';
    } catch {
      return c.json({ error: 'Invalid token' }, 401);
    }
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, locale: true, createdAt: true,
        memberships: {
          include: { workspace: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return c.json(user);
  });

  // ════════════════════════════════════════════════════════════════════════
  //  HEALTH
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/health — process liveness. */
  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      service: 'adlytic',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    })
  );

  // ════════════════════════════════════════════════════════════════════════
  //  DASHBOARD — existing getDashboard service
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/dashboard/:workspaceId — full dashboard DTO. */
  app.get('/api/dashboard/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const workspaceId = req.params['workspaceId'];
    if (!workspaceId) return c.json({ error: 'Missing workspaceId' }, 400);
    const dto = await getDashboard(workspaceId);
    return c.json(dto);
  });

  // ════════════════════════════════════════════════════════════════════════
  //  SETTINGS — workspace read / update
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId — workspace settings. */
  app.get('/api/workspaces/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: req.params['workspaceId'] },
      include: {
        industryProfile: true,
        adAccounts: {
          select: { id: true, name: true, currency: true, status: true, lastSyncedAt: true },
        },
      },
    });
    return c.json(ws);
  });

  /** PATCH /api/workspaces/:workspaceId — update workspace name / industry. */
  app.patch('/api/workspaces/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const body = req.body as { name?: string; industryProfileId?: string | null };
    const ws = await prisma.workspace.update({
      where: { id: req.params['workspaceId'] },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.industryProfileId !== undefined && { industryProfileId: body.industryProfileId }),
      },
    });
    return c.json(ws);
  });

  // ════════════════════════════════════════════════════════════════════════
  //  MEMBERS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/members — list workspace members. */
  app.get('/api/workspaces/:workspaceId/members', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params['workspaceId'] },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(members);
  });

  /** POST /api/workspaces/:workspaceId/members — add a user to the workspace. */
  app.post('/api/workspaces/:workspaceId/members', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const body = req.body as { userId: string; role?: string };
    const role: WorkspaceRole =
      body.role === 'OWNER' ? WorkspaceRole.OWNER
      : body.role === 'MANAGER' ? WorkspaceRole.MANAGER
      : WorkspaceRole.VIEWER;
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: req.params['workspaceId'], userId: body.userId, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(member, 201);
  });

  // ════════════════════════════════════════════════════════════════════════
  //  CAMPAIGNS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/campaigns — list all campaigns. */
  app.get('/api/workspaces/:workspaceId/campaigns', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const campaigns = await prisma.campaign.findMany({
      where: { adAccountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
    return c.json(safeJson(campaigns));
  });

  /** GET /api/workspaces/:workspaceId/campaigns/:campaignId — single campaign. */
  app.get('/api/workspaces/:workspaceId/campaigns/:campaignId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: req.params['campaignId'] },
      include: { adSets: { include: { ads: true } } },
    });
    return c.json(safeJson(campaign));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  AD SETS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/campaigns/:campaignId/adsets — list ad sets. */
  app.get('/api/workspaces/:workspaceId/campaigns/:campaignId/adsets', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const adSets = await prisma.adSet.findMany({
      where: { campaignId: req.params['campaignId'] },
      orderBy: { createdAt: 'desc' },
    });
    return c.json(safeJson(adSets));
  });

  /** GET /api/workspaces/:workspaceId/adsets/:adSetId — single ad set. */
  app.get('/api/workspaces/:workspaceId/adsets/:adSetId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const adSet = await prisma.adSet.findUniqueOrThrow({
      where: { id: req.params['adSetId'] },
      include: { ads: true },
    });
    return c.json(safeJson(adSet));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  ADS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/adsets/:adSetId/ads — list ads in an ad set. */
  app.get('/api/workspaces/:workspaceId/adsets/:adSetId/ads', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const ads = await prisma.ad.findMany({
      where: { adSetId: req.params['adSetId'] },
      orderBy: { createdAt: 'desc' },
    });
    return c.json(safeJson(ads));
  });

  /** GET /api/workspaces/:workspaceId/ads/:adId — single ad. */
  app.get('/api/workspaces/:workspaceId/ads/:adId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const ad = await prisma.ad.findUniqueOrThrow({
      where: { id: req.params['adId'] },
    });
    return c.json(safeJson(ad));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  INSIGHTS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/insights — daily stats for the account. */
  app.get('/api/workspaces/:workspaceId/insights', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const days = Math.min(Number(req.query['days'] ?? '30'), 90);
    const since = new Date(Date.now() - days * 864e5);
    const stats = await prisma.dailyStat.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id, date: { gte: since } },
      orderBy: { date: 'desc' },
    });
    return c.json(safeJson(stats));
  });

  /** GET /api/workspaces/:workspaceId/insights/trends — metric trends. */
  app.get('/api/workspaces/:workspaceId/insights/trends', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const trends = await prisma.metricTrend.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id },
      orderBy: { date: 'desc' },
      take: 30,
    });
    return c.json(safeJson(trends));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  RECOMMENDATIONS & ISSUES
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/recommendations — prioritised action list. */
  app.get('/api/workspaces/:workspaceId/recommendations', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const recs = await prisma.recommendation.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id },
      orderBy: [{ priority: 'desc' }, { date: 'desc' }],
    });
    return c.json(safeJson(recs));
  });

  /** GET /api/workspaces/:workspaceId/issues — detected issues (Rules Engine output). */
  app.get('/api/workspaces/:workspaceId/issues', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const issues = await prisma.detectedIssue.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id },
      orderBy: [{ severity: 'desc' }, { date: 'desc' }],
    });
    return c.json(safeJson(issues));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  SYNC TRIGGER — fires SyncAccountWorker in the background
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/workspaces/:workspaceId/sync — trigger ETL sync for the account.
   * Requires accessTokenEncrypted to be set on the ad account.
   * Returns immediately; sync runs in the background.
   */
  app.post('/api/workspaces/:workspaceId/sync', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json({ error: 'No ad account found for this workspace' }, 404);
    if (!account.accessTokenEncrypted) {
      return c.json({ error: 'No access token configured — connect a Meta account first' }, 422);
    }
    const metaClient = new MetaClient({
      apiVersion: 'v20.0',
      accessToken: account.accessTokenEncrypted,
    });
    const worker = new SyncAccountWorker(prisma, metaClient);
    // Fire-and-forget: respond immediately; sync result is persisted to DB
    void worker.sync(account.id).catch((err: unknown) =>
      console.error('[adlytic:sync]', err)
    );
    return c.json({
      status: 'sync_started',
      adAccountId: account.id,
      externalAccountId: account.externalAccountId,
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  FALLBACKS
  // ════════════════════════════════════════════════════════════════════════

  app.notFound((c) =>
    c.json({ error: 'Not found', path: c.req.path }, 404)
  );

  app.onError((err, c) => {
    console.error('[adlytic:error]', err);
    return c.json(
      {
        error: 'Internal server error',
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  });

  return app;
}
