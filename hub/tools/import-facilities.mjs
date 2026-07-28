#!/usr/bin/env node
/* ============================================================
   QAREEB — REAL FACILITY IMPORT
   ============================================================
   Run:  node tools/import-facilities.mjs pharmacies.csv
         node tools/import-facilities.mjs pharmacies.csv --write

   Without --write it validates and reports, changing nothing. This is the
   path from synthetic seed data to real records, and it is a tool rather
   than an instruction to hand-edit js/data.js because hand-editing 55
   records is how a wrong phone number reaches a patient at 2am.

   EXPECTED COLUMNS (header row required, order irrelevant):
     name_ar      اسم الصيدلية بالعربي        required
     name_en      Latin name                  optional
     city         governorate id (baghdad…)   required
     area_ar      المنطقة                     required
     phone        07XX… or +9647XX…           required
     wa           WhatsApp, defaults to phone optional
     licence      IQ-PH-0000                  required to be marked verified
     lat, lng     decimal degrees             optional but strongly wanted
     open, close  minutes or HH:MM            optional
     verified_by  who confirmed it, by name   required to be marked verified

   WHAT IT REFUSES, rather than importing and hoping:
     · a phone that is not a valid Iraqi mobile
     · a placeholder number from the seed set
     · `verified` without both a licence and a named verifier
     · two records sharing one phone number
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
const WRITE = process.argv.includes("--write");

if (!file) {
  console.error("usage: node tools/import-facilities.mjs <file.csv> [--write]");
  process.exit(2);
}

/* A small CSV reader that handles quoted fields and embedded commas —
   Arabic names contain commas often enough that split(',') corrupts data
   silently, which is the worst way for an import to fail. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const IQ = /^964(7[3-9])\d{8}$/;
const LICENCE = /^IQ-PH-\d{4,8}$/;
const isPlaceholder = (p) => /^9647700000/.test(p || "");

function normalisePhone(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "964" + d.slice(1);
  if (/^7[3-9]\d{8}$/.test(d)) d = "964" + d;
  return IQ.test(d) ? d : null;
}

const toMins = (v) => {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const rows = parseCSV(readFileSync(file, "utf8"));
const out = [], errors = [], warnings = [];
const seenPhone = new Map();

rows.forEach((r, i) => {
  const at = `صف ${i + 2}`;
  const name = r.name_ar || r["اسم"] || "";
  const fail = (m) => errors.push(`${at}: ${m}${name ? ` (${name})` : ""}`);

  if (!name) return fail("name_ar مفقود");
  if (!r.city) return fail("city مفقود");
  if (!r.area_ar) return fail("area_ar مفقود");

  const phone = normalisePhone(r.phone);
  if (!phone) return fail(`رقم غير صالح: "${r.phone}"`);
  if (isPlaceholder(phone)) return fail("رقم نموذجي من بيانات العرض — غير مقبول");
  if (seenPhone.has(phone)) return fail(`رقم مكرر مع ${seenPhone.get(phone)}`);
  seenPhone.set(phone, name);

  const wa = r.wa ? normalisePhone(r.wa) : phone;
  if (r.wa && !wa) return fail(`رقم واتساب غير صالح: "${r.wa}"`);

  const licence = (r.licence || "").toUpperCase();
  if (licence && !LICENCE.test(licence)) return fail(`صيغة إجازة غير صحيحة: "${r.licence}"`);

  /* "verified" is a claim about the real world, so it needs a licence and a
     person who checked it. Without both, the record imports unverified —
     which is honest — rather than being rejected outright. */
  const verified = !!(licence && r.verified_by);
  if (!verified && (licence || r.verified_by)) {
    warnings.push(`${at}: ${name} — يحتاج licence و verified_by معاً ليُوسم موثّقاً`);
  }
  if (!r.lat || !r.lng) warnings.push(`${at}: ${name} — بلا إحداثيات، ما راح يظهر بالمسافات`);

  out.push({
    id: "f" + String(out.length + 1).padStart(3, "0"),
    ar: name, en: r.name_en || name,
    city: r.city, area_ar: r.area_ar, area_en: r.area_en || r.area_ar,
    phone, wa,
    lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null,
    open: toMins(r.open), close: toMins(r.close),
    licence: licence || null,
    verified,
    verifiedAt: verified ? new Date().toISOString().slice(0, 10) : null,
    verifiedBy: verified ? r.verified_by : null,
    updated: 0,
  });
});

const line = "─".repeat(60);
console.log(`\nقريب — استيراد منشآت\n${line}`);
console.log(`قُرئ: ${rows.length} صفاً · قُبل: ${out.length} · رُفض: ${errors.length}`);
console.log(`موثّقة: ${out.filter((f) => f.verified).length} · بإحداثيات: ${out.filter((f) => f.lat).length}`);

if (errors.length) {
  console.log(`\nمرفوضة (${errors.length}):`);
  errors.slice(0, 20).forEach((e) => console.log("  ✗ " + e));
  if (errors.length > 20) console.log(`  … و${errors.length - 20} غيرها`);
}
if (warnings.length) {
  console.log(`\nتنبيهات (${warnings.length}):`);
  warnings.slice(0, 12).forEach((w) => console.log("  · " + w));
  if (warnings.length > 12) console.log(`  … و${warnings.length - 12} غيرها`);
}

if (!WRITE) {
  console.log(`\n${line}\nفحص فقط — ما تغيّر شي. أضف --write للكتابة.\n`);
  process.exit(errors.length ? 1 : 0);
}
if (errors.length) {
  console.log(`\n${line}\nما كتبت شي: صحّح ${errors.length} خطأ أولاً.\n`);
  process.exit(1);
}
if (!out.length) {
  console.log(`\n${line}\nما في سجل صالح للكتابة.\n`);
  process.exit(1);
}

const dest = join(HUB, "js/facilities.real.js");
writeFileSync(dest,
`/* GENERATED by tools/import-facilities.mjs — do not hand-edit.
   Source: ${file}
   Imported: ${new Date().toISOString()}
   Records: ${out.length} (${out.filter((f) => f.verified).length} verified)

   To use these, replace FACILITIES in js/data.js with this array and update
   DATA_PROVENANCE.sources.pharmacies to { origin: "imported", verifiedAt,
   verifiedBy }. Then run tools/preflight.mjs --release; it will refuse if
   the provenance and the records still disagree. */
const FACILITIES_REAL = ${JSON.stringify(out, null, 2)};
`, "utf8");

console.log(`\n${line}\nكُتب ${out.length} سجلاً إلى js/facilities.real.js`);
console.log(`الخطوة الجاية: استبدل FACILITIES بها، وحدّث DATA_PROVENANCE، ثم شغّل tools/preflight.mjs --release\n`);
