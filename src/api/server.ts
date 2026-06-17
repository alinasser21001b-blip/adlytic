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
import { EntityType, WorkspaceRole, type Locale } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { honoToApiRequest } from './adapter';
import { getDashboard } from '../services/getDashboard';
import { SyncAccountWorker } from '../workers/syncAccount';
import { runEngines } from '../workers/runEngines';
import { MetaClient } from '../services/metaClient';
import { loginPage } from '../web/pages/loginPage';
import { dashboardPage } from '../web/pages/dashboardPage';
import { campaignsPage } from '../web/pages/campaignsPage';
import { recommendationsPage } from '../web/pages/recommendationsPage';
import { workspacePage } from '../web/pages/workspacePage';
import { aiPage } from '../web/pages/aiPage';
import { settingsPage } from '../web/pages/settingsPage';
import { metaConnectPage } from '../web/pages/metaConnectPage';
import { encryptToken, decryptToken } from '../services/tokenEncryption';
import { buildMetaOAuth, type MetaAdAccountInfo } from '../services/metaOAuth';

// ── Route count ───────────────────────────────────────────────────────────

export const ROUTE_COUNT = 51;

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

// ── AI reply generator ─────────────────────────────────────────────────────

type DashboardDTO = Awaited<ReturnType<typeof getDashboard>>;

function generateAiReply(msg: string, dto: DashboardDTO | null): string {
  if (!dto || dto.empty || !dto.workspace) {
    return 'I don\'t have any campaign data to analyze yet. Once you connect a Meta Ads account and run a sync, I\'ll be able to give you data-driven insights about your campaigns.\n\nIn the meantime, here are general tips:\n- **CTR benchmarks**: 1–2% is average for Meta, 2%+ is strong\n- **Frequency**: Keep below 3–4 for cold audiences, below 6 for warm\n- **CPM**: Varies widely by industry — track trends, not absolutes\n- **Budget pacing**: Even daily spend is a positive signal';
  }

  const ws   = dto.workspace;
  const h    = dto.health;
  const kpis = dto.kpis;
  const issues = dto.issues ?? [];
  const rec  = dto.priorityAction;

  const kpi = (key: string) => kpis.find(k => k.key === key);
  const spend    = kpi('spend');
  const ctr      = kpi('ctr');
  const cpm      = kpi('cpm');
  const freq     = kpi('frequency');
  const msgs     = kpi('messages');
  const reach    = kpi('reach');

  // CTR-related questions
  if (/ctr|click.through|clicks dropping|clicks down/.test(msg)) {
    const ctrVal  = ctr?.value ?? 0;
    const ctrDisp = ctr?.display ?? '—';
    const delta   = ctr?.deltaPct != null ? (ctr.deltaPct * 100).toFixed(1) + '%' : null;
    const hasCtrIssue = issues.some(i => i.code === 'LOW_CTR');
    let reply = `**CTR Analysis for ${ws.name}**\n\nYour current CTR is **${ctrDisp}**`;
    if (delta) reply += ` (${ctr!.direction === 'down' ? '↓' : '↑'} ${delta} vs. prior period)`;
    reply += '.\n\n';
    if (ctrVal < 0.01) {
      reply += '⚠️ Your CTR is below 1%, which is a warning sign. ';
    } else if (ctrVal < 0.02) {
      reply += 'Your CTR is in the average range (1–2%). There\'s room to improve. ';
    } else {
      reply += '✅ Your CTR is strong (above 2%). ';
    }
    if (hasCtrIssue) {
      reply += '\n\n**Root causes detected:**\n';
      const issue = issues.find(i => i.code === 'LOW_CTR');
      if (issue?.causes?.length) reply += issue.causes.map(c => `- ${c}`).join('\n');
      if (issue?.recommendations?.length) {
        reply += '\n\n**Recommended actions:**\n';
        reply += issue.recommendations.map(r => `- ${r}`).join('\n');
      }
    } else {
      reply += '\n\n**To maintain or improve CTR:**\n- Test 3–5 creative variants per ad set\n- Narrow audience targeting to improve relevance score\n- Use video or carousel for higher engagement\n- Refresh creatives every 3–4 weeks to avoid fatigue';
    }
    return reply;
  }

  // Frequency / ad fatigue
  if (/frequenc|fatigue|ad fatigue|seen too many/.test(msg)) {
    const freqVal  = freq?.value ?? 0;
    const freqDisp = freq?.display ?? '—';
    const hasFatigue = issues.some(i => ['HIGH_FREQUENCY','AUDIENCE_FATIGUE'].includes(i.code));
    let reply = `**Frequency Analysis for ${ws.name}**\n\nCurrent average frequency: **${freqDisp}**\n\n`;
    if (freqVal >= 6) {
      reply += '🔴 **Critical**: Frequency is very high (6+). Your audience has seen your ads too many times. This is causing diminishing returns.\n\n**Immediate actions:**\n- Expand your target audience\n- Refresh all creative assets\n- Add new audience segments (lookalikes, interests)\n- Consider pausing high-frequency ad sets for 1–2 weeks';
    } else if (freqVal >= 4) {
      reply += '🟡 **Warning**: Frequency is elevated (4–6). Watch for declining CTR and rising CPM.\n\n**Preventive actions:**\n- Rotate creative assets now\n- Test new audience segments\n- Set frequency caps in campaign settings';
    } else if (freqVal >= 2) {
      reply += '🟢 **Healthy**: Frequency is in the normal range (2–4). Continue monitoring.\n\n- Schedule creative refresh in 2–3 weeks\n- Monitor CTR trend for early fatigue signals';
    } else {
      reply += '✅ Frequency is low — your reach is healthy relative to impressions.';
    }
    if (hasFatigue) {
      const issue = issues.find(i => ['HIGH_FREQUENCY','AUDIENCE_FATIGUE'].includes(i.code));
      if (issue?.recommendations?.length) {
        reply += '\n\n**Specific recommendations from your data:**\n' + issue.recommendations.map(r => `- ${r}`).join('\n');
      }
    }
    return reply;
  }

  // Budget / spend questions
  if (/budget|spend|cost|money|expensive|cpm|efficient/.test(msg)) {
    const spendDisp = spend?.display ?? '—';
    const cpmDisp   = cpm?.display ?? '—';
    const cpmVal    = cpm?.value ?? 0;
    const hasBudget = issues.some(i => ['HIGH_CPM','BUDGET_BURNING_FAST'].includes(i.code));
    let reply = `**Budget & Spend Analysis for ${ws.name}**\n\n`;
    reply += `- **Total spend** (30d): ${spendDisp}\n- **CPM**: ${cpmDisp}\n- **Active campaigns**: ${ws.activeCampaigns}\n\n`;
    if (cpmVal > 0 && cpmVal > 1000) {
      reply += '⚠️ CPM is elevated. This can indicate audience saturation or high competition.\n\n**To reduce CPM:**\n- Broaden targeting — narrow audiences compete more aggressively\n- Test different placements (Reels, Stories tend to have lower CPM)\n- Adjust bidding strategy — switch from cost cap to lowest cost temporarily\n- Schedule ads during off-peak hours';
    } else {
      reply += '✅ CPM is within acceptable range.\n\n**Budget efficiency tips:**\n- Allocate 70% to proven campaigns, 30% to tests\n- Use campaign budget optimization (CBO) for automatic allocation\n- Set daily budget caps to prevent overspend\n- Review spend pacing every 3 days';
    }
    if (hasBudget) {
      const issue = issues.find(i => ['HIGH_CPM','BUDGET_BURNING_FAST'].includes(i.code));
      if (issue?.causes?.length) reply += '\n\n**Detected causes:**\n' + issue.causes.map(c => `- ${c}`).join('\n');
    }
    return reply;
  }

  // Scaling / which campaign to scale
  if (/scale|best campaign|top campaign|winning|double/.test(msg)) {
    const best  = dto.bestCampaign;
    const worst = dto.worstCampaign;
    let reply = `**Campaign Scaling Recommendation for ${ws.name}**\n\n`;
    if (best) {
      reply += `**Best performing campaign:**\n- Name: ${best.name}\n- Health score: **${best.health}/100** (${best.band})\n- Messages: ${best.messages.toLocaleString()}\n`;
      if (best.ctr != null) reply += `- CTR: ${best.ctr.toFixed(1)}%\n`;
      if (best.cpm != null) reply += `- CPM: ${best.cpm.toFixed(0)}\n`;
      reply += '\n**Scaling strategy:**\n- Increase budget by 20–30% every 3–4 days (avoid the learning phase reset)\n- Duplicate the ad set and test with a slightly broader audience\n- Keep original running while testing the scaled version\n- Monitor CPA/CPM for the first 48h after each budget increase';
    }
    if (worst && worst.id !== best?.id) {
      reply += `\n\n**Lowest performing campaign:**\n- Name: ${worst.name}\n- Health score: **${worst.health}/100** (${worst.band})\n\nConsider pausing or reducing budget on this campaign until the creative or targeting is refreshed.`;
    }
    if (!best) reply += 'No active campaign data available yet. Run a sync to load campaign performance.';
    return reply;
  }

  // What to do next / general recommendation
  if (/what.*(next|do|should|recommend|action|improve|fix)|next step|priority/.test(msg)) {
    let reply = `**Priority Action Plan for ${ws.name}**\n\nHealth Score: **${h.score}/100** (${h.band})\n\n`;
    if (issues.length === 0) {
      reply += '✅ No issues detected. Your campaigns are performing well.\n\n**Ongoing best practices:**\n- Review creative performance weekly\n- Test new audience segments monthly\n- Monitor frequency and refresh creatives proactively\n- Set up A/B tests for ad copy and visuals';
    } else {
      reply += `I've identified **${issues.length} issue${issues.length > 1 ? 's' : ''}** across your campaigns.\n\n`;
      if (rec) {
        reply += `**#1 Priority Action: ${rec.actionCode.replace(/_/g, ' ')}** (${rec.priority})\n${rec.text}\n\n`;
      }
      reply += '**All detected issues (by severity):**\n';
      issues.forEach((issue, i) => {
        reply += `\n${i + 1}. **${issue.code.replace(/_/g, ' ')}** — ${issue.severity}\n`;
        if (issue.recommendations?.length) {
          reply += `   → ${issue.recommendations[0]}\n`;
        }
      });
    }
    return reply;
  }

  // Health score questions
  if (/health|score|overall|performance|how.*doing/.test(msg)) {
    const scoreColor = h.score >= 90 ? '✅' : h.score >= 70 ? '🟢' : h.score >= 50 ? '🟡' : '🔴';
    let reply = `**Campaign Health for ${ws.name}**\n\n${scoreColor} Health Score: **${h.score}/100** — ${h.band.toUpperCase()}\n\n`;
    reply += `**Summary:**\n- Active campaigns: ${ws.activeCampaigns}\n- CTR: ${ctr?.display ?? '—'}\n- CPM: ${cpm?.display ?? '—'}\n- Frequency: ${freq?.display ?? '—'}\n- Reach (30d): ${reach?.display ?? '—'}\n\n`;
    if (h.score < 50) {
      reply += '🔴 Score is low. Immediate attention required — see the Recommendations page for priority actions.';
    } else if (h.score < 70) {
      reply += '🟡 Score is moderate. There are improvement opportunities. Review detected issues.';
    } else {
      reply += '🟢 Score is healthy. Continue current strategy and monitor weekly.';
    }
    return reply;
  }

  // Declining results
  if (/declin|drop|falling|results.*down|getting worse/.test(msg)) {
    const hasDeclining = issues.some(i => i.code === 'DECLINING_RESULTS');
    let reply = `**Declining Results Analysis for ${ws.name}**\n\n`;
    if (hasDeclining) {
      const issue = issues.find(i => i.code === 'DECLINING_RESULTS');
      reply += '⚠️ Declining results detected in your campaign data.\n\n';
      if (issue?.causes?.length) reply += '**Root causes:**\n' + issue.causes.map(c => `- ${c}`).join('\n') + '\n\n';
      if (issue?.recommendations?.length) reply += '**Recommended actions:**\n' + issue.recommendations.map(r => `- ${r}`).join('\n');
    } else {
      reply += 'No actively declining results detected in your current data window.\n\n**Monitoring checklist:**\n- Track 7-day vs 14-day result trends weekly\n- Watch for rising CPR (cost per result) as an early signal\n- Compare current week to same week last month\n- Check if seasonality or competition is a factor';
    }
    return reply;
  }

  // Default / general
  const healthEmoji = h.score >= 70 ? '🟢' : h.score >= 50 ? '🟡' : '🔴';
  return `Here's a quick overview of **${ws.name}**:\n\n${healthEmoji} **Health Score**: ${h.score}/100 (${h.band})\n📊 **Active Campaigns**: ${ws.activeCampaigns}\n💰 **Spend (30d)**: ${spend?.display ?? '—'}\n📣 **CTR**: ${ctr?.display ?? '—'}\n🔁 **Frequency**: ${freq?.display ?? '—'}\n${issues.length > 0 ? `⚠️ **Issues detected**: ${issues.length}` : '✅ **No issues detected**'}\n\n${rec ? `**Top priority action:** ${rec.text}` : 'No priority actions at this time.'}\n\n---\nAsk me specific questions like:\n- *"Why is CTR dropping?"*\n- *"Is frequency too high?"*\n- *"Which campaign should I scale?"*\n- *"What should I do next?"*`;
}

// ── Application factory ───────────────────────────────────────────────────

export function buildRoutes(prisma: PrismaClient): Hono {
  const app = new Hono();

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

  // ════════════════════════════════════════════════════════════════════════
  //  WEB UI — server-rendered HTML pages
  // ════════════════════════════════════════════════════════════════════════

  app.get('/',               (c) => c.redirect('/dashboard'));
  app.get('/login',          (c) => c.html(loginPage()));
  app.get('/dashboard',      (c) => c.html(dashboardPage()));
  app.get('/campaigns',      (c) => c.html(campaignsPage()));
  app.get('/recommendations',(c) => c.html(recommendationsPage()));
  app.get('/workspace',      (c) => c.html(workspacePage()));
  app.get('/ai',             (c) => c.html(aiPage()));
  app.get('/settings',       (c) => c.html(settingsPage()));
  app.get('/meta/connect',   (c) => c.html(metaConnectPage(c.req.query('session') ?? '')));

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
    const body = await c.req.json() as { email?: string; password?: string; name?: string };
    if (!body.email || !body.password) return c.json({ error: 'email and password are required' }, 400);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return c.json({ error: 'Email already in use' }, 409);
    const passwordHash = createHash('sha256').update(body.password).digest('hex');
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name ?? body.email.split('@')[0], passwordHash },
    });
    // Create a default workspace for the new user
    const workspace = await prisma.workspace.create({
      data: {
        name: `${body.name ?? body.email.split('@')[0]}'s Workspace`,
        members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
      },
    });
    const token = Buffer.from(`${user.id}:${user.email}`).toString('base64');
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name ?? null }, workspaceId: workspace.id }, 201);
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

  /** PATCH /api/auth/profile — update display name. */
  app.patch('/api/auth/profile', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    let userId: string;
    try {
      const decoded = Buffer.from(req.bearerToken, 'base64').toString('utf8');
      userId = decoded.split(':')[0] ?? '';
    } catch { return c.json({ error: 'Invalid token' }, 401); }
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const body = req.body as { name?: string };
    if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: body.name.trim() },
      select: { id: true, name: true, email: true },
    });
    return c.json(user);
  });

  /** POST /api/auth/password — change password (requires current password). */
  app.post('/api/auth/password', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    let userId: string;
    try {
      const decoded = Buffer.from(req.bearerToken, 'base64').toString('utf8');
      userId = decoded.split(':')[0] ?? '';
    } catch { return c.json({ error: 'Invalid token' }, 401); }
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    const body = req.body as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword) return c.json({ error: 'Both passwords are required' }, 400);
    if (body.newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400);
    const currentHash = createHash('sha256').update(body.currentPassword).digest('hex');
    const user = await prisma.user.findFirst({ where: { id: userId, passwordHash: currentHash } });
    if (!user) return c.json({ error: 'Current password is incorrect' }, 403);
    const newHash = createHash('sha256').update(body.newPassword).digest('hex');
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    return c.json({ success: true });
  });

  /** DELETE /api/auth/account — permanently delete the authenticated user. */
  app.delete('/api/auth/account', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    let userId: string;
    try {
      const decoded = Buffer.from(req.bearerToken, 'base64').toString('utf8');
      userId = decoded.split(':')[0] ?? '';
    } catch { return c.json({ error: 'Invalid token' }, 401); }
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
    await prisma.user.delete({ where: { id: userId } });
    return c.json({ success: true });
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
    try {
      const dto = await getDashboard(workspaceId);
      return c.json(dto);
    } catch (e: any) {
      if (e?.message?.includes('no ad account') || e?.code === 'P2025') {
        return c.json({ empty: true, workspace: { id: workspaceId } }, 200);
      }
      throw e;
    }
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
          select: { id: true, name: true, currency: true, status: true, lastSyncedAt: true, externalAccountId: true, tokenExpiresAt: true },
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

  /** POST /api/workspaces/:workspaceId/members — add a user by userId. */
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

  /** POST /api/workspaces/:workspaceId/members/invite — add a user by email. */
  app.post('/api/workspaces/:workspaceId/members/invite', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
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
    return c.json(member, 201);
  });

  /** PATCH /api/workspaces/:workspaceId/members/:memberId — change role. */
  app.patch('/api/workspaces/:workspaceId/members/:memberId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
    const body = req.body as { role?: string };
    const role: WorkspaceRole =
      body.role === 'OWNER' ? WorkspaceRole.OWNER
      : body.role === 'MANAGER' ? WorkspaceRole.MANAGER
      : WorkspaceRole.VIEWER;
    const member = await prisma.workspaceMember.update({
      where: { id: req.params['memberId'] },
      data: { role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return c.json(member);
  });

  /** DELETE /api/workspaces/:workspaceId/members/:memberId — remove member. */
  app.delete('/api/workspaces/:workspaceId/members/:memberId', async (c) => {
    const req = await honoToApiRequest(c);
    if (!req.bearerToken) return c.json({ error: 'Unauthorized' }, 401);
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
    if (!workspaceId) return c.json({ error: 'Missing workspaceId' }, 400);
    const body = req.body as { message?: string };
    const message = (body.message ?? '').trim().toLowerCase();
    if (!message) return c.json({ error: 'Message is required' }, 400);

    // Load live data for context
    let dto: Awaited<ReturnType<typeof getDashboard>> | null = null;
    try { dto = await getDashboard(workspaceId); } catch { /* no data */ }

    const reply = generateAiReply(message, dto);
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
    let userId: string;
    try {
      userId = Buffer.from(req.bearerToken, 'base64').toString('utf8').split(':')[0] ?? '';
    } catch { return c.json({ error: 'Invalid token' }, 401); }
    if (!userId) return c.json({ error: 'Invalid token' }, 401);

    const oauth = buildMetaOAuth();
    if (!oauth) return c.json({ configured: false, message: 'Meta OAuth is not configured on this server. Use manual token entry.' });

    pruneOAuth();
    const state = createHash('sha256').update(`${userId}${workspaceId}${Date.now()}${Math.random()}`).digest('hex');
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
      const sessionId = createHash('sha256').update(`${stored.userId}${Date.now()}${Math.random()}`).digest('hex');
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
  app.get('/api/meta/oauth/accounts/:sessionId', (c) => {
    pruneOAuth();
    const session = oauthSessions.get(c.req.param('sessionId'));
    if (!session) return c.json({ error: 'Session not found or expired. Please reconnect.' }, 404);
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

    const body = req.body as { sessionId?: string; externalAccountId?: string; workspaceId?: string };
    const { sessionId, externalAccountId, workspaceId } = body;
    if (!sessionId || !externalAccountId || !workspaceId) {
      return c.json({ error: 'sessionId, externalAccountId, and workspaceId are required' }, 400);
    }

    pruneOAuth();
    const session = oauthSessions.get(sessionId);
    if (!session) return c.json({ error: 'Session not found or expired. Please reconnect.' }, 404);
    if (session.workspaceId !== workspaceId) return c.json({ error: 'Workspace mismatch' }, 403);

    const account = session.accounts.find(a => a.id === externalAccountId);
    if (!account) return c.json({ error: 'Account not found in session' }, 404);

    const encryptedToken = encryptToken(session.accessToken);
    const apiVersion     = process.env['META_API_VERSION'] ?? 'v20.0';

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
          timezone:             account.timezone_name ?? 'UTC',
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
          currencyMinorFactor:  1,
          timezone:             account.timezone_name ?? 'UTC',
          status:               'ACTIVE',
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt:       session.expiresAt,
        },
      });
    }

    // Invalidate session — one-time use
    oauthSessions.delete(sessionId);

    // Kick off initial sync in background
    try {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      const acct = ws?.adAccounts.find(a => a.externalAccountId === account.id);
      if (acct?.accessTokenEncrypted) {
        const metaClient = new MetaClient({ apiVersion, accessToken: decryptToken(acct.accessTokenEncrypted) });
        const worker = new SyncAccountWorker(prisma, metaClient);
        void (async () => {
          try {
            const syncResult = await worker.sync(acct.id);
            if (syncResult.ok) await runEngines(prisma, acct.id);
          } catch (err: unknown) { console.error('[adlytic:initial-sync]', err); }
        })();
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
    const apiVersion = process.env['META_API_VERSION'] ?? 'v20.0';
    try {
      const testUrl = `https://graph.facebook.com/${apiVersion}/${extId}?fields=id,name,currency,account_status&access_token=${encodeURIComponent(body.accessToken)}`;
      const testRes = await fetch(testUrl);
      const testData = await testRes.json() as Record<string, unknown>;
      if (testData['error']) {
        const err = testData['error'] as Record<string, unknown>;
        return c.json({ error: `Meta API rejected credentials: ${String(err['message'] ?? err['type'] ?? 'invalid token or account ID')}` }, 422);
      }
      if (!testData['id']) {
        return c.json({ error: 'Meta API returned no account data — check your account ID and token' }, 422);
      }
      // Use the verified name/currency from Meta if user left them blank
      if (!body.name && testData['name']) body.name = String(testData['name']);
      if (!body.currency && testData['currency']) body.currency = String(testData['currency']);
    } catch (fetchErr) {
      // Network error — don't block connection, just log
      console.warn('[adlytic:manual-connect] Could not verify token with Meta:', fetchErr);
    }

    const encryptedToken = encryptToken(body.accessToken);
    const existing = await prisma.adAccount.findFirst({
      where: { platform: 'META', externalAccountId: extId },
    });
    if (existing) {
      await prisma.adAccount.update({
        where: { id: existing.id },
        data: { accessTokenEncrypted: encryptedToken, workspaceId, name: body.name ?? existing.name },
      });
      return c.json({ success: true, id: existing.id });
    }
    const acct = await prisma.adAccount.create({
      data: {
        workspaceId,
        platform:             'META',
        externalAccountId:    extId,
        name:                 body.name ?? extId,
        currency:             body.currency ?? 'USD',
        currencyMinorFactor:  1,
        timezone:             body.timezone ?? 'UTC',
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
    const acct = await prisma.adAccount.findFirst({ where: { id: accountId, workspaceId } });
    if (!acct) return c.json({ error: 'Account not found' }, 404);
    await prisma.adAccount.delete({ where: { id: accountId } });
    return c.json({ success: true });
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
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      return c.json({ error: 'Meta access token has expired — please reconnect your account' }, 422);
    }
    const apiVersion = process.env['META_API_VERSION'] ?? 'v20.0';
    const accessToken = decryptToken(account.accessTokenEncrypted);
    const metaClient = new MetaClient({ apiVersion, accessToken });
    const worker = new SyncAccountWorker(prisma, metaClient);

    // Await the full pipeline synchronously so errors surface to the caller.
    const syncResult = await worker.sync(account.id);
    if (!syncResult.ok) {
      return c.json({
        status: 'sync_failed',
        error: syncResult.error ?? 'Unknown sync error',
        adAccountId: account.id,
        externalAccountId: account.externalAccountId,
        durationMs: syncResult.durationMs,
      }, 422);
    }

    const enginesResult = await runEngines(prisma, account.id);
    return c.json({
      status: 'sync_complete',
      adAccountId: account.id,
      externalAccountId: account.externalAccountId,
      rowsFetched: syncResult.rowsFetched,
      rowsUpserted: syncResult.rowsUpserted,
      windowSince: syncResult.windowSince,
      windowUntil: syncResult.windowUntil,
      enginesOk: enginesResult.ok,
      enginesError: enginesResult.error ?? null,
      durationMs: syncResult.durationMs + enginesResult.durationMs,
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
