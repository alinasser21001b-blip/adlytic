# 21 · Final convergence with main

What this pass did, and — more usefully — what it found.

---

## 1. The sync

The UI stabilization branch was three commits ahead of an older main and
twenty behind the current one. `origin/main` was merged **into** the branch.
Nothing was force-pushed, reset, or discarded.

| | |
|---|---|
| `PRE_SYNC_UI_HEAD` | `f3a7648` |
| `CURRENT_MAIN` at merge | `a566823` |
| `MAIN_COMMITS_INHERITED` | 20 |
| `TEXTUAL_CONFLICTS` | 0 |
| `SEMANTIC_CONFLICTS` | 1 |
| merge commit | `8214011` |

The single semantic conflict was in the Brain Observatory temporal block.
Main had renamed `temporal.legacyDataStatus` / `legacyDataBasis` to
`dataConfidence` / `dataConfidenceBasis`; the stabilization branch had
restructured the same file for composition reasons, so git merged the text
cleanly while leaving the branch reading fields that no longer exist. Resolved
by taking **main's** semantics inside the restructured file — the canonical
producer was not touched — and verified by reading the resolved file against
`src/services/brainObservatory.ts`.

---

## 2. Legacy transitions: none remain visible

The three routes an operator could still fall into (`/admin/observability`,
`/admin/classic`, `/admin/inbox`) took **option A — wrapped in the Control
Plane shell**. So did `/admin/os` and `/admin/meta-readiness`, which the
improved measurement caught still rendering their own product.

Nothing was deleted to make the route count prettier. What the wrap had
quietly cost is in §3.

```
TRANSITIONS_TESTED       19
BROKEN_TRANSITIONS        0
LEGACY_CHROME_EXPOSED    NO
VISIBLE_LEGACY_TRANSITIONS 0
LINKS_TO_HISTORICAL_ROUTES 3   ← deliberate in-page drill-downs, not leaks
```

A legacy surface has no sidebar entry of its own, which used to leave the
operator on `/admin/classic` with nothing highlighted. `navHighlightFor()`
now resolves a legacy surface to the domain that replaced it — read from
`ADMIN_LEGACY.replacedBy`, so retiring a route cannot leave a stale mapping.

---

## 3. What wrapping the legacy pages actually broke

This is the part worth reading. Wrapping a page in the shell means taking its
body and discarding its chrome. Five pages had **function** living outside the
body region, and every loss was silent:

| Page | Lost | How it presented |
|---|---|---|
| `adminConsolePage` | the customer detail drawer, the toast | clicking a customer threw |
| `adminConsolePage` | the eight-view switcher | seven of eight views unreachable |
| `adminInboxPage` | six status filters with live counts, the toast | no way to filter; `toast()` wrote to null |
| `adminOsPage` | the eleven-view switcher | ten of eleven views unreachable |
| `addClientPage` | the five-step phone flow | `mfRender()` painted into nothing |
| all five | a client-side access gate | **see below** |

The access gate is the instructive one. Each page carried its own copy, and
each copy reached for `.app` / `#access-gate` / `#admin-email` — chrome the
shell now owns. So every copy threw inside its own `try`, the `catch` read the
throw as "cannot verify access", and the page rendered an empty frame that
looked deliberate. That is why `/admin/classic` measured **18% content
occupancy**: not a layout problem, a page that had silently aborted its own
load.

Authorisation was never that gate's job. `adminPage()` resolves the session
server-side and redirects a non-admin to `/dashboard`, so the HTML only ever
reaches a platform admin. The gate is now **one** implementation in the shell,
covering every admin surface at once — and it holds on a network failure with
a retry rather than treating "cannot reach the server" as a demotion.

### The guard that makes this class impossible to repeat

`tools/admin-acceptance/bindings.mjs` reads every id a page's shipped script
addresses and resolves it against the rendered DOM. Ids the script itself
emits (drawers, modals, the phone flow) are excluded — derived from the script
text, not from a list someone maintains.

```
SURFACES_CHECKED             14
DANGLING_ID_BINDINGS          0
UNGUARDED_MISSING_SELECTORS   0
```

---

## 4. The Meta failure, rechecked after the sync

`tools/admin-acceptance/meta-truth.mjs` asks the question the composition
audit cannot: does the page **say** what the fixture says? Expectations are
read from the fixture, never restated, so a fixture edit changes what the
check demands.

```
SCENARIOS_CHECKED         16
USAGE_SHAPES_EXERCISED     4
META_COMPREHENSION_DEFECTS 0
```

It asserts, per scenario: the 15-day call count and the last-500 error rate
are both stated; no raw field name (`errorRateLast500`, `meetsErrorGate`,
`recentWindowSize`, …) is visible; both gate conditions carry a met/not-met
verdict **and the verdict agrees with the data**; a blocked account is named
and shown as blocked; and no serialized object literal appears outside
`<script>`.

One deliberate exemption: when the counter store is down every number reads
zero, and zero means *no measurement*, not *no errors*. The page is required
to withhold the verdicts there, so demanding them would be demanding a
fabrication.

The check initially reported the verdicts missing everywhere. That was the
check reading only the landing tab — `innerText` skips hidden subtrees, and
the quota detail lives behind a tab. It walks every tab now. A measurement gap
of exactly the kind that produced the original false green, found in the tool
built to prevent it.

---

## 5. Fixtures, again

`fixtures.ts` opens by arguing that fixtures must be typed against real
service types so drift becomes a compile error. It imported those types and
did exactly that — **and none of it was ever checked.** The root `tsconfig.json`
includes only `src/`, and the harness runs under `tsx`, which strips types
without checking them. The protection was described, not had.

`tsconfig.tools.json` (checks only; the emitting root config is untouched, so
the deployed artifact is byte-identical) found the drift immediately:

- `stats()` was `any`. Its `reach` used four field names the service does not
  have; the budgets were pre-formatted **strings** where the service returns
  numbers; `computedAt`, `fromCache` and `lookbackDays` were missing entirely.
  Rendered: four em-dashes under «الوصول», «ليس رقمًا IQD» in the money table,
  «آخر undefined أيام», «محسوبة منذ NaN ساعة».
- Tickets were flattened to `userEmail` / `workspaceName`; the service returns
  `user` and `workspace` **relations** plus `_count.messages`.
- Five endpoints returned bare arrays where the API returns a named envelope
  (`{customers,total,take,skip}`, `{subscriptions}`, `{events}`,
  `{settings,defaults}`, `{users}`), so every consuming page read
  `data.<key>` as `undefined` and rendered an empty table under a filled
  heading.
- Support counts were hand-written, which is how the inbox came to print
  "2 need a reply" above an empty list. They are derived from the ticket
  fixture now, with the rules `adminInboxCounts` applies.

None of these were page defects. All of them were objects written from memory,
in a file whose entire argument is that fixtures must not be.

**Correcting the fixtures exposed real page defects that had been masked:**
a raw `2026-12-31T00:00:00.000Z` in the subscriptions table (the old short
date happened to look acceptable), and the support workspace filtering on a
`PENDING` status the ticket enum does not have — an option that could never
match a row.

---

## 6. Screenshot gate

`npm run admin:shots` renders 10 surfaces × 3 widths × 2 directions = **60
images**, asserts nothing, and exists to be looked at. Everything this project
*can* assert is asserted elsewhere; what remains — does this read as one
product, is the Arabic set correctly, does the eye land on the work — is a
judgement, and pretending otherwise is how a gate goes green on a page nobody
opened.

What the eye caught that no assertion did:

- **Arabic node labels in the system graph were set in a monospace face.**
  Monospace pins every glyph to one advance width; Latin survives that,
  Arabic does not — the cursive joins stretch and «قاعدة البيانات» visibly
  comes apart. The rule the product already follows is *identifiers mono,
  prose in the body face*; the graph applied mono to both. Now derived from
  the label's own script. Guarded by a new audit check.
- Two duplicate drill-down controls, and one («الصفحة السابقة») named after
  its position rather than its destination.
- Raw enum members (`OPEN · URGENT`, `AWAITING_CUSTOMER`) shown to the
  operator on the support workspace.

```
SHOTS_CAPTURED     60
HORIZONTAL_SCROLL   0
```

---

## 7. Narrow widths

`/admin/os` held together down to 390px before it moved into the shell. A
248px rail in a fixed grid took that away — the page scrolled ~290px sideways
on a phone, and the topbar's 190px search button ran off the start edge in
RTL. Below 900px the rail now leaves the flow and slides over the content
behind a toggle; the topbar's title truncates and the search button keeps its
icon. Same markup, same nav.

```
390px  430px  768px  1024px  1440px   — all pass, zero horizontal scroll
```

---

## 8. Tests that existed and never ran

Five admin test files were on disk with no npm script, so `test:all` never
touched them: `test_admin_pages.ts`, `test_admin_console.ts`,
`test_admin_adversarial.ts`, `test_admin_clickthrough.mjs`,
`test_admin_viewports.mjs`. All five are registered and in `test:all` now.

Four needed updating for the shell, and in each case the *rule* was stale
while the *intent* was right:

- `#view-<id>` → `#v-<id>`, `.nav-item[data-tab]` → `.view-tab[data-view]`:
  the shell owns view switching.
- The "no page may become an island" check hardcoded three historical routes
  that the Control Plane deliberately dropped from the sidebar. It reads
  `ADMIN_IA` now, which is where the answer actually lives.
- Scenario D asserted a client-side reveal gate. Invariant 5 (a failed
  identity check must never demote an admin) is unchanged and still asserted;
  what changed is where the gate lives.

**Invariant 7 — a customer must never see admin chrome — was preserved, not
dropped.** The per-page reveal gates were replaced by one in the shell. That
is strictly stronger: it covers every admin surface instead of four, and it
cannot break the way the copies did.

---

## 9. Track A

`TRACK_A_FILES_TOUCHED = 0`. No deployment configuration, PeriodInsight
semantics, worker rollout, Railway gate, CI workflow, Brain decision logic,
build identity or deployment queue diagnostic was modified. No guard was
weakened to make an admin surface pass; where a guard and this work
disagreed, the guard won and the admin side changed.

| Guard | Result |
|---|---|
| `test:deploy-gate` | 54 passed |
| `test:period-rollout` | 11 passed |
| `test:period-metrics` | 18 passed |
| `test:brain-observatory` | 49 passed |
| `test:session-routing` | 36 passed |

---

## 10. The pattern, one more time

Every defect in this pass is the same shape as the original false green, and
it is worth naming plainly because it keeps recurring:

> **The verification described the system instead of deriving from it.**

A remembered payload shape. A hand-written attention list. A hand-kept
selector list. A viewport substituted for a container. A landing tab
substituted for a page. A hardcoded route list where an IA already existed. A
typed fixture that was never type-checked.

Each fix in this pass replaces a description with a derivation. That is the
only reason to expect the next one to hold.

---

## 11. Known and accepted

- `/admin/observability` and `/admin/meta-readiness` carry English body copy
  inside an Arabic shell. They are legacy detail surfaces preserved verbatim;
  translating them is content work beyond wrapping them in the shell, and
  doing it silently here would be over-design. Recorded rather than hidden.
- `LINKS_TO_HISTORICAL_ROUTES = 3` is the intended disposition, not a leak:
  each is an in-page drill-down from the domain that replaced it, and each
  arrives inside the same shell.
