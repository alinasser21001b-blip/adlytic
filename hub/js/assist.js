/* ============================================================
   قريب · طبقة المساعدة — THE ASSIST LAYER
   ============================================================
   Section 14 of the brief, built the only way it can honestly be built today.

   WHAT THIS IS.

   Every statement this file produces is DERIVED BY RULE from structured data
   already in the record, and every statement carries the ids of the records
   it came from. Nothing is generated. Nothing is inferred by a model. If you
   delete the record it points at, the statement disappears.

   WHY IT IS NOT A LANGUAGE MODEL, AND WHY THAT IS THE POINT.

   The brief says AI must never silently diagnose and must separate fact from
   interpretation from suggestion. That separation is not a formatting
   convention you ask a model to follow — it is a property of how the
   statement was produced. A model asked to label its own output FACT will
   label a hallucination FACT, confidently, and the label makes it worse
   rather than better because it borrows the authority of the ones that are
   true.

   So the epistemic tiers here are structural:

     FACT           computed arithmetically from stored values. Reproducible.
                    Carries sourceIds. Cannot be wrong unless the data is.
     INTERPRETATION a named, published clinical rule applied to those facts,
                    with the rule stated. Falsifiable — you can read the rule
                    and disagree with it.
     SUGGESTION     a prompt to a human to look at something. Never an
                    instruction, never a dose, never a diagnosis.

   This is the boundary a real model would attach to LATER: it may summarise
   and it may navigate, it may never author a FACT. `MODEL_BOUNDARY` below
   states that contract in code rather than in a comment nobody reads.

   ⚠ NOTHING HERE DIAGNOSES. NOTHING HERE PRESCRIBES. NOTHING HERE CLOSES A
   FOLLOW-UP. Those three are enforced by construction: there is no code path
   in this file that writes to the record at all.
   ============================================================ */
(function (root) {
  "use strict";

  const E = root.EMR || {};
  const R = root.REC || {};
  const N = root.NET || {};
  const ms = E.ms || ((t) => (t == null ? null : (typeof t === "number" ? t : new Date(t).getTime())));
  const DAY = 86400000;

  const TIER = { FACT: "FACT", INTERPRETATION: "INTERPRETATION", SUGGESTION: "SUGGESTION" };

  const TIER_LABEL = {
    FACT: { ar: "حقيقة", en: "Fact" },
    INTERPRETATION: { ar: "تفسير", en: "Interpretation" },
    SUGGESTION: { ar: "اقتراح", en: "Suggestion" },
  };
  const tierLabel = (t, lang) => (TIER_LABEL[t] || TIER_LABEL.FACT)[lang === "en" ? "en" : "ar"];

  /* Every statement is built here so none can exist without its provenance.
     `sourceIds` is not decoration: it is what lets a clinician get from the
     sentence to the evidence in one tap, which is the brief's
     SUMMARY → CAUSE → EVIDENCE principle made mechanical. */
  function stmt(tier, ar, en, sourceIds, extra) {
    return { tier, ar, en, sourceIds: sourceIds || [], ...(extra || {}) };
  }

  /* The contract a language model would have to satisfy to be added here.
     Stated as data so a future integration is checked, not trusted. */
  const MODEL_BOUNDARY = {
    mayProduce: [TIER.SUGGESTION],
    mayRephrase: [TIER.FACT, TIER.INTERPRETATION],   /* wording only — never the numbers */
    mayNever: ["diagnose", "prescribe", "close-task", "write-record",
               "assert-fact", "acknowledge-result", "grant-access"],
    /* Any model output must arrive with the source ids it was given and must
       not introduce new ones. An id it invented is a fabricated citation. */
    requiresSourceIds: true,
    /* And it must be visibly labelled as machine-written wherever it lands. */
    requiresAttribution: true,
  };

  /* =========================================================
     ١ · حقائق الاتجاه — TRENDS
     =========================================================
     The brief's own example: HbA1c 7.2 in 2024 and 9.2 in 2026 is a FACT;
     "control appears to have worsened" is an INTERPRETATION; "consider
     reviewing management" is a SUGGESTION. Below, each of those three is a
     separate object with a separate justification.
     ========================================================= */

  /* A change worth mentioning at all. Below this the noise of ordinary
     assay variation drowns the signal, and a summary that reports every
     wobble is a summary nobody finishes reading. */
  const MATERIAL_CHANGE_PCT = 15;

  function trendStatements(record, code, now, lang) {
    const t = N.comparableSeries ? N.comparableSeries(record.results, code)
                                 : (E.trend ? E.trend(record.results, code) : null);
    if (!t || !t.points || t.points.length < 2) return [];
    const first = t.points[0], last = t.points[t.points.length - 1];
    const name = (record.results || []).find((x) => x.code === code)?.display || code;
    const ids = (record.results || []).filter((x) => x.code === code).map((x) => x.id).filter(Boolean);
    const out = [];

    /* FACT — arithmetic on stored values, nothing else. */
    out.push(stmt(TIER.FACT,
      `${name}: ${first.value} ${first.unit || ""} في ${String(first.at).slice(0, 10)}، و${last.value} ${last.unit || ""} في ${String(last.at).slice(0, 10)}.`,
      `${name}: ${first.value} ${first.unit || ""} on ${String(first.at).slice(0, 10)}, ${last.value} ${last.unit || ""} on ${String(last.at).slice(0, 10)}.`,
      ids, { code, from: first.value, to: last.value, unit: last.unit || null }));

    /* The single most important honesty check in this file. Two analysers or
       two units are not a trend, and saying so is more useful than a
       confident line through incomparable numbers. */
    if (t.mixedLabs || t.mixedUnits) {
      out.push(stmt(TIER.FACT,
        t.mixedUnits ? "النتائج بوحدات قياس مختلفة — المقارنة بينها غير صالحة."
                     : "النتائج من مختبرات مختلفة — المقارنة بينها ليست موثوقة.",
        t.mixedUnits ? "The results use different units — comparing them is not valid."
                     : "The results come from different laboratories — comparing them is not reliable.",
        ids, { blocksInterpretation: true }));
      return out;   /* and NO interpretation follows. */
    }

    const delta = last.value - first.value;
    const pct = first.value ? Math.abs(delta / first.value) * 100 : 0;
    if (pct < MATERIAL_CHANGE_PCT) return out;

    /* INTERPRETATION — the rule is named so a clinician can disagree with
       the rule rather than with an oracle. */
    const worse = directionIsWorse(code, delta);
    if (worse !== null) {
      out.push(stmt(TIER.INTERPRETATION,
        `${name} ${delta > 0 ? "ارتفع" : "انخفض"} بنسبة ${Math.round(pct)}٪ — ${worse ? "اتجاه غير مرغوب" : "اتجاه نحو الأفضل"} حسب المدى المرجعي للمختبر.`,
        `${name} ${delta > 0 ? "rose" : "fell"} by ${Math.round(pct)}% — ${worse ? "an unwanted direction" : "a favourable direction"} against the laboratory's own reference range.`,
        ids, { rule: "direction-vs-reference-range", worse, changePct: Math.round(pct) }));

      /* SUGGESTION — an invitation to look, never an instruction. */
      if (worse) {
        out.push(stmt(TIER.SUGGESTION,
          `يستحق ${name} مراجعة مع المريض في هذه الزيارة.`,
          `${name} is worth reviewing with the patient at this visit.`,
          ids, { action: "review-with-patient" }));
      }
    }
    return out;
  }

  /* Whether "up" is bad depends on the analyte, and we only claim to know
     for the ones where the answer is not in dispute. Everything else returns
     null and gets a FACT with no interpretation attached — which is the
     correct output, not a gap to be filled with a guess. */
  const HIGHER_IS_WORSE = ["HbA1c", "Creatinine", "LDL", "ALT", "AST", "CRP", "TSH", "Urea", "K"];
  const LOWER_IS_WORSE = ["Hb", "eGFR", "Albumin", "HDL", "Platelets"];
  function directionIsWorse(code, delta) {
    if (HIGHER_IS_WORSE.indexOf(code) !== -1) return delta > 0;
    if (LOWER_IS_WORSE.indexOf(code) !== -1) return delta < 0;
    return null;
  }

  /* =========================================================
     ٢ · ما ينقص — WHAT IS MISSING
     =========================================================
     The brief asks for "identify missing information", and absence is where
     a rule-based layer genuinely outperforms a reader: a human skims what is
     there, and what is not there leaves no mark on the page.
     ========================================================= */

  function gapStatements(record, now, lang) {
    const out = [];
    const r = record || {};

    if (!(r.allergies || []).length) {
      out.push(stmt(TIER.FACT,
        "ما مسجّل في الملف أي حساسية — وهذا لا يعني أن المريض بلا حساسية.",
        "No allergy is recorded — which does not mean the patient has none.",
        [], { gap: "allergies" }));
      out.push(stmt(TIER.SUGGESTION, "اسأل عن الحساسية وسجّلها ولو كانت لا شيء.",
        "Ask about allergies and record the answer, including 'none known'.", [], { action: "ask-allergies" }));
    }
    if (!r.bloodGroup) {
      out.push(stmt(TIER.FACT, "فصيلة الدم غير مسجّلة.", "Blood group is not recorded.",
        [], { gap: "bloodGroup" }));
    }

    /* A chronic condition nobody has reviewed in a year and a half is not a
       controlled condition; it is a condition nobody has looked at. */
    const stale = (E.activeConditions ? E.activeConditions(r.conditions, now) : [])
      .filter((c) => c.stale && c.chronic);
    for (const c of stale) {
      out.push(stmt(TIER.FACT,
        `«${c.display}» مزمنة ولم تُراجَع منذ ${String(c.lastReviewed || c.onsetDate || "").slice(0, 10)}.`,
        `"${c.display}" is chronic and has not been reviewed since ${String(c.lastReviewed || c.onsetDate || "").slice(0, 10)}.`,
        [c.id], { gap: "stale-condition" }));
    }

    /* A medicine the record cannot vouch for. This is the honest third state
       the medication layer carries, surfaced rather than smoothed over. */
    const unconfirmed = (E.currentMedications ? E.currentMedications(r.medications, now) : [])
      .filter((m) => m.status === (E.MED_STATE && E.MED_STATE.UNCONFIRMED));
    if (unconfirmed.length) {
      out.push(stmt(TIER.FACT,
        `${unconfirmed.length} دواء في القائمة ما أكّده أحد من مدة — لا نعرف إن كان المريض بعده عليها.`,
        `${unconfirmed.length} medicine(s) on the list have not been reconfirmed — whether the patient still takes them is unknown.`,
        unconfirmed.map((m) => m.id).filter(Boolean), { gap: "unconfirmed-medications" }));
      out.push(stmt(TIER.SUGGESTION, "راجع قائمة الأدوية مع المريض.",
        "Reconcile the medication list with the patient.", [], { action: "reconcile-medications" }));
    }

    /* Claims read out of documents that no clinician has decided on. */
    const awaiting = R.awaitingVerification ? R.awaitingVerification(r.documents) : [];
    if (awaiting.length) {
      out.push(stmt(TIER.FACT,
        `${awaiting.length} معلومة مستخرجة من مستندات المريض لم يتحقق منها طبيب — وهي خارج السجل الرسمي.`,
        `${awaiting.length} claim(s) extracted from the patient's documents are unverified and sit outside the record.`,
        awaiting.map((x) => x.documentId), { gap: "unverified-claims" }));
    }
    return out;
  }

  /* =========================================================
     ٣ · الحلقات المفتوحة — OPEN LOOPS
     ========================================================= */

  function loopStatements(record, now, lang) {
    const out = [];
    const r = record || {};

    const unacked = (r.results || []).filter((x) =>
      (E.isAbnormal ? E.isAbnormal(x) : false) && !x.acknowledgedBy);
    for (const x of unacked.slice(0, 5)) {
      const critical = x.flag === "critical";
      out.push(stmt(TIER.FACT,
        `${x.display || x.code}: ${x.value} ${x.unit || ""} في ${String(x.effectiveAt).slice(0, 10)} — خارج المدى المرجعي${critical ? " وحرجة" : ""}، ولم يُقرّها أحد.`,
        `${x.display || x.code}: ${x.value} ${x.unit || ""} on ${String(x.effectiveAt).slice(0, 10)} — outside the reference range${critical ? " and critical" : ""}, unacknowledged.`,
        [x.id], { loop: "unacknowledged-result", critical }));
    }
    if (unacked.length) {
      out.push(stmt(TIER.SUGGESTION,
        "أقِرّ النتائج غير الطبيعية أو دوّن سبب عدم التصرّف — الإقرار يغلق الحلقة.",
        "Acknowledge the abnormal results or record why no action is needed — acknowledgement is what closes the loop.",
        [], { action: "acknowledge-results" }));
    }

    const overdue = (E.openTasks ? E.openTasks(r.tasks, now) : [])
      .filter((t) => (E.isOverdue ? E.isOverdue(t, now) : false));
    for (const t of overdue.slice(0, 5)) {
      out.push(stmt(TIER.FACT,
        `مهمّة «${t.about || t.kind}» كان موعدها ${String(t.dueAt).slice(0, 10)} وما زالت مفتوحة.`,
        `Task "${t.about || t.kind}" was due ${String(t.dueAt).slice(0, 10)} and is still open.`,
        [t.id], { loop: "overdue-task", days: Math.round((ms(now) - ms(t.dueAt)) / DAY) }));
    }

    const netTasks = N.networkTasks ? N.networkTasks(r, now) : [];
    for (const t of (N.overdueNetworkTasks ? N.overdueNetworkTasks(netTasks, now) : []).slice(0, 5)) {
      out.push(stmt(TIER.FACT,
        `${t.kind === "referral-unanswered" ? "إحالة" : "طلب"} «${t.about}» بلا رد منذ ${String(t.dueAt).slice(0, 10)}.`,
        `${t.kind === "referral-unanswered" ? "Referral" : "Order"} "${t.about}" has had no response since ${String(t.dueAt).slice(0, 10)}.`,
        [t.id], { loop: t.kind }));
    }
    return out;
  }

  /* =========================================================
     ٤ · ملخّص التسليم — CLINICAL HANDOFF
     =========================================================
     Everything above, ordered by what can hurt the patient soonest, with the
     tiers kept apart so a reader can stop at FACT and lose nothing true.
     ========================================================= */

  function handoff(patient, record, now, lang) {
    const r = record || {};
    const codes = [...new Set((r.results || []).map((x) => x.code).filter(Boolean))];
    const statements = [
      ...loopStatements(r, now, lang),
      ...codes.flatMap((c) => trendStatements(r, c, now, lang)),
      ...gapStatements(r, now, lang),
    ];
    const brief = R.preVisitBrief ? R.preVisitBrief(patient, r, now, lang) : null;
    return {
      patientId: patient && patient.id,
      generatedAt: now,
      /* The three tiers, never interleaved. A reader who trusts only the
         first list still gets everything that is certainly true. */
      facts: statements.filter((s) => s.tier === TIER.FACT),
      interpretations: statements.filter((s) => s.tier === TIER.INTERPRETATION),
      suggestions: statements.filter((s) => s.tier === TIER.SUGGESTION),
      brief,
      /* Carried in the data so no screen can render this without it. */
      provenance: {
        method: "rule-based-derivation",
        model: null,
        aiGenerated: false,
        note: lang === "en"
          ? "Derived by rule from the record's own structured data. No model wrote any of it, and nothing here is a diagnosis."
          : "مشتق بقواعد من بيانات السجل نفسها. ما كتبه نموذج، وما في شي هنا تشخيص.",
      },
    };
  }

  /* =========================================================
     ٥ · بوابة أي إخراج آلي — THE GATE
     =========================================================
     If a language model is ever wired in, its output passes through here or
     it does not reach a screen. Written now, while there is no model and no
     pressure to make an exception.
     ========================================================= */

  function admitModelOutput(out, given) {
    if (!out || typeof out !== "object") return { ok: false, reason: "NO_OUTPUT" };
    if (MODEL_BOUNDARY.mayProduce.indexOf(out.tier) === -1) {
      return { ok: false, reason: "TIER_NOT_PERMITTED", tier: out.tier };
    }
    if (MODEL_BOUNDARY.requiresSourceIds) {
      const ids = out.sourceIds || [];
      if (!ids.length) return { ok: false, reason: "SOURCE_IDS_REQUIRED" };
      /* An id the model produced that it was not given is a fabricated
         citation — the failure mode that makes machine summaries dangerous
         precisely because they look sourced. */
      const allowed = new Set(given || []);
      const invented = ids.filter((i) => !allowed.has(i));
      if (invented.length) return { ok: false, reason: "FABRICATED_SOURCE", ids: invented };
    }
    return { ok: true, statement: { ...out, aiGenerated: true,
      attribution: { machine: true, reviewed: false } } };
  }

  root.ASSIST = {
    TIER, TIER_LABEL, tierLabel, MODEL_BOUNDARY, MATERIAL_CHANGE_PCT,
    HIGHER_IS_WORSE, LOWER_IS_WORSE, directionIsWorse,
    trendStatements, gapStatements, loopStatements, handoff, admitModelOutput,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
