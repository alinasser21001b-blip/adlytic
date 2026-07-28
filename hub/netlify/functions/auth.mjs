/* ==================================================================
   QAREEB — PHARMACY AUTHENTICATION
   ==================================================================
   Closes NO_PHARMACY_AUTH_BACKEND. The rules for who may claim stock were
   already real and tested in js/domain.js; what was missing was a party
   other than the claimant deciding whether the credential is genuine. A
   check that runs on the device of the person being checked is not a check.

   Two steps, deliberately:
     POST {action:"request"}  → licence + phone are validated, a code is sent
     POST {action:"verify"}   → code is checked, a signed session is issued

   The session token is signed with a server secret and carries the branch it
   is bound to. The client cannot mint one, cannot widen its own role, and
   cannot move it to another branch — all three were possible when the
   session was just an object in localStorage.

   WHAT THIS STILL IS NOT: the licence registry below is a static allow-list
   in an environment variable, not a live query against the Ministry of
   Health. That is the last mile and it needs an agreement, not code. Until
   then a licence is "on our list" rather than "confirmed by the regulator",
   and /status says exactly that so nothing downstream can overstate it.
   ================================================================== */
import { json, misconfigured, secret, sign, verify, otpFor, otpValid,
         normalisePhone, isPlaceholderPhone, LICENCE, rateLimit } from "./_lib.mjs";

/* The registry, as JSON in QAREEB_PHARMACY_REGISTRY:
     [{"licence":"IQ-PH-1234","pharmacyId":"b1","phone":"9647801234567",
       "pharmacistName":"...","expiresAt":"2027-01-01"}]
   An empty or absent registry means nobody can sign in. That is the correct
   failure: an empty allow-list must not mean "allow anyone". */
function registry() {
  try {
    const raw = process.env.QAREEB_PHARMACY_REGISTRY;
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function findLicence(licence, phone) {
  return registry().find((r) =>
    String(r.licence || "").toUpperCase() === String(licence || "").toUpperCase() &&
    normalisePhone(r.phone) === phone) || null;
}

const expired = (rec) => !!rec.expiresAt && Date.now() > Date.parse(rec.expiresAt);

export default async (request) => {
  if (request.method === "GET") {
    /* What the client asks on boot to find out whether real auth exists. It
       reports capability, never secrets, and is honest about the last mile. */
    return json(200, {
      configured: !!secret(),
      registrySize: registry().length,
      licenceSource: "STATIC_ALLOWLIST",
      regulatorVerified: false,
      ar: secret()
        ? "المصادقة تعمل على الخادم. التحقق من الإجازة يتم مقابل قائمة معتمدة لدينا، وليس مقابل سجل الوزارة مباشرة."
        : "المصادقة غير مهيّأة على الخادم.",
    });
  }
  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!secret()) return misconfigured();

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "BAD_JSON" }); }

  const ip = request.headers.get("x-nf-client-connection-ip") || "unknown";
  const licence = String(body.licence || "").trim().toUpperCase();
  const phone = normalisePhone(body.phone);

  if (!LICENCE.test(licence)) {
    return json(400, { error: "BAD_LICENCE", ar: "صيغة رقم الإجازة غير صحيحة (IQ-PH-0000)." });
  }
  if (!phone) {
    return json(400, { error: "BAD_PHONE", ar: "رقم الموبايل غير صحيح." });
  }
  if (isPlaceholderPhone(phone)) {
    return json(400, { error: "PLACEHOLDER_PHONE",
      ar: "هذا رقم نموذجي من بيانات العرض ولا يصلح للدخول." });
  }

  /* ---------- step 1: request a code ---------- */
  if (body.action === "request") {
    if (!rateLimit("req:" + ip, 5, 10 * 60 * 1000)) {
      return json(429, { error: "TOO_MANY", ar: "محاولات كثيرة. جرّب بعد شوية." });
    }
    const rec = findLicence(licence, phone);
    /* The same response whether or not the pair exists. Saying "no such
       licence" turns this endpoint into a tool for discovering which
       licences and numbers are registered. */
    const generic = { ok: true, sent: true,
      ar: "إذا كان رقم الإجازة والموبايل مسجّلين عدنا، راح يوصلك رمز." };
    if (!rec || expired(rec)) return json(200, generic);

    const code = otpFor(phone);
    /* No SMS provider is configured yet, so the code is not actually
       delivered. It is returned ONLY when QAREEB_DEV_ECHO_OTP is explicitly
       set, which must never be set in production — and the response says so
       out loud rather than looking like a normal success. */
    if (process.env.QAREEB_DEV_ECHO_OTP === "1") {
      return json(200, { ...generic, devCode: code,
        warning: "QAREEB_DEV_ECHO_OTP is on — this must be off in production." });
    }
    return json(200, { ...generic, delivery: "NO_SMS_PROVIDER_CONFIGURED" });
  }

  /* ---------- step 2: verify and issue a session ---------- */
  if (body.action === "verify") {
    if (!rateLimit("ver:" + ip + ":" + licence, 6, 10 * 60 * 1000)) {
      return json(429, { error: "TOO_MANY", ar: "محاولات كثيرة. جرّب بعد شوية." });
    }
    const rec = findLicence(licence, phone);
    if (!rec || expired(rec)) {
      /* One message for "not on the list" and "code wrong": distinguishing
         them tells an attacker which half to keep working on. */
      return json(401, { error: "REJECTED", ar: "التحقق ما نجح. راجع الرقم والرمز." });
    }
    if (!otpValid(phone, body.code)) {
      return json(401, { error: "REJECTED", ar: "التحقق ما نجح. راجع الرقم والرمز." });
    }

    const role = body.role === "PHARMACY_STAFF" ? "PHARMACY_STAFF" : "VERIFIED_PHARMACIST";
    const token = sign({
      role, pharmacyId: rec.pharmacyId, pharmacistId: "ph-" + licence,
      licence, licenseStatus: "VERIFIED",
    });
    return json(200, { ok: true, token, role, pharmacyId: rec.pharmacyId,
      pharmacistId: "ph-" + licence, licenseStatus: "VERIFIED",
      pharmacistName: rec.pharmacistName || null });
  }

  /* ---------- session introspection ---------- */
  if (body.action === "session") {
    const claims = verify(body.token);
    if (!claims) return json(401, { error: "INVALID_SESSION" });
    return json(200, { ok: true, ...claims });
  }

  return json(400, { error: "UNKNOWN_ACTION" });
};

export const config = { path: "/api/auth" };
