# Qareeb Patient Medicine Journey

## 1. Metadata

- Status: Approved
- Product: Qareeb Medicine Network
- Scope: Patient discovery, medicine disambiguation, prescription consent/upload,
  anonymized pharmacy broadcast, event-driven availability radar, and temporary hold
- Primary locale: Arabic (RTL)
- Secondary search locales: Kurdish and English
- Deployment target: Netlify-compatible web application
- Approved by: Product owner, 2026-07-28

## 2. Context

Qareeb must help a patient locate a precise medicine presentation at a licensed
nearby pharmacy without exposing prescription images or medical notes to a pharmacy
network. Availability must be represented as a time-bound, attributable claim—not
as permanent inventory truth.

The first deliverable is a production-shaped interactive simulation. It must make
the intended privacy and safety boundaries executable and testable while clearly
identifying integrations that require external credentials or regulatory approval.
It must not claim that simulated pharmacy, Gudea, encryption-key, or dispensing
events are production services.

## 3. Functional requirements

### Discovery and medicine identity

- FR-01: The application MUST display an always-visible active location chip.
- FR-02: The application MUST provide one search entry supporting typed medicine
  names, package image capture/upload, and barcode entry.
- FR-03: Search normalization MUST support Arabic, Kurdish, and English aliases and
  common Arabic spelling variants.
- FR-04: The application MUST NOT silently select a medicine when multiple strengths,
  forms, routes, release mechanisms, or pack sizes match.
- FR-05: The disambiguation screen MUST require an explicit presentation selection.
- FR-06: A medicine identity screen MUST separate trade name, INN/scientific name,
  strength, dosage form, route, pack size, prescription class, reported price, and
  government-reference status.

### Consent and prescription handling

- FR-07: OTC medicines MAY continue directly to availability discovery.
- FR-08: Prescription medicines MUST pass an explicit consent gate before image or
  medical-note capture.
- FR-09: Consent MUST describe purpose, recipients, retention, withdrawal, and the
  fact that selected-pharmacy access is audited.
- FR-10: The application MUST reject unsupported files and MUST enforce a configurable
  maximum upload size.
- FR-11: A prescription asset MUST be encrypted before simulated persistence.
- FR-12: Prescription assets and medical notes MUST be marked for deletion 24 hours
  after hold expiry or cancellation.
- FR-13: The application MUST NOT include prescription images or medical notes in an
  availability broadcast.
- FR-14: Only the accepted, verified pharmacy role MAY receive temporary prescription
  access, and every access MUST create an append-only audit event.

### Demand and broadcast

- FR-15: Demand signals MUST progress through S0 search, S1 zero-result search, S2
  availability request dispatched, S3 pharmacist matched prescription, S4 active
  hold, and S5 confirmed dispensing.
- FR-16: The system MUST NOT infer or skip a demand stage.
- FR-17: A public broadcast MUST contain only canonical medicine/presentation identity,
  coarse location, request class, and non-identifying request metadata.
- FR-18: Controlled medicines MUST NOT enter the public broadcast or public
  availability map.
- FR-19: Controlled medicines MUST display a dedicated licensed-pharmacy handoff.

### Event-driven radar

- FR-20: Radar status MUST be driven only by timestamped backend-domain events.
- FR-21: The interface MUST NOT show fabricated percentages, fake progress bars, or
  pharmacy counts that were not emitted by the event source.
- FR-22: Supported events MUST include RequestCreated, BroadcastDispatched,
  PharmacyReviewing, PharmacyDeclined, PharmacyConfirmed, PrescriptionAccessGranted,
  PrescriptionMatched, HoldActivated, HoldExpired, and RequestTimedOut.
- FR-23: A disconnected event stream MUST present a recoverable offline state without
  inventing progress.

### Gudea and pricing

- FR-24: Government data MUST be accessed through a GudeaProviderAdapter contract.
- FR-25: A failed or unavailable adapter MUST display “تعذر التحقق من التسعير/الهوية
  الحكومية حالياً” and MUST NOT block the patient journey.
- FR-26: The official reference price and pharmacy-reported price MUST be visually and
  semantically separate.
- FR-27: Pharmacy price confirmation MUST include pharmacy, exact presentation, IQD
  amount, and confirmation timestamp.

### Hold

- FR-28: A hold timer MUST NOT start on search, consent, upload, or broadcast.
- FR-29: A hold MAY start only after a verified pharmacy accepts, presentation details
  match, and a unique reference is issued.
- FR-30: The success screen MUST show hold reference, exact presentation, pharmacy,
  pharmacy-confirmed price and timestamp, expiry time, directions, phone, and WhatsApp.
- FR-31: Expired holds MUST lose active status and MUST NOT continue to claim reserved
  availability.

### Simulation integrity

- FR-32: The demo MUST visibly identify itself as a simulation.
- FR-33: Simulated events MUST use the same domain contracts and transition guards as
  a production event source.
- FR-34: The demo MUST include selectable OTC, RX, controlled, ambiguous, Gudea
  unavailable, pharmacy-decline, timeout, and success scenarios.

## 4. Non-functional requirements

- NFR-01: The patient flow MUST work at 360 px without horizontal page overflow.
- NFR-02: All interactive targets MUST be at least 44×44 CSS pixels.
- NFR-03: Text/background combinations MUST meet WCAG 2.2 AA contrast.
- NFR-04: The UI MUST remain understandable without color and support keyboard focus.
- NFR-05: The UI MUST honor `prefers-reduced-motion`.
- NFR-06: No third-party advertising or behavioral tracking scripts MAY be included.
- NFR-07: Medicine names and medical notes MUST NOT be placed in URL query strings.
- NFR-08: Production transport MUST require HTTPS. The static demo MUST not claim it
  can enforce TLS termination.
- NFR-09: Encryption MUST use authenticated AES-256-GCM in the simulation. Production
  deployment MUST replace the demo key lifecycle with envelope encryption backed by a
  managed KMS.
- NFR-10: Audit events MUST be append-only at the domain API and hash-linked in the
  simulation. Production immutability requires database permissions/WORM controls.
- NFR-11: Arabic MUST be the source UI and use RTL logical layout.
- NFR-12: The production build MUST have no TypeScript errors and all domain tests
  MUST pass.

## 5. Acceptance criteria

- AC-01 (FR-03, FR-04): Given an Arabic alias matching multiple presentations, when
  the patient searches, then no presentation is selected and the disambiguation
  screen lists exact differentiators.
- AC-02 (FR-08, FR-09): Given an RX medicine, when consent has not been granted, then
  upload and note controls are unavailable.
- AC-03 (FR-11, NFR-09): Given an accepted image, when it is staged, then persisted
  bytes are AES-GCM ciphertext and not byte-equal to the original file.
- AC-04 (FR-13, FR-17): Given an uploaded prescription and note, when a request is
  broadcast, then the broadcast payload contains neither.
- AC-05 (FR-15, FR-16): Given a new search, when events progress, then every recorded
  demand transition follows the allowed state graph.
- AC-06 (FR-18, FR-19): Given a controlled medicine, when availability is requested,
  then no public broadcast is created and the controlled handoff is shown.
- AC-07 (FR-20, FR-21): Given an active request, when no domain event arrives, then
  the radar does not increment counters or claim pharmacy activity.
- AC-08 (FR-25): Given Gudea is unavailable, when medicine identity loads, then an
  honest unavailable state appears and availability search remains usable.
- AC-09 (FR-28, FR-29): Given a pharmacy is merely reviewing, when time passes, then
  no hold countdown exists.
- AC-10 (FR-29, FR-30): Given match confirmation and reference issuance, when
  HoldActivated arrives, then the countdown and complete confirmation details appear.
- AC-11 (FR-31): Given the hold expiry time passes, when the timer updates, then the
  reservation is marked expired and action copy no longer claims an active hold.
- AC-12 (NFR-01, NFR-04, NFR-05): Given 360 px width, keyboard navigation, or reduced
  motion, then content remains operable, focused elements are visible, and decorative
  animation is disabled.

## 6. Edge cases

- EC-01: Empty or punctuation-only search.
- EC-02: Look-alike/sound-alike medicine with unsafe fuzzy match.
- EC-03: Unsupported image type or oversized image.
- EC-04: Consent withdrawn before broadcast.
- EC-05: Encryption operation fails.
- EC-06: Gudea unavailable, times out, or returns mismatched presentation data.
- EC-07: Event connection drops during pharmacy review.
- EC-08: Every pharmacy declines.
- EC-09: Request times out with no pharmacy response.
- EC-10: Pharmacy accepts but then rejects presentation match.
- EC-11: Hold activation event arrives out of order.
- EC-12: Hold expires while confirmation screen is open.
- EC-13: Controlled classification is unknown; safest classification wins.
- EC-14: Browser reloads during an active demo request.
- EC-15: User denies camera permission and falls back to file upload.

## 7. API and event contracts

```ts
type DemandStage = "S0" | "S1" | "S2" | "S3" | "S4" | "S5";
type PrescriptionClass = "OTC" | "RX" | "CONTROLLED" | "UNKNOWN";

interface MedicinePresentation {
  canonicalId: string;
  brandName: string;
  scientificName: string;
  strength: string;
  dosageForm: string;
  route: string;
  releaseMechanism: string;
  packSize: string;
  prescriptionClass: PrescriptionClass;
}

interface AvailabilityBroadcast {
  requestId: string;
  canonicalId: string;
  coarseDistrict: string;
  requestClass: "OTC" | "PRESCRIPTION_VERIFIED";
  createdAt: string;
}

interface PharmacyPriceConfirmation {
  pharmacyId: string;
  pharmacyName: string;
  canonicalId: string;
  amountIqd: number;
  confirmedAt: string;
}

type RadarEvent =
  | { type: "RequestCreated"; at: string; requestId: string }
  | { type: "BroadcastDispatched"; at: string; licensedRecipients: number }
  | { type: "PharmacyReviewing"; at: string; pharmacyId: string }
  | { type: "PharmacyDeclined"; at: string; pharmacyId: string }
  | { type: "PharmacyConfirmed"; at: string; confirmation: PharmacyPriceConfirmation }
  | { type: "PrescriptionAccessGranted"; at: string; pharmacyId: string; auditId: string }
  | { type: "PrescriptionMatched"; at: string; pharmacyId: string; canonicalId: string }
  | { type: "HoldActivated"; at: string; reference: string; expiresAt: string }
  | { type: "HoldExpired"; at: string; reference: string }
  | { type: "RequestTimedOut"; at: string; requestId: string };

interface GudeaProviderAdapter {
  lookup(canonicalId: string): Promise<
    | { status: "verified"; officialPriceIqd: number; verifiedAt: string }
    | { status: "unavailable"; reason: string }
  >;
}
```

Production endpoint targets:

```text
POST /api/consents
POST /api/prescriptions/envelopes
POST /api/availability-requests
GET  /api/availability-requests/:id/events
POST /api/pharmacy/availability-requests/:id/responses
POST /api/pharmacy/prescriptions/:id/access
POST /api/holds
POST /api/holds/:id/dispense
```

## 8. Data models

| Entity | Required fields and constraints |
|---|---|
| consent_records | id, anonymous_session_id, version, purpose, granted_at, withdrawn_at nullable |
| prescription_envelopes | id, ciphertext_locator, encrypted_data_key, iv, auth_tag, expires_at, deletion_status |
| availability_requests | id, canonical_id, coarse_district, request_class, demand_stage, created_at, status |
| pharmacy_responses | id, request_id, pharmacy_id, response, responded_at; unique request+pharmacy |
| prescription_access_audit_log | id, prescription_id, pharmacist_id, pharmacy_id, reason, accessed_at, previous_hash, entry_hash |
| hold_records | id, request_id unique, pharmacy_id, canonical_id, reference unique, amount_iqd, price_confirmed_at, activated_at, expires_at, status |
| demand_signal_events | id, anonymous_cohort, request_id nullable, stage, district, canonical_id, occurred_at |
| medicine_presentations | canonical_id, names/aliases, strength, form, route, release, pack, prescription_class, jurisdiction |
| pharmacy_licenses | pharmacy_id, authority, license_number, status, expires_at, last_verified_at |

## 9. Out of scope

- OS-01: Real dispensing, payment, delivery, or prescription transfer.
- OS-02: Automatic therapeutic substitution or dosage advice.
- OS-03: Public controlled-medicine inventory.
- OS-04: A production Gudea integration without an authorized API contract.
- OS-05: Production pharmacy-license verification without authority access.
- OS-06: Production KMS, object storage, database, pharmacist authentication, and
  immutable audit infrastructure; interfaces and deployment requirements are included,
  but credentials/infrastructure are not fabricated.
- OS-07: Netlify deployment or any remote push. The owner will deploy manually.
- OS-08: Changes to the Adlytic repository.
