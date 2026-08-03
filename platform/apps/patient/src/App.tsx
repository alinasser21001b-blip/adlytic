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
import * as Offers from "./model/offers.js";
import { Label } from "./ui/kit.jsx";
import { instant } from "@dawai/domain";
import type { CataloguePort, Environment } from "./ports.js";

export type Runtime = {
  readonly catalogue: CataloguePort;
  readonly env: Environment;
  readonly telemetry: TelemetrySink;
  /** Delivery of queued work. Infrastructure owns it; the app only asks. */
  readonly flush: () => void;
  readonly authority: () => Authority;
};

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

function perform(effect: Effect, rt: Runtime, send: (i: Intent) => void): void {
  switch (effect.kind) {
    case "search":
      void rt.catalogue.search(effect.query).then((result) =>
        send({ kind: "searchResolved", query: effect.query, result }));
      return;
    case "emit":
      rt.telemetry.emit({
        // The event name came from the closed set in the reducer; this only
        // stamps it with a time and a correlation id.
        event: effect.event as never,
        at: rt.env.now(),
        correlationId: rt.env.newId(),
        attributes: effect.attributes,
      });
      return;
    case "flushOutbox":
      rt.flush();
      return;
    case "capturePrescription":
      // The camera itself is a native module and arrives with the device
      // build. Nothing is faked here: the reducer has already moved the screen
      // to a capturing state, and this is the one place that will ask the OS.
      return;
  }
}

/** Platform intents this slice does not own. Wired when their slice lands;
 *  nothing pretends they work in the meantime. */
const noop = () => {};

export function App({ rt }: { rt: Runtime }) {
  // The Night Mint delivery is dark-first and its daylight sibling is not yet
  // designed. Rendering the device's light preference would ship a scheme
  // nobody drew, so the patient app is dark until that palette arrives — see
  // TD-10. `useColorScheme` stays wired for the day it does.
  void useColorScheme();
  const t = themeFor("dark");
  const { state, send } = usePatientApp(rt);

  const onBack = () => send({ kind: "back" });
  // A control whose destination this build does not contain is never rendered,
  // so this only ever receives a screen that exists.
  const onAction = (to: string) => { if (isBuilt(to)) send({ kind: "open", screen: to }); };

  switch (state.screen) {
    case "F1":
    case "F2":
      return (
        <FindScreen
          t={t} search={state.search} history={state.history} now={rt.env.now()}
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
          t={t} sent={state.sent} history={state.history} now={rt.env.now()}
          urgency={state.sent.submission.urgency} offerCount={0}
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
          now={rt.env.now()}
          onCancel={() => onAction("V5")}
          onCall={noop}
          onDirections={noop}
          onBack={onBack} onAction={onAction}
        />
      ) : <Placeholder t={t} />;

    default:
      // S1 and the rest of the loop arrive with their slices. Until then the
      // root renders the entry to the one journey that IS built, rather than a
      // blank screen or a screen pretending to be Today.
      return (
        <FindScreen
          t={t} search={state.search} history={state.history} now={rt.env.now()}
          onType={(raw) => send({ kind: "typed", raw })}
          onAdd={(hit) => send({ kind: "addItem", hit })}
          onBack={onBack} onAction={onAction}
        />
      );
  }
}

/** Reached only if a screen is opened without the state it needs, which the
 *  reducer prevents. It says so rather than showing nothing, because a blank
 *  screen is the one failure a user cannot report usefully. */
const Placeholder = ({ t }: { t: ReturnType<typeof themeFor> }) => (
  <View style={{ flex: 1, backgroundColor: t.color.surface, padding: t.space[6] }}>
    <Label t={t} role="headline">ما عدنا طلب مفتوح</Label>
  </View>
);
