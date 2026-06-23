// ════════════════════════════════════════════════════════════════════════
//  src/api/server.ts
//
//  Hono application factory.
//
//  Routes (43):
//    Web UI        GET /  GET /login  GET /dashboard  GET /campaigns
//                  GET /recommendations  GET /workspace  GET /ai  GET /settings
//    Auth          POST /api/auth/register
//                  POST /api/auth/login
//                  GET  /api/auth/me
//                  PATCH /api/auth/profile
//                  POST  /api/auth/password
//                  DELETE /api/auth/account
//    Health        GET  /api/health
//    Dashboard     GET  /api/dashboard/:workspaceId
//    Settings      GET  /api/workspaces/:workspaceId
//                  PATCH /api/workspaces/:workspaceId
//    Members       GET  /api/workspaces/:workspaceId/members
//                  POST /api/workspaces/:workspaceId/members
//                  POST /api/workspaces/:workspaceId/members/invite
//                  PATCH /api/workspaces/:workspaceId/members/:memberId
//                  DELETE /api/workspaces/:workspaceId/members/:memberId
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
//    AI            POST /api/workspaces/:workspaceId/ai/chat
//    Sync          POST /api/workspaces/:workspaceId/sync
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createHash } from 'node:crypto';
import { EntityType, WorkspaceRole, SyncJobStatus, type Locale } from '@prisma/client';
import { signToken, verifyToken, verifyPassword, hashPassword } from '../services/jwtAuth';
import type { PrismaClient } from '@prisma/client';
import { honoToApiRequest } from './adapter';
import { getDashboard, getDashboardPulse } from '../services/getDashboard';
import { getPlatformStats, bustPlatformStatsCache } from '../services/getPlatformStats';
import { requirePlatformAdmin, isPlatformAdminEmail } from './adminGuard';
import { getStripe, getStripeWebhookSecret, StripeNotConfiguredError } from '../services/stripeClient';
import { handleStripeWebhookEvent, activateManual } from '../services/subscriptionService';
import { buildWhatsappLink } from '../services/whatsappLink';
import type { SubscriptionTier } from '@prisma/client';
import { adminDashboardPage } from '../web/pages/adminDashboardPage';
import { SyncAccountWorker } from '../workers/syncAccount';
import { runEngines } from '../workers/runEngines';
import { runBrainOrchestrator } from '../workers/runBrainOrchestrator';
import { MetaClient } from '../services/metaClient';
import { loginPage } from '../web/pages/loginPage';
import { registerPage } from '../web/pages/registerPage';
import { dashboardPage } from '../web/pages/dashboardPage';
import { campaignsPage } from '../web/pages/campaignsPage';
import { recommendationsPage } from '../web/pages/recommendationsPage';
import { workspacePage } from '../web/pages/workspacePage';
import { aiPage } from '../web/pages/aiPage';
import { settingsPage } from '../web/pages/settingsPage';
import { metaConnectPage } from '../web/pages/metaConnectPage';
import { buildAiContext } from '../services/aiContextBuilder';
import { askClaude } from '../services/claudeClient';
import { encryptToken, decryptToken } from '../services/tokenEncryption';
import { buildMetaOAuth, getMetaOAuthConfigStatus, type MetaAdAccountInfo } from '../services/metaOAuth';
import { RecommendationService } from '../services/recommendation.service';

// ── Background sync window policy ─────────────────────────────────────────
/** Default window when a user triggers a "refresh" sync from the dashboard. */
const DEFAULT_INCREMENTAL_BACKFILL_DAYS = 3;
/** Hard cap on backfill window; Meta's reporting window of relevance fits in here. */
const MAX_BACKFILL_DAYS = 90;
/** First-time backfill on Meta account connect. */
const INITIAL_BACKFILL_DAYS = 60;

// ── Country derivation ────────────────────────────────────────────────────
// Maps IANA timezone names → ISO 3166-1 alpha-2 country codes.
// Derived silently from Meta's timezone_name at account connection time.
// Known limitation: timezones that span multiple countries (e.g. Europe/London
// covers GB and IE) default to the dominant market. Extend as needed.
const TZ_TO_COUNTRY: Record<string, string> = {
  'Asia/Baghdad':        'IQ',
  'Asia/Riyadh':         'SA',
  'Asia/Dubai':          'AE',
  'Africa/Cairo':        'EG',
  'Asia/Amman':          'JO',
  'Asia/Beirut':         'LB',
  'Asia/Kuwait':         'KW',
  'Asia/Qatar':          'QA',
  'Africa/Casablanca':   'MA',
  'Africa/Tunis':        'TN',
  'Africa/Tripoli':      'LY',
  'Asia/Muscat':         'OM',
  'Asia/Aden':           'YE',
  'Africa/Khartoum':     'SD',
  'Asia/Tehran':         'IR',
  'Europe/Istanbul':     'TR',
  'Asia/Karachi':        'PK',
  'Asia/Kolkata':        'IN',
  'America/New_York':    'US',
  'America/Chicago':     'US',
  'America/Denver':      'US',
  'America/Los_Angeles': 'US',
  'Europe/London':       'GB',
  'Europe/Paris':        'FR',
  'Europe/Berlin':       'DE',
  'Asia/Singapore':      'SG',
  'Australia/Sydney':    'AU',
};

/** Derive ISO country code from a Meta timezone_name. Returns null when unknown. */
function tzToCountry(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  return TZ_TO_COUNTRY[timezone] ?? null;
}

// ── Route count ───────────────────────────────────────────────────────────

export const ROUTE_COUNT = 53;

// ── Rate limiting ─────────────────────────────────────────────────────────
// In-memory per-IP rate limiter. Single-instance; sufficient for Phase 1.

interface RateEntry { count: number; resetAt: number; }
const _loginRateMap    = new Map<string, RateEntry>(); // 10 req / 15 min
const _registerRateMap = new Map<string, RateEntry>(); // 5 req  / 60 min

function checkRateLimit(
  map: Map<string, RateEntry>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || entry.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ── Meta OAuth in-memory state ────────────────────────────────────────────
// Cleared on server restart — acceptable for Phase 1 (single-server).
// TTL: state tokens expire after 10 min; sessions after 30 min.

interface OAuthState {
  workspaceId: string;
  userId:      string;
  expiresAt:   number; // ms epoch
}
interface OAuthSession {
  workspaceId:  string;
  userId:       string;
  accessToken:  string;
  expiresAt:    Date;
  accounts:     MetaAdAccountInfo[];
  createdAt:    number; // ms epoch
}

const oauthStates   = new Map<string, OAuthState>();
const oauthSessions = new Map<string, OAuthSession>();

/** Remove expired entries to prevent unbounded growth. */
function pruneOAuth(): void {
  const now = Date.now();
  for (const [k, v] of oauthStates)   if (v.expiresAt < now) oauthStates.delete(k);
  for (const [k, v] of oauthSessions) if (v.createdAt + 30 * 60_000 < now) oauthSessions.delete(k);
}

// ── Utilities ─────────────────────────────────────────────────────────────

/**
 * Replacer that converts non-serializable Prisma types to plain JS values:
 *   BigInt   → Number   (Prisma uses BigInt for Int/BigInt fields with driver adapters)
 *   Decimal  → Number   (Prisma Decimal inherits from decimal.js — has .toNumber())
 * Date objects are handled natively by JSON.stringify via .toJSON().
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  // Prisma Decimal (decimal.js): any object with a toNumber() method
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (typeof v['toNumber'] === 'function') return (v as any).toNumber();
  }
  return value;
}

/**
 * Serialize a Prisma query result to a JSON-safe plain object.
 * If serialization itself fails (circular ref, exotic type), returns a
 * safe error sentinel rather than throwing — the route gets a 200 with
 * a parseable body instead of an unhandled exception that Hono might
 * surface as an HTML error page in edge cases.
 */
function safeJson(obj: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(obj, bigintReplacer)) as unknown;
  } catch (e) {
    console.error('[safeJson] serialization failed — returning error sentinel:', e);
    return { _serializationError: true };
  }
}

// ── Application factory ───────────────────────────────────────────────────

export function buildRoutes(prisma: PrismaClient): Hono {
  const app = new Hono();
  const recService = new RecommendationService(prisma);

  // ── Middleware ───────────────────────────────────────────────────────────

  // ── CORS — locked to ALLOWED_ORIGINS in production ────────────────────
  const _allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

  app.use(
    '*',
    cors({
      origin: _allowedOrigins.length
        ? (origin) => (_allowedOrigins.includes(origin) ? origin : null)
        : '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  app.use('*', logger());

  // ── Security headers ───────────────────────────────────────────────────
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options',  'nosniff');
    c.header('X-Frame-Options',         'DENY');
    c.header('Referrer-Policy',         'strict-origin-when-cross-origin');
    c.header('Permissions-Policy',      'camera=(), microphone=(), geolocation=()');
    c.header('X-XSS-Protection',        '0'); // rely on CSP instead
    // HSTS: only set over HTTPS (Railway sets X-Forwarded-Proto; check proto header)
    const proto = c.req.header('x-forwarded-proto') ?? '';
    if (proto === 'https') {
      c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self' data:; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none'; " +
      "object-src 'none'; " +
      "base-uri 'self';"
    );
  });

  // ════════════════════════════════════════════════════════════════════════
  //  WEB UI — server-rendered HTML pages
  // ════════════════════════════════════════════════════════════════════════

  app.get('/',               (c) => c.redirect('/dashboard'));
  app.get('/favicon.ico',    (c) => c.body(null, 204)); // suppress browser 404 noise
  app.get('/login',          (c) => c.html(loginPage()));
  app.get('/register',       (c) => c.html(registerPage()));
  app.get('/dashboard',      (c) => c.html(dashboardPage()));
  app.get('/campaigns',      (c) => c.html(campaignsPage()));
  app.get('/recommendations',(c) => c.html(recommendationsPage()));
  app.get('/workspace',      (c) => c.html(workspacePage()));
  app.get('/ai',             (c) => c.html(aiPage()));
  app.get('/settings',       (c) => c.html(settingsPage()));
  app.get('/admin',          (c) => c.html(adminDashboardPage()));
  app.get('/meta/connect',   (c) => c.html(metaConnectPage(c.req.query('session') ?? '')));

  // ── Auth helpers ──────────────────────────────────────────────────────────

  /**
   * Verify a JWT bearer token and confirm tokenVersion matches the DB row.
   * Returns the userId on success, null on any failure (expired, wrong sig,
   * revoked by password change or logout-all, user deleted).
   * The DB lookup is intentional — it is the revocation check.
   */
  async function getUserId(bearerToken: string | null): Promise<string | null> {
    if (!bearerToken) return null;
    const payload = verifyToken(bearerToken);
    if (!payload) return null;
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.ver) return null;
    return payload.sub;
  }

  /**
   * Verify that userId is a member of workspaceId.
   * Returns the WorkspaceMember row, or null if not a member.
   * Used by every workspace-scoped route to prevent cross-workspace data leakage.
   */
  async function checkMember(userId: string, workspaceId: string) {
    if (!userId || !workspaceId) return null;
    return prisma.workspaceMember.findFirst({ where: { userId, workspaceId } });
  }

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
  //  AUTH — bcrypt passwords, JWT access tokens (7-day TTL + tokenVersion
  //  revocation), rate-limited login and registration.
  // ════════════════════════════════════════════════════════════════════════

  /** POST /api/auth/register — create a new user account. */
  app.post('/api/auth/register', async (c) => {
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(_registerRateMap, clientIp, 5, 60 * 60_000)) {
      return c.json({ error: 'Too many registration attempts. Please try again later.' }, 429);
    }
    const body = await c.req.json() as { email?: string; password?: string; name?: string };
    if (!body.email || !body.password) return c.json({ error: 'email and password are required' }, 400);
    if (body.password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
    const email = body.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return c.json({ error: 'Email already in use' }, 409);
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email, name: body.name ?? email.split('@')[0], passwordHash },
    });
    // Create a default workspace for the new user
    const workspace = await prisma.workspace.create({
      data: {
        name: `${body.name ?? email.split('@')[0]}'s Workspace`,
        members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
      },
    });
    const token = signToken({ sub: user.id, email: user.email, ver: user.tokenVersion });
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name ?? null }, workspaceId: workspace.id }, 201);
  });

  /** POST /api/auth/login — exchange credentials for a JWT. */
  app.post('/api/auth/login', async (c) => {
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(_loginRateMap, clientIp, 10, 15 * 60_000)) {
      return c.json({ error: 'Too many login attempts. Please try again in 15 minutes.' }, 429);
    }
    const body = await c.req.json() as { email?: string; password?: string };
    if (!body.email || !body.password) return c.json({ error: 'email and password are required' }, 400);
    const email = body.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Spend bcrypt time to prevent user-enumeration via timing oracle
      await hashPassword('dummy-constant-time-guard');
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    const { ok, needsUpgrade } = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return c.json({ error: 'Invalid credentials' }, 401);
    // Transparent SHA-256 → bcrypt upgrade on successful login
    if (needsUpgrade) {
      const upgraded = await hashPassword(body.password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
    }
    const token = signToken({ sub: user.id, email: user.email, ver: user.tokenVersion });
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  /** GET /api/auth/me — resolve bearer token to a user record. */
  app.get('/api/auth/me', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    // findUnique (not OrThrow) — deleted users return null → 401, not 500
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, locale: true, createdAt: true,
        memberships: {
          include: { workspace: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    // Surface platform-admin flag for UI hints (sidebar link visibility).
    // The flag is advisory only — every admin route still calls requirePlatformAdmin.
    return c.json({ ...(safeJson(user) as object), isPlatformAdmin: isPlatformAdminEmail(user.email) });
  });

  /** PATCH /api/auth/profile — update display name. */
  app.patch('/api/auth/profile', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const body = req.body as { name?: string };
    if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: body.name.trim() },
      select: { id: true, name: true, email: true },
    });
    return c.json(safeJson(user));
  });

  /** POST /api/auth/password — change password (requires current password). */
  app.post('/api/auth/password', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const body = req.body as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword) return c.json({ error: 'Both passwords are required' }, 400);
    if (body.newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const { ok } = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!ok) return c.json({ error: 'Current password is incorrect' }, 403);
    const newHash = await hashPassword(body.newPassword);
    // Increment tokenVersion to revoke all existing sessions (logout all devices)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });
    return c.json({ success: true });
  });

  /** POST /api/auth/logout-all — revoke all sessions by incrementing tokenVersion. */
  app.post('/api/auth/logout-all', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return c.json({ success: true });
  });

  /** GET /api/auth/export — GDPR data export for the authenticated user. */
  app.get('/api/auth/export', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, locale: true,
        createdAt: true, updatedAt: true,
        memberships: {
          include: {
            workspace: {
              select: {
                id: true, name: true, plan: true, createdAt: true,
                adAccounts: {
                  select: { id: true, name: true, platform: true, currency: true, createdAt: true },
                },
              },
            },
          },
        },
      },
    });
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    c.header('Content-Disposition', `attachment; filename="adlytic-export-${userId}.json"`);
    return c.json({ exportedAt: new Date().toISOString(), user });
  });

  /** DELETE /api/auth/account — permanently delete the authenticated user. */
  app.delete('/api/auth/account', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    // Find workspaces where this user is the only OWNER — these become orphaned on deletion
    const ownedMemberships = await prisma.workspaceMember.findMany({
      where: { userId, role: WorkspaceRole.OWNER },
      select: { workspaceId: true },
    });

    for (const m of ownedMemberships) {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId: m.workspaceId, role: WorkspaceRole.OWNER },
      });
      if (ownerCount <= 1) {
        // Clean up analytics data (no FK cascade on entityId-based tables)
        const accounts = await prisma.adAccount.findMany({
          where: { workspaceId: m.workspaceId },
          select: { id: true },
        });
        for (const acct of accounts) {
          const campaignIds = await prisma.campaign.findMany({
            where: { adAccountId: acct.id },
            select: { id: true },
          }).then(cs => cs.map(c => c.id));
          await prisma.$transaction([
            prisma.rawInsight.deleteMany({     where: { entityType: EntityType.ACCOUNT, entityId: acct.id } }),
            prisma.dailyStat.deleteMany({      where: { entityType: EntityType.ACCOUNT, entityId: acct.id } }),
            prisma.metricTrend.deleteMany({    where: { entityType: EntityType.ACCOUNT, entityId: acct.id } }),
            prisma.detectedIssue.deleteMany({  where: { entityType: EntityType.ACCOUNT, entityId: acct.id } }),
            prisma.recommendation.deleteMany({ where: { entityType: EntityType.ACCOUNT, entityId: acct.id } }),
            prisma.healthScore.deleteMany({    where: { entityType: EntityType.ACCOUNT, entityId: acct.id } }),
            ...(campaignIds.length ? [
              prisma.dailyStat.deleteMany({   where: { entityType: EntityType.CAMPAIGN, entityId: { in: campaignIds } } }),
              prisma.healthScore.deleteMany({ where: { entityType: EntityType.CAMPAIGN, entityId: { in: campaignIds } } }),
            ] : []),
          ]);
        }
        await prisma.workspace.delete({ where: { id: m.workspaceId } });
      }
    }

    await prisma.user.delete({ where: { id: userId } });
    return c.json({ success: true });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  HEALTH
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/health — process liveness + DB readiness. */
  app.get('/api/health', async (c) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return c.json({
        status: 'ok',
        service: 'adlytic',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        db: 'ok',
      });
    } catch {
      return c.json({
        status: 'degraded',
        service: 'adlytic',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        db: 'unavailable',
      }, 503);
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  DASHBOARD — existing getDashboard service
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/dashboard/:workspaceId — full dashboard DTO. */
  app.get('/api/dashboard/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const workspaceId = req.params['workspaceId'];
    if (!workspaceId) return c.json({ error: 'Missing workspaceId' }, 400);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const member = await checkMember(userId, workspaceId);
    if (!member) return c.json({ error: 'Access denied' }, 403);
    try {
      const dto = await getDashboard(workspaceId, { prisma });
      return c.json(dto);
    } catch (e: any) {
      if (e?.message?.includes('no ad account') || e?.code === 'P2025') {
        return c.json({ empty: true, workspace: { id: workspaceId } }, 200);
      }
      throw e;
    }
  });

  /**
   * GET /api/dashboard/pulse/:workspaceId — lean polling endpoint.
   *
   * Returns ONLY the volatile fields the dashboard refreshes every 60s.
   * Decoupled from the heavy `getDashboard` path so polling stays cheap.
   * 200 with `{ empty: true }` when no ad account is linked yet.
   */
  app.get('/api/dashboard/pulse/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const workspaceId = req.params['workspaceId'];
    if (!workspaceId) return c.json({ error: 'Missing workspaceId' }, 400);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const member = await checkMember(userId, workspaceId);
    if (!member) return c.json({ error: 'Access denied' }, 403);
    const pulse = await getDashboardPulse(workspaceId, { prisma });
    if (!pulse) return c.json({ empty: true, workspaceId }, 200);
    return c.json(pulse);
  });

  // ════════════════════════════════════════════════════════════════════════
  //  ADMIN — platform-wide read-only analytics (gated by PLATFORM_ADMIN_EMAILS)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/platform-stats — aggregate reach + budgets + brain health.
   *
   * Gated by `requirePlatformAdmin`. Served from an in-memory 1h TTL cache
   * (see `getPlatformStats.ts`); the DTO carries `fromCache` so admins can
   * see whether they're looking at a fresh or cached row.
   */
  app.get('/api/admin/platform-stats', async (c) => {
    const req = await honoToApiRequest(c);
    const gate = await requirePlatformAdmin(req, prisma);
    if (!gate.ok) return c.json(gate.response.body, gate.response.status as 401 | 403 | 503);
    const stats = await getPlatformStats(prisma);
    return c.json(stats);
  });

  /**
   * POST /api/admin/cache/bust — manual invalidation of the platform-stats cache.
   *
   * Use after a hot fix to force the next `/api/admin/platform-stats` to recompute.
   */
  app.post('/api/admin/cache/bust', async (c) => {
    const req = await honoToApiRequest(c);
    const gate = await requirePlatformAdmin(req, prisma);
    if (!gate.ok) return c.json(gate.response.body, gate.response.status as 401 | 403 | 503);
    bustPlatformStatsCache();
    return c.json({ ok: true, bustedAt: Date.now() });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  BILLING — Stripe checkout, webhook, manual activation, WhatsApp link
  //
  //  Two payment paths converge into the same `payment_events` ledger:
  //    1. Stripe-driven (automated card payments)
  //    2. WhatsApp/cash-driven (manual activation by support agents)
  //
  //  See `src/services/subscriptionService.ts` for the transaction semantics.
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/billing/checkout — create a Stripe Checkout Session for the
   * authenticated user's workspace. The workspaceId + tier are injected into
   * `session.metadata` so the webhook can link the resulting customer back
   * to our DB. Frontend redirects the browser to `session.url`.
   */
  app.post('/api/billing/checkout', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);

    const body = req.body as { workspaceId?: string; tier?: SubscriptionTier };
    const workspaceId = body.workspaceId?.trim();
    const tier: SubscriptionTier = body.tier === 'PREMIUM' ? 'PREMIUM' : 'PREMIUM'; // only PREMIUM today
    if (!workspaceId) return c.json({ error: 'workspaceId is required' }, 400);

    // Membership gate — only members of the workspace may pay for it.
    const member = await checkMember(userId, workspaceId);
    if (!member) return c.json({ error: 'Forbidden' }, 403);
    if (member.role !== WorkspaceRole.OWNER) {
      return c.json({ error: 'Only the workspace owner can manage billing' }, 403);
    }

    const priceId = process.env['STRIPE_PREMIUM_PRICE_ID'];
    if (!priceId) return c.json({ error: 'Billing is not configured on this server' }, 503);

    const publicUrl = process.env['PUBLIC_APP_URL']?.replace(/\/$/, '') ?? '';
    if (!publicUrl) return c.json({ error: 'PUBLIC_APP_URL is not set' }, 503);

    let stripe;
    try { stripe = getStripe(); }
    catch (e) {
      if (e instanceof StripeNotConfiguredError) return c.json({ error: e.message }, 503);
      throw e;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return c.json({ error: 'User not found' }, 404);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      // Metadata is the link from Stripe back to our workspace identity.
      // Verified inside the webhook before we mutate anything.
      metadata: { workspaceId, tier, userId },
      subscription_data: {
        metadata: { workspaceId, tier, userId },
      },
      success_url: `${publicUrl}/settings?billing=success`,
      cancel_url:  `${publicUrl}/settings?billing=cancel`,
    });

    return c.json({ url: session.url, id: session.id });
  });

  /**
   * POST /api/webhooks/stripe — receive subscription lifecycle events.
   *
   * Three security requirements (non-negotiable):
   *   1. Read the raw request body BEFORE Hono touches it as JSON, so the
   *      signature verification has the byte-exact payload Stripe signed.
   *   2. Verify the signature via `stripe.webhooks.constructEvent`.
   *   3. Dedupe by Stripe event.id inside the same transaction as the state
   *      change (see `runDedupedTx` in subscriptionService).
   */
  app.post('/api/webhooks/stripe', async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) return c.json({ error: 'Missing stripe-signature header' }, 400);

    // CRITICAL: read raw body, NOT c.req.json(). Stripe signed the bytes;
    // any JSON re-serialisation would break verification.
    const rawBody = await c.req.raw.text();

    let stripe;
    let webhookSecret: string;
    try {
      stripe = getStripe();
      webhookSecret = getStripeWebhookSecret();
    } catch (e) {
      if (e instanceof StripeNotConfiguredError) {
        console.error('[stripe-webhook] not configured:', e.message);
        return c.json({ error: e.message }, 503);
      }
      throw e;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error('[stripe-webhook] signature verification failed:', err);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    try {
      const outcome = await handleStripeWebhookEvent(prisma, event);
      // Stripe stops retrying on any 2xx — that's the contract for processed,
      // duplicate, AND unhandled event types. We still log internally.
      if (!outcome.ok) {
        console.error('[stripe-webhook] handler returned not-ok:', outcome.reason, event.id);
        return c.json({ received: true, ok: false, reason: outcome.reason }, 200);
      }
      if (!outcome.processed) {
        console.log('[stripe-webhook] no-op:', outcome.reason, event.id);
      } else {
        console.log('[stripe-webhook] processed:', outcome.reason, event.id);
      }
      return c.json({ received: true, ok: true, processed: outcome.processed });
    } catch (err) {
      console.error('[stripe-webhook] handler crashed for event', event.id, err);
      // Return 500 so Stripe retries — the failure was on our side, not theirs.
      return c.json({ error: 'Internal error processing webhook' }, 500);
    }
  });

  /**
   * POST /api/admin/subscriptions/activate-manual — platform-admin only.
   *
   * Used by support agents after the customer pays via WhatsApp / Zain Cash
   * / bank wire. Writes the ACTIVE state + a ledger row carrying the
   * transfer reference and the agent's identity for the audit trail.
   */
  app.post('/api/admin/subscriptions/activate-manual', async (c) => {
    const req = await honoToApiRequest(c);
    const gate = await requirePlatformAdmin(req, prisma);
    if (!gate.ok) return c.json(gate.response.body, gate.response.status as 401 | 403 | 503);

    const body = req.body as {
      workspaceId?: string;
      tier?: SubscriptionTier;
      expiresAt?: string;       // ISO date
      note?: string;
      externalRef?: string;
      amountMinor?: number | string;
      currency?: string;
    };

    const workspaceId = body.workspaceId?.trim();
    const tier: SubscriptionTier = body.tier === 'FREE' ? 'FREE' : 'PREMIUM';
    if (!workspaceId)     return c.json({ error: 'workspaceId is required' }, 400);
    if (!body.expiresAt)  return c.json({ error: 'expiresAt is required (ISO date)' }, 400);
    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return c.json({ error: 'expiresAt must be a valid ISO date' }, 400);
    }

    const exists = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!exists) return c.json({ error: 'Workspace not found' }, 404);

    const result = await activateManual(prisma, {
      workspaceId,
      tier,
      expiresAt,
      ...(body.note ? { note: body.note } : {}),
      ...(body.externalRef ? { externalRef: body.externalRef } : {}),
      ...(body.amountMinor != null ? { amountMinor: BigInt(body.amountMinor) } : {}),
      ...(body.currency ? { currency: body.currency } : {}),
      triggeredBy: gate.userId,
    });
    return c.json(result);
  });

  /**
   * GET /api/billing/whatsapp-link?workspaceId=... — return a pre-filled
   * wa.me deep link the frontend renders as the "Pay via WhatsApp" CTA.
   *
   * Auth: any authenticated workspace member. Agents follow the link the
   * user opened from their own dashboard, so the message carries the
   * customer's identity verbatim.
   */
  app.get('/api/billing/whatsapp-link', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);

    const workspaceId = c.req.query('workspaceId');
    if (!workspaceId) return c.json({ error: 'workspaceId is required' }, 400);

    const member = await checkMember(userId, workspaceId);
    if (!member) return c.json({ error: 'Forbidden' }, 403);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return c.json({ error: 'User not found' }, 404);

    try {
      const link = buildWhatsappLink({ workspaceId, userEmail: user.email });
      return c.json(link);
    } catch (e) {
      console.error('[whatsapp-link] env error:', e);
      return c.json({ error: 'WhatsApp support channel is not configured' }, 503);
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  SETTINGS — workspace read / update
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId — workspace settings. */
  app.get('/api/workspaces/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const member = await checkMember(userId, req.params['workspaceId']);
    if (!member) return c.json({ error: 'Access denied' }, 403);
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: req.params['workspaceId'] },
      include: {
        industryProfile: true,
        adAccounts: {
          select: { id: true, name: true, currency: true, currencyMinorFactor: true, status: true, lastSyncedAt: true, externalAccountId: true, tokenExpiresAt: true },
        },
      },
    });
    return c.json(safeJson(ws));
  });

  /** PATCH /api/workspaces/:workspaceId — update workspace name / industry. */
  app.patch('/api/workspaces/:workspaceId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const member = await checkMember(userId, req.params['workspaceId']);
    if (!member) return c.json({ error: 'Access denied' }, 403);
    if (member.role === 'VIEWER') return c.json({ error: 'Insufficient permissions' }, 403);
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const member = await checkMember(userId, req.params['workspaceId']);
    if (!member) return c.json({ error: 'Access denied' }, 403);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params['workspaceId'] },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(safeJson(members));
  });

  /** POST /api/workspaces/:workspaceId/members — add a user by userId. */
  app.post('/api/workspaces/:workspaceId/members', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const callerId = await getUserId(req.bearerToken);
    if (!callerId) return c.json({ error: 'Invalid token' }, 401);
    const callerMs = await checkMember(callerId, req.params['workspaceId']);
    if (!callerMs) return c.json({ error: 'Access denied' }, 403);
    if (callerMs.role === 'VIEWER') return c.json({ error: 'Insufficient permissions' }, 403);
    const body = req.body as { userId: string; role?: string };
    const role: WorkspaceRole =
      body.role === 'OWNER' ? WorkspaceRole.OWNER
      : body.role === 'MANAGER' ? WorkspaceRole.MANAGER
      : WorkspaceRole.VIEWER;
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: req.params['workspaceId'], userId: body.userId, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(safeJson(member), 201);
  });

  /** POST /api/workspaces/:workspaceId/members/invite — add a user by email. */
  app.post('/api/workspaces/:workspaceId/members/invite', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const callerId = await getUserId(req.bearerToken);
    if (!callerId) return c.json({ error: 'Invalid token' }, 401);
    const callerMs = await checkMember(callerId, req.params['workspaceId']);
    if (!callerMs) return c.json({ error: 'Access denied' }, 403);
    if (callerMs.role === 'VIEWER') return c.json({ error: 'Insufficient permissions' }, 403);
    const body = req.body as { email: string; role?: string };
    if (!body.email?.trim()) return c.json({ error: 'Email is required' }, 400);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (!user) return c.json({ error: `No Adlytic account found for ${body.email}` }, 404);
    const existing = await prisma.workspaceMember.findFirst({
      where: { workspaceId: req.params['workspaceId'], userId: user.id },
    });
    if (existing) return c.json({ error: 'User is already a member of this workspace' }, 409);
    const role: WorkspaceRole =
      body.role === 'OWNER' ? WorkspaceRole.OWNER
      : body.role === 'MANAGER' ? WorkspaceRole.MANAGER
      : WorkspaceRole.VIEWER;
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: req.params['workspaceId'], userId: user.id, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(safeJson(member), 201);
  });

  /** PATCH /api/workspaces/:workspaceId/members/:memberId — change role. */
  app.patch('/api/workspaces/:workspaceId/members/:memberId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const callerMembership = await checkMember(userId, req.params['workspaceId']);
    if (!callerMembership) return c.json({ error: 'Access denied' }, 403);
    if (callerMembership.role === 'VIEWER') return c.json({ error: 'Insufficient permissions' }, 403);
    const body = req.body as { role?: string };
    const role: WorkspaceRole =
      body.role === 'OWNER' ? WorkspaceRole.OWNER
      : body.role === 'MANAGER' ? WorkspaceRole.MANAGER
      : WorkspaceRole.VIEWER;
    // Verify the target memberId actually belongs to this workspace (scope check)
    const target = await prisma.workspaceMember.findFirst({
      where: { id: req.params['memberId'], workspaceId: req.params['workspaceId'] },
    });
    if (!target) return c.json({ error: 'Member not found' }, 404);
    const member = await prisma.workspaceMember.update({
      where: { id: req.params['memberId'] },
      data: { role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(safeJson(member));
  });

  /** DELETE /api/workspaces/:workspaceId/members/:memberId — remove member. */
  app.delete('/api/workspaces/:workspaceId/members/:memberId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const callerMembership = await checkMember(userId, req.params['workspaceId']);
    if (!callerMembership) return c.json({ error: 'Access denied' }, 403);
    // Verify the target memberId belongs to this workspace (scope check + self-remove allowed)
    const target = await prisma.workspaceMember.findFirst({
      where: { id: req.params['memberId'], workspaceId: req.params['workspaceId'] },
    });
    if (!target) return c.json({ error: 'Member not found' }, 404);
    // Only OWNER/MANAGER can remove others; anyone can remove themselves
    if (target.userId !== userId && callerMembership.role === 'VIEWER') {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }
    // Prevent removal of the last OWNER — workspace would become unmanageable
    if (target.role === WorkspaceRole.OWNER) {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId: req.params['workspaceId'], role: WorkspaceRole.OWNER },
      });
      if (ownerCount <= 1) {
        return c.json({ error: 'Cannot remove the last owner of a workspace' }, 400);
      }
    }
    await prisma.workspaceMember.delete({ where: { id: req.params['memberId'] } });
    return c.json({ success: true });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  CAMPAIGNS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/campaigns — list all campaigns. */
  app.get('/api/workspaces/:workspaceId/campaigns', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json({ error: 'Not found' }, 404);
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params['campaignId'], adAccountId: account.id },
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const ownerCampaign = await prisma.campaign.findFirst({
      where: { id: req.params['campaignId'], adAccountId: account.id },
    });
    if (!ownerCampaign) return c.json([]);
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json({ error: 'Not found' }, 404);
    const adSet = await prisma.adSet.findUniqueOrThrow({
      where: { id: req.params['adSetId'] },
      include: { campaign: { select: { adAccountId: true } }, ads: true },
    });
    if (adSet.campaign.adAccountId !== account.id) return c.json({ error: 'Not found' }, 404);
    return c.json(safeJson(adSet));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  ADS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/adsets/:adSetId/ads — list ads in an ad set. */
  app.get('/api/workspaces/:workspaceId/adsets/:adSetId/ads', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const ownerAdSet = await prisma.adSet.findUnique({
      where: { id: req.params['adSetId'] },
      include: { campaign: { select: { adAccountId: true } } },
    });
    if (!ownerAdSet || ownerAdSet.campaign.adAccountId !== account.id) return c.json([]);
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json({ error: 'Not found' }, 404);
    const ad = await prisma.ad.findUniqueOrThrow({
      where: { id: req.params['adId'] },
      include: { adSet: { include: { campaign: { select: { adAccountId: true } } } } },
    });
    if (ad.adSet.campaign.adAccountId !== account.id) return c.json({ error: 'Not found' }, 404);
    return c.json(safeJson(ad));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  INSIGHTS
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/workspaces/:workspaceId/insights — daily stats for the account. */
  app.get('/api/workspaces/:workspaceId/insights', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
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
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const workspaceId = req.params['workspaceId'];
    if (!await checkMember(userId, workspaceId)) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(workspaceId);
    if (!account) return c.json([]);
    const recs = await prisma.recommendation.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id },
      orderBy: [{ priority: 'desc' }, { date: 'desc' }],
    });

    // Fire-and-forget: log a snapshot for closed-loop learning. One log entry
    // per recommendations fetch summarising the top recommendation surfaced.
    //
    // V1.1.5 fix (C-1 — outcome memory): hydrate `metricsSnapshot` with the
    // real KPI values from the latest DailyStat row for the recommendation's
    // own entity (could be ACCOUNT / CAMPAIGN / ADSET / AD — we match the rec's
    // entityType+entityId, not the workspace's account, so campaign-scoped
    // recs are evaluated against campaign-scoped metrics).
    //
    // Fallback contract: if no DailyStat exists yet (entity not yet synced),
    // emit zeros — never `undefined`. `computePrimaryDelta` in the rec service
    // treats `b > 0` as the gate, so 0-baselines correctly skip delta scoring
    // without poisoning the JSON shape.
    if (recs.length > 0) {
      const top = recs[0]!;
      void (async () => {
        try {
          const latestStat = await prisma.dailyStat.findFirst({
            where: {
              entityType: top.entityType,
              entityId: top.entityId,
              date: { lte: top.date },
            },
            orderBy: { date: 'desc' },
          });
          const snapshot = {
            // Canonical KPI fields — match MetricsSnapshot interface.
            ctr: latestStat?.ctr ?? 0,
            cpm: latestStat?.cpm ?? 0,
            cpc: latestStat?.cpc ?? 0,
            roas: latestStat?.roas ?? 0,
            frequency: latestStat?.frequency ?? 0,
            spend: latestStat ? Number(latestStat.spend) : 0,
            impressions: latestStat ? Number(latestStat.impressions) : 0,
            conversions: latestStat ? Number(latestStat.conversions) : 0,
            // Provenance — retained for debugging the closed-loop in prod.
            actionCode: top.actionCode,
            priority: top.priority,
            date: top.date,
            sampledFromDate: latestStat?.date ?? null,
          };
          await recService.logRecommendation({
            workspaceId,
            verdict: `${top.actionCode} (${top.priority})`,
            metricsSnapshot: snapshot,
          });
        } catch (err) {
          console.error('[RecLog] failed to log recommendation:', err);
        }
      })();
    }

    return c.json(safeJson(recs));
  });

  /** POST /api/workspaces/:workspaceId/recommendations/:logId/action
   *  Body: { action: "EXECUTED" | "IGNORED" }
   *  Tracks the user's response to a surfaced recommendation.
   */
  app.post('/api/workspaces/:workspaceId/recommendations/:logId/action', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const workspaceId = req.params['workspaceId'];
    if (!await checkMember(userId, workspaceId)) return c.json({ error: 'Access denied' }, 403);
    const logId = req.params['logId'];
    const body = await c.req.json<{ action?: string }>();
    const action = body?.action;
    if (action !== 'EXECUTED' && action !== 'IGNORED') {
      return c.json({ error: 'action must be EXECUTED or IGNORED' }, 400);
    }
    const updated = await recService.trackUserAction(logId, action);
    return c.json(safeJson(updated));
  });

  /** GET /api/workspaces/:workspaceId/issues — detected issues (Rules Engine output). */
  app.get('/api/workspaces/:workspaceId/issues', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, req.params['workspaceId'])) return c.json({ error: 'Access denied' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json([]);
    const issues = await prisma.detectedIssue.findMany({
      where: { entityType: EntityType.ACCOUNT, entityId: account.id },
      orderBy: [{ severity: 'desc' }, { date: 'desc' }],
    });
    return c.json(safeJson(issues));
  });

  // ════════════════════════════════════════════════════════════════════════
  //  AI CHAT — data-driven assistant using live dashboard context
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/workspaces/:workspaceId/ai/chat
   * Accepts { message: string }, returns { reply: string }.
   * Generates a data-grounded response by loading the dashboard DTO and
   * applying keyword-matched response strategies against live metrics.
   */
  app.post('/api/workspaces/:workspaceId/ai/chat', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { workspaceId } = req.params;
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, workspaceId)) return c.json({ error: 'Access denied' }, 403);
    if (!workspaceId) return c.json({ error: 'Missing workspaceId' }, 400);
    const body = req.body as { message?: string };
    const message = (body.message ?? '').trim().toLowerCase();
    if (!message) return c.json({ error: 'Message is required' }, 400);

    // Load live data for context
    let dto: Awaited<ReturnType<typeof getDashboard>> | null = null;
    try { dto = await getDashboard(workspaceId, { prisma }); } catch (err) {
      console.error('[adlytic:ai-chat] getDashboard error:', err);
    }

    let reply: string;
    try {
      const context = buildAiContext(dto ?? { empty: true, health: { score: 0, band: 'none' }, kpis: [], trendSeries: { dates: [], messages: [], spend: [], ctr: [] }, issues: [], priorityAction: null, bestCampaign: null, worstCampaign: null }, message);
      reply = await askClaude(context);
    } catch (err) {
      console.error('[adlytic:ai-chat] Claude API error:', err);
      reply = 'Sorry, the AI assistant is temporarily unavailable. Please try again in a moment.';
    }
    return c.json({ reply });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  META ADS — OAuth flow + ad-account management
  // ════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/meta/oauth/start?workspaceId=xxx
   * Returns { url } to redirect the user to Facebook's consent screen.
   * Returns { configured: false } when META_APP_ID / META_APP_SECRET are absent
   * so the UI can fall back to manual token entry.
   */
  app.get('/api/meta/oauth/start', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);

    const workspaceId = c.req.query('workspaceId');
    if (!workspaceId) return c.json({ error: 'workspaceId is required' }, 400);

    // Resolve userId from bearer token
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    if (!await checkMember(userId, workspaceId)) return c.json({ error: 'Access denied' }, 403);

    const status = getMetaOAuthConfigStatus();
    const oauth  = buildMetaOAuth();
    if (!oauth || !status.ok) {
      // Backward compat: keep `configured: false` so the existing UI fallback
      // (manual token modal) continues to trigger. `reason` is additive.
      const reason = !status.ok ? status.reason : 'Meta OAuth is not configured on this server.';
      return c.json({
        configured: false,
        reason,
        message: `${reason}. You can still connect by pasting an access token manually.`,
      });
    }

    pruneOAuth();
    const state = (await import('node:crypto')).randomBytes(32).toString('hex');
    oauthStates.set(state, { workspaceId, userId, expiresAt: Date.now() + 10 * 60_000 });

    return c.json({ url: oauth.getAuthorizationUrl(state), configured: true });
  });

  /**
   * GET /api/meta/oauth/callback?code=xxx&state=yyy
   * Called by Meta after the user grants (or denies) permission.
   * Exchanges the code, fetches ad accounts, stores a session, redirects to /meta/connect.
   */
  app.get('/api/meta/oauth/callback', async (c) => {
    const code  = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      const desc = c.req.query('error_description') ?? error;
      return c.redirect(`/workspace?oauth_error=${encodeURIComponent(desc)}`);
    }
    if (!code || !state) return c.redirect('/workspace?oauth_error=missing_params');

    pruneOAuth();
    const stored = oauthStates.get(state);
    if (!stored || stored.expiresAt < Date.now()) {
      return c.redirect('/workspace?oauth_error=expired_state');
    }
    oauthStates.delete(state); // one-time use

    const oauth = buildMetaOAuth();
    if (!oauth) return c.redirect('/workspace?oauth_error=not_configured');

    try {
      // Exchange code → short-lived token → long-lived token
      const shortToken = await oauth.exchangeCode(code);
      const { token: longToken, expiresInSeconds } = await oauth.getLongLivedToken(shortToken);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      // Fetch user's ad accounts
      const accounts = await oauth.getAdAccounts(longToken);

      // Store in session
      const sessionId = (await import('node:crypto')).randomBytes(32).toString('hex');
      oauthSessions.set(sessionId, {
        workspaceId:  stored.workspaceId,
        userId:       stored.userId,
        accessToken:  longToken,
        expiresAt,
        accounts,
        createdAt:    Date.now(),
      });

      return c.redirect(`/meta/connect?session=${sessionId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[adlytic:meta-oauth]', msg);
      return c.redirect(`/workspace?oauth_error=${encodeURIComponent(msg)}`);
    }
  });

  /**
   * GET /api/meta/oauth/accounts/:sessionId
   * Returns the ad accounts retrieved during the OAuth flow.
   */
  app.get('/api/meta/oauth/accounts/:sessionId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    pruneOAuth();
    const session = oauthSessions.get(c.req.param('sessionId'));
    if (!session) return c.json({ error: 'Session not found or expired. Please reconnect.' }, 404);
    if (session.userId !== userId) return c.json({ error: 'Forbidden' }, 403);
    return c.json({ accounts: session.accounts, workspaceId: session.workspaceId });
  });

  /**
   * POST /api/meta/oauth/connect
   * Body: { sessionId, externalAccountId, workspaceId }
   * Creates (or updates) the AdAccount row with the encrypted token.
   * Responds with { success: true } — the client then navigates to /workspace?connected=1.
   */
  app.post('/api/meta/oauth/connect', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = req.body as { sessionId?: string; externalAccountId?: string; workspaceId?: string };
    const { sessionId, externalAccountId, workspaceId } = body;
    if (!sessionId || !externalAccountId || !workspaceId) {
      return c.json({ error: 'sessionId, externalAccountId, and workspaceId are required' }, 400);
    }

    const wsm = await checkMember(userId, workspaceId);
    if (!wsm) return c.json({ error: 'Forbidden' }, 403);
    if (wsm.role === 'VIEWER') return c.json({ error: 'Forbidden' }, 403);

    pruneOAuth();
    const session = oauthSessions.get(sessionId);
    if (!session) return c.json({ error: 'Session not found or expired. Please reconnect.' }, 404);
    if (session.workspaceId !== workspaceId) return c.json({ error: 'Workspace mismatch' }, 403);
    if (session.userId !== userId) return c.json({ error: 'Session does not belong to you' }, 403);

    const account = session.accounts.find(a => a.id === externalAccountId);
    if (!account) return c.json({ error: 'Account not found in session' }, 404);

    const encryptedToken = encryptToken(session.accessToken);
    const apiVersion     = process.env['META_API_VERSION'] ?? 'v20.0';
    const timezone       = account.timezone_name ?? 'UTC';
    const countryCode    = tzToCountry(account.timezone_name);

    // Upsert the ad account (unique on platform + externalAccountId)
    const existing = await prisma.adAccount.findFirst({
      where: { platform: 'META', externalAccountId: account.id },
    });

    if (existing) {
      await prisma.adAccount.update({
        where: { id: existing.id },
        data: {
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt:       session.expiresAt,
          name:                 account.name,
          currency:             account.currency,
          timezone,
          countryCode,
          workspaceId,
          status:               'ACTIVE',
        },
      });
    } else {
      await prisma.adAccount.create({
        data: {
          workspaceId,
          platform:             'META',
          externalAccountId:    account.id,
          name:                 account.name,
          currency:             account.currency,
          // IQD has no practical minor unit (1 IQD = 1 IQD minor).
          // All other major currencies (USD, EUR, GBP, AED, SAR, …) use 100.
          currencyMinorFactor:  account.currency === 'IQD' ? 1 : 100,
          timezone,
          countryCode,
          status:               'ACTIVE',
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt:       session.expiresAt,
        },
      });
    }

    // Invalidate session — one-time use
    oauthSessions.delete(sessionId);

    // Kick off initial INITIAL_BACKFILL_DAYS-day chunked sync in the background.
    // We persist a SyncJob so the frontend can poll progress on first connect.
    try {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      const acct = ws?.adAccounts.find(a => a.externalAccountId === account.id);
      if (acct?.accessTokenEncrypted) {
        const metaClient = new MetaClient({ apiVersion, accessToken: decryptToken(acct.accessTokenEncrypted) });
        const worker = new SyncAccountWorker(prisma, metaClient);
        const now = new Date();
        const since = new Date(now.getTime() - (INITIAL_BACKFILL_DAYS - 1) * 86400 * 1000);
        const job = await prisma.syncJob.create({
          data: {
            adAccountId: acct.id,
            status: SyncJobStatus.PENDING,
            windowDays: INITIAL_BACKFILL_DAYS,
            windowSince: since,
            windowUntil: now,
            triggeredBy: 'oauth-callback',
          },
        });
        setImmediate(() => {
          void (async () => {
            try {
              await worker.syncChunked(job.id);
              const final = await prisma.syncJob.findUnique({ where: { id: job.id } });
              if (final?.status === SyncJobStatus.COMPLETED) {
                await runEngines(prisma, acct.id);
                await runBrainOrchestrator(prisma, metaClient, acct.id);  // 🧠 V6 Brain V2 tick
              }
            } catch (err: unknown) { console.error('[adlytic:initial-sync]', err); }
          })();
        });
      }
    } catch { /* non-fatal */ }

    return c.json({ success: true });
  });

  /**
   * POST /api/workspaces/:workspaceId/ad-accounts
   * Manual token entry fallback — for users who have a token from Meta's Graph API Explorer.
   * Body: { externalAccountId, name, currency, timezone, accessToken }
   */
  app.post('/api/workspaces/:workspaceId/ad-accounts', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const workspaceId = req.params['workspaceId'];
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const wsm = await checkMember(userId, workspaceId);
    if (!wsm) return c.json({ error: 'Access denied' }, 403);
    if (wsm.role === 'VIEWER') return c.json({ error: 'Insufficient permissions' }, 403);
    const body = req.body as {
      externalAccountId?: string; name?: string;
      currency?: string; timezone?: string; accessToken?: string;
    };
    if (!body.externalAccountId || !body.accessToken) {
      return c.json({ error: 'externalAccountId and accessToken are required' }, 400);
    }
    const extId = body.externalAccountId.startsWith('act_')
      ? body.externalAccountId
      : `act_${body.externalAccountId}`;

    // Validate the token against Meta API before saving — fail fast with a clear error.
    // Also pull timezone_name here so we can derive countryCode without user input.
    const apiVersion = process.env['META_API_VERSION'] ?? 'v20.0';
    let metaTimezone: string | null = null;
    try {
      const testUrl = `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(extId)}?fields=id,name,currency,timezone_name,account_status&access_token=${encodeURIComponent(body.accessToken)}`;
      const testRes = await fetch(testUrl);
      const testData = await testRes.json() as Record<string, unknown>;
      if (testData['error']) {
        const err = testData['error'] as Record<string, unknown>;
        return c.json({ error: `Meta API rejected credentials: ${String(err['message'] ?? err['type'] ?? 'invalid token or account ID')}` }, 422);
      }
      if (!testData['id']) {
        return c.json({ error: 'Meta API returned no account data — check your account ID and token' }, 422);
      }
      // Use the verified name/currency/timezone from Meta if user left them blank
      if (!body.name && testData['name']) body.name = String(testData['name']);
      if (!body.currency && testData['currency']) body.currency = String(testData['currency']);
      if (testData['timezone_name']) metaTimezone = String(testData['timezone_name']);
    } catch (fetchErr) {
      // Network error — don't block connection, just log
      console.warn('[adlytic:manual-connect] Could not verify token with Meta:', fetchErr);
    }

    const resolvedTimezone = metaTimezone ?? body.timezone ?? 'UTC';
    const countryCode      = tzToCountry(resolvedTimezone);
    const encryptedToken   = encryptToken(body.accessToken);
    const existing = await prisma.adAccount.findFirst({
      where: { platform: 'META', externalAccountId: extId },
    });
    if (existing) {
      await prisma.adAccount.update({
        where: { id: existing.id },
        data: {
          accessTokenEncrypted: encryptedToken,
          workspaceId,
          name:        body.name ?? existing.name,
          timezone:    resolvedTimezone,
          countryCode,
        },
      });
      return c.json({ success: true, id: existing.id });
    }
    const resolvedCurrency = body.currency ?? 'USD';
    const acct = await prisma.adAccount.create({
      data: {
        workspaceId,
        platform:             'META',
        externalAccountId:    extId,
        name:                 body.name ?? extId,
        currency:             resolvedCurrency,
        currencyMinorFactor:  resolvedCurrency === 'IQD' ? 1 : 100,
        timezone:             resolvedTimezone,
        countryCode,
        status:               'ACTIVE',
        accessTokenEncrypted: encryptedToken,
      },
    });
    return c.json({ success: true, id: acct.id });
  });

  /**
   * DELETE /api/workspaces/:workspaceId/ad-accounts/:accountId
   * Removes the ad account connection (data preserved for auditing).
   */
  app.delete('/api/workspaces/:workspaceId/ad-accounts/:accountId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const { workspaceId, accountId } = req.params as Record<string, string>;
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const wsm = await checkMember(userId, workspaceId);
    if (!wsm) return c.json({ error: 'Access denied' }, 403);
    if (wsm.role === 'VIEWER') return c.json({ error: 'Insufficient permissions' }, 403);
    const acct = await prisma.adAccount.findFirst({ where: { id: accountId, workspaceId } });
    if (!acct) return c.json({ error: 'Account not found' }, 404);

    // Collect campaign IDs for analytics cleanup (analytics tables have no FK to campaigns)
    const campaignRecords = await prisma.campaign.findMany({
      where: { adAccountId: accountId },
      select: { id: true },
    });
    const campaignIds = campaignRecords.map(c => c.id);

    // Clean up orphaned analytics rows that reference this account by entityId.
    // raw_insights, daily_stats, metric_trends, detected_issues, recommendations,
    // and health_scores store entityId as a plain String (no FK) so they are NOT
    // covered by Prisma's cascade delete. Remove them explicitly before deleting
    // the account to prevent data leakage and satisfy GDPR right-to-erasure.
    await prisma.$transaction([
      prisma.rawInsight.deleteMany({     where: { entityType: EntityType.ACCOUNT, entityId: accountId } }),
      prisma.dailyStat.deleteMany({      where: { entityType: EntityType.ACCOUNT, entityId: accountId } }),
      prisma.metricTrend.deleteMany({    where: { entityType: EntityType.ACCOUNT, entityId: accountId } }),
      prisma.detectedIssue.deleteMany({  where: { entityType: EntityType.ACCOUNT, entityId: accountId } }),
      prisma.recommendation.deleteMany({ where: { entityType: EntityType.ACCOUNT, entityId: accountId } }),
      prisma.healthScore.deleteMany({    where: { entityType: EntityType.ACCOUNT, entityId: accountId } }),
      // Campaign-level analytics rows (no FK cascade — must delete explicitly)
      ...(campaignIds.length ? [
        prisma.dailyStat.deleteMany({   where: { entityType: EntityType.CAMPAIGN, entityId: { in: campaignIds } } }),
        prisma.healthScore.deleteMany({ where: { entityType: EntityType.CAMPAIGN, entityId: { in: campaignIds } } }),
      ] : []),
    ]);

    await prisma.adAccount.delete({ where: { id: accountId } });
    return c.json({ success: true });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  SYNC TRIGGER — fires SyncAccountWorker in the background
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/workspaces/:workspaceId/sync — enqueue a background ETL sync.
   *
   * Body: { windowDays?: number }  (default 3, min 1, max 90)
   *
   * Creates a SyncJob row (status=PENDING), fires the chunked worker via
   * setImmediate, and returns 202 with the jobId. Clients poll
   * GET /api/sync-jobs/:jobId for progress; engines + Brain run once at
   * the end of a successful job, not per chunk.
   */
  app.post('/api/workspaces/:workspaceId/sync', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const wsm = await checkMember(userId, req.params['workspaceId']);
    if (!wsm) return c.json({ error: 'Access denied' }, 403);
    if (wsm.role === 'VIEWER') return c.json({ error: 'Insufficient permissions — only Owners and Managers can trigger sync' }, 403);
    const { account } = await getAccount(req.params['workspaceId']);
    if (!account) return c.json({ error: 'No ad account found for this workspace' }, 404);
    if (!account.accessTokenEncrypted) {
      return c.json({ error: 'No access token configured — connect a Meta account first' }, 422);
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      return c.json({ error: 'Meta access token has expired — please reconnect your account' }, 422);
    }

    // ── Validate windowDays (1..MAX_BACKFILL_DAYS, default DEFAULT_INCREMENTAL_BACKFILL_DAYS)
    const body = (req.body ?? {}) as { windowDays?: number };
    const rawDays = body.windowDays;
    const windowDays = typeof rawDays === 'number' && Number.isFinite(rawDays)
      ? Math.trunc(rawDays)
      : DEFAULT_INCREMENTAL_BACKFILL_DAYS;
    if (windowDays < 1 || windowDays > MAX_BACKFILL_DAYS) {
      return c.json({ error: `windowDays must be between 1 and ${MAX_BACKFILL_DAYS}` }, 422);
    }

    const now = new Date();
    const since = new Date(now.getTime() - (windowDays - 1) * 86400 * 1000);
    const job = await prisma.syncJob.create({
      data: {
        adAccountId: account.id,
        status: SyncJobStatus.PENDING,
        windowDays,
        windowSince: since,
        windowUntil: now,
        triggeredBy: userId,
      },
    });

    const apiVersion = process.env['META_API_VERSION'] ?? 'v20.0';
    const accessToken = decryptToken(account.accessTokenEncrypted);
    const metaClient = new MetaClient({ apiVersion, accessToken });
    const worker = new SyncAccountWorker(prisma, metaClient);

    // Fire-and-forget: setImmediate yields control back to the event loop so
    // we can return 202 immediately. The worker updates SyncJob status as it
    // progresses; engines + Brain run only on COMPLETED.
    setImmediate(() => {
      void (async () => {
        try {
          await worker.syncChunked(job.id);
          const final = await prisma.syncJob.findUnique({ where: { id: job.id } });
          if (final?.status === SyncJobStatus.COMPLETED) {
            await runEngines(prisma, account.id);
            await runBrainOrchestrator(prisma, metaClient, account.id);
          }
        } catch (err: unknown) {
          console.error('[adlytic:syncChunked]', err);
        }
      })();
    });

    return c.json({
      jobId: job.id,
      status: job.status,
      windowDays,
      adAccountId: account.id,
    }, 202);
  });

  /**
   * GET /api/sync-jobs/:jobId — poll a SyncJob for progress.
   * Auth: the caller must be a member of the workspace that owns the
   * underlying AdAccount.
   */
  app.get('/api/sync-jobs/:jobId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const userId = await getUserId(req.bearerToken);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);

    const jobId = req.params['jobId'];
    const job = await prisma.syncJob.findUnique({
      where: { id: jobId },
      include: { adAccount: { select: { workspaceId: true, externalAccountId: true } } },
    });
    if (!job) return c.json({ error: 'Sync job not found' }, 404);

    const wsm = await checkMember(userId, job.adAccount.workspaceId);
    if (!wsm) return c.json({ error: 'Access denied' }, 403);

    return c.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      chunksDone: job.chunksDone,
      chunksTotal: job.chunksTotal,
      windowDays: job.windowDays,
      windowSince: job.windowSince,
      windowUntil: job.windowUntil,
      cursorDate: job.cursorDate,
      rowsFetched: job.rowsFetched,
      rowsUpserted: job.rowsUpserted,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      adAccountId: job.adAccountId,
      externalAccountId: job.adAccount.externalAccountId,
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
    // Prisma P2025 = record not found (findUniqueOrThrow / updateOrThrow)
    // Return 404 instead of 500 to avoid leaking internal error details.
    if ((err as any)?.code === 'P2025') {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.json(
      { error: 'Internal server error' },
      500
    );
  });

  return app;
}
