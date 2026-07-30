# APPLE IMPLEMENTATION TRACKER

> Tracks every Apple/App Store item, correctly classified against actual
> Apple App Review Guidelines (June 2026) with exact citations.
> Updated: 2026-07-30

## Classification Legend

| Category | Meaning |
|---|---|
| **Apple-mandated** | Explicitly required by a specific Apple guideline; rejection risk if missing |
| **Apple-recommended** | Encouraged by Apple docs but not a rejection criterion |
| **Engineering recommendation** | Good practice; not an Apple requirement |
| **Backend blocker** | Requires server-side work before it can proceed |
| **Product decision** | Requires product owner input |
| **Apple Developer task** | Requires Xcode / Apple Developer account |
| **Unknown** | Cannot verify against official Apple documentation |

## Status Legend

- DONE — implemented and verified
- BLOCKED — waiting on a dependency
- APPLE-DEV — owned by Apple developer
- PRODUCT-DECISION — needs product owner decision
- BACKEND — needs server-side work

---

## Strict Classification Table

| # | Item | Classification | Exact Guideline / Source | Status | Owner | Notes |
|---|---|---|---|---|---|---|
| 1 | Native iOS wrapper | **Apple-mandated** | §4.2: "Your app should include features, content, and UI that elevate it beyond a repackaged website" | PRODUCT-DECISION | Apple Dev + Product | PWA-only submission risks 4.2 rejection. Capacitor or WKWebView wrapper needed. |
| 2 | Health data security | **Apple-mandated** (generic) | §1.6: "Apps should implement appropriate security measures to ensure proper handling of user information" | BLOCKED | Product + Apple Dev | §1.6 says "appropriate security measures" — it does NOT mandate encryption at rest specifically. Current state: health data in localStorage unencrypted. Encryption at rest is an **engineering recommendation** for health apps, not an explicit Apple rule. Requires native wrapper for Keychain/secure storage. |
| 3 | Medical disclaimers | **Apple-mandated** | §1.4.1: "Apps should remind users to check with a doctor in addition to using the app and before making medical decisions" | PRODUCT-DECISION | Product | Exact wording and placement need product/legal review. |
| 4 | Privacy policy URL | **Apple-mandated** | §5.1.1(i): "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app" | **DONE** | Apple Track | `privacy.html` at `/privacy`. Mirrors in-app policy. |
| 5 | Account deletion | **Apple-mandated** | §5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app" | BLOCKED | Backend | Client-side deletion exists. Server `POST /record/delete` endpoint needed. |
| 6 | Device ID security fix | **Engineering recommendation** | No specific Apple guideline. crypto.getRandomValues is better practice than Math.random for device identifiers. | **DONE** | Apple Track | `transport.js:90` |
| 7 | CSP header | **Engineering recommendation** | No Apple guideline requires CSP. This is web security hardening. | **DONE** | Apple Track | `netlify.toml` |
| 8 | Web app manifest | **Engineering recommendation** | No Apple guideline requires a web manifest. This is a W3C/PWA standard. Apple's PWA support uses it but does not require it for App Store submission. | **DONE** | Apple Track | `manifest.webmanifest` |
| 9 | Info.plist | **Apple-mandated** | Required for all iOS apps. `NSLocationWhenInUseUsageDescription` required by Apple when using location. | APPLE-DEV | Apple Dev | Template at `apple/Info.plist.template` |
| 10 | PrivacyInfo.xcprivacy | **Apple-mandated** | Required since Spring 2024 for all apps. Documents data collection and API usage. | APPLE-DEV | Apple Dev | Template at `apple/PrivacyInfo.xcprivacy.template` |
| 11 | App Privacy Details (labels) | **Apple-mandated** | §5.1.1(ii): "...you'll need to explain what data you collect... apps must comply with Apple's App Privacy Details" | APPLE-DEV | Apple Dev | Matrix in `QAREEB_APPLE_HANDOFF.md` §9 |
| 12 | App Store screenshots | **Apple-mandated** | App Store Connect submission requirement. | APPLE-DEV | Apple Dev | 3 size classes, minimum 3 each |
| 13 | App icon 1024×1024 | **Apple-mandated** | App Store Connect submission requirement. | APPLE-DEV | Apple Dev | PNG, no alpha, no rounded corners |
| 14 | Export compliance | **Apple-mandated** | Required questionnaire in App Store Connect. Standard TLS = mass-market exemption. | APPLE-DEV | Apple Dev | Uses standard TLS only |
| 15 | Age rating | **Apple-mandated** | Required questionnaire in App Store Connect. | APPLE-DEV | Apple Dev | Recommended 12+ (medical info) |
| 16 | App review notes | **Apple-recommended** | Helps review process; not strictly required but strongly recommended for health apps. | APPLE-DEV | Apple Dev | Draft in `QAREEB_APPLE_HANDOFF.md` §15.4 |
| 17 | Location pre-prompt | **Apple-recommended** | Apple HIG recommends explaining purpose before system prompt. Not a rejection criterion. | PRODUCT-DECISION | Product | UX design needed |
| 18 | ATT (App Tracking Transparency) | **Apple-mandated** (exemption applies) | §5.1.2(vi): ATT required when tracking. Qareeb has zero tracking, zero IDFA → ATT not needed. | **COMPLIANT** | — | No action required |
| 19 | Camera permission | N/A | Not used. Permissions-Policy blocks it. | **COMPLIANT** | — | No action required |
| 20 | Push notifications | N/A | Not implemented. No APNs. | **COMPLIANT** | — | No action required |
| 21 | Sign in with Apple | **Apple-mandated** (exemption applies) | §4.8: Not required when "Your app exclusively uses your company's own account setup and sign-in systems" | **COMPLIANT** | — | No social login used |
| 22 | Health data sharing consent | **Apple-mandated** | §5.1.1(ii), §5.1.2, §5.1.3: Health data requires clear consent. Qareeb's consent model (opt-in, time-bounded, scoped, revocable) satisfies this. | **COMPLIANT** | — | `consent.js` implements this |
| 23 | No health data for advertising | **Apple-mandated** | §5.1.3: Health data "may not be used for advertising, marketing, or other use-based data mining purposes" | **COMPLIANT** | — | Zero analytics, zero ads confirmed |

---

## Corrections from Previous Version

| Item | Was | Corrected To | Reason |
|---|---|---|---|
| #2 Health data encryption | "Apple Guideline 5.1.2 requires encryption at rest" | §1.6 generic "appropriate security measures" | §5.1.2 is about Data Use and Sharing, not encryption. No Apple guideline explicitly mandates localStorage encryption. |
| #6 Device ID fix | Implied Apple requirement | Engineering recommendation | No Apple guideline specifically addresses device ID generation method. |
| #7 CSP header | Listed under "Apple Track" | Engineering recommendation | CSP is a web standard, not an Apple requirement. |
| #8 Web manifest | Listed under "Apple Track" | Engineering recommendation | Web manifests are W3C/PWA standards. Not required for App Store submission via native wrapper. |
| #17 Location pre-prompt | Implied Apple requirement | Apple-recommended (HIG) | HIG recommends it; App Review Guidelines do not mandate it. |

---

## Data Minimisation Audit

| Data Field | Why Collected | Essential? | Sensitive? | Stored Where | Deletable? | Status |
|---|---|---|---|---|---|---|
| Patient name | Health record identity | Yes | Yes | localStorage | Yes | OK |
| DOB | Clinical calculations | Yes | Yes | localStorage | Yes | OK |
| Sex | Clinical relevance | Yes | Yes | localStorage | Yes | OK |
| Phone number | OTP auth | Yes (for requests) | Yes | localStorage `qrb.auth` | Yes | OK |
| GPS coordinates | Find nearest provider | Yes (core) | Yes | localStorage `qrb.gps` (ephemeral) | Yes | OK |
| District | Area-based discovery | Yes | No | localStorage `qrb.district` | Yes | OK |
| Medicine searches | Recent search convenience | No (convenience) | No | localStorage `qrb.recent` | Yes | OK — max 8 |
| Saved doctors | Bookmarks | No (convenience) | No | localStorage `qrb.saved` | Yes | OK |
| Device ID | Sync dedup | Yes (for sync) | No | localStorage `qareeb.device` | Yes | OK |
| Auth token | Session auth | Yes (for sync) | Yes | localStorage `qareeb.token.v1` | Yes | OK |
| Health records | Clinical record | Yes | Yes (health) | localStorage `qareeb.record.v1` | Yes | Unencrypted — engineering recommendation to encrypt via native Keychain when wrapper exists |
| Religion/sect/ethnicity | — | **NO** | — | **NEVER COLLECTED** | — | FORBIDDEN_FIELDS enforced |
| Biometric data | — | **NO** | — | **NEVER COLLECTED** | — | FORBIDDEN_FIELDS enforced |
| ID/card photos | — | **NO** | — | **NEVER COLLECTED** | — | FORBIDDEN_FIELDS enforced |

---

## E2E Baseline Verification

All E2E tests hitting `/api/needs` fail with 503 on **both** baseline commit `64f325b` and current HEAD `6ded971`. These failures require `netlify dev` running and are pre-existing. Domain tests (183 total) pass on both commits.

---

## Separation of Concerns

### Apple Track (done):
- Privacy policy URL ✅ (Apple-mandated §5.1.1(i))
- Info.plist template ✅ (Apple-mandated)
- PrivacyInfo.xcprivacy template ✅ (Apple-mandated)
- Privacy labels matrix ✅ (Apple-mandated §5.1.1(ii))
- CSP header ✅ (engineering recommendation — not Apple-required)
- Web manifest ✅ (engineering recommendation — not Apple-required)
- Device ID security ✅ (engineering recommendation)

### Product track:
- Medical disclaimers — wording and placement (Apple-mandated §1.4.1)
- Location pre-prompt UX (Apple-recommended)
- Health data encryption architecture (engineering recommendation)
- Auth architecture decisions

### Backend:
- Server-side account deletion endpoint (Apple-mandated §5.1.1(v))

### Apple Developer:
- Xcode project / native wrapper (Apple-mandated §4.2)
- App Store Connect configuration (all labels, screenshots, icon, ratings)
- Export compliance questionnaire
- Final submission
