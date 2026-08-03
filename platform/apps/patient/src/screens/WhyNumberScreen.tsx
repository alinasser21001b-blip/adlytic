/**
 * E4 — the one hard ask, explained before it is made.
 *
 * @blueprint E4 · D26 · §3.1
 * @owner patient-app
 * @why §3.1 is explicit that the account is requested at the first action that
 *      needs one, with the reason stated, and never as a wall on launch. This
 *      screen is that promise made good, and it has exactly one job: make the
 *      ask understandable before it is made.
 *
 *      Three things carry it. The work the patient was doing is named at the
 *      top, because D26 preserves it and a person who cannot see that their
 *      request survived will assume the app is about to lose it. The reason is
 *      the guard's own sentence — the same string that redirected them here —
 *      so the answer to "why am I on this screen" cannot drift from the reason
 *      they were sent. And the limits are stated before the ask rather than
 *      after: once, not published, not sold, and not visible to a pharmacy.
 *
 *      What this screen does NOT do is take the number. Blueprint v3 separates
 *      explaining (E4) from entry (E5), and a field here would either be a
 *      decoration that does nothing or a second place a phone number can be
 *      typed. See DEV-16.
 */

import { resolveView } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "./graph.js";
import { Screen, Label, Primary, Secondary, Row, Section, InfoStrip } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import { PATIENT_FLOWS } from "./flows.js";

const E4 = CORE_LOOP.find((c) => c.id === "E4")!;

export type WhyNumberProps = {
  readonly t: Theme;
  /** What the patient was doing when the guard stopped them. Null when they
   *  arrived here deliberately rather than by being redirected. */
  readonly preserved: string | null;
  /** The guard's own reason, so this screen cannot state a different one. */
  readonly because: string;
  readonly history: readonly string[];
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function WhyNumberScreen(p: WhyNumberProps) {
  const { t } = p;
  const view = resolveView(E4, { kind: "ready" }, GRAPH, p.history, PATIENT_FLOWS);

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={(
        <>
          {view.primary
            ? <Primary t={t} label={view.primary.label} onPress={() => p.onAction(view.primary!.leadsTo)} />
            : null}
          {/* The delivery's own words for leaving, and they matter more here
              than anywhere else in the product: this is the only screen that
              asks for something the patient did not come to give, so the way
              out has to be as legible as the way on. It runs the resolved back
              behaviour — D26 returns them to the action, not to a root. */}
          <Row t={t} justify="center">
            <Secondary t={t} label="مو هسه — رجعني لطلبي" onPress={p.onBack} />
          </Row>
        </>
      )}
    >
      {/* D26 — named, not implied. "Your request is saved" with nothing naming
          the request is a reassurance the patient has to take on faith at the
          exact moment they have least reason to. */}
      {p.preserved
        ? <InfoStrip t={t} lead="طلبك محفوظ:" subject={p.preserved} tail="نكمّله بعد التحقق، من نفس المكان." />
        : null}

      <Section t={t}>
        {/* The guard's sentence, not a second one written for this screen. */}
        <Label t={t} role="poster">{p.because}</Label>
        <Label t={t} role="body" color="inkMuted">
          مرة وحدة بس. ما ننشر رقمك، وما نبيعه، والصيدلية ما تشوفه — تشوف اسمك الأول بس بعد ما تختارها.
        </Label>
      </Section>
    </Screen>
  );
}
