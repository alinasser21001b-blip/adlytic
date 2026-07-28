/* ============================================================
   QAREEB — قريب  ·  DOMAIN
   ============================================================
   Pure rules. No DOM, no globals from app.js, no I/O. Everything here is a
   function of its arguments, which is the whole point: this is the layer that
   can be tested without a browser, and `tools/test.mjs` runs it in Node.

   WHY THIS FILE EXISTS. The app grew screen-first — the rules that matter
   (who may claim stock, what may be broadcast, which medicines must never be
   broadcast at all) lived inside render functions, mixed with markup, where
   nothing could assert them. A rule you cannot test is a rule you are
   guessing about. Everything in here is a rule someone can get hurt by.

   It attaches to `globalThis.QD` as a plain script, because the app has no
   build step and is not getting one. The test harness evaluates the same file
   and reads the same namespace, so the tested code and the shipped code are
   byte-identical.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------
     1 · PRESCRIPTION CLASS
     ---------------------------------------------------------------
     Three classes, and the third one is why this section exists. An OTC
     medicine and a prescription medicine differ in what we ask the patient
     for. A CONTROLLED medicine differs in what we are permitted to do at
     all: it must never enter a public request, because a public list of who
     wants morphine near which landmark is a targeting list. It is handed to
     a licensed pharmacy directly or not handled.
  ---------------------------------------------------------------- */
  const RX_CLASS = { OTC: "OTC", RX: "RX", CONTROLLED: "CONTROLLED" };

  /* A medicine is controlled if the catalogue says so. There is no clever
     inference here on purpose — guessing "it sounds like an opioid" is worse
     than an explicit field a pharmacist can review. Unknown falls back to RX,
     never to OTC: the safe default is the more careful one. */
  function classOf(med) {
    if (!med) return RX_CLASS.RX;
    if (med.controlled === true) return RX_CLASS.CONTROLLED;
    if (med.rx === false) return RX_CLASS.OTC;
    return RX_CLASS.RX;
  }

  const isControlled = (med) => classOf(med) === RX_CLASS.CONTROLLED;

  /* ---------------------------------------------------------------
     2 · WHAT MAY BE BROADCAST
     ---------------------------------------------------------------
     A request goes out to pharmacies. This builds the payload, and it is a
     whitelist rather than a redaction: fields are copied in by name, so a
     field added to the request object later cannot leak by default. The
     inverse — "copy everything, delete the private bits" — fails silently
     every time someone adds a field.

     What is deliberately NOT here: any patient identifier, any phone number,
     any prescription image, any free-text medical note, and any location
     finer than the district. The landmark the patient typed ("near Yarmouk
     hospital") is theirs to give a pharmacy in conversation, not ours to
     publish to every pharmacy in the governorate.
  ---------------------------------------------------------------- */
  function broadcastDecision(req, med) {
    if (!req) return { ok: false, reason: "NO_REQUEST" };
    if (isControlled(med)) return { ok: false, reason: "CONTROLLED" };
    if (!req.city) return { ok: false, reason: "NO_LOCATION" };
    return { ok: true, reason: null };
  }

  function broadcastPayload(req, med) {
    const d = broadcastDecision(req, med);
    if (!d.ok) return { ok: false, reason: d.reason, payload: null };
    return {
      ok: true,
      reason: null,
      payload: {
        requestId: req.id,
        variantId: req.v || null,
        typedName: req.v ? null : ((req.manual && req.manual.name) || null),
        strength: req.v ? null : ((req.manual && req.manual.strength) || null),
        form: req.v ? null : ((req.manual && req.manual.form) || null),
        city: req.city,
        district: req.district || null,
        quantity: req.qty || null,
        urgency: req.urg || "normal",
        acceptsAlternative: !!req.altOk,
        prescriptionHeld: req.rxHeld === true,
        requestClass: req.rxHeld === true ? "PRESCRIPTION_HELD" : "OPEN",
        createdAt: req.ts || null,
      },
    };
  }

  /* Fields that must never appear in a broadcast, by name. The test asserts
     the payload contains none of them — a cheap check that catches the most
     likely future mistake, which is someone widening the whitelist. */
  const FORBIDDEN_IN_BROADCAST = ["lm", "landmark", "phone", "wa", "photo",
    "image", "note", "notes", "patient", "name", "auth"];

  /* ---------------------------------------------------------------
     3 · REQUEST LIFECYCLE
     ---------------------------------------------------------------
     One machine, declared transitions, and a mapping to the S0–S5 demand
     vocabulary the spec is written in — so a conversation about "S3" and a
     conversation about "acknowledged" are about the same thing rather than
     two models drifting apart.
  ---------------------------------------------------------------- */
  const MACHINE = {
    idle: ["broadcasting"],
    broadcasting: ["acknowledged", "expired"],
    acknowledged: ["handoff", "fulfilled", "expired"],
    handoff: ["fulfilled", "acknowledged", "expired"],
    fulfilled: [],
    expired: [],
  };

  const LIVE_STATES = ["broadcasting", "acknowledged", "handoff"];

  const STAGE = {
    idle: "S0", broadcasting: "S2", acknowledged: "S3",
    handoff: "S4", fulfilled: "S5", expired: "S1",
  };

  const canTransition = (from, to) => !!MACHINE[from] && MACHINE[from].indexOf(to) !== -1;
  const isLive = (state) => LIVE_STATES.indexOf(state) !== -1;
  const stageOf = (state) => STAGE[state] || "S0";

  /* Time-to-live scales with what the patient said their urgency is, because
     an urgent request that is still "live" three days later is a lie about
     the network to everyone who sees it. */
  const TTL_BY_URGENCY = { urgent: 360, high: 1440, normal: 4320 };
  const ttlFor = (urg) => TTL_BY_URGENCY[urg] || TTL_BY_URGENCY.normal;

  function isExpired(req, nowMs) {
    if (!req || !req.ts) return false;
    const ageMin = (nowMs - req.ts) / 60000;
    return ageMin >= ttlFor(req.urg);
  }

  /* ---------------------------------------------------------------
     4 · WHO MAY CLAIM STOCK
     ---------------------------------------------------------------
     The single most important rule in the product, and until now it did not
     exist: the pharmacist screen trusted whoever opened the URL. "No fake
     availability" rested on nothing at all.

     A claim is only meaningful if it is attributable to a licensed pharmacy,
     so answering requires a principal whose licence is verified AND who is
     acting for the branch they claim to be. Everything else — browsing the
     directory, reading the explorer — stays open to everyone, because a
     patient looking for a pharmacy at 2am must never meet a login wall.
  ---------------------------------------------------------------- */
  const ROLE = {
    PATIENT: "PATIENT",
    PHARMACY_STAFF: "PHARMACY_STAFF",
    VERIFIED_PHARMACIST: "VERIFIED_PHARMACIST",
  };

  function principalOf(session) {
    if (!session || !session.role) return { role: ROLE.PATIENT, pharmacyId: null, licenseStatus: "UNKNOWN" };
    return {
      role: session.role,
      pharmacyId: session.pharmacyId || null,
      pharmacistId: session.pharmacistId || null,
      licenseStatus: session.licenseStatus || "UNKNOWN",
    };
  }

  /* Returns a reason, not just false — the screen has to be able to tell the
     pharmacist WHY they cannot answer, and "no" with no explanation is how
     you lose a supply-side user permanently. */
  function canAnswer(principal, pharmacyId) {
    const p = principalOf(principal);
    if (p.role === ROLE.PATIENT) return { ok: false, reason: "NOT_A_PHARMACY" };
    if (p.licenseStatus === "EXPIRED") return { ok: false, reason: "LICENSE_EXPIRED" };
    if (p.licenseStatus !== "VERIFIED") return { ok: false, reason: "LICENSE_UNVERIFIED" };
    if (!p.pharmacyId) return { ok: false, reason: "NO_BRANCH" };
    if (pharmacyId && p.pharmacyId !== pharmacyId) return { ok: false, reason: "WRONG_BRANCH" };
    return { ok: true, reason: null };
  }

  /* Reading a prescription is a higher bar than answering with stock: staff
     may say "we have it", only a verified pharmacist may open the document. */
  function canReadPrescription(principal, pharmacyId) {
    const p = principalOf(principal);
    if (p.role !== ROLE.VERIFIED_PHARMACIST) return { ok: false, reason: "NOT_A_PHARMACIST" };
    return canAnswer(p, pharmacyId);
  }

  /* ---------------------------------------------------------------
     5 · CONSENT
     ---------------------------------------------------------------
     Consent that does not say what it is for is not consent. Every record
     carries the four things a person needs in order to have actually agreed:
     what it is used for, who sees it, how long it lives, and how to take it
     back — plus the fact that access is logged, which is the part that makes
     the audit trail meaningful to the person it protects.
  ---------------------------------------------------------------- */
  const CONSENT_VERSION = "1.0.0";

  const CONSENT_TERMS = {
    purpose_ar: "لمطابقة طلبك مع صيدلية تمتلك الدواء المطلوب.",
    recipients_ar: "الصيدلية التي تقبل طلبك فقط — لا تُعرض على غيرها.",
    retention_ar: "تُحذف بعد ٢٤ ساعة من انتهاء الطلب أو إلغائه.",
    withdrawal_ar: "تكدر تسحب الموافقة بأي وقت من «طلباتي».",
    audited_ar: "كل فتح للوصفة يُسجَّل باسم الصيدلي ووقته.",
  };

  function grantConsent(sessionId, atMs) {
    return {
      id: "c" + String(atMs),
      sessionId: sessionId || null,
      version: CONSENT_VERSION,
      terms: CONSENT_TERMS,
      grantedAt: atMs,
      withdrawnAt: null,
    };
  }

  const withdrawConsent = (c, atMs) => (c ? Object.assign({}, c, { withdrawnAt: atMs }) : c);
  const consentActive = (c) => !!c && !c.withdrawnAt;

  /* ---------------------------------------------------------------
     6 · AUDIT CHAIN
     ---------------------------------------------------------------
     Append-only, each entry carrying the hash of the one before it, so an
     entry cannot be edited or removed without breaking every link after it.

     HONEST LIMITS, stated because the alternative is implying a guarantee we
     do not have: this is TAMPER-EVIDENT, not tamper-proof. It lives in the
     browser, where whoever holds the device can rewrite the whole chain from
     the start. The checksum below is a fast non-cryptographic hash — it
     detects accident and casual editing, not a determined forger. Real
     integrity needs the chain written server-side to append-only storage,
     which is on the pre-launch list and is not this.
  ---------------------------------------------------------------- */
  function checksum(str) {
    /* FNV-1a, 32-bit, expressed as 8 hex digits. Chosen for being short,
       synchronous and dependency-free; explicitly NOT chosen for being
       cryptographic, which it is not. */
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  const GENESIS = "00000000";

  function auditAppend(chain, entry) {
    const prev = chain.length ? chain[chain.length - 1].entryHash : GENESIS;
    const body = JSON.stringify({
      action: entry.action, actor: entry.actor || null, subject: entry.subject || null,
      pharmacyId: entry.pharmacyId || null, reason: entry.reason || null, at: entry.at,
    });
    const rec = Object.assign({}, entry, { previousHash: prev, entryHash: checksum(prev + body) });
    return chain.concat([rec]);
  }

  /* Returns the index of the first broken link, or -1 when the chain is
     intact. An index rather than a boolean because "which entry" is the
     first question anyone asks. */
  function auditVerify(chain) {
    let prev = GENESIS;
    for (let i = 0; i < chain.length; i++) {
      const e = chain[i];
      const body = JSON.stringify({
        action: e.action, actor: e.actor || null, subject: e.subject || null,
        pharmacyId: e.pharmacyId || null, reason: e.reason || null, at: e.at,
      });
      if (e.previousHash !== prev || e.entryHash !== checksum(prev + body)) return i;
      prev = e.entryHash;
    }
    return -1;
  }

  /* ---------------------------------------------------------------
     7 · PRICE PROVENANCE
     ---------------------------------------------------------------
     Two prices that must never be shown as one number. The official
     reference comes from the government source; the other is what a specific
     pharmacy said on a specific date. Merging them into "the price" is how a
     patient ends up arguing at a counter holding a number nobody stands
     behind. When the official source is unreachable, that is displayed —
     never silently swapped for the pharmacy's figure.
  ---------------------------------------------------------------- */
  function priceView(official, reported) {
    return {
      official: official && official.status === "verified"
        ? { amount: official.officialPriceIqd, at: official.verifiedAt, state: "verified" }
        : { amount: null, at: null, state: "unavailable",
            reason: (official && official.reason) || "NOT_CHECKED" },
      reported: reported && typeof reported.amountIqd === "number"
        ? { amount: reported.amountIqd, at: reported.confirmedAt,
            pharmacyId: reported.pharmacyId || null, state: "reported" }
        : { amount: null, at: null, pharmacyId: null, state: "none" },
    };
  }

  /* A gap worth showing the patient. Below the threshold it is noise; above
     it, a patient deserves to know before they travel. */
  function priceGap(view, thresholdPct) {
    const o = view.official.amount, r = view.reported.amount;
    if (!o || !r) return null;
    const pct = ((r - o) / o) * 100;
    return Math.abs(pct) >= (thresholdPct || 15) ? Math.round(pct) : null;
  }

  /* ---------------------------------------------------------------
     8 · LAUNCH READINESS
     ---------------------------------------------------------------
     Placeholder data must not be able to reach production quietly. This is
     the assertion the release checklist runs against real data.
  ---------------------------------------------------------------- */
  const PLACEHOLDER_PHONE = /^9647700000/;

  function launchBlockers(facilities, opts) {
    const o = opts || {};
    const out = [];
    const placeholders = (facilities || []).filter(
      (f) => PLACEHOLDER_PHONE.test(String(f.phone || "")) || PLACEHOLDER_PHONE.test(String(f.wa || ""))
    );
    if (placeholders.length) {
      out.push({ id: "PLACEHOLDER_NUMBERS", count: placeholders.length,
        ar: "أرقام هاتف/واتساب نموذجية لم تُستبدل" });
    }
    if (!o.pharmacyAuthBackend) {
      out.push({ id: "NO_PHARMACY_AUTH_BACKEND", count: 1,
        ar: "بوابة الصيدلية محلية على الجهاز — تحتاج تحققاً من الخادم" });
    }
    if (!o.auditServerSide) {
      out.push({ id: "AUDIT_CLIENT_SIDE", count: 1,
        ar: "سجل التدقيق داخل المتصفح — يكشف العبث ولا يمنعه" });
    }
    if (!o.realData) {
      out.push({ id: "SYNTHETIC_DATA", count: 1,
        ar: "البيانات نموذجية بالكامل" });
    }
    return out;
  }

  root.QD = {
    RX_CLASS, classOf, isControlled,
    broadcastDecision, broadcastPayload, FORBIDDEN_IN_BROADCAST,
    MACHINE, LIVE_STATES, STAGE, canTransition, isLive, stageOf,
    TTL_BY_URGENCY, ttlFor, isExpired,
    ROLE, principalOf, canAnswer, canReadPrescription,
    CONSENT_VERSION, CONSENT_TERMS, grantConsent, withdrawConsent, consentActive,
    checksum, GENESIS, auditAppend, auditVerify,
    priceView, priceGap,
    PLACEHOLDER_PHONE, launchBlockers,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
