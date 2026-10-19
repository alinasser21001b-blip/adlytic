# Decisions

Format: ID — decision — why — alternatives rejected — reversibility.

**D-001 — Keep one Worker, one D1, same URL.** V2 ships as additive changes to the live
`adlytic-check` Worker. Why: the spec requires the same URL and expand-migrate-switch
migrations. Rejected: a second Worker for V2 (splits sessions/reports). Reversible: per-capability
flags.

**D-002 — Docs-only commits do not redeploy.** The deploy workflow ignores `docs/**`,
`research/**` and `*.md` under `adlytic-check/`. Why: research cycles commit often; each
deploy costs minutes and touches production for no code change.

**D-003 — Real-provider evaluation runs only in GitHub Actions, manually dispatched, with a
hard call cap.** Why: the sandbox cannot reach Cloudflare and must never hold the API key; the
repository is public, so the eval job prints only synthetic-fixture results and aggregate
numbers — never secrets or real user content. Rejected: running evals against the live URL
(would consume production quota and Turnstile).
