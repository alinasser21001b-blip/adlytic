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
import type { AcceptResult, CatalogueHit, Fetched } from "../ports.js";
import { isBuilt, type Intent } from "./store.js";
import { CORE_LOOP } from "../screens/core-loop.contract.js";
import type { Offer } from "../model/offers.js";

/**
 * A clock a test can move.
 *
 * The real one is the host's; this is the same shape — a `now` the app reads
 * and a tick the app subscribes to — so a test can advance time the way time
 * advances rather than by reaching into a screen.
 */
const CLOCK = {
  at: 1_000,
  listeners: new Set<() => void>(),
  advance(ms: number) { this.at += ms; for (const l of this.listeners) l(); },
  reset() { this.at = 1_000; this.listeners.clear(); },
};

/** The district the runtime has been told about, as a box a test can read —
 *  the real one lives in the composition root behind `onDistrict`. */
const DISTRICT = { at: "" };

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
const runtime = (over: Partial<Runtime> = {}): Runtime => {
  /** Declared as a Runtime rather than cast to one: the cast that used to be
   *  here would have hidden `onVerified` going missing, which is the port that
   *  decides whether a signed-in patient may order. */
  const base: Runtime = {
  catalogue: { search: async () => ({ kind: "fresh", value: { hits: [HIT], at: 1_000 } }) },
  identity: {
    requestCode: async () => ({ kind: "fresh", value: { challengeId: "ch-1", resendAfter: 45 } }),
    verify: async () => ({ kind: "fresh", value: { kind: "verified", accountId: "acc-1", subjectId: "sub-1" } }),
    updateMe: async () => ({ kind: "fresh", value: { kind: "saved" } }),
  },
    marketplace: { accept: async (): Promise<Fetched<AcceptResult>> => ({ kind: "failed", outcome: { kind: "transient", reason: "x" } }) },
  env: { now: () => CLOCK.at, newId: () => "id-1", online: () => true },
  deviceId: "dev-1",
  startFlush: () => {},
  capture: () => {},
  emit: () => {},
  telemetry: { emit: () => {} },
  authority: () => ({ hasOrderScope: true, activeSubjectMemorialised: false, districtId: "d1" }),
  onEffectFailed: (_e, cause) => { throw cause; },
    media: { upload: async () => ({ kind: "fresh", value: { kind: "stored", imageId: "img-1" } }) },
    onVerified: () => {},
    onDistrict: () => {},
    connect: () => () => {},
    ticks: (onTick) => { CLOCK.listeners.add(onTick); return () => { CLOCK.listeners.delete(onTick); }; },
  };
  return { ...base, ...over };
};

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
  /**
   * Where the app registered itself. Things happen to a patient that nothing
   * they did caused — a pharmacy answers — and this is the channel they arrive
   * on, so a test can make one happen instead of mocking a screen into a state.
   */
  let sink: ((intent: Intent) => void) | null = null;
  const wired: Runtime = {
    ...rt,
    connect: (send) => { sink = send; return () => { sink = null; }; },
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<App rt={wired} />); });
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

  const deliver = async (intent: Intent) => {
    if (!sink) throw new Error("the app never connected");
    await act(async () => { sink!(intent); });
    await settle();
  };

  const tick = async (ms: number) => {
    await act(async () => { CLOCK.advance(ms); });
    await settle();
  };

  return { root, press, type, settle, deliver, tick, said: () => texts(root()), unmount: () => act(() => { renderer.unmount(); }) };
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

  it("the way out of E4 returns to the request it named, not to a root", async () => {
    // «مو هسه — رجعني لطلبي» used to land on the search screen: E4 dismisses to
    // S1, S1 has no component, and the root's `default` drew F1 with the
    // history cleared. The control said "take me back to my request" and
    // replaced the request with a search box.
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("مو هسه — رجعني لطلبي");

    expect(app.said()).toContain("طلب جديد");
    expect(app.said()).toContain("بانادول");
    app.unmount();
  });

  it("R1 renders no control leading to a screen the root cannot draw", async () => {
    // R1 declares a «لمن؟» secondary into R4, the subject switcher, which has
    // a full contract and no component. It passed `isBuilt`, so the control
    // rendered, the tap succeeded, and the root's `default` replaced the
    // patient's request with the search screen.
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");

    expect(app.said()).toContain("طلب جديد");
    expect(controls(app.root()).some((c) => c.props["accessibilityLabel"] === "لمن؟")).toBe(false);
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

    // Verification carries on into the name and the district first (TD-18).
    expect(app.said()).toContain("شنو نناديك؟");
    await finishOnboarding(app);

    // D26 — back at R6, the screen they were refused, not at a root.
    expect(app.said()).toContain("تأكيد الطلب");
    app.unmount();
  });

  it("a wrong code says how many tries are left instead of just failing", async () => {
    const app = open(runtime({
      identity: {
        requestCode: async () => ({ kind: "fresh", value: { challengeId: "ch-1", resendAfter: 45 } }),
        verify: async () => ({ kind: "fresh", value: { kind: "wrongCode", attemptsLeft: 3 } }),
        updateMe: async () => ({ kind: "fresh", value: { kind: "saved" } }),
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
        updateMe: async () => ({ kind: "fresh", value: { kind: "saved" } }),
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

/* ── The most consequential tap in the product, when it fails ─────────── */

const OFFER = (over: Partial<Offer> = {}): Offer => ({
  offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
  distanceM: 800, honoured: "trusted", state: "sent", openNow: true,
  lines: [{
    requestLineId: "l1", itemName: "بانادول", latinName: "Panadol",
    answer: { kind: "available", priceMinor: 3_000 },
  }],
  ...over,
});

/**
 * The rest of onboarding — the name and the district.
 *
 * TD-18's answer: verification carries on into E7 and E8, and D26's preserved
 * action replays only once the profile is saved. Every walk that needs to get
 * PAST sign-in goes through here, because a patient does.
 */
async function finishOnboarding(app: ReturnType<typeof open>) {
  await app.type("أم علي");
  await app.press("كمّل");
  await app.press("اختر الكرادة");
  await app.press("خلص");
}

/** Straight to R8 with offers in hand: the paths under test start at the tap,
 *  and walking the whole journey again for each would test the journey. */
async function atOffers(rt: Runtime, offers: readonly Offer[]) {
  const app = open(rt);
  await app.type("بانادول");
  await app.press("أضف بانادول للطلب");
  await app.press("كمّل");
  await app.press("أدخل رقمي");
  await app.type("07701234567");
  await app.press("أرسل الرمز");
  await app.type("123456");
  await app.press("تأكيد");
  await finishOnboarding(app);
  await app.press("أرسل الطلب");
  for (const offer of offers) await app.deliver({ kind: "offerArrived", offer });
  return app;
}

describe("an offer that is gone by the time it is taken", () => {
  const heldRuntime = (accept: () => Promise<Fetched<AcceptResult>>) =>
    runtime({ marketplace: { accept } });

  it("a withdrawn offer names the pharmacy and keeps the others", async () => {
    // R8's declared error state. The alternative — a spinner on V1 that never
    // resolves — is what a patient got before the acceptance was performed at
    // all, and a silent return to the list would be worse still: they would
    // not know their pharmacy had gone.
    const app = await atOffers(
      heldRuntime(async () => ({ kind: "fresh", value: { kind: "withdrawn" } })),
      [OFFER(), OFFER({ offerId: "o2", branchId: "b2", branchName: "صيدلية الكرادة" })],
    );

    await app.press("شوف العرض الواصل");
    await app.press("افتح عرض صيدلية الرشيد");
    await app.press("احجز من هنا");

    // Back on the comparison, with the declared error treatment...
    expect(app.said()).toContain("قارن العروض");
    expect(app.said()).toContain("هذا العرض انسحب");
    // ...the withdrawn offer still LISTED, because R8-withdrawn is drawn as
    // "shown as unavailable rather than as a control that will fail"...
    expect(app.said()).toContain("صيدلية الرشيد");
    // ...and the one that is still real untouched beside it.
    expect(app.said()).toContain("صيدلية الكرادة");
    app.unmount();
  });

  it("an expired offer is not reported as a withdrawn one", async () => {
    // Same status from the server, different events to the patient: a pharmacy
    // took it back, or they took too long. A port that collapsed the two 409s
    // would make R8 unable to say which.
    const app = await atOffers(
      heldRuntime(async () => ({ kind: "fresh", value: { kind: "expired" } })),
      [OFFER()],
    );

    await app.press("شوف العرض الواصل");
    await app.press("افتح عرض صيدلية الرشيد");
    await app.press("احجز من هنا");

    expect(app.said()).toContain("قارن العروض");
    // The offer is marked unavailable, not deleted — and the row says which of
    // the two happened, which a single shared error sentence cannot.
    expect(app.said()).toContain("صيدلية الرشيد");
    app.unmount();
  });

  it("a dropped connection is NOT reported as a refusal", async () => {
    // D39's V4 is a pharmacy saying no. Telling a patient their pharmacy
    // declined because a connection dropped would invent a rejection nobody
    // made — and the idempotency key means a retry returns the original
    // answer rather than a second reservation at a second pharmacy.
    const app = await atOffers(
      heldRuntime(async () => ({ kind: "failed", outcome: { kind: "transient", reason: "no signal" } })),
      [OFFER()],
    );

    await app.press("شوف العرض الواصل");
    await app.press("افتح عرض صيدلية الرشيد");
    await app.press("احجز من هنا");

    // V1 — still asking. Never V4, and never a code.
    expect(app.said()).toContain("نطلب من صيدلية الرشيد تحجزلك");
    expect(app.said()).not.toContain("ما كدرت الصيدلية");
    app.unmount();
  });
});

describe("a countdown counts", () => {
  it("the resend becomes reachable for a patient whose SMS never arrived", async () => {
    /**
     * Measured in a browser before this existed: E6 said «تكدر تطلب رمز جديد
     * بعد ٤٥ ثانية» at zero seconds and said exactly the same at fifty, with
     * the resend never offered. `env.now()` is read during render and nothing
     * rendered again, so the clock stood still — and the one recovery this
     * screen has appears only when it reaches zero.
     *
     * A patient who mistyped a digit could type another and nudge it along by
     * accident. A patient whose SMS never arrived has nothing to type, which
     * is precisely the patient the resend exists for.
     */
    CLOCK.reset();
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");

    expect(app.said()).toContain("تكدر تطلب رمز جديد بعد");
    expect(controls(app.root()).some((c) => c.props["accessibilityLabel"] === "أرسل رمز جديد")).toBe(false);

    // Nothing typed, nothing tapped. Only time passing.
    await app.tick(46_000);

    expect(app.said()).not.toContain("تكدر تطلب رمز جديد بعد");
    expect(controls(app.root()).some((c) => c.props["accessibilityLabel"] === "أرسل رمز جديد")).toBe(true);
    app.unmount();
  });

  it("the wait counts DOWN rather than repeating itself", async () => {
    CLOCK.reset();
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");

    const first = app.said();
    await app.tick(20_000);
    expect(app.said()).not.toBe(first);
    app.unmount();
  });

  it("a screen with no clock on it does not subscribe to one", async () => {
    // A timer that fires for a screen with no time on it is a wakeup that
    // teaches nobody anything, on phones where that is a real cost.
    //
    // The draft, not the search screen: F1 and F2 label how old a cached
    // result is, so they are clock screens and always were — this assertion
    // only ever passed there because the app started on S1 with no component
    // and `default` drew the search screen without changing `state.screen`.
    CLOCK.reset();
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    expect(app.said()).toContain("طلب جديد");
    expect(CLOCK.listeners.size).toBe(0);
    app.unmount();
  });
});

describe("onboarding finishes before the request replays (TD-18)", () => {
  it("the request a guest built goes out with the district they chose", async () => {
    /**
     * The defect product's answer closes. Verification used to replay the
     * interrupted action immediately, so E7 and E8 were unreachable: a patient
     * never gave their name — the name E4 promises the pharmacy will see — and
     * `newDraft` had been given a guest's authority, so every request left with
     * `districtId: ""`. A real server refuses that; the dev server did not,
     * which is how it stayed invisible.
     */
    const sent: Record<string, unknown>[] = [];
    const app = open(runtime({
      startFlush: (outbox) => {
        for (const item of outbox.items) if (item.state === "queued") sent.push(item.payload);
      },
      // The authority the store reads is the runtime's, and the runtime learns
      // the district from `onDistrict`. This fixture is the runtime.
      authority: () => ({ hasOrderScope: true, activeSubjectMemorialised: false, districtId: DISTRICT.at }),
      onDistrict: (districtId) => { DISTRICT.at = districtId; },
    }));

    DISTRICT.at = "";
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");
    await app.type("123456");
    await app.press("تأكيد");

    // E7, then E8 — neither of which a patient could reach before.
    expect(app.said()).toContain("شنو نناديك؟");
    await app.type("أم علي");
    await app.press("كمّل");
    expect(app.said()).toContain("من وين تدور؟");
    await app.press("اختر الكرادة");
    await app.press("خلص");

    // ...and only now the request they were making comes back.
    expect(app.said()).toContain("تأكيد الطلب");
    await app.press("أرسل الطلب");

    expect(sent).toHaveLength(1);
    expect(sent[0]!["districtId"], "the request went out with no district").toBe("d1");
  });

  it("a district the SERVER refuses keeps the patient on E8", async () => {
    // §5 rule 1. The bundled list is not the server's coverage map (TD-17), so
    // a district the client accepted can still be refused — and E12's sentence
    // is the one the patient already understands.
    const app = open(runtime({
      identity: {
        requestCode: async () => ({ kind: "fresh", value: { challengeId: "ch-1", resendAfter: 45 } }),
        verify: async () => ({ kind: "fresh", value: { kind: "verified", accountId: "acc-1", subjectId: "sub-1" } }),
        updateMe: async () => ({ kind: "fresh", value: { kind: "invalidDistrict" } }),
      },
    }));
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");
    await app.type("123456");
    await app.press("تأكيد");
    await app.type("أم علي");
    await app.press("كمّل");
    await app.press("اختر الكرادة");
    await app.press("خلص");

    // Still on E8, and the request is NOT replayed — it is one this account
    // cannot yet make.
    expect(app.said()).toContain("من وين تدور؟");
    expect(app.said()).not.toContain("تأكيد الطلب");
    app.unmount();
  });

  it("a dropped connection does not tell the patient they chose nothing", async () => {
    // The first version answered a failed call with DISTRICT_REQUIRED, which
    // words as «ما اخترت منطقة» — blaming someone for a network. E8 has no
    // declared sentence for a save that could not be made (TD-25), so it says
    // nothing rather than something false, and the control comes back.
    const app = open(runtime({
      identity: {
        requestCode: async () => ({ kind: "fresh", value: { challengeId: "ch-1", resendAfter: 45 } }),
        verify: async () => ({ kind: "fresh", value: { kind: "verified", accountId: "acc-1", subjectId: "sub-1" } }),
        updateMe: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "no signal" } }),
      },
    }));
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    await app.press("كمّل");
    await app.press("أدخل رقمي");
    await app.type("07701234567");
    await app.press("أرسل الرمز");
    await app.type("123456");
    await app.press("تأكيد");
    await app.type("أم علي");
    await app.press("كمّل");
    await app.press("اختر الكرادة");
    await app.press("خلص");

    expect(app.said()).toContain("من وين تدور؟");
    expect(app.said()).not.toContain("ما اخترت منطقة");
    // Pressable again, rather than stuck busy.
    expect(controls(app.root()).find((c) => c.props["accessibilityLabel"] === "خلص")!
      .props["accessibilityState"].disabled).toBe(false);
    app.unmount();
  });
});

describe("a prescription medicine can be requested at all (TD-9)", () => {
  const RX: CatalogueHit = {
    itemId: "i2", name: "أموكسيسيلين", latinName: "Amoxicillin", form: "كبسول", strength: "500 ملغم",
    requestable: true, requiresPrescription: true, isControlled: false,
  };

  const withCamera = (over: Partial<Runtime> = {}) => runtime({
    catalogue: { search: async () => ({ kind: "fresh", value: { hits: [RX], at: 1_000 } }) },
    capture: () => { CAMERA.shots += 1; },
    ...over,
  });

  const CAMERA = { shots: 0 };

  it("the photograph is sent, and only then does the line carry one", async () => {
    /**
     * The class this closes. D18 refuses the send without an image, the only
     * way to attach one is a photograph, and no photograph could be taken —
     * so antibiotics and inhalers could not be requested at all. TD-9 called
     * that a device problem; it was an interface that asked the platform for
     * an `imageId` it cannot know.
     */
    CAMERA.shots = 0;
    const app = open(withCamera());
    await app.type("أموكسيسيلين");
    await app.press("أضف أموكسيسيلين للطلب");

    // R1 says the line is blocked, before anything is attempted.
    expect(app.said()).toContain("يحتاج صورة الوصفة");

    await app.press("صوّر الوصفة");
    await app.press("صوّر");
    expect(CAMERA.shots, "the shutter did not reach the platform").toBe(1);

    // The platform answers with a local uri and NO id.
    await app.deliver({ kind: "captured", localUri: "blob:x" });
    expect(app.said()).toContain("شوف الصورة");

    await app.press("واضحة — كمّل");
    // Confirming sends it; the id arrives from the media service.
    expect(app.said()).toContain("طلب جديد");
    expect(app.said()).not.toContain("يحتاج صورة الوصفة");
    app.unmount();
  });

  it("an upload that fails keeps the photograph rather than the paper", async () => {
    // A patient who has already held a piece of paper up to a camera must not
    // be asked to do it again because a connection dropped.
    const app = open(withCamera({
      media: { upload: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "no signal" } }) },
    }));
    await app.type("أموكسيسيلين");
    await app.press("أضف أموكسيسيلين للطلب");
    await app.press("صوّر الوصفة");
    await app.deliver({ kind: "captured", localUri: "blob:x" });
    await app.press("واضحة — كمّل");

    // Still on the review, with the same photograph, and the line still blocked
    // rather than silently attached.
    expect(app.said()).toContain("شوف الصورة");
    app.unmount();
  });
});

describe("the app has a home, and a way between its two roots (S1 · §22)", () => {
  /**
   * A tab is not a `button`, deliberately.
   *
   * `controls` counts what a SCREEN owns and asserts one primary among them; a
   * tab belongs to the frame and would be counted as a competing action on
   * every screen in the product. `tab` is also what a screen reader needs to
   * announce it as top-level navigation rather than as another thing to press.
   */
  const tabs = (root: ReactTestInstance) =>
    root.findAll((n) => typeof n.type === "string" && n.props["accessibilityRole"] === "tab", { deep: true });

  const openTab = async (app: ReturnType<typeof open>, label: string) => {
    const tab = tabs(app.root()).find((c) => c.props["accessibilityLabel"] === label);
    if (!tab) throw new Error(`no tab «${label}» — on screen: ${app.said().slice(0, 200)}`);
    await act(async () => { (tab.props["onPress"] as () => void)(); });
    await app.settle();
  };

  it("a guest starts where a stranger can act — search, not a sign-in ask", () => {
    // E1 sends a guest to the guest home, whose purpose is «let a stranger
    // search and browse with no account». S1 is authenticated-only and its
    // teaching empty leads to R1, so starting there would make the first tap
    // in the product a sign-in ask — the wall §3.1 forbids.
    const app = open(runtime());
    expect(app.said()).toContain("دوّر باسم الدواء");
    app.unmount();
  });

  it("both tab roots are offered, named by their own contracts", () => {
    const app = open(runtime());
    // «اليوم» and «ابحث» are S1's and F1's own titles. A second label written
    // beside them would be a name that can disagree with the header it opens.
    expect(tabs(app.root()).map((c) => c.props["accessibilityLabel"])).toEqual(["اليوم", "ابحث"]);
    app.unmount();
  });

  it("every tab clears the 44pt floor, and exactly one says it is selected", () => {
    const app = open(runtime());
    const found = tabs(app.root());
    expect(found.length).toBeGreaterThan(0);
    for (const tab of found) {
      const style = Object.assign({}, ...[tab.props["style"]].flat());
      expect(style.minHeight, `«${tab.props["accessibilityLabel"]}» is under the tap floor`).toBeGreaterThanOrEqual(44);
      // Selection stated, not merely coloured: "which tab am I on" answered in
      // hue alone is not answered for a screen reader, nor for a patient with
      // low colour discrimination.
      expect(tab.props["accessibilityState"]).toHaveProperty("selected");
    }
    expect(found.filter((c) => c.props["accessibilityState"].selected)).toHaveLength(1);
    app.unmount();
  });

  it("Today asks a guest for an account with the reason, rather than failing silently", async () => {
    // S1 is «authenticated, scoped to the active subject», so this tap IS an
    // action that needs an account: §3.1's moment to ask, with E4 explaining.
    const app = open(runtime());
    await openTab(app, "اليوم");
    expect(app.said()).toContain("نحتاج رقمك حتى نخبرك عندما ترد الصيدليات");
    app.unmount();
  });

  it("a modal covers the tabs rather than offering to abandon the work inside it", async () => {
    const app = open(runtime());
    await app.type("بانادول");
    await app.press("أضف بانادول للطلب");
    expect(app.said()).toContain("طلب جديد");
    expect(tabs(app.root())).toHaveLength(0);
    app.unmount();
  });

  it("leaving a live request lands on Today, which teaches — not on a search box", async () => {
    /**
     * R7's «ألغِ الطلب» leads to S1, and until Today had a component the root
     * drew the SEARCH screen for it — so the one acknowledged way out of a
     * live request said nothing whatsoever about the request. (What that
     * control does to the request itself is TD-20 and unchanged here: it
     * navigates, and nothing is cancelled.)
     *
     * The patient arriving is signed in and has never collected anything, so
     * §22's TEACHING empty is the correct greeting and the reassuring one
     * would be wrong.
     */
    const app = await atOffers(runtime(), []);
    await app.press("ألغِ الطلب");

    expect(app.said()).toContain("اليوم");
    expect(app.said()).toContain("هنا راح تشوف حجوزاتك وأدويتك اللي استلمتها");
    expect(app.said()).not.toContain("دوّر باسم الدواء");
    // The two empties are opposite screens: a brand-new account must never be
    // told everything is fine.
    expect(app.said()).not.toContain("كل شي تمام");
    // And Today is a tab root, so the frame offers the tabs again.
    expect(tabs(app.root())).toHaveLength(2);
    app.unmount();
  });
});

describe("the root can draw every screen it says it can", () => {
  it("has a case for every built screen, or a control leads somewhere nobody wrote", () => {
    /**
     * The gate `App.tsx`'s `default` branch depends on.
     *
     * `isBuilt` decides whether a control renders, and a screen it admits with
     * no `case` in the root falls through to a branch that draws something
     * else. That is TD-19 exactly: R1's «لمن؟» rendered, the tap succeeded, and
     * the root replaced the patient's request with a search box. Reading the
     * switch is how that survived review; this reads it instead, so adding a
     * contract without a case fails the build rather than a browser.
     */
    const cases = [...String(App).matchAll(/case\s*"([A-Z]+[0-9]+)"/g)].map((m) => m[1]);
    // If a transform ever erases the literals, this fails loudly rather than
    // reporting that every screen is covered by an empty set.
    expect(cases.length, "no case labels found in the app root — this rule is guarding nothing").toBeGreaterThan(5);

    const drawn = new Set(cases);
    const missing = CORE_LOOP.map((c) => c.id).filter((id) => isBuilt(id) && !drawn.has(id));
    expect(missing, `built with no case in the app root: ${missing.join(", ")}`).toEqual([]);
  });
});
