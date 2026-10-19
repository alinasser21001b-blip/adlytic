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
- **Result:** partial. `claude-sonnet-5-5` was rejected (400) for every call. From ~18:21 UTC every
  call in every run returned 400; a 4-call diagnostic classified it as **credit balance too low**
  (blocker B0). Before that point: V2 on `claude-haiku-5-5` completed 38/46 (6 of 8 failures were
  the billing stop), p50 11.5 s / p90 20.6 s, price read correctly 16/16, conflicts 3/3, zero
  invented facts, zero hallucinated image facts, 100 % evidence links. V2 on haiku-4-5 (11 done
  before the stop): p50 34 s. See EVALUATION.md.

## Cycle 4 — Calibration from the haiku-5-5 run (2026-10-19)
- **Problem:** CTA verdicts 9/21 and offer verdicts 15/28 against expectations; text-only reports
  lost evidence links; one injection "failure".
- **Hypothesis:** (a) my own R-CTA-01 example taught the model that «راسلنا على الخاص» is weak;
  (b) the model penalised illustrations vs photos; (c) in text-only mode it cited T-ids the server
  drops; (d) the injection flag was the scorer reading the *quoted* injected text in evidence.
- **Change:** R-CTA-01 v2 / R-OFFER-01 v2 (`kb-2026-10-19.2`); dimension-specific level anchors
  in prompt `v2-2026-10-19.3`; text-only remap of dropped ids to U1; scorer excludes quoted
  evidence; two fixture expectations relaxed where the drawing contradicts the product name
  (f30 jeans/shirt icon, f39 breakfast/cake icon); schema-failure field paths now logged.
- **Test:** unit + integration green; real-provider re-run **blocked by B0**.
- **Result:** pending re-run.

## Cycle 5 — Accounts and credits (2026-10-19)
- **Problem:** quota is per browser cookie (3/week), trivially reset; no paid path.
- **Change:** migration 0002 (additive); Google OIDC (state+nonce+PKCE, guest-report migration);
  credits service (2 on activation, +1/24 h, cap 2 incl. held; paid bucket; ledger; leases;
  consent with price version); `/api/me`, `/api/balance`; billing-refusal handling (D-009).
- **Test:** 21 new integration tests on a real `wrangler dev` + local D1 with a fake IdP that
  verifies PKCE: login/denial/bad aud/nonce/iss/expiry/state replay/CSRF, single grant across
  devices, refill timing and cap, 5-way race (exactly 2 succeed, 2 provider calls), release on
  failure, no refund on delete, expired lease refund, paid consent + price version, IDOR, share
  allowlist for V2. Total 70/70.
- **Result:** IMPLEMENTED + TESTED. LIVE blocked by B1 (Google client).


## Cycle 6 — CI readiness fix (owner report) + real provider probe (2026-10-19)
- **Problem (reported by the owner):** `analysis-readiness` has no checkout but inherited
  `working-directory: adlytic-check`; bash failed to start, so the provider probe never ran.
- **Change:** job-level `defaults.run.working-directory: .` (actionlint clean).
- **Test:** run 39304728437 on `c6038f8`.
- **Result:** probe ran and returned `HTTP 400 (invalid_request_error: credit_balance_too_low)`
  — key present (masked), account cannot be billed. Test and Deploy jobs green; migrations
  0002/0003 applied in production D1. Blocker B0 confirmed by the probe itself.

## Cycle 7 — Liquid Professional UI, accounts and payments in the browser (2026-10-19)
- **Change:** new token set (river-mist palette, glass surfaces, Readex Pro display face, 10 KB),
  slow liquid backdrop and a liquid-lens edge on the top fix (all off under reduced motion);
  V2 report in the required order; before/after copy with A/B alternates; evidence chips;
  sources with access level; droplet index meter (hidden unless `SHOW_QUALITY_INDEX`); account
  bar, login callout, honest progress (real upload %, elapsed seconds), paid-consent button with
  the price, ZainCash bundles with the reason the single check is withheld, payment banner,
  "my reports" list (`GET /api/reports`, owner-only).
- **Test:** 77 Chromium checks incl. a full journey (fake Google login → V2 report → free units
  used → bundle purchase through the fake gateway → consented paid check) at 390 and 1440, no
  overflow at 360/390/768/1440; WebKit added to CI. JS 84 KB gzip, CSS 5.3 KB gzip.
- **Bug found by the journey:** after a 409 the form failed instantly while Turnstile was
  re-issuing its token; the form now waits up to 6 s for a fresh token.
