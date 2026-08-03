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
  /** The outbox has work. Delivery is infrastructure's job, not the store's. */
  | { readonly kind: "flushOutbox" }
  | { readonly kind: "capturePrescription" }
  /** Ask the identity service to send an SMS. Delivery is infrastructure's
   *  job; the store only says that it should happen. */
  | { readonly kind: "requestCode"; readonly e164: string }
  | { readonly kind: "verifyCode"; readonly challengeId: string; readonly code: string };

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
  | { readonly kind: "dismissRefusal" }

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
  | { readonly kind: "codeJudged"; readonly challengeId: string; readonly verdict: "correct" | "wrong" | "expired" | "exhausted"; readonly attemptsLeft?: number }
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
export { GRAPH, isBuilt, NOT_YET_BUILT } from "../screens/graph.js";

/** A cold start: a guest on Today, with nothing in flight. The district is not
 *  state — it arrives with `Authority` on every dispatch, because it is a fact
 *  about the account rather than a fact about the screen. */
export function initial(): AppState {
  return {
    session: guest(),
    onboarding: NO_ONBOARDING,
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
      // A pending screen survives a reinstall and an app update, so it may name
      // a screen this build no longer contracts. Landing there renders nothing
      // and clears the history — a patient who signed in to finish something
      // would be left on a blank page. Staying put is the honest outcome.
      if (!pending || !isBuilt(pending.screen)) return { state: resumed, effects: [] };
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
        effects: [{ kind: "flushOutbox" }],
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
          const left = intent.attemptsLeft ?? 0;
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
      return { state: navigate({ ...state, refusal: null }, "E8"), effects: [] };
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
      return { state: { ...state, refusal: null }, effects: [] };
    }

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
