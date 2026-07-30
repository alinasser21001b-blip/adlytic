# Design review matrix — round 1

Three independent explorations, identical constraints, no direction supplied by
the supervisor. Scored 1–5 against the eleven criteria. Every score cites
evidence; where an exploration admitted a weakness itself, it is credited for
the honesty and still marked down for the weakness.

**Boundary compliance — all three PASS.** `git status` clean after each,
`core-integrity.mjs` reports CORE INTACT. No protected file touched, no
expectation weakened, every named guard present. None of the three tried to
change domain logic to make a design work.

## The three axes

| | name | organising axis |
|---|---|---|
| **E1** | «المتن والسند» Matn & Sanad | **attribution and closure** — every line is claim + sayer + time, in a permanent 52px margin on the leading edge; top sort is open / settled |
| **E2** | «الورقة» The Sheet | **the lendable artifact** — one document, no home, no tab bar; consent is subtraction from a page you already read |
| **E3** | The Register | **time and consent scope** — first screen is a time ledger closed by a heavy now-rule; the record's sections ARE `CONSENT.SCOPE`, grouped by sharing behaviour |

These are genuinely three different structures, not one in three costumes. They
converge on a shared visual register (naskh, Iraqi clinical paper, a leading-edge
gutter) and on four moves — provenance always marked, `assist.js` surfaced,
`canCloseEpisode` surfaced, absence stated in words. That convergence is signal
rather than laziness: three designers reading the same domain independently
reached the same conclusions about what the domain demands.

## Scores

| criterion | E1 | E2 | E3 | note |
|---|:--:|:--:|:--:|---|
| originality | 4 | 4 | **5** | E3's grouping of the record by *sharing behaviour* — «تروح حتى لو ما اخترتها» / «ما سألك عنها أحد» / «ما تروح بأي تسليم عادي» — is the most novel and most Qareeb-specific idea produced. E1's sanad margin is the strongest single device. |
| information architecture | 4 | 4 | **5** | E3 found that `CONSENT.SCOPE` is already the product's real IA and no screen had used it. E1 mapped every existing route explicitly so nothing is orphaned. |
| continuity-of-care clarity | 4 | 4 | **5** | E3's chain of custody — who held it, what they were given, what they wrote back, what they left open — is continuity as a mechanical fact. |
| clinical usability | **2** | 2 | **4** | E1 and E2 are prose-first, and E1 states in its own §M that the concept should lose if a clinician's time-to-answer regresses. Visible in E1's mock: one 3-line sentence where the current build uses a value, a chip and a date. E3's register is one scannable row type with badges. |
| patient comprehension | 4 | **3** | **5** | E2 admits epistemic-tier-as-position is a convention the reader must learn. E3's copy is plain-spoken Iraqi. |
| mobile usability | 4 | **2** | 4 | E2 deletes the bottom bar, putting the revenue-adjacent half of the product behind a top nav. E1 designed a real 320 degradation (margin → superscription). |
| RTL quality | **5** | 3 | **5** | E1 derived 10 specific decisions and 3 came from measuring its own mock. E3 wrote its own bidi probe. E2 reasoned well but measured nothing. |
| accessibility | **5** | **2** | 4 | E1 keeps the banked tablist and puts the verb *outside* it so AT is not told there are four tabs. E2 proposes swapping banked `role="tablist"` for `aria-current` — a regression in already-banked a11y, which the guardrail protects. |
| scalability | 4 | 4 | 4 | All three handle a 12-year record: E1 via significance→grammatical rank, E2 via significance as filter threshold, E3 via a paginating time ledger. |
| implementation feasibility | 4 | **1** | **5** | E3: mock at three widths, shell retained, existing exports. E1: mock renders, but generated Arabic prose is a templating minefield it names itself. E2: **no visual evidence at all**, central bet untested, and asks to remove banked semantics. |
| differentiation from current build | 4 | **3** | 4 | E2 admits `careThreads` and `rangePosition` still underlie it — "the rendering and hierarchy change, the grouping does not". That is closer to a re-skin than the others. |
| **total (55)** | **44** | **31** | **50** | |

## Decision

**Carried to iteration 2: E3 (The Register) and E1 (Matn & Sanad).**

They are carried together because they are complementary rather than merely
first and second: E3 is the stronger *structure* and E1 the stronger *statement
device*, and each has a hole the other does not. E3's own §M argues that eleven
un-renameable scope nouns may reproduce the twelve-row table of contents it
replaced. E1's §M argues that prose is slower to scan than a table, and
clinicians scan.

**Not carried: E2.** Intellectually the most rigorous document of the three, and
rejected on evidence rather than taste:

1. **No visual evidence for its central bet**, justified on a factually false
   premise — it stated this container has no Arabic font installed. It has 12
   Arabic-capable faces (`fc-list :lang=ar`), including a serif, which is enough
   to mock a two-face argument with substitutes. The claim was not checked.
2. **It proposes removing banked accessibility semantics** (`role="tablist"` →
   `aria-current`), which the guardrail protects. Its own defence — "wrong role,
   correctly implemented and tested" beats "right role, newly implemented" — is
   an argument the supervisor is not willing to accept for an a11y baseline that
   is already paid for and passing.
3. **It admits its grouping is unchanged from what ships.** With `careThreads`
   still the underlying call, the axis has not moved.

Its two ideas worth salvaging are named in the iteration briefs so they are not
lost: **lending gains a fourth state, «returned»** — what changed while your
record was out, with authors — and **`SAFETY_FLOOR` refusing in place, on the
line**, rather than as a disabled checkbox.

## One claim corrected

E3 reported a new RTL hazard: a middle dot beside a single Arabic-Indic numeral
crossing to render `٣ ·` as `٣٠`, a silent ×10 error, and noted correctly that
guardrail §5 and the `ltrun` detector only cover neutrals *between two* numbers.

Measured independently at 390px with per-character `getBoundingClientRect()`:
**the mechanism does not reproduce.** In all five constructions — bare, inside a
`.num` isolate, Western and Arabic-Indic — pixel order kept the dot on its own
side. What IS real, and was found earlier in this project from a different
reviewer, is that U+00B7 `·` and U+0660 `٠` are near-identical glyphs: a
*confusability* hazard, not a bidi one. And the shipped build is not exposed —
`countAr()` emits Western digits, and the only source occurrences of a dot beside
an Arabic-Indic digit are section-header comments, not rendered strings.

Credit to E3 for probing the guard rather than trusting it. The diagnosis was
wrong; the instinct was right.

---

# Round 2 — decision

Both carried explorations returned. Both held the boundary again (repo clean,
CORE INTACT). Both self-corrected in ways that materially raised their
credibility, and both were re-verified rather than believed.

## Verification of round-2 claims

**E1's headline, re-measured by the supervisor** on its own `compare.html`,
inline-start offset taken as distance from the viewport's right edge in RTL:

| | E1 claimed | measured | |
|---|---|---|---|
| σ verdict offset @390 prose | 56.1px | 56.1px | ✓ |
| σ verdict offset @390 fielded | 0.0px | 0.0px | ✓ |
| spread first→last @430 prose | 226px | 226px | ✓ |
| mean row height @390 | 71.0 → 48.3 | 71.1 → 48.5 | ✓ |

It had warned me that two of its round-1 numbers were "arithmetic dressed as
measurement." These are real.

**E3's `--line-ctl` finding — CORRECTED.** It reported the banked token at
2.88:1, below the 3:1 floor. The shipped build measures **3.42:1 minimum across
143 control edges** in both themes, and computation confirms 3.42–3.48:1 on every
surface the product uses. The 2.88:1 was its own mock's surface, not the token.
The token is sound and stays. Had this been accepted, a passing token would have
been "fixed" and weakened.

**E3's bidi retraction accepted, and its reasoning credited.** It withdrew the
claim, noted its own round-1 probe had already printed the correct answer and
that it had believed a low-res screenshot over its own numbers, and drew the right
distinction: a bidi rule needs an audit detector, a glyph rule needs a lint.

## Ruling requested by E3 — the «رجعت» join

E3 flagged that «رجعت» (a loan returning with changes) is the one place it
assembles a fact from two others: an access-log actor equal to the share's
grantee, inside that share's active window.

**Ruled: ACCEPTED**, because this is the join the consent model already *means* —
the same identity acting inside a grant window is that grantee acting under that
grant — and both underlying facts are recorded. It is not an inference about
clinical content. Three conditions:

1. The row states its own basis in words, as proposed. Non-negotiable.
2. It may assert **custody** ("this changed while X held your record"), never
   **causation** ("X changed this because of Y").
3. Where `actorId` is absent it degrades to stating that something changed and
   that the actor is unrecorded — never to naming the grantee by assumption.

## Decision: E3 implements

| | E1 | E3 |
|---|---|---|
| fixed its own biggest risk by | **adding** a second register | **deleting** a bucket |
| 430 re-composition | −1.9% … −6.6% | **−2.0% … −13.8%, zero byte-identical pairs** |
| baseline weakness §3 (results buries the value) | ledger, value beside geometry | **clinician panel's heaviest run IS the value, 20px/700** |
| self-falsification | found a safety-class defect in its own run-grouping | **its signature now-rule failed its own test at 946px vs an 844px viewport, and was replaced** |
| refused an optimisation | — | **declined a change worth −30% on its headline surface because it broke "one time axis"** |

E3 wins on four grounds. Its fix to my objection was *subtraction* — it deleted
the neutral «أوراقك» band rather than adding a surface, and derived all five bands
exhaustively from `consent.js` behaviours. It surfaced
`EMERGENCY_SCOPES − SAFETY_FLOOR` as «تنفتح بالطوارئ بلا ما تسألك» — the four
scopes an ambulance can open without asking, never once stated in this product,
which is a genuine safety-transparency gain rather than a layout improvement. It
partly conceded on geometry *because testing changed its answer* ("a range bar is
preattentive; a sentence is not"), and demoted by audience rather than by tap. And
it refused an optimisation that would have improved its own headline metric by
30% because it violated a conceptual invariant — the clearest evidence of design
judgement either produced.

**E1 is not discarded.** Two of its devices are stronger than anything in E3 and
are offered to E3 to accept or refuse with reasons, not imposed:
«خارج نطاق الإعارة» — the lent record showing the shape of its own holes with a
control to request the withheld scope — and «الأرضية», the margin attributing a
statement to a *rule* rather than a person when `SAFETY_FLOOR` refuses.

**E3's residual weakness stands and is now implementation risk to watch:** one
interleaved register scatters a four-chronic-problem patient's thread. Its 20-year
test proves the register *fits*, not that a patient can find one problem inside
it. Its problem-strand leaf must carry that weight, and it is the first thing the
visual review will probe.
