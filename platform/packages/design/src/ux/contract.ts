/**
 * The screen contract — UX requirements as a type, not a review comment.
 *
 * @blueprint §4 · §22 · §23 · §26 · §5
 * @owner platform-foundation
 * @why The brief is that UX is a first-class engineering responsibility rather
 *      than something added after the code is finished. Most of it is
 *      checkable: a screen that cannot say where the user is, what to do next
 *      and how to go back is not finished, and that is a property of a
 *      declaration rather than an opinion in a review.
 *
 *      Every field here answers one of the three questions the brief says a
 *      user must never have to ask. A screen without a contract does not
 *      render, and a contract that contradicts the frozen Blueprint fails the
 *      build — so improving UX can never quietly redesign the product.
 * @implements design/screen-contract
 */

/** "Where am I?" — shown in the header, always, on every screen. */
export type Location = {
  /** The title the user reads. Never a route name, never an entity id. */
  readonly title: string;
  /** The destination this screen belongs to, so the tab bar can indicate it.
   *  A screen that belongs to no destination is a screen the user got lost in. */
  readonly destination: "today" | "find" | "me" | "inbox" | "holds" | "branch" | "modal" | "entry";
};

/**
 * "How do I go back?" — declared, never implicit.
 *
 * `pop` is the ordinary stack pop. `dismiss` closes a modal and returns to its
 * opener. `replace` is for a screen the user must not return to — a completed
 * deletion, a signed-out state. `none` is permitted only where the OS back
 * gesture would leave the app, and it must say so.
 */
export type BackBehaviour =
  | { readonly kind: "pop" }
  | { readonly kind: "dismiss"; readonly returnsTo: string }
  | { readonly kind: "replace"; readonly with: string; readonly why: string }
  | { readonly kind: "none"; readonly why: string };

/**
 * "What should I do next?" — exactly one primary action per screen.
 *
 * §25 and the brief both require the primary action to be visually dominant
 * and secondary actions never to compete. One primary is how that becomes
 * structural: a screen cannot declare two.
 */
export type PrimaryAction = {
  readonly label: string;
  readonly leadsTo: string;
  /** Tap count from this screen to the outcome. The brief asks to reduce taps
   *  without violating the Blueprint, so the number is declared and can be
   *  regression-tested rather than estimated. */
  readonly tapsToOutcome: number;
};

export type SecondaryAction = { readonly label: string; readonly leadsTo: string };

/**
 * Every state a screen can be in, each with an intentional treatment.
 *
 * An empty state must carry an action, because §22 says an empty state is the
 * highest-attention moment in the product and spending it on "no data" wastes
 * the best teaching opportunity there is. An error must name what failed,
 * whether the user's work survived, and one thing to press — the three
 * questions §23 requires and "something went wrong" answers none of.
 */
export type StateTreatment =
  | { readonly kind: "loading"; readonly skeletonMatchesContent: true }
  | { readonly kind: "empty"; readonly explains: string; readonly action: SecondaryAction | null; readonly isSuccess: boolean }
  | { readonly kind: "error"; readonly whatFailed: string; readonly workPreserved: boolean; readonly action: SecondaryAction }
  /**
   * Offline has two shapes, and treating them as one produced a rule that
   * demanded an age from screens with nothing to age.
   *
   * A DEGRADED screen still shows something — cached offers, a held
   * reservation — and must label how old it is (§21). A BLOCKED screen shows
   * nothing, because the thing it does cannot happen without a connection: a
   * verification SMS leaves now or not at all, and queueing one would strand a
   * patient waiting for a message nobody sent. Blueprint v3 names both, calling
   * them "Shows the last known responder state, age-labelled" and "Blocked with
   * a clear reason".
   */
  | { readonly kind: "offline"; readonly blocked: true; readonly because: string }
  | { readonly kind: "offline"; readonly blocked?: false; readonly readOnly: boolean; readonly showsAge: boolean }
  | { readonly kind: "permissionRefused"; readonly stillUsable: true; readonly alternative: string }
  | { readonly kind: "success"; readonly nextStep: SecondaryAction | null };

export type ScreenContract = {
  /** The Blueprint v3 screen id. The checker resolves it against phase0.js, so
   *  a contract for a screen the Blueprint does not contain fails the build. */
  readonly id: string;
  readonly location: Location;
  /** One sentence. If it cannot be stated in one, the screen does too much. */
  readonly purpose: string;
  readonly back: BackBehaviour;
  /** Null only where the screen genuinely offers no action — a terminal
   *  confirmation, a reference view. The checker requires a stated reason. */
  readonly primary: PrimaryAction | null;
  readonly noPrimaryBecause?: string;
  /**
   * A primary that depends on the state the screen is in, or `null` where that
   * state has nothing to offer.
   *
   * Still exactly one primary at any moment — this names WHICH one, not how
   * many. R7 is why it exists: waiting for a reply that has not been sent yet
   * and waiting for one that has are the same screen with different answers to
   * "what do I do next?", and «شوف العروض» on a request no pharmacy has
   * received leads to an empty list. A screen without this either renders the
   * wrong action in one state or splits into two screens the Blueprint does
   * not have.
   */
  readonly primaryWhen?: Readonly<Partial<Record<StateTreatment["kind"], PrimaryAction | null>>>;
  readonly secondary: readonly SecondaryAction[];
  readonly states: readonly StateTreatment[];
  /** Every destination reachable from here. A screen with no exit is a trap. */
  readonly exits: readonly string[];
  /** Business actions this screen emits, from the closed telemetry set. */
  readonly telemetry: readonly string[];
  /** Persona, so role isolation is visible in the contract itself. */
  readonly persona: "patient" | "pharmacy" | "owner" | "entry";
};

/**
 * Structural audit of a single contract. Returns the reasons it is not
 * finished; an empty array means it satisfies every checkable UX rule.
 */
export function auditContract(c: ScreenContract): readonly string[] {
  const p: string[] = [];

  if (!c.purpose.trim()) p.push(`${c.id}: no purpose — the user cannot be told why they are here`);
  if (c.purpose.split(/[.!؟?]/).filter((s) => s.trim()).length > 1)
    p.push(`${c.id}: purpose is more than one sentence — the screen probably does too much`);
  if (!c.location.title.trim()) p.push(`${c.id}: no title — "where am I?" is unanswerable`);

  if (!c.primary && !c.noPrimaryBecause)
    p.push(`${c.id}: no primary action and no stated reason — "what do I do next?" is unanswerable`);
  if (c.primary && c.primary.tapsToOutcome < 1)
    p.push(`${c.id}: primary action claims fewer than one tap`);
  for (const [kind, alt] of Object.entries(c.primaryWhen ?? {})) {
    // `null` says this state offers nothing, which is a real answer: R7 while
    // no pharmacy has replied has nothing for the patient to press, and a
    // button labelled "see the offer" over zero offers is a lie.
    if (alt === null) {
      if (!c.states.some((s) => s.kind === kind))
        p.push(`${c.id}: a primary is declared for the ${kind} state, which this screen does not declare`);
      continue;
    }
    // A state-scoped primary is held to every rule the screen-wide one is: it
    // is the primary while that state lasts.
    if (alt.tapsToOutcome < 1)
      p.push(`${c.id}: the ${kind} primary claims fewer than one tap`);
    if (!c.exits.includes(alt.leadsTo))
      p.push(`${c.id}: the ${kind} primary leads to ${alt.leadsTo}, which is not a declared exit`);
    if (!c.states.some((s) => s.kind === kind))
      p.push(`${c.id}: a primary is declared for the ${kind} state, which this screen does not declare`);
  }

  // A dead end: nowhere to go and no way back.
  if (c.exits.length === 0 && c.back.kind === "none")
    p.push(`${c.id}: no exits and no back — this is a navigation trap`);

  if (c.back.kind === "none" && !c.back.why.trim())
    p.push(`${c.id}: back is disabled with no stated reason`);

  // §22 — an empty state that is not a success must offer something to do.
  for (const s of c.states) {
    if (s.kind === "empty") {
      if (!s.explains.trim()) p.push(`${c.id}: empty state explains nothing (§22)`);
      if (!s.isSuccess && !s.action)
        p.push(`${c.id}: empty state with no action — §22 requires one thing to do`);
    }
    // §23 — every error answers what failed, whether work survived, what to press.
    if (s.kind === "error") {
      if (!s.whatFailed.trim() || /something went wrong/i.test(s.whatFailed))
        p.push(`${c.id}: error state does not name what failed (§23)`);
      if (!s.action.label.trim()) p.push(`${c.id}: error state offers no action (§23)`);
    }
    // A blocked offline state displays nothing, so there is nothing to age.
    // It owes a REASON instead, and the audit holds it to that.
    if (s.kind === "offline" && s.blocked === true && !s.because.trim())
      p.push(`${c.id}: offline state blocks the screen without saying why (§21)`);
    if (s.kind === "offline" && s.blocked !== true && !s.showsAge)
      p.push(`${c.id}: offline state does not show the age of what it displays (§21)`);
  }

  // Secondary actions must not outnumber the primary's prominence. Three is the
  // point at which a screen stops having an obvious next step.
  if (c.secondary.length > 3)
    p.push(`${c.id}: ${c.secondary.length} secondary actions compete with the primary`);

  return p;
}
