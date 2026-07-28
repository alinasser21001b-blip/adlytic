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
| **P12** | **Honest handoff** — `opened / sent / abandoned` replaces the false "delivered" claim; duplicate guard; `/me` rebuilt on real states; pharmacy profile rebuilt on v3 | ✅ |
| **P13** | **Medicine Explorer** — national availability network: CITIES/BRANCHES/RX_MEDS/SIGNALS/REQUESTS, signal decay + request lifecycle state machines, `/explorer` `/rx` `/rx/:v` `/need/*` `/radar/*`, the availability field, structured contact. Spec at `QAREEB_MEDICINE_EXPLORER_IMPLEMENTATION_SPEC.md` | ✅ |
| **P14** | **Roles + operator separation** — role-aware homes (patient / pharmacist / doctor mutate structurally), operator console rebuilt as its own shell outside the patient column (stale radar, verification queue, supply gaps, integrity — all live-computed), Explorer contacts wired into the opened/sent/abandoned machine, skeletons cover the Explorer family | ✅ |
| **P15** | **3-second response + anti-spam** — pharmacy answer cut from 5 interactions to 1 tap (60px buttons, optimistic exit, answered leaves the queue), rush mode batching, simulated-OTP gate on publishing, 3-active-request cap, hidden trust score, Fast Responder from real behaviour, honest countdown on urgency-scaled TTL | ✅ |
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
12. **Never claim what the architecture cannot observe.** WhatsApp opening is
    not WhatsApp sending, and sending is not delivery or confirmation. A
    request may be `opened`, `sent` (self-reported, labelled as such) or
    `abandoned`. There is no `delivered` state because nothing here can see
    one. Established in P12 after the app was found stamping "SENT" and
    "your message reached the clinic" on the strength of a link click.
13. **A verified pharmacy is not a verified shelf.** Verification is a durable
    fact about an organisation; a stock claim is a perishable fact about a box.
    They are rendered as two separate statements and never merged into one
    badge. Every stock claim expires by itself after three days, so nobody has
    to remember to retract it.
14. **Availability is never a reservation.** A pharmacy confirming stock has
    made a claim about a shelf, not a promise to a person. Every surface where
    a patient acts on a claim says so: الأولوية لمن يصل أولاً أو يتفق مع
    الصيدلية. The word حجز belongs to doctor appointments and nowhere near a
    medicine.
15. **Match the exact variant, never the molecule.** A 50mg vial is not an
    answer to a 2.5mg tablet request. Alternative brand names exist for search
    recall only and are never surfaced as "you could take this instead" —
    substitution is the prescriber's and the pharmacist's call, not ours.
15. **Arabic marks the feminine, never the masculine.** "دكتور" is the neutral
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
