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
| 4 | ~~Search has no intelligence~~ | now parses specialty + district + gender + time from one sentence, with edit-distance tolerance | ✅ P2 |
| 5 | ~~Pharmacy profile does not sell~~ | now leads with confirmed-stock, freshest first | ✅ P3 |
| 6 | Care is orphaned — no relationship to medicine availability | two product concepts (PRODUCTS, MEDICINES) that never meet | P3 |
| 7 | ~~No offline behaviour~~ | offline banner + discovery from memory; verified with the network cut | ✅ P4 |
| 8 | Admin is a demo, not an operator tool | no verification actions, no data-quality scoring, no stale detection | P5 |
| 9 | ~~No doctor-side surface~~ | `/partner/doctor/:id` ships; hero is the doctor's own missed demand | ✅ P5 |
| 10 | ~~No integrity guarantees~~ | validator proven against 7 injected faults; admin panel | ✅ P6 |
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
| **P2** | **Discovery intelligence** — compound query parsing, fuzzy Arabic matching, guided zero-result recovery | ✅ `PHASE2` |
| **P3** | **Convergence** — pharmacy profile leads with its confirmed-stock signal | ✅ `PHASE3-6` |
| **P4** | **Resilience** — offline banner, discovery keeps working from memory | ✅ `PHASE3-6` |
| **P5** | **Doctor-side dashboard** — `/partner/doctor/:id` built on the doctor's own missed demand; lead attribution still open | 🟡 `542a49c` |
| **P9** | **v2 board landing** — component layer at `src/styles/qareeb.css`; `/med/:id` rebuilt on freshness bands; QR entry `/start`; error + offline-age + route-matched skeletons | ✅ `962a67e` |
| **P6** | **Data integrity** — validator catching duplicates, orphan refs, invalid ranges; surfaced in admin | ✅ `PHASE3-6` |
| **P7** | **Motion** — single 170ms ease-out language, landed in §36 | ✅ |
| **P10** | **Open questions closed** — emergency number verified against source (unified 911 + MoH 122), partner price anchored to consultation-fee payback, freshness pulse kept and gating proven | ✅ |
| **P11** | **Identity v3 — «المِسطرة»** — look layer replaced whole: `src/styles/identity.css` verbatim from the board, `css/qareeb.css` rewritten on it, v2 layer retired. Rows not cards, one shadow, radius 10/999 only, Readex Pro + tabular numerals, the tick rule, the case/dial surfaces | ✅ |
| **P8** | ⬅ **NEXT** — **Final QA** — full journey timing, a11y, both themes, all breakpoints; `perf.mjs` still clicks a hero CTA removed in P0 | TODO |

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
8. **Freshness is a claim about a moment, not about a shelf.** We never say a
   pharmacy *has* a medicine — we say someone confirmed it, and how long ago.
   A confirmation older than three days is not information, so it can never be
   the hero of `/med/:id` and is never promoted by being nearer. Established
   in P9 after `/med/m9` opened on an eight-day-old record styled as live.
9. **Arabic counts in four buckets, not two.** Singular, dual (مريضان — its own
   form, not "2 patients"), plural for 3–10, accusative singular from 11 up.
   Where a verb would have to agree with a count, restructure the sentence so
   it does not. Writing "2 مرضى" is English grammar wearing Arabic words.
10. **Hit size is not visual size.** The design decides how big a control
    looks; 44px decides how big it is to a finger. They are separated by an
    inert `::after`, never by inflating the visual box — spraying
    `min-height: 44px` across anchors fights the layout and loses silently
    wherever a more specific rule resets it.
11. **The theme is a token flip, never a component override.** `.dark`
    redefines `--ink-*` / `--dial-*` and nothing else. A single
    `.dark .x { color: … }` anywhere reintroduces the class of contrast bug
    that took two passes to clear in v2.
12. **Arabic marks the feminine, never the masculine.** "دكتور" is the neutral
   citation form, not a male filter. Established in P2 after the first
   implementation wrongly returned zero results for "دكتور اطفال اليوم".

---

## Definition of done, per phase

- Zero console errors across all routes
- Zero touch targets under 44px
- Zero contrast failures
- No horizontal body overflow at any breakpoint
- Both themes render correctly
- Committed with a message explaining *why*, not just *what*
- Deployed and `currentDeploy` verified against the pushed commit
