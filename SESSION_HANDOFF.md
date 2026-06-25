# Adlytic Session Handoff

> **Purpose:** Continue Meta OAuth, manual connect, System User, and IQD currency work in a new Cursor chat. Paste or reference this file at the start of the next session.
>
> **Last updated:** 2026-06-25 · **HEAD on main:** `af0689b`

---

## 1. Project context

| Item | Value |
|------|-------|
| **Local repo** | `/Users/aliahhed/Downloads/adlytic` |
| **Production URL** | https://adlytic-production.up.railway.app |
| **Railway** | Project: `adlytic` · Postgres service attached |
| **GitHub** | [alinasser21001b-blip/adlytic](https://github.com/alinasser21001b-blip/adlytic) |
| **Meta Business** | **ترجمان** (Business ID `877725141283739`) |
| **Product** | Ad analytics dashboard for Meta (Facebook) ad accounts — agency model, multi-workspace |

---

## 2. Original issues (this thread)

### Resolved

- **Ghost edits / git buffer desync** — Cursor showed uncommitted changes that were already on disk; commits existed locally. Not a real data-loss issue.
- **Railway deploy lag** — Production was serving old commit `6efaa6c3` for a while; later redeployed to current main.

### Built / partially fixed in code

- **Meta OAuth manual fallback modal** — When OAuth is misconfigured or fails, UI opens manual token entry with a reason banner.
- **System User / FB Login for Business path** — Feature-flagged (`META_SYSTEM_USER_ENABLED`); `MetaConnection` model, persistent `OAuthState`, callback handling.
- **Manual connect always visible** — "Connect manually (paste token)" button shown even when OAuth works (commit `8fef677`).
- **IQD spend showing ~12 instead of ~1200** — Root cause: `currencyMinorFactor` defaulting to `100` for IQD (zero-decimal currency). Meta returns spend in major IQD units; wrong factor divided display by 100. Fixed in sync, display, auto-heal, and repair endpoint.

### Still blocked (Meta platform / ops)

- **Business verification** — Done for ترجمان.
- **App NOT successfully in Business portfolio** — Claim request sent; "Business Manager" section not appearing on Meta Advanced settings page for the app.
- **No System Users created yet** — Blocked until app is in the Business portfolio.
- **OAuth one-click flow** — May fail with `no_ad_accounts` or system-user config missing; manual connect is the reliable path today.

---

## 3. Git timeline (key commits on `main`)

| Commit | Summary |
|--------|---------|
| `793db99` | **Dashboard:** explicit `useGrouping` locale opts + CTR 0% display fix |
| `2b3872c` | **Docs:** document required production env vars in `.env.example` |
| `9d6245e` | **Config:** centralized validated env config module (Phase 0) + loud token-decrypt errors |
| `7c1c668` | **Meta Phase 1:** additive `MetaConnection` schema + `META_SYSTEM_USER_ENABLED` flag |
| `50e5cbc` | **Meta Phase 2:** System User connection flow (flag-gated) + persistent `OAuthState` |
| `821ac18` | **Meta:** fall through to business login on invalid bypass tokens |
| `cf084a3` | **Meta:** honor callback token and harden account linking |
| `8d52264` | **Meta:** broaden system-user ad account discovery |
| `2dc1c2a` | **Meta:** surface `no_ad_accounts` OAuth errors to users |
| `8fef677` | **Workspace:** always-visible manual Meta connect entry point |
| `d623026` | **Currency:** correct IQD spend display after manual Meta connect |
| `4df8861` | **Currency:** auto-heal IQD `factor=100` rows; force `factor=1` on display |
| `af0689b` | **Currency:** IQD spend repair, sync kickoff after connect, canonical factor in ETL (`iqdRepair.ts`, `repair-iqd` endpoint) |

**Current HEAD:** `af0689b` — branch `main` tracks `origin/main`.

---

## 4. Railway environment variables

**Names only — never commit or paste secret values.**

### Required (production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (Railway injects for linked service) |
| `JWT_SECRET` | Auth token signing (min 32 chars; server refuses start if missing) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM for Meta tokens at rest (64 hex chars) |
| `META_APP_ID` | Meta app ID from developers.facebook.com → Basic |
| `META_APP_SECRET` | Meta app secret |
| `META_REDIRECT_URI` | Must match Meta app OAuth redirect exactly |
| `PUBLIC_APP_URL` | Public base URL (no trailing slash) |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

**OAuth redirect URI (production):**

```
https://adlytic-production.up.railway.app/api/meta/oauth/callback
```

### Optional — System User / FB Login for Business

| Variable | Purpose |
|----------|---------|
| `META_SYSTEM_USER_ENABLED` | `true` to enable System User plumbing |
| `META_LOGIN_CONFIG_ID` | FB Login for Business configuration ID |
| `META_SYSTEM_USER_TOKEN` | Pre-minted system user token (ops/testing bypass) |

### Other optional Meta vars

| Variable | Notes |
|----------|-------|
| `META_OAUTH_SCOPE` | Default `ads_read` |
| `META_API_VERSION` | Default `v20.0` |
| `META_MOCK_AUTH` | Dev/demo only — **never in production** |
| `META_DIRECT_TOKEN` | Single-token bypass — **do not use in prod multi-tenant** |

### Do NOT use in production (multi-tenant)

- `META_DIRECT_TOKEN` — bypasses per-workspace OAuth; only for single-account dev/ops.

---

## 5. Meta setup status & blockers

### Business: ترجمان (`877725141283739`)

- Business verification: **complete isn't the blocker** — verification is done.
- **Blocker:** Adlytic Meta app is **not successfully linked** to the Business portfolio.
  - Claim request was sent.
  - "Business Manager" section missing on app Advanced settings page.

### System Users

- **Not created yet** — Meta requires the app to be in the Business portfolio before System User creation works reliably.

### How to add app to portfolio (Path A)

1. From [developers.facebook.com](https://developers.facebook.com) → your app → link to Business, **OR**
2. From Business Settings → Accounts → Apps → Add app using **App ID** from Basic settings.

**Important:** Use the **App ID** from the app's Basic page — **NOT** the Business ID `877725141283739`.

### What works today

- **Manual connect** via Graph API Explorer token + numeric `act_` ad account ID.
- Paste token in workspace → "Connect manually (paste token)" modal.
- Demo account `act_demo_0001` has correct IQD data for UI testing.

### What does not work yet (without Meta platform steps)

- Full FB Login for Business one-click flow (needs app in portfolio + `META_LOGIN_CONFIG_ID` + App Review).
- System User token rotation per client at scale.

---

## 6. Code architecture — Meta connection

### Connection paths (priority order in `src/api/server.ts`)

| Path | Trigger | Notes |
|------|---------|-------|
| **Legacy OAuth** | "Connect Meta Ads" button | Default when `META_SYSTEM_USER_ENABLED=false` |
| **FB Login for Business** | Same button when flag on | Needs `META_LOGIN_CONFIG_ID`; falls back to manual modal on failure |
| **System User token bypass** | Env `META_SYSTEM_USER_TOKEN` | Skips OAuth dialog; creates `MetaConnection` |
| **Manual modal** | Always visible buttons | `POST /api/workspaces/:id/ad-accounts` |
| **META_DIRECT_TOKEN** | Env (dev/ops) | Global bypass — not for multi-tenant prod |
| **META_MOCK_AUTH** | Env (dev) | Synthetic demo session |

### Key models (`prisma/schema.prisma`)

- **`MetaConnection`** — Workspace-scoped Business connection; encrypted token; `tokenType` (`SYSTEM_USER`, `LONG_LIVED_USER`, etc.); `grantedAssetIds`, `grantedScopes`.
- **`OAuthState`** — Persistent CSRF state (replaces in-memory); `kind`: `legacy` | `system_user`; TTL via `expiresAt`.
- **`AdAccount`** — `connectionId` FK (optional); `currencyMinorFactor` (must be `1` for IQD); legacy `accessTokenEncrypted` for back-compat.

### Token resolution

- `src/services/accountToken.ts` — Resolves token from `MetaConnection` or legacy ad-account columns.

### Manual connect API

```
POST /api/workspaces/:workspaceId/ad-accounts
Body: { accessToken, externalAccountId, name?, currency? }
```

- Validates token with Meta Graph API.
- Sets `currencyMinorFactor` via `currencyMinorFactorFor(currency)` (IQD → 1).
- Triggers `kickoffInitialSync` (90-day backfill) fire-and-forget.

### IQD repair API

```
POST /api/workspaces/:workspaceId/repair-iqd
```

- Heals `currencyMinorFactor=1` for all IQD accounts in workspace.
- Rescales `daily_stats.spend` from `raw_insights` when stored value ≈ Meta major × 100.
- Kicks off sync for affected accounts.

Implementation: `src/lib/iqdRepair.ts`, wired in `src/api/server.ts`.

### IQD currency rules (`src/lib/currency.ts`)

- Meta Graph returns `spend` in **major** units (e.g. `"1200"` IQD).
- **IQD:** `currencyMinorFactor` must be **`1`** (no subunit).
- **USD etc.:** factor `100` (cents).
- `resolveCurrencyMinorFactor` forces IQD to 1 even if DB has stale `100`.
- `insightMapper.ts` / `syncAccount.ts` use canonical factor on ingest.
- Dashboard display: `value * currencyMinorFactor / factor` — wrong factor causes 100× error.

### OAuth error surfacing

- `no_ad_accounts` and other Meta errors returned to UI with message + manual fallback reason.

---

## 7. Production DB state (last diagnosis)

Run diagnostic: `npx tsx --env-file=.env scripts/diagnose-iqd.ts` (against production `DATABASE_URL`).

| User / account | State |
|----------------|-------|
| `wqqwq@gmail.com` | Workspace exists; **0 ad accounts** connected |
| `ygdgh@adlytic.ai` | **Not in DB** (typo variant `ygdgh@adlytic.oi` exists with 0 accounts) |
| `act_demo_0001` | Demo account; **correct IQD** spend data |
| Real Meta accounts | User may be viewing dashboard **without** a properly synced real `act_` account |

### Common user mistakes

- Pasting **email** in the ad account ID field instead of **`act_<numeric_id>`**.
- Connecting with expired/short-lived token without re-sync.
- Expecting spend fix without running repair or reconnect after factor heal.

---

## 8. User workflow preferences

- **Agency model:** One Meta app for Adlytic; per-client tokens via manual connect or (future) System Users.
- **Manual connect always visible** — implemented; user wants this as primary fallback.
- **Bilingual context:** Arabic / English user (Business name ترجمان).
- **Prefer production truth:** Diagnose via Railway DB + production URL, not local-only state.

---

## 9. What to do next (prioritized)

### Immediate (unblock dashboard for real data)

1. **Get a valid long-lived token** from [Graph API Explorer](https://developers.facebook.com/tools/explorer) with `ads_read` (and business permissions as needed).
2. **Connect manually** in workspace UI:
   - Token: paste full `EAAB...` token
   - Ad account ID: `act_<numeric_id>` or numeric ID only (not email)
   - Currency: **IQD** if Iraqi account
3. **Wait for initial sync** (~90-day backfill kicks off automatically).
4. **Refresh dashboard** — verify spend matches Meta Ads Manager.

### If spend still wrong (IQD)

1. Call `POST /api/workspaces/:workspaceId/repair-iqd` (authenticated as workspace member), **or**
2. Run `npx tsx scripts/repair-iqd-factors.ts` with production `DATABASE_URL`, **or**
3. Disconnect and reconnect the ad account (re-triggers sync with correct factor).

### Meta platform (medium term)

1. **Complete app → ترجمان portfolio** link (see §5).
2. **Create System User** in Business Settings → assign ad accounts + app.
3. **Configure FB Login for Business** → set `META_LOGIN_CONFIG_ID` on Railway.
4. **App Review** for `ads_read` / business permissions if required.

### Verify deploy

- Confirm Railway production is on commit `af0689b` or later.
- Check `/api/meta/oauth/start` returns `configured: true` when Meta env vars set.

---

## 10. Key files to read in a new chat

| File | Why |
|------|-----|
| `src/api/server.ts` | OAuth routes, manual connect, repair-iqd, sync kickoff, MetaConnection upsert |
| `src/api/serve.ts` | Boot validation (JWT, encryption key, DB) |
| `src/web/pages/workspacePage.ts` | Manual connect modal UI, always-visible buttons |
| `src/services/metaOAuth.ts` | OAuth URL building, token exchange, System User helpers |
| `src/services/accountToken.ts` | Token resolution (connection vs legacy) |
| `src/services/getDashboard.ts` | Dashboard aggregation + currency display |
| `src/lib/currency.ts` | IQD factor rules, heal detection |
| `src/lib/iqdRepair.ts` | Factor heal + spend rescale from raw insights |
| `src/mappers/insightMapper.ts` | Meta insight → DB minor units |
| `src/workers/syncAccount.ts` | Account sync worker (uses canonical factor) |
| `src/config.ts` | All env vars + `META_SYSTEM_USER_ENABLED` flag |
| `prisma/schema.prisma` | `MetaConnection`, `OAuthState`, `AdAccount` |
| `.env.example` | Documented env var names and production redirect URI |
| `scripts/diagnose-iqd.ts` | Read-only production IQD diagnostic |
| `scripts/repair-iqd-factors.ts` | CLI repair script |

---

## 11. Useful commands

```bash
# Local dev
npm run dev

# IQD diagnostic (set DATABASE_URL to production public URL first)
npx tsx --env-file=.env scripts/diagnose-iqd.ts

# One-time IQD factor repair (CLI)
DATABASE_URL=<public-url> npx tsx scripts/repair-iqd-factors.ts

# Or via Railway
railway run npx tsx scripts/repair-iqd-factors.ts

# Check recent commits
git log --oneline -15 main
```

---

## 12. API quick reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/meta/oauth/start?workspaceId=` | Start OAuth (legacy or system user) |
| GET | `/api/meta/oauth/callback` | OAuth callback |
| POST | `/api/workspaces/:id/ad-accounts` | Manual connect |
| DELETE | `/api/workspaces/:id/ad-accounts/:accountId` | Disconnect account |
| POST | `/api/workspaces/:id/repair-iqd` | Heal IQD factors + rescale + re-sync |
| GET | `/api/workspaces/:id/dashboard` | Dashboard data |

---

## 13. Open questions / watch items

- Did Meta approve the portfolio claim for ترجمان?
- Which email/workspace should be the canonical production test user?
- After manual connect, does `lastSyncedAt` update and do `raw_insights` contain expected Meta `spend` strings?
- Is `META_SYSTEM_USER_ENABLED` currently `true` or `false` on Railway? (Default in code: `false`.)

---

*End of handoff. Reference this file in your next Cursor chat to continue without re-explaining context.*
