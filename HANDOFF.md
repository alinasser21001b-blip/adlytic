# Dawai — handoff

Branch `dawai03`. Everything below is verified by running it, not by reading
it. Where something is unverified or unknown, it says so.

---

## The one thing to understand first

**There are TWO Dawai codebases in this repository.** Confusing them has
already cost real time, including publishing the wrong one to the live URL.

| | `dawai-platform/` | `platform/` |
|---|---|---|
| What | **The product** | A rebuild of the patient flow only |
| Scope | 32 routes: patient + pharmacy + admin | 22 patient screens |
| Backend | Real — Hono, Postgres, 7 migrations, argon2 auth, matching, notifications, OCR, encrypted files | None; a mock API |
| Tests | 68 passing | 1111 passing |
| Runs on | A container host (has a Dockerfile) | Any static host |
| Deployed? | **No** — needs a hosting account | Yes, at `dawai1.netlify.app` |
| Status | The thing to ship | Design reference (owner's decision) |

If a request says "the app", "the whole app", or names the pharmacy or admin
portals, it means **`dawai-platform/`**.

---

## Running them

### The full platform

```bash
cd dawai-platform
npm ci
npm run db:migrate      # REQUIRED first, and easy to forget — see below
npm run dev             # api + web together
```

**`npm run db:migrate` is not optional.** `server/index.ts` passes
`migrate:false` when `NODE_ENV=production`, so a production build boots against
empty tables and every request fails with
`relation "medicine_requests" does not exist`. Two separate debugging sessions
have been lost to exactly this. Any deploy needs migrations as a release step —
`fly.toml` and `render.yaml` already do this.

Verified working end to end in Chromium: patient registration → home → أدويتي
timeline → family access → profile; pharmacy registration → licence gate;
admin login → operations centre → verification queue.

### The patient rebuild

```bash
cd platform
npm ci
npm run dev             # one command; the API is a vite middleware
```
Open the URL vite prints. `npm run check` runs 22 gates and 1111 tests;
`node tools/devserver/smoke.mjs` walks the journey in a browser.

---

## Deploying

`dawai-platform/DEPLOY.md` has the commands in order for Fly.io and Render,
plus the three secrets `server/config.ts` fails closed without.

**The blocker is not technical.** The configuration is written and the app
builds and runs. What is missing is a hosting account, which the assistant
cannot create. Roughly ten minutes of the owner's time on Fly.

Two non-obvious decisions already made, with reasons:
- **Migrations run as a release/pre-deploy step**, never at boot. See above.
- **Machine auto-stop is OFF on Fly.** The server sweeps lifecycle on a timer:
  offers expire, reservations lapse. A sleeping machine stops expiring them,
  and a patient would see a reservation still marked held after it died.

Flagged, not solved: a mounted volume belongs to `root` while the container
runs as the unprivileged `dawai` user. Deploy without the volume first —
everything works except prescription-image upload — then add it.

---

## What is live now

`dawai1.netlify.app` builds from `main` and serves **`platform/`**, assembled by
`platform/tools/assemble-preview.mjs`:

- `/` — the patient app (mock API, `VITE_MOCK_API=1`)
- `/design/` — the design prototype (`dawai-site/`)
- `/review/` — the screen gallery, every state

Netlify reads `platform/netlify.toml` because the root config sets
`base = "platform"`. Routing and headers **also** travel inside the build
output as `_redirects` / `_headers`, because a config edit once emptied the
redirects and the deployed site 404'd at its own front door.

Note: `*.netlify.app` is unreachable from the assistant's container (403 on
CONNECT). Deploy verification is done on the identical build served locally.
Two deploy faults reached the owner before the assistant saw them.

---

## Decisions the owner has made — do not re-litigate

- The full platform goes on a **container host** (Fly / Render / Railway).
- `platform/` **stays as a design reference**; do not delete it.
- **Nothing gets deleted.** `dawai-platform/`, `dawai-site/`, `qareeb-platform/`,
  `hub/`, `public/adspulse` all remain.
- Deployment is **part of the definition of done**: commit → push → deploy →
  verify manually → then report commit SHA, deploy status, URL, features,
  bugs fixed, known issues, screens changed.

## Questions still open — do NOT guess these

From `platform/tools/review/debt.mjs` (19 open items, 9 resolved), these need a
product decision, not an implementation choice:

- **TD-17** — which districts are actually covered. The current list is a
  placeholder written to make the screen work.
- **TD-20** — the API contract and the §6 state machine disagree about
  cancelling a request.
- **TD-23** — what a patient sees when the offer window ends with no reply. The
  app promises «نكلّك الصدك» and that screen is undesigned.
- **TD-24** — R1's guards contradict §3.1 on what lets a request be sent.
- **TD-12**, **TD-13**, **TD-16**, **TD-22** (native Iraqi review of the Arabic
  plural forms), **TD-25**.

Five screens (S1, R4, R5, R11, R13) are deliberately not built: the design is
marked "OPEN to the designer" on exactly what they would need to show. No
control in the app leads to a screen that does not exist.

---

## Working rules that produced this state

- Never invent product behaviour. If the Blueprint has no answer: stop,
  register the gap, ask. `tools/review/debt.mjs` is that register.
- Every permission check exists in UI, API and domain. The frontend is never
  trusted.
- No placeholder screens, no fake implementations, no control that silently
  does nothing — every inert control is named in the register.
- Walk the app in a browser before claiming anything works. Every significant
  bug in this project was found by running it, not by reading it.

---

## Recent history

- `b9ccb15` — deployment configs for the full platform, and a PGlite fresh-boot
  fix (it creates its data directory but not the parent, so a clean clone died
  on an ENOENT that explained nothing). Open as PR #73.
- `8f0efb3` — PR #69 merged: the live URL switched from `public/adspulse` to
  the patient rebuild.
- `b13f817` — one URL carrying app + prototype + gallery.
