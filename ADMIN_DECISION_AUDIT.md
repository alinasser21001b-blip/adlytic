# ADMIN DECISION-QUALITY AUDIT

Adversarial audit of the Adlytic Operations Console. Baseline `f5119f8`.
Everything below was **measured by driving the shipped code**, not read off it.

Frozen and untouched throughout: Meta probe semantics, the candidate set, the
baseline ladder, the 40-call cap, Gate 1, attribution, measurement and
intelligence logic.

---

## 1. Baseline (Phase 0)

| item | value |
|---|---|
| HEAD at audit start | `f5119f8` |
| working tree | clean |
| admin page routes | 5 (`/admin`, `/admin/inbox`, `/admin/observability`, `/admin/meta-readiness`, `/admin/add-client`) |
| admin API endpoints | 38, every one behind `requirePlatformAdmin` |
| console tabs | 8 |
| scenario tests before audit | 11 passing |

### What the console CLAIMED at baseline

- six subsystem statuses
- an attention queue derived from facts
- per-workspace connection/data health on separate axes
- a probe surface with pre-flight context and per-code remediation

### What it explicitly did NOT know at baseline

- worker liveness of a **separate** service (reported `UNKNOWN`)
- intelligence runtime health (reported `NOT_TESTED`, no score invented)
- anything about real Meta capabilities (the probe has never been run)

---

## 2. Findings

Severity is by **decision damage**: would this make an administrator take a
wrong action, or fail to take a right one?

### CRITICAL-1 — the console died during the outage it reports on ❌→✅

`getAdminOpsSnapshot()` both **reports on** the database and **reads from**
it. With Postgres down, `prisma.workspace.findMany()` threw, the route
returned a generic 500, and the console rendered "تعذّر بناء لقطة التشغيل".

The operator opens this console **precisely because** something is broken,
and at that exact moment it lost the ability to say what.

*Proof*: `test_admin_adversarial.ts` A1 with a Prisma stand-in whose every
method throws. Before: `getAdminOpsSnapshot THREW`. After: snapshot returns,
`database = ERROR`, attention item raised.

*Fix*: a database failure short-circuits into a snapshot that still answers.
Every other subsystem degrades to `UNKNOWN` — **not** `HEALTHY` — because with
an unreadable database we have no evidence about them either. A green badge
resting on an unread query is the lie this console exists to forbid.

A second guard fell out of the fix: `tsc` proved the old
`if (dbStatus === 'ERROR')` attention branch unreachable, so it was deleted
rather than left as decorative dead code.

### CRITICAL-2 — the probe tally conflated AVAILABLE with POPULATED ❌→✅

`renderProbeTally` counted `r.verdict` alone. Two rows both reading
`AVAILABLE` — one that returned its field, one that returned nothing —
collapsed into **"AVAILABLE 2"**.

That is the probe's founding distinction, destroyed in the one place an
operator actually reads. The matrix preserved it in `evidence.present`; the
summary above it threw it away, and the summary is what gets believed.

*Proof*: `test_admin_scenarios.mjs` S4 now ships two AVAILABLE rows with
opposite `evidence.present`, and fails the build on `AVAILABLE 2`.

*Fix*: the tally splits into `AVAILABLE + عاد الحقل` and `AVAILABLE بلا حقل`,
with a standing note that the second **is not a proven capability**.

### HIGH-1 — the headline overclaimed health ❌→✅ *(fixed in `f5119f8`)*

With workers `UNKNOWN` and intelligence `NOT_TESTED`, the headline still read
"سليم". Root cause: one scalar cannot carry two claims. Fixed by splitting
`overall` (observed subsystems only) from `known[]`/`unknown[]`, with the
headline reading "يعمل — مع N مجهول" and a line **naming** the unobserved.

### MEDIUM-1 — attention items may carry no action *(NO_CHANGE, deliberate)*

Some items state what and why but offer no next step — e.g. a failed sync
whose error text is unrecognised.

**Not changed.** Manufacturing an action for a cause we have not diagnosed is
worse than admitting we have none. The brief says so explicitly: *"If there
is no actionable response, do not manufacture one."*

### MEDIUM-2 — capability matrix is still `<pre>` *(NO_CHANGE, deliberate)*

Agreed as debug-grade output. Designing a filterable table before seeing the
shape of a real probe result guarantees rewriting it. Deferred until after
the first real run.

### LOW-1 — no per-workspace intelligence column *(NO_CHANGE, deliberate)*

Would read `UNKNOWN` in every row today. A column that never varies is noise,
not information.

---

## 3. Four-state discipline (Phase 4) — verified

| must never imply | verified by |
|---|---|
| `UNKNOWN` = `ERROR` | A2 + distinct glyph/colour: `?` grey vs `✕` red |
| `NOT_TESTED` = `FAILED` | S5 — intelligence reads NOT_TESTED, generates no attention item |
| `AVAILABLE` = `POPULATED` | S4 — split enforced, build fails on conflation |
| no evidence = healthy | A3 — empty platform reports `NOT_TESTED`, not green |
| undetermined masks failure | A2 — `worstOf(['UNKNOWN','ERROR']) === 'ERROR'` |

Every one of the eight statuses carries a **glyph and an Arabic word** as well
as colour, asserted by `test_admin_pages.ts`. Colour is reinforcement, never
the signal.

---

## 4. Adversarial results

| # | scenario | outcome |
|---|---|---|
| 1 | everything healthy | ✅ explicit "nothing needs you now" |
| 2 | one stale workspace | ✅ WARNING, cause named |
| 3 | token expired | ✅ BLOCKED, distinct from stale |
| 4 | database unavailable | ✅ **after CRITICAL-1 fix** |
| 5 | worker unknown | ✅ UNKNOWN, no attention item |
| 6 | intelligence not tested | ✅ NOT_TESTED, no score |
| 7 | probe failed | ✅ code + remediation + "not a capability verdict" |
| 8 | probe mixed verdicts | ✅ **after CRITICAL-2 fix** |
| 9 | probe AVAILABLE but empty | ✅ counted separately |
| 10 | two simultaneous failures | ✅ each row names its own cause |
| 11 | no actionable issue | ✅ stated as a result, not blank |
| 12 | unknown with no remediation | ✅ no action invented |
| 13 | empty platform | ✅ NOT_TESTED, not healthy |
| 14 | secrets in DTO | ✅ only `hasToken` boolean |
| 15 | admin opens console mid-failure | ✅ **after CRITICAL-1 fix** |

Responsive at 390 / 430 / 768 / 1024 / 1440px: no horizontal scroll, no
overflow, navigation reachable at every width, tables become labelled cards
below 760px.

---

## 5. Remaining limitations — stated, not hidden

```text
✗ probe has never run against real Meta      → every capability claim is untested
✗ intelligence health                        → NOT_TESTED, no live check exists
✗ live job/queue view                        → BullMQ disabled by config
✗ account-scoped probe concurrency           → needs a server-side lease
✗ capability matrix as a table               → deferred until a real result exists
✗ competitor internal consoles               → NOT_OBSERVED, never invented
```
