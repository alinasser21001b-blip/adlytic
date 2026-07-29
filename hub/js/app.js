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
const fmtRangeTxt = (a, b) => `${fmtT(a)} – ${fmtT(b)}`;                       // plain text: messages, stored records
const fmtRange = (a, b) => `<span dir="ltr" class="num">${fmtRangeTxt(a, b)}</span>`;   // markup: UI
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
const phNight = () => FACILITIES.filter((f) => f.type === "pharmacy" && f.night).length;

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

function sealBadge(ent) {
  return ent.verified
    ? `<span class="seal">${icon("seal")}${t("verified")}</span>`
    : `<span class="unverified">${icon("info")}${t("listed")}</span>`;
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
function rowEl(o) {
  return `<a class="rw${o.open ? "" : ""}${o.quiet ? " quiet" : ""}" href="${o.href}">
    ${o.open ? `<span class="rw-lead"></span>` : ""}
    <span class="av">${esc(o.mono)}</span>
    <span class="grow">
      <span class="rowb"><span class="d3">${esc(o.title)}</span>${o.mark || ""}</span>
      ${o.sub ? `<span class="q-sub" style="display:block">${o.sub}</span>` : ""}
      ${o.meta ? `<span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">${o.meta}</span>` : ""}
      ${o.band ? `<span style="display:block;margin-top:12px">${o.band}</span>` : ""}
    </span>
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
    mark: d.verified ? `<span class="mark">${isAR() ? "ختم" : "OK"}</span>` : "",
    sub: `${esc(L(sp))}${f ? " — " + esc(L(f)) : ""}`,
    meta: [
      statusLabel(st, true),
      `<span class="t3"><span class="num">${fmtKm(km)}</span></span>`,
      fee !== null && fee !== undefined ? `<span class="t3"><span class="num">${money(fee)}</span></span>` : "",
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
    mark: f.verified ? `<span class="mark">${isAR() ? "ختم" : "OK"}</span>` : "",
    sub: `${dist ? esc(L(dist)) : ""}${f.night ? (isAR() ? " · خفارة ليلية" : " · night duty") : ""}`,
    meta: [
      statusLabel(st, true),
      `<span class="t3"><span class="num">${fmtKm(km)}</span></span>`,
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
    <span class="grow">${isAR()
      ? `${when ? `بيانات محفوظة من <span class="num">${when}</span>` : "دون اتصال"}<br><span class="t3">التوفّر قد يكون تغيّر · الاتصال الهاتفي يعمل</span>`
      : `${when ? `Saved data from <span class="num">${when}</span>` : "Offline"}<br><span class="t3">Stock may have changed · phone calls still work</span>`}</span>
    <span class="st st-q"><i class="dot"></i>${isAR() ? "محفوظ" : "saved"}</span>
    <button onclick="render()">${isAR() ? "إعادة" : "Retry"}</button></div>`;
}

/* ---------------- SHELL ---------------- */
const app = () => document.getElementById("app");

function header(opts = {}) {
  const off = netBanner();
  if (opts.back) {
    return off + `<header class="hdr">
      <button class="icon-btn hdr-back" onclick="history.back()" aria-label="${t("back")}">${icon("back")}</button>
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
  return `<nav class="nav">${items.map(([h, i, k]) =>
    `<a href="${h}" class="${active === k ? "on" : ""}">${icon(i)}<span>${t(k)}</span></a>`).join("")}</nav>`;
}

/* ---------------- SCREENS ---------------- */
/* ---------------- v3 · HOME · 4d ----------------
   The case opens on the one number that matters. There is no search bar
   competing with it: a search field is a question the product asks the user,
   and the home screen's job is to answer one first.

   Which number? Open pharmacies. Not doctors — a doctor is needed a few times
   a year and the answer is rarely "right now". A pharmacy at 02:40 is the
   thing a tired parent is actually holding a phone for.
------------------------------------------------------------- */
function screenHome() {
  if (S.role === "pharmacist") return screenHomePharmacist();
  if (S.role === "doctor") return screenHomeDoctor();
  return screenHomePatient();
}

function screenHomePatient() {
  /* The local directory (doctors, open-now pharmacies, districts) covers
     Baghdad. A patient whose governorate is set elsewhere must not be handed
     Baghdad's numbers as if they were theirs — "5 pharmacies open now" is a
     lie in Basra. They get the national reading instead, with the coverage
     boundary stated in words rather than discovered by disappointment. */
  if ((S.exCity || "baghdad") !== "baghdad") return screenHomeAway();
  const docsOpen = docsOpenNow(), phOpen = phOpenNow(), night = phNight();
  const freshMeds = MEDICINES.filter((m) => m.stock.some((st) => freshBand(freshMins(st)) !== "cold")).length;
  const scarce = MEDICINES.filter((m) => !m.stock.some((st) => freshBand(freshMins(st)) !== "cold"));
  const nearby = [
    ...pharmaciesNear({ openOnly: true }).slice(0, 2).map((x) => pharmacyCard(x)),
    ...doctorsFor({ radius: 25 }).list.slice(0, 2).map((x) => doctorCard(x)),
  ];

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <a class="t3" href="#/me">${isAR() ? "طلباتي" : "My requests"}</a>
    </div>

    <button class="lab" style="margin-top:34px;display:block;text-align:start;min-height:0"
      onclick="openLocation()">${esc(L(here()))} · <span class="num">${fmtT(nowMins())}</span></button>

    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${phOpen}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? countAr(phOpen, AR_PHARM_OPEN) : phOpen === 1 ? "pharmacy open now" : "pharmacies open now"}</div>
    <div class="q-sub" style="margin-top:6px">${night
      ? (isAR() ? `منها <span class="num">${night}</span> خفارة ليلية تعمل حتى الفجر.`
                : `<span class="num">${night}</span> of them on night duty until dawn.`)
      : (isAR() ? `و<span class="num">${docsOpen}</span> طبيب يستقبل الآن.`
                : `and <span class="num">${docsOpen}</span> doctors seeing patients now.`)}</div>

    <div style="margin:26px 0 6px">${ticks()}</div>
    ${axis24()}
  </section>

  <section class="pad" style="margin-top:26px"><div class="v2">
    <button class="btn" onclick="location.hash='#/search'">${isAR() ? "شنو تحتاج؟ — ابدأ من هنا" : "What do you need? Start here"}</button>
    <div style="display:flex;gap:8px">
      <a class="btn btn--2" style="flex:1;min-height:46px;font-size:13.5px" href="#/rx">${isAR() ? "دوا معيّن" : "A medicine"}</a>
      <a class="btn btn--2" style="flex:1;min-height:46px;font-size:13.5px" href="#/needs">${isAR() ? "دكتور" : "A doctor"}</a>
      <a class="btn btn--2" style="flex:1;min-height:46px;font-size:13.5px" href="#/care">${isAR() ? "العناية" : "Care"}</a>
    </div>
  </div></section>

  ${(() => {
    const live = myActiveNeeds();
    if (live.length) {
      const r = live[0];
      const md = needMedOf(r);
      const reach = radarReach(r);
      const answered = (r.resp || []).length;
      return `<section class="pad" style="margin-top:26px">
        <a class="rw" href="#/${reqState(r) === "broadcasting" ? "wait" : "need"}/${esc(r.id)}">
          <span class="rw-lead" style="background:var(--jade)"></span>
          <span class="grow">
            <span class="rowb">
              <span class="d3">${md ? esc(md.name) : (isAR() ? "طلبك" : "Your request")}</span>
              <span class="st ${answered ? "st-v" : "st-t"}"><i class="dot${answered ? "" : " dot-live"}"></i>${
                answered ? (isAR() ? countAr(answered, ["ردّت صيدلية", "ردّت صيدليتان", "ردّت صيدليات", "ردّت صيدلية"])
                                   : `${answered} replied`)
                         : (isAR() ? "ينتظر ردّاً" : "waiting")}</span>
            </span>
            <span class="q-sub" style="display:block">${answered
              ? (isAR() ? "افتح الطلب وشوف منو ردّ." : "Open it and see who replied.")
              : (isAR() ? `ظاهر لـ <span class="num">${reach.n}</span> صيدلية موثّقة.`
                        : `Visible to <span class="num">${reach.n}</span> verified pharmacies.`)}</span>
          </span>
        </a>
        ${live.length > 1 ? `<a class="t3" href="#/me" style="display:block;margin-top:10px">${isAR()
          ? `و${countAr(live.length - 1, ["طلب آخر", "طلبان آخران", "طلبات أخرى", "طلباً آخر"])}`
          : `and ${live.length - 1} more`}</a>` : ""}
      </section>`;
    }
    /* No live request: state the capability instead of hiding it behind a
       search that only finds what is already catalogued. */
    return `<section class="pad" style="margin-top:26px">
      <a class="rw" href="#/need/new">
        <span class="rw-lead" style="background:var(--brass)"></span>
        <span class="grow">
          <span class="rowb">
            <span class="d3">${isAR() ? "دواء ما لكيته؟" : "Can't find a medicine?"}</span>
            <span class="b-g" style="font-size:12px">${isAR() ? "اطلبه" : "Request it"}</span>
          </span>
          <span class="q-sub" style="display:block">${isAR()
            ? "اكتب اسمه وتركيزه ومنطقتك — يوصل للصيدليات الموثّقة، والردود تجيك هنا."
            : "Name, strength and your area — it reaches verified pharmacies, and replies land here."}</span>
        </span>
      </a>
    </section>`;
  })()}

  ${scarce.length ? `<section class="pad" style="margin-top:26px">
    <a class="note note-w" href="#/med/${scarce[0].id}">
      <span>${isAR()
        ? `<b>${countAr(scarce.length, ["دواء واحد", "دواءان", "أدوية", "دواءً"])}</b> بلا توفّر مؤكَّد في بغداد الآن — أوّلها «${esc(L(scarce[0]))}».`
        : `<b class="num">${scarce.length}</b> medicines have no confirmed stock in Baghdad — starting with ${esc(L(scarce[0]))}.`}</span>
    </a></section>` : ""}

  <div class="hr" style="margin:30px 0 0"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "يعمل الآن قربك" : "Open near you"}</div>
    ${nearby.join('<div class="hr"></div>')}
  </section>

  <section class="pad" style="margin-top:22px">
    <div class="rowb" style="border-top:1px solid var(--dial-line);padding-top:18px">
      <button class="st st-e" onclick="openEmergency()" style="background:none;border:0;padding:0;font:inherit;color:inherit"><i class="dot"></i>${isAR() ? "طوارئ — أقرب إسعاف" : "Emergency — nearest care"}</button>
      <a class="n" style="font-size:17px;color:var(--alarm)" href="tel:${CONFIG.emergency.unified}">${CONFIG.emergency.unified}</a>
    </div>
  </section>

  <section class="pad" style="margin-top:22px;padding-bottom:26px">
    <a class="rowb" href="#/trust">
      <span class="t3">${isAR()
        ? `<span class="num">${DOCTORS.filter((d) => d.verified).length}</span> موثّق · <span class="num">${freshMeds}</span> دواء مؤكَّد · <span class="num">${DISTRICTS.length}</span> منطقة`
        : `<span class="num">${DOCTORS.filter((d) => d.verified).length}</span> verified · <span class="num">${freshMeds}</span> confirmed · <span class="num">${DISTRICTS.length}</span> areas`}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "كيف نتحقق" : "How we verify"}</span>
    </a>
    <div class="t3" style="margin-top:12px;opacity:.62">${isAR() ? "النسخة" : "Build"}
      <span class="num" id="buildstamp">${esc(buildLabel())}</span></div>
  </section>
  ${nav("home")}`;
}

/* ---------------- role home · pharmacist ----------------
   The case opens on the demand this branch could answer — not on patient
   discovery, which a pharmacist standing behind a counter does not need. */
/* Home for a patient outside Baghdad: the case opens on what the network
   can truthfully do for them — the availability field across Iraq — and
   says plainly where the local layer stops. */
function screenHomeAway() {
  const c = cityById(S.exCity);
  const liveSigs = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL);
  const inMine = liveSigs.filter((g) => cityOf(anyFac(g.fac)) === S.exCity);
  const wanted = liveRequests().filter((r) => r.city === S.exCity);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <a class="t3" href="#/me">${isAR() ? "طلباتي" : "My requests"}</a>
    </div>

    <button class="lab" style="margin-top:34px;display:block;text-align:start;min-height:0"
      onclick="pickExCity()">${esc(cityName(c))} · <span class="num">${fmtT(nowMins())}</span></button>

    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${inMine.length}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR()
      ? `تأكيد توفّر حيّ في ${esc(cityName(c))}` : `live confirmations in ${esc(cityName(c))}`}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `و<span class="num">${liveSigs.length - inMine.length}</span> في باقي المحافظات — الدواء الناقص عندك قد يكون موجوداً عندهم.`
      : `and <span class="num">${liveSigs.length - inMine.length}</span> across the rest of Iraq — what is missing here may exist there.`}</div>

    <div style="margin-top:26px" class="v2">
      <button class="btn" onclick="location.hash='#/rx'">${isAR() ? "دوّر على دواء" : "Look for a medicine"}</button>
      <button class="btn btn--2" onclick="location.hash='#/need/new'">${isAR() ? "انشر حاجتك — الشبكة تدوّر عنك" : "Publish your need"}</button>
    </div>
  </section>

  ${wanted.length ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? `يدوّرون عليه في ${esc(cityName(c))}` : `Wanted in ${esc(cityName(c))}`}</div>
    ${wanted.slice(0, 3).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin-top:26px">
    <div class="note note-w"><span>${isAR()
      ? `دليل الأطباء والصيدليات المحلي يغطي بغداد حالياً. في ${esc(cityName(c))} يخدمك مستكشف الأدوية — وهو وطني — وطوارئ الرقم الموحد <b class="num">${CONFIG.emergency.unified}</b> تعمل بكل مكان.`
      : `The local doctor and pharmacy directory currently covers Baghdad. In ${esc(cityName(c))} the Medicine Explorer — which is national — is what serves you, and the unified emergency line <b class="num">${CONFIG.emergency.unified}</b> works everywhere.`}</span></div>
    <button class="b-g" style="font-size:12.5px;margin-top:12px" onclick="setExCity('baghdad')">${isAR() ? "أنا في بغداد فعلاً — رجّعني" : "I'm actually in Baghdad — switch back"}</button>
  </section>

  <section class="pad" style="margin:26px 0 30px">
    <a class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:16px" href="tel:${CONFIG.emergency.unified}">
      <span class="st st-e"><i class="dot"></i>${isAR() ? "طوارئ — الرقم الموحد" : "Emergency"}</span>
      <span class="n" style="font-size:17px;color:var(--alarm)">${CONFIG.emergency.unified}</span>
    </a>
  </section>
  ${nav("home")}`;
}

function screenHomePharmacist() {
  const f = S.myBranch ? anyFac(S.myBranch) : null;
  const rows = f ? radarFor(f.id) : [];
  const urgent = rows.filter((x) => x.r.urg === "urgent").length;
  const mySigs = f ? SIGNALS.filter((g) => g.fac === f.id && sigAgeMin(g) < SIG_TTL) : [];
  const aging = mySigs.filter((g) => sigAgeMin(g) >= 1440);
  const netReq = liveRequests().length;

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="pickRole()">${isAR() ? "وضع الصيدلاني" : "Pharmacist mode"}</button>
    </div>

    ${f ? `
    <div class="lab" style="margin-top:34px">${esc(L(f))} · ${esc(cityName(cityById(cityOf(f))))}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${rows.length}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? "طلب تكدر تجاوب عليه" : "requests you could answer"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `منها <span class="num">${urgent}</span> عاجل · إفاداتك الحية <span class="num">${mySigs.length}</span>`
      : `<span class="num">${urgent}</span> urgent · your live signals <span class="num">${mySigs.length}</span>`}</div>
    <div style="margin-top:24px" class="v2">
      <a class="btn" href="#/radar/${f.id}">${isAR() ? "افتح رادار التوفّر" : "Open Supply Radar"}</a>
      <a class="btn btn--2" href="#/partner/${FACILITIES.some((y) => y.id === f.id) ? f.id : "p1"}">${isAR() ? "لوحة الطلب في منطقتك" : "Demand in your area"}</a>
    </div>`
    : `
    <div class="lab" style="margin-top:34px">${isAR() ? "وضع الصيدلاني" : "Pharmacist mode"}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${netReq}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? "طلب دواء نشط في العراق" : "active requests across Iraq"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "اختر فرعك حتى نعرض اللي يخصّك منها — في محافظتك أو لدواء تفيد بتوفّره."
      : "Pick your branch and we'll narrow these to the ones you can answer."}</div>
    <div style="margin-top:24px"><a class="btn" href="#/radar">${isAR() ? "اختر فرعك" : "Pick your branch"}</a></div>`}
  </section>

  ${aging.length ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px;color:var(--brass-ink)">${isAR() ? "إفاداتك تتقادم" : "Your claims are aging"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "أقدم من يوم — المريض يشوفها باهتة. أكّدها من جديد إذا الدواء بعده موجود."
      : "Over a day old — patients see them dimmed. Re-confirm if the stock is still there."}</div>
    ${aging.map((g) => { const x = variantOf(g.v); return x ? `<div class="rw">
      <span class="grow"><span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
        <span class="row" style="margin-top:8px"><span class="st st-t"><i class="dot"></i>${isAR() ? `أفدت ${sigAge(sigAgeMin(g))}` : `reported ${sigAge(sigAgeMin(g))}`}</span></span>
      </span></div>` : ""; }).join('<div class="hr"></div>')}
  </section>` : ""}

  ${f && rows.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "أقرب الطلبات" : "Nearest requests"}</div>
    ${rows.slice(0, 3).map(({ r }) => needCard(r, { state: false })).join('<div class="hr"></div>')}
    <a class="b-g" style="font-size:12.5px;margin-top:12px;display:inline-flex" href="#/radar/${f.id}">${isAR() ? "الكل في الرادار" : "All of them in Radar"}</a>
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <a class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:16px" href="#/explorer">
      <span class="t3">${isAR() ? "رجوع لواجهة المريض — استكشاف الأدوية" : "Back to the patient view — Explorer"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
  </section>
  ${nav("home")}`;
}

/* ---------------- role home · doctor ---------------- */
function screenHomeDoctor() {
  const d = S.myDoc ? DOCTORS.find((x) => x.id === S.myDoc) : null;
  const dm = d && DOC_DEMAND[d.id];
  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="pickRole()">${isAR() ? "وضع الطبيب" : "Doctor mode"}</button>
    </div>

    ${d && dm ? `
    <div class="lab" style="margin-top:34px">${esc(L(d))} · ${esc(L(specOf(d.spec)))}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${dm.searches - dm.requests}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? "دوّروا على اختصاصك وما وصلوك" : "searched your specialty, never reached you"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `خلال ٣٠ يوم · وصلك <span class="num">${dm.requests}</span> طلباً ورددت على <span class="num">${dm.replied}</span>`
      : `over 30 days · <span class="num">${dm.requests}</span> reached you, you answered <span class="num">${dm.replied}</span>`}</div>
    <div style="margin-top:24px" class="v2">
      <a class="btn" href="#/partner/doctor/${d.id}">${isAR() ? "افتح لوحة الطلب" : "Open your demand dashboard"}</a>
      <a class="btn btn--2" href="#/doctor/${d.id}">${isAR() ? "شوف ملفك مثل ما يشوفه المريض" : "See your profile as a patient does"}</a>
    </div>`
    : `
    <div class="lab" style="margin-top:34px">${isAR() ? "وضع الطبيب" : "Doctor mode"}</div>
    <h1 class="d2" style="margin-top:12px">${isAR() ? "شوف الطلب اللي ما وصلك" : "See the demand that never reached you"}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "اختر ملفك حتى نعرض كم مريض دوّر على اختصاصك في منطقتك — وما وصلك."
      : "Pick your profile and we'll show how many searched your specialty and never reached you."}</div>
    <div style="margin-top:24px" class="v2">
      ${DOCTORS.filter((x) => DOC_DEMAND[x.id]).map((x) => `<button class="btn btn--2" onclick="setMyDoc('${x.id}')">${esc(L(x))} — ${esc(L(specOf(x.spec)))}</button>`).join("")}
    </div>`}
  </section>

  <section class="pad" style="margin:30px 0 30px">
    <a class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:16px" href="#/needs">
      <span class="t3">${isAR() ? "رجوع لواجهة المريض" : "Back to the patient view"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
  </section>
  ${nav("home")}`;
}

function setMyDoc(id) { S.myDoc = id; LS.set("myDoc", id); render(); }

/* Role picker. Reachable from every role's home and from /start — never a
   blocking carousel, and switching back is one tap. */
function pickRole() {
  const opt = (k, t1, t2) => `<button class="rw" onclick="setRole('${k}')">
    <span class="grow"><span class="rowb">
      <span class="t1" style="font-size:15px">${t1}</span>
      ${S.role === k ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "الحالي" : "current"}</span>` : ""}
    </span><span class="q-sub" style="display:block">${t2}</span></span></button>`;
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "منو يستخدم قريب؟" : "Who is using Qareeb?"}</h2>
      <p>${isAR() ? "يغيّر شكل الرئيسية فقط — بلا حساب، وتكدر ترجع بأي وقت." : "Changes what home opens on — no account, switch back any time."}</p></div></div>
    <div class="sheet-b">
      ${opt("patient", isAR() ? "مريض أو مرافق" : "Patient or carer", isAR() ? "أدور على دواء أو طبيب أو صيدلية" : "Looking for medicine, a doctor, a pharmacy")}
      <div class="hr"></div>
      ${opt("pharmacist", isAR() ? "صيدلاني" : "Pharmacist", isAR() ? "أشوف الطلبات وأفيد بالتوفّر" : "See requests, report availability")}
      <div class="hr"></div>
      ${opt("doctor", isAR() ? "طبيب / طبيبة" : "Doctor", isAR() ? "أشوف الطلب على اختصاصي" : "See the demand on my specialty")}
    </div>`);
}
function setRole(r) { S.role = r; LS.set("role", r); closeSheet(); location.hash = "#/"; render(); }

function qrContext() {
  const src = QR_SOURCES[S.qrSource];
  if (!src) return "";
  return `<div class="qr-ctx fade">${icon("qr")}
    <span>${isAR() ? "دخلت من" : "Scanned at"} ${esc(src.label_ar)}</span>
    <button onclick="S.qrSource=null;render()" aria-label="${t("cancel")}">${icon("close")}</button></div>`;
}

/* ---------------- QR ENTRY ----------------
   Someone scans a poster at a pharmacy counter. They are standing up, probably
   holding a prescription, and they did not come here to be onboarded. So this
   is one question with three answers, every count computed live, and a skip
   that is always the first thing reachable. It is not a carousel: there is no
   second slide, and answering is optional — the district is already filled in
   from the poster, so leaving does not cost them anything.
------------------------------------------------------------- */
const qrSeen = () => LS.get("startSeen", []);

function markStartSeen(src) {
  const seen = qrSeen();
  if (src && !seen.includes(src)) LS.set("startSeen", [src, ...seen].slice(0, 12));
}

function skipStart() {
  markStartSeen(S.qrSource);
  location.hash = "#/";
}

function startTo(hash) {
  markStartSeen(S.qrSource);
  location.hash = hash;
}

function screenStart() {
  const src = QR_SOURCES[S.qrSource];
  const f = src ? fac(S.qrSource) : null;
  const dist = DISTRICTS.find((d) => d.id === (src ? src.district : S.district));

  /* Every number here is counted at render time. A poster that promises "96
     pharmacies" and shows a stale figure is worse than showing nothing. */
  const openPh = FACILITIES.filter((x) => x.type === "pharmacy" && status(x).k !== "shut").length;
  const freshMeds = MEDICINES.filter((m) => m.stock.some((st) => freshBand(freshMins(st)) !== "cold")).length;
  const verifiedDocs = DOCTORS.filter((d) => d.verified).length;

  const tile = (href, title, sub, badge, badgeCls, rail) => `
    <button class="surf-raise cham ${rail} pad-4 start-tile" onclick="startTo('${href}')">
      <div class="row-b" style="gap:12px">
        <span class="grow" style="text-align:start">
          <span class="q-h2">${title}</span>
          <span class="q-sub" style="display:block">${sub}</span></span>
        <span class="bdg ${badgeCls}">${badge}</span>
      </div></button>`;

  return `
  <div class="start-bar">
    <a class="brand" href="#/" onclick="skipStart()">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
    <button class="btn btn--3 btn--sm" onclick="skipStart()">${isAR() ? "تخطَّ" : "Skip"}${icon("close")}</button>
  </div>
  <section class="wrap" style="padding-top:6px">
    ${f ? `<div class="surf-sunk pad-3 row" style="gap:10px">
      <span class="qc-av qc-av-ph" style="width:34px;height:34px;font-size:13px">${esc(initial(L(f)))}</span>
      <span style="font-size:12.5px;line-height:1.6">${isAR() ? "مسحت الملصق في" : "Scanned at"} <b>${esc(L(f))}</b><br>
        <span class="muted">${dist ? esc(L(dist)) + (isAR() ? (dist.lm_ar ? " — " + esc(dist.lm_ar) : "") : (dist.lm_en ? " — " + esc(dist.lm_en) : "")) : ""}</span></span>
    </div>` : ""}

    <div style="margin-top:20px">
      <h1 class="q-h1">${isAR() ? "شنو تحتاج هالوكت؟" : "What do you need right now?"}</h1>
      <div class="q-sub" style="margin-top:2px">${isAR()
        ? "اختر واحداً — تكدر تغيّره بأي وقت." : "Pick one — you can change it any time."}</div>
    </div>

    <div class="stack-2" style="margin-top:14px">
      ${tile("#/search", isAR() ? "دوا معيّن" : "A specific medicine",
        isAR() ? "منو عنده الدوا هسّه — مؤكَّد بالساعة" : "Who has it now — confirmed by the hour",
        `<span class="num">${freshMeds}</span> ${isAR() ? "دواء مؤكَّد" : "confirmed"}`, "bdg-stock", "rail-stock")}
      ${tile("#/pharmacies", isAR() ? "صيدلية مفتوحة" : "An open pharmacy",
        isAR() ? "المفتوح الآن والخفارة الليلية" : "Open now and night duty",
        `<span class="num">${openPh}</span> ${isAR() ? "مفتوحة" : "open"}`, "bdg-t", "rail-open")}
      ${tile("#/needs", isAR() ? "دكتور" : "A doctor",
        isAR() ? "مرتّب حسب أقرب موعد، لا أقرب مسافة" : "Ranked by soonest slot, not nearest address",
        `<span class="num">${verifiedDocs}</span> ${t("verified")}`, "bdg-v", "")}
    </div>

    <div class="surf-flat pad-3 row-b" style="margin-top:16px;gap:10px">
      <span style="font-size:12.5px">${isAR() ? "منطقتك" : "Your area"}: <b>${dist ? esc(L(dist)) : ""}</b>
        <span class="muted">${src ? (isAR() ? "— من الملصق" : "— from the poster") : ""}</span></span>
      <button class="btn btn--3 btn--sm" onclick="openLocation()">${isAR() ? "تغيير" : "Change"}</button>
    </div>

    <div class="q-sub" style="margin-top:14px;text-align:center;font-size:11px">${isAR()
      ? "بلا حساب · بلا تسجيل · ما نحفظ شي عن صحتك"
      : "No account · no sign-up · nothing about your health is stored"}</div>

    <button class="rowb" style="width:100%;margin-top:14px;border-top:1px solid var(--dial-line-2);padding-top:14px;min-height:44px" onclick="pickRole()">
      <span class="t3">${isAR() ? "صيدلاني أو طبيب؟ عندك واجهة ثانية" : "Pharmacist or doctor? You have a different view"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "اختر دورك" : "Pick your role"}</span>
    </button>

    <a class="note note-e row-b" style="margin-top:14px;gap:10px" href="tel:${CONFIG.emergency.unified}">
      <span><b>${isAR() ? "طوارئ؟" : "Emergency?"}</b> ${isAR() ? "الرقم الموحد" : "Unified line"}</span>
      <b class="num">${CONFIG.emergency.unified}</b></a>
    <a class="row-b tiny emg-alt" href="tel:${CONFIG.emergency.ambulance}">
      <span class="muted">${isAR() ? "أو الإسعاف مباشرة" : "or the ambulance direct"}</span>
      <b class="num">${CONFIG.emergency.ambulance}</b></a>
  </section>
  <div style="height:26px"></div>`;
}

function screenNeeds() {
  return `${header({ back: true, title: isAR() ? "ما الذي تحتاجه؟" : "What do you need?" })}
  <section class="wrap sec">
    <div class="needs stagger">
      ${NEEDS.map((n) => {
        const c = needCount(n);
        return `<button class="need ${c ? "has" : ""}" onclick="pickNeed('${n.spec}')">
          <span class="ic">${icon(n.icon)}</span>
          <h3>${esc(L(n))}</h3>
          <div class="cnt">${c ? `<b class="num">${c}</b> ${isAR() ? "متاح الآن" : "available now"}` : (isAR() ? "لا أحد متاح الآن" : "none open now")}</div>
          ${ribbon(DOCTORS.find((d) => d.spec === n.spec) || DOCTORS[0], null, "ribbon--micro", true)}
        </button>`;
      }).join("")}
    </div>
    <div class="sec-h" style="margin-top:26px"><h2>${t("allSpecs")}</h2></div>
    <div class="chips chips--wrap">
      ${SPECIALTIES.map((s) => `<button class="chip" onclick="pickNeed('${s.id}')">${esc(L(s))}
        <span class="num muted">${DOCTORS.filter((d) => d.spec === s.id).length}</span></button>`).join("")}
    </div>
  </section>${nav("doctors")}`;
}

function screenDoctors(params) {
  const spec = params.get("spec");
  if (spec) S.filters.spec = spec;
  const q = params.get("q");
  const r = doctorsFor({ spec: S.filters.spec, q });
  const sp = S.filters.spec ? specOf(S.filters.spec) : null;
  const f = S.filters;
  return `${header({ back: true, title: sp ? L(sp) : t("doctors") })}
  <div class="filters">
    <div class="chips">
      <button class="chip chip--filter ${activeFilterCount() ? "on" : ""}" onclick="openFilters()">
        ${icon("filter")}${isAR() ? "تحديد" : "Refine"}${activeFilterCount() ? ` <span class="num fcount">${activeFilterCount()}</span>` : ""}</button>
      <button class="chip ${f.openNow ? "on" : ""}" onclick="tf('openNow')">${icon("clock")}${t("openNow")}</button>
      <button class="chip ${f.when === "today" ? "on" : ""}" onclick="setFilter('when', S.filters.when==='today'?null:'today')">${isAR() ? "اليوم" : "Today"}</button>
      <button class="chip ${f.gender === "f" ? "on" : ""}" onclick="tg('f')">${isAR() ? "طبيبة" : "Female"}</button>
      ${sp ? `<button class="chip on" onclick="S.filters.spec=null;render()">${esc(L(sp))} ${icon("close")}</button>`
           : `<button class="chip" onclick="location.hash='#/needs'">${t("allSpecs")}</button>`}
    </div>
  </div>
  <div class="res-head">
    <div class="res-n"><span class="num">${r.list.length}</span> ${t("results")}
      <span class="why">· ${isAR() ? "الأقرب موعداً أولاً" : "soonest first"}</span></div>
    <div class="tiny muted">${esc(approxNote() || L(here()))}</div>
  </div>
  ${r.expanded ? `<div class="radius-note">${icon("info")}<span>${isAR()
      ? `نتائج قليلة ضمن ${S.radius} كم من ${L(here())}؟ وسّعنا تلقائياً إلى 25 كم — أخبرناك، ولم نقرر عنك.`
      : `Thin results within ${S.radius} km of ${L(here())}? We widened to 25 km — telling you, not deciding for you.`}</span></div>` : ""}
  <section class="wrap"><div class="stack list-2 stagger">
    ${r.list.length ? (() => { const live = r.list.some((x) => x.st.k !== "shut"); return r.list.map((x) => doctorCard(x, live)).join(""); })() : emptyDoctors(sp)}
  </div>
  ${r.list.length && r.list.length < 6 ? `<div class="list-end">
    <p class="small muted">${isAR() ? "هذا كل ما لدينا في هذا الاختصاص قرب منطقتك." : "That's everything we have in this specialty near you."}</p>
    <button class="btn btn--2" onclick="pickNeed(null)">${icon("grid")}${isAR() ? "جرّب اختصاصاً آخر" : "Try another specialty"}</button>
    <button class="btn btn--3" onclick="openLocation()">${icon("pin")}${isAR() ? "غيّر منطقتي" : "Change my area"}</button>
  </div>` : ""}</section>
  <div style="height:24px"></div>${nav("doctors")}`;
}

function emptyDoctors(sp) {
  const alt = DISTRICTS.map((d) => {
    const saved = S.district; S.district = d.id;
    const n = doctorsFor({ spec: S.filters.spec, radius: 6 }).list.length;
    S.district = saved; return { d, n };
  }).filter((x) => x.n > 0 && x.d.id !== S.district).sort((a, b) => b.n - a.n).slice(0, 3);
  return `<div class="empty">
    <div class="empty-mark">${icon("pin")}</div>
    <h3>${isAR() ? `لا يوجد ${sp ? L(sp) : "طبيب"} مطابق في ${L(here())}` : `No matching ${sp ? L(sp) : "doctor"} in ${L(here())}`}</h3>
    <p>${isAR() ? "لكن هذه أقرب المناطق التي فيها أطباء متاحون." : "Here are the nearest areas that do have available doctors."}</p>
    <div class="empty-alts stack">
      ${alt.map((x) => `<button class="lane" onclick="setDistrict('${x.d.id}')">
        <span class="ic">${icon("pin")}</span>
        <span class="grow" style="text-align:start"><h3>${esc(L(x.d))}</h3>
          <p><span class="num">${x.n}</span> ${isAR() ? "طبيب" : "doctors"}</p></span>
        <span class="go">${icon("chev")}</span></button>`).join("")}
    </div>
    <button class="btn btn--2" style="margin-top:14px" onclick="S.filters={openNow:false,gender:null,spec:null};render()">
      ${icon("refresh")}${isAR() ? "أزل كل الفلاتر" : "Clear all filters"}</button>
  </div>`;
}

/* ---------------- v3 · DOCTOR · 4g ----------------
   The week as an engraved dial. Two practices, one shape: seven bands on the
   same 24-hour scale, jade for the hospital shift and brass for the private
   clinic. A patient reading it sees at a glance that "Tuesday evening" and
   "Tuesday morning" are different places at different prices — which is the
   single fact a directory listing hides and the reason this screen exists.
------------------------------------------------------------- */
function screenDoctor(id) {
  const d = DOCTORS.find((x) => x.id === id);
  if (!d) return screen404();
  const sp = specOf(d.spec), st = status(d), km = docDist(d);
  const facs = docFacs(d);
  const byFac = facs.map((f) => ({ f, ss: d.sessions.filter((x) => x.fac === f.id) }));
  const nx = st.k !== "shut" ? null : st.next;
  const fee = st.k !== "shut" && st.seg ? st.seg.s?.fee : (nx ? nx.s?.fee : d.sessions[0].fee);
  const gender = d.gender === "f" ? (isAR() ? "طبيبة" : "Female") : (isAR() ? "طبيب" : "Male");

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="shareDoctor('${d.id}')">${t("share")}</button>
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start;margin-top:26px">
      <span class="av" style="width:56px;height:56px;font-size:21px">${esc(initials(L(d)).charAt(0))}</span>
      <span class="grow">
        <h1 class="d2">${esc(L(d))}</h1>
        <div class="q-sub" style="margin-top:4px">${esc(L(sp))}${d.sub_ar && isAR() ? " — " + esc(d.sub_ar) : ""}</div>
      </span>
      ${d.verified ? `<span class="mark" style="width:44px;height:44px;font-size:10px">${isAR() ? "ختم" : "OK"}</span>` : ""}
    </div>

    <div class="row" style="margin-top:18px;gap:18px;flex-wrap:wrap">
      ${statusLabel(st, true)}
      <span class="t3"><span class="num">${fmtKm(km)}</span></span>
      ${fee !== null && fee !== undefined ? `<span class="t3"><span class="num">${money(fee)}</span></span>` : ""}
    </div>
  </section>

  <section class="pad" style="margin-top:32px">
    <div class="lab">${isAR() ? "شكل الأسبوع" : "The shape of the week"}</div>
    <div style="margin-top:18px">
      <div style="display:grid;grid-template-columns:44px 1fr;gap:12px 14px;align-items:center">
        ${DAY_ORDER.map((dy) => {
          const has = rawSegs(d, dy).length > 0;
          const today = dy === nowDay();
          return `<span class="t3" style="${today ? "font-weight:500;color:var(--ink)" : has ? "" : "opacity:.5"}">${dayName(dy)}</span>
            ${band(d, dy, today)}`;
        }).join("")}
      </div>
      <div class="axis" style="margin-top:10px;padding-inline-start:58px">00<span>08</span><span>16</span>24</div>
    </div>

    <div class="hr" style="margin:22px 0"></div>

    <div class="v3">
      ${byFac.map(({ f, ss }) => {
        const priv = f.type !== "hospital";
        const dist = DISTRICTS.find((x) => x.id === f.district);
        const feeSet = [...new Set(ss.map((x) => x.fee).filter((x) => x !== null && x !== undefined))];
        /* The same hours repeat across several days, so listing sessions
           verbatim prints "09:00 – 13:00" three times and never says which
           days — the one fact a patient is actually looking for. Group by
           the range and name the days against it. */
        const slots = [...ss.reduce((mp, x) => {
          const k = fmtRange(mins(x.f), mins(x.t));
          return mp.set(k, [...(mp.get(k) || []), x.d]);
        }, new Map())].map(([range, days]) => [range, days.sort((p, q) => DAY_ORDER.indexOf(p) - DAY_ORDER.indexOf(q))]);
        return `<div>
          <div class="row" style="gap:8px">
            <i style="width:10px;height:3px;background:var(--${priv ? "brass" : "jade"});border-radius:999px;flex:none"></i>
            <span class="t1" style="font-size:14px">${esc(L(f))}</span>
          </div>
          <div class="t3" style="margin-top:2px;padding-inline-start:18px">
            ${slots.map(([range, days]) =>
              `${days.map(dayName).join("، ")} · ${range}`).join("<br>")}
          </div>
          <div class="t3" style="margin-top:2px;padding-inline-start:18px">
            ${dist ? esc(L(dist)) + " · " : ""}<span class="num">${fmtKm(distTo(f))}</span>
            ${feeSet.length ? " · " + feeSet.map((x) => `<span class="num">${money(x)}</span>`).join(" / ") : ""}
          </div>
          <div class="row" style="margin-top:8px;padding-inline-start:18px">
            <a class="b-g" style="font-size:12px" href="${mapLink(f)}" target="_blank" rel="noopener">${t("directions")}</a>
          </div>
        </div>`;
      }).join("")}
    </div>
  </section>

  ${!d.accepting ? `<section class="pad" style="margin-top:22px"><div class="note note-w">
    <span>${t("notAccepting")}${d.pause_ar ? " — " + esc(isAR() ? d.pause_ar : d.pause_en) : ""}</span></div></section>` : ""}
  ${d.updated > 90 ? `<section class="pad" style="margin-top:12px"><div class="note note-w">
    <span>${isAR() ? "لم تُحدَّث هذه المعلومات منذ فترة طويلة. تحقق قبل ما تروح."
                   : "This information hasn't been updated in a while. Check before travelling."}</span></div></section>` : ""}

  <section class="pad" style="margin-top:26px">
    ${d.creds_ar?.length || d.exp ? `<div class="q-sub" style="max-width:44ch">${
      [d.creds_ar?.join(" · "), d.exp ? (isAR() ? `<span class="num">${d.exp}</span> سنة خبرة` : `<span class="num">${d.exp}</span> years' experience`) : "",
       gender, d.langs?.length ? d.langs.map((x) => ({ ar: isAR() ? "العربية" : "Arabic", en: isAR() ? "الإنجليزية" : "English", ku: isAR() ? "الكردية" : "Kurdish", tr: isAR() ? "التركية" : "Turkish" }[x])).join("، ") : ""]
        .filter(Boolean).map(esc).join(" · ")}</div>` : ""}
    <div class="rowb" style="margin-top:18px">
      <span class="t3">${isAR() ? "حُدّث قبل" : "updated"} <span class="num">${d.updated}</span> ${isAR() ? "يوم" : "d ago"}</span>
      <button class="b-g" style="font-size:12px" onclick="reportInfo()">${t("reportInfo")}</button>
    </div>
  </section>

  <section class="pad" style="margin-top:26px">
    <a class="rowb" href="#/partner/doctor/${d.id}">
      <span class="t3">${isAR() ? "هذا ملفك؟ شوف الطلب اللي ما وصلك" : "Is this your profile? See the demand you missed"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
  </section>

  <div class="actionbar">
    ${d.accepting
      ? `<button class="btn" onclick="openRequest('${d.id}')">${t("request")}</button>`
      : `<button class="btn" disabled>${t("notAccepting")}</button>`}
    ${d.wa ? `<a class="icon-btn" href="${waLink(d.wa, directMsg(d))}" target="_blank" rel="noopener" aria-label="${t("message")}">${icon("wa")}</a>` : ""}
    <a class="icon-btn" href="tel:+${d.phone}" aria-label="${t("call")}">${icon("phone")}</a>
  </div>
  <div style="height:80px"></div>`;
}

function screenPharmacies() {
  const openOnly = S.filters.openNow;
  let list = pharmaciesNear({ openOnly });
  if (S.phNight) list = list.filter((x) => x.f.night);
  if (S.phSvc) list = list.filter((x) => (x.f.services || []).includes(S.phSvc));
  const night = list.filter((x) => x.f.night);
  return `${header({ back: true, title: t("pharmacies") })}
  <div class="filters"><div class="chips">
    <button class="chip ${openOnly ? "on" : ""}" onclick="tf('openNow')">${icon("clock")}${t("openNow")}</button>
    <button class="chip ${S.phNight ? "on" : ""}" onclick="S.phNight=!S.phNight;render()">${icon("moon")}${t("nightDuty")} <span class="num">${night.length}</span></button>
    <button class="chip ${S.phSvc === "delivery" ? "on" : ""}" onclick="S.phSvc = S.phSvc==='delivery'?null:'delivery';render()">${icon("truck")}${isAR() ? "توصيل" : "Delivery"}</button>
  </div></div>
  <section class="wrap">
    <div class="map-peek" aria-hidden="true">
      ${list.slice(0, 7).map((x, i) => `<span class="pin" style="inset-inline-start:${12 + ((i * 37) % 76)}%;top:${18 + ((i * 29) % 60)}%"></span>`).join("")}
      <span class="pin me" style="inset-inline-start:48%;top:46%"></span>
      <span class="lbl">${esc(L(here()))} · <span class="num">${list.length}</span> ${isAR() ? "صيدلية" : "pharmacies"}</span>
    </div>
  </section>
  <div class="res-head"><span class="res-n"><span class="num">${list.length}</span> ${t("results")}</span>
    <span class="tiny muted">${esc(approxNote()) || (isAR() ? "المفتوح أولاً، ثم الأقرب" : "Open first, then nearest")}</span></div>
  <section class="wrap"><div class="stack list-2 stagger">
    ${list.length ? (() => { const live = list.some((x) => x.st.k !== "shut"); return list.map((x) => pharmacyCard(x, live)).join(""); })() : nightFallback()}
  </div></section>
  <div style="height:24px"></div>${nav("pharmacies")}`;
}

// Nothing open nearby is the 2am case — the moment this product matters most.
// It must hand over the nearest NIGHT-DUTY pharmacy, not report an empty list.
function nightFallback() {
  const duty = FACILITIES.filter((f) => f.type === "pharmacy" && f.night)
    .map((f) => ({ f, km: distTo(f), st: status(f) }))
    .sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  const soon = pharmaciesNear({}).filter((x) => x.st.k === "shut")
    .sort((a, b) => (a.st.next?.abs ?? 1e9) - (b.st.next?.abs ?? 1e9))[0];
  return `<div class="empty">
    <div class="empty-mark">${icon("moon")}</div>
    <h3>${isAR() ? "ماكو صيدلية مفتوحة قربك هسه" : "Nothing open near you right now"}</h3>
    <p>${isAR() ? "هذي أقرب صيدليات الخفارة الليلية — تشتغل طول الليل."
                : "These are the nearest night-duty pharmacies — open through the night."}</p>
    <div class="empty-alts stack">${duty.slice(0, 3).map((x) => pharmacyCard(x)).join("")}</div>
    ${soon ? `<p class="small muted" style="margin-top:18px">${isAR() ? "وأقرب وحدة تفتح" : "Nearest opening"}: ${esc(L(soon.f))} · ${fmtTi(soon.st.next.f)}</p>` : ""}
  </div>`;
}

/* ---------------- v3 · PHARMACY ----------------
   A pharmacy's value here is not its address — Google Maps has that. It is
   what it has confirmed it holds, and how recently. So the screen leads with
   confirmed stock, freshest first, and only then explains where and when.
------------------------------------------------------------- */
function screenPharmacy(id) {
  const f = fac(id); if (!f) return screen404();
  const st = status(f), km = distTo(f);
  const dist = DISTRICTS.find((d) => d.id === f.district);
  const prods = PRODUCTS.filter((x) => x.stock.includes(f.id));
  const meds = MEDICINES.filter((m) => m.stock.some((x) => x.f === f.id))
    .map((m) => ({ m, mins: freshMins(m.stock.find((x) => x.f === f.id)) }))
    .sort((x, y) => x.mins - y.mins);
  const fresh = meds.filter((x) => freshBand(x.mins) !== "cold");

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="toggleSave('f:${f.id}')">${
        S.saved.includes("f:" + f.id) ? (isAR() ? "محفوظة" : "Saved") : (isAR() ? "احفظ" : "Save")}</button>
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start;margin-top:26px">
      <span class="av" style="width:56px;height:56px;font-size:21px">${esc(initial(L(f)))}</span>
      <span class="grow">
        <h1 class="d2">${esc(L(f))}</h1>
        <div class="q-sub" style="margin-top:4px">${t("pharmacy")}${dist ? " — " + esc(L(dist)) : ""}${
          isAR() ? (dist?.lm_ar ? "، " + esc(dist.lm_ar) : "") : (dist?.lm_en ? ", " + esc(dist.lm_en) : "")}</div>
      </span>
      ${f.verified ? `<span class="mark" style="width:44px;height:44px;font-size:10px">${isAR() ? "ختم" : "OK"}</span>` : ""}
    </div>

    <div class="row" style="margin-top:18px;gap:18px;flex-wrap:wrap">
      ${statusLabel(st, true)}
      <span class="t3"><span class="num">${fmtKm(km)}</span></span>
      ${f.night ? `<span class="st st-t">${isAR() ? "خفارة ليلية" : "Night duty"}</span>` : ""}
      <span class="t3">${updatedLine(f)}</span>
    </div>
    <div style="margin-top:16px">${band(f)}</div>
    ${axis24()}
  </section>

  ${fresh.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "أكّدت توفّرها" : "Confirmed in stock"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "الأحدث تأكيداً أولاً — وهذا سبب اختيار هذي الصيدلية بالذات."
      : "Freshest confirmation first — this is the reason to pick this one."}</div>
    ${fresh.slice(0, 6).map((x) => `<a class="rw" href="#/med/${x.m.id}">
      <span class="rw-lead" style="background:var(--${freshBand(x.mins) === "hot" ? "brass" : "jade"})"></span>
      <span class="av">${esc(L(x.m).charAt(0))}</span>
      <span class="grow">
        <span class="d3" style="display:block">${esc(L(x.m))}</span>
        <span class="q-sub" style="display:block">${esc(x.m.form || "")}</span>
        <span class="row" style="margin-top:9px"><span class="st st-t">${
          freshBand(x.mins) === "hot" ? `<i class="dot dot-live"></i>` : `<i class="dot"></i>`}${freshLabel(x.mins)}</span></span>
      </span></a>`).join('<div class="hr"></div>')}
    ${meds.length > fresh.length ? `<div class="t3" style="margin-top:14px">${isAR()
      ? `و<span class="num">${meds.length - fresh.length}</span> غيرها بتأكيد أقدم من ثلاثة أيام — لا نعدّها توفّراً.`
      : `and <span class="num">${meds.length - fresh.length}</span> more confirmed over three days ago — we don't count those as stock.`}</div>` : ""}
  </section>` : `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "التوفّر" : "Stock"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "ما عدنا تأكيد توفّر حديث من هذي الصيدلية. اسألهم مباشرة — وأول جواب يفيد اللي بعدك."
      : "No recent stock confirmation from this pharmacy. Ask them directly — the first answer helps the next person."}</div>
  </section>`}

  <section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "الدوام خلال الأسبوع" : "Weekly hours"}</div>
    <div style="margin-top:18px">
      <div style="display:grid;grid-template-columns:44px 1fr;gap:12px 14px;align-items:center">
        ${DAY_ORDER.map((dy) => {
          const today = dy === nowDay();
          const works = rawSegs(f, dy).length > 0;
          return `<span class="t3" style="${today ? "font-weight:500;color:var(--ink)" : works ? "" : "opacity:.5"}">${dayName(dy)}</span>
            ${band(f, dy, today)}`;
        }).join("")}
      </div>
      <div class="axis" style="margin-top:10px;padding-inline-start:58px">00<span>08</span><span>16</span>24</div>
    </div>
  </section>

  ${(f.services || []).length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "الخدمات" : "Services"}</div>
    <div class="chips chips--wrap" style="margin-top:12px">${(f.services || []).map((sv) =>
      `<span class="chip">${svcLabel(sv)}</span>`).join("")}</div>
  </section>` : ""}

  ${prods.length ? `<section class="pad" style="margin-top:30px">
    <div class="rowb"><span class="lab">${isAR() ? "متوفّر في هذه الصيدلية" : "Also stocked here"}</span>
      <a class="b-g" style="font-size:12px" href="#/care">${isAR() ? "الكل" : "All"}</a></div>
    ${prods.slice(0, 4).map((x) => `<a class="rw" href="#/product/${x.id}">
      <span class="av">${esc(L(x).charAt(0))}</span>
      <span class="grow">
        <span class="d3" style="display:block">${esc(L(x))}</span>
        <span class="q-sub" style="display:block">${esc(x.brand || "")}</span>
      </span>
      <span class="t3 num" style="align-self:center">${money(x.price)}</span></a>`).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin-top:30px">
    <a class="rowb" href="#/partner/${f.id}">
      <span class="t3">${isAR() ? "هذي صيدليتك؟ شوف الطلب اللي ضاع بمنطقتك" : "Is this your pharmacy? See the demand your area lost"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
    <div class="rowb" style="margin-top:14px;border-top:1px solid var(--dial-line-2);padding-top:14px">
      <span class="t3">${updatedLine(f)}</span>
      <button class="b-g" style="font-size:12px" onclick="reportInfo()">${t("reportInfo")}</button>
    </div>
  </section>

  <div class="actionbar">
    ${f.wa ? `<a class="btn btn--wa" href="${waLink(f.wa, isAR() ? "السلام عليكم، عندكم..." : "Hello, do you have...")}" target="_blank" rel="noopener">${isAR() ? "اسأل عبر واتساب" : "Ask on WhatsApp"}</a>`
      : `<a class="btn" href="tel:+${f.phone}">${t("call")}</a>`}
    <a class="icon-btn" href="tel:+${f.phone}" aria-label="${t("call")}">${icon("phone")}</a>
    <a class="icon-btn" href="${mapLink(f)}" target="_blank" rel="noopener" aria-label="${t("directions")}">${icon("nav")}</a>
  </div>
  <div style="height:80px"></div>`;
}

function screenCare(cat) {
  const list = cat ? PRODUCTS.filter((p) => p.cat === cat) : PRODUCTS;
  const c = CARE_CATEGORIES.find((x) => x.id === cat);
  return `${header({ back: !!cat, title: c ? L(c) : "" })}
  ${!cat ? `<section class="wrap" style="padding-top:20px">
    <h1 class="hero-line" style="font-size:26px">${isAR() ? "رفوف الصيدليات القريبة منك." : "The shelves of the pharmacies near you."}</h1>
    <p class="hero-sub">${isAR() ? "كل منتج يُطلب من صيدلية حقيقية قريبة — لا سلة ولا دفع." : "Every product is ordered from a real nearby pharmacy — no cart, no payment."}</p>
  </section>
  <section class="wrap sec"><div class="grid-2 stagger">
    ${CARE_CATEGORIES.map((x) => `<a class="need" href="#/care/${x.id}" style="text-align:start">
      <span class="ic">${icon(x.icon)}</span><h3>${esc(L(x))}</h3>
      <div class="cnt"><span class="num">${PRODUCTS.filter((p) => p.cat === x.id).length}</span> ${isAR() ? "منتج" : "products"}</div></a>`).join("")}
  </div></section>` : ""}
  <section class="wrap ${cat ? "sec" : ""}">
    ${cat ? "" : `<div class="sec-h"><h2>${isAR() ? "الأكثر طلباً" : "Most requested"}</h2></div>`}
    <div class="grid-2 stagger">${(cat ? list : list.slice(0, 6)).map(productCard).join("")}</div>
  </section>
  <div style="height:24px"></div>${nav("care")}`;
}

function screenProduct(id) {
  const p = PRODUCTS.find((x) => x.id === id); if (!p) return screen404();
  const stock = p.stock.map(fac).map((f) => ({ f, km: distTo(f), st: status(f) }))
    .sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  const best = stock[0];
  return `${header({ back: true, title: "" })}
  <section class="wrap" style="padding-top:14px">
    <div class="prod-img ch" style="--chamfer-size:20px;aspect-ratio:16/10">${icon(CARE_CATEGORIES.find((c) => c.id === p.cat)?.icon || "pill", "glyph")}</div>
    <h1 class="prof-name" style="margin-top:16px">${esc(L(p))}</h1>
    <div class="prof-spec">${esc(p.brand)}</div>
    <div class="row" style="margin-top:10px;gap:10px">
      <span class="prod-p num" style="font-size:20px">${money(p.price)}</span>
      <span class="chip chip--meta chip--ok">${esc(L(CARE_CATEGORIES.find((c) => c.id === p.cat)))}</span>
    </div>
  </section>
  <section class="blk" style="margin-top:16px"><h3>${isAR() ? "لماذا يُستعمل" : "What it's for"}</h3><p class="small">${esc(p.for_ar)}</p></section>
  <section class="blk"><h3>${isAR() ? "طريقة الاستعمال" : "How to use"}</h3><p class="small">${esc(p.use_ar)}</p></section>
  ${p.warn_ar.length ? `<section class="blk"><h3>${isAR() ? "تنبيهات" : "Warnings"}</h3>
    <div class="stack">${p.warn_ar.map((w) => `<div class="banner banner--warn">${icon("alert")}<span>${esc(w)}</span></div>`).join("")}</div></section>` : ""}
  <section class="blk">
    <h3>${t("stockedBy")}</h3>
    <div class="stack">${stock.slice(0, 4).map((x) => pharmacyCard(x)).join("")}</div>
  </section>
  <div class="actionbar">
    <a class="btn btn--wa" href="${best.f.wa ? waLink(best.f.wa, productMsg(p, best.f)) : "#"}" target="_blank" rel="noopener">
      ${icon("wa")}${t("orderWa")} — ${esc(L(best.f))}</a>
  </div>${nav("care")}`;
}

function screenSearch() {
  const q = LS.get("q", "");
  return `${header({ back: true, title: "" })}
  <section class="wrap" style="padding-top:6px">
    <div class="search-field">${icon("search")}
      <input id="q" value="${esc(q)}" placeholder="${t("searchPh")}" oninput="doSearch(this.value)" autocomplete="off">
      <button class="clear-btn" onclick="doSearch('');document.getElementById('q').value='';document.getElementById('q').focus()" aria-label="${isAR() ? "مسح البحث" : "Clear search"}">${icon("close")}</button></div>
  </section>
  <section class="wrap sec" id="sres">${searchResults(q)}</section>${nav("home")}`;
}

function searchResults(q) {
  if (!q || !q.trim()) {
    return `<div class="hint" style="margin-bottom:16px">${icon("info")}<span>${isAR()
        ? "نفهم «اسنان» و«أسنان» و«سنّي» — اكتب كما تشاء."
        : "We match Arabic spellings loosely — write it however you like."}</span></div>
      <div class="res-group"><h3>${isAR() ? "ابدأ من حاجتك" : "Start from your need"}</h3>
      <div class="chips chips--wrap">${NEEDS.slice(0, 8).map((n) => `<button class="chip" onclick="pickNeed('${n.spec}')">${icon(n.icon)}${esc(L(n))}</button>`).join("")}</div></div>
      <div class="res-group"><h3>${isAR() ? "الأكثر بحثاً" : "Most searched"}</h3>
        <div class="chips chips--wrap">${(isAR()
          ? ["طبيب أطفال", "صيدلية مناوبة", "طبيبة نسائية", "جلدية", "وجع أسنان", "فيتامين د", "واقي شمس"]
          : ["Pediatrician", "Night pharmacy", "Gynecologist", "Dermatology", "Tooth pain", "Vitamin D", "Sunscreen"])
          .map((q) => `<button class="chip" onclick="runSearch('${esc(q)}')">${esc(q)}</button>`).join("")}</div></div>
      ${S.recent.length ? `<div class="res-group"><h3>${isAR() ? "بحثك السابق" : "Recent"}</h3>
        <div class="chips chips--wrap">${S.recent.slice(0, 6).map((r, i) => `<button class="chip" onclick="runRecent(${i})">${esc(r)}</button>`).join("")}</div></div>` : ""}`;
  }
  const nq = norm(q);
  const pq = parseQuery(q);
  const P = pq ? applyParsed(pq) : null;

  // A parsed query answers directly instead of listing weak text matches.
  if (P && (P.spec || P.district || P.gender || P.openNow || P.kind)) {
    const head = parsedChips(pq, q);
    if (P.kind === "pharmacy") {
      let list = pharmaciesNear({ openNow: P.openNow });
      if (P.district) list = list.filter((x) => x.f.district === P.district);
      return head + (list.length
        ? `<div class="res-group"><h3>${t("pharmacies")} · <span class="num">${list.length}</span></h3>
             <div class="stack">${list.slice(0, 8).map(pharmacyCard).join("")}</div></div>`
        : nightFallback());
    }
    if (P.kind === "medicine") {
      const meds = pq.rest.length ? medMatches(pq.rest.join(" ")) : MEDICINES;
      return head + `<div class="res-group"><h3>${isAR() ? "أدوية" : "Medicines"}</h3>
        <div class="stack">${meds.slice(0, 8).map(medRow).join("")}</div></div>`;
    }
    // default: doctors, filtered by everything we understood
    const saved = { ...S.filters };
    S.filters = { ...S.filters, spec: P.spec, gender: P.gender, openNow: P.openNow, district: P.district };
    const r = doctorsFor({ spec: P.spec });
    S.filters = saved;
    return head + (r.list.length
      ? `<div class="res-group"><h3>${t("doctors")} · <span class="num">${r.list.length}</span>
           <span class="muted" style="font-weight:400">· ${isAR() ? "الأقرب موعداً أولاً" : "soonest first"}</span></h3>
         <div class="stack">${(() => { const live = r.list.slice(0, 8).some((x) => x.st.k !== "shut"); return r.list.slice(0, 8).map((x) => doctorCard(x, live)).join(""); })()}</div></div>`
      : zeroWithWayOut(P));
  }

  const docs = DOCTORS.filter((d) => norm(L(d)).includes(nq) || specMatch(d.spec, nq)).slice(0, 6);
  const specs = SPECIALTIES.filter((s) => [s.ar, s.en, ...s.alias].some((a) => norm(a).includes(nq))).slice(0, 5);
  const phs = FACILITIES.filter((f) => f.type === "pharmacy" && norm(L(f)).includes(nq)).slice(0, 4);
  const hos = FACILITIES.filter((f) => f.type !== "pharmacy" && norm(L(f)).includes(nq)).slice(0, 4);
  const prs = PRODUCTS.filter((p) => norm(L(p) + " " + p.brand).includes(nq)).slice(0, 4);
  const meds = medMatches(q).slice(0, 4);
  const none = !docs.length && !specs.length && !phs.length && !hos.length && !prs.length && !meds.length;
  if (none) {
    const guess = findSpecByQuery(q);
    return `<div class="empty">
      ${emptyGlyph()}
      <div class="empty-t">${isAR() ? `ما لگينا «${esc(q)}» بعد` : `Nothing for "${esc(q)}" yet`}</div>
      <div class="empty-b">${isAR() ? "سجّلنا بحثك — نضيف الناقص أسبوعياً. جرّب وحدة من هذي:"
                  : "We logged it — we add what's missing weekly. Try one of these:"}</div>
      <div class="empty-alts stack">
        ${guess ? `<button class="lane" onclick="pickNeed('${guess.id}')"><span class="ic">${icon("stetho")}</span>
          <span class="grow" style="text-align:start"><h3>${esc(L(guess))}</h3>
            <p>${isAR() ? "أقرب اختصاص لبحثك" : "closest specialty to your search"}</p></span>${icon("chev")}</button>` : ""}
        <button class="lane" onclick="location.hash='#/needs'"><span class="ic">${icon("grid")}</span>
          <span class="grow" style="text-align:start"><h3>${isAR() ? "تصفّح حسب الحاجة" : "Browse by need"}</h3>
            <p>${isAR() ? "12 حاجة شائعة" : "12 common needs"}</p></span>${icon("chev")}</button>
        <button class="lane" onclick="openLocation()"><span class="ic">${icon("pin")}</span>
          <span class="grow" style="text-align:start"><h3>${isAR() ? "شوف نتائج بغداد كلها" : "Search all of Baghdad"}</h3>
            <p>${isAR() ? "بدل " + esc(L(here())) + " بس" : "instead of just " + esc(L(here()))}</p></span>${icon("chev")}</button>
      </div></div>`;
  }
  const G = (title, body) => body ? `<div class="res-group"><h3>${title}</h3><div class="stack">${body}</div></div>` : "";
  // Medicines lead: "who has this" is the most urgent question a search can carry.
  return G(isAR() ? "أدوية — منو عنده؟" : "Medicines — who has it?", meds.map(medRow).join(""))
    + G(t("doctors"), docs.map((d) => doctorCard({ d, km: docDist(d), st: status(d) })).join(""))
    + G(isAR() ? "اختصاصات" : "Specialties", specs.map((s) => `<button class="lane" onclick="pickNeed('${s.id}')"><span class="ic">${icon("stetho")}</span>
        <span class="grow" style="text-align:start"><h3>${esc(L(s))}</h3><p><span class="num">${DOCTORS.filter((d) => d.spec === s.id).length}</span> ${isAR() ? "طبيب" : "doctors"}</p></span>
        <span class="go">${icon("chev")}</span></button>`).join(""))
    + G(t("pharmacies"), phs.map((f) => pharmacyCard({ f, km: distTo(f), st: status(f) })).join(""))
    + G(isAR() ? "مستشفيات ومراكز" : "Hospitals & centres", hos.map((f) => `<a class="lane" href="#/hospital/${f.id}"><span class="ic">${icon("building")}</span>
        <span class="grow"><h3>${esc(L(f))}</h3><p>${esc(L(DISTRICTS.find((d) => d.id === f.district)))} · ${fmtKm(distTo(f))}</p></span>
        <span class="go">${icon("chev")}</span></a>`).join(""))
    + G(t("care"), prs.length ? `<div class="grid-2">${prs.map(productCard).join("")}</div>` : "");
}

function screenHospitals() {
  const list = FACILITIES.filter((f) => f.type !== "pharmacy").map((f) => ({ f, km: distTo(f) })).sort((a, b) => a.km - b.km);
  const er = list.filter((x) => x.f.er);
  return `${header({ back: true, title: isAR() ? "المستشفيات" : "Hospitals" })}
  <section class="wrap sec">
    <div class="banner banner--stop">${icon("alert")}<span>${isAR()
      ? `للحالات الطارئة اتصل بالرقم الموحد <b class="num">${CONFIG.emergency.unified}</b> — أو الإسعاف <b class="num">${CONFIG.emergency.ambulance}</b>.`
      : `In an emergency call <b class="num">${CONFIG.emergency.unified}</b> — or the ambulance on <b class="num">${CONFIG.emergency.ambulance}</b>.`}</span></div>
    <div class="sec-h" style="margin-top:20px"><h2>${isAR() ? "طوارئ مفتوحة الآن" : "Emergency rooms open now"}</h2></div>
    <div class="stack list-2">${er.map((x) => hospitalRow(x)).join("")}</div>
    <div class="sec-h" style="margin-top:24px"><h2>${isAR() ? "كل المستشفيات والمراكز" : "All hospitals & centres"}</h2></div>
    <div class="stack list-2">${list.filter((x) => !x.f.er).map((x) => hospitalRow(x)).join("")}</div>
  </section><div style="height:24px"></div>${nav("doctors")}`;
}

function hospitalRow(x) {
  const n = DOCTORS.filter((d) => d.sessions.some((s) => s.fac === x.f.id)).length;
  return `<a class="card ${x.f.er ? "is-open" : ""}" href="#/hospital/${x.f.id}">
    <div class="card-top"><div class="avatar avatar--sq">${icon("building")}</div>
      <div class="grow"><div class="card-t">${esc(L(x.f))}</div>
        <div class="card-meta">${x.f.verified ? `<span class="seal">${icon("seal")}${t("verified")}</span><i class="dot"></i>` : ""}
          <span class="dist">${icon("pin")}${fmtKm(x.km)}</span><i class="dot"></i>
          <span><span class="num">${n}</span> ${isAR() ? "طبيب" : "doctors"}</span></div></div>
      ${x.f.er ? `<span class="chip chip--meta chip--warn">${isAR() ? "طوارئ ٢٤ ساعة" : "24h ER"}</span>` : ""}
    </div></a>`;
}

function screenHospital(id) {
  const f = fac(id); if (!f) return screen404();
  const docs = DOCTORS.filter((d) => d.sessions.some((s) => s.fac === f.id));
  const deps = [...new Set(docs.map((d) => d.spec))];
  return `${header({ back: true, title: "" })}
  <section class="prof-head">
    <div class="row" style="align-items:flex-start;gap:14px">
      <div class="avatar prof-avatar avatar--sq">${icon("building")}</div>
      <div class="grow"><h1 class="prof-name">${esc(L(f))}</h1>
        <div class="prof-spec">${t(f.type)} · ${esc(L(DISTRICTS.find((d) => d.id === f.district)))}</div>
        <div class="card-meta" style="margin-top:7px">${sealBadge(f)}<i class="dot"></i>${updatedLine(f)}</div></div>
    </div>
    ${f.er ? `<div class="banner banner--stop" style="margin-top:14px">${icon("alert")}
      <span>${isAR() ? "طوارئ تعمل ٢٤ ساعة" : "Emergency department open 24h"} · <span class="num">${CONFIG.emergency.unified}</span></span></div>` : ""}
    <div class="prof-facts">
      <div class="prof-fact"><div class="k">${isAR() ? "المسافة" : "Distance"}</div><div class="v">${fmtKm(distTo(f))}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "الأطباء" : "Doctors"}</div><div class="v num">${docs.length}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "الأقسام" : "Departments"}</div><div class="v num">${deps.length}</div></div>
    </div>
  </section>
  <section class="blk"><h3>${isAR() ? "الأقسام" : "Departments"}</h3>
    <div class="chips chips--wrap">${deps.map((s) => `<button class="chip" onclick="pickNeed('${s}')">${esc(L(specOf(s)))}</button>`).join("")}</div></section>
  <section class="blk"><h3>${isAR() ? "أطباء يداومون هنا" : "Doctors who practise here"}</h3>
    <div class="stack">${docs.map((d) => doctorCard({ d, km: distTo(f), st: status(d) })).join("")}</div></section>
  <div class="actionbar">
    <a class="btn" href="${mapLink(f)}" target="_blank" rel="noopener">${icon("nav")}${t("directions")}</a>
    <a class="icon-btn" href="tel:+${f.phone}">${icon("phone")}</a>
  </div>${nav("doctors")}`;
}

/* ---------------- MY REQUESTS ----------------
   The receipt drawer. Each entry shows the state we can actually justify —
   opened / you-sent-it / not-sent — never "delivered" and never "confirmed".
   Every entry stays actionable: reopen the chat, call, or get directions,
   because the most common reason to come back here is that nobody replied.
------------------------------------------------------------- */
function screenMe() {
  const reqs = S.requests || [];
  const stale = (r) => Date.now() - (r.ts || 0) > 864e5;   // older than a day

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="location.hash='#/trust'">${isAR() ? "كيف نتحقق" : "How we verify"}</button>
    </div>
    <div class="lab" style="margin-top:28px">${t("myRequests")}</div>
    <h1 class="d2" style="margin-top:8px">${reqs.length
      ? (isAR() ? countAr(reqs.length, ["طلب واحد", "طلبان", "طلبات", "طلباً"]) : `${reqs.length} request${reqs.length === 1 ? "" : "s"}`)
      : (isAR() ? "لا توجد طلبات بعد" : "No requests yet")}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "محفوظة على هذا الجهاز فقط. بلا حساب، وبلا رقمك."
      : "Saved on this device only. No account, and we never take your number."}</div>
  </section>

  ${reqs.length ? `<section class="pad" style="margin-top:26px">
    ${reqs.map((r) => {
      const st = REQ_STATE[r.state] || REQ_STATE.opened;
      return `<div class="rw${stale(r) ? " quiet" : ""}">
        ${r.state === "sent" ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
        <span class="av mono" style="font-size:12px;letter-spacing:.04em">${esc(r.ref)}</span>
        <span class="grow">
          <span class="rowb"><span class="d3">${esc(r.doctor)}</span>
            <span class="st ${st.cls}"><i class="dot"></i>${esc(isAR() ? st.ar : st.en)}</span></span>
          <span class="q-sub" style="display:block">${esc(r.facility)} · ${esc(r.when)}</span>
          <span class="t3" style="display:block;margin-top:4px"><span class="num">${esc(r.at)}</span></span>
          <span class="row" style="gap:14px;margin-top:10px;flex-wrap:wrap">
            ${r.wa ? `<a class="b-g" style="font-size:12.5px" href="https://wa.me/${esc(r.wa)}" target="_blank" rel="noopener"
              onclick="markRequest('${esc(r.ref)}','opened')">${isAR() ? "افتح المحادثة" : "Open chat"}</a>` : ""}
            ${r.phone ? `<a class="b-g" style="font-size:12.5px" href="tel:+${esc(r.phone)}">${t("call")}</a>` : ""}
            ${r.mapUrl ? `<a class="b-g" style="font-size:12.5px" href="${esc(r.mapUrl)}" target="_blank" rel="noopener">${t("directions")}</a>` : ""}
            ${r.state !== "sent" ? `<button class="b-g" style="font-size:12.5px" onclick="markRequest('${esc(r.ref)}','sent')">${isAR() ? "أرسلتها" : "I sent it"}</button>` : ""}
          </span>
        </span></div>`;
    }).join('<div class="hr"></div>')}
    <div class="t3" style="margin-top:18px;border-top:1px solid var(--dial-line-2);padding-top:14px">${isAR()
      ? "«أرسلتها» يعني أنك أخبرتنا — ما نكدر نشوف واتساب ولا نأكد وصول الرسالة."
      : "\"You sent it\" means you told us so — we cannot see inside WhatsApp or confirm delivery."}</div>
  </section>` : `<section class="pad" style="margin-top:30px">
    <div class="v2">
      <a class="btn" href="#/needs">${isAR() ? "ابحث عن طبيب" : "Find a doctor"}</a>
      <a class="btn btn--2" href="#/search">${isAR() ? "دوّر على دواء" : "Look for a medicine"}</a>
    </div>
    <div class="t3" style="margin-top:16px">${isAR()
      ? "عند إرسال طلب موعد يبقى إيصاله هنا برمزه، حتى تعرف أي عيادة ردّت."
      : "When you send a request, its stub stays here with a code, so you know which clinic replied."}</div>
  </section>`}

  ${S.saved.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${t("savedItems")}</div>
    ${(() => {
      const rows = S.saved.map((k) => {
        const [ty, id] = k.split(":");
        if (ty === "d") { const d = DOCTORS.find((x) => x.id === id); return d ? { st: status(d), html: (live) => doctorCard({ d, km: docDist(d), st: status(d) }, live) } : null; }
        const f = fac(id); return f ? { st: status(f), html: (live) => pharmacyCard({ f, km: distTo(f), st: status(f) }, live) } : null;
      }).filter(Boolean);
      const live = rows.some((x) => x.st.k !== "shut");
      return rows.map((x) => x.html(live)).join('<div class="hr"></div>');
    })()}
  </section>` : ""}

  ${S.watch?.length || LS.get("watch", []).length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "أدوية تتابعها" : "Medicines you follow"}</div>
    ${LS.get("watch", []).map(medById).filter(Boolean).map((m) => {
      const c = pharmaciesForMed(m).confirmed.filter((x) => x.band !== "cold");
      return `<a class="rw" href="#/med/${m.id}">
        ${c.length ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
        <span class="av">${esc(L(m).charAt(0))}</span>
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(m))}</span>
          <span class="q-sub" style="display:block">${c.length
            ? (isAR() ? `متوفّر الآن — ${esc(L(c[0].f))}` : `Available now — ${esc(L(c[0].f))}`)
            : (isAR() ? "لسّه ما توفّر" : "Still unavailable")}</span>
        </span></a>`;
    }).join('<div class="hr"></div>')}
  </section>` : ""}

  <div style="height:26px"></div>${nav("home")}`;
}

function screenTrust() {
  return `${header({ back: true, title: t("trust") })}
  <section class="wrap sec">
    <h1 class="hero-line" style="font-size:25px">${isAR() ? "نعرض ما تحققنا منه فقط." : "We only show what we've checked."}</h1>
    <div class="stack" style="margin-top:20px">
      <div class="lane"><span class="ic">${icon("seal")}</span><span class="grow"><h3>${t("verified")}</h3>
        <p>${isAR() ? "تأكدنا من الهوية والاختصاص وجهة العمل ورقم الواتساب." : "Identity, specialty, affiliation and WhatsApp number confirmed."}</p></span></div>
      <div class="lane"><span class="ic">${icon("info")}</span><span class="grow"><h3>${t("listed")}</h3>
        <p>${isAR() ? "معلومات من مصادر عامة، لم نؤكدها بعد. تظهر بدون ختم." : "Publicly sourced, not yet confirmed. Shown without a seal."}</p></span></div>
      <div class="lane"><span class="ic">${icon("refresh")}</span><span class="grow"><h3>${isAR() ? "تاريخ التحديث" : "Last updated"}</h3>
        <p>${isAR() ? "كل صفحة تعرض متى حُدّثت. بعد ٩٠ يوماً ننبّهك." : "Every page shows its update date. After 90 days we warn you."}</p></span></div>
      <div class="lane"><span class="ic">${icon("flag")}</span><span class="grow"><h3>${t("reportInfo")}</h3>
        <p>${isAR() ? "زر في كل صفحة. البلاغات تصل فريق التحقق مباشرة." : "A button on every page. Reports go straight to the verification team."}</p></span></div>
    </div>
    <div class="banner banner--info" style="margin-top:18px">${icon("info")}<span>${isAR()
      ? "لا نعرض تقييمات أو نجوماً. بدون عدد كافٍ من التقييمات الحقيقية فهي إما فارغة أو مضللة."
      : "We show no ratings or stars. Without real volume they are either empty or gamed."}</span></div>
    <div class="banner banner--warn" style="margin-top:10px">${icon("alert")}<span>${isAR()
      ? `${L(CONFIG.brand)} لا يقدّم استشارة طبية ولا تشخيصاً. للحالات الطارئة اتصل بالرقم الموحد ${CONFIG.emergency.unified}.`
      : `${L(CONFIG.brand)} does not provide medical advice or diagnosis. In an emergency call ${CONFIG.emergency.unified}.`}</span></div>
    <div class="banner banner--info" style="margin-top:10px">${icon("check")}<span>${isAR()
      ? "بدون حساب، بدون كلمة مرور، ولا نحتفظ بأي بيانات صحية. طلبك يذهب مباشرة إلى العيادة عبر واتساب."
      : "No account, no password, no health data stored. Your request goes straight to the clinic over WhatsApp."}</span></div>
    <p class="tiny muted" style="margin-top:18px">${isAR() ? "البيانات المعروضة في هذا النموذج توضيحية. أرقام الهواتف غير حقيقية." : "Data in this prototype is illustrative. Phone numbers are not real."}</p>
    <div class="btn-row" style="margin-top:14px">
      <a class="btn btn--3" href="#/hospitals">${icon("building")}${isAR() ? "المستشفيات" : "Hospitals"}</a>
      <a class="btn btn--3" href="#/me">${icon("user")}${t("myRequests")}</a>
      <a class="btn btn--3" href="#/admin">${icon("grid")}${isAR() ? "لوحة التحكم" : "Admin"}</a>
    </div>
  </section>${nav("home")}`;
}

/* The failure the user actually hits is not a 404 — it is a route that throws.
   Before this, render() left the previous screen on the glass, so a tap simply
   appeared to do nothing, which reads as "this app is broken" with no way out.
   State it, take the blame, and always leave two doors open. */
function screenError(err) {
  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
    <div class="lab" style="margin-top:28px">${isAR() ? "خطأ" : "Error"}</div>
    <div class="rowb" style="margin-top:14px">
      <span class="q-sub">${isAR()
        ? "ما كدرنا نجيب النتائج.<br><span class=\"t3\">الخلل عدنا، مو عندك.</span>"
        : "We couldn't load that.<br><span class=\"t3\">That's on us, not on you.</span>"}</span>
      <button class="btn btn--2 btn--sm" style="width:auto" onclick="render()">${isAR() ? "إعادة" : "Retry"}</button>
    </div>
    <div class="hr" style="margin:26px 0"></div>
    <a class="b-g" href="#/">${isAR() ? "الرئيسية" : "Home"}</a>
    ${err && CONFIG.debug ? `<pre class="t3" dir="ltr" style="margin-top:14px;white-space:pre-wrap">${esc(String(err && err.stack || err))}</pre>` : ""}
  </section>${nav("home")}`;
}

function screen404() {
  return `${header({ back: true, title: "" })}
  <div class="empty" style="padding-top:60px">
    <div class="empty-mark">${icon("pin")}</div>
    <h3>${isAR() ? "لم نصل إلى هنا بعد" : "We're not here yet"}</h3>
    <p>${isAR() ? "قريب يعمل حالياً في بغداد فقط. أخبرنا بمدينتك وسنعلمك عند الإطلاق." : "Qareeb currently covers Baghdad only. Tell us your city and we'll let you know."}</p>
    <a class="btn" href="#/">${icon("home")}${isAR() ? "تصفّح بغداد" : "Browse Baghdad"}</a>
    <button class="btn btn--3" onclick="toast('${isAR() ? "سنعلمك عند الإطلاق" : "We'll notify you at launch"}')">${icon("plus")}${isAR() ? "أعلمني عند الإطلاق" : "Notify me at launch"}</button>
  </div>${nav("home")}`;
}

/* ---------------- ADMIN ---------------- */
/* ==================================================================
   OPERATOR CONSOLE — a different product, not a different page
   ==================================================================
   The patient app is a 390px instrument used standing up. The operator
   console is a desk tool: dense, wide, scanning-oriented, and it does not
   share the patient shell — no bottom nav, no actionbar, its own wrapper,
   its own width. Everything on it is computed from the live model, because
   an operator screen showing invented numbers trains operators to ignore it.

   Four jobs, in the order they keep the network honest:
     1. STALE RADAR        — claims and profiles going bad right now
     2. VERIFICATION QUEUE — who is in the network without a human check
     3. SUPPLY GAPS        — where demand is going unanswered, by governorate
     4. INTEGRITY          — the validator, surfaced
------------------------------------------------------------- */
function screenAdmin() {
  const A = ADMIN_STATS;
  const pharmacies = allPharmacies();

  /* stale: availability claims in the stale band, and profiles nobody has
     touched in 90 days. Both are trust leaks, listed worst-first. */
  const staleSigs = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL && sigAgeMin(g) >= 1440)
    .map((g) => ({ g, f: anyFac(g.fac), x: variantOf(g.v) })).filter((r) => r.f && r.x)
    .sort((p2, q2) => sigAgeMin(q2.g) - sigAgeMin(p2.g));
  const staleProfiles = [...pharmacies, ...DOCTORS].filter((e) => e.updated > 90);

  const unverified = [
    ...pharmacies.filter((f) => !f.verified).map((f) => ({ e: f, kind: isAR() ? "صيدلية" : "pharmacy", city: cityName(cityById(cityOf(f))) })),
    ...DOCTORS.filter((d) => !d.verified).map((d) => ({ e: d, kind: isAR() ? "طبيب" : "doctor", city: isAR() ? "بغداد" : "Baghdad" })),
  ];

  const gaps = supplyDemand();
  const integrity = validateData();
  /* What is genuinely between this build and a real launch. Computed from
     the actual data and the actual deployment flags, never from a checklist
     someone remembered to tick — a readiness board that can be right by
     accident is worse than none, because it grants permission to stop
     looking. Every item here is a thing that would harm a real user. */
  /* Read from the live deployment, not from constants someone remembers to
     update. When the backend is configured these two clear themselves; when
     it is not, no amount of code claiming otherwise can hide it. */
  const blockers = QD.launchBlockers(allPharmacies(), {
    dataPlane: NET.on,
    pharmacyAuthBackend: BACKEND.server,
    auditServerSide: BACKEND.server,
    realData: DATA_PROVENANCE.real,
  });
  const controlledCount = RX_MEDS.filter((m) => QD.isControlled(m)).length;
  const liveReq = liveRequests();
  const liveSig = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL);

  const kpi = (n, l, warn) => `<div class="ops-kpi${warn ? " warn" : ""}">
    <div class="ops-n num">${n}</div><div class="ops-l">${l}</div></div>`;

  const sec = (title, note, body) => `<section class="ops-sec">
    <div class="rowb"><span class="lab">${title}</span>${note ? `<span class="t3">${note}</span>` : ""}</div>
    <div style="margin-top:10px">${body}</div></section>`;

  return `<div class="ops" dir="${isAR() ? "rtl" : "ltr"}">
  <header class="ops-hdr">
    <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
    <span class="lab">${isAR() ? "وحدة التشغيل" : "Operations"}</span>
    <span class="grow"></span>
    <span class="t3"><span class="num">${fmtT(nowMins())}</span> · ${isAR() ? "بيانات نموذج" : "prototype data"}</span>
    <a class="b-g" style="font-size:12.5px" href="#/">${isAR() ? "خروج للتطبيق" : "Exit to app"}</a>
  </header>

  <div class="ops-body">
    <div class="ops-kpis">
      ${kpi(liveSig.length, isAR() ? "إفادة توفّر حية" : "live signals")}
      ${kpi(liveReq.length, isAR() ? "طلب دواء نشط" : "active requests")}
      ${kpi(staleSigs.length, isAR() ? "إفادة تتقادم" : "aging claims", staleSigs.length > 0)}
      ${kpi(unverified.length, isAR() ? "بانتظار التوثيق" : "verification queue", unverified.length > 0)}
      ${kpi(A.zeroResults7d, isAR() ? "بحث بلا نتيجة (٧ أيام)" : "zero-result (7d)", true)}
      ${kpi(integrity.length, isAR() ? "خلل بيانات" : "integrity faults", integrity.length > 0)}
      ${kpi(blockers.length, isAR() ? "مانع إطلاق" : "launch blockers", blockers.length > 0)}
    </div>

    ${sec(isAR() ? "جاهزية الإطلاق" : "Launch readiness",
      isAR() ? "محسوبة من البيانات، مو من قائمة يدوية" : "computed, not ticked",
      blockers.length ? `
      <div class="t3" style="margin-bottom:12px">${isAR()
        ? "هذي الأشياء تؤذي مستخدماً حقيقياً لو أُطلقت الآن. مرتّبة كما هي، بلا تجميل."
        : "Each of these would harm a real user if launched today."}</div>
      ${blockers.map((b) => `<div class="ops-row">
        <span class="grow"><b>${esc(isAR() ? b.ar : b.id)}</b>
          <span class="t3" style="display:block mono">${esc(b.id)}</span></span>
        ${b.count > 1 ? `<span class="st st-e"><span class="num">${b.count}</span></span>` : `<span class="st st-e">${isAR() ? "مانع" : "blocker"}</span>`}
      </div>`).join("")}`
      : `<div class="t3">${isAR() ? "ما بقى مانع مسجّل." : "No recorded blockers."}</div>`)}

    ${sec(isAR() ? "الضوابط الفعّالة" : "Controls in force",
      isAR() ? "مفحوصة باختبارات" : "covered by tests",
      `<div class="ops-row"><span class="grow"><b>${isAR() ? "بوابة الصيدلية على الرادار" : "Pharmacy gate on the radar"}</b>
        <span class="t3" style="display:block">${isAR()
          ? "الدور والإجازة والفرع تُفحص عند كل إفادة، مو عند الباب بس"
          : "role, licence and branch checked on every claim"}</span></span>
        <span class="st st-v"><i class="dot"></i>${isAR() ? "فعّال" : "on"}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "منع بث الأدوية الخاضعة" : "Controlled medicines never broadcast"}</b>
        <span class="t3" style="display:block">${isAR()
          ? `<span class="num">${controlledCount}</span> دواء بالكتلوك — يُحوَّل لصيدلية مرخّصة`
          : `${controlledCount} in the catalogue — routed to a licensed pharmacy`}</span></span>
        <span class="st st-v"><i class="dot"></i>${isAR() ? "فعّال" : "on"}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "حمولة البث بقائمة سماح" : "Broadcast payload is a whitelist"}</b>
        <span class="t3" style="display:block">${isAR()
          ? "المَعلَم والرقم والصورة والملاحظة ما تغادر الجهاز"
          : "landmark, number, photo and note never leave the device"}</span></span>
        <span class="st st-v"><i class="dot"></i>${isAR() ? "فعّال" : "on"}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "سجل تدقيق مترابط" : "Hash-linked audit"}</b>
        <span class="t3" style="display:block">${BACKEND.server
          ? (isAR() ? "يُكتب على الخادم — المُدقَّق ما يكدر يعيد كتابته" : "written server-side — the audited party cannot rewrite it")
          : (isAR() ? "يكشف التعديل والحذف — على الجهاز، فما يمنعهما" : "detects edits and deletions — on-device, so it cannot prevent them")}</span></span>
        <span class="st ${BACKEND.server ? "st-v" : "st-t"}"><i class="dot"></i>${
          BACKEND.server ? (isAR() ? "فعّال" : "on") : (isAR() ? "جزئي" : "partial")}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "طبقة البيانات" : "Data plane"}</b>
        <span class="t3" style="display:block">${NET.on
          ? (isAR() ? "الطلبات تُنشر على الخادم وتصل صيدليات على أجهزة أخرى" : "requests reach pharmacies on other devices")
          : (isAR() ? "الطلب ما يغادر جهاز المريض — الحلقة الأساسية معطّلة" : "the request never leaves the patient's device")}</span></span>
        <span class="st ${NET.on ? "st-v" : "st-e"}"><i class="dot"></i>${
          NET.on ? (isAR() ? "فعّالة" : "on") : (isAR() ? "غائبة" : "absent")}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "وضع التشغيل" : "Runtime mode"}</b>
        <span class="t3" style="display:block">${BACKEND.server
          ? (isAR() ? "خادم — الجلسات موقّعة، والإجازة تُفحص مقابل قائمة معتمدة" : "server — sessions signed, licence checked against the approved list")
          : (isAR() ? "جهاز — القواعد سارية لكن الاعتماد يُفحص على جهاز صاحبه" : "device — rules hold, but the credential is checked on the claimant's own device")}</span></span>
        <span class="st ${BACKEND.server ? "st-v" : "st-e"}"><i class="dot"></i>${esc(backendMode())}</span></div>`)}

    <div class="ops-cols">
      <div>
        ${sec(isAR() ? "رادار التقادم" : "Stale radar",
          isAR() ? "الأسوأ أولاً" : "worst first",
          staleSigs.length || staleProfiles.length ? `
          ${staleSigs.map(({ g, f, x }) => `<div class="ops-row">
            <span class="grow"><b>${esc(L(x.med))} ${esc(x.v.strength)}</b>
              <span class="t3" style="display:block">${esc(L(f))} · ${esc(cityName(cityById(cityOf(f))))}</span></span>
            <span class="st st-t">${sigAge(sigAgeMin(g))}</span>
          </div>`).join("")}
          ${staleProfiles.map((e) => `<div class="ops-row">
            <span class="grow"><b>${esc(L(e))}</b>
              <span class="t3" style="display:block">${isAR() ? "ملف بلا تحديث" : "profile untouched"}</span></span>
            <span class="st st-e"><span class="num">${e.updated}</span> ${isAR() ? "يوم" : "d"}</span>
          </div>`).join("")}`
          : `<div class="t3">${isAR() ? "لا شيء يتقادم حالياً." : "Nothing going stale."}</div>`)}

        ${sec(isAR() ? "طابور التوثيق" : "Verification queue",
          isAR() ? `<span class="num">${unverified.length}</span>` : String(unverified.length),
          unverified.length ? unverified.map(({ e, kind, city }) => `<div class="ops-row">
            <span class="grow"><b>${esc(L(e))}</b>
              <span class="t3" style="display:block">${kind} · ${esc(city)}</span></span>
            <span class="t3">${isAR() ? "يظهر بلا ختم" : "shown unsealed"}</span>
          </div>`).join("") : `<div class="t3">${isAR() ? "الكل موثّق." : "Everyone verified."}</div>`)}

        ${sec(isAR() ? "سلامة البيانات" : "Data integrity", "",
          integrity.length ? integrity.map((e) => `<div class="ops-row">
            <span class="grow">${esc(e.m)}</span><span class="st st-e">${esc(e.t)}</span></div>`).join("")
          : `<div class="ops-row"><span class="grow">${isAR()
              ? "المدقّق نظيف — المعرّفات، المراجع، المدد، البدائل."
              : "Validator clean — ids, references, ranges, substitutes."}</span>
              <span class="st st-v"><i class="dot"></i>${isAR() ? "سليم" : "ok"}</span></div>`)}
      </div>

      <div>
        ${sec(isAR() ? "فجوات التوفّر — حسب المحافظة" : "Supply gaps — by governorate",
          isAR() ? "الطلب مقابل الإفادات الحية" : "demand vs live signals",
          gaps.map(({ c, supply, demand, gap }) => {
            const mx = Math.max(...gaps.map((x) => Math.max(x.supply, x.demand)), 1);
            return `<div class="ops-row" style="display:block">
              <div class="rowb"><b>${esc(cityName(c))}</b>
                ${gap > 0 ? `<span class="st st-t">${isAR() ? "فجوة" : "gap"} <span class="num">${gap}</span></span>`
                          : `<span class="st st-v"><i class="dot"></i>${isAR() ? "مغطّى" : "covered"}</span>`}</div>
              <div class="ops-bars">
                <span class="t3">${isAR() ? "طلب" : "D"}</span><span class="ops-bar"><i style="width:${(demand / mx) * 100}%;background:var(--brass)"></i></span><span class="t3 num">${demand}</span>
                <span class="t3">${isAR() ? "توفّر" : "S"}</span><span class="ops-bar"><i style="width:${(supply / mx) * 100}%;background:var(--jade)"></i></span><span class="t3 num">${supply}</span>
              </div></div>`;
          }).join(""))}

        ${sec(isAR() ? "بحث بلا نتيجة — إشارة النمو" : "Zero-result searches — the growth signal", "",
          A.zeroQueries.map(([q, n]) => `<div class="ops-row">
            <span class="grow">${esc(q)}</span><span class="num" style="font-weight:500">${n}</span></div>`).join(""))}

        ${sec(isAR() ? "طلب الأدوية حسب المنطقة" : "Medicine demand by district",
          isAR() ? "يُسأل / يُلبّى" : "asked / filled",
          MED_DEMAND.map((r) => {
            const m = medById(r.med), d = DISTRICTS.find((x) => x.id === r.district);
            const rate = Math.round((r.filled / r.asks) * 100);
            return `<div class="ops-row">
              <span class="grow"><b>${esc(L(m))}</b> <span class="t3">· ${esc(L(d))}</span></span>
              <span class="num" style="font-weight:500">${r.asks}</span>
              <span class="st ${rate < 30 ? "st-t" : "st-q"}" style="width:44px;justify-content:flex-end"><span class="num">${rate}٪</span></span>
            </div>`;
          }).join(""))}
      </div>
    </div>
  </div></div>`;
}

function sheet(html, cls = "") {
  closeSheet(true);
  const scrim = document.createElement("div"); scrim.className = "scrim"; scrim.onclick = () => closeSheet();
  const el = document.createElement("div"); el.className = "sheet " + cls; el.innerHTML = html;
  document.body.append(scrim, el);
  requestAnimationFrame(() => { scrim.classList.add("in"); el.classList.add("in"); });
  document.body.style.overflow = "hidden";
}
function closeSheet(instant) {
  document.body.style.overflow = "";
  document.querySelectorAll(".sheet,.scrim").forEach((n) => {
    if (instant) return n.remove();
    n.classList.remove("in"); setTimeout(() => n.remove(), 260);
  });
}

function openLocation() {
  const rows = DISTRICTS.map((d) => {
    const n = DOCTORS.filter((x) => x.sessions.some((s) => haversine(d, fac(s.fac)) <= 5)).length;
    const lm = isAR() ? d.lm_ar : d.lm_en;
    return `<button class="place ${d.id === S.district ? "on" : ""}" onclick="setDistrict('${d.id}')">
      <h3>${esc(L(d))}</h3>
      <div class="m lm">${esc(lm)}</div>
      <div class="m"><span class="num">${n}</span> ${isAR() ? "طبيب قريب" : "doctors near"}</div></button>`;
  }).join("");
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${t("pickArea")}</h2>
      <p>${isAR() ? "اختر منطقة — أو معلماً تعرفه. لا نسأل عن عنوان شارع أبداً."
                  : "Pick an area — or a landmark you know. We never ask for a street address."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <button class="lane on" onclick="askGps()" style="width:100%">
        <span class="ic">${icon("nav")}</span>
        <span class="grow" style="text-align:start"><h3>${t("useGps")}</h3>
          <p>${isAR() ? "مسافات دقيقة وترتيب حسب الأقرب" : "Exact distances and nearest-first sorting"}</p></span>
        <span class="go">${icon("chev")}</span></button>
      ${S.locState === "denied" ? `<div class="banner banner--${S.gpsReason === "policy" || S.gpsReason === "insecure" ? "warn" : "info"}" style="margin-top:10px">
        ${icon(S.gpsReason === "policy" || S.gpsReason === "insecure" ? "alert" : "info")}
        <span>${esc(L(GPS_MSG[S.gpsReason] || GPS_MSG.denied))}</span></div>` : ""}
      <h3 class="eyebrow" style="margin:20px 0 10px">${isAR() ? "أو اختر منطقتك" : "Or choose your area"}</h3>
      <div class="places">${rows}</div>
      <button class="btn btn--3" style="margin-top:14px" onclick="closeSheet()">${t("withoutLoc")}</button>
    </div>`);
}

// Why a diagnosis and not one generic message: getCurrentPosition fails for
// five different reasons and only one of them is the user's to fix. Telling
// someone to "check your browser settings" when the HOST is blocking the API
// sends them somewhere they can do nothing. Each cause gets its own sentence.
const GPS_MSG = {
  denied:      { ar: "رفضتَ إذن الموقع في المتصفح — لا مشكلة، اختر منطقتك ويعمل كل شيء كالمعتاد.",
                 en: "Location permission was denied — no problem, pick your area and everything still works." },
  timeout:     { ar: "تأخّر تحديد الموقع (الشبكة بطيئة؟). اختر منطقتك يدوياً — أسرع على أي حال.",
                 en: "Locating timed out. Pick your area instead — it's faster anyway." },
  unavailable: { ar: "تعذّر على جهازك تحديد الموقع الآن. اختر منطقتك يدوياً.",
                 en: "Your device couldn't get a fix right now. Pick your area instead." },
  insecure:    { ar: "تحديد الموقع يحتاج اتصالاً آمناً (HTTPS). اختر منطقتك يدوياً.",
                 en: "Location needs a secure (HTTPS) connection. Pick your area instead." },
  unsupported: { ar: "متصفحك لا يدعم تحديد الموقع. اختر منطقتك يدوياً.",
                 en: "This browser doesn't support location. Pick your area instead." },
  policy:      { ar: "الاستضافة تمنع تحديد الموقع في هذه الصفحة — ليس خطأً منك. اختر منطقتك يدوياً.",
                 en: "The host blocks location on this page — not something you can fix. Pick your area instead." },
};

function askGps() {
  const b = document.querySelector(".sheet .lane.on");
  if (b) b.innerHTML = `<span class="ic">${icon("nav")}</span>
    <span class="grow" style="text-align:start"><h3>${t("loading")}…</h3>
      <p>${isAR() ? "اسمح للمتصفح بالوصول للموقع" : "Allow location in your browser"}</p></span>`;
  if (!window.isSecureContext) return gpsFail("insecure");
  if (!navigator.geolocation) return gpsFail("unsupported");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const near = DISTRICTS.map((d) => ({ d, k: haversine(me, d) })).sort((a, b) => a.k - b.k)[0];

      /* THE SNAP MUST BE BOUNDED. Without this, a patient in Kut — 160 km
         from Baghdad — was snapped to the nearest Baghdad district, their
         real coordinates discarded, and then shown "صيدلية زيونة · 3.2 كم"
         with the approximation caveat suppressed because locState had been
         set to "precise". A fabricated distance is the most dangerous thing
         this product can print: someone drives across a governorate at night
         on the strength of it.

         Outside the covered map we say so. The app already has an honest
         screen for exactly this case — screenHomeAway, which states the
         coverage boundary in words — and it was unreachable by GPS. */
      const CITY_SNAP_KM = 40;
      if (!near || near.k > CITY_SNAP_KM) {
        const city = CITIES.map((c) => ({ c, k: haversine(me, c) })).sort((a, b) => a.k - b.k)[0];
        const known = city && city.k <= 150;
        S.gps = true; S.locState = "approx"; S.gpsReason = null;
        LS.set("gps", true); LS.set("locState", "approx");
        if (known) {
          S.exCity = city.c.id; LS.set("exCity", city.c.id);
          toast(isAR() ? `أنت خارج تغطية بغداد — عرضنا ${cityName(city.c)}`
                       : `Outside Baghdad coverage — showing ${cityName(city.c)}`);
        } else {
          toast(isAR() ? "ما نغطّي منطقتك بالدليل المحلي بعد — نعرض الشبكة الوطنية"
                       : "Your area is not in the local directory yet — showing the national network");
        }
        closeSheet(); render();
        return;
      }

      S.locState = "precise"; S.gps = true; S.gpsReason = null;
      LS.set("gps", true); LS.set("locState", "precise");
      setDistrict(near.d.id);
      toast(isAR() ? `حُدّد موقعك — أقرب منطقة: ${L(near.d)}` : `Located — nearest area: ${L(near.d)}`);
    },
    (err) => {
      // A Permissions-Policy block also arrives as PERMISSION_DENIED, but the
      // message names the policy. Separating it matters: the user cannot fix it.
      const msg = String(err && err.message || "");
      const policy = err && err.code === 1 && /policy/i.test(msg);
      gpsFail(policy ? "policy" : !err ? "unavailable"
        : err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable");
    },
    { timeout: 9000, maximumAge: 60000, enableHighAccuracy: false }
  );
}

function gpsFail(reason = "unavailable") {
  S.locState = "denied"; S.gpsReason = reason;
  LS.set("locState", "denied");
  openLocation();
}

function setDistrict(id) {
  S.district = id; LS.set("district", id);
  if (S.locState === "inferred" || S.locState === "denied") { S.locState = "chosen"; LS.set("locState", "chosen"); }
  closeSheet(); render();
}

/* --- appointment request --- */
function upcomingSlots(d, n = 7) {
  const out = []; const d0 = nowDay(), now = nowMins();
  for (let i = 0; i < 14 && out.length < n; i++) {
    const day = (d0 + i) % 7;
    rawSegs(d, day).sort((a, b) => a.f - b.f).forEach((s) => {
      if (out.length >= n) return;
      if (i === 0 && s.t <= now) return;
      out.push({ day, i, seg: s });
    });
  }
  return out;
}

function openRequest(id) {
  const d = DOCTORS.find((x) => x.id === id);
  const slots = upcomingSlots(d);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${t("request")}</h2><p>${esc(L(d))} · ${esc(L(specOf(d.spec)))}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <div class="reassure">
        <div class="reassure-r">${icon("check")}<span>${isAR() ? "ما تدفع شي هسه — الطلب مجاني" : "Nothing to pay now — the request is free"}</span></div>
        <div class="reassure-r">${icon("wa")}<span>${isAR() ? "ترسل من واتساب مالك، وتشوف الرسالة قبل الإرسال" : "Sent from your own WhatsApp, previewed first"}</span></div>
        <div class="reassure-r">${icon("clock")}<span>${isAR() ? "العيادة ترد عادة خلال ١٥–٦٠ دقيقة بأوقات الدوام" : "Clinics usually reply in 15–60 min during hours"}</span></div>
      </div>
      <label class="eyebrow" style="display:block;margin-top:18px">${t("chooseTime")}</label>
      <div class="slot" style="margin-top:9px">
        ${slots.map((s, i) => `<button class="slot-btn ${i === 0 ? "on" : ""}" data-i="${i}" onclick="pickSlot(${i})">
          <span><span class="d">${s.i === 0 ? t("today") : s.i === 1 ? t("tomorrow") : dayName(s.day)}</span>
            <span class="m">${esc(L(s.seg.fac))} · ${money(s.seg.s.fee)}</span></span>
          <span class="t">${fmtRange(s.seg.f, s.seg.t)}</span></button>`).join("")}
      </div>
      <div class="field"><label for="nm">${t("yourName")}</label>
        <input id="nm" value="${esc(S.name)}" placeholder="${isAR() ? "الاسم الثلاثي" : "Full name"}" autocomplete="name"></div>
      <div class="field"><label for="nt">${t("note")}</label>
        <textarea id="nt" rows="2" placeholder="${isAR() ? "مثال: مراجعة سابقة، أو حالة الطفل" : "e.g. follow-up visit"}"></textarea></div>
      <div class="hint">${icon("info")}<span>${isAR()
        ? "لا نطلب رقم هاتفك — رقمك يصل مع رسالة الواتساب. لا حساب ولا كلمة مرور."
        : "We don't ask for your phone number — WhatsApp carries it. No account, no password."}</span></div>
    </div>
    <div class="sheet-f"><button class="btn" onclick="toPreview('${d.id}')">${t("continue")}${icon("chev")}</button></div>`);
  window.__slot = 0; window.__slots = slots;
}
function pickSlot(i) {
  window.__slot = i;
  document.querySelectorAll(".slot-btn").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
}

function apptMsg(d, s, name, note, ref) {
  const when = `${dayName(s.day)} ${fmtRangeTxt(s.seg.f, s.seg.t)}`;
  if (isAR()) {
    return `السلام عليكم، أود حجز موعد.

الطبيب: ${d.ar}
العيادة: ${s.seg.fac.ar} — ${DISTRICTS.find((x) => x.id === s.seg.fac.district).ar}
الموعد المطلوب: ${when}
الاسم: ${name}${note ? `\nملاحظة: ${note}` : ""}

الرمز: ${ref}
—
عبر قريب`;
  }
  return `Hello, I'd like to request an appointment.

Doctor: ${d.en}
Clinic: ${s.seg.fac.en} — ${DISTRICTS.find((x) => x.id === s.seg.fac.district).en}
Requested: ${when}
Name: ${name}${note ? `\nNote: ${note}` : ""}

Ref: ${ref}
—
via Qareeb`;
}
const directMsg = (d) => isAR()
  ? `السلام عليكم، وصلت لعيادة ${d.ar} عبر تطبيق قريب وأود الاستفسار عن موعد.`
  : `Hello, I found ${d.en} through Qareeb and would like to ask about an appointment.`;
const productMsg = (p, f) => isAR()
  ? `السلام عليكم، أود الاستفسار عن توفر:\n\nالمنتج: ${p.ar}\nالماركة: ${p.brand}\nالسعر المعروض: ${money(p.price)}\n\n—\nعبر قريب`
  : `Hello, is this available?\n\nProduct: ${p.en}\nBrand: ${p.brand}\nListed price: ${money(p.price)}\n\n—\nvia Qareeb`;

function toPreview(id) {
  /* Check for a request to the same doctor and slot before showing the
     message again. Someone tapping twice usually wants the first one's
     status, not a second message landing in the clinic's inbox. */
  const dd = DOCTORS.find((x) => x.id === id);
  const ss = dd && window.__slots && window.__slots[window.__slot || 0];
  if (dd && ss && !window.__dupProceed) {
    const when = `${dayName(ss.day)} ${fmtRangeTxt(ss.seg.f, ss.seg.t)}`;
    const prior = priorRequest(id, when);
    if (prior) return duplicateGuard(id, when, () => toPreview(id));
  }
  window.__dupProceed = null;
  return toPreviewInner(id);
}

function toPreviewInner(id) {
  const d = DOCTORS.find((x) => x.id === id);
  const name = (document.getElementById("nm").value || "").trim();
  const note = (document.getElementById("nt").value || "").trim();
  if (!name) { toast(isAR() ? "اكتب اسمك من فضلك" : "Please enter your name"); document.getElementById("nm").focus(); return; }
  S.name = name; LS.set("name", name);
  const s = window.__slots[window.__slot];
  const ref = refCode();
  const msg = apptMsg(d, s, name, note, ref);
  const link = d.wa ? waLink(d.wa, msg) : null;

  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "هذه هي رسالتك" : "This is your message"}</h2>
      <p>${isAR() ? "راجعها أو عدّلها قبل الإرسال." : "Review or edit it before sending."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <div class="slip">
        <div class="slip-h">
          <span class="lab">${esc(L(CONFIG.brand))} · ${isAR() ? "طلب موعد" : "Appointment request"}</span>
          <span class="slip-ref" dir="ltr">${ref}</span>
        </div>
        <div class="bubble" id="msg" contenteditable="true" spellcheck="false">${esc(msg)}</div>
        <div class="slip-to rowb">
          <span>${isAR() ? "إلى" : "To"} ${d.wa ? `<span class="num">+${d.wa}</span>` : (isAR() ? "غير متوفر" : "unavailable")}</span>
          <button class="b-g" style="font-size:12px" onclick="document.getElementById('msg').focus()">${t("edit")}</button>
        </div>
      </div>
      ${!d.wa ? `<div class="note" style="margin-top:16px"><span>${t("noWa")}</span></div>` : ""}
    </div>
    <div class="sheet-f">
      ${d.wa ? `<a class="btn btn--wa" id="sendbtn" href="${link}" target="_blank" rel="noopener"
          onclick="handoffOpened('${d.id}','${ref}','${esc(dayName(s.day))} ${esc(fmtRangeTxt(s.seg.f, s.seg.t))}','${esc(L(s.seg.fac))}')">
          ${t("sendWa")}</a>`
        : `<a class="btn" href="tel:+${d.phone}">${t("call")} +${d.phone}</a>`}
      <div class="t3" style="text-align:center;margin-top:14px">${isAR()
        ? "تُرسل من واتسابك — لا نطلب رقمك ولا نُنشئ حساباً."
        : "Sent from your own WhatsApp — we never ask for your number or create an account."}</div>
    </div>`);
}

/* ---------------- THE HANDOFF, HONESTLY ----------------
   What we actually know when the user taps "send on WhatsApp" is that we
   asked the OS to open WhatsApp. We do not know that WhatsApp opened, that a
   message was typed, that send was pressed, that the number was right, or
   that anyone read it. The previous version stamped "SENT" and told the user
   "your message reached the clinic" — a claim built on nothing, at the exact
   moment the product is asking to be trusted.

   So the request is recorded as `opened`, and then we ask. Three states, all
   of them things we can actually justify:

     opened     — we opened WhatsApp. That is all we know.
     sent       — the user told us they sent it. Self-reported, labelled so.
     abandoned  — the user told us they did not. Route them to the phone.

   There is no `delivered` and there is no `confirmed`, because nothing in
   this architecture can observe either one.
------------------------------------------------------------- */
const REQ_STATE = {
  opened:    { ar: "فتحنا واتساب",    en: "WhatsApp opened",  cls: "st-q" },
  sent:      { ar: "أرسلتها",          en: "You sent it",      cls: "st-v" },
  abandoned: { ar: "لم تُرسل",         en: "Not sent",         cls: "st-t" },
};

/* A person who taps the same doctor twice in five minutes almost never wants
   two requests — they want to know what happened to the first one. */
function priorRequest(docId, when) {
  return S.requests.find((r) => r.doc === docId && r.when === when &&
    Date.now() - (r.ts || 0) < 36e5);
}

function handoffOpened(id, ref, when, facility) {
  const d = DOCTORS.find((x) => x.id === id);
  if (!d) return;
  S.requests.unshift({
    ref, doc: d.id, doctor: L(d), facility, when, wa: d.wa, phone: d.phone,
    state: "opened", ts: Date.now(),
    mapUrl: mapLink(docFacs(d)[0]),
    at: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
  });
  LS.set("requests", S.requests.slice(0, 20));
  /* Deliberately delayed: the sheet must not appear over WhatsApp while the
     user is still in it. It is waiting when they come back. */
  setTimeout(() => askHandoff(ref), 1200);
}

function askHandoff(ref) {
  const r = S.requests.find((x) => x.ref === ref);
  if (!r) return;
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "طلب" : "Request"} <span class="mono">${esc(r.ref)}</span></div>
      <h2 style="margin-top:8px">${isAR() ? "فتحنا واتساب — أرسلتها؟" : "WhatsApp opened — did you send it?"}</h2>
      <p>${isAR()
        ? "ما نكدر نشوف واتساب، فما نعرف. كولنا وبس، حتى نعرض لك الحالة الصح."
        : "We can't see inside WhatsApp, so we don't know. Tell us, and we'll show you the honest state."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="plate">
        <div class="rowb"><span class="d3">${esc(r.doctor)}</span><span class="mono">${esc(r.ref)}</span></div>
        <div class="q-sub" style="margin-top:4px">${esc(r.facility)} · ${esc(r.when)}</div>
      </div>
      <div class="v2" style="margin-top:18px">
        <button class="btn" onclick="markRequest('${esc(r.ref)}','sent')">${isAR() ? "إي، أرسلتها" : "Yes, I sent it"}</button>
        <button class="btn btn--2" onclick="markRequest('${esc(r.ref)}','abandoned')">${isAR() ? "لا، ما أرسلتها" : "No, I didn't"}</button>
      </div>
      <div class="t3" style="text-align:center;margin-top:14px">${isAR()
        ? "الطلب محفوظ برمزه بأي حال — تكدر ترجعله من «طلباتي»."
        : "The request is saved with its code either way — you can return to it from My requests."}</div>
    </div>`);
}

function markRequest(ref, state) {
  const r = S.requests.find((x) => x.ref === ref);
  if (!r) return closeSheet();
  r.state = state; r.ts = Date.now();
  LS.set("requests", S.requests.slice(0, 20));
  const d = DOCTORS.find((x) => x.id === r.doc);
  if (state === "sent") {
    /* No "delivered", no "confirmed". What we can honestly add is what
       happens next and what to do if it doesn't. */
    sheet(`<div class="sheet-grip"></div>
      <div class="sheet-h"><div>
        <div class="lab">${isAR() ? "محفوظ" : "Saved"}</div>
        <h2 style="margin-top:8px">${isAR() ? "خلص — رمزك محفوظ" : "Done — your code is saved"}</h2>
        <p>${isAR()
          ? "العيادات ترد عادةً خلال ١٥–٦٠ دقيقة بأوقات الدوام. ما نكدر نأكد وصولها، بس رمزك عندك."
          : "Clinics usually reply within 15–60 minutes during working hours. We can't confirm delivery, but you have your code."}</p>
      </div></div>
      <div class="sheet-b">
        <div class="plate">
          <div class="rowb"><span class="d3">${esc(r.doctor)}</span><span class="mono">${esc(r.ref)}</span></div>
          <div class="q-sub" style="margin-top:4px">${esc(r.facility)} · ${esc(r.when)}</div>
          <div class="row" style="margin-top:10px"><span class="st st-v"><i class="dot"></i>${isAR() ? "أرسلتها" : "You sent it"}</span></div>
        </div>
        <div class="lab" style="margin-top:22px">${isAR() ? "وإذا ما وصلك رد؟" : "And if nobody replies?"}</div>
        <div class="q-sub" style="margin-top:6px">${isAR()
          ? "بعض العيادات ما تتابع واتساب وقت الزحام. الاتصال أسرع."
          : "Some clinics don't watch WhatsApp when busy. Calling is faster."}</div>
        <div class="v2" style="margin-top:14px">
          ${r.phone ? `<a class="btn btn--2" href="tel:+${esc(r.phone)}">${t("call")} <span class="num">+${esc(r.phone)}</span></a>` : ""}
          ${d ? `<button class="btn btn--2" onclick="closeSheet();pickNeed('${d.spec}')">${isAR() ? "طبيب بديل بنفس الاختصاص" : "Another doctor, same specialty"}</button>` : ""}
          <button class="btn btn--3" onclick="closeSheet();location.hash='#/me'">${t("myRequests")}</button>
        </div>
      </div>`);
  } else {
    sheet(`<div class="sheet-grip"></div>
      <div class="sheet-h"><div>
        <h2>${isAR() ? "ما مشكلة" : "No problem"}</h2>
        <p>${isAR()
          ? "خلّيناه محفوظاً برمزه. تكدر ترسله بعدين، أو تتصل مباشرة."
          : "We kept it with its code. Send it later, or just call."}</p>
      </div></div>
      <div class="sheet-b"><div class="v2">
        ${r.wa ? `<a class="btn btn--wa" href="https://wa.me/${esc(r.wa)}" target="_blank" rel="noopener"
          onclick="markRequest('${esc(r.ref)}','opened')">${isAR() ? "افتح واتساب مرة ثانية" : "Open WhatsApp again"}</a>` : ""}
        ${r.phone ? `<a class="btn btn--2" href="tel:+${esc(r.phone)}">${t("call")} <span class="num">+${esc(r.phone)}</span></a>` : ""}
        <button class="btn btn--3" onclick="closeSheet()">${isAR() ? "إغلاق" : "Close"}</button>
      </div></div>`);
  }
}

/* Tapping the same doctor and slot again within the hour is almost never a
   second request — it is someone checking on the first one. */
function duplicateGuard(docId, when, proceed) {
  const prior = priorRequest(docId, when);
  if (!prior) return proceed();
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <h2>${isAR() ? "عندك طلب لنفس الموعد" : "You already have a request for this slot"}</h2>
      <p>${isAR()
        ? "أرسلته قبل شوي. إرسال ثاني يوصلهم مرتين — بس القرار قرارك."
        : "You sent it recently. Sending again reaches them twice — but it's your call."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="plate">
        <div class="rowb"><span class="d3">${esc(prior.doctor)}</span><span class="mono">${esc(prior.ref)}</span></div>
        <div class="q-sub" style="margin-top:4px">${esc(prior.facility)} · ${esc(prior.when)}</div>
        <div class="row" style="margin-top:10px"><span class="st ${REQ_STATE[prior.state].cls}"><i class="dot"></i>${
          esc(isAR() ? REQ_STATE[prior.state].ar : REQ_STATE[prior.state].en)}</span>
          <span class="t3" style="margin-inline-start:auto"><span class="num">${esc(prior.at)}</span></span></div>
      </div>
      <div class="v2" style="margin-top:18px">
        <button class="btn btn--2" onclick="closeSheet();location.hash='#/me'">${isAR() ? "شوف الطلب" : "See the request"}</button>
        ${prior.phone ? `<a class="btn btn--2" href="tel:+${esc(prior.phone)}">${t("call")}</a>` : ""}
        <button class="btn btn--3" onclick="window.__dupProceed && window.__dupProceed()">${isAR() ? "أرسل مرة ثانية" : "Send anyway"}</button>
      </div>
    </div>`);
  window.__dupProceed = () => { window.__dupProceed = null; proceed(); };
}

function openEmergency() {
  const er = FACILITIES.filter((f) => f.er).map((f) => ({ f, km: distTo(f) })).sort((a, b) => a.km - b.km).slice(0, 3);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2 style="color:var(--coral)">${t("emergency")}</h2>
      <p>${isAR() ? "إذا كانت الحالة خطرة، اتصل بالإسعاف فوراً." : "If this is serious, call the ambulance now."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <a class="btn btn--danger" href="tel:${CONFIG.emergency.unified}">${icon("phone")}${isAR() ? "الطوارئ الموحد" : "Unified emergency"} <span class="num">${CONFIG.emergency.unified}</span></a>
      <a class="btn btn--2" href="tel:${CONFIG.emergency.ambulance}">${icon("phone")}${t("ambulance")} <span class="num">${CONFIG.emergency.ambulance}</span></a>
      <h3 class="eyebrow" style="margin:20px 0 10px">${t("nearestEr")}</h3>
      <div class="stack">${er.map((x) => hospitalRow(x)).join("")}</div>
      <p class="tiny muted" style="margin-top:14px">${isAR() ? "تحقق من رقم الإسعاف المحلي قبل الاعتماد عليه." : "Verify the local ambulance number before relying on it."}</p>
    </div>`);
}

function reportInfo() {
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${t("reportInfo")}</h2>
      <p>${isAR() ? "ما الذي وجدته غير صحيح؟" : "What did you find wrong?"}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <div class="chips chips--wrap">${(isAR()
        ? ["الدوام غير صحيح", "الرقم لا يعمل", "العنوان تغيّر", "الأجرة مختلفة", "لم يعد يعمل هنا", "شيء آخر"]
        : ["Hours are wrong", "Number doesn't work", "Address changed", "Fee is different", "No longer works here", "Something else"])
        .map((x) => `<button class="chip" onclick="this.classList.toggle('on')">${x}</button>`).join("")}</div>
      <div class="field"><label>${isAR() ? "تفاصيل (اختياري)" : "Details (optional)"}</label><textarea rows="3"></textarea></div>
      <div class="hint">${icon("seal")}<span>${isAR() ? "يصل البلاغ لفريق التحقق خلال يوم عمل." : "Reports reach the verification team within one working day."}</span></div>
    </div>
    <div class="sheet-f"><button class="btn" onclick="closeSheet();toast('${isAR() ? "شكراً — وصل بلاغك" : "Thank you — report received"}')">${icon("flag")}${isAR() ? "أرسل البلاغ" : "Send report"}</button></div>`);
}

const activeFilterCount = () => ["when","gender","district","fee","facType"].filter((k) => S.filters[k]).length + (S.filters.openNow ? 1 : 0);

/* Filter priority follows intent, not the data model:
   specialty -> when -> gender -> area -> fee -> facility. */
function openFilters() {
  const f = S.filters;
  const grp = (title, key, opts) => `
    <div class="fgrp"><h3 class="eyebrow">${title}</h3>
      <div class="chips chips--wrap">${opts.map(([v, lab]) =>
        `<button class="chip ${f[key] === v ? "on" : ""}" onclick="setFilter('${key}', ${v === null ? "null" : `'${v}'`})">${lab}</button>`).join("")}</div></div>`;
  const near = DISTRICTS.map((d) => ({ d, k: haversine(here(), d) })).sort((a, b) => a.k - b.k).slice(0, 7);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "تحديد النتائج" : "Refine results"}</h2>
      <p>${isAR() ? "الأهم أولاً — متى، ثم مين، ثم وين." : "What matters first: when, then who, then where."}</p></div>
      <button class="icon-btn" onclick="closeSheet()" aria-label="${t("cancel")}">${icon("close")}</button></div>
    <div class="sheet-b">
      ${grp(isAR() ? "متاح متى" : "Available when", "when",
        [[null, isAR() ? "أي وقت" : "Any"], ["today", isAR() ? "اليوم" : "Today"], ["tomorrow", isAR() ? "باچر" : "Tomorrow"], ["week", isAR() ? "خلال الأسبوع" : "This week"]])}
      ${grp(isAR() ? "جنس الطبيب" : "Doctor gender", "gender",
        [[null, isAR() ? "الكل" : "Any"], ["f", isAR() ? "طبيبة" : "Female"], ["m", isAR() ? "طبيب" : "Male"]])}
      ${grp(isAR() ? "المنطقة" : "Area", "district",
        [[null, isAR() ? "كل بغداد" : "All Baghdad"], ...near.map((x) => [x.d.id, esc(L(x.d))])])}
      ${grp(isAR() ? "الأجرة" : "Fee", "fee",
        [[null, isAR() ? "الكل" : "Any"], ["free", isAR() ? "بدون أجرة" : "No fee"], ["u25", isAR() ? "حتى 25 ألف" : "Up to 25k"]])}
      ${grp(isAR() ? "المنشأة" : "Facility", "facType",
        [[null, isAR() ? "الكل" : "Any"], ["hospital", isAR() ? "مستشفى" : "Hospital"], ["clinic", isAR() ? "عيادة خاصة" : "Private clinic"]])}
    </div>
    <div class="sheet-f">
      <div class="btn-row">
        <button class="btn btn--2" onclick="resetFilters()">${icon("refresh")}${isAR() ? "إعادة ضبط" : "Reset"}</button>
        <button class="btn" onclick="closeSheet()">${isAR() ? "اعرض" : "Show"} <span class="num">${doctorsFor({ spec: S.filters.spec }).list.length}</span></button>
      </div>
    </div>`);
}
function setFilter(k, v) { S.filters[k] = v; if (document.querySelector(".sheet")) { closeSheet(true); openFilters(); } render(); }
function resetFilters() {
  S.filters = { openNow: false, when: null, gender: null, spec: S.filters.spec, district: null, fee: null, facType: null };
  closeSheet(true); openFilters(); render();
}

/* ---------------- MEDICINE AVAILABILITY ----------------
   The wedge. Iraq's chronic shortages mean the painful, repeated question is
   "who has this right now", not "which doctor". WhatsApp answers it 1:1 —
   you message six pharmacies one at a time. This turns it into 1:N: one
   request, ranked pharmacies, one pre-written message each, a shared code.

   Ranking is confirmation-freshness first, then distance. A two-day-old
   "yes we have it" beats a nearer pharmacy that has never confirmed.
------------------------------------------------------------- */
const medById = (id) => MEDICINES.find((m) => m.id === id);

function medRow(m) {
  const c = pharmaciesForMed(m).confirmed;
  return `<a class="card ${c.length ? "is-open" : ""}" href="#/med/${m.id}">
    <div class="card-top"><div class="avatar avatar--sq">${icon("pill")}</div>
      <div class="grow"><div class="card-t">${esc(L(m))}</div>
        <div class="card-meta">${c.length
          ? `<span class="chip--meta chip--ok">${icon("check")}<span class="num">${c.length}</span> ${isAR() ? "صيدلية أكّدت" : "confirmed"}</span>`
          : `<span class="chip--meta chip--warn">${isAR() ? "شحيح — اسأل مباشرة" : "scarce — ask directly"}</span>`}
          ${c.length ? `<i class="dot"></i><span>${freshLabel(c[0].mins)}</span>` : ""}</div></div>
      ${icon("chev")}</div></a>`;
}

function medMatches(q) {
  const nq = norm(q); if (!nq) return [];
  return MEDICINES.filter((m) => norm(m.ar + " " + m.en + " " + m.alias.join(" ")).includes(nq));
}

function pharmaciesForMed(med) {
  const confirmed = med.stock.map((st) => {
    const f = fac(st.f); if (!f) return null;
    const mins = freshMins(st);
    return { f, km: distTo(f), mins, band: freshBand(mins), price: st.p, st: status(f), confirmed: true };
  }).filter(Boolean);
  const others = FACILITIES.filter((f) => f.type === "pharmacy" && !med.stock.some((st) => st.f === f.id))
    .map((f) => ({ f, km: distTo(f), mins: null, band: null, st: status(f), confirmed: false }));
  /* Freshness first, always. Distance only breaks ties inside the same band —
     a nearer pharmacy whose last "yes" is four days old is not a better answer. */
  confirmed.sort((a, b) => a.mins - b.mins || a.km - b.km);
  others.sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  return { confirmed, others };
}

/* Freshness is the only claim this product actually makes. We never say a
   pharmacy "has" a medicine — we say someone confirmed it, and how long ago.
   Minutes matter below a day: a confirmation from 40 minutes ago is a different
   fact from one from this morning, and the screen has to be able to say so. */
const freshMins = (st) => st.mins !== undefined ? st.mins : st.d * 1440;

/* Three bands, and they are the ranking. hot = today, warm = this week,
   cold = older than three days, which is not information any more. */
const freshBand = (mins) => mins < 720 ? "hot" : mins <= 4320 ? "warm" : "cold";

/* Every duration here goes through countAr, because Arabic has a dual and
   "2 ساعات" is the same class of error as "2 patients": English grammar
   wearing Arabic words. See ROADMAP principle 9. */
/* Genitive dual (ـين), not nominative (ـان): every one of these follows the
   preposition «قبل». "قبل ساعتان" is wrong in the same way "before two hour"
   would be. The tier card's "مريضان" stays nominative because it is a
   predicate, not the object of a preposition — the case has to follow the
   sentence, which is why the forms live at the call site and not in countAr. */
const AR_MIN  = ["دقيقة واحدة", "دقيقتين", "دقائق", "دقيقةً"];
const AR_HOUR = ["ساعة واحدة", "ساعتين", "ساعات", "ساعةً"];
/* Arabic counts the way Arabic counts: one, two (dual), a few (3-10 takes
   the plural), many (11+ takes the singular accusative). A binary
   singular/plural is English grammar wearing Arabic words — principle 9. */
const AR_PHARM_OPEN = ["صيدلية وحدة مفتوحة الآن", "صيدليتان مفتوحتان الآن", "صيدليات مفتوحة الآن", "صيدليةً مفتوحة الآن"];
const AR_PHARM_CONF = ["صيدلية وحدة مؤكِّدة", "صيدليتان مؤكِّدتان", "صيدليات مؤكِّدة", "صيدليةً مؤكِّدة"];
const AR_REQ = ["طلب واحد", "طلبان", "طلبات", "طلباً"];
const AR_DAY  = ["يوم واحد", "يومين", "أيام", "يوماً"];

function freshLabel(mins) {
  if (isAR()) {
    if (mins < 60) return `مؤكَّد قبل ${countAr(Math.max(1, Math.round(mins)), AR_MIN)}`;
    if (mins < 1440) return `مؤكَّد قبل ${countAr(Math.round(mins / 60), AR_HOUR)}`;
    const d = Math.round(mins / 1440);
    if (d === 1) return "مؤكَّد أمس";
    if (d <= 3) return `مؤكَّد قبل ${countAr(d, AR_DAY)}`;
    return `قبل ${countAr(d, AR_DAY)} — غير مؤكّد`;
  }
  const n = (v) => `<span class="num">${v}</span>`;
  if (mins < 60) return `confirmed ${n(Math.max(1, Math.round(mins)))} min ago`;
  if (mins < 1440) return `confirmed ${n(Math.round(mins / 60))}h ago`;
  const d = Math.round(mins / 1440);
  return d <= 3 ? `confirmed ${n(d)}d ago` : `${n(d)}d ago — unconfirmed`;
}
const freshLabelTxt = (mins) => freshLabel(mins).replace(/<[^>]+>/g, "");

/* Age with no verdict attached, for places that already supply their own
   ("last confirmed …" must not then say "unconfirmed" in the same breath). */
function ageLabel(mins) {
  const n = (v) => `<span class="num">${v}</span>`;
  if (mins < 60) return isAR() ? `قبل ${countAr(Math.max(1, Math.round(mins)), AR_MIN)}` : `${n(Math.max(1, Math.round(mins)))} min ago`;
  if (mins < 1440) return isAR() ? `قبل ${countAr(Math.round(mins / 60), AR_HOUR)}` : `${n(Math.round(mins / 60))}h ago`;
  const d = Math.round(mins / 1440);
  return isAR() ? (d === 1 ? "أمس" : `قبل ${countAr(d, AR_DAY)}`) : `${n(d)}d ago`;
}

function medMsg(med, ref) {
  return isAR()
    ? `السلام عليكم، عندكم هذا الدواء؟\n\n${med.ar}${med.form ? ` (${med.form})` : ""}\n\nالرمز: ${ref}\n—\nعبر قريب`
    : `Hello, do you have this in stock?\n\n${med.en}\n\nRef: ${ref}\n— via Qareeb`;
}

/* People waiting on this medicine — derived from demand we actually logged
   (asks that never got filled), never a decorative number. */
/* Every other pharmacy here is "صيدلية الـ…", so naive first-letter avatars all
   render as ا. Drop the category word and the definite article to get the
   letter a person would actually use to tell them apart. */
const initial = (name) => {
  const w = String(name).replace(/^(صيدلية|صيدليه|مستشفى|عيادة|مركز)\s+/, "").trim();
  return (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w).charAt(0);
};

const medWaiting = (med) => MED_DEMAND.filter((r) => r.med === med.id)
  .reduce((n, r) => n + Math.max(0, r.asks - r.filled), 0);

/* How many pharmacies we could even have asked. Computed from the network, so
   "we asked 18 within 10 km" is true by construction rather than asserted. */
const medPolled = (r = 10) => FACILITIES.filter((f) => f.type === "pharmacy" && distTo(f) <= r).length;

/* Batch ask: the whole reason a neutral party is needed. One person messaging
   six pharmacies one at a time is the status quo; this is the same six, once. */
function batchAsk(medId) {
  const med = medById(medId); if (!med) return;
  const ref = (S.medRef ||= refCode());
  const targets = FACILITIES.filter((f) => f.type === "pharmacy" && f.wa)
    .map((f) => ({ f, km: distTo(f), st: status(f) }))
    .sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km).slice(0, 6);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "اسأل الكل دفعة واحدة" : "Ask them all at once"}</h2>
      <p>${isAR()
        ? `نفس الرسالة ونفس الرمز لـ<span class="num"> ${targets.length} </span>صيدليات. تفتح واتساب واحدة واحدة — أنت ترسل، لا نرسل نيابة عنك.`
        : `The same message and code to ${targets.length} pharmacies. Each opens WhatsApp — you send, we never send for you.`}</p></div></div>
    <div class="sheet-b">
      <div class="slip">
        <div class="slip-h">
          <div><div class="eyebrow">${isAR() ? "سؤال عن توفّر" : "Availability request"}</div>
            <div class="card-t" style="margin-top:3px">${esc(L(med))}</div>
            <div class="card-q">${esc(med.form || "")}</div></div>
          <div style="text-align:end"><div class="slip-ref mono" dir="ltr">#${ref}</div>
            <div class="tiny muted mono">${new Date().toLocaleDateString("en-GB")}</div></div>
        </div>
        <div class="slip-to">${isAR() ? "إلى" : "To"}: <span class="num">${targets.length}</span> ${isAR() ? "صيدلية" : "pharmacies"}</div>
        <div class="bubble">${esc(medMsg(med, ref))}</div>
      </div>
      <div class="stack-2" style="margin-top:12px">
        ${targets.map((x) => `<a class="btn btn--wa" href="${waLink(x.f.wa, medMsg(med, ref))}"
          target="_blank" rel="noopener" onclick="logAsk('${med.id}')">${icon("wa")}${esc(L(x.f))}
          <span class="num" style="opacity:.75;margin-inline-start:auto">${fmtKm(x.km)}</span></a>`).join("")}
      </div>
      <p class="tiny muted" style="margin-top:14px">${isAR()
        ? "أول جواب يوصلنا نخليه متاح للي بعدك — بدون اسمك."
        : "The first answer we get is published for the next person — without your name."}</p>
    </div>`);
}

/* Notify-me. No account, so it lives in this browser and says so plainly
   rather than implying a server is watching on the user's behalf. */
function watchMed(medId) {
  const w = LS.get("watch", []);
  const on = w.includes(medId);
  LS.set("watch", on ? w.filter((x) => x !== medId) : [medId, ...w]);
  toast(on ? (isAR() ? "أوقفنا المتابعة" : "Stopped following")
           : (isAR() ? "نتابعه لك — يظهر هنا أول ما تتأكد صيدلية" : "Following — it will show here once a pharmacy confirms"));
  render();
}

/* Was it actually there? The answer is the whole dataset. One tap, no form. */
function confirmStock(medId, facId, yes) {
  const log = LS.get("reports", []);
  log.unshift({ med: medId, fac: facId, yes, at: Date.now() });
  LS.set("reports", log.slice(0, 80));
  toast(isAR() ? "وصلتنا — شكراً، هذا يفيد اللي بعدك" : "Got it — thank you, this helps the next person");
  render();
}

function stockCard(med, x, ref) {
  const stale = x.band === "cold";
  const d = DISTRICTS.find((y) => y.id === x.f.district);
  return `<div class="rw${stale ? " quiet" : ""}">
    ${stale ? "" : `<span class="rw-lead" style="background:var(--${x.band === "hot" ? "brass" : "jade"})"></span>`}
    <span class="av">${esc(initial(L(x.f)))}</span>
    <span class="grow">
      <span class="d3" style="font-size:17px;display:block">${esc(L(x.f))}</span>
      <span class="q-sub" style="display:block">${d ? esc(L(d)) + " · " : ""}<span class="num">${fmtKm(x.km)}</span></span>
      <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
        <span class="st ${stale ? "st-q" : "st-t"}">${stale ? "" : `<i class="dot${x.band === "hot" ? " dot-live" : ""}"></i>`}${freshLabel(x.mins)}</span>
        ${x.price ? `<span class="t3"><span class="num">${money(x.price)}</span></span>` : ""}
      </span>
      <span class="row" style="gap:14px;margin-top:10px">
        ${x.f.wa ? `<a class="b-g" style="font-size:12.5px" href="${waLink(x.f.wa, medMsg(med, ref))}"
             target="_blank" rel="noopener" onclick="logAsk('${med.id}')">${isAR() ? "اسأل عبر واتساب" : "Ask on WhatsApp"}</a>`
          : `<a class="b-g" style="font-size:12.5px" href="tel:+${x.f.phone}">${t("call")}</a>`}
        <a class="b-g" style="font-size:12.5px" href="#/pharmacy/${x.f.id}">${isAR() ? "الصيدلية" : "Pharmacy"}</a>
      </span>
    </span></div>`;
}

/* 14 days of "how many pharmacies had this confirmed". A shortage that is
   nine days old and widening is a different thing from a bad afternoon, and
   the slope is the only honest way to say which one you are looking at. */
function medTrend(med) {
  const tr = med.trend || [];
  if (!tr.length) return "";
  const mx = Math.max(...tr, 1);
  const zeros = [...tr].reverse().findIndex((v) => v > 0);
  const dry = zeros === -1 ? tr.length : zeros;
  const last = tr[tr.length - 1];
  /* Fourteen engraved ticks, oldest first — which in RTL puts the oldest at
     the right, the same direction the day runs on every other dial here. A
     tick that reaches full height is a day this was widely held; a stub is a
     day it was not. The shortage is a shape, not a sentence. */
  return `<div>
    <div class="lab">${isAR() ? "أسبوعان من التوفّر" : "Two weeks of availability"}</div>
    <div class="ticks" style="margin-top:14px;height:26px" role="img"
      aria-label="${isAR() ? "عدد الصيدليات المؤكِّدة خلال ١٤ يوم" : "Confirming pharmacies over 14 days"}">
      ${tr.map((v) => `<i class="${v === mx && dry >= 2 ? "maj" : ""}"
        style="height:${Math.max(3, Math.round((v / mx) * 26))}px;background:var(--${v === 0 ? "dial-line" : v === mx && dry >= 2 ? "brass" : "ink-4"})"></i>`).join("")}
    </div>
    <div class="t3" style="margin-top:8px">${dry >= 2
      ? (isAR() ? `التوفّر توقّف قبل <span class="num">${dry}</span> أيام ويتّسع — الشاهد على اليمين من التاريخ.`
                : `Availability stopped <span class="num">${dry}</span> days ago and is widening.`)
      : last <= 1
      ? (isAR() ? `التوفّر هش — <span class="num">${last}</span> صيدلية فقط سجّلته مؤخراً.`
                : `Thin supply — only <span class="num">${last}</span> pharmacy has it on record lately.`)
      : (isAR() ? "التوفّر مستقر خلال الأسبوعين الماضيين." : "Availability has been steady over the past two weeks.")}</div>
  </div>`;
}

/* ---------------- v3 · MEDICINE · 4e / 4f ----------------
   The dial. Freshness is set as the largest thing on the page — a 46px
   numeral for the minutes since the last confirmation — because that number
   IS the product. The scarcity variant (4f) is the most designed screen here
   on purpose: the failure state is where a directory gives up and where this
   has to be worth opening.
------------------------------------------------------------- */
function screenMed(id) {
  const med = medById(id); if (!med) return screen404();
  const { confirmed, others } = pharmaciesForMed(med);
  const ref = (S.medRef ||= refCode());
  const watching = LS.get("watch", []).includes(med.id);
  const waiting = medWaiting(med);
  const lastMins = med.stock.length ? Math.min(...med.stock.map(freshMins)) : null;
  const fresh = confirmed.filter((x) => x.band !== "cold");
  const stale = confirmed.filter((x) => x.band === "cold");
  const rest = [...fresh.slice(1), ...stale];
  const sub = (med.subs || []).map(medById).filter(Boolean)
    .map((sm) => ({ sm, best: pharmaciesForMed(sm).confirmed[0] })).filter((x) => x.best)[0];
  const hereD = DISTRICTS.find((d) => d.id === S.district);
  const elsewhere = fresh.length && !fresh.some((x) => x.f.district === S.district) ? hereD : null;

  const head = `<section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="watchMed('${med.id}')">${watching
        ? (isAR() ? "نتابعه لك" : "Following") : (isAR() ? "تابع التوفّر" : "Follow stock")}</button>
    </div>
    <div class="lab" style="margin-top:28px${fresh.length ? "" : ";color:var(--brass-ink)"}">${fresh.length
      ? (isAR() ? "دواء" : "Medicine") + (med.chronic ? (isAR() ? " · علاج مزمن" : " · chronic") : "")
      : (isAR() ? "نقص حالي · بغداد" : "Current shortage · Baghdad")}</div>
    <h1 class="d1" style="margin-top:10px">${esc(L(med))}</h1>
    <div class="q-sub" style="margin-top:6px">${esc(med.form || "")}${
      med.equiv?.length ? (isAR() ? " · البديل المكافئ: " : " · equivalent: ") + esc(med.equiv[0]) : ""}</div>
  </section>`;

  /* 4e — there is a live answer. The minutes since confirmation are the hero. */
  const dial = fresh.length ? (() => {
    const x = fresh[0];
    const d = DISTRICTS.find((y) => y.id === x.f.district);
    const v = x.mins < 60 ? Math.max(1, Math.round(x.mins))
            : x.mins < 1440 ? Math.round(x.mins / 60) : Math.round(x.mins / 1440);
    const unit = x.mins < 60 ? (isAR() ? "دقيقة" : "min") : x.mins < 1440 ? (isAR() ? "ساعة" : "hours") : (isAR() ? "يوم" : "days");
    return `<section class="pad" style="margin-top:30px"><div class="plate">
      <div class="lab">${isAR() ? "آخر تأكيد" : "Last confirmed"}</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:8px">
        <span class="nbig" style="color:var(--brass-ink)">${v}</span>
        <span class="d3" style="font-weight:400;color:var(--ink-2)">${unit}</span>
        <span class="st st-t" style="margin-inline-start:auto">${x.band === "hot" ? `<i class="dot dot-live"></i>` : ""}${
          x.band === "hot" ? (isAR() ? "حيّ" : "live") : (isAR() ? "اليوم" : "today")}</span>
      </div>
      <div class="hr" style="margin:20px 0"></div>
      <div class="d3">${esc(L(x.f))}</div>
      <div class="q-sub">${d ? esc(L(d)) + (isAR() ? (d.lm_ar ? " — " + esc(d.lm_ar) : "") : (d.lm_en ? " — " + esc(d.lm_en) : "")) : ""}</div>
      <div class="row" style="margin-top:12px;gap:16px;flex-wrap:wrap">
        <span class="t3"><span class="num">${fmtKm(x.km)}</span></span>
        ${x.price ? `<span class="t3"><span class="num">${money(x.price)}</span></span>` : ""}
        ${statusLabel(x.st, true)}
      </div>
      <div style="margin-top:14px">${band(x.f)}</div>
      ${x.f.wa ? `<a class="btn btn--wa" style="margin-top:22px" href="${waLink(x.f.wa, medMsg(med, ref))}"
           target="_blank" rel="noopener" onclick="logAsk('${med.id}')">${isAR() ? "اسأل عبر واتساب" : "Ask on WhatsApp"}</a>`
        : `<a class="btn" style="margin-top:22px" href="tel:+${x.f.phone}">${t("call")}</a>`}
    </div></section>`;
  })()
  /* 4f — there is no live answer. A zero, at 76px, and three doors. */
  : `<section class="pad" style="margin-top:30px">
      <div style="display:flex;align-items:baseline;gap:12px">
        <span class="nhuge" style="color:var(--ink-3)">0</span>
        <span><span class="d3" style="font-weight:500;display:block">${isAR() ? "صيدلية مؤكَّدة اليوم" : "pharmacies confirmed today"}</span>
          <span class="q-sub">${isAR()
            ? `من <span class="num">${medPolled()}</span> سُئلت خلال <span class="num">24</span> ساعة`
            : `of <span class="num">${medPolled()}</span> asked in the last <span class="num">24</span> hours`}</span></span>
      </div>
      ${lastMins !== null ? `<div class="t3" style="margin-top:14px">${isAR() ? "آخر تأكيد " : "last confirmed "}${ageLabel(lastMins)}</div>` : ""}
    </section>

    <section class="pad" style="margin-top:28px"><div class="v2">
      <button class="btn" onclick="watchMed('${med.id}')">${isAR()
        ? `${watching ? "نتابعه لك" : "نبّهني أول ما يتوفّر"}${waiting ? ` — <span class="num">${waiting}</span> ينتظرون` : ""}`
        : `${watching ? "Following" : "Notify me"}${waiting ? ` — <span class="num">${waiting}</span> waiting` : ""}`}</button>
      <button class="btn btn--2" onclick="batchAsk('${med.id}')">${isAR()
        ? `اسأل <span class="num">6</span> صيدليات دفعة واحدة` : `Ask <span class="num">6</span> pharmacies at once`}</button>
      ${sub ? `<a class="btn btn--2" href="#/med/${sub.sm.id}">${isAR() ? "البديل المكافئ" : "Equivalent"} — ${esc(L(sub.sm))}</a>` : ""}
    </div></section>`;

  return `${netBanner()}${head}${dial}

  ${!fresh.length && sub ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "البديل المكافئ المتوفّر الآن" : "Equivalent available now"}</div>
    ${stockCard(sub.sm, sub.best, ref)}
    <div class="t3" style="margin-top:4px;color:var(--alarm)">${isAR()
      ? "نفس الاستطباب — راجع طبيبك قبل التبديل."
      : "Same indication — ask your doctor before switching."}</div>
  </section>` : ""}

  ${elsewhere ? `<section class="pad" style="margin-top:24px"><div class="note note-w">
    <span>${isAR()
      ? `ما لكيناه مؤكَّداً في <b>${esc(L(elsewhere))}</b> — أقرب تأكيد في <b>${esc(L(DISTRICTS.find((d) => d.id === fresh[0].f.district)) || "")}</b>، <span class="num">${fmtKm(fresh[0].km)}</span>.`
      : `Not confirmed in <b>${esc(L(elsewhere))}</b> — nearest is <b>${esc(L(DISTRICTS.find((d) => d.id === fresh[0].f.district)) || "")}</b>, <span class="num">${fmtKm(fresh[0].km)}</span> away.`}</span>
  </div></section>` : ""}

  ${rest.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${fresh.length
      ? (isAR() ? "توفّر آخر — مرتّب بحداثة التأكيد، لا بالمسافة" : "Also available — by confirmation freshness, not distance")
      : (isAR() ? "تأكيدات سابقة — مرتّبة بحداثة التأكيد" : "Earlier confirmations — by freshness")}</div>
    ${rest.slice(0, 4).map((x) => stockCard(med, x, ref)).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin-top:30px">${medTrend(med)}</section>

  ${fresh.length ? `<section class="pad" style="margin:26px 0 0">
    <div class="lab">${isAR() ? "ساعدنا نُحدّث" : "Help us stay current"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "سألت صيدلية ووصلك جواب؟ ثانية واحدة، ويستفيد غيرك."
      : "Asked a pharmacy and got an answer? One second, and it helps the next person."}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn--2 btn--sm" style="flex:1" onclick="confirmStock('${med.id}','${fresh[0].f.id}',true)">${isAR() ? "كان متوفّراً" : "It was there"}</button>
      <button class="btn btn--2 btn--sm" style="flex:1" onclick="confirmStock('${med.id}','${fresh[0].f.id}',false)">${isAR() ? "لم يكن" : "It wasn't"}</button>
    </div>
  </section>` : ""}

  ${others.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "صيدليات لم تؤكّد بعد" : "Not confirmed yet"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `رسالة جاهزة لكل وحدة، ونفس الرمز <b class="mono">${ref}</b>.`
      : `A ready message for each, same code <b class="mono">${ref}</b>.`}</div>
    <button class="btn btn--2" style="margin-top:14px" onclick="batchAsk('${med.id}')">${isAR()
      ? "اسألهم كلهم دفعة واحدة" : "Ask them all at once"}</button>
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? "معلومة توفّر، لا نصيحة طبية. لا توقف دواءك ولا تبدّله دون طبيبك."
      : "Availability information, not medical advice. Never stop or switch a medicine without your doctor."}</div>
  </section>
  ${nav("pharmacies")}`;
}

function logAsk(medId) {
  const log = LS.get("asks", []);
  log.unshift({ med: medId, at: Date.now(), district: S.district });
  LS.set("asks", log.slice(0, 50));
}


/* ==================================================================
   MEDICINE EXPLORER — engine
   ==================================================================
   The safety argument lives here, not in the copy. Three rules the rest of
   the layer is built on:

   1. A signal EXPIRES BY ITSELF. Nobody has to remember to retract a stale
      claim, because the claim decays as a function of the clock. A pharmacy
      that stops answering stops being shown.
   2. Verified identity does NOT transfer to a stock claim. `verified` says a
      human checked the pharmacy exists and the number reaches it. It says
      nothing about the box on the shelf, and the UI never merges the two.
   3. We match an exact VARIANT — molecule + strength + form. We never map one
      variant onto another, never surface `alt` as a suggestion, and never say
      a medicine is appropriate. Discovery and connection only.
------------------------------------------------------------- */

/* Signal decay. Stock is the most perishable fact in the product, so the
   bands are tight — an hour is "just now", a day is already suspect. */
const SIG_BANDS = [
  { max: 60,   k: "live",   ar: "مؤكَّد الآن",      en: "confirmed now" },
  { max: 360,  k: "fresh",  ar: "مؤكَّد اليوم",     en: "confirmed today" },
  { max: 1440, k: "aging",  ar: "خلال ٢٤ ساعة",    en: "within 24h" },
  { max: 4320, k: "stale",  ar: "قديم — أعد السؤال", en: "stale — ask again" },
];
const SIG_TTL = 4320;   /* 3 days. Past this a signal is not shown at all. */

function sigBand(mins) {
  return SIG_BANDS.find((b) => mins < b.max) || null;   /* null = expired */
}

/* The state a signal is actually IN, which is the pharmacy's claim narrowed
   by how old it is. A "we have plenty" from four days ago is not low stock —
   it is no information, and it leaves the network entirely. */
function sigState(sig) {
  const band = sigBand(sig.m);
  if (!band) return { k: "expired", band: null };
  if (band.k === "stale") return { k: "stale", band };
  return { k: sig.st === "low" ? "low" : "available", band };
}

const QTY_LABEL = {
  many: { ar: "كمية جيدة", en: "good quantity" },
  few:  { ar: "كمية محدودة", en: "limited" },
  low:  { ar: "آخر وحدات", en: "last units" },
};

/* Every facility, Baghdad or governorate, behind one lookup so the rest of
   the layer never has to care which list a pharmacy came from. */
const allPharmacies = () => [...FACILITIES.filter((f) => f.type === "pharmacy"), ...BRANCHES];
const anyFac = (id) => allPharmacies().find((f) => f.id === id);

/* A Baghdad facility's city is Baghdad; a branch carries its own. */
const cityOf = (f) => f && (f.city || "baghdad");
const cityById = (id) => CITIES.find((c) => c.id === id);
/* Governorates whose seat has its own name (نينوى / الموصل) show the seat,
   because that is what a person says out loud. */
const cityName = (c) => !c ? "" : (isAR() ? (c.seat_ar || c.ar) : (c.seat_en || c.en));

const variantOf = (vid) => {
  for (const m of RX_MEDS) { const v = m.variants.find((x) => x.id === vid); if (v) return { med: m, v }; }
  return null;
};
const variantLabel = (vid) => { const x = variantOf(vid); return x ? `${L(x.med)} ${x.v.strength}` : ""; };

/* Live signals for a variant: expired ones are dropped here, once, so no
   screen downstream can accidentally render one. */
/* A signal's age: seed rows have a chosen `m`, anything a pharmacy actually
   claimed carries `at`. Without this, a live claim stayed "قبل ٠ دقيقة"
   permanently and the freshness engine — the core of the product — never
   moved a single signal from live to stale. */
function sigAgeMin(g) {
  return g.at ? (Date.now() - g.at) / 60000 : (g.m || 0);
}

function signalsFor(vid) {
  return SIGNALS.filter((g) => g.v === vid && sigAgeMin(g) < SIG_TTL)
    .map((g) => ({ ...g, f: anyFac(g.fac), state: sigState(g) }))
    .filter((g) => g.f)
    .sort((a, b) => sigAgeMin(a) - sigAgeMin(b));
}

/* THE AVAILABILITY FIELD — the answer to "where in Iraq might this be?".
   Cities are ordered by the strength of what is actually known, not
   alphabetically and not by population: a city with a confirmation from ten
   minutes ago outranks one with four claims from yesterday. */
function availabilityField(vid) {
  const sigs = signalsFor(vid);
  const reqs = REQUESTS.filter((r) => r.v === vid && r.st !== "expired");
  return CITIES.map((c) => {
    const inCity = sigs.filter((g) => cityOf(g.f) === c.id);
    const live = inCity.filter((g) => g.state.k === "available" || g.state.k === "low");
    const best = inCity[0] || null;
    return {
      c, n: live.length, stale: inCity.length - live.length, best,
      demand: reqs.filter((r) => r.city === c.id).length,
      /* rank: freshest evidence first, then how much of it there is */
      rank: best ? (best.m + (live.length ? 0 : 1e5)) : 1e9,
    };
  }).sort((a, b) => a.rank - b.rank);
}

/* Request urgency. Colour is confirmation, never the carrier — each level
   also has its own word and its own position in the sort. */
/* Labels state the same windows the machine actually enforces (REQ_TTL_BY_URG:
   6h / 24h / 72h). A label promising "within two hours" against a six-hour
   expiry would be the countdown lie wearing different clothes. */
const URGENCY = {
  urgent: { ar: "عاجل جداً — خلال ٦ ساعات", en: "Very urgent — within 6h", short_ar: "عاجل", short_en: "Urgent", cls: "st-e", w: 0 },
  high:   { ar: "خلال ٢٤ ساعة", en: "Within 24h", short_ar: "خلال يوم", short_en: "24h", cls: "st-t", w: 1 },
  normal: { ar: "غير مستعجل — حتى ٣ أيام", en: "Not urgent — up to 3 days", short_ar: "غير مستعجل", short_en: "Normal", cls: "st-q", w: 2 },
};
const urgShort = (u) => isAR() ? (u.short_ar || u.ar) : (u.short_en || u.en);

/* Dosage forms and strength units, for a medicine we do not carry yet. */
const RX_FORMS = ["حبوب / كبسول", "شراب", "حقن", "قطرة", "مرهم / كريم", "بخاخ", "أخرى"];
const RX_UNITS = ["ملغم", "مل", "مايكروغرام", "٪"];

/* One view of "which medicine is this request about", whether it came from the
   catalogue (r.v) or was typed by the patient (r.manual). Every card and
   screen reads through this so a manual medicine is a first-class citizen,
   not a crash. */
/* "بغداد — المنصور، قرب مستشفى اليرموك" from whatever the request carries. */
function needPlace(r) {
  const c = cityName(cityById(r.city));
  const dd = r.district && DISTRICTS.find((y) => y.id === r.district);
  const lm = (r.lm || "").replace(/^\s*(قرب|جنب|مجاور|يم|near)\s+/i, "").trim();
  return [c, dd ? L(dd) : null].filter(Boolean).join(" — ") + (lm ? (isAR() ? "، قرب " : ", near ") + lm : "");
}

/* Distance from a branch to the request's district centre, when both sides
   have coordinates. Shown as approximate, because it is. */
function needDistFrom(f, r) {
  const dd = r.district && DISTRICTS.find((y) => y.id === r.district);
  if (!dd || !f || !f.lat) return null;
  return haversine(f, dd);
}

function needMedOf(r) {
  if (r.v) { const x = variantOf(r.v); if (x) return { name: L(x.med), strength: x.v.strength, form: x.v.form, x }; }
  if (r.manual) return { name: r.manual.name, strength: r.manual.strength || "", form: r.manual.form || "", x: null };
  return null;
}

/* Request lifecycle. `expired` is reached by the clock, like a signal — a
   need nobody answered should leave the feed on its own rather than sit
   there implying the network is working. */
/* TTL scales with urgency, because a request that says "today" and then sits
   in the feed for three days is lying twice: to the patient about being acted
   on, and to the pharmacist about being live. This is also what makes the
   countdown honest — it counts down to a real expiry, not a manufactured one. */
/* Age in minutes. Seed rows carry a static `m` because they are fiction with
   a chosen age; anything a real user creates carries `ts`, a real timestamp,
   and must be measured against the actual clock.

   This is the fix for the worst bug in the product. `reqLeft` used to be
   `reqTtl(r) - r.m`, and `r.m` was written once at publish as 0 and never
   incremented by anything, anywhere. So every request a real user published
   was immortal, and the countdown beside it displayed the same number
   forever — the exact "manufactured countdown" the comment above says this
   code exists to prevent. The tested `QD.isExpired` had it right the whole
   time and was never called. */
const REQ_TTL_BY_URG = QD.TTL_BY_URGENCY;
const reqTtl = (r) => QD.ttlFor(r.urg);
const reqAge = (r) => (r.ts ? (Date.now() - r.ts) / 60000 : (r.m || 0));
const reqLeft = (r) => Math.max(0, reqTtl(r) - reqAge(r));
const REQ_TTL = 4320;
/* ==================================================================
   REQUEST STATE MACHINE
   ==================================================================
   Booleans lie by omission. `isLoading && isError` is a state nobody
   designed, and in a medicine network the undesigned states are the ones
   that hurt: a request that is simultaneously "searching" and "answered",
   or "fulfilled" and "expired".

   One state at a time, and transitions declared rather than assumed —
   anything not in this table cannot happen.

     idle          nothing published yet
     broadcasting  live, visible to matching pharmacies, nobody has answered
     acknowledged  at least one pharmacy has reported stock
     handoff       the patient opened a channel to one of them
     fulfilled     the patient says they got it
     expired       the clock ran out (see REQ_TTL_BY_URG)

   `expired` is reachable from every live state because time does not ask
   permission. `fulfilled` is only reachable once someone has actually been
   contacted — you cannot fulfil a request nobody answered.
------------------------------------------------------------- */
const REQ_MACHINE = {
  idle:         ["broadcasting"],
  broadcasting: ["acknowledged", "expired"],
  acknowledged: ["handoff", "fulfilled", "expired"],
  handoff:      ["fulfilled", "acknowledged", "expired"],
  fulfilled:    [],
  expired:      [],
};

/* Legacy seed rows use the older vocabulary; map them once, here, so the
   machine is the only thing the rest of the app reasons about. */
const REQ_ALIAS = { published: "broadcasting", matched: "broadcasting", responded: "acknowledged", contacted: "handoff" };
const normState = (v) => REQ_ALIAS[v] || v || "broadcasting";

/* The only way a request changes state. Refuses illegal transitions loudly
   in debug and silently in production, rather than corrupting the record. */
function reqTransition(r, next) {
  const from = normState(r.st);
  if (from === next) return true;
  if (!(REQ_MACHINE[from] || []).includes(next)) {
    if (CONFIG.debug) console.warn(`[machine] refused ${from} -> ${next}`, r.id);
    return false;
  }
  r.st = next;
  r.ts = Date.now();
  const mine = LS.get("needs", []);
  const rec = mine.find((x) => x.id === r.id);
  if (rec) { rec.st = next; rec.ts = r.ts; LS.set("needs", mine); }
  return true;
}

const REQ_STATE_X = {
  broadcasting: { ar: "جارِ البحث",       en: "Broadcasting" },
  acknowledged: { ar: "وصلك ردّ",         en: "Answered" },
  handoff:      { ar: "تواصلت",           en: "Contacted" },
  fulfilled:    { ar: "انتهى",            en: "Fulfilled" },
  expired:      { ar: "انتهت صلاحيته",    en: "Expired" },
};
function reqState(r) {
  const st = normState(r.st);
  if (st === "fulfilled" || st === "expired") return st;
  if (reqAge(r) >= reqTtl(r)) return "expired";
  return st;
}

/* The countdown. Real remaining time against a real expiry — never a
   decorative 15-minute clock. A fabricated timer in a healthcare network is
   the same class of lie as a fabricated "delivered" receipt, and it would be
   found out the first time a pharmacist watched one reset. */
function expiryLabel(r) {
  const left = reqLeft(r);
  if (left <= 0) return isAR() ? "انتهى" : "expired";
  if (left < 60) return isAR() ? `يبقى ${countAr(Math.round(left), AR_MIN)}` : `${Math.round(left)} min left`;
  if (left < 1440) return isAR() ? `يبقى ${countAr(Math.round(left / 60), AR_HOUR)}` : `${Math.round(left / 60)}h left`;
  return isAR() ? `يبقى ${countAr(Math.round(left / 1440), AR_DAY)}` : `${Math.round(left / 1440)}d left`;
}
/* Urgency of the countdown itself: under an hour reads as pressure. */
const expiryHot = (r) => reqLeft(r) > 0 && reqLeft(r) < 60;
const LIVE_STATES = ["broadcasting", "acknowledged", "handoff"];
const liveRequests = () => REQUESTS.filter((r) => LIVE_STATES.includes(reqState(r)))
  .sort((a, b) => URGENCY[a.urg].w - URGENCY[b.urg].w || reqAge(a) - reqAge(b));

/* Bounded edit distance. Arabic spelling of transliterated drug names varies
   a lot — ميثوتركسات / ميثوتريكسات / ميثوتريكسيت are the same request — and a
   patient hunting a rare medicine is the last person who should be punished
   for a letter. Capped at 2 and short-circuited on length, so it stays cheap
   inside a search loop. */
function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/* Variant search. Matches molecule, brand, alias, strength and form — and
   deliberately does NOT fall back to "same molecule, different strength",
   because presenting a 50mg vial to someone who asked for a 2.5mg tablet is
   a substitution, and substitutions are not ours to make. */
function searchVariants(q) {
  const nq = norm(q); if (!nq) return [];
  const toks = nq.split(/\s+/).filter(Boolean);
  const out = [];
  for (const m of RX_MEDS) {
    const medHay = norm([L(m), m.ar, m.en, ...(m.alias || [])].join(" "));
    for (const v of m.variants) {
      const hay = medHay + " " + norm([v.strength, v.form, v.pack, ...(v.alt || [])].join(" "));
      let score = 0;
      for (const tk of toks) {
        if (hay.includes(tk)) score += 2;
        else if (medHay.split(/\s+/).some((w) => w.length > 3 && lev(w, tk) <= 1)) score += 1;
      }
      if (score) out.push({ med: m, v, score, n: signalsFor(v.id).filter((g) => g.state.k !== "stale").length });
    }
  }
  return out.sort((a, b) => b.score - a.score || b.n - a.n);
}

/* Fast Responder. Earned from what a branch actually did: it has answered
   requests, and its live claims are fresh. Never assigned, never bought, and
   it disappears the moment the behaviour stops — which is the only kind of
   badge worth showing in a network built on freshness.

   Threshold: at least 2 answered requests AND a median claim age under 12h. */
function responderStats(facId) {
  const answered = REQUESTS.filter((r) => (r.resp || []).includes(facId)).length;
  const mine = SIGNALS.filter((g) => g.fac === facId && sigAgeMin(g) < SIG_TTL).map((g) => sigAgeMin(g)).sort((a, b) => a - b);
  const median = mine.length ? mine[Math.floor(mine.length / 2)] : Infinity;
  return { answered, median, fast: answered >= 2 && median < 720 };
}
const fastBadge = (facId) => responderStats(facId).fast
  ? `<span class="badge-fast">${isAR() ? "سريع الاستجابة" : "Fast responder"}</span>` : "";

/* Supply Radar: what a given branch should be shown. A pharmacy is offered a
   request when it is in the same city, OR when it has ever signalled that
   exact variant — which is how a Baghdad pharmacy learns that someone in
   Basra needs what it happens to be holding. */
/* Requests fetched from the server for this branch's governorate, refreshed
   on a timer while the radar screen is open. Kept separate from the seed
   REQUESTS array so a network hiccup can never delete the demo data. */
let REMOTE_QUEUE = [];
let queueTimer = null;

function startQueuePolling(facId) {
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  if (!NET.on) return;
  const f = anyFac(facId); if (!f) return;
  const city = cityOf(f);
  const pull = async () => {
    if (!location.hash.startsWith("#/radar/")) { clearInterval(queueTimer); queueTimer = null; return; }
    const rows = await netQueue(city);
    if (rows === null) return;                   /* offline: keep what we have */
    const next = rows.map(adoptRemote);
    /* Only repaint when something actually changed — a list that redraws on
       a timer steals taps from a pharmacist mid-reach. */
    if (JSON.stringify(next.map((x) => x.id + x.st)) !==
        JSON.stringify(REMOTE_QUEUE.map((x) => x.id + x.st))) {
      REMOTE_QUEUE = next;
      render();
    } else { REMOTE_QUEUE = next; }
  };
  pull();
  queueTimer = setInterval(pull, 20000);
}

function radarFor(facId) {
  const f = anyFac(facId); if (!f) return [];
  const myCity = cityOf(f);
  const mine = new Set(SIGNALS.filter((g) => g.fac === facId).map((g) => g.v));
  /* Real requests from the network first, seed rows behind them. A remote id
     always wins over a local one with the same id so a request this device
     published does not appear twice. */
  const seen = new Set(REMOTE_QUEUE.map((r) => r.id));
  const pool = [...REMOTE_QUEUE, ...liveRequests().filter((r) => !seen.has(r.id))];
  return pool.map((r) => ({
    r,
    sameCity: r.city === myCity,
    holds: mine.has(r.v),
    answered: (r.resp || []).includes(facId),
  })).filter((x) => x.sameCity || x.holds)
    .sort((a, b) => (b.holds - a.holds) || URGENCY[a.r.urg].w - URGENCY[b.r.urg].w
      || reqAge(a.r) - reqAge(b.r));
}

/* City-level supply and demand, for the operator map. */
function supplyDemand() {
  const live = liveRequests();
  return CITIES.map((c) => {
    const supply = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL && cityOf(anyFac(g.fac)) === c.id).length;
    const demand = live.filter((r) => r.city === c.id).length;
    return { c, supply, demand, gap: demand - supply };
  }).filter((x) => x.supply || x.demand).sort((a, b) => b.gap - a.gap || b.demand - a.demand);
}


/* ==================================================================
   MEDICINE EXPLORER — surfaces
   ================================================================== */

/* THE FIELD — the signature component of this layer.
   Not a map. A map of Iraq at 390px is four pixels of Basra and a lot of
   desert, and it would imply a precision about location we do not have. What
   the patient actually needs is a reading: which governorates hold evidence,
   how fresh it is, and where the need is going unanswered. So the field is
   built from the identity's own vocabulary — engraved marks on a rule, brass
   for the freshest — one row per governorate, ordered by strength of
   evidence. It reads like an instrument, not an infographic. */
function fieldRow(x, vid) {
  const marks = Math.min(x.n, 6);
  const live = x.n > 0;
  return `<a class="rw fld" href="#/rx/${vid}?city=${x.c.id}">
    ${live ? `<span class="rw-lead" style="background:var(--${x.best && x.best.m < 60 ? "brass" : "jade"})"></span>` : ""}
    <span class="grow">
      <span class="rowb">
        <span class="t1" style="font-size:14.5px${live ? "" : ";opacity:.55"}">${esc(cityName(x.c))}</span>
        <span class="fld-marks" aria-hidden="true">${
          live ? Array.from({ length: marks }, (_, i) =>
            `<i class="${i === 0 && x.best && x.best.m < 60 ? "hot" : ""}"></i>`).join("")
          : `<i class="none"></i>`}</span>
      </span>
      <span class="t3" style="display:block;margin-top:5px">${
        live
          ? `<span class="num">${x.n}</span> ${isAR() ? (countAr(x.n, AR_PHARM_CONF)) : "confirming"} · ${x.best ? sigAge(x.best.m) : ""}`
          : x.stale
            ? (isAR() ? `<span class="num">${x.stale}</span> تأكيد قديم — لا نعدّه توفّراً` : `<span class="num">${x.stale}</span> stale — not counted`)
            : x.demand
              ? (isAR() ? `لا توفّر · <span class="num">${x.demand}</span> يدوّرون عليه` : `no supply · <span class="num">${x.demand}</span> looking`)
              : (isAR() ? "لا معلومة" : "no data")}</span>
    </span></a>`;
}

const sigAge = (m) => {
  if (isAR()) {
    if (m < 60) return `قبل ${countAr(Math.max(1, Math.round(m)), AR_MIN)}`;
    if (m < 1440) return `قبل ${countAr(Math.round(m / 60), AR_HOUR)}`;
    return `قبل ${countAr(Math.round(m / 1440), AR_DAY)}`;
  }
  return m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/* A medicine request, as published. Carries a city, a variant, a quantity
   band and an urgency — and nothing that could identify the person. */
function needCard(r, opts = {}) {
  const md = needMedOf(r); if (!md) return "";
  const u = URGENCY[r.urg];
  const st = reqState(r);
  return `<a class="rw${st === "expired" ? " quiet" : ""}" href="#/need/${r.id}">
    ${r.urg === "urgent" && st !== "expired" ? `<span class="rw-lead" style="background:var(--alarm)"></span>` : ""}
    <span class="grow">
      <span class="rowb">
        <span class="d3">${esc(md.name)} ${md.strength ? `<span class="n" style="font-weight:300">${esc(md.strength)}</span>` : ""}</span>
        <span class="st ${u.cls}"><i class="dot${r.urg === "urgent" ? " dot-live" : ""}"></i>${esc(urgShort(u))}</span>
      </span>
      <span class="q-sub" style="display:block">${md.form ? esc(md.form) + " · " : ""}${esc(r.qty)} · ${esc(needPlace(r))}</span>
      <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
        <span class="t3">${sigAge(r.m)}</span>
        ${st !== "expired" ? `<span class="st ${expiryHot(r) ? "st-e" : "st-q"}">${expiryHot(r) ? `<i class="dot dot-live"></i>` : ""}${expiryLabel(r)}</span>` : ""}
        ${(r.resp || []).length
          ? `<span class="st st-v"><i class="dot"></i>${isAR()
              ? `${countAr(r.resp.length, ["صيدلية ردّت", "صيدليتان ردّتا", "صيدليات ردّت", "صيدلية ردّت"])}`
              : `${r.resp.length} replied`}</span>`
          : `<span class="t3">${isAR() ? "بانتظار ردّ" : "awaiting a reply"}</span>`}
        ${opts.state !== false ? `<span class="t3">${esc(isAR() ? REQ_STATE_X[st].ar : REQ_STATE_X[st].en)}</span>` : ""}
      </span>
    </span></a>`;
}

/* ---------------- /explorer ----------------
   Discovery, not search. The premise a patient has to feel in the first two
   seconds is "maybe somebody in Iraq has this" — so the screen opens on the
   size of the network, then shows the needs going unanswered right now.
   Editorial, one idea per band, no grid of tiles. */
function screenExplorer() {
  const live = liveRequests();
  const urgent = live.filter((r) => r.urg === "urgent");
  const sigsLive = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL);
  const recent = sigsLive.filter((g) => sigAgeMin(g) < 360).sort((a, b) => sigAgeMin(a) - sigAgeMin(b)).slice(0, 4);
  const myCity = cityOf(anyFac(null)) && null;
  const here = S.exCity || "baghdad";
  const nearMe = live.filter((r) => r.city === here);
  /* Found elsewhere: a variant with no live supply in the user's city but
     confirmed somewhere else. This is the whole thesis in one rail. */
  const elsewhere = RX_MEDS.flatMap((m) => m.variants).map((v) => {
    const f = availabilityField(v.id);
    const mine = f.find((x) => x.c.id === here);
    const other = f.find((x) => x.c.id !== here && x.n > 0);
    return (!mine || mine.n === 0) && other ? { v, other } : null;
  }).filter(Boolean).slice(0, 4);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="pickExCity()">${esc(cityName(cityById(here)))}</button>
    </div>

    <div class="lab" style="margin-top:32px">${isAR() ? "شبكة توفّر الدواء" : "Medicine availability network"}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:10px">${sigsLive.length}</div>
    <div class="d2" style="margin-top:4px;font-weight:500">${isAR() ? "تأكيد توفّر حيّ في العراق" : "live confirmations across Iraq"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `من <span class="num">${allPharmacies().filter((f) => f.verified).length}</span> صيدلية موثّقة في <span class="num">${new Set(sigsLive.map((g) => cityOf(anyFac(g.fac)))).size}</span> محافظات. كل تأكيد ينتهي وحده بعد ثلاثة أيام.`
      : `from <span class="num">${allPharmacies().filter((f) => f.verified).length}</span> verified pharmacies in <span class="num">${new Set(sigsLive.map((g) => cityOf(anyFac(g.fac)))).size}</span> governorates. Every confirmation expires on its own after three days.`}</div>

    <div style="margin-top:24px" class="v2">
      <button class="btn" onclick="location.hash='#/rx'">${isAR() ? "دوّر على دواء صعب" : "Look for a hard-to-find medicine"}</button>
      <button class="btn btn--2" onclick="location.hash='#/need/new'">${isAR() ? "انشر حاجتك — الشبكة تدوّر عنك" : "Publish your need — the network searches"}</button>
    </div>
  </section>

  ${urgent.length ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="rowb" style="padding-top:24px">
      <span class="lab" style="color:var(--alarm)">${isAR() ? "مطلوب اليوم" : "Needed today"}</span>
      <span class="t3"><span class="num">${urgent.length}</span></span>
    </div>
    ${urgent.slice(0, 3).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  ${elsewhere.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "غير متوفّر عندك — لكنه موجود" : "Not near you — but it exists"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `ما لكينا تأكيداً في ${esc(cityName(cityById(here)))} — بس هذي الأدوية مؤكَّدة في محافظات ثانية.`
      : `Nothing confirmed in ${esc(cityName(cityById(here)))}, but confirmed elsewhere.`}</div>
    ${elsewhere.map(({ v, other }) => {
      const x = variantOf(v.id);
      return `<a class="rw" href="#/rx/${v.id}">
        <span class="rw-lead" style="background:var(--jade)"></span>
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(v.strength)}</span></span>
          <span class="q-sub" style="display:block">${isAR() ? "متوفّر في" : "available in"} <b>${esc(cityName(other.c))}</b> — <span class="num">${other.n}</span> ${isAR() ? "صيدلية" : "pharmacies"}</span>
          <span class="row" style="margin-top:9px"><span class="st st-t"><i class="dot"></i>${other.best ? sigAge(other.best.m) : ""}</span></span>
        </span></a>`;
    }).join('<div class="hr"></div>')}
  </section>` : ""}

  ${recent.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "تأكيدات وصلت للتو" : "Just confirmed"}</div>
    ${recent.map((g) => {
      const f = anyFac(g.fac), x = variantOf(g.v);
      if (!f || !x) return "";
      return `<a class="rw" href="#/rx/${g.v}">
        <span class="rw-lead"></span>
        <span class="av">${esc(initial(L(f)))}</span>
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
          <span class="q-sub" style="display:block">${esc(L(f))} — ${esc(cityName(cityById(cityOf(f))))}</span>
          <span class="row" style="margin-top:9px;gap:12px">
            <span class="st st-t"><i class="dot${sigAgeMin(g) < 60 ? " dot-live" : ""}"></i>${sigAge(sigAgeMin(g))}</span>
            ${f.verified ? `<span class="st st-v">${isAR() ? "صيدلية موثّقة" : "verified pharmacy"}</span>` : ""}
          </span>
        </span></a>`;
    }).join('<div class="hr"></div>')}
    <div class="t3" style="margin-top:14px">${isAR()
      ? "التوثيق يخص الصيدلية، لا الكمية. التوفّر إفادة من الصيدلية نفسها ويقدر يتغيّر بأي لحظة."
      : "Verification applies to the pharmacy, not to the stock. Availability is the pharmacy's own claim and can change at any moment."}</div>
  </section>` : ""}

  ${EXPLORER_TRENDS.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "الأكثر بحثاً" : "Most searched"}</div>
    <div class="chips chips--wrap" style="margin-top:14px">
      ${EXPLORER_TRENDS.map((tr) => { const x = variantOf(tr.v); return x
        ? `<a class="chip" href="#/rx/${tr.v}">${esc(L(x.med))} <span class="num" style="opacity:.6">${tr.n}</span></a>` : ""; }).join("")}
    </div>
  </section>` : ""}

  ${nearMe.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? `يدوّرون عليه في ${esc(cityName(cityById(here)))}` : `Wanted in ${esc(cityName(cityById(here)))}`}</div>
    ${nearMe.slice(0, 4).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin:30px 0 0">
    <a class="rowb" href="#/radar">
      <span class="t3">${isAR() ? "عندك صيدلية؟ شوف الطلبات اللي تكدر تجاوب عليها" : "Run a pharmacy? See the requests you can answer"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح الرادار" : "Open Radar"}</span>
    </a>
  </section>

  <section class="pad" style="margin:22px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? "قريب يعرض توفّراً وتواصلاً فقط — لا يبيع دواءً ولا يصرفه ولا يقترح بديلاً. الأدوية الموصوفة تبقى خاضعة للوصفة وللصيدلي المرخّص."
      : "Qareeb shows availability and opens a contact channel. It does not sell or dispense medicine and never suggests a substitute. Prescription medicines remain subject to a prescription and a licensed pharmacist."}</div>
  </section>
  ${nav("explorer")}`;
}

function pickExCity() {
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "من أي محافظة؟" : "Which governorate?"}</h2>
      <p>${isAR() ? "نستخدمها لترتيب النتائج فقط — ما نطلب عنوانك." : "Used only to order results — we never ask for your address."}</p></div></div>
    <div class="sheet-b">${CITIES.map((c) => `<button class="rw" onclick="setExCity('${c.id}')">
      <span class="grow"><span class="rowb">
        <span class="t1" style="font-size:14.5px">${esc(cityName(c))}</span>
        ${(S.exCity || "baghdad") === c.id ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "مختارة" : "selected"}</span>` : ""}
      </span></span></button>`).join('<div class="hr"></div>')}</div>`);
}
function setExCity(id) { S.exCity = id; LS.set("exCity", id); closeSheet(); render(); }


/* ---------------- /rx · variant search ---------------- */
function screenRxSearch() {
  const q = LS.get("rxq", "");
  const hits = q ? searchVariants(q) : [];
  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
    <div class="lab" style="margin-top:24px">${isAR() ? "بحث الدواء" : "Medicine search"}</div>
    <h1 class="d2" style="margin-top:8px">${isAR() ? "شنو الدواء بالضبط؟" : "Which exact medicine?"}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "اكتب الاسم التجاري أو العلمي، عربي أو إنكليزي. التركيز مهم — <b>2.5 ملغم</b> غير <b>50 ملغم</b>، وما نبدّل وحدة بالثانية."
      : "Brand or generic, Arabic or English. Strength matters — <b>2.5mg</b> is not <b>50mg</b>, and we never swap one for the other."}</div>
    <div class="search-field" style="margin-top:18px">${icon("search")}
      <input id="rxq" value="${esc(q)}" placeholder="${isAR() ? "زاريلتو ٢٠ · ميثوتركسات · Humira" : "Xarelto 20 · methotrexate · Humira"}"
        oninput="rxSearch(this.value)" autocomplete="off" enterkeyhint="search">
      ${q ? `<button class="clear-btn" onclick="rxSearch('');document.getElementById('rxq').value='';document.getElementById('rxq').focus()" aria-label="${isAR() ? "مسح" : "Clear"}">${icon("close")}</button>` : ""}
    </div>
  </section>

  ${q ? (hits.length ? `<section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "اختر التركيز والشكل" : "Pick the exact strength and form"}</div>
    ${hits.slice(0, 8).map(({ med, v, n }) => `<a class="rw" href="#/rx/${v.id}">
      ${n ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
      <span class="grow">
        <span class="d3" style="display:block">${esc(L(med))} <span class="n" style="font-weight:300">${esc(v.strength)}</span></span>
        <span class="q-sub" style="display:block">${esc(v.form)} · ${esc(v.pack)}${med.rx ? (isAR() ? " · بوصفة" : " · prescription") : ""}</span>
        <span class="row" style="margin-top:9px">${n
          ? `<span class="st st-v"><i class="dot"></i>${isAR() ? `<span class="num">${n}</span> صيدلية مؤكِّدة` : `<span class="num">${n}</span> confirming`}</span>`
          : `<span class="st st-q"><i class="dot"></i>${isAR() ? "لا تأكيد حالي" : "nothing confirmed"}</span>`}</span>
      </span></a>`).join('<div class="hr"></div>')}
  </section>` : `<section class="pad" style="margin-top:30px">
    <div class="empty" style="padding:26px 0">
      <div class="glyph"><i></i><i></i><i></i><b></b></div>
      <div class="empty-t">${isAR() ? `ما لكينا «${esc(q)}»` : `No match for "${esc(q)}"`}</div>
      <div class="empty-b">${isAR()
        ? "ممكن الاسم مكتوب بشكل ثاني، أو الدواء لسّه مو بقاعدتنا. انشر حاجتك وخلّي الشبكة تدوّر."
        : "The spelling may differ, or we don't carry it yet. Publish the need and let the network look."}</div>
      <button class="btn" style="margin-top:20px" onclick="location.hash='#/need/new'">${isAR() ? "انشر حاجتك" : "Publish your need"}</button>
    </div>
  </section>`) : `<section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "الأكثر بحثاً" : "Most searched"}</div>
    ${EXPLORER_TRENDS.map((tr) => { const x = variantOf(tr.v); if (!x) return "";
      const n = signalsFor(tr.v).filter((g) => g.state.k !== "stale").length;
      return `<a class="rw" href="#/rx/${tr.v}">
        ${n ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
          <span class="q-sub" style="display:block">${esc(x.v.form)}</span>
          <span class="row" style="margin-top:9px;gap:12px">
            <span class="t3"><span class="num">${tr.n}</span> ${isAR() ? "بحث" : "searches"}</span>
            ${n ? `<span class="st st-v"><i class="dot"></i><span class="num">${n}</span> ${isAR() ? "مؤكِّدة" : "confirming"}</span>`
                : `<span class="st st-q"><i class="dot"></i>${isAR() ? "لا تأكيد" : "none"}</span>`}
          </span>
        </span></a>`; }).join('<div class="hr"></div>')}
  </section>`}
  <div style="height:26px"></div>${nav("explorer")}`;
}

function rxSearch(v) { LS.set("rxq", v); const el = document.getElementById("rxq"); const p = el && el.selectionStart; render(); const e2 = document.getElementById("rxq"); if (e2) { e2.focus(); try { e2.setSelectionRange(p, p); } catch {} } }

/* ---------------- /rx/:variant · the availability field ---------------- */
function screenVariant(vid) {
  const x = variantOf(vid); if (!x) return screen404();
  const { med, v } = x;
  const field = availabilityField(vid);
  const sigs = signalsFor(vid);
  const liveSigs = sigs.filter((g) => g.state.k !== "stale");
  const staleSigs = sigs.filter((g) => g.state.k === "stale");
  const reqs = liveRequests().filter((r) => r.v === vid);
  const here = S.exCity || "baghdad";
  const mine = field.find((c) => c.c.id === here);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="location.hash='#/need/new?v=${vid}'">${isAR() ? "انشر حاجتك" : "Publish a need"}</button>
    </div>
    <div class="lab" style="margin-top:26px">${esc(med.cls_ar && isAR() ? med.cls_ar : "")}${med.rx ? (isAR() ? " · يُصرف بوصفة" : "Prescription only") : ""}</div>
    <h1 class="d1" style="margin-top:10px">${esc(L(med))} <span class="n" style="font-weight:300">${esc(v.strength)}</span></h1>
    <div class="q-sub" style="margin-top:6px">${esc(v.form)} · ${esc(v.pack)}${
      (v.alt || []).length ? ` · ${isAR() ? "يُباع أيضاً باسم" : "also sold as"} ${esc(v.alt.join("، "))}` : ""}</div>
  </section>

  <section class="pad" style="margin-top:26px">
    <div style="display:flex;align-items:baseline;gap:12px">
      <span class="nhuge" style="color:var(--${liveSigs.length ? "brass-ink" : "ink-3"})">${liveSigs.length}</span>
      <span><span class="d3" style="font-weight:500;display:block">${isAR()
        ? (countAr(liveSigs.length, AR_PHARM_CONF)) : "pharmacies confirming"}</span>
        <span class="q-sub">${isAR()
          ? `في <span class="num">${field.filter((c) => c.n > 0).length}</span> من <span class="num">${CITIES.length}</span> محافظة`
          : `across <span class="num">${field.filter((c) => c.n > 0).length}</span> of <span class="num">${CITIES.length}</span> governorates`}</span></span>
    </div>
    ${mine && mine.n === 0 ? `<div class="note note-w" style="margin-top:18px"><span>${isAR()
      ? `لا تأكيد في <b>${esc(cityName(mine.c))}</b>${field.find((c) => c.n > 0) ? ` — أقرب تأكيد في <b>${esc(cityName(field.find((c) => c.n > 0).c))}</b>.` : "."}`
      : `Nothing confirmed in <b>${esc(cityName(mine.c))}</b>${field.find((c) => c.n > 0) ? ` — nearest is <b>${esc(cityName(field.find((c) => c.n > 0).c))}</b>.` : "."}`}</span></div>` : ""}
  </section>

  <section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "أين قد يوجد في العراق" : "Where it might be, across Iraq"}</div>
    <div style="margin-top:6px">${field.filter((c) => c.n || c.stale || c.demand).map((c) => fieldRow(c, vid)).join('<div class="hr"></div>')}</div>
    <div class="t3" style="margin-top:14px">${isAR()
      ? "كل علامة = صيدلية أفادت بالتوفّر. النحاسية أحدث من ساعة. التأكيد ينتهي وحده بعد ثلاثة أيام."
      : "Each mark is one pharmacy's report. Brass is under an hour old. A report expires by itself after three days."}</div>
  </section>

  ${liveSigs.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "متوفّر الآن" : "Available now"}</div>
    ${liveSigs.slice(0, 6).map((g) => sigRow(g, vid)).join('<div class="hr"></div>')}
  </section>` : `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "لا تأكيد حالي في العراق" : "Nothing confirmed in Iraq right now"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "ما عدنا إفادة توفّر حية لهذا التركيز. انشر حاجتك — توصل الصيدليات الموثّقة اللي تكدر تجاوب."
      : "No live report for this exact presentation. Publish the need — it reaches the verified pharmacies that could answer."}</div>
    <button class="btn" style="margin-top:18px" onclick="location.hash='#/need/new?v=${vid}'">${isAR() ? "انشر حاجتك" : "Publish your need"}</button>
  </section>`}

  ${staleSigs.length ? `<section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "إفادات قديمة — لا نعدّها توفّراً" : "Stale reports — not counted as stock"}</div>
    <div style="margin-top:4px">${staleSigs.slice(0, 3).map((g) => sigRow(g, vid)).join('<div class="hr"></div>')}</div>
  </section>` : ""}

  ${reqs.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "يدوّرون عليه الآن" : "People looking for this"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `<span class="num">${reqs.length}</span> ${countAr(reqs.length, AR_REQ)} في ${esc([...new Set(reqs.map((r) => cityName(cityById(r.city))))].join("، "))}`
      : `<span class="num">${reqs.length}</span> active in ${esc([...new Set(reqs.map((r) => cityName(cityById(r.city))))].join(", "))}`}</div>
    ${reqs.slice(0, 3).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? `${med.rx ? "هذا دواء يُصرف بوصفة طبية؛ الصيدلي راح يطلبها. " : ""}قريب يدلّك على التوفّر ويفتح قناة تواصل — ما يبيع ولا يصرف ولا يقترح بديلاً. أي تبديل قرار طبيبك والصيدلي.`
      : `${med.rx ? "This is a prescription medicine; the pharmacist will ask for one. " : ""}Qareeb points to availability and opens a channel — it does not sell, dispense, or suggest a substitute. Any switch is your doctor's and pharmacist's call.`}</div>
  </section>
  ${nav("explorer")}`;
}

/* One pharmacy's claim. The verification mark and the freshness mark are
   deliberately rendered as two separate statements, never merged into one
   badge: the first is about the pharmacy, the second about the box. */
function sigRow(g, vid) {
  const st = g.state, stale = st.k === "stale";
  const c = cityById(cityOf(g.f));
  return `<div class="rw${stale ? " quiet" : ""}">
    ${stale ? "" : `<span class="rw-lead" style="background:var(--${sigAgeMin(g) < 60 ? "brass" : "jade"})"></span>`}
    <span class="av">${esc(initial(L(g.f)))}</span>
    <span class="grow">
      <span class="rowb">
        <span class="d3" style="font-size:17px">${esc(L(g.f))}</span>
        ${g.f.verified ? `<span class="mark">${isAR() ? "ختم" : "OK"}</span>` : ""}
      </span>
      ${fastBadge(g.fac) ? `<span style="display:block;margin-top:6px">${fastBadge(g.fac)}</span>` : ""}
      <span class="q-sub" style="display:block">${esc(cityName(c))}${g.f.area_ar && isAR() ? " — " + esc(g.f.area_ar) : g.f.district ? " — " + esc(L(DISTRICTS.find((d) => d.id === g.f.district))) : ""}</span>
      <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
        <span class="st ${stale ? "st-q" : "st-t"}${sigAgeMin(g) < 5 ? " fresh-live" : ""}">${stale ? "" : `<i class="dot${sigAgeMin(g) < 60 ? " dot-live" : ""}"></i>`}${
          isAR() ? `أفادت ${sigAge(sigAgeMin(g))}` : `reported ${sigAge(sigAgeMin(g))}`}</span>
        ${!stale ? `<span class="t3">${esc(L(QTY_LABEL[g.q]))}</span>` : ""}
        ${g.dl ? `<span class="t3">${isAR() ? "تقدر ترتّب توصيل" : "may arrange delivery"}</span>` : ""}
      </span>
      ${!stale ? `<span class="row" style="margin-top:10px">
        <button class="b-g" style="font-size:12.5px" onclick="contactPharmacy('${g.fac}','${vid}')">${isAR() ? "تواصل مع الصيدلية" : "Contact this pharmacy"}</button>
      </span>` : `<span class="row" style="margin-top:10px"><span class="t3">${isAR() ? "أقدم من ثلاثة أيام — اسأل قبل ما تتحرك" : "over three days old — ask before travelling"}</span></span>`}
    </span></div>`;
}


/* ==================================================================
   DEMAND-SIDE INTEGRITY
   ==================================================================
   The directory stays public — anyone can look up a pharmacy or a doctor
   without identifying themselves, and that is deliberate. But PUBLISHING a
   need puts a claim in front of real pharmacists and consumes their attention,
   so it costs something: a phone number, and a cap.

   Simulated OTP only. There is no backend; the code is generated client-side
   and the screen says so, because a fake security theatre that pretends to be
   real auth is worse than an honest placeholder.
------------------------------------------------------------- */
const MAX_ACTIVE_NEEDS = 3;

/* The build the service worker reports it is actually serving, once it
   answers. Null until then. */
let SW_BUILD = null;

/* The one string that answers "is what I am looking at the thing that was
   deployed?". Two sources: what this JS was stamped with, and what the
   service worker reports it is serving. Agreement prints once; disagreement
   prints both, because that IS the bug and hiding it would be the old
   mistake wearing a new coat. */
function buildLabel() {
  const app = CONFIG.build || "—";
  if (!SW_BUILD || SW_BUILD === app) return app;
  return app + " / " + SW_BUILD;
}

const myNeeds = () => LS.get("needs", []);
const myActiveNeeds = () => myNeeds().filter((r) => LIVE_STATES.includes(reqState(r)));
const isAuthed = () => !!LS.get("auth", null);
const authPhone = () => (LS.get("auth", null) || {}).phone || "";

/* Hidden trust score. A patient who publishes needs, gets pharmacies to
   answer, and then never opens the conversation is burning supply-side
   attention — the scarcest thing in this network. The score is never shown to
   the user and never gates the directory; it exists so operators can see
   attention being wasted, and so a future version can throttle it. */
function trustScore() {
  return LS.get("trust", { score: 100, published: 0, answered: 0, handoffs: 0, penalties: 0 });
}
function updateUserTrustScore(event, meta = {}) {
  const t = trustScore();
  if (event === "published") { t.published++; }
  if (event === "answered")  { t.answered++; }
  if (event === "handoff")   { t.handoffs++; }
  /* The penalty: a request that received a pharmacy response and was then
     abandoned without the patient ever opening the channel. Charged once per
     request, on expiry or withdrawal — never on publish, because wanting a
     medicine is not an offence. */
  if (event === "abandoned" && meta.hadResponse) { t.penalties++; t.score = Math.max(0, t.score - 12); }
  if (event === "handoff" && t.score < 100) { t.score = Math.min(100, t.score + 4); }
  LS.set("trust", t);
  return t;
}

/* Simulated OTP. Six digits, generated and shown on screen, labelled as a
   prototype. Nothing is sent anywhere. */
/* ================= BACKEND MODE =================
   The app runs in one of two modes and must never be vague about which.

     server  — /api/auth answered and is configured. Sessions are signed by
               a party the claimant does not control, and the audit chain is
               written where they cannot rewrite it.
     device  — no backend answered. The rules still hold (they live in the
               domain layer either way), but the credential check runs on the
               device of the person being checked, which is not a check.

   The difference is displayed wherever it matters and drives the launch
   readiness board, so "we have authentication" can never be true in the
   copy while being false in the deployment. Detection is one probe, cached,
   and never blocks a screen: a patient looking for a pharmacy at 2am does
   not wait on an auth endpoint. */
let BACKEND = { checked: false, server: false, detail: null };

async function probeBackend() {
  if (BACKEND.checked) return BACKEND;
  BACKEND.checked = true;
  try {
    const res = await fetch("/api/auth", { method: "GET", cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      BACKEND.server = !!j.configured;
      BACKEND.detail = j;
    }
  } catch { /* offline, or no functions deployed — device mode, silently */ }
  if (BACKEND.server && location.hash.startsWith("#/admin")) render();
  return BACKEND;
}

const backendMode = () => (BACKEND.server ? "server" : "device");

/* ================= THE DATA PLANE (client) =================
   Until this existed, a request was written to the patient's own device and
   nowhere else, so no pharmacist could ever see it. These four calls are the
   product's actual loop:

     publish  → POST /api/needs          the request leaves the device
     queue    → GET  /api/needs?city=    a pharmacy sees real requests
     answer   → POST /api/needs/answer   the claim is attributed and stored
     mine     → GET  /api/needs/mine     the patient reads their answers

   Every one degrades to the old local-only behaviour when the backend is
   absent, and the UI says which mode it is in rather than implying a network
   that is not there. Offline is not a failure state for a Baghdad phone; it
   is Tuesday. */
const NET = {
  on: false,          /* the data plane answered */
  checked: false,
};

async function probeDataPlane() {
  if (NET.checked) return NET;
  NET.checked = true;
  try {
    const res = await fetch("/api/needs", { method: "GET", cache: "no-store",
      headers: { accept: "application/json" } });
    /* 401 is a YES: the endpoint exists and is asking for a session. */
    NET.on = res.status === 401 || (res.ok && (await res.json()).dataPlane === true);
  } catch { NET.on = false; }
  return NET;
}

const netHeaders = () => {
  const ses = pharmacySession();
  return ses && ses.token
    ? { "content-type": "application/json", authorization: "Bearer " + ses.token }
    : { "content-type": "application/json" };
};

/* The owner tokens for requests this device published. They are the only
   way to read our own answers back, and they never leave this device except
   as a query parameter on our own request. */
const ownerTokens = () => LS.get("ownerTokens", {});
function rememberOwner(id, token) {
  const m = ownerTokens(); m[id] = token; LS.set("ownerTokens", m);
}

async function netPublish(rec) {
  /* What leaves the device is the domain layer's whitelist and nothing else
     — the landmark the patient typed stays here until they choose to send it
     inside a WhatsApp message they can read first. */
  const bc = QD.broadcastPayload(rec, medRecordOf(rec.v));
  if (!bc.ok) return { ok: false, reason: bc.reason };
  try {
    const res = await fetch("/api/needs", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: bc.payload }) });
    const j = await res.json();
    if (!res.ok || !j.ok) return { ok: false, reason: j.error || "HTTP_" + res.status, ar: j.ar };
    rememberOwner(j.id, j.ownerToken);
    return { ok: true, id: j.id, expiresAt: j.expiresAt };
  } catch { return { ok: false, reason: "OFFLINE" }; }
}

async function netQueue(city) {
  try {
    const res = await fetch("/api/needs?city=" + encodeURIComponent(city),
      { cache: "no-store", headers: netHeaders() });
    if (!res.ok) return null;
    const j = await res.json();
    return j.requests || [];
  } catch { return null; }
}

async function netAnswer(reqId, kind) {
  try {
    const res = await fetch("/api/needs/answer", { method: "POST",
      headers: netHeaders(), body: JSON.stringify({ requestId: reqId, kind }) });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json();
  } catch { return { ok: false, status: 0 }; }
}

async function netMine(id) {
  const t = ownerTokens()[id];
  if (!t) return null;
  try {
    const res = await fetch(`/api/needs/mine?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`,
      { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/* Remote requests arrive in the server's vocabulary; the screens speak the
   local one. One translation, in one place. */
function adoptRemote(r) {
  return {
    id: r.requestId, ref: r.requestId, v: r.variantId || null,
    manual: r.variantId ? null : { name: r.typedName, form: r.form, strength: r.strength },
    city: r.city, district: r.district || null, lm: "",
    qty: r.quantity || "", urg: r.urgency || "normal",
    rxHeld: r.prescriptionHeld === true, altOk: !!r.acceptsAlternative,
    st: r.state === "acknowledged" ? "acknowledged" : "broadcasting",
    resp: r.answeredBy || [], answers: {}, ts: r.createdAt, remote: true,
  };
}

/* ================= PHARMACY AUTHENTICATION =================
   Until now this did not exist, and its absence was the largest hole in the
   product: /radar trusted whoever opened the URL. A stranger could pick any
   verified pharmacy from a list, claim stock in its name, and every patient
   downstream would read that claim as coming from a licensed business. The
   whole trust model — "verification separates identity from stock claims" —
   rested on nothing.

   What follows is a real gate with an honest boundary. The RULES are in the
   domain layer and tested: role, licence status, and branch binding are
   checked on every claim, not just at the door. The CREDENTIAL CHECK is
   local to the device and clearly labelled as a prototype, because there is
   no backend to check a licence against — and a fake login that pretends to
   be real auth is worse than an honest placeholder, since it invites people
   to trust it. Swapping the check for a server call does not touch the rules.
------------------------------------------------------------- */
const pharmacySession = () => LS.get("pharmSession", null);

function pharmacyPrincipal() {
  const ses = pharmacySession();
  if (!ses) return QD.principalOf(null);
  /* A session older than 12 hours is not a session. A pharmacy phone left on
     a counter overnight must not still be able to claim stock in the morning
     without someone deciding to. */
  if (Date.now() - (ses.at || 0) > 12 * 3600 * 1000) return QD.principalOf(null);
  return QD.principalOf(ses);
}

const pharmacySignedIn = () => pharmacyPrincipal().role !== QD.ROLE.PATIENT;

function pharmacySignOut() {
  LS.set("pharmSession", null);
  S.myBranch = null; LS.set("myBranch", null);
  toast(isAR() ? "تم الخروج" : "Signed out");
  location.hash = "#/radar";
}

/* Why a claim was refused, in words a pharmacist can act on. A bare "no"
   loses a supply-side user permanently — they assume the app is broken. */
const AUTH_REASON = {
  NOT_A_PHARMACY: { ar: "هذا الحساب حساب مريض — تسجيل الصيدلية مطلوب لتأكيد التوفّر.", en: "This is a patient session — pharmacy sign-in is required to confirm stock." },
  LICENSE_EXPIRED: { ar: "إجازة الصيدلية منتهية. جدّدها قبل تأكيد أي توفّر.", en: "The pharmacy licence has expired." },
  LICENSE_UNVERIFIED: { ar: "الإجازة لم تُتحقّق بعد.", en: "The licence is not verified yet." },
  NO_BRANCH: { ar: "الحساب غير مرتبط بفرع.", en: "This account is not bound to a branch." },
  WRONG_BRANCH: { ar: "أنت مسجّل بفرع ثاني — ما تكدر تجاوب باسم هذا الفرع.", en: "You are signed in to a different branch." },
};
const authReason = (code) => (AUTH_REASON[code] ? (isAR() ? AUTH_REASON[code].ar : AUTH_REASON[code].en) : "");

function openPharmacyAuth(facId) {
  const f = anyFac(facId);
  if (!f) return;
  const code = String(Math.floor(100000 + (nowMins() * 6607) % 900000));
  S.pharmOtp = { code, facId, licence: "", phone: "" };
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "دخول الصيدلية" : "Pharmacy sign-in"}</div>
      <h2 style="margin-top:8px">${esc(L(f))}</h2>
      <p>${isAR()
        ? "تأكيد التوفّر يُنسب لهذه الصيدلية باسمها. لذلك ما نخليه مفتوحاً — الدليل يبقى مفتوح للكل، بس الإفادة بالتوفّر تحتاج تسجيل."
        : "A stock confirmation is attributed to this pharmacy by name. The directory stays open to everyone; claiming stock does not."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="field"><label for="lic">${isAR() ? "رقم إجازة الصيدلية" : "Pharmacy licence number"}</label>
        <input id="lic" type="text" inputmode="numeric" dir="ltr" placeholder="IQ-PH-000000"
          oninput="S.pharmOtp.licence=this.value"></div>
      <div class="field"><label for="pph">${isAR() ? "موبايل الصيدلي المسؤول" : "Responsible pharmacist mobile"}</label>
        <input id="pph" type="tel" inputmode="numeric" dir="ltr" placeholder="07XX XXX XXXX"
          oninput="S.pharmOtp.phone=this.value" autocomplete="tel"></div>
      <div class="field"><label for="potp">${isAR() ? "رمز التحقق" : "Verification code"}</label>
        <input id="potp" type="text" inputmode="numeric" dir="ltr" placeholder="------" autocomplete="one-time-code"></div>
      <div class="field"><label for="prole">${isAR() ? "صفتك" : "Your role"}</label>
        <select id="prole">
          <option value="VERIFIED_PHARMACIST">${isAR() ? "صيدلي مسؤول" : "Responsible pharmacist"}</option>
          <option value="PHARMACY_STAFF">${isAR() ? "موظّف صيدلية" : "Pharmacy staff"}</option>
        </select></div>
      ${BACKEND.server ? `
      <button class="btn btn--2" id="sendcode" style="margin-top:12px" onclick="requestPharmacyCode()">${isAR() ? "أرسل الرمز" : "Send code"}</button>
      <div class="note" style="margin-top:14px"><span>${isAR()
        ? "التحقق يتم على الخادم مقابل قائمة الإجازات المعتمدة. الرمز يُرسل لموبايل الصيدلي المسجّل."
        : "Verified on the server against the approved licence list."}</span></div>
      <div class="t3 mono" id="devcode" style="margin-top:8px"></div>`
      : `<div class="note note-w" style="margin-top:14px"><span>${isAR()
        ? `نموذج تجريبي — التحقق يتم على هذا الجهاز فقط، ولا يوجد خادم يتأكد من الإجازة. رمزك <b class="mono">${code}</b>.`
        : `Prototype — the check runs on this device only; no server verifies the licence. Code <b class="mono">${code}</b>.`}</span></div>`}
      <div class="t3" style="margin-top:12px">${isAR()
        ? "الصيدلي المسؤول وحده يكدر يفتح وصفة. الموظّف يكدر يفيد بالتوفّر بس."
        : "Only the responsible pharmacist can open a prescription. Staff can confirm stock only."}</div>
    </div>
    <div class="sheet-f">
      <button class="btn" onclick="submitPharmacyAuth()">${isAR() ? "دخول" : "Sign in"}</button>
    </div>`);
}

/* Ask the server to send a code. In device mode this is a no-op and the
   sheet keeps showing its own prototype code, labelled as such. */
async function requestPharmacyCode() {
  await probeBackend();
  if (!BACKEND.server) return;
  const o = S.pharmOtp || {};
  const btn = document.getElementById("sendcode");
  if (btn) { btn.disabled = true; btn.textContent = isAR() ? "جارٍ الإرسال…" : "Sending…"; }
  try {
    const res = await fetch("/api/auth", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "request", licence: (document.getElementById("lic") || {}).value || o.licence,
        phone: (document.getElementById("pph") || {}).value || o.phone }) });
    const j = await res.json();
    toast(j.ar || (isAR() ? "إذا كانت بياناتك مسجّلة راح يوصلك رمز" : "If your details are registered, a code is on the way"));
    /* Only present when the deployment explicitly enables echoing, which
       production must not. Shown rather than hidden so a misconfiguration
       is visible to whoever is testing instead of silently insecure. */
    if (j.devCode) {
      const el = document.getElementById("devcode");
      if (el) el.innerHTML = `<b class="mono">${esc(j.devCode)}</b> — <span style="color:var(--alarm)">QAREEB_DEV_ECHO_OTP</span>`;
    }
  } catch { toast(isAR() ? "ما وصلنا للخادم" : "Could not reach the server"); }
  if (btn) { btn.disabled = false; btn.textContent = isAR() ? "أرسل الرمز" : "Send code"; }
}

async function submitPharmacyAuth() {
  const o = S.pharmOtp || {};
  const lic = String((document.getElementById("lic") || {}).value || o.licence || "").trim();
  const entered = String((document.getElementById("potp") || {}).value || "").trim();
  const role = (document.getElementById("prole") || {}).value || "PHARMACY_STAFF";
  const phone = String((document.getElementById("pph") || {}).value || o.phone || "").trim();
  if (lic.length < 4) { toast(isAR() ? "اكتب رقم الإجازة" : "Enter the licence number"); return; }

  await probeBackend();
  if (BACKEND.server) {
    /* SERVER MODE. The session is whatever the server signs — the client
       does not choose its own role, branch or licence status, and cannot. */
    try {
      const res = await fetch("/api/auth", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", licence: lic, phone, code: entered, role }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { toast(j.ar || (isAR() ? "التحقق ما نجح" : "Verification failed")); return; }
      LS.set("pharmSession", {
        role: j.role, pharmacyId: j.pharmacyId, pharmacistId: j.pharmacistId,
        licence: lic, licenseStatus: j.licenseStatus, token: j.token, mode: "server", at: Date.now(),
      });
      S.myBranch = j.pharmacyId; LS.set("myBranch", j.pharmacyId);
      auditLog({ action: "PHARMACY_SIGNIN", actor: j.pharmacistId, pharmacyId: j.pharmacyId, reason: "licence " + lic });
      closeSheet(); haptic([15, 40, 15]);
      toast(isAR() ? "أهلاً — تكدر تجاوب على الطلبات" : "Signed in — you can answer requests");
      location.hash = "#/radar/" + j.pharmacyId;
      return;
    } catch { toast(isAR() ? "ما وصلنا للخادم" : "Could not reach the server"); return; }
  }

  /* DEVICE MODE. A prototype path must not be able to write the same words
     a verified server writes. It used to set licenseStatus:"VERIFIED", which
     made an anonymous visitor who typed an invented licence indistinguishable
     — in the data — from a pharmacy the server had actually checked. The two
     modes are now different strings, so nothing downstream can confuse them
     and every claim made this way can be rendered as self-asserted. */
  if (entered !== o.code) { toast(isAR() ? "الرمز غير صحيح" : "Wrong code"); return; }
  LS.set("pharmSession", {
    role, pharmacyId: o.facId, pharmacistId: "ph-" + lic,
    licence: lic, licenseStatus: "SELF_ASSERTED", mode: "device", at: Date.now(),
  });
  S.myBranch = o.facId; LS.set("myBranch", o.facId);
  auditLog({ action: "PHARMACY_SIGNIN", actor: "ph-" + lic, pharmacyId: o.facId, reason: "licence " + lic });
  closeSheet();
  haptic([15, 40, 15]);
  toast(isAR() ? "أهلاً — تكدر تجاوب على الطلبات" : "Signed in — you can answer requests");
  location.hash = "#/radar/" + o.facId;
}

/* ================= AUDIT LEDGER =================
   Append-only and hash-linked, so an entry cannot be quietly edited or
   removed. It records the things that need to be answerable later: who
   claimed stock, who opened a prescription, who handed off to WhatsApp.
   Its limits are stated where it is displayed — it lives on the device,
   which makes it tamper-EVIDENT, not tamper-proof. */
function auditLog(entry) {
  const chain = LS.get("audit", []);
  const next = QD.auditAppend(chain, Object.assign({ at: Date.now() }, entry));
  LS.set("audit", next.slice(-200));

  /* Mirror to the server chain when one exists. The device copy stays either
     way — it is what shows a pharmacist their own history offline — but the
     server copy is the one that counts as evidence, because the person being
     audited cannot rewrite it. Fire-and-forget: an audit write must never
     make a pharmacist wait, and a failed mirror must never lose their tap. */
  const ses = pharmacySession();
  if (BACKEND.server && ses && ses.token) {
    fetch("/api/audit", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + ses.token },
      body: JSON.stringify({ action: entry.action, subject: entry.subject, reason: entry.reason }),
    }).catch(() => {});
  }
  return next;
}

/* What a patient sees instead of a broadcast. It has to do real work: say
   plainly why this medicine is different, and hand over something usable —
   otherwise "we can't help" is all they hear, and they go looking somewhere
   with fewer scruples. */
function openControlledHandoff(med) {
  const licensed = allPharmacies().filter((f) => f.verified && cityOf(f) === (S.exCity || "baghdad")).slice(0, 4);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "دواء خاضع للرقابة" : "Controlled medicine"}</div>
      <h2 style="margin-top:8px">${esc(L(med))}</h2>
      <p>${isAR()
        ? "هذا الدواء خاضع للرقابة، وما ننشر طلبه على الصيدليات. سبب واضح: قائمة عامة بمن يطلب هذا الدواء ووين يسكن هي قائمة استهداف — مو خدمة."
        : "This medicine is controlled, so we do not broadcast a request for it. A public list of who wants it and where they live is a targeting list, not a service."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="note note-w"><span>${isAR()
        ? "الطريق الوحيد هو صيدلية مرخّصة بوصفة أصلية سارية. الصيدلي هو من يقرر الصرف، مو التطبيق."
        : "The only route is a licensed pharmacy with a valid original prescription. Dispensing is the pharmacist's decision, not the app's."}</span></div>
      <div class="lab" style="margin-top:20px">${isAR() ? "صيدليات مرخّصة قريبة" : "Licensed pharmacies nearby"}</div>
      ${licensed.length ? licensed.map((f) => `<a class="rw" href="#/pharmacy/${f.id}">
        <span class="grow">
          <span class="rowb"><span class="d3">${esc(L(f))}</span>
            <span class="mark">${isAR() ? "ختم" : "OK"}</span></span>
          <span class="q-sub" style="display:block">${esc(cityName(cityById(cityOf(f))))}${
            f.area_ar && isAR() ? " — " + esc(f.area_ar) : ""}</span>
        </span></a>`).join('<div class="hr"></div>')
        : `<div class="t3">${isAR() ? "ما عدنا صيدليات موثّقة مسجّلة بمحافظتك بعد." : "No verified pharmacies are registered in your governorate yet."}</div>`}
      <div class="t3" style="margin-top:16px">${isAR()
        ? "ما نسجّل هذا الطلب ولا نخزّن اسم الدواء مع رقمك."
        : "This request is not recorded, and the medicine name is not stored against your number."}</div>
    </div>
    <div class="sheet-f">
      <button class="btn btn--2" onclick="closeSheet()">${isAR() ? "فهمت" : "Understood"}</button>
    </div>`);
}

function openAuth(next) {
  const code = String(Math.floor(100000 + (nowMins() * 7919) % 900000));
  S.otp = { code, next: next || null, phone: "" };
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "قبل النشر" : "Before publishing"}</div>
      <h2 style="margin-top:8px">${isAR() ? "رقمك، مرة وحدة" : "Your number, once"}</h2>
      <p>${isAR()
        ? "الدليل مفتوح للكل بدون تسجيل. بس نشر طلب يوصل صيدليات حقيقية، فنطلب رقم — حتى ما تنملي الشبكة بطلبات وهمية."
        : "The directory is open to everyone. But publishing puts a request in front of real pharmacists, so we ask for a number — it keeps the network from filling with ghosts."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="field"><label for="ph">${isAR() ? "رقم الموبايل" : "Mobile number"}</label>
        <input id="ph" type="tel" inputmode="numeric" dir="ltr" placeholder="07XX XXX XXXX"
          oninput="S.otp.phone=this.value" autocomplete="tel"></div>
      <div class="field"><label for="otp">${isAR() ? "رمز التحقق" : "Verification code"}</label>
        <input id="otp" type="text" inputmode="numeric" dir="ltr" placeholder="------" autocomplete="one-time-code"></div>
      <div class="note note-w" style="margin-top:14px"><span>${isAR()
        ? `نموذج تجريبي — ما نرسل رسالة. رمزك هو <b class="mono">${code}</b>.`
        : `Prototype — no SMS is sent. Your code is <b class="mono">${code}</b>.`}</span></div>
      <div class="t3" style="margin-top:12px">${isAR()
        ? "الرقم يبقى على هذا الجهاز. ما ننشره مع الطلب ولا نعطيه للصيدلية — التواصل يبدأ منك."
        : "The number stays on this device. It is never published with the request or given to a pharmacy — contact starts from you."}</div>
    </div>
    <div class="sheet-f">
      <button class="btn" onclick="submitAuth()">${isAR() ? "تحقّق" : "Verify"}</button>
    </div>`);
}

function submitAuth() {
  const phone = (document.getElementById("ph") || {}).value || "";
  const entered = ((document.getElementById("otp") || {}).value || "").trim();
  if (phone.replace(/\D/g, "").length < 10) { toast(isAR() ? "اكتب رقم موبايل صحيح" : "Enter a valid mobile number"); return; }
  if (entered !== S.otp.code) { toast(isAR() ? "الرمز غير مطابق" : "Code doesn't match"); return; }
  LS.set("auth", { phone: phone.trim(), at: Date.now() });
  const next = S.otp.next; S.otp = null;
  closeSheet();
  /* The gate interrupted a tap on "publish". Making the patient tap it again
     after verifying punishes them for complying — resume the exact action
     they already took, now that it is allowed. */
  if (next === "#/need/new" && S.draft && S.draft.v && String(S.draft.qty || "").trim()) {
    toast(isAR() ? "تم التحقق" : "Verified");
    publishNeed();
    return;
  }
  toast(isAR() ? "تم — تكدر تنشر طلبك" : "Verified — you can publish");
  if (next) location.hash = next; else render();
}

function signOut() { LS.set("auth", null); toast(isAR() ? "خرجت" : "Signed out"); render(); }

/* ---------------- /need/new · publishing a need ----------------
   Not a form. A person hunting a rare medicine is already tired, so this
   asks the fewest things a pharmacist actually needs to answer "can I help":
   which exact presentation, which governorate, how much, how soon. No name,
   no age, no diagnosis, no phone. The channel opens later, from their own
   WhatsApp, only after they choose someone. */
function screenNeedNew(qs) {
  const pre = new URLSearchParams(qs || "").get("v");
  const d = S.draft || (S.draft = { v: pre || null, manual: null, city: S.exCity || "baghdad",
    district: null, lm: "", qty: "", urg: "high", rxHeld: null, altOk: false });
  if (pre && d.v !== pre) { d.v = pre; d.manual = null; }
  const x = d.v ? variantOf(d.v) : null;
  const m = d.manual;

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
    <div class="lab" style="margin-top:24px">${isAR() ? "انشر حاجتك" : "Publish a need"}</div>
    <h1 class="d2" style="margin-top:8px">${isAR() ? "خلّي الشبكة تدوّر بدالك" : "Let the network do the searching"}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "يوصل طلبك للصيدليات الموثّقة اللي تكدر تجاوب. ما ننشر اسمك ولا رقمك ولا أي شي عن حالتك."
      : "Your request reaches the verified pharmacies that could answer. We never publish your name, your number, or anything about your condition."}</div>
  </section>

  <section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "١ · الدواء بالضبط" : "1 · The exact medicine"}</div>
    ${x ? `<div class="plate" style="margin-top:12px">
      <div class="rowb">
        <span><span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
          <span class="q-sub">${esc(x.v.form)} · ${esc(x.v.pack)}</span></span>
        <button class="b-g" style="font-size:12px" onclick="S.draft.v=null;render()">${isAR() ? "غيّر" : "Change"}</button>
      </div>
      ${x.med.rx ? `<div class="t3" style="margin-top:10px;border-top:1px solid var(--dial-line-2);padding-top:10px">${isAR()
        ? "يُصرف بوصفة — الصيدلي راح يطلب الوصفة عند الاستلام."
        : "Prescription only — the pharmacist will ask for it on collection."}</div>` : ""}
    </div>`
    : m ? `<div style="margin-top:12px">
      <div class="field" style="margin-top:0"><label for="mname">${isAR() ? "اسم الدواء — تجاري أو علمي" : "Medicine name — brand or generic"}</label>
        <input id="mname" value="${esc(m.name || "")}" placeholder="${isAR() ? "مثلاً أوجمنتين أو أموكسيسيلين" : "e.g. Augmentin or amoxicillin"}"
          oninput="S.draft.manual.name=this.value;syncPublish()" autocomplete="off"></div>
      <div class="lab" style="margin-top:16px">${isAR() ? "الشكل الدوائي" : "Dosage form"}</div>
      <div class="chips chips--wrap" style="margin-top:10px">
        ${RX_FORMS.map((f2) => `<button class="chip ${m.form === f2 ? "on" : ""}" onclick="S.draft.manual.form='${esc(f2)}';render()">${esc(f2)}</button>`).join("")}
      </div>
      <div class="lab" style="margin-top:16px">${isAR() ? "التركيز — إن كان معروفاً" : "Strength — if known"}</div>
      <div class="row" style="gap:8px;margin-top:10px;align-items:stretch">
        <div class="field grow" style="margin-top:0"><label for="mstr" class="sr-hide" style="display:none"></label>
          <input id="mstr" inputmode="decimal" dir="ltr" value="${esc((m.strength || "").replace(/[^\d.]/g, ""))}"
            placeholder="500" oninput="S.draft.manual.num=this.value;S.draft.manual.strength=(this.value?this.value+' '+(S.draft.manual.unit||'ملغم'):'')"></div>
      </div>
      <div class="chips" style="margin-top:8px">
        ${RX_UNITS.map((u2) => `<button class="chip ${(m.unit || "ملغم") === u2 ? "on" : ""}"
          onclick="S.draft.manual.unit='${esc(u2)}';S.draft.manual.strength=(S.draft.manual.num?S.draft.manual.num+' '+u2:'');render()">${esc(u2)}</button>`).join("")}
      </div>
      <button class="b-g" style="font-size:12.5px;margin-top:12px" onclick="S.draft.manual=null;render()">${isAR() ? "رجوع لقائمة الأدوية" : "Back to the catalogue"}</button>
    </div>`
    : `<div class="v2" style="margin-top:12px">
      <a class="btn btn--2" href="#/rx">${isAR() ? "اختر من القائمة" : "Pick from the catalogue"}</a>
      <button class="btn btn--2" onclick="S.draft.manual={name:'',form:null,strength:'',unit:'ملغم'};render()">${isAR()
        ? "الدواء مو بالقائمة؟ اكتبه بنفسك" : "Not in the list? Type it yourself"}</button>
    </div>`}
    ${x || m ? "" : `<div class="t3" style="margin-top:10px">${isAR()
      ? "أدوية القائمة تظهر بحقل التوفّر الوطني. المكتوب يدوياً يوصل الصيدليات مثله مثلها."
      : "Catalogue medicines get the national field; typed ones still reach pharmacies the same way."}</div>`}
  </section>

  <section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "٢ · وين أنت" : "2 · Where you are"}</div>
    <div class="chips chips--wrap" style="margin-top:12px">
      ${CITIES.map((c) => `<button class="chip ${d.city === c.id ? "on" : ""}" onclick="S.draft.city='${c.id}';S.draft.district=null;render()">${esc(cityName(c))}</button>`).join("")}
    </div>
    ${d.city === "baghdad" ? `
    <div class="lab" style="margin-top:16px">${isAR() ? "المنطقة" : "District"}</div>
    <div class="chips chips--wrap" style="margin-top:10px">
      ${DISTRICTS.map((dd) => `<button class="chip ${d.district === dd.id ? "on" : ""}" onclick="S.draft.district='${dd.id}';syncPublish();render()">${esc(L(dd))}</button>`).join("")}
    </div>` : ""}
    <div class="field"><label for="lm">${isAR() ? "نقطة دالة قريبة — اختياري" : "Nearby landmark — optional"}</label>
      <input id="lm" value="${esc(d.lm || "")}" placeholder="${isAR() ? "مثلاً قرب مستشفى اليرموك" : "e.g. near Yarmouk Hospital"}"
        oninput="S.draft.lm=this.value" autocomplete="off"></div>
    <div class="t3" style="margin-top:8px">${isAR()
      ? "المنطقة تساعد الصيدلية تقدّر المسافة. ما نطلب عنوان بيت أبداً."
      : "The district helps a pharmacy judge distance. We never ask for a home address."}</div>
  </section>

  <section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "٣ · شكد تحتاج" : "3 · How much"}</div>
    ${(() => {
      /* One hand, a sick child in the other: the common quantities are chips,
         so publishing needs zero typing. The variant's own pack size leads,
         because "one pack of what the doctor wrote" is the answer nine times
         out of ten. Free input stays for the tenth. */
      const packs = (x ? [x.v.pack] : []).concat([
        isAR() ? "علبة واحدة" : "1 pack",
        isAR() ? "علبتان" : "2 packs",
        isAR() ? "شريط واحد" : "1 strip",
      ]).filter((v, i, a) => a.indexOf(v) === i);
      return `<div class="chips chips--wrap" style="margin-top:12px">
        ${packs.map((q) => `<button class="chip ${d.qty === q ? "on" : ""}" data-qtychip
          onclick="S.draft.qty='${esc(q)}';document.getElementById('qty').value='${esc(q)}';syncPublish();this.parentElement.querySelectorAll('.chip').forEach(e=>e.classList.remove('on'));this.classList.add('on')">${esc(q)}</button>`).join("")}
      </div>`;
    })()}
    <div class="field"><label for="qty">${isAR() ? "أو اكتبها" : "Or type it"}</label>
      <input id="qty" value="${esc(d.qty)}" placeholder="${x ? esc(x.v.pack) : (isAR() ? "مثلاً ٣٠ قرص" : "e.g. 30 tablets")}"
        oninput="S.draft.qty=this.value;syncPublish()" autocomplete="off"></div>
  </section>

  <section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "٤ · شكد مستعجل" : "4 · How urgent"}</div>
    <div class="v2" style="margin-top:12px">
      ${Object.entries(URGENCY).map(([k, u]) => `<button class="btn ${d.urg === k ? "" : "btn--2"}" onclick="S.draft.urg='${k}';render()">
        ${esc(isAR() ? u.ar : u.en)}</button>`).join("")}
    </div>
  </section>

  <section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "٥ · البديل بنفس المادة الفعالة" : "5 · Same-ingredient alternative"}</div>
    <div class="rowb" style="margin-top:12px;border:1px solid var(--dial-line);border-radius:var(--r);padding:14px 16px;min-height:56px">
      <span class="grow" style="text-align:start">
        <span class="t1" style="font-size:14px;display:block">${isAR()
          ? "أقبل بديلاً تجارياً بنفس المادة والتركيز" : "I accept a brand alternative, same ingredient and strength"}</span>
        <span class="t3">${isAR()
          ? "اقتراح البديل قرار الصيدلي المرخّص — إحنا ننقل موافقتك فقط."
          : "Proposing it is the licensed pharmacist's call — we only carry your consent."}</span>
      </span>
      <button class="btn btn--2 btn--sm" style="width:auto" id="altbtn"
        onclick="S.draft.altOk=!S.draft.altOk;this.textContent=S.draft.altOk?'${isAR() ? "نعم" : "Yes"}':'${isAR() ? "لا" : "No"}';this.classList.toggle('chip-on',S.draft.altOk)">${d.altOk ? (isAR() ? "نعم" : "Yes") : (isAR() ? "لا" : "No")}</button>
    </div>
    <div class="t3" style="margin-top:12px">${isAR()
      ? "عندك صورة وصفة أو علبة قديمة؟ دزّها للصيدلية بالواتساب مباشرة بعد ما ترد — ما نخزن صوراً طبية، وخصوصيتها تبقى بينكم."
      : "Have a prescription or old-box photo? Send it to the pharmacy directly in WhatsApp once they reply — we never store medical images, and it stays between you."}</div>
  </section>

  ${x && x.med.rx ? `<section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "٥ · الوصفة" : "5 · Prescription"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "ما نطلب صورة الوصفة ولا نقراها. نعرضها كإشارة فقط، حتى الصيدلي يعرف شنو يتوقّع."
      : "We don't ask for a photo and we never read one. It's shown only as a signal, so the pharmacist knows what to expect."}</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn ${d.rxHeld === true ? "" : "btn--2"}" style="flex:1" onclick="S.draft.rxHeld=true;render()">${isAR() ? "عندي وصفة" : "I have one"}</button>
      <button class="btn ${d.rxHeld === false ? "" : "btn--2"}" style="flex:1" onclick="S.draft.rxHeld=false;render()">${isAR() ? "ما عندي" : "Not yet"}</button>
    </div>
    ${d.rxHeld === false ? `<div class="note note-w" style="margin-top:12px"><span>${isAR()
      ? "بدون وصفة ما يقدر الصيدلي يصرف هذا الدواء. ينفع تنشر الطلب حتى تعرف التوفّر، بس راجع طبيبك للوصفة."
      : "Without a prescription a pharmacist cannot dispense this. You can still publish to find availability, but see your doctor for the prescription."}</span></div>` : ""}
  </section>` : ""}

  <section class="pad" style="margin-top:28px">
    ${(() => {
      const active = myActiveNeeds().length;
      const capped = active >= MAX_ACTIVE_NEEDS;
      const incomplete = !draftReady(d);
      return `<button class="btn" id="pubbtn" ${incomplete || capped ? "disabled" : ""} onclick="publishNeed()">${
        capped ? (isAR() ? "وصلت الحد الأقصى" : "You've hit the limit")
        : isAuthed() ? (isAR() ? "انشر الطلب" : "Publish the request")
        : (isAR() ? "تحقّق وانشر" : "Verify and publish")}</button>
      ${capped ? `<div class="note note-w" style="margin-top:12px"><span>${isAR()
        ? `عندك <b class="num">${active}</b> طلبات نشطة، وهذا الحد. سكّر واحداً من «طلباتي» — الحد موجود حتى ينتبه الصيدلاني للطلبات الحقيقية.`
        : `You have <b class="num">${active}</b> active requests, which is the cap. Close one from My requests — the cap exists so pharmacists keep paying attention to real ones.`}</span></div>`
        : `<div class="t3" style="margin-top:12px">${isAR()
        ? `<span class="num">${active}</span> من <span class="num">${MAX_ACTIVE_NEEDS}</span> طلبات نشطة.`
        : `<span class="num">${active}</span> of <span class="num">${MAX_ACTIVE_NEEDS}</span> active requests.`}</div>`}`;
    })()}
    <div class="note note-w" style="margin-top:14px"><span>${isAR()
      ? "تأكيد التوفّر لا يعني الحجز. الأولوية لمن يصل أولاً أو يتفق مع الصيدلية."
      : "A confirmation of availability is not a reservation. Priority goes to whoever arrives first or agrees it with the pharmacy."}</span></div>
    <div class="t3" style="margin-top:12px">${isAR()
      ? `ينتهي الطلب وحده — العاجل خلال <span class="num">6</span> ساعات، والباقي أطول. تكدر تسحبه بأي وقت من «طلباتي».`
      : `The request expires on its own — urgent within <span class="num">6</span> hours, others longer. Withdraw any time from My requests.`}</div>
  </section>
  <div style="height:26px"></div>${nav("explorer")}`;
}

/* Keep the publish control honest against what is actually typed, without a
   full re-render on every keystroke (which would steal focus mid-word). */
/* Whether a draft may be published. There used to be two answers to this
   question — one computed at render time, one in syncPublish — and they
   disagreed in BOTH directions: a typed medicine went disabled on any
   re-render (tap urgency, lose your publish button), and a Baghdad draft
   with no district went ENABLED on re-render, past the guard. One predicate,
   called from both places, is the only way two answers cannot drift. */
function draftReady(d) {
  if (!d) return false;
  const medOk = !!d.v || !!(d.manual && String(d.manual.name || "").trim().length >= 3);
  const locOk = d.city !== "baghdad" || !!d.district;
  return medOk && locOk && !!String(d.qty || "").trim();
}

function syncPublish() {
  const b = document.getElementById("pubbtn"); if (!b) return;
  const d = S.draft || {};
  const medOk = !!d.v || !!(d.manual && String(d.manual.name || "").trim().length >= 3);
  const locOk = d.city !== "baghdad" || !!d.district;   /* district data exists for Baghdad only */
  b.disabled = !draftReady(d) || myActiveNeeds().length >= MAX_ACTIVE_NEEDS;
}

/* The medicine record behind a draft or request, when it came from the
   catalogue. A typed name has none, which is exactly why typed names cannot
   be screened for control status and are handled further down. */
function medRecordOf(variantId) {
  if (!variantId) return null;
  const x = variantOf(variantId);
  return x ? x.med : null;
}

/* A typed name that matches a controlled medicine's own name or aliases.
   Catching this matters: the whole point of manual entry is that the patient
   could not find it in the catalogue, and "I could not find it" is exactly
   how a controlled medicine would otherwise slip into a public broadcast. */
function typedLooksControlled(name) {
  const q = norm(String(name || ""));
  if (q.length < 3) return null;
  return RX_MEDS.filter((m) => m.controlled).find((m) =>
    norm(m.ar).includes(q) || q.includes(norm(m.ar)) ||
    norm(m.en).includes(q) || (m.alias || []).some((a) => norm(a) === q || q.includes(norm(a)))
  ) || null;
}

function publishNeed() {
  const d = S.draft; if (!d) return;
  const medOk = !!d.v || !!(d.manual && String(d.manual.name || "").trim().length >= 3);
  if (!medOk || !d.qty.trim()) return;

  /* CONTROLLED: refused before anything is written, and the refusal is the
     domain layer's, not this screen's. The patient is not left at a dead end
     — they get the licensed-pharmacy route, which is the only lawful one. */
  const med = d.v ? medRecordOf(d.v) : typedLooksControlled(d.manual && d.manual.name);
  if (med && QD.isControlled(med)) { openControlledHandoff(med); return; }
  if (d.city === "baghdad" && !d.district) { toast(isAR() ? "اختر منطقتك" : "Pick your district"); return; }
  if (!isAuthed()) return openAuth("#/need/new");
  if (myActiveNeeds().length >= MAX_ACTIVE_NEEDS) {
    toast(isAR() ? `الحد ${MAX_ACTIVE_NEEDS} طلبات نشطة — سكّر واحداً` : `Limit is ${MAX_ACTIVE_NEEDS} active — close one first`);
    return;
  }
  const ref = refCode();
  const rec = { id: "u" + ref, ref, v: d.v || null,
    manual: d.v ? null : { name: d.manual.name.trim(), form: d.manual.form, strength: d.manual.strength },
    city: d.city, district: d.district, lm: (d.lm || "").trim(),
    qty: d.qty.trim(), urg: d.urg, rxHeld: d.rxHeld, altOk: !!d.altOk,
    m: 0, st: "broadcasting", resp: [], answers: {}, ts: Date.now(), mine: true };
  const mineList = LS.get("needs", []);
  LS.set("needs", [rec, ...mineList].slice(0, 20));
  REQUESTS.unshift(rec);
  S.draft = null;
  /* What actually goes out to pharmacies is built by the domain layer's
     whitelist, so a field added to the request later cannot leak by default.
     The landmark the patient typed stays on their device until they choose
     to send it in a WhatsApp message they can read first. */
  const bc = QD.broadcastPayload(rec, medRecordOf(rec.v));
  if (!bc.ok) { openControlledHandoff(medRecordOf(rec.v) || { ar: "دواء", en: "Medicine" }); return; }
  rec.broadcast = bc.payload;

  updateUserTrustScore("published");
  auditLog({ action: "REQUEST_PUBLISHED", subject: rec.id, reason: rec.urg });
  haptic([15, 40, 15]);

  /* Send it. The screen has already moved — a patient must never wait on a
     radio to find out their request was accepted — and if the send fails the
     request stays local and the wait screen says so instead of pretending. */
  if (NET.on) {
    netPublish(rec).then((r) => {
      if (r.ok) {
        rec.serverId = r.id; rec.published = true;
        const list = LS.get("needs", []);
        const mine = list.find((x) => x.id === rec.id);
        if (mine) { mine.serverId = r.id; mine.published = true; LS.set("needs", list); }
      } else {
        rec.published = false; rec.publishError = r.reason;
        if (r.reason === "CONTROLLED") toast(r.ar || (isAR() ? "دواء خاضع للرقابة" : "Controlled medicine"));
      }
      if (location.hash.includes("/wait/")) render();
    });
  }
  toast(isAR() ? "نُشر — يوصل الصيدليات الموثّقة" : "Published — it reaches verified pharmacies");
  location.hash = "#/wait/" + rec.id;
}

/* The ticker: advances the radar copy over time and pulses the haptic once
   per wave. Torn down on navigation so it can never leak or double up. */
let radarTick = null;
function startRadarTicker() {
  if (radarTick) { clearInterval(radarTick); radarTick = null; }
  const el = document.getElementById("radarcopy");
  if (!el) return;
  const id = location.hash.split("/")[2];
  const r = REQUESTS.find((x) => x.id === id) || LS.get("needs", []).find((x) => x.id === id);
  if (!r) return;
  const t0 = Date.now();
  haptic([10]);

  /* The patient's side of the loop. Their request now lives on a server, so
     an answer arrives from outside this device and nothing on screen would
     ever learn about it without asking. Polled rather than pushed because a
     push channel is a whole other system; 15s is well inside the time a
     pharmacist takes to reach a shelf. */
  let poll = null;
  if (NET.on && r.serverId) {
    const check = async () => {
      if (!document.getElementById("radarcopy")) { clearInterval(poll); return; }
      const j = await netMine(r.serverId);
      if (!j || !j.answers || !j.answers.length) return;
      /* Adopt the answers into the local record so every existing screen —
         the match list, the contact sheet — keeps working unchanged. */
      r.resp = [...new Set(j.answers.map((a) => a.pharmacyId))];
      r.answers = {};
      for (const a of j.answers) r.answers[a.pharmacyId] = a.kind;
      r.answerStatus = {};
      for (const a of j.answers) r.answerStatus[a.pharmacyId] = a.licenseStatus;
      reqTransition(r, "acknowledged");
      const list = LS.get("needs", []);
      const mine = list.find((x) => x.id === r.id);
      if (mine) { mine.resp = r.resp; mine.answers = r.answers; mine.st = r.st; LS.set("needs", list); }
      clearInterval(poll);
      haptic([30, 50, 30]);
      render();
    };
    check();
    poll = setInterval(check, 15000);
  }

  radarTick = setInterval(() => {
    const node = document.getElementById("radarcopy");
    if (!node) { clearInterval(radarTick); radarTick = null; if (poll) clearInterval(poll); return; }
    const secs = Math.floor((Date.now() - (r.ts || t0)) / 1000);
    const next = radarCopy(r, secs);
    if (node.innerHTML !== next) {
      node.style.opacity = "0";
      setTimeout(() => { node.innerHTML = next; node.style.opacity = "1"; }, 180);
    }
    /* One soft pulse per wave cycle, matching what the eye sees. */
    if (secs % 3 === 0) haptic([10]);
  }, 1000);
}

/* ==================================================================
   THE RADAR — waiting, made bearable and made honest
   ==================================================================
   A spinner tells an anxious person nothing except that time is passing. The
   radar tells them the true thing instead: their request is visible right now
   to a specific number of verified pharmacies, in named governorates, and it
   is still live.

   Every number on it is counted from the model at render time. The copy says
   "ظاهر الآن لـ N صيدلية" — visible to N pharmacies — and never "جارِ البحث في
   N صيدلية", because nothing is being searched. There is no server polling
   anyone. Claiming an active sweep would be the same fabrication as a
   delivery receipt, and it would collapse the moment a patient asked a
   pharmacist whether their phone had rung.

   The wave is jade, not cyan. Jade is this product's one meaning for trust
   and for "the network is working"; a fourth colour with no meaning would
   make the other three mean less.
------------------------------------------------------------- */
function radarReach(r) {
  const inCity = allPharmacies().filter((f) => cityOf(f) === r.city && f.verified);
  /* Plus any verified branch anywhere that has ever reported this exact
     variant. A typed medicine has no variant id, so its reach is honestly
     the same-governorate set — and the copy reflects whatever this returns. */
  const holders = r.v ? allPharmacies().filter((f) => f.verified && cityOf(f) !== r.city &&
    SIGNALS.some((g) => g.fac === f.id && g.v === r.v)) : [];
  const cities = [...new Set([...inCity, ...holders].map((f) => cityOf(f)))];
  return { n: inCity.length + holders.length, inCity: inCity.length, holders: holders.length, cities };
}

/* Copy that changes as the wait lengthens — each line true at the moment it
   appears, and the last one hands control back rather than asking for more
   patience. */
function radarCopy(r, secs) {
  const reach = radarReach(r);
  const city = cityName(cityById(r.city));
  if (secs < 3) {
    return isAR() ? "جارِ نشر نداءك على الشبكة…" : "Publishing your request to the network…";
  }
  if (secs < 10) {
    return isAR()
      ? `نداؤك ظاهر الآن لـ <b class="num">${reach.n}</b> صيدلية موثّقة في ${esc(city)}${
          reach.holders ? ` و${countAr(reach.cities.length - 1, ["محافظة أخرى", "محافظتين أخريين", "محافظات أخرى", "محافظةً أخرى"])}` : ""}.`
      : `Your request is now visible to <b class="num">${reach.n}</b> verified pharmacies in ${esc(city)}${
          reach.holders ? ` and ${reach.cities.length - 1} other governorates` : ""}.`;
  }
  return isAR()
    ? `الصيدليات تراجع رفوفها. تكدر تكمّل تصفّح — الطلب شغّال، و<b>${expiryLabel(r)}</b>.`
    : `Pharmacies are checking their shelves. Keep browsing — the request stays live, and <b>${expiryLabel(r)}</b>.`;
}

/* The radar itself. Three expanding rings, a core, and nodes placed at fixed
   angles rather than at random — a node that jumps position between frames
   reads as noise, not as a pharmacy. */
function radarPulse(r) {
  const reach = radarReach(r);
  const nodes = Math.min(reach.n, 7);
  return `<div class="radar" id="radar" role="img"
      aria-label="${isAR() ? `نداؤك ظاهر لـ ${reach.n} صيدلية موثّقة` : `Visible to ${reach.n} verified pharmacies`}">
    <span class="radar-w" style="--d:0s"></span>
    <span class="radar-w" style="--d:.83s"></span>
    <span class="radar-w" style="--d:1.66s"></span>
    ${Array.from({ length: nodes }, (_, i) => {
      const a = (360 / nodes) * i - 90;
      const rad = 62 + (i % 3) * 14;
      return `<span class="radar-n" style="--x:${(Math.cos(a * Math.PI / 180) * rad).toFixed(1)}px;--y:${(Math.sin(a * Math.PI / 180) * rad).toFixed(1)}px;--d:${(i * 0.34).toFixed(2)}s"></span>`;
    }).join("")}
    <span class="radar-core"><b class="num">${reach.n}</b></span>
  </div>`;
}

/* The wait screen. Reachable while a request of the patient's own is live. */
function screenRadarWait(id) {
  const r = REQUESTS.find((x) => x.id === id) || LS.get("needs", []).find((x) => x.id === id);
  if (!r) return screen404();
  const x = needMedOf(r); if (!x) return screen404();
  const st = reqState(r);
  const reach = radarReach(r);
  const secs = Math.floor((Date.now() - (r.ts || Date.now())) / 1000);

  /* Answered already? Then this screen has no job — go straight to the match. */
  if (st === "acknowledged" || st === "handoff") { setTimeout(() => { location.hash = "#/need/" + r.id; }, 0); }

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="minimiseRadar('${esc(r.id)}')">${isAR() ? "تابع التصفّح" : "Keep browsing"}</button>
      <button class="b-g" style="font-size:13px" onclick="location.hash='#/need/${esc(r.id)}'">${isAR() ? "تفاصيل الطلب" : "Request details"}</button>
    </div>
  </section>

  <section class="pad" style="text-align:center;margin-top:var(--u6)">
    ${radarPulse(r)}
    <div class="lab" style="margin-top:var(--u6)">${isAR() ? "نداء دواء" : "Medicine request"}</div>
    <h1 class="d2" style="margin-top:8px">${esc(x.name)} ${x.strength ? `<span class="n" style="font-weight:300">${esc(x.strength)}</span>` : ""}</h1>
    <div class="q-sub" style="margin-top:6px">${x.form ? esc(x.form) + " · " : ""}${esc(r.qty)} · ${esc(needPlace(r))}</div>
    <div class="radar-copy" id="radarcopy">${radarCopy(r, secs)}</div>
  </section>

  <section class="pad" style="margin-top:var(--u6)">
    <div class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:var(--u4)">
      <span class="t3">${isAR() ? "ظاهر في" : "Visible in"}</span>
      <span class="t3">${esc(reach.cities.map((c) => cityName(cityById(c))).slice(0, 3).join("، "))}${
        reach.cities.length > 3 ? (isAR() ? ` +${reach.cities.length - 3}` : ` +${reach.cities.length - 3}`) : ""}</span>
    </div>
    <div class="rowb" style="margin-top:var(--u3)">
      <span class="t3">${isAR() ? "ينتهي" : "Expires"}</span>
      <span class="st ${expiryHot(r) ? "st-e" : "st-q"}">${expiryLabel(r)}</span>
    </div>
  </section>

  <section class="pad" style="margin-top:var(--u6)">
    <button class="btn btn--2" onclick="minimiseRadar('${esc(r.id)}')">${isAR() ? "تابع التصفّح" : "Keep browsing"}</button>
    <div class="t3" style="margin-top:var(--u3);text-align:center">${isAR()
      ? "الطلب يبقى شغّالاً وأنت تتصفّح. ما ننشر اسمك ولا رقمك."
      : "The request stays live while you browse. Your name and number are never published."}</div>
  </section>
  <div style="height:26px"></div>${nav("explorer")}`;
}

/* Minimise to a floating bar. The patient keeps their request AND their
   freedom — trapping someone on a waiting screen is how you teach them to
   close the app. */
function minimiseRadar(id) {
  LS.set("radarMin", id);
  location.hash = "#/explorer";
}
function expandRadar() {
  const id = LS.get("radarMin", null);
  if (id) { LS.set("radarMin", null); location.hash = "#/wait/" + id; }
}
function dismissRadar(ev) {
  if (ev) ev.stopPropagation();
  LS.set("radarMin", null);
  const el = document.getElementById("radarbar"); if (el) el.remove();
}

/* The floating bar, painted outside the router so it survives navigation. */
function paintRadarBar() {
  const id = LS.get("radarMin", null);
  const existing = document.getElementById("radarbar");
  const r = id && (REQUESTS.find((x) => x.id === id) || LS.get("needs", []).find((x) => x.id === id));
  const live = r && LIVE_STATES.includes(reqState(r));
  if (!live) { if (existing) existing.remove(); if (id) LS.set("radarMin", null); return; }
  const x = needMedOf(r); if (!x) return;
  const answered = reqState(r) === "acknowledged";

  const el = existing || document.createElement("button");
  if (!existing) {
    el.id = "radarbar"; el.className = "radarbar";
    el.setAttribute("aria-live", "polite");
    el.onclick = expandRadar;
    document.body.appendChild(el);
  }
  el.classList.toggle("found", answered);
  el.innerHTML = `
    <span class="radarbar-r" aria-hidden="true"><i></i><i></i></span>
    <span class="grow" style="text-align:start;min-width:0">
      <span class="radarbar-t">${answered
        ? (isAR() ? "وصلك ردّ" : "You have an answer")
        : (isAR() ? "جارِ البحث عن" : "Looking for")} ${esc(x.name)}</span>
      <span class="radarbar-s">${answered
        ? (isAR() ? "اضغط لتشوف الصيدلية" : "Tap to see the pharmacy")
        : `${isAR() ? "ظاهر لـ" : "visible to"} <span class="num">${radarReach(r).n}</span> ${isAR() ? "صيدلية" : "pharmacies"}`}</span>
    </span>
    <span class="radarbar-x" role="button" tabindex="0" aria-label="${isAR() ? "إخفاء" : "Dismiss"}"
      onclick="dismissRadar(event)">✕</span>`;
}

/* ---------------- /need/:id ---------------- */
function screenNeed(id) {
  const r = REQUESTS.find((x) => x.id === id) || LS.get("needs", []).find((x) => x.id === id);
  if (!r) return screen404();
  const md0 = needMedOf(r); if (!md0) return screen404();
  /* Arriving on an answered request is the payoff moment — one success
     pulse, once, and only if this is the first time we have shown it. */
  if ((r.resp || []).length && !LS.get("seenAnswer", []).includes(r.id)) {
    LS.set("seenAnswer", [...LS.get("seenAnswer", []), r.id].slice(-40));
    setTimeout(() => haptic([30, 50, 30]), 120);
  }
  const st = reqState(r);
  const u = URGENCY[r.urg];
  const responders = (r.resp || []).map(anyFac).filter(Boolean);
  const field = r.v ? availabilityField(r.v) : [];
  const mine = !!r.mine;

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
    <div class="rowb" style="margin-top:24px">
      <span class="lab">${isAR() ? "طلب دواء" : "Medicine request"}</span>
      <span class="st ${u.cls}"><i class="dot${r.urg === "urgent" && st !== "expired" ? " dot-live" : ""}"></i>${esc(isAR() ? u.ar : u.en)}</span>
    </div>
    <h1 class="d1" style="margin-top:10px">${esc(md0.name)} ${md0.strength ? `<span class="n" style="font-weight:300">${esc(md0.strength)}</span>` : ""}</h1>
    <div class="q-sub" style="margin-top:6px">${md0.form ? esc(md0.form) + " · " : ""}${esc(r.qty)} · ${esc(needPlace(r))}</div>
    <div class="row" style="margin-top:14px;gap:16px;flex-wrap:wrap">
      <span class="t3">${sigAge(r.m)}</span>
      <span class="t3">${esc(isAR() ? REQ_STATE_X[st].ar : REQ_STATE_X[st].en)}</span>
      ${r.rxHeld === true ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "الوصفة متوفّرة" : "prescription in hand"}</span>` : ""}
      ${r.altOk ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "يقبل البديل بنفس المادة" : "accepts alt"}</span>` : ""}
    </div>
  </section>

  ${responders.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad unlock">
    <div class="lab" style="padding-top:24px;color:var(--brass-ink)">${isAR() ? "وصلك ردّ" : "You have an answer"}</div>
    ${responders.map((f) => {
      const g = r.v ? signalsFor(r.v).find((y) => y.fac === f.id) : null;
      return `<div class="rw">
        <span class="rw-lead" style="background:var(--jade)"></span>
        <span class="av">${esc(initial(L(f)))}</span>
        <span class="grow">
          <span class="rowb"><span class="d3" style="font-size:17px">${esc(L(f))}</span>
            ${f.verified ? `<span class="mark">${isAR() ? "ختم" : "OK"}</span>` : ""}</span>
          <span class="q-sub" style="display:block">${esc(cityName(cityById(cityOf(f))))}${f.area_ar && isAR() ? " — " + esc(f.area_ar) : ""}</span>
          <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
            ${(() => { const k = (r.answers || {})[f.id];
              return k === "alt" ? `<span class="st st-t"><i class="dot"></i>${isAR() ? "عندها بديل بنفس المادة — حسب إفادتها" : "has a same-ingredient alt — their claim"}</span>`
                : k === "one" ? `<span class="st st-t"><i class="dot"></i>${isAR() ? "باقي علبة وحدة" : "one box left"}</span>`
                : g ? `<span class="st st-t"><i class="dot${sigAgeMin(g) < 60 ? " dot-live" : ""}"></i>${isAR() ? `أفادت ${sigAge(sigAgeMin(g))}` : `reported ${sigAge(sigAgeMin(g))}`}</span>`
                : `<span class="st st-t"><i class="dot"></i>${isAR() ? "أفادت بالتوفّر" : "reported available"}</span>`; })()}
            ${g && g.dl ? `<span class="t3">${isAR() ? "تقدر ترتّب توصيل" : "may arrange delivery"}</span>` : ""}
          </span>
          <span class="row" style="margin-top:10px">
            <button class="b-g" style="font-size:12.5px" onclick="contactForNeed('${f.id}','${esc(r.id)}')">${isAR() ? "تواصل" : "Contact"}</button>
          </span>
        </span></div>`;
    }).join('<div class="hr"></div>')}
  </section>` : `<section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "لسّه ما وصل ردّ" : "No reply yet"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "الطلب معروض على الصيدليات الموثّقة في محافظتك وعلى اللي أفادت بتوفّر هذا التركيز في محافظات ثانية."
      : "It is showing to verified pharmacies in your governorate and to any that have reported this exact presentation elsewhere."}</div>
  </section>`}

  <section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "بينما تنتظر — أين قد يوجد" : "While you wait — where it might be"}</div>
    <div style="margin-top:6px">${field.filter((c) => c.n).slice(0, 4).map((c) => fieldRow(c, r.v)).join('<div class="hr"></div>')
      || `<div class="t3" style="padding:14px 0">${isAR() ? "لا تأكيد حيّ في أي محافظة حالياً." : "No live confirmation in any governorate right now."}</div>`}</div>
  </section>

  ${mine && st !== "expired" && st !== "fulfilled" ? `<section class="pad" style="margin-top:26px">
    <div class="v2">
      <button class="btn btn--2" onclick="closeNeed('${r.id}','fulfilled')">${isAR() ? "لكيته — سكّر الطلب" : "Found it — close this"}</button>
      <button class="btn btn--3" onclick="closeNeed('${r.id}','expired')">${isAR() ? "اسحب الطلب" : "Withdraw"}</button>
    </div>
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? "ما ننشر اسمك ولا رقمك. التواصل يبدأ منك أنت، من واتسابك، بعد ما تختار الصيدلية."
      : "Your name and number are never published. Contact starts from you, on your own WhatsApp, after you pick a pharmacy."}</div>
  </section>
  ${nav("explorer")}`;
}

function closeNeed(id, state) {
  state = state === "expired" ? "expired" : "fulfilled";
  const list = LS.get("needs", []);
  const rec = list.find((x) => x.id === id);
  if (rec) {
    /* The penalty case: pharmacies answered, and the patient walked away
       without ever opening the channel. That is the one behaviour that costs
       the network its scarcest resource — supply-side attention. */
    if (state === "expired" && (rec.resp || []).length && !rec.contacted) {
      updateUserTrustScore("abandoned", { hadResponse: true });
    }
    rec.st = state; LS.set("needs", list);
  }
  const live = REQUESTS.find((x) => x.id === id); if (live) live.st = state;
  toast(state === "fulfilled" ? (isAR() ? "تمام — سكّرناه" : "Closed") : (isAR() ? "انسحب الطلب" : "Withdrawn"));
  render();
}

/* Contact for a specific need — the message carries everything the form
   captured, so the pharmacy's first reply is an answer, not a question. If a
   pharmacist proposed an alternative, the message asks about it in exactly
   those terms. The prescription/box photo is invited HERE, inside WhatsApp,
   where a real transport and the patient's own privacy actually exist. */
function contactForNeed(facId, reqId) {
  const r = REQUESTS.find((y) => y.id === reqId) || LS.get("needs", []).find((y) => y.id === reqId);
  const f = anyFac(facId);
  if (!r || !f) return;
  const md = needMedOf(r); if (!md) return;
  const kind = (r.answers || {})[facId];
  const ref = r.ref || refCode();
  const msg = isAR()
    ? `السلام عليكم، ${kind === "alt" ? "أفدتم بتوفّر بديل بنفس المادة لـ" : "بخصوص"}:\n\n${md.name}${md.strength ? " " + md.strength : ""}${md.form ? " — " + md.form : ""}\nالكمية: ${r.qty}\nمنطقتي: ${needPlace(r)}${r.altOk && kind !== "alt" ? "\nأقبل بديلاً بنفس المادة والتركيز" : ""}\n\nإذا تحتاجون صورة الوصفة أو العلبة أدزّها هنا.\n\nالرمز: ${ref}\n—\nعبر قريب`
    : `Hello, ${kind === "alt" ? "you reported a same-ingredient alternative for" : "regarding"}:\n\n${md.name}${md.strength ? " " + md.strength : ""}${md.form ? " — " + md.form : ""}\nQuantity: ${r.qty}\nMy area: ${needPlace(r)}${r.altOk && kind !== "alt" ? "\nI accept a same-ingredient, same-strength alternative" : ""}\n\nIf you need the prescription or box photo, I can send it here.\n\nRef: ${ref}\n— via Qareeb`;

  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "قبل الإرسال" : "Before you send"}</div>
      <h2 style="margin-top:8px">${isAR() ? "راجع الرسالة" : "Review the message"}</h2>
    </div></div>
    <div class="sheet-b">
      <div class="plate">
        <div class="rowb"><span class="d3">${esc(L(f))}</span>
          ${f.verified ? `<span class="mark">${isAR() ? "ختم" : "OK"}</span>` : ""}</div>
        <div class="q-sub" style="margin-top:4px">${esc(cityName(cityById(cityOf(f))))}${f.area_ar && isAR() ? " — " + esc(f.area_ar) : ""}</div>
      </div>
      <div class="slip" style="margin-top:16px">
        <div class="slip-h"><span class="lab">${isAR() ? "رسالة جاهزة" : "Ready message"}</span>
          <span class="slip-ref" dir="ltr">${esc(ref)}</span></div>
        <div class="bubble">${esc(msg)}</div>
      </div>
      <div class="note note-w" style="margin-top:14px"><span>${isAR()
        ? "تأكيد التوفّر لا يعني الحجز. الأولوية لمن يصل أولاً أو يتفق مع الصيدلية."
        : "A confirmation is not a reservation. Priority goes to whoever arrives first or agrees it with the pharmacy."}</span></div>
    </div>
    <div class="sheet-f">
      ${f.wa ? `<a class="btn btn--wa" href="${waLink(f.wa, msg)}" target="_blank" rel="noopener"
        onclick="rxHandoff('${facId}','${esc(r.v || "")}','${esc(ref)}');(function(){const rr=REQUESTS.find(z=>z.id==='${esc(r.id)}')||LS.get('needs',[]).find(z=>z.id==='${esc(r.id)}');if(rr){rr.contacted=true;reqTransition(rr,'handoff');}})()">${isAR() ? "افتح واتساب" : "Open WhatsApp"}</a>`
        : `<a class="btn" href="tel:+${f.phone}">${t("call")} <span class="num">+${esc(f.phone)}</span></a>`}
    </div>`);
}

/* ---------------- structured contact ----------------
   Never jump straight to WhatsApp. The patient sees exactly who they are
   contacting, about exactly what, and what the message will say — then they
   send it themselves. */
function contactPharmacy(facId, vid, qty) {
  const f = anyFac(facId), x = variantOf(vid);
  if (!f || !x) return;
  const g = signalsFor(vid).find((y) => y.fac === facId);
  const ref = refCode();
  const msg = isAR()
    ? `السلام عليكم، عندكم هذا الدواء؟\n\n${L(x.med)} ${x.v.strength} — ${x.v.form}${qty ? `\nالكمية: ${qty}` : ""}\n\nالرمز: ${ref}\n—\nعبر قريب`
    : `Hello, do you have this in stock?\n\n${x.med.en} ${x.v.strength} — ${x.v.form}${qty ? `\nQuantity: ${qty}` : ""}\n\nRef: ${ref}\n— via Qareeb`;

  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "قبل الإرسال" : "Before you send"}</div>
      <h2 style="margin-top:8px">${isAR() ? "راجع الرسالة" : "Review the message"}</h2>
    </div></div>
    <div class="sheet-b">
      <div class="plate">
        <div class="lab">${isAR() ? "تتواصل مع" : "You are contacting"}</div>
        <div class="d3" style="margin-top:6px">${esc(L(f))}</div>
        <div class="q-sub">${esc(cityName(cityById(cityOf(f))))}${f.area_ar && isAR() ? " — " + esc(f.area_ar) : ""}</div>
        <div class="row" style="margin-top:10px;gap:14px;flex-wrap:wrap">
          ${f.verified ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "صيدلية موثّقة" : "verified pharmacy"}</span>` : `<span class="st st-q"><i class="dot"></i>${isAR() ? "غير موثّقة" : "unverified"}</span>`}
          ${g ? `<span class="st st-t"><i class="dot"></i>${isAR() ? `أفادت ${sigAge(sigAgeMin(g))}` : `reported ${sigAge(sigAgeMin(g))}`}</span>` : ""}
        </div>
      </div>

      <div class="slip" style="margin-top:16px">
        <div class="slip-h">
          <span class="lab">${isAR() ? "سؤال توفّر" : "Availability question"}</span>
          <span class="slip-ref" dir="ltr">${ref}</span>
        </div>
        <div class="bubble">${esc(msg)}</div>
      </div>

      <div class="note note-w" style="margin-top:14px"><span>${isAR()
        ? "تأكيد التوفّر لا يعني الحجز. الأولوية لمن يصل أولاً أو يتفق مع الصيدلية."
        : "A confirmation of availability is not a reservation. Priority goes to whoever arrives first or agrees it with the pharmacy."}</span></div>
      <div class="t3" style="margin-top:12px">${isAR()
        ? "يفتح واتساب بهذه الرسالة جاهزة — الإرسال بيدك، وما نكدر نأكد وصولها."
        : "WhatsApp opens with this ready — you press send, and we cannot confirm it arrived."}</div>
    </div>
    <div class="sheet-f">
      ${f.wa ? `<a class="btn btn--wa" href="${waLink(f.wa, msg)}" target="_blank" rel="noopener"
        onclick="logAsk('${vid}');rxHandoff('${f.id}','${vid}','${ref}')">${isAR() ? "افتح واتساب" : "Open WhatsApp"}</a>`
        : `<a class="btn" href="tel:+${f.phone}">${t("call")} <span class="num">+${esc(f.phone)}</span></a>`}
      ${f.wa ? `<a class="btn btn--3" style="margin-top:8px" href="tel:+${f.phone}">${t("call")}</a>` : ""}
    </div>`);
}

/* A medicine contact gets the same honest memory as an appointment request:
   opened → the user tells us sent/abandoned. Same machine, same /me drawer. */
function rxHandoff(facId, vid, ref) {
  const f = anyFac(facId), x = variantOf(vid);
  if (!f || !x) return;
  updateUserTrustScore("handoff");
  haptic([30, 50, 30]);
  /* Any of the patient's own live requests for this exact variant moves to
     handoff — that is what "I opened the conversation" means, and it is also
     what stops the trust penalty from firing later. */
  LS.get("needs", []).forEach((rec) => {
    if (rec.v === vid && LIVE_STATES.includes(reqState(rec))) {
      rec.contacted = true;
      const live = REQUESTS.find((y) => y.id === rec.id);
      if (live) reqTransition(live, "handoff"); else reqTransition(rec, "handoff");
    }
  });
  S.requests.unshift({
    ref, doc: null, med: vid, doctor: `${L(x.med)} ${x.v.strength}`,
    facility: L(f), when: cityName(cityById(cityOf(f))),
    wa: f.wa, phone: f.phone, state: "opened", ts: Date.now(), mapUrl: null,
    at: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
  });
  LS.set("requests", S.requests.slice(0, 20));
  setTimeout(() => askHandoff(ref), 1200);
}

/* ---------------- /radar · pharmacy supply mode ---------------- */
function screenRadar(facId) {
  const f = facId ? anyFac(facId) : null;
  /* Pull the real queue for this branch. Idempotent — re-entering the screen
     restarts the timer rather than stacking a second one. */
  if (f && NET.on) startQueuePolling(f.id);

  /* Signed in to a branch already? Go there rather than asking again. */
  if (!facId) {
    const p = pharmacyPrincipal();
    if (p.pharmacyId && anyFac(p.pharmacyId)) {
      setTimeout(() => { location.hash = "#/radar/" + p.pharmacyId; }, 0);
    }
  }

  /* A branch was named but this device is not signed in for it. The screen
     says so instead of drawing answer buttons that would be refused — a
     button that cannot work is worse than no button. */
  if (f) {
    const gate = QD.canAnswer(pharmacyPrincipal(), f.id);
    if (!gate.ok) {
      return `${netBanner()}
      <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
        <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
        <div class="lab" style="margin-top:24px">${isAR() ? "رادار التوفّر" : "Supply Radar"}</div>
        <h1 class="d1" style="margin-top:10px">${esc(L(f))}</h1>
        <div class="q-sub" style="margin-top:8px">${esc(cityName(cityById(cityOf(f))))}${
          f.area_ar && isAR() ? " — " + esc(f.area_ar) : ""}</div>
      </section>
      <div class="hr" style="margin:26px 0 0"></div>
      <section class="pad" style="padding-top:24px">
        <div class="note note-w"><span>${esc(authReason(gate.reason) ||
          (isAR() ? "تسجيل الصيدلية مطلوب." : "Pharmacy sign-in is required."))}</span></div>
        <p style="margin-top:18px">${isAR()
          ? "تأكيد التوفّر يُنسب لهذه الصيدلية باسمها ويظهر للمرضى كإفادة منها. عشان هيچي ما يكدر أي أحد يفتح الرابط ويجاوب — هذا الفرق بين شبكة تنفع وبين لوحة إعلانات."
          : "A stock confirmation is attributed to this pharmacy by name and shown to patients as its claim. That is why opening the link is not enough."}</p>
        <div class="v2" style="margin-top:22px">
          <button class="btn" onclick="openPharmacyAuth('${esc(f.id)}')">${isAR() ? "دخول الصيدلية" : "Pharmacy sign-in"}</button>
          <a class="btn btn--2" href="#/pharmacy/${esc(f.id)}">${isAR() ? "شوف صفحة الصيدلية" : "View pharmacy page"}</a>
        </div>
        <div class="t3" style="margin-top:20px">${isAR()
          ? "الدليل والبحث عن الأدوية يبقيان مفتوحين للكل بدون تسجيل."
          : "The directory and medicine search stay open to everyone."}</div>
      </section>
      ${nav("pharmacies")}`;
    }
  }

  if (!f) {
    const list = allPharmacies().filter((y) => y.verified);
    return `${netBanner()}
    <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
      <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <div class="lab" style="margin-top:24px">${isAR() ? "رادار التوفّر" : "Supply Radar"}</div>
      <h1 class="d2" style="margin-top:8px">${isAR() ? "شنو يدوّرون عليه الآن" : "What people are looking for"}</h1>
      <div class="q-sub" style="margin-top:6px">${isAR()
        ? "اختر صيدليتك حتى نعرض الطلبات اللي تكدر تجاوب عليها — في محافظتك، أو أي طلب لدواء سبق وأفدت بتوفّره."
        : "Pick your pharmacy and we'll show the requests you could answer — in your governorate, or for anything you've reported holding."}</div>
    </section>
    <section class="pad" style="margin-top:24px">
      <div class="lab">${isAR() ? "الصيدليات الموثّقة" : "Verified pharmacies"}</div>
      ${list.map((y) => `<a class="rw" href="#/radar/${y.id}" onclick="S.myBranch='${y.id}';LS.set('myBranch','${y.id}')">
        <span class="av">${esc(initial(L(y)))}</span>
        <span class="grow"><span class="d3" style="display:block">${esc(L(y))}</span>
          <span class="q-sub">${esc(cityName(cityById(cityOf(y))))}</span></span></a>`).join('<div class="hr"></div>')}
    </section>
    <div style="height:26px"></div>${nav("explorer")}`;
  }

  const declined = new Set(LS.get("declined", []));
  /* Answered leaves the queue. Without this the card animates out and then
     comes straight back on the next render, which is worse than not animating
     at all — it reads as "your tap did nothing". A request you have already
     answered is the patient's to act on now, not yours. */
  const rows = radarFor(f.id).filter((x) => !x.answered && !declined.has(f.id + ":" + x.r.id));
  const urgent = rows.filter((x) => x.r.urg === "urgent").length;
  const holds = rows.filter((x) => x.holds).length;
  const rush = rushOn();
  /* In rush mode nothing interrupts: urgent items still surface, everything
     else drops into a silent pile the pharmacist clears when the queue thins. */
  const front = rush ? rows.filter((x) => x.r.urg === "urgent") : rows;
  const batched = rush ? rows.filter((x) => x.r.urg !== "urgent") : [];
  const stats = responderStats(f.id);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="history.back()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="pharmacySignOut()">${isAR() ? "خروج" : "Sign out"}</button>
    </div>
    <div class="lab" style="margin-top:26px">${isAR() ? "رادار التوفّر" : "Supply Radar"}</div>
    <div class="rowb" style="margin-top:8px">
      <h1 class="d2">${esc(L(f))}</h1>
      ${stats.fast ? fastBadge(f.id) : ""}
    </div>
    <div class="q-sub" style="margin-top:4px">${esc(cityName(cityById(cityOf(f))))}</div>

    ${rush
      /* Rush mode exists to put the first answer under the thumb. The probe
         caught the opposite: the ceremonial header pushed the first urgent
         card to 925px — below the fold on the phones pharmacists actually
         hold. In rush the header collapses to one line; the numeral returns
         when the rush is over. */
      ? `<div class="rowb" style="margin-top:18px">
          <span class="t1" style="font-size:14px"><b class="num">${rows.length}</b> ${isAR() ? "طلب" : "waiting"} · <span class="num">${urgent}</span> ${isAR() ? "عاجل" : "urgent"}</span>
        </div>`
      : `<div style="display:flex;align-items:baseline;gap:12px;margin-top:24px">
      <span class="nhuge" style="color:var(--brass-ink)">${rows.length}</span>
      <span><span class="d3" style="font-weight:500;display:block">${isAR() ? "طلب ينتظر جوابك" : "requests waiting on you"}</span>
        <span class="q-sub">${isAR()
          ? `<span class="num">${urgent}</span> عاجل · <span class="num">${holds}</span> لدواء أفدت بتوفّره`
          : `<span class="num">${urgent}</span> urgent · <span class="num">${holds}</span> you already report`}</span></span>
    </div>`}

    <button class="rush ${rush ? "on" : ""}" style="${rush ? "margin-top:12px;min-height:48px" : ""}" onclick="toggleRush()">
      <span class="grow" style="text-align:start">
        <span class="t1" style="font-size:14.5px;display:block">${isAR() ? "وضع الزحام" : "Rush mode"}</span>
        <span class="t3">${rush
          ? (isAR() ? "صامت · غير العاجل يتجمّع تحت" : "silent · non-urgent batching below")
          : (isAR() ? "التنبيهات شغّالة" : "alerts on")}</span>
      </span>
      <span class="rush-sw" aria-hidden="true"><i></i></span>
    </button>
  </section>

  ${front.length ? `<section class="pad" style="margin-top:22px">
    ${rush ? `<div class="lab" style="margin-bottom:10px;color:var(--alarm)">${isAR() ? "العاجل فقط" : "Urgent only"}</div>` : ""}
    <div class="v3">${front.slice(0, 12).map((x) => pharmacyQuickCard(f.id, x)).join("")}</div>
  </section>` : rush && batched.length ? `<section class="pad" style="margin-top:18px">
    <div class="t3">${isAR() ? "ماكو عاجل — هذي المتجمّعة:" : "Nothing urgent — the batched pile:"}</div>
  </section>` : `<section class="pad" style="margin-top:26px">
    <div class="empty" style="padding:26px 0">
      <div class="glyph"><i></i><i></i><i></i><b></b></div>
      <div class="empty-t">${rush && batched.length
        ? (isAR() ? "ماكو عاجل هسّه" : "Nothing urgent right now")
        : (isAR() ? "ماكو طلبات تخصّك" : "Nothing for you right now")}</div>
      <div class="empty-b">${isAR()
        ? "راح تظهر هنا الطلبات في محافظتك، وأي طلب لدواء تفيد بتوفّره — حتى لو صاحبه في محافظة ثانية."
        : "Requests in your governorate appear here, plus any request for stock you report holding."}</div>
    </div>
  </section>`}

  ${batched.length ? `${front.length ? `<div class="hr" style="margin-top:22px"></div>` : ""}
  <section class="pad">
    <div class="rowb" style="padding-top:22px">
      <span class="lab">${isAR() ? "متجمّع بهدوء" : "Batched quietly"}</span>
      <span class="t3"><span class="num">${batched.length}</span></span>
    </div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "ما نبّهناك عليها. افتحها وقت ما يفضى الزحام."
      : "We didn't interrupt you for these. Open them when the queue thins."}</div>
    <div class="v3" style="margin-top:14px">${batched.slice(0, 10).map((x) => pharmacyQuickCard(f.id, x)).join("")}</div>
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? "جوابك إفادة منك وتنتهي وحدها بعد ثلاثة أيام. ما نعرض كمية دقيقة، وما نحجز للمريض شي — الأولوية لمن يصل أولاً أو يتفق معك. وما نعطيك اسمه ولا رقمه."
      : "Your answer is your own report and expires by itself after three days. We never show an exact count and never reserve anything — priority goes to whoever arrives first or agrees it with you. We never give you the patient's name or number."}</div>
  </section>
  ${nav("explorer")}`;
}

/* ==================================================================
   LOCAL-FIRST MUTATION QUEUE
   ==================================================================
   Baghdad mobile data drops mid-tap. A pharmacist who taps "available" and
   watches a spinner will stop tapping, so the tap is applied to local state
   immediately and the write is queued. When the network returns the queue
   drains silently. The pharmacist is never blocked and never asked to retry.

   There is no server in this build, so `flushQueue` marks entries synced
   after a round trip that only tests connectivity. The queue, the ordering,
   the retry and the UI are all real — swapping the transport for a real
   endpoint is a one-function change, and that is deliberate.
------------------------------------------------------------- */
const queueGet = () => LS.get("queue", []);
const queuePending = () => queueGet().filter((q) => !q.synced).length;

function queueMutation(kind, payload) {
  const q = queueGet();
  q.push({ id: refCode(), kind, payload, at: Date.now(), synced: false, tries: 0 });
  LS.set("queue", q.slice(-100));
  updateSyncChip();
  if (navigator.onLine !== false) setTimeout(flushQueue, 60);
}

let flushing = false;
async function flushQueue() {
  if (flushing || navigator.onLine === false) return;
  const q = queueGet();
  if (!q.some((x) => !x.synced)) return;
  flushing = true;
  updateSyncChip();
  try {
    /* Connectivity probe against our own origin. In production this is the
       mutation POST; the queue semantics around it do not change. */
    await fetch(location.pathname + "?ping=" + Date.now(), { method: "HEAD", cache: "no-store" });
    const now = queueGet();
    now.forEach((x) => { if (!x.synced) { x.synced = true; x.syncedAt = Date.now(); } });
    LS.set("queue", now.filter((x) => Date.now() - (x.syncedAt || x.at) < 864e5));
  } catch {
    const now = queueGet();
    now.forEach((x) => { if (!x.synced) x.tries++; });
    LS.set("queue", now);
    /* Backoff, capped. A phone in a lift should not hammer the radio. */
    const wait = Math.min(30000, 2000 * Math.pow(2, Math.min(4, (now[0] || {}).tries || 0)));
    setTimeout(() => { flushing = false; flushQueue(); }, wait);
    updateSyncChip();
    return;
  }
  flushing = false;
  updateSyncChip();
}

/* A chip, not a modal. It reports; it never interrupts. */
function updateSyncChip() {
  let el = document.getElementById("syncchip");
  const n = queuePending();
  if (!n) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "syncchip"; el.className = "syncchip";
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.innerHTML = `<i class="syncspin" aria-hidden="true"></i><span>${
    navigator.onLine === false
      ? (isAR() ? `<span class="num">${n}</span> بانتظار الشبكة` : `<span class="num">${n}</span> waiting for network`)
      : (isAR() ? "جارِ المزامنة" : "Syncing")}</span>`;
}

addEventListener("online", () => { flushQueue(); });

/* Haptics. Feature-detected every call — iOS Safari has never supported it,
   and a product that assumes it will silently do nothing on half of Iraq's
   phones. Silence is the correct fallback, never a visual substitute. */
function haptic(pattern) {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}

/* ==================================================================
   THE 3-SECOND RESPONSE
   ==================================================================
   The old flow cost five interactions — open a sheet, pick a quantity band,
   maybe toggle delivery, confirm, dismiss. That is a design for someone
   sitting down. A pharmacist at 19:00 has one hand free, a queue in front of
   them, and about three seconds of attention. Five taps means they answer
   nothing, and a supply network where nobody answers is not a network.

   So the quantity band moved INTO the answer. "Only one box left" is both the
   response and the stock level, which is exactly how a pharmacist would say it
   out loud. Three buttons, one tap each, 60px tall, no sheet, no confirm step.

   The deliberateness the old sheet was protecting is preserved by the buttons
   being explicit and unequal — you cannot fat-finger "we have it" while
   meaning "we don't", because they are different colours, different words, and
   at opposite ends of the row.
------------------------------------------------------------- */
function quickAnswer(facId, reqId, kind) {
  const r = REQUESTS.find((x) => x.id === reqId);
  const f = anyFac(facId);
  if (!r || !f) return;

  /* THE GATE. Checked here rather than only on the screen that draws the
     buttons, because a screen is a suggestion and a function is a rule: this
     is the one place every claim passes through, including any future one. */
  const gate = QD.canAnswer(pharmacyPrincipal(), facId);
  if (!gate.ok) {
    toast(authReason(gate.reason));
    if (gate.reason === "NOT_A_PHARMACY") openPharmacyAuth(facId);
    return;
  }

  /* Optimistic: the card leaves the screen on the same frame as the tap.
     A pharmacist must never wait to find out whether their answer landed. */
  const card = document.querySelector(`[data-req="${reqId}"]`);
  if (card) { card.style.height = card.offsetHeight + "px"; card.classList.add("qa-gone"); }

  /* Haptic first: the finger should feel the answer land before the eye sees
     the card go. On a phone that does not support it, nothing happens — we
     never substitute a visual flash, which would read as an error. */
  haptic(kind === "none" ? [12] : [18]);

  if (kind === "none") {
    /* "Not available" is real information and it is recorded — it stops us
       showing this branch the same request tomorrow — but it never becomes a
       public signal, because absence is not a claim anyone can act on. */
    const seen = LS.get("declined", []);
    LS.set("declined", [...new Set([...seen, facId + ":" + reqId])].slice(0, 200));
    queueMutation("decline", { fac: facId, req: reqId });
  } else {
    /* RACE. Two pharmacies can tap "available" in the same second. Both are
       telling the truth — the medicine really is on both shelves — so we do
       NOT discard the second claim; discarding a true signal would make the
       network less useful, not more honest. What is genuinely scarce is the
       patient's attention, so only the first timestamp is the one we surface
       as the answer, and the second is told plainly that someone got there
       first while their stock stays recorded and findable. */
    const already = (r.resp || []).length > 0;
    const at = Date.now();
    /* A signal attaches to a catalogue variant only, and never for an alt
       answer: "I have a different brand" is not availability of the thing
       that was asked for, and recording it as such would poison the field. */
    if (r.v && kind !== "alt") {
      SIGNALS.unshift({ id: "s" + refCode(), v: r.v, fac: facId, m: 0, at,
        q: kind === "one" ? "low" : "few", dl: false, st: kind === "one" ? "low" : "available" });
    }
    r.answers = r.answers || {}; r.answers[facId] = kind;
    auditLog({ action: "STOCK_CLAIMED", actor: pharmacyPrincipal().pharmacistId,
      pharmacyId: facId, subject: reqId, reason: kind });

    /* The claim only means something if it reaches the patient. Fired after
       the optimistic UI, so the pharmacist's tap never waits on the radio;
       the race verdict comes back from the server, which is the only party
       that can order two claims it received independently. */
    if (NET.on && r.remote) {
      netAnswer(reqId, kind).then((res) => {
        if (!res || !res.ok) {
          toast(isAR() ? "ما وصل للخادم — راح نعيد المحاولة" : "Not sent — will retry");
          queueMutation("answer", { reqId, kind, facId });
          return;
        }
        if (res.wasFirst === false) {
          toast(isAR() ? "تمت الاستجابة من صيدلية أخرى قبلك — شكراً لك، وتوفّرك مسجّل"
                       : "Another pharmacy answered first — thank you, your stock is recorded");
        }
      });
    }
    r.resp = [...new Set([...(r.resp || []), facId])];
    if (!r.firstAt) { r.firstAt = at; r.firstBy = facId; }
    reqTransition(r, "acknowledged");
    queueMutation("signal", { fac: facId, req: reqId, v: r.v, kind, at });

    const mineList = LS.get("needs", []);
    const mineRec = mineList.find((x) => x.id === reqId);
    if (mineRec) { mineRec.resp = r.resp; mineRec.answers = r.answers; mineRec.st = r.st; LS.set("needs", mineList); updateUserTrustScore("answered"); }

    if (already && r.firstBy !== facId) {
      toast(isAR() ? "تمت الاستجابة من صيدلية أخرى قبلك — شكراً لك، وتوفّرك مسجّل"
                   : "Another pharmacy answered first — thank you, your stock is still recorded");
      setTimeout(render, 260);
      return;
    }
  }

  toast(kind === "none" ? (isAR() ? "شكراً — ما راح نعرضه عليك مرة ثانية" : "Thanks — we won't show it again")
    : kind === "one" ? (isAR() ? "وصلت — علبة واحدة" : "Recorded — one box")
    : kind === "alt" ? (isAR() ? "وصلت — بديل بنفس المادة" : "Recorded — same-ingredient alt")
    : (isAR() ? "وصلت — متوفّر" : "Recorded — available"));
  setTimeout(render, 260);
}

/* The quick-action card. Everything above the buttons is scannable in one
   glance: what, how much, where, how long is left. */
function pharmacyQuickCard(facId, x) {
  const { r, holds, sameCity } = x;
  const md = needMedOf(r); if (!md) return "";
  const u = URGENCY[r.urg];
  const hot = expiryHot(r);
  const km = needDistFrom(anyFac(facId), r);
  /* The alt button appears ONLY when the patient consented. An alt claim
     never becomes a signal for the original variant — a different brand is a
     different fact, and the patient's card labels it as the pharmacy's own
     proposal, subject to the pharmacist. */
  return `<div class="qa" data-req="${esc(r.id)}">
    <div class="rowb">
      <span class="st ${u.cls}"><i class="dot${r.urg === "urgent" ? " dot-live" : ""}"></i>${esc(urgShort(u))}</span>
      <span class="t3">${esc(needPlace(r))}${km !== null ? ` · <span class="num">≈${fmtKm(km)}</span>` : ""}${
        !sameCity ? (isAR() ? " — خارج محافظتك" : " — outside your area") : ""}</span>
    </div>
    <div class="d3" style="font-size:18px;margin-top:8px">${esc(md.name)} ${md.strength ? `<span class="n" style="font-weight:300">${esc(md.strength)}</span>` : ""}</div>
    <div class="q-sub" style="margin-top:2px">${md.form ? esc(md.form) + " · " : ""}${esc(r.qty)}${
      r.manual ? ` · <span class="st st-q" style="font-size:10.5px">${isAR() ? "مكتوب يدوياً" : "typed by patient"}</span>` : ""}</div>
    <div class="row" style="margin-top:8px;gap:14px;flex-wrap:wrap">
      <span class="st ${hot ? "st-e" : "st-q"}">${hot ? `<i class="dot dot-live"></i>` : ""}${expiryLabel(r)}</span>
      ${r.altOk ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "يقبل البديل بنفس المادة" : "accepts same-ingredient alt"}</span>` : ""}
      ${holds ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "أفدت بتوفّره سابقاً" : "you reported this"}</span>` : ""}
      ${r.rxHeld === true ? `<span class="t3">${isAR() ? "الوصفة عنده" : "has a prescription"}</span>` : ""}
    </div>
    <div class="qa-acts${r.altOk ? " has-alt" : ""}">
      <button class="qa-b qa-yes" onclick="quickAnswer('${facId}','${r.id}','yes')">${isAR() ? "متوفّر الآن" : "Available now"}</button>
      ${r.altOk ? `<button class="qa-b qa-alt" onclick="quickAnswer('${facId}','${r.id}','alt')">${isAR() ? "متوفّر بديل بنفس المادة" : "Alt available, same ingredient"}</button>` : ""}
      <button class="qa-b qa-one" onclick="quickAnswer('${facId}','${r.id}','one')">${isAR() ? "باقي علبة وحدة" : "Only 1 left"}</button>
      <button class="qa-b qa-no"  onclick="quickAnswer('${facId}','${r.id}','none')">${isAR() ? "غير متوفّر" : "Not available"}</button>
    </div>
  </div>`;
}

/* Rush mode. At 19:00 a pharmacist does not want a toast per arrival; they
   want silence and a pile to clear when the queue thins. Toggling it does not
   hide requests — it stops them interrupting. */
const rushOn = () => !!LS.get("rush", false);
function toggleRush() {
  const on = !rushOn();
  LS.set("rush", on);
  toast(on ? (isAR() ? "وضع الزحام — صامت، والطلبات تتجمّع" : "Rush mode — silent, requests batch up")
           : (isAR() ? "رجع التنبيه العادي" : "Normal alerts back"));
  render();
}

/* ---------------- THE SUPPLY SIDE ----------------
   The product had no provider surface at all. A consumer directory is worth
   little; a two-sided platform is worth a multiple of it. This is the screen
   a pharmacy owner or a doctor sees when they scan the partner QR — and it
   has to answer one question in ten seconds: "why should I pay for this?"

   The answer is not a feature list. It is THEIR OWN demand data, shown back
   to them: what people near them asked for, and what they missed.
------------------------------------------------------------- */
function partnerStats(facId) {
  const f = fac(facId);
  const dist = f && f.district;
  const mine = MED_DEMAND.filter((r) => r.district === dist);
  const stocked = MEDICINES.filter((m) => m.stock.some((st) => st.f === facId));
  // Only THIS pharmacy's own district. Showing demand from Bayaa to a Karrada
  // owner is the kind of error that destroys a commercial claim on first read.
  const missed = mine.filter((r) => {
    const m = medById(r.med);
    return m && !m.stock.some((st) => st.f === facId) && r.asks - r.filled > 10;
  }).sort((a, b) => (b.asks - b.filled) - (a.asks - a.filled));
  const asks = mine.reduce((a, r) => a + r.asks, 0);
  const unfilled = mine.reduce((a, r) => a + (r.asks - r.filled), 0);
  return { f, mine, stocked, missed, asks, unfilled };
}

function screenPartner(id) {
  const facId = id || "p1";
  const { f, stocked, missed, asks, unfilled } = partnerStats(facId);
  if (!f) return screen404();
  const dist = DISTRICTS.find((d) => d.id === f.district);
  const leads = LS.get("asks", []).length;

  return `${header({ back: true, title: isAR() ? "لوحة الشريك" : "Partner" })}
  <section class="wrap" style="padding-top:14px">
    <div class="eyebrow">${isAR() ? "لوحة الصيدلية" : "Pharmacy dashboard"}</div>
    <h1 class="prof-name" style="margin-top:4px">${esc(L(f))}</h1>
    <div class="prof-spec">${esc(L(dist))} · ${f.verified ? t("verified") : t("listed")}</div>

    <div class="banner banner--warn" style="margin-top:16px">${icon("alert")}<span>${isAR()
      ? `في ${L(dist)} وحدها: <b class="num">${unfilled}</b> طلب دواء لم يُلبَّ خلال 30 يوماً. كل واحد منها زبون خرج بلا شراء.`
      : `In ${L(dist)} alone: <b class="num">${unfilled}</b> medicine requests went unfilled in 30 days. Each one is a customer who left empty-handed.`}</span></div>

    <div class="prof-facts" style="margin-top:14px">
      <div class="prof-fact"><div class="k">${isAR() ? "طلبات منطقتك" : "Asks in your area"}</div><div class="v num">${asks}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "غير ملبّاة" : "Unfilled"}</div><div class="v num" style="color:var(--coral)">${unfilled}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "أصنافك المؤكَّدة" : "Your confirmed"}</div><div class="v num">${stocked.length}</div></div>
    </div>
  </section>

  ${missed.length ? `<section class="blk">
    <h3>${isAR() ? "طلب مثبَّت أنت لا تغطّيه" : "Proven demand you don't cover"}</h3>
    <p class="small muted" style="margin-bottom:12px">${isAR()
      ? "هذي أدوية يسأل عنها جيرانك ولا تظهر عندك. جلبها = بيع مضمون، لا مقامرة."
      : "Your neighbours ask for these and you are not listed. Stocking them is a known sale, not a gamble."}</p>
    <div class="stack">${missed.map((r) => {
      const m = medById(r.med), gap = r.asks - r.filled;
      return `<div class="card is-open">
        <div class="card-top"><div class="avatar avatar--sq">${icon("pill")}</div>
          <div class="grow"><div class="card-t">${esc(L(m))}</div>
            <div class="card-meta">
              <span class="chip--meta chip--warn"><span class="num">${gap}</span> ${isAR() ? "طلب ضائع" : "lost asks"}</span>
              <i class="dot"></i><span>${isAR() ? "لُبّي" : "filled"} <span class="num">${Math.round((r.filled / r.asks) * 100)}%</span></span>
            </div></div></div></div>`;
    }).join("")}</div></section>` : ""}

  <section class="blk">
    <h3>${isAR() ? "ما الذي تحصل عليه" : "What you get"}</h3>
    <div class="stack">
      ${[[isAR() ? "زبون يطلب صنفاً تملكه" : "A customer asking for what you stock",
          isAR() ? "لا إعلان ولا ظهور — رسالة واتساب من شخص يريد الشراء الآن." : "Not an ad. A WhatsApp message from someone buying now."],
         [isAR() ? "ظهور في الخفارة الليلية" : "Night-duty visibility",
          isAR() ? "الساعة ٢ فجراً أنت الخيار الوحيد الظاهر — أعلى هامش في اليوم." : "At 2am you are the only option shown — the highest-margin hour."],
         [isAR() ? "بيانات طلب منطقتك" : "Your area's demand data",
          isAR() ? "أي دواء يُطلب ولا يوجد — قرار شراء مبني على رقم لا على تخمين." : "What is asked for and missing — purchasing decided by data, not guesswork."]]
        .map(([h, p]) => `<div class="lane"><span class="ic">${icon("check")}</span>
          <span class="grow"><h3>${h}</h3><p>${p}</p></span></div>`).join("")}
    </div>
  </section>

  <section class="blk">
    <h3>${isAR() ? "الاشتراك" : "Plans"}</h3>
    <div class="stack">
      <div class="card"><div class="row-b">
        <div><div class="card-t">${isAR() ? "مجاني" : "Free"}</div>
          <div class="card-q">${isAR() ? "ظهور أساسي · دوام · اتجاهات" : "Basic listing · hours · directions"}</div></div>
        <span class="chip--meta chip--ok">${isAR() ? "الحالي" : "current"}</span></div></div>
      <div class="card is-open"><div class="row-b">
        <div><div class="card-t">${isAR() ? "شريك" : "Partner"}</div>
          <div class="card-q">${isAR() ? "طلبات الدواء + الخفارة + بيانات المنطقة" : "Medicine leads + night duty + area demand"}</div></div>
        <span class="fee num">50,000 ${L(CONFIG.currency)}<span class="fee-l">/${isAR() ? "شهر" : "mo"}</span></span></div>
      </div>
    </div>
    <p class="tiny muted" style="margin-top:12px">${isAR()
      ? "التسعير توضيحي في هذا النموذج. المنطق التجاري: الاشتراك أرخص من زبون واحد ضائع أسبوعياً."
      : "Illustrative pricing. The logic: the subscription costs less than one lost customer a week."}</p>
  </section>

  <div class="actionbar">
    <a class="btn btn--wa" href="${waLink(CONFIG.emergency.partnerWa || "9647700000001",
      isAR() ? `مرحباً، أنا من ${f.ar} — أريد الاشتراك كشريك في قريب.` : `Hello, I'm from ${f.en} — I'd like to join Qareeb as a partner.`)}"
      target="_blank" rel="noopener">${icon("wa")}${isAR() ? "اشترك عبر واتساب" : "Join via WhatsApp"}</a>
  </div>
  ${nav("pharmacies")}`;
}

/* ---------------- DOCTOR PARTNER DASHBOARD ----------------
   Board sections 3c (populated), 3d (empty), 3e (tier). Built on the v2
   component layer: .surf-*, .kpi*, .bars, .spark, .wk, .tier*, .note*.

   The hero is their own MISSED demand, not a feature list. A doctor does not
   care that we have a directory; they care that 412 people searched their
   specialty in their district and 38 reached them.
------------------------------------------------------------- */
function screenPartnerDoctor(id) {
  const d = DOCTORS.find((x) => x.id === id);
  if (!d) return screen404();
  const sp = specOf(d.spec);
  const facs = docFacs(d);
  const dist = facs[0] && DISTRICTS.find((x) => x.id === facs[0].district);
  const dm = DOC_DEMAND[d.id];

  // 3d — a brand-new doctor has no history. The screen must still be worth
  // reading, so it shows the district's demand instead of their own zero.
  if (!dm) {
    const spDemand = DOCTORS.filter((x) => x.spec === d.spec).length;
    return `${header({ back: true, title: isAR() ? "لوحة الطبيب" : "Doctor dashboard" })}
    <section class="wrap" style="padding-top:16px">
      <div class="q-eyebrow">${isAR() ? "لوحة الشريك" : "Partner"}</div>
      <h1 class="q-h1" style="margin-top:4px">${esc(L(d))}</h1>
      <div class="q-sub">${esc(L(sp))}${dist ? " · " + esc(L(dist)) : ""}</div>
      <div class="empty surf-flat pad-3" style="margin-top:18px">
        <div class="glyph"><i></i><i></i><i></i><b></b></div>
        <div class="empty-t">${isAR() ? "لسّه ما وصلتك طلبات" : "No requests yet"}</div>
        <div class="empty-b">${isAR()
          ? `ملفك جديد. هذي حركة اختصاصك في ${dist ? L(dist) : "بغداد"} خلال ٣٠ يوم — الطلب موجود، بس ما يوصلك بعد.`
          : `Your profile is new. This is the demand in your area over 30 days — it exists, it just isn't reaching you yet.`}</div>
      </div>
      <div class="row" style="gap:10px;margin-top:14px">
        <div class="surf-raise pad-3 grow"><div class="kpi-l">${isAR() ? "أطباء اختصاصك هنا" : "Doctors in your specialty"}</div>
          <div class="kpi-n num">${spDemand}</div></div>
        <div class="surf-raise pad-3 grow"><div class="kpi-l">${isAR() ? "مناطق مغطّاة" : "Areas covered"}</div>
          <div class="kpi-n num">${DISTRICTS.length}</div></div>
      </div>
      <div class="note note-i" style="margin-top:14px">${isAR()
        ? "أول خطوة: أكّد أوقات دوامك. الأطباء اللي أوقاتهم واضحة يوصلهم ضعف الطلبات."
        : "First step: confirm your hours. Doctors with clear hours receive roughly double the requests."}</div>
      ${partnerTier(d)}
    </section>${nav("doctors")}`;
  }

  const rate = dm.replied / dm.requests;
  const delta = Math.round((rate - dm.specAvgRate) * 100);
  const reach = Math.round((dm.requests / dm.searches) * 100);
  const maxH = Math.max(...dm.byHour);
  const maxT = Math.max(...dm.trend);
  // which weekdays a patient sees as "no published hours" — the actionable gap
  const blank = DAY_ORDER.filter((dy) => !rawSegs(d, dy).length);

  return `${header({ back: true, title: isAR() ? "لوحة الطبيب" : "Doctor dashboard" })}
  <section class="wrap" style="padding-top:16px">
    <div class="q-eyebrow">${isAR() ? "لوحة الشريك" : "Partner"}</div>
    <h1 class="q-h1" style="margin-top:4px">${esc(L(d))}</h1>
    <div class="q-sub">${esc(L(sp))}${dist ? " · " + esc(L(dist)) : ""}</div>

    <div class="note note-w" style="margin-top:16px">${isAR()
      ? `<b class="num">${dm.searches - dm.requests}</b> شخص دوّر على «${esc(L(sp))}» في ${dist ? esc(L(dist)) : "منطقتك"} وما وصلك. الطلب موجود — الفجوة بالوصول.`
      : `<b class="num">${dm.searches - dm.requests}</b> people searched for ${esc(L(sp))} in your area and never reached you. The demand exists; the gap is reach.`}</div>

    <div class="row" style="gap:10px;margin-top:14px">
      <div class="surf-raise pad-3 grow">
        <div class="kpi-l">${isAR() ? "بحثوا عن اختصاصك" : "Searched your specialty"}</div>
        <div class="kpi-n num">${dm.searches}</div>
        <div class="kpi-d">${isAR() ? "٣٠ يوم" : "30 days"}</div>
      </div>
      <div class="surf-raise pad-3 grow">
        <div class="kpi-l">${isAR() ? "وصلوك" : "Reached you"}</div>
        <div class="kpi-n num">${dm.requests}</div>
        <div class="kpi-d">${isAR() ? `${reach}٪ من البحث` : `${reach}% of searches`}</div>
      </div>
    </div>

    <div class="surf-raise pad-3" style="margin-top:10px">
      <div class="kpi-l">${isAR() ? "نسبة ردّك" : "Your response rate"}</div>
      <div class="row-b" style="align-items:flex-end">
        <div class="kpi-n num">${Math.round(rate * 100)}٪</div>
        <div class="${delta < 0 ? "kpi-d-warn" : "kpi-d"}"><span dir="ltr" class="num">${delta >= 0 ? "+" : "−"}${Math.abs(delta)}</span>${isAR() ? " نقطة عن متوسط الاختصاص" : " pts vs specialty avg"}</div>
      </div>
      <div class="bars" style="margin-top:10px">
        <div class="bar-r"><span>${isAR() ? "أنت" : "You"}</span>
          <span class="bar-t"><i class="bar-f" style="width:${Math.round(rate * 100)}%"></i></span>
          <span class="bar-v num">${dm.replied}/${dm.requests}</span></div>
        <div class="bar-r"><span>${isAR() ? "المتوسط" : "Average"}</span>
          <span class="bar-t"><i class="bar-f bar-f-a" style="width:${Math.round(dm.specAvgRate * 100)}%"></i></span>
          <span class="bar-v num">${Math.round(dm.specAvgRate * 100)}٪</span></div>
      </div>
    </div>

    <div class="surf-raise pad-3" style="margin-top:10px">
      <div class="kpi-l">${isAR() ? "متى تصلك الطلبات" : "When requests arrive"}</div>
      <div class="spark" style="margin-top:10px" role="img"
        aria-label="${isAR() ? "توزيع الطلبات على ساعات اليوم" : "Requests by hour of day"}">
        ${dm.byHour.map((v, h) => `<i class="${v === maxH && v > 0 ? "hi" : ""}" style="height:${maxH ? Math.max(4, Math.round((v / maxH) * 100)) : 4}%"
          title="${String(h).padStart(2, "0")}:00 — ${v}"></i>`).join("")}
      </div>
      <div class="row-b q-eyebrow" style="margin-top:6px"><span>00:00</span><span>12:00</span><span>23:00</span></div>
      <div class="note note-i" style="margin-top:12px">${isAR()
        ? `ذروة الطلب ${String(dm.byHour.indexOf(maxH)).padStart(2, "0")}:00 — تأكّد أن دوامك يغطيها.`
        : `Peak at ${String(dm.byHour.indexOf(maxH)).padStart(2, "0")}:00 — make sure your hours cover it.`}</div>
    </div>

    <div class="surf-raise pad-3" style="margin-top:10px">
      <div class="kpi-l">${isAR() ? "كيف يرى المريض أسبوعك" : "How patients read your week"}</div>
      <div class="wk" style="margin-top:10px">
        ${DAY_ORDER.map((dy) => {
          const works = rawSegs(d, dy).length > 0;
          return `<b class="${works ? "" : "quiet"} ${dy === nowDay() ? "today" : ""}" title="${dayName(dy)}">${DAY_LETTER[dy]}</b>`;
        }).join("")}
      </div>
      ${blank.length ? `<div class="note note-w" style="margin-top:12px">${isAR()
        ? `<b class="num">${blank.length}</b> أيام بلا دوام منشور (${blank.map(dayName).join("، ")}) — المريض يقرأها «مغلق»، لا «غير محدد».`
        : `<b class="num">${blank.length}</b> days have no published hours (${blank.map(dayName).join(", ")}) — a patient reads those as closed, not as unspecified.`}</div>`
        : `<div class="note note-i" style="margin-top:12px">${isAR() ? "كل أيامك منشورة — هذا يرفع الطلبات." : "Every day is published — this raises requests."}</div>`}
    </div>

    <div class="surf-raise pad-3" style="margin-top:10px">
      <div class="kpi-l">${isAR() ? "اتجاه الطلب — ١٤ يوم" : "Demand trend — 14 days"}</div>
      <div class="spark" style="margin-top:10px" role="img" aria-label="${isAR() ? "اتجاه الطلب" : "Demand trend"}">
        ${dm.trend.map((v, i) => `<i class="${i === dm.trend.length - 1 ? "hi" : ""}" style="height:${Math.max(4, Math.round((v / maxT) * 100))}%"></i>`).join("")}
      </div>
    </div>

    ${partnerTier(d)}
  </section>${nav("doctors")}`;
}

/* Arabic counts in four buckets, not two. English needs "1 patient / N
   patients"; Arabic needs the singular, the dual (مريضان — a distinct form,
   not "2 patients"), the plural for 3–10, and the accusative singular from 11
   up. Writing "2 مرضى" is the same class of error as the gender bug in P2:
   it is English grammar wearing Arabic words. */
function countAr(n, forms) {
  const [one, two, few, many] = forms;
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `<span class="num">${n}</span> ${few}`;
  return `<span class="num">${n}</span> ${many}`;
}

/* A price with no arithmetic attached is a number the reader has to take on
   faith, and a doctor deciding in ten seconds will not. So the tier states
   what it costs *in their own units*: their consultation fee is in the data,
   so we can say how many extra patients a month clears it. At 45,000 IQD and
   a 30,000 IQD consultation that is two — which is a claim a doctor can check
   against their own week, and reject if it is wrong. */
function partnerTier(ent) {
  const price = CONFIG.partnerPrice;
  /* A doctor's fee lives on the session, not on the doctor — the hospital
     morning is free and the private evening clinic is not. An extra patient
     only produces revenue at the paid session, so that is the fee the payback
     has to be computed against. */
  const fee = Math.max(0, ...(ent && ent.sessions || []).map((x) => x.fee || 0));
  const payback = fee > 0 ? Math.ceil(price / fee) : null;
  return `<div class="tier surf-key pad-3" style="margin-top:18px">
    <div class="q-eyebrow">${isAR() ? "اشتراك الشريك" : "Partner plan"}</div>
    <div class="tier-p num">${price.toLocaleString("en-US")} <span style="font-size:.5em">${L(CONFIG.currency)}/${isAR() ? "شهر" : "mo"}</span></div>
    ${payback ? `<div class="q-sub" style="margin-top:4px">${isAR()
      ? `أجرة كشفك <span class="num">${fee.toLocaleString("en-US")}</span> — كلفة الاشتراك بالشهر: <b>${countAr(payback,
          ["مريض إضافي واحد", "مريضان إضافيان", "مرضى إضافيين", "مريضاً إضافياً"])}</b>.`
      : `Your fee is <span class="num">${fee.toLocaleString("en-US")}</span> — so <b><span class="num">${payback}</span> extra patient${payback === 1 ? "" : "s"} a month</b> covers it.`}</div>` : ""}
    <ul style="margin-top:12px">
      ${(isAR()
        ? ["طلبات المرضى تصلك مباشرة على واتساب", "لوحة الطلب في منطقتك", "أولوية في نتائج اختصاصك", "توثيق ومراجعة دورية للمعلومات"]
        : ["Patient requests straight to your WhatsApp", "Demand data for your area", "Priority in your specialty's results", "Verification and periodic review"])
        .map((x) => `<li class="tier-li">${x}</li>`).join("")}
    </ul>
    <a class="btn btn-wa" style="margin-top:14px" target="_blank" rel="noopener"
       href="${waLink("9647700000001", isAR() ? "مرحباً، أريد الاشتراك كطبيب شريك في قريب." : "Hello, I'd like to join Qareeb as a partner doctor.")}">
      ${icon("wa")}${isAR() ? "اشترك عبر واتساب" : "Join via WhatsApp"}</a>
    <p class="q-eyebrow" style="margin-top:10px;opacity:.75">${isAR()
      ? "السعر مبدئي — يُثبَّت قبل الإطلاق." : "Indicative price — fixed before launch."}</p>
  </div>`;
}

/* ---------------- ACTIONS ---------------- */
function pickNeed(spec) {
  closeSheet();
  S.filters.spec = spec;
  location.hash = spec ? "#/doctors?spec=" + spec : "#/needs";
}
function tf(k) { S.filters[k] = !S.filters[k]; render(); }
function tg(g) { S.filters.gender = S.filters.gender === g ? null : g; render(); }
function toggleSave(k) {
  const i = S.saved.indexOf(k);
  i > -1 ? S.saved.splice(i, 1) : S.saved.unshift(k);
  LS.set("saved", S.saved); toast(i > -1 ? (isAR() ? "أُزيل من المحفوظات" : "Removed") : (isAR() ? "حُفظ" : "Saved")); render();
}
function shareDoctor(id) {
  const d = DOCTORS.find((x) => x.id === id);
  const url = location.origin + location.pathname + "#/doctor/" + id;
  const text = isAR() ? `${d.ar} — ${specOf(d.spec).ar} · ${L(here())}\n${url}` : `${d.en} — ${specOf(d.spec).en}\n${url}`;
  if (navigator.share) navigator.share({ title: L(d), text, url }).catch(() => {});
  else { navigator.clipboard?.writeText(text); toast(isAR() ? "نُسخ الرابط" : "Link copied"); }
}
/* Recent searches are user-typed text. Interpolating them into an inline
   handler's JS string was an XSS hole and not a theoretical one: the HTML
   parser decodes &#39; back to a real quote BEFORE the handler is compiled,
   so esc() — which is an HTML-entity encoder — cannot defend a JavaScript
   string context. It is the right tool in the wrong place.

   Proven with a payload that executed: "x');window.__pwned=1;//"

   The fix is not a better escaper. It is to never put user text in that
   position: the button carries an index, and the text is looked up from
   state at click time, where it is data and never source. */
function runRecent(i) {
  const v = S.recent[i];
  if (v === undefined) return;
  doSearch(v);
  const el = document.getElementById("q");
  if (el) el.value = v;
}

function doSearch(v) {
  if (v !== LS.get("q", "")) S.parsedDrop = {};
  LS.set("q", v);
  if (v && v.trim().length > 1) { S.recent = [v.trim(), ...S.recent.filter((r) => r !== v.trim())].slice(0, 8); LS.set("recent", S.recent); }
  const el = document.getElementById("sres"); if (el) el.innerHTML = searchResults(v);
}
function runSearch(q) {
  LS.set("q", q); location.hash = "#/search";
  setTimeout(() => { const i = document.getElementById("q"); if (i) { i.value = q; doSearch(q); } }, 60);
}
function toggleLang() {
  S.lang = isAR() ? "en" : "ar"; LS.set("lang", S.lang);
  document.documentElement.lang = S.lang; document.documentElement.dir = isAR() ? "rtl" : "ltr";
  render();
}
const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function toggleTheme() {
  const cur = S.theme || (prefersDark() ? "dark" : "light");
  S.theme = cur === "dark" ? "light" : "dark"; LS.set("theme", S.theme);
  document.documentElement.dataset.theme = S.theme; render();
}
function toast(msg) {
  document.querySelectorAll(".toast").forEach((n) => n.remove());
  const el = document.createElement("div"); el.className = "toast ch fade";
  el.style.cssText = "position:fixed;bottom:calc(var(--nav-h) + 16px);inset-inline:24px;max-width:420px;margin-inline:auto;z-index:95;background:var(--ink);color:var(--sand);padding:13px 16px;font-size:13.5px;font-weight:600;text-align:center";
  el.textContent = msg; document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------------- ROUTER ---------------- */
function route() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  const p = path.split("/").filter(Boolean);
  if (!p.length) return screenHome();
  switch (p[0]) {
    case "needs": return screenNeeds();
    case "doctors": return screenDoctors(params);
    case "doctor": return screenDoctor(p[1]);
    case "pharmacies": return screenPharmacies();
    case "pharmacy": return screenPharmacy(p[1]);
    case "hospitals": return screenHospitals();
    case "hospital": return screenHospital(p[1]);
    case "care": return screenCare(p[1]);
    case "product": return screenProduct(p[1]);
    case "start": return screenStart();
    case "explorer": return screenExplorer();
    case "rx": return p[1] ? screenVariant(p[1]) : screenRxSearch();
    case "need": return p[1] === "new" ? screenNeedNew(qs) : screenNeed(p[1]);
    case "radar": return screenRadar(p[1]);
    case "wait": return screenRadarWait(p[1]);
    case "med": return screenMed(p[1]);
    case "partner": return p[1] === "doctor" ? screenPartnerDoctor(p[2]) : screenPartner(p[1]);
    case "search": return screenSearch();
    case "me": return screenMe();
    case "trust": return screenTrust();
    case "admin": return screenAdmin();
    /* The health record. Its screens live in js/ui-record.js — the two modes
       (patient and clinician) are a separate domain from the discovery
       network and do not belong in this file. */
    case "record": return p[1] ? screenRecordSection(p[1], p[2]) : screenRecord();
    case "clinical": return p[1] === "inbox" ? screenClinicalInbox() : screenClinical(p[1]);
    default: return screen404();
  }
}

let firstPaint = true;
function render() {
  const el = app();
  if (firstPaint) { el.innerHTML = skeletonFor(); firstPaint = false; setTimeout(paint, 260); return; }
  paint();
  function paint() {
    /* THE CASE. The home screen is the instrument closed — deep ink — and every
       other screen is the dial it opens onto. In light mode that is one
       deliberate luminance change, which reads as opening the case. In dark
       mode there is nothing to flip: the whole app is the case already, so a
       phone in night mode at 02:00 never gets a flash between screens.
       This is a class on <body>, not a per-component override: .dark only
       redefines tokens, so everything written against var(--ink-*) follows. */
    const home = !location.hash.replace(/^#\/?/, "").split("?")[0];
    const nightOS = matchMedia("(prefers-color-scheme: dark)").matches;
    /* An explicit choice wins over everything. It used to be
       `S.theme === "dark" || nightOS || …`, where nightOS was an
       unconditional OR — so a user on a dark phone could press the toggle
       forever and nothing moved. A control that cannot control anything is
       worse than no control: it reads as a broken app. */
    document.body.classList.toggle("dark", S.theme ? S.theme === "dark" : (nightOS || home));
    let html;
    try {
      html = route();
      if (navigator.onLine !== false) LS.set("lastOnline", Date.now());
    } catch (e) {
      console.error(e);
      try { html = screenError(e); } catch { html = ""; }
    }
    el.innerHTML = html;
    el.classList.remove("page-in"); void el.offsetWidth; el.classList.add("page-in");
    paintRadarBar();
    updateSyncChip();
    startRadarTicker();
    document.title = `${L(CONFIG.brand)} — ${isAR() ? "أقرب رعاية إليك" : "The nearest care to you"}`;
  }
}

/* A deep link to /med/m1 used to flash the home skeleton, so the first thing a
   scanned poster showed was the shape of a screen it was not going to render.
   Match the placeholder to the destination. */
function skeletonFor() {
  const seg = (location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0]) || "";
  if (["med", "doctor", "pharmacy", "hospital", "product", "partner", "need"].includes(seg)) return skeletonDetail();
  if (["doctors", "pharmacies", "hospitals", "care", "needs", "search", "explorer", "rx", "radar"].includes(seg)) return skeletonList();
  return skeletonHome();
}

function skeletonDetail() {
  return `${header({ back: true, title: "" })}<section class="wrap" style="padding-top:16px">
    <div class="skel skel-l" style="width:72%;height:26px"></div>
    <div class="skel skel-l" style="width:44%;height:15px;margin-top:10px"></div>
    <div class="skel" style="height:150px;margin-top:18px"></div>
    <div class="stack-2" style="margin-top:12px">${[1, 2].map(() => `<div class="skel" style="height:86px"></div>`).join("")}</div>
  </section>`;
}

function skeletonList() {
  return `${header({ back: true, title: "" })}<section class="wrap" style="padding-top:16px">
    <div class="skel skel-l" style="width:56%;height:20px"></div>
    <div class="stack-2" style="margin-top:14px">${[1, 2, 3, 4].map(() => `<div class="skel" style="height:86px"></div>`).join("")}</div>
  </section>`;
}

function skeletonHome() {
  return `${header()}<section class="hero">
    <div class="skel skel-l" style="width:78%;height:26px"></div>
    <div class="skel skel-l" style="width:60%;height:26px;margin-top:12px"></div>
    <div class="skel" style="height:50px;margin-top:22px"></div>
    <div class="pulse">${[1, 2, 3].map(() => `<div class="skel" style="height:78px"></div>`).join("")}</div>
  </section>
  <section class="wrap stack">${[1, 2, 3].map(() => `<div class="skel" style="height:68px"></div>`).join("")}</section>${nav("home")}`;
}

/* boot */
function boot() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = isAR() ? "rtl" : "ltr";
  if (S.theme) document.documentElement.dataset.theme = S.theme;   // otherwise let the host decide
  const qp = new URLSearchParams(location.search);
  if (qp.get("qr")) {
    S.qrSource = qp.get("qr");
    const src = QR_SOURCES[S.qrSource];
    if (src && S.locState === "inferred") { S.district = src.district; LS.set("district", src.district); }
    /* First scan of this poster gets the question. Every scan after it goes
       straight where they were already going — asking twice is a toll. */
    if (src && !qrSeen().includes(S.qrSource) && !location.hash.slice(2)) location.hash = "#/start";
  }
  addEventListener("online", () => render());
  addEventListener("offline", () => render());
  addEventListener("hashchange", () => { closeSheet(true); render(); scrollTo(0, 0); });
  addEventListener("scroll", () => { const h = document.querySelector(".hdr"); if (h) h.classList.toggle("stuck", scrollY > 8); }, { passive: true });
  render();
  // keep "now" honest, but never interrupt an open sheet or an active input
  setInterval(() => {
    const busy = document.querySelector(".sheet") ||
      ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) ||
      document.activeElement?.isContentEditable;
    if (!busy) render();
  }, 60000);
}
document.addEventListener("DOMContentLoaded", boot);
/* After first paint, never before it. */
addEventListener("load", () => {
  setTimeout(() => { probeBackend(); probeDataPlane().then((n) => {
    /* If the data plane is live and we are on a radar screen, start pulling
       immediately rather than waiting for the next navigation. */
    if (n.on && location.hash.startsWith("#/radar/")) startQueuePolling(location.hash.split("/")[2]);
  }); }, 400);
});

/* Register the shell cache. Wrapped and silent: a failed registration must
   never break the app, and the single-file dist build has no sw.js to find.

   Registration alone is not enough, and that was the bug. A browser re-checks
   sw.js on its own unhurried schedule, and a worker that installs while a page
   is open does not touch the HTML already on screen — so a deploy could sit
   there, live and paid for, with nobody seeing it. Three things fix that:
   ask for an update on every launch, reload once when a NEW worker claims a
   page that already had one, and let the page ask the worker which build is
   actually answering. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.build) {
      SW_BUILD = String(e.data.build).replace(/^qareeb-/, "");
      const el = document.getElementById("buildstamp");
      if (el) el.textContent = buildLabel();
    }
  });
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.update().catch(() => {});
      const w = reg.active || navigator.serviceWorker.controller;
      if (w) w.postMessage("version");
    }).catch(() => {});
  });
}
