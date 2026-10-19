# Blockers (things only the owner can unblock)

Each blocker names exactly what is missing. Nothing here stops independent work.

| ID | Capability | Missing | Effect until provided | How to provide (no secrets in chat) |
|---|---|---|---|---|
| ~~B0~~ **resolved by 2026-10-19 19:58 UTC** | All analysis (live) | Anthropic API credit — the owner topped up the account | — | Billing probe OK at 19:58 UTC (E-011); `/api/health` `ready: true` with `providerUsable: true` at 20:06:45 UTC on `dd0100c` (E-012) |
| B1 | Account login | A Google OAuth 2.0 **Web client** (client ID + secret) with redirect URI `https://adlytic-check.i6900612.workers.dev/api/auth/google/callback` | Login code is IMPLEMENTED/TESTED against a mock IdP; live login BLOCKED, guest quota keeps working | Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web). Add repo secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; the deploy job copies them into Worker secrets |
| B2 | Paid checks | ZainCash merchant account + API v2 credentials (and the owner's acceptance of ZainCash terms) | Purchase flow IMPLEMENTED/TESTED with a mock gateway, behind `PAYMENTS_ENABLED=false` | Owner signs up with ZainCash; adds repo secrets named in PAYMENT_PROVIDER_DECISION.md |
| B3 | Instagram/Meta link import | A Meta app with the relevant permissions approved in App Review | Links to Instagram/Facebook show `AUTH_REQUIRED`/`UNSUPPORTED` honestly | See LINK_SUPPORT.md |
| B5 | `claude-sonnet-5-5` | Model access for this API account (`model_not_available`, E-013) | Not needed: V2 runs on `claude-haiku-5-5`; only matters if a larger model is ever wanted | Anthropic Console — model access for the organisation |
| B4 | Human quality review | A human reviewer for the held-out set | `HUMAN_QUALITY_REVIEW=pending` | Review sheet in EVALUATION.md |

Resolved: the Cloudflare deploy token can bind Workers AI — the binding deployed with build
`dc08f3f` (E-007), so video transcription needs no owner action beyond B0.
