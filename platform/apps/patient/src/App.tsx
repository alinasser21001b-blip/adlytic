/**
 * The patient app's root — the one place effects actually happen.
 *
 * @blueprint §4 · D26 · D27 · GET /v1/catalogue/search
 * @owner patient-app
 * @why Every decision was made in the reducer; this performs what the reducer
 *      asked for and renders what it produced. Keeping the two apart is what
 *      makes the whole loop testable without a device — and it means the
 *      question "why did the app do that" is always answered by a pure
 *      function, never by a component's lifecycle.
 */
import * as React from "react";
import { View, useColorScheme } from "react-native";
import type { TelemetrySink } from "@dawai/observability";
import { dispatch, initial, isBuilt, type AppState, type Authority, type Effect, type Intent } from "./app/store.js";
import { themeFor } from "./ui/theme.js";
import { FindScreen } from "./screens/FindScreen.jsx";
import { DraftScreen } from "./screens/DraftScreen.jsx";
import { ConfirmScreen } from "./screens/ConfirmScreen.jsx";
import { WaitingScreen } from "./screens/WaitingScreen.jsx";
import { OffersScreen } from "./screens/OffersScreen.jsx";
import { ReservationScreen } from "./screens/ReservationScreen.jsx";
import { PrescriptionScreen } from "./screens/PrescriptionScreen.jsx";
import { OfferDetailScreen } from "./screens/OfferDetailScreen.jsx";
import { WhyNumberScreen } from "./screens/WhyNumberScreen.jsx";
import { PhoneEntryScreen, CodeEntryScreen, NameScreen, DistrictScreen } from "./screens/OnboardingScreens.jsx";
import * as Onboarding from "./model/onboarding.js";
import { DISTRICTS } from "./data/districts.js";
import { sayRedirect } from "./ui/refusal.js";
import * as Offers from "./model/offers.js";
import * as Today from "./model/today.js";
import { TodayScreen } from "./screens/TodayScreen.jsx";
import { Label } from "./ui/kit.jsx";
import { instant } from "@dawai/domain";
import { perform as performEffect, type Ports } from "./infra/perform.js";
import type { Authority as _A } from "./app/store.js";

/**
 * What the root needs from the outside.
 *
 * `Ports` is the effect runner's dependency set and is reused verbatim rather
 * than re-declared: this file used to carry its own runner AND its own
 * dependency list, and the copy drifted — the shipped one never handled
 * `requestCode` or `verifyCode`, so a patient submitting a phone number
 * emitted an effect nothing performed. Two runners is one runner and one
 * decoy.
 */
export type Runtime = Ports & {
  readonly telemetry: TelemetrySink;
  readonly authority: () => Authority;
  /**
   * Where a failed effect goes.
   *
   * Required, not optional: an effect that rejects used to become an unhandled
   * promise rejection — `void performEffect(...).then(...)` with no catch — so
   * the one failure mode the runner is DESIGNED to produce, the exhaustiveness
   * throw for an effect nobody wrote a runner for, arrived as a warning in a
   * console nobody reads in production. Making it a required field means the
   * entry point cannot be written without deciding where failures go.
   *
   * It takes the effect as well as the error, because "something threw" is not
   * actionable and "verifyCode threw" is.
   */
  readonly onEffectFailed: (effect: Effect, cause: unknown) => void;
  /**
   * How the runtime speaks to the app.
   *
   * Everything else here is the app asking the outside for something. This is
   * the other direction, and it exists because two things happen to a patient
   * that nothing they did caused: a pharmacy answers, and a camera returns a
   * photograph. Both arrive while the app is idle, and neither is the result
   * of an effect the reducer asked for.
   *
   * The app registers the sink rather than the host supplying it, because the
   * host cannot: the runtime has to be BUILT before the app can be mounted,
   * and the app's dispatcher does not exist until it is. `web/main.tsx` filled
   * that gap with a no-op — so an offer that arrived was read, validated and
   * thrown away, and R7 counted zero forever no matter how many pharmacies
   * replied.
   *
   * Returns its own undo, so an unmounted app stops receiving.
   */
  readonly connect: (send: (intent: Intent) => void) => () => void;
  /**
   * A clock that makes a countdown count.
   *
   * `env.now()` is read during render, and nothing rendered again — so every
   * time on screen was frozen at whatever the last dispatch left it. Measured
   * in a browser: a six-minute hold still read «٦ دقائق» after two minutes,
   * and E6's «تكدر تطلب رمز جديد بعد ٤٥ ثانية» stayed at forty-five seconds
   * forever. That last one is a dead end on the way into the product — the
   * resend appears only at zero, and a patient whose SMS never arrived has
   * nothing to type that would push the clock along.
   *
   * Subscribing is the app's job because only the app knows which screen is
   * on top, and a timer that fires for a search screen is a wakeup that
   * teaches nobody anything. Returns its own undo.
   */
  readonly ticks: (onTick: () => void) => () => void;
};

/**
 * Screens that draw the clock.
 *
 * Named rather than inferred, because "does this screen show time" is a fact
 * about what each one renders and inferring it would mean guessing. E6 counts
 * the resend down, R7 counts the reply window, V2 counts the hold, S1 counts
 * the same hold on the home screen, and F1/F2 label how old a cached result is.
 */
const SHOWS_TIME: ReadonlySet<string> = new Set(["S1", "F1", "F2", "E6", "R7", "V2"]);

/**
 * The current time, kept current.
 *
 * Re-renders on the runtime's tick while a clock is on screen, and stops the
 * moment one is not. The value still comes from `env.now()` — this only
 * decides how often anybody asks.
 */
function useNow(rt: Runtime, active: boolean): number {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!active) return undefined;
    return rt.ticks(bump);
  }, [rt, active]);
  return rt.env.now();
}

/**
 * The store as a hook. `perform` runs after the state is committed, so an
 * effect can never observe a state the user has not been shown.
 */
export function usePatientApp(rt: Runtime) {
  /**
   * State and its pending effects move together, in ONE reducer.
   *
   * The previous version pushed effects onto a ref from inside the `setState`
   * updater. An updater must be pure: React re-invokes it — twice on every
   * render under StrictMode, and again when a concurrent render is discarded
   * and replayed — so every re-invocation appended the same effects again. The
   * observable failure is a patient receiving two verification SMS for one tap
   * and the outbox being flushed twice concurrently; the telemetry double-count
   * is the harmless end of the same bug.
   *
   * Carrying effects IN the state makes the updater a pure function of its
   * input, which is what React requires and what the store already was.
   */
  const [runtimeState, act] = React.useReducer(reduceRuntime(rt), INITIAL_RUNTIME);

  const send = React.useCallback((intent: Intent) => act({ kind: "intent", intent }), []);

  // Anything the runtime learns on its own — an offer arriving, a photograph
  // coming back — reaches the reducer through here, and stops when the app
  // does.
  React.useEffect(() => rt.connect(send), [rt, send]);

  React.useEffect(() => {
    const { effects } = runtimeState;
    if (!effects.length) return;
    for (const effect of effects) perform(effect, rt, send);
    // Drained by identity, not by count: if another intent landed between the
    // render and this effect, its effects are a DIFFERENT array and survive.
    act({ kind: "drained", drained: effects });
  }, [runtimeState.effects, rt, send]);

  return { state: runtimeState.state, send };
}

/**
 * The runtime's own action type — deliberately not the store's `Intent`.
 *
 * Draining performed effects is a fact about this host, not a thing that
 * happened to a patient, and putting it in the product's intent union would
 * make the reducer answer a question the Blueprint never asked.
 */
type RuntimeAction =
  | { readonly kind: "intent"; readonly intent: Intent }
  | { readonly kind: "drained"; readonly drained: readonly Effect[] };

type RuntimeState = { readonly state: AppState; readonly effects: readonly Effect[] };

const INITIAL_RUNTIME: RuntimeState = { state: initial(), effects: [] };

const reduceRuntime = (rt: Runtime) => (prev: RuntimeState, action: RuntimeAction): RuntimeState => {
  if (action.kind === "drained") {
    // Remove exactly what was performed. Clearing the whole queue would drop
    // effects that arrived while these were in flight.
    const done = new Set(action.drained);
    return { ...prev, effects: prev.effects.filter((e) => !done.has(e)) };
  }
  const step = dispatch(prev.state, action.intent, rt.env, rt.authority());
  return { state: step.state, effects: [...prev.effects, ...step.effects] };
};

/**
 * Perform, then feed the answer back through the reducer.
 *
 * The runner itself lives in infra/ and returns an Intent or nothing, so this
 * file holds no knowledge of HTTP, ports or response shapes — and the effect
 * loop is testable without React.
 */
function perform(effect: Effect, rt: Runtime, send: (i: Intent) => void): void {
  void performEffect(effect, rt)
    .then((answer) => { if (answer) send(answer); })
    // A rejection here is a defect in the runner or a port, never a network
    // condition — infra/http turns those into outcomes. Reporting it keeps the
    // loop alive for every other effect: one broken runner must not stop the
    // outbox flushing or a search resolving.
    .catch((cause: unknown) => rt.onEffectFailed(effect, cause));
}

/** Platform intents this slice does not own. Wired when their slice lands;
 *  nothing pretends they work in the meantime. */
const noop = () => {};

/**
 * What the guard interrupted, named.
 *
 * D26 preserves the action and E4 SHOWS it, because "your request is saved"
 * with nothing naming the request is a reassurance the patient has to take on
 * faith at the exact moment they have least reason to. The draft is the only
 * work this build can preserve, so an empty one means there is nothing to name
 * and the strip is absent rather than reassuring about nothing.
 */
function preservedWork(state: AppState): string | null {
  const lines = state.draft?.lines ?? [];
  return lines.length > 0 ? lines.map((l) => l.name).join(" + ") : null;
}

/**
 * The number E6 shows back, grouped the way it is read aloud.
 *
 * Derived from what the patient typed rather than stored a second time: E5 and
 * E6 must show the same number, and two copies of it is one copy and one thing
 * that can disagree. An unparseable string is echoed verbatim — E6 is only
 * reachable through a parse that succeeded, and showing the raw text is the
 * honest answer if that ever stops being true.
 */
function phoneAsShown(typed: string): string {
  const parsed = Onboarding.parsePhone(typed);
  return parsed.value ? Onboarding.displayPhone(parsed.value) : typed;
}

export function App({ rt }: { rt: Runtime }) {
  // The Night Mint delivery is dark-first and its daylight sibling is not yet
  // designed. Rendering the device's light preference would ship a scheme
  // nobody drew, so the patient app is dark until that palette arrives — see
  // TD-10. `useColorScheme` stays wired for the day it does.
  void useColorScheme();
  const t = themeFor("dark");
  const { state, send } = usePatientApp(rt);
  const now = useNow(rt, SHOWS_TIME.has(state.screen));

  const onBack = () => send({ kind: "back" });
  // A control whose destination this build does not contain is never rendered,
  // so this only ever receives a screen that exists.
  const onAction = (to: string) => { if (isBuilt(to)) send({ kind: "open", screen: to }); };

  switch (state.screen) {
    case "S1":
      return (
        <TodayScreen
          t={t}
          /* Everything Today can honestly say, from the one record this build
             holds. The Blueprint also gives S1 the dispense history and the
             active subject, and neither has a port — so Today shows what it
             has rather than a shape with nothing in it (TD-27). */
          today={Today.fromReservation(state.reservation)}
          history={state.history} now={now}
          onBack={onBack} onAction={onAction}
        />
      );

    case "F1":
    case "F2":
      return (
        <FindScreen
          t={t} search={state.search} history={state.history} now={now}
          onType={(raw) => send({ kind: "typed", raw })}
          onAdd={(hit) => send({ kind: "addItem", hit })}
          onBack={onBack} onAction={onAction}
        />
      );

    case "R1":
      return (
        <DraftScreen
          t={t} draft={state.draft} history={state.history}
          refusal={state.refusal} redirectBecause={state.redirectBecause}
          onSetPacks={(itemId, packs) => send({ kind: "setPacks", itemId, packs })}
          onRemove={(itemId) => send({ kind: "removeLine", itemId })}
          onContinue={() => send({ kind: "open", screen: "R6" })}
          onDismissRefusal={() => send({ kind: "dismissRefusal" })}
          onBack={onBack} onAction={onAction}
        />
      );

    /* ── E4–E8 · the interruption ──────────────────────────────────────
       These are not a side journey. They are what happens IN THE MIDDLE of
       the core loop the moment a guest touches an action that needs an
       account, and every one of them was built, reviewed and photographed
       while the app root rendered none of them: `open` redirected a guest to
       E4, the switch had no case for it, and `default` drew the search screen
       — so tapping «كمّل» on a finished request threw the patient backwards
       with no explanation at all. Ten built screens were unreachable this
       way; these five are the ones that stand between a patient and every
       other screen in the product. */

    case "E4":
      return (
        <WhyNumberScreen
          t={t}
          preserved={preservedWork(state)}
          /* The guard's own sentence, so this screen cannot state a different
             reason than the redirect did. Reached deliberately rather than by
             a guard there is no reason to quote, and the only thing E4 exists
             to explain is the account — which is what SESSION_REQUIRED says. */
          because={sayRedirect(state.redirectBecause ?? "SESSION_REQUIRED")}
          history={state.history} onBack={onBack} onAction={onAction}
        />
      );

    case "E5":
      return (
        <PhoneEntryScreen
          t={t} typed={state.onboarding.phoneTyped} history={state.history}
          online={rt.env.online()}
          onType={(raw) => send({ kind: "typePhone", raw })}
          onSubmit={() => send({ kind: "submitPhone" })}
          onBack={onBack} onAction={onAction}
        />
      );

    case "E6": {
      const { challenge } = state.onboarding;
      return (
        <CodeEntryScreen
          t={t}
          /* The number as the patient reads it aloud, re-parsed from what they
             typed rather than stored a second time — one number, one source. */
          phone={phoneAsShown(state.onboarding.phoneTyped)}
          typed={state.onboarding.codeTyped}
          /* Null until the server issues one, which is a real window and not
             an error: the request is in flight, or it failed and no challenge
             was invented to cover for it. */
          status={challenge ? Onboarding.codeStatus(challenge, instant(now)) : Onboarding.CODE_PENDING}
          checking={state.onboarding.checking}
          refusalCode={state.onboarding.codeRefusal}
          history={state.history} online={rt.env.online()}
          onType={(raw) => send({ kind: "typeCode", raw })}
          onSubmit={() => send({ kind: "submitCode", at: instant(rt.env.now()) })}
          onResend={() => send({ kind: "resendCode" })}
          onBack={onBack} onAction={onAction}
        />
      );
    }

    case "E7":
      return (
        <NameScreen
          t={t} typed={state.onboarding.nameTyped} history={state.history}
          onType={(raw) => send({ kind: "typeName", raw })}
          onSubmit={() => send({ kind: "submitName" })}
          onBack={onBack} onAction={onAction}
        />
      );

    case "E8":
      return (
        <DistrictScreen
          t={t}
          /* Bundled, per E8's offline rule. The screen never asks for a
             location and never needs a network to draw this. */
          districts={DISTRICTS}
          query={state.onboarding.districtQuery}
          chosen={state.onboarding.districtChosen}
          history={state.history}
          onSearch={(raw) => send({ kind: "searchDistrict", raw })}
          onChoose={(districtId) => send({ kind: "chooseDistrict", districtId })}
          /* The list travels with the intent because the domain check needs it
             and the store holds no catalogue of districts — a reducer that
             owned the list would be a second place the coverage map lives. */
          /* The end of onboarding is a network call, so the control says so
             and cannot be pressed twice — a second PATCH would be harmless,
             but a patient pressing a button that does not respond assumes it
             did not work. */
          busy={state.savingProfile}
          onSubmit={() => send({ kind: "submitDistrict", districts: DISTRICTS })}
          onBack={onBack} onAction={onAction}
        />
      );

    case "R6":
      return state.draft ? (
        <ConfirmScreen
          t={t} draft={state.draft} history={state.history}
          online={rt.env.online()} refusal={state.refusal}
          redirectBecause={state.redirectBecause} sending={false}
          onSetUrgency={(urgency) => send({ kind: "setUrgency", urgency })}
          onSend={() => send({ kind: "send", at: instant(rt.env.now()) })}
          onBack={onBack} onAction={onAction}
        />
      ) : <Placeholder t={t} />;

    case "R7":
      return state.sent ? (
        <WaitingScreen
          t={t} sent={state.sent} history={state.history} now={now}
          urgency={state.sent.submission.urgency}
          /* Was a hard-coded zero, written when nothing could produce an
             offer. R7's whole job is to make the wait legible and it was
             telling every patient that nobody had answered, including the
             ones whose offers were sitting in state waiting to be counted. */
          offerCount={state.offers.length}
          onBack={onBack} onAction={onAction}
        />
      ) : <Placeholder t={t} />;

    case "R8":
      return (
        <OffersScreen
          t={t}
          offers={state.offers.map((o) => Offers.summarise(o, o.lines.map((l) => l.requestLineId)))}
          requestedLines={state.sent?.submission.lines.length ?? 0}
          history={state.history}
          loading={state.offers.length === 0}
          staleOfferName={state.staleOffer}
          onChoose={(offerId) => send({ kind: "chooseOffer", offerId })}
          onDetails={(offerId) => send({ kind: "openOffer", offerId })}
          onBack={onBack} onAction={onAction}
        />
      );

    case "R2":
    case "R3":
      return (
        <PrescriptionScreen
          t={t} capture={state.capture} history={state.history}
          onCapture={() => send({ kind: "capture" })}
          onConfirm={() => send({ kind: "confirmPhoto" })}
          onRetake={() => send({ kind: "retakePhoto" })}
          onTypeInstead={() => onAction("R1")}
          onBack={onBack} onAction={onAction}
        />
      );

    case "R9": {
      const offer = state.offers.find((o) => o.offerId === state.consent?.offerId);
      return offer && state.consent ? (
        <OfferDetailScreen
          t={t}
          summary={Offers.summarise(offer, offer.lines.map((l) => l.requestLineId))}
          consent={state.consent}
          requestedLines={state.sent?.submission.lines.length ?? 0}
          history={state.history}
          withdrawn={!Offers.choosable(offer)}
          onDecide={(requestLineId, decision) => send({ kind: "decideSubstitution", requestLineId, decision })}
          onReserve={() => send({ kind: "chooseOffer", offerId: offer.offerId })}
          onBack={onBack} onAction={onAction}
        />
      ) : <Placeholder t={t} />;
    }

    case "V1":
    case "V2":
    case "V4":
      return state.reservation ? (
        <ReservationScreen
          t={t}
          view={state.reservation}
          // Freshness comes from the transport once Stage 5 exists. Until then
          // it is live, because nothing is cached — claiming "cached" would be
          // as dishonest as claiming "live" when it is not.
          freshness={{ kind: "live" }}
          history={state.history}
          now={now}
          // V5 is not in this build, so isBuilt drops it and the prop is
          // unused by the screen — see TD-14.
          onCancel={() => onAction("V5")}
          // The contract declares both and the screen draws both, but there is
          // no dialer and no maps handoff, so a patient can press either and
          // nothing happens at all.
          onCall={noop} /* TD-14 */
          onDirections={noop} /* TD-14 */
          onBack={onBack} onAction={onAction}
        />
      ) : <Placeholder t={t} />;

    default:
      /**
       * Unreachable, and landing somewhere real rather than nowhere.
       *
       * Every path that sets `screen` goes through `isBuilt` — `open` checks
       * it, `redirect` checks it, and `back` can only resolve to a screen the
       * patient has already been on — so a value with no case above is a
       * defect in this file rather than a state a patient can produce. It used
       * to draw the SEARCH screen, which is how R1's «لمن؟» replaced a
       * patient's request with a search box (TD-19): a wrong screen that looks
       * right is worse than an obvious failure.
       *
       * What prevents that recurring is not this branch, which cannot tell a
       * new screen from a typo — it is `renders every screen it says it can
       * draw` in journey.test.tsx, which fails the build for exactly this
       * mistake. This branch only decides where a patient stands if that gate
       * is ever wrong, and Today is the honest answer: it is the app's home,
       * and it states what is true of the patient rather than inventing an
       * activity for them.
       */
      return (
        <TodayScreen
          t={t} today={Today.fromReservation(state.reservation)}
          history={state.history} now={now}
          onBack={onBack} onAction={onAction}
        />
      );
  }
}

/**
 * A screen was opened without the state it needs.
 *
 * The reducer does NOT prevent this, contrary to what this comment used to
 * claim: `open` checks the guards and `isBuilt`, and neither knows that V2
 * without a reservation has nothing to draw. Dispatching `{ kind: "open",
 * screen: "V2" }` on a signed-in state with `reservation: null` navigates
 * there and lands here.
 *
 * No control does that today — nothing rendered dispatches it, and the one
 * declared exit into V2 belongs to S1, which this build does not contain. The
 * paths that will reach it are S1 when its slice lands, and D26's replay of a
 * pending screen. Registered as TD-15 rather than answered here: what a
 * patient should see when a reservation is gone is a product decision, and
 * inventing a redirect would be inventing navigation.
 *
 * It says so rather than showing nothing, because a blank screen is the one
 * failure a user cannot report usefully.
 */
const Placeholder = ({ t }: { t: ReturnType<typeof themeFor> }) => (
  <View style={{ flex: 1, backgroundColor: t.color.surface, padding: t.space[6] }}>
    <Label t={t} role="headline">ما عدنا طلب مفتوح</Label>
  </View>
);
