# Qareeb P0 Remediation Specifications

**Authority:** independent Clinical / Product QA and Core Integrity Guardian  
**Source audit:** [`CLINICAL_PRODUCT_QA_REPORT.md`](./CLINICAL_PRODUCT_QA_REPORT.md)  
**Protected boundary:** [`PROTECTED_CORE_MAP.md`](./PROTECTED_CORE_MAP.md)  
**Current gate decision:** **REJECT — P0**

This document is a remediation contract, not an implementation. It does not
approve any proposed fix. The implementation team must supply code, tests, and
objective evidence for independent re-audit.

The visual design may change. The clinical, identity, consent, emergency,
provenance, and data-integrity invariants below may not.

## Evidence required from the remediation team

For each P0, the remediation submission must include:

- a focused diff mapped to the affected symbols below;
- the new regression tests named in the specification;
- the exact commands and results for those tests;
- evidence for both Arabic and English where presentation semantics are involved;
- evidence for both permitted and denied security paths;
- confirmation that existing expectations were not weakened or deleted;
- a complete Hub regression result, release-preflight result, and browser-gate result.

A changed screenshot, a passing happy path, a client-side flag, or a prose claim
is not sufficient evidence for a P0 closure.

## P0-01 — Unable-to-assess allergy displayed as low severity

### 1. Exact affected file(s)

- `hub/js/ui-record.js`
  - `listAllergies(d)`, especially the two-branch criticality rendering.
  - `panelAllergies(list)` and the clinician allergy safety bar in
    `screenClinical(patientId)` must be checked for consistent non-collapsing
    presentation, even though the reproduced false “low” label occurs in
    `listAllergies`.
- Protected references that define the values and must remain semantically
  stable:
  - `hub/js/emr.js` — `CRITICALITY`, allergy records, and
    `criticalAllergies(...)`.
  - `hub/js/record.js` — allergy data passed into patient profiles and clinical
    briefs.

### 2. Exact function/component/route

- Function: `listAllergies(d)`.
- Patient route: `#/record/allergies`, dispatched by
  `app.js::route()` → `screenRecordSection(...)` → `listAllergies(...)`.
- Consistency surfaces to inspect after remediation:
  - `#/record` → `panelAllergies(...)`;
  - `#/clinical` → `screenClinical(...)` allergy safety bar.

### 3. Current unsafe behaviour

`listAllergies` uses a binary expression:

- `high` → “خطرة” / “high”;
- every other value → “خفيفة” / “low”.

Consequently, `criticality: "unable-to-assess"` is displayed as a confirmed low
severity. The current rendering also does not independently expose
`verificationStatus: "patient-reported"`, so uncertainty and provenance are
collapsed into a reassuring severity.

### 4. Why it violates the protected clinical/product contract

Allergy identity, reaction, criticality, and verification are independent
clinical facts. “Unable to assess” is not a synonym for “low”. A clinician or
pharmacist may discount a potentially serious allergy after seeing the false
low-severity label. This is a direct breach of the protected rule that allergy
criticality and verification must not be collapsed.

### 5. Expected safe behaviour

- Render all supported criticality states explicitly:
  - `high`;
  - `low`;
  - `unable-to-assess`.
- Render missing or unknown criticality as unknown/not recorded, never as low.
- Preserve verification as a separate statement, including
  `patient-reported`, rather than using it as a severity.
- Arabic and English must communicate the same uncertainty.
- Styling may reinforce the text but must not be the sole carrier of meaning.

### 6. Minimal acceptable remediation

Replace the binary display branch with an exhaustive presentation mapping for
criticality and a separate mapping for verification status. At minimum, the
reproduced record must display an explicit equivalent of “غير مُقيّمة /
unable to assess” and “أبلغ عنها المريض / patient-reported”, and must not
contain the low-severity label.

This is a presentation-boundary correction. It does not require changing the
stored allergy or reclassifying its clinical state.

### 7. What must NOT be changed

- Do not change `EMR.CRITICALITY` values or their meanings.
- Do not coerce `unable-to-assess`, missing, or unrecognised values to `low`.
- Do not remove the allergy, its reaction, its source, or its verification
  status to avoid rendering the uncertainty.
- Do not weaken `criticalAllergies(...)` or reorder safety-critical allergies
  for cosmetic reasons.
- Do not change the QA fixture or assertion to stop it reproducing the defect.

### 8. Regression test that must exist after remediation

A browser-level regression test must seed an allergy with:

- `criticality: "unable-to-assess"`;
- `verificationStatus: "patient-reported"`;
- a substance and reaction containing mixed Arabic/English text.

At `#/record/allergies`, in both Arabic and English, it must assert:

- the explicit unable-to-assess label is present;
- the patient-reported label is present;
- the low-severity label is absent for that allergy;
- the substance/reaction association remains intact and screen-reader
  discoverable.

The same test group must retain positive cases for genuine `high` and genuine
`low` records and a negative case for missing criticality. The existing
`ALLERGY_SEVERITY_FALSE_LOW` browser gate must no longer reproduce; it must not
be removed or inverted.

### 9. How the Guardian will independently verify the fix

1. Inspect the mapping and verify it is exhaustive and non-mutating.
2. Run the complete Hub suite without altered legacy expectations.
3. Run `hub/tools/qa-browser.py` at 320, 390, and 430 px.
4. Confirm `ALLERGY_SEVERITY_FALSE_LOW` is absent from the generated findings.
5. Inspect the DOM and accessible text in Arabic and English for the seeded
   allergy.
6. Confirm genuine high and low values still retain their original meanings.

### 10. Category

- **Primary:** Frontend logic
- **Also:** Design implementation

## P0-02 — Client break-glass is self-asserted and not actor/patient-bound

### 1. Exact affected file(s)

- `hub/js/ui-record.js`
  - `readRecord(actor, scope, dataClass)`;
  - `screenClinical(patientId)`;
  - `clinicalBreakGlass()`;
  - `clinicalBreakGlassGo()`;
  - `currentClinician()`, `clinicianSetup()`, and `clinicianSave()`.
- `hub/js/consent.js`
  - `decideAccess(ctx)`;
  - `escalateEmergency(grant, reason, actor, now)` is a protected comparison
    point because it already requires the same actor for escalation.
- `hub/js/emr.js`
  - `breakGlass(principal, patientId, reason, at)`;
  - `breakGlassActive(g, now)`.
- Server boundary that is currently stricter and must not be weakened:
  - `hub/netlify/functions/_record-core.mjs::decideRead(ctx)`;
  - `hub/netlify/functions/record.mjs::actorFrom(request)` and `read(...)`.
- Missing boundary: no server endpoint in `hub/netlify/functions/record.mjs`
  currently issues and persists the break-glass grant that `read(...)` looks
  up under the authenticated actor.

### 2. Exact function/component/route

- Clinician route: `#/clinical`.
- No-access emergency section: `screenNoAccess(d, me, decision)`.
- Invocation: `clinicalBreakGlass()` → `clinicalBreakGlassGo()`.
- Effective client authorization:
  `readRecord(...)` → `CONSENT.decideAccess(...)`.
- Self-asserted identity source:
  `clinicianSave()` → `qrb.qareeb.clinician.v1`.

### 3. Current unsafe behaviour

- Any local user can create a doctor profile with
  `licenseStatus: "SELF_ASSERTED"`.
- `EMR.breakGlass(...)` rejects only patient/reception roles; it does not
  establish an authenticated or verified professional identity.
- `clinicalBreakGlassGo()` stores the resulting grant directly in the local
  record and immediately treats it as effective.
- `CONSENT.decideAccess(...)` checks only that the grant is active. It does not
  require `breakGlass.actorId === actor.id` or
  `breakGlass.patientId === patientId`.
- The reproduced browser case allowed actor `DR-OTHER` to use a live grant
  issued to `DR-ER`.
- The server read decision performs actor and patient binding, but the current
  UI does not use a server-issued grant. The server has lookup code for a grant
  but no issuance path, leaving the deployed client path local and
  self-authorised.

### 4. Why it violates the protected clinical/product contract

Emergency access is an exception to patient consent. It is safe only when it is
bound to a trustworthy actor, one patient, an explicit reason, a narrow
dataset, a short duration, and an immutable audit trail. A reusable local grant
or a grant created by a self-asserted identity is a consent bypass, not a
break-glass control. The defect compromises identity integrity, consent
semantics, and the patient's ability to identify who opened the record.

### 5. Expected safe behaviour

- Only an authenticated, eligible professional principal may invoke
  break-glass.
- The effective grant must be issued or accepted by the server trust boundary,
  not made authoritative by mutable browser storage.
- A grant is usable only when all of these match:
  - authenticated actor ID;
  - target patient ID;
  - permitted role/capability;
  - active time window;
  - emergency tier and allowed scopes.
- A wrong actor, wrong patient, expired grant, local-storage edit, or
  self-asserted identity must fail closed and create a denied audit event at
  the trusted boundary.
- Tier 1 must remain limited to the server's explicit
  `EMERGENCY_COLLECTIONS` allow-list: `patient`, `allergies`, `medications`,
  and `conditions`, exposed only through the `summary`, `allergies`,
  `medications`, and `conditions` scopes. Every other collection and every
  field outside the `CONSENT.emergencyCard(...)` response contract must be
  denied. That contract is limited to name, age, sex, blood group, allergy
  substance/reaction/criticality, critical-medication display/dose, major
  conditions, clinical warnings, emergency contact, and explicit
  not-recorded warnings. Raw collection records, identifiers, notes,
  documents, and historical inactive entries must not be returned at tier 1.
- Full-record escalation remains a separate, reasoned act.

### 6. Minimal acceptable remediation

Two layers are required:

1. Add actor-ID and patient-ID equality checks to the client access decision as
   defence in depth.
2. Stop treating a locally created grant as authorization. The production
   emergency action must use an authenticated server flow that validates actor
   eligibility, persists an actor/patient-bound grant, and returns only the
   permitted emergency dataset.

Until that server issuance flow exists, the emergency action must be disabled
in production. A local `licenseStatus: "VERIFIED"` flag is not an acceptable
substitute because the same origin can edit it.

Disabling the action is containment only. It does not close P0-02 or satisfy
the required emergency workflow.

Before implementation review, the remediation team must identify the exact
HTTP method/path, handler symbol, grant schema/store key, expiry source, and
audit writer for issuance and revocation. “Authenticated server flow” without
those concrete boundaries is not an acceptable submission.

### 7. What must NOT be changed

- Do not remove patient binding, actor binding, reason, expiry, tiering, audit,
  or notification obligations.
- Do not broaden the tier-1 dataset or turn one-step break-glass into full
  record access.
- Do not make `SELF_ASSERTED` equivalent to `VERIFIED`.
- Do not rely on a hidden button, local role flag, or client-only comparison as
  the trust boundary.
- Do not weaken `_record-core.mjs::decideRead(...)`, which already checks actor
  and patient IDs.
- Do not delete or rewrite denied audit events to make the flow look cleaner.

### 8. Regression test that must exist after remediation

Domain/server and browser tests must cover:

- correct actor + correct patient + eligible authenticated principal + active
  grant → emergency scopes only;
- grant for `DR-ER` used by `DR-OTHER` → denied;
- grant for patient A used for patient B → denied;
- expired grant → denied;
- self-asserted/unverified actor → cannot obtain an effective grant;
- localStorage-injected or modified grant → cannot authorize a server read;
- full-record scope under tier 1 → denied with escalation required;
- successful and denied attempts → trusted audit records with actor, patient,
  reason/basis, time, and context.

The existing `BREAK_GLASS_NOT_ACTOR_BOUND` browser reproduction must no longer
reach the clinical snapshot and must not be removed.

### 9. How the Guardian will independently verify the fix

1. Inspect all grant issuance, persistence, read, and audit paths.
2. Confirm identity comes from a signed/authenticated principal, not request
   body or localStorage.
3. Run the complete domain/server suite and the new negative matrix.
4. Repeat the `DR-ER`/`DR-OTHER` browser attack and direct API attacks for wrong
   actor and wrong patient.
5. Edit the local grant and local clinician identity manually and confirm no
   protected server data is returned.
6. Confirm tier-1 scope restriction and separate escalation remain intact.

### 10. Category

- **Primary:** Identity/security
- **Also:** Frontend logic, Backend/domain, Emergency workflow

## P0-03 — Self-asserted facilities create authoritative clinical output

### 1. Exact affected file(s)

- `hub/js/ui-network.js`
  - `facilitySave(kind)`;
  - `labReport(orderId)`;
  - `imagingRecord(orderId)`;
  - `imagingReport(studyId)`;
  - `pharmacyDispense(rxId, state, extra)`.
- `hub/js/network.js`
  - `reportResult(order, res, lab, at)`;
  - `imagingStudy(order, s, centre, at)`;
  - `reportStudy(study, report, radiologist, at)`.
- `hub/js/record.js`
  - `recordDispense(rx, d, at)`.
- `hub/js/transport.js`
  - `write(...)`, `drain()`, and rejection settlement, because rejected local
    assertions remain in the same collections rendered as clinical truth.
- `hub/netlify/functions/_record-core.mjs`
  - `canWrite(actor, collection, ctx)`, especially the facility branch.
- `hub/netlify/functions/record.mjs`
  - `actorFrom(request)` and `sync(request, store, actor)`.

### 2. Exact function/component/route

- Facility identity setup: `facilitySetup(kind)` / `facilitySave(kind)`.
- Laboratory: `#/lab` and `#/lab/order/:orderId`.
- Imaging: `#/imaging`, `#/imaging/order/:orderId`, and
  `#/imaging/study/:studyId`.
- Pharmacy: `#/pharmacy-rx` and `#/pharmacy-rx/rx/:prescriptionId`.
- Patient/clinician consumers that subsequently render the output include
  `#/record/labs`, `#/record/timeline`, and `#/clinical`.

### 3. Current unsafe behaviour

- `facilitySave(...)` creates a mutable local actor with
  `licenseStatus: "SELF_ASSERTED"`.
- The lab, imaging, and pharmacy handlers pass that actor or its ID into pure
  constructors, append the returned assertion directly to `results`,
  `studies`, or `dispenses`, save the record, and then queue synchronization.
- The same authoritative arrays are rendered before any server
  acknowledgement. A later rejection changes the outbox state but does not
  remove or quarantine the clinical assertion.
- `reportResult(...)`, `imagingStudy(...)`, `reportStudy(...)`, and
  `recordDispense(...)` require an actor ID but do not establish licence
  verification.
- Contrary to the earlier high-level assumption, the current server facility
  branch in `_record-core.mjs::canWrite(...)` also does **not** require
  `actor.licenseStatus === "VERIFIED"`. It checks collection and order binding
  for results/studies; dispenses bypass the order check. Therefore a signed
  facility token carrying an unverified status is not rejected by this gate.

### 4. Why it violates the protected clinical/product contract

Lab values, imaging impressions, and dispensing events directly alter clinical
decisions. An unverified facility must not be able to create an assertion that
looks equivalent to verified clinical output. Rendering untrusted output in
the authoritative record before acceptance also creates stale false data after
a server rejection. This breaches provider identity, provenance, data
integrity, and patient-safety invariants.

### 5. Expected safe behaviour

- Only an authenticated facility principal with independently verified status
  may create clinical output.
- Facility identity must come from the signed session and must be bound to the
  relevant order/prescription and patient.
- Self-asserted facilities may at most create a non-clinical onboarding draft;
  they must not mutate authoritative clinical collections.
- Offline output from a previously verified, device-bound session may be
  retained as explicitly pending, but must remain distinguishable from
  server-accepted clinical data.
- Replay acceptance must revalidate current credential expiry/revocation,
  facility verification, patient/order/prescription binding, and payload
  provenance at the server. Verification at offline capture time is not
  sufficient.
- A rejected assertion must never continue to appear as accepted. It must be
  quarantined with a visible failure requiring resolution; historical accepted
  events must not be rewritten.
- Typed performer names may supplement provenance but cannot replace the
  authenticated asserting principal.

### 6. Minimal acceptable remediation

- Enforce `licenseStatus === "VERIFIED"` at the server facility-write gate and
  bind the signed actor to patient, order/prescription, facility, and payload
  provenance.
- Block self-asserted facility submission before mutating `results`, `studies`,
  or `dispenses`.
- Store pending and rejected assertions in a separate non-authoritative store
  consumed only by reconciliation/status UI. Server acceptance performs the
  sole atomic transition into authoritative `results`, `studies`, or
  `dispenses` collections.
- For offline operation, require a still-valid, previously verified
  device/session credential and preserve the pending state until replay is
  acknowledged.

A visual “unverified” badge alone is insufficient if calculations, trends,
alerts, timelines, or clinician summaries still consume the assertion as
authoritative.

### 7. What must NOT be changed

- Do not weaken order/patient/performer binding or allow a facility to write
  unrelated collections.
- Do not mark a self-asserted actor verified from a local form.
- Do not silently discard rejected output; retain it outside authoritative
  clinical state with failure provenance so the operator can reconcile it.
- Do not break local-first/offline capture for previously authenticated,
  verified facilities.
- Do not mutate accepted historical results, studies, reports, prescriptions,
  or dispenses to resolve a failed submission.
- Do not weaken idempotency, immutable-event, unit, reference-range,
  acknowledgement, or closed-loop task rules.

### 8. Regression test that must exist after remediation

The regression matrix must include lab result, imaging study/report, and
dispense paths:

- self-asserted local facility submits → blocked; authoritative collection and
  outbox remain unchanged;
- signed but unverified facility token submits → server rejects;
- verified facility for wrong patient/order/facility submits → server rejects;
- verified bound facility submits online → accepted once with trusted
  provenance;
- verified bound facility submits offline → visible only as pending, then
  transitions once on acknowledgement after current server-side credential,
  verification, and resource-binding revalidation;
- credential revoked or verification expired after offline capture but before
  replay → server rejects and the assertion remains quarantined;
- server rejects a pending submission → it is quarantined and excluded from
  trends, alerts, summaries, timelines, and accepted counts;
- payload claims a different facility than the token → rejected and audited;
- a typed human performer may be retained separately as explicitly unverified
  metadata, but must never replace or be normalised into the authenticated
  asserting facility principal;
- replay of an accepted operation → idempotent, with no duplicate clinical
  event.

### 9. How the Guardian will independently verify the fix

1. Inspect client mutation order, trust-state transitions, server
   authorization, and all clinical consumers.
2. Execute each negative case through both browser UI and direct API calls.
3. Inspect local storage before acknowledgement and after rejection to confirm
   untrusted output is not in authoritative collections.
4. Verify lab trends, clinical brief, timeline, task generation, and dispense
   status exclude pending/rejected assertions.
5. Repeat offline replay and idempotency tests.
6. Run the complete Hub suite and browser gate.

### 10. Category

- **Primary:** Identity/security
- **Also:** Frontend logic, Backend/domain

## P0-04 — Emergency notification is claimed without delivery

### 1. Exact affected file(s)

- `hub/js/ui-record.js`
  - `screenNoAccess(...)`;
  - `clinicalBreakGlass()`;
  - `clinicalBreakGlassGo()`.
- `hub/js/ui-discovery.js`
  - `screenPrivacy()`, which promises an immediate notification.
- `hub/js/emr.js::breakGlass(...)` and
  `hub/js/consent.js::decideAccess(...)` /
  `escalateEmergency(...)` contain notification obligations, not delivery
  receipts.
- `hub/docs/APPLE_IMPLEMENTATION_TRACKER.md` and
  `hub/QAREEB_APPLE_HANDOFF.md` document that no push channel exists.
- Missing implementation boundary: no server notification queue, delivery
  adapter, patient-device registration, retry/dead-letter state, or delivery
  receipt exists under `hub/netlify/functions/`.

### 2. Exact function/component/route

- Clinician route: `#/clinical`, no-access emergency section.
- Emergency confirmation sheet: `clinicalBreakGlass()`.
- Completion toast: `clinicalBreakGlassGo()`.
- Patient privacy route: `#/privacy` → `screenPrivacy()`.

### 3. Current unsafe behaviour

The emergency flow states that the patient “is notified” and the completion
toast states “Opened — and the patient has been told”. The implementation only
sets `notifyPatient: true` on a local grant. There is no APNs, FCM, web-push,
SMS, or other delivery mechanism and no delivery receipt. The privacy page
separately promises an immediate notification.

### 4. Why it violates the protected clinical/product contract

The notification is the transparency control for access without consent.
Claiming delivery when only an obligation flag exists gives clinicians and
patients false assurance and makes the consent/audit model materially
misleading. A boolean request, an access-log row, and actual patient
notification are different states and must not be conflated.

### 5. Expected safe behaviour

- Every emergency grant creates a durable, patient-bound notification
  obligation at the trusted server boundary.
- The system tracks at least `queued`, `sent`, `delivered` where supported, and
  `failed/needs-attention`; it never describes one state as another.
- `queued` means durably persisted by Qareeb; `sent` means accepted by the
  external channel provider; `delivered` is allowed only when that channel
  returns a terminal device/recipient delivery receipt. Provider acceptance,
  an APNs response, or an HTTP 2xx is not delivery evidence.
- UI and privacy language describe only the capability actually deployed.
- Patient-facing content uses the minimum necessary information and does not
  expose clinical detail on a lock screen.
- The lock-screen/SMS payload is limited to an opaque notification ID, locale,
  and generic security-notification template code. Patient identity, actor
  name, emergency reason, diagnosis, medicines, results, and other clinical
  content are available only after authenticated in-app retrieval.
- Notification failure does not erase the emergency access/audit event; it
  remains visible for retry and operational follow-up.

### 6. Minimal acceptable remediation

Required P0 closure:

1. Implement a durable server-side notification workflow with a configured
   delivery channel, idempotent retries, failure state, and evidence of
   delivery; update the UI to report the actual state.

Until closure:

2. Disable effective break-glass in production while that workflow does not
   exist.

In either path, remove every false present/past-tense delivery claim. Merely
changing the toast to “will be notified” while no durable delivery path exists
does not close this P0.

Path 2 is temporary containment only. It does not close P0-04 or authorise a
clinical release where emergency access is a required product capability.

Before Path 1 implementation review, the remediation team must identify the
exact producer function, durable store/schema, worker/adapter, delivery-status
or receipt endpoint, patient-history consumer, files, and symbols. A generic
“notification service” claim is not an implementation boundary.

### 7. What must NOT be changed

- Do not set `notifyPatient` or `mustNotify` to false to make the discrepancy
  disappear.
- Do not redefine an access-log row as a delivered notification.
- Do not show “sent” after only a local write or “delivered” after only queue
  acceptance.
- Do not expose diagnosis, reason, or other unnecessary PHI in a push/SMS
  preview.
- Do not delete failed notification obligations or emergency audit records.
- Do not weaken actor/patient binding, expiry, reason, tier, or audit controls.

### 8. Regression test that must exist after remediation

Path 1 tests must prove:

- emergency grant creates exactly one durable notification obligation for the
  same patient and grant;
- retry/replay does not send duplicates;
- no configured channel → no claim of sent/delivered;
- queue accepted but no receipt → UI says queued/pending, not delivered;
- provider acceptance without a terminal delivery receipt → at most `sent`;
- adapter failure → retained failed state and operational visibility;
- successful sandbox delivery → UI may show only the state supported by the
  returned receipt;
- notification payload contains no unnecessary PHI;
- Arabic/English no-access text, confirmation text, toast, privacy page, and
  patient alert all agree with deployed behaviour.

Path 2 containment tests must prove:

- the UI cannot invoke break-glass;
- direct API issuance is denied;
- no success or notification-delivery claim appears;
- the enablement decision is enforced by server deployment configuration under
  the release gate, not a mutable client/local flag;
- when disabled, no client flag or direct request can re-enable issuance;
- a temporary adapter outage after safe deployment leaves obligations durably
  queued rather than relabelling them or erasing emergency access/audit.

### 9. How the Guardian will independently verify the fix

1. Trace one emergency grant from authenticated issuance through durable queue,
   adapter, receipt/failure, audit, and patient-visible history.
2. Run the no-channel, adapter-failure, retry, and duplicate-request cases.
3. Use a sandbox test device/number to verify real delivery if break-glass is
   enabled.
4. Compare every emergency notification statement in Arabic and English to
   the observed state.
5. Confirm no success text appears before the corresponding evidence.
6. Re-run the full emergency, consent, browser, and server suites.

### 10. Category

- **Primary:** Emergency workflow
- **Also:** Design implementation, Frontend logic, Backend/domain,
  Infrastructure

## P0-05 — Full clinical record is plaintext and unauthenticated locally

### 1. Exact affected file(s)

- `hub/js/ui-core.js`
  - `LS.get(k, d)` and `LS.set(k, v)`;
  - local role state explicitly marked as unauthenticated.
- `hub/js/ui-record.js`
  - `KEY`, `store()`, `save(d)`, `mutate(fn)`;
  - `screenRecord()` and every `screenRecordSection(...)` path;
  - `screenSignin(d)`, which is only an unavailable server-backup flow and is
    not a local unlock/authentication gate.
- `hub/js/transport.js`
  - `KEY`, `TOKEN_KEY`, `load()`, `save(d)`, and `token()`.
- `hub/js/app.js::route()` for `record` and `clinical` routes.
- `hub/js/ui-network.js`, whose facility screens read and mutate the same
  record store.
- `hub/index.html`, which loads the application directly without an
  authentication bootstrap.
- Missing boundary: no patient verification/unlock endpoint or secure local
  key-management implementation currently protects the record.

### 2. Exact function/component/route

- Plaintext storage key:
  `qrb.qareeb.record.v1` (`LS` prefixes `qrb.` to
  `qareeb.record.v1`).
- Session/token key:
  `qrb.qareeb.token.v1`.
- Patient routes: `#/record` and every `#/record/*` route.
- Clinician route: `#/clinical` reads the same device-local record.
- Facility routes: `#/lab/*`, `#/imaging/*`, and `#/pharmacy-rx/*`.

### 3. Current unsafe behaviour

- The complete patient record is serialised as readable JSON in localStorage.
- `screenRecord()` calls `store()` and renders PHI without authenticating the
  patient or unlocking a protected local store.
- Direct hash navigation, reload, or a different person holding the unlocked
  device reveals the record.
- Any script executing in the origin can read both the record and locally
  stored session material.
- The “sign in” screen explicitly says OTP sign-in is not built and controls
  server backup only; it does not protect local access.

### 4. Why it violates the protected clinical/product contract

The record includes identity, allergies, medicines, conditions, results,
documents, encounters, consent records, and access history. Storing and
rendering it without patient authentication breaks identity and
confidentiality boundaries. It also makes consent semantics incoherent:
remote access is scoped while unrestricted device-local access exposes the
entire record.

### 5. Expected safe behaviour

- Patient clinical routes start locked and disclose no patient identity or
  clinical data until successful local patient verification.
- Patient routes require patient/device unlock. Clinician and facility routes
  require a separately authenticated, eligible professional principal plus
  patient/resource authorization. Patient unlock must never confer
  professional capabilities.
- Clinical data is encrypted at rest with authenticated encryption.
- The decryption key is not stored beside the ciphertext in localStorage,
  sessionStorage, source code, or another trivially readable value.
- Key release is bound to a real patient/device authentication mechanism with
  rate limiting and recovery/revocation semantics.
- The app relocks on explicit lock/logout and defined session/background
  conditions, clearing decrypted record material from active application
  state.
- Approved users retain the promised offline/local-first capability through a
  device-bound secure key path.
- Existing plaintext records are migrated without identity reassociation,
  event mutation, duplication, or data loss.

### 6. Minimal acceptable remediation

This requires a security design, not only a route guard:

- add patient authentication/unlock before patient clinical routes;
- require separately authenticated professional principals and existing
  patient/resource authorization before clinician or facility routes;
- replace plaintext record persistence with authenticated encryption and
  platform-appropriate secure key storage;
- add a rollback-safe migration that verifies encrypted round-trip integrity
  before deleting plaintext;
- prevent record and token access before unlock and clear the unlocked session
  on lock/logout.

For an iOS wrapper, Keychain/Secure Enclave-backed key handling is the expected
class of control. For a browser/PWA deployment, the team must demonstrate an
equivalent device-bound design and state its limitations. A PIN-derived key
without a memory-hard KDF, attempt controls, and recovery design is not
acceptable. If secure storage cannot be delivered, clinical-record routes must
remain disabled in production.

Route disablement is temporary containment only. It does not close P0-05,
satisfy the offline/local-first requirement, or authorise clinical release.

Before implementation approval, the security design must provide testable
values for the AEAD algorithm/key length/nonce/AAD rules; KDF and work factors
if a human secret is involved; key wrapping/storage and exportability;
failed-attempt threshold/window; exact session and background relock
conditions; recovery/revocation; and migration rollback.

### 7. What must NOT be changed

- Do not abandon the local-first/offline product requirement as a shortcut.
- Do not change patient IDs, record schema meaning, episode links, immutable
  events, consent history, or audit history during migration.
- Do not store the encryption key, plaintext PIN, reversible PIN, or an
  equivalent unlock secret beside the ciphertext.
- Do not treat `qrb.role`, `qrb.myDoc`, a hidden route, or a JavaScript boolean
  as authentication.
- Do not render PHI behind an overlay while it is already present in the DOM.
- Do not silently delete a plaintext record before verified migration and
  recovery evidence exists.
- Do not weaken server authentication or consent to compensate for local
  protection.

### 8. Regression test that must exist after remediation

Security and browser tests must cover:

- fresh/reloaded app and direct `#/record`, `#/clinical`, and facility deep
  links → locked; no seeded patient marker appears in DOM/accessibility tree;
- localStorage/IndexedDB/cache inspection → no plaintext patient marker,
  medicine, allergy, result, or document content;
- no raw/exportable key or equivalent unlock secret exists in web-readable
  storage; any persisted non-exportable key handle is unusable while locked;
- correct patient unlock → exact record restored, including all historical
  links and hashes/counts;
- wrong credential or wrong patient/device key → no decryption and rate
  limiting/lockout;
- patient unlock alone → cannot enter clinician/facility routes or acquire
  professional write/read capability;
- professional principal → remains limited to the authorised patient,
  order/prescription, facility, scope, and role;
- offline authorised unlock → works under the approved device-bound policy;
- background/session expiry/logout → relocks and clears decrypted state;
- interrupted migration → recoverable without duplicate/lost events;
- successful migration → cryptographic round-trip equality, then plaintext
  removal;
- tampered ciphertext → fails closed with no partial clinical rendering.

### 9. How the Guardian will independently verify the fix

1. Review the threat model, key lifecycle, authentication, recovery, migration,
   and lock policy before accepting implementation evidence.
2. Seed unique PHI markers, inspect all browser stores and caches, and search
   the DOM before and after unlock.
3. Restart the browser/device, navigate directly to every sensitive route, and
   test wrong-user and wrong-key cases.
4. Test authorised offline unlock and subsequent relock.
5. Compare a canonical hash/count/link inventory before and after migration.
6. Attempt ciphertext tampering and interrupted migration.
7. Run the complete Hub, browser, consent, identity, offline, and server suites.

### 10. Category

- **Primary:** Identity/security
- **Also:** Frontend logic, Backend/domain, Infrastructure

## P0-06 — Unsafe release data has no enforced Qareeb deployment gate

### 1. Exact affected file(s)

- `hub/js/data.js`
  - `DATA_PROVENANCE`;
  - `FACILITIES`, `BRANCHES`, `DOCTORS`, `RX_MEDS`, and `SIGNALS`;
  - `CONFIG.emergency`.
- `hub/tools/preflight.mjs`
  - placeholder-number checks;
  - provenance checks;
  - `verifiedNoProof`;
  - emergency-number release note;
  - `--release` exit behaviour.
- `hub/package.json`
  - `preflight`, `test`, and `build` scripts.
- `hub/netlify.toml`
  - `[build].command`, which installs dependencies but does not run the release
    preflight.
- `.github/workflows/deploy-adlytic.yml`
  - the only workflow; its path filters and jobs exclude `hub/`.
- Missing boundary: no Qareeb-specific required CI/deployment workflow exists
  in `.github/workflows/`.

### 2. Exact function/component/route

- Command: from `hub/`, `npm run preflight -- --release`.
- Deployment boundary: Qareeb Netlify build configured by
  `hub/netlify.toml`.
- Repository CI boundary: `.github/workflows/`.
- Runtime discovery surfaces consume `FACILITIES`, `BRANCHES`, `DOCTORS`,
  medicine catalogue data, signals, contact numbers, verification labels, and
  emergency numbers.

### 3. Current unsafe behaviour

- `DATA_PROVENANCE.real` is false and its sources are synthetic.
- 55 records use deliberate placeholder phone/WhatsApp numbers.
- Many synthetic facility/doctor records carry `verified: true`.
- The preflight blocks synthetic provenance and placeholder numbers when run
  with `--release`.
- However, facilities marked verified without `verifiedAt` or `licence` are
  only emitted as notes, not release blockers.
- Emergency-number verification is also a note requiring re-check.
- No GitHub workflow runs Hub tests or release preflight.
- The Qareeb Netlify build command does not invoke release preflight, so direct
  or manually triggered deployments can bypass the check entirely.

### 4. Why it violates the protected clinical/product contract

Synthetic healthcare entities with trust marks and non-working contact details
can be mistaken for real care options. Placeholder numbers can misdirect a
patient, and unsupported “verified” status can create false professional trust.
An emergency number has direct life-safety consequences. A manual script is
not a release control when every deployment path can omit it.

### 5. Expected safe behaviour

- Production artefacts contain only release-approved data with explicit,
  evidence-backed provenance.
- Synthetic/demo records are excluded from production or deployed only to a
  clearly segregated non-production environment that cannot be confused with
  live care.
- Placeholder/malformed contacts, synthetic provenance, contradictory
  provenance, unsupported verification claims, and stale/unverified emergency
  configuration are release blockers.
- Verification evidence identifies the authority/source, subject identifier,
  verifier, `verifiedAt`, `expiresAt` or `reverifyBy`, and an evidence
  hash/reference. A date or free-text licence value alone is not evidence.
- Staleness is determined by a named and tested maximum verification interval,
  not an operator's judgement at deployment time.
- Every Qareeb deployment path runs the same fail-closed preflight.
- A Qareeb CI required check runs on relevant `hub/**` and workflow/config
  changes, and deployment depends on that check.

### 6. Minimal acceptable remediation

- Add `.github/workflows/qareeb-release.yml`. It must install in `hub/`, run
  the complete Hub tests, and run `npm run preflight -- --release`.
- Make the Qareeb deployment job depend on that successful gate.
- Invoke the release preflight from the actual Netlify build path as defence
  against deployment outside GitHub Actions.
- Production, manual/UI/API, retry/rebuild, and every other
  production-capable Netlify path must execute the same fail-closed gate.
  Direct production uploads that bypass the build command must be prohibited
  by deployment permissions/policy.
- Preview/demo deployments must use a separate site/environment, domain,
  credentials, and data store; must have `DATA_PROVENANCE.real === false`; and
  must have no production alias or ability to write production data.
- Promote unsupported `verified: true` records without verification evidence
  from a note to a release blocker.
- Replace/exclude synthetic and placeholder release data through the approved
  import/provenance process; do not make the gate pass by relabelling it.
- Require dated, attributable verification evidence for emergency contact
  configuration at release.

Adding CI alone does not make the current data safe; it should initially cause
the release to fail until the data blockers are resolved.

### 7. What must NOT be changed

- Do not remove, bypass, soften, or catch-and-ignore the preflight exit code.
- Do not set `DATA_PROVENANCE.real = true`, `origin = "imported"`, or
  `verified = true` without supporting evidence.
- Do not replace obvious placeholders with invented numbers that merely evade
  the regex.
- Do not downgrade unsupported verification or emergency-number evidence to a
  warning in a production release.
- Do not mix demo and production datasets in one artefact behind only a visual
  badge.
- Do not alter clinical/domain tests to accommodate unsafe seed data.

### 8. Regression test that must exist after remediation

Fixture-based preflight tests must assert non-zero release exit for each
independent condition:

- placeholder contact;
- malformed Iraqi contact;
- synthetic source;
- provenance marked real while source remains synthetic;
- provenance marked real while placeholder contacts remain;
- entity marked verified without required verification evidence;
- missing or stale/unattributed emergency-number verification;
- controlled medicine incorrectly broadcastable.

They must also include one fully valid fixture that exits zero. CI/deployment
tests or policy evidence must prove:

- a `hub/**`, `hub/netlify.toml`, `hub/package*.json`, or
  `.github/workflows/qareeb-release.yml` change triggers the Qareeb gate;
- failed preflight prevents the deployment job;
- the Netlify build command also fails on the unsafe fixture/current unsafe
  data;
- skipping or masking the command is not treated as success;
- a synthetic preview cannot receive a production domain/alias, credential, or
  data-store binding, and cannot write production data.

### 9. How the Guardian will independently verify the fix

1. Inspect production dataset provenance and sample the underlying evidence,
   not only flags.
2. Run every preflight fixture and the real release command.
3. Confirm current unsafe data fails for the expected individual reasons.
4. Inspect workflow path filters, working directory, required-check status,
   deployment dependencies, and Netlify build command.
5. Review an actual blocked deployment log and, only after data remediation,
   a passing release log.
6. Verify production discovery/contact/emergency surfaces against the released
   artefact.
7. Re-run the complete Hub suite and import/data-shape gates.

### 10. Category

- **Primary:** Infrastructure
- **Also:** Identity/security, Backend/domain

## Independent re-audit protocol

No P0 will be closed from a code diff alone. After the implementation team
submits remediation, the Guardian will:

1. compare the remediation against every “must” and “must not” above;
2. inspect changed protected-core and trust-boundary code;
3. confirm required tests were added without deleting or weakening existing
   expectations;
4. run the complete Hub domain/server suite;
5. run focused identity, consent, emergency, facility, storage, migration, and
   release-gate negative tests;
6. run the independent browser gate at 320, 390, and 430 px in Arabic and
   English;
7. repeat direct API and local-storage tampering attempts;
8. verify migration/data integrity with canonical before/after comparisons;
9. verify notification delivery and deployment-gate evidence outside the
   implementation team's screenshots or assertions;
10. publish a new finding-by-finding disposition with objective evidence.

Until all six P0 findings satisfy that protocol, the decision remains:

**REJECT — P0**
