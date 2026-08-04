# 18 — Technical Debt

## Grep results

A repo-wide grep for `TODO|FIXME|HACK` across `dawai-platform/{server,src}` and `platform/{packages,apps}` (`.ts`/`.tsx`, excluding test files) returned **zero matches**. This is corroborated by `docs/dawai/FINAL_MVP_READINESS.md`'s own audit sweep: *"TODO/FIXME in app source: None material."* Take this as a genuinely clean marker-comment codebase, not an artifact of a narrow grep — but see "debt that doesn't show up as a comment" below, which is where the real debt lives here.

## Debt that doesn't show up as a TODO comment (inferred from the migration history and readiness reports)

1. **Multi-worker outbox claiming is optimistic, not lock-safe.** `FINAL_MVP_READINESS.md` marks this **PARTIAL**: fine for a single lifecycle worker, but scaling `worker.ts` horizontally risks duplicate claims on `notification_outbox` rows without a `SKIP LOCKED`-style claim query. Needs addressing before any multi-node worker deployment. See `11-runtime.md`.
2. **Audit log is mutable at the database level.** `audit_events` has no application code path that updates/deletes rows, but nothing enforces this at the schema level (no hash chain, no DB-level revoke of UPDATE/DELETE grants documented). Marked **PARTIAL** against the "append-only audit" architecture requirement. Blueprint v3's stricter model ("nobody — including the operator — holds an update or delete permission on `audit_entries`") is the aspirational bar here.
3. **Three migrations in a row (0004→0005→0006→0007) fixing bugs introduced by the previous one.** Not a criticism — this is disciplined adversarial-review-driven hardening, explicitly labeled as such (`0007`'s own header: "Round-2 review: fixes for defects introduced by the round-1 fixes"). But it signals that new clinical-schema changes in this area should get an adversarial review pass *before* merging, not after — the fix-forward pattern cost three migration cycles to close out fully. See `10-clinical-safety.md` for the specific defects and their lessons.
4. **No central event-type registry.** `notifications.event_type` and `resource_type` values are free-text strings scattered across route/service call sites; there is no single enum/const file listing every valid event type (contrast with Blueprint v3's formal 54-event catalogue). Risk: a typo'd event type silently fails to match client-side handling with no compile-time check. Worth introducing a shared const module if the notification surface grows further.
5. **No shared contract package between `dawai-platform`'s client and server.** `src/api/client.ts` and `server/routes/*.ts` types are independently maintained (no generated/shared schema), unlike `@dawai/contracts` on the `platform/` track. Drift risk on any endpoint whose Zod schema changes without a corresponding client type update.
6. **Two independent design-token/CSS systems with zero sharing** (`dawai-platform/src/styles.css` vs `platform/packages/design/src/tokens/*`). Not itself a bug, but every visual consistency fix has to be done twice if both surfaces are to look aligned — see `12-design-system.md` and `19-open-decisions.md`.
7. **`TimelinePages.tsx` was not fully read/confirmed in this synthesis pass** — its exact contents (whether it fully implements the clinical timeline UI referenced as "screens are next" in `BLUEPRINT_EXECUTION.md`) should be verified directly before assuming that UI is either complete or absent. Flagged here rather than asserted either way to avoid introducing a false claim into this knowledge base.
8. **`server/errors.ts`'s full error-code taxonomy was not enumerated in this pass.** Anyone building new client error-handling should read that file directly rather than relying on the few example codes named in `13-api-contracts.md`.

## `platform/tools/debt-check.mjs`

A dedicated debt-scanning tool exists for the `platform/` tree specifically (likely scanning for TODO markers, stale Blueprint references, or unimplemented-but-declared contracts within that workspace). It was not executed in this pass (no shell access to its output was captured); running it directly (`node platform/tools/debt-check.mjs`) would give a more precise, tool-verified debt list for that tree than the manual grep above, and is recommended as a next step for anyone doing sustained work in `platform/`.

## Recommendation

Given the clean TODO-marker state, prioritize the structural items above (1–2, safety-relevant; 4–6, maintainability) over a marker-comment sweep — there's nothing left to sweep.
