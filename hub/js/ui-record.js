/* ============================================================
   قريب · واجهة السجل الصحي — RECORD UI
   ============================================================
   Two experiences, deliberately not one (brief §22). A patient and a
   clinician want opposite things from the same data: the patient wants their
   own story, legible and under their control; the clinician wants the four
   facts that change what they are about to do, in the next thirty seconds.

   A single "record screen" serving both is the compromise that serves
   neither — it is how you get a patient portal a doctor cannot use and a
   clinical view a patient cannot read.

   This file renders. It decides nothing. Every clinical judgement here is a
   call into EMR / REC / CONSENT, so the rules are testable in Node without a
   browser and there is exactly one place where each rule lives. If you find
   yourself writing an `if` about clinical meaning in this file, it belongs in
   a domain module instead.

   Loaded AFTER app.js and uses its helpers (esc, isAR, header, nav, icon,
   toast, LS, S). Those are globals by design in this codebase — see app.js.
   ============================================================ */
(function () {
  "use strict";

  const E = () => globalThis.EMR;
  const R = () => globalThis.REC;
  const C = () => globalThis.CONSENT;
  const now = () => Date.now();
  const ar = () => (typeof isAR === "function" ? isAR() : true);
  const T = (a, e) => (ar() ? a : e);

  /* Arabic numerals stay Western in the app's numeral face; that is a
     deliberate identity decision made elsewhere and this file follows it. */
  const n = (v) => `<span class="num">${esc(String(v))}</span>`;

  /* ---------- the store ----------
     Local-first on purpose. Power, not bandwidth, is Iraq's failure mode —
     near-daily cuts, a national grid collapse in August 2025 — so a record
     that only exists after a successful round trip is a record that vanishes
     mid-consultation. Everything is written locally first and is readable
     with the radio off. Server sync is the data plane's job, not this
     file's. */
  const KEY = "qareeb.record.v1";
  function store() {
    const d = LS.get(KEY, null);
    return d || { patient: null, conditions: [], medications: [], allergies: [], procedures: [],
      results: [], documents: [], immunizations: [], encounters: [], prescriptions: [],
      episodes: [], tasks: [], appointments: [], shares: [], accessLog: [], requests: [] };
  }
  const save = (d) => LS.set(KEY, d);
  function mutate(fn) { const d = store(); fn(d); save(d); return d; }
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 9);

  /* Every read of the record by anyone who is not the patient goes through
     here, so the access log cannot be forgotten at a call site. */
  function readRecord(actor, scope, dataClass) {
    const d = store();
    const pid = d.patient && d.patient.id;
    const decision = C().decideAccess({ actor, patientId: pid, scope, dataClass,
      shares: d.shares, breakGlass: d.breakGlass, now: now() });
    if (decision.auditRequired) {
      mutate((x) => { x.accessLog.unshift(C().accessEntry({ actor, patientId: pid, scope, dataClass }, decision, now())); });
    }
    return { decision, record: decision.ok ? d : null };
  }

  /* =========================================================
     المريض — PATIENT MODE
     ========================================================= */

  /* §5: progressive disclosure. What is dangerous first, what is current
     second, everything else behind a tap. A record that opens onto fourteen
     equal sections is a filing cabinet, not a health record. */
  globalThis.screenRecord = function screenRecord() {
    const d = store();
    if (!d.patient) return screenRecordSetup();
    const p = d.patient;
    const prof = R().patientProfile(p, d, now());
    const brief = R().preVisitBrief(p, d, now());
    const alerts = C().accessAlerts(d.accessLog, now());
    const live = C().activeShares(d.shares, now());
    const pendingReq = (d.requests || []).filter((r) => C().requestState(r, now()) === C().REQ_STATE.PENDING);

    return `${header({ back: true, title: T("ملفي الصحي", "My health record") })}
    <section class="wrap" style="padding-top:14px">

      ${pendingReq.map((rq) => `<a class="note note-w" href="#/record/request/${esc(rq.id)}">
        ${icon("seal")}<div><b>${esc(rq.requester.name || rq.requester.id)}</b> ${T("يطلب الاطّلاع على ملفك", "is asking to see your record")}
        <div class="t3" style="margin-top:2px">${esc(rq.purpose)}</div></div></a>`).join("")}

      ${alerts.map((a) => `<a class="note ${a.kind === "BREAK_GLASS" ? "note-e" : "note-w"}" href="#/record/access">
        ${icon("eye")}<div>${esc(a.text)} — ${n(a.count)}</div></a>`).join("")}

      ${syncBanner()}

      <!-- WHO — the identity strip. Small on the patient's own screen: they
           know who they are. It is on the doctor's screen that this matters. -->
      <div class="rowb" style="margin-top:4px">
        <div>
          <div class="d3" style="font-size:20px">${esc(prof.name)}</div>
          <div class="t3">${prof.age != null ? n(prof.age) + " " + T("سنة", "y") : T("العمر غير مسجّل", "age not recorded")}
            · ${esc(R().sexLabel(prof.sex, ar()))}
            ${prof.birthDateEstimated ? ` · <span class="st st-q">${T("تاريخ تقديري", "estimated date")}</span>` : ""}</div>
        </div>
        <a class="b-g" href="#/record/profile">${T("تعديل", "Edit")}</a>
      </div>

      <!-- DANGER FIRST. Not chronology, not recency: what can hurt you. -->
      ${panelAllergies(d.allergies)}

      ${prof.awaitingVerification ? `<a class="note note-w" href="#/record/inbox">${icon("clock")}
        <div>${n(prof.awaitingVerification)} ${T("معلومة مستخرجة من تقاريرك لم يؤكّدها طبيب بعد", "extracted from your reports, not yet confirmed by a doctor")}</div></a>` : ""}

      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("الآن", "Right now")}</h2></div>
        <div class="stack-2">
          ${tile("#/record/conditions", T("المشاكل الصحية النشطة", "Active conditions"), prof.activeConditions)}
          ${tile("#/record/medications", T("الأدوية الحالية", "Current medications"), prof.currentMedications)}
          ${brief.overdue.length ? tile("#/record/followups", T("متابعات متأخّرة", "Overdue follow-ups"), brief.overdue.length, "warn") : ""}
          ${brief.pending.length ? tile("#/record/labs", T("نتائج معلّقة", "Pending results"), brief.pending.length) : ""}
        </div>
      </div>

      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("سجلي", "My record")}</h2></div>
        <div class="stack-2">
          ${tile("#/record/timeline", T("الخط الزمني", "Timeline"), null)}
          ${tile("#/record/visits", T("الزيارات", "Visits"), (d.encounters || []).length)}
          ${tile("#/record/labs", T("التحاليل", "Lab results"), (d.results || []).filter((x) => x.value != null).length)}
          ${tile("#/record/documents", T("التقارير والمستندات", "Documents"), (d.documents || []).length)}
          ${tile("#/record/procedures", T("العمليات السابقة", "Previous procedures"), (d.procedures || []).length)}
          ${tile("#/record/immunizations", T("التطعيمات", "Immunizations"), prof.immunizations)}
        </div>
      </div>

      <!-- CONTROL. Deliberately not buried in settings: if sharing and the
           access log are hard to find, the consent model is decorative. -->
      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("من يرى ملفي", "Who can see my record")}</h2></div>
        <div class="stack-2">
          ${tile("#/record/shares", T("المشاركات الفعّالة", "Active shares"), live.length)}
          ${tile("#/record/access", T("سجل الوصول", "Access history"), (d.accessLog || []).length)}
          ${tile("#/record/carry", T("ملخّص أحمله معي", "A summary I carry"), null)}
        </div>
      </div>

      <p class="t3" style="margin-top:22px;line-height:1.7">${T(
        "ملفك يبقى عندك. لا أحد يفتحه إلا بموافقتك، وكل فتح مسجّل هنا.",
        "Your record stays yours. Nobody opens it without your consent, and every opening is logged here.")}</p>
    </section>${nav("record")}`;
  };

  /* THE SYNC LINE. It says one of three things and never a fourth, because
     the fourth would be a reassurance nobody checked:

       not signed in  → your record is on this phone and nowhere else
       unsynced       → this much of it has not reached the server
       needs you      → something is stuck or conflicted

     Silence means everything the device holds, the server holds too. That is
     the only case where saying nothing is honest. */
  function syncBanner() {
    const T = globalThis.TRANSPORT;
    if (!T) return "";
    if (!T.signedIn()) {
      return `<div class="note note-w" style="margin-top:4px">${icon("info")}<div>${T_(
        "ملفك محفوظ على هذا الهاتف فقط. لو ضاع الهاتف أو انمسحت بيانات المتصفّح، يروح معه.",
        "Your record is on this phone only. If the phone is lost or the browser is cleared, it goes with it.")}
        <a class="b-g" style="display:block;margin-top:6px" href="#/record/signin">${T_(
          "فعّل الحفظ على الخادم", "Turn on server backup")}</a></div></div>`;
    }
    const s = T.status();
    if (s.needsAttention) {
      return `<a class="note note-e" href="#/record/sync" style="margin-top:4px">${icon("alert")}
        <div>${T_("في بيانات ما وصلت الخادم وتحتاج انتباهك",
                   "Some data has not reached the server and needs your attention")} — ${n(s.stuck + s.conflicts)}</div></a>`;
    }
    if (s.hasUnsynced) {
      return `<a class="note note-w" href="#/record/sync" style="margin-top:4px">${icon("clock")}
        <div>${n(s.pending + s.failed)} ${T_("عنصر محفوظ محلياً ولم يُرفع بعد",
          "item(s) saved locally, not uploaded yet")}</div></a>`;
    }
    return "";
  }
  const T_ = (a, e) => (ar() ? a : e);

  /* The full sync screen. Deliberately blunt: a person looking at this is
     usually looking because they are worried, and vagueness is the thing
     that made them worried. */
  function screenSync(d) {
    const T = globalThis.TRANSPORT, Y = globalThis.SYNC;
    const ob = d.outbox || [];
    const s = T ? T.status() : { total: 0 };
    return page(T_("حالة الحفظ", "Save status"),
      `${!ob.length ? `<div class="note">${icon("check")}<div>${T_(
        "كل شي وصل الخادم.", "Everything has reached the server.")}</div></div>`
        : `<div class="stack-2">${ob.map((e) => `<div class="rw"><div style="width:100%">
            <div class="rowb"><b>${esc(collectionLabel(e.collection))}</b>
              <span class="st ${e.state === "conflict" ? "st-e" : e.state === "failed" ? "st-e" : "st-q"}">${
                esc(Y.syncLabel(e.state, S.lang))}</span></div>
            ${e.lastError ? `<div class="t3" style="margin-top:4px">${esc(e.lastError)}</div>` : ""}
            ${e.attempts ? `<div class="t3" style="margin-top:2px">${T_("محاولات", "attempts")} ${n(e.attempts)}</div>` : ""}
            ${e.permanent ? `<div class="st st-e" style="margin-top:6px">${T_(
              "الخادم رفضها — ما راح تُعاد، وبياناتك محفوظة هنا",
              "the server refused it — it will not retry, and your data is still here")}</div>` : ""}
          </div></div>`).join("")}</div>`}
      ${T && T.signedIn() ? `<button class="btn" style="margin-top:16px" onclick="recordSyncNow()">${
        T_("حاول الرفع الآن", "Try uploading now")}</button>` : ""}`,
      T_("ما نعرض علامة صح إلا لمّا يأكّد الخادم فعلاً. «محفوظ محلياً» يعني محفوظ محلياً — لا أكثر.",
         "We never show a tick until the server actually confirms. 'Saved locally' means exactly that."));
  }

  const COL_LABELS = {
    encounters: ["زيارة", "Visit"], conditions: ["تشخيص", "Condition"],
    medications: ["دواء", "Medication"], allergies: ["حساسية", "Allergy"],
    results: ["نتيجة", "Result"], documents: ["مستند", "Document"],
    prescriptions: ["وصفة", "Prescription"], shares: ["مشاركة", "Share"],
    patient: ["بياناتك", "Your details"], immunizations: ["تطعيم", "Immunization"],
    appointments: ["موعد", "Appointment"],
  };
  const collectionLabel = (c) => (COL_LABELS[c] || [c, c])[ar() ? 0 : 1];

  globalThis.recordSyncNow = async function recordSyncNow() {
    const T = globalThis.TRANSPORT;
    if (!T) return;
    toast(T_("جارٍ المحاولة…", "Trying…"));
    const r = await T.drain();
    /* The message reports what actually happened, including the boring
       middle case where some landed and some did not. */
    toast(!r.ok ? (r.reason === "UNREACHABLE" ? T_("ما وصلنا الخادم — بياناتك محفوظة", "Could not reach the server — your data is safe")
        : r.reason === "NOT_SIGNED_IN" ? T_("تحتاج تفعّل الحفظ أولاً", "Turn on server backup first")
        : T_("ما نجحت المحاولة — بياناتك محفوظة", "The attempt failed — your data is safe"))
      : r.sent === 0 ? T_("ما في شي ينتظر الرفع", "Nothing waiting")
      : T_(`رُفع ${r.acked} من ${r.sent}`, `${r.acked} of ${r.sent} uploaded`));
    render();
  };

  /* Sign-in is the point at which a local record becomes a shareable one.
     It is offered, never forced: a patient who wants their history on their
     own phone and nowhere else is making a reasonable choice in a country
     with no data protection law, and the app should not argue with it. */
  function screenSignin(d) {
    return page(T_("الحفظ على الخادم", "Server backup"),
      `<div class="note">${icon("seal")}<div>${T_(
        "بدون هذا: ملفك على هذا الهاتف فقط — الطبيب ما يقدر يشوفه حتى لو وافقتِ، ولو انمسح المتصفّح راح.",
        "Without this your record is on this phone only — a doctor cannot see it even with your consent, and clearing the browser loses it.")}</div></div>
      <div class="note" style="margin-top:12px">${icon("info")}<div>${T_(
        "معه: ملفك يوصل أي طبيب توافقين له، وكل فتحة تبقى مسجّلة عندك. وتقدرين توقفينه بأي وقت.",
        "With it your record reaches any clinician you consent to, and every opening stays logged for you. You can turn it off at any time.")}</div></div>
      <p class="t3" style="margin-top:18px;line-height:1.8">${T_(
        "⚠ ما نقدر نفعّله الآن: تسجيل دخول المريض بالرمز غير مبني بعد. الواجهة والنقل جاهزان، والناقص هو نقطة التحقق.",
        "⚠ Not available yet: patient sign-in by one-time code is not built. The interface and the transport are ready; the verification endpoint is what is missing.")}</p>`,
      T_("قرارك، لا قرارنا.", "Your decision, not ours."));
  }

  const tile = (href, label, count, tone) =>
    `<a class="rw" href="${href}">
      <div class="rowb" style="width:100%">
        <span${tone === "warn" ? ' class="st st-e"' : ""}>${esc(label)}</span>
        <span class="t3">${count == null ? "" : n(count)}</span>
      </div></a>`;

  function panelAllergies(list) {
    const crit = E().criticalAllergies(list);
    if (!crit.length) {
      return `<a class="rw" href="#/record/allergies" style="margin-top:14px">
        <div class="rowb" style="width:100%"><span class="t3">${T("ما مسجّل عندك أي حساسية", "No allergy recorded")}</span>
        <span class="b-g">${T("أضف", "Add")}</span></div></a>`;
    }
    return `<div class="note note-e" style="margin-top:14px">${icon("alert")}
      <div style="width:100%">
        <b>${T("حساسية", "Allergies")}</b>
        <div class="stack-2" style="margin-top:6px">
          ${crit.map((a) => `<div class="rowb">
            <span>${esc(a.substance)}${a.reaction ? ` — <span class="t3">${esc(a.reaction)}</span>` : ""}</span>
            ${a.criticality === E().CRITICALITY.HIGH ? `<span class="st st-e">${T("خطرة", "high")}</span>` : ""}
          </div>`).join("")}
        </div>
      </div></div>`;
  }

  /* ---------- first run ---------- */
  function screenRecordSetup() {
    return `${header({ back: true, title: T("ملفي الصحي", "My health record") })}
    <section class="wrap" style="padding-top:22px">
      <h1 class="d1" style="font-size:26px;line-height:1.35">${T(
        "ملف صحي واحد، يمشي معك",
        "One health record, that travels with you")}</h1>
      <p class="t3" style="margin-top:12px;line-height:1.8">${T(
        "تحاليلك وأدويتك وعملياتك وتقاريرك في مكان واحد. تروح لأي دكتور جديد — ما تبدي من الصفر، وما تحتاج تتذكّر كل شي.",
        "Your labs, medicines, operations and reports in one place. Any new doctor you see starts from your story, not from nothing.")}</p>

      <div class="note" style="margin-top:20px">${icon("seal")}
        <div>${T("ما ننشر شي. الملف ما ينفتح إلا بموافقتك، وكل مرة ينفتح تشوف منو فتحه.",
                 "Nothing is published. It opens only with your consent, and you see every opening.")}</div></div>

      <button class="btn" style="margin-top:20px" onclick="recordCreate()">${T("ابدأ ملفي", "Start my record")}</button>
      <p class="t3" style="margin-top:14px">${T(
        "ما نطلب رقم بطاقة ولا وثيقة. الاسم وتاريخ الميلاد يكفون للبداية.",
        "No card number and no document required. A name and a date of birth are enough to start.")}</p>
    </section>${nav("record")}`;
  }

  /* Registration deliberately succeeds with no government document at all.
     Up to a million Iraqis lack civil documentation, and the barriers are
     ones they cannot resolve at an office — refusing them here would exclude
     exactly the patients whose continuity of care is already worst. */
  globalThis.recordCreate = function recordCreate() {
    sheet(`<h3 class="d3">${T("ملفي الصحي", "My health record")}</h3>
      <label class="fld"><span>${T("الاسم الثلاثي", "Full name")}</span>
        <input id="r-name" type="text" autocomplete="name" placeholder="${T("مثلاً: زينب كاظم عبدالله", "e.g. Zainab Kadhim Abdullah")}"></label>
      <label class="fld"><span>${T("تاريخ الميلاد", "Date of birth")}</span>
        <input id="r-dob" type="date"></label>
      <label class="row" style="gap:8px;margin-top:6px">
        <input id="r-dob-est" type="checkbox">
        <span class="t3">${T("ما أعرف التاريخ بالضبط", "I don't know the exact date")}</span></label>
      <div class="fld"><span>${T("الجنس", "Sex")}</span>
        <div class="btn-row" style="margin-top:6px">
          <button class="btn btn--2 btn--sm" onclick="recordSex('female',this)">${T("أنثى", "Female")}</button>
          <button class="btn btn--2 btn--sm" onclick="recordSex('male',this)">${T("ذكر", "Male")}</button>
        </div></div>
      <button class="btn" style="margin-top:16px" onclick="recordSave()">${T("احفظ", "Save")}</button>
      <p class="t3" style="margin-top:12px">${T(
        "ما نسجّل الديانة ولا القومية، وما نحتفظ بصورة البطاقة.",
        "We do not record religion or ethnicity, and we keep no image of any ID card.")}</p>`);
  };

  let pendingSex = null;
  globalThis.recordSex = function recordSex(v, el) {
    pendingSex = v;
    const row = el.parentElement;
    [...row.children].forEach((b) => b.classList.toggle("c-on", b === el));
  };

  globalThis.recordSave = function recordSave() {
    const name = (document.getElementById("r-name") || {}).value || "";
    const dob = (document.getElementById("r-dob") || {}).value || "";
    const est = !!((document.getElementById("r-dob-est") || {}).checked);
    const cand = { name: name.trim(), birthDate: dob || null, birthDateEstimated: est, sex: pendingSex };
    const g = E().canRegister(cand);
    if (!g.ok) {
      toast(g.reason === "NAME_REQUIRED" ? T("اكتب الاسم", "Enter a name")
        : g.reason === "FORBIDDEN_FIELD" ? T("حقل غير مسموح", "Field not allowed")
        : T("نحتاج تاريخ الميلاد أو وثيقة", "We need a date of birth or a document"));
      return;
    }
    mutate((d) => {
      d.patient = { ...cand, id: uid("PAT"), registeredAt: new Date().toISOString(),
        identifiers: [], contacts: [] };
    });
    pendingSex = null;
    closeSheet();
    toast(T("انفتح ملفك", "Your record is open"));
    render();
  };

  /* ---------- sections ---------- */

  globalThis.screenRecordSection = function screenRecordSection(section, id) {
    const d = store();
    if (!d.patient) { location.hash = "#/record"; return ""; }
    switch (section) {
      case "conditions": return listConditions(d);
      case "medications": return listMedications(d);
      case "allergies": return listAllergies(d);
      case "labs": return listLabs(d);
      case "documents": return listDocuments(d);
      case "immunizations": return listImmunizations(d);
      case "visits": return listVisits(d);
      case "procedures": return listProcedures(d);
      case "followups": return listFollowups(d);
      case "timeline": return screenTimeline(d);
      case "shares": return screenShares(d);
      case "access": return screenAccess(d);
      case "carry": return screenCarry(d);
      case "inbox": return screenInbox(d);
      case "request": return screenAccessRequest(d, id);
      case "sync": return screenSync(d);
      case "signin": return screenSignin(d);
      case "profile": return screenProfile(d);
      default: return screen404();
    }
  };

  const page = (title, body, sub) => `${header({ back: true, title })}
    <section class="wrap" style="padding-top:14px">
      ${sub ? `<p class="t3" style="margin-bottom:14px;line-height:1.7">${sub}</p>` : ""}
      ${body}
    </section>`;

  const empty = (text, action) => `<div class="note">${icon("info")}<div>${esc(text)}</div></div>${action || ""}`;

  function listConditions(d) {
    const active = E().activeConditions(d.conditions, now());
    const past = (d.conditions || []).filter((c) => c.clinicalStatus !== E().COND_STATE.ACTIVE);
    return page(T("المشاكل الصحية", "Conditions"),
      `${active.length ? `<div class="stack-2">${active.map((c) => `<div class="rw">
        <div style="width:100%">
          <div class="rowb"><b>${esc(c.display)}</b>
            ${c.chronic ? `<span class="st st-q">${T("مزمن", "chronic")}</span>` : ""}</div>
          <div class="t3" style="margin-top:4px">
            ${c.onsetDate ? T("منذ", "since") + " " + n(c.onsetDate) : ""}
            ${c.lastReviewed ? ` · ${T("آخر مراجعة", "last reviewed")} ${n(c.lastReviewed)}` : ""}
          </div>
          ${c.stale ? `<div class="st st-e" style="margin-top:6px">${T(
            "ما راجعها طبيب من مدة طويلة", "not reviewed by a clinician for a long time")}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك مشاكل نشطة", "No active conditions recorded"))}
      ${past.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("سابقة", "Past")}</h2></div>
        <div class="stack-2">${past.map((c) => `<div class="rw"><div class="rowb" style="width:100%">
          <span>${esc(c.display)}</span><span class="t3">${esc(c.clinicalStatus)}</span></div></div>`).join("")}</div></div>` : ""}`,
      T("المشاكل النشطة أولاً، والمزمنة قبل غيرها. الحالة الحالية — مو تاريخ كل شي صار.",
        "Active first, chronic before the rest. What is true now — not everything that ever happened."));
  }

  function listMedications(d) {
    const cur = E().currentMedications(d.medications, now());
    const unconf = cur.filter((m) => m.status === E().MED_STATE.UNCONFIRMED);
    const stopped = (d.medications || []).filter((m) => m.status === E().MED_STATE.STOPPED);
    return page(T("الأدوية", "Medications"),
      `${cur.length ? `<div class="stack-2">${cur.map((m) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(m.display)}</b>
            ${m.status === E().MED_STATE.UNCONFIRMED
              ? `<span class="st st-q">${T("غير مؤكّد", "unconfirmed")}</span>` : ""}</div>
          <div class="t3" style="margin-top:4px">${[m.dose, freqLabel(m.frequency)].filter(Boolean).map(esc).join(" · ")}</div>
          ${m.indication ? `<div class="t3" style="margin-top:2px">${T("لـ", "for")} ${esc(m.indication)}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك أدوية حالية", "No current medications recorded"))}
      ${unconf.length ? `<div class="note note-w" style="margin-top:12px">${icon("clock")}<div>${T(
        "أدوية ما أكّدها أحد من مدة. اسأل طبيبك إذا بعدك عليها.",
        "Medicines nobody has reconfirmed for a while. Ask your doctor whether you are still on them.")}</div></div>` : ""}
      ${stopped.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("موقوفة", "Stopped")}</h2></div>
        <div class="stack-2">${stopped.map((m) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><span>${esc(m.display)}</span><span class="t3">${n(m.stopDate || "")}</span></div>
          <div class="t3" style="margin-top:4px">${T("السبب", "reason")}: ${esc(m.stopReason || "—")}</div>
        </div></div>`).join("")}</div></div>` : ""}`,
      T("لماذا تُوقَف مهم مثل ماذا يُوصَف — الطبيب الجاي يحتاج يعرف إذا الدواء فشل أو سبّب حساسية.",
        "Why a drug stopped matters as much as why it started — the next clinician needs to know whether it failed or harmed you."));
  }

  const freqLabel = (f) => {
    const x = R().FREQ[f];
    return x ? (ar() ? x.ar : x.en) : (f || "");
  };

  function listAllergies(d) {
    return page(T("الحساسية", "Allergies"),
      d.allergies && d.allergies.length
        ? `<div class="stack-2">${E().criticalAllergies(d.allergies).map((a) => `<div class="rw">
            <div style="width:100%"><div class="rowb"><b>${esc(a.substance)}</b>
              <span class="st ${a.criticality === E().CRITICALITY.HIGH ? "st-e" : "st-q"}">${
                a.criticality === E().CRITICALITY.HIGH ? T("خطرة", "high") : T("خفيفة", "low")}</span></div>
            ${a.reaction ? `<div class="t3" style="margin-top:4px">${esc(a.reaction)}</div>` : ""}</div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك أي حساسية", "No allergy recorded")),
      T("هذي أول شي يشوفه أي طبيب يفتح ملفك — حتى لو ما شاركت غيرها.",
        "This is the first thing any clinician sees — even when you shared nothing else."));
  }

  function listLabs(d) {
    const done = (d.results || []).filter((x) => x.value != null);
    const pending = (d.results || []).filter((x) => x.status === "pending");
    const codes = [...new Set(done.map((x) => x.code).filter(Boolean))];
    return page(T("التحاليل", "Lab results"),
      `${pending.length ? `<div class="note note-w">${icon("clock")}<div><b>${T("معلّقة", "Pending")}</b>
        <div class="t3" style="margin-top:4px">${pending.map((x) => esc(x.display || x.code)).join(" · ")}</div></div></div>` : ""}
      ${codes.length ? `<div class="stack-2" style="margin-top:12px">${codes.map((code) => {
        const t = E().trend(d.results, code);
        const last = t.points[t.points.length - 1];
        return `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc((done.find((x) => x.code === code) || {}).display || code)}</b>
            <span class="${last && last.flag !== "normal" ? "st st-e" : "st st-v"}">${
              last ? n(last.value) + " " + esc(last.unit || "") : ""}</span></div>
          ${t.points.length > 1 ? `<div class="t3" style="margin-top:6px">${
            t.points.map((p) => n(p.value)).join(" ← ")}</div>` : ""}
          ${t.mixedLabs ? `<div class="st st-q" style="margin-top:6px">${T(
            "نتائج من مختبرات مختلفة — المقارنة بينها ما تنفع دائماً",
            "results from different laboratories — comparing them is not always valid")}</div>` : ""}
          ${t.mixedUnits ? `<div class="st st-e" style="margin-top:6px">${T(
            "وحدات قياس مختلفة", "different units of measure")}</div>` : ""}
        </div></div>`;
      }).join("")}</div>` : (pending.length ? "" : empty(T("ما عندك تحاليل مسجّلة", "No lab results recorded")))}`,
      T("الاتجاه أهم من الرقم المفرد — لكن نتائج مختبرين مختلفين ما تنرسم بخط واحد واثق.",
        "The trend matters more than any single number — but two laboratories do not draw one confident line."));
  }

  function listDocuments(d) {
    const docs = d.documents || [];
    return page(T("التقارير والمستندات", "Documents"),
      `${docs.length ? `<div class="stack-2">${docs.map((x) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(x.title)}</b><span class="t3">${n(x.documentDate)}</span></div>
          <div class="t3" style="margin-top:4px">${esc(docTypeLabel(x.type))}
            ${R().pendingClaims(x).length ? ` · <span class="st st-q">${
              n(R().pendingClaims(x).length)} ${T("معلومة تنتظر تأكيد طبيب", "awaiting a clinician")}</span>` : ""}</div>
        </div></div>`).join("")}</div>`
        : empty(T("ما رفعت أي تقرير بعد", "No documents uploaded yet"))}
      <div class="note" style="margin-top:14px">${icon("info")}<div>${T(
        "التقرير يبقى مثل ما هو — مصدر. أي معلومة تُقرأ منه تبقى «بانتظار التأكيد» حتى يأكّدها طبيب.",
        "A document stays exactly as it is — a source. Anything read out of it stays 'awaiting confirmation' until a clinician confirms it.")}</div></div>`,
      T("ارفع تقاريرك القديمة — حتى الورقية. هذا اللي يخلي ملفك يبدي من تاريخك الحقيقي مو من اليوم.",
        "Upload your old reports, paper included. That is what makes the record start from your actual history rather than from today."));
  }

  const DOC_LABELS = {
    "lab-report": ["تحليل", "Lab report"], "imaging-report": ["تقرير أشعة", "Imaging report"],
    "operative-note": ["تقرير عملية", "Operative note"], "discharge-summary": ["تقرير خروج", "Discharge summary"],
    "referral-letter": ["إحالة", "Referral"], "clinical-report": ["تقرير طبي", "Clinical report"],
    "vaccine-card": ["بطاقة تطعيم", "Vaccination card"], "other": ["مستند", "Document"],
  };
  const docTypeLabel = (t) => (DOC_LABELS[t] || [t, t])[ar() ? 0 : 1];

  function listImmunizations(d) {
    const given = R().givenImmunizations(d.immunizations);
    return page(T("التطعيمات", "Immunizations"),
      given.length
        ? `<div class="stack-2">${given.map((i) => `<div class="rw"><div class="rowb" style="width:100%">
            <span>${esc(i.vaccine)}</span>
            <span class="${i.documented ? "st st-v" : "st st-q"}">${
              i.documented ? T("موثّق", "documented") : T("بالذاكرة فقط", "from memory only")}</span>
          </div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك تطعيمات", "No immunizations recorded")),
      T("«أتذكّر إني أخذته» شي، و«مكتوب ببطاقة» شي ثاني — والنظام ما يخلطهم.",
        "'I remember having it' and 'it is written on a card' are different facts, and the record keeps them apart."));
  }

  function listVisits(d) {
    const enc = (d.encounters || []).slice().sort((a, b) =>
      new Date(b.startedAt) - new Date(a.startedAt));
    return page(T("الزيارات", "Visits"),
      enc.length ? `<div class="stack-2">${enc.map((e) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(e.chiefComplaint || T("زيارة", "Visit"))}</b>
            <span class="t3">${n(String(e.startedAt || "").slice(0, 10))}</span></div>
          <div class="t3" style="margin-top:4px">${esc(e.clinicianName || e.clinicianId || "")}</div>
          ${e.assessment ? `<div style="margin-top:6px">${esc(e.assessment)}</div>` : ""}
          ${e.state === E().ENC_STATE.AMENDED ? `<div class="st st-q" style="margin-top:6px">${T(
            "عليها ملحق تصحيحي", "has a correcting addendum")}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما عندك زيارات مسجّلة في قريب بعد", "No visits recorded in Qareeb yet")),
      T("الزيارة بعد توقيعها ما تتعدّل. التصحيح يجي كملحق باسم صاحبه وسببه — التاريخ ما ينمحي.",
        "A signed visit is never edited. A correction arrives as an addendum with its author and reason — history is not erased."));
  }

  function listProcedures(d) {
    const ps = d.procedures || [];
    return page(T("العمليات", "Procedures"),
      ps.length ? `<div class="stack-2">${ps.map((x) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(x.display)}</b><span class="t3">${n(x.performedAt || "")}</span></div>
          ${x.surgeon ? `<div class="t3" style="margin-top:4px">${esc(x.surgeon)}</div>` : ""}
          ${x.pathology ? `<div style="margin-top:6px">${T("النسيج المرضي", "Pathology")}: ${esc(x.pathology)}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك عمليات", "No procedures recorded")));
  }

  function listFollowups(d) {
    const open = E().openTasks(d.tasks, now());
    return page(T("المتابعات", "Follow-ups"),
      open.length ? `<div class="stack-2">${open.map((t) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(taskLabel(t.kind))}</b>
            ${t.overdue ? `<span class="st st-e">${T("متأخّرة", "overdue")}</span>` : ""}</div>
          ${t.about ? `<div class="t3" style="margin-top:4px">${esc(t.about)}</div>` : ""}
          ${t.dueAt ? `<div class="t3" style="margin-top:2px">${T("الموعد", "due")} ${n(String(t.dueAt).slice(0, 10))}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما عندك متابعات مفتوحة", "No open follow-ups")),
      T("«راجعني لمّا تطلع النتيجة» ما تكفي. النظام يحوّلها مهمّة لها موعد وصاحب — ويعرف إذا تأخّرت.",
        "'Come back when the result is out' is not enough. It becomes a task with a due date and an owner — and the system knows when it slips."));
  }

  const TASK_LABELS = {
    "result-acknowledgement": ["نتيجة تحتاج إقرار طبيب", "Result awaiting acknowledgement"],
    "referral-response": ["إحالة بلا رد", "Referral without response"],
    "pathology-pending": ["نسيج مرضي معلّق", "Pathology pending"],
    "followup-due": ["موعد متابعة", "Follow-up due"],
    "order-without-result": ["فحص مطلوب بلا نتيجة", "Test ordered, no result"],
  };
  const taskLabel = (k) => (TASK_LABELS[k] || [k, k])[ar() ? 0 : 1];

  /* ---------- timeline (§9) ---------- */
  function screenTimeline(d) {
    const byEp = E().timelineByEpisode({ ...d, patientId: d.patient.id });
    const groups = Array.isArray(byEp) ? byEp : [];
    return page(T("الخط الزمني", "Timeline"),
      groups.length ? groups.map((g) => `<div class="sec">
          <div class="sec-h"><h2 class="d3">${esc(g.title || T("أحداث متفرقة", "Other events"))}</h2>
            ${g.state ? `<span class="st st-q">${esc(epLabel(g.state))}</span>` : ""}</div>
          <div class="stack-2">${(g.events || []).map(eventRow).join("")}</div>
        </div>`).join("")
        : empty(T("الخط الزمني يمتلئ مع كل زيارة", "The timeline fills as visits are recorded")),
      T("مو كل حدث — بس اللي يغيّر القرار: تشخيص جديد، دواء بدأ أو وقف، نتيجة غير طبيعية، عملية، إحالة.",
        "Not every event — only the ones that change a decision: a new diagnosis, a drug started or stopped, an abnormal result, surgery, a referral."));
  }

  const EP_LABELS = { OPEN: ["مفتوحة", "open"], ACTIVE: ["نشطة", "active"], ON_HOLD: ["معلّقة", "on hold"],
                      COMPLETED: ["منتهية", "completed"], CANCELLED: ["ملغاة", "cancelled"] };
  const epLabel = (s) => (EP_LABELS[s] || [s, s])[ar() ? 0 : 1];

  const EVT_LABELS = {
    diagnosis: ["تشخيص", "diagnosis"], "medication-start": ["بدء دواء", "medication started"],
    "medication-stop": ["إيقاف دواء", "medication stopped"], result: ["نتيجة", "result"],
    procedure: ["عملية", "procedure"], referral: ["إحالة", "referral"], imaging: ["أشعة", "imaging"],
    admission: ["دخول مستشفى", "admission"], encounter: ["زيارة", "visit"],
  };
  const evtLabel = (k) => (EVT_LABELS[k] || [k, k])[ar() ? 0 : 1];

  const eventRow = (e) => `<div class="rw"><div style="width:100%">
      <div class="rowb"><span class="st st-q">${esc(evtLabel(e.kind))}</span>
        <span class="t3">${n(String(e.at || "").slice(0, 10))}</span></div>
      <div style="margin-top:6px">${esc(e.label || e.title || "")}</div>
      ${e.abnormal ? `<span class="st st-e" style="margin-top:6px">${T("غير طبيعية", "abnormal")}</span>` : ""}
    </div></div>`;

  /* ---------- sharing (§14) ---------- */
  function screenShares(d) {
    const live = C().activeShares(d.shares, now());
    const past = (d.shares || []).filter((s) => !C().isShareActive(s, now()));
    return page(T("المشاركات", "Sharing"),
      `${live.length ? `<div class="stack-2">${live.map((s) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(s.granteeName || s.granteeId)}</b>
            <button class="b-g" onclick="recordRevoke('${esc(s.id)}')">${T("إلغاء", "Revoke")}</button></div>
          <div class="t3" style="margin-top:4px">${T("ينتهي", "ends")} ${esc(untilLabel(s.expiresAt))}</div>
          <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px">
            ${s.scopes.map((x) => `<span class="chip">${esc(C().scopeLabel(x, S.lang))}</span>`).join("")}
          </div>
        </div></div>`).join("")}</div>`
        : empty(T("ما تشارك ملفك مع أحد حالياً", "You are not sharing your record with anyone right now"))}
      ${past.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("منتهية", "Ended")}</h2></div>
        <div class="stack-2">${past.slice(0, 8).map((s) => `<div class="rw"><div class="rowb" style="width:100%">
          <span class="t3">${esc(s.granteeName || s.granteeId)}</span>
          <span class="t3">${C().shareState(s, now()) === "revoked" ? T("ألغيتها", "you revoked it") : T("انتهت وحدها", "expired on its own")}</span>
        </div></div>`).join("")}</div></div>` : ""}`,
      T("كل مشاركة لها مدة وتنتهي وحدها. تقدر تلغيها بأي لحظة، وما تحتاج تعطي سبب.",
        "Every share has a duration and ends on its own. You can revoke it at any moment, and you owe nobody a reason."));
  }

  function untilLabel(at) {
    const left = new Date(at).getTime() - now();
    if (left <= 0) return T("انتهت", "ended");
    const h = Math.round(left / 3600000);
    if (h < 24) return T(`بعد ${h} ساعة`, `in ${h}h`);
    const days = Math.round(h / 24);
    return T(countAr ? countAr(days, ["بعد يوم", "بعد يومين", "بعد # أيام", "بعد # يوماً"]) : `بعد ${days} يوم`,
             `in ${days}d`);
  }

  globalThis.recordRevoke = function recordRevoke(id) {
    const d = store();
    const s = (d.shares || []).find((x) => x.id === id);
    if (!s) return;
    const r = C().revokeShare(s, d.patient.id, now());
    if (!r.ok) { toast(T("ما قدرنا نلغيها", "Could not revoke")); return; }
    mutate((x) => { x.shares = x.shares.map((y) => y.id === id ? r.share : y); });
    toast(T("انلغى الوصول", "Access revoked"));
    render();
  };

  /* ---------- access log (§15) ---------- */
  function screenAccess(d) {
    const h = C().accessHistory(d.accessLog, now(), S.lang);
    return page(T("سجل الوصول", "Access history"),
      h.length ? `<div class="stack-2">${h.map((r) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(r.actorName || r.actorId || T("مجهول", "unknown"))}</b>
            <span class="t3">${n(String(r.at || "").slice(0, 10) || whenShort(r.at))}</span></div>
          <div class="${r.granted ? "t3" : "st st-e"}" style="margin-top:4px">${esc(r.label)}</div>
          ${r.scopes.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px">
            ${r.scopes.map((x) => `<span class="chip">${esc(C().scopeLabel(x, S.lang))}</span>`).join("")}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما فتح ملفك أحد بعد", "Nobody has opened your record yet")),
      T("كل فتحة مكتوبة هنا — حتى المحاولات المرفوضة. وعد ما تقدر تتأكد منه مو وعد.",
        "Every opening is written here — including refused attempts. A promise you cannot check is not a promise."));
  }

  const whenShort = (at) => { try { return new Date(at).toISOString().slice(0, 10); } catch { return ""; } };

  /* ---------- the doctor's request, answered by the patient (§13) ---------- */
  function screenAccessRequest(d, id) {
    const rq = (d.requests || []).find((x) => x.id === id);
    if (!rq) return screen404();
    const state = C().requestState(rq, now());
    if (state !== C().REQ_STATE.PENDING) {
      return page(T("طلب اطّلاع", "Access request"),
        empty(state === C().REQ_STATE.EXPIRED ? T("الطلب انتهى وقته", "The request expired")
          : T("تم الرد على هذا الطلب", "You already answered this request")));
    }
    return page(T("طلب اطّلاع", "Access request"),
      `<div class="rw"><div style="width:100%">
        <div class="d3" style="font-size:18px">${esc(rq.requester.name || rq.requester.id)}</div>
        <div class="t3" style="margin-top:4px">${esc(rq.purpose)}</div>
      </div></div>
      <div class="sec"><div class="sec-h"><h2 class="d3">${T("يطلب يشوف", "Asking to see")}</h2></div>
        <div class="stack-2">${rq.scopes.map((x) => `<label class="rw"><div class="rowb" style="width:100%">
          <span>${esc(C().scopeLabel(x, S.lang))}</span>
          <input type="checkbox" class="req-scope" value="${esc(x)}" checked>
        </div></label>`).join("")}</div>
      </div>
      <div class="fld"><span>${T("لمدة", "For")}</span>
        <div class="chips chips--wrap" style="margin-top:8px">
          ${["VISIT", "DAY", "WEEK", "MONTH"].map((k, i) => `<button class="chip${i === 0 ? " c-on" : ""}"
            onclick="recordPickDuration('${k}',this)">${esc(ar() ? C().DURATION[k].ar : C().DURATION[k].en)}</button>`).join("")}
        </div></div>
      <button class="btn" style="margin-top:18px" onclick="recordApprove('${esc(rq.id)}')">${T("وافق", "Approve")}</button>
      <button class="btn btn--2" style="margin-top:10px" onclick="recordDecline('${esc(rq.id)}')">${T("لا، شكراً", "No thanks")}</button>
      <p class="t3" style="margin-top:14px;line-height:1.7">${T(
        "تقدر تشيل أي شي ما تريد تشاركه. الحساسية تنشارك دائماً — طبيب يشوف ملفك بلا ما يشوف حساسيتك أخطر من طبيب ما يشوف شي.",
        "You can untick anything. Allergies are always shared — a doctor who sees your record without your allergies is more dangerous than one who sees nothing.")}</p>`);
  }

  let pickedDuration = "VISIT";
  globalThis.recordPickDuration = function recordPickDuration(k, el) {
    pickedDuration = k;
    [...el.parentElement.children].forEach((b) => b.classList.toggle("c-on", b === el));
  };

  globalThis.recordApprove = function recordApprove(id) {
    const d = store();
    const rq = (d.requests || []).find((x) => x.id === id);
    if (!rq) return;
    const scopes = [...document.querySelectorAll(".req-scope")].filter((c) => c.checked).map((c) => c.value);
    if (!scopes.length) { toast(T("اختر شي واحد على الأقل", "Pick at least one thing")); return; }
    const res = C().respondToRequest(rq, C().REQ_STATE.APPROVED, d.patient.id, now(),
      { shareId: uid("SH"), scopes, duration: pickedDuration, modality: "IN_APP", language: S.lang });
    if (!res.ok) { toast(T("ما قدرنا نكمّل", "Could not complete")); return; }
    mutate((x) => {
      x.requests = x.requests.map((y) => y.id === id ? res.request : y);
      x.shares.unshift(res.share);
    });
    toast(T("انشارك ملفك", "Your record is shared"));
    location.hash = "#/record/shares";
  };

  globalThis.recordDecline = function recordDecline(id) {
    const d = store();
    const rq = (d.requests || []).find((x) => x.id === id);
    if (!rq) return;
    const res = C().respondToRequest(rq, C().REQ_STATE.DECLINED, d.patient.id, now());
    if (!res.ok) return;
    mutate((x) => { x.requests = x.requests.map((y) => y.id === id ? res.request : y); });
    toast(T("انرفض الطلب", "Request declined"));
    location.hash = "#/record";
  };

  /* ---------- the carried summary (§ Mozambique) ---------- */
  function screenCarry(d) {
    const live = (d.carry && !d.carry.redeemedBy && new Date(d.carry.expiresAt) > now()) ? d.carry : null;
    return page(T("ملخّص أحمله معي", "A summary I carry"),
      `${live ? `<div class="note note-w">${icon("seal")}<div style="width:100%">
          <b>${T("رمز فعّال", "Live code")}</b>
          <div class="nhuge" style="letter-spacing:.18em;margin-top:8px">${esc(live.code)}</div>
          <div class="t3" style="margin-top:8px">${T("ينتهي", "expires")} ${esc(untilLabel(live.expiresAt))} ·
            ${T("يُستعمل مرة واحدة", "single use")}</div>
        </div></div>`
        : `<button class="btn" onclick="recordIssueCarry()">${T("أصدر رمزاً للعيادة", "Issue a code for the clinic")}</button>`}
      <div class="note" style="margin-top:16px">${icon("info")}<div>${T(
        "اطبع الملخّص أو احفظه بهاتفك، وخذه معك. العيادة تمسح الرمز فتشوف ملفك لمدة الزيارة فقط — بعدها ينغلق وحده.",
        "Print the summary or keep it on your phone and take it with you. The clinic redeems the code and sees your record for the visit only — then it closes itself.")}</div></div>`,
      T("في بلد ما بيه ربط بين المستشفيات، أنت أفضل ناقل لملفك. الورقة تشتغل حتى لو انقطعت الكهرباء والإنترنت.",
        "In a country with no exchange between institutions, you are the best carrier of your own record. Paper works when the power and the network do not."));
  }

  globalThis.recordIssueCarry = function recordIssueCarry() {
    const d = store();
    /* Six characters from an unambiguous alphabet — no 0/O, no 1/I/l. A code
       read aloud across a clinic desk in a noisy waiting room has to survive
       being misheard once. */
    const A = "ACDEFGHJKMNPQRTUVWXY34679";
    let code = "";
    for (let i = 0; i < 6; i++) code += A[Math.floor(Math.random() * A.length)];
    const r = C().issueCarryCode(d.patient.id, C().DEFAULT_SCOPES, now(), code);
    if (!r.ok) { toast(T("ما قدرنا نصدر رمز", "Could not issue a code")); return; }
    mutate((x) => { x.carry = r.carry; });
    render();
  };

  /* ---------- the unverified tray (§11) ---------- */
  function screenInbox(d) {
    const items = R().awaitingVerification(d.documents);
    return page(T("بانتظار تأكيد طبيب", "Awaiting a clinician"),
      items.length ? `<div class="stack-2">${items.map((x) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(claimText(x.claim))}</b>
            <span class="st st-q">${T("غير مؤكّد", "unconfirmed")}</span></div>
          <div class="t3" style="margin-top:4px">${T("من", "from")} ${esc(x.title)}</div>
        </div></div>`).join("")}</div>`
        : empty(T("ما في شي ينتظر تأكيد", "Nothing is waiting for confirmation")),
      T("هذي معلومات انقرأت من تقاريرك آلياً. ما تدخل ملفك الرسمي إلا لمّا يأكّدها طبيب — الآلة ما تشخّص.",
        "These were read out of your reports automatically. They do not enter the record until a clinician confirms them — the machine does not diagnose."));
  }

  const claimText = (c) => c.name || c.code || c.test || "—";

  /* ---------- profile ---------- */
  function screenProfile(d) {
    const p = d.patient;
    return page(T("بياناتي", "My details"),
      `<div class="stack-2">
        ${row(T("الاسم", "Name"), E().fullName(p))}
        ${row(T("تاريخ الميلاد", "Date of birth"), p.birthDate || "—")}
        ${row(T("الجنس", "Sex"), R().sexLabel(p.sex, ar()))}
        ${row(T("معرّف قريب", "Qareeb ID"), p.id)}
      </div>
      <div class="note" style="margin-top:16px">${icon("seal")}<div>${T(
        "معرّف قريب هو المفتاح — مو رقم البطاقة الوطنية. الوثائق الرسمية تنربط بالملف وما تكون أساسه، لأن الرقم ممكن يتغيّر والملف ما ينشطر.",
        "The Qareeb ID is the key — not the national card number. Official documents attach to the record rather than being its foundation, so a changed number never splits a patient in two.")}</div></div>`);
  }

  const row = (k, v) => `<div class="rw"><div class="rowb" style="width:100%">
    <span class="t3">${esc(k)}</span><span>${esc(v)}</span></div></div>`;

  /* =========================================================
     الطبيب — DOCTOR MODE
     =========================================================
     Section 16 and 17. The first screen answers one question — who is this
     person and what must I know right now — and everything else is a tap
     away. A doctor with four minutes does not scroll.
     ========================================================= */

  globalThis.screenClinical = function screenClinical(patientId) {
    const me = currentClinician();
    if (!me) return clinicianSetup();
    const d = store();
    if (!d.patient) return page(T("ملف المريض", "Patient record"),
      empty(T("ما في ملف على هذا الجهاز", "No record on this device")));

    const { decision, record } = readRecord(me, C().SCOPE.SUMMARY);
    if (!decision.ok) return screenNoAccess(d, me, decision);

    const brief = R().preVisitBrief(record.patient, record, now(), S.lang);
    const sc = decision.scopes;
    const has = (x) => sc.indexOf(x) !== -1;

    return `${header({ back: true, title: T("لقطة سريرية", "Clinical snapshot") })}
    <section class="wrap" style="padding-top:12px">

      <!-- PATIENT SAFETY BAR. Fixed content, fixed order, always first. -->
      <div class="qa" style="padding:14px">
        <div class="rowb">
          <div class="d3" style="font-size:19px">${esc(brief.patient.name)}</div>
          <span class="t3">${esc(brief.headline)}</span>
        </div>
        ${brief.allergies.length ? `<div class="note note-e" style="margin-top:10px">${icon("alert")}
          <div><b>${T("حساسية", "ALLERGY")}</b> — ${brief.allergies.map((a) =>
            esc(a.substance) + (a.reaction ? ` <span class="t3">(${esc(a.reaction)})</span>` : "")).join(" · ")}</div></div>`
          : `<div class="t3" style="margin-top:10px">${T("ما مسجّل أي حساسية — وهذا مو نفس «ما عنده حساسية»",
              "No allergy recorded — which is not the same as 'no allergies'")}</div>`}
        <div class="row" style="flex-wrap:wrap;gap:6px 10px;margin-top:10px">
          ${brief.active.slice(0, 4).map((c) => `<span class="chip">${esc(c.name)}</span>`).join("")}
          ${brief.medications.length ? `<span class="st st-q">${n(brief.medications.length)} ${T("دواء", "meds")}</span>` : ""}
        </div>
      </div>

      <!-- WHAT IS ON FIRE. Unacknowledged abnormals and overdue loops come
           before the ordinary record, because they are the failures that
           reach a patient before anyone notices. -->
      ${brief.unacknowledgedAbnormal.length ? `<div class="note note-e" style="margin-top:12px">${icon("alert")}
        <div style="width:100%"><b>${T("نتائج غير طبيعية ما أقرّها أحد", "Abnormal, unacknowledged")}</b>
          <div class="stack-2" style="margin-top:6px">${brief.unacknowledgedAbnormal.map((x) => `<div class="rowb">
            <span>${esc(x.name)}</span><span>${n(x.value)} ${esc(x.unit || "")} · ${n(String(x.at).slice(0, 10))}</span>
          </div>`).join("")}</div></div></div>` : ""}

      ${brief.overdue.length ? `<div class="note note-w" style="margin-top:10px">${icon("clock")}
        <div><b>${T("حلقات مفتوحة متأخّرة", "Overdue open loops")}</b>
          <div class="t3" style="margin-top:4px">${brief.overdue.map((t) =>
            esc(taskLabel(t.kind)) + (t.about ? " — " + esc(t.about) : "")).join(" · ")}</div></div></div>` : ""}

      ${brief.unverifiedClaims ? `<div class="note note-w" style="margin-top:10px">${icon("info")}
        <div>${n(brief.unverifiedClaims)} ${T(
          "معلومة مستخرجة من مستندات المريض ما تحققت — تحتاج قرارك",
          "claims extracted from the patient's documents, unverified — they need your decision")}
        <a class="b-g" href="#/clinical/inbox" style="display:block;margin-top:6px">${T("افتحها", "Open them")}</a></div></div>` : ""}

      <!-- CLINICAL SNAPSHOT -->
      ${has(C().SCOPE.MEDICATIONS) ? section(T("الأدوية الحالية", "Current medications"),
        brief.medications.length ? brief.medications.map((m) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(m.name)}</b>${m.status === "unconfirmed"
            ? `<span class="st st-q">${T("غير مؤكّد", "unconfirmed")}</span>` : ""}</div>
          <div class="t3" style="margin-top:4px">${[m.dose, freqLabel(m.frequency), m.indication].filter(Boolean).map(esc).join(" · ")}</div>
        </div></div>`).join("") : emptyRow(T("ما مسجّل", "none recorded"))) : lockedSection(T("الأدوية", "Medications"))}

      ${has(C().SCOPE.CONDITIONS) ? section(T("المشاكل النشطة", "Active problems"),
        brief.active.length ? brief.active.map((c) => `<div class="rw"><div class="rowb" style="width:100%">
          <span>${esc(c.name)}${c.chronic ? ` <span class="st st-q">${T("مزمن", "chronic")}</span>` : ""}</span>
          ${c.stale ? `<span class="st st-e">${T("ما رُوجعت", "not reviewed")}</span>` : ""}
        </div></div>`).join("") : emptyRow(T("ما مسجّل", "none recorded"))) : lockedSection(T("المشاكل", "Conditions"))}

      ${brief.trends.length ? section(T("اتجاهات تحرّكت", "Trends that moved"),
        brief.trends.map((t) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(t.code)}</b><span class="t3">${esc(dirLabel(t.direction))}</span></div>
          <div class="t3" style="margin-top:6px">${t.points.map((p) => n(p.value)).join(" ← ")}</div>
          ${t.mixedLabs ? `<div class="st st-e" style="margin-top:6px">${T(
            "مختبرات مختلفة — لا تقرأها كخط واحد", "different laboratories — do not read as one line")}</div>` : ""}
        </div></div>`).join("")) : ""}

      ${brief.pending.length ? section(T("معلّق", "Pending"),
        brief.pending.map((x) => `<div class="rw"><div class="rowb" style="width:100%">
          <span>${esc(x.name)}</span><span class="t3">${T("طُلب", "ordered")} ${n(String(x.orderedAt || "").slice(0, 10))}</span>
        </div></div>`).join("")) : ""}

      ${brief.lastEncounter ? section(T("آخر زيارة", "Last visit"),
        `<div class="rw"><div style="width:100%">
          <div class="t3">${n(String(brief.lastEncounter.at).slice(0, 10))} · ${esc(brief.lastEncounter.clinicianId || "")}</div>
          ${brief.lastEncounter.assessment ? `<div style="margin-top:6px">${esc(brief.lastEncounter.assessment)}</div>` : ""}
        </div></div>`) : ""}

      <div class="btn-row" style="margin-top:20px">
        <a class="btn" href="#/clinical/encounter">${T("سجّل زيارة", "Record a visit")}</a>
        <a class="btn btn--2" href="#/record/timeline">${T("الخط الزمني", "Timeline")}</a>
      </div>

      <p class="t3" style="margin-top:18px;line-height:1.7">${esc(brief.caveat)}</p>
      <p class="t3" style="margin-top:8px">${T("وصولك ينتهي", "Your access ends")}
        ${decision.expiresAt ? esc(untilLabel(decision.expiresAt)) : ""}.</p>
    </section>`;
  };

  const section = (title, body) => `<div class="sec"><div class="sec-h"><h2 class="d3">${esc(title)}</h2></div>
    <div class="stack-2">${body}</div></div>`;
  const emptyRow = (t) => `<div class="rw"><span class="t3">${esc(t)}</span></div>`;
  const lockedSection = (title) => `<div class="sec"><div class="sec-h"><h2 class="d3">${esc(title)}</h2>
    <span class="st st-q">${T("ما شاركها المريض", "not shared")}</span></div></div>`;

  const DIR_LABELS = { rising: ["يرتفع", "rising"], falling: ["ينخفض", "falling"], flat: ["ثابت", "flat"] };
  const dirLabel = (dd) => (DIR_LABELS[dd] || [dd, dd])[ar() ? 0 : 1];

  /* The screen a clinician sees when they have no consent — and the point at
     which most systems either leak or dead-end. It does neither: it offers
     the two lawful routes, and names the price of the second one. */
  function screenNoAccess(d, me, decision) {
    return `${header({ back: true, title: T("ملف المريض", "Patient record") })}
    <section class="wrap" style="padding-top:20px">
      <div class="note note-w">${icon("seal")}<div>${
        decision.reason === "SCOPE_NOT_GRANTED" ? T("المريض ما شارك هذا الجزء", "The patient did not share this part")
        : T("ما عندك إذن من المريض", "You do not have the patient's consent")}</div></div>

      <button class="btn" style="margin-top:18px" onclick="clinicalRequest()">${T("اطلب من المريض", "Ask the patient")}</button>
      <p class="t3" style="margin-top:10px">${T(
        "يوصله طلب على هاتفه، ويقرّر هو شنو يشارك ولمدة كم.",
        "A request reaches their phone and they decide what to share and for how long.")}</p>

      <div class="sec" style="margin-top:26px">
        <div class="sec-h"><h2 class="d3">${T("حالة طارئة", "Emergency")}</h2></div>
        <p class="t3" style="line-height:1.7">${T(
          "إذا المريض ما يكدر يوافق — فاقد وعي مثلاً — تقدر تفتح الملف بوصول طوارئ. ينفتح الملف كامل لساعة، ويوصل المريض إشعار بأنك فتحته، ويبقى مسجّلاً باسمك للأبد.",
          "If the patient cannot consent — unconscious, for example — you can open the record under emergency access. It opens fully for one hour, the patient is notified that you opened it, and it stays recorded under your name permanently.")}</p>
        <button class="btn btn--danger" style="margin-top:12px" onclick="clinicalBreakGlass()">${
          T("وصول طوارئ", "Emergency access")}</button>
      </div>
    </section>`;
  }

  globalThis.clinicalRequest = function clinicalRequest() {
    const me = currentClinician();
    const d = store();
    sheet(`<h3 class="d3">${T("اطلب الاطّلاع", "Ask to view")}</h3>
      <label class="fld"><span>${T("ليش تحتاج الملف؟ المريض راح يقرأ هذا", "Why do you need it? The patient will read this")}</span>
        <input id="cr-purpose" type="text" placeholder="${T("مثلاً: مراجعة أدويتك قبل الوصفة", "e.g. reviewing your medicines before prescribing")}"></label>
      <button class="btn" style="margin-top:14px" onclick="clinicalSendRequest()">${T("أرسل الطلب", "Send request")}</button>
      <p class="t3" style="margin-top:12px">${T(
        "الطلب ينتهي بعد ١٥ دقيقة إذا ما رد.", "The request expires after 15 minutes if unanswered.")}</p>`);
  };

  globalThis.clinicalSendRequest = function clinicalSendRequest() {
    const me = currentClinician();
    const d = store();
    const purpose = (document.getElementById("cr-purpose") || {}).value || "";
    const r = C().requestAccess({ id: uid("REQ"), patientId: d.patient.id, requester: me,
      purpose: purpose.trim() }, now());
    if (!r.ok) {
      toast(r.reason === "PURPOSE_REQUIRED" ? T("اكتب سبب الطلب", "State why") : T("ما قدرنا نرسل", "Could not send"));
      return;
    }
    mutate((x) => { x.requests.unshift(r.request); });
    closeSheet();
    toast(T("وصل الطلب لهاتف المريض", "The request reached the patient's phone"));
    render();
  };

  globalThis.clinicalBreakGlass = function clinicalBreakGlass() {
    sheet(`<h3 class="d3">${T("وصول طوارئ", "Emergency access")}</h3>
      <div class="note note-e">${icon("alert")}<div>${T(
        "هذا مو اختصار. يوصل المريض إشعار، ويبقى باسمك في السجل، وينفتح ساعة وحدة وينغلق وحده.",
        "This is not a shortcut. The patient is notified, it stays under your name, it lasts one hour and closes itself.")}</div></div>
      <label class="fld" style="margin-top:12px"><span>${T("السبب السريري", "Clinical reason")}</span>
        <input id="bg-reason" type="text" placeholder="${T("مثلاً: فاقد الوعي — إنعاش", "e.g. unconscious — resuscitation")}"></label>
      <button class="btn btn--danger" style="margin-top:14px" onclick="clinicalBreakGlassGo()">${
        T("افتح الملف", "Open the record")}</button>`);
  };

  globalThis.clinicalBreakGlassGo = function clinicalBreakGlassGo() {
    const me = currentClinician();
    const d = store();
    const reason = (document.getElementById("bg-reason") || {}).value || "";
    const g = E().breakGlass(me, d.patient.id, reason.trim(), now());
    if (!g.ok) { toast(T("اكتب السبب", "State the reason")); return; }
    mutate((x) => { x.breakGlass = g.grant; });
    closeSheet();
    toast(T("انفتح — والمريض انبلّغ", "Opened — and the patient has been told"));
    render();
  };

  /* ---------- the clinician's own identity ---------- */
  const DOC_KEY = "qareeb.clinician.v1";
  const currentClinician = () => LS.get(DOC_KEY, null);

  function clinicianSetup() {
    return page(T("حسابك المهني", "Your professional account"),
      `<div class="note">${icon("seal")}<div>${T(
        "قريب ما يخلي أي أحد يسجّل نفسه كطبيب موثّق. تقدر تشوف ملف مريض شاركه وياك من الحين، لكن الكتابة بالسجل تحتاج توثيق: رقم الإجازة، ورقم النقابة، والاختصاص.",
        "Qareeb does not let anyone register themselves as a verified doctor. You can view a record a patient shares with you now, but writing into the record needs verification: licence number, syndicate number and specialty.")}</div></div>
      <label class="fld" style="margin-top:14px"><span>${T("الاسم", "Name")}</span><input id="dr-name" type="text"></label>
      <label class="fld"><span>${T("الاختصاص", "Specialty")}</span><input id="dr-spec" type="text"></label>
      <label class="fld"><span>${T("رقم الإجازة", "Licence number")}</span><input id="dr-lic" type="text"></label>
      <label class="fld"><span>${T("رقم النقابة", "Syndicate number")}</span><input id="dr-syn" type="text"></label>
      <button class="btn" style="margin-top:16px" onclick="clinicianSave()">${T("احفظ", "Save")}</button>`);
  }

  globalThis.clinicianSave = function clinicianSave() {
    const g = (id) => ((document.getElementById(id) || {}).value || "").trim();
    const me = { id: uid("DR"), name: g("dr-name"), role: E().ROLE.DOCTOR,
      specialty: g("dr-spec"), licenseNumber: g("dr-lic"), syndicateId: g("dr-syn"),
      licenseStatus: "SELF_ASSERTED" };
    if (!me.name) { toast(T("اكتب الاسم", "Enter a name")); return; }
    const v = R().providerVerification(me);
    LS.set(DOC_KEY, me);
    toast(v.status === "UNVERIFIED"
      ? T("انحفظ — تقدر تشوف بس ما تكتب", "Saved — you can view but not write")
      : T("انحفظ — التوثيق قيد المراجعة", "Saved — verification pending review"));
    render();
  };

  /* ---------- clinician inbox: confirm or reject extracted claims ---------- */
  globalThis.screenClinicalInbox = function screenClinicalInbox() {
    const me = currentClinician();
    if (!me) return clinicianSetup();
    const d = store();
    const items = R().awaitingVerification(d.documents);
    const canWrite = R().canWriteClinical(me);
    return page(T("معلومات تنتظر قرارك", "Awaiting your decision"),
      `${canWrite ? "" : `<div class="note note-w">${icon("seal")}<div>${T(
        "حسابك غير موثّق بعد — تقدر تقرأ، لكن التأكيد يحتاج توثيق.",
        "Your account is not verified yet — you can read, but confirming needs verification.")}</div></div>`}
      ${items.length ? `<div class="stack-2" style="margin-top:12px">${items.map((x) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(claimText(x.claim))}</b><span class="st st-q">${esc(kindLabel(x.claim.kind))}</span></div>
          <div class="t3" style="margin-top:4px">${T("من", "from")} ${esc(x.title)}</div>
          ${canWrite ? `<div class="btn-row" style="margin-top:10px">
            <button class="btn btn--sm" onclick="clinicalConfirm('${esc(x.documentId)}','${esc(x.claim.id)}')">${T("أكّد", "Confirm")}</button>
            <button class="btn btn--2 btn--sm" onclick="clinicalReject('${esc(x.documentId)}','${esc(x.claim.id)}')">${T("ارفض", "Reject")}</button>
          </div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما في شي ينتظر", "Nothing waiting"))}`,
      T("الآلة تقرأ، وأنت تقرّر. ما تدخل معلومة السجل الرسمي إلا بقرارك.",
        "The machine reads, you decide. Nothing enters the record without your decision."));
  };

  const KIND_LABELS = { condition: ["تشخيص", "condition"], medication: ["دواء", "medication"],
    allergy: ["حساسية", "allergy"], procedure: ["عملية", "procedure"], result: ["نتيجة", "result"],
    immunization: ["تطعيم", "immunization"] };
  const kindLabel = (k) => (KIND_LABELS[k] || [k, k])[ar() ? 0 : 1];

  globalThis.clinicalConfirm = function clinicalConfirm(docId, claimId) {
    decideClaim(docId, claimId, "confirmed", null);
  };
  globalThis.clinicalReject = function clinicalReject(docId, claimId) {
    sheet(`<h3 class="d3">${T("سبب الرفض", "Reason for rejecting")}</h3>
      <label class="fld"><span>${T("ليش؟", "Why?")}</span><input id="rj-reason" type="text"
        placeholder="${T("مثلاً: غير مقروء", "e.g. illegible")}"></label>
      <button class="btn" style="margin-top:14px"
        onclick="decideClaimFromSheet('${esc(docId)}','${esc(claimId)}')">${T("ارفض", "Reject")}</button>`);
  };
  globalThis.decideClaimFromSheet = function decideClaimFromSheet(docId, claimId) {
    const reason = ((document.getElementById("rj-reason") || {}).value || "").trim();
    if (!reason) { toast(T("اكتب السبب", "State the reason")); return; }
    closeSheet();
    decideClaim(docId, claimId, "rejected", reason);
  };

  function decideClaim(docId, claimId, decision, reason) {
    const me = currentClinician();
    const d = store();
    const doc = (d.documents || []).find((x) => x.id === docId);
    if (!doc) return;
    const r = R().confirmClaim(doc, claimId,
      decision === "confirmed" ? R().EXTRACT_STATE.CONFIRMED : R().EXTRACT_STATE.REJECTED,
      me, now(), reason);
    if (!r.ok) {
      toast(r.reason === "CLINICIAN_REQUIRED" ? T("يحتاج حساب طبيب", "A clinician account is required")
        : T("ما قدرنا نكمّل", "Could not complete"));
      return;
    }
    mutate((x) => {
      x.documents = x.documents.map((y) => y.id === docId ? r.document : y);
      /* Confirming a claim is what PROMOTES it into the longitudinal list.
         Until this moment it was a claim about a document; from here it is a
         clinical fact with a named human behind it. */
      const claim = r.document.claims.find((c) => c.id === claimId);
      if (decision === "confirmed" && claim) promoteClaim(x, claim, me);
    });
    toast(decision === "confirmed" ? T("دخلت السجل", "Entered the record") : T("انرفضت", "Rejected"));
    render();
  }

  function promoteClaim(d, claim, by) {
    const stamp = { recordedBy: by.id, recordedAt: new Date().toISOString(),
      source: E().SOURCE.EXTERNAL, verificationStatus: E().VERIFY.CONFIRMED, verifiedBy: by.id };
    switch (claim.kind) {
      case "condition":
        d.conditions.push({ id: uid("C"), display: claim.name, clinicalStatus: E().COND_STATE.ACTIVE,
          chronic: !!claim.chronic, onsetDate: claim.date || null, lastReviewed: stamp.recordedAt, ...stamp });
        break;
      case "allergy":
        d.allergies.push({ id: uid("A"), substance: claim.name, reaction: claim.reaction || null,
          criticality: claim.criticality || E().CRITICALITY.UNABLE, ...stamp });
        break;
      case "medication":
        /* Promoted medicines start UNCONFIRMED, not ACTIVE. A clinician
           confirming that a document mentions a drug is not the same as
           confirming the patient is currently taking it. */
        d.medications.push({ id: uid("M"), display: claim.name, dose: claim.dose || null,
          status: E().MED_STATE.UNCONFIRMED, startDate: claim.date || null, ...stamp });
        break;
      case "procedure":
        d.procedures.push({ id: uid("P"), display: claim.name, performedAt: claim.date || null, ...stamp });
        break;
      case "result":
        d.results.push({ id: uid("R"), code: claim.code || claim.name, display: claim.name,
          value: claim.value, unit: claim.unit || null, effectiveAt: claim.date || null,
          refLow: claim.refLow ?? null, refHigh: claim.refHigh ?? null, ...stamp });
        break;
      case "immunization":
        d.immunizations.push({ id: uid("I"), vaccine: claim.name, date: claim.date || null,
          status: "completed", evidence: "facility-record", documented: true, ...stamp });
        break;
    }
  }
})();
