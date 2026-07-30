# Design exploration — the protected core

Written by the supervisor, for the design agents. This is a boundary, not a
design brief. Nothing here tells you what to build.

## The rule

You are redesigning the **presentation / experience layer** over a domain core
that is already trusted, tested and clinically reviewed. The core is not yours
to change. Every design goal must be achievable in the presentation layer; if
you believe it is not, say so and stop — do not work around it.

## FROZEN — do not edit these files

```
hub/js/domain.js        prescription class, broadcast rules, request lifecycle
hub/js/emr.js           clinical domain: matching, ranges, flags, timeline,
                        significance, episodes, provenance, FHIR mapping
hub/js/record.js        projections, preVisitBrief
hub/js/consent.js       consent semantics, scopes, shares, carry codes,
                        break-glass, emergency card
hub/js/network.js       clinical actors
hub/js/sync.js          data integrity
hub/js/transport.js     backend contract, device identity
hub/js/assist.js        epistemic layer (FACT / INTERPRETATION / SUGGESTION)
hub/netlify/functions/  server contract
hub/netlify.toml        deployment, CSP, Permissions-Policy
```

You may **read** all of them — you must, to learn the domain concepts, the
available data, the clinical workflows and the safety rules. You may **call**
anything they export. You may not modify them.

## FROZEN — do not edit these tests

```
hub/tools/test.mjs  test-server.mjs  test-needs.mjs  test-e2e.mjs
hub/tools/test-emr.mjs  test-record.mjs  test-journey.mjs  test-qareeb.mjs
hub/tools/test-ecosystem.mjs  test-record-plane.mjs  test-import.mjs
hub/tools/journeys.mjs  hub/tools/audit-ui.mjs
```

Changing a test expectation to make a redesign pass is the one thing that will
get an exploration rejected outright. If a test genuinely encodes a *visual*
assumption that a legitimate redesign must break, do not edit it — report it,
name the file and line, and explain why. The supervisor decides.

You may ADD new tests for new presentation behaviour.

## YOURS — the presentation layer

```
hub/index.html          shell, script order (all 16 scripts keep `defer`)
hub/css/                all of it
hub/src/styles/         the token layer
hub/js/app.js           the router and shell only
hub/js/ui-core.js       shared UI primitives
hub/js/ui-discovery.js  hub/js/ui-record.js
hub/js/ui-needs.js      hub/js/ui-backend.js  hub/js/ui-network.js
```

## Behaviour that must survive, however you restructure

These are not visual preferences. Each one is a defect that was found and fixed,
several of them clinical:

1. **Every route stays reachable.** 43 routes currently cold-deep-link with zero
   blank screens and zero dead ends. A redesign may change the doorway; it may
   not orphan a room.
2. **Provenance is always visible.** Patient-reported data must never render as
   clinician-confirmed. Absence of a marker must never imply confirmation.
3. **"Not recorded" is never "none".** An empty allergy field is an unknown,
   stated as an unknown, and never carries a checkmark.
4. **No reference range means no normality claim.** A value with no range is
   labelled as having none — never coloured or worded as normal.
5. **Numbers are never reordered by bidi.** No neutral character (`/ - – — · > <`)
   between two rendered numbers. A blood pressure is one run — use `bpPair()`.
   A unit that contains Arabic goes OUTSIDE the LTR run — use `measure()`.
   Guarded by tests and by the `ltrun` audit detector.
6. **Arabic is not styled as Latin.** No `letter-spacing` or `text-transform`
   on Arabic; leading is set from Arabic ink (floors are in `qareeb.css` §32).
   Arabic plural agreement goes through `countAr()` — four forms, not two.
7. **Accessibility already banked:** `role="main"`, the nav's tablist roles and
   `aria-selected`, `role="alert"` + `aria-live` on the offline bar, focus moved
   to the main landmark on route change, visible focus rings, 44px touch
   targets, 3:1 control boundaries (`--line-ctl`), 4.5:1 body text, reduced
   motion honoured globally, and colour never used alone to carry state.
8. **The Apple track is another developer's work.** The settings tab and route,
   `privacy.html`, the manifest, the CSP and `Permissions-Policy:
   geolocation=(self)` stay. Do not redesign them.
9. **Nothing is fabricated.** No invented doctors, pharmacies, verification,
   availability, appointments, or clinical links. If the data does not say two
   things are related, the interface must not either.
10. **Logical properties only.** No `left`/`right`/`margin-left`; the product is
    RTL-first. Guarded by the `rtl` audit detector.

## The gate you will be measured against

Baseline on `cc4ca1a`, all of which must still hold:

| check | command | expected |
|---|---|---|
| domain tests | `npm test` (from `hub/`) | 495 passing, 0 failing |
| journeys | `node tools/journeys.mjs` | 65 passing |
| UI audit | `node tools/audit-ui.mjs` | 0 findings across 10 detectors |
| build | `npm run build` | clean, single file |

The browser suites need a static server and Playwright:

```sh
cd <your worktree>/hub
mkdir -p node_modules
ln -sfn /tmp/claude-0/-home-user-adlytic/30c5cf51-55fb-5b53-a1de-65634dd53fa8/scratchpad/node_modules/playwright      node_modules/playwright
ln -sfn /tmp/claude-0/-home-user-adlytic/30c5cf51-55fb-5b53-a1de-65634dd53fa8/scratchpad/node_modules/playwright-core node_modules/playwright-core
nohup python3 -m http.server <YOUR OWN PORT> >/dev/null 2>&1 &
```

Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and you must
pass it as `executablePath`. Use your assigned port, not 8899 — three
explorations run concurrently. Remove the `node_modules` symlinks before your
final commit.
