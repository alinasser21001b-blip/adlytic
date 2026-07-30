# APPLE IMPLEMENTATION TRACKER

> Tracks every Apple/App Store requirement, its owner, and current status.
> Updated: 2026-07-30

## Status Legend

- DONE — implemented and verified
- BLOCKED — waiting on a dependency
- APPLE-DEV — owned by Apple developer
- PRODUCT-DECISION — needs product owner decision
- BACKEND — needs server-side work

---

## Critical Blockers

| # | Requirement | Owner | Status | File(s) | Dependency | Remaining Work |
|---|---|---|---|---|---|---|
| 1 | Native iOS wrapper (Capacitor) | Apple Dev + Product | PRODUCT-DECISION | — | Xcode, Apple Dev account | Choose Capacitor vs bare WKWebView; init project; build pipeline. See `APPLE_HANDOFF_TO_APPLE_DEV.md` |
| 2 | Health data encryption at rest | Product + Apple Dev | BLOCKED | `js/transport.js`, `js/ui-core.js` | Requires native wrapper first (Capacitor Preferences / Keychain) | Design: documented in handoff. Implementation requires native storage API. Cannot encrypt in localStorage alone without degrading Baghdad 3G performance. |
| 3 | Medical disclaimers | Product | PRODUCT-DECISION | `js/ui-discovery.js`, `js/ui-record.js` | Disclaimer text needs product/legal review | Apple Guideline 1.4.1 requires disclaimers before clinical data display. Draft text in `QAREEB_APPLE_HANDOFF.md` §15.3. Product team must approve exact wording and placement. |
| 4 | Public privacy policy URL | Apple Track | **DONE** | `privacy.html`, `netlify.toml` | None | Static page created at `/privacy`. Mirrors in-app policy. URL for App Store Connect: `https://<domain>/privacy` |
| 5 | Server-side account deletion | Backend | BLOCKED | — | Backend endpoint `POST /record/delete` | Client-side deletion exists. Server deletion interface documented. Backend must implement the endpoint. |

## Security Fixes

| # | Fix | Owner | Status | File(s) | Notes |
|---|---|---|---|---|---|
| 6 | Device ID: Math.random → crypto.getRandomValues | Apple Track | **DONE** | `js/transport.js:90` | Existing device IDs are not migrated (backward compatible — old IDs still work) |
| 7 | Content-Security-Policy header | Apple Track | **DONE** | `netlify.toml` | Allows self + Google Fonts + inline styles. Blocks eval, external scripts, iframes. |
| 8 | Web App Manifest | Apple Track | **DONE** | `manifest.webmanifest`, `index.html` | Arabic-first, standalone display, portrait orientation |

## Apple Developer Items

| # | Requirement | Status | Notes |
|---|---|---|---|
| 9 | Info.plist | APPLE-DEV | Template at `apple/Info.plist.template`. Needs native project. |
| 10 | PrivacyInfo.xcprivacy | APPLE-DEV | Template at `apple/PrivacyInfo.xcprivacy.template`. Needs native project. |
| 11 | App Store Connect privacy labels | APPLE-DEV | Matrix in `QAREEB_APPLE_HANDOFF.md` §9. Must be entered manually. |
| 12 | App Store screenshots | APPLE-DEV | 3 size classes minimum. Not created. |
| 13 | App icon (1024×1024) | APPLE-DEV | Must be PNG, no alpha, no rounded corners. |
| 14 | Export compliance questionnaire | APPLE-DEV | Uses standard TLS only. Mass-market exemption applies. |
| 15 | Age rating questionnaire | APPLE-DEV | Recommended 12+ (medical info + controlled substance references). |
| 16 | App Store review notes | APPLE-DEV | Draft in `QAREEB_APPLE_HANDOFF.md` §15.4. |

## Permission UX

| # | Permission | Current State | Apple Compliance | Owner | Remaining |
|---|---|---|---|---|---|
| 17 | Location (When In Use) | Works; no pre-prompt | PRODUCT-DECISION | Product | Add pre-prompt dialog before native iOS prompt. Design decision for Product team. |
| 18 | ATT (App Tracking Transparency) | Not needed | **COMPLIANT** | — | Zero tracking confirmed. No IDFA. No ATT prompt required. |
| 19 | Camera | Not used | **COMPLIANT** | — | Permissions-Policy blocks it. No `NSCameraUsageDescription` needed. |
| 20 | Notifications | Not implemented | **COMPLIANT** | — | No APNs. No permission needed for v1. |

## Authentication

| # | Item | Current State | Apple Impact | Owner | Status |
|---|---|---|---|---|---|
| 21 | Apple Sign In | Not needed | Not required — no social login | — | **COMPLIANT** |
| 22 | Patient auth | Phone + device-only OTP | Prototype quality; acceptable for v1 if clearly scoped | Product | PRODUCT-DECISION |
| 23 | Pharmacy auth | Licence + OTP (server-verified) | Acceptable | — | **COMPLIANT** |

## Data Minimisation Audit

| Data Field | Why Collected | Essential? | Sensitive? | Stored Where | Deletable? | Consent Required? | Status |
|---|---|---|---|---|---|---|---|
| Patient name | Health record identity | Yes (for record) | Yes | localStorage | Yes (delete data) | Implicit (user creates record) | OK |
| DOB | Clinical calculations, patient matching | Yes | Yes | localStorage | Yes | Implicit | OK |
| Sex | Clinical relevance | Yes | Yes | localStorage | Yes | Implicit | OK |
| Phone number | OTP auth for requests | Yes (for requests) | Yes | localStorage `qrb.auth` | Yes | User provides it | OK |
| GPS coordinates | Find nearest provider | Yes (core feature) | Yes | localStorage `qrb.gps` (ephemeral) | Yes | Explicit (location prompt) | OK |
| District | Area-based discovery | Yes | No | localStorage `qrb.district` | Yes | User selects it | OK |
| Medicine searches | Recent search convenience | No (convenience) | No | localStorage `qrb.recent` | Yes | None needed | OK — max 8, user can delete all |
| Saved doctors | Bookmarks | No (convenience) | No | localStorage `qrb.saved` | Yes | None needed | OK |
| Device ID | Sync deduplication | Yes (for sync) | No | localStorage `qareeb.device` | Yes | None needed | OK — random, not a fingerprint |
| Auth token | Session auth | Yes (for sync) | Yes (session) | localStorage `qareeb.token.v1` | Yes | Implicit | OK |
| Health conditions | Clinical record | Yes (for record) | Yes (health) | localStorage `qareeb.record.v1` | Yes | Implicit | NEEDS ENCRYPTION |
| Medications | Clinical record | Yes (for record) | Yes (health) | localStorage `qareeb.record.v1` | Yes | Implicit | NEEDS ENCRYPTION |
| Allergies | Clinical record + safety floor | Yes (for record) | Yes (health) | localStorage `qareeb.record.v1` | Yes | Implicit | NEEDS ENCRYPTION |
| Lab results | Clinical record | Yes (for record) | Yes (health) | localStorage `qareeb.record.v1` | Yes | Implicit | NEEDS ENCRYPTION |
| Religion/sect/ethnicity | — | **NO** | — | **NEVER COLLECTED** | — | — | **FORBIDDEN_FIELDS enforced** |
| Biometric data | — | **NO** | — | **NEVER COLLECTED** | — | — | **FORBIDDEN_FIELDS enforced** |
| ID/card photos | — | **NO** | — | **NEVER COLLECTED** | — | — | **FORBIDDEN_FIELDS enforced** |

**Conclusion:** No unnecessary data is collected. All collected data is essential for its stated purpose. The only gap is encryption at rest for health data (Blocker #2).

---

## Separation of Concerns

### What belongs to this (Apple) track:
- Privacy policy URL ✅
- CSP header ✅
- Web manifest ✅
- Device ID security ✅
- Info.plist / PrivacyInfo.xcprivacy templates ✅
- Privacy labels matrix ✅
- App Store metadata guidance ✅
- Test plan ✅

### What belongs to Product track:
- Medical disclaimers (wording and placement)
- Location pre-prompt UX design
- Health data encryption (requires native wrapper architecture)
- Server-side deletion endpoint
- Authentication architecture decisions

### What belongs to Apple Developer:
- Xcode project creation
- Capacitor integration
- App Store Connect configuration
- Screenshots and app icon
- Submission and review process

### What needs a Product Decision:
- Capacitor vs bare WKWebView
- Medical disclaimer exact wording
- Whether to add push notifications in v1
- Location pre-prompt UX design
- Age rating (12+ recommended but owner decides)
