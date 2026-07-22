/* ============================================================
   Owner Mode — لوحة إدارة داخل نفس الموقع (بلا تحويل لصفحة أخرى)

   التفعيل: اكتب "owner" في مربّع البحث → نافذة PIN فوق الصفحة
   الحالية → عند النجاح يتحوّل الموقع لوضع المالك (شريط علوي +
   أزرار تعديل تظهر على كل منتج) دون أي redirect أو تبويب جديد.

   البيانات: التعديلات (سعر/خصم/وصف/صورة/توفر/تمييز) تُخزَّن في
   Supabase عبر دوال Netlify (owner-auth / owner-overrides /
   owner-analytics) وتُدمج فوق كتالوج products.js عند كل تحميل —
   فتظهر لكل الزوار فوراً بلا إعادة نشر للموقع.

   الاعتماد: js/products.js ثم js/app.js يجب أن يُحمَّلا قبل هذا
   الملف. تستدعي كل صفحة `await Owner.ready()` قبل أول رسم لها.
   ============================================================ */

const Owner = (() => {
  const FN = "/.netlify/functions";
  const TOKEN_KEY = "dur_owner_token";
  const TRIGGER_WORDS = new Set(["owner", "مالك"]);

  let overrides = { products: {}, settings: {} };
  let readyPromise = null;
  let dashTab = "products";

  /* ---------------- الجلسة ---------------- */
  function getToken() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
      if (!raw || !raw.token || raw.exp < Date.now()) return null;
      return raw.token;
    } catch (_) { return null; }
  }
  function setToken(token, expiresAt) {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: expiresAt }));
  }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }
  function hasSession() { return !!getToken(); }

  async function authedFetch(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error("no-session");
    const res = await fetch(`${FN}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (res.status === 401) { clearToken(); disable(); throw new Error("unauthorized"); }
    return res;
  }

  /* ---------------- تحميل التراكبات + الدمج ---------------- */
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((res) => setTimeout(() => res(null), ms))]);
  }

  async function fetchOverrides() {
    try {
      const res = await withTimeout(fetch(`${FN}/owner-overrides`), 2500);
      if (!res || !res.ok) return { products: {}, settings: {} };
      return await res.json();
    } catch (_) { return { products: {}, settings: {} }; }
  }

  function applyOverrides() {
    for (const [id, ov] of Object.entries(overrides.products || {})) {
      let p = typeof byId === "function" ? byId(id) : null;
      // منتج أضافه المالك (غير موجود في الكتالوج الأساسي) → ننشئه
      if (!p && ov.name && !ov.deleted) {
        p = { id, name: ov.name, brand: ov.brand || "", en: "", category: ov.category || "vitamins", emoji: "🛍️", summary: "", description: "" };
        PRODUCTS.push(p);
      }
      if (!p) continue;
      if ("name" in ov && ov.name) p.name = ov.name;
      if ("brand" in ov && ov.brand) p.brand = ov.brand;
      if ("category" in ov && ov.category) p.category = ov.category;
      if ("price" in ov) p.price = ov.price;
      if ("discountPrice" in ov) p.discountPrice = ov.discountPrice;
      if ("description" in ov) p.description = ov.description;
      if ("summary" in ov) p.summary = ov.summary;
      if ("img" in ov) p.img = ov.img;
      if ("available" in ov) p.available = ov.available;
      if ("featured" in ov) p.badge = ov.featured ? "الأكثر طلباً" : undefined;
    }
    // المنتجات المحذوفة نهائياً تختفي من الكتالوج
    for (const [id, ov] of Object.entries(overrides.products || {})) {
      if (!ov.deleted) continue;
      const i = PRODUCTS.findIndex((p) => p.id === id);
      if (i >= 0) PRODUCTS.splice(i, 1);
    }
    const s = overrides.settings || {};
    if (typeof STORE_CONFIG !== "undefined") {
      if (s.whatsappNumber) STORE_CONFIG.whatsappNumber = s.whatsappNumber;
      if (s.phones) STORE_CONFIG.phones = s.phones.split(",").map((x) => x.trim()).filter(Boolean);
      if (s.tagline) STORE_CONFIG.tagline = s.tagline;
    }
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = fetchOverrides().then((data) => {
      overrides = data || { products: {}, settings: {} };
      applyOverrides();
    });
    return readyPromise;
  }

  /* ---------------- اعتراض كلمة البحث ---------------- */
  function isTrigger(raw) {
    return TRIGGER_WORDS.has(String(raw || "").trim().toLowerCase());
  }

  /* ---------------- نافذة PIN ---------------- */
  function ensurePinModal() {
    if (document.getElementById("owner-pin-overlay")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
    <div class="owner-overlay" id="owner-pin-overlay" onclick="if(event.target===this)Owner.closePinModal()">
      <div class="owner-pin-box" role="dialog" aria-modal="true" aria-label="دخول المالك">
        <h3>🔐 دخول المالك</h3>
        <p>أدخل الرمز السرّي لفتح لوحة الإدارة</p>
        <input type="password" inputmode="numeric" id="owner-pin-input" maxlength="12" placeholder="••••" autocomplete="off" />
        <div class="err" id="owner-pin-err"></div>
        <div class="row">
          <button class="cancel" onclick="Owner.closePinModal()">إلغاء</button>
          <button class="go" id="owner-pin-go" onclick="Owner.submitPin()">دخول</button>
        </div>
      </div>
    </div>`;
    document.body.append(wrap.firstElementChild);
    document.getElementById("owner-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitPin();
    });
  }

  function openPinModal() {
    ensurePinModal();
    document.getElementById("owner-pin-err").textContent = "";
    document.getElementById("owner-pin-input").value = "";
    document.getElementById("owner-pin-overlay").classList.add("open");
    setTimeout(() => document.getElementById("owner-pin-input").focus(), 200);
  }
  function closePinModal() {
    document.getElementById("owner-pin-overlay")?.classList.remove("open");
  }

  async function submitPin() {
    const input = document.getElementById("owner-pin-input");
    const errEl = document.getElementById("owner-pin-err");
    const btn = document.getElementById("owner-pin-go");
    const pin = input.value.trim();
    if (!pin) { errEl.textContent = "أدخل الرمز"; return; }
    btn.disabled = true; btn.textContent = "جارٍ التحقق…";
    try {
      const res = await fetch(`${FN}/owner-auth`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { errEl.textContent = data.error || "رمز غير صحيح"; input.value = ""; input.focus(); return; }
      setToken(data.token, data.expiresAt);
      closePinModal();
      await enable();
    } catch (_) {
      errEl.textContent = "تعذّر الاتصال — تحقّق من الإنترنت";
    } finally {
      btn.disabled = false; btn.textContent = "دخول";
    }
  }

  /* ---------------- شريط المالك ---------------- */
  const TABS = [
    { id: "products", label: "🛍️ منتجاتي" },
    { id: "add", label: "➕ إضافة منتج" },
    { id: "settings", label: "⚙️ الإعدادات" },
    { id: "analytics", label: "📊 التحليلات" },
  ];

  function ensureBar() {
    if (document.getElementById("owner-bar")) return;
    const bar = document.createElement("div");
    bar.id = "owner-bar";
    bar.innerHTML = `
      <span class="ob-badge">👑 وضع المالك</span>
      <div class="ob-tabs">
        ${TABS.map((t) => `<button class="ob-tab" data-tab="${t.id}" onclick="Owner.openDash('${t.id}')">${t.label}</button>`).join("")}
      </div>
      <div class="ob-actions">
        <button onclick="Owner.exitVisual()">خروج مؤقت</button>
        <button onclick="Owner.lock()">🔒 قفل اللوحة</button>
        <button onclick="Owner.logout()">🚪 تسجيل الخروج</button>
      </div>`;
    document.body.prepend(bar);
  }

  function ensureDash() {
    if (document.getElementById("owner-dash")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
    <div class="owner-dash" id="owner-dash" onclick="if(event.target===this)Owner.closeDash()">
      <div class="panel">
        <div class="panel-head">
          <h3 id="owner-dash-title">لوحة الإدارة</h3>
          <button class="close-x" onclick="Owner.closeDash()" aria-label="إغلاق">✕</button>
        </div>
        <div class="panel-body" id="owner-dash-body"></div>
      </div>
    </div>`;
    document.body.append(wrap.firstElementChild);
    // تنبيه بسيط عند تعديل غير محفوظ في شاشة التعديل
    document.getElementById("owner-dash-body").addEventListener("input", (e) => {
      const box = e.target.closest(".owner-edit[data-edit]");
      if (!box) return;
      const status = document.getElementById("oe-status");
      if (status && !status.textContent.startsWith("⏳")) { status.textContent = "● تعديل غير محفوظ — اضغط حفظ"; status.className = "oe-status warn"; }
    });
  }

  async function enable() {
    ensureBar();
    ensureDash();
    document.body.classList.add("owner-mode");
    toast?.("🔓 وضع المالك مُفعّل");
  }

  function disable() {
    document.body.classList.remove("owner-mode");
    closeDash();
  }

  function exitVisual() { disable(); } // يبقي الجلسة صالحة — إعادة كتابة "owner" تعيد الدخول بلا PIN
  function lock() { clearToken(); disable(); toast?.("🔒 قُفلت لوحة المالك"); }
  function logout() { clearToken(); disable(); toast?.("🚪 تم تسجيل الخروج"); location.reload(); }

  /* ---------------- فتح/إغلاق اللوحة ---------------- */
  function openDash(tab) {
    if (!hasSession()) { openPinModal(); return; }
    dashTab = tab || dashTab;
    document.querySelectorAll("#owner-bar .ob-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === dashTab));
    document.getElementById("owner-dash-title").textContent = TABS.find((t) => t.id === dashTab)?.label || "";
    renderDashBody();
    document.getElementById("owner-dash").classList.add("open");
  }
  function closeDash() { document.getElementById("owner-dash")?.classList.remove("open"); }

  function renderDashBody() {
    const body = document.getElementById("owner-dash-body");
    if (dashTab === "products") return renderProductsTab(body);
    if (dashTab === "add") return renderAddTab(body);
    if (dashTab === "settings") return renderSettingsTab(body);
    if (dashTab === "analytics") return renderAnalyticsTab(body);
  }

  /* ---------------- تبويب منتجاتي — قائمة بسيطة: صورة واسم وسعر وزر تعديل ---------------- */
  function fmtPrice(p) {
    if (p.price == null || p.price === "") return "بلا سعر";
    const base = `${Number(p.price).toLocaleString("en")} د.ع`;
    return p.discountPrice ? `<s>${base}</s> ← ${Number(p.discountPrice).toLocaleString("en")} د.ع` : base;
  }

  function simpleRow(p) {
    const searchKey = `${p.name} ${p.brand || ""} ${p.en || ""}`.toLowerCase().replace(/"/g, "&quot;");
    const off = p.available === false;
    return `
    <div class="owner-item${off ? " is-off" : ""}" data-search="${searchKey}" onclick="Owner.editProduct('${p.id}')">
      <span class="or-thumb">${typeof thumbHtml === "function" ? thumbHtml(p) : ""}</span>
      <div class="oi-info">
        <b>${p.name}</b>
        <small>${fmtPrice(p)}${off ? " · 🚫 مخفي عن الزبائن" : ""}${p.badge === "الأكثر طلباً" ? " · ⭐" : ""}</small>
      </div>
      <span class="oi-edit">✏️ تعديل</span>
    </div>`;
  }

  function renderProductsTab(body) {
    body.innerHTML = `
      <p class="owner-hint">اضغط على أي منتج لتعديل سعره أو صورته — التعديل يظهر للزبائن فوراً.</p>
      <div class="owner-search-wrap">
        <span class="owner-search-ic">🔎</span>
        <input type="text" class="owner-search" id="owner-products-search" placeholder="دوّر على منتج بالاسم…" />
      </div>
      <div id="owner-products-list">
        ${PRODUCTS.map(simpleRow).join("")}
      </div>`;
    bindSearchFilter("owner-products-search", "#owner-products-list .owner-item");
  }

  /* ---------------- بحث/تصفية عام داخل أي تبويب ---------------- */
  function bindSearchFilter(inputId, rowSelector) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("input", () => {
      const term = input.value.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll(rowSelector).forEach((row) => {
        const match = !term || (row.dataset.search || "").includes(term);
        row.style.display = match ? "" : "none";
        if (match) visible++;
      });
      let empty = input.closest(".panel-body")?.querySelector(".owner-search-empty");
      if (!visible) {
        if (!empty) {
          empty = document.createElement("p");
          empty.className = "owner-search-empty";
          empty.textContent = "لا نتائج مطابقة للبحث.";
          input.closest(".panel-body")?.append(empty);
        }
      } else {
        empty?.remove();
      }
    });
  }

  /* ---------------- شاشة تعديل منتج واحد — بسيطة وكبيرة ---------------- */
  function editForm(p) {
    const isOwn = p.id.startsWith("own-");
    return `
    <div class="owner-edit" data-edit="${p.id}">
      <button class="oe-back" onclick="Owner.openDash('products')">→ رجوع للقائمة</button>

      <div class="oe-preview">
        ${p.img ? `<img id="oe-img-preview" src="${p.img}" alt="" />` : `<div id="oe-img-preview" class="oe-noimg">🖼️ لا صورة</div>`}
      </div>

      <div class="oe-imgpick">
        <button type="button" class="oe-pick-btn" onclick="this.nextElementSibling.click()">📷 اختر صورة من الجهاز</button>
        <input type="file" accept="image/*" hidden onchange="Owner.uploadImage(this)" />
        <div class="oe-pick-status" data-pick-status></div>
        <details class="oe-more">
          <summary>أو الصق رابط الصورة يدوياً</summary>
          <input type="text" data-f="img" class="oe-url" value="${(p.img || "").replace(/"/g, "&quot;")}" placeholder="رابط الصورة" dir="ltr" />
        </details>
      </div>

      <label class="oe-field">✏️ اسم المنتج
        <input type="text" data-f="name" value="${(p.name || "").replace(/"/g, "&quot;")}" />
      </label>

      <div class="oe-two">
        <label class="oe-field">💰 السعر (د.ع)
          <input type="number" min="0" data-f="price" value="${p.price ?? ""}" placeholder="مثال: 25000" />
        </label>
        <label class="oe-field">🏷️ سعر بعد الخصم
          <input type="number" min="0" data-f="discountPrice" value="${p.discountPrice ?? ""}" placeholder="اتركه فارغاً بلا خصم" />
        </label>
      </div>

      <div class="oe-toggles">
        <label class="oe-toggle"><input type="checkbox" data-f="available" ${p.available === false ? "" : "checked"} /> ✅ متوفر (يظهر للزبائن)</label>
        <label class="oe-toggle"><input type="checkbox" data-f="featured" ${p.badge === "الأكثر طلباً" ? "checked" : ""} /> ⭐ مميّز — الأكثر طلباً</label>
      </div>

      <details class="oe-more">
        <summary>تفاصيل إضافية (اختياري)</summary>
        <label class="oe-field">وصف قصير
          <input type="text" data-f="summary" value="${(p.summary || "").replace(/"/g, "&quot;")}" />
        </label>
        <label class="oe-field">الوصف الكامل
          <textarea data-f="description" rows="4">${p.description || ""}</textarea>
        </label>
      </details>

      <button class="oe-save" onclick="Owner.saveProduct('${p.id}')">💾 حفظ التعديلات</button>
      <div class="oe-status" id="oe-status"></div>

      <div class="oe-danger">
        ${isOwn
          ? `<button class="oe-del" onclick="Owner.deleteForever('${p.id}')">🗑️ حذف المنتج نهائياً</button>`
          : `<button class="oe-reset" onclick="Owner.resetRow('${p.id}')">↩️ استرجاع الأصل</button>`}
      </div>
    </div>`;
  }

  /* ---------------- رفع صورة من الجهاز: تصغير + ضغط ثم رفع لدالة owner-upload ---------------- */
  function downscaleToDataUrl(file, maxSide = 1000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; // خلفية بيضاء بدل الشفافية (JPEG لا يدعمها)
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("bad-image")); };
      img.src = objUrl;
    });
  }

  async function uploadImage(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const box = fileInput.closest(".owner-edit");
    const status = box?.querySelector("[data-pick-status]");
    const setStatus = (t, cls) => { if (status) { status.textContent = t; status.className = "oe-pick-status" + (cls ? " " + cls : ""); } };
    try {
      setStatus("⏳ جارٍ تجهيز الصورة…");
      const dataUrl = await downscaleToDataUrl(file);
      setStatus("⏳ جارٍ رفع الصورة…");
      const res = await authedFetch("/owner-upload", { method: "POST", body: JSON.stringify({ dataUrl }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus("⚠️ " + (d.error || "تعذّر الرفع") + (d.detail ? " — " + d.detail : ""), "err"); return; }
      const urlInput = box.querySelector('[data-f="img"]');
      if (urlInput) {
        urlInput.value = d.url;
        urlInput.dispatchEvent(new Event("input", { bubbles: true })); // يُحدّث المعاينة تلقائياً
      }
      setStatus("✅ تم رفع الصورة — اضغط حفظ لتثبيتها", "ok");
    } catch (_) {
      setStatus("⚠️ تعذّر الرفع — تحقّق من الإنترنت أو جرّب صورة أخرى", "err");
    } finally {
      fileInput.value = "";
    }
  }

  function bindImgPreview() {
    const input = document.querySelector('.owner-edit [data-f="img"]');
    if (!input) return;
    input.addEventListener("input", () => {
      const box = document.getElementById("oe-img-preview");
      const url = input.value.trim();
      if (!box) return;
      if (url) {
        if (box.tagName === "IMG") box.src = url;
        else box.outerHTML = `<img id="oe-img-preview" src="${url}" alt="" />`;
      }
    });
  }

  async function saveProduct(id) {
    const box = document.querySelector(`.owner-edit[data-edit="${id}"]`);
    if (!box) return;
    const g = (f) => box.querySelector(`[data-f="${f}"]`);
    const p = byId(id);
    const patch = {};
    const price = g("price").value;
    patch.price = price === "" ? null : Number(price);
    const dp = g("discountPrice").value;
    patch.discountPrice = dp === "" ? null : Number(dp);
    patch.img = g("img").value.trim();
    patch.summary = g("summary").value;
    patch.description = g("description").value;
    patch.available = g("available").checked;
    patch.featured = g("featured").checked;
    const newName = g("name").value.trim();
    if (newName && newName !== (p?.name || "")) patch.name = newName;

    const status = document.getElementById("oe-status");
    status.textContent = "⏳ جارٍ الحفظ…";
    status.className = "oe-status";
    try {
      const res = await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, patch }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); status.textContent = "⚠️ " + (d.error || "تعذّر الحفظ") + (d.detail ? " — " + d.detail : ""); status.classList.add("err"); return; }
      overrides.products[id] = { ...(overrides.products[id] || {}), ...patch };
      applyOverrides();
      status.textContent = "✅ تم الحفظ — يظهر للزبائن الآن";
      status.classList.add("ok");
      refreshLiveViews(id);
    } catch (_) {
      status.textContent = "⚠️ تعذّر الحفظ — تحقّق من الإنترنت";
      status.classList.add("err");
    }
  }

  async function resetRow(id) {
    if (!confirm("استرجاع القيم الأصلية لهذا المنتج؟ سيُلغى كل تعديل مخزَّن.")) return;
    try {
      await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, reset: true }) });
      delete overrides.products[id];
      toast?.("↩️ رجعنا للقيم الأصلية");
      setTimeout(() => location.reload(), 600);
    } catch (_) { toast?.("⚠️ تعذّر الاسترجاع"); }
  }

  async function deleteForever(id) {
    if (!confirm("حذف هذا المنتج نهائياً من الموقع؟ لا يمكن التراجع.")) return;
    try {
      const res = await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, patch: { deleted: true } }) });
      if (!res.ok) throw new Error("failed");
      const i = PRODUCTS.findIndex((p) => p.id === id);
      if (i >= 0) PRODUCTS.splice(i, 1);
      overrides.products[id] = { ...(overrides.products[id] || {}), deleted: true };
      toast?.("🗑️ حُذف المنتج");
      openDash("products");
    } catch (_) { toast?.("⚠️ تعذّر الحذف"); }
  }

  function refreshLiveViews(id) {
    // إعادة رسم أي بطاقة/صفحة منتج ظاهرة حالياً بالبيانات الجديدة فوراً
    document.querySelectorAll(`.card[data-id="${id}"]`).forEach((card) => {
      const p = byId(id);
      card.outerHTML = productCard(p);
    });
    const params = new URLSearchParams(location.search);
    if (typeof renderProduct === "function" && params.get("id") === id) renderProduct(byId(id));
  }

  /* ---------------- تبويب إضافة منتج جديد — 3 حقول أساسية فقط ---------------- */
  function renderAddTab(body) {
    const cats = typeof CATEGORIES !== "undefined" ? CATEGORIES : [];
    body.innerHTML = `
    <div class="owner-edit">
      <p class="owner-hint">ثلاث خطوات: الاسم، السعر، والصورة — ثم اضغط إضافة. يظهر المنتج للزبائن فوراً.</p>

      <label class="oe-field">✏️ اسم المنتج <span class="req">*</span>
        <input type="text" id="add-name" placeholder="مثال: فيتامين سي 1000" />
      </label>

      <label class="oe-field">💰 السعر (د.ع) <span class="req">*</span>
        <input type="number" min="0" id="add-price" placeholder="مثال: 25000" />
      </label>

      <div class="oe-imgpick">
        <button type="button" class="oe-pick-btn" onclick="this.nextElementSibling.click()">📷 اختر صورة من الجهاز (اختياري)</button>
        <input type="file" accept="image/*" hidden onchange="Owner.uploadImage(this)" />
        <div class="oe-pick-status" data-pick-status></div>
        <details class="oe-more">
          <summary>أو الصق رابط الصورة يدوياً</summary>
          <input type="text" id="add-img" data-f="img" class="oe-url" placeholder="رابط الصورة" dir="ltr" />
        </details>
      </div>

      <label class="oe-field">📂 القسم
        <select id="add-cat">
          ${cats.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("")}
        </select>
      </label>

      <button class="oe-save" onclick="Owner.addProduct()">➕ إضافة المنتج</button>
      <div class="oe-status" id="add-status"></div>
    </div>`;
  }

  async function addProduct() {
    const name = document.getElementById("add-name").value.trim();
    const price = document.getElementById("add-price").value;
    const img = document.getElementById("add-img").value.trim();
    const category = document.getElementById("add-cat").value;
    const status = document.getElementById("add-status");
    status.className = "oe-status";
    if (!name) { status.textContent = "⚠️ اكتب اسم المنتج أولاً"; status.classList.add("err"); return; }
    if (!price) { status.textContent = "⚠️ اكتب السعر"; status.classList.add("err"); return; }

    const id = "own-" + Date.now().toString(36);
    const patch = { name, category, price: Number(price), available: true };
    if (img) patch.img = img;

    status.textContent = "⏳ جارٍ الإضافة…";
    try {
      const res = await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, patch }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); status.textContent = "⚠️ " + (d.error || "تعذّرت الإضافة") + (d.detail ? " — " + d.detail : ""); status.classList.add("err"); return; }
      overrides.products[id] = patch;
      applyOverrides();
      toast?.("✅ أُضيف المنتج — يظهر للزبائن الآن");
      openDash("products");
    } catch (_) {
      status.textContent = "⚠️ تعذّرت الإضافة — تحقّق من الإنترنت";
      status.classList.add("err");
    }
  }

  /* ---------------- تبويب الإعدادات ---------------- */
  function renderSettingsTab(body) {
    body.innerHTML = `
      <div class="owner-settings-form">
        <label>رقم واتساب الطلبات (بصيغة دولية، أرقام فقط)
          <input type="text" id="s-wa" value="${STORE_CONFIG.whatsappNumber || ""}" dir="ltr" />
        </label>
        <label>أرقام الهاتف (مفصولة بفاصلة)
          <input type="text" id="s-phones" value="${(STORE_CONFIG.phones || []).join(", ")}" dir="ltr" />
        </label>
        <label>الشعار الفرعي (tagline)
          <input type="text" id="s-tagline" value="${STORE_CONFIG.tagline || ""}" />
        </label>
        <button onclick="Owner.saveSettings()">💾 حفظ الإعدادات</button>
        <span class="or-saved-flag" id="saved-settings"></span>
      </div>`;
  }

  async function saveSettings() {
    const flag = document.getElementById("saved-settings");
    const entries = [
      ["whatsappNumber", document.getElementById("s-wa").value.trim()],
      ["phones", document.getElementById("s-phones").value.trim()],
      ["tagline", document.getElementById("s-tagline").value.trim()],
    ];
    flag.textContent = "جارٍ الحفظ…";
    try {
      for (const [key, value] of entries) {
        if (!value) continue;
        const res = await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "setting", key, value }) });
        if (!res.ok) throw new Error("save failed");
        overrides.settings[key] = value;
      }
      applyOverrides();
      flag.textContent = "✅ حُفظت الإعدادات — تُطبَّق على كل الصفحات فوراً";
    } catch (_) { flag.textContent = "⚠️ تعذّر الحفظ"; }
  }

  /* ---------------- تبويب التحليلات ---------------- */
  async function renderAnalyticsTab(body) {
    body.innerHTML = `<p style="color:var(--muted)">جارٍ التحميل…</p>`;
    try {
      const res = await authedFetch("/owner-analytics");
      const d = await res.json();
      if (!d.configured) {
        body.innerHTML = `<p style="color:var(--muted)">التحليلات غير مُفعّلة بعد (يحتاج ربط Supabase).</p>`;
        return;
      }
      body.innerHTML = `
        <p style="color:var(--muted);font-size:.8rem;margin-bottom:10px">تقريبية — آخر ${d.window} حدث مسجَّل.</p>
        <div class="owner-stat-grid">
          <div class="owner-stat"><b>${d.starts}</b><span>بدء استشارة</span></div>
          <div class="owner-stat"><b>${d.results}</b><span>نتائج ظهرت</span></div>
          <div class="owner-stat"><b>${d.clicks}</b><span>ضغطات منتجات</span></div>
          <div class="owner-stat"><b>${d.conversion}%</b><span>تحويل لواتساب</span></div>
        </div>
        <h4 style="margin:12px 0 6px">🎯 أكثر الأهداف طلباً</h4>
        <ul class="owner-list-mini">${d.topGoals.map((g) => `<li>${g.key}<span>${g.count}</span></li>`).join("") || "<li>لا بيانات كافية</li>"}</ul>
        <h4 style="margin:12px 0 6px">🛍️ أكثر المنتجات ضغطاً</h4>
        <ul class="owner-list-mini">${d.topProducts.map((g) => `<li>${g.key}<span>${g.count}</span></li>`).join("") || "<li>لا بيانات كافية</li>"}</ul>`;
    } catch (_) {
      body.innerHTML = `<p style="color:#a12b2b">تعذّر تحميل التحليلات.</p>`;
    }
  }

  /* ---------------- تعديل منتج مفرد (من القائمة أو زر ✏️ على البطاقة) ---------------- */
  function editProduct(id) {
    if (!hasSession()) { openPinModal(); return; }
    dashTab = "products";
    ensureDash();
    const p = byId(id);
    document.getElementById("owner-dash-title").textContent = p ? `تعديل: ${p.name}` : "تعديل منتج";
    document.getElementById("owner-dash-body").innerHTML = p ? editForm(p) : "<p>المنتج غير موجود</p>";
    document.getElementById("owner-dash").classList.add("open");
    bindImgPreview();
  }

  /* ---------------- تفعيل تلقائي إن كانت الجلسة قائمة (بعد تنقّل بين الصفحات) ---------------- */
  function autoResume() {
    if (hasSession()) enable();
  }

  return {
    ready, isTrigger, openPinModal, closePinModal, submitPin,
    openDash, closeDash, saveProduct, resetRow, addProduct, deleteForever,
    uploadImage, saveSettings, editProduct, exitVisual, lock, logout, autoResume,
  };
})();
