/* ============================================================
   قريب · السجل الصحي الطولي — طبقة النطاق السريري
   QAREEB · LONGITUDINAL PATIENT RECORD — CLINICAL DOMAIN
   ============================================================
   Pure rules. No DOM, no storage, no network. Everything is a function of its
   arguments so `tools/test-emr.mjs` runs the shipped bytes in Node.

   WHY THIS FILE IS SHAPED THIS WAY — the research decided it, not taste:

   1. ENCOUNTERS ARE IMMUTABLE ONCE SIGNED. Corrections are additive addenda
      with author, timestamp and reason. England's GP2GP loses data because a
      record was engineered to move a document rather than preserve meaning;
      the US wrong-patient literature shows silent edits are undetectable
      after the fact. A signed clinical assertion is a historical fact about
      what a clinician believed at a moment, and history does not get rewritten.

   2. LONGITUDINAL LISTS LIVE OUTSIDE DOCUMENTS. Medications, problems and
      allergies are NEVER stored inside an encounter. Documents REFERENCE the
      lists as they stood. This single rule is what separates a longitudinal
      record from a chronological pile of PDFs — and it is Australia's most
      expensive regret, now costing hundreds of millions to unwind.

   3. EPISODE OF CARE EXISTS FROM DAY ONE. Adding an episode layer to a
      visit-keyed database is a migration, not a feature. It is the thing that
      turns six scattered events into one readable story.

   4. IDENTITY IS NEVER THE NATIONAL ID. Iraq's card coverage is unverified,
      displaced patients may hold none, and the US spent 27 years proving a
      system can scale without a national identifier — at a permanent cost.
      The primary key is ours, opaque and stable; every real-world identifier
      is one optional, typed attribute among several.

   5. NOTHING MERGES SILENTLY. Not duplicate patients, not external records.
      An overlay — two people fused into one chart — is rarer than a duplicate,
      invisible, self-concealing, and the failure mode that kills.
   ============================================================ */
(function (root) {
  "use strict";

  /* =========================================================
     ١ · الهوية — IDENTITY
     ========================================================= */

  /* Identifier types we accept. All optional; none is the key. `national` is
     listed first because it is the most useful WHEN present, not because it
     is required — a displaced patient with only a UNHCR number is still a
     patient, and a system that cannot register them is not usable in Iraq. */
  const ID_TYPE = {
    NATIONAL: "national",      /* البطاقة الوطنية */
    PASSPORT: "passport",
    MOBILE: "mobile",
    UNHCR: "unhcr",            /* نازح / لاجئ */
    FACILITY: "facility",      /* رقم الملف في عيادة بعينها */
    EXTERNAL: "external",      /* معرّف من نظام آخر */
  };

  /* A patient is identifiable enough to register if we can plausibly find
     them again. Name alone is not enough in a country where a dozen people
     in one district share it. */
  function canRegister(p) {
    if (!p) return { ok: false, reason: "NO_PATIENT" };
    const name = String(p.name || "").trim();
    if (name.length < 3) return { ok: false, reason: "NAME_REQUIRED" };
    const hasId = (p.identifiers || []).some((i) => i.value && String(i.value).trim());
    const hasDob = !!p.birthDate;
    if (!hasId && !hasDob) return { ok: false, reason: "NEED_IDENTIFIER_OR_DOB" };
    return { ok: true, reason: null };
  }

  /* =========================================================
     ٢ · المطابقة — PATIENT MATCHING
     =========================================================
     Weighted, explainable, and it NEVER merges. It produces a score and the
     factors behind it so a human can see why the system thinks two records
     might be one person. Overlays are created by confident automation.
     ========================================================= */

  /* Calibrated so that an exact full name PLUS an exact date of birth
     reaches review on its own (30+30+5 = 65 > REVIEW). An earlier weighting
     scored that pair at 45 and silently dropped a genuine duplicate — which
     is exactly the failure this whole module exists to prevent. */
  const MATCH_WEIGHTS = {
    national: 55,   /* strong when present — but forgeable and mistyped */
    passport: 45,
    mobile: 25,     /* shared within families in Iraq; useful, not decisive */
    name: 30,
    birthDate: 30,
    sex: 5,
    address: 10,
  };

  const MATCH = { AUTO_NONE: 0, REVIEW: 60, STRONG: 85 };

  /* Arabic names carry orthographic variation that is not a difference:
     أ إ آ ا · ى ي · ة ه · ؤ ئ ء, plus the definite article and tatweel.
     Treating "عبدالله" and "عبد الله" as different people is a duplicate
     factory; treating them as certainly the same is an overlay factory. This
     normalises for COMPARISON only — the stored name is never altered. */
  function normAr(s) {
    return String(s || "")
      .replace(/[ً-ْـ]/g, "")      /* harakat + tatweel */
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[ةه]/g, "ه")
      .replace(/[ؤئ]/g, "ء")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /* For WHOLE-NAME equality only. Iraqi compound names are written both
     joined and split — عبدالله / عبد الله, عبدالرحمن / عبد الرحمن — and the
     space is orthography, not a difference. normAr keeps spaces because the
     token comparison needs them; this drops them for the exact-match test. */
  const normArKey = (s) => normAr(s).replace(/\s+/g, "");

  const idOf = (p, type) => ((p.identifiers || []).find((i) => i.type === type) || {}).value || null;

  function matchScore(a, b) {
    const factors = [];
    let score = 0;

    for (const t of [ID_TYPE.NATIONAL, ID_TYPE.PASSPORT, ID_TYPE.MOBILE]) {
      const x = idOf(a, t), y = idOf(b, t);
      if (x && y) {
        if (String(x).trim() === String(y).trim()) {
          score += MATCH_WEIGHTS[t]; factors.push({ f: t, agree: true, w: MATCH_WEIGHTS[t] });
        } else {
          /* A DISAGREEING strong identifier is evidence AGAINST, and must be
             able to overpower agreeing weak ones. Two people who share a
             surname and a birth year but hold different national cards are
             two people. */
          score -= MATCH_WEIGHTS[t]; factors.push({ f: t, agree: false, w: -MATCH_WEIGHTS[t] });
        }
      }
    }

    const na = normAr(a.name), nb = normAr(b.name);
    if (na && nb) {
      if (normArKey(a.name) === normArKey(b.name)) { score += MATCH_WEIGHTS.name; factors.push({ f: "name", agree: true, w: MATCH_WEIGHTS.name }); }
      else {
        /* Partial credit for shared name tokens — Iraqi names are long chains
           (given + father + grandfather + tribe) and get truncated variously. */
        const ta = na.split(" "), tb = nb.split(" ");
        const shared = ta.filter((t) => t.length > 2 && tb.includes(t)).length;
        const w = Math.round((shared / Math.max(ta.length, tb.length)) * MATCH_WEIGHTS.name);
        if (w > 0) { score += w; factors.push({ f: "name-partial", agree: true, w }); }
      }
    }

    if (a.birthDate && b.birthDate) {
      if (a.birthDate === b.birthDate) { score += MATCH_WEIGHTS.birthDate; factors.push({ f: "birthDate", agree: true, w: MATCH_WEIGHTS.birthDate }); }
      else { score -= 15; factors.push({ f: "birthDate", agree: false, w: -15 }); }
    }
    if (a.sex && b.sex) {
      if (a.sex === b.sex) { score += MATCH_WEIGHTS.sex; factors.push({ f: "sex", agree: true, w: MATCH_WEIGHTS.sex }); }
      else { score -= 40; factors.push({ f: "sex", agree: false, w: -40 }); }
    }
    if (a.district && b.district && a.district === b.district) {
      score += MATCH_WEIGHTS.address; factors.push({ f: "district", agree: true, w: MATCH_WEIGHTS.address });
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  /* The verdict is never "merge". It is "a human must look". */
  function matchVerdict(score) {
    if (score >= MATCH.STRONG) return "REVIEW_LIKELY";   /* still a human decision */
    if (score >= MATCH.REVIEW) return "REVIEW_POSSIBLE";
    return "DISTINCT";
  }

  function findCandidates(candidate, population) {
    return (population || [])
      .filter((p) => p.id !== candidate.id)
      .map((p) => { const m = matchScore(candidate, p); return { patientId: p.id, ...m, verdict: matchVerdict(m.score) }; })
      .filter((r) => r.verdict !== "DISTINCT")
      .sort((x, y) => y.score - x.score);
  }

  const MERGE_STATE = { PENDING: "PENDING", SAME: "SAME", DIFFERENT: "DIFFERENT", MERGED: "MERGED", UNMERGED: "UNMERGED" };

  /* A merge is reversible by construction: the surviving record keeps the
     absorbed id, so an un-merge is a data operation rather than an
     archaeology project. Nothing is ever deleted. */
  function mergeDecision(review, decision, actor, at, reason) {
    if (!review || review.state !== MERGE_STATE.PENDING) return { ok: false, reason: "NOT_PENDING" };
    if (!actor) return { ok: false, reason: "ACTOR_REQUIRED" };
    if (decision === MERGE_STATE.MERGED && !reason) return { ok: false, reason: "REASON_REQUIRED" };
    return { ok: true, review: { ...review, state: decision, decidedBy: actor, decidedAt: at, reason: reason || null } };
  }

  /* =========================================================
     ٣ · الزيارة — ENCOUNTER
     ========================================================= */

  const ENC_STATE = { DRAFT: "draft", SIGNED: "signed", AMENDED: "amended", VOID: "entered-in-error" };
  const ENC_TYPE = { OUTPATIENT: "outpatient", EMERGENCY: "emergency", INPATIENT: "inpatient",
                     FOLLOWUP: "followup", PREOP: "preop", POSTOP: "postop", TELE: "tele" };

  /* Required to SIGN — not to save a draft. The distinction matters: a
     clinician mid-consultation must never be blocked by a validator. The gate
     is at the point the note becomes a clinical assertion others will rely on.

     Deliberately short. Every field added here is a field a doctor must type
     under time pressure, and the US note-bloat literature is unambiguous
     about what happens when documentation demands exceed clinical need. */
  const SIGN_REQUIRED = ["patientId", "clinicianId", "facilityId", "type", "chiefComplaint", "assessment"];

  function canSign(enc) {
    if (!enc) return { ok: false, missing: ["encounter"] };
    if (enc.state === ENC_STATE.SIGNED || enc.state === ENC_STATE.AMENDED) return { ok: false, missing: [], reason: "ALREADY_SIGNED" };
    const missing = SIGN_REQUIRED.filter((k) => !String(enc[k] || "").trim());
    return missing.length ? { ok: false, missing, reason: "INCOMPLETE" } : { ok: true, missing: [] };
  }

  function signEncounter(enc, actor, at) {
    const g = canSign(enc);
    if (!g.ok) return { ok: false, reason: g.reason, missing: g.missing };
    if (actor !== enc.clinicianId) return { ok: false, reason: "ONLY_AUTHOR_MAY_SIGN" };
    return { ok: true, encounter: { ...enc, state: ENC_STATE.SIGNED, signedBy: actor, signedAt: at } };
  }

  /* THE CORE IMMUTABILITY RULE. A signed encounter has no edit path — only an
     addendum, which is a new authored assertion that references the original.
     The original text is never touched, so what the first clinician actually
     wrote remains readable forever. */
  function addAddendum(enc, addendum) {
    if (!enc) return { ok: false, reason: "NO_ENCOUNTER" };
    if (enc.state === ENC_STATE.DRAFT) return { ok: false, reason: "SIGN_FIRST" };
    if (enc.state === ENC_STATE.VOID) return { ok: false, reason: "ENCOUNTER_VOID" };
    if (!addendum || !String(addendum.text || "").trim()) return { ok: false, reason: "TEXT_REQUIRED" };
    if (!addendum.authorId) return { ok: false, reason: "AUTHOR_REQUIRED" };
    if (!String(addendum.reason || "").trim()) return { ok: false, reason: "REASON_REQUIRED" };
    const list = [...(enc.addenda || []), {
      id: "ad" + ((enc.addenda || []).length + 1),
      text: String(addendum.text).trim(), reason: String(addendum.reason).trim(),
      authorId: addendum.authorId, at: addendum.at,
    }];
    return { ok: true, encounter: { ...enc, state: ENC_STATE.AMENDED, addenda: list } };
  }

  /* Voiding is for wrong-patient entry — the one case where the content must
     stop being believed. It is never a delete: the record persists, marked,
     with who did it and why, because a vanished encounter is indistinguishable
     from a concealed one. */
  function voidEncounter(enc, actor, at, reason) {
    if (!enc) return { ok: false, reason: "NO_ENCOUNTER" };
    if (!actor || !String(reason || "").trim()) return { ok: false, reason: "ACTOR_AND_REASON_REQUIRED" };
    return { ok: true, encounter: { ...enc, state: ENC_STATE.VOID, voidedBy: actor, voidedAt: at, voidReason: reason } };
  }

  /* =========================================================
     ٤ · القوائم الطولية — LONGITUDINAL LISTS
     ========================================================= */

  const COND_STATE = { ACTIVE: "active", INACTIVE: "inactive", RESOLVED: "resolved", ERROR: "entered-in-error" };
  const VERIFY = { CONFIRMED: "confirmed", PROVISIONAL: "provisional", PATIENT_REPORTED: "patient-reported",
                   EXTERNAL: "external-unverified", REFUTED: "refuted" };

  /* Chronic is ORTHOGONAL to active — diabetes is chronic AND active; a healed
     fracture is neither. Collapsing them into one flag is why problem lists
     rot into a list of everything that ever happened. */
  const isChronicActive = (c) => c.chronic === true && c.clinicalStatus === COND_STATE.ACTIVE;

  /* A problem nobody has looked at in 18 months is not a current problem, it
     is an archaeological one — and the screen should say so rather than
     presenting it with the same confidence as today's assessment. */
  const STALE_DAYS = 548;
  function isStale(c, now) {
    const t = c.lastReviewed || c.onsetDate || c.recordedAt;
    if (!t) return true;
    const at = ms(t);
    return at == null || Number.isNaN(at) || (ms(now) - at) / 86400000 > STALE_DAYS;
  }

  const activeConditions = (list, now) => (list || [])
    .filter((c) => c.clinicalStatus === COND_STATE.ACTIVE)
    .map((c) => ({ ...c, stale: isStale(c, now) }))
    .sort((a, b) => (b.chronic === true) - (a.chronic === true) || (a.stale - b.stale));

  /* ---- MEDICATION: the hardest field in medicine ---- */
  const MED_STATE = { ACTIVE: "active", STOPPED: "stopped", COMPLETED: "completed", UNCONFIRMED: "unconfirmed" };

  /* "Why was it stopped" is NOT optional. Without it no later clinician can
     tell whether the drug worked, failed, or caused a reaction — and those
     three lead to opposite decisions. */
  function stopMedication(med, stop) {
    if (!med) return { ok: false, reason: "NO_MEDICATION" };
    if (med.status === MED_STATE.STOPPED) return { ok: false, reason: "ALREADY_STOPPED" };
    if (!stop || !String(stop.reason || "").trim()) return { ok: false, reason: "STOP_REASON_REQUIRED" };
    if (!stop.actor) return { ok: false, reason: "ACTOR_REQUIRED" };
    return { ok: true, medication: { ...med, status: MED_STATE.STOPPED,
      stopDate: stop.at, stopReason: String(stop.reason).trim(), stoppedBy: stop.actor } };
  }

  /* An expired course must never be displayed as current. When we cannot tell,
     we say UNCONFIRMED — the honest third state that the brief demands and
     that almost no real system implements. */
  const MED_GRACE = 2;
  function medStatus(med, now) {
    if (!med) return MED_STATE.UNCONFIRMED;
    if (med.status === MED_STATE.STOPPED || med.status === MED_STATE.COMPLETED) return med.status;
    if (!med.startDate) return MED_STATE.UNCONFIRMED;
    const days = (now - new Date(med.startDate).getTime()) / 86400000;
    /* A finite course that is long past its end is not current, however it
       was left in the chart. */
    if (med.durationDays && days > med.durationDays * MED_GRACE) return MED_STATE.UNCONFIRMED;
    /* An open-ended medicine is current because a human RECONFIRMED it, not
       because it is chronic. Metformin prescribed two years ago and reviewed
       last month is current; the same drug never looked at again is a
       guess, and the screen must say so. */
    const anchor = med.lastConfirmed ? new Date(med.lastConfirmed).getTime() : new Date(med.startDate).getTime();
    const sinceConfirmed = (now - anchor) / 86400000;
    if (!med.durationDays && sinceConfirmed > 180) return MED_STATE.UNCONFIRMED;
    return MED_STATE.ACTIVE;
  }

  const currentMedications = (list, now) => (list || [])
    .map((m) => ({ ...m, status: medStatus(m, now) }))
    .filter((m) => m.status === MED_STATE.ACTIVE || m.status === MED_STATE.UNCONFIRMED)
    .sort((a, b) => (a.status === MED_STATE.ACTIVE ? -1 : 1) - (b.status === MED_STATE.ACTIVE ? -1 : 1));

  /* ---- ALLERGY ---- */
  const CRITICALITY = { HIGH: "high", LOW: "low", UNABLE: "unable-to-assess" };
  const criticalAllergies = (list) => (list || [])
    .filter((a) => a.verificationStatus !== VERIFY.REFUTED)
    .sort((a, b) => (b.criticality === CRITICALITY.HIGH) - (a.criticality === CRITICALITY.HIGH));

  /* =========================================================
     ٥ · حلقة الرعاية — EPISODE OF CARE
     ========================================================= */

  const EP_STATE = { OPEN: "OPEN", ACTIVE: "ACTIVE", ON_HOLD: "ON_HOLD", COMPLETED: "COMPLETED", CANCELLED: "CANCELLED" };
  const EP_MACHINE = {
    OPEN: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
    ON_HOLD: ["ACTIVE", "CANCELLED"],
    COMPLETED: [], CANCELLED: [],
  };
  const canEpTransition = (from, to) => !!EP_MACHINE[from] && EP_MACHINE[from].indexOf(to) !== -1;

  /* THE CANCER-LOSS GUARD. An episode cannot be declared complete while a
     specimen is unreported or a required follow-up is unclosed. This is the
     classic route by which a histopathology diagnosis is lost between theatre
     and clinic — the record says "finished" and nobody looks again. */
  function canCloseEpisode(ep, tasks) {
    if (!ep) return { ok: false, blockers: ["NO_EPISODE"] };
    if (!canEpTransition(ep.status, EP_STATE.COMPLETED)) return { ok: false, blockers: ["ILLEGAL_TRANSITION"] };
    const blockers = [];
    if (ep.pendingSupplementary) blockers.push("SUPPLEMENTARY_PENDING");
    const open = (tasks || []).filter((t) => t.episodeId === ep.id && t.blocking && t.status !== TASK_STATE.DONE);
    for (const t of open) blockers.push("OPEN_TASK:" + t.id);
    return blockers.length ? { ok: false, blockers } : { ok: true, blockers: [] };
  }

  /* =========================================================
     ٦ · الحلقة المغلقة — CLOSED-LOOP TASKS
     =========================================================
     Registers populated by ABSENCE, not by events. A notification is dismissed;
     a queue persists until a named human changes its state. This is the
     documented answer to the results-nobody-acted-on failure.
     ========================================================= */

  const TASK_STATE = { OPEN: "open", IN_PROGRESS: "in-progress", DONE: "done", CANCELLED: "cancelled" };
  const TASK_KIND = {
    RESULT_ACK: "result-acknowledgement",
    REFERRAL_RESPONSE: "referral-response",
    PATHOLOGY_PENDING: "pathology-pending",
    FOLLOWUP_DUE: "followup-due",
    ORDER_NO_RESULT: "order-without-result",
  };

  function closeTask(task, actor, at) {
    if (!task) return { ok: false, reason: "NO_TASK" };
    if (task.status === TASK_STATE.DONE) return { ok: false, reason: "ALREADY_DONE" };
    if (!actor) return { ok: false, reason: "ACTOR_REQUIRED" };
    /* A task closes because a person acted, never because time passed. */
    return { ok: true, task: { ...task, status: TASK_STATE.DONE, completedBy: actor, completedAt: at } };
  }

  /* Times arrive as both ISO strings and epoch milliseconds depending on the
     caller. Comparing a number to a string coerces the string to NaN and
     every comparison silently returns false — which made EVERY overdue task
     read as on-time, disabling the fail-safe registers completely. Normalise
     before comparing, always. */
  const ms = (t) => (t == null ? null : (typeof t === "number" ? t : new Date(t).getTime()));

  const isOverdue = (t, now) => {
    if (!t || t.status === TASK_STATE.DONE || t.status === TASK_STATE.CANCELLED) return false;
    const due = ms(t.dueAt);
    return due != null && !Number.isNaN(due) && ms(now) > due;
  };

  const openTasks = (tasks, now) => (tasks || [])
    .filter((t) => t.status === TASK_STATE.OPEN || t.status === TASK_STATE.IN_PROGRESS)
    .map((t) => ({ ...t, overdue: isOverdue(t, now) }))
    .sort((a, b) => (b.overdue - a.overdue) || ((ms(a.dueAt) ?? Infinity) - (ms(b.dueAt) ?? Infinity)));

  /* Derive the registers from what HAS NOT happened. */
  function deriveTasks(ctx, now) {
    const out = [];
    for (const o of ctx.orders || []) {
      const hasResult = (ctx.results || []).some((r) => r.orderId === o.id);
      if (!hasResult && o.status !== "cancelled") {
        out.push({ id: "t-ord-" + o.id, kind: TASK_KIND.ORDER_NO_RESULT, patientId: o.patientId,
          episodeId: o.episodeId || null, ownerId: o.requesterId, dueAt: o.expectedAt || null,
          status: TASK_STATE.OPEN, blocking: !!o.blocking });
      }
    }
    for (const r of ctx.results || []) {
      /* Abnormality is COMPUTED from the reference range, not trusted to a
         stored boolean. An earlier version read `r.abnormal` and therefore
         generated no task for a genuinely abnormal result that simply had not
         been flagged upstream — which is precisely how a result goes
         unactioned in the real world. Derive it; never take it on trust. */
      if (isAbnormal(r) && !r.acknowledgedBy) {
        out.push({ id: "t-ack-" + r.id, kind: TASK_KIND.RESULT_ACK, patientId: r.patientId,
          episodeId: r.episodeId || null, ownerId: r.orderedBy || r.urgentContactId,
          /* An abnormal result is due for acknowledgement from the moment it
             exists, not from some later date somebody sets. If nobody has
             looked, it is already late — that is the whole point of a
             fail-safe register. */
          dueAt: r.reportedAt || r.effectiveAt || null,
          status: TASK_STATE.OPEN, blocking: true, priority: "high" });
      }
    }
    for (const s of ctx.specimens || []) {
      if (!s.reportedAt) {
        out.push({ id: "t-path-" + s.id, kind: TASK_KIND.PATHOLOGY_PENDING, patientId: s.patientId,
          episodeId: s.episodeId || null, ownerId: s.surgeonId, dueAt: s.expectedAt || null,
          status: TASK_STATE.OPEN, blocking: true, priority: "high" });
      }
    }
    for (const f of ctx.followUps || []) {
      if (!f.completedAt) {
        out.push({ id: "t-fu-" + f.id, kind: TASK_KIND.FOLLOWUP_DUE, patientId: f.patientId,
          episodeId: f.episodeId || null, ownerId: f.ownerId, dueAt: f.dueAt,
          status: TASK_STATE.OPEN, blocking: false });
      }
    }
    return out.map((t) => ({ ...t, overdue: isOverdue(t, now) }));
  }

  /* =========================================================
     ٧ · المختبر — LABORATORY
     ========================================================= */

  function flagResult(r) {
    if (!r || r.value == null || !r.refLow == null) return "unknown";
    if (typeof r.value !== "number") return "unknown";
    if (r.refLow != null && r.value < r.refLow) return "low";
    if (r.refHigh != null && r.value > r.refHigh) return "high";
    return "normal";
  }
  /* Abnormal if the lab SAID so, or if our own comparison against the
     reference range says so. Both paths matter: an external lab may send only
     a flag and no range, and an internal result may carry a range with no
     flag. Requiring both would silently drop half of them. */
  const isAbnormal = (r) => {
    if (!r) return false;
    if (r.abnormal === true) return true;
    return ["low", "high", "critical"].includes(r.flag || flagResult(r));
  };

  /* A trend across laboratories is a clinical hazard: different analysers,
     different calibrations, different reference ranges. We still build the
     trend — clinicians need it — but every point carries its lab, and the
     series declares itself mixed so the UI can warn instead of drawing a
     confident line through incomparable numbers. */
  function trend(results, code) {
    const pts = (results || [])
      .filter((r) => r.code === code && typeof r.value === "number")
      .sort((a, b) => new Date(a.effectiveAt) - new Date(b.effectiveAt))
      .map((r) => ({ at: r.effectiveAt, value: r.value, unit: r.unit,
                     lab: r.performerId || null, flag: r.flag || flagResult(r) }));
    const labs = [...new Set(pts.map((p) => p.lab).filter(Boolean))];
    const units = [...new Set(pts.map((p) => p.unit).filter(Boolean))];
    const first = pts[0], last = pts[pts.length - 1];
    return {
      code, points: pts, labs,
      mixedLabs: labs.length > 1,
      mixedUnits: units.length > 1,
      comparable: labs.length <= 1 && units.length <= 1,
      direction: !first || !last || pts.length < 2 ? "flat"
        : last.value > first.value ? "rising" : last.value < first.value ? "falling" : "flat",
    };
  }

  /* =========================================================
     ٨ · السجلات الخارجية — EXTERNAL RECORDS
     =========================================================
     The Iraqi reality: patients physically carry films and printouts between
     unconnected providers. That is already a patient-mediated health
     information exchange running on paper, and digitising it is the highest-
     value thing this product can do — PROVIDED nothing it carries is ever
     silently promoted into the authoritative lists.
     ========================================================= */

  const EXT_STATE = { UNVERIFIED: "unverified", VERIFIED: "verified", REJECTED: "rejected", KEPT_EXTERNAL: "kept-external" };

  function verifyExternal(rec, decision, actor, at, reason) {
    if (!rec) return { ok: false, reason: "NO_RECORD" };
    if (rec.status !== EXT_STATE.UNVERIFIED) return { ok: false, reason: "ALREADY_DECIDED" };
    if (!actor) return { ok: false, reason: "ACTOR_REQUIRED" };
    if (!Object.values(EXT_STATE).includes(decision) || decision === EXT_STATE.UNVERIFIED) {
      return { ok: false, reason: "BAD_DECISION" };
    }
    if (decision === EXT_STATE.REJECTED && !String(reason || "").trim()) return { ok: false, reason: "REASON_REQUIRED" };
    return { ok: true, record: { ...rec, status: decision, verifiedBy: actor, verifiedAt: at, decisionReason: reason || null } };
  }

  /* Only a verified external item may enter an authoritative list. */
  const canPromote = (rec) => !!rec && rec.status === EXT_STATE.VERIFIED;

  /* =========================================================
     ٩ · الصلاحيات — ROLE-BASED ACCESS
     ========================================================= */

  const ROLE = {
    PATIENT: "PATIENT", RECEPTION: "RECEPTION", NURSE: "NURSE",
    DOCTOR: "DOCTOR", SPECIALIST: "SPECIALIST", ADMIN: "ADMIN", AUDITOR: "AUDITOR",
  };

  /* Data classes, so permissions are expressed once rather than per screen. */
  const CLASS = {
    DEMOGRAPHIC: "demographic", ADMIN_FIN: "administrative", VITALS: "vitals",
    MEDICATION: "medication", ALLERGY: "allergy", PROBLEM: "problem",
    NOTE: "note", RESULT: "result", IMAGING: "imaging", PROCEDURE: "procedure",
    SENSITIVE: "sensitive", AUDIT: "audit",
  };

  /* Reception sees NO clinical content. This is the single most commonly
     violated rule in small-clinic software, and it is the one a patient in a
     small community will notice and never forgive. */
  const GRANTS = {
    RECEPTION: [CLASS.DEMOGRAPHIC, CLASS.ADMIN_FIN],
    NURSE: [CLASS.DEMOGRAPHIC, CLASS.VITALS, CLASS.MEDICATION, CLASS.ALLERGY, CLASS.PROBLEM, CLASS.RESULT],
    DOCTOR: [CLASS.DEMOGRAPHIC, CLASS.VITALS, CLASS.MEDICATION, CLASS.ALLERGY, CLASS.PROBLEM,
             CLASS.NOTE, CLASS.RESULT, CLASS.IMAGING, CLASS.PROCEDURE],
    SPECIALIST: [CLASS.DEMOGRAPHIC, CLASS.VITALS, CLASS.MEDICATION, CLASS.ALLERGY, CLASS.PROBLEM,
                 CLASS.NOTE, CLASS.RESULT, CLASS.IMAGING, CLASS.PROCEDURE],
    ADMIN: [CLASS.DEMOGRAPHIC, CLASS.ADMIN_FIN],
    AUDITOR: [CLASS.AUDIT],
    PATIENT: [CLASS.DEMOGRAPHIC, CLASS.VITALS, CLASS.MEDICATION, CLASS.ALLERGY, CLASS.PROBLEM,
              CLASS.RESULT, CLASS.IMAGING, CLASS.PROCEDURE, CLASS.AUDIT],
  };

  /* Access needs a REASON, not just a role: a treating relationship, the
     patient themselves, or a declared emergency. Role alone would let any
     doctor in the network open any patient — which is how small-community
     privacy dies. */
  function canAccess(principal, patientId, dataClass, ctx) {
    const c = ctx || {};
    if (!principal || !principal.role) return { ok: false, reason: "NO_PRINCIPAL" };

    if (principal.role === ROLE.PATIENT) {
      if (principal.patientId !== patientId) return { ok: false, reason: "NOT_YOUR_RECORD" };
      return (GRANTS.PATIENT.includes(dataClass))
        ? { ok: true, basis: "SELF" } : { ok: false, reason: "CLASS_DENIED" };
    }

    const grants = GRANTS[principal.role];
    if (!grants) return { ok: false, reason: "UNKNOWN_ROLE" };

    /* Sensitive is checked BEFORE the ordinary grant lookup, and answers with
       its own reason. Mental health, reproductive health, HIV/STI and
       anything revealing displacement are restricted from every role by
       default — a treating relationship is not by itself a reason to see
       them, and the refusal must say WHY so a clinician knows a grant or a
       break-glass exists rather than assuming the system is broken. */
    if (dataClass === CLASS.SENSITIVE) {
      if (principal.role === ROLE.RECEPTION || principal.role === ROLE.ADMIN) {
        return { ok: false, reason: "CLASS_DENIED" };
      }
      if (c.breakGlass) return { ok: true, basis: "BREAK_GLASS" };
      if (c.sensitiveGrant && (c.treatingRelationship || principal.role === ROLE.AUDITOR)) {
        return { ok: true, basis: "SENSITIVE_GRANT" };
      }
      return { ok: false, reason: "SENSITIVE_RESTRICTED" };
    }

    if (!grants.includes(dataClass)) return { ok: false, reason: "CLASS_DENIED" };
    if (principal.role === ROLE.AUDITOR) return { ok: true, basis: "AUDIT_FUNCTION" };
    if (principal.role === ROLE.ADMIN || principal.role === ROLE.RECEPTION) {
      return c.sameFacility ? { ok: true, basis: "FACILITY" } : { ok: false, reason: "OTHER_FACILITY" };
    }
    if (c.breakGlass) return { ok: true, basis: "BREAK_GLASS" };
    if (c.treatingRelationship) return { ok: true, basis: "TREATING" };
    return { ok: false, reason: "NO_TREATING_RELATIONSHIP" };
  }

  /* ---- BREAK-GLASS ----
     Loud by design: explicit, reasoned, time-boxed, logged, and visible in the
     PATIENT'S own access history — not just to a compliance officer. A secret
     bypass is not a safety feature, it is a back door. */
  const BREAK_GLASS_MINUTES = 60;
  function breakGlass(principal, patientId, reason, at) {
    if (!principal || principal.role === ROLE.PATIENT || principal.role === ROLE.RECEPTION) {
      return { ok: false, reason: "ROLE_NOT_ELIGIBLE" };
    }
    const r = String(reason || "").trim();
    if (r.length < 10) return { ok: false, reason: "REASON_TOO_SHORT" };
    return { ok: true, grant: {
      actorId: principal.id, role: principal.role, patientId, reason: r,
      at, expiresAt: at + BREAK_GLASS_MINUTES * 60000,
      notifyPatient: true, notifyCompliance: true, audit: "BREAK_GLASS",
    } };
  }
  const breakGlassActive = (g, now) => !!g && now < g.expiresAt;

  /* =========================================================
     ١٠ · اللقطة السريرية — CLINICAL SNAPSHOT
     =========================================================
     DERIVED, never authored. The research is blunt: any summary that requires
     separate data entry becomes stale and then dangerous.
     ========================================================= */

  function snapshot(p, now) {
    const meds = currentMedications(p.medications, now);
    const conds = activeConditions(p.conditions, now);
    const tasks = openTasks(p.tasks, now);
    const results = (p.results || []).slice()
      .sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt));
    const encs = (p.encounters || [])
      .filter((e) => e.state !== ENC_STATE.VOID)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    return {
      /* WHO IS THIS PATIENT */
      identity: { id: p.id, name: p.name, sex: p.sex, birthDate: p.birthDate, age: ageOf(p.birthDate, now) },
      /* WHAT MUST NOT BE MISSED — first, always */
      allergies: criticalAllergies(p.allergies),
      /* WHAT MATTERS RIGHT NOW */
      activeProblems: conds,
      currentMedications: meds,
      unconfirmedMedications: meds.filter((m) => m.status === MED_STATE.UNCONFIRMED).length,
      majorProcedures: (p.procedures || []).filter((x) => x.major).slice(0, 6),
      /* WHAT IS STILL PENDING */
      pendingTasks: tasks,
      overdueTasks: tasks.filter((t) => t.overdue),
      pendingPathology: tasks.filter((t) => t.kind === TASK_KIND.PATHOLOGY_PENDING),
      /* WHAT CHANGED */
      recentAbnormal: results.filter((r) => isAbnormal(r)).slice(0, 5),
      lastEncounter: encs[0] || null,
      openEpisodes: (p.episodes || []).filter((e) => e.status === EP_STATE.ACTIVE || e.status === EP_STATE.OPEN),
      /* honesty markers */
      staleProblems: conds.filter((c) => c.stale).length,
      unverifiedExternal: (p.externalRecords || []).filter((r) => r.status === EXT_STATE.UNVERIFIED).length,
    };
  }

  function ageOf(birthDate, now) {
    if (!birthDate) return null;
    const b = new Date(birthDate), n = new Date(now);
    let a = n.getFullYear() - b.getFullYear();
    const m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
    return a >= 0 ? a : null;
  }

  /* =========================================================
     ١١ · الخط الزمني — TIMELINE
     =========================================================
     Only events that CHANGED A DECISION. Rendering every database row is how
     a timeline becomes noise a clinician learns to skip.
     ========================================================= */

  const EVT = { DIAGNOSIS: "diagnosis", MED_START: "medication-start", MED_STOP: "medication-stop",
                RESULT: "result", IMAGING: "imaging", PROCEDURE: "procedure", ENCOUNTER: "encounter",
                REFERRAL: "referral", ADMISSION: "admission", DISCHARGE: "discharge", FOLLOWUP: "follow-up" };

  function buildTimeline(p, opts) {
    const o = opts || {};
    const ev = [];
    const push = (e) => { if (e.at) ev.push(e); };

    for (const c of p.conditions || []) {
      push({ at: c.onsetDate || c.recordedAt, type: EVT.DIAGNOSIS, title: c.display,
             episodeId: c.episodeId || null, conditionId: c.id, actorId: c.recordedBy,
             facilityId: c.facilityId, significance: 3 });
    }
    for (const m of p.medications || []) {
      push({ at: m.startDate, type: EVT.MED_START, title: m.display, detail: m.dose,
             episodeId: m.episodeId || null, conditionId: m.indicationId || null,
             actorId: m.prescriberId, facilityId: m.facilityId, significance: 2 });
      if (m.stopDate) push({ at: m.stopDate, type: EVT.MED_STOP, title: m.display,
             detail: m.stopReason, episodeId: m.episodeId || null, conditionId: m.indicationId || null,
             actorId: m.stoppedBy, significance: 2 });
    }
    /* NORMAL results are deliberately excluded: they did not change a
       decision, and including them is how the signal drowns. */
    for (const r of p.results || []) {
      if (!isAbnormal(r)) continue;
      push({ at: r.effectiveAt, type: EVT.RESULT, title: r.display,
             detail: `${r.value} ${r.unit || ""}`.trim(), flag: r.flag || flagResult(r),
             episodeId: r.episodeId || null, facilityId: r.performerId, significance: 3 });
    }
    for (const i of p.imaging || []) {
      push({ at: i.effectiveAt, type: EVT.IMAGING, title: `${i.modality} — ${i.bodySite || ""}`.trim(),
             detail: i.impression, episodeId: i.episodeId || null, facilityId: i.facilityId, significance: 3 });
    }
    for (const pr of p.procedures || []) {
      push({ at: pr.performedAt, type: EVT.PROCEDURE, title: pr.display,
             episodeId: pr.episodeId || null, actorId: pr.performerId,
             facilityId: pr.facilityId, significance: pr.major ? 4 : 2 });
    }
    for (const e of p.encounters || []) {
      if (e.state === ENC_STATE.VOID) continue;
      push({ at: e.startedAt, type: EVT.ENCOUNTER, title: e.chiefComplaint || e.type,
             detail: e.assessment, episodeId: e.episodeId || null, encounterId: e.id,
             actorId: e.clinicianId, facilityId: e.facilityId, significance: 1 });
    }
    for (const r of p.referrals || []) {
      push({ at: r.sentAt, type: EVT.REFERRAL, title: r.specialty, detail: r.reason,
             episodeId: r.episodeId || null, actorId: r.referrerId, significance: 3 });
    }

    let out = ev.sort((a, b) => new Date(b.at) - new Date(a.at));
    if (o.type) out = out.filter((e) => e.type === o.type);
    if (o.episodeId) out = out.filter((e) => e.episodeId === o.episodeId);
    if (o.conditionId) out = out.filter((e) => e.conditionId === o.conditionId);
    if (o.facilityId) out = out.filter((e) => e.facilityId === o.facilityId);
    if (o.actorId) out = out.filter((e) => e.actorId === o.actorId);
    if (o.from) out = out.filter((e) => new Date(e.at) >= new Date(o.from));
    if (o.to) out = out.filter((e) => new Date(e.at) <= new Date(o.to));
    if (o.minSignificance) out = out.filter((e) => (e.significance || 0) >= o.minSignificance);
    return out;
  }

  /* The problem-clustered reading. A patient with four chronic diseases has a
     chronological stream that is unreadable; grouped by episode it becomes
     four short stories, each with a state. */
  function timelineByEpisode(p, opts) {
    const all = buildTimeline(p, opts);
    const groups = (p.episodes || []).map((ep) => ({
      episode: ep,
      events: all.filter((e) => e.episodeId === ep.id),
    })).filter((g) => g.events.length);
    const loose = all.filter((e) => !e.episodeId);
    return { episodes: groups, unassigned: loose };
  }

  /* =========================================================
     ١٢ · المصدرية — PROVENANCE
     ========================================================= */
  const SOURCE = { CLINICIAN: "clinician", PATIENT: "patient-reported", EXTERNAL: "external-import",
                   DEVICE: "device", AI: "ai-generated" };

  function provenance(entry) {
    return {
      recordedBy: entry.recordedBy || null,
      recordedAt: entry.recordedAt || null,
      facilityId: entry.facilityId || null,
      source: entry.source || SOURCE.CLINICIAN,
      verificationStatus: entry.verificationStatus || VERIFY.CONFIRMED,
      verifiedBy: entry.verifiedBy || null,
      verifiedAt: entry.verifiedAt || null,
      /* An AI-derived assertion is never treated as confirmed, whatever the
         caller passed. This is enforced here rather than trusted to callers. */
      aiGenerated: entry.source === SOURCE.AI,
    };
  }
  const isAuthoritative = (e) => {
    const pv = provenance(e);
    return !pv.aiGenerated
      && pv.verificationStatus !== VERIFY.EXTERNAL
      && pv.verificationStatus !== VERIFY.REFUTED;
  };

  /* =========================================================
     ١٣ · FHIR — mapping shape, not a fake implementation
     =========================================================
     Real field-level mappings so a future FHIR facade is a serialiser rather
     than a redesign. Nothing here pretends to BE FHIR.
     ========================================================= */
  const FHIR_MAP = {
    patient: { resource: "Patient", fields: { id: "id", name: "name[0].text", sex: "gender",
      birthDate: "birthDate", identifiers: "identifier[]" } },
    encounter: { resource: "Encounter", fields: { id: "id", patientId: "subject", clinicianId: "participant[0].individual",
      facilityId: "serviceProvider", type: "class", startedAt: "period.start", episodeId: "episodeOfCare[0]" } },
    condition: { resource: "Condition", fields: { code: "code.coding[0].code", clinicalStatus: "clinicalStatus",
      onsetDate: "onsetDateTime", verificationStatus: "verificationStatus", episodeId: "encounter" } },
    medication: { resource: "MedicationRequest", fields: { code: "medicationCodeableConcept", dose: "dosageInstruction[0].text",
      startDate: "dispenseRequest.validityPeriod.start", status: "status", indicationId: "reasonReference" } },
    allergy: { resource: "AllergyIntolerance", fields: { substance: "code", reaction: "reaction[0].manifestation[0]",
      criticality: "criticality", verificationStatus: "verificationStatus" } },
    result: { resource: "Observation", fields: { code: "code.coding[0].code", value: "valueQuantity.value",
      unit: "valueQuantity.unit", refLow: "referenceRange[0].low", refHigh: "referenceRange[0].high",
      effectiveAt: "effectiveDateTime", performerId: "performer[0]" } },
    imaging: { resource: "ImagingStudy", fields: { modality: "modality[0]", bodySite: "series[0].bodySite",
      effectiveAt: "started", impression: "note[0].text" } },
    procedure: { resource: "Procedure", fields: { code: "code", performedAt: "performedDateTime",
      performerId: "performer[0].actor", outcome: "outcome" } },
    episode: { resource: "EpisodeOfCare", fields: { id: "id", status: "status", conditionId: "diagnosis[0].condition",
      startDate: "period.start", responsibleId: "careManager" } },
    task: { resource: "Task", fields: { id: "id", kind: "code", ownerId: "owner", status: "status",
      dueAt: "restriction.period.end", patientId: "for" } },
    referral: { resource: "ServiceRequest", fields: { id: "id", specialty: "specialty", reason: "reasonCode",
      sentAt: "authoredOn", referrerId: "requester" } },
    document: { resource: "DocumentReference", fields: { id: "id", url: "content[0].attachment.url",
      contentType: "content[0].attachment.contentType", status: "docStatus" } },
    external: { resource: "DocumentReference", fields: { status: "docStatus", source: "custodian" } },
    provenance: { resource: "Provenance", fields: { recordedAt: "recorded", recordedBy: "agent[0].who",
      source: "entity[0].role" } },
    audit: { resource: "AuditEvent", fields: { actorId: "agent[0].who", action: "action",
      at: "recorded", patientId: "entity[0].what", reason: "purposeOfEvent" } },
  };

  /* Terminology is pluggable so the system NEVER hard-depends on a licence we
     do not hold. Iraq is not a SNOMED member; the IPS Free Set and LOINC are
     usable today, and a real terminology server can be swapped in later
     without touching a single clinical rule. */
  const CODE_SYSTEM = {
    SNOMED: "http://snomed.info/sct",
    LOINC: "http://loinc.org",
    ICD10: "http://hl7.org/fhir/sid/icd-10",
    LOCAL: "urn:qareeb:local",
  };
  function codeable(system, code, displayAr, displayEn) {
    return { system: system || CODE_SYSTEM.LOCAL, code: code || null,
             display: { ar: displayAr || null, en: displayEn || null },
             coded: !!(system && code) };
  }

  root.EMR = {
    ID_TYPE, canRegister,
    MATCH_WEIGHTS, MATCH, normAr, normArKey, matchScore, matchVerdict, findCandidates, MERGE_STATE, mergeDecision,
    ENC_STATE, ENC_TYPE, SIGN_REQUIRED, canSign, signEncounter, addAddendum, voidEncounter,
    COND_STATE, VERIFY, isChronicActive, isStale, activeConditions, STALE_DAYS,
    MED_STATE, stopMedication, medStatus, currentMedications,
    CRITICALITY, criticalAllergies,
    EP_STATE, EP_MACHINE, canEpTransition, canCloseEpisode,
    TASK_STATE, TASK_KIND, closeTask, isOverdue, openTasks, deriveTasks, ms,
    flagResult, isAbnormal, trend,
    EXT_STATE, verifyExternal, canPromote,
    ROLE, CLASS, GRANTS, canAccess, breakGlass, breakGlassActive, BREAK_GLASS_MINUTES,
    snapshot, ageOf,
    EVT, buildTimeline, timelineByEpisode,
    SOURCE, provenance, isAuthoritative,
    FHIR_MAP, CODE_SYSTEM, codeable,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
