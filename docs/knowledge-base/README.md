# Dawai — Engineering Knowledge Base

**The permanent brain of the project.** Everything a new engineer or AI needs to
continue building Dawai, written from the source rather than from memory.

## → Start with [`START_HERE.md`](./START_HERE.md)

Read it completely before opening an editor. It covers what this repository
actually contains (two products, and Dawai itself in two shapes), how to run the
project, how the architecture works, what must never be changed, how to build a
feature, and the twelve mistakes that have already been made here.

## → Then open [`SYSTEM_MAP.html`](./SYSTEM_MAP.html) in a browser

An interactive map of the whole system. Everything is clickable and everything is
searchable: 22 screens, 9 state machines with full transition tables, 21
entities, 12 services with their forbidden lists, 54 events, 43 decisions, 26
fixed quantities, the navigation graph, every flow, 20 open debt items and 11
Blueprint gaps. Press `/` to search.

---

## The documents

| # | File | What it settles |
|---|---|---|
| — | [`START_HERE.md`](./START_HERE.md) | **Read first.** Orientation, how to run it, what never to change |
| 00 | [`00-project-overview.md`](./00-project-overview.md) | What Dawai is, the problem, the philosophy, Phase 0, the roadmap, the repo map |
| 01 | [`01-product-vision.md`](./01-product-vision.md) | Who it is for, the eight product commitments, the v1 → v3 corrections |
| 02 | [`02-architecture.md`](./02-architecture.md) | Every module, package, dependency, service, boundary — with diagrams |
| 03 | [`03-domain-model.md`](./03-domain-model.md) | Every entity, value object, aggregate and invariant |
| 04 | [`04-business-rules.md`](./04-business-rules.md) | Every rule and every fixed quantity, with **why** |
| 05 | [`05-state-machines.md`](./05-state-machines.md) | All 9 machines: initial, transitions, events, failure paths, terminal |
| 06 | [`06-user-flows.md`](./06-user-flows.md) | Every workflow per persona: start, steps, decisions, alternatives, failures |
| 07 | [`07-screen-catalog.md`](./07-screen-catalog.md) | Every screen: purpose, inputs, outputs, states, errors, permissions, APIs |
| 08 | [`08-navigation.md`](./08-navigation.md) | Navigation philosophy, the derived graph, back, guards, deep links |
| 09 | [`09-permissions.md`](./09-permissions.md) | Authority, scopes, the four enforcement rules, the matrices, sessions |
| 10 | [`10-clinical-safety.md`](./10-clinical-safety.md) | **The most important file.** What Phase 0 refuses to do, and why |
| 11 | [`11-runtime.md`](./11-runtime.md) | Startup, composition root, DI, effects, caching, offline, sync, jobs |
| 12 | [`12-design-system.md`](./12-design-system.md) | Tokens, a11y, RTL, Arabic plurals, motion, loading, offline, errors, empties |
| 13 | [`13-api-contracts.md`](./13-api-contracts.md) | 67 endpoints, the four global rules, every declared response |
| 14 | [`14-data-model.md`](./14-data-model.md) | 22 tables with constraints, indexes, immutability, deletion rules |
| 15 | [`15-events.md`](./15-events.md) | 54 domain events + the closed set of 12 client telemetry names |
| 16 | [`16-testing.md`](./16-testing.md) | Philosophy, the hierarchy, the gates, CI, the release pipeline, traceability |
| 17 | [`17-known-limitations.md`](./17-known-limitations.md) | What is incomplete, mocked, missing, and what blocks release |
| 18 | [`18-technical-debt.md`](./18-technical-debt.md) | 20 open + 9 resolved items, mirroring `platform/tools/review/debt.mjs` |
| 19 | [`19-open-decisions.md`](./19-open-decisions.md) | Decisions that are **not engineering's to make**, with options |
| 20 | [`20-next-priorities.md`](./20-next-priorities.md) | What to do next, in order, with a definition of done for each |

---

## Reading paths

**"I am new here."**
`START_HERE.md` → `SYSTEM_MAP.html` → `00` → `02` → run it and walk the loop.

**"I need to change a business rule."**
`04` → `05` → `10` (if it touches anything clinical) → `16` §9.

**"I need to build a screen."**
`07` → `08` → `12` → `06` for the flow it sits in.

**"I need to build the backend."**
`13` → `14` → `15` → `09` → `20` Priority 1.

**"I need to report status to someone."**
`17` → `18` → `19`. Do not report from anywhere else.

**"Something is contradictory and I do not know which side is right."**
`19`. Four contradictions between frozen documents are already recorded there,
with what would resolve each. Add yours rather than picking a side in code.

---

## The sources this was written from

Every claim in these files is verifiable in one `open`:

| Source | What it provides |
|---|---|
| `platform/` | The code — every module carries `@blueprint`, `@owner` and `@why` |
| `docs/product/v3/register.js` | The 43 decisions, D01–D43 |
| `docs/product/v3/phase0.js` | The 133 screens, E1–O24 |
| `docs/technical/model.js` | 12 services, 21 entities, 54 events, 67 endpoints, 22 tables, 11 gaps |
| `platform/tools/review/debt.mjs` | The technical debt register |
| `review/data.json` | The generated screen gallery data |
| `dawai-platform/` | The second track — schema, server, migrations |

---

## Keeping this current

This knowledge base is a **deliverable, not paperwork**. When you change the
system, change it in the same commit.

- A new rule or quantity → `04`, and the map's `rules` array.
- A new state or transition → `05`, and the map's `machines` array.
- A new screen contract → `07`, and the map's `screens` array.
- A new debt item → `18`, and the map's `debt` array (the register itself lives
  in `platform/tools/review/debt.mjs`).
- A contradiction you could not resolve → `19`.

`SYSTEM_MAP.html` renders entirely from one `D` object near the top of its
`<script>`. Edit that object; the nodes, the detail panels and the search index
are all generated from it, so they cannot disagree.
