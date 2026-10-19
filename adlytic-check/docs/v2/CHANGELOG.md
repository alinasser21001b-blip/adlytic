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

## Cycle 8 — Video checks (2026-10-19)
- **Problem:** many shop ads are short Reels; V1 accepts one image only.
- **Hypothesis:** frames sampled in the browser (dense in the first 2 s) + a 16 kHz mono WAV are
  enough for the same evidence-first review, without uploading or storing the video and without
  ffmpeg/Containers (D-006).
- **Change:** `src/features/check/video.ts` (≤60 s, ≤50 MiB, ≤10 frames at 768 px, audio
  decoded/resampled on the device); `worker/validation/video.ts` (frame count/size/order, strict
  PCM 16 kHz mono WAV, server-measured silence); `worker/services/asr.ts` (Workers AI Whisper via
  the `AI` binding, added only at deploy time; statuses no_audio / silence / speech_transcribed /
  unavailable); Analyzer V2 takes timed frames and transcript segments (A-ids, fenced), returns a
  coverage statement and a timeline; migration 0004 (`media_kind`); CSP `media-src 'self' blob:`;
  `VIDEO_ENABLED=false` by default.
- **Test:** 9 integration tests (labels and order of frames sent to the provider, transcript
  fencing, silence/no-audio skip ASR, 6 validation refusals before any spend, disabled refusal);
  browser journey uploads a real video and checks coverage + timeline; frame-sampling unit test.
  13 synthetic MP4 fixtures (H.264/AAC) with ground truth for the real-provider eval.
- **Found on the way:** the test Chromium has no H.264 (real Chrome/Safari do) — browser test
  uses a VP9/Opus copy; rounding dropped the last sample of long videos (fixed); CSP blocked
  `blob:` video (fixed); `wrangler dev` cannot start with an AI binding without credentials
  (binding injected by `scripts/ci/deploy.sh`, with a no-AI fallback).
- **Result:** IMPLEMENTED + TESTED; real-provider video eval and Whisper accuracy on Iraqi Arabic
  **blocked** (B0, and ASR quality unmeasured).

## Cycle 9 — Link import (2026-10-19)
- **Problem:** owners have links (Instagram posts, product pages, file links), not files.
- **Change:** `POST /api/import-link` with honest states (AUTH_REQUIRED for Meta, UNSUPPORTED for
  other platforms, SUPPORTED for direct image/video files, PREVIEW_ONLY for a page's og:image,
  UNAVAILABLE); SSRF controls per OWASP (https/443, no credentials, internal names and v4/v6
  addresses incl. embedded IPv4, DoH answers checked, every redirect re-checked, streaming byte
  caps); paste-a-link control in the form. `docs/v2/LINK_SUPPORT.md`.
- **Test:** 45 SSRF unit tests; 18 integration tests against a local file server (incl. redirect to
  the metadata address, og:image pointing inside, redirect loop, oversize declared/actual,
  production ignores the test origin); browser checks for the Instagram explanation and a shop
  page import.
- **Result:** IMPLEMENTED + TESTED (direct links); Meta import BLOCKED (B3 — needs an approved app).

## Cycle 10 — Launch readiness (2026-10-19)
- **Problem:** live verification only covered V1 routes; nothing proved on the production URL
  that the V2 surfaces behave (SSRF refusals, honest disabled states, price, the new UI), and the
  readiness job stopped at the first failed step, hiding other missing pieces.
- **Change:** per-capability `capabilities` in `/api/health` (no secret values); `verify-live.sh`
  section 5 (link import refuses metadata/loopback/mapped-private/localhost/self before
  connecting, Instagram → AUTH_REQUIRED, catalog 500 IQD @ `iqd-500@1` and consistent with
  health, login start honest about its state, display font served); `scripts/ci/live-ui.mjs`
  real-browser smoke on the production URL at 360/390/768/1440 + privacy/terms, screenshots kept
  as an artifact; readiness job reports configuration even after a failed billing probe. Privacy
  and terms updated for video, link import, Google login (sub only), ZainCash, 2 + 1/24 h quota
  and the 500 IQD consent. THREAT_MODEL.md, MODEL_CARD.md, ROADMAP_V3.md, retrieval eval.
- **Test:** the new live checks ran against a real local Worker in production mode (E-009).
  The first font check passed vacuously (`document.fonts.check` is true for an undeclared
  family); replaced by an explicit loaded-face check, which then caught a wrong family name in
  the script itself.
- **Bug found while writing the kill-switch table:** `PAYMENTS_ENABLED=false` also stopped the
  daily reconciliation, so a customer who paid on the ZainCash page but never came back would not
  be credited until payments were switched on again. Reconciliation now needs only the gateway
  credentials; the switch stops new orders only. Two new integration tests fire the real cron
  handler (`/cdn-cgi/handler/scheduled`): paid-but-never-returned is credited exactly once, and an
  already-paid order is credited with the switch off (this test fails on the old code).
- **Result:** IMPLEMENTED + TESTED locally; LIVE result recorded after the deploy of this commit.

## Cycle 11 — Real-provider measurement after the top-up (2026-10-19)
- **Problem:** V2 had never been measured end to end; video never on a real model.
- **Change:** eval video suite (ffmpeg frames at the browser's exact times, known transcript as
  ASR); post-top-up benchmark (V2 haiku-5-5 / haiku-4-5, V1 live config, video, sonnet diagnostic).
- **Result:** V2·haiku-5-5 43/46, 0 invented facts; V1 live config leaked a phone number and used
  prediction language on held-out cases; V2·haiku-4-5 11/18; sonnet-5-5 not available to the
  account. Weak spots: 48 % schema repairs, CTA 13/24, video opening/brand/safe-zone calibration.

## Cycle 12 — Recalibration to release (2026-10-19)
- **Hypotheses → changes:** (1) repairs are cosmetic (echoed U/M ids, off-pattern ids, labels
  JSON-encoded twice) → deterministic pre-validation tidy-up that never touches text; (2) CTA
  misses are one stance («بالخاص» = "which app?") → anchors naming Meta DM phrases as specific,
  following R-CTA-01's own example; (3) the video opening mixed text and frames → KB
  `excludeMedia`, R-OPEN-01 off for video; (4) legibility penalised missing items and disagreed
  with its own class → anchors + server-enforced class ↔ level.
- **Test:** 4 rounds on the real provider (EVALUATION.md); 8 new unit tests; browser suite now
  renders real model output (E-015); 163/163 vitest.
- **Found on the way:** the safe-zone scorer counted any edge mention as success for "ok" cases
  (fixed, documented).
- **Result:** round 4 meets the release bar on held-out cases → D-015: production runs V2 on
  haiku-5-5; index and video stay off with measured reasons.

## Cycle 13 — Cost per check, a stable index, re-check (2026-10-19)
- **Problems:** every check re-sent ~7k identical tokens; the index moved ~5 points (max 15)
  between two runs of the same ad; owners had no way to see whether a fix worked.
- **Hypotheses → changes:** (1) a stable prefix can be cached → rule base in a fixed second system
  block, both tools always offered in fixed order, request names rule ids only (`PROMPT_CACHE`);
  (2) index noise is adjacent-level flips, not calibration → offline study first (fewer levels:
  worse), then the mean of two ratings via a short levels-only call reusing the cached prefix
  (`INDEX_SECOND_OPINION`); (3) a fix's effect is visible in its dimension → server-side re-check
  comparison (migration 0005: cache tokens, parent_id).
- **Test:** gates written before measuring; A/B + replicate on the real provider (EVALUATION.md);
  unit tests for the cached layout (identical bytes across ads), second rating (averaged / hidden /
  failed), comparison rules; 5 re-check integration tests (incl. another owner's id); browser
  re-check journey at 390/1440.
- **Found on the way:** the first caching A/B looked worse on CTA/offer; the replicate and the
  per-case view showed the flips were known borderline cases — reported as inconclusive-then-pass
  rather than relaxing the gate.
- **Result:** caching on (−56–64 % input per check); index shown (mean |Δ| 3.9, AUC 1.00); re-check
  live after deploy.
