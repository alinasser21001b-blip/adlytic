# 07 — Screen Catalog

## A. Shipped screens — `dawai-platform/src/pages/*.tsx`

One file per audience; components exported per screen, routed in `src/app/router.tsx`. These are the real, running UI.

### `PublicPages.tsx`
- **WelcomePage** — unauthenticated landing; entry to auth/legal.
- **AuthPage** — combined login/register; role selection is presentation-only (server enforces role).
- **PasswordResetPage** — request + confirm reset flow (`/api/v1/auth/password-reset/*`).
- **LegalPage** — privacy/terms/pharmacy-terms content (referenced as needing lawyer-approved text before App Store submission — `docs/dawai/APP_STORE_READINESS.md` §5).

### `PatientPages.tsx`
- **PatientHomePage** — dashboard/entry; likely surfaces the Pill Bar (`components/PillBar.tsx`) and active requests.
- **MedicineSearchPage** — search-not-request; queries `/api/v1/medicines/search`, `/availability`.
- **NearbyPharmaciesPage** — browse verified branches (`/api/v1/pharmacies*`), independent of an active request.
- **NewRequestPage** — the request wizard: medicine identification, optional photo, quantity/urgency, location, radius; submits `POST /patient/requests`.
- **RequestDetailPage** — one request's dispatch/offer state; entry to comparing and selecting an offer.
- **RequestHistoryPage** — list of past/active requests (`GET /patient/requests`).
- **ReservationPage** — the post-selection hold view: countdown, directions, contact, chat (once ACKed), cancel action.
- **SavedPharmaciesPage** — bookmarked branches.
- **NotificationsPage** — durable notification inbox.
- **PatientProfilePage** — profile edit, notification preferences, account deletion entry point.

Related but not in this file: family-proxy and dose-schedule UI is implied by the `clinical.ts` route surface but no dedicated `src/pages` file for it was found in the listing — see `17-known-limitations.md` (the clinical timeline/attention UI may be partially built into `PatientHomePage`/`TimelinePages.tsx`; verify against current `TimelinePages.tsx` before assuming it's absent).

### `TimelinePages.tsx`
Present as a separate file from `PatientPages.tsx` — its narrow name and separation from the main patient page set strongly suggests it renders the clinical adherence timeline (`GET /api/v1/clinical/timeline`) called out as "live and typed; screens are next" in `docs/dawai/BLUEPRINT_EXECUTION.md` remaining-work item 5. Confirm exact content by reading the file directly before building on it — not fully enumerated in this pass.

### `PharmacyPages.tsx`
- **PharmacyGate** — role/verification gate wrapping all pharmacy screens (unverified applicants presumably see only onboarding).
- **PharmacyOnboardingPage** — business/branch/license registration.
- **PharmacyDashboardPage** — metrics + at-a-glance state.
- **PharmacyInboxPage** / **PharmacyRequestPage** — ranked request list and single-request detail with offer composer.
- **PharmacyReservationsPage** — ACK/ready/complete/fail/no-show actions.
- **PharmacyInventoryPage** — passive ledger view + movement entry (`POST /pharmacy/inventory/movements`), on-hand display.
- **PharmacySettingsPage** — hours, pickup/delivery toggles, `accepting_requests` pause.

### `AdminPages.tsx`
- **AdminDashboardPage** — pilot metrics (7-day targets: reservation→pickup rate, median first-offer latency, matchable-with-offer rate, reservation success rate, confirmed-not-found rate, notifications-per-successful-request).
- **VerificationQueuePage** / **VerificationDetailPage** — pharmacy license review + approve/reject.
- **AdminUsersPage**, **AdminPharmaciesPage** — suspend/restore actions.
- **AdminRequestsPage** / **AdminRequestTracePage** — request → dispatch → offer → reservation trace, with the "no exact coords/emails/raw SELECT *" hardening applied (`FINAL_MVP_READINESS.md`).
- **AdminReportsPage** — user-filed report triage.

## B. Blueprint v3 screen catalogue (`docs/design/SCREEN_INVENTORY.md`) — for the `platform/` track only

Generated from `docs/product/v3/phase0.js`, **not** from `dawai-platform`. Summary stats as of the doc: **133** Blueprint v3 Phase 0 screens named; **22** have an engineering contract; **17** rendered/photographed; **111 NOT IMPLEMENTED**; **9** exits declared but BLOCKED (waiting on the 11 Blueprint gaps BD-1…BD-11, see `19-open-decisions.md`).

Screen groups (from the v3 nav model, `docs/technical/07-mobile-navigation.html`): `E` (Entry, ~E1–E13), `S` (Subjects, S1–S12 — e.g. `S1` "اليوم/Today"), `F` (Find, F1–F8), `R` (Request, R1–R13), `V` (Reservation, V1–V8), `M` (Account/Me, M1–M15) for Patient; `PA` (Apply, PA1–PA9) and `P` (Pharmacy ops, P1–P31) for Pharmacy; `O` (Operator, O1–O24) for Owner Console.

`platform/apps/patient/src/screens/*.tsx` implements a subset of the `F`/`R`/`V` groups concretely: **FindScreen** (F-group), **DraftScreen** (R-group draft composition), **PrescriptionScreen** (R-group prescription attach), **OffersScreen**/**OfferDetailScreen** (post-broadcast comparison), **ConfirmScreen** (accept), **ReservationScreen** (V-group hold view), **OnboardingScreens** (E-group). Each screen's engineering contract (required states: `loading/empty/offline/error/stale`, interactions, permissions) is documented per-screen in `docs/design/SCREEN_INVENTORY.md` Part 1 — read the entry for the specific screen before modifying it; the contract is generated and treated as a fixed/open split (FIXED = enforced by an automated check; OPEN = a real design decision still needed).

**Cross-reference note**: `SCREEN_INVENTORY.md`'s screen names (S1 "Today", F-group "Find", R-group "Request") do not correspond 1:1 to `dawai-platform`'s page names above — e.g. there is no v3-style dedicated "Today" screen in `dawai-platform`; its closest analog is `PatientHomePage`. Do not use `SCREEN_INVENTORY.md` as a spec for modifying `dawai-platform/src/pages/*` — build off the actual component and its routes instead, and treat `SCREEN_INVENTORY.md` purely as the `platform/` track's design contract.
