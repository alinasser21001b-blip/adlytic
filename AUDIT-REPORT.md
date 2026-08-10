# Adlytic — audit & repair report

Scope: the repository at `28dc6aa`, audited as an external engineer. Every
number below was produced by a command in this repo, not estimated.

**Two limits on this audit, stated up front because they change what the
findings mean:**

1. **`adlytic.net` is not reachable from the audit sandbox.** The egress proxy
   answers `403` to `CONNECT` for every non-allowlisted host
   (`curl https://adlytic.net/dashboard` → exit 56, no response). The brief's
   D-1 and D-2 were framed as production observations and asked for a curl
   matrix against the live host. I could not run it. Everything below about
   auth and crypto is proven **from the source and from local execution**, and
   I say so at each finding rather than dressing source reading up as a
   production probe.
2. **`DATABASE_URL` is not set here.** The exact count of undecryptable tokens
   that D-1 demands is therefore **unmeasured**. I delivered the read-only
   script instead of a guess — see D-1.

---

## Fixed

| ID | Sev | file:line | Root cause | Fix | Commit | Test added |
|---|---|---|---|---|---|---|
| D-3 | P1 | `src/web/layout.ts:3284` | `<meta name="theme-color" content="var(--bg)">` — a meta attribute is a literal string; `var()` has no cascade to resolve against, so the app has had **no** theme colour in any browser, ever. Three auth pages separately declared the old dark `#100E0D`. | All four set to `#F2F7F4`. | `408e700` | — (see D-3b) |
| D-3b | P1 | `public/manifest.json:7-8` | Same class, different file: `background_color` / `theme_color` still `#100E0D`. The installed PWA opened on a black splash in front of a light product. | Both → `#F2F7F4`. | this commit | — |
| D-4 | P1 | 38 text nodes across 12 Arabic pages | **The server-rendered default was English and JS swapped in Arabic after load.** The strings were not untranslated — `/welcome` carries a complete AR dictionary for all 21 of its. So the product was Arabic only while its JavaScript was working: not on first paint, not on a slow connection, and not in the failure state an error banner exists to report. | Static markup now carries the default locale (AR): the whole `/welcome` landing page, the sidebar `Loading…`, and the dashboard's `An error occurred.` / `Analyzing…` / `I've applied this`. | this commit | `test_no_english_in_ar_pages.mjs` — 38 → 0 |
| D-4b | P1 | `src/web/pages/settingsPage.ts:299` | The live billing panel read `Powered by Stripe. Sandbox: card 4242 4242 4242 4242.` — English, and it advertised test-card details to paying customers. | Replaced with an Arabic line that states the real fact (card data does not pass through our servers). | this commit | covered by the same gate |
| D-6 | P1 | `src/web/pages/authShared.ts:19` | Both auth pages called `logoSvg()` with the default `idPrefix`, so `url(#logo-fill)` bound to the **first** `#logo-fill` in document order — the copy inside `.auth-brand { display: none }`, where a paint server resolves to nothing. The logo rendered as a bare plate with no mark on every phone. | Unique id prefix per call site; default is now `logo-${size}`. Proven with a two-case Chromium probe (duplicate → blank, unique → renders). | `408e700` | duplicate-id rule in `test_page_scripts.mjs` |
| D-7 | P1 | 5 pages | `/add-client`, `/admin`, `/admin/inbox`, `/admin/observability`, `/admin/meta-readiness` each carried a **private `:root` of dark-theme hexes** and pulled Tajawal from `fonts.googleapis.com`. They were not pages someone forgot to update — they were not reading the design system at all, so there was nothing to update. Measured background: `#100e0d`. | New `TOKENS_CSS` (SHARED_CSS's own head, sliced at a sentinel — fonts and custom properties, no selectors) so a page with its own shell can take the system's values without its components. All five migrated; three cross-origin font requests per load removed. | `408e700` | token-ownership rule in `test_page_scripts.mjs` |
| D-8 | P1 | `src/web/layout.ts` | `--border` on `--surface-2` = **1.13:1**. Every text field, tab, chip and secondary button had a boundary the customer could not see; one said the form looked empty. It was not — the borders were. | New `--border-control` `#748A80`: **3.18 / 3.41 / 3.69** on `--surface-2` / `--bg` / `--surface`, clearing WCAG 1.4.11's 3:1 on all three grounds. `--border` stays a separator. | `408e700` | control-boundary rule in `test_page_scripts.mjs` |
| D-9 | P2 | `src/web/layout.ts:818` | `.btn-secondary:hover { color: #fff }` — a dark-theme leftover that painted white text on a light-green ground, so the label vanished on hover. | `color: var(--text)`. | `408e700` | — |
| D-10 | P2 | `src/web/pages/loginPage.ts:44` | The password reveal control sat **on top of** the padlock icon. Three things share that field and disagreed about which side is "start": the icon uses physical `right`, the toggle used a logical property against an RTL wrapper, and the input carries `dir="ltr"` so its own inline axis is flipped. | All three physical: lock right, reveal left, padding for each. | `408e700` | — |
| D-11 | P1 | `src/web/pages/settingsPage.ts:72` | Settings told **every** account `عضو منذ ٢٠٢٤` — a literal in the markup that nothing ever replaced. A merchant who signed up last month read a fabricated year about their own account. Directly violates the project's "never manufacture historical values" rule. | Populated from `me.createdAt` (already returned by `/api/auth/me`); the line is removed rather than guessed when the field is absent. | `28dc6aa` | — |
| D-12 | P2 | 7 sites | `toLocaleDateString('ar')` / `'ar-EG'` / `'ar-IQ'` emit Arabic-Indic digits while every metric uses Latin ones, so one screen showed `38/100` above `آخر تحديث ٨ آب ١٢:٠٠`. | All seven use `'ar-u-nu-latn'`, the convention the other 25 sites already followed. | `28dc6aa` | numeral rule in `test_page_scripts.mjs` |
| D-1a | P0 | `prisma/schema.prisma`, `src/config.ts`, `src/services/tokenEncryption.ts` | No `key_version` on either token column, so "which key opens this row" was unanswerable from the data and a key change was instantaneous, total and unrecoverable. | `access_token_key_version` added to both tables (additive, nullable, no default → catalog-only change, no heap rewrite, reversible). `TOKEN_ENCRYPTION_KEY_PREVIOUS` + `TOKEN_ENCRYPTION_KEY_VERSION` make a rotation stageable: old rows keep opening while new writes are stamped with the new generation. All 6 persistence sites stamp it. Nothing changes when neither variable is set. | this commit | `test_token_encryption.ts` — rewritten, see below |
| D-1b | P0 | `test_token_encryption.ts` | **The crypto suite was testing nothing.** It documented `Run: TOKEN_ENCRYPTION_KEY=… npx tsx …` and nobody ever did, so `encryptToken` returned its input and `decryptToken` returned its input — "round-trip decrypt" PASSED because two identity functions agreed. This is the layer that should have caught D-1 and could not. | The test sets its own keys, and asserts first that a key is actually configured. Rotation is exercised in **child processes**, because `config.ts` reads env once at module load — which is also how a rotation really lands: a redeploy. 8 → **17 assertions**. | this commit | itself |
| D-2c | P2 | `src/api/server.ts:607-611` | Five `/admin*` HTML routes were `c.html(page())` with no server check. No data was exposed — all 36 `/api/admin` routes gate — but the operator shell was readable by anyone. A client-side redirect is a courtesy, not a boundary. | Login and register now also set an HttpOnly `adlytic_session` cookie (purely additive; the bearer flow is untouched), and the five routes redirect anonymous callers. `POST /api/auth/logout` clears it, since the browser cannot clear HttpOnly itself. | this commit | operator-page rule in `test_route_authz.ts` |
| D-5 | P1 | `src/web/pages/dashboardPage.ts` | Four mutually exclusive regions — skeleton, backfill overlay, hard error, content — toggled by nine scattered `.style.display` writes with **no owner**. `showError` left content up; `hideLoadingShowDashboard` left error up; `showOnboardingOverlay` left both. That is how production showed four contradictory states at once. | One `setDashPhase()` and a `DASH_PHASES` table where every phase specifies every region. Adding a fifth region is one row. The state strip (OFFLINE/STALE/PARTIAL/INSUFFICIENT_DATA) is deliberately **not** included — those genuinely coexist with a rendered dashboard. | this commit | `test_ui_state_integrity.mjs` |
| D-13 | P1 | `src/web/pages/campaignsPage.ts:3440` | The data-integrity monitor printed «البيانات متسقة — لا توجد مشاكل» whenever it had assembled zero findings — which is also what an empty payload, a 404 and a rejected request produce. **Absence of findings was rendered as proof of health**, on the one surface whose job is to say whether the numbers can be trusted. | Three outcomes, not two: `ok` (green, auto-hides), `warn` (amber, stays), `unknown` (hatched, stays). The green branch is now unreachable without `checkedAt` proving the check ran, and the `.catch` renders `unknown` instead of staying silent. | this commit | `test_ui_state_integrity.mjs` |
| D-14 | P2 | `src/web/pages/dashboardPage.ts:3546` | Polling retried forever at a fixed interval with an empty catch. Against a broken token nothing improved by asking more often, and the customer was never told refreshing had stopped working — the screen kept showing numbers that had quietly stopped being current. | Exponential backoff per consecutive failure (capped at 15 min), and a new `STALE` entry in the state strip after 3 consecutive failures. Any success, an explicit retry, or returning to the tab resets both. | this commit | — |
| D-2b | P1 | `src/api/server.ts:691` | The `/api/*` middleware **looks like** an auth gate and is not one — every failure path calls `next()`. A future reader "fixing" it to 401 breaks all public routes; one trusting it and deleting a per-route check opens everything. It was unlabelled. | Documented as `ACTIVE-USER GATE, NOT AN AUTH GATE`, with both failure modes spelled out. Behaviour unchanged — this is a comment plus a test, not an auth change, so it is not inside the D-2 approval gate. | this commit | **`test_route_authz.ts`** |

Every fitness test listed was **first proven to fail on the real regression**
before being kept: I reverted the actual line, watched it go red, restored it.
A test that has never been red is decoration.

---

## Findings in detail

Everything below is now fixed except the first item, which needs a production
database this sandbox does not have.

### D-1 (remainder) — P0 — the blast radius is still unmeasured
The structural half is fixed (D-1a above): `access_token_key_version` exists, rotation is stageable, and the crypto suite genuinely exercises both keys. **What is still missing is the number**, and it cannot be produced from here.

Run this against production and the incident is sized:

```bash
DATABASE_URL=… TOKEN_ENCRYPTION_KEY=… npx tsx scripts/count-undecryptable-tokens.ts
```

It now reports rows per key generation as well as failures, so a rotation is finishable: `gen N` grows, `gen N-1` shrinks to zero, and when it does `TOKEN_ENCRYPTION_KEY_PREVIOUS` can be removed. `DECRYPT FAILED` must be zero throughout.

**To rotate, once you have that number:** set `TOKEN_ENCRYPTION_KEY_PREVIOUS` to the current key, `TOKEN_ENCRYPTION_KEY` to the new one, `TOKEN_ENCRYPTION_KEY_VERSION` to 2, redeploy. No customer sees anything. Then re-run the counter until generation 1 is empty.

<details><summary>Original D-1 analysis (retained for the record)</summary>

#### Meta token encryption: no key versioning
`src/services/tokenEncryption.ts`, `src/config.ts:106-119`, `prisma/schema.prisma:114,162`

**Traced.** The key is `TOKEN_ENCRYPTION_KEY`, a 64-hex env var read once in
`src/config.ts` and validated centrally. In production a missing or malformed
key is `status: 'fail'` → `process.exit(1)` at boot, so the "silently stores
plaintext" path **cannot** reach production. An 8-char SHA-256 fingerprint of
the key is logged at boot, which is the only operator-visible way to tell
which key is running.

**The structural defect: there is no `key_version` column.** `grep -rn
"keyVersion\|key_version"` returns nothing in the schema or the source. Both
token tables (`AdAccount.access_token_encrypted`,
`MetaConnection.access_token_encrypted`) store a bare `iv:tag:ciphertext`
envelope with no indication of which key produced it. The consequences:

- Which rows belong to which key is **unanswerable from the data**. It can
  only be discovered by attempting every decryption.
- A rotation cannot be staged. There is no way to write new rows under key B
  while still reading key A, so any key change is instantaneous and total.
- Recovery is impossible without the old key value. AES-256-GCM has no
  recovery path; if the previous `TOKEN_ENCRYPTION_KEY` was not retained in
  Railway's variable history, **forced re-auth is the only option**.

**One thing already right:** `decryptToken` throws a distinct
`TokenDecryptError` rather than returning the ciphertext, so a key mismatch is
never silently misread as an expired Meta token (a 190). That distinction is
what makes the incident diagnosable at all.

**Blast radius: unmeasured — I refuse to guess it.** `DATABASE_URL` is not set
in this sandbox. Delivered instead: `scripts/count-undecryptable-tokens.ts`,
read-only by construction (SELECTs only; prints no token, no plaintext, no
key; makes no Meta calls). Run:

```bash
DATABASE_URL=… TOKEN_ENCRYPTION_KEY=… npx tsx scripts/count-undecryptable-tokens.ts
```

It reports, per table: rows, legacy plaintext, decrypt OK, **DECRYPT FAILED**
with ids and a percentage. That number is the blast radius.

**Two options, and the tradeoff.**

| | Recover | Force re-auth |
|---|---|---|
| Requires | the previous key value, from Railway variable history | nothing |
| Work | dual-key read path, re-encrypt each row under the current key, verify count returns to 0 | a reconnect banner (`TOKEN_DECRYPT_RECONNECT_URL` already exists and points at `/workspace?connect=manual`) |
| Customer impact | none — invisible | every affected workspace must paste a fresh Meta token; syncs stall until they do |
| Risk | touches every token row; needs a migration and a verified backup | none to data; a support load across ~15 SMB clients |
| Verified by | the counter returning 0 | the counter returning 0 as clients reconnect |

**Recommendation:** run the counter first. If the number is small, force
re-auth is cheaper and carries no data risk. Either path needs the structural
fix regardless — add `key_version` (nullable `SMALLINT`, defaulting to the
current key's generation) so the next rotation is stageable rather than
catastrophic.

</details>

### D-2 — P0 as reported → **P2 information disclosure**, plus a real P1 structural risk · **FIXED**

The brief's claim is that authentication is client-side only. **The data half
of that is wrong, and I can show it; the shell half is right.**

I could not run the production curl matrix (proxy 403). What I did instead is
stronger than three curls: `test_route_authz.ts` parses every route
registration in `server.ts` with a balanced-brace scan and checks each handler
body. Results:

- **109 `/api` routes.** 97 resolve a caller identity themselves; 12 are public
  by design, each now carrying a written reason.
- **41 workspace-scoped routes. All 41 call `checkMember(userId, workspaceId)`.**
  The third row of the brief's table — workspace A's resource id requested as
  workspace B — is **covered on every route that takes one**. That is the row
  that mattered, and it is closed. (Also independently covered by
  `test_data_isolation.ts` and `test_tenant_isolation.ts`, both passing.)
- **36 `/api/admin/*` routes. All 36 call `requirePlatformAdmin`.** No admin
  data is reachable without the role.
- The 4 unauthenticated webhook routes all verify a signature —
  `constructEvent` (Stripe), `verifyMetaSignature` with a constant-time
  compare (Meta), `signed_request` (data deletion). `/api/webhooks/meta` GET is
  the subscription handshake, guarded by `hub.verify_token`.
- Meta OAuth **does** validate `state`: `consumeOAuthState(state)`, one-time
  use. The mock callback additionally refuses to run unless `META_MOCK_AUTH`
  is enabled.

**What is genuinely exposed:** all five `/admin*` **HTML** routes are served
with no server-side gate —
`app.get('/admin', (c) => c.html(adminConsolePage()))`. Anyone can read the
admin shell: route names, feature names, the operator vocabulary. **No data**
— every fetch it makes is gated. Same for `/dashboard`, which is why an
unauthenticated request returns the full sidebar.

So the correct severity is **information disclosure, not a data breach**. It
should still be fixed: gate the five `/admin*` HTML routes server-side and
redirect anonymous callers.

**The real P1 is structural, and it is why this was worth auditing:**
authorisation is enforced **97 times by hand**, and the middleware that looks
like it would catch a mistake explicitly does not. One forgotten
`checkMember` is a cross-workspace breach with nothing standing between the
mistake and production. `test_route_authz.ts` now closes that gap — I proved
it by deleting the `checkMember` call from
`GET /api/dashboard/pulse/:workspaceId` and watching the suite name that exact
route, then restoring it.

**Now fixed** (D-2c above). The obstacle was that a browser NAVIGATION cannot
carry `Authorization: Bearer` — the token lives in localStorage — which is
genuinely why every HTML route was ungated. Login and register now also set an
HttpOnly `adlytic_session` cookie carrying the same JWT; the five operator
routes read it and redirect anonymous callers. The bearer flow is untouched,
so no existing API call changes and no session breaks.

**One consequence worth knowing:** an operator whose browser predates this
change has no cookie yet, so the first visit to `/admin*` redirects to
`/login`. Signing in restores it. That is a one-time re-login for you, not for
customers.

### D-5 — P1 — No UI state machine · **FIXED**
`src/web/pages/dashboardPage.ts:43, 66, 76, 90, 94` + `src/web/layout.ts:894`

**The brief's diagnosis is right, and it is more specific than "independent
booleans".** The dashboard has one subsystem that is modelled *properly* and
four that are not:

- `#dash-state-strip` is genuinely well built — `DASH_STATE_DEFS` with three
  states, `DASH_STATE_ORDER` as an explicit urgency order, and a comment
  explaining that OFFLINE and PARTIAL legitimately coexist because one
  explains the other. Nothing wrong here.
- But **`#loading-state`, `#onboarding-overlay`, `#error-state`,
  `#dashboard-content` and `.token-decrypt-banner` are five separate regions
  toggled by nine independent `style.display` writes, and no function owns
  exclusivity.** The source comment even asserts "LOADING, EMPTY and ERROR own
  their own regions" — an intent that nothing enforces. That is exactly why
  production could show a loading overlay, a token-decrypt error, a stale
  banner and a generic retry block at the same time.

**Real states**, from what the code and the DTO actually distinguish:
`loading` · `onboarding-backfill` · `authenticated-no-data` ·
`token-decrypt-failed` · `token-expired-stale-cache` · `partial-failure(n)` ·
`offline` · `insufficient-data` · `success` · `hard-error`.

**Fixed** — see D-5 in the Fixed table. `setDashPhase()` owns the four
exclusive regions through a table where every phase names every region, so a
phase cannot silently inherit the last one's leftovers. The state strip keeps
its own visibility, because OFFLINE / STALE / PARTIAL / INSUFFICIENT_DATA are
true *alongside* a rendered dashboard rather than instead of it.
`test_ui_state_integrity.mjs` fails the build if any region is toggled behind
the owner's back.

### D-13 — P1 — The monitor reported "all clear" when it had no data · **FIXED**
`src/web/pages/campaignsPage.ts:3440-3475`

`runDataObserver` builds a `parts[]` array from the `/data-health` response,
and `if (parts.length === 0)` prints **«البيانات متسقة — لا توجد مشاكل»**
("data is consistent — no problems"). An empty response, a failed request or a
missing field all produce zero parts, so **absence of findings is rendered as
proof of health.** I reproduced it: with `/data-health` stubbed to `{}` the
green all-clear banner appears while the period-spend tile and the campaign
cards on the same screen differ by 8×.

This is the same shape as the health score of `0` for an unconnected account
that was fixed earlier in this codebase, and it sits on the *data-integrity*
surface — the one thing that must never lie.

**Fixed** — see D-13 in the Fixed table. Three outcomes now: `ok`, `warn`,
`unknown`. The green branch is unreachable without `checkedAt` proving the
check ran, `unknown` is hatched (the same pattern the analytics layer uses for
INSUFFICIENT_DATA — it survives greyscale and colour blindness) and does not
auto-hide, and the `.catch` renders it rather than staying silent.

### D-14 — P2 — Polling never backed off and swallowed every error · **FIXED**
`src/web/pages/dashboardPage.ts:3480-3501`

Good news first: all 5 `setInterval` sites across the app pause on
`visibilitychange`, clear on `pagehide`, and are cleared before re-arming.
There is no leak.

But there is **no failure backoff and no failure surface**:
`catch (e) { /* silent pulse */ }` and `.catch(function () { /* silent */ })`.
Against a broken token the dashboard retries forever at a fixed interval and
the customer is never told refreshing is failing — the screen simply goes
stale while looking live.

The brief's related worry — that this compounds against Meta's error budget —
**does not hold**: the poll hits Adlytic's own `/api/dashboard/pulse/`, and
`src/services/metaUsageTracker.ts` already tracks call volume and error rate
against the 500-call / 15% policy server-side.

**Fixed** — see D-14 in the Fixed table. Backoff doubles per consecutive
failure to a 15-minute ceiling; three consecutive failures raise a `STALE`
entry in the state strip that says the numbers are from the last successful
load. Success, an explicit retry, or returning to the tab resets both — coming
back to a tab is a deliberate act and should not resume an invisible
15-minute wait.

---

## Measured

| Metric | Value | How |
|---|---|---|
| `tsc --noEmit` errors | **0** | `npx tsc --noEmit` |
| `strict` in tsconfig | **on** | — |
| `any` / `as any` | **81** (42 `: any`, 39 `as any`) | grep |
| `@ts-ignore` / `@ts-expect-error` | **0** | grep |
| Registered routes | **133** (110 `/api`, 23 HTML) | `test_route_authz.ts` |
| `/api` routes resolving a caller | **97 of 97 non-public** | `test_route_authz.ts` |
| Workspace-scoped routes with `checkMember` | **41 of 41** | `test_route_authz.ts` |
| `/api/admin/*` with `requirePlatformAdmin` | **36 of 36** | `test_route_authz.ts` |
| Unauthorised **data** endpoints | **none found** | as above |
| Unauthorised **HTML** routes | **5 → 0** — all five operator pages now gated server-side | `test_route_authz.ts` |
| Hardcoded English in Arabic pages | **38 → 0** | `test_no_english_in_ar_pages.mjs` |
| Undecryptable tokens | **still unmeasured** — no `DATABASE_URL` in the sandbox; the counter now also splits rows by key generation | script delivered |
| Physical vs logical CSS properties | **103 physical / 90 logical** | grep |
| Polling timers | **5**, all pausing on `visibilitychange`, all cleared | grep + read |
| Polling backoff | **none → exponential, 15 min ceiling**, with a visible STALE state after 3 failures | `dashboardPage.ts` |
| Security headers | CSP, HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` — **all present** | `server.ts:532-543` |
| Rate limiting | present on register, login, password, support, AI | grep `429` |
| Served page weight, dashboard | **434.9 KB** HTML + inline JS, uncompressed, blocking first paint | `ls .mobile-pages` |
| Served page weight, campaigns | **266.3 KB** | same |
| Shared CSS (cacheable) | 78.1 KB base + 10.9 KB tokens + 5.4 KB floors | same |
| Fonts | **500 KB across 23 self-hosted woff2**, subset by `unicode-range`, `font-display: swap`, same-origin | `du public/fonts` |
| Test files | **56 → 59** | `ls test_*` |
| Source files | **250** | `find src -name '*.ts'` |
| **Coverage %** | **not measurable — no coverage tooling exists** (no jest/vitest/c8/nyc; tests are standalone `tsx` scripts). Reporting a number here would be inventing one. | `package.json` |
| Mobile viewport gate | **0/20 screens overflow**, 12 widths in Chromium | `test_mobile_viewport.mjs` |

**Which untested layer let D-1 through:** nothing exercises *stored-ciphertext
round-tripping against the configured key*. `test_token_encryption.ts` tests
encrypt→decrypt within one process, where the key is trivially the same one.
The missing test is a boot-time assertion that a sample of stored tokens is
readable with the running key — which is what
`scripts/count-undecryptable-tokens.ts` now does on demand and what a startup
health check should do continuously. I did not wire it into boot: that is a
runtime behaviour change on the crypto path, inside the D-1 gate.

**Is there an end-to-end test of connect Meta → sync → render dashboard?**
No. There are strong unit and semantic suites either side of the seam
(`test_worker.ts`, `test_golden_archetypes.ts`, `test_mobile_viewport.mjs`)
but nothing crossing it.

---

## Structural risks

These keep producing defects until the architecture changes. Ordered by how
often they have already bitten.

1. **Browser JavaScript lives inside TypeScript template literals.** `tsc` sees
   an opaque string, so a stray backtick or a `+` at a line start compiles
   perfectly and takes a 400 KB page down at runtime. This has happened
   **seven times**. `test_page_scripts.mjs` catches it in under a second, but
   the real fix is extracting page JS into real `.ts` files with a build step.
2. **Authorisation enforced 97 times by hand.** The middleware that looks like
   a gate is not one. `test_route_authz.ts` now fails the build on a forgotten
   check, which converts this from invisible to loud — but the durable fix is
   a route-registration wrapper that cannot be called without declaring its
   auth requirement. *Mitigated, not eliminated.*
3. ~~**No `key_version` on encrypted columns.**~~ **Closed** (D-1a). Rotation is
   now an operation: set the previous key, bump the version, redeploy, watch
   the counter drain generation N-1.
4. ~~**Five UI regions, nine display toggles, no owner.**~~ **Closed** (D-5).
5. **Two paths to the same number.** The campaigns page totals daily insight
   rows while its cards render per-campaign windows; the dashboard prints a
   server-formatted `display` string while campaigns format client-side from
   minor units. Both follow the same `days` selection, so they should agree —
   but nothing checks that they do. What changed is that the monitor which
   should notice no longer answers "all clear" when it has not looked (D-13),
   and the server already computes `divergencePct` for exactly this. The
   remaining gap is that no test asserts the two agree.
6. **The dashboard is a single 434.9 KB document** carrying command centre,
   KPI cards, campaign table, five trend charts, events feed and monitoring
   panel — all blocking first paint, none code-split. There is no bundler to
   split with, so this is an architecture decision, not a config change.
7. **No coverage measurement at all.** 56 test files is a real suite, but with
   no instrumentation nobody can say which of the 250 source files it never
   touches — and D-1 is exactly the kind of gap that hides there.
