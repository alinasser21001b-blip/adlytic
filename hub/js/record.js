/* ============================================================
   قريب · النطاقات المكمّلة للسجل — RECORD DOMAINS
   ============================================================
   Documents · Immunizations · Prescriptions · Appointments ·
   Providers · Organizations

   These are the domains the brief names that `emr.js` does not carry.
   `emr.js` holds the clinical CORE — identity, encounters, longitudinal
   lists, episodes, tasks, labs, access. This file holds the surrounding
   domains that connect that core to the healthcare network: the paper a
   patient arrives with, the prescription a doctor writes, the appointment
   that brings them back, and the people and places on the other end.

   Same contract as emr.js: pure rules, no DOM, no storage, no network, so
   `tools/test-record.mjs` runs these exact bytes in Node.

   THE ONE RULE THAT SHAPES EVERYTHING HERE:

   A DOCUMENT IS NOT A CLINICAL RECORD.

   A PDF a patient uploads is evidence that a document exists. It is not a
   diagnosis, not a medication, and not a result — even when it plainly
   contains all three. Anything a machine reads out of it is a CLAIM, marked
   as such, unusable by the safety layer, until a human with a licence looks
   at it and says yes. Australia's My Health Record is the cautionary case:
   documents were uploaded faithfully for a decade and the record still could
   not answer "what medicines is this person on", because a pile of documents
   is not a record. That distinction is enforced below, not merely intended.
   ============================================================ */
(function (root) {
  "use strict";

  const E = root.EMR || {};
  const ms = E.ms || ((t) => (t == null ? null : (typeof t === "number" ? t : new Date(t).getTime())));
  const DAY = 86400000;
  const txt = (v) => String(v == null ? "" : v).trim();

  /* Did the patient assert this themselves? emr.js declares both halves of
     the answer — `SOURCE.PATIENT` on the provenance and `PATIENT_REPORTED` as
     a verification status — and either one alone is enough, because an entry
     stamped one way and not the other is still not a clinician's word. */
  const isSelfReported = (e) => !!e && (e.source === (E.SOURCE && E.SOURCE.PATIENT)
    || e.verificationStatus === (E.VERIFY && E.VERIFY.PATIENT_REPORTED));

  /* =========================================================
     ١ · المستندات — DOCUMENTS
     =========================================================
     The Iraqi reality this exists for: care is private, out-of-pocket and
     fragmented, there is no national exchange to pull from, and the patient
     is already the integration layer — they carry the films and the reports
     between clinics in a plastic bag. The app's job is not to replace that
     bag with a cloud folder. It is to let the bag become a record.
     ========================================================= */

  const DOC_TYPE = {
    LAB: "lab-report",            /* تحليل */
    IMAGING: "imaging-report",    /* تقرير أشعة */
    OPERATIVE: "operative-note",  /* تقرير عملية */
    DISCHARGE: "discharge-summary", /* تقرير خروج */
    PRESCRIPTION: "prescription", /* وصفة */
    REFERRAL: "referral-letter",
    CLINICAL: "clinical-report",  /* تقرير طبي عام */
    VACCINE_CARD: "vaccine-card", /* بطاقة التطعيم */
    OTHER: "other",
  };

  /* WHO produced the paper, which is not the same question as who uploaded
     it. A discharge summary photographed by the patient is still a hospital
     document; treating it as patient-reported because a patient's phone took
     the picture loses the only provenance signal that matters. */
  const DOC_ORIGIN = {
    FACILITY: "facility",     /* issued by a clinic/hospital/lab */
    PATIENT: "patient",       /* the patient wrote or holds it themselves */
    UNKNOWN: "unknown",
  };

  /* The lifecycle of a claim pulled out of a document. Note there is no
     "auto-accepted" state, and no path from EXTRACTED to the record that
     does not pass through a human. */
  const EXTRACT_STATE = {
    NONE: "none",             /* nothing has been read out of it */
    PENDING: "extraction-pending",
    EXTRACTED: "extracted-awaiting-verification",
    CONFIRMED: "confirmed",   /* a human said yes */
    REJECTED: "rejected",     /* a human said no */
  };

  /* Images of medicines and prescriptions never enter our storage — that is a
     standing product rule, and WhatsApp is the channel for them. A CLINICAL
     document the patient chooses to keep in their own record is a different
     thing with a different consent, so the two must not be silently merged.
     This flag is what keeps them apart at the boundary. */
  const RETAINED_TYPES = [DOC_TYPE.LAB, DOC_TYPE.IMAGING, DOC_TYPE.OPERATIVE,
    DOC_TYPE.DISCHARGE, DOC_TYPE.REFERRAL, DOC_TYPE.CLINICAL, DOC_TYPE.VACCINE_CARD, DOC_TYPE.OTHER];
  const isRetainable = (type) => RETAINED_TYPES.indexOf(type) !== -1;

  function canAttach(doc) {
    if (!doc) return { ok: false, reason: "NO_DOCUMENT" };
    if (!txt(doc.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!txt(doc.title)) return { ok: false, reason: "TITLE_REQUIRED" };
    if (!doc.type || !Object.values(DOC_TYPE).includes(doc.type)) return { ok: false, reason: "TYPE_REQUIRED" };
    if (!isRetainable(doc.type)) return { ok: false, reason: "TYPE_NOT_RETAINED" };
    /* A document with no date cannot be placed on a timeline, and a document
       that cannot be placed is a document nobody will find again. */
    if (!doc.documentDate) return { ok: false, reason: "DATE_REQUIRED" };
    if (!txt(doc.uploadedBy)) return { ok: false, reason: "UPLOADER_REQUIRED" };
    return { ok: true };
  }

  function attachDocument(doc, at) {
    const g = canAttach(doc);
    if (!g.ok) return g;
    return { ok: true, document: {
      ...doc,
      id: doc.id || null,
      origin: doc.origin || DOC_ORIGIN.UNKNOWN,
      extractState: EXTRACT_STATE.NONE,
      claims: [],
      uploadedAt: at,
      /* The source is never edited and never replaced. Everything downstream
         of it is derived, and derivation can be re-run; a corrupted original
         cannot be recovered from its own summary. */
      immutable: true,
    } };
  }

  /* A machine read something. That something is a CLAIM: it names the kind of
     clinical fact it thinks it found, but it is not that fact yet. */
  function recordExtraction(doc, claims, by, at) {
    if (!doc) return { ok: false, reason: "NO_DOCUMENT" };
    if (!Array.isArray(claims) || !claims.length) return { ok: false, reason: "NO_CLAIMS" };
    if (!txt(by)) return { ok: false, reason: "EXTRACTOR_REQUIRED" };
    const bad = claims.find((c) => !CLAIM_KIND_LIST.includes(c && c.kind));
    if (bad) return { ok: false, reason: "UNKNOWN_CLAIM_KIND" };
    return { ok: true, document: { ...doc,
      extractState: EXTRACT_STATE.EXTRACTED,
      extractedBy: by, extractedAt: at,
      claims: claims.map((c, i) => ({
        ...c,
        id: c.id || `${doc.id || "doc"}-c${i}`,
        state: EXTRACT_STATE.EXTRACTED,
        /* Provenance is stamped HERE, at the moment of extraction, so no
           later screen has to infer where a fact came from. */
        source: (E.SOURCE && E.SOURCE.EXTERNAL) || "external-import",
        verified: false,
      })),
    } };
  }

  const CLAIM_KIND = { CONDITION: "condition", MEDICATION: "medication", ALLERGY: "allergy",
                       PROCEDURE: "procedure", RESULT: "result", IMMUNIZATION: "immunization" };
  const CLAIM_KIND_LIST = Object.values(CLAIM_KIND);

  /* The gate. An extracted claim becomes a clinical fact only when a licensed
     human confirms it, and only a clinician can — a patient may upload the
     document and may say "yes that is my medicine", but a patient cannot
     write into the authoritative medication list, because the whole point of
     that list is that a prescriber can rely on it. */
  function confirmClaim(doc, claimId, decision, actor, at, reason) {
    if (!doc) return { ok: false, reason: "NO_DOCUMENT" };
    const claim = (doc.claims || []).find((c) => c.id === claimId);
    if (!claim) return { ok: false, reason: "NO_CLAIM" };
    if (claim.state !== EXTRACT_STATE.EXTRACTED) return { ok: false, reason: "ALREADY_DECIDED" };
    if (!actor || !txt(actor.id)) return { ok: false, reason: "ACTOR_REQUIRED" };
    if (!CLINICAL_ROLES.includes(actor.role)) return { ok: false, reason: "CLINICIAN_REQUIRED" };
    if (decision === EXTRACT_STATE.REJECTED && !txt(reason)) return { ok: false, reason: "REASON_REQUIRED" };
    if (decision !== EXTRACT_STATE.CONFIRMED && decision !== EXTRACT_STATE.REJECTED) {
      return { ok: false, reason: "BAD_DECISION" };
    }
    const claims = doc.claims.map((c) => c.id !== claimId ? c : {
      ...c, state: decision, verified: decision === EXTRACT_STATE.CONFIRMED,
      verifiedBy: actor.id, verifiedAt: at, decisionReason: reason || null,
    });
    const open = claims.some((c) => c.state === EXTRACT_STATE.EXTRACTED);
    return { ok: true, document: { ...doc, claims,
      extractState: open ? EXTRACT_STATE.EXTRACTED : EXTRACT_STATE.CONFIRMED } };
  }

  /* Who may turn a machine's claim into a clinical fact. A nurse and a
     receptionist are deliberately absent: this is the act of writing into
     the list a prescriber will rely on, and it needs the person who carries
     the clinical responsibility for it. The names come from emr.js rather
     than being redeclared here — two modules with two vocabularies for the
     same role is how an authorisation check quietly stops matching. */
  const RL = (E.ROLE || {});
  const CLINICAL_ROLES = [RL.DOCTOR || "DOCTOR", RL.SPECIALIST || "SPECIALIST"];

  /* Only confirmed claims may be read as facts. Everything else is visible —
     hiding it would be its own failure — but visibly unconfirmed. */
  const confirmedClaims = (doc) => (doc && doc.claims || []).filter((c) => c.state === EXTRACT_STATE.CONFIRMED);
  const pendingClaims = (doc) => (doc && doc.claims || []).filter((c) => c.state === EXTRACT_STATE.EXTRACTED);

  /* Across a whole record: what is sitting in the tray waiting for a human.
     This is a work queue, and a work queue nobody can see is a backlog that
     grows silently. */
  const awaitingVerification = (docs) => (docs || [])
    .flatMap((d) => pendingClaims(d).map((c) => ({ documentId: d.id, title: d.title, claim: c })));

  /* =========================================================
     ٢ · التطعيمات — IMMUNIZATIONS
     =========================================================
     Modelled separately from procedures because the question a clinician
     actually asks is not "was this given" but "is this person covered", and
     coverage is a function of doses given, the schedule, and time.
     ========================================================= */

  const IMM_STATE = { COMPLETED: "completed", NOT_DONE: "not-done", ENTERED_IN_ERROR: "entered-in-error" };

  /* Where the assertion came from decides how much it can be relied on. A
     card in the patient's hand is good evidence; a memory is weaker than a
     card and stronger than nothing, and the screen must be able to say which
     it is looking at. */
  const IMM_EVIDENCE = { CARD: "vaccination-card", RECORD: "facility-record", RECALL: "patient-recall" };

  function recordImmunization(imm) {
    if (!imm) return { ok: false, reason: "NO_IMMUNIZATION" };
    if (!txt(imm.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!txt(imm.vaccine)) return { ok: false, reason: "VACCINE_REQUIRED" };
    if (!imm.date) return { ok: false, reason: "DATE_REQUIRED" };
    if (imm.evidence && !Object.values(IMM_EVIDENCE).includes(imm.evidence)) {
      return { ok: false, reason: "BAD_EVIDENCE" };
    }
    return { ok: true, immunization: {
      ...imm,
      status: imm.status || IMM_STATE.COMPLETED,
      evidence: imm.evidence || IMM_EVIDENCE.RECALL,
      doseNumber: imm.doseNumber || null,
      /* Recall is never treated as documented. This is the same honesty the
         medication list enforces with UNCONFIRMED. */
      documented: imm.evidence === IMM_EVIDENCE.CARD || imm.evidence === IMM_EVIDENCE.RECORD,
    } };
  }

  const givenImmunizations = (list) => (list || []).filter((i) => i.status === IMM_STATE.COMPLETED);

  /* "Has this person had this vaccine, and can I trust that answer?" */
  function immunityFor(list, vaccine, doses) {
    const given = givenImmunizations(list).filter((i) => E.normAr
      ? E.normAr(i.vaccine) === E.normAr(vaccine) : txt(i.vaccine) === txt(vaccine));
    const documented = given.filter((i) => i.documented);
    const need = doses || 1;
    return {
      vaccine, given: given.length, documented: documented.length, required: need,
      complete: given.length >= need,
      /* Complete BY RECALL ONLY is a different clinical situation from
         complete on paper, and collapsing them is how a child gets missed. */
      documentedComplete: documented.length >= need,
    };
  }

  /* =========================================================
     ٣ · الوصفات — PRESCRIPTIONS
     =========================================================
     A prescription is structured or it is not a prescription. "Metformin" is
     a word; "Metformin 500 mg twice daily for 30 days, started 29 July,
     prescribed by Dr X for type 2 diabetes" is a clinical instruction that a
     pharmacist can dispense against and a later clinician can reason about.
     A medication history that is a list of names cannot answer the two
     questions that matter — what dose, and why did it stop.
     ========================================================= */

  const FREQ = {
    OD: { code: "OD", perDay: 1, ar: "مرة يومياً", en: "once daily" },
    BID: { code: "BID", perDay: 2, ar: "مرتين يومياً", en: "twice daily" },
    TID: { code: "TID", perDay: 3, ar: "٣ مرات يومياً", en: "three times daily" },
    QID: { code: "QID", perDay: 4, ar: "٤ مرات يومياً", en: "four times daily" },
    PRN: { code: "PRN", perDay: null, ar: "عند اللزوم", en: "as needed" },
    WEEKLY: { code: "WEEKLY", perDay: 1 / 7, ar: "أسبوعياً", en: "weekly" },
  };

  const RX_REQUIRED = ["patientId", "prescriberId", "medication", "dose", "frequency"];

  function canPrescribe(rx, prescriber) {
    if (!rx) return { ok: false, reason: "NO_PRESCRIPTION" };
    if (!prescriber) return { ok: false, reason: "NO_PRESCRIBER" };
    /* An unverified account may not write a prescription into a record that
       other clinicians will trust. The network's verification state is the
       gate, and it lives in domain.js — read it, do not re-implement it. */
    if (prescriber.licenseStatus && prescriber.licenseStatus !== "VERIFIED") {
      return { ok: false, reason: "PRESCRIBER_UNVERIFIED" };
    }
    const missing = RX_REQUIRED.filter((k) => !txt(rx[k]));
    if (missing.length) return { ok: false, reason: "INCOMPLETE", missing };
    if (!FREQ[rx.frequency]) return { ok: false, reason: "BAD_FREQUENCY" };
    /* Duration is optional ONLY for an explicitly open-ended course. Silence
       about duration is how a 5-day antibiotic ends up looking permanent. */
    if (!rx.openEnded && !(rx.durationDays > 0)) return { ok: false, reason: "DURATION_REQUIRED" };
    /* The indication is what lets a later clinician decide whether to keep,
       change or stop. Without it every drug on the list is unexplainable. */
    if (!txt(rx.indication)) return { ok: false, reason: "INDICATION_REQUIRED" };
    return { ok: true };
  }

  /* A prescription PRODUCES a medication-list entry. The two are different
     objects on purpose: the prescription is an immutable clinical order with
     an author and a moment; the medication is the mutable longitudinal fact
     it created, which some later clinician will stop for some later reason.
     Collapsing them is why so many systems cannot say who started a drug. */
  function issuePrescription(rx, prescriber, at) {
    const g = canPrescribe(rx, prescriber);
    if (!g.ok) return g;
    const start = rx.startDate || at;
    const prescription = {
      ...rx, id: rx.id || null, prescriberId: prescriber.id,
      issuedAt: at, startDate: start,
      endDate: rx.openEnded ? null : new Date(ms(start) + rx.durationDays * DAY).toISOString().slice(0, 10),
      immutable: true,
    };
    /* `display` and `prescriberId`, NOT `name` and `prescribedBy`. Those are
       emr.js's field names and this module conforms to them rather than
       inventing a parallel vocabulary. The first version used its own names,
       which produced a medication that worked perfectly everywhere except
       the timeline — where it appeared with no title and no author, because
       reading a property that was never there returns undefined instead of
       raising anything. Two modules, two vocabularies, one silent hole. */
    const medication = {
      id: rx.id ? rx.id + "-med" : null,
      patientId: rx.patientId,
      display: rx.medication, dose: rx.dose, frequency: rx.frequency,
      route: rx.route || null,
      indication: rx.indication,
      startDate: start,
      durationDays: rx.openEnded ? null : rx.durationDays,
      status: (E.MED_STATE && E.MED_STATE.ACTIVE) || "active",
      prescriberId: prescriber.id,
      prescriptionId: rx.id || null,
      lastConfirmed: start,
      source: (E.SOURCE && E.SOURCE.CLINICIAN) || "clinician",
    };
    return { ok: true, prescription, medication };
  }

  const DISPENSE_STATE = { PENDING: "pending", DISPENSED: "dispensed", PARTIAL: "partial", NOT_DISPENSED: "not-dispensed" };

  /* The pharmacy end of the loop. A dispense is an OBSERVATION about a
     prescription, never an edit of it — the pharmacy cannot change what the
     doctor wrote, and the doctor's order stays readable exactly as issued.

     Note what this does NOT do: it does not mark the medication as taken. A
     dispensed box on a counter is not a swallowed tablet, and a record that
     conflates the two tells the next clinician a comfortable lie. */
  function recordDispense(rx, d, at) {
    if (!rx) return { ok: false, reason: "NO_PRESCRIPTION" };
    if (!d || !txt(d.pharmacyId)) return { ok: false, reason: "PHARMACY_REQUIRED" };
    if (!Object.values(DISPENSE_STATE).includes(d.state) || d.state === DISPENSE_STATE.PENDING) {
      return { ok: false, reason: "BAD_STATE" };
    }
    if (d.state === DISPENSE_STATE.PARTIAL && !txt(d.note)) return { ok: false, reason: "NOTE_REQUIRED" };
    /* A substitution is a clinical event, not a retail one. It is recorded
       under its own name so a later clinician sees the patient is on a
       different brand than the one prescribed. */
    if (d.substituted && !txt(d.substitutedWith)) return { ok: false, reason: "SUBSTITUTE_REQUIRED" };
    return { ok: true, dispense: {
      prescriptionId: rx.id, pharmacyId: d.pharmacyId, state: d.state,
      substituted: !!d.substituted, substitutedWith: d.substitutedWith || null,
      note: d.note || null, at,
    } };
  }

  /* =========================================================
     ٤ · المواعيد — APPOINTMENTS
     ========================================================= */

  const APPT_STATE = { REQUESTED: "requested", BOOKED: "booked", ARRIVED: "arrived",
                       FULFILLED: "fulfilled", CANCELLED: "cancelled", NO_SHOW: "no-show" };

  const APPT_MACHINE = {
    requested: ["booked", "cancelled"],
    booked: ["arrived", "cancelled", "no-show"],
    arrived: ["fulfilled", "cancelled"],
    fulfilled: [],
    cancelled: [],
    "no-show": ["booked"],   /* rebooking a missed appointment is normal */
  };

  const canApptTransition = (from, to) => (APPT_MACHINE[from] || []).indexOf(to) !== -1;

  function bookAppointment(a, at) {
    if (!a) return { ok: false, reason: "NO_APPOINTMENT" };
    if (!txt(a.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!txt(a.providerId)) return { ok: false, reason: "PROVIDER_REQUIRED" };
    if (!a.startsAt) return { ok: false, reason: "TIME_REQUIRED" };
    if (ms(a.startsAt) < ms(at)) return { ok: false, reason: "IN_THE_PAST" };
    return { ok: true, appointment: { ...a, state: APPT_STATE.BOOKED, bookedAt: at } };
  }

  /* An appointment becoming an encounter is the hinge of the whole product:
     it is the moment the network layer hands over to the record layer. It
     may only happen when the patient actually turned up, because an encounter
     is an assertion that a clinician saw a person. */
  function appointmentToEncounter(a) {
    if (!a) return { ok: false, reason: "NO_APPOINTMENT" };
    if (a.state !== APPT_STATE.ARRIVED) return { ok: false, reason: "NOT_ARRIVED" };
    return { ok: true, encounter: {
      patientId: a.patientId, clinicianId: a.providerId, facilityId: a.facilityId || null,
      type: a.encounterType || (E.ENC_TYPE && E.ENC_TYPE.OUTPATIENT) || "outpatient",
      appointmentId: a.id || null,
      state: (E.ENC_STATE && E.ENC_STATE.DRAFT) || "draft",
      startedAt: a.arrivedAt || a.startsAt,
    } };
  }

  /* =========================================================
     ٥ · مقدّمو الرعاية والمنشآت — PROVIDERS & ORGANIZATIONS
     =========================================================
     Kept deliberately thin. The network already has a rich directory in
     data.js; this is the CLINICAL contract that directory must satisfy for a
     provider to be allowed to touch a record.
     ========================================================= */

  const PROVIDER_KIND = { DOCTOR: "doctor", NURSE: "nurse", PHARMACIST: "pharmacist",
                          LAB: "lab", RADIOLOGY: "radiology", ADMIN: "admin" };

  const ORG_KIND = { CLINIC: "clinic", HOSPITAL: "hospital", PHARMACY: "pharmacy",
                     LAB: "laboratory", IMAGING: "imaging-centre" };

  const LICENSE = { VERIFIED: "VERIFIED", SELF_ASSERTED: "SELF_ASSERTED",
                    UNVERIFIED: "UNVERIFIED", REVOKED: "REVOKED", EXPIRED: "EXPIRED" };

  /* Nobody writes themselves into the record as trustworthy. The three things
     below are the minimum a provider must have before anything they assert
     is allowed to carry weight, and each is checkable by a human being. */
  const VERIFY_REQUIRED = ["licenseNumber", "syndicateId", "specialty"];

  function providerVerification(p) {
    if (!p) return { status: LICENSE.UNVERIFIED, missing: ["provider"] };
    const missing = VERIFY_REQUIRED.filter((k) => !txt(p[k]));
    if (p.licenseStatus === LICENSE.REVOKED) return { status: LICENSE.REVOKED, missing };
    if (p.licenseExpiry && ms(p.licenseExpiry) < Date.now()) return { status: LICENSE.EXPIRED, missing };
    if (p.licenseStatus === LICENSE.VERIFIED && !missing.length) return { status: LICENSE.VERIFIED, missing: [] };
    if (missing.length < VERIFY_REQUIRED.length) return { status: LICENSE.SELF_ASSERTED, missing };
    return { status: LICENSE.UNVERIFIED, missing };
  }

  /* Two different gates, and conflating them is a real safety bug: an
     unverified doctor may still READ a record the patient explicitly shared
     with them — refusing that would just push the consultation back to a
     WhatsApp photo, which is strictly worse. What they may not do is WRITE
     an assertion other clinicians will rely on. */
  const canWriteClinical = (p) => providerVerification(p).status === LICENSE.VERIFIED;
  const canReadShared = (p) => {
    const s = providerVerification(p).status;
    return s === LICENSE.VERIFIED || s === LICENSE.SELF_ASSERTED;
  };

  /* =========================================================
     ٦ · ملف المريض — PATIENT PROFILE
     =========================================================
     One assembled view of "who is this person", derived from the domains
     above rather than stored as its own copy. Stored summaries go stale;
     that is precisely the mechanism by which a stopped drug keeps appearing
     on a card for three years.
     ========================================================= */

  function patientProfile(p, rec, now) {
    if (!p) return null;
    const r = rec || {};
    const meds = E.currentMedications ? E.currentMedications(r.medications, now) : (r.medications || []);
    const conds = E.activeConditions ? E.activeConditions(r.conditions, now) : (r.conditions || []);
    const allergies = E.criticalAllergies ? E.criticalAllergies(r.allergies) : (r.allergies || []);
    return {
      id: p.id,
      name: E.fullName ? E.fullName(p) : p.name,
      age: E.ageOf ? E.ageOf(p.birthDate, now) : null,
      sex: p.sex || null,
      birthDate: p.birthDate || null,
      birthDateEstimated: !!p.birthDateEstimated,
      photo: p.photo || null,
      contacts: p.contacts || [],
      emergencyContact: p.emergencyContact || null,
      identifiers: (p.identifiers || []).map((i) => ({
        type: i.type, verification: E.verifyLevel ? E.verifyLevel(i) : "self_declared",
        /* The VALUE is not in the profile projection. A screen that needs to
           display a card number asks for it explicitly and gets audited for
           it; a summary object that carries it everywhere leaks it into every
           log, cache and share by default. */
      })),
      activeConditions: conds.length,
      currentMedications: meds.length,
      criticalAllergies: allergies.length,
      immunizations: givenImmunizations(r.immunizations).length,
      documents: (r.documents || []).length,
      awaitingVerification: awaitingVerification(r.documents).length,
      /* The single most useful number on a doctor's first screen: how much of
         this record is claims nobody has checked yet. */
      registeredAt: p.registeredAt || null,
    };
  }

  /* =========================================================
     ٧ · ملخّص ما قبل الزيارة — PRE-VISIT BRIEF
     =========================================================
     The brief's section 17, and the real test of the whole product: not how
     much the record holds, but how fast the important part comes out of it.

     Everything here is DERIVED. Nothing is a stored summary. It is ordered by
     what can hurt the patient in the next ten minutes, not by recency.
     ========================================================= */

  function preVisitBrief(p, rec, now, lang) {
    const ar = lang !== "en";
    const r = rec || {};
    const prof = patientProfile(p, r, now);
    if (!prof) return null;

    const allergies = (E.criticalAllergies ? E.criticalAllergies(r.allergies) : (r.allergies || []));
    const conds = (E.activeConditions ? E.activeConditions(r.conditions, now) : (r.conditions || []));
    const meds = (E.currentMedications ? E.currentMedications(r.medications, now) : (r.medications || []));

    /* Abnormal results NOBODY has acknowledged. This is the failure mode the
       closed-loop literature says kills most often: the result arrived, it
       was abnormal, and it landed in a queue no human owned. */
    const unacked = (r.results || [])
      .filter((x) => (E.isAbnormal ? E.isAbnormal(x) : false) && !x.acknowledgedBy)
      .sort((a, b) => ms(b.effectiveAt) - ms(a.effectiveAt));

    const pending = (r.results || []).filter((x) => x.status === "pending");
    const open = E.openTasks ? E.openTasks(r.tasks, now) : (r.tasks || []);
    const overdue = open.filter((t) => (E.isOverdue ? E.isOverdue(t, now) : false));

    /* One trend per test, kept only when it MOVED — not the newest, not the
       first. A brief that lists every lab is a brief nobody reads.

       `code` and `effectiveAt` are emr.js's field names, not names invented
       here. The first version of this function used `test` and `at`, which
       type-checked perfectly and silently produced zero trends forever,
       because nothing in JavaScript objects to reading a property that was
       never going to be there. */
    const moved = [];
    for (const code of [...new Set((r.results || []).map((x) => x.code).filter(Boolean))]) {
      const t = E.trend ? E.trend(r.results, code) : null;
      if (t && t.comparable && t.direction && t.direction !== "flat") moved.push(t);
    }

    const lastEnc = (r.encounters || [])
      .filter((e) => e.state !== (E.ENC_STATE && E.ENC_STATE.VOID))
      .sort((a, b) => ms(b.startedAt) - ms(a.startedAt))[0] || null;

    return {
      headline: `${prof.age != null ? prof.age : "؟"} ${ar ? "سنة" : "y"} · ${sexLabel(prof.sex, ar)}`,
      patient: prof,
      /* Ordered by danger, deliberately. */
      /* `selfReported` is projected, not left for the screen to dig out of
         storage. A clinician reading "penicillin — anaphylaxis" needs to know
         whether a colleague verified that or the patient typed it in the
         waiting room; both are worth having and they are not the same claim.
         Dropping it here — which this projection did — meant the brief
         presented every patient-entered line with the same authority as a
         signed one. */
      allergies: allergies.map((a) => ({ substance: a.substance, reaction: a.reaction || null,
        criticality: a.criticality, selfReported: isSelfReported(a) })),
      /* The brief is a PROJECTION with its own field names — `name` here is
         the label a screen prints, deliberately decoupled from the storage
         field it came from. Sections 25 and 29: the UI must not be wired
         straight to the record's schema. */
      active: conds.map((c) => ({ name: c.display, since: c.onsetDate || null,
        lastReviewed: c.lastReviewed || null, chronic: c.chronic === true,
        selfReported: isSelfReported(c),
        /* activeConditions already computed this — recomputing it here is how
           two answers to the same question start to disagree. */
        stale: c.stale === true })),
      medications: meds.map((m) => ({ name: m.display, dose: m.dose || null,
        frequency: m.frequency || null, indication: m.indication || null,
        selfReported: isSelfReported(m),
        status: E.medStatus ? E.medStatus(m, now) : m.status })),
      /* The newest reading of each vital, projected the same way everything
         else here is. A blood pressure the patient took last week is often
         the most decision-relevant number in the whole record for a follow-up
         visit, and it was reaching the clinician nowhere. */
      /* The two blood-pressure components are excluded here because
         `bloodPressure` below already carries them as one reading. Leaving
         them in printed the same measurement three times — 148/92, then
         systolic 148, then diastolic 92 — which reads to a clinician as three
         findings rather than one. */
      vitals: (E.latestVitals ? E.latestVitals(r.vitals) : [])
        .filter((v) => v.kind !== (E.VITAL && E.VITAL.BP_SYS) && v.kind !== (E.VITAL && E.VITAL.BP_DIA))
        .map((v) => ({
        kind: v.kind, name: E.vitalLabel ? E.vitalLabel(v.kind, ar) : v.kind,
        value: v.value, unit: v.unit || null, at: v.effectiveAt,
        flag: v.flag || null, selfReported: isSelfReported(v) })),
      bloodPressure: (E.bloodPressure ? E.bloodPressure(r.vitals) : []).slice(0, 1)
        .map((x) => ({ at: x.at, systolic: x.systolic.value,
          diastolic: x.diastolic ? x.diastolic.value : null,
          unit: x.systolic.unit, abnormal: x.abnormal,
          selfReported: isSelfReported(x.systolic) }))[0] || null,
      unacknowledgedAbnormal: unacked.slice(0, 4).map((x) => ({ code: x.code, name: x.display || x.code,
        value: x.value, unit: x.unit || null, at: x.effectiveAt })),
      trends: moved.slice(0, 3),
      /* Surgical history. `EMR.snapshot` has projected `majorProcedures` for
         a long time; the pre-visit brief — the thing a clinician actually
         opens — never carried it. A cholecystectomy explains an absent
         gallbladder on today's ultrasound, and an anaesthetic history is a
         question somebody has to ask before the next operation. Major only:
         the brief is what changes a decision in thirty seconds, and a list of
         every dressing change is not that. */
      procedures: (r.procedures || [])
        .filter((x) => x.major)
        .sort((a, b) => ms(b.performedAt) - ms(a.performedAt))
        .slice(0, 4)
        .map((x) => ({ name: x.display, at: x.performedAt || null,
          selfReported: isSelfReported(x) })),
      pending: pending.map((x) => ({ code: x.code, name: x.display || x.code, orderedAt: x.orderedAt || null })),
      overdue: overdue.map((t) => ({ kind: t.kind, dueAt: t.dueAt, about: t.about || null })),
      lastEncounter: lastEnc ? { at: lastEnc.startedAt, clinicianId: lastEnc.clinicianId,
        assessment: lastEnc.assessment || null } : null,
      unverifiedClaims: prof.awaitingVerification,
      /* An explicit statement of what this brief is NOT, carried in the data
         so no UI can quietly drop it. A brief is a starting point for a
         conversation with the patient, never a substitute for one. */
      caveat: ar
        ? "هذا ملخّص مشتق من السجل. لا يغني عن سؤال المريض، وما لم يُوثَّق لا يظهر هنا."
        : "Derived from the record. It does not replace asking the patient, and what was never recorded is not here.",
    };
  }

  const sexLabel = (s, ar) => s === "male" ? (ar ? "ذكر" : "male")
    : s === "female" ? (ar ? "أنثى" : "female") : (ar ? "غير محدّد" : "unspecified");

  root.REC = {
    DOC_TYPE, DOC_ORIGIN, EXTRACT_STATE, CLAIM_KIND, isRetainable,
    canAttach, attachDocument, recordExtraction, confirmClaim,
    confirmedClaims, pendingClaims, awaitingVerification,
    IMM_STATE, IMM_EVIDENCE, recordImmunization, givenImmunizations, immunityFor,
    FREQ, RX_REQUIRED, canPrescribe, issuePrescription, DISPENSE_STATE, recordDispense,
    APPT_STATE, APPT_MACHINE, canApptTransition, bookAppointment, appointmentToEncounter,
    PROVIDER_KIND, ORG_KIND, LICENSE, providerVerification, canWriteClinical, canReadShared,
    patientProfile, preVisitBrief, sexLabel,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
