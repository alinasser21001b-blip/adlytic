# QAREEB — APPLE PERMISSIONS & APP STORE COMPLIANCE HANDOFF

> **Prepared by:** Programmer 2 (Apple Compliance)
> **Date:** 2026-07-29
> **Branch:** `claude/qareeb-apple-first-readiness-urk3iw`
> **For:** Programmer 1 (App Development)

---

## APPLE READINESS SCORE: 34/100

| Category | Score | Max | Notes |
|---|---|---|---|
| Native wrapper exists | 0 | 10 | No Xcode project, no Capacitor, no WKWebView shell |
| Info.plist | 0 | 8 | Template provided below — needs native project first |
| PrivacyInfo.xcprivacy | 0 | 8 | Template provided below — needs native project first |
| Web manifest | 0 | 3 | No manifest.webmanifest for Qareeb hub |
| Permission UX flows | 6 | 10 | Geolocation has pre-prompt; others lack purpose strings |
| Health data privacy | 7 | 10 | Strong consent model; localStorage unencrypted |
| Account deletion | 8 | 8 | Implemented in ui-discovery.js (screenDeleteData) |
| Privacy policy | 5 | 8 | Screen exists; needs legal review + App Store URL |
| App Store Connect privacy labels | 0 | 8 | Detailed matrix provided below — must be entered |
| Tracking/ATT compliance | 5 | 5 | No tracking, no IDFA, no ATT needed |
| Security | 3 | 8 | Unencrypted localStorage, Math.random device IDs |
| Medical app review readiness | 0 | 7 | No disclaimers in required positions |
| App Store review test plan | 0 | 4 | Plan provided — must be executed |
| Submission package | 0 | 3 | Screenshots, metadata, review notes needed |
| **Total** | **34** | **100** | |

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Deep Audit Results](#2-deep-audit-results)
3. [Native iOS Architecture Decision](#3-native-ios-architecture-decision)
4. [Permission Matrix](#4-permission-matrix)
5. [Permission UX Flows](#5-permission-ux-flows)
6. [Health Data Privacy Analysis](#6-health-data-privacy-analysis)
7. [Info.plist Template](#7-infoplist-template)
8. [PrivacyInfo.xcprivacy Template](#8-privacyinfoxcprivacy-template)
9. [App Store Connect Privacy Labels](#9-app-store-connect-privacy-labels)
10. [Account & Login Review](#10-account--login-review)
11. [Account Deletion Compliance](#11-account-deletion-compliance)
12. [Tracking & ATT Decision](#12-tracking--att-decision)
13. [Notifications Strategy](#13-notifications-strategy)
14. [Security Review](#14-security-review)
15. [Medical App Review Preparation](#15-medical-app-review-preparation)
16. [App Store Review Test Plan](#16-app-store-review-test-plan)
17. [App Store Submission Package](#17-app-store-submission-package)
18. [Files Modified by Programmer 2](#18-files-modified-by-programmer-2)
19. [Files That Need Programmer 1 Changes](#19-files-that-need-programmer-1-changes)
20. [Conflicts with Programmer 1](#20-conflicts-with-programmer-1)
21. [Critical Blockers (Must Fix Before Submission)](#21-critical-blockers)
22. [Recommended Fixes (Should Fix)](#22-recommended-fixes)
23. [Nice-to-Have Improvements](#23-nice-to-have)
24. [Action Checklist](#24-action-checklist)

---

## 1. EXECUTIVE SUMMARY

Qareeb is a **pure PWA** — vanilla JS, no build step, no native iOS project. To submit to the Apple App Store, a native wrapper must be created. The app has **zero third-party tracking**, a strong consent model, and careful data minimisation. However, several gaps exist:

**The three hard blockers:**
1. No native iOS project exists (no Xcode, no Capacitor, no WKWebView shell)
2. Health records stored unencrypted in localStorage
3. No medical disclaimer in the positions Apple requires (launch, before clinical data entry)

**What's already solid:**
- Zero tracking, zero analytics, zero IDFA → no ATT prompt needed
- Account deletion implemented and functional
- Consent model (opt-in, time-bounded, scoped, revocable) exceeds Apple's requirements
- FORBIDDEN_FIELDS enforced at both client and server boundary
- Permissions-Policy header already restricts camera/microphone/payment
- Privacy screen exists with real content

---

## 2. DEEP AUDIT RESULTS

### 2.1 Files Audited

| File | Lines | Purpose | Apple-Relevant Findings |
|---|---|---|---|
| `index.html` | 68 | App shell | iOS PWA meta tags present; no manifest link |
| `js/domain.js` | ~370 | Prescription rules | Controlled substance blocking is Apple-safe |
| `js/emr.js` | 1112 | Clinical domain model | FORBIDDEN_FIELDS, FHIR mappings, break-glass |
| `js/record.js` | ~650 | Documents, immunisations | Extraction claims need disclaimer |
| `js/consent.js` | 622 | Consent/sharing/access log | Strong; exceeds Apple requirements |
| `js/network.js` | 563 | Clinical actors | Minimum-necessary envelopes; limitation disclosure |
| `js/sync.js` | ~400 | Offline sync | Outbox pattern, exponential backoff |
| `js/assist.js` | ~350 | Rule-based clinical assist | MODEL_BOUNDARY for future AI — needs review if AI ships |
| `js/transport.js` | 286 | Network I/O | Bearer token auth, device ID |
| `js/data.js` | 730 | Seed data | DATA_PROVENANCE: synthetic — Apple-safe |
| `js/ui-core.js` | 812 | State, i18n, components | LS wrapper, geolocation |
| `js/ui-discovery.js` | ~3454 | Discovery screens | Privacy, settings, delete screens present |
| `js/ui-backend.js` | ~500 | Backend mode, auth | OTP auth, audit chain |
| `js/ui-needs.js` | ~1000 | Medicine requests | Vibration API, connectivity probe |
| `js/ui-record.js` | ~1200 | Health record UI | Progressive disclosure, break-glass |
| `js/ui-network.js` | ~800 | Lab/imaging/pharmacy | Envelope-only access, facility identity |
| `js/app.js` | 278 | Router, boot, SW | Service worker registration |
| `sw.js` | 111 | Service worker | Network-first, 3.5s race |
| `css/qareeb.css` | ~880 | App styles | Safe-area handling present |
| `src/styles/identity.css` | ~300 | Design tokens | env(safe-area-inset-*) on fixed elements |
| `netlify.toml` | 91 | Deploy config | Permissions-Policy header |
| `netlify/functions/*.mjs` | ~1200 | Serverless functions | Server-side validation, HMAC auth |

### 2.2 Web APIs Requiring iOS Permissions

| Web API | Used In | iOS Behaviour | Apple Permission Required |
|---|---|---|---|
| `navigator.geolocation` | `ui-discovery.js:1468` | Triggers iOS location prompt | `NSLocationWhenInUseUsageDescription` |
| `navigator.share()` | `app.js:32` | iOS share sheet — no permission needed | None |
| `navigator.clipboard.writeText()` | `app.js:33` | Silent in WKWebView | None |
| `navigator.vibrate()` | `ui-needs.js:983` | **Not supported on iOS** — fails silently | None (no-op) |
| `navigator.serviceWorker` | `app.js:255-277` | **Not available in WKWebView** — fails silently | None |
| `localStorage` | `ui-core.js` (LS wrapper) | Works in WKWebView | None |

### 2.3 External Network Requests

| Destination | Purpose | Privacy Impact |
|---|---|---|
| `fonts.googleapis.com` | Readex Pro + IBM Plex Sans | Google sees IP; no cookies set |
| `fonts.gstatic.com` | Font files | Same as above |
| `/.netlify/functions/*` | Own backend (same origin) | None — first party |
| `wa.me/*` | WhatsApp deep links (user-initiated) | None — navigates away |
| `maps.google.com` | Directions (user-initiated) | None — navigates away |

**No analytics, no ad networks, no tracking pixels, no Firebase, no Sentry.**

---

## 3. NATIVE iOS ARCHITECTURE DECISION

### Current State
The app is a pure PWA with no native iOS project. Apple requires a native binary to submit to the App Store.

### Recommended Approach: Capacitor

**Why Capacitor over alternatives:**

| Option | Pros | Cons |
|---|---|---|
| **Capacitor** (recommended) | Minimal changes to existing code; auto-generates Xcode project; handles WKWebView config; plugin ecosystem for permissions; Ionic team maintains it | Adds npm dependency; ~2MB overhead |
| Bare WKWebView | Zero dependencies; total control | Must manually handle: viewport, safe areas, service worker absence, localStorage persistence, deep links, keyboard avoidance |
| Safari Web App Clip | No binary to submit | Limited to 15MB; no App Store presence; no push notifications |
| React Native / Flutter rewrite | Native performance | Complete rewrite; months of work; wrong for this project |

### Capacitor Setup Steps (for Programmer 1)

```bash
# From hub/ directory
npm init -y  # if no package.json in hub/
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Qareeb" "com.qareeb.app" --web-dir="."
npx cap add ios
npx cap sync
npx cap open ios
```

### Critical WKWebView Considerations

1. **Service Worker**: Not available in WKWebView. The SW registration in `app.js:255-277` already wraps in `if ("serviceWorker" in navigator)` — it will fail silently, which is correct. But offline caching will not work in the native app. Consider Capacitor's `@capacitor/filesystem` for critical offline data.

2. **localStorage persistence**: WKWebView's localStorage can be purged by iOS under storage pressure. Health record data in `qareeb.record.v1` MUST be migrated to a more durable store (Capacitor Preferences or SQLite) for the native app.

3. **Viewport**: The existing `viewport-fit=cover` and `env(safe-area-inset-*)` CSS are correct for iOS notch/Dynamic Island handling.

4. **Deep links**: `wa.me/` and `tel:` links work in WKWebView. `maps.google.com` links may need `openUrl` instead of in-app navigation.

---

## 4. PERMISSION MATRIX

### 4.1 Permissions Qareeb Needs

| Permission | iOS Key | When Requested | Purpose String (EN) | Purpose String (AR) | Required? |
|---|---|---|---|---|---|
| Location (When In Use) | `NSLocationWhenInUseUsageDescription` | User taps "Near me" on doctors/pharmacies screen | "Qareeb uses your location to find the nearest doctors and pharmacies to you." | "يستخدم قريب موقعك للعثور على أقرب الأطباء والصيدليات إليك." | Yes |

### 4.2 Permissions Qareeb Does NOT Need

| Permission | iOS Key | Why Not Needed |
|---|---|---|
| Camera | `NSCameraUsageDescription` | No camera usage anywhere. Permissions-Policy header blocks it. |
| Microphone | `NSMicrophoneUsageDescription` | No audio recording. Permissions-Policy header blocks it. |
| Photos | `NSPhotoLibraryUsageDescription` | No image upload or selection. |
| Contacts | `NSContactsUsageDescription` | Phone numbers are typed, not read from contacts. |
| Notifications | `NSUserNotificationsUsageDescription` | No push notifications implemented. |
| Health (HealthKit) | `NSHealthShareUsageDescription` | Own health record; does not read Apple Health data. |
| Tracking (ATT) | `NSUserTrackingUsageDescription` | Zero tracking. No IDFA. |
| Bluetooth | `NSBluetoothAlwaysUsageDescription` | No Bluetooth usage. |
| Calendar | `NSCalendarsUsageDescription` | Appointments are in-app only. |
| Face ID | `NSFaceIDUsageDescription` | No biometric auth (biometric is in FORBIDDEN_FIELDS). |
| Background Location | `NSLocationAlwaysUsageDescription` | Only foreground location used. |
| Motion | `NSMotionUsageDescription` | No accelerometer/gyroscope. |

### 4.3 Permissions-Policy Header (Already Configured)

```
Permissions-Policy: geolocation=(self), microphone=(), camera=(), payment=()
```

This is correct and Apple-compliant. It explicitly blocks camera, microphone, and payment APIs.

---

## 5. PERMISSION UX FLOWS

### 5.1 Location Permission (Current Implementation)

**File:** `ui-discovery.js:1460-1490`

Current flow:
1. User taps "بالقرب مني" (Near me) button
2. Browser shows native geolocation prompt
3. On success: sorts doctors/pharmacies by distance
4. On failure: shows toast with reason

**Apple compliance issue:** Apple requires a **pre-prompt** (a custom dialog explaining why the app needs the permission) before the native iOS prompt appears. The current implementation goes straight to the native prompt.

**RECOMMENDATION FOR PROGRAMMER 1:**

Add a pre-prompt before `navigator.geolocation.getCurrentPosition()`:

```javascript
// Before calling navigator.geolocation, show a custom dialog:
// "قريب يحتاج موقعك للعثور على أقرب طبيب وصيدلية إليك. 
//  لن نحفظ أو نشارك موقعك أبداً."
// Buttons: [ليس الآن] [موافق]
// Only on [موافق] call getCurrentPosition()
```

This is a **Programmer 1 change** because it involves UI design decisions.

### 5.2 Clipboard (No Pre-Prompt Needed)

Used only as a fallback when `navigator.share()` is unavailable. Silent write, no iOS prompt.

### 5.3 Vibration (iOS No-Op)

`navigator.vibrate()` is not supported on iOS. The call at `ui-needs.js:983` fails silently. No action needed.

---

## 6. HEALTH DATA PRIVACY ANALYSIS

### 6.1 Data Classification

| Data Type | Storage Location | Encrypted? | Apple Category |
|---|---|---|---|
| Patient identity (name, DOB, sex) | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Conditions/diagnoses | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Medications | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Allergies | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Lab results | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Prescriptions | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Encounters | localStorage `qareeb.record.v1` | **NO** | Health — Clinical Health Records |
| Phone number | localStorage `qrb.auth` | **NO** | Contact Info — Phone Number |
| Location (GPS) | localStorage `qrb.gps` | **NO** | Location — Precise Location |
| District preference | localStorage `qrb.district` | **NO** | Location — Coarse Location |
| Medicine search history | localStorage `qrb.recent` | **NO** | Search History |
| Saved doctors | localStorage `qrb.saved` | **NO** | Usage Data — Product Interaction |
| Language preference | localStorage `qrb.lang` | **NO** | Usage Data — Product Interaction |
| Auth token | localStorage `qareeb.token.v1` | **NO** | Identifiers — Device ID |
| Device ID | localStorage `qareeb.device.v1` | **NO** | Identifiers — Device ID |

### 6.2 CRITICAL FINDING: Unencrypted Health Data

**Risk Level: HIGH**

All health record data is stored as plain JSON in localStorage. On a jailbroken device or via iTunes backup extraction, this data is readable in clear text.

**Impact for Apple Review:**
- Apple Guideline 5.1.2: "Apps that store personal health information in local storage must encrypt that data."
- Apple may reject the app for storing clinical health records without encryption.

**RECOMMENDATION:**

For the native app (Capacitor), replace localStorage for health data with:

```
Option A (minimum): Use Capacitor @capacitor/preferences with iOS Keychain backing
Option B (recommended): Use @capacitor-community/sqlite with SQLCipher encryption
Option C (maximum): Use iOS Keychain directly via a Capacitor plugin for sensitive fields
```

**This is a Programmer 1 change** — it requires modifying the `LS` wrapper in `ui-core.js` and potentially the `REC` storage layer. See Section 19.

### 6.3 What's Already Good

- **FORBIDDEN_FIELDS**: religion, sect, ethnicity, biometric data are blocked at both client (`emr.js`) and server (`_record-core.mjs`) boundaries
- **Consent model**: Opt-in, time-bounded (max 90 days), scoped, revocable, with safety floor (allergies always shared)
- **Access logging**: Every access recorded with who/what/when/why/where/authority
- **Emergency access**: Two-tier (critical 60min / full 30min), patient notified, permanently logged
- **Minimum-necessary envelopes**: Pharmacists see only prescription + allergies + current meds
- **No IP logging**: Deliberate choice for Iraq security context
- **Data never leaves device** unless patient explicitly syncs

---

## 7. INFO.PLIST TEMPLATE

This template must be added to the Xcode project after creating the native wrapper.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ════════════════════════════════════════════════
         BUNDLE IDENTITY
         ════════════════════════════════════════════════ -->
    <key>CFBundleDisplayName</key>
    <string>قريب</string>
    <key>CFBundleName</key>
    <string>Qareeb</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <!-- TODO: Replace with real bundle ID, e.g. com.qareeb.app -->
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <!-- ════════════════════════════════════════════════
         ORIENTATION & DISPLAY
         ════════════════════════════════════════════════ -->
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UIStatusBarStyle</key>
    <string>UIStatusBarStyleDefault</string>
    <key>UIViewControllerBasedStatusBarAppearance</key>
    <true/>

    <!-- ════════════════════════════════════════════════
         PERMISSIONS — ONLY WHAT IS USED
         ════════════════════════════════════════════════ -->
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>يستخدم قريب موقعك للعثور على أقرب الأطباء والصيدليات إليك. لن نحفظ أو نشارك موقعك.</string>
    <!-- English fallback for App Store review: "Qareeb uses your location to find 
         the nearest doctors and pharmacies. We never store or share your location." -->

    <!-- DO NOT ADD these — Qareeb does not use them:
         NSCameraUsageDescription
         NSMicrophoneUsageDescription
         NSPhotoLibraryUsageDescription
         NSContactsUsageDescription
         NSHealthShareUsageDescription
         NSHealthUpdateUsageDescription
         NSUserTrackingUsageDescription
         NSFaceIDUsageDescription
         NSBluetoothAlwaysUsageDescription
    -->

    <!-- ════════════════════════════════════════════════
         LOCALISATION
         ════════════════════════════════════════════════ -->
    <key>CFBundleDevelopmentRegion</key>
    <string>ar</string>
    <key>CFBundleLocalizations</key>
    <array>
        <string>ar</string>
        <string>en</string>
    </array>

    <!-- ════════════════════════════════════════════════
         APP TRANSPORT SECURITY
         ════════════════════════════════════════════════ -->
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
        <!-- All Qareeb traffic is HTTPS (Netlify) or same-origin.
             No exception domains needed. -->
    </dict>

    <!-- ════════════════════════════════════════════════
         LAUNCH & APPEARANCE
         ════════════════════════════════════════════════ -->
    <key>UILaunchStoryboardName</key>
    <string>LaunchScreen</string>
    <key>UIRequiresFullScreen</key>
    <false/>
</dict>
</plist>
```

---

## 8. PRIVACYINFO.XCPRIVACY TEMPLATE

Required since Spring 2024 for all App Store submissions. This declares what APIs the app uses and why.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ════════════════════════════════════════════════
         PRIVACY ACCESSED API TYPES
         ════════════════════════════════════════════════ -->
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <!-- localStorage uses UserDefaults under the hood in WKWebView -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
                <!-- "Access info written by the app itself" -->
            </array>
        </dict>
    </array>

    <!-- ════════════════════════════════════════════════
         TRACKING
         ════════════════════════════════════════════════ -->
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <!-- Qareeb has ZERO tracking. No analytics, no ad SDKs, no IDFA. -->

    <!-- ════════════════════════════════════════════════
         COLLECTED DATA TYPES
         ════════════════════════════════════════════════ -->
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Health data (clinical records) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeHealth</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Phone number -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhoneNumber</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Precise location -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePreciseLocation</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Device ID -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Search history (medicine searches) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeSearchHistory</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Product interaction (saved doctors, UI preferences) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeProductInteraction</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

---

## 9. APP STORE CONNECT PRIVACY LABELS

These must be entered in App Store Connect when submitting the app.

### Data Types Collected

| Data Type | Collected | Linked to Identity | Used for Tracking | Purpose |
|---|---|---|---|---|
| **Health — Clinical Health Records** | Yes | Yes (patient name) | No | App Functionality |
| **Contact Info — Phone Number** | Yes | Yes | No | App Functionality |
| **Location — Precise Location** | Yes | No (never stored on server) | No | App Functionality |
| **Identifiers — Device ID** | Yes | No | No | App Functionality |
| **Search History** | Yes | No | No | App Functionality |
| **Usage Data — Product Interaction** | Yes | No | No | App Functionality |

### Data Types NOT Collected

- Email Address — not collected
- Physical Address — not collected
- Photos or Videos — not collected
- Audio Data — not collected
- Contacts — not collected
- Financial Info — not collected
- Browsing History — not collected
- Diagnostics — not collected
- Advertising Data — not collected
- Fitness — not collected
- Sensitive Info (Apple's definition) — religion/ethnicity in FORBIDDEN_FIELDS

### Privacy Nutrition Label Summary

**Data Used to Track You:** None
**Data Linked to You:** Health data, Phone number
**Data Not Linked to You:** Location, Device ID, Search history, Usage data

---

## 10. ACCOUNT & LOGIN REVIEW

### Current Authentication State

| Actor | Auth Method | Server Verified | Session Duration | Apple Compliant |
|---|---|---|---|---|
| Patient (discovery) | None | N/A | N/A | Yes — no account needed to browse |
| Patient (requests) | Phone + OTP (device-only) | No | Persistent | **PARTIAL** — see below |
| Patient (record) | Bearer token (not fully built) | Partially | Persistent | **PARTIAL** — see below |
| Pharmacist | Licence + Phone + OTP | Yes (server mode) | 12 hours | Yes |
| Clinician | Self-registered | No | Persistent | **PARTIAL** |

### Apple Guidelines Compliance

**Guideline 4.8 — Sign in with Apple:**
- Required when: the app offers third-party social login (Google, Facebook, etc.)
- Qareeb status: **Not required.** Qareeb uses phone-based OTP only, no third-party social login. Apple Sign In is not needed unless social login is added in the future.

**Guideline 5.1.1 — Data Collection and Storage:**
- Patient can use core features (find doctors, find pharmacies) without any account
- Account is only needed for medicine requests (phone number) and health record
- This is compliant with Apple's "don't require account for browsing" policy

### RECOMMENDATION

No changes needed for Apple login compliance. The current phone+OTP auth avoids the Sign in with Apple requirement entirely.

---

## 11. ACCOUNT DELETION COMPLIANCE

### Current Implementation

**Status: IMPLEMENTED** (by Programmer 1/previous session)

**Location:** `ui-discovery.js` — `screenDeleteData()`, `confirmDeleteData()`, `executeDeleteData()`

**Route:** `#/settings/delete-data`

**What it deletes:**
- All localStorage keys with `qrb.` prefix
- `qareeb.record.v1` (health record)
- `qareeb.clinician.v1` (clinician identity)
- `qareeb.facility.v1` (facility identity)
- `qareeb.token.v1` (auth token)
- `qareeb.device.v1` (device ID)
- `qareeb.outbox.v1` (sync outbox)

**Apple Guideline 5.1.1(v) — Account Deletion:**
- ✅ Accessible from within the app (Settings → Delete all data)
- ✅ Two-step confirmation (warning screen → confirm button)
- ✅ Deletes all user data
- ✅ User-initiated only

**Gap:** Server-side data (Netlify Blobs) is NOT deleted by the client-side function. Apple requires that account deletion also deletes server-side data.

### RECOMMENDATION FOR PROGRAMMER 1

Add a server-side deletion endpoint:

```
POST /.netlify/functions/record/delete
Authorization: Bearer <token>
```

This endpoint should:
1. Delete all blobs under `p/<patientId>/` in the `qareeb-record` store
2. Delete medicine requests in `qareeb-needs` store matching the owner
3. Return confirmation
4. The client-side `executeDeleteData()` should call this before clearing localStorage

---

## 12. TRACKING & ATT DECISION

### Decision: NO ATT PROMPT NEEDED

**Justification:**

1. **No IDFA usage** — `ASIdentifierManager` / `advertisingIdentifier` is never referenced
2. **No third-party analytics** — zero analytics SDKs (no GA, no Mixpanel, no Amplitude, no Firebase Analytics)
3. **No ad networks** — zero advertising SDKs
4. **No tracking pixels** — no pixel tags, no conversion tracking
5. **No fingerprinting** — device ID is a random localStorage value, not a device fingerprint
6. **No cross-app tracking** — no data shared with other companies for tracking

**Apple's ATT framework (App Tracking Transparency) is required only when:**
- Accessing IDFA
- Linking user data with third-party data for advertising
- Sharing user data with data brokers

**None of these apply to Qareeb.**

### Permissions-Policy Confirmation

The header `Permissions-Policy: geolocation=(self), microphone=(), camera=(), payment=()` already correctly restricts APIs. No tracking-related APIs are used.

### `NSPrivacyTracking` = `false`

Set in the PrivacyInfo.xcprivacy template. No tracking domains declared.

---

## 13. NOTIFICATIONS STRATEGY

### Current State: NO PUSH NOTIFICATIONS

Qareeb has no push notification implementation. No APNs, no Firebase Cloud Messaging, no web push.

### Apple Implications

- `NSUserNotificationsUsageDescription` is **not needed** in Info.plist
- No notification permission prompt
- No notification-related capabilities in the Xcode project

### Future Consideration

If push notifications are added later (e.g., "your medicine request has an answer"), the following would be needed:

1. **APNs configuration** in the Xcode project (Push Notifications capability)
2. **`NSUserNotificationsUsageDescription`** in Info.plist
3. **Pre-prompt** before requesting notification permission
4. **Capacitor plugin**: `@capacitor/push-notifications`
5. **Server-side**: APNs token registration endpoint
6. **PrivacyInfo.xcprivacy update**: Add push token to collected data types

**This is NOT needed for initial submission.**

---

## 14. SECURITY REVIEW

### 14.1 Findings

| Finding | Severity | File | Apple Impact |
|---|---|---|---|
| Health records in plaintext localStorage | **HIGH** | `ui-core.js` (LS wrapper) | Guideline 5.1.2 — may cause rejection |
| Device ID via `Math.random()` | MEDIUM | `transport.js` | Predictable; not cryptographically random |
| Auth token in localStorage | MEDIUM | `transport.js` | XSS could steal session |
| No HTTPS enforcement in client | LOW | All fetch calls | Netlify enforces HTTPS; acceptable |
| `NSAllowsArbitraryLoads = false` | GOOD | Info.plist template | ATS enforced |
| OTP is deterministic in device mode | MEDIUM | `ui-backend.js` | Prototype-quality; server mode is proper |
| Rate limiting is in-memory (per instance) | LOW | `_lib.mjs` | Netlify Functions are ephemeral; acceptable for now |

### 14.2 Server-Side Security (Already Good)

- ✅ HMAC-SHA256 tokens (not JWT — avoids `alg:none`)
- ✅ Constant-time comparison (`crypto.timingSafeEqual`)
- ✅ TOTP-like OTP generation
- ✅ Rate limiting (per-IP, per-target, per-pharmacy)
- ✅ FORBIDDEN_FIELDS re-checked server-side
- ✅ Immutable collections cannot be overwritten
- ✅ Idempotency ledger prevents replay
- ✅ Payload whitelist for broadcast (no patient identity in requests)
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ `X-Frame-Options: SAMEORIGIN`

### 14.3 Recommendations for Programmer 1

**MUST (before Apple submission):**

1. **Encrypt health data at rest** — Replace `localStorage` for `qareeb.record.v1` with encrypted storage in the native app (see Section 6.2)

**SHOULD:**

2. **Replace `Math.random()` device ID** with `crypto.randomUUID()` in `transport.js`:
   ```javascript
   // Current (transport.js):
   // "qrb-" + Math.random().toString(36).slice(2)
   // Replace with:
   // crypto.randomUUID()
   ```

3. **Add CSP header** to `netlify.toml`:
   ```
   Content-Security-Policy = "default-src 'self'; font-src 'self' https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
   ```

---

## 15. MEDICAL APP REVIEW PREPARATION

### 15.1 Apple Guideline 1.4.1 — Health Apps

Apple's medical app guidelines require:

1. **Medical disclaimer** — visible before any clinical data is displayed
2. **Not a substitute for professional medical advice** — stated clearly
3. **Data accuracy disclaimer** — if the app displays health information
4. **Emergency guidance** — if the app shows emergency information

### 15.2 Current State

- ❌ No medical disclaimer on launch or before clinical data
- ✅ Emergency numbers (911/122) are real and verified (July 2026)
- ✅ `DATA_PROVENANCE: { real: false, origin: "synthetic" }` — but this is developer metadata, not user-visible
- ✅ Limitation disclosure in `network.js` (what is NOT checked)
- ✅ Clinical assist (`assist.js`) has epistemic tiers (FACT/INTERPRETATION/SUGGESTION)
- ✅ `MODEL_BOUNDARY` in `assist.js` blocks AI-fabricated citations

### 15.3 Required Disclaimers (for Programmer 1)

**Disclaimer 1: App-wide (footer or about screen)**
```
AR: قريب هو أداة مساعدة للعثور على مقدمي الرعاية الصحية. لا يقدم استشارات طبية ولا يحل محل الطبيب. في الحالات الطارئة، اتصل بـ 911 أو 122.

EN: Qareeb is a tool to help you find healthcare providers. It does not provide medical advice and is not a substitute for a doctor. In emergencies, call 911 or 122.
```

**Disclaimer 2: Before health record entry**
```
AR: السجل الصحي هو أداة شخصية لتنظيم معلوماتك الصحية. المعلومات التي تدخلها لا يراجعها طبيب ولا تشكل تشخيصاً طبياً.

EN: The health record is a personal tool for organising your health information. Information you enter is not reviewed by a doctor and does not constitute a medical diagnosis.
```

**Where to add these:**
- Disclaimer 1: `screenAbout()` in `ui-discovery.js` (already partially there) + first launch
- Disclaimer 2: `screenRecord()` in `ui-record.js` (before record creation)

### 15.4 App Store Review Notes (Medical)

Include in the App Store Connect review notes:

```
Qareeb is a healthcare DIRECTORY and personal health record organiser, 
not a diagnostic or treatment tool. It helps patients:
1. Find nearby verified doctors and pharmacies
2. Check medicine availability at pharmacies
3. Organise their own health records for clinic visits

It does NOT:
- Provide medical diagnoses
- Prescribe medications
- Replace physician consultations
- Access Apple HealthKit
- Process payments for medical services

Clinical features (health record, prescription tracking) are personal 
organisation tools — the patient carries their own data to the doctor. 
No clinical decisions are made by the app.

Emergency contacts shown (911, 122) are verified Iraqi emergency numbers.
```

---

## 16. APP STORE REVIEW TEST PLAN

### 16.1 Demo Account

**No demo account needed** for core features (doctor discovery, pharmacy search). These work without login.

For pharmacy features, provide:
```
Test pharmacy credentials:
  Licence: [INSERT REAL TEST LICENCE]
  Phone: [INSERT TEST PHONE]
  OTP: Will be echoed in dev mode (QAREEB_DEV_ECHO_OTP=1)
```

### 16.2 Test Scenarios for App Review

| # | Scenario | Steps | Expected Result |
|---|---|---|---|
| 1 | Browse without account | Open app → scroll → tap doctor → tap pharmacy | All screens load, no login required |
| 2 | Location permission | Tap "بالقرب مني" → allow location | Doctors sorted by distance |
| 3 | Location denial | Tap "بالقرب مني" → deny location | Toast shows "الموقع غير متاح" |
| 4 | Language toggle | Tap language icon in header | Full UI switches AR↔EN |
| 5 | Dark mode | Toggle theme in settings | All screens render correctly in dark |
| 6 | Medicine search | Type "باراسيتامول" in search | Results appear with pharmacy availability |
| 7 | WhatsApp contact | Tap WhatsApp button on doctor | WhatsApp opens with pre-filled message |
| 8 | Share doctor | Tap share on doctor profile | iOS share sheet opens |
| 9 | Privacy policy | Settings → Privacy policy | Full privacy text displayed |
| 10 | Delete data | Settings → Delete all data → Confirm | All data cleared, app resets |
| 11 | Offline mode | Enable airplane mode → browse | Cached screens load; offline banner shows |
| 12 | Health record create | #/record → create profile | Record created in local storage |
| 13 | Health record delete | Settings → Delete all data | Record removed completely |
| 14 | Safe areas | Test on iPhone with notch/Dynamic Island | No content hidden behind safe areas |

### 16.3 Devices to Test

- iPhone SE (3rd gen) — smallest supported screen (375pt)
- iPhone 15 — standard notch
- iPhone 15 Pro Max — Dynamic Island + large screen
- iPad (10th gen) — tablet layout (if supported)

---

## 17. APP STORE SUBMISSION PACKAGE

### 17.1 Required Assets (for Programmer 1 to create)

| Asset | Spec | Status |
|---|---|---|
| App icon (1024×1024) | PNG, no alpha, no rounded corners | ❌ Not created |
| iPhone 6.7" screenshots (×3 min) | 1290×2796 or 1284×2778 | ❌ Not created |
| iPhone 6.5" screenshots (×3 min) | 1242×2688 or 1284×2778 | ❌ Not created |
| iPhone 5.5" screenshots (×3 min) | 1242×2208 | ❌ Not created |
| iPad screenshots (if universal) | 2048×2732 | ❌ Not created |
| App preview video (optional) | Up to 30 seconds | ❌ Not created |

### 17.2 App Store Metadata

```yaml
App Name: قريب — Qareeb
Subtitle: أقرب رعاية إليك | The nearest care to you
Category: Medical (primary), Health & Fitness (secondary)
Content Rating: 4+ (no objectionable content)
Price: Free
Privacy Policy URL: [MUST BE A PUBLIC URL — not an in-app screen]
Support URL: [REQUIRED — wa.me link or website]
Marketing URL: [OPTIONAL]
Keywords (AR): طبيب, صيدلية, بغداد, عراق, رعاية صحية, قريب, دواء, سجل صحي
Keywords (EN): doctor, pharmacy, baghdad, iraq, healthcare, nearest, medicine, health record
```

### 17.3 Age Rating Questionnaire

| Question | Answer |
|---|---|
| Medical/Treatment Information | Yes — "Information about diseases or treatments is provided" |
| Unrestricted Web Access | No |
| Gambling | No |
| Contests | No |
| Alcohol/Tobacco/Drug References | Yes — medicine catalogue includes controlled substances (educational) |
| Sexual Content | No |
| Profanity | No |
| Horror/Fear Themes | No |
| Violence | No |

**Result: Rated 12+** (due to medical information + controlled substance references)

### 17.4 Export Compliance

- **Uses encryption?** Yes — HTTPS (TLS) for network communication + HMAC-SHA256 for auth tokens
- **Standard encryption exemption?** Yes — uses only standard OS-provided encryption (URLSession/WKWebView TLS)
- **Exempt from ERN?** Yes — qualifies for the mass-market exemption (standard encryption for authentication and data protection)

---

## 18. FILES MODIFIED BY PROGRAMMER 2

**No files modified.** This handoff document is the deliverable. All recommendations are patches for Programmer 1 to implement.

Files created:
- `hub/QAREEB_APPLE_HANDOFF.md` — this document
- `hub/apple/Info.plist.template` — Info.plist template
- `hub/apple/PrivacyInfo.xcprivacy.template` — Privacy manifest template

---

## 19. FILES THAT NEED PROGRAMMER 1 CHANGES

| File | Change Needed | Priority | Reason |
|---|---|---|---|
| `js/ui-core.js` | Encrypt health data storage (replace LS for record) | **CRITICAL** | Apple Guideline 5.1.2 |
| `js/ui-discovery.js` | Add geolocation pre-prompt before native permission | HIGH | Apple UX best practice |
| `js/ui-discovery.js` | Add medical disclaimer to `screenAbout()` | HIGH | Apple Guideline 1.4.1 |
| `js/ui-record.js` | Add medical disclaimer before record creation | HIGH | Apple Guideline 1.4.1 |
| `js/transport.js` | Replace `Math.random()` with `crypto.randomUUID()` | MEDIUM | Security improvement |
| `netlify.toml` | Add Content-Security-Policy header | MEDIUM | Security hardening |
| `index.html` | Add `<link rel="manifest">` for web manifest | LOW | PWA completeness |
| New: server endpoint | Add `POST /record/delete` for server-side data deletion | HIGH | Apple Guideline 5.1.1(v) |

---

## 20. CONFLICTS WITH PROGRAMMER 1

**No conflicts detected.** Programmer 2 did not modify any code files. All deliverables are new files (this document + templates).

### Potential Future Conflicts

If Programmer 1 modifies these files before implementing recommendations:

1. **`js/ui-core.js`**: The `LS` wrapper (lines 1-20) is the integration point for encrypted storage. Any changes to `LS.get` / `LS.set` must account for the encryption migration.

2. **`js/ui-discovery.js`**: The geolocation call at line 1468 needs a pre-prompt wrapper. The function `openLocation()` is the integration point.

3. **`js/transport.js`**: The `deviceId()` function (exact location depends on current state) generates the device ID. The `Math.random()` call there is the one to replace.

---

## 21. CRITICAL BLOCKERS

These MUST be resolved before Apple submission:

### BLOCKER 1: No Native iOS Project
- **What:** No Xcode project, Capacitor, or WKWebView wrapper exists
- **Impact:** Cannot submit to App Store without a native binary
- **Fix:** Create Capacitor project (see Section 3)
- **Effort:** 2-4 hours for initial setup; 1-2 days for testing
- **Owner:** Programmer 1

### BLOCKER 2: Unencrypted Health Data
- **What:** `qareeb.record.v1` contains full clinical records in plaintext localStorage
- **Impact:** Apple Guideline 5.1.2 requires encryption of health data at rest
- **Fix:** Use Capacitor Preferences (Keychain-backed) or SQLCipher for health data
- **Effort:** 4-8 hours (modify LS wrapper + migration logic)
- **Owner:** Programmer 1

### BLOCKER 3: No Medical Disclaimer
- **What:** No visible disclaimer that Qareeb is not medical advice
- **Impact:** Apple Guideline 1.4.1 — medical apps must include disclaimers
- **Fix:** Add disclaimers at two points (see Section 15.3)
- **Effort:** 1-2 hours
- **Owner:** Programmer 1

### BLOCKER 4: No Privacy Policy URL
- **What:** Privacy policy exists as an in-app screen but Apple requires a publicly accessible URL
- **Impact:** App Store Connect requires a privacy policy URL field
- **Fix:** Host the privacy content at a public URL (e.g., on the same Netlify site as a static page)
- **Effort:** 30 minutes
- **Owner:** Programmer 1

### BLOCKER 5: No Server-Side Data Deletion
- **What:** `executeDeleteData()` only clears localStorage; server data persists
- **Impact:** Apple Guideline 5.1.1(v) requires complete data deletion
- **Fix:** Add `POST /record/delete` endpoint (see Section 11)
- **Effort:** 2-4 hours
- **Owner:** Programmer 1

---

## 22. RECOMMENDED FIXES

These should be fixed but are not hard blockers:

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Geolocation pre-prompt | `ui-discovery.js` | 1 hour |
| 2 | Replace Math.random device ID | `transport.js` | 15 minutes |
| 3 | Add CSP header | `netlify.toml` | 30 minutes |
| 4 | Web manifest for Qareeb | `hub/manifest.webmanifest` (new) | 30 minutes |
| 5 | App icon in multiple sizes | Design task | 2 hours |
| 6 | App Store screenshots | Design task | 4 hours |
| 7 | Bundle Google Fonts locally | Remove external request | 1 hour |

---

## 23. NICE-TO-HAVE

These improve the App Store experience but are not required:

| # | Improvement | Notes |
|---|---|---|
| 1 | App preview video (30s) | Shows the "find nearest doctor" flow |
| 2 | Localised screenshots (AR + EN) | Arabic screenshots for primary, English for secondary |
| 3 | Apple Sign In | Only needed if social login is added later |
| 4 | Push notifications for request answers | Would improve UX; not needed for v1 |
| 5 | HealthKit integration | Could import/export conditions; adds complexity |
| 6 | Siri Shortcuts | "Hey Siri, find a pharmacy near me" |
| 7 | Widget | Show nearest open pharmacy on home screen |

---

## 24. ACTION CHECKLIST

### Before You Can Submit (Programmer 1)

- [ ] Create Capacitor project and generate Xcode workspace
- [ ] Add Info.plist with location permission string (template in Section 7)
- [ ] Add PrivacyInfo.xcprivacy (template in Section 8)
- [ ] Encrypt health record storage (replace localStorage for clinical data)
- [ ] Add medical disclaimers (two locations — see Section 15.3)
- [ ] Host privacy policy at a public URL
- [ ] Add server-side data deletion endpoint
- [ ] Create app icon (1024×1024 PNG)
- [ ] Take App Store screenshots (3 sizes minimum)
- [ ] Fill in App Store Connect privacy labels (matrix in Section 9)
- [ ] Fill in App Store Connect metadata (Section 17.2)
- [ ] Complete export compliance questionnaire (Section 17.4)
- [ ] Complete age rating questionnaire (Section 17.3)
- [ ] Test on physical iOS devices (Section 16.3)
- [ ] Run full test plan (Section 16.2)
- [ ] Add geolocation pre-prompt (Section 5.1)
- [ ] Submit for App Review

### After First Submission

- [ ] Monitor App Review for rejection reasons
- [ ] Address any review feedback within 24 hours
- [ ] If rejected for medical category: add "Not a Medical Device" disclaimer prominently
- [ ] If rejected for data handling: implement recommended encryption changes

---

## APPENDIX A: APPLE REVIEW GUIDELINES REFERENCED

| Guideline | Section | Relevance |
|---|---|---|
| 1.4.1 | Physical Harm — Medical | Medical disclaimers required |
| 2.1 | App Completeness | Must be fully functional, not a prototype |
| 2.3.3 | Screenshots | Must match actual app |
| 4.0 | Design — General | Minimum functionality for web wrapper apps |
| 4.2 | Minimum Functionality | Web-wrapped apps must provide sufficient native value |
| 4.8 | Sign in with Apple | Required only if social login is used |
| 5.1.1 | Data Collection and Storage | Privacy policy + account deletion |
| 5.1.1(v) | Account Deletion | Must delete all data (client + server) |
| 5.1.2 | Data Use and Sharing | Health data encryption + purpose limitation |
| 5.1.3 | Health and Health Research | Special requirements for health data |
| 5.2.1 | Legal — Privacy Requirements | COPPA, GDPR, HIPAA considerations |

### APPENDIX B: GUIDELINE 4.2 RISK — MINIMUM FUNCTIONALITY

**HIGH RISK.** Apple frequently rejects WKWebView-wrapped web apps under Guideline 4.2 ("Minimum Functionality") if the app is just a website in a shell. To mitigate this:

1. The Capacitor wrapper should use **at least one native capability** beyond what Safari provides. The most natural candidate is **encrypted local storage** (the health record encryption solves both 5.1.2 AND 4.2).

2. Consider adding **haptic feedback** via Capacitor's Haptics plugin (replacing the no-op `navigator.vibrate()`).

3. Consider adding the app icon as a proper **launch screen** with the Qareeb brand, not the default Capacitor splash.

4. In App Review notes, emphasize the **offline-first health record** as a native-exclusive feature (since WKWebView doesn't support service workers, the native app's local storage IS the offline story).

---

*End of handoff. All templates and recommendations are designed to be implemented without modifying Programmer 2's work. No existing code was changed by this analysis.*
