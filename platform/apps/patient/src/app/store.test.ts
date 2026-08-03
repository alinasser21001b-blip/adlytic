import { describe, expect, it } from "vitest";
import { instant } from "@dawai/domain";
import { describe as describeItem } from "@dawai/offline";
import { authenticate, guest, interrupt } from "@dawai/session";
import { dispatch, initial, GRAPH, NOT_YET_BUILT, type AppState, type Authority, type Intent, type Effect } from "./store.js";
import type { CatalogueHit, Environment } from "../ports.js";
import { unreachable, traps, danglingExits, flowGaps } from "@dawai/navigation";
import { PATIENT_FLOWS } from "@dawai/navigation";

const env = (online = true): Environment => {
  let n = 0;
  return { now: () => 1_000, newId: () => `id-${(n += 1)}`, online: () => online };
};

const permitted: Authority = { hasOrderScope: true, activeSubjectMemorialised: false, districtId: "d1" };

const hit = (over: Partial<CatalogueHit> = {}): CatalogueHit => ({
  itemId: "i1", name: "بانادول", latinName: "Panadol", form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

const signedIn = (): AppState => ({ ...initial(), session: authenticate(guest(), "acc-1", "subj-1") });

/** Run a sequence and keep every effect, so a test can assert what was emitted. */
function run(state: AppState, intents: readonly Intent[], e = env(), authority = permitted) {
  const effects: Effect[] = [];
  let s = state;
  for (const intent of intents) {
    const step = dispatch(s, intent, e, authority);
    s = step.state;
    effects.push(...step.effects);
  }
  return { state: s, effects };
}

describe("the journey a patient actually takes", () => {
  it("search → add → send lands on the waiting screen with the request broadcast", () => {
    const { state, effects } = run(signedIn(), [
      { kind: "open", screen: "F1" },
      { kind: "typed", raw: "بانــادول" },
      { kind: "searchResolved", query: "بانادول", result: { kind: "fresh", value: { hits: [hit()], at: 900 } } },
      { kind: "addItem", hit: hit() },
      { kind: "open", screen: "R6" },
      { kind: "send", at: instant(1_000) },
    ]);

    expect(state.screen).toBe("R7");
    expect(state.sent?.state).toBe("broadcast");
    // The draft is cleared only because it became a real request.
    expect(state.draft).toBeNull();
    expect(effects.some((e) => e.kind === "emit" && e.event === "request.broadcast")).toBe(true);
  });

  it("the same journey offline queues instead, and nothing claims it was sent (D27)", () => {
    const { state, effects } = run(signedIn(), [
      { kind: "addItem", hit: hit() },
      { kind: "send", at: instant(1_000) },
    ], env(false));

    expect(state.sent?.state).toBe("queued");
    expect(describeItem(state.outbox.items[0]!)).toBe("بانتظار الاتصال");
    // O12 fill rate must not count a request no pharmacy has seen.
    expect(effects.some((e) => e.kind === "emit" && e.event === "request.broadcast")).toBe(false);
    expect(effects.some((e) => e.kind === "flushOutbox")).toBe(true);
  });
});

describe("guards decide what is shown, never what is allowed", () => {
  it("a guest asking to request a medicine is sent to sign in with the reason", () => {
    const { state } = run(initial(), [{ kind: "open", screen: "R1" }]);
    expect(state.screen).toBe("E4");
    expect(state.redirectBecause).toContain("رقمك");
  });

  it("and what they were doing survives it (D26)", () => {
    const interrupted = run(initial(), [{ kind: "open", screen: "R1" }]).state;
    expect(interrupted.session.pending?.screen).toBe("R1");

    const resumed = run(interrupted, [{ kind: "authenticated", accountId: "a", subjectId: "s" }]).state;
    expect(resumed.screen).toBe("R1");
    // Taken exactly once, so a later sign-in does not replay it again.
    expect(resumed.session.pending).toBeNull();
  });

  it("a revoked grant is caught at the action, not only at the door (§5 rule 1)", () => {
    const ready = run(signedIn(), [{ kind: "addItem", hit: hit() }]).state;
    const revoked: Authority = { ...permitted, hasOrderScope: false };
    const { state } = run(ready, [{ kind: "send", at: instant(1_000) }], env(), revoked);

    expect(state.sent).toBeNull();
    expect(state.outbox.items).toHaveLength(0);
    // S4 belongs to a later slice, so the patient stays where they are and
    // reads the reason rather than being sent to a screen that does not exist.
    expect(state.screen).toBe("R1");
    expect(state.redirectBecause).toContain("صلاحية");
  });

  it("a memorialised subject is read-only, and the redirect says so (D04)", () => {
    const { state } = run(signedIn(), [{ kind: "open", screen: "R1" }], env(), {
      ...permitted, activeSubjectMemorialised: true,
    });
    expect(state.screen).toBe("S1");
    expect(state.redirectBecause).toContain("للقراءة فقط");
  });
});

describe("refusals reach the screen as domain codes, worded by the screen", () => {
  it("a controlled item refuses inline and reports the gate (D42)", () => {
    const { state, effects } = run(signedIn(), [{ kind: "addItem", hit: hit({ isControlled: true }) }]);
    expect(state.refusal?.code).toBe("CONTROLLED_NOT_SUPPORTED");
    expect(state.draft).toBeNull();
    expect(effects.some((e) => e.kind === "emit" && e.event === "clinical.gate.refused")).toBe(true);
  });

  it("and the patient can dismiss it without losing the draft", () => {
    let s = run(signedIn(), [{ kind: "addItem", hit: hit() }]).state;
    s = run(s, [{ kind: "addItem", hit: hit({ itemId: "x", isControlled: true }) }]).state;
    expect(s.refusal).not.toBeNull();
    s = run(s, [{ kind: "dismissRefusal" }]).state;
    expect(s.refusal).toBeNull();
    expect(s.draft?.lines).toHaveLength(1);
  });
});

describe("search effects", () => {
  it("typing asks the catalogue for the normalised query, not the raw keystrokes", () => {
    const { effects } = run(signedIn(), [{ kind: "typed", raw: "بانــادول " }]);
    expect(effects).toEqual([{ kind: "search", query: "بانادول" }]);
  });

  it("a miss is reported once, and a dropped connection is not reported at all", () => {
    const miss = run(signedIn(), [
      { kind: "typed", raw: "زيبرا" },
      { kind: "searchResolved", query: "زيبرا", result: { kind: "fresh", value: { hits: [], at: 1 } } },
    ]).effects;
    expect(miss.filter((e) => e.kind === "emit" && e.event === "search.unmatched")).toHaveLength(1);

    const failed = run(signedIn(), [
      { kind: "typed", raw: "زيبرا" },
      { kind: "searchResolved", query: "زيبرا", result: { kind: "failed", outcome: { kind: "transient", reason: "x" } } },
    ]).effects;
    expect(failed.some((e) => e.kind === "emit")).toBe(false);
  });
});

describe("back is never a surprise", () => {
  it("pops to where the patient came from", () => {
    const s = run(signedIn(), [{ kind: "addItem", hit: hit() }, { kind: "open", screen: "R6" }]).state;
    expect(s.history).toEqual(["S1", "R1"]);
    expect(run(s, [{ kind: "back" }]).state.screen).toBe("R1");
  });

  it("at a tab root it stays rather than doing nothing visible or crashing", () => {
    const s = signedIn();
    expect(s.screen).toBe("S1");
    expect(run(s, [{ kind: "back" }]).state.screen).toBe("S1");
  });
});

describe("the graph the app actually navigates", () => {
  it("has no unreachable screen and no trap", () => {
    expect(unreachable(GRAPH)).toEqual([]);
    expect(traps(GRAPH)).toEqual([]);
  });

  it("every exit this slice cannot yet honour is a declared, countable gap", () => {
    // Not an assertion that nothing dangles — it does, because 116 of the 133
    // Blueprint screens belong to later slices. The assertion is that the set
    // is exactly the declared one, so it shrinks visibly rather than growing
    // unnoticed.
    const dangling = danglingExits(GRAPH).map((d) => d.split(" → ")[1]!);
    expect([...new Set(dangling)].sort()).toEqual([...NOT_YET_BUILT].sort());
  });

  it("and no control can navigate to one of them", () => {
    for (const screen of NOT_YET_BUILT) {
      const before = signedIn();
      expect(run(before, [{ kind: "open", screen }]).state.screen).toBe(before.screen);
    }
  });

  it("contains every step of every flow a patient can begin", () => {
    expect(flowGaps(GRAPH, PATIENT_FLOWS)).toEqual([]);
  });
});

describe("the second half of the loop", () => {
  const line = (id: string, name: string, answer: unknown) =>
    ({ requestLineId: id, itemName: name, answer }) as never;

  const offer = (over: Record<string, unknown> = {}) => ({
    offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
    distanceM: 800, honoured: "trusted", state: "sent", openNow: true,
    lines: [line("l1", "بانادول", { kind: "available", priceMinor: 3_000 })],
    ...over,
  }) as never;

  const sentRequest = () => run(signedIn(), [
    { kind: "addItem", hit: hit() },
    { kind: "send", at: instant(1_000) },
  ]).state;

  it("the FIRST offer is the moment worth announcing; later ones are silent", () => {
    const one = run(sentRequest(), [{ kind: "offerArrived", offer: offer() }]);
    expect(one.effects.filter((e) => e.kind === "emit" && e.event === "request.answered")).toHaveLength(1);

    const two = run(one.state, [{ kind: "offerArrived", offer: offer({ offerId: "o2" }) }]);
    expect(two.effects.some((e) => e.kind === "emit" && e.event === "request.answered")).toBe(false);
    expect(two.state.offers).toHaveLength(2);
  });

  it("an offer that arrives again replaces itself rather than appearing twice", () => {
    let s = run(sentRequest(), [{ kind: "offerArrived", offer: offer() }]).state;
    s = run(s, [{ kind: "offerArrived", offer: offer({ branchName: "الرشيد (محدّث)" }) }]).state;
    expect(s.offers).toHaveLength(1);
    expect(s.offers[0]!.branchName).toBe("الرشيد (محدّث)");
  });

  it("choosing an offer asks for the hold and shows the waiting screen with no timer", () => {
    const s = run(sentRequest(), [
      { kind: "offerArrived", offer: offer() },
      { kind: "chooseOffer", offerId: "o1" },
    ]).state;
    expect(s.screen).toBe("V1");
    expect(s.reservationState).toBe("requested");
    expect(s.reservation).toEqual({ kind: "requesting", branchName: "صيدلية الرشيد" });
  });

  it("an offer withdrawn between render and tap keeps the list and names the pharmacy", () => {
    const s = run(sentRequest(), [
      { kind: "offerArrived", offer: offer({ state: "withdrawn" }) },
      { kind: "chooseOffer", offerId: "o1" },
    ]).state;
    expect(s.screen).not.toBe("V1");
    expect(s.staleOffer).toBe("صيدلية الرشيد");
    expect(s.refusal?.code).toBe("OFFER_WITHDRAWN");
    expect(s.offers).toHaveLength(1);
  });

  it("a confirmed hold reports it and lands on the reservation", () => {
    const chosen = run(sentRequest(), [
      { kind: "offerArrived", offer: offer() },
      { kind: "chooseOffer", offerId: "o1" },
    ]).state;

    const { state, effects } = run(chosen, [{
      kind: "holdConfirmed",
      hold: {
        reservationId: "r1", code: "4KD2P9", branchName: "صيدلية الرشيد", holderName: "أم علي",
        branchPhone: "0770", address: "الكرادة",
        confirmedAt: instant(2_000), expiresAt: instant(2_000 + 3_600_000),
        totalMinor: 3_000, lines: [{ itemName: "بانادول", packs: 1, priceMinor: 3_000 }],
      },
    }]);

    expect(state.screen).toBe("V2");
    expect(state.reservationState).toBe("held");
    expect(effects.some((e) => e.kind === "emit" && e.event === "reservation.confirmed")).toBe(true);
  });

  it("D39 — a refusal reports it and lands somewhere that moves the patient forward", () => {
    const chosen = run(sentRequest(), [
      { kind: "offerArrived", offer: offer() },
      { kind: "chooseOffer", offerId: "o1" },
    ]).state;

    const { state, effects } = run(chosen, [{ kind: "holdRefused", branchName: "صيدلية الرشيد", reopened: true }]);
    expect(state.screen).toBe("V4");
    expect(state.reservationState).toBe("refused");
    expect(state.reservation).toMatchObject({ kind: "refused", reopened: true });
    expect(effects.some((e) => e.kind === "emit" && e.event === "reservation.refused")).toBe(true);
  });

  it("a hold event with no reservation in flight is not ours, and invents nothing", () => {
    // Previously the reducer supplied a `?? "requested"` machine state here, so
    // a stray or replayed server event manufactured a held reservation and V2
    // showed a pickup code for a request the patient never sent.
    const before = sentRequest();
    expect(before.reservationState).toBeNull();
    const { state, effects } = run(before, [{
      kind: "holdConfirmed",
      hold: {
        reservationId: "r-ghost", code: "9ZZ9ZZ", branchName: "صيدلية ما طلبناها", holderName: "أم علي",
        branchPhone: "0770", address: "الكرادة",
        confirmedAt: instant(2_000), expiresAt: instant(2_000 + 3_600_000),
        totalMinor: 3_000, lines: [{ itemName: "بانادول", packs: 1, priceMinor: 3_000 }],
      },
    }]);
    expect(state.reservationState).toBeNull();
    expect(state.reservation).toBeNull();
    expect(state.screen).toBe(before.screen);
    expect(effects).toHaveLength(0);
  });

  it("a refusal with no reservation in flight is ignored the same way", () => {
    const before = sentRequest();
    const { state, effects } = run(before, [{ kind: "holdRefused", branchName: "صيدلية", reopened: true }]);
    expect(state.reservationState).toBeNull();
    expect(state.screen).toBe(before.screen);
    expect(effects).toHaveLength(0);
  });

  it("a hold cannot be confirmed twice — the published machine forbids it (Rule 5)", () => {
    let s = run(sentRequest(), [
      { kind: "offerArrived", offer: offer() },
      { kind: "chooseOffer", offerId: "o1" },
    ]).state;
    const held = {
      reservationId: "r1", code: "4KD2P9", branchName: "ص", holderName: "أم علي", branchPhone: "0770", address: "a",
      confirmedAt: instant(2_000), expiresAt: instant(2_000 + 3_600_000),
      totalMinor: 1, lines: [],
    };
    s = run(s, [{ kind: "holdConfirmed", hold: held }]).state;
    const again = run(s, [{ kind: "holdConfirmed", hold: held }]);
    expect(again.state.reservationState).toBe("held");
    expect(again.effects).toEqual([]);
  });
});

describe("substitution consent — the gate TD-5 was open on (§4 R10)", () => {
  const subLine = (id: string, name: string) => ({
    requestLineId: id, itemName: name,
    answer: { kind: "substitute", priceMinor: 2_500, itemId: "سيتامول", note: "نفس المادة الفعالة" },
  }) as never;

  const plainLine = (id: string, name: string) => ({
    requestLineId: id, itemName: name,
    answer: { kind: "available", priceMinor: 3_000 },
  }) as never;

  const offerWithSub = (lines: readonly unknown[] = [subLine("l1", "بانادول")]) => ({
    offerId: "o1", branchId: "b1", branchName: "صيدلية الرشيد", districtName: "الكرادة",
    distanceM: 800, honoured: "trusted", state: "sent", openNow: true, lines,
  }) as never;

  const withOffer = (offer: unknown) => run(
    run(signedIn(), [{ kind: "addItem", hit: hit() }, { kind: "send", at: instant(1_000) }]).state,
    [{ kind: "offerArrived", offer: offer as never }],
  ).state;

  it("an offer containing a substitution cannot be reserved — it sends the patient to decide", () => {
    const s = run(withOffer(offerWithSub()), [{ kind: "chooseOffer", offerId: "o1" }]).state;
    // Not a reservation, and not a dead refusal either: the decision has a
    // screen, so the patient is taken to it.
    expect(s.reservation).toBeNull();
    expect(s.screen).toBe("R9");
    expect(s.consent?.offerId).toBe("o1");
  });

  it("every proposal starts undecided — nothing is pre-ticked", () => {
    const s = run(withOffer(offerWithSub()), [{ kind: "openOffer", offerId: "o1" }]).state;
    expect(s.consent?.decisions.get("l1")).toBe("undecided");
  });

  it("still refuses while a decision is outstanding", () => {
    let s = run(withOffer(offerWithSub([subLine("l1", "بانادول"), subLine("l2", "أموكسيسيلين")])),
      [{ kind: "openOffer", offerId: "o1" }]).state;
    s = run(s, [{ kind: "decideSubstitution", requestLineId: "l1", decision: "agreed" }]).state;
    s = run(s, [{ kind: "chooseOffer", offerId: "o1" }]).state;
    expect(s.reservation).toBeNull();
    expect(s.screen).toBe("R9");
  });

  it("proceeds once every proposal has an explicit answer", () => {
    let s = run(withOffer(offerWithSub()), [{ kind: "openOffer", offerId: "o1" }]).state;
    s = run(s, [{ kind: "decideSubstitution", requestLineId: "l1", decision: "agreed" }]).state;
    s = run(s, [{ kind: "chooseOffer", offerId: "o1" }]).state;
    expect(s.screen).toBe("V1");
    expect(s.reservation).toEqual({ kind: "requesting", branchName: "صيدلية الرشيد" });
  });

  it("refusing keeps the rest of the order (D06) rather than losing it", () => {
    const offer = offerWithSub([subLine("l1", "بانادول"), plainLine("l2", "أموكسيسيلين")]);
    let s = run(withOffer(offer), [{ kind: "openOffer", offerId: "o1" }]).state;
    s = run(s, [{ kind: "decideSubstitution", requestLineId: "l1", decision: "refused" }]).state;
    s = run(s, [{ kind: "chooseOffer", offerId: "o1" }]).state;
    // The refused line drops; the reservation still happens for the rest.
    expect(s.screen).toBe("V1");
  });

  it("an offer with no substitution needs no consent and reserves directly", () => {
    const s = run(withOffer(offerWithSub([plainLine("l1", "بانادول")])), [{ kind: "chooseOffer", offerId: "o1" }]).state;
    expect(s.screen).toBe("V1");
  });
});

describe("R2 and R3 — the prescription photo", () => {
  const withRxDraft = () => run(signedIn(), [
    { kind: "addItem", hit: hit({ itemId: "rx", name: "أموكسيسيلين", requiresPrescription: true }) },
  ]).state;

  it("a captured photo is NOT attached until the patient confirms it (D18)", () => {
    let s = run(withRxDraft(), [{ kind: "captured", imageId: "img-1", localUri: "file://a.jpg" }]).state;
    expect(s.screen).toBe("R3");
    // Still blocked: nothing has been attached.
    expect(s.draft!.lines[0]!.prescriptionImageId).toBeNull();

    s = run(s, [{ kind: "confirmPhoto" }]).state;
    expect(s.draft!.lines[0]!.prescriptionImageId).toBe("img-1");
    expect(s.screen).toBe("R1");
  });

  it("retaking returns to the camera with nothing attached", () => {
    let s = run(withRxDraft(), [{ kind: "captured", imageId: "img-1", localUri: "file://a.jpg" }]).state;
    s = run(s, [{ kind: "retakePhoto" }]).state;
    expect(s.screen).toBe("R2");
    expect(s.capture.kind).toBe("ready");
    expect(s.draft!.lines[0]!.prescriptionImageId).toBeNull();
  });

  it("a refused camera is a state the screen can offer an alternative for, not a wall", () => {
    const s = run(withRxDraft(), [{ kind: "cameraPermission", permission: "denied" }]).state;
    expect(s.capture).toEqual({ kind: "refused", permission: "denied" });
  });

  it("asks the platform for the photo rather than pretending to take one", () => {
    const { effects } = run(withRxDraft(), [{ kind: "capture" }]);
    expect(effects).toEqual([{ kind: "capturePrescription" }]);
  });
});

describe("E4–E8 — a guest completes the one hard ask", () => {
  const at = (ms: number) => instant(ms);

  /** Walks the whole chain and returns every state along the way, so a test can
   *  assert about the journey rather than about one hop. */
  const walk = () => {
    const e = env();
    let s = initial();
    const go = (i: Intent) => { const r = dispatch(s, i, e, permitted); s = r.state; return r; };
    return { go, at, get state() { return s; } };
  };

  it("cannot leave the device with a number the domain refuses", () => {
    const w = walk();
    w.go({ kind: "typePhone", raw: "0770" });
    const r = w.go({ kind: "submitPhone" });
    expect(r.effects, "a malformed number was sent to the server").toEqual([]);
    expect(w.state.refusal?.code).toBe("MALFORMED_NUMBER");
    expect(w.state.screen, "advanced past E5 on a bad number").not.toBe("E6");
  });

  it("asks the identity service for a code, and only then moves to E6", () => {
    const w = walk();
    w.go({ kind: "typePhone", raw: "07701234567" });
    const r = w.go({ kind: "submitPhone" });
    expect(r.effects).toEqual([{ kind: "requestCode", e164: "+9647701234567" }]);
    expect(w.state.screen).toBe("E6");
  });

  it("never mints its own challenge — the server's id is the one held", () => {
    const w = walk();
    w.go({ kind: "typePhone", raw: "07701234567" });
    w.go({ kind: "submitPhone" });
    expect(w.state.onboarding.challenge, "a challenge existed before the server issued one").toBeNull();
    w.go({ kind: "codeIssued", challengeId: "ch-1", at: at(1_000) });
    expect(w.state.onboarding.challenge?.challengeId).toBe("ch-1");
    expect(w.state.session.state).toBe("authenticating");
  });

  it("mirrors the server's attempt count on a wrong code", () => {
    const w = walk();
    w.go({ kind: "typePhone", raw: "07701234567" });
    w.go({ kind: "submitPhone" });
    w.go({ kind: "codeIssued", challengeId: "ch-1", at: at(1_000) });
    w.go({ kind: "typeCode", raw: "111111" });
    w.go({ kind: "submitCode", at: at(2_000) });
    w.go({ kind: "codeJudged", verdict: "wrong", attemptsLeft: 4 });

    expect(w.state.onboarding.codeRefusal).toBe("WRONG_CODE");
    // The server said 4 attempts remain; the mirrored count must agree, so the
    // domain's attemptsLeft and E6's sentence cannot diverge from the server.
    expect(w.state.onboarding.challenge?.used).toBe(1);
    expect(w.state.screen, "advanced on a wrong code").toBe("E6");
  });

  it("does not spend an attempt when the code merely expired", () => {
    const w = walk();
    w.go({ kind: "typePhone", raw: "07701234567" });
    w.go({ kind: "submitPhone" });
    w.go({ kind: "codeIssued", challengeId: "ch-1", at: at(0) });
    w.go({ kind: "typeCode", raw: "111111" });
    // The SERVER said the clock ran out — the client does not re-derive it.
    w.go({ kind: "codeJudged", verdict: "expired" });

    expect(w.state.onboarding.codeRefusal).toBe("CODE_EXPIRED");
    expect(w.state.onboarding.challenge?.used, "the clock cost the patient an attempt").toBe(0);
  });

  it("a resend starts a NEW challenge rather than reviving a dead one", () => {
    const w = walk();
    w.go({ kind: "typePhone", raw: "07701234567" });
    w.go({ kind: "submitPhone" });
    w.go({ kind: "codeIssued", challengeId: "ch-1", at: at(0) });
    const r = w.go({ kind: "resendCode" });
    expect(r.effects).toEqual([{ kind: "requestCode", e164: "+9647701234567" }]);
    expect(w.state.onboarding.challenge, "the dead challenge survived a resend").toBeNull();
  });

  it("walks the whole chain and refuses an empty name and an unchosen district", () => {
    const districts = [
      { districtId: "d1", name: "الكرادة", city: "بغداد", covered: true },
      { districtId: "d9", name: "المشتل", city: "بغداد", covered: false },
    ];
    const w = walk();
    w.go({ kind: "typePhone", raw: "07701234567" });
    w.go({ kind: "submitPhone" });
    w.go({ kind: "codeIssued", challengeId: "ch-1", at: at(0) });
    w.go({ kind: "typeCode", raw: "123456" });
    w.go({ kind: "codeJudged", verdict: "correct" });
    expect(w.state.screen).toBe("E7");

    w.go({ kind: "submitName" });
    expect(w.state.refusal?.code, "an empty name walked through").toBe("NAME_REQUIRED");
    expect(w.state.screen).toBe("E7");

    w.go({ kind: "typeName", raw: "  أم   علي  " });
    w.go({ kind: "submitName" });
    expect(w.state.screen).toBe("E8");

    w.go({ kind: "submitDistrict", districts });
    expect(w.state.refusal?.code).toBe("DISTRICT_REQUIRED");

    // E12 — an uncovered district is our limit, not their mistake, and it is
    // still refused rather than quietly accepted.
    w.go({ kind: "chooseDistrict", districtId: "d9" });
    w.go({ kind: "submitDistrict", districts });
    expect(w.state.refusal?.code).toBe("OUTSIDE_COVERAGE");

    w.go({ kind: "chooseDistrict", districtId: "d1" });
    w.go({ kind: "submitDistrict", districts });
    expect(w.state.refusal).toBeNull();
  });

  it("D26 — the request survives the whole chain and is returned to", () => {
    const e = env();
    let s = initial();
    const go = (i: Intent) => { s = dispatch(s, i, e, permitted).state; };

    // A guest starts a request and is stopped by the guard.
    go({ kind: "open", screen: "R1" });
    s = { ...s, session: interrupt(s.session, { screen: "R1", draft: {}, startedAt: 0 }) };

    go({ kind: "typePhone", raw: "07701234567" });
    go({ kind: "submitPhone" });
    go({ kind: "codeIssued", challengeId: "ch-1", at: instant(0) });
    go({ kind: "typeCode", raw: "123456" });
    go({ kind: "codeJudged", verdict: "correct" });
    go({ kind: "typeName", raw: "أم علي" });
    go({ kind: "submitName" });

    // The interrupted work is still there, all the way through.
    expect(s.session.pending?.screen, "the request was lost during sign-in").toBe("R1");

    go({ kind: "authenticated", accountId: "a1", subjectId: "s1" });
    expect(s.screen, "did not return the patient to what they were doing").toBe("R1");
    expect(s.session.pending, "the intent replayed more than once").toBeNull();
  });
});
