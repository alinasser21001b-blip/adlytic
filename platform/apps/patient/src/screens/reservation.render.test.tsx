/**
 * R8, V1, V2 and V4, rendered.
 *
 * @blueprint R8 · V1 · V2 · V4 · D06 · D11 · D12 · D39 · §4 V2
 * @owner patient-app
 * @why The second half of the loop is where the product either earns trust or
 *      loses it: a patient chooses where to walk, then stands at a counter
 *      holding a code. These pin the properties that decide that — coverage
 *      read before price, no ranking, a band and never a decimal, no countdown
 *      before stock is set aside, and a cached countdown that says it is
 *      cached.
 */
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import TestRenderer, { type ReactTestInstance } from "react-test-renderer";
import { instant } from "@dawai/domain";
import { themeFor } from "../ui/theme.js";
import { OffersScreen } from "./OffersScreen.jsx";
import { ReservationScreen } from "./ReservationScreen.jsx";
import * as Offers from "../model/offers.js";
import * as Reservation from "../model/reservation.js";

const t = themeFor("light");
const noop = () => {};
const render = (el: React.ReactElement) => TestRenderer.create(el).root;

const pressables = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === "string"
    && (n.props["accessibilityRole"] === "button" || n.props["accessibilityRole"] === "radio"), { deep: true });

function texts(root: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (child: unknown): void => {
    if (typeof child === "string" || typeof child === "number") out.push(String(child));
    else if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === "object" && "props" in (child as { props?: unknown }))
      walk((child as { props: { children?: unknown } }).props.children);
  };
  for (const n of root.findAll((n) => typeof n.type === "string" && String(n.type) === "Text")) walk(n.props["children"]);
  return out.join(" ");
}

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : (style as Record<string, unknown>) ?? {};

const line = (id: string, name: string, answer: Offers.OfferLine["answer"]): Offers.OfferLine =>
  ({ requestLineId: id, itemName: name, answer } as Offers.OfferLine);

const offer = (over: Partial<Offers.Offer> = {}): Offers.Offer => ({
  offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
  distanceM: 800, honoured: "trusted", state: "sent", openNow: true,
  lines: [line("l1", "بانادول", { kind: "available", priceMinor: 3_000 })],
  ...over,
});

const summarise = (offers: readonly Offers.Offer[], lines: readonly string[]) =>
  offers.map((o) => Offers.summarise(o, lines));

const offersBase = { t, history: ["R7"], loading: false, staleOfferName: null, onChoose: noop, onDetails: noop, onBack: noop, onAction: noop } as const;

describe("R8 — choosing where to walk", () => {
  const partial = offer({
    offerId: "o2", branchName: "صيدلية النور", distanceM: 200, honoured: null,
    lines: [
      line("l1", "بانادول", { kind: "available", priceMinor: 1_000 }),
      line("l2", "أموكسيسيلين", { kind: "unavailable", reason: "out_of_stock" }),
    ],
  });
  const full = offer({
    offerId: "o1", branchName: "صيدلية الرشيد",
    lines: [
      line("l1", "بانادول", { kind: "available", priceMinor: 4_000 }),
      line("l2", "أموكسيسيلين", { kind: "available", priceMinor: 5_000 }),
    ],
  });

  it("says out loud that the order is not a ranking (D12)", () => {
    const root = render(<OffersScreen {...offersBase} offers={summarise([full], ["l1", "l2"])} requestedLines={2} />);
    // The delivery's own wording: no pharmacy is favoured, and there are no ads.
    expect(texts(root)).toContain("ما نرجّح صيدلية على صيدلية، وما في إعلانات");
  });

  it("reads the offer that covers more first, even when it costs more", () => {
    const root = render(<OffersScreen {...offersBase} offers={summarise([partial, full], ["l1", "l2"])} requestedLines={2} />);
    const shown = texts(root);
    expect(shown.indexOf("صيدلية الرشيد")).toBeLessThan(shown.indexOf("صيدلية النور"));
  });

  it("names which medicine is missing, not merely how many", () => {
    const root = render(<OffersScreen {...offersBase} offers={summarise([partial], ["l1", "l2"])} requestedLines={2} />);
    expect(texts(root)).toContain("ناقص: أموكسيسيلين");
  });

  it("states reliability as a band and never as a number (D11)", () => {
    const root = render(<OffersScreen {...offersBase} offers={summarise([full, partial], ["l1", "l2"])} requestedLines={2} />);
    const shown = texts(root);
    expect(shown).toContain("تلتزم بالحجز");
    expect(shown).toContain("جديدة على التطبيق");
    expect(shown).not.toMatch(/\d+%/);
  });

  it("flags a substitution and never presents it as already accepted (§4 R10)", () => {
    const sub = offer({ lines: [line("l1", "بانادول", { kind: "substitute", priceMinor: 2_000, itemId: "x", note: "نفس المادة" })] });
    const root = render(<OffersScreen {...offersBase} offers={summarise([sub], ["l1"])} requestedLines={1} />);
    expect(texts(root)).toContain("فيها بديل");
    // The consent itself lives on R9. What R8 must never do is let a tap here
    // carry the patient past it — so the row opens the offer and says so.
    expect(texts(root)).toContain("الحجز ما يصير قبل ما تأكد");
    expect(pressables(root).every((x) => !String(x.props["accessibilityLabel"]).startsWith("احجز"))).toBe(true);
  });

  it("a withdrawn offer is shown as unavailable rather than as a tap that will fail", () => {
    const gone = offer({ state: "withdrawn" });
    const root = render(<OffersScreen {...offersBase} offers={summarise([gone], ["l1"])} requestedLines={1} />);
    expect(texts(root)).toContain("ما عاد متاح");
    expect(pressables(root).some((p) => String(p.props["accessibilityLabel"]).startsWith("افتح"))).toBe(false);
  });

  it("a row OPENS the offer and never reserves from the list", () => {
    // The build this replaces reserved on this tap, behind a «+» that reads as
    // "add". The delivery is explicit that nothing is reserved before the
    // patient confirms, so the row must reach the detail screen and no further.
    const onChoose = vi.fn();
    const onDetails = vi.fn();
    const root = render(
      <OffersScreen {...offersBase} offers={summarise([full], ["l1", "l2"])} requestedLines={2}
        onChoose={onChoose} onDetails={onDetails} />);
    const open = pressables(root).find((x) => x.props["accessibilityLabel"] === "افتح عرض صيدلية الرشيد")!;
    open.props["onPress"]();
    expect(onDetails).toHaveBeenCalledWith("o1");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("no offers yet is an empty state that offers a way back to waiting", () => {
    const root = render(<OffersScreen {...offersBase} offers={[]} requestedLines={2} />);
    expect(texts(root)).toContain("ما وصل عرض بعد");
  });
});

const hold = (over: Partial<Reservation.Hold> = {}): Reservation.Hold => ({
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد", holderName: "أم علي",
  branchPhone: "07701234567", address: "الكرادة، شارع ٦٢",
  confirmedAt: instant(1_000_000), expiresAt: instant(1_000_000 + 2 * 60 * 60_000),
  totalMinor: 3_000, lines: [{ itemName: "بانادول", packs: 1, priceMinor: 3_000 }],
  ...over,
});

const resBase = {
  t, history: ["R8"], freshness: { kind: "live" } as Reservation.Freshness, now: 1_000_000,
  onCancel: noop, onCall: noop, onDirections: noop, onBack: noop, onAction: noop,
} as const;

describe("V1 — the moment between choosing and confirmation", () => {
  it("shows no countdown, because nothing has been set aside yet", () => {
    const root = render(<ReservationScreen {...resBase} view={Reservation.requesting("صيدلية الرشيد")} />);
    const shown = texts(root);
    expect(shown).toContain("نطلب من صيدلية الرشيد تحجزلك");
    expect(shown).not.toContain("دقيقة باقية");
    expect(root.findAll((n) => n.props["accessibilityValue"] !== undefined)).toHaveLength(0);
  });

  it("tells the patient they need not wait on this screen", () => {
    const root = render(<ReservationScreen {...resBase} view={Reservation.requesting("صيدلية النور")} />);
    expect(texts(root)).toContain("راح نخبرك");
  });
});

describe("V2 — the screen that must never fail", () => {
  const held = { kind: "held" as const, hold: hold() };

  it("shows the code grouped so it can be read aloud", () => {
    // An alphanumeric code stays in one alphabet — converting only its digits
    // produced «٤K D٢ P٩», a code in two scripts.
    expect(texts(render(<ReservationScreen {...resBase} view={held} />))).toContain("4K D2 P9");
  });

  it("shows the time left in hours, the branch and the total", () => {
    const shown = texts(render(<ReservationScreen {...resBase} view={held} />));
    // "120 دقيقة" made a patient do arithmetic before they knew whether to
    // walk or hurry. Hours are how people hold time.
    expect(shown).toContain("ساعتين");
    expect(shown).toContain("صيدلية الرشيد");
    expect(shown).toContain("٣٬٠٠٠ د.ع");
  });

  it("turns urgent near the end rather than staying calm to the last minute", () => {
    const late = render(<ReservationScreen {...resBase} view={held} now={1_000_000 + 115 * 60_000} />);
    // The delivery states the remaining time as text, not as a bar, so urgency
    // is carried by the colour of that text.
    const urgent = late.findAll((n) => typeof n.type === "string" && flatten(n.props["style"])["color"] === t.color.alert);
    expect(urgent.length).toBeGreaterThan(0);
  });

  it("a cached countdown says it is cached — sending someone to a lapsed hold is the failure this prevents", () => {
    const root = render(<ReservationScreen {...resBase} view={held} freshness={{ kind: "cached", asOf: instant(1_000_000 - 4 * 60_000) }} />);
    const shown = texts(root);
    expect(shown).toContain("العدّاد مو حي");
    // The code still renders from cache: it is what the patient holds up.
    expect(shown).toContain("4K D2 P9");
  });

  it("keeps the directions action in the footer, within thumb reach", () => {
    const onDirections = vi.fn();
    const root = render(<ReservationScreen {...resBase} view={held} onDirections={onDirections} />);
    pressables(root).find((p) => p.props["accessibilityLabel"] === "الاتجاهات")!.props["onPress"]();
    expect(onDirections).toHaveBeenCalled();
  });

  it("a collected reservation stops offering to navigate to it", () => {
    const root = render(<ReservationScreen {...resBase} view={{ kind: "collected", hold: hold() }} />);
    expect(texts(root)).toContain("استلمت هذا الطلب");
    expect(pressables(root).some((p) => p.props["accessibilityLabel"] === "الاتجاهات")).toBe(false);
  });
});

describe("V4 — they confirmed and then could not (D39)", () => {
  it("names the situation, not the pharmacist, and says the request re-opened", () => {
    const root = render(<ReservationScreen {...resBase} view={{ kind: "refused", branchName: "صيدلية الرشيد", reopened: true }} />);
    const shown = texts(root);
    expect(shown).toContain("ما كدرت تحجزلك");
    expect(shown).toContain("ما تحتاج تعيد الطلب");
  });

  it("moves the patient forward rather than asking them to start again", () => {
    const onAction = vi.fn();
    const root = render(<ReservationScreen {...resBase} view={{ kind: "refused", branchName: "ص", reopened: true }} onAction={onAction} />);
    pressables(root).find((p) => p.props["accessibilityLabel"] === "شوف العروض الجديدة")!.props["onPress"]();
    expect(onAction).toHaveBeenCalledWith("R8");
  });
});
