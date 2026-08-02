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
import { View } from "react-native";
import { instant } from "@dawai/domain";
import { PATIENT_FLOWS } from "@dawai/navigation";
import * as Reservation from "../model/reservation.js";
import { formatPrice } from "../model/offers.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH, isBuilt } from "../app/store.js";
import { Screen, Label, Digits, Primary, Secondary, InfoCard } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";

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

/** V2 — the code, the clock, the address. */
function Held(p: ReservationProps & { hold: Reservation.Hold; kind: "held" | "collected" | "expired" }) {
  const { t, hold } = p;
  const left = Reservation.timeLeft(hold, instant(p.now));
  const cached = p.freshness.kind === "cached";
  const phase: Phase = cached ? { kind: "offline", ageMs: p.now - p.freshness.asOf } : { kind: "ready" };
  const view = resolveView(contract("V2"), phase, GRAPH, p.history, PATIENT_FLOWS);

  const tone = left.urgency === "last" ? "alert" : left.urgency === "soon" ? "warning" : "accent";

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={p.kind === "held" ? <Primary t={t} label="خذني للصيدلية" onPress={p.onDirections} /> : undefined}
    >
      {/* The code is the largest thing on the screen. It is what the patient
          holds up at a counter, sometimes in bright sun, sometimes with a
          child on one arm. */}
      <View style={{
        padding: t.space[7], gap: t.space[3], alignItems: "center",
        borderRadius: t.radius.xl, backgroundColor: t.color.surfaceRaised,
        borderWidth: 1, borderColor: t.color.line,
      }}>
        <Label t={t} role="caption" color="inkMuted">رقم الحجز</Label>
        <Digits t={t} value={Reservation.readableCode(hold.code)} role="display" />
        <Label t={t} role="caption" color="inkSubtle">اعطيه للصيدلي</Label>
      </View>

      {p.kind === "held" ? (
        <InfoCard t={t}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: t.space[2] }}>
            <Digits t={t} value={left.minutes} role="title" />
            <Label t={t} role="body" color={tone}>{left.expired ? "انتهى وقت الحجز" : "دقيقة باقية على الحجز"}</Label>
          </View>
          <View style={{ height: t.space[2], borderRadius: t.radius.pill, backgroundColor: t.color.surfaceSunken, overflow: "hidden" }}>
            <View style={{ width: `${Math.round(left.fraction * 100)}%`, height: "100%", backgroundColor: t.color[tone] }} />
          </View>
          {cached
            // Never presented as live. A cached countdown shown as current
            // sends someone to a pharmacy for a hold that already lapsed.
            ? <Label t={t} role="caption" color="inkSubtle">آخر تحديث وصلنا — ممكن يكون تغيّر</Label>
            : null}
        </InfoCard>
      ) : (
        <InfoCard t={t} muted>
          <Label t={t} role="headline" color="inkMuted">
            {p.kind === "collected" ? "استلمت هذا الطلب" : "انتهى وقت هذا الحجز"}
          </Label>
        </InfoCard>
      )}

      <InfoCard t={t}>
        <Label t={t} role="headline">{hold.branchName}</Label>
        <Label t={t} role="body" color="inkMuted">{hold.address}</Label>
      </InfoCard>

      <InfoCard t={t}>
        {hold.lines.map((l) => (
          <View key={l.itemName} style={{ flexDirection: "row", alignItems: "baseline", gap: t.space[2] }}>
            <Label t={t} role="body">{l.itemName}</Label>
            <Digits t={t} value={l.packs} role="body" />
            <Label t={t} role="caption" color="inkMuted">علبة</Label>
            <View style={{ flex: 1 }} />
            <Label t={t} role="body" color="inkMuted">{formatPrice(l.priceMinor)}</Label>
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: t.space[2] }}>
          <Label t={t} role="headline">المجموع</Label>
          <View style={{ flex: 1 }} />
          <Label t={t} role="headline">{formatPrice(hold.totalMinor)}</Label>
        </View>
      </InfoCard>

      {p.kind === "held" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space[2] }}>
          <Secondary t={t} label="اتصل بالصيدلية" onPress={p.onCall} />
          {isBuilt("V5") ? <Secondary t={t} label="ألغِ الحجز" onPress={p.onCancel} /> : null}
        </View>
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
