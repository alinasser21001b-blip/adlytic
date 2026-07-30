/* ============================================================
   قريب · الخادم من جهة العميل — MODE · DATA PLANE · AUTH · AUDIT
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
  /* This is the one screen in the product where getting "verified" wrong is
     not a labeling mistake — it is telling someone anxious about a controlled
     substance exactly which door to walk through. The filter used to read the
     raw `f.verified` flag, which is `true` on every synthetic pharmacy in
     this dataset (`DATA_PROVENANCE.sources.pharmacies.origin === "synthetic"`
     today), so this sheet recommended four invented addresses under the
     header "Licensed pharmacies nearby" for a real drug like clonazepam —
     each carrying a correct "sample data" badge that a person in this
     situation has no reason to stop and parse. `verificationState` asks the
     provenance first and returns `sample` regardless of the flag while the
     source is synthetic, so gating on it here means this list is
     legitimately empty until real, verified pharmacy data exists — which is
     the honest state, and the fallback message below already existed for
     exactly this case. */
  const licensed = allPharmacies()
    .filter((f) => verificationState(f, "pharmacies").k === "verified" && cityOf(f) === (S.exCity || "baghdad"))
    .slice(0, 4);
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
            ${sealBadge(f, "pharmacies")}</span>
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
