# 04 — Business Rules

Extracted from migrations 0004–0007, `server/services/{clinical,interactions,matching,lifecycle}.ts`, and `server/security/*`. Each rule states the *why* where the source documents it — these comments are unusually explicit in this codebase and should be preserved verbatim in future migrations.

## Matching & dispatch (`services/matching.ts`, `ARCHITECTURE.md`)

1. Only verified, active, `accepting_requests = true` branches inside a geographic bounding box are candidates.
2. Distance via Haversine on stored lat/long (PostGIS noted as a drop-in future replacement without an API contract change).
3. Closed branches are excluded using branch IANA timezone + `opening_hours`.
4. Score = weighted combination of distance, response rate, response speed, pickup/delivery fit — weights `0.28/0.22/0.17/0.13/0.10/0.06/0.04` plus penalties, configurable via env (`docs/dawai/FINAL_MVP_READINESS.md`). No pay-to-rank.
5. Dispatch caps: at most 6 branches at 2 km; a follow-up wave of up to 8 *new* branches at 5/10 km, staged via `request_dispatches.notify_after` (3+3 staged dispatch — first wave of 3, second wave of 3 more after 45s if no offer, per the readiness report).
6. Radius only expands after an explicit patient action (`POST /patient/requests/:id/expand`) — never silently.

## Offer & reservation integrity

7. **One active/hold offer per (request, branch)** — `pharmacy_offers_one_active_branch_idx` partial unique index.
8. **One live reservation per request** — `reservations_one_live_request_idx` partial unique index; enforced additionally by conditional (compare-and-swap style) DB updates, not just the index, per `ARCHITECTURE.md`.
9. **The hold timer starts only on pharmacy acknowledgement, never on patient selection.** `hold_expires_at` is null until ACK. This is a repeatedly-stated rule across `ARCHITECTURE.md`, `README.md`, and `FINAL_MVP_READINESS.md` — treat any code path that sets a hold deadline at reservation-creation time as a bug.
10. An `ORDERABLE`-type offer (i.e., "we can get this, not in stock now") cannot be auto-reserved — must go through explicit confirmation (`FINAL_MVP_READINESS.md` "Hardened this wave").
11. A pharmacy-side alternative/substitution offer (`ALTERNATIVE_REVIEW_REQUIRED`) is never auto-reservable — requires explicit patient review, per the "no auto-substitution" AI/product guardrail.
12. `medicine_requests.quantity` is capped at 20 — a soft anti-hoarding/anti-diversion bound independent of any prescription/controlled-substance check.

## Family proxy authority (`0004`, `0006`, `services/clinical.ts`)

13. A proxy link is never silent: `consent_granted_at` is NULL until the member (or a witnessing pharmacist, for the no-phone elderly case) accepts.
14. Scopes are additive and least-privilege: `VIEW < ORDER < CONFIRM`.
15. Exactly one live link per (owner, member) pair (`family_members_live_pair_idx`, `0006`) — authority must be deterministic, not "whichever row the planner returns first."
16. `requirePatientAuthority()` throws rather than returning a boolean — a forgotten check cannot silently fall through to a permissive branch (`BLUEPRINT_EXECUTION.md`).
17. Authority-check failures distinguish "insufficient scope" (403) from "no relationship at all" (404) — deliberately, to avoid an unauthorized caller probing for the existence of a profile.

## Dose adherence

18. `sig_source = 'PHARMACIST'` may only be written by a pharmacy account — a patient can never self-assert pharmacist authorship of a dosing instruction (data-layer enforcement of "never AI/patient-authored medical certainty").
19. `dose_events` is insert-only; a correction is a new row.
20. Offline replay is deduped by `(dose_schedule_id, client_event_id)`; a retried offline queue returns `duplicate: true` with HTTP 200, not an error — a retry is a success, not a fault.
21. **Days-of-cover honesty gates** (`computeDaysOfCover()`): returns `suppressed: true` with a typed reason instead of a number when: no completed dispense cycle exists (`NO_DISPENSE_CYCLE`); confirmed intake exceeds what was dispensed (`CONFLICTING_DATA` — the patient likely has stock the system doesn't know about); or the patient snoozed the reorder suggestion (`SNOOZED` — snooze always wins over nagging).

## Passive inventory ledger

22. On-hand quantity is *always* derived (`SUM(delta_qty)`), never an editable field anywhere in the API — this is what "not an ERP" means concretely.
23. Deltas are additive so two offline devices selling the same SKU both apply correctly on sync; an absolute-overwrite model would silently lose one sale.
24. Offline dedupe key is scoped to `(branch_id, medicine_name, client_event_id)` — **not** just `(branch_id, client_event_id)` (fixed in `0006` after a real bug: a multi-line offline sale sharing one client-event-id had every line after the first swallowed by `ON CONFLICT DO NOTHING` and misreported as a duplicate).
25. `sku_trust.trust_score` gates whether a SKU is forecast-ready. Below `SKU_TRUST_THRESHOLD` (0.6, per `BLUEPRINT_EXECUTION.md`), the SKU returns `forecastReady:false` and **no reorder hint at all** — excluded, not caveated.
26. A stock count that *matches* the ledger (delta 0) must still be recordable to raise trust (`0007` fix to the `delta_qty <> 0` CHECK) — otherwise trust can never rise by confirming the ledger was right, only fall by disagreeing with it.

## Interaction safety (`0005`, `services/interactions.ts`) — see `10-clinical-safety.md` for full detail

27. Coverage is explicit: an ingredient absent from `interaction_ingredients` cannot be evaluated, and a regimen containing one is reported `UNAVAILABLE` — never silently cleared on the covered subset.
28. `outcome` is one of `CLEAR, INFO, INTERRUPT, UNAVAILABLE` — there is no ambiguous "probably fine."
29. Override is only ever populated for an `INTERRUPT` outcome (`CHECK` constraint) and requires a typed reason ≥10 characters — override rate is a tracked KPI.
30. Every check is recorded, including `UNAVAILABLE` outcomes — for regulatory defensibility (what the system knew and told the pharmacist at dispense time).

## Attention system

31. `SEV_ALERT` priority events can never carry an `expires_at` (`attention_sev_never_expires` CHECK, `0006`) — a severe alert clears only when its underlying cause resolves, never on a timer. The server additionally rejects a dismissal attempt on a `SEV_ALERT` with `409 SEV_ALERT_NOT_DISMISSIBLE`, and the client renders no dismiss affordance at all (not merely a disabled one) — enforced on both sides deliberately, "either alone is a bug waiting to happen" (`BLUEPRINT_EXECUTION.md`).
32. Attention dedupe (`dedupe_key`) must account for expiry — an expired-but-undismissed event must not permanently block re-raising the same condition (fixed `0006`).

## Auth / security (`server/security/auth.ts`, `ARCHITECTURE.md`)

33. Passwords: Argon2id. Sessions: 32 random bytes, only a SHA-256+pepper digest persisted.
34. Web sessions: HttpOnly, Secure-in-production, SameSite=Lax cookie + rotating CSRF token + exact Origin check. Native/future-mobile: same opaque token as `Authorization: Bearer`.
35. Session revocation is immediate on user/pharmacy suspension.
36. Client-side role selection changes presentation only; the API enforces role server-side on every request — "the browser is never an authorization boundary" (`ARCHITECTURE.md`).
37. Every mutation body is validated with strict Zod schemas; every retryable creation/selection endpoint requires an `Idempotency-Key` header.

## Uploads (`storage/encrypted-files.ts`)

38. Pipeline: byte+pixel limit → magic-byte check (PNG/JPEG/WebP) → full image decode → rotation/bounded-resize/JPEG re-encode/metadata (EXIF) stripping → random file ID/storage key → AES-256-GCM with random 96-bit nonce → AAD binds file+owner+purpose → ciphertext on disk, nonce/tag/metadata in Postgres → authorization check before decryption, audited access → `Cache-Control: no-store` on the decrypting response.
39. A non-selected pharmacy can never access a prescription image. A selected pharmacy gains temporary access only while its acknowledged hold is active.

## Notifications

40. Outbox payloads are `{eventType, resourceId}` only — no medicine name, no patient identity, no exact location — regardless of channel (`ARCHITECTURE.md`).
41. An unconfigured push provider is never marked "delivered" — it stays `PENDING`/`FAILED` honestly (`FINAL_MVP_READINESS.md` "Hardened this wave").
