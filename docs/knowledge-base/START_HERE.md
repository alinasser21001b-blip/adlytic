# START HERE — the Dawai engineering brain

You are picking this project up with no prior context. Read this file completely
before you open an editor. It takes about fifteen minutes and it will save you
several days.

Everything in this knowledge base was written from the source, not from memory.
Every claim below names the file it came from, so you can verify any of it in
one `open`.

---

## 0. The single most important fact in this repository

**This git repository holds two unrelated products, and Dawai is the smaller
one by file count.**

| What | Where | Is it Dawai? |
|---|---|---|
| **Adlytic** — an ads-intelligence platform (Meta/Google ads analytics, Prisma, Railway) | repo root: `src/`, `prisma/`, `test_*.ts`, `runEngines.ts`, ~60 `*.command` scripts, `ADLYTIC_*.md`, `package.json` (`"name": "adlytic"`) | **No.** Different product, different customers, different stack. Ignore it. |
| **Dawai** — a medicine request/offer network for Iraq | `platform/`, `dawai-platform/`, `docs/product/`, `docs/technical/`, `docs/knowledge-base/`, `dawai-site/`, `hub/`, `qareeb-platform/` | Yes |

Do not "clean up" the root. `package.json` at the repo root belongs to Adlytic.
Dawai has its own `package.json` files inside `platform/` and `dawai-platform/`.

---

## 1. The second most important fact

**Dawai itself exists twice, and only one of the two is the current engineering
track.**

### `platform/` — the current track. This is what you work on.

A TypeScript monorepo (`npm workspaces`) built to a frozen specification called
**Blueprint v3**. Domain-first, with architecture rules enforced by nine
standalone checker scripts rather than by code review. The patient app's core
loop runs end to end in a browser.

Evidence that this is the live track, not a side experiment:

- The last ~15 commits before this knowledge base all touch `platform/apps/patient`
  (`git log --oneline`).
- The repository root `netlify.toml` sets `base = "platform"` and
  `command = "npm ci && npm run build:web"`. **The deployed URL serves this app.**
- `platform/netlify.toml` additionally assembles `/design/` and `/review/` beside it.

### `dawai-platform/` — an earlier, complete, differently-shaped implementation.

React 19 + Hono + PostgreSQL/PGlite, 7 SQL migrations, its own server, its own
client, e2e tests, a Dockerfile, `fly.toml` and `render.yaml`. It implements a
*different* model: email+password auth, `users` with `PATIENT/PHARMACY/ADMIN`
roles, `medicine_requests → pharmacy_offers → reservations`, plus a clinical
adherence module and a drug-interaction engine that **Blueprint v3 explicitly
does not have** (D16 removed interaction checking from Phase 0).

It is not dead code — it builds and deploys — but it is not what the current
work extends, and its entity names, auth model and clinical posture contradict
Blueprint v3 in ways that cannot be merged without a product decision. See
`19-open-decisions.md` §1.

**Working rule: build in `platform/`. Treat `dawai-platform/` as a reference
implementation and a source of ideas, never as the definition of the product.**

Everything else Dawai-shaped in the repo (`hub/`, `pharmacy/`, `qareeb-platform/`,
`dawai-developed.html`, `dawai-ui-preview.html`, `docs/product/v3/blueprint-v3.html`)
is prototype, spec or design artefact. `02-architecture.md` §6 maps every one of
them.

---

## 2. What Dawai is, in thirty seconds

A patient in Baghdad needs a medicine. Today they phone pharmacies one at a
time, or walk between them, because nobody — including the pharmacies — knows
what is in stock anywhere.

Dawai turns that into one action: the patient assembles a request, the platform
asks every eligible nearby pharmacy branch **simultaneously**, pharmacies answer
with structured offers (per line: available / unavailable / a substitute, with a
binding price), the patient compares and accepts one, the pharmacy confirms, a
hold starts with a pickup code, and the patient collects.

It is **not** delivery, payment, diagnosis, dosing, a pharmacy ERP, or a
prescription issuer. Nobody pays anything in Phase 0 or Phase 1 (**D43**).

Full detail: `00-project-overview.md`, `01-product-vision.md`.

---

## 3. How to run it

```bash
cd platform
npm ci                 # NOT npm install — see below
npm run dev            # → http://localhost:5173
```

That is the patient app in a browser, served against a development server that
answers the declared v1 API contracts **on the same origin**, so there is no
base URL to configure and no CORS to arrange.

The whole core loop works: search a medicine → build a request → sign in when
the guard asks → enter your name and district → send → watch pharmacies answer →
compare offers → consent to a substitution → reserve → read the pickup code.

**The SMS verification code is printed to the terminal running the server** —
`[dev] SMS to +9647…: your code is 123456`. It is never returned in a response,
because the contract does not carry it and returning it would be inventing a
response field.

`npm ci`, not `npm install`: the lockfile is the reproducible answer, and
`tools/deps-check.mjs` exists because a package that was installed but never
declared made every check pass on a machine where a clean clone would have failed.

### Checking it

```bash
npm run check      # 10 gates: trace, layers, ux, types, tests + 5 standalone checkers
npm run review     # 22 gates, regenerates review/index.html (needs a browser)
npm run design     # regenerates the six derived design documents
npx playwright install chromium   # once, before `npm run review`
```

### Walking it

```bash
node tools/devserver/smoke.mjs          # the whole loop, screen by screen
node tools/devserver/smoke-offline.mjs  # the failure states — offline, wrong code, queued send
```

Neither is a gate. They print what a patient would see and any error the page
raised. **Every defect found in the running app so far was found by pressing a
button rather than by reading.** Do this before you claim something works.

### The other track, if you need it

```bash
cd dawai-platform && npm ci && npm run dev   # API :8787, web :5173, PGlite embedded
```

---

## 4. How the architecture works

Five ideas, in dependency order. Full detail in `02-architecture.md`.

1. **The domain is pure and holds every business rule.**
   `platform/packages/domain` imports no Node built-in, performs no I/O, reads
   no clock and generates no randomness. `tools/layer-check.mjs` fails the build
   if it does. Consequence: every rule is deterministic and testable in
   milliseconds with no infrastructure.

2. **A state machine *is* its transition table.**
   `defineMachine({ transitions: [...] })` in `packages/domain/src/shared/machine.ts`.
   `transition()` is the only way to move. A transition the Blueprint does not
   contain is **unrepresentable**, not merely forbidden. Eight machines are
   declared this way (`05-state-machines.md`).

3. **The client decides nothing.**
   Route guards exist so a user is not shown a door that will be slammed. The
   server refuses regardless. `packages/navigation/src/guards.ts` says this in
   its own docblock, and the reducer re-runs the guard *at the action*, not only
   at the door (`store.ts` → `doSend`).

4. **A screen is a contract before it is a component.**
   `packages/design/src/ux/contract.ts` makes "where am I / what do I do next /
   how do I go back" a **type**. A screen with no purpose, no title, two primary
   actions, an error state that says "something went wrong", or an empty state
   with nothing to do **does not compile past `tools/ux-check.mjs`**.

5. **The store is a pure reducer that returns state *and* effects.**
   `apps/patient/src/app/store.ts` — `dispatch(state, intent, env, authority)`
   returns `{ state, effects }` and performs nothing. `infra/perform.ts` is the
   only place I/O happens, and it answers back in intents. So the round trip is
   **store → effect → port → intent → store**, and "the user tapped send while
   offline" is a unit test rather than a manual check on a phone in aeroplane mode.

### The layer stack

```
apps/patient/web/         host — the only place that touches browser globals
apps/patient/src/main/    composition root — the only place that reads a clock
apps/patient/src/infra/   ports over HTTP; the outbox flusher; the effect runner
apps/patient/src/app/     the pure reducer
apps/patient/src/model/   presentation models — ask the domain, never decide
apps/patient/src/screens/ contracts + components
packages/*                domain, design, navigation, session, offline, net,
                          observability, config, contracts
```

Dependencies point **inward and downward only**. `tools/layer-check.mjs`
enforces it, `tools/deps-check.mjs` proves a clean clone builds.

---

## 5. Where decisions live

There are exactly four authorities. Learn to reach for them in this order.

| Authority | Location | What it settles |
|---|---|---|
| **Blueprint v3** (frozen) | `docs/product/v3/blueprint-v3.html`, machine-readable in `docs/product/v3/phase0.js` (133 screens) and `register.js` (43 decisions D01–D43) | What the product *is*. Screens, states, decisions, quantities. |
| **Technical model** (frozen) | `docs/technical/*.html`, machine-readable in `docs/technical/model.js` | 12 services, 21 entities, 54 events, 67 endpoints, 22 tables, 11 known gaps. |
| **The code's own docblocks** | every `.ts` file in `platform/` | `@blueprint` (why it is allowed to exist), `@owner` (who owns it), `@why` (why it exists at all). Enforced by `tools/trace-check.mjs`. |
| **The debt register** | `platform/tools/review/debt.mjs` | Everything known to be missing, wrong or blocked, with impact and owner. |

`tools/trace-check.mjs` loads `register.js`, `phase0.js` and `model.js` and
**refuses to build** if a `@blueprint` reference does not resolve against one of
them. Traceability here is not a comment convention; it is a link check.

---

## 6. What must never be changed

These are not style preferences. Each one has a defect behind it.

1. **Never put a business rule outside `packages/domain`.** Not in a screen, not
   in a hook, not in a controller. `tools/layer-check.mjs` will reject it, and
   the reason it will reject it is that a rule in a component cannot be tested
   and cannot be found.

2. **Never write a state transition as an assignment.** Go through
   `transition(Machine, from, event)`. `store.ts` does this even when the server
   already decided the outcome — the server picks the *edge*, but only edges the
   machine contains exist.

3. **Never let the domain read a clock, a random source, or the network.** Time
   is an `Instant` parameter (`shared/instant.ts`); randomness is a `() => number`
   parameter (`net/delayFor`). This is what makes every rule deterministic.

4. **Never return `SAFE`, `CLEAR` or `no interactions found` from anything
   clinical.** `Clinical.GateOutcome` is `"ALLOWED" | "REFUSED"` and there is no
   third value, deliberately (`packages/domain/src/clinical/gates.ts`). Phase 0
   performs **no** automated clinical checking (**D16**), and a partial check a
   user believes is complete is more dangerous than a stated absence.

5. **Never present a queued request as sent** (**D27**). `@dawai/offline`'s
   `describe()` is the only function a screen may use to word an outbox item,
   so no screen can invent a friendlier word for "not yet sent".

6. **Never start a reservation countdown before the pharmacy confirms.** The
   `Reservation` machine's clock starts at `held`, never at `requested`. A
   countdown before anyone has committed stock counts down to a disappointment.

7. **Never rank, weight or paid-place a pharmacy** (**D12**). `Offers.forReading`
   sorts by coverage then price — both printed on every row, so a patient can
   check the order themselves — and it is named `forReading`, not `rank`.

8. **Never invent a quantity the Blueprint has not fixed.** The whole reason
   `marketplace/rules.ts` exists is that v1 settled principles and left every
   load-bearing number undefined. If you need a number and no decision supplies
   one, register it as debt (see TD-16) rather than choosing one.

9. **Never make a refusal distinguishable from a not-found.**
   `NOT_FOUND_OR_NOT_YOURS` is one refusal for both cases (§5 rule 3) — v1's
   family endpoint became an identity oracle by returning 403 where it should
   have returned 404.

10. **Never remove an item from the debt register by deleting it.** It leaves by
    being fixed, and it stays in `RESOLVED` with how it was resolved.

---

## 7. How to build a new feature

The order matters and it is not the obvious one.

1. **Find the Blueprint reference first.** A screen id (`R9`), a decision
   (`D19`), an endpoint (`POST /v1/offers/{id}/accept`), an entity, an event.
   If there is no reference, you are inventing product — stop and register the
   gap instead (`19-open-decisions.md` explains how the eleven existing BD-*
   gaps were recorded).

2. **Write the rule in `packages/domain` first**, as a pure function returning
   `Result<T, Refusal>`. Add its test beside it. It runs in milliseconds because
   it needs no infrastructure — that is Rule 7 paying off.

3. **If it has states, declare the machine** in the relevant `machines.ts`, with
   a `bp` reference on *every edge*, and run `audit()` on it in a test.

4. **Write the screen contract before the component**, in
   `apps/patient/src/screens/core-loop.contract.ts`. `tools/ux-check.mjs` will
   check it against the Blueprint's declared states for that screen.

5. **Add the port type in `ports.ts`**, naming the declared endpoint and each
   declared response as its own variant. Never add a response the contract does
   not list.

6. **Add the intent and the effect to the store.** The reducer decides; it never
   performs. Then add the runner branch in `infra/perform.ts` — the `never`
   exhaustiveness check at the bottom makes a missing runner a compile error.

7. **Add the adapter in `infra/`**, with a type guard over the response body.
   Every adapter in this codebase validates the bytes before they reach a rule —
   `infra/catalogue.ts` explains at length why (a hit missing `isControlled` was
   gated ALLOWED, so D42 never fired for a controlled medicine).

8. **Run `npm run check`, then walk it** with `node tools/devserver/smoke.mjs`
   or in a browser. Reading is not walking.

9. **Register what you could not finish** in `tools/review/debt.mjs`, with an
   impact and an owner. `tools/debt-check.mjs` verifies every `TD-n` cited in
   source resolves to exactly one register entry.

---

## 8. Common mistakes, all of which have already happened here

Each of these was a real defect in this repository. They are listed because the
next person will reach for the same shortcut.

| Mistake | What it cost | Where it is written up |
|---|---|---|
| Building a second copy of a runner "temporarily" | `App.tsx` had its own effect runner that never handled `requestCode`/`verifyCode` — a patient submitting a phone number emitted an effect that fell on the floor | `infra/perform.ts` bottom comment |
| Trusting a response body without a type guard | A catalogue row missing `isControlled` was gated ALLOWED, so D42 never refused a controlled medicine | `infra/catalogue.ts` `isHit` |
| Defaulting a missing field to a "safe" value | A 400 without `attemptsLeft` defaulted to `0`, which the reducer reads as *exhausted* — a patient's first wrong digit told them all five attempts were gone | `infra/identity.ts` 400 branch |
| Letting a screen mean "has a contract" by "is built" | R1's «لمن؟» rendered, was tapped, navigated successfully and drew the **search** screen over the request the patient had just built | TD-19, `screens/graph.ts` `isBuilt` |
| Treating a 409 as an error | A duplicate *is* success — the earlier attempt landed. Treating it as failure tells a patient their sent request failed | `@dawai/net` `classify`, `@dawai/offline` `markDuplicate` |
| Pushing effects from inside a `setState` updater | React re-invokes updaters (twice under StrictMode) — two verification SMS per tap, and the outbox flushed twice concurrently | `App.tsx` `usePatientApp` |
| Reading `env.now()` during render and never re-rendering | Every clock on screen froze. A six-minute hold still read «٦ دقائق» after two minutes | `App.tsx` `ticks` |
| Assuming English plural rules in Arabic | «آخر تحديث قبل ١ دقائق» ("1 minutes ago") and «باقيلك ٢ محاولات» where Arabic needs the dual | `packages/design/src/arabic.ts` |
| Reading a UTC hour and calling it local | A hold expiring at 7pm in Baghdad printed as «٤:٠٠ م» — three hours early, on the line that says when the medicine stops being held | `model/reservation.ts` `clockTime` |
| Polling until every branch answers | A branch that never answers is *ordinary*, so `thinking` never reached zero — a request every three seconds for up to two days | `main/runtime.ts` `watch` |
| Working from a private snapshot of shared state | The flusher re-read its own copy, so a cancel on R13 mid-flush sent anyway | `infra/flush.ts` `merge` |
| "Fixing" a contradiction by walking around a guard | TD-24: `addItem` calls `navigate` instead of `open`, so R1's guards never run — and that bypass is the only reason the product works end to end | TD-24 |

---

## 9. What is not here

Be precise about this when you report status. From `platform/README.md` and the
debt register:

- **No backend.** `tools/devserver` speaks the declared contracts and invents
  **data** (nine catalogue rows, three Karrada pharmacies), never **behaviour**.
  No session token is stored or refreshed. (TD-1)
- **No device build.** The browser host runs through `react-native-web`, which
  is *not* React Native. Native gestures, platform chrome, safe-area insets and
  keyboard avoidance are unverified. (TD-1, TD-2)
- **No push notifications.** Offers reach the patient by polling
  `GET /v1/requests/{id}` every three seconds. (TD-21)
- **No pharmacy app and no owner console.** Blocked on Stages 2/3/5.
- **Four contracted screens have no component** — R4, R5, R11, R13 — and S1 has
  a stand-in. Nothing renders a control that leads to one.
- **Light mode is not designed.** The patient palette is dark-only; `patientLight`
  is an alias of `patientDark` so nothing renders half-designed. (TD-10)

Full accounting: `17-known-limitations.md` and `18-technical-debt.md`.

---

## 10. Current priorities

Ordered, with the reasoning in `20-next-priorities.md`.

1. **Resolve the two-track question** (`platform/` vs `dawai-platform/`). It is
   a product decision, it blocks any convergence work, and every week it stays
   open the two diverge further.
2. **Unblock the four frozen-document contradictions**: TD-20 (R7's cancel — the
   API and the §6 machine disagree), TD-24 (R1's guards vs §3.1), TD-23 (R7 never
   ends because R11 is undesigned), TD-25 (E8 has no failure sentence). None can
   be fixed in code; each needs one of two frozen documents to move.
3. **Build a real backend** for `platform/` — or adopt `dawai-platform`'s. TD-1
   is the root of TD-6, TD-8, TD-14 and TD-21.
4. **Design the missing screens**: S1, R4, R5, R11, R13, and the light palette.
5. **Answer the accessibility content question** (TD-12) — composite cards
   announce only their label, so a screen-reader user chooses a pharmacy without
   hearing the price, coverage or substitution flag.

---

## 11. Reading order for the rest of this knowledge base

| Read | When |
|---|---|
| `00-project-overview.md`, `01-product-vision.md` | Now — what and why |
| `02-architecture.md` | Before your first change |
| `04-business-rules.md`, `05-state-machines.md` | Before touching the domain |
| `07-screen-catalog.md`, `08-navigation.md`, `12-design-system.md` | Before touching a screen |
| `11-runtime.md` | Before touching startup, ports or the outbox |
| `13-api-contracts.md`, `15-events.md`, `14-data-model.md` | Before touching a boundary |
| `03-domain-model.md`, `09-permissions.md`, `10-clinical-safety.md` | Before touching identity or anything clinical |
| `16-testing.md` | Before adding a test, and before trusting one |
| `17-known-limitations.md`, `18-technical-debt.md`, `19-open-decisions.md` | Before promising anything to anyone |
| `20-next-priorities.md` | When you have finished what you were doing |
| `SYSTEM_MAP.html` | Any time you need to see how a piece connects — open it in a browser |

---

## 12. How to contribute

- Branch, commit with a message that says what changed *and why the previous
  behaviour was wrong*. The existing history does this
  (`patient: a withdrawn offer is shown as unavailable, not deleted`) and it is
  the reason this knowledge base could be written at all.
- `npm run check` must pass. It is ten gates and it runs in seconds.
- If you touch a screen, run `npm run review` and look at the diff in
  `review/index.html`. `tools/review/regress.mjs` compares against
  `review/.baseline.json` — an unexplained pixel change is a finding.
- If you could not finish, register the debt. An unregistered gap is a gap the
  next person discovers by shipping it.
- Update this knowledge base in the same commit. It is the deliverable, not the
  paperwork.
