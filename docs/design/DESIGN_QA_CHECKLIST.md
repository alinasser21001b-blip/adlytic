# Design QA Checklist

> Read [README.md](README.md) first for how acceptance works. Items marked
> **[BUILD]** are enforced by automated checks that run on every commit.

The acceptance test for the handoff. Engineering runs this against the delivered
Figma before implementation starts. **Anything unchecked is a question that will
otherwise be answered by an engineer guessing** — which is the situation this
whole handoff exists to end.

Items marked **[BUILD]** are already enforced by an automated check in
`npm run check`. A design that fails one of those cannot be implemented without
disabling a check that exists to prevent inconsistency across 133 screens.

---

## 1. Tokens

- [ ] All 15 colour roles defined in **both** light and dark
- [ ] **[BUILD]** Every contract pair passes 4.5:1 body / 3.0:1 boundary in both schemes — 14 pairs are measured every build and a failure is a build failure
- [ ] `success` / `onSuccess` / `onWarning` / `onAlert` either given a defined use or explicitly removed (R-5)
- [ ] All 5 type roles specified: size, line-height, weight
- [ ] **[BUILD]** Letter-spacing is 0 on every role — Arabic is connected
- [ ] `display` and `caption` marked as barred from clinical content
- [ ] **[BUILD]** Every spacing value is on the 4pt scale
- [ ] All 5 radius values specified
- [ ] **[BUILD]** Every tap target ≥ 44pt; patient primaries ≥ 48pt
- [ ] All 5 elevation levels specified, in both schemes (R-3)
- [ ] Border-width scale defined with a meaning per width (R-4)

## 2. Components

- [ ] Every component in `COMPONENT_INVENTORY.md` has a Figma component
- [ ] Names match the code exactly (`Primary`, `Secondary`, `Choice`, `ActionCard`, `InfoCard`, `Label`, `Digits`, `Bidi`, `Screen`, `StateBlock`, `RedirectNote`)
- [ ] **Pressed state for every interactive component** — none exists today (R-15)
- [ ] Focus state for every interactive component (R-17)
- [ ] Disabled state, **paired with its explanation treatment** — the build requires a disabled control to have a visible explanation
- [ ] Busy state for `Primary`
- [ ] `Choice`: both answers verified as visually equal in weight — asymmetry here is a consent defect, not a style preference
- [ ] `Choice`: selection signalled by something other than colour alone (R-19)
- [ ] Tab bar designed, with selected/unselected and badge (R-8)
- [ ] Modal / sheet chrome designed — four screens declare `destination: modal` and render as full screens today
- [ ] `TextField` designed with default / focus / error / disabled — 28 screens in Entry and Account are forms and no input component exists
- [ ] Photo viewer designed (R-11) — R3 renders a grey placeholder box today
- [ ] Destructive confirmation designed — needed by V5 and the `two-step` state kind

## 3. Screens and states

- [ ] Every screen in `SCREEN_INVENTORY.md` Part 2 has a frame per declared state
- [ ] **[BUILD]** Exactly one primary action per screen — counted from the rendered tree
- [ ] **[BUILD]** Every screen shows where the user is (a title)
- [ ] **[BUILD]** Back behaviour matches the contract (`pop` / `dismiss` / `replace` / `none`)
- [ ] **[BUILD]** No action label appears twice on one screen
- [ ] Both of S1's empty states designed — teaching and quiet are opposite emotional targets in the same component
- [ ] Loading skeletons match the shape of the content they precede (R-13)
- [ ] Every error state names what failed, that the work survived, and one action
- [ ] Every offline state shows the age of what it is showing
- [ ] Permission-refused states name the alternative and remain usable
- [ ] Treatments defined for the seven undefined Blueprint state kinds: `stale`, `expiring`, `closed`, `paused`, `mismatch`, `rate-limited`, `two-step` (R-14)

## 4. Content and language

- [ ] **[BUILD]** One numeral system per surface
- [ ] Real Arabic content throughout — no lorem ipsum
- [ ] Latin drug names shown inside Arabic sentences, at the longest realistic length
- [ ] **[BUILD]** RTL is the design direction, not a mirrored LTR layout
- [ ] Prices shown exactly, never rounded — rounding was a shipped defect
- [ ] Reliability shown as a band, never a number or a percentage (D11)
- [ ] No visual ranking, badge or highlight elevating one pharmacy over another (D12)

## 5. Accessibility

- [ ] Every screen designed at 200% text scale — especially R8 (six metadata lines per row) and V2 (the code is already the largest element)
- [ ] No state distinguished by colour alone (R-19)
- [ ] Focus indicator visible on every interactive element (R-17)
- [ ] Touch targets never closer than a specified minimum, so two are not mistaken for one
- [ ] Icons meet 3.0:1 against their background
- [ ] Reduced-motion fallback for every animation (R-9)

## 6. Responsive

- [ ] Every screen at 320pt, 360pt, 430pt (R-21)
- [ ] R8, R9, V2 and R1 — the four densest screens — verified at 320pt
- [ ] Safe-area insets specified for notch, home indicator, Android nav bar (R-22)
- [ ] **[BUILD]** No horizontal overflow at any width — measured in a browser every build
- [ ] Keyboard-avoidance behaviour specified for the search field and every form
- [ ] Landscape supported or explicitly refused (R-23)

## 7. Motion

- [ ] All 8 motion tokens specified with property, duration and cubic-bézier values
- [ ] `sheetDrag` gesture specified — it is documented as following the finger 1:1
- [ ] `responderArrive` specified — the arrival of an offer is the product's emotional peak and is currently a silent row insertion
- [ ] Reduced-motion fallback per token
- [ ] Each token still teaches what it is documented to teach

## 8. Assets

- [ ] Every icon in `ASSET_CHECKLIST.md` §1 delivered as SVG with a mirror flag
- [ ] Font files delivered, with licences, all weights
- [ ] Tabular figures verified: `0000` and `1111` measure identically
- [ ] App icon, notification icon, splash delivered
- [ ] Illustration decision made, and assets delivered if the answer is yes

## 9. File hygiene

- [ ] Frames named `<ScreenId> · <state>`, matching the code's ids
- [ ] Auto-layout throughout; no absolute positioning in delivered screens
- [ ] No detached instances
- [ ] Colour and type applied as styles, never as raw values on layers
- [ ] Open questions, decisions and Blueprint queries recorded on the handoff page

---

## 10. The final test

> Can Engineering implement any screen in `SCREEN_INVENTORY.md`, in any of its
> declared states, at any of the three widths, in either colour scheme, without
> choosing a single value?

If the answer is no anywhere, name the screen and the missing value, and add it
to this checklist. That gap is the handoff's remaining work.

---

## 11. What Engineering guarantees in return

- Tokens go in first and the contrast test runs against them immediately; a
  failing pair comes back with its **measured ratio**, not an opinion.
- Every component is audited against the product rules automatically the moment
  it is used by a registered screen state.
- Every design change appears in `review/index.html` with a visual-regression
  entry listing exactly which screenshots changed.
- Anything the design does not specify is **escalated as a question, not filled
  in by an engineer**.
