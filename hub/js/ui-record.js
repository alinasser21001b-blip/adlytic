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
  /* The record index is the DECK — see «THE DECK» below. The former index, a
     twelve-row table of contents with the care threads bolted above it, is
     replaced rather than restyled: its rows were named after storage tables and
     sat at one weight, which is the defect the whole redesign exists to fix.
     Every row it linked to is still a route and still reachable. */
  globalThis.screenRecord = function screenRecord() { return screenDeck(); };

  globalThis.screenRecordLegacy = function screenRecordLegacy() {
    const d = store();
    if (!d.patient) return screenRecordSetup();
    const p = d.patient;
    const prof = R().patientProfile(p, d, now());
    const brief = R().preVisitBrief(p, d, now());
    const alerts = C().accessAlerts(d.accessLog, now());
    const live = C().activeShares(d.shares, now());
    const pendingReq = (d.requests || []).filter((r) => C().requestState(r, now()) === C().REQ_STATE.PENDING);
    const f = recordFacts(d, live);
    const { threads } = E().careThreads({ ...d, patientId: p.id }, { now: now() });

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

      <!-- THE SPINE. Care threads, not storage tables. This section replaced
           two groups of sibling rows that between them named eleven database
           tables — "Conditions 2", "Medications 3", "Labs 4" — none of which is
           an object a patient or a clinician holds in their head. They hold "my
           diabetes, and what has happened to it".
           The threads are grouped by keys that already existed on every event;
           nothing here is inferred. A problem with no linked events produces no
           thread rather than an empty one. -->
      ${threads.length ? `<div class="sec">
        <div class="sec-h"><h2 class="d3">${T("مشاكلي ومسارها", "My problems, and where they stand")}</h2>
          <a class="b-g" href="#/record/timeline">${T("كل شي", "Everything")}</a></div>
        <div class="threads">${threads.map((t) => threadCard(t, brief, { compact: true, trend: threadTrend(t, d) })).join("")}</div>
      </div>` : ""}

      <!-- The one next step, once, at the weight of a decision. This used to be
           three near-identical rows in a four-row group — Share / Active shares
           / Carry summary — that a reader could not tell apart, all three of
           which issue a code. -->
      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("مشاركة ملفك", "Sharing your record")}</h2></div>
        ${live.length ? `<a class="note" href="#/record/shares">${icon("eye")}<div style="width:100%">
            <b>${ar() ? countAr(live.length, ["طبيب واحد يشوف ملفك الآن", "طبيبان يشوفان ملفك الآن",
                 "أطباء يشوفون ملفك الآن", "طبيباً يشوف ملفك الآن"])
               : `${live.length} clinician${live.length === 1 ? "" : "s"} can see your record now`}</b>
            ${f.share ? `<div class="t3" style="margin-top:2px">${f.share}</div>` : ""}
          </div></a>` : ""}
        <a class="btn btn--2" style="margin-top:${live.length ? "12px" : "0"}" href="#/record/carry">${
          T("أصدر رمز زيارة", "Issue a visit code")}</a>
        <p class="t3" style="margin-top:10px;line-height:1.7">${T(
          "الرمز يعطي الطبيب اللي تختاره ما تختاره أنت، للمدة اللي تحدّدها — وينغلق وحده.",
          "The code gives a clinician you choose exactly what you choose, for as long as you set — then it closes itself.")}</p>
      </div>

      <!-- THE ARCHIVE. The old twelve rows, demoted to what they are: a drawer
           you open when you already know what you are looking for. A row appears
           only when it holds something, so an empty record shows a short list
           of real options instead of eleven lines reading «ما مسجّل». -->
      <div class="sec">
        <div class="sec-h"><h2 class="d3">${T("كل شي محفوظ", "Everything on file")}</h2></div>
        <div class="stack-2">
          ${tile("#/record/timeline", T("الخط الزمني", "Timeline"), null, null, f.span)}
          ${arch("#/record/labs", T("التحاليل", "Lab results"),
            (d.results || []).filter((x) => x.value != null).length, f.lab)}
          ${arch("#/record/medications", T("الأدوية", "Medications"), prof.currentMedications, f.medications)}
          ${arch("#/record/conditions", T("المشاكل الصحية", "Conditions"), prof.activeConditions, f.conditions)}
          ${arch("#/record/vitals", T("قياسات البيت — ضغط، وزن، سكر", "Home measurements — BP, weight, sugar"),
            (d.vitals || []).length, f.vital)}
          ${arch("#/record/visits", T("الزيارات", "Visits"), (d.encounters || []).length, f.visit)}
          ${arch("#/record/documents", T("التقارير والمستندات", "Documents"), (d.documents || []).length, f.doc)}
          ${arch("#/record/procedures", T("العمليات السابقة", "Previous procedures"), (d.procedures || []).length, f.proc)}
          ${arch("#/record/immunizations", T("التطعيمات", "Immunizations"), prof.immunizations, "")}
          ${tile("#/record/access", T("منو فتح ملفي", "Who opened my record"), (d.accessLog || []).length, null, f.access)}
        </div>
      </div>

      <p class="t3" style="margin-top:22px;line-height:1.7">${T(
        "ملفك يبقى عندك. لا أحد يفتحه إلا بموافقتك، وكل فتح مسجّل هنا.",
        "Your record stays yours. Nobody opens it without your consent, and every opening is logged here.")}</p>
    </section>${nav(slot || "sheets")}`;
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

  /* THE RECORD ROW.
     This screen was twelve of these, and every one of them said the same
     thing: a label, and a count. A count is cardinality, and cardinality is
     almost never what a person came for. "التحاليل ٤" tells a patient nothing
     they can act on, and it is visually indistinguishable from "التطعيمات ٠" —
     so the only way to find out whether anything here mattered was to open all
     twelve. The screen read as a table of contents for a database.

     Two changes. Each row now carries the newest FACT it holds, drawn from the
     record itself and never invented — the names of the conditions, the date
     of the last visit, the title of the newest report. And a row holding
     nothing says so in words: a bare "٠" beside a label reads as a
     measurement, as though zero were a finding. It is an absence, and absence
     is a word. */
  /* An archive row renders only when it holds something. Eleven rows reading
     «ما مسجّل» is a filing cabinet with the drawers welded shut; the same eleven
     rows, present only when real, is a record that grows with the patient. The
     add-actions above are how an empty one gets filled. */
  const arch = (href, label, count, fact) => (count ? tile(href, label, count, null, fact) : "");

  const tile = (href, label, count, tone, fact) =>
    `<a class="rw" href="${href}">
      <span class="grow" style="min-inline-size:0">
        <span class="rowb">
          <span class="${tone === "warn" ? "st st-e" : "rw-t"}">${esc(label)}</span>
          ${count == null ? "" : count === 0
            ? `<span class="t3 quiet">${T("ما مسجّل", "none")}</span>`
            : `<span class="t3">${n(count)}</span>`}
        </span>
        ${fact ? `<span class="t3 rw-fact">${fact}</span>` : ""}
      </span>
      <span class="rw-go" aria-hidden="true">${icon("chev")}</span>
    </a>`;

  /* The newest fact a section holds, as a phrase. Returns "" rather than a
     placeholder when the section is empty — the count already says "ما مسجّل"
     and repeating it in prose is noise.

     `names` lists what is actually there up to a limit and then counts the
     remainder in agreeing Arabic, because «و٣ آخرين» beside two named
     medicines is information and «٥ أدوية» is not. */
  const dateOf = (v) => n(String(v || "").slice(0, 10));
  function names(list, max) {
    const shown = list.slice(0, max).map((x) => esc(String(x))).join(T("، ", ", "));
    const rest = list.length - max;
    if (rest <= 0) return shown;
    return shown + (ar()
      ? ` و${countAr(rest, ["واحد آخر", "اثنان آخران", "آخرون", "آخرون"])}`
      : ` and ${rest} more`);
  }

  /* Every phrase below is read straight out of the record. Nothing here
     summarises, interprets or estimates: an empty section produces "" and the
     row falls back to saying it holds nothing. That matters more here than
     anywhere else on the screen — a fact printed under a label looks
     authoritative, and a plausible-sounding invented one would be trusted. */
  function recordFacts(d, live) {
    const newest = (list, key) => (list || []).slice()
      .sort((a, b) => String(b[key] || "").localeCompare(String(a[key] || "")))[0];
    const active = (d.conditions || []).filter((c) => c.clinicalStatus === "active");
    const meds = (d.medications || []).filter((m) => m.status === "active");
    const lastVisit = newest(d.encounters, "startedAt");
    const lastLab = newest((d.results || []).filter((x) => x.value != null), "effectiveAt");
    const lastDoc = newest(d.documents, "documentDate");
    const lastProc = newest(d.procedures, "performedAt");
    const lastVital = newest(d.vitals, "effectiveAt");
    const lastAccess = newest(d.accessLog, "at");
    /* The timeline's own span, from the oldest and newest dates the record
       actually contains — not a count of rows, which is what "الخط الزمني ٩"
       would have been. */
    const dates = [].concat(
      (d.encounters || []).map((x) => x.startedAt), (d.results || []).map((x) => x.effectiveAt),
      (d.procedures || []).map((x) => x.performedAt), (d.documents || []).map((x) => x.documentDate),
    ).filter(Boolean).map((x) => String(x).slice(0, 4)).sort();
    const y0 = dates[0], y1 = dates[dates.length - 1];
    return {
      conditions: active.length ? names(active.map((c) => c.display), 2) : "",
      medications: meds.length ? names(meds.map((m) => m.display), 2) : "",
      span: y0 ? (y0 === y1 ? n(y0) : T(`من ${n(y0)} إلى ${n(y1)}`, `${n(y0)} to ${n(y1)}`)) : "",
      visit: lastVisit ? T("آخر زيارة ", "last visit ") + dateOf(lastVisit.startedAt) : "",
      lab: lastLab ? esc(lastLab.display || lastLab.code) + " · " + dateOf(lastLab.effectiveAt) : "",
      doc: lastDoc ? esc(lastDoc.title || "") : "",
      proc: lastProc ? esc(lastProc.display || "") + " · " + dateOf(lastProc.performedAt) : "",
      vital: lastVital ? T("آخر قياس ", "last measurement ") + dateOf(lastVital.effectiveAt) : "",
      access: lastAccess ? T("آخر فتح ", "last opened ") + dateOf(lastAccess.at) : "",
      /* Who, not how many. A patient checking this is checking for a name. */
      share: (live || []).length
        ? names((live || []).map((s) => s.granteeName || s.granteeId), 2) : "",
    };
  }

  function panelAllergies(list) {
    const crit = E().criticalAllergies(list);
    /* "No allergy recorded" and "no allergies" are different claims, and a
       clinician reading the second where only the first is true can give a
       drug that kills. An empty allergy field is an UNKNOWN, said plainly, at
       the weight an unknown on this field deserves — not a quiet grey line
       that reads as a clean bill of health. It also carries no checkmark: a
       tick against absent safety data is a reassurance nobody earned. */
    if (!crit.length) {
      return `<a class="note note-w" href="#/record/allergies" style="margin-top:14px">${icon("alert")}
        <div style="width:100%">
          <b>${T("حساسيتك غير معروفة", "Your allergies are unknown")}</b>
          <div class="t3" style="margin-top:3px">${T(
            "ما مسجّل عندك شي — وهذا مو نفس إنك ما عندك حساسية. طبيبك يقرأ هذا الحقل قبل أي دواء.",
            "Nothing is recorded here — which is not the same as having none. Your clinician reads this field before prescribing.")}</div>
          <span class="b-g" style="display:inline-block;margin-top:8px">${T("سجّل حساسيتك", "Record your allergies")}</span>
        </div></a>`;
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
  /* `slot` because this screen is reached from BOTH doorways: `#/` (the booklet
     by date) and `#/record` (by sheet). A first-run user landing on `#/` had
     «أوراقي» lit — a bar reporting a destination they had not chosen. */
  function screenRecordSetup(slot) {
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
    </section>${nav(slot || "sheets")}`;
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
      case "labs": return screenResults();
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
      case "thread": return screenStrand(d, id);
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
    /* Every active problem is a doorway into its own story. This is the third
       and most-used route to the strand — the register's acknowledged weakness
       is that one interleaved axis scatters a problem, and the fix has to be
       reachable from where a patient looks for a problem BY NAME. */
    const strandOf = (c) => (E().careThreads({ ...d, patientId: d.patient.id }, { now: now() })
      .threads.find((x) => (x.condition || {}).id === c.id) || null);
    const past = (d.conditions || []).filter((c) => c.clinicalStatus !== E().COND_STATE.ACTIVE);
    return page(T("المشاكل الصحية", "Conditions"),
      `${active.length ? `<div class="stack-2">${active.map((c) => { const th = strandOf(c);
        return `<div class="rw">
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
          ${th ? `<a class="b-g" style="margin-top:8px;display:inline-block"
            href="#/record/thread/${esc(th.id)}">${T("شوف شنو تغيّر ومتى", "See what changed, and when")}</a>`
            : `<div class="t3" style="margin-top:8px">${T(
                "ما في أحداث مربوطة بهذي المشكلة بالسجل",
                "no events in the record are linked to this problem")}</div>`}
        </div></div>`; }).join("")}</div>`
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

    /* The reading against its own reference range, the same component the labs
       screen leads with. It shipped on ONE screen out of the four that carry
       exactly this data — value, refLow, refHigh, all present here, which
       `rangeLine` already proves by printing them in prose. So the screen whose
       entire purpose is a measurement rendered it as three separate strings
       while the labs screen drew it. Same function, no new CSS. */
    const vitalRow = (v) => `<div class="rw"><div style="width:100%">
        <div class="lab">${esc(E().vitalLabel(v.kind, ar()))}</div>
        <div class="rowb" style="margin-top:2px;align-items:flex-end">
          ${bigValue(v.value, v.unit)}
          <span>${flagChip(v.flag)}</span></div>
        ${rangeScale(v)}
        ${rangeLine(v) ? `<div class="t3" style="margin-top:6px">${rangeLine(v)}</div>` : ""}
        <div class="rowb" style="margin-top:5px">
          <span class="t3">${n(String(v.effectiveAt || "").slice(0, 10))}</span>
          <span>${selfReported(v)}</span></div>
      </div></div>`;

    return page(T("القياسات", "Measurements"),
      `${lastBp ? `<div class="rw"><div style="width:100%">
          <div class="lab">${T("ضغط الدم", "Blood pressure")}</div>
          <!-- At the same weight as every other reading on this screen. It was
               the only one left in an 11.5px chip class while its neighbours
               used the display face — so the reading most likely to matter here
               was the quietest thing on the screen. -->
          <div class="rowb" style="margin-top:2px;align-items:flex-end">
            <span class="nval">${bpPair(lastBp.systolic.value,
              lastBp.diastolic ? lastBp.diastolic.value : null, "")}<span class="u">${
              esc(lastBp.systolic.unit || "")}</span></span>
            <span>${lastBp.abnormal ? `<span class="st st-e">${T("خارج المعتاد", "outside the usual range")}</span>`
              : `<span class="st st-v">${T("ضمن المعتاد", "within the usual range")}</span>`}</span></div>
          <div class="rowb" style="margin-top:5px">
            <span class="t3">${n(String(lastBp.at || "").slice(0, 10))}</span><span></span></div>
          <!-- The systolic drawn against its own range. A blood pressure is one
               reading but it is two numbers, and only one scale can be drawn
               honestly, so it is labelled as the systolic rather than left to
               look like the pair. -->
          ${rangeScale(lastBp.systolic) ? `<div class="t3" style="margin-top:8px">${
            T("الرقم الأعلى", "upper number")}</div>${rangeScale(lastBp.systolic)}` : ""}
          <div class="t3" style="margin-top:6px">${T("المعتاد للبالغ تحت", "usual for an adult, under")} ${
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
        /* An empty screen is an invitation, not a full stop. A patient cannot
           author an operation — the operative note belongs to the theatre — but
           they can record that they HOLD the discharge summary, which is what
           makes the next clinician ask for it. Same honest action the labs
           screen offers, for the same reason. Measured before this: 58
           characters of text and no way to act, on a cold deep link. */
        : empty(T("ما مسجّل عندك عمليات", "No procedures recorded"),
          `<p class="t3" style="margin-top:12px;line-height:1.7">${T(
            "العمليات تنكتب من المستشفى. إذا عندك تقرير عملية أو خروج، سجّله حتى الطبيب الجاي يعرف إنه موجود ويطلبه منك — وخصوصاً إذا انسحب نسيج للتحليل.",
            "Operations are recorded by the hospital. If you hold an operative or discharge report, note that you have it so the next clinician knows to ask — especially if a specimen was sent for analysis.")}</p>
          ${addButton("document", T("سجّل تقرير عملية عندك", "Note an operative report you hold"))}`));
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
        <div class="tl-e-head"><span class="st ${e.flag && e.flag !== "normal" ? "st-e" : "st-q"}">${
          esc(evtLabel(e.type))}${e.significance >= 4
            ? ` <span class="st st-t">${T("حدث كبير", "major")}</span>` : ""}</span>
        <!-- The EVENT, not the date, is the heaviest thing in this row. The
             measured baseline recorded the timeline's three heaviest elements as
             the screen title and two bare day numbers — on a longitudinal
             record's own chronology, nothing about the trajectory reached the
             top of the visual hierarchy. A date is the axis; the axis does not
             outrank the thing it measures. -->
        <div class="tl-title">${esc(e.title || T("بلا عنوان", "untitled"))}</div></div>
        ${e.detail ? `<div class="t3" style="margin-top:3px">${esc(e.detail)}</div>` : ""}
        ${ep ? `<div class="t3" style="margin-top:4px">${T("ضمن", "part of")} ${esc(ep)}</div>` : ""}
        ${e.flag && e.flag !== "normal" ? `<span class="st st-e" style="margin-top:5px">${
          e.flag === "unknown" ? T("بلا مدى مرجعي", "no reference range") : T("غير طبيعية", "abnormal")}</span>` : ""}
      </div>
    </div>`;
  };

  /* =========================================================
     THE CARE THREAD — the redesign's spine
     =========================================================
     The record used to be twelve rows, each naming a storage table. A patient
     does not hold "Labs" and "Visits" in their head; they hold "my diabetes,
     and what has happened to it". That object existed in the domain from day
     one — episodes, `conditionId` on every event, `significance` per event —
     and no screen had ever rendered it, so the interface could only ever be a
     list of tables.

     A thread renders as ONE CONTINUOUS RAIL, and that is the whole point: a
     connected line means "these things belong to each other", where a card
     means "this is a separate thing". Weight comes from `significance`, which
     the domain already computes — a major operation is a large dot and a bold
     line, an ordinary visit recedes to a hairline. Nothing here is decoration:
     if a dot is bigger, the event mattered more.

     `compact` renders the story down to its shape for the record index and
     home; the full screen adds the trend, the medicines and the open end. */
  const EP_STATE_LABEL = {
    ACTIVE: ["نشط", "active"], OPEN: ["مفتوح", "open"],
    ON_HOLD: ["متوقّف مؤقتاً", "on hold"], COMPLETED: ["مكتمل", "completed"],
    CANCELLED: ["ملغى", "cancelled"],
  };
  const epStateLabel = (k) => (EP_STATE_LABEL[k] || [k, k])[ar() ? 0 : 1];

  /* Significance 1-4 → a visual step. Four steps, because the domain emits
     four: encounter 1, medicine 2, diagnosis/result/imaging 3, major surgery 4. */
  const sigClass = (n) => "s" + Math.max(1, Math.min(4, n || 1));

  function threadEvent(e) {
    const abnormal = e.flag && e.flag !== "normal" && e.flag !== "unknown";
    return `<li class="th-e ${sigClass(e.significance)}${abnormal ? " is-flag" : ""}">
      <span class="th-dot" aria-hidden="true"></span>
      <span class="th-when t3">${n(String(e.at || "").slice(0, 10))}</span>
      <span class="th-what">
        <span class="th-t">${esc(e.title || T("بلا عنوان", "untitled"))}</span>
        <span class="t3 th-kind">${esc(evtLabel(e.type))}${e.detail ? " · " + esc(e.detail) : ""}</span>
        ${abnormal ? `<span class="st st-e">${T("غير طبيعية", "abnormal")}</span>` : ""}
      </span>
    </li>`;
  }

  /* The one line that says where this problem stands right now. It is assembled
     only from facts already on the thread — never a prognosis, never a
     judgement the app is not entitled to make. */
  function threadStanding(t, brief, opts) {
    const o = opts || {};
    /* On the record index and on home, the attention panel at the top of the
       screen already names every unacknowledged abnormal result. Repeating it
       here made one fact appear three times on one scroll — the panel, this
       line, and the event itself. In `compact` mode the thread states its
       TRAJECTORY instead, which is the thing the panel cannot say. */
    const un = (brief && brief.unacknowledgedAbnormal || [])
      .filter((x) => t.events.some((e) => e.type === E().EVT.RESULT && e.title === x.name));
    if (un.length && !o.compact) return { tone: "e", text: ar()
      ? `نتيجة ${esc(un[0].name)} غير طبيعية وما أقرّها أحد`
      : `${esc(un[0].name)} is abnormal and nobody has acknowledged it` };
    if (t.state === E().EP_STATE.COMPLETED) return { tone: "v", text: T("انتهت هذه الحلقة", "this episode is closed") };
    /* THE TRAJECTORY, which is what a thread knows and a flat alert does not.
       The direction is `trend()`'s own word — never arithmetic done here, and
       withheld entirely across mixed units or mixed laboratories, exactly as the
       labs screen withholds it. */
    if (o.trend && o.trend.direction && o.trend.points.length > 1 && !o.trend.mixedUnits) {
      const first = o.trend.points[0], lastP = o.trend.points[o.trend.points.length - 1];
      const worse = lastP.flag && lastP.flag !== "normal" && lastP.flag !== "unknown";
      return { tone: worse ? "e" : "t", text: `${esc(o.trend.display || "")} ${
        esc(dirLabel(o.trend.direction))} ${ar() ? "من" : "from"} ${measure(first.value, first.unit)} ${
        ar() ? "إلى" : "to"} ${measure(lastP.value, lastP.unit)}` };
    }
    const last = t.events[t.events.length - 1];
    if (last) return { tone: "q", text: (ar() ? "آخر شي صار: " : "last event: ")
      + esc(evtLabel(last.type)) + " · " + n(String(last.at).slice(0, 10)) };
    return null;
  }

  /* The thread's own lab series, from codes that appear as events IN it — so no
     series is ever claimed by a problem nobody attached it to. */
  function threadTrend(t, d) {
    const codes = [...new Set((d.results || [])
      .filter((r) => t.events.some((e) => e.type === E().EVT.RESULT && e.title === (r.display || r.code)))
      .map((r) => r.code).filter(Boolean))];
    for (const c of codes) {
      const tr = E().trend(d.results, c);
      if (tr.points.length > 1) return tr;
    }
    return codes.length ? E().trend(d.results, codes[0]) : null;
  }

  function threadCard(t, brief, opts) {
    const o = opts || {};
    const st = threadStanding(t, brief, { compact: !!o.compact, trend: o.trend });
    /* Newest first on the summary — a reader scanning threads wants the current
       state. The full screen runs oldest-first, because there the point is the
       trajectory and reading downward must move forward in time. */
    /* Home shows ONE event; the record index shows three. Home is the signal
       layer — the trajectory line above already carries the story, and two full
       threads pushed everything else on the screen below the fold. The record is
       the index, and the thread's own screen is the detail. That is the
       progressive disclosure, expressed as how much of the rail each surface
       draws rather than as a widget that expands. */
    const cap = o.max || (o.compact ? 3 : 0);
    const shown = cap ? t.events.slice().reverse().slice(0, cap) : t.events;
    return `<a class="th ${t.state === E().EP_STATE.COMPLETED ? "is-done" : ""}" href="#/record/thread/${esc(t.id)}">
      <div class="th-h">
        <div>
          <div class="th-title">${esc(t.title)}</div>
          <div class="t3 th-sub">${esc(epStateLabel(t.state))}${
            t.chronic ? " · " + T("مزمن", "chronic") : ""}${
            t.since ? " · " + T("من ", "since ") + n(String(t.since).slice(0, 10)) : ""}</div>
        </div>
        <span class="rw-go" aria-hidden="true">${icon("chev")}</span>
      </div>
      ${st ? `<div class="th-stand st st-${st.tone}">${st.text}</div>` : ""}
      <ul class="th-rail">${shown.map(threadEvent).join("")}</ul>
      ${cap && t.events.length > cap
        ? `<div class="t3 th-more">${ar()
            ? countAr(t.events.length - cap, ["حدث واحد قبلها", "حدثان قبلها", "أحداث قبلها", "حدثاً قبلها"])
            : `${t.events.length - cap} earlier`}</div>` : ""}
    </a>`;
  }

  /* ONE thread component, used by the record index and by home. Exposed rather
     than reimplemented, because two renderers for the product's central object
     is exactly how the interface became a collection of screens in the first
     place. Home passes no brief — `threadStanding` handles that and falls back
     to the last event. */
  globalThis.homeThread = function homeThread(t) {
    return threadCard(t, null, { compact: true, max: 1, trend: threadTrend(t, store()) });
  };

  /* The thread's own screen: the story in full, its trend, its medicines, and
     the one thing that is still open. */
  function screenThread(d, id) {
    const brief = R().preVisitBrief(d.patient, d, now());
    const { threads } = E().careThreads({ ...d, patientId: d.patient.id }, { now: now() });
    const t = threads.find((x) => x.id === id);
    if (!t) {
      return page(T("حلقة رعاية", "Care thread"),
        empty(T("ما لقينا هذي الحلقة", "That thread is not in this record"),
          `<a class="b-g" style="display:inline-block;margin-top:12px" href="#/record">${
            T("رجوع للملف", "Back to the record")}</a>`));
    }
    const codes = [...new Set((d.results || [])
      .filter((r) => t.events.some((e) => e.type === E().EVT.RESULT && e.title === (r.display || r.code)))
      .map((r) => r.code).filter(Boolean))];
    /* A medicine joins this thread only through a link that EXISTS. The first
       version compared `m.episodeId === (t.episode || {}).id`, and for a thread
       with no episode both sides were `undefined` — so every medicine with no
       episode matched every thread, and amlodipine (prescribed for the
       hypertension) and aspirin (linked to nothing) rendered under the diabetes
       heading. Attributing a drug to the wrong problem on a screen a clinician
       reads is a prescribing hazard, not a display nit. */
    const cid = (t.condition || {}).id || null;
    const eid = (t.episode || {}).id || null;
    const meds = (d.medications || []).filter((m) => m.status === "active"
      && ((cid && m.indicationId === cid) || (eid && m.episodeId === eid)));
    const st = threadStanding(t, brief);

    return page(esc(t.title),
      `<div class="th-head">
        <div class="rowb">
          <span class="st st-${t.state === E().EP_STATE.COMPLETED ? "v" : "t"}">${esc(epStateLabel(t.state))}</span>
          ${t.chronic ? `<span class="st st-q">${T("مزمن", "chronic")}</span>` : ""}
        </div>
        ${st ? `<div class="th-stand-big ${st.tone === "e" ? "is-alarm" : ""}">${st.text}</div>` : ""}
      </div>

      ${codes.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${
        T("الاتجاه", "The trend")}</h2></div>
        ${codes.map((code) => {
          const tr = E().trend(d.results, code);
          const last = tr.points[tr.points.length - 1];
          return `<div class="rw"><div style="width:100%">
            <div class="lab">${esc(tr.display || code)}</div>
            <div class="rowb" style="margin-top:2px;align-items:flex-end">
              ${last ? bigValue(last.value, last.unit) : ""}
              <span>${last ? flagChip(last.flag) : ""}</span></div>
            ${last ? rangeScale(last) : ""}
            ${last && rangeLine(last) ? `<div class="t3" style="margin-top:6px">${rangeLine(last)}</div>` : ""}
            ${trendSeries(tr, { headlined: true })}
          </div></div>`;
        }).join("")}</div>` : ""}

      ${meds.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${
        T("الأدوية لهذي المشكلة", "Medicines for this problem")}</h2></div>
        <div class="stack">${meds.map((m) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(m.display)}</b>${m.dose
            ? `<bdi class="strength">${esc(m.dose)}</bdi>` : ""}</div>
          ${selfReported(m) ? `<div style="margin-top:5px">${selfReported(m)}</div>` : ""}
        </div></div>`).join("")}</div></div>` : ""}

      <div class="sec"><div class="sec-h"><h2 class="d3">${T("القصة", "The story")}</h2></div>
        <!-- Oldest first, so reading downward moves forward in time — the same
             invariant the lab series holds, for the same reason. -->
        <ul class="th-rail th-rail--full">${t.events.map(threadEvent).join("")}</ul>
      </div>`,
      T("كل شي انسجّل عن هذي المشكلة، بترتيب حدوثه.",
        "Everything recorded about this problem, in the order it happened."));
  }

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
          <!-- THE FLOOR REFUSES IN PLACE, AND IT REFUSES AS A RULE.
               This was a checkbox rendered "checked disabled" — a pre-disabled
               control, which teaches nothing and hands assistive technology a
               state with no reason. Two changes, both taken from the other
               exploration's «الأرضية»:

               · the row looks and behaves like every other row, and the refusal
                 happens ON THE LINE at the moment the patient tries to withhold
                 it, in the domain's own words rather than a footnote;
               · the refusal is attributed to the RULE, not to the app's voice,
                 and it is ANNOUNCED — a status role with aria-live, because
                 a control that silently declines is indistinguishable from a
                 control that is broken. -->
          <div class="rw"><div class="rowb" style="width:100%">
            <span>${esc(C().scopeLabel(S_.ALLERGIES, S.lang))}
              <span class="st st-t" style="margin-inline-start:8px">${T("مأخوذة", "taken")}</span></span>
            <button class="b b-s task-act" aria-describedby="floor-why"
              onclick="recordFloorRefuse()">${T("شيلها", "Remove it")}</button>
          </div></div>
          <div class="refuse" id="floor-why" role="status" aria-live="polite" hidden>
            <span class="rule-name">${T("أرضية السلامة — قاعدة في النظام، مو قرار التطبيق",
              "The safety floor — a rule in the system, not the app's choice")}</span>
            <b>${T("ما تنشال.", "This cannot be removed.")}</b>
            ${T("الطبيب اللي يشوف ملفك بلا حساسيتك أخطر من طبيب ما يشوف الملف أبداً، لأنه راح يوصف وهو يحسب إنه تأكّد.",
                "A clinician who sees your record without your allergies is more dangerous than one who never sees it at all — they will prescribe believing they checked.")}
          </div>
          ${OFFER.map((s) => `<label class="rw"><div class="rowb" style="width:100%">
            <span>${esc(C().scopeLabel(s, S.lang))}</span>
            <input type="checkbox" class="sh-scope" value="${esc(s)}"${on.has(s) ? " checked" : ""}
              onchange="recordShareCount()">
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

      <!-- The action was the last thing on a 2,800px scroll, below eleven
           checkboxes and five duration chips. This is the counter-at-the-clinic
           moment: the patient is standing at a desk with a receptionist
           waiting, and the button that ends the interaction was off-screen for
           the entire time they were choosing. It is fixed to the bottom now,
           and it carries the count of what is selected — so the thing the
           button will actually do is legible without scrolling back up to
           re-read eleven checkboxes. -->
      <div class="actionbar actionbar--stack">
        <!-- Seeded from the same set the checkboxes are rendered from, so the
             bar is correct on first paint without waiting for a hook that may
             not run on a cold deep link. -->
        <span class="t3" id="sh-count">${shareCountText(
          OFFER.filter((s) => on.has(s)).length)}</span>
        <button class="btn" onclick="recordStartShare()">${T("أصدر رمزاً", "Issue a code")}</button>
      </div>`,
      T("تختار شنو يشوف وكم مدة، ويطلعلك رمز تعطيه للعيادة. الرمز يُستعمل مرة وحدة وينتهي وحده.",
        "You choose what they see and for how long, and get a code to hand to the clinic. The code is single use and expires on its own."),
      "record");
  }

  /* The chosen duration lives on the DOM, not in a module variable, because a
     re-render between choosing and confirming would silently reset a module
     variable while the chip still looked selected — consent that says one
     thing on screen and stores another. */
  /* Allergies are the locked floor and are always shared, so the count says
     "+ الحساسية" rather than folding an unremovable item into a number the
     patient cannot change. */
  const shareCountText = (k) => ar()
    ? `${k ? countAr(k, ["قسم واحد", "قسمان", "أقسام", "قسماً"]) : "ما اخترت شي"} + الحساسية`
    : `${k || "no"} section${k === 1 ? "" : "s"} + allergies`;

  /* The refusal is revealed rather than toasted: a toast is gone before a
     screen-reader user reaches it, and this is the one place in the flow where
     the system overrides the patient. It stays on the line it belongs to. */
  globalThis.recordFloorRefuse = function recordFloorRefuse() {
    const el = document.getElementById("floor-why");
    if (!el) return;
    el.hidden = false;
    /* re-announce if it was already open — the patient pressed again */
    el.setAttribute("role", "status");
  };

  globalThis.recordShareCount = function recordShareCount() {
    const el = document.getElementById("sh-count");
    if (el) el.innerHTML = shareCountText(document.querySelectorAll(".sh-scope:checked").length);
  };

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
    /* `countAr` prepends the numeral itself, so the "#" in the old forms was
       never substituted — an active share read «5 بعد # أيام» on screen. The
       number goes where countAr puts it and the preposition goes outside. */
    return T(`بعد ${countAr(days, AR_DAY)}`, `in ${days}d`);
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

        <!-- The clinician is looking at THIS screen, across the desk, while the
             patient holds the phone. So the door into the redeem screen is here,
             addressed to them — and it carries the code, so the same link works
             when it is sent instead of shown. -->
        <a class="b-g" style="display:block;margin-top:16px" href="#/redeem/${esc(live.code)}">${
          T("أنا الطبيب — افتح الملف بهذا الرمز", "I am the clinician — open the record with this code")}</a>
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
        <!-- ONE ROW PER ALLERGEN, and this is a safety fix rather than a
             layout preference.

             The allergens used to be joined into one sentence with " · " and
             each one's provenance badge appended inline. Two failures came out
             of that single line. the criticality was dropped entirely — the
             projection carries it (record.js:551) and BOTH patient screens
             render «خطرة»/«خفيفة», so the one screen where severity decides
             whether a beta-lactam gets test-dosed was the only screen that
             omitted it, and a mild sulfa itch read as equal to a
             rash-and-swelling penicillin reaction.

             Worse, the badge's SCOPE inverted. Only the sulfamethoxazole was
             patient-reported; the penicillin was clinician-recorded. But joined
             into one sentence, the badge wrapped onto its own line beneath both
             and read as qualifying the whole ALLERGY statement — so a doctor
             scanning for thirty seconds concluded the PENICILLIN allergy was
             unverified hearsay. That reasoning ends in a penicillin challenge.

             High criticality sorts first, each allergen owns its own severity
             chip and its own provenance mark, and no two allergens are ever
             joined by a separator again. -->
        ${brief.allergies.length ? `<div class="note note-e" style="margin-top:10px">${icon("alert")}
          <div style="width:100%"><b>${T("حساسية", "ALLERGY")}</b>
          <div class="stack-2" style="margin-top:6px">${brief.allergies.slice().sort((a, b) =>
            (b.criticality === E().CRITICALITY.HIGH) - (a.criticality === E().CRITICALITY.HIGH))
            .map((a) => `<div>
              <div class="rowb"><b>${esc(a.substance)}</b>
                <span class="st ${a.criticality === E().CRITICALITY.HIGH ? "st-e" : "st-q"}">${
                  a.criticality === E().CRITICALITY.HIGH ? T("خطرة", "high")
                  : a.criticality === E().CRITICALITY.LOW ? T("خفيفة", "low")
                  : T("الشدة غير محدّدة", "severity not assessed")}</span></div>
              ${a.reaction ? `<div class="t3" style="margin-top:2px">${esc(a.reaction)}</div>` : ""}
              ${patientToldUs(a) ? `<div style="margin-top:4px">${patientToldUs(a)}</div>` : ""}
            </div>`).join("")}</div></div></div>`
          : `<div class="t3" style="margin-top:10px">${T("ما مسجّل أي حساسية — وهذا مو نفس «ما عنده حساسية»",
              "No allergy recorded — which is not the same as 'no allergies'")}</div>`}
        <div class="row" style="flex-wrap:wrap;gap:6px 10px;margin-top:10px">
          ${brief.active.slice(0, 4).map((c) => `<span class="chip">${esc(c.name)}</span>`).join("")}
          ${brief.medications.length ? `<span class="st st-q">${ar()
            ? countAr(brief.medications.length, ["دواء واحد", "دواءان", "أدوية", "دواءً"])
            : `${n(brief.medications.length)} meds`}</span>` : ""}
        </div>
      </div>

      <!-- WHAT IS UNFINISHED, AND WHO OWNS IT — the clinician's first partition.
           This replaced three loose alert boxes (unacknowledged abnormals,
           overdue loops, unverified claims) that stated danger and never stated
           OWNERSHIP, so a clinician with seven minutes could not tell what was
           theirs to do from what was somebody else's to chase. -->
      ${(() => { const w = clinicianWork(record, me, now());
        return `<div class="owncols">
          ${ownBlock("own-mine", T("عليك أنت", "On you"), w.mine, true)}
          ${ownBlock("own-theirs", T("على غيرك", "On someone else"), w.theirs, false)}
        </div>`; })()}

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
          <div class="rowb" style="align-items:flex-end"><b>${esc(v.name)}</b>
            ${bigValue(v.value, v.unit)}</div>
          ${rangeScale(v)}
          <div class="rowb" style="margin-top:5px">
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

      ${holesBlock(record, sc)}

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
  /* A withheld section states that it was NOT LENT, never that it is empty —
     see «THE SHAPE OF THE HOLES». The old version printed a heading and a quiet
     chip reading «ما شاركها المريض», which a clinician scanning downward reads
     as "there is nothing here". */
  const lockedSection = (title) => `<div class="sec"><div class="sec-h"><h2 class="d3">${esc(title)}</h2>
    <span class="st st-q">${T("خارج نطاق الإعارة", "outside what was lent")}</span></div>
    <div class="dband-note">${T("ما سلّمها المريض. وهذا مو نفس إنها فارغة.",
      "The patient did not lend this. That is not the same as it being empty.")}</div></div>`;

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
     beneath the same value at 26px, is an audit trail, not noise.

     A series of exactly ONE point is the exception, and only when headlined:
     there is no movement to show and no history to compare against, so the row
     would repeat the value and the flag the caller printed at 26px two lines
     above and add nothing but the date. The date is the whole contribution, so
     the date is all it prints. */
  function trendSeries(t, opts) {
    if (!t || !t.points || !t.points.length) return "";
    const o = opts || {};
    const last = t.points[t.points.length - 1];
    const single = o.headlined && t.points.length === 1;
    const rows = single
      ? `<div class="t3" style="margin-top:8px">${T("قياس بتاريخ ", "measured ")}${
          n(String(last.at || "").slice(0, 10))}</div>`
      : t.points.map((p) => `<div class="rowb" style="margin-top:6px">
        <span class="t3">${n(String(p.at || "").slice(0, 10))}</span>
        <span>${measure(p.value, p.unit)} ${flagChip(p.flag)}</span>
      </div>`).join("");
    /* Direction is arithmetic on raw numbers. Across two units that arithmetic
       is meaningless, so the word is withheld rather than printed wrong — the
       warning underneath says why. */
    const dir = t.points.length > 1 && !t.mixedUnits ? esc(dirLabel(t.direction)) : "";
    const rng = o.headlined ? "" : rangeLine(last);
    /* The direction word used to sit alone at the foot of the list, under a
       suppressed range line, reading as an orphan. It belongs to the list of
       readings, so it sits in that list's own heading — the one place where
       "كل القراءات … ارتفع" is a sentence about exactly what follows. */
    const cap = o.headlined && t.points.length > 1
      ? `<div class="rowb" style="margin-top:14px">
          <span class="t3">${T("كل القراءات", "Every reading")}</span>
          ${dir ? `<span class="st st-t">${dir}</span>` : ""}</div>` : "";
    return `${cap}${rows}
      ${!cap && (dir || rng) ? `<div class="rowb" style="margin-top:8px">
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

  /* =========================================================
     THE MISSING EDGE — redeeming a code
     =========================================================
     `consent.js` has had `redeemCarryCode` since the consent engine shipped:
     it validates the code, refuses a second redemption, refuses an expired
     one, and converts the paper into an ordinary time-limited share. It is
     covered by tests in two suites.

     Nothing in the interface called it, and no screen in the product linked to
     `#/clinical`. So the entire spine of the product — a patient curates
     scopes and a duration, issues a code, hands it across a clinic desk —
     terminated in a code that nothing could accept. The share builder, the
     carry screen, the active-shares list, the access log and the clinician's
     brief were five screens describing a handover whose receiving end did not
     exist. `#/record/access` would have read «ما فتح ملفك أحد بعد» forever.

     This is the receiving end. It is deliberately reachable WITHOUT the
     patient's phone — the clinician types the six characters into their own
     device — and it accepts the code in the URL too, so a code can travel by
     WhatsApp the way the rest of this product's handoffs do.

     What it does NOT do is invent authority. A redeemed code produces exactly
     the share `grantShare` produces, attributed to whoever redeemed it, and
     the clinician's own identity is still self-asserted until a licence is
     verified. The code is an introduction, not a credential. */
  globalThis.screenRedeem = function screenRedeem(codeFromUrl) {
    const me = currentClinician();
    if (!me) return clinicianSetup();
    const pre = String(codeFromUrl || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    return page(T("عندي رمز مريض", "I have a patient's code"),
      `<div class="note">${icon("seal")}<div>${T(
        "المريض يعطيك رمزاً من ستة أحرف. تكتبه هنا، فينفتح لك اللي اختاره هو — لا أكثر — وللمدة اللي حدّدها هو. يوصله إنك فتحته، ويبقى مكتوباً باسمك.",
        "The patient gives you a six-character code. Type it here and you get exactly what they chose — no more — for exactly as long as they chose. They are told you opened it, and it stays recorded under your name.")}</div></div>

      <label class="fld" style="margin-top:18px"><span>${T("الرمز", "The code")}</span>
        <!-- One field, six characters, from an alphabet with no 0/O and no
             1/I/l — because this code is usually read aloud across a desk in a
             noisy waiting room. inputmode/autocapitalize so a phone keyboard
             offers the right thing on the first tap. -->
        <input id="rd-code" type="text" class="mono" maxlength="6" value="${esc(pre)}"
          inputmode="latin" autocapitalize="characters" autocomplete="off" spellcheck="false"
          style="font-size:26px;letter-spacing:.22em;text-align:center"></label>

      <button class="btn" style="margin-top:16px" onclick="redeemSubmit()">${
        T("افتح الملف", "Open the record")}</button>

      <p class="t3" style="margin-top:14px;line-height:1.7">${T(
        "الرمز يُستعمل مرة واحدة. إذا انتهت صلاحيته أو استعمله أحد قبلك، ما ينفتح — اطلب من المريض رمزاً جديداً.",
        "A code is single use. If it has expired or someone used it before you, it will not open — ask the patient for a new one.")}</p>

      <div class="hr" style="margin:24px 0"></div>
      <p class="t3" style="line-height:1.7">${T(
        "ما عندك رمز؟ تقدر تطلب الاطّلاع من المريض، ويقرّر هو.",
        "No code? You can ask the patient for access and they decide.")}</p>
      <a class="b-g" style="display:inline-block;margin-top:8px" href="#/clinical/inbox">${
        T("طلباتي السابقة", "My earlier requests")}</a>`,
      T("أنت تفتح ملف شخص آخر. كل فتحة مسجّلة عنده باسمك ووقتها.",
        "You are opening someone else's record. Every opening is logged for them, under your name, with its time."),
      /* No patient tab bar for a clinician — the same reason screenClinical
         renders none. This screen is a door into someone else's product. */
      null);
  };

  globalThis.redeemSubmit = function redeemSubmit() {
    const me = currentClinician();
    if (!me) { render(); return; }
    const el = document.getElementById("rd-code");
    const code = ((el || {}).value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) { toast(T("الرمز ستة أحرف", "The code is six characters")); return; }
    const d = store();
    /* The code is matched against the record this device holds. On a clinician
       device with no patient record there is nothing to match, and saying so is
       the honest answer — inventing a lookup we cannot perform would be worse. */
    const carry = d.carry && String(d.carry.code || "").toUpperCase() === code ? d.carry : null;
    const r = C().redeemCarryCode(carry, me, now());
    if (!r.ok) {
      toast({
        NO_CODE: T("ما لقينا هذا الرمز على هذا الجهاز", "That code is not on this device"),
        ALREADY_REDEEMED: T("الرمز مستعمل — اطلب رمزاً جديداً", "Already used — ask for a new code"),
        EXPIRED: T("الرمز انتهت صلاحيته", "That code has expired"),
        REDEEMER_REQUIRED: T("سجّل حسابك المهني أولاً", "Set up your professional account first"),
      }[r.reason] || T("ما قدرنا نفتح الملف", "Could not open the record"));
      return;
    }
    mutate((x) => {
      x.carry = r.carry;
      x.shares = [...(x.shares || []), r.share];
    });
    toast(T("انفتح الملف", "Record opened"));
    location.hash = `#/clinical/${r.share.patientId}`;
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

  /* ============================================================
     THE REGISTER — the booklet by date
     ============================================================
     ONE row type, ordered strictly by time, closed by two labelled sticky
     headers. Everything unfinished sits above the first header BECAUSE IT HAS
     NOT ENDED YET: urgency is a position in time, not an alert box. There is no
     alert stack and no section chrome, and nothing here is a digest of another
     screen — the register is the primary object.

     Two aggregation laws, because the two halves fail differently. Above the
     boundary the risk is HIDING SOMETHING DANGEROUS, so two kinds never
     aggregate at all. Below it the risk is DROWNING, so time coarsens as it
     recedes.
     ============================================================ */

  /* A date with NO SEPARATOR BETWEEN NUMBERS, ever. The gutter prints a day and
     an Iraqi month name, and the year only when it changes — which removes the
     bidi hazard of guardrail §5 rather than isolating it. The ISO form stays
     available wherever a clinician needs it, isolated, in the series.
     MONTHS_AR is the array the timeline already uses; one source per month. */
  const rDay = (iso) => { const x = E().ms(iso); return x == null ? "" : new Date(x).getDate(); };
  const rMon = (iso) => { const x = E().ms(iso); return x == null ? -1 : new Date(x).getMonth(); };
  const rYr = (iso) => { const x = E().ms(iso); return x == null ? "" : new Date(x).getFullYear(); };
  const monName = (i) => (ar() ? MONTHS_AR[i] : MONTHS_EN[i]);
  const dateWord = (iso) => (rMon(iso) < 0 ? T("بتاريخ غير مسجّل", "on an unrecorded date")
    : `${n(rDay(iso))} ${esc(monName(rMon(iso)))}`);
  function gutDate(iso, prevIso) {
    if (rMon(iso) < 0) return `<b>${T("بلا تاريخ", "no date")}</b>`;
    const same = prevIso && rYr(prevIso) === rYr(iso);
    return `<b>${n(rDay(iso))} ${esc(monName(rMon(iso)))}</b>${
      same ? "" : `<span class="yr">${n(rYr(iso))}</span>`}`;
  }

  const R_DAY = 86400000;
  const daysAgo = (iso, at) => Math.round((at - E().ms(iso)) / R_DAY);
  const stripTags = (h) => String(h).replace(/<[^>]*>/g, "");

  /* "how long left", WORDED rather than clocked. A HH:MM countdown puts a colon
     between two numbers on a one-second timer, which is the §5 hazard running in
     a loop. The number is isolated; the Arabic unit sits outside it. */
  function leftLabel(expiresAt, at) {
    const ms = E().ms(expiresAt) - at;
    if (!isFinite(ms)) return T("مدّتها غير معروفة", "duration unknown");
    if (ms <= 0) return T("انتهت", "ended");
    const h = Math.floor(ms / 3600000);
    if (h < 1) return T("باقي أقل من ساعة", "under an hour left");
    if (h < 24) return ar() ? `باقي ${countAr(h, ["ساعة", "ساعتان", "ساعات", "ساعة"])}` : `${h}h left`;
    const dd = Math.round(h / 24);
    return ar() ? `باقي ${countAr(dd, ["يوم", "يومان", "أيام", "يوماً"])}` : `${dd}d left`;
  }

  const regRow = (o) => `<div class="reg-row ${o.cls || ""}${o.wide ? " reg-row--wide" : ""}"${
    o.alert ? ' role="alert"' : ""}>
      <div class="reg-gut">${o.gut}</div>
      <div class="reg-bd"><div class="reg-what">${o.what}</div>${
        o.sub ? `<div class="reg-sub">${o.sub}</div>` : ""}</div>
      ${o.back || ""}</div>`;

  const aggRow = (o) => `<details class="reg-row agg ${o.cls || ""}"><summary>
      <div class="reg-gut">${o.gut}</div>
      <div class="reg-bd"><div class="reg-what">${o.what}</div>
        <div class="reg-sub">${o.sub} <span class="more">${T("— اضغط تشوفهن", "— tap to see them")}</span></div>
      </div></summary><div class="reg-kids">${o.kids}</div></details>`;

  const NOWGUT = () => `<b>${T("الآن", "now")}</b>`;

  /* ---------- ABOVE THE BOUNDARY ----------
     HARD RULE: a result whose flag is `critical`, and ANY custody event, always
     get their own row at any record size. Everything else aggregates by KIND,
     and an aggregate always states its WORST member — so aggregation hides
     enumeration and never severity. */
  function openRows(d, at) {
    const rows = [];
    const unacked = (d.results || []).filter((x) => E().isAbnormal(x) && !x.acknowledgedBy)
      .sort((a, b) => E().ms(b.effectiveAt) - E().ms(a.effectiveAt));
    const crit = unacked.filter((x) => (x.flag || E().flagResult(x)) === "critical");
    const other = unacked.filter((x) => crit.indexOf(x) === -1);

    for (const x of crit) rows.push(regRow({ gut: NOWGUT(), cls: "reg-row--open", alert: true,
      what: `${esc(x.display || x.code)} ${measure(x.value, x.unit)} — ${T("حرجة", "critical")}
        <span class="st st-e">${T("ما أُقرّت", "unacknowledged")}</span>`,
      sub: ar() ? `وصلت ${dateWord(x.effectiveAt)}، وما أقرّها أحد`
                : `arrived ${dateWord(x.effectiveAt)}, nobody has acknowledged it` }));

    if (other.length) {
      const oldest = other[other.length - 1];
      rows.push(aggRow({ gut: NOWGUT(), cls: "reg-row--open",
        what: `${ar() ? countAr(other.length, ["نتيجة خارج المدى ما أقرّها أحد",
                 "نتيجتان خارج المدى ما أقرّهن أحد", "نتائج خارج المدى ما أقرّهن أحد",
                 "نتيجة خارج المدى ما أقرّها أحد"])
               : `${other.length} unacknowledged out-of-range result(s)`}
               <span class="st st-e">${T("متأخّرة", "overdue")}</span>`,
        sub: ar() ? `أقدمها من ${countAr(daysAgo(oldest.effectiveAt, at), ["يوم", "يومين", "أيام", "يوماً"])}`
                  : `oldest is ${daysAgo(oldest.effectiveAt, at)} days old`,
        kids: other.map((x) => `<div>${esc(x.display || x.code)} ${measure(x.value, x.unit)} — ${
          dateWord(x.effectiveAt)}</div>`).join("") }));
    }

    /* CUSTODY — never aggregated. Who is holding you is never a summary. */
    for (const sh of C().activeShares(d.shares, at)) {
      const who = esc(sh.granteeName || sh.granteeId);
      const k = (sh.scopes || []).length;
      rows.push(regRow({ gut: NOWGUT(), cls: "reg-row--out",
        what: ar() ? `${who} ماسك ${countAr(k, ["ورقة", "ورقتين", "أوراق", "ورقة"])} من دفترك`
                   : `${who} holds ${k} of your sheets`,
        sub: `${T("بموافقتك", "with your consent")} — <span class="st st-t">${leftLabel(sh.expiresAt, at)}</span>` }));
    }
    if (d.carry && !d.carry.redeemedBy && E().ms(d.carry.expiresAt) > at) {
      const k = (d.carry.scopes || []).length;
      rows.push(regRow({ gut: NOWGUT(), cls: "reg-row--out",
        what: T("رمز تسليم ما استُخدم", "an unredeemed handover code"),
        sub: `${ar() ? `${countAr(k, ["ورقة", "ورقتان", "أوراق", "ورقة"])} ومعها الحساسية`
                     : `${k} sheet(s), allergies included`} — <span class="st st-t">${
          leftLabel(d.carry.expiresAt, at)}</span>` }));
    }
    for (const a of C().accessAlerts(d.accessLog, at)) {
      rows.push(regRow({ gut: NOWGUT(), cls: "reg-row--open", alert: a.kind === "BREAK_GLASS",
        what: `${esc(a.text)} <span class="st st-e">${a.kind === "BREAK_GLASS"
          ? T("بلا موافقة", "without consent") : T("مرفوضة", "refused")}</span>`,
        sub: ar() ? `${countAr(a.count, ["مرة", "مرتين", "مرات", "مرة"])}، آخرها ${dateWord(a.at)}`
                  : `${a.count} time(s), last ${dateWord(a.at)}` }));
    }

    /* The fail-safe registers. `deriveTasks` and `networkTasks` both carry an
       owner and neither has ever been rendered on the patient's own screen. */
    for (const [kind, list] of openLoops(d, at)) {
      const worst = list[0];
      const late = list.some((x) => x.overdue);
      const stamp = late ? ` <span class="st st-e">${T("متأخّر", "overdue")}</span>` : "";
      if (list.length === 1) {
        rows.push(regRow({ gut: NOWGUT(), cls: "reg-row--open",
          what: esc(worst.label) + stamp, sub: worst.detail }));
      } else {
        rows.push(aggRow({ gut: NOWGUT(), cls: "reg-row--open",
          what: esc(loopKindLabel(kind, list.length)) + stamp, sub: worst.detail,
          kids: list.map((x) => `<div>${esc(x.label)} — ${x.detail}</div>`).join("") }));
      }
    }
    return rows;
  }

  function loopKindLabel(kind, k) {
    const F = {
      "order-without-result": [["طلب بلا نتيجة", "طلبان بلا نتيجة", "طلبات بلا نتيجة", "طلباً بلا نتيجة"], "order(s) with no result"],
      "order-unanswered": [["طلب بلا رد", "طلبان بلا رد", "طلبات بلا رد", "طلباً بلا رد"], "unanswered order(s)"],
      "pathology-pending": [["نسيج بلا تقرير", "نسيجان بلا تقرير", "أنسجة بلا تقرير", "نسيجاً بلا تقرير"], "specimen(s) unreported"],
      "referral-response": [["إحالة بلا رد", "إحالتان بلا رد", "إحالات بلا رد", "إحالة بلا رد"], "unanswered referral(s)"],
      "referral-unanswered": [["إحالة بلا رد", "إحالتان بلا رد", "إحالات بلا رد", "إحالة بلا رد"], "unanswered referral(s)"],
      "followup-due": [["مراجعة مستحقّة", "مراجعتان مستحقّتان", "مراجعات مستحقّة", "مراجعة مستحقّة"], "follow-up(s) due"],
      "result-acknowledgement": [["نتيجة تنتظر إقراراً", "نتيجتان تنتظران إقراراً", "نتائج تنتظر إقراراً", "نتيجة تنتظر إقراراً"], "result(s) awaiting acknowledgement"],
      "incidental-finding": [["اكتشاف عارض", "اكتشافان عارضان", "اكتشافات عارضة", "اكتشافاً عارضاً"], "incidental finding(s)"],
      "critical-unacknowledged": [["نتيجة حرجة", "نتيجتان حرجتان", "نتائج حرجة", "نتيجة حرجة"], "critical result(s)"],
    }[kind] || [["حلقة مفتوحة", "حلقتان مفتوحتان", "حلقات مفتوحة", "حلقة مفتوحة"], "open loop(s)"];
    return ar() ? stripTags(countAr(k, F[0])) : `${k} ${F[1]}`;
  }

  /* A thin record holds no orders, specimens or studies at all. Every list is
     optional and the domain functions tolerate that, so a new record produces an
     empty band rather than an error. */
  function openLoops(d, at) {
    const ctx = { results: d.results || [], orders: d.orders || [], specimens: d.specimens || [],
      followUps: d.followUps || [], referrals: d.referrals || [], studies: d.studies || [] };
    const derived = (E().deriveTasks ? E().deriveTasks(ctx, at) : [])
      /* RESULT_ACK is already rendered above, straight from the results, with
         severity split out. Rendering it again from the task register would
         print one fact twice under two different names. */
      .filter((x) => x.kind !== E().TASK_KIND.RESULT_ACK);
    /* `networkTasks` raises its own register for the same two facts —
       `critical-unacknowledged` from the results and `result-acknowledgement`
       from the tasks. Both are already rows above, built straight from the
       results with severity split out, so admitting them here prints one fact
       twice under two different names. Measured on the register: potassium 6.4
       appeared as a critical row AND as an "overdue" row directly beneath it. */
    const DUP = ["critical-unacknowledged", "result-acknowledgement"];
    const stored = E().openTasks ? E().openTasks(d.tasks, at) : [];
    const net = globalThis.NET && globalThis.NET.networkTasks
      ? globalThis.NET.networkTasks({ ...ctx, patientId: d.patient && d.patient.id }, at)
          .filter((x) => DUP.indexOf(x.kind) === -1) : [];
    const all = [...derived, ...stored, ...net].map((x) => ({
      kind: x.kind,
      overdue: x.overdue === true || (E().isOverdue ? E().isOverdue(x, at) : false),
      label: x.about || loopKindLabel(x.kind, 1),
      detail: x.dueAt ? (ar() ? `موعدها ${dateWord(x.dueAt)}` : `due ${dateWord(x.dueAt)}`)
                      : T("بلا موعد مسجّل", "no due date recorded"),
    }));
    const by = new Map();
    for (const x of all) { if (!by.has(x.kind)) by.set(x.kind, []); by.get(x.kind).push(x); }
    for (const list of by.values()) list.sort((a, b) => (b.overdue - a.overdue));
    return [...by.entries()];
  }

  /* ---------- «رجعت» — LENDING'S FOURTH STATE ----------
     A loan that came back, and what changed while it was out. This is the atomic
     unit of continuity of care in a country where care breaks at the counter
     between two providers who never speak.

     THE JOIN, and its three binding conditions. Grouping a write-back under a
     loan is a conjunction of two RECORDED facts — an event whose `actorId`
     equals that share's `granteeId`, at a time inside the window the share was
     active. It is not a claim about clinical content.
       1 · the row states its own basis in words, always;
       2 · it asserts CUSTODY ("this changed while X held your record") and never
           CAUSATION ("X changed this because of Y");
       3 · where `actorId` is absent it says that something changed and that the
           actor is UNRECORDED — it never names the grantee by assumption. */
  function loanBack(share, tl) {
    const from = E().ms(share.grantedAt), to = E().ms(share.revokedAt || share.expiresAt);
    if (from == null || to == null) return null;
    const win = tl.filter((e) => { const x = E().ms(e.at); return x != null && x >= from && x <= to; });
    const named = win.filter((e) => e.actorId && e.actorId === share.granteeId);
    const anon = win.filter((e) => !e.actorId);
    return { named, anon, empty: !named.length && !anon.length };
  }

  function loanRow(share, tl, at, prevIso) {
    const b = loanBack(share, tl);
    const who = esc(share.granteeName || share.granteeId);
    const k = (share.scopes || []).length;
    const revoked = C().shareState(share, at) === C().SHARE_STATE.REVOKED;
    const back = !b ? "" : b.empty
      ? `<div class="reg-back"><div class="reg-why">${T("ما كتب أحد شي وهو ماسك أوراقك",
          "nobody wrote anything while your sheets were out")}</div></div>`
      : `<div class="reg-back">
          ${b.named.length ? `<div class="reg-why">${ar() ? `كتبها ${who} وهو ماسك أوراقك`
            : `written by ${who} while holding your sheets`}</div>` : ""}
          ${b.named.map((e) => `<div>— <b>${esc(evtWord(e.type))}</b> ${esc(e.title || "")}</div>`).join("")}
          ${b.anon.length ? `<div class="reg-why">${ar()
            ? `و${countAr(b.anon.length, ["تغيير", "تغييران", "تغييرات", "تغييراً"])} صار بنفس المدة، وما مسجّل منو غيّره`
            : `and ${b.anon.length} change(s) in the same window, actor unrecorded`}</div>` : ""}
        </div>`;
    return regRow({ gut: gutDate(share.grantedAt, prevIso), wide: !!back,
      what: ar() ? `سلّمت ${countAr(k, ["ورقة", "ورقتين", "أوراق", "ورقة"])} لـ${who}`
                 : `you handed ${k} sheet(s) to ${who}`,
      sub: revoked ? T("ألغيتها بنفسك", "you revoked it yourself")
        : ar() ? `رجعت${b && !b.empty ? "، ومعها تغييرات" : " بلا تغييرات"}`
               : `returned${b && !b.empty ? " with changes" : " with no changes"}`,
      back });
  }

  const evtWord = (type) => ({
    diagnosis: T("تشخيص", "diagnosis"), "medication-start": T("دواء", "medicine started"),
    "medication-stop": T("إيقاف دواء", "medicine stopped"), result: T("نتيجة", "result"),
    imaging: T("أشعة", "imaging"), procedure: T("عملية", "procedure"),
    encounter: T("زيارة", "visit"), referral: T("إحالة", "referral"),
    admission: T("دخول", "admission"), discharge: T("خروج", "discharge"),
    "follow-up": T("مراجعة", "follow-up"),
  }[type] || type);

  /* ---------- BELOW THE BOUNDARY ----------
     Time coarsens as it recedes, and every tier is pure counting over
     `buildTimeline` — nothing is inferred:
       <= 90 days   every event at minSignificance 2, by day
       90d - 2y     visits and major events only (minSignificance 3)
       > 2y         ONE ROW PER YEAR, expandable
     A 20-year record with twelve open items renders as about thirty rows, not
     four hundred. */
  function historyRows(d, at) {
    const tl0 = E().buildTimeline({ ...d, patientId: d.patient && d.patient.id }, { minSignificance: 2 });
    /* ONE FACT, ONE SIDE OF THE BOUNDARY. `buildTimeline` deliberately carries
       every abnormal result, and the ones nobody has acknowledged are already
       rows above «الآن» — they have not ended. Printing them under «انتهى» too
       says the opposite of what the register is for. Matched on the pair the
       timeline actually exposes (time + title), because a timeline event does
       not carry the result's id. */
    const openKey = new Set((d.results || [])
      .filter((x) => E().isAbnormal(x) && !x.acknowledgedBy)
      .map((x) => `${x.effectiveAt}|${x.display || x.code}`));
    const tl = tl0.filter((e) => !(e.type === E().EVT.RESULT
      && openKey.has(`${e.at}|${e.title}`)));
    const ended = (d.shares || []).filter((sh) => C().shareState(sh, at) !== C().SHARE_STATE.ACTIVE);
    const items = [
      ...tl.map((e) => ({ at: e.at, sig: e.significance || 0, kind: "evt", e })),
      ...ended.map((sh) => ({ at: sh.grantedAt, sig: 4, kind: "loan", sh })),
    ].filter((x) => x.at).sort((a, b) => E().ms(b.at) - E().ms(a.at));

    const recent = [], mid = [], deep = new Map();
    for (const it of items) {
      const age = daysAgo(it.at, at);
      if (age <= 90) recent.push(it);
      else if (age <= 730) { if (it.kind === "loan" || it.sig >= 3 || it.e.type === E().EVT.ENCOUNTER) mid.push(it); }
      else { const y = rYr(it.at); if (!deep.has(y)) deep.set(y, []); deep.get(y).push(it); }
    }

    let prev = null;
    const draw = (it) => {
      const gut = gutDate(it.at, prev); prev = it.at;
      if (it.kind === "loan") return loanRow(it.sh, tl, at, null);
      const e = it.e;
      return regRow({ gut,
        what: `${esc(evtWord(e.type))} — ${esc(e.title || "")}`,
        sub: [e.detail ? esc(e.detail) : "", e.flag && e.flag !== "normal"
          ? `<span class="st st-t">${esc(flagWord(e.flag))}</span>` : ""].filter(Boolean).join(" ") });
    };
    const yearRow = (y, list) => `<details class="reg-row agg"><summary>
        <div class="reg-gut"><b>${n(y)}</b></div>
        <div class="reg-bd"><div class="reg-sub">${esc(yearTally(list))}
          <span class="more">${T("— اضغط تشوفها", "— tap to open")}</span></div></div></summary>
        <div class="reg-kids">${list.map((it) => `<div>${it.kind === "loan"
          ? T("تسليم أوراق", "a handover") : `${esc(evtWord(it.e.type))} — ${esc(it.e.title || "")}`}
          — ${dateWord(it.at)}</div>`).join("")}</div></details>`;

    return `${recent.map(draw).join("")}${mid.map(draw).join("")}${
      [...deep.entries()].sort((a, b) => b[0] - a[0]).map(([y, l]) => yearRow(y, l)).join("")}`;
  }

  const YR_FORMS = {
    loan: [["تسليم", "تسليمان", "تسليمات", "تسليماً"], "handover(s)"],
    encounter: [["زيارة", "زيارتان", "زيارات", "زيارة"], "visit(s)"],
    result: [["نتيجة", "نتيجتان", "نتائج", "نتيجة"], "result(s)"],
    diagnosis: [["تشخيص", "تشخيصان", "تشخيصات", "تشخيصاً"], "diagnosis/es"],
    procedure: [["عملية", "عمليتان", "عمليات", "عملية"], "procedure(s)"],
    imaging: [["أشعة", "صورتان", "صور أشعة", "صورة أشعة"], "imaging study/ies"],
    referral: [["إحالة", "إحالتان", "إحالات", "إحالة"], "referral(s)"],
    "medication-start": [["دواء", "دواءان", "أدوية", "دواءً"], "medicine(s) started"],
    "medication-stop": [["إيقاف دواء", "إيقافان", "إيقافات", "إيقافاً"], "medicine(s) stopped"],
  };
  function yearTally(list) {
    const c = {};
    for (const it of list) { const k = it.kind === "loan" ? "loan" : it.e.type; c[k] = (c[k] || 0) + 1; }
    const parts = [];
    for (const [k, v] of Object.entries(c)) {
      const w = YR_FORMS[k];
      if (!w) { parts.push(ar() ? `${v} ${evtWord(k)}` : `${v} ${evtWord(k)}`); continue; }
      parts.push(ar() ? stripTags(countAr(v, w[0])) : `${v} ${w[1]}`);
    }
    return parts.join(ar() ? "، " : ", ");
  }

  const flagWord = (f) => ({ high: T("مرتفع", "high"), low: T("منخفض", "low"),
    critical: T("حرجة", "critical"), unknown: T("بلا مدى مرجعي", "no reference range") }[f] || f);

  /* ---------- THE SCREEN ---------- */
  globalThis.screenRegister = function screenRegister() {
    const d = store();
    if (!d.patient) return screenRecordSetup("booklet");
    const at = now();
    const p = d.patient;
    const prof = R().patientProfile(p, d, at);
    const pid = regProblem();
    const thread = pid ? (E().careThreads({ ...d, patientId: p.id }, { now: at }).threads
      .find((x) => x.id === pid) || null) : null;
    const dv = thread ? problemView(d, thread) : d;
    const open = openRows(dv, at);
    const pendingReq = (d.requests || []).filter((r) => C().requestState(r, at) === C().REQ_STATE.PENDING);
    const bg = d.bloodGroup;

    return `${netBanner()}<section class="reg">
      <!-- THE COVER. What a stranger holding this phone needs, and the only part
           that must be legible with the radio off. A band, not a hero. -->
      <div class="rowb pad" style="padding-block:12px 10px;border-bottom:1px solid var(--dial-line)">
        <div>
          <div class="d3" style="font-size:19px">${esc(prof.name)}</div>
          <div class="t3">${prof.age != null ? n(prof.age) + " " + T("سنة", "y")
            : T("العمر غير مسجّل", "age not recorded")} · ${esc(R().sexLabel(prof.sex, ar()))}
            · ${bg ? T("فصيلة الدم ", "blood group ") + `<span class="num">${esc(bg)}</span>`
                   : `<span class="st st-e">${T("فصيلة الدم غير مسجّلة", "blood group not recorded")}</span>`}</div>
        </div>
        <button class="b-g st-e" onclick="openEmergency()" style="font-size:12.5px">${
          T("بطاقة الطوارئ", "Emergency card")}</button>
      </div>

      ${syncBanner()}
      ${pendingReq.map((rq) => `<a class="note note-w" href="#/record/request/${esc(rq.id)}">
        ${icon("seal")}<div><b>${esc(rq.requester.name || rq.requester.id)}</b> ${
        T("يطلب الاطّلاع على ملفك", "is asking to see your record")}</div></a>`).join("")}

      ${thread ? `<div class="dband-note" style="padding-block:8px">
        <b>${T("الدفتر لمشكلة وحدة", "The booklet, one problem")}: ${esc(thread.title)}</b> —
        ${T("بس اللي مربوط بها. اللي ما مربوط ما يظهر، وهذا ما يعني إنه ما موجود.",
            "only what is linked to it. What is not linked does not appear, which does not mean it is absent.")}
        <a class="b-g" href="#/">${T("رجّع كل شي", "Show everything")}</a></div>` : ""}

      <section aria-labelledby="reg-open">
        <h2 class="reg-hdr" id="reg-open"><span>${T("مفتوح الآن", "Open now")}</span>
          <span class="reg-hdr-sub">${open.length
            ? T("أخطرها فوق", "the most dangerous first")
            : T("ما في شي مفتوح", "nothing is open")}</span></h2>
        ${open.join("")}
      </section>

      <section aria-labelledby="reg-done">
        <h2 class="reg-hdr reg-hdr--done" id="reg-done"><span>${T("انتهى", "Ended")}</span>
          <span class="reg-hdr-sub">${T("من الأحدث للأقدم", "newest first")}</span></h2>
        ${historyRows(dv, at) || `<div class="reg-row"><div class="reg-gut"></div>
          <div class="reg-bd"><div class="reg-sub">${T(
            "ما صار شي بعد. أول زيارة تسلّم فيها أوراقك تظهر هنا.",
            "Nothing yet. The first visit you hand sheets to will appear here.")}</div></div></div>`}
      </section>

      <div class="pad" style="padding-block:18px 4px">
        <div class="dock-acts">
          <a class="btn" href="#/record/share">${T("سلّم أوراقاً لطبيب", "Hand sheets to a clinician")}</a>
          <button class="b b-s" onclick="regProblemSheet()">${
            T("اقرأه لمشكلة وحدة", "Read it for one problem")}</button>
        </div>
        <a class="b-g" style="margin-top:12px;display:block" href="#/record">${
          T("شوف أوراقك كلها", "See all your sheets")}</a>
      </div>
    </section>${nav("booklet")}`;
  };


  /* ============================================================
     THE DECK — the booklet by sheet
     ============================================================
     `CONSENT.SCOPE` is already this product's real information architecture and
     no screen had ever used it. The scopes were written to be things a person
     can picture — "my allergies and my current medicines" — and `SCOPE_LABEL`
     already carries their Arabic. A record whose sections ARE the units of
     consent means a patient learns the sharing model by reading their own
     record, and the share flow stops being a separate thing beside it.

     THERE IS NO NEUTRAL BAND. The first draft of this screen had one called
     «أوراقك», and a bucket named after nothing is where storage nouns hide:
     «الأدوية الحالية / التحاليل / المشاكل الصحية النشطة» under a neutral
     heading is a table of contents with a better font, which is exactly what
     this replaced. Every sheet now sits under a statement about what it DOES,
     and the five statements are derived exhaustively from consent.js rather
     than named by a human:

       SAFETY_FLOOR                     travels even unticked
       EMERGENCY_SCOPES − SAFETY_FLOOR  opens to break-glass without asking you
       ALL_SCOPES − the above           travels only if you hand it over
       SENSITIVE_CLASSES               never in an ordinary handover
       gapStatements                    not scopes at all — unanswered questions

     The second band is new information no screen in this product has ever
     shown: there are four scopes an ambulance crew can open WITHOUT ASKING,
     tier-1 break-glass, sixty minutes. That is the most consequential fact
     about a patient's own record and it has been sitting in `EMERGENCY_SCOPES`
     unrendered.

     The seven scopes in the third band all behave identically, so they collapse
     behind ONE behavioural row rather than each taking a top-level line. The
     nouns are leaves, not the spine, and none of them is ever read without the
     behaviour that governs it.
     ============================================================ */

  /* What each scope's sheet holds, and the route that opens it. Counts come from
     the record; the ROUTE is an existing one in every case — the deck changed
     the doorway, not the room. */
  function scopeSheet(scope, d, at) {
    const S_ = C().SCOPE;
    const prof = R().patientProfile(d.patient, d, at);
    const map = {
      [S_.SUMMARY]: { href: "#/record/vitals",
        c: T("مشتقّة من السجل، ما أحد يكتبها — وفيها آخر قياساتك",
             "derived from the record, authored by nobody — carries your latest measurements") },
      [S_.ALLERGIES]: { href: "#/record/allergies", k: (d.allergies || []).length,
        forms: [["حساسية واحدة", "حساسيتان", "حساسيات", "حساسية"], "allergy/ies"] },
      [S_.MEDICATIONS]: { href: "#/record/medications", k: prof.currentMedications,
        forms: [["دواء واحد", "دواءان", "أدوية", "دواءً"], "medicine(s)"] },
      [S_.CONDITIONS]: { href: "#/record/conditions", k: prof.activeConditions,
        forms: [["مشكلة نشطة", "مشكلتان نشطتان", "مشاكل نشطة", "مشكلة نشطة"], "active condition(s)"] },
      [S_.LABS]: { href: "#/record/labs", k: (d.results || []).filter((x) => x.value != null).length,
        forms: [["نتيجة", "نتيجتان", "نتائج", "نتيجة"], "result(s)"] },
      [S_.IMAGING]: { href: "#/record/documents", k: (d.imaging || []).length,
        forms: [["تقرير أشعة", "تقريران", "تقارير أشعة", "تقرير أشعة"], "imaging report(s)"] },
      [S_.DOCUMENTS]: { href: "#/record/documents", k: (d.documents || []).length,
        forms: [["مستند", "مستندان", "مستندات", "مستنداً"], "document(s)"] },
      [S_.PROCEDURES]: { href: "#/record/procedures", k: (d.procedures || []).length,
        forms: [["عملية", "عمليتان", "عمليات", "عملية"], "procedure(s)"] },
      [S_.ENCOUNTERS]: { href: "#/record/visits", k: (d.encounters || []).length,
        forms: [["زيارة", "زيارتان", "زيارات", "زيارة"], "visit(s)"] },
      [S_.IMMUNIZATIONS]: { href: "#/record/immunizations", k: prof.immunizations,
        forms: [["تطعيم", "تطعيمان", "تطعيمات", "تطعيماً"], "immunization(s)"] },
      [S_.TIMELINE]: { href: "#/record/timeline",
        c: T("كل شي بترتيب الوقت", "everything, in time order") },
    }[scope] || { href: "#/record" };
    const count = map.forms
      ? (ar() ? stripTags(countAr(map.k || 0, map.forms[0])) : `${map.k || 0} ${map.forms[1]}`)
      : null;
    return { href: map.href, count, note: map.c || null, empty: map.forms ? !map.k : false };
  }

  /* When this sheet last travelled, and to whom. This is what turns a sheet row
     from an inventory line into a custody record — the difference between a
     table of contents and this screen. */
  function lastOut(scope, d, at) {
    const out = (d.shares || []).filter((sh) => (sh.scopes || []).indexOf(scope) !== -1)
      .sort((a, b) => E().ms(b.grantedAt) - E().ms(a.grantedAt));
    if (!out.length) return { text: T("ما راحت من قبل", "has never travelled"), live: false };
    const sh = out[0];
    const who = esc(sh.granteeName || sh.granteeId);
    if (C().isShareActive(sh, at)) {
      return { text: ar() ? `عند ${who} الآن — ${leftLabel(sh.expiresAt, at)}`
                          : `with ${who} now — ${leftLabel(sh.expiresAt, at)}`, live: true };
    }
    return { text: ar() ? `آخر مرة راحت ${dateWord(sh.grantedAt)} مع ${who}`
                        : `last travelled ${dateWord(sh.grantedAt)} with ${who}`, live: false };
  }

  function sheetRow(scope, d, at, opts) {
    const o = opts || {};
    const info = scopeSheet(scope, d, at);
    const cust = lastOut(scope, d, at);
    if (info.empty && !o.keepEmpty) return "";
    const bits = [info.count, info.note, cust.text].filter(Boolean);
    return `<a class="sheet-row ${o.fixed ? "sheet-row--fixed" : ""} ${
      cust.live ? "sheet-row--out" : ""}" href="${info.href}">
      <span class="sh-t">${esc(C().scopeLabel(scope, S.lang))}${cust.live
        ? ` <span class="st st-t">${T("معارة الآن", "out on loan")}</span>` : ""}</span>
      <span class="sh-c">${bits.join(ar() ? " — " : " — ")}</span></a>`;
  }

  globalThis.screenDeck = function screenDeck() {
    const d = store();
    if (!d.patient) return screenRecordSetup();
    const at = now();
    const p = d.patient;
    const prof = R().patientProfile(p, d, at);
    const S_ = C().SCOPE;
    const floor = C().SAFETY_FLOOR;
    const emerg = C().EMERGENCY_SCOPES.filter((x) => floor.indexOf(x) === -1);
    const byHand = C().ALL_SCOPES.filter((x) => floor.indexOf(x) === -1 && emerg.indexOf(x) === -1);
    const bgOpen = (d.accessLog || []).filter((r) => r.basis === "BREAK_GLASS");
    const gaps = assistGaps(d, at);
    const handRows = byHand.map((sc) => sheetRow(sc, d, at)).filter(Boolean);

    return `${header({ back: true, title: T("ملفي الصحي", "My health record") })}
    <section>
      <div class="pad" style="padding-block:10px 12px;border-bottom:1px solid var(--dial-line)">
        <div class="d3" style="font-size:19px">${esc(prof.name)}</div>
        <div class="t3">${T("أوراق دفترك، مرتّبة على شكل ما تتصرّف — لا على شكل ما هي",
          "your booklet's sheets, ordered by how they behave — not by what they are")}</div>
      </div>

      <div class="dband"><h2>${T("تروح حتى لو ما اخترتها", "Travels even if you don't pick it")}</h2>
        <span class="dband-k">${ar() ? countAr(floor.length, ["ورقة", "ورقتان", "أوراق", "ورقة"]) : floor.length}</span></div>
      <div class="dband-note">${T(
        "الطبيب اللي يشوف ملفك بلا حساسيتك أخطر من طبيب ما يشوف الملف أبداً، لأنه يوصف وهو يحسب إنه تأكّد.",
        "A clinician who sees your record without your allergies is more dangerous than one who sees nothing — they prescribe believing they checked.")}</div>
      ${floor.map((sc) => sheetRow(sc, d, at, { fixed: true, keepEmpty: true })).join("")}

      <div class="dband"><h2>${T("تنفتح بالطوارئ بلا ما تسألك", "Opens in an emergency without asking you")}</h2>
        <span class="dband-k">${ar() ? countAr(emerg.length, ["ورقة", "ورقتان", "أوراق", "ورقة"]) : emerg.length}</span></div>
      <div class="dband-note">${T(
        `هذي الأوراق يفتحها المسعف بلا موافقتك لمدة ${countAr(C().EMERGENCY_MINUTES.critical, ["دقيقة", "دقيقتين", "دقائق", "دقيقة"])}، ويوصلك إشعار.`,
        `A responder can open these without your consent for ${C().EMERGENCY_MINUTES.critical} minutes, and you are notified.`)}
        ${bgOpen.length ? ` ${ar() ? `صار ${countAr(bgOpen.length, ["مرة", "مرتين", "مرات", "مرة"])}، آخرها ${dateWord(bgOpen[0].at)}.`
          : `It has happened ${bgOpen.length} time(s), last ${dateWord(bgOpen[0].at)}.`}`
          : ` ${T("ما صار لحد الآن.", "It has not happened yet.")}`}</div>
      ${emerg.map((sc) => sheetRow(sc, d, at, { keepEmpty: true })).join("")}

      ${handRows.length ? `<div class="dband"><h2>${T("ما تروح إلا إذا سلّمتها بيدك",
        "Travels only if you hand it over yourself")}</h2>
        <span class="dband-k">${ar() ? countAr(handRows.length, ["ورقة", "ورقتان", "أوراق", "ورقة"]) : handRows.length}</span></div>
      <div class="dband-note">${T("الطوارئ ما توصلها. إذا ما سلّمتها إنت، ما أحد يشوفها.",
        "Break-glass does not reach these. If you do not hand them over, nobody sees them.")}</div>
      <details class="grp"><summary><span>${ar()
        ? `افتح ${countAr(handRows.length, ["الورقة", "الورقتين", "الأوراق", "الورقة"])}`
        : `Open the ${handRows.length} sheets`}</span>
        <span class="sh-c">${byHand.slice(0, 3).map((sc) => esc(C().scopeLabel(sc, S.lang))).join(ar() ? "، " : ", ")}…</span>
      </summary>${handRows.join("")}</details>` : ""}

      <div class="dband"><h2>${T("ما تروح بأي تسليم عادي", "Never travels in an ordinary handover")}</h2></div>
      <div class="dband-note">${T(
        "المواد الحسّاسة تحتاج موافقة منفصلة منك كل مرة، وولا الطوارئ تفتحها إلا بتصعيد ثاني مكتوب سببه.",
        "Sensitive material needs a separate consent from you every time, and break-glass cannot open it without a second escalation with its own stated reason.")}</div>
      <div class="hole"><span class="sh-t">${T("المواد الحسّاسة", "Sensitive material")}
        — <b>${T("مقفلة", "locked")}</b></span>
        <a class="b-g" href="#/record/share">${T("موافقة منفصلة", "Separate consent")}</a></div>

      ${gaps.length ? `<div class="dband"><h2>${T("ما سألك عنها أحد", "Nobody has asked you for these")}</h2>
        <span class="dband-k">${n(gaps.length)}</span></div>
      ${gaps.map((g) => `<a class="sheet-row" href="${g.href}">
        <span class="sh-t">${esc(g.title)}</span><span class="sh-c">${esc(g.text)}</span></a>`).join("")}` : ""}

      <div class="pad" style="padding-block:18px 4px">
        <div class="dock-acts">
          <a class="btn" href="#/record/share">${T("سلّم أوراقاً لطبيب", "Hand sheets to a clinician")}</a>
          <a class="b b-s" href="#/">${T("شوف الدفتر بالتاريخ", "See the booklet by date")}</a>
        </div>
      </div>
    </section>${nav("sheets")}`;
  };

  /* `gapStatements` finally rendered. Absence is a question somebody has to
     answer, not an empty row — and «not recorded» is never «none». Each gap
     carries the route that answers it, so the band is a worklist. */
  function assistGaps(d, at) {
    const A = globalThis.ASSIST;
    const out = [];
    if (!d.bloodGroup) out.push({ title: T("فصيلة الدم", "Blood group"),
      text: T("غير مسجّلة. لا فارغة ولا معروفة.", "Not recorded. Neither empty nor known."),
      href: "#/record/profile" });
    if (!(d.patient && d.patient.emergencyContact)) out.push({
      title: T("جهة اتصال للطوارئ", "Emergency contact"),
      text: T("ما في واحدة مسجّلة", "none recorded"), href: "#/record/profile" });
    if (!(d.allergies || []).length) out.push({ title: T("الحساسية", "Allergies"),
      text: T("ما مسجّل شي — وهذا لا يعني إنك بلا حساسية", "nothing recorded — which does not mean you have none"),
      href: "#/record/add/allergy" });
    if (!A) return out;
    for (const st of A.gapStatements(d, at, S.lang)) {
      if (st.tier !== A.TIER.FACT) continue;
      if (st.gap === "allergies" || st.gap === "bloodGroup") continue;
      out.push({ title: gapTitle(st.gap), text: stripTags(ar() ? st.ar : st.en),
        href: st.gap === "unverified-claims" ? "#/record/inbox"
          : st.gap === "unconfirmed-medications" ? "#/record/medications" : "#/record/conditions" });
    }
    return out;
  }
  const gapTitle = (g) => ({
    "stale-condition": T("مشكلة ما راجعها أحد", "A condition nobody has reviewed"),
    "unconfirmed-medications": T("دواء ما أكّده أحد", "A medicine nobody has reconfirmed"),
    "unverified-claims": T("معلومات من مستنداتك", "Claims read out of your documents"),
  }[g] || T("ناقص", "Missing"));


  /* ============================================================
     RESULTS — meaning before the number, and the tiers kept apart
     ============================================================
     `assist.js` has produced tiered, sourced statements since the epistemic
     layer shipped and NOTHING rendered them. This is where they land.

     Four rules:
     1 · FACT / INTERPRETATION / SUGGESTION are never interleaved and never
         restyled into each other. A reader who stops after FACT loses nothing
         true.
     2 · A REFUSED INTERPRETATION OCCUPIES ITS SLOT VISIBLY. When
         `trendStatements` returns early on `mixedLabs`/`mixedUnits`, the
         interpretation block is not absent — it is present and it says why it is
         empty. An absent block reads as "nothing to say"; a refusal reads as
         "we will not say it", and those are opposite meanings. This is the most
         important rendering decision on the screen.
     3 · An INTERPRETATION always prints the RULE it applied, so a clinician can
         disagree with the rule rather than with an oracle.
     4 · Geometry is demoted BY AUDIENCE, not by tap. The first design of this
         screen pushed the reference-range scale behind a disclosure for both
         readers. Testing changed the answer: a bar is answered preattentively
         and a sentence is not, so taking it away costs a clinician reading eight
         results the one glance they wanted. The patient gets the sentence first;
         the clinician gets value + geometry on one scannable row. The epistemic
         tiers did not move.
     ============================================================ */

  /* An ISO date inside Arabic prose is a §5 hazard: unisolated, «2025-08-03»
     renders «03-08-2025». The domain writes these strings and this layer must
     not rewrite their content — so it isolates them without touching them. */
  const isoWrap = (txt) => esc(String(txt || ""))
    .replace(/\d{4}-\d{2}-\d{2}/g, (m) => `<span class="num">${m}</span>`);

  const TIER_CLS = { FACT: "", INTERPRETATION: "", SUGGESTION: "" };

  function tierBlock(label, items, opts) {
    const o = opts || {};
    if (!items.length && !o.refusal) return "";
    return `<div class="stmt ${o.stop ? 'stmt--stop' : ''}">
      <div class="stmt-lb">${esc(label)}</div>
      ${items.map((st) => `<p>${isoWrap(ar() ? st.ar : st.en)}</p>${
        st.rule ? `<div class="stmt-rule">${T("القاعدة", "the rule")}: ${esc(st.rule)}</div>` : ""}${
        (st.sourceIds || []).length ? `<div class="stmt-ev">${T("المصدر", "source")}: ${
          ar() ? countAr(st.sourceIds.length, ["سطر بالسجل", "سطران بالسجل", "أسطر بالسجل", "سطراً بالسجل"])
               : `${st.sourceIds.length} record entr(ies)`}</div>` : ""}`).join("")}
      ${o.note ? `<div class="stmt-rule">${esc(o.note)}</div>` : ""}</div>`;
  }

  /* The patient's reading of one series. */
  function seriesPatient(d, code, at) {
    const A = globalThis.ASSIST;
    const t = E().trend(d.results, code);
    if (!A) return trendSeries(t, {});
    const sts = A.trendStatements(d, code, at, S.lang);
    const facts = sts.filter((x) => x.tier === A.TIER.FACT && !x.blocksInterpretation);
    const blocked = sts.find((x) => x.blocksInterpretation);
    const interp = sts.filter((x) => x.tier === A.TIER.INTERPRETATION);
    const sugg = sts.filter((x) => x.tier === A.TIER.SUGGESTION);
    return `<div class="panel-h">${esc(t.display || code)}</div>
      ${tierBlock(T("حقيقة", "Fact"), facts)}
      ${blocked
        /* THE REFUSAL, occupying its slot. */
        ? tierBlock(T("ما نقدر نفسّر", "We will not interpret this"), [blocked], { stop: true,
            note: T("ولذلك ما في تفسير ولا اقتراح تحت هذا السطر.",
                    "So there is no interpretation and no suggestion below this line.") })
        : `${tierBlock(T("تفسير", "Interpretation"), interp)}
           ${tierBlock(T("اقتراح", "Suggestion"), sugg, {
             note: T("ما هو تشخيص ولا وصفة — اقتراح تنظر به.",
                     "Not a diagnosis and not a prescription — something to look at.") })}`}
      <div class="ser">${trendSeries(t, {})}</div>`;
  }

  globalThis.screenResults = function screenResults() {
    const d = store();
    if (!d.patient) { location.hash = "#/record"; return ""; }
    const at = now();
    const done = (d.results || []).filter((x) => x.value != null);
    const pending = (d.results || []).filter((x) => x.status === "pending");
    const codes = [...new Set(done.map((x) => x.code).filter(Boolean))];
    const unjudge = E().unjudgeableResults ? E().unjudgeableResults(done) : [];

    return page(T("التحاليل", "Lab results"),
      `${pending.length ? `<div class="note note-w">${icon("clock")}<div><b>${T("معلّقة", "Pending")}</b>
        <div class="t3" style="margin-top:4px">${pending.map((x) => esc(x.display || x.code)).join(" · ")}</div></div></div>` : ""}

      ${unjudge.length ? `<div class="stmt stmt--stop" style="margin-top:12px">
        <div class="stmt-lb">${T("وصلت بلا مدى مرجعي", "Arrived with no reference range")}</div>
        <p>${T("هذي القيم وصلت بلا مدى مرجعي من المختبر، فما نقدر نحكم عليها — لا طبيعية ولا غير طبيعية.",
               "These values arrived with no reference range, so no verdict can be given — neither normal nor abnormal.")}</p>
        ${unjudge.map((x) => `<div class="stmt-ev">${esc(x.display || x.code)} ${
          measure(x.value, x.unit)} — ${dateWord(x.effectiveAt)}</div>`).join("")}</div>` : ""}

      ${codes.length ? codes.map((code) => seriesPatient(d, code, at)).join("")
        : (pending.length ? "" : empty(
          T("ما عندك تحاليل مسجّلة", "No lab results recorded"),
          `<p class="t3" style="margin-top:12px;line-height:1.7">${T(
            "نتائجك تجي من المختبر. إذا عندك ورقة تحليل قديمة، سجّلها حتى طبيبك يعرف إنها موجودة ويطلبها منك.",
            "Results arrive from the laboratory. If you hold an old printed result, note that you have it so your clinician knows to ask.")}</p>
          ${addButton("document", T("سجّل ورقة تحليل عندك", "Note a printed result you hold"))}`))}`,
      T("المعنى أولاً، والرقم دليله. ونتائج مختبرين مختلفين ما تنرسم بخط واحد واثق.",
        "Meaning first, the number as its evidence. And two laboratories do not draw one confident line."));
  };

  /* The clinician's reading of the same data: value and geometry on ONE row, at
     the density of somebody reading eight results in seven minutes. */
  function vrowFor(r) {
    const g = E().rangePosition(r);
    const flag = r.flag || E().flagResult(r);
    return `<div class="vrow">
      <div><div class="vrow-nm">${esc(r.display || r.code)}</div>
        <div class="vrow-fl">${g ? esc(flagWord(flag))
          : T("وصلت بلا مدى مرجعي — ما نقدر نحكم عليها", "no reference range — no verdict possible")}${
          r.acknowledgedBy ? "" : ` · <span class="st st-e">${T("ما أُقرّت", "unacknowledged")}</span>`}</div></div>
      <div class="vrow-geo"><span class="vrow-vv">${esc(String(r.value))}</span>${
        g ? `<span class="rng rng--row ${g.clamped ? "clamped" : ""}" aria-hidden="true"
              style="--lo:${g.lo}%;--hi:${g.hi}%;--at:${g.at}%">
            <i class="bnd"></i><i class="${g.clamped ? "at far" : g.out ? "at out" : "at"}"></i></span>` : ""}</div>
    </div>`;
  }


  /* ============================================================
     THE CLINICIAN'S FIRST PARTITION — ownership, before anything else
     ============================================================
     A clinician's question is not "what is unfinished in this record" but "what
     is unfinished THAT I MUST ACT ON IN THE NEXT SEVEN MINUTES". That is a
     question about ownership, and `deriveTasks` and `networkTasks` have carried
     an owner on every task since the closed-loop registers shipped — and
     nothing has ever rendered it. Ordering by danger within ownership is
     strictly better for somebody with seven minutes than ordering by danger
     alone: a critical result belonging to another named clinician still needs
     noting, but it does not need doing by the person in the room.

     THE HARD RULE THAT KEEPS THE PARTITION HONEST: a result whose flag is
     `critical` ALWAYS lands under «عليك أنت», with its real owner named in the
     line beneath. A critical result nobody acknowledged is everyone's, and a
     partition that could route one into "somebody else's problem" would be a
     partition that kills people. Same reasoning `networkTasks` uses when it
     makes a critical result due immediately rather than after a grace period.
     ============================================================ */
  function clinicianWork(d, me, at) {
    const mine = [], theirs = [];
    const push = (row) => (row.mine ? mine : theirs).push(row);
    const meId = me && me.id;

    for (const x of (d.results || []).filter((r) => E().isAbnormal(r) && !r.acknowledgedBy)) {
      const crit = (x.flag || E().flagResult(x)) === "critical";
      const owner = x.orderedBy || x.urgentContactId || null;
      push({
        /* critical is never anyone else's */
        mine: crit || !owner || owner === meId,
        crit,
        title: `${esc(x.display || x.code)} ${measure(x.value, x.unit)}${
          crit ? ` — ${T("حرجة", "critical")}` : ""}`,
        meta: [dateWord(x.effectiveAt),
          owner ? (owner === meId ? T("إنت طلبتها", "you ordered it")
                                  : (ar() ? `طلبها ${esc(owner)}` : `ordered by ${esc(owner)}`))
                : T("ما مسجّل منو طلبها", "orderer unrecorded")].join(ar() ? "، " : ", "),
        act: T("أقِرّ", "Acknowledge"), href: "#/record/labs",
      });
    }

    const ctx = { results: d.results || [], orders: d.orders || [], specimens: d.specimens || [],
      followUps: d.followUps || [], referrals: d.referrals || [], studies: d.studies || [] };
    const tasks = [
      ...(E().deriveTasks ? E().deriveTasks(ctx, at) : []).filter((x) => x.kind !== E().TASK_KIND.RESULT_ACK),
      ...(E().openTasks ? E().openTasks(d.tasks, at) : []),
      ...(globalThis.NET && globalThis.NET.networkTasks
        ? globalThis.NET.networkTasks({ ...ctx, patientId: d.patient && d.patient.id }, at)
          .filter((x) => ["critical-unacknowledged", "result-acknowledgement"].indexOf(x.kind) === -1) : []),
    ];
    for (const t of tasks) {
      const owner = t.ownerId || t.owner || null;
      push({ mine: !owner || owner === meId, crit: false,
        title: esc(t.about || loopKindLabel(t.kind, 1)),
        meta: [t.dueAt ? (ar() ? `موعدها ${dateWord(t.dueAt)}` : `due ${dateWord(t.dueAt)}`)
                       : T("بلا موعد مسجّل", "no due date recorded"),
          owner ? (owner === meId ? T("إنت طلبتها", "you ordered it")
                                  : (ar() ? `عند ${esc(owner)}` : `with ${esc(owner)}`))
                : T("ما مسجّل منو يملكها", "owner unrecorded"),
          (t.overdue || (E().isOverdue && E().isOverdue(t, at)))
            ? `<span class="st st-e">${T("متأخّرة", "overdue")}</span>` : ""].filter(Boolean).join(ar() ? "، " : ", "),
        act: owner && owner !== meId ? T("ذكّره", "Chase") : T("تابِع", "Follow up"),
        href: "#/record/timeline" });
    }
    /* Danger first inside each column. */
    const bySev = (a, b) => (b.crit - a.crit);
    return { mine: mine.sort(bySev), theirs: theirs.sort(bySev) };
  }

  const ownBlock = (id, title, list, filled) => `<section class="own" aria-labelledby="${id}">
    <h2 id="${id}"><span>${esc(title)}</span><span class="own-k">${n(list.length)}</span></h2>
    ${list.length ? list.map((x) => `<div class="task"${x.crit ? ' role="alert"' : ""}>
      <div><div class="task-t">${x.title}${x.crit
        ? ` <span class="st st-e">${T("ما أُقرّت", "unacknowledged")}</span>` : ""}</div>
        <div class="task-m">${x.meta}</div></div>
      <a class="b ${filled ? "b-p" : "b-s"} task-act" href="${x.href}">${esc(x.act)}</a>
    </div>`).join("")
      : `<div class="task"><div class="task-m">${T("ما في شي", "nothing here")}</div></div>`}
  </section>`;

  /* ---------- «خارج نطاق الإعارة» — THE SHAPE OF THE HOLES ----------
     Taken from the other exploration, and it fits this axis better than it fit
     its author's: when the record's own sections ARE the units of consent, a
     withheld scope is a first-class object rather than a missing div.

     A clinician who cannot see the labs must never be able to read that as
     "this patient has no labs". That is guardrail §3 — «not recorded» is never
     «none» — applied at the consent boundary, and it is the difference between
     a record with a hole in it and a record that is simply short. Each hole is
     NAMED, states that it was not lent rather than not present, and carries the
     lawful way to ask for it: `requestAccess`, scoped to that one scope. */
  function holesBlock(d, granted) {
    const missing = C().ALL_SCOPES.filter((s) => granted.indexOf(s) === -1);
    if (!missing.length) return "";
    return `<section class="own" aria-labelledby="holes"><h2 id="holes">
        <span>${T("خارج نطاق الإعارة", "Outside what was lent")}</span>
        <span class="own-k">${n(missing.length)}</span></h2>
      <div class="dband-note">${T(
        "هذي الأوراق ما سلّمها المريض لك. «ما سلّمها» مو «ما عنده» — قد تكون مليانة وقد تكون فارغة، وما نعرف.",
        "The patient did not lend you these. \"Not lent\" is not \"not present\" — they may be full or empty, and this screen does not know which.")}</div>
      <div class="holes-2">${missing.map((s) => `<div class="hole">
        <span class="hole-t"><b>${esc(C().scopeLabel(s, S.lang))}</b> — ${
          T("ما سُلّمت", "not lent")}</span>
        <button class="b b-s" onclick="clinicalRequestScope('${esc(s)}')">${T("اطلبها", "Ask for it")}</button>
      </div>`).join("")}</div></section>`;
  }

  /* One scope, one purpose, one request — through the same `requestAccess` the
     general request already uses. Nothing new is invented: the patient sees the
     same sentence the clinician wrote, on their own phone, and answers it. */
  globalThis.clinicalRequestScope = function clinicalRequestScope(scope) {
    const me = currentClinician();
    const d = store();
    if (!me || !d.patient) return;
    sheet(`<h3 class="d3">${T("اطلب", "Ask for")} ${esc(C().scopeLabel(scope, S.lang))}</h3>
      <p class="t3" style="margin-top:8px;line-height:1.7">${T(
        "المريض يقرأ سببك على هاتفه ويقرّر. اكتبه بكلماتك.",
        "The patient reads your reason on their own phone and decides. Write it in your own words.")}</p>
      <div class="fld" style="margin-top:12px"><label for="cs-purpose">${T("ليش تحتاجها؟", "Why do you need it?")}</label>
        <input id="cs-purpose" type="text" autocomplete="off"></div>
      <button class="btn" style="margin-top:14px"
        onclick="clinicalSendScopeRequest('${esc(scope)}')">${T("أرسل الطلب", "Send request")}</button>`);
  };

  globalThis.clinicalSendScopeRequest = function clinicalSendScopeRequest(scope) {
    const me = currentClinician();
    const d = store();
    const purpose = ((document.getElementById("cs-purpose") || {}).value || "").trim();
    const r = C().requestAccess({ id: uid("REQ"), patientId: d.patient.id, requester: me,
      scopes: [scope], purpose }, now());
    if (!r.ok) { toast(r.reason === "PURPOSE_REQUIRED"
      ? T("اكتب سبب الطلب", "State why") : T("ما قدرنا نرسل", "Could not send")); return; }
    mutate((x) => { x.requests.unshift(r.request); });
    closeSheet();
    toast(T("وصل الطلب لهاتف المريض", "The request reached the patient's phone"));
    render();
  };


  /* ============================================================
     THE STRAND — one problem's own story
     ============================================================
     This screen carries the register's ONE ACKNOWLEDGED WEAKNESS. A single
     interleaved time axis is the right front door and it is genuinely worse than
     problem-grouping at one job: a patient with four chronic problems has their
     diabetes story scattered through sixty rows. The 20-year test proves the
     register FITS; it does not prove a problem can be found inside it. So the
     strand has to be reachable, and it is reachable three ways — from the
     conditions sheet, from any diagnosis row, and as a FILTER ON THE REGISTER
     ITSELF (`#/?problem=…`), which is the important one: it lets the same one
     time axis be read as one problem's story rather than adding a second spine.

     Two things this screen does that a rail of dots did not:

     1 · IT IS ANCHORED BY WHY IT CANNOT CLOSE. `canCloseEpisode` carries the
         cancer-loss guard — an episode may not be declared finished while a
         specimen is unreported or a required follow-up is open — and it has
         only ever existed as a return value. A guard that fires into something
         nobody renders is not a guard. The blockers come FIRST, in words, so
         the screen answers "is this finished?" before "what happened?".
     2 · THE STORY IS VISIT-TO-VISIT DELTAS, not adjacency. Each dated block
         says what was ADDED, STOPPED, ORDERED or ANSWERED. Continuity reads as
         change. `significance` decides what is INCLUDED rather than how big a
         dot is, which is what `minSignificance` was built for.
     ============================================================ */

  const BLOCKER_WORD = (b) => {
    if (b === "SUPPLEMENTARY_PENDING") return T("تقرير إضافي ما وصل", "a supplementary report has not arrived");
    if (b === "NO_EPISODE") return T("ما في حلقة", "no episode");
    if (b === "ILLEGAL_TRANSITION") return T("حالتها ما تسمح بالإغلاق", "its state does not allow closing");
    if (String(b).startsWith("OPEN_TASK:")) return null;   /* named from the task itself */
    return String(b);
  };

  function strandBlockers(d, t, at) {
    if (!t.episode) return null;
    const ctx = { results: d.results || [], orders: d.orders || [], specimens: d.specimens || [],
      followUps: d.followUps || [], referrals: d.referrals || [] };
    const tasks = [...(E().deriveTasks ? E().deriveTasks(ctx, at) : []),
      ...(E().openTasks ? E().openTasks(d.tasks, at) : [])];
    const g = E().canCloseEpisode(t.episode, tasks);
    if (g.ok) return { ok: true, lines: [] };
    const lines = [];
    for (const b of g.blockers) {
      const w = BLOCKER_WORD(b);
      if (w) { lines.push(w); continue; }
      const id = String(b).slice("OPEN_TASK:".length);
      const task = tasks.find((x) => x.id === id);
      lines.push(task ? (task.about || loopKindLabel(task.kind, 1))
                      : T("مهمّة مفتوحة", "an open task"));
    }
    return { ok: false, lines };
  }

  /* One dated block per occasion, saying what CHANGED. Events are grouped by
     day because that is the grain a visit happens on; nothing is grouped across
     days, which would be inventing an encounter that is not in the record. */
  function strandDeltas(t) {
    const byDay = new Map();
    for (const e of t.events) {
      const k = String(e.at || "").slice(0, 10);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    }
    return [...byDay.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([day, evs]) => {
        const add = evs.filter((e) => [E().EVT.DIAGNOSIS, E().EVT.MED_START, E().EVT.PROCEDURE,
          E().EVT.IMAGING, E().EVT.ADMISSION].indexOf(e.type) !== -1);
        const stop = evs.filter((e) => [E().EVT.MED_STOP, E().EVT.DISCHARGE].indexOf(e.type) !== -1);
        const ask = evs.filter((e) => [E().EVT.REFERRAL, E().EVT.FOLLOWUP].indexOf(e.type) !== -1);
        const ans = evs.filter((e) => e.type === E().EVT.RESULT);
        const visit = evs.find((e) => e.type === E().EVT.ENCOUNTER);
        /* A dose is ONE run and must not break across a line: «500 ملغم» split
           over two lines separates a number from its unit, which is the hazard
           §5 names arriving by wrapping instead of by bidi. */
        const detailOf = (e) => {
          if (!e.detail) return "";
          const dose = e.type === E().EVT.MED_START || e.type === E().EVT.MED_STOP;
          return ` <span class="t3${dose ? " nw" : ""}">${esc(e.detail)}</span>`;
        };
        const line = (label, list) => list.length ? `<div class="delta-l"><span class="delta-k">${
          esc(label)}</span> <span>${list.map((e) => esc(e.title || evtWord(e.type))
            + detailOf(e)).join(ar() ? "، " : ", ")}</span></div>` : "";
        return `<div class="delta">
          <div class="delta-d">${gutDate(day, null)}</div>
          <div class="delta-b">
            ${visit ? `<div class="delta-h">${esc(visit.title || T("زيارة", "a visit"))}</div>` : ""}
            ${line(T("زاد", "added"), add)}
            ${line(T("وقّف", "stopped"), stop)}
            ${line(T("طلب", "asked for"), ask)}
            ${line(T("رجع", "came back"), ans)}
          </div></div>`;
      }).join("");
  }

  function screenStrand(d, id) {
    const at = now();
    const brief = R().preVisitBrief(d.patient, d, at);
    const { threads } = E().careThreads({ ...d, patientId: d.patient.id }, { now: at });
    const t = threads.find((x) => x.id === id);
    if (!t) {
      return page(T("مسار مشكلة", "A problem's story"),
        empty(T("ما لقينا هذا المسار", "That story is not in this record"),
          `<a class="b-g" style="display:inline-block;margin-top:12px" href="#/record/conditions">${
            T("شوف مشاكلك", "See your problems")}</a>`));
    }
    const blk = strandBlockers(d, t, at);
    const st = threadStanding(t, brief);
    const codes = [...new Set((d.results || [])
      .filter((r) => t.events.some((e) => e.type === E().EVT.RESULT && e.title === (r.display || r.code)))
      .map((r) => r.code).filter(Boolean))];
    const cid = (t.condition || {}).id || null;
    const eid = (t.episode || {}).id || null;
    const meds = (d.medications || []).filter((m) => m.status === "active"
      && ((cid && m.indicationId === cid) || (eid && m.episodeId === eid)));

    return page(esc(t.title),
      `<div class="th-head">
        <div class="rowb">
          <span class="st st-${t.state === E().EP_STATE.COMPLETED ? "v" : "t"}">${esc(epStateLabel(t.state))}</span>
          ${t.chronic ? `<span class="st st-q">${T("مزمن", "chronic")}</span>` : ""}
        </div>
        ${st ? `<div class="th-stand-big ${st.tone === "e" ? "is-alarm" : ""}">${st.text}</div>` : ""}
      </div>

      ${blk && !blk.ok ? `<section class="own" aria-labelledby="blk" style="margin-top:14px">
        <h2 id="blk"><span>${T("ما تنغلق لأن", "It cannot be closed because")}</span>
          <span class="own-k">${n(blk.lines.length)}</span></h2>
        ${blk.lines.map((l) => `<div class="task"><div><div class="task-t">${esc(l)}</div></div></div>`).join("")}
        <div class="dband-note">${T(
          "الحلقة ما تنغلق وفيها نسيج بلا تقرير أو مراجعة ما صارت — هذا هو الطريق اللي يضيع فيه تشخيص بين غرفة العمليات والعيادة.",
          "An episode may not close while a specimen is unreported or a follow-up is open — that is the route by which a diagnosis is lost between theatre and clinic.")}</div>
      </section>` : ""}
      ${blk && blk.ok ? `<div class="note note-v" style="margin-top:14px">${icon("seal")}<div>${
        T("ما في شي يمنع إغلاقها", "Nothing is blocking closure")}</div></div>` : ""}
      ${!blk ? `<div class="dband-note" style="padding-block:10px">${t.chronic
        ? T("مزمنة — ما تنغلق، تُراجَع. الحلقات اللي تنغلق هي اللي عندها بداية ونهاية، وهذي ما عندها.",
            "Chronic — it is not closed, it is reviewed. Only an episode with a beginning and an end can be closed, and this is not one.")
        : T("هذي مشكلة مسجّلة، مو حلقة رعاية بحالة — فما في شرط إغلاق يُفحص عليها.",
            "This is a recorded problem, not an episode with a state — so there is no closure condition to check.")}</div>` : ""}

      ${codes.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T("الاتجاه", "The trend")}</h2>
        <a class="b-g" href="#/record/labs">${T("كل التحاليل", "All results")}</a></div>
        ${codes.map((code) => `<div class="ser">${trendSeries(E().trend(d.results, code), {})}</div>`).join("")}
      </div>` : ""}

      ${meds.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${
        T("الأدوية لهذي المشكلة", "Medicines for this problem")}</h2></div>
        <div class="stack">${meds.map((m) => `<div class="rw"><div style="width:100%">
          <div class="rowb"><b>${esc(m.display)}</b>${m.dose
            ? `<bdi class="strength">${esc(m.dose)}</bdi>` : ""}</div>
          ${selfReported(m) ? `<div style="margin-top:5px">${selfReported(m)}</div>` : ""}
        </div></div>`).join("")}</div></div>` : ""}

      <div class="sec"><div class="sec-h"><h2 class="d3">${T("شنو تغيّر، ومتى", "What changed, and when")}</h2></div>
        <div class="deltas">${strandDeltas(t)}</div>
      </div>

      <div class="pad" style="padding-block:16px 4px">
        <a class="btn btn--2" href="#/?problem=${esc(id)}">${
          T("اقرأ الدفتر لهذي المشكلة وحدها", "Read the booklet for this problem alone")}</a>
      </div>`,
      T("مربوط بهذي المشكلة فقط. اللي ما مربوط بها ما يظهر هنا — وهذا ما يعني إنه ما موجود.",
        "Linked to this problem only. What is not linked does not appear here — which does not mean it does not exist."));
  }

  /* The filtered record: every list narrowed to the rows this problem's own keys
     claim. `careThreads` already recorded WHY each event belongs; this reuses
     that rather than re-deciding it, and a row with no link is simply absent —
     never reassigned to the nearest problem. */
  function problemView(d, t) {
    const cid = (t.condition || {}).id || null;
    const eid = (t.episode || {}).id || null;
    const mine = (x) => (cid && (x.conditionId === cid || x.indicationId === cid || x.id === cid))
      || (eid && x.episodeId === eid);
    return { ...d,
      results: (d.results || []).filter(mine),
      conditions: (d.conditions || []).filter((c) => c.id === cid || (eid && c.episodeId === eid)),
      medications: (d.medications || []).filter(mine),
      procedures: (d.procedures || []).filter(mine),
      imaging: (d.imaging || []).filter(mine),
      encounters: (d.encounters || []).filter(mine),
      referrals: (d.referrals || []).filter(mine),
      tasks: (d.tasks || []).filter((x) => eid && x.episodeId === eid),
      /* custody is never per-problem: a share is of the whole record */
      shares: [], carry: null, accessLog: [],
    };
  }

  /* ---------- the register, read as ONE PROBLEM ----------
     A filter on the one time axis, never a second spine. The join is the
     `conditionId` / `episodeId` a clinician actually set; an unlinked event does
     not appear, and the screen SAYS so rather than letting absence read as
     completeness. */
  const regProblem = () => {
    const qs = (location.hash.split("?")[1] || "");
    return new URLSearchParams(qs).get("problem");
  };
  globalThis.regProblemSheet = function regProblemSheet() {
    const d = store();
    const { threads } = E().careThreads({ ...d, patientId: d.patient.id }, { now: now() });
    sheet(`<h3 class="d3">${T("اقرأ الدفتر لمشكلة وحدة", "Read the booklet for one problem")}</h3>
      <p class="t3" style="margin-top:8px;line-height:1.7">${T(
        "نفس الدفتر، نفس الترتيب — بس اللي مربوط بالمشكلة اللي تختارها.",
        "The same booklet, the same order — only what is linked to the problem you pick.")}</p>
      <div class="stack-2" style="margin-top:12px">
        ${threads.length ? threads.map((t) => `<a class="rw" href="#/?problem=${esc(t.id)}"
          onclick="closeSheet()"><div style="width:100%">
          <div class="rowb"><b>${esc(t.title)}</b><span class="t3">${esc(epStateLabel(t.state))}</span></div>
        </div></a>`).join("")
        : `<p class="t3">${T("ما في مشكلة مربوطة بأحداث بعد.", "No problem has linked events yet.")}</p>`}
        <a class="b b-s" href="#/" onclick="closeSheet()">${T("رجّع كل شي", "Show everything again")}</a>
      </div>`);
  };

})();
