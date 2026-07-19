/* ============================================================
   صيدلية در الشارقة — منطق التطبيق المشترك
   محرك الطلب عبر واتساب، نافذة الطلب، العرض السريع،
   المفضلة، سجل التصفح، حركات الظهور
   ============================================================ */

const byId = (id) => PRODUCTS.find((p) => p.id === id);
const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || "";
const catIcon = (id) => (CATEGORIES.find((c) => c.id === id) || {}).icon || "🛍️";

const productUrl = (id) => {
  const base = location.href.split("/").slice(0, -1).join("/");
  return `${base}/product.html?id=${encodeURIComponent(id)}`;
};

/* ---------- محرك رسائل واتساب ---------- */
function buildOrderMessage(product, form) {
  const lines = [
    `مرحباً ${STORE_CONFIG.name} 🌿`,
    "أرغب بطلب المنتج التالي:",
    "",
    `🛍️ المنتج: ${product.name}`,
  ];
  if (form?.name) lines.push(`👤 الاسم: ${form.name}`);
  if (form?.phone) lines.push(`📞 الهاتف: ${form.phone}`);
  if (form?.city) lines.push(`📍 المدينة: ${form.city}`);
  if (form?.notes) lines.push(`📝 ملاحظات: ${form.notes}`);
  lines.push("", `🔗 رابط المنتج: ${form?.url || productUrl(product.id)}`);
  lines.push("", "يرجى إعلامي بالتوفر والسعر. شكراً لكم 🙏");
  return lines.join("\n");
}

function waLink(message) {
  return `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function waGeneralLink() {
  return waLink(`مرحباً ${STORE_CONFIG.name} 🌿\nلدي استفسار عن منتجاتكم.`);
}

/* ---------- المفضلة (localStorage) ---------- */
const FAV_KEY = "dur_favs";
const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
function toggleFav(id) {
  const favs = getFavs();
  const i = favs.indexOf(id);
  i === -1 ? favs.push(id) : favs.splice(i, 1);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => {
    b.textContent = favs.includes(id) ? "❤️" : "🤍";
  });
  toast(favs.includes(id) ? "أُضيف إلى المفضلة" : "أُزيل من المفضلة");
}

/* ---------- سجل التصفح ---------- */
const VIEW_KEY = "dur_viewed";
const getViewed = () => JSON.parse(localStorage.getItem(VIEW_KEY) || "[]");
function trackView(id) {
  const v = getViewed().filter((x) => x !== id);
  v.unshift(id);
  localStorage.setItem(VIEW_KEY, JSON.stringify(v.slice(0, 12)));
}

/* ---------- عناصر العرض ---------- */
/* نظام الصور التلقائي:
   أي ملف يُرفع إلى images/ باسم معرّف المنتج (مثل kahi-balm.png)
   يظهر فوراً دون تعديل أي كود. التسلسل: img المحدد يدوياً ←
   <id>.png ← <id>.jpg ← <id>.webp ← الرمز التعبيري. */
const IMG_EXTS = ["png", "jpg", "webp"];

function thumbHtml(p, cls = "") {
  const explicit = !!p.img;
  const src = explicit ? p.img : `images/${p.id}.${IMG_EXTS[0]}`;
  return `<img src="${src}" alt="${p.name}" loading="lazy" class="${cls}"
    data-id="${p.id}" data-emoji="${p.emoji || "🛍️"}" data-cls="${cls}"
    data-step="${explicit ? IMG_EXTS.length : 1}" onerror="imgFallbackStep(this)" />`;
}

function imgFallbackStep(el) {
  const step = +el.dataset.step;
  if (step < IMG_EXTS.length) {
    el.dataset.step = step + 1;
    el.src = `images/${el.dataset.id}.${IMG_EXTS[step]}`;
  } else {
    const s = document.createElement("span");
    s.className = ("emoji " + (el.dataset.cls || "")).trim();
    s.textContent = el.dataset.emoji;
    el.replaceWith(s);
  }
}

function productCard(p) {
  const fav = getFavs().includes(p.id) ? "❤️" : "🤍";
  return `
  <article class="card reveal" data-id="${p.id}">
    ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
    <div class="quick-actions">
      <button class="icon-btn" data-fav="${p.id}" onclick="toggleFav('${p.id}')" title="حفظ للمفضلة" aria-label="حفظ للمفضلة">${fav}</button>
      <button class="icon-btn" onclick="openQuickView('${p.id}')" title="عرض سريع" aria-label="عرض سريع">👁️</button>
      <button class="icon-btn" onclick="shareProduct('${p.id}')" title="مشاركة" aria-label="مشاركة">🔗</button>
    </div>
    <a href="product.html?id=${p.id}" aria-label="${p.name}">
      <div class="thumb">${thumbHtml(p)}<span class="brand-tag">${p.brand}</span></div>
    </a>
    <div class="body">
      <span class="cat">${catIcon(p.category)} ${catName(p.category)}</span>
      <a href="product.html?id=${p.id}"><h3>${p.name}</h3></a>
      <p class="sum">${p.summary}</p>
      <span class="price-note">💬 اسأل عن السعر والتوفر</span>
      <button class="wa-order" onclick="openOrderDialog('${p.id}')">🟢 اطلب عبر واتساب</button>
    </div>
  </article>`;
}

function skeletonCard() {
  return `<div class="skeleton"><div class="sk-thumb"></div><div class="sk-line" style="width:70%"></div><div class="sk-line" style="width:45%"></div><div class="sk-line" style="width:88%"></div></div>`;
}

function renderRail(elId, products) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!products.length) { el.closest(".section")?.remove(); return; }
  el.innerHTML = products.map(productCard).join("");
  observeReveals(el);
}

/* ---------- حركات الظهور عند التمرير ---------- */
const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealObserver.unobserve(e.target); } }),
  { threshold: 0.12 }
);
function observeReveals(root = document) {
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => revealObserver.observe(el));
}

/* ---------- عدّادات متحركة ---------- */
function animateCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || "";
    const obs = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      const dur = 1400, t0 = performance.now();
      (function tick(t) {
        const k = Math.min((t - t0) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString("ar-IQ") + suffix;
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    }, { threshold: 0.6 });
    obs.observe(el);
  });
}

/* ---------- Toast والمشاركة ---------- */
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2300);
}

async function shareProduct(id) {
  const p = byId(id);
  const url = productUrl(p.id);
  if (navigator.share) {
    try { await navigator.share({ title: p.name, text: p.summary, url }); return; } catch (_) {}
  }
  await navigator.clipboard.writeText(url);
  toast("تم نسخ رابط المنتج 🔗");
}

/* ============================================================
   نافذة الطلب — تُجمَع بيانات العميل ثم يُفتح واتساب برسالة جاهزة
   ============================================================ */
const CUSTOMER_KEY = "dur_customer"; // نتذكر بيانات العميل لطلباته القادمة

function ensureDialogs() {
  if (document.getElementById("order-overlay")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="overlay" id="order-overlay" onclick="if(event.target===this)closeOrderDialog()">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="نموذج الطلب">
      <div class="dialog-head">
        <h3>🌿 إتمام الطلب</h3>
        <p>خطوة واحدة وتصلك الرسالة جاهزة على واتساب</p>
        <button class="dialog-close" onclick="closeOrderDialog()" aria-label="إغلاق">✕</button>
      </div>
      <div class="dialog-body">
        <div class="order-product" id="order-product"></div>
        <div class="field" id="f-name">
          <label>الاسم الكامل</label>
          <input type="text" id="o-name" placeholder="مثال: علي محمد" autocomplete="name" />
          <div class="err">نحتاج اسمك لنجهّز طلبك</div>
        </div>
        <div class="field">
          <label>رقم الهاتف <span class="opt">(اختياري)</span></label>
          <input type="tel" id="o-phone" placeholder="07xxxxxxxxx" autocomplete="tel" dir="ltr" style="text-align:right" />
        </div>
        <div class="field" id="f-city">
          <label>المحافظة / المدينة</label>
          <input type="text" id="o-city" placeholder="مثال: بغداد — الكرادة" autocomplete="address-level2" />
          <div class="err">نحتاج مدينتك لترتيب التوصيل</div>
        </div>
        <div class="field">
          <label>ملاحظات <span class="opt">(اختياري)</span></label>
          <textarea id="o-notes" placeholder="مثال: أريد عبوتين، أو استفسار عن الاستخدام…"></textarea>
        </div>
        <button class="btn-wa" onclick="submitOrder()">🟢 إرسال الطلب عبر واتساب</button>
        <p class="dialog-note">سيفتح واتساب برسالة جاهزة — يمكنك تعديلها قبل الإرسال</p>
      </div>
    </div>
  </div>
  <div class="overlay" id="qv-overlay" onclick="if(event.target===this)closeQuickView()">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="عرض سريع">
      <div class="dialog-head">
        <h3>👁️ عرض سريع</h3>
        <p>${STORE_CONFIG.name} — ${STORE_CONFIG.tagline}</p>
        <button class="dialog-close" onclick="closeQuickView()" aria-label="إغلاق">✕</button>
      </div>
      <div class="qv-body" id="qv-body"></div>
    </div>
  </div>`;
  document.body.append(...wrap.children);
}

let orderProduct = null;

function openOrderDialog(id) {
  ensureDialogs();
  orderProduct = byId(id);
  document.getElementById("order-product").innerHTML = `
    <span class="op-emoji">${thumbHtml(orderProduct)}</span>
    <div><b>${orderProduct.name}</b><small>${orderProduct.brand} · ${catName(orderProduct.category)}</small></div>`;
  // استرجاع بيانات العميل المحفوظة
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "{}");
    document.getElementById("o-name").value = saved.name || "";
    document.getElementById("o-phone").value = saved.phone || "";
    document.getElementById("o-city").value = saved.city || "";
  } catch (_) {}
  document.getElementById("o-notes").value = "";
  document.getElementById("order-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("o-name").focus(), 350);
}

function closeOrderDialog() {
  document.getElementById("order-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

function submitOrder() {
  const name = document.getElementById("o-name").value.trim();
  const phone = document.getElementById("o-phone").value.trim();
  const city = document.getElementById("o-city").value.trim();
  const notes = document.getElementById("o-notes").value.trim();

  document.getElementById("f-name").classList.toggle("invalid", !name);
  document.getElementById("f-city").classList.toggle("invalid", !city);
  if (!name || !city) return;

  localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, phone, city }));
  const pageUrl = location.pathname.endsWith("product.html") ? location.href : productUrl(orderProduct.id);
  const msg = buildOrderMessage(orderProduct, { name, phone, city, notes, url: pageUrl });
  closeOrderDialog();
  toast("جارٍ فتح واتساب… 💬");
  window.open(waLink(msg), "_blank", "noopener");
}

/* ---------- العرض السريع ---------- */
function openQuickView(id) {
  ensureDialogs();
  const p = byId(id);
  document.getElementById("qv-body").innerHTML = `
    <div class="qv-thumb">${thumbHtml(p)}</div>
    <h4>${p.name}</h4>
    <p class="sum">${p.summary}</p>
    <ul>${p.benefits.slice(0, 3).map((b) => `<li>${b}</li>`).join("")}</ul>
    <div class="qv-actions">
      <a class="btn-outline" href="product.html?id=${p.id}">التفاصيل الكاملة</a>
      <button class="btn-wa" onclick="closeQuickView();openOrderDialog('${p.id}')">🟢 اطلب الآن</button>
    </div>`;
  document.getElementById("qv-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeQuickView() {
  document.getElementById("qv-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* إغلاق النوافذ بمفتاح Escape + تظليل الترويسة عند التمرير */
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeOrderDialog(); closeQuickView(); } });
window.addEventListener("scroll", () => {
  document.querySelector(".site-header")?.classList.toggle("scrolled", scrollY > 8);
}, { passive: true });
