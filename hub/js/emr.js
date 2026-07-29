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

   4. IDENTITY IS NEVER THE NATIONAL ID. Coverage turned out to be high —
      40M+ cards against ~46M people — so this rule survives for a different
      reason than the one it was written for: nobody could establish whether
      the 12-digit number is STABLE across reissue or correction. A primary
      key that may silently change is the worst possible defect in a health
      record, because it splits one patient into two or fuses two into one
      without ever raising an error. Add to that a million Iraqis with no
      civil documentation at all, legacy documents still in circulation whose
      validity nobody could confirm, and 27 years of US evidence that a system
      scales without a national identifier at a permanent, measured cost.
      The primary key is ours, opaque and stable; every real-world identifier
      is one optional, typed attribute among several, and none of them is
      unique-not-null.

   5. NOTHING MERGES SILENTLY. Not duplicate patients, not external records.
      An overlay — two people fused into one chart — is rarer than a duplicate,
      invisible, self-concealing, and the failure mode that kills.

   6. SOME FIELDS ARE REFUSED, NOT JUST UNUSED. Religion is printed on the
      Iraqi National Card and Article 26 of the card law makes the designation
      legally coercive. With no data protection law in force and no data
      protection authority, a queryable table of citizens with religion
      attached is a targeting asset, not a data model. The refusal is enforced
      at the boundary — see FORBIDDEN_FIELDS — because a rule that lives only
      in a comment is a rule that a future contributor deletes by accident.
   ============================================================ */
(function (root) {
  "use strict";

  /* =========================================================
     ١ · الهوية — IDENTITY
     ========================================================= */

  /* Identifier types we accept. All optional; none is the key. `national` is
     listed first because it is the most useful WHEN present, not because it
     is required — a displaced patient with only a UNHCR number is still a
     patient, and a system that cannot register them is not usable in Iraq.

     The legacy pair (civil status ID, jinsiya) is here because issuance of
     both stopped inside Iraq in March–April 2024 in favour of the unified
     National Card — but nobody collected the ones already in wallets, and
     whether they remain valid is an open question. A patient holding one is
     not a patient without a document. We record the type and let the clinic
     decide; we do not adjudicate Iraqi civil law at a registration desk. */
  const ID_TYPE = {
    NATIONAL: "national",      /* البطاقة الوطنية الموحّدة */
    CIVIL: "civil",            /* هوية الأحوال المدنية — legacy, still circulating */
    JINSIYA: "jinsiya",        /* شهادة الجنسية — legacy, still circulating */
    PASSPORT: "passport",
    MOBILE: "mobile",
    UNHCR: "unhcr",            /* نازح / لاجئ — UNHCR / IOM documentation */
    MOH: "moh",                /* رقم ملف وزارة الصحة */
    FACILITY: "facility",      /* رقم الملف في عيادة بعينها */
    EXTERNAL: "external",      /* معرّف من نظام آخر */
  };

  /* An identifier that answers "which person is this" versus one that only
     answers "how do I reach them". A phone number is the best REACH channel
     in Iraq — connections run at ~103% of population — and one of the worst
     identity claims: multi-SIM is common and number portability status is
     unresolved, so numbers churn and get reassigned. Mobile is a locator. */
  const IDENTITY_BEARING = [ID_TYPE.NATIONAL, ID_TYPE.CIVIL, ID_TYPE.JINSIYA, ID_TYPE.PASSPORT, ID_TYPE.UNHCR];
  const isIdentityBearing = (t) => IDENTITY_BEARING.indexOf(t) !== -1;

  /* HOW WE KNOW an identifier, recorded per identifier, not per patient.
     Iraq's National Card carries an ICAO-standard machine-readable zone AND
     an NFC chip, which means `machine_read` is reachable TODAY with an
     ordinary phone camera and zero government integration — no API, no
     agreement, no dependency on a national platform that may never open to
     private healthcare. That is why this tier exists in v1 rather than
     waiting for one: it is the difference between a number a clerk typed
     from memory and a number the card itself emitted. */
  const ID_VERIFY = {
    SELF: "self_declared",       /* the patient said so */
    SIGHTED: "visually_sighted", /* a human looked at the document */
    MACHINE: "machine_read",     /* MRZ / NFC — the document emitted it */
  };
  const ID_VERIFY_RANK = { self_declared: 0, visually_sighted: 1, machine_read: 2 };
  /* Confidence multiplier applied to an identifier's match weight in BOTH
     directions. A self-declared number agreeing is weaker evidence of the
     same person; a self-declared number disagreeing is likewise weaker
     evidence of different people, because it is far likelier to be a typo. */
  const ID_VERIFY_WEIGHT = { self_declared: 0.6, visually_sighted: 0.85, machine_read: 1 };
  const verifyLevel = (i) => (i && ID_VERIFY_RANK[i.verification] != null ? i.verification : ID_VERIFY.SELF);
  const verifyFactor = (a, b) => Math.min(ID_VERIFY_WEIGHT[verifyLevel(a)], ID_VERIFY_WEIGHT[verifyLevel(b)]);

  /* Fields we refuse to hold, enforced rather than documented.

     Religion is printed on the Iraqi National Card, and Article 26 of the
     card law makes the designation legally coercive — a minor is converted
     with a converting parent, and the change runs one way only. A queryable
     table of Iraqi citizens with religion attached is a targeting asset in a
     country with a genocide against Yazidis and Christians inside living
     memory, and no data protection law in force to restrain what happens to
     it. Sect and ethnicity follow for the same reason.

     The card IMAGE is on this list too. A scan yields number, name, birth
     date and sex — take those four and discard the photograph. Retaining the
     image retains the religion field whether or not we parse it, and retains
     the biometric portrait, in a system that has no lawful basis to hold
     either. This is a storage rule, so it is checked at the boundary. */
  const FORBIDDEN_FIELDS = ["religion", "sect", "ethnicity", "cardImage", "idImage", "idPhoto", "biometric", "الديانة", "المذهب", "القومية"];

  function forbiddenIn(obj) {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj).filter((k) => FORBIDDEN_FIELDS.indexOf(k) !== -1);
  }
  /* Returns a copy with the forbidden keys removed. Used at every ingest
     boundary — registration, card scan, external record promotion — so the
     rule holds even when the caller forgot it. */
  function sanitisePatient(p) {
    if (!p || typeof p !== "object") return p;
    const out = {}, dropped = [];
    for (const k of Object.keys(p)) {
      if (FORBIDDEN_FIELDS.indexOf(k) !== -1) { dropped.push(k); continue; }
      out[k] = p[k];
    }
    return { patient: out, dropped };
  }

  /* A card scan produces four fields and nothing else. Anything the caller
     hands us beyond that whitelist is dropped, named in `dropped`, and never
     reaches storage. */
  const CARD_FIELDS = ["number", "name", "birthDate", "sex"];
  function acceptCardScan(scan, at) {
    if (!scan || typeof scan !== "object") return { ok: false, reason: "NO_SCAN" };
    const num = String(scan.number || "").trim();
    if (!num) return { ok: false, reason: "NO_NUMBER" };
    const dropped = Object.keys(scan).filter((k) => CARD_FIELDS.indexOf(k) !== -1 ? false : true);
    return {
      ok: true,
      dropped,
      identifier: {
        type: ID_TYPE.NATIONAL, value: num,
        verification: ID_VERIFY.MACHINE, verifiedAt: at || null,
        validFrom: null, validTo: null,
      },
      demographics: {
        name: scan.name || null,
        birthDate: scan.birthDate || null,
        birthDateEstimated: false,
        sex: scan.sex || null,
      },
    };
  }

  /* Iraqi names are structured, not a string with spaces in it. The chain is
     given + father + grandfather + family/tribe, and the father's name is a
     FIELD — two men both called محمد with different fathers are two men, and
     a middle-name-shaped model cannot express that. We store the components
     when we have them and compose for display; `name` remains supported so
     nothing that already writes a single string breaks. Arabic script is
     authoritative — any Latin transliteration is a derived alias and is
     never matched on as primary, because Mohammed / Muhammad / Mohamad and
     Khaled / Khalid / Halid are the same person. */
  const NAME_PARTS = ["given", "father", "grandfather", "family"];
  function fullName(p) {
    if (!p) return "";
    const np = p.nameParts;
    if (np && (np.given || np.father)) {
      return NAME_PARTS.map((k) => String(np[k] || "").trim()).filter(Boolean).join(" ");
    }
    return String(p.name || "").trim();
  }

  /* A patient is identifiable enough to register if we can plausibly find
     them again. Name alone is not enough in a country where a dozen people
     in one district share it.

     Note what is NOT required: any government document. Up to a million
     Iraqis lack civil documentation, and the barriers — Civil Affairs
     capacity, security clearance, perceived affiliation — are precisely the
     kind an undocumented patient cannot resolve by walking into an office.
     A name plus a birth date registers. Rejecting that cohort would exclude
     exactly the patients whose care continuity is already worst. */
  function canRegister(p) {
    if (!p) return { ok: false, reason: "NO_PATIENT" };
    const bad = forbiddenIn(p);
    if (bad.length) return { ok: false, reason: "FORBIDDEN_FIELD", fields: bad };
    const name = fullName(p);
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
     is exactly the failure this whole module exists to prevent.

     Every identifier weight below is the weight at `machine_read`. It is
     scaled down by ID_VERIFY_WEIGHT for anything a clerk typed, so the tier is
     load-bearing rather than a label in a dropdown. */
  const MATCH_WEIGHTS = {
    national: 55,   /* strong when present — but forgeable and mistyped */
    civil: 45,      /* legacy; still the document many patients actually carry */
    jinsiya: 40,
    passport: 45,
    unhcr: 45,
    mobile: 25,     /* shared within families in Iraq; useful, not decisive */
    name: 30,
    birthDate: 30,
    /* A date of birth is only worth 30 when someone actually knew it. Where
       it was estimated, or where it is the 1-January default that registration
       desks across the region reach for when the patient does not know, an
       exact match is close to meaningless — it says "two people were both
       guessed at", not "two people were born on the same day". Weighting it
       fully there manufactures review prompts on the commonest name/date pair
       in the country, and a review queue nobody believes is a review queue
       nobody reads. */
    birthDateDefault: 12,   /* 01-01 of some year — the default, not a date */
    birthDateEstimated: 5,  /* explicitly flagged as an estimate */
    sex: 5,
    address: 10,
  };

  /* 1 January is not a birthday in a registration system, it is a shrug. */
  const isDefaultDob = (d) => /^\d{4}-01-01$/.test(String(d || ""));
  function dobWeight(a, b) {
    if (a.birthDateEstimated || b.birthDateEstimated) return MATCH_WEIGHTS.birthDateEstimated;
    if (isDefaultDob(a.birthDate) || isDefaultDob(b.birthDate)) return MATCH_WEIGHTS.birthDateDefault;
    return MATCH_WEIGHTS.birthDate;
  }

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

  /* Only CURRENTLY VALID identifiers are matched on. An identifier carries an
     optional validity window because the commonest one — a mobile number —
     genuinely expires: the patient stops paying, the operator reassigns it,
     and six months later it belongs to a stranger. Matching a live record
     against a number its owner gave up is how an overlay gets built out of
     nothing but ordinary telecom housekeeping. */
  function identifiersOf(p, type, at) {
    const t = at == null ? null : (typeof at === "number" ? at : new Date(at).getTime());
    return (p.identifiers || []).filter((i) => {
      if (i.type !== type || !i.value) return false;
      if (t == null) return true;
      const from = i.validFrom == null ? null : new Date(i.validFrom).getTime();
      const to = i.validTo == null ? null : new Date(i.validTo).getTime();
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
      return true;
    });
  }
  const idOf = (p, type, at) => (identifiersOf(p, type, at)[0] || {}).value || null;

  /* Compare the Iraqi name chain component-by-component when both sides carry
     one. This is the whole reason to store parts: a DISAGREEING father's name
     is positive evidence of two different people, which a single-string
     comparison can only ever read as "somewhat different text". */
  function namePartScore(a, b) {
    const A = a.nameParts, B = b.nameParts;
    if (!A || !B || !A.given || !B.given) return null;
    const eq = (x, y) => x && y && normArKey(x) === normArKey(y);
    const both = (x, y) => !!(String(x || "").trim() && String(y || "").trim());
    if (!eq(A.given, B.given)) return { w: -MATCH_WEIGHTS.name, f: "name-given-differs" };
    /* Given name agrees. The father's name decides. */
    if (both(A.father, B.father) && !eq(A.father, B.father)) return { w: -MATCH_WEIGHTS.name, f: "name-father-differs" };
    if (both(A.grandfather, B.grandfather) && !eq(A.grandfather, B.grandfather)) return { w: -15, f: "name-grandfather-differs" };
    const fatherEq = eq(A.father, B.father), grandEq = eq(A.grandfather, B.grandfather);
    let w = 12;                                 /* given name only */
    if (fatherEq || grandEq) w = 22;
    if (fatherEq && grandEq) w = MATCH_WEIGHTS.name;   /* the full chain */
    /* Family/tribe is often a whole district's name, so agreement adds little
       and absence means nothing. It is never allowed to subtract. */
    return { w, f: "name-chain" };
  }

  function matchScore(a, b, at) {
    const factors = [];
    let score = 0;

    for (const t of [ID_TYPE.NATIONAL, ID_TYPE.CIVIL, ID_TYPE.JINSIYA, ID_TYPE.PASSPORT, ID_TYPE.UNHCR, ID_TYPE.MOBILE]) {
      const xs = identifiersOf(a, t, at), ys = identifiersOf(b, t, at);
      if (!xs.length || !ys.length) continue;
      /* Multi-SIM is ordinary here: a patient may hold three numbers and any
         one of them agreeing is agreement. Only when NO pair agrees is this
         a disagreement. */
      let hit = null;
      for (const x of xs) {
        const y = ys.find((z) => String(z.value).trim() === String(x.value).trim());
        if (y) { hit = [x, y]; break; }
      }
      const base = MATCH_WEIGHTS[t] || 0;
      if (hit) {
        const w = Math.round(base * verifyFactor(hit[0], hit[1]));
        score += w; factors.push({ f: t, agree: true, w, verification: verifyLevel(hit[0]) });
      } else {
        /* A DISAGREEING strong identifier is evidence AGAINST, and must be
           able to overpower agreeing weak ones. Two people who share a
           surname and a birth year but hold different national cards are
           two people. Scaled by verification for the same reason as the
           agreeing case — a mistyped number is not a different person. */
        const w = Math.round(base * verifyFactor(xs[0], ys[0]));
        score -= w; factors.push({ f: t, agree: false, w: -w, verification: verifyLevel(xs[0]) });
      }
    }

    const parts = namePartScore(a, b);
    if (parts) {
      score += parts.w; factors.push({ f: parts.f, agree: parts.w > 0, w: parts.w });
    } else {
      const na = normAr(fullName(a)), nb = normAr(fullName(b));
      if (na && nb) {
        if (normArKey(fullName(a)) === normArKey(fullName(b))) { score += MATCH_WEIGHTS.name; factors.push({ f: "name", agree: true, w: MATCH_WEIGHTS.name }); }
        else {
          /* Partial credit for shared name tokens — Iraqi names are long chains
             (given + father + grandfather + tribe) and get truncated variously. */
          const ta = na.split(" "), tb = nb.split(" ");
          const shared = ta.filter((t) => t.length > 2 && tb.includes(t)).length;
          const w = Math.round((shared / Math.max(ta.length, tb.length)) * MATCH_WEIGHTS.name);
          if (w > 0) { score += w; factors.push({ f: "name-partial", agree: true, w }); }
        }
      }
    }

    if (a.birthDate && b.birthDate) {
      const dw = dobWeight(a, b);
      if (a.birthDate === b.birthDate) { score += dw; factors.push({ f: "birthDate", agree: true, w: dw }); }
      else {
        /* Two estimates disagreeing is not evidence of anything. */
        const pen = dw <= MATCH_WEIGHTS.birthDateEstimated ? 3 : 15;
        score -= pen; factors.push({ f: "birthDate", agree: false, w: -pen });
      }
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

  function findCandidates(candidate, population, at) {
    return (population || [])
      .filter((p) => p.id !== candidate.id)
      .map((p) => { const m = matchScore(candidate, p, at); return { patientId: p.id, ...m, verdict: matchVerdict(m.score) }; })
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

  /* ---- BLOOD GROUP ----
     The fastest fact a trauma team needs, and the one this app must never
     guess. Entered once by the patient, never inferred from anything else in
     the record. "unknown" is a real, selectable, third state — distinct from
     never having been asked — for the same reason `birthDateEstimated` and
     `ID_VERIFY.SELF` exist: a screen that cannot tell "not asked" from
     "asked, and the patient does not know" will nag someone who already
     answered honestly, or worse, let a UI silently default a field this
     consequential to something. */
  const BLOOD_GROUP = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];
  const isValidBloodGroup = (v) => BLOOD_GROUP.indexOf(v) !== -1;
  const BLOOD_GROUP_LABEL = { unknown: ["غير معروف", "Unknown"] };
  const bloodGroupLabel = (v, ar) => (BLOOD_GROUP_LABEL[v] ? BLOOD_GROUP_LABEL[v][ar ? 0 : 1] : (v || ""));

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

  /* A result can only be called normal against a range. Without one the honest
     answer is "unknown", and the guard that was supposed to say so did not.

     It read `!r.refLow == null`, which JavaScript parses as `(!r.refLow) == null`
     — a boolean compared to null, which is ALWAYS false. So the guard never
     fired, and `flagResult({value: 8.4})` with no reference range returned
     "normal". That is not a cosmetic mislabel: `isAbnormal` then returned
     false, so `deriveTasks` raised no RESULT_ACK, the value never reached
     `unacknowledgedAbnormal`, and it never appeared in the pre-visit brief.
     An unjudgeable result was silently declared fine and removed from every
     safety register in the product — the exact failure this module exists to
     catch, produced by a missing pair of parentheses. */
  function flagResult(r) {
    if (!r || r.value == null) return "unknown";
    if (typeof r.value !== "number") return "unknown";
    if (r.refLow == null && r.refHigh == null) return "unknown";
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

  /* The honest third state, and it needs a name for the same reason
     MED_STATE.UNCONFIRMED and EXTRACT_STATE.EXTRACTED do: "we cannot judge
     this" is a different fact from "this is fine", and collapsing them is how
     a result disappears.

     `isAbnormal` correctly stays false here — we do not know that it is
     abnormal — but that means an unjudgeable result raises no task and enters
     no register. Without this predicate it would simply vanish, which is the
     behaviour the broken guard used to produce. A screen that cannot say
     "this number arrived with no reference range" will show it as ordinary. */
  const isUnjudgeable = (r) => !!r && r.abnormal !== true
    && (r.flag ? r.flag === "unknown" : flagResult(r) === "unknown");

  const unjudgeableResults = (list) => (list || []).filter(isUnjudgeable);

  /* =========================================================
     ٧-أ · العلامات الحيوية — VITAL SIGNS
     =========================================================
     `CLASS.VITALS` has existed since the access model was written and nothing
     has ever produced one. Vitals are the cheapest longitudinal signal a
     patient can carry: a home blood-pressure cuff and a bathroom scale are
     common in Iraqi households, the readings are what a hypertension or
     diabetes follow-up actually turns on, and nobody currently writes them
     down anywhere a doctor will see.

     They are results, not a new kind of thing — same shape, same flag rules,
     same provenance, same reference-range honesty. A reading with no range
     is `unknown`, never `normal`. The ranges below are adult resting
     defaults, and they are DEFAULTS: a value carrying its own refLow/refHigh
     wins, because a clinician who set a target for this patient outranks a
     table. */
  const VITAL = {
    BP_SYS: "bp-systolic", BP_DIA: "bp-diastolic", PULSE: "pulse",
    TEMP: "temperature", WEIGHT: "weight", HEIGHT: "height",
    GLUCOSE: "glucose-fasting", SPO2: "spo2",
  };

  /* LOINC where a widely-used code exists, so these travel as FHIR
     Observations rather than as private strings. */
  const VITAL_META = {
    [VITAL.BP_SYS]:  { loinc: "8480-6",  unit: "mmHg",  ar: "الضغط الانقباضي", en: "Systolic BP",  refLow: 90,   refHigh: 130 },
    [VITAL.BP_DIA]:  { loinc: "8462-4",  unit: "mmHg",  ar: "الضغط الانبساطي", en: "Diastolic BP", refLow: 60,   refHigh: 85 },
    [VITAL.PULSE]:   { loinc: "8867-4",  unit: "/min",  ar: "النبض",           en: "Pulse",        refLow: 60,   refHigh: 100 },
    [VITAL.TEMP]:    { loinc: "8310-5",  unit: "°C",    ar: "الحرارة",         en: "Temperature",  refLow: 36.1, refHigh: 37.5 },
    [VITAL.WEIGHT]:  { loinc: "29463-7", unit: "kg",    ar: "الوزن",           en: "Weight",       refLow: null, refHigh: null },
    [VITAL.HEIGHT]:  { loinc: "8302-2",  unit: "cm",    ar: "الطول",           en: "Height",       refLow: null, refHigh: null },
    [VITAL.GLUCOSE]: { loinc: "1558-6",  unit: "mg/dL", ar: "سكر صائم",        en: "Fasting glucose", refLow: 70, refHigh: 99 },
    [VITAL.SPO2]:    { loinc: "59408-5", unit: "%",     ar: "الأكسجين",        en: "Oxygen saturation", refLow: 95, refHigh: 100 },
  };

  /* Weight and height have no "normal" — a range for them is a judgement
     about a person, not a measurement of one, and this file does not make
     those. They stay `unknown` forever and the UI says so, which is the
     honest answer rather than a silent green tick. */
  function recordVital(v, at) {
    if (!v) return { ok: false, reason: "NO_VITAL" };
    const meta = VITAL_META[v.kind];
    if (!meta) return { ok: false, reason: "UNKNOWN_VITAL" };
    if (typeof v.value !== "number" || !isFinite(v.value)) return { ok: false, reason: "VALUE_REQUIRED" };
    if (!v.effectiveAt) return { ok: false, reason: "DATE_REQUIRED" };
    const out = {
      ...v,
      code: meta.loinc, kind: v.kind,
      display: v.display || meta.ar,
      unit: v.unit || meta.unit,
      /* an explicitly-supplied range wins over the table */
      refLow: v.refLow !== undefined ? v.refLow : meta.refLow,
      refHigh: v.refHigh !== undefined ? v.refHigh : meta.refHigh,
      recordedAt: at || v.recordedAt || null,
      class: CLASS.VITALS,
    };
    out.flag = flagResult(out);
    return { ok: true, vital: out };
  }

  const vitalMeta = (kind) => VITAL_META[kind] || null;
  const vitalLabel = (kind, ar) => {
    const m = VITAL_META[kind];
    return m ? (ar ? m.ar : m.en) : kind;
  };
  /* Newest first — a vital is asked about in the present tense. */
  const latestVitals = (list) => {
    const seen = {};
    for (const v of (list || []).slice().sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt)))
      if (v.kind && !seen[v.kind]) seen[v.kind] = v;
    return Object.values(seen);
  };

  /* Blood pressure is ONE reading with two numbers, and splitting it into two
     independent observations — which is what FHIR does on the wire — is how a
     screen ends up showing "140" and "70" on separate rows a scroll apart.
     Paired back together for display, by timestamp. */
  function bloodPressure(list) {
    const sys = (list || []).filter((v) => v.kind === VITAL.BP_SYS);
    const dia = (list || []).filter((v) => v.kind === VITAL.BP_DIA);
    return sys.map((s) => ({
      at: s.effectiveAt,
      systolic: s, diastolic: dia.find((d) => d.effectiveAt === s.effectiveAt) || null,
      /* the pair is abnormal if EITHER half is; a normal diastolic does not
         redeem a systolic of 190 */
      abnormal: isAbnormal(s) || (dia.find((d) => d.effectiveAt === s.effectiveAt)
        ? isAbnormal(dia.find((d) => d.effectiveAt === s.effectiveAt)) : false),
    })).sort((a, b) => new Date(b.at) - new Date(a.at));
  }

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
                     lab: r.performerId || null, flag: r.flag || flagResult(r),
                     /* The reference range travels WITH the point, not with the
                        series: two laboratories can report the same analyte
                        against different ranges, and a screen that borrows the
                        newest range for an older number invents a verdict the
                        lab never issued. */
                     refLow: r.refLow ?? null, refHigh: r.refHigh ?? null }));
    const labs = [...new Set(pts.map((p) => p.lab).filter(Boolean))];
    const units = [...new Set(pts.map((p) => p.unit).filter(Boolean))];
    const first = pts[0], last = pts[pts.length - 1];
    return {
      code,
      /* A brief that prints "4548-4" has told the clinician nothing. The
         human-readable name lives on the result rows; carry it on the series
         so every consumer does not have to go back and look it up. */
      display: ((results || []).find((r) => r.code === code && r.display) || {}).display || null,
      points: pts, labs,
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
      /* Tier 1 by default and always. What this opens is the emergency
         dataset — allergies, current medicines, major conditions, the
         summary — not the record. Reaching the rest is a second, separate
         act of escalation with its own justification; see
         CONSENT.escalateEmergency. An override that grants everything in one
         action is a universal key with a form attached, and it gets used for
         convenience because invoking it costs the same either way. */
      tier: "critical",
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
    ID_TYPE, canRegister, isIdentityBearing, identifiersOf, idOf,
    ID_VERIFY, verifyLevel, FORBIDDEN_FIELDS, forbiddenIn, sanitisePatient, acceptCardScan, NAME_PARTS, fullName,
    BLOOD_GROUP, isValidBloodGroup, bloodGroupLabel,
    MATCH_WEIGHTS, MATCH, normAr, normArKey, isDefaultDob, dobWeight, namePartScore,
    matchScore, matchVerdict, findCandidates, MERGE_STATE, mergeDecision,
    ENC_STATE, ENC_TYPE, SIGN_REQUIRED, canSign, signEncounter, addAddendum, voidEncounter,
    COND_STATE, VERIFY, isChronicActive, isStale, activeConditions, STALE_DAYS,
    MED_STATE, stopMedication, medStatus, currentMedications,
    CRITICALITY, criticalAllergies,
    EP_STATE, EP_MACHINE, canEpTransition, canCloseEpisode,
    TASK_STATE, TASK_KIND, closeTask, isOverdue, openTasks, deriveTasks, ms,
    flagResult, isAbnormal, isUnjudgeable, unjudgeableResults, trend,
    VITAL, VITAL_META, recordVital, vitalMeta, vitalLabel, latestVitals, bloodPressure,
    EXT_STATE, verifyExternal, canPromote,
    ROLE, CLASS, GRANTS, canAccess, breakGlass, breakGlassActive, BREAK_GLASS_MINUTES,
    snapshot, ageOf,
    EVT, buildTimeline, timelineByEpisode,
    SOURCE, provenance, isAuthoritative,
    FHIR_MAP, CODE_SYSTEM, codeable,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
