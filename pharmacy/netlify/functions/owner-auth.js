/* ============================================================
   Owner Mode — تسجيل الدخول بـ PIN
   POST /.netlify/functions/owner-auth   body: { pin: "1234" }

   لا قاعدة بيانات جلسات: نُصدر توكن موقّع ذاتياً (HMAC-SHA256)
   يحمل وقت انتهاء الصلاحية. أي طلب كتابة لاحق (owner-overrides)
   يتحقق من التوقيع ووقت الانتهاء دون الحاجة لتخزين حالة.

   الإعداد (مرة واحدة، Netlify → Site settings → Environment variables):
     OWNER_PIN     = رقم سرّي يختاره صاحب الصيدلية (مثال: 7391)
     OWNER_SECRET  = نص عشوائي طويل لتوقيع التوكن (اختياري، وإلا يُستخدم OWNER_PIN)
   بدون OWNER_PIN: كل محاولة دخول تُرفض (فشل آمن — لا "PIN افتراضي").
   ============================================================ */
import crypto from "node:crypto";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 ساعات

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // مقارنة بطول ثابت حتى مع اختلاف الطول (تجنّب تسريب الطول عبر التوقيت)
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function signToken(exp) {
  const secret = process.env.OWNER_SECRET || process.env.OWNER_PIN || "";
  const mac = crypto.createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${mac}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = signToken(exp).split(".")[1];
  return timingSafeEqual(mac, expected);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const PIN = process.env.OWNER_PIN;
  if (!PIN) {
    return { statusCode: 403, body: JSON.stringify({ error: "الإعداد غير مكتمل — لم يُضبط OWNER_PIN" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  const pin = String(body.pin || "");
  if (!pin || !timingSafeEqual(pin, PIN)) {
    // تأخير بسيط يعيق التخمين الآلي السريع
    await new Promise((r) => setTimeout(r, 400));
    return { statusCode: 401, body: JSON.stringify({ error: "رمز غير صحيح" }) };
  }

  const exp = Date.now() + TTL_MS;
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: signToken(exp), expiresAt: exp }),
  };
}
