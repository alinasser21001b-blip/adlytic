/**
 * The screens, rendered.
 *
 * @blueprint F2 · R1 · R6 · R7 · §22 · §23 · §25 · §26 · D18 · D27 · D42
 * @owner patient-app
 * @why The reducer tests prove the app DECIDES correctly. These prove the
 *      screens SHOW it: that a controlled item is refused on the row rather
 *      than after the tap, that a queued request never renders a countdown,
 *      that there is exactly one primary control, and that every tappable
 *      thing clears the 44pt floor and carries a label a screen reader can
 *      read. Those are the properties a user actually experiences, and none of
 *      them is visible in a state assertion.
 */
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import TestRenderer, { type ReactTestInstance } from "react-test-renderer";
import { themeFor } from "../ui/theme.js";
import { FindScreen } from "./FindScreen.jsx";
import { DraftScreen } from "./DraftScreen.jsx";
import { ConfirmScreen } from "./ConfirmScreen.jsx";
import { WaitingScreen } from "./WaitingScreen.jsx";
import * as DraftModel from "../model/draft.js";
import { send } from "../model/send.js";
import { empty } from "@dawai/offline";
import { instant } from "@dawai/domain";
import type { CatalogueHit, Environment } from "../ports.js";

const t = themeFor("light");
const noop = () => {};

const hit = (over: Partial<CatalogueHit> = {}): CatalogueHit => ({
  itemId: "i1", name: "بانادول", latinName: "Panadol", form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

const render = (el: React.ReactElement) => TestRenderer.create(el).root;

/**
 * Every control the user can press. Restricted to HOST elements: a component
 * and the host element it renders carry the same props, so counting both
 * reports two primary actions on a screen that has one.
 */
const pressables = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === "string"
    && (n.props["accessibilityRole"] === "button" || n.props["accessibilityRole"] === "radio"), { deep: true });

/** Everything the user can actually read, flattened. */
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

/* The universal rules — one primary, 44pt floor, readable labels, no repeated
 * action, one numeral system — now run over every registered screen state in
 * product-rules.test.tsx. What remains here is what only THESE screens owe. */

describe("F2 — the results a patient reads", () => {
  const base = {
    t, history: [], now: 10_000, onType: noop, onAdd: noop, onBack: noop, onAction: noop,
  } as const;

  it("shows the medicine and offers to add it", () => {
    const root = render(<FindScreen {...base} search={{ kind: "results", query: "بانادول", hits: [hit()], at: 9_000 }} />);
    expect(texts(root)).toContain("بانادول");
    // The whole card is the action, and its label names the medicine so a
    // screen reader moving down the list says which one.
    expect(pressables(root).some((p) => p.props["accessibilityLabel"] === "أضف بانادول للطلب")).toBe(true);
  });

  it("refuses a controlled item on the row, so the tap never happens (D42)", () => {
    const root = render(<FindScreen {...base} search={{ kind: "results", query: "x", hits: [hit({ isControlled: true })], at: 9_000 }} />);
    expect(texts(root)).toContain("لازم تروح للصيدلية");
    // Not merely disabled — there is no control at all, so the tap that would
    // be rejected cannot happen.
    expect(pressables(root).some((p) => String(p.props["accessibilityLabel"]).startsWith("أضف"))).toBe(false);
  });

  it("warns that a prescription item will need its photo, before it is added (D18)", () => {
    const root = render(<FindScreen {...base} search={{ kind: "results", query: "x", hits: [hit({ requiresPrescription: true })], at: 9_000 }} />);
    expect(texts(root)).toContain("يحتاج وصفة");
  });

  it("an empty result teaches rather than saying 'no results' (§13.1)", () => {
    const root = render(<FindScreen {...base} search={{ kind: "empty", query: "زيبرا" }} />);
    expect(texts(root)).toContain("ممكن يكون موجود بالصيدليات");
  });

  it("cached rows are labelled with their age, never shown as live", () => {
    const root = render(<FindScreen {...base} search={{ kind: "offline", query: "x", hits: [hit()], cachedAt: 10_000 - 5 * 60_000 }} />);
    const shown = texts(root);
    expect(shown).toContain("ما في اتصال");
    expect(shown).toContain("٥");
  });

  it("a failure names what failed and gives one thing to press (§23)", () => {
    const root = render(<FindScreen {...base} search={{ kind: "error", query: "x", reason: "status 503" }} />);
    expect(texts(root)).toContain("ما كدرنا نوصل للبحث");
    expect(pressables(root).some((p) => p.props["accessibilityLabel"] === "أعد المحاولة")).toBe(true);
  });
});

describe("R1 — the draft", () => {
  const draft = () => DraftModel.add(DraftModel.newDraft("s", "d"), hit(), 2).draft;
  const base = { t, history: ["S1"], refusal: null, redirectBecause: null, onSetPacks: noop, onRemove: noop, onContinue: noop, onBack: noop, onAction: noop, onDismissRefusal: noop } as const;

  it("shows the quantity in packs and how many lines are left (D07)", () => {
    const root = render(<DraftScreen {...base} draft={draft()} />);
    const shown = texts(root);
    expect(shown).toContain("علبة");
    expect(shown).toContain("٧"); // 8 lines allowed, one used
  });

  it("the stepper changes the quantity of the line it belongs to", () => {
    const onSetPacks = vi.fn();
    const root = render(<DraftScreen {...base} draft={draft()} onSetPacks={onSetPacks} />);
    root.findAll((n) => n.props["accessibilityLabel"] === "زيادة بانادول")[0]!.props["onPress"]();
    expect(onSetPacks).toHaveBeenCalledWith("i1", 3);
  });

  it("a refusal is worded, keeps the draft, and can be dismissed", () => {
    const onDismissRefusal = vi.fn();
    const root = render(<DraftScreen {...base} draft={draft()} refusal={{ code: "CONTROLLED_NOT_SUPPORTED" }} onDismissRefusal={onDismissRefusal} />);
    expect(texts(root)).toContain("ما ينطلب من التطبيق");
    // The line the patient already added is still on screen.
    expect(texts(root)).toContain("بانادول");
    root.findAll((n) => n.props["accessibilityLabel"] === "تمام")[0]!.props["onPress"]();
    expect(onDismissRefusal).toHaveBeenCalled();
  });

  it("a prescription line blocks the primary action and says what is missing (D18)", () => {
    const d = DraftModel.add(DraftModel.newDraft("s", "d"), hit({ requiresPrescription: true })).draft;
    const root = render(<DraftScreen {...base} draft={d} />);
    expect(texts(root)).toContain("يحتاج وصفة");
    const primary = pressables(root).find((p) => p.props["accessibilityLabel"] === "كمّل")!;
    expect(primary.props["accessibilityState"].disabled).toBe(true);
  });

  it("an empty draft teaches instead of showing an empty list (§22)", () => {
    const root = render(<DraftScreen {...base} draft={null} />);
    expect(texts(root)).toContain("تكدر تضيف لحد");
  });

  it("renders no control leading to a screen this build does not contain", () => {
    const root = render(<DraftScreen {...base} draft={draft()} />);
    // R1 declares a "لمن؟" secondary leading to R4, which is built, and
    // nothing pointing at S3, which is not.
    expect(texts(root)).not.toContain("ضيف شخص");
  });
});

describe("R6 — the last look", () => {
  const draft = () => DraftModel.add(DraftModel.newDraft("s", "d"), hit()).draft;
  const base = { t, history: ["R1"], refusal: null, redirectBecause: null, sending: false, onSetUrgency: noop, onSend: noop, onBack: noop, onAction: noop } as const;

  it("states what each urgency window actually means (D09)", () => {
    const root = render(<ConfirmScreen {...base} draft={draft()} online />);
    const shown = texts(root);
    // One numeral system per surface — the copy reads the way it renders.
    expect(shown).toContain("٢٠ دقيقة");
    expect(shown).toContain("٤ ساعات");
    expect(shown).toContain("يومين");
  });

  it("marks the chosen window as selected, for a screen reader too", () => {
    const root = render(<ConfirmScreen {...base} draft={draft()} online />);
    const selected = pressables(root).filter((p) => p.props["accessibilityRole"] === "radio" && p.props["accessibilityState"].selected);
    expect(selected).toHaveLength(1);
  });

  it("offline, the button promises what will actually happen (D27)", () => {
    const root = render(<ConfirmScreen {...base} draft={draft()} online={false} />);
    const shown = texts(root);
    expect(shown).toContain("أرسله أول ما يرجع الاتصال");
    expect(shown).not.toContain("أرسل الطلب");
  });

  it("has exactly one primary action", () => {
    const root = render(<ConfirmScreen {...base} draft={draft()} online />);
    const accent = pressables(root).filter((p) => flatten(p.props["style"])["backgroundColor"] === t.color.accent);
    expect(accent).toHaveLength(1);
  });
});

describe("R7 — the wait", () => {
  const env = (online: boolean): Environment => ({ now: () => 1_000, newId: () => "k", online: () => online });
  const sentWith = (online: boolean) => {
    // "now" so the fixture matches the urgency the screen is told to render —
    // the 20-minute window, not the 4-hour default.
    const d = DraftModel.setUrgency(DraftModel.add(DraftModel.newDraft("s", "d"), hit()).draft, "now");
    const r = send(d, empty(), env(online), instant(1_000));
    if (!r.ok) throw new Error("fixture failed to send");
    return r.sent;
  };
  const base = { t, history: ["R6"], urgency: "now", offerCount: 0, onBack: noop, onAction: noop } as const;

  it("a broadcast request shows how long is left", () => {
    const root = render(<WaitingScreen {...base} sent={sentWith(true)} now={1_000} />);
    const shown = texts(root);
    expect(shown).toContain("٢٠");
    expect(shown).toContain("دقيقة باقية");
    expect(shown).toContain("ننتظر أول رد");
  });

  it("a queued request shows NO countdown and says it has not been sent (D27)", () => {
    const root = render(<WaitingScreen {...base} sent={sentWith(false)} now={1_000} />);
    const shown = texts(root);
    expect(shown).toContain("بانتظار الاتصال");
    expect(shown).toContain("ما وصل للصيدليات بعد");
    expect(shown).not.toContain("دقيقة باقية");
    expect(root.findAll((n) => n.props["accessibilityRole"] === "progressbar")).toHaveLength(0);
  });

  it("the countdown is a bar with a value, not a spinner that says nothing", () => {
    const root = render(<WaitingScreen {...base} sent={sentWith(true)} now={1_000 + 10 * 60_000} />);
    const bar = root.findAll((n) => n.props["accessibilityRole"] === "progressbar")[0]!;
    expect(bar.props["accessibilityValue"].now).toBe(50);
  });
});

describe("every screen answers 'where am I' and 'how do I go back'", () => {
  it("renders a title, and a back control wherever back is a pop", () => {
    const root = render(<FindScreen t={t} history={["F1"]} now={0} search={{ kind: "results", query: "x", hits: [], at: 0 }} onType={noop} onAdd={noop} onBack={noop} onAction={noop} />);
    expect(texts(root)).toContain("نتائج البحث");
    expect(pressables(root).some((p) => p.props["accessibilityLabel"] === "رجوع")).toBe(true);
  });

  it("and no back control at a tab root, where the OS gesture leaves the app", () => {
    const root = render(<FindScreen t={t} history={[]} now={0} search={{ kind: "idle" }} onType={noop} onAdd={noop} onBack={noop} onAction={noop} />);
    expect(pressables(root).some((p) => p.props["accessibilityLabel"] === "رجوع")).toBe(false);
  });
});
