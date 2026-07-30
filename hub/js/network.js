/* ============================================================
   قريب · شبكة الرعاية كفاعلين سريريين — HEALTHCARE NETWORK
   ============================================================
   Organizations · Laboratories · Imaging · Pharmacy · Referrals

   `app.js` already has a healthcare DIRECTORY — you can find a pharmacy open
   at 02:40 and a doctor in your district. This file is a different thing: it
   makes those places CLINICAL ACTORS that can receive an order, attach a
   result to the right patient, verify a prescription, and answer a referral —
   each seeing only what their job requires and nothing else.

   THE RULE THAT SHAPES THIS WHOLE FILE: MINIMUM NECESSARY.

   A laboratory needs to know which test, for which patient, ordered by whom,
   and whether the patient is pregnant or on anticoagulants when that changes
   the assay. It does not need the psychiatric history. A pharmacy needs the
   prescription, the allergies, and the current medication list to catch an
   interaction. It does not need the imaging reports. Building one "provider
   can see the record" permission and trusting each provider to look away is
   not a security model, it is an honour system with an audit log attached.

   So access here is scoped BY WHAT THE ACTOR IS, then narrowed again by what
   the patient consented to. The two are independent gates and both must pass.

   ⚠ WHAT THIS FILE DOES NOT DO, DELIBERATELY:
   There is no DICOM implementation here, no HL7 feed, no lab-analyser driver
   and no connection to any hospital, ministry or insurer. Those integrations
   do not exist. What exists is the BOUNDARY they would attach to — a study
   that can hold a real DICOM reference the day there is a PACS to point at,
   and an order that can carry a real accession number. Marking the boundary
   honestly is useful. Simulating the integration behind it is a lie that
   costs a rewrite.
   ============================================================ */
(function (root) {
  "use strict";

  const E = root.EMR || {};
  const C = root.CONSENT || {};
  const ms = E.ms || ((t) => (t == null ? null : (typeof t === "number" ? t : new Date(t).getTime())));
  const txt = (v) => String(v == null ? "" : v).trim();
  const DAY = 86400000;

  /* =========================================================
     ١ · المنشآت — ORGANIZATIONS
     =========================================================
     A clinic is not one actor. It is a reception desk, a nurse, several
     doctors, sometimes a pharmacy and a lab under one licence — and the
     reception desk must never see a diagnosis. Modelling the organisation as
     a single principal is how a whole clinic's staff inherits one doctor's
     consent.
     ========================================================= */

  const ORG_KIND = { CLINIC: "clinic", HOSPITAL: "hospital", PHARMACY: "pharmacy",
                     LAB: "laboratory", IMAGING: "imaging-centre", OTHER: "other" };

  /* Roles inside an organisation, separate from EMR.ROLE which is about the
     clinical relationship. A person can be a DOCTOR clinically and a
     DEPARTMENT_HEAD administratively, and the two grant different things. */
  const STAFF_ROLE = {
    RECEPTION: "reception",       /* appointments and demographics only */
    NURSE: "nurse",
    DOCTOR: "doctor",
    PHARMACIST: "pharmacist",
    LAB_TECH: "lab-technician",
    RADIOGRAPHER: "radiographer",
    RADIOLOGIST: "radiologist",
    ADMIN: "administrator",       /* runs the business — NOT the charts */
  };

  /* What each staff role may see AT MOST, before consent narrows it further.
     An administrator's absence from the clinical scopes is the important
     line here: running an organisation is not a clinical need, and every
     health system that conflated the two produced the same headline. */
  const STAFF_SCOPES = {
    reception: ["summary_identity", "appointments"],
    nurse: ["summary", "allergies", "medications", "conditions", "immunizations", "appointments"],
    doctor: ["summary", "allergies", "medications", "conditions", "procedures", "labs",
             "imaging", "documents", "encounters", "immunizations", "timeline", "appointments"],
    pharmacist: ["allergies", "medications", "prescriptions"],
    "lab-technician": ["labs", "orders"],
    radiographer: ["imaging", "orders"],
    radiologist: ["imaging", "orders", "conditions", "summary"],
    administrator: ["appointments"],
  };

  function organization(o) {
    if (!o) return { ok: false, reason: "NO_ORGANIZATION" };
    if (!txt(o.name)) return { ok: false, reason: "NAME_REQUIRED" };
    if (!Object.values(ORG_KIND).includes(o.kind)) return { ok: false, reason: "KIND_REQUIRED" };
    return { ok: true, organization: { ...o, id: o.id || null,
      departments: o.departments || [], staff: o.staff || [],
      verified: false, verifiedAt: null } };
  }

  /* The scopes a staff member can reach: their role's ceiling, intersected
     with what the patient granted. Neither gate can be skipped by the other,
     which is the whole point of expressing it as an intersection rather than
     a chain of ifs someone can reorder. */
  function staffScopes(staff, share) {
    const ceiling = STAFF_SCOPES[staff && staff.staffRole] || [];
    if (!share) return [];
    const granted = share.scopes || [];
    return ceiling.filter((s) => granted.indexOf(s) !== -1);
  }

  /* A department is where a referral lands and where an order comes from.
     Kept minimal on purpose — an org chart is not clinical data. */
  const department = (d) => (!d || !txt(d.name) ? { ok: false, reason: "NAME_REQUIRED" }
    : { ok: true, department: { ...d, id: d.id || null, staff: d.staff || [] } });

  /* =========================================================
     ٢ · الطلب — THE ORDER
     =========================================================
     One order type for lab and imaging both, because the lifecycle is the
     same and the failure is the same: an order placed and never answered.
     This is the object the fail-safe register watches.
     ========================================================= */

  const ORDER_KIND = { LAB: "lab", IMAGING: "imaging" };
  const ORDER_STATE = { DRAFT: "draft", PLACED: "placed", ACCEPTED: "accepted",
                        COLLECTED: "collected", IN_PROGRESS: "in-progress",
                        REPORTED: "reported", CANCELLED: "cancelled", REJECTED: "rejected" };

  const ORDER_MACHINE = {
    draft: ["placed", "cancelled"],
    placed: ["accepted", "rejected", "cancelled"],
    accepted: ["collected", "in-progress", "cancelled", "rejected"],
    collected: ["in-progress", "rejected"],
    "in-progress": ["reported", "rejected"],
    reported: [],
    cancelled: [],
    rejected: ["placed"],      /* a rejected specimen is re-ordered, not lost */
  };
  const canOrderTransition = (from, to) => (ORDER_MACHINE[from] || []).indexOf(to) !== -1;

  /* URGENCY drives the register's due date, not a doctor's memory. */
  const URGENCY = { ROUTINE: "routine", URGENT: "urgent", STAT: "stat" };
  const URGENCY_DAYS = { routine: 14, urgent: 3, stat: 1 };

  function placeOrder(o, orderer, at) {
    if (!o) return { ok: false, reason: "NO_ORDER" };
    if (!txt(o.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!Object.values(ORDER_KIND).includes(o.kind)) return { ok: false, reason: "KIND_REQUIRED" };
    if (!txt(o.code)) return { ok: false, reason: "CODE_REQUIRED" };
    if (!orderer || !txt(orderer.id)) return { ok: false, reason: "ORDERER_REQUIRED" };
    /* Only a verified clinician may place an order that a facility will act
       on. An unverified account ordering a CT is a person spending someone
       else's money and radiation dose. */
    if (orderer.licenseStatus !== "VERIFIED") return { ok: false, reason: "ORDERER_UNVERIFIED" };
    /* WHY. A lab that receives "HbA1c" with no clinical question cannot flag
       a result as unexpected, and a radiologist reporting blind is guessing
       at what was being looked for. It is also what the patient reads. */
    if (!txt(o.reason)) return { ok: false, reason: "REASON_REQUIRED" };
    const urg = o.urgency && URGENCY_DAYS[o.urgency] ? o.urgency : URGENCY.ROUTINE;
    return { ok: true, order: {
      ...o, id: o.id || null, state: ORDER_STATE.PLACED, urgency: urg,
      orderedBy: orderer.id, orderedAt: at,
      /* The date after which nobody having answered is itself a finding. */
      dueAt: ms(at) + URGENCY_DAYS[urg] * DAY,
      performerId: o.performerId || null,      /* which lab/centre, if chosen */
      accession: null,                          /* the facility's own number, when it has one */
      resultId: null,
    } };
  }

  function advanceOrder(order, to, actor, at, note) {
    if (!order) return { ok: false, reason: "NO_ORDER" };
    if (!canOrderTransition(order.state, to)) return { ok: false, reason: "BAD_TRANSITION" };
    if (!actor || !txt(actor.id)) return { ok: false, reason: "ACTOR_REQUIRED" };
    /* A rejection with no reason is a black hole: the clinician sees the
       order died and cannot tell whether to redraw the sample or rethink. */
    if ((to === ORDER_STATE.REJECTED || to === ORDER_STATE.CANCELLED) && !txt(note)) {
      return { ok: false, reason: "NOTE_REQUIRED" };
    }
    return { ok: true, order: { ...order, state: to,
      history: [...(order.history || []), { state: to, by: actor.id, at, note: note || null }] } };
  }

  /* WHAT THE LAB SEES. Not the record — this envelope, and only this. */
  function orderEnvelope(order, patient, record) {
    const r = record || {};
    return {
      orderId: order.id, code: order.code, display: order.display || order.code,
      kind: order.kind, urgency: order.urgency, reason: order.reason,
      orderedBy: order.orderedBy, orderedAt: order.orderedAt,
      patient: {
        id: patient.id,
        name: E.fullName ? E.fullName(patient) : patient.name,
        age: E.ageOf ? E.ageOf(patient.birthDate, Date.now()) : null,
        sex: patient.sex || null,
      },
      /* The narrow clinical context that genuinely changes an assay or a
         scan, and nothing beyond it. Each item here earns its place by
         changing what the facility DOES, not by being interesting. */
      safety: {
        allergies: (E.criticalAllergies ? E.criticalAllergies(r.allergies) : (r.allergies || []))
          .map((a) => ({ substance: a.substance, criticality: a.criticality })),
        anticoagulants: (r.medications || []).filter((m) => m.anticoagulant === true)
          .map((m) => m.display),
        pregnant: r.pregnant === true ? true : (r.pregnant === false ? false : null),
        renalImpairment: r.renalImpairment === true || null,
        implants: (r.procedures || []).filter((p) => p.implant).map((p) => p.implant),
      },
    };
  }

  /* =========================================================
     ٣ · المختبر — LABORATORY
     ========================================================= */

  const SPECIMEN = { BLOOD: "blood", URINE: "urine", STOOL: "stool", SWAB: "swab",
                     TISSUE: "tissue", CSF: "csf", OTHER: "other" };

  /* A structured result. The original PDF is kept as a Document alongside it
     and is never replaced by this — the structure is for reasoning, the
     source is for proof, and a system that keeps only one of them fails
     differently but equally. */
  function reportResult(order, res, lab, at) {
    if (!order) return { ok: false, reason: "NO_ORDER" };
    if (order.state === ORDER_STATE.CANCELLED) return { ok: false, reason: "ORDER_CANCELLED" };
    if (!lab || !txt(lab.id)) return { ok: false, reason: "LAB_REQUIRED" };
    if (!res || res.value == null) return { ok: false, reason: "VALUE_REQUIRED" };
    /* A number with no unit is not a result, it is a rumour. 5 could be
       mmol/L or mg/dL and those are different clinical situations. */
    if (!txt(res.unit) && typeof res.value === "number") return { ok: false, reason: "UNIT_REQUIRED" };
    /* Reference ranges belong to the ANALYSER, not to the app. Storing the
       lab's own range with each result is what makes a value interpretable
       years later, when that lab has recalibrated or closed. */
    if (typeof res.value === "number" && res.refLow == null && res.refHigh == null) {
      return { ok: false, reason: "REFERENCE_RANGE_REQUIRED" };
    }
    const result = {
      id: res.id || null, orderId: order.id, patientId: order.patientId,
      code: order.code, display: order.display || order.code,
      value: res.value, unit: res.unit || null,
      refLow: res.refLow ?? null, refHigh: res.refHigh ?? null,
      method: res.method || null, specimen: res.specimen || null,
      collectedAt: res.collectedAt || null,
      effectiveAt: res.effectiveAt || at,
      performerId: lab.id, performerName: lab.name || null,
      episodeId: order.episodeId || null,
      sourceDocumentId: res.sourceDocumentId || null,
      /* NOT acknowledged. A result entering the record is not a result a
         clinician has seen, and conflating them is the closed-loop failure
         the whole task register exists to catch. */
      acknowledgedBy: null, acknowledgedAt: null,
      source: (E.SOURCE && E.SOURCE.EXTERNAL) || "external-import",
    };
    result.flag = E.flagResult ? E.flagResult(result) : null;
    /* A critical value is not merely abnormal — it is the one that must reach
       a human NOW, and the lab is the only party that knows its own critical
       limits. When it says so, we carry that through rather than recomputing
       it from a range we did not calibrate. */
    if (res.critical === true) result.flag = "critical";
    return { ok: true, result,
      order: { ...order, state: ORDER_STATE.REPORTED, resultId: result.id, reportedAt: at } };
  }

  /* Two results are only comparable when the same laboratory measured the
     same analyte in the same unit. Everything else gets drawn, because
     clinicians need the shape — but declared, because a confident line
     through two analysers is a clinical hazard dressed as a chart. */
  function comparableSeries(results, code) {
    const t = E.trend ? E.trend(results, code) : { points: [] };
    return { ...t, safeToCompare: !!(t.points && t.points.length > 1) && !t.mixedLabs && !t.mixedUnits };
  }

  /* =========================================================
     ٤ · الأشعة — IMAGING
     =========================================================
     ⚠ INTEGRATION BOUNDARY, NOT AN IMPLEMENTATION.

     There is no PACS, no DICOM store, no WADO-RS endpoint and no viewer
     behind this. What is modelled is the STUDY as a clinical object — what
     was done, to which body part, why, who reported it, and what the report
     says — plus the exact fields a real DICOM archive would populate, left
     null and clearly named.

     The reason to build it this way rather than wait: the report is what a
     clinician reads 95% of the time, and the report is plain text that works
     over a phone connection in a power cut. The pixels are the 5% and they
     need infrastructure that does not exist here yet. Getting the report
     right today costs nothing and is most of the value.
     ========================================================= */

  const MODALITY = { XR: "XR", CT: "CT", MR: "MR", US: "US", MG: "MG", NM: "NM", PT: "PT", OTHER: "OTHER" };

  function imagingStudy(order, s, centre, at) {
    if (!order || order.kind !== ORDER_KIND.IMAGING) return { ok: false, reason: "NOT_AN_IMAGING_ORDER" };
    if (!centre || !txt(centre.id)) return { ok: false, reason: "CENTRE_REQUIRED" };
    if (!s || !MODALITY[s.modality]) return { ok: false, reason: "MODALITY_REQUIRED" };
    if (!txt(s.bodySite)) return { ok: false, reason: "BODY_SITE_REQUIRED" };
    return { ok: true, study: {
      id: s.id || null, orderId: order.id, patientId: order.patientId,
      modality: s.modality, bodySite: s.bodySite, contrast: s.contrast === true,
      performedAt: s.performedAt || at, facilityId: centre.id, facilityName: centre.name || null,
      episodeId: order.episodeId || null,
      /* ---- the DICOM boundary ----
         These are the identifiers a real archive supplies. They stay null
         until one exists. A UI that shows "images available" because a study
         row exists would be lying — `hasImages` is derived from the pointer,
         never asserted. */
      dicom: {
        studyInstanceUID: s.studyInstanceUID || null,
        accessionNumber: s.accessionNumber || null,
        seriesCount: s.seriesCount ?? null,
        /* Where a viewer would fetch from. Null means: no archive is
           connected, and the app must say exactly that. */
        wadoEndpoint: null,
      },
      report: null, reportedBy: null, reportedAt: null,
      sourceDocumentId: s.sourceDocumentId || null,
    } };
  }

  const hasImages = (study) => !!(study && study.dicom && study.dicom.studyInstanceUID && study.dicom.wadoEndpoint);

  /* What the app can honestly tell a user about the pixels. */
  function imageAvailability(study, lang) {
    const ar = lang !== "en";
    if (hasImages(study)) return { available: true, text: ar ? "الصور متاحة" : "images available" };
    if (study && study.sourceDocumentId) {
      return { available: false, text: ar ? "التقرير مرفوع كملف — الصور غير متصلة"
                                          : "the report is uploaded as a file — the images are not connected" };
    }
    return { available: false, text: ar ? "الصور عند المركز — قريب غير مربوط بأرشيف صور بعد"
                                        : "the images are at the centre — Qareeb is not connected to an image archive yet" };
  }

  function reportStudy(study, report, radiologist, at) {
    if (!study) return { ok: false, reason: "NO_STUDY" };
    if (study.report) return { ok: false, reason: "ALREADY_REPORTED" };
    if (!radiologist || !txt(radiologist.id)) return { ok: false, reason: "RADIOLOGIST_REQUIRED" };
    if (!report || !txt(report.impression)) return { ok: false, reason: "IMPRESSION_REQUIRED" };
    return { ok: true, study: { ...study,
      report: { findings: report.findings || null, impression: txt(report.impression),
        /* An incidental finding nobody follows up is one of the best
           documented harms in radiology. Flagging it here is what lets the
           register open a task for it. */
        incidental: report.incidental === true,
        comparison: report.comparison || null },
      reportedBy: radiologist.id, reportedAt: at } };
  }

  /* =========================================================
     ٥ · الصيدلية — PHARMACY
     =========================================================
     A pharmacy sees three things: the prescription, the allergy list, and
     the current medications. That is what is needed to dispense safely and
     to catch the interaction the prescriber missed. It is not a window into
     the chart, and it is scoped here rather than trusted to the UI.
     ========================================================= */

  const PHARMACY_SCOPES = ["prescriptions", "allergies", "medications"];

  const RX_VERIFY = { VALID: "valid", EXPIRED: "expired", ALREADY_DISPENSED: "already-dispensed",
                      REVOKED: "revoked", UNKNOWN: "unknown" };

  /* A prescription is valid for a bounded window. Iraqi statute on this was
     NOT FOUND in the research pass, so this is a PRODUCT DEFAULT, stated as
     one, and configurable per tenant — not a legal claim. */
  const RX_VALID_DAYS = 30;

  function verifyPrescription(rx, dispenses, now) {
    if (!rx) return { state: RX_VERIFY.UNKNOWN, reason: "NO_PRESCRIPTION" };
    if (rx.revokedAt) return { state: RX_VERIFY.REVOKED, at: rx.revokedAt };
    const issued = ms(rx.issuedAt);
    if (issued == null) return { state: RX_VERIFY.UNKNOWN, reason: "NO_ISSUE_DATE" };
    if (ms(now) - issued > RX_VALID_DAYS * DAY) {
      return { state: RX_VERIFY.EXPIRED, issuedAt: rx.issuedAt, validDays: RX_VALID_DAYS };
    }
    const prior = (dispenses || []).filter((d) => d.prescriptionId === rx.id);
    if (prior.some((d) => d.state === "dispensed")) {
      return { state: RX_VERIFY.ALREADY_DISPENSED, by: prior[0].pharmacyId, at: prior[0].at };
    }
    return { state: RX_VERIFY.VALID, expiresAt: issued + RX_VALID_DAYS * DAY };
  }

  /* The envelope a pharmacy receives. Note what is absent. */
  function pharmacyEnvelope(rx, patient, record) {
    const r = record || {};
    return {
      prescription: {
        id: rx.id, medication: rx.medication, dose: rx.dose, frequency: rx.frequency,
        durationDays: rx.durationDays ?? null, route: rx.route || null,
        indication: rx.indication, prescriberId: rx.prescriberId, issuedAt: rx.issuedAt,
      },
      patient: { id: patient.id, name: E.fullName ? E.fullName(patient) : patient.name,
        age: E.ageOf ? E.ageOf(patient.birthDate, Date.now()) : null, sex: patient.sex || null },
      allergies: (E.criticalAllergies ? E.criticalAllergies(r.allergies) : (r.allergies || []))
        .map((a) => ({ substance: a.substance, reaction: a.reaction || null, criticality: a.criticality })),
      currentMedications: (E.currentMedications ? E.currentMedications(r.medications, Date.now()) : (r.medications || []))
        .map((m) => ({ display: m.display, dose: m.dose || null, status: m.status })),
    };
  }

  /* Duplicate and allergy checks a pharmacist can act on. Deliberately
     conservative: it flags what it can prove from the record's own contents
     and says nothing about interactions, because a real interaction database
     does not exist here and inventing one would be worse than silence. */
  /* Drug names in Arabic carry the definite article inconsistently — a
     pharmacist writes «السلفا» in the allergy field and «سلفاميثوكسازول» on
     the label, and a plain substring test finds nothing between them. That
     silence looks exactly like a clean check.

     `normAr` deliberately does not strip ال, because for PATIENT NAMES it
     would fuse distinct people. For drug-name containment the trade runs the
     other way: a false flag costs a pharmacist three seconds, and a missed
     one costs the patient. So the article is stripped here and only here. */
  const normDrug = (s) => {
    const base = (E.normAr || ((x) => String(x || "").toLowerCase()))(s);
    return base.replace(/(^|\s)ال/g, "$1").replace(/\s+/g, "");
  };

  function dispenseChecks(rx, envelope) {
    const flags = [];
    const norm = E.normAr || ((s) => String(s || "").toLowerCase());
    const med = normDrug(rx.medication);

    for (const a of envelope.allergies || []) {
      const sub = normDrug(a.substance);
      /* Bidirectional: the allergy may be to a CLASS whose name is contained
         in the drug (sulfa → sulfamethoxazole), or to a specific drug whose
         name contains the class. Both directions are the same clinical
         question asked from opposite ends. */
      if (sub && med && (med.includes(sub) || sub.includes(med))) {
        flags.push({ kind: "ALLERGY", severity: "high", substance: a.substance,
          detail: a.reaction || null, match: "name-containment" });
      }
    }
    for (const m of envelope.currentMedications || []) {
      if (norm(m.display) === med && m.status === "active") {
        flags.push({ kind: "DUPLICATE", severity: "medium", medication: m.display });
      }
    }
    /* An explicit statement of the limit, carried in the data so no screen
       can imply a clean check means a safe one. The allergy match is a
       STRING comparison — it cannot know that penicillin and amoxicillin are
       related, because that needs an ingredient hierarchy we do not have. */
    return { flags, checked: ["allergy-list", "current-medications"],
      notChecked: ["drug-drug-interactions", "ingredient-hierarchy", "renal-dosing", "pregnancy"],
      matchMethod: "name-containment",
      limitation: "قريب لا يملك قاعدة تداخلات دوائية ولا شجرة مواد فعّالة — هذه ليست مراجعة صيدلانية كاملة" };
  }

  /* =========================================================
     ٦ · الإحالة — REFERRAL
     =========================================================
     England's e-Referral service is the model worth copying and the reason
     is not the technology: it is that a referral has a STATE, so "sent and
     never answered" is a thing the system can see. A referral letter handed
     to a patient is a referral nobody can follow up.
     ========================================================= */

  const REF_STATE = { DRAFT: "draft", SENT: "sent", RECEIVED: "received", ACCEPTED: "accepted",
                      DECLINED: "declined", COMPLETED: "completed", WITHDRAWN: "withdrawn" };
  const REF_MACHINE = {
    draft: ["sent", "withdrawn"],
    sent: ["received", "declined", "withdrawn"],
    received: ["accepted", "declined"],
    accepted: ["completed", "withdrawn"],
    declined: ["sent"],          /* redirected to another provider */
    completed: [], withdrawn: [],
  };
  const canRefTransition = (from, to) => (REF_MACHINE[from] || []).indexOf(to) !== -1;
  const REF_DUE_DAYS = 21;

  function sendReferral(ref, referrer, at) {
    if (!ref) return { ok: false, reason: "NO_REFERRAL" };
    if (!txt(ref.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!txt(ref.specialty)) return { ok: false, reason: "SPECIALTY_REQUIRED" };
    if (!referrer || !txt(referrer.id)) return { ok: false, reason: "REFERRER_REQUIRED" };
    if (referrer.licenseStatus !== "VERIFIED") return { ok: false, reason: "REFERRER_UNVERIFIED" };
    if (!txt(ref.reason)) return { ok: false, reason: "REASON_REQUIRED" };
    /* What the receiving clinician needs in order to triage without opening
       the whole chart. A referral with no question is a referral that gets
       an appointment six weeks out regardless of urgency. */
    if (!txt(ref.question)) return { ok: false, reason: "QUESTION_REQUIRED" };
    return { ok: true, referral: { ...ref, id: ref.id || null, state: REF_STATE.SENT,
      referrerId: referrer.id, sentAt: at, dueAt: ms(at) + REF_DUE_DAYS * DAY,
      episodeId: ref.episodeId || null, history: [] } };
  }

  function advanceReferral(ref, to, actor, at, note) {
    if (!ref) return { ok: false, reason: "NO_REFERRAL" };
    if (!canRefTransition(ref.state, to)) return { ok: false, reason: "BAD_TRANSITION" };
    if (!actor || !txt(actor.id)) return { ok: false, reason: "ACTOR_REQUIRED" };
    if (to === REF_STATE.DECLINED && !txt(note)) return { ok: false, reason: "NOTE_REQUIRED" };
    return { ok: true, referral: { ...ref, state: to,
      history: [...(ref.history || []), { state: to, by: actor.id, at, note: note || null }] } };
  }

  /* =========================================================
     ٧ · السجلات الآمنة من الفشل عبر الشبكة — NETWORK REGISTERS
     =========================================================
     emr.js derives tasks from the patient's own record. This derives them
     from the NETWORK: orders nobody answered, referrals nobody replied to,
     critical results nobody saw. These are the failures that happen in the
     gap between two organisations, which is exactly where nobody owns them.
     ========================================================= */

  function networkTasks(ctx, now) {
    const out = [];
    const t = ms(now);

    for (const o of ctx.orders || []) {
      if (o.state === ORDER_STATE.REPORTED || o.state === ORDER_STATE.CANCELLED) continue;
      out.push({
        id: "nt-ord-" + o.id, kind: "order-unanswered", patientId: o.patientId,
        about: o.display || o.code, dueAt: o.dueAt, owner: o.orderedBy,
        status: (E.TASK_STATE && E.TASK_STATE.OPEN) || "open",
        detail: { orderState: o.state, urgency: o.urgency, performerId: o.performerId },
      });
    }
    for (const r of ctx.referrals || []) {
      if ([REF_STATE.ACCEPTED, REF_STATE.COMPLETED, REF_STATE.WITHDRAWN].indexOf(r.state) !== -1) continue;
      out.push({
        id: "nt-ref-" + r.id, kind: "referral-unanswered", patientId: r.patientId,
        about: r.specialty, dueAt: r.dueAt, owner: r.referrerId,
        status: (E.TASK_STATE && E.TASK_STATE.OPEN) || "open",
        detail: { referralState: r.state },
      });
    }
    /* A critical result nobody acknowledged is due IMMEDIATELY — it does not
       get the ordinary grace period, because the whole meaning of critical is
       that waiting is the harm. */
    for (const res of ctx.results || []) {
      if (res.flag !== "critical" || res.acknowledgedBy) continue;
      out.push({
        id: "nt-crit-" + res.id, kind: "critical-unacknowledged", patientId: res.patientId,
        about: res.display || res.code, dueAt: res.effectiveAt, owner: res.orderedBy || null,
        status: (E.TASK_STATE && E.TASK_STATE.OPEN) || "open",
        detail: { value: res.value, unit: res.unit },
      });
    }
    for (const s of ctx.studies || []) {
      if (!s.report) continue;
      if (s.report.incidental && !s.incidentalActionedBy) {
        out.push({
          id: "nt-inc-" + s.id, kind: "incidental-finding", patientId: s.patientId,
          about: `${s.modality} — ${s.bodySite}`, dueAt: ms(s.reportedAt) + 30 * DAY,
          owner: s.orderedBy || null, status: (E.TASK_STATE && E.TASK_STATE.OPEN) || "open",
          detail: { impression: s.report.impression },
        });
      }
    }
    return out.sort((a, b) => (ms(a.dueAt) ?? Infinity) - (ms(b.dueAt) ?? Infinity));
  }

  const overdueNetworkTasks = (tasks, now) => (tasks || [])
    .filter((t) => t.dueAt != null && ms(now) > ms(t.dueAt));

  root.NET = {
    ORG_KIND, STAFF_ROLE, STAFF_SCOPES, organization, department, staffScopes,
    ORDER_KIND, ORDER_STATE, ORDER_MACHINE, canOrderTransition, URGENCY, URGENCY_DAYS,
    placeOrder, advanceOrder, orderEnvelope,
    SPECIMEN, reportResult, comparableSeries,
    MODALITY, imagingStudy, hasImages, imageAvailability, reportStudy,
    PHARMACY_SCOPES, RX_VERIFY, RX_VALID_DAYS, verifyPrescription, pharmacyEnvelope, dispenseChecks,
    REF_STATE, REF_MACHINE, canRefTransition, REF_DUE_DAYS, sendReferral, advanceReferral,
    networkTasks, overdueNetworkTasks,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
