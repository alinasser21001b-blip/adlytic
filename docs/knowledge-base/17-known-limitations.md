# 17 — Known Limitations

Honest, sourced. Ordered roughly by severity/blocking-ness.

## 1. Two non-interoperating product implementations coexist (structural, not a bug, but a real limitation for anyone new)

`dawai-platform` (shipped) and `platform/` (Blueprint v3 rebuild target) implement different identity models, different entity names, and in at least one place a **directly contradictory clinical-safety claim**: Blueprint v3 Phase 0 (`docs/technical/01-system-architecture.html`, clinical-engine "Must never": *"Ever return a clear result; in Phase 0 it returns only ALLOWED or REFUSED, never SAFE"* and *"Perform any interaction check — Phase 0 has none (D16)"*) explicitly has **no interaction-safety checking in Phase 0**, while `dawai-platform` migrations 0005–0007 **build a full severity-tiered interaction-safety engine** and treat it as already shipped. Neither document is "wrong" in isolation — they describe different systems — but a reader who doesn't know this will draw false conclusions about what "Dawai" currently does. See `19-open-decisions.md` §1 for the full contradiction writeup.

## 2. MVP readiness is qualified, not absolute

`docs/dawai/FINAL_MVP_READINESS.md` verdict: **"Pilot MVP READY (in-repo)" — explicitly NOT "nationwide production launch ready."** Concrete residual gaps it lists as non-blocking for a *supervised, human-staffed* Baghdad pilot but real:
- No anonymous `PatientSession` in the UI — the search/availability API is public, but the client still gates search behind an account.
- Overnight opening-hour edge cases and a hard prescription-review filter on matching are not fully handled.
- **No true offline mutation queue** — the service worker caches the app shell for offline *load*, but does not queue and replay writes; it does not invent progress while offline.
- Map "pins" in the UI are index-based placeholders, not real geo-projected positions.
- Request status enum names are compact (`ACTIVE` + `radius_km`) rather than the blueprint's richer labels (`ACTIVE_RADIUS_2KM`) — documented as behaviorally equivalent, not a functional gap (see mapping table in `05-state-machines.md`).

## 3. External/legal/infra blockers (cannot be resolved from inside the repo)

From `FINAL_MVP_READINESS.md` and `APP_STORE_READINESS.md`:
- Iraqi federal (and KRG, if applicable) legal review of prescription handling, privacy, retention, and controlled-medicine rules — not yet obtained.
- Managed PostgreSQL with PITR and an independently tested restore procedure — not provisioned (dev/test use PGlite only).
- Production TLS/DNS/reverse-proxy/incident-response ownership — undefined.
- Object storage + KMS for multi-node deployment — SigV4 adapter code exists, no real bucket/credentials wired.
- FCM/APNs/SMS provider accounts and DPAs — none configured; the outbox honestly stays `PENDING`/`FAILED` rather than faking delivery.
- Authoritative pharmacy registry and license-validation data for the Baghdad pilot roster — not sourced.
- Apple Developer Program account, macOS+Xcode environment, and a real-device Safari/VoiceOver-with-Arabic/Dynamic-Type QA pass — none available from this environment (`APP_STORE_READINESS.md` §9).
- `MALWARE_SCAN_URL` — optional scanner integration, unset.

## 4. Security residuals acknowledged as pilot-acceptable, not resolved

From `FINAL_MVP_READINESS.md` "SECURITY" section (overall verdict: PASS for pilot threat model):
- Admins can still decrypt any prescription file by role — needs an *operational* procedure (access review, logging discipline), not a code fix, before scaling past a small trusted pilot team.
- Exact coordinates are still stored server-side for matching even though `coarse_geohash` exists — the pharmacy inbox itself is scoped to use only area/distance, but the exact value persists in the DB.
- No MFA, no email verification, no phone OTP — deferred as external product decisions, not implemented.
- Append-only audit is **PARTIAL**: audit rows are not cryptographically hash-chained; nothing currently prevents a privileged DB-level actor from mutating `audit_events` (application code never does, but there is no chain-of-custody proof beyond that).
- Multi-node outbox claiming is **PARTIAL**: an optimistic claim strategy works for a single lifecycle worker but is not safe against duplicate claims if the worker is scaled to more than one instance (`SKIP LOCKED`-style locking noted as not yet implemented) — see `11-runtime.md` "Background jobs" and `18-technical-debt.md`.

## 5. AI/OCR pipeline is schema-ready, not functionally wired

`model_output_log` exists and is audited; the `OcrProvider` interface and the documented ≥0.85 confidence server-side gate are **not yet implemented against a real provider** (`docs/dawai/BLUEPRINT_EXECUTION.md` "Remaining work" item 1). `README.md`: OCR is "architecturally connected via secure upload, but does not claim extraction when no trusted provider is present" — i.e. it fails closed/absent rather than faking a result, consistent with the platform's honesty-over-guessing principle.

## 6. Interaction-safety dataset ingestion is incomplete

The schema and severity-tiering logic exist (migration `0005`), but real RxNorm-mapped DDInter/openFDA data ingestion is listed as remaining work (`BLUEPRINT_EXECUTION.md` item 2) — until ingested, `interaction_ingredients`/`drug_interactions` coverage is presumably minimal/seed-only, meaning most real regimens will correctly return `UNAVAILABLE` (fail-closed, per design) rather than a useful `CLEAR`/`INTERRUPT` result. This is a completeness gap, not a safety defect — the fail-closed behavior is the correct interim state.

## 7. Design fidelity / responsiveness

`docs/design/DESIGN_FIDELITY_REPORT.md` (485 lines) and `docs/design/RESPONSIVE_REPORT.md` (150 lines) exist specifically to document gaps between the design spec and the rendered implementation — not fully read line-by-line in this synthesis pass; treat their contents as authoritative on visual-fidelity gaps and read them directly before doing design-system work. Given they are generated against the **v3/`platform/` design system** (`docs/design/SCREEN_INVENTORY.md`'s own header confirms this: "Rendered and photographed: 17" out of 133 v3 screens, "NOT IMPLEMENTED: 111"), most of what they describe as "not implemented" is v3-track work, not a defect in the shipped `dawai-platform` UI.

## 8. Blueprint v3 itself documents 11 unresolved product gaps blocking its own screens

`docs/technical/11-validation-report.html` lists `BD-1` through `BD-11` (3 blockers, several major/minor) — e.g. no ERD entity for saved-pharmacies (blocks screen M4), no entity for price disputes (blocks screen O22), no entity for support tickets (blocks M15/P30/O20/O21), no persisted retention model for unmatched-search terms (blocks O10), no consent-capture entity for the consented-support-session flow (blocks O19), no resend/cancel model for invites, no export-artifact lifecycle, no device-registration entity for push (blocks all push-dependent flows on that track). These are Blueprint v3-track gaps and do not block `dawai-platform`, which solves the equivalent problems differently (or hasn't built the equivalent feature at all — e.g. `dawai-platform` also has no price-dispute or support-ticket feature).

## 9. Gender-inclusive Arabic copy is an unresolved product decision

`docs/product/review/INDEPENDENT_REVIEW.md` finding #1 (survived adversarial verification): all specified Arabic copy in the v1 blueprint is grammatically masculine second-person with no gender field anywhere in onboarding, and relationship-derived notification copy hard-codes assumptions (e.g. "your son requests…"). Not confirmed fixed in either implementation track in this review pass — check current copy in `dawai-platform/src/pages/*.tsx` and `styles.css`/locale strings before assuming it was addressed.
