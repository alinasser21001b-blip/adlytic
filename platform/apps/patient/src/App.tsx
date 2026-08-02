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
  const [state, setState] = React.useState<AppState>(initial);
  const pending = React.useRef<readonly Effect[]>([]);

  const send = React.useCallback((intent: Intent) => {
    setState((current) => {
      const step = dispatch(current, intent, rt.env, rt.authority());
      pending.current = [...pending.current, ...step.effects];
      return step.state;
    });
  }, [rt]);

  React.useEffect(() => {
    const effects = pending.current;
    if (!effects.length) return;
    pending.current = [];
    for (const effect of effects) perform(effect, rt, send);
  });

  return { state, send };
}

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
      // R2 is not in this slice. Nothing is faked here: the reducer never
      // emits it yet, and when R2 lands this is where the camera is asked.
      return;
  }
}

export function App({ rt }: { rt: Runtime }) {
  const scheme = useColorScheme();
  const t = themeFor(scheme === "dark" ? "dark" : "light");
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
