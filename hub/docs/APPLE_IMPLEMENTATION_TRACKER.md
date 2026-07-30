# APPLE IMPLEMENTATION TRACKER

> Comprehensive Apple/App Store compliance audit.
> Every item classified against official Apple App Review Guidelines (2026)
> with exact citations. No blogs, no assumptions.
> Updated: 2026-07-30

---

## Classification Key

| Code | Meaning |
|---|---|
| **A** | REQUIRED BY APPLE — explicit guideline; rejection risk if missing |
| **B** | STRONGLY RECOMMENDED — Apple HIG or best practice that reviewers may flag |
| **C** | ENGINEERING BEST PRACTICE — good security/quality; not an Apple rule |
| **D** | PRODUCT DECISION — requires product owner input |
| **E** | NOT CURRENTLY REQUIRED — exemption applies or feature not used |
| **F** | UNKNOWN / NEEDS VERIFICATION — cannot confirm from official sources |

## Severity Key

| Level | Meaning |
|---|---|
| BLOCKER | Cannot submit without this |
| HIGH | Likely rejection |
| MEDIUM | May cause rejection depending on reviewer |
| LOW | Minor; unlikely to block |
| N/R | Not required |

---

## 1. FULL AUDIT TABLE

### 1.1 iOS Wrapper & App Structure

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Native iOS wrapper | A | BLOCKER | §4.2: "Your app should include features, content, and UI that elevate it beyond a repackaged website" | NOT STARTED | No Xcode project exists | — | Create Capacitor or WKWebView project | Apple Dev |
| 2 | App completeness | A | BLOCKER | §2.1: "Submissions to App Review should be final versions with all necessary metadata and fully functional URLs" | N/A | Cannot evaluate until wrapper + metadata exist | — | Verify after native project is created | Apple Dev |

### 1.2 Privacy & Data

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 3 | Privacy policy URL | A | BLOCKER | §5.1.1(i): "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app" | **DONE** | Static page at `/privacy`, bilingual, mirrors in-app policy. In-app policy at screenPrivacy(). | `privacy.html`, `netlify.toml` (redirect), `js/ui-discovery.js:3320` | Enter URL in App Store Connect | Apple Dev |
| 4 | App Privacy Details (nutrition labels) | A | BLOCKER | §5.1.1(ii): apps must comply with Apple's App Privacy Details | TEMPLATE READY | PrivacyInfo.xcprivacy template created. Matrix in QAREEB_APPLE_HANDOFF.md §9 | `apple/PrivacyInfo.xcprivacy.template` | Enter labels in App Store Connect; add xcprivacy to Xcode project | Apple Dev |
| 5 | Data minimization | A | LOW | §5.1.1(iii): "Only request access to data relevant to the core functionality of your app" | **COMPLIANT** | Data minimization audit below confirms all collected data is essential. FORBIDDEN_FIELDS blocks religion, sect, ethnicity, ID photos, biometrics. | `js/emr.js` (FORBIDDEN_FIELDS), `js/network.js` (scoped envelopes), `js/domain.js` (FORBIDDEN_IN_BROADCAST) | None | — |
| 6 | Health data consent | A | HIGH | §5.1.2: consent required for data use. §5.1.3(i): health data "may not be used for advertising, marketing, or other use-based data mining" | **COMPLIANT** | Consent model: opt-in, time-bounded (max 90 days), scoped, revocable, audit-logged. Zero tracking, zero ads, zero analytics. | `js/consent.js` | None | — |
| 7 | Health data not used for ads/marketing | A | HIGH | §5.1.3(i): health data prohibited for advertising/marketing/data mining | **COMPLIANT** | No ads, no analytics, no tracking anywhere in codebase. Zero third-party scripts. | All JS files, `netlify.toml` CSP | None | — |
| 8 | PrivacyInfo.xcprivacy manifest | A | HIGH | Required since Spring 2024 for all apps submitted to App Store | TEMPLATE READY | Template declares: NSPrivacyTracking=false, zero tracking domains, 6 data types, UserDefaults API reason CA92.1 | `apple/PrivacyInfo.xcprivacy.template` | Rename and add to Xcode project | Apple Dev |

### 1.3 Account & Deletion

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 9 | Account deletion | A | BLOCKER | §5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app" | PARTIAL | Client-side: full deletion flow exists (type "delete"/"حذف" to confirm, clears all localStorage). Server-side: no `POST /record/delete` endpoint. App tells user to email support@qareeb.iq for server deletion. | `js/ui-discovery.js:3245-3287` (UI), `js/ui-discovery.js:3289` (confirmDeleteData) | Backend must implement server-side deletion endpoint. Current email-based flow may not satisfy Apple — they want in-app deletion, not "contact us." | Backend + Product |
| 10 | Sign in with Apple | A (exemption) | N/R | §4.8: Not required when app "exclusively uses your company's own account setup and sign-in systems" | **COMPLIANT** | Qareeb uses phone+OTP (patients) and licence+OTP (pharmacies). No third-party or social login. | `netlify/functions/auth.mjs` | None — exemption applies | — |

### 1.4 Permissions

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Location (When In Use) | A | HIGH | Info.plist must include NSLocationWhenInUseUsageDescription with purpose string | TEMPLATE READY | Arabic purpose string in Info.plist template. App requests location for proximity search. Permissions-Policy allows geolocation=(self). | `apple/Info.plist.template`, `netlify.toml` (Permissions-Policy) | Add to Xcode project. No Always permission needed. | Apple Dev |
| 12 | Location pre-prompt | B | LOW | Apple HIG recommends explaining purpose before system prompt | NOT DONE | App requests location without a pre-prompt dialog | — | Design pre-prompt UX | Product |
| 13 | Camera | E | N/R | Not used | **COMPLIANT** | No camera API calls. Permissions-Policy: camera=(). No NSCameraUsageDescription. | `netlify.toml` | None | — |
| 14 | Photo Library | E | N/R | Not used | **COMPLIANT** | No file input, no image picker, no PHPhotoLibrary. Photos are explicitly invited inside WhatsApp, never inside the app. | `js/ui-needs.js:144,151` | None | — |
| 15 | Notifications (APNs) | E | N/R | Not implemented | **COMPLIANT** | No push notification code. No APNs entitlement needed. | — | None for v1 | — |
| 16 | ATT (App Tracking Transparency) | A (exemption) | N/R | §5.1.2: ATT required when tracking users. Zero tracking = no ATT needed. | **COMPLIANT** | No IDFA, no tracking, no analytics, no ad SDKs | — | None | — |
| 17 | Microphone | E | N/R | Not used | **COMPLIANT** | Permissions-Policy: microphone=(). No audio API calls. | `netlify.toml` | None | — |

### 1.5 Content & Medical

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 18 | Medical disclaimers | A | MEDIUM | §1.4.1: "Apps should remind users to check with a doctor in addition to using the app and before making medical decisions" | NOT DONE | No disclaimer shown before clinical data display. Qareeb is a directory (not diagnostic), but §1.4.1 applies to any app that could influence medical decisions. | — | Product must approve wording and placement. Apple Dev adds to native wrapper if needed. | Product |
| 19 | Age rating | A | BLOCKER | Required questionnaire in App Store Connect | NOT DONE | Recommended 12+ (medical information, controlled substance references in catalogue) | — | Complete questionnaire in App Store Connect | Apple Dev |
| 20 | Controlled substance handling | B | LOW | §1.4: Apps facilitating sale of controlled substances may face scrutiny | **COMPLIANT** | Controlled substances are blocked from broadcast entirely. `broadcastDecision` returns `CONTROLLED`. | `js/domain.js:96` (FORBIDDEN_IN_BROADCAST) | None | — |

### 1.6 Security & Data Handling

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 21 | Data security (general) | A | MEDIUM | §1.6: "Apps should implement appropriate security measures to ensure proper handling of user information" | PARTIAL | Health data in localStorage is unencrypted. §1.6 says "appropriate security measures" generically — does NOT mandate encryption at rest. Transport uses HTTPS (TLS). Auth uses HMAC-SHA256. FORBIDDEN_FIELDS enforced. Scoped envelopes. | `js/transport.js`, `js/emr.js`, `js/network.js` | Encryption at rest is an engineering recommendation for health apps, not an explicit Apple mandate. Requires native wrapper for Keychain. | Product + Apple Dev |
| 22 | Device ID generation | C | N/R | No specific Apple guideline | **DONE** | crypto.getRandomValues replaces Math.random | `js/transport.js:90` | None | — |
| 23 | CSP header | C | N/R | No Apple guideline requires CSP | **DONE** | Allows self + Google Fonts. Blocks eval, external scripts, iframes. | `netlify.toml` | None | — |
| 24 | Data transmission security | A | LOW | §1.6: appropriate security + ATS enforcement | **COMPLIANT** | All network calls use HTTPS (Netlify Functions). Info.plist: NSAllowsArbitraryLoads=false (ATS enforced, no exceptions). Auth tokens via Bearer header. | `js/transport.js`, `apple/Info.plist.template` | None | — |

### 1.7 App Store Metadata & Submission

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 25 | Info.plist | A | BLOCKER | Required for all iOS apps | TEMPLATE READY | NSLocationWhenInUseUsageDescription (Arabic), ATS enforced, portrait-only iPhone | `apple/Info.plist.template` | Copy to Xcode project | Apple Dev |
| 26 | App icon (1024x1024) | A | BLOCKER | App Store Connect requirement | NOT DONE | Current source: `favicon.svg` (petrol + amber) | `favicon.svg` | Create 1024x1024 PNG, no alpha, no rounded corners | Apple Dev |
| 27 | Screenshots | A | BLOCKER | App Store Connect requirement | NOT DONE | — | — | 3 sizes: 6.7", 6.5", 5.5". Min 3 per size. | Apple Dev |
| 28 | Export compliance | A | BLOCKER | App Store Connect questionnaire | NOT DONE | Standard TLS only (URLSession/WKWebView). HMAC-SHA256 server-side (node:crypto). No custom crypto. Mass-market exemption applies. | — | Answer questionnaire in App Store Connect | Apple Dev |
| 29 | App review notes | B | LOW | Not strictly required but strongly recommended for health/medical apps | NOT DONE | Draft in QAREEB_APPLE_HANDOFF.md §15.4 | `QAREEB_APPLE_HANDOFF.md` | Finalize and enter in App Store Connect | Apple Dev |

### 1.8 External Links & Web-to-Native

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 30 | External links (WhatsApp) | A | LOW | §5.1.1(vii): SafariViewController for login/auth links. General: external links must use appropriate method. | **COMPLIANT** | WhatsApp links open via `target="_blank" rel="noopener"`. These are user-initiated handoffs, not auth flows. No SafariViewController issue. | `js/ui-discovery.js`, `js/ui-needs.js` | None | — |
| 31 | Map links | E | N/R | Standard external link behavior | **COMPLIANT** | Maps links use `target="_blank" rel="noopener"` | `js/ui-discovery.js` | None | — |
| 32 | Deep links / Universal Links | B | LOW | Not required for hash-based routing PWA | NOT APPLICABLE | App uses hash routing (#/doctors, #/record). No Universal Links needed unless marketing requires them. | `js/app.js` | Optional: AASA file if Universal Links desired later | Apple Dev (optional) |
| 33 | Web-to-native behavior | A | MEDIUM | §4.2: must not be a repackaged website | N/A | Depends entirely on native wrapper implementation | — | Wrapper must use WKWebView properly. Service worker handles offline. | Apple Dev |

### 1.9 Payments & Purchases

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 34 | In-app purchases | E | N/R | No purchases in app | **COMPLIANT** | Zero payment, purchase, or subscription code. WhatsApp handoff is free. | — | None | — |
| 35 | Apple Pay | E | N/R | Not used | **COMPLIANT** | No payment processing | — | None | — |

### 1.10 PWA / Offline

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 36 | Service worker | C | N/R | No Apple guideline requires service workers. Engineering quality for offline. | **DONE** | Network-first with 3.5s race. Shell cached. Version-stamped. | `sw.js` | None | — |
| 37 | Web app manifest | C | N/R | W3C/PWA standard. Not an Apple App Store requirement. | **DONE** | Arabic-first, standalone, portrait, medical category | `manifest.webmanifest` | None | — |
| 38 | Offline behavior | A | MEDIUM | §2.1: App must be functional. §4.2: must work as an app, not a broken website. | **COMPLIANT** | SW caches full shell. Discovery, hours, health record all work offline. Only WhatsApp handoff needs network. | `sw.js`, all `js/` files | Verify in native wrapper (WKWebView SW support) | Apple Dev |

### 1.11 Entitlements

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 39 | Required entitlements | A | BLOCKER | Xcode project must declare used capabilities | NOT DONE | No Xcode project exists. Needed: none beyond basic (no HealthKit, no HomeKit, no Siri, no APNs, no Apple Pay). Only location (handled via Info.plist, not entitlement for When In Use via web). | — | Create entitlements file in Xcode project | Apple Dev |

### 1.12 Accessibility & Display

| # | Item | Class | Severity | Guideline | Status | Evidence | File(s) | Remaining Action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 40 | Text scaling / Dynamic Type | B | LOW | Apple HIG recommends supporting Dynamic Type | UNKNOWN | Web content in WKWebView. Text sizing depends on CSS (uses relative units). Full audit needed after wrapper exists. | `css/qareeb.css`, `src/styles/identity.css` | Verify after native wrapper | Apple Dev |
| 41 | iOS safe areas | B | MEDIUM | Apple HIG: content must respect safe areas (notch, home indicator) | PARTIAL | `viewport-fit=cover` declared in meta tag. CSS must use `env(safe-area-inset-*)`. | `index.html:5` | Verify safe area handling after native wrapper. Do not modify CSS — report to design Agent if broken. | Apple Dev |
| 42 | Orientation | E | N/R | Portrait-only declared | **COMPLIANT** | Info.plist template: portrait-only on iPhone, portrait+landscape on iPad | `apple/Info.plist.template` | None | — |

---

## 2. CORRECTIONS FROM PREVIOUS VERSIONS

| Item | Was | Corrected To | Reason |
|---|---|---|---|
| Health data encryption | "Apple §5.1.2 requires encryption at rest" | §1.6 generic "appropriate security measures" | §5.1.2 covers data use/sharing, not encryption. No Apple guideline mandates localStorage encryption. |
| Device ID fix | Implied Apple requirement | Class C (engineering) | No Apple guideline addresses device ID generation method. |
| CSP header | Listed as Apple Track item | Class C (engineering) | CSP is a web standard, not an Apple requirement. |
| Web manifest | Listed as Apple Track item | Class C (engineering) | W3C/PWA standard. Not required for native App Store submission. |
| Location pre-prompt | Implied Apple requirement | Class B (HIG recommendation) | HIG recommends; App Review Guidelines do not mandate. |
| Account deletion | "Client-side exists" | PARTIAL — server deletion is the real gap | §5.1.1(v) requires full account deletion, not just local data clearing. "Email us" may not satisfy Apple. |

---

## 3. BLOCKER SUMMARY

| # | Blocker | Owner | Why It Blocks |
|---|---|---|---|
| 1 | No native iOS wrapper | Apple Dev | §4.2 — cannot submit a PWA-only app |
| 9 | Account deletion (server-side) | Backend | §5.1.1(v) — "email us" likely insufficient; Apple wants in-app deletion |
| 19 | Age rating questionnaire | Apple Dev | App Store Connect requirement |
| 25 | Info.plist in Xcode project | Apple Dev | Cannot build without it |
| 26 | App icon 1024x1024 | Apple Dev | App Store Connect requirement |
| 27 | Screenshots | Apple Dev | App Store Connect requirement |
| 28 | Export compliance | Apple Dev | App Store Connect requirement |
| 39 | Entitlements file | Apple Dev | Xcode project requirement |

---

## 4. DATA MINIMISATION AUDIT

| Data Field | Why Collected | Essential? | Sensitive? | Stored Where | Deletable? |
|---|---|---|---|---|---|
| Patient name | Health record identity | Yes | Yes | localStorage | Yes |
| DOB | Clinical calculations | Yes | Yes | localStorage | Yes |
| Sex | Clinical relevance | Yes | Yes | localStorage | Yes |
| Phone number | OTP auth | Yes (for requests) | Yes | localStorage `qrb.auth` | Yes |
| GPS coordinates | Proximity search | Yes (core) | Yes | localStorage `qrb.gps` (ephemeral) | Yes |
| District | Area-based discovery | Yes | No | localStorage `qrb.district` | Yes |
| Medicine searches | Recent search | No (convenience) | No | localStorage `qrb.recent` | Yes (max 8) |
| Saved doctors | Bookmarks | No (convenience) | No | localStorage `qrb.saved` | Yes |
| Device ID | Sync dedup | Yes (for sync) | No | localStorage `qareeb.device` | Yes |
| Auth token | Session auth | Yes | Yes | localStorage `qareeb.token.v1` | Yes |
| Health records | Clinical record | Yes | Yes (health) | localStorage `qareeb.record.v1` | Yes |
| Religion/sect/ethnicity | — | **NO** | — | **NEVER COLLECTED** | FORBIDDEN_FIELDS |
| Biometric data | — | **NO** | — | **NEVER COLLECTED** | FORBIDDEN_FIELDS |
| ID/card photos | — | **NO** | — | **NEVER COLLECTED** | FORBIDDEN_FIELDS |

**Conclusion:** No unnecessary data collected. All data is essential or clearly convenience (deletable). FORBIDDEN_FIELDS enforced at every ingest boundary.

---

## 5. E2E BASELINE VERIFICATION

All E2E tests hitting `/api/needs` fail with HTTP 503 on **both** baseline commit `64f325b` and current HEAD. These failures require `netlify dev` running and are pre-existing — not regressions. Domain tests (183 total) pass on both commits.

---

## 6. SEPARATION OF CONCERNS

### Apple Track (this track — done):
- Privacy policy URL (§5.1.1(i))
- Info.plist template
- PrivacyInfo.xcprivacy template
- Privacy labels matrix (§5.1.1(ii))
- CSP header (engineering — not Apple-required)
- Web manifest (engineering — not Apple-required)
- Device ID security (engineering)
- This audit document

### Product track (not this track):
- Medical disclaimers — wording and placement (§1.4.1)
- Location pre-prompt UX (HIG)
- Health data encryption architecture (engineering)
- Auth architecture decisions

### Backend (not this track):
- Server-side account deletion endpoint (§5.1.1(v))

### Apple Developer (not this track):
- Xcode project / native wrapper (§4.2)
- App Store Connect configuration
- Screenshots, icon, ratings, export compliance
- Entitlements file
- Final submission

### Design Agents (not this track):
- All UI/UX changes
- Navigation, layout, visual hierarchy
- RTL, mobile composition, interaction model
- This track will audit their output for Apple compliance after implementation
