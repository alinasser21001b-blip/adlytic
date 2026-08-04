# Dawai Platform

Production build of the Dawai healthcare platform.

**The Blueprint defines what the product is. The Technical Architecture defines
how it is built. This source code is an executable representation of those two
documents.** If implementation and architecture disagree, implementation is
wrong until an approved Blueprint revision says otherwise.

| Authority | Location | Status |
|---|---|---|
| Product | [`docs/product/v3/blueprint-v3.html`](../docs/product/v3/blueprint-v3.html) | **Frozen** |
| Technical | [`docs/technical/`](../docs/technical/index.html) | **Frozen** |

## Rules enforced by tooling, not by review

| Rule | Enforced by |
|---|---|
| 1 · Every module traces to Blueprint v3 | `tools/trace-check.mjs` — every exported module needs `@blueprint`, and the reference must resolve |
| 2 · Exactly one owner per module | `tools/trace-check.mjs` — every module needs `@owner`, and a domain concept may be owned once |
| 3 · No business logic outside the domain | `tools/layer-check.mjs` — nothing above the domain may import a rule, and the domain may import no I/O |
| 5 · No undocumented state transitions | Every machine is a declared transition table; a transition absent from it is unrepresentable |
| 7 · Every feature independently testable | The domain is pure, so every rule is testable with no infrastructure |
| UX · A screen answers where am I, what next, how back | `tools/ux-check.mjs` + `auditContract` — a contract must name a real Blueprint screen, cover every state the Blueprint declares for it, and leave no dead end |
| UX · Contrast is measured, never eyeballed | `a11y.test.ts` measures all 84 renderable pairs across 3 personas × 2 schemes |
| UX · No dead ends, no orphans, predictable back | `@dawai/navigation` derives the graph from the contracts; `unreachable`, `traps` and `danglingExits` are graph properties a test checks |
| UX · Where am I, what came before, what next, how far | `progressAt` derives all four from a declared flow, so no screen hard-codes an answer |
| Build hygiene · no stale build beside a source | `tools/layer-check.mjs` — an emitted `.js` next to its `.ts` resolves first and makes every test run against the previous build |
| Every test file is actually RUN | `tools/test-reach-check.mjs` — a suite outside the runner's reach is a suite that passes by not existing |
| No generated document prints a hole | `tools/docs-check.mjs` — `undefined`, `NaN` and `[object Object]` in a shipped artefact |
| Debt is registered, and its ids resolve | `tools/debt-check.mjs` — every `TD-n` referenced in source lands on exactly one register entry, and every inert control is named |
| No compiler flag is weakened anywhere | `tools/strict-check.mjs` — every project extends the base tsconfig, and 12 required flags stay on |
| A clean clone builds | `tools/deps-check.mjs` — every script binary and every build alias resolves to a DECLARED dependency |

## Run it

```bash
npm ci
npm run dev        # → http://localhost:5173
```

That is the patient app, in a browser, against a development server that
answers the declared v1 contracts on the same origin — so there is no base URL
to configure and no CORS to arrange. The whole core loop works: search a
medicine, build a request, sign in when the guard asks, send, watch the
pharmacies answer, compare the offers, consent to a substitution, reserve, and
read the pickup code — and leave for Today, which now carries the hold and
returns you to it, instead of dropping you on a search box.

The verification code is **printed to the terminal** running the server —
`[dev] SMS to +9647…: your code is 123456`. It is never returned in a
response, because the contract does not carry it and returning it would be
inventing a response field.

`npm ci`, not `npm install`: the lockfile is the reproducible answer, and
`tools/deps-check.mjs` exists because a package that was installed but never
declared made every check here pass on a machine where a clean clone would
have failed.

### Checking it

```bash
npm run check      # 10 — trace, layers, ux, types, tests, and five standalone gates
npm run review     # 22 gates, and regenerates review/index.html
npm run design     # regenerates the six derived design documents
```

`npm run review` renders every screen in a real browser, so it needs one:

```bash
npx playwright install chromium
```

### Walking it

```bash
node tools/devserver/smoke.mjs          # the whole loop, screen by screen
node tools/devserver/smoke-offline.mjs  # the failure states — offline, wrong code, queued send
```

Neither is a gate. They print what a patient would see and any error the page
raised, because every defect found in the running app so far was found by
pressing a button rather than by reading.

## What is NOT here

- **No backend.** `tools/devserver` speaks the declared contracts and invents
  DATA — nine catalogue rows, three Karrada pharmacies — never BEHAVIOUR. No
  endpoint answers anything the contract does not describe. No session token
  is stored or refreshed.
- **No device build.** The browser host runs through `react-native-web`, which
  is not React Native. Native gestures, platform chrome, safe-area insets and
  keyboard avoidance are unverified.
- **Four contracted screens have no component** — R4, R5, R11, R13. Each is
  marked *OPEN to the designer* in the design package on exactly the question
  you would have to answer to draw it, so none has been guessed at. Nothing
  renders a control that leads to one, and `journey.test.tsx` fails the build
  if one ever does.
- **Today knows only this session.** S1 is built and is the app's home, but
  the Blueprint also gives it the dispense history and the active subject, and
  there is no port for either — so a returning patient is greeted as a new one.
  See TD-27; it resolves with the reads, not with a decision.

Everything known to be missing or wrong is in the technical debt register
(`tools/review/debt.mjs`), which the review dashboard publishes.

## Build order

| Stage | Contains | Status |
|---|---|---|
| 1 | Repository foundation, config, secrets, logging, telemetry, feature flags | **built** |
| 2 | Shared design system | **built** |
| 3 | Navigation, auth, session, offline, networking | **built** |
| 4 | Domain layer — entities, state machines, rules, events | **built** |
| 5 | Infrastructure — repositories, storage, sync, queues, notifications, audit | client half built; **no server** |
| 6 | Patient app | core loop runs end to end, with a home and a tab bar; 4 screens blocked on design |
| 7 | Pharmacy app | blocked on 2, 3, 5 |
| 8 | Owner console | blocked on 2, 3, 5 |

Stage 4 was built before Stages 2 and 3 deliberately: Rule 3 places every
business rule in the domain, and no layer above it can be correct until those
rules exist and are proven.

Stage 5 is split rather than done: one HTTP transport classifying through
`@dawai/net`, the ports over the declared contracts, the outbox flusher
driving retry/backoff/idempotency, and the effect runner closing the
store → server → store loop all exist and are proven. What does not exist is a
server. Stage 6 depends on that split — the loop is walkable because the
development server answers, not because a backend does.

## Open Blueprint Defects

Four blocker-level defects are awaiting product approval. They are recorded in
[`docs/technical/11-validation-report.html`](../docs/technical/11-validation-report.html)
and block four screens — not the core loop.

**Nothing in this package implements a workaround for any of them.**
