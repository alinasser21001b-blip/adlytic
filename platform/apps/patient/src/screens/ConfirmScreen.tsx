/**
 * R6 — the last look before it goes.
 *
 * @blueprint R6 · D09 · D27 · request.broadcast
 * @owner patient-app
 * @why The only screen in the loop whose job is to be read rather than used.
 *      Two things it must state and a summary card would not: what "الآن"
 *      actually means as a duration, because D09 fixed three windows and a
 *      patient choosing between them deserves the number; and that a request
 *      sent without a connection will WAIT, said before the tap rather than
 *      discovered after it (D27).
 */
import { View, Pressable } from "react-native";
import { Marketplace, type Refusal } from "@dawai/domain";
import { PATIENT_FLOWS } from "@dawai/navigation";
import * as DraftModel from "../model/draft.js";
import { resolveView } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "../app/store.js";
import { Screen, Label, Digits, Primary, RedirectNote } from "../ui/kit.js";
import { word } from "../ui/refusal.js";
import type { Theme } from "../ui/theme.js";

const R6 = CORE_LOOP.find((c) => c.id === "R6")!;

/** D09's three windows, worded with their duration. "خلال يومين" rather than
 *  "هذا الأسبوع" is the Blueprint's own wording and is deliberately concrete. */
const WINDOWS: readonly { readonly urgency: Marketplace.Urgency; readonly label: string; readonly says: string }[] = [
  { urgency: "now", label: "الآن", says: "نسأل الصيدليات ونستنى ٢٠ دقيقة" },
  { urgency: "today", label: "اليوم", says: "نستنى ٤ ساعات" },
  { urgency: "soon", label: "خلال يومين", says: "نستنى يومين" },
];

export type ConfirmProps = {
  readonly t: Theme;
  readonly draft: DraftModel.Draft;
  readonly history: readonly string[];
  readonly online: boolean;
  readonly refusal: Refusal | null;
  readonly redirectBecause: string | null;
  readonly sending: boolean;
  readonly onSetUrgency: (u: Marketplace.Urgency) => void;
  readonly onSend: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function ConfirmScreen(p: ConfirmProps) {
  const { t, draft } = p;
  const blocked = DraftModel.validate(draft);
  const view = resolveView(
    R6,
    p.refusal ? { kind: "error", detail: p.refusal.code }
      : !p.online ? { kind: "offline", ageMs: null }
      : { kind: "ready" },
    GRAPH, p.history, PATIENT_FLOWS,
  );

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={
        <Primary
          t={t}
          // D27 — the button says what will actually happen. Offering "أرسل
          // الطلب" with no connection promises something the app cannot do.
          label={p.online ? "أرسل الطلب" : "أرسله أول ما يرجع الاتصال"}
          disabled={blocked !== null}
          busy={p.sending}
          onPress={p.onSend}
        />
      }
    >
      <RedirectNote t={t} because={p.redirectBecause} />

      {blocked ? (
        <View style={{ padding: t.space[4], borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken }}>
          <Label t={t} role="body" color="warning">{word(blocked).says}</Label>
        </View>
      ) : null}

      <View style={{ gap: t.space[2] }}>
        {draft.lines.map((l) => (
          <View key={l.itemId} style={{
            flexDirection: "row", alignItems: "center", gap: t.space[3],
            padding: t.space[4], borderRadius: t.radius.lg,
            backgroundColor: t.color.surfaceRaised, borderWidth: 1, borderColor: t.color.line,
          }}>
            <View style={{ flex: 1 }}>
              <Label t={t} role="headline">{l.name}</Label>
              <Label t={t} role="caption" color="inkMuted">{`${l.strength} · ${l.form}`}</Label>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.space[1] }}>
              <Digits t={t} value={l.packs} role="headline" />
              <Label t={t} role="caption" color="inkMuted">علبة</Label>
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: t.space[2] }}>
        <Label t={t} role="headline">شكد مستعجل؟</Label>
        {WINDOWS.map((w) => {
          const chosen = draft.urgency === w.urgency;
          return (
            <Pressable
              key={w.urgency}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${w.label} — ${w.says}`}
              onPress={() => p.onSetUrgency(w.urgency)}
              style={{
                minHeight: t.tap.patientPrimary, justifyContent: "center",
                paddingHorizontal: t.space[4], borderRadius: t.radius.lg,
                borderWidth: chosen ? 2 : 1,
                borderColor: chosen ? t.color.accent : t.color.line,
                backgroundColor: chosen ? t.color.surfaceRaised : t.color.surface,
              }}
            >
              <Label t={t} role="headline" color={chosen ? "accent" : "ink"}>{w.label}</Label>
              <Label t={t} role="caption" color="inkMuted">{w.says}</Label>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
