# Deploying to Railway

Railway is now the default deployment target. This repository contains **three
separate applications**, so the first section is the one that saves you an hour.

---

## Read this before you connect the repository

There is already a `railway.json` and a `railway.toml` **at the repository
root**, and they do not deploy Dawai. They deploy **Adlytic** — a different
product:

```
startCommand: npx prisma migrate deploy && node dist/src/api/serve.js
healthcheckPath: /api/health
```

If you create a Railway service, point it at this repository and accept the
defaults, that is what you will get. Railway reads the root config unless you
tell the service otherwise. **This exact class of mistake — deploying the wrong
one of the codebases in this repository — has already cost this project real
time, including publishing the wrong app to the live URL.**

So every service below names its **Config-as-code path** explicitly. Set it.

| I want to deploy | Service config path | Root directory |
|---|---|---|
| Adlytic (the ads product) | `railway.json` (root, already there) | *(empty)* |
| **Dawai — the full platform** | `dawai-platform/railway.json` | `dawai-platform` |
| Dawai — the patient preview | `platform/railway.json` | `platform` |

`HANDOFF.md` explains the two Dawai codebases. In short: **`dawai-platform/` is
the product** — patient, pharmacy and admin portals on a Hono server with
Postgres. `platform/` is the patient rebuild: a real app with a mock API, kept
as a design reference, already served at `dawai1.netlify.app`.

---

## Dawai — the full platform (`dawai-platform`)

The owner's recorded decision is that this goes on a container host. It has a
`Dockerfile`, so Railway builds it directly.

### 1 · The three secrets

`server/config.ts` refuses to start in production without them, deliberately —
it fails closed rather than booting with a default that looks like security and
is not. Generate them on your own machine and **do not paste them into a chat,
an issue, or a commit**:

```bash
openssl rand -base64 48   # SESSION_PEPPER — at least 32 characters
openssl rand -base64 32   # STORAGE_ENCRYPTION_KEY — exactly 32 bytes, base64
openssl rand -base64 24   # ADMIN_PASSWORD — at least 16 characters
```

### 2 · The service

1. **New Project → Deploy from GitHub repo**, choose this repository.
2. Service **Settings → Build**: set **Root Directory** to `dawai-platform`.
3. Service **Settings → Config-as-code**: set the path to `railway.json`
   (relative to the root directory above).
4. **New → Database → Add PostgreSQL** in the same project.
5. Service **Variables**: add `DATABASE_URL` as a reference to the Postgres
   service's connection string, then the rest of the table below.
6. **Settings → Networking → Generate Domain**, and put that address in
   `WEB_ORIGIN` and `PUBLIC_APP_URL` (exactly — `https://`, no trailing slash;
   cookies and CORS are bound to it).

| Variable | Value |
|---|---|
| `DAWAI_ENV` | `production` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | reference to the Postgres service |
| `STORAGE_BACKEND` | `local` |
| `STORAGE_PATH` | `/var/lib/dawai/storage` |
| `SESSION_PEPPER` | the generated value |
| `STORAGE_ENCRYPTION_KEY` | the generated value |
| `WEB_ORIGIN` | your Railway domain |
| `PUBLIC_APP_URL` | your Railway domain |
| `ADMIN_EMAIL` | your email — **remove after first sign-in** |
| `ADMIN_PASSWORD` | the generated value — **remove after first sign-in** |

**Do not set `PORT`.** Railway injects it, and `config.ts` reads
`process.env.PORT`. `render.yaml` pins `PORT=8787` because Render works
differently; copying that line here makes the app listen on a port Railway is
not routing to, which presents as a health check that times out with nothing in
the logs.

### 3 · The three things that are easy to get wrong

**Migrations are a pre-deploy step, never a boot step.** `server/index.ts`
passes `migrate: false` when `NODE_ENV=production`, so a production build boots
against empty tables and every request fails with `relation
"medicine_requests" does not exist`. Two separate debugging sessions have been
lost to exactly this. `railway.json` sets:

```json
"preDeployCommand": "node dist-server/db/migrate.js"
```

That runs once per deploy, before the new version takes traffic, and a failure
aborts the deploy while the old version keeps serving — which is what you want
when a migration is wrong. If Railway's schema rejects the field (see
*Unverified* below), the identical setting is **Settings → Deploy → Pre-deploy
Command**. Do not chain it into `startCommand`: that runs it on every replica
restart, which is a boot step wearing a different name.

**App Sleeping must stay OFF.** `railway.json` sets `"sleepApplication": false`,
and confirm it in **Settings → Deploy**. The server sweeps lifecycle on a timer:
offers expire, reservations lapse. A sleeping instance stops expiring them, and
a patient would open the app to a reservation still marked held after it had
actually died — sent to a pharmacy counter for medicine that is back on the
shelf. This is the same reason machine auto-stop is off on Fly.

**Deploy without a volume first.** Prescription-image upload writes to
`STORAGE_PATH`. A Railway volume mounts as `root` while the container runs as
the unprivileged `dawai` user the Dockerfile creates, so the first write fails
with `EACCES`. Everything else works without a volume; add it once the app is
up and fix ownership then. Without a volume, uploaded images do not survive a
redeploy.

### 4 · Verify

```
GET  https://<your-domain>/            → the app shell
```

Then walk it: patient registration → home → أدويتي timeline → family access →
profile; pharmacy registration → licence gate; admin sign-in → operations
centre → verification queue. All of that is verified working in Chromium
locally; none of it has been verified on Railway (see below).

---

## Dawai — the patient preview (`platform`)

Already served at `dawai1.netlify.app`, so this is only needed if you want it on
Railway too. It is a static build plus a small server, because a container host
runs a process rather than a CDN and will not apply `netlify.toml`'s rewrites.

1. **Root Directory** → `platform`; **Config-as-code path** → `railway.json`.
2. **Variables**: `VITE_MOCK_API=1` — the review build carries the mock API, and
   without the flag the module is never imported, so the deployed app has no
   backend at all and reports every search as "not in our catalogue".
3. Health check is `/healthz`, which reports that the process is listening
   rather than that a file exists.

`tools/serve.mjs` carries the rules `netlify.toml` declares — the front-door
rewrite, the catch-all, the cache policy and the security headers, including
`camera=(self)`, which R2 needs to photograph a prescription. It has **no
dependencies**: `node:http` and `node:fs`, nothing else.

Railway's Root Directory makes `platform` the whole build context, so
`../dawai-site` and `../review` are not there. `assemble-preview.mjs` now says
so and carries the app alone rather than failing the deploy — meaning a Railway
deploy of this service serves **the app at `/` only**, without `/design/` and
`/review/`. Netlify checks out the whole repository, so it still carries all
three.

---

## What could not be verified from the assistant's container

Stated plainly, because a deployment guide that implies it was tested is worse
than one that admits it was not.

- **Railway is unreachable from here.** The egress gateway answers `403` to
  `CONNECT` for both `backboard.railway.app:443` and `railway.com:443`. This is
  the environment's network policy, not a misconfiguration — the same class of
  block that makes `*.netlify.app` unreachable from here.
- **No credentials.** There is no `RAILWAY_TOKEN` and no `~/.railway`. Railway
  authentication is either a browser login, which a headless container cannot
  complete, or a project token the account owner mints.
- **No Railway CLI**, and installing it would not help while the API is blocked.
- **The `railway.json` schema was not validated.** The field names come from
  Railway's documented config-as-code, and `https://railway.com/railway.schema.json`
  could not be fetched to check them. `preDeployCommand` is the one to watch: if
  a build rejects it, delete the line and set the same thing in the dashboard.
- **Docker is unavailable** in this container, so `dawai-platform/Dockerfile`
  was not built here. `npm ci && npm run build` inside `dawai-platform` does
  succeed, producing `dist-server/index.js` and `dist-server/db/migrate.js` —
  the two paths the config names.

What **was** verified locally, by running it rather than reading it: the patient
app's production build, served by `tools/serve.mjs` on an injected `$PORT`,
walked end to end in Chromium — search, sign-in, send, offers, substitution
consent, reservation, pickup code — with no console errors; the routing,
headers and path-traversal guard probed by request; and the same build assembled
in a subdirectory-only context to confirm it degrades rather than fails.
