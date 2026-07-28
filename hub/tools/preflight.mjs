#!/usr/bin/env node
/* ============================================================
   QAREEB — PRE-LAUNCH GATE
   ============================================================
   Run:  node tools/preflight.mjs            (report)
         node tools/preflight.mjs --release  (report, and FAIL on any blocker)

   The readiness board in the operator console shows what is outstanding.
   This is the part that makes it binding: with --release it exits non-zero,
   so a release pipeline cannot ship placeholder phone numbers or synthetic
   pharmacy records by anyone forgetting.

   It re-derives everything from the actual files. DATA_PROVENANCE.real
   claiming the data is real does not make it so — if the records still look
   synthetic, the two disagree and that disagreement is itself a failure,
   because a provenance flag that cannot be contradicted is decoration.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = process.argv.includes("--release");

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);

/* domain.js assigns globalThis.QD explicitly, so it lands on the context.
   data.js declares plain `const`s, which in a vm stay in the script's own
   lexical scope and never reach the context object — so it is evaluated with
   a trailing expression that hands its bindings back from inside that scope. */
vm.runInContext(readFileSync(join(HUB, "js/domain.js"), "utf8"), ctx, { filename: "domain.js" });
const NAMES = ["DATA_PROVENANCE", "FACILITIES", "BRANCHES", "DOCTORS", "CONFIG", "RX_MEDS", "SIGNALS"];
const data = vm.runInContext(
  readFileSync(join(HUB, "js/data.js"), "utf8") + `\n;({${NAMES.join(",")}})`,
  ctx, { filename: "data.js" });

const { QD } = ctx;
const { DATA_PROVENANCE, FACILITIES, BRANCHES, DOCTORS, CONFIG, RX_MEDS } = data;
ctx.RX_MEDS = RX_MEDS;

const facilities = [...(FACILITIES || []), ...(BRANCHES || [])];
const everyone = [...facilities, ...(DOCTORS || [])];

const problems = [];
const notes = [];
const add = (id, ar, detail) => problems.push({ id, ar, detail });

/* ---------- 1 · placeholder contact details ---------- */
const placeholders = everyone.filter(
  (e) => QD.PLACEHOLDER_PHONE.test(String(e.phone || "")) || QD.PLACEHOLDER_PHONE.test(String(e.wa || ""))
);
if (placeholders.length) {
  add("PLACEHOLDER_NUMBERS",
    `${placeholders.length} سجلاً يحمل رقماً نموذجياً (9647700000xxx)`,
    placeholders.slice(0, 5).map((e) => (e.ar || e.en || e.id) + " · " + (e.phone || e.wa)).join("\n         "));
}

/* A number that is not a placeholder but is also not a plausible Iraqi
   mobile is worse than a placeholder: it looks real and rings nobody. */
const IQ = /^964(7[3-9])\d{8}$/;
const malformed = everyone.filter((e) => {
  const p = String(e.phone || "");
  return p && !IQ.test(p) && !QD.PLACEHOLDER_PHONE.test(p);
});
if (malformed.length) {
  add("MALFORMED_NUMBERS", `${malformed.length} رقماً بصيغة غير عراقية صحيحة`,
    malformed.slice(0, 5).map((e) => (e.ar || e.id) + " · " + e.phone).join("\n         "));
}

/* ---------- 2 · provenance must match reality ---------- */
const synthetic = Object.entries(DATA_PROVENANCE.sources || {})
  .filter(([, v]) => v.origin === "synthetic").map(([k]) => k);
if (synthetic.length) {
  add("SYNTHETIC_DATA", `بيانات نموذجية: ${synthetic.join("، ")}`,
    "Load real records with tools/import-facilities.mjs, then set each source's origin and verifiedAt.");
}
if (DATA_PROVENANCE.real && synthetic.length) {
  add("PROVENANCE_LIES",
    "DATA_PROVENANCE.real = true بينما مصادر ما زالت نموذجية",
    "This is the dangerous one: the app would present synthetic data as verified.");
}
if (DATA_PROVENANCE.real && placeholders.length) {
  add("PROVENANCE_LIES_PHONES",
    "DATA_PROVENANCE.real = true بينما توجد أرقام نموذجية", "");
}

/* ---------- 3 · verified must mean something ---------- */
const verifiedNoProof = facilities.filter((f) => f.verified && !f.verifiedAt && !f.licence);
if (verifiedNoProof.length) {
  notes.push(`${verifiedNoProof.length} منشأة موسومة «موثّقة» بلا تاريخ توثيق أو رقم إجازة`);
}

/* ---------- 4 · safety invariants, asserted not assumed ---------- */
const controlled = (ctx.RX_MEDS || []).filter((m) => QD.isControlled(m));
if (!controlled.length) {
  add("NO_CONTROLLED_CLASSIFICATION",
    "ما في دواء مصنّف كخاضع للرقابة — التصنيف على الأغلب غير مطبّق",
    "If the catalogue truly contains none, remove this check deliberately.");
}
for (const m of controlled) {
  const r = QD.broadcastPayload(
    { id: "t", v: m.variants[0].id, city: "baghdad", district: "x", qty: "1", urg: "normal", ts: Date.now() }, m);
  if (r.ok) add("CONTROLLED_BROADCASTABLE", `${m.ar} يمكن بثّه — خرق خطير`, "");
}

/* ---------- 5 · emergency number, the one that can cost a life ---------- */
if (!CONFIG?.emergency?.unified) add("NO_EMERGENCY_NUMBER", "رقم الطوارئ غير مضبوط", "");
else notes.push(`رقم الطوارئ ${CONFIG.emergency.unified} — تحقّق منه قبل كل إطلاق (${CONFIG.emergency.verified_ar || "?"})`);

/* ---------- report ---------- */
const line = "─".repeat(60);
console.log("\nقريب — فحص ما قبل الإطلاق\n" + line);
console.log(`سجلات المنشآت: ${facilities.length} · الأطباء: ${(DOCTORS || []).length}`);
console.log(`وضع البيانات: ${DATA_PROVENANCE.real ? "حقيقية (مُعلَنة)" : "نموذجية"}`);

if (problems.length) {
  console.log("\nموانع (" + problems.length + "):");
  for (const p of problems) {
    console.log(`  ✗ ${p.id}\n      ${p.ar}` + (p.detail ? `\n         ${p.detail}` : ""));
  }
} else {
  console.log("\n  ✓ ما في مانع مسجّل.");
}
if (notes.length) {
  console.log("\nملاحظات:");
  notes.forEach((n) => console.log("  · " + n));
}

console.log("\n" + line);
if (problems.length && RELEASE) {
  console.log(`الإطلاق محجوب: ${problems.length} مانع.\n`);
  process.exit(1);
}
console.log(problems.length
  ? `${problems.length} مانع — شغّل مع --release ليفشل البناء.\n`
  : "جاهز.\n");
