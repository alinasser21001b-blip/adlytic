/* ============================================================
   Owner Mode — تراكب حي فوق كتالوج products.js
   GET  /.netlify/functions/owner-overrides
        عام (بلا مصادقة) — يرجع كل التعديلات الحالية ليدمجها كل
        زائر مع الكتالوج الأساسي عند التحميل. هذا ما يجعل تعديل
        المالك يظهر فوراً لكل الزوار دون إعادة نشر الموقع.

   POST /.netlify/functions/owner-overrides
        يتطلب Authorization: Bearer <token> (من owner-auth)
        body: { kind: "product", id, patch } — تحديث/مسح حقول منتج
             | { kind: "product", id, reset: true } — إلغاء كل التعديلات لمنتج
             | { kind: "setting", key, value } — تحديث إعداد عام

   بدون SUPABASE_URL/SUPABASE_SERVICE_KEY: GET يرجع بيانات فارغة
   بصمت (الموقع يعمل بكتالوجه الأساسي)، وPOST يُرفض بوضوح.
   ============================================================ */
const { verifyToken } = require("./owner-auth.js");

const PRODUCT_FIELDS = ["price", "discount_price", "description", "summary", "img", "available", "featured"];

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function sGet(s, table, query = "") {
  const res = await fetch(`${s.url}/rest/v1/${table}?select=*${query}`, {
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
  });
  if (!res.ok) throw new Error(`supabase GET ${table} failed: ${res.status}`);
  return res.json();
}

async function sUpsert(s, table, row, conflictKey) {
  const res = await fetch(`${s.url}/rest/v1/${table}?on_conflict=${conflictKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: s.key,
      Authorization: `Bearer ${s.key}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase UPSERT ${table} failed: ${res.status} ${await res.text()}`);
}

async function sDelete(s, table, id) {
  const res = await fetch(`${s.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`supabase DELETE ${table} failed: ${res.status}`);
}

function requireAuth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

async function handleGet() {
  const s = supa();
  if (!s) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: {}, settings: {} }) };
  }
  try {
    const [prodRows, settingRows] = await Promise.all([
      sGet(s, "product_overrides"),
      sGet(s, "site_settings"),
    ]);
    const products = {};
    for (const r of prodRows) {
      const p = {};
      if (r.price != null) p.price = r.price;
      if (r.discount_price != null) p.discountPrice = r.discount_price;
      if (r.description) p.description = r.description;
      if (r.summary) p.summary = r.summary;
      if (r.img) p.img = r.img;
      if (r.available != null) p.available = r.available;
      if (r.featured != null) p.featured = r.featured;
      products[r.id] = p;
    }
    const settings = {};
    for (const r of settingRows) settings[r.key] = r.value;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products, settings }) };
  } catch (e) {
    // فشل صامت — الموقع يستمر بالكتالوج الأساسي
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: {}, settings: {} }) };
  }
}

async function handlePost(event) {
  if (!requireAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: "غير مخوَّل — سجّل الدخول مجدداً" }) };
  }
  const s = supa();
  if (!s) return { statusCode: 503, body: JSON.stringify({ error: "التخزين غير مُعدّ (SUPABASE_URL/SUPABASE_SERVICE_KEY)" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  try {
    if (body.kind === "product") {
      const id = String(body.id || "").slice(0, 60);
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: "id مفقود" }) };

      if (body.reset) {
        await sDelete(s, "product_overrides", id);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }

      const patch = body.patch || {};
      const row = { id, updated_at: new Date().toISOString() };
      if ("price" in patch) row.price = patch.price === null ? null : Number(patch.price);
      if ("discountPrice" in patch) row.discount_price = patch.discountPrice === null ? null : Number(patch.discountPrice);
      if ("description" in patch) row.description = String(patch.description).slice(0, 2000);
      if ("summary" in patch) row.summary = String(patch.summary).slice(0, 400);
      if ("img" in patch) row.img = String(patch.img).slice(0, 500);
      if ("available" in patch) row.available = !!patch.available;
      if ("featured" in patch) row.featured = !!patch.featured;

      const hasField = PRODUCT_FIELDS.some((f) => (f === "discount_price" ? "discountPrice" in patch : f in patch));
      if (!hasField) return { statusCode: 400, body: JSON.stringify({ error: "لا حقول للتحديث" }) };

      await sUpsert(s, "product_overrides", row, "id");
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (body.kind === "setting") {
      const key = String(body.key || "").slice(0, 60);
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "key مفقود" }) };
      await sUpsert(s, "site_settings", {
        key, value: String(body.value ?? "").slice(0, 500), updated_at: new Date().toISOString(),
      }, "key");
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
