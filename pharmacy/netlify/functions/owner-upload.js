/* ============================================================
   Owner Mode — رفع صورة منتج من جهاز المالك
   التخزين: Netlify Blobs (مدمج — بلا إعدادات ولا مفاتيح)

   POST /.netlify/functions/owner-upload
   يتطلب Authorization: Bearer <token> (من owner-auth)
   body: { dataUrl: "data:image/jpeg;base64,..." }

   تُخزَّن الصورة في باكت blobs باسم product-images ويُعاد رابط
   عرض عبر دالة owner-image. الضغط والتصغير يحدثان في المتصفح
   قبل الإرسال، فالحمولة صغيرة.
   ============================================================ */
const { verifyToken } = require("./owner-auth.js");

const MAX_BYTES = 4.5 * 1024 * 1024; // حد دوال Netlify التزامنية ~6MB — نترك هامشاً

function requireAuth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: "غير مخوَّل — سجّل الدخول مجدداً" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(String(body.dataUrl || ""));
  if (!m) return { statusCode: 400, body: JSON.stringify({ error: "صيغة الصورة غير مدعومة" }) };
  const ext = m[1] === "jpg" ? "jpeg" : m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) {
    return { statusCode: 413, body: JSON.stringify({ error: "الصورة كبيرة جداً — جرّب صورة أصغر" }) };
  }

  try {
    const { getStore } = await import("@netlify/blobs");
    const s = getStore({ name: "product-images", consistency: "strong" });
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await s.set(key, ab, { metadata: { contentType: `image/${ext}` } });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `/.netlify/functions/owner-image?id=${encodeURIComponent(key)}` }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "فشل رفع الصورة", detail: String(e.message || e) }) };
  }
}

module.exports = { handler };
