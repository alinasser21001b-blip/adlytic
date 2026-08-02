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
    expect(texts(root)).toContain("ما في ترتيب مدفوع");
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

  it("flags a substitution as needing consent, never pre-accepted (§4 R10)", () => {
    const sub = offer({ lines: [line("l1", "بانادول", { kind: "substitute", priceMinor: 2_000, itemId: "x", note: "نفس المادة" })] });
    expect(texts(render(<OffersScreen {...offersBase} offers={summarise([sub], ["l1"])} requestedLines={1} />)))
      .toContain("تحتاج موافقتك");
  });

  it("a withdrawn offer is shown as unavailable rather than as a tap that will fail", () => {
    const gone = offer({ state: "withdrawn" });
    const root = render(<OffersScreen {...offersBase} offers={summarise([gone], ["l1"])} requestedLines={1} />);
    expect(texts(root)).toContain("ما عاد متاح");
    expect(pressables(root).some((p) => String(p.props["accessibilityLabel"]).startsWith("احجز"))).toBe(false);
  });

  it("choosing names the pharmacy, so a screen reader says which one", () => {
    const onChoose = vi.fn();
    const root = render(<OffersScreen {...offersBase} offers={summarise([full], ["l1", "l2"])} requestedLines={2} onChoose={onChoose} />);
    const choose = pressables(root).find((p) => p.props["accessibilityLabel"] === "احجز من صيدلية الرشيد")!;
    choose.props["onPress"]();
    expect(onChoose).toHaveBeenCalledWith("o1");
  });

  it("no offers yet is an empty state that offers a way back to waiting", () => {
    const root = render(<OffersScreen {...offersBase} offers={[]} requestedLines={2} />);
    expect(texts(root)).toContain("ما وصل عرض بعد");
  });
});

const hold = (over: Partial<Reservation.Hold> = {}): Reservation.Hold => ({
  reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد",
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
    expect(texts(render(<ReservationScreen {...resBase} view={held} />))).toContain("4K D2 P9");
  });

  it("shows the time left, the branch and the total", () => {
    const shown = texts(render(<ReservationScreen {...resBase} view={held} />));
    expect(shown).toContain("120");
    expect(shown).toContain("صيدلية الرشيد");
    expect(shown).toContain("3,000 دينار");
  });

  it("turns urgent near the end rather than staying calm to the last minute", () => {
    const late = render(<ReservationScreen {...resBase} view={held} now={1_000_000 + 115 * 60_000} />);
    const bars = late.findAll((n) => typeof n.type === "string" && flatten(n.props["style"])["backgroundColor"] === t.color.alert);
    expect(bars.length).toBeGreaterThan(0);
  });

  it("a cached countdown says it is cached — sending someone to a lapsed hold is the failure this prevents", () => {
    const root = render(<ReservationScreen {...resBase} view={held} freshness={{ kind: "cached", asOf: instant(1_000_000 - 4 * 60_000) }} />);
    const shown = texts(root);
    expect(shown).toContain("ممكن يكون تغيّر");
    // The code still renders from cache: it is what the patient holds up.
    expect(shown).toContain("4K D2 P9");
  });

  it("keeps the directions action in the footer, within thumb reach", () => {
    const onDirections = vi.fn();
    const root = render(<ReservationScreen {...resBase} view={held} onDirections={onDirections} />);
    pressables(root).find((p) => p.props["accessibilityLabel"] === "خذني للصيدلية")!.props["onPress"]();
    expect(onDirections).toHaveBeenCalled();
  });

  it("a collected reservation stops offering to navigate to it", () => {
    const root = render(<ReservationScreen {...resBase} view={{ kind: "collected", hold: hold() }} />);
    expect(texts(root)).toContain("استلمت هذا الطلب");
    expect(pressables(root).some((p) => p.props["accessibilityLabel"] === "خذني للصيدلية")).toBe(false);
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

describe("the second half of the loop holds the same rules as the first", () => {
  const screens: readonly [string, React.ReactElement][] = [
    ["R8", <OffersScreen {...offersBase} offers={summarise([offer(), offer({ offerId: "o2", branchName: "صيدلية النور" })], ["l1"])} requestedLines={1} />],
    ["V1", <ReservationScreen {...resBase} view={Reservation.requesting("ص")} />],
    ["V2", <ReservationScreen {...resBase} view={{ kind: "held", hold: hold() }} />],
    ["V4", <ReservationScreen {...resBase} view={{ kind: "refused", branchName: "ص", reopened: true }} />],
  ];

  for (const [name, el] of screens) {
    it(`${name} keeps every control above the 44pt floor with a readable label`, () => {
      for (const p of pressables(render(el))) {
        const s = flatten(p.props["style"]);
        const h = (s["minHeight"] ?? s["height"]) as number | undefined;
        expect(h, `${name}: "${p.props["accessibilityLabel"]}" has no height`).toBeTypeOf("number");
        expect(h!, `${name}: "${p.props["accessibilityLabel"]}" is ${h}pt`).toBeGreaterThanOrEqual(44);
        expect(p.props["accessibilityLabel"]).toBeTruthy();
      }
    });

    it(`${name} has at most one filled accent control`, () => {
      const filled = pressables(render(el)).filter((p) => flatten(p.props["style"])["backgroundColor"] === t.color.accent);
      expect(filled.length, `${name} has ${filled.length}`).toBeLessThanOrEqual(1);
    });

    it(`${name} offers no action twice`, () => {
      const labels = pressables(render(el))
        .map((p) => String(p.props["accessibilityLabel"]))
        .filter((l) => l !== "رجوع" && !l.startsWith("احجز من"));
      const seen = new Set<string>();
      expect(labels.filter((l) => (seen.has(l) ? true : (seen.add(l), false)))).toEqual([]);
    });
  }
});
