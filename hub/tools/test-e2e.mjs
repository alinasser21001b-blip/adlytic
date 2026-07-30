#!/usr/bin/env node
/* ============================================================
   QAREEB — THE LOOP, END TO END
   ============================================================
   Run:  node tools/test-e2e.mjs

   One question: can a patient in Baghdad publish a request and a pharmacist
   somewhere else see it and answer it, with the answer coming back? That is
   the entire product, and until the data plane existed the answer was no —
   not "not yet", but architecturally never.

   This drives the REAL netlify/functions/needs.mjs. Only the storage is
   substituted (an in-memory stub matching the SDK's get()-returns-null-on-404
   contract), so what is exercised here is the handler that ships.

   WHAT THIS DOES NOT PROVE: that Netlify's Blobs service behaves as the stub
   does under concurrency and failure. That needs a deployed environment.
   ============================================================ */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobsServer, setEnvironmentContext } from "@netlify/blobs";

process.env.QAREEB_AUTH_SECRET = "e2e-secret-long-enough-to-be-accepted-01";

/* Run the SDK's real local Blobs implementation. The original test described
   an in-memory substitute but never installed one, so getStore() failed closed
   with NO_BLOB_STORE before any product assertion ran. */
const blobDirectory = await mkdtemp(join(tmpdir(), "qareeb-e2e-blobs-"));
const blobToken = "qareeb-e2e-local-token";
const blobServer = new BlobsServer({ directory: blobDirectory, token: blobToken });
const { port: blobPort } = await blobServer.start();
setEnvironmentContext({
  edgeURL: `http://127.0.0.1:${blobPort}`,
  siteID: "qareeb-e2e",
  token: blobToken,
});

const { sign } = await import("../netlify/functions/_lib.mjs");
const handler = (await import("../netlify/functions/needs.mjs")).default;

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("   ✓ " + m); } else { fails.push(m); console.log("   ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const call = async (method, path, { body, token } = {}) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const req = new Request("https://qareeb.test" + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handler(req);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

const pharmacyToken = (pharmacyId, status = "VERIFIED") =>
  sign({ role: "VERIFIED_PHARMACIST", pharmacyId, pharmacistId: "ph-" + pharmacyId, licenseStatus: status });

console.log("\n── the loop ──");

/* 1 — a patient publishes. No account, no phone, no session. */
const pub = await call("POST", "/api/needs", { body: { payload: {
  variantId: "x2a", city: "baghdad", district: "mansour", quantity: "علبة واحدة",
  urgency: "urgent", acceptsAlternative: true, prescriptionHeld: true } } });
eq(pub.status, 200, "a patient can publish with no account");
ok(!!pub.body.id && !!pub.body.ownerToken, "the server returns an id and an owner token");
const REQ = pub.body.id, TOKEN = pub.body.ownerToken;

/* 2 — a DIFFERENT device, a signed-in pharmacy, sees it. This is the line
       the product could not previously cross. */
const t1 = pharmacyToken("p1");
const queue = await call("GET", "/api/needs?city=baghdad", { token: t1 });
eq(queue.status, 200, "a signed-in pharmacy can read the queue");
const found = (queue.body.requests || []).find((r) => r.requestId === REQ);
ok(!!found, "THE PATIENT'S REQUEST IS VISIBLE ON ANOTHER DEVICE");
eq(found && found.state, "broadcasting", "and it reads as broadcasting");

/* 3 — nothing private crossed the wire. */
const blob = JSON.stringify(queue.body);
ok(!blob.includes("ownerHash"), "the owner hash never reaches a pharmacy");
ok(!blob.includes(TOKEN), "the owner token never reaches a pharmacy");
for (const k of ["phone", "landmark", "\"lm\"", "photo", "note"]) {
  ok(!blob.includes(k), `no ${k} in the pharmacy's view`);
}

/* 4 — an anonymous visitor cannot read the queue. */
const anon = await call("GET", "/api/needs?city=baghdad");
eq(anon.status, 401, "an unsigned visitor is refused the queue");

/* 5 — the pharmacy answers. */
const ans = await call("POST", "/api/needs/answer", { token: t1, body: { requestId: REQ, kind: "yes" } });
eq(ans.status, 200, "a signed-in pharmacy can answer");
eq(ans.body.wasFirst, true, "the first answer knows it was first");

/* 6 — a second pharmacy answers a moment later: both kept, first surfaced. */
await new Promise((r) => setTimeout(r, 5));
const t2 = pharmacyToken("p2");
const ans2 = await call("POST", "/api/needs/answer", { token: t2, body: { requestId: REQ, kind: "yes" } });
eq(ans2.body.wasFirst, false, "the second is told another pharmacy was first");
eq(ans2.body.total, 2, "BOTH true claims are kept — neither is discarded");
eq(ans2.body.first, "p1", "the first is surfaced as the answer");

/* 7 — the patient reads their answers back. The loop closes. */
const mine = await call("GET", `/api/needs/mine?id=${REQ}&t=${encodeURIComponent(TOKEN)}`);
eq(mine.status, 200, "the patient can read their own request");
eq(mine.body.answers.length, 2, "THE ANSWERS REACH THE PATIENT");
eq(mine.body.request.state, "acknowledged", "and the request has moved to acknowledged");
ok(!JSON.stringify(mine.body).includes("pharmacistId"), "the individual pharmacist is not exposed");

console.log("\n── who may read what ──");

/* 8 — nobody else can read it, even knowing the id. */
const stolen = await call("GET", `/api/needs/mine?id=${REQ}&t=wrong-token-entirely`);
eq(stolen.status, 403, "a wrong owner token is refused");
const noTok = await call("GET", `/api/needs/mine?id=${REQ}`);
ok(noTok.status === 400 || noTok.status === 403, "no token is refused");

/* 9 — a pharmacy cannot answer as another pharmacy. */
const forged = await call("POST", "/api/needs/answer",
  { token: pharmacyToken("p3"), body: { requestId: REQ, kind: "yes", pharmacyId: "p1" } });
eq(forged.body.first, "p1", "a forged pharmacyId in the body is ignored");
const after = await call("GET", `/api/needs/mine?id=${REQ}&t=${encodeURIComponent(TOKEN)}`);
const p3 = after.body.answers.find((a) => a.pharmacyId === "p3");
ok(!!p3, "p3's answer is recorded under p3, from its own session");
eq(after.body.answers.filter((a) => a.pharmacyId === "p1").length, 1, "p1 still has exactly one answer");

console.log("\n── refusals ──");

/* 10 — a controlled medicine is refused server-side even if a client asks. */
const ctrl = await call("POST", "/api/needs", { body: { payload: {
  variantId: "x9a", city: "baghdad", quantity: "1", urgency: "urgent" } } });
eq(ctrl.status, 422, "a controlled variant is refused by the server");
const ctrl2 = await call("POST", "/api/needs", { body: { payload: {
  typedName: "ريفوتريل ٢ ملغم", city: "baghdad", quantity: "1" } } });
eq(ctrl2.status, 422, "a controlled medicine typed by hand is refused too");

/* 11 — a payload carrying patient identity is refused outright. */
const leak = await call("POST", "/api/needs", { body: { payload: {
  variantId: "x2a", city: "baghdad", quantity: "1", lm: "قرب مستشفى اليرموك",
  phone: "9647801234567" } } });
eq(leak.status, 400, "a payload with a landmark or phone is refused");
eq(leak.body.error, "FORBIDDEN_FIELD", "and says which field");

/* 12 — cancellation needs the owner token. */
const badCancel = await call("POST", "/api/needs/cancel", { body: { id: REQ, ownerToken: "nope" } });
eq(badCancel.status, 403, "a stranger cannot cancel someone's request");
const cancel = await call("POST", "/api/needs/cancel", { body: { id: REQ, ownerToken: TOKEN } });
eq(cancel.status, 200, "the owner can cancel");
const gone = await call("GET", "/api/needs?city=baghdad", { token: t1 });
ok(!(gone.body.requests || []).some((r) => r.requestId === REQ), "a cancelled request leaves the queue");

/* 13 — a request in another governorate does not appear in this queue. */
const basra = await call("POST", "/api/needs", { body: { payload: {
  variantId: "x4a", city: "basra", quantity: "1", urgency: "normal" } } });
eq(basra.status, 200, "a Basra patient can publish");
const bagh = await call("GET", "/api/needs?city=baghdad", { token: t1 });
ok(!(bagh.body.requests || []).some((r) => r.requestId === basra.body.id),
  "a Basra request does not reach a Baghdad pharmacy");
const bq = await call("GET", "/api/needs?city=basra", { token: pharmacyToken("b1") });
ok((bq.body.requests || []).some((r) => r.requestId === basra.body.id),
  "it reaches a Basra pharmacy");

console.log("\n" + "─".repeat(52));
await blobServer.stop();
await rm(blobDirectory, { recursive: true, force: true });
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
console.log("\nالحلقة مكتملة: مريض ينشر · صيدلية على جهاز آخر تشوف وتجاوب · الجواب يوصل المريض.");
