/**
 * R7 — the wait, made legible.
 *
 * @blueprint R7 · D09 · D27 · §6 Request · request.answered · request.unanswered
 * @owner patient-app
 * @why "Make the wait legible" is the screen's stated purpose, and the honest
 *      version of that has two forms rather than one. A broadcast request shows
 *      how long is left, because pharmacies have been asked. A queued request
 *      shows no countdown at all and says plainly that it has not been sent —
 *      a progress bar over a request nobody has received is a lie told to the
 *      most anxious user in the product (D27).
 */
import { View } from "react-native";
import { instant } from "@dawai/domain";
import { PATIENT_FLOWS } from "@dawai/navigation";
import { describe as describeItem, type OutboxItem } from "@dawai/offline";
import { remaining, type Sent } from "../model/send.js";
import { resolveView } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH, isBuilt } from "../app/store.js";
import { Screen, Label, Digits, Secondary } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";

const R7 = CORE_LOOP.find((c) => c.id === "R7")!;

export type WaitingProps = {
  readonly t: Theme;
  readonly sent: Sent;
  readonly history: readonly string[];
  readonly now: number;
  readonly urgency: "now" | "today" | "soon";
  readonly offerCount: number;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function WaitingScreen(p: WaitingProps) {
  const { t, sent } = p;
  const queued = sent.state === "queued";
  const left = remaining(sent.windowEndsAt, p.urgency, instant(p.now));

  const view = resolveView(
    R7,
    // Waiting with nothing yet is a success state, not an absence: we asked,
    // and nobody has answered YET. Offering an action here would invent
    // urgency the patient cannot act on.
    queued ? { kind: "offline", ageMs: null }
      : p.offerCount === 0 ? { kind: "empty", isSuccess: true }
      : { kind: "ready" },
    GRAPH, p.history, PATIENT_FLOWS,
  );

  return (
    <Screen t={t} view={view} onBack={p.onBack} onAction={p.onAction}>
      {queued
        ? <QueuedNote t={t} item={sent.outbox.items[0]} />
        : <Countdown t={t} left={left} offers={p.offerCount} />}

      <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: t.space[2] }}>
        {R7.secondary.filter((s) => isBuilt(s.leadsTo)).map((s) => (
          <Secondary key={s.label} t={t} label={s.label} onPress={() => p.onAction(s.leadsTo)} />
        ))}
      </View>
    </Screen>
  );
}

/** D27 — the words come from the outbox, so no screen can invent a friendlier
 *  phrase for "not yet sent". */
function QueuedNote({ t, item }: { t: Theme; item: OutboxItem | undefined }) {
  return (
    <View style={{ padding: t.space[6], gap: t.space[3], borderRadius: t.radius.lg, backgroundColor: t.color.surfaceSunken }}>
      <Label t={t} role="headline">{item ? describeItem(item) : "بانتظار الاتصال"}</Label>
      <Label t={t} role="body" color="inkMuted">
        ما وصل للصيدليات بعد. أول ما يرجع الاتصال نرسله، وتوصلك الردود هنا.
      </Label>
    </View>
  );
}

function Countdown({ t, left, offers }: { t: Theme; left: { ms: number; fraction: number } | null; offers: number }) {
  const minutes = left ? Math.ceil(left.ms / 60_000) : 0;
  return (
    <View style={{ padding: t.space[6], gap: t.space[4], borderRadius: t.radius.lg, backgroundColor: t.color.surfaceRaised, borderWidth: 1, borderColor: t.color.line }}>
      <Label t={t} role="body" color="inkMuted">سألنا الصيدليات القريبة</Label>

      <View style={{ flexDirection: "row-reverse", alignItems: "baseline", gap: t.space[2] }}>
        <Digits t={t} value={minutes} role="display" />
        <Label t={t} role="body" color="inkMuted">دقيقة باقية</Label>
      </View>

      {/* A bar, not a spinner: a spinner says "working" and tells the patient
          nothing about how much longer. */}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round((left?.fraction ?? 0) * 100), min: 0, max: 100 }}
        style={{ height: t.space[2], borderRadius: t.radius.pill, backgroundColor: t.color.surfaceSunken, overflow: "hidden" }}
      >
        <View style={{ width: `${Math.round((left?.fraction ?? 0) * 100)}%`, height: "100%", backgroundColor: t.color.accent }} />
      </View>

      <Label t={t} role="headline">
        {offers === 0 ? "ننتظر أول رد" : `وصلنا ${offers} ${offers === 1 ? "عرض" : "عروض"}`}
      </Label>
    </View>
  );
}
