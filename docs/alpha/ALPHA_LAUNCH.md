# Project Alpha — iOS TestFlight launch package

Companion to `ALPHA_BASELINE.md` (repository truth as found) and
`ALPHA_STRATEGY.md` (the mobile-architecture decision and why). This
document is the operating reference: how the app is built, how it talks to
the backend, what was verified and how, what remains, and exactly what
requires the account owner.

## 1. Architecture, in one picture

```
Meta ──────────────────────────────────────────────────────────┐
                                                                  │
Adlytic Backend (unchanged authority)                            │
  Semantics · Brain · Evidence · Graphify · Brain Observatory     │
                          │                                       │
              Canonical DTOs (getDashboard.ts, campaignWhy.ts) ───┘
                    │                              │
                 Web App                        iOS App (mobile/)
           (server-rendered HTML)      (Expo/React Native, renders DTOs verbatim)
```

The iOS app is a new CLIENT, not a second backend. It imports zero business
logic from `src/`; it calls the same HTTP API the web app calls (plus two
additive endpoints, both projections of existing canonical output — see
§3).

## 2. Why native RN/Expo, not a WebView shell

Full reasoning in `ALPHA_STRATEGY.md`. The short version: `src/web/` is
server-rendered HTML template literals, not a React app — there is no
frontend component tree to wrap. Meta's OAuth dialog refuses to complete
inside an embedded WebView (Apple's own `ASWebAuthenticationSession` is the
sanctioned mechanism), and `getDashboard.ts`'s own header names "the future
mobile app" as a design target for its DTO. A WebView shell would satisfy
none of the above and would fail Apple's Guideline 4.2 minimum-functionality
review besides.

## 3. Backend changes (additive, no migration, no schema change)

| Change | File | What it does | What it does NOT do |
|---|---|---|---|
| Customer Why | `src/services/campaignWhy.ts` (new), `GET /api/workspaces/:id/campaigns/:id/why` | Projects the existing `buildBrainObservatory()` snapshot into a customer-safe, Arabic-localized shape | Computes no metric, decides no problem class, invents no confidence |
| iOS OAuth return | `src/lib/mobileClient.ts` (new), `client=ios` param on `/api/meta/oauth/start`, `oauth_states.payload` | Lets the callback redirect to `adlytic://meta/connected` instead of a web page | Never lets the caller name an arbitrary redirect URL (closed set of 2 app-owned destinations) |

Both verified live against a locally booted server (Postgres 16 + Redis) —
see §7.

## 4. Mobile app structure (`mobile/`)

```
src/api/        client.ts (the only fetch() call), errors.ts, types.ts (hand-mirrored DTOs), useApiData.ts
src/auth/       session.ts (Keychain), AuthContext.tsx, WorkspaceContext.tsx
src/components/ Screen.tsx, States.tsx (loading/error/empty — the ONLY renderers for these), Metric.tsx (the ONLY place a KPI is formatted)
src/screens/    Login, Home, Campaigns, CampaignDetail, Why, MetaConnect, Account
src/navigation/ RootNavigator (auth switch) → MainNavigator (tabs + stack)
src/theme/      tokens.ts — mirror of src/ui/tokens.ts, drift-checked by test_mobile_contract.ts
src/i18n/ar.ts  APP CHROME ONLY — never a merchant-facing vocabulary (that stays server-side)
src/observability/log.ts — console + POST /api/client-errors, redacts ids, never a token
```

## 5. Authentication

Bearer JWT only — matches `src/api/adapter.ts`'s documented "no cookie
fallback" contract. Token lives in iOS Keychain via `expo-secure-store`
(`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), never `AsyncStorage`, never logged.

- **Cold start**: read Keychain → `GET /api/auth/me` → only then show the
  app as signed in. A stale/invalid token never renders a signed-in frame.
- **Any 401**: `AuthContext`'s `onUnauthorized` clears the Keychain and
  drops to the login screen — the SAME path a manual logout takes. Verified
  live: a password change (which bumps `tokenVersion`) correctly 401'd the
  old token on the very next request.
- **Inactive account** (`isActive: false` — new registrations start
  pending manual activation): a distinct state, not folded into "wrong
  password" (`ar.accountInactive`).
- **Account deletion**: `AccountScreen` calls the existing
  `DELETE /api/auth/account` behind a native double-confirm. Required by
  Apple 5.1.1(v) wherever an app can be used to access an account, in-app
  creation or not — this app doesn't offer in-app registration, but it
  does authenticate existing accounts, so the deletion path ships anyway.

## 6. Meta OAuth on iOS

```
App → GET /api/meta/oauth/start?workspaceId=X&client=ios
    → { url } or { sessionId } (dialog-skip paths)
    → WebBrowser.openAuthSessionAsync(url, "adlytic://meta")   [ASWebAuthenticationSession]
    → Meta ⇄ Adlytic backend (unchanged handshake)
    → 302 adlytic://meta/connected?session=... | adlytic://meta/error?reason=...
    → GET /api/meta/oauth/accounts/:sessionId → pick account
    → POST /api/meta/oauth/connect {sessionId, externalAccountId, workspaceId}
```

The Meta access token never reaches the device — only a one-time,
server-side session id crosses the wire, and `/connect` still re-checks
`session.userId === caller` before it is redeemable. Cancel, deny, and
zero-granted-accounts are three distinct, honestly-worded states
(`ar.metaCancelled` / `metaDenied` / `metaNoAccounts`), not one generic
"connection failed."

**Verified live** (§7): the mock-callback's `302` `Location` header was
inspected directly with `curl -D -` and confirmed byte-for-byte as
`adlytic://meta/connected?session=<id>` — the exact string
`expo-linking`'s `Linking.parse()` expects.

**Not verified**: the real Facebook OAuth dialog and
`ASWebAuthenticationSession` itself — both require, respectively, an
approved Meta app (`META_APP_ID`/`META_APP_SECRET`, currently unset even in
production per `/api/meta/oauth/start`'s own `configured:false` response)
and a physical device or iOS simulator (neither available in this
sandbox). The mock-mode substitute proves the URL contract; it does not
prove Safari's native behavior.

## 7. What was verified, and how

No macOS/Xcode/simulator/device exists in this sandbox. In their place:

| Layer | Method | Result |
|---|---|---|
| Backend regression | `npm run test:all` (55 suites) | 0 failures |
| Route authorization | `test_route_authz.ts` | 119 routes, all resolve identity or are justified public |
| Deploy/secret boundary | `test_deploy_gate.ts` | 67/0 |
| Mobile contract | `test_mobile_contract.ts` (new) | 9/0 — negative-tested: each of its 3 structural checks was proven to actually fail on a planted regression before being trusted |
| Mobile typecheck | `npx tsc --noEmit` (mobile/) | 0 errors |
| Native project generation | `npx expo prebuild --platform ios` | Clean, zero warnings, correct bundle id / scheme / ATS / encryption-compliance keys in the generated `Info.plist` and `.xcodeproj` |
| **Live journey** | Real Postgres 16 + Redis, `npx tsx src/api/serve.ts`, `META_MOCK_AUTH=true` | register → (manual activation) → `/api/auth/me` → empty dashboard → OAuth start (`client=ios`) → mock callback → **redirect URL confirmed** → accounts → connect → populated dashboard → campaigns (3, real Arabic KPI labels) → campaign detail → `/why` (full 6-stage chain, correct REACHED/NOT_REACHED short-circuit) → password change → **old token correctly rejected** → re-login |

Two real defects were found and fixed by this live run (both detailed in
the commit that introduced them and in §9): `dashboard.campaigns` being a
permanently-empty field, and a confidence-vocabulary mismatch in
`campaignWhy.ts`. Neither would have been caught by typecheck or the
static suites alone — this is the value of actually booting the thing.

## 8. Environment variables

**Mobile** (`mobile/app.json` → `expo.extra.apiUrl`, overridable via
`EXPO_PUBLIC_API_URL` at dev time): none of substance beyond the API base
URL. No secrets are baked into the client bundle — there are none to bake;
the Meta token and JWT secret never leave the server.

**Backend**: no new variables. The additive endpoints use existing
infrastructure (`oauth_states.payload`, already-deployed `campaignWhy.ts`
imports). `META_MOCK_AUTH` (existing, currently unset in production per
`.env.example`) is what let this session verify the OAuth contract without
real Meta credentials — it must stay unset in production; do not enable it
there (it would let anyone synthesize a Meta-connected session).

## 9. Data truth — preserved, not reinterpreted

Every screen renders the DTO's own `display` string or the honest absence
label; `Metric.tsx`'s header states the rule and `test_mobile_contract.ts`
greps for the specific regression shape (`?? 0` on a canonical field). The
`/why` chain reports `NOT_REACHED` stages exactly as the Brain's own
`hierarchy.ts` short-circuits them — never back-filled with a guess. Two
issues found and fixed while proving this, both root-caused against the
actual backend code before touching anything:

1. **`dashboard.campaigns` / `bestCampaign` / `worstCampaign` are always
   empty** — `buildCampaignCards()` requires a CAMPAIGN-level
   `health_scores` row; tracing every `HealthScoreEngine.run()` call site
   (`runEngines.ts`, `refreshEngine.ts`) shows all of them score
   `EntityType.ACCOUNT` only. This is a pre-existing gap in the shared
   backend (the web dashboard's own best/worst-campaign cards read the
   identical fields), not something Alpha introduced. **Fixed on the
   mobile side** by pointing the Campaigns tab at
   `GET /api/workspaces/:id/campaigns` — the same endpoint the web
   client's own campaigns list already uses, which computes its KPI cards
   live and has no such dependency. **Not fixed at the source** (see
   POST_ALPHA below) — Alpha's own journey no longer needs that fix once
   routed around it, and the underlying fix touches the shared production
   sync pipeline for every account, a wider blast radius than this
   mission's scope.
2. **Confidence-vocabulary conflation** — `campaignWhy.ts` mapped
   `semantics.classificationConfidence` (`CONFIRMED`/`INFERRED`/
   `EVIDENCE`/`UNKNOWN`, per `analytics/confidence.ts`) through the SAME
   Arabic lookup table built for the diagnosis/anomaly `Verdict` enum
   (`HIGH`/`MEDIUM`/`LOW`/`INSUFFICIENT_DATA`), silently dropping the
   value to `null`. Fixed with a second, correctly-scoped table. Re-verified
   live before commit.

## 10. Privacy — what the app actually does

| Data type | Collected? | Purpose | Where computed | Device-stored? | Linked to user? | Tracking (ATT)? |
|---|---|---|---|---|---|---|
| Email, name | Yes (existing account) | Auth, identity | Server | No | Yes | No |
| Password | Yes, at login only | Auth | Server (bcrypt) — never stored/logged on-device | No | Yes | No |
| Auth token (JWT) | Issued at login | Session | Server-issued | **Yes** — iOS Keychain only | Yes | No |
| Meta ad account data (spend, campaigns, KPIs) | Yes, read-only | The product itself | Server (Meta Graph API) | No — fetched per screen, not persisted on-device | Yes (via workspace) | No |
| Meta access token | **No** | — | Stays server-side, encrypted at rest (AES-256-GCM) | **Never on-device** | — | No |
| Crash/error signals | Yes (path + error kind + status only) | Diagnostics | Client → `POST /api/client-errors` (existing, rate-limited) | No | No (anonymous unless a bearer token happens to be attached; never a body/header/email) | No |
| Device identifiers | **No** | — | — | — | — | No |
| Third-party analytics SDK | **No** | — | — | — | — | No |

**No cross-app/cross-site tracking exists.** App Tracking Transparency
(`AppTrackingTransparency`/`NSUserTrackingUsageDescription`) is correctly
**not** requested — nothing here tracks the user across other apps or
websites, and requesting it unnecessarily is itself an App Review flag.

## 11. Apple review risks — assessed

| Risk (from the mission's own checklist) | Status |
|---|---|
| Broken login | Verified live against a real server (§7) |
| Demo account for the reviewer | **Not resolved — owner action required.** A reviewer without a real Meta Business ad account will hit an honest empty state on Connect Meta, not a crash — but cannot see the populated product. See §13. |
| Misleading privacy declarations | §10 is the literal App Store Connect privacy-label mapping; nothing here is aspirational |
| Account creation without deletion | App has no in-app registration, but DOES support deletion of an existing account (§5) — the stricter posture |
| Hidden functionality / placeholder screens | None — every screen in the IA either renders real data or an honest empty/error state |
| Unstable OAuth | Contract verified live (§7); the live Facebook dialog itself is unverified pending `META_APP_ID`/`META_APP_SECRET` and a real device |
| Crash on launch | `expo prebuild` clean; cold-start auth restore has a try/catch around every Keychain read (never throws) |
| Incorrect permission prompts | App requests **zero** iOS permission dialogs (no camera/location/contacts/tracking) — nothing to get wrong |
| Sign in with Apple (4.8) | **Does not apply** — Meta OAuth here is a business ads-data connection, not an identity/login provider for the app itself. Worth stating in App Store Connect review notes proactively, since a reviewer unfamiliar with ad-tech apps may ask |
| Web-wrapper with insufficient value | Moot — this is not a web wrapper (§2) |

## 12. Scope triage

**ALPHA_P0 remaining** (would block a meaningful TestFlight build):
- Apple Developer Program membership + App Store Connect app record — see §13. Nothing else in this list is blocked on more engineering; all of it is blocked on this one external precondition.

**ALPHA_P1 remaining** (installable, but should close before calling Alpha done):
- Verify on a real device or the iOS simulator once a build exists — the whole `expo prebuild` / typecheck / live-server verification in this sandbox is the strongest substitute available, but it is a substitute, not the real thing (rule 25's own standard).
- A demo Meta-connected workspace + review notes for the App Store Connect reviewer (§13).
- Screenshots for the App Store listing — need a real device/simulator to capture; none available here.

**POST_ALPHA debt** (real, recorded, deliberately not fixed here):
- `HealthScoreEngine` is never called at `EntityType.CAMPAIGN` anywhere in the codebase, so `dashboard.bestCampaign`/`worstCampaign` (used by the WEB dashboard too) are permanently empty. One-line-of-intent fix: call the same engine once more per active campaign inside `runEngines.ts`'s post-sync hook. Not fixed here because it touches the shared production sync pipeline for every account and Alpha's own journey no longer depends on it (§9).
- Full `I18nManager.forceRTL` native layout mirroring (nav gesture edge, icon mirroring) is deferred — see the commit message on the mobile-foundation commit for why (the native flag only applies on an app's SECOND launch, unverifiable without a real device in this sandbox, and risky to ship unverified on a reviewer's first impression). Arabic text already renders correctly RTL-shaped everywhere (intrinsic to the script); only the chrome-level mirror is deferred.
- Mobile push notifications / "Attention" tab — the mission explicitly says not to fabricate notification infrastructure that doesn't exist; none does, so none was built.
- Workspace switcher is minimal (a flat list) — fine for the near-universal one-workspace-per-user case (`POST /api/auth/register` creates exactly one), not tested against a many-workspace account.
- App icon/splash are a redraw of the existing peak/chart glyph in the current Daylight palette, not new design work commissioned from a designer — reused the established identity per the mission's own instruction not to start a rebrand.

## 13. External blockers — exact actions needed from the account owner

None of these are things more engineering time resolves. Continuing to
work around them would mean fabricating status, which the mission
explicitly prohibits.

1. **Apple Developer Program membership** (or access to an existing one).
   Needed for: an App Store Connect app record, a bundle-id registration
   for `net.adlytic.app`, and TestFlight itself.
2. **An Expo/EAS account** (free tier is sufficient) — `npx eas login`,
   then `npm run build:ios:testflight` from `mobile/`. EAS builds run on
   Expo's own macOS cloud infrastructure, so **no local Mac is required**
   for this step specifically — only the account and, for signing, either
   an Apple ID login EAS can use to auto-manage credentials, or a manually
   supplied distribution certificate + provisioning profile.
3. **An App Store Connect API key** (recommended) or Apple ID credentials,
   filled into `mobile/eas.json`'s `submit.production.ios` block, for
   `npm run submit:ios` to upload the build non-interactively.
4. **A decision on the reviewer demo path** (§11/§12): either provide a
   demo Adlytic account whose workspace already has a real (or
   controlled, non-production) Meta ad account connected, or write App
   Store Connect review notes explaining that Meta connection requires a
   business ad account and offering a walkthrough video instead. This is
   a product/support decision, not an engineering one.
5. **`META_APP_ID` / `META_APP_SECRET`** are unset even in production
   today (`/api/meta/oauth/start` returns `configured:false` and falls
   back to manual-token entry) — orthogonal to Alpha, but the live Meta
   OAuth dialog cannot be exercised by anyone, reviewer or otherwise,
   until Meta App Review approves the app for `ads_read` and these are
   set. Pre-existing, not new.

Everything else in the 48-hour mission that did **not** depend on the
above has been completed and verified to the standard §7 describes.
