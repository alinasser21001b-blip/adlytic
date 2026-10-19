# V2 cycle log

Each cycle: problem → hypothesis → change → test → result.

## Cycle 0 — Discover (2026-10-19)
- **Problem:** V2 needs a measured baseline and a list of external blockers before any change.
- **Hypothesis:** the live V1 is healthy; identity, payments and Meta import need owner action.
- **Change:** created `docs/v2/*` checkpoint files; deploy workflow now ignores docs-only commits.
- **Test:** `/api/health` on the live build (CI), D1 row of the one production analysis.
- **Result:** baseline recorded in STATE.md; blockers B1–B4 in BLOCKERS.md.

## Cycle 1 — Research registry and rules (2026-10-19)
- **Problem:** V1 rules live only inside the prompt; nothing ties a recommendation to a source.
- **Hypothesis:** a small, versioned rule KB with source ids lets the engine cite only verifiable
  sources and lets tests reject fabricated ones.
- **Change:** `research/sources.json` (22), `research/rules.json` (18 rules, 9 rubric dimensions),
  `docs/v2/RESEARCH.md`; CI research-fetch job for publishers the sandbox cannot reach.
- **Test:** each source's access level recorded from the fetch log (HTTP status + sha256); Meta and
  ZainCash pages refused automated fetches → marked `search_excerpt`.
- **Result:** 12 sources read in full, 10 via excerpts; weak/secondary evidence flagged per rule.
