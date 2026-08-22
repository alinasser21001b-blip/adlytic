# 13 — Open debt register

**Two categories, and the distinction matters.** Debt is what ships unfixed
with a named reopening trigger. A **gate** is what must pass before closure.
They were previously mixed, which is how this register could list a
secret-exposure risk while doc 15 declared `SECURITY_GAPS = 0`.

Every item below carries an explicit class. No item is parked as
`NON_BLOCKING_DEBT` because fixing it was inconvenient; three items that were
in that column last cycle were reclassified upward once evidence was gathered,
and fixed.

Classes: `BLOCKING_SECURITY` · `BLOCKING_CORRECTNESS` · `BLOCKING_DATA_INTEGRITY`
· `BLOCKING_OPERABILITY` · `NON_BLOCKING_DEBT` · `OBSOLETE`

---

# Part 1 — Close gates (NOT debt)

| Gate | Class | State |
|---|---|---|
| **A. BUILD_SECRET_GATE** | deployment / security operational | fix landed; awaits a fresh build — doc 07 |
| **B. PERIOD_TRUTH_LIVE_GATE** | data / live behaviour operational | **CLOSED** live; re-checked after the final deploy |
| **C. CI_GATE** | repository governance | **CLOSED**, and widened this cycle |
| **D. FINAL_HEALTH_BUILD_GATE** | deployment / live verification | awaits this candidate on main |

Gate A was previously blocked on having no way to read a Railway build log.
That is solved: `verify-live.yml` proves the field by `__schema` introspection
and reads it. The measurement it returned — 16 `SecretsUsedInArgOrEnv`
warnings over 8 credentials — is what turned this from a suspicion into a
finding, and the repo-owned Dockerfile is the fix.

Gate C is closed and got wider rather than merely staying green: `tools/**`
last cycle, `Dockerfile` and `.dockerignore` this one. Both were added because
a test reads them, and a path a test reads but CI does not watch is a
false-green waiting to happen.

---

# Part 2 — Reclassified UP this cycle, and fixed

These were debt. Evidence moved them.

## R1. `ADVISORY_LOCK_POOLED_SESSION` → **BLOCKING_CORRECTNESS** — fixed

Was logged as `LOCKING_DEBT / FUTURE_RELIABILITY_REVIEW` on the grounds that
the observed pass acquired the lock and stored facts. That was evidence about
one pass, not about the mechanism.

`pg_try_advisory_lock` is re-entrant per session; Prisma runs each raw query on
whichever pooled connection is free; node-postgres hands back the most recently
released one. Two of the four in-process producers racing for the same account
key are therefore likely — not merely able — to be granted it simultaneously.
The concurrency suite passed only because its fake modelled the lock as
globally exclusive, which is stricter than Postgres. Fixed; see doc 15.

## R2. `META_LIFECYCLE_CREATEDAT_PROXY` → **BLOCKING_DATA_INTEGRITY** — fixed

The *gap* (no persisted `start_time`) is debt and stays debt — see D4. Two
modules filling that gap with `campaign.createdAt` were not: one fed the AI
assistant a manufactured campaign age, the other persisted one into
`campaign_history_snapshots`. Both report UNKNOWN now, with no migration.

## R3. `OBSERVATORY_DATACONFIDENCE_COPY` → **BLOCKING_CORRECTNESS** — fixed

An explanation that contradicts the code it explains is a defect on a
provenance surface, not cosmetics: a reader who trusts it draws the opposite
conclusion from the truth. Fixed and guarded bidirectionally.

---

# Part 3 — Open debt

Nothing here blocks closure. Each names its class, its owner, why it was not
fixed, and the exact trigger that reopens it.

## D1. `RECOMMEND_TS_UNGOVERNED_ACTIONS` — `NON_BLOCKING_DEBT`

**Owner** `analytics/intelligence/recommend.ts`

Four of six templates emit codes outside `PERMIT_ACTION_DOMAIN`
(`FIX_MESSAGING_DESTINATION`, `FIX_LANDING_PAGE`, `FIX_CONVERSION_STEP`,
`REVIEW_BIDDING`), so the guard call is vacuous for them.

**Why not blocking** `PROVEN_CONTRADICTIONS = 0`: nothing is currently
mis-advised, and the gap is *surfaced* rather than hidden — the Observatory
reports `authorityRelation: NOT_GOVERNED` for exactly these codes, so an
ungoverned `allowed: true` cannot be read as a clearance. Widening
`permitAction` would be a new semantic claim about which problem classes
contradict which fixes, and that claim is not derivable from the funnel today.

**Reopen when** a producer emits one of these four under a problem class the
funnel measured healthy, or a contradiction appears in doc 03's matrix.

## D2. `ADMIN_CONSOLE_PAGE_MERGE` — `NON_BLOCKING_DEBT`

**Owner** `adminConsolePage.ts` / `adminOsPage.ts`

Two console pages remain. Both render the same map, so no duplicate navigation
truth survives, but both still read `platform-stats`, `ops`, `capability-probe`
and `customers`.

**Why not blocking** `adminConsolePage` is a functional superset; redirecting
`/admin/classic` would remove operator capability. A functional refactor
deserves its own review, not a closure commit.

**Reopen when** the two pages disagree about a value, or `/admin` gains the
console's four exclusive APIs.

## D3. `ADMIN_SECURITY_AUDIT_SECTION_ABSENT` — `NON_BLOCKING_DEBT`

**Owner** admin IA

No SECURITY & AUDIT section, because no route serves privileged-action history.

**Why not blocking** An audit trail is a feature, and its absence is not an
auth gap: `ADMIN_AUTH_GAPS = 0` across all 43 `/api/admin` registrations.
Rendering the heading over settings and payment events would claim a capability
that does not exist.

**Reopen when** privileged actions are recorded anywhere queryable.

## D4. `META_CAMPAIGN_LIFECYCLE_NOT_PERSISTED` — `NON_BLOCKING_DEBT`

**Owner** `prisma/schema.prisma`, `workers/syncAccount.ts`

```
META_CAMPAIGN_START_AVAILABLE_FROM_EXISTING_API = YES
META_CAMPAIGN_START_PERSISTED                   = NO
```

`metaClient` already requests `start_time,stop_time`; no `Campaign` column
retains them.

**Why not blocking** Every consumer is now conservative: the Observatory
reports `expectedEligibleDates` as null rather than assuming every day in the
span was eligible, coverage stays PARTIAL rather than claiming completeness,
and since R2 nothing substitutes `createdAt`. No migration is added merely to
make a number look complete.

**Reopen when** a decision needs to distinguish "no delivery" from "not yet
started" — the first case where UNKNOWN is not good enough.

## D5. `ADVISORY_LOCK_SESSION_NOT_PINNED` — `NON_BLOCKING_DEBT` *(residual of R1)*

**Owner** `lib/advisoryLock.ts`

Acquire and release remain two independent pooled queries, so an unlock can
execute on a session that does not hold the lock; the DB-side lock then
survives until that connection closes (30s idle timeout, or process exit).

**Why not blocking, with the proof** the failure direction is
**over**-blocking. The leaking process has already released its own
reservation and proceeds; another instance is refused and retries next pass.
A skipped pass is a liveness delay, not a correctness violation — unlike the
re-entrant double-acquire R1 fixed, which was one. The unlock result is now
checked and logged, so the condition is diagnosable instead of silent.

**Why not fixed here** pinning one session for the whole
acquire → work → release lifetime takes these helpers off Prisma and onto a
`pg.Pool` client. The concurrency suite that exercises them would then need a
live database, and the suite deliberately requires none.

**Reopen when** the unlock-returned-false warning appears in production, or the
pool gains a path that keeps one connection hot indefinitely.

## D6. `PRISMA_CONFIG_UNDECLARED_DOTENV` — `NON_BLOCKING_DEBT` *(new)*

**Owner** `prisma.config.ts`, `package.json`

`prisma.config.ts` imports `dotenv`, which is not in `package.json`. It
resolves transitively (`prisma` → `@prisma/config` → `c12` → `dotenv`, and
`dev=false` in the lockfile, so `--omit=dev` keeps it).

**Why not blocking** if that transitive path ever changes, `prisma generate`
fails at BUILD time — loudly, and a failed build never replaces a running
deployment. It cannot fail silently in production.

**Reopen when** the prisma dependency tree changes, or the build fails
resolving `dotenv`.

## D7. `AR_I18N_NBSP_FALSE_POSITIVE` — `NON_BLOCKING_DEBT` *(new)*

**Owner** `test_no_english_in_ar_pages.mjs`

The gate reports one finding on `add-client.html`: a literal U+00A0. That is
whitespace, not English text, and the detector is reporting its own escape
rather than page content.

**Why not blocking** the gate is not in `test:all` or CI, the finding predates
this cycle, and no Arabic page renders English because of it.

**Reopen when** the detector is next touched, or a real English node appears
alongside it.

## D8. `RAILWAY_BUILD_QUEUE_LATENCY` — `NON_BLOCKING_DEBT` *(new)*

**Owner** platform / Railway

The Dockerfile build is materially slower than the Nixpacks build it replaced,
and Railway serialises the service's builds. After two merges, three
deployments sat `QUEUED` simultaneously — one of them for forty minutes — and
one transitioned `BUILDING` back to `QUEUED`.

**Why not blocking** it is deploy latency, not correctness: production keeps
serving the last healthy build throughout, and nothing about the running
system degrades. Half the pressure was self-inflicted and is fixed (see the
duplicate-deployer entry in doc 15); the rest is platform-side and cannot be
resolved from this repository.

**Reopen when** a deployment is needed urgently and the queue is the reason it
cannot happen — at which point the lever is build caching in the Dockerfile,
not the builder choice, because reverting the builder reopens Gate A.

## Obsolete

`PERIOD_FREQUENCY_DERIVATION_UNPROVEN` — **OBSOLETE**. It asked to prove that
Meta's period frequency equals stored impressions ÷ reach so the derivation
could be adopted. The standing invariant is now the opposite: frequency is
Meta's period value or UNKNOWN, *never* locally reconstructed. Confirming the
identity would not license deriving it, so there is nothing to reopen.

---

## Count

**8 open debt items**, all `NON_BLOCKING_DEBT`: D1–D8.
**3 reclassified upward and fixed** this cycle: R1, R2, R3.
**1 obsolete.**

```
KNOWN_P0_REMAINING               = 0
KNOWN_P1_SECURITY_REMAINING      = 0
KNOWN_P1_DATA_INTEGRITY_REMAINING = 0
```
