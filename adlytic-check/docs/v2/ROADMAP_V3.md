# Roadmap V3 — after Adlytic Check V2

Ordered by what unblocks the most value for Iraqi shop owners per hour of work. Each item names
its gate. Section 0 is in progress; the rest is not started.

## 0. Finish V2 (owner actions first, then measurement)

| # | Item | Gate | Owner action needed |
|---|---|---|---|
| 0.1 | ✅ Done — 4 real-provider rounds (EVALUATION.md, E-013/E-014) | met except index stability and one legibility case (D-015) | — |
| 0.2 | ✅ Switched with `VISION_MODEL=claude-haiku-5-5` (D-015); owner's live check worked (E-017) | met | — |
| 0.3 | ✅ Index shown (D-017): mean of two ratings, mean Δ 3.9, AUC 1.00 | human agreement still to record (0.4) | — |
| 0.4 | Human quality review of the 18 held-out cases (sheet in EVALUATION.md) | — | B4: a reviewer |
| 0.5 | `VIDEO_ENABLED=true` after video fixtures pass and Whisper is measured on Iraqi Arabic speech (word error rate on a small labelled, consented set) | WER and coverage reported | a small set of consented, labelled Iraqi speech samples |
| 0.6 | Google login live (`ACCOUNTS_ENABLED=true`) | first real login verified, guest → account move verified | B1: OAuth client |
| 0.7 | ZainCash UAT end-to-end with a spend cap, then production | one UAT payment credited exactly once, reconciliation clean | B2: merchant account |

## 1. Quality

- ✅ **Prompt caching** (D-016) and ✅ **re-check** (D-018) — cycle 13.
- **Production cache hit rate:** cache tokens are now stored per check (`cache_read_tokens`,
  `cache_write_tokens`); review after a week of real traffic and reconsider the TTL.
- **Bigger, real benchmark:** add consented real ads (with owner permission and redaction) to the
  synthetic set; keep the truth-based scorer.
- **Retrieval:** only revisit if the KB grows past ~40 rules (today the applicability filter
  sends 13 of 18 with recall 1.0 — D-005).

## 2. Reach

- **Meta authorised import** (B3): Instagram API with Instagram Login for the owner's own media,
  only after App Review; states stay honest until then.
- **Custom domain** and a short share URL.
- **Server-side video decode** (Containers + ffmpeg) only if browser extraction fails for a
  measurable share of real uploads (needs Workers Paid; D-006).

## 3. Operations

- Dashboard of provider failure classes, p50/p90 latency, cost per completed check, refunds.
- Alert when readiness turns false (provider billing, Turnstile, D1).
- Monthly restore drill for D1 (Time Travel) and a written incident runbook.

## Explicitly not planned

Predicting sales/ROAS, scraping Instagram/Facebook, storing ad images or videos, collecting
e-mail or names, medical/regulated categories.
