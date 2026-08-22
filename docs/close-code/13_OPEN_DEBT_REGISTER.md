# 13 — Open debt register

Nothing here blocks closure. Each item names its owner, why it was not fixed,
and the exact trigger that reopens it.

---

## 1. `DTO_AUTHORITY_LABEL_OVERCLAIM` — *resolved this cycle*

Was: `applyCmoFeedAuthorityGuard` stamped `permitted: true` on ungoverned
codes. Now carries `authorityRelation`. **Closed.**

---

## 2. `RECOMMEND_TS_UNGOVERNED_ACTIONS`

**Class** UI/semantics · **Severity** low · **Owner**
`analytics/intelligence/recommend.ts`

Four of six templates emit codes outside `PERMIT_ACTION_DOMAIN`
(`FIX_MESSAGING_DESTINATION`, `FIX_LANDING_PAGE`, `FIX_CONVERSION_STEP`,
`REVIEW_BIDDING`), so the guard call at `recommend.ts:153` is vacuous for them.

**Why not fixed** Widening `permitAction` would be a new semantic claim about
which problem classes contradict which fixes, and that claim is not derivable
from the funnel today. `PROVEN_CONTRADICTIONS = 0`, so nothing is currently
mis-advised.

**Reopen when** a producer emits one of these four under a problem class the
funnel measured healthy, or a contradiction appears in the matrix in doc 03.

---

## 3. `ADMIN_CONSOLE_PAGE_MERGE`

**Class** UI consolidation · **Severity** low · **Owner**
`adminConsolePage.ts` / `adminOsPage.ts`

Two console pages remain. Both now render the same map, so no duplicate
*navigation* truth survives, but both still read `platform-stats`, `ops`,
`capability-probe` and `customers`.

**Why not fixed** `adminConsolePage` is a functional superset (settings,
subscriptions, payment events, overview). Redirecting `/admin/classic` would
remove operator capability; merging is a functional refactor deserving its own
review.

**Reopen when** the two pages disagree about a value, or `/admin` gains the
console's four exclusive APIs.

---

## 4. `ADMIN_SECURITY_AUDIT_SECTION_ABSENT`

**Class** future capability · **Severity** medium · **Owner** admin IA

The IA has no SECURITY & AUDIT section because no route serves
privileged-action history, deletion events or an audit trail.

**Why not fixed** Building an audit trail is a feature, and this is a closure
mission. Rendering the heading over settings and payment events would claim a
capability that does not exist.

**Reopen when** privileged actions are recorded anywhere queryable.

---

## 5. `NIXPACKS_BUILD_SECRET_PROPAGATION_RISK`

**Class** deployment/security · **Severity** medium · **Owner** Railway config

Railway injects all service variables into the build environment; Nixpacks'
generated Dockerfile emits `ENV` lines that BuildKit lints as
`SecretsUsedInArgOrEnv`, baking `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` into
image layers.

**Why not fixed** Platform-generated, not repository behaviour: no
`Dockerfile`, no `ARG`/`ENV` in `nixpacks.toml`, no build env in any railway
config, and both values are read at runtime only. No repository change would
fix it.

**Reopen** immediately — remediation is a Railway setting excluding those
variables from the build environment. Rotate both if image layers were ever
accessible outside the team.

---

## 6. `PERIOD_FREQUENCY_DERIVATION_UNPROVEN`

**Class** semantics · **Severity** low · **Owner** `services/periodInsights.ts`

Frequency is taken only as Meta reports it, never derived from the stored
period impressions ÷ reach, even though both sit in the same row from the same
request and Meta's definition is believed to be exactly that.

**Why not fixed** Proving the two coincide needs Meta's documentation, which
cannot be read from this environment. Both inputs are stored so the audit can
close it later.

**Reopen when** Meta's definition is confirmed from primary documentation.

---

## 7. `PERIOD_TRUTH_NOT_LIVE_VALIDATED`

**Class** behaviour · **Severity** high until validated · **Owner** deployment

Reach and frequency correctly report UNKNOWN until the migration is applied
**and a worker** has completed a sync pass. A validation-API deploy alone
cannot populate them.

**Reopen** at live validation — this is part of the single close blocker. Until
then, UNKNOWN is the correct live result and must not be read as a defect.
