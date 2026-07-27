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
  `<svg class="${cls}${DIRECTIONAL.has(n) ? " dirflip" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

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
function doctorCard(x, wide = false) {
  const { d, km, st } = x;
  const sp = specOf(d.spec);
  const f = st.k !== "shut" && st.seg ? st.seg.fac : (st.next ? st.next.fac : docFacs(d)[0]);
  const dist = f && DISTRICTS.find((y) => y.id === f.district);
  const fee = st.k !== "shut" && st.seg ? st.seg.s?.fee : (st.next ? st.next.s?.fee : d.sessions[0].fee);
  const gender = d.gender === "f" ? (isAR() ? "طبيبة" : "Female") : (isAR() ? "طبيب" : "Male");
  return `<a class="card ${st.k === "open" ? "is-open" : st.k === "soon" ? "is-soon" : "is-shut"} ${wide ? "card--wide" : ""}" href="#/doctor/${d.id}">
    <div class="card-top">
      <div class="avatar${d.verified ? "" : " avatar--ph"}">${esc(initials(L(d)))}</div>
      <div class="grow">
        <div class="card-t">${esc(L(d))}</div>
        <div class="card-q">${esc(L(sp))}${d.sub_ar && isAR() ? " · " + esc(d.sub_ar) : ""}</div>
      </div>
      ${d.verified ? `<span class="seal seal--pill">${icon("seal")}${t("verified")}</span>` : ""}
    </div>

    <div class="card-avail">
      ${statusLabel(st)}
      ${weekStrip(d)}
    </div>

    <div class="card-meta">
      <span class="chip--meta">${gender}</span>
      ${f ? `<span class="trunc">${esc(L(f))}</span>` : ""}
      ${dist ? `<i class="dot"></i><span>${esc(L(dist))}</span>` : ""}
      <i class="dot"></i><span class="dist">${icon("pin")}${fmtKm(km)}</span>
    </div>

    ${fee !== null && fee !== undefined ? `<div class="card-foot">
      <span class="fee-l">${t("fee")}</span>
      <span class="fee ${fee === 0 ? "fee--free" : ""} num">${money(fee)}</span>
    </div>` : ""}
  </a>`;
}

function pharmacyCard(x, wide = false) {
  const { f, km, st } = x;
  const dist = DISTRICTS.find((d) => d.id === f.district);
  return `<a class="card ${st.k === "open" ? "is-open" : st.k === "soon" ? "is-soon" : "is-shut"} ${wide ? "card--wide" : ""}" href="#/pharmacy/${f.id}">
    <div class="card-top">
      <div class="avatar avatar--sq">${icon("cross")}</div>
      <div class="grow">
        <div class="card-t trunc">${esc(L(f))}</div>
        <div class="card-meta">
          ${f.verified ? `<span class="seal">${icon("seal")}${t("verified")}</span><i class="dot"></i>` : ""}
          <span class="dist">${icon("pin")}${fmtKm(km)}</span>
          <i class="dot"></i><span>${esc(L(dist))}</span>
          ${f.night ? `<span class="chip chip--meta chip--time">${icon("moon")}${t("nightDuty")}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="card-ribbon">${ribbon(f)}</div>
    <div class="card-foot">${statusLabel(st)}</div>
    ${(f.services || []).length ? `<div class="card-svc">${f.services.slice(0, 4).map((sv) => `<span class="chip chip--meta">${svcLabel(sv)}</span>`).join("")}</div>` : ""}
  </a>`;
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

/* ---------------- SHELL ---------------- */
const app = () => document.getElementById("app");

function header(opts = {}) {
  if (opts.back) {
    return `<header class="hdr">
      <button class="icon-btn hdr-back" onclick="history.back()" aria-label="${t("back")}">${icon("back")}</button>
      <div class="grow hdr-title">${esc(opts.title || "")}</div>
      ${opts.right || ""}
    </header>`;
  }
  return `<header class="hdr">
    <a class="brand" href="#/">${BRAND_MARK}<span>${L(CONFIG.brand)}</span></a>
    <div class="grow"></div>
    <button class="place-tag ${S.locState === "precise" ? "place-tag--gps" : ""}" onclick="openLocation()">
      ${icon("pin")}<span>${esc(L(here()))}</span>${icon("chev", "arrow")}</button>
    <button class="icon-btn" onclick="toggleLang()" aria-label="${isAR() ? "English" : "العربية"}">${icon("globe")}</button>
    <button class="icon-btn" onclick="toggleTheme()" aria-label="${isAR() ? "الوضع الليلي" : "Theme"}">${icon("moon")}</button>
  </header>`;
}

function nav(active) {
  const items = [["#/", "home", "home"], ["#/needs", "stetho", "doctors"], ["#/pharmacies", "cross", "pharmacies"], ["#/care", "leaf", "care"]];
  return `<nav class="nav">${items.map(([h, i, k]) =>
    `<a href="${h}" class="${active === k ? "on" : ""}">${icon(i)}<span>${t(k)}</span></a>`).join("")}</nav>`;
}

/* ---------------- SCREENS ---------------- */
function screenHome() {
  const needLabel = S.filters.spec ? L(specOf(S.filters.spec)) : t("adoctor");
  const docsOpen = docsOpenNow(), phOpen = phOpenNow(), night = phNight();
  const confirmedMeds = MEDICINES.filter((m) => m.stock.length).length;
  const scarce = MEDICINES.length - confirmedMeds;
  const nearby = [
    ...doctorsFor({ radius: 25 }).list.slice(0, 3).map((x) => doctorCard(x, true)),
    ...pharmaciesNear({ openOnly: true }).slice(0, 2).map((x) => pharmacyCard(x, true)),
  ];

  /* Three intents, sized by how often they are actually needed. Medicine sits
     first because scarcity is the weekly problem; a doctor is a few times a
     year. Each tile carries a LIVE number, so the home screen is a reading of
     the network rather than a menu of links. */
  const intent = (href, ic, title, sub, n, unit, cls) => `
    <a class="intent ${cls}" href="${href}">
      <span class="intent-ic">${icon(ic)}</span>
      <span class="intent-body">
        <span class="intent-t">${title}</span>
        <span class="intent-s">${sub}</span>
      </span>
      <span class="intent-n"><b class="num">${n}</b><i>${unit}</i></span>
    </a>`;

  return `${header()}
  ${S.qrSource ? qrContext() : ""}

  <section class="hero">
    <h1 class="hero-line">
      ${isAR() ? `<span class="fix">أحتاج</span>
        <button class="blank" onclick="location.hash='#/needs'">${esc(needLabel)}${icon("caret")}</button>
        <span class="fix">قرب</span>
        <button class="blank" onclick="openLocation()">${esc(L(here()))}${icon("caret")}</button>
        <span class="fix">الآن.</span>`
        : `<span class="fix">I need</span>
        <button class="blank" onclick="location.hash='#/needs'">${esc(needLabel)}${icon("caret")}</button>
        <span class="fix">near</span>
        <button class="blank" onclick="openLocation()">${esc(L(here()))}${icon("caret")}</button>
        <span class="fix">right now.</span>`}
    </h1>

    <button class="search-field" style="margin-top:18px" onclick="location.hash='#/search'">
      ${icon("search")}<span class="muted grow" style="text-align:start">${t("searchPh")}</span>
    </button>
  </section>

  <section class="wrap">
    <div class="netbar">
      <span class="netbar-live"><i></i>${isAR() ? "الشبكة الآن" : "Network now"}</span>
      <span class="netbar-t">${fmtTi(nowMins())} · ${esc(L(here()))}</span>
    </div>
    <div class="intents stagger">
      ${intent("#/search", "pill",
        isAR() ? "مِنو عنده الدوا؟" : "Who has the medicine?",
        isAR() ? "توفّر مؤكَّد من صيدليات قريبة" : "Stock confirmed by nearby pharmacies",
        confirmedMeds, isAR() ? "دواء مؤكَّد" : "confirmed", "intent--med")}
      ${intent("#/needs", "stetho",
        isAR() ? "طبيب متاح" : "An available doctor",
        isAR() ? "مرتّبون بأقرب موعد، لا بأقرب مسافة" : "Ranked by soonest slot, not nearest",
        docsOpen, isAR() ? "متاح الآن" : "open now", "intent--doc")}
      ${intent("#/pharmacies", "cross",
        isAR() ? "صيدلية مفتوحة" : "An open pharmacy",
        night ? (isAR() ? `${night} منها خفارة ليلية` : `${night} on night duty`)
              : (isAR() ? "الأقرب المفتوحة الآن" : "Nearest open right now"),
        phOpen, isAR() ? "مفتوحة" : "open", "intent--ph")}
    </div>

    ${scarce ? `<a class="scarce-note" href="#/med/${MEDICINES.find((m) => !m.stock.length).id}">
      ${icon("alert")}<span>${isAR()
        ? `<b class="num">${scarce}</b> دواء بلا توفّر مؤكَّد في بغداد الآن — اسأل مباشرة وساعد اللي بعدك.`
        : `<b class="num">${scarce}</b> medicines have no confirmed stock in Baghdad — ask directly and help the next person.`}</span>
      ${icon("chev")}</a>` : ""}

    <button class="sos" onclick="openEmergency()">
      ${icon("alert")}<span class="grow">${isAR() ? "حالة طارئة؟" : "Emergency?"}</span>
      <b class="num">${CONFIG.emergency.ambulance}</b></button>
  </section>

  <section class="sec wrap">
    <div class="sec-h"><h2>${isAR() ? "قريب منك الآن" : "Near you right now"}</h2>
      <a class="more" href="#/doctors">${isAR() ? "الكل" : "All"}</a></div>
    <div class="rail bleed">${nearby.join("")}</div>
  </section>

  <section class="wrap" style="padding-bottom:26px">
    <a class="proof" href="#/trust">
      <div class="proof-row">
        <span><b class="num">${DOCTORS.filter((d) => d.verified).length}</b> ${isAR() ? "طبيب موثّق" : "verified doctors"}</span>
        <span><b class="num">${FACILITIES.filter((f) => f.type === "pharmacy").length}</b> ${isAR() ? "صيدلية" : "pharmacies"}</span>
        <span><b class="num">${DISTRICTS.length}</b> ${isAR() ? "منطقة" : "areas"}</span>
      </div>
      <div class="proof-note">${icon("seal")}<span>${isAR()
        ? "بلا نجوم ولا تقييمات — توثيق وتاريخ تحديث فقط. اعرف كيف نتحقق."
        : "No stars, no reviews — verification and update dates only. See how we check."}</span>${icon("chev")}</div>
    </a>
  </section>
  ${nav("home")}`;
}

function qrContext() {
  const src = QR_SOURCES[S.qrSource];
  if (!src) return "";
  return `<div class="qr-ctx fade">${icon("qr")}
    <span>${isAR() ? "دخلت من" : "Scanned at"} ${esc(src.label_ar)}</span>
    <button onclick="S.qrSource=null;render()" aria-label="${t("cancel")}">${icon("close")}</button></div>`;
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
    <div class="n"><span class="num">${r.list.length}</span> ${t("results")}
      <span class="why">· ${isAR() ? "الأقرب موعداً أولاً" : "soonest first"}</span></div>
    <div class="tiny muted">${esc(approxNote() || L(here()))}</div>
  </div>
  ${r.expanded ? `<div class="radius-note">${icon("info")}<span>${isAR()
      ? `نتائج قليلة ضمن ${S.radius} كم من ${L(here())}؟ وسّعنا تلقائياً إلى 25 كم — أخبرناك، ولم نقرر عنك.`
      : `Thin results within ${S.radius} km of ${L(here())}? We widened to 25 km — telling you, not deciding for you.`}</span></div>` : ""}
  <section class="wrap"><div class="stack list-2 stagger">
    ${r.list.length ? r.list.map((x) => doctorCard(x)).join("") : emptyDoctors(sp)}
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

function screenDoctor(id) {
  const d = DOCTORS.find((x) => x.id === id);
  if (!d) return screen404();
  const sp = specOf(d.spec), st = status(d), km = docDist(d);
  const facs = docFacs(d);
  const byFac = facs.map((f) => ({ f, ss: d.sessions.filter((s) => s.fac === f.id) }));
  const fee = d.sessions.find((s) => s.fee)?.fee ?? d.sessions[0].fee;
  const saved = S.saved.includes("d:" + d.id);

  return `${header({ back: true, title: "", right: `<button class="icon-btn" onclick="toggleSave('d:${d.id}')" aria-label="${t("share")}">${icon(saved ? "bookmark" : "bookmark")}</button><button class="icon-btn" onclick="shareDoctor('${d.id}')">${icon("share")}</button>` })}
  <section class="prof-head">
    <div class="row" style="align-items:flex-start;gap:14px">
      <div class="avatar prof-avatar${d.verified ? "" : " avatar--ph"}">${esc(initials(L(d)))}</div>
      <div class="grow">
        <h1 class="prof-name">${esc(L(d))}</h1>
        <div class="prof-spec">${esc(L(sp))}</div>
        <div class="card-meta" style="margin-top:7px">${sealBadge(d)}<i class="dot"></i>${updatedLine(d)}</div>
      </div>
    </div>
    ${!d.accepting ? `<div class="banner banner--warn" style="margin-top:14px">${icon("info")}
      <span>${t("notAccepting")}${d.pause_ar ? " — " + esc(isAR() ? d.pause_ar : d.pause_en) : ""}</span></div>` : ""}
    ${!d.wa ? `<div class="banner banner--info" style="margin-top:10px">${icon("phone")}<span>${t("noWa")}</span></div>` : ""}
    ${d.updated > 90 ? `<div class="banner banner--warn" style="margin-top:10px">${icon("alert")}
      <span>${isAR() ? "لم تُحدَّث هذه المعلومات منذ فترة طويلة. تحقق قبل الذهاب." : "This information hasn't been updated in a while. Check before travelling."}</span></div>` : ""}
    <div class="status-strip ${st.k}">
      <div class="row-b"><span>${statusLabel(st)}</span>
        <span class="tiny muted">${isAR() ? "اليوم" : "Today"} · ${dayName(nowDay())}</span></div>
      <div style="margin-top:9px">${ribbon(d, null, "ribbon--day")}</div>
    </div>
    <div class="prof-facts">
      <div class="prof-fact"><div class="k">${isAR() ? "المسافة" : "Distance"}</div><div class="v">${fmtKm(km)}</div></div>
      <div class="prof-fact"><div class="k">${t("fee")}</div><div class="v num">${money(fee)}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "المواقع" : "Locations"}</div><div class="v num">${facs.length}</div></div>
    </div>
  </section>

  <section class="blk">
    <h3>${t("week")}</h3>
    <div class="week">
      ${DAY_ORDER.map((dy) => {
        const has = d.sessions.some((s) => s.d === dy);
        return `<div class="week-row ${dy === nowDay() ? "today" : ""} ${has ? "" : "off"}">
          <span class="d">${dayName(dy)}</span>${ribbon(d, dy, "ribbon--day", dy === nowDay())}</div>`;
      }).join("")}
    </div>
    ${ribbonScale()}
    <div class="week-legend">
      <span class="row" style="gap:6px"><i style="background:var(--petrol)"></i>${isAR() ? "مستشفى (بدون أجرة)" : "Hospital (no fee)"}</span>
      <span class="row" style="gap:6px"><i style="background:var(--amber-b)"></i>${isAR() ? "عيادة خاصة" : "Private clinic"}</span>
      <span class="row" style="gap:6px"><i style="background:var(--ink);width:2px;height:10px"></i>${isAR() ? "الآن" : "Now"}</span>
    </div>
  </section>

  <section class="blk">
    <h3>${t("sessions")} · <span class="muted" style="font-weight:400">${facs.length} ${isAR() ? "موقع" : "locations"}</span></h3>
    ${byFac.map(({ f, ss }) => `<div class="fac-block">
      <div class="row-b">
        <div><div class="ft">${esc(L(f))}</div>
          <div class="fm">${t(f.type)} · ${esc(L(DISTRICTS.find((x) => x.id === f.district)))} · ${fmtKm(distTo(f))}</div></div>
        <a class="icon-btn" href="${mapLink(f)}" target="_blank" rel="noopener" aria-label="${t("directions")}">${icon("nav")}</a>
      </div>
      <div class="stack" style="margin-top:10px">
        ${ss.sort((a, b) => DAY_ORDER.indexOf(a.d) - DAY_ORDER.indexOf(b.d)).map((s) => `<div class="kv">
          <span class="k">${dayName(s.d)}</span>
          <span class="v num">${fmtRange(mins(s.f), mins(s.t))} · ${money(s.fee)}</span></div>`).join("")}
      </div></div>`).join("")}
  </section>

  <section class="blk">
    <h3>${t("about")}</h3>
    ${d.creds_ar?.length ? d.creds_ar.map((c) => `<div class="kv"><span class="k">${icon("seal")}</span><span class="v" style="text-align:start;flex:1">${esc(c)}</span></div>`).join("")
      : `<p class="small muted">${isAR() ? "لم تُضف المؤهلات بعد." : "Credentials not added yet."}</p>`}
    ${d.exp ? `<div class="kv"><span class="k">${isAR() ? "سنوات الخبرة" : "Experience"}</span><span class="v num">${d.exp}</span></div>` : ""}
    <div class="kv"><span class="k">${isAR() ? "اللغات" : "Languages"}</span><span class="v">${d.langs.map((x) => ({ ar: isAR() ? "العربية" : "Arabic", en: isAR() ? "الإنجليزية" : "English", ku: isAR() ? "الكردية" : "Kurdish", tr: isAR() ? "التركية" : "Turkish" }[x])).join("، ")}</span></div>
    <button class="btn btn--3" style="margin-top:10px" onclick="reportInfo()">${icon("flag")}${t("reportInfo")}</button>
  </section>

  <div class="actionbar">
    ${d.accepting
      ? `<button class="btn" onclick="openRequest('${d.id}')">${icon("cal")}${t("request")}</button>`
      : `<button class="btn" disabled>${icon("cal")}${t("notAccepting")}</button>`}
    ${d.wa ? `<a class="icon-btn" href="${waLink(d.wa, directMsg(d))}" target="_blank" rel="noopener" aria-label="${t("message")}">${icon("wa")}</a>` : ""}
    <a class="icon-btn" href="tel:+${d.phone}" aria-label="${t("call")}">${icon("phone")}</a>
  </div>
  ${nav("doctors")}`;
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
  <div class="res-head"><span class="n"><span class="num">${list.length}</span> ${t("results")}</span>
    <span class="tiny muted">${esc(approxNote()) || (isAR() ? "المفتوح أولاً، ثم الأقرب" : "Open first, then nearest")}</span></div>
  <section class="wrap"><div class="stack list-2 stagger">
    ${list.length ? list.map((x) => pharmacyCard(x)).join("") : nightFallback()}
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
    <h3>${isAR() ? "ما في صيدلية مفتوحة قربك هسه" : "Nothing open near you right now"}</h3>
    <p>${isAR() ? "هذي أقرب صيدليات الخفارة الليلية — تشتغل طول الليل."
                : "These are the nearest night-duty pharmacies — open through the night."}</p>
    <div class="empty-alts stack">${duty.slice(0, 3).map((x) => pharmacyCard(x)).join("")}</div>
    ${soon ? `<p class="small muted" style="margin-top:18px">${isAR() ? "وأقرب وحدة تفتح" : "Nearest opening"}: ${esc(L(soon.f))} · ${fmtTi(soon.st.next.f)}</p>` : ""}
  </div>`;
}

function screenPharmacy(id) {
  const f = fac(id); if (!f) return screen404();
  const st = status(f), km = distTo(f);
  const prods = PRODUCTS.filter((p) => p.stock.includes(f.id));
  return `${header({ back: true, title: "" })}
  <section class="prof-head">
    <div class="row" style="align-items:flex-start;gap:14px">
      <div class="avatar prof-avatar avatar--sq">${icon("cross")}</div>
      <div class="grow">
        <h1 class="prof-name">${esc(L(f))}</h1>
        <div class="prof-spec">${t("pharmacy")} · ${esc(L(DISTRICTS.find((d) => d.id === f.district)))}</div>
        <div class="card-meta" style="margin-top:7px">${sealBadge(f)}<i class="dot"></i>${updatedLine(f)}</div>
      </div>
    </div>
    <div class="status-strip ${st.k}">
      <div class="row-b"><span>${statusLabel(st)}</span>
        ${f.night ? `<span class="chip chip--meta chip--time">${icon("moon")}${t("nightDuty")}</span>` : ""}</div>
      <div style="margin-top:9px">${ribbon(f, null, "ribbon--day")}</div>
    </div>
    <div class="prof-facts">
      <div class="prof-fact"><div class="k">${isAR() ? "المسافة" : "Distance"}</div><div class="v">${fmtKm(km)}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "المنطقة" : "Area"}</div><div class="v" style="font-size:14px">${esc(L(DISTRICTS.find((d) => d.id === f.district)))}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "الخدمات" : "Services"}</div><div class="v num">${(f.services || []).length}</div></div>
    </div>
  </section>
  <section class="blk"><h3>${isAR() ? "الدوام خلال الأسبوع" : "Weekly hours"}</h3>
    <div class="week">${DAY_ORDER.map((dy) => `<div class="week-row ${dy === nowDay() ? "today" : ""}">
      <span class="d">${dayName(dy)}</span>${ribbon(f, dy, "ribbon--day", dy === nowDay())}</div>`).join("")}</div>
    ${ribbonScale()}
  </section>
  <section class="blk"><h3>${isAR() ? "الخدمات" : "Services"}</h3>
    <div class="chips chips--wrap">${(f.services || []).map((s) => `<span class="chip">${icon(({ delivery: "truck", night: "moon", injections: "syringe", bp: "gauge", baby: "baby" })[s] || "check")}${svcLabel(s)}</span>`).join("")}</div>
  </section>
  ${prods.length ? `<section class="blk"><div class="sec-h"><h2 style="font-size:15px">${isAR() ? "متوفر في هذه الصيدلية" : "On the shelf here"}</h2>
    <a class="more" href="#/care">${isAR() ? "الكل" : "All"}</a></div>
    <div class="rail" style="margin-inline:-18px;padding-inline:18px">${prods.slice(0, 6).map((p) => `<div style="width:150px">${productCard(p)}</div>`).join("")}</div></section>` : ""}
  <section class="blk">
    <a class="lane" href="#/partner/${f.id}"><span class="ic">${icon("grid")}</span>
      <span class="grow"><h3>${isAR() ? "هذي صيدليتك؟" : "Is this your pharmacy?"}</h3>
        <p>${isAR() ? "شوف كم طلب دواء ضاع في منطقتك هذا الشهر" : "See how much medicine demand your area lost this month"}</p></span>
      ${icon("chev")}</a>
    <button class="btn btn--3" style="margin-top:10px" onclick="reportInfo()">${icon("flag")}${t("reportInfo")}</button></section>
  <div class="actionbar">
    <a class="btn" href="${mapLink(f)}" target="_blank" rel="noopener">${icon("nav")}${t("directions")}</a>
    ${f.wa ? `<a class="icon-btn" href="${waLink(f.wa, isAR() ? `السلام عليكم، استفسار من ${L(CONFIG.brand)}:` : `Hello, an enquiry via ${L(CONFIG.brand)}:`)}" target="_blank" rel="noopener">${icon("wa")}</a>` : ""}
    <a class="icon-btn" href="tel:+${f.phone}">${icon("phone")}</a>
  </div>${nav("pharmacies")}`;
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
        <div class="chips chips--wrap">${S.recent.slice(0, 6).map((r) => `<button class="chip" onclick="doSearch('${esc(r)}');document.getElementById('q').value='${esc(r)}'">${esc(r)}</button>`).join("")}</div></div>` : ""}`;
  }
  const nq = norm(q);
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
      <div class="empty-mark">${icon("search")}</div>
      <h3>${isAR() ? `ما لگينا «${esc(q)}» بعد` : `Nothing for "${esc(q)}" yet`}</h3>
      <p>${isAR() ? "سجّلنا بحثك — نضيف الناقص أسبوعياً. جرّب وحدة من هذي:"
                  : "We logged it — we add what's missing weekly. Try one of these:"}</p>
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
  return G(isAR() ? "أدوية — مين عنده؟" : "Medicines — who has it?", meds.map((m) => {
      const c = pharmaciesForMed(m).confirmed;
      return `<a class="card ${c.length ? "is-open" : ""}" href="#/med/${m.id}">
        <div class="card-top"><div class="avatar avatar--sq">${icon("pill")}</div>
          <div class="grow"><div class="card-t">${esc(L(m))}</div>
            <div class="card-meta">${c.length
              ? `<span class="chip--meta chip--ok">${icon("check")}<span class="num">${c.length}</span> ${isAR() ? "صيدلية أكّدت" : "confirmed"}</span>`
              : `<span class="chip--meta chip--warn">${isAR() ? "شحيح — اسأل مباشرة" : "scarce — ask directly"}</span>`}
              ${c.length ? `<i class="dot"></i><span>${esc(freshLabel(c[0].days))}</span>` : ""}</div></div>
          ${icon("chev")}</div></a>`;
    }).join(""))
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
      ? `للحالات الطارئة اتصل بالإسعاف <b class="num">${CONFIG.emergency.ambulance}</b> مباشرة.`
      : `For emergencies call the ambulance on <b class="num">${CONFIG.emergency.ambulance}</b> directly.`}</span></div>
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
      <span>${isAR() ? "طوارئ تعمل ٢٤ ساعة" : "Emergency department open 24h"} · ${CONFIG.emergency.ambulance}</span></div>` : ""}
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

function screenMe() {
  return `${header({ back: true, title: t("myRequests") })}
  <section class="wrap sec">
    ${S.requests.length ? `<div class="stack">${S.requests.map((r) => `<div class="stub">
      <div class="row-b"><div><div class="card-t">${esc(r.doctor)}</div>
        <div class="card-q">${esc(r.facility)} · ${esc(r.when)}</div></div>
        <div class="slip-ref mono" dir="ltr">#${esc(r.ref)}</div></div>
      <div class="card-meta"><span class="chip chip--meta chip--ok">${icon("check")}${t("sent")}</span>
        <i class="dot"></i><span dir="ltr" class="num">${esc(r.at)}</span></div>
      ${r.wa ? `<div class="btn-row" style="margin-top:11px">
        <a class="btn btn--2 btn--sm" href="https://wa.me/${esc(r.wa)}" target="_blank" rel="noopener">${icon("wa")}${isAR() ? "فتح المحادثة" : "Open chat"}</a>
        ${r.mapUrl ? `<a class="btn btn--2 btn--sm" href="${esc(r.mapUrl)}" target="_blank" rel="noopener">${icon("nav")}${t("directions")}</a>` : ""}
      </div>` : ""}</div>`).join("")}</div>`
    : `<div class="empty"><div class="empty-mark">${icon("cal")}</div>
        <h3>${isAR() ? "لا توجد طلبات بعد" : "No requests yet"}</h3>
        <p>${isAR() ? "عند إرسال طلب موعد، يبقى إيصاله هنا مع رمزه — بدون حساب." : "When you send an appointment request, the stub stays here with its code — no account."}</p>
        <a class="btn" href="#/needs">${icon("stetho")}${isAR() ? "ابحث عن طبيب" : "Find a doctor"}</a></div>`}
    ${S.saved.length ? `<div class="sec-h" style="margin-top:26px"><h2>${t("savedItems")}</h2></div>
      <div class="stack">${S.saved.map((k) => {
        const [ty, id] = k.split(":");
        if (ty === "d") { const d = DOCTORS.find((x) => x.id === id); return d ? doctorCard({ d, km: docDist(d), st: status(d) }) : ""; }
        const f = fac(id); return f ? pharmacyCard({ f, km: distTo(f), st: status(f) }) : "";
      }).join("")}</div>` : ""}
  </section>${nav("home")}`;
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
      ? `${L(CONFIG.brand)} لا يقدّم استشارة طبية ولا تشخيصاً. للحالات الطارئة اتصل بالإسعاف ${CONFIG.emergency.ambulance}.`
      : `${L(CONFIG.brand)} does not provide medical advice or diagnosis. In an emergency call ${CONFIG.emergency.ambulance}.`}</span></div>
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
function screenAdmin() {
  const A = ADMIN_STATS, max = (a) => Math.max(...a.map((x) => x[1]));
  return `<div class="adm">
  <header class="hdr"><a class="brand" href="#/">${BRAND_MARK}<span>${isAR() ? "لوحة التحكم" : "Admin"}</span></a>
    <div class="grow"></div><a class="icon-btn" href="#/">${icon("close")}</a></header>
  <section class="wrap sec">
    <div class="adm-grid">
      <div class="adm-kpi"><div class="n num">${A.scans7d}</div><div class="l">${isAR() ? "مسح QR (٧ أيام)" : "QR scans (7d)"}</div></div>
      <div class="adm-kpi"><div class="n num">${A.requests7d}</div><div class="l">${isAR() ? "طلبات موعد" : "Requests sent"}</div></div>
      <div class="adm-kpi"><div class="n num">${A.searches7d}</div><div class="l">${isAR() ? "عمليات بحث" : "Searches"}</div></div>
      <div class="adm-kpi alert"><div class="n num">${A.zeroResults7d}</div><div class="l">${isAR() ? "بحث بلا نتيجة" : "Zero-result"}</div></div>
    </div>

    <div class="sec-h" style="margin-top:26px"><h2>${isAR() ? "بحث بلا نتيجة — أهم إشارة نمو" : "Zero-result searches — the growth signal"}</h2></div>
    <div class="ch" style="padding:14px 16px">${A.zeroQueries.map(([q, n]) => `<div class="bar-row">
      <div><div>${esc(q)}</div><div class="bar"><i class="warn" style="width:${(n / max(A.zeroQueries)) * 100}%"></i></div></div>
      <div class="num" style="text-align:end;font-weight:700">${n}</div></div>`).join("")}</div>

    <div class="sec-h" style="margin-top:26px"><h2>${isAR() ? "طلب الأدوية حسب المنطقة — الأصل القابل للبيع" : "Medicine demand by area — the sellable asset"}</h2></div>
    <div class="ch" style="padding:14px 16px">
      <p class="small muted" style="margin-bottom:12px">${isAR()
        ? "«يُسأل عنه» مقابل «تم توفيره». الفجوة الكبيرة = طلب غير ملبّى — وهذا بالضبط ما تدفع الصيدلية لتعرفه."
        : "Asked vs filled. A wide gap is unmet demand — precisely what a pharmacy pays to see."}</p>
      ${MED_DEMAND.map((r) => {
        const m = medById(r.med), d = DISTRICTS.find((x) => x.id === r.district);
        const rate = Math.round((r.filled / r.asks) * 100);
        return `<div class="bar-row">
          <div><div>${esc(L(m))} <span class="muted">· ${esc(L(d))}</span></div>
            <div class="bar"><i class="${rate < 30 ? "warn" : ""}" style="width:${rate}%"></i></div></div>
          <div class="num" style="text-align:end;font-weight:700">${r.asks}<div class="tiny muted">${rate}%</div></div>
        </div>`;
      }).join("")}
      <div class="banner banner--warn" style="margin-top:12px">${icon("alert")}<span>${isAR()
        ? "حديد وريدي في الكرادة: 71 سؤالاً، 4 تلبية فقط (6٪). أي صيدلية تجلبه تلتقط طلباً مثبتاً."
        : "IV iron in Karrada: 71 asks, 4 filled (6%). Any pharmacy that stocks it captures proven demand."}</span></div>
    </div>

    <div class="sec-h" style="margin-top:26px"><h2>${isAR() ? "مصادر الـ QR" : "QR sources"}</h2></div>
    <div class="ch" style="padding:14px 16px">${A.sources.map(([q, n]) => `<div class="bar-row">
      <div><div>${esc(q)}</div><div class="bar"><i style="width:${(n / max(A.sources)) * 100}%"></i></div></div>
      <div class="num" style="text-align:end;font-weight:700">${n}</div></div>`).join("")}</div>

    <div class="sec-h" style="margin-top:26px"><h2>${isAR() ? "طابور التوثيق والبلاغات" : "Verification & flags queue"}</h2></div>
    <div>${A.queue.map((q) => `<div class="tbl-row">
      <span class="ic avatar avatar--sq" style="width:34px;height:34px;background:${q.t === "flag" ? "var(--coral-soft)" : "var(--petrol-soft)"};color:${q.t === "flag" ? "var(--coral)" : "var(--petrol)"}">${icon(q.t === "flag" ? "flag" : "seal")}</span>
      <span class="grow"><div style="font-weight:700;font-size:14px">${esc(q.ar)}</div><div class="tiny muted">${esc(q.meta)}</div></span>
      <button class="btn btn--sm">${isAR() ? "افتح" : "Open"}</button></div>`).join("")}</div>

    <div class="sec-h" style="margin-top:26px"><h2>${isAR() ? "شبكة الدوام الأسبوعي — د. زينب عبد الكريم" : "Weekly session grid — Dr. Zainab"}</h2></div>
    <div class="ch" style="padding:14px 12px">
      <div class="wg">
        <span></span>${Array.from({ length: 18 }, (_, i) => `<span class="h">${i + 6}</span>`).join("")}
        ${DAY_ORDER.map((dy) => {
          const segs = rawSegs(DOCTORS[1], dy);
          return `<span class="d">${dayName(dy)}</span>` + Array.from({ length: 18 }, (_, i) => {
            const m = (i + 6) * 60, s = segs.find((x) => m >= x.f && m < x.t);
            return `<span class="c ${s ? s.kind : ""}"></span>`;
          }).join("");
        }).join("")}
      </div>
      <div class="week-legend"><span class="row" style="gap:6px"><i style="background:var(--petrol)"></i>${isAR() ? "مستشفى" : "Hospital"}</span>
        <span class="row" style="gap:6px"><i style="background:var(--amber-b)"></i>${isAR() ? "عيادة" : "Clinic"}</span></div>
    </div>
    <div class="btn-row" style="margin-top:20px"><button class="btn btn--2">${icon("plus")}${isAR() ? "أضف طبيباً" : "Add doctor"}</button>
      <button class="btn btn--2">${icon("qr")}${isAR() ? "أنشئ QR" : "Generate QR"}</button></div>
  </section></div>`;
}

/* ---------------- SHEETS ---------------- */
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
      <label class="eyebrow">${t("chooseTime")}</label>
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
          <div><div class="eyebrow">${isAR() ? "طلب موعد" : "Appointment request"}</div>
            <div class="card-t" style="margin-top:3px">${esc(L(d))}</div>
            <div class="card-q">${esc(L(s.seg.fac))}</div></div>
          <div style="text-align:end"><div class="slip-ref mono" dir="ltr">#${ref}</div>
            <div class="tiny muted mono">${new Date().toLocaleDateString("en-GB")}</div></div>
        </div>
        <div class="slip-to">${isAR() ? "إلى" : "To"}: ${d.wa ? `<span class="mono">+${d.wa}</span>` : (isAR() ? "غير متوفر" : "unavailable")}</div>
        <div class="bubble" id="msg" contenteditable="true" spellcheck="false">${esc(msg)}</div>
        <button class="slip-edit" onclick="document.getElementById('msg').focus()">${icon("edit")}${t("edit")}</button>
      </div>
      ${!d.wa ? `<div class="banner banner--info" style="margin-top:16px">${icon("phone")}<span>${t("noWa")}</span></div>` : ""}
      <div class="hint" style="margin-top:14px">${icon("info")}<span>${isAR()
        ? "سيفتح واتساب بهذه الرسالة جاهزة. الإرسال بيدك."
        : "WhatsApp will open with this message ready. You press send."}</span></div>
    </div>
    <div class="sheet-f">
      ${d.wa ? `<a class="btn btn--wa" id="sendbtn" href="${link}" target="_blank" rel="noopener"
          onclick="confirmSent('${d.id}','${ref}','${esc(dayName(s.day))} ${esc(fmtRangeTxt(s.seg.f, s.seg.t))}','${esc(L(s.seg.fac))}')">
          ${icon("wa")}${t("sendWa")}</a>`
        : `<a class="btn" href="tel:+${d.phone}">${icon("phone")}${t("call")} +${d.phone}</a>`}
    </div>`);
}

function confirmSent(id, ref, when, facility) {
  const d = DOCTORS.find((x) => x.id === id);
  S.requests.unshift({ ref, doctor: L(d), facility, when, wa: d.wa, mapUrl: mapLink(docFacs(d)[0]), at: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) });
  LS.set("requests", S.requests.slice(0, 20));
  setTimeout(() => {
    sheet(`<div class="sheet-grip"></div>
      <div class="sheet-b" style="padding-top:8px">
        <div style="display:grid;place-items:center;padding:18px 0 6px">
          <div class="seal--stamp stamped">${isAR() ? "أُرسل" : "SENT"}<br><span dir="ltr">${ref}</span></div></div>
        <h2 style="text-align:center;font-size:21px;font-weight:800;letter-spacing:-.02em">${isAR() ? "وصلت رسالتك إلى العيادة" : "Your message reached the clinic"}</h2>
        <p class="small muted" style="text-align:center;margin-top:6px">${isAR()
          ? "العيادات ترد عادةً خلال ١٥–٦٠ دقيقة في أوقات الدوام." : "Clinics usually reply within 15–60 minutes during working hours."}</p>
        <div class="stub" style="margin-top:20px">
          <div class="row-b"><div><div class="card-t">${esc(L(d))}</div>
            <div class="card-q">${esc(facility)} · ${esc(when)}</div></div>
            <div class="slip-ref mono" dir="ltr">#${ref}</div></div>
          <div class="card-meta"><span class="chip chip--meta chip--ok">${icon("check")}${t("sent")}</span>
            <i class="dot"></i><span>${isAR() ? "محفوظ في طلباتي" : "Saved in My requests"}</span></div>
        </div>
        <div class="stack" style="margin-top:16px">
          <a class="btn btn--2" href="${mapLink(docFacs(d)[0])}" target="_blank" rel="noopener">${icon("nav")}${t("directions")}</a>
          <button class="btn btn--2" onclick="shareDoctor('${d.id}')">${icon("share")}${isAR() ? "شارك الطبيب مع العائلة" : "Share this doctor"}</button>
          <button class="btn btn--3" onclick="closeSheet();location.hash='#/me'">${t("myRequests")}</button>
        </div>
      </div>`);
  }, 700);
}

function openEmergency() {
  const er = FACILITIES.filter((f) => f.er).map((f) => ({ f, km: distTo(f) })).sort((a, b) => a.km - b.km).slice(0, 3);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2 style="color:var(--coral)">${t("emergency")}</h2>
      <p>${isAR() ? "إذا كانت الحالة خطرة، اتصل بالإسعاف فوراً." : "If this is serious, call the ambulance now."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <a class="btn btn--danger" href="tel:${CONFIG.emergency.ambulance}">${icon("phone")}${t("ambulance")} <span class="num">${CONFIG.emergency.ambulance}</span></a>
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

function medMatches(q) {
  const nq = norm(q); if (!nq) return [];
  return MEDICINES.filter((m) => norm(m.ar + " " + m.en + " " + m.alias.join(" ")).includes(nq));
}

function pharmaciesForMed(med) {
  const confirmed = med.stock.map((st) => {
    const f = fac(st.f); if (!f) return null;
    return { f, km: distTo(f), days: st.d, st: status(f), confirmed: true };
  }).filter(Boolean);
  const others = FACILITIES.filter((f) => f.type === "pharmacy" && !med.stock.some((st) => st.f === f.id))
    .map((f) => ({ f, km: distTo(f), days: null, st: status(f), confirmed: false }));
  confirmed.sort((a, b) => a.days - b.days || a.km - b.km);
  others.sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  return { confirmed, others };
}

const freshLabel = (d) => isAR()
  ? (d <= 1 ? "أُكّد أمس" : d <= 3 ? `أُكّد قبل ${d} أيام` : d <= 14 ? `أُكّد قبل ${d} يوم` : `قديم — قبل ${d} يوم`)
  : (d <= 1 ? "confirmed yesterday" : `confirmed ${d}d ago`);

function medMsg(med, ref) {
  return isAR()
    ? `السلام عليكم، عندكم هذا الدواء؟\n\n${med.ar}${med.form ? ` (${med.form})` : ""}\n\nالرمز: ${ref}\n—\nعبر قريب`
    : `Hello, do you have this in stock?\n\n${med.en}\n\nRef: ${ref}\n— via Qareeb`;
}

function screenMed(id) {
  const med = medById(id); if (!med) return screen404();
  const { confirmed, others } = pharmaciesForMed(med);
  const ref = (S.medRef ||= refCode());
  const row = (x) => `<div class="card ${x.st.k === "open" ? "is-open" : "is-shut"}">
    <div class="card-top">
      <div class="avatar avatar--sq">${icon("cross")}</div>
      <div class="grow">
        <div class="card-t trunc">${esc(L(x.f))}</div>
        <div class="card-meta">
          ${x.confirmed ? `<span class="chip--meta ${x.days <= 3 ? "chip--ok" : "chip--time"}">${icon("check")}${freshLabel(x.days)}</span>`
                        : `<span class="chip--meta">${isAR() ? "غير مؤكَّد" : "unconfirmed"}</span>`}
          <i class="dot"></i><span class="dist">${icon("pin")}${fmtKm(x.km)}</span>
          <i class="dot"></i><span>${esc(L(DISTRICTS.find((d) => d.id === x.f.district)))}</span>
        </div>
      </div>
    </div>
    <div class="card-foot" style="border:0;padding-top:8px">
      ${statusLabel(x.st, true)}
      ${x.f.wa ? `<a class="btn btn--wa btn--sm" href="${waLink(x.f.wa, medMsg(med, ref))}" target="_blank" rel="noopener"
           onclick="logAsk('${med.id}')">${icon("wa")}${isAR() ? "اسأل" : "Ask"}</a>`
        : `<a class="btn btn--2 btn--sm" href="tel:+${x.f.phone}">${icon("phone")}${t("call")}</a>`}
    </div></div>`;

  return `${header({ back: true, title: isAR() ? "توفّر الدواء" : "Medicine availability" })}
  <section class="wrap" style="padding-top:12px">
    <h1 class="prof-name">${esc(L(med))}</h1>
    <div class="prof-spec">${esc(med.form || "")}${med.chronic ? (isAR() ? " · علاج مزمن" : " · chronic") : ""}</div>
    <div class="banner banner--info" style="margin-top:14px">${icon("info")}<span>${isAR()
      ? `رمز طلبك <b class="mono" dir="ltr">${ref}</b> — نفس الرمز لكل الصيدليات، حتى تعرف أي واحدة ردّت.`
      : `Your request code <b class="mono" dir="ltr">${ref}</b> — the same code goes to every pharmacy.`}</span></div>
  </section>

  ${confirmed.length ? `<section class="blk"><h3>${isAR() ? "أكّدت توفّره" : "Confirmed in stock"}
      <span class="muted" style="font-weight:400">· ${isAR() ? "الأحدث تأكيداً أولاً" : "freshest first"}</span></h3>
    <div class="stack">${confirmed.slice(0, 4).map(row).join("")}</div></section>`
  : `<section class="blk"><div class="empty" style="padding:22px 4px">
      <div class="empty-mark">${icon("alert")}</div>
      <h3>${isAR() ? "ما عدنا تأكيد توفّر لهذا الدواء" : "No confirmed stock for this yet"}</h3>
      <p>${isAR() ? "هذا دواء شحيح حالياً. اسأل أقرب الصيدليات مباشرة — وأول ردّ يوصلنا يفيد غيرك بعدك."
                  : "This one is scarce right now. Ask the nearest pharmacies — the first answer helps the next person too."}</p>
    </div></section>`}

  <section class="blk"><h3>${isAR() ? "اسأل صيدليات قريبة" : "Ask nearby pharmacies"}</h3>
    <p class="small muted" style="margin-bottom:12px">${isAR()
      ? "رسالة جاهزة لكل وحدة — ما تحتاج تكتب شي." : "A ready message for each — nothing to type."}</p>
    <div class="stack">${others.slice(0, 5).map(row).join("")}</div>
  </section>
  <div style="height:20px"></div>${nav("pharmacies")}`;
}

function logAsk(medId) {
  const log = LS.get("asks", []);
  log.unshift({ med: medId, at: Date.now(), district: S.district });
  LS.set("asks", log.slice(0, 50));
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
function doSearch(v) {
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
    case "med": return screenMed(p[1]);
    case "partner": return screenPartner(p[1]);
    case "search": return screenSearch();
    case "me": return screenMe();
    case "trust": return screenTrust();
    case "admin": return screenAdmin();
    default: return screen404();
  }
}

let firstPaint = true;
function render() {
  const el = app();
  if (firstPaint) { el.innerHTML = skeletonHome(); firstPaint = false; setTimeout(paint, 260); return; }
  paint();
  function paint() {
    el.innerHTML = route();
    el.classList.remove("page-in"); void el.offsetWidth; el.classList.add("page-in");
    document.title = `${L(CONFIG.brand)} — ${isAR() ? "أقرب رعاية إليك" : "The nearest care to you"}`;
  }
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
  if (qp.get("qr")) { S.qrSource = qp.get("qr"); const src = QR_SOURCES[S.qrSource]; if (src && S.locState === "inferred") { S.district = src.district; LS.set("district", src.district); } }
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
