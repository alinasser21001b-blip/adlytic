# Recommendation writes and platform-admin signup — role and ownership before any write

**Scope.** Local release candidate: written on `local/rc-recs-auth` (based on `c25724d`), merged into `local/core-release-candidate`, then corrected after an independent adversarial review (§9). Everything below was run on synthetic Postgres 16 databases (`adlytic_repro_rc3*`, loopback only). Nothing was pushed, deployed or run against real customer data.

**The requirement (owner, verbatim).** *"Before any recommendation write or refresh, enforce role and ownership. Prove with two tenants that foreign IDs and unauthorized roles produce zero writes. Prove public signup cannot grant platform-admin access."*

---

## 1. What was wrong (reproduced on `c25724d`, through the real Hono app)

| # | Finding | Evidence on the old code |
|---|---|---|
| 1 | `POST /api/workspaces/:id/recommendations/action` and `…/:logId/action` only checked **membership**: a VIEWER could write. | VIEWER → `200`, new `recommendation_logs` row, `recommendation_executions` upsert, synchronous refresh (`refresh_logs`, `refresh_states`, regenerated recommendations/health). |
| 2 | `campaignId` from the body was stored **unvalidated**. | B's MANAGER posting A's campaign id → `200`; A's SECOND-account campaign, an id that exists nowhere, a 300-character string — all `200`. |
| 3 | `recordExecution` ran **before** the log was written, so a request that then failed left a half-write. | `itemKey` containing a NUL character → `500`, **and** `recommendation_executions` already rewritten. The review round found the same symptom for a **lone surrogate** (`"\ud800"`, valid JSON, unstorable): fixed in the parser (400). The two writes are still not one transaction — see §7 item 18. |
| 4 | A malformed body was a `500`, not a `400`. | Invalid JSON, `campaignId` as a number/object/array, `actionCode` as an array → `500`. |
| 5 | An `actionCode` that is an object reached a Prisma `where` (filter smuggling). | `{"actionCode":{"contains":""}}` → `200` and an execution recorded. |
| 6 | `runRefresh({adAccountId, workspaceId})` never cross-checked the pair. | B's ad account under A's workspace → ran, wrote `refresh_logs`/`refresh_states` and regenerated B's recommendations. |
| 7 | The services trusted their callers: `recordDashboardAction`, `trackUserAction`, `recordExecution` (the last stamped whatever workspace the recommendation's account had, so a foreign recommendation id overwrote that tenant's execution row). | Called directly with a foreign id: all wrote. |
| 8 | The AI agent's write tool (`save_recommendation`, chat v2) had an entity-scope check but **no role check**. | A VIEWER's agent call wrote a `recommendations` row. |
| 9 | `GET /api/workspaces/:id/recommendations` inserts one `recommendation_logs` row **per fetch** — for any member. | VIEWER `GET` → one new row each time. |
| 10 | `POST /api/auth/register` did not verify an address; admin authority is "address ∈ `PLATFORM_ADMIN_EMAILS`". | Registering the allowlisted address when no row existed → `201`, token, and `GET /api/admin/data-health/orphans` → `200`, `/api/admin/customers` → `200`. |
| 11 | *(found by the review round, present before this work)* The global active-user gate and the handlers parsed `Authorization` differently: `Bearer␠␠<jwt>` (two spaces, or space+tab) skipped the gate and still authenticated in the handler, so an unactivated or suspended account could write recommendations. | not-yet-activated MANAGER: one space → `403 ACCOUNT_INACTIVE`; two spaces → `200` and 6 rows changed. **Fixed:** one parser (`bearerTokenFrom`, `src/api/adapter.ts`) for both. |
| 12 | *(found by the review round, present before this work)* Chat v2 used `body.conversationId` to read history into the model prompt and to write messages with only a membership check: any member (a VIEWER too) of tenant B could read tenant A's AI conversation and write into it (flag-gated: `AI_AGENT_V2_ENABLED`). | B's OWNER and B's VIEWER → `200`, A's two messages in the model's prompt, A's conversation grew from 2 to 4 messages. **Fixed:** the id must be the caller's own conversation in this workspace (`{id, workspaceId, userId}`), else the same `404` as an unknown id, before any model call or write. |

## 2. Guard order — Part A

Every step precedes the next; **no write and no refresh happens until the last check has passed.** A refused request leaves no row changed anywhere.

`POST /api/workspaces/:workspaceId/recommendations/action`

1. authenticate — no/invalid/revoked token → **401** (`getUserId`, which also enforces `tokenVersion`; the global active-user gate sits in front of it and takes the token from the same `bearerTokenFrom()` as the handlers — before the review round it parsed the header its own way and `Bearer␠␠<jwt>` skipped it)
2. workspace membership — not a member (including a workspace id that does not exist) → **403** `Access denied`
3. role — VIEWER → **403** `{error:'Insufficient permissions', code:'INSUFFICIENT_ROLE'}` (the same `wsm.role === 'VIEWER'` rule as `POST …/data-health/cleanup`, `…/sync`, `…/repair-iqd`)
4. body shape — not a JSON object, bad `action`, missing/oversized `itemKey`, non-string fields, ids outside `[A-Za-z0-9_.:-]{1,128}`, NUL characters and lone surrogates → **400** (`src/services/recommendationWriteGuard.ts`, pure, no database)
5. ownership of **every identifier the body carries** → **404**, same body for a foreign and an unknown id (whether another tenant's id exists is not the caller's to learn)
   * `campaignId` must belong to **any** ad account of **this** workspace (`campaign.adAccount.workspaceId`)
   * `adAccountId`, if present, must belong to this workspace
   * `actionCode` / `itemKey` / `feedKey` / `itemKind` / `title` are only ever stored in **this** workspace's log or matched inside **this** workspace's account (`recommendation.findFirst({entityId: <this workspace's account id>, actionCode})`) — they cannot address another workspace's row
6. **only now**: `recordExecution` → `recordDashboardAction` → `runRefresh`

`POST /api/workspaces/:workspaceId/recommendations/:logId/action`: authenticate → member → role → the log must belong to this workspace (**404** for a foreign or unknown id) → body shape (**400**) → one `UPDATE … WHERE id AND workspace_id`.

`GET /api/workspaces/:workspaceId/recommendations`: unchanged for every member except that the per-fetch `recommendation_logs` INSERT (a recommendation write) now happens only for OWNER/MANAGER. A VIEWER still receives the list; the response simply has no `X-Recommendation-Log-Id` header (no client reads it — checked).

### Defence in depth (a future route may forget the checks above)

| Where | Refuses | How |
|---|---|---|
| `RecommendationService.recordDashboardAction` | a `campaignId` outside the stated workspace | `assertCampaignInWorkspace` before the INSERT |
| `RecommendationService.trackUserAction(logId, action, workspaceId)` | a log of another workspace / unknown | one `UPDATE … WHERE id AND workspace_id`; P2025 → `WorkspaceOwnershipError` |
| `ExecutionService.recordExecution(recId, snapshot, workspaceId)` | a recommendation whose account belongs to another workspace | compares the account's workspace before the upsert |
| `runRefresh(…)` for `RecommendationExecuted` / `RecommendationDismissed` | an `adAccountId` that is not the stated `workspaceId`'s | `assertAdAccountInWorkspace` as the **first** statement — before the plan, any engine, `refresh_states`, `refresh_logs` |
| `save_recommendation` (AI chat v2 tool) | a VIEWER, a non-member, an empty/undefined `userId` | membership lookup scoped by `{workspaceId, userId}` **before** any other query |

Two details worth knowing: (i) Prisma reads `{ id: undefined }` as "no filter", so every assertion refuses a non-string / empty id **before** it reaches a `where` (a permissive `findFirst({ id: undefined, adAccount: { workspaceId } })` would match any campaign of the workspace) — pinned by unit tests and a mutation; (ii) `MetaSyncCompleted` (sync worker / scheduler) is system-originated, carries no workspace and is unreachable from HTTP; it is unchanged.

### Where recommendation writes and refreshes come from — audit

| Path | Role / ownership | Note |
|---|---|---|
| `POST …/recommendations/action` | **fixed** (above) | `recordExecution`, log row, `runRefresh` |
| `POST …/recommendations/:logId/action` | **fixed** | |
| `GET …/recommendations` | log INSERT now OWNER/MANAGER only | |
| `save_recommendation` via `POST …/ai/chat/v2` (behind `AI_AGENT_V2_ENABLED`) | **fixed** in the tool; entity scope already existed; the route now also refuses a `conversationId` that is not the caller's own | proved against Postgres: the tool directly, and the route with a stand-in OpenAI-compatible server on loopback (a foreign / other-user / unknown conversation id → `404`, no model call, zero writes). A real model was **not** run |
| `POST …/sync`, `POST …/repair-iqd` | already OWNER/MANAGER; account derived from the workspace | pinned by the Postgres test (anonymous 401 / non-member 403 / viewer 403, zero writes) — these cases pass on the old code too |
| Background scheduler, sync worker (`runRefresh(MetaSyncCompleted)`, `runEngines`, brain tick) | system-originated; no request identifier | out of scope; not changed |
| `POST /api/admin/reconcile-actions` | `requirePlatformAdmin` | platform-wide by design |
| `POST …/campaigns/:id/discover-creatives`, `…/investigate`, `POST /api/ad-assessor/assess` | any member | they write **creatives / caches / AI history, not recommendations**; not changed, listed so the owner can decide |

## 3. Product decision — may a VIEWER record "executed / ignored"?

**No. Recording an action is a write and needs OWNER or MANAGER**, consistent with every other mutating workspace route (`PATCH` workspace, members, ad-accounts, sync, repair-iqd, data-health cleanup). Reasons: the row is not personal — `getAppliedItemKeys` reads it **workspace-wide**, so one viewer's "ignore" hides that recommendation from the owner's dashboard for `APPLIED_ACTION_LOOKBACK_DAYS` (7); an EXECUTED row starts an outcome evaluation that is later read as evidence of the recommendation's success; and each call triggers a synchronous recalculation of the account's recommendations and health.

**UI call sites (`src/web/**`) — these are everything that calls the endpoint:**

| Page | Control | Call |
|---|---|---|
| `src/web/pages/recommendationsPage.ts` | "نفّذت" confirm (`confirmDo`) and "تجاهل" (`ignoreTask`) → `postAction` | `POST …/recommendations/action` (EXECUTED / IGNORED) |
| `src/web/pages/dashboardPage.ts` | "I've applied this" in the Main Move modal (`confirmExecuteAction`) | `POST …/recommendations/action` (EXECUTED) |
| `src/web/pages/beginnerDashboardPage.ts` | `#bgn-task-do` button | `POST …/recommendations/action` (EXECUTED) |

Nothing in `src/web` calls `…/:logId/action`. **What a VIEWER now sees:** the buttons are still shown (hiding them needs the role in the DTO — not done); clicking one returns `403 {code:'INSUFFICIENT_ROLE'}` and each page shows a clear message instead of a generic failure (*this only became true in the review round: `apiFetch` read the 403 body for the inactive-account check and the code never reached the pages; it now reads the error body once, and a behavioural test drives the real function — still not seen in a browser*) — *"صلاحية المشاهدة لا تسمح بتسجيل الإجراءات — اطلب من مالك أو مدير مساحة العمل تسجيلها"* (the dashboard also has the English line *"Viewers cannot record actions — ask a workspace owner or manager."*). The recommendations list, dashboard and everything else read-only is unchanged. Verified: every inline page script still parses (`test_page_scripts.mjs` → 31 scripts, 0 failed; that script's separate off-scale-breakpoint check already fails on `c25724d` and is unrelated) and `test_no_english_in_ar_pages.mjs` is clean. **Not verified in a browser.**

## 4. Part B — public signup cannot grant platform-admin

### The weakness
`requirePlatformAdmin` authorises a user iff the **stored address** (trimmed, lower-cased) is in `PLATFORM_ADMIN_EMAILS`; `POST /api/auth/register` does not verify addresses. Whoever registered an allowlisted address first became a platform admin (finding 10; reproduced: `201`, then `200` on `/api/admin/*`).

### The rule chosen (no migration)
**A signup to an address that the guard would accept — or that reads as one after NFKC — is refused: `409 {error:'Email already in use'}`, before anything is read or written, no token, no cookie.** Platform admins are provisioned **out of band** (see §6). Implementation: `isReservedForPlatformAdmin(email)` in `src/api/adminGuard.ts` =
1. `isPlatformAdminEmail(email)` — the guard's **own** predicate, applied to the same string registration stores (`toLowerCase().trim()`): any string the guard would treat as an admin can never be registered, by construction, not by a second implementation that could drift;
2. the NFKC-folded forms are equal (full-width letters, compatibility ligatures…) — defence in depth against a later widening of the guard's normalisation.

The refusal is deliberately the **same answer as "address already in use"** (same status, same body). **That does not fully hide which addresses are admins:** the NFKC branch also refuses a *fold-equivalent variant* of an allowlisted address (e.g. full-width letters) with the same `409`, while the same kind of variant of an ordinary address registers (`201`) — so an unauthenticated caller who guesses an address can learn whether it is allowlisted (review finding adminsignup-F2; limit 15, owner decision 10).

### Variants checked (CI-safe unit test + Postgres through the real app)

| Variant of an allowlisted address | Result |
|---|---|
| exact, UPPER, Mixed, as written in the allowlist | refused 409 |
| padded with space / tab / CR / LF / NBSP (U+00A0) / BOM (U+FEFF) / ideographic space (U+3000) / em space | refused 409 (`trim()` strips them, in registration and in the guard alike). Characters `trim()` does **not** strip (U+200B, U+0085, U+180E) make a *different* string, which the guard does not read as an admin either — the fuzz pads with them too |
| Kelvin sign `K` (U+212A) — `toLowerCase()` yields ASCII `k` | refused 409 (this one **is** an exact-guard match) |
| full-width `ｋ…`, `ａ…` (NFKC look-alikes) | refused 409 (not an escalation on the old code — the guard compares exact strings — refused as defence in depth) |
| plus-addressed `admin+x@…` | **ordinary customer** (201): not equal under the guard, `isPlatformAdmin:false`, `/api/admin/*` 403, `GET /admin` → 302 `/dashboard` |
| dot removed / added | ordinary customer, same proof |
| trailing dot on the domain, zero-width space inside, other domain | ordinary customer, same proof |

Plus-addressing and dots are **not** folded on purpose: the guard compares whole addresses, so such an account cannot be admin; refusing them would only lock the admin's own aliases (e.g. `owner+test@…`) out of signup. A 20,000-string fuzz (case flips, padding, Unicode look-alikes, NFC/NFD/NFKC/NFKD, plus/dot insertion) checks the invariant *"if registration accepts the string, `requirePlatformAdmin` would not treat the stored address as an admin"*.

### Why not "the row must pre-date the request"
The brief suggested requiring that the user row pre-dates the request in a way a self-service flow cannot forge. **Not feasible without a migration**, so it was not added:
* The schema has no marker that separates an out-of-band row from a self-service one. A self-service signup is `isActive=false, activated_at=NULL, activated_by=NULL`; `scripts/create-user.ts` produces the **same** shape; only `scripts/upsert-owner-login.ts` and the admin routes (`createCustomer`, `setCustomerActive`) set `activated_by`, so a legitimately provisioned row can look exactly like a signup.
* `isActive` (the only forge-resistant-looking signal — a signup cannot activate itself) is **explicitly not allowed to be a security control** here: `test_admin_revocation.ts` asserts `adminGuard` never reads it ("that would make a business lifecycle flag a security control"), and `server.ts` documents that an admin's own row may be inactive.
* `createdAt` says nothing about *when the address was put on the allowlist* (an env var).

So: the rule above closes the self-service path; the **already-squatted-row** case (§7, limit 1) needs either a one-time owner check (SQL in §6) or a migration (a `users.platform_admin_since` / `provisioned_by` column, plus regenerating `scripts/ops/expected-schema.json`) — an owner decision.

### Every path that creates a user, sets or changes an email, or logs a user in

| Path | Self-service? | Outcome |
|---|---|---|
| `POST /api/auth/register` | yes | **the fixed path** (refused for reserved addresses; non-string email/password → 400 instead of 500) |
| `POST /api/auth/login` | yes | no creation; finds a user by `toLowerCase().trim()`; issues a token only for an existing row |
| `PATCH /api/auth/profile` | yes | writes `name` **only** (pinned: no `email` in its `data`) — proved: an `email` field in the body is ignored |
| `POST /api/auth/password`, `logout-all`, `DELETE /api/auth/account` | yes | touch `passwordHash` / `tokenVersion` / delete; never an address |
| `POST /api/workspaces/:id/members/invite`, `POST …/members` | yes (OWNER/MANAGER) | find an **existing** user by address/id and add a membership row only; creates no user, sets no address. Proved: inviting the admin adds one `workspace_members` row and nothing else; the inviter gets no admin authority |
| Meta OAuth (`/api/meta/oauth/*`), `/api/auth/session-cookie`, webhooks | — | no user creation; the only two `signToken` calls in `src/` are register and login (pinned) |
| password reset by mail, magic links, invitation tokens | **do not exist** | no module for them in `src/` (pinned); an address is never proven by mail anywhere |
| `POST /api/admin/customers`, `PATCH /api/admin/customers/:id` (`createCustomer`, `updateCustomerUser`), `reset-password`, `activate` | no — `requirePlatformAdmin` | **allowed to use an allowlisted address on purpose**: the actor is already a platform admin, and this is the only in-product way to provision a second admin. Proved: an ordinary customer gets `403` and no row changes. See owner decision 3 |
| `scripts/*` (`upsert-owner-login.ts`, `create-user.ts`, `reset-password.ts`, seed) | out of band (operator with `DATABASE_URL`) | **this is how admins are provisioned** |

`test_platform_admin_signup.ts` pins the set of files in `src/` that create/update/delete a user (`server.ts` ×6, `adminConsole.ts` ×5): a new one fails the test and forces a review against this rule.

### `/api/auth/me`, `INACTIVE_ALLOWED_API`, the allowlist cache
* `/api/auth/me` computes `isPlatformAdmin` from the stored address with the guard's own predicate (a UI hint only). Proved `false` for an ordinary new user and for every look-alike, `true` for a provisioned admin.
* `INACTIVE_ALLOWED_API` (`/api/auth/me`, `/api/activation/whatsapp-link`, `/api/auth/session-cookie`) is unchanged and pinned; `/api/admin/*` is exempt from the active-user gate by design (an inactive admin keeps access). **Revoking an admin is removing the address from `PLATFORM_ADMIN_EMAILS` and redeploying** (the list is read once per process). Bumping `tokenVersion` only ends the live sessions — the admin logs in again and is an admin again — and `is_active = false` changes nothing for an admin; to stop re-entry as well, remove the address, then reset the password or delete the row. (An earlier version of this document, a comment in `src/web/auth/sessionRouter.ts` and a line in `DATA_HEALTH_ISOLATION.md` called `tokenVersion` a kill switch; that was wrong.)
* **The allowlist is read once per process** (module-level cache in `adminGuard.ts`). Adding or removing an admin takes effect on the next process start (a redeploy). The signup reservation uses the **same** cache, so within one process the guard and the reservation always agree; during a rolling deploy two replicas may briefly disagree. Pinned by a test that changes the variable at runtime and shows nothing changes until the (test-only) reset.

## 5. Evidence

All commands run from the repo root; `DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc3`.

| Suite | Command | Result | On the old code (`c25724d`) |
|---|---|---|---|
| Part A, CI-safe | `env -i PATH=$PATH HOME=$HOME npx tsx test_recommendation_write_auth.ts` (`npm run test:recommendation-write-auth`, in `test:all`) | 81 passed, 0 failed (58 in the first version) | **red (exit 1)**: 7 failures in section 2, then the run aborts on the old services' unscoped calls (the first 16 checks pass — the parser/guard module is new) |
| Part B, CI-safe | `env -i … npx tsx test_platform_admin_signup.ts` (`npm run test:platform-admin-signup`, in `test:all`) | 61 passed, 0 failed (55 in the first version) | **red (exit 1)**: crashes at the first check, `isReservedForPlatformAdmin` does not exist. The behavioural proof of the old weakness is the Postgres run above |
| Part A, two tenants, Postgres | `npm run test:recommendation-write-auth-pg` | 128 passed, 0 failed (106 in the first version; the review round added the double-space gate cases, the lone-surrogate cases and section 7b, chat v2 with a stand-in LLM) | **60 passed, 46 failed** on the first version; the review-round cases are red on `2a5fb34` too (11 and 8 failures, §9) |
| Part B, real app, Postgres | `npm run test:platform-admin-signup-pg` | 47 passed, 0 failed | **28 passed, 19 failed** |

**How "zero writes" is proved.** `tests/support/dbSnapshot.ts` snapshots **every base table of the public schema** (47 tables, discovered from the catalog — a table added tomorrow is covered) as `row identity → xmin` before and after each negative case, and requires the two to be identical. `xmin` (the id of the transaction that wrote the row version) changes on any UPDATE, even one that writes the same values, and on any insert/delete — so a write to a table the test never thought of still turns it red. `pg_stat` counters are not used (they lag). Each negative case asserts the HTTP status **and** an identical snapshot. Each positive control asserts the snapshot **does** change (so the zero-write results are not vacuous), in the expected tables, and that **no pre-existing row that mentions tenant B** (any column, any table) was rewritten or removed by A's authorised request — even one carrying B's action code and an `itemKey` that spells B's log id.

Part A negatives (HTTP): anonymous; non-JWT token; JWT signed with another secret; revoked token (`tokenVersion`); non-member; MANAGER whose account is not activated; VIEWER (EXECUTED, IGNORED, and with a foreign campaign — role is judged before ownership: 403 not 404); B's OWNER with A's workspace id (own and foreign campaign); a workspace id that does not exist (same 403); B's MANAGER/OWNER in B's workspace with A's campaign (incl. one on A's **second** ad account); A's MANAGER/OWNER with B's campaign; a campaign that exists nowhere (same status and body as a foreign one); a carried `adAccountId` of B; 23 malformed bodies (400); the same matrix for `…/:logId/action` (foreign log, unknown log, 6 malformed bodies); VIEWER / non-member / anonymous `GET …/recommendations`, `POST …/sync`, `POST …/repair-iqd`. Service level, called directly: `recordDashboardAction`, `trackUserAction`, `recordExecution`, `runRefresh` (B's ad account and B's second account under A's workspace; an unknown ad account; an unknown workspace). Agent tool: VIEWER, non-member, unknown user, B's ad account, B's campaign. Positive controls: A's OWNER (EXECUTED: log + execution + `refresh_logs` + `refresh_states`), A's MANAGER (IGNORED on a campaign of A's second account; no campaign), `…/:logId/action` (OWNER and MANAGER), MANAGER `GET` (logs), B's own MANAGER, the service calls with matching ids, the agent tool as MANAGER.

Part B (Postgres, real app): 12 refused signups (each: 409, no token, no cookie, **no row changed in any of 47 tables**, the credentials do not log in — except for the existing admin, whose own login legitimately works); the refusal is byte-identical to "already in use"; 7 look-alikes sign up as ordinary customers (`/api/auth/me` false, `/api/admin/*` 403, `/admin` 302); ordinary signup positive control (201, token, cookie, workspace, OWNER membership); a provisioned admin logs in and reaches `/api/admin/data-health/orphans`, `/customers`, `/platform-stats`, `GET /admin`; a profile `PATCH` carrying an `email` changes nothing; invite / admin-create / admin-patch / activate / admin-reset-password cases; 7 malformed signup bodies (400 not 500).

**Mutation checks** (a perl one-liner breaks one guard, all four suites run, the file is restored with `git checkout`): 33 mutations, each run against all four suites (`ciA`/`ciB` = the CI-safe files, `pgA`/`pgB` = the Postgres files).

| # | Mutation | Result |
|---|---|---|
| M01 | action route: VIEWER check dropped | killed — ciA, pgA |
| M02 | `:logId` route: VIEWER check dropped | killed — ciA, pgA |
| M03 | action route: campaign ownership check dropped | killed — ciA, pgA |
| M04 | action route: `adAccountId` ownership check dropped | killed — ciA, pgA |
| M05 | `:logId` route: log looked up by id only (not workspace) | killed — **ciA only**: at runtime the scoped `UPDATE` in the service still refuses, so the HTTP behaviour is unchanged (that is the point of the second layer); the static test pins the route's own scoping |
| M06 | `GET …/recommendations` logs for every role again | killed — ciA, pgA |
| M07 | execution lookup no longer scoped to this workspace's account | killed — ciA, pgA |
| M08 | ad-account ownership failure answers 403 instead of 404 | killed — pgA |
| M09 | route uses the raw body (no validation) | killed — ciA, pgA |
| M10 | `assertCampaignInWorkspace` no longer scoped to the workspace | killed — ciA, pgA |
| M11 | `assertCampaignInWorkspace` no longer refuses an unusable (undefined/empty) id | killed — **ciA only** (the route validates ids first, so only the unit test reaches this) |
| M12 | `assertAdAccountInWorkspace` no longer scoped to the workspace | killed — ciA, pgA |
| M13 | parser accepts a NUL character in `itemKey` | killed — ciA, pgA |
| M14 | parser accepts non-string optional fields (objects) | killed — ciA, pgA |
| M15 | `recordDashboardAction` no longer checks the campaign | killed — ciA, pgA |
| M16 | `trackUserAction` updates by id only | killed — ciA, pgA |
| M17 | `recordExecution` no longer compares the workspace | killed — ciA, pgA |
| M18 | `runRefresh` no longer asserts ownership for user events | killed — ciA, pgA |
| M19 | `save_recommendation` lets a VIEWER save | killed — ciA, pgA |
| M20 | `save_recommendation` runs the membership lookup with an undefined `userId` | killed — **ciA only** |
| M21 | both route ownership checks removed together | killed — ciA, pgA |
| B01 | register: reservation removed | killed — ciB, pgB |
| B02 | reservation: NFKC fold removed (returns false) | killed — ciB, pgB |
| B03 | `foldAddress` without NFKC | killed — ciB, pgB |
| B04 | register: reservation moved after the user lookup | killed — **ciB only** (both orders answer 409; the static test pins "before any read or write") |
| B05 | register: reserved address answers 400 (distinguishable from "in use") | killed — ciB, pgB |
| B06 | guard: allowlist entries no longer lower-cased | killed — ciB, pgB (the provisioned admin gets 403) |
| B07 | register: non-string email/password check removed | killed — ciB, pgB |
| B08 | `isReservedForPlatformAdmin`: non-string guard removed | killed — ciB |
| B09 | `isReservedForPlatformAdmin`: the guard's own predicate removed (fold only) | **first run: SURVIVED**. It is an *equivalent mutant* at runtime — the NFKC fold is a superset of the exact comparison, so no input distinguishes them. The property that matters is structural (registration and `requirePlatformAdmin` decide with one function), so a test now pins it; killed — ciB |
| B10 | register: stored address no longer lower-cased | killed — **ciB only** (the reservation still lower-cases, so the HTTP answer is the same; the static test pins the normalisation the fuzz assumes) |
| B11 | `PATCH /api/auth/profile` also sets `email` | killed — ciB, pgB (the customer becomes an admin through it) |
| B12 | `INACTIVE_ALLOWED_API` gains an admin-adjacent path | killed — ciB |

Mutations M05 and M08 were first written with a perl delimiter that did not compile (no-op); they were corrected and re-run, which is why the table is in one piece.

`test_data_health_isolation_postgres.ts` §2b used to assert that the forged-claim POSTs *succeed* ("a known, documented residual"). They are now refused, so that section asserts the refusal and inserts the legacy rows (the ones the old route left behind) **directly**, which keeps testing what it was written for: a recommendation log is not ownership evidence. 35 passed, 0 failed.

## 6. Owner actions and read-only audits

**Provisioning an admin now** (out of band): create the account with `scripts/upsert-owner-login.ts` (sets `is_active`, `activated_by`, owner workspace) — **it now refuses to run unless both `OWNER_EMAIL` and `OWNER_PASSWORD` are set; it creates the login or RESETS an existing one's password, and before the review round it fell back to an e-mail and a password committed in the repository when they were unset** — or with `npm run create-user` (check its own requirements first: it reads `.env` through `tsx --env-file=.env`, which does not exist on a clean checkout); **then** add the address to `PLATFORM_ADMIN_EMAILS`; **then** redeploy (the list is read once per process). The order matters only for an address nobody has registered: with the new rule nobody can register it in the meantime.

*Existing data — run read-only against production once, before relying on this (written against the schema, tested on a synthetic database):*

```sql
-- 1. Does every allowlisted address map to a row YOU created? (the case the rule cannot fix: a row someone registered before the rule)
SELECT id, email, is_active, activated_at, activated_by, created_at
FROM users WHERE lower(btrim(email)) IN ('<admin address 1>', '<admin address 2>');
-- btrim() strips only the space character, while the guard's trim() also strips tab, CR, LF, NBSP, BOM and other Unicode space. To be exact, run the application's own predicate instead of this SQL (isPlatformAdminEmail over every stored address), or widen the pattern:
--   WHERE lower(regexp_replace(email, '^[[:space:]\ufeff]+|[[:space:]\ufeff]+$', '', 'g')) IN (...)
-- a self-service signup looks like: is_active = f, activated_at IS NULL, activated_by IS NULL, created_at = the day they signed up

-- 2. Non-ASCII addresses (look-alikes of an admin address would show here)
SELECT id, email, created_at FROM users WHERE email ~ '[^\x01-\x7f]';

-- 3. recommendation_logs naming a campaign of ANOTHER workspace (written through the old, unvalidated route)
SELECT l.workspace_id, a.workspace_id AS campaign_workspace, count(*)
FROM recommendation_logs l
JOIN campaigns c   ON c.id = l.campaign_id
JOIN ad_accounts a ON a.id = c.ad_account_id
WHERE a.workspace_id <> l.workspace_id
GROUP BY 1, 2;
-- campaigns that were deleted afterwards cannot be told from forged ones by this query; the data-health ownership rule already ignores these rows.
```

## 7. Honest limits

1. **Already-squatted rows.** The rule stops *new* signups. A row someone registered with an address that is (now) allowlisted keeps its admin authority until the owner removes/renames it — query 1 above. The schema cannot tell it from a legitimate row (§4).
2. **No forge-resistant "provisioned" marker.** A migration (`users.platform_admin_since`, or `provisioned_by`) is the real fix; it also needs `scripts/ops/expected-schema.json` and the readiness gate regenerated. Not done — owner decision 1.
3. **The allowlist is read once per process.** Granting or revoking an admin needs a redeploy; replicas can disagree during a rolling deploy.
4. **Admin-only routes can still create/edit an account with an allowlisted address** (intentional, §4). A compromised admin session could mint another admin that way.
5. **Existence oracle.** `POST …/members/invite` answers `404 "No Adlytic account found for <email>"`, so any OWNER/MANAGER can learn whether an address — including an admin's — has an account, and can add any existing user (including an admin) to their own workspace without that user's consent. Not an escalation; not changed.
6. **Look-alike accounts** (zero-width space, plus, dots, other domains) are ordinary customers but may confuse a human reading the admin customer list.
7. **Role check is `=== 'VIEWER'`**, the existing convention. A role added to `WorkspaceRole` later would default to *allowed*. Switching every mutating route to an allow-list (`OWNER`/`MANAGER`) is a separate, mechanical change.
8. **`MetaSyncCompleted`** is not ownership-checked inside `runRefresh` (system event, no workspace); only user-originated events are.
9. **Viewers still see the buttons** (they get a clear message on click). Hiding them needs the caller's role in the dashboard/recommendations DTO.
10. **Old data**: `recommendation_logs` written through the old route can name foreign campaigns (query 3); nothing here rewrites history.
11. **Registration and login rate limits** key on the leftmost `X-Forwarded-For` hop (existing behaviour): per request spoofable unless the edge overwrites the header (not tested on Railway). Together with limit 15 this lets someone probe for an admin address and then guess its password without throttling. Unchanged (adminsignup-F5; owner decision 12).
12. **Not verified**: the chat-v2 route with a real model (ownership is proved with a stand-in OpenAI-compatible server on loopback); the three page messages in a real browser (the helper that delivers the code is driven by a test); anything against production data or a non-synthetic database; Redis/BullMQ mode; the Meta OAuth callback and webhooks; timing side channels. A concurrent storm of 84 mixed requests in the review round wrote exactly the expected rows and nothing for the refused ones.
13. `scripts/upsert-owner-login.ts` used to fall back to a committed e-mail and password literal. **Changed in the review round**: it exits before connecting unless `OWNER_EMAIL` and `OWNER_PASSWORD` are both set (tested). The literals remain in git history — rotate that password anywhere it was ever used.
14. **The admin-address reservation is a property of ONE process's environment, not of the database.** `isReservedForPlatformAdmin` reads the allowlist of the process that handles the signup and fails open when it is empty. Any process on the same database with an empty or different `PLATFORM_ADMIN_EMAILS` accepts the signup, and the real instance later treats that row as an admin. The repository itself describes such topologies: `railway.setup.txt` adds a second public service on the same database whose `PLATFORM_ADMIN_EMAILS = ${{adlytic.PLATFORM_ADMIN_EMAILS}}` reference *resolves EMPTY* when the variable is a shared/environment variable, and `serve.ts` mentions a validation instance pointed at the production database. **Operational mitigation:** every process that can serve `POST /api/auth/register` against a database must carry the same non-empty `PLATFORM_ADMIN_EMAILS`; check it on each service. **Real fix:** owner decision 1 (marker column) or decision 9 (refuse registration when the list is empty outside development). (adminsignup-F1, HIGH.)
15. **Admin-address oracle** through the NFKC branch (see §4). Dropping the NFKC fold removes it at no cost in safety (the guard compares exact strings) but changes what 20,000-string fuzz and 12 Postgres cases assert; not done — owner decision 10. (adminsignup-F2.)
16. **`DELETE /api/auth/account` has no admin guard** and needs no password re-entry, while `DELETE /api/admin/customers/:id` refuses an admin with `ADMIN_ACCOUNT`. A platform admin (or a stolen admin token) can delete the sole admin account; with the reservation the address then cannot register again (the answer is the misleading `Email already in use`), so **recovery is script-only** (`scripts/upsert-owner-login.ts` with `OWNER_EMAIL`/`OWNER_PASSWORD`). Not changed — owner decision 11. (adminsignup-F6.)
17. **A MANAGER can demote or delete an OWNER, including the sole OWNER** (`PATCH`/`DELETE /api/workspaces/:id/members/:memberId`: no check on the target's role, no last-owner guard on PATCH). Pre-existing, not changed, **HIGH**: it permanently removes the workspace's ability to grant OWNER. Recommendation writes treat OWNER and MANAGER alike, so §2 does not depend on it, but this document's OWNER/MANAGER wording must not be read as enforced in the members routes. Owner decision 8. (authz-F4.)
18. **`recordExecution` and `recordDashboardAction` are not one transaction.** The known trigger (a body that cannot be stored) is now a 400, but any other failure of the log INSERT after `recordExecution` — a database error, a campaign deleted between the check and the INSERT — still leaves an execution row without a log row and without a refresh. (authz-F3.)
19. **Authority is checked once, at the start of the request.** A request already in flight (tens of ms; longer when the synchronous refresh is slow) keeps writing after its caller is demoted, removed, token-revoked or deactivated. "Before any write the server enforces role" is true at check time, not at write time. (authz-F5.)
20. **Smaller pre-existing items, not changed:** `GET /api/sync-jobs/:jobId` answers 403 for another tenant's job and 404 for an unknown one (existence oracle); a NUL in the `:workspaceId` path segment is a 500 instead of a 4xx (no row changes); the action route has no per-user rate limit and every accepted action synchronously recomputes recommendations and health and clears the process-wide platform-stats cache; `evaluateOutcome` in both services is unscoped by workspace but unreachable from any HTTP route; `POST …/members/invite` answers differently for a registered and an unregistered address (limit 5). (authz-F6, F7.)

## 8. Owner decisions

1. **Add a marker column?** Without a migration the squatted-row case is a one-time manual check. With one (`users.platform_admin_since` / `provisioned_by`, set only by the out-of-band script, required by `requirePlatformAdmin`) it becomes impossible by construction. Cost: migration + regenerate `expected-schema.json` + readiness gate.
2. **Viewers may not record executed/ignored.** Confirm, or say which of the three pages should keep it for viewers (then it must stop being a workspace-wide state change).
3. **Should the admin-only create/edit routes also refuse allowlisted addresses?** Then a second admin can only be provisioned by script.
4. **Hide the action buttons from viewers** (needs the role in the DTO)?
5. **Allow-list the write roles** in every mutating route instead of `=== 'VIEWER'`?
6. **Run the three read-only queries in §6** against production before the release.
7. **Accept that granting/revoking an admin is "edit env + redeploy"**, or add a TTL/refresh to the cache.
8. **Make the members routes OWNER-aware** (only an OWNER may change or remove an OWNER; never demote the last one) — limit 17, HIGH.
9. **Fail closed when the admin allowlist is empty?** Refuse registration (503) outside development/test when `PLATFORM_ADMIN_EMAILS` is empty — blocks public signup on any process without the list; or rely on decision 1. Meanwhile: the same non-empty list on every service sharing the database (limit 14).
10. **Drop the NFKC fold** from the reservation (removes the admin-address oracle, limit 15)?
11. **Guard `DELETE /api/auth/account`** for admin addresses and require the current password (limit 16)?
12. **Trusted client IP for the rate limits** (right-most proxy hop or the platform header) and a per-account login backoff (limit 11)?

## 9. Independent review round (after the first version of this document)

A second, independent adversarial review (six lenses; every finding re-verified by two skeptics) attacked the whole release candidate at `2a5fb34`. What it found in the parts this document covers, and what happened to each:

| Finding | Severity | Outcome |
|---|---|---|
| authz-F1 — `Bearer␠␠<jwt>` skips the global active-user gate (present before this work) | HIGH | **Fixed** (one shared parser). Red on the old code (6 gate cases fail), green after; 3 mutants killed. Finding 11. |
| authz-F2 — chat v2 trusts `body.conversationId` (cross-tenant read into the prompt, write into the conversation) | HIGH | **Fixed**. 8 checks red on the old code, 128/128 green; stand-in LLM proves no secret reaches the model. Finding 12. |
| authz-F3 — lone surrogate → 500 after `recordExecution` | MEDIUM | **Fixed** for the known trigger (400 at the parser; 4 field cases + 8 unit cases); the non-atomic pair remains — limit 18. |
| authz-F4 — a MANAGER can demote/delete an OWNER | HIGH | **Not changed** (members management is outside the five requested items). Limit 17, owner decision 8. |
| authz-F5, F6, F7 — in-flight window, `sync-jobs` oracle, residuals | LOW / INFO | Documented — limits 19, 20. |
| adminsignup-F1 — reservation is per process and fails open | HIGH | **Not fixable without a migration or a policy decision.** Documented with the operational mitigation — limit 14, owner decisions 1 and 9. |
| adminsignup-F2 — NFKC branch is an admin-address oracle | MEDIUM | Claim corrected (§4); limit 15, owner decision 10. |
| adminsignup-F3 — `tokenVersion` is not a kill switch | MEDIUM | **Documentation corrected** (§4; also `DATA_HEALTH_ISOLATION.md` and the `sessionRouter.ts` comment). |
| adminsignup-F4 / truth-F1 — the provisioning script applies a committed default e-mail and password; the doc did not say to set the variables | MEDIUM / HIGH | **Fixed**: the script refuses without `OWNER_EMAIL` and `OWNER_PASSWORD` (tested; the old script turns 6 checks red). §6 corrected. |
| adminsignup-F5 — login and registration rate limits trust the leftmost `X-Forwarded-For` | MEDIUM | Documented — limit 11, owner decision 12. |
| adminsignup-F6 — self-service account deletion has no admin guard | MEDIUM | Documented — limit 16, owner decision 11. |
| truth-F2 — viewers did not actually see the message (`apiFetch` dropped the 403's code) | MEDIUM | **Fixed** (`apiFetch` reads the error body once; the real function is driven by a test; 2 mutants killed). Browser rendering still not seen. |

What **held up** under attack, as reported by the reviewers: a foreign, unknown, malformed or under-privileged request never wrote a row through the two recommendation routes (foreign / unknown / huge / NUL / array / object / negative / homoglyph ids; duplicate JSON keys, `__proto__`, 10 MB bodies, path tricks, concurrent storm; 0 rows changed across all 47 tables by xmin snapshot; nothing written after the response); the role is judged before ownership; every other route that can write recommendation-family rows refuses a VIEWER and an outsider with zero rows changed; and a 34-variant address-normalisation matrix produced no admin escalation.
