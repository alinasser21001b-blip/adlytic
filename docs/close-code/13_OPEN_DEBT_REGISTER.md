# 13 — Open debt register

**Two categories, and the distinction matters.** Debt is what ships unfixed
with a named reopening trigger. A **gate** is what must pass before closure.
They were previously mixed, which is how this register could list a
secret-exposure risk while doc 15 declared `SECURITY_GAPS = 0`.

---

# Part 1 — Open close gates (NOT debt)

Four gates remain around one completed application-behaviour candidate. They
are **not four architectural defects**; the code is done. Full detail in
doc 15.

| Gate | Class | State |
|---|---|---|
| **A. NIXPACKS_SECRET_GATE** | deployment / security operational | OPEN — doc 07 |
| **B. PERIOD_TRUTH_LIVE_GATE** | data migration / live behaviour operational | OPEN — doc 07 |
| **C. CI_GATE** | **repository governance** | BLOCKED_BY_ABSENCE — doc 15 |
| **D. FINAL_HEALTH_BUILD_GATE** | deployment / live verification | OPEN — doc 15 |

Gate C is **inside the repository**, not an external operation: no workflow
exists that can execute the test suite for `src/**` changes. Closing it
requires one governance-only commit, which will change the final repository
candidate SHA without changing application behaviour.

---

# Part 2 — Open debt

Nothing in this part blocks closure. Each item names its owner, why it was not
fixed, and the exact trigger that reopens it.

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

## 5. `NIXPACKS_BUILD_SECRET_PROPAGATION_RISK` — **reclassified as GATE A**

Moved out of debt. It is a close gate, not something that ships unfixed. See
Part 1 and doc 07.

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

## 7. `PERIOD_TRUTH_NOT_LIVE_VALIDATED` — **reclassified as GATE B**

Moved out of debt. See Part 1 and the evidence ladder in doc 07.

---

## Debt count

**4 open debt items**: 2 (recommend.ts ungoverned actions), 3 (console page
merge), 4 (absent Security & Audit section), 6 (unproven frequency
derivation). Item 1 is closed; items 5 and 7 are gates.
