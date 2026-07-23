/* ============================================================
   Owner Mode — تراكب حي فوق كتالوج products.js
   التخزين: Netlify Blobs (مدمج في Netlify — بلا إعدادات ولا مفاتيح)

   GET  /.netlify/functions/owner-overrides
        عام (بلا مصادقة) — يرجع كل التعديلات الحالية ليدمجها كل
        زائر مع الكتالوج الأساسي عند التحميل.

   POST /.netlify/functions/owner-overrides
        يتطلب Authorization: Bearer <token> (من owner-auth)
        body: { kind: "product", id, patch } — تحديث/مسح حقول منتج
             | { kind: "product", id, reset: true } — إلغاء كل التعديلات لمنتج
             | { kind: "setting", key, value } — تحديث إعداد عام
   ============================================================ */
const { verifyToken } = require("./owner-auth.js");

const KEY = "overrides";

async function store() {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "owner-data", consistency: "strong" });
}

async function readAll(s) {
  const data = await s.get(KEY, { type: "json" }).catch(() => null);
  return data && typeof data === "object"
    ? { products: data.products || {}, settings: data.settings || {} }
    : { products: {}, settings: {} };
}

function requireAuth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

function sanitizePatch(patch) {
  const p = {};
  if ("price" in patch) p.price = patch.price === null ? null : Number(patch.price);
  if ("discountPrice" in patch) p.discountPrice = patch.discountPrice === null ? null : Number(patch.discountPrice);
  if ("description" in patch) p.description = String(patch.description).slice(0, 2000);
  if ("summary" in patch) p.summary = String(patch.summary).slice(0, 400);
  if ("img" in patch) p.img = String(patch.img).slice(0, 500);
  if ("available" in patch) p.available = !!patch.available;
  if ("featured" in patch) p.featured = !!patch.featured;
  if ("name" in patch) p.name = String(patch.name).slice(0, 200);
  if ("brand" in patch) p.brand = String(patch.brand).slice(0, 120);
  if ("category" in patch) p.category = String(patch.category).slice(0, 40);
  if ("deleted" in patch) p.deleted = !!patch.deleted;
  return p;
}

async function handleGet() {
  try {
    const s = await store();
    const data = await readAll(s);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  } catch {
    // فشل صامت — الموقع يستمر بالكتالوج الأساسي
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: {}, settings: {} }) };
  }
}

async function handlePost(event) {
  if (!requireAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: "غير مخوَّل — سجّل الدخول مجدداً" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  try {
    const s = await store();
    const data = await readAll(s);

    if (body.kind === "product") {
      const id = String(body.id || "").slice(0, 60);
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: "id مفقود" }) };

      if (body.reset) {
        delete data.products[id];
      } else {
        const p = sanitizePatch(body.patch || {});
        if (!Object.keys(p).length) return { statusCode: 400, body: JSON.stringify({ error: "لا حقول للتحديث" }) };
        data.products[id] = { ...(data.products[id] || {}), ...p };
      }
      await s.setJSON(KEY, data);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (body.kind === "setting") {
      const key = String(body.key || "").slice(0, 60);
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "key مفقود" }) };
      data.settings[key] = String(body.value ?? "").slice(0, 500);
      await s.setJSON(KEY, data);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "kind غير معروف" }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "فشل الحفظ", detail: String(e.message || e) }) };
  }
}

async function handler(event) {
  if (event.httpMethod === "GET") return handleGet();
  if (event.httpMethod === "POST") return handlePost(event);
  return { statusCode: 405, body: "Method Not Allowed" };
}

module.exports = { handler };
