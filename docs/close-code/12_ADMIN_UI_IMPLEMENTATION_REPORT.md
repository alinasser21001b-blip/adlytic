# 12 — Admin UI implementation report

## Implemented

**`src/web/pages/adminSurfaceNav.ts` — rewritten.** Was a flat list of five
destinations; is now the typed information architecture (`ADMIN_IA`) with
sections, per-destination purpose strings, and `adminDestinations()` for
route-coverage testing.

**`src/web/pages/adminStatus.ts` — new.** The canonical status vocabulary:
17 states, their tone/glyph/label, `ABSENCE_STATES`, the `MUST_DIFFER` pairs,
`ADMIN_STATUS_CSS`, and `statusChip()`. It renders; it decides nothing.

**`adminConsolePage.ts`** — its private seven-group cross-page block replaced
by the shared map. Its own eight in-page views kept, nested beneath.

**`adminOsPage.ts`** — the shared map prepended to its four in-page groups.

**`server.ts`** — the manual-connect token moved from the URL query string to
an `Authorization` header.

## Not implemented, and why

**The console page merge.** `adminConsolePage` (1,898 lines) is a functional
**superset** of `adminOsPage` (984 lines): it alone owns settings,
subscriptions, payment events and the overview API. Redirecting
`/admin/classic` into `/admin` — the option originally approved — would have
silently removed operator capability.

Merging them properly is a functional refactor, not presentation work, and
doing it half-way is worse than not starting. Both pages now render the same
map, so the operator-facing symptom (three different maps) is fixed. The merge
is recorded as debt with its plan.

## Verification

`test_admin_os.ts`, 15 assertions:

- every admin surface renders the shared map;
- the Brain Observatory is reachable by navigation and sits under
  INTELLIGENCE;
- no section renders empty;
- every IA destination is a mounted route (no dead menu entries);
- every mounted admin page is reachable from the IA (no orphans) — `/admin/login`
  excepted as the unauthenticated door;
- no destination is offered twice;
- the eight `MUST_DIFFER` status pairs render differently;
- absence states are always dashed and muted;
- colour is never the only signal;
- all 40 admin API routes are guarded; all page routes gated;
- authorization is server-side, not a UI branch;
- no admin surface re-derives canonical intelligence or introduces a
  threshold.

The intelligence-containment guard is negative-tested: a planted
`detectAnomaly()` call in an admin page fails it, and the file was restored
byte-identically (SHA-256 verified).
