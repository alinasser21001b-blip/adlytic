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
      vitals: [], episodes: [], tasks: [], appointments: [], shares: [], accessLog: [], requests: [] };
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

      ${currentStatusPanel(brief)}

      <!-- The record had four hundred ways to READ it and none to add to it.
           Four kinds, named for what a patient actually has to say, not for
           the tables they land in. -->
      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("أضف لملفك", "Add to your record")}</h2></div>
        <div class="chips chips--wrap" style="margin-top:4px">
          <a class="chip" href="#/record/add/allergy">${icon("alert")}${T("حساسية", "Allergy")}</a>
          <a class="chip" href="#/record/add/medication">${icon("pill")}${T("دواء", "Medicine")}</a>
          <a class="chip" href="#/record/add/condition">${icon("stetho")}${T("مشكلة صحية", "Condition")}</a>
          <a class="chip" href="#/record/add/document">${icon("cal")}${T("تقرير عندي", "A report I have")}</a>
          <a class="chip" href="#/record/add/vital">${icon("gauge")}${T("قياس", "A measurement")}</a>
        </div>
      </div>

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
          ${tile("#/record/vitals", T("القياسات — ضغط، وزن، سكر", "Measurements — BP, weight, sugar"), (d.vitals || []).length)}
        </div>
      </div>

      <!-- CONTROL. Deliberately not buried in settings: if sharing and the
           access log are hard to find, the consent model is decorative. -->
      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("من يرى ملفي", "Who can see my record")}</h2></div>
        <div class="stack-2">
          ${tile("#/record/shares", T("المشاركات الفعّالة", "Active shares"), live.length)}
          ${tile("#/record/share", T("شارك ملفك مع طبيب", "Share with a clinician"), null)}
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

  /* ---------- current status (record home) ----------
     Everything below the allergy panel used to be an undifferentiated list
     of category rows, each showing a bare count — an abnormal blood pressure
     reading looked exactly like "التطعيمات ٠" in every way that matters
     visually, and a person had to open every single category to find out
     whether anything here was worth their attention today.

     This is the one prose summary worth reading before deciding whether to
     open anything else. It is built entirely from `preVisitBrief` — the same
     computation the clinician's own screen uses — and it never repeats what
     a category screen already shows in full; a trend's dates, reference
     range and every point stay on `#/record/labs`, this states only the
     single most current fact. Returns "" when there is genuinely nothing to
     say, rather than inventing a placeholder line to avoid a gap. */
  function currentStatusPanel(brief) {
    if (!brief) return "";
    /* One list, not two competing branches. The first version put an
       abnormal home blood-pressure reading in a separate "calm state" branch
       that only rendered when NOTHING else was urgent — so a patient with
       both an unacknowledged lab result and a genuinely high blood pressure
       this week would never see the blood pressure at all here, because the
       lab result had already filled the slot. An abnormal reading does not
       stop being worth seeing because a different abnormal reading exists. */
    const urgent = [];
    for (const x of brief.unacknowledgedAbnormal || []) urgent.push(
      `<div><div class="rowb"><span>${esc(x.name)}</span>${measure(x.value, x.unit)}</div>
        <div class="t3" style="margin-top:2px">${T("نتيجة غير طبيعية ما أقرّها أحد", "abnormal, not yet acknowledged by a clinician")}</div></div>`);
    if (brief.bloodPressure && brief.bloodPressure.abnormal) { const bp = brief.bloodPressure; urgent.push(
      `<div><div class="rowb"><span>${T("ضغط الدم", "Blood pressure")}</span>
        ${bpPair(bp.systolic, bp.diastolic, bp.unit)}</div>
        <div class="t3" style="margin-top:2px">${T("خارج المعتاد", "outside the usual range")}</div></div>`); }
    for (const t of brief.overdue || []) urgent.push(
      `<div>${T("متابعة متأخّرة", "Overdue follow-up")}${t.about ? " — " + esc(t.about) : ""}</div>`);

    if (urgent.length) {
      return `<div class="note note-e" style="margin-top:14px">${icon("alert")}<div class="stack-2" style="width:100%">
        ${urgent.slice(0, 3).join("")}
      </div></div>`;
    }

    /* Calm state: the single most current reading, if there is one — a blood
       pressure taken this week outranks a lab trend from last month, and
       either outranks nothing at all. */
    const bp = brief.bloodPressure;
    const trendLine = (brief.trends || [])[0];
    let line = "";
    if (bp) {
      line = `<span class="t3">${T("آخر ضغط دم", "Latest blood pressure")}</span>
        <span class="st st-v">${bpPair(bp.systolic, bp.diastolic, bp.unit)}</span>`;
    } else if (trendLine && trendLine.direction && trendLine.direction !== "flat") {
      line = `<span class="t3">${esc(trendLine.display || trendLine.code)}</span>
        <span class="st st-t">${esc(dirLabel(trendLine.direction))}</span>`;
    }
    if (!line) return "";
    return `<div class="note" style="margin-top:14px">${icon("check")}<div class="rowb" style="width:100%">${line}</div></div>`;
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
      case "share": return screenShareNew(d);
      case "add": return screenAdd(d, id);
      case "access": return screenAccess(d);
      case "carry": return screenCarry(d);
      case "inbox": return screenInbox(d);
      case "request": return screenAccessRequest(d, id);
      case "sync": return screenSync(d);
      case "signin": return screenSignin(d);
      case "vitals": return listVitals(d);
      case "profile": return screenProfile(d);
      default: return screen404();
    }
  };

  /* `slot` is the bottom-nav tab this screen belongs to, and it defaults to
     the record because that is what almost every screen built with this
     helper is. Sixteen of twenty-six routes shipped with no bottom nav at
     all: reachable, then a dead end — the only way onward was the back
     button, and on a cold deep link that left the app entirely.

     Passing `null` is the deliberate opt-out, and the clinician and facility
     consoles take it. The four tabs are a PATIENT's map of their own care;
     showing them to a lab technician signed into a facility console offers a
     door into someone else's product. */
  const page = (title, body, sub, slot = "record") => `${header({ back: true, title })}
    <section class="wrap" style="padding-top:14px">
      ${sub ? `<p class="t3" style="margin-bottom:14px;line-height:1.7">${sub}</p>` : ""}
      ${body}
    </section>
    ${slot ? `${nav(slot)}` : ""}`;

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
          ${selfReported(c) ? `<div style="margin-top:6px">${selfReported(c)}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك مشاكل نشطة", "No active conditions recorded"))}
      ${past.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("سابقة", "Past")}</h2></div>
        <div class="stack-2">${past.map((c) => `<div class="rw"><div class="rowb" style="width:100%">
          <span>${esc(c.display)}</span><span class="t3">${esc(c.clinicalStatus)}</span></div></div>`).join("")}</div></div>` : ""}
      ${addButton("condition", T("سجّل مشكلة صحية", "Add a condition"))}`,
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
          ${selfReported(m) ? `<div style="margin-top:6px">${selfReported(m)}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك أدوية حالية", "No current medications recorded"))}
      ${unconf.length ? `<div class="note note-w" style="margin-top:12px">${icon("clock")}<div>${T(
        "أدوية ما أكّدها أحد من مدة. اسأل طبيبك إذا بعدك عليها.",
        "Medicines nobody has reconfirmed for a while. Ask your doctor whether you are still on them.")}</div></div>` : ""}
      ${stopped.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("موقوفة", "Stopped")}</h2></div>
        <div class="stack-2">${stopped.map((m) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><span>${esc(m.display)}</span><span class="t3">${n(m.stopDate || "")}</span></div>
          <div class="t3" style="margin-top:4px">${T("السبب", "reason")}: ${esc(m.stopReason || "—")}</div>
        </div></div>`).join("")}</div></div>` : ""}
      ${addButton("medication", T("سجّل دواء تاخذه", "Add a medicine you take"))}`,
      T("لماذا تُوقَف مهم مثل ماذا يُوصَف — الطبيب الجاي يحتاج يعرف إذا الدواء فشل أو سبّب حساسية.",
        "Why a drug stopped matters as much as why it started — the next clinician needs to know whether it failed or harmed you."));
  }

  const freqLabel = (f) => {
    const x = R().FREQ[f];
    return x ? (ar() ? x.ar : x.en) : (f || "");
  };

  function listAllergies(d) {
    return page(T("الحساسية", "Allergies"),
      `${d.allergies && d.allergies.length
        ? `<div class="stack-2">${E().criticalAllergies(d.allergies).map((a) => `<div class="rw">
            <div style="width:100%"><div class="rowb"><b>${esc(a.substance)}</b>
              <span class="st ${a.criticality === E().CRITICALITY.HIGH ? "st-e" : "st-q"}">${
                a.criticality === E().CRITICALITY.HIGH ? T("خطرة", "high") : T("خفيفة", "low")}</span></div>
            ${a.reaction ? `<div class="t3" style="margin-top:4px">${esc(a.reaction)}</div>` : ""}
            ${selfReported(a) ? `<div style="margin-top:6px">${selfReported(a)}</div>` : ""}</div></div>`).join("")}</div>`
        : empty(T("ما مسجّل عندك أي حساسية", "No allergy recorded"))}
      ${addButton("allergy", T("سجّل حساسية", "Record an allergy"))}`,
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
        /* The reading leads. It used to sit in `.st` — a chip class at 11.5px
           — beside the metric's name in `.d3` at 19px/500, so the NAME
           outranked the VALUE on the one screen whose entire purpose is the
           value. And the same number was printed twice: once in that chip and
           again as the last row of the dated series below. */
        return `<div class="rw"><div style="width:100%">
          <div class="lab">${esc(t.display || (done.find((x) => x.code === code) || {}).display || code)}</div>
          <div class="rowb" style="margin-top:2px;align-items:flex-end">
            ${last ? bigValue(last.value, last.unit) : ""}
            <span>${last ? flagChip(last.flag) : ""}</span>
          </div>
          ${last ? rangeScale(last) : ""}
          ${last && rangeLine(last) ? `<div class="t3" style="margin-top:6px">${rangeLine(last)}</div>` : ""}
          ${trendSeries(t, { headlined: true })}
        </div></div>`;
      }).join("")}</div>` : (pending.length ? "" : empty(
        T("ما عندك تحاليل مسجّلة", "No lab results recorded"),
        /* A patient cannot type a lab result — a number without the
           laboratory that produced it is not a result, it is a rumour. What
           they CAN do is record that they hold the printed report, so the
           next clinician knows to ask for it. That is the honest action for
           this screen, so it is the one offered. */
        `<p class="t3" style="margin-top:12px;line-height:1.7">${T(
          "نتائجك تجي من المختبر. إذا عندك ورقة تحليل قديمة، سجّلها حتى طبيبك يعرف إنها موجودة ويطلبها منك.",
          "Results arrive from the laboratory. If you hold an old printed result, note that you have it so your clinician knows to ask.")}</p>
        ${addButton("document", T("سجّل ورقة تحليل عندك", "Note a printed result you hold"))}`))}`,
      T("الاتجاه أهم من الرقم المفرد — لكن نتائج مختبرين مختلفين ما تنرسم بخط واحد واثق.",
        "The trend matters more than any single number — but two laboratories do not draw one confident line."));
  }

  /* ---------- vital signs ----------
     The cheapest longitudinal signal a patient can carry. A home BP cuff and
     a bathroom scale are ordinary in Iraqi households, they are exactly what
     a hypertension or diabetes follow-up turns on, and until now there was
     nowhere to put the numbers where a doctor would ever see them.

     Blood pressure is shown as ONE reading. FHIR splits it into two
     Observations on the wire and `bloodPressure()` pairs them back, because a
     systolic on one row and a diastolic three rows below is not a blood
     pressure, it is two numbers. */
  function listVitals(d) {
    const all = d.vitals || [];
    const bp = E().bloodPressure(all);
    const others = E().latestVitals(all.filter((v) => v.kind !== E().VITAL.BP_SYS && v.kind !== E().VITAL.BP_DIA));
    const lastBp = bp[0];

    const vitalRow = (v) => `<div class="rw"><div style="width:100%">
        <div class="rowb"><b>${esc(E().vitalLabel(v.kind, ar()))}</b>
          <span class="st ${FLAG_CLASS[flagKey(v.flag)]}">${measure(v.value, v.unit)}</span></div>
        <div class="rowb" style="margin-top:5px">
          <span class="t3">${n(String(v.effectiveAt || "").slice(0, 10))}</span>
          <span>${flagChip(v.flag)}</span></div>
        ${rangeLine(v) ? `<div class="t3" style="margin-top:4px">${rangeLine(v)}</div>` : ""}
        ${selfReported(v) ? `<div style="margin-top:5px">${selfReported(v)}</div>` : ""}
      </div></div>`;

    return page(T("القياسات", "Measurements"),
      `${lastBp ? `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${T("ضغط الدم", "Blood pressure")}</b>
            <span class="st ${lastBp.abnormal ? "st-e" : "st-v"}">${bpPair(lastBp.systolic.value,
              lastBp.diastolic ? lastBp.diastolic.value : null, lastBp.systolic.unit)}</span></div>
          <div class="rowb" style="margin-top:5px">
            <span class="t3">${n(String(lastBp.at || "").slice(0, 10))}</span>
            <span>${lastBp.abnormal ? `<span class="st st-e">${T("خارج المعتاد", "outside the usual range")}</span>`
              : `<span class="st st-v">${T("ضمن المعتاد", "within the usual range")}</span>`}</span></div>
          <div class="t3" style="margin-top:4px">${T("المعتاد للبالغ تحت", "usual for an adult, under")} ${
            bpPair(130, 85, "")}</div>
          <!-- The provenance marker was on vitalRow and missing from this
               hand-written block, so of the three readings on this screen the
               ONE that was not marked "you recorded this yourself" was the
               abnormal blood pressure — the most consequential number here
               looked like the most authoritative. An omission, not a wrong
               call, which is why no source-level guard caught it; the journey
               suite now asserts it in the browser instead. -->
          ${selfReported(lastBp.systolic) ? `<div style="margin-top:5px">${selfReported(lastBp.systolic)}</div>` : ""}
          ${bp.length > 1 ? `<div class="t3" style="margin-top:8px">${T("قراءات سابقة", "Earlier readings")}</div>
            ${bp.slice(1, 4).map((x) => `<div class="rowb" style="margin-top:4px">
              <span class="t3">${n(String(x.at).slice(0, 10))}</span>
              <span class="t3">${bpPair(x.systolic.value, x.diastolic ? x.diastolic.value : null, "")}</span></div>`).join("")}` : ""}
        </div></div>` : ""}
      ${others.length ? `<div class="stack-2">${others.map(vitalRow).join("")}</div>` : ""}
      ${!lastBp && !others.length ? empty(T("ما سجّلت أي قياس بعد", "No measurements recorded yet")) : ""}
      ${addButton("vital", T("سجّل قياساً", "Record a measurement"))}
      <div class="note" style="margin-top:14px">${icon("info")}<div>${T(
        "الوزن والطول ما إلهم «طبيعي» — القياس يُسجَّل، والحكم عليه شغل طبيبك، مو شغل التطبيق.",
        "Weight and height have no 'normal' here. The measurement is recorded; judging it is your doctor's job, not the app's.")}</div></div>`,
      T("قياس البيت مفيد بس إذا انكتب. جهاز ضغط بالبيت ودفتر ما يقراه أحد ما يساوي ملف — هذا يوصل طبيبك.",
        "A home reading only helps if it is written down. A cuff at home and a notebook nobody reads is not a record — this reaches your doctor."));
  }

  function listDocuments(d) {
    const docs = d.documents || [];
    return page(T("التقارير والمستندات", "Documents"),
      `${docs.length ? `<div class="stack-2">${docs.map((x) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(x.title)}</b><span class="t3">${n(x.documentDate)}</span></div>
          <div class="t3" style="margin-top:4px">${esc(docTypeLabel(x.type))}
            ${R().pendingClaims(x).length ? ` · <span class="st st-q">${
              n(R().pendingClaims(x).length)} ${T("معلومة تنتظر تأكيد طبيب", "awaiting a clinician")}</span>` : ""}</div>
          ${x.heldByPatient ? `<div class="t3" style="margin-top:4px">${
            T("ورقة عندك", "paper you hold")}${x.note ? " · " + esc(x.note) : ""}</div>` : ""}
        </div></div>`).join("")}</div>`
        : empty(T("ما رفعت أي تقرير بعد", "No documents uploaded yet"))}
      ${addButton("document", T("سجّل تقريراً عندك", "Note a report you hold"))}
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

  /* ---------- timeline (§9) ----------

     This screen showed "the timeline fills as visits are recorded" on a
     record holding seven events, for as long as it has existed. Two bugs,
     stacked, neither of which could throw:

       `timelineByEpisode` returns `{ episodes, unassigned }`, an object. The
       caller did `Array.isArray(byEp) ? byEp : []`, so `groups` was ALWAYS
       the empty array and the empty state ALWAYS rendered. A defensive
       fallback around a wrong assumption is indistinguishable from an empty
       record.

       And under it, `eventRow` read `e.kind` and `e.label`, while
       `buildTimeline` emits `type` and `title`. Even with the first bug
       fixed, every row would have printed a blank label under a blank kind.

     The answer to "what happened to my health over time" is chronological
     first and episode-second: a person scanning their own record is looking
     for WHEN, and a year they can find is worth more than a care episode
     they have to reconstruct. Episodes still label the events that belong to
     one, in the row, where it costs nothing. */
  function screenTimeline(d) {
    const events = E().buildTimeline({ ...d, patientId: d.patient.id }) || [];
    const epTitle = {};
    for (const ep of d.episodes || []) epTitle[ep.id] = ep.title || ep.reason || null;

    /* Newest first. Grouped by year, then by month inside it, because a
       flat list of forty dated rows is a log and not a story. */
    const years = [];
    for (const e of events) {
      const y = String(e.at || "").slice(0, 4);
      const m = String(e.at || "").slice(0, 7);
      if (!y) continue;
      let Y = years.find((x) => x.y === y);
      if (!Y) years.push(Y = { y, months: [] });
      let M = Y.months.find((x) => x.m === m);
      if (!M) Y.months.push(M = { m, events: [] });
      M.events.push(e);
    }

    return page(T("الخط الزمني", "Timeline"),
      years.length ? years.map((Y) => `<div class="sec">
          <div class="sec-h"><h2 class="d3">${n(Y.y)}</h2>
            <span class="t3">${(() => {
              const c = Y.months.reduce((s, m) => s + m.events.length, 0);
              /* Arabic counts in four buckets. "2 حدث" is English grammar
                 wearing Arabic words. */
              return ar() ? countAr(c, ["حدث واحد", "حدثان", "أحداث", "حدثاً"]) : `${n(c)} event${c === 1 ? "" : "s"}`;
            })()}</span></div>
          ${Y.months.map((M) => `<div class="tl-month">
            <div class="lab" style="margin:14px 0 2px">${esc(monthLabel(M.m))}</div>
            <div class="tl">${M.events.map((e) => eventRow(e, epTitle)).join("")}</div>
          </div>`).join("")}
        </div>`).join("")
        : empty(T("الخط الزمني يمتلئ مع كل زيارة", "The timeline fills as visits are recorded"),
            addButton("condition", T("سجّل مشكلة صحية تعرفها", "Add a condition you know about"))),
      T("مو كل حدث — بس اللي يغيّر القرار: تشخيص جديد، دواء بدأ أو وقف، نتيجة غير طبيعية، عملية، إحالة.",
        "Not every event — only the ones that change a decision: a new diagnosis, a drug started or stopped, an abnormal result, surgery, a referral."));
  }

  const MONTHS_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
    "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  /* Iraqi month names, not the Egyptian/Gulf set: يناير/فبراير reads foreign
     in Baghdad the way "Januarius" would in London. */
  function monthLabel(ym) {
    const i = parseInt(String(ym).slice(5, 7), 10) - 1;
    return i >= 0 && i < 12 ? (ar() ? MONTHS_AR[i] : MONTHS_EN[i]) : String(ym);
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

  /* `type` and `title` — the field names buildTimeline actually emits. The
     previous version read `kind` and `label`, which exist nowhere, so every
     row would have rendered a blank event under a blank kind had the screen
     ever got as far as drawing one. */
  const DAY_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  function dayOf(at) {
    const d = new Date(at);
    return isNaN(d) ? "" : (ar() ? DAY_AR[d.getDay()] : d.toLocaleDateString("en", { weekday: "short" }));
  }

  const eventRow = (e, epTitle) => {
    const ep = epTitle && e.episodeId ? epTitle[e.episodeId] : null;
    const day = String(e.at || "").slice(8, 10);
    return `<div class="tl-e">
      <div class="tl-when"><b class="num">${esc(day)}</b><span class="t3">${esc(dayOf(e.at))}</span></div>
      <div class="tl-body">
        <div class="rowb"><span class="st ${e.flag && e.flag !== "normal" ? "st-e" : "st-q"}">${
          esc(evtLabel(e.type))}</span>
          ${e.significance >= 4 ? `<span class="st st-t">${T("حدث كبير", "major")}</span>` : ""}</div>
        <div style="margin-top:4px">${esc(e.title || T("بلا عنوان", "untitled"))}</div>
        ${e.detail ? `<div class="t3" style="margin-top:3px">${esc(e.detail)}</div>` : ""}
        ${ep ? `<div class="t3" style="margin-top:4px">${T("ضمن", "part of")} ${esc(ep)}</div>` : ""}
        ${e.flag && e.flag !== "normal" ? `<span class="st st-e" style="margin-top:5px">${
          e.flag === "unknown" ? T("بلا مدى مرجعي", "no reference range") : T("غير طبيعية", "abnormal")}</span>` : ""}
      </div>
    </div>`;
  };

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

      <!-- The screen was named for an action it did not offer. Its empty
           state said "you are not sharing with anyone" and stopped there, so
           a patient sitting in front of a doctor had no way to start — the
           only path into a share was a doctor asking first, which requires
           the doctor to already have the app. In Iraq that is the rare case,
           not the common one. -->
      <a class="btn" style="margin-top:18px" href="#/record/share">${
        T("شارك ملفك مع طبيب", "Share your record with a clinician")}</a>
      ${past.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("منتهية", "Ended")}</h2></div>
        <div class="stack-2">${past.slice(0, 8).map((s) => `<div class="rw"><div class="rowb" style="width:100%">
          <span class="t3">${esc(s.granteeName || s.granteeId)}</span>
          <span class="t3">${C().shareState(s, now()) === "revoked" ? T("ألغيتها", "you revoked it") : T("انتهت وحدها", "expired on its own")}</span>
        </div></div>`).join("")}</div></div>` : ""}`,
      T("كل مشاركة لها مدة وتنتهي وحدها. تقدر تلغيها بأي لحظة، وما تحتاج تعطي سبب.",
        "Every share has a duration and ends on its own. You can revoke it at any moment, and you owe nobody a reason."));
  }

  /* ---------- the patient starting a share (§13, from the other side) ----------

     Every consent path in the product used to begin with the clinician: they
     request, the patient answers. That models a country where the doctor
     already has the app, which is not this one. The common case here is a
     patient with a phone sitting in front of a doctor with a paper desk, and
     for that the patient has to be able to START.

     What it produces is the carry code that already existed — the same
     mechanism the printed summary uses, and the same one a clinic redeems.
     What is new is that the patient chooses the scope and the duration
     instead of taking DEFAULT_SCOPES and four hours. */
  function screenShareNew(d) {
    const S_ = C().SCOPE;
    /* Ordered by how often it is the answer, not alphabetically, and not by
       the order they happen to sit in the enum. */
    const OFFER = [S_.SUMMARY, S_.MEDICATIONS, S_.CONDITIONS, S_.LABS,
      S_.DOCUMENTS, S_.PROCEDURES, S_.IMMUNIZATIONS, S_.ENCOUNTERS, S_.IMAGING, S_.TIMELINE];
    const on = new Set(C().DEFAULT_SCOPES);
    return page(T("شارك ملفك", "Share your record"),
      `<div class="sec"><div class="sec-h"><h2 class="d3">${T("شنو يشوف", "What they see")}</h2></div>
        <div class="stack-2">
          <!-- The floor is shown as a row like the others and locked like
               none of them, with the reason in the row rather than in a
               footnote. A patient who cannot see why it is locked reads it
               as the app overriding them for its own convenience. -->
          <div class="rw"><div class="rowb" style="width:100%">
            <span>${esc(C().scopeLabel(S_.ALLERGIES, S.lang))}
              <span class="st st-t" style="margin-inline-start:8px">${T("دائماً", "always")}</span></span>
            <input type="checkbox" checked disabled>
          </div></div>
          <p class="t3" style="margin-top:-4px;line-height:1.7">${T(
            "الحساسية تنشارك دائماً مع أي طبيب تعطيه إذن. طبيب يشوف ملفك ولا يشوف حساسيتك أخطر من طبيب ما يشوف شي — لأنه راح يوصف وهو معتقد إنه تأكّد.",
            "Allergies are always shared with anyone you grant access. A clinician who can see your record but not your allergy is more dangerous than one who cannot see it at all — they will prescribe believing they checked.")}</p>
          ${OFFER.map((s) => `<label class="rw"><div class="rowb" style="width:100%">
            <span>${esc(C().scopeLabel(s, S.lang))}</span>
            <input type="checkbox" class="sh-scope" value="${esc(s)}"${on.has(s) ? " checked" : ""}>
          </div></label>`).join("")}
        </div>
      </div>

      <div class="sec"><div class="sec-h"><h2 class="d3">${T("لمدة", "For how long")}</h2></div>
        <div class="chips chips--wrap" style="margin-top:4px">
          ${["VISIT", "DAY", "WEEK", "MONTH", "QUARTER"].map((k, i) =>
            `<button class="chip${i === 0 ? " c-on" : ""}" data-dur="${k}"
              onclick="recordPickShareDuration('${k}')">${esc(ar() ? C().DURATION[k].ar : C().DURATION[k].en)}</button>`).join("")}
        </div>
        <p class="t3" style="margin-top:10px;line-height:1.7">${T(
          "ما في «للأبد». أطول مدة ٩٠ يوماً، وتقدر تلغيها قبلها بأي لحظة بلا ما تعطي سبب.",
          "There is no 'forever'. The longest is 90 days, and you can revoke it before that at any moment without giving a reason.")}</p>
      </div>

      <button class="btn" style="margin-top:18px" onclick="recordStartShare()">${
        T("أصدر رمزاً", "Issue a code")}</button>`,
      T("تختار شنو يشوف وكم مدة، ويطلعلك رمز تعطيه للعيادة. الرمز يُستعمل مرة وحدة وينتهي وحده.",
        "You choose what they see and for how long, and get a code to hand to the clinic. The code is single use and expires on its own."),
      "record");
  }

  /* The chosen duration lives on the DOM, not in a module variable, because a
     re-render between choosing and confirming would silently reset a module
     variable while the chip still looked selected — consent that says one
     thing on screen and stores another. */
  globalThis.recordPickShareDuration = function recordPickShareDuration(k) {
    document.querySelectorAll("[data-dur]").forEach((b) =>
      b.classList.toggle("c-on", b.getAttribute("data-dur") === k));
  };

  /* Six characters from an unambiguous alphabet — no 0/O, no 1/I/l. A code
     read aloud across a clinic desk in a noisy waiting room has to survive
     being misheard once. */
  function newCarryCode() {
    const A = "ACDEFGHJKMNPQRTUVWXY34679";
    let code = "";
    for (let i = 0; i < 6; i++) code += A[Math.floor(Math.random() * A.length)];
    return code;
  }

  globalThis.recordStartShare = function recordStartShare() {
    const d = store();
    const scopes = [...document.querySelectorAll(".sh-scope:checked")].map((x) => x.value);
    const picked = document.querySelector("[data-dur].c-on");
    const dur = picked ? picked.getAttribute("data-dur") : "VISIT";
    const r = C().issueCarryCode(d.patient.id, scopes, now(), newCarryCode(), dur);
    if (!r.ok) {
      toast(r.reason === "SCOPE_REQUIRED"
        ? T("اختر شي واحد على الأقل", "Choose at least one thing")
        : T("ما قدرنا نصدر رمز", "Could not issue a code"));
      return;
    }
    mutate((x) => { x.carry = r.carry; });
    location.hash = "#/record/carry";
  };

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
        : empty(T("ما فتح ملفك أحد بعد", "Nobody has opened your record yet"),
            `<p class="t3" style="margin-top:12px;line-height:1.7">${T(
              "راح يمتلئ أول ما تشارك ملفك مع طبيب — وكل فتحة تنكتب هنا باسمها.",
              "It fills the first time you share your record with a clinician — and every opening is written here by name.")}</p>
            <a class="btn btn--2" style="margin-top:16px" href="#/record/share">${
              T("شارك ملفك مع طبيب", "Share your record with a clinician")}</a>`),
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
          <div class="t3" style="margin-top:8px">${T("ينتهي الرمز", "the code expires")} ${esc(untilLabel(live.expiresAt))} ·
            ${T("يُستعمل مرة واحدة", "single use")}</div>
        </div></div>

        <!-- A code whose contents are not stated is a code nobody can consent
             to. This says exactly what handing it over gives away, in the same
             words the share screen used when the patient chose. -->
        <div class="sec"><div class="sec-h"><h2 class="d3">${T("اللي راح يشوفه", "What it opens")}</h2></div>
          <div class="row" style="flex-wrap:wrap;gap:6px">
            ${live.scopes.map((x) => `<span class="chip">${esc(C().scopeLabel(x, S.lang))}</span>`).join("")}
          </div>
          <p class="t3" style="margin-top:12px;line-height:1.7">${T(
            `العيادة تشوف هذا لمدة ${ar() ? C().DURATION[live.duration || "VISIT"].ar : ""} من لحظة ما تستعمل الرمز، وبعدها ينغلق وحده.`,
            `The clinic sees this for ${C().DURATION[live.duration || "VISIT"].en} from the moment the code is used, then it closes itself.`)}</p>
        </div>

        <a class="b-g" style="display:block;margin-top:14px" href="#/record/share">${
          T("أصدر رمزاً بمحتوى مختلف", "Issue a code covering something else")}</a>`
        : `<!-- Two doors on purpose. Someone at a clinic desk with the doctor
                 waiting wants one tap and the sensible default; someone
                 deciding at home wants to choose. Offering only the second
                 turns a thirty-second handover into a form. -->
          <button class="btn" onclick="recordIssueCarry()">${
            T("أصدر رمز الزيارة الآن", "Issue a visit code now")}</button>
          <p class="t3" style="margin-top:10px;line-height:1.7">${T(
            "يفتح اللقطة السريرية وأدويتك ومشاكلك وحساسيتك، لمدة زيارة وحدة.",
            "Opens your summary, medicines, conditions and allergies, for one visit.")}</p>
          <a class="b-g" style="display:block;margin-top:14px" href="#/record/share">${
            T("أو اختار شنو يشوف وكم مدة", "Or choose what they see and for how long")}</a>`}
      <div class="note" style="margin-top:16px">${icon("info")}<div>${T(
        "اطبع الملخّص أو احفظه بهاتفك، وخذه معك. العيادة تستعمل الرمز فتشوف اللي اخترته للمدة اللي اخترتها — بعدها ينغلق وحده.",
        "Print the summary or keep it on your phone and take it with you. The clinic redeems the code and sees what you chose for the duration you chose — then it closes itself.")}</div></div>`,
      T("في بلد ما بيه ربط بين المستشفيات، أنت أفضل ناقل لملفك. الورقة تشتغل حتى لو انقطعت الكهرباء والإنترنت.",
        "In a country with no exchange between institutions, you are the best carrier of your own record. Paper works when the power and the network do not."));
  }

  /* Kept because it is the one-tap path from anywhere that is not the share
     builder — it issues the default scopes for a single visit, which is what
     someone in a hurry at a clinic desk wants. Choosing is the builder's job. */
  globalThis.recordIssueCarry = function recordIssueCarry() {
    const d = store();
    const r = C().issueCarryCode(d.patient.id, C().DEFAULT_SCOPES, now(), newCarryCode(), "VISIT");
    if (!r.ok) { toast(T("ما قدرنا نصدر رمز", "Could not issue a code")); return; }
    mutate((x) => { x.carry = r.carry; });
    render();
  };

  /* =========================================================
     المريض يكتب في ملفه — WHAT THE PATIENT PUTS IN
     =========================================================
     The record had no patient-authored write path at all. Every screen was a
     count that opened onto a list, and a patient who knew perfectly well that
     penicillin gives them a rash could not say so. Measured as infinite taps
     to add anything, which is the correct number: there was no control.

     That is not a missing button, it is the premise failing. A longitudinal
     record the patient owns and cannot write to is a viewer, and a viewer of
     an empty record is nothing at all — in a country with no health
     information exchange, what the patient carries in their head IS the
     history, and refusing to take it down does not make the record safer, it
     makes it empty.

     Everything written here is stamped `source: PATIENT` and
     `verificationStatus: PATIENT_REPORTED` — the vocabulary emr.js already
     declared and nothing used. It enters the lists, it reaches the clinician's
     brief, and everywhere it appears it says who said so. It is never
     promoted to confirmed by anything the patient does; only a verified
     clinician moves it, which is the same rule the document-extraction path
     already follows. The machine does not diagnose, and neither does the
     person filling in a form about themselves. */

  const ADD_KINDS = {
    allergy: {
      title: ["حساسية", "Allergy"],
      lead: ["أهم شي بالملف كله. اكتب اسم الدوا أو الشي اللي يجيك منه، وشنو يصير لك.",
        "The most important thing in the record. Name the drug or substance, and what it does to you."],
      fields: [
        { id: "substance", label: ["الدوا أو المادة", "Drug or substance"], required: true },
        { id: "reaction", label: ["شنو يصير", "What happens"] },
      ],
      extra: () => `<div class="fld"><span>${T("شكد قوية", "How severe")}</span>
        <div class="chips chips--wrap" style="margin-top:8px">
          <button class="chip c-on" data-crit="high" onclick="recordPickChip('crit','high')">${
            T("خطرة — ضيق نفس أو تورّم", "Severe — breathing or swelling")}</button>
          <button class="chip" data-crit="low" onclick="recordPickChip('crit','low')">${
            T("خفيفة — طفح أو حكة", "Mild — rash or itching")}</button>
        </div></div>`,
    },
    medication: {
      title: ["دواء", "Medication"],
      lead: ["الدوا اللي تاخذه الآن. حتى لو ما وصفه دكتور — العشبي والمكمّلات تتعارض وية الأدوية.",
        "What you are taking now. Including anything a doctor did not prescribe — herbal remedies and supplements interact."],
      fields: [
        { id: "display", label: ["اسم الدوا", "Medicine name"], required: true },
        { id: "dose", label: ["الجرعة", "Dose"], placeholder: ["مثلاً ٥٠٠ ملغم", "e.g. 500 mg"] },
        { id: "indication", label: ["ليش تاخذه", "What for"] },
      ],
      extra: () => `<div class="fld"><span>${T("كم مرة", "How often")}</span>
        <div class="chips chips--wrap" style="margin-top:8px">
          ${Object.keys(R().FREQ).map((k, i) => `<button class="chip${i === 0 ? " c-on" : ""}"
            data-freq="${k}" onclick="recordPickChip('freq','${k}')">${
              esc(ar() ? R().FREQ[k].ar : R().FREQ[k].en)}</button>`).join("")}
        </div></div>`,
    },
    condition: {
      title: ["مشكلة صحية", "Condition"],
      lead: ["التشخيصات اللي تعرفها عن نفسك — سكري، ضغط، ربو، أي شي قالك عنه دكتور.",
        "Diagnoses you know about yourself — diabetes, blood pressure, asthma, anything a doctor has told you."],
      fields: [
        { id: "display", label: ["الاسم", "Name"], required: true },
        { id: "onsetDate", label: ["من متى", "Since when"], type: "date" },
      ],
      extra: () => `<div class="fld"><span>${T("مزمنة؟", "Chronic?")}</span>
        <div class="chips chips--wrap" style="margin-top:8px">
          <button class="chip c-on" data-chronic="yes" onclick="recordPickChip('chronic','yes')">${
            T("مستمرة وياي", "ongoing")}</button>
          <button class="chip" data-chronic="no" onclick="recordPickChip('chronic','no')">${
            T("انتهت أو مؤقتة", "past or temporary")}</button>
        </div></div>`,
    },
    /* A document here is a REFERENCE to paper the patient holds — a title, a
       kind and a date — not an upload. Photographs of prescriptions and
       reports never enter our storage; that is a standing rule of this
       product, and a "records" feature that quietly starts collecting images
       of people's diagnoses would break it. Knowing the discharge summary
       from July 2024 exists, and that the patient has it in a drawer, is
       most of the value and none of the risk. */
    document: {
      title: ["تقرير عندي", "A report I have"],
      lead: ["سجّل شنو عندك من أوراق ووين. ما نرفع صور — بس نعرف إنها موجودة حتى تذكّرك تاخذها وياك.",
        "Note what paperwork you hold and where. We store no images — only that it exists, so you remember to bring it."],
      fields: [
        { id: "title", label: ["شنو هو", "What is it"], required: true,
          placeholder: ["مثلاً: تقرير خروج من مستشفى الكندي", "e.g. discharge summary, Al-Kindi hospital"] },
        { id: "documentDate", label: ["تاريخه", "Its date"], type: "date" },
        { id: "note", label: ["وين محفوظ", "Where it is"], placeholder: ["مثلاً: بالبيت مع الأوراق", "e.g. at home with the papers"] },
      ],
      extra: () => `<div class="fld"><span>${T("نوعه", "Kind")}</span>
        <div class="chips chips--wrap" style="margin-top:8px">
          ${["lab-report", "imaging-report", "discharge-summary", "operative-note", "clinical-report", "other"]
            .map((k, i) => `<button class="chip${i === 0 ? " c-on" : ""}" data-doct="${k}"
              onclick="recordPickChip('doct','${k}')">${esc(docTypeLabel(k))}</button>`).join("")}
        </div></div>`,
    },
    /* A measurement is the one kind where the FIELDS depend on the choice.
       Blood pressure needs two numbers on one reading; weight needs one.
       So the chip group is rendered first and the numeric fields swap under
       it — `recordPickVital` re-renders just that block rather than the
       screen, so a half-typed date survives changing your mind. */
    vital: {
      title: ["قياس", "Measurement"],
      lead: ["ضغط، وزن، نبض، سكر صائم — القياسات اللي تاخذها بالبيت. اكتبها هنا وتوصل طبيبك مع بقية ملفك.",
        "Blood pressure, weight, pulse, fasting sugar — the readings you take at home. Written here they reach your doctor with the rest of your record."],
      fields: [{ id: "effectiveAt", label: ["متى", "When"], type: "date", required: true }],
      extra: () => `<div class="fld"><span>${T("شنو قِسْت", "What did you measure")}</span>
        <div class="chips chips--wrap" style="margin-top:8px">
          ${["bp", ...Object.values(E().VITAL).filter((k) => !/^bp-/.test(k))].map((k, i) =>
            `<button class="chip${i === 0 ? " c-on" : ""}" data-vk="${k}"
              onclick="recordPickVital('${k}')">${esc(k === "bp" ? T("ضغط الدم", "Blood pressure")
                : E().vitalLabel(k, ar()))}</button>`).join("")}
        </div></div>
        <div id="vfields">${vitalFields("bp")}</div>`,
    },
  };

  /* The numeric part of the measurement form, for one chosen kind. */
  function vitalFields(kind) {
    if (kind === "bp") {
      const s = E().vitalMeta(E().VITAL.BP_SYS), d = E().vitalMeta(E().VITAL.BP_DIA);
      return `<label class="fld"><span>${T("الرقم الأعلى (الانقباضي)", "Upper number (systolic)")} <span class="t3">${esc(s.unit)}</span></span>
          <input id="ad-sys" type="number" inputmode="numeric" placeholder="120"></label>
        <label class="fld"><span>${T("الرقم الأسفل (الانبساطي)", "Lower number (diastolic)")} <span class="t3">${esc(d.unit)}</span></span>
          <input id="ad-dia" type="number" inputmode="numeric" placeholder="80"></label>
        <p class="t3" style="margin-top:6px;line-height:1.7">${T(
          "اقعد مرتاح خمس دقائق قبل القياس، والذراع بمستوى القلب. قراءة وحدة عالية ما تعني ضغط — الطبيب يقرر بعد عدة قراءات.",
          "Sit for five minutes first, arm at heart height. One high reading is not hypertension — a clinician decides across several.")}</p>`;
    }
    const m = E().vitalMeta(kind);
    if (!m) return "";
    return `<label class="fld"><span>${esc(E().vitalLabel(kind, ar()))} <span class="t3">${esc(m.unit)}</span></span>
      <input id="ad-val" type="number" inputmode="decimal" step="any"></label>
      ${m.refLow == null && m.refHigh == null ? `<p class="t3" style="margin-top:6px;line-height:1.7">${T(
        "هذا القياس ما إله «طبيعي» — ينحفظ كرقم، والحكم عليه شغل طبيبك.",
        "This measurement has no 'normal' — it is stored as a number, and judging it is your doctor's job.")}</p>` : ""}`;
  }

  globalThis.recordPickVital = function recordPickVital(kind) {
    recordPickChip("vk", kind);
    const host = document.getElementById("vfields");
    if (host) host.innerHTML = vitalFields(kind);
  };

  function screenAdd(d, kind) {
    const k = ADD_KINDS[kind];
    if (!k) return screen404();
    return page(T("أضف " + k.title[0], "Add " + k.title[1].toLowerCase()),
      `${k.fields.map((f) => `<label class="fld">
        <!-- Separated by a dash, not a space: «شنو يصير اختياري» reads as one
             phrase — "what happens optional" — instead of a label and a note
             about it. -->
        <span>${T(f.label[0], f.label[1])}${f.required ? ""
          : ` <span class="t3">— ${T("اختياري", "optional")}</span>`}</span>
        <input id="ad-${esc(f.id)}" type="${f.type || "text"}"${
          f.placeholder ? ` placeholder="${esc(T(f.placeholder[0], f.placeholder[1]))}"` : ""}></label>`).join("")}
      ${k.extra()}
      <button class="btn" style="margin-top:18px" onclick="recordAddSave('${esc(kind)}')">${T("احفظ", "Save")}</button>
      <div class="note" style="margin-top:16px">${icon("info")}<div>${T(
        "هذا اللي تكتبه ينحفظ باسمك: «سجّلها المريض». يوصل الطبيب مثل ما هو، ويبقى مكتوب إنك أنت قلته حتى يأكّده دكتور.",
        "What you write is saved as yours: 'recorded by the patient'. A clinician sees it exactly as it is, and it stays marked as your account of it until a clinician confirms it.")}</div></div>`,
      T(k.lead[0], k.lead[1]), "record");
  }

  /* One chip group per attribute, selected on the DOM for the same reason the
     share duration is — a re-render must not leave the screen saying one
     thing and the store holding another. */
  globalThis.recordPickChip = function recordPickChip(group, value) {
    document.querySelectorAll(`[data-${group}]`).forEach((b) =>
      b.classList.toggle("c-on", b.getAttribute("data-" + group) === value));
  };
  const chipValue = (group, fallback) => {
    const el = document.querySelector(`[data-${group}].c-on`);
    return el ? el.getAttribute("data-" + group) : fallback;
  };

  globalThis.recordAddSave = function recordAddSave(kind) {
    const k = ADD_KINDS[kind];
    if (!k) return;
    const g = (id) => ((document.getElementById("ad-" + id) || {}).value || "").trim();
    for (const f of k.fields) {
      if (f.required && !g(f.id)) { toast(T("اكتب " + f.label[0], "Enter the " + f.label[1].toLowerCase())); return; }
    }
    /* A measurement form with a date and no numbers would otherwise save a
       row containing nothing but a timestamp. */
    if (kind === "vital" && !vitalsFromForm(g, { recordedAt: null }).length) {
      toast(T("اكتب الرقم", "Enter the reading")); return;
    }
    /* The stamp. Written once, here, so no call site can add a row to the
       record without saying where it came from. */
    const stamp = {
      id: uid(kind.slice(0, 1).toUpperCase()),
      recordedBy: (store().patient || {}).id || null,
      recordedAt: new Date(now()).toISOString(),
      source: E().SOURCE.PATIENT,
      verificationStatus: E().VERIFY.PATIENT_REPORTED,
    };
    mutate((x) => {
      if (kind === "allergy") {
        x.allergies.push({ ...stamp, substance: g("substance"), reaction: g("reaction") || null,
          criticality: chipValue("crit", "high") === "high" ? E().CRITICALITY.HIGH : E().CRITICALITY.LOW });
      } else if (kind === "medication") {
        x.medications.push({ ...stamp, display: g("display"), dose: g("dose") || null,
          frequency: chipValue("freq", "OD"), indication: g("indication") || null,
          status: "active", startDate: null, lastConfirmed: null });
      } else if (kind === "condition") {
        x.conditions.push({ ...stamp, display: g("display"), clinicalStatus: E().COND_STATE.ACTIVE,
          chronic: chipValue("chronic", "yes") === "yes", onsetDate: g("onsetDate") || null, lastReviewed: null });
      } else if (kind === "document") {
        x.documents.push({ ...stamp, title: g("title"), type: chipValue("doct", "other"),
          documentDate: g("documentDate") || null, note: g("note") || null,
          heldByPatient: true, claims: [] });
      } else if (kind === "vital") {
        x.vitals = x.vitals || [];
        for (const v of vitalsFromForm(g, stamp)) x.vitals.push(v);
      }
    });
    toast(T("انحفظت", "Saved"));
    location.hash = "#/record/" + { allergy: "allergies", medication: "medications",
      condition: "conditions", document: "documents", vital: "vitals" }[kind];
  };

  /* Every measurement goes through `EMR.recordVital`, which is what stamps the
     unit, the LOINC code and the flag — and what refuses a weight the range
     table cannot judge rather than calling it normal. A screen that builds
     the row itself would be inventing a second answer to "is this reading
     abnormal", and two answers to that question is how they disagree. */
  function vitalsFromForm(g, stamp) {
    const at = g("effectiveAt");
    const kind = chipValue("vk", "bp");
    const out = [];
    const push = (k, raw) => {
      const val = parseFloat(raw);
      if (!isFinite(val)) return;
      const r = E().recordVital({ ...stamp, id: uid("V"), kind: k, value: val, effectiveAt: at }, stamp.recordedAt);
      if (r.ok) out.push(r.vital);
    };
    if (kind === "bp") { push(E().VITAL.BP_SYS, g("sys")); push(E().VITAL.BP_DIA, g("dia")); }
    else push(kind, g("val"));
    return out;
  }

  /* The mark that travels with everything above.

     It has to answer for TWO shapes. A row read straight out of storage
     carries `source` and `verificationStatus`; a row that came through
     `preVisitBrief` carries neither, because the brief is a projection that
     renames its fields on purpose so no screen is wired to the record's
     schema. Checking only the storage names is how the first version of this
     silently dropped the mark from the doctor's brief — the one screen where
     "who said this" changes what happens next. Verified in the browser, not
     assumed: the aspirin the patient had just typed in appeared on the
     clinician's medication list looking exactly like the prescribed one. */
  const isSelfSaid = (e) => !!e && (e.selfReported === true
    || e.source === E().SOURCE.PATIENT
    || e.verificationStatus === E().VERIFY.PATIENT_REPORTED);

  /* Colour is not the carrier — the words are. Two different sets of them,
     deliberately: the patient needs to recognise their own entry, and the
     clinician needs to know nobody has verified it. */
  const selfReported = (e) => isSelfSaid(e)
    ? `<span class="st st-q">${T("سجّلتها بنفسك", "your own entry")}</span>` : "";
  const patientToldUs = (e) => isSelfSaid(e)
    ? `<span class="st st-t">${T("قالها المريض — غير مؤكّدة", "patient-reported, unverified")}</span>` : "";

  const addLink = (kind, label) => `<a class="b-g" href="#/record/add/${kind}">${esc(label)}</a>`;
  const addButton = (kind, label) => `<a class="btn btn--2" style="margin-top:16px" href="#/record/add/${kind}">${esc(label)}</a>`;

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
  /* This screen is what the record home's «تعديل» (Edit) link points to, and
     until now it showed four read-only rows and nothing a person could
     actually change — a button promising editing that edited nothing.

     Identity (name, birth date, sex) stays read-only here: it is set once at
     registration under `canRegister`'s rules, and re-opening it to editing
     is a bigger decision about identity matching than this screen should
     make alone. What genuinely belongs here, and was simply never built, is
     the two fields `CONSENT.emergencyCard` has been reading since it was
     written and finding empty every time: blood group and an emergency
     contact. Nothing in the product could ever set them. */
  function screenProfile(d) {
    const p = d.patient;
    const bg = d.bloodGroup || null;
    const ec = p.emergencyContact || null;
    return page(T("بياناتي", "My details"),
      `<div class="stack-2">
        ${row(T("الاسم", "Name"), E().fullName(p))}
        ${row(T("تاريخ الميلاد", "Date of birth"), p.birthDate || "—")}
        ${row(T("الجنس", "Sex"), R().sexLabel(p.sex, ar()))}
        ${row(T("معرّف قريب", "Qareeb ID"), p.id)}
      </div>
      <div class="note" style="margin-top:16px">${icon("seal")}<div>${T(
        "معرّف قريب هو المفتاح — مو رقم البطاقة الوطنية. الوثائق الرسمية تنربط بالملف وما تكون أساسه، لأن الرقم ممكن يتغيّر والملف ما ينشطر.",
        "The Qareeb ID is the key — not the national card number. Official documents attach to the record rather than being its foundation, so a changed number never splits a patient in two.")}</div></div>

      <div class="sec" style="margin-top:8px">
        <div class="sec-h"><h2 class="d3">${T("لحالات الطوارئ", "For an emergency")}</h2></div>
        <p class="t3" style="line-height:1.7">${T(
          "هذا اللي يظهر فوراً لمن يفتح زر الطوارئ بهاتفك — أنت، أو من يساعدك.",
          "This is what shows immediately to whoever opens the emergency button on your phone — you, or whoever is helping you.")}</p>

        <div class="fld" style="margin-top:12px"><span>${T("فصيلة الدم", "Blood group")}</span>
          <div class="chips chips--wrap" style="margin-top:8px">
            ${E().BLOOD_GROUP.map((k) => `<button class="chip${bg === k ? " c-on" : ""}" data-bg="${k}"
              onclick="recordPickChip('bg','${k}')">${esc(E().bloodGroupLabel(k, ar()))}</button>`).join("")}
          </div>
        </div>

        <label class="fld" style="margin-top:14px"><span>${T("اسم جهة الاتصال عند الطوارئ", "Emergency contact name")}
          <span class="t3">— ${T("اختياري", "optional")}</span></span>
          <input id="ec-name" type="text" value="${esc((ec && ec.name) || "")}"></label>
        <label class="fld"><span>${T("رقمها", "Their number")}
          <span class="t3">— ${T("اختياري", "optional")}</span></span>
          <input id="ec-phone" type="tel" value="${esc((ec && ec.phone) || "")}"
            placeholder="07xxxxxxxxx"></label>

        <button class="btn" style="margin-top:16px" onclick="recordSaveEmergencyInfo()">${T("احفظ", "Save")}</button>
      </div>`);
  }

  globalThis.recordSaveEmergencyInfo = function recordSaveEmergencyInfo() {
    const picked = document.querySelector("[data-bg].c-on");
    const bg = picked ? picked.getAttribute("data-bg") : null;
    if (bg && !E().isValidBloodGroup(bg)) { toast(T("فصيلة غير صالحة", "Invalid blood group")); return; }
    const name = ((document.getElementById("ec-name") || {}).value || "").trim();
    const phone = ((document.getElementById("ec-phone") || {}).value || "").trim();
    mutate((x) => {
      if (bg) x.bloodGroup = bg;
      x.patient.emergencyContact = (name || phone) ? { name: name || null, phone: phone || null } : null;
    });
    toast(T("انحفظ", "Saved"));
    location.hash = "#/record";
  };

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
      empty(T("ما في ملف على هذا الجهاز", "No record on this device")), undefined, null);

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
            esc(a.substance) + (a.reaction ? ` <span class="t3">(${esc(a.reaction)})</span>` : "")
            + (patientToldUs(a) ? " " + patientToldUs(a) : "")).join(" · ")}</div></div>`
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
            <span>${esc(x.name)}</span><span>${measure(x.value, x.unit)} · ${n(String(x.at).slice(0, 10))}</span>
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
          <div class="rowb"><b>${esc(m.name)}</b>${patientToldUs(m)
            || (m.status === "unconfirmed" ? `<span class="st st-q">${T("غير مؤكّد", "unconfirmed")}</span>` : "")}</div>
          <div class="t3" style="margin-top:4px">${[m.dose, freqLabel(m.frequency), m.indication].filter(Boolean).map(esc).join(" · ")}</div>
        </div></div>`).join("") : emptyRow(T("ما مسجّل", "none recorded"))) : lockedSection(T("الأدوية", "Medications"))}

      ${has(C().SCOPE.CONDITIONS) ? section(T("المشاكل النشطة", "Active problems"),
        brief.active.length ? brief.active.map((c) => `<div class="rw"><div class="rowb" style="width:100%">
          <span>${esc(c.name)}${c.chronic ? ` <span class="st st-q">${T("مزمن", "chronic")}</span>` : ""}</span>
          ${patientToldUs(c)
            || (c.stale ? `<span class="st st-e">${T("ما رُوجعت", "not reviewed")}</span>` : "")}
        </div></div>`).join("") : emptyRow(T("ما مسجّل", "none recorded"))) : lockedSection(T("المشاكل", "Conditions"))}

      <!-- Vitals go ABOVE the trends: a blood pressure taken last week is
           more likely to change what happens in this consultation than a lab
           series from last year, and the clinician is reading top-down. -->
      ${brief.bloodPressure || brief.vitals.length ? section(T("القياسات الأخيرة", "Latest measurements"),
        `${brief.bloodPressure ? `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${T("ضغط الدم", "Blood pressure")}</b>
            <span class="st ${brief.bloodPressure.abnormal ? "st-e" : "st-v"}">${bpPair(
              brief.bloodPressure.systolic, brief.bloodPressure.diastolic,
              brief.bloodPressure.unit)}</span></div>
          <div class="rowb" style="margin-top:4px">
            <span class="t3">${n(String(brief.bloodPressure.at || "").slice(0, 10))}</span>
            <span>${patientToldUs(brief.bloodPressure)}</span></div>
        </div></div>` : ""}
        ${brief.vitals.map((v) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(v.name)}</b>
            <span class="st ${FLAG_CLASS[flagKey(v.flag)]}">${measure(v.value, v.unit)}</span></div>
          <div class="rowb" style="margin-top:4px">
            <span class="t3">${n(String(v.at || "").slice(0, 10))}</span>
            <span>${patientToldUs(v) || flagChip(v.flag)}</span></div>
        </div></div>`).join("")}`) : ""}

      ${brief.trends.length ? section(T("اتجاهات تحرّكت", "Trends that moved"),
        brief.trends.map((t) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(t.display || t.code)}</b></div>
          ${trendSeries(t)}
        </div></div>`).join("")) : ""}

      ${brief.procedures.length ? section(T("عمليات سابقة", "Previous surgery"),
        brief.procedures.map((x) => `<div class="rw"><div class="rowb" style="width:100%">
          <span>${esc(x.name)}</span>
          <span class="t3">${n(String(x.at || "").slice(0, 10))} ${patientToldUs(x)}</span>
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

  /* ---------- lab series ----------

     Time is not an arrow.

     U+2190 is Bidi_Class=ON and Bidi_Mirrored=No — the algorithm reorders it
     but never flips it. Placed between two `.num` spans, which are
     `unicode-bidi: embed`, the whole group resolves as one left-to-right run
     inside an Arabic line, so the source "7.1 ← 8.4" renders on screen as
     "8.4 → 7.1". Measured in the browser at both call sites: a diabetic whose
     HbA1c had gone from 7.1 to 8.4 was told she had improved from 8.4 to 7.1,
     and her doctor's shared brief said the same. The series inverted, silently,
     in the one direction that matters.

     So there is no arrow here. Every point carries its own date on its own
     line, oldest at the top so that reading downward moves forward in time,
     and the movement is carried by a word. Nothing in the meaning depends on
     how bidi resolves. */

  /* Past tense: a series of results is a movement that already happened. */
  const DIR_LABELS = { rising: ["ارتفع", "rose"], falling: ["انخفض", "fell"], flat: ["ما تغيّر", "unchanged"] };
  const dirLabel = (dd) => (DIR_LABELS[dd] || [dd, dd])[ar() ? 0 : 1];

  /* "unknown" is not "abnormal" and must never be dressed in the abnormal
     colour: a number that arrived with no reference range has not failed a
     test, it was never given one to fail. It says so in words. */
  const FLAG_LABELS = { low: ["منخفض", "low"], high: ["مرتفع", "high"],
    normal: ["ضمن الطبيعي", "in range"], unknown: ["بلا مدى مرجعي", "no reference range"] };
  const FLAG_CLASS = { low: "st-e", high: "st-e", normal: "st-v", unknown: "st-q" };
  const flagKey = (f) => (FLAG_LABELS[f] ? f : "unknown");
  const flagChip = (f) => `<span class="st ${FLAG_CLASS[flagKey(f)]}">${esc(FLAG_LABELS[flagKey(f)][ar() ? 0 : 1])}</span>`;

  /* Stated in words for the same reason the arrow is gone: "4–5.6" puts a
     neutral character between two numbers, which is the identical bidi trap
     in miniature. "من 4 إلى 5.6" has no neutral left to resolve. */
  function rangeLine(p) {
    if (!p) return "";
    if (p.refLow != null && p.refHigh != null)
      return ar() ? `الطبيعي من ${n(p.refLow)} إلى ${n(p.refHigh)}` : `normal ${n(p.refLow)} to ${n(p.refHigh)}`;
    if (p.refHigh != null) return ar() ? `الطبيعي تحت ${n(p.refHigh)}` : `normal below ${n(p.refHigh)}`;
    if (p.refLow != null) return ar() ? `الطبيعي فوق ${n(p.refLow)}` : `normal above ${n(p.refLow)}`;
    return "";
  }

  /* The reading drawn against its own reference range. Returns "" when the
     domain says there is no range to draw — a weight, a height, a one-sided
     "under 130" — because a scale is a claim about what normal looks like and
     those measurements have none here.

     `aria-hidden`: the value, the word ("مرتفع") and the range in prose all
     sit beside this in the markup already. A screen reader announcing the
     geometry too would say the same fact three times. */
  function rangeScale(r) {
    const g = E().rangePosition(r);
    if (!g) return "";
    const cls = g.clamped ? "at far" : g.out ? "at out" : "at";
    return `<div class="rng" aria-hidden="true" style="--lo:${g.lo}%;--hi:${g.hi}%;--at:${g.at}%">
      <i class="bnd"></i><i class="${cls}"></i></div>`;
  }

  /* The reading itself, at the weight the reason-for-the-screen deserves. */
  const bigValue = (v, unit) => `<span class="nval">${esc(String(v))}${
    unit ? `<span class="u">${esc(unit)}</span>` : ""}</span>`;

  /* One quantity is one cell. "8.4" sat mid-row with "%" stranded at the far
     edge of the same row, so the quantity read as two unrelated fields; and
     the French space before "%" put the sign flush against the following
     Arabic word. The unit joins the number inside a single run that cannot
     wrap and cannot be reordered. */
  const UNIT_TIGHT = /^(%|°C|°F|°)$/;
  function measure(v, unit) {
    const u = String(unit || "").trim();
    return `<span class="num nw">${esc(String(v))}${
      u ? (UNIT_TIGHT.test(u) ? "" : " ") + esc(u) : ""}</span>`;
  }

  /* A blood pressure is ONE reading, so it must be ONE bidi run.
     `${n(148)} / ${n(92)}` leaves " / " as a NEUTRAL between two LTR embeds.
     Inside an Arabic line bidi resolves that neutral right-to-left and the
     pair renders "92 / 148" — while the identical pair wrapped in an outer
     `.num` renders "148 / 92". Both spellings shipped, on different screens,
     for the same reading: on one the reference line read "130 / 85" directly
     under a value reading "92 / 148". Systolic and diastolic became
     indistinguishable.

     This is the trend arrow again in a new costume. The rule it taught holds
     without exception: never place a neutral character between two rendered
     numbers. Every blood pressure in the product goes through here. */
  function bpPair(sys, dia, unit) {
    const u = String(unit || "").trim();
    return `<span class="num nw">${esc(String(sys))}/${
      dia == null ? "—" : esc(String(dia))}${u ? " " + esc(u) : ""}</span>`;
  }

  /* The dated body of a series, shared by the patient's labs screen and the
     clinician's brief so the two can never drift apart on the one thing they
     must agree about.

     `headlined`: the labs screen now shows the newest reading above this at
     display weight, with its own range scale and its reference range in prose.
     That range line was then printed a SECOND time at the foot of the series,
     so the option suppresses the repeat.

     What it deliberately does NOT do is drop the newest point from the series.
     The first attempt did, and it broke the one property this renderer exists
     to guarantee: every point carries its own date, and reading downward moves
     forward in time. Skipping the last point left the newest reading with no
     visible date at all, and left the vertical order running newest → oldest →
     second-newest. The headline is a summary; the series is the record, and
     the record stays complete. Repeating the value at 11.5px under its date,
     beneath the same value at 26px, is an audit trail, not noise. */
  function trendSeries(t, opts) {
    if (!t || !t.points || !t.points.length) return "";
    const o = opts || {};
    const last = t.points[t.points.length - 1];
    const rows = t.points.map((p) => `<div class="rowb" style="margin-top:6px">
        <span class="t3">${n(String(p.at || "").slice(0, 10))}</span>
        <span>${measure(p.value, p.unit)} ${flagChip(p.flag)}</span>
      </div>`).join("");
    /* Direction is arithmetic on raw numbers. Across two units that arithmetic
       is meaningless, so the word is withheld rather than printed wrong — the
       warning underneath says why. */
    const dir = t.points.length > 1 && !t.mixedUnits ? esc(dirLabel(t.direction)) : "";
    const rng = o.headlined ? "" : rangeLine(last);
    const cap = o.headlined && t.points.length > 1
      ? `<div class="t3" style="margin-top:12px">${T("كل القراءات", "Every reading")}</div>` : "";
    return `${cap}${rows}
      ${dir || rng ? `<div class="rowb" style="margin-top:8px">
        <span class="st">${dir}</span><span class="t3">${rng}</span></div>` : ""}
      ${t.mixedUnits ? `<div class="st st-e" style="margin-top:6px">${T(
        "وحدات قياس مختلفة — هذي الأرقام ما تنقارن",
        "different units of measure — these numbers do not compare")}</div>` : ""}
      ${t.mixedLabs ? `<div class="st st-t" style="margin-top:6px">${T(
        "نتائج من مختبرات مختلفة — المقارنة بينها ما تنفع دائماً",
        "results from different laboratories — comparing them is not always valid")}</div>` : ""}`;
  }

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
      <button class="btn" style="margin-top:16px" onclick="clinicianSave()">${T("احفظ", "Save")}</button>`,
      undefined, null);
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
        "The machine reads, you decide. Nothing enters the record without your decision."), null);
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
