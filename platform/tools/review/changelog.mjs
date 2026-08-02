/**
 * The change log for the current slice.
 *
 * Authored rather than derived. A changelog generated from commit subjects
 * describes what was typed; this describes what changed for the user and why,
 * which is the only version worth reading. Every entry here is checkable
 * against the code in the same push.
 */
export const SLICE = {
  name: "Patient · Vertical slice 1",
  workflow: "Search Medicine → Request Medicine → Send",
  milestone: "The patient core loop, first half",
  status: "complete",
  next: "Receive Offers → Compare Offers → Reserve → Pickup Confirmation (R7 live, R8, R9, V1, V2)",
};

export const CHANGELOG = {
  Added: [
    "Search with Arabic input folding — tatweel, أ/إ/آ, ى, ة and both numeral systems collapse onto one query, so a present medicine stops reading as 'not in our list'.",
    "A draft request with a pack stepper, a visible remaining-line count, and both clinical gates asked of the domain at the moment of the tap.",
    "Confirmation stating what each urgency window actually means as a duration, rather than three words the patient has to guess between.",
    "A waiting screen with two honest forms: a countdown when pharmacies have been asked, and no countdown at all when the request is still queued.",
    "A visual review harness: the real component tree rendered to DOM, photographed at 390×844, with a layout check that fails on any horizontal overflow.",
  ],
  Improved: [
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
    "The header laid out right-to-left twice. `row-reverse` inside an RTL container double-reverses, so the back control rendered on the wrong edge — §25 names this hazard by name and the first screenshot caught it.",
    "layer-check scanned only .ts, so the moment the app became .tsx most of it silently stopped being checked.",
    "apps/patient had no TypeScript project references for domain, session, offline, net or observability, so a full build emitted .d.ts files beside the sources — the stale-build failure mode again.",
  ],
  Refactored: [
    "Guard destinations now seed graph reachability, derived by asking each guard rather than by a hand-written list that would go stale.",
    "ScrollView content padding is modelled as two boxes in the review adapter, matching React Native, so the review cannot show breathing room the app does not have.",
  ],
  "Technical debt removed": [
    "Two machine-enforced rules added rather than two review conventions: no physical row direction and no physical edge offsets in the app layer, each proven by a rejecting case.",
    "A render-tree assertion that no screen may show more than one filled accent control — the hierarchy rule as a count instead of an opinion.",
  ],
};

/** Honest limits of this slice. Never omitted, never softened. */
export const LIMITATIONS = [
  "The screenshots are the real component tree rendered through a DOM adapter, not device captures. They prove layout, hierarchy, typography, colour, spacing and tap-target size. They do not prove native gestures, platform chrome or animation.",
  "No infrastructure exists yet (Stage 5). The catalogue and request ports are types with test fakes behind them; nothing talks to a server.",
  "115 of the 133 Blueprint screens are not built. Nine are referenced by an exit in this slice and are listed as known gaps; no control navigates to any of them.",
  "The sign-in chain (E5 → E8) is not built, so a guest who touches an action needing an account reaches E4 and stops there.",
  "Animation timing tokens exist but no transition is implemented yet — state changes are instant.",
];
