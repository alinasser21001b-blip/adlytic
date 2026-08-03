/**
 * Every screen, in every state the Blueprint declares for it.
 *
 * @blueprint §4 · §22 · §23
 * @owner patient-app
 * @why ONE registry, two consumers. The review gallery photographs these and
 *      the product-rule audit renders these — so a screen state cannot be
 *      photographed without being audited, and cannot be audited without
 *      appearing in the review. It lives in the app rather than in the review
 *      tooling because the app owns its own screens; a registry maintained
 *      beside the tooling is a second list, and a second list goes stale.
 *
 *      It is deliberately exhaustive per screen rather than one happy-path
 *      shot each: the states are where a product either feels considered or
 *      feels unfinished, and a gallery that photographs only the happy path is
 *      a gallery that hides the work.
 */
import * as React from "react";
import { themeFor } from "../ui/theme.js";
import { FindScreen, type FindProps } from "./FindScreen.jsx";
import { DraftScreen } from "./DraftScreen.jsx";
import { ConfirmScreen } from "./ConfirmScreen.jsx";
import { WaitingScreen } from "./WaitingScreen.jsx";
import * as DraftModel from "../model/draft.js";
import { send } from "../model/send.js";
import { empty } from "@dawai/offline";
import { instant } from "@dawai/domain";
import { OffersScreen } from "./OffersScreen.jsx";
import { WhyNumberScreen } from "./WhyNumberScreen.jsx";
import { PhoneEntryScreen, CodeEntryScreen, NameScreen, DistrictScreen } from "./OnboardingScreens.jsx";
import * as Onboarding from "../model/onboarding.js";
import { DISTRICTS } from "../data/districts.js";
import { ReservationScreen } from "./ReservationScreen.jsx";
import * as Offers from "../model/offers.js";
import * as Reservation from "../model/reservation.js";
import { PrescriptionScreen } from "./PrescriptionScreen.jsx";
import { OfferDetailScreen } from "./OfferDetailScreen.jsx";
import * as Prescription from "../model/prescription.js";
import * as Consent from "../model/consent.js";
import type { CatalogueHit, Environment } from "../ports.js";

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

const find = (over: Partial<FindProps> & Pick<FindProps, "search">) => (
  <FindScreen t={t} history={["F1"]} now={NOW} onType={noop} onAdd={noop} onBack={noop} onAction={noop} {...over} />
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

/* ── Onboarding fixtures ──────────────────────────────────────────────── */

const codeStatus = (used: number, age: number): Onboarding.CodeStatus =>
  Onboarding.codeStatus(
    { challengeId: "c1", state: used >= 5 ? "spent" : "sent", used, issuedAt: instant(0) },
    instant(age),
  );

/* The districts are the app's bundled list, not a fixture written for the
   gallery. They used to be a copy declared here, which meant the E8 a reviewer
   approved and the E8 a patient would see were reading different data. */

/* ── The second half of the loop ──────────────────────────────────────── */

/** Typed rather than cast: the cast that used to be here hid a missing
 *  substitute name, and the gallery would have rendered "undefined" as a
 *  medicine a patient was asked to consent to. */
function oLine(
  id: string, name: string, answer: Offers.OfferLine["answer"],
  sub?: { readonly name: string; readonly latinName: string; readonly by: Offers.ProposedBy },
  latinName = "",
): Offers.OfferLine {
  if (answer.kind === "substitute") {
    if (!sub) throw new Error("a substitute line needs its substitute and its author");
    return {
      requestLineId: id, itemName: name, latinName, answer,
      substituteName: sub.name, substituteLatinName: sub.latinName, proposedBy: sub.by,
    };
  }
  if (answer.kind === "available") return { requestLineId: id, itemName: name, latinName, answer };
  return { requestLineId: id, itemName: name, latinName, answer };
}

/** D19 — a verified pharmacist, as the platform's registration record holds
 *  them. Never a self-description. */
const DR_AHMED: Offers.ProposedBy = { name: "د. أحمد", licenceVerified: true, branchName: "صيدلية الرشيد" };

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
      oLine("l1", "بانادول", { kind: "substitute", priceMinor: 2_500, itemId: "x", note: "نفس المادة الفعالة" },
        { name: "سيتامول", latinName: "Cetamol", by: DR_AHMED }, "Panadol"),
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
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد", holderName: "أم علي",
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

/* ── Prescription capture and substitution consent ────────────────────── */

const rxProps = (capture: Prescription.Capture) => ({
  t, capture, history: ["R1"],
  onCapture: noop, onConfirm: noop, onRetake: noop, onTypeInstead: noop,
  onBack: noop, onAction: noop,
});

const SUBS: readonly Consent.Substitution[] = [{
  requestLineId: "l1",
  requestedName: "بانادول",
  requestedLatinName: "Panadol",
  offeredName: "سيتامول",
  offeredLatinName: "Cetamol",
  offeredItemId: "x1",
  priceMinor: 2_500,
  pharmacistNote: "نفس المادة الفعالة (باراسيتامول ٥٠٠ ملغم)، إنتاج شركة ثانية",
  proposedBy: DR_AHMED,
}];

const SUB_OFFER = anOffer({
  offerId: "sub", branchName: "صيدلية الرشيد",
  lines: [
    oLine("l1", "بانادول", { kind: "substitute", priceMinor: 2_500, itemId: "x1", note: "نفس المادة الفعالة" },
      { name: "سيتامول", latinName: "Cetamol", by: DR_AHMED }, "Panadol"),
    oLine("l2", "أموكسيسيلين", { kind: "available", priceMinor: 5_000 }),
  ],
});

const detailProps = (consent: Consent.ConsentState) => ({
  t,
  summary: Offers.summarise(SUB_OFFER, ["l1", "l2"]),
  consent,
  requestedLines: 2,
  history: ["R8"],
  withdrawn: false,
  onDecide: noop, onReserve: noop, onBack: noop, onAction: noop,
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
    id: "R2-camera", screen: "R2", state: "ready",
    note: "Says what a PHARMACIST will need to read, because Phase 0 reads nothing itself (D18). The alternative to the camera is offered before it is needed.",
    element: <PrescriptionScreen {...rxProps(Prescription.ready())} />,
  },
  {
    id: "R2-refused", screen: "R2", state: "permission refused",
    note: "Never a wall: the alternative IS the primary action. Offering a disabled camera button would be offering a bolted door.",
    element: <PrescriptionScreen {...rxProps(Prescription.fromPermission("denied"))} />,
  },
  {
    id: "R3-review", screen: "R3", state: "ready",
    note: "The patient judges legibility because nothing else does — so the screen states what 'clear' means instead of asking them to guess.",
    element: <PrescriptionScreen {...rxProps(Prescription.captured("img-1", "file://a.jpg"))} />,
  },
  {
    id: "R3-failed", screen: "R3", state: "error",
    note: "The upload failed; the photo survived. D37 — the failure names the fixable condition, never the person.",
    element: <PrescriptionScreen {...rxProps(Prescription.failed(Prescription.captured("img-1", "file://a.jpg"), "timeout"))} />,
  },
  {
    id: "R9-undecided", screen: "R9", state: "ready · consent outstanding",
    note: "§4 R10 — neither answer is pre-selected and both carry identical visual weight. The offer cannot be reserved until the question is answered.",
    element: <OfferDetailScreen {...detailProps(Consent.begin("sub", SUBS))} />,
  },
  {
    id: "R9-agreed", screen: "R9", state: "ready · consent given",
    note: "Once answered, the offer can proceed. The decision can still be changed until the offer is accepted.",
    element: <OfferDetailScreen {...detailProps(Consent.decide(Consent.begin("sub", SUBS), "l1", "agreed"))} />,
  },
  {
    id: "R9-refused", screen: "R9", state: "ready · substitution refused",
    note: "Refusing costs nothing: D06 sends the refused line to a child request, and the screen says so — a patient who thinks 'no' loses the order will say yes to a brand they did not want.",
    element: <OfferDetailScreen {...detailProps(Consent.decide(Consent.begin("sub", SUBS), "l1", "refused"))} />,
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
    id: "E4-guarded", screen: "E4", state: "ready",
    note: "§3.1 — the one hard ask, explained before it is made. The reason shown is the guard's own sentence, so the screen cannot state a different one than the redirect did, and D26's preserved request is named rather than merely promised.",
    element: (
      <WhyNumberScreen
        t={t}
        preserved="أموكسيسيلين + باراسيتامول"
        because="نحتاج رقمك حتى نخبرك عندما ترد الصيدليات"
        history={["R1"]}
        onBack={noop}
        onAction={noop}
      />
    ),
  },
  {
    id: "E4-direct", screen: "E4", state: "ready · no preserved action",
    note: "Reached deliberately rather than by a guard, so there is no work to name — the strip is absent instead of reassuring about nothing.",
    element: (
      <WhyNumberScreen
        t={t}
        preserved={null}
        because="نحتاج رقمك حتى نخبرك عندما ترد الصيدليات"
        history={[]}
        onBack={noop}
        onAction={noop}
      />
    ),
  },
  {
    id: "E5-empty", screen: "E5", state: "ready",
    note: "The one hard ask, made. Nothing is marked wrong until enough has been typed for it to be wrong — a field that turns red on the first keystroke is the app arguing mid-sentence.",
    element: <PhoneEntryScreen t={t} typed="" history={["E4"]} online onType={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E5-malformed", screen: "E5", state: "error · malformed",
    note: "E5's declared failure, worded as a typo rather than an accusation, and stating the rule the number has to satisfy instead of only that it does not.",
    element: <PhoneEntryScreen t={t} typed="0770123" history={["E4"]} online onType={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E5-country", screen: "E5", state: "error · unsupported country",
    note: "The other declared failure, and deliberately a different sentence: a number we cannot serve is our limit, not the patient's mistake.",
    element: <PhoneEntryScreen t={t} typed="+9715012345678" history={["E4"]} online onType={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E5-offline", screen: "E5", state: "offline",
    note: "A verification cannot be queued — the SMS leaves now or not at all — so this says so plainly rather than accepting a tap that would go nowhere.",
    element: <PhoneEntryScreen t={t} typed="07701234567" history={["E4"]} online={false} onType={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E6-waiting", screen: "E6", state: "ready",
    note: "The number is shown back, so a patient who mistyped one digit can see it here rather than discovering it by failing five times.",
    element: <CodeEntryScreen t={t} phone="٧٧٠ ١٢٣ ٤٥٦٧" typed="" status={codeStatus(0, 20_000)} checking={false} refusalCode={null} history={["E5"]} online onType={noop} onSubmit={noop} onResend={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E6-wrong", screen: "E6", state: "error · wrong code",
    note: "Attempts remaining are stated. A patient who does not know how many tries are left will guess, and guessing is how the attempts get spent.",
    element: <CodeEntryScreen t={t} phone="٧٧٠ ١٢٣ ٤٥٦٧" typed="123456" status={codeStatus(3, 60_000)} checking={false} refusalCode="WRONG_CODE" history={["E5"]} online onType={noop} onSubmit={noop} onResend={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E6-exhausted", screen: "E6", state: "error · attempts exhausted",
    note: "Exhausted attempts, told without blame and with the way out attached: «ما صار شي — نرسللك رمز جديد».",
    element: <CodeEntryScreen t={t} phone="٧٧٠ ١٢٣ ٤٥٦٧" typed="123456" status={codeStatus(5, 60_000)} checking={false} refusalCode="ATTEMPTS_EXHAUSTED" history={["E5"]} online onType={noop} onSubmit={noop} onResend={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E6-expired", screen: "E6", state: "error · expired",
    note: "An expired code is not a wrong answer, and does not cost an attempt — the app does not charge a patient for its own clock.",
    element: <CodeEntryScreen t={t} phone="٧٧٠ ١٢٣ ٤٥٦٧" typed="" status={codeStatus(1, 11 * 60_000)} checking={false} refusalCode={null} history={["E5"]} online onType={noop} onSubmit={noop} onResend={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E6-checking", screen: "E6", state: "loading",
    note: "The one moment in onboarding that talks to a server, shown as busy on the control itself rather than as a screen-wide spinner.",
    element: <CodeEntryScreen t={t} phone="٧٧٠ ١٢٣ ٤٥٦٧" typed="123456" status={codeStatus(0, 20_000)} checking refusalCode={null} history={["E5"]} online onType={noop} onSubmit={noop} onResend={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E7-empty", screen: "E7", state: "ready",
    note: "Why before what: the name exists so a pharmacist can hand a bag to the right person, and the screen says so before asking.",
    element: <NameScreen t={t} typed="" history={["E6"]} onType={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E7-typed", screen: "E7", state: "ready · with a name",
    note: "E4 promised a pharmacy sees only the first name. Here that promise is SHOWN, before submission, rather than kept somewhere the patient cannot check.",
    element: <NameScreen t={t} typed="أم علي حسن" history={["E6"]} onType={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E8-list", screen: "E8", state: "ready",
    note: "Location refused is not a failure path here because location is never asked for: the bundled list IS the route, and the screen says «ما نحتاج موقعك».",
    element: <DistrictScreen t={t} districts={DISTRICTS} query="" chosen={null} history={["E7"]} onSearch={noop} onChoose={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E8-chosen", screen: "E8", state: "ready · chosen",
    note: "A choice made, and an uncovered district still visible and still honest about why it cannot be picked (E12).",
    element: <DistrictScreen t={t} districts={DISTRICTS} query="" chosen="d1" history={["E7"]} onSearch={noop} onChoose={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "E8-nomatch", screen: "E8", state: "empty · no match",
    note: "A search with no result, which says what happened and nothing more — there is no action to offer that the patient is not already taking.",
    element: <DistrictScreen t={t} districts={DISTRICTS} query="زززز" chosen={null} history={["E7"]} onSearch={noop} onChoose={noop} onSubmit={noop} onBack={noop} onAction={noop} />,
  },
  {
    id: "R7-queued", screen: "R7", state: "offline · queued",
    note: "D27 at its most important: no countdown, no progress bar, and the words come from the outbox.",
    element: <WaitingScreen t={t} sent={sentWith(false, "now")} history={["R6"]} now={1_000} urgency="now" offerCount={0} onBack={noop} onAction={noop} />,
  },
];
