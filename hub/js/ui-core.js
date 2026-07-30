/* ============================================================
   QAREEB — قريب  ·  Application
   Hash router · time engine · screens · sheets. No backend.
   ============================================================ */

/* ---------------- STATE ---------------- */
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("qrb." + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("qrb." + k, JSON.stringify(v)); } catch {} },
};

const S = {
  lang: LS.get("lang", "ar"),
  theme: LS.get("theme", null),   // null = follow the OS / host theme
  district: LS.get("district", CONFIG.defaultDistrict),
  gps: LS.get("gps", false),
  gpsReason: null,
  phNight: false, phSvc: null,          // precise location granted
  locState: LS.get("locState", "inferred"), // precise | chosen | inferred | denied
  name: LS.get("name", ""),
  saved: LS.get("saved", []),
  requests: LS.get("requests", []),
  qrSource: null,
  recent: LS.get("recent", []),
  exCity: LS.get("exCity", "baghdad"),  // Explorer is national; this only orders results
  /* Who is holding the phone. Changes the STRUCTURE of home, not its labels:
     a patient opens onto care near them, a pharmacist onto the demand they
     could answer, a doctor onto the demand that never reached them. No auth
     in the prototype — the role is a lens, clearly labelled, and any claim
     that needs identity (signalling stock) says so where it happens. */
  role: LS.get("role", "patient"),           // patient | pharmacist | doctor
  myBranch: LS.get("myBranch", null),        // pharmacist's chosen branch
  myDoc: LS.get("myDoc", null),              // doctor's chosen profile
  draft: null,                          // an unpublished medicine request
  supplyDraft: null,                    // a pharmacy's in-progress availability claim
  filters: { openNow: false, when: null, gender: null, spec: null, district: null, fee: null, facType: null },
  radius: CONFIG.radiusKm,
  demoTime: null,                      // lets the demo scrub "now"
};
const isAR = () => S.lang === "ar";
const L = (o) => (o ? (isAR() ? o.ar : (o.en || o.ar)) : "");

/* ---------------- i18n ---------------- */
const T = {
  ar: {
    home: "الرئيسية", doctors: "الأطباء", pharmacies: "الصيدليات", care: "العناية",
    need_a: "أحتاج", near: "قرب", now: "الآن", adoctor: "طبيب",
    show: "اعرض النتائج", searchPh: "طبيب، اختصاص، صيدلية، أو منتج…",
    openNow: "مفتوح الآن", closingSoon: "يغلق قريباً", closed: "مغلق",
    opensAt: "يفتح", until: "حتى", nightDuty: "خفارة ليلية", verified: "موثّق",
    listed: "معلومات عامة", updated: "حُدّثت المعلومات قبل", days: "يوم", today: "اليوم",
    tomorrow: "غداً", free: "بدون أجرة", fee: "أجرة الكشف", km: "كم",
    request: "اطلب موعد", message: "مراسلة", call: "اتصال", directions: "الطريق",
    share: "مشاركة", sendWa: "إرسال عبر واتساب", continue: "متابعة",
    yourName: "الاسم", note: "ملاحظة (اختياري)", chooseTime: "اختر الموعد",
    pickArea: "اختر منطقتك", useGps: "حدّد موقعي تلقائياً", withoutLoc: "تابع بدون تحديد",
    myArea: "منطقتي", results: "نتيجة", noResults: "لا توجد نتائج",
    doctorsIn: "طبيب في", allSpecs: "كل الاختصاصات", sessions: "أوقات الدوام",
    week: "أسبوع الطبيب", about: "معلومات", reportInfo: "الإبلاغ عن معلومة خاطئة",
    myRequests: "طلباتي", savedItems: "المحفوظات", trust: "الثقة والتوثيق",
    explorer: "الأدوية", record: "ملفي",
    emergency: "طوارئ", ambulance: "الإسعاف", nearestEr: "أقرب طوارئ",
    orderWa: "اطلب عبر واتساب", availableAt: "متوفر في", stockedBy: "يُصرف من",
    male: "طبيب", female: "طبيبة", anyGender: "الكل",
    hospital: "مستشفى", clinic: "عيادة خاصة", pharmacy: "صيدلية",
    sent: "تم الإرسال", refCode: "رمز الطلب", back: "رجوع", cancel: "إلغاء",
    edit: "تعديل الرسالة", notAccepting: "لا يستقبل حجوزات حالياً",
    noWa: "لا يوجد واتساب — اتصل هاتفياً", loading: "جارٍ التحميل",
  },
  en: {
    home: "Home", doctors: "Doctors", pharmacies: "Pharmacies", care: "Care",
    need_a: "I need", near: "near", now: "right now", adoctor: "a doctor",
    show: "Show results", searchPh: "Doctor, specialty, pharmacy, or product…",
    openNow: "Open now", closingSoon: "Closing soon", closed: "Closed",
    opensAt: "Opens", until: "until", nightDuty: "Night duty", verified: "Verified",
    listed: "Listed", updated: "Info updated", days: "d ago", today: "Today",
    tomorrow: "Tomorrow", free: "No fee", fee: "Consultation", km: "km",
    request: "Request appointment", message: "Message", call: "Call", directions: "Directions",
    share: "Share", sendWa: "Send on WhatsApp", continue: "Continue",
    yourName: "Your name", note: "Note (optional)", chooseTime: "Choose a time",
    pickArea: "Choose your area", useGps: "Use my location", withoutLoc: "Continue without",
    myArea: "My area", results: "results", noResults: "No results",
    doctorsIn: "doctors in", allSpecs: "All specialties", sessions: "Sessions",
    week: "The doctor's week", about: "About", reportInfo: "Report incorrect info",
    myRequests: "My requests", savedItems: "Saved", trust: "Trust & verification",
    explorer: "Medicines", record: "My record",
    emergency: "Emergency", ambulance: "Ambulance", nearestEr: "Nearest ER",
    orderWa: "Order via WhatsApp", availableAt: "Available at", stockedBy: "Dispensed by",
    male: "Male", female: "Female", anyGender: "Any",
    hospital: "Hospital", clinic: "Private clinic", pharmacy: "Pharmacy",
    sent: "Sent", refCode: "Reference", back: "Back", cancel: "Cancel",
    edit: "Edit message", notAccepting: "Not accepting requests right now",
    noWa: "No WhatsApp — call instead", loading: "Loading",
  },
};
const t = (k) => T[S.lang][k] ?? k;

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];        // Iraqi week starts Saturday
const dayName = (d) => (isAR() ? DAYS_AR[d] : DAYS_EN[d]);

/* ---------------- ICONS ---------------- */
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  caret: '<path d="M6 9.5l6 6 6-6"/>',
  back: '<path d="M15 19l-7-7 7-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
  wa: '<path d="M3.5 20.5l1.4-4.6A8.4 8.4 0 1 1 8.4 19l-4.9 1.5z"/><path d="M9 9.2c.3 2.6 3.2 5.5 5.8 5.8.7.1 1.3-.6 1.3-1.3l-1.8-.8-1 1a7 7 0 0 1-3.2-3.2l1-1-.8-1.8c-.7 0-1.4.6-1.3 1.3z" fill="currentColor" stroke="none"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>',
  nav: '<path d="M12 3l8 18-8-4-8 4 8-18z"/>',
  seal: '<path d="M12 2.6l2.4 1.8 3-.3 1 2.8 2.5 1.6-1 2.8 1 2.8-2.5 1.6-1 2.8-3-.3L12 21.4l-2.4-1.8-3 .3-1-2.8L3.1 15.5l1-2.8-1-2.8 2.5-1.6 1-2.8 3 .3z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
  alert: '<path d="M12 3.5L21 19H3l9-15.5z"/><path d="M12 10v4M12 16.6v.1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8.2v.1"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  stetho: '<path d="M6 3v5a4.5 4.5 0 0 0 9 0V3"/><path d="M4.2 3h2M13.8 3h2M10.5 12.4v2.1a4.5 4.5 0 0 0 9 0v-1.6"/><circle cx="19.2" cy="11" r="2"/>',
  cross: '<path d="M4 10.5h16v1.2A8 8 0 0 1 12 19.7a8 8 0 0 1-8-7.9z"/><path d="M14.5 8.5l5-5M18 2.2l3.4 3.4"/><path d="M8.5 21.5h7"/>',
  crossflat: '<path d="M9.6 3.5h4.8v6.1h6.1v4.8h-6.1v6.1H9.6v-6.1H3.5V9.6h6.1z"/>',
  leaf: '<path d="M20 4c0 9-5 13-11 13H5c0-8 5-12 11-12 1.6 0 3 .3 4 .6z"/><path d="M4 21c2-6 5.5-9.5 10-11.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5"/><path d="M14 14h3v3h-3zM20.5 14v6.5H17"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c4 4.5 4 12.5 0 17-4-4.5-4-12.5 0-17z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  flag: '<path d="M5 21V4M5 5h11l-1.6 3.5L16 12H5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.5V9h-5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
  building: '<path d="M4 21V6l7-3v18M11 21h9V10l-9-3"/><path d="M14.5 12.5v.1M14.5 16v.1M17.5 12.5v.1M17.5 16v.1"/>',
  truck: '<rect x="2.5" y="7" width="11" height="9" rx="1.5"/><path d="M13.5 10.5H18l3 3V16h-7.5"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  syringe: '<path d="M18.5 3.5l2 2M17 5l2 2M8 14l-3.5 3.5L3 21l3.5-1.5L10 16"/><path d="M9 9l6 6M11.5 6.5l6 6"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-4.5"/>',
  baby: '<circle cx="12" cy="9" r="4.5"/><path d="M10.3 8.6v.1M13.7 8.6v.1M10.5 11c1 .8 2 .8 3 0"/><path d="M5.5 20.5c1.4-2.6 3.8-4 6.5-4s5.1 1.4 6.5 4"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)"/><path d="M9 9l6 6"/>',
  hand: '<path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11M12 11V4.5a1.5 1.5 0 0 1 3 0V11M15 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 7 7 0 0 1-7-7v-2.5a1.5 1.5 0 0 1 3 0V13"/>',
  wave: '<path d="M3 8c2.5-3 5-3 7.5 0S16 11 18.5 8M3 13c2.5-3 5-3 7.5 0s5 3 7.5 0M3 18c2.5-3 5-3 7.5 0s5 3 7.5 0"/>',
  tooth: '<path d="M7.5 3.5C5.5 3.5 4 5.2 4 7.6c0 3.2 1.2 4.4 1.8 8 .4 2.3.7 4.4 1.8 4.4s1.3-1.8 1.6-3.6c.3-1.6.5-2.6.8-2.6s.5 1 .8 2.6c.3 1.8.5 3.6 1.6 3.6s1.4-2.1 1.8-4.4c.6-3.6 1.8-4.8 1.8-8 0-2.4-1.5-4.1-3.5-4.1-1.2 0-1.9.6-2.5.6s-1.3-.6-2.5-.6z"/>',
  thermo: '<path d="M14 14.2V5a2 2 0 1 0-4 0v9.2a4.5 4.5 0 1 0 4 0z"/><path d="M12 8.5v7"/>',
  drop: '<path d="M12 3.2s6 6.4 6 10.3a6 6 0 0 1-12 0c0-3.9 6-10.3 6-10.3z"/>',
  heartbeat: '<path d="M20.5 9.2c0 5-8.5 10.3-8.5 10.3S3.5 14.2 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2z"/><path d="M3.9 11.6h3.4l1.4-2.4 2 4.4 1.5-2.6h3.9"/>',
  heart: '<path d="M20.5 9.2c0 5-8.5 10.3-8.5 10.3S3.5 14.2 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2z"/>',
  bone: '<path d="M7.6 16.4l8.8-8.8"/><path d="M8.5 15.5a2.5 2.5 0 1 0-3 3 2.5 2.5 0 1 0 3 3 2.5 2.5 0 0 0 .6-3.6z" transform="translate(-1.2 -1.2)"/><circle cx="6.2" cy="17.8" r="2.3"/><circle cx="4.4" cy="19.6" r="2.3"/><circle cx="17.8" cy="6.2" r="2.3"/><circle cx="19.6" cy="4.4" r="2.3"/>',
  stomach: '<path d="M9 3.5v4.8c0 2-3.5 2.2-3.5 6.2A6 6 0 0 0 11.6 20.5c4 0 6.4-2.6 6.4-5.8 0-3-2-4.2-3.6-4.2-1.4 0-2.2.9-2.2 1.9"/><path d="M6.8 3.5h4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 4-3.5 5.5S12.5 19 11 20a3 3 0 0 1-4.5-2.5"/><path d="M10.2 9a1.9 1.9 0 0 1 3.8 0c0 1.6-1.8 2-2.4 3.4"/>',
  brain: '<path d="M9.5 4.5A3 3 0 0 0 6.6 8 3 3 0 0 0 5 10.7a3 3 0 0 0 1.4 2.5A3 3 0 0 0 9.4 19c1 0 2-.5 2.6-1.3V4.5a2.4 2.4 0 0 0-2.5 0z"/><path d="M14.5 4.5A3 3 0 0 1 17.4 8a3 3 0 0 1 1.6 2.7 3 3 0 0 1-1.4 2.5A3 3 0 0 1 14.6 19c-1 0-2-.5-2.6-1.3"/>',
  sugar: '<circle cx="12" cy="12" r="8.5"/><path d="M8 13.5c1.2-1.5 2.5-1.5 4 0s2.8 1.5 4 0M9 9.5v.1M15 9.5v.1"/>',
};
const DIRECTIONAL = new Set(["chev", "back"]);
const icon = (n, cls = "") =>
  `<svg class="${cls || "ico"}${DIRECTIONAL.has(n) ? " dirflip" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M4 4h18l6 6v18H4z" fill="var(--petrol)"/>
  <path d="M16 22.5c-4.2-3-6.6-5.2-6.6-8a3.4 3.4 0 0 1 6.6-1.2 3.4 3.4 0 0 1 6.6 1.2c0 2.8-2.4 5-6.6 8z" fill="var(--amber-b)"/>
</svg>`;

/* ---------------- TIME ENGINE ---------------- */
const mins = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const nowDate = () => (S.demoTime ? new Date(S.demoTime) : new Date());
const nowMins = () => { const d = nowDate(); return d.getHours() * 60 + d.getMinutes(); };
const nowDay = () => nowDate().getDay();
const pct = (m) => (m / 1440) * 100;
// 24-hour everywhere: it aligns in a column, and it contains no letters, so an
// Arabic RTL line can never reorder it. 12h + ص/ظ/م inside an LTR run gets mangled.
const fmtT = (m) => {
  const h = Math.floor((m % 1440) / 60), mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
/* PLAIN TEXT — WhatsApp messages, stored records. This used to be
   `${fmtT(a)} – ${fmtT(b)}`, which is the trend-arrow bug in plain text: the
   en dash is a NEUTRAL between two number runs, so an Arabic WhatsApp bubble
   resolves it right-to-left and "08:00 – 14:00" reaches the clinic reading
   "14:00 – 08:00". There is no CSS in a message body to isolate it with, so
   the range is stated in words — the same answer the lab reference range
   already uses ("من ٤ إلى ٥.٦"), for the same reason. No neutral is left.

   (`fmtT`'s own colon is safe and is left alone: `:` is Bidi_Class=CS, which
   between two European numbers binds to them and cannot separate them. The
   danger is only the separators that are Bidi_Class=ON.) */
const fmtRangeTxt = (a, b) => isAR() ? `من ${fmtT(a)} إلى ${fmtT(b)}` : `${fmtT(a)} to ${fmtT(b)}`;
/* MARKUP — one LTR run, so the dash is inside the run and has nothing to
   reorder against. Built here rather than from fmtRangeTxt, which now carries
   Arabic words that must not be forced LTR. */
const fmtRange = (a, b) => `<span dir="ltr" class="num">${fmtT(a)} – ${fmtT(b)}</span>`;
const fmtTi = (m) => `<span dir="ltr" class="num">${fmtT(m)}</span>`;

/* raw segments on a weekday; t may exceed 1440 when it wraps past midnight */
function rawSegs(ent, day) {
  const out = [];
  if (ent.sessions) {
    ent.sessions.filter((s) => s.d === day).forEach((s) => {
      const f = FACILITIES.find((x) => x.id === s.fac);
      out.push({ f: mins(s.f), t: mins(s.t), kind: f && f.type === "hospital" ? "pub" : "priv", s, fac: f });
    });
  } else if (ent.always) {
    out.push({ f: 0, t: 1440, kind: "priv" });
  } else if (ent.hours) {
    ent.hours.forEach((h) => {
      if (h.d !== "all" && h.d !== "wk" && h.d !== day) return;
      if (h.d === "wk" && (day === 5)) return;         // Friday closed for weekday-only facilities
      let a = mins(h.f), b = h.t === "24:00" ? 1440 : mins(h.t);
      if (b <= a) b += 1440;
      out.push({ f: a, t: b, kind: "priv" });
    });
  }
  return out.sort((x, y) => x.f - y.f);
}

function openSeg(ent) {
  const d = nowDay(), n = nowMins();
  for (const s of rawSegs(ent, d)) if (n >= s.f && n < s.t) return s;
  for (const s of rawSegs(ent, (d + 6) % 7)) if (n + 1440 >= s.f && n + 1440 < s.t) return { ...s, f: s.f - 1440, t: s.t - 1440 };
  return null;
}

function nextSeg(ent) {
  const d0 = nowDay(), n = nowMins();
  for (let i = 0; i < 8; i++) {
    const d = (d0 + i) % 7;
    for (const s of rawSegs(ent, d)) {
      const abs = i * 1440 + s.f;
      if (abs > n) return { ...s, day: d, inDays: i, abs };
    }
  }
  return null;
}

function status(ent) {
  const o = openSeg(ent);
  if (o) return { k: o.t - nowMins() <= 45 ? "soon" : "open", seg: o };
  const nx = nextSeg(ent);
  return { k: "shut", next: nx };
}

function statusLabel(st, terse = false) {
  if (st.k === "open") return `<span class="state-line state-open"><i class="bulb"></i>${t("openNow")}${terse ? "" : ` · ${t("until")} ${fmtTi(st.seg.t)}`}</span>`;
  if (st.k === "soon") return `<span class="state-line state-soon"><i class="bulb"></i>${t("closingSoon")} ${fmtTi(st.seg.t)}</span>`;
  if (!st.next) return `<span class="state-line state-shut"><i class="bulb"></i>${t("closed")}</span>`;
  const when = st.next.inDays === 0 ? t("today") : st.next.inDays === 1 ? t("tomorrow") : dayName(st.next.day);
  return `<span class="state-line state-shut"><i class="bulb"></i>${t("opensAt")} ${when} ${fmtTi(st.next.f)}</span>`;
}

/* ---------------- THE WEEK STRIP (signature) ----------------
   Seven cells, Saturday-first like the Iraqi week. State is carried by fill
   AND shape — filled = working, hollow = not, today is ringed, the next open
   day is dotted. Never colour alone.
------------------------------------------------------------- */
const DAY_LETTER = { 6: "س", 0: "ح", 1: "ن", 2: "ث", 3: "ر", 4: "خ", 5: "ج" };
function weekStrip(ent) {
  const today = nowDay();
  const nx = status(ent).next;
  const cells = DAY_ORDER.map((d) => {
    const works = rawSegs(ent, d).length > 0;
    const isToday = d === today;
    const isNext = nx && nx.day === d && !isToday;
    return `<span class="wk7-d${works ? " on" : " off"}${isToday ? " today" : ""}${isNext ? " next" : ""}"
      title="${dayName(d)}">${DAY_LETTER[d]}</span>`;
  }).join("");
  return `<div class="wk7" role="img" aria-label="${isAR() ? "أيام الدوام خلال الأسبوع" : "Days open this week"}">${cells}</div>`;
}

/* ---------------- RIBBON ---------------- */
function ribbon(ent, day = null, cls = "ribbon--micro", showNow = true) {
  const d = day === null ? nowDay() : day;
  const segs = rawSegs(ent, d);
  const prev = rawSegs(ent, (d + 6) % 7).filter((s) => s.t > 1440).map((s) => ({ ...s, f: 0, t: s.t - 1440 }));
  const all = [...prev, ...segs];
  const st = status(ent);
  const bars = all.map((s) => {
    const a = Math.max(0, s.f), b = Math.min(1440, s.t);
    if (b <= a) return "";
    const live = showNow && day === null && st.k !== "shut" && st.seg && s.f === st.seg.f;
    return `<i class="${s.kind}${live ? " live" : ""}" style="--a:${pct(a).toFixed(2)}%;--w:${pct(b - a).toFixed(2)}%"></i>`;
  }).join("");
  const marker = showNow && (day === null || day === nowDay()) ? `<b style="--now:${pct(nowMins()).toFixed(2)}%"></b>` : "";
  return `<div class="ribbon ${cls}" role="img" aria-label="${t("sessions")}">${bars}${marker}</div>`;
}

function ribbonScale() {
  return `<div class="ribbon-scale">${[6, 12, 18].map((h) =>
    `<span style="--a:${pct(h * 60)}%">${String(h).padStart(2, "0")}:00</span>`).join("")}</div>`;
}

/* ---------------- GEO ---------------- */
const R = 6371;
function haversine(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const here = () => DISTRICTS.find((d) => d.id === S.district) || DISTRICTS[0];
const fac = (id) => FACILITIES.find((f) => f.id === id);
function distTo(f) { return haversine(here(), f); }
// Approximation is stated once, in the results header — not repeated on every card.
// Repeating "~" on 30 cards is noise, and a stray tilde is a bidi hazard in RTL.
function fmtKm(k) {
  const n = k < 1 ? Math.round(k * 1000) : k.toFixed(1);
  const u = k < 1 ? (isAR() ? "م" : "m") : t("km");
  return `<span class="num">${n}</span> ${u}`;
}
const approxNote = () => S.locState === "precise" ? "" :
  (isAR() ? `المسافات تقريبية من مركز ${L(here())}` : `Distances approximate from ${L(here())} centre`);
function docDist(doc) {
  const ds = doc.sessions.map((s) => distTo(fac(s.fac))).filter((n) => !isNaN(n));
  return ds.length ? Math.min(...ds) : 99;
}
function docFacs(doc) { return [...new Set(doc.sessions.map((s) => s.fac))].map(fac); }

/* ---------------- SELECTORS ---------------- */
function doctorsFor({ spec = null, q = null, radius = S.radius } = {}) {
  let list = DOCTORS.slice();
  if (spec) list = list.filter((d) => d.spec === spec);
  if (q) { const nq = norm(q); list = list.filter((d) => norm(d.ar + " " + d.en + " " + (d.sub_ar || "")).includes(nq) || specMatch(d.spec, nq)); }
  const f = S.filters;
  if (f.gender) list = list.filter((d) => d.gender === f.gender);
  if (f.openNow) list = list.filter((d) => status(d).k !== "shut");
  if (f.when === "today")    list = list.filter((d) => rawSegs(d, nowDay()).some((sg) => sg.t > nowMins()));
  if (f.when === "tomorrow") list = list.filter((d) => rawSegs(d, (nowDay() + 1) % 7).length > 0);
  if (f.when === "week")     list = list.filter((d) => { const n = nextSeg(d); return n && n.inDays <= 6; });
  if (f.fee === "free")  list = list.filter((d) => d.sessions.some((sg) => sg.fee === 0));
  if (f.fee === "u25")   list = list.filter((d) => d.sessions.some((sg) => sg.fee !== null && sg.fee > 0 && sg.fee <= 25000));
  if (f.facType) list = list.filter((d) => docFacs(d).some((x) => x && (f.facType === "hospital" ? x.type === "hospital" : x.type !== "hospital")));
  if (f.district) list = list.filter((d) => docFacs(d).some((x) => x && x.district === f.district));
  list = list.map((d) => ({ d, km: docDist(d), st: status(d) }));
  const within = list.filter((x) => x.km <= radius);
  const thin = within.length < 3;                 // widen when results are thin, not only when empty
  const used = thin ? list : within;
  const usedRadius = thin ? null : radius;
  // Sort by WHEN, not by how far. A doctor open now outranks a nearer one who
  // opens on Thursday; distance only breaks ties between equal availability.
  const waitOf = (x) => x.st.k !== "shut" ? -1 : (x.st.next ? x.st.next.abs - nowMins() : 1e9);
  used.sort((a, b) => waitOf(a) - waitOf(b) || a.km - b.km);
  return { list: used, expanded: usedRadius === null, total: list.length };
}

function pharmaciesNear({ openOnly = false, radius = 25 } = {}) {
  let list = FACILITIES.filter((f) => f.type === "pharmacy").map((f) => ({ f, km: distTo(f), st: status(f) }));
  if (openOnly) list = list.filter((x) => x.st.k !== "shut");
  list = list.filter((x) => x.km <= radius);
  list.sort((a, b) => {
    const rank = (x) => (x.st.k === "open" ? 0 : x.st.k === "soon" ? 1 : 2);
    return rank(a) - rank(b) || a.km - b.km;
  });
  return list;
}

const norm = (s) => (s || "").toString().toLowerCase()
  .replace(/[ً-ٰٟ]/g, "").replace(/[أإآٱ]/g, "ا")
  .replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "").trim();

function specMatch(id, nq) {
  const sp = SPECIALTIES.find((s) => s.id === id);
  if (!sp) return false;
  return [sp.ar, sp.en, ...sp.alias].some((a) => norm(a).includes(nq) || nq.includes(norm(a)));
}
function findSpecByQuery(q) {
  const nq = norm(q); if (!nq) return null;
  return SPECIALTIES.find((s) => [s.ar, s.en, ...s.alias].some((a) => norm(a).includes(nq) || nq.includes(norm(a)))) || null;
}
const specOf = (id) => SPECIALTIES.find((s) => s.id === id);
const needCount = (n) => DOCTORS.filter((d) => d.spec === n.spec && status(d).k !== "shut").length;
const docsOpenNow = () => DOCTORS.filter((d) => status(d).k !== "shut").length;
const phOpenNow = () => FACILITIES.filter((f) => f.type === "pharmacy" && status(f).k !== "shut").length;
/* Night-duty pharmacies that are OPEN, not merely labelled night-duty.
   `phNight` used to count the label alone, and the home screen presented the
   result as "منها N" — "N OF THEM" — over the open count. Two sets that were
   never intersected, stated as a subset. Measured at 12:53 on the seed data:
   home claimed 5 night-duty out of 11 open while 3 of those 5 were shut.
   The rule this breaks is the product's own: say what is true of the network,
   not what sounds active. */
const phNight = () => FACILITIES.filter((f) => f.type === "pharmacy" && f.night && status(f).k !== "shut").length;
/* The label count, for the places that genuinely mean "has a night licence"
   rather than "is open now" — kept separate so the two can never be confused
   again by whoever reads this next. */
const phNightListed = () => FACILITIES.filter((f) => f.type === "pharmacy" && f.night).length;

/* ---------------- HELPERS ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// An unknown fee is omitted by the caller. This never invents certainty.
const money = (n) => (n === null || n === undefined) ? "" : n === 0 ? t("free") : `${n.toLocaleString("en-US")} ${L(CONFIG.currency)}`;
const initials = (name) => {
  const clean = name.replace(/^د\.\s*/, "").replace(/^Dr\.\s*/, "").trim();
  // Arabic letters join into pseudo-words, so one letter reads better than two
  return isAR() ? clean[0] : clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
};
const refCode = () => { const C = "ABCDEFGHJKLMNPQRTUVWXY3479"; return Array.from({ length: 4 }, () => C[Math.floor(Math.random() * C.length)]).join(""); };
const waLink = (num, msg) => `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
const mapLink = (f) => `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;

/* THE VERIFICATION STATE OF ONE RECORD — four states, and none of them is
   absence.

   Two things were wrong and they compounded. First, every card rendered a
   jade `ختم` seal whenever `verified === true` and rendered NOTHING when it
   was false — so "we have not checked this doctor" was communicated by the
   quiet absence of a 34px box, which is to say not communicated at all.

   Second, and worse: `DATA_PROVENANCE.sources.doctors.origin` is "synthetic"
   (js/data.js:22), and 17 of 18 seeded doctors carry `verified: true`. The
   product was stamping a trust mark on records it declares fabricated. The
   file that defines provenance says it plainly — "a provenance claim that
   cannot be contradicted by the data is decoration" — and nothing was reading
   it outside the admin screen and preflight.

   So the seal is now DERIVED from provenance first and the record second. It
   cannot be turned on by hand: while a source is synthetic, every record from
   it says so, and `tools/preflight.mjs` refuses a release whose provenance
   and records disagree. */
function verificationState(ent, sourceKey) {
  if (!ent) return { k: "listed" };
  const origin = ((DATA_PROVENANCE.sources[sourceKey] || {}).origin) || "synthetic";
  if (origin !== "imported") return { k: "sample" };
  if (!ent.verified) return { k: "listed" };
  if (ent.updated > 90) return { k: "stale", days: ent.updated };
  return { k: "verified", days: ent.updated };
}

const SEAL_TEXT = {
  verified: ["موثّق", "Verified"],
  stale: ["توثيق قديم", "Verification is old"],
  listed: ["مدرج — ما تحققنا", "Listed — not verified"],
  sample: ["بيانات نموذجية", "Sample data"],
};

/* `sourceKey` defaults by entity shape: a doctor has sessions, a facility has
   a type. Callers may pass it explicitly. */
/* A COUNT of verified pharmacies is a verification claim too, and one that
   is harder to see: "visible to 14 verified pharmacies" reads as a fact about
   the network, and while every one of those records is synthetic it is a
   fabricated reach figure. `sealBadge` already protects the per-entity claim;
   this protects the aggregate one. Returns the word to use for "verified"
   given what the source actually is. */
function verifiedWord(sourceKey, plural) {
  const origin = ((DATA_PROVENANCE.sources[sourceKey] || {}).origin) || "synthetic";
  if (origin === "imported") return isAR() ? (plural ? "موثّقة" : "موثّق") : "verified";
  return isAR() ? (plural ? "في البيانات النموذجية" : "نموذجي") : "in the sample data";
}

/* The count that must travel with `verifiedWord()`. `list.filter(e =>
   e.verified).length` counts the raw flag, which is `true` on 17 of 18
   synthetic doctors and on most synthetic pharmacies — so a headline number
   next to the honest word "sample data" would still be counting as if every
   one of them were real. `verificationState` already asks the provenance
   first; this is that same check, aggregated. While every source in this
   build is synthetic, every one of these returns 0 — which is correct: there
   is nothing to count yet. */
function verifiedCount(list, sourceKey) {
  return (list || []).filter((e) => verificationState(e, sourceKey).k === "verified").length;
}

function sealBadge(ent, sourceKey) {
  const key = sourceKey || (ent && ent.sessions ? "doctors" : "pharmacies");
  const v = verificationState(ent, key);
  const txt = esc(SEAL_TEXT[v.k][isAR() ? 0 : 1]);
  if (v.k === "verified") return `<span class="seal">${icon("seal")}${txt}</span>`;
  if (v.k === "stale") return `<span class="st st-t">${icon("clock")}${txt}</span>`;
  return `<span class="unverified">${icon("info")}${txt}</span>`;
}
function updatedLine(ent) {
  const stale = ent.updated > 90;
  return `<span class="updated${stale ? " stale" : ""}">${icon("refresh")}${t("updated")} <span class="num">${ent.updated}</span> ${t("days")}</span>`;
}

/* ---------------- CARDS ---------------- */
/* ---------------- v3 · THE TICK RULE ----------------
   The identity motif. Twenty-four engraved ticks, majors every four hours,
   and one brass tick for now. It replaces the ribbon at the top of a screen:
   the ribbon says "these are the open hours", the tick rule says "this is a
   measuring instrument and you are here on it".
------------------------------------------------------------- */
function ticks(nowM = nowMins()) {
  const h = Math.floor((nowM % 1440) / 60);
  return `<div class="ticks" role="img" aria-label="${isAR() ? "الساعة الآن" : "Current hour"} ${fmtT(nowM)}">${
    Array.from({ length: 24 }, (_, i) =>
      `<i class="${i === h ? "on" : i % 4 === 0 ? "maj" : ""}"></i>`).join("")}</div>`;
}

const axis24 = () => `<div class="axis">00<span>06</span><span>12</span><span>18</span>24</div>`;

/* The band: one entity's day drawn as arc segments on a 3px rule. Jade is
   the hospital shift, brass the private clinic — the same two meanings the
   whole product uses, and nothing else is ever drawn here. */
function band(ent, day = null, showNow = true) {
  const d = day === null ? nowDay() : day;
  const segs = rawSegs(ent, d);
  const prev = rawSegs(ent, (d + 6) % 7).filter((x) => x.t > 1440).map((x) => ({ ...x, f: 0, t: x.t - 1440 }));
  const bars = [...prev, ...segs].map((x) => {
    const a = Math.max(0, x.f), b = Math.min(1440, x.t);
    if (b <= a) return "";
    return `<i class="${x.kind === "priv" ? "cl" : "sh"}" style="inset-inline-start:${pct(a).toFixed(2)}%;width:${pct(b - a).toFixed(2)}%"></i>`;
  }).join("");
  const mk = showNow && (day === null || day === nowDay())
    ? `<span class="nowmk" style="inset-inline-start:${pct(nowMins()).toFixed(2)}%"></span>` : "";
  return `<div class="band">${bars}${mk}</div>`;
}

/* ---------------- v3 · THE ROW ----------------
   Rows, not cards. The list is the surface: a hairline separates entries and
   a brass lead in the gutter marks "open right now". Nothing here is a box.
------------------------------------------------------------- */
/* The name and the provenance badge used to share one line. An Arabic name is
   long and «بيانات نموذجية» is long, and neither yields: at 320px the pair
   produced a three-line name beside a two-line badge — a five-line ragged
   header on a row whose job is to say who this is. The badge describes the
   whole entry, so it drops below the name and the name gets the full width.

   The chevron: these rows were the only tappable surface in the product with
   no affordance at all, which read as inert at 430px where the row is mostly
   empty space. */
function rowEl(o) {
  return `<a class="rw${o.quiet ? " quiet" : ""}" href="${o.href}">
    ${o.open ? `<span class="rw-lead"></span>` : ""}
    <span class="av">${esc(o.mono)}</span>
    <span class="grow" style="min-inline-size:0">
      <span class="d3" style="display:block">${esc(o.title)}</span>
      ${o.sub ? `<span class="q-sub" style="display:block">${o.sub}</span>` : ""}
      ${o.mark ? `<span style="display:block;margin-top:8px">${o.mark}</span>` : ""}
      ${o.meta ? `<span class="meta-row">${o.meta}</span>` : ""}
      ${o.band ? `<span style="display:block;margin-top:12px">${o.band}</span>` : ""}
    </span>
    <span class="rw-go" aria-hidden="true">${icon("chev")}</span>
  </a>`;
}

function doctorCard(x, dimIfShut = true) {
  const { d, km, st } = x;
  const sp = specOf(d.spec);
  const f = st.k !== "shut" && st.seg ? st.seg.fac : (st.next ? st.next.fac : docFacs(d)[0]);
  const dist = f && DISTRICTS.find((y) => y.id === f.district);
  const fee = st.k !== "shut" && st.seg ? st.seg.s?.fee : (st.next ? st.next.s?.fee : d.sessions[0].fee);
  const open = st.k === "open";
  return rowEl({
    href: `#/doctor/${d.id}`,
    mono: initials(L(d)).charAt(0),
    title: L(d),
    open, quiet: dimIfShut && st.k === "shut",
    mark: sealBadge(d, "doctors"),
    sub: `${esc(L(sp))}${f ? " — " + esc(L(f)) : ""}`,
    meta: [
      statusLabel(st, true),
      /* `fmtKm` returns "٢٠٧ م" / "0.2 كم" — a number AND an Arabic unit. In
         a `.num` LTR run the unit was forced to the wrong side, which is how
         "م" ended up abutting a time and reading as مساءً. */
      `<span class="t3">${fmtKm(km)}</span>`,
      fee !== null && fee !== undefined ? `<span class="t3">${money(fee)}</span>` : "",
      dist ? `<span class="t3">${esc(L(dist))}</span>` : "",
    ].filter(Boolean).join(""),
    band: band(d),
  });
}

function pharmacyCard(x, dimIfShut = true) {
  const { f, km, st } = x;
  const dist = DISTRICTS.find((d) => d.id === f.district);
  return rowEl({
    href: `#/pharmacy/${f.id}`,
    mono: initial(L(f)),
    title: L(f),
    open: st.k === "open", quiet: dimIfShut && st.k === "shut",
    mark: sealBadge(f, "pharmacies"),
    sub: `${dist ? esc(L(dist)) : ""}${f.night ? (isAR() ? " · خفارة ليلية" : " · night duty") : ""}`,
    meta: [
      statusLabel(st, true),
      /* `fmtKm` returns "٢٠٧ م" / "0.2 كم" — a number AND an Arabic unit. In
         a `.num` LTR run the unit was forced to the wrong side, which is how
         "م" ended up abutting a time and reading as مساءً. */
      `<span class="t3">${fmtKm(km)}</span>`,
    ].join(""),
    band: band(f),
  });
}

const SVC = {
  delivery: { ar: "توصيل", en: "Delivery" }, night: { ar: "خفارة", en: "Night duty" },
  injections: { ar: "حقن وزرق", en: "Injections" }, bp: { ar: "قياس ضغط", en: "BP check" },
  baby: { ar: "حليب أطفال", en: "Baby care" },
};
const svcLabel = (s) => esc(L(SVC[s]) || s);

function productCard(p) {
  return `<a class="prod" href="#/product/${p.id}">
    <div class="prod-img">${icon(CARE_CATEGORIES.find((c) => c.id === p.cat)?.icon || "pill", "glyph")}</div>
    <div class="prod-b">
      <div class="prod-t">${esc(L(p))}</div>
      <div class="prod-brand">${esc(p.brand)}</div>
      <div class="prod-p num">${money(p.price)}</div>
    </div>
  </a>`;
}

/* ---------------- QUERY UNDERSTANDING ----------------
   Iraqi users type intent, not keywords: "دكتورة اطفال بالكرادة اليوم" is four
   filters in one breath — specialty, gender, district, time. Text matching
   throws three of them away and returns a weak list.

   This parses the sentence into structured filters, then SHOWS what it
   understood as removable tokens. Transparency is the point: a search that
   silently guesses is untrustworthy; one that says "I read this as X, Y, Z —
   remove any of them" is a tool. No competitor in this market does it.
------------------------------------------------------------- */

/* Damerau-style distance, capped — phone typing on Arabic keyboards drops and
   swaps letters constantly. Only worth running on short tokens. */
function editDist(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i], best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v; if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev.length = 0; prev.push(...cur);
  }
  return prev[b.length];
}
const fuzzyHit = (token, target) => {
  const t = norm(target);
  if (!t || !token) return false;
  if (t.includes(token) || token.includes(t)) return true;
  return token.length >= 4 && editDist(token, t, token.length >= 7 ? 2 : 1) <= (token.length >= 7 ? 2 : 1);
};

// Arabic marks the feminine, never the masculine: "دكتور" is the neutral
// citation form. Reading it as "male" invents a filter the user never asked
// for — and in testing it returned zero results for a query that had answers.
const GENDER_WORDS = { f: ["طبيبه", "دكتوره", "دكتورة", "طبيبة", "female", "woman"] };
const TIME_WORDS   = ["اليوم", "هسه", "هلا", "الان", "حالا", "مفتوح", "مفتوحه", "دوام", "today", "now", "open"];
const KIND_WORDS   = {
  pharmacy: ["صيدليه", "صيدليات", "خفاره", "مناوبه", "pharmacy"],
  medicine: ["دواء", "دوا", "علاج", "حبوب", "ابره", "medicine", "drug"],
  product:  ["كريم", "شامبو", "واقي", "غسول", "فيتامين", "cream", "shampoo"],
};

function parseQuery(q) {
  const raw = norm(q);
  if (!raw) return null;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const out = { spec: null, district: null, gender: null, openNow: false, kind: null, rest: [] };

  for (const tok of tokens) {
    if (tok.length < 2) continue;
    // gender first: "دكتورة" also fuzzy-matches "دكتور", so it must win
    let hit = false;
    for (const [g, words] of Object.entries(GENDER_WORDS)) {
      if (words.some((w) => norm(w) === tok)) { out.gender = g; hit = true; break; }
    }
    if (hit) continue;
    if (TIME_WORDS.some((w) => norm(w) === tok)) { out.openNow = true; continue; }
    const dis = DISTRICTS.find((d) => fuzzyHit(tok.replace(/^(ب|بال|ال)/, ""), d.ar) || fuzzyHit(tok, d.en));
    if (dis) { out.district = dis.id; continue; }
    const sp = SPECIALTIES.find((x) => [x.ar, x.en, ...x.alias].some((a) => fuzzyHit(tok, a)));
    if (sp) { out.spec = sp.id; continue; }
    for (const [k, words] of Object.entries(KIND_WORDS)) {
      if (words.some((w) => fuzzyHit(tok, w))) { out.kind = k; hit = true; break; }
    }
    if (!hit) out.rest.push(tok);
  }
  const understood = !!(out.spec || out.district || out.gender || out.openNow || out.kind);
  return understood ? out : null;
}

/* The tokens we understood, shown back as removable chips. */
function parsedChips(pq, q) {
  const chip = (label, key) =>
    `<button class="pchip" onclick="dropToken('${key}')">${esc(label)}${icon("close")}</button>`;
  const bits = [];
  if (pq.kind)     bits.push(chip({ pharmacy: isAR() ? "صيدليات" : "Pharmacies", medicine: isAR() ? "أدوية" : "Medicines", product: isAR() ? "منتجات" : "Products" }[pq.kind], "kind"));
  if (pq.spec)     bits.push(chip(L(specOf(pq.spec)), "spec"));
  if (pq.gender)   bits.push(chip(pq.gender === "f" ? (isAR() ? "طبيبة" : "Female") : (isAR() ? "طبيب" : "Male"), "gender"));
  if (pq.district) bits.push(chip(L(DISTRICTS.find((d) => d.id === pq.district)), "district"));
  if (pq.openNow)  bits.push(chip(isAR() ? "مفتوح الآن" : "Open now", "openNow"));
  if (!bits.length) return "";
  return `<div class="parsed">
    <div class="parsed-h">${icon("check")}${isAR() ? "فهمنا بحثك هكذا" : "We read your search as"}</div>
    <div class="chips chips--wrap">${bits.join("")}</div>
  </div>`;
}

/* An empty result is a dead end only if we make the user guess which
   constraint killed it. We already know: drop each token in turn, see which
   one restores results, and offer that exact fix as one tap. */
/* The board's empty mark: three rotated squares around an amber diamond. It is
   the app's own geometry rather than a generic magnifier or a shrugging doctor,
   and it is drawn in CSS so an empty state costs nothing to render. */
const emptyGlyph = () => `<div class="glyph" aria-hidden="true"><i></i><i></i><i></i><b></b></div>`;

function zeroWithWayOut(P) {
  const LABEL = {
    spec: () => L(specOf(P.spec)),
    district: () => L(DISTRICTS.find((d) => d.id === P.district)),
    gender: () => (P.gender === "f" ? (isAR() ? "طبيبة" : "female") : (isAR() ? "طبيب" : "male")),
    openNow: () => (isAR() ? "مفتوح الآن" : "open now"),
  };
  const rescues = [];
  for (const key of ["district", "openNow", "gender", "spec"]) {
    if (!P[key]) continue;
    const trial = { ...P, [key]: key === "openNow" ? false : null };
    const saved = { ...S.filters };
    S.filters = { ...S.filters, spec: trial.spec, gender: trial.gender, openNow: trial.openNow, district: trial.district };
    const n = doctorsFor({ spec: trial.spec }).list.length;
    S.filters = saved;
    if (n > 0) rescues.push({ key, n, label: LABEL[key]() });
  }
  rescues.sort((a, b) => b.n - a.n);
  return `<div class="empty">
    ${emptyGlyph()}
    <h3>${isAR() ? "ما لگينا أحد يجمع كل هذي الشروط" : "Nothing matches all of those at once"}</h3>
    ${rescues.length ? `<p>${isAR() ? "بس لو تتنازل عن وحدة:" : "But dropping one of them works:"}</p>
      <div class="empty-alts stack">${rescues.map((r) => `
        <button class="lane" onclick="dropToken('${r.key}')">
          <span class="ic">${icon("refresh")}</span>
          <span class="grow" style="text-align:start">
            <h3>${isAR() ? "بدون" : "Without"} «${esc(r.label)}»</h3>
            <p><b class="num">${r.n}</b> ${isAR() ? "نتيجة" : "results"}</p></span>
          ${icon("chev")}</button>`).join("")}</div>`
      : `<p>${isAR() ? "جرّب منطقة ثانية أو تصفّح الاختصاصات." : "Try another area, or browse specialties."}</p>
         <button class="btn btn--2" onclick="location.hash='#/needs'">${icon("grid")}${isAR() ? "تصفّح حسب الحاجة" : "Browse by need"}</button>`}
  </div>`;
}

function dropToken(key) {
  S.parsedDrop = S.parsedDrop || {};
  S.parsedDrop[key] = true;
  doSearch(LS.get("q", ""));
}

function applyParsed(pq) {
  const d = S.parsedDrop || {};
  return {
    spec: d.spec ? null : pq.spec,
    district: d.district ? null : pq.district,
    gender: d.gender ? null : pq.gender,
    openNow: d.openNow ? false : pq.openNow,
    kind: d.kind ? null : pq.kind,
  };
}

/* ---------------- P6 · DATA INTEGRITY ----------------
   A flat seed file fails silently: a typo in a facility id renders an empty
   block, a reversed time range renders a doctor as permanently closed, a
   duplicate id makes one record unreachable. None of it throws. For an
   operator product that curates thousands of rows, silent corruption is the
   most expensive class of bug there is — so validate at load and surface it.
------------------------------------------------------------- */
function validateData() {
  const errs = [];
  const seen = new Set();
  const facIds = new Set(FACILITIES.map((f) => f.id));
  const specIds = new Set(SPECIALTIES.map((x) => x.id));
  const distIds = new Set(DISTRICTS.map((d) => d.id));

  const dup = (id, kind) => { const k = kind + ":" + id; if (seen.has(k)) errs.push({ t: "dup", m: `${kind} ${id} مكرر` }); seen.add(k); };

  DISTRICTS.forEach((d) => { dup(d.id, "district"); if (!d.lm_ar) errs.push({ t: "missing", m: `المنطقة ${d.ar} بلا معلم` }); });
  FACILITIES.forEach((f) => {
    dup(f.id, "facility");
    if (!distIds.has(f.district)) errs.push({ t: "orphan", m: `${f.ar}: منطقة غير معروفة «${f.district}»` });
    (f.hours || []).forEach((h) => {
      if (h.t !== "24:00" && mins(h.t) === mins(h.f)) errs.push({ t: "time", m: `${f.ar}: دوام بطول صفر` });
    });
    if (f.type === "pharmacy" && !f.phone) errs.push({ t: "missing", m: `${f.ar}: بلا هاتف` });
  });
  DOCTORS.forEach((d) => {
    dup(d.id, "doctor");
    if (!specIds.has(d.spec)) errs.push({ t: "orphan", m: `${d.ar}: اختصاص غير معروف «${d.spec}»` });
    if (!d.sessions || !d.sessions.length) errs.push({ t: "empty", m: `${d.ar}: بلا أوقات دوام — لن يظهر` });
    (d.sessions || []).forEach((sg) => {
      if (!facIds.has(sg.fac)) errs.push({ t: "orphan", m: `${d.ar}: منشأة غير معروفة «${sg.fac}»` });
      if (mins(sg.t) <= mins(sg.f)) errs.push({ t: "time", m: `${d.ar}: نهاية الدوام قبل بدايته (${sg.f}–${sg.t})` });
      if (sg.d < 0 || sg.d > 6) errs.push({ t: "time", m: `${d.ar}: يوم غير صالح` });
    });
    if (!d.wa && !d.phone) errs.push({ t: "missing", m: `${d.ar}: بلا واتساب ولا هاتف — غير قابل للتواصل` });
  });
  const medIds = new Set(MEDICINES.map((m) => m.id));
  MEDICINES.forEach((m) => {
    dup(m.id, "medicine");
    m.stock.forEach((st) => {
      if (!facIds.has(st.f)) errs.push({ t: "orphan", m: `${m.ar}: صيدلية غير معروفة «${st.f}»` });
      /* A confirmation dated in the future, or a "price" of zero, would both
         render as confident facts. Catch them here rather than on screen. */
      if (freshMins(st) < 0) errs.push({ t: "range", m: `${m.ar}: تأكيد بتاريخ مستقبلي` });
      if (st.p !== undefined && !(st.p > 0)) errs.push({ t: "range", m: `${m.ar}: سعر غير صالح` });
    });
    /* The substitute door must open onto something. A dangling id would render
       a button that leads to a 404 on the screen where the user has the fewest
       options left — the worst possible place for a dead end. */
    (m.subs || []).forEach((sid) => {
      if (!medIds.has(sid)) errs.push({ t: "orphan", m: `${m.ar}: بديل غير معروف «${sid}»` });
      if (sid === m.id) errs.push({ t: "orphan", m: `${m.ar}: بديل يشير إلى نفسه` });
    });
    if (m.trend && m.trend.length !== 14) errs.push({ t: "range", m: `${m.ar}: سلسلة التوفّر ليست ١٤ يوماً` });
  });
  PRODUCTS.forEach((pr) => {
    dup(pr.id, "product");
    pr.stock.forEach((fid) => { if (!facIds.has(fid)) errs.push({ t: "orphan", m: `${pr.ar}: صيدلية غير معروفة «${fid}»` }); });
  });
  return errs;
}

/* ---------------- P4 · RESILIENCE ----------------
   Baghdad mobile data drops. The app must say so plainly and keep working on
   what it already has — the seed data is in memory, so discovery never dies.
   Only the WhatsApp handoff genuinely needs the network.
------------------------------------------------------------- */
function netBanner() {
  if (navigator.onLine !== false) return "";
  /* "Browsing still works" is only honest if we also say how old the answer is.
     Opening hours are computed live and stay true; stock confirmations were
     read at a point in time and may have moved since. Say which is which. */
  const at = LS.get("lastOnline", null);
  const when = at ? fmtT(new Date(at).getHours() * 60 + new Date(at).getMinutes()) : null;
  return `<div class="offline-bar">
    <!-- The state is NAMED as well as described. Saying only "saved data from
         14:32" describes the consequence perfectly and leaves a user who has
         not noticed their signal dropped to keep tapping and wondering. Both,
         in that order: what is wrong, then what it means for them. -->
    <span class="grow">${isAR()
      ? `دون اتصال${when ? ` — بيانات محفوظة من <span class="num">${when}</span>` : ""}<br><span class="t3">التوفّر قد يكون تغيّر · الاتصال الهاتفي يعمل · ملفك يفتح ويتحدّث عادي</span>`
      : `Offline${when ? ` — saved data from <span class="num">${when}</span>` : ""}<br><span class="t3">Stock may have changed · phone calls still work · your record still opens and saves</span>`}</span>
    <span class="st st-q"><i class="dot"></i>${isAR() ? "محفوظ" : "saved"}</span>
    <button onclick="render()">${isAR() ? "إعادة" : "Retry"}</button></div>`;
}

/* ---------------- SHELL ---------------- */
const app = () => document.getElementById("app");

/* ---------------- BACK, WITHOUT LEAVING ----------------
   A deep link opened cold has no history behind it, so `history.back()` at
   the top of that screen walks out of the application — measured on all eight
   deep links the audit tried, from a QR poster, a shared record link, a
   pharmacy page. `history.length` cannot tell us: it counts the whole tab's
   life, including whatever page the user was on before. So count OUR OWN
   moves. If we have not navigated since load, "back" means up one level, not
   out. */
let inAppMoves = 0;
const noteNav = () => { inAppMoves++; };

/* Where "up" is. Declared rather than derived: stripping the last path
   segment turns #/doctor/d1 into #/doctor, which is not a route — the user
   would land on a 404 instead of outside the app, which is not an
   improvement. */
const UP_FROM = {
  record: "#/", clinical: "#/record", doctor: "#/doctors", pharmacy: "#/pharmacies",
  hospital: "#/hospitals", need: "#/needs", med: "#/rx", product: "#/rx",
  care: "#/", partner: "#/", radar: "#/needs", wait: "#/needs",
  lab: "#/", imaging: "#/", "pharmacy-rx": "#/",
};
function upFrom(hash) {
  const seg = String(hash == null ? location.hash : hash)
    .replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  if (!seg.length) return "#/";
  /* The record's own sub-screens go up to the record, not to the home
     screen: someone three levels into their labs wants their record back. */
  if (seg[0] === "record" && seg.length > 1) return "#/record";
  return UP_FROM[seg[0]] || "#/";
}

globalThis.goBack = function goBack() {
  if (inAppMoves > 0) { history.back(); return; }
  location.hash = upFrom(null);
};

function header(opts = {}) {
  const off = netBanner();
  if (opts.back) {
    return off + `<header class="hdr">
      <button class="icon-btn hdr-back" onclick="goBack()" aria-label="${t("back")}">${icon("back")}</button>
      <div class="grow hdr-title">${esc(opts.title || "")}</div>
      ${opts.right || ""}
    </header>`;
  }
  return off + `<header class="hdr">
    <a class="brand" href="#/">${BRAND_MARK}<span>${L(CONFIG.brand)}</span></a>
    <div class="grow"></div>
    <button class="place-tag ${S.locState === "precise" ? "place-tag--gps" : ""}" onclick="openLocation()">
      ${icon("pin")}<span>${esc(L(here()))}</span>${icon("chev", "arrow")}</button>
    <button class="icon-btn" onclick="toggleLang()" aria-label="${isAR() ? "English" : "العربية"}">${icon("globe")}</button>
    <button class="icon-btn" onclick="toggleTheme()" aria-label="${isAR() ? "الوضع الليلي" : "Theme"}">${icon("moon")}</button>
  </header>`;
}

/* Four slots, and the record earns one of them. The product's centre of
   gravity is no longer "find a pharmacy that is open" — that is the entry
   point, not the thing being built. A record that lives three taps deep
   inside a settings menu is a record nobody accumulates, and an empty record
   is worth nothing to the doctor it was built for. */
function nav(active) {
  const items = [["#/", "home", "home"], ["#/record", "seal", "record"],
    ["#/needs", "stetho", "doctors"], ["#/pharmacies", "cross", "pharmacies"]];
  /* The bar is `position: fixed`, so it floats over the end of whatever is
     behind it. Measured before this existed: the record index's last row —
     «التحاليل» — sat at y=792 with the bar's top edge at y=778. Unreadable,
     and untappable. The reservation is emitted HERE rather than left to each
     call site, because a call site can forget and this cannot. */
  return `<div class="nav-space" aria-hidden="true"></div>`
    + `<nav class="nav">${items.map(([h, i, k]) =>
      `<a href="${h}" class="${active === k ? "on" : ""}">${icon(i)}<span>${t(k)}</span></a>`).join("")}</nav>`;
}
