/* ============================================================
   Owner Mode — رفع صورة منتج من جهاز المالك
   POST /.netlify/functions/owner-upload
   يتطلب Authorization: Bearer <token> (من owner-auth)
   body: { dataUrl: "data:image/jpeg;base64,..." }

   تُرفع الصورة إلى Supabase Storage (باكت عام باسم product-images
   يُنشأ تلقائياً أول مرة) ويُعاد رابط عام جاهز للحفظ في img.
   الضغط والتصغير يحدثان في المتصفح قبل الإرسال، فالحمولة صغيرة.
   ============================================================ */
const { verifyToken } = require("./owner-auth.js");

const BUCKET = "product-images";
const MAX_BYTES = 4.5 * 1024 * 1024; // حد دوال Netlify التزامنية ~6MB — نترك هامشاً

function requireAuth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: "غير مخوَّل — سجّل الدخول مجدداً" }) };

  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!url || !key) {
    return { statusCode: 503, body: JSON.stringify({ error: "التخزين غير مُعدّ (SUPABASE_URL/SUPABASE_SERVICE_KEY)" }) };
  }

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

  const path = `products/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // ترويسة apikey إلزامية مع مفاتيح Supabase الجديدة (sb_secret_...)
  const authHeaders = { apikey: key, Authorization: `Bearer ${key}` };
  const put = () => fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": `image/${ext}`, "x-upsert": "true" },
    body: buffer,
  });

  try {
    let res = await put();
    if (!res.ok) {
      // الباكت غير موجود بعد (أو رفض أول) — ننشئه عاماً ثم نعيد المحاولة مرة واحدة
      await fetch(`${url}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      }).catch(() => {});
      res = await put();
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { statusCode: 502, body: JSON.stringify({ error: "فشل رفع الصورة", detail: `HTTP ${res.status}: ${detail.slice(0, 300)}` }) };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${url}/storage/v1/object/public/${BUCKET}/${path}` }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "فشل رفع الصورة", detail: String(e.message || e) }) };
  }
}

module.exports = { handler };
