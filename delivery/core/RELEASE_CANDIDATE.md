# Core release candidate — composition, evidence map, open decisions

**بالعربية، باختصار.** هذا فرع محلي غير مدفوع (`local/core-release-candidate`) يجمع: قاعدة `12d7ac5` + `local/data-health` + `local/railway-preflight` + تغييرات البنود الخمسة (تنظيف اليتامى للتقرير فقط، بوابة الإنفاق غير الموثّق، الدور والملكية قبل كتابة التوصيات، سكربت النسخ الاحتياطي، التحقق). كل ما فيه `LOCAL_PASS` على قواعد Postgres اصطناعية على loopback؛ لم يُدفع ولم يُنشر ولم يُكتب شيء على الإنتاج. `CI_PASS` و`LIVE_VERIFIED` = `NOT_RUN`. الـChecker منفصل عند `eca93c1`، وWebKit = `BLOCKED` حتى تشغيل حقيقي.

> **What this is.** A local, unpushed branch. Nothing here was pushed, merged to `origin`, dispatched as a workflow, deployed, or run against Railway, Cloudflare, GitHub Actions or any production data. Every result is **`LOCAL_PASS`** (the CI-equivalent `env -i … npm run test:all`, and the synthetic-Postgres suites on loopback databases named `adlytic_repro*`). **`CI_PASS`: `NOT_RUN`. `LIVE_VERIFIED`: `NOT_RUN`.** The exact commit, its prerequisite and the verification record are in the bundle manifest and the delivery report, not in this file (a file cannot name the commit that contains it).

Status vocabulary: `CODE_PRESENT` (the code is there), `LOCAL_PASS` (a test ran green on this machine), `CI_PASS`, `LIVE_VERIFIED`, `BLOCKED` (cannot be run here), `NOT_RUN`.

---

## 1. Composition

| Part | Source | Notes |
|---|---|---|
| Base | `12d7ac5` (branch `claude/zen-davinci-2ltpq9`, 15 commits ahead of `origin` at `858339d`) | IQD repair, health gate, … |
| Data-health isolation | `local/data-health` @ `229359b` | cherry-picked; `delivery/core/DATA_HEALTH_ISOLATION.md` |
| Railway preflight and runbook | `local/railway-preflight` @ `c00e4bb` | cherry-picked; `delivery/core/RAILWAY_RECOVERY_RUNBOOK.md` |
| Item 1 — orphan sweep, batch-bound approval, `raw_insights` hold | written on this branch | §2 |
| Item 2 — unverified spend out of advice | `local/rc-spend-recs` + review rounds | `delivery/core/SPEND_EVIDENCE_GATING.md` |
| Item 3 — role and ownership before writes; signup cannot grant admin | `local/rc-recs-auth` + review rounds | `delivery/core/RECOMMENDATION_WRITE_AUTH.md` |
| Item 4 — backup script | written on this branch + review rounds | `backup_database.command` |

**`package.json`:** the only merge conflict was the single `test:all` line. Both sides' suites are kept: the data-health ones (`test:iqd-no-get-writes`, `test:data-health-isolation`) and the preflight one (`test:preflight-schema`), plus this branch's `test:recommendation-write-auth`, `test:platform-admin-signup`, `test:spend-evidence`, `test:backup-database`. The Postgres suites are **not** in `test:all` (CI has no database): `test:iqd-repair-pg`, `test:data-health-isolation-pg`, `test:preflight-schema-pg`, `test:recommendation-write-auth-pg`, `test:platform-admin-signup-pg`, `test:spend-evidence-pg`, `test:backup-database-pg`; each exits **2 ("NOT RUN" / "REFUSED"), never green**, unless it can reach a loopback database named `adlytic_repro*`.

---

## 2. Requirement → what changed → evidence → what is not proven

### Item 1 — scheduled orphan cleanup is report-only; platform cleanup is explicit and bound to the exact dry-run batch; the recovery runbook preserves `raw_insights` and keeps workers stopped

* **Change.** `backgroundScheduler.runIntegritySweep` imports only `reportOrphanedCampaignStatsGlobal` and logs `… ORPHANED campaign stats (REPORT ONLY — nothing was deleted)`. There is no scheduler principal and no percentage guard. The platform route is two steps: `GET /api/admin/data-health/orphans` (dry run: counts, share, `batchId` = SHA-256 over the ordered, length-prefixed ids of every orphan row) then `POST …/orphans/cleanup?expectedRows=N&batchId=H`, one statement that decides the set and deletes it, only if digest **and** count equal the approval (409 otherwise). The approval runs in a REPEATABLE READ transaction (a row changed after the snapshot aborts it: `skipped_concurrent_change`), waits at most 10 s for a lock, runs at most 600 s (`skipped_timeout`, 503). Runbook 5.2a / 5.3 / R3 / R3b / R4 / A21: dump `raw_insights` first, keep every worker stopped, set `SERVICE_ROLE=api` **and** `RAW_INSIGHTS_RETAIN_DAYS=36500` together.
* **Evidence (`LOCAL_PASS`).** `test_data_health_isolation.ts` (CI-safe, parses `src/` and `scripts/`), `test_data_health_isolation_postgres.ts` (batch binding incl. a row swapped for another with the same count; a row committed after the snapshot survives; replay → 409; two overlapping identical approvals → one 200 + one 409 with both blocked on a row lock; a row re-keyed onto a live campaign during the wait → nothing deleted; a lock held past 10 s → 409; the sweep leaves every `daily_stats` row and its `xmin` unchanged with orphans at ~2 %, below the old 20 % guard), `scripts/repro/raw_insights_hold.sh` (runbook A21: three real server processes — orphans 2 → 2 in all, `raw_insights` 2 → 2 with `SERVICE_ROLE=api` and with `RAW_INSIGHTS_RETAIN_DAYS=36500`, 2 → 1 under the default role). Mutants of every guard were killed (listed per document).
* **Not proven / open.** A tenant's own cleanup (`POST /api/workspaces/:id/data-health/cleanup`, the button on the campaigns page) is still a one-click bulk delete of the workspace's verified orphans (not a dry run, not batch-bound, not confirmed) — runbook R3b, owner decision. The hold stops the platform's own writers, **not tenants**: they can still delete an ad account or their own account (which purges `raw_insights`), sync, and repair — runbook 5.2a lists them. The batch binds row **ids**, not content or time; an approval never expires. Whether Railway's actual volume holds anything is unknown (`BLOCKED`).

### Item 2 — `SPEND_SCALE_UNVERIFIED` stays visible for the affected periods after `factor = 1`; unverified spend is excluded from the recommendations that depend on it

* **Change.** Spend is "verified" only when `raw_insights` evidence matches the stored rows (`src/lib/spendEvidence.ts`, `spendScaleRule.ts`); the verdict is per period and per level. The Brain, the rules/recommendation/forecast engines, the dashboard's `aiRecommendations`, the weekly report, the AI tool `save_recommendation`, stored-recommendation display, and (second review round) the investigate route, the agent tools and the issues list withhold or caveat spend-dependent output; `dataQuality` / `X-Data-Quality` / `X-Recommendations-Withheld` say what was withheld and why, an evidence read that fails is flagged (fail closed), and two pages render the banner. USD accounts and fully-verified IQD accounts are byte-identical to before (`scripts/repro/spend_evidence_differential.ts`).
* **Evidence (`LOCAL_PASS`).** `test_spend_evidence.ts`, `test_spend_evidence_postgres.ts` (verified / unverified / USD twins; RED on the old code), differential script, mutation checks per gate (`SPEND_EVIDENCE_GATING.md` §8).
* **Not proven / open.** Several surfaces still carry spend unflagged (AI chat context, the health efficiency facet, the morning story, `brain.livePulse`, …): the table in `SPEND_EVIDENCE_GATING.md` §8.3 is the authority. The gate is strict (one unverified day withholds the spend-dependent advice for its window); the Brain loses cost-based verdicts on a 3 % campaign-vs-account drift of today's row (owner decision); verification is not persisted (no schema column); IQD accounts on Railway lose cost-based advice until raws re-verify their rows; the mobile app does not render `dataQuality`.

### Item 3 — role and ownership are enforced before any recommendation write or refresh; foreign ids and unauthorised roles produce zero writes (two tenants); public signup cannot grant platform-admin access

* **Change.** `POST …/recommendations/action` and `…/:logId/action`: authenticate → membership → role (VIEWER refused) → body shape (400) → ownership of every identifier in the body (404, same body for foreign and unknown) → only then the writes and the refresh; the services, `runRefresh` and the AI tool `save_recommendation` refuse a foreign id or a viewer on their own. Registration refuses an address the guard would accept (or fold-equivalent): `409`, before anything is read or written. Review rounds added: one `Authorization` parser for the global active-user gate and the handlers (`Bearer␠␠<jwt>` used to skip the gate), chat-v2 `conversationId` ownership, lone surrogates → 400, `apiFetch` delivering a 403's code, `upsert-owner-login.ts` refusing without `OWNER_EMAIL`/`OWNER_PASSWORD`.
* **Evidence (`LOCAL_PASS`).** `test_recommendation_write_auth.ts` (CI-safe), `test_recommendation_write_auth_postgres.ts` (tenants A and B, each OWNER/MANAGER/VIEWER, two ad accounts, three campaigns; every refusal asserts the HTTP status **and** that no row of any of the 47 tables changed — a whole-database `xmin` snapshot, `tests/support/dbSnapshot.ts`; each positive control asserts the snapshot **does** change and that no pre-existing row of tenant B moved), `test_platform_admin_signup.ts`, `test_platform_admin_signup_postgres.ts` (real app: refused signups write nothing, 7 look-alikes register as ordinary customers, a provisioned admin reaches `/api/admin/*`). Red on the old code; mutants killed (`RECOMMENDATION_WRITE_AUTH.md` §5, §9).
* **Not proven / open.** The reservation of admin addresses is a property of **one process's environment**, not of the database (a second service without `PLATFORM_ADMIN_EMAILS` accepts the signup and the real instance later treats it as admin) — needs the same non-empty list on every service, or a marker column (owner decision 1/9). A MANAGER can demote any OWNER (pre-existing, not changed). Already-squatted admin-address accounts remain admins (production audit SQL, `RECOMMENDATION_WRITE_AUTH.md` §6, **not run**). The allowlist is read once per process. Chat v2 was proven with a stand-in LLM, not a real model. Login/registration rate limits trust the leftmost `X-Forwarded-For`.

### Item 4 — the backup script has no schema-writing fallback and prints no credentials; a failing dump fails the command; a valid dump restores in isolation

* **Change.** `backup_database.command` only reads (`pg_dump`); no `prisma db push`, no `npx`. It parses the URL at the last `@`, keeps the connection settings off every command line (subshell + `exec`) and clears ambient `PG*` variables, relays pg_dump's error with the password as `***` and the user as `<user>`, exits 0 only for a complete dump (pg_dump exit 0 under `pipefail`, intact gzip, the completion marker as the last content line, no open COPY), and leaves no `*.sql.gz` on failure. It prints a restore command that verifies first (`--verify`) and sends `COMMIT` only after the whole file was read; `/backups/`, `*.sql.gz`, `*.sql.gz.partial` are git- and docker-ignored.
* **Evidence (`LOCAL_PASS`).** `test_backup_database.ts` (shims; ~200 checks; a 47-mutant matrix killed), `test_backup_database_pg.ts` (real `pg_dump` of a 48-table database; the printed command run against an intact file → restored copy equals the source, and against eleven damaged files → non-zero exit **and** an unchanged target; real scram-sha-256 logins on a throw-away cluster with hostile passwords; nothing of the password/user in stdout, stderr or file names).
* **Not proven / open.** zsh, macOS bash 3.2, BSD awk/gawk, other PostgreSQL major versions, TLS (`sslmode`) against a real TLS server: `NOT_RUN`. A dump with large objects is outside the restore wrapper's guarantee. SIGKILL can leave a `*.sql.gz.partial`. A `~/.pgpass` at its default path is still read by libpq.

### Item 5 — verification on the final commit; bundle; Checker separate; WebKit

* `npm run typecheck`, `npm run typecheck:tools`, the CI-equivalent `env -i PATH HOME PLAYWRIGHT_BROWSERS_PATH npm run test:all`, and the three required synthetic-Postgres suites (data-health isolation, IQD repair, preflight) plus the other four, all run **on the final commit**, with exit codes, in the delivery report.
* **Bundle.** An incremental git bundle of `local/core-release-candidate` over the prerequisite `858339d` (the commit on `origin`), verified (`git bundle verify`), listed (`list-heads`) and import-tested in a fresh repository (`git fetch --update-shallow`, tip SHA and tree compared).
* **Checker.** Kept separate at `eca93c1` (`local/checker-reuse`, bundle prerequisite `74f3ee6`); not touched by this branch.
* **WebKit: `BLOCKED`** (`Executable doesn't exist at /opt/pw-browsers/webkit-2370/pw_run.sh`). No WebKit result of any kind is claimed until a real run.

---

## 3. Two independent adversarial reviews

* **First review** (the release candidate at `2a5fb34`; six lenses, 78 agents, every finding re-verified by two skeptics): 36 confirmed findings, no cross-tenant read or write through the two recommendation routes and no scheduler delete. Fixed with red-before/green-after tests and mutation checks: the active-user gate bypass, chat-v2 conversation ownership, lone surrogates, the approval's row version (REPEATABLE READ), overlapping approvals, `expectedRows` overflow, the evadable static guard, `apiFetch` dropping a 403's code, the committed default owner credentials, the backup restore command that committed a partial restore, the completion marker check, a raw `@` in a password, the ignore rules, vacuous tests, and the spend gates for `aiRecommendations` / the weekly report / unreadable evidence / `GET /recommendations` visibility.
* **Second review** (the fixes at `bc1eb4b`; four lenses, 20 agents): nothing CRITICAL or HIGH. Fixed: the backup script passed secrets on `env`'s command line, ambient `PGSERVICE`/`PGHOSTADDR` redirected the dump, `psql -X`; a NUL in a chat conversation id and a body-less chat POST; the approval's lock/statement bounds; the parse-based static guard; the spend gaps and the false withhold of a verified account (see `SPEND_EVIDENCE_GATING.md`). Corrected: every document statement the reviewers proved false.
* The reviewers' reports are working papers, not part of the repository.

---

## 4. Owner decisions (none was taken by the implementation)

1. A marker column / migration for admin provenance (`users.platform_admin_since`), or refuse registration when `PLATFORM_ADMIN_EMAILS` is empty outside development; meanwhile the same non-empty list on every service sharing the database.
2. Confirm a VIEWER cannot record executed/ignored; hide the buttons from viewers (needs the role in the DTO).
3. Admin customer routes vs allowlisted addresses; guard `DELETE /api/auth/account` for admins; drop the NFKC fold (admin-address oracle).
4. Make the members routes OWNER-aware (a MANAGER can demote any OWNER); allow-list the write roles instead of `=== 'VIEWER'`.
5. Run the three read-only production audit queries (`RECOMMENDATION_WRITE_AUTH.md` §6) before relying on item 3; accept "edit env + redeploy" for granting/revoking an admin.
6. Tenant cleanup during a restore hold: leave it, or add the same batch handshake / a switch (runbook R3b); whether an approval should expire.
7. Spend: banner for periods older than the window; persist a "verified on" mark (schema); strict vs partial recompute; whether AI PAUSE counts as spend-dependent; the 90-day backfill; the campaign-vs-account reconcile tolerance (Brain loses cost verdicts on 3 % drift); the surfaces still ungated (§8.3).
8. Trusted client IP for the rate limits and a per-account login backoff.

## 5. Other things that are not done or not known

* **Live state is unknown.** Nothing was read from Railway: whether the Postgres service/volume exists, its contents, the production `_prisma_migrations`, and whether Railway auto-deploys `main` (`UNVERIFIED`, runbook R6).
* **The readiness gate and the preflight are stricter than the app** (migration identity and table shape): compare production's `_prisma_migrations` and columns before relying on a GO/NO-GO; `scripts/ops/expected-schema.json` must be regenerated with every migration.
* `scripts/count-undecryptable-tokens.ts` cannot run on this base (runbook A14). `test_page_scripts.mjs` fails in a fresh checkout (`.mobile-pages` has to be rendered first with `scripts/render-pages.mts`; after rendering, one run saw an "off-scale breakpoints" failure that was not re-run on the base) and `test_analytics_architecture.ts` has a check that fails identically on the base `2a5fb34`; neither is part of `test:all`. The plain-SQL restore needs a `psql` of the same or a newer release than the `pg_dump` (`\restrict`).
* **Not started:** the Meta pipeline refactor and the Checker pilot. The Checker is separate, at `eca93c1`.
