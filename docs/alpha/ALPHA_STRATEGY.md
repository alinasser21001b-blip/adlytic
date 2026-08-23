# Project Alpha — Mobile strategy decision

```text
ALPHA_MOBILE_STRATEGY=React Native (Expo SDK 54, prebuild-capable) — API-first
                      native iOS client of the existing Adlytic backend.
```

## WHY

The brief told me to evaluate a native shell around "existing web surfaces". I
inspected those surfaces first, and the evidence rules that option out:

**1. There is no web application to reuse.** `src/web/` renders HTML from
TypeScript template literals. There is no React tree, no bundler, no component
library, no client state layer. "Reusing the web" would not be code reuse — it
would be putting an `iframe` in an app shell. The reusable asset in this
repository is the **API and its DTOs**, and a native client consumes those
better than a WebView does.

**2. `getDashboard.ts` was already written for this.** Its file header:

> *"THE PRODUCT BOUNDARY. Everything downstream consumes this one function: the
> web dashboard, **the future mobile app**, PDF reports, alerts…"*

The DTO is presentation-ready and **localized server-side**: every KPI carries a
`display` string, every issue a localized `title`/`causes`/`recommendations`,
`priorityAction.text` is finished Arabic prose. A renderer that prints those
fields re-derives nothing. That is not a happy accident — it is the boundary
this codebase spent its previous program building. Alpha consumes it.

**3. Meta refuses embedded WebViews.** Facebook Login rejects logins started
inside an app-embedded browser. A WebView shell therefore **cannot complete the
Meta connection at all** — an Alpha-P0 breaker, not a polish item. The only
Meta-sanctioned mobile path is a system authentication session
(`ASWebAuthenticationSession`, reached through `expo-web-browser`), which needs
a native app.

**4. The API is already a native-client API.** `src/api/adapter.ts`:

> *"Protected routes accept credentials from exactly ONE source: `Authorization:
> Bearer <token>`. There is deliberately no cookie fallback."*

A bearer-token client with Keychain storage is what this API was shaped for. A
WebView would instead re-import the browser's `localStorage` token — failing the
"sensitive tokens must use secure device storage" requirement.

**5. Apple review.** A WebView wrapper over server-rendered pages is the textbook
Guideline 4.2 (minimum functionality) rejection. A native client that fetches
JSON and renders native views is not.

## REJECTED_ALTERNATIVES

| Option | Rejected because |
|---|---|
| **B — native WebView shell over existing web surfaces** | Meta blocks OAuth in embedded WebViews (P0). Token would live in WebView `localStorage`, not the Keychain. Guideline 4.2 review risk. "Reuse" would be zero real code reuse — the web is HTML strings, not components. |
| **C — hybrid (native chrome + WebView content)** | Inherits every WebView problem above for the content it embeds, and *adds* a token-bridging surface between native storage and the WebView — a new exposure the pure-native option simply does not have. |
| **D — Swift/SwiftUI native** | Would be defensible, but cannot be built, typechecked or tested at all in this Linux sandbox, and would put the client in a language no part of this repository shares. RN keeps the client in TypeScript, so the API DTO types are *imported*, not re-typed — see the contract test. |

## Consequences, stated as numbers

```text
EXPECTED_REUSE_PERCENTAGE=100% of intelligence, semantics, localization,
    period truth, confidence and evidence — all of it stays server-side and is
    consumed verbatim. 0% of it is reimplemented on the device.
NEW_NATIVE_SURFACE_PERCENTAGE=100% of presentation (screens, navigation,
    typography, RTL layout, error/empty/loading states) is new and native.
BACKEND_CHANGES_REQUIRED=3, all additive, none structural:
    1. GET /api/workspaces/:workspaceId/campaigns/:campaignId/why
       — customer-safe projection of the EXISTING buildBrainObservatory()
         snapshot. Adds no intelligence; strips engineering provenance.
    2. GET /api/meta/oauth/start?client=ios
       — records the calling channel in oauth_states.payload (a column the
         schema already declares "reserved for future per-flow data"), so the
         callback can hand control back to the app. NO MIGRATION.
    3. .dockerignore — keep mobile/ out of the production build context.
DATABASE_SCHEMA_CHANGED=NO
NEW_MIGRATIONS=0
ADMIN_CONTROL_PLANE_CHANGED=NO
```

## The architectural rule this obeys

```text
MOBILE_REDERIVES_META_METRICS=NO
MOBILE_REDERIVES_PERIOD_TRUTH=NO
MOBILE_REDERIVES_BRAIN_LOGIC=NO
MOBILE_REDERIVES_CONFIDENCE=NO
MOBILE_CREATES_SECOND_RECOMMENDATION_ENGINE=NO
MOBILE_CREATES_SECOND_GRAPH_ENGINE=NO
```

Enforced, not promised: `test_mobile_contract.ts` fails the build if the mobile
source contains arithmetic on canonical metrics, a `?? 0` on a nullable metric,
or a second copy of a threshold the backend owns.
