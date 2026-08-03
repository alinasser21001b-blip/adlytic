/**
 * The journey, walked through the rendered app — not through the reducer.
 *
 * @blueprint §4 · D26 · §3.1 · E4 · E5 · E6
 * @owner patient-app
 * @why Every other suite in this app proves a PART. The store proves the app
 *      decides correctly, the screen tests prove each screen shows what it
 *      decided, and the contract tests prove the graph has no traps. All of
 *      them passed while the application was broken in the most basic way
 *      available to it: `App.tsx`'s switch had no case for E4, so a guest who
 *      finished a request and pressed «كمّل» was redirected by the session
 *      guard, fell through `default`, and was drawn the SEARCH screen — thrown
 *      backwards, mid-journey, with no sentence explaining it. Ten built
 *      screens were unreachable that way and not one test noticed, because no
 *      test ever pressed a control and looked at what came next.
 *
 *      This one does. It presses what a patient presses and reads what a
 *      patient reads, so a screen that exists but cannot be reached is a
 *      failure here rather than a discovery in a browser.
 */
import { describe, expect, it } from "vitest";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { App, type Runtime } from "../App.js";
import type { CatalogueHit } from "../ports.js";

const HIT: CatalogueHit = {
  itemId: "i1", name: "بانادول", latinName: "Panadol", form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false,
};

/**
 * A runtime whose ports answer. `hasOrderScope` is true so that the ONE thing
 * standing between this test's guest and the request is the session — which is
 * what the E4 redirect is about. The authority gap after verification is TD-4
 * and is deliberately not hidden by this fixture.
 */
const runtime = (over: Partial<Runtime> = {}): Runtime => ({
  catalogue: { search: async () => ({ kind: "fresh", value: { hits: [HIT], at: 1_000 } }) },
  identity: {
    requestCode: async () => ({ kind: "fresh", value: { challengeId: "ch-1", resendAfter: 45 } }),
    verify: async () => ({ kind: "fresh", value: { kind: "verified", accountId: "acc-1", subjectId: "sub-1" } }),
  },
  env: { now: () => 1_000, newId: () => "id-1", online: () => true },
  deviceId: "dev-1",
  startFlush: () => {},
  capture: () => {},
  emit: () => {},
  telemetry: { emit: () => {} },
  authority: () => ({ hasOrderScope: true, activeSubjectMemorialised: false, districtId: "d1" }),
  onEffectFailed: (_e, cause) => { throw cause; },
  ...over,
} as Runtime);

/** Host elements only: a component and the host element it renders carry the
 *  same props, so counting both finds one control twice. */
const controls = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === "string" && n.props["accessibilityRole"] === "button", { deep: true });

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

/** Drives the real root and lets a test act on it the way a finger does. */
function open(rt: Runtime) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<App rt={rt} />); });
  const root = () => renderer.root;

  const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  const press = async (label: string) => {
    const control = controls(root()).find((c) => c.props["accessibilityLabel"] === label);
    if (!control) throw new Error(`no control labelled «${label}» — on screen: ${texts(root()).slice(0, 200)}`);
    await act(async () => { (control.props["onPress"] as () => void)(); });
    await settle();
  };

  const type = async (value: string, index = 0) => {
    const field = root().findAll((n) => typeof n.type === "string" && String(n.type) === "TextInput")[index];
    if (!field) throw new Error(`no field #${index} — on screen: ${texts(root()).slice(0, 200)}`);
    await act(async () => { (field.props["onChangeText"] as (v: string) => void)(value); });
    await settle();
  };

  return { root, press, type, settle, said: () => texts(root()), unmount: () => act(() => { renderer.unmount(); }) };
}

describe("a guest is carried into sign-in rather than thrown back to search", () => {
  it("pressing «كمّل» on a finished request opens E4, not the search screen", async () => {
    // The exact defect: this used to land on F1 with the draft intact and no
    // explanation, which reads as the app losing the request.
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");

    expect(app.said()).toContain("نحتاج رقمك حتى نخبرك عندما ترد الصيدليات");
    // ...and NOT the search screen it used to fall through to.
    expect(app.said()).not.toContain("دوّر باسم الدواء");
    app.unmount();
  });

  it("E4 names the request that was interrupted", async () => {
    // D26 — «طلبك محفوظ» with nothing naming the request is a reassurance the
    // patient has to take on faith at the moment they have least reason to.
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");

    expect(app.said()).toContain("طلبك محفوظ");
    expect(app.said()).toContain("بانادول");
    app.unmount();
  });

  it("E4 offers a way out at all", async () => {
    // WHERE it leads is a separate defect and a separate fix: E4 dismisses to
    // S1, S1 is contracted but has no component, and the root's `default` then
    // draws the search screen — so this control currently does the opposite of
    // what it says. That is TD-19, and it is not papered over here.
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");

    expect(controls(app.root()).some((c) => c.props["accessibilityLabel"] === "مو هسه — رجعني لطلبي")).toBe(true);
    app.unmount();
  });
});

describe("the sign-in chain runs end to end from the app root", () => {
  it("E4 → E5 → E6, and E6 shows the number back", async () => {
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");

    await app.press("أدخل رقمي");
    expect(app.said()).toContain("شنو رقم موبايلك؟");

    await app.type("07701234567");
    await app.press("أرسل الرمز");

    expect(app.said()).toContain("اكتب الرمز");
    // The number, grouped the way it is read aloud. A code screen that does
    // not repeat it leaves someone who mistyped a digit no way to find out.
    expect(app.said()).toContain("٧٧٠ ١٢٣ ٤٥٦٧");
    app.unmount();
  });

  it("a verified code resumes the request the guard interrupted", async () => {
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");
    await app.type("123456");
    await app.press("تأكيد");

    // D26 — back at R6, the screen they were refused, not at a root.
    expect(app.said()).toContain("تأكيد الطلب");
    app.unmount();
  });

  it("a wrong code says how many tries are left instead of just failing", async () => {
    const app = open(runtime({
      identity: {
        requestCode: async () => ({ kind: "fresh", value: { challengeId: "ch-1", resendAfter: 45 } }),
        verify: async () => ({ kind: "fresh", value: { kind: "wrongCode", attemptsLeft: 3 } }),
      },
    }));
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");
    await app.type("000000");
    await app.press("تأكيد");

    expect(app.said()).toContain("باقيلك ٣ محاولات");
    app.unmount();
  });

  it("an SMS that never sends leaves a way out rather than a spinner", async () => {
    // `requestCode` answers a failure with no challenge, deliberately — so E6
    // is where a patient whose SMS was never sent is sitting, and the resend
    // is the only thing that gets them out of it.
    const app = open(runtime({
      identity: {
        requestCode: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "no signal" } }),
        verify: async () => ({ kind: "fresh", value: { kind: "verified", accountId: "acc-1", subjectId: "sub-1" } }),
      },
    }));
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");

    expect(controls(app.root()).some((c) => c.props["accessibilityLabel"] === "أرسل رمز جديد")).toBe(true);
    app.unmount();
  });
});
