/**
 * The technical debt register.
 *
 * Debt is only real if it is visible and owned. Every item carries an impact,
 * a priority, an owner and the slice that will resolve it. An item leaves this
 * register by being FIXED — never by being quietly deleted, which is why each
 * resolved item stays with its resolution recorded.
 */

export const DEBT = [
  {
    id: "TD-1",
    description: "No infrastructure layer. CataloguePort and Environment are types; nothing talks to a server, and the app has never exchanged a byte with a backend.",
    impact: "The whole product is unproven end to end. Every screen is driven by fixtures, so latency, pagination, auth refresh and partial failures are all unexercised.",
    priority: "critical",
    owner: "platform-foundation",
    slice: "Stage 5 — Infrastructure",
    status: "open",
  },
  {
    id: "TD-2",
    description: "Screenshots are DOM renders of the real component tree, not device captures.",
    impact: "Layout, hierarchy, typography, colour, spacing and tap targets are verified. Native gestures, platform chrome, safe-area insets, keyboard avoidance and animation are NOT.",
    priority: "high",
    owner: "patient-app",
    slice: "Whenever a device build first runs",
    status: "open",
  },
  {
    id: "TD-9",
    description: "The camera itself is not implemented. R2 dispatches a capture effect that the app root receives and does nothing with.",
    impact: "The prescription journey is complete in state, navigation, consent and tests, but no photograph can actually be taken. R2 is MOCKED until a device build exists.",
    priority: "high",
    owner: "media-service",
    slice: "Device build",
    status: "open",
  },
  {
    id: "TD-3",
    description: "Motion tokens are declared but no transition is implemented. State changes are instant.",
    impact: "The app reads as a series of jumps rather than a continuous surface — the single largest remaining gap against 'feels native'.",
    priority: "high",
    owner: "patient-app",
    slice: "Next polish pass",
    status: "open",
  },
  {
    id: "TD-4",
    description: "The sign-in chain E5 → E8 is not built, so a guest who touches an action needing an account reaches E4 and stops.",
    impact: "A guest cannot complete any journey. The core loop is only reachable by an already-authenticated account.",
    priority: "high",
    owner: "identity-service",
    slice: "Onboarding slice",
    status: "open",
  },

  {
    id: "TD-10",
    description: "The Night Mint delivery is dark-only. Its daylight sibling palette is not designed, so the patient app forces dark and ignores the device's light preference.",
    impact: "Users who run their phone in light mode get a dark app. `patientLight` is currently an alias of `patientDark` so nothing renders half-designed, which means the contrast gate cannot catch a light-scheme regression either.",
    priority: "high",
    owner: "design",
    slice: "When the daylight palette is delivered",
    status: "open",
  },
  {
    id: "TD-11",
    description: "V2's code-panel caption ships at #63726B, not the delivered #6B7A74, because the designer's value measures 4.10:1 on #F7F4EE — below the 4.5 body floor.",
    impact: "A one-value deviation from the delivery, on the screen Blueprint v3 says must never fail. Reverts the moment Design confirms a replacement.",
    priority: "medium",
    owner: "design",
    slice: "Next design round",
    status: "open",
  },
  {
    id: "TD-6",
    description: "V2's freshness is hard-coded live because nothing is cached yet.",
    impact: "The cached-countdown path is implemented and photographed but never exercised against real cache eviction.",
    priority: "medium",
    owner: "patient-app",
    slice: "Stage 5 — Infrastructure",
    status: "open",
  },
  {
    id: "TD-7",
    description: "Performance is entirely unmeasured — startup, render, navigation latency, memory and bundle size.",
    impact: "No regression can be detected. The dashboard reports these as NOT VERIFIED rather than green.",
    priority: "medium",
    owner: "platform-foundation",
    slice: "Once a device build exists",
    status: "partially addressed",
    note: "Module count and source size are now measured; runtime metrics remain unverifiable without a device build.",
  },
  {
    id: "TD-8",
    description: "The store held a `requested` variable computed from the submission and then discarded it, because request line ids are minted by the server and the client has none yet.",
    impact: "Acceptance is computed against the offer's own line ids rather than the request's. Correct today because they are the same fixture, and wrong the moment a real server assigns ids.",
    priority: "high",
    owner: "marketplace-engine",
    slice: "Stage 5 — Infrastructure",
    status: "open",
  },
];

/** Debt that has been paid. Kept, with how it was resolved, so the register
 *  records a history rather than only a backlog. */
export const RESOLVED = [
  {
    id: "TD-5",
    description: "A substitution could be seen on R8 and accepted with the offer, while §4 R10 requires an explicit acknowledgement of a different brand. A flag on a row is not consent.",
    resolvedBy: "R9/R10 built. Consent is per line, starts undecided with no constructor that produces agreement, treats undecided as NOT agreed when computing what gets reserved, and blocks acceptance until every proposal is answered. Refusing sends the line to the child request (D06) and the screen says so, because a patient who believes refusing loses the order will agree to a brand they did not want.",
  },
  {
    id: "TD-0a",
    description: "layer-check scanned only .ts, so the app layer stopped being checked when it became .tsx.",
    resolvedBy: "Extended to .tsx and proven with a rejecting case.",
  },
  {
    id: "TD-0b",
    description: "Build output emitted beside sources, so tests ran against a stale build.",
    resolvedBy: "Project references corrected, stray output banned by layer-check, and .gitignore updated.",
  },
  {
    id: "TD-0c",
    description: "Prices were rounded to the nearest thousand, displaying 8,500 as '9 ألف'.",
    resolvedBy: "Exact formatting, with a test asserting two different totals never print identically.",
  },
];
