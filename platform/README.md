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

```bash
npm install
npm run check      # trace + layers + ux + types + test
```

## Build order

| Stage | Contains | Status |
|---|---|---|
| 1 | Repository foundation, config, secrets, logging, telemetry, feature flags | **built** |
| 2 | Shared design system | **built** |
| 3 | Navigation, auth, session, offline, networking | **built** |
| 4 | Domain layer — entities, state machines, rules, events | **built** |
| 5 | Infrastructure — repositories, storage, sync, queues, notifications, audit | not started |
| 6 | Patient app | UX contracts declared for the core loop; screens blocked on 3, 5 |
| 7 | Pharmacy app | blocked on 2, 3, 5 |
| 8 | Owner console | blocked on 2, 3, 5 |

Stage 4 was built before Stages 2 and 3 deliberately: Rule 3 places every
business rule in the domain, and no layer above it can be correct until those
rules exist and are proven.

## Open Blueprint Defects

Four blocker-level defects are awaiting product approval. They are recorded in
[`docs/technical/11-validation-report.html`](../docs/technical/11-validation-report.html)
and block four screens — not the core loop.

**Nothing in this package implements a workaround for any of them.**
