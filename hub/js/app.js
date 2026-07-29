/* ============================================================
   قريب · الأفعال والموجّه — ACTIONS · ROUTER · RENDER · BOOT
   ============================================================
   Split out of one 5890-line js/app.js. These are CLASSIC SCRIPTS loaded in
   sequence, not modules: every top-level const, let and function still shares
   one global lexical scope, so the files see each other exactly as the single
   file's sections did. The ORDER in index.html is therefore load-bearing and
   is the original order of the file — changing it reintroduces the temporal
   dead zone that a single script's function hoisting used to hide.

   Nothing here was rewritten. The cut points are the section comments that
   were already in the file; the code between them is byte-identical.
   ============================================================ */

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
  el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
  el.style.cssText = "position:fixed;bottom:calc(var(--nav-h) + 16px);inset-inline:24px;max-width:420px;margin-inline:auto;z-index:95;background:var(--ink);color:var(--sand);padding:13px 16px;font-size:13.5px;font-weight:600;text-align:center;border-radius:10px";
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
    case "settings": return p[1] ? screenSettingsSub(p[1]) : screenSettings();
    case "privacy": return screenPrivacy();
    case "about": return screenAbout();
    /* The health record. Its screens live in js/ui-record.js — the two modes
       (patient and clinician) are a separate domain from the discovery
       network and do not belong in this file. */
    case "record": return p[1] ? screenRecordSection(p[1], p[2]) : screenRecord();
    case "clinical": return p[1] === "inbox" ? screenClinicalInbox() : screenClinical(p[1]);
    /* The network as clinical actors — js/ui-network.js. Each is its own
       screen with its own vocabulary, not a filtered view of the doctor's. */
    case "lab": return screenLab(p[1], p[2]);
    case "imaging": return p[1] === "study" ? screenImagingStudy(p[2]) : screenImaging(p[1], p[2]);
    case "pharmacy-rx": return screenPharmacyRx(p[1], p[2]);
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
  addEventListener("hashchange", () => {
    closeSheet(true); render(); scrollTo(0, 0);
    const main = document.getElementById("app");
    if (main) { main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
  });
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
