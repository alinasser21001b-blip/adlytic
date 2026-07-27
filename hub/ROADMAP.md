# QAREEB — Product Evolution Roadmap

**This file is the source of truth for the transformation.** It survives session
boundaries. Any session can pick up by reading the phase table, finding the first
`TODO`, and executing it. Every phase ends in a production-ready, deployed state.

Production target: **`qareeb-iq`** only. Archived Netlify projects are ignored.
Deploys are automatic: push to `claude/healthcare-hub-strategy-56wyer` → Netlify
builds from `hub/` in ~9s.

---

## Audit — what is actually weak

Measured, not guessed (Playwright across 375/390/430/768/1024/1280).

| # | Weakness | Evidence | Phase |
|---|---|---|---|
| 1 | Home was a menu of links, not a product | no live state, no differentiator visible | ✅ P0 |
| 2 | Doctor profile is the conversion screen and still uses v1 patterns | `prof-facts` generic, fee buried, no reason-to-trust above fold | P1 |
| 3 | Booking sheet asks before it reassures | no clinic response expectation, no fallback if no reply | P1 |
| 4 | Search has no intelligence — exact-ish match only | no symptom→specialty routing surfaced, no typo tolerance beyond normalisation | P2 |
| 5 | Pharmacy profile does not sell the pharmacy | services as flat chips, no stock signal, no reason to pick this one | P3 |
| 6 | Care is orphaned — no relationship to medicine availability | two product concepts (PRODUCTS, MEDICINES) that never meet | P3 |
| 7 | No offline behaviour at all | app is blank if the network drops mid-session | P4 |
| 8 | Admin is a demo, not an operator tool | no verification actions, no data-quality scoring, no stale detection | P5 |
| 9 | No doctor-side surface | Scenario D has no screen; supply side is pharmacy-only | P5 |
| 10 | `data.js` is a flat file with no integrity guarantees | duplicate ids, orphan refs and bad time ranges fail silently | P6 |
| 11 | ~~SVG stroke overflows layout box~~ | resolved by the P1 profile rebuild — overflow is now zero at every breakpoint | ✅ P1 |
| 12 | No revenue instrumentation | requests logged locally, never attributed to a partner | P5 |

---

## Phases

Each is independently shippable. Do not start the next until the current is
committed and deployed green.

| Phase | Scope | Status |
|---|---|---|
| **P0** | Home as a reading of the network — live intent tiles, scarcity headline, trust proof | ✅ `824edc6` |
| **P1** | **Conversion funnel** — doctor profile rebuilt around the decision, booking sheet that reassures before it asks, handoff that survives no-reply | ✅ `PHASE1` |
| **P2** | ⬅ **NEXT** — **Discovery intelligence** — symptom routing, tolerant matching, zero-result recovery that always routes | TODO |
| **P3** | **Pharmacy + Care convergence** — pharmacy profile that sells, Care joined to medicine availability | TODO |
| **P4** | **Resilience** — offline shell, stale-data honesty, request queue survives a dropped connection | TODO |
| **P5** | **Supply side + revenue** — doctor dashboard, partner attribution on every lead, operator verification actions | TODO |
| **P6** | **Data integrity + code quality** — schema validation at load, dead-code sweep, the SVG overflow | TODO |
| **P7** | **Motion + micro-interaction pass** — one language, purposeful only | TODO |
| **P8** | **Final QA** — full journey timing, a11y, both themes, all breakpoints | TODO |

---

## Principles that do not change

These were established by research and are not up for re-litigation in later phases.

1. **Time beats distance.** Doctors rank by soonest availability, never by proximity.
2. **Medicine scarcity is the wedge.** Iraq has three doctor directories already
   (IRAQDR, Doctoury, Clinicbooking). Nobody structures "who has this in stock".
3. **No accounts, no cart, no checkout, no ratings.** Trust is verification +
   freshness, never stars.
4. **WhatsApp is the transaction layer**, and the message is always previewed
   before it is sent.
5. **Arabic is authored, not translated.** RTL-native, 24h time, tabular numerals.
6. **Never gate, never scold.** Location, permissions and empty results are
   designed states with a way forward.
7. **Amber means time. Coral means emergency.** Those meanings are load-bearing
   and must not be diluted by decorative use.

---

## Definition of done, per phase

- Zero console errors across all routes
- Zero touch targets under 44px
- Zero contrast failures
- No horizontal body overflow at any breakpoint
- Both themes render correctly
- Committed with a message explaining *why*, not just *what*
- Deployed and `currentDeploy` verified against the pushed commit
