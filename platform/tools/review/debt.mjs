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
    description: "The patient app has no ENTRY POINT: nothing constructs a Runtime and nothing mounts App.tsx, so the assembled application has never run. Separately, the CLIENT half of the infrastructure now exists: one HTTP transport classifying through @dawai/net, IdentityPort and CataloguePort over the declared contracts, the outbox flusher driving retry/backoff/idempotency, and an effect runner closing the store → server → store loop — all proved against a scripted fake server. What does not exist is a server: no backend has ever answered a real request, no session token is stored or refreshed, and deviceId/baseUrl have no production source.",
    impact: "Every screen, the reducer, the ports and the effect loop are proved in isolation and against a scripted server, but the composed app has never started once. Real latency, pagination, token refresh, TLS and server-side authorization remain unexercised until a backend exists, and nothing has been observed on a device.",
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
  {
    id: "TD-12",
    description: "ActionCard sets accessibilityLabel on the Pressable, which makes the card ONE accessibility element on both platforms: the label is announced and the children are not. On R8 an offer card therefore reads as «افتح عرض صيدلية الرشيد» alone — the price, the coverage («يغطي ٢ من ٢»), the substitution flag, the distance and the honoured band are all rendered and none of them is spoken. On F2 a result reads as «أضف بانادول للطلب», dropping the strength, the form, the Latin name and the price.",
    impact: "A patient using TalkBack or VoiceOver makes the most consequential decision in the product — which pharmacy to reserve from — without hearing anything the decision is based on. The visible card and the spoken card are different products. The engineering defect is clear; the fix is not, because what an offer card should announce, in which order, in Iraqi Arabic, is a content decision. §25 and the Blueprint state no spoken-content rule for a composite card, so implementation must not invent one. Blocked on a product/design answer, not on code.",
    priority: "high",
    owner: "patient-app",
    slice: "Blocked — needs a spoken-content decision for composite cards",
    status: "open",
  },
  {
    id: "TD-13",
    description: "Offline.cancel refuses silently while an item is in flight. It returns the outbox object unchanged (identical by reference) when state is \"sending\", so the reducer stores the same value, the screen re-renders identically, and the patient's cancel produces no signal of any kind. With DEFAULT_POLICY the retry loop holds an item in \"sending\" for roughly 30 seconds of backoff across six attempts, and flush only re-reads the live outbox BETWEEN items, never between retries.",
    impact: "For up to half a minute after pressing send, R13's cancel does nothing and says nothing. The comment in flush.ts names this exact failure — 'the user\'s cancel does nothing but move a label' — and guards against it at the item boundary, which is not where the waiting happens. Whether a request already on the wire SHOULD be cancellable is a product decision (§21 · D27 · R13): a POST that may already have been accepted cannot simply be dropped, and the honest options — refuse visibly, or cancel and reconcile against the idempotency key — differ in what the patient is promised. The engineering half is unambiguous and unblocked: a function that can refuse must say so rather than returning its input.",
    priority: "medium",
    owner: "platform-foundation",
    slice: "Blocked — needs a product answer on cancelling in-flight writes",
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
