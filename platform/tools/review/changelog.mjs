/**
 * The change log for the current slice.
 *
 * Authored rather than derived. A changelog generated from commit subjects
 * describes what was typed; this describes what changed for the user and why,
 * which is the only version worth reading. Every entry here is checkable
 * against the code in the same push.
 */
export const SLICE = {
  name: "Patient · Vertical slice 2",
  workflow: "Receive Offers → Compare Offers → Reserve → Pickup Confirmation",
  milestone: "The patient core loop, end to end",
  status: "complete",
  next: "Prescription capture (R2, R3) and offer details with substitution consent (R9, R10) — TD-5 makes the latter a blocker before any real patient uses this",
};

export const CHANGELOG = {
  Added: [
    "R8 — comparing offers. Coverage before price, because an offer that cannot supply the medicine is not cheaper. The missing medicine is named rather than counted, so the patient's next question is answered without a tap.",
    "The reading order is stated on the screen as not-a-ranking (D12) and is derived only from two facts printed on every row, so a patient can check it themselves.",
    "V1 — the moment between choosing and confirmation, deliberately without a countdown: the clock starts when stock is actually set aside.",
    "V2 — the code, the clock, the address. The code is the largest thing on the screen and grouped so it can be read aloud at a counter.",
    "V4 — D39. They confirmed and then could not; the request has already re-opened and the action moves the patient forward.",
    "Visual regression against git HEAD, so no screenshot can change without being listed before a push.",
    "A technical debt register with impact, priority, owner and planned slice for every item — and the resolved items kept with how they were paid.",
    "Performance measurement: source size, test ratio, suite wall-clock and rendered view-node weight per screen. Everything needing a device build is reported NOT VERIFIED.",
    "Blueprint workflow progress computed from the contracts and the gallery — Not Started / In Progress / Review / Complete, never maintained by hand.",
    "Search with Arabic input folding — tatweel, أ/إ/آ, ى, ة and both numeral systems collapse onto one query, so a present medicine stops reading as 'not in our list'.",
    "A draft request with a pack stepper, a visible remaining-line count, and both clinical gates asked of the domain at the moment of the tap.",
    "Confirmation stating what each urgency window actually means as a duration, rather than three words the patient has to guess between.",
    "A waiting screen with two honest forms: a countdown when pharmacies have been asked, and no countdown at all when the request is still queued.",
    "A visual review harness: the real component tree rendered to DOM, photographed at 390×844, with a layout check that fails on any horizontal overflow.",
  ],
  Improved: [
    "R1 offered «صوّر الوصفة» twice — once as a filled prompt and again as a link directly beneath it. The duplicate is gone, and 'no action twice' is now a rule checked on the rendered tree.",
    "R1's disabled primary said nothing about why it was dead; the reason now sits beside the control it disables rather than scrolled off above it.",
    "The pack stepper read as two grey blocks; it now has a border that gives it definition without adding another filled control.",
    "The remove control keeps a short visible label but speaks the medicine name, so a screen reader can tell the rows apart without the text wrapping onto two lines.",
    "Results rows became the action themselves. The first render put a filled primary button on every row — three dominant controls competing on one screen — and the card-as-target also gives a tap area the size of the row rather than the size of a button.",
    "A refused item is now information rather than a disabled control. Offering a tap that will be rejected teaches a patient that the app's buttons cannot be trusted.",
    "Row labels name the medicine, so a screen reader moving down a list no longer says 'add to request' five times.",
    "The search field gained a visible affordance and a proper label instead of a bare bordered box.",
    "The back affordance became a platform chevron instead of a text arrow.",
    "Empty, loading and permission-refused states now fill the screen and centre. They previously sat at the top of a tall blank page, which reads as broken rather than as considered — the second thing the screenshots caught.",
    "A state's one recovery action moved to the footer, where a thumb rests on a phone held one-handed. A screen's own footer still wins, so two primaries can never stack.",
    "The search field is pinned beneath the header instead of scrolling with the body, so a state that fills the screen cannot push the input the screen is ABOUT out of sight.",
  ],
  Fixed: [
    "Prices were rounded to the nearest thousand, so 8,500 displayed as «9 ألف» — a price the patient would not be charged, on the one screen whose purpose is comparing prices. It also made the stated ordering unverifiable, because two different totals printed identically.",
    "R8 declared a screen-level 'see offer details' secondary that had no subject — it would have picked an offer for the patient. It is not rendered; it belongs on the row and arrives with R9.",
    "The header laid out right-to-left twice. `row-reverse` inside an RTL container double-reverses, so the back control rendered on the wrong edge — §25 names this hazard by name and the first screenshot caught it.",
    "layer-check scanned only .ts, so the moment the app became .tsx most of it silently stopped being checked.",
    "apps/patient had no TypeScript project references for domain, session, offline, net or observability, so a full build emitted .d.ts files beside the sources — the stale-build failure mode again.",
  ],
  Refactored: [
    "Guard destinations now seed graph reachability, derived by asking each guard rather than by a hand-written list that would go stale.",
    "ScrollView content padding is modelled as two boxes in the review adapter, matching React Native, so the review cannot show breathing room the app does not have.",
  ],
  "Technical debt removed": [
    "'No action offered twice' as a render-tree assertion — and the fixture that could never have shown the bug was replaced with the state that actually had it.",
    "Two machine-enforced rules added rather than two review conventions: no physical row direction and no physical edge offsets in the app layer, each proven by a rejecting case.",
    "A render-tree assertion that no screen may show more than one filled accent control — the hierarchy rule as a count instead of an opinion.",
  ],
};

/** Honest limits of this slice. Never omitted, never softened. */
export const LIMITATIONS = [
  "A substitution can be chosen on R8 but not explicitly consented to: R9 and R10 are not built. §4 R10 requires explicit acknowledgement, so this is registered as TD-5 at critical and must land before any real patient uses the app.",
  "Acceptance is computed against the offer's own line ids because the client has no server-assigned request line ids yet (TD-8). Correct against fixtures, wrong the moment a real server assigns ids.",
  "The screenshots are the real component tree rendered through a DOM adapter, not device captures. They prove layout, hierarchy, typography, colour, spacing and tap-target size. They do not prove native gestures, platform chrome or animation.",
  "No infrastructure exists yet (Stage 5). The catalogue and request ports are types with test fakes behind them; nothing talks to a server.",
  "115 of the 133 Blueprint screens are not built. Nine are referenced by an exit in this slice and are listed as known gaps; no control navigates to any of them.",
  "The sign-in chain (E5 → E8) is not built, so a guest who touches an action needing an account reaches E4 and stops there.",
  "Animation timing tokens exist but no transition is implemented yet — state changes are instant.",
];
