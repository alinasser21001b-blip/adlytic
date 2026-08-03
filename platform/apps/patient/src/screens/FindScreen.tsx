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
import * as Search from "../model/search.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "../app/store.js";

import { ActionCard, Actions, Bidi, InfoCard, Label, Screen, SearchField, Secondary } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import type { CatalogueHit } from "../ports.js";
import { PATIENT_FLOWS } from "./flows.js";

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
    <Screen
      t={t} view={view} onBack={onBack} onAction={onAction}
      sticky={
        <SearchField
          t={t}
          label="اسم الدواء"
          placeholder="اكتب اسم الدواء"
          value={search.kind === "idle" ? "" : search.query}
          onType={onType}
        />
      }
    >
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
  const detail = `${hit.strength} · ${hit.form}`;

  // A refused item is information, not a control. Offering a tap that will be
  // rejected teaches the patient that the app's buttons cannot be trusted.
  if (!a.requestable) {
    return (
      <InfoCard t={t} muted>
        <Label t={t} role="headline" color="inkMuted">{hit.name}</Label>
        <Bidi t={t} text={hit.latinName} role="caption" color="inkSubtle" />
        <Label t={t} role="caption" color="inkSubtle">{detail}</Label>
        <Label t={t} role="caption" color="inkMuted">
          {a.refusal === "CONTROLLED_NOT_SUPPORTED"
            ? "ما ينطلب من التطبيق — لازم تروح للصيدلية"
            : "ما ينطلب من التطبيق"}
        </Label>
      </InfoCard>
    );
  }

  return (
    // The label names the medicine: a screen reader moving down a list of
    // "أضفه للطلب" cannot tell the patient which one they are on.
    <ActionCard t={t} label={`أضف ${hit.name} للطلب`} onPress={() => onAdd(hit)}>
      <Label t={t} role="headline">{hit.name}</Label>
      <Bidi t={t} text={hit.latinName} role="caption" color="inkMuted" />
      <Label t={t} role="caption" color="inkMuted">{detail}</Label>
      {a.needsPrescription
        // D18 stated up front, so the photo is expected rather than sprung.
        ? <Label t={t} role="caption" color="warning">يحتاج وصفة — راح نطلب صورتها</Label>
        : null}
    </ActionCard>
  );
}

/** The secondary actions the contract declares, rendered only where this build
 *  can honour them. A control that does nothing is the defect being avoided. */
export const SecondaryRow = ({ t, labels, onAction }: { t: Theme; labels: readonly { label: string; leadsTo: string }[]; onAction: (to: string) => void }) => (
  <Actions t={t}>
    {labels.map((s) => <Secondary key={s.leadsTo + s.label} t={t} label={s.label} onPress={() => onAction(s.leadsTo)} />)}
  </Actions>
);
