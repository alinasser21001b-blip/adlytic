# Cross-team handoff

The handoff record lives in [`12_CROSS_TEAM_HANDOFF.md`](./12_CROSS_TEAM_HANDOFF.md),
numbered with the rest of this set.

Summary: `CROSS_TEAM_CONFLICTS = 1`, detected and deferred — no file owned by
the Close-Code / CI / deployment engineer was edited. The graph briefly tripped
the PeriodInsight rollout guard by naming the model in a provenance string; the
graph entry was removed rather than the guard relaxed. Two further notifications
(an additive `test:all` extension, and an observation about the `test.yml` push
trigger that was deliberately **not** acted on) are recorded there.
Nothing is blocked.

---

## Final convergence pass (Track B)

`origin/main` was merged **into** the UI stabilization branch — normal merge,
no force-push, no reset, nothing discarded. Details, including the one
semantic conflict and how it was resolved, are in
`21_FINAL_CONVERGENCE.md`.

**Nothing in Track A's ownership area was touched.** No deployment
configuration, PeriodInsight semantics, worker rollout, Railway gate, CI
workflow, Brain decision logic, build identity, or deployment queue
diagnostic. `package.json` changed only in `scripts`, and only additively:
`start`, `build` and the worker entry points are byte-identical.

Where a Track-A guard and this work disagreed, the guard won and the admin
side changed. All five still pass unweakened: `deploy-gate` (54),
`period-rollout` (11), `period-metrics` (18), `brain-observatory` (49),
`session-routing` (36).

### One thing worth knowing about `test:all`

Five admin test files existed on disk with no npm script, so the suite never
ran them: `test_admin_pages.ts`, `test_admin_console.ts`,
`test_admin_adversarial.ts`, `test_admin_clickthrough.mjs`,
`test_admin_viewports.mjs`. They are registered and in `test:all` now, which
makes the shared gate longer. All five pass, and the two browser-driven ones
were run repeatedly to confirm they are deterministic before being added —
but if a release ever needs a shorter gate, these are Track B's and can be
split out without touching anything of yours.
