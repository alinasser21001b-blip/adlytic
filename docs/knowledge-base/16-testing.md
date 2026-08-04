# 16 — Testing and quality gates

Testing philosophy, the test hierarchy, the validators, CI, quality gates,
architecture rules and traceability.

---

## 1. Philosophy

Four statements, each with a structural consequence.

### 1.1 A rule that lives only in a review checklist is a rule that survives until the first deadline.

So every architecture rule is a **script that fails the build**, not a convention.
There are nine of them, plus five more gates.

### 1.2 A guard that has never rejected anything is untested.

`.github/workflows/platform.yml` writes deliberately-violating probe files and
**asserts each gate rejects them.** A checker with no negative test is a checker
nobody has proven works.

### 1.3 The domain is pure, so every rule is testable with no infrastructure.

`vitest.config.ts`:

> The domain is pure, so its tests need no environment, no server and no
> database. **That is the point of Rule 3, and it is why these run in
> milliseconds and can be trusted in a pre-commit hook.**

### 1.4 Reading is not walking.

`platform/README.md`, about the two smoke scripts:

> Neither is a gate. They print what a patient would see and any error the page
> raised, **because every defect found in the running app so far was found by
> pressing a button rather than by reading.**

That sentence is the most important line in this document. The composition-root
defect (TD-1), the E4 navigation defect (TD-19), the frozen-clock defect, the
never-settling camera promise and the deployed-404 were **all** found by opening
the app, and **none** by a passing test suite.

---

## 2. The test hierarchy

| Level | What it proves | Where | Infra |
|---|---|---|---|
| **Unit** | One rule, one quantity | `packages/*/src/**/*.test.ts` | none |
| **State machine** | Reachability, exits, determinism, per-edge Blueprint refs | `audit()` in machine tests | none |
| **Contract** | A screen contract satisfies every UX rule and matches the Blueprint | `auditContract` + `tools/ux-check.mjs` | none |
| **Navigation** | No unreachable screen, no trap, no dangling exit, no flow gap | `screens/navigation.test.ts` | none |
| **Accessibility** | 84 contrast pairs × 3 personas × 2 schemes, plus extras | `packages/design/src/a11y.test.ts` | none |
| **Reducer** | Every intent, every effect, every guard path | `app/store.test.ts` | none |
| **Journey** | Whole flows through the real reducer | `app/journey.test.tsx` | none |
| **Effects** | Effect → port → intent round trips | `app/effects.test.tsx` | fakes |
| **Infrastructure** | Adapters, type guards, the flusher, backoff | `infra/infra.test.ts` and siblings | fake `fetch` |
| **Render** | Real component trees, states and product rules | `screens/*.test.tsx` | `react-test-double` |
| **Composition** | The runtime assembles and starts | `main/runtime.test.tsx` | fake `Host` |
| **Visual regression** | Every screen in every state, against a baseline | `npm run review` | **a real browser** |
| **Walk** | The loop, pressed by a script | `tools/devserver/smoke*.mjs` | dev server |

### The React Native test double

`react-native` is aliased to `tools/rn-test-double.tsx`:

> React Native's entry point is Flow-typed source only Metro parses. The double
> maps each primitive onto a host element of the same name and passes every prop
> through, **so a rendered tree still carries the real accessibility roles,
> labels and handlers.**

That last clause is what makes the render tests meaningful rather than
decorative — they can assert on what a screen reader would receive.

---

## 3. The declared test model

`docs/technical/model.js` `TECH.tests` declares the assertions the system owes,
independently of whether they are written yet. Selected rows, quoted:

**Unit**
- Request window — *"now→20m, today→4h, soon→48h. **No other value is
  producible.**"*
- Quantity unit — *"Every quantity in every payload is a pack count; **no other
  unit can be expressed**."*
- Honoured rate — *"Refusal at **4m59s** does not count; at **5m01s** it does.
  Hidden below 10 reservations. **Never returns a decimal to a patient.**"*
- Line limit — *"9 lines is refused; 8 is accepted; 0 is refused."*
- Watch limits — *"6th active watch is refused; expiry is exactly 14 days."*
- Arabic normalisation — *"Alef variants, taa marbuta, tatweel, harakat and
  Arabic-Indic digits all fold. **Case folding is a no-op and is not applied.**"*
- Server clock — *"**Changing the device clock does not change a countdown.**"*

**State machine**
- Request — *"Every state reachable; every state has an exit; **no transition
  outside the diagram**."*
- Offer — *"**Withdrawal impossible after acceptance**; accepted is terminal."*
- Reservation — *"`expires_at` is unset until held; **refused always re-opens the
  parent**; collected writes exactly one dispense record."*
- Subject — *"Claim ends guardianship; memorialisation reverses within 30 days
  **and not at 30 days plus one second**."*
- Grant — *"invited grants nothing; expiry at 7 days; revoked preserves the row."*
- Verification — *"**lapsed stops routing and does not cancel a live
  reservation**."*
- Branch eligibility — *"**Every non-receiving state exposes a reason.**"*
- Outbox — *"**Duplicate resolves to Accepted, never to an error.**"*

**Permission**
- Clinical read — *"Every cell in the matrix is exercised, positive and negative.
  **A pharmacist reading a dispense history fails.**"*
- Substitution — *"An assistant proposing a substitute is refused; **a pharmacist
  with an unverified licence is refused**."*
- Confirmation — *"An assistant confirming a reservation **SUCCEEDS — this is the
  row v1 got wrong**."*
- Identity leak — *"**No branch-facing response body contains a patient name or
  phone, at any endpoint, in any state.**"*
- Oracle — *"A request for another account's subject returns **byte-identical**
  output to a request for a subject that does not exist."*

Those five permission rows are the ones to write first when a server exists.

---

## 4. The gates

### `npm run check` — ten gates, seconds to run

```
npm run trace   → tools/trace-check.mjs
npm run layers  → tools/layer-check.mjs
npm run ux      → tools/ux-check.mjs
npm run types   → tsc -b
npm run test    → vitest run
                  node tools/test-reach-check.mjs
                  node tools/docs-check.mjs
                  node tools/debt-check.mjs
                  node tools/strict-check.mjs
                  node tools/deps-check.mjs
```

| Gate | Enforces | Fails when |
|---|---|---|
| **trace** | Rules 1 & 2 | A module exports without a docblock; a `@blueprint` reference does not **resolve** against `register.js` / `phase0.js` / `model.js`; `@owner` names a non-service; a domain concept is owned twice |
| **layers** | Rules 3 & 4 + build hygiene | The domain touches Node, `fetch`, a clock, randomness, timers, `console`, `process.env` or a browser global; the design system imports the domain; an app imports something outside its allowed set; an emitted `.js` sits beside its `.ts` |
| **ux** | The UX rules | A contract names a screen the Blueprint does not contain; drops a state the Blueprint declares; exits nowhere; violates any `auditContract` rule |
| **types** | 12 strict flags | Any type error |
| **test** | Everything above as assertions | Any failure |
| **test-reach** | Rule 8 | A test file outside the runner's reach — *a suite that passes by not existing* |
| **docs** | Generated-artefact integrity | `undefined`, `NaN` or `[object Object]` in a shipped document |
| **debt** | Debt hygiene | A `TD-n` cited in source that does not resolve to exactly one register entry; an unnamed inert control |
| **strict** | Compiler hygiene | A project not extending the base tsconfig, or a weakened flag |
| **deps** | Clean-clone reproducibility | A script binary or build alias that does not resolve to a **declared** dependency |

**Why `deps-check` exists:** *a package that was installed but never declared made
every check here pass on a machine where a clean clone would have failed.* That
is also why the instruction is `npm ci`, not `npm install`.

**Why `docs-check` exists:** a generated document that prints a hole is a
document that has silently stopped being generated correctly, and nobody notices
because it still renders.

### `npm run review` — 22 gates, needs a browser

```
review:render  → renders every screen state through the real component tree
review:data    → regenerates review/data.json
shoot.mjs      → screenshots
responsive.mjs → 320 / 360 / 390 / 430 px
regress.mjs    → diff against review/.baseline.json
manifest.mjs   → screens.sha256
build.mjs      → review/index.html
```

Regression output is explicit — `added` / `removed` / `changed` / `unchanged`.
**An unexplained pixel change is a finding**, not noise.

### `npm run design` — six derived documents

Regenerates the design package from tokens and contracts. **Do not hand-edit the
outputs**; `docs-check` will notice, and the next run will overwrite you.

---

## 5. CI

### `.github/workflows/platform.yml`

Triggers on `platform/**`, `docs/product/v3/**`, `docs/technical/**`.

**Job 1 — one step, deliberately:**

> This job used to hand-enumerate the gates — trace, layers, ux, types, test —
> and `npm run check` grew a sixth (test-reach) that nobody added here, **so a
> gate that passes locally never ran on a pull request.** A list maintained in
> two places drifts; this one cannot, because **there is only one list now and
> package.json owns it.**

**Job 2 — the negative tests.** Probe files are written into
`packages/domain/src/_probe/` and each gate **must** reject them:

| Probe | Must be rejected by |
|---|---|
| A module with no docblock | `trace` (Rule 1) |
| An unresolvable `@blueprint` reference | `trace` (Rule 1) |
| Duplicated ownership of a concept | `trace` (Rule 2) |
| `Date.now()` in the domain | `layers` (Rule 3, determinism) |
| `import from "node:fs"` in the domain | `layers` (Rule 3) |

A `trap cleanup EXIT` removes the probes whatever happens.

### `.github/workflows/technical-architecture.yml`

Runs `node docs/technical/validate.mjs` — **11 architecture checks (V1–V11)**
over the frozen model. All 11 must pass.

### `.github/workflows/release-governance.yml`

Validates `release-manifest.yaml`, the single source of truth for release
identity, compatibility, governance policy, approved runtime configuration,
verification status and artifact paths.

> **Every number that appears in a changelog, release note, compatibility report
> or dashboard is read from it. Nothing is written twice.**

---

## 6. The full release pipeline

Ten stages, from `docs/technical/model.js` `TECH.release`:

| # | Stage | Gate |
|---|---|---|
| 1 | Commit | Lint, typecheck, unit and state-machine tests — **any failure stops here** |
| 2 | Contract | Contract tests against the model — **an undeclared response field fails the build** |
| 3 | Architecture | `docs/technical/validate.mjs` — **all 11 checks must pass** |
| 4 | Product | Blueprint self-checks: issue ownership, decision completeness, screen completeness — **any open item fails** |
| 5 | Integration | **Every permission-matrix cell exercised, positive and negative** |
| 6 | Release gate | Ten validators; **the report lists every registered validator even with no findings** |
| 7 | **Negative gate** | **Known-bad manifests must be REJECTED** — *a gate that has never failed is untested* |
| 8 | Generate | `--check` proves **no generated file was hand-edited** |
| 9 | E2E | Device matrix across the twelve journeys — **every journey closes** |
| 10 | Publish | Stamp the configuration hash, tag — **status may become `released` only when every gate above passed** |

Artifact rule worth noting: *"Patient app bundle — contains no pharmacy or
operator route; **role isolation is verified by an import check**."* Same check,
inverted, for the pharmacy bundle.

---

## 7. Traceability

Traceability here is a **link check**, not a comment convention.

```
@blueprint  one or more references that RESOLVE against the frozen documents
@owner      the single owning service from the technical model
@why        one sentence: why this module exists
```

`tools/trace-check.mjs` loads `register.js`, `phase0.js` and `model.js` at build
time and builds the set of valid references:

```
D01…D43            decision register
E1…O24             133 screen ids
Account…AuditEntry 21 entity ids
identity-service…  12 service ids
account.created…   54 event names
accounts…          22 table names
"POST /v1/requests"…  67 endpoints (method + path)
V1…V11             validation checks
BD-1…BD-11         declared gaps
§1…§10             Blueprint sections
```

> **A reference that does not resolve is not traceability — it is a comment that
> looks like traceability, which is worse than none.**

Rule 2 is enforced through `@implements <concept>`: a domain concept may be
claimed by exactly one module, so two modules cannot both own `marketplace/rules`.

**Practical consequence for you:** you cannot add a file to `platform/packages/`
without deciding what Blueprint element justifies it and which service owns it.
That is the point.

---

## 8. Coverage and honesty about it

`vitest.config.ts` collects coverage over `packages/*/src/**/*.ts` and
`apps/*/src/**/*.ts`, excluding tests. **No threshold is enforced**, and no
coverage number is claimed anywhere in this repository — deliberately, because a
coverage percentage is exactly the kind of number that gets optimised instead of
the thing it measures.

What *is* claimed, and is true:

- **The domain is fully testable with no infrastructure.**
- **Every state machine is structurally audited** by `audit()`.
- **Every contracted screen is rendered in every declared state** and photographed.
- **Every gate has a negative test** for at least one violation class.

What is **not** verified, and the register says so:

| Not verified | Debt |
|---|---|
| Native gestures, platform chrome, safe-area insets, keyboard avoidance, animation | **TD-2** — screenshots are DOM renders, not device captures |
| Startup, render, navigation latency, memory, bundle size | **TD-7** — the dashboard reports these as **NOT VERIFIED** rather than green. *Module count and source size are now measured; runtime metrics remain unverifiable without a device build* |
| Real latency, pagination, token refresh, TLS, **server-side authorization** | **TD-1** — nothing behind the port is real |
| The cached-countdown path under real cache eviction | **TD-6** |
| The Iraqi-dialect plural forms | **TD-22** — needs a native reader |
| A light-scheme contrast regression | **TD-10** — `patientLight` aliases `patientDark`, so the gate cannot see it |

---

## 9. Writing a test here

1. **Domain rule** → beside the module, pure, no environment. Assert the
   `Refusal` **code**, never a message.
2. **State machine** → call `audit()` and assert it returns `[]`. Then assert the
   specific edges that carry a product decision, by name.
3. **Time** → pass an `Instant`. **Never** `Date.now()`. `fixedClock(at)` exists
   for this.
4. **Randomness** → pass `() => 0.5`. `delayFor` takes `random` as a parameter
   for exactly this reason.
5. **Screen contract** → `auditContract(c)` returns `[]`; then assert the
   Blueprint-declared states are covered.
6. **Reducer** → build a state, dispatch an intent, assert **both** the next
   state **and the effects**. The effects are half the behaviour.
7. **Adapter** → feed a malformed body and assert the **guard drops it**. Every
   guard in `infra/` exists because a malformed body once reached a rule.
8. **Screen** → render through the double and assert on **accessibility roles and
   labels**, not on markup.
9. **Then walk it.** `node tools/devserver/smoke.mjs`.

### The two invariants a new test must not break

- **It must be reachable.** `tools/test-reach-check.mjs` fails a suite outside
  `packages/*/src/**/*.test.ts` or `apps/*/src/**/*.test.{ts,tsx}`.
- **It must not need infrastructure to test a rule.** If it does, the rule is in
  the wrong layer.
