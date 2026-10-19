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

## Cycle 2 — Benchmark and V1 baseline (2026-10-19)
- **Problem:** no measurement of V1 beyond one production check (42.5 s, one repair, cause unknown).
- **Hypothesis:** the repair and the slowness come from the output format, not the model's judgement.
- **Change:** 46 synthetic ground-truth fixtures; truth-based scorer; V1 engine extracted unchanged
  into `worker/engine/v1.ts` (repair causes now logged); CI eval job with a call cap.
- **Test:** V1 on all 46 cases with the live settings (77 calls, $1.06).
- **Result:** 30 % of checks fail — truncation at the 3 000-token cap is the dominant cause. Also:
  Eastern-Arabic zero misreads, no small-text detection. Details in EVALUATION.md.

## Cycle 3 — First engine fix + V2 comparison (2026-10-19)
- **Problem:** truncation → repair → timeout.
- **Hypothesis:** 4 096 output tokens and a 60 s budget remove most failures for V1; V2's compact,
  evidence-first format should be shorter still.
- **Change:** live `MAX_OUTPUT_TOKENS` 3000→4096, `PROVIDER_TIMEOUT_MS` 45000→60000, client wait
  75→90 s; V2 prompt asks for text size, careful Eastern-digit reading, one-sentence fields.
- **Test:** 4 parallel eval runs (V2 haiku-4-5, V1 with new limits, V2 haiku-5-5, V2 sonnet-5-5 dev).
- **Result:** pending.
