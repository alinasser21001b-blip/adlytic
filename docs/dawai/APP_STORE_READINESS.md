# Dawai — iOS App Store Readiness

**Status:** web/PWA is mobile-first and native-shell-ready. Native iOS packaging requires a macOS + Xcode + Apple Developer environment — see **External blockers** at the end.
**Backend contract:** unchanged. The REST API, auth model, idempotency, encryption, and notification outbox described in the platform docs remain the source of truth.

---

## 1. App identity

| Item | Value | Where |
|---|---|---|
| App Name | دوائي / Dawai | App Store Connect |
| Bundle Identifier | `iq.dawai.app` (**placeholder — change before first archive**, it is permanent once shipped) | `capacitor.config.json` → Xcode target |
| Version | `0.1.0` (marketing) | `package.json` / Xcode `MARKETING_VERSION` |
| Build number | start at `1`, increment every upload | Xcode `CURRENT_PROJECT_VERSION` |
| App icon | `public/dawai-icon.svg` master; export 1024×1024 PNG **without alpha** for App Store; `public/icon-192/512.png` already generated for PWA | Asset catalog |
| Launch screen | Solid `#173c37` + centered brand mark (configured in `capacitor.config.json` SplashScreen) | LaunchScreen.storyboard |
| Environments | API origin is same-origin; native shell must point at the **production** origin via `capacitor.config.json server.hostname`. Never ship a build pointing at staging. | config |

## 2. Recommended path: Capacitor shell over the production web app

The frontend is a same-origin SPA (no `VITE_API_URL`; cookies are `__Host-`-prefixed HttpOnly). Two viable modes:

1. **Remote-URL shell (recommended for MVP):** Capacitor `server.url = https://app.dawai.iq`. Cookies, CSRF, and CSP keep working unchanged; updates ship server-side (App Review allows this for HTML/JS content apps under 3.3.2 as long as core behavior doesn't change).
2. **Bundled `dist/` + Bearer auth:** the API already supports `Authorization: Bearer <token>` (`server/security/auth.ts:135`). If you bundle assets, store that token in **iOS Keychain via a Capacitor secure-storage plugin — never `localStorage`** — and skip CSRF (it applies to cookie auth only). This requires adding a small native-auth branch to `src/api/client.ts`; not needed for mode 1.

Setup (on macOS):
```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```
`capacitor.config.json` is already in the repo (appId, splash, keyboard `resize: native`, push presentation options).

## 3. iOS permissions — usage descriptions (Info.plist)

Request **at moment of use only** (the web app already behaves this way: geolocation is requested from the "استخدم موقعي" button, camera from the upload control). The app functions with every permission denied — location falls back to manual area entry, camera falls back to photo library / skip.

```
NSLocationWhenInUseUsageDescription
  دوائي يستخدم موقعك التقريبي فقط لمطابقة طلبك مع صيدليات قريبة وعرض المسافة.
  لا نتتبع موقعك في الخلفية ولا نشاركه مع الصيدليات قبل تأكيد الحجز.

NSCameraUsageDescription
  الكاميرا تُستخدم لتصوير علبة الدواء أو الوصفة عند اختيارك ذلك، لمساعدة
  الصيدلي على التعرف على الدواء. الصور تُشفَّر ولا تُستخدم لأي غرض آخر.

NSPhotoLibraryUsageDescription
  الوصول للصور يُستخدم فقط لاختيار صورة وصفة أو علبة دواء ترفعها بنفسك.

(Notifications: no Info.plist string — request via UNUserNotificationCenter at the
moment the user enables "إشعارات الدفع" in الملف الشخصي, never at launch.)
```
Do **not** include background-location, tracking (ATT), Bluetooth, or HealthKit keys — the app uses none of them, and unused keys invite review questions.

## 4. Push notifications (APNs) — architecture is ready

- Device registration endpoints exist: `POST/DELETE /api/v1/device-tokens` (`server/routes/shared.ts:186,218`) — call on APNs `registration` event and on logout; re-post on token refresh.
- The **notification outbox** already has an `APNS` channel that queues honestly (`PROVIDER_NOT_CONFIGURED` retry/backoff, never fake success) — `server/services/notifications.ts:154-185`. Wiring a real APNs provider = implementing one adapter server-side; no schema change.
- **Payload policy already correct:** outbox payloads are `{eventType, resourceId}` only — no medicine names, no patient identity, no coordinates (`notifications.ts:5-39`). Keep notification *titles* generic on the client ("لديك تحديث على طلبك") so lock-screen previews stay PHI-free.
- Deep links: map `eventType/resourceId` → routes (`OFFER_*` → `/patient/requests/:id`, `RESERVATION_*`/`READY_FOR_PICKUP` → `/patient/reservations/:id`). Register `applinks:app.dawai.iq` (Universal Links) + AASA file on the server; the SPA router handles the paths already.
- Foreground: `presentationOptions` set in `capacitor.config.json`; in-app list at `/patient/notifications` is the source of truth.

## 5. Privacy & App Store nutrition label

Data collected (all linked to account, none used for tracking, no third-party ads — the privacy policy states health data is never used for ads):

| App Store category | Dawai data | Purpose |
|---|---|---|
| Contact info | name, email, phone (optional) | account |
| Health & fitness → Other | medicine request contents, prescription images (encrypted AES-256-GCM at rest) | app functionality |
| Location → Coarse | approximate coordinates at request time only | matching |
| Identifiers | none beyond account id | — |
| Tracking | **none** — answer "No" to tracking; no ATT prompt needed | — |

Already implemented in the product (verify, don't rebuild):
- ✅ Privacy Policy / Terms / Pharmacy terms / Prescription policy / Retention pages at `/legal/*` — **must move from draft to lawyer-approved text and be hosted at a public URL for App Store Connect.**
- ✅ **Account deletion in-app** (`POST /api/v1/auth/account/delete`) — required by guideline 5.1.1(v). Surface it clearly in الملف الشخصي.
- ✅ Prescription access restricted to the chosen pharmacy during an active hold, audited, 404-on-deny, `Cache-Control: no-store`.
- ✅ Consent checkboxes at registration and prescription upload.
- ✅ No PHI in push payloads; no secrets in the client (session = HttpOnly cookie; encryption keys server-side only).

## 6. Review-guideline mapping (the ones that will actually come up)

| Guideline | Risk | Position |
|---|---|---|
| 1.4.1 Medical apps | Being classed as diagnosis/treatment | Dawai is a **request-for-availability network connecting patients with verified nearby pharmacies**. It does not diagnose, prescribe, dose, or substitute — the safety line is in-product. Keep this exact positioning in metadata. |
| 3.1.1 Payments | IAP flags | No payments in MVP; prices shown are pharmacy pickup prices paid offline. State this in review notes. |
| 5.1.1 Data collection | Consent, deletion | Covered above; provide demo credentials in review notes. |
| 5.1.2 Data use | Sharing with pharmacies | Disclose: request content shared with nearby verified pharmacies; identity/prescription only after confirmed hold. |
| 2.1 Completeness | Reviewer can't test | Provide seeded demo patient + pharmacy + admin accounts on a staging-like production, and a review-notes walkthrough of the request→offer→hold flow. |

**Age rating:** 17+ is unnecessary; answer the medical/treatment questionnaire honestly → typically 12+ ("Medical/Treatment Information: Infrequent"). **Export compliance:** uses standard HTTPS/at-rest crypto → "exempt" (mass-market), answer the encryption questions accordingly.

## 7. App Store assets checklist

- [ ] 1024×1024 icon PNG, no alpha, no rounded corners
- [ ] iPhone 6.9″ + 6.5″ screenshot sets (ar-first: الترحيب، الطلب، العروض، تذكرة الحجز، وارد الصيدلية)
- [ ] Arabic metadata (primary): الاسم «دوائي»، subtitle «نجد دواءك بالقرب منك»، وصف يطابق positioning أعلاه، keywords: دواء، صيدلية، بغداد، توفر، حجز
- [ ] English metadata: "Dawai — request medicine availability from verified nearby pharmacies"
- [ ] Support URL + marketing URL (host on the same domain)
- [ ] Privacy Policy URL (public, lawyer-approved)
- [ ] Review notes: demo accounts + flow walkthrough + "no payments, pickup only" statement

## 8. Testing matrix status (this session)

- Unit: `npm test` — **16/16 PASS**
- Types: `npm run check` — **PASS**
- E2E journey (desktop 1440 + Pixel 7): register→verify→request(wizard)→offer→hold ACK→ready→complete, zero console errors, zero horizontal overflow — see CI output
- Mobile matrix (`e2e/mobile.spec.ts` on iPhone SE / 14 / 15 Pro Max / 360px Android): overflow, ≥44px targets, ≥16px inputs, bottom-nav, wizard gating/back behavior
- Engine caveat: matrix runs on chromium with iPhone metrics; **real-device Safari/VoiceOver pass is an external step** (below).

## 9. External blockers (cannot be completed from this environment)

1. **Apple Developer Program account** ($99/yr) — certificates, provisioning, App Store Connect.
2. **macOS + Xcode** — `npx cap add ios`, archive, upload. No Mac in this environment.
3. **APNs key** (.p8) + server adapter credentials for the outbox `APNS` channel.
4. **Production domain + TLS** for `server.hostname`, Universal Links AASA, privacy/support URLs.
5. **Iraqi legal review** of the `/legal/*` drafts (the pages themselves say so) and any Ministry of Health/نقابة positioning sign-off.
6. **Real-device QA**: Safari/WebKit rendering, VoiceOver with Arabic, Dynamic Type, camera/photo picker flows, push end-to-end.
7. **App Store review itself** — plan for one rejection cycle on guideline 1.4/5.1 wording; the positioning table above is the response script.
