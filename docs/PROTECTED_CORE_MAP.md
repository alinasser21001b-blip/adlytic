# Qareeb Protected Core Map

**Baseline:** `main` at `2b4b4a8`  
**Clinical product:** `hub/`  
**Status:** Independent QA protection boundary; this is not a UI specification.

## Scope decision

The repository contains three unrelated or partially overlapping products:

- `hub/` is Qareeb's deployed healthcare directory, medicine-demand network, longitudinal record, consent model, and serverless data plane. It is the protected clinical product.
- `qareeb-platform/` is an explicitly non-production React simulation of the S0–S5 medicine-availability journey. Its contracts are useful regression inputs but are not interchangeable with `hub/`.
- The repository root (`src/`, `prisma/`, root `package.json`) is Adlytic, an advertising product. It is outside this map.

Do not copy similarly named concepts between `hub/` and `qareeb-platform/` without a product-level contract decision. Their request states, controlled-medicine defaults, prescription envelopes, and consent vocabulary differ.

## Protection levels

- **Core-0 — trust boundary:** a casual change can cause identity, authorization, consent, clinical-meaning, or historical-integrity failure. Requires explicit domain review and targeted regression tests.
- **Core-1 — clinical workflow:** a change can break continuity, task closure, routing, synchronization, or minimum-necessary disclosure. Requires journey tests.
- **Semantic UI boundary:** visual code may be redesigned, but the named clinical meaning and reachability invariants remain protected.

## Core-0 modules

| Area | Files / symbols | Protected invariants |
|---|---|---|
| Patient identity and matching | `hub/js/emr.js`: `ID_TYPE`, `ID_VERIFY`, `canRegister`, `acceptCardScan`, `matchScore`, `matchVerdict`, `findCandidates`, `mergeDecision` | Internal opaque patient ID is the key; phone is not identity; government identifiers are optional typed attributes; forbidden identity fields are rejected; no silent merge. |
| Encounter and history integrity | `hub/js/emr.js`: `canSign`, `signEncounter`, `addAddendum`, `voidEncounter` | A signed encounter is immutable. Correction is an attributed addendum; wrong-patient content is voided, never silently deleted. |
| Longitudinal lists | `hub/js/emr.js`: `activeConditions`, `medStatus`, `currentMedications`, `criticalAllergies` | Active/historical remain distinct; stale problems are declared; expired or stale medicines become `unconfirmed`; stopped medicines retain stop reason; allergy criticality and verification are not collapsed. |
| Laboratory meaning | `hub/js/emr.js`: `flagResult`, `isAbnormal`, `isUnjudgeable`, `trend` | Value, unit, range, flag, date, and performer remain associated; no range means unjudgeable, not normal; mixed laboratories/units are never presented as one confident series. |
| Episode closure and safety registers | `hub/js/emr.js`: `EP_MACHINE`, `canCloseEpisode`, `deriveTasks`, `closeTask` | Pathology/follow-up blockers prevent closure; missing results, unacknowledged abnormal results, referrals, pathology, and follow-up remain queryable tasks until a named human acts. |
| Role authorization | `hub/js/emr.js`: `ROLE`, `CLASS`, `GRANTS`, `canAccess`, `breakGlass` | Reception/admin cannot read clinical content; a role alone is insufficient; emergency access is actor-bound, patient-bound, reasoned, time-limited, audited, and restricted to the emergency dataset unless separately escalated. |
| Consent and access decisions | `hub/js/consent.js`: `SCOPE`, `SAFETY_FLOOR`, `grantShare`, `grantSensitive`, `shareState`, `revokeShare`, `decideAccess`, `accessEntry`, `requestAccess`, `respondToRequest`, `issueCarryCode`, `redeemCarryCode`, `escalateEmergency`, `emergencyCard` | Opt-in, scoped, expiring, revocable consent; patient is the grantor; sensitive data needs a separate act; every allowed and denied read is audited; carry codes expire and are single-use; emergency access does not become a universal key. |
| Clinical assertion boundary | `hub/js/record.js`: document claims, prescriptions, appointments, `providerVerification`, `canWriteClinical`, `canReadShared`, `patientProfile`, `preVisitBrief` | Extracted data remains a claim until a qualified clinician acts; patient-reported and confirmed information remain distinguishable; only verified clinicians write authoritative assertions. |
| Minimum-necessary envelopes | `hub/js/network.js`: order/referral state machines, `orderEnvelope`, `verifyPrescription`, `dispenseChecks`, imaging study/report functions | Lab, imaging, pharmacy, and referral actors receive only task-relevant data; order/patient/facility associations cannot be widened by the UI. |
| Clinical assistance boundary | `hub/js/assist.js`: `FACT`, `INTERPRETATION`, `SUGGESTION`, `admitModelOutput`, `MODEL_BOUNDARY` | Model output cannot become fact, fabricate a source, close a task, diagnose, or mutate the record without a named human decision. |

## Server trust boundary

| Area | Files | Protected invariants |
|---|---|---|
| Shared authentication primitives | `hub/netlify/functions/_lib.mjs` | Missing/short secret fails closed; HMAC verification remains constant-time; OTP, Iraqi phone normalization, placeholder rejection, and rate-limit behavior are preserved. |
| Clinical authorization contract | `hub/netlify/functions/_record-core.mjs` | Actor comes from a signed token; patient/clinician/facility write sets remain disjoint; clinicians require verified status and active consent; facilities require the matching order; forbidden identity fields are rechecked server-side. |
| Immutable clinical collections | `hub/netlify/functions/_record-core.mjs`: `IMMUTABLE`, `validateEntry`, `applyWrite` | Encounters, prescriptions, results, studies, and documents cannot be overwritten; idempotent replay does not duplicate; stale mutable writes conflict rather than silently win. |
| Read minimization | `hub/netlify/functions/_record-core.mjs`: `SCOPE_COLLECTIONS`, `EMERGENCY_COLLECTIONS`, `decideRead`, `readableCollections`, `patientView` | Scope-to-collection mapping is server-owned; emergency actor/patient binding is checked; identifier values do not leave the server for non-patient readers. |
| Record persistence | `hub/netlify/functions/record.mjs` | One record per key; patient association is part of every key; audit writes are append-only keys; unreadable storage returns `503`, never a clinically false empty record. |
| Medicine demand persistence | `hub/netlify/functions/needs.mjs`, `_needs-core.mjs` | Patient identity and prescription content never enter the broadcast; controlled medicines fail closed; request state is derived; concurrent pharmacy answers use separate keys. |
| Pharmacy authentication/audit | `hub/netlify/functions/auth.mjs`, `audit.mjs` | Pharmacy session is branch-bound; placeholder credentials never authenticate; audit limitations (`wormBacked: false`) must remain explicit. |

## Core-1 modules

| Area | Files | Protected invariants |
|---|---|---|
| Local-first synchronization | `hub/js/sync.js`, `hub/js/transport.js` | Local write precedes network attempt; `opId` makes replay idempotent; local/sending/synced/failed/conflict are honest states; signed encounters use keep-both semantics while mutable lists require supersession/human resolution. |
| Medicine demand domain | `hub/js/domain.js` | OTC/RX/controlled classification, broadcast allowlist, consent, state machine, TTL, responder authorization, and hash-linked audit remain independent of presentation. Unknown medicine defaults to RX, not OTC. |
| Offline/local persistence schema | `hub/js/ui-core.js` (`LS` prefix `qrb.*`), `hub/js/ui-record.js` (`qareeb.record.v1`), `hub/js/ui-network.js` (`qareeb.facility.v1`) | Key names and collection shapes are data contracts. Migration is required before renaming or reshaping; historical data cannot be silently dropped. |
| Router and deep links | `hub/js/app.js`: `route`, hash-change focus handling | Existing clinical, consent, record, lab, imaging, pharmacy, and settings routes remain reachable or receive an explicit compatible redirect. Patient/facility/clinician context is not silently substituted. |
| Interoperability shape | `hub/js/emr.js`: `FHIR_MAP`, coded concepts/provenance | Mapping is an external contract. UI redesign must not alter stored coding, provenance, or source attribution. |

## Semantic UI boundary

These files may be radically redesigned, but the semantics below are protected:

- `hub/js/ui-record.js`
  - identity and safety context precede clinical detail;
  - allergy identity, reaction, severity, and verification status remain distinct;
  - medication name/strength/dose/frequency/status remain associated;
  - abnormal, acknowledged, pending, normal, and unjudgeable result states remain explicit;
  - every trend point keeps date, unit, range, and laboratory;
  - active/historical conditions and current/stopped/unconfirmed medicines remain separate;
  - episode-grouped chronology preserves cause-and-effect.
- `hub/js/ui-network.js`
  - laboratory values cannot be submitted without units and applicable ranges;
  - facility/order/patient association remains visible and enforced;
  - pending/completed/rejected states are not collapsed;
  - self-asserted actors are never presented as verified.
- `hub/js/ui-core.js`, `hub/js/app.js`
  - route guards, deep links, back behavior, patient context, and focus transfer survive navigation redesign.
- `hub/css/qareeb.css`, `hub/src/styles/identity.css`
  - RTL/LTR isolation for clinical numbers and units, text scaling, contrast, reduced motion, focus visibility, and 44×44 touch targets remain acceptance criteria.

## Explicitly incomplete capabilities

The following are not protected as “working” because the current product does not implement them end to end:

- verified clinician/facility identity issuance and patient authentication;
- patient search/lookup and clinician-side record selection;
- a clinician encounter-authoring route;
- a production notification channel for emergency access;
- blood-pressure/vital-sign modeling (including systolic/diastolic semantics);
- DICOM/PACS image retrieval;
- ingredient-class allergy matching and drug–drug/renal/pregnancy checks;
- production patient record backup from the UI (patient OTP sign-in is not built);
- WORM-backed audit storage;
- distributed rate limiting and true compare-and-swap for mutable records;
- detailed peri-operative workflow;
- server-side patient-data deletion.

No redesign may imply that these capabilities exist.

## Required change gate

Any change to a Core-0 file requires:

1. the exact invariant affected and threat/failure mode;
2. unit tests for allowed and denied paths;
3. a longitudinal journey test when clinical relationships change;
4. server-side verification when the rule crosses a trust boundary;
5. evidence that historical records remain readable and unmodified;
6. explicit review of Arabic/English mixed text, units, dates, and numbers.

Changes to presentation files require route, 320/390/430px, RTL, keyboard/focus, screen-reader-order, and clinical-semantic checks. Visual difference from the old interface is not a failure.
