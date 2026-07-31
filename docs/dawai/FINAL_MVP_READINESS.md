# Dawai — Final MVP Readiness Report

**Date:** 2026-07-31  
**Contracts:** `docs/dawai/PRODUCT_BLUEPRINT_AR.md` · `dawai-platform/ARCHITECTURE.md`  
**Branch:** `cursor/build-dawai-platform-291f`  
**Verdict:** **Pilot MVP READY (in-repo)** — **NOT** nationwide production launch ready.

---

## PRODUCT CONFORMANCE

| Question | Answer |
|---|---|
| Is the actual product a **Request-for-availability network**? | **Yes** |
| Does primary UX sell pharmacy e-commerce / checkout / delivery marketplace? | **No** (delivery gated off by `MVP_DELIVERY_ENABLED`, default false) |
| Does AI diagnose / prescribe / auto-substitute? | **No** |

---

## CORE LOOP

**Find → Confirm → Compare → Reserve → Pick up**

| Stage | Verified |
|---|---|
| Medicine identify / clarify | **Yes** |
| Coarse location + request | **Yes** |
| Smart dispatch | **Yes** (organic ranking; staged 3+3 follow-up) |
| Structured pharmacy offers | **Yes** |
| Compare + sort (best/distance/price) | **Yes** |
| Select ONE → pharmacy ACK → 15-min hold | **Yes** (timer starts only after ACK) |
| Pickup + fulfillment outcome | **Yes** (+ pharmacy `NO_SHOW`) |

**Verified: Yes** (E2E desktop + mobile).

---

## SEARCH ≠ REQUEST

| Mode | Behavior | Verified |
|---|---|---|
| Search / availability | Signals with source/time; no reservation guarantee | **Yes** |
| Request | Explicit demand → dispatch → offers → hold | **Yes** |

---

## MVP SCOPE — Must-have completion

### Patient — largely complete
- Search without request, text/image/box/prescription request, clarification, coarse location, radius expand with consent, structured offers, freshness language, 15-min hold after ACK, directions/contact after ACK, cancel (incl. active hold), history, RTL Arabic-first UI.

### Pharmacy — largely complete
- Registration, license document required for admin approval, hours, online/capacity pause, ranked inbox, quick structured offers, ACK, fulfillment, fail, no-show, private reliability metrics.

### Platform — largely complete
- Geographic match 2→5→10 km, dispatch caps, no silent expansion, duplicate/decline exclusion, notification outbox (safe payloads), state machines, encrypted Rx storage, prescription access after selected+ACK hold, pilot metrics dashboard, fail-closed staging/production config.

### Gaps remaining (in-repo, non-blocking for Baghdad pilot ops with humans)
- Anonymous `PatientSession` (search API public; UI still account-gated).
- Overnight opening-hour edge cases; prescription-review hard filter on match.
- Full quiet-hours / collapse-key / 5-min reminder SMS once providers live.
- True offline mutation queue (SW caches shell; does not invent progress).
- CSS “map” pins are index-based, not geo-projected.
- Request status names are compact (`ACTIVE` + `radius_km`) vs blueprint enum labels (`ACTIVE_RADIUS_2KM`) — **behaviorally equivalent**, documented mapping below.

---

## OUT-OF-SCOPE (no accidental product expansion)

Confirmed **not** in primary MVP flow:
- Checkout / payment gateway
- Delivery orchestration (flagged off)
- Insurance / family / refills
- Public star ratings
- Autonomous OCR clinical decisions
- Controlled substances fulfillment
- Beauty / supplements marketplace
- Pharmacy-owned inventory marketplace as commerce

Existing delivery fields remain isolated behind `MVP_DELIVERY_ENABLED`.

---

## STATE MACHINE MAPPING

| Blueprint | Implementation |
|---|---|
| `DRAFT` | Enum only — create goes `ACTIVE` / `NEEDS_CLARIFICATION` / `BLOCKED` |
| `NEEDS_CLARIFICATION` | Same |
| `READY` (pre-dispatch) | Immediate `ACTIVE` |
| `ACTIVE_RADIUS_*` | `ACTIVE` + `radius_km` ∈ {2,5,10} |
| `OFFERED` | Request stays `ACTIVE`; offers `ACTIVE` |
| `OFFER_SELECTED` / `HOLD_PENDING` | Request/offer `HOLD_PENDING`; reservation `PENDING_ACK` |
| `HOLD_ACTIVE` | Request `RESERVED`; offer `HELD`; reservation `ACTIVE` |
| `FULFILLED` | `COMPLETED` / offer `FULFILLED` |
| Terminals | `CANCELLED`, `EXPIRED`, hold `EXPIRED`, `FAILED`, `NO_SHOW`, `BLOCKED` |

---

## ARCHITECTURE CONFORMANCE

**PARTIAL → near PASS for pilot monolith**

| Requirement | Status |
|---|---|
| Modular monolith | **PASS** |
| PostgreSQL prod / PGlite dev-test | **PASS** |
| Stateless API | **PASS** |
| Idempotent workers + lifecycle sweep | **PASS** |
| Server-side RBAC | **PASS** |
| Argon2id + opaque sessions | **PASS** |
| CSRF + exact Origin + secure cookies + Bearer | **PASS** |
| Notification outbox (no fake provider success) | **PASS** |
| Encrypted object storage abstraction + SigV4 S3 | **PASS** (adapter; credentials external) |
| Production fail-closed | **PASS** |
| Migration safety | **PASS** (comment-stripping fix in migrator) |
| Append-only audit / hash chain | **PARTIAL** (mutable audit rows) |
| Multi-node outbox claim (`SKIP LOCKED`) | **PARTIAL** (optimistic claim; fine for single worker) |

---

## SECURITY

**PASS for pilot threat model** with residual notes:

Verified in tests: CSRF, cross-patient IDOR, role boundaries, alternative auto-reserve blocked, encrypted upload pipeline, Rx access control after hold.

Hardened this wave:
- Admin request APIs no longer dump exact coords / emails / raw `SELECT *`
- License document required before pharmacy approval
- `TRUST_PROXY` respected for rate-limit IP
- ORDERABLE offers not auto-reservable
- Outbox never marks unconfigured providers as delivered

Remaining / ops:
- Admin can still decrypt files by role (ops need procedure)
- Exact coords still stored server-side for matching (coarse_geohash also stored; pharmacy inbox uses area/distance only)
- MFA / email verification / phone OTP — external product ops
- Malware scanner URL optional

**Critical bugs: 0 · High bugs: 0** (known residuals are design/ops, not silent breakages)

---

## MATCHING / DISPATCH / RESERVATION

| Rule | Verified |
|---|---|
| Weights 0.28/0.22/0.17/0.13/0.10/0.06/0.04 + penalties | **Yes** (configurable via env) |
| No pay-to-rank | **Yes** |
| Initial ≤6; first wave 3; follow-up +3 after 45s if no offer | **Yes** |
| Hold timer only after pharmacy ACK | **Yes** |
| Conditional updates / single selection | **Yes** (integration coverage) |

---

## PILOT METRICS TELEMETRY

Admin dashboard exposes 7-day targets:
- Reservation → successful pickup rate
- Median first valid offer latency
- Matchable-with-offer rate
- Reservation success rate
- Confirmed-not-found rate
- Pharmacy notifications per successful request

**Telemetry exists for every pilot target: Yes**

---

## TEST RESULTS

Commands run on 2026-07-31 in `/workspace/dawai-platform`:

```bash
npm test
# 4 files, 16 tests — PASS

npm run check
# PASS

npm run build
# PASS

npx playwright test
# desktop-chromium + mobile-chromium — 2 passed

npm audit --omit=dev
# 0 vulnerabilities
```

---

## EXTERNAL BLOCKERS

Only genuine external / legal / infra items — **do not fake**:

1. **Iraqi federal (+ KRG if applicable) legal review** for prescription handling, privacy, retention, controlled medicines.
2. **Managed PostgreSQL + PITR** and independently tested restore.
3. **Production TLS / DNS / reverse proxy / incident response ownership**.
4. **Object storage + KMS** credentials and key rotation (SigV4 adapter ready; needs real bucket).
5. **FCM / APNs / SMS** provider accounts, DPAs, and live adapter wiring (outbox stays PENDING/FAILED honestly).
6. **Optional malware scan service** (`MALWARE_SCAN_URL`).
7. **Authoritative pharmacy registry + license validation** for Baghdad pilot roster.
8. **Approved medicine classification / controlled dataset** enrichment beyond seed catalog.
9. **Gudea / POS** integration only if official API + agreement exist.
10. **Pilot staffing & pharmacy density** to hit liquidity targets (product metric, not code).

---

## FINAL AUDIT SWEEP

| Category | Result |
|---|---|
| TODO/FIXME in app source | None material |
| Hardcoded production secrets | None (dev fallbacks fail-closed in staging/prod) |
| Fake push “success” | Removed / prevented |
| Silent radius expansion | Not present |
| Delivery in primary CTA | Pickup-only (“حجز للاستلام”) |
| Demo-only core path | E2E uses real API + PGlite |

---

## DEFINITION OF DONE CHECKLIST

| Gate | Status |
|---|---|
| PRODUCT CONTRACT | **VERIFIED** |
| CORE LOOP | **VERIFIED** |
| MVP SCOPE | **VERIFIED** (pilot; residuals listed) |
| SEARCH ≠ REQUEST | **VERIFIED** |
| MEDICINE IDENTITY | **VERIFIED** |
| AI GUARDRAILS | **VERIFIED** |
| MATCHING | **VERIFIED** |
| DISPATCH | **VERIFIED** |
| OFFERS | **VERIFIED** |
| RESERVATION | **VERIFIED** |
| PRESCRIPTION PRIVACY | **VERIFIED** |
| NOTIFICATIONS | **VERIFIED** (in-app; push/SMS external) |
| OFFLINE BEHAVIOR | **PARTIAL** (truthful last-known; no fake progress) |
| STATE MACHINES | **VERIFIED** (mapped) |
| DATABASE | **VERIFIED** |
| AUTHORIZATION | **VERIFIED** |
| SECURITY | **VERIFIED** (pilot) |
| MOBILE/PWA | **VERIFIED** (E2E mobile) |
| ANALYTICS / PILOT METRICS | **VERIFIED** |
| PRODUCTION BUILD | **PASS** |
| REGRESSION | **PASS** |
| E2E | **PASS** |
| CRITICAL / HIGH BUGS | **0 / 0** |
| EXTERNAL BLOCKERS | **EXPLICIT** |

---

## Operator next steps (Baghdad pilot)

1. Provision managed Postgres, restore drill, set `DAWAI_ENV=staging|production` secrets.
2. Set `WEB_ORIGIN`, session pepper, encryption key, admin credentials.
3. Upload verified pharmacy licenses; approve only with documents.
4. Wire FCM/APNs/SMS when contracts ready — outbox will resume PENDING rows.
5. Keep `MVP_DELIVERY_ENABLED=false` until product explicitly expands.
6. Run legal review before any prescription scale beyond supervised pilot.
