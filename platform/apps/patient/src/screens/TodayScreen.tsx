/**
 * S1 — Today. What is happening right now.
 *
 * @blueprint S1 · §22 · §23 · §26 · V2 · D27
 * @owner patient-app
 * @why This is the patient's home and the screen they open most, and until now
 *      the app root drew the SEARCH screen in its place — so every exit that
 *      says "leave this and go to Today", including the one back from a live
 *      reservation, landed on a search box with no mention of the hold the
 *      patient had just left.
 *
 *      Three decisions carry the screen.
 *
 *      A live hold is CONTENT, not a control. `ActionCard` makes a whole card
 *      one accessibility element — its label is announced and its children are
 *      not (TD-12) — and the facts a patient needs here are exactly those
 *      children: which pharmacy, until when, how long is left. So the card
 *      reads as information and the tap is a named control beside it, which
 *      keeps the spoken screen and the visible screen the same product.
 *
 *      The code is NOT here. It lives on V2, which Blueprint v3 calls the
 *      screen that must never fail; a second copy is a second thing to keep
 *      honest when a hold lapses.
 *
 *      And the two empties are not a shade of each other. §22 makes them
 *      opposite screens — teach a new account, reassure a managed one — so the
 *      teaching empty keeps its own more specific action rather than having the
 *      frame draw the generic primary beside it.
 */
import { instant } from "@dawai/domain";

import * as Reservation from "../model/reservation.js";
import * as Today from "../model/today.js";
import { type Phase } from "../model/view.js";
import { Card, Digits, FactRow, Label, Primary, Row, Screen, Secondary, Section, Spacer } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { viewOf } from "./graph.js";

const S1 = CORE_LOOP.find((c) => c.id === "S1")!;

export type TodayProps = {
  readonly t: Theme;
  readonly today: Today.Today;
  readonly history: readonly string[];
  readonly now: number;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function TodayScreen(p: TodayProps) {
  const { t, today } = p;

  const phase: Phase =
    today.kind === "loading" ? { kind: "loading" }
    : today.kind === "failed" ? { kind: "error" }
    // "offline" and "stale" are one treatment: the Blueprint declares both for
    // S1 and both mean the same thing to a patient — this is from the cache,
    // and here is how old it is.
    : today.kind === "cached" ? { kind: "offline", ageMs: p.now - today.asOf }
    : today.kind === "quiet" ? { kind: "empty", isSuccess: true }
    : today.kind === "new" ? { kind: "empty", isSuccess: false }
    : { kind: "ready" };

  const view = viewOf(S1.id, phase, p.history);
  const hold = Today.holdOf(today);

  /**
   * The teaching empty says «أطلب أول دواء» and the screen's standing primary
   * says «أطلب دواء». Both lead to R1, so drawing the frame's primary as well
   * would put two controls with one destination on the emptiest screen in the
   * product. Withholding the footer lets the frame promote the state's own,
   * more specific words instead — which is the mechanism `Screen` already has.
   *
   * The quiet empty declares no action deliberately (offering one would invent
   * urgency the patient does not have), so it falls through to the primary:
   * a patient on a calm day must still be able to ask for a medicine.
   */
  const stateOwnsTheFooter = view.treatment?.kind === "empty" && view.treatment.action !== null;

  return (
    <Screen
      t={t}
      view={view}
      onBack={p.onBack}
      onAction={p.onAction}
      footer={stateOwnsTheFooter || !view.primary
        ? undefined
        : <Primary t={t} label={view.primary.label} onPress={() => p.onAction(view.primary!.leadsTo)} />}
    >
      {/* A SUCCESS empty is not an interruption of the content — it IS the
          content, so the frame draws nothing and the screen says the declared
          words itself. Taken from the treatment rather than retyped, so the
          quiet day cannot come to say something the contract does not.
          Centred and set the same way the frame sets the teaching empty:
          §22 makes these two screens differ in what they SAY and in whether
          they act, and a reassurance hugging the top of an otherwise blank
          screen reads as content that failed to load. */}
      {view.treatment?.kind === "empty" && view.treatment.isSuccess ? (
        <>
          <Spacer />
          <Label t={t} role="title" color="inkMuted">{view.treatment.explains}</Label>
          <Spacer />
        </>
      ) : null}

      {today.kind === "pending" ? <Requested t={t} branchName={today.branchName} /> : null}

      {hold ? (
        <HoldCard
          t={t}
          hold={hold}
          now={p.now}
          // A cached countdown is never presented as live — the same rule V2
          // keeps, for the same reason: a lapsed hold shown as live sends
          // somebody to a counter for medicine that is back on the shelf.
          live={today.kind !== "cached"}
          onOpen={() => p.onAction("V2")}
        />
      ) : null}
    </Screen>
  );
}

/**
 * A hold, as Today states it: which pharmacy, until when, how much longer.
 *
 * Outlined in the accent at two points rather than filled, because Today may
 * carry several things and a filled block would make this one a control. The
 * contract's primary is «أطلب دواء» and that stays in the footer where a thumb
 * rests; this card earns its weight from the border and from being first.
 */
function HoldCard(
  { t, hold, now, live, onOpen }:
  { t: Theme; hold: Reservation.Hold; now: number; live: boolean; onOpen: () => void },
) {
  const left = Reservation.timeLeft(hold, instant(now));
  return (
    <Card t={t} border="accent" borderWidth={2} gap={3}>
      <Section t={t}>
        <Label t={t} role="caption" color="accent">محجوز لك</Label>
        <Label t={t} role="headline">{hold.branchName}</Label>
      </Section>

      <FactRow
        t={t}
        first
        label="صالح لحد"
        value={
          <Row t={t} align="baseline">
            <Digits t={t} value={Reservation.clockTime(hold.expiresAt)} role="body" />
            {live ? null : <Label t={t} role="caption" color="inkSubtle">آخر وقت معروف</Label>}
          </Row>
        }
      />

      {live ? (
        <Row t={t} align="baseline">
          <Label
            t={t}
            role="title"
            color={left.urgency === "last" ? "alert" : left.urgency === "soon" ? "warning" : "accent"}
          >
            {Reservation.describeRemaining(left.minutes)}
          </Label>
          <Label t={t} role="body" color="inkMuted">
            {left.expired ? "انتهى وقت الحجز" : "باقية على الحجز"}
          </Label>
        </Row>
      ) : (
        // §26 forbids wording one promise as another: the banner has already
        // said the screen is from the cache, and this says what that costs —
        // the number above is the last one we were told, not the one now.
        <Label t={t} role="caption" color="inkSubtle">
          العدّاد مو حي — نحدّثه أول ما يرجع الاتصال.
        </Label>
      )}

      {/* The one control on the card, named for what it opens rather than for
          the card it sits on: «شوف الحجز» would leave a screen-reader user
          hearing the same two words on every hold they have. */}
      <Row t={t}>
        <Secondary t={t} label="شوف رمز الاستلام" onPress={onOpen} />
      </Row>
    </Card>
  );
}

/**
 * A hold has been asked for and nobody has answered.
 *
 * No countdown and no control: nothing has been set aside yet, so there is no
 * clock to run and no reservation to open — the same reason V1 draws neither.
 */
function Requested({ t, branchName }: { t: Theme; branchName: string }) {
  return (
    <Card t={t}>
      <Label t={t} role="headline">{`نطلب من ${branchName} تحجزلك`}</Label>
      <Label t={t} role="body" color="inkMuted">
        ثواني وتوصلك النتيجة. ما تحتاج تنطر بهذي الشاشة — راح نخبرك.
      </Label>
    </Card>
  );
}
