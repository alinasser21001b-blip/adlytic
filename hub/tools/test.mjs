#!/usr/bin/env node
/* ============================================================
   QAREEB — DOMAIN TESTS
   ============================================================
   Run:  node tools/test.mjs

   The app ships as plain scripts with no build step and no dependencies, so
   these tests evaluate js/domain.js in a Node vm and assert against the same
   `QD` namespace the browser gets. The tested bytes and the shipped bytes are
   the same bytes — there is no compilation step in between that could differ.

   Every case here is a rule someone can be harmed by getting wrong: who may
   claim stock, what leaves the device, which medicines must never be
   broadcast, and whether an audit trail actually detects tampering.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { globalThis: null, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(HUB, "js/domain.js"), "utf8"), ctx, { filename: "domain.js" });
const QD = ctx.QD;

let pass = 0;
const fails = [];
let group = "";

const describe = (name) => { group = name; console.log("\n── " + name); };
function it(name, fn) {
  try { fn(); pass++; console.log("   ✓ " + name); }
  catch (e) { fails.push(group + " › " + name + "\n     " + e.message); console.log("   ✗ " + name + "\n     " + e.message); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg ? msg + ": " : "") + "expected " + B + ", got " + A);
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy, got " + JSON.stringify(v)); }
function no(v, msg) { if (v) throw new Error(msg || "expected falsy, got " + JSON.stringify(v)); }

/* ---------------------------------------------------------------- */
describe("prescription class");

it("an explicit controlled flag classifies as CONTROLLED", () => {
  eq(QD.classOf({ controlled: true }), "CONTROLLED");
  ok(QD.isControlled({ controlled: true }));
});

it("rx:false is OTC", () => eq(QD.classOf({ rx: false }), "OTC"));

it("an unknown medicine defaults to RX, never OTC", () => {
  eq(QD.classOf({}), "RX", "empty object");
  eq(QD.classOf(null), "RX", "null");
  eq(QD.classOf(undefined), "RX", "undefined");
});

/* ---------------------------------------------------------------- */
describe("what may be broadcast");

const req = {
  id: "u1", v: "x2a", city: "baghdad", district: "mansour",
  lm: "مستشفى اليرموك", qty: "علبة واحدة", urg: "urgent",
  altOk: true, rxHeld: true, ts: 1700000000000,
  phone: "9647701234567", photo: "data:image/png;base64,AAAA",
  note: "المريض عنده حساسية من البنسلين",
};

it("a controlled medicine is refused, with a reason", () => {
  const r = QD.broadcastPayload(req, { controlled: true });
  no(r.ok);
  eq(r.reason, "CONTROLLED");
  eq(r.payload, null, "no payload may be produced at all");
});

it("an ordinary prescription medicine is allowed", () => {
  const r = QD.broadcastPayload(req, { rx: true });
  ok(r.ok);
  eq(r.payload.variantId, "x2a");
  eq(r.payload.city, "baghdad");
});

it("the payload carries no landmark, phone, photo or note", () => {
  const r = QD.broadcastPayload(req, { rx: true });
  const keys = Object.keys(r.payload);
  for (const bad of QD.FORBIDDEN_IN_BROADCAST) {
    no(keys.indexOf(bad) !== -1, "leaked field: " + bad);
  }
  const blob = JSON.stringify(r.payload);
  no(blob.includes("اليرموك"), "landmark text leaked into payload");
  no(blob.includes("9647701234567"), "phone leaked into payload");
  no(blob.includes("البنسلين"), "medical note leaked into payload");
  no(blob.includes("base64"), "image data leaked into payload");
});

it("a request with no location is refused", () => {
  const r = QD.broadcastPayload({ id: "u2", ts: 1 }, { rx: true });
  no(r.ok);
  eq(r.reason, "NO_LOCATION");
});

it("a typed medicine broadcasts its typed fields, not a variant id", () => {
  const typed = Object.assign({}, req, { v: null, manual: { name: "أوجمنتين", strength: "625 ملغم", form: "حبوب" } });
  const r = QD.broadcastPayload(typed, { rx: true });
  ok(r.ok);
  eq(r.payload.variantId, null);
  eq(r.payload.typedName, "أوجمنتين");
});

/* ---------------------------------------------------------------- */
describe("request lifecycle");

it("declared transitions are allowed", () => {
  ok(QD.canTransition("broadcasting", "acknowledged"));
  ok(QD.canTransition("acknowledged", "handoff"));
  ok(QD.canTransition("handoff", "fulfilled"));
});

it("undeclared transitions are refused", () => {
  no(QD.canTransition("broadcasting", "fulfilled"), "cannot skip acknowledgement");
  no(QD.canTransition("fulfilled", "broadcasting"), "terminal state cannot restart");
  no(QD.canTransition("expired", "acknowledged"), "expired cannot revive");
});

it("every live state maps to a demand stage", () => {
  eq(QD.stageOf("broadcasting"), "S2");
  eq(QD.stageOf("acknowledged"), "S3");
  eq(QD.stageOf("handoff"), "S4");
  eq(QD.stageOf("fulfilled"), "S5");
});

it("urgency shortens the time to live", () => {
  ok(QD.ttlFor("urgent") < QD.ttlFor("high"));
  ok(QD.ttlFor("high") < QD.ttlFor("normal"));
  eq(QD.ttlFor("nonsense"), QD.ttlFor("normal"), "unknown urgency falls back to the longest");
});

it("an urgent request expires after its own window, not the default", () => {
  const t0 = 1700000000000;
  const urgent = { ts: t0, urg: "urgent" };
  no(QD.isExpired(urgent, t0 + 300 * 60000), "still live at 5 hours");
  ok(QD.isExpired(urgent, t0 + 361 * 60000), "expired past 6 hours");
  no(QD.isExpired({ ts: t0, urg: "normal" }, t0 + 361 * 60000), "a normal request is not");
});

/* ---------------------------------------------------------------- */
describe("who may claim stock");

const verified = { role: "VERIFIED_PHARMACIST", pharmacyId: "b1", licenseStatus: "VERIFIED" };

it("a patient may not answer a request", () => {
  const r = QD.canAnswer({ role: "PATIENT" }, "b1");
  no(r.ok);
  eq(r.reason, "NOT_A_PHARMACY");
});

it("an anonymous visitor may not answer a request", () => {
  no(QD.canAnswer(null, "b1").ok, "null principal");
  no(QD.canAnswer({}, "b1").ok, "empty principal");
});

it("an unverified licence may not answer", () => {
  eq(QD.canAnswer({ role: "PHARMACY_STAFF", pharmacyId: "b1", licenseStatus: "UNKNOWN" }, "b1").reason,
    "LICENSE_UNVERIFIED");
});

it("an expired licence is refused with its own reason", () => {
  eq(QD.canAnswer({ role: "PHARMACY_STAFF", pharmacyId: "b1", licenseStatus: "EXPIRED" }, "b1").reason,
    "LICENSE_EXPIRED");
});

it("a verified pharmacy may answer for its own branch", () => ok(QD.canAnswer(verified, "b1").ok));

it("a verified pharmacy may NOT answer for another branch", () => {
  const r = QD.canAnswer(verified, "b9");
  no(r.ok);
  eq(r.reason, "WRONG_BRANCH");
});

it("a self-asserted prototype session may answer, but is never called verified", () => {
  /* The on-device path cannot reach a server to check a licence, so it must
     not be able to write the same word the server writes. It answers — the
     prototype has to work — but the status is distinguishable, which is what
     lets every screen label the claim honestly. */
  const selfAsserted = { role: "VERIFIED_PHARMACIST", pharmacyId: "b1", licenseStatus: "SELF_ASSERTED" };
  ok(QD.canAnswer(selfAsserted, "b1").ok, "must still be able to answer");
  ok(QD.isSelfAsserted(selfAsserted), "must be identifiable as self-asserted");
  no(QD.isSelfAsserted(verified), "a server-verified session is not self-asserted");
  eq(QD.ANSWERABLE.indexOf("UNKNOWN"), -1, "UNKNOWN must never be answerable");
});

it("a self-asserted session is still bound to its branch", () => {
  const selfAsserted = { role: "VERIFIED_PHARMACIST", pharmacyId: "b1", licenseStatus: "SELF_ASSERTED" };
  eq(QD.canAnswer(selfAsserted, "b9").reason, "WRONG_BRANCH");
});

it("staff may claim stock but may not open a prescription", () => {
  const staff = { role: "PHARMACY_STAFF", pharmacyId: "b1", licenseStatus: "VERIFIED" };
  ok(QD.canAnswer(staff, "b1").ok, "staff can answer");
  no(QD.canReadPrescription(staff, "b1").ok, "staff cannot read the prescription");
  ok(QD.canReadPrescription(verified, "b1").ok, "the pharmacist can");
});

/* ---------------------------------------------------------------- */
describe("consent");

it("a granted consent states purpose, recipients, retention and withdrawal", () => {
  const c = QD.grantConsent("s1", 1700000000000);
  for (const k of ["purpose_ar", "recipients_ar", "retention_ar", "withdrawal_ar", "audited_ar"]) {
    ok(c.terms[k] && c.terms[k].length > 10, "missing or empty term: " + k);
  }
  ok(QD.consentActive(c));
});

it("withdrawal deactivates without destroying the record", () => {
  const c = QD.grantConsent("s1", 1000);
  const w = QD.withdrawConsent(c, 2000);
  no(QD.consentActive(w), "no longer active");
  eq(w.grantedAt, 1000, "the original grant is still on record");
  eq(w.withdrawnAt, 2000);
});

it("absent consent is not active", () => {
  no(QD.consentActive(null));
  no(QD.consentActive(undefined));
});

/* ---------------------------------------------------------------- */
describe("audit chain");

function chainOf3() {
  let c = [];
  c = QD.auditAppend(c, { action: "PRESCRIPTION_VIEWED", actor: "ph1", pharmacyId: "b1", subject: "u1", at: 1 });
  c = QD.auditAppend(c, { action: "STOCK_CLAIMED", actor: "ph1", pharmacyId: "b1", subject: "u1", at: 2 });
  c = QD.auditAppend(c, { action: "HANDOFF_OPENED", actor: "ph1", pharmacyId: "b1", subject: "u1", at: 3 });
  return c;
}

it("an intact chain verifies", () => {
  eq(QD.auditVerify(chainOf3()), -1);
});

it("the first entry links to genesis", () => {
  eq(chainOf3()[0].previousHash, QD.GENESIS);
});

it("editing an entry is detected, and names which one", () => {
  const c = chainOf3();
  c[1].actor = "someone-else";
  eq(QD.auditVerify(c), 1, "should point at the edited entry");
});

it("deleting an entry is detected", () => {
  const c = chainOf3();
  c.splice(1, 1);
  ok(QD.auditVerify(c) !== -1, "a removed entry must break the chain");
});

it("appending a forged entry without the chain is detected", () => {
  const c = chainOf3();
  c.push({ action: "STOCK_CLAIMED", actor: "forger", at: 9, previousHash: "deadbeef", entryHash: "cafebabe" });
  eq(QD.auditVerify(c), 3);
});

/* ---------------------------------------------------------------- */
describe("price provenance");

it("official and reported stay separate", () => {
  const v = QD.priceView(
    { status: "verified", officialPriceIqd: 12000, verifiedAt: "2026-07-01" },
    { amountIqd: 15000, confirmedAt: "2026-07-28", pharmacyId: "b1" }
  );
  eq(v.official.amount, 12000);
  eq(v.reported.amount, 15000);
  eq(v.reported.pharmacyId, "b1");
});

it("an unavailable official source is shown as unavailable, not replaced", () => {
  const v = QD.priceView({ status: "unavailable", reason: "TIMEOUT" }, { amountIqd: 15000, confirmedAt: "x" });
  eq(v.official.state, "unavailable");
  eq(v.official.amount, null, "the pharmacy price must never fill the official slot");
  eq(v.official.reason, "TIMEOUT");
  eq(v.reported.amount, 15000, "the reported price is still shown");
});

it("a large gap is surfaced and a small one is not", () => {
  const big = QD.priceView({ status: "verified", officialPriceIqd: 10000, verifiedAt: "x" }, { amountIqd: 14000, confirmedAt: "y" });
  eq(QD.priceGap(big, 15), 40);
  const small = QD.priceView({ status: "verified", officialPriceIqd: 10000, verifiedAt: "x" }, { amountIqd: 10500, confirmedAt: "y" });
  eq(QD.priceGap(small, 15), null);
});

it("a gap cannot be computed from a missing price", () => {
  eq(QD.priceGap(QD.priceView({ status: "unavailable", reason: "x" }, { amountIqd: 9000, confirmedAt: "y" })), null);
});

/* ---------------------------------------------------------------- */
describe("launch readiness");

it("placeholder numbers are reported as a blocker", () => {
  const b = QD.launchBlockers([{ phone: "9647700000123" }, { phone: "9647801234567" }], {});
  const hit = b.find((x) => x.id === "PLACEHOLDER_NUMBERS");
  ok(hit, "must flag the placeholder");
  eq(hit.count, 1);
});

it("real numbers alone do not clear the list — the other blockers stand", () => {
  const b = QD.launchBlockers([{ phone: "9647801234567" }], {});
  no(b.some((x) => x.id === "PLACEHOLDER_NUMBERS"));
  ok(b.some((x) => x.id === "NO_PHARMACY_AUTH_BACKEND"));
  ok(b.some((x) => x.id === "AUDIT_CLIENT_SIDE"));
});

it("a fully resolved deployment reports nothing", () => {
  eq(QD.launchBlockers([{ phone: "9647801234567" }],
    { pharmacyAuthBackend: true, auditServerSide: true, realData: true }), []);
});

/* ---------------------------------------------------------------- */
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
