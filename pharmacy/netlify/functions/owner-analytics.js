/* ============================================================
   Owner Mode — تحليلات أساسية (تبويب Analytics)
   GET /.netlify/functions/owner-analytics
   يتطلب Authorization: Bearer <token>

   يقرأ آخر 500 حدث من consult_events (نفس جدول التحليلات المجهولة
   القائم) ويلخّصها: بدء استشارات، نتائج ظهرت، ضغطات منتجات، تحويل
   لواتساب، وأكثر الأهداف والمنتجات طلباً. ملخّص تقريبي (آخر 500
   حدث) لا إحصاء تاريخي كامل — كافٍ لصورة سريعة داخل اللوحة.
   ============================================================ */
import { verifyToken } from "./owner-auth.js";

function requireAuth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

function top(counter, n = 5) {
  return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: "غير مخوَّل" }) };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configured: false }) };
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/consult_events?select=event_type,payload,created_at&order=created_at.desc&limit=500`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error(`supabase GET failed: ${res.status}`);
    const rows = await res.json();

    let starts = 0, results = 0, clicks = 0, toWa = 0;
    const goals = {}, nutrients = {}, products = {};
    for (const r of rows) {
      const p = r.payload || {};
      if (r.event_type === "advisor_start") starts++;
      if (r.event_type === "advisor_results") {
        results++;
        for (const g of p.goals || []) goals[g] = (goals[g] || 0) + 1;
        for (const n of p.nutrients || []) nutrients[n] = (nutrients[n] || 0) + 1;
      }
      if (r.event_type === "advisor_product_click") {
        clicks++;
        if (p.product) products[p.product] = (products[p.product] || 0) + 1;
      }
      if (r.event_type === "advisor_to_whatsapp") toWa++;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configured: true,
        window: rows.length,
        starts, results, clicks, toWa,
        conversion: results ? Math.round((toWa / results) * 100) : 0,
        topGoals: top(goals),
        topNutrients: top(nutrients),
        topProducts: top(products),
      }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "فشل القراءة", detail: String(e.message || e) }) };
  }
}
