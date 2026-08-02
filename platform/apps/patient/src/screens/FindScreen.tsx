/**
 * F1 and F2 — searching for a medicine.
 *
 * @blueprint F1 · F2 · §13.1 · search.unmatched
 * @owner patient-app
 * @why One screen renders two contracts because the patient experiences one
 *      thing: a box they type in. Which contract is live is decided by the
 *      search state, not by a navigation event — a results screen pushed on top
 *      of a search screen makes the back gesture clear the query, which is the
 *      most annoying possible way to lose someone mid-search.
 */
import { View, TextInput } from "react-native";
import * as Search from "../model/search.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "../app/store.js";
import { PATIENT_FLOWS } from "@dawai/navigation";
import { Screen, Label, Bidi, Primary, Secondary } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import type { CatalogueHit } from "../ports.js";

const contract = (id: string) => CORE_LOOP.find((c) => c.id === id)!;

/** The state the screen is in, derived from the search rather than tracked
 *  separately — two sources for one truth is how a spinner survives its data. */
function phaseOf(s: Search.SearchState, now: number): Phase {
  switch (s.kind) {
    case "idle": return { kind: "empty", isSuccess: false };
    case "loading": return { kind: "loading" };
    case "empty": return { kind: "empty", isSuccess: false };
    case "error": return { kind: "error", detail: s.reason };
    case "offline": return { kind: "offline", ageMs: now - s.cachedAt };
    case "results": return { kind: "ready" };
  }
}

export type FindProps = {
  readonly t: Theme;
  readonly search: Search.SearchState;
  readonly history: readonly string[];
  readonly now: number;
  readonly onType: (raw: string) => void;
  readonly onAdd: (hit: CatalogueHit) => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function FindScreen({ t, search, history, now, onType, onAdd, onBack, onAction }: FindProps) {
  const id = search.kind === "idle" ? "F1" : "F2";
  const view = resolveView(contract(id), phaseOf(search, now), GRAPH, history, PATIENT_FLOWS);
  const hits = search.kind === "results" || search.kind === "offline" ? search.hits : [];

  return (
    <Screen t={t} view={view} onBack={onBack} onAction={onAction}>
      <TextInput
        accessibilityLabel="اسم الدواء"
        placeholder="اكتب اسم الدواء"
        placeholderTextColor={t.color.inkSubtle}
        defaultValue={search.kind === "idle" ? "" : search.query}
        onChangeText={onType}
        style={{
          minHeight: t.tap.patientPrimary,
          borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.color.line,
          backgroundColor: t.color.surfaceRaised,
          paddingHorizontal: t.space[4],
          fontFamily: t.fontFamily, fontSize: t.type.body.size, color: t.color.ink,
          textAlign: "right", writingDirection: t.direction,
        }}
      />

      {hits.map((hit) => <HitRow key={hit.itemId} t={t} hit={hit} onAdd={onAdd} />)}
    </Screen>
  );
}

/**
 * One result. The clinical answer comes from the domain and is shown BEFORE
 * the tap: a controlled item says so on the row rather than refusing after the
 * patient has committed to it (D42).
 */
function HitRow({ t, hit, onAdd }: { t: Theme; hit: CatalogueHit; onAdd: (h: CatalogueHit) => void }) {
  const a = Search.availability(hit);
  return (
    <View style={{
      padding: t.space[4], gap: t.space[2],
      borderRadius: t.radius.lg, backgroundColor: t.color.surfaceRaised,
      borderWidth: 1, borderColor: t.color.line,
    }}>
      <Label t={t} role="headline">{hit.name}</Label>
      <Bidi t={t} text={`${hit.latinName} · ${hit.strength} · ${hit.form}`} role="caption" color="inkMuted" />

      {a.requestable ? (
        <>
          {a.needsPrescription
            // D18 stated up front, so the photo is expected rather than sprung.
            ? <Label t={t} role="caption" color="warning">يحتاج وصفة — راح نطلب صورتها</Label>
            : null}
          <Primary t={t} label="أضفه للطلب" onPress={() => onAdd(hit)} />
        </>
      ) : (
        <Label t={t} role="caption" color="inkMuted">
          {a.refusal === "CONTROLLED_NOT_SUPPORTED"
            ? "ما ينطلب من التطبيق — لازم تروح للصيدلية"
            : "ما ينطلب من التطبيق"}
        </Label>
      )}
    </View>
  );
}

/** The secondary actions the contract declares, rendered only where this build
 *  can honour them. A control that does nothing is the defect being avoided. */
export const SecondaryRow = ({ t, labels, onAction }: { t: Theme; labels: readonly { label: string; leadsTo: string }[]; onAction: (to: string) => void }) => (
  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: t.space[2] }}>
    {labels.map((s) => <Secondary key={s.leadsTo + s.label} t={t} label={s.label} onPress={() => onAction(s.leadsTo)} />)}
  </View>
);
