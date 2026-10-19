# V2 cycle log

Each cycle: problem → hypothesis → change → test → result.

## Cycle 0 — Discover (2026-10-19)
- **Problem:** V2 needs a measured baseline and a list of external blockers before any change.
- **Hypothesis:** the live V1 is healthy; identity, payments and Meta import need owner action.
- **Change:** created `docs/v2/*` checkpoint files; deploy workflow now ignores docs-only commits.
- **Test:** `/api/health` on the live build (CI), D1 row of the one production analysis.
- **Result:** baseline recorded in STATE.md; blockers B1–B4 in BLOCKERS.md.
