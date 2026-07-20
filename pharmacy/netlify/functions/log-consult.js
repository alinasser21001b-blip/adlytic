/* ============================================================
   Learning Analytics — نقطة تجميع مجهولة (بلا AI، بلا هوية)
   POST /.netlify/functions/log-consult

   تستقبل أحداث الاستشارة المجهولة وتخزّنها في Supabase.
   لا تُخزَّن أي بيانات شخصية (اسم/هاتف/مدينة/نص حر) — المدخلات
   من المحرك فقط: الهدف، الأعراض، المغذّيات المقترحة، الضغطات.

   الإعداد (مرة واحدة):
   1) أنشئ مشروع Supabase مجاني ونفّذ SQL في netlify/functions/schema.sql
   2) في Netlify → Site settings → Environment variables أضف:
        SUPABASE_URL          = https://xxxx.supabase.co
        SUPABASE_SERVICE_KEY  = <service_role key>
   الدالة تعمل بدونها بصمت (تُرجع 204) كي لا تتعطّل الواجهة إطلاقاً.
   ============================================================ */

const ALLOWED_TYPES = new Set([
  "advisor_start", "advisor_answer", "advisor_results",
  "advisor_product_click", "advisor_to_whatsapp",
]);

// حقول مسموح بها فقط — أي حقل آخر يُتجاهل (حماية الخصوصية)
function sanitize(body) {
  const out = { session_id: null, type: null, payload: {} };
  if (typeof body.sessionId === "string") out.session_id = body.sessionId.slice(0, 40);
  if (ALLOWED_TYPES.has(body.type)) out.type = body.type;
  const p = {};
  if (Array.isArray(body.goals)) p.goals = body.goals.slice(0, 8).map(String);
  if (Array.isArray(body.nutrients)) p.nutrients = body.nutrients.slice(0, 8).map(String);
  if (Array.isArray(body.opts)) p.opts = body.opts.slice(0, 8).map(String);
  if (typeof body.q === "string") p.q = body.q.slice(0, 40);
  if (typeof body.product === "string") p.product = body.product.slice(0, 60);
  if (typeof body.questions === "number") p.questions = body.questions;
  if (typeof body.topConfidence === "number") p.topConfidence = body.topConfidence;
  out.payload = p;
  return out;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  const row = sanitize(body);
  if (!row.type || !row.session_id) return { statusCode: 204, body: "" };

  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  // بدون إعداد التخزين: لا نُفشل الطلب — التحليلات اختيارية
  if (!URL || !KEY) return { statusCode: 204, body: "" };

  try {
    const res = await fetch(`${URL}/rest/v1/consult_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        session_id: row.session_id,
        event_type: row.type,
        payload: row.payload,
      }),
    });
    if (!res.ok) return { statusCode: 502, body: "store error" };
    return { statusCode: 204, body: "" };
  } catch (e) {
    return { statusCode: 502, body: "network error" };
  }
}
