#!/usr/bin/env node
/* ============================================================
   QAREEB — DATA-PLANE TESTS
   ============================================================
   Run:  node tools/test-needs.mjs

   The data plane is the first part of this product that stores something on
   behalf of a person who is not in the room. These cases are the promises
   made to that person: that a controlled medicine never enters the queue,
   that their landmark and phone never reach the server, that only they can
   read their own answers, and that two pharmacies answering at once both
   count.
   ============================================================ */
import * as C from "../netlify/functions/_needs-core.mjs";

let pass = 0; const fails = []; let group = "";
const describe = (n) => { group = n; console.log("\n── " + n); };
function it(n, fn) {
  try { fn(); pass++; console.log("   ✓ " + n); }
  catch (e) { fails.push(group + " › " + n + ": " + e.message); console.log("   ✗ " + n + "\n     " + e.message); }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ": " : "") + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const no = (v, m) => { if (v) throw new Error(m || "expected falsy, got " + JSON.stringify(v)); };

const T0 = 1700000000000;
const base = { city: "baghdad", district: "mansour", variantId: "x2a",
  quantity: "علبة واحدة", urgency: "urgent", acceptsAlternative: true };

/* ---------------------------------------------------------------- */
describe("what the server will accept");

it("a clean payload is accepted and the server names the record", () => {
  const r = C.acceptPayload(base, "qABC123", T0);
  ok(r.ok);
  eq(r.record.requestId, "qABC123", "the client must not choose its own id");
  eq(r.record.createdAt, T0, "the client must not choose its own timestamp");
  eq(r.record.city, "baghdad");
});

it("a client-supplied id or timestamp is overwritten, not trusted", () => {
  const r = C.acceptPayload({ ...base, requestId: "IMPOSTOR", createdAt: 1 }, "qREAL", T0);
  eq(r.record.requestId, "qREAL");
  eq(r.record.createdAt, T0);
});

it("unknown fields are dropped rather than stored", () => {
  const r = C.acceptPayload({ ...base, secretTracking: "x", weight: 70 }, "q1", T0);
  no("secretTracking" in r.record, "unknown field stored");
  no("weight" in r.record);
});

it("a payload carrying patient identity is REFUSED, not quietly cleaned", () => {
  for (const bad of ["phone", "lm", "landmark", "photo", "note", "patient", "ownerToken"]) {
    const r = C.acceptPayload({ ...base, [bad]: "x" }, "q1", T0);
    no(r.ok, "should refuse payload containing " + bad);
    eq(r.reason, "FORBIDDEN_FIELD");
    eq(r.field, bad);
  }
});

it("a request with no city or no medicine is refused", () => {
  eq(C.acceptPayload({ ...base, city: "" }, "q1", T0).reason, "BAD_CITY");
  eq(C.acceptPayload({ city: "baghdad" }, "q1", T0).reason, "NO_MEDICINE");
  eq(C.acceptPayload({ ...base, city: "BAGHDAD; DROP" }, "q1", T0).reason, "BAD_CITY");
});

it("free text is bounded", () => {
  const r = C.acceptPayload({ city: "basra", typedName: "أ".repeat(500),
    quantity: "ب".repeat(500) }, "q1", T0);
  ok(r.ok);
  eq(r.record.typedName.length, 80);
  eq(r.record.quantity.length, 40);
});

it("an unknown urgency falls back to the longest window, never a shorter one", () => {
  eq(C.acceptPayload({ ...base, urgency: "SUPER_URGENT" }, "q1", T0).record.urgency, "normal");
});

/* ---------------------------------------------------------------- */
describe("controlled medicines never enter the queue");

it("a controlled variant id is refused", () => {
  eq(C.acceptPayload({ ...base, variantId: "x9a" }, "q1", T0).reason, "CONTROLLED");
  eq(C.acceptPayload({ ...base, variantId: "x10a" }, "q1", T0).reason, "CONTROLLED");
});

it("a controlled medicine typed by hand is refused, in Arabic or Latin", () => {
  for (const name of ["ريفوتريل", "كلونازيبام", "Rivotril", "clonazepam",
                      "مورفين", "morphine", "ترامادول", "tramadol",
                      "بريغابالين", "xanax"]) {
    const r = C.acceptPayload({ city: "baghdad", typedName: name, quantity: "1" }, "q1", T0);
    no(r.ok, "should refuse typed: " + name);
    eq(r.reason, "CONTROLLED", name);
  }
});

it("a controlled name embedded in a longer string is still caught", () => {
  eq(C.acceptPayload({ city: "baghdad", typedName: "حبوب ريفوتريل ٢ ملغم", quantity: "1" }, "q1", T0).reason,
    "CONTROLLED");
});

it("an ordinary medicine is not caught by the controlled filter", () => {
  for (const name of ["أوجمنتين", "باراسيتامول", "insulin", "ventolin"]) {
    ok(C.acceptPayload({ city: "baghdad", typedName: name, quantity: "1" }, "q1", T0).ok, name);
  }
});

/* ---------------------------------------------------------------- */
describe("state is derived, so it cannot race");

const rec = (urg, ageMin) => ({ createdAt: T0 - ageMin * 60000, urgency: urg });

it("no answers means broadcasting", () => {
  eq(C.stateOf(rec("urgent", 5), [], false, T0), "broadcasting");
});

it("an answer moves it to acknowledged without any write to the request", () => {
  eq(C.stateOf(rec("urgent", 5), [{ pharmacyId: "p1" }], false, T0), "acknowledged");
});

it("urgency decides the expiry window", () => {
  eq(C.stateOf(rec("urgent", 400), [], false, T0), "expired", "urgent expires at 6h");
  eq(C.stateOf(rec("normal", 400), [], false, T0), "broadcasting", "normal does not");
  eq(C.stateOf(rec("normal", 5000), [], false, T0), "expired", "normal expires at 3d");
});

it("an expired request stays expired even when answered", () => {
  eq(C.stateOf(rec("urgent", 400), [{ pharmacyId: "p1" }], false, T0), "expired");
});

it("cancellation beats everything", () => {
  eq(C.stateOf(rec("urgent", 5), [{ pharmacyId: "p1" }], true, T0), "cancelled");
});

it("only live states reach a pharmacy queue", () => {
  ok(C.isLive("broadcasting")); ok(C.isLive("acknowledged"));
  no(C.isLive("expired")); no(C.isLive("cancelled"));
});

/* ---------------------------------------------------------------- */
describe("two pharmacies answering at once");

it("both claims are kept and the earliest is surfaced", () => {
  const answers = [
    { pharmacyId: "p2", kind: "yes", at: T0 + 900 },
    { pharmacyId: "p1", kind: "yes", at: T0 + 100 },
    { pharmacyId: "p3", kind: "one", at: T0 + 500 },
  ];
  eq(C.firstAnswer(answers).pharmacyId, "p1", "earliest wins");
  eq(answers.length, 3, "no claim is discarded");
});

it("a tie is broken deterministically, not by store ordering", () => {
  const a = [{ pharmacyId: "p9", at: T0 }, { pharmacyId: "p1", at: T0 }];
  eq(C.firstAnswer(a).pharmacyId, "p1");
  eq(C.firstAnswer(a.slice().reverse()).pharmacyId, "p1", "same winner either order");
});

it("no answers has no first", () => { eq(C.firstAnswer([]), null); eq(C.firstAnswer(null), null); });

/* ---------------------------------------------------------------- */
describe("what leaves the server");

it("the owner hash never appears in any view", () => {
  const stored = { ...C.acceptPayload(base, "q1", T0).record, ownerHash: "deadbeef" };
  const pub = C.publicView(stored);
  no("ownerHash" in pub, "owner hash leaked");
  no(JSON.stringify(pub).includes("deadbeef"));
  eq(pub.city, "baghdad", "the rest survives");
});

it("an answer view exposes the pharmacy but not the pharmacist's identity", () => {
  const v = C.answerView({ pharmacyId: "p1", pharmacistId: "ph-IQ-PH-1234",
    kind: "yes", at: T0, licenseStatus: "VERIFIED" });
  eq(v.pharmacyId, "p1");
  no("pharmacistId" in v, "the individual pharmacist's id must not reach the patient");
});

it("a self-asserted answer is labelled as such all the way to the patient", () => {
  eq(C.answerView({ pharmacyId: "p1", kind: "yes", at: T0, licenseStatus: "SELF_ASSERTED" }).licenseStatus,
    "SELF_ASSERTED");
  eq(C.answerView({ pharmacyId: "p1", kind: "yes", at: T0 }).licenseStatus, "UNKNOWN",
    "an answer with no status must never default to verified");
});

/* ---------------------------------------------------------------- */
describe("answer validation");

it("only the four real answers are accepted", () => {
  for (const k of ["yes", "one", "alt", "none"]) ok(C.validateAnswer("qABC123", k).ok, k);
  for (const k of ["maybe", "", null, "YES", "delete"]) no(C.validateAnswer("qABC123", k).ok, String(k));
});

it("a malformed request id is refused", () => {
  for (const id of ["", "ab", "../../etc/passwd", "q/../x", "x".repeat(50)]) {
    no(C.validateAnswer(id, "yes").ok, JSON.stringify(id));
  }
});

/* ---------------------------------------------------------------- */
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
