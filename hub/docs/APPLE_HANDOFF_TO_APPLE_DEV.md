# HANDOFF TO APPLE DEVELOPER

> Items that ONLY the Apple Developer can complete.
> Everything the product track could do is done or documented as blocked.
> Updated: 2026-07-30

---

## Ready for You

These items are prepared and waiting for the Apple Developer to take over:

### 1. Info.plist
- **Template:** `hub/apple/Info.plist.template`
- **Status:** Complete. Copy into Xcode project after creating native wrapper.
- **Only permission declared:** `NSLocationWhenInUseUsageDescription` (Arabic)
- **Action:** Drop into the Xcode project. No modifications needed unless new permissions are added.

### 2. PrivacyInfo.xcprivacy
- **Template:** `hub/apple/PrivacyInfo.xcprivacy.template`
- **Status:** Complete. 6 data types declared, zero tracking.
- **Action:** Rename to `PrivacyInfo.xcprivacy` and add to Xcode project.

### 3. Privacy Policy URL
- **File:** `hub/privacy.html`
- **Route:** `/privacy` (Netlify redirect configured in `netlify.toml`)
- **Status:** Created and deployed. Bilingual (Arabic default, English toggle).
- **Action:** Enter `https://<your-domain>/privacy` in App Store Connect.

### 4. App Store Connect Privacy Labels
- **Matrix:** `QAREEB_APPLE_HANDOFF.md` §9
- **Summary:**
  - Data Used to Track You: **None**
  - Data Linked to You: Health data, Phone number
  - Data Not Linked to You: Location, Device ID, Search history, Usage data
- **Action:** Enter in App Store Connect manually.

### 5. Web App Manifest
- **File:** `hub/manifest.webmanifest`
- **Status:** Created and linked in `index.html`. Arabic-first, standalone, portrait.
- **Action:** None needed. Already deployed.

### 6. CSP Header
- **File:** `hub/netlify.toml`
- **Status:** Added. Allows self + Google Fonts. Blocks eval, external scripts.
- **Action:** None needed. Already deployed.

---

## Needs Your Action

### 7. Create Native iOS Project
- **Recommendation:** Capacitor (documented in `QAREEB_APPLE_HANDOFF.md` §3)
- **Web asset source:** `hub/` directory (the `publish = "."` directory in netlify.toml)
- **No build step** for client JS/CSS — load files directly
- **Deep link routes:** Hash-based (`#/doctors`, `#/record`, etc.) — no server-side routing needed
- **Permission requirements:** Location When In Use only
- **Environment variables:** None needed for client. Server uses `QAREEB_PHARMACY_REGISTRY`, `QAREEB_HMAC_KEY` (Netlify-side only).

### 8. App Store Screenshots
- Required sizes: 6.7" (1290×2796), 6.5" (1242×2688), 5.5" (1242×2208)
- Minimum 3 per size
- Suggested screens: Home, Doctor detail, Pharmacy search, Health record, Privacy settings

### 9. App Icon
- 1024×1024 PNG, no alpha, no rounded corners
- Current SVG source: `hub/favicon.svg` (petrol + amber brand colors)

### 10. Export Compliance
- Standard TLS only (URLSession/WKWebView). Mass-market exemption applies.
- HMAC-SHA256 for auth tokens (server-side `node:crypto`).
- No custom encryption algorithms.

### 11. App Store Review Notes
- Draft in `QAREEB_APPLE_HANDOFF.md` §15.4
- Must include: "Qareeb is a healthcare DIRECTORY, not a diagnostic tool"
- Demo credentials: Document how the reviewer can test pharmacy features

### 12. Age Rating
- Recommended: **12+** (medical information + controlled substance references in catalogue)

---

## Blocked Items (Need Product/Backend First)

These cannot proceed until another team acts:

| Item | Blocked On | Who |
|---|---|---|
| Health data security (engineering recommendation, not an explicit Apple mandate — §1.6 says "appropriate security measures" generically) | Native wrapper must exist first (Capacitor Preferences / Keychain) | Product + Apple Dev |
| Server-side account deletion | Backend must create `POST /record/delete` endpoint | Backend |
| Medical disclaimers | Product team must approve wording and placement | Product |
| Location pre-prompt | Product team must design the pre-prompt UX | Product |

---

## What Changed Since Last Handoff

| Change | File | Impact on Apple Dev |
|---|---|---|
| Added `manifest.webmanifest` | `hub/manifest.webmanifest` | None — already linked in index.html |
| Added manifest link to index.html | `hub/index.html` | Line 40: `<link rel="manifest">` added |
| Added CSP header | `hub/netlify.toml` | None — server config |
| Added privacy policy page | `hub/privacy.html` | Use `/privacy` as App Store Connect URL |
| Added privacy route | `hub/netlify.toml` | `/privacy` → `/privacy.html` redirect |
| Fixed device ID security | `hub/js/transport.js:90` | crypto.getRandomValues replaces Math.random |
| Added manifest + privacy to SW shell | `hub/sw.js:35` | Cached for offline |
| Created tracker | `hub/docs/APPLE_IMPLEMENTATION_TRACKER.md` | Reference doc |
| Created this handoff | `hub/docs/APPLE_HANDOFF_TO_APPLE_DEV.md` | This file |

---

## File Inventory for Apple Dev

```
hub/
├── apple/
│   ├── Info.plist.template          ← Copy to Xcode project
│   └── PrivacyInfo.xcprivacy.template ← Rename and add to Xcode project
├── docs/
│   ├── APPLE_IMPLEMENTATION_TRACKER.md
│   └── APPLE_HANDOFF_TO_APPLE_DEV.md  ← This file
├── privacy.html                     ← Public privacy policy URL
├── manifest.webmanifest             ← Web app manifest (already linked)
├── QAREEB_APPLE_HANDOFF.md          ← Full 24-section audit (reference)
└── netlify.toml                     ← CSP header + privacy route added
```
