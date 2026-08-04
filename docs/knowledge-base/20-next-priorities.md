# 20 — Next Priorities

No `PRODUCT_EVOLUTION_ROADMAP.md` or `OVERNIGHT_PROGRESS.md` file was found anywhere in the repository in this pass (searched under `docs/` and both app trees) — if these exist elsewhere or under different names, locate and fold them in; this file is built from `docs/dawai/BLUEPRINT_EXECUTION.md`, `docs/dawai/FINAL_MVP_READINESS.md`, `docs/dawai/APP_STORE_READINESS.md`, and `docs/technical/11-validation-report.html` instead.

## Track A — `dawai-platform` (shipped MVP), in the order the source docs state them

From `docs/dawai/BLUEPRINT_EXECUTION.md` "Remaining work, in blueprint order":
1. **OCR pipeline** — implement the `OcrProvider` interface and wire the ≥0.85 server-side confidence gate to a real provider. `model_output_log` and the gate *contract* already exist.
2. **Interaction alerts, data ingestion** — RxNorm mapping + DDInter ingestion; severity tiering must land together so only the severe tier interrupts (the whole point is avoiding alert fatigue — a half-loaded dataset that interrupts on everything would be worse than the current fail-closed `UNAVAILABLE` state).
3. **Offline mutation queue on the native shell** — server contract is ready (idempotency + additive deltas + append-only events already support it); the client-side queue and local notification scheduling need the native shell to actually exist first.
4. **Authenticity scan** — parse GS1 DataMatrix and QR codes; label results honestly as "sold through a Dawai-verified pharmacy," never "government-verified" (an explicit anti-overclaiming instruction from the same doc).
5. **Patient-facing clinical timeline UI** — `/api/v1/clinical/timeline` is live and typed; screens are next (see the open question about `TimelinePages.tsx` in `19-open-decisions.md` §6 — check whether this is already partly done before starting fresh).

From `docs/dawai/FINAL_MVP_READINESS.md` "Operator next steps (Baghdad pilot)":
6. Provision managed Postgres, run and verify a restore drill, set `DAWAI_ENV=staging|production` secrets.
7. Set `WEB_ORIGIN`, session pepper, encryption key, admin credentials for the target environment.
8. Upload verified pharmacy licenses; approve only pharmacies with documents on file (already enforced in code — this is an ops step).
9. Wire FCM/APNs/SMS providers once contracts are signed — outbox rows will resume flowing from `PENDING` automatically, no code change required.
10. Keep `MVP_DELIVERY_ENABLED=false` until the product explicitly decides to expand into delivery.
11. Run the Iraqi legal review before scaling prescription handling beyond a supervised pilot.

From `docs/dawai/APP_STORE_READINESS.md` (iOS packaging path):
12. Set up macOS+Xcode, Capacitor remote-URL shell over the production origin, App Store Connect listing (Arabic-first metadata already drafted in the doc).
13. Obtain an APNs `.p8` key and wire the adapter to the existing outbox `APNS` channel.
14. Get `/legal/*` pages lawyer-approved and hosted at a public URL before submission.
15. Do a real-device QA pass (Safari/WebKit rendering, VoiceOver+Arabic, Dynamic Type, camera/photo-picker flows, end-to-end push) — cannot be done from this environment.

From `18-technical-debt.md` (structural, not in the source docs but implied by the readiness gaps):
16. Decide and implement a safe multi-node outbox claiming strategy before scaling `worker.ts` horizontally.
17. Decide whether audit-log immutability needs a stronger guarantee (hash chain / DB-level permission lockout) before pilot scale increases.

## Track B — `platform/` (Blueprint v3 rebuild), per `docs/technical/11-validation-report.html`

Close the 11 named Blueprint gaps before their blocked screens can be built:
- `BD-1` — define the saved-pharmacy entity (per Account or per Subject? capped? survives branch closure?) — blocks screen M4.
- `BD-2` — define the price-dispute lifecycle — blocks operator screen O22.
- `BD-3` — define the support-ticket entity/lifecycle/ownership — blocks M15/P30/O20/O21.
- `BD-4` — define unmatched-search retention period and whether it's linked to an account — blocks operator screen O10.
- `BD-5` — define the consented-support-session entity and its patient-side consent-capture surface — blocks O19.
- `BD-6` — decide whether claim/staff invites can be resent or cancelled, and whether resending extends the 7-day expiry.
- `BD-7` — define the export-artifact lifecycle (format, link expiry, retention, whether it appears in the access log).
- `BD-8` — define a device-registration entity for push (one device or many per account? fallback when push is refused?) — blocks every push-dependent flow on this track.
- `BD-9` — (informational only, no decision needed) confirm the offline outbox correctly stays client-side-only with no server table.
- `BD-10`, `BD-11` — (not fully extracted in this synthesis pass — read `docs/technical/11-validation-report.html` directly for the remaining two before starting v3-track work that might touch them).

Once the entity gaps are closed, resume implementing the remaining 111-of-133 v3 screens against `docs/design/SCREEN_INVENTORY.md` Part 2, using `platform/tools/design` and `platform/tools/devserver` for preview/QA against the five-state contract (`12-design-system.md`).

## Cross-cutting priority, above both tracks

Resolve `19-open-decisions.md` §1 and §8 — get an explicit human decision on the relationship between `dawai-platform` and `platform/`, and document it in both README files. Every other priority above is more valuable once that's settled, because it determines whether Track B work should continue at all, be redirected to backport patterns into Track A, or be shelved.
