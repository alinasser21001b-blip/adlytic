# Adlytic — Design Requirements Package

**Audience:** UI/UX Designer producing Figma files for the Adlytic web application.
**Not the audience:** Engineers. This is not code documentation.

**Purpose:** This document tells the designer exactly what must exist inside the Figma
files before engineering can build from them. It intentionally contains **no colors,
no typography choices, no layout decisions**. Every item below is something the
engineering team needs from Design and currently has to guess if Design doesn't supply it.

**How this document was produced:** Derived from the actual shipped application
(`src/web/layout.ts`, `src/web/pages/*.ts`, `src/web/pages/dashboard/*`) — the real
screens, states, and flows in production today. Nothing here is aspirational. Anywhere the
current app hardcodes a visual value (colors, spacing, fonts), it is called out explicitly
as **"current implementation — not a design decision, must be replaced by the design
system"** so the designer knows it's a placeholder, not a constraint.

---

## 0. Context the designer needs

Adlytic is an **Arabic-first, RTL-first** performance-marketing dashboard for Meta Ads,
built for merchants in Iraq/MENA (primary currency in the codebase is IQD; UI copy today
is close to 100% Arabic). It has:

- A **sidebar + topbar** authenticated app shell (desktop) that collapses to a **bottom
  tab bar** (mobile).
- Two dashboard density modes: **Pro** (dense, data-heavy) and **Beginner** (simplified,
  fewer cards, larger touch targets) — same route, different rendering.
- A **recommendation/review workflow** (approve/execute or dismiss AI-generated action
  items) — this is the single most important interaction pattern in the product and needs
  the most design rigor.
- A **support ticket inbox** (three-pane admin tool) as a second review-style workflow.
- An **AI chat assistant** screen.
- A **separate, less-polished admin surface** (3 admin pages that currently do not share
  the main design system at all — flagged below as a required unification).
- Meta OAuth connect flow, manual token entry fallback, WhatsApp-based manual account
  activation (not self-service signup).

The designer is being asked to design **the actual token/component system this app will
run on**, replacing everything currently hardcoded in code.

---

## 1. Design System & Tokens

Deliver a documented token set in Figma (Variables/Styles), not just applied colors on
screens. Required token categories:

### 1.1 Color tokens
- Background layers: base background, surface, surface-elevated/hover, at minimum 3
  elevation levels (the app currently uses a base + 2 surface layers + hover state —
  confirm whether 3 or 4 levels are needed for the busiest screen, the Pro dashboard).
- Border tokens: default border, emphasized/hover border (currently 2 levels).
- Text tokens: primary, secondary, tertiary/muted (currently 3 levels) — each must have a
  documented minimum contrast ratio against every surface token it's used on (WCAG AA at
  minimum; state which ratio you're targeting).
- Primary/brand accent color, with at least 2 supporting tints/shades for hover/active
  states and glow/emphasis effects (used today for primary CTAs, active nav state, the
  logo, and a "focus card" border-beam effect — see §5).
- Semantic/status colors: success, warning, error, and a **distinct "critical" tier above
  error** (the app has 4 severity tiers: info/low, warning/medium, error/high,
  critical — confirm this 4-tier system or collapse it, but pick one explicitly).
- Each semantic color needs a paired "dim"/background variant for badges and banners
  (e.g. a low-opacity fill to sit behind full-opacity text/icon of the same hue).
- Chart/dataviz palette: a categorical palette (for multi-series charts) and confirmation
  of colorblind-safe separation. Specify which brand/status colors chart lines/bars may
  reuse vs. which are chart-only.
- **All colors must be specified for RTL Arabic long-form text on dark or light
  surfaces (declare which)** — current implementation is a dark theme only; confirm
  whether light mode is in scope for v1 or explicitly out of scope (do not leave this
  ambiguous — engineering will otherwise assume dark-only).

### 1.2 Typography tokens
- Confirm the two typefaces in scope: one for Arabic body/UI text, one for Arabic
  display/headings (current implementation uses two different Arabic-supporting
  webfonts — designer must confirm whether to keep two families or standardize on one,
  and must supply the actual font files/licenses for self-hosting — no Google Fonts CDN
  calls are allowed, see §14 CSP constraint).
- Full type scale: display, H1–H4, body-large, body, body-small, caption, label/overline,
  numeric/tabular figures (KPI numbers need a distinct numeric style — tabular lining
  figures, since large stat numbers appear throughout).
- Each scale step needs: font-family, weight, size, line-height, letter-spacing —
  specified for **both Arabic and Latin/numeral rendering** (numerals in this product
  render LTR even inside RTL Arabic text — confirm this rule holds site-wide and specify
  any exceptions).
- Font weights available per family (current implementation loads 5 weights of one
  family and 3 of another — confirm actual weights needed).

### 1.3 Spacing, sizing, radius tokens
- A spacing scale (e.g. 4/8-based) — must be a finite, documented set, not ad hoc values.
- Border-radius scale: minimum small/default/large (current implementation uses 3 radius
  steps).
- Icon size scale (current implementation is single-size 24px outline icons everywhere —
  confirm whether additional sizes are needed, e.g. 16px for inline/dense contexts, 32–40px
  for empty-state/feature icons).
- Fixed layout dimensions that must be specified exactly, since engineering hardcodes
  them: sidebar width, topbar height, bottom-nav height, max content width for the main
  content column, chat sidebar width, admin context-panel width.

### 1.4 Elevation & shadow tokens
- A documented shadow scale (current implementation has 5 undocumented ad hoc shadow
  values including glow/accent-glow effects) — reduce to a deliberate, named scale:
  resting, raised, overlay/modal, focus-glow.

### 1.5 Motion tokens
- Standard transition duration + easing curve for hover/click micro-interactions.
- A second, slower/springier duration+easing for entrance animations (both exist in
  current implementation — confirm both are wanted, and where each applies).
- Explicit rule for `prefers-reduced-motion`: which animations must be disabled entirely
  vs. shortened (current implementation disables a decorative animated border effect —
  confirm the full list of motion that must respect this).

---

## 2. Component Library (with every variant and state)

For **every** component below, Figma must include all listed variants/states as actual
component variants — not just one happy-path frame. "State" always includes at minimum:
default, hover, focus (keyboard), active/pressed, disabled, loading (where applicable).

### 2.1 Buttons
Variants required: primary, secondary, danger/destructive, ghost/tertiary, success.
Sizes: default and small (large exists in current code — confirm if still needed).
States: default, hover, active, disabled, **loading (with inline spinner replacing
label)**. Icon-only button variant. Icon+label button variant (icon before/after label,
mirrored per RTL/LTR).

### 2.2 Form inputs
Text input, password input (with show/hide toggle), select/dropdown, checkbox, radio,
textarea, search input (with icon + clear button). States: default, focus, filled,
error (with inline error message placement specified), disabled, with-icon-prefix
variant (used on every auth field today).

### 2.3 Badges / status pills
Severity badges: info, success, warning, error, critical, neutral/gray — as used for
issue severity, ticket status, activation status ("Active"/"Pending"), campaign
effective-status, freshness ("FRESH"/cached data) indicators. Specify shape (pill vs.
rounded-rect), whether they carry an icon, and text-only vs. icon-only variants.

### 2.4 Cards
- **Stat/KPI card**: label, value (large numeric), trend indicator (up/down/flat with
  color), optional sparkline, optional info-tooltip trigger, optional colored
  accent/icon per metric type. Needs a loading-skeleton variant (see §8) and a
  no-data variant.
- **Content card** (generic container used for sections across every page): header
  (title + optional action), body, optional footer.
- **Recommendation/action card**: this is the single most important card in the
  product — see §5 for full spec.
- **Chat message bubble**: user vs. assistant vs. system, with timestamp.

### 2.5 Navigation
- Sidebar (desktop): logo/brand, nav item list (icon + label), active-item indicator,
  hover state, section grouping, user account footer (avatar, name, email, logout
  affordance), collapse/expand behavior if any.
- Topbar: page title, mode toggle (Pro/Beginner — needs on/off visual states),
  workspace switcher control, settings entry point, notification/bell entry point,
  logout/account entry point.
- Bottom tab bar (mobile): exactly which items appear (current implementation
  deliberately shows a subset of the sidebar items on mobile — designer must confirm the
  final subset, don't assume it's "all items shrunk down"), active-tab indicator.
- Breadcrumbs, if any are wanted anywhere (none currently exist — confirm in/out of
  scope).

### 2.6 Data display
- **Table**: header row, sortable-column indicator, row hover state, row with
  expand/detail affordance, empty table state, loading table state (skeleton rows,
  not a spinner over blank space), pagination or infinite-scroll pattern (specify
  which), zebra striping or not.
- **Chart components**: line/trend chart, bar chart, at minimum. For each: axis label
  style, gridlines, tooltip-on-hover design, legend placement, empty-state-inside-chart
  design (a "no data" message rendered inside the chart canvas area — this exists
  today and must be specified, not improvised), and the **RTL exception**: numeric
  trend charts must be confirmed to render left-to-right even on an RTL page — the
  designer must state this explicitly as a rule, since it contradicts the page's overall
  mirroring.
- **Timeline/activity feed**: event dot + connecting line, event type indicators
  (sync/alert/critical/generic — current implementation has 4 event-dot colors),
  timestamp placement, empty state.

### 2.7 Feedback & overlays
- **Modal/dialog**: header with close affordance, body, footer action row, backdrop
  treatment, max-width/responsive behavior, and a confirm-action variant (used for
  "mark recommendation as executed" with a checklist inside — see §5).
- **Toast notification**: success/error/info/warning variants, position on screen,
  auto-dismiss timing (specify duration), stacking behavior for multiple toasts.
- **Inline alert/banner**: same 4 semantic variants, used for form errors and
  page-level warnings (e.g. "Meta connection needs to be re-authorized" — a persistent,
  dismissible-or-not sticky banner that can appear above the topbar on any authenticated
  page; specify its exact placement and whether it pushes content down or overlays).
- **Empty state**: icon/illustration + title + description + optional CTA — used
  across at least 6 different screens today (no ad accounts found, no recommendations,
  no team members, no accounts loaded, empty chart, empty support inbox filter).
  Designer must produce **one flexible empty-state component**, not 6 bespoke ones, and
  specify how the icon/illustration slot works (single icon style, or per-context
  illustration — pick one).
- **Loading states**: full-page spinner+text (used during auth/permission checks before
  content is safe to reveal — see §9 "access gate" requirement), inline button spinner,
  and full skeleton-screen loading for the dashboard (skeleton cards, skeleton hero,
  skeleton chart, skeleton gauge — all currently exist as distinct skeleton shapes;
  designer must supply skeleton versions of every card/chart type that can load
  asynchronously).

### 2.8 Miscellaneous
- Avatar (initials-based fallback + image variant, used for user accounts).
- Tooltip / info-popover (used to explain KPI metric definitions on click/hover — specify
  trigger and placement rules).
- Tabs (used for date-range switching, filter categories, and the admin console's
  section tabs).
- Chip/pill for quick-action shortcuts (a horizontally scrollable row of action chips on
  the dashboard).
- Progress bar (used for a gauge showing "% of API call volume used" on the internal
  Meta-readiness screen).
- Health/status ring or gauge (a circular health-score indicator referenced in code as
  `.health-ring` — needs a real design, not an ad hoc CSS ring).

---

## 3. Screen Specifications

Every screen below needs a full Figma frame set: **desktop, tablet, and mobile**, for
**every state that screen can be in** (not just the happy path). List of screens and the
states each one must cover, derived from what's actually implemented:

| Screen | Route | Required states to design |
|---|---|---|
| Login | `/login` | default, validation error, submitting/loading |
| Register | `/register` | default, validation error (password length etc.), submitting |
| Pending Activation | `/pending-activation` | waiting-for-activation (with WhatsApp CTA), just-activated transition |
| Welcome / Onboarding | `/welcome` | guest (logged out), authenticated-no-account, OAuth-error variants (must design one generic "connection failed" state that covers all error codes, not one frame per error code) |
| Meta Account Picker | `/meta-connect` | loading, account list (1 vs many accounts — confirm if single-account should skip this screen visually or just logically), empty ("no ad accounts found") |
| Dashboard — Pro mode | `/dashboard` | loading/skeleton, populated, stale-data warning, zero-data/new-account, error |
| Dashboard — Beginner mode | `/dashboard` (mode) | same states, simplified layout |
| Campaigns | `/campaigns` | loading, populated table, empty (no campaigns), campaign detail/inspector modal open |
| Ad Analysis | `/ad-analysis` | loading, populated, empty |
| Recommendations | `/recommendations` | loading, populated (grouped urgent/later), all-filters, empty ("account is healthy"), empty-for-filter, item in "done/dismissed" visual state, confirm-execution modal open |
| Workspace | `/workspace` | populated, empty accounts, empty members, manual-connect modal open, invite-member modal open |
| Settings | `/settings` | populated, empty |
| Support (customer) | `/support` | ticket list, ticket thread, new ticket form, empty |
| AI Chat | `/ai` | empty/first-message, active conversation, assistant-typing/loading, input-disabled-while-sending |
| Admin Overview | `/admin` | populated (needs full redesign — see §11 unification requirement) |
| Admin Inbox | `/admin/inbox` | ticket list w/ filters, thread view, internal-note compose mode, context panel open/closed, empty filter result |
| Privacy / Data Deletion | static | single state each |

For each screen, the designer must annotate (via Figma dev-mode notes or a spec sheet,
not left implicit): which elements are sticky/fixed on scroll, which are
collapsible/expandable, and exact breakpoint behavior (see §6).

---

## 4. Component Variants Requiring Explicit Design Decisions

These are places the current code makes an implicit choice that a designer must now own
explicitly, because engineering cannot infer them from a single static screen:

1. **Severity system**: is it 3-tier (low/medium/high) or 4-tier (+critical)? Must be
   named and colored consistently everywhere it appears (recommendations, tickets,
   campaign issues).
2. **Mode toggle (Pro/Beginner)**: exact visual treatment of the on/off states, and
   whether switching is instant or has a transition.
3. **"Done/dismissed" state for a recommendation card**: currently just dimmed to ~45%
   opacity — designer must decide the actual intended treatment (strike-through, moved to
   a separate "completed" section, collapsed, etc.).
4. **Freshness/cache indicators**: a small badge shown next to numbers that may be
   "live" vs. "cached" data — needs a real design, not a text label.
5. **RTL numeral exception**: confirm and document every place numerals/charts break the
   RTL mirroring rule (see §7).

---

## 5. Interaction Specification — Recommendation / Review Workflow

This is the core value-delivery loop of the product and needs the deepest interaction
spec, screen by screen, click by click:

1. Recommendation card entry state (severity badge, title, "why this matters," "required
   action," optional benchmark evidence block citing an external standard/source,
   numbered action steps, "when to check back" expectation text).
2. Primary action: mark as executed. Must specify: does clicking open a confirmation
   modal with a checklist (current implementation does this), or act immediately?
   Designer must decide and document the modal's exact content requirements (title, step
   checklist, confirm/cancel buttons).
3. Secondary action: dismiss/ignore. Specify whether this needs its own confirmation or
   is a single click with an undo toast.
4. Tertiary action: escalate to AI assistant with the recommendation's context prefilled
   — specify the visual affordance (link vs. button) and any transition/animation between
   screens.
5. Filtering/sorting: tabs for severity + free-text search — specify combined-filter
   empty state design (distinct copy from the "no recommendations at all" empty state).
6. **A single most-important-action "hero" card** exists above the general list on the
   Pro dashboard (a spotlighted single recommendation) — this needs its own distinct,
   higher-emphasis design treatment separate from the list-item card design, including
   any decorative motion/emphasis effect and its `prefers-reduced-motion` fallback.

---

## 6. Responsive Rules

- Declare the exact breakpoint set (current implementation uses 12+ ad hoc breakpoint
  values — this must be consolidated to a small, documented set, e.g. mobile/tablet/
  desktop/wide, with exact pixel values).
- For the sidebar+topbar shell: exact behavior transition point where sidebar becomes
  hidden/replaced by bottom nav.
- For every multi-column layout (KPI grids, chart grids, ticket 3-pane view): exact
  column-count-per-breakpoint, not just "it wraps."
- Chat screen: sidebar-collapses-to-full-width-with-back-navigation, or a different
  pattern — must be explicit.
- Admin inbox 3-pane layout on tablet/mobile: which pane shows by default, how do you
  navigate to the others (this is currently desktop-only in practice — designer must
  decide if mobile admin support is in scope).
- Touch target minimum size on mobile for all interactive elements (buttons, nav items,
  table row actions) — state the number (44×44px is the common baseline; confirm or
  override).

---

## 7. RTL Rules

The application is Arabic-first and RTL by default. This needs an explicit, written RTL
rulebook, not "just mirror everything":

1. Confirm: is the entire product RTL-only for v1, or does it need a working LTR/English
   mode? (Two screens today do live language switching; the rest are RTL-only.) State
   this clearly — it changes how many frames need duplicating.
2. **Explicit mirroring exceptions** that must be documented per-component: numeric
   trend charts and sparklines render LTR even on an RTL page. Any icon that implies
   directionality (chevrons, arrows, back/forward) must mirror; icons that don't imply
   direction (checkmarks, bells, gears) must not.
3. Numerals: do numbers within Arabic text stay in Western Arabic numeral form and
   left-to-right internally (this is the current behavior) — confirm as a rule.
4. Text alignment, padding/margin direction (start/end, not left/right), and
   icon-before/after-label ordering must be specified using logical
   (start/end) terms in the spec, not left/right, since engineering will implement with
   logical CSS properties.
5. Any bilingual screen (Welcome, Meta-readiness admin page) needs a specified language
   toggle control design and a rule for what persists the choice.

---

## 8. Loading, Empty, and Error States (consolidated requirement)

Do not treat these as edge cases — they are core deliverables. For **every screen in
§3's table**, the design file must include:
- A loading state (skeleton preferred over spinner-on-blank for content-heavy screens;
  spinner acceptable for short/gate checks).
- A true-empty state (zero data, not an error) with icon, message, and CTA where
  applicable.
- A filtered-empty state where distinct from true-empty (e.g. "no results for this
  filter" vs. "no recommendations at all").
- An error state (request failed, distinct from empty) — this does not exist consistently
  in the current implementation and is a gap the designer must close: define one reusable
  error-state pattern (icon/message/retry action) usable inside any card, table, or
  chart slot.
- A stale-data indicator pattern for the dashboard specifically (data that loaded but may
  be outdated — currently a banner; confirm placement and dismissibility).

---

## 9. Access-Gated / Permission-Gated Screens

Three admin-only screens currently show a full-screen spinner and hide all content until
a client-side permission check resolves, to avoid flashing restricted UI to unauthorized
users. The designer must supply:
- The exact design of this gate/loading screen (must be identical across all
  admin-only surfaces — currently it's copy-pasted per page with no shared design).
- What renders if the permission check fails (currently unspecified/unbuilt) — an
  "access denied" screen is required.

---

## 10. Navigation Behavior

Document precisely (a navigation graph/flow diagram is expected, not just a components
list):
- Full sitemap: every route, whether it's public, authenticated, or admin-only.
- The auth/onboarding funnel order: Register → Pending Activation → Welcome →
  Meta Connect (OAuth) or Workspace (manual) → Dashboard. Specify what happens on
  refresh/direct-URL-visit at each intermediate step (e.g. a fully activated user who
  navigates to `/pending-activation` directly — what do they see?).
- Which nav items appear/disappear based on role (admin item) and mode (Beginner mode
  hides sidebar/bottom-nav per current implementation — confirm this is the intended
  final behavior, it's a significant UX decision to hand-wave).
- Deep-link behavior: e.g. a recommendation card links into the AI chat screen with a
  prefilled question — specify the transition (new screen vs. slide-over) and how "back"
  behaves.
- Logout: confirm whether this needs a confirmation step or is a single click.

---

## 11. Design System Unification Requirement

**This is a required deliverable, not optional cleanup.** Today, 4 of the ~20 screens
(the three admin surfaces plus the support inbox) do not use the shared design system —
they redefine their own copy of the color tokens inline and, in one case, load a
different font delivery method than the rest of the app. The designer must produce these
screens **using the exact same token set and component library as the rest of the
product**. Do not treat "admin" as a visually separate sub-brand unless explicitly told
to by the product owner — flag this decision back if there's ambiguity rather than
silently keeping two systems.

Additionally: two admin overview screens currently both target the same route
(`/admin`) with overlapping content (a metrics overview, and a tabbed console with an
overview tab). The designer should design **one** unified admin overview, not two
competing versions — flag this to the product owner if scope is unclear rather than
designing both.

---

## 12. Iconography

- All icons in the current implementation are a single-style outline icon set (24×24,
  2px stroke, no fill). Designer must either continue this system or replace it
  wholesale — **partial replacement (some hand-drawn, some from a library) is not
  acceptable**, it produces visual inconsistency.
- Deliver the full icon set required by the nav + component inventory above as one
  Figma icon component set (sidebar nav icons ×9, topbar icons, action icons for
  card actions, status/severity icons, empty-state icons, chevrons/arrows with
  RTL-mirroring behavior specified).
- Specify export format for engineering: SVG, optimized, with `currentColor` stroke so
  icons inherit text color via CSS (this is how the current icon system works and should
  be preserved unless there's a reason to change it).

---

## 13. Images & Illustration

- Logo: current implementation is a single custom mark (gradient ring). Designer must
  deliver a finalized logo lockup: full lockup (mark + wordmark), mark-only (for
  favicon/small contexts), and both light/dark-surface variants if a light mode is in
  scope.
- Empty-state / illustration style: decide once whether empty states use icons only, or
  custom illustrations — and if illustrations, deliver a consistent illustration style
  guide (line weight, color usage, subject matter per context) rather than one-off pieces.
- Ad-creative thumbnail fallback: campaigns/ads sourced from Meta's CDN can fail to load.
  Designer must specify the exact fallback visual (current implementation uses an
  emoji-in-a-box placeholder plus a loading shimmer — decide the final version) and the
  shimmer/skeleton loading treatment for images specifically.
- PWA icons: app icon at required sizes (192px minimum currently referenced) plus a
  maskable-safe-zone version.

---

## 14. Fonts & Export Constraints (hard technical requirement)

- **No CDN font loading is allowed anywhere in the product** (Content-Security-Policy
  requires self-hosted fonts). The designer must provide actual font files (WOFF2) with
  proper licensing for self-hosting, for every weight used — not just reference a Google
  Fonts name. One current screen violates this rule (loads via Google Fonts `<link>`) and
  must be corrected as part of this design pass.
- Confirm exact weights needed per family per the type scale in §1.2 — do not leave
  "regular/bold" vague; specify numeric weights (400/500/700/etc.).

---

## 15. Accessibility Requirements

- Minimum contrast ratio target stated explicitly (WCAG AA 4.5:1 for body text, 3:1 for
  large text/UI components) — verify every token-on-surface combination in §1.1 against
  this, not just visually eyeball it.
- Focus states: every interactive component needs a visible keyboard-focus style,
  distinct from hover (current implementation is inconsistent about this — treat as a
  required deliverable, not a nice-to-have).
- Color must never be the only signal for status/severity — every badge/status
  indicator needs an accompanying icon or text label, not color alone (verify this holds
  for the 4-tier severity system and freshness indicators).
- Touch target minimums per §6.
- Motion: full list of what must respect `prefers-reduced-motion` per §1.5.
- Form errors: must be associated with their field both visually and for screen readers
  (specify inline error placement so engineering can wire `aria-describedby` correctly).

---

## 16. Grids & Layout Measurements

- Base spacing unit and the full spacing scale (§1.3) applied consistently — designer
  must show, for at least the Pro dashboard (the densest screen) and one table-heavy
  screen (Campaigns), an annotated spacing/grid overlay so engineering can verify
  implementation pixel-for-pixel.
- Content column max-width for the main authenticated app area (currently ~1400px —
  confirm final value).
- Card internal padding, card-to-card gutter, section-to-section vertical rhythm — as
  explicit token values, not implied by eyeballing a screenshot.

---

## 17. Figma Organization Requirements

- One **Foundations** page: all color, type, spacing, radius, shadow, motion tokens as
  Figma Variables (not just styles), with light/dark mode variable collections if both
  modes are in scope.
- One **Components** page: every component in §2, structured as proper Figma components
  with variant properties for size/state/type — not duplicated static frames per state.
- One **Screens** page per major flow (Auth, Onboarding, Dashboard, Campaigns,
  Recommendations, Workspace/Settings, Support, Admin) containing every state from §3 as
  named frames in a consistent naming convention (see §18).
- A **Flows** page: the navigation graph from §10 as an actual connected flow diagram
  (Figma flow starting points + arrows), not prose.
- Components must use auto-layout throughout so real content lengths (Arabic text runs
  longer/shorter than English placeholder text) don't break the design when engineering
  swaps in real copy.

---

## 18. Asset & Layer Naming Convention

- Frames: `[Flow]/[Screen]/[State]` e.g. `Recommendations/List/Empty`,
  `Auth/Login/ValidationError`.
- Components: `Component/[Name]/[Variant=..., State=...]` following Figma's component
  property naming so variant switching in dev mode is unambiguous.
- Exported icon assets: `icon-[name]-24.svg`, using the same `[name]` used as the nav/
  route id in code where applicable (e.g. `icon-dashboard-24.svg`,
  `icon-campaigns-24.svg`) so engineering can map 1:1 without a translation table.
- No unnamed/"Frame 47"-style layers in delivered files — this is a hard QA gate before
  handoff is accepted (see §20).

---

## 19. Versioning

- Every handoff must be a tagged Figma version (Figma's version history "Save to
  version" with a descriptive name), not "the current state of the file."
- Breaking changes to existing components (renamed variant, removed state, changed
  token value) must be called out explicitly in the version name/description —
  engineering will otherwise not know a component contract changed.
- Maintain a changelog section at the top of the Foundations page listing token changes
  by version.

---

## 20. Design QA / Handoff / Acceptance Criteria

A design is not "done" and ready for handoff until all of the following are true:

1. Every screen in §3's table has every listed state as a named, organized frame.
2. Every component in §2 exists as a real Figma component (with variants), and every
   screen frame uses instances of it — no screen contains a one-off, un-componentized
   copy of a button/card/badge.
3. All text uses real or realistic Arabic content at actual expected lengths (not
   Latin lorem ipsum) — RTL layouts break in ways that only show up with real-length
   Arabic strings, so Latin placeholder text is not acceptable for sign-off.
4. Every token in §1 is a Figma Variable, applied (not just referenced in a style guide
   image) — engineering will pull literal values, so "close enough" hand-set colors on
   screens that drift from the token are a QA failure.
5. Contrast has been checked (not eyeballed) for every text/surface combination against
   the ratio in §15.
6. Every interactive component has a documented focus state (§15).
7. RTL exceptions (§7) are called out explicitly per component where they apply — a
   reviewer should not have to infer them from the mockup.
8. Responsive behavior for every breakpoint in §6 is shown, not just described.
9. The file has zero unnamed layers/frames per §18.
10. A design walkthrough session with engineering has happened before final handoff, in
    which the designer confirms answers to every open question flagged in this document
    (§4, §6 admin-mobile scope, §7 LTR-mode scope, §11 unification, and the specific
    "which admin overview screen wins" question).

**Pixel-perfect expectation:** engineering will implement directly from Figma dev-mode
measurements — spacing, sizing, and color values in the shipped UI are expected to match
the Figma file exactly, not "close in spirit." Any value that can't reasonably be pulled
directly from the file (e.g. an animation curve, a hover transition timing) must be
documented as a written spec note attached to that component/frame.

**Sign-off:** engineering will not begin implementing a new screen against this system
until that screen's frames pass the checklist above. If a needed state or component is
missing at implementation time, work stops and returns to Design rather than an engineer
guessing the missing piece — that is the entire purpose of this document.
