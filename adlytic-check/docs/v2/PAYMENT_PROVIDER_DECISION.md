# Payment provider decision

**Decision:** ZainCash Payment Gateway API v2, behind `PAYMENTS_ENABLED=false` until the owner
has a merchant account and API credentials. Status: **IMPLEMENTED + TESTED against a local fake
gateway; LIVE BLOCKED (B2).**

## Why ZainCash
- Customers pay from a ZainCash wallet without a bank card — the common case for the target
  shops' buyers. (No market-share figure is claimed; none was verified.)
- Published v2 API with server-to-server OAuth2 client credentials, an init → redirect flow and an
  inquiry endpoint (research S18).
- Alternatives not evaluated in depth this cycle: FIB (First Iraqi Bank) and Qi Card gateways.
  The adapter boundary (`PaymentGateway` in `worker/services/payments.ts`) keeps a second provider
  a contained change.

## What the integration trusts (and what it does not)
| Signal | Trusted? | Use |
|---|---|---|
| Redirect back to `/api/payments/return` with a `token` | **No** | Logged (hash only); triggers an inquiry |
| Webhook POST | **No** (signature scheme not confirmed in the docs we could read; webhooks are production-only and registered by ZainCash's business team) | Logged (hash only); triggers an inquiry |
| `GET …/transaction/inquiry/{id}` with our OAuth token | **Yes** | The only path that marks an order paid |

Credits are granted in one D1 batch guarded by `credited_at IS NULL` and the ledger's
UNIQUE(reason='purchase', ref=order) — replays, refreshes and duplicate webhooks cannot credit
twice. A paid amount that differs from the order is held (never credited) for manual review.
The daily cron reconciles pending orders (inquiry), expires abandoned ones after 48 h and checks
`paid_balance = SUM(ledger)` per account. It runs whenever the gateway credentials exist, so
setting `PAYMENTS_ENABLED=false` stops new orders but still credits customers who already paid
(tested by firing the real cron handler).

## Unverified details (must be checked against the full docs before going live)
- Exact JSON field names of init/inquiry responses (`data.transactionId`, `data.redirectUrl`,
  `data.currentStatus`, `data.amount`) and the success status literal. They are isolated in
  `zaincashGateway()`; the status mapper accepts SUCCESS/COMPLETED/PAID.
- Production base URL (`https://pg-api.zaincash.iq` assumed; UAT `https://pg-api-uat.zaincash.iq`
  is from the docs excerpt). `ZAINCASH_ENV` selects it.
- OAuth scope names (`payment:read` appears in the docs excerpt; `payment:write` assumed).
- Minimum transaction amount (a community package says 250 IQD; not confirmed).

## Going live (owner actions, no secrets in chat)
1. Open a ZainCash merchant account (the owner's decision and contract — not done by us).
2. Get UAT credentials first. Add repository secrets `ZAINCASH_CLIENT_ID`, `ZAINCASH_CLIENT_SECRET`.
3. A sandbox purchase on UAT with `PAYMENTS_ENABLED=true` and `ZAINCASH_ENV=uat`; verify the
   field names above; then production credentials, `ZAINCASH_ENV=production`, and one real
   purchase by the owner with a spending cap of the smallest bundle (2,500 IQD).
4. Ask ZainCash to register the webhook URL `https://adlytic-check.i6900612.workers.dev/api/payments/zaincash/webhook`.
