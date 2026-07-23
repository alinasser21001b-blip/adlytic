/* ============================================================
   CarePlus Pharmacy — shared app logic
   WhatsApp order engine, rendering, recommendations, favorites
   ============================================================ */

const fmtPrice = (p) =>
  `${p.toLocaleString("en-US")} ${STORE_CONFIG.currency}`;

const byId = (id) => PRODUCTS.find((p) => p.id === id);

const productUrl = (id) => {
  const base = location.href.split("/").slice(0, -1).join("/");
  return `${base}/product.html?id=${encodeURIComponent(id)}`;
};

/* ---------- WhatsApp order engine ---------- */
function waOrderLink(product, pageUrl) {
  const url = pageUrl || productUrl(product.id);
  const msg = [
    "Hello, I would like to order:",
    "",
    `Product: ${product.name}`,
    `Product Link: ${url}`,
    "",
    "Please let me know the availability.",
  ].join("\n");
  return `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

function waGeneralLink() {
  const msg = `Hello ${STORE_CONFIG.name}, I have a question about your products.`;
  return `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

/* ---------- Favorites (localStorage, future-ready) ---------- */
const FAV_KEY = "careplus_favs";
const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
function toggleFav(id) {
  const favs = getFavs();
  const i = favs.indexOf(id);
  i === -1 ? favs.push(id) : favs.splice(i, 1);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => {
    b.textContent = favs.includes(id) ? "❤️" : "🤍";
  });
  toast(favs.includes(id) ? "Saved to favorites" : "Removed from favorites");
}

/* ---------- Recently viewed ("Customers also viewed" fuel) ---------- */
const VIEW_KEY = "careplus_viewed";
const getViewed = () => JSON.parse(localStorage.getItem(VIEW_KEY) || "[]");
function trackView(id) {
  const v = getViewed().filter((x) => x !== id);
  v.unshift(id);
  localStorage.setItem(VIEW_KEY, JSON.stringify(v.slice(0, 12)));
}

/* ---------- Rendering ---------- */
function starHtml(rating, count) {
  const full = "★".repeat(Math.round(rating));
  const empty = "☆".repeat(5 - Math.round(rating));
  return `<span class="stars">${full}${empty} ${rating} <span class="count">(${count})</span></span>`;
}

function productCard(p) {
  const fav = getFavs().includes(p.id) ? "❤️" : "🤍";
  return `
  <article class="card">
    ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
    <button class="fav-btn" data-fav="${p.id}" onclick="toggleFav('${p.id}')" aria-label="Save to favorites">${fav}</button>
    <a href="product.html?id=${p.id}"><div class="thumb">${p.images[0]}</div></a>
    <div class="body">
      <span class="cat">${p.category}</span>
      <a href="product.html?id=${p.id}"><h3>${p.name}</h3></a>
      ${starHtml(p.rating, p.reviewCount)}
      <span class="price">${fmtPrice(p.price)}</span>
      <a class="wa-order" href="${waOrderLink(p)}" target="_blank" rel="noopener">💬 Order via WhatsApp</a>
    </div>
  </article>`;
}

function renderRail(elId, products) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!products.length) {
    el.closest(".section")?.remove();
    return;
  }
  el.innerHTML = products.map(productCard).join("");
}

/* ---------- Toast + share ---------- */
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

async function shareProduct(p) {
  const url = productUrl(p.id);
  const data = { title: p.name, text: p.summary, url };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (_) {}
  }
  await navigator.clipboard.writeText(url);
  toast("Link copied to clipboard");
}
