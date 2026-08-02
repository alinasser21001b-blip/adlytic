/**
 * Every screen, in every state the Blueprint declares for it.
 *
 * This is the review's subject list. It is deliberately exhaustive per screen
 * rather than one happy-path shot each: the states are where a product either
 * feels considered or feels unfinished, and a gallery that photographs only the
 * happy path is a gallery that hides the work.
 */
import * as React from "react";
import { themeFor } from "../../apps/patient/src/ui/theme.js";
import { FindScreen } from "../../apps/patient/src/screens/FindScreen.jsx";
import { DraftScreen } from "../../apps/patient/src/screens/DraftScreen.jsx";
import { ConfirmScreen } from "../../apps/patient/src/screens/ConfirmScreen.jsx";
import { WaitingScreen } from "../../apps/patient/src/screens/WaitingScreen.jsx";
import * as DraftModel from "../../apps/patient/src/model/draft.js";
import { send } from "../../apps/patient/src/model/send.js";
import { empty } from "@dawai/offline";
import { instant } from "@dawai/domain";
import type { CatalogueHit, Environment } from "../../apps/patient/src/ports.js";

const t = themeFor("light");
const noop = () => {};
const NOW = 10_000;

const hit = (over: Partial<CatalogueHit> = {}): CatalogueHit => ({
  itemId: "i1", name: "بانادول", latinName: "Panadol", form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

const three: readonly CatalogueHit[] = [
  hit(),
  hit({ itemId: "i2", name: "أموكسيسيلين", latinName: "Amoxicillin", strength: "500 ملغم", form: "كبسولات", requiresPrescription: true }),
  hit({ itemId: "i3", name: "ترامادول", latinName: "Tramadol", strength: "50 ملغم", form: "أقراص", isControlled: true }),
];

const find = (over: Record<string, unknown>) => (
  <FindScreen t={t} history={["F1"]} now={NOW} onType={noop} onAdd={noop} onBack={noop} onAction={noop} {...over as never} />
);

const draftOf = (...hits: readonly CatalogueHit[]) => {
  let d = DraftModel.newDraft("subject-1", "district-1");
  for (const h of hits) d = DraftModel.add(d, h).draft;
  return d;
};

const draftBase = {
  t, history: ["S1"], refusal: null, redirectBecause: null,
  onSetPacks: noop, onRemove: noop, onContinue: noop, onBack: noop, onAction: noop, onDismissRefusal: noop,
} as const;

const confirmBase = {
  t, history: ["R1"], refusal: null, redirectBecause: null, sending: false,
  onSetUrgency: noop, onSend: noop, onBack: noop, onAction: noop,
} as const;

const env = (online: boolean): Environment => ({ now: () => 1_000, newId: () => "key-1", online: () => online });
const sentWith = (online: boolean, urgency: "now" | "today" | "soon") => {
  const d = DraftModel.setUrgency(draftOf(hit()), urgency);
  const r = send(d, empty(), env(online), instant(1_000));
  if (!r.ok) throw new Error("review fixture failed to send");
  return r.sent;
};

export type Shot = {
  readonly id: string;
  readonly screen: string;
  readonly state: string;
  /** Why this state exists and what it is meant to achieve. */
  readonly note: string;
  readonly element: React.ReactElement;
};

export const SHOTS: readonly Shot[] = [
  {
    id: "F1-empty", screen: "F1", state: "empty · teaching",
    note: "The first thing a new patient sees. It teaches what to do rather than reporting that there is no data.",
    element: find({ search: { kind: "idle" }, history: [] }),
  },
  {
    id: "F2-loading", screen: "F2", state: "loading",
    note: "A skeleton shaped like the rows that are coming, so the page does not jump when they arrive.",
    element: find({ search: { kind: "loading", query: "بانادول" } }),
  },
  {
    id: "F2-results", screen: "F2", state: "results",
    note: "Three rows covering all three clinical answers: ordinary, prescription-required (D18), and controlled (D42) — refused on the row, before the tap.",
    element: find({ search: { kind: "results", query: "دواء", hits: three, at: 9_000 } }),
  },
  {
    id: "F2-empty", screen: "F2", state: "empty · miss",
    note: "§13.1 — the catalogue is incomplete, not the patient wrong. The miss feeds catalogue growth.",
    element: find({ search: { kind: "empty", query: "زيبرا" } }),
  },
  {
    id: "F2-offline", screen: "F2", state: "offline",
    note: "Cached rows, labelled with their age. Never presented as live.",
    element: find({ search: { kind: "offline", query: "بانادول", hits: [three[0]!], cachedAt: NOW - 5 * 60_000 } }),
  },
  {
    id: "F2-error", screen: "F2", state: "error",
    note: "§23 — what failed, that the work survived, and one thing to press.",
    element: find({ search: { kind: "error", query: "بانادول", reason: "status 503" } }),
  },
  {
    id: "R1-empty", screen: "R1", state: "empty · teaching",
    note: "An empty draft states the line limit as a fact rather than waiting to enforce it as a wall.",
    element: <DraftScreen {...draftBase} draft={null} />,
  },
  {
    id: "R1-lines", screen: "R1", state: "ready",
    note: "The pack stepper (D07), the remaining-line count, and a prescription line naming what it still needs.",
    element: <DraftScreen {...draftBase} draft={draftOf(three[0]!, three[1]!)} />,
  },
  {
    id: "R1-refused", screen: "R1", state: "error · refusal",
    note: "D42 refused in place. The draft the patient already built stays on screen behind it.",
    element: <DraftScreen {...draftBase} draft={draftOf(three[0]!)} refusal={{ code: "CONTROLLED_NOT_SUPPORTED" }} />,
  },
  {
    id: "R6-online", screen: "R6", state: "ready",
    note: "D09's three windows, each stating its real duration so the choice is informed.",
    element: <ConfirmScreen {...confirmBase} draft={draftOf(three[0]!)} online />,
  },
  {
    id: "R6-offline", screen: "R6", state: "offline",
    note: "D27 — the button promises only what the app can do without a connection.",
    element: <ConfirmScreen {...confirmBase} draft={draftOf(three[0]!)} online={false} />,
  },
  {
    id: "R7-waiting", screen: "R7", state: "empty · waiting",
    note: "A bar with a value rather than a spinner: the patient learns how much longer, not merely that something is happening.",
    element: <WaitingScreen t={t} sent={sentWith(true, "now")} history={["R6"]} now={1_000 + 6 * 60_000} urgency="now" offerCount={0} onBack={noop} onAction={noop} />,
  },
  {
    id: "R7-queued", screen: "R7", state: "offline · queued",
    note: "D27 at its most important: no countdown, no progress bar, and the words come from the outbox.",
    element: <WaitingScreen t={t} sent={sentWith(false, "now")} history={["R6"]} now={1_000} urgency="now" offerCount={0} onBack={noop} onAction={noop} />,
  },
];
