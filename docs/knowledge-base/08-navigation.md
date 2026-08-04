# 08 — Navigation

## Shipped product (`dawai-platform`)

Single-page React app, one router (`src/app/router.tsx`) covering all three roles inside one bundle. Role isolation is **not structural** (one build, route-level gating via `PharmacyGate`-style wrappers and server-enforced auth) — contrast this explicitly with Blueprint v3's stance below. Session state lives in `app/SessionContext.tsx`; `app/useApi.ts` wraps `api/client.ts` for typed calls. There is no native app yet; `docs/dawai/APP_STORE_READINESS.md` recommends a Capacitor remote-URL shell (loads the production web origin inside a native wrapper) as the fastest path to iOS packaging, keeping cookies/CSRF/CSP unchanged, with a documented fallback (bundled `dist/` + Bearer token in iOS Keychain) if an offline-capable native bundle is later required.

Deep-linking readiness: routes are already URL-addressable and the backend has no cookie-only dependency (Bearer token supported), which `ARCHITECTURE.md` "Mobile conversion" section lists as a deliberate design property — coordinates are numeric API fields, countdowns use server timestamps, camera uploads use multipart, push providers consume the existing outbox — specifically so no backend rewrite is needed to go native.

## Blueprint v3 navigation architecture (`docs/technical/07-mobile-navigation.html`, `platform/packages/navigation/`) — design target for `platform/`, not yet the shipped app

**Core philosophy: role isolation is structural, not a runtime branch.** *"Role isolation is achieved by shipping different navigators, not by branching inside one. A patient build contains no pharmacy route, so the class of leak that v1 hit twice is unrepresentable."* Three separate React Native builds are specified: Patient, Pharmacy, and Owner Console (the latter is web-only, not RN).

### Patient navigator
`RootNavigator` (a switch, not a stack) → `GuestNavigator` | `AuthNavigator` | `AppNavigator`. Inside `AppNavigator`, three independent tab stacks (each keeps its own back-stack and restores position on return): `Today` (TodayStack), `Find` (FindStack, screens F1→F8), `Me` (MeStack, M1…M15 + S4…S11 + R12/R13). Full-screen and sheet modals sit above tabs and never lead *into* a tab: `R1` Build request (owns R2–R11 and V1), `S2` Subject switcher, `R13` Queued actions.

Route guards: `requireSession` (redirects a guest hitting a session-only route to E4, storing the intent and replaying it after auth — never discarding it); `requireSubjectScope` (client hides what the server would refuse anyway — "the guard is convenience, never enforcement", §5 rule 1); `blockMemorialised` (a memorialised Subject cannot start a Request or a Watch).

Deep links: `dawai://reservation/{id}` → pushes the Today stack with `S1` beneath so back is never a dead end; `dawai://request/{id}`, `dawai://grant/{id}`, `dawai://watch/{id}` similarly resolve into the correct stack, never a bare orphan screen (nav rule carried forward from a v1 defect).

### Pharmacy navigator
`RootNavigator` → `ApplyNavigator` (PA1–PA9, unverified applicants land only here) | `StaffAuthNavigator` (P1, P2 — per-person PIN) | `BranchNavigator` (three tabs: Requests/InboxStack, Reservations/HoldStack, Branch/BranchStack). Guards: `requireStaffSession` (30-min idle timeout — the device sits on a shared counter), `requireManager` (assistant/pharmacist see branch settings read-only), `requirePharmacist` (the substitution control is *absent*, not disabled, for non-pharmacists — "a disabled control invites a workaround"), `requireVerified`.

### Owner console
Plain web routing, `O1–O24`, `requireOperator` guard — no other principal has a route here.

### Rules that apply to every v3 navigator
Three separate builds (verified by an import-check at build time per `docs/technical/10-release-architecture.html`); a notification always resolves to a full stack, never a bare screen with no parent; every tab keeps independent state; a modal returns only to its opener; deep links are verified against the session before resolving — an unauthorized link lands on the guest home, never on an error page.

## `@dawai/navigation` package (`platform/packages/navigation/src/{graph,guards,flow}.ts`)

The concrete implementation backing the above: `graph.ts` encodes the navigator/stack/screen graph (with `graph.test.ts` asserting graph integrity — no orphan screens, no unreachable modal), `guards.ts` implements the named guards as composable predicate functions (`guards.test.ts`), `flow.ts` likely sequences multi-step flows like the request-build modal (R1–R11). This package has no dependency on React Native itself — it's pure navigation-graph logic, consumed by `platform/apps/patient`.

## Practical guidance

If/when `platform/apps/patient` (or a future pharmacy/owner app on the same stack) is wired into a real deployment, **do not** retrofit `dawai-platform`'s single-bundle routing to match — the two navigation philosophies are intentionally different (single web SPA vs. structurally-separated native builds) and mixing them would undermine the exact leak-prevention property v3's navigation architecture exists to guarantee.
