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

**D-004 — Analyzer V2 is one structured call plus deterministic server validation.** The model
proposes evidence, verdicts, fixes and copy; the server decides what is published (evidence links,
rule ids from the retrieved set, modality, fact ledger, price conflicts, medical/prediction text)
and computes the index. Why: two sequential calls would double latency (V1 already ~26 s p50).
Rejected: separate extract/assess calls; embeddings (18 rules — deterministic filtering covers the
KB; BM25 only orders them).

**D-005 — Retrieval = applicability filter + BM25 order, all applicable rules sent.** With 18
rules the filtered set is 10–14; sending all keeps recall at 1.0. BM25 matters only if a cap is
ever applied. Embeddings not justified by the benchmark size.

**D-006 — No Containers/ffmpeg for video in V2.** Containers need Workers Paid (plan not visible
from here) and Workers have 128 MB / 10 ms CPU on Free. Frames and audio are extracted in the
browser; the Worker receives sampled frames + a 16 kHz mono WAV.

**D-007 — Accounts: Google OIDC only, `sub` only.** Scope `openid`; no e-mail or name stored.
Code flow with S256 PKCE, state bound to an HttpOnly cookie and to the guest session (that binding
is the proof used to move guest reports into the account), nonce checked, one-time transaction.
ID token trusted via direct TLS exchange with Google (OIDC Core §3.1.3.7) with iss/aud/exp/nonce
checks. Rejected: passkeys (no Sybil resistance for free credits), magic links (needs an e-mail
provider and domain).

**D-008 — The check row is the credit reservation.** `analyses.status='pending'` + lease =
held unit; `free_quota`/`paid_balance` hold balances; `credit_ledger` is append-only with
UNIQUE(reason, ref, bucket). Every movement is one D1 batch (one transaction). Refills are lazy
but applied at every event with that moment's hold count, which equals the eager policy.
Expired leases are settled at the user's next event and by the daily cron.

**D-009 — Billing refusals pause analysis.** A provider `credit_balance_too_low` /
`usage_limit_reached` answer returns 503 `ANALYSIS_DISABLED` (not retryable), refunds the unit,
records `provider_blocked`, and makes health readiness false for 15 minutes.

**D-010 — Migration 0002 applied ahead of use (expand step).** Additive tables/columns only;
`ACCOUNTS_ENABLED=false` keeps live behaviour identical until Google credentials exist.

**D-011 — Keep the applicability filter; send every filtered rule (measured).** Offline retrieval
eval on the 46 labelled fixtures: the filter keeps recall 1.0 while cutting rules sent from 18 to
13.4 on average; BM25 ordering gains a little at k=5 (P@5 0.326 vs 0.287) and loses at k=8
(nDCG@8 0.588 vs 0.637). No cap is applied, so ordering barely matters. Confirms D-005.

**D-012 — Workers AI binding is injected at deploy time, not kept in `wrangler.jsonc`.**
`wrangler dev` refuses to start with an `ai` binding without Cloudflare credentials, which would
break the no-secrets test job. `scripts/ci/deploy.sh` writes a deploy-only config with the
binding and falls back to a no-AI deploy with a warning (video then reports audio as
`unavailable`, never as silence). Verified: the binding deployed on `dc08f3f`.

**D-013 — Live verification proves only what can be proven without spending.** Every deploy now
checks, on the production URL: capabilities in `/api/health`, link import refusing internal
targets before connecting, Instagram → AUTH_REQUIRED, the server catalog price (500 IQD,
`iqd-500@1`), login/payments being honest about their state, and a real-browser UI smoke at
360/390/768/1440 (real Turnstile, fonts and CSP; nothing is submitted). Real analyses are proven
only by the readiness probe and the manual eval workflow (D-003).

**D-014 — Flags are flipped by commit, not by dashboard.** `ANALYZER_VERSION`,
`SHOW_QUALITY_INDEX`, `ACCOUNTS_ENABLED`, `PAYMENTS_ENABLED`, `VIDEO_ENABLED`,
`SINGLE_UNIT_PURCHASE` and the kill switch `ANALYSIS_ENABLED` live in `wrangler.jsonc`, so each
change is reviewed, deployed by CI and verified live. Rejected: GitHub repository variables
(unreviewed, and not masked in the public logs).

**D-015 — Production switches to Analyzer V2 on `claude-haiku-5-5` (2026-10-19).** Evidence:
four real-provider rounds after the top-up (EVALUATION.md). On the 18 held-out cases, round 4
(prompt `v2-2026-10-19.7`, KB `kb-2026-10-19.3`) beats live V1 on safety (0 vs 1 phone number
surfaced, 0 vs 1 prediction, 1 vs 8 image "facts" not in the image), speed (p50 10.1 s vs 28.6 s)
and CTA/offer/price/conflict verdicts; equal on readability; one case behind on the legibility
class (17/18 vs 18/18). Zero invented facts and zero unknown sources in every round. V2 on the
live model (haiku-4-5) completed only 11/18, so the model changes with the analyzer.
Kept off: `SHOW_QUALITY_INDEX` (index |Δ| between runs of the same case: mean 5.4, max 15),
`VIDEO_ENABLED` (Whisper on Iraqi speech unmeasured; video opening 3/5). Rollback: set
`ANALYZER_VERSION` to `v1` and `VISION_MODEL` to `claude-haiku-4-5`; stored V2 reports stay
readable either way. The readiness probe now pings the configured model, so a model the account
cannot use (as `claude-sonnet-5-5`, E-013) turns readiness red instead of failing checks.

**D-016 — Prompt caching on (`PROMPT_CACHE=true`).** The rule base moved into a second, fixed
system block; tools (both, fixed order) + system ≈ 6,960 tokens are identical for every check and
read from the cache at ~0.1× the input price. Measured on the same 46 cases: input-token
equivalents per check −56 % to −64 %, output unchanged, p50 not worse. The pre-registered quality
gate failed on the first pair and passed on a replicate; pooled differences go both ways within
noise (EVALUATION.md, cycle 13). Default 5-minute TTL: a check hours after the previous one pays
the 1.25× write premium (~+8 % per check without the index); the 1-hour TTL (2× write) would cost
more at low traffic. Rollback: `PROMPT_CACHE=false` restores the original layout byte for byte.

**D-017 — Quality index shown, as the mean of two independent ratings (`SHOW_QUALITY_INDEX=true`,
`INDEX_SECOND_OPINION=true`).** Offline study: fewer levels make it less stable; averaging two
ratings met every pre-registered gate (mean |Δ| 3.9 ≤ 4, 97 % within 10, AUC 1.00). The second
rating is a short levels-only call that reuses the cached prefix; the report's verdicts keep the
main call's levels; a failed or skipped second rating falls back to one rating. The meter says it
is an average of two ratings and can move a few points; a re-check reports an index change only
when it exceeds 10 points (97 % of same-ad repeats stay within 10). Cost: about the same as before
caching when checks come in bursts, up to ~+31 % when checks are hours apart (assumed 1:5 price
ratio). Human review of the ranking (B4) still pending. Rollback: either flag to `false`.

**D-018 — Re-check is computed by the server, not the model.** A re-check compares the new report
with the owner's earlier V2 report: a fix counts as applied when the dimension it targeted is now
strong (or rose), partly when it rose but still needs work, not yet when unchanged. No extra
provider call; the parent is loaded with the same ownership clause as reading a report; the public
share page never shows it. Rejected: asking the model whether each fix was applied (cost, and it
would grade its own advice).
