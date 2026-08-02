# Dawai — Design Brief

*Written for the designer. Read this one first; the other documents are
reference and you will not need most of them on day one.*

---

## What Dawai is

A woman in Baghdad has a prescription in her hand and a child with a fever. The
nearest pharmacy might have the medicine. So might the one after that. Today she
finds out by walking, or by calling numbers she does not have, or by sending her
husband out while she stays with the child.

Dawai tells her which nearby pharmacy has it, and holds it for her until she
gets there.

That is the whole product. Not a marketplace, not a delivery service, not a
health tracker. **One question — who has my medicine — and one promise: it will
still be there when you arrive.**

Everything in the app exists to serve that sentence or it does not exist.

---

## Who the users are

Design for these people specifically. Not for a persona deck — for these.

**She is often frightened.** People do not open a pharmacy app on a good day.
They open it because someone is ill, usually someone they love, often at night.
Assume every user is more anxious than your usual audience and less patient with
anything that wastes a moment.

**She may be elderly, and she may read slowly.** Iraq's population skews young,
but the people managing chronic medication skew old. Some of your users run
their phone at the largest text size available. Some cannot read fluently at
all and rely on shapes, positions and colours they have learned. This is why the
build already enforces a 44pt minimum tap target and measures every colour pair
for contrast — and why **you must design every screen at 200% text before you
call it done**, not after.

**Her phone is not your phone.** The commonest devices in the market are
low-cost Androids at 360pt logical width; 320pt still exists. Every screenshot
Engineering has produced so far is 390pt, which is an iPhone, which is not what
most users own. The densest screen in the product carries six facts per row and
**nobody has ever seen it at 320pt**.

**Her connection drops.** Not occasionally — routinely. Offline is a normal
state in this product, not an error condition. There is an entire architecture
behind that: a request composed without signal is queued and *never* described
as sent, and the reservation screen renders from cache with its countdown
labelled as last-known rather than shown as live. Your designs have to carry
that honesty visually.

**She reads Arabic, right to left.** This is not a localisation pass applied at
the end. It is the direction the product is designed in. Arabic is a connected
script: letter-spacing is always zero, because tracking breaks the joins. Drug
names arrive as Latin runs inside Arabic sentences and have to be isolated or
they visually reorder — and a reordered price is a patient reading the wrong
number.

---

## What the product should feel like

**Calm.** The emotional target is written into the design system: the patient
palette is warm and generous specifically because the user is frightened, and
speed matters only because waiting is frightening. This is not a productivity
app. Nothing should feel efficient at the cost of feeling steady.

**Honest.** The single most distinctive thing about this product is that it
refuses to overstate what it knows. It does not check drug interactions, and it
says so rather than implying a safety net it does not have. It does not read the
prescription photo — the patient judges whether it is legible, because no
algorithm here has looked at it. A queued request is never dressed up as a sent
one. A cached countdown says it is cached.

Every one of those is a moment where a normal app would show a reassuring
spinner and a normal designer would make it feel smooth. **Here, smoothness that
implies certainty is a defect.**

**Quiet, until it matters.** Most days the honest answer to "does anything need
me?" is no. The home screen has two different empty states for exactly this
reason: a brand-new account that must be *taught*, and a well-managed patient
having a *quiet day* who must be *reassured*. Same component, opposite emotional
targets. Getting that difference right is one of the most valuable things you
will do.

---

## What must never be compromised

These are not preferences. Each is a decision already made, already built, and
already enforced by an automated check that will fail the build if a design
contradicts it. If you want to change one, raise it — do not absorb it.

**1. No pharmacy is ever promoted over another.** The offers list has no
ranking, no weighting, no paid placement and no "recommended" badge. The order
is coverage, then price — both printed on every row so the patient can verify
the order themselves — and the screen says so out loud. Any visual treatment
that makes one pharmacy more prominent than another breaks the product's central
promise of neutrality. No highlight, no ribbon, no subtle elevation on the first
row.

**2. Consent to a substitution is explicit, per medicine, and never nudged.**
If a pharmacy offers a different brand, the patient answers a real question
before anything is reserved. Both answers — agree and refuse — carry
*deliberately identical* visual weight. A filled "agree" beside an outlined
"refuse" is a nudge, and a nudged consent is not consent. This is the one place
in the product where visual asymmetry is a clinical defect rather than a style
choice.

**3. Reliability is a band, never a number.** A pharmacy is "reliable",
"new to the app", or "sometimes does not honour holds". Never 94%. A decimal
invites an argument about a number instead of about the behaviour, and patients
read it as a rating.

**4. Prices are exact.** Rounding shipped once — 8,500 dinars displayed as
"9 thousand" — on the one screen whose entire purpose is comparing prices. It is
now tested. Never round money.

**5. One primary action per screen.** Counted from the rendered tree on every
build. If a screen seems to need two, one of them is a secondary or the screen
is doing two jobs.

**6. Every state tells the truth about itself.** Offline says offline and shows
its age. Queued says queued and shows no countdown. Refused explains what is
fixable, and never blames the person.

---

## What is genuinely yours

Everything about how it looks and feels. Specifically, and this is not a short
list:

- **Every icon in the product.** There are none. The back arrow is a punctuation
  mark, the add button is a plus sign, the search affordance is an obscure
  Unicode glyph that renders as a hairline. You are not refining an icon set —
  you are creating the first one.
- **The typeface.** Three families are named in code and none is bundled. The
  reservation code currently renders in whatever serif the OS falls back to.
- **Every layout dimension in the shared component kit.** The skeleton loader,
  the progress bar, the add affordance, the reservation code panel, the header,
  the footer, the empty state — every one is an engineer's arithmetic waiting to
  be replaced.
- **All motion.** Eight motion tokens are declared with durations and a stated
  purpose each, and not one is implemented. Every state change in the product is
  currently instant.
- **Elevation.** Five levels declared, zero specified. This is why the four
  modal screens are indistinguishable from full screens.
- **The entire top-level navigation.** There is no tab bar. Eight destinations
  are declared in the contracts and nothing renders them.
- **Dark mode.** The palette exists and its contrast is measured every build.
  Nobody has ever looked at it.

---

## The moments that require the most trust

Spend your best work here. In order.

**1. `V2` — the reservation.** Blueprint v3 says this screen must never fail.
A patient is standing at a counter, possibly in sunlight, possibly with a child
on one arm, and needs to show a code. It renders from cache when there is no
signal. The code is the largest element on the screen and is grouped in pairs so
it can be read aloud over a phone. Design this one at 200% text *first*.

**2. `R9` — substitution consent.** The patient is agreeing to receive a
different medicine than the one prescribed. Comprehension matters more than
reassurance here. What they asked for sits beside what is offered, with the
pharmacist's own words shown verbatim — the app never paraphrases a clinical
statement.

**3. `R8` — comparing offers.** She is choosing where to walk with a sick child.
Six facts compete on every row: pharmacy, distance, coverage, what is missing,
price, reliability. The hierarchy you give those six is the most consequential
typographic decision in the product.

**4. `R7` — the wait.** The most anxious moment. It has two honest forms — a
countdown when pharmacies have actually been asked, and *no countdown at all*
when the request is still queued, because a progress bar over a request nobody
has received is a lie told to the most anxious user in the product.

**5. `E4` — why we need your number.** The single hardest ask, and for most
users the first real impression. The app deliberately does not put a sign-in
wall on launch; it explains at the moment the account becomes necessary.

---

## The interactions that should feel invisible

- **Search.** A patient types a medicine name six different ways — with and
  without tatweel, with أ or إ or آ, with ى for ي, in either numeral system. The
  app already folds all of those onto one query. It should feel like the app
  simply understood, never like it corrected her.
- **Going back.** Every screen's back behaviour is already decided and has a
  stated reason. One screen deliberately cannot be left at all, because a hold
  request is in flight and going back would leave the patient unsure whether it
  happened. None of this should be noticeable.
- **The offer arriving.** A pharmacy answers and a row appears. There is a
  motion token for exactly this, named for what it teaches: *someone answered,
  just now*. It is currently a silent row insertion — the product's emotional
  peak, delivered as nothing.
- **Queueing while offline.** The request is composed, queued, and sent when the
  signal returns, with the patient told the truth throughout and asked to do
  nothing.

---

## What makes this different from a normal pharmacy app

A normal pharmacy app sells you medicine. It has a cart, a checkout, promoted
products, a loyalty scheme and a rating system. Its visual language is retail.

Dawai does none of that.

- **There is no cart and no checkout.** The patient pays at the counter, in cash,
  as they always have. The app never touches money.
- **There is no rating system.** Pharmacies are not reviewed by patients. The one
  reliability signal is a band derived from whether holds were honoured, and it
  exists to protect the patient, not to rank the shop.
- **There is no promotion, anywhere.** A pharmacy cannot pay for placement. This
  is architectural, not a policy that might change.
- **The app makes no clinical claims.** It does not check interactions, does not
  read prescriptions, does not advise. It says so, deliberately, where a normal
  app would imply a safety net.
- **The unit is the pack**, not the tablet, because that is how Iraqi pharmacies
  actually dispense.
- **Substitution requires consent**, every time, per medicine.

The visual language should follow from that. This is closer to a hospital
appointment card than to a shopping app: calm, factual, generous with space,
unhurried, and completely without persuasion.

---

## Where to start

1. Read this brief. You are here.
2. Open `review/index.html` in the repository. It is the live dashboard of what
   exists: 28 screen states photographed at phone size, the navigation graph, the
   design tokens with their measured contrast, and an honest list of what is
   broken. **This is the real product, not a mockup of it.**
3. Read `DESIGN_HANDOFF_REQUIREMENTS.md` §2 — the eleven places the
   implementation is currently guessing. Those become your Priority 0.
4. Use `SCREEN_INVENTORY.md` as your working reference. Every screen has its
   purpose, its states, what is FIXED and what is OPEN.
5. `DIAGRAMS.md` has the journeys and the navigation graph, generated from the
   code so they cannot be stale.

**One request.** If anything in this package is ambiguous, that is a
documentation bug and Engineering wants to hear about it. The point of writing
all of this down was that you should never need to schedule a meeting to find
out what a screen is for.
