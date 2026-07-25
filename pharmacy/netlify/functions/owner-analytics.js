/* ============================================================
   Owner Mode — تحليلات موسّعة (تبويب التحليلات)
   GET /.netlify/functions/owner-analytics
   يتطلب Authorization: Bearer <token>

   يقرأ الأحداث المجهولة المخزّنة في Netlify Blobs (owner-data →
   consult-events) ويلخّصها في صورة شاملة:
     • قمع الكتالوج: مشاهدات منتجات ← إضافة للسلة ← طلبات واتساب
     • قمع المستشار: بدء ← نتائج ← تحويل لواتساب
     • أكثر المنتجات مشاهدةً وطلباً، أكثر كلمات البحث والأهداف
     • نشاط زمني: اليوم / آخر 7 أيام / آخر 30 يوماً + زوّار مقدّرون
   كل البيانات مجهولة تماماً (لا اسم/هاتف/مدينة).
   ============================================================ */
const { verifyToken } = require("./owner-auth.js");

function requireAuth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

function top(counter, n = 6) {
  return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
}

function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: "غير مخوَّل" }) };

  try {
    const { getStore, connectLambda } = await import("@netlify/blobs");
    if (connectLambda) connectLambda(event);
    const s = getStore({ name: "owner-data" });
    const rows = (await s.get("consult-events", { type: "json" }).catch(() => null)) || [];

    const now = Date.now();
    const DAY = 86400000;
    const t0 = new Date().setHours(0, 0, 0, 0); // بداية اليوم

    // عدّادات الكتالوج والمستشار
    let views = 0, addToCart = 0, orders = 0, searches = 0;
    let advStart = 0, advResults = 0, advClicks = 0, advWa = 0;
    // نشاط زمني
    let today = 0, last7 = 0, last30 = 0;
    // تجميعات
    const viewed = {}, ordered = {}, terms = {}, goals = {}, nutrients = {}, advProducts = {};
    const sessions = new Set(), sessions7 = new Set();

    for (const r of rows) {
      const p = r.payload || {};
      const ts = r.created_at ? Date.parse(r.created_at) : NaN;
      if (Number.isFinite(ts)) {
        if (ts >= t0) today++;
        if (now - ts <= 7 * DAY) { last7++; if (r.session_id) sessions7.add(r.session_id); }
        if (now - ts <= 30 * DAY) last30++;
      }
      if (r.session_id) sessions.add(r.session_id);

      switch (r.event_type) {
        case "product_view": views++; if (p.product) viewed[p.product] = (viewed[p.product] || 0) + 1; break;
        case "add_to_cart": addToCart++; break;
        case "order_whatsapp": orders++; break;
        case "order_product": if (p.product) ordered[p.product] = (ordered[p.product] || 0) + 1; break;
        case "search": searches++; if (p.q) terms[p.q] = (terms[p.q] || 0) + 1; break;
        case "advisor_start": advStart++; break;
        case "advisor_results":
          advResults++;
          for (const g of p.goals || []) goals[g] = (goals[g] || 0) + 1;
          for (const n of p.nutrients || []) nutrients[n] = (nutrients[n] || 0) + 1;
          break;
        case "advisor_product_click": advClicks++; if (p.product) advProducts[p.product] = (advProducts[p.product] || 0) + 1; break;
        case "advisor_to_whatsapp": advWa++; break;
      }
    }

    // دمج مشاهدات + ضغطات المستشار في "أكثر المنتجات اهتماماً"
    const interest = { ...viewed };
    for (const [k, v] of Object.entries(advProducts)) interest[k] = (interest[k] || 0) + v;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configured: true,
        totalEvents: rows.length,
        visitors: sessions.size,
        visitors7: sessions7.size,
        activity: { today, last7, last30 },
        // قمع الكتالوج
        catalog: {
          views, addToCart, orders,
          viewToCart: pct(addToCart, views),
          cartToOrder: pct(orders, addToCart),
          viewToOrder: pct(orders, views),
        },
        searches,
        // قمع المستشار
        advisor: {
          starts: advStart, results: advResults, clicks: advClicks, toWa: advWa,
          conversion: pct(advWa, advResults),
        },
        // قوائم أعلى
        topInterest: top(interest),
        topOrdered: top(ordered),
        topSearches: top(terms),
        topGoals: top(goals),
        // توافق مع الحقول القديمة
        topProducts: top(interest),
      }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "فشل القراءة", detail: String(e.message || e) }) };
  }
}

module.exports = { handler };
