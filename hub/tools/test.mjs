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
import { readFileSync, readdirSync } from "node:fs";
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

it("a missing data plane is the blocker that outranks the rest", () => {
  /* The one every earlier list forgot. Without it the product's core loop
     cannot happen at all, so it must be reported even when everything else
     is green. */
  const b = QD.launchBlockers([{ phone: "9647801234567" }],
    { pharmacyAuthBackend: true, auditServerSide: true, realData: true });
  ok(b.some((x) => x.id === "NO_DATA_PLANE"), "must report the missing data plane");
  eq(b.length, 1, "and it should be the only thing left");
});

it("a fully resolved deployment reports nothing", () => {
  eq(QD.launchBlockers([{ phone: "9647801234567" }],
    { dataPlane: true, pharmacyAuthBackend: true, auditServerSide: true, realData: true }), []);
});

/* ---------------------------------------------------------------- */
describe("bidi — what the browser actually renders");

/* This is a source guard, not a unit test, and it exists because the bug it
   guards was invisible to 462 passing assertions and to every reading of the
   code. `t.points.map(n).join(" ← ")` is correct JavaScript producing the
   correct DOM in the correct order. U+2190 is Bidi_Class=ON and
   Bidi_Mirrored=No: the algorithm reorders it and never flips it, so between
   two `.num` spans — `unicode-bidi: embed` — the group resolves as one
   left-to-right run inside an Arabic line and "7.1 ← 8.4" reaches the eye as
   "8.4 → 7.1". A worsening HbA1c read as an improving one, on the patient's
   screen and in the clinician's brief, for as long as the line existed.

   Direction between rendered values is carried by a word, or it is not
   carried. */
const uiSources = readdirSync(join(HUB, "js")).filter((f) => f.endsWith(".js"))
  .map((f) => ({ f, src: readFileSync(join(HUB, "js", f), "utf8") }));

/* ---------------------------------------------------------------- */
describe("data honesty — the seal may not outrun the provenance");

/* `verificationState` asks DATA_PROVENANCE before it will say "verified", and
   returns "sample data" while a source is synthetic. Several screens bypassed
   it and read `ent.verified` straight off the record — a flag that is `true`
   on 17 of 18 synthetic doctors — and printed "verified pharmacy" over data
   nobody has ever checked. This is the rule that stops the bypass coming
   back: outside ui-core.js, which owns the mechanism, no screen may branch on
   a raw `.verified` to produce the WORD. */
it("no screen prints a verification claim straight from a raw .verified flag", () => {
  const bad = [];
  for (const { f, src } of uiSources) {
    if (f === "ui-core.js" || f === "data.js" || f === "domain.js") continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    /* `x.verified ? "…موثّق…" : …` — the flag decides the word */
    const re = /\.verified\s*\?[^:]{0,160}(موثّق|موثقة|verified)/gi;
    for (const m of code.match(re) || []) bad.push(`${f}: ${m.slice(0, 60).replace(/\s+/g, " ")}`);
  }
  eq(bad, [], "use sealBadge()/verifiedWord(), which consult DATA_PROVENANCE");
});

it("the seal vocabulary has a word for synthetic, and it is not silence", () => {
  const core = uiSources.find((x) => x.f === "ui-core.js").src;
  ok(/sample:\s*\[/.test(core), "a declared 'sample data' state");
  ok(/origin !== "imported"/.test(core), "and it is reached by asking the provenance, not the record");
  ok(/function verifiedWord/.test(core), "counts of verified entities go through it too");
  ok(/function verifiedCount/.test(core),
    "a COUNT next to that word must be provenance-filtered too, or 'sample data' sits beside a number computed as if every entity were real");
});

/* The word-level guard above did not catch two adjacent bugs, found by
   reading rather than by the regex: a COUNT computed with the raw flag
   printed beside the honest word (`DOCTORS.filter(d => d.verified).length`
   next to "موثّق"), and a raw flag used to GATE a list of recommended
   pharmacies — the controlled-medicine handoff recommended four synthetic
   addresses as "licensed pharmacies nearby" for a real controlled substance.
   Both classes are pinned here by name so a future edit cannot silently
   reintroduce either the literal `.filter(...).length` count or the raw-flag
   gate at these exact sites. */
it("verification COUNTS go through verifiedCount(), not a raw .filter(...).length", () => {
  const bad = [];
  for (const { f, src } of uiSources) {
    if (f === "ui-core.js" || f === "data.js" || f === "domain.js") continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /\.filter\(\s*\([^)]*\)\s*=>\s*[^)]*\.verified\b[^)]*\)\.length/g;
    for (const m of code.match(re) || []) bad.push(`${f}: ${m.slice(0, 70)}`);
  }
  eq(bad, [], "a bare .filter(x => x.verified).length counts synthetic entities as real — use verifiedCount(list, sourceKey)");
});

it("the controlled-medicine handoff recommends pharmacies by provenance, not by the raw flag", () => {
  const src = uiSources.find((x) => x.f === "ui-backend.js").src;
  const fn = (src.match(/function openControlledHandoff[\s\S]*?\n}/) || [""])[0];
  ok(/verificationState\(f,\s*"pharmacies"\)\.k\s*===\s*"verified"/.test(fn),
    "recommending a synthetic address for a controlled substance is a patient-safety failure, not a labeling nit");
  no(/\.filter\(\(f\)\s*=>\s*f\.verified\s*&&/.test(fn), "the raw flag must not gate this list again");
});


/* A prose comment inside a template literal is one stray backtick away from
   terminating the string. That is exactly how this file's own author took the
   whole app down for the length of one edit: `.st` written in an HTML comment
   inside a `` ` ``-quoted template ended the literal, ui-discovery.js stopped
   parsing, and every route rendered a blank page while all 462 assertions
   still passed — because none of them parses the shipped scripts. This does. */
it("every shipped script parses", () => {
  const broken = [];
  for (const { f, src } of uiSources) {
    try { new vm.Script(src, { filename: f }); } catch (e) { broken.push(`${f}: ${e.message}`); }
  }
  eq(broken, [], "a script that does not parse renders nothing, and no unit test notices");
});

it("no rendered value sequence is joined by an arrow", () => {
  const bad = uiSources.filter(({ src }) => /join\(\s*["'`][^"'`]*[←→⟵⟶]/.test(src));
  eq(bad.map((x) => x.f), [], "an arrow between two numbers inverts under RTL");
});

it("no arrow sits directly against an interpolated value", () => {
  const bad = uiSources.filter(({ src }) => /\}\s*[←→⟵⟶]|[←→⟵⟶]\s*\$\{/.test(src));
  eq(bad.map((x) => x.f), [], "the neutral resolves against its neighbours, not against the author's intent");
});

/* The timeline screen rendered "the timeline fills as visits are recorded"
   over a record holding seven events, for as long as it existed.
   `timelineByEpisode` returns `{episodes, unassigned}`; the caller wrote
   `Array.isArray(byEp) ? byEp : []`, which is always the empty branch. A
   defensive fallback wrapped around a wrong assumption is indistinguishable
   from an empty record, and nothing throws.

   Under it, `eventRow` read `e.kind` and `e.label` while `buildTimeline`
   emits `type` and `title` — so even with the shape fixed every row would
   have printed blank. Both are pinned here against the real emitter. */
it("the timeline reads the fields buildTimeline actually emits", () => {
  const ui = uiSources.find((x) => x.f === "ui-record.js").src;
  const emr = uiSources.find((x) => x.f === "emr.js").src;
  for (const field of ["at", "type", "title"])
    ok(new RegExp(`push\\(\\{[^}]*\\b${field}:`, "s").test(emr) || emr.includes(`${field}: `),
      `buildTimeline emits ${field}`);
  /* Comments describing the old bug are allowed to name it; code is not.
     Strip block comments before asserting, or this test fails on its own
     explanation of itself. */
  const code = ui.replace(/\/\*[\s\S]*?\*\//g, "");
  no(/e\.kind|e\.label\b/.test(code), "the timeline must not read fields the emitter never sets");
  no(/Array\.isArray\(byEp\)/.test(code), "the shape must be handled, not guessed at and swallowed");
  ok(/buildTimeline\(/.test(code), "and it reads the flat event list it groups itself");
});

it("the lab series renderer states direction as a word", () => {
  const ui = uiSources.find((x) => x.f === "ui-record.js").src;
  ok(/ارتفع/.test(ui) && /انخفض/.test(ui), "rose and fell must exist as words");
  ok(/function trendSeries/.test(ui), "both the patient screen and the clinician brief share one renderer");
});

/* ---------------------------------------------------------------- */
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
