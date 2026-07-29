/* ============================================================
   QAREEB — THE CRITICAL JOURNEYS, IN A REAL BROWSER
   ============================================================
   Run:  python3 -m http.server 8899    (from hub/)
         node tools/journeys.mjs

   Needs Playwright, so it is NOT part of `npm test` — that suite stays
   dependency-free. This is the other half: `npm test` proves the rules,
   this proves a person can reach them.

   Twenty journeys, each driven as a user drives it, and each asserting
   the whole chain rather than the screen:

     ENTRY -> ACTION -> DATA -> CONFIRMATION -> PERSISTENCE -> RETURN

   PERSISTENCE is the step that catches the real failures. A screen that
   shows a saved allergy proves nothing; a screen that still shows it
   after a hard reload proves it was written. So every write journey
   reloads before it believes itself.
   ============================================================ */
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("journeys needs Playwright:  npm i    (then re-run)");
  process.exit(2);
}

const B = process.env.QAREEB_BASE || "http://127.0.0.1:8899";
const CHROME = process.env.QAREEB_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const KEY = "qrb.qareeb.record.v1";

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log("   ✓ " + m); } else { fails.push(m); console.log("   ✗ " + m); } };
const step = (n) => console.log("\n── " + n);

const SEED = () => {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem("qrb.qareeb.record.v1", JSON.stringify({
    patient: { id: "PAT-J", nameParts: { given: "زينب", father: "كاظم", grandfather: "عبدالله" },
      birthDate: "1986-11-02", sex: "female", identifiers: [], registeredAt: today },
    allergies: [], conditions: [], medications: [], procedures: [], vitals: [],
    results: [
      { id: "R1", code: "HbA1c", display: "الخضاب السكري", value: 7.1, unit: "%",
        refLow: 4, refHigh: 5.6, effectiveAt: "2025-08-03", performerId: "L1", acknowledgedBy: "DR1" },
      { id: "R2", code: "HbA1c", display: "الخضاب السكري", value: 8.4, unit: "%",
        refLow: 4, refHigh: 5.6, effectiveAt: "2026-07-01", performerId: "L1" },
    ],
    documents: [], immunizations: [],
    encounters: [{ id: "E1", startedAt: "2026-05-11", clinicianId: "DR-2",
      chiefComplaint: "متابعة", assessment: "مضبوط جزئياً", state: "signed" }],
    prescriptions: [], episodes: [], tasks: [], appointments: [],
    shares: [], accessLog: [], requests: [],
  }));
};

const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));

const go = async (hash) => {
  await pg.goto(B + "/index.html" + hash, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(420);
};
/* A hard reload: the app rebuilds `S` from storage, so anything still on
   screen afterwards genuinely persisted. */
const reload = async () => { await pg.reload({ waitUntil: "domcontentloaded" }); await pg.waitForTimeout(520); };
const text = () => pg.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));
const rec = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), KEY);

await go("#/");
await pg.evaluate(SEED);

/* ---------- 1-2 · open the app, open the record ---------- */
step("١-٢ · يفتح التطبيق ويفتح ملفه");
await go("#/");
ok((await text()).length > 80, "الرئيسية ترسم");
await go("#/record");
{
  const t = await text();
  ok(/ملفي الصحي|My health record/.test(t), "السجل يفتح باسمه");
  ok(/زينب/.test(t), "ويعرض هوية المريضة");
}

/* ---------- 3 · add a patient-reported allergy ---------- */
step("٣ · يضيف حساسية بنفسه");
await go("#/record/add/allergy");
await pg.fill("#ad-substance", "البنسلين");
await pg.fill("#ad-reaction", "طفح جلدي");
await pg.click('[data-crit="high"]');
await pg.click("button.btn");
await pg.waitForTimeout(600);
ok((await pg.evaluate(() => location.hash)) === "#/record/allergies", "ينتقل لقائمة الحساسية");
await reload();
{
  const t = await text();
  ok(/البنسلين/.test(t), "الحساسية باقية بعد إعادة التحميل");
  ok(/سجّلتها بنفسك/.test(t), "ومعلَّمة بأن المريضة هي من سجّلها");
  const r = await rec();
  ok(r.allergies[0].source === "patient-reported", "وموسومة بالمصدر في التخزين");
  ok(r.allergies[0].verificationStatus === "patient-reported", "وبحالة التحقق");
}

/* ---------- 4 · add a medication ---------- */
step("٤ · يضيف دواءً يتناوله");
await go("#/record/add/medication");
await pg.fill("#ad-display", "ميتفورمين");
await pg.fill("#ad-dose", "٥٠٠ ملغم");
await pg.click('[data-freq="BID"]');
await pg.click("button.btn");
await pg.waitForTimeout(600);
await reload();
{
  const t = await text();
  ok(/ميتفورمين/.test(t), "الدواء باق بعد إعادة التحميل");
  ok(/مرتين يومياً/.test(t), "والتكرار الذي اختاره ظاهر");
}

/* ---------- 5-6 · lab result and its trend ---------- */
step("٥-٦ · يقرأ نتيجة وسلسلتها");
await go("#/record/labs");
{
  const t = await text();
  ok(/8\.4/.test(t) && /7\.1/.test(t), "القراءتان معروضتان");
  ok(/2025-08-03/.test(t) && /2026-07-01/.test(t), "كل نقطة بتاريخها");
  ok(/ارتفع/.test(t), "والاتجاه بكلمة صريحة");
  ok(/الطبيعي من/.test(t), "والمدى المرجعي مذكور");
  ok(!/←/.test(t), "وبلا سهم — السهم ينعكس في RTL");
  /* the order on screen must match the order in time */
  const i1 = t.indexOf("2025-08-03"), i2 = t.indexOf("2026-07-01");
  ok(i1 >= 0 && i2 > i1, "الأقدم قبل الأحدث في ترتيب القراءة");
}

/* ---------- 7 · vitals ---------- */
step("٧ · يسجّل قياس ضغط");
await go("#/record/add/vital");
await pg.fill("#ad-effectiveAt", "2026-07-22");
await pg.fill("#ad-sys", "152");
await pg.fill("#ad-dia", "94");
await pg.click("button.btn");
await pg.waitForTimeout(600);
await reload();
{
  const t = await text();
  ok(/152/.test(t) && /94/.test(t), "القياس محفوظ ومعروض كقراءة واحدة");
  ok(/خارج المعتاد/.test(t), "ومعلَّم أنه خارج المعتاد");
  const r = await rec();
  ok(r.vitals.length === 2, "يُخزَّن كملاحظتين — انقباضي وانبساطي");
  ok(r.vitals[0].code === "8480-6", "بترميز LOINC");
}

/* ---------- 8 · the timeline ---------- */
step("٨ · يقرأ خطه الزمني");
await go("#/record/timeline");
{
  const t = await text();
  ok(/2026/.test(t) && /2025/.test(t), "مجمّع بالسنوات");
  ok(/تموز|أيار|آب/.test(t), "وبأسماء الشهور العراقية");
  ok(!/يمتلئ مع كل زيارة/.test(t), "ولا يعرض حالة الفراغ وعنده أحداث");
}

/* ---------- 9-10 · doctors ---------- */
step("٩-١٠ · يفتح طبيباً ويرى كيف يتواصل");
await go("#/doctors");
/* Assert on CONTENT, not on a class name. `.card` is the hospital row;
   doctors and pharmacies render through `rowEl` as `.rw`, and a test that
   guesses at markup fails for reasons that have nothing to do with the
   product. */
ok(/د\. /.test(await text()), "قائمة الأطباء فيها نتائج");
await go("#/doctor/d1");
{
  const t = await text();
  ok(/د\./.test(t), "ملف الطبيب يفتح");
  ok(/بيانات نموذجية|موثّق|مدرج/.test(t), "وحالة التحقق مذكورة");
  ok(!/<span/.test(t), "وبلا وسوم HTML ظاهرة كنص");
  ok(/جهّز رمز الزيارة/.test(t), "ويقول للمريض كيف يوصل ملفه لهذا الطبيب");
  ok((await pg.$$("a[href^='tel:']")).length > 0, "وفيه طريق اتصال");
}

/* ---------- 11-12 · pharmacies, including outside Baghdad ---------- */
step("١١-١٢ · الصيدليات — داخل التغطية وخارجها");
await go("#/pharmacies");
ok(/صيدلية/.test(await text()), "صيدليات بغداد معروضة");
await pg.evaluate(() => localStorage.setItem("qrb.exCity", JSON.stringify("basra")));
await go("#/pharmacies"); await reload();
{
  const t = await text();
  ok(/يغطي بغداد/.test(t), "خارج بغداد: حدود التغطية مذكورة صراحة");
  ok(/الرافدين|دجلة/.test(t), "ومع ذلك تُعرض صيدليات البصرة الموجودة فعلاً");
  ok(/غيّر المحافظة/.test(t), "وفيه مخرج لتغيير المحافظة");
}
await pg.evaluate(() => localStorage.setItem("qrb.exCity", JSON.stringify("muthanna")));
await go("#/doctors"); await reload();
{
  const t = await text();
  ok(/ما عدنا أطباء/.test(t), "محافظة بلا أطباء: يقول ذلك بدل عرض أطباء بغداد");
  ok(/مستكشف الأدوية/.test(t), "ويحوّل لما يعمل وطنياً");
  ok(!/د\. علي حسين/.test(t), "ولا يعرض طبيباً بغدادياً لمستخدم في السماوة");
}
await pg.evaluate(() => localStorage.setItem("qrb.exCity", JSON.stringify("baghdad")));
await go("#/"); await reload();

/* ---------- 13-15 · sharing: scope, code, revoke ---------- */
step("١٣-١٥ · المشاركة — نطاق، رمز، إلغاء");
await go("#/record/shares");
ok(await pg.$('a[href="#/record/share"]'), "شاشة المشاركات تعرض فعلاً كيف تبدأ مشاركة");
await go("#/record/share");
await pg.evaluate(() => { const l = document.querySelector('.sh-scope[value="labs"]'); if (l && l.checked) l.click(); });
await pg.click('[data-dur="WEEK"]');
await pg.click("button.btn");
await pg.waitForTimeout(700);
{
  ok((await pg.evaluate(() => location.hash)) === "#/record/carry", "يصل لشاشة الرمز");
  const r = await rec();
  ok(r.carry && r.carry.duration === "WEEK", "المدة التي اختارها محفوظة");
  ok(r.carry.scopes.includes("allergies"), "والحساسية مضمّنة رغم أنه لم يخترها — أرضية السلامة");
  ok(!r.carry.scopes.includes("labs"), "وما ألغى اختياره لم يُضَف");
  await reload();
  ok(/[A-Z0-9]{6}/.test((await text()).replace(/\s/g, "")), "والرمز باق بعد إعادة التحميل");
}
/* an active share, then revoked */
await pg.evaluate(() => {
  const r = JSON.parse(localStorage.getItem("qrb.qareeb.record.v1"));
  r.shares = [{ id: "SH-J", patientId: "PAT-J", granteeId: "DR-9", granteeName: "د. سهى",
    scopes: ["allergies", "medications", "conditions", "summary"], duration: "VISIT",
    grantedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 36e5).toISOString(),
    modality: "in-person", language: "ar", state: "active", revokedAt: null }];
  localStorage.setItem("qrb.qareeb.record.v1", JSON.stringify(r));
});
await go("#/record/shares");
ok(/د\. سهى/.test(await text()), "المشاركة الفعّالة معروضة باسم من شاركها");
await pg.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /إلغاء|Revoke/.test(x.innerText))?.click(); });
await pg.waitForTimeout(600);
await reload();
{
  const r = await rec();
  ok(r.shares[0].state === "revoked", "الإلغاء مكتوب في التخزين");
  ok(/ألغيتها|انتهت/.test(await text()), "ويظهر في السجل بدل أن يختفي");
}

/* ---------- 16 · the clinician view ---------- */
step("١٦ · شاشة الطبيب");
await pg.evaluate(() => {
  localStorage.setItem("qrb.qareeb.clinician.v1", JSON.stringify(
    { id: "DR-9", name: "د. سهى", role: "doctor", licenseStatus: "SELF_ASSERTED" }));
  const r = JSON.parse(localStorage.getItem("qrb.qareeb.record.v1"));
  r.shares = [{ id: "SH-K", patientId: "PAT-J", granteeId: "DR-9", granteeName: "د. سهى",
    scopes: ["allergies", "medications", "conditions", "labs", "summary"], duration: "VISIT",
    grantedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 36e5).toISOString(),
    modality: "in-person", language: "ar", state: "active", revokedAt: null }];
  localStorage.setItem("qrb.qareeb.record.v1", JSON.stringify(r));
});
await go("#/clinical/PAT-J");
{
  const t = await text();
  const iAllergy = t.indexOf("البنسلين");
  ok(iAllergy >= 0 && iAllergy < 260, "الحساسية أول ما يراه الطبيب");
  ok(/ميتفورمين/.test(t), "والأدوية الحالية");
  ok(/قالها المريض/.test(t), "وما قالته المريضة معلَّم بأنه غير مؤكّد");
  ok(/152/.test(t), "والقياس الأخير");
  ok(/وصولك ينتهي/.test(t), "ومتى ينتهي وصوله");
}

/* ---------- 17-18 · deep links and refresh ---------- */
step("١٧-١٨ · روابط عميقة وإعادة تحميل");
{
  let bad = 0;
  for (const r of ["#/record/labs", "#/record/timeline", "#/record/vitals", "#/record/shares",
                   "#/doctor/d1", "#/pharmacy/b1", "#/record/add/vital"]) {
    const p2 = await ctx.newPage();
    await p2.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(520);
    const v = await p2.evaluate(() => ({
      len: (document.body.innerText || "").trim().length,
      back: !!document.querySelector(".hdr-back, button.b-g"),
    }));
    if (v.len < 60 || !v.back) { bad++; console.log(`      ${r}: len=${v.len} back=${v.back}`); }
    await p2.close();
  }
  ok(bad === 0, "كل رابط عميق يفتح باردًا ومعه طريق رجوع");
}

/* ---------- 19 · offline ---------- */
step("١٩ · بلا اتصال");
await ctx.setOffline(true);
await go("#/record");
{
  const t = await text();
  ok(t.length > 80, "السجل يفتح والراديو مطفأ");
  ok(/دون اتصال|Offline/.test(t), "والحالة معلنة على الشاشة");
}
await go("#/record/add/allergy");
await pg.fill("#ad-substance", "السلفا");
await pg.click("button.btn");
await pg.waitForTimeout(600);
{
  const r = await rec();
  ok(r.allergies.some((a) => a.substance === "السلفا"), "والكتابة في السجل تنجح بلا شبكة");
}
await ctx.setOffline(false);

/* ---------- 20 · empty states ---------- */
step("٢٠ · الحالات الفارغة تعطي مخرجاً");
await pg.evaluate(() => {
  const r = JSON.parse(localStorage.getItem("qrb.qareeb.record.v1"));
  for (const f of ["conditions", "medications", "allergies", "procedures", "results",
                   "documents", "immunizations", "vitals", "accessLog"]) r[f] = [];
  localStorage.setItem("qrb.qareeb.record.v1", JSON.stringify(r));
});
{
  let bad = 0;
  for (const r of ["#/record/conditions", "#/record/medications", "#/record/allergies",
                   "#/record/labs", "#/record/documents", "#/record/vitals", "#/record/access"]) {
    await go(r);
    const n = await pg.evaluate(() => document.querySelectorAll(".btn, .b-g, .note a, .empty a").length);
    if (!n) { bad++; console.log(`      ${r} — لا مخرج`); }
  }
  ok(bad === 0, "كل شاشة فارغة تعرض فعلاً ممكناً");
}

ok(errs.length === 0, `بلا أخطاء في وحدة التحكم (${errs.length})`);
if (errs.length) errs.slice(0, 4).forEach((e) => console.log("      " + e));

await b.close();
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log(`${pass} نجحت · ${fails.length} فشلت\n`);
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`${pass} نجحت · صفر فشل`);
