/**
 * V1, V2 and V4 — the hold, the code, and the refusal.
 *
 * @blueprint V1 · V2 · V4 · D39 · §6 Reservation · reservation.confirmed · reservation.refused
 * @owner patient-app
 * @why V2 is the screen Blueprint v3 says must never fail: a patient standing
 *      at a counter needs the code whether or not there is a signal. So the
 *      code is the largest thing on the screen, it renders from cache, and a
 *      cached countdown is labelled as last known rather than shown as live —
 *      sending someone to a pharmacy for a hold that has already lapsed is the
 *      failure this labelling exists to prevent. V1 shows no timer at all,
 *      because nothing has been set aside yet.
 */
import { instant } from "@dawai/domain";

import * as Reservation from "../model/reservation.js";
import { formatPrice } from "../model/offers.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "./graph.js";
import { Screen, Label, Digits, Primary, Secondary, InfoCard, CodePanel, FactRow, Row } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import { PATIENT_FLOWS } from "./flows.js";

const contract = (id: string) => CORE_LOOP.find((c) => c.id === id)!;

export type ReservationProps = {
  readonly t: Theme;
  readonly view: Reservation.ReservationView;
  readonly freshness: Reservation.Freshness;
  readonly history: readonly string[];
  readonly now: number;
  readonly onCancel: () => void;
  readonly onCall: () => void;
  readonly onDirections: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function ReservationScreen(p: ReservationProps) {
  switch (p.view.kind) {
    case "requesting": return <Requesting {...p} branchName={p.view.branchName} />;
    case "held":
    case "collected":
    case "expired": return <Held {...p} hold={p.view.hold} kind={p.view.kind} />;
    case "refused": return <Refused {...p} branchName={p.view.branchName} reopened={p.view.reopened} />;
    case "cancelled": return <Refused {...p} branchName="" reopened={false} />;
  }
}

/** V1 — deliberately un-poppable and deliberately without a timer. */
function Requesting({ t, branchName, history, onBack, onAction }: ReservationProps & { branchName: string }) {
  const view = resolveView(contract("V1"), { kind: "loading" }, GRAPH, history, PATIENT_FLOWS);
  return (
    <Screen t={t} view={view} onBack={onBack} onAction={onAction}>
      <InfoCard t={t}>
        <Label t={t} role="headline">{`نطلب من ${branchName} تحجزلك`}</Label>
        {/* No countdown: the clock starts when stock is actually set aside, and
            a timer before that counts down to a disappointment. */}
        <Label t={t} role="body" color="inkMuted">
          ثواني وتوصلك النتيجة. ما تحتاج تنطر بهذي الشاشة — راح نخبرك.
        </Label>
      </InfoCard>
    </Screen>
  );
}

/** V2 — the code, the clock, the address. Night Mint layout, turn 4. */
function Held(p: ReservationProps & { hold: Reservation.Hold; kind: "held" | "collected" | "expired" }) {
  const { t, hold } = p;
  const left = Reservation.timeLeft(hold, instant(p.now));
  const cached = p.freshness.kind === "cached";
  const phase: Phase = cached ? { kind: "offline", ageMs: p.now - p.freshness.asOf } : { kind: "ready" };
  const view = resolveView(contract("V2"), phase, GRAPH, p.history, PATIENT_FLOWS);

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      // The cached banner is the declared offline treatment; `Screen` draws it
      // flush under the header, so V2 does not supply one of its own.
      footer={p.kind === "held" ? <Primary t={t} label="الاتجاهات" onPress={p.onDirections} /> : undefined}
    >
      <Label t={t} role="body" color="inkMuted">{`حجزك باسم ${hold.holderName}`}</Label>

      {/* The code is what the patient holds up at a counter — a light panel on
          the dark ground, so it reads as something printed rather than as
          another card in an app. */}
      <CodePanel
        t={t}
        code={Reservation.readableCode(hold.code)}
        caption="رمز الاستلام — اقراه للصيدلي زوج زوج"
      />

      <InfoCard t={t}>
        <FactRow t={t} first label="الصيدلية" value={hold.branchName} />
        <FactRow
          t={t}
          label="صالح لحد"
          value={
            <Row t={t} align="baseline">
              <Digits t={t} value={Reservation.clockTime(hold.expiresAt)} role="body" />
              {/* The delivery qualifies the expiry on a cached screen: it is the
                  last time we were told, not the time we know. */}
              {cached ? <Label t={t} role="caption" color="inkSubtle">آخر وقت معروف</Label> : null}
            </Row>
          }
        />
        <FactRow
          t={t}
          label="تدفع بالكاونتر"
          value={<Digits t={t} value={formatPrice(hold.totalMinor)} role="body" />}
        />
      </InfoCard>

      {p.kind === "held" ? (
        cached
          // D27's sibling: a cached countdown is never presented as live.
          ? <Label t={t} role="caption" color="inkSubtle">
              هذي الشاشة تشتغل بدون نت. العدّاد مو حي — نحدّثه أول ما يرجع الاتصال.
            </Label>
          : <InfoCard t={t}>
              <Row t={t} align="baseline">
                <Label t={t} role="title" color={left.urgency === "last" ? "alert" : left.urgency === "soon" ? "warning" : "accent"}>
                  {Reservation.describeRemaining(left.minutes)}
                </Label>
                <Label t={t} role="body" color="inkMuted">{left.expired ? "انتهى وقت الحجز" : "باقية على الحجز"}</Label>
              </Row>
            </InfoCard>
      ) : (
        <InfoCard t={t} muted>
          <Label t={t} role="headline" color="inkMuted">
            {p.kind === "collected" ? "استلمت هذا الطلب" : "انتهى وقت هذا الحجز"}
          </Label>
        </InfoCard>
      )}

      {p.kind === "held" ? (
        <Row t={t} justify="center">
          <Secondary t={t} label="اتصال بالصيدلية" onPress={p.onCall} />
        </Row>
      ) : null}
    </Screen>
  );
}

/** V4 — D39. They confirmed and then could not. */
function Refused({ t, branchName, reopened, history, onBack, onAction }: ReservationProps & { branchName: string; reopened: boolean }) {
  const view = resolveView(contract("V4"), { kind: "ready" }, GRAPH, history, PATIENT_FLOWS);
  return (
    <Screen
      t={t} view={view} onBack={onBack} onAction={onAction}
      footer={reopened && view.primary
        // D39 — the request re-opens automatically, so the action moves the
        // patient forward instead of asking them to start again.
        ? <Primary t={t} label={view.primary.label} onPress={() => onAction(view.primary!.leadsTo)} />
        : undefined}
    >
      <InfoCard t={t}>
        <Label t={t} role="headline">
          {branchName ? `${branchName} ما كدرت تحجزلك` : "انلغى الحجز"}
        </Label>
        {/* Names the situation, never the patient, and never the pharmacist
            (D37): stock moves, and saying so plainly is the honest version. */}
        <Label t={t} role="body" color="inkMuted">
          {reopened
            ? "الدواء انباع قبل ما نوصلهم. رجعنا نسأل صيدليات ثانية — ما تحتاج تعيد الطلب."
            : "ما عاد عدك حجز فعّال."}
        </Label>
      </InfoCard>
    </Screen>
  );
}
