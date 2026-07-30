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
