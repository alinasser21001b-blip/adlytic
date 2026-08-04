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
import { type Instant, instant, type Refusal, type RefusalCode, REFUSAL, MarketplaceMachines, Verification, transition, isErr } from "@dawai/domain";
import { empty as emptyOutbox, type Outbox } from "@dawai/offline";
import { runGuards, ROUTE_GUARDS, resolveBack, type RedirectReason } from "@dawai/navigation";
import { guest, interrupt, beginVerification, takePending, authenticate, type Session } from "@dawai/session";
import { BUSINESS_EVENT } from "@dawai/observability";
import * as Search from "../model/search.js";
import * as Offers from "../model/offers.js";
import * as Reservation from "../model/reservation.js";
import * as Consent from "../model/consent.js";
import * as Onboarding from "../model/onboarding.js";
import * as Prescription from "../model/prescription.js";
import * as DraftModel from "../model/draft.js";
import { send, type Sent } from "../model/send.js";
import { type ScreenId } from "../screens/core-loop.contract.js";
import { GRAPH, isBuilt, contractFor } from "../screens/graph.js";
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
  readonly redirectBecause: RedirectReason | null;
  /** E5–E8. One object because it is one conversation: the number typed on E5
   *  is the number E6 shows back, and the district chosen on E8 is the one the
   *  replayed request searches from. */
  readonly onboarding: OnboardingState;
  /** E8's submit is in flight. The screen shows it on the control, because a
   *  patient at the end of onboarding must not be able to send it twice. */
  readonly savingProfile: boolean;
};

export type OnboardingState = {
  /** Exactly what the patient typed, not what we parsed. A field that rewrites
   *  keystrokes is a field people fight. */
  readonly phoneTyped: string;
  /** The challenge the SERVER issued. Null until it has. */
  readonly challenge: Verification.Challenge | null;
  readonly codeTyped: string;
  /** In flight to the server. The screen shows it on the control, not as a
   *  screen-wide spinner. */
  readonly checking: boolean;
  /** The last refusal the server gave, held so E6 can word it. Never computed
   *  here: attempts and expiry are the server's answer, not the client's. */
  readonly codeRefusal: RefusalCode | null;
  readonly nameTyped: string;
  readonly districtQuery: string;
  readonly districtChosen: string | null;
};

const NO_ONBOARDING: OnboardingState = {
  phoneTyped: "", challenge: null, codeTyped: "", checking: false,
  codeRefusal: null, nameTyped: "", districtQuery: "", districtChosen: null,
};

export type Effect =
  | { readonly kind: "search"; readonly query: string }
  | { readonly kind: "emit"; readonly event: string; readonly attributes: Readonly<Record<string, string | number | boolean>> }
  /**
   * The outbox has work, and here it is.
   *
   * It CARRIES the outbox. Delivery is infrastructure's job and the queue is
   * the store's, and the effect used to say only "there is work" — so the
   * runtime flushed an outbox of its own that the reducer had never touched.
   * It was always empty, so `readyToSend` returned nothing and every request a
   * patient ever sent was delivered nowhere. R7 said «انرسل» on the store's
   * own optimistic state and no POST was ever made.
   */
  | { readonly kind: "flushOutbox"; readonly outbox: Outbox }
  | { readonly kind: "capturePrescription" }
  /** Ask the identity service to send an SMS. Delivery is infrastructure's
   *  job; the store only says that it should happen. */
  | { readonly kind: "requestCode"; readonly e164: string }
  | { readonly kind: "verifyCode"; readonly challengeId: string; readonly code: string }
  /**
   * Take this offer, on these lines.
   *
   * The lines are the CONSENT decisions, already resolved: a substitution the
   * patient refused is not in the list, and D06 sends that line to a child
   * request. `substitutionAcknowledged` is §4 R10's acknowledgement, and the
   * server refuses without it — the client gate is a courtesy, the server's is
   * the control (§5 rule 1).
   *
   * The idempotency key is minted HERE, once, by the reducer that decided to
   * accept. Minting it in the transport would produce a new key on every
   * attempt, and the contract's third rule — replaying a state-changing call
   * returns the original result — is exactly what stops a retry from becoming
   * a second reservation at a second pharmacy.
   */
  | {
      readonly kind: "acceptOffer";
      readonly offerId: string;
      readonly acceptedLineIds: readonly string[];
      readonly substitutionAcknowledged: boolean;
      readonly idempotencyKey: string;
    }
  /**
   * The end of onboarding, sent as one call.
   *
   * PATCH /v1/me takes `{ name?, districtId? }` and this sends both together:
   * two calls would leave an account with a name and no district if the second
   * one failed, and the district is what every request this account makes will
   * search from.
   */
  | { readonly kind: "saveProfile"; readonly name: string; readonly districtId: string }
  /**
   * Send the photograph — POST /v1/prescriptions, §4 R2.
   *
   * The LOCAL uri travels, not the bytes: the store holds values, and turning
   * a uri into bytes is a platform question that belongs behind the port. The
   * subject is on the request because the contract takes it and because a
   * prescription belongs to the person it was written for, not to the account
   * that photographed it.
   */
  | { readonly kind: "uploadPrescription"; readonly localUri: string; readonly subjectId: string };

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
  /** The camera returned. A local uri and nothing else — an `imageId` does not
   *  exist until the media service mints one. */
  | { readonly kind: "captured"; readonly localUri: string }
  /** POST /v1/prescriptions refused or could not be reached. R2 keeps the
   *  photograph and says what it was. */
  | { readonly kind: "uploadFailed"; readonly reason: string }
  | { readonly kind: "confirmPhoto" }
  | { readonly kind: "retakePhoto" }
  | { readonly kind: "openOffer"; readonly offerId: string }
  | { readonly kind: "decideSubstitution"; readonly requestLineId: string; readonly decision: "agreed" | "refused" }
  | { readonly kind: "dismissRefusal" }
  /** The offer is gone — the server's word, not the client's guess. R8 names
   *  the pharmacy and says which of the two happened. */
  | { readonly kind: "offerGone"; readonly offerId: string; readonly why: RefusalCode }
  /** What the flusher made of the queue: attempts spent, items accepted,
   *  rejected or requeued. The store owns the outbox, so a delivery attempt
   *  reports back rather than mutating it from outside. */
  | { readonly kind: "outboxChanged"; readonly outbox: Outbox }
  /** The server accepted the name and district. Onboarding is over, and D26's
   *  preserved action resumes from here rather than from verification. */
  | { readonly kind: "profileSaved"; readonly name: string; readonly districtId: string }
  /** It refused. `invalid_district` is the one declared error. */
  | { readonly kind: "profileRefused"; readonly why: RefusalCode }
  /** The call never completed. Distinct from a refusal because borrowing one
   *  would blame a patient for a dropped connection — see TD-25. */
  | { readonly kind: "profileSaveFailed" }

  /* E5–E8. Typing and submitting are separate intents because they are
     separate events: one is the patient composing, the other is them
     committing, and collapsing them would send a code request per keystroke. */
  | { readonly kind: "typePhone"; readonly raw: string }
  | { readonly kind: "submitPhone" }
  /** The server issued a challenge. The client never mints one. */
  | { readonly kind: "codeIssued"; readonly challengeId: string; readonly at: Instant }
  | { readonly kind: "typeCode"; readonly raw: string }
  | { readonly kind: "submitCode"; readonly at: Instant }
  /** The server judged the code, and its judgement travels AS a judgement.
   *  The client never re-derives it: re-running the expiry or attempt rules
   *  here would be a second judge, and the first version of this intent did
   *  exactly that — it carried a boolean and a timestamp and faked the clock
   *  to make the domain agree, which is a lie in transit. `attemptsLeft` is
   *  the server's count, mirrored into the challenge so E6 states it. */
  /** The server's judgement of ONE challenge. The id travels with it because a
   *  verdict that cannot say which code it judged will be applied to whichever
   *  challenge happens to be current. */
  | { readonly kind: "codeJudged"; readonly challengeId: string; readonly verdict: "correct" | "expired" | "exhausted" }
  /** A wrong code MUST carry the server's remaining count. It was optional, and
   *  the reducer read a missing one as `?? 0` — which it treats as exhaustion,
   *  so an omitted number told a patient their attempts were gone on the first
   *  wrong digit. The count is the server's to state; a verdict that cannot
   *  state it is not this verdict. */
  | { readonly kind: "codeJudged"; readonly challengeId: string; readonly verdict: "wrong"; readonly attemptsLeft: number }
  /** The check never reached a verdict — the connection dropped, the server
   *  timed out, or it answered outside its own contract. NOT a verdict: the
   *  code has not been judged, so no attempt is spent and nothing is said
   *  about whether it was right. */
  | { readonly kind: "codeCheckFailed"; readonly challengeId: string }
  | { readonly kind: "resendCode" }
  | { readonly kind: "typeName"; readonly raw: string }
  | { readonly kind: "submitName" }
  | { readonly kind: "searchDistrict"; readonly raw: string }
  | { readonly kind: "chooseDistrict"; readonly districtId: string }
  | { readonly kind: "submitDistrict"; readonly districts: readonly Onboarding.District[] };

export type Step = { readonly state: AppState; readonly effects: readonly Effect[] };

/* The graph, the built-screen test and the unbuilt-exit list are properties of
 * the CONTRACTS, not of the reducer. They live beside the contracts and are
 * re-exported here for the app root and the review tooling, which have always
 * asked the store for them. */
export { GRAPH, isBuilt, NOT_YET_BUILT, NOT_DRAWN } from "../screens/graph.js";

/** A cold start: a guest on Today, with nothing in flight. The district is not
 *  state — it arrives with `Authority` on every dispatch, because it is a fact
 *  about the account rather than a fact about the screen. */
export function initial(): AppState {
  return {
    session: guest(),
    onboarding: NO_ONBOARDING,
    savingProfile: false,
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
        case "replace": {
          /**
           * Leaving an INTERRUPTION returns you to what it interrupted.
           *
           * E4 states this in its own contract, in words, beside `back`:
           * "Dismiss, not pop: the action the patient was taking is preserved
           * (D26), so leaving returns them to it rather than unwinding a
           * stack." A contract's `back` can only name one fixed screen, so
           * `returnsTo` says S1 — and the control labelled «مو هسه — رجعني
           * لطلبي» sent a patient to Today's stand-in instead of the request
           * it had just named back to them.
           *
           * A preserved action is what distinguishes the two cases, and the
           * guard put it there on the way in. R7 dismisses with nothing
           * pending and still lands exactly where the graph says; E4 dismisses
           * with a pending action and lands on the screen the patient was
           * using when the guard stopped them.
           *
           * The pending intent itself is NOT the destination: it records the
           * screen the guard REFUSED, which is where D26 replays them after
           * they sign in. Sending them there now would push them forward into
           * the refusal they just declined.
           */
          const from = state.history[state.history.length - 1];
          if (state.session.pending !== null && from !== undefined)
            return { state: { ...state, screen: from, history: state.history.slice(0, -1), redirectBecause: null }, effects: [] };
          return { state: { ...state, screen: result.to, history: [], redirectBecause: null }, effects: [] };
        }
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

    case "send": return doSend(state, intent.at, env, authority);

    case "authenticated": {
      /**
       * Verified — and not yet finished.
       *
       * The account exists from this moment (§9: the self Subject is created
       * atomically with it), so the session authenticates here. What does NOT
       * happen here any more is D26's replay. Blueprint v3 draws E6 → E7 → E8
       * and D26 says the interrupted action resumes; which comes first was
       * stated nowhere, and product answered: the name and the district first.
       *
       * That answer is why this used to be the end of sign-in. It replayed
       * immediately, so E7 and E8 were unreachable, a patient never gave their
       * name — the name E4 promises the pharmacy will see — and every request
       * went out with `districtId: ""`.
       */
      return { state: navigate({ ...state, session: authenticate(state.session, intent.accountId, intent.subjectId) }, "E7"), effects: [] };
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
      // The rule itself is Consent's; the reducer only routes its answer.
      const consented = Consent.acceptance(offer, state.consent);
      if (consented.kind === "blocked")
        // Not a refusal the patient must dismiss — the decision lives on R9,
        // so send them to make it rather than telling them they cannot.
        return { state: openOfferDetail(state, offer), effects: [] };

      const permitted = consented.lineIds;
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
        // The acceptance, actually made. `chosen.acceptance` was computed and
        // discarded here — the reducer worked out exactly which lines the
        // patient had agreed to and then emitted a flush of an outbox nothing
        // had been added to, so V1 waited for an answer to a call nobody made.
        effects: [{
          kind: "acceptOffer",
          offerId: offer.offerId,
          acceptedLineIds: chosen.acceptance.outcome.reservedLineIds,
          // §4 R10 — true only when there was something to acknowledge AND the
          // patient answered every proposal. `Consent.acceptance` has already
          // refused the alternative, so this reports a fact rather than
          // asserting one.
          substitutionAcknowledged: Offers.substitutionsOf(offer).length > 0,
          idempotencyKey: env.newId(),
        }],
      };
    }

    case "holdConfirmed": {
      // No reservation in flight means this event belongs to nothing we hold.
      // The previous `?? "requested"` INVENTED the machine state the transition
      // needed, which let a stray or replayed server event manufacture a held
      // reservation the patient never asked for — and V2 would then show a
      // pickup code for it. A machine state is either known or the event is not
      // ours; there is no third answer, and guessing one is inventing a state
      // transition.
      if (state.reservationState === null) return { state, effects: [] };
      const moved = Reservation.confirmed(state.reservationState, intent.hold);
      if (!moved) return { state, effects: [] };
      return {
        state: navigate({ ...state, reservation: moved.view, reservationState: moved.state }, "V2"),
        effects: [{ kind: "emit", event: BUSINESS_EVENT.RESERVATION_CONFIRMED, attributes: { branch: intent.hold.branchName } }],
      };
    }

    case "holdRefused": {
      // D39 — the request re-opens automatically, so this is not the end of
      // the journey and the screen it lands on says so.
      if (state.reservationState === null) return { state, effects: [] };
      const moved = Reservation.cannotHold(state.reservationState, intent.branchName, intent.reopened);
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
      return { state: navigate({ ...state, capture: Prescription.captured(intent.localUri) }, "R3"), effects: [] };

    case "confirmPhoto": {
      /**
       * The patient said it is readable — and that is when it is SENT.
       *
       * This used to attach an `imageId` the host had supplied, so the
       * photograph became part of the request without ever leaving the device.
       * The id is minted by POST /v1/prescriptions; until it answers there is
       * nothing to attach, and R2's own `failed` state has always said so:
       * "the upload failed, the image survives, only the send did not".
       */
      const done = Prescription.confirmed(state.capture);
      if (!done || !state.draft) return { state, effects: [] };
      return {
        state: { ...state, capture: Prescription.uploading(state.capture) },
        effects: [{ kind: "uploadPrescription", localUri: done.localUri, subjectId: state.draft.subjectId }],
      };
    }

    case "attachPrescription": {
      // The media service answered. Only now does the draft carry it, and only
      // now does R1 get the patient back.
      if (!state.draft) return { state, effects: [] };
      return {
        state: navigate({
          ...state,
          draft: DraftModel.attachPrescription(state.draft, intent.imageId),
          capture: Prescription.attached(intent.imageId),
          refusal: null,
        }, "R1"),
        effects: [],
      };
    }

    case "uploadFailed":
      // R2's declared error state. The photograph is kept — a patient who has
      // already held a piece of paper up to a camera must not be asked to do
      // it again because a connection dropped.
      return { state: { ...state, capture: Prescription.failed(state.capture, intent.reason) }, effects: [] };

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

    /* ── E5–E8 ────────────────────────────────────────────────────────── */

    case "typePhone":
      // Held verbatim. The parse happens at render so the screen can decide
      // when a partial number is "wrong yet", which is not the store's call.
      return { state: { ...state, onboarding: { ...state.onboarding, phoneTyped: intent.raw } }, effects: [] };

    case "submitPhone": {
      const parsed = Onboarding.parsePhone(state.onboarding.phoneTyped);
      // The refusal is the domain's, and the screen words it. A malformed
      // number never leaves the device.
      if (!parsed.value) return { state: { ...state, refusal: parsed.refusal }, effects: [] };
      return {
        state: navigate({ ...state, refusal: null }, "E6"),
        effects: [{ kind: "requestCode", e164: parsed.value.e164 }],
      };
    }

    case "codeIssued": {
      // §6 Session — the session moves to authenticating with the server's
      // challenge id. The client does not invent one.
      const challenge: Verification.Challenge = {
        challengeId: intent.challengeId, state: "sent", used: 0, issuedAt: intent.at,
      };
      return {
        state: {
          ...state,
          session: beginVerification(state.session, intent.challengeId),
          onboarding: { ...state.onboarding, challenge, codeTyped: "", codeRefusal: null, checking: false },
        },
        effects: [],
      };
    }

    case "typeCode":
      return {
        state: {
          ...state,
          onboarding: {
            ...state.onboarding,
            codeTyped: Onboarding.cleanCode(intent.raw),
            // Typing clears the last refusal: the patient is answering it.
            codeRefusal: null,
          },
        },
        effects: [],
      };

    case "submitCode": {
      const { challenge, codeTyped } = state.onboarding;
      if (!challenge || !Onboarding.codeComplete(codeTyped)) return { state, effects: [] };
      return {
        state: { ...state, onboarding: { ...state.onboarding, checking: true } },
        effects: [{ kind: "verifyCode", challengeId: challenge.challengeId, code: codeTyped }],
      };
    }

    case "codeCheckFailed": {
      // Stop the spinner, and nothing else. E6 sets `checking` when it submits
      // and only a verdict cleared it, so a submission that never produced one
      // left the screen loading forever — on the screen between a patient and
      // their account, with the button disabled and no sentence explaining it.
      //
      // No refusal is set: E6's declared error is «الرمز مو صحيح», which is
      // true of exactly one of its four failures and is NOT true here. A
      // patient offline sees the offline treatment the contract declares; a
      // patient online sees a re-enabled button and can press it again.
      const { challenge } = state.onboarding;
      if (!challenge || intent.challengeId !== challenge.challengeId) return { state, effects: [] };
      return { state: { ...state, onboarding: { ...state.onboarding, checking: false } }, effects: [] };
    }

    case "codeJudged": {
      const { challenge } = state.onboarding;
      if (!challenge) return { state, effects: [] };
      // A verdict for a challenge that is no longer current is not ours. It
      // arrives whenever a patient presses resend while a submission is still
      // in flight: the old challenge's «wrong» would land on the new one and
      // spend an attempt the patient never made, and the sentence on E6 would
      // count down attempts against a code that has not been judged at all.
      if (intent.challengeId !== challenge.challengeId) return { state, effects: [] };
      const done = (c: Verification.Challenge, refusal: RefusalCode | null) => ({
        state: { ...state, onboarding: { ...state.onboarding, challenge: c, checking: false, codeRefusal: refusal } },
        effects: [] as Effect[],
      });
      // Every move still goes through the published machine (Rule 5) — the
      // server picked the EDGE, but only edges the machine contains exist.
      const move = (on: Verification.ChallengeEvent) => transition(Verification.ChallengeMachine, challenge.state, on);
      switch (intent.verdict) {
        case "correct": {
          const moved = move("correctCode");
          if (isErr(moved)) return done(challenge, moved.error.code);
          const verified = done({ ...challenge, state: moved.value }, null);
          return { state: navigate(verified.state, "E7"), effects: verified.effects };
        }
        case "wrong": {
          const left = intent.attemptsLeft;
          if (left <= 0) {
            const moved = move("attemptsExhausted");
            return done(isErr(moved) ? challenge : { ...challenge, state: moved.value, used: Verification.MAX_ATTEMPTS }, REFUSAL.ATTEMPTS_EXHAUSTED);
          }
          const moved = move("wrongCode");
          // The server's count is authoritative; `used` mirrors it so the
          // domain's attemptsLeft and the screen's sentence cannot disagree.
          return done(isErr(moved) ? challenge : { ...challenge, state: moved.value, used: Verification.MAX_ATTEMPTS - left }, REFUSAL.WRONG_CODE);
        }
        case "expired": {
          const moved = move("timePassed");
          return done(isErr(moved) ? challenge : { ...challenge, state: moved.value }, REFUSAL.CODE_EXPIRED);
        }
        case "exhausted": {
          const moved = move("attemptsExhausted");
          return done(isErr(moved) ? challenge : { ...challenge, state: moved.value, used: Verification.MAX_ATTEMPTS }, REFUSAL.ATTEMPTS_EXHAUSTED);
        }
      }
    }

    case "resendCode": {
      const parsed = Onboarding.parsePhone(state.onboarding.phoneTyped);
      if (!parsed.value) return { state, effects: [] };
      // A resend is a NEW challenge, never a revived one.
      return {
        state: { ...state, onboarding: { ...state.onboarding, challenge: null, codeTyped: "", codeRefusal: null } },
        effects: [{ kind: "requestCode", e164: parsed.value.e164 }],
      };
    }

    case "typeName":
      return { state: { ...state, onboarding: { ...state.onboarding, nameTyped: intent.raw } }, effects: [] };

    case "submitName": {
      const checked = Onboarding.checkName(state.onboarding.nameTyped);
      if (!checked.value) return { state: { ...state, refusal: checked.refusal }, effects: [] };
      // The CLEANED name, kept — trimmed and collapsed and nothing else, which
      // is what a pharmacist will read off a counter. It is sent with the
      // district in one call, because PATCH /v1/me takes both and two calls
      // would leave an account that has a name and no district if the second
      // one failed.
      return {
        state: navigate({ ...state, refusal: null, onboarding: { ...state.onboarding, nameTyped: checked.value } }, "E8"),
        effects: [],
      };
    }

    case "searchDistrict":
      return { state: { ...state, onboarding: { ...state.onboarding, districtQuery: intent.raw } }, effects: [] };

    case "chooseDistrict":
      return { state: { ...state, onboarding: { ...state.onboarding, districtChosen: intent.districtId }, refusal: null }, effects: [] };

    case "submitDistrict": {
      const checked = Onboarding.checkDistrict(state.onboarding.districtChosen, intent.districts);
      // OUTSIDE_COVERAGE is E12's case and is not the patient's mistake; the
      // screen says so. Either way nothing is authenticated on a bad district.
      if (!checked.value) return { state: { ...state, refusal: checked.refusal }, effects: [] };
      // The end of onboarding, and the only place both answers exist at once.
      return {
        state: { ...state, refusal: null, savingProfile: true },
        effects: [{ kind: "saveProfile", name: state.onboarding.nameTyped, districtId: checked.value.districtId }],
      };
    }

    case "profileSaved": {
      /**
       * D26's replay, now that onboarding is done.
       *
       * The district reaches the DRAFT as well as the session: a guest builds
       * a request before there is an account to attach one to, so `newDraft`
       * gave it `districtId: ""` and nothing later corrected it. The request
       * that replays here is that same draft.
       */
      const withDistrict = state.draft ? DraftModel.setDistrict(state.draft, intent.districtId) : null;
      const [pending, cleared] = takePending(state.session);
      const done: AppState = { ...state, session: cleared, draft: withDistrict, savingProfile: false };
      // A pending screen survives a reinstall and an app update, so it may name
      // a screen this build no longer contracts. Landing there renders nothing
      // and clears the history — a patient who signed in to finish something
      // would be left on a blank page. Staying put is the honest outcome.
      if (!pending || !isBuilt(pending.screen)) return { state: done, effects: [] };
      return { state: navigate(done, pending.screen), effects: [] };
    }

    case "profileSaveFailed":
      // The control comes back from busy so it can be pressed again, and
      // nothing false is said. E8 declares no treatment for a save that could
      // not be made — TD-25 — so this asserts nothing rather than borrowing
      // the sentence for a mistake the patient did not make.
      return { state: { ...state, savingProfile: false }, effects: [] };

    case "profileRefused":
      // The server refused what the client had accepted — an invalid district
      // is the one declared error. E8 says so and stays; nothing is replayed,
      // because the request that replays is one this account cannot yet make.
      return { state: { ...state, savingProfile: false, refusal: { code: intent.why } }, effects: [] };

    case "dismissRefusal":
      return { state: { ...state, refusal: null, staleOffer: null }, effects: [] };

    case "offerGone": {
      // The pharmacy is named from the offer the app already holds. The runner
      // knows the offer id and nothing else, and passing an id where a name
      // belongs would print «off-req-3-b1» to a patient.
      const gone = state.offers.find((o) => o.offerId === intent.offerId);
      if (!gone) return { state, effects: [] };

      /**
       * The offer STAYS in the list, marked unavailable.
       *
       * R8-withdrawn is drawn, reviewed and photographed as exactly this: "an
       * offer withdrawn between render and tap is shown as unavailable rather
       * than as a control that will fail." The first version of this case
       * removed it, so a patient who tapped a pharmacy watched it vanish and
       * was told an offer had been withdrawn — with no way to tell which of
       * the ones still listed it had been.
       *
       * It moves along an edge §6 declares (Rule 5), never by assignment: the
       * server said withdrawn or expired and the machine says whether that is
       * a move this offer could make. If it is not — a second answer for one
       * already resolved — the list is left exactly as it is.
       */
      const on: MarketplaceMachines.OfferEvent =
        intent.why === REFUSAL.OFFER_EXPIRED ? "windowElapsed" : "withdraw";
      const moved = transition(MarketplaceMachines.OfferMachine, gone.state, on);
      const next = !isErr(moved) && Offers.isDisplayable(moved.value) ? moved.value : null;
      const offers = next === null
        ? state.offers
        : state.offers.map((o) => (o.offerId === intent.offerId ? { ...o, state: next } : o));

      return {
        state: navigate({
          ...state,
          offers,
          // R8's declared error treatment fires on this. Which of the two
          // happened is carried by the offer's own state, on the row, rather
          // than by a second copy of the same fact in a refusal.
          staleOffer: gone.branchName,
          reservation: null,
          reservationState: null,
        }, "R8"),
        effects: [],
      };
    }

    case "outboxChanged":
      return { state: { ...state, outbox: intent.outbox }, effects: [] };
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
function redirect(state: AppState, to: string, because: RedirectReason): AppState {
  return isBuilt(to)
    ? { ...navigate(state, to), redirectBecause: because }
    : { ...state, redirectBecause: because };
}

function navigate(state: AppState, screen: ScreenId): AppState {
  if (screen === state.screen) return state;
  const contract = contractFor(screen);
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
function open(state: AppState, screen: ScreenId, authority: Authority): Step {
  // §4 lists 133 patient screens and this slice contracts 22. An intent naming
  // one of the other 111 — or a typo — used to set `screen` to an id no
  // renderer knows and clear the history on the way, which is a blank screen
  // with no way back rather than a missing feature.
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
  const effects: Effect[] = [{ kind: "flushOutbox", outbox: sent.outbox }];
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
