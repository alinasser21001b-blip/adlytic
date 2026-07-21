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

function effectivePrice(p) {
  return p?.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p?.price || 0;
}

function fmtPrice(p) {
  const v = effectivePrice(p);
  return v ? `${Number(v).toLocaleString("en-US")} د.ع` : "";
}

/* سعر مع شطب السعر الأصلي عند وجود خصم فعّال */
function priceHtml(p) {
  if (!p.price) return "💬 اسأل عن السعر والتوفر";
  const hasDiscount = p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price;
  if (!hasDiscount) return `💰 ${fmtPrice(p)}`;
  return `<span class="price-old">${Number(p.price).toLocaleString("en-US")} د.ع</span> 🏷️ ${fmtPrice(p)}`;
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

/* ============================================================
   السلة (طلب متعدد المنتجات)
   ============================================================ */
const CART_KEY = "dur_v2_cart";
const getCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (_) { return []; } };
function saveCart(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (_) {} updateCartBadge(); }
const cartCount = () => getCart().reduce((n, r) => n + r.qty, 0);

function addToCart(id, qty = 1) {
  const cart = getCart();
  const row = cart.find((r) => r.id === id);
  if (row) row.qty = Math.min(20, row.qty + qty);
  else cart.push({ id, qty: Math.min(20, Math.max(1, qty)) });
  saveCart(cart);
  toast("أُضيف إلى السلة 🛒");
  openCart();
}
function setQty(id, qty) {
  const cart = getCart();
  const r = cart.find((x) => x.id === id);
  if (!r) return;
  r.qty = Math.max(1, Math.min(20, qty));
  saveCart(cart);
  renderCart();
}
function removeFromCart(id) { saveCart(getCart().filter((r) => r.id !== id)); renderCart(); }

function updateCartBadge() {
  const n = cartCount();
  document.querySelectorAll(".cart-badge").forEach((b) => {
    b.textContent = n; b.style.display = n ? "flex" : "none";
    if (n) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
  });
}

function ensureCart() {
  if (document.getElementById("cart-overlay")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="drawer-overlay" id="cart-overlay" onclick="if(event.target===this)closeCart()">
    <aside class="cart-drawer" role="dialog" aria-modal="true" aria-label="سلة الطلبات">
      <div class="cart-head">
        <h3>🛒 سلة الطلبات</h3>
        <button class="dialog-close" onclick="closeCart()" aria-label="إغلاق">✕</button>
      </div>
      <div class="cart-body" id="cart-body"></div>
      <div class="cart-foot" id="cart-foot"></div>
    </aside>
  </div>`;
  document.body.append(wrap.firstElementChild);
}

function openCart() { ensureCart(); renderCart(); document.getElementById("cart-overlay").classList.add("open"); document.body.style.overflow = "hidden"; }
function closeCart() { document.getElementById("cart-overlay")?.classList.remove("open"); document.body.style.overflow = ""; }

function renderCart() {
  const body = document.getElementById("cart-body");
  const foot = document.getElementById("cart-foot");
  if (!body) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><div class="big">🛒</div><p>سلتك فارغة</p><button class="btn-outline" onclick="closeCart()">تصفّح المنتجات</button></div>`;
    foot.innerHTML = "";
    return;
  }
  body.innerHTML = cart.map((row) => {
    const p = byId(row.id); if (!p) return "";
    return `<div class="cart-item">
      <span class="ci-thumb">${thumbHtml(p)}</span>
      <div class="ci-info">
        <b>${p.name}</b>
        <small>${p.brand}${p.price ? ` · ${fmtPrice(p)}` : ""}</small>
        <div class="qty-stepper">
          <button onclick="setQty('${p.id}', ${row.qty - 1})" aria-label="إنقاص">−</button>
          <span>${row.qty}</span>
          <button onclick="setQty('${p.id}', ${row.qty + 1})" aria-label="زيادة">+</button>
        </div>
      </div>
      <button class="ci-remove" onclick="removeFromCart('${p.id}')" aria-label="حذف">🗑️</button>
    </div>`;
  }).join("");
  const allPriced = cart.every((r) => byId(r.id)?.price);
  const total = cart.reduce((s, r) => s + effectivePrice(byId(r.id) || {}) * r.qty, 0);
  foot.innerHTML = `
    <div class="cart-total"><span>${cartCount()} قطعة</span><span>${allPriced && total ? `الإجمالي: ${total.toLocaleString("en-US")} د.ع` : "السعر يُؤكَّد عبر واتساب"}</span></div>
    <button class="btn-wa" onclick="openCheckout()">🟢 إتمام الطلب عبر واتساب</button>`;
}

/* ---------- إتمام الطلب (Checkout) ---------- */
function genOrderId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `DS-${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${rnd}`;
}

function buildCartMessage(cart, form) {
  const items = cart.map((r, i) => {
    const p = byId(r.id);
    const pr = p.price ? ` — ${fmtPrice(p)}` : "";
    return `${i + 1}) ${p.name} — الكمية: ${r.qty}${pr}`;
  }).join("\n");
  const totalKnown = cart.reduce((s, r) => s + effectivePrice(byId(r.id) || {}) * r.qty, 0);
  const allPriced = cart.every((r) => byId(r.id)?.price);
  const lines = [
    `🟢 طلب جديد — ${STORE_CONFIG.name}`,
    `رقم الطلب: ${form.orderId}`,
    "",
    "📦 المنتجات:",
    items,
    ...(allPriced && totalKnown ? [`💰 الإجمالي التقريبي: ${totalKnown.toLocaleString("en-US")} د.ع`] : []),
    "",
    `👤 العميل: ${form.name}`,
  ];
  if (form.phone) lines.push(`📱 الهاتف: ${form.phone}`);
  lines.push(`📍 المنطقة: ${form.city}`);
  lines.push(`🚚 الاستلام: ${form.pickup}`);
  if (form.notes) lines.push(`💬 ملاحظات: ${form.notes}`);
  lines.push("", "يرجى تأكيد التوفر والسعر النهائي ووقت التوصيل. شكراً لكم 🙏");
  return lines.join("\n");
}

function openCheckout() {
  if (!getCart().length) { toast("سلتك فارغة"); return; }
  ensureCart();
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "{}"); } catch (_) {}
  document.getElementById("cart-body").innerHTML = `
    <div class="checkout">
      <div class="field" id="co-name-f">
        <label>الاسم الكامل</label>
        <input type="text" id="co-name" value="${saved.name || ""}" placeholder="مثال: أحمد علي" />
        <div class="err">نحتاج اسمك لتجهيز الطلب</div>
      </div>
      <div class="field" id="co-phone-f">
        <label>رقم الهاتف</label>
        <input type="tel" id="co-phone" dir="ltr" style="text-align:right" value="${saved.phone || ""}" placeholder="07xxxxxxxxx" inputmode="numeric" />
        <div class="err">أدخل رقم هاتف عراقي صحيح يبدأ بـ 07</div>
      </div>
      <div class="field" id="co-city-f">
        <label>المنطقة / الحي</label>
        <input type="text" id="co-city" value="${saved.city || ""}" placeholder="مثال: بغداد — الكرادة" />
        <div class="err">نحتاج منطقتك لترتيب الاستلام</div>
      </div>
      <div class="field">
        <label>طريقة الاستلام</label>
        <div class="seg">
          <label class="seg-opt"><input type="radio" name="pickup" value="توصيل" checked> 🚚 توصيل</label>
          <label class="seg-opt"><input type="radio" name="pickup" value="استلام من الصيدلية"> 🏪 استلام من الصيدلية</label>
        </div>
      </div>
      <div class="field">
        <label>ملاحظات <span class="opt">(اختياري)</span></label>
        <textarea id="co-notes" placeholder="وقت مناسب، بديل إن لم يتوفر…"></textarea>
      </div>
    </div>`;
  document.getElementById("cart-foot").innerHTML = `
    <button class="btn-outline" onclick="renderCart()">→ رجوع للسلة</button>
    <button class="btn-wa" onclick="submitCheckout()">🟢 إرسال عبر واتساب</button>`;
}

function submitCheckout() {
  const name = document.getElementById("co-name").value.trim();
  const phone = document.getElementById("co-phone").value.trim();
  const city = document.getElementById("co-city").value.trim();
  const notes = document.getElementById("co-notes").value.trim();
  const pickup = (document.querySelector('input[name="pickup"]:checked') || {}).value || "توصيل";

  const phoneOk = /^07\d{8,9}$/.test(phone.replace(/\s/g, ""));
  document.getElementById("co-name-f").classList.toggle("invalid", !name);
  document.getElementById("co-city-f").classList.toggle("invalid", !city);
  document.getElementById("co-phone-f").classList.toggle("invalid", !phoneOk);
  if (!name || !city || !phoneOk) return;

  try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, phone, city })); } catch (_) {}
  const cart = getCart();
  const orderId = genOrderId();
  const msg = buildCartMessage(cart, { name, phone, city, notes, pickup, orderId });
  try { localStorage.setItem("dur_v2_lastorder", JSON.stringify({ orderId, cart, at: Date.now() })); } catch (_) {}
  closeCart();
  toast("جارٍ فتح واتساب… 💬");
  const w = window.open(waLink(msg), "_blank", "noopener");
  if (!w) { navigator.clipboard?.writeText(msg); toast("تم نسخ الطلب — الصقه في واتساب"); }
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
/* نظام الصور متعدد المصادر بالأولوية:
   1) ملف محلي مرفوع باسم معرّف المنتج (png ثم jpg ثم webp) — يتغلب دائماً
   2) رابط الصورة الرسمية البعيد (حقل img في المنتج)
   3) الرمز التعبيري بديلاً أخيراً — لا شيء ينكسر أبداً */
const IMG_EXTS = ["png", "jpg", "webp"];

function imgSources(p) {
  const list = IMG_EXTS.map((e) => `images/${p.id}.${e}`);
  if (p.img) list.push(p.img);
  return list;
}

function thumbHtml(p, cls = "") {
  return `<img src="${imgSources(p)[0]}" alt="${p.name}" loading="lazy" class="prod-img ${cls}"
    data-id="${p.id}" data-cls="${cls}"
    data-i="0" onerror="imgFallbackStep(this)" referrerpolicy="no-referrer" />`;
}

/* بديل أنيق بهوية الصيدلية بدل الرمز البدائي */
function placeholderMarkup(p, cls = "") {
  const letter = (p.en || p.name || "؟").trim().charAt(0).toUpperCase();
  return `<span class="prod-ph ${cls}" role="img" aria-label="${p.name}">
    <span class="ph-leaf">🌿</span>
    <span class="ph-letter">${letter}</span>
    <span class="ph-ribbon">الصورة قريباً</span>
  </span>`;
}

function imgFallbackStep(el) {
  const p = byId(el.dataset.id);
  const sources = p ? imgSources(p) : [];
  const next = +el.dataset.i + 1;
  if (next < sources.length) {
    el.dataset.i = next;
    el.src = sources[next];
  } else if (p) {
    const wrap = document.createElement("span");
    wrap.innerHTML = placeholderMarkup(p, el.dataset.cls || "");
    el.replaceWith(wrap.firstElementChild);
  }
}

function productCard(p) {
  const fav = getFavs().includes(p.id) ? "❤️" : "🤍";
  const oos = p.available === false;
  return `
  <article class="card reveal ${oos ? "is-oos" : ""}" data-id="${p.id}">
    ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
    <div class="quick-actions">
      <button class="icon-btn owner-edit-btn" onclick="event.preventDefault();Owner.editProduct('${p.id}')" title="تعديل (المالك)" aria-label="تعديل المنتج">✏️</button>
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
      ${oos ? `<span class="oos-badge">غير متوفر حالياً</span>` : ""}
      <p class="sum">${p.summary}</p>
      <span class="price-note">${priceHtml(p)}</span>
      <button class="wa-order" ${oos ? "disabled" : ""} onclick="addToCart('${p.id}')">${oos ? "⏳ غير متوفر" : "🛒 أضف للسلة"}</button>
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
    <div style="color:var(--green);font-weight:800;margin:2px 0 6px">${priceHtml(p)}</div>
    <p class="sum">${p.summary}</p>
    <ul>${p.benefits.slice(0, 3).map((b) => `<li>${b}</li>`).join("")}</ul>
    <div class="qv-actions">
      <a class="btn-outline" href="product.html?id=${p.id}">التفاصيل الكاملة</a>
      <button class="btn-wa" onclick="closeQuickView();addToCart('${p.id}')">🛒 أضف للسلة</button>
    </div>`;
  document.getElementById("qv-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeQuickView() {
  document.getElementById("qv-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* إغلاق النوافذ بمفتاح Escape + تظليل الترويسة عند التمرير */
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeOrderDialog(); closeQuickView(); closeCart(); } });
window.addEventListener("scroll", () => {
  document.querySelector(".site-header")?.classList.toggle("scrolled", scrollY > 8);
}, { passive: true });

updateCartBadge();
