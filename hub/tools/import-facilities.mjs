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
     name_ar      اسم المنشأة بالعربي          required
     name_en      Latin name                  optional
     type         pharmacy | hospital | clinic required
     district     district id (karrada…)      required — must exist in DISTRICTS
     phone        07XX… or +9647XX…           required
     wa           WhatsApp, defaults to phone optional
     licence      IQ-PH-0000                  required to be marked verified
     lat, lng     decimal degrees             optional but strongly wanted
     open, close  HH:MM or minutes            optional — becomes `hours`
     always       1 / yes / نعم               optional — open 24h
     night        1 / yes / نعم               optional — night duty
     er           1 / yes / نعم               optional — has an emergency room
     verified_by  who confirmed it, by name   required to be marked verified

   ⚠ THE SHAPE THIS EMITS IS THE SHAPE js/data.js READS. That sentence is
   here because it was not true. The tool emitted `city`, `area_ar`, `open`
   and `close`; the app reads `district`, `type`, `hours` and `always`. Anyone
   who followed this file's own closing instruction — "replace FACILITIES with
   this array" — got a directory where nothing had a district, nothing had a
   type, and therefore nothing appeared in any list. An import tool whose
   output does not load is worse than no import tool, because it converts a
   known gap into a silent one. `tools/test-import.mjs` now asserts the emitted
   shape against the fields the app actually reads.

   WHAT IT REFUSES, rather than importing and hoping:
     · a phone that is not a valid Iraqi mobile
     · a placeholder number from the seed set
     · `verified` without both a licence and a named verifier
     · two records sharing one phone number
     · a district that does not exist in js/data.js
     · a type the app does not render
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

/* Accepts HH:MM or raw minutes and returns HH:MM, because that is the form
   `hours` entries carry in js/data.js. */
const toHHMM = (v) => {
  if (!v) return null;
  if (/^\d{1,2}:\d{2}$/.test(v)) return v.padStart(5, "0");
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (n < 0 || n > 1440) return null;
    return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  }
  return null;
};
const yes = (v) => /^(1|y|yes|true|نعم|صح)$/i.test(String(v || "").trim());

const TYPES = ["pharmacy", "hospital", "clinic"];

/* The district list is read from js/data.js rather than duplicated, so a
   typo in a spreadsheet is caught here instead of producing a facility that
   exists in the data and appears in no list. */
function knownDistricts() {
  try {
    const src = readFileSync(join(HUB, "js/data.js"), "utf8");
    const ids = new Set();
    const block = src.match(/const DISTRICTS\s*=\s*\[([\s\S]*?)\n\];/);
    for (const m of (block ? block[1] : "").matchAll(/id:\s*"([a-z0-9-]+)"/g)) ids.add(m[1]);
    return ids;
  } catch { return new Set(); }
}
const DISTRICTS = knownDistricts();

const rows = parseCSV(readFileSync(file, "utf8"));
const out = [], errors = [], warnings = [];
const seenPhone = new Map();

rows.forEach((r, i) => {
  const at = `صف ${i + 2}`;
  const name = r.name_ar || r["اسم"] || "";
  const fail = (m) => errors.push(`${at}: ${m}${name ? ` (${name})` : ""}`);

  if (!name) return fail("name_ar مفقود");
  const type = (r.type || "").trim().toLowerCase();
  if (!TYPES.includes(type)) return fail(`type لازم يكون واحداً من: ${TYPES.join(" / ")} — وصل "${r.type}"`);
  const district = (r.district || r.city || "").trim().toLowerCase();
  if (!district) return fail("district مفقود");
  if (DISTRICTS.size && !DISTRICTS.has(district)) {
    return fail(`district غير معروف: "${district}" — لازم يكون من DISTRICTS في js/data.js`);
  }

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

  const open = toHHMM(r.open), close = toHHMM(r.close);
  if ((r.open && !open) || (r.close && !close)) return fail(`وقت غير صالح: "${r.open || r.close}"`);
  const always = yes(r.always);
  if (!always && (r.open || r.close) && !(open && close)) {
    return fail("open و close لازم يجون سوية");
  }

  out.push({
    /* The id prefix matches the seed data's own convention — p for pharmacy,
       h for hospital, c for clinic — so an imported directory and a seeded
       one are indistinguishable to every selector that reads an id. */
    id: (type === "hospital" ? "h" : type === "clinic" ? "c" : "p") + String(out.length + 1).padStart(3, "0"),
    type,
    ar: name, en: r.name_en || name,
    district,
    phone, wa,
    lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null,
    /* `hours` and `always`, not `open`/`close` — this is the shape the app
       reads. `d: "wk"` means the working week, which is what a spreadsheet
       with one pair of times is describing. */
    ...(always ? { always: true, hours: [{ d: 0, f: "00:00", t: "24:00" }] }
       : (open && close ? { hours: [{ d: "wk", f: open, t: close }] } : {})),
    ...(yes(r.night) ? { night: true } : {}),
    ...(yes(r.er) ? { er: true } : {}),
    licence: licence || null,
    verified,
    verifiedAt: verified ? new Date().toISOString().slice(0, 10) : null,
    verifiedBy: verified ? r.verified_by : null,
    /* Days since the record was last confirmed. Zero on import is honest:
       it was confirmed today, by the named verifier. */
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

   These carry the same field names js/data.js's FACILITIES already use —
   id, type, ar, en, district, phone, wa, lat, lng, hours, always, night, er,
   verified, updated — so replacing the array is a replacement, not a
   migration.

   To use them: replace FACILITIES in js/data.js with this array, then set
   DATA_PROVENANCE.real = true and each source's origin to "imported" with
   its verifiedAt and verifiedBy. Then run:

     node tools/preflight.mjs --release

   which refuses to pass while any placeholder number or synthetic provenance
   remains. */
const FACILITIES_REAL = ${JSON.stringify(out, null, 2)};
`, "utf8");

console.log(`\n${line}\nكُتب ${out.length} سجلاً إلى js/facilities.real.js`);
console.log(`الخطوة الجاية: استبدل FACILITIES بها، وحدّث DATA_PROVENANCE، ثم شغّل tools/preflight.mjs --release\n`);
