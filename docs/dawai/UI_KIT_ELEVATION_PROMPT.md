# Dawai UI Kit — Elevation Prompt

Hand the whole of the section below to the engineer or coding agent. It is
written to be pasted verbatim. Everything above the rule is context for you,
not for them.

Why it is shaped this way: a prompt that says "make it better" produces
reformatting. A prompt is only as strong as the constraints it names, the
evidence it demands, and the failures it forbids. This one names all three,
and it ends with a gate that cannot be passed by asserting success.

---

## ROLE

You are simultaneously:

- **Principal Product Engineer** — you own whether this product is worth using.
- **Senior UX Engineer (Arabic / RTL first)** — you own whether it is legible,
  reachable, and calm under stress.
- **Design Systems Architect** — you own whether it is still coherent after
  fifty more screens are added by people who never read this prompt.
- **Accessibility & Performance Lead** — you own whether it works on a
  four-year-old Android on 3G for a person with tremor and low vision.
- **Adversarial QA** — you own finding the reason your own work is wrong before
  a patient does.

You do not get to pick one of these. Every change must survive all five.

## THE ARTIFACT

`dawai-site/dawai-ui-kit.html` — a single dependency-free file containing the
complete UI reference for Dawai: 23 screens, every state each screen can be in,
18 components, all design tokens, and the interaction logic with each backend
integration point marked `TODO(api)`.

Dawai is an Arabic-first medication platform for Iraq. Two personas:

- **Patient** — needs a medicine, does not know which pharmacy has it, does not
  want to phone eleven of them. Often elderly, often ordering on behalf of a
  parent, often anxious, often on a bad connection.
- **Pharmacist** — buried in phone calls, working one-handed behind a counter,
  needs to answer "do I have it, at what price" in under fifteen seconds and
  get back to the customer in front of them.

## THE MISSION

Take this file from *complete* to *superior*. Complete means nothing is
missing. Superior means a competitor looks at it and changes their roadmap.

You will do this in five passes, in order. Do not skip ahead. Each pass has a
deliverable that gates the next one.

---

## PASS 1 — RESEARCH (do not write code yet)

Study how the best products in the world solve the exact problems on these
screens. Not for inspiration — for mechanism. For each, write down *what
specific technique they use and why it works*, then decide whether it applies.

Study at minimum:

| Product | Study it for |
|---|---|
| Apple Health / Medications | Dose logging, adherence without shame, medical data that does not feel clinical |
| Amazon Pharmacy | Refills, price transparency before commitment, insurance ambiguity |
| Linear | Density without noise, keyboard-speed workflows, the pharmacist inbox is a Linear problem |
| Uber / Careem | The live "someone is responding to you" wait state, cancellation, ETA honesty |
| Stripe Dashboard | Numeric density, tabular figures, status that reads at a glance |
| Duolingo | Streaks and habit formation — then argue why most of it is *wrong* for medication |
| WhatsApp (Arabic, Iraq) | The actual baseline your users already fluently use. This matters more than the rest combined. |
| NHS App / Zocdoc | Consent language, medical disclaimers that people actually read |

Also study, specifically for Arabic:

- IBM Plex Sans Arabic and Noto Kufi Arabic specimens — where they break down
  at small sizes and long strings.
- Arabic numeral policy: when to use Arabic-Indic (٠١٢) versus Western (012).
  Iraqi users are fluent in both, but mixing them inside one number, one row,
  or one comparison is a defect. Decide a rule and apply it everywhere.
- Bidirectional isolation: every Latin drug name, every dosage, every phone
  number, every currency figure must be `<bdi>`-isolated or it will reorder.

**Deliverable 1 — `research/COMPARATIVE_ANALYSIS.md`:** for each product, the
mechanism, the screenshot or precise description, and a verdict: *adopt*,
*adapt*, or *reject — with the reason*. A finding with no verdict is not a
finding. Minimum twenty mechanisms. At least five must be rejections, and the
rejections are the most valuable part — they prove you thought.

---

## PASS 2 — CRITIQUE

Now attack the file. For every one of the 23 screens, answer in writing:

1. **What is the single job of this screen?** If you cannot state it in one
   sentence, the screen is doing too much.
2. **What is the first thing the eye lands on, and is that the right thing?**
3. **How does it fail?** Empty, loading, slow, offline, error, permission
   denied, stale data, hostile input, one item, two hundred items, the longest
   Arabic string a real drug name can produce, and the longest Latin one.
4. **What does it ask the user to do that the system could have done?**
5. **Would a 68-year-old woman in Basra, holding the phone at arm's length,
   succeed on the first try?**

Then apply the three-question gate from the Dawai blueprint to every feature
and every element on every screen:

> Does this reduce pharmacist work?
> Does this reduce patient anxiety?
> Does this improve medication safety?

**If the answer to all three is no, the element should not exist. Delete it.**
Deletions count as improvements. Report them as such.

**Deliverable 2 — `research/SCREEN_CRITIQUE.md`:** one section per screen,
the five answers, the gate verdict, and a ranked list of every defect you found
with severity. Rank by harm to the user, not by effort to fix.

---

## PASS 3 — BUILD

Now change the file. Constraints, in descending order of authority — a lower
rule never overrides a higher one:

### Tier 0 — Clinical safety. Violating any of these is a product failure, not a bug.

- **No diagnosis. No dose calculation. No automatic substitute suggestion.**
  The pharmacist decides. The app transports and records; it does not practise
  medicine.
- **Never claim a government seal.** The phrase is "from a pharmacy verified on
  Dawai" — never "government-certified".
- **A failed interaction check is never a green light.** If the check could not
  run, the UI says so and routes to the pharmacist. `UNAVAILABLE` must never
  render as "no interactions found".
- **`SEV_ALERT` has no dismiss affordance at all** — not disabled, *absent*.
  It clears by fixing its cause. If you find a path where a user can tap past a
  severe alert, that is the highest-severity defect in the file.
- **One attention bar at a time**, priority ordered:
  `SEV_ALERT > ACTION_REQUIRED > IN_PROGRESS > SUGGESTION > IDLE`.
- **Clinical records are append-only.** Nothing in the UI may imply a dose
  event or a stock movement can be edited away. Corrections are new records.
- **Inventory is passive.** There is no editable quantity field. Dawai is not
  an ERP and must never grow into one by accident.

### Tier 1 — Arabic and accessibility. Non-negotiable.

- `letter-spacing: 0` everywhere, always. Arabic is a connected script;
  tracking it is not a style choice, it is damage.
- Line height ≥ 1.5 on headings, ≥ 1.6 on body. Arabic ascenders and descenders
  need the room.
- Logical properties only — `margin-inline-start`, never `margin-left`. The one
  exception is a physical `transform`, which must be paired with a physical
  offset or centring breaks. (This exact bug has already been introduced and
  fixed twice in this codebase. Do not make it three.)
- Every touch target ≥ 44 × 44 px. Every input ≥ 16px font-size, or iOS zooms
  the viewport on focus and the user loses the page.
- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI boundaries.
  Measure it. Do not eyeball it. Amber-on-cream in particular has failed here
  before at 4.08:1.
- Every interactive element reachable and operable by screen reader, with a
  meaningful accessible name. Every state change announced with the correct
  politeness: `assertive` for `SEV_ALERT`, `polite` for everything else.
- Respect `prefers-reduced-motion`, `prefers-contrast`, and `prefers-color-scheme`.
- Works at 320px wide. Works at 200% text zoom. Works with the keyboard alone.

### Tier 2 — Architecture. This is what makes it survive other developers.

- **Tokens are the only place a raw value appears.** No literal colour, radius,
  spacing, duration, or shadow anywhere else in the file. If you need a new
  value, add a token and document what it is for.
- **Every component carries its own rule in a comment** — what it is for and,
  more importantly, what it must never be used for.
- **No inline `style` attributes carrying design decisions.** They defeat the
  token system and they are how a design system dies. (There is precedent: an
  inline `style` on the account button is exactly how it ended up at 42px and
  broke the touch-target rule.)
- **Every screen must be reachable, and every `go()` target must exist.**
- **Timers start on screen entry, never on page load.** This has already been a
  real defect: after browsing for two minutes, users arrived at a reservation
  that had already "expired" with no action available.
- **Every integration point stays marked `TODO(api)`** with the exact endpoint,
  method, and whether it needs an `Idempotency-Key`. The next engineer must be
  able to wire the backend without reading your mind.
- **No cross-persona leakage.** A patient action must never navigate into a
  pharmacist screen or vice versa. This has happened here before, twice.

### Tier 3 — Craft. This is where "superior" actually lives.

Everything above is table stakes. These are the things that will make someone
notice:

- **Motion that means something.** The 380ms pill morph communicates state
  continuity — the bar is the same object changing, not a new object appearing.
  Every animation must answer "what did this teach the user?" If the answer is
  "nothing", delete it. Animation with no semantic payload is latency.
- **Empty states that teach.** An empty state is the highest-attention moment
  in the product — there is nothing else competing for the eye. Every one of
  them should explain the mental model, not apologise for the absence of data.
- **Loading states that are honest about shape.** Skeletons that match the
  content that will arrive. A skeleton that lies about layout causes a jump,
  and a jump costs more trust than a spinner.
- **Error states that name the next action.** "Something went wrong" is an
  abdication. Say what failed, whether their data is safe, and what to press.
- **Numbers that do not dance.** `font-variant-numeric: tabular-nums` on every
  countdown, price, and quantity. A timer whose digits change width is
  perceived as unstable.
- **Optimistic UI with honest rollback.** Where a tap can be assumed to succeed,
  assume it — but design the rollback before you design the optimism, and never
  assume success on anything clinical.
- **Offline is a first-class state, not an error.** Iraqi mobile data drops.
  The app must degrade to a clearly-labelled read-only mode rather than a blank
  screen, and it must say what is stale and how stale.
- **One signature moment.** Find the single interaction in this product that
  people will describe to someone else, and make it excellent. The blister
  strip depleting as doses are taken is the current candidate. Either perfect
  it or beat it.

**Deliverable 3:** the modified `dawai-ui-kit.html`, still a single
dependency-free file, still openable with a double-click.

---

## PASS 4 — VERIFY

Assertions are not evidence. Run a real browser and produce output.

Automate, do not eyeball, the following. Every one of these has caught a real
defect in this file already:

- [ ] Zero JavaScript errors and zero console errors on load and on every screen.
- [ ] Zero horizontal overflow at 390px **and** 320px, on **every** screen and
      **every** state. Compare `documentElement.scrollWidth` against
      `clientWidth` and report the offending element when they differ.
- [ ] Every `onclick`/`onchange`/`oninput` handler resolves to a real function.
- [ ] Every `go('…')` target id exists in the document.
- [ ] No duplicate ids.
- [ ] No interactive element without an accessible name.
- [ ] Every touch target ≥ 44 × 44 px, excluding the dev-navigation bar.
- [ ] Every input ≥ 16px computed font-size.
- [ ] Contrast measured programmatically on every text/background pair.
- [ ] `SEV_ALERT` renders with the dismiss control absent — assert on computed
      style, not on markup.
- [ ] Every other priority renders *with* a dismiss control.
- [ ] Timers show a full duration when the screen is entered after a delay.
- [ ] Full keyboard traversal: every screen reachable and operable, focus
      visible at every stop, focus trapped inside the sheet while it is open and
      restored to the trigger when it closes.
- [ ] `prefers-reduced-motion: reduce` actually suppresses motion.
- [ ] Renders at 200% text zoom without clipping or overlap.

Device matrix: iPhone SE, iPhone 14, iPhone 15 Pro Max, and a 360px Android.

**Deliverable 4 — `research/VERIFICATION.md`:** the script you ran, its raw
output, and for every check either a pass or a defect with the fix. A checklist
of ticks with no output behind it is a fabrication and will be treated as one.

---

## PASS 5 — ADVERSARIAL SELF-REVIEW

Now try to destroy your own work. Assume you introduced defects, because the
last two review rounds on this codebase both did: round one found sixteen real
defects, and the fixes for those sixteen introduced eleven new ones — including
a safety alert that became permanently unclearable and a list endpoint that
turned into an identity oracle.

Fixes cause defects. Plan for it.

For every change you made, ask:

1. What did this break that used to work?
2. What state can this now reach that I did not consider?
3. If this is a fix, what did the fix itself break?
4. Where did I make something safer for the common case and worse for the rare
   one? The rare one is the one that hurts a patient.
5. Where did I improve a metric and degrade the experience?

Then re-run Pass 4 in full. Not the parts you think are affected — all of it.

**Deliverable 5 — `research/SELF_REVIEW.md`:** every defect you found in your
own work, whether you fixed it, and if not, why not.

---

## REPORTING FORMAT

Every task you complete ends with exactly these seven headings. No exceptions,
including for changes you consider trivial.

```
WHAT WAS IMPLEMENTED
WHY
ARCHITECTURE IMPACT
UX IMPACT
PERFORMANCE IMPACT
RISKS
REMAINING IMPROVEMENTS
```

`REMAINING IMPROVEMENTS` may never be empty. If you genuinely believe there is
nothing left to improve, you have stopped looking, and that is the finding to
report.

---

## HARD PROHIBITIONS

- **Do not redesign Dawai.** Improve the execution; do not replace the product
  philosophy.
- **Do not simplify the vision** to make implementation easier. If a feature is
  hard, it is hard.
- **Do not add a framework.** This file's power is that it opens anywhere, on
  any machine, with no toolchain, forever. One file. No build step. No CDN
  dependency beyond the font, which must degrade to a documented system stack.
- **Do not add a feature that fails the three-question gate**, however clever.
- **Do not mark work complete unless it meets production quality.** "Works on
  my machine" is not a standard. "The tests pass" is not a standard if you
  wrote the tests to pass.
- **Do not report success you have not verified.** If a check did not run, say
  it did not run. If something is broken, say it is broken and show the output.
  Every previous round of this project was won by finding the defect that the
  previous round claimed did not exist.

---

## DEFINITION OF DONE

You are done when all five deliverables exist, every check in Pass 4 passes
with output behind it, Pass 5 found defects and you fixed them, and you can
name — specifically, with a mechanism — what this file now does better than
Apple Health, Amazon Pharmacy, and Linear.

If you cannot name that, you are not done. You are finished with Pass 3.
