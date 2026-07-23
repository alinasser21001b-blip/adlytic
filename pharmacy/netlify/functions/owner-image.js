/* ============================================================
   عرض صور المنتجات المرفوعة (من Netlify Blobs)
   GET /.netlify/functions/owner-image?id=<key>
   عام — الصور تُعرض لكل الزوار في الكتالوج.
   ============================================================ */
async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
  const id = String((event.queryStringParameters || {}).id || "");
  if (!id || id.includes("/") || id.includes("..")) return { statusCode: 400, body: "Bad id" };

  try {
    const { getStore } = await import("@netlify/blobs");
    const s = getStore({ name: "product-images", consistency: "strong" });
    const res = await s.getWithMetadata(id, { type: "arrayBuffer" });
    if (!res || !res.data) return { statusCode: 404, body: "Not found" };
    const contentType = (res.metadata && res.metadata.contentType) || "image/jpeg";
    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: Buffer.from(res.data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 502, body: "Image fetch failed" };
  }
}

module.exports = { handler };
