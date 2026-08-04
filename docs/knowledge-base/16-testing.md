# 16 — Testing

## Shipped product (`dawai-platform`)

### Levels
- **Unit/integration (vitest)**: `server/tests/*.test.ts` — `clinical.test.ts`, `core-flow.test.ts`, `interactions.test.ts`, `lifecycle-auth.test.ts`, `matching.test.ts`, `ocr.test.ts`, `sku-key.test.ts`. These are **real integration tests against the actual Hono app and a real (PGlite in-memory) database** — `core-flow.test.ts` spins up `createApp(database)` with `createDatabase({memory:true, migrate:true})` and drives real HTTP-shaped requests through `app.request`, not mocked network. `docs/dawai/FINAL_MVP_READINESS.md`: *"E2E uses real API + PGlite... not mock network"* — same philosophy at the unit-test level.
- **Component tests**: `src/App.test.tsx`, `src/components/PillBar.test.tsx` (asserts the priority-preemption state machine and the no-dismiss-on-SEV_ALERT behavior).
- **E2E (Playwright)**: `dawai-platform/e2e/{app.spec.ts, mobile.spec.ts}`, config in `playwright.config.ts`. Boots a real server (`tsx server/index.ts` against a fresh PGlite path, `ADMIN_EMAIL`/`ADMIN_PASSWORD` seeded) and a preview build of the web app, then drives the full patient→pharmacy→admin journey through a real browser (desktop-chromium + mobile-chromium/Pixel-7-style viewport). `app.spec.ts` covers the desktop/full journey (register → request → offer → hold → ready → complete per `docs/dawai/APP_STORE_READINESS.md` §8); `mobile.spec.ts` additionally checks overflow, ≥44px tap targets, ≥16px input font size (prevents iOS auto-zoom), bottom-nav behavior, and wizard back/gating behavior across iPhone SE/14/15 Pro Max and a 360px Android viewport.
- Last recorded run (`docs/dawai/FINAL_MVP_READINESS.md`, 2026-07-31): `npm test` 4 files/16 tests PASS; `npm run check` PASS; `npm run build` PASS; `npx playwright test` desktop-chromium + mobile-chromium 2 passed; `npm audit --omit=dev` 0 vulnerabilities. `docs/dawai/BLUEPRINT_EXECUTION.md` (a later pass) reports the unit-test count grew to **33 passed** after the clinical-core wave (+9 clinical invariants, +8 Pill Bar state-machine tests).

### Quality gates / CI
No dedicated CI workflow file was located in this review pass under standard paths (verify `.github/workflows/` directly if a CI history question comes up) — the documented gate sequence is the `README.md`/`package.json` script chain: `npm run check` (typecheck client + server) → `npm test` (vitest) → `npm run build` (esbuild+vite) → `npm run test:e2e` (playwright) → `npm audit`. Treat this sequence as the de facto CI contract until a workflow file is confirmed.

### Traceability
Tests assert *invariants*, not just happy paths — explicitly called out in `docs/dawai/BLUEPRINT_EXECUTION.md`: "suppression on conflicting data, trust threshold exclusion, priority preemption across every adjacent pair, and the absence of a dismiss control on severe alerts." This mirrors (independently) the Blueprint v3 testing philosophy's emphasis on state-machine and permission-matrix exhaustiveness (below) — a good style to continue in new `dawai-platform` tests regardless of which blueprint track motivated the feature.

## Blueprint v3 testing strategy (`docs/technical/09-testing-strategy.html`) — spec for the `platform/` track, partially realized in `platform/packages/*/src/*.test.ts`

47 test areas across 7 levels (unit 7, state-machine 8, permission 8, contract 3, integration 6, e2e 9, regression 6), each traced to a specific Blueprint v3 §-reference — "a test with no reference is testing an invention, and the validator fails it" (`platform/tools/trace-check.mjs` / `test-reach-check.mjs` presumably enforce this).

The two suites called out as carrying the most weight:
- **Permission tests** exercise every cell of the permission matrices, positive *and* negative — including "the row v1 got wrong": an assistant confirming a reservation must succeed (a prior version incorrectly restricted confirmation to pharmacists only).
- **State-machine tests** assert that no transition outside the diagram is reachable — the only way a documented state machine stays true of the code (directly realized by `platform/packages/domain/src/shared/machine.ts`'s `defineMachine()` engine, which makes `transition()` the sole way to move between states, and by the corresponding `.test.ts` file next to every machine file).

Named regression tests lock in fixed v1 defects: pharmacist-only confirmation (fixed — assistants can confirm), single-medicine-only offers (fixed — multi-line requests are partially answerable, spinning off a child request), a reservation countdown existing before confirmation (fixed — no clock in the `requested` state), silent routing exclusion (fixed — an excluded branch can see its own exclusion reason).

This suite is not runnable against `dawai-platform` and should not be treated as `dawai-platform`'s test plan — it validates `platform/packages/domain` and, where built, `platform/apps/patient`.

## `platform/tools/*` architecture-conformance validators

These run against the `platform/` tree specifically and are worth knowing about even if you work only in `dawai-platform`, because their names describe conventions worth adopting more broadly: `layer-check.mjs` (package dependency direction), `deps-check.mjs`, `debt-check.mjs` (feeds `18-technical-debt.md`), `docs-check.mjs`, `strict-check.mjs`, `trace-check.mjs` (spec traceability), `test-reach-check.mjs` (test coverage reachability), `ux-check.mjs` (five-state screen contract, `12-design-system.md`).
