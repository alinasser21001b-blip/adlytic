#!/usr/bin/env node
/* ============================================================
   قريب · اختبار الاستيراد
   ============================================================
   Run:  node tools/test-import.mjs

   The one thing this file exists to prevent: an import tool whose output the
   app cannot load.

   It emitted `city`, `area_ar`, `open` and `close`. The app reads `district`,
   `type`, `hours` and `always`. Anyone who followed the tool's own closing
   instruction got a directory where nothing had a district, nothing had a
   type, and therefore nothing appeared in any list — a known gap converted
   into a silent one, discovered only by a user seeing an empty screen.

   So the emitted shape is now asserted against the fields js/data.js's own
   FACILITIES records carry, read from the file rather than typed here. If
   someone renames a field on either side, this fails.

   All fixture data below is synthetic and uses numbers reserved for tests.
   ============================================================ */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "qareeb-import-"));
const OUT = join(HUB, "js/facilities.real.js");
const hadOut = existsSync(OUT);
const prevOut = hadOut ? readFileSync(OUT, "utf8") : null;

let pass = 0; const fails = []; let group = "";
const describe = (n) => { group = n; console.log("\n── " + n); };
function it(n, fn) {
  try { fn(); pass++; console.log("   ✓ " + n); }
  catch (e) { fails.push(group + " › " + n + ": " + e.message); console.log("   ✗ " + n + "\n     " + e.message); }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ": " : "") + `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const no = (v, m) => { if (v) throw new Error(m || "expected falsy, got " + JSON.stringify(v)); };

/* Run the tool and give back its output plus exit code — never throwing on a
   non-zero exit, because refusing bad input IS the behaviour under test. */
function run(csv, write) {
  const f = join(TMP, "in.csv");
  writeFileSync(f, csv, "utf8");
  const args = [join(HUB, "tools/import-facilities.mjs"), f];
  if (write) args.push("--write");
  try {
    return { code: 0, out: execFileSync(process.execPath, args, { encoding: "utf8", cwd: HUB }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

/* A district that genuinely exists in js/data.js, discovered rather than
   assumed — the fixture must not encode a guess about the seed data. */
const dataSrc = readFileSync(join(HUB, "js/data.js"), "utf8");
const districtBlock = dataSrc.match(/const DISTRICTS\s*=\s*\[([\s\S]*?)\n\];/);
const DISTRICT = (districtBlock ? districtBlock[1] : "").match(/id:\s*"([a-z0-9-]+)"/)?.[1];

const HEAD = "name_ar,name_en,type,district,phone,wa,licence,lat,lng,open,close,always,night,er,verified_by";
const row = (o) => [o.name_ar ?? "صيدلية الاختبار", o.name_en ?? "Test Pharmacy",
  o.type ?? "pharmacy", o.district ?? DISTRICT, o.phone ?? "07811111111", o.wa ?? "",
  o.licence ?? "IQ-PH-1234", o.lat ?? "33.31", o.lng ?? "44.36",
  o.open ?? "09:00", o.close ?? "23:00", o.always ?? "", o.night ?? "", o.er ?? "",
  o.verified_by ?? "مراجع الاختبار"].join(",");
const csv = (...rows) => HEAD + "\n" + rows.join("\n") + "\n";

/* ==================== THE SHAPE ==================== */
describe("١ · الشكل المُخرَج هو الشكل الذي يقرأه التطبيق");

it("js/data.js exposes a district list the tool can validate against", () => {
  ok(DISTRICT, "the fixture needs a real district id from the seed data");
});

it("--write emits records the app can load", () => {
  const r = run(csv(row({})), true);
  eq(r.code, 0, r.out);
  ok(existsSync(OUT), "the generated file must exist");
  const src = readFileSync(OUT, "utf8");
  const arr = JSON.parse(src.match(/=\s*(\[[\s\S]*\]);\s*$/m)[1]);
  eq(arr.length, 1);
  const f = arr[0];

  /* Every field name the app reads off a facility. Getting one of these
     wrong is invisible until a screen is empty. */
  for (const k of ["id", "type", "ar", "en", "district", "phone", "verified"]) {
    ok(Object.prototype.hasOwnProperty.call(f, k), `missing field the app reads: ${k}`);
  }
  eq(f.type, "pharmacy");
  eq(f.district, DISTRICT);
  no("city" in f, "`city` is the old wrong name — the app reads `district`");
  no("area_ar" in f, "`area_ar` was never read by anything");
  no("open" in f, "`open`/`close` are the old wrong shape — the app reads `hours`");
  no("close" in f);
});

it("the shape matches what js/data.js's own records carry", () => {
  const src = readFileSync(OUT, "utf8");
  const f = JSON.parse(src.match(/=\s*(\[[\s\S]*\]);\s*$/m)[1])[0];
  /* Pull one real seed pharmacy out of data.js and compare key sets rather
     than trusting a list typed in this test. */
  const seed = dataSrc.match(/\{\s*id:\s*"p\d+",\s*type:\s*"pharmacy"[\s\S]*?\n/);
  ok(seed, "no seed pharmacy found to compare against");
  for (const k of ["id", "type", "ar", "en", "district", "phone", "wa", "verified", "updated"]) {
    ok(seed[0].includes(k + ":"), `seed record lacks ${k} — update this test, not the tool`);
    ok(Object.prototype.hasOwnProperty.call(f, k), `import omits ${k}, which the seed records carry`);
  }
});

it("opening hours become `hours`, in the entry shape data.js uses", () => {
  const f = JSON.parse(readFileSync(OUT, "utf8").match(/=\s*(\[[\s\S]*\]);\s*$/m)[1])[0];
  ok(Array.isArray(f.hours));
  eq(f.hours[0].f, "09:00");
  eq(f.hours[0].t, "23:00");
  ok("d" in f.hours[0], "an entry with no day is an entry no renderer can place");
});

it("a 24-hour facility gets `always` and a full-day entry", () => {
  run(csv(row({ always: "نعم", open: "", close: "" })), true);
  const f = JSON.parse(readFileSync(OUT, "utf8").match(/=\s*(\[[\s\S]*\]);\s*$/m)[1])[0];
  eq(f.always, true);
  eq(f.hours[0].t, "24:00");
});

it("ids use the seed data's own prefixes — p, h, c", () => {
  run(csv(row({ type: "pharmacy" })), true);
  const f = JSON.parse(readFileSync(OUT, "utf8").match(/=\s*(\[[\s\S]*\]);\s*$/m)[1])[0];
  ok(f.id.startsWith("p"), "an imported pharmacy must be indistinguishable from a seeded one: " + f.id);
});

it("hospitals get an h-prefixed id and keep their er flag", () => {
  run(csv(row({ type: "hospital", er: "1", licence: "", verified_by: "" })), true);
  const f = JSON.parse(readFileSync(OUT, "utf8").match(/=\s*(\[[\s\S]*\]);\s*$/m)[1])[0];
  ok(f.id.startsWith("h"));
  eq(f.type, "hospital");
  eq(f.er, true);
});

/* ==================== WHAT IT REFUSES ==================== */
describe("٢ · ما يرفضه بدل ما يستورده ويأمل");

it("a placeholder number from the seed set is refused", () => {
  const r = run(csv(row({ phone: "9647700000101" })));
  ok(r.code !== 0);
  ok(r.out.includes("نموذجي"), r.out.slice(0, 200));
});

it("a phone that is not an Iraqi mobile is refused", () => {
  ok(run(csv(row({ phone: "12345" }))).code !== 0);
});

it("two records sharing a phone number are refused", () => {
  const r = run(csv(row({}), row({ name_ar: "ثانية" })));
  ok(r.code !== 0);
  ok(r.out.includes("مكرر"), r.out.slice(0, 300));
});

it("an unknown district is refused rather than importing an invisible record", () => {
  const r = run(csv(row({ district: "not-a-real-district" })));
  ok(r.code !== 0);
  ok(r.out.includes("غير معروف"), r.out.slice(0, 300));
});

it("a type the app cannot render is refused", () => {
  const r = run(csv(row({ type: "warehouse" })));
  ok(r.code !== 0);
  ok(r.out.includes("type"), r.out.slice(0, 300));
});

it("verified needs BOTH a licence and a named human", () => {
  run(csv(row({ verified_by: "" })), true);
  const f = JSON.parse(readFileSync(OUT, "utf8").match(/=\s*(\[[\s\S]*\]);\s*$/m)[1])[0];
  eq(f.verified, false, "a claim about the real world needs someone who checked it");
  eq(f.verifiedBy, null);
});

it("a dry run changes nothing", () => {
  const before = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
  run(csv(row({ name_ar: "لا تُكتب" })));
  const after = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
  eq(after, before, "without --write the tool must not touch the filesystem");
});

/* ---- leave the tree exactly as found ---- */
if (hadOut) writeFileSync(OUT, prevOut, "utf8");
else if (existsSync(OUT)) rmSync(OUT);
rmSync(TMP, { recursive: true, force: true });

console.log("\n" + "─".repeat(56));
if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
