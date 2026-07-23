# Adlytic — Meta App Review / Reviewer Flow

This document is the step-by-step walkthrough a Meta App Reviewer (or an
internal tester) follows to exercise the full permission we request. Adlytic is
**read-only**: it requests **`ads_read` only** and never `ads_management`. The
product reads ad-account performance metrics and displays analytics — it does
not create, edit, pause, or delete anything on Meta.

---

## 0. What to send Meta in the App Review form

- **Privacy Policy URL:** `https://<your-domain>/privacy`
- **Data Deletion Instructions URL:** `https://<your-domain>/data-deletion`
- **Data Deletion Callback URL:** `https://<your-domain>/api/meta/data-deletion`
- **Permission requested:** `ads_read` (read-only)
- **Test credentials:** provide a **pre-activated** reviewer account
  (email + password). See the activation note in Step 1.

Paste the numbered steps below (Steps 1–6) into the "How will you use this
permission?" / reviewer-instructions field.

---

## 1. Log in

1. Go to `https://<your-domain>/login`.
2. Enter the reviewer email and password provided in the submission.
3. You land on the dashboard shell.

> **Activation note:** New sign-ups are gated by a manual activation step, so a
> freshly self-registered account cannot log in until activated. **Always hand
> Meta a reviewer account that has already been activated.** Do not ask the
> reviewer to register a new account.

---

## 2. Connect a Meta ad account

1. Right after login you land on the onboarding page `/welcome`. Click the
   **Connect with Meta** button. (You can also connect later from the
   **Workspace** page at `/workspace` via the **Connect Meta Ads** button.)
2. Adlytic calls `GET /api/meta/oauth/start` and redirects you to Facebook's
   OAuth consent screen. The only permission requested is **`ads_read`**.
3. Approve. Facebook redirects back to Adlytic
   (`/api/meta/oauth/callback`), which exchanges the code for a long-lived
   token, encrypts it (AES-256-GCM), and stores it scoped to your workspace.

> **Reviewer sandbox option:** If the reviewer cannot or should not link a live
> Business, run the demo instance with `META_MOCK_AUTH=true`. The Connect Meta
> button then routes through an internal mock callback that seeds a realistic
> read-only dataset — the reviewer sees the exact same screens without touching
> a real Meta account. This mode is **off by default** and must be explicitly
> enabled.

---

## 3. Choose an ad account

1. After the callback, Adlytic lists the ad accounts the token can **read**.
2. Select one ad account to link to your workspace.
3. Adlytic kicks off an initial read-only backfill of that account's daily
   insights.

---

## 4. View the dashboard

1. Open **Dashboard** (`/dashboard`).
2. You see aggregated, read-only performance: spend, impressions, reach,
   clicks, CTR, CPC, CPM, ROAS, and lifetime totals — all fetched via the
   Marketing API **Insights** endpoints.

---

## 5. View campaigns & insights

1. Open **Campaigns** (`/campaigns`).
2. Drill into a campaign to see per-campaign metrics and detected issues /
   recommendations. Everything shown is **analysis of read data** — no control
   actions are offered or possible.

---

## 6. Verify read-only scope (optional but recommended)

- There is **no** button anywhere in the product to pause, edit, duplicate,
  raise/lower budgets, or delete a campaign, ad set, or ad on Meta. Adlytic has
  no write path to the Marketing API.
- The requested scope on the consent screen is `ads_read` only.

---

## Data handling summary (for the reviewer)

- **Scope:** `ads_read` (read-only). Never `ads_management`.
- **What we store:** aggregated ad-account performance metrics and entity
  metadata (campaign/ad set/ad names, statuses). Access tokens are encrypted
  at rest (AES-256-GCM) and are never logged or exposed.
- **What we do NOT do:** we do not build custom audiences, do not use data for
  ad targeting, do not train models on it, and do not resell it.
- **Isolation:** every workspace's data is isolated; a member of one workspace
  can never read another workspace's data (enforced on every workspace route).
- **Deletion:** users can disconnect an ad account at any time from the
  **Workspace** page (`/workspace`) via the per-account **✕ Disconnect** button,
  and Meta's data-deletion callback is implemented at
  `/api/meta/data-deletion`. See `/data-deletion` for full instructions.
- **Lifecycle audit:** connect, disconnect, token-expiry, and reconnect-required
  events are recorded to an internal audit log for operational transparency.
