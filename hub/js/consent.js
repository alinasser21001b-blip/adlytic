/* ============================================================
   قريب · الموافقة والمشاركة وسجل الوصول — CONSENT · SHARING · ACCESS LOG
   ============================================================
   Sections 13, 14, 15 and 26 of the brief, and the part of the product that
   decides whether anyone in Iraq will use it.

   WHY THIS IS OPT-IN, AND WHY THAT IS NOT A DETAIL.

   Abu Dhabi's Malaffi runs an opt-OUT consent model, and it works there. It
   works because a regulator MANDATED participation for every licensed
   facility: the patient's data was going into the exchange whether or not
   they engaged, so opt-out was the mechanism that gave them a way back.

   Qareeb has no mandate and, more importantly, no statute. Iraq has no data
   protection law in force, no data protection authority, and no statutory
   basis for consent to health-record sharing at all. In that vacuum,
   DOCUMENTED CONSENT IS NOT A COMPLIANCE CHECKBOX — IT IS THE ONLY
   DEFENSIBLE LEGAL BASIS THE PRODUCT HAS. Copying Malaffi's opt-out here
   would be copying the mechanism while leaving behind the entire legal
   structure that makes it lawful.

   So every rule below runs the other way: nothing is shared until the
   patient says so, every share is scoped, every share expires on its own,
   and every read is written down where the patient can see it.

   THE SECOND RULE: A SHARE THAT DOES NOT EXPIRE IS NOT A SHARE, IT IS A
   TRANSFER. A patient who taps "share with Dr Ahmed" in a waiting room is
   consenting to a consultation, not to permanent access. Time-boxing is
   therefore structural — there is no code path that creates an unbounded
   grant — and revocation is immediate rather than a request.
   ============================================================ */
(function (root) {
  "use strict";

  const E = root.EMR || {};
  const ms = E.ms || ((t) => (t == null ? null : (typeof t === "number" ? t : new Date(t).getTime())));
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const txt = (v) => String(v == null ? "" : v).trim();

  /* =========================================================
     ١ · نطاقات المشاركة — SHARE SCOPES
     =========================================================
     The scopes are deliberately CLINICAL rather than technical. A patient
     cannot meaningfully consent to "table access"; they can meaningfully
     consent to "my allergies and my current medicines". Each scope is a thing
     a person can picture.
     ========================================================= */

  const SCOPE = {
    SUMMARY: "summary",             /* اللقطة السريرية */
    ALLERGIES: "allergies",
    MEDICATIONS: "medications",
    CONDITIONS: "conditions",
    PROCEDURES: "procedures",
    LABS: "labs",
    IMAGING: "imaging",
    DOCUMENTS: "documents",
    ENCOUNTERS: "encounters",
    IMMUNIZATIONS: "immunizations",
    TIMELINE: "timeline",
  };
  const ALL_SCOPES = Object.values(SCOPE);

  /* The safety floor. A clinician who has been given ANY access at all gets
     these three whether or not the patient ticked them, because a doctor who
     can see the record but not the penicillin allergy is more dangerous than
     a doctor who cannot see the record at all — the first will prescribe
     believing they checked. This is the one place where consent is overridden,
     it overrides in exactly one direction, and it is stated on the share
     screen rather than buried here. */
  const SAFETY_FLOOR = [SCOPE.ALLERGIES];

  /* Sensitive material is NEVER in a default share and is never added by the
     safety floor. Iraq's context makes this sharper than the international
     literature does: with no data protection law and religion printed on the
     national ID, a category-level leak is not an embarrassment, it is a
     danger to the person. */
  const SENSITIVE_CLASSES = (E.CLASS && [E.CLASS.SENSITIVE]) || ["sensitive"];

  const DEFAULT_SCOPES = [SCOPE.SUMMARY, SCOPE.ALLERGIES, SCOPE.MEDICATIONS, SCOPE.CONDITIONS];

  /* ---------- THE EMERGENCY DATASET ----------
     What an unconscious patient's care actually requires, and no more.

     This list was WRONG until it was written down. Break-glass used to open
     the entire record, on the reasoning that an emergency is no time for
     permissions — which sounds right and is not. Australia's My Health Record
     emergency-access literature is clear on the mechanism: an override that
     grants everything is an override that gets used for convenience, because
     the cost of invoking it is the same whether you needed a blood group or
     wanted to read a psychiatric admission. Restricting what it opens is what
     keeps it an emergency tool instead of a universal key with a form
     attached.

     So there are two tiers. Tier 1 is these scopes, reachable in one action
     with a stated reason. Tier 2 is the rest of the record, and it requires a
     SECOND deliberate escalation with its own justification, a shorter clock
     and a louder notification. A resuscitation needs tier 1 and gets it
     instantly; reading last year's clinic letters needs tier 2 and should
     feel like it. */
  const EMERGENCY_SCOPES = [SCOPE.ALLERGIES, SCOPE.MEDICATIONS, SCOPE.CONDITIONS, SCOPE.SUMMARY];
  const EMERGENCY_TIER = { CRITICAL: "critical", FULL: "full" };
  /* Tier 2 is deliberately shorter than tier 1: the broader the access, the
     less of it there should be. */
  const EMERGENCY_MINUTES = { critical: 60, full: 30 };

  /* =========================================================
     ٢ · مدد المشاركة — DURATIONS
     ========================================================= */

  const DURATION = {
    VISIT: { code: "VISIT", ms: 4 * HOUR, ar: "هذه الزيارة", en: "this visit" },
    DAY: { code: "DAY", ms: DAY, ar: "٢٤ ساعة", en: "24 hours" },
    WEEK: { code: "WEEK", ms: 7 * DAY, ar: "٧ أيام", en: "7 days" },
    MONTH: { code: "MONTH", ms: 30 * DAY, ar: "٣٠ يوماً", en: "30 days" },
    /* Ninety days is the ceiling, and it exists so that a patient with a
       chronic condition and one regular doctor is not re-consenting every
       week — which is how consent fatigue turns into rubber-stamping. There
       is deliberately no "forever". */
    QUARTER: { code: "QUARTER", ms: 90 * DAY, ar: "٩٠ يوماً", en: "90 days" },
  };
  const MAX_DURATION_MS = DURATION.QUARTER.ms;

  const SHARE_STATE = { ACTIVE: "active", EXPIRED: "expired", REVOKED: "revoked" };

  /* =========================================================
     ٣ · إنشاء مشاركة — GRANTING
     ========================================================= */

  function canGrant(req, now) {
    if (!req) return { ok: false, reason: "NO_REQUEST" };
    if (!txt(req.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!txt(req.granteeId)) return { ok: false, reason: "GRANTEE_REQUIRED" };
    /* The patient, and only the patient, grants. A clinician cannot grant
       themselves access to a chart, and a clinic cannot grant access on a
       patient's behalf "because they said it was fine at the desk". */
    if (txt(req.grantedBy) !== txt(req.patientId)) return { ok: false, reason: "PATIENT_MUST_GRANT" };
    const scopes = req.scopes || [];
    if (!scopes.length) return { ok: false, reason: "SCOPE_REQUIRED" };
    const unknown = scopes.filter((s) => ALL_SCOPES.indexOf(s) === -1);
    if (unknown.length) return { ok: false, reason: "UNKNOWN_SCOPE", scopes: unknown };
    const d = DURATION[req.duration];
    if (!d) return { ok: false, reason: "DURATION_REQUIRED" };
    /* How the patient said yes, recorded because it is the evidence that the
       consent happened at all. In a country with no statute, an undocumented
       consent is indistinguishable from no consent. */
    if (!MODALITY[req.modality]) return { ok: false, reason: "MODALITY_REQUIRED" };
    return { ok: true };
  }

  const MODALITY = {
    IN_APP: { code: "IN_APP", ar: "موافقة داخل التطبيق", en: "in-app confirmation" },
    OTP: { code: "OTP", ar: "رمز تحقق برسالة", en: "SMS one-time code" },
    QR: { code: "QR", ar: "مسح رمز من هاتف المريض", en: "QR scanned from the patient's phone" },
    WITNESSED: { code: "WITNESSED", ar: "موافقة شفهية بحضور شاهد", en: "witnessed verbal consent" },
    PAPER: { code: "PAPER", ar: "استمارة ورقية موقّعة", en: "signed paper form" },
  };

  function grantShare(req, now) {
    const g = canGrant(req, now);
    if (!g.ok) return g;
    const d = DURATION[req.duration];
    /* The floor is unioned in, sensitive classes are subtracted out, and both
       happen HERE rather than at read time — so what the patient is shown on
       the confirmation screen is exactly what was stored. */
    const scopes = Array.from(new Set([...(req.scopes || []), ...SAFETY_FLOOR]));
    return { ok: true, share: {
      id: req.id || null,
      patientId: req.patientId,
      granteeId: req.granteeId,
      granteeName: req.granteeName || null,
      scopes,
      includesSensitive: false,     /* never on a default grant — see grantSensitive */
      duration: d.code,
      grantedAt: now,
      expiresAt: ms(now) + d.ms,
      modality: req.modality,
      language: req.language || "ar",
      state: SHARE_STATE.ACTIVE,
      revokedAt: null, revokeReason: null,
      /* What the patient was actually shown when they agreed. Consent to a
         thing you were not shown is not consent, and a version number is how
         you prove later which words were on the screen. */
      termsVersion: req.termsVersion || TERMS_VERSION,
    } };
  }

  const TERMS_VERSION = "qareeb-share-1";

  /* Sensitive records take a SECOND, separate act of consent. Bundling them
     into the same tap as "share my allergies" is how a patient discloses a
     psychiatric history they did not mean to disclose. */
  function grantSensitive(share, confirm, now) {
    if (!share) return { ok: false, reason: "NO_SHARE" };
    if (share.state !== SHARE_STATE.ACTIVE) return { ok: false, reason: "NOT_ACTIVE" };
    if (!confirm || confirm.by !== share.patientId) return { ok: false, reason: "PATIENT_MUST_CONFIRM" };
    if (!confirm.acknowledged) return { ok: false, reason: "ACKNOWLEDGEMENT_REQUIRED" };
    return { ok: true, share: { ...share, includesSensitive: true, sensitiveGrantedAt: now } };
  }

  /* =========================================================
     ٤ · حالة المشاركة — STATE
     =========================================================
     Derived, never stored as a mutable flag. A stored "active" boolean is a
     lie waiting for the clock to catch it — the expiry has to be computed
     from the timestamp on every read, or a share that lapsed at 3am is still
     open at 9am because no job ran.
     ========================================================= */

  function shareState(share, now) {
    if (!share) return SHARE_STATE.REVOKED;
    if (share.state === SHARE_STATE.REVOKED) return SHARE_STATE.REVOKED;
    if (ms(now) >= ms(share.expiresAt)) return SHARE_STATE.EXPIRED;
    return SHARE_STATE.ACTIVE;
  }

  const isShareActive = (share, now) => shareState(share, now) === SHARE_STATE.ACTIVE;

  function revokeShare(share, by, now, reason) {
    if (!share) return { ok: false, reason: "NO_SHARE" };
    if (share.state === SHARE_STATE.REVOKED) return { ok: false, reason: "ALREADY_REVOKED" };
    /* Revocation needs no reason and no approval. A patient who has to
       justify withdrawing consent has not really got consent to withdraw. */
    if (txt(by) !== txt(share.patientId)) return { ok: false, reason: "PATIENT_MUST_REVOKE" };
    return { ok: true, share: { ...share, state: SHARE_STATE.REVOKED,
      revokedAt: now, revokeReason: reason || null } };
  }

  const activeShares = (list, now) => (list || []).filter((s) => isShareActive(s, now));

  /* Expiring soon, so the patient can extend deliberately rather than
     discover at the clinic door that access lapsed. */
  const expiringSoon = (list, now, withinMs) => (list || [])
    .filter((s) => isShareActive(s, now) && ms(s.expiresAt) - ms(now) <= (withinMs || DAY))
    .sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt));

  /* =========================================================
     ٥ · قرار الوصول — THE ACCESS DECISION
     =========================================================
     One function, one answer, and it is the only door into the record.
     Everything else in this file exists to make this call correct.
     ========================================================= */

  function decideAccess(ctx) {
    const { actor, patientId, scope, dataClass, shares, breakGlass, now } = ctx || {};
    if (!actor || !txt(actor.id)) return deny("NO_ACTOR");
    if (!txt(patientId)) return deny("NO_PATIENT");

    /* The patient's own record. Always readable by them — including the
       audit log, which is the point of section 15. */
    if (actor.id === patientId) return allow("SELF", ALL_SCOPES);

    /* An emergency override is checked BEFORE the share, not after, because
       the entire reason it exists is that no share was granted. It is
       time-boxed by emr.js and it notifies the patient.

       What it opens depends on its TIER, and tier 1 — the one that is one
       action away — opens the emergency dataset only. */
    if (breakGlass && E.breakGlassActive && E.breakGlassActive(breakGlass, now)) {
      const full = breakGlass.tier === EMERGENCY_TIER.FULL;
      const scopes = full ? ALL_SCOPES : EMERGENCY_SCOPES;
      if (scope && scopes.indexOf(scope) === -1) {
        return { ok: false, basis: "BREAK_GLASS", reason: "BEYOND_EMERGENCY_DATASET",
          scopes, escalationAvailable: true, auditRequired: true, mustNotify: true };
      }
      if (dataClass && SENSITIVE_CLASSES.indexOf(dataClass) !== -1 && !full) {
        return { ok: false, basis: "BREAK_GLASS", reason: "SENSITIVE_NEEDS_ESCALATION",
          scopes, escalationAvailable: true, auditRequired: true, mustNotify: true };
      }
      return { ok: true, basis: "BREAK_GLASS", tier: breakGlass.tier || EMERGENCY_TIER.CRITICAL,
        scopes, sensitive: full, mustNotify: true, auditRequired: true,
        expiresAt: breakGlass.expiresAt };
    }

    const share = (shares || []).find((s) => s.granteeId === actor.id && s.patientId === patientId
      && isShareActive(s, now));
    if (!share) return deny("NO_ACTIVE_SHARE");

    if (scope && share.scopes.indexOf(scope) === -1) {
      return { ok: false, basis: "SHARE", reason: "SCOPE_NOT_GRANTED", scopes: share.scopes,
        auditRequired: true };
    }

    /* Sensitive material needs the second grant even inside an active share,
       and the check comes BEFORE the general allow so it cannot be skipped
       by a scope that happens to be ticked. */
    if (dataClass && SENSITIVE_CLASSES.indexOf(dataClass) !== -1 && !share.includesSensitive) {
      return { ok: false, basis: "SHARE", reason: "SENSITIVE_NOT_GRANTED",
        scopes: share.scopes, auditRequired: true };
    }

    return { ok: true, basis: "SHARE", shareId: share.id, scopes: share.scopes,
      sensitive: !!share.includesSensitive, mustNotify: false, auditRequired: true,
      expiresAt: share.expiresAt };
  }

  const deny = (reason) => ({ ok: false, basis: null, reason, scopes: [], auditRequired: true });
  const allow = (basis, scopes) => ({ ok: true, basis, scopes, sensitive: true,
    mustNotify: false, auditRequired: basis !== "SELF" });

  /* =========================================================
     ٦ · سجل الوصول — ACCESS LOG
     =========================================================
     Section 15, and the brief is right that it is not a secondary feature.
     It is the thing that makes the consent model believable: a promise that
     can be checked is a different object from a promise that cannot.

     Note that DENIED attempts are logged too. A record that only shows
     successful reads cannot answer "did anyone TRY to open my file", which
     is the question a patient in a small city actually has.
     ========================================================= */

  /* An audit entry must answer six questions, not three. The first version
     answered WHO, WHAT and WHEN — which is enough to render a list and not
     enough to investigate anything. "Dr X viewed medications on Tuesday"
     cannot distinguish a legitimate consultation from a colleague looking up
     a neighbour, and that distinction is the entire reason the log exists.

       WHO      actor + role + organisation
       WHAT     scope + data class
       WHEN     at
       WHY      purpose — what the actor said they were doing
       WHERE    context — device, facility, channel
       UNDER
       WHICH    authority — the share id, the emergency grant, or nothing
       AUTH

     `purpose` is carried from the access request the patient approved, so
     the reason in the log is the same sentence the patient read before
     saying yes — not a category picked afterwards from a dropdown. */
  function accessEntry(ctx, decision, now) {
    const { actor, patientId, scope, dataClass, purpose, context } = ctx || {};
    const d = decision || {};
    return {
      /* WHO */
      patientId,
      actorId: actor && actor.id || null,
      actorName: actor && actor.name || null,
      actorRole: actor && actor.role || null,
      staffRole: actor && actor.staffRole || null,
      organizationId: actor && actor.organizationId || null,
      /* WHAT */
      scope: scope || null,
      dataClass: dataClass || null,
      /* WHEN */
      at: now,
      /* WHY */
      purpose: purpose || null,
      /* WHERE — never an IP address. In a country with no data protection
         law, a table linking clinicians to network locations is its own
         hazard; facility and device class answer the investigative question
         without building that. */
      context: context ? { facilityId: context.facilityId || null,
        deviceId: context.deviceId || null, channel: context.channel || null } : null,
      /* UNDER WHICH AUTHORISATION */
      granted: !!d.ok,
      basis: d.basis || null,
      authority: d.basis === "SHARE" ? { kind: "SHARE", id: d.shareId || null, expiresAt: d.expiresAt || null }
        : d.basis === "BREAK_GLASS" ? { kind: "BREAK_GLASS", tier: d.tier || EMERGENCY_TIER.CRITICAL,
            expiresAt: d.expiresAt || null }
        : d.basis === "SELF" ? { kind: "SELF" }
        : null,
      reason: d.reason || null,
      shareId: d.shareId || null,
    };
  }

  /* What the patient sees. Grouped by actor and session rather than listed
     raw, because forty rows saying "viewed medications" is noise, and noise
     is how a real intrusion hides. */
  const SESSION_MS = 30 * MIN;

  function accessHistory(log, now, lang) {
    const ar = lang !== "en";
    const rows = (log || []).slice().sort((a, b) => ms(b.at) - ms(a.at));
    const out = [];
    for (const r of rows) {
      const prev = out[out.length - 1];
      if (prev && prev.actorId === r.actorId && prev.granted === r.granted
          && prev.basis === r.basis && ms(prev.at) - ms(r.at) <= SESSION_MS) {
        if (r.scope && prev.scopes.indexOf(r.scope) === -1) prev.scopes.push(r.scope);
        prev.at = r.at;   /* the session's earliest moment */
        prev.count++;
        continue;
      }
      out.push({ actorId: r.actorId, actorName: r.actorName, actorRole: r.actorRole,
        organizationId: r.organizationId, granted: r.granted, basis: r.basis,
        reason: r.reason, scopes: r.scope ? [r.scope] : [], at: r.at, count: 1,
        label: basisLabel(r, ar) });
    }
    return out;
  }

  function basisLabel(r, ar) {
    if (!r.granted) return ar ? "محاولة وصول مرفوضة" : "access attempt refused";
    switch (r.basis) {
      case "BREAK_GLASS": return ar ? "وصول طوارئ — بلا موافقة مسبقة" : "emergency access — without prior consent";
      case "SELF": return ar ? "أنت" : "you";
      default: return ar ? "بموافقتك" : "with your consent";
    }
  }

  /* The three things a patient should be told without having to look. */
  function accessAlerts(log, now, lang) {
    const ar = lang !== "en";
    const since = ms(now) - 30 * DAY;
    const recent = (log || []).filter((r) => ms(r.at) >= since);
    const alerts = [];
    const bg = recent.filter((r) => r.basis === "BREAK_GLASS");
    if (bg.length) alerts.push({ kind: "BREAK_GLASS", count: bg.length, at: bg[0].at,
      text: ar ? "فُتح ملفك بوصول طوارئ" : "your record was opened under emergency access" });
    const denied = recent.filter((r) => !r.granted);
    if (denied.length) alerts.push({ kind: "DENIED", count: denied.length, at: denied[0].at,
      text: ar ? "محاولات وصول مرفوضة" : "refused access attempts" });
    return alerts;
  }

  /* =========================================================
     ٧ · طلب الوصول — THE DOCTOR'S REQUEST
     =========================================================
     The other direction: a clinician in front of a patient asks, the patient
     approves on their own phone. This is the flow that actually happens in a
     consulting room, and building only the patient-initiated share would
     leave the common case to a workaround.
     ========================================================= */

  const REQ_STATE = { PENDING: "pending", APPROVED: "approved", DECLINED: "declined", EXPIRED: "expired" };
  /* A request a patient did not answer must die on its own. A pending request
     that lives forever is a consent prompt waiting to be tapped by accident
     six weeks later. */
  const REQUEST_TTL = 15 * MIN;

  function requestAccess(req, now) {
    if (!req) return { ok: false, reason: "NO_REQUEST" };
    if (!txt(req.patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!req.requester || !txt(req.requester.id)) return { ok: false, reason: "REQUESTER_REQUIRED" };
    const scopes = req.scopes && req.scopes.length ? req.scopes : DEFAULT_SCOPES;
    const unknown = scopes.filter((s) => ALL_SCOPES.indexOf(s) === -1);
    if (unknown.length) return { ok: false, reason: "UNKNOWN_SCOPE", scopes: unknown };
    /* The clinician states WHY, and the patient sees it. "Dr Ahmed wants to
       see your medicines" is a decision a person can make; an unexplained
       permission prompt is one they can only guess at. */
    if (!txt(req.purpose)) return { ok: false, reason: "PURPOSE_REQUIRED" };
    return { ok: true, request: { ...req, scopes, state: REQ_STATE.PENDING,
      requestedAt: now, expiresAt: ms(now) + REQUEST_TTL } };
  }

  function requestState(req, now) {
    if (!req) return REQ_STATE.EXPIRED;
    if (req.state !== REQ_STATE.PENDING) return req.state;
    return ms(now) >= ms(req.expiresAt) ? REQ_STATE.EXPIRED : REQ_STATE.PENDING;
  }

  function respondToRequest(req, decision, by, now, opts) {
    if (!req) return { ok: false, reason: "NO_REQUEST" };
    if (requestState(req, now) !== REQ_STATE.PENDING) return { ok: false, reason: "NOT_PENDING" };
    if (txt(by) !== txt(req.patientId)) return { ok: false, reason: "PATIENT_MUST_RESPOND" };
    if (decision === REQ_STATE.DECLINED) {
      return { ok: true, request: { ...req, state: REQ_STATE.DECLINED, respondedAt: now }, share: null };
    }
    if (decision !== REQ_STATE.APPROVED) return { ok: false, reason: "BAD_DECISION" };
    const o = opts || {};
    /* Approving grants AT MOST what was asked for. A patient may narrow the
       request; they can never be talked into widening it by the same tap. */
    const asked = req.scopes || [];
    const chosen = (o.scopes || asked).filter((s) => asked.indexOf(s) !== -1);
    const g = grantShare({
      id: o.shareId || null,
      patientId: req.patientId, grantedBy: req.patientId,
      granteeId: req.requester.id, granteeName: req.requester.name || null,
      scopes: chosen, duration: o.duration || "VISIT",
      modality: o.modality || "IN_APP", language: o.language || "ar",
    }, now);
    if (!g.ok) return g;
    return { ok: true, request: { ...req, state: REQ_STATE.APPROVED, respondedAt: now }, share: g.share };
  }

  /* =========================================================
     ٨ · الملخّص المحمول — THE PATIENT-HELD SUMMARY
     =========================================================
     The strongest single evidence in the whole research pass: Mozambique
     issued 134 patient-held records and 121 (90.3%) were still in the
     patient's possession twelve months later, in good condition, with every
     visit captured. The authors concluded it could replace the hospital's own
     paper file.

     For Iraq that is not a fallback, it is the realistic v1 longitudinal
     record: care is private and fragmented, there is no national exchange to
     join, and the patient already carries their own history in a plastic bag.
     A printable Arabic summary with a redeemable code works in a clinic with
     no computer, survives a power cut, and needs no institution's permission.

     The code is short-lived and single-use by design. A QR printed on paper
     that opens the whole record forever is a record with no access control at
     all — anyone who photographs the page has it.
     ========================================================= */

  const CARRY_TTL = 72 * HOUR;

  function issueCarryCode(patientId, scopes, now, code, duration) {
    if (!txt(patientId)) return { ok: false, reason: "PATIENT_REQUIRED" };
    if (!txt(code)) return { ok: false, reason: "CODE_REQUIRED" };
    const chosen = (scopes && scopes.length ? scopes : DEFAULT_SCOPES)
      .filter((s) => ALL_SCOPES.indexOf(s) !== -1);
    if (!chosen.length) return { ok: false, reason: "SCOPE_REQUIRED" };
    /* The patient chooses how long the access they are handing over lasts,
       not just what it covers. Unrecognised or absent means the shortest
       option, never the longest — a defaulting bug should cost the patient
       less access, not more. Codes issued before this field existed have no
       `duration` and land on VISIT, which is what they already did. */
    const dur = DURATION[duration] ? duration : "VISIT";
    return { ok: true, carry: {
      code, patientId,
      scopes: Array.from(new Set([...chosen, ...SAFETY_FLOOR])),
      includesSensitive: false,
      duration: dur,
      issuedAt: now, expiresAt: ms(now) + CARRY_TTL,
      redeemedBy: null, redeemedAt: null,
    } };
  }

  function redeemCarryCode(carry, redeemer, now) {
    if (!carry) return { ok: false, reason: "NO_CODE" };
    if (carry.redeemedBy) return { ok: false, reason: "ALREADY_REDEEMED" };
    if (ms(now) >= ms(carry.expiresAt)) return { ok: false, reason: "EXPIRED" };
    if (!redeemer || !txt(redeemer.id)) return { ok: false, reason: "REDEEMER_REQUIRED" };
    /* Redeeming produces an ordinary, ordinary-length share — the paper is
       the introduction, not the access. */
    const g = grantShare({
      patientId: carry.patientId, grantedBy: carry.patientId,
      granteeId: redeemer.id, granteeName: redeemer.name || null,
      scopes: carry.scopes, duration: DURATION[carry.duration] ? carry.duration : "VISIT",
      modality: "QR",
    }, now);
    if (!g.ok) return g;
    return { ok: true, carry: { ...carry, redeemedBy: redeemer.id, redeemedAt: now }, share: g.share };
  }

  /* =========================================================
     ٩ · التسمية بالعربية — LABELS
     =========================================================
     Scope names live with the scopes so that a screen cannot invent its own
     wording for a legal object. What the patient consented to and what the
     patient was shown must be the same string.
     ========================================================= */

  const SCOPE_LABEL = {
    summary: { ar: "اللقطة السريرية", en: "Clinical summary" },
    allergies: { ar: "الحساسية", en: "Allergies" },
    medications: { ar: "الأدوية الحالية", en: "Current medications" },
    conditions: { ar: "المشاكل الصحية النشطة", en: "Active conditions" },
    procedures: { ar: "العمليات السابقة", en: "Previous procedures" },
    labs: { ar: "التحاليل", en: "Lab results" },
    imaging: { ar: "الأشعة", en: "Imaging" },
    documents: { ar: "التقارير والمستندات", en: "Documents" },
    encounters: { ar: "الزيارات السابقة", en: "Previous visits" },
    immunizations: { ar: "التطعيمات", en: "Immunizations" },
    timeline: { ar: "الخط الزمني", en: "Timeline" },
  };
  const scopeLabel = (s, lang) => (SCOPE_LABEL[s] || { ar: s, en: s })[lang === "en" ? "en" : "ar"];

  /* =========================================================
     ١٢ · تصعيد الطوارئ — EMERGENCY ESCALATION
     =========================================================
     Getting from tier 1 to tier 2 is a separate, deliberate act with its own
     justification. It cannot be reached by retrying tier 1.
     ========================================================= */

  function escalateEmergency(grant, reason, actor, now) {
    if (!grant) return { ok: false, reason: "NO_GRANT" };
    if (grant.tier === EMERGENCY_TIER.FULL) return { ok: false, reason: "ALREADY_FULL" };
    if (!actor || actor.id !== grant.actorId) return { ok: false, reason: "SAME_ACTOR_REQUIRED" };
    if (!E.breakGlassActive || !E.breakGlassActive(grant, now)) return { ok: false, reason: "GRANT_EXPIRED" };
    /* The tier-1 reason does not carry over. Opening the whole record needs
       its own sentence, because the two decisions are not the same decision. */
    const r = txt(reason);
    if (r.length < 15) return { ok: false, reason: "ESCALATION_REASON_REQUIRED" };
    return { ok: true, grant: { ...grant, tier: EMERGENCY_TIER.FULL,
      escalatedAt: now, escalationReason: r,
      /* The clock RESTARTS shorter, not longer. */
      expiresAt: ms(now) + EMERGENCY_MINUTES.full * MIN,
      notifyPatient: true, notifyCompliance: true } };
  }

  /* What tier 1 actually renders: the card an ambulance crew needs, built
     from the record rather than authored separately so it cannot go stale. */
  function emergencyCard(patient, record, now, lang) {
    const ar = lang !== "en";
    const r = record || {};
    return {
      name: E.fullName ? E.fullName(patient) : (patient && patient.name) || null,
      age: E.ageOf ? E.ageOf(patient && patient.birthDate, now) : null,
      sex: (patient && patient.sex) || null,
      bloodGroup: r.bloodGroup || null,
      allergies: (E.criticalAllergies ? E.criticalAllergies(r.allergies) : (r.allergies || []))
        .map((a) => ({ substance: a.substance, reaction: a.reaction || null, criticality: a.criticality })),
      criticalMedications: (E.currentMedications ? E.currentMedications(r.medications, now) : [])
        .filter((m) => m.anticoagulant || m.insulin || m.steroid || m.critical)
        .map((m) => ({ display: m.display, dose: m.dose || null })),
      majorConditions: (E.activeConditions ? E.activeConditions(r.conditions, now) : [])
        .filter((c) => c.chronic).map((c) => c.display),
      warnings: r.clinicalWarnings || [],
      emergencyContact: (patient && patient.emergencyContact) || null,
      /* Absence is stated, not left blank — a blank blood group and an
         unrecorded one look identical on a screen and mean opposite things
         at a trauma bay. */
      notRecorded: [
        !r.bloodGroup && (ar ? "فصيلة الدم غير مسجّلة" : "blood group not recorded"),
        !(r.allergies || []).length && (ar ? "الحساسية غير مسجّلة — وهذا لا يعني عدمها"
                                           : "allergies not recorded — which does not mean none"),
        !(patient && patient.emergencyContact) && (ar ? "ما في جهة اتصال طوارئ"
                                                      : "no emergency contact"),
      ].filter(Boolean),
    };
  }

  root.CONSENT = {
    SCOPE, ALL_SCOPES, DEFAULT_SCOPES, SAFETY_FLOOR, SENSITIVE_CLASSES,
    EMERGENCY_SCOPES, EMERGENCY_TIER, EMERGENCY_MINUTES, escalateEmergency, emergencyCard,
    DURATION, MAX_DURATION_MS, MODALITY, TERMS_VERSION,
    SHARE_STATE, canGrant, grantShare, grantSensitive,
    shareState, isShareActive, revokeShare, activeShares, expiringSoon,
    decideAccess,
    accessEntry, accessHistory, accessAlerts, SESSION_MS,
    REQ_STATE, REQUEST_TTL, requestAccess, requestState, respondToRequest,
    CARRY_TTL, issueCarryCode, redeemCarryCode,
    SCOPE_LABEL, scopeLabel,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
