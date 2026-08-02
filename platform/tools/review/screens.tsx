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
import { OffersScreen } from "../../apps/patient/src/screens/OffersScreen.jsx";
import { ReservationScreen } from "../../apps/patient/src/screens/ReservationScreen.jsx";
import * as Offers from "../../apps/patient/src/model/offers.js";
import * as Reservation from "../../apps/patient/src/model/reservation.js";
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

/* ── The second half of the loop ──────────────────────────────────────── */

const oLine = (id: string, name: string, answer: Offers.OfferLine["answer"]): Offers.OfferLine =>
  ({ requestLineId: id, itemName: name, answer } as Offers.OfferLine);

const anOffer = (over: Partial<Offers.Offer> = {}): Offers.Offer => ({
  offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
  distanceM: 800, honoured: "trusted", state: "sent", openNow: true,
  lines: [oLine("l1", "بانادول", { kind: "available", priceMinor: 3_000 })],
  ...over,
});

const THREE_OFFERS: readonly Offers.Offer[] = [
  anOffer({
    offerId: "o1", branchName: "صيدلية الرشيد", distanceM: 800, honoured: "trusted",
    lines: [
      oLine("l1", "بانادول", { kind: "available", priceMinor: 4_000 }),
      oLine("l2", "أموكسيسيلين", { kind: "available", priceMinor: 5_000 }),
    ],
  }),
  anOffer({
    offerId: "o2", branchName: "صيدلية النور", distanceM: 200, honoured: null,
    lines: [
      oLine("l1", "بانادول", { kind: "available", priceMinor: 1_000 }),
      oLine("l2", "أموكسيسيلين", { kind: "unavailable", reason: "out_of_stock" }),
    ],
  }),
  anOffer({
    offerId: "o3", branchName: "صيدلية بغداد", distanceM: 3_400, honoured: "needs_attention", openNow: false,
    lines: [
      oLine("l1", "بانادول", { kind: "substitute", priceMinor: 2_500, itemId: "x", note: "نفس المادة الفعالة" }),
      oLine("l2", "أموكسيسيلين", { kind: "available", priceMinor: 6_000 }),
    ],
  }),
];

const offersProps = (offers: readonly Offers.Offer[]) => ({
  t, offers: offers.map((o) => Offers.summarise(o, ["l1", "l2"])), requestedLines: 2,
  history: ["R7"], loading: false, staleOfferName: null,
  onChoose: noop, onDetails: noop, onBack: noop, onAction: noop,
});

const HOLD_AT = 1_000_000;
const aHold = (over: Partial<Reservation.Hold> = {}): Reservation.Hold => ({
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد",
  branchPhone: "07701234567", address: "الكرادة، شارع ٦٢، مقابل المستشفى",
  confirmedAt: instant(HOLD_AT), expiresAt: instant(HOLD_AT + 2 * 60 * 60_000),
  totalMinor: 9_000,
  lines: [
    { itemName: "بانادول", packs: 2, priceMinor: 4_000 },
    { itemName: "أموكسيسيلين", packs: 1, priceMinor: 5_000 },
  ],
  ...over,
});

const resProps = (view: Reservation.ReservationView, now = HOLD_AT, freshness: Reservation.Freshness = { kind: "live" }) => ({
  t, view, freshness, history: ["R8"], now,
  onCancel: noop, onCall: noop, onDirections: noop, onBack: noop, onAction: noop,
});

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
    id: "R8-offers", screen: "R8", state: "ready · three answers",
    note: "Coverage before price, order stated as not-a-ranking (D12), reliability as a band (D11), a substitution flagged as needing consent, and the missing medicine named rather than counted.",
    element: <OffersScreen {...offersProps(THREE_OFFERS)} />,
  },
  {
    id: "R8-empty", screen: "R8", state: "empty",
    note: "No offer has arrived yet. The way back to waiting is the action, in thumb reach.",
    element: <OffersScreen {...offersProps([])} loading={false} />,
  },
  {
    id: "R8-withdrawn", screen: "R8", state: "ready · one withdrawn",
    note: "An offer withdrawn between render and tap is shown as unavailable rather than as a control that will fail.",
    element: <OffersScreen {...offersProps([THREE_OFFERS[0]!, { ...THREE_OFFERS[1]!, state: "withdrawn" }])} />,
  },
  {
    id: "V1-requesting", screen: "V1", state: "loading",
    note: "The clock starts at held and nowhere earlier — no countdown here, because nothing has been set aside yet.",
    element: <ReservationScreen {...resProps(Reservation.requesting("صيدلية الرشيد"))} />,
  },
  {
    id: "V2-held", screen: "V2", state: "ready",
    note: "The screen that must never fail. The code is the largest thing on it, grouped so it can be read aloud at a counter.",
    element: <ReservationScreen {...resProps({ kind: "held", hold: aHold() })} />,
  },
  {
    id: "V2-last", screen: "V2", state: "ready · nearly expired",
    note: "The countdown turns urgent near the end rather than staying calm to the last minute.",
    element: <ReservationScreen {...resProps({ kind: "held", hold: aHold() }, HOLD_AT + 115 * 60_000)} />,
  },
  {
    id: "V2-cached", screen: "V2", state: "offline",
    note: "The code still renders from cache; the countdown says it is the last thing we heard. Presenting it as live would send someone to a lapsed hold.",
    element: <ReservationScreen {...resProps({ kind: "held", hold: aHold() }, HOLD_AT + 3 * 60_000, { kind: "cached", asOf: instant(HOLD_AT) })} />,
  },
  {
    id: "V4-refused", screen: "V4", state: "ready",
    note: "D39 — they confirmed and then could not. It names the situation rather than the pharmacist, and the request has already re-opened.",
    element: <ReservationScreen {...resProps({ kind: "refused", branchName: "صيدلية الرشيد", reopened: true })} />,
  },
  {
    id: "R7-queued", screen: "R7", state: "offline · queued",
    note: "D27 at its most important: no countdown, no progress bar, and the words come from the outbox.",
    element: <WaitingScreen t={t} sent={sentWith(false, "now")} history={["R6"]} now={1_000} urgency="now" offerCount={0} onBack={noop} onAction={noop} />,
  },
];
