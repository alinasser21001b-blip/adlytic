# Adlytic — Railway Deployment Report

**Date:** 2026-06-16
**Status:** READY TO DEPLOY — Mac screen was locked during automated run. Run `bash ~/Downloads/adlytic/deploy_to_railway.command` in Terminal to deploy.

---

## Railway Project Information

| Field | Value |
|-------|-------|
| Project Name | adlytic |
| Platform | Railway (railway.app) |
| Builder | Nixpacks |
| Runtime | Node.js 20 |
| Database | PostgreSQL (Railway plugin) |
| Region | Railway default |

**PUBLIC_URL:** _(populated after deployment — see DEPLOYMENT_URL.txt once deploy_to_railway.command is run)_

---

## Environment Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Set by Railway PostgreSQL plugin | Auto-injected |
| `NODE_ENV` | `production` | Set in deploy script |
| `PORT` | `3000` | Railway default; `process.env.PORT` used by serve.ts |

---

## Build Commands

```bash
# Install dependencies
npm install

# Build (Prisma generate + TypeScript compile)
npm run build
# Expands to: prisma generate && tsc
```

---

## Start Command

```bash
npm run start
# Expands to: prisma migrate deploy && node dist/src/api/serve.js
```

The start command runs `prisma migrate deploy` before launching the server, ensuring the schema is always up to date with zero-downtime migrations on Railway.

---

## Database Configuration

- **Provider:** PostgreSQL
- **ORM:** Prisma 5.20
- **Schema:** `prisma/schema.prisma`
- **Migrations:** `prisma/migrations/20260616013256_phase1_init/`
- **Seed:** `prisma/seed.ts`

### Seed credentials

| Field | Value |
|-------|-------|
| Email | `ali@adlytic.app` |
| Password | `demo1234` |

### Tables created by migration

| Table | Description |
|-------|-------------|
| `users` | Authentication |
| `workspaces` | Multi-tenant root |
| `workspace_members` | RBAC |
| `ad_accounts` | Platform-neutral account |
| `campaigns` | Campaign hierarchy |
| `ad_sets` | Ad set hierarchy |
| `ads` | Ad hierarchy |
| `raw_insights` | Raw API data storage |
| `daily_stats` | Cleaned universal metrics |
| `metric_trends` | Analytics Engine output |
| `detected_issues` | Rules Engine output |
| `knowledge_rules` | Knowledge Engine source |
| `recommendations` | Recommendation Engine output |
| `health_scores` | Health Score Engine output |
| `industry_profiles` | Industry configuration |

---

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Added `build`, `start`, `start:dev` scripts; moved `prisma`, `typescript`, `tsx` to dependencies |
| `dashboard_wired.html` | Changed `const API = 'http://localhost:3001'` → `const API = ''` (relative URLs) |
| `dashboard_wired.html` | Updated footer text removing localhost reference |
| `src/api/server.ts` | Added `GET /` route to serve `dashboard_wired.html` |
| `src/api/server.ts` | Added `readFileSync`, `existsSync`, `join` imports |

## Files Created

| File | Purpose |
|------|---------|
| `railway.json` | Railway platform configuration (Nixpacks builder, healthcheck, restart policy) |
| `nixpacks.toml` | Nixpacks build phases (setup, install, build, start) |
| `deploy_to_railway.command` | One-click macOS deployment script |

---

## Bugs Fixed

| Bug | Fix |
|-----|-----|
| No `build` script — Railway couldn't build | Added `"build": "prisma generate && tsc"` to package.json |
| No `start` script — Railway couldn't start app | Added `"start": "prisma migrate deploy && node dist/src/api/serve.js"` |
| `dashboard_wired.html` hardcoded `http://localhost:3001` | Changed to `const API = ''` (relative URL) |
| Dashboard had no server route | Added `GET /` → serves `dashboard_wired.html` |
| `prisma`, `typescript`, `tsx` in devDependencies only | Moved to `dependencies` for production builds |
| No Railway configuration files | Created `railway.json` and `nixpacks.toml` |
| No Prisma binary targets for Linux | Railway Nixpacks builds natively; `binaryTargets = ["native"]` works correctly |

---

## API Endpoints (20 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard HTML |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login → bearer token |
| GET | `/api/auth/me` | Current user + workspaces |
| GET | `/api/health` | Health check |
| GET | `/api/dashboard/:workspaceId` | Full dashboard DTO |
| GET | `/api/workspaces/:workspaceId` | Workspace settings |
| PATCH | `/api/workspaces/:workspaceId` | Update workspace |
| GET | `/api/workspaces/:workspaceId/members` | List members |
| POST | `/api/workspaces/:workspaceId/members` | Add member |
| GET | `/api/workspaces/:workspaceId/campaigns` | List campaigns |
| GET | `/api/workspaces/:workspaceId/campaigns/:id` | Single campaign |
| GET | `/api/workspaces/:workspaceId/campaigns/:id/adsets` | List ad sets |
| GET | `/api/workspaces/:workspaceId/adsets/:id` | Single ad set |
| GET | `/api/workspaces/:workspaceId/adsets/:id/ads` | List ads |
| GET | `/api/workspaces/:workspaceId/ads/:id` | Single ad |
| GET | `/api/workspaces/:workspaceId/insights` | Daily stats |
| GET | `/api/workspaces/:workspaceId/insights/trends` | Metric trends |
| GET | `/api/workspaces/:workspaceId/recommendations` | Recommendations |
| GET | `/api/workspaces/:workspaceId/issues` | Detected issues |
| POST | `/api/workspaces/:workspaceId/sync` | Trigger ETL sync |

---

## Verification Results

| Check | Status |
|-------|--------|
| TypeScript type-check (`tsc --noEmit`) | ✅ PASS — 0 errors |
| TypeScript build (`tsc`) | ✅ PASS — dist/ generated |
| Git commit | ✅ PASS |
| `railway.json` syntax | ✅ Valid JSON |
| `nixpacks.toml` syntax | ✅ Valid TOML |
| API URL in dashboard | ✅ Relative (works on any host) |
| Dashboard served at `/` | ✅ Route added |
| Railway deployment | ⏳ Blocked — Mac screen locked during automated run; run deploy_to_railway.command manually |
| Health endpoint live | ⏳ Pending |
| Login working | ⏳ Pending |
| Dashboard loading | ⏳ Pending |

---

## ⚠️ Deployment Blocked — Action Required

**Why:** The Mac screen was locked when the automated deployment ran. The Railway CLI requires:
1. Running on the Mac (sandbox network can't reach railway.app)
2. A browser login for first-time Railway authentication

**Fix (30 seconds after unlocking your Mac):**

```bash
# Option A — Double-click in Finder:
# ~/Downloads/adlytic/deploy_to_railway.command

# Option B — Paste into Terminal (Cmd+V if clipboard was set):
cd ~/Downloads/adlytic && bash deploy_to_railway.command
```

The script will:
- Install Railway CLI (via npm or brew, whichever works)
- Open a browser login for Railway
- Create the project + add PostgreSQL
- Set `NODE_ENV=production`
- Deploy (`railway up --detach`)
- Seed the database with demo data
- Print the final URL and save it to `DEPLOYMENT_URL.txt`

---

## How to Deploy

**Option A — One-click (recommended):**
1. Open Finder
2. Navigate to `~/Downloads/adlytic/`
3. Double-click `deploy_to_railway.command`
4. Follow the browser login prompt for Railway
5. Wait ~3 minutes for build + deploy
6. URL appears in the terminal window

**Option B — Manual (Terminal):**
```bash
cd ~/Downloads/adlytic

# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project + add PostgreSQL
railway init --name adlytic
railway add --plugin postgresql

# Set env vars
railway variables set NODE_ENV=production PORT=3000

# Deploy
railway up

# Seed database
railway run npx tsx prisma/seed.ts

# Get URL
railway status
```

---

## Final Production URL

**PUBLIC_URL:** _(see DEPLOYMENT_URL.txt after running deploy_to_railway.command)_

**STATUS:** PENDING — all code changes complete, deployment script ready to execute
