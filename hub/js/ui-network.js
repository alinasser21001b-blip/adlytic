/* ============================================================
   قريب · واجهات الشبكة — LAB · PHARMACY · IMAGING
   ============================================================
   The three actors that turn a record into a network. Each gets its OWN
   screen with its own vocabulary, not a filtered view of the doctor's — a
   lab technician and a pharmacist do different jobs and a shared "provider
   portal" serves neither.

   THE DESIGN CONSTRAINT THAT MATTERS MOST HERE IS NOT VISUAL.

   Each screen renders an ENVELOPE built by js/network.js, never the record.
   The lab screen physically cannot show a diagnosis because the object it
   was handed does not contain one. That is the difference between minimum
   necessary as a policy and minimum necessary as an architecture: the first
   is a promise a future contributor breaks by adding a field to a template,
   the second is a promise the data shape keeps.

   IRAQ, PRACTICALLY. These screens are used standing up, on a phone, in a
   room that may lose mains power mid-task. So: one job per screen, the
   destructive action always behind a reason field, and everything written
   through TRANSPORT so a cut costs the last tap rather than the last hour.
   ============================================================ */
(function () {
  "use strict";

  const E = () => globalThis.EMR;
  const R = () => globalThis.REC;
  const N = () => globalThis.NET;
  const now = () => Date.now();
  const ar = () => (typeof isAR === "function" ? isAR() : true);
  const T = (a, e) => (ar() ? a : e);
  const n = (v) => `<span class="num">${esc(String(v))}</span>`;

  const KEY = "qareeb.record.v1";
  const ACTOR_KEY = "qareeb.facility.v1";
  const store = () => LS.get(KEY, null) || {};
  const save = (d) => LS.set(KEY, d);
  const me = () => LS.get(ACTOR_KEY, null);
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 9);

  const page = (title, body, sub) => `${header({ back: true, title })}
    <section class="wrap" style="padding-top:14px">
      ${sub ? `<p class="t3" style="margin-bottom:14px;line-height:1.7">${sub}</p>` : ""}
      ${body}
    </section>`;
  const empty = (t) => `<div class="note">${icon("info")}<div>${esc(t)}</div></div>`;

  /* =========================================================
     من أنا — WHICH FACILITY IS THIS
     =========================================================
     A device belongs to a place, not a person, in a lab or a pharmacy: the
     phone at the counter is used by whoever is on shift. So the identity
     here is the FACILITY, and the individual is recorded per action rather
     than per session — which is also the honest model for an audit trail
     that has to survive a shift change.
     ========================================================= */
  const KINDS = {
    lab: { ar: "مختبر", en: "Laboratory", route: "lab" },
    imaging: { ar: "مركز أشعة", en: "Imaging centre", route: "imaging" },
    pharmacy: { ar: "صيدلية", en: "Pharmacy", route: "pharmacy" },
  };

  function facilitySetup(kind) {
    const k = KINDS[kind] || KINDS.lab;
    return page(T("حساب المنشأة", "Facility account"),
      `<div class="note">${icon("seal")}<div>${T(
        "هذا الجهاز يمثّل المنشأة، لا شخصاً. اسم من ينفّذ كل إجراء يُسجَّل مع الإجراء نفسه — لأن الوردية تتغيّر والسجل يبقى.",
        "This device represents the facility, not a person. Whoever performs each action is recorded with the action — shifts change, the record does not.")}</div></div>
      <label class="fld" style="margin-top:14px"><span>${T("اسم المنشأة", "Facility name")}</span>
        <input id="fc-name" type="text"></label>
      <label class="fld"><span>${T("رقم الإجازة", "Licence number")}</span>
        <input id="fc-lic" type="text"></label>
      <button class="btn" style="margin-top:16px" onclick="facilitySave('${esc(kind)}')">${T("احفظ", "Save")}</button>
      <p class="t3" style="margin-top:14px">${T(
        "⚠ التوثيق ليس مبنياً بعد — لا توجد جهة نتحقق منها آلياً. الحساب يُنشأ كـ«مُدّعى» ويظهر كذلك.",
        "⚠ Verification is not built — there is no authority to check against automatically. The account is created as self-asserted and shows as such.")}</p>`,
      `${T("هذا جهاز", "This is a")} ${esc(ar() ? k.ar : k.en)}`);
  }

  globalThis.facilitySave = function facilitySave(kind) {
    const g = (id) => ((document.getElementById(id) || {}).value || "").trim();
    if (!g("fc-name")) { toast(T("اكتب اسم المنشأة", "Enter a name")); return; }
    LS.set(ACTOR_KEY, { id: uid("FAC"), kind, name: g("fc-name"),
      licenseNumber: g("fc-lic"), licenseStatus: "SELF_ASSERTED" });
    toast(T("انحفظ", "Saved"));
    render();
  };

  /* =========================================================
     المختبر — LABORATORY
     ========================================================= */

  globalThis.screenLab = function screenLab(sub, id) {
    const f = me();
    if (!f || f.kind !== "lab") return facilitySetup("lab");
    if (sub === "order" && id) return labOrder(id, f);
    return labWorklist(f);
  };

  function labWorklist(f) {
    const d = store();
    const mine = (d.orders || []).filter((o) => o.kind === "lab"
      && [N().ORDER_STATE.PLACED, N().ORDER_STATE.ACCEPTED, N().ORDER_STATE.COLLECTED,
          N().ORDER_STATE.IN_PROGRESS].indexOf(o.state) !== -1);
    const overdue = mine.filter((o) => now() > new Date(o.dueAt).getTime());
    return page(T("طلبات المختبر", "Laboratory worklist"),
      `${overdue.length ? `<div class="note note-e">${icon("alert")}<div>${n(overdue.length)} ${T(
        "طلب تجاوز موعده", "order(s) past their due date")}</div></div>` : ""}
      ${mine.length ? `<div class="stack-2" style="margin-top:12px">${mine.map((o) => `
        <a class="rw" href="#/lab/order/${esc(o.id)}"><div style="width:100%">
          <div class="rowb"><b>${esc(o.display || o.code)}</b>
            <span class="st ${o.urgency === "stat" ? "st-e" : o.urgency === "urgent" ? "st-t" : "st-q"}">${
              esc(urgencyLabel(o.urgency))}</span></div>
          <div class="t3" style="margin-top:4px">${esc(o.reason)}</div>
          <div class="t3" style="margin-top:2px">${T("الموعد", "due")} ${n(String(o.dueAt).slice(0, 10) || dayOf(o.dueAt))}
            ${now() > new Date(o.dueAt).getTime() ? ` · <span class="st st-e">${T("متأخّر", "late")}</span>` : ""}</div>
        </div></a>`).join("")}</div>`
        : empty(T("ما في طلبات بانتظارك", "No orders waiting"))}`,
      T("الطلب يحمل سؤاله السريري — بدونه ما تقدر تعرف إذا النتيجة غير متوقّعة.",
        "Each order carries its clinical question — without it you cannot tell whether a result is unexpected."));
  }

  const dayOf = (t) => { try { return new Date(t).toISOString().slice(0, 10); } catch { return ""; } };
  const URG = { routine: ["اعتيادي", "routine"], urgent: ["عاجل", "urgent"], stat: ["فوري", "stat"] };
  const urgencyLabel = (u) => (URG[u] || URG.routine)[ar() ? 0 : 1];

  function labOrder(orderId, f) {
    const d = store();
    const o = (d.orders || []).find((x) => x.id === orderId);
    if (!o) return screen404();
    /* THE ENVELOPE. Not the record — this screen literally cannot render a
       diagnosis, because the object it holds does not contain one. */
    const env = N().orderEnvelope(o, d.patient || {}, d);
    return page(T("طلب فحص", "Lab order"),
      `<div class="qa" style="padding:14px">
        <div class="rowb"><div class="d3" style="font-size:18px">${esc(env.display)}</div>
          <span class="st st-q">${esc(urgencyLabel(o.urgency))}</span></div>
        <div class="t3" style="margin-top:6px">${esc(env.patient.name)} ·
          ${env.patient.age != null ? n(env.patient.age) + " " + T("سنة", "y") : T("العمر غير مسجّل", "age not recorded")} ·
          ${esc(R().sexLabel(env.patient.sex, ar()))}</div>
        <div style="margin-top:10px"><b>${T("السؤال السريري", "Clinical question")}</b>
          <div class="t3" style="margin-top:2px">${esc(env.reason)}</div></div>
      </div>

      ${safetyPanel(env.safety)}

      <div class="sec"><div class="sec-h"><h2 class="d3">${T("سجّل النتيجة", "Report the result")}</h2></div>
        <label class="fld"><span>${T("القيمة", "Value")}</span><input id="lr-val" type="text" inputmode="decimal"></label>
        <label class="fld"><span>${T("الوحدة", "Unit")}</span><input id="lr-unit" type="text" placeholder="mg/dL"></label>
        <div class="btn-row">
          <label class="fld" style="flex:1"><span>${T("أدنى المدى", "Ref low")}</span><input id="lr-lo" type="text" inputmode="decimal"></label>
          <label class="fld" style="flex:1"><span>${T("أعلى المدى", "Ref high")}</span><input id="lr-hi" type="text" inputmode="decimal"></label>
        </div>
        <label class="row" style="gap:8px;margin-top:6px">
          <input id="lr-crit" type="checkbox">
          <span class="t3">${T("قيمة حرجة حسب حدود مختبرنا", "critical by our laboratory's own limits")}</span></label>
        <label class="fld"><span>${T("من نفّذ الفحص", "Performed by")}</span><input id="lr-by" type="text"></label>
        <button class="btn" style="margin-top:14px" onclick="labReport('${esc(o.id)}')">${T("أرسل النتيجة", "Send result")}</button>
        <button class="btn btn--2" style="margin-top:10px" onclick="labReject('${esc(o.id)}')">${T("ارفض العيّنة", "Reject the specimen")}</button>
      </div>

      <p class="t3" style="margin-top:16px;line-height:1.7">${T(
        "المدى المرجعي يخصّ جهازكم أنتم، ولذلك يُحفظ مع كل نتيجة — هو ما يجعل الرقم مفهوماً بعد سنوات.",
        "The reference range belongs to your analyser, so it is stored with every result — that is what makes the number interpretable years later.")}</p>`);
  }

  /* Only what changes the assay. Each line earns its place by changing what
     the laboratory DOES, not by being interesting. */
  function safetyPanel(s) {
    const rows = [];
    if (s.allergies.length) rows.push([T("حساسية", "Allergies"),
      s.allergies.map((a) => esc(a.substance)).join(" · "), "e"]);
    if (s.anticoagulants.length) rows.push([T("مضادات تخثّر", "Anticoagulants"),
      s.anticoagulants.map(esc).join(" · "), "w"]);
    if (s.pregnant === true) rows.push([T("حامل", "Pregnant"), T("نعم", "yes"), "w"]);
    if (s.renalImpairment) rows.push([T("قصور كلوي", "Renal impairment"), T("نعم", "yes"), "w"]);
    if (s.implants.length) rows.push([T("غرسات", "Implants"), s.implants.map(esc).join(" · "), "w"]);
    if (!rows.length) return `<div class="t3" style="margin-top:12px">${T(
      "ما وصلنا سياق سلامة — وهذا لا يعني عدمه.", "No safety context was sent — which does not mean there is none.")}</div>`;
    return `<div class="note note-w" style="margin-top:12px">${icon("alert")}<div style="width:100%">
      ${rows.map(([k, v]) => `<div class="rowb"><span class="t3">${esc(k)}</span><span>${v}</span></div>`).join("")}
    </div></div>`;
  }

  globalThis.labReport = function labReport(orderId) {
    const f = me(), d = store();
    const o = (d.orders || []).find((x) => x.id === orderId);
    if (!o) return;
    const g = (id) => ((document.getElementById(id) || {}).value || "").trim();
    const num = (v) => (v === "" ? null : Number(v));
    const r = N().reportResult(o, {
      id: uid("RS"), value: num(g("lr-val")), unit: g("lr-unit"),
      refLow: num(g("lr-lo")), refHigh: num(g("lr-hi")),
      critical: !!(document.getElementById("lr-crit") || {}).checked,
      effectiveAt: new Date().toISOString().slice(0, 10),
      performedBy: g("lr-by") || null,
    }, f, now());
    if (!r.ok) {
      toast(r.reason === "UNIT_REQUIRED" ? T("الوحدة مطلوبة — رقم بلا وحدة مو نتيجة", "A unit is required — a number without one is not a result")
        : r.reason === "REFERENCE_RANGE_REQUIRED" ? T("المدى المرجعي مطلوب", "The reference range is required")
        : r.reason === "VALUE_REQUIRED" ? T("اكتب القيمة", "Enter the value")
        : T("ما قدرنا نكمّل", "Could not complete"));
      return;
    }
    d.results = [...(d.results || []), r.result];
    d.orders = d.orders.map((x) => x.id === orderId ? r.order : x);
    save(d);
    queue("results", r.result.id, r.result);
    toast(T("انرسلت — والطبيب لازم يقرّها", "Sent — the clinician must still acknowledge it"));
    location.hash = "#/lab";
  };

  globalThis.labReject = function labReject(orderId) {
    sheet(`<h3 class="d3">${T("رفض العيّنة", "Reject the specimen")}</h3>
      <label class="fld"><span>${T("السبب — الطبيب راح يقرأه", "Reason — the clinician will read this")}</span>
        <input id="lj-reason" type="text" placeholder="${T("مثلاً: عيّنة متحلّلة", "e.g. haemolysed sample")}"></label>
      <button class="btn btn--danger" style="margin-top:14px" onclick="labRejectGo('${esc(orderId)}')">${T("ارفض", "Reject")}</button>
      <p class="t3" style="margin-top:12px">${T(
        "رفض بلا سبب يترك الطبيب ما يعرف إذا يعيد السحب أو يعيد التفكير.",
        "A rejection with no reason leaves the clinician unable to tell whether to redraw or rethink.")}</p>`);
  };

  globalThis.labRejectGo = function labRejectGo(orderId) {
    const f = me(), d = store();
    const o = (d.orders || []).find((x) => x.id === orderId);
    const reason = ((document.getElementById("lj-reason") || {}).value || "").trim();
    const a = N().advanceOrder(o, N().ORDER_STATE.REJECTED, f, now(), reason);
    if (!a.ok) { toast(T("اكتب السبب", "State the reason")); return; }
    d.orders = d.orders.map((x) => x.id === orderId ? a.order : x);
    save(d);
    queue("orders", a.order.id, a.order, { op: "update", baseRev: a.order.qRev ?? null });
    closeSheet();
    toast(T("انرفضت — والطبيب انبلّغ", "Rejected — the clinician has been told"));
    location.hash = "#/lab";
  };

  /* =========================================================
     الأشعة — IMAGING
     ========================================================= */

  globalThis.screenImaging = function screenImaging(sub, id) {
    const f = me();
    if (!f || f.kind !== "imaging") return facilitySetup("imaging");
    if (sub === "order" && id) return imagingOrder(id, f);
    return imagingWorklist(f);
  };

  function imagingWorklist(f) {
    const d = store();
    const mine = (d.orders || []).filter((o) => o.kind === "imaging"
      && o.state !== N().ORDER_STATE.REPORTED && o.state !== N().ORDER_STATE.CANCELLED);
    const unreported = (d.studies || []).filter((s) => !s.report);
    return page(T("طلبات الأشعة", "Imaging worklist"),
      `${mine.length ? `<div class="stack-2">${mine.map((o) => `
        <a class="rw" href="#/imaging/order/${esc(o.id)}"><div style="width:100%">
          <div class="rowb"><b>${esc(o.display || o.code)}</b>
            <span class="st st-q">${esc(urgencyLabel(o.urgency))}</span></div>
          <div class="t3" style="margin-top:4px">${esc(o.reason)}</div>
        </div></a>`).join("")}</div>` : empty(T("ما في طلبات", "No orders"))}
      ${unreported.length ? `<div class="sec"><div class="sec-h"><h2 class="d3">${T(
        "دراسات بلا تقرير", "Studies awaiting a report")}</h2></div>
        <div class="stack-2">${unreported.map((s) => `<a class="rw" href="#/imaging/study/${esc(s.id)}">
          <div class="rowb" style="width:100%"><span>${esc(s.modality)} — ${esc(s.bodySite)}</span>
          <span class="t3">${n(dayOf(s.performedAt))}</span></div></a>`).join("")}</div></div>` : ""}

      <div class="note" style="margin-top:16px">${icon("info")}<div>${T(
        "قريب ما مربوط بأرشيف صور (PACS). الصور تبقى عندكم — والتقرير هو اللي ينتقل مع المريض، وهو اللي يقرأه الطبيب في ٩٥٪ من الحالات ويشتغل على اتصال ضعيف.",
        "Qareeb is not connected to an image archive. The images stay with you — the report is what travels with the patient, is what a clinician reads most of the time, and works on a weak connection.")}</div></div>`);
  }

  function imagingOrder(orderId, f) {
    const d = store();
    const o = (d.orders || []).find((x) => x.id === orderId);
    if (!o) return screen404();
    const env = N().orderEnvelope(o, d.patient || {}, d);
    return page(T("طلب أشعة", "Imaging order"),
      `<div class="qa" style="padding:14px">
        <div class="d3" style="font-size:18px">${esc(env.display)}</div>
        <div class="t3" style="margin-top:6px">${esc(env.patient.name)} · ${esc(R().sexLabel(env.patient.sex, ar()))}</div>
        <div style="margin-top:10px"><b>${T("السؤال السريري", "Clinical question")}</b>
          <div class="t3">${esc(env.reason)}</div></div>
      </div>
      ${safetyPanel(env.safety)}
      <div class="sec"><div class="sec-h"><h2 class="d3">${T("سجّل الدراسة", "Record the study")}</h2></div>
        <label class="fld"><span>${T("النوع", "Modality")}</span>
          <select id="im-mod">${Object.keys(N().MODALITY).map((m) =>
            `<option value="${esc(m)}">${esc(m)}</option>`).join("")}</select></label>
        <label class="fld"><span>${T("المنطقة", "Body site")}</span><input id="im-site" type="text"></label>
        <label class="row" style="gap:8px;margin-top:6px"><input id="im-contrast" type="checkbox">
          <span class="t3">${T("بصبغة", "with contrast")}</span></label>
        <button class="btn" style="margin-top:14px" onclick="imagingRecord('${esc(o.id)}')">${T("سجّل", "Record")}</button>
      </div>`);
  }

  globalThis.imagingRecord = function imagingRecord(orderId) {
    const f = me(), d = store();
    const o = (d.orders || []).find((x) => x.id === orderId);
    const g = (id) => ((document.getElementById(id) || {}).value || "").trim();
    const s = N().imagingStudy(o, { id: uid("ST"), modality: g("im-mod"), bodySite: g("im-site"),
      contrast: !!(document.getElementById("im-contrast") || {}).checked,
      performedAt: new Date().toISOString().slice(0, 10) }, f, now());
    if (!s.ok) {
      toast(s.reason === "BODY_SITE_REQUIRED" ? T("اكتب المنطقة", "Enter the body site") : T("ما قدرنا نكمّل", "Could not complete"));
      return;
    }
    d.studies = [...(d.studies || []), s.study];
    save(d);
    queue("studies", s.study.id, s.study);
    toast(T("انسجّلت — تنتظر التقرير", "Recorded — awaiting its report"));
    location.hash = "#/imaging/study/" + s.study.id;
  };

  globalThis.screenImagingStudy = function screenImagingStudy(studyId) {
    const f = me();
    if (!f || f.kind !== "imaging") return facilitySetup("imaging");
    const d = store();
    const s = (d.studies || []).find((x) => x.id === studyId);
    if (!s) return screen404();
    const av = N().imageAvailability(s, S.lang);
    if (s.report) {
      return page(T("تقرير", "Report"),
        `<div class="rw"><div style="width:100%">
          <b>${esc(s.modality)} — ${esc(s.bodySite)}</b>
          <div style="margin-top:8px">${esc(s.report.impression)}</div>
          ${s.report.incidental ? `<div class="st st-t" style="margin-top:8px">${T(
            "فيه اكتشاف عَرَضي — فُتحت له متابعة", "contains an incidental finding — a follow-up was opened")}</div>` : ""}
        </div></div>
        <div class="note" style="margin-top:12px">${icon("info")}<div>${esc(av.text)}</div></div>`);
    }
    return page(T("اكتب التقرير", "Write the report"),
      `<div class="rw"><b>${esc(s.modality)} — ${esc(s.bodySite)}</b></div>
      <label class="fld" style="margin-top:12px"><span>${T("الموجودات", "Findings")}</span>
        <textarea id="rp-find" rows="4"></textarea></label>
      <label class="fld"><span>${T("الانطباع — إلزامي", "Impression — required")}</span>
        <textarea id="rp-imp" rows="3"></textarea></label>
      <label class="row" style="gap:8px;margin-top:6px"><input id="rp-inc" type="checkbox">
        <span class="t3">${T("فيه اكتشاف عَرَضي يحتاج متابعة", "contains an incidental finding needing follow-up")}</span></label>
      <label class="fld"><span>${T("اسم الطبيب المُقرِّر", "Reporting radiologist")}</span><input id="rp-by" type="text"></label>
      <button class="btn" style="margin-top:14px" onclick="imagingReport('${esc(s.id)}')">${T("أرسل", "Send")}</button>
      <p class="t3" style="margin-top:14px;line-height:1.7">${T(
        "الاكتشاف العَرَضي إذا انوسم يفتح متابعة تلقائياً. اكتشاف مدفون بنص التقرير ما يلاحقه أحد — وهذا من أكثر الأضرار توثيقاً في الأشعة.",
        "A flagged incidental finding opens a follow-up automatically. One buried in the report text is followed by nobody — among the best documented harms in radiology.")}</p>
      <div class="note" style="margin-top:12px">${icon("info")}<div>${esc(av.text)}</div></div>`);
  };

  globalThis.imagingReport = function imagingReport(studyId) {
    const d = store();
    const s = (d.studies || []).find((x) => x.id === studyId);
    const g = (id) => ((document.getElementById(id) || {}).value || "").trim();
    const r = N().reportStudy(s, { findings: g("rp-find"), impression: g("rp-imp"),
      incidental: !!(document.getElementById("rp-inc") || {}).checked },
      { id: g("rp-by") || me().id, name: g("rp-by") }, now());
    if (!r.ok) {
      toast(r.reason === "IMPRESSION_REQUIRED" ? T("الانطباع مطلوب", "The impression is required")
        : r.reason === "RADIOLOGIST_REQUIRED" ? T("اسم المُقرِّر مطلوب", "The radiologist's name is required")
        : T("ما قدرنا نكمّل", "Could not complete"));
      return;
    }
    d.studies = d.studies.map((x) => x.id === studyId ? r.study : x);
    save(d);
    queue("studies", r.study.id, r.study, { op: "update", baseRev: r.study.qRev ?? null });
    toast(T("انرسل التقرير", "Report sent"));
    render();
  };

  /* =========================================================
     الصيدلية — PHARMACY
     ========================================================= */

  globalThis.screenPharmacyRx = function screenPharmacyRx(sub, id) {
    const f = me();
    if (!f || f.kind !== "pharmacy") return facilitySetup("pharmacy");
    if (sub === "rx" && id) return pharmacyRx(id, f);
    return pharmacyHome(f);
  };

  function pharmacyHome(f) {
    return page(T("التحقق من وصفة", "Verify a prescription"),
      `<label class="fld"><span>${T("رمز الوصفة", "Prescription code")}</span>
        <input id="ph-code" type="text" placeholder="RX-…" style="letter-spacing:.08em"></label>
      <button class="btn" style="margin-top:12px" onclick="pharmacyOpen()">${T("افتح", "Open")}</button>
      <div class="note" style="margin-top:18px">${icon("seal")}<div>${T(
        "تشوفون الوصفة والحساسية والأدوية الحالية — وهذا كل شي. لا تحاليل ولا أشعة ولا تشخيص: مو لأنه مخفي عنكم، بل لأن اللي وصلكم ما يحتويه أصلاً.",
        "You see the prescription, the allergies and the current medicines — and that is all. No labs, no imaging, no diagnosis: not hidden from you, simply not contained in what reached you.")}</div></div>`);
  }

  globalThis.pharmacyOpen = function pharmacyOpen() {
    const code = ((document.getElementById("ph-code") || {}).value || "").trim();
    if (!code) { toast(T("اكتب الرمز", "Enter the code")); return; }
    location.hash = "#/pharmacy-rx/rx/" + encodeURIComponent(code);
  };

  function pharmacyRx(rxId, f) {
    const d = store();
    const rx = (d.prescriptions || []).find((x) => x.id === rxId);
    if (!rx) return page(T("وصفة", "Prescription"),
      empty(T("ما لقينا وصفة بهذا الرمز على هذا الجهاز", "No prescription with that code on this device")));

    const v = N().verifyPrescription(rx, d.dispenses || [], now());
    const env = N().pharmacyEnvelope(rx, d.patient || {}, d);
    const chk = N().dispenseChecks(rx, env);

    return page(T("وصفة", "Prescription"),
      `${verifyBanner(v)}
      <div class="qa" style="padding:14px;margin-top:12px">
        <div class="d3" style="font-size:19px">${esc(env.prescription.medication)}</div>
        <div class="t3" style="margin-top:6px">${[env.prescription.dose,
          freqLabel(env.prescription.frequency),
          env.prescription.durationDays ? `${env.prescription.durationDays} ${T("يوم", "days")}` : T("مفتوحة", "open-ended")]
          .filter(Boolean).map(esc).join(" · ")}</div>
        <div class="t3" style="margin-top:4px">${T("لـ", "for")} ${esc(env.prescription.indication)}</div>
        <div class="t3" style="margin-top:8px">${esc(env.patient.name)} ·
          ${env.patient.age != null ? n(env.patient.age) : "؟"} ${T("سنة", "y")}</div>
      </div>

      ${chk.flags.length ? `<div class="note note-e" style="margin-top:12px">${icon("alert")}
        <div style="width:100%"><b>${T("انتبه", "Check")}</b>
          ${chk.flags.map((fl) => `<div style="margin-top:6px">${fl.kind === "ALLERGY"
            ? `${T("المريض يتحسّس", "The patient is allergic to")} <b>${esc(fl.substance)}</b>${
                fl.detail ? ` — ${esc(fl.detail)}` : ""}`
            : `${T("نفس الدواء موجود في قائمته الحالية", "already on their current list")}: ${esc(fl.medication)}`}</div>`).join("")}
        </div></div>` : ""}

      <div class="sec"><div class="sec-h"><h2 class="d3">${T("حساسيته", "Their allergies")}</h2></div>
        ${env.allergies.length ? `<div class="stack-2">${env.allergies.map((a) => `
          <div class="rw"><div class="rowb" style="width:100%"><span>${esc(a.substance)}</span>
          <span class="t3">${esc(a.reaction || "")}</span></div></div>`).join("")}</div>`
          : `<div class="t3">${T("ما مسجّل — وهذا لا يعني عدمها", "None recorded — which does not mean none")}</div>`}
      </div>

      <div class="sec"><div class="sec-h"><h2 class="d3">${T("أدويته الحالية", "Their current medicines")}</h2></div>
        ${env.currentMedications.length ? `<div class="stack-2">${env.currentMedications.map((m) => `
          <div class="rw"><div class="rowb" style="width:100%"><span>${esc(m.display)}</span>
          <span class="t3">${esc(m.dose || "")}</span></div></div>`).join("")}</div>`
          : `<div class="t3">${T("ما مسجّل", "None recorded")}</div>`}
      </div>

      ${v.state === N().RX_VERIFY.VALID ? `
        <button class="btn" style="margin-top:16px" onclick="pharmacyDispense('${esc(rx.id)}','dispensed')">${
          T("صُرفت", "Dispensed")}</button>
        <button class="btn btn--2" style="margin-top:10px" onclick="pharmacyPartial('${esc(rx.id)}')">${
          T("صُرفت جزئياً أو ببديل", "Partial or substituted")}</button>` : ""}

      <div class="note" style="margin-top:18px">${icon("info")}<div>${esc(chk.limitation)}
        <div class="t3" style="margin-top:6px">${T("ما فُحص", "Not checked")}: ${chk.notChecked.map(esc).join(" · ")}</div>
      </div></div>`);
  }

  function verifyBanner(v) {
    const V = N().RX_VERIFY;
    if (v.state === V.VALID) return `<div class="note">${icon("check")}<div>${T("سارية", "Valid")}</div></div>`;
    if (v.state === V.EXPIRED) return `<div class="note note-e">${icon("alert")}<div>${T(
      `منتهية — صدرت قبل أكثر من ${v.validDays} يوماً`, `Expired — issued more than ${v.validDays} days ago`)}</div></div>`;
    if (v.state === V.ALREADY_DISPENSED) return `<div class="note note-e">${icon("alert")}<div>${T(
      "مصروفة سابقاً", "Already dispensed")}</div></div>`;
    if (v.state === V.REVOKED) return `<div class="note note-e">${icon("alert")}<div>${T("ملغاة", "Revoked")}</div></div>`;
    return `<div class="note note-w">${icon("info")}<div>${T("ما نقدر نتحقق منها", "Cannot be verified")}</div></div>`;
  }

  const freqLabel = (f) => { const x = R().FREQ[f]; return x ? (ar() ? x.ar : x.en) : (f || ""); };

  globalThis.pharmacyDispense = function pharmacyDispense(rxId, state, extra) {
    const f = me(), d = store();
    const rx = (d.prescriptions || []).find((x) => x.id === rxId);
    const r = R().recordDispense(rx, { pharmacyId: f.id, state, ...(extra || {}) }, now());
    if (!r.ok) {
      toast(r.reason === "NOTE_REQUIRED" ? T("اكتب ملاحظة", "Add a note")
        : r.reason === "SUBSTITUTE_REQUIRED" ? T("اكتب اسم البديل", "Name the substitute")
        : T("ما قدرنا نكمّل", "Could not complete"));
      return false;
    }
    d.dispenses = [...(d.dispenses || []), r.dispense];
    save(d);
    queue("dispenses", uid("DS"), r.dispense);
    toast(T("انسجّل الصرف", "Dispense recorded"));
    render();
    return true;
  };

  globalThis.pharmacyPartial = function pharmacyPartial(rxId) {
    sheet(`<h3 class="d3">${T("صرف جزئي أو ببديل", "Partial or substituted")}</h3>
      <label class="fld"><span>${T("ملاحظة", "Note")}</span>
        <input id="pd-note" type="text" placeholder="${T("مثلاً: صُرف نصف الكمية", "e.g. half the quantity")}"></label>
      <label class="fld"><span>${T("البديل — إن وُجد", "Substitute — if any")}</span>
        <input id="pd-sub" type="text"></label>
      <button class="btn" style="margin-top:14px" onclick="pharmacyPartialGo('${esc(rxId)}')">${T("سجّل", "Record")}</button>
      <p class="t3" style="margin-top:12px">${T(
        "البديل حدث سريري لا تجاري — الطبيب الجاي لازم يشوف أن المريض على علامة تجارية غير المكتوبة.",
        "A substitution is a clinical event, not a retail one — the next clinician must see the patient is on a different brand than the one written.")}</p>`);
  };

  globalThis.pharmacyPartialGo = function pharmacyPartialGo(rxId) {
    const g = (id) => ((document.getElementById(id) || {}).value || "").trim();
    const sub = g("pd-sub");
    const okd = pharmacyDispense(rxId, sub ? "dispensed" : "partial",
      { note: g("pd-note"), substituted: !!sub, substitutedWith: sub || null });
    if (okd) closeSheet();
  };

  /* Everything a facility writes goes through the outbox, so a power cut
     costs the last tap rather than the shift. */
  function queue(collection, id, payload, opts) {
    const t = globalThis.TRANSPORT;
    if (t) t.write(collection, id, payload, opts);
  }
})();
