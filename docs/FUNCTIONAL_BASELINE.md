# Qareeb Functional Baseline

**Baseline commit:** `2b4b4a8`  
**Primary application:** `hub/`  
**Secondary simulation:** `qareeb-platform/` (non-production; tested separately)

Legend:

- **WORKS** — executable and reachable in the current product.
- **DOMAIN ONLY** — protected logic/tests exist, but no complete user journey is reachable.
- **PARTIAL** — some steps work, but continuity, trust, or completion is missing.
- **ABSENT** — no implementation was found.
- **UNSAFE** — reachable behavior violates a safety/trust invariant.

## Patient

| Journey | Baseline | Evidence / limitation |
|---|---|---|
| Registration | **WORKS, local only** | `#/record` → `recordCreate`; `EMR.canRegister` supports patients without government ID. The record is stored in `qrb.qareeb.record.v1`. |
| Identity validation | **DOMAIN ONLY** | `EMR.acceptCardScan`, verification tiers, forbidden fields, and identifier validity windows exist. No production registry or identity service is connected. |
| Identity matching | **DOMAIN ONLY** | `EMR.findCandidates`, `matchScore`, `matchVerdict`, and `mergeDecision` are tested. There is no patient-search/match UI or reconciliation queue. |
| Patient lookup | **ABSENT** | No clinician-facing search or patient-selection route exists. `screenClinical(patientId)` ignores its `patientId` argument. |
| Patient creation by clinician/registration | **ABSENT** | Only a patient creating the local record on the current device is reachable. |
| Own-record access | **WORKS, local only** | `#/record` and sections are reachable from bottom navigation. No patient login is required on the device. |
| Cross-device record access | **PARTIAL** | Server record plane and sync/outbox exist, but `#/record/signin` states that patient OTP sign-in is not built. |
| Data deletion | **PARTIAL** | Local deletion UI exists; server-side deletion is not implemented. |

## Clinician

| Journey | Baseline | Evidence / limitation |
|---|---|---|
| Create clinician profile | **UNSAFE** | `#/clinical` accepts a self-asserted local profile. It is not an authenticated professional identity. |
| Open a selected patient | **ABSENT** | No patient lookup/selection; clinical view reads whichever record is in the same browser storage. |
| Understand current state | **PARTIAL** | Clinical snapshot contains identity, allergies, active problems, current medicines, abnormal unacknowledged results, open loops, and last encounter. It requires a local record and consent/emergency decision. |
| Review allergies | **UNSAFE** | Identity/reaction appear, but `criticality: unable-to-assess` is rendered as “low” in `ui-record.js`. Verification status is not shown. |
| Review medications | **WORKS with limitations** | Current/unconfirmed/stopped are separated; dose/frequency/indication and stop reason are shown when present. Mixed Arabic/Latin strength is not explicitly bidi-isolated per component. |
| Review active problems | **WORKS** | Active/past and stale/chronic states are separated. |
| Review previous events | **PARTIAL** | Timeline and visits exist, but clinician navigation entry is not exposed from clinician home. |
| Record encounter | **BROKEN** | `#/clinical/encounter` routes back to `screenClinical("encounter")`; the argument is ignored and no encounter form appears. |
| Confirm extracted claim | **PARTIAL** | Inbox exists and write gate uses `REC.canWriteClinical`; no production verified-clinician identity can be issued from the UI. |

## Care

| Journey | Baseline | Evidence / limitation |
|---|---|---|
| Create care episode | **DOMAIN ONLY** | Episode state machine exists; no authoring UI. |
| Add event/encounter | **BROKEN UI** | Domain signing/addendum/void logic is tested; encounter route is miswired. |
| Referral | **DOMAIN ONLY** | `NET.sendReferral`, response state, and missing-response tasks exist; no reachable authoring workflow. |
| Investigation/order | **PARTIAL / orphaned** | Lab and imaging screens exist but are not linked from primary/role navigation and depend on seeded/local data. |
| Result | **UNSAFE local path** | A self-asserted facility profile can write a result into local authoritative display before server acceptance. Server authorization is stricter but normal UI authentication is not connected. |
| Procedure | **READ ONLY** | Procedures render and enter timeline/episodes; no complete authoring workflow. |
| Pathology | **DOMAIN ONLY** | Pending pathology blocks episode closure; procedure display can show pathology. No end-to-end pathology workflow. |
| Follow-up | **PARTIAL** | Open/overdue tasks render; task derivation is tested. No complete scheduling/ownership workflow from UI. |
| Close episode | **DOMAIN ONLY** | `canCloseEpisode` blocks closure with pending supplementary information/tasks; no UI action. |

## Consent

| Journey | Baseline | Evidence / limitation |
|---|---|---|
| Issue access request | **WORKS locally** | Clinician request creates a 15-minute local request with stated purpose. It is not delivered to another device. |
| Receive/respond | **WORKS on same browser** | Patient request route supports approve/decline, scope narrowing, and duration. |
| Grant | **WORKS locally** | Patient-only grant, scope validation, allergy safety floor, expiry, and modality are enforced in domain code. |
| Redeem carry code | **DOMAIN ONLY** | Issue/redeem rules are tested; UI issues a carry code but no clinician redemption route was found. |
| Revoke | **WORKS locally** | Patient can revoke without reason; access state is derived immediately. |
| Sensitive consent | **DOMAIN ONLY** | Separate grant exists but no complete UI journey was found. |
| Server-enforced sharing | **PARTIAL** | Record-plane checks exist. Patient/clinician authentication and normal sync are not connected end to end. |

## Results

| State | Baseline | Evidence / limitation |
|---|---|---|
| Normal | **DOMAIN WORKS / UI PARTIAL** | Range-derived `normal` exists. UI shows a green status but does not show the range/date/lab per point. |
| Abnormal | **DOMAIN WORKS / UI PARTIAL** | Stored or computed abnormal state is supported; unacknowledged abnormal results create tasks. Patient lab list does not explicitly label abnormality beyond status styling. |
| Critical | **DOMAIN WORKS / UI PARTIAL** | Lab can mark a value critical; no verified delivery/notification escalation is implemented. |
| Improving/worsening | **PARTIAL** | Domain reports rising/falling, not clinical valence. UI uses an arrow sequence without point dates; no safe “improving/worsening” conclusion is made. |
| Mixed labs/units | **WORKS with warning** | Domain marks the series non-comparable and UI warns, but still renders the values as one arrow sequence. |
| Unjudgeable/no range | **UNSAFE UI** | Domain returns `unknown`/`isUnjudgeable`; patient UI applies a danger style but provides no explicit “cannot judge/no reference range” label. |
| Pending/completed | **WORKS with limitations** | Pending results and order states exist. Facility routes are orphaned from normal role navigation. |

## Emergency

| Journey | Baseline | Evidence / limitation |
|---|---|---|
| Emergency card derivation | **DOMAIN ONLY** | `CONSENT.emergencyCard` includes allergies, medications, conditions, blood group/contact, and explicit missing-data statements. |
| Tier-1 break-glass | **UNSAFE client path** | Scope is correctly limited, but client `CONSENT.decideAccess` checks only whether a grant is active; it does not bind the grant to the current actor/patient. |
| Tier-2 escalation | **DOMAIN ONLY** | Separate reason and shorter duration exist. No complete server-connected UI journey. |
| Patient notification | **ABSENT but claimed** | UI says the patient was notified; the product has no push/SMS notification implementation. |
| Emergency telephone | **BLOCKED FOR RELEASE** | Preflight requires independent verification; seed currently reports `911` and all facility numbers are placeholders. |
| Blood group | **DOMAIN ONLY** | Emergency card can state missing blood group; the current clinical break-glass screen does not render the emergency card. |

## Longitudinal continuity scenario

| Link | Baseline |
|---|---|
| symptoms → assessment | Domain/tested; encounter authoring UI absent |
| assessment → investigation | Domain/tested |
| investigation → abnormal result | Domain/tested; facility local trust path unsafe |
| abnormal result → acknowledgement task | **WORKS in domain/tests** |
| referral → response task | **WORKS in domain/tests** |
| procedure → pathology pending | **WORKS in domain/tests** |
| pathology → follow-up → closure | **WORKS in domain/tests** |
| clinician reads the related story | **WORKS in domain acceptance tests**; UI timeline groups by episode |
| same story across devices/clinics | **NOT ESTABLISHED**; authentication/sync UI is incomplete |

## Route baseline

Router: `hub/js/app.js::route`.

| Route group | Reachability |
|---|---|
| Discovery/directory/medicine/settings | Linked from home, search, cards, or bottom navigation. |
| `#/record` and record sections | Linked from bottom navigation and record overview. |
| `#/clinical`, `#/clinical/inbox` | Router-reachable, but not linked from clinician home/main navigation. |
| `#/clinical/encounter` | Link exists but destination is miswired. |
| `#/lab`, `#/imaging`, `#/pharmacy-rx` | Router-reachable but not linked from primary role navigation. |
| Carry-code redemption | No route found. |
| Patient lookup/selection | No route found. |

## Executable baseline commands

```bash
cd hub
npm ci
npm test
npm run preflight

cd ../qareeb-platform
npm ci
npm run check
npm test
npm run build
```

The simulation's current dependencies require Node `22.22.2` or later. On the cloud image, invoke Vitest with that exact Node binary; the default Node `22.14.0` produces cross-realm WebCrypto failures that do not reproduce on the supported runtime.
