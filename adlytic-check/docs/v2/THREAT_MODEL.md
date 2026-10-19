# Threat model — Adlytic Check V2

Assets: owners' ad content and reports; credit balances and paid orders; the provider account
(cost); provider/IdP/gateway credentials; the service's availability.
Actors: anonymous visitors, logged-in owners, a malicious owner, a network attacker, a malicious
link target, a forged payment notifier, prompt-injection content inside ads.

| # | Threat | Control | Evidence |
|---|---|---|---|
| T1 | IDOR: read/share/delete someone else's report | Owner = `user_id` (account) or `visitor_id` with `user_id IS NULL` (guest); identical 404 for missing/foreign/expired | `api.test.ts` ownership, `accounts.test.ts` "another account cannot…" |
| T2 | IDOR on payment orders | Orders filtered by `user_id`; 404 otherwise | `payments.test.ts` "orders are private" |
| T3 | CSRF on mutations | Same-origin `Origin` required for every non-GET `/api/*` (webhook excepted and harmless: it only triggers an inquiry); cookies `SameSite=Lax`, `HttpOnly`, `Secure` | `api.test.ts` Origin tests, `links.test.ts` |
| T4 | Login CSRF / code injection / replay | OIDC state bound to an HttpOnly cookie and to the guest session, one-time transaction (`used_at`), PKCE S256, nonce, iss/aud/exp checks, exact redirect URI | `accounts.test.ts` (attacker browser, replay, wrong aud/iss/nonce/expiry, PKCE mismatch) |
| T5 | Free-credit farming | Free units only for a verified Google `sub`; one activation grant per account (PK on `free_grants`); cap 2 with holds counted; per-IP session-creation limit; Turnstile; service-wide daily provider ceiling | `accounts.test.ts` single grant across devices, race test |
| T6 | Double spend / race | Every unit movement is one D1 batch; check row = lease; conditional transitions; ledger UNIQUE(reason, ref, bucket) | 5-way race test: exactly 2 succeed, 2 provider calls |
| T7 | Silent paid spend | Paid bucket only with `credit=paid` + current `priceVersion`; otherwise 409 `PAID_CONSENT_REQUIRED` | `accounts.test.ts`, browser journey |
| T8 | Forged payment success | Redirect token and webhook are hints; only a server-to-server inquiry with our OAuth token marks paid; amount must match; credited once | `payments.test.ts` forged return/webhook, amount mismatch, replay |
| T9 | SSRF via link import | https/443 only, no credentials, internal names, private/reserved IPv4/IPv6 incl. embedded IPv4, DoH answers checked, every redirect re-checked, byte caps, rate limit | `links.test.ts` (unit 45, integration 18) |
| T10 | Prompt injection (ad text, image text, transcript) | Untrusted content fenced in `<ad_submission>`, closing tags neutralised (incl. transcripts); hard rules in the system prompt; server validation decides what is published (facts, evidence links, rule ids) | `api.test.ts` injection test, `video.test.ts` transcript fencing, eval fixtures f36/f37/v10 |
| T11 | Invented commercial facts | Fact ledger (value-level amounts, claim terms) over copy and alternates; repair then strip; price-conflict amounts removed from copy | unit tests; eval: 0 invented facts in published copy (V1 46-case baseline, V2 38-case run) |
| T12 | Fabricated sources | Model may cite rule ids only from the retrieved set; citations resolved from the registry server-side | unit test "cites only registry sources"; eval `citedUnknown: []` |
| T13 | Secrets in logs (public repo) | Values only via pipes into `wrangler secret put`; CI prints names only; error classification without content; `WRANGLER_LOG_SANITIZE` | deploy logs show `***` / names only |
| T14 | Media retention | Images re-encoded client-side and never stored; videos never uploaded (frames/audio processed in memory); reports expire after 7 days (cron) | privacy page; no R2 bucket used |
| T15 | Cost exhaustion | Turnstile before reservation; per-visitor/account quota; daily provider ceiling; billing refusal pauses analysis | B0 handling test, ceiling test |
| T16 | Upload abuse (size/type) | Body cap before parsing; magic-byte sniffing; HEIC refused; strict WAV parser; frame limits | `api.test.ts`, `video.test.ts` |

Residual risks
- DNS rebinding TOCTOU between the DoH check and `fetch` (mitigated by Workers' egress not reaching
  private networks).
- A determined user can create several Google accounts (Sybil); the daily ceiling bounds the cost.
- ZainCash webhook signature scheme unconfirmed — mitigated by never trusting webhooks.
- Account deletion is not self-service yet (reports can be deleted individually); deleting an
  identity would allow a second activation grant — a tombstone is planned (ROADMAP_V3).
