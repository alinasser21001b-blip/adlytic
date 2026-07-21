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
      const p = typeof byId === "function" ? byId(id) : null;
      if (!p) continue;
      if ("price" in ov) p.price = ov.price;
      if ("discountPrice" in ov) p.discountPrice = ov.discountPrice;
      if ("description" in ov) p.description = ov.description;
      if ("summary" in ov) p.summary = ov.summary;
      if ("img" in ov) p.img = ov.img;
      if ("available" in ov) p.available = ov.available;
      if ("featured" in ov) p.badge = ov.featured ? "الأكثر طلباً" : undefined;
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
    { id: "products", label: "🛍️ المنتجات" },
    { id: "offers", label: "🏷️ العروض" },
    { id: "homepage", label: "🏠 الرئيسية" },
    { id: "media", label: "🖼️ الصور" },
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
          <button class="close-x" onclick="Owner.closeDash()">✕</button>
        </div>
        <div class="panel-body" id="owner-dash-body"></div>
      </div>
    </div>`;
    document.body.append(wrap.firstElementChild);
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
    if (dashTab === "products") return renderProductsTab(body, PRODUCTS);
    if (dashTab === "offers") return renderProductsTab(body, PRODUCTS, true);
    if (dashTab === "homepage") return renderHomepageTab(body);
    if (dashTab === "media") return renderMediaTab(body);
    if (dashTab === "settings") return renderSettingsTab(body);
    if (dashTab === "analytics") return renderAnalyticsTab(body);
  }

  /* ---------------- تبويب المنتجات / العروض ---------------- */
  function fieldRow(p, opts = {}) {
    const { offersOnly } = opts;
    return `
    <div class="owner-row" data-row="${p.id}">
      <span class="or-thumb">${typeof thumbHtml === "function" ? thumbHtml(p) : ""}</span>
      <div class="or-body">
        <b>${p.name}</b>
        <small>${p.brand} — ${p.en || ""}</small>
        <div class="or-fields">
          <label class="f">السعر (د.ع)
            <input type="number" min="0" data-f="price" value="${p.price || ""}" />
          </label>
          <label class="f">سعر الخصم (د.ع)
            <input type="number" min="0" data-f="discountPrice" value="${p.discountPrice || ""}" placeholder="بلا خصم" />
          </label>
          ${!offersOnly ? `
          <label class="f">رابط الصورة
            <input type="text" data-f="img" value="${p.img || ""}" placeholder="images/xxx.webp أو رابط" />
          </label>
          <label class="f" style="grid-column:1/-1">الوصف المختصر (summary)
            <input type="text" data-f="summary" value="${(p.summary || "").replace(/"/g, "&quot;")}" />
          </label>
          <textarea data-f="description" placeholder="الوصف الكامل">${p.description || ""}</textarea>
          ` : ""}
          <div class="or-flags">
            <label><input type="checkbox" data-f="available" ${p.available === false ? "" : "checked"} /> متوفر</label>
            <label><input type="checkbox" data-f="featured" ${p.badge === "الأكثر طلباً" ? "checked" : ""} /> مميّز (الأكثر طلباً)</label>
          </div>
          <div class="or-actions">
            <button class="or-save" onclick="Owner.saveRow('${p.id}')">💾 حفظ</button>
            <button class="or-reset" onclick="Owner.resetRow('${p.id}')">↩️ استرجاع الأصل</button>
            <span class="or-saved-flag" id="saved-${p.id}"></span>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderProductsTab(body, list, offersOnly) {
    const items = offersOnly ? list.filter((p) => p.price) : list;
    body.innerHTML = `
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:10px">
        ${offersOnly ? "عدّل السعر أو أضف سعر خصم — يظهر فوراً على الموقع لكل الزوار." : `${items.length} منتجاً — عدّل أي حقل واضغط حفظ.`}
      </p>
      ${items.map((p) => fieldRow(p, { offersOnly })).join("")}`;
  }

  function readRowPatch(id) {
    const row = document.querySelector(`.owner-row[data-row="${id}"]`);
    if (!row) return null;
    const g = (f) => row.querySelector(`[data-f="${f}"]`);
    const patch = {};
    const price = g("price")?.value;
    if (price !== undefined) patch.price = price === "" ? null : Number(price);
    const dp = g("discountPrice")?.value;
    if (dp !== undefined) patch.discountPrice = dp === "" ? null : Number(dp);
    if (g("img")) patch.img = g("img").value;
    if (g("summary")) patch.summary = g("summary").value;
    if (g("description")) patch.description = g("description").value;
    if (g("available")) patch.available = g("available").checked;
    if (g("featured")) patch.featured = g("featured").checked;
    return patch;
  }

  async function saveRow(id) {
    const patch = readRowPatch(id);
    if (!patch) return;
    const flag = document.getElementById(`saved-${id}`);
    flag.textContent = "جارٍ الحفظ…";
    try {
      const res = await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, patch }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); flag.textContent = "⚠️ " + (d.error || "فشل"); return; }
      Object.assign(overrides.products, { [id]: { ...(overrides.products[id] || {}), ...patch } });
      applyOverrides();
      flag.textContent = "✅ حُفظ";
      refreshLiveViews(id);
    } catch (e) {
      flag.textContent = "⚠️ تعذّر الحفظ";
    }
  }

  async function resetRow(id) {
    if (!confirm("استرجاع القيم الأصلية لهذا المنتج؟ سيُلغى كل تعديل مخزَّن.")) return;
    try {
      await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, reset: true }) });
      delete overrides.products[id];
      toast?.("↩️ رجعنا للقيم الأصلية — أعد تحميل الصفحة لرؤية الأصل كاملاً");
    } catch (_) { toast?.("⚠️ تعذّر الاسترجاع"); }
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

  /* ---------------- تبويب الرئيسية ---------------- */
  function renderHomepageTab(body) {
    const featured = PRODUCTS.filter((p) => p.badge === "الأكثر طلباً");
    body.innerHTML = `
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:10px">
        المنتجات المميّزة تظهر في قسم "الأكثر طلباً" بالصفحة الرئيسية. فعّلها من تبويب المنتجات (خانة "مميّز").
      </p>
      <ul class="owner-list-mini">
        ${featured.length ? featured.map((p) => `<li>${p.name} <span>${p.brand}</span></li>`).join("") : `<li style="justify-content:center;color:var(--muted)">لا منتجات مميّزة حالياً</li>`}
      </ul>`;
  }

  /* ---------------- تبويب الصور ---------------- */
  function renderMediaTab(body) {
    body.innerHTML = `
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:10px">استبدل رابط أي صورة منتج — يظهر فوراً.</p>
      ${PRODUCTS.map((p) => `
        <div class="owner-row" data-row-media="${p.id}">
          <span class="or-thumb">${thumbHtml(p)}</span>
          <div class="or-body">
            <b>${p.name}</b>
            <div class="or-fields">
              <input type="text" data-f="img" style="grid-column:1/-1" value="${p.img || ""}" placeholder="images/xxx.webp أو رابط كامل" />
              <div class="or-actions">
                <button class="or-save" onclick="Owner.saveImg('${p.id}')">💾 حفظ الصورة</button>
                <span class="or-saved-flag" id="saved-img-${p.id}"></span>
              </div>
            </div>
          </div>
        </div>`).join("")}`;
  }

  async function saveImg(id) {
    const row = document.querySelector(`[data-row-media="${id}"]`);
    const img = row.querySelector('[data-f="img"]').value;
    const flag = document.getElementById(`saved-img-${id}`);
    flag.textContent = "جارٍ الحفظ…";
    try {
      const res = await authedFetch("/owner-overrides", { method: "POST", body: JSON.stringify({ kind: "product", id, patch: { img } }) });
      if (!res.ok) { flag.textContent = "⚠️ فشل"; return; }
      overrides.products[id] = { ...(overrides.products[id] || {}), img };
      applyOverrides();
      flag.textContent = "✅ حُفظت";
      refreshLiveViews(id);
    } catch (_) { flag.textContent = "⚠️ تعذّر الحفظ"; }
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

  /* ---------------- تعديل منتج مفرد (من زر ✏️ على البطاقة) ---------------- */
  function editProduct(id) {
    if (!hasSession()) { openPinModal(); return; }
    dashTab = "products";
    ensureDash();
    document.getElementById("owner-dash-title").textContent = "تعديل منتج";
    const p = byId(id);
    document.getElementById("owner-dash-body").innerHTML = p ? fieldRow(p) : "<p>المنتج غير موجود</p>";
    document.getElementById("owner-dash").classList.add("open");
  }

  /* ---------------- تفعيل تلقائي إن كانت الجلسة قائمة (بعد تنقّل بين الصفحات) ---------------- */
  function autoResume() {
    if (hasSession()) enable();
  }

  return {
    ready, isTrigger, openPinModal, closePinModal, submitPin,
    openDash, closeDash, saveRow, resetRow, saveImg, saveSettings,
    editProduct, exitVisual, lock, logout, autoResume,
  };
})();
