/**
 * The patient app's state, as one pure reducer.
 *
 * @blueprint §4 · §5 rule 1 · D26 · D27 · R1 · R6 · R7 · F1 · F2 · request.broadcast · search.unmatched · clinical.gate.refused
 * @owner patient-app
 * @why Everything that decides what the user sees lives here so that all of it
 *      is testable without a device: navigation, guards, the draft, the
 *      outbox, and which telemetry the action emits. `dispatch` returns the
 *      next state AND the effects to perform rather than performing them,
 *      which is what makes "the user tapped send while offline" a test rather
 *      than a manual check on a phone with aeroplane mode on.
 *
 *      Two rules shape it. §5 rule 1: a guard here decides only what is SHOWN;
 *      the server refuses regardless, and this file contains no permission
 *      logic of its own — it asks `runGuards`. D26: an interruption stores the
 *      intent, so being asked to sign in never costs the user their work.
 */
import { type Instant, instant, type Refusal, MarketplaceMachines } from "@dawai/domain";
import { empty as emptyOutbox, type Outbox } from "@dawai/offline";
import { runGuards, ROUTE_GUARDS, guardDestinations, buildGraph, resolveBack, type NavGraph } from "@dawai/navigation";
import { guest, interrupt, takePending, authenticate, type Session } from "@dawai/session";
import type { ScreenContract } from "@dawai/design";
import { BUSINESS_EVENT } from "@dawai/observability";
import * as Search from "../model/search.js";
import * as Offers from "../model/offers.js";
import * as Reservation from "../model/reservation.js";
import * as Consent from "../model/consent.js";
import * as Prescription from "../model/prescription.js";
import * as DraftModel from "../model/draft.js";
import { send, type Sent } from "../model/send.js";
import { CORE_LOOP } from "../screens/core-loop.contract.js";
import type { CatalogueHit, Environment, Fetched, SearchResponse } from "../ports.js";

export type AppState = {
  readonly session: Session;
  readonly screen: string;
  /** The stack beneath the current screen. Back is resolved against this. */
  readonly history: readonly string[];
  readonly search: Search.SearchState;
  readonly draft: DraftModel.Draft | null;
  readonly outbox: Outbox;
  readonly sent: Sent | null;
  /** Offers as they arrive. Summarised for display only — the order they are
   *  READ in is computed at render, never stored, so nothing reshuffles
   *  underneath a patient who is mid-comparison. */
  readonly offers: readonly Offers.Offer[];
  /** Set when the offer a patient tapped had already left the list. R8's error
   *  state exists for exactly this, and it names the pharmacy. */
  readonly staleOffer: string | null;
  readonly reservation: Reservation.ReservationView | null;
  readonly reservationState: MarketplaceMachines.ReservationState | null;
  /** R2/R3 — the photograph, which is not attached until the patient says it
   *  is readable. Phase 0 reads nothing (D18). */
  readonly capture: Prescription.Capture;
  /** R9/R10 — the substitution decisions for the offer being examined. Never
   *  pre-ticked; an offer cannot be accepted while any are undecided. */
  readonly consent: Consent.ConsentState | null;
  /** The last domain refusal, held so the screen can show it inline and clear
   *  it deliberately. Never rendered as a code — the screen words it. */
  readonly refusal: Refusal | null;
  /** Set when a guard sent the user somewhere they did not ask to go, so the
   *  destination can say why rather than appearing for no reason. */
  readonly redirectBecause: string | null;
};

export type Effect =
  | { readonly kind: "search"; readonly query: string }
  | { readonly kind: "emit"; readonly event: string; readonly attributes: Readonly<Record<string, string | number | boolean>> }
  /** The outbox has work. Delivery is infrastructure's job, not the store's. */
  | { readonly kind: "flushOutbox" }
  | { readonly kind: "capturePrescription" };

export type Intent =
  | { readonly kind: "open"; readonly screen: string }
  | { readonly kind: "back" }
  | { readonly kind: "typed"; readonly raw: string }
  | { readonly kind: "searchResolved"; readonly query: string; readonly result: Fetched<SearchResponse> }
  | { readonly kind: "addItem"; readonly hit: CatalogueHit }
  | { readonly kind: "removeLine"; readonly itemId: string }
  | { readonly kind: "setPacks"; readonly itemId: string; readonly packs: number }
  | { readonly kind: "setUrgency"; readonly urgency: DraftModel.Draft["urgency"] }
  | { readonly kind: "setSubject"; readonly subjectId: string }
  | { readonly kind: "attachPrescription"; readonly imageId: string }
  | { readonly kind: "send"; readonly at: Instant }
  | { readonly kind: "authenticated"; readonly accountId: string; readonly subjectId: string }
  | { readonly kind: "offerArrived"; readonly offer: Offers.Offer }
  | { readonly kind: "chooseOffer"; readonly offerId: string }
  | { readonly kind: "holdConfirmed"; readonly hold: Reservation.Hold }
  | { readonly kind: "holdRefused"; readonly branchName: string; readonly reopened: boolean }
  | { readonly kind: "cameraPermission"; readonly permission: Prescription.CameraPermission }
  | { readonly kind: "capture" }
  | { readonly kind: "captured"; readonly imageId: string; readonly localUri: string }
  | { readonly kind: "confirmPhoto" }
  | { readonly kind: "retakePhoto" }
  | { readonly kind: "openOffer"; readonly offerId: string }
  | { readonly kind: "decideSubstitution"; readonly requestLineId: string; readonly decision: "agreed" | "refused" }
  | { readonly kind: "dismissRefusal" };

export type Step = { readonly state: AppState; readonly effects: readonly Effect[] };

const CONTRACTS: ReadonlyMap<string, ScreenContract> = new Map(CORE_LOOP.map((c) => [c.id, c]));

/** Built once from the contracts, so navigation is never hand-wired. */
export const GRAPH: NavGraph = buildGraph(
  CORE_LOOP.map((c) => ({ id: c.id, exits: c.exits, back: c.back, destination: c.location.destination })),
  // A guard destination is arrived at without any screen exiting to it.
  guardDestinations(ROUTE_GUARDS),
);

/** Whether a screen exists in this build. Blueprint v3 has 133 patient-side
 *  screens and this slice contracts 17 of them; the rest arrive with their
 *  slice. Nothing renders a control that leads to a screen that is not here —
 *  a button that does nothing is the defect this check exists to prevent, and
 *  the set shrinks to empty as the remaining slices land. */
export const isBuilt = (screen: string): boolean => CONTRACTS.has(screen);

/** Every exit the contracts declare that this build cannot yet honour. Each
 *  one is a real Blueprint v3 screen — ux-check proves that — and each is
 *  owned by a later slice. Listed so the gap is countable rather than
 *  discovered by a user pressing something inert. */
export const NOT_YET_BUILT: readonly string[] = [...new Set(
  CORE_LOOP.flatMap((c) => c.exits).filter((e) => !CONTRACTS.has(e)),
)].sort();

/** A cold start: a guest on Today, with nothing in flight. The district is not
 *  state — it arrives with `Authority` on every dispatch, because it is a fact
 *  about the account rather than a fact about the screen. */
export function initial(): AppState {
  return {
    session: guest(),
    screen: "S1",
    history: [],
    search: Search.idle(),
    draft: null,
    outbox: emptyOutbox(),
    sent: null,
    offers: [],
    staleOffer: null,
    reservation: null,
    reservationState: null,
    capture: Prescription.ready(),
    consent: null,
    refusal: null,
    redirectBecause: null,
  };
}

/** The shape guards read. Assembled from the session and the domain's answer —
 *  never computed here (Rule 4). */
function guardShape(s: AppState, hasOrderScope: boolean, memorialised: boolean) {
  return {
    authenticated: s.session.state === "authenticated",
    activeSubjectMemorialised: memorialised,
    hasOrderScope,
  };
}

export type Authority = {
  /** Supplied by the caller from the domain's `Authority.authorise` answer for
   *  the active subject. The store never derives a permission. */
  readonly hasOrderScope: boolean;
  readonly activeSubjectMemorialised: boolean;
  readonly districtId: string;
};

export function dispatch(state: AppState, intent: Intent, env: Environment, authority: Authority): Step {
  switch (intent.kind) {
    case "open":
      // A control leading somewhere this build does not contain is never
      // rendered, so this is defence rather than a path a user can take.
      return isBuilt(intent.screen) ? open(state, intent.screen, authority) : { state, effects: [] };

    case "back": {
      const result = resolveBack(GRAPH, state.screen, state.history);
      switch (result.kind) {
        case "pop":
          return { state: { ...state, screen: result.to, history: state.history.slice(0, -1), redirectBecause: null }, effects: [] };
        case "replace":
          return { state: { ...state, screen: result.to, history: [], redirectBecause: null }, effects: [] };
        // A trap is impossible by contract, and "stay" is the correct answer at
        // a tab root rather than a silent no-op that looks like a broken button.
        case "stay":
        case "exitApp":
          return { state, effects: [] };
      }
    }

    case "typed": {
      const next = Search.typed(intent.raw);
      return {
        state: { ...state, search: next },
        effects: next.kind === "loading" ? [{ kind: "search", query: next.query }] : [],
      };
    }

    case "searchResolved": {
      const next = Search.resolved(state.search, intent.query, intent.result);
      const effects: Effect[] = [];
      // §13.1 — a miss grows the catalogue. A failure does not.
      if (Search.shouldReportUnmatched(next) && !Search.shouldReportUnmatched(state.search))
        effects.push({ kind: "emit", event: BUSINESS_EVENT.SEARCH_UNMATCHED, attributes: { query: intent.query } });
      return { state: { ...state, search: next }, effects };
    }

    case "addItem": {
      const draft = state.draft ?? DraftModel.newDraft(subjectOf(state), authority.districtId);
      const { draft: next, refusal } = DraftModel.add(draft, intent.hit);
      if (refusal)
        return {
          state: { ...state, refusal },
          effects: [{ kind: "emit", event: BUSINESS_EVENT.CLINICAL_GATE_REFUSED, attributes: { code: refusal.code, item: intent.hit.itemId } }],
        };
      // The draft screen is where the patient can see what they have. Going
      // anywhere else after adding hides the thing they just did.
      return { state: navigate({ ...state, draft: next, refusal: null }, "R1"), effects: [] };
    }

    case "removeLine": {
      if (!state.draft) return { state, effects: [] };
      return { state: { ...state, draft: DraftModel.remove(state.draft, intent.itemId) }, effects: [] };
    }

    case "setPacks": {
      if (!state.draft) return { state, effects: [] };
      const { draft, refusal } = DraftModel.setPacks(state.draft, intent.itemId, intent.packs);
      return { state: { ...state, draft, refusal }, effects: [] };
    }

    case "setUrgency":
      return state.draft
        ? { state: { ...state, draft: DraftModel.setUrgency(state.draft, intent.urgency) }, effects: [] }
        : { state, effects: [] };

    case "setSubject":
      return state.draft
        ? { state: { ...state, draft: DraftModel.setSubject(state.draft, intent.subjectId) }, effects: [] }
        : { state, effects: [] };

    case "attachPrescription":
      return state.draft
        ? { state: { ...state, draft: DraftModel.attachPrescription(state.draft, intent.imageId), refusal: null }, effects: [] }
        : { state, effects: [] };

    case "send": return doSend(state, intent.at, env, authority);

    case "authenticated": {
      const session = authenticate(state.session, intent.accountId, intent.subjectId);
      // D26 — replay what they were doing, exactly once.
      const [pending, cleared] = takePending(session);
      const resumed: AppState = { ...state, session: cleared };
      if (!pending) return { state: resumed, effects: [] };
      return { state: navigate(resumed, pending.screen), effects: [] };
    }

    case "offerArrived": {
      // The first offer is the one worth announcing: it is the moment the wait
      // stops being open-ended. Later ones update the list silently.
      const first = state.offers.length === 0;
      const offers = state.offers.some((o) => o.offerId === intent.offer.offerId)
        ? state.offers.map((o) => (o.offerId === intent.offer.offerId ? intent.offer : o))
        : [...state.offers, intent.offer];
      return {
        state: { ...state, offers },
        effects: first
          ? [{ kind: "emit", event: BUSINESS_EVENT.REQUEST_ANSWERED, attributes: { offers: offers.length } }]
          : [],
      };
    }

    case "chooseOffer": {
      const offer = state.offers.find((o) => o.offerId === intent.offerId);
      if (!offer) return { state, effects: [] };

      // §4 R10 — an offer containing a substitution cannot be accepted until
      // every proposal has an explicit answer. This is the gate TD-5 was open
      // on: R8 could show the flag and the offer could be taken regardless.
      const hasSubstitution = offer.lines.some((l) => l.answer.kind === "substitute");
      if (hasSubstitution) {
        const consent = state.consent?.offerId === offer.offerId ? state.consent : null;
        const blocked = consent ? Consent.gate(consent) : { code: "SUBSTITUTION_NOT_ACKNOWLEDGED" as const };
        if (blocked)
          // Not a refusal the patient must dismiss — the decision lives on R9,
          // so send them to make it rather than telling them they cannot.
          return { state: openOfferDetail(state, offer), effects: [] };
      }

      const consentState = state.consent?.offerId === offer.offerId ? state.consent : null;
      const filled = offer.lines.filter((l) => l.answer.kind !== "unavailable").map((l) => l.requestLineId);
      const permitted = consentState ? Consent.linesToReserve(consentState, filled) : filled;
      const chosen = Offers.accept({ ...offer, lines: offer.lines.filter((l) => permitted.includes(l.requestLineId)) }, permitted);
      if (!chosen.ok)
        // An offer that left the list between render and tap is told plainly,
        // and the list stays — never a silent failure on the most consequential
        // tap in the product.
        return { state: { ...state, staleOffer: offer.branchName, refusal: chosen.refusal }, effects: [] };

      return {
        state: navigate({
          ...state,
          staleOffer: null, refusal: null,
          reservation: Reservation.requesting(offer.branchName),
          reservationState: "requested",
        }, "V1"),
        effects: [{ kind: "flushOutbox" }],
      };
    }

    case "holdConfirmed": {
      const moved = Reservation.confirmed(state.reservationState ?? "requested", intent.hold);
      if (!moved) return { state, effects: [] };
      return {
        state: navigate({ ...state, reservation: moved.view, reservationState: moved.state }, "V2"),
        effects: [{ kind: "emit", event: BUSINESS_EVENT.RESERVATION_CONFIRMED, attributes: { branch: intent.hold.branchName } }],
      };
    }

    case "holdRefused": {
      // D39 — the request re-opens automatically, so this is not the end of
      // the journey and the screen it lands on says so.
      const moved = Reservation.cannotHold(state.reservationState ?? "requested", intent.branchName, intent.reopened);
      if (!moved) return { state, effects: [] };
      return {
        state: navigate({ ...state, reservation: moved.view, reservationState: moved.state }, "V4"),
        effects: [{ kind: "emit", event: BUSINESS_EVENT.RESERVATION_REFUSED, attributes: { reopened: intent.reopened } }],
      };
    }

    case "cameraPermission":
      return { state: { ...state, capture: Prescription.fromPermission(intent.permission) }, effects: [] };

    case "capture":
      return { state: { ...state, capture: Prescription.capturing(state.capture) }, effects: [{ kind: "capturePrescription" }] };

    case "captured":
      // R3 — captured is NOT attached. The patient confirms legibility first,
      // because nothing in Phase 0 reads the prescription (D18).
      return { state: navigate({ ...state, capture: Prescription.captured(intent.imageId, intent.localUri) }, "R3"), effects: [] };

    case "confirmPhoto": {
      const done = Prescription.confirmed(state.capture);
      if (!done || !state.draft) return { state, effects: [] };
      return {
        state: navigate({
          ...state,
          draft: DraftModel.attachPrescription(state.draft, done.imageId),
          capture: { kind: "attached", imageId: done.imageId },
        }, "R1"),
        effects: [],
      };
    }

    case "retakePhoto":
      return { state: navigate({ ...state, capture: Prescription.retake() }, "R2"), effects: [] };

    case "openOffer": {
      const offer = state.offers.find((o) => o.offerId === intent.offerId);
      if (!offer) return { state, effects: [] };
      // §4 R10 — every substitution in this offer becomes an undecided
      // question. There is no path that produces an agreed decision here.
      const substitutions = Offers.substitutionsOf(offer);
      return { state: navigate({ ...state, consent: Consent.begin(offer.offerId, substitutions) }, "R9"), effects: [] };
    }

    case "decideSubstitution":
      return state.consent
        ? { state: { ...state, consent: Consent.decide(state.consent, intent.requestLineId, intent.decision) }, effects: [] }
        : { state, effects: [] };

    case "dismissRefusal":
      return { state: { ...state, refusal: null, staleOffer: null }, effects: [] };
  }
}

/** R9 with the substitution questions opened. Shared by the R8 tap and by the
 *  consent gate, so both land on the same screen in the same state. */
function openOfferDetail(state: AppState, offer: Offers.Offer): AppState {
  const substitutions = Offers.substitutionsOf(offer);
  const consent = state.consent?.offerId === offer.offerId ? state.consent : Consent.begin(offer.offerId, substitutions);
  return navigate({ ...state, consent }, "R9");
}

function subjectOf(state: AppState): string {
  return state.session.state === "authenticated" ? state.session.activeSubjectId : "";
}

/**
 * Land a guard refusal somewhere real.
 *
 * When the destination this build does not yet contain, the user stays where
 * they are and reads the reason. That is not a redesign of the guard — the
 * guard's verdict is unchanged and the server still refuses — it is the only
 * honest handling of a redirect this slice cannot draw. Navigating to a screen
 * with no contract would render nothing, which is worse than staying put with
 * an explanation.
 */
function redirect(state: AppState, to: string, because: string): AppState {
  return isBuilt(to)
    ? { ...navigate(state, to), redirectBecause: because }
    : { ...state, redirectBecause: because };
}

function navigate(state: AppState, screen: string): AppState {
  if (screen === state.screen) return state;
  const contract = CONTRACTS.get(screen);
  // A modal replaces rather than stacks when it is the root of its own
  // presentation; everything else pushes, so back has something to pop.
  const pushes = contract?.back.kind === "pop" || contract?.back.kind === "dismiss";
  return {
    ...state,
    screen,
    history: pushes ? [...state.history, state.screen] : [],
    redirectBecause: null,
  };
}

/**
 * Opening a screen runs its declared guards. A refusal is never a blank wall:
 * the user lands somewhere real with the reason, and if the reason was a
 * missing account, what they were doing is stored first (D26).
 */
function open(state: AppState, screen: string, authority: Authority): Step {
  const guards = ROUTE_GUARDS[screen] ?? [];
  const verdict = runGuards(guards, guardShape(state, authority.hasOrderScope, authority.activeSubjectMemorialised));
  if (verdict.allow) return { state: navigate(state, screen), effects: [] };

  const session = state.session.state === "authenticated"
    ? state.session
    : interrupt(state.session, {
        screen,
        draft: state.draft ? { lines: state.draft.lines.length } : {},
        startedAt: 0,
      });

  return { state: redirect({ ...state, session }, verdict.redirectTo, verdict.because), effects: [] };
}

function doSend(state: AppState, at: Instant, env: Environment, authority: Authority): Step {
  if (!state.draft) return { state, effects: [] };

  // §5 rule 1 — the guard runs again at the action, not only at the door. A
  // screen that was opened while permitted may be acted on after the grant was
  // revoked, and the disabled button on R6 is a courtesy, not a control.
  const verdict = runGuards(ROUTE_GUARDS["R6"] ?? [], guardShape(state, authority.hasOrderScope, authority.activeSubjectMemorialised));
  if (!verdict.allow)
    return { state: redirect(state, verdict.redirectTo, verdict.because), effects: [] };

  const result = send(state.draft, state.outbox, env, at);
  if (!result.ok) return { state: { ...state, refusal: result.refusal }, effects: [] };

  const { sent } = result;
  const effects: Effect[] = [{ kind: "flushOutbox" }];
  // request.broadcast is emitted when it is broadcast — not when it is queued.
  // Counting a queued request as broadcast would inflate O12 fill rate with
  // requests no pharmacy has seen.
  if (sent.state === "broadcast")
    effects.push({
      kind: "emit",
      event: BUSINESS_EVENT.REQUEST_BROADCAST,
      attributes: { urgency: state.draft.urgency, lines: state.draft.lines.length, district: authority.districtId },
    });

  return {
    state: navigate({ ...state, sent, outbox: sent.outbox, draft: null, refusal: null }, "R7"),
    effects,
  };
}

/** The clock the store reports to screens. Exposed so a countdown reads the
 *  same instant the reducer did rather than sampling its own. */
export const nowAsInstant = (env: Environment): Instant => instant(env.now());
