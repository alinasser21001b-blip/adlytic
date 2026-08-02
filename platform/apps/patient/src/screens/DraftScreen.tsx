/**
 * R1 — the lines the patient is asking for.
 *
 * @blueprint R1 · D07 · D18 · D42 · clinical.gate.refused
 * @owner patient-app
 * @why This is the screen where a request stops being an idea. Three things it
 *      must do and a list view would not: show how many lines are left, so the
 *      limit is a visible fact rather than a wall; name the lines still missing
 *      a prescription photo, so D18 is discovered here rather than at R6; and
 *      word a refusal from the domain in place, keeping the rest of the draft.
 */
import { View, Pressable } from "react-native";
import type { Refusal } from "@dawai/domain";
import { PATIENT_FLOWS } from "@dawai/navigation";
import * as DraftModel from "../model/draft.js";
import { resolveView } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH, isBuilt } from "../app/store.js";
import { Screen, Label, Bidi, Digits, Primary, Secondary, RedirectNote } from "../ui/kit.js";
import { word } from "../ui/refusal.js";
import type { Theme } from "../ui/theme.js";

const R1 = CORE_LOOP.find((c) => c.id === "R1")!;

export type DraftProps = {
  readonly t: Theme;
  readonly draft: DraftModel.Draft | null;
  readonly history: readonly string[];
  readonly refusal: Refusal | null;
  readonly redirectBecause: string | null;
  readonly onSetPacks: (itemId: string, packs: number) => void;
  readonly onRemove: (itemId: string) => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
  readonly onDismissRefusal: () => void;
};

export function DraftScreen(p: DraftProps) {
  const { t, draft } = p;
  const lines = draft?.lines ?? [];
  const view = resolveView(
    R1,
    // An empty draft is the teaching state, not a failure. A refusal is shown
    // beside the draft rather than replacing it, so nothing the patient built
    // disappears behind an error.
    lines.length === 0 ? { kind: "empty", isSuccess: false } : { kind: "ready" },
    GRAPH, p.history, PATIENT_FLOWS,
  );
  const missing = draft ? DraftModel.linesNeedingPrescription(draft) : [];
  const blocked = draft ? DraftModel.validate(draft) : null;

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={lines.length > 0 ? (
        <Primary
          t={t}
          label={view.primary?.label ?? "كمّل"}
          // A disabled control here is a courtesy; the guard at send is the
          // control (§5 rule 1). It is disabled with the reason visible above,
          // never disabled silently.
          disabled={blocked !== null}
          onPress={p.onContinue}
        />
      ) : null}
    >
      <RedirectNote t={t} because={p.redirectBecause} />

      {p.refusal ? <RefusalNote t={t} refusal={p.refusal} onDismiss={p.onDismissRefusal} onAction={p.onAction} /> : null}

      {lines.map((line) => (
        <LineRow key={line.itemId} t={t} line={line} onSetPacks={p.onSetPacks} onRemove={p.onRemove} />
      ))}

      {lines.length > 0 ? (
        <Label t={t} role="caption" color="inkMuted">
          {`تكدر تضيف ${DraftModel.remainingLines(draft!)} أدوية بعد`}
        </Label>
      ) : null}

      {missing.length > 0 ? (
        <View style={{ padding: t.space[4], borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken, gap: t.space[2] }}>
          <Label t={t} role="body" color="warning">
            {`${missing.length === 1 ? "دواء واحد" : `${missing.length} أدوية`} يحتاج وصفة`}
          </Label>
          <Primary t={t} label="صوّر الوصفة" onPress={() => p.onAction("R2")} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: t.space[2] }}>
        {R1.secondary.filter((s) => isBuilt(s.leadsTo)).map((s) => (
          <Secondary key={s.label} t={t} label={s.label} onPress={() => p.onAction(s.leadsTo)} />
        ))}
      </View>
    </Screen>
  );
}

function RefusalNote({ t, refusal, onDismiss, onAction }: { t: Theme; refusal: Refusal; onDismiss: () => void; onAction: (to: string) => void }) {
  const said = word(refusal);
  return (
    <View style={{ padding: t.space[4], gap: t.space[3], borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken, borderWidth: 1, borderColor: t.color.alert }}>
      <Label t={t} role="body" color="alert">{said.says}</Label>
      <View style={{ flexDirection: "row-reverse", gap: t.space[3] }}>
        {said.action ? <Secondary t={t} label={said.action} onPress={() => onAction("R2")} /> : null}
        <Secondary t={t} label="تمام" onPress={onDismiss} />
      </View>
    </View>
  );
}

/** D07 — the unit is the pack, and the stepper says so. Both controls clear
 *  the 44pt floor, because this is a screen used one-handed. */
function LineRow({ t, line, onSetPacks, onRemove }: { t: Theme; line: DraftModel.DraftLine; onSetPacks: (id: string, n: number) => void; onRemove: (id: string) => void }) {
  const step = (n: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={n > 0 ? `زيادة ${line.name}` : `تقليل ${line.name}`}
      onPress={() => onSetPacks(line.itemId, line.packs + n)}
      style={{
        width: t.tap.min, height: t.tap.min, alignItems: "center", justifyContent: "center",
        borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken,
      }}
    >
      <Label t={t} role="title" color="accent">{n > 0 ? "+" : "−"}</Label>
    </Pressable>
  );

  return (
    <View style={{ padding: t.space[4], gap: t.space[3], borderRadius: t.radius.lg, backgroundColor: t.color.surfaceRaised, borderWidth: 1, borderColor: t.color.line }}>
      <Label t={t} role="headline">{line.name}</Label>
      <Bidi t={t} text={`${line.latinName} · ${line.strength} · ${line.form}`} role="caption" color="inkMuted" />

      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: t.space[3] }}>
        {step(1)}
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: t.space[1] }}>
          <Digits t={t} value={line.packs} role="headline" />
          <Label t={t} role="body" color="inkMuted">علبة</Label>
        </View>
        {step(-1)}
        <View style={{ flex: 1 }} />
        <Secondary t={t} label="شيله" onPress={() => onRemove(line.itemId)} />
      </View>

      {line.requiresPrescription ? (
        <Label t={t} role="caption" color={line.prescriptionImageId ? "inkMuted" : "warning"}>
          {line.prescriptionImageId ? "الوصفة مرفقة" : "يحتاج صورة الوصفة"}
        </Label>
      ) : null}
    </View>
  );
}
