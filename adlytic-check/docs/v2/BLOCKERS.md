# Blockers (things only the owner can unblock)

Each blocker names exactly what is missing. Nothing here stops independent work.

| ID | Capability | Missing | Effect until provided | How to provide (no secrets in chat) |
|---|---|---|---|---|
| B1 | Account login | A Google OAuth 2.0 **Web client** (client ID + secret) with redirect URI `https://adlytic-check.i6900612.workers.dev/api/auth/google/callback` | Login code is IMPLEMENTED/TESTED against a mock IdP; live login BLOCKED, guest quota keeps working | Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web). Add repo secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; the deploy job copies them into Worker secrets |
| B2 | Paid checks | ZainCash merchant account + API v2 credentials (and the owner's acceptance of ZainCash terms) | Purchase flow IMPLEMENTED/TESTED with a mock gateway, behind `PAYMENTS_ENABLED=false` | Owner signs up with ZainCash; adds repo secrets named in PAYMENT_PROVIDER_DECISION.md |
| B3 | Instagram/Meta link import | A Meta app with the relevant permissions approved in App Review | Links to Instagram/Facebook show `AUTH_REQUIRED`/`UNSUPPORTED` honestly | See LINK_SUPPORT.md |
| B4 | Human quality review | A human reviewer for the held-out set | `HUMAN_QUALITY_REVIEW=pending` | Review sheet in EVALUATION.md |

Open questions recorded, not blocking: whether the Cloudflare deploy token is allowed to bind
Workers AI (needed for video audio transcription) — verified on first deploy that adds the binding.
