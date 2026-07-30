/* ============================================================
   قريب · طلب الدواء — PUBLISH · TRACK · CONTACT · RADAR · PARTNER
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
            ${sealBadge(f, "pharmacies")}</span>
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
          ${sealBadge(f, "pharmacies")}</div>
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
