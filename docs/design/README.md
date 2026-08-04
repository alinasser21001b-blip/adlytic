# Dawai — Design Delivery Package

Everything a designer needs to produce the final UI, without asking Engineering
a question. If you find something ambiguous, that is a bug in this package —
tell us and we will fix the document rather than answer in a meeting.

---

## Read in this order

| # | Document | What it is | Read it |
| --- | --- | --- | --- |
| 1 | **[DESIGN_BRIEF_FOR_DESIGNER.md](DESIGN_BRIEF_FOR_DESIGNER.md)** | What Dawai is, who uses it, what it must feel like, what may never be compromised | First. Once, properly. |
| 2 | **[DESIGN_HANDOFF_REQUIREMENTS.md](DESIGN_HANDOFF_REQUIREMENTS.md)** | 23 numbered requirements, each with why Engineering needs it and what happens without it | Second. §2 is where the work is. |
| 3 | **[DESIGN_TOKENS.md](DESIGN_TOKENS.md)** | The values the app renders with today, with measured contrast | Before opening Figma |
| 4 | **[SCREEN_INVENTORY.md](SCREEN_INVENTORY.md)** | Every screen: purpose, goal, states, interactions, what is FIXED, what is OPEN | Your daily reference |
| 5 | **[COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md)** | Every component: variants, states, a11y, motion, RTL, responsive, constraints | Your daily reference |
| 6 | **[DIAGRAMS.md](DIAGRAMS.md)** | Journeys, navigation graph, component hierarchy, token relationships, asset and screen dependencies | When you need the shape of the thing |
| 7 | **[ASSET_CHECKLIST.md](ASSET_CHECKLIST.md)** | Every asset to export, with formats and sizes | When you start exporting |
| 8 | **[FIGMA_STRUCTURE.md](FIGMA_STRUCTURE.md)** | File organisation and naming — non-negotiable in one specific way | Before you name your first frame |
| 9 | **[DESIGN_QA_CHECKLIST.md](DESIGN_QA_CHECKLIST.md)** | The acceptance test Engineering runs against your delivery | At the start, and again at the end |

**Also look at the live product.** `review/index.html` in the repository root is
the engineering dashboard: 28 screen states photographed at phone size, the
navigation graph, the tokens with measured contrast, the technical-debt register
and an honest release-readiness verdict. The screenshots are committed under
`review/screenshots/` — open them directly if you would rather not run anything.

---

## Which documents are generated

Four of the nine are produced by `npm run design` from the code and **must not
be edited by hand**: `SCREEN_INVENTORY`, `COMPONENT_INVENTORY`, `DIAGRAMS`,
`DESIGN_TOKENS`. A hand-maintained inventory disagrees with the build within one
slice, and a designer working from a stale list designs screens that do not
exist while missing states that do.

If one of them says something wrong, the code or `platform/tools/design/notes.mjs`
is wrong. Tell us; do not patch the markdown.

---

## Scope of this engagement

**In scope:** the **patient** app. 133 Blueprint screens exist for it; 18 have
an engineering contract and 12 are rendered today.

**Out of scope for now:** the pharmacy app (31 screens) and the operator console
(24 screens). Both are real and both are coming. The design system already
declares three personas with opposite emotional targets — patient/*calm*,
pharmacy/*fast*, owner/*certain* — so build the token structure to carry three
palettes, but design only the patient one.

---

## Who owns what

| Thing | Owner | Note |
| --- | --- | --- |
| Visual design, layout, motion, iconography, illustration | **Design** | Everything in the OPEN sections |
| Product behaviour: what a screen does, its states, its exits, its permissions | **Product** (frozen in Blueprint v3) | Listed as FIXED. Raise conflicts; do not absorb them. |
| **The Arabic copy** | **Product** | See below — this is the question agencies ask first |
| Implementation, tokens in code, accessibility enforcement | **Engineering** | |

### The Arabic copy is not yours to rewrite

Every string in the product is Iraqi dialect, written deliberately, and several
are load-bearing. `بانتظار الاتصال` ("waiting for a connection") is the only
phrase the app may use for a queued request, because a friendlier word would
break decision D27. `تلتزم بالحجز` is a reliability *band*, not an adjective
someone chose.

**Design freely around the copy. Do not restyle the words themselves.** If a
string does not fit your layout, that is a real finding — raise it, and Product
will either shorten the string or confirm the layout must grow. Silently
shortening a clinical or offline string is the one change that can turn a design
improvement into a safety defect.

You will need to *set* Arabic text properly — line height, weight, the Latin/
Arabic pairing for drug names. That is squarely yours.

---

## What you are delivering

1. **A Figma file** organised per `FIGMA_STRUCTURE.md`, with frames named
   `<ScreenId> · <state>` — the one naming rule that is not negotiable, because
   it lets a design frame and its built screenshot be placed side by side
   automatically.
2. **Tokens as Figma variables/styles**, using the 15 role names already in the
   code, in both light and dark.
3. **Components as Figma components with variants**, with property names
   matching the code's props (`disabled`, `busy`, `selected`, `muted`).
4. **Exported assets** per `ASSET_CHECKLIST.md` — icons as SVG, fonts with
   licences, app icon, notification icon, splash.
5. **Motion specifications** with cubic-bézier values, not curve names.
   "Spring" is not implementable without numbers.
6. **Answers to the open decisions** listed in each screen's OPEN section.

---

## How it is accepted

Engineering runs `DESIGN_QA_CHECKLIST.md` against the delivery. Items marked
**[BUILD]** in it are already enforced by automated checks — a design that fails
one of those cannot be implemented without disabling a check that exists to keep
133 screens consistent.

Then, in this order:

1. **Tokens go in first.** The contrast test runs against them immediately. A
   failing pair comes back to you with its **measured ratio**, not an opinion.
2. **Components next.** Each is automatically audited against the product rules
   the moment a screen uses it.
3. **Screens are re-rendered** into `review/index.html`, and the
   visual-regression step lists every screenshot that changed.
4. **Design review happens against that regenerated dashboard**, not against a
   Figma export — because the dashboard shows what the code actually produces.

---

## How to raise a conflict with a FIXED decision

Some of what you will want to change is frozen. That is normal and the process
is short:

1. Note it on the **Handoff notes** page in Figma with the screen id and the
   Blueprint reference (`§25`, `D12`, and so on — every FIXED item cites one).
2. Engineering confirms whether it is genuinely frozen or merely undocumented.
3. If frozen, Product decides. An approved change becomes a Blueprint amendment,
   and the automated check that enforced the old rule is updated in the same
   change.

**Nothing is frozen forever.** It is frozen so that changing it is a decision
rather than an accident.

---

## Glossary

Terms used throughout, in the order you will hit them.

| Term | Meaning |
| --- | --- |
| **Blueprint v3** | The frozen product specification. 133 screens, 43 numbered decisions, 54 resolved issues. The source of every FIXED item. |
| **§25**, **§22** | A section of Blueprint v3. §22 is empty/loading states, §23 errors, §25 visual system, §27 numerals. |
| **D09**, **D12**, **D18** | A numbered product decision. D09 fixes the three urgency windows; D12 forbids ranking offers; D18 says Phase 0 never reads a prescription. |
| **Screen contract** | The engineering declaration of a screen: purpose, location, back behaviour, one primary action, secondary actions, states, exits, telemetry. Machine-checked against the Blueprint. |
| **State / treatment** | A screen's non-default condition — loading, empty, error, offline, permission-refused, success — and the specific visual handling it gets. |
| **Teaching vs quiet empty** | Two different empty states. Teaching is a new user who must be shown what to do. Quiet is an established user with genuinely nothing to do, which is good news. |
| **Hold / reservation** | A pharmacy setting stock aside for a named patient, with a code and an expiry. The product's core promise. |
| **Offer** | A pharmacy's answer to a request: which lines it can supply, at what price. |
| **Coverage** | How many requested medicines an offer can supply — "2 of 3". Never a percentage. |
| **Band** | A reliability category (`trusted` / `new` / `needs attention`). Never a number. |
| **Child request** | When an offer fills only some lines, the rest automatically become a new request. The patient never re-enters a line. |
| **Outbox** | The queue holding work composed offline. A queued item is never described as sent. |
| **Substitution** | A pharmacy offering a different brand. Requires explicit, per-line consent. |
| **Persona** | One of three palettes: patient (calm), pharmacy (fast), owner (certain). Same role names, different values. |
| **Destination** | Which top-level area a screen belongs to — `today`, `find`, `me`, `inbox`, `holds`, `branch`, `modal`, `entry`. There is no tab bar yet. |
| **BLOCKED** | An exit whose target screen is not built. No control renders for it, so a user cannot reach a dead end. |
| **MOCKED / SIMULATED** | Labels the dashboard applies to itself. Mocked = a type with a fake behind it. Simulated = rendered from fixtures. |
| **P0/P1/P2/P3** | Priority in `DESIGN_HANDOFF_REQUIREMENTS.md` §9. P0 blocks Engineering today. |

---

## The state of the build, honestly

- The patient core loop works end to end: search → request → wait → compare →
  consent → reserve → collect.
- 636 automated tests pass. Contrast, tap targets, accessible labels, one
  primary per screen, no repeated actions and one numeral system are all
  enforced on every rendered state, every build.
- **The build cannot ship.** No infrastructure exists — the app has never
  exchanged a byte with a server. The camera is not implemented. A guest cannot
  sign in, because the sign-in chain is not built. `review/index.html` says all
  of this on its own release-readiness panel.
- **There are no design assets of any kind.** No icons, no fonts, no images.
  Every icon in the product today is a Unicode character an engineer picked.

That last line is why this package exists.
