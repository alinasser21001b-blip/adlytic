#!/usr/bin/env node
/* ============================================================
   QAREEB — SERVER LIBRARY TESTS
   ============================================================
   Run:  node tools/test-server.mjs

   These cover the security-relevant half of the backend: token signing and
   forgery, one-time codes and their window, Iraqi phone normalisation, and
   the audit chain's tamper detection. The endpoint handlers themselves need
   a Netlify runtime; everything they *decide with* is here and testable.
   ============================================================ */
process.env.QAREEB_AUTH_SECRET = "test-secret-that-is-definitely-long-enough-01";

const lib = await import("../netlify/functions/_lib.mjs");

let pass = 0; const fails = []; let group = "";
const describe = (n) => { group = n; console.log("\n── " + n); };
function it(n, fn) {
  try { fn(); pass++; console.log("   ✓ " + n); }
  catch (e) { fails.push(group + " › " + n + ": " + e.message); console.log("   ✗ " + n + "\n     " + e.message); }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ": " : "") + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const no = (v, m) => { if (v) throw new Error(m || "expected falsy, got " + JSON.stringify(v)); };

/* ---------------------------------------------------------------- */
describe("configuration fails closed");

it("a short or missing secret disables signing entirely", () => {
  const real = process.env.QAREEB_AUTH_SECRET;
  process.env.QAREEB_AUTH_SECRET = "";
  eq(lib.secret(), null, "empty secret");
  eq(lib.sign({ a: 1 }), null, "must not sign without a secret");
  eq(lib.verify("anything.atall"), null, "must not verify without a secret");
  process.env.QAREEB_AUTH_SECRET = "tooshort";
  eq(lib.secret(), null, "a short secret is no secret");
  process.env.QAREEB_AUTH_SECRET = real;
  ok(lib.secret(), "restored");
});

/* ---------------------------------------------------------------- */
describe("session tokens");

it("a signed token round-trips with its claims", () => {
  const t = lib.sign({ role: "VERIFIED_PHARMACIST", pharmacyId: "b1" });
  const c = lib.verify(t);
  ok(c, "should verify");
  eq(c.role, "VERIFIED_PHARMACIST");
  eq(c.pharmacyId, "b1");
});

it("a tampered payload is rejected", () => {
  const t = lib.sign({ role: "PHARMACY_STAFF", pharmacyId: "b1" });
  const [p, mac] = t.split(".");
  const body = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  body.role = "VERIFIED_PHARMACIST";           /* privilege escalation attempt */
  const forged = Buffer.from(JSON.stringify(body)).toString("base64url") + "." + mac;
  eq(lib.verify(forged), null, "a client must not be able to upgrade its own role");
});

it("a token cannot be moved to another branch", () => {
  const t = lib.sign({ role: "VERIFIED_PHARMACIST", pharmacyId: "b1" });
  const [p, mac] = t.split(".");
  const body = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  body.pharmacyId = "b9";
  eq(lib.verify(Buffer.from(JSON.stringify(body)).toString("base64url") + "." + mac), null);
});

it("a token signed with a different secret is rejected", () => {
  const t = lib.sign({ pharmacyId: "b1" });
  const real = process.env.QAREEB_AUTH_SECRET;
  process.env.QAREEB_AUTH_SECRET = "a-completely-different-secret-key-000000";
  eq(lib.verify(t), null, "another deployment's token must not work here");
  process.env.QAREEB_AUTH_SECRET = real;
});

it("an expired token is rejected", () => {
  const t = lib.sign({ pharmacyId: "b1" }, -1);
  eq(lib.verify(t), null);
});

it("garbage is rejected without throwing", () => {
  for (const bad of ["", ".", "a.b", "nodothere", null, undefined, 42, {}]) {
    eq(lib.verify(bad), null, "input: " + JSON.stringify(bad));
  }
});

/* ---------------------------------------------------------------- */
describe("one-time codes");

it("a code is six digits and matches itself", () => {
  const c = lib.otpFor("9647801234567");
  ok(/^\d{6}$/.test(c), "got " + c);
  ok(lib.otpValid("9647801234567", c));
});

it("a code for one number does not work for another", () => {
  no(lib.otpValid("9647809999999", lib.otpFor("9647801234567")));
});

it("the previous window is still accepted, the one before it is not", () => {
  const phone = "9647801234567";
  ok(lib.otpValid(phone, lib.otpFor(phone, -1)), "just-expired code should still work");
  no(lib.otpValid(phone, lib.otpFor(phone, -3)), "an old code must not");
});

it("malformed codes are rejected", () => {
  for (const bad of ["", "12345", "1234567", "abcdef", null, undefined]) {
    no(lib.otpValid("9647801234567", bad), "input: " + JSON.stringify(bad));
  }
});

/* ---------------------------------------------------------------- */
describe("phone normalisation");

it("accepts the forms Iraqis actually type", () => {
  const want = "9647801234567";
  for (const form of ["07801234567", "+9647801234567", "9647801234567",
                      "0780 123 4567", "0780-123-4567", "009647801234567"]) {
    eq(lib.normalisePhone(form), want, "input: " + form);
  }
});

it("rejects numbers that are not Iraqi mobiles", () => {
  for (const bad of ["0123456", "12345678901234", "", null, "07001234567", "+15551234567"]) {
    eq(lib.normalisePhone(bad), null, "input: " + JSON.stringify(bad));
  }
});

it("placeholder seed numbers are recognised and refused", () => {
  ok(lib.isPlaceholderPhone("9647700000123"));
  no(lib.isPlaceholderPhone("9647801234567"));
});

it("licence format is enforced", () => {
  ok(lib.LICENCE.test("IQ-PH-1234"));
  no(lib.LICENCE.test("IQ-PH-12"), "too short");
  no(lib.LICENCE.test("XX-PH-1234"), "wrong prefix");
  no(lib.LICENCE.test("IQ-PH-abcd"), "not digits");
});

/* ---------------------------------------------------------------- */
describe("server audit chain");

const build = () => {
  const chain = [];
  for (const a of ["PHARMACY_SIGNIN", "STOCK_CLAIMED", "HANDOFF_OPENED"]) {
    const prev = chain.length ? chain[chain.length - 1].entryHash : lib.GENESIS;
    const e = { action: a, actor: "ph-IQ-PH-1234", pharmacyId: "b1", subject: "u1", reason: null, at: chain.length + 1 };
    chain.push({ ...e, previousHash: prev, entryHash: lib.entryHash(prev, e) });
  }
  return chain;
};

it("an intact chain verifies", () => eq(lib.verifyChain(build()), -1));

it("an edited entry is detected and located", () => {
  const c = build();
  c[1].pharmacyId = "b9";
  eq(lib.verifyChain(c), 1);
});

it("a deleted entry breaks the chain", () => {
  const c = build();
  c.splice(1, 1);
  ok(lib.verifyChain(c) !== -1);
});

it("a reordered chain is detected", () => {
  const c = build();
  [c[0], c[1]] = [c[1], c[0]];
  ok(lib.verifyChain(c) !== -1);
});

it("hashes are 32 hex chars and depend on the previous link", () => {
  const e = { action: "STOCK_CLAIMED", actor: "a", pharmacyId: "b1", subject: "s", reason: null, at: 1 };
  const h1 = lib.entryHash(lib.GENESIS, e);
  const h2 = lib.entryHash("ffffffffffffffffffffffffffffffff", e);
  ok(/^[0-9a-f]{32}$/.test(h1), "got " + h1);
  ok(h1 !== h2, "same entry under a different parent must hash differently");
});

/* ---------------------------------------------------------------- */
describe("rate limiting");

it("allows up to the limit then refuses", () => {
  const k = "test-key-" + Math.floor(pass * 7919);
  for (let i = 0; i < 3; i++) ok(lib.rateLimit(k, 3, 60000), "attempt " + (i + 1));
  no(lib.rateLimit(k, 3, 60000), "the fourth must be refused");
});

/* ---------------------------------------------------------------- */
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
