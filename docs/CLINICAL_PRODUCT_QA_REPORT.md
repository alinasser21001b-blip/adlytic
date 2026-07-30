# Qareeb Clinical / Product QA Report

**Audited baseline:** `main` at `2b4b4a8`  
**Primary product:** `hub/`  
**Audit date:** 2026-07-30  
**Purpose:** independent clinical, functional, identity, consent, data-integrity, mobile, RTL, and accessibility gate. Visual similarity to the prior UI was not evaluated.

## A. Protected Core Map

The protected boundary is defined in [`PROTECTED_CORE_MAP.md`](./PROTECTED_CORE_MAP.md).

The highest-risk modules are:

- identity, matching, encounter immutability, longitudinal lists, lab interpretation, episodes/tasks, and RBAC: `hub/js/emr.js`;
- consent, access decisions, emergency access, carry codes, and access audit: `hub/js/consent.js`;
- document claims, prescriptions, appointments, provider verification, and derived clinical brief: `hub/js/record.js`;
- orders, referrals, results, imaging, pharmacy envelopes, and minimum-necessary disclosure: `hub/js/network.js`;
- local-first outbox and conflict rules: `hub/js/sync.js`, `hub/js/transport.js`;
- server trust boundary: `hub/netlify/functions/_lib.mjs`, `_record-core.mjs`, `record.mjs`, `_needs-core.mjs`, `needs.mjs`, `auth.mjs`, `audit.mjs`.

Clinical presentation semantics in `ui-record.js`, `ui-network.js`, the router, and RTL CSS are also protected even though their visual design is not.

## B. Functional Baseline

The journey-by-journey baseline is in [`FUNCTIONAL_BASELINE.md`](./FUNCTIONAL_BASELINE.md).

Summary:

- The domain has strong executable coverage for identity matching, consent, immutable encounters, medications, allergies, results, episodes, pathology blockers, referrals, offline conflict handling, and server authorization.
- The current UI is mainly a same-browser prototype. Patient lookup, clinician record selection, verified actor onboarding, encounter authoring, cross-device patient authentication, and several network entry points are absent or incomplete.
- `qareeb-platform/` is a non-production medicine-availability simulation and is not a substitute for `hub/`'s clinical record.

## C. Regression Results

### Automated domain/server tests

| Gate | Result |
|---|---|
| `hub/npm test` | **462 passed, 0 failed** across 11 suites |
| Medicine demand loop | **37 passed, 0 failed** using the real Netlify Blobs local server |
| EMR | **81 passed, 0 failed** |
| Record/consent | **64 passed, 0 failed** |
| Longitudinal journey | **31 passed, 0 failed** |
| Full patient → second clinician acceptance | **56 passed, 0 failed** |
| Ecosystem/offline/referral/emergency | **60 passed, 0 failed** |
| Server record plane | **35 passed, 0 failed** |
| Import/data-shape gate | **14 passed, 0 failed** |

The first full-suite run failed because `test-e2e.mjs` claimed to substitute Blob storage but installed no substitute; every request failed closed with `503`. The harness was corrected to use `@netlify/blobs/server`. No product expectation was weakened.

### Secondary simulation

Using its supported Node `22.22.2` runtime:

- TypeScript check: pass.
- Vitest: **28 passed, 0 failed**.
- Vite production build: pass.
- Existing Playwright browser check: pass; no console error or horizontal overflow in its 360px, 390px, and desktop scenarios.

The default cloud Node `22.14.0` is below jsdom's declared engine range and produces three cross-realm WebCrypto failures. This is an environment incompatibility, not a product assertion failure.

### Release preflight

`npm run preflight -- --release` correctly blocks release:

- `PLACEHOLDER_NUMBERS`: 55 records;
- `SYNTHETIC_DATA`: pharmacies, doctors, medicines, and signals;
- 33 facilities appear verified without verification date/licence evidence;
- emergency number `911` still requires independent verification.

### Independent browser gate

`hub/tools/qa-browser.py` performed **48 route/viewport checks** over 16 patient, clinician, consent, facility, and settings routes at 320px, 390px, and 430px.

Result: **2 P0, 3 P1, 2 P2** reproduced by the browser gate.

Passed checks:

- no horizontal overflow at 320/390/430px for the long mixed Arabic/English clinical fixture;
- no effective touch target below 44×44px;
- no duplicate IDs;
- Arabic root remained `lang=ar`, `dir=rtl`;
- route changes moved focus to `#app`;
- no unexpected browser exceptions.

## D. Clinical Safety Audit

### Preserved in the domain

- Numeric lab values retain units, reference bounds, performer, dates, and flags.
- No reference range produces `unknown`/unjudgeable, not normal.
- Abnormal results without acknowledgement create persistent tasks.
- Mixed laboratories/units are marked non-comparable.
- Current, stopped, completed, and unconfirmed medication states remain distinct.
- Allergy identity/reaction/criticality/verification are distinct in storage.
- Active and historical conditions remain separate.
- Signed encounters are immutable; corrections are addenda.
- Pending pathology and blocking tasks prevent episode closure.

### Safety failures

1. **Allergy severity is falsified in presentation.**  
   `ui-record.js` renders every non-`high` allergy as `low`. The browser fixture supplied `criticality: unable-to-assess` and the screen displayed “خفيفة” (“low”). This is a direct dangerous allergy interpretation.

2. **Emergency access is not safely actor-bound in the client.**  
   `EMR.breakGlass` accepts any non-patient/non-reception role, including a self-asserted local doctor. `CONSENT.decideAccess` checks only whether the grant is active; unlike the server, it does not verify `breakGlass.actorId` or `patientId`. The browser gate proved that `DR-OTHER` can use a grant issued to `DR-ER`.

3. **Self-asserted facilities can create locally authoritative clinical output.**  
   `facilitySave` creates `SELF_ASSERTED` lab/imaging/pharmacy actors. Local result/report/dispense handlers mutate the record before server acknowledgement, while the domain functions require only an actor ID. A later server rejection does not prevent the local UI from treating the result as clinical data. Exact reinspection also found that the server facility branch binds results/studies to orders but does not require `licenseStatus: VERIFIED`; this is a client and server trust-boundary failure.

4. **Emergency notification is claimed but not implemented.**  
   The UI says “the patient has been told” after setting a local flag. The product's own Apple handoff confirms that no push-notification channel exists, and no SMS notification path was found. A boolean named `notifyPatient` is an obligation, not delivery evidence.

5. **RTL result chronology is ambiguous.**  
   Both patient and clinician result views join values with a bare `←`. Dates, ranges, and laboratory identity are absent from each point. In RTL, the arrow does not establish which value is newer.

6. **Unjudgeable result state is not named.**  
   A result without a reference range receives danger styling but no “cannot judge/no range” label. Abnormal and unjudgeable are clinically different states.

7. **Blood-pressure integrity cannot be verified because vitals are not modeled.**  
   No systolic/diastolic clinical fields or rendering contract exists. A redesign must not imply blood-pressure support until the pair, unit, posture/context, date, and source are modeled.

## E. Longitudinal Continuity Audit

Domain acceptance tests preserve:

`symptoms → assessment → investigation → abnormal result → referral → procedure → pathology → follow-up → closure`

Positive evidence:

- episode IDs group conditions, results, procedures, referrals, encounters, and tasks;
- pending pathology blocks closure;
- result/referral/follow-up absence creates persistent tasks;
- the second/third-clinician tests recover allergy, active problem, medicine, procedure, trend, overdue task, and unverified external claim without reading every note;
- `timelineByEpisode` groups events into stories rather than a flat feed.

Continuity is not complete in the product journey:

- there is no patient lookup/selection;
- `screenClinical(patientId)` ignores `patientId`;
- `#/clinical/encounter` does not open encounter authoring;
- patient sign-in/server backup is explicitly not built;
- clinician/lab/imaging/pharmacy routes are not reachable from their role homes;
- the same story across devices/clinics is therefore not established.

## F. Mobile Audit

Hub checks at 320px, 390px, and 430px found:

- no horizontal overflow in the audited routes;
- long Arabic name, mixed Arabic/English allergy/drug names, units, dates, and dense clinical rows remained within the viewport;
- effective touch targets met 44×44px;
- fixed bottom navigation did not create document overflow.

Limitations:

- the audit used a representative synthetic fixture, not every possible terminology length;
- software-keyboard resizing and 200% text zoom need device-level validation before release;
- platform-specific safe areas require native-wrapper/device testing.

The secondary simulation's existing browser check also passed its 360px/390px overflow, keyboard, and reduced-motion scenarios.

## G. RTL Audit

Passed:

- Arabic is the default root language/direction;
- most layout uses logical CSS properties;
- numeric helper classes isolate many mixed-direction values;
- reduced-motion rules exist.

Failed:

- clinical trends use an unlabeled left arrow;
- patient lab trends omit per-point date/lab/range, so direction cannot be recovered safely;
- `.bar-v { text-align: left; }` is a physical alignment;
- several discovery back labels contain hardcoded directional arrows;
- unjudgeable and mixed-source states depend too heavily on styling rather than explicit clinical language.

## H. Accessibility Audit

Passed:

- main landmark exists;
- route changes focus the main content;
- status/offline messages use live-region semantics;
- Escape/focus-trap behavior exists for sheets;
- reduced-motion support exists;
- audited touch targets met minimum size.

P2 failures:

- bottom-sheet dialogs have `role=dialog` but no `aria-label` or `aria-labelledby`;
- rendered routes commonly begin at `h2`/`h3` with no `h1`;
- main navigation uses tab roles for route links without a tabpanel interaction model;
- no skip-to-content link exists in `hub/`;
- a periodic full render can still replace the focused element when focus is on a non-input control.

Contrast and screen-reader announcement quality require a device/assistive-technology pass; they are not approved by code inspection alone.

## I. Data Integrity Audit

Strong controls:

- opaque patient ID remains the primary key;
- forbidden identity fields are rejected client- and server-side;
- server actor identity comes from a signed token, not request content;
- immutable collections reject overwrite and allow idempotent replay;
- unreadable storage returns `503`, never an empty clinical record;
- identifier values are redacted from non-patient server responses;
- medicine requests use separate keys per pharmacy answer;
- conflict policy distinguishes immutable events from mutable lists.

Blocking weaknesses:

- the primary UI stores the full clinical record unencrypted in localStorage with no patient authentication;
- verified clinician/patient/facility tokens are not issued through a complete UI journey;
- self-asserted facilities mutate local clinical state before server acceptance;
- local break-glass is not actor/patient-bound;
- server backup is unavailable from the current patient UI;
- server-side deletion is incomplete;
- Blob audit storage is explicitly not WORM-backed;
- true simultaneous mutable writes still have a known no-CAS race window.

## J. Route / Journey Coverage

All routes in `app.js::route` were inventoried. The independent browser gate covered the critical patient, clinician, consent, facility, settings, and privacy routes.

Blocking route findings:

- `#/clinical/encounter` is a dead functional destination: it returns to the clinical snapshot.
- `#/clinical` and `#/clinical/inbox` are not linked from clinician home/main navigation.
- `#/lab`, `#/imaging`, and `#/pharmacy-rx` are router-reachable but orphaned from role navigation.
- no patient lookup/selection route exists.
- no carry-code redemption route exists.
- patient context passed in the clinical URL is ignored.

Back/hash navigation and main-content focus work in the audited browser flow. Deep-link rendering works, but route existence alone does not make the associated journey complete.

## K. P0 / P1 / P2 Findings

The binding, finding-by-finding remediation and independent-verification
requirements are in
[`P0_REMEDIATION_SPECIFICATIONS.md`](./P0_REMEDIATION_SPECIFICATIONS.md).

### P0 — safety/core failure

| ID | Finding |
|---|---|
| P0-01 | Unable-to-assess allergy severity is displayed as low severity. |
| P0-02 | Self-asserted actors can invoke client break-glass, and an active grant is not bound to its issuing actor/patient in the client access decision. |
| P0-03 | Self-asserted facilities can create clinical output that the client treats as authoritative; the server facility gate also omits verified-licence enforcement. |
| P0-04 | UI claims emergency notification succeeded although no delivery channel exists. |
| P0-05 | Full clinical records are readable from unencrypted localStorage without patient authentication. |
| P0-06 | Release data includes synthetic “verified” entities and placeholder contacts; unsupported verification is only a preflight note, and no Qareeb deployment path enforces the release gate. |

### P1 — functional/clinical regression

| ID | Finding |
|---|---|
| P1-01 | `#/clinical/encounter` is miswired; encounter authoring is inaccessible. |
| P1-02 | Patient lookup/selection is absent and clinical `patientId` context is ignored. |
| P1-03 | Clinician/lab/imaging/pharmacy clinical routes are orphaned from role navigation. |
| P1-04 | RTL lab trends use an ambiguous arrow and omit date/lab/range per point. |
| P1-05 | Unjudgeable/no-range results are not explicitly labeled. |
| P1-06 | Cross-device longitudinal continuity is not established because patient authentication/backup is not built. |
| P1-07 | Blood-pressure systolic/diastolic semantics and a general vital-sign workflow are absent. |
| P1-08 | Carry-code issue exists, but no redemption journey is reachable. |

### P2 — UX/quality

| ID | Finding |
|---|---|
| P2-01 | Bottom-sheet dialogs lack accessible names. |
| P2-02 | Heading hierarchy starts below `h1`. |
| P2-03 | Navigation uses tab semantics without tab behavior/panels. |
| P2-04 | Hub has no skip-to-content link. |
| P2-05 | Some physical direction/alignment CSS and hardcoded arrows remain. |
| P2-06 | Full-page periodic rerender can disrupt keyboard/screen-reader focus outside active inputs/sheets. |
| P2-07 | Patient health record is reachable from bottom navigation but not explained in the patient home content, reducing discoverability. |

## L. Final QA Verdict

REJECT — P0
